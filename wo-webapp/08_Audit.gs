/**
 * 08_Audit.gs — เขียนบันทึกทั้งสองตาราง (SPEC 13, D-9)
 *
 * มีสองตารางที่ตอบคนละคำถามและมีอายุการใช้งานคนละแบบ
 *   Audit_Log   "ใบงานนี้เกิดอะไรขึ้นบ้าง ใครทำ"   เก็บถาวร ห้ามลบ
 *   System_Log  "ระบบมีอะไรผิดปกติไหม"            ดูแล้วแก้แล้วลบทิ้งได้
 *
 * ทั้งสองตารางอยู่ในไฟล์เดียวกัน และมีทางเขียนทางเดียวกันคือ writeAuditRecords()
 * การตัดสินว่าบรรทัดไหนลงตารางไหนอยู่ที่ isSystemLogRecord_() ที่เดียวเท่านั้น
 * ห้ามให้จุดที่เรียกใช้ตัดสินเอง เพราะถ้ากระจาย วันหนึ่งจะมีจุดที่ตัดสินไม่เหมือนที่อื่น
 * แล้วบรรทัดนั้นจะไปอยู่ผิดตารางโดยไม่มีใครรู้ จนถึงวันที่ต้องไล่หามันแล้วหาไม่เจอ
 *
 * Audit_Log อยู่คนละไฟล์กับตารางหลัก เพราะโตประมาณ 1 ล้านเซลล์ต่อปี
 * ที่ปริมาณงาน 500 ใบต่อเดือน ถ้าอยู่ไฟล์เดียวกันจะชนเพดาน 10 ล้านเซลล์ (SPEC D-5, D-6)
 * ไฟล์ปลายทางกำหนดด้วย Script Property ชื่อ AUDIT_SHEET_ID
 *
 * ระบบเติม User, Role และ Timestamp ให้เองทุกครั้ง ผู้เรียกไม่ต้องส่งมา
 */

/**
 * เขียน 1 บรรทัดลง Audit_Log
 *
 * @param {string} entity ชนิดของสิ่งที่เปลี่ยน ค่าจาก ENTITY (WO หรือ TASK)
 * @param {string} id เลขที่ของสิ่งนั้น — WO_ID เมื่อ entity เป็น WO และ Task_ID เมื่อเป็น TASK
 * @param {string} action ค่าจาก ACTION
 * @param {string} field ชื่อคอลัมน์ที่เปลี่ยน เช่น Status
 * @param {*} fromValue ค่าเดิม
 * @param {*} toValue ค่าใหม่
 * @param {string} [remark] เหตุผลหรือหมายเหตุ
 * @param {Object} [refs] เลขที่อ้างอิงเพิ่มเติม {woId, taskId} — ใช้เมื่อบันทึก Task
 *                        เพื่อให้บรรทัดนั้นมี WO_ID ติดไปด้วย ค้นย้อนหลังได้ง่าย
 * @return {Object} แถวที่เขียนจริง
 */
function writeAudit(entity, id, action, field, fromValue, toValue, remark, refs) {
  refs = refs || {};
  var record = {
    WO_ID:      refs.woId || (entity === ENTITY.WO ? id : ''),
    Task_ID:    refs.taskId || (entity === ENTITY.TASK ? id : ''),
    Action:     action,
    Entity:     entity,
    Field:      field,
    From_Value: fromValue,
    To_Value:   toValue,
    Remark:     remark
  };
  return writeAuditRecord(record);
}

/**
 * เขียน Audit จาก object ที่ changeStatus() ประกอบไว้ให้แล้ว (ดู buildAuditRecord_ ใน 02_StateMachine.gs)
 * @param {Object} record แถว Audit ที่ยังไม่ได้เติม Log_ID / User / Role / Timestamp
 * @return {Object} แถวที่เขียนจริง
 */
function writeAuditRecord(record) {
  return writeAuditRecords([record])[0];
}

/** ลำดับภายในการรันหนึ่งครั้ง — ทำให้บรรทัดที่เกิดในมิลลิวินาทีเดียวกันยังเรียงถูก */
var LOG_SEQUENCE_ = 0;

/**
 * เลขที่ของบรรทัดบันทึก ที่เรียงตามลำดับเหตุการณ์ได้ด้วยตัวมันเอง
 *
 * **บนชีต ลำดับของแถวคือลำดับที่เหตุการณ์เกิดขึ้น** เพราะแถวใหม่ต่อท้ายเสมอ
 * บนฐานข้อมูลไม่มีลำดับโดยปริยาย เราต้องบอกทุกครั้งว่าจะเรียงด้วยอะไร และถ้าเรียง
 * ด้วย Timestamp อย่างเดียว บรรทัดที่เกิดในมิลลิวินาทีเดียวกันจะสลับกันเองได้ทุกครั้งที่อ่าน
 *
 * อาการที่เจอจริงตอนย้าย: การเปลี่ยนสถานะอัตโนมัติสองครั้งติดกัน (IN_PROGRESS
 * แล้ว COMPLETED) ถูกอ่านกลับมาสลับกัน ระบบจึงรายงานว่าสถานะล่าสุดของใบงาน
 * คือ IN_PROGRESS ทั้งที่งานปิดไปแล้ว · ไม่มีอะไรผิดพลาดให้เห็นเลย มีแต่คำตอบที่ผิด
 *
 * เลขที่จึงประกอบจากสามส่วนที่เรียงแบบข้อความแล้วได้ลำดับเดียวกับลำดับที่เกิดจริง
 *   เวลาเป็นมิลลิวินาที 13 หลัก · ลำดับภายในการรัน · UUID กันซ้ำข้ามผู้ใช้และข้ามเครื่อง
 *
 * ยังเป็นข้อความเหมือนเดิมและไม่มีที่ไหนแกะความหมายข้างในออกมาใช้ การเปลี่ยนรูปแบบนี้
 * จึงไม่กระทบใคร นอกจากทำให้การเรียงลำดับเป็นจริงโดยโครงสร้าง ไม่ใช่โดยบังเอิญ
 *
 * @return {string}
 */
function newLogId_() {
  LOG_SEQUENCE_++;
  var millis = ('0000000000000' + new Date().getTime()).slice(-13);
  var order = ('000000' + LOG_SEQUENCE_).slice(-6);
  return millis + '-' + order + '-' + newUuid_();
}

/**
 * เขียน Audit หลายบรรทัดพร้อมกันด้วยการเขียนครั้งเดียว (SPEC D-3)
 * ใช้เมื่อรายการเดียวเปลี่ยนหลายฟิลด์ เช่นอนุมัติแล้วเปลี่ยนทั้งสถานะและแผนกผู้รับงาน
 * @param {Object[]} records รายการแถว Audit
 * @return {Object[]} แถวที่เขียนจริง
 */
function writeAuditRecords(records) {
  if (!records || !records.length) return [];

  var user = currentUserEmail_();
  var role = currentUserRole_(user);
  var now = new Date();
  var rows = [];
  var auditRows = [];
  var systemRows = [];

  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    rows.push({
      Log_ID:     newLogId_(),
      WO_ID:      record.WO_ID || '',
      Task_ID:    record.Task_ID || '',
      // ระบุมาเองได้ ค่าว่างที่ตั้งใจใส่ต้องไม่ถูกแทนด้วยผู้เรียก
      // เหตุการณ์เข้าสู่ระบบต้องบันทึกว่า "คนที่พยายามเข้า" เป็นใคร ไม่ใช่คนที่รันสคริปต์
      User:       (record.User !== undefined) ? record.User : user,
      Role:       (record.Role !== undefined) ? record.Role : role,
      Action:     record.Action || '',
      Entity:     record.Entity || '',
      Field:      record.Field || '',
      From_Value: auditValue_(record.From_Value),
      To_Value:   auditValue_(record.To_Value),
      Remark:     record.Remark || '',
      Timestamp:  record.Timestamp || now
    });
  }

  /*
   * แยกตารางที่นี่ที่เดียว — แต่ละแถวไปได้ทางเดียวเสมอ ไม่มีทางลงทั้งสองที่
   * (test_log_neverBoth พิสูจน์ด้วยการนับแถวรวมของสองตารางเทียบกับจำนวนที่เขียน)
   */
  for (var r = 0; r < rows.length; r++) {
    if (isSystemLogRecord_(rows[r])) systemRows.push(systemRowOf_(rows[r]));
    else auditRows.push(rows[r]);
  }

  var written = [];
  if (auditRows.length) written = written.concat(appendRows_(SHEET.AUDIT_LOG, auditRows));
  if (systemRows.length) written = written.concat(appendRows_(SHEET.SYSTEM_LOG, systemRows));
  return written;
}

/**
 * บรรทัดนี้ลง System_Log หรือ Audit_Log — เงื่อนไขเดียวของทั้งระบบ (SPEC 13)
 *
 * ลง System_Log เมื่อเข้าข้อใดข้อหนึ่ง
 *   1. เป็นเหตุการณ์ของระบบตามรายการ SYSTEM_LOG_EVENT (แม้จะมีเลขที่ใบงานติดมา)
 *   2. ไม่ได้ผูกกับใบงานใบใดเลย
 *
 * ข้อ 2 ดูทั้ง WO_ID และ Task_ID เพราะบางจุดบันทึกเรื่องของ Task โดยไม่ได้ส่งเลขที่
 * ใบงานมาด้วย บรรทัดพวกนั้นเป็นสิ่งที่เกิดกับใบงานเต็มตัว ต้องอยู่ใน Audit_Log
 *
 * @param {Object} row แถวที่เติม User / Role / Timestamp แล้ว
 * @return {boolean}
 */
function isSystemLogRecord_(row) {
  if (SYSTEM_LOG_EVENT[String(row.Action || '')]) return true;
  return !row.WO_ID && !row.Task_ID;
}

/**
 * แปลงแถวแบบ Audit ให้เป็นแถวของ System_Log (7 คอลัมน์ตาม SPEC 13)
 * @param {Object} row แถวที่เติม User / Role / Timestamp แล้ว
 * @return {Object}
 */
function systemRowOf_(row) {
  var action = String(row.Action || '');
  var kind = SYSTEM_LOG_EVENT[action];
  var detail = systemLogDetailPrefix_(row.WO_ID, row.To_Value) + (row.Remark || '');

  if (!kind) {
    /*
     * เหตุการณ์ที่ยังไม่ได้ประกาศไว้ ต้องไม่หายไปเฉย ๆ และต้องหาเจอง่ายที่สุด
     * จึงบันทึกเป็น ERROR พร้อมบอกตรง ๆ ว่าขาดการประกาศ ชื่อเหตุการณ์ยังอยู่ในคอลัมน์
     * Event ครบถ้วน จึงไม่มีข้อมูลใดหายไป · test_log_everySystemEventDeclared
     * กันไม่ให้สภาพนี้หลุดขึ้นชีตจริงตั้งแต่แรก
     */
    kind = { source: LOG_SOURCE.PERMISSION, level: LOG_LEVEL.ERROR };
    detail = 'เหตุการณ์นี้ยังไม่ได้ประกาศใน SYSTEM_LOG_EVENT · ' + detail;
  }

  return {
    Log_ID:    row.Log_ID,
    Level:     kind.level,
    Source:    kind.source,
    Event:     action,
    User:      row.User || '',
    Detail:    detail,
    Timestamp: row.Timestamp
  };
}

/**
 * คำนำหน้าของคอลัมน์ Detail สำหรับบรรทัดที่อ้างถึงใบงาน
 *
 * System_Log มีแค่ 7 คอลัมน์ตาม SPEC 13 ไม่มีช่องเก็บเลขที่ใบงานของตัวเอง
 * เลขที่ใบงานจึงต้องอยู่ในข้อความ · ประกอบด้วยฟังก์ชันเดียวทั้งฝั่งเขียนและฝั่งอ่าน
 * (traceNotify ใช้ตัวนี้ค้นบรรทัดของใบนั้น) จะได้ไม่มีวันหลุดจากกัน
 *
 * @param {string} woId เลขที่ใบงาน (ว่างได้)
 * @param {string} event ชื่อเหตุการณ์ย่อย เช่นชื่อเหตุการณ์แจ้งเตือน (ว่างได้)
 * @return {string} ค่าว่างเมื่อไม่ได้อ้างถึงใบงานใด
 */
function systemLogDetailPrefix_(woId, event) {
  if (!woId) return '';
  var text = 'ใบงาน ' + woId + ' · ';
  return event ? (text + event + ' · ') : text;
}

/**
 * บันทึกเรื่องของระบบหนึ่งบรรทัด — ทางเข้าสำหรับเหตุการณ์ที่ไม่ผูกกับใบงาน
 *
 * เขียนผ่านตัวเขียนกลางตัวเดิมเสมอ ไม่ลัดไปเขียน System_Log ตรง ๆ
 * เพื่อให้มีทางเขียนทางเดียวและมีจุดตัดสินจุดเดียวจริง ๆ
 *
 * ห้ามโยนข้อผิดพลาดออกไปเด็ดขาด — การบันทึกล้มเหลวต้องไม่ทำให้งานหลักล้มตาม
 * โดยเฉพาะเรื่องสิทธิ์ ซึ่งตอนนั้นไฟล์บันทึกเองก็อาจเปิดไม่ได้เหมือนกัน
 *
 * @param {string} action ค่าจาก ACTION ที่ประกาศไว้ใน SYSTEM_LOG_EVENT
 * @param {string} detail รายละเอียดสำหรับผู้ดูแลอ่านย้อนหลัง
 * @param {string} [user] เจ้าของเหตุการณ์ เมื่อไม่ใช่ผู้ที่กำลังทำรายการ
 */
function logSystemEvent_(action, detail, user) {
  try {
    var record = { Action: action, Entity: ENTITY.SYSTEM, Remark: detail };
    if (user !== undefined) record.User = user;
    writeAuditRecord(record);
  } catch (e) {
    Logger.log('เขียน System_Log ไม่สำเร็จ (' + action + '): ' +
      ((e && e.message) ? e.message : e));
  }
}

/**
 * บันทึกปัญหาเรื่องสิทธิ์ลง System_Log — ที่เดียวที่แยกว่าเป็นสิทธิ์แบบไหน
 *
 * เรียกจากขอบของระบบเท่านั้น (apiRun_ และ doGet) เพราะข้อผิดพลาดหนึ่งครั้ง
 * ผ่านขอบเพียงขอบเดียว ถ้าไปดักกลางทางจะได้หลายบรรทัดต่อหนึ่งเหตุการณ์
 *
 * @param {Error|string} error ข้อผิดพลาดที่จับได้
 * @return {boolean} true = เป็นเรื่องสิทธิ์ และบันทึกไปแล้ว
 */
function logPermissionProblem_(error) {
  // ลำดับเดียวกับ userFacingMessage_ เสมอ — เรื่อง "ยังไม่ได้รับอนุญาต" ต้องมาก่อน
  if (isAuthorizationError_(error)) {
    var scope = missingScopeOf_(error);
    logSystemEvent_(ACTION.AUTH_REQUIRED,
      'สคริปต์ยังไม่ได้รับอนุญาตให้ใช้บริการของ Google ที่ขั้นตอนนั้นต้องใช้' +
      (scope ? (' · สิทธิ์ที่ขาดคือ ' + scope) : ''));
    return true;
  }
  if (isAccessDeniedError_(error)) {
    logSystemEvent_(ACTION.ACCESS_DENIED, 'เข้าถึงฐานข้อมูลหรือ Drive ไม่ได้');
    return true;
  }
  return false;
}

/**
 * แปลงค่าให้เก็บลง Audit ได้ในรูปข้อความที่อ่านย้อนหลังรู้เรื่อง
 * @param {*} value ค่าที่จะบันทึก
 * @return {string}
 */
function auditValue_(value) {
  if (value === null || value === undefined) return '';
  // ผ่านจุดจัดรูปแบบเวลาจุดเดียวของระบบเสมอ (กฎข้อ 19) — ช่องนี้คนเปิดอ่านย้อนหลัง
  if (value instanceof Date) return formatForDisplay_(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * บทบาทของผู้ใช้ที่กำลังทำรายการ อ่านจากแท็บ User_Role แล้วแคชไว้ 5 นาที
 * เพื่อไม่ให้ทุกครั้งที่เขียน Audit ต้องอ่านตาราง User_Role ใหม่ (SPEC G)
 * @param {string} email อีเมลผู้ใช้
 * @return {string} '' เมื่อยังไม่มีรายชื่อผู้ใช้นี้ในตาราง
 */
function currentUserRole_(email) {
  if (!email) return '';

  var cacheKey = 'role:' + email;

  // อ่านแคชไม่ได้ก็อ่านของจริงแทน — cacheGet_ คืน null ให้เองเมื่อแคชมีปัญหา
  var cached = cacheGet_(cacheKey);
  if (cached !== null) return cached;

  var row = getUserRole(email);
  var role = row ? String(row.Role || '') : '';
  cachePut_(cacheKey, role, CACHE_TTL_SEC);
  return role;
}

/**
 * ลำดับการอ่านบันทึกประวัติ — เรียงตามเวลาจากเก่าไปใหม่
 *
 * ต้องระบุลำดับเสมอ ห้ามปล่อยให้ฐานข้อมูลเลือกเอง (กฎข้อ 28) · คีย์ของตารางนี้
 * เป็น UUID การเรียงด้วยคีย์จึงให้ลำดับที่ไม่เกี่ยวกับเวลาเลย และเส้นเวลาบนหน้าจอ
 * จะสลับมั่วโดยที่ไม่มีอะไรผิดพลาดให้เห็น
 *
 * Log_ID เป็นตัวตัดสินเมื่อเวลาเท่ากัน เพื่อให้ลำดับคงที่ทุกครั้งที่อ่าน ·
 * การกระทำหนึ่งครั้งเขียนหลายแถวด้วยเวลาเดียวกัน แต่ timelineOf_ ยุบแถวเหล่านั้น
 * เหลือบรรทัดเดียวอยู่แล้ว ลำดับภายในกลุ่มจึงไม่มีผลต่อสิ่งที่ผู้ใช้เห็น
 */
var AUDIT_READ_ORDER = Object.freeze([
  { column: 'Log_ID', ascending: true }
]);

/**
 * อ่านประวัติของใบงานใบหนึ่ง
 *
 * กรองที่ฐานข้อมูลด้วย WO_ID เสมอ ไม่ลากทั้งตารางมาคัดเอง · Audit_Log จะข้าม
 * หนึ่งพันแถวภายในเดือนแรกของการใช้งานจริง การอ่านทั้งตารางจึงไม่ใช่แค่ช้า
 * แต่จะเริ่มคืนข้อมูลไม่ครบโดยไม่แจ้งอะไรเลย (กฎข้อ 28)
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {Object[]} เรียงจากเก่าไปใหม่
 */
function listAuditByWo(woId) {
  return queryRows_(SHEET.AUDIT_LOG, { 'WO_ID': woId }, { order: AUDIT_READ_ORDER });
}

/**
 * อ่านประวัติของงานแผนกหนึ่ง
 * @param {string} taskId เลขที่งานของแผนก
 * @return {Object[]} เรียงจากเก่าไปใหม่
 */
function listAuditByTask(taskId) {
  return queryRows_(SHEET.AUDIT_LOG, { 'Task_ID': taskId }, { order: AUDIT_READ_ORDER });
}

/**
 * อ่านบรรทัดใน System_Log ที่พูดถึงใบงานใบหนึ่ง
 *
 * ต้องค้นจากข้อความ เพราะตารางนี้ไม่มีคอลัมน์ WO_ID ของตัวเอง (SPEC 13)
 * ใช้คำนำหน้าชุดเดียวกับตอนเขียน จึงไม่มีทางค้นด้วยรูปแบบที่ไม่ตรงกัน
 *
 * คำนำหน้าต้องผ่าน dbLikeLiteral_ ก่อน เพราะมันประกอบมาจากเลขที่ใบงาน
 * ซึ่งถ้าวันหนึ่งมีขีดล่างหรือเปอร์เซ็นต์อยู่ในรูปแบบเลขที่ มันจะกลายเป็นสัญลักษณ์
 * ของ LIKE แล้วกวาดบรรทัดของใบงานอื่นมาด้วย
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {Object[]} เรียงจากเก่าไปใหม่
 */
function listSystemLogByWo(woId) {
  var needle = systemLogDetailPrefix_(woId, '');
  if (!needle) return [];

  return queryRows_(SHEET.SYSTEM_LOG,
    { 'Detail': { op: 'like', value: dbLikeLiteral_(needle) + '*' } },
    { order: AUDIT_READ_ORDER });
}
