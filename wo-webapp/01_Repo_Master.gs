/**
 * 01_Repo_Master.gs — อ่าน/เขียนแท็บข้อมูลตั้งต้นและตารางประกอบ (SPEC 13)
 *
 * ครอบคลุม Report_Master, Attachment_Topic, Task_Step_Template, Request_Type,
 * Notify_Channel, User_Role, Customer และ Counter
 *
 * เป็น wrapper บาง ๆ ของ 01_Repo_Sheet.gs — ห้ามมีตรรกะธุรกิจ
 * การตัดสินว่า Report ใดบังคับสำหรับงานประเภทไหน เป็นหน้าที่ของชั้น Service
 *
 * หมายเหตุ: Task_Step_Template และ Request_Type ยังไม่มีในตาราง SPEC หัวข้อ 13
 * (Step มาตรฐานอยู่ในภาคผนวก ข.1 และรายการ "สิ่งที่ต้องการ" อยู่ในภาคผนวก ข.3)
 * ชื่อคอลัมน์ของสองแท็บนี้จึงยังไม่ถูกล็อก ต้องยืนยันก่อนใช้งานจริง
 */

/**
 * ล้างแคชข้อมูลตั้งต้นทันที — กดจากตัวแก้ไข Apps Script หลังแก้ Master Data ในชีต
 *
 * ปกติระบบล้างให้เองทุกครั้งที่เขียนผ่านหน้าเว็บ แต่ผู้ดูแลแก้ในชีตโดยตรงได้
 * ซึ่งระบบไม่มีทางรู้ ถ้าไม่มีปุ่มนี้ จะต้องรอถึง 10 นาทีกว่าค่าใหม่จะมีผล
 *
 * @return {string} ข้อความยืนยันสำหรับอ่านใน Execution log
 */
function clearMasterCache() {
  clearMasterCache_();
  clearHeaderCache_();
  clearRowCache_();
  return 'ล้างแคชข้อมูลตั้งต้นแล้ว: ' + MASTER_CACHE_SHEETS.join(', ');
}

/**
 * รายการ Report ทั้งหมด (41 รายการตามภาคผนวก ก)
 * @param {boolean} [activeOnly=true] คัดเฉพาะแถวที่ Active ยังเป็นจริง
 * @return {Object[]}
 */
function listReportMaster(activeOnly) {
  return activeOnly === false ? readAll_(SHEET.REPORT_MASTER) : readAllActive_(SHEET.REPORT_MASTER);
}

/**
 * อ่าน Report ตามรหัส — ใช้ Report_Code เป็นคีย์ ห้ามใช้ Form_No เพราะซ้ำได้ (SPEC B-3)
 * @param {string} reportCode รหัส Report เช่น SV1, PE1
 * @return {Object|null}
 */
function getReport(reportCode) {
  return findOne_(SHEET.REPORT_MASTER, 'Report_Code', reportCode);
}

/**
 * รายการหัวข้อไฟล์แนบที่ใช้ตั้งชื่อไฟล์ (SPEC 14)
 * @param {boolean} [activeOnly=true] คัดเฉพาะแถวที่ Active ยังเป็นจริง
 * @return {Object[]}
 */
function listAttachmentTopics(activeOnly) {
  return activeOnly === false ? readAll_(SHEET.ATTACHMENT_TOPIC) : readAllActive_(SHEET.ATTACHMENT_TOPIC);
}

/**
 * อ่านหัวข้อไฟล์แนบตามรหัส
 * @param {string} topicId รหัสหัวข้อ
 * @return {Object|null}
 */
function getAttachmentTopic(topicId) {
  return findOne_(SHEET.ATTACHMENT_TOPIC, 'Topic_ID', topicId);
}

/**
 * แม่แบบ Step และงวดงานที่ใช้สร้าง Task_Step ตอนอนุมัติ
 * @param {boolean} [activeOnly=true] คัดเฉพาะแถวที่ Active ยังเป็นจริง
 * @return {Object[]}
 */
function listStepTemplates(activeOnly) {
  return activeOnly === false
    ? readAll_(SHEET.TASK_STEP_TEMPLATE)
    : readAllActive_(SHEET.TASK_STEP_TEMPLATE);
}

/**
 * รายการ "สิ่งที่ต้องการ" ที่ผู้ใช้เลือกตอนสร้างใบงาน (ภาคผนวก ข.3)
 * @param {boolean} [activeOnly=true] คัดเฉพาะแถวที่ Active ยังเป็นจริง
 * @return {Object[]}
 */
function listRequestTypes(activeOnly) {
  return activeOnly === false ? readAll_(SHEET.REQUEST_TYPE) : readAllActive_(SHEET.REQUEST_TYPE);
}

/**
 * ห้อง Telegram ที่ใช้แจ้งเตือน (SPEC 15, ภาคผนวก ข.4)
 * @param {boolean} [activeOnly=true] คัดเฉพาะแถวที่ Active ยังเป็นจริง
 * @return {Object[]}
 */
function listNotifyChannels(activeOnly) {
  return activeOnly === false ? readAll_(SHEET.NOTIFY_CHANNEL) : readAllActive_(SHEET.NOTIFY_CHANNEL);
}

/**
 * แก้ไขห้อง Telegram หนึ่งห้อง
 *
 * มีที่ใช้ที่เดียวคือตอนกลุ่มถูกยกระดับเป็น supergroup แล้วเลขห้องเปลี่ยน
 * ซึ่งระบบต้องแก้ให้เอง ไม่งั้นการแจ้งเตือนของห้องนั้นจะเงียบไปตลอดกาล
 * โดยที่ผู้ดูแลไม่มีทางเดาได้เลยว่าเพราะอะไร (ดู 07_Notify.gs)
 *
 * @param {string} channelId Channel_ID ของแถวนั้น
 * @param {Object} patch คอลัมน์ที่ต้องการเปลี่ยน
 * @return {Object} แถวหลังแก้ไข
 */
function updateNotifyChannel_(channelId, patch) {
  var row = updateRow_(SHEET.NOTIFY_CHANNEL, SHEET_KEY_FIELD[SHEET.NOTIFY_CHANNEL],
    channelId, patch);
  clearMasterCache();   // รายการห้องที่แคชไว้ใช้ไม่ได้แล้ว
  return row;
}

/**
 * รายชื่อผู้ใช้และบทบาททั้งหมด
 * @param {boolean} [activeOnly=true] คัดเฉพาะแถวที่ Active ยังเป็นจริง
 * @return {Object[]}
 */
function listUserRoles(activeOnly) {
  return activeOnly === false ? readAll_(SHEET.USER_ROLE) : readAllActive_(SHEET.USER_ROLE);
}

/**
 * อ่านผู้ใช้ตามอีเมล (SPEC E — ระบุตัวตนด้วย Session.getActiveUser())
 * @param {string} email อีเมลผู้ใช้
 * @return {Object|null}
 */
function getUserRole(email) {
  return findOne_(SHEET.USER_ROLE, 'Email', email);
}

/**
 * รายชื่อลูกค้าจากชีตที่ผู้ใช้อัปโหลดเอง — ระบบอ่านอย่างเดียว ห้ามเขียนทับ (SPEC 11)
 * @return {Object[]}
 */
function listCustomers() {
  return readAll_(SHEET.CUSTOMER);
}

/**
 * ค้นลูกค้าด้วยชื่อ โดยให้ฐานข้อมูลเป็นคนกรองและเป็นคนจำกัดจำนวน
 *
 * เดิมชั้นนี้อ่านลูกค้าทั้งห้าพันเก้าร้อยรายลงมาในหน่วยความจำ แล้ววนหาชื่อที่มีคำค้น
 * อยู่ข้างใน เพื่อคืนไปยี่สิบรายการ · ตอนอยู่บนชีตมันสมเหตุสมผล เพราะการอ่านทั้งแท็บ
 * ครั้งเดียวมีราคาเท่ากับการอ่านแถวเดียว · บนฐานข้อมูลมันคือการจ่ายหกคำขอและลาก
 * ข้อมูลหลายร้อยกิโลไบต์ข้ามเครือข่าย ทุกครั้งที่มีคนพิมพ์ในช่องค้นหา (กฎข้อ 28)
 *
 * สิ่งที่ต้องเหมือนเดิมทุกประการ
 *   ค้นเฉพาะช่อง "ชื่อลูกค้า" ช่องเดียว เหมือนที่ filterCustomers_ เคยทำ
 *   เรียงตามรหัสลูกค้าจากน้อยไปมาก ซึ่งเป็นลำดับเดียวกับที่ db_selectAll_ คืนมา
 *   ไม่สนใจตัวพิมพ์ใหญ่เล็ก จึงใช้ ilike ไม่ใช่ like
 *   แถวที่ไม่มีชื่อถูกข้าม · ilike ตัดทิ้งให้อยู่แล้วเมื่อมีคำค้น ส่วนตอนไม่มีคำค้น
 *   ใช้ neq กับข้อความว่าง ซึ่งใน Postgres ตัดทั้งค่าว่างและค่า NULL ออกพร้อมกัน
 *
 * จำนวนสูงสุดถูกบังคับทุกเส้นทาง รวมทั้งตอนไม่มีคำค้น จึงไม่มีทางไหนที่คืนทั้งตาราง
 *
 * @param {string} query คำค้นจากชื่อลูกค้า
 * @param {number} [limit=CUSTOMER_SEARCH_LIMIT] จำนวนผลลัพธ์สูงสุด
 * @return {Object[]} แถวลูกค้าที่คีย์เป็นชื่อหัวคอลัมน์เดิม
 */
function findCustomers_(query, limit) {
  /*
   * ด่านต้องอยู่ที่นี่ด้วย ไม่ใช่เฉพาะใน readSnapshot_
   * เพราะเส้นทางนี้ไม่ได้ผ่าน readSnapshot_ อีกต่อไปเมื่อตารางย้ายไปฐานข้อมูลแล้ว
   */
  assertDataAccessAllowed_();

  var max = Number(limit) > 0 ? Number(limit) : CUSTOMER_SEARCH_LIMIT;

  // ยุคชีต: อ่านทั้งแท็บเหมือนเดิม แล้วให้ชั้นบนคัดต่อ ซึ่งเป็นพฤติกรรมเดิมทุกประการ
  if (!isDbSheet_(SHEET.CUSTOMER)) return listCustomers();

  var keyword = String(query === null || query === undefined ? '' : query).trim();
  var filters = {};
  filters[CUSTOMER_FIELD.NAME] = keyword
    ? { op: 'ilike', value: dbContainsPattern_(keyword) }
    : { op: 'neq',   value: '' };

  return db_select_(SHEET.CUSTOMER, {
    filters: filters,
    order: CUSTOMER_FIELD.CODE,
    limit: max
  });
}

/**
 * อ่านตัวนับเลขที่เอกสารตามคีย์ เช่น WO-2609 (SPEC D-1)
 * @param {string} key คีย์ของตัวนับ
 * @return {Object|null}
 */
function getCounter(key) {
  return findOne_(SHEET.COUNTER, 'Key', key);
}

/**
 * ออกเลขถัดไปของตัวนับหนึ่งตัว แล้วคืนเลขนั้น
 *
 * **บนฐานข้อมูลไม่ใช้ LockService อีกแล้ว** · ฟังก์ชัน plpgsql `next_running_number`
 * ทำ UPDATE ... RETURNING ในคำสั่งเดียว ซึ่ง Postgres รับประกันว่าเป็นหน่วยเดียว
 * เลขจึงซ้ำกันไม่ได้ในทางทฤษฎี ไม่ใช่แค่ในทางปฏิบัติ (SPEC 22.4)
 *
 * LockService กันได้แค่ภายในสคริปต์เดียวกัน และยังมีช่องว่างระหว่างอ่านกับเขียนอยู่ดี
 * ถ้าวันหนึ่งมีอะไรเขียนตาราง counter จากนอก Apps Script — งานสำรองข้อมูล เครื่องมือ
 * ผู้ดูแล หรือหน้าเว็บที่ย้ายไป Worker แล้ว — ล็อกฝั่งสคริปต์จะมองไม่เห็นเลย
 *
 * คำสั่งนี้ใช้กับตัวนับเท่านั้น · การอัปโหลดไฟล์และการสร้างโฟลเดอร์ใน Drive
 * ยังต้องใช้ LockService ต่อไป เพราะ Drive ไม่มีอะไรมาทำหน้าที่แทนได้
 *
 * @param {string} key คีย์ของตัวนับ เช่น WO-2609
 * @return {number} เลขถัดไปที่ออกให้คีย์นี้
 */
function nextCounterValue_(key) {
  assertDataAccessAllowed_();

  if (isDbSheet_(SHEET.COUNTER)) {
    var next = Number(db_rpc_('next_running_number', { p_key: String(key) }));
    dbInvalidate_(SHEET.COUNTER);   // ค่าที่อ่านไว้ก่อนหน้าไม่ใช่ปัจจุบันอีกแล้ว
    return next;
  }

  /*
   * ยุคชีต: ต้องล็อกคร่อมทั้งช่วงอ่าน–บวก–เขียน เพราะถ้าล็อกแค่ตอนเขียน
   * สองคนที่กดพร้อมกันจะอ่านเลขเดิมได้ทั้งคู่แล้วออกเลขซ้ำกัน
   */
  var lock = acquireLock_();
  try {
    var counter = getCounter(key);
    var value = Number((counter && counter['Last_Number']) || 0) + 1;
    saveCounter(key, value);
    return value;
  } finally {
    lock.releaseLock();
  }
}

/**
 * บันทึกค่าตัวนับ — ถ้ายังไม่มีคีย์นี้จะเพิ่มแถวใหม่ ถ้ามีแล้วจะแก้ค่าเดิม
 *
 * คำเตือน: ฟังก์ชันนี้ไม่ได้ทำให้การอ่าน–บวก–เขียน เป็นหน่วยเดียวกัน
 * ผู้เรียก (nextRunningNumber ใน 05_Location.gs) ต้องครอบด้วย LockService ของตัวเอง
 * ตลอดช่วง getCounter() ถึง saveCounter() มิฉะนั้นเลขที่จะซ้ำเมื่อ 2 คนกดพร้อมกัน (SPEC D-1)
 *
 * @param {string} key คีย์ของตัวนับ
 * @param {number} lastNumber เลขล่าสุดที่ออกไปแล้ว
 * @return {Object}
 */
function saveCounter(key, lastNumber) {
  var existing = getCounter(key);
  if (existing) {
    return updateRow_(SHEET.COUNTER, 'Key', key, { 'Last_Number': lastNumber });
  }
  return appendRow_(SHEET.COUNTER, { 'Key': key, 'Last_Number': lastNumber });
}
