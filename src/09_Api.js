/**
 * 09_Api.gs — ฟังก์ชันที่หน้าเว็บเรียกผ่าน google.script.run
 *
 * ชั้นนี้มีหน้าที่ 3 อย่างเท่านั้น
 *   1. ระบุตัวตนผู้ใช้จาก Session แล้วเทียบกับตาราง User_Role (SPEC E)
 *   2. ตรวจสิทธิ์ก่อนทำงานทุกครั้ง — รวมถึง "สายอนุมัติ" ไม่ใช่แค่ Role (กฎข้อ 7)
 *   3. คืนผลเป็น {ok, data} หรือ {ok, message} เสมอ ไม่ปล่อย error ดิบออกไป
 *      เพราะ google.script.run จับ error ฝั่งหน้าเว็บได้ไม่ครบและข้อความมักไม่สื่อ
 *
 * ตรรกะธุรกิจทั้งหมดอยู่ใน 03_Service_WO.gs และ 05_Location.gs ไฟล์นี้เป็นเปลือกบาง ๆ
 */

/* ---------------------------------------------------------------------------
 * ตัวช่วยของชั้น API
 * --------------------------------------------------------------------------- */

/**
 * ห่อการทำงานให้คืนผลรูปแบบเดียวกันเสมอ และไม่ปล่อย error ดิบออกไปหาหน้าเว็บ
 * @param {function()} work งานที่ต้องทำ คืนค่าอะไรก็ได้
 * @return {Object} {ok: true, data} หรือ {ok: false, message}
 */
async function apiRun_(work) {
  try {
    // ผ่านตัวแปลงกลางเสมอ ทั้งขาสำเร็จและขาผิดพลาด (กฎข้อ 14 · SPEC 19)
    return jsonSafe_({ ok: true, data: work() });
  } catch (e) {
    // บันทึกข้อความดิบไว้ใน log ให้ผู้ดูแลไล่ปัญหาได้ แต่ส่งข้อความที่ผู้ใช้อ่านรู้เรื่องออกไปแทน
    var message = (e && e.message) ? e.message : String(e);
    Logger.log('[' + formatForDisplay_(new Date()) + '] API error: ' + message + (e && e.stack ? '\n' + e.stack : ''));
    // ปัญหาเรื่องสิทธิ์ต้องเหลือร่องรอยใน System_Log ด้วย — Logger หายไปเมื่อปิดหน้าต่าง
    await logPermissionProblem_(e);
    return jsonSafe_({ ok: false, message: userFacingMessage_(e) });
  }
}

/**
 * แปลงค่าให้ส่งผ่าน google.script.run ได้ (กฎข้อ 14 · SPEC 19)
 *
 * ช่องทางนี้รับส่งได้เฉพาะ ข้อความ ตัวเลข boolean null และ array/object ที่ประกอบจากค่าเหล่านี้
 * ถ้ามี Date ปนอยู่ในค่าที่คืนกลับ ฝั่งหน้าเว็บจะได้ undefined เงียบ ๆ โดยไม่มี error ให้เห็น
 * กลายเป็นอาการ "ระบบตอบกลับมาในรูปแบบที่ไม่รู้จัก" ซึ่งไล่หาสาเหตุยากมาก
 *
 * ต้องแปลงที่ขอบของชั้น API ที่เดียว ห้ามแปลงทีละฟังก์ชัน เพราะจะลืมตัวใดตัวหนึ่งเสมอ
 *
 * เวลามีสองแบบที่ต้องแยกให้ออก (กฎข้อ 18 · SPEC 19)
 *   - เวลาที่เครื่องบันทึก (Created_Date, Updated_Date, ...) ส่งเป็น ISO เต็มรูปแบบ
 *   - เวลานัดหมายที่คนกรอก (Start_Date, End_Date) ส่งเป็นข้อความเวลาท้องถิ่น YYYY-MM-DDTHH:mm
 *     เพราะถ้าแปลงเป็น ISO จะกลายเป็นเวลา UTC แล้วเด้งกลับมาผิด 7 ชั่วโมง
 * การแยกอาศัย APPOINTMENT_FIELDS ใน 00_Config ที่เดียว ไม่มีการเช็คชื่อฟิลด์กระจายที่อื่น
 *
 * @param {*} value ค่าที่จะคืนให้หน้าเว็บ
 * @param {string} [field] ชื่อคอลัมน์ของค่านี้ ใช้ตัดสินว่าเป็นเวลานัดหมายหรือไม่
 * @return {*} ค่าที่ปลอดภัย: Date เป็นข้อความ · undefined เป็น null · ค่าอื่นคงเดิม
 */
function jsonSafe_(value, field) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return isAppointmentField_(field) ? toAppointmentText_(value) : value.toISOString();
  }

  var type = typeof value;
  if (type === 'string' || type === 'boolean') return value;
  if (type === 'number') return isFinite(value) ? value : null;   // NaN และ Infinity ข้ามไปไม่ได้
  if (type === 'function') return null;

  if (Object.prototype.toString.call(value) === '[object Array]') {
    var list = [];
    for (var i = 0; i < value.length; i++) list.push(jsonSafe_(value[i], field));
    return list;
  }

  if (type === 'object') {
    var out = {};
    for (var key in value) {
      // ส่งชื่อคอลัมน์ลงไปด้วย เพื่อให้ชั้นล่างรู้ว่าค่านี้เป็นเวลานัดหมายหรือเวลาที่เครื่องบันทึก
      if (Object.prototype.hasOwnProperty.call(value, key)) out[key] = jsonSafe_(value[key], key);
    }
    return out;
  }

  return String(value);
}

/**
 * ค่านี้ส่งผ่าน google.script.run ได้จริงหรือไม่ — ใช้ในชุดทดสอบเพื่อกันการลืมห่อ
 * @param {*} value ค่าที่จะตรวจ
 * @return {boolean}
 */
function isJsonSafe_(value) {
  if (value === null) return true;
  if (value === undefined) return false;
  if (value instanceof Date) return false;

  var type = typeof value;
  if (type === 'string' || type === 'boolean') return true;
  if (type === 'number') return isFinite(value);
  if (type === 'function') return false;

  if (Object.prototype.toString.call(value) === '[object Array]') {
    for (var i = 0; i < value.length; i++) {
      if (!isJsonSafe_(value[i])) return false;
    }
    return true;
  }

  if (type === 'object') {
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key) && !isJsonSafe_(value[key])) return false;
    }
    return true;
  }

  return false;
}

/**
 * รายชื่อฟังก์ชัน api_* ทั้งหมดที่ประกาศไว้ในโปรเจกต์
 * ใช้ในชุดทดสอบเพื่อวนตรวจทุกตัว — ฟังก์ชันที่เพิ่มใหม่จะถูกตรวจเองโดยไม่ต้องไปแก้เทสต์
 * @return {string[]} เรียงตามตัวอักษร
 */
function listApiFunctionNames_() {
  var names = [];
  var registry = apiActions_();
  for (var key in registry) {
    if (Object.prototype.hasOwnProperty.call(registry, key)) names.push(key);
  }
  names.sort();
  return names;
}

/**
 * ทะเบียนรายการที่เรียกจากภายนอกได้ — เขียนไว้ตายตัวทุกตัว
 *
 * ห้ามหาฟังก์ชันจากชื่อที่ผู้เรียกส่งมาเด็ดขาด (เช่น globalThis[name] หรือ eval)
 * เพราะชื่อที่ส่งมาเป็นข้อมูลจากภายนอก ถ้าเอาไปหาฟังก์ชันตรง ๆ ผู้เรียกจะยิงฟังก์ชันภายใน
 * ตัวไหนก็ได้ในโปรเจกต์ รวมถึงตัวที่ข้ามการตรวจสิทธิ์ทั้งหมด
 *
 * ฟังก์ชัน api_* ที่เพิ่มใหม่แล้วลืมมาลงทะเบียนตรงนี้ จะเรียกจากหน้าเว็บไม่ได้
 * และมีเทสต์คอยจับให้ว่าทะเบียนกับฟังก์ชันที่ประกาศไว้ตรงกันครบ
 *
 * @return {Object} แผนที่ชื่อรายการไปยังฟังก์ชัน
 */
function apiActions_() {
  return {
    api_getMenu:             api_getMenu,
    api_getBootstrap:        api_getBootstrap,
    api_listLocations:       api_listLocations,
    api_findSimilarLocation: api_findSimilarLocation,
    api_createWorkOrder:     api_createWorkOrder,
    api_submitWorkOrder:     api_submitWorkOrder,
    api_approveWorkOrder:    api_approveWorkOrder,
    api_returnWorkOrder:     api_returnWorkOrder,
    api_cancelWorkOrder:     api_cancelWorkOrder,
    api_reopenWorkOrder:     api_reopenWorkOrder,
    api_getWorkOrder:        api_getWorkOrder,
    api_listWorkOrders:      api_listWorkOrders,
    api_getDashboard:        api_getDashboard,
    api_searchCustomers:     api_searchCustomers,
    api_editWorkOrder:       api_editWorkOrder,
    api_listPendingApprovals: api_listPendingApprovals,
    api_acceptTask:          api_acceptTask,
    api_updateTaskStep:      api_updateTaskStep,
    api_completeTask:        api_completeTask,
    api_returnTask:          api_returnTask,
    api_cancelTask:          api_cancelTask,
    api_listMyTasks:         api_listMyTasks,
    api_listTodayTasks:      api_listTodayTasks,
    api_setTaskVisit:        api_setTaskVisit,
    api_listTaskReports:     api_listTaskReports,
    api_addTaskPeriod:       api_addTaskPeriod,
    api_removeTaskPeriod:    api_removeTaskPeriod,
    api_recordPayment:       api_recordPayment,
    api_uploadFile:          api_uploadFile,
    api_removeFile:          api_removeFile,
    api_listWoFiles:         api_listWoFiles,
    api_listReturnedWorkOrders: api_listReturnedWorkOrders,
    api_pageData:            api_pageData,
    api_logout:              api_logout,
    api_changePassword:      api_changePassword,
    api_adminSetPassword:    api_adminSetPassword,
    api_adminForceLogout:    api_adminForceLogout,
    api_generateReport:      api_generateReport,
    api_getWoDetail:         api_getWoDetail,
    api_ensureWoReport:      api_ensureWoReport,
    api_listWoAttachments:   api_listWoAttachments,
    api_fileImage:           api_fileImage,
    api_woDocument:          api_woDocument,
    api_probePaddingBytes:   api_probePaddingBytes
  };
}

/**
 * รายการที่เรียกได้ "ก่อน" ล็อกอิน — มีตัวเดียวเท่านั้น
 *
 * ทุกตัวนอกรายการนี้ต้องมีโทเคนที่ใช้ได้เสมอ ไม่มีข้อยกเว้น
 * รายการนี้จึงต้องสั้นที่สุดเท่าที่เป็นไปได้ และต้องมีเทสต์คุมว่าไม่มีใครแอบเพิ่ม
 *
 * @return {Object} แผนที่ชื่อรายการไปยังฟังก์ชัน
 */
function apiPublicActions_() {
  return { api_login: api_login };
}

/* ---------------------------------------------------------------------------
 * ทางเข้าทางเดียวจากหน้าเว็บ
 *
 * เดิมหน้าเว็บคุยกับโปรเจกต์หน้าบ้าน แล้วหน้าบ้านยิงต่อมาที่นี่ ตอนนี้เหลือโปรเจกต์เดียว
 * หน้าเว็บจึงเรียกตัวนี้ตรง ๆ ผ่าน google.script.run — เร็วขึ้นเพราะตัดการเดินทางออกไปหนึ่งต่อ
 *
 * โทเคนต้องมาใน "พารามิเตอร์" เท่านั้น ห้ามอยู่ใน URL เด็ดขาด
 * เพราะ URL ติดไปกับประวัติเบราว์เซอร์ บันทึกของเซิร์ฟเวอร์ และหัวข้อ Referer
 * ที่ส่งต่อไปยังเว็บอื่นที่หน้านั้นเผลอลิงก์ไปถึง
 * --------------------------------------------------------------------------- */

/**
 * รายการเดียวที่หน้าเว็บเรียกได้
 *
 * ชื่อรายการที่ส่งมาไม่เคยถูกเอาไปหาฟังก์ชันตรง ๆ ต้องอยู่ในทะเบียนที่เขียนไว้ตายตัวเท่านั้น
 *
 * @param {string} action ชื่อรายการ
 * @param {Array} args อาร์กิวเมนต์
 * @param {string} token โทเคนจากเบราว์เซอร์ (ไม่ต้องมีเมื่อเรียก api_login)
 * @return {Object} {ok, data} หรือ {ok, message}
 */
async function api_call(action, args, token) {
  var name = String(action || '');
  var list = (Object.prototype.toString.call(args) === '[object Array]') ? args : [];

  // เปิดให้แตะชีตได้ตลอดคำขอนี้ แต่ยังไม่ให้ตัวตนใด ๆ จนกว่าโทเคนจะผ่าน
  beginAnonymousRequest_();
  try {
    var publicActions = apiPublicActions_();
    if (Object.prototype.hasOwnProperty.call(publicActions, name)) {
      return await publicActions[name].apply(null, list);
    }

    var registry = apiActions_();
    if (!Object.prototype.hasOwnProperty.call(registry, name)) {
      return { ok: false, message: unknownActionMessage_(name) };
    }

    /*
     * ตรวจโทเคนก่อนถึงตัวรายการเสมอ และปฏิเสธเมื่อใช้ไม่ได้ (fail closed — กฎข้อ 16)
     * ธง needLogin มีไว้ให้หน้าเว็บพากลับไปหน้าเข้าสู่ระบบเอง แทนที่จะขึ้นข้อความค้างไว้เฉย ๆ
     */
    var email = await emailOfToken_(token);
    if (!email) return { ok: false, message: NEED_LOGIN_MESSAGE, needLogin: true };

    beginRequest_(email, token);
    return await registry[name].apply(null, list);
  } finally {
    // ต้องล้างเสมอ ไม่ให้ตัวตนของคำขอหนึ่งค้างไปถึงคำขอถัดไปที่ใช้การรันเดียวกัน
    endRequest_();
  }
}

/* ---------------------------------------------------------------------------
 * เข้าสู่ระบบ ออกจากระบบ และรหัสผ่าน
 * --------------------------------------------------------------------------- */

/**
 * เข้าสู่ระบบ — รายการเดียวที่เรียกได้โดยยังไม่มีโทเคน
 * @param {string} username ชื่อผู้ใช้
 * @param {string} password รหัสผ่าน
 * @return {Object} {ok, data:{token, user, mustChangePassword}}
 */
async function api_login(username, password) {
  return await apiRun_(async function () {
    return await login(username, password);
  });
}

/**
 * ออกจากระบบ — ปิดโทเคนใบที่ใช้อยู่จริง ไม่ใช่แค่ลบฝั่งเบราว์เซอร์
 *
 * รับโทเคนจากบริบทของคำขอ ไม่ใช่จากพารามิเตอร์ เพื่อไม่ให้ใครส่งโทเคนของคนอื่นมาปิด
 *
 * @return {Object} {ok, data:{loggedOut}}
 */
async function api_logout() {
  return await apiRun_(async function () {
    return { loggedOut: await logout(REQUEST_CONTEXT_.token) };
  });
}

/**
 * เปลี่ยนรหัสผ่านของตัวเอง
 * @param {string} oldPassword รหัสเดิม
 * @param {string} newPassword รหัสใหม่
 * @return {Object} {ok, data:{changed}}
 */
async function api_changePassword(oldPassword, newPassword) {
  return await apiRun_(async function () {
    return await changeOwnPassword(await getCurrentUser_(), oldPassword, newPassword);
  });
}

/**
 * ผู้ดูแลตั้งรหัสชั่วคราวให้คนอื่น — ADMIN เท่านั้น
 * @param {string} email อีเมลของผู้ใช้ (คีย์หลักของทะเบียน)
 * @param {string} tempPassword รหัสชั่วคราว
 * @return {Object} {ok, data:{email, forcedLogout}}
 */
async function api_adminSetPassword(email, tempPassword) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, [ROLE.ADMIN], 'ตั้งรหัสผ่านให้ผู้ใช้คนอื่น');
    return await setPasswordFor(email, tempPassword, user);
  });
}

/**
 * ผู้ดูแลบังคับให้ผู้ใช้คนหนึ่งออกจากระบบทุกเครื่อง — ADMIN เท่านั้น
 * @param {string} email อีเมลของผู้ใช้
 * @return {Object} {ok, data:{closed}}
 */
async function api_adminForceLogout(email) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, [ROLE.ADMIN], 'บังคับให้ผู้ใช้คนอื่นออกจากระบบ');
    return { closed: await forceLogoutUser(email) };
  });
}

/**
 * ข้อมูลตั้งต้นของหน้าหนึ่งหน้า — ตัวตน เมนู และข้อมูลของหน้านั้น มาพร้อมกันในครั้งเดียว
 *
 * เดิมข้อมูลก้อนนี้ถูกฝังลงหน้าตอน doGet แต่ตอนนี้ระบุตัวตนด้วยโทเคนที่อยู่ในเบราว์เซอร์
 * ซึ่งตอน doGet ยังไม่มีทางรู้ (ห้ามส่งโทเคนผ่าน URL) จึงต้องมาเป็นคำขอของตัวเอง
 *
 * ยังคงเป็น "คำขอเดียว" ต่อการเปิดหนึ่งหน้าเหมือนเดิม (SPEC 17.3) และรวมแล้วยังเร็วกว่าเดิม
 * เพราะเมื่อก่อนหนึ่งคำขอต้องวิ่งข้ามสองโปรเจกต์
 *
 * @param {string} page ชื่อหน้า
 * @param {Object} params ค่าที่หน้าส่งมา เช่น {dept, wo}
 * @return {Object} {ok, data} — data คือก้อนเดียวกับที่ pageBootstrap_ เคยฝังลงหน้า
 */
async function api_pageData(page, params) {
  return await apiRun_(async function () {
    return await pageBootstrap_(String(page || ''), params || {});
  });
}

/**
 * รายการที่ "อ่านอย่างเดียว" — เรียกซ้ำกี่ครั้งก็ได้ผลเหมือนเดิมและไม่เขียนอะไรลงชีตเลย
 *
 * มีไว้ให้โปรเจกต์หน้าบ้านรู้ว่าคำขอไหนลองใหม่อัตโนมัติได้เมื่อ UrlFetch หมดเวลารอ
 * ซึ่งเกิดเป็นครั้งคราวเวลา Apps Script สองโปรเจกต์คุยกันเอง
 *
 * คำขอที่ "เขียน" ห้ามลองใหม่เองเด็ดขาด เพราะคำขอแรกอาจไปถึงและทำงานสำเร็จแล้ว
 * เพียงแต่คำตอบกลับมาไม่ทัน การยิงซ้ำจะได้ใบงานสองใบหรือไฟล์แนบสองไฟล์
 * กรณีนั้นต้องให้ผู้ใช้เป็นคนตัดสินใจกดเอง พร้อมบอกชัดว่ายังไม่ได้บันทึก
 *
 * รายการนี้คือแหล่งความจริงแหล่งเดียว หน้าบ้านถือสำเนาไว้เพื่อตัดสินใจตอนที่คำตอบไม่มา
 * และมีเทสต์เทียบสองฝั่งให้ตรงกันเสมอ (test_permission_gatewayRetryList)
 *
 * @return {string[]}
 */
function apiReadOnlyActions_() {
  return [
    'api_getMenu',
    'api_getBootstrap',
    'api_listLocations',
    'api_findSimilarLocation',
    'api_getWorkOrder',
    'api_listWorkOrders',
    'api_getDashboard',
    'api_searchCustomers',
    'api_listPendingApprovals',
    'api_listMyTasks',
    'api_listTodayTasks',
    'api_listTaskReports',
    'api_listWoFiles',
    'api_listWoAttachments',
    'api_fileImage',
    'api_woDocument',
    'api_probePaddingBytes',
    'api_listReturnedWorkOrders',
    'api_getWoDetail',
    'api_pageData'
  ];
}

/**
 * ตัวตนที่ชุดทดสอบสวมไว้ชั่วคราว — ตั้งค่าโดย withTestUser_() ใน 99_Test.gs เท่านั้น
 * และถูกล้างทันทีที่ชุดทดสอบนั้นจบ จึงเป็น null เสมอในการใช้งานจริง (กฎข้อ 16)
 */
var TEST_IDENTITY_ = null;

/**
 * ตัวตนของผู้เรียกในรายการนี้ ตั้งโดย doPost() เท่านั้น (ดู 10_Web.gs)
 *
 * ระบบถูกแยกเป็นสองโปรเจกต์: โปรเจกต์หน้าบ้านเป็นตัวที่ผู้ใช้เปิด และเป็นตัวเดียว
 * ที่อ่านอีเมลจริงจาก Session ได้ ส่วนโปรเจกต์นี้เป็นตัวที่ถือข้อมูล และไม่เคยเห็นผู้ใช้โดยตรง
 * จึงต้องรับอีเมลมาจากหน้าบ้านพร้อมรหัสลับที่พิสูจน์ว่าคำขอมาจากหน้าบ้านจริง
 *
 * active บอกว่า "กำลังให้บริการคำขอจากภายนอกอยู่" ซึ่งสำคัญมาก —
 * ตอน active ถ้าอีเมลว่างต้องปฏิเสธทันที ห้ามถอยไปใช้ตัวตนอื่นแทนเด็ดขาด (กฎข้อ 16)
 */
var REQUEST_CONTEXT_ = { serving: false, active: false, email: '', token: '' };

/**
 * เริ่มให้บริการคำขอหนึ่งรายการ — เรียกจาก doPost() หลังตรวจรหัสลับผ่านแล้วเท่านั้น
 * @param {string} email อีเมลที่หน้าบ้านยืนยันมา
 */
function beginRequest_(email, token) {
  // เก็บโทเคนไว้ด้วย เพื่อให้การออกจากระบบปิดโทเคน "ใบที่กำลังใช้อยู่" ได้
  // โดยไม่ต้องให้ผู้เรียกส่งโทเคนมาเป็นพารามิเตอร์ ซึ่งจะเปิดให้ส่งของคนอื่นมาปิดได้
  REQUEST_CONTEXT_ = {
    serving: true, active: true,
    email: String(email || ''), token: String(token || '')
  };
}

/**
 * เริ่มให้บริการคำขอที่ยังไม่รู้ว่าใครเป็นคนเรียก
 *
 * ใช้กับช่วงก่อนตรวจโทเคน และกับ api_login ซึ่งต้องอ่านทะเบียนผู้ใช้ทั้งที่ยังไม่มีตัวตน
 * serving เปิดให้ "แตะชีตได้" เท่านั้น ไม่ได้ให้ตัวตนใด ๆ — getCurrentUser_() ยังปฏิเสธอยู่
 */
function beginAnonymousRequest_() {
  REQUEST_CONTEXT_ = { serving: true, active: false, email: '', token: '' };
}

/** จบคำขอ — ต้องเรียกใน finally เสมอ ไม่ให้ตัวตนค้างข้ามรายการ */
function endRequest_() {
  REQUEST_CONTEXT_ = { serving: false, active: false, email: '', token: '' };
}

/**
 * ผู้ใช้ที่กำลังเรียกใช้งานระบบ — จุดเดียวของทั้งระบบที่อ่านตัวตนผู้ใช้ (กฎข้อ 16)
 *
 * อ่านอีเมลจาก Session แล้วเทียบกับตาราง User_Role · อีเมลว่าง ไม่พบในตาราง
 * หรือถูกปิดใช้งาน ให้ปฏิเสธทุกคำสั่งทันที (fail closed) ห้ามปล่อยผ่านเป็นผู้ใช้ทั่วไป
 * เพราะ Session.getActiveUser().getEmail() คืนค่าว่างได้จริงเมื่อผู้ใช้อยู่นอกโดเมนของสคริปต์
 *
 * @return {Object} {email, displayName, roles, department, telegramUserId, active}
 * @throws {Error} เมื่อระบุตัวตนไม่ได้ ไม่พบในทะเบียนผู้ใช้ หรือถูกปิดใช้งาน
 */
async function getCurrentUser_() {
  if (TEST_IDENTITY_) return TEST_IDENTITY_;

  /*
   * แหล่งที่มาของตัวตนเปลี่ยนไปแล้ว — เดิมคือ Session.getActiveUser() ของ Google
   * ตอนนี้คือโทเคนที่ระบบออกให้ตอนล็อกอิน แล้วหน้าเว็บแนบมากับทุกคำขอ (กฎข้อ 16)
   *
   * ส่วนอื่นของฟังก์ชันนี้เหมือนเดิมทุกอย่าง และสิ่งที่คืนออกไปก็รูปแบบเดิม
   * ระบบสิทธิ์ทั้งหมดที่อยู่เหนือขึ้นไปจึงไม่ต้องรู้เลยว่าแหล่งที่มาเปลี่ยน
   *
   * อีเมลว่าง = ไม่มีโทเคน หรือโทเคนหมดอายุ หรือถูกปิดไปแล้ว ต้องปฏิเสธทันที
   * (fail closed) ห้ามถอยไปใช้ตัวตนอื่นแทนเด็ดขาด โดยเฉพาะบัญชีเจ้าของสคริปต์
   * ซึ่งเป็นบัญชีที่สคริปต์ทำงานด้วยสิทธิ์ของเขา — ถ้าถอยไปใช้ คนแปลกหน้า
   * จะได้สิทธิ์ของเจ้าของระบบไปทั้งชุด
   */
  var email = (typeof REQUEST_CONTEXT_ !== 'undefined' && REQUEST_CONTEXT_ && REQUEST_CONTEXT_.active)
    ? String(REQUEST_CONTEXT_.email || '') : '';
  if (!email) throw new Error(NEED_LOGIN_MESSAGE);

  var row = await getUserRole(email);
  if (!row) {
    throw new Error('ไม่พบบัญชีของคุณในทะเบียนผู้ใช้ กรุณาติดต่อผู้ดูแลระบบ');
  }
  if (!isTruthyCell_(row['Active'])) {
    throw new Error('บัญชีของคุณถูกปิดการใช้งานแล้ว กรุณาติดต่อผู้ดูแลระบบ');
  }

  return userViewOfRow_(email, row);
}

/**
 * แยกค่า Role ที่อาจใส่มาหลายค่าในเซลล์เดียว (ผู้ใช้ 1 คนมีได้หลาย Role — SPEC 2)
 * @param {*} value ค่าในคอลัมน์ Role เช่น "APPROVER_SP, SERVICE"
 * @return {string[]}
 */
function splitRoles_(value) {
  if (!value) return [];

  var known = knownRoles_();
  var parts = String(value).split(/[,;/|]/);
  var roles = [];

  for (var i = 0; i < parts.length; i++) {
    // ตัดช่องว่างหน้าหลัง และไม่สนตัวพิมพ์เล็กใหญ่ เพราะคอลัมน์นี้คนพิมพ์เอง
    var role = parts[i].trim().toUpperCase();
    if (!role) continue;

    /*
     * Role ที่สะกดผิดให้มองข้ามเฉพาะตัวนั้น ไม่ใช่ทำให้ทั้งแถวใช้ไม่ได้
     *
     * ถ้าทั้งแถวเสีย คนคนนั้นจะเข้าระบบไม่ได้เลยจากคำสะกดผิดตัวเดียว
     * และถ้าปล่อยผ่านชื่อที่ไม่รู้จัก ค่านั้นจะกลายเป็น Role ผีที่ไม่มีใครตรวจเจอ
     * แล้ววันหนึ่งจะมีคนเพิ่มกฎที่เทียบกับชื่อนั้นแล้วได้สิทธิ์โดยไม่ตั้งใจ
     */
    if (known.indexOf(role) === -1) continue;
    if (roles.indexOf(role) === -1) roles.push(role);
  }
  return roles;
}

/**
 * ตรวจว่าผู้ใช้มี Role ที่อนุญาต ไม่ผ่านให้หยุดทันที
 * @param {Object} user ผู้ใช้จาก getCurrentUser_()
 * @param {string[]} allowed Role ที่อนุญาต
 * @param {string} what คำอธิบายการกระทำ ใช้ในข้อความแจ้งผู้ใช้
 * @throws {Error} เมื่อสิทธิ์ไม่พอ
 */
function assertRole_(user, allowed, what) {
  if (!hasRole_(user, allowed)) {
    throw new Error('บัญชีของคุณไม่มีสิทธิ์' + what + ' ผู้ที่ทำได้คือ ' + rolesLabel_(allowed));
  }
}

/**
 * ตรวจว่าผู้ใช้เป็นผู้อนุมัติของ "สายเดียวกับใบงานนั้น" ไม่ใช่แค่มี Role ผู้อนุมัติ
 * APPROVER_SP อนุมัติงาน Lab ไม่ได้ และ APPROVER_LAB อนุมัติงานสาย SP ไม่ได้ (กฎข้อ 7)
 * @param {Object} user ผู้ใช้จาก getCurrentUser_()
 * @param {string} woId เลขที่ใบงาน
 * @param {string} what คำอธิบายการกระทำ
 * @return {Object} แถวใบงาน
 * @throws {Error} เมื่อไม่พบใบงานหรือสิทธิ์ไม่ตรงสาย
 */
async function assertApproverOfWo_(user, woId, what) {
  var wo = await getWorkOrder(woId);
  if (!wo) throw new Error('ไม่พบใบงาน ' + woId);

  var need = approverRoleOfRoute(wo['Route']);
  if (!hasRole_(user, [need])) {
    throw new Error('บัญชีของคุณไม่มีสิทธิ์' + what + 'ใบงานสายนี้ ผู้ที่ทำได้คือ ' + toThai_(ROLE_TH, need));
  }
  return wo;
}

/**
 * ตารางแปลภาษาไทยที่หน้าเว็บต้องใช้แสดงผล (SPEC 17.3)
 * ส่งไปจากที่เดียวใน 00_Config เพื่อไม่ให้หน้าเว็บมีคำแปลชุดของตัวเองที่หลุดจากกันภายหลัง
 * @return {Object} {woStatus, taskStatus, assignment, role, field}
 */
function uiLabels_() {
  return {
    woStatus:   WO_STATUS_TH,
    taskStatus: TASK_STATUS_TH,
    assignment: ASSIGNMENT_TH,
    role:       ROLE_TH,
    field:      WO_FIELD_TH,
    payment:    PAYMENT_TH,
    route:      ROUTE_TH
  };
}

/* ---------------------------------------------------------------------------
 * ข้อมูลตั้งต้นของหน้าเว็บ
 * --------------------------------------------------------------------------- */

/**
 * ข้อมูลที่หน้าเว็บต้องใช้ตอนโหลดครั้งแรก รวมไว้ในการเรียกครั้งเดียว
 * เพื่อไม่ให้หน้าจอยิง google.script.run หลายรอบตั้งแต่เปิดหน้า (SPEC G)
 * @return {Object} {ok, data:{user, requestTypes, attachmentTopics, assignmentTypes}}
 */
async function api_getBootstrap(woId) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    var wo = String(woId || '');

    /*
     * หน้านี้ใช้ตารางแม่แบบสองตาราง และไม่มีตารางไหนต้องรอผลของอีกตาราง
     * บอกชั้น Repo ไว้ก่อนจึงยิงขนานได้ในรอบเดียว แทนที่จะรอทีละตารางเรียงกัน
     * ลืมเรียกบรรทัดนี้ก็ยังได้ผลลัพธ์ถูกต้อง เพียงแต่ช้ากว่าที่ควรหนึ่งรอบ
     */
    await warmSnapshots_([SHEET.REQUEST_TYPE, SHEET.ATTACHMENT_TOPIC]);

    return {
      user: user,
      requestTypes: toOptionList_(await listRequestTypes(), 'Request_ID', 'Request_Name', 'Sort_Order'),
      attachmentTopics: await attachmentTopicOptions_(),
      assignmentTypes: [
        ASSIGNMENT.SERVICE, ASSIGNMENT.PROJECT, ASSIGNMENT.SERVICE_PROJECT,
        ASSIGNMENT.LAB, ASSIGNMENT.UNSPECIFIED
      ],
      // ข้อจำกัดของการอัปโหลดต้องมาจากเซิร์ฟเวอร์ที่เดียว หน้าเว็บห้ามมีตัวเลขชุดของตัวเอง
      // ไม่งั้นวันหนึ่งจะบอกผู้ใช้ว่ารับ 10 MB แล้วเซิร์ฟเวอร์ปฏิเสธที่ 5 MB
      upload: uploadLimits_(),
      // ใบงานที่กำลังแก้ไขอยู่ มีไฟล์อะไรแนบแล้วบ้าง และยังขาดหัวข้อบังคับใด
      files: wo ? await listWoFileViews(wo) : [],
      missingTopics: wo ? await missingRequiredTopics_(wo) : [],
      /*
       * ใครกดสั่งออกใบสั่งงานใหม่ได้ (SPEC 16.1)
       *
       * ให้เซิร์ฟเวอร์เป็นคนตอบ ไม่ให้หน้าเว็บเทียบชื่อ Role เอง เพราะถ้าหน้าเว็บ
       * ถือรายชื่อ Role ไว้ชุดหนึ่ง วันที่สิทธิ์เปลี่ยน สองฝั่งจะบอกคนละอย่าง
       * ส่วนลิงก์ฉบับล่าสุดไม่ต้องส่งมาที่นี่ เพราะอยู่ในแถวใบงานที่หน้าโหลดอยู่แล้ว
       */
      report: { canGenerate: hasRole_(user, [ROLE.ADMIN]) },
      labels: uiLabels_()
    };
  });
}

/**
 * หัวข้อไฟล์แนบตอนสร้างใบงาน ในรูปแบบที่หน้าจอใช้ได้ทันที (SPEC 9.4, 14)
 * ส่งเฉพาะหัวข้อของขอบเขต WO เพราะหน้าสร้างใบงานแนบได้แค่กลุ่มนี้
 * @return {Object[]} [{topicId, name, required, multiple}]
 */
async function attachmentTopicOptions_() {
  var rows = await listAttachmentTopics();
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Scope'] || '') !== FILE_SCOPE.WO) continue;
    list.push({
      topicId:  rows[i]['Topic_ID'],
      name:     rows[i]['Topic_Name'],
      required: cellToBoolean_(rows[i]['Required']),
      multiple: cellToBoolean_(rows[i]['Multiple'])
    });
  }
  return list;
}

/**
 * ข้อจำกัดของการอัปโหลด ที่หน้าจอต้องบอกผู้ใช้ก่อนเลือกไฟล์ (SPEC 16, 21)
 * @return {Object}
 */
function uploadLimits_() {
  return {
    maxBytes:      MAX_UPLOAD_BYTES,
    maxLabel:      maxUploadLabel_(),
    extensions:    ALLOWED_FILE_EXTENSIONS.slice(),
    // ย่อรูปก่อนอัปโหลดเป็นเรื่องบังคับ ไม่ใช่ทางเลือก — Drive มี 15 GB ทั้งระบบ
    // รูปมือถือใบละ 3-5 MB จะเต็มในเดือนครึ่ง ส่วนไฟล์เอกสารส่งตามต้นฉบับ ห้ามแตะ
    imageMaxSide:  1600,
    imageQuality:  0.85
  };
}

/**
 * แปลงแถวจากชีตเป็นรายการตัวเลือกที่หน้าจอใช้ได้ทันที
 * @param {Object[]} rows แถวจากชีต
 * @param {string} idField คอลัมน์ที่เป็นค่า
 * @param {string} nameField คอลัมน์ที่เป็นข้อความแสดงผล
 * @param {string} [sortField] คอลัมน์ที่ใช้เรียงลำดับ
 * @return {Object[]} [{id, name}]
 */
function toOptionList_(rows, idField, nameField, sortField) {
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    list.push({
      id: rows[i][idField],
      name: rows[i][nameField],
      sort: sortField ? Number(rows[i][sortField] || 0) : i
    });
  }
  list.sort(function (a, b) { return a.sort - b.sort; });
  return list;
}

/* ---------------------------------------------------------------------------
 * ทะเบียนสถานที่ — ใช้ตอนกรอกฟอร์มสร้างใบงาน (SPEC 10.3)
 * --------------------------------------------------------------------------- */

/**
 * รายการสถานที่เดิมของลูกค้าและโครงการนั้น ให้หน้าจอแสดงเป็นตัวเลือกก่อนพิมพ์ใหม่
 * @param {string} customerCode รหัสลูกค้า
 * @param {string} project ชื่อโครงการ
 * @return {Object} {ok, data}
 */
async function api_listLocations(customerCode, project) {
  return await apiRun_(async function () {
    await getCurrentUser_();   // ทุกคนในองค์กรดูได้ แต่ต้องอยู่ในทะเบียนผู้ใช้ก่อน
    return await listLocations(customerCode, project);
  });
}

/**
 * สถานที่เดิมที่ชื่อคล้ายกับที่กำลังจะเพิ่ม ใช้ถามยืนยันก่อนออก PJ_ID ใหม่
 * @param {string} customerCode รหัสลูกค้า
 * @param {string} project ชื่อโครงการ
 * @param {string} location ชื่อสถานที่ที่กำลังจะเพิ่ม
 * @return {Object} {ok, data}
 */
async function api_findSimilarLocation(customerCode, project, location) {
  return await apiRun_(async function () {
    await getCurrentUser_();
    return await findSimilarLocation(customerCode, project, location);
  });
}

/* ---------------------------------------------------------------------------
 * ใบงาน
 * --------------------------------------------------------------------------- */

/**
 * สร้างใบงานใหม่ — เฉพาะ ADMIN / SALE
 * @param {Object} form ข้อมูลจากฟอร์ม โดย key ต้องตรงกับชื่อคอลัมน์ใน SPEC หัวข้อ 13
 * @return {Object} {ok, data:{woId, pjId, workOrder}}
 */
async function api_createWorkOrder(form, filesPending) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, ROLE_GROUP.ADMIN, 'สร้างใบงาน');
    // จำนวนไฟล์ที่หน้าเว็บกำลังจะส่งตามมา · ตัดสินแค่จังหวะที่ออกใบสั่งงาน (SPEC 16.1)
    return await createWorkOrder(form, user, { filesPending: Number(filesPending || 0) });
  });
}

/**
 * ออกใบสั่งงานให้ใบที่ยังไม่มีเอกสาร — ตาข่ายรองของลำดับใหม่ (SPEC 16.1)
 *
 * เรียกจากสองที่เท่านั้น
 *   1. หน้าสร้างใบงาน หลังอัปโหลดไฟล์ทั้งชุดเสร็จ — เส้นทางปกติ
 *   2. หน้าอนุมัติ เมื่อพบใบที่ยังไม่มีเอกสาร — ตาข่ายรองกรณีผู้ใช้ปิดแท็บกลางทาง
 *
 * ข้อ 2 คือที่ที่อุดช่องว่างได้จริง เพราะใบงานใหม่ทุกใบต้องผ่านหน้าอนุมัติเสมอ
 * และเป็นที่ที่การไม่มีเอกสารสร้างความเสียหายที่สุด — ผู้อนุมัติตัดสินใจโดยไม่เห็นเอกสารไม่ได้
 *
 * **ไม่ได้เรียกจากหน้ารายละเอียดใบงานโดยตั้งใจ** หน้านั้นเป็นหน้าเดียวที่ทุก Role
 * เปิดได้ ถ้าใส่ไว้ที่นั่น ทุกคนจะสั่งให้ระบบสร้าง PDF ได้ และหน้าที่ถูกคุมไว้ว่า
 * "อ่านอย่างเดียว" จะกลายเป็นหน้าที่เขียนข้อมูลได้
 *
 * ไม่โยนข้อผิดพลาดออกไป เพราะผู้ใช้ไม่ได้สั่งเอง — ความล้มเหลวถูกบันทึกไว้ใน
 * Audit_Log แล้ว และครั้งหน้าที่มีคนเปิดหน้าอนุมัติจะลองให้ใหม่เอง
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {Object} {ok, data:{issued, woId, version, url}}
 */
async function api_ensureWoReport(woId) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, ROLE_GROUP.ADMIN.concat(ROLE_GROUP.APPROVER), 'ออกใบสั่งงานที่ยังขาด');

    var made = await ensureWorkOrderReport_(woId, user, REPORT_WHEN_MISSING);
    return made
      ? { issued: true, woId: made.woId, version: made.version, url: made.url }
      : { issued: false, woId: String(woId || '') };
  });
}

/**
 * ส่งใบงานขออนุมัติ — เฉพาะ ADMIN / SALE
 * @param {string} woId เลขที่ใบงาน
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} {ok, data}
 */
async function api_submitWorkOrder(woId, expectedUpdatedDate) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, ROLE_GROUP.ADMIN, 'ส่งใบงานขออนุมัติ');
    return await submitWorkOrder(woId, user, expectedUpdatedDate);
  });
}

/**
 * อนุมัติใบงานและระบุแผนกผู้รับงาน — เฉพาะผู้อนุมัติของสายนั้น
 * @param {string} woId เลขที่ใบงาน
 * @param {string} assignmentType แผนกผู้รับงาน (ค่าจาก ASSIGNMENT)
 * @param {Object} [options] {expectedUpdatedDate}
 * @return {Object} {ok, data:{plan, tasks, resumed}}
 */
async function api_approveWorkOrder(woId, assignmentType, options) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    await assertApproverOfWo_(user, woId, 'อนุมัติ');
    return await approveWorkOrder(woId, assignmentType, user, options);
  });
}

/**
 * ตีกลับใบงานให้แก้ไข — เฉพาะผู้อนุมัติของสายนั้น
 * @param {string} woId เลขที่ใบงาน
 * @param {string} reason เหตุผล
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} {ok, data}
 */
async function api_returnWorkOrder(woId, reason, expectedUpdatedDate) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    await assertApproverOfWo_(user, woId, 'ตีกลับ');
    return await returnWorkOrder(woId, reason, user, expectedUpdatedDate);
  });
}

/**
 * ยกเลิกใบงานทั้งใบ — ADMIN / SALE หรือผู้อนุมัติของสายนั้น
 * @param {string} woId เลขที่ใบงาน
 * @param {string} reason เหตุผล
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} {ok, data}
 */
async function api_cancelWorkOrder(woId, reason, expectedUpdatedDate) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    if (!hasRole_(user, ROLE_GROUP.ADMIN)) {
      await assertApproverOfWo_(user, woId, 'ยกเลิก');
    }
    return await cancelWorkOrder(woId, reason, user, expectedUpdatedDate);
  });
}

/**
 * เปิดใบงานที่ปิดแล้วขึ้นมาทำต่อ — ผู้อนุมัติของสายนั้น หรือแผนกที่กลับไปทำ (กฎข้อ 12)
 *
 * **ผู้ใช้ที่เป็นแผนก ไม่ได้เลือกแผนกเอง ระบบบังคับเป็นแผนกของตัวเองเสมอ**
 *
 * แผนกคือขอบเขตของสิทธิ์ ไม่ใช่ตัวเลือกการแสดงผล · ถ้ารับค่านี้จากหน้าเว็บได้
 * คนที่สวม Role Service จะส่งชื่อแผนกอื่นเข้ามาแล้วเปิดงานของแผนกนั้นได้ทันที ·
 * ด่าน `reopenAllowed` จะจับได้อยู่แล้วเพราะตรวจสังกัดด้วย แต่การไม่รับค่ามาเลย
 * ทำให้ช่องนั้นไม่มีทางเกิด ไม่ใช่แค่ถูกกันไว้
 *
 * ผู้อนุมัติยังต้องระบุแผนกเอง เพราะเขาไม่ได้สังกัดแผนกใด และใบงานร่วมมีสองแผนก
 * ให้เลือก · ระบบเดาแทนไม่ได้ว่าเขาตั้งใจเปิดของแผนกไหน
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} reason เหตุผล
 * @param {string} department แผนกที่ต้องกลับไปทำ — ใช้เฉพาะเมื่อผู้กดเป็นผู้อนุมัติ
 * @param {Object} [options] {stepIds, expectedUpdatedDate}
 * @return {Object} {ok, data}
 */
async function api_reopenWorkOrder(woId, reason, department, options) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, ROLE_GROUP.APPROVER.concat(REOPEN_DEPARTMENTS), 'เปิดงานใหม่');

    var target = String(department || '');
    if (!hasRole_(user, ROLE_GROUP.APPROVER)) {
      // ไม่ใช่ผู้อนุมัติ = เป็นแผนก · แผนกมาจากทะเบียนผู้ใช้เท่านั้น ไม่รับจากหน้าเว็บ
      target = String(user.department || '');
    } else {
      await assertApproverOfWo_(user, woId, 'เปิดงานใหม่');
    }

    return await reopenWorkOrder(woId, reason, target, user, options);
  });
}

/**
 * ตัวตนของผู้ใช้พร้อมเมนูหลักทุกรายการ (SPEC 17.2 · 17.3)
 *
 * ทุกหน้าเรียกตัวนี้เป็นอย่างแรกก่อนดึงข้อมูลอะไรทั้งสิ้น เพื่อรู้ว่า
 * ผู้ใช้เป็นใคร มีสิทธิ์อะไร และหน้านี้เป็นของ Role ไหน
 * หน้าที่ผู้ใช้ไม่มีสิทธิ์จะหยุดตั้งแต่ตรงนี้ ไม่ยิงขอข้อมูลต่อ (SPEC 17.3)
 *
 * ไม่ปฏิเสธใคร เพราะตัวมันเองไม่ได้คืนข้อมูลธุรกิจสักอย่าง คืนแค่ว่าผู้ใช้เป็นใคร
 * และรายการเมนูที่ประกาศไว้ตายตัวใน 00_Config ซึ่งเหมือนกันสำหรับทุกคนอยู่แล้ว
 *
 * @return {Object} {ok, data:{user, menu, labels}}
 */
async function api_getMenu() {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    return { user: user, menu: menuForUser_(user), labels: uiLabels_() };
  });
}

/**
 * อ่านใบงาน 1 ใบพร้อมงานของแผนกและ Step — ทุกคนในองค์กรดูได้ทุกใบ (SPEC 2)
 * @param {string} woId เลขที่ใบงาน
 * @return {Object} {ok, data:{workOrder, tasks, steps, location}}
 */
async function api_getWorkOrder(woId) {
  return await apiRun_(async function () {
    await getCurrentUser_();

    var wo = await getWorkOrder(woId);
    if (!wo) throw new Error('ไม่พบใบงาน ' + woId);

    var tasks = await listTasksByWo(woId);
    var steps = [];
    for (var i = 0; i < tasks.length; i++) {
      steps = steps.concat(await listStepsByTask(tasks[i]['Task_ID']));
    }

    return {
      workOrder: (await withDisplayNames_([wo], ['Created_By']))[0],
      tasks: tasks,
      steps: steps,
      location: wo['PJ_ID'] ? await getLocation(wo['PJ_ID']) : null
    };
  });
}

/**
 * รายการใบงานของหน้าติดตาม (SPEC 17.1) — ทุกคนเห็นทุกใบ ทุกแผนก ทุกสถานะ (SPEC 2)
 *
 * เดิมรายการนี้คืนใบงาน "ทั้งหมดทุกคอลัมน์" ให้หน้าเว็บไปกรองเอง ซึ่งใช้ไม่ได้จริง
 * ตั้งแต่หลักร้อยใบ — ทั้งช้าและส่งข้อมูลที่หน้านั้นไม่ได้ใช้ข้ามไปด้วย เช่นเบอร์โทรลูกค้า
 * ตอนนี้ค้น กรอง และแบ่งหน้าที่ฝั่งเซิร์ฟเวอร์ แล้วส่งกลับเฉพาะหน้าที่กำลังดู
 *
 * @param {Object} [query] {text, statuses[], taskStatuses[], departments[], routes[],
 *                          locations[], customers[], projects[], payments[], from, to, page}
 * @return {Object} {ok, data:{rows, total, totalAll, page, pageSize, pageCount,
 *                             filters, similar, emptyReason}}
 */
async function api_listWorkOrders(query) {
  return await apiRun_(async function () {
    // ทุก Role เห็นได้ทุกใบ แต่ต้องล็อกอินก่อนเสมอ — ด่านนี้ห้ามผ่อน (SPEC 17.3)
    await getCurrentUser_();
    return await listWorkOrdersPage(query);
  });
}

/**
 * ยอดของแดชบอร์ดหน้าแรก (SPEC 17.3 · 23)
 *
 * **ไม่รับ role หรือแผนกเป็นพารามิเตอร์เด็ดขาด** ตัวตนมาจาก `getCurrentUser_()`
 * ซึ่งอ่านจากโทเคนที่ระบบออกให้ตอนล็อกอินเท่านั้น (กฎข้อ 16) · ถ้ายอมรับ role
 * จากหน้าเว็บแม้แต่ทางเดียว ใครก็ตามที่แก้คำขอจะเห็นยอดของทุกแผนกได้ทันที
 * และเรื่องนี้จะไม่มีอาการอะไรให้เห็นเลยจนกว่าจะมีคนลอง
 *
 * ฟังก์ชันนี้จึงไม่มีพารามิเตอร์ ซึ่งทำให้ช่องโหว่นั้นไม่มีทางเกิดขึ้น ไม่ใช่แค่ถูกป้องกันไว้
 *
 * @return {Object} {ok, data:{cards, cardGroups, total, isEmpty, asOf}}
 */
async function api_getDashboard() {
  return await apiRun_(async function () {
    return await dashboardFor(await getCurrentUser_());
  });
}

/* ---------------------------------------------------------------------------
 * ข้อมูลประกอบของหน้าสร้าง/แก้ไขใบงาน
 * --------------------------------------------------------------------------- */

/**
 * ค้นลูกค้าจากชีต Customer ด้วยชื่อ — ทุกคนในทะเบียนผู้ใช้ค้นได้
 * @param {string} query คำค้นจากชื่อลูกค้า
 * @return {Object} {ok, data:[{name, code, salesPerson, startContactDate, hasCode}]}
 */
async function api_searchCustomers(query) {
  return await apiRun_(async function () {
    await getCurrentUser_();
    return await searchCustomers(query);
  });
}

/**
 * แก้ไขใบงานที่ถูกตีกลับ — เฉพาะ ADMIN / SALE ที่เป็นเจ้าของใบงาน
 * (ความเป็นเจ้าของตรวจโดย Guard ownerOfWo ใน changeStatus)
 * @param {string} woId เลขที่ใบงาน
 * @param {Object} form ข้อมูลจากฟอร์ม
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} {ok, data:{plan, workOrder}}
 */
async function api_editWorkOrder(woId, form, expectedUpdatedDate) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, ROLE_GROUP.ADMIN, 'แก้ไขใบงาน');
    return await editWorkOrder(woId, form, user, expectedUpdatedDate);
  });
}

/**
 * ใบงานที่รออนุมัติในสายที่ผู้ใช้คนนี้อนุมัติได้ — ใช้ในหน้า Approve (SPEC 17.2)
 * ผู้ที่ไม่ใช่ผู้อนุมัติจะได้รายการว่าง ไม่ใช่ error เพราะหน้าจอต้องแสดงข้อความว่าไม่มีสิทธิ์เอง
 * @return {Object} {ok, data:{user, rows, assignmentTypes}}
 */
async function api_listPendingApprovals(route) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    // สายที่ขอมาต้องเป็นสายที่ผู้ใช้อนุมัติได้จริง ไม่งั้นได้รายการว่าง (ตรวจใน listPendingApprovals)
    var page = await pendingApprovalsPage_(user, String(route || ''));

    /*
     * รายการถูกตัดหรือไม่ — ต้องบอก ไม่ใช่ปล่อยให้ใบงานหายจากหน้าจอเงียบ ๆ (กฎข้อ 32)
     *
     * การบันทึกลง System_Log เกิดขึ้นแล้วที่ queryRows_ ซึ่งขอจากฐานข้อมูลมากกว่า
     * เพดานหนึ่งแถวเสมอเพื่อรู้ว่ามีเกินหรือไม่ แล้วเขียน DB_TRUNCATED ให้เอง ·
     * ที่นี่จึงมีหน้าที่เดียวคือบอกผู้ใช้บนหน้าจอ ไม่ใช่บันทึกซ้ำอีกชุด
     *
     * ยังไม่ใช่การแบ่งหน้าจริง (SPEC 23) แต่เป็นความต่างระหว่าง "รู้ว่าไม่ครบ"
     * กับ "ไม่มีใครรู้เลย"
     *
     * **ห้ามนับแถวที่นี่แล้วเทียบกับเพดาน** — การเทียบแบบนั้นฟ้องเกินจริงที่ขอบพอดี
     * คือรายการที่มีครบ 1,000 พอดีและไม่ได้ขาดอะไรเลยจะขึ้นคำเตือนว่าไม่ครบ ·
     * ความจริงมาจากชั้นที่เห็นแถวที่ 1,001 แล้วส่งต่อขึ้นมา
     */
    return {
      user: user,
      route: String(route || ''),
      rows: await withDisplayNames_(page.rows, ['Created_By']),
      truncated: page.truncated,
      scanLimit: page.limit,
      // แยกตามสาย เพราะไม่มีการส่งต่อข้ามสายแล้ว หน้าอนุมัติสาย SP จึงต้องไม่มีตัวเลือก Lab (SPEC 3.1)
      assignmentOptions: {
        SP: assignmentTypesOfRoute(ROUTE.SP),
        LAB: assignmentTypesOfRoute(ROUTE.LAB)
      },
      labels: uiLabels_()
    };
  });
}

/* ---------------------------------------------------------------------------
 * งานของแผนก — เรียก 04_Service_Task.gs
 *
 * ด่านสิทธิ์ที่ชั้นนี้เป็นด่านหยาบ: กันคนที่ไม่ได้อยู่ในแผนกใดเลยออกไปก่อน
 * ส่วนการตรวจว่าเป็น "แผนกเจ้าของงานใบนั้นจริงหรือไม่" ต้องอ่านแถว Task ก่อน
 * จึงอยู่ใน Guard taskOwner ของ 02_StateMachine.gs ซึ่งเป็นที่เดียวที่รู้ข้อมูลครบ
 * --------------------------------------------------------------------------- */

/**
 * แผนกกดรับงานของตัวเอง (SPEC 7, 12)
 * @param {string} taskId เลขที่งานของแผนก
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} {ok, data}
 */
async function api_acceptTask(taskId, expectedUpdatedDate) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, ROLE_GROUP.DEPARTMENT, 'รับงาน');
    return await acceptTask(taskId, user, expectedUpdatedDate);
  });
}

/**
 * อัปเดต Step หรืองวดงาน
 * @param {string} stepId เลขที่ขั้นตอนหรืองวดงาน
 * @param {Object} data ค่าที่ต้องการเปลี่ยน
 * @return {Object} {ok, data:{plan, step}}
 */
async function api_updateTaskStep(stepId, data) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, ROLE_GROUP.DEPARTMENT, 'บันทึกความคืบหน้าของงาน');
    return await updateTaskStep(stepId, data, user);
  });
}

/**
 * ปิดงานของแผนก (SPEC 20.3)
 * @param {string} taskId เลขที่งานของแผนก
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} {ok, data}
 */
async function api_completeTask(taskId, expectedUpdatedDate) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, ROLE_GROUP.DEPARTMENT, 'ปิดงาน');
    return await completeTask(taskId, user, expectedUpdatedDate);
  });
}

/**
 * แผนกตีกลับใบงานให้ผู้แจ้งแก้ไข (SPEC 20.5)
 * @param {string} taskId เลขที่งานของแผนก
 * @param {string} reason เหตุผล
 * @return {Object} {ok, data:{plan, remembered, returnCount}}
 */
async function api_returnTask(taskId, reason) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, ROLE_GROUP.DEPARTMENT, 'ตีกลับใบงาน');
    return await returnTask(taskId, reason, user);
  });
}

/**
 * ยกเลิกงานของแผนก — แผนกเจ้าของงานทำได้เอง ผู้อนุมัติของสายนั้นและธุรการทำแทนได้ (SPEC 8)
 * @param {string} taskId เลขที่งานของแผนก
 * @param {string} reason เหตุผล
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} {ok, data}
 */
async function api_cancelTask(taskId, reason, expectedUpdatedDate) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    var allowed = ROLE_GROUP.DEPARTMENT.concat(ROLE_GROUP.APPROVER, ROLE_GROUP.ADMIN);
    assertRole_(user, allowed, 'ยกเลิกงานของแผนก');
    return await cancelTask(taskId, reason, user, expectedUpdatedDate);
  });
}

/**
 * กำหนดหรือแก้วันเวลาที่แผนกจะเข้างาน (SPEC 13 · 17.3)
 *
 * เป็นคำขอที่ "เขียน" จึงต้องไม่อยู่ในรายการที่ลองใหม่อัตโนมัติได้
 * แม้ผลของมันจะเหมือนเดิมเมื่อเรียกซ้ำ เพราะการยิงซ้ำจะทิ้งแถวใน Audit_Log เพิ่ม
 * ทุกครั้ง แล้วประวัติจะบอกว่ามีคนเลื่อนวันนัดหลายรอบทั้งที่กดครั้งเดียว
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @param {string} visitStart 'YYYY-MM-DDTHH:mm' หรือค่าว่าง
 * @param {string} visitEnd 'YYYY-MM-DDTHH:mm' หรือค่าว่าง
 * @return {Object} {ok, data:{plan, task}}
 */
async function api_setTaskVisit(taskId, visitStart, visitEnd) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, ROLE_GROUP.DEPARTMENT, 'กำหนดวันเวลาเข้างาน');
    return await setTaskVisit(taskId, visitStart, visitEnd, user);
  });
}

/**
 * งานของแผนกตัวเองที่นัดไว้วันนี้ (SPEC 17.3 — หน้า "งานวันนี้")
 *
 * **แผนกมาจาก getCurrentUser_() เท่านั้น ไม่รับมาจากหน้าเว็บ** เหมือนทุกที่ในระบบนี้
 * ถ้ารับมาได้ ใครก็ตามที่แก้คำขอจะเห็นแผนงานของทุกแผนกทันที
 *
 * ผู้ที่ไม่ได้สังกัดแผนกใดจะได้รายการว่าง ไม่ใช่ error ด้วยเหตุผลเดียวกับ api_listMyTasks
 *
 * @return {Object} {ok, data:{user, rows, labels, today}}
 */
async function api_listTodayTasks(page) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    return await taskPagePayload_(user, { view: TASK_TODAY_VIEW, page: page });
  });
}

/**
 * รายการงานที่แผนกของผู้ใช้คนนี้ต้องทำ — ทีละหน้า
 *
 * ผู้ที่ไม่ได้สังกัดแผนกใดจะได้รายการว่าง ไม่ใช่ error เพราะหน้าจอต้องอธิบายเองว่าทำไมไม่มีงาน
 *
 * **`view` มาจากหน้าเว็บได้ แต่แผนกมาจาก getCurrentUser_() เท่านั้น** · มุมมอง
 * เป็นแค่ตัวเลือกการแสดงผลที่ใครเลือกอะไรก็เห็นแต่ของแผนกตัวเองอยู่ดี ส่วนแผนก
 * เป็นขอบเขตของสิทธิ์ ถ้ารับมาจากหน้าเว็บได้ ใครก็ตามที่แก้คำขอจะเห็นงานของทุกแผนก
 *
 * คีย์มุมมองที่ไม่รู้จักจะถูกปฏิเสธที่ `taskViewByKey_` แล้วตกไปเป็นภาพรวม
 * ไม่ใช่กลายเป็นหน้าว่างที่ดูเหมือนว่าแผนกนี้ไม่มีงาน
 *
 * @param {boolean} [includeClosed] รวมงานที่ปิดหรือยกเลิกแล้วด้วย (ใช้เมื่อไม่ได้ระบุ view)
 * @param {string} [view] คีย์มุมมองจาก TASK_VIEWS
 * @param {number} [page] หน้าที่ต้องการ เริ่มที่ 1
 * @return {Object} {ok, data:{user, rows, total, page, pageSize, view, today, labels}}
 */
async function api_listMyTasks(includeClosed, view, page) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    return await taskPagePayload_(user, {
      includeClosed: !!includeClosed,
      view: view,
      page: page
    });
  });
}

/**
 * ก้อนข้อมูลของหน้ารายการงานแผนก — ประกอบที่เดียว ใช้ทั้งสองทางเข้า
 *
 * สองทางเข้าต้องส่งคีย์ชุดเดียวกันเป๊ะ ไม่งั้นหน้าจอที่เขียนไว้รองรับทางหนึ่ง
 * จะพังเงียบ ๆ เมื่อถูกเรียกอีกทางหนึ่ง โดยไม่มี error ให้เห็น มีแต่ช่องที่ว่างไป
 *
 * @param {Object} user ผู้ใช้ปัจจุบันจาก getCurrentUser_()
 * @param {Object} options {view, page, includeClosed}
 * @return {Object}
 */
async function taskPagePayload_(user, options) {
  var empty = { rows: [], total: 0, page: 1, pageSize: TASK_PAGE_SIZE, view: '', today: '' };
  var got = user.department ? await listTaskPage_(user.department, options) : empty;

  return {
    user:     user,
    rows:     got.rows,
    total:    got.total,
    page:     got.page,
    pageSize: got.pageSize,
    /*
     * จำนวนหน้าคำนวณที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ให้หน้าเว็บหารเอง (กฎข้อ 19)
     * total = -1 แปลว่าฐานข้อมูลไม่ได้บอกจำนวนมา จึงถือว่ามีหน้าเดียว
     * ดีกว่าโชว์ปุ่มหน้าถัดไปที่กดแล้วได้หน้าว่าง
     */
    pageCount: (got.total >= 0)
      ? Math.max(1, Math.ceil(got.total / got.pageSize)) : got.page,
    view:     got.view,
    /*
     * วันไทยที่ใช้คัด ส่งไปให้หน้าจอบอกผู้ใช้ได้ว่า "วันนี้" ที่เห็นคือวันไหน
     * ผู้ใช้ที่เปิดหน้าค้างข้ามเที่ยงคืนจะได้รู้ว่ารายการที่เห็นเป็นของเมื่อวาน
     */
    today:    got.today ? formatForDisplay_(got.today + 'T00:00:00') : '',
    /*
     * ยอดบนเมนูย่อยมาด้วย เพราะหน้านี้ถืองานแค่มุมมองเดียวและแค่หน้าเดียว
     * จึงนับเองไม่ได้อีกต่อไป · ถ้าไม่ส่งมา ป้ายจะค้างของเก่าหลังกดรีเฟรช
     *
     * ไม่ได้แพงขึ้นหนึ่งคำขอ เพราะ taskCountsForDepartment_ จำคำตอบไว้ภายในการรันเดียว
     * ตอนเปิดหน้า แถบเมนูกับรายการจึงใช้คำตอบเดียวกัน
     */
    counts:   user.department ? await taskCountsForDepartment_(user.department) : null,
    labels:   uiLabels_()
  };
}

/**
 * เอกสารของงานแผนกหนึ่ง — รายการที่เลือกได้ ที่แนบแล้ว และที่ยังขาด (SPEC 17.2)
 *
 * ทุก Role ที่ล็อกอินอยู่เปิดดูได้ เพราะหน้ารายละเอียดใบงานก็แสดงเอกสารเหล่านี้ (SPEC 2)
 * ส่วนการ "แนบ" และ "ลบ" ยังคุมด้วย Role ของแผนกเหมือนเดิมที่ api_uploadFile
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @return {Object} {ok, data:{taskId, department, scope, options, slots, missing, missingMessage}}
 */
async function api_listTaskReports(taskId) {
  return await apiRun_(async function () {
    await getCurrentUser_();
    return await taskReportView(String(taskId || ''));
  });
}

/**
 * เพิ่มงวดงานให้งานของแผนก Project — เฉพาะแผนก Project เจ้าของงาน
 * @param {string} taskId เลขที่งานของแผนก
 * @param {string} [name] ชื่องวดที่ผู้ใช้ตั้ง
 * @return {Object} {ok, data:{step, reports}}
 */
async function api_addTaskPeriod(taskId, name) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, [ROLE.PROJECT], 'เพิ่มงวดงาน');
    var step = await addTaskPeriod(String(taskId || ''), String(name || ''), user);
    return { step: step, reports: await taskReportView(String(taskId || '')) };
  });
}

/**
 * ลบงวดงานที่เพิ่มผิด — เฉพาะแผนก Project เจ้าของงาน และเฉพาะงวดที่ยังว่างจริง
 * @param {string} stepId เลขที่งวดงาน
 * @return {Object} {ok, data:{taskId, reports}}
 */
async function api_removeTaskPeriod(stepId) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, [ROLE.PROJECT], 'ลบงวดงาน');
    var removed = await removeTaskPeriod(String(stepId || ''), user);
    return { taskId: removed.taskId, reports: await taskReportView(removed.taskId) };
  });
}

/**
 * บันทึกว่าได้รับชำระเงินแล้ว — ADMIN / SALE เท่านั้น (SPEC 12)
 * @param {string} woId เลขที่ใบงาน
 * @param {string} [remark] เลขที่ใบเสร็จหรือหมายเหตุ
 * @return {Object} {ok, data}
 */
async function api_recordPayment(woId, remark) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, ROLE_GROUP.ADMIN, 'บันทึกรับชำระเงิน');
    return await recordPayment(woId, remark, user);
  });
}

/* ---------------------------------------------------------------------------
 * ไฟล์แนบ (SPEC 14, 16)
 * --------------------------------------------------------------------------- */

/**
 * Role ที่แนบไฟล์แต่ละประเภทได้ — ประกาศไว้ที่เดียว ห้ามกระจายไปตรวจในหน้าเว็บ
 * @param {string} scope ค่าจาก FILE_SCOPE
 * @return {string[]}
 */
function uploaderRolesOfScope_(scope) {
  switch (scope) {
    case FILE_SCOPE.WO:
    case FILE_SCOPE.PAYMENT: return ROLE_GROUP.ADMIN;
    case FILE_SCOPE.SERVICE: return [ROLE.SERVICE];
    case FILE_SCOPE.PROJECT: return [ROLE.PROJECT];
    case FILE_SCOPE.LAB:     return [ROLE.LAB];
    default: return [];
  }
}

/**
 * อัปโหลดไฟล์ทีละ 1 ไฟล์ (SPEC 14, 21)
 *
 * รับทีละไฟล์เสมอ ไม่รับเป็นชุด — เพดานขนาดพารามิเตอร์และเพดานเวลา 6 นาที
 * ทำให้การยิงพร้อมกันทั้งชุดล้มทั้งชุด แล้วผู้ใช้ต้องเริ่มใหม่หมด
 *
 * @param {Object} request {woId, scope, topicId, reportCode, taskId, stepId,
 *                          fileName, mimeType, content}
 * @return {Object} {ok, data:{file, files}}
 */
async function api_uploadFile(request) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    var scope = String((request && request.scope) || '');
    var allowed = uploaderRolesOfScope_(scope);
    if (!allowed.length) {
      throw new Error('ไม่รู้จักประเภทของไฟล์ที่จะแนบ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง');
    }
    assertRole_(user, allowed, 'แนบไฟล์ประเภทนี้');

    var row = await uploadFile(request, user);
    return { file: await fileViewOf_(row), files: await listWoFileViews(request.woId) };
  });
}

/**
 * ลบไฟล์ที่แนบผิด — ปิดใช้งานในทะเบียนและย้ายไฟล์ลงถังขยะ
 * @param {string} fileId เลขที่ไฟล์ในทะเบียน
 * @return {Object} {ok, data:{files}}
 */
async function api_removeFile(fileId) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    var file = await getFile(fileId);
    if (!file) throw new Error('ไม่พบไฟล์ที่ต้องการลบ อาจถูกลบไปแล้ว');

    // ใช้กติกาเดียวกับตอนแนบ — ใครแนบได้ คนนั้นลบได้
    assertRole_(user, uploaderRolesOfScope_(await scopeOfFile_(file)), 'ลบไฟล์ประเภทนี้');

    await removeFile(fileId);
    return { files: await listWoFileViews(file['WO_ID']) };
  });
}

/**
 * ประเภทของไฟล์หนึ่งไฟล์ ใช้ตัดสินว่าใครลบได้ — ต้องได้คำตอบเดียวกับตอนแนบเสมอ
 *
 * ถามจาก "งานที่ไฟล์นั้นผูกอยู่" ก่อนเป็นอันดับแรก เพราะนั่นคือความจริงที่ตรงที่สุด:
 * ไฟล์ที่อยู่ในงานของแผนก Project เป็นของแผนก Project ไม่ว่ามันจะเป็นเอกสารชนิดใด
 * หรือเป็นรูปหน้างานที่ไม่มีรหัสเอกสารเลยก็ตาม
 *
 * ถ้าตัดสินจากชนิดของเอกสารอย่างเดียว (ของเดิม) จะได้คำตอบผิดสองกรณีที่มีอยู่จริง —
 * แผนกหนึ่งแนบเอกสารของอีกชนิดเข้ามาในงานตัวเอง และรูปหน้างานที่ไม่มีรหัสเอกสาร
 * ซึ่งเคยตกไปเป็นไฟล์ระดับใบงาน แล้วคนที่แนบเองกลับลบของตัวเองไม่ได้
 *
 * @param {Object} file แถวจาก File_Index
 * @return {string} ค่าจาก FILE_SCOPE
 */
async function scopeOfFile_(file) {
  var taskId = String(file['Task_ID'] || '');
  if (taskId) {
    var task = await getTask(taskId);
    if (task) return fileScopeOfDepartment_(task['Department']);
  }
  if (file['Report_Code']) return await scopeOfReport_(file['Report_Code']);
  return file['Topic_ID'] ? FILE_SCOPE.WO : FILE_SCOPE.PAYMENT;
}

/**
 * เอกสารของใบงานสำหรับหน้าอนุมัติ — ลิงก์ใบสั่งงาน และไฟล์แนบแยกตามหัวข้อ (SPEC 17.2)
 *
 * โหลดตอนผู้อนุมัติกดเปิดดูของใบนั้น ไม่ได้ติดมากับรายการตั้งแต่เปิดหน้า ·
 * เหตุผลคือหน้ารายการรออนุมัติยังไม่มีการแบ่งหน้า จำนวนใบจึงโตได้ไม่จำกัด
 * ถ้าดึงไฟล์ของทุกใบมาพร้อมกัน ตัวกรองจะยาวตามจำนวนข้อมูล ซึ่งกฎข้อ 29 ห้ามไว้ ·
 * การโหลดทีละใบถูกกำหนดขอบเขตด้วยตัวมันเองเสมอ ไม่ว่าจะมีใบรออนุมัติกี่ใบ
 *
 * ทุกคนที่ระบุตัวตนได้ดูได้ ด้วยเหตุผลเดียวกับ api_listWoFiles — ทุกคนเห็นใบงาน
 * ได้ทุกใบอยู่แล้ว (SPEC 17.1) การซ่อนรายชื่อไฟล์จึงไม่ได้ปิดอะไรที่ยังไม่เปิด
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {Object} {ok, data:{woId, found, reportUrl, groups}}
 */
async function api_listWoAttachments(woId) {
  return await apiRun_(async function () {
    await getCurrentUser_();   // ต้องระบุตัวตนได้ก่อนเสมอ แม้เป็นการอ่าน (กฎข้อ 16)
    var wo = await getWorkOrder(woId);
    return {
      woId:      String(woId || ''),
      found:     !!wo,
      reportUrl: wo ? String(wo['Report_URL'] || '') : '',
      groups:    wo ? await listWoAttachmentGroups(woId) : []
    };
  });
}

/**
 * ไบต์ของรูปหนึ่งไฟล์ ให้หน้าเว็บแสดงเอง (SPEC 17.2)
 *
 * ลิงก์ Drive เปิดได้เฉพาะคนที่ล็อกอินบัญชีเจ้าของระบบ เพราะไฟล์อยู่ใน Drive
 * ของบัญชีนั้นบัญชีเดียวและไม่ได้ถูกแชร์ออกไป (SPEC 16) · ผู้อนุมัติที่เปิดเว็บแอป
 * ด้วยบัญชีอื่นจะกดลิงก์แล้วเจอหน้าปฏิเสธสิทธิ์ · ช่องทางนี้จึงเป็นทางเดียวที่
 * "ผู้อนุมัติเห็นรูปได้จริง" โดยไม่ต้องเปิดสิทธิ์ไฟล์ให้ใครเพิ่ม
 *
 * ขอทีละไฟล์ ตามที่หน้าจอต้องใช้จริง ไม่ใช่ยัดทุกไฟล์มากับรายการ ·
 * รูปสิบใบของใบงานที่ไม่มีใครกดดู คือสิบก้อนที่เสียเปล่าทุกครั้งที่เปิดหน้า
 *
 * @param {string} fileId เลขที่ไฟล์ในทะเบียน (ไม่ใช่รหัสบน Drive)
 * @param {string} [size] 'full' = ไฟล์เต็ม · ค่าอื่นหรือไม่ส่ง = ภาพย่อ
 * @return {Object} {ok, data:{fileId, found, mimeType, dataUrl, size}}
 */
async function api_fileImage(fileId, size) {
  return await apiRun_(async function () {
    await getCurrentUser_();   // ต้องระบุตัวตนได้ก่อนเสมอ แม้เป็นการอ่าน (กฎข้อ 16)

    var row = await getFile(fileId);
    /*
     * ไฟล์ที่ถูกลบไปแล้วต้องไม่ถูกส่งออกไป · การลบของระบบคือ Is_Active = false
     * ตัวไฟล์ยังอยู่ในถังขยะของ Drive และยังเปิดด้วยรหัสได้อยู่ (SPEC D-8)
     * ถ้าไม่ตรวจตรงนี้ ไฟล์ที่แนบผิดแล้วลบทิ้งจะยังถูกเปิดดูได้ตลอดไป
     */
    if (!row || !isTruthyCell_(row['Is_Active'])) {
      return { fileId: String(fileId || ''), found: false, mimeType: '', dataUrl: '', size: 0 };
    }

    var bytes = driveImageBytes_(row['Drive_File_ID'], String(size || '') !== 'full');
    if (!bytes) {
      return { fileId: String(fileId || ''), found: false, mimeType: '', dataUrl: '', size: 0 };
    }

    return {
      fileId:   String(fileId || ''),
      found:    true,
      mimeType: bytes.mimeType,
      // data URL พร้อมใช้ หน้าเว็บเอาไปใส่ src ได้ตรง ๆ โดยไม่ต้องต่อสตริงเอง
      dataUrl:  'data:' + bytes.mimeType + ';base64,' + bytes.base64,
      size:     bytes.size
    };
  });
}

/* ---------------------------------------------------------------------------
 * ไฟล์เดินทางผ่านเซิร์ฟเวอร์ ไม่ใช่ผ่านลิงก์ (กฎข้อ 34 · SPEC 16)
 *
 * ไฟล์ทั้งหมดอยู่ใน Drive ของบัญชีเจ้าของระบบและไม่ได้ถูกแชร์ ส่วนเว็บเปิดโดยไม่ต้อง
 * ล็อกอิน Google · ลิงก์ Drive จึงเปิดได้เฉพาะคนที่กำลังล็อกอินบัญชีเจ้าของอยู่
 *
 * **มีปลายทางที่คืนไบต์อยู่ตัวเดียวในทั้งระบบ** ทั้งหน้าจริงและเครื่องมือวัดเรียกตัวนี้
 * ตัวเดียวกัน · ปลายทางที่คืนไบต์สองชุดคือปลายทางที่วันหนึ่งจะตั้งค่าไม่ตรงกัน
 * แล้วชุดที่ไม่มีใครดูแลคือชุดที่หลุด
 * --------------------------------------------------------------------------- */

/** ชนิดของเอกสารที่ขอได้ — ประกาศไว้ที่เดียว หน้าเว็บส่งค่านอกรายการนี้มาไม่ได้ */
var DOC_KIND = Object.freeze({
  REPORT:  'report',    // ใบสั่งงานฉบับปัจจุบัน — ไม่มีใน File_Index จึงอ้างด้วย WO_ID
  ARCHIVE: 'archive',   // ใบสั่งงานฉบับเก่าใน _archive — อ้างด้วยลำดับที่เซิร์ฟเวอร์กำหนด
  FILE:    'file'       // ไฟล์ในทะเบียน File_Index — อ้างด้วย File_ID ของเรา
});

/**
 * ผู้ใช้คนนี้เปิดดูใบงานใบนี้ได้หรือไม่ — ด่านเดียวที่ทุกปลายทางของไฟล์ใช้ร่วมกัน
 *
 * วันนี้ทุกคนที่ระบุตัวตนได้เห็นใบงานได้ทุกใบ (SPEC 17.1 · 17.2) เหมือนที่
 * api_getWoDetail และ api_listWoFiles เปิดไว้ · การซ่อนไบต์จากคนที่เห็นรายชื่อไฟล์
 * อยู่แล้วไม่ได้ปิดอะไรที่ยังไม่เปิด
 *
 * **แต่ต้องมีฟังก์ชันนี้อยู่** เพราะวันที่กติกาเปลี่ยนเป็นเห็นเฉพาะใบของแผนกตัวเอง
 * จุดที่ต้องแก้ต้องมีจุดเดียว ไม่ใช่ไล่หาทุกปลายทางที่คืนไฟล์แล้วลืมไปหนึ่งจุด
 *
 * @param {Object} user ผู้ขอ
 * @param {Object} wo แถวใบงาน
 * @return {boolean}
 */
function canSeeWorkOrder_(user, wo) {
  return !!user && !!wo;
}

/**
 * ไบต์ของเอกสารหนึ่งใบ — ปลายทางเดียวของทั้งระบบ (กฎข้อ 34)
 *
 * รับ **เลขที่ใบงาน** กับตัวอ้างอิงที่ฝั่งเราเป็นคนกำหนดเท่านั้น
 * ห้ามรับรหัสของ Drive จากเบราว์เซอร์เด็ดขาด ไม่งั้นใครก็สั่งให้ระบบอ่านไฟล์ใด
 * ก็ได้ใน Drive ของเจ้าของ รวมไฟล์ที่ไม่เกี่ยวกับระบบเลย
 *
 * ล้มเหลวแบบปิด — ไม่รู้ว่าใครขอ ไม่พบใบงาน ไม่มีสิทธิ์เห็น ไฟล์ไม่ได้อยู่ในใบงานนั้น
 * หรือไฟล์ถูกลบ = ปฏิเสธด้วยคำตอบเดียวกันทุกตัวอักษร
 *
 * **ไม่แคชไบต์** ทั้งเพราะเพดานแคชและเพราะแคชที่แชร์กันทำให้ไฟล์ข้ามสิทธิ์ได้
 * แบบไม่มี error (กฎข้อ 30)
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} kind ค่าจาก DOC_KIND
 * @param {string} ref เลขที่ไฟล์ในทะเบียน (kind=file) หรือลำดับฉบับ (kind=archive)
 * @return {Object} {ok, data:{found, kind, name, mimeType, size, dataUrl}}
 */
async function api_woDocument(woId, kind, ref) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();   // ไม่รู้ว่าใครขอ = ปฏิเสธ (กฎข้อ 16)

    var wo = await getWorkOrder(woId);
    if (!canSeeWorkOrder_(user, wo)) return docMiss_('ไม่พบใบงาน หรือไม่มีสิทธิ์เห็น');

    var want = String(kind || DOC_KIND.REPORT);
    var driveId = '';
    var name = '';

    if (want === DOC_KIND.FILE) {
      var row = await getFile(ref);
      /*
       * ต้องเป็นไฟล์ของใบงานที่ขอมาจริง ๆ · ถ้าไม่ผูกสองค่านี้เข้าด้วยกัน
       * การส่งเลขที่ใบงานที่ตัวเองเห็นได้ มาคู่กับเลขที่ไฟล์ของใบงานอื่น
       * จะกลายเป็นทางลัดข้ามการตรวจสิทธิ์ไปทั้งดุ้น
       */
      if (!row || String(row['WO_ID']) !== String(woId)) return docMiss_('ไม่พบไฟล์นี้ในใบงานนี้');
      if (!isTruthyCell_(row['Is_Active'])) return docMiss_('ไฟล์นี้ถูกลบไปแล้ว');
      driveId = String(row['Drive_File_ID'] || '');
      name = String(row['Saved_File_Name'] || '');

    } else if (want === DOC_KIND.ARCHIVE) {
      /*
       * ฉบับเก่าไม่มีแถวใน File_Index จึงอ้างด้วยลำดับที่เซิร์ฟเวอร์เป็นคนจัดให้
       * ไม่ใช่ชื่อไฟล์จากเบราว์เซอร์ · ลำดับที่ถูกดัดแปลงทำได้อย่างมากแค่ชี้ไป
       * ฉบับเก่าอีกฉบับของใบงานเดียวกัน ซึ่งผู้ขอมีสิทธิ์เห็นอยู่แล้ว
       */
      var old = reportArchiveList_(wo);
      var at = Number(ref);
      if (!(at >= 0) || at >= old.length) return docMiss_('ไม่พบฉบับเก่าลำดับนี้');
      name = old[at].name;
      driveId = woArchiveFileId_(wo, at);

    } else {
      /*
       * ชนิดที่ไม่รู้จักถอยมาเป็นใบสั่งงานฉบับปัจจุบัน ซึ่งเป็นของที่ผู้ขอเห็นได้อยู่แล้ว
       * และต้อง **บอกกลับไปว่าตีความเป็นอะไร** ไม่ใช่สะท้อนค่าที่ส่งมาดิบ ๆ
       * ไม่งั้นหน้าจอจะเชื่อว่าได้ของตามที่ขอ ทั้งที่ได้อย่างอื่น (กฎข้อ 32)
       */
      want = DOC_KIND.REPORT;
      driveId = woReportFileId_(wo);
      name = REPORT_FILE_NAME;
      if (!driveId) return docMiss_('ใบงานนี้ยังไม่มีใบสั่งงาน');
    }

    var bytes = driveBytesOf_(driveId);
    if (!bytes) return docMiss_('เปิดไฟล์จากที่เก็บไม่ได้ อาจถูกลบไปแล้ว');

    /*
     * บันทึกได้แค่ว่าใครขอไฟล์ไหนเมื่อไร **ห้ามให้ไบต์หรือชิ้นส่วนของไบต์ลงไปใน log**
     * ทั้ง System_Log และ Execution log (กฎข้อ 34)
     */
    Logger.log('ส่งไฟล์ ' + name + ' ของ ' + woId + ' ขนาด ' + bytes.size + ' ไบต์ ให้ ' +
      actingEmail_(user));

    return {
      found: true,
      kind: want,
      name: name,
      mimeType: bytes.mimeType,
      size: bytes.size,
      dataUrl: 'data:' + bytes.mimeType + ';base64,' + bytes.base64
    };
  });
}

/**
 * คำตอบว่า "เปิดให้ไม่ได้" แบบเดียวกันทุกกรณี
 *
 * ข้อความเดียวกันไม่ว่าจะเพราะไม่มีแถว ไฟล์ถูกลบ หรือไม่ใช่ไฟล์ของใบงานนี้ ·
 * ถ้าแยกข้อความ คนที่ลองสุ่มเลขที่ไฟล์จะรู้ได้ว่าเลขไหนมีอยู่จริงในระบบ
 * ส่วนเหตุผลจริงอยู่ใน Execution log ให้ผู้ดูแลอ่าน
 *
 * @param {string} why เหตุผลจริง สำหรับ log เท่านั้น
 * @return {Object}
 */
/**
 * เติมชื่อที่ใช้แสดงให้แถวดิบที่ส่งออกไปทั้งแถว
 *
 * บางหน้ารับแถวจากฐานข้อมูลไปทั้งแถวแล้วหยิบคอลัมน์เอง · หน้าเหล่านั้นจะได้อีเมล
 * ถ้าไม่มีใครแปลงให้ · แปลงที่นี่เพราะที่นี่คือจุดที่ข้อมูลกำลังออกไปแสดงผล
 *
 * **เติมเป็นคอลัมน์ใหม่ ไม่ทับของเดิม** · ค่าที่ชื่อ Created_By ต้องเป็นอีเมลเสมอ
 * ไม่ว่าจะอยู่ในฐานข้อมูลหรือในคำตอบของเซิร์ฟเวอร์ ไม่งั้นวันหนึ่งจะมีคนเอาไปเทียบ
 * กับอีเมลของผู้ใช้แล้วไม่ตรง โดยไม่มีอะไรบอกว่าทำไม
 *
 * @param {Object[]} rows แถวจากฐานข้อมูล
 * @param {string[]} fields ชื่อคอลัมน์ที่เก็บอีเมล
 * @return {Object[]} แถวชุดใหม่ที่มีคอลัมน์ <ชื่อเดิม>_Name เพิ่มมา
 */
async function withDisplayNames_(rows, fields) {
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var copy = {};
    for (var key in rows[i]) {
      if (Object.prototype.hasOwnProperty.call(rows[i], key)) copy[key] = rows[i][key];
    }
    for (var f = 0; f < fields.length; f++) {
      copy[fields[f] + '_Name'] = await displayNameOf_(rows[i][fields[f]]);
    }
    out.push(copy);
  }
  return out;
}

function docMiss_(why) {
  Logger.log('ไม่คืนไฟล์ — ' + why);
  return { found: false, kind: '', name: '', mimeType: '', size: 0, dataUrl: '' };
}

/**
 * ก้อนข้อมูลขนาดที่สั่งได้ สำหรับวัด **เวลาขนไบต์อย่างเดียว** — ADMIN เท่านั้น
 *
 * ไม่ใช่ PDF และไม่ได้อ้างว่าเป็น · มีไว้ตอบคำถามเดียวคือ "ไบต์ขนาดนี้เดินทาง
 * ผ่าน google.script.run ใช้เวลาเท่าไร" ซึ่งเป็นคำถามคนละข้อกับ "เบราว์เซอร์
 * แสดง PDF ได้ไหม" · การเอาไฟล์ปลอมไปทดสอบการแสดงผลจะได้คำตอบที่เชื่อไม่ได้
 *
 * ไม่แตะ Drive เลย จึงไม่มีทางรั่วไฟล์ของใคร
 *
 * @param {number} kilobytes ขนาดที่ต้องการ
 * @return {Object} {ok, data:{size, dataUrl}}
 */
async function api_probePaddingBytes(kilobytes) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, [ROLE.ADMIN], 'ใช้เครื่องมือวัดการเปิดไฟล์');

    // เพดานเดียวกับที่ระบบยอมให้อัปโหลด — ไม่มีเหตุผลให้วัดเกินกว่าที่รับได้จริง
    var want = Math.max(1, Math.min(Number(kilobytes) || 1, Math.ceil(MAX_UPLOAD_BYTES / 1024)));
    var chunk = 'ก้อนข้อมูลสำหรับวัดเวลา ';
    var text = '';
    while (text.length < want * 1024) text += chunk;
    text = text.substring(0, want * 1024);

    return { size: text.length, dataUrl: 'data:application/octet-stream;base64,' +
      Utilities.base64Encode(text) };
  });
}

/**
 * ประเภทของไฟล์ที่อ้างถึง Report ใบหนึ่ง — ดูจากคอลัมน์ Type ของ Report_Master
 * @param {string} reportCode รหัส Report
 * @return {string} ค่าจาก FILE_SCOPE
 */
async function scopeOfReport_(reportCode) {
  var report = await getReport(reportCode);
  var type = String((report && report['Type']) || '').toUpperCase();
  if (type === FILE_SCOPE.PROJECT) return FILE_SCOPE.PROJECT;
  if (type === FILE_SCOPE.LAB) return FILE_SCOPE.LAB;
  return FILE_SCOPE.SERVICE;
}

/**
 * ใบงานที่ถูกตีกลับทั้งหมด — เมนูของ ADMIN / SALE (SPEC 17.2)
 * @return {Object} {ok, data:{user, rows, labels}}
 */
async function api_listReturnedWorkOrders() {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    // เมนูนี้เป็นของผู้เปิดใบงาน ไม่ใช่ของทุกคน — ผู้อนุมัติมีหน้ารายการรออนุมัติของตัวเองอยู่แล้ว
    assertRole_(user, ROLE_GROUP.ADMIN, 'ดูรายการใบงานที่ถูกตีกลับ');
    return { user: user, rows: await listReturnedWorkOrders(), labels: uiLabels_() };
  });
}

/**
 * ไฟล์ทั้งหมดของใบงาน พร้อมหัวข้อที่ยังขาด
 * ทุกคนที่ระบุตัวตนได้ดูได้ เพราะทุกคนเห็นใบงานได้ทุกใบอยู่แล้ว (SPEC 17.1)
 * @param {string} woId เลขที่ใบงาน
 * @return {Object} {ok, data:{files, missingTopics}}
 */
async function api_listWoFiles(woId) {
  return await apiRun_(async function () {
    await getCurrentUser_();   // ต้องระบุตัวตนได้ก่อนเสมอ แม้เป็นการอ่าน (กฎข้อ 16)
    var wo = await getWorkOrder(woId);
    return {
      files: await listWoFileViews(woId),
      missingTopics: await missingRequiredTopics_(woId),
      /*
       * ค่า Updated_Date ล่าสุดของใบงาน
       *
       * การอัปโหลดไฟล์ครั้งแรกทำให้ใบงานถูกแก้ด้วย (เก็บรหัสโฟลเดอร์ลงแถว)
       * ถ้าหน้าจอยังถือค่าเดิมอยู่ การกดบันทึกครั้งถัดไปจะถูกปฏิเสธด้วย Optimistic Lock
       * ทั้งที่ไม่มีใครมาแก้แข่ง — ผู้ใช้จะงงว่าทำไมบันทึกไม่ได้ทั้งที่ทำเองคนเดียว
       */
      updatedDate: wo ? wo['Updated_Date'] : null
    };
  });
}

/**
 * ข้อมูลทั้งหมดของหน้ารายละเอียดใบงาน — ทุก Role เปิดดูได้ (SPEC 2 · 17.2)
 *
 * ทุกคนดูใบงานได้ทุกใบทุกแผนกตาม SPEC หัวข้อ 2 · สิ่งที่คุมคือสิทธิ์แก้ไขและเปลี่ยนสถานะ
 * ซึ่งไม่มีอยู่ในหน้านี้เลยสักอย่าง แต่ยังต้องระบุตัวตนให้ได้ก่อนเสมอ (กฎข้อ 16)
 *
 * ใบที่ไม่มีอยู่จริงคืน found:false ไม่ใช่โยนข้อผิดพลาด เพื่อให้หน้าจอขึ้นมาพร้อมเมนู
 * และปุ่มกลับหน้าแรก แทนที่จะเป็นจอว่างหรือข้อความดิบ (SPEC 17.3)
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {Object} {ok, data:{detail}}
 */
async function api_getWoDetail(woId) {
  return await apiRun_(async function () {
    await getCurrentUser_();   // ต้องระบุตัวตนได้ก่อนเสมอ แม้เป็นการอ่าน
    return { detail: await workOrderDetail(woId), labels: uiLabels_() };
  });
}

/**
 * สั่งออกใบสั่งงาน PDF ใหม่ — ADMIN เท่านั้น (SPEC 16.1)
 *
 * ปกติระบบออกให้เองแล้ว 3 จังหวะ ปุ่มนี้มีไว้สำหรับกรณีที่การออกอัตโนมัติพลาด
 * (Drive ล่ม แม่แบบถูกย้าย) หรือมีคนแก้แม่แบบแล้วอยากได้ฉบับใหม่ทันที
 *
 * ต่างจากการออกอัตโนมัติตรงที่ตัวนี้ "โยนข้อผิดพลาดออกไป" ให้ผู้ใช้เห็น
 * เพราะผู้ใช้กดเองและกำลังรอผลอยู่ การเงียบไว้จะทำให้กดซ้ำไปเรื่อย ๆ โดยไม่รู้ว่าติดอะไร
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {Object} {ok, data:{woId, version, url}}
 */
async function api_generateReport(woId) {
  return await apiRun_(async function () {
    var user = await getCurrentUser_();
    assertRole_(user, [ROLE.ADMIN], 'สั่งออกใบสั่งงานใหม่');
    return await generateWorkOrderReport(woId, user);
  });
}
