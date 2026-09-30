/**
 * 98_Backup.gs — สำรองฐานข้อมูล Supabase ลง Drive และกู้กลับ (SPEC 22.6)
 *
 * **แผนฟรีของ Supabase ไม่มีการสำรองข้อมูลอัตโนมัติ** วันที่ใบงานจริงใบแรกเข้าระบบ
 * เราจะมีข้อมูลที่ไม่มีสำเนาอยู่ที่ไหนเลย · ไฟล์นี้คือสำเนานั้น
 *
 * **หลักข้อเดียวที่สำคัญที่สุดของไฟล์นี้**
 *   สำเนาที่ไม่เคยถูกกู้กลับ ไม่ใช่สำเนา มันคือความสบายใจที่ยังพิสูจน์ไม่ได้
 *
 * งานจึงมีสองครึ่งเท่า ๆ กัน คือ `backupAllTables()` ที่เขียนออกมา กับ
 * `restoreTableFromBackup()` ที่อ่านกลับเข้าไปได้จริง · และชุดทดสอบพิสูจน์ครึ่งหลัง
 * ด้วยการ **ลบข้อมูลจริงทิ้งแล้วกู้กลับ** แล้วเทียบทีละแถวทีละฟิลด์ ไม่ใช่แค่ดูว่าโค้ดรันผ่าน
 *
 * สามเรื่องที่ตัดสินรูปแบบของไฟล์สำรอง และเป็นเหตุผลของโค้ดส่วนใหญ่ในนี้
 *
 *   1. **หนึ่งไฟล์ต่อหนึ่งตาราง ไม่ใช่ไฟล์เดียวรวมกัน** เพราะเพดานเวลา 6 นาทีของ
 *      Apps Script และเพราะเวลากู้จริงคนจะกู้ทีละตาราง ไม่ใช่ทั้งฐานข้อมูลรวดเดียว
 *
 *   2. **JSON ไม่ใช่ CSV** เพราะ CSV แยก "ช่องว่าง" กับ "NULL" ไม่ออก · ความต่างนี้
 *      ไม่ใช่เรื่องทฤษฎี — กฎข้อ 25 ทั้งข้อสร้างขึ้นมาเพราะความต่างนี้มีผลจริง
 *      และเราเพิ่งเจอมาแล้วตอนย้าย `Locked_Until` ที่ค่าว่างกับ NULL ให้ผลคนละอย่าง
 *
 *   3. **อ่านค่าดิบ ไม่ผ่าน `fromDb_`** ด้วยเหตุผลเดียวกับข้อ 2 · ตัวแปลงของระบบ
 *      เปลี่ยน NULL เป็นข้อความว่างตั้งแต่ก่อนถึงไฟล์ ถ้าสำรองผ่านมัน การเลือก JSON
 *      ก็ไม่มีความหมายเลย · นี่คือที่เดียวในระบบที่เรียก `db_select_` โหมดดิบ
 *
 * ไฟล์นี้เป็นที่เดียวที่เรียก `ScriptApp` ได้ ตามกฎข้อ 26 · และไม่เรียก `DriveApp`
 * เองเลยสักบรรทัด ทุกอย่างผ่านตัวห่อใน 06_Files.gs ซึ่งเป็นชั้นที่รู้จัก Drive
 */

/** เก็บไฟล์สำรองย้อนหลังกี่สัปดาห์ — เกินกว่านี้ลบทิ้ง */
var BACKUP_KEEP_WEEKS = 8;

/** ชื่อฟังก์ชันที่ Trigger เรียก — ต้องตรงกับชื่อจริงเป๊ะ ไม่งั้น Trigger จะล้มทุกสัปดาห์เงียบ ๆ */
var BACKUP_TRIGGER_FUNCTION = 'backupAllTables';

/** ชั่วโมงของคืนวันอาทิตย์ตามเวลาไทยที่ให้ Trigger ทำงาน */
var BACKUP_TRIGGER_HOUR = 23;

/**
 * เตือนเมื่อไม่มีการสำรองสำเร็จนานเกินกี่วัน
 *
 * ตั้งไว้ 10 วัน ทั้งที่สำรองทุก 7 วัน เพราะต้องเผื่อให้รอบที่ล้มหนึ่งครั้งได้แก้ตัว
 * ในสัปดาห์ถัดไปก่อน · ถ้าตั้งไว้ 7 วันพอดี ทุกครั้งที่ Trigger ช้าไปสองชั่วโมง
 * จะขึ้นคำเตือน แล้วคำเตือนที่ขึ้นบ่อยจนเป็นเรื่องปกติ จะไม่มีใครอ่านอีกเลย
 */
var BACKUP_STALE_DAYS = 10;

/**
 * ลำดับการกู้คืนที่เคารพการอ้างอิงระหว่างตาราง (foreign key)
 *
 * **ตารางลูกต้องมาหลังตารางแม่เสมอ** · ถ้ากู้ `Department_Task` ก่อน `WorkOrder`
 * ฐานข้อมูลจะปฏิเสธทุกแถวเพราะใบงานที่มันชี้ไปยังไม่มีอยู่ — และจะปฏิเสธ **ทั้งชุด**
 * ไม่ใช่ทีละแถว ทำให้การกู้ที่ดูเหมือนแค่ "ล้มกลางคัน" กลายเป็น "ไม่ได้อะไรเลย"
 *
 * ตารางที่ไม่อยู่ในรายการนี้ไม่มีการอ้างอิงถึงใคร จึงกู้เมื่อไรก็ได้
 * รายการนี้คัดมาจาก `references ... on delete cascade` ใน supabase_schema.sql
 * และมีเทสต์ที่อ่าน DDL จริงมาเทียบ เพื่อไม่ให้รายการนี้ค้างอยู่เมื่อ schema เปลี่ยน
 */
var BACKUP_RESTORE_ORDER = Object.freeze(['WorkOrder', 'Department_Task', 'Task_Step']);

/**
 * เวลาที่ยอมให้ใช้ไปก่อนหยุดเอง (มิลลิวินาที)
 *
 * เพดานจริงของ Apps Script คือ 6 นาที · หยุดเองที่ 4 นาทีครึ่งเพื่อให้เหลือเวลา
 * เขียนรายงานและบันทึกลง System_Log ทัน · **การถูกตัดกลางคันไม่มีข้อความอะไรเลย**
 * ไม่มีบรรทัดใน log ไม่มีไฟล์ที่เขียนค้าง มีแต่ไฟล์ที่หายไปเฉย ๆ ซึ่งแยกไม่ออกจาก
 * "ไม่ได้รัน" · การหยุดเองจึงเป็นทางเดียวที่ทำให้วันนั้นมีหลักฐาน
 */
var BACKUP_TIME_BUDGET_MS = 270000;

/* ===========================================================================
 * 1. สำรองข้อมูล
 * =========================================================================== */

/**
 * สำรองทุกตารางลง Drive แล้วพิมพ์รายงานลง Execution log (SPEC 22.6)
 *
 * เรียกได้สองทาง — Trigger รายสัปดาห์เรียกเอง และผู้ดูแลกดรันเองจากตัวแก้ไข
 * ทั้งสองทางเดินโค้ดชุดเดียวกันทุกบรรทัด ไม่มีทางลัดสำหรับตัวใดตัวหนึ่ง
 * เพราะเส้นทางที่ไม่เคยถูกคนกดรันคือเส้นทางที่ไม่มีใครเคยเห็นผลของมัน
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function backupAllTables() {
  assertDataAccessAllowed_();

  var started = new Date();
  var lines = ['===== สำรองฐานข้อมูล Supabase ลง Drive (SPEC 22.6) ====='];

  if (!dbIsConfigured_()) {
    lines.push('  ยังไม่ได้ตั้งค่า Supabase — รัน checkSupabase ก่อน');
    Logger.log(lines.join(NEW_LINE_));
    return 'ยังตั้งค่าไม่ครบ';
  }

  var stamp = Utilities.formatDate(started, TIMEZONE, 'yyyy-MM-dd');
  var container = driveBackupContainer_();
  var folderId = driveSubFolder_(container, stamp);

  lines.push('  ชุดของวันที่ ' + stamp);
  lines.push('');
  lines.push('  ' + benchPad_('ตาราง', 20) + benchPad_('แถวในฐานข้อมูล', 16) +
    benchPad_('เขียนลงไฟล์', 14) + benchPad_('ขนาด(ไบต์)', 13) + 'ผล');

  var tableKeys = backupTableKeys_();
  var done = 0;
  var failed = [];
  var bytes = 0;
  var stoppedAt = '';
  var readMs = 0;
  var writeMs = 0;

  for (var i = 0; i < tableKeys.length; i++) {
    /*
     * ดูเวลาก่อนเริ่มตารางถัดไป ไม่ใช่หลัง · ตารางที่เริ่มแล้วต้องได้เขียนจนจบ
     * เพราะไฟล์ที่เขียนค้างครึ่งทางคือไฟล์ที่ดูเหมือนใช้ได้แต่กู้ไม่ได้
     */
    if (new Date().getTime() - started.getTime() > BACKUP_TIME_BUDGET_MS) {
      stoppedAt = tableKeys[i];
      break;
    }

    var one = backupOneTable_(folderId, tableKeys[i], started);
    lines.push('  ' + benchPad_(tableKeys[i], 20) + benchPad_(String(one.counted), 16) +
      benchPad_(String(one.written), 14) + benchPad_(String(one.size), 13) + one.note);

    readMs += (one.readMs || 0);
    writeMs += (one.writeMs || 0);
    if (one.ok) { done++; bytes += one.size; } else { failed.push(tableKeys[i]); }
  }

  /* ---------- สรุปและบันทึก ---------- */
  var seconds = Math.round((new Date().getTime() - started.getTime()) / 100) / 10;
  lines.push('');
  lines.push('  สำเร็จ ' + done + ' จาก ' + tableKeys.length + ' ตาราง · รวม ' +
    backupSizeText_(bytes) + ' · ใช้เวลา ' + seconds + ' วินาที');

  /*
   * แยกเวลาสองฝั่งให้เห็น เพราะมันโตคนละแบบและแก้คนละวิธี
   *
   * ฝั่งอ่านโตตามจำนวนหน้าที่ต้องขอจากฐานข้อมูล ฝั่งเขียนโตตามขนาดไฟล์ที่ส่งขึ้น Drive
   * ถ้ารายงานบอกแต่เวลารวม วันที่มันเริ่มนานขึ้นจะไม่มีใครรู้ว่าต้องไปแก้ตรงไหน
   * และจะเดากันไปเรื่อย ๆ ว่าเป็นเพราะฐานข้อมูลช้า ทั้งที่อาจเป็นเพราะไฟล์ใหญ่ขึ้น
   */
  lines.push('  แยกเวลา — อ่านจากฐานข้อมูล ' + Math.round(readMs / 100) / 10 +
    ' วินาที · เขียนลง Drive ' + Math.round(writeMs / 100) / 10 + ' วินาที · ' +
    'ส่วนที่เหลือเป็นการเปิดโฟลเดอร์และเก็บกวาด');

  if (stoppedAt) {
    lines.push('  !! หยุดเองก่อนชนเพดานเวลา 6 นาที ตั้งแต่ตาราง ' + stoppedAt);
    lines.push('     รัน backupAllTables() ซ้ำอีกครั้ง ตารางที่เสร็จแล้วจะถูกเขียนทับด้วยของใหม่');
    failed.push('(หยุดที่ ' + stoppedAt + ')');
  }

  backupPruneOld_(lines, container);
  backupRecordResult_(lines, stamp, done, tableKeys.length, failed, seconds);

  Logger.log(lines.join(NEW_LINE_));
  return failed.length ? ('สำรองไม่ครบ — ดู Execution log')
    : ('สำรองครบ ' + done + ' ตาราง (' + backupSizeText_(bytes) + ') — ดู Execution log');
}

/**
 * ตารางทั้งหมดที่ต้องสำรอง — ทุกตารางใน DB_COLUMNS
 *
 * อ่านจาก DB_COLUMNS ไม่ใช่เขียนรายชื่อไว้เอง · ตารางที่เพิ่มในอนาคตจะถูกสำรอง
 * ให้เองโดยไม่ต้องกลับมาแก้ที่นี่ · ตารางที่ลืมสำรองคือตารางที่ไม่มีสำเนาเลย
 * ซึ่งเป็นความผิดพลาดที่จะไม่มีใครรู้จนกว่าจะต้องกู้จริง
 *
 * @return {string[]} ชื่อตารางในระบบ
 */
function backupTableKeys_() {
  var out = [];
  for (var key in DB_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(DB_COLUMNS, key)) out.push(key);
  }
  return out;
}

/**
 * สำรองตารางเดียว พร้อมตรวจว่าครบจริงก่อนเก็บไฟล์ไว้
 *
 * **จำนวนแถวต้องเทียบกับสิ่งที่ฐานข้อมูลนับให้ ไม่ใช่กับสิ่งที่เราอ่านมาได้**
 * `db_count_` อ่านจาก header `Content-Range` ซึ่งเป็นคนละทางกับการนับแถวที่ดึงมา
 * ถ้านับจากของที่ดึงมาเอง เราจะได้ตัวเลขที่ตรงกับตัวเองเสมอ ต่อให้อ่านมาไม่ครบ
 * ซึ่งเป็นความผิดพลาดแบบเดียวกับที่เคยทำให้การล้างข้อมูลของชุดทดสอบตาบอด
 *
 * ไม่ครบเมื่อไรคือการสำรองที่ล้มเหลว · **ลบไฟล์ทิ้ง** ไม่เก็บไว้ เพราะไฟล์สำรองที่
 * ไม่ครบอันตรายกว่าไม่มีไฟล์เลย — มันทำให้คนเชื่อว่ามีสำเนาอยู่ แล้วเลิกมองหาที่อื่น
 *
 * @param {string} folderId โฟลเดอร์ของชุดวันนี้
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Date} at เวลาที่เริ่มสำรองทั้งชุด
 * @return {Object} {ok, counted, written, size, note}
 */
function backupOneTable_(folderId, tableKey, at) {
  var counted = -1;
  var rows;
  var readFrom = new Date().getTime();

  try {
    counted = db_count_(tableKey);
    rows = db_selectAll_(tableKey, { raw: true });
  } catch (e) {
    /*
     * ต้องใช้ข้อความของข้อผิดพลาดจริง ไม่ใช่ `db_lastFailure_()` เสมอไป
     *
     * ความล้มเหลวที่นี่มีสองแบบคนละที่มา · ฐานข้อมูลปฏิเสธ ซึ่ง db_lastFailure_ รู้เรื่อง
     * กับ **อ่านไม่จบภายในเพดานจำนวนหน้าของ `db_selectAll_`** ซึ่งเป็นการตัดสินใจ
     * ของฝั่งเรา ไม่ใช่คำตอบจากฐานข้อมูล · แบบหลังจะทำให้ db_lastFailure_ คืนเรื่อง
     * ของคำขอก่อนหน้าที่สำเร็จไปแล้ว แล้วรายงานจะชี้ไปผิดทางทั้งหมด
     *
     * และแบบหลังคือแบบที่จะมาถึงจริงก่อนเพื่อน — Audit_Log โตเร็วที่สุดในระบบ
     */
    return { ok: false, counted: counted, written: 0, size: 0,
      readMs: new Date().getTime() - readFrom, writeMs: 0,
      note: '!! อ่านไม่ได้: ' + String((e && e.message) || e).substring(0, 100) };
  }

  if (counted < 0) {
    return { ok: false, counted: counted, written: rows.length, size: 0,
      note: '!! ฐานข้อมูลไม่ยอมบอกจำนวนแถว จึงพิสูจน์ไม่ได้ว่าครบ' };
  }

  var readMs = new Date().getTime() - readFrom;

  var writeFrom = new Date().getTime();
  var text = JSON.stringify(backupFileBody_(tableKey, rows, at));
  var file = driveCreateTextFile_(folderId, backupFileName_(tableKey), text);
  var writeMs = new Date().getTime() - writeFrom;

  if (rows.length !== counted) {
    // ลบก่อนรายงาน เพื่อไม่ให้มีทางที่ไฟล์ไม่ครบค้างอยู่แม้แต่กรณีที่รายงานล้มเอง
    driveTrashById_(file.id, false);
    return { ok: false, counted: counted, written: rows.length, size: 0, readMs: readMs,
      writeMs: writeMs, note: '!! ไม่ครบ ลบไฟล์ทิ้งแล้ว (ขาด ' + (counted - rows.length) + ' แถว)' };
  }

  return { ok: true, counted: counted, written: rows.length, size: file.size,
    readMs: readMs, writeMs: writeMs, note: 'ครบ · อ่าน ' + readMs + ' + เขียน ' + writeMs + ' ms' };
}

/**
 * ชื่อไฟล์ของตารางหนึ่ง — ใช้ชื่อฝั่งฐานข้อมูลเพื่อให้ตรงกับที่เห็นใน SQL Editor
 * @param {string} tableKey ชื่อตารางในระบบ
 * @return {string}
 */
function backupFileName_(tableKey) {
  return dbColumnMap_(tableKey).table + '.json';
}

/**
 * เนื้อไฟล์สำรองหนึ่งไฟล์
 *
 * ส่วนหัวมีไว้ให้ **คนที่เปิดไฟล์นี้ในอีกหนึ่งปี** รู้ว่ากำลังดูอะไรอยู่ โดยไม่ต้อง
 * เดาจากชื่อไฟล์และไม่ต้องมีโค้ดของเราอยู่ตรงหน้า · ไฟล์สำรองที่อ่านเองไม่รู้เรื่อง
 * คือไฟล์ที่ต้องพึ่งระบบเดิมเพื่อจะเข้าใจ ซึ่งขัดกับเหตุผลที่สำรองไว้ตั้งแต่ต้น
 *
 * `schemaVersion` คือลายนิ้วมือของรายชื่อคอลัมน์ · ถ้าวันหนึ่งกู้แล้วมันไม่ตรงกับ
 * ของปัจจุบัน แปลว่าโครงสร้างตารางเปลี่ยนไปหลังจากวันที่สำรอง ซึ่งเป็นสิ่งที่ต้อง
 * รู้ก่อนเขียนทับข้อมูล ไม่ใช่รู้ตอนที่ฐานข้อมูลปฏิเสธ
 *
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object[]} rows แถวดิบตามที่ PostgREST ส่งมา
 * @param {Date} at เวลาที่สำรอง
 * @return {Object}
 */
function backupFileBody_(tableKey, rows, at) {
  var map = dbColumnMap_(tableKey);
  return {
    table: tableKey,
    dbTable: map.table,
    backedUpAt: Utilities.formatDate(at, TIMEZONE, 'yyyy-MM-dd HH:mm:ss') + ' (เวลาไทย)',
    backedUpAtIso: at.toISOString(),
    rowCount: rows.length,
    schemaVersion: backupSchemaVersion_(tableKey),
    columns: map.dbNames,
    rows: rows
  };
}

/**
 * ลายนิ้วมือของโครงสร้างตาราง — เปลี่ยนเมื่อรายชื่อหรือลำดับคอลัมน์เปลี่ยน
 *
 * คำนวณเองด้วยเลขคณิตธรรมดา ไม่เรียก Utilities.computeDigest เพราะไม่ต้องการ
 * ความปลอดภัยเชิงรหัสลับเลย · สิ่งที่ต้องการคือ "ต่างกันเมื่อของต่างกัน" ซึ่งพอแล้ว
 * และการไม่พึ่ง API ของแพลตฟอร์มทำให้ค่านี้คำนวณได้เหมือนกันทุกที่ (กฎข้อ 26)
 *
 * @param {string} tableKey ชื่อตารางในระบบ
 * @return {string} เช่น 'v12-8f3a1c'
 */
function backupSchemaVersion_(tableKey) {
  var names = dbColumnMap_(tableKey).dbNames;
  var text = names.join(',');
  var hash = 5381;

  for (var i = 0; i < text.length; i++) {
    hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;   // djb2 แบบ xor
  }
  return 'v' + names.length + '-' + hash.toString(16);
}

/**
 * ลบชุดสำรองที่เก่ากว่าที่ตกลงกันไว้
 *
 * ตัดสินจาก **ชื่อโฟลเดอร์** ซึ่งเป็นวันที่ที่เราตั้งเอง ไม่ใช่วันที่สร้างของ Drive
 * เพราะวันที่ของ Drive เปลี่ยนได้เมื่อมีคนย้ายหรือคัดลอกโฟลเดอร์ แล้วชุดที่ยังไม่ควร
 * ถูกลบจะหายไปโดยไม่มีใครสั่ง
 *
 * ใช้ถังขยะ ไม่ลบถาวร ตามกติกาเดียวกับไฟล์แนบ (กฎข้อ 8) · คนที่เผลอตั้งเพดานสั้นไป
 * ยังมี 30 วันให้กู้กลับ
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {string} containerId โฟลเดอร์ที่เก็บทุกชุด
 */
function backupPruneOld_(lines, containerId) {
  var cutoff = new Date(new Date().getTime() - BACKUP_KEEP_WEEKS * 7 * 86400000);
  var oldest = Utilities.formatDate(cutoff, TIMEZONE, 'yyyy-MM-dd');
  var folders = driveListFolders_(containerId);
  var removed = [];

  for (var i = 0; i < folders.length; i++) {
    // ชื่อที่ไม่ใช่รูปแบบวันที่ อาจเป็นของที่คนสร้างเองไว้ ห้ามแตะ
    if (!/^\d{4}-\d{2}-\d{2}$/.test(folders[i].name)) continue;
    if (folders[i].name >= oldest) continue;

    driveTrashById_(folders[i].id, true);
    removed.push(folders[i].name);
  }

  lines.push('  เก็บย้อนหลัง ' + BACKUP_KEEP_WEEKS + ' สัปดาห์ (ตั้งแต่ ' + oldest + ')' +
    (removed.length ? (' · ย้ายลงถังขยะ ' + removed.length + ' ชุด: ' + removed.join(', '))
                    : ' · ไม่มีชุดไหนเกินกำหนด'));
}

/**
 * บันทึกผลลง System_Log — บรรทัดที่ทำให้ checkBackup() ตอบได้ว่าสำรองล่าสุดเมื่อไร
 *
 * ต้องบันทึกทั้งตอนสำเร็จและตอนล้มเหลว · ถ้าบันทึกแต่ตอนล้มเหลว จะตอบคำถาม
 * "ครั้งล่าสุดที่สำเร็จคือเมื่อไร" ไม่ได้เลย ซึ่งเป็นคำถามแรกที่คนถามเสมอ
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {string} stamp วันที่ของชุดนี้
 * @param {number} done จำนวนตารางที่สำเร็จ
 * @param {number} total จำนวนตารางทั้งหมด
 * @param {string[]} failed ตารางที่ล้มเหลว
 * @param {number} seconds เวลาที่ใช้
 */
function backupRecordResult_(lines, stamp, done, total, failed, seconds) {
  var detail = 'ชุด ' + stamp + ' · สำเร็จ ' + done + '/' + total + ' ตาราง · ' +
    seconds + ' วินาที' + (failed.length ? (' · ล้มเหลว: ' + failed.join(', ')) : '');

  logSystemEvent_(failed.length ? ACTION.BACKUP_FAILED : ACTION.BACKUP_OK, detail);
  lines.push('  บันทึกลง System_Log แล้ว: ' + (failed.length ? 'BACKUP_FAILED' : 'BACKUP_OK'));
}

/**
 * ขนาดเป็นข้อความที่คนอ่านแล้วเข้าใจทันที
 * @param {number} bytes จำนวนไบต์
 * @return {string}
 */
function backupSizeText_(bytes) {
  if (bytes < 1024) return bytes + ' ไบต์';
  if (bytes < 1048576) return (Math.round(bytes / 102.4) / 10) + ' KB';
  return (Math.round(bytes / 104857.6) / 10) + ' MB';
}

/* ===========================================================================
 * 2. กู้คืน
 * =========================================================================== */

/**
 * กู้ข้อมูลของตารางหนึ่งกลับจากไฟล์สำรอง
 *
 * **ค่าตั้งต้นคือโหมดลองเปล่า ไม่เขียนอะไรจริงสักแถว** · การกู้คืนเป็นคำสั่งที่
 * ย้อนกลับไม่ได้และมักถูกสั่งตอนที่คนกำลังตกใจ · ค่าตั้งต้นจึงต้องเป็นตัวที่
 * ไม่ทำอันตราย แล้วให้คนอ่านรายงานก่อนว่าจะเกิดอะไรขึ้น
 *
 * ทำทีละตาราง ไม่ใช่ทั้งฐานข้อมูลรวดเดียว เพราะเวลากู้จริงคนรู้ว่าตารางไหนเสีย
 * และการเขียนทับตารางที่ยังดีอยู่คือการเปลี่ยนอุบัติเหตุเล็กให้เป็นอุบัติเหตุใหญ่
 *
 * @param {string} tableName ชื่อตารางในระบบ เช่น 'WorkOrder'
 * @param {string} fileId รหัสไฟล์สำรองบน Drive (ดูได้จาก checkBackup)
 * @param {Object} [options] {write: true} เท่านั้นที่ทำให้เขียนจริง
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function restoreTableFromBackup(tableName, fileId, options) {
  assertDataAccessAllowed_();

  var write = !!(options && options.write === true);
  var lines = ['===== กู้คืนตาราง ' + tableName + ' จากไฟล์สำรอง ====='];
  lines.push(write ? '  โหมด: **เขียนจริง**' : '  โหมด: ลองเปล่า ไม่เขียนอะไรทั้งสิ้น');

  /*
   * ไฟล์ที่ผิดหรือไม่ครบต้อง **โยนออกไป** ไม่ใช่คืนข้อความแล้วจบเงียบ ๆ
   *
   * ผลลัพธ์อื่นของฟังก์ชันนี้เป็นรายงานให้คนอ่าน — ลองเปล่าสำเร็จ หรือต้องกู้ตารางแม่ก่อน
   * ทั้งคู่คือ "สถานการณ์ปกติที่ต้องอธิบาย" · แต่ไฟล์ที่ไม่ครบคือความผิดพลาด
   * และความผิดพลาดที่คืนค่ากลับมาเป็นข้อความธรรมดา จะถูกมองข้ามโดยทุกคนที่เรียกมัน
   * รวมทั้งตัวเราเองในวันที่กำลังรีบกู้ข้อมูล
   */
  var plan = restorePlan_(tableName, fileId);

  restoreDescribePlan_(lines, plan);

  /* ---------- ลำดับการอ้างอิง ต้องบอกล่วงหน้า ไม่ใช่ปล่อยให้ล้มกลางคัน ---------- */
  var mustComeFirst = restoreTablesNeededFirst_(tableName, plan.missingParents);
  if (mustComeFirst.length) {
    lines.push('');
    lines.push('  !! ต้องกู้ตารางเหล่านี้ให้เสร็จก่อน: ' + mustComeFirst.join(', '));
    lines.push('     เพราะแถวในไฟล์ชี้ไปยังแถวที่ยังไม่มีในฐานข้อมูล · ถ้าฝืนเขียน ' +
      'ฐานข้อมูลจะปฏิเสธทั้งชุด ไม่ใช่แค่แถวที่ชี้ผิด');
    Logger.log(lines.join(NEW_LINE_));
    return 'ต้องกู้ตารางแม่ก่อน — ดู Execution log';
  }

  if (!write) {
    lines.push('');
    lines.push('  นี่คือการลองเปล่า ยังไม่มีอะไรถูกเขียน');
    lines.push('  สั่งเขียนจริงด้วย: restoreTableFromBackup(\'' + tableName + '\', \'' +
      fileId + '\', {write: true})');
    Logger.log(lines.join(NEW_LINE_));
    return 'ลองเปล่าเสร็จ — ดู Execution log';
  }

  /* ---------- เขียนจริง ---------- */
  var written = 0;
  try {
    written = restoreWriteRows_(tableName, plan.rows);
  } catch (e) {
    lines.push('  !! เขียนไม่สำเร็จ: ' + (e && e.message));
    lines.push('     สาเหตุจริง: ' + db_lastFailure_().detail);
    logSystemEvent_(ACTION.BACKUP_FAILED, 'กู้คืน ' + tableName + ' ไม่สำเร็จ');
    Logger.log(lines.join(NEW_LINE_));
    return 'กู้ไม่สำเร็จ — ดู Execution log';
  }

  dbInvalidate_(tableName);
  clearRowCache_();
  clearMasterCache_();
  // การกู้คืนเขียนตารางโดยไม่ผ่านชั้น Repo จึงต้องแจ้งเองว่ามีการเขียนเกิดขึ้น
  noteRepoWrite_(tableName);

  lines.push('');
  lines.push('  เขียนกลับเข้าฐานข้อมูล ' + written + ' แถว');
  lines.push('  แถวที่มีในฐานข้อมูลแต่ไม่มีในไฟล์ ยังอยู่ครบตามเดิม ไม่ได้ถูกลบ');

  logSystemEvent_(ACTION.BACKUP_RESTORED,
    'กู้คืน ' + tableName + ' จากไฟล์สำรอง ' + plan.backedUpAt + ' · ' + written + ' แถว');

  Logger.log(lines.join(NEW_LINE_));
  return 'กู้คืน ' + tableName + ' แล้ว ' + written + ' แถว — ดู Execution log';
}

/**
 * อ่านไฟล์สำรองแล้วเทียบกับสภาพปัจจุบัน ได้แผนว่าจะเกิดอะไรขึ้นถ้าเขียนจริง
 *
 * @param {string} tableName ชื่อตารางในระบบ
 * @param {string} fileId รหัสไฟล์บน Drive
 * @return {Object} {rows, backedUpAt, adding, updating, onlyInDb, schemaChanged, missingParents}
 * @throws {Error} เมื่อไฟล์อ่านไม่ได้ หรือไม่ใช่ไฟล์ของตารางนี้
 */
function restorePlan_(tableName, fileId) {
  // ถามตัวแปลงชื่อคอลัมน์ ไม่ใช่ถาม DB_COLUMNS ตรง ๆ เพราะตารางของชุดทดสอบ
  // อยู่คนละรายการ และการกู้คืนต้องถูกพิสูจน์ด้วยตารางของชุดทดสอบเป็นหลัก
  dbColumnMap_(tableName);
  if (!fileId) throw new Error('ต้องระบุรหัสไฟล์สำรองด้วย · ดูรายชื่อไฟล์ได้จาก checkBackup()');

  var body;
  try {
    body = JSON.parse(driveReadTextFile_(fileId));
  } catch (e) {
    throw new Error('อ่านไฟล์สำรองไม่ได้หรือเนื้อไฟล์เสีย: ' + (e && e.message));
  }

  /*
   * ไฟล์ผิดตารางคืออุบัติเหตุที่เกิดง่ายที่สุด เพราะรหัสไฟล์เป็นตัวอักษรสุ่มที่ดูไม่ออก
   * และผลของการกู้ผิดตารางคือข้อมูลของตารางหนึ่งไปทับอีกตารางหนึ่ง
   */
  if (String(body.table || '') !== tableName) {
    throw new Error('ไฟล์นี้เป็นสำเนาของตาราง "' + String(body.table || '(ไม่ระบุ)') +
      '" ไม่ใช่ "' + tableName + '"');
  }

  var rows = body.rows || [];
  if (rows.length !== Number(body.rowCount)) {
    throw new Error('ไฟล์บอกว่ามี ' + body.rowCount + ' แถว แต่อ่านได้ ' + rows.length +
      ' แถว — ไฟล์ไม่ครบ ห้ามใช้กู้');
  }

  return restoreCompare_(tableName, body, rows);
}

/**
 * เทียบแถวในไฟล์กับแถวในฐานข้อมูลตอนนี้
 * @param {string} tableName ชื่อตารางในระบบ
 * @param {Object} body เนื้อไฟล์สำรอง
 * @param {Object[]} rows แถวในไฟล์
 * @return {Object} แผนการกู้
 */
function restoreCompare_(tableName, body, rows) {
  var map = dbColumnMap_(tableName);
  var keyColumn = map.dbNames[0];

  var inDb = {};
  var current = db_selectAll_(tableName, { raw: true });
  for (var i = 0; i < current.length; i++) inDb[String(current[i][keyColumn])] = true;

  var inFile = {};
  var adding = 0;
  for (var r = 0; r < rows.length; r++) {
    inFile[String(rows[r][keyColumn])] = true;
    if (!inDb[String(rows[r][keyColumn])]) adding++;
  }

  var onlyInDb = [];
  for (var k = 0; k < current.length; k++) {
    var key = String(current[k][keyColumn]);
    if (!inFile[key]) onlyInDb.push(key);
  }

  return {
    rows: rows,
    tableName: tableName,
    keyColumn: keyColumn,
    backedUpAt: String(body.backedUpAt || '(ไม่ระบุ)'),
    adding: adding,
    updating: rows.length - adding,
    onlyInDb: onlyInDb,
    schemaChanged: String(body.schemaVersion || '') !== backupSchemaVersion_(tableName),
    fileSchema: String(body.schemaVersion || '(ไม่ระบุ)'),
    missingParents: restoreMissingParents_(tableName, rows)
  };
}

/**
 * พิมพ์แผนออกมาให้คนอ่านก่อนตัดสินใจ
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} plan แผนจาก restorePlan_
 */
function restoreDescribePlan_(lines, plan) {
  lines.push('  ไฟล์สำรองเมื่อ: ' + plan.backedUpAt);
  lines.push('');
  lines.push('  จะเพิ่มแถวใหม่      : ' + plan.adding + ' แถว');
  lines.push('  จะเขียนทับแถวเดิม  : ' + plan.updating + ' แถว');
  lines.push('  มีในฐานข้อมูลแต่ไม่มีในไฟล์: ' + plan.onlyInDb.length + ' แถว' +
    (plan.onlyInDb.length ? (' — ' + restoreSomeKeys_(plan.onlyInDb)) : ''));

  if (plan.onlyInDb.length) {
    lines.push('     แถวเหล่านี้ **จะไม่ถูกลบ** · การกู้คืนเป็นการเติมและทับ ไม่ใช่การล้างแล้วใส่ใหม่');
    lines.push('     ถ้าต้องการให้ตารางเหมือนวันที่สำรองเป๊ะ ต้องลบแถวเหล่านี้เองหลังกู้เสร็จ');
  }

  if (plan.schemaChanged) {
    lines.push('');
    lines.push('  !! โครงสร้างตารางเปลี่ยนไปหลังวันที่สำรอง (ไฟล์ ' + plan.fileSchema +
      ' · ตอนนี้ ' + backupSchemaVersion_(plan.tableName) + ')');
    lines.push('     คอลัมน์ที่เพิ่มมาทีหลังจะได้ค่า DEFAULT ของฐานข้อมูล ' +
      'ส่วนคอลัมน์ที่ถูกลบไปแล้วจะทำให้ฐานข้อมูลปฏิเสธทั้งชุด · ดูให้แน่ก่อนเขียนจริง');
  }
}

/**
 * รหัสตัวอย่างไม่กี่ตัว — รายการยาวเต็ม ๆ ไม่ได้ช่วยให้ตัดสินใจได้ดีขึ้น
 * @param {string[]} keys รหัสทั้งหมด
 * @return {string}
 */
function restoreSomeKeys_(keys) {
  var few = keys.slice(0, 5).join(', ');
  return keys.length > 5 ? (few + ' และอีก ' + (keys.length - 5) + ' แถว') : few;
}

/**
 * แถวในไฟล์ชี้ไปยังตารางแม่ที่ยังไม่มีแถวนั้นอยู่หรือไม่
 *
 * ตรวจก่อนเขียน เพราะ PostgREST ปฏิเสธทั้งชุดเมื่อมีแถวใดแถวหนึ่งผิด foreign key
 * ผลคือคนกดกู้แล้วไม่ได้อะไรเลย พร้อมข้อความภาษาอังกฤษที่ไม่ได้บอกว่าต้องทำอะไรต่อ
 *
 * @param {string} tableName ชื่อตารางในระบบ
 * @param {Object[]} rows แถวในไฟล์
 * @return {string[]} ชื่อตารางแม่ที่ยังขาดแถวที่ถูกอ้างถึง
 */
function restoreMissingParents_(tableName, rows) {
  var links = BACKUP_PARENT_LINKS[tableName];
  if (!links || !rows.length) return [];

  var out = [];
  for (var i = 0; i < links.length; i++) {
    var parentKeys = {};
    var parentRows = db_selectAll_(links[i].parent, { raw: true });
    var parentKey = dbColumnMap_(links[i].parent).dbNames[0];
    for (var p = 0; p < parentRows.length; p++) parentKeys[String(parentRows[p][parentKey])] = true;

    for (var r = 0; r < rows.length; r++) {
      var value = rows[r][links[i].column];
      if (value === null || value === undefined || value === '') continue;
      if (!parentKeys[String(value)]) { out.push(links[i].parent); break; }
    }
  }
  return out;
}

/**
 * ตารางที่ต้องกู้ก่อนตารางนี้ — เรียงตามลำดับที่ประกาศไว้
 * @param {string} tableName ชื่อตารางในระบบ
 * @param {string[]} missingParents ตารางแม่ที่ยังขาดแถว
 * @return {string[]}
 */
function restoreTablesNeededFirst_(tableName, missingParents) {
  var out = [];
  for (var i = 0; i < BACKUP_RESTORE_ORDER.length; i++) {
    var name = BACKUP_RESTORE_ORDER[i];
    if (name === tableName) break;
    if (missingParents.indexOf(name) !== -1) out.push(name);
  }
  return out;
}

/**
 * เขียนแถวกลับเข้าฐานข้อมูลทีละชุด
 *
 * แบ่งชุดเพราะคำขอเดียวที่มีหมื่นแถวจะใหญ่เกินกว่าที่ฝั่งไหนจะรับไหว และเมื่อมันล้ม
 * เราจะไม่รู้ว่าล้มที่แถวไหน · ชุดละ 500 ทำให้ข้อความผิดพลาดชี้ไปยังช่วงที่แคบพอจะดูได้
 *
 * @param {string} tableName ชื่อตารางในระบบ
 * @param {Object[]} rows แถวดิบจากไฟล์
 * @return {number} จำนวนแถวที่ฐานข้อมูลรับไว้
 */
function restoreWriteRows_(tableName, rows) {
  var written = 0;
  for (var at = 0; at < rows.length; at += BACKUP_RESTORE_CHUNK) {
    written += db_upsertRaw_(tableName, rows.slice(at, at + BACKUP_RESTORE_CHUNK));
  }
  return written;
}

/** จำนวนแถวต่อหนึ่งคำขอตอนกู้คืน */
var BACKUP_RESTORE_CHUNK = 500;

/**
 * การอ้างอิงไปยังตารางแม่ของแต่ละตาราง (foreign key)
 *
 * คัดมาจาก `references` ใน supabase_schema.sql ซึ่งมีอยู่สองเส้นเท่านั้น
 * ชื่อคอลัมน์เขียนเป็นชื่อฝั่งฐานข้อมูล เพราะใช้กับแถวดิบที่อ่านจากไฟล์สำรอง
 * มีเทสต์ที่อ่าน DDL จริงมาเทียบ เพื่อไม่ให้รายการนี้ค้างอยู่เมื่อ schema เปลี่ยน
 */
var BACKUP_PARENT_LINKS = Object.freeze({
  'Department_Task': [{ column: 'wo_id',   parent: 'WorkOrder' }],
  'Task_Step':       [{ column: 'task_id', parent: 'Department_Task' }]
});

/* ===========================================================================
 * 3. ตั้งเวลาอัตโนมัติ
 * =========================================================================== */

/**
 * ตั้ง Trigger ให้สำรองข้อมูลทุกคืนวันอาทิตย์ — กดรันครั้งเดียวจากตัวแก้ไข
 *
 * ลบ Trigger เดิมของฟังก์ชันนี้ก่อนเสมอ · ถ้าไม่ลบ การกดรันซ้ำจะได้ Trigger
 * ซ้อนกันหลายตัว แล้วการสำรองจะทำงานพร้อมกันหลายรอบในคืนเดียว เขียนทับกันเอง
 * และกินโควตาไปเปล่า ๆ โดยไม่มีอะไรบอกว่าเกิดอะไรขึ้น
 *
 * @return {string} ข้อความสรุปสำหรับอ่านใน Execution log
 */
function setupBackupTrigger() {
  assertDataAccessAllowed_();

  var removed = removeBackupTriggers_();

  ScriptApp.newTrigger(BACKUP_TRIGGER_FUNCTION)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(BACKUP_TRIGGER_HOUR)
    .inTimezone(TIMEZONE)
    .create();

  var message = 'ตั้งให้สำรองข้อมูลทุกคืนวันอาทิตย์ เวลาประมาณ ' + BACKUP_TRIGGER_HOUR +
    ':00 น. ตามเวลาไทย' + (removed ? (' · ลบ Trigger เดิม ' + removed + ' ตัว') : '');
  Logger.log(message);
  return message;
}

/**
 * ลบ Trigger สำรองข้อมูลทั้งหมด — ทางถอยเมื่อไม่ต้องการให้ทำงานอัตโนมัติแล้ว
 * @return {string} ข้อความสรุป
 */
function removeBackupTrigger() {
  assertDataAccessAllowed_();

  var removed = removeBackupTriggers_();
  var message = removed ? ('ลบ Trigger สำรองข้อมูลแล้ว ' + removed + ' ตัว — ' +
    'จากนี้ต้องกด backupAllTables() เองทุกครั้ง')
    : 'ไม่มี Trigger สำรองข้อมูลให้ลบ';
  Logger.log(message);
  return message;
}

/**
 * ลบ Trigger ของฟังก์ชันสำรองข้อมูลทุกตัว
 * @return {number} จำนวนที่ลบ
 */
function removeBackupTriggers_() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;

  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() !== BACKUP_TRIGGER_FUNCTION) continue;
    ScriptApp.deleteTrigger(triggers[i]);
    removed++;
  }
  return removed;
}

/**
 * มี Trigger สำรองข้อมูลตั้งไว้อยู่กี่ตัว — ใช้ในรายงานของ checkBackup()
 * @return {number} -1 เมื่ออ่านไม่ได้
 */
function backupTriggerCount_() {
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var count = 0;
    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === BACKUP_TRIGGER_FUNCTION) count++;
    }
    return count;
  } catch (e) {
    return -1;
  }
}

/* ===========================================================================
 * 4. เครื่องมือตรวจ
 * =========================================================================== */

/**
 * รายงานสภาพการสำรองข้อมูล — กดรันเองได้ และ checkSupabase() เรียกให้ทุกครั้ง
 *
 * คำถามที่รายงานนี้ต้องตอบได้โดยไม่ต้องไปเปิด Drive ดูเอง
 *   สำรองสำเร็จครั้งล่าสุดเมื่อไร และห่างจากวันนี้กี่วัน
 *   มีกี่ชุด แต่ละชุดกี่ตาราง ขนาดรวมเท่าไร
 *   ชุดล่าสุดมีตารางครบทุกตารางไหม
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function checkBackup() {
  assertDataAccessAllowed_();

  var lines = ['===== สภาพการสำรองข้อมูล (SPEC 22.6) ====='];
  checkBackupReport_(lines);
  Logger.log(lines.join(NEW_LINE_));
  return 'ตรวจเสร็จแล้ว — ดูผลใน Execution log';
}

/**
 * เนื้อของรายงาน — แยกออกมาเพื่อให้ checkSupabase() ใช้ร่วมได้
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 */
function checkBackupReport_(lines) {
  var container;
  try {
    container = driveBackupContainer_();
  } catch (e) {
    lines.push('เปิดโฟลเดอร์สำรองไม่ได้: ' + userFacingMessage_(e));
    lines.push('ถ้ายังไม่เคยสำรองเลย ให้รัน backupAllTables() หนึ่งครั้ง');
    return;
  }

  var sets = driveListFolders_(container);
  var dated = [];
  for (var i = 0; i < sets.length; i++) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(sets[i].name)) dated.push(sets[i]);
  }

  var triggers = backupTriggerCount_();
  lines.push('Trigger อัตโนมัติ   : ' + (triggers < 0 ? 'อ่านไม่ได้'
    : (triggers === 0 ? '**ยังไม่ได้ตั้ง** — รัน setupBackupTrigger() หนึ่งครั้ง'
      : (triggers + ' ตัว · ทุกคืนวันอาทิตย์'))));

  if (!dated.length) {
    lines.push('');
    lines.push('################################################');
    lines.push('##  ยังไม่เคยสำรองข้อมูลเลยสักครั้ง            ##');
    lines.push('##  ข้อมูลทั้งหมดตอนนี้มีสำเนาอยู่ที่เดียว      ##');
    lines.push('##  รัน backupAllTables() เดี๋ยวนี้            ##');
    lines.push('################################################');
    return;
  }

  /* ---------- ชุดล่าสุด ---------- */
  var latest = dated[0];
  var files = driveFolderFiles_(latest.id);
  var total = backupTotalSize_(dated);
  var ageDays = backupAgeInDays_(latest.name);

  lines.push('สำรองล่าสุด        : ' + latest.name + ' (' + ageDays + ' วันที่แล้ว)');
  lines.push('จำนวนชุดที่เก็บไว้  : ' + dated.length + ' ชุด · รวม ' + backupSizeText_(total.bytes) +
    ' · ' + total.files + ' ไฟล์');
  lines.push('ชุดล่าสุดมี        : ' + files.length + ' ตาราง');

  /* ---------- ครบทุกตารางไหม ---------- */
  var expected = backupTableKeys_();
  var have = {};
  for (var f = 0; f < files.length; f++) have[files[f].name] = files[f].size;

  var missing = [];
  for (var t = 0; t < expected.length; t++) {
    if (!Object.prototype.hasOwnProperty.call(have, backupFileName_(expected[t]))) {
      missing.push(expected[t]);
    }
  }

  lines.push('ครบทุกตารางไหม     : ' + (missing.length
    ? ('!! ขาด ' + missing.length + ' ตาราง — ' + missing.join(', '))
    : 'ครบทั้ง ' + expected.length + ' ตาราง'));

  /* ---------- รายชื่อไฟล์ของชุดล่าสุด พร้อมรหัสสำหรับกู้คืน ---------- */
  lines.push('');
  lines.push('ไฟล์ในชุดล่าสุด (รหัสไฟล์ใช้กับ restoreTableFromBackup)');
  for (var k = 0; k < files.length; k++) {
    lines.push('  ' + benchPad_(files[k].name, 24) + benchPad_(backupSizeText_(files[k].size), 12) +
      files[k].id);
  }

  /* ---------- คำเตือนตัวใหญ่เมื่อทิ้งช่วงนานเกินไป ---------- */
  if (ageDays > BACKUP_STALE_DAYS) {
    lines.push('');
    lines.push('##########################################################');
    lines.push('##  ไม่มีการสำรองข้อมูลสำเร็จมา ' + ageDays + ' วันแล้ว');
    lines.push('##  เกินกำหนด ' + BACKUP_STALE_DAYS + ' วัน · ข้อมูลที่เพิ่มมาหลังจากนั้น');
    lines.push('##  ยังไม่มีสำเนาอยู่ที่ไหนเลย');
    lines.push('##  ตรวจว่า Trigger ยังอยู่ แล้วรัน backupAllTables() ทันที');
    lines.push('##########################################################');
  }
}

/**
 * ขนาดและจำนวนไฟล์รวมของทุกชุด
 * @param {Object[]} sets โฟลเดอร์ของแต่ละชุด
 * @return {Object} {bytes, files}
 */
function backupTotalSize_(sets) {
  var bytes = 0;
  var files = 0;

  for (var i = 0; i < sets.length; i++) {
    var inSet = driveFolderFiles_(sets[i].id);
    for (var f = 0; f < inSet.length; f++) { bytes += inSet[f].size; files++; }
  }
  return { bytes: bytes, files: files };
}

/**
 * ชุดนี้เก่ากี่วันแล้ว นับตามเวลาไทย
 *
 * เทียบจากข้อความวันที่ทั้งสองฝั่ง ไม่ใช่จากตัวเลขเวลา เพราะการลบเวลาสองจุดแล้ว
 * หารด้วยหนึ่งวัน จะได้ผลเพี้ยนไปหนึ่งวันเสมอเมื่อชั่วโมงของสองฝั่งต่างกัน
 *
 * @param {string} name ชื่อโฟลเดอร์รูปแบบ yyyy-MM-dd
 * @return {number} จำนวนวัน
 */
function backupAgeInDays_(name) {
  var today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  var from = Date.UTC(Number(name.substring(0, 4)), Number(name.substring(5, 7)) - 1,
    Number(name.substring(8, 10)));
  var to = Date.UTC(Number(today.substring(0, 4)), Number(today.substring(5, 7)) - 1,
    Number(today.substring(8, 10)));
  return Math.round((to - from) / 86400000);
}

/**
 * ลองอ่านรายการทริกเกอร์ด้วยสิทธิ์ที่มีอยู่จริงตอนนี้ — ใช้โดย checkPermissions()
 *
 * อ่านอย่างเดียว ไม่สร้างและไม่ลบอะไร จึงกดรันซ้ำได้ไม่จำกัด · แต่ยังต้องใช้สิทธิ์
 * `script.scriptapp` ตัวเดียวกับที่การตั้งทริกเกอร์ต้องใช้ · ผลที่ได้จึงตรงกับของจริง
 *
 * **ต้องโยนออกมาเมื่อไม่มีสิทธิ์ ไม่ใช่คืนค่าว่าง** เพราะ checkPermissions() ตัดสิน
 * ว่าผ่านหรือไม่ผ่านจากการที่มันโยนหรือไม่โยน · ตัวตรวจที่ไม่มีวันไม่ผ่าน ไม่ได้ตรวจอะไรเลย
 *
 * @return {string} ข้อความสั้น ๆ บอกสิ่งที่อ่านได้
 */
function probeTriggerAccess_() {
  return 'อ่านรายการทริกเกอร์ได้ · ตั้งไว้ ' + ScriptApp.getProjectTriggers().length + ' ตัว';
}

/**
 * เติมช่องว่างให้คอลัมน์ในรายงานตรงกัน
 * @param {string} text ข้อความ
 * @param {number} width ความกว้าง
 * @return {string}
 */
function benchPad_(text, width) {
  var out = String(text);
  while (out.length < width) out += ' ';
  // ต้องมีช่องว่างอย่างน้อยหนึ่งตัวเสมอ ไม่งั้นข้อความที่ยาวเกินช่องจะติดกับคอลัมน์ถัดไป
  return (out.length === String(text).length) ? (out + ' ') : out;
}
