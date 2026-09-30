/**
 * 00_Config.gs — ค่าคงที่ ชื่อชีต และการอ่าน Script Properties
 *
 * อ้างอิง SPEC.md หัวข้อ 4 (ชุดค่าสถานะ), 13 (โครงสร้างตาราง), 18 (ค่าคงที่)
 *
 * กฎ: ห้ามพิมพ์ค่าสถานะเป็นสตริงดิบที่อื่น ให้อ้างจากไฟล์นี้เท่านั้น
 * หมายเหตุ Apps Script: ไฟล์ .gs ทุกไฟล์อยู่ใน global scope เดียวกัน และลำดับโหลดไม่แน่นอน
 * จึงห้ามเขียนโค้ดระดับบนสุดที่ไปเรียกค่าจากไฟล์อื่น — ไฟล์นี้ประกาศค่าคงที่ล้วน ไม่พึ่งไฟล์ใด
 */

/** สถานะรวมของใบงาน — WorkOrder.Overall_Status (SPEC 4.1) */
var WO_STATUS = Object.freeze({
  PENDING_APPROVE: 'PENDING_APPROVE',  // รออนุมัติ ล็อกการแก้ไข — สถานะแรกของทุกใบงาน
  RETURNED:        'RETURNED',         // ตีกลับให้แก้ไข
  APPROVED:        'APPROVED',         // อนุมัติและระบุแผนกแล้ว ยังไม่มีแผนกกดรับงาน
  IN_PROGRESS:     'IN_PROGRESS',      // มี Task อย่างน้อย 1 ตัวกำลังทำงาน
  COMPLETED:       'COMPLETED',        // Task ที่ไม่ถูกยกเลิกเสร็จครบ (สถานะปลายทาง)
  CANCELLED:       'CANCELLED'         // Task ทุกตัวถูกยกเลิก (สถานะปลายทาง)
});

/** สถานะงานของแผนก — Department_Task.Status (SPEC 4.2) */
var TASK_STATUS = Object.freeze({
  PENDING_ACCEPT: 'PENDING_ACCEPT',  // รอแผนกกดรับงาน
  IN_PROGRESS:    'IN_PROGRESS',     // แผนกรับงานแล้ว
  COMPLETED:      'COMPLETED',       // ทำครบและอัปโหลดเอกสารบังคับครบ
  RETURNED:       'RETURNED',        // แผนกตีกลับให้ Admin/Sale แก้ไข
  CANCELLED:      'CANCELLED'        // แผนกยกเลิกงานของตัวเองพร้อมเหตุผล
});

/** สถานะปลายทาง — ห้ามแก้ไขข้อมูลหลัก ยกเว้นผ่าน REOPEN (SPEC 8) */
var WO_TERMINAL_STATUS = Object.freeze([WO_STATUS.COMPLETED, WO_STATUS.CANCELLED]);

/** สายอนุมัติของใบงาน — WorkOrder.Route (SPEC 3) */
var ROUTE = Object.freeze({
  SP:  'SP',   // สาย Service / Project → APPROVER_SP
  LAB: 'LAB'   // สาย Lab → APPROVER_LAB
});

/** แผนกผู้รับงาน — WorkOrder.Assignment_Type (SPEC 3) */
var ASSIGNMENT = Object.freeze({
  SERVICE:         'SERVICE',
  PROJECT:         'PROJECT',
  SERVICE_PROJECT: 'SERVICE_PROJECT',  // งานร่วม เกิด Task 2 ตัวขนานกัน
  LAB:             'LAB',
  // "ไม่ระบุ" หมายถึงยังไม่รู้ว่าเป็น Service หรือ Project เท่านั้น ไม่เคยหมายถึง Lab
  // ใบที่เลือกค่านี้จึงอยู่สาย SP เสมอ และห้ามอนุมัติผ่านโดยยังไม่ระบุแผนก (SPEC 3.1)
  UNSPECIFIED:     'UNSPECIFIED'
});

/** แผนกเจ้าของ Task — Department_Task.Department */
var DEPT = Object.freeze({
  SERVICE: 'SERVICE',
  PROJECT: 'PROJECT',
  LAB:     'LAB'
});

/**
 * รายการรหัสแผนกที่ระบบรู้จัก — อ่านจาก DEPT ที่เดียว ไม่มีรายชื่อชุดที่สอง
 * @return {string[]}
 */
function knownDepartments_() {
  var out = [];
  for (var key in DEPT) {
    if (Object.prototype.hasOwnProperty.call(DEPT, key)) out.push(DEPT[key]);
  }
  return out;
}

/**
 * แปลงค่าแผนกที่คนพิมพ์เอง ให้เป็นรหัสแผนกที่ระบบรู้จัก
 *
 * คอลัมน์ Department ในทะเบียนผู้ใช้เป็นช่องที่คนพิมพ์เอง เหมือนคอลัมน์ Role
 * ที่อยู่ข้าง ๆ กัน · Role ตัดช่องว่าง ไม่สนตัวพิมพ์เล็กใหญ่ และตรวจกับรายการที่รู้จัก
 * มาตั้งแต่ต้น แต่ Department ไม่เคยทำสักอย่าง
 *
 * เกิดจริง 29-09-2026: ทะเบียนเก็บว่า "Service" แทนที่จะเป็น "SERVICE" · การเทียบ
 * แบบตรงตัวจึงไม่ตรง ผู้ใช้แผนก Service เปิดหน้าแผนกของตัวเองไม่ได้เลย และข้อความ
 * ที่ขึ้นบอกว่า "สิทธิ์ปัจจุบันของคุณคือ แผนก Service · สังกัดService" ซึ่งอ่านแล้ว
 * เหมือนถูกต้องทุกอย่าง — ความต่างมีแค่ป้ายแผนกที่แปลไม่ออกเพียงคำเดียว
 *
 * @param {*} value ค่าในคอลัมน์ Department
 * @return {string} รหัสแผนก หรือ '' เมื่อว่างหรือไม่รู้จัก
 */
function departmentCodeOf_(value) {
  var raw = String(value == null ? '' : value).trim();
  if (!raw) return '';

  var code = raw.toUpperCase();
  return knownDepartments_().indexOf(code) === -1 ? '' : code;
}

/** บทบาทผู้ใช้ — User_Role.Role (SPEC 2) */
var ROLE = Object.freeze({
  ADMIN:        'ADMIN',
  SALE:         'SALE',          // SPEC 18 ย่อไว้ว่า ADMIN แต่หัวข้อ 2 และหมายเหตุท้ายหัวข้อ 5 ระบุว่า "Admin" = ADMIN/SALE
  APPROVER_SP:  'APPROVER_SP',
  APPROVER_LAB: 'APPROVER_LAB',
  SERVICE:      'SERVICE',
  PROJECT:      'PROJECT',
  LAB:          'LAB'
});

/**
 * เมนูหลักของระบบ (SPEC 17.2 · 17.3) — จำนวนรายการอ่านจาก MENU_ITEMS.length เสมอ
 *
 * ประกาศไว้ที่เดียว เพราะทั้งหน้า Home แถบเมนูทุกหน้า และชุดทดสอบ ต้องเห็นรายการชุดเดียวกัน
 * ถ้าแยกกันเขียน วันหนึ่งจะเพิ่มเมนูแล้วลืมที่ใดที่หนึ่ง
 *
 * แสดงครบทุกรายการเสมอ ไม่ซ่อนตาม Role — ผู้ใช้ต้องเห็นว่าระบบมีอะไรบ้าง
 * รายการที่ไม่ใช่สิทธิ์ของตัวเองจะจางลงและกดแล้วขึ้นคำอธิบาย
 *
 * การไม่ซ่อนเป็นเรื่องหน้าจอล้วน ๆ การตรวจสิทธิ์ที่ชั้น API ไม่ผ่อนคลายตามแม้แต่ข้อเดียว
 */
var MENU_ITEMS = Object.freeze([
  Object.freeze({ key: 'create', page: 'create', label: 'สร้างใบสั่งงาน',
    roles: Object.freeze([ROLE.ADMIN, ROLE.SALE]) }),
  Object.freeze({ key: 'approve', page: 'approve', label: 'อนุมัติ SV/PE',
    roles: Object.freeze([ROLE.APPROVER_SP]) }),
  // สองรายการนี้ชี้ไปหน้าเดียวกัน ต่างกันแค่พารามิเตอร์บอกแผนก
  // ขั้นตอนทำงานเหมือนกันทุกอย่าง ถ้าแยกเป็นสองไฟล์จะต้องไล่แก้บั๊กสองที่ตลอดไป
  Object.freeze({ key: 'work-sv', page: 'work', dept: DEPT.SERVICE, label: 'แผนกงาน SV',
    roles: Object.freeze([ROLE.SERVICE]) }),
  Object.freeze({ key: 'work-pe', page: 'work', dept: DEPT.PROJECT, label: 'แผนกงาน PE',
    roles: Object.freeze([ROLE.PROJECT]) }),
  Object.freeze({ key: 'labapprove', page: 'labapprove', label: 'อนุมัติ Lab',
    roles: Object.freeze([ROLE.APPROVER_LAB]) }),
  Object.freeze({ key: 'lab', page: 'lab', label: 'แผนกงาน Lab',
    roles: Object.freeze([ROLE.LAB]) }),
  /*
   * ใบงานที่ถูกตีกลับ (SPEC 17.2)
   *
   * เป็นทางเดียวที่ผู้เปิดใบงานจะรู้ว่ามีใบถูกตีกลับรออยู่ จนกว่าจะมีหน้า Home เต็มรูปแบบ
   * และ Telegram · ถ้าไม่มีเมนูนี้ ใบที่ถูกตีกลับจะค้างอยู่เงียบ ๆ โดยไม่มีใครรู้
   */
  Object.freeze({ key: 'returned', page: 'returned', label: 'ใบงานที่ถูกตีกลับ',
    roles: Object.freeze([ROLE.ADMIN, ROLE.SALE]) }),
  /*
   * รายละเอียดใบงาน (SPEC 17.2) — เมนูเดียวที่ทุก Role เปิดได้
   *
   * ตาม SPEC หัวข้อ 2 ทุกคนดูใบงานได้ทุกใบทุกแผนก สิ่งที่คุมคือสิทธิ์แก้ไขและเปลี่ยนสถานะ
   * หน้านี้จึงอ่านอย่างเดียวล้วน ไม่มีปุ่มที่เปลี่ยนข้อมูลเลยสักปุ่ม
   *
   * รายชื่อ Role เขียนครบทุกตัวโดยตั้งใจ ไม่ใช้ค่าพิเศษอย่าง "ทุกคน"
   * เพราะตัวตรวจสิทธิ์ทั้งระบบทำงานด้วยรายชื่อ Role การมีค่าพิเศษเพิ่มขึ้นมาหนึ่งค่า
   * แปลว่าทุกจุดที่ตรวจสิทธิ์ต้องรู้จักค่านั้นด้วย ซึ่งเป็นรูที่เกิดง่ายที่สุด
   */
  /*
   * ใบงานทั้งหมด (SPEC 17.3) — รายการที่ย้ายออกมาจากหน้าแรก
   *
   * **ชื่อเมนูคือ "ใบงานทั้งหมด" ไม่ใช่ "ประวัติ"** เพราะรายการนี้มีทั้งงานที่กำลังทำ
   * และงานที่จบแล้ว · ถ้าตั้งชื่อว่าประวัติ คนจะเข้าใจว่ามีแต่ของเก่า แล้วจะไม่มาใช้
   * ค้นงานที่กำลังทำอยู่ สุดท้ายจะกลับไปขอให้เอารายการไปไว้หน้าแรกอีก
   *
   * ทุก Role เปิดได้ ตาม SPEC หัวข้อ 2 ที่ให้ทุกคนดูใบงานได้ทุกใบทุกแผนก
   * สิ่งที่คุมคือสิทธิ์แก้ไขและเปลี่ยนสถานะ ซึ่งไม่มีอยู่ในหน้านี้เลยสักปุ่ม
   */
  Object.freeze({ key: 'wolist', page: 'wolist', label: 'ใบงานทั้งหมด',
    roles: Object.freeze([ROLE.ADMIN, ROLE.SALE, ROLE.APPROVER_SP, ROLE.APPROVER_LAB,
      ROLE.SERVICE, ROLE.PROJECT, ROLE.LAB]) }),
  Object.freeze({ key: 'wo', page: 'wo', label: 'รายละเอียดใบงาน',
    roles: Object.freeze([ROLE.ADMIN, ROLE.SALE, ROLE.APPROVER_SP, ROLE.APPROVER_LAB,
      ROLE.SERVICE, ROLE.PROJECT, ROLE.LAB]) })
]);

/**
 * เมนูพร้อมธงบอกว่าผู้ใช้คนนี้มีสิทธิ์เข้าแต่ละรายการหรือไม่
 *
 * ธงนี้ใช้ตัดสิน "การแสดงผล" เท่านั้น — ทำให้รายการจางลงและขึ้นคำอธิบายเมื่อกด
 * ไม่ได้ใช้ตัดสินว่าจะให้ทำรายการได้หรือไม่ ซึ่งเป็นหน้าที่ของชั้น API เหมือนเดิม
 *
 * @param {Object} user ผู้ใช้จาก getCurrentUser_()
 * @return {Object[]} [{key, page, dept, label, roles, allowed, rolesLabel}]
 */
function menuForUser_(user) {
  var out = [];
  for (var i = 0; i < MENU_ITEMS.length; i++) {
    var item = MENU_ITEMS[i];
    var allowed = hasRole_(user, item.roles);
    // แผนกงานต้องดูแผนกของผู้ใช้ด้วย ไม่ใช่ดูแค่ Role
    // คนที่มี Role SERVICE แต่ทะเบียนระบุแผนกเป็น PROJECT ถือว่าไม่ตรง
    if (allowed && item.dept && user && user.department && user.department !== item.dept) {
      allowed = false;
    }
    out.push({
      key: item.key,
      page: item.page,
      dept: item.dept || '',
      label: item.label,
      roles: item.roles.slice(),
      rolesLabel: rolesLabel_(item.roles),
      allowed: allowed
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * มุมมองงานของแผนก และโครงเมนูในแถบซ้าย (SPEC 17.3)
 * --------------------------------------------------------------------------- */

/**
 * เมนูย่อยของทุกแผนก — กรองจาก "สถานะของ Department_Task" ไม่ใช่สถานะของใบงาน
 *
 * ประกาศไว้ที่เดียว เพราะสามที่ต้องเห็นชุดเดียวกัน: แถบเมนู (ชื่อและจำนวน)
 * หน้ารายการของแผนก (กรองแถว) และตัวนับฝั่งเซิร์ฟเวอร์ · ถ้าแยกกันเขียน
 * วันหนึ่งตัวเลขบนเมนูจะไม่ตรงกับจำนวนรายการที่เห็นจริงในหน้า
 *
 * ทุกสถานะที่งานของแผนกเป็นไปได้ ต้องอยู่ในมุมมองใดมุมมองหนึ่งเสมอ ห้ามมีสถานะตกหล่น
 * ไม่งั้นงานที่อยู่ในสถานะนั้นจะไม่มีหน้าไหนเปิดดูได้เลยทั้งระบบ — ด้วยเหตุนี้
 * `RETURNED` จึงถูกนับรวมใน "กำลังดำเนินการ" (งานที่ยังไม่จบ) ทั้งที่ SPEC เขียนไว้แค่
 * `IN_PROGRESS` · `test_menu_everyTaskStatusHasView` เฝ้าข้อนี้ไว้
 */
/**
 * คีย์ของมุมมอง "งานวันนี้" — ประกาศไว้ที่เดียว (กฎข้อ 3)
 *
 * มีสามที่ที่ต้องเห็นค่าเดียวกัน: รายการมุมมองข้างล่าง ตัวนับบนเมนู และตัวเลือก
 * แหล่งข้อมูลของหน้าแผนกใน 10_Web.gs · ถ้าพิมพ์เป็นสตริงดิบกระจายไว้สามที่
 * วันที่เปลี่ยนชื่อคีย์ จะมีที่หนึ่งเหลือค่าเดิมแล้วหน้านั้นจะว่างเปล่าโดยไม่มีอะไรฟ้อง
 */
var TASK_TODAY_VIEW = 'today';

var TASK_VIEWS = Object.freeze([
  /*
   * งานวันนี้ (SPEC 17.3) — **มุมมองเดียวที่คัดด้วยวันที่ ไม่ใช่ด้วยสถานะ**
   *
   * อยู่เป็นอันแรกเพราะเป็นคำถามแรกที่ช่างถามตอนเปิดเว็บ: วันนี้ต้องไปทำที่ไหนบ้าง
   * งานที่ยังไม่ได้กำหนดวันเข้างานจะไม่โผล่ที่นี่ แต่ยังเห็นได้ใน "กำลังดำเนินการ"
   * ตามปกติ — ห้ามให้งานหายไปจากสายตาเพราะยังไม่ได้นัดวัน
   *
   * `statuses` ของมุมมองนี้คือ "งานที่ยังไม่จบ" ซึ่งทับกับอีกสองมุมมองโดยตั้งใจ
   * เพราะงานที่นัดไว้วันนี้อาจยังรอกดรับ หรือรับแล้วกำลังทำอยู่ก็ได้ ·
   * `byDate` บอกว่ามุมมองนี้ไม่ได้เป็นเจ้าของสถานะใด — ดู taskViewOfStatus_
   */
  Object.freeze({ key: TASK_TODAY_VIEW, label: 'งานวันนี้', byDate: true,
    statuses: Object.freeze([TASK_STATUS.PENDING_ACCEPT, TASK_STATUS.IN_PROGRESS,
      TASK_STATUS.RETURNED]),
    order: Object.freeze([
      Object.freeze({ column: 'Visit_Start', ascending: true }),
      Object.freeze({ column: 'Task_ID',     ascending: true })
    ]) }),
  Object.freeze({ key: 'pending', label: 'รอกดรับงาน',
    statuses: Object.freeze([TASK_STATUS.PENDING_ACCEPT]),
    order: Object.freeze([Object.freeze({ column: 'WO_ID', ascending: false })]) }),
  Object.freeze({ key: 'active',  label: 'กำลังดำเนินการ',
    statuses: Object.freeze([TASK_STATUS.IN_PROGRESS, TASK_STATUS.RETURNED]),
    order: Object.freeze([
      Object.freeze({ column: 'Status', ascending: true }),
      Object.freeze({ column: 'WO_ID',  ascending: false })
    ]) }),
  Object.freeze({ key: 'done',    label: 'เสร็จสิ้น',
    statuses: Object.freeze([TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED]),
    order: Object.freeze([
      Object.freeze({ column: 'Status', ascending: false }),
      Object.freeze({ column: 'WO_ID',  ascending: false })
    ]) })
]);

/**
 * จำนวนงานแผนกต่อหนึ่งหน้า — เท่ากับหน้า "ใบงานทั้งหมด" โดยตั้งใจ
 *
 * **ตัวเลขนี้ไม่ได้มีไว้แค่ให้หน้าจอสั้นลง แต่เป็นสิ่งที่ทำให้ตัวกรอง `in.(...)`
 * ปลอดภัยตลอดไป** (กฎข้อ 29) · การดึงของทั้งหน้ามาเป็นชุดเดียวต้องไล่แจกแจง
 * `WO_ID` และ `Task_ID` ลงไปใน URL ซึ่งยาวได้ไม่เกินราวสองกิโลไบต์ · ถ้าไม่มี
 * ขนาดหน้า รายการนั้นจะยาวตามจำนวนงานที่แผนกมี แล้ววันหนึ่งจะระเบิดพร้อมกับ
 * ข้อความที่ไม่บอกเลยว่าคำขอไหน · ขอบเขตถูกกำหนดโดยเรา ไม่ใช่โดยข้อมูล
 */
var TASK_PAGE_SIZE = 20;

/**
 * มุมมองหนึ่งของเมนูย่อย ตามคีย์ — ที่เดียวที่แปลคีย์เป็นชุดสถานะและลำดับ
 *
 * คืน null เมื่อไม่รู้จักคีย์นั้น เพื่อให้ผู้เรียกตัดสินใจเองว่าจะถือเป็นมุมมองตั้งต้น
 * หรือปฏิเสธ · การคืนมุมมองแรกให้เงียบ ๆ จะทำให้คีย์ที่พิมพ์ผิดในลิงก์กลายเป็น
 * หน้าที่ดูเหมือนทำงานปกติแต่แสดงของผิด
 *
 * @param {string} key คีย์ของมุมมอง
 * @return {Object|null}
 */
function taskViewByKey_(key) {
  var want = String(key || '');
  for (var i = 0; i < TASK_VIEWS.length; i++) {
    if (TASK_VIEWS[i].key === want) return TASK_VIEWS[i];
  }
  return null;
}

/** มุมมองที่เปิดให้เมื่อเข้าหน้าแผนกโดยไม่ได้ระบุ — งานที่กำลังทำอยู่คือสิ่งที่เปิดดูบ่อยที่สุด */
var DEFAULT_TASK_VIEW = 'active';

/**
 * มุมมองที่สถานะหนึ่งสังกัดอยู่
 * @param {string} status ค่าจาก TASK_STATUS
 * @return {string} คีย์ของมุมมอง · ค่าว่าง = ไม่มีมุมมองใดรับผิดชอบ (ถือเป็นข้อผิดพลาด)
 */
function taskViewOfStatus_(status) {
  var value = String(status || '');
  for (var i = 0; i < TASK_VIEWS.length; i++) {
    /*
     * ข้ามมุมมองที่คัดด้วยวันที่ เพราะมันไม่ได้เป็นเจ้าของสถานะใดเลย
     * สถานะหนึ่งต้องมีบ้านที่ถาวรหนึ่งหลัง ไม่งั้นตัวนับของ "รอกดรับงาน" จะกลายเป็นศูนย์
     * ทันทีที่งานวันนี้ขึ้นมาอยู่ก่อนในรายการ แล้วตัวเลขบนเมนูจะไม่ตรงกับที่เห็นในหน้า
     */
    if (TASK_VIEWS[i].byDate) continue;
    if (TASK_VIEWS[i].statuses.indexOf(value) !== -1) return TASK_VIEWS[i].key;
  }
  return '';
}

/**
 * โครงเมนูในแถบซ้าย 6 กลุ่ม (SPEC 17.3)
 *
 * เป็น "การจัดกลุ่มเพื่อแสดงผล" ล้วน ๆ สิทธิ์ยังมาจาก MENU_ITEMS ชุดเดิมทุกตัวอักษร —
 * แต่ละรายการในนี้อ้างถึงเมนูเดิมด้วย key เท่านั้น ไม่ได้ประกาศ Role ของตัวเอง
 * ถ้าประกาศซ้ำ วันหนึ่งสองที่จะไม่ตรงกัน แล้วหน้าจอจะบอกสิทธิ์คนละอย่างกับที่ API บังคับ
 *
 * กลุ่มที่มีเมนูย่อย: หัวกลุ่มใช้กางเท่านั้น ไม่ใช่ลิงก์ · กลุ่มที่ไม่มี: หัวกลุ่มเป็นลิงก์เอง
 * กลุ่มของแผนกได้เมนูย่อยจาก TASK_VIEWS อัตโนมัติ จึงไม่มีรายการสถานะเขียนซ้ำที่นี่
 */
var MENU_GROUPS = Object.freeze([
  Object.freeze({ key: 'admin', label: 'Admin & Sale', icon: 'doc',
    items: Object.freeze(['create', 'returned']) }),
  Object.freeze({ key: 'approve-sp', label: 'อนุมัติ SV & PE', icon: 'check',
    items: Object.freeze(['approve']) }),
  Object.freeze({ key: 'dept-sv', label: 'แผนก Service', icon: 'tool',
    items: Object.freeze(['work-sv']), taskViews: true }),
  Object.freeze({ key: 'dept-pe', label: 'แผนก Project', icon: 'build',
    items: Object.freeze(['work-pe']), taskViews: true }),
  Object.freeze({ key: 'approve-lab', label: 'อนุมัติ Lab', icon: 'check',
    items: Object.freeze(['labapprove']) }),
  Object.freeze({ key: 'dept-lab', label: 'แผนก Lab', icon: 'flask',
    items: Object.freeze(['lab']), taskViews: true })
]);

/**
 * โครงเมนูพร้อมธงสิทธิ์ ในรูปที่แถบเมนูวาดได้ทันที (SPEC 17.3, 17.4)
 *
 * แสดงครบทุกกลุ่มเสมอ ไม่ซ่อนตาม Role · กลุ่มที่ไม่ใช่สิทธิ์ของผู้ใช้จะจาง กดได้
 * กางดูเมนูย่อยได้ แต่พอกดเข้าไปจริงจะถูกปฏิเสธที่ชั้น API เหมือนเดิมทุกประการ
 *
 * @param {Object[]} menu ผลจาก menuForUser_() — แหล่งเดียวของสิทธิ์
 * @return {Object[]} [{key, label, icon, allowed, rolesLabel, link, children:[...]}]
 */
function menuGroupsForUser_(menu) {
  var byKey = {};
  for (var m = 0; m < menu.length; m++) byKey[menu[m].key] = menu[m];

  var groups = [];
  for (var g = 0; g < MENU_GROUPS.length; g++) {
    var group = MENU_GROUPS[g];
    var children = [];
    var allowed = false;
    var roleNames = [];

    for (var i = 0; i < group.items.length; i++) {
      var item = byKey[group.items[i]];
      if (!item) continue;
      if (item.allowed) allowed = true;
      if (roleNames.indexOf(item.rolesLabel) === -1) roleNames.push(item.rolesLabel);

      if (group.taskViews) {
        // เมนูย่อยของแผนกมาจาก TASK_VIEWS ที่เดียว ไม่ได้เขียนรายการสถานะซ้ำไว้ในเมนู
        for (var v = 0; v < TASK_VIEWS.length; v++) {
          children.push({
            key: item.key + '-' + TASK_VIEWS[v].key,
            label: TASK_VIEWS[v].label,
            page: item.page, dept: item.dept || '', view: TASK_VIEWS[v].key,
            countKey: TASK_VIEWS[v].key,
            allowed: item.allowed
          });
        }
      } else if (group.items.length > 1) {
        children.push({
          key: item.key, label: item.label,
          page: item.page, dept: item.dept || '', view: '', countKey: '',
          allowed: item.allowed
        });
      }
    }

    groups.push({
      key: group.key,
      label: group.label,
      icon: group.icon,
      allowed: allowed,
      rolesLabel: roleNames.join(' · '),
      // กลุ่มที่ไม่มีเมนูย่อย หัวกลุ่มเป็นลิงก์ไปหน้านั้นเอง
      page: children.length ? '' : (byKey[group.items[0]] ? byKey[group.items[0]].page : ''),
      dept: children.length ? '' : ((byKey[group.items[0]] && byKey[group.items[0]].dept) || ''),
      // แผนกของกลุ่มนี้ ใช้ตัดสินว่าจะแสดงตัวเลขจำนวนงานหรือไม่
      department: group.taskViews && byKey[group.items[0]]
        ? (byKey[group.items[0]].dept || DEPT.LAB) : '',
      children: children
    });
  }
  return groups;
}

/**
 * Role ทั้งหมดที่ระบบรู้จัก ใช้คัด Role ที่สะกดผิดออกจากคอลัมน์ Role
 *
 * คอลัมน์ Role เป็นข้อความที่คนพิมพ์เอง คั่นด้วยจุลภาค เช่น "ADMIN,APPROVER_SP"
 * ถ้าใครสะกดผิดหนึ่งตัว ต้องมองข้ามเฉพาะตัวนั้น ไม่ใช่ทำให้ทั้งแถวใช้ไม่ได้
 * เพราะการทำให้ทั้งแถวเสียหมายถึงคนคนนั้นเข้าระบบไม่ได้เลยจากคำสะกดผิดตัวเดียว
 *
 * @return {string[]}
 */
function knownRoles_() {
  var list = [];
  for (var key in ROLE) {
    if (Object.prototype.hasOwnProperty.call(ROLE, key)) list.push(ROLE[key]);
  }
  return list;
}

/** กลุ่ม Role ที่ใช้บ่อยในตาราง Transition */
var ROLE_GROUP = Object.freeze({
  ADMIN:     Object.freeze([ROLE.ADMIN, ROLE.SALE]),                 // "Admin" ในตารางหัวข้อ 5
  APPROVER:  Object.freeze([ROLE.APPROVER_SP, ROLE.APPROVER_LAB]),
  DEPARTMENT: Object.freeze([ROLE.SERVICE, ROLE.PROJECT, ROLE.LAB])
});

/**
 * แผนกที่กดเปิดงานที่ปิดไปแล้วขึ้นมาทำต่อได้ด้วยตัวเอง (SPEC 5 · 20.6)
 *
 * **มีแค่ Service เพราะมีแผนกเดียวที่งานถูกเปิดซ้ำจริง** ไม่ใช่เพราะแผนกอื่นเชื่อถือไม่ได้ ·
 * ผู้อนุมัติของสายนั้นยังเปิดซ้ำได้เหมือนเดิมตามตารางหัวข้อ 5 รายการนี้เป็นการเพิ่ม
 * ไม่ใช่การแทนที่
 *
 * ประกาศเป็นรายการไว้ที่เดียว เพื่อให้วันที่แผนกอื่นต้องทำได้ เติมชื่อที่นี่จุดเดียว
 * ไม่ต้องไปไล่แก้ทั้งด่านตรวจสิทธิ์ ปุ่มบนหน้าจอ และเทสต์ให้ตรงกันสามที่
 */
var REOPEN_DEPARTMENTS = Object.freeze([ROLE.SERVICE]);

/** สถานะการชำระเงิน — WorkOrder.Payment_Status (SPEC 12) */
var PAYMENT = Object.freeze({
  UNPAID: 'UNPAID',
  PAID:   'PAID'
});

/** Action ทั้งหมดของระบบ (SPEC 5, 18) */
var ACTION = Object.freeze({
  CREATE:        'CREATE',
  EDIT:          'EDIT',
  SUBMIT:        'SUBMIT',
  ACCEPT:        'ACCEPT',
  RETURN:        'RETURN',
  CANCEL_WO:     'CANCEL_WO',
  TASK_ACCEPT:   'TASK_ACCEPT',
  TASK_UPDATE:   'TASK_UPDATE',
  TASK_COMPLETE: 'TASK_COMPLETE',
  TASK_RETURN:   'TASK_RETURN',
  TASK_CANCEL:   'TASK_CANCEL',
  REOPEN:        'REOPEN',
  RECALC:        'RECALC',  // ระบบคำนวณสถานะ WO ใหม่เอง — แถว "(อัตโนมัติ) ระบบ" ในตารางหัวข้อ 5
  // สองค่านี้ไม่ได้อยู่ในตาราง Transition และไม่เคยส่งเข้า changeStatus()
  // มีไว้เป็นชื่อเหตุการณ์ใน Audit_Log เท่านั้น เพราะการแนบและลบไฟล์ต้องตามรอยได้ (SPEC 13)
  UPLOAD:        'UPLOAD',
  DELETE_FILE:   'DELETE_FILE',
  // งวดงานของฝั่ง Project ที่แผนกเพิ่มเองระหว่างทำงาน (SPEC 20.2 · ภาคผนวก ข.1)
  // ไม่ใช่การเปลี่ยนสถานะ จึงไม่อยู่ในตาราง Transition แต่ต้องตามรอยได้ว่าใครเพิ่มใครลบ
  PERIOD_ADD:    'PERIOD_ADD',
  PERIOD_REMOVE: 'PERIOD_REMOVE',
  // การออกใบสั่งงาน PDF (SPEC 16.1) — ไม่ใช่การเปลี่ยนสถานะ จึงไม่อยู่ในตาราง Transition
  // REPORT_FAILED ต้องมี เพราะการออกเอกสารพลาดห้ามทำให้รายการหลักล้ม จึงเงียบไปเฉย ๆ ไม่ได้
  // ถ้าไม่บันทึกไว้ จะไม่มีใครรู้เลยว่าใบไหนยังไม่มีเอกสาร
  REPORT:        'REPORT',
  REPORT_FAILED: 'REPORT_FAILED',
  // การแจ้งเตือน Telegram (SPEC 15) — ไม่ใช่การเปลี่ยนสถานะ จึงไม่อยู่ในตาราง Transition
  // NOTIFY_FAILED ต้องมี เพราะการแจ้งไม่สำเร็จห้ามทำให้รายการหลักล้ม จึงเงียบไปไม่ได้
  // ถ้าไม่บันทึกไว้ จะไม่มีใครรู้ว่าใบไหนไม่ได้ถูกแจ้ง จนกว่าจะมีคนมาถามว่าทำไมไม่รู้เรื่อง
  NOTIFY:        'NOTIFY',
  NOTIFY_FAILED: 'NOTIFY_FAILED',
  // เหตุการณ์ของการเข้าสู่ระบบ — ไม่อยู่ในตาราง Transition เช่นกัน
  // LOGIN_FAILED ต้องบันทึกเสมอ เพราะการยิงสุ่มรหัสจะเห็นได้จากตรงนี้ที่เดียว
  LOGIN:           'LOGIN',
  LOGIN_FAILED:    'LOGIN_FAILED',
  // บัญชีถูกล็อกเพราะเดารหัสผิดครบจำนวน — คนละเรื่องกับ LOGIN_FAILED ธรรมดา
  // ต้องแยกแถวของตัวเอง เพราะนี่คือบรรทัดที่บอกว่า "มีคนถูกกันออกจากระบบจริง ๆ แล้ว"
  ACCOUNT_LOCKED:  'ACCOUNT_LOCKED',
  LOGOUT:          'LOGOUT',
  FORCE_LOGOUT:    'FORCE_LOGOUT',
  PASSWORD_CHANGE: 'PASSWORD_CHANGE',
  PASSWORD_RESET:  'PASSWORD_RESET',
  // ผู้ดูแลถูกสร้างด้วยมือจากตัวแก้ไข Apps Script (createAdminUser ใน 98_Migrate.gs)
  // ต้องมีร่องรอย เพราะเป็นทางเดียวในระบบที่สร้างสิทธิ์สูงสุดได้โดยไม่ผ่านผู้ดูแลคนไหนเลย
  // ประตูแบบนี้ต้องเปิดแล้วมีเสียง ไม่ใช่เปิดได้เงียบ ๆ
  ADMIN_CREATED:   'ADMIN_CREATED',
  // การสำรองข้อมูลรายสัปดาห์ (SPEC 22.6) — ต้องมีทั้งสำเร็จและล้มเหลว
  // ตัวที่สำเร็จคือสิ่งเดียวที่บอกได้ว่า "สำรองครั้งล่าสุดเมื่อไร" ซึ่งเป็นคำถามหลัก
  // ส่วนตัวที่ล้มเหลวต้องดังกว่า เพราะการสำรองที่เงียบหายไปคือสิ่งที่อันตรายที่สุด
  BACKUP_OK:       'BACKUP_OK',
  BACKUP_FAILED:   'BACKUP_FAILED',
  BACKUP_RESTORED: 'BACKUP_RESTORED',
  // ระบบแก้ Chat_ID ให้เองเมื่อกลุ่ม Telegram ถูกยกระดับเป็น supergroup แล้วเลขห้องเปลี่ยน
  // ต้องมีร่องรอย เพราะเป็นการที่ระบบแก้ค่าตั้งค่าของผู้ดูแลเอง โดยไม่มีใครสั่ง
  CHANNEL_FIXED:   'CHANNEL_FIXED',
  // เรื่องสิทธิ์ สองอย่างนี้ต้องแยกกัน เพราะแก้คนละวิธีสิ้นเชิง (ดู AUTHORIZATION_NEEDED_MESSAGE)
  ACCESS_DENIED:   'ACCESS_DENIED',     // บัญชีที่เปิดใช้งานยังไม่ได้รับแชร์ไฟล์
  AUTH_REQUIRED:   'AUTH_REQUIRED',     // ตัวสคริปต์ยังไม่ได้รับอนุญาตให้ใช้บริการของ Google
  // ฐานข้อมูล Supabase ตอบกลับมาว่าไม่สำเร็จ (SPEC 22.2 · กฎข้อ 24)
  // ต้องมีแถวของตัวเอง เพราะผู้ใช้จะเห็นแต่ข้อความกลาง ๆ ที่ไม่บอกอะไรเลย
  // ถ้าไม่บันทึกของจริงไว้ที่นี่ จะไม่มีที่ไหนในระบบรู้ว่าฐานข้อมูลตอบว่าอะไร
  DB_FAILED:       'DB_FAILED',
  DB_TRUNCATED:    'DB_TRUNCATED'
});

/** ชนิดของสิ่งที่เปลี่ยนสถานะได้ — ใช้เป็นพารามิเตอร์ entity ของ changeStatus() */
var ENTITY = Object.freeze({
  WO:   'WO',
  TASK: 'TASK',
  // ไฟล์ไม่มีสถานะให้เปลี่ยน จึงไม่เคยผ่าน changeStatus()
  // แต่ต้องมีชื่อของตัวเองใน Audit_Log เพราะ SPEC กำหนดให้ระบุเหตุการณ์ด้วย Entity + Action เสมอ
  FILE: 'FILE',
  // เหตุการณ์เกี่ยวกับบัญชีผู้ใช้ เช่นเข้าสู่ระบบ ออกจากระบบ และการตั้งรหัสผ่าน
  USER: 'USER',
  // เรื่องของตัวระบบเอง ไม่ได้ผูกกับใบงานหรือบัญชีใด เช่นสิทธิ์ไม่พอ — ลง System_Log เสมอ
  SYSTEM: 'SYSTEM'
});

/**
 * ตัวนำหน้าเลขที่เอกสาร (SPEC 18)
 * SV ใช้ร่วมกันทั้งแผนก Service และ Project · PJ เป็นรหัสสถานที่ ไม่ใช่เลขงาน
 */
var PREFIX = Object.freeze({
  WO:  'WO-',
  SV:  'SV-',
  LAB: 'LAB-',
  PJ:  'PJ-'
});

/** Step มาตรฐานของแผนก Service (SPEC 18, ภาคผนวก ข.1) — ห้าม hard-code เลข 3 ที่อื่น */
var STEP_DEFAULT = Object.freeze(['หน้างาน', 'ตรวจเช็คและแก้ไข', 'สมบูรณ์']);

/** ชนิดของแถวในตาราง Task_Step (SPEC 13) */
var STEP_TYPE = Object.freeze({
  STEP:   'STEP',    // ขั้นตอนงานฝั่ง Service
  PERIOD: 'PERIOD'   // งวดงานฝั่ง Project
});

/**
 * สถานะของ Step และงวดงาน — Task_Step.Status
 * SPEC หัวข้อ 13 ระบุว่ามีคอลัมน์ Status แต่ไม่ได้ล็อกชุดค่าไว้เหมือนหัวข้อ 4
 * จึงใช้สองค่านี้ให้สอดคล้องกับชุดค่าของ Task และประกาศไว้ที่เดียวตามกฎข้อ 3
 */
var STEP_STATUS = Object.freeze({
  PENDING:   'PENDING',     // ยังไม่เสร็จ
  COMPLETED: 'COMPLETED'    // เสร็จแล้ว
});

/**
 * ชื่อแท็บทั้งหมด (SPEC 13) — ชื่อต้องตรงตัวอักษร เพราะระบบอ่านโดยอ้างอิงชื่อหัวคอลัมน์
 * ทุกแท็บอยู่ในไฟล์ฐานข้อมูลหลัก ยกเว้น AUDIT_LOG ที่แยกเป็นอีกไฟล์ (SPEC D-5, D-6)
 */
var SHEET = Object.freeze({
  WORK_ORDER:         'WorkOrder',
  DEPARTMENT_TASK:    'Department_Task',
  TASK_STEP:          'Task_Step',
  PROJECT_LOCATION:   'Project_Location',
  FILE_INDEX:         'File_Index',
  COUNTER:            'Counter',
  REPORT_MASTER:      'Report_Master',
  ATTACHMENT_TOPIC:   'Attachment_Topic',
  TASK_STEP_TEMPLATE: 'Task_Step_Template',
  REQUEST_TYPE:       'Request_Type',
  NOTIFY_CHANNEL:     'Notify_Channel',
  USER_ROLE:          'User_Role',
  SESSION_TOKEN:      'Session_Token',   // โทเคนที่ระบบออกให้ตอนล็อกอิน (ไม่มีใน SPEC 13 — ดู 07_Auth.gs)
  CUSTOMER:           'Customer',
  AUDIT_LOG:          'Audit_Log',  // อยู่คนละไฟล์ — เปิดด้วย getAuditDb_()
  SYSTEM_LOG:         'System_Log'  // อยู่ในไฟล์เดียวกับ Audit_Log (SPEC 13)
});

/**
 * ตารางที่มีไว้ให้ชุดทดสอบเขียนลงไปโดยเฉพาะ — ระบบจริงไม่อ่านที่ไหนเลย
 *
 * แยกออกจาก DB_COLUMNS โดยตั้งใจ เพราะ DB_COLUMNS คือรายชื่อตารางของระบบ
 * ทุกตัวที่ไล่รายการนั้น — ตัวตรวจตาราง ตัวตรวจ GRANT ตัวนับแถว — จึงไม่ควร
 * เห็นตารางทดสอบปนอยู่ด้วย · การแยกไว้ทำให้รายงานทุกฉบับพูดถึงเฉพาะตารางจริงเสมอ
 *
 * โครงสร้างล้อตาม Request_Type ทุกคอลัมน์ อยู่ใน supabase_test_bulk.sql
 */
var DB_TEST_COLUMNS = Object.freeze({
  '_Test_Bulk': {
    table: '_test_bulk',
    columns: ['Row_ID', 'Row_Name', 'Sort_Order', 'Active']
  }
});

/** แท็บที่ระบบอ่านอย่างเดียว ห้ามเขียนทับ (SPEC 11, 13) */
var READONLY_SHEET = Object.freeze([SHEET.CUSTOMER]);

/**
 * เพดานแถวที่หน้ารายการรออนุมัติขอมาในครั้งเดียว (SPEC 23 · กฎข้อ 28)
 *
 * queryRowsCounted_ ขอจากฐานข้อมูลมากกว่าเพดานนี้หนึ่งแถวเสมอ เพื่อให้รู้ว่ามีเกินหรือไม่
 * โดยไม่ต้องนับทั้งตาราง · ได้เกินเมื่อไร มันบันทึก DB_TRUNCATED ลง System_Log ให้เอง
 * กลไกจึงมีอยู่ชุดเดียว ไม่ใช่ชุดของหน้านี้แยกอีกชุด
 *
 * **คำเตือนแม่นที่ขอบพอดี** — รายการที่มีครบ 1,000 พอดีต้องไม่ถูกฟ้องว่าไม่ครบ ·
 * ห้ามนับแถวที่ได้แล้วเทียบกับเพดานแทน เพราะวิธีนั้นให้คำตอบผิดตรงขอบ และคำเตือน
 * ที่ฟ้องทั้งที่ไม่มีอะไรหาย ฝึกให้คนเลิกอ่านคำเตือนทั้งระบบ
 *
 * ยังไม่ใช่การแบ่งหน้าจริง เป็นแค่ด่านกันไม่ให้ใบงานหายเงียบ ๆ (SPEC 23)
 */
var PENDING_APPROVE_SCAN = 1000;

/**
 * แท็บที่ย้ายไปอยู่ Supabase แล้ว — ชุด A ของ SPEC 22.4
 *
 * นี่คือสวิตช์จุดเดียวของทั้งระบบที่บอกว่าข้อมูลของแท็บไหนอยู่ที่ไหน
 * `readSnapshot_`, `appendRows_` และ `updateRow_` ใน 01_Repo_Sheet.gs อ่านรายการนี้
 * แล้วเลือกทางเอง · ผู้เรียกทุกคนตั้งแต่ชั้น Repo_Master ขึ้นไปไม่รู้เรื่องเลย
 * และไม่ต้องรู้ด้วย — นั่นคือเหตุผลที่ชั้น Repo ถูกแยกไว้ตั้งแต่เฟสแรก
 *
 * ย้ายชุด B และ C เมื่อไร ให้เติมชื่อลงที่นี่ ไม่ใช่ไปแก้ที่ผู้เรียก
 */
var DB_MIGRATED_SHEETS = Object.freeze([
  /* ชุด A — อ่านอย่างเดียว */
  SHEET.REPORT_MASTER,
  SHEET.REQUEST_TYPE,
  SHEET.ATTACHMENT_TOPIC,
  SHEET.TASK_STEP_TEMPLATE,
  SHEET.NOTIFY_CHANNEL,
  SHEET.CUSTOMER,
  /* ชุด B — ทะเบียน ตัวนับ และบันทึกประวัติ (SPEC 22.4) */
  SHEET.USER_ROLE,
  SHEET.SESSION_TOKEN,
  SHEET.COUNTER,
  SHEET.AUDIT_LOG,
  SHEET.SYSTEM_LOG,
  SHEET.FILE_INDEX,
  /* ชุด C — ตารางธุรกรรม สี่ตารางนี้อ้างอิงกันตลอดเวลา จึงต้องย้ายพร้อมกัน (SPEC 22.4) */
  SHEET.WORK_ORDER,
  SHEET.DEPARTMENT_TASK,
  SHEET.TASK_STEP,
  SHEET.PROJECT_LOCATION
]);

/**
 * เพดานความยาวของ URL ที่ยิงออกไปได้ (ตัวอักษร) — กฎข้อ 29
 *
 * `UrlFetchApp` ปฏิเสธคำขอที่ URL ยาวเกินไปด้วยข้อความ
 * `Limit Exceeded: URLFetch URL Length.` ซึ่ง **ไม่บอกเลยว่าคำขอไหน ตารางไหน
 * หรือยาวเท่าไร** · เราจึงต้องวัดเองก่อนยิง แล้วโยนข้อความที่ตามต่อได้
 *
 * **วัดจากของจริงแล้วเมื่อ 24 ก.ย. 2026 ด้วย `probeUrlLimit()`**
 * ยาว 2,082 ตัวอักษรยังยิงออกไปได้ · 2,083 ตัวอักษรถูกปฏิเสธตั้งแต่ยังไม่ออกจากเครื่อง
 * เพดานจึงคมพอดีหนึ่งตัวอักษร ไม่ใช่ช่วงที่ค่อย ๆ เสื่อม
 *
 * ตั้งไว้ต่ำกว่าที่วัดได้ราว 10% (2082 - 10% = 1873) เพราะสองเหตุผล
 *   เพดานนี้เป็นของ Apps Script ฝั่งผู้เรียก ไม่ใช่ของ Supabase จึงใช้กับทุกคำขอ
 *   ไม่ว่าจะยิงไปที่ไหน รวมทั้ง Telegram ซึ่งที่อยู่พื้นฐานยาวไม่เท่ากัน
 *   และเราไม่อยากยืนอยู่ขอบเหว — คำขอที่ยาว 2,080 วันนี้จะยาวเกินทันทีที่มีใคร
 *   เพิ่มพารามิเตอร์อีกตัวเดียว แล้วอาการจะไปโผล่บนของจริงเท่านั้น
 *
 * วัดใหม่ได้เสมอด้วย `probeUrlLimit()` ซึ่งเทียบค่านี้กับของจริงให้ด้วยทุกครั้ง
 */
var HTTP_MAX_URL_LENGTH = 1873;

/**
 * คอลัมน์ที่เก็บเป็นชนิด `date` คือวันที่ล้วนที่คนเลือกเอง (กฎข้อ 23)
 *
 * PostgREST คืนค่าเป็น 'YYYY-MM-DD' ซึ่งใส่ `input type="date"` ได้ตรง ๆ
 * ห้ามแปลงเป็น Date แล้วแปลงกลับ เพราะ `toISOString()` จะย้ายไปเวลา UTC
 * แล้ววันที่เลื่อนไปหนึ่งวันสำหรับทุกค่าที่อยู่ก่อนเจ็ดโมงเช้าตามเวลาไทย
 *
 * จึงไม่อยู่ใน DB_TIMESTAMP_COLUMNS โดยตั้งใจ — สองรายการนี้ต้องไม่ทับกันเด็ดขาด
 */
var DB_DATE_ONLY_COLUMNS = Object.freeze(['Start_Contact_Date', 'Due_Date']);

/**
 * คอลัมน์ที่เก็บเป็น timestamptz ในฐานข้อมูล (กฎข้อ 23)
 *
 * PostgREST คืนค่าของคอลัมน์ชนิดนี้เป็นข้อความ ISO เช่น "2026-09-24T03:27:49.123+00:00"
 * ส่วนชีตเคยคืนเป็นวัตถุ Date · ถ้าปล่อยให้ต่างกัน ทุกที่ที่เทียบเวลาจะเปลี่ยนพฤติกรรม
 * พร้อมกันทั้งระบบ และอาการที่อันตรายที่สุดคือ **โทเคนที่ควรหมดอายุแล้วยังใช้ได้**
 * เพราะการเทียบข้อความไม่ได้แปลว่าการเทียบเวลา
 *
 * จึงแปลงกลับเป็น Date ตอนอ่านที่ fromDb_ ที่เดียว ผู้เรียกทุกคนตั้งแต่ชั้น Repo
 * ขึ้นไปจึงได้ชนิดเดิมเป๊ะ และไม่ต้องรู้ว่าข้อมูลย้ายไปไหน
 *
 * **ห้ามใส่ Start_Date กับ End_Date ในรายการนี้** — สองตัวนั้นเป็นเวลานัดหมายที่เก็บ
 * เป็นข้อความ 'YYYY-MM-DDTHH:mm' ตามที่ผู้ใช้เห็นบนจอ ไม่ใช่จุดเวลาบนแกนเวลาโลก
 * และ Start_Contact_Date กับ Due_Date เป็นชนิด date ซึ่งคืนมาเป็น 'YYYY-MM-DD' อยู่แล้ว
 */
var DB_TIMESTAMP_COLUMNS = Object.freeze([
  'Created_Date', 'Updated_Date', 'Submitted_Date', 'Approved_Date', 'Returned_Date',
  'Payment_Date', 'Assigned_Date', 'Accepted_Date', 'Completed_Date', 'Uploaded_Date',
  'Issued_Date', 'Expires_Date', 'Last_Used_Date', 'Locked_Until', 'Timestamp',
  /*
   * Reopened_Date และ Closed_Date เป็นเวลาที่ระบบบันทึกเอง ไม่ใช่เวลานัดหมายที่คนกรอก
   * จึงเป็น timestamptz ต่างจาก Start_Date / End_Date / Visit_* (กฎข้อ 18 · 23)
   */
  'Reopened_Date', 'Closed_Date'
]);

/**
 * คอลัมน์นี้เก็บเป็นจุดเวลาจริงหรือไม่
 * @param {string} systemName ชื่อคอลัมน์ในระบบ
 * @return {boolean}
 */
function isTimestampColumn_(systemName) {
  return DB_TIMESTAMP_COLUMNS.indexOf(systemName) !== -1;
}

/**
 * แท็บที่จำนวนแถวโตได้เรื่อย ๆ — ห้ามอ่านทั้งตาราง (กฎข้อ 28)
 *
 * ตารางเล็กที่คนเพิ่มด้วยมือ เช่น Request_Type หรือ User_Role อ่านทั้งตารางแล้ว
 * แคชไว้เป็นวิธีที่ถูกที่สุด · แต่ตารางในรายการนี้โตตามการใช้งานจริง การอ่านทั้งตาราง
 * จึงแพงขึ้นทุกวันและจะชนเพดาน 1,000 แถวของ PostgREST โดยไม่มีอะไรฟ้อง
 *
 * `findBy_` ดูรายการนี้เพื่อตัดสินว่าจะให้ฐานข้อมูลกรองให้ หรือจะคัดจากภาพที่แคชไว้
 * Audit_Log จะข้ามหนึ่งพันแถวเร็วที่สุด ประมาณเดือนแรกของการใช้งานจริง
 */
var DB_LARGE_SHEETS = Object.freeze([
  SHEET.CUSTOMER,
  SHEET.AUDIT_LOG,
  SHEET.SYSTEM_LOG,
  SHEET.FILE_INDEX,
  SHEET.SESSION_TOKEN,
  /* ชุด C — โตตามจำนวนใบงานที่เปิดจริง ซึ่งคือสิ่งที่ระบบนี้มีไว้ทำ */
  SHEET.WORK_ORDER,
  SHEET.DEPARTMENT_TASK,
  SHEET.TASK_STEP,
  SHEET.PROJECT_LOCATION
]);

/**
 * แท็บนี้โตได้จนต้องกรองที่ฐานข้อมูลหรือไม่
 * @param {string} sheetName ชื่อแท็บ
 * @return {boolean}
 */
function isLargeDbSheet_(sheetName) {
  return DB_LARGE_SHEETS.indexOf(sheetName) !== -1;
}

/**
 * เพดานจำนวนแถวของการอ่านแบบมีเงื่อนไขหนึ่งครั้ง (กฎข้อ 28)
 *
 * ใบงานหนึ่งใบมีประวัติราวสิบถึงร้อยแถว มีไฟล์แนบไม่เกินหลักสิบ และผู้ใช้หนึ่งคน
 * มีโทเคนไม่กี่ใบ · ห้าร้อยจึงกว้างกว่าของจริงหลายเท่า และยังต่ำกว่าเพดาน 1,000
 * ของ PostgREST อยู่มาก · ที่สำคัญกว่าตัวเลขคือ **ต้องมีเพดานติดไปกับคำขอเสมอ**
 * และต้องรู้ตัวเมื่อชน ซึ่ง queryRows_ ขอเกินมาหนึ่งแถวเพื่อตรวจข้อนั้นโดยเฉพาะ
 */
var DB_ROWS_PER_ENTITY = 500;

/** คอลัมน์ Primary Key ของแต่ละแท็บ (SPEC 13) */
var SHEET_KEY_FIELD = Object.freeze({
  'WorkOrder':          'WO_ID',
  'Department_Task':    'Task_ID',
  'Task_Step':          'Step_ID',
  'Project_Location':   'PJ_ID',
  'File_Index':         'File_ID',
  'Counter':            'Key',
  'Report_Master':      'Report_Code',
  'Attachment_Topic':   'Topic_ID',
  'Task_Step_Template': 'Template_ID',
  'Request_Type':       'Request_ID',
  'Notify_Channel':     'Channel_ID',
  'User_Role':          'Email',
  'Session_Token':      'Token_Hash',
  'Audit_Log':          'Log_ID',
  'System_Log':         'Log_ID'
});

/**
 * คอลัมน์ที่ใช้ทำ Soft Delete ของแต่ละแท็บ (SPEC D-8 — ห้ามลบแถวจริง)
 * ชื่อคอลัมน์ไม่เหมือนกันทุกแท็บตาม SPEC 13: File_Index ใช้ Is_Active
 * ส่วนตารางทะเบียนและ Master ใช้ Active
 * แท็บที่ไม่มีในตารางนี้ (WorkOrder / Department_Task / Task_Step / Counter)
 * ไม่มีคอลัมน์สถานะใช้งานโดยตั้งใจ เพราะไม่มีการลบในเชิงธุรกิจ —
 * WO ที่ต้องยกเลิกให้ใช้ CANCEL_WO และ Task ให้ใช้ TASK_CANCEL แทน
 */
var SHEET_ACTIVE_FIELD = Object.freeze({
  'File_Index':         'Is_Active',
  'Project_Location':   'Active',
  'Attachment_Topic':   'Active',
  'Report_Master':      'Active',
  'Task_Step_Template': 'Active',
  'Request_Type':       'Active',
  'Notify_Channel':     'Active',
  'User_Role':          'Active',
  'Session_Token':      'Active'
});

/**
 * จำนวนรายชื่อลูกค้าสูงสุดที่การค้นหนึ่งครั้งคืนกลับไป (SPEC 11)
 *
 * ต้องเป็นค่าเดียวกันทั้งฝั่งที่ถามฐานข้อมูลและฝั่งที่คัดรอบสุดท้าย ถ้าสองฝั่ง
 * ถือคนละตัวเลข ฝั่งที่น้อยกว่าจะกลายเป็นเพดานจริงโดยที่ไม่มีใครตั้งใจ
 */
var CUSTOMER_SEARCH_LIMIT = 20;

/**
 * ชื่อคอลัมน์ในชีต Customer ที่ผู้ใช้อัปโหลดเอง (SPEC 11, 13)
 * เป็นภาษาไทยตามที่ระบุไว้ และระบบอ่านโดยอ้างอิงชื่อหัวคอลัมน์ ไม่ผูกกับตำแหน่ง
 * จึงเพิ่ม สลับ หรือลบคอลัมน์อื่นในชีตนั้นได้โดยระบบไม่พัง
 */
var CUSTOMER_FIELD = Object.freeze({
  NAME:       'ชื่อลูกค้า',
  CODE:       'รหัสลูกค้า',
  SALES:      'พนักงานขาย',
  START_DATE: 'วันที่เริ่มติดต่อ'
});

/**
 * คอลัมน์ของใบงานที่หน้าสร้าง / แก้ไขกรอกได้ จัดกลุ่มตามการ์ดใน SPEC หัวข้อ 9.3
 *
 * ชั้น Service ใช้รายการนี้กรองข้อมูลที่รับมาจากหน้าเว็บ คอลัมน์ที่ไม่อยู่ในนี้
 * (เช่น Overall_Status, Approved_By, Return_Count) จึงไม่มีทางถูกเขียนจากฟอร์ม
 * ชื่อทุกตัวต้องตรงกับ SPEC หัวข้อ 13 และ 9.3 ห้ามตั้งเอง (กฎข้อ 15)
 */
var WO_FORM_FIELDS = Object.freeze([
  // การ์ด: ข้อมูลลูกค้า
  'Customer_Name', 'Customer_Code', 'Sales_Person', 'Start_Contact_Date', 'Contact', 'Phone',
  // การ์ด: สถานที่และโครงการ (PJ_ID ระบบออกให้ ไม่ได้รับจากฟอร์ม)
  'Project', 'Location',
  // การ์ด: รายละเอียดของงาน
  'Assignment_Type', 'Request_Types', 'Job_Description', 'Product_Detail', 'Work_Scope', 'Reference_Doc',
  // การ์ด: กำหนดการ
  'Start_Date', 'End_Date', 'Duration_Days',
  // การ์ด: หมายเหตุ
  'Remark',
  // กลุ่มการชำระเงิน (SPEC 12)
  'Payment_Required'
]);

/**
 * ชื่อภาษาไทยของฟิลด์บนหน้าจอ ตามตารางใน SPEC หัวข้อ 9.3
 * ใช้ตอนบอกผู้ใช้ว่ากรอกอะไรไม่ครบ — ห้ามโชว์ชื่อคอลัมน์ภาษาอังกฤษให้ผู้ใช้เห็น (SPEC 17.3)
 */
var WO_FIELD_TH = Object.freeze({
  'Customer_Name':      'ชื่อลูกค้า',
  'Customer_Code':      'รหัสลูกค้า',
  'Sales_Person':       'พนักงานขาย',
  'Start_Contact_Date': 'วันที่เริ่มติดต่อ',
  'Contact':            'ชื่อผู้ติดต่อ',
  'Phone':              'โทรศัพท์',
  'Project':            'โครงการ',
  'Location':           'สถานที่',
  'PJ_ID':              'รหัสสถานที่',
  'Assignment_Type':    'สายงาน',
  'Request_Types':      'สิ่งที่ต้องการ',
  'Job_Description':    'ลักษณะงานที่ทำ หรืออาการ',
  'Product_Detail':     'รายละเอียดของสินค้า',
  'Work_Scope':         'ขอบเขตของงาน ตำแหน่ง สถานที่',
  'Reference_Doc':      'เอกสารอ้างอิง',
  'Start_Date':         'กำหนดเข้างาน',
  'End_Date':           'กำหนดออกงาน',
  'Duration_Days':      'ขอบเขตวันการทำงาน',
  'Visit_Start':        'วันเวลาที่แผนกเข้างาน',
  'Visit_End':          'วันเวลาที่แผนกออกงาน',
  'Remark':             'หมายเหตุ',
  'Created_By':         'ผู้แจ้งงาน',
  'Created_Date':       'วันที่แจ้ง',
  'Payment_Required':   'ต้องชำระเงินก่อนเริ่มงาน',
  'Reopen_Count':       'จำนวนครั้งที่เปิดงานใหม่',
  'Reopen_Reason':      'เหตุผลการเปิดงานใหม่',
  'Reopened_By':        'ผู้เปิดงานใหม่',
  'Reopened_Date':      'วันที่เปิดงานใหม่',
  'Closed_Date':        'วันที่ปิดงาน'
});

/** ชื่อภาษาไทยของสถานะใบงาน (SPEC 4.1) — ตารางแปลตัวเดียวของทั้งระบบ */
var WO_STATUS_TH = Object.freeze({
  'PENDING_APPROVE': 'รออนุมัติ',
  'RETURNED':        'ตีกลับให้แก้ไข',
  'APPROVED':        'อนุมัติแล้ว',
  'IN_PROGRESS':     'กำลังดำเนินการ',
  'COMPLETED':       'เสร็จสิ้น',
  'CANCELLED':       'ยกเลิก'
});

/** ชื่อภาษาไทยของสถานะงานแผนก (SPEC 4.2) */
var TASK_STATUS_TH = Object.freeze({
  'PENDING_ACCEPT': 'รอแผนกรับงาน',
  'IN_PROGRESS':    'กำลังดำเนินการ',
  'COMPLETED':      'เสร็จสิ้น',
  'RETURNED':       'ตีกลับ',
  'CANCELLED':      'ยกเลิก'
});

/** ชื่อภาษาไทยของแผนกผู้รับงาน (SPEC 3) */
var ASSIGNMENT_TH = Object.freeze({
  'SERVICE':         'แผนก Service',
  'PROJECT':         'แผนก Project',
  'SERVICE_PROJECT': 'แผนก Service และ Project',
  'LAB':             'แผนก Lab',
  'UNSPECIFIED':     'ยังไม่ระบุว่า Service หรือ Project'
});

/** ชื่อภาษาไทยของสถานะการชำระเงิน (SPEC 12) */
var PAYMENT_TH = Object.freeze({
  'UNPAID': 'ยังไม่ชำระ',
  'PAID':   'ชำระแล้ว'
});

/** ชื่อภาษาไทยของสายอนุมัติ (SPEC 3) */
var ROUTE_TH = Object.freeze({
  'SP':  'สาย Service / Project',
  'LAB': 'สาย Lab'
});

/** ชื่อภาษาไทยของบทบาทผู้ใช้ (SPEC 2) */
var ROLE_TH = Object.freeze({
  'ADMIN':        'ธุรการ',
  'SALE':         'ฝ่ายขาย',
  'APPROVER_SP':  'ผู้อนุมัติสาย Service / Project',
  'APPROVER_LAB': 'ผู้อนุมัติสาย Lab',
  'SERVICE':      'แผนก Service',
  'PROJECT':      'แผนก Project',
  'LAB':          'แผนก Lab'
});

/** ชื่อภาษาไทยของการกระทำ (SPEC 5) — ใช้ในข้อความบอกผู้ใช้ว่าทำอะไรไม่ได้ */
var ACTION_TH = Object.freeze({
  'CREATE':        'สร้าง',
  'EDIT':          'แก้ไข',
  'SUBMIT':        'ส่งขออนุมัติ',
  'ACCEPT':        'อนุมัติ',
  'RETURN':        'ตีกลับ',
  'CANCEL_WO':     'ยกเลิกใบงาน',
  'TASK_ACCEPT':   'กดรับงาน',
  'TASK_UPDATE':   'อัปเดตงาน',
  'TASK_COMPLETE': 'ปิดงาน',
  'TASK_RETURN':   'ตีกลับงาน',
  'TASK_CANCEL':   'ยกเลิกงานของแผนก',
  'REOPEN':        'เปิดงานใหม่',
  'RECALC':        'คำนวณสถานะใหม่'
});

/**
 * ระดับความสำคัญของบรรทัดใน System_Log (SPEC 13)
 *   INFO   เรื่องปกติที่อยากรู้ย้อนหลัง เช่น ใครเข้าระบบ
 *   WARN   ผิดปกติแต่ระบบยังทำงานต่อได้ เช่น รหัสผ่านผิด บัญชีถูกล็อก
 *   ERROR  ทำงานนั้นไม่สำเร็จจริง ๆ เช่น ส่งแจ้งเตือนไม่ออก ออกเอกสารไม่ได้
 */
var LOG_LEVEL = Object.freeze({
  INFO:  'INFO',
  WARN:  'WARN',
  ERROR: 'ERROR'
});

/**
 * ต้นทางของบรรทัดใน System_Log — ใช้ได้เฉพาะ 4 ค่านี้เท่านั้น (SPEC 13)
 *
 * จำกัดไว้เพื่อให้กรองในชีตได้จริง ถ้าปล่อยให้แต่ละจุดพิมพ์ข้อความสดของตัวเอง
 * ไม่นานจะมีทั้ง 'auth' 'Auth' และ 'login' ปนกัน แล้วการกรองจะใช้ไม่ได้อีกเลย
 */
var LOG_SOURCE = Object.freeze({
  AUTH:       'AUTH',        // การเข้าสู่ระบบและบัญชีผู้ใช้
  NOTIFY:     'NOTIFY',      // การแจ้งเตือน Telegram
  REPORT:     'REPORT',      // การออกใบสั่งงาน PDF
  PERMISSION: 'PERMISSION',  // สิทธิ์เข้าถึงชีตและ Drive
  DATABASE:   'DATABASE'     // การคุยกับ Supabase (SPEC 22) — ที่เก็บข้อมูลใหม่
});

/**
 * เหตุการณ์ที่ถือเป็น "เรื่องของระบบ" ไม่ใช่ "สิ่งที่เกิดกับใบงาน" (SPEC 13)
 *
 * รายการนี้คือครึ่งแรกของเงื่อนไขแยกตาราง (อีกครึ่งคือ "ไม่มีเลขที่ใบงานติดมา")
 * ดู isSystemLogRecord_() ใน 08_Audit.gs ซึ่งเป็นที่เดียวที่ตัดสิน
 *
 * ที่ต้องมีรายการนี้ ทั้งที่มีเงื่อนไข "ไม่มี WO_ID" อยู่แล้ว เพราะสามเหตุการณ์
 * NOTIFY_FAILED · REPORT_FAILED · CHANNEL_FIXED มีเลขที่ใบงานติดมาด้วยก็จริง
 * แต่มันเป็นเรื่องของระบบ ไม่ใช่เรื่องที่เกิดกับใบงาน — ใบงานไม่ได้เปลี่ยนอะไรเลย
 * และเป็นบรรทัดที่ผู้ดูแลต้องกวาดสายตาหาทีเดียวทั้งระบบ ไม่ใช่ไล่ดูทีละใบ
 */
var SYSTEM_LOG_EVENT = Object.freeze({
  'LOGIN':           { source: LOG_SOURCE.AUTH,       level: LOG_LEVEL.INFO },
  'LOGIN_FAILED':    { source: LOG_SOURCE.AUTH,       level: LOG_LEVEL.WARN },
  'ACCOUNT_LOCKED':  { source: LOG_SOURCE.AUTH,       level: LOG_LEVEL.WARN },
  'LOGOUT':          { source: LOG_SOURCE.AUTH,       level: LOG_LEVEL.INFO },
  'FORCE_LOGOUT':    { source: LOG_SOURCE.AUTH,       level: LOG_LEVEL.WARN },
  'PASSWORD_CHANGE': { source: LOG_SOURCE.AUTH,       level: LOG_LEVEL.INFO },
  'PASSWORD_RESET':  { source: LOG_SOURCE.AUTH,       level: LOG_LEVEL.WARN },
  'ADMIN_CREATED':   { source: LOG_SOURCE.AUTH,       level: LOG_LEVEL.WARN },
  'BACKUP_OK':       { source: LOG_SOURCE.DATABASE,   level: LOG_LEVEL.INFO },
  'BACKUP_FAILED':   { source: LOG_SOURCE.DATABASE,   level: LOG_LEVEL.ERROR },
  'BACKUP_RESTORED': { source: LOG_SOURCE.DATABASE,   level: LOG_LEVEL.WARN },
  'NOTIFY_FAILED':   { source: LOG_SOURCE.NOTIFY,     level: LOG_LEVEL.ERROR },
  'CHANNEL_FIXED':   { source: LOG_SOURCE.NOTIFY,     level: LOG_LEVEL.WARN },
  'REPORT_FAILED':   { source: LOG_SOURCE.REPORT,     level: LOG_LEVEL.ERROR },
  'ACCESS_DENIED':   { source: LOG_SOURCE.PERMISSION, level: LOG_LEVEL.ERROR },
  'AUTH_REQUIRED':   { source: LOG_SOURCE.PERMISSION, level: LOG_LEVEL.ERROR },
  'DB_FAILED':       { source: LOG_SOURCE.DATABASE,   level: LOG_LEVEL.ERROR },
  'DB_TRUNCATED':    { source: LOG_SOURCE.DATABASE,   level: LOG_LEVEL.WARN }
});

/**
 * แปลค่าเป็นภาษาไทยจากตารางที่กำหนด ถ้าไม่มีในตารางให้คืนค่าเดิม
 * @param {Object} table ตารางแปลจากด้านบน
 * @param {*} value ค่าที่ต้องการแปล
 * @return {string}
 */
function toThai_(table, value) {
  if (value === null || value === undefined || value === '') return '';
  var key = String(value);
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;
}

/**
 * ชื่อภาษาไทยของสถานะใบงาน
 * @param {string} status ค่าจาก WO_STATUS
 * @return {string}
 */
function woStatusLabel(status) {
  return toThai_(WO_STATUS_TH, status);
}

/**
 * ชื่อภาษาไทยของฟิลด์บนหน้าจอ
 * @param {string} field ชื่อคอลัมน์ในชีต
 * @return {string}
 */
function fieldLabel(field) {
  return toThai_(WO_FIELD_TH, field);
}

/**
 * ห้อง Telegram ปลายทาง — ค่าที่ต้องกรอกในคอลัมน์ Target ของตาราง Notify_Channel
 *
 * เก็บเป็นชื่อกลุ่มผู้รับ ไม่ใช่ Chat ID เพราะ Chat ID ต้องแก้ได้จากชีตโดยไม่ต้องแตะโค้ด
 * ห้องหนึ่งมีได้หลายแถว (เช่นย้ายห้องใหม่แล้วยังอยากส่งห้องเก่าชั่วคราว) ระบบส่งทุกแถวที่ Active
 *
 * @see SPEC 15.3 ตารางว่าเหตุการณ์ไหนเข้าห้องไหน
 */
var NOTIFY_TARGET = Object.freeze({
  ADMIN:        'ADMIN',          // ธุรการและฝ่ายขาย — ห้องที่รู้ทุกความเคลื่อนไหว
  APPROVER_SP:  'APPROVER_SP',    // ผู้อนุมัติสาย Service / Project
  APPROVER_LAB: 'APPROVER_LAB',   // ผู้อนุมัติสาย Lab
  SERVICE:      'SERVICE',        // ห้องแผนก Service
  PROJECT:      'PROJECT',        // ห้องแผนก Project
  LAB:          'LAB'             // ห้องแผนก Lab
});

/** คอลัมน์ที่เก็บสถานะของแต่ละ Entity (SPEC 13) — ใช้ตอนเขียนสถานะผ่าน changeStatus() */
var STATUS_FIELD = Object.freeze({
  'WO':   'Overall_Status',
  'TASK': 'Status'
});

/** คอลัมน์มาตรฐานที่ชั้น Repo เติมค่าให้เองเมื่อแท็บนั้นมีคอลัมน์ดังกล่าว */
var COL = Object.freeze({
  CREATED_BY:   'Created_By',
  CREATED_DATE: 'Created_Date',
  UPDATED_BY:   'Updated_By',
  UPDATED_DATE: 'Updated_Date'
});

/**
 * คีย์ใน Script Properties — ห้ามใส่ค่าจริงในโค้ดหรือไฟล์ .html เด็ดขาด (SPEC 21)
 * ตั้งค่าที่ ตัวแก้ไข Apps Script > Project Settings > Script Properties
 * ไฟล์ฐานข้อมูลหลักไม่ต้องมีคีย์ เพราะสคริปต์ผูกกับชีตอยู่แล้ว ใช้ getDb_()
 */
/* ---------------------------------------------------------------------------
 * สิทธิ์ที่ระบบขอจากผู้ใช้ (oauthScopes)
 *
 * appsscript.json เป็นไฟล์ JSON จึงใส่คำอธิบายไว้ในนั้นไม่ได้ เหตุผลของทุกบรรทัด
 * จึงอยู่ที่นี่ และสองฝั่งต้องตรงกันเป๊ะ — มีเทสต์เทียบให้ (test_config_oauthScopes)
 *
 * ทำไมต้องประกาศเอง ทั้งที่ Apps Script เดาให้ได้
 *   เพราะการเดาให้จะเกิดตอน "ขออนุญาตครั้งใหม่" เท่านั้น ระบบที่ถูกอนุญาตไปแล้ว
 *   จะยังทำงานด้วยสิทธิ์ชุดเดิม พอเพิ่มบริการใหม่เข้าโค้ด มันจะพังเงียบ ๆ ตอนใช้งานจริง
 *   ด้วยข้อความ "ไม่ได้รับอนุญาตให้เรียกใช้ ..." ซึ่งไม่มีทางเห็นตอนเขียนโค้ดเลย
 *   การประกาศเองทำให้รายการนี้ถูกตรวจได้ และเห็นได้ว่าระบบขออะไรจากผู้ใช้บ้าง
 *
 * เพิ่มบริการใหม่เมื่อไร ต้องทำสามอย่างเสมอ
 *   1) เติมสิทธิ์ที่นี่และใน appsscript.json
 *   2) เปิดตัวแก้ไข Apps Script กดรันฟังก์ชันอะไรก็ได้หนึ่งครั้ง แล้วกดอนุญาตใหม่
 *   3) Deploy เวอร์ชันใหม่ · ข้ามข้อ 2 แล้วจะยังพังเหมือนเดิมทุกประการ
 * --------------------------------------------------------------------------- */

/**
 * สิทธิ์ทั้งหมดที่ระบบขอ ต้องตรงกับ oauthScopes ใน appsscript.json
 * @return {string[]}
 */
function requiredOAuthScopes_() {
  return [
    // อ่านเขียนชีตของระบบ และไฟล์ Audit_Log ที่แยกออกไปอีกไฟล์ (SPEC D-5)
    // ต้องเป็น spreadsheets ไม่ใช่ spreadsheets.currentonly เพราะเปิดไฟล์อื่นด้วยรหัส
    'https://www.googleapis.com/auth/spreadsheets',
    // สร้างโฟลเดอร์ของใบงาน เก็บไฟล์แนบ และเก็บใบสั่งงาน PDF (SPEC 16)
    'https://www.googleapis.com/auth/drive',
    // คัดลอกแม่แบบ Google Docs แล้วแทนค่าเพื่อออกใบสั่งงาน (SPEC 16.1)
    'https://www.googleapis.com/auth/documents',
    // อ่านอีเมลของบัญชีที่กดรันจากตัวแก้ไข ใช้แยก "คนกดรันเอง" ออกจากคำขอของหน้าเว็บ
    'https://www.googleapis.com/auth/userinfo.email',
    /*
     * ยิงคำขอออกไปนอกระบบ — ยังไม่มีโค้ดตัวไหนใช้ตอนนี้
     *
     * ประกาศไว้ล่วงหน้าโดยตั้งใจ เพราะการแจ้งเตือน Telegram (SPEC 15) จะใช้ตัวนี้
     * และการเพิ่มสิทธิ์ทีหลังบังคับให้เจ้าของระบบต้องกดอนุญาตใหม่กับ deploy ใหม่อีกรอบ
     * ใส่ไว้ตอนนี้จึงจบในการอนุญาตครั้งเดียว ไม่ใช่สองครั้ง
     *
     * ตัวนี้เป็นข้อยกเว้นเดียวที่ "ประกาศแต่ยังไม่ได้ใช้" และมีชื่ออยู่ในเทสต์ว่าตั้งใจ
     */
    'https://www.googleapis.com/auth/script.external_request',

    /*
     * จัดการทริกเกอร์ตามเวลา — ใช้โดยการสำรองข้อมูลรายสัปดาห์เท่านั้น (SPEC 22.6)
     *
     * แผนฟรีของ Supabase ไม่สำรองข้อมูลให้ เราจึงต้องตั้งงานสำรองเอง และ ScriptApp
     * คือทางเดียวบน Apps Script ที่ทำได้ · `setupBackupTrigger()` ใน 98_Backup.gs
     * เป็นที่เดียวที่สร้างทริกเกอร์ และ test_notify_noOverdueEvent เฝ้าไว้ไม่ให้มีที่สอง
     */
    'https://www.googleapis.com/auth/script.scriptapp'
  ];
}

/**
 * บริการของ Google ที่โค้ดเรียกได้ กับสิทธิ์ที่แต่ละตัวต้องมี
 *
 * คีย์คือข้อความที่ค้นเจอในโค้ดจริง บางตัวเจาะจงถึงระดับเมธอด เพราะบริการเดียวกัน
 * ต้องการสิทธิ์ต่างกันตามสิ่งที่เรียก เช่น ScriptApp.getService() ไม่ต้องขอสิทธิ์อะไรเลย
 * แต่การสร้างทริกเกอร์ต้องขอ
 *
 * @return {Object} แผนที่ชื่อที่ค้นในโค้ด -> สิทธิ์ที่ต้องมี
 */
function oauthScopeOfService_() {
  return {
    'SpreadsheetApp':              'https://www.googleapis.com/auth/spreadsheets',
    'DriveApp':                    'https://www.googleapis.com/auth/drive',
    'DocumentApp':                 'https://www.googleapis.com/auth/documents',
    'UrlFetchApp':                 'https://www.googleapis.com/auth/script.external_request',
    'Session.getActiveUser':       'https://www.googleapis.com/auth/userinfo.email',
    'Session.getEffectiveUser':    'https://www.googleapis.com/auth/userinfo.email',
    'ScriptApp.newTrigger':        'https://www.googleapis.com/auth/script.scriptapp',
    'ScriptApp.deleteTrigger':     'https://www.googleapis.com/auth/script.scriptapp',
    'ScriptApp.getProjectTriggers':'https://www.googleapis.com/auth/script.scriptapp',
    'MailApp':                     'https://www.googleapis.com/auth/script.send_mail',
    'GmailApp':                    'https://mail.google.com/',
    'CalendarApp':                 'https://www.googleapis.com/auth/calendar',
    'FormApp':                     'https://www.googleapis.com/auth/forms',
    'SlidesApp':                   'https://www.googleapis.com/auth/presentations'
  };
}

/**
 * บริการที่เรียกได้โดยไม่ต้องขอสิทธิ์ใด ๆ
 *
 * ต้องจดไว้ให้ครบเหมือนกัน ไม่ใช่ปล่อยว่าง เพราะเทสต์ใช้รายการนี้ยืนยันว่า
 * "ทุกบริการที่โค้ดเรียก ถูกจัดประเภทแล้ว" ใครเรียกบริการใหม่ที่ไม่มีใครเคยจัดประเภท
 * จะแดงทันที แทนที่จะเงียบไปจนเจอตอนผู้ใช้กดใช้งานจริง
 *
 * @return {string[]}
 */
function oauthFreeServices_() {
  return [
    'PropertiesService',   // Script Properties — ไม่ต้องขอสิทธิ์
    'CacheService',        // แคชชั่วคราว
    'LockService',         // ล็อกกันเขียนชนกัน
    'HtmlService',         // ประกอบหน้าเว็บ
    'ContentService',      // ตอบกลับเป็นข้อความหรือ JSON (ทางเข้าเก่าจากโปรเจกต์หน้าบ้าน)
    'Utilities',           // เข้ารหัส แปลงวันที่ แปลง base64
    'Logger',              // บันทึกข้อความตอนไล่ปัญหา
    'Session.getScriptTimeZone',   // เขตเวลาของสคริปต์ ไม่ใช่ข้อมูลของผู้ใช้
    'ScriptApp.getService'         // ที่อยู่ของเว็บแอปตัวเอง
  ];
}

var PROP_KEY = Object.freeze({
  AUDIT_SHEET_ID:     'AUDIT_SHEET_ID',        // ไฟล์ Audit_Log ที่แยกออกมา (SPEC D-5)
  DRIVE_ROOT_FOLDER:  'DRIVE_ROOT_FOLDER_ID',
  // แม่แบบ Google Docs ของใบสั่งงาน (SPEC 16.1) — ผู้ดูแลสร้างเองแล้วเอารหัสมาใส่
  // เก็บเป็นรหัสไฟล์ ไม่ใช่ชื่อ เพราะชื่อซ้ำกันได้และเปลี่ยนได้ตลอด (SPEC 21)
  WO_REPORT_TEMPLATE: 'WO_REPORT_TEMPLATE_ID',
  TELEGRAM_BOT_TOKEN: 'TELEGRAM_BOT_TOKEN',
  WEBAPP_URL:         'WEBAPP_URL',
  // ที่อยู่โปรเจกต์ Supabase เช่น https://abcdefgh.supabase.co (ไม่มี /rest/v1 ต่อท้าย)
  SUPABASE_URL:         'SUPABASE_URL',
  // คีย์ service_role — ข้าม RLS ได้ทั้งฐานข้อมูล (กฎข้อ 22)
  // อยู่ใน Script Properties เท่านั้น · ห้ามอยู่ใน .html ห้าม log ห้ามใส่ใน query string
  // ห้ามปนไปกับข้อความ error ที่คืนกลับหน้าเว็บ · รั่วครั้งเดียวต้องออกคีย์ใหม่ทั้งระบบ
  SUPABASE_SERVICE_KEY: 'SUPABASE_SERVICE_KEY',
  // คีย์ anon — ใช้เพื่อ "พิสูจน์ว่าอ่านอะไรไม่ได้" เท่านั้น (checkSupabase)
  // ถ้าวันหนึ่งคีย์นี้อ่านข้อมูลได้ แปลว่า RLS ไม่ทำงาน ซึ่งเป็นเรื่องใหญ่กว่าทุกเรื่อง
  SUPABASE_ANON_KEY:    'SUPABASE_ANON_KEY'
});

/**
 * คอลัมน์ที่เป็น "เวลานัดหมายที่คนกรอก" (กฎข้อ 18 · SPEC 19)
 *
 * ต่างจากเวลาที่เครื่องบันทึก (Created_Date, Updated_Date, Approved_Date, Timestamp)
 * ซึ่งใช้ ISO เต็มรูปแบบเพื่อให้เครื่องเปรียบเทียบได้ · ส่วนเวลานัดหมายเป็นเวลาหน้าปัด
 * ที่คนพูดกันว่า "เข้างาน 9 โมง" ถ้าแปลงผ่าน toISOString() จะกลายเป็นเวลา UTC
 * แล้วเด้งกลับมาผิด 7 ชั่วโมงตอนเอาไปใส่ช่องกรอกอีกครั้ง
 *
 * รายการนี้คือจุดเดียวของทั้งระบบที่รู้ว่าฟิลด์ไหนเป็นเวลานัดหมาย ห้ามไปเช็คชื่อฟิลด์ที่อื่นอีก
 */
var APPOINTMENT_FIELDS = Object.freeze(['Start_Date', 'End_Date', 'Visit_Start', 'Visit_End']);

/**
 * ฟิลด์นี้เป็นเวลานัดหมายหรือไม่
 * @param {string} field ชื่อคอลัมน์
 * @return {boolean}
 */
function isAppointmentField_(field) {
  return !!field && APPOINTMENT_FIELDS.indexOf(field) !== -1;
}

/** เขตเวลาและรูปแบบวันที่ที่ใช้ทั้งระบบ */
var TIMEZONE = 'Asia/Bangkok';
/*
 * รูปแบบวันที่ "สำหรับให้คนอ่าน" เท่านั้น (กฎข้อ 20) — dd-MM-yyyy ปี ค.ศ. เดือนเป็นตัวเลข
 * ห้ามเอาไปใช้กับค่าของ input type="date" / datetime-local (เบราว์เซอร์บังคับ yyyy-MM-dd)
 * และห้ามเอาไปใช้สร้างข้อมูล เช่นคีย์ใน Counter หรือเลขที่เอกสาร
 */
var DATE_FORMAT = 'dd-MM-yyyy';
var DATETIME_FORMAT = 'dd-MM-yyyy HH:mm';

/** รูปแบบเวลานัดหมายที่รับส่งกับหน้าเว็บ — ตรงกับค่าของ input type="datetime-local" */
var APPOINTMENT_FORMAT = "yyyy-MM-dd'T'HH:mm";

/**
 * แปลงเวลานัดหมายเป็นข้อความเวลาท้องถิ่นที่หน้าเว็บใส่กลับลงช่องกรอกได้ทันที
 * @param {Date} date เวลาจากชีต
 * @return {string} รูปแบบ YYYY-MM-DDTHH:mm
 */
function toAppointmentText_(date) {
  return Utilities.formatDate(date, TIMEZONE, APPOINTMENT_FORMAT);
}

/**
 * ค่าเวลานัดหมายในรูปที่ใส่ `input type="datetime-local"` ได้ทันที — รับได้ทุกชนิด
 *
 * ที่ต้องรับได้ทั้งข้อความและ Date เพราะที่เก็บของสองยุคให้คนละชนิด: ชีตคืนวัตถุ Date
 * ส่วน Postgres เก็บคอลัมน์นี้เป็นข้อความจึงคืนข้อความ (กฎข้อ 23) · ผู้เรียกทุกคน
 * ไม่ควรต้องรู้เรื่องนั้น และไม่ควรมีใครตัดสตริงเอง ซึ่งเป็นต้นเหตุของบั๊กเลื่อนวันที่
 *
 * ค่าที่ไม่ใช่รูปแบบนี้คืนค่าว่าง ไม่ใช่คืนของเดิมที่ผิดรูป เพราะช่องกรอกของเบราว์เซอร์
 * ที่ได้ค่าผิดรูปจะว่างเปล่าเงียบ ๆ อยู่ดี · คืนว่างตั้งแต่ต้นทางจึงตรงไปตรงมากว่า
 *
 * @param {Date|string} value ค่าเวลานัดหมาย
 * @return {string} 'YYYY-MM-DDTHH:mm' · ค่าว่างเมื่อไม่มีค่าหรือรูปแบบไม่ตรง
 */
function appointmentTextOf_(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : toAppointmentText_(value);

  var parts = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(
    String(value === null || value === undefined ? '' : value).trim());
  return parts ? (parts[1] + 'T' + parts[2] + ':' + parts[3]) : '';
}

/**
 * จัดรูปแบบเวลา "เพื่อให้คนอ่าน" — จุดเดียวของทั้งระบบ (กฎข้อ 19)
 *
 * ทุกที่ที่เอาเวลาไปแสดงให้คนอ่าน ต้องผ่านฟังก์ชันนี้: log, Audit_Log, ข้อความ Telegram
 * และข้อความใด ๆ ที่มนุษย์จะอ่าน · ห้ามจัดรูปแบบเวลาเองตามจุดต่าง ๆ เพราะจะมีสักจุด
 * ที่ลืมแปลงโซนเสมอ แล้วเวลาที่แสดงจะช้ากว่าความจริง 7 ชั่วโมงโดยไม่มีใครสังเกต
 *
 * ใช้โซนเวลาของสคริปต์ ไม่ใช่ค่าคงที่ TIMEZONE เพราะสิ่งที่ต้องการคือ "เวลาตามที่เครื่อง
 * ตัวนี้เข้าใจ" ถ้าโซนของสคริปต์ถูกตั้งผิด เวลาที่แสดงจะเพี้ยนพร้อมกันทั้งระบบ
 * ซึ่งสังเกตง่ายกว่าการเพี้ยนเฉพาะบางจุด และ test_timezone() มีไว้จับกรณีนั้นอยู่แล้ว
 *
 * สิ่งที่ฟังก์ชันนี้ "ไม่" เกี่ยวข้องด้วย เพราะเป็นข้อมูล ไม่ใช่การแสดงผล
 *   - ค่าที่เขียนลงชีต ยังเป็น Date จริงเหมือนเดิม
 *   - ค่าที่ใช้เทียบ Optimistic Lock ยังเป็น ISO เต็มรูปแบบพร้อมเศษมิลลิวินาที
 *   - เวลานัดหมาย Start_Date / End_Date ใช้ toAppointmentText_() ตามกฎข้อ 18
 *
 * @param {Date|string|number} value ค่าเวลา รับได้ทั้ง Date ข้อความ ISO และ timestamp
 * @return {string} 'yyyy-MM-dd HH:mm:ss' ตามเวลาไทย · คืนค่าว่างเมื่อไม่มีค่าหรือแปลงไม่ได้
 */
function formatForDisplay_(value) {
  var date = toDate_(value);
  // ไม่มีค่าหรือแปลงไม่ได้ ต้องได้ข้อความว่าง ไม่ใช่ "Invalid Date" หรือปี 1970
  // เพราะสองอย่างนั้นโผล่ไปถึงหน้าจอผู้ใช้แล้วดูเหมือนระบบมีข้อมูลผิด ทั้งที่แค่ยังไม่มีข้อมูล
  if (!date) return '';

  /*
   * จัดรูปแบบครั้งเดียวแล้วตัดเอาเท่าที่ต้องใช้ (กฎข้อ 20)
   *   มีเวลา      -> dd-MM-yyyy HH:mm
   *   วันที่ล้วน  -> dd-MM-yyyy
   * "วันที่ล้วน" ดูจากเวลาที่เป็นศูนย์ทั้งชั่วโมง นาที และวินาที ตามเขตเวลาของสคริปต์
   * ต้องดูวินาทีด้วย ไม่งั้นเวลา 00:00:30 จะถูกตัดเหลือแต่วันที่แล้วข้อมูลหายไปเงียบ ๆ
   */
  var text = Utilities.formatDate(date, Session.getScriptTimeZone(), DATE_FORMAT + ' HH:mm:ss');
  return (text.substring(11) === '00:00:00') ? text.substring(0, 10) : text.substring(0, 16);
}

/* ---------------------------------------------------------------------------
 * ขอบเขตวันการทำงาน (SPEC 9.2 · 13)
 *
 * **จุดประสงค์คือการตามงานย้อนหลัง ไม่ใช่การเตือน** Admin กรอกช่องนี้เฉพาะบางใบ
 * ที่รู้ว่ามีเงื่อนไข เช่นรอของแล้วไม่รู้วันแน่นอน จึงใส่ขอบเขตเผื่อไว้ แล้วกลับมาดู
 * ทีหลังว่าเลยกำหนดหรือยัง · ถ้าเลยแล้ว คำถามถัดไปคือ ทำไมช่างถึงยังไม่เข้าไปทำ
 *
 * ทั้งสามฟังก์ชันข้างล่างเป็นตรรกะล้วน รับค่าเข้ามาแล้วคืนค่าออกไป ไม่อ่านอะไรเลย
 * จึงเรียกได้จากทุกชั้นและทดสอบได้ตรง ๆ โดยไม่ต้องเตรียมข้อมูล
 * --------------------------------------------------------------------------- */

/**
 * วันที่ของเวลาหนึ่ง **ตามเวลาไทย** ในรูป 'YYYY-MM-DD'
 *
 * ต้องใช้ตัวนี้เสมอ ห้ามตัด `toISOString()` มาใช้แทน · ใบงานที่เปิดตอน 23:30
 * ของวันที่ 30 กันยายนตามเวลาไทย คือ 16:30 ของวันที่ 30 กันยายนตาม UTC ซึ่งยังตรงกัน
 * แต่ใบที่เปิดตอนตีหนึ่งของวันที่ 1 ตุลาคม คือสี่ทุ่มของวันที่ 30 กันยายนตาม UTC
 * คือคนละวัน · วันครบกำหนดจะเลื่อนไปหนึ่งวันสำหรับทุกใบที่เปิดก่อนเจ็ดโมงเช้า
 *
 * ใช้ `Intl.DateTimeFormat` ซึ่งทำงานเหมือนกันทั้งบน Apps Script V8 และ Cloudflare
 * Workers จึงไม่ต้องเขียนใหม่ตอนย้าย (กฎข้อ 26) เหมือนที่ counterKeyOfMonth_ ใช้อยู่
 *
 * @param {Date|string|number} value ค่าเวลา
 * @return {string} 'YYYY-MM-DD' ตามเวลาไทย · ค่าว่างเมื่อไม่มีค่าหรือแปลงไม่ได้
 */
function thaiDayOf_(value) {
  var date = toDate_(value);
  if (!date) return '';

  var parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);

  var got = {};
  for (var i = 0; i < parts.length; i++) got[parts[i].type] = parts[i].value;

  return got.year + '-' + got.month + '-' + got.day;
}

/**
 * บวกวันตามปฏิทินให้กับวันที่ในรูป 'YYYY-MM-DD'
 *
 * นับเป็นวันตามปฏิทิน ไม่ใช่วันทำการ — เสาร์อาทิตย์และวันหยุดนับด้วย
 * เพราะขอบเขตที่ Admin ตั้งไว้คือ "อีกกี่วันงานนี้ควรจบ" ตามที่คุยกับลูกค้า
 * ไม่ใช่จำนวนวันที่ช่างทำงานจริง และระบบไม่มีปฏิทินวันหยุดให้อ้างอิงอยู่แล้ว
 *
 * คำนวณบนแกน UTC โดยตั้งใจ ทั้งที่ค่าที่รับมาเป็นวันไทย · ตรงนี้ไม่ใช่การแปลงโซน
 * แต่เป็นเลขคณิตบนปฏิทินล้วน ๆ การใช้แกนที่ไม่มีเวลาออมแสงจึงทำให้ "บวกหนึ่งวัน"
 * แปลว่าบวก 24 ชั่วโมงเสมอ ไม่มีวันไหนยาว 23 หรือ 25 ชั่วโมงมาทำให้ผลเพี้ยน
 *
 * @param {string} dayText วันที่ 'YYYY-MM-DD'
 * @param {number} days จำนวนวันที่บวก (ติดลบได้)
 * @return {string} 'YYYY-MM-DD' · ค่าว่างเมื่อรับค่าที่ไม่ใช่รูปแบบนี้
 */
function addDaysToDay_(dayText, days) {
  var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayText || ''));
  if (!parts) return '';

  var at = Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]));
  var moved = new Date(at + Math.round(Number(days) || 0) * 86400000);

  return moved.getUTCFullYear() + '-' +
    padNumber_(moved.getUTCMonth() + 1, 2) + '-' + padNumber_(moved.getUTCDate(), 2);
}

/**
 * ระยะห่างเป็นวันระหว่างสองวันในรูป 'YYYY-MM-DD' (b ลบ a)
 * @param {string} a วันเริ่ม
 * @param {string} b วันปลาย
 * @return {number} จำนวนวัน · 0 เมื่อค่าใดค่าหนึ่งไม่ใช่รูปแบบนี้
 */
function daysBetweenDays_(a, b) {
  var left = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(a || ''));
  var right = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b || ''));
  if (!left || !right) return 0;

  var from = Date.UTC(Number(left[1]), Number(left[2]) - 1, Number(left[3]));
  var to = Date.UTC(Number(right[1]), Number(right[2]) - 1, Number(right[3]));
  return Math.round((to - from) / 86400000);
}

/** สถานะของขอบเขตวัน — ประกาศไว้ที่เดียว ห้ามพิมพ์เป็นสตริงดิบที่อื่น (กฎข้อ 3) */
var DUE_STATE = Object.freeze({
  BEFORE: 'BEFORE',   // ยังไม่ถึงกำหนด
  TODAY:  'TODAY',    // ครบกำหนดวันนี้
  OVER:   'OVER',     // เกินกำหนดแล้ว
  CLOSED: 'CLOSED'    // ใบงานจบไปแล้ว หยุดนับ
});

/**
 * สถานะขอบเขตวันของใบงานหนึ่งใบ — ตัวเดียวที่ตัดสินเรื่องนี้ทั้งระบบ (กฎข้อ 3 · 19)
 *
 * **ใบที่ COMPLETED หรือ CANCELLED แล้วต้องหยุดนับ** งานจบไปแล้ว การนับต่อไม่มี
 * ความหมาย · ถ้านับต่อ รายการงานที่เสร็จหมดแล้วจะเต็มไปด้วยป้ายแดงที่ไม่มีความหมาย
 * แล้วคนจะเลิกมองป้ายทั้งหมด รวมทั้งใบที่เตือนถูก — ซึ่งแย่กว่าไม่มีป้ายเลย
 * แต่วันครบกำหนดยังคืนออกไป เพราะหน้ารายละเอียดยังต้องบอกได้ว่ากำหนดไว้วันไหน
 *
 * **ไม่ได้กรอกขอบเขตวัน = ไม่แสดงอะไรเลย ไม่ใช่แสดงว่าเกินกำหนด** ใบส่วนใหญ่
 * ไม่ได้กรอก การตีความช่องว่างเป็นศูนย์วันจะทำให้ทั้งระบบเลยกำหนดพร้อมกันหมด
 *
 * @param {Date|string} createdDate วันที่เปิดใบงาน
 * @param {*} durationDays จำนวนวันที่กำหนดไว้ · ว่าง = ไม่ได้กำหนด
 * @param {string} overallStatus สถานะรวมของใบงาน (ค่าจาก WO_STATUS)
 * @param {string} [todayText] วันนี้ตามเวลาไทย 'YYYY-MM-DD' · ไม่ส่งมาจะอ่านเวลาจริง
 * @return {Object} {has, dueDate, dueText, counting, state, days, label}
 */
function dueInfoOf_(createdDate, durationDays, overallStatus, todayText) {
  var days = Number(durationDays);
  var openedOn = thaiDayOf_(createdDate);

  // ช่องว่าง ศูนย์ ค่าติดลบ และค่าที่ไม่ใช่ตัวเลข ถือว่าไม่ได้กำหนดขอบเขตทั้งหมด
  if (isEmptyValue_(durationDays) || !isFinite(days) || days <= 0 || !openedOn) {
    return { has: false, dueDate: '', dueText: '', counting: false, state: '', days: 0, label: '' };
  }

  var dueDate = addDaysToDay_(openedOn, Math.floor(days));
  var dueText = dueDate.substring(8, 10) + '-' + dueDate.substring(5, 7) + '-' + dueDate.substring(0, 4);
  var closed = (String(overallStatus) === WO_STATUS.COMPLETED ||
                String(overallStatus) === WO_STATUS.CANCELLED);

  if (closed) {
    return { has: true, dueDate: dueDate, dueText: dueText, counting: false,
      state: DUE_STATE.CLOSED, days: 0, label: 'ครบกำหนด ' + dueText };
  }

  var today = String(todayText || '') || thaiDayOf_(new Date());
  var gap = daysBetweenDays_(today, dueDate);

  if (gap > 0) {
    return { has: true, dueDate: dueDate, dueText: dueText, counting: true,
      state: DUE_STATE.BEFORE, days: gap, label: 'เหลืออีก ' + gap + ' วัน' };
  }
  if (gap === 0) {
    return { has: true, dueDate: dueDate, dueText: dueText, counting: true,
      state: DUE_STATE.TODAY, days: 0, label: 'ครบกำหนดวันนี้' };
  }
  return { has: true, dueDate: dueDate, dueText: dueText, counting: true,
    state: DUE_STATE.OVER, days: -gap, label: 'เกินกำหนดมาแล้ว ' + (-gap) + ' วัน' };
}

/**
 * คอลัมน์ที่ต้องตั้งรูปแบบเซลล์เป็น "ข้อความ" ในชีต
 *
 * Google Sheet ตีความค่าตอนเขียน ข้อความที่เป็นตัวเลขล้วนจะกลายเป็นตัวเลขและศูนย์นำหายไป
 * เบอร์โทร "0812345678" จะถูกเก็บเป็น 812345678 ซึ่งโทรออกไม่ได้และกู้คืนไม่ได้ด้วย
 * เรื่องนี้ไม่เกี่ยวกับแคชหรือโค้ดฝั่งใด เป็นพฤติกรรมของตัวชีตเอง
 * แก้ได้ทางเดียวคือตั้งรูปแบบเซลล์ของคอลัมน์นั้นเป็นข้อความไว้ล่วงหน้า
 */
var TEXT_COLUMNS = Object.freeze({
  WorkOrder:        Object.freeze(['Phone', 'Customer_Code']),
  Project_Location: Object.freeze(['Customer_Code'])
});

/** รูปแบบเซลล์ "ข้อความธรรมดา" ของ Google Sheet */
var TEXT_FORMAT = '@';

/**
 * รายงานว่าคอลัมน์ที่ต้องเป็นข้อความ ตอนนี้ตั้งรูปแบบอะไรไว้จริง ๆ
 * กดรันฟังก์ชันนี้ในตัวแก้ไข Apps Script แล้วดูค่าที่คืนมาได้เลย
 * @return {Object} {ok, columns: [{sheet, field, format, ok}]}
 */
function checkTextColumns() {
  var columns = [];
  var allOk = true;

  for (var sheetName in TEXT_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(TEXT_COLUMNS, sheetName)) continue;
    var header = getHeader_(sheetName);
    var fields = TEXT_COLUMNS[sheetName];

    for (var i = 0; i < fields.length; i++) {
      var column = header.indexOf(fields[i]) + 1;
      if (column === 0) continue;
      // อ่านรูปแบบของแถวข้อมูลแถวแรก ไม่ใช่แถวหัวคอลัมน์
      var format = getSheet_(sheetName).getRange(2, column).getNumberFormat();
      var ok = (format === TEXT_FORMAT);
      if (!ok) allOk = false;
      columns.push({ sheet: sheetName, field: fields[i], format: format, ok: ok });
    }
  }

  return { ok: allOk, columns: columns };
}

/**
 * ตั้งรูปแบบเซลล์ของคอลัมน์เหล่านั้นให้เป็นข้อความทั้งคอลัมน์ แล้วตรวจซ้ำ
 *
 * ข้อมูลที่เสียหายไปก่อนหน้านี้แล้วจะไม่กลับมาเอง — ศูนย์นำที่หายไปแล้วหายถาวร
 * ฟังก์ชันนี้กันของใหม่เท่านั้น ของเก่าต้องไล่แก้เอง
 *
 * @return {Object} ผลจาก checkTextColumns() หลังตั้งค่าแล้ว
 */
function fixTextColumns() {
  for (var sheetName in TEXT_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(TEXT_COLUMNS, sheetName)) continue;
    var sheet = getSheet_(sheetName);
    var header = getHeader_(sheetName);
    var fields = TEXT_COLUMNS[sheetName];

    for (var i = 0; i < fields.length; i++) {
      var column = header.indexOf(fields[i]) + 1;
      if (column === 0) continue;
      sheet.getRange(2, column, sheet.getMaxRows() - 1, 1).setNumberFormat(TEXT_FORMAT);
    }
  }
  return checkTextColumns();
}

/**
 * ตรวจว่าโซนเวลาของสคริปต์กับของ Google Sheet ตรงกันและเป็น Asia/Bangkok (กฎข้อ 18 · SPEC 19)
 *
 * ถ้าสองที่นี้ตั้งคนละโซน ค่าที่เขียนลงชีตจะแสดงผลเลื่อนไปจากที่บันทึก
 * และเป็นบั๊กที่หายากมากเพราะโค้ดไม่ผิดสักบรรทัด
 *
 * @return {Object} {script, sheet, expected, ok}
 */
function checkTimeZones() {
  var script = Session.getScriptTimeZone();
  var sheet = getDb_().getSpreadsheetTimeZone();
  return {
    script: script,
    sheet: sheet,
    expected: TIMEZONE,
    ok: (script === TIMEZONE && sheet === TIMEZONE)
  };
}

/**
 * ตั้งโซนเวลาของ Google Sheet ให้ตรงกับที่ระบบใช้
 * สคริปต์เปลี่ยนโซนเวลาของตัวเองไม่ได้ ต้องแก้ timeZone ใน appsscript.json แล้ว push ใหม่
 * @return {Object} ผลการตรวจหลังแก้
 */
function fixSheetTimeZone() {
  getDb_().setSpreadsheetTimeZone(TIMEZONE);
  return checkTimeZones();
}

/* ---------------------------------------------------------------------------
 * การเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านของระบบเอง (CLAUDE.md กฎข้อ 16)
 *
 * ระบบไม่ใช้บัญชี Google ระบุตัวตนอีกแล้ว เพราะการพึ่ง Google บังคับให้ต้องแยกเป็น
 * 2 โปรเจกต์ ซึ่งทำให้ทุกการกดปุ่มช้าขึ้น 1-2 วินาทีและหลุดเป็นครั้งคราว
 *
 * ค่าคงที่ทั้งหมดของเรื่องนี้อยู่ที่นี่ที่เดียว ห้ามพิมพ์ตัวเลขซ้ำใน 07_Auth.gs
 * --------------------------------------------------------------------------- */

/** ความยาวรหัสผ่านขั้นต่ำ — ตรวจทั้งฝั่งหน้าเว็บและฝั่งเซิร์ฟเวอร์ */
var PASSWORD_MIN_LENGTH = 8;

/**
 * จำนวนรอบที่วน SHA-256 ตอนเข้ารหัสรหัสผ่าน
 *
 * การวนรอบเดียวคือการเปิดให้คนที่ได้ไฟล์ชีตไปเดารหัสได้เร็วมาก (GPU ทำได้พันล้านครั้ง
 * ต่อวินาที) การวนหลายพันรอบทำให้การเดาแต่ละครั้งแพงขึ้นตามจำนวนรอบ
 *
 * ทำไมเลือก 5,000: Apps Script เรียก Utilities.computeDigest ผ่านชั้น Java
 * ซึ่งมีค่าใช้จ่ายต่อครั้งสูงกว่าการคำนวณในภาษาอื่นมาก และวัดจากเครื่องพัฒนาไม่ได้
 * เลขนี้จึงตั้งไว้ฝั่งปลอดภัยเพื่อไม่ให้การล็อกอินช้าเกินครึ่งวินาทีบนเครื่องที่ช้าที่สุด
 * ให้กดรัน measurePasswordCost() ในตัวแก้ไขเพื่อวัดของจริง แล้วปรับเลขนี้ขึ้นได้
 *
 * เปลี่ยนเลขนี้ภายหลังได้โดยไม่ทำให้รหัสผ่านเดิมใช้ไม่ได้ เพราะจำนวนรอบที่ใช้จริง
 * ถูกเก็บไว้ในค่าที่บันทึกลงชีตด้วย (รูปแบบ sha256$<รอบ>$<ค่า>)
 */
var PASSWORD_ITERATIONS = 5000;

/** อายุโทเคนหลังการใช้งานครั้งล่าสุด (ชั่วโมง) */
var TOKEN_TTL_HOURS = 12;

/**
 * สะสมโทเคนที่ตายแล้วกี่แถวจึงค่อยเก็บกวาด
 *
 * ตั้งไว้ไม่ให้ลบทุกครั้งที่ล็อกอิน เพราะการลบเป็นการเขียนซึ่งแพงพอ ๆ กับการอ่าน
 * แท็บนี้ถูกอ่านทั้งตารางทุกครั้งที่ผู้ใช้กดปุ่มอะไรก็ตาม จึงต้องไม่ปล่อยให้โต
 * แต่ก็ไม่ต้องสะอาดตลอดเวลา · ที่ผู้ใช้ 20 คน ตัวเลขนี้แปลว่าเก็บกวาดราววันละครั้ง
 */
var TOKEN_PRUNE_THRESHOLD = 20;

/** ผิดกี่ครั้งจึงล็อกบัญชี และล็อกนานกี่นาที */
var LOGIN_MAX_FAILURES = 5;
var LOGIN_LOCK_MINUTES = 15;

/**
 * ข้อความเดียวที่ตอบกลับทุกกรณีที่ล็อกอินไม่ผ่าน
 *
 * ห้ามแยกว่า "ไม่มีผู้ใช้นี้" กับ "รหัสผิด" เด็ดขาด เพราะการแยกเท่ากับบอกคนนอก
 * ว่าชื่อผู้ใช้ไหนมีอยู่จริง ซึ่งเป็นครึ่งหนึ่งของงานเดารหัสไปแล้ว
 * หน้าล็อกอินเปิดให้ทั้งอินเทอร์เน็ตยิงได้ (ผู้มีสิทธิ์ = ทุกคน) ข้อนี้จึงสำคัญมาก
 */
var LOGIN_FAILED_MESSAGE = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';

/** ข้อความเมื่อบัญชีถูกล็อกชั่วคราวเพราะใส่รหัสผิดหลายครั้ง */
var LOGIN_LOCKED_MESSAGE =
  'บัญชีนี้ถูกล็อกชั่วคราวเพราะใส่รหัสผ่านผิดหลายครั้ง กรุณารออีก ';

/** ข้อความเมื่อไม่มีโทเคน หรือโทเคนใช้ไม่ได้แล้ว — หน้าเว็บใช้คำนี้ตัดสินใจพากลับไปหน้าล็อกอิน */
var NEED_LOGIN_MESSAGE = 'กรุณาเข้าสู่ระบบก่อนใช้งาน';

/* ---------------------------------------------------------------------------
 * ด่านเดียวที่กันไม่ให้ใครเรียกฟังก์ชันภายในจากเบราว์เซอร์
 *
 * ข้อเท็จจริงของ Apps Script ที่ต้องรู้: google.script.run เรียก "ทุกฟังก์ชันระดับบนสุด"
 * ของโปรเจกต์ได้ ยกเว้นตัวที่ชื่อลงท้ายด้วยขีดล่าง
 *
 * ตอนที่ระบบยังแยกสองโปรเจกต์ ข้อนี้ไม่เป็นปัญหา เพราะเบราว์เซอร์คุยกับโปรเจกต์หน้าบ้าน
 * ที่มีแค่ doGet กับ api_call และไม่มีทางเข้าถึงตัวที่ถือข้อมูลได้เลย
 * แต่ตอนนี้เหลือโปรเจกต์เดียวที่เบราว์เซอร์เปิดตรง ๆ ถ้าไม่มีด่านนี้ ใครก็ตามที่เปิดหน้าเว็บ
 * จะเรียก createWorkOrder() หรือ listCustomers() ตรง ๆ ได้ทันที โดยข้ามการตรวจสิทธิ์ทั้งชั้น
 *
 * ด่านนี้อยู่ที่ getSheet_() ซึ่งเป็นทางผ่านเดียวของการแตะชีตทุกแท็บ จึงครอบทุกเส้นทาง
 * ในคราวเดียว โดยไม่ต้องไปเปลี่ยนชื่อฟังก์ชันหลายร้อยตัว
 * --------------------------------------------------------------------------- */

/** ผลการตรวจว่าเป็นการรันจากตัวแก้ไขหรือไม่ — คิดครั้งเดียวต่อการรัน */
var EDITOR_RUN_ = null;

/**
 * กำลังรันจากตัวแก้ไข Apps Script โดยเจ้าของสคริปต์เองหรือไม่
 *
 * ใช้ตัดสินว่า "ให้สิทธิ์ระดับผู้ดูแลระบบได้ไหม" เท่านั้น ไม่ได้ใช้ตัดสินสิทธิ์ของผู้ใช้
 * ซึ่งมาจากโทเคนที่ระบบออกให้เท่านั้นตามกฎข้อ 16
 *
 * เงื่อนไขต้องครบสองข้อ และเป็นการตัดสินแบบ fail closed
 *   1. อ่านอีเมลของผู้กระทำได้จริง — เว็บแอปที่ตั้งดำเนินการในฐานะเจ้าของ จะได้ค่าว่างเสมอ
 *   2. ผู้กระทำคือเจ้าของสคริปต์ — กันกรณีที่ Google คืนอีเมลของผู้เปิดเว็บมาให้
 *
 * @return {boolean}
 */
function isEditorRun_() {
  if (EDITOR_RUN_ !== null) return EDITOR_RUN_;
  try {
    var actor = Session.getActiveUser().getEmail() || '';
    var owner = Session.getEffectiveUser().getEmail() || '';
    EDITOR_RUN_ = !!actor && actor === owner;
  } catch (e) {
    EDITOR_RUN_ = false;
  }
  return EDITOR_RUN_;
}

/**
 * อนุญาตให้แตะข้อมูลได้หรือไม่ — เรียกจาก getSheet_() ก่อนเปิดแท็บใด ๆ เสมอ
 *
 * ผ่านได้สองทางเท่านั้น
 *   1. อยู่ระหว่างให้บริการคำขอที่เข้ามาทาง api_call หรือ doGet
 *   2. เป็นการรันจากตัวแก้ไขโดยเจ้าของ (ชุดทดสอบและงานดูแลระบบ)
 *
 * การเรียกฟังก์ชันภายในตรง ๆ จากเบราว์เซอร์ไม่เข้าทั้งสองข้อ จึงถูกปฏิเสธที่นี่
 *
 * @throws {Error} เมื่อไม่ได้มาจากทางที่ควร
 */
function assertDataAccessAllowed_() {
  if (typeof REQUEST_CONTEXT_ !== 'undefined' && REQUEST_CONTEXT_ && REQUEST_CONTEXT_.serving) return;
  if (isEditorRun_()) return;
  throw new Error(NEED_LOGIN_MESSAGE);
}

/** ตัวขึ้นบรรทัดใหม่ สำหรับข้อความหลายบรรทัดที่อ่านใน Execution log */
var NEW_LINE_ = String.fromCharCode(10);

/** อายุแคชหัวคอลัมน์และข้อมูล Master ใน CacheService (วินาที) — SPEC G */
var CACHE_TTL_SEC = 300;

/**
 * แท็บข้อมูลตั้งต้นที่เก็บลง CacheService ได้ (SPEC G · CLAUDE.md ต้นทุนการคุยกับชีต)
 *
 * สี่แท็บนี้ถูกอ่านแทบทุกหน้า แต่เปลี่ยนปีละไม่กี่ครั้ง การอ่านใหม่ทุกครั้งจึงเป็น
 * ต้นทุนที่จ่ายซ้ำโดยไม่ได้อะไรกลับมา
 *
 * เงื่อนไขที่ทำให้ปลอดภัยพอจะแคชข้ามการรันได้ ต่างจากตารางธุรกรรม
 *   1. ไม่มีคอลัมน์วันเวลา — ผ่าน JSON ไป-กลับแล้วค่าไม่เพี้ยน
 *      (ชั้น Repo ตรวจซ้ำอีกชั้นด้วย ถ้าเจอ Date จะไม่แคชให้เลย)
 *   2. ไม่ถูกใช้ทำ Optimistic Lock
 *   3. ถูกล้างทันทีที่มีการเขียนแท็บนั้น และล้างมือได้ด้วย clearMasterCache()
 *
 * ข้อแลกเปลี่ยนที่ต้องรู้: User_Role อยู่ในรายการนี้ด้วย การถอนสิทธิ์ผู้ใช้
 * จึงมีผลช้าได้ถึง 10 นาที เว้นแต่จะกด clearMasterCache() หลังแก้ทะเบียน
 */
var MASTER_CACHE_SHEETS = Object.freeze([
  'Request_Type', 'Attachment_Topic', 'Report_Master', 'User_Role',
  // Notify_Channel อยู่ด้วยเพราะถูกอ่านทุกครั้งที่มีการแจ้งเตือน ซึ่งเกิดแทบทุกการกดปุ่ม
  'Notify_Channel'
]);

/** อายุแคชข้อมูลตั้งต้น (วินาที) — 10 นาทีตามที่ตกลงไว้ */
var MASTER_CACHE_TTL_SEC = 600;

/**
 * แท็บนี้แคชข้ามการรันได้หรือไม่
 * @param {string} sheetName ชื่อแท็บ
 * @return {boolean}
 */
function isMasterCacheSheet_(sheetName) {
  return MASTER_CACHE_SHEETS.indexOf(sheetName) !== -1;
}

/* ---------------------------------------------------------------------------
 * หน้าแรกและรายการใบงาน (SPEC 17.3)
 * --------------------------------------------------------------------------- */

/**
 * ตารางที่ยอดของแดชบอร์ดนับมาจาก — เขียนตารางไหนในนี้ ยอดที่แคชไว้ต้องถูกล้างทันที
 *
 * เดิมรายการนี้ชื่อ WO_INDEX_SOURCE_SHEETS และใช้ล้างดัชนีใบงานทั้งตาราง
 * ดัชนีนั้นถูกรื้อทิ้งแล้ว (SPEC 23) แต่จุดล้างยังอยู่ที่เดิมและยังถูกต้องกว่าเดิม
 *
 * **ทำไมล้างที่ทางผ่านของการเขียน ไม่ใช่ใน changeStatus()** — การเปลี่ยนสถานะ
 * เป็นสาเหตุหลักที่ยอดเปลี่ยนก็จริง แต่ไม่ใช่สาเหตุเดียว · การบันทึกชำระเงินเปลี่ยน
 * ยอด "ยังไม่ชำระ" โดยไม่ผ่าน changeStatus เลย · จุดล้างที่ครอบทุกการเขียนจึง
 * ครอบคลุมกว่า และยังเป็นจุดเดียวเหมือนเดิม ไม่ได้เพิ่มที่ต้องจำขึ้นมาใหม่
 */
var DASHBOARD_SOURCE_SHEETS = Object.freeze(['WorkOrder', 'Department_Task']);

/* ตัวแปรเก็บไฟล์ Audit ไว้ใช้ซ้ำภายในการรันครั้งเดียว (ไม่ข้ามการรัน) */
var AUDIT_DB_CACHE_ = null;

/**
 * อ่านค่าจาก Script Properties
 * @param {string} key คีย์จาก PROP_KEY
 * @param {boolean} [required=true] ถ้า false และไม่พบค่า จะคืน null แทนการโยน error
 * @return {string|null}
 * @throws {Error} เมื่อยังไม่ได้ตั้งค่าและ required ไม่ใช่ false
 */
function getProp_(key, required) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  if (!value && required !== false) {
    throw new Error('ยังไม่ได้ตั้งค่า Script Property "' + key +
      '" — ตั้งที่ ตัวแก้ไข Apps Script > Project Settings > Script Properties');
  }
  return value || null;
}

/**
 * ไฟล์ฐานข้อมูลหลัก — ใช้ชีตที่สคริปต์ผูกอยู่ ไม่ต้องเก็บ ID ไว้ที่ไหน
 * @return {Spreadsheet}
 * @throws {Error} เมื่อสคริปต์ไม่ได้ผูกกับชีตใด
 */
/**
 * ข้อความเดียวที่ผู้ใช้จะเห็นเมื่อบัญชีของเขาเปิดข้อมูลของระบบไม่ได้
 *
 * สคริปต์ทำงานด้วยสิทธิ์ของคนที่เปิด คนที่ยังไม่ได้รับแชร์ชีตจึงเจอข้อความดิบจาก Google
 * ซึ่งเป็นภาษาอังกฤษและมักมีชื่อไฟล์หรือรหัสไฟล์ติดมาด้วย ผู้ใช้อ่านไม่รู้เรื่อง
 * และการเผยชื่อหรือรหัสไฟล์ให้คนที่ยังไม่มีสิทธิ์เห็นก็ไม่ควรทำ
 */
var ACCESS_DENIED_MESSAGE =
  'บัญชีนี้ยังไม่ได้รับสิทธิ์เข้าถึงข้อมูลของระบบ กรุณาติดต่อผู้ดูแล';

/**
 * ข้อความเมื่อ "ตัวระบบ" ยังไม่ได้รับอนุญาตให้ใช้บริการของ Google
 *
 * คนละเรื่องกับ ACCESS_DENIED_MESSAGE โดยสิ้นเชิง และแก้คนละวิธี
 *   ACCESS_DENIED_MESSAGE  บัญชีของผู้ใช้เปิดไฟล์ไม่ได้ → ผู้ดูแลต้องแชร์ไฟล์ให้
 *   ตัวนี้                  สคริปต์ยังไม่ได้รับอนุญาตให้ใช้บริการนั้น → ผู้ดูแลต้องกดอนุญาตใหม่
 *
 * เคยพังจริงและเสียเวลาไปมาก: ข้อความจริงคือ "ไม่ได้รับอนุญาตให้เรียกใช้
 * DocumentApp.openById" แต่ระบบจับคำว่า openById แล้วเหมาว่าเป็นเรื่องสิทธิ์ไฟล์
 * ผู้ใช้จึงเห็นข้อความให้ไปขอสิทธิ์ชีต ทั้งที่ชีตไม่เกี่ยวอะไรเลยสักนิด
 */
var AUTHORIZATION_NEEDED_MESSAGE =
  'ระบบยังไม่ได้รับอนุญาตให้ใช้บริการของ Google ที่ขั้นตอนนี้ต้องใช้ · ' +
  'ผู้ดูแลระบบต้องเปิดตัวแก้ไข Apps Script กดรัน checkPermissions() หนึ่งครั้ง ' +
  'แล้วกดอนุญาตในหน้าต่างที่ขึ้นมา จากนั้นทำให้ใช้งานได้เป็นเวอร์ชันใหม่';

/**
 * ข้อผิดพลาดนี้เกิดจาก "สคริปต์ยังไม่ได้รับอนุญาตให้ใช้บริการ" หรือไม่
 *
 * ต้องแยกให้ออกจากเรื่องสิทธิ์เข้าถึงไฟล์ เพราะสองอย่างนี้แก้คนละทางสิ้นเชิง
 * ตัวชี้ที่แน่นอนที่สุดคือที่อยู่ของสิทธิ์ที่ติดมากับข้อความ ซึ่งไม่เปลี่ยนตามภาษาของบัญชี
 * ส่วนคำบรรยายภาษาไทยและอังกฤษใส่ไว้เผื่อรูปแบบข้อความที่ไม่มีที่อยู่ติดมา
 *
 * @param {Error|string} error ข้อผิดพลาดที่จับได้
 * @return {boolean}
 */
function isAuthorizationError_(error) {
  var text = String((error && error.message) ? error.message : error);
  if (/https:\/\/www\.googleapis\.com\/auth\//.test(text)) return true;

  var lower = text.toLowerCase();
  var marks = ['ไม่ได้รับอนุญาตให้เรียกใช้', 'สิทธิ์ที่จำเป็น',
    'does not have permission to call', 'required permissions',
    'authorization is required to perform'];
  for (var i = 0; i < marks.length; i++) {
    if (lower.indexOf(marks[i].toLowerCase()) !== -1) return true;
  }
  return false;
}

/**
 * ที่อยู่ของสิทธิ์ที่ขาด ดึงออกมาจากข้อความของ Google
 *
 * เอาเฉพาะที่อยู่ของสิทธิ์ ไม่เอาข้อความดิบทั้งก้อน เพราะข้อความดิบบางแบบมีชื่อไฟล์
 * หรือรหัสไฟล์ติดมาด้วย ซึ่งไม่ควรหลุดไปถึงผู้ใช้ · ที่อยู่ของสิทธิ์ไม่ใช่ความลับ
 * และเป็นสิ่งเดียวที่ผู้ดูแลต้องใช้เพื่อรู้ว่าขาดตัวไหน
 *
 * @param {Error|string} error ข้อผิดพลาดที่จับได้
 * @return {string} ค่าว่างเมื่อไม่มีที่อยู่ติดมา
 */
function missingScopeOf_(error) {
  var text = String((error && error.message) ? error.message : error);
  var found = text.match(/https:\/\/www\.googleapis\.com\/auth\/[A-Za-z0-9._-]+/g);
  return found ? found.join(', ') : '';
}

/**
 * ข้อผิดพลาดนี้เกิดจากสิทธิ์เข้าถึงไฟล์หรือไม่
 *
 * ข้อความจาก Google มีหลายแบบและเปลี่ยนตามภาษาของบัญชี จึงดูจากคำที่พบร่วมกันเป็นหลัก
 * ถ้าเดาผิดฝั่งใดฝั่งหนึ่ง ผลเสียต่างกันมาก: เดาว่าใช่ทั้งที่ไม่ใช่ แค่ข้อความกำกวมขึ้น
 * แต่เดาว่าไม่ใช่ทั้งที่ใช่ ผู้ใช้จะเห็นข้อความดิบพร้อมรหัสไฟล์ จึงเผื่อไว้ทางกว้าง
 *
 * @param {Error|string} error ข้อผิดพลาดที่จับได้
 * @return {boolean}
 */
function isAccessDeniedError_(error) {
  var text = String((error && error.message) ? error.message : error).toLowerCase();
  /*
   * ดูเฉพาะคำภาษาอังกฤษที่มาจาก Google เท่านั้น
   * ห้ามใส่คำไทยอย่าง "ไม่มีสิทธิ์" ลงในรายการนี้เด็ดขาด เพราะข้อความปฏิเสธสิทธิ์
   * ที่ระบบเขียนเองก็มีคำนั้น เช่น "บัญชีของคุณไม่มีสิทธิ์รับงาน ผู้ที่ทำได้คือ ..."
   * ถ้าเผลอจับคำไทยด้วย ข้อความที่บอกผู้ใช้ได้ชัดเจนอยู่แล้วจะถูกกลบด้วยข้อความกลาง
   * แล้วผู้ใช้จะไม่รู้เลยว่าต้องไปหาใคร
   */
  /*
   * เคยใช้คำว่า openById เป็นตัวชี้ด้วย แต่ต้องเลิก เพราะมันกว้างเกินไป
   * ข้อความ "ยังไม่ได้รับอนุญาตให้เรียกใช้ ...openById" และข้อผิดพลาดของโค้ดเราเองที่
   * บังเอิญพูดถึงเมธอดนั้น จะถูกเหมาเป็นเรื่องสิทธิ์ไฟล์ไปด้วยทั้งหมด แล้วชี้ทางแก้ผิด
   * ตัวที่ต้องจับจริงคือข้อความรูปแบบเต็มของ Google ซึ่งเจาะจงกว่ามาก
   */
  var marks = ['permission', 'do not have access', 'access denied',
    'not authorized', 'unauthorized',
    'unexpected error while getting the method or property'];
  for (var i = 0; i < marks.length; i++) {
    if (text.indexOf(marks[i]) !== -1) return true;
  }
  return false;
}

/**
 * แปลงข้อผิดพลาดเป็นข้อความที่แสดงให้ผู้ใช้เห็นได้
 * เรื่องสิทธิ์เข้าถึงไฟล์เปลี่ยนเป็นข้อความไทยกลาง ส่วนเรื่องอื่นคงข้อความเดิมไว้
 * เพราะข้อความเดิมคือข้อความภาษาไทยที่ระบบเขียนเองอยู่แล้วและบอกทางออกให้ผู้ใช้ได้
 *
 * @param {Error|string} error ข้อผิดพลาดที่จับได้
 * @return {string}
 */
function userFacingMessage_(error) {
  /*
   * ลำดับสำคัญ: ตรวจเรื่อง "ยังไม่ได้รับอนุญาต" ก่อนเสมอ
   * เพราะข้อความแบบนั้นมีคำว่า openById ติดมาด้วย จึงเข้าเงื่อนไขของอีกตัวได้พร้อมกัน
   * ถ้าตรวจสลับกัน ข้อความจะกลายเป็นเรื่องสิทธิ์ชีต แล้วไล่ปัญหาผิดทางทั้งหมด
   */
  if (isAuthorizationError_(error)) {
    var scope = missingScopeOf_(error);
    return AUTHORIZATION_NEEDED_MESSAGE + (scope ? (' · สิทธิ์ที่ขาดคือ ' + scope) : '');
  }
  if (isAccessDeniedError_(error)) return ACCESS_DENIED_MESSAGE;
  return (error && error.message) ? error.message : String(error);
}

function getDb_() {
  var db;
  try {
    db = SpreadsheetApp.getActive();
  } catch (e) {
    // คนที่ยังไม่ได้รับแชร์ชีต จะล้มตั้งแต่ขั้นเปิดไฟล์ ก่อนจะได้ทำอะไรเลย
    throw new Error(ACCESS_DENIED_MESSAGE);
  }
  if (!db) {
    throw new Error('สคริปต์นี้ไม่ได้ผูกกับไฟล์ Google Sheet ใด — ต้องเปิดจากไฟล์ที่สคริปต์ผูกไว้เท่านั้น');
  }
  return db;
}

/**
 * ไฟล์ Audit_Log ที่แยกออกมาต่างหาก เพื่อไม่ให้ชนเพดาน 10 ล้านเซลล์ของไฟล์หลัก (SPEC D-5, D-6)
 * @return {Spreadsheet}
 * @throws {Error} เมื่อยังไม่ได้ตั้งค่า AUDIT_SHEET_ID หรือเปิดไฟล์ไม่ได้
 */
function getAuditDb_() {
  if (AUDIT_DB_CACHE_) return AUDIT_DB_CACHE_;
  var id = getProp_(PROP_KEY.AUDIT_SHEET_ID);
  try {
    AUDIT_DB_CACHE_ = SpreadsheetApp.openById(id);
  } catch (e) {
    // ห้ามให้รหัสไฟล์หรือข้อความดิบของ Google หลุดไปถึงผู้ใช้
    throw new Error(openFailureMessage_(e, 'เปิดไฟล์บันทึกประวัติไม่ได้ กรุณาติดต่อผู้ดูแลระบบ'));
  }
  return AUDIT_DB_CACHE_;
}

/**
 * ข้อความที่ผู้ใช้ควรเห็นเมื่อ "เปิดไฟล์ไม่ได้" — แยกสามกรณีที่แก้คนละวิธี
 *
 *   สคริปต์ยังไม่ได้รับอนุญาตให้ใช้บริการ  ผู้ดูแลต้องกดอนุญาตใหม่
 *   บัญชีนี้ยังไม่ได้รับแชร์ไฟล์            ผู้ดูแลต้องแชร์ไฟล์ให้
 *   อย่างอื่น                              ข้อความสำรองของงานนั้น
 *
 * แยกออกมาเป็นฟังก์ชันของตัวเองเพราะสองบรรทัดแรกเคยสลับกันมาแล้ว และตอนอยู่ใน
 * try/catch ของการเปิดไฟล์ มันทดสอบไม่ได้เลยโดยไม่ทำให้การเปิดไฟล์จริงล้ม
 * พอแยกออกมา ก็ป้อนข้อความผิดพลาดแต่ละแบบเข้าไปตรวจได้ตรง ๆ
 *
 * @param {Error|string} error ข้อผิดพลาดที่จับได้
 * @param {string} fallback ข้อความเมื่อไม่เข้าสองกรณีแรก
 * @return {string}
 */
function openFailureMessage_(error, fallback) {
  // ลำดับสำคัญ: เรื่องการอนุญาตต้องมาก่อน เพราะข้อความแบบนั้นเข้าเงื่อนไขของอีกตัวได้ด้วย
  if (isAuthorizationError_(error)) return userFacingMessage_(error);
  if (isAccessDeniedError_(error)) return ACCESS_DENIED_MESSAGE;
  return fallback;
}

/**
 * ชื่อไฟล์บันทึกประวัติ — ใช้ตอนตรวจสิทธิ์ว่าเปิดไฟล์นั้นได้จริงหรือไม่
 * @return {string}
 */
function auditDbName_() {
  return getAuditDb_().getName();
}

/**
 * ตรวจว่าสิทธิ์ที่ระบบต้องใช้ ได้รับอนุญาตครบแล้วหรือยัง — กดรันจากตัวแก้ไข Apps Script
 *
 * มีไว้เพราะอาการ "ยังไม่ได้รับอนุญาต" มองไม่เห็นจากที่ไหนเลย เทสต์ทุกกลุ่มเขียว
 * โค้ดถูกทุกบรรทัด แต่ผู้ใช้กดใช้งานจริงแล้วล้ม · ตัวนี้เรียกบริการจริงทีละตัว
 * ด้วยคำสั่งที่ถูกที่สุดของแต่ละตัว แล้วรายงานว่าตัวไหนผ่านตัวไหนไม่ผ่าน
 *
 * และการกดรันตัวนี้เองคือวิธีเรียกหน้าต่างขออนุญาตให้ขึ้นมา เพราะมันแตะทุกบริการ
 * ที่ระบบประกาศไว้ รวมถึงตัวที่โค้ดส่วนอื่นยังไม่ได้ใช้
 *
 * @return {string} ผลการตรวจแบบอ่านได้ทันที
 */
function checkPermissions() {
  var lines = ['สิทธิ์ที่ระบบประกาศไว้ ' + requiredOAuthScopes_().length + ' รายการ'];
  var failed = 0;

  var checks = [
    { name: 'ไฟล์ที่สคริปต์ผูกอยู่ (spreadsheets) — ข้อมูลอยู่ในฐานข้อมูลแล้ว ไม่ได้อยู่ในไฟล์นี้',
      run: function () { return getDb_().getName(); } },
    { name: 'ไฟล์บันทึกประวัติ (spreadsheets)', run: function () {
        return getProp_(PROP_KEY.AUDIT_SHEET_ID, false) ? auditDbName_() : '(ยังไม่ได้ตั้งค่า ข้าม)';
      } },
    { name: 'ที่เก็บไฟล์ (drive)', run: function () {
        var id = getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false);
        if (!id) return '(ยังไม่ได้ตั้งค่า ข้าม)';
        return driveFolderName_(id) || '(เปิดโฟลเดอร์ไม่ได้ — ดู checkDriveFolder)';
      } },
    { name: 'แม่แบบใบสั่งงาน (documents)', run: function () {
        var id = getProp_(PROP_KEY.WO_REPORT_TEMPLATE, false);
        if (!id) return '(ยังไม่ได้ตั้งค่า ข้าม)';
        var probe = probeDocumentAccess_(id);
        if (!probe.ok) throw new Error(probe.message);
        return 'เปิดแม่แบบได้';
      } },
    { name: 'อีเมลของผู้ที่กดรัน (userinfo.email)', run: function () {
        return Session.getActiveUser().getEmail() || '(ไม่ได้อีเมล)';
      } },
    /*
     * ตัวสุดท้ายยังไม่มีงานส่วนไหนใช้ แต่ต้องตรวจตั้งแต่ตอนนี้
     * เพราะงานแจ้งเตือน Telegram จะใช้มัน และถ้ารอไปเจอตอนนั้น จะต้องกดอนุญาตใหม่
     * พร้อมทำให้ใช้งานได้ใหม่อีกรอบ ด้วยอาการเงียบ ๆ แบบเดียวกันนี้เป๊ะ
     */
    { name: 'ยิงคำขอออกนอกระบบ (script.external_request)', run: function () {
        return 'ปลายทางตอบกลับรหัส ' + fetchStatusCode_('https://www.gstatic.com/generate_204');
      } },
    /*
     * สิทธิ์จัดการทริกเกอร์ ใช้โดยงานสำรองข้อมูลรายสัปดาห์เท่านั้น (SPEC 22.6)
     *
     * ตรวจด้วยการ **อ่าน** รายการทริกเกอร์ ไม่ใช่สร้างทริกเกอร์ทิ้งไว้ · ทั้งสองอย่าง
     * ใช้สิทธิ์ตัวเดียวกัน แต่อย่างหลังจะทิ้งงานที่ตั้งเวลาไว้ค้างทุกครั้งที่มีคนกดตรวจสิทธิ์
     */
    { name: 'จัดการทริกเกอร์ตามเวลา (script.scriptapp)', run: function () {
        return probeTriggerAccess_();
      } }
  ];

  for (var i = 0; i < checks.length; i++) {
    try {
      lines.push('  ผ่าน    ' + checks[i].name + ' — ' + checks[i].run());
    } catch (e) {
      failed++;
      lines.push('  ไม่ผ่าน ' + checks[i].name + ' — ' + userFacingMessage_(e));
    }
  }

  lines.push(failed
    ? ('!! ยังขาดสิทธิ์ ' + failed + ' รายการ — ถ้าเพิ่งกดอนุญาตไป ให้กดรันตัวนี้ซ้ำอีกครั้ง ' +
       'แล้วทำให้ใช้งานได้เป็นเวอร์ชันใหม่')
    : 'ได้รับอนุญาตครบทุกรายการแล้ว · อย่าลืมทำให้ใช้งานได้เป็นเวอร์ชันใหม่หลังแก้โค้ด');

  var report = lines.join(NEW_LINE_);
  Logger.log(report);
  return report;
}

/**
 * ผู้อนุมัติของสายงานนั้น (SPEC 3, หมายเหตุท้ายหัวข้อ 5)
 * งาน Lab → APPROVER_LAB · นอกนั้นรวมถึงงานที่ยังไม่ระบุแผนก → APPROVER_SP
 * @param {string} route ค่าจาก ROUTE
 * @return {string} ค่าจาก ROLE
 */
function approverRoleOfRoute(route) {
  return route === ROUTE.LAB ? ROLE.APPROVER_LAB : ROLE.APPROVER_SP;
}

/**
 * แผนกที่ผู้อนุมัติเลือกได้ในสายนั้น (SPEC 3, 3.1)
 *
 * ระบบไม่มีการส่งต่อใบงานข้ามสาย สายงานถูกตัดสินตั้งแต่ตอนสร้างและเปลี่ยนกลางทางไม่ได้
 * ใบสาย SP (รวมใบที่เลือก "ไม่ระบุ") จึงส่งให้ Lab ไม่ได้ และใบสาย Lab ก็ส่งให้แผนกอื่นไม่ได้
 * ถ้าเลือกสายมาผิด ให้ผู้อนุมัติตีกลับแล้วให้ผู้แจ้งแก้สายงานในใบเดิม (SPEC 3.1)
 *
 * @param {string} route ค่าจาก ROUTE
 * @return {string[]} ค่าจาก ASSIGNMENT ที่เลือกได้
 */
function assignmentTypesOfRoute(route) {
  return route === ROUTE.LAB
    ? [ASSIGNMENT.LAB]
    : [ASSIGNMENT.SERVICE, ASSIGNMENT.PROJECT, ASSIGNMENT.SERVICE_PROJECT];
}

/**
 * ชื่อภาษาไทยของสายอนุมัติ ใช้ในข้อความถึงผู้ใช้
 * @param {string} route ค่าจาก ROUTE
 * @return {string}
 */
function routeLabel_(route) {
  return route === ROUTE.LAB ? 'สายแล็บ' : 'สายบริการและโครงการ';
}

/**
 * แผนกที่ต้องเกิด Task เมื่ออนุมัติ (SPEC 3) — SERVICE_PROJECT เกิด 2 Task ขนานกัน
 * @param {string} assignmentType ค่าจาก ASSIGNMENT
 * @return {string[]} รายชื่อแผนกจาก DEPT (ว่างเมื่อยังไม่ระบุแผนก)
 */
function departmentsOfAssignment(assignmentType) {
  switch (assignmentType) {
    case ASSIGNMENT.SERVICE:         return [DEPT.SERVICE];
    case ASSIGNMENT.PROJECT:         return [DEPT.PROJECT];
    case ASSIGNMENT.SERVICE_PROJECT: return [DEPT.SERVICE, DEPT.PROJECT];
    case ASSIGNMENT.LAB:             return [DEPT.LAB];
    default:                         return [];
  }
}

/**
 * ตารางเทียบชื่อคอลัมน์ระหว่างชื่อในระบบกับชื่อในฐานข้อมูล Supabase (SPEC 22.3)
 *
 * นี่คือจุดเดียวของทั้งระบบที่รู้ว่าคอลัมน์ในระบบตรงกับคอลัมน์ไหนในฐานข้อมูล
 * `toDb_()` และ `fromDb_()` ใน 01_Db.gs สร้างตัวแปลงทั้งสองทางจากตารางนี้เท่านั้น
 *
 * **ทำไมต้องเขียนรายชื่อไว้ ไม่ให้โค้ดแปลงตัวพิมพ์เอา** — ขาไปเป็นตัวพิมพ์เล็กก็จริง
 * แต่ขากลับเดาไม่ได้ `pj_id` ต้องกลับไปเป็น `PJ_ID` ไม่ใช่ `Pj_Id` และ `wo_count`
 * ต้องกลับไปเป็น `WO_Count` ไม่ใช่ `Wo_Count` · การมีรายชื่ออยู่ตรงนี้ทำให้ขากลับ
 * เป็นการเปิดตาราง ไม่ใช่การเดา และทำให้คอลัมน์ที่เพิ่มใหม่โดยไม่บอกใครถูกจับได้
 *
 * **รูปแบบของแต่ละคอลัมน์** เขียนได้สองแบบ
 *   `'WO_ID'`                      ชื่อในฐานข้อมูลคือตัวพิมพ์เล็กของชื่อนี้ (`wo_id`)
 *   `['รหัสลูกค้า', 'customer_code']`  เขียนเป็นคู่เมื่อสองฝั่งไม่ใช่ตัวเดียวกัน
 *
 * ที่ต้องมีแบบคู่เพราะชีต Customer ใช้หัวคอลัมน์ภาษาไทย ซึ่งทำเป็นตัวพิมพ์เล็กไม่ได้
 * ส่วนอีก 15 ตารางเป็นอักษรอังกฤษล้วน การเขียนทั้งสองฝั่งจะเป็นการเขียนซ้ำที่เพี้ยนได้
 *
 * ชื่อคอลัมน์ในนี้คัดมาจาก supabase_schema.sql ซึ่งสร้างจากหัวคอลัมน์จริงในชีต
 * ไม่ใช่จาก SPEC หัวข้อ 13 โดยตรง (SPEC 22.5)
 */
var DB_COLUMNS = Object.freeze({

  /* ---------- ตารางข้อมูลหลัก ---------- */

  'Customer': {
    table: 'customer',
    // ชีตต้นทางมี 20 คอลัมน์ แต่ระบบอ่านแค่ 4 คอลัมน์นี้ จึงย้ายเท่าที่ใช้จริง
    columns: [
      ['รหัสลูกค้า', 'customer_code'],
      ['ชื่อลูกค้า', 'customer_name'],
      ['พนักงานขาย', 'sales_person'],
      ['วันที่เริ่มติดต่อ', 'start_contact_date']
    ]
  },

  'Report_Master': {
    table: 'report_master',
    columns: ['Report_Code', 'Type', 'Report_Name', 'Form_No', 'Required', 'Sort_Order', 'Active']
  },

  'Attachment_Topic': {
    table: 'attachment_topic',
    columns: ['Topic_ID', 'Scope', 'Topic_Name', 'Required', 'Multiple', 'Active']
  },

  'Task_Step_Template': {
    table: 'task_step_template',
    columns: ['Template_ID', 'Department', 'Step_No', 'Step_Name', 'Description', 'Active']
  },

  'Request_Type': {
    table: 'request_type',
    columns: ['Request_ID', 'Request_Name', 'Sort_Order', 'Active']
  },

  'Notify_Channel': {
    table: 'notify_channel',
    columns: ['Channel_ID', 'Name', 'Target', 'Chat_ID', 'Thread_ID', 'Active']
  },

  /* ---------- ผู้ใช้และการล็อกอิน ---------- */

  'User_Role': {
    table: 'user_role',
    // ลำดับในชีตกับในฐานข้อมูลไม่เหมือนกัน ซึ่งไม่เป็นไร เพราะทั้งสองฝั่งอ่านด้วยชื่อ
    columns: ['Username', 'Password_Hash', 'Password_Salt', 'Failed_Count', 'Locked_Until',
      'Must_Change_Password', 'Email', 'Display_Name', 'Role', 'Department',
      'Telegram_User_ID', 'Active']
  },

  'Session_Token': {
    table: 'session_token',
    columns: ['Token_Hash', 'Email', 'Issued_Date', 'Expires_Date', 'Last_Used_Date', 'Active']
  },

  /* ---------- ตารางธุรกรรม ---------- */

  'Project_Location': {
    table: 'project_location',
    columns: ['PJ_ID', 'Customer_Code', 'Customer_Name', 'Project', 'Project_Seq', 'Location',
      'Location_Key', 'Location_Seq', 'First_WO_ID', 'WO_Count', 'Created_By', 'Created_Date',
      'Active']
  },

  'WorkOrder': {
    table: 'work_order',
    columns: ['WO_ID', 'PJ_ID', 'Customer_Code', 'Customer_Name', 'Sales_Person',
      'Start_Contact_Date', 'Contact', 'Phone', 'Location', 'Project', 'Request_Types',
      'Job_Description', 'Product_Detail', 'Work_Scope', 'Reference_Doc', 'Remark', 'Route',
      'Assignment_Type', 'Start_Date', 'End_Date', 'Overall_Status', 'Approved_By',
      'Approved_Date', 'Return_Count', 'Return_Reason', 'Cancel_Reason', 'Payment_Required',
      'Payment_Status', 'Payment_Date', 'Payment_By', 'Payment_Remark', 'Folder_ID',
      'Folder_Map', 'Report_URL', 'Folder_URL', 'Created_By', 'Created_Date', 'Updated_By',
      'Updated_Date', 'Returned_By', 'Returned_Date', 'Duration_Days',
      'Reopen_Count', 'Reopen_Reason', 'Reopened_By', 'Reopened_Date', 'Closed_Date']
  },

  'Department_Task': {
    table: 'department_task',
    columns: ['Task_ID', 'WO_ID', 'Department', 'Status', 'Status_Before_Return',
      'Assigned_Date', 'Accepted_By', 'Accepted_Date', 'Completed_By', 'Completed_Date',
      'Cancel_Reason', 'Return_Reason', 'Remark', 'Updated_By', 'Updated_Date',
      'Visit_Start', 'Visit_End']
  },

  'Task_Step': {
    table: 'task_step',
    columns: ['Step_ID', 'Task_ID', 'Step_No', 'Step_Name', 'Type', 'Status', 'Due_Date',
      'Completed_By', 'Completed_Date']
  },

  'File_Index': {
    table: 'file_index',
    columns: ['File_ID', 'WO_ID', 'Task_ID', 'Step_ID', 'Topic_ID', 'Report_Code',
      'Saved_File_Name', 'Original_File_Name', 'Seq', 'Drive_File_ID', 'File_URL',
      'Mime_Type', 'Size', 'Version', 'Is_Active', 'Uploaded_By', 'Uploaded_Date']
  },

  'Counter': {
    table: 'counter',
    columns: ['Key', 'Last_Number', 'Updated_Date']
  },

  /* ---------- บันทึกประวัติ ---------- */

  'Audit_Log': {
    table: 'audit_log',
    // !! คอลัมน์ User กลายเป็น "user" ซึ่งเป็นคำสงวนของ Postgres
    // ผ่าน PostgREST เรียก user ธรรมดาได้ ไม่ต้องทำอะไรเป็นพิเศษ
    // แต่ถ้าเขียน SQL ดิบใน SQL Editor ต้องใส่เครื่องหมายคำพูดทุกครั้ง: "user"
    // ลืมใส่แล้วจะเจอ syntax error ที่ข้อความไม่ได้ชี้มาที่คอลัมน์นี้เลย
    columns: ['Log_ID', 'WO_ID', 'Task_ID', 'User', 'Role', 'Action', 'Entity', 'Field',
      'From_Value', 'To_Value', 'Remark', 'Timestamp']
  },

  'System_Log': {
    table: 'system_log',
    // !! คอลัมน์ User กลายเป็น "user" คำสงวนของ Postgres เหมือน Audit_Log ข้างบน
    columns: ['Log_ID', 'Level', 'Source', 'Event', 'User', 'Detail', 'Timestamp']
  }
});

/**
 * คอลัมน์ที่ฐานข้อมูล "คำนวณให้ตอนอ่าน" ไม่ได้เก็บค่าไว้จริง (SPEC 13 · 22.3)
 *
 * PostgREST เปิดให้ฟังก์ชันที่รับทั้งแถวของตารางเป็นอาร์กิวเมนต์ ถูกใช้เหมือน
 * คอลัมน์หนึ่งของตารางนั้น — กรองได้ เรียงได้ เลือกมาแสดงได้ · รายการนี้คือ
 * ตารางเทียบชื่อของคอลัมน์แบบนั้น ซึ่งต้องแยกจาก DB_COLUMNS เด็ดขาด
 *
 * **แยกไว้เพราะ "อ่านได้" กับ "เขียนได้" ไม่ใช่สิ่งเดียวกันอีกต่อไป**
 * ถ้าเอาไปรวมใน DB_COLUMNS แล้ววันหนึ่งมีคนส่งค่านี้ไปกับคำสั่งเขียน
 * ฐานข้อมูลจะปฏิเสธทั้งรายการ ด้วยข้อความที่ไม่ได้ชี้มาที่ช่องนี้เลย ·
 * และตัวสำรองข้อมูล ตัวตรวจตาราง กับตัวนับแถว ที่ไล่ตาม DB_COLUMNS
 * ก็จะเริ่มเห็นคอลัมน์ที่ไม่มีอยู่จริงในตาราง
 *
 * Due_Date ของใบงานคำนวณจาก Created_Date บวก Duration_Days ตามเวลาไทย
 * **ห้ามเก็บเป็นคอลัมน์จริงเด็ดขาด** ถ้าเก็บทั้งสามค่า วันหนึ่งมันจะไม่ตรงกัน
 * แล้วไม่มีใครรู้ว่าอันไหนถูก · สูตรอยู่ใน supabase_batch1.sql ที่เดียว
 *
 * ชื่อ Due_Date ซ้ำกับคอลัมน์จริงของ Task_Step ซึ่งไม่เป็นปัญหา เพราะตารางเทียบชื่อ
 * แยกตามตารางอยู่แล้ว และความหมายก็ตรงกันทั้งสองที่คือ "วันที่ต้องทำให้เสร็จ"
 */
var DB_COMPUTED_COLUMNS = Object.freeze({
  'WorkOrder': Object.freeze({ 'Due_Date': 'due_date' })
});

/* ---------------------------------------------------------------------------
 * ตัวห่อบริการของแพลตฟอร์ม (CLAUDE.md กฎข้อ 26)
 *
 * ของที่ Apps Script ทำได้ดีอยู่แล้วให้ห่อไว้ แล้วเปลี่ยนไส้ในตอนย้ายไป Workers
 * ไม่ใช่เขียนขึ้นมาเองใหม่ · ห้าฟังก์ชันข้างล่างนี้คือที่เดียวในทั้งระบบที่
 * CacheService และ Utilities.getUuid ปรากฏได้ เหมือนที่ httpSend_ เป็นที่เดียว
 * ของ UrlFetchApp · test_layerPurity คอยกันไว้ไม่ให้มีที่สองเกิดขึ้น
 * --------------------------------------------------------------------------- */

/**
 * อ่านค่าจากแคชข้ามการรัน
 *
 * แคชล่มไม่ใช่เรื่องคอขาดบาดตาย ทุกตัวในกลุ่มนี้จึงกลืนข้อผิดพลาดแล้วทำเหมือน
 * "ไม่มีในแคช" แทนที่จะโยนออกไป · ผู้เรียกทุกคนอ่านของจริงได้อยู่แล้วเมื่อแคชพลาด
 *
 * @param {string} key คีย์
 * @return {string|null} ค่าที่เก็บไว้ หรือ null เมื่อไม่มี/อ่านไม่ได้
 */
function cacheGet_(key) {
  try {
    return CacheService.getScriptCache().get(key);
  } catch (e) {
    return null;
  }
}

/**
 * อ่านหลายคีย์พร้อมกัน — ใช้ตอนประกอบของที่ถูกตัดเก็บเป็นก้อนย่อย
 * @param {string[]} keys คีย์ทั้งหมดที่ต้องการ
 * @return {Object} คีย์ที่พบไปยังค่า (คีย์ที่ไม่พบจะไม่อยู่ในผล)
 */
function cacheGetAll_(keys) {
  try {
    return CacheService.getScriptCache().getAll(keys) || {};
  } catch (e) {
    return {};
  }
}

/**
 * เก็บค่าลงแคชข้ามการรัน
 * @param {string} key คีย์
 * @param {string} value ค่า (ต้องเป็นข้อความแล้ว)
 * @param {number} ttlSeconds อายุเป็นวินาที
 */
function cachePut_(key, value, ttlSeconds) {
  try {
    CacheService.getScriptCache().put(key, value, ttlSeconds);
  } catch (e) {
    // เก็บไม่ได้ก็แค่ครั้งหน้าต้องอ่านของจริงใหม่ ไม่ใช่เรื่องที่ต้องทำให้งานหลักล้ม
  }
}

/**
 * เก็บหลายคีย์พร้อมกัน
 * @param {Object} values คีย์ไปยังค่า
 * @param {number} ttlSeconds อายุเป็นวินาที
 */
function cachePutAll_(values, ttlSeconds) {
  try {
    CacheService.getScriptCache().putAll(values, ttlSeconds);
  } catch (e) {
    // เหตุผลเดียวกับ cachePut_
  }
}

/**
 * ทิ้งค่าในแคช — รับคีย์เดียวหรือหลายคีย์ก็ได้
 * @param {string|string[]} keys คีย์ที่จะทิ้ง
 */
function cacheDrop_(keys) {
  try {
    var cache = CacheService.getScriptCache();
    if (keys instanceof Array) {
      if (keys.length) cache.removeAll(keys);
    } else if (keys) {
      cache.remove(keys);
    }
  } catch (e) {
    // ทิ้งไม่สำเร็จแปลว่าค่าเก่าจะค้างจนหมดอายุเอง ซึ่งแย่แต่ไม่ถึงกับพัง
  }
}

/**
 * สุ่มรหัสไม่ซ้ำหนึ่งตัว
 *
 * ห่อของเดิมไว้ ไม่เขียนเองจาก Math.random() เพราะการสุ่มที่แย่ลงจะไปโผล่เป็น
 * รหัสซ้ำใน Audit_Log ซึ่งเป็นตารางที่ห้ามลบ แก้ย้อนหลังไม่ได้ และจะไม่มีใคร
 * สังเกตจนกว่าจะสาย · ตอนย้ายไป Workers เปลี่ยนไส้ในเป็น crypto.randomUUID()
 * ซึ่งเป็นของมาตรฐานและสุ่มดีเท่ากัน
 *
 * @return {string} รหัสรูปแบบ UUID
 */
function newUuid_() {
  return Utilities.getUuid();
}
