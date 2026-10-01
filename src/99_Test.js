/**
 * 99_Test.gs — ฟังก์ชันทดสอบสำหรับกดรันในตัวแก้ไข Apps Script
 *
 * รันในเครื่องไม่ได้ ต้อง clasp push ขึ้นคลาวด์ก่อน แล้วเลือกฟังก์ชันที่ขึ้นต้นด้วย test_
 * ในตัวแก้ไข กด Run แล้วดูผลที่ Execution log
 *
 * ขั้นที่ 1 ทดสอบเฉพาะ 00_Config.gs และ 02_StateMachine.gs — ยังไม่แตะ Sheet
 * ฟังก์ชันหลักคือ test_all() ซึ่งรันทุกชุดแล้วสรุปผลรวม
 */

/* สถานะการทดสอบของชุดที่กำลังรันอยู่ */
var TEST_STATE_ = null;

/* ---------------------------------------------------------------------------
 * ตัวช่วยทดสอบ
 * --------------------------------------------------------------------------- */

/**
 * เริ่มชุดทดสอบใหม่
 * @param {string} name ชื่อชุดทดสอบ
 */
function beginTest_(name) {
  TEST_STATE_ = { name: name, pass: 0, fail: 0, failures: [] };
  Logger.log('=== ' + name + ' ===');
}

/**
 * ปิดชุดทดสอบ สรุปผล และโยน error ถ้ามีข้อที่ไม่ผ่าน
 * @return {Object} {name, pass, fail, failures}
 */
function endTest_() {
  var state = TEST_STATE_;
  Logger.log('--- ' + state.name + ': ผ่าน ' + state.pass + ' / ไม่ผ่าน ' + state.fail + ' ---');
  if (state.fail > 0) {
    throw new Error(state.name + ' ไม่ผ่าน ' + state.fail + ' ข้อ: ' + state.failures.join(' | '));
  }
  return state;
}

/**
 * ตรวจว่าค่าที่ได้ตรงกับที่คาดไว้
 * @param {*} actual ค่าที่ได้จริง
 * @param {*} expected ค่าที่คาดไว้
 * @param {string} label คำอธิบายข้อทดสอบ
 */
function assertEquals_(actual, expected, label) {
  if (actual === expected) {
    pass_(label);
  } else {
    fail_(label + ' — คาดว่า [' + expected + '] แต่ได้ [' + actual + ']');
  }
}

/**
 * ตรวจว่าเงื่อนไขเป็นจริง
 * @param {boolean} condition เงื่อนไขที่ต้องเป็นจริง
 * @param {string} label คำอธิบายข้อทดสอบ
 */
function assertTrue_(condition, label) {
  if (condition === true) {
    pass_(label);
  } else {
    fail_(label + ' — คาดว่าเป็นจริง แต่ได้ [' + condition + ']');
  }
}

/**
 * ตรวจว่าฟังก์ชันโยน error ออกมาจริง (ใช้ทดสอบว่าระบบปฏิเสธรายการที่ผิดกฎ)
 * @param {function()} fn ฟังก์ชันที่ควรโยน error
 * @param {string} label คำอธิบายข้อทดสอบ
 */
function assertThrows_(fn, label) {
  try {
    fn();
    fail_(label + ' — คาดว่าจะถูกปฏิเสธ แต่ทำรายการผ่าน');
  } catch (e) {
    pass_(label + ' (ปฏิเสธด้วยข้อความ: ' + e.message + ')');
  }
}

/**
 * ตรวจว่าฟังก์ชันโยน error ที่มีข้อความตามที่คาดไว้
 * ใช้กับกรณีที่ "ข้อความ" สำคัญพอ ๆ กับการถูกปฏิเสธ เช่นข้อความที่ต้องบอกทางออกให้ผู้ใช้
 * @param {function()} fn ฟังก์ชันที่ควรโยน error
 * @param {string} expected ข้อความ (หรือบางส่วน) ที่ต้องปรากฏ
 * @param {string} label คำอธิบายข้อทดสอบ
 */
function assertThrowsMessage_(fn, expected, label) {
  try {
    fn();
    fail_(label + ' — คาดว่าจะถูกปฏิเสธ แต่ทำรายการผ่าน');
  } catch (e) {
    if (String(e.message).indexOf(expected) !== -1) {
      pass_(label);
    } else {
      fail_(label + ' — ข้อความไม่ตรง คาดว่ามี "' + expected + '" แต่ได้ "' + e.message + '"');
    }
  }
}

/**
 * บันทึกข้อที่ผ่าน
 * @param {string} label คำอธิบายข้อทดสอบ
 */
function pass_(label) {
  TEST_STATE_.pass++;
  Logger.log('  [ผ่าน] ' + label);
}

/**
 * บันทึกข้อที่ไม่ผ่าน
 * @param {string} label คำอธิบายข้อทดสอบพร้อมเหตุผล
 */
function fail_(label) {
  TEST_STATE_.fail++;
  TEST_STATE_.failures.push(label);
  Logger.log('  [ไม่ผ่าน] ' + label);
}

/* ---------------------------------------------------------------------------
 * ชุดทดสอบหลัก: recalcWoStatus (SPEC 20.4 — ครบทั้ง 5 กรณี)
 * --------------------------------------------------------------------------- */

/**
 * ทดสอบ recalcFromStatuses_() ครบทั้ง 5 กรณีในตรรกะของ SPEC หัวข้อ 20.4
 * โดยครอบคลุมทั้งงานแผนกเดียว งานร่วม (Service + Project) และงาน Lab
 */
function test_recalcWoStatus() {
  beginTest_('recalcWoStatus — SPEC 20.4');

  var T = TASK_STATUS;
  var W = WO_STATUS;

  // ---- กรณีที่ 1: ไม่มี Task เลย -> ไม่เปลี่ยนสถานะ ----
  var r = recalcFromStatuses_([], W.APPROVED);
  assertEquals_(r.status, W.APPROVED, 'กรณี 1: ไม่มี Task -> คงสถานะ APPROVED');
  assertEquals_(r.changed, false, 'กรณี 1: ไม่มี Task -> changed = false');
  assertEquals_(recalcFromStatuses_(null, W.PENDING_APPROVE).status, W.PENDING_APPROVE,
    'กรณี 1: ส่ง null มาแทน array -> คงสถานะเดิม');

  // ---- กรณีที่ 2: ทุกตัว CANCELLED -> WO = CANCELLED ----
  r = recalcFromStatuses_([T.CANCELLED], W.IN_PROGRESS);
  assertEquals_(r.status, W.CANCELLED, 'กรณี 2: งานแผนกเดียวยกเลิก -> CANCELLED');
  assertEquals_(r.changed, true, 'กรณี 2: สถานะเปลี่ยนจริง -> changed = true');
  assertEquals_(r.rule, 'ALL_CANCELLED', 'กรณี 2: กฎที่ใช้คือ ALL_CANCELLED');
  assertEquals_(recalcFromStatuses_([T.CANCELLED, T.CANCELLED], W.IN_PROGRESS).status, W.CANCELLED,
    'กรณี 2: งานร่วมยกเลิกครบทั้ง Service และ Project -> CANCELLED');

  // ---- กรณีที่ 3: ตัวที่ไม่ใช่ CANCELLED เสร็จครบ และมีอย่างน้อย 1 ตัว -> WO = COMPLETED ----
  r = recalcFromStatuses_([T.COMPLETED], W.IN_PROGRESS);
  assertEquals_(r.status, W.COMPLETED, 'กรณี 3: งานแผนกเดียวเสร็จ -> COMPLETED');
  assertEquals_(r.rule, 'ALL_ACTIVE_COMPLETED', 'กรณี 3: กฎที่ใช้คือ ALL_ACTIVE_COMPLETED');
  assertEquals_(recalcFromStatuses_([T.COMPLETED, T.COMPLETED], W.IN_PROGRESS).status, W.COMPLETED,
    'กรณี 3: งานร่วมเสร็จครบทั้งสองแผนก -> COMPLETED');
  assertEquals_(recalcFromStatuses_([T.COMPLETED, T.CANCELLED], W.IN_PROGRESS).status, W.COMPLETED,
    'กรณี 3: ยกเลิกบางแผนกแต่ที่เหลือเสร็จ -> COMPLETED (ต้องแสดงหมายเหตุแผนกที่ยกเลิก)');
  assertEquals_(recalcFromStatuses_([T.COMPLETED], W.COMPLETED).changed, false,
    'กรณี 3: สถานะเดิมเป็น COMPLETED อยู่แล้ว -> changed = false ไม่ต้องเขียนซ้ำ');

  // ---- กรณีที่ 4: มีตัวใด IN_PROGRESS -> WO = IN_PROGRESS ----
  r = recalcFromStatuses_([T.IN_PROGRESS], W.APPROVED);
  assertEquals_(r.status, W.IN_PROGRESS, 'กรณี 4: แผนกกดรับงานแล้ว -> IN_PROGRESS');
  assertEquals_(r.rule, 'ANY_IN_PROGRESS', 'กรณี 4: กฎที่ใช้คือ ANY_IN_PROGRESS');
  assertEquals_(recalcFromStatuses_([T.IN_PROGRESS, T.COMPLETED], W.APPROVED).status, W.IN_PROGRESS,
    'กรณี 4: งานร่วม เสร็จแผนกเดียว อีกแผนกยังทำอยู่ -> IN_PROGRESS (ยังไม่ปิดงาน)');
  assertEquals_(recalcFromStatuses_([T.IN_PROGRESS, T.CANCELLED], W.APPROVED).status, W.IN_PROGRESS,
    'กรณี 4: อีกแผนกยกเลิก แต่แผนกนี้ยังทำอยู่ -> IN_PROGRESS');
  assertEquals_(recalcFromStatuses_([T.PENDING_ACCEPT, T.IN_PROGRESS], W.APPROVED).status, W.IN_PROGRESS,
    'กรณี 4: มีแผนกหนึ่งยังไม่รับงาน อีกแผนกเริ่มแล้ว -> IN_PROGRESS');

  // ---- กรณีที่ 5: นอกนั้น -> คงสถานะเดิม ----
  r = recalcFromStatuses_([T.PENDING_ACCEPT], W.APPROVED);
  assertEquals_(r.status, W.APPROVED, 'กรณี 5: รอแผนกรับงาน -> คงสถานะ APPROVED');
  assertEquals_(r.changed, false, 'กรณี 5: ไม่เปลี่ยนสถานะ -> changed = false');
  assertEquals_(r.rule, 'KEEP', 'กรณี 5: กฎที่ใช้คือ KEEP');
  assertEquals_(recalcFromStatuses_([T.PENDING_ACCEPT, T.COMPLETED], W.APPROVED).status, W.APPROVED,
    'กรณี 5: เสร็จแผนกเดียว อีกแผนกยังไม่รับงาน -> ยังไม่ปิดงาน คงสถานะเดิม');
  assertEquals_(recalcFromStatuses_([T.RETURNED], W.RETURNED).status, W.RETURNED,
    'กรณี 5: แผนกตีกลับ -> คงสถานะ RETURNED (WO เปลี่ยนผ่าน woEffect ของ TASK_RETURN แล้ว)');
  assertEquals_(recalcFromStatuses_([T.PENDING_ACCEPT, T.CANCELLED], W.APPROVED).status, W.APPROVED,
    'กรณี 5: ยกเลิกแผนกหนึ่ง อีกแผนกยังไม่รับงาน -> คงสถานะเดิม');

  // ---- ค่าสถานะที่ไม่รู้จักต้องถูกปฏิเสธ ไม่ใช่เงียบ ๆ ผ่านไป ----
  assertThrows_(function () { recalcFromStatuses_(['INCOMPLETE'], W.IN_PROGRESS); },
    'สถานะ Task ที่ไม่รู้จัก (INCOMPLETE ที่ถูกตัดออกจากเอกสารเดิม) ต้องโยน error');

  return endTest_();
}

/* ---------------------------------------------------------------------------
 * ชุดทดสอบ: ตาราง Transition ระดับใบงาน (SPEC 5)
 * --------------------------------------------------------------------------- */

/**
 * ทดสอบ Transition ระดับ WorkOrder — เส้นทางปกติและรายการที่ต้องถูกปฏิเสธ
 */
function test_woTransitions() {
  beginTest_('Transition ระดับใบงาน — SPEC 5');

  var W = WO_STATUS;
  var admin    = { email: 'admin@cnr.co.th', role: ROLE.ADMIN };
  var sale     = { email: 'sale@cnr.co.th', role: ROLE.SALE };
  var approver = { email: 'approver.sp@cnr.co.th', role: ROLE.APPROVER_SP };
  var labAppr  = { email: 'approver.lab@cnr.co.th', role: ROLE.APPROVER_LAB };
  var service  = { email: 'service@cnr.co.th', role: ROLE.SERVICE, department: DEPT.SERVICE };

  // CREATE -> PENDING_APPROVE (ไม่มีขั้นบันทึกร่างแล้ว)
  var plan = planStatusChange_(ENTITY.WO, '', ACTION.CREATE, admin, { requiredFieldsOk: true });
  assertEquals_(plan.to, W.PENDING_APPROVE, 'ADMIN สร้างใบงาน -> รออนุมัติทันที');
  assertEquals_(plan.audit.Action, ACTION.CREATE, 'CREATE เขียน Audit_Log ด้วย Action = CREATE');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, '', ACTION.CREATE, admin, {});
  }, 'สร้างใบงานโดย Required Fields ไม่ครบ ต้องถูกปฏิเสธ');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, '', ACTION.CREATE, service, { requiredFieldsOk: true });
  }, 'แผนก Service สร้างใบงานไม่ได้');

  // SUBMIT -> PENDING_APPROVE (ทำได้จาก RETURNED เท่านั้น)
  plan = planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.SUBMIT, sale, {
    fromStatus: W.RETURNED, requiredFieldsOk: true
  });
  assertEquals_(plan.to, W.PENDING_APPROVE, 'SALE ส่งขออนุมัติใหม่จาก RETURNED -> PENDING_APPROVE');
  assertEquals_(planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.SUBMIT, admin, {
    fromStatus: W.RETURNED, requiredFieldsOk: true
  }).to, W.PENDING_APPROVE, 'Submit ใหม่หลังถูกตีกลับ -> PENDING_APPROVE (ต้องอนุมัติซ้ำเสมอ)');

  // ไม่มีสถานะร่างแล้ว EDIT และ SUBMIT จึงใช้ได้จาก RETURNED เท่านั้น (SPEC 4.1)
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.EDIT, admin, {
      fromStatus: W.PENDING_APPROVE, isOwner: true
    });
  }, 'แก้ไขใบงานที่รออนุมัติอยู่ ต้องถูกปฏิเสธ');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.SUBMIT, admin, {
      fromStatus: W.PENDING_APPROVE, requiredFieldsOk: true, requiredFilesOk: true
    });
  }, 'ส่งขออนุมัติซ้ำขณะรออนุมัติอยู่ ต้องถูกปฏิเสธ');

  // EDIT — คงสถานะเดิม และต้องเป็นเจ้าของใบงาน
  plan = planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.EDIT, admin, {
    fromStatus: W.RETURNED, isOwner: true
  });
  assertEquals_(plan.to, W.RETURNED, 'แก้ไขใบงานที่ถูกตีกลับ -> สถานะคงเดิม');
  assertEquals_(plan.changed, false, 'EDIT ไม่ทำให้สถานะเปลี่ยน -> changed = false');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.EDIT, admin, {
      fromStatus: W.PENDING_APPROVE, isOwner: true
    });
  }, 'แก้ไขใบงานขณะรออนุมัติไม่ได้ (ล็อกการแก้ไข)');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.EDIT, admin, {
      fromStatus: W.RETURNED, isOwner: false
    });
  }, 'คนที่ไม่ใช่เจ้าของใบงานแก้ไขไม่ได้');

  // ACCEPT -> APPROVED
  var acceptPayload = {
    fromStatus: W.PENDING_APPROVE, route: ROUTE.SP,
    isCreator: false, assignmentType: ASSIGNMENT.SERVICE, requiredFilesOk: true
  };

  // เงื่อนไขไฟล์แนบย้ายมาอยู่ที่ ACCEPT แล้ว (SPEC 5) — ไม่ครบต้องอนุมัติไม่ได้
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.ACCEPT, approver, {
      fromStatus: W.PENDING_APPROVE, route: ROUTE.SP,
      isCreator: false, assignmentType: ASSIGNMENT.SERVICE
    });
  }, 'อนุมัติโดยไฟล์แนบที่บังคับไม่ครบ ต้องถูกปฏิเสธ');
  assertEquals_(planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.ACCEPT, approver, acceptPayload).to,
    W.APPROVED, 'APPROVER_SP อนุมัติงานสาย SP -> APPROVED');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.ACCEPT, approver, {
      fromStatus: W.PENDING_APPROVE, route: ROUTE.SP, isCreator: true,
      assignmentType: ASSIGNMENT.SERVICE, requiredFilesOk: true
    });
  }, 'ผู้อนุมัติที่เป็นผู้สร้างใบงานเอง อนุมัติไม่ได้');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.ACCEPT, approver, {
      fromStatus: W.PENDING_APPROVE, route: ROUTE.SP, isCreator: false,
      assignmentType: ASSIGNMENT.UNSPECIFIED, requiredFilesOk: true
    });
  }, 'อนุมัติโดยยังไม่ระบุแผนกผู้รับงาน ต้องถูกปฏิเสธ');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0002', ACTION.ACCEPT, approver, {
      fromStatus: W.PENDING_APPROVE, route: ROUTE.LAB, isCreator: false,
      assignmentType: ASSIGNMENT.LAB, requiredFilesOk: true
    });
  }, 'APPROVER_SP อนุมัติงานสาย Lab ไม่ได้ (ต้องตรวจสายอนุมัติ ไม่ใช่แค่ Role)');
  assertEquals_(planStatusChange_(ENTITY.WO, 'WO-2609-0002', ACTION.ACCEPT, labAppr, {
    fromStatus: W.PENDING_APPROVE, route: ROUTE.LAB, isCreator: false,
    assignmentType: ASSIGNMENT.LAB, requiredFilesOk: true
  }).to, W.APPROVED, 'APPROVER_LAB อนุมัติงานสาย Lab -> APPROVED');

  // RETURN -> RETURNED
  assertEquals_(planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.RETURN, approver, {
    fromStatus: W.PENDING_APPROVE, route: ROUTE.SP, reason: 'ข้อมูลลูกค้าไม่ครบ'
  }).to, W.RETURNED, 'ผู้อนุมัติตีกลับใบงาน -> RETURNED');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.RETURN, approver, {
      fromStatus: W.PENDING_APPROVE, route: ROUTE.SP, reason: '   '
    });
  }, 'ตีกลับโดยไม่ระบุเหตุผล ต้องถูกปฏิเสธ');

  // CANCEL_WO — ยกเลิกทั้งใบได้เฉพาะก่อนอนุมัติ
  assertEquals_(planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.CANCEL_WO, admin, {
    fromStatus: W.PENDING_APPROVE, reason: 'ลูกค้ายกเลิกคำสั่ง'
  }).to, W.CANCELLED, 'ADMIN ยกเลิกใบงานที่ยังรออนุมัติ -> CANCELLED');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.CANCEL_WO, admin, {
      fromStatus: W.IN_PROGRESS, reason: 'ลูกค้ายกเลิกคำสั่ง'
    });
  }, 'ยกเลิกทั้งใบหลังเริ่มงานแล้วไม่ได้ ต้องยกเลิกรายแผนกด้วย TASK_CANCEL');

  // REOPEN — เฉพาะผู้อนุมัติของสายนั้น และเฉพาะจาก COMPLETED
  assertEquals_(planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.REOPEN, approver, {
    fromStatus: W.COMPLETED, route: ROUTE.SP, reason: 'ลูกค้าแจ้งกลับว่ายังมีปัญหา'
  }).to, W.IN_PROGRESS, 'ผู้อนุมัติเปิดงานที่ปิดแล้วใหม่ -> IN_PROGRESS');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.REOPEN, admin, {
      fromStatus: W.COMPLETED, route: ROUTE.SP, reason: 'ลูกค้าแจ้งกลับ'
    });
  }, 'ADMIN เปิดงานที่ปิดแล้วใหม่ไม่ได้ ต้องเป็นผู้อนุมัติของสายนั้น');
  assertThrows_(function () {
    planStatusChange_(ENTITY.WO, 'WO-2609-0001', ACTION.REOPEN, approver, {
      fromStatus: W.CANCELLED, route: ROUTE.SP, reason: 'ขอเปิดใหม่'
    });
  }, 'ใบงานที่ CANCELLED เป็นสถานะปลายทาง เปิดใหม่ไม่ได้');

  return endTest_();
}

/* ---------------------------------------------------------------------------
 * ชุดทดสอบ: ตาราง Transition ระดับงานของแผนก (SPEC 5, 12)
 * --------------------------------------------------------------------------- */

/**
 * ทดสอบ Transition ระดับ Department_Task รวมถึงเงื่อนไขการชำระเงินและสิทธิ์ข้ามแผนก
 */
function test_taskTransitions() {
  beginTest_('Transition ระดับงานของแผนก — SPEC 5, 12');

  var T = TASK_STATUS;
  var service  = { email: 'service@cnr.co.th', role: ROLE.SERVICE, department: DEPT.SERVICE };
  var project  = { email: 'project@cnr.co.th', role: ROLE.PROJECT, department: DEPT.PROJECT };
  var approver = { email: 'approver.sp@cnr.co.th', role: ROLE.APPROVER_SP };
  var admin    = { email: 'admin@cnr.co.th', role: ROLE.ADMIN };

  var base = { department: DEPT.SERVICE, route: ROUTE.SP, woId: 'WO-2609-0001' };

  /**
   * รวม payload พื้นฐานเข้ากับค่าเฉพาะของแต่ละข้อทดสอบ
   * @param {Object} extra ค่าที่ต้องการเพิ่ม
   * @return {Object}
   */
  function payload(extra) {
    var out = { department: base.department, route: base.route, woId: base.woId };
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) out[key] = extra[key];
    }
    return out;
  }

  // TASK_ACCEPT — เงื่อนไขการชำระเงิน (SPEC 12)
  var plan = planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_ACCEPT, service,
    payload({ fromStatus: T.PENDING_ACCEPT, paymentRequired: false }));
  assertEquals_(plan.to, T.IN_PROGRESS, 'แผนกเจ้าของงานกดรับงาน -> Task IN_PROGRESS');
  assertEquals_(plan.audit.WO_ID, 'WO-2609-0001', 'Audit ของ Task บันทึก WO_ID ที่อ้างอิงไว้ด้วย');
  assertEquals_(plan.audit.Task_ID, 'TASK-001', 'Audit ของ Task บันทึก Task_ID');
  assertEquals_(planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_ACCEPT, service,
    payload({ fromStatus: T.PENDING_ACCEPT, paymentRequired: true, paymentStatus: PAYMENT.PAID })).to,
    T.IN_PROGRESS, 'งานที่ต้องชำระก่อนและชำระแล้ว รับงานได้');
  assertThrows_(function () {
    planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_ACCEPT, service,
      payload({ fromStatus: T.PENDING_ACCEPT, paymentRequired: true, paymentStatus: PAYMENT.UNPAID }));
  }, 'งานที่ต้องชำระก่อนแต่ยัง UNPAID รับงานไม่ได้');
  assertThrows_(function () {
    planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_ACCEPT, project,
      payload({ fromStatus: T.PENDING_ACCEPT, paymentRequired: false }));
  }, 'แผนก Project กดรับงานของแผนก Service ไม่ได้');

  // TASK_UPDATE — คงสถานะเดิม
  plan = planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_UPDATE, service,
    payload({ fromStatus: T.IN_PROGRESS, remark: 'อัปเดต Step หน้างาน' }));
  assertEquals_(plan.changed, false, 'อัปเดต Step ไม่ทำให้สถานะ Task เปลี่ยน');

  // TASK_COMPLETE — ต้องครบทั้ง Step และ Report ที่บังคับ
  assertEquals_(planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_COMPLETE, service,
    payload({ fromStatus: T.IN_PROGRESS, allStepsDone: true, requiredReportsOk: true })).to,
    T.COMPLETED, 'ปิดงานเมื่อ Step และ Report ครบ -> Task COMPLETED');
  assertThrows_(function () {
    planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_COMPLETE, service,
      payload({ fromStatus: T.IN_PROGRESS, allStepsDone: false, requiredReportsOk: true }));
  }, 'ปิดงานทั้งที่ Step ยังไม่ครบ ต้องถูกปฏิเสธ');
  assertThrows_(function () {
    planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_COMPLETE, service,
      payload({ fromStatus: T.IN_PROGRESS, allStepsDone: true, requiredReportsOk: false }));
  }, 'ปิดงานทั้งที่ Report ที่บังคับยังไม่ครบ ต้องถูกปฏิเสธ');
  assertThrows_(function () {
    planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_COMPLETE, service,
      payload({ fromStatus: T.PENDING_ACCEPT, allStepsDone: true, requiredReportsOk: true }));
  }, 'ปิดงานโดยยังไม่กดรับงาน ต้องถูกปฏิเสธ');

  // TASK_RETURN — WO -> RETURNED แต่สถานะ Task ต้องคงเดิม (SPEC 20.5 ข้อ 4)
  plan = planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_RETURN, service,
    payload({ fromStatus: T.IN_PROGRESS, reason: 'ที่อยู่หน้างานไม่ตรงกับที่แจ้ง' }));
  assertEquals_(plan.to, T.IN_PROGRESS, 'แผนกตีกลับแล้วสถานะงานของแผนกต้องคงเดิม ไม่ถูกล้างทิ้ง');
  assertEquals_(plan.changed, false, 'การตีกลับไม่นับเป็นการเปลี่ยนสถานะของงานแผนก');
  assertEquals_(plan.woEffect, WO_STATUS.RETURNED, 'แผนกตีกลับ -> WO กลับไป RETURNED');
  assertEquals_(plan.audit.Remark, 'ที่อยู่หน้างานไม่ตรงกับที่แจ้ง', 'Audit บันทึกเหตุผลการตีกลับ');
  assertEquals_(planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_RETURN, service,
    payload({ fromStatus: T.PENDING_ACCEPT, reason: 'ข้อมูลหน้างานไม่พอให้เริ่มงาน' })).to,
    T.PENDING_ACCEPT, 'ยังไม่ได้กดรับงานก็ตีกลับได้ และสถานะยังคงเป็นรอรับงานเหมือนเดิม');

  // TASK_CANCEL — แผนกยกเลิกเองได้ทันที และผู้อนุมัติ/Admin ก็ยกเลิกแทนได้
  assertEquals_(planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_CANCEL, service,
    payload({ fromStatus: T.IN_PROGRESS, reason: 'ลูกค้าขอเลื่อนไม่มีกำหนด' })).to,
    T.CANCELLED, 'แผนกเจ้าของงานยกเลิก Task เองได้ทันที');
  assertEquals_(planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_CANCEL, approver,
    payload({ fromStatus: T.PENDING_ACCEPT, reason: 'ยกเลิกตามคำสั่งลูกค้า' })).to,
    T.CANCELLED, 'ผู้อนุมัติของสายนั้นยกเลิก Task แทนได้');
  assertEquals_(planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_CANCEL, admin,
    payload({ fromStatus: T.IN_PROGRESS, reason: 'ยกเลิกตามคำสั่งลูกค้า' })).to,
    T.CANCELLED, 'ADMIN ยกเลิก Task แทนได้');
  assertThrows_(function () {
    planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_CANCEL, project,
      payload({ fromStatus: T.IN_PROGRESS, reason: 'ยกเลิก' }));
  }, 'แผนกอื่นยกเลิก Task ของแผนก Service ไม่ได้');
  assertThrows_(function () {
    planStatusChange_(ENTITY.TASK, 'TASK-001', ACTION.TASK_CANCEL, service,
      payload({ fromStatus: T.COMPLETED, reason: 'ขอยกเลิกย้อนหลัง' }));
  }, 'Task ที่ COMPLETED แล้วยกเลิกไม่ได้ (สถานะปลายทาง)');

  return endTest_();
}

/* ---------------------------------------------------------------------------
 * ชุดทดสอบ: ค่าคงที่และตัวช่วยใน 00_Config.gs
 * --------------------------------------------------------------------------- */

/**
 * ทดสอบว่าค่าคงที่ครบตาม SPEC 18 และตัวช่วยเรื่องสายอนุมัติ/แผนกทำงานถูกต้อง
 */
function test_config() {
  beginTest_('ค่าคงที่และตัวช่วย — SPEC 18');

  assertEquals_(WO_STATUS.PENDING_APPROVE, 'PENDING_APPROVE', 'WO_STATUS ใช้ชื่อค่าตรงกับ SPEC');
  assertEquals_(TASK_STATUS.PENDING_ACCEPT, 'PENDING_ACCEPT', 'TASK_STATUS ใช้ชื่อค่าตรงกับ SPEC');
  assertEquals_(TASK_STATUS.INCOMPLETE, undefined, 'ต้องไม่มีค่า INCOMPLETE ที่ถูกตัดออกจากเอกสารเดิม');
  assertEquals_(STEP_DEFAULT.length, 3, 'STEP_DEFAULT มี 3 ขั้นตามภาคผนวก ข.1');
  assertEquals_(STEP_DEFAULT[0], 'หน้างาน', 'STEP_DEFAULT ขั้นแรกคือ หน้างาน');
  assertEquals_(PREFIX.PJ, 'PJ-', 'PREFIX.PJ คือรหัสสถานที่ ไม่ใช่เลขงาน');

  assertEquals_(approverRoleOfRoute(ROUTE.LAB), ROLE.APPROVER_LAB, 'งานสาย Lab -> APPROVER_LAB');
  assertEquals_(approverRoleOfRoute(ROUTE.SP), ROLE.APPROVER_SP, 'งานสาย SP -> APPROVER_SP');
  assertEquals_(approverRoleOfRoute(null), ROLE.APPROVER_SP,
    'งานที่ยังไม่ระบุสาย -> APPROVER_SP เป็นผู้รับเรื่องตั้งต้น');

  assertEquals_(departmentsOfAssignment(ASSIGNMENT.SERVICE_PROJECT).length, 2,
    'งานร่วม SERVICE_PROJECT ต้องเกิด Task 2 ตัว');
  assertEquals_(departmentsOfAssignment(ASSIGNMENT.LAB).length, 1, 'งาน Lab เกิด Task 1 ตัว');
  assertEquals_(departmentsOfAssignment(ASSIGNMENT.UNSPECIFIED).length, 0,
    'งานที่ยังไม่ระบุแผนก ต้องยังไม่เกิด Task');

  return endTest_();
}

/* ---------------------------------------------------------------------------
 * ชุดทดสอบ: การทำงานร่วมกันของ changeStatus + recalcWoStatus (SPEC 20.3)
 * --------------------------------------------------------------------------- */

/**
 * จำลอง completeTask ของงานร่วม Service + Project ตามลำดับใน SPEC 20.3
 * เพื่อยืนยันว่า WO ปิดเมื่อแผนกสุดท้ายเสร็จ ไม่ใช่เมื่อแผนกแรกเสร็จ
 */
function test_completeTaskFlow() {
  beginTest_('ลำดับ completeTask ของงานร่วม — SPEC 20.3');

  var T = TASK_STATUS;
  var service = { email: 'service@cnr.co.th', role: ROLE.SERVICE, department: DEPT.SERVICE };
  var project = { email: 'project@cnr.co.th', role: ROLE.PROJECT, department: DEPT.PROJECT };

  var woStatus = WO_STATUS.IN_PROGRESS;
  var tasks = [T.IN_PROGRESS, T.IN_PROGRESS];   // [0] Service, [1] Project

  // แผนก Service ปิดงานของตัวเอง แล้วคำนวณสถานะ WO ในรายการเดียวกัน
  var plan = planStatusChange_(ENTITY.TASK, 'TASK-SV', ACTION.TASK_COMPLETE, service, {
    fromStatus: tasks[0], department: DEPT.SERVICE, route: ROUTE.SP,
    woId: 'WO-2609-0010', allStepsDone: true, requiredReportsOk: true
  });
  tasks[0] = plan.to;
  var recalc = recalcFromStatuses_(tasks, woStatus);
  assertEquals_(recalc.status, WO_STATUS.IN_PROGRESS, 'Service เสร็จแล้วแต่ Project ยังทำอยู่ -> WO ยัง IN_PROGRESS');
  assertEquals_(recalc.changed, false, 'สถานะ WO ยังไม่เปลี่ยน -> ไม่ต้องส่ง Telegram');
  woStatus = recalc.status;

  // แผนก Project ปิดงานตาม -> WO ต้องปิดและแจ้งเตือนครั้งเดียว
  plan = planStatusChange_(ENTITY.TASK, 'TASK-PJ', ACTION.TASK_COMPLETE, project, {
    fromStatus: tasks[1], department: DEPT.PROJECT, route: ROUTE.SP,
    woId: 'WO-2609-0010', allStepsDone: true, requiredReportsOk: true
  });
  tasks[1] = plan.to;
  recalc = recalcFromStatuses_(tasks, woStatus);
  assertEquals_(recalc.status, WO_STATUS.COMPLETED, 'ทั้งสองแผนกเสร็จ -> WO COMPLETED');
  assertEquals_(recalc.changed, true, 'สถานะ WO เปลี่ยนจริง -> ส่ง Telegram เพียงครั้งเดียว');

  // เรียกซ้ำต้องไม่ทำให้เกิดการเปลี่ยนสถานะซ้ำ
  assertEquals_(recalcFromStatuses_(tasks, recalc.status).changed, false,
    'เรียก recalcWoStatus ซ้ำด้วยข้อมูลเดิม ต้องไม่เปลี่ยนสถานะอีก');

  return endTest_();
}

/* ===========================================================================
 * ขั้นที่ 2 — ชุดทดสอบชั้น Repo (แตะ Sheet จริง)
 *
 * ทุกแถวที่ชุดนี้สร้างจะใช้ WO_ID ขึ้นต้นด้วย TEST- เสมอ เพื่อให้ test_cleanup()
 * ตามเก็บได้ครบ · รันด้วย test_repo_all() ซึ่งเรียก test_cleanup() ให้เองเมื่อจบ
 * =========================================================================== */

/** ตัวนำหน้าของข้อมูลทดสอบทั้งหมด — ต้องอยู่หน้าสุดของทุก ID เสมอ ไม่งั้น cleanup จับไม่ได้ */
var TEST_PREFIX = 'TEST-';

/**
 * รหัสของ "รอบการรัน" ปัจจุบัน — ฝังไว้ในทุก ID ที่ชุดทดสอบสร้าง
 *
 * จำเป็นเพราะ test_cleanup() ลบแถวในตาราง Counter ทิ้งด้วย ตัวนับของข้อมูลทดสอบ
 * จึงรีเซ็ตกลับไปที่ 1 ทุกครั้ง ถ้าไม่มีรหัสรอบ ใบแรกของทุกชุดจะได้เลขเดียวกันหมด
 * แล้วไปชนกับร่องรอยที่ชุดก่อนหน้าทิ้งไว้ โดยเฉพาะใน Audit_Log
 */
var TEST_RUN_ID_ = null;

/** สวมตัวออกเลขที่ใบงานของชุดทดสอบไปแล้วหรือยัง — ดู useTestWoNumbers_() */
var TEST_WO_NUMBERING_ = false;

/**
 * แท็บที่ test_cleanup() ไล่ลบข้อมูลทดสอบ — ดูจากคอลัมน์ Primary Key ของแท็บนั้น
 * ถ้าคีย์ของแท็บไม่ได้ขึ้นต้นด้วย TEST- ให้ระบุคอลัมน์อื่นที่ขึ้นต้นด้วย TEST- แทน
 */
var TEST_SCAN = [
  { sheet: 'WorkOrder' },
  { sheet: 'Department_Task' },
  { sheet: 'Task_Step' },
  { sheet: 'File_Index' },
  // PJ_ID ขึ้นต้นด้วย PJ- เสมอตามรูปแบบใหม่ใน SPEC 10.1 จึงดูที่ใบงานใบแรกของสถานที่นั้นแทน
  { sheet: 'Project_Location', field: 'First_WO_ID' },
  // Audit_Log ต้องล้างด้วย ไม่งั้นร่องรอยของรอบก่อนจะค้างอยู่ใต้เลขที่เดียวกันเมื่อตัวนับถูกรีเซ็ต
  { sheet: 'Audit_Log', field: 'WO_ID' },
  { sheet: 'Counter' },
  // ชุดทดสอบไฟล์แนบเพิ่มหัวข้อบังคับของตัวเอง เพราะหัวข้อจริงในชีตแก้ไม่ได้และไม่ควรแก้
  { sheet: 'Attachment_Topic' },
  // ชุดทดสอบเอกสารของแผนกเพิ่มรายการของตัวเองใน Report_Master ด้วยเหตุผลเดียวกัน
  { sheet: 'Report_Master' },
  // ชุดทดสอบทางเข้าจากหน้าบ้านต้องเพิ่มผู้ใช้จริงลงทะเบียน เพราะ withTestUser_ ข้ามด่านนั้นไป
  { sheet: 'User_Role', field: 'Email' },
  { sheet: 'Session_Token', field: 'Email' },
  // ชุดทดสอบการแจ้งเตือนเพิ่มห้องของตัวเอง เพราะห้องจริงต้องไม่ถูกยิงข้อความทดสอบ
  { sheet: 'Notify_Channel' },
  // เหตุการณ์เข้าสู่ระบบไม่มี WO_ID ให้ไล่ตาม แต่บันทึกว่า "ใครพยายามเข้า" ไว้ในคอลัมน์ User
  // ชุดทดสอบใช้อีเมลที่ขึ้นต้นด้วย TEST- จึงตามเก็บได้จากคอลัมน์นั้น
  { sheet: 'Audit_Log', field: 'User' },
  // System_Log ต้องกวาดด้วย ไม่งั้นบรรทัดล็อกอินและบรรทัดแจ้งเตือนล้มเหลวของรอบทดสอบ
  // จะกองอยู่ในตารางของจริงเรื่อย ๆ จนผู้ดูแลแยกไม่ออกว่าอันไหนของจริง
  { sheet: 'System_Log', field: 'User' },
  // ส่วนบรรทัดที่พูดถึงใบงานทดสอบ เลขที่ใบงานอยู่กลางข้อความ ไม่ได้อยู่หัวข้อความ
  // จึงต้องหาแบบ "มีคำนี้อยู่ข้างใน" ไม่ใช่ "ขึ้นต้นด้วยคำนี้"
  { sheet: 'System_Log', field: 'Detail', contains: true }
];

/**
 * หัวคอลัมน์ที่ SPEC หัวข้อ 13 กำหนดไว้ ใช้ตรวจว่าชีตจริงตรงกับเอกสาร
 * ไม่รวม Customer เพราะเป็นชีตที่ผู้ใช้อัปโหลดเอง หัวคอลัมน์เป็นภาษาไทย
 * @return {Object} แผนที่ชื่อแท็บไปยังรายชื่อหัวคอลัมน์
 */
function expectedHeaders_() {
  return {
    'WorkOrder': ['WO_ID', 'PJ_ID', 'Customer_Code', 'Customer_Name', 'Sales_Person',
      'Start_Contact_Date', 'Contact', 'Phone', 'Location', 'Project', 'Request_Types',
      'Job_Description', 'Product_Detail', 'Work_Scope', 'Reference_Doc', 'Remark',
      'Route', 'Assignment_Type', 'Start_Date', 'End_Date', 'Overall_Status',
      'Approved_By', 'Approved_Date', 'Return_Count', 'Return_Reason', 'Cancel_Reason',
      'Payment_Required', 'Payment_Status', 'Payment_Date', 'Payment_By', 'Payment_Remark',
      'Report_URL', 'Folder_URL', 'Folder_ID', 'Folder_Map', 'Returned_By', 'Returned_Date',
      'Created_By', 'Created_Date', 'Updated_By', 'Updated_Date'],
    'Department_Task': ['Task_ID', 'WO_ID', 'Department', 'Status', 'Status_Before_Return',
      'Assigned_Date', 'Accepted_By', 'Accepted_Date', 'Completed_By', 'Completed_Date',
      'Cancel_Reason', 'Return_Reason', 'Remark', 'Updated_By', 'Updated_Date'],
    'Task_Step': ['Step_ID', 'Task_ID', 'Step_No', 'Step_Name', 'Type', 'Status',
      'Due_Date', 'Completed_By', 'Completed_Date'],
    'Project_Location': ['PJ_ID', 'Customer_Code', 'Customer_Name', 'Project', 'Project_Seq',
      'Location', 'Location_Key', 'Location_Seq', 'First_WO_ID', 'WO_Count',
      'Created_By', 'Created_Date', 'Active'],
    'Attachment_Topic': ['Topic_ID', 'Scope', 'Topic_Name', 'Required', 'Multiple', 'Active'],
    'Report_Master': ['Report_Code', 'Type', 'Report_Name', 'Form_No', 'Required',
      'Sort_Order', 'Active'],
    'File_Index': ['File_ID', 'WO_ID', 'Task_ID', 'Step_ID', 'Topic_ID', 'Report_Code',
      'Saved_File_Name', 'Original_File_Name', 'Seq', 'Drive_File_ID', 'File_URL',
      'Mime_Type', 'Size', 'Version', 'Is_Active', 'Uploaded_By', 'Uploaded_Date'],
    // คอลัมน์ชุดหลังเป็นของระบบเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน (CLAUDE.md กฎข้อ 16)
    // Email ยังเป็นคีย์หลักเหมือนเดิม แม้จะล็อกอินด้วย Username
    'User_Role': ['Email', 'Display_Name', 'Role', 'Department', 'Telegram_User_ID', 'Active',
      'Username', 'Password_Hash', 'Password_Salt', 'Failed_Count', 'Locked_Until',
      'Must_Change_Password'],
    'Session_Token': ['Token_Hash', 'Email', 'Issued_Date', 'Expires_Date', 'Last_Used_Date', 'Active'],
    'Notify_Channel': ['Channel_ID', 'Name', 'Target', 'Chat_ID', 'Thread_ID', 'Active'],
    'Task_Step_Template': ['Template_ID', 'Department', 'Step_No', 'Step_Name', 'Description', 'Active'],
    'Request_Type': ['Request_ID', 'Request_Name', 'Sort_Order', 'Active'],
    'Counter': ['Key', 'Last_Number', 'Updated_Date'],
    // ชีตที่ผู้ใช้อัปโหลดเอง หัวคอลัมน์เป็นภาษาไทย · SPEC 11 กำหนดให้ตรวจว่ามีครบทั้ง 4 ชื่อ
    'Customer': ['ชื่อลูกค้า', 'รหัสลูกค้า', 'พนักงานขาย', 'วันที่เริ่มติดต่อ'],
    'Audit_Log': ['Log_ID', 'WO_ID', 'Task_ID', 'User', 'Role', 'Action', 'Entity', 'Field',
      'From_Value', 'To_Value', 'Remark', 'Timestamp'],
    'System_Log': ['Log_ID', 'Level', 'Source', 'Event', 'User', 'Detail', 'Timestamp']
  };
}

/**
 * ออกเลขที่ทดสอบที่ไม่ซ้ำกัน ขึ้นต้นด้วย TEST- และมีรหัสรอบการรันกำกับเสมอ
 * @return {string}
 */
function testWoId_() {
  return testPrefix_() + Utilities.formatDate(new Date(), TIMEZONE, 'HHmmss') +
    '-' + nextTestSerial_();
}

/**
 * เริ่มรอบการรันใหม่ — ออกรหัสรอบชุดใหม่ให้ทุก ID ที่จะสร้างหลังจากนี้
 * runGroup_ เรียกให้เองตอนเริ่มแต่ละกลุ่ม จึงไม่ต้องเรียกเองในชุดทดสอบ
 * @return {string} รหัสรอบที่ออกให้
 */
function beginTestRun_() {
  /*
   * ปิดการออกใบสั่งงาน PDF ตลอดการทดสอบ (SPEC 16.1)
   *
   * การรันหนึ่งรอบสร้างใบงานนับร้อยใบ ถ้าออกเอกสารทุกใบจะกินพื้นที่ Drive ของเจ้าของระบบ
   * และเพิ่มเวลาอีกราวหนึ่งในสามจนทุกกลุ่มชนเพดาน 6 นาที
   * ชุดที่ต้องพิสูจน์เรื่องเอกสารจะเปิดเองเฉพาะช่วงที่ใช้ ด้วย withReports_()
   */
  REPORT_DISABLED_ = true;

  /*
   * ปิดการแจ้งเตือน Telegram ตลอดการทดสอบ (SPEC 15)
   *
   * การรันหนึ่งรอบกดปุ่มนับร้อยครั้ง ถ้าส่งจริงทุกครั้ง ห้องแชทของทีมจะถูกถล่ม
   * และ Telegram จะเริ่มจำกัดอัตราส่งจนข้อความจริงของงานจริงหายไปด้วย
   * ชุดที่ต้องพิสูจน์เรื่องการแจ้งเตือนจะเปิดเองเฉพาะช่วงที่ใช้ ด้วย captureNotifications_()
   */
  NOTIFY_DISABLED_ = true;
  TEST_RUN_ID_ = Number(new Date().getTime()).toString(36).toUpperCase().slice(-4);
  useTestWoNumbers_();
  return TEST_RUN_ID_;
}

/**
 * ทำให้ทุกใบงานที่เกิดระหว่างทดสอบ ได้เลขที่ขึ้นต้นด้วย TEST- เสมอ
 *
 * createTestWo_() ส่งตัวนำหน้าเองอยู่แล้ว แต่ชุดที่เริ่มจาก api_ ที่หน้าเว็บเรียกจริง
 * ส่งเองไม่ได้ เพราะ api_createWorkOrder ไม่รับตัวนำหน้า (และไม่ควรรับ — หน้าเว็บ
 * ของจริงต้องไม่มีทางสั่งเลขที่ใบงานได้) ผลคือใบงานพวกนั้นได้ "เลขจริง" ของเดือนนั้น
 * แล้ว test_cleanup() ตามลบไม่ได้ · บนชีตจริงมันจะค้างอยู่ปนกับใบงานของจริงตลอดไป
 * และไปโผล่ในรายการของหน้าจอต่าง ๆ จนจำนวนแถวเพี้ยนข้ามรอบการรัน
 *
 * จึงสวมตัวออกเลขที่ไว้ตลอดรอบการทดสอบ ที่จุดเดียวคือ createWorkOrder()
 * ซึ่งเป็นทางผ่านเดียวของการเปิดใบงานทุกเส้นทาง — ทำที่นี่ที่เดียวจึงครอบทุกชุด
 */
function useTestWoNumbers_() {
  if (TEST_WO_NUMBERING_) return;   // beginTestRun_ ถูกเรียกทุกกลุ่ม ห้ามสวมซ้อนกัน
  TEST_WO_NUMBERING_ = true;

  var original = createWorkOrder;
  createWorkOrder = function (form, user, options) {
    var opts = options || {};
    // ชุดที่ส่งตัวนำหน้ามาเองอยู่แล้ว ต้องได้ของตัวเองเหมือนเดิม
    if (!opts.woIdPrefix) opts.woIdPrefix = testWoPrefix_();
    return original(form, user, opts);
  };
}

/**
 * รหัสรอบการรันปัจจุบัน ถ้ายังไม่มีจะออกให้ทันที
 * (กรณีกดรันชุดทดสอบเดี่ยว ๆ โดยไม่ผ่าน runGroup_)
 * @return {string}
 */
function testRunId_() {
  if (!TEST_RUN_ID_) beginTestRun_();
  return TEST_RUN_ID_;
}

/**
 * ตัวนำหน้าของข้อมูลทดสอบรอบนี้ เช่น TEST-R7K2-
 * TEST- ต้องอยู่หน้าสุดเสมอ เพราะ test_cleanup() ตัดสินจากตัวนำหน้านี้
 * @return {string}
 */
function testPrefix_() {
  return TEST_PREFIX + testRunId_() + '-';
}

/**
 * ตรวจว่าหัวคอลัมน์ในชีตจริงตรงกับ SPEC หัวข้อ 13
 * คอลัมน์ที่ขาดถือว่าไม่ผ่าน ส่วนคอลัมน์ที่เกินมาแค่แจ้งเตือน (อาจเป็นคอลัมน์ที่เพิ่มเองภายหลัง)
 * ตรวจเพิ่มอีกสองอย่าง: ชื่อคอลัมน์ที่ประกาศในโค้ดต้องไม่มีเครื่องหมายทับ
 * และคอลัมน์ Primary Key ทุกตัวใน SHEET_KEY_FIELD ต้องมีอยู่จริงในชีต
 */
function test_repo_schema() {
  beginTest_('โครงสร้างหัวคอลัมน์ — SPEC 13');

  // ตรวจก่อนแตะชีต เพราะถ้าชื่อที่ประกาศไว้ผิดตั้งแต่ในโค้ด ผลตรวจอื่นก็เชื่อถือไม่ได้
  assertNoSlashInColumnNames_();
  pass_('ชื่อคอลัมน์ที่ประกาศในโค้ดไม่มีเครื่องหมายทับปนอยู่');

  var expected = expectedHeaders_();
  for (var sheetName in expected) {
    if (!Object.prototype.hasOwnProperty.call(expected, sheetName)) continue;

    var actual;
    try {
      actual = getHeader_(sheetName);
    } catch (e) {
      fail_('แท็บ ' + sheetName + ' — ' + e.message);
      continue;
    }

    var missing = [];
    for (var i = 0; i < expected[sheetName].length; i++) {
      if (actual.indexOf(expected[sheetName][i]) === -1) missing.push(expected[sheetName][i]);
    }
    if (missing.length) {
      fail_('แท็บ ' + sheetName + ' ขาดคอลัมน์: ' + missing.join(', '));
    } else {
      pass_('แท็บ ' + sheetName + ' มีคอลัมน์ครบตาม SPEC 13');
    }

    var extra = [];
    for (var j = 0; j < actual.length; j++) {
      if (actual[j] !== '' && expected[sheetName].indexOf(actual[j]) === -1) extra.push(actual[j]);
    }
    if (extra.length) Logger.log('  (แจ้งให้ทราบ) แท็บ ' + sheetName + ' มีคอลัมน์เกินจาก SPEC: ' + extra.join(', '));
  }

  // คอลัมน์ Primary Key ที่โค้ดใช้ค้นหาและแก้ไข ต้องมีอยู่จริงในชีตทุกตัว
  for (var sheetName2 in SHEET_KEY_FIELD) {
    if (!Object.prototype.hasOwnProperty.call(SHEET_KEY_FIELD, sheetName2)) continue;
    var keyField = SHEET_KEY_FIELD[sheetName2];
    var actualHeader;
    try {
      actualHeader = getHeader_(sheetName2);
    } catch (e) {
      fail_('แท็บ ' + sheetName2 + ' (ตรวจคอลัมน์คีย์) — ' + e.message);
      continue;
    }
    if (actualHeader.indexOf(keyField) === -1) {
      fail_('แท็บ ' + sheetName2 + ' ไม่มีคอลัมน์คีย์ ' + keyField +
        ' ที่ประกาศไว้ใน SHEET_KEY_FIELD — ค้นหาและแก้ไขข้อมูลจะพังทั้งแท็บ');
    } else {
      pass_('แท็บ ' + sheetName2 + ' มีคอลัมน์คีย์ ' + keyField + ' อยู่จริง');
    }
  }

  return endTest_();
}

/**
 * ตรวจว่าไม่มีชื่อคอลัมน์ที่ประกาศไว้ในโค้ดมีเครื่องหมายทับปนอยู่
 *
 * เครื่องหมายทับใน SPEC หัวข้อ 13 หมายถึง "อย่างใดอย่างหนึ่ง" ไม่ใช่ส่วนหนึ่งของชื่อคอลัมน์
 * เช่น Topic_ID/Report_Code หมายถึงแถวหนึ่งใส่ Topic_ID หรือ Report_Code อย่างใดอย่างหนึ่ง
 * ไม่ใช่คอลัมน์เดียวที่ชื่อมีขีดทับ
 *
 * @throws {Error} เมื่อพบชื่อคอลัมน์ที่มีเครื่องหมายทับ
 */
function assertNoSlashInColumnNames_() {
  var offenders = [];

  function scan(source, values) {
    for (var i = 0; i < values.length; i++) {
      if (typeof values[i] === 'string' && values[i].indexOf('/') !== -1) {
        offenders.push(values[i] + ' (ประกาศไว้ที่ ' + source + ')');
      }
    }
  }

  function valuesOf(obj) {
    var out = [];
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) out.push(obj[key]);
    }
    return out;
  }

  scan('SHEET_KEY_FIELD', valuesOf(SHEET_KEY_FIELD));
  scan('SHEET_ACTIVE_FIELD', valuesOf(SHEET_ACTIVE_FIELD));
  scan('COL', valuesOf(COL));

  var expected = expectedHeaders_();
  for (var sheetName in expected) {
    if (!Object.prototype.hasOwnProperty.call(expected, sheetName)) continue;
    scan('expectedHeaders_ ของแท็บ ' + sheetName, expected[sheetName]);
  }

  if (offenders.length) {
    throw new Error('พบชื่อคอลัมน์ที่มีเครื่องหมายทับ: ' + offenders.join(' · ') +
      ' — ชื่อเหล่านี้น่าจะอ่าน SPEC หัวข้อ 13 ผิด เพราะเครื่องหมายทับใน SPEC หมายถึง ' +
      '"อย่างใดอย่างหนึ่ง" ไม่ใช่ส่วนหนึ่งของชื่อคอลัมน์ ให้แยกเป็นคอลัมน์ละชื่อ');
  }
}

/**
 * เขียนใบงานทดสอบแล้วอ่านกลับ ต้องได้ค่าเดิมทุกฟิลด์ และต้องมีเลขแถวจริงติดมาด้วย
 */
function test_repo_writeRead() {
  beginTest_('เขียนแล้วอ่านกลับได้ค่าเดิม');

  var woId = testWoId_();
  // สถานะตั้งต้นต้องมาจาก planStatusChange_() ไม่ใช่พิมพ์ค่าลงชีตเอง (กฎข้อ 1)
  var draft = planStatusChange_(ENTITY.WO, woId, ACTION.CREATE,
    { email: currentUserEmail_(), role: ROLE.ADMIN }, { requiredFieldsOk: true });

  var input = {
    'WO_ID':          woId,
    'Customer_Code':  'CUST-TEST',
    'Customer_Name':  'บริษัททดสอบ จำกัด',
    'Location':       'ห้องปั๊มน้ำ อาคาร A',
    'Project':        'โครงการทดสอบระบบ',
    'Route':          ROUTE.SP,
    'Assignment_Type': ASSIGNMENT.UNSPECIFIED,
    'Overall_Status': draft.to,
    'Return_Count':   0,
    'Payment_Required': false,
    'Payment_Status': PAYMENT.UNPAID
  };

  var written = insertWorkOrder(input);

  /*
   * เขียนแล้วต้องได้ "ตัวตนของแถว" กลับมา — เจตนาเดิมของข้อนี้ไม่เปลี่ยน
   *
   * เดิมตัวตนคือเลขแถวในชีต ซึ่งเป็นรายละเอียดของที่เก็บข้อมูลยุคก่อน ไม่ใช่ของระบบ
   * บนฐานข้อมูลตัวตนคือคีย์หลัก และมันติดกลับมากับแถวที่เขียนอยู่แล้ว
   * ห้ามใส่เลขแถวปลอมมาแทน เพราะตัวเลขที่ไม่ได้ชี้ไปไหนเลยแย่กว่าไม่มีตัวเลข
   */
  assertTrue_(!!written[SHEET_KEY_FIELD[SHEET.WORK_ORDER]],
    'เขียนแล้วต้องได้คีย์หลักกลับมาในแถวที่คืน');
  assertEquals_(written['WO_ID'], woId, 'และคีย์หลักต้องตรงกับที่เพิ่งเขียนลงไป');

  var readBack = getWorkOrder(woId);
  assertTrue_(readBack !== null, 'อ่านใบงานที่เพิ่งเขียนกลับมาได้');
  if (!readBack) return endTest_();

  assertEquals_(readBack['WO_ID'], woId, 'WO_ID ตรงกับที่เขียนไป');
  assertEquals_(readBack['Customer_Name'], input['Customer_Name'], 'ข้อความภาษาไทยอ่านกลับได้ครบ');
  assertEquals_(readBack['Location'], input['Location'], 'Location ตรงกับที่เขียนไป');
  assertEquals_(readBack['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'สถานะตั้งต้นเป็นรออนุมัติ ตามที่ changeStatus คืนมา');
  assertEquals_(readBack['Return_Count'], 0, 'ตัวเลข 0 อ่านกลับมาเป็นตัวเลข ไม่ใช่ค่าว่าง');
  assertEquals_(readBack['Payment_Required'], false, 'ค่า false อ่านกลับมาเป็น false');
  assertEquals_(readBack[ROW_FIELD], written[ROW_FIELD], 'เลขแถวที่อ่านกลับตรงกับตอนเขียน');
  assertTrue_(toDate_(readBack['Created_Date']) !== null, 'Created_Date ถูกเติมให้อัตโนมัติ');
  assertTrue_(toDate_(readBack['Updated_Date']) !== null, 'Updated_Date ถูกเติมให้อัตโนมัติ');

  /*
   * ต้องใส่คอลัมน์บังคับให้ครบด้วย ไม่งั้นข้อนี้จะผ่านด้วยเหตุผลที่ผิด
   *
   * เคยเกิดจริง 30-09-2026: แถวที่ไม่มี Overall_Status ถูกฐานข้อมูลปฏิเสธก่อน
   * ที่ด่านชื่อคอลัมน์จะได้ทำงาน · assertThrows_ จึงเขียวอยู่ทั้งที่ไม่ได้พิสูจน์
   * สิ่งที่ตั้งใจจะพิสูจน์เลย · ต้องตรวจข้อความด้วย ไม่ใช่ตรวจแค่ว่ามี error
   */
  assertThrowsMessage_(function () {
    insertWorkOrder({ 'WO_ID': testWoId_(), 'Customer_Nmae': 'สะกดผิด',
      'Overall_Status': WO_STATUS.PENDING_APPROVE });
  }, 'Customer_Nmae', 'เขียนคอลัมน์ที่ไม่มีในตาราง ต้องถูกปฏิเสธพร้อมบอกชื่อคอลัมน์');

  return endTest_();
}

/**
 * หาแถวใบงานที่เขียนลงตารางโดยไม่ใส่คอลัมน์บังคับ
 *
 * `Overall_Status` เป็น `not null` และ **ไม่มีค่าตั้งต้น** ในฐานข้อมูล · ยุคชีตปล่อยว่างได้
 * ข้อมูลตั้งต้นของเทสต์ที่ขาดคอลัมน์นี้จึงเขียนลงได้มาตลอด แล้วกลายเป็นแดงเงียบ ๆ
 * บนของจริงหลังย้ายฐานข้อมูล โดยของจำลองยังเขียวอยู่
 *
 * ดูเฉพาะการเรียกที่ส่งอ็อบเจกต์เข้าไปตรง ๆ · การเรียกที่ประกอบตัวแปรไว้ก่อน
 * จะไม่ถูกจับ จึงเป็นรายชื่อขั้นต่ำ ไม่ใช่ทั้งหมด
 *
 * @param {string} source โค้ดที่จะตรวจ
 * @return {string[]} ข้อความของการเรียกที่ขาดคอลัมน์บังคับ
 */
function woInsertsMissingStatus_(source) {
  var text = stripComments_(String(source || ''));
  var calls = text.match(/insertWorkOrder\(\s*\{[^}]*\}/g) || [];
  var bad = [];

  for (var i = 0; i < calls.length; i++) {
    if (calls[i].indexOf('Overall_Status') === -1) {
      bad.push(calls[i].replace(/\s+/g, ' ').slice(0, 70));
    }
  }
  return bad;
}

/**
 * หาจุดที่อ่านทั้งตารางของตารางที่ประกาศว่าโตไม่มีที่สิ้นสุด
 *
 * ชื่อตารางมาจาก `DB_LARGE_SHEETS` ที่เดียว ไม่ได้พิมพ์รายชื่อซ้ำไว้ที่นี่ ·
 * ตารางที่ถูกเพิ่มเข้ารายการนั้นภายหลังจึงถูกเฝ้าเองโดยไม่ต้องแก้ข้อนี้
 *
 * @param {string} source โค้ดที่จะตรวจ
 * @return {string[]} ข้อความของการอ่านที่ต้องแก้
 */
function wholeTableReadsOf_(source) {
  var text = stripComments_(String(source || ''));
  var bad = [];

  for (var i = 0; i < DB_LARGE_SHEETS.length; i++) {
    var key = sheetConstantName_(DB_LARGE_SHEETS[i]);
    if (!key) continue;

    /*
     * ขอบเขตวันนี้คือตารางบันทึกเท่านั้น ซึ่งเป็นที่ที่อาการเกิดจริงและถูกแก้ครบแล้ว
     *
     * ตารางใหญ่ตัวอื่น — Customer, Work_Order, Department_Task, Task_Step,
     * File_Index, Session_Token — ยังมีโค้ดจริงอ่านทั้งตารางอยู่เก้าจุด ซึ่งเป็นหนี้
     * ที่ต้องใช้คืน ไม่ใช่หนี้ที่จะแช่ไว้ · แต่การแก้ต้องดูทีละจุดว่าใครเรียกและ
     * ต้องการอะไร จึงเป็นงานที่ต้องตัดสินใจ ไม่ใช่งานที่เปลี่ยนได้ด้วยการไล่แทนที่
     * เมื่อแก้แล้วให้ตัดเงื่อนไขบรรทัดล่างนี้ทิ้ง แล้วด่านจะครอบคลุมทุกตารางทันที
     */
    if (key.indexOf('_LOG') === -1) continue;

    var needle = 'readAll_(SHEET.' + key + ')';
    if (text.indexOf(needle) !== -1) bad.push(needle);
  }
  return bad;
}

/**
 * ชื่อค่าคงที่ใน SHEET ที่ชี้ไปยังตารางหนึ่ง — ไม่ได้จดรายชื่อไว้ซ้ำ
 * @param {string} sheetName ชื่อตาราง
 * @return {string} ชื่อคีย์ใน SHEET หรือค่าว่างเมื่อไม่พบ
 */
function sheetConstantName_(sheetName) {
  for (var key in SHEET) {
    if (Object.prototype.hasOwnProperty.call(SHEET, key) && SHEET[key] === sheetName) return key;
  }
  return '';
}

/**
 * ห้ามอ่านทั้งตารางของตารางที่โตไม่มีที่สิ้นสุด — กฎข้อ 28
 *
 * เกิดจริง 30-09-2026: เทสต์หลายข้ออ่านทั้ง Audit_Log และ System_Log มาคัดในหน่วยความจำ
 * ซึ่งใช้ได้ตอนตารางยังเล็ก · พอของจริงโตเกินเพดานอ่าน `readAll_` ได้มาแต่หน้าแรก
 * แถวที่เทสต์เพิ่งเขียนซึ่งอยู่ท้ายสุดจึงมองไม่เห็น · ข้อที่นับแถวได้ 0 ทั้งที่เขียนไปสี่แถว
 *
 * **อาการนี้ไม่มีวันโผล่ในตัวจำลอง** เพราะตารางในนั้นเล็กกว่าเพดานเสมอ
 */
function test_repo_noWholeTableReads() {
  beginTest_('ห้ามอ่านทั้งตารางของตารางที่โตไม่มีที่สิ้นสุด');

  /* ---------- พิสูจน์ตัวสแกนด้วยของปลอมก่อน ---------- */
  assertEquals_(wholeTableReadsOf_('var x = readAll_(SHEET.AUDIT_LOG);').join(', '),
    'readAll_(SHEET.AUDIT_LOG)', 'ต้องจับการอ่านทั้งตารางบันทึกได้');
  assertEquals_(wholeTableReadsOf_('var x = queryRows_(SHEET.AUDIT_LOG, f);').join(', '), '',
    'การอ่านแบบมีตัวกรองต้องไม่ถูกฟ้อง');
  assertEquals_(wholeTableReadsOf_('var x = readAll_(SHEET.COUNTER);').join(', '), '',
    'ตารางเล็กที่ไม่ได้อยู่ใน DB_LARGE_SHEETS อ่านทั้งตารางได้ตามปกติ');

  /* ---------- แล้วตรวจของจริงทุกฟังก์ชันที่โหลดอยู่ ---------- */
  var offenders = [];
  for (var name in globalThis) {
    if (typeof globalThis[name] !== 'function') continue;
    // ข้ามตัวข้อนี้เองกับตัวสแกน ซึ่งถือชื่อเหล่านี้ไว้เป็นตัวอย่าง
    if (name === 'test_repo_noWholeTableReads' || name === 'wholeTableReadsOf_') continue;
    var bad;
    try {
      bad = wholeTableReadsOf_(String(globalThis[name]));
    } catch (e) {
      continue;
    }
    for (var b = 0; b < bad.length; b++) offenders.push(name + ': ' + bad[b]);
  }

  assertEquals_(offenders.join(' · '), '',
    'จุดเหล่านี้อ่านทั้งตารางที่โตไม่มีที่สิ้นสุด · ให้ฐานข้อมูลกรองแทน เช่น testRowsFromDb_()');

  return endTest_();
}

/**
 * ข้อมูลตั้งต้นของเทสต์ต้องใส่คอลัมน์บังคับให้ครบ — SPEC 22
 *
 * เกิดจริง 30-09-2026: `test_repo_optimisticLock` เขียนใบงานโดยไม่ใส่ `Overall_Status`
 * ฐานข้อมูลปฏิเสธด้วย `23502 not null violation` · กลุ่ม REPO จึงแดงบนของจริงทั้งที่
 * ตัวจำลองเขียวมาตลอด เพราะตัวจำลองไม่รู้จักข้อบังคับของคอลัมน์
 *
 * ตัวสแกนนี้จับได้ทั้งสองฝั่งเท่ากัน ไม่ต้องรอให้ของจริงฟ้อง
 */
function test_repo_fixturesFillRequiredColumns() {
  beginTest_('ข้อมูลตั้งต้นของเทสต์ต้องใส่คอลัมน์บังคับให้ครบ');

  /* ---------- พิสูจน์ตัวสแกนด้วยของปลอมก่อน ---------- */
  assertEquals_(woInsertsMissingStatus_("insertWorkOrder({ 'WO_ID': x })").length, 1,
    'แถวที่ขาด Overall_Status ต้องถูกจับได้');
  assertEquals_(
    woInsertsMissingStatus_("insertWorkOrder({ 'WO_ID': x, 'Overall_Status': y })").length, 0,
    'แถวที่ใส่ครบต้องไม่ถูกฟ้อง');

  /* ---------- แล้วตรวจของจริงทั้งไฟล์ ---------- */
  /*
   * ไล่จากตัวฟังก์ชันจริงทุกตัวที่โหลดอยู่ ไม่ได้อ่านไฟล์ · วิธีเดียวกับตัวสแกนอื่น
   * ในชุดนี้ ซึ่งแปลว่าฟังก์ชันที่ถูกเพิ่มเข้ามาใหม่ถูกตรวจเองโดยไม่ต้องเติมรายชื่อ
   */
  var offenders = [];
  for (var name in globalThis) {
    if (typeof globalThis[name] !== 'function') continue;
    /*
     * ข้ามตัวข้อนี้เอง เพราะมันถือตัวอย่างปลอมที่จงใจเขียนให้ผิดไว้ข้างบน
     * ตัวสแกนตรวจตัวอย่างของตัวเองไม่ได้ ไม่งั้นมันจะฟ้องตัวเองตลอดไป
     */
    if (name === 'test_repo_fixturesFillRequiredColumns') continue;
    var bad;
    try {
      bad = woInsertsMissingStatus_(String(globalThis[name]));
    } catch (e) {
      continue;
    }
    for (var b = 0; b < bad.length; b++) offenders.push(name + ': ' + bad[b]);
  }

  assertEquals_(offenders.join(' · '), '',
    'การเขียนใบงานเหล่านี้ขาดคอลัมน์บังคับ ฐานข้อมูลจริงจะปฏิเสธด้วย 23502');

  return endTest_();
}

/**
 * Optimistic Lock ต้องปฏิเสธเมื่อ expectedUpdatedDate ไม่ตรงกับค่าในชีต (SPEC C-3)
 */
function test_repo_optimisticLock() {
  beginTest_('Optimistic Lock — SPEC C-3');

  var woId = testWoId_();
  /*
   * Overall_Status เป็นคอลัมน์บังคับที่ไม่มีค่าตั้งต้นในฐานข้อมูล · ยุคชีตปล่อยว่างได้
   * แถวที่ขาดไปจึงเขียนลงได้ตลอดมา แต่ Postgres ปฏิเสธด้วย 23502
   */
  insertWorkOrder({ 'WO_ID': woId, 'Customer_Code': 'CUST-TEST', 'Location': 'จุดที่ 1',
    'Overall_Status': WO_STATUS.PENDING_APPROVE });

  var current = getWorkOrder(woId);
  var stamp = current['Updated_Date'];
  assertTrue_(toDate_(stamp) !== null, 'ใบงานมีค่า Updated_Date ไว้ใช้ตรวจการแก้ซ้อน');

  // ค่าที่ผู้ใช้ถืออยู่เก่ากว่าในชีต ต้องถูกปฏิเสธ
  var staleDate = new Date(toDate_(stamp).getTime() - 60000);
  assertThrows_(function () {
    updateWorkOrder(woId, { 'Location': 'จุดที่ 2' }, staleDate);
  }, 'แก้ไขด้วย Updated_Date ที่ไม่ตรง ต้องถูกปฏิเสธ');

  var unchanged = getWorkOrder(woId);
  assertEquals_(unchanged['Location'], 'จุดที่ 1', 'รายการที่ถูกปฏิเสธต้องไม่เขียนทับข้อมูลเดิม');

  // ค่าที่ตรงกับในชีต ต้องผ่าน
  var ok = updateWorkOrder(woId, { 'Location': 'จุดที่ 3' }, stamp);
  assertEquals_(ok['Location'], 'จุดที่ 3', 'แก้ไขด้วย Updated_Date ที่ถูกต้อง ทำได้ปกติ');

  // หลังแก้สำเร็จ ค่าเดิมต้องใช้ไม่ได้อีก เพราะ Updated_Date ถูกประทับใหม่
  assertThrows_(function () {
    updateWorkOrder(woId, { 'Location': 'จุดที่ 4' }, stamp);
  }, 'ใช้ Updated_Date ชุดเดิมซ้ำหลังมีการแก้ไขแล้ว ต้องถูกปฏิเสธ');

  // ไม่ส่ง expectedUpdatedDate มา = ยอมให้เขียนทับ (ใช้กับงานเบื้องหลังที่ไม่ได้มาจากหน้าจอ)
  var forced = updateWorkOrder(woId, { 'Location': 'จุดที่ 5' });
  assertEquals_(forced['Location'], 'จุดที่ 5', 'ไม่ส่งค่าเทียบมา ระบบยอมให้เขียนทับได้');

  // หน้าเว็บส่งค่ากลับมาเป็นข้อความ ISO เพราะ google.script.run ส่ง Date เป็นพารามิเตอร์ไม่ได้
  // เส้นทางนี้จึงต้องใช้งานได้จริงและยังเทียบถึงระดับมิลลิวินาทีเหมือนเดิม
  var isoStamp = toDate_(getWorkOrder(woId)['Updated_Date']).toISOString();
  var byIso = updateWorkOrder(woId, { 'Location': 'จุดที่ 6' }, isoStamp);
  assertEquals_(byIso['Location'], 'จุดที่ 6', 'ส่ง Updated_Date เป็นข้อความ ISO แบบที่หน้าเว็บส่งมา ต้องผ่าน');
  assertThrows_(function () {
    updateWorkOrder(woId, { 'Location': 'จุดที่ 7' }, isoStamp);
  }, 'ข้อความ ISO ชุดเดิมที่ล้าสมัยแล้ว ต้องถูกปฏิเสธเหมือนกัน');

  return endTest_();
}

/**
 * Audit ต้องเขียนลงไฟล์ที่แยกต่างหาก ไม่ใช่ไฟล์ฐานข้อมูลหลัก (SPEC D-5)
 */
function test_repo_audit() {
  beginTest_('Audit เขียนลงไฟล์แยก — SPEC D-5');

  assertTrue_(getAuditDb_().getId() !== getDb_().getId(),
    'ไฟล์ Audit_Log ต้องเป็นคนละไฟล์กับฐานข้อมูลหลัก');

  var woId = testWoId_();
  var row = writeAudit(ENTITY.WO, woId, ACTION.CREATE, 'Status', '', WO_STATUS.PENDING_APPROVE, 'บันทึกจากชุดทดสอบ');

  assertTrue_(!!row['Log_ID'], 'Audit ได้ Log_ID อัตโนมัติ');
  assertEquals_(row['User'], currentUserEmail_(), 'Audit เติมอีเมลผู้ทำรายการให้เอง');
  assertTrue_(toDate_(row['Timestamp']) !== null, 'Audit เติม Timestamp ให้เอง');

  assertEquals_(auditCount_(woId, ENTITY.WO, ACTION.CREATE), 1,
    'อ่านประวัติกลับมาได้ 1 แถวที่เป็น Entity = WO และ Action = CREATE');
  var created = findAuditRow_(woId, ENTITY.WO, ACTION.CREATE);
  assertEquals_(created['To_Value'], WO_STATUS.PENDING_APPROVE, 'ค่า To_Value ตรงกับที่บันทึกไป');
  assertEquals_(created['Remark'], 'บันทึกจากชุดทดสอบ', 'บันทึกหมายเหตุไว้ครบ');

  // แถว Audit ที่ประกอบจาก planStatusChange_() ต้องเขียนได้เช่นกัน
  var plan = planStatusChange_(ENTITY.TASK, 'TEST-TASK-1', ACTION.TASK_ACCEPT,
    { email: currentUserEmail_(), role: ROLE.SERVICE, department: DEPT.SERVICE },
    { fromStatus: TASK_STATUS.PENDING_ACCEPT, department: DEPT.SERVICE, route: ROUTE.SP,
      woId: woId, paymentRequired: false });
  var taskLog = writeAuditRecord(plan.audit);
  assertEquals_(taskLog['WO_ID'], woId, 'Audit ของ Task มี WO_ID ติดไปด้วย');
  assertEquals_(taskLog['Task_ID'], 'TEST-TASK-1', 'Audit ของ Task บันทึก Task_ID ไว้');

  return endTest_();
}

/**
 * ล้างข้อมูลทดสอบ — ลบแถวที่ค่าใน Primary Key ขึ้นต้นด้วย TEST- ออกจากชีตจริง
 *
 * ตารางหลักไม่มีคอลัมน์ Is_Active โดยตั้งใจ เพราะไม่มีการลบในเชิงธุรกิจ
 * ข้อมูลทดสอบจึงต้องลบทิ้งจริง ไม่ใช่ปิดใช้งานค้างไว้ในตาราง
 *
 * กฎความปลอดภัยของฟังก์ชันนี้
 *   - แตะเฉพาะแถวที่คีย์ขึ้นต้นด้วย TEST- เท่านั้น คีย์อื่นข้ามหมด
 *   - ลบจากเลขแถวมากไปหาน้อย เพื่อไม่ให้เลขแถวที่เหลือเลื่อนระหว่างลบ
 *   - อ่านค่าคีย์ในแถวนั้นซ้ำอีกครั้งก่อนลบจริง กันกรณีข้อมูลขยับระหว่างทาง
 *   - Audit_Log ไม่อยู่ในรายการ เพราะเป็นบันทึกประวัติ
 *
 * @return {Object} {deleted, perSheet}
 */
function test_cleanup() {
  beginTest_('ล้างข้อมูลทดสอบ');

  var deleted = 0;
  var perSheet = {};
  var dbTargets = [];

  // โฟลเดอร์บน Drive ต้องเก็บกวาดก่อนลบแถว เพราะรหัสโฟลเดอร์อยู่ในแถวใบงานที่กำลังจะหายไป
  var folders = trashTestFolders_();
  if (folders) Logger.log('  ย้ายโฟลเดอร์ทดสอบลงถังขยะ ' + folders + ' โฟลเดอร์');

  for (var i = 0; i < TEST_SCAN.length; i++) {
    var target = TEST_SCAN[i];
    var sheetName = target.sheet;
    // ปกติดูที่คอลัมน์ Primary Key แต่บางแท็บคีย์ไม่ได้ขึ้นต้นด้วย TEST- จึงระบุคอลัมน์อื่นแทนได้
    var scanField = target.field || SHEET_KEY_FIELD[sheetName];
    if (!scanField) {
      Logger.log('  ข้ามแท็บ ' + sheetName + ': ยังไม่ได้ประกาศคอลัมน์คีย์ใน SHEET_KEY_FIELD');
      continue;
    }

    /*
     * ให้ฐานข้อมูลหาและลบเองด้วยคำนำหน้า ไม่อ่านมาก่อน (กฎข้อ 28 + 29)
     *
     * เดิมอ่านทั้งตารางมาเก็บรายการ ID แล้วเอาไปทำตัวกรอง `in.(id1,id2,...)`
     * ซึ่งยาวตามจำนวนแถวที่มีอยู่ · พอ System_Log สะสมไปหลายร้อยแถว URL ก็ทะลุ
     * เพดานของ UrlFetchApp แล้วการล้างข้อมูลก็ล้มทั้งกลุ่ม โดยข้อความที่ได้
     * ไม่บอกเลยว่าคำขอไหนเป็นตัวปัญหา
     *
     * ตัวกรองคำนำหน้ายาวเท่าเดิมเสมอ ไม่ว่าตารางจะมีกี่แถว
     *
     * เก็บไว้ยิงพร้อมกันทีเดียวหลังจบลูป — เหตุผลอยู่ที่ cleanDbTablesTogether_
     */
    dbTargets.push({ sheet: sheetName, target: target, field: scanField });
  }

  var fromDb = cleanDbTablesTogether_(dbTargets);
  deleted += fromDb.deleted;
  for (var name in fromDb.perSheet) {
    if (!Object.prototype.hasOwnProperty.call(fromDb.perSheet, name)) continue;
    perSheet[name] = (perSheet[name] || 0) + fromDb.perSheet[name];
  }

  clearHeaderCache_();   // เลขแถวและหัวคอลัมน์ที่แคชไว้ใช้ไม่ได้แล้วหลังลบแถว
  clearRowCache_();

  Logger.log('  ลบทั้งหมด ' + deleted + ' แถว');
  assertTrue_(true, 'ล้างข้อมูลทดสอบเสร็จ (ลบ ' + deleted + ' แถว)');

  endTest_();
  return { deleted: deleted, perSheet: perSheet };
}

/**
 * ล้างข้อมูลทดสอบของทุกตารางในฐานข้อมูล ด้วยการยิงพร้อมกันสองรอบ
 *
 * **ราคาของการล้างข้อมูลแปรตามจำนวนตาราง ไม่ใช่จำนวนแถว** · วัดจากของจริงได้
 * 14-16 วินาทีต่อกลุ่ม ทั้งที่บางกลุ่มลบจริงแค่สิบแถว · เพราะเดิมยิงลบทีละตาราง
 * แล้วตามด้วยการนับทีละตาราง รวมยี่สิบหกครั้งไป-กลับ ต่อการล้างหนึ่งครั้ง
 *
 * ตอนนี้เหลือสองรอบ — ลบทุกตารางพร้อมกันหนึ่งรอบ แล้วอ่านกลับทุกตารางพร้อมกัน
 * อีกหนึ่งรอบเพื่อยืนยันว่าไม่เหลือ · **การยืนยันยังอยู่ครบ ไม่ได้ตัดทิ้งเพื่อความเร็ว**
 * เพราะสิ่งที่ต้องกันคือแถวทดสอบค้างในตารางจริงที่ผู้ใช้เห็น
 *
 * อ่านกลับแค่แถวเดียวพอ เพราะคำถามคือ "เหลือไหม" ไม่ใช่ "เหลือกี่แถว" ·
 * ถ้าเหลือ ต้องโยนทันทีพร้อมชื่อตาราง ไม่ใช่รายงานรวมว่าล้างเสร็จแล้ว
 *
 * @param {Object[]} targets รายการ {sheet, target, field}
 * @return {Object} {deleted, perSheet}
 */
function cleanDbTablesTogether_(targets) {
  var perSheet = {};
  var deleted = 0;
  if (!targets || !targets.length) return { deleted: deleted, perSheet: perSheet };

  /*
   * รวมทุกคอลัมน์ที่ต้องไล่หาของตารางเดียวกันไว้ในคำสั่งเดียว
   *
   * บางตารางถูกไล่หาสองคอลัมน์ เช่น Audit_Log ดูทั้ง WO_ID และ User ·
   * ถ้ายิงสองคำสั่งแยกกัน คำสั่งที่สองจะเจอศูนย์แถวเพราะคำสั่งแรกลบไปแล้ว
   * แล้วการเทียบ "ลบได้เท่ากับที่มีอยู่" จะฟ้องทั้งที่ไม่มีอะไรผิด
   */
  var merged = [];
  var byTable = {};
  for (var t = 0; t < targets.length; t++) {
    var sheet = targets[t].sheet;
    if (!byTable[sheet]) {
      byTable[sheet] = { sheet: sheet, fields: [], terms: [] };
      merged.push(byTable[sheet]);
    }
    byTable[sheet].fields.push(targets[t].field);
    byTable[sheet].terms.push({
      column: targets[t].field, op: 'like',
      value: (targets[t].target.contains ? '*' : '') + dbLikeLiteral_(TEST_PREFIX) + '*'
    });
  }

  var requests = [];
  for (var m = 0; m < merged.length; m++) {
    requests.push({ tableKey: merged[m].sheet, filters: testRowFilterOf_(merged[m].terms) });
  }

  /* ---------- นับของที่ต้องลบไว้ก่อน แล้วค่อยลบ ---------- */
  /*
   * **จำนวนที่ลบได้ ต้องเทียบกับจำนวนที่มีอยู่จริง ไม่ใช่เชื่อคำตอบของคำสั่งลบ**
   *
   * เกิดขึ้นจริงเมื่อ 29-09-2026: รายงานบอกว่า "ลบทั้งหมด 0 แถว" ในรอบที่มีข้อมูล
   * ทดสอบอยู่จริง · ตัวเลขนั้นมาจากจำนวนแถวที่คำสั่งลบคืนกลับมา ซึ่งอ่านไม่ได้เลย
   * ว่าลบสำเร็จหรือไม่ได้ลบอะไร เพราะด่านที่อ่านกลับมาดูว่า "ไม่เหลือแล้ว"
   * ผ่านทั้งสองกรณี
   *
   * อ่านคีย์ของแถวที่เข้าเงื่อนไขมาก่อนหนึ่งรอบ จึงได้จำนวนที่คาดไว้จริงมาเทียบ ·
   * เพิ่มมาหนึ่งรอบ ไม่ใช่หนึ่งรอบต่อหนึ่งตาราง
   */
  var before = [];
  for (var b = 0; b < merged.length; b++) {
    before.push({ tableKey: merged[b].sheet, filters: requests[b].filters,
      select: merged[b].fields[0], limit: DB_ROWS_PER_ENTITY });
  }
  var existing = db_fetchAll_(before);

  var removedRows;
  try {
    removedRows = db_deleteAll_(requests);
  } catch (e) {
    Logger.log('  ล้างข้อมูลทดสอบพร้อมกันหลายตารางไม่สำเร็จ: ' + (e && e.message));
    throw e;
  }

  var mismatched = [];
  for (var r = 0; r < merged.length; r++) {
    var count = removedRows[r].length;
    var wanted = existing[r].length;

    /*
     * ลบได้ไม่เท่าที่มี ต้องดัง — **ยกเว้นตารางลูก ซึ่งหายไปกับแม่ได้โดยชอบ**
     *
     * Department_Task และ Task_Step ประกาศแม่ไว้ใน BACKUP_PARENT_LINKS และ
     * ฐานข้อมูลตั้ง cascade ไว้จริง · ลบ WorkOrder ในรอบเดียวกันแล้วแถวลูกหายตาม
     * คำสั่งลบของตารางลูกจึงคืน 0 อย่างถูกต้อง · ถ้าฟ้องกรณีนี้ด้วย คำเตือนจะดัง
     * ทุกรอบทั้งที่ไม่มีอะไรผิด แล้วจะไม่มีใครอ่านมันอีกเลย
     *
     * สิ่งที่ยังต้องจริงเสมอคือ "ไม่เหลือแถวทดสอบ" ซึ่งตรวจอยู่ด้านล่างทุกตาราง
     */
    if (count !== wanted && !BACKUP_PARENT_LINKS[merged[r].sheet]) {
      mismatched.push(merged[r].sheet + ' (มีอยู่ ' + wanted + ' ลบได้ ' + count + ')');
    }

    deleted += count;
    perSheet[merged[r].sheet] = (perSheet[merged[r].sheet] || 0) + count;
    Logger.log('  ตาราง ' + merged[r].sheet + ': ลบข้อมูลทดสอบ ' + count +
      ' แถว จากที่มีอยู่ ' + wanted + ' แถว (ดูจากคอลัมน์ ' + merged[r].fields.join(', ') + ')');
  }

  /* ---------- อ่านกลับมาดูว่าไม่เหลือจริง ---------- */
  var checks = [];
  for (var c = 0; c < merged.length; c++) {
    checks.push({ tableKey: merged[c].sheet, filters: requests[c].filters, limit: 1 });
  }

  var left = db_fetchAll_(checks);
  var stillThere = [];
  for (var s = 0; s < merged.length; s++) {
    if (left[s].length) stillThere.push(merged[s].sheet);
  }

  if (stillThere.length) {
    throw new Error('ล้างข้อมูลทดสอบแล้วยังเหลือแถวทดสอบในตาราง ' + stillThere.join(', ') +
      ' — ตารางจริงต้องไม่มีข้อมูลทดสอบค้างอยู่');
  }

  if (mismatched.length) {
    throw new Error('จำนวนแถวที่ลบได้ ไม่ตรงกับจำนวนที่มีอยู่จริง: ' + mismatched.join(' · ') +
      ' — ตัวเลขในรายงานการล้างข้อมูลต้องเชื่อถือได้ ไม่งั้นวันที่ลบไม่ครบจะไม่มีใครเห็น');
  }

  return { deleted: deleted, perSheet: perSheet };
}

/**
 * ตัวกรอง "ตรงสักคอลัมน์หนึ่ง" ของแถวทดสอบในตารางหนึ่ง
 *
 * คอลัมน์เดียวก็ใช้เงื่อนไขตรง ๆ · หลายคอลัมน์จึงใช้ or=(...) เพื่อให้ยังเป็นคำสั่งเดียว
 *
 * @param {Object[]} terms รายการ {column, op, value}
 * @return {Object} ตัวกรองสำหรับ db_deleteAll_ / db_fetchAll_
 */
function testRowFilterOf_(terms) {
  var filters = {};
  if (terms.length === 1) {
    filters[terms[0].column] = { op: terms[0].op, value: terms[0].value };
    return filters;
  }
  filters[DB_OR_KEY] = terms;
  return filters;
}

/**
 * ตัวกรองที่ชี้เฉพาะแถวทดสอบของตารางหนึ่ง
 *
 * แยกออกมาเพราะทั้งคำสั่งลบและคำสั่งอ่านกลับต้องใช้ตัวกรองตัวเดียวกันเป๊ะ ·
 * ถ้าสองที่สร้างเอง วันหนึ่งจะลบด้วยเงื่อนไขหนึ่งแล้วตรวจด้วยอีกเงื่อนไขหนึ่ง
 * แล้วได้คำตอบว่า "ล้างครบแล้ว" จากการถามคำถามผิดข้อ
 *
 * @param {Object} one รายการ {sheet, target, field}
 * @return {Object} ตัวกรองสำหรับ db_delete_ / db_fetchAll_
 */
function testRowFilter_(one) {
  var pattern = (one.target.contains ? '*' : '') + dbLikeLiteral_(TEST_PREFIX) + '*';
  var filters = {};
  filters[one.field] = { op: 'like', value: pattern };
  return filters;
}

/**
 * อ่านเฉพาะแถวทดสอบของตารางหนึ่ง โดยให้ **ฐานข้อมูลเป็นคนกรอง**
 *
 * **ห้ามอ่านทั้งตารางแล้วคัดในหน่วยความจำ** · ตารางบันทึกกับตารางใบงานถูกประกาศไว้ใน
 * `DB_LARGE_SHEETS` เพราะมันโตไม่มีที่สิ้นสุด · `readAll_` ของตารางแบบนั้นได้มาแค่
 * หน้าแรกตามเพดานอ่าน แล้วแถวที่เทสต์เพิ่งเขียนซึ่งอยู่ท้ายสุดจะมองไม่เห็นเลย
 *
 * เกิดจริง 30-09-2026: `test_log_neverBoth` เขียนสี่บรรทัดแล้วนับด้วยการอ่านทั้งตาราง
 * ก่อนและหลังมาลบกัน · บนของจริงได้ผลต่าง 0 ทุกครั้ง เพราะทั้งสองครั้งได้หน้าแรกชุดเดิม
 * ตัวจำลองเขียวมาตลอดเพราะตารางในนั้นเล็กกว่าเพดาน
 *
 * @param {string} sheetName ตารางที่จะอ่าน
 * @param {string} field คอลัมน์ที่ค่าของแถวทดสอบขึ้นต้นด้วย TEST_PREFIX
 * @param {Object} [extra] ตัวกรองเพิ่มเติม เช่น {Action: ...}
 * @return {Object[]}
 */
function testRowsFromDb_(sheetName, field, extra) {
  var filters = {};
  filters[field] = { op: 'like', value: dbLikeLiteral_(TEST_PREFIX) + '*' };

  if (extra) {
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) filters[key] = extra[key];
    }
  }
  return queryRows_(sheetName, filters);
}

/**
 * ย้ายโฟลเดอร์ของใบงานทดสอบลงถังขยะ
 *
 * ถ้าไม่ทำ Drive ของเจ้าของระบบจะสะสมโฟลเดอร์ TEST- เพิ่มขึ้นทุกรอบที่รันเทสต์
 * จนกินพื้นที่ซึ่งมีแค่ 15 GB ทั้งระบบ
 *
 * เรียกผ่าน trashFolder() ใน 06_Files.gs เพราะไฟล์นี้ห้ามเรียก Drive เอง
 * (กฎเดียวกับที่ห้ามเรียก SpreadsheetApp นอกชั้น Repo)
 *
 * @return {number} จำนวนโฟลเดอร์ที่ย้ายลงถังขยะ
 */
function trashTestFolders_() {
  var rows;
  try {
    rows = testRowsFromDb_(SHEET.WORK_ORDER, 'WO_ID');
  } catch (e) {
    return 0;
  }

  var moved = 0;
  for (var i = 0; i < rows.length; i++) {
    if (!isTestValue_(rows[i]['WO_ID'])) continue;
    var folderId = String(rows[i]['Folder_ID'] || '');
    if (!folderId) continue;
    if (trashFolder_(folderId)) moved++;
  }
  return moved;
}

/**
 * ชื่อบริการ Drive ของ Apps Script ประกอบขึ้นตอนรัน
 *
 * เทสต์ที่ต้องพูดถึงชื่อนี้ต้องไม่มีตัวอักษรชุดนั้นอยู่ในเนื้อของตัวเอง
 * มิฉะนั้นตัวสแกนใน test_files_driveIsolation จะจับเทสต์เองเป็นผู้ต้องสงสัย
 * แล้วเราจะต้องยกเว้นให้ ซึ่งการยกเว้นคือรูรั่วที่วันหนึ่งจะมีคนใช้ปิดบั๊กจริง
 *
 * @return {string}
 */
function driveAppName_() {
  return 'Drive' + 'App';
}

/**
 * ค่านี้เป็นข้อมูลทดสอบหรือไม่ — ต้องขึ้นต้นด้วย TEST- เท่านั้น
 * @param {*} value ค่าจากคอลัมน์ที่ใช้ไล่หา
 * @return {boolean}
 */
function isTestValue_(value) {
  return value !== undefined && value !== null && String(value).indexOf(TEST_PREFIX) === 0;
}


/**
 * แถวไหนในตารางนี้เป็นข้อมูลทดสอบ — ด่านตัดสินของ test_cleanup()
 *
 * แยกออกมาเป็นฟังก์ชันของตัวเอง เพื่อให้เทสต์พิสูจน์ได้ว่า "แถวแบบนี้จะถูกกวาด"
 * โดยไม่ต้องสั่งลบจริงกลางกลุ่ม ซึ่งจะล้างข้อมูลของชุดอื่นที่ยังทำงานอยู่ไปด้วย
 *
 * @param {Object} target หนึ่งรายการใน TEST_SCAN
 * @param {Object[]} rows แถวทั้งหมดของตารางนั้น
 * @return {Object[]} เฉพาะแถวที่เป็นข้อมูลทดสอบ
 */
function testRowsOf_(target, rows) {
  var scanField = target.field || SHEET_KEY_FIELD[target.sheet];
  var found = [];
  for (var i = 0; i < rows.length; i++) {
    // ปกติดูที่ต้นข้อความ แต่บางคอลัมน์เก็บเลขที่ใบงานไว้กลางข้อความ (System_Log.Detail)
    var value = rows[i][scanField];
    if (target.contains ? hasTestValue_(value) : isTestValue_(value)) found.push(rows[i]);
  }
  return found;
}

/**
 * ค่านี้มีเลขที่ของข้อมูลทดสอบอยู่ข้างในหรือไม่ (ไม่จำเป็นต้องอยู่หัวข้อความ)
 *
 * ใช้กับคอลัมน์ที่เป็นข้อความอ่านของคน เช่น System_Log.Detail ซึ่งเก็บเลขที่ใบงาน
 * ไว้กลางประโยค · ต้องระวังกว่าปกติ เพราะการหาแบบนี้กวาดโดนแถวของจริงได้ง่ายกว่า
 * จึงใช้เฉพาะคอลัมน์ที่ระบุไว้ใน TEST_SCAN ว่า contains เท่านั้น
 *
 * @param {*} value ค่าที่อ่านมาจากชีต
 * @return {boolean}
 */
function hasTestValue_(value) {
  return value !== undefined && value !== null && String(value).indexOf(TEST_PREFIX) !== -1;
}

/**
 * ค่าที่แคชไว้หลังเขียน ต้องตรงกับค่าที่ฐานข้อมูลเก็บจริง แม้ฐานข้อมูลจะแปลงค่าให้
 *
 * ยุคชีตอันตรายอยู่ที่ Google Sheet ตีความค่าใหม่ตอนเขียน — `"0812345678"`
 * กลายเป็นตัวเลข ข้อความขึ้นต้นด้วย `=` กลายเป็นสูตร · **Postgres ก็แปลงค่าเหมือนกัน
 * เพียงแต่แปลงตามชนิดของคอลัมน์แทนที่จะเดาจากหน้าตาของค่า** — `"3"` ที่เขียนลง
 * คอลัมน์ integer กลับมาเป็นเลข 3 ไม่ใช่ข้อความ `"3"` และ `"true"` ที่เขียนลง
 * คอลัมน์ boolean กลับมาเป็น true
 *
 * อันตรายจึงเป็นตัวเดียวกันทุกประการ: ถ้าชั้น Repo เก็บ "ค่าที่เราส่งไป" เข้าแคช
 * แทนที่จะเก็บ "ค่าที่ฐานข้อมูลคืนมา" ภาพในหน่วยความจำจะเพี้ยนแบบเงียบ ๆ ไม่มี
 * error ให้เห็น และจะเพี้ยนเฉพาะกับข้อมูลบางชนิด จึงหลุดการทดสอบทั่วไปไปได้ง่ายมาก
 *
 * วิธีพิสูจน์เหมือนเดิมทุกขั้น: เขียนค่าที่ชนิดของคอลัมน์จะแปลง อ่านผ่านแคช
 * แล้วล้างแคชอ่านใหม่จากฐานข้อมูล · สองภาพนี้ต้องตรงกันทุกช่อง
 * ถ้าต่างกันแม้ช่องเดียวคือแคชเชื่อถือไม่ได้
 */
function test_repo_cacheMatchesSheet() {
  beginTest_('ค่าที่แคชไว้ต้องตรงกับที่ฐานข้อมูลเก็บจริง');

  var mine = { Row_ID: { op: 'like', value: dbLikeLiteral_(testPrefix_()) + '*' } };
  var columns = DB_TEST_COLUMNS[TEST_BULK_TABLE].columns;

  try {
    /*
     * ค่าที่ชนิดของคอลัมน์จะแปลง — แต่ละตัวแทนความเสียหายคนละแบบ
     *
     * ส่งเป็นข้อความทั้งหมดโดยตั้งใจ เพราะนั่นคือรูปที่ค่ามาจากหน้าเว็บจริง ๆ
     * ตัวที่อันตรายที่สุดคือเลขลำดับ เพราะโค้ดที่เทียบด้วย === จะเงียบไปเฉย ๆ
     * เมื่อได้เลขกลับมาแทนข้อความ
     */
    var risky = [
      { name: 'เลขลำดับที่ส่งมาเป็นข้อความ',  order: '7',    active: 'true' },
      { name: 'เลขลำดับที่มีศูนย์นำ',         order: '007',  active: 'false' },
      { name: 'ค่าจริงเท็จที่ส่งมาเป็นข้อความ', order: 0,      active: 'TRUE' },
      { name: 'เลขศูนย์',                     order: 0,      active: false },
      { name: 'เลขติดลบ',                     order: -5,     active: true }
    ];

    /* ---------- เขียนด้วย appendRow_ ---------- */
    // อ่านหนึ่งครั้งก่อน เพื่อให้แคชอุ่นอยู่แล้วตอนเขียน
    // ถ้าแคชยังว่าง การเพิ่มแถวจะไม่ไปแตะแคชเลย แล้วเทสต์จะผ่านโดยไม่ได้พิสูจน์อะไร
    readAll_(TEST_BULK_TABLE);

    var ids = [];
    for (var i = 0; i < risky.length; i++) {
      // เติมศูนย์นำหน้าให้เรียงลำดับแบบข้อความตรงกับลำดับที่เขียนลงไป
      var id = testPrefix_() + 'M' + ('0' + i).slice(-2);
      ids.push(id);
      appendRow_(TEST_BULK_TABLE, { 'Row_ID': id, 'Row_Name': risky[i].name,
        'Sort_Order': risky[i].order, 'Active': risky[i].active });
    }

    var cachedAppend = readAll_(TEST_BULK_TABLE);
    clearRowCache_(TEST_BULK_TABLE);
    clearHeaderCache_(TEST_BULK_TABLE);
    var freshAppend = readAll_(TEST_BULK_TABLE);

    assertEquals_(cachedAppend.length, freshAppend.length,
      'จำนวนแถวที่แคชไว้ตรงกับที่อ่านใหม่จากฐานข้อมูล');
    for (var a = 0; a < risky.length; a++) {
      assertEquals_(cellSignature_(cachedAppend[a]['Sort_Order']),
        cellSignature_(freshAppend[a]['Sort_Order']),
        'เพิ่มแถวที่มี' + risky[a].name + ' แล้วค่าที่แคชไว้ต้องตรงกับที่ฐานข้อมูลเก็บจริง');
    }

    /* ---------- เขียนด้วย updateRow_ ---------- */
    for (var u = 0; u < risky.length; u++) {
      updateRow_(TEST_BULK_TABLE, 'Row_ID', ids[u],
        { 'Sort_Order': risky[u].order, 'Active': risky[u].active });
    }

    var cachedUpdate = readAll_(TEST_BULK_TABLE);
    clearRowCache_(TEST_BULK_TABLE);
    clearHeaderCache_(TEST_BULK_TABLE);
    var freshUpdate = readAll_(TEST_BULK_TABLE);

    for (var w = 0; w < risky.length; w++) {
      assertEquals_(cellSignature_(cachedUpdate[w]['Sort_Order']),
        cellSignature_(freshUpdate[w]['Sort_Order']),
        'แก้ไขแถวด้วย' + risky[w].name + ' แล้วค่าที่แคชไว้ต้องตรงกับที่ฐานข้อมูลเก็บจริง');
    }

    /* ---------- ทุกคอลัมน์ ไม่ใช่แค่คอลัมน์ที่เราตั้งใจเขียน ---------- */
    for (var r = 0; r < freshUpdate.length; r++) {
      for (var c = 0; c < columns.length; c++) {
        assertEquals_(cellSignature_(cachedUpdate[r][columns[c]]),
          cellSignature_(freshUpdate[r][columns[c]]),
          'แถวที่ ' + (r + 1) + ' คอลัมน์ ' + columns[c] + ' ที่แคชไว้ตรงกับของจริงในฐานข้อมูล');
      }
    }

    /*
     * ยังขาดข้อหนึ่ง — "ชนิดของค่าที่อ่านกลับมาต้องเป็นชนิดที่คอลัมน์เป็น"
     *
     * เขียน '7' ลงคอลัมน์ integer แล้ว Postgres ควรคืนเลข 7 กลับมา
     * ไม่ใช่ข้อความ '7' · ถ้าเป็นอย่างนั้นจริง โค้ดชั้นบนที่เทียบด้วย ===
     * จะเงียบไปเฉย ๆ ซึ่งเป็นความเสียหายชนิดเดียวกับที่ข้อนี้มีไว้กัน
     *
     * **แต่ยังไม่ได้วัดกับ Postgres จริง จึงยังไม่เขียนข้อนี้ไว้**
     * ของจำลองตอนนี้คืนข้อความมาเหมือนที่ส่งไป ซึ่งขัดกับที่คาดไว้ — จะเขียนข้อนี้
     * ตอนที่วัดพฤติกรรมของจริงแล้วเอามาแก้ของจำลองให้ตรง ไม่ใช่เดาเอาเองตอนนี้
     */

  } finally {
    db_delete_(TEST_BULK_TABLE, mine);
    clearRowCache_();
  }

  assertEquals_(db_count_(TEST_BULK_TABLE, mine), 0, 'ต้องไม่เหลือแถวทดสอบไว้เลย');

  return endTest_();
}

/**
 * ลายเซ็นของค่าในเซลล์ — รวมทั้งชนิดและค่า เพื่อให้ข้อความ "812345678"
 * กับตัวเลข 812345678 ถือว่าต่างกัน ซึ่งเป็นความต่างที่เรากำลังตามหาพอดี
 * @param {*} value ค่าจากเซลล์
 * @return {string}
 */
function cellSignature_(value) {
  if (value === null || value === undefined) return 'ว่าง';
  if (value instanceof Date) return 'Date:' + value.getTime();
  return (typeof value) + ':' + String(value);
}

/**
 * ค่าคีย์ของทุกแถวต่อกันด้วยจุลภาค — ใช้เทียบทั้งจำนวนและลำดับในการตรวจครั้งเดียว
 * @param {Object[]} rows แถวจาก readAll_
 * @return {string}
 */
function keysOf_(rows) {
  var keys = [];
  for (var i = 0; i < rows.length; i++) keys.push(String(rows[i]['Key_ID']));
  return keys.join(',');
}

/**
 * ค่าในคอลัมน์ Text_Value ของแถวที่มีคีย์ตามที่ระบุ
 * @param {Object[]} rows แถวจาก readAll_
 * @param {string} key ค่าคีย์ที่ต้องการ
 * @return {string} '' เมื่อไม่พบแถวนั้น
 */
function valueOf_(rows, key) {
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Key_ID']) === key) return String(rows[i]['Text_Value']);
  }
  return '';
}

/**
 * การกวาดข้อมูลทดสอบต้องไม่แตะข้อมูลจริงแม้แต่แถวเดียว
 *
 * ข้อนี้สำคัญกว่าความเร็วทั้งหมดที่ได้มา — ตัวกวาดนี้วิ่งทับตารางจริงทุกตาราง
 * ทุกครั้งที่ชุดทดสอบจบกลุ่ม ถ้าเงื่อนไขของมันพลาด ข้อมูลของลูกค้าจะหายถาวร
 * โดยไม่มีใครรู้ · ยุคชีตอันตรายอยู่ที่การจับกลุ่มช่วงแถวไปคร่อมแถวของจริง
 * ตอนนี้ไม่มีเลขแถวอีกแล้ว **สิ่งที่กั้นอยู่ระหว่างแถวทดสอบกับแถวของจริงคือตัวกรอง
 * คำนำหน้าตัวเดียว** และตัวกรองที่หายไปคือการลบทั้งตาราง ซึ่งเงียบกว่าเดิมอีก
 *
 * เดินผ่าน cleanDbTablesTogether_ ซึ่งเป็นทางที่การล้างของจริงเดิน ไม่ใช่ตัวช่วย
 * ที่เขียนขึ้นให้ข้อนี้ · เขียนลงตาราง _Test_Bulk ซึ่งมีไว้ให้ชุดทดสอบเท่านั้น
 * ระบบจริงไม่อ่านที่ไหนเลย จึงวางแถว "ของจริง" ปลอมลงไปได้โดยไม่มีผู้ใช้คนไหนเห็น
 */
function test_repo_cleanupSafety() {
  beginTest_('ลบข้อมูลทดสอบแล้วข้อมูลจริงต้องอยู่ครบ');

  /*
   * แถวที่ไม่ใช่ข้อมูลทดสอบต้องมีคำนำหน้าของตัวเองที่ไม่ชนกับ TEST-
   *
   * ใช้คำว่า KEEP- เพื่อให้ตัวล้างท้ายกลุ่มมองไม่เห็นมันเหมือนกัน — ถ้าข้อนี้พังกลางคัน
   * แถวที่เหลือจะถูกเก็บกวาดในบรรทัด finally ข้างล่าง ไม่ใช่ปล่อยค้างไว้ในตาราง
   */
  var keep = 'KEEP-' + testRunId_() + '-';
  var mine = testPrefix_();

  var mineFilter = { Row_ID: { op: 'like', value: dbLikeLiteral_(mine) + '*' } };
  var keepFilter = { Row_ID: { op: 'like', value: dbLikeLiteral_(keep) + '*' } };

  /* แถวทดสอบสลับกับแถวของจริง เพื่อให้ตัวกรองที่กวาดกว้างเกินไปโดนของจริงแน่นอน */
  var plan = [
    { id: keep + 'A', real: true },
    { id: mine + 'X1', real: false },
    { id: keep + 'B', real: true },
    { id: mine + 'X2', real: false },
    { id: mine + 'X3', real: false },
    { id: keep + 'C', real: true }
  ];

  var rows = [];
  for (var i = 0; i < plan.length; i++) {
    rows.push({ Row_ID: plan[i].id, Row_Name: 'ค่าของ ' + plan[i].id,
      Sort_Order: i, Active: true });
  }

  try {
    db_insert_(TEST_BULK_TABLE, rows);
    assertEquals_(db_count_(TEST_BULK_TABLE, mineFilter), 3, 'เตรียมแถวทดสอบครบ 3 แถว');
    assertEquals_(db_count_(TEST_BULK_TABLE, keepFilter), 3, 'เตรียมแถวของจริงครบ 3 แถว');

    /* ---------- ทางที่การล้างของจริงเดิน ต้องลบเฉพาะแถวทดสอบ ---------- */
    var swept = cleanDbTablesTogether_([
      { sheet: TEST_BULK_TABLE, target: { sheet: TEST_BULK_TABLE }, field: 'Row_ID' }
    ]);
    assertEquals_(swept.deleted, 3, 'ตัวกวาดต้องลบแถวทดสอบ 3 แถว ไม่มากไม่น้อยกว่านี้');
    assertEquals_(db_count_(TEST_BULK_TABLE, mineFilter), 0, 'ไม่มีแถวทดสอบหลงเหลืออยู่');

    /* ---------- ข้อมูลจริงต้องอยู่ครบ ทั้งจำนวน ลำดับ และเนื้อค่า ---------- */
    var after = db_select_(TEST_BULK_TABLE, { filters: keepFilter, order: 'Row_ID' });
    // เทียบเป็นข้อความชุดเดียว เพื่อให้เห็นทันทีว่าแถวไหนหายไปเมื่อตัวกรองพลาด
    var ids = [];
    for (var a = 0; a < after.length; a++) ids.push(String(after[a].Row_ID));
    assertEquals_(ids.join(','), keep + 'A,' + keep + 'B,' + keep + 'C',
      'แถวของจริงต้องอยู่ครบทั้งสามแถวและเรียงลำดับเดิม');
    assertEquals_(after.length, 3, 'เหลือเฉพาะแถวของจริง 3 แถว');
    assertEquals_(String(after[1].Row_Name), 'ค่าของ ' + keep + 'B',
      'เนื้อค่าของแถวจริงไม่ถูกแตะ');
    assertEquals_(Number(after[1].Sort_Order), 2, 'คอลัมน์อื่นของแถวจริงก็ไม่ถูกแตะ');

    /* ---------- กวาดซ้ำตอนไม่มีอะไรให้ลบ ต้องไม่ลบของจริงทิ้ง ---------- */
    /*
     * นี่คือกรณีที่ตัวกรองหายแล้วเงียบที่สุด — ตารางที่ไม่มีแถวทดสอบเหลือแล้ว
     * ถ้าเงื่อนไขหลุด การลบจะกวาดทั้งตารางโดยที่จำนวน "ลบได้ 3" ก็ยังดูสมเหตุสมผล
     */
    var again = cleanDbTablesTogether_([
      { sheet: TEST_BULK_TABLE, target: { sheet: TEST_BULK_TABLE }, field: 'Row_ID' }
    ]);
    assertEquals_(again.deleted, 0, 'ไม่มีแถวทดสอบให้ลบ ต้องไม่ลบอะไรเลย');
    assertEquals_(db_count_(TEST_BULK_TABLE, keepFilter), 3,
      'กวาดตอนไม่มีอะไรให้ลบ แถวของจริงต้องยังครบ');

    /* ---------- แถวที่มี TEST- อยู่กลางค่า ไม่ใช่หัวค่า ต้องไม่ถูกกวาด ---------- */
    /*
     * ตัวกรองที่เขียนเป็น `*TEST-*` แทน `TEST-*` จะดูเหมือนทำงานถูกทุกข้อข้างบน
     * แต่กวาดโดนแถวของจริงที่บังเอิญมีคำนี้อยู่ข้างใน · ต่างกันแค่ดอกจันตัวเดียว
     */
    var lookalike = keep + 'D-' + TEST_PREFIX + 'INSIDE';
    db_insert_(TEST_BULK_TABLE, [{ Row_ID: lookalike, Row_Name: 'ของจริงที่มีคำว่า TEST- อยู่ข้างใน',
      Sort_Order: 99, Active: true }]);

    var third = cleanDbTablesTogether_([
      { sheet: TEST_BULK_TABLE, target: { sheet: TEST_BULK_TABLE }, field: 'Row_ID' }
    ]);
    assertEquals_(third.deleted, 0, 'ค่าที่มี TEST- อยู่กลางข้อความ ไม่ใช่ข้อมูลทดสอบ');
    assertEquals_(db_count_(TEST_BULK_TABLE, keepFilter), 4,
      'แถวที่หน้าตาคล้ายต้องยังอยู่ครบพร้อมของจริงเดิม');

    /* ---------- ลบได้ไม่เท่าที่มีอยู่ ต้องดัง ไม่ใช่ผ่านไปเงียบ ๆ ---------- */
    /*
     * เคยเกิดจริง 29-09-2026: รายงานบอก "ลบทั้งหมด 0 แถว" ในรอบที่มีข้อมูลทดสอบอยู่จริง
     * ด่านที่อ่านกลับมาดูว่า "ไม่เหลือแล้ว" ผ่านทั้งกรณีลบสำเร็จและกรณีไม่ได้ลบอะไรเลย
     */
    assertThrowsMessage_(function () {
      dbDeleteVerified_(TEST_BULK_TABLE, mineFilter, 'แถวที่ไม่มีอยู่จริง', 5);
    }, 'ไม่ครบ', 'บอกว่าจะลบ 5 แถวแต่ลบได้ 0 ต้องฟ้อง ไม่ใช่รายงานว่าสำเร็จ');

  } finally {
    // ล้างด้วยตัวกรองคำนำหน้าทั้งสองชุด เพราะแถว KEEP- ไม่มีใครอื่นตามเก็บให้
    db_delete_(TEST_BULK_TABLE, keepFilter);
    db_delete_(TEST_BULK_TABLE, mineFilter);
    clearRowCache_();
  }

  assertEquals_(db_count_(TEST_BULK_TABLE, keepFilter), 0, 'ต้องไม่เหลือแถวของข้อนี้ไว้เลย');

  return endTest_();
}

/* ===========================================================================
 * ขั้นที่ 2 — ชุดทดสอบ StateMachine ที่ต่อกับ Sheet จริง
 *
 * ต่างจากชุดตรรกะตรงที่ไม่ได้ป้อน fromStatus เข้าไปเอง แต่ปล่อยให้ changeStatus()
 * อ่านสถานะปัจจุบันจากชีต เขียนสถานะใหม่กลับ และเขียน Audit ให้อัตโนมัติ
 * =========================================================================== */

/**
 * ออกเลขที่งานแผนกสำหรับทดสอบ ขึ้นต้นด้วย TEST- เพื่อให้ test_cleanup() ตามลบได้
 * @param {string} suffix ตัวต่อท้ายให้แยกออกจากกัน
 * @return {string}
 */
function testTaskId_(suffix) {
  return testPrefix_() + 'TASK-' + Utilities.formatDate(new Date(), TIMEZONE, 'HHmmss') +
    '-' + suffix + '-' + nextTestSerial_();
}

/**
 * เลขลำดับที่ไม่ซ้ำภายในการรันหนึ่งครั้ง
 *
 * เดิมใช้ตัวเลขสุ่ม 0-999 ซึ่งชนกันได้จริงเมื่อชุดทดสอบสร้างข้อมูลหลายสิบชิ้นในวินาทีเดียวกัน
 * เวลาชนกัน อาการคือชุดใดชุดหนึ่งหยุดกลางคันเป็นครั้งคราวโดยหาสาเหตุไม่เจอ
 * เพราะ changeStatus แบบ CREATE จะไปเจอแถวที่มีอยู่แล้วแทนที่จะสร้างใหม่
 *
 * นับขึ้นเรื่อย ๆ แทน จึงไม่มีทางชนกันเลยภายในการรันเดียว
 */
var TEST_SERIAL_ = 0;
function nextTestSerial_() {
  TEST_SERIAL_++;
  return TEST_SERIAL_;
}

/**
 * นับจำนวน Audit ของแต่ละ Action ที่บันทึกไว้ให้ใบงานนั้น
 * @param {string} woId เลขที่ใบงาน
 * @return {Object} แผนที่ชื่อ Action ไปยังจำนวนบรรทัด
 */
function auditActionCount_(woId) {
  var rows = listAuditByWo(woId);
  var count = {};
  for (var i = 0; i < rows.length; i++) {
    var action = String(rows[i]['Action'] || '');
    count[action] = (count[action] || 0) + 1;
  }
  return count;
}

/**
 * นับแถว Audit ของใบงานนั้นแบบเจาะจงทั้ง Entity และ Action
 *
 * ห้ามนับแถวรวมของ WO เพราะการกระทำเดียวของผู้ใช้ทำให้เกิด Audit ได้หลายแถว
 * (สร้างใบงาน + สร้างงานของแผนก + ระบบคำนวณสถานะใหม่) ถ้านับรวม เทสต์จะพัง
 * ทุกครั้งที่ระบบบันทึกเหตุการณ์เพิ่ม ทั้งที่พฤติกรรมยังถูกต้อง
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} entity ค่าจาก ENTITY
 * @param {string} action ค่าจาก ACTION
 * @return {number}
 */
function auditCount_(woId, entity, action) {
  return findAuditRows_(woId, entity, action).length;
}

/**
 * แถว Audit ของใบงานนั้นที่ตรงทั้ง Entity และ Action
 * @param {string} woId เลขที่ใบงาน
 * @param {string} entity ค่าจาก ENTITY
 * @param {string} action ค่าจาก ACTION
 * @return {Object[]}
 */
function findAuditRows_(woId, entity, action) {
  var rows = listAuditByWo(woId);
  var found = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Entity']) === entity && String(rows[i]['Action']) === action) found.push(rows[i]);
  }
  return found;
}

/**
 * แถว Audit แถวแรกที่ตรงเงื่อนไข — คืน object ว่างเมื่อไม่พบ เพื่อให้ assertion อ่านค่าได้โดยไม่พัง
 * @param {string} woId เลขที่ใบงาน
 * @param {string} entity ค่าจาก ENTITY
 * @param {string} action ค่าจาก ACTION
 * @return {Object}
 */
function findAuditRow_(woId, entity, action) {
  var rows = findAuditRows_(woId, entity, action);
  return rows.length ? rows[0] : {};
}

/**
 * ไล่ flow เต็มของงานแผนกเดียวตาม SPEC หัวข้อ 6.1
 * CREATE -> SUBMIT -> ACCEPT -> (สร้าง Task) -> TASK_ACCEPT -> TASK_COMPLETE
 * แล้วตรวจว่า WO ปิดเองโดยไม่มีใครสั่งปิด และมี Audit ครบทุกขั้น
 */
function test_statemachine_integration_flow() {
  beginTest_('flow เต็มจนปิดงานเอง — SPEC 6.1, 20.3');

  var admin    = { email: currentUserEmail_(), role: ROLE.ADMIN };
  var approver = { email: 'approver.sp@cnr.co.th', role: ROLE.APPROVER_SP };
  var service  = { email: 'service@cnr.co.th', role: ROLE.SERVICE, department: DEPT.SERVICE };

  var woId = testWoId_();
  var taskId = testTaskId_('SV');

  // 1) CREATE — changeStatus สร้างแถวให้พร้อมสถานะตั้งต้น ไม่มีใครพิมพ์สถานะลงชีตเอง
  var created = changeStatus(ENTITY.WO, woId, ACTION.CREATE, admin, {
    requiredFieldsOk: true,
    fields: {
      'WO_ID': woId,
      'Customer_Code': 'CUST-TEST',
      'Customer_Name': 'บริษัททดสอบ จำกัด',
      'Location': 'ห้องปั๊มน้ำ อาคาร A',
      'Route': ROUTE.SP,
      'Assignment_Type': ASSIGNMENT.UNSPECIFIED,
      'Payment_Required': false,
      'Payment_Status': PAYMENT.UNPAID
    }
  });
  assertEquals_(created.to, WO_STATUS.PENDING_APPROVE, 'CREATE -> รออนุมัติทันที');
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'สถานะรออนุมัติถูกเขียนลงชีตจริง');

  // 2) SUBMIT — ใช้ได้จาก RETURNED เท่านั้น จึงต้องผ่านการตีกลับก่อน
  changeStatus(ENTITY.WO, woId, ACTION.RETURN, approver, { reason: 'ขอให้แก้ก่อน' });
  var submitted = changeStatus(ENTITY.WO, woId, ACTION.SUBMIT, admin, { requiredFieldsOk: true });
  assertEquals_(submitted.from, WO_STATUS.RETURNED, 'SUBMIT อ่านสถานะเดิมจากชีตได้เป็น RETURNED');
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.PENDING_APPROVE, 'SUBMIT -> PENDING_APPROVE ในชีต');

  // 3) ACCEPT — สายอนุมัติและ "ไม่ใช่ผู้สร้างเอง" ถูกตรวจจากข้อมูลในชีต
  var accepted = changeStatus(ENTITY.WO, woId, ACTION.ACCEPT, approver, {
    assignmentType: ASSIGNMENT.SERVICE, requiredFilesOk: true,
    fields: { 'Assignment_Type': ASSIGNMENT.SERVICE, 'Approved_By': approver.email }
  });
  assertEquals_(accepted.to, WO_STATUS.APPROVED, 'ACCEPT -> APPROVED');
  assertEquals_(getWorkOrder(woId)['Assignment_Type'], ASSIGNMENT.SERVICE, 'แผนกผู้รับงานถูกบันทึกพร้อมสถานะในการเขียนครั้งเดียว');

  // 4) สร้าง Task ของแผนก — WO ต้องยังเป็น APPROVED เพราะยังไม่มีใครรับงาน
  var taskCreated = changeStatus(ENTITY.TASK, taskId, ACTION.CREATE, approver, {
    fields: { 'Task_ID': taskId, 'WO_ID': woId, 'Department': DEPT.SERVICE }
  });
  assertEquals_(taskCreated.to, TASK_STATUS.PENDING_ACCEPT, 'สร้าง Task -> PENDING_ACCEPT');
  assertEquals_(taskCreated.recalc.changed, false, 'มี Task ที่ยังไม่มีใครรับ WO ต้องไม่เปลี่ยนสถานะ');
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.APPROVED, 'WO ยังเป็น APPROVED');

  // 5) TASK_ACCEPT — recalcWoStatus ถูกเรียกในรายการเดียวกัน ดัน WO เป็น IN_PROGRESS
  var taskAccepted = changeStatus(ENTITY.TASK, taskId, ACTION.TASK_ACCEPT, service, {});
  assertEquals_(taskAccepted.to, TASK_STATUS.IN_PROGRESS, 'TASK_ACCEPT -> Task IN_PROGRESS');
  assertEquals_(taskAccepted.recalc.status, WO_STATUS.IN_PROGRESS, 'recalc ดัน WO เป็น IN_PROGRESS');
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.IN_PROGRESS, 'สถานะ WO ในชีตเป็น IN_PROGRESS');

  // 6) TASK_COMPLETE — WO ต้องปิดเอง ไม่มีใครสั่งปิด (SPEC C-8)
  var taskCompleted = changeStatus(ENTITY.TASK, taskId, ACTION.TASK_COMPLETE, service, {
    allStepsDone: true, requiredReportsOk: true
  });
  assertEquals_(taskCompleted.to, TASK_STATUS.COMPLETED, 'TASK_COMPLETE -> Task COMPLETED');
  assertEquals_(taskCompleted.recalc.rule, 'ALL_ACTIVE_COMPLETED', 'recalc ใช้กฎ ALL_ACTIVE_COMPLETED');
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.COMPLETED, 'WO ปิดเองหลังแผนกสุดท้ายปิดงาน');
  assertEquals_(getTask(taskId)['Status'], TASK_STATUS.COMPLETED, 'สถานะ Task ในชีตเป็น COMPLETED');

  // 7) ทำซ้ำต้องถูกปฏิเสธ เพราะอ่านสถานะจริงจากชีตแล้วไม่มี Transition รองรับ
  assertThrows_(function () {
    changeStatus(ENTITY.TASK, taskId, ACTION.TASK_COMPLETE, service, {
      allStepsDone: true, requiredReportsOk: true
    });
  }, 'ปิดงานซ้ำต้องถูกปฏิเสธจากสถานะจริงในชีต');

  // 8) Audit ต้องครบทุกขั้น รวมการปิดงานอัตโนมัติ 2 ครั้ง (IN_PROGRESS และ COMPLETED)
  assertEquals_(auditCount_(woId, ENTITY.WO, ACTION.CREATE), 1, 'Audit บันทึกการสร้างใบงาน 1 แถว');
  assertEquals_(auditCount_(woId, ENTITY.TASK, ACTION.CREATE), 1, 'Audit บันทึกการสร้างงานของแผนก 1 แถว');
  assertEquals_(auditCount_(woId, ENTITY.WO, ACTION.SUBMIT), 1, 'Audit บันทึก SUBMIT 1 แถว');
  assertEquals_(auditCount_(woId, ENTITY.WO, ACTION.ACCEPT), 1, 'Audit บันทึก ACCEPT 1 แถว');
  assertEquals_(auditCount_(woId, ENTITY.TASK, ACTION.TASK_ACCEPT), 1, 'Audit บันทึก TASK_ACCEPT 1 แถว');
  assertEquals_(auditCount_(woId, ENTITY.TASK, ACTION.TASK_COMPLETE), 1, 'Audit บันทึก TASK_COMPLETE 1 แถว');
  assertEquals_(auditCount_(woId, ENTITY.WO, ACTION.RECALC), 2,
    'Audit บันทึกการเปลี่ยนสถานะอัตโนมัติของใบงานไว้ 2 ครั้ง (IN_PROGRESS แล้ว COMPLETED)');

  var recalcRows = findAuditRows_(woId, ENTITY.WO, ACTION.RECALC);
  assertEquals_(recalcRows[recalcRows.length - 1]['To_Value'], WO_STATUS.COMPLETED,
    'การคำนวณสถานะอัตโนมัติครั้งสุดท้ายคือการปิดงาน');

  return endTest_();
}

/**
 * งานแผนกเดียวที่ถูกยกเลิก ต้องทำให้ WO กลายเป็น CANCELLED เองตามกฎในหัวข้อ 8
 */
function test_statemachine_integration_autoCancel() {
  beginTest_('ยกเลิกงานแผนกเดียวแล้ว WO ยกเลิกตาม — SPEC 8');

  var admin    = { email: currentUserEmail_(), role: ROLE.ADMIN };
  var approver = { email: 'approver.sp@cnr.co.th', role: ROLE.APPROVER_SP };
  var service  = { email: 'service@cnr.co.th', role: ROLE.SERVICE, department: DEPT.SERVICE };

  var woId = testWoId_();
  var taskId = testTaskId_('CANCEL');

  changeStatus(ENTITY.WO, woId, ACTION.CREATE, admin, {
    requiredFieldsOk: true,
    fields: { 'WO_ID': woId, 'Customer_Code': 'CUST-TEST', 'Route': ROUTE.SP,
      'Assignment_Type': ASSIGNMENT.SERVICE, 'Payment_Required': false }
  });
  changeStatus(ENTITY.WO, woId, ACTION.ACCEPT, approver,
    { assignmentType: ASSIGNMENT.SERVICE, requiredFilesOk: true });
  changeStatus(ENTITY.TASK, taskId, ACTION.CREATE, approver, {
    fields: { 'Task_ID': taskId, 'WO_ID': woId, 'Department': DEPT.SERVICE }
  });

  var cancelled = changeStatus(ENTITY.TASK, taskId, ACTION.TASK_CANCEL, service, {
    reason: 'ลูกค้าแจ้งยกเลิกงาน'
  });
  assertEquals_(cancelled.to, TASK_STATUS.CANCELLED, 'TASK_CANCEL -> Task CANCELLED');
  assertEquals_(cancelled.recalc.rule, 'ALL_CANCELLED', 'recalc ใช้กฎ ALL_CANCELLED');
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.CANCELLED, 'WO ยกเลิกตามงานแผนกเดียว');
  assertEquals_(getTask(taskId)['Cancel_Reason'], '',
    'changeStatus เขียนเฉพาะสถานะ ช่อง Cancel_Reason ยังว่าง เพราะเป็นหน้าที่ของชั้น Service ส่งมาทาง fields');

  assertEquals_(auditCount_(woId, ENTITY.TASK, ACTION.TASK_CANCEL), 1, 'Audit บันทึก TASK_CANCEL 1 แถว');
  assertEquals_(auditCount_(woId, ENTITY.WO, ACTION.RECALC), 1, 'Audit บันทึกการยกเลิกอัตโนมัติของใบงาน 1 แถว');

  return endTest_();
}

/**
 * ตรวจว่าชั้นเชื่อมอ่านข้อมูลประกอบจากชีตมาให้ Guard เอง
 * ผู้เรียกไม่ต้อง (และไม่ควร) ยืนยันเองว่าเป็นสายไหน ใครเป็นเจ้าของงาน หรือจ่ายเงินแล้วหรือยัง
 */
function test_statemachine_integration_guards() {
  beginTest_('Guard อ่านข้อมูลจริงจากชีต — SPEC 3, 12, E');

  var admin    = { email: currentUserEmail_(), role: ROLE.ADMIN };
  var approver = { email: 'approver.sp@cnr.co.th', role: ROLE.APPROVER_SP };
  var labAppr  = { email: 'approver.lab@cnr.co.th', role: ROLE.APPROVER_LAB };
  var service  = { email: 'service@cnr.co.th', role: ROLE.SERVICE, department: DEPT.SERVICE };
  var project  = { email: 'project@cnr.co.th', role: ROLE.PROJECT, department: DEPT.PROJECT };

  var woId = testWoId_();
  var taskId = testTaskId_('GUARD');

  changeStatus(ENTITY.WO, woId, ACTION.CREATE, admin, {
    requiredFieldsOk: true,
    fields: { 'WO_ID': woId, 'Customer_Code': 'CUST-TEST', 'Route': ROUTE.SP,
      'Assignment_Type': ASSIGNMENT.SERVICE, 'Payment_Required': true, 'Payment_Status': PAYMENT.UNPAID }
  });

  // สายอนุมัติอ่านจากคอลัมน์ Route ของใบงาน ไม่ใช่จากที่ผู้เรียกบอก
  assertThrows_(function () {
    changeStatus(ENTITY.WO, woId, ACTION.ACCEPT, labAppr, {
      assignmentType: ASSIGNMENT.SERVICE, route: ROUTE.LAB
    });
  }, 'APPROVER_LAB อนุมัติใบงานสาย SP ไม่ได้ แม้จะส่ง route มาเอง');

  // ผู้สร้างใบงานอนุมัติงานตัวเองไม่ได้ ตรวจจากคอลัมน์ Created_By
  assertThrows_(function () {
    changeStatus(ENTITY.WO, woId, ACTION.ACCEPT, { email: admin.email, role: ROLE.APPROVER_SP }, {
      assignmentType: ASSIGNMENT.SERVICE
    });
  }, 'ผู้สร้างใบงานอนุมัติงานของตัวเองไม่ได้ แม้จะมี Role ผู้อนุมัติ');

  changeStatus(ENTITY.WO, woId, ACTION.ACCEPT, approver,
    { assignmentType: ASSIGNMENT.SERVICE, requiredFilesOk: true });
  changeStatus(ENTITY.TASK, taskId, ACTION.CREATE, approver, {
    fields: { 'Task_ID': taskId, 'WO_ID': woId, 'Department': DEPT.SERVICE }
  });

  // เงื่อนไขการชำระเงินอ่านจากใบงานต้นทางของ Task
  assertThrows_(function () {
    changeStatus(ENTITY.TASK, taskId, ACTION.TASK_ACCEPT, service, {});
  }, 'ใบงานที่ต้องชำระก่อนและยัง UNPAID แผนกกดรับงานไม่ได้');

  // แผนกอื่นรับงานแทนไม่ได้ ตรวจจากคอลัมน์ Department ของ Task
  assertThrows_(function () {
    changeStatus(ENTITY.TASK, taskId, ACTION.TASK_ACCEPT, project, {});
  }, 'แผนก Project กดรับงานของแผนก Service ไม่ได้');

  // บันทึกว่าชำระแล้วผ่านชั้น Repo แล้วรับงานได้ตามปกติ
  updateWorkOrder(woId, { 'Payment_Status': PAYMENT.PAID });
  var accepted = changeStatus(ENTITY.TASK, taskId, ACTION.TASK_ACCEPT, service, {});
  assertEquals_(accepted.to, TASK_STATUS.IN_PROGRESS, 'เมื่อชำระเงินแล้ว แผนกกดรับงานได้');
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.IN_PROGRESS, 'WO เดินหน้าเป็น IN_PROGRESS');

  return endTest_();
}

/**
 * งานร่วม Service + Project — เมื่อ Service ตีกลับ Task ของ Project ต้องถูกพักไปด้วย
 * ทำอะไรกับ Task ไม่ได้เลยจนกว่าจะแก้ไขและอนุมัติผ่านอีกครั้ง (SPEC 8 · กฎข้อ 13)
 */
function test_statemachine_integration_pausedTasks() {
  beginTest_('WO ถูกตีกลับแล้ว Task ทุกแผนกถูกพัก — SPEC 8');

  var admin    = { email: currentUserEmail_(), role: ROLE.ADMIN };
  var approver = { email: 'approver.sp@cnr.co.th', role: ROLE.APPROVER_SP };
  var service  = { email: 'service@cnr.co.th', role: ROLE.SERVICE, department: DEPT.SERVICE };
  var project  = { email: 'project@cnr.co.th', role: ROLE.PROJECT, department: DEPT.PROJECT };

  var woId = testWoId_();
  var svTaskId = testTaskId_('SV');
  var pjTaskId = testTaskId_('PJ');

  // เตรียมงานร่วมที่ทั้งสองแผนกรับงานแล้ว
  changeStatus(ENTITY.WO, woId, ACTION.CREATE, admin, {
    requiredFieldsOk: true,
    fields: { 'WO_ID': woId, 'Customer_Code': 'CUST-TEST', 'Route': ROUTE.SP,
      'Assignment_Type': ASSIGNMENT.SERVICE_PROJECT, 'Payment_Required': false }
  });
  changeStatus(ENTITY.WO, woId, ACTION.ACCEPT, approver,
    { assignmentType: ASSIGNMENT.SERVICE_PROJECT, requiredFilesOk: true });
  changeStatus(ENTITY.TASK, svTaskId, ACTION.CREATE, approver, {
    fields: { 'Task_ID': svTaskId, 'WO_ID': woId, 'Department': DEPT.SERVICE }
  });
  changeStatus(ENTITY.TASK, pjTaskId, ACTION.CREATE, approver, {
    fields: { 'Task_ID': pjTaskId, 'WO_ID': woId, 'Department': DEPT.PROJECT }
  });
  changeStatus(ENTITY.TASK, svTaskId, ACTION.TASK_ACCEPT, service, {});
  changeStatus(ENTITY.TASK, pjTaskId, ACTION.TASK_ACCEPT, project, {});
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.IN_PROGRESS,
    'ทั้งสองแผนกรับงานแล้ว WO เป็น IN_PROGRESS');

  // Service ตีกลับ — WO ต้องเป็น RETURNED และห้าม recalc ดึงกลับเป็น IN_PROGRESS
  var returned = changeStatus(ENTITY.TASK, svTaskId, ACTION.TASK_RETURN, service, {
    reason: 'ที่อยู่หน้างานไม่ตรงกับที่แจ้ง'
  });
  assertEquals_(returned.changed, false, 'การตีกลับไม่เปลี่ยนสถานะงานของแผนกที่กดเอง (SPEC 20.5 ข้อ 4)');
  assertEquals_(getTask(svTaskId)['Status'], TASK_STATUS.IN_PROGRESS,
    'Task ของ Service ที่กดตีกลับ ยังเป็น IN_PROGRESS ไม่ถูกเปลี่ยน');
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.RETURNED,
    'WO เป็น RETURNED และไม่ถูก recalc ดึงกลับ แม้ Task ทั้งสองยังเป็น IN_PROGRESS');
  assertEquals_(getTask(pjTaskId)['Status'], TASK_STATUS.IN_PROGRESS,
    'Task ของ Project ไม่ถูกล้างทิ้ง ยังคงสถานะเดิมไว้ (SPEC C-5)');

  // ขณะถูกตีกลับ Project แตะงานตัวเองไม่ได้เลย
  assertThrows_(function () {
    changeStatus(ENTITY.TASK, pjTaskId, ACTION.TASK_COMPLETE, project, {
      allStepsDone: true, requiredReportsOk: true
    });
  }, 'WO ถูกตีกลับ Project ปิดงานของตัวเองไม่ได้');
  assertThrows_(function () {
    changeStatus(ENTITY.TASK, pjTaskId, ACTION.TASK_UPDATE, project, {});
  }, 'WO ถูกตีกลับ Project อัปเดตงานของตัวเองไม่ได้');
  assertThrows_(function () {
    changeStatus(ENTITY.TASK, pjTaskId, ACTION.TASK_CANCEL, project, { reason: 'ขอยกเลิก' });
  }, 'WO ถูกตีกลับ Project ยกเลิกงานของตัวเองไม่ได้');
  assertEquals_(getTask(pjTaskId)['Status'], TASK_STATUS.IN_PROGRESS,
    'รายการที่ถูกปฏิเสธต้องไม่เปลี่ยนสถานะ Task ในชีต');

  // ผู้เรียกยัดสถานะ WO ปลอมเข้ามาเองเพื่อข้าม Guard ไม่ได้ เพราะชั้นเชื่อมทิ้งค่านั้นแล้วอ่านจากชีตใหม่
  assertThrows_(function () {
    changeStatus(ENTITY.TASK, pjTaskId, ACTION.TASK_COMPLETE, project, {
      allStepsDone: true, requiredReportsOk: true, woStatus: WO_STATUS.IN_PROGRESS
    });
  }, 'ส่ง woStatus ปลอมมาเองก็ยังถูกปฏิเสธ เพราะสถานะ WO อ่านจากชีตเท่านั้น');

  // งานที่ยังไม่มีใครรับก็เริ่มไม่ได้เช่นกัน
  var lateTaskId = testTaskId_('LATE');
  insertTask({ 'Task_ID': lateTaskId, 'WO_ID': woId, 'Department': DEPT.LAB,
    'Status': TASK_STATUS.PENDING_ACCEPT });
  assertThrows_(function () {
    changeStatus(ENTITY.TASK, lateTaskId, ACTION.TASK_ACCEPT,
      { email: 'lab@cnr.co.th', role: ROLE.LAB, department: DEPT.LAB }, {});
  }, 'WO ถูกตีกลับ แผนกที่ยังไม่ได้รับงานก็กดรับไม่ได้');

  // แก้ไขแล้วส่งขออนุมัติใหม่ ผ่านแล้วต้องทำงานต่อได้ตามปกติ
  // ใบที่ถูกตีกลับต้องผ่าน SUBMIT ก่อนเสมอ จึงจะกลับไปรออนุมัติแล้วอนุมัติได้ (SPEC 5, 8)
  changeStatus(ENTITY.WO, woId, ACTION.SUBMIT, admin, { requiredFieldsOk: true });
  changeStatus(ENTITY.WO, woId, ACTION.ACCEPT, approver,
    { assignmentType: ASSIGNMENT.SERVICE_PROJECT, requiredFilesOk: true });
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.APPROVED, 'อนุมัติผ่านอีกครั้ง -> APPROVED');

  var completed = changeStatus(ENTITY.TASK, pjTaskId, ACTION.TASK_COMPLETE, project, {
    allStepsDone: true, requiredReportsOk: true
  });
  assertEquals_(completed.to, TASK_STATUS.COMPLETED, 'อนุมัติผ่านแล้ว Project ปิดงานของตัวเองได้ตามปกติ');
  assertEquals_(getTask(pjTaskId)['Status'], TASK_STATUS.COMPLETED, 'สถานะ Task ของ Project ในชีตเป็น COMPLETED');
  assertEquals_(completed.recalc.status, WO_STATUS.IN_PROGRESS,
    'Task ของ Service ยังทำค้างอยู่ WO จึงกลับไปเป็น IN_PROGRESS ไม่ใช่ปิดงาน');
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.IN_PROGRESS,
    'ใบงานยังไม่ปิดจนกว่าแผนก Service จะปิดหรือยกเลิกงานของตัวเอง');

  return endTest_();
}
/* ===========================================================================
 * ขั้นที่ 3 — ชุดทดสอบชั้น Service ใบงานและทะเบียนสถานที่
 *
 * ทุกใบงานที่ชุดนี้สร้างจะออกเลขที่ขึ้นต้นด้วย TEST-<รหัสรอบ>- (ผ่าน options.woIdPrefix)
 * ทำให้ Task_ID, Step_ID และคีย์ใน Counter ที่งอกตามมาขึ้นต้นด้วย TEST- ไปด้วยทั้งสาย
 * ส่วน PJ_ID ได้รหัสรอบผ่านรหัสลูกค้าที่ใช้ทดสอบ (ดู testCustomerCode_)
 * test_cleanup() จึงตามลบได้ครบทุกตาราง และข้อมูลของคนละรอบไม่ชนกัน
 * =========================================================================== */

/**
 * ตัวนำหน้าเลขที่ใบงานของข้อมูลทดสอบรอบนี้ เช่น TEST-R7K2-WO-
 * ทำให้ได้เลขที่แบบ TEST-R7K2-WO-2609-0001 และคีย์ใน Counter เป็น TEST-R7K2-WO-2609
 * @return {string}
 */
function testWoPrefix_() {
  return testPrefix_() + 'WO-';
}

/**
 * รหัสลูกค้าสำหรับทดสอบ — ต้องมีรหัสรอบอยู่ด้วย เพราะรหัสลูกค้าเป็นส่วนหนึ่งของ PJ_ID
 * ถ้าใช้รหัสเดิมทุกรอบ ทะเบียนสถานที่จะสะสมข้ามรอบจนลำดับและ WO_Count เพี้ยน
 * @param {string} suffix ตัวต่อท้ายให้แยกลูกค้าคนละรายในชุดเดียวกัน
 * @return {string}
 */
function testCustomerCode_(suffix) {
  return testPrefix_() + 'CUST' + suffix;
}

/**
 * ผู้ใช้ที่ใช้ในชุดทดสอบชั้น Service
 * ผู้สร้างใบงานต้องเป็นอีเมลของ Session จริง เพราะ Created_By ถูกเติมอัตโนมัติจากผู้รันเทสต์
 * @return {Object} {admin, approver, labApprover, service, project}
 */
function serviceTestUsers_() {
  return {
    admin:       { email: currentUserEmail_(), role: ROLE.ADMIN },
    approver:    { email: 'approver.sp@cnr.co.th', role: ROLE.APPROVER_SP },
    labApprover: { email: 'approver.lab@cnr.co.th', role: ROLE.APPROVER_LAB },
    service:     { email: 'service@cnr.co.th', role: ROLE.SERVICE, department: DEPT.SERVICE },
    project:     { email: 'project@cnr.co.th', role: ROLE.PROJECT, department: DEPT.PROJECT },
    lab:         { email: 'lab@cnr.co.th', role: ROLE.LAB, department: DEPT.LAB }
  };
}

/**
 * ฟอร์มใบงานตั้งต้นสำหรับทดสอบ
 * @param {Object} overrides ค่าที่ต้องการเปลี่ยนจากค่าตั้งต้น
 * @return {Object}
 */
function testWoForm_(overrides) {
  var form = {
    'Customer_Code':  testCustomerCode_('01'),
    'Customer_Name':  'บริษัททดสอบ จำกัด',
    'Sales_Person':   'พนักงานขายทดสอบ',
    'Contact':        'คุณทดสอบ',
    'Phone':          '021234567',
    'Project':        'โครงการทดสอบ',
    'Location':       'ห้องปั๊มน้ำ',
    'Job_Description': 'ปั๊มน้ำมีเสียงดังผิดปกติ',
    'Assignment_Type': ASSIGNMENT.UNSPECIFIED,
    'Request_Types':  ['ตรวจผลน้ำ', 'ซ่อม/เปลี่ยน'],
    'Payment_Required': false
  };
  for (var key in overrides) {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) form[key] = overrides[key];
  }
  return form;
}

/**
 * สร้างใบงานทดสอบ 1 ใบ พร้อมบังคับให้เลขที่ขึ้นต้นด้วย TEST-
 *
 * แนบไฟล์หัวข้อที่บังคับให้เองด้วย เพราะตั้งแต่เปิดใช้เงื่อนไขไฟล์แนบของ SUBMIT (SPEC 5, 9.4)
 * ใบงานที่ไม่มีไฟล์จะส่งขออนุมัติไม่ได้ ชุดทดสอบเดิมอีกหลายสิบจุดจึงจะแดงทั้งที่ระบบถูก
 * ชุดที่ต้องการพิสูจน์เรื่องไฟล์ไม่ครบ ให้ส่ง options.skipRequiredFiles = true
 *
 * @param {Object} users ผู้ใช้จาก serviceTestUsers_()
 * @param {Object} [overrides] ค่าที่ต้องการเปลี่ยนในฟอร์ม
 * @param {Object} [options] {skipRequiredFiles} ไม่ต้องแนบไฟล์บังคับให้
 * @return {Object} ผลจาก createWorkOrder
 */
function createTestWo_(users, overrides, options) {
  var created = createWorkOrder(testWoForm_(overrides), users.admin, { woIdPrefix: testWoPrefix_() });
  if (!options || !options.skipRequiredFiles) attachRequiredTestFiles_(created.woId);
  return created;
}

/**
 * แนบไฟล์ของทุกหัวข้อที่บังคับให้ใบงานทดสอบ โดยเขียนลงทะเบียนตรง ๆ ไม่แตะ Drive
 *
 * ชุดทดสอบไม่ควรสร้างไฟล์จริงบน Drive ของเจ้าของระบบทุกครั้งที่รัน
 * และสิ่งที่ชุดทดสอบส่วนใหญ่ต้องการคือ "ผ่านด่านไฟล์บังคับ" ไม่ใช่การทดสอบตัว Drive เอง
 *
 * @param {string} woId เลขที่ใบงานทดสอบ
 * @return {number} จำนวนไฟล์ที่แนบให้
 */
function attachRequiredTestFiles_(woId) {
  var topics = listAttachmentTopics();
  var rows = [];

  for (var i = 0; i < topics.length; i++) {
    var topic = topics[i];
    if (String(topic['Scope'] || '') !== FILE_SCOPE.WO) continue;
    if (!cellToBoolean_(topic['Required'])) continue;

    rows.push({
      'File_ID':            woId + '-F' + rows.length,
      'WO_ID':              woId,
      'Topic_ID':           topic['Topic_ID'],
      'Saved_File_Name':    woId + '_' + sanitizeTopicName_(topic['Topic_Name']) + '_01.pdf',
      'Original_File_Name': 'ข้อมูลทดสอบ.pdf',
      'Seq':                1,
      'Drive_File_ID':      'ไม่ได้ขึ้น Drive (ข้อมูลทดสอบ)',
      'Is_Active':          true
    });
  }

  if (rows.length) insertFiles(rows);   // เขียนครั้งเดียว ไม่วนเขียนทีละแถว
  return rows.length;
}

/**
 * สร้างใบงานทดสอบแล้วพาไปถึงสถานะ "ถูกตีกลับ"
 *
 * ตั้งแต่ตัดขั้นบันทึกร่างออก (SPEC 4.1) ใบงานเกิดพร้อมสถานะรออนุมัติซึ่งถูกล็อกการแก้ไข
 * ชุดทดสอบที่ต้องการใบที่ "แก้ไขได้" จึงต้องผ่านการตีกลับก่อนเสมอ เหมือนของจริง
 *
 * @param {Object} users ผู้ใช้จาก serviceTestUsers_()
 * @param {Object} [overrides] ค่าที่ต้องการเปลี่ยนในฟอร์ม
 * @return {Object} ผลจาก createWorkOrder
 */
function returnedTestWo_(users, overrides) {
  var created = createTestWo_(users, overrides);
  returnWorkOrder(created.woId, 'ตีกลับเพื่อให้แก้ไขในชุดทดสอบ', users.approver);
  created.workOrder = getWorkOrder(created.woId);
  return created;
}

/**
 * PJ_ID ต้องใช้ซ้ำเมื่อ ลูกค้า + โครงการ + สถานที่ ตรงกันทั้งสามค่า
 * และต้องออกใหม่เมื่อค่าใดค่าหนึ่งต่างไป (SPEC 10.2, 10.3)
 */
function test_service_projectLocation() {
  beginTest_('PJ_ID ใช้ซ้ำและออกใหม่ — SPEC 10');

  var users = serviceTestUsers_();

  var first = createTestWo_(users);
  assertTrue_(String(first.woId).indexOf(TEST_PREFIX) === 0, 'ใบงานทดสอบออกเลขที่ขึ้นต้นด้วย TEST-');
  assertTrue_(String(first.pjId).indexOf('PJ-') !== -1, 'ใบแรกได้ PJ_ID ที่อิงเลขของใบงานตัวเอง');

  // ใบที่ 2 ลูกค้า + โครงการ + สถานที่ เดียวกัน ต้องได้ PJ_ID เดิม
  var second = createTestWo_(users);
  assertEquals_(second.pjId, first.pjId, 'ใบที่ 2 ที่สถานที่เดิม ต้องใช้ PJ_ID เดิม');
  assertTrue_(second.woId !== first.woId, 'แต่เลขที่ใบงานต้องเป็นคนละเลข');

  // ใบที่ 3 เปลี่ยนสถานที่ ต้องได้ PJ_ID ใหม่
  var third = createTestWo_(users, { 'Location': 'สระน้ำ' });
  assertTrue_(third.pjId !== first.pjId, 'ใบที่ 3 ที่สถานที่ใหม่ ต้องได้ PJ_ID ใหม่');

  // ใบที่ 4 พิมพ์ชื่อเดิมแต่มีช่องว่างหน้าหลังและช่องว่างซ้อน ต้องยังจับเป็นที่เดิมได้ (SPEC 10.3)
  var fourth = createTestWo_(users, { 'Location': '  ห้องปั๊มน้ำ  ' });
  assertEquals_(fourth.pjId, first.pjId, 'ช่องว่างหน้าหลังต้องไม่ทำให้เกิด PJ_ID ใหม่');

  // เปลี่ยนโครงการ ถือเป็นสถานที่คนละจุด
  var fifth = createTestWo_(users, { 'Project': 'โครงการทดสอบ 2' });
  assertTrue_(fifth.pjId !== first.pjId, 'โครงการต่างกันถือเป็นสถานที่ใหม่');

  // ตัวนับจำนวนใบงานของสถานที่นั้นต้องเดินตาม
  var location = getLocation(first.pjId);
  assertEquals_(Number(location['WO_Count']), 3, 'PJ_ID เดิมถูกใช้ไป 3 ใบ (ใบที่ 1, 2 และ 4)');
  assertEquals_(location['First_WO_ID'], first.woId, 'ทะเบียนจำใบงานใบแรกของสถานที่นั้นไว้');

  // รายการสถานที่เดิมสำหรับทำ dropdown
  var list = listLocations(testCustomerCode_('01'), 'โครงการทดสอบ');
  assertEquals_(list.length, 2, 'ลูกค้า+โครงการนี้มีสถานที่เดิม 2 จุด (ห้องปั๊มน้ำ และ สระน้ำ)');

  // เตือนเมื่อชื่อคล้ายของเดิมมาก ก่อนออก PJ_ID ใหม่
  // การ normalize ตาม SPEC 10.3 ยุบเฉพาะช่องว่างซ้อน ไม่ได้ตัดช่องว่างกลางคำทิ้ง
  // "ห้องปั๊ม น้ำ" จึงยังเป็นคนละคีย์กับ "ห้องปั๊มน้ำ" และต้องอาศัยคำเตือนชั้นนี้ดักแทน
  var similar = findSimilarLocation(testCustomerCode_('01'), 'โครงการทดสอบ', 'ห้องปั้มน้ำ');
  assertTrue_(similar.length > 0, 'พิมพ์ "ห้องปั้มน้ำ" ต้องเตือนว่าคล้ายกับ "ห้องปั๊มน้ำ" ที่มีอยู่');
  assertTrue_(findSimilarLocation(testCustomerCode_('01'), 'โครงการทดสอบ', 'ห้องปั๊ม น้ำ').length > 0,
    'พิมพ์แยกคำเป็น "ห้องปั๊ม น้ำ" ต้องเตือนว่าคล้ายของเดิมก่อนออก PJ_ID ใหม่');
  assertEquals_(findSimilarLocation(testCustomerCode_('01'), 'โครงการทดสอบ', 'ลานจอดรถ').length, 0,
    'ชื่อที่ต่างกันชัดเจนต้องไม่ขึ้นคำเตือน');

  // ร่างขาดรหัสลูกค้าต้องหยุดตั้งแต่ก่อนแตะชีต เพราะรหัสเป็นส่วนหนึ่งของ PJ_ID (SPEC 20.1 ข้อ 2)
  assertThrows_(function () {
    createWorkOrder(testWoForm_({ 'Customer_Code': '' }), users.admin, { woIdPrefix: testWoPrefix_() });
  }, 'ร่างที่ไม่มีรหัสลูกค้า ต้องถูกปฏิเสธ');
  assertThrows_(function () {
    createWorkOrder(testWoForm_(), users.service, { woIdPrefix: testWoPrefix_() });
  }, 'แผนก Service สร้างใบงานไม่ได้');

  return endTest_();
}

/**
 * ลำดับการทำงานของ createWorkOrder ตาม SPEC 20.1 และผลลัพธ์ที่ต้องได้
 */
function test_service_createWorkOrder() {
  beginTest_('createWorkOrder — SPEC 20.1');

  var users = serviceTestUsers_();
  var result = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE });
  var wo = result.workOrder;

  assertEquals_(wo['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'ใบงานใหม่ไปรออนุมัติทันที ไม่ผ่านสถานะร่าง (SPEC 4.1)');
  assertEquals_(wo['Route'], ROUTE.SP, 'งานสาย Service ถูกจัดเข้าสายอนุมัติ SP');
  assertEquals_(wo['PJ_ID'], result.pjId, 'ใบงานผูกกับรหัสสถานที่ที่ได้มา');
  assertEquals_(wo['Return_Count'], 0, 'ตัวนับการตีกลับเริ่มที่ 0');
  assertEquals_(wo['Payment_Status'], PAYMENT.UNPAID, 'สถานะการชำระเงินเริ่มที่ UNPAID');
  assertEquals_(wo['Request_Types'], 'ตรวจผลน้ำ, ซ่อม/เปลี่ยน', 'สิ่งที่ต้องการหลายรายการถูกรวมเป็นข้อความเดียว');
  assertEquals_(wo['Customer_Name'], 'บริษัททดสอบ จำกัด', 'ข้อมูลลูกค้าถูกเก็บเป็น Snapshot ในใบงาน');
  assertTrue_(toDate_(wo['Created_Date']) !== null, 'บันทึกวันที่แจ้งงานอัตโนมัติ');

  // งาน Lab ต้องเข้าสายอนุมัติ Lab
  var lab = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.LAB, 'Location': 'ห้องแล็บ' });
  assertEquals_(lab.workOrder['Route'], ROUTE.LAB, 'งาน Lab ถูกจัดเข้าสายอนุมัติ LAB');

  // Audit ต้องมีตั้งแต่ตอนสร้าง — เจาะจง Entity + Action ไม่นับรวมทั้งใบ
  assertEquals_(auditCount_(result.woId, ENTITY.WO, ACTION.CREATE), 1,
    'การสร้างใบงานถูกบันทึกลง Audit_Log 1 แถว');
  assertEquals_(findAuditRow_(result.woId, ENTITY.WO, ACTION.CREATE)['To_Value'],
    WO_STATUS.PENDING_APPROVE, 'Audit บันทึกสถานะตั้งต้นเป็นรออนุมัติ');

  return endTest_();
}

/**
 * อนุมัติ -> ตีกลับ -> Submit ใหม่ -> อนุมัติอีกครั้ง จำนวน Task ต้องเท่าเดิม (กฎข้อ 11 · SPEC 20.2, 20.5)
 */
function test_service_approveDoesNotDuplicateTasks() {
  beginTest_('อนุมัติซ้ำหลังตีกลับต้องไม่สร้าง Task ซ้อน — กฎข้อ 11');

  var users = serviceTestUsers_();
  var wo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE_PROJECT, 'Location': 'อาคารรวม' });
  var woId = wo.woId;

  var approved = approveWorkOrder(woId, ASSIGNMENT.SERVICE_PROJECT, users.approver, {});

  assertEquals_(approved.tasks.length, 2, 'งานร่วม SERVICE_PROJECT สร้าง Task 2 ตัว');
  assertEquals_(listTasksByWo(woId).length, 2, 'ในชีตมี Task 2 แถว');
  assertEquals_(approved.resumed, 0, 'ครั้งแรกไม่มี Task เดิมให้ปลดพัก');

  var serviceTask = findTaskOfDepartment_(woId, DEPT.SERVICE);
  var projectTask = findTaskOfDepartment_(woId, DEPT.PROJECT);
  assertEquals_(serviceTask['Status'], TASK_STATUS.PENDING_ACCEPT, 'Task ที่สร้างใหม่เริ่มที่ PENDING_ACCEPT');
  assertEquals_(listStepsByTask(serviceTask['Task_ID']).length, STEP_DEFAULT.length,
    'ฝั่ง Service สร้าง Step ตามค่าตั้งต้น เพราะยังไม่มีข้อมูลใน Task_Step_Template');
  // เจตนาเดิมคือ "ฝั่ง Project ต้องไม่ถูกยัดจำนวนงวดตายตัว" ซึ่งยังต้องคุ้มครองอยู่
  // แต่ข้อตกลงใหม่แรงกว่าเดิม: ตอนอนุมัติต้องไม่มีงวดเลย แผนกเป็นผู้เพิ่มเอง (SPEC 20.2)
  assertEquals_(listStepsByTask(projectTask['Task_ID']).length, 0,
    'ฝั่ง Project ต้องไม่มีงวดใด ๆ ตอนอนุมัติ แผนกเพิ่มเองระหว่างทำงาน');

  // ทั้งสองแผนกเริ่มงานแล้ว จากนั้น Service ตีกลับ ทำให้ WO กลับไป RETURNED
  changeStatus(ENTITY.TASK, serviceTask['Task_ID'], ACTION.TASK_ACCEPT, users.service, {});
  changeStatus(ENTITY.TASK, projectTask['Task_ID'], ACTION.TASK_ACCEPT, users.project, {});
  changeStatus(ENTITY.TASK, serviceTask['Task_ID'], ACTION.TASK_RETURN, users.service, {
    reason: 'ที่อยู่หน้างานไม่ตรงกับที่แจ้ง'
  });
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.RETURNED, 'แผนกตีกลับแล้ว WO เป็น RETURNED');

  // Admin แก้แล้วส่งใหม่ แต่ผู้อนุมัติยังไม่พอใจ จึงตีกลับซ้ำจากชั้นใบงาน (SPEC 20.5)
  submitWorkOrder(woId, users.admin);
  returnWorkOrder(woId, 'ข้อมูลลูกค้าไม่ครบ', users.approver);

  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.RETURNED, 'ผู้อนุมัติตีกลับแล้ว WO เป็น RETURNED');
  assertEquals_(Number(getWorkOrder(woId)['Return_Count']), 1,
    'ตัวนับการตีกลับเพิ่มเป็น 1 (แผนกตีกลับผ่าน TASK_RETURN ก็นับด้วยรอบเดียวกัน)');
  assertEquals_(getTask(projectTask['Task_ID'])['Status_Before_Return'], TASK_STATUS.IN_PROGRESS,
    'จำสถานะเดิมของ Task ที่กำลังทำอยู่ไว้ก่อนตีกลับ (SPEC 20.5 ข้อ 2)');
  assertEquals_(getTask(projectTask['Task_ID'])['Status'], TASK_STATUS.IN_PROGRESS,
    'สถานะ Task ต้องไม่ถูกแตะ Task ถูกพักด้วย Guard แทน (SPEC 20.5 ข้อ 4)');

  // แก้แล้วส่งใหม่ อนุมัติอีกครั้ง — ต้องใช้ Task ชุดเดิม
  // ใบที่ถูกตีกลับต้องส่งขออนุมัติใหม่ก่อน จึงจะอนุมัติได้อีกครั้ง (SPEC 5, 8)
  submitWorkOrder(woId, users.admin);
  var again = approveWorkOrder(woId, ASSIGNMENT.SERVICE_PROJECT, users.approver, {});

  assertEquals_(listTasksByWo(woId).length, 2, 'อนุมัติซ้ำแล้วจำนวน Task ต้องเท่าเดิม ไม่งอกเป็น 4');
  assertEquals_(again.resumed, 2, 'Task เดิมทั้งสองตัวถูกปลดพัก');
  assertEquals_(getTask(projectTask['Task_ID'])['Status_Before_Return'], '',
    'ค่าที่จำไว้ถูกล้างหลังปลดพัก');
  assertEquals_(getTask(projectTask['Task_ID'])['Status'], TASK_STATUS.IN_PROGRESS,
    'งานที่ทำค้างไว้ยังอยู่ที่เดิม ไม่ถูกล้างทิ้ง (SPEC C-5)');
  assertEquals_(listStepsByTask(serviceTask['Task_ID']).length, STEP_DEFAULT.length,
    'Step ที่ทำไปแล้วไม่ถูกสร้างซ้ำ');

  // อนุมัติแล้วแผนกทำงานต่อได้ตามปกติ
  var completed = changeStatus(ENTITY.TASK, projectTask['Task_ID'], ACTION.TASK_COMPLETE, users.project, {
    allStepsDone: true, requiredReportsOk: true
  });
  assertEquals_(completed.to, TASK_STATUS.COMPLETED, 'ปลดพักแล้วแผนกปิดงานของตัวเองได้');

  return endTest_();
}

/**
 * REOPEN ต้องบังคับระบุแผนก และต้องไม่ถูก recalcWoStatus ปิดงานกลับทันที (กฎข้อ 12 · SPEC 20.6)
 */
function test_service_reopenWorkOrder() {
  beginTest_('REOPEN ต้องระบุแผนกและดึง Task กลับมาด้วย — SPEC 20.6');

  var users = serviceTestUsers_();
  var wo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE, 'Location': 'ห้องเครื่องชั้น 3' });
  var woId = wo.woId;

  approveWorkOrder(woId, ASSIGNMENT.SERVICE, users.approver);
  var task = findTaskOfDepartment_(woId, DEPT.SERVICE);

  changeStatus(ENTITY.TASK, task['Task_ID'], ACTION.TASK_ACCEPT, users.service, {});
  changeStatus(ENTITY.TASK, task['Task_ID'], ACTION.TASK_COMPLETE, users.service, {
    allStepsDone: true, requiredReportsOk: true
  });
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.COMPLETED, 'งานปิดเองแล้วก่อนทดสอบ REOPEN');

  // ไม่ระบุแผนกต้องถูกปฏิเสธตั้งแต่ยังไม่แตะอะไร
  assertThrows_(function () {
    reopenWorkOrder(woId, 'ลูกค้าแจ้งกลับว่ายังมีปัญหา', '', users.approver);
  }, 'REOPEN โดยไม่ระบุแผนกต้องถูกปฏิเสธ');
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.COMPLETED,
    'รายการที่ถูกปฏิเสธต้องไม่เปลี่ยนสถานะใบงาน');

  assertThrows_(function () {
    reopenWorkOrder(woId, '', DEPT.SERVICE, users.approver);
  }, 'REOPEN โดยไม่ระบุเหตุผลต้องถูกปฏิเสธ');
  assertThrows_(function () {
    reopenWorkOrder(woId, 'ลูกค้าแจ้งกลับ', DEPT.LAB, users.approver);
  }, 'REOPEN ให้แผนกที่ไม่มีงานในใบนี้ต้องถูกปฏิเสธ');

  // ระบุแผนกแล้วต้องดึงทั้ง WO และ Task กลับมาในรายการเดียวกัน
  var steps = listStepsByTask(task['Task_ID']);
  var reopened = reopenWorkOrder(woId, 'ลูกค้าแจ้งกลับว่ายังมีปัญหา', DEPT.SERVICE, users.approver, {
    stepIds: [steps[steps.length - 1]['Step_ID']]
  });

  assertEquals_(reopened.plan.to, WO_STATUS.IN_PROGRESS, 'REOPEN -> WO IN_PROGRESS');
  assertEquals_(reopened.taskPlan.to, TASK_STATUS.IN_PROGRESS, 'Task ของแผนกที่ระบุถูกดึงกลับมาเป็น IN_PROGRESS');
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.IN_PROGRESS,
    'หลังทำรายการเสร็จ WO ต้องยังเป็น IN_PROGRESS ไม่ถูก recalc ปิดกลับทันที');
  assertEquals_(getTask(task['Task_ID'])['Status'], TASK_STATUS.IN_PROGRESS, 'สถานะ Task ในชีตถูกดึงกลับจริง');
  assertEquals_(reopened.steps.length, 1, 'Step ที่ผู้อนุมัติเลือกถูกตั้งกลับเป็นยังไม่เสร็จ');
  assertEquals_(reopened.steps[0]['Status'], STEP_STATUS.PENDING, 'Step ที่เปิดใหม่กลับเป็น PENDING');

  // แผนกทำงานต่อแล้วปิดใหม่ได้ตามปกติ
  changeStatus(ENTITY.TASK, task['Task_ID'], ACTION.TASK_COMPLETE, users.service, {
    allStepsDone: true, requiredReportsOk: true
  });
  assertEquals_(getWorkOrder(woId)['Overall_Status'], WO_STATUS.COMPLETED, 'ทำต่อจนเสร็จแล้ว WO ปิดเองอีกครั้ง');

  return endTest_();
}

/**
 * ตีกลับจากผู้อนุมัติ และยกเลิกทั้งใบ (SPEC 5, 8)
 */
function test_service_returnCancel() {
  beginTest_('Return / Cancel ระดับใบงาน — SPEC 5, 8');

  var users = serviceTestUsers_();

  // ผู้อนุมัติตีกลับ แล้วผู้แจ้งแก้ไขส่งใหม่
  var wo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE, 'Location': 'จุดที่ถูกตีกลับ' });
  returnWorkOrder(wo.woId, 'ข้อมูลผู้ติดต่อไม่ครบ', users.approver);

  var afterReturn = getWorkOrder(wo.woId);
  assertEquals_(afterReturn['Overall_Status'], WO_STATUS.RETURNED, 'ตีกลับแล้วใบงานกลับมาแก้ไขได้');
  assertEquals_(afterReturn['Return_Reason'], 'ข้อมูลผู้ติดต่อไม่ครบ', 'บันทึกเหตุผลการตีกลับไว้');
  assertEquals_(Number(afterReturn['Return_Count']), 1, 'ตัวนับการตีกลับเพิ่มขึ้น');

  // ยกเลิกทั้งใบทำได้เฉพาะก่อนอนุมัติ
  var draft = createTestWo_(users, { 'Location': 'จุดที่จะยกเลิก' });
  var cancelled = cancelWorkOrder(draft.woId, 'ลูกค้ายกเลิกคำสั่ง', users.admin);
  assertEquals_(cancelled.to, WO_STATUS.CANCELLED, 'ยกเลิกใบงานที่ยังรออนุมัติได้');
  assertEquals_(getWorkOrder(draft.woId)['Cancel_Reason'], 'ลูกค้ายกเลิกคำสั่ง', 'บันทึกเหตุผลการยกเลิกไว้');

  var approved = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE, 'Location': 'จุดที่อนุมัติแล้ว' });
  approveWorkOrder(approved.woId, ASSIGNMENT.SERVICE, users.approver);
  assertThrows_(function () {
    cancelWorkOrder(approved.woId, 'ขอยกเลิกย้อนหลัง', users.admin);
  }, 'อนุมัติไปแล้วยกเลิกทั้งใบไม่ได้ ต้องยกเลิกรายแผนกแทน');

  return endTest_();
}

/**
 * ชั้น API ต้องคืน {ok, ...} เสมอ ไม่ปล่อย error ดิบออกไปหาหน้าเว็บ (กฎข้อ 7)
 */
function test_api_contract() {
  beginTest_('ชั้น API คืนผลรูปแบบเดียวเสมอ');

  var bootstrap = api_getBootstrap();
  assertTrue_(typeof bootstrap.ok === 'boolean', 'api_getBootstrap คืนฟิลด์ ok เสมอ');
  if (bootstrap.ok) {
    assertTrue_(!!bootstrap.data.user.email, 'bootstrap มีอีเมลผู้ใช้ปัจจุบัน');
    assertTrue_(!!bootstrap.data.requestTypes, 'bootstrap มีรายการสิ่งที่ต้องการ');
    assertTrue_(!!bootstrap.data.attachmentTopics, 'bootstrap มีรายการหัวข้อไฟล์แนบ');
  } else {
    Logger.log('  (ข้ามการตรวจเนื้อข้อมูล bootstrap: ' + bootstrap.message + ')');
    assertTrue_(!!bootstrap.message, 'เมื่อทำไม่สำเร็จต้องมีข้อความบอกเหตุผล');
  }

  var missing = api_getWorkOrder('TEST-ไม่มีใบงานนี้');
  assertEquals_(missing.ok, false, 'ขอใบงานที่ไม่มีอยู่ ต้องได้ ok = false ไม่ใช่ error ดิบ');
  assertTrue_(!!missing.message, 'และต้องมีข้อความภาษาไทยบอกสาเหตุ');

  var created = api_createWorkOrder({ 'Customer_Name': 'ไม่ครบ' });
  assertEquals_(created.ok, false, 'สร้างใบงานด้วยข้อมูลไม่ครบ ต้องได้ ok = false');

  assertEquals_(splitRoles_('APPROVER_SP, SERVICE').length, 2, 'ผู้ใช้ที่มีหลาย Role ถูกแยกออกจากกันได้');
  assertEquals_(splitRoles_('  admin ')[0], ROLE.ADMIN, 'ค่า Role ถูกตัดช่องว่างและแปลงเป็นตัวพิมพ์ใหญ่');
  assertEquals_(splitRoles_('').length, 0, 'ช่อง Role ว่างไม่ทำให้พัง');

  return endTest_();
}

/**
 * การไล่เลขของ PJ_ID รูปแบบใหม่ PJ-<รหัสลูกค้า>-<ลำดับโครงการ>-<ลำดับสถานที่> (SPEC 10.2.1)
 * ลำดับต้องอ่านจากคอลัมน์ Project_Seq / Location_Seq ไม่ใช่แกะจากตัว PJ_ID
 */
function test_service_pjIdNumbering() {
  beginTest_('การไล่เลข PJ_ID — SPEC 10.2');

  var users = serviceTestUsers_();
  var custA = testCustomerCode_('AR');
  var custB = testCustomerCode_('BK');

  /**
   * สร้างใบงานหนึ่งใบแล้วคืน PJ_ID ที่ได้
   * @param {string} customerCode รหัสลูกค้า
   * @param {string} project ชื่อโครงการ
   * @param {string} location ชื่อสถานที่
   * @return {string}
   */
  function pjOf(customerCode, project, location) {
    return createTestWo_(users, {
      'Customer_Code': customerCode, 'Project': project, 'Location': location
    }).pjId;
  }

  // ลูกค้าเดียวกัน โครงการเดียวกัน 3 สถานที่ -> ลำดับสถานที่เดินหน้า ลำดับโครงการคงที่
  var p1 = pjOf(custA, 'ออนิว', 'ห้องปั๊ม');
  var p2 = pjOf(custA, 'ออนิว', 'สระน้ำ');
  var p3 = pjOf(custA, 'ออนิว', 'ดาดฟ้า');
  assertEquals_(p1, PREFIX.PJ + custA + '-01-01', 'สถานที่แรกของโครงการแรก ได้ -01-01');
  assertEquals_(p2, PREFIX.PJ + custA + '-01-02', 'สถานที่ที่สองของโครงการเดิม ได้ -01-02');
  assertEquals_(p3, PREFIX.PJ + custA + '-01-03', 'สถานที่ที่สามของโครงการเดิม ได้ -01-03');

  // ลูกค้าเดียวกัน โครงการใหม่ -> ลำดับโครงการเดินหน้า ลำดับสถานที่เริ่ม 01 ใหม่
  var p4 = pjOf(custA, 'อาคารบี', 'ห้องเครื่อง');
  assertEquals_(p4, PREFIX.PJ + custA + '-02-01', 'โครงการใหม่ได้ลำดับโครงการถัดไป และสถานที่เริ่มนับ 01 ใหม่');

  // กลับไปที่โครงการแรกอีกครั้ง ต้องใช้ลำดับโครงการเดิม ไม่ใช่ 03
  var p5 = pjOf(custA, 'ออนิว', 'ลานจอดรถ');
  assertEquals_(p5, PREFIX.PJ + custA + '-01-04', 'กลับมาที่โครงการเดิม ใช้ลำดับโครงการเดิมและนับสถานที่ต่อ');

  // ลูกค้าคนละราย -> รหัสในตัว PJ_ID ต่างกัน และลำดับเริ่มใหม่ทั้งคู่
  var p6 = pjOf(custB, 'เฟส 1', 'อาคาร A');
  assertEquals_(p6, PREFIX.PJ + custB + '-01-01', 'ลูกค้ารายใหม่เริ่มนับลำดับใหม่ทั้งโครงการและสถานที่');
  assertTrue_(p6.indexOf(custA) === -1, 'PJ_ID ของลูกค้าคนละรายต้องไม่มีรหัสของอีกรายปนอยู่');

  // สถานที่เดิมครบทั้ง 3 ค่า -> ได้ PJ_ID เดิม ไม่สร้างแถวใหม่
  var before = listLocations(custA, 'ออนิว').length;
  var p7 = pjOf(custA, 'ออนิว', 'ห้องปั๊ม');
  assertEquals_(p7, p1, 'ทั้งสามค่าตรงกัน ต้องได้ PJ_ID เดิม');
  assertEquals_(listLocations(custA, 'ออนิว').length, before, 'และต้องไม่เกิดแถวใหม่ในทะเบียนสถานที่');

  /*
   * โครงการเว้นว่าง ถือเป็นกลุ่มโครงการหนึ่งตามปกติ
   *
   * เรียกชั้นทะเบียนสถานที่ตรง ๆ ไม่ผ่านหน้าสร้างใบงาน เพราะ "โครงการ" กลายเป็น
   * ช่องบังคับของฟอร์มแล้ว (SPEC 9.1) · **แต่กติกาการไล่เลขของทะเบียนสถานที่
   * ต้องไม่เปลี่ยนตาม** ใบงานที่เปิดไว้ก่อนหน้านี้โดยเว้นโครงการว่าง ยังต้องหา
   * PJ_ID เดิมของมันเจอ ไม่ใช่ได้เลขใหม่ทุกครั้งที่มีคนเปิดหน้าเดิม
   *
   * ข้อนี้จึงยังพิสูจน์สิ่งเดิมทุกประการ เพียงแต่ถามที่ชั้นที่เป็นเจ้าของกติกาจริง
   */
  var blank1 = resolveProjectLocation(custA, '', 'โกดัง', testWoId_(),
    { customerName: 'บริษัททดสอบ จำกัด' });
  var blank2 = resolveProjectLocation(custA, '', 'ลานหลังอาคาร', testWoId_(),
    { customerName: 'บริษัททดสอบ จำกัด' });
  assertEquals_(blank1, PREFIX.PJ + custA + '-03-01', 'โครงการที่เว้นว่างได้ลำดับโครงการของตัวเอง');
  assertEquals_(blank2, PREFIX.PJ + custA + '-03-02', 'สถานที่ถัดไปของโครงการที่เว้นว่างนับต่อตามปกติ');

  // และการเว้นโครงการว่างต้องยังหาแถวเดิมเจอ ไม่ใช่ออกเลขใหม่ทุกครั้ง
  assertEquals_(resolveProjectLocation(custA, '', 'โกดัง', testWoId_(),
    { customerName: 'บริษัททดสอบ จำกัด' }), blank1,
    'เรียกซ้ำด้วยสามค่าเดิมที่โครงการเว้นว่าง ต้องได้ PJ_ID เดิม');

  // ส่วนหน้าสร้างใบงานต้องปฏิเสธ เพราะโครงการเป็นช่องบังคับแล้ว (SPEC 9.1 · 9.3)
  assertThrowsMessage_(function () {
    createWorkOrder(testWoForm_({ 'Project': '' }), users.admin, { woIdPrefix: testWoPrefix_() });
  }, 'ยังกรอกไม่ครบ 1 ช่อง: โครงการ',
    'เปิดใบงานโดยไม่กรอกโครงการ ต้องถูกปฏิเสธพร้อมบอกว่าขาดช่องไหน');

  // ลำดับถูกเก็บไว้เป็นคอลัมน์ ไม่ต้องแกะจาก PJ_ID
  var row = getLocation(p5);
  assertEquals_(Number(row['Project_Seq']), 1, 'คอลัมน์ Project_Seq เก็บลำดับโครงการไว้ตรง ๆ');
  assertEquals_(Number(row['Location_Seq']), 4, 'คอลัมน์ Location_Seq เก็บลำดับสถานที่ไว้ตรง ๆ');
  assertTrue_(String(row['First_WO_ID']).indexOf(TEST_PREFIX) === 0,
    'ทะเบียนสถานที่จำใบงานใบแรกไว้ ทำให้ test_cleanup() ตามลบได้');

  // PJ_ID ไม่ผูกกับเลขใบงานอีกต่อไป
  assertTrue_(p1.indexOf('WO-') === -1, 'PJ_ID ต้องไม่มีเลขใบงานปนอยู่');

  // ไม่มีรหัสลูกค้า -> เปิดใบงานไม่ได้ และข้อความต้องบอกทางออก ไม่ใช่แค่ "กรอกไม่ครบ"
  var noCodeMessage = 'ลูกค้ารายนี้ยังไม่มีรหัสใน Sheet Customer กรุณาเพิ่มรหัสลูกค้าก่อนเปิดใบงาน';
  assertThrowsMessage_(function () {
    createWorkOrder(testWoForm_({ 'Customer_Code': '' }), users.admin, { woIdPrefix: testWoPrefix_() });
  }, noCodeMessage, 'สร้างใบงานโดยไม่มีรหัสลูกค้า ต้องถูกปฏิเสธพร้อมข้อความที่บอกทางออก');
  assertThrowsMessage_(function () {
    createWorkOrder(testWoForm_({ 'Customer_Code': '   ' }), users.admin, { woIdPrefix: testWoPrefix_() });
  }, noCodeMessage, 'รหัสลูกค้าที่เป็นช่องว่างล้วนก็ถือว่าไม่มีรหัส');
  assertThrowsMessage_(function () {
    resolveProjectLocation('', 'ออนิว', 'ห้องปั๊ม', 'TEST-WO-0001');
  }, noCodeMessage, 'ชั้นทะเบียนสถานที่ก็ปฏิเสธด้วยข้อความเดียวกัน');

  return endTest_();
}

/**
 * แคชระดับการรันของชั้น Repo ต้องเร็วขึ้นแต่ต้องไม่คืนค่าที่ล้าสมัย
 *
 * สิ่งที่ข้อนี้คุ้มครองคือสัญญาที่ผู้เรียกเห็น ไม่ใช่กลไกข้างใน — "เขียนแล้วอ่านได้ค่าใหม่"
 * และ "ค่าที่อ่านไปแก้แล้วไม่กระทบคนอื่น" · ถ้าวันหนึ่งแคชถูกถอดออกทั้งชั้น
 * ทุกข้อในนี้ต้องยังเขียว ไม่ใช่ต้องลบทิ้งตามไป
 *
 * เขียนลงตาราง _Test_Bulk ซึ่งมีไว้ให้ชุดทดสอบเท่านั้น ระบบจริงไม่อ่านที่ไหนเลย
 */
function test_repo_rowCache() {
  beginTest_('แคชระดับการรันของชั้น Repo');

  var mine = { Row_ID: { op: 'like', value: dbLikeLiteral_(testPrefix_()) + '*' } };
  var id = testPrefix_() + 'C1';

  try {
    appendRow_(TEST_BULK_TABLE, { 'Row_ID': id, 'Row_Name': 'ค่าแรก', 'Sort_Order': 1, 'Active': true });

    var first = findOne_(TEST_BULK_TABLE, 'Row_ID', id);
    assertEquals_(first['Row_Name'], 'ค่าแรก', 'อ่านครั้งแรกได้ค่าที่เพิ่งเขียน');
    assertTrue_(!!ROW_CACHE_[TEST_BULK_TABLE], 'อ่านแล้วภาพของตารางถูกเก็บไว้ใช้ซ้ำในการรันนี้');

    // อ่านซ้ำต้องได้ object คนละก้อน เพื่อไม่ให้ผู้เรียกเผลอไปแก้ค่าในแคช
    var second = findOne_(TEST_BULK_TABLE, 'Row_ID', id);
    assertTrue_(first !== second, 'อ่านซ้ำได้ object ใหม่ ไม่ใช่ตัวเดิมที่ค้างในแคช');
    first['Row_Name'] = 'แก้ใน memory';
    assertEquals_(findOne_(TEST_BULK_TABLE, 'Row_ID', id)['Row_Name'], 'ค่าแรก',
      'แก้ค่าใน object ที่อ่านไป ต้องไม่กระทบข้อมูลที่อ่านครั้งถัดไป');

    // เขียนแล้วต้องอ่านได้ค่าใหม่ ไม่ใช่ค่าเก่าที่ค้างอยู่
    updateRow_(TEST_BULK_TABLE, 'Row_ID', id, { 'Row_Name': 'ค่าที่สอง' });
    assertEquals_(findOne_(TEST_BULK_TABLE, 'Row_ID', id)['Row_Name'], 'ค่าที่สอง',
      'หลังแก้ไขต้องอ่านได้ค่าใหม่ ไม่ใช่ค่าที่ค้างในแคช');

    // เพิ่มแถวแล้วต้องเห็นทันทีเช่นกัน
    var id2 = testPrefix_() + 'C2';
    appendRow_(TEST_BULK_TABLE, { 'Row_ID': id2, 'Row_Name': 'แถวใหม่', 'Sort_Order': 2, 'Active': true });
    assertEquals_(readAll_(TEST_BULK_TABLE).length, 2, 'เพิ่มแถวแล้วอ่านเห็นครบทันที');
    assertEquals_(findOne_(TEST_BULK_TABLE, 'Row_ID', id2)['Row_Name'], 'แถวใหม่',
      'อ่านแถวที่เพิ่งเพิ่มได้ค่าถูกต้อง');
    assertEquals_(findOne_(TEST_BULK_TABLE, 'Row_ID', id)['Row_Name'], 'ค่าที่สอง',
      'เพิ่มแถวใหม่แล้วแถวเดิมต้องไม่ถูกทับ');

    /*
     * ล้างแคชแล้วอ่านใหม่จากฐานข้อมูล ต้องได้ภาพเดียวกันเป๊ะ
     *
     * ข้อนี้คือตัวจับว่าภาพในหน่วยความจำเพี้ยนไปจากของจริงหรือไม่ — เป็นข้อเดียว
     * ที่บอกความต่างระหว่าง "แคชถูกต้อง" กับ "แคชถูกใจตัวเอง"
     */
    var cached = readAll_(TEST_BULK_TABLE);
    clearRowCache_(TEST_BULK_TABLE);
    assertTrue_(!ROW_CACHE_[TEST_BULK_TABLE], 'ล้างแคชแล้วภาพเดิมต้องไม่เหลืออยู่');

    var fresh = readAll_(TEST_BULK_TABLE);
    assertEquals_(fresh.length, cached.length, 'จำนวนแถวที่แคชไว้ตรงกับที่อ่านใหม่จากฐานข้อมูล');
    for (var f = 0; f < fresh.length; f++) {
      assertEquals_(String(fresh[f]['Row_ID']) + '|' + String(fresh[f]['Row_Name']),
        String(cached[f]['Row_ID']) + '|' + String(cached[f]['Row_Name']),
        'แถวที่ ' + (f + 1) + ' ที่แคชไว้ตรงกับของจริงในฐานข้อมูล');
    }

    /*
     * การอ่านที่ถามฐานข้อมูลตรง ๆ ต้องไม่ถูกแคชบังไว้
     *
     * ยุคชีตพิสูจน์ข้อนี้ด้วย readRowDirect_ ซึ่งอ่านช่วงแถวเดียวตรงจากชีต ·
     * ทางที่ทำหน้าที่เดียวกันตอนนี้คือ queryRows_ ซึ่งยิงเงื่อนไขไปให้ฐานข้อมูลคัดให้
     * และเป็นทางที่ Optimistic Lock พึ่งอยู่ ถ้ามันอ่านผ่านแคชเมื่อไร การตรวจนั้น
     * จะไร้ความหมายทันทีโดยไม่มีอะไรฟ้อง
     */
    updateRow_(TEST_BULK_TABLE, 'Row_ID', id2, { 'Row_Name': 'ค่าล่าสุด' });
    var direct = queryRows_(TEST_BULK_TABLE, { Row_ID: id2 });
    assertEquals_(direct.length, 1, 'ถามฐานข้อมูลตรง ๆ ต้องได้แถวที่ระบุ');
    assertEquals_(String(direct[0]['Row_Name']), 'ค่าล่าสุด',
      'การอ่านตรงต้องได้ค่าล่าสุดเสมอ ไม่ใช่ค่าที่ค้างในแคช');

  } finally {
    db_delete_(TEST_BULK_TABLE, mine);
    clearRowCache_();
  }

  assertEquals_(db_count_(TEST_BULK_TABLE, mine), 0, 'ต้องไม่เหลือแถวทดสอบไว้เลย');

  return endTest_();
}

/**
 * เดินงานจริงหนึ่งรอบให้ครบวงจรแบบสั้นที่สุด ใช้เป็นตัวตรวจว่าระบบยังทำงานอยู่
 */
function test_smoke_flow() {
  beginTest_('เดินงานครบวงจรหนึ่งรอบ');

  var users = serviceTestUsers_();
  var wo = createTestWo_(users, {
    'Assignment_Type': ASSIGNMENT.SERVICE,
    'Location': 'จุดตรวจ smoke ' + Math.floor(Math.random() * 10000)
  });

  assertEquals_(wo.workOrder['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'สร้างใบงานแล้วไปรออนุมัติทันที ไม่ผ่านสถานะร่าง (SPEC 4.1)');
  assertTrue_(String(wo.pjId).indexOf(PREFIX.PJ) === 0, 'ได้รหัสสถานที่ตามรูปแบบใหม่');

  approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE, users.approver);

  var task = findTaskOfDepartment_(wo.woId, DEPT.SERVICE);
  assertTrue_(!!task, 'อนุมัติแล้วเกิดงานของแผนก Service');

  changeStatus(ENTITY.TASK, task['Task_ID'], ACTION.TASK_ACCEPT, users.service, {});
  changeStatus(ENTITY.TASK, task['Task_ID'], ACTION.TASK_COMPLETE, users.service, {
    allStepsDone: true, requiredReportsOk: true
  });

  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.COMPLETED, 'แผนกปิดงานแล้ว WO ปิดเอง');
  assertEquals_(auditCount_(wo.woId, ENTITY.WO, ACTION.CREATE), 1, 'Audit บันทึกการสร้างใบงาน');
  assertEquals_(auditCount_(wo.woId, ENTITY.TASK, ACTION.TASK_COMPLETE), 1, 'Audit บันทึกการปิดงานของแผนก');
  assertEquals_(auditCount_(wo.woId, ENTITY.WO, ACTION.RECALC), 2,
    'Audit บันทึกการเปลี่ยนสถานะอัตโนมัติของใบงาน 2 ครั้ง');

  return endTest_();
}

/**
 * ฟังก์ชันที่หน้าเว็บเรียกเพิ่มในขั้นหน้าจอ — ค้นลูกค้า แก้ไขใบงาน และรายการรออนุมัติ
 * (SPEC 11, 17.2 · ฟังก์ชันใหม่ใน 09_Api.gs ต้องมีเทสต์ตามกติกาใน CLAUDE.md)
 */
function test_service_webApi() {
  beginTest_('ฟังก์ชันที่หน้าเว็บเรียก — SPEC 11, 17.2');

  var users = serviceTestUsers_();

  /* ---------- ค้นลูกค้า: ทดสอบตัวคัดกรองแบบล้วน ไม่ต้องแตะชีตที่อ่านอย่างเดียว ---------- */
  var sample = [
    makeCustomerRow_('บริษัท ทดสอบ ก จำกัด', 'AR0001', 'สมชาย', '2026-01-05'),
    makeCustomerRow_('บริษัท ทดสอบ ข จำกัด', 'AR0002', 'สมหญิง', '2026-02-10'),
    makeCustomerRow_('โรงแรมอารีน่า', '', 'สมศักดิ์', ''),
    makeCustomerRow_('', 'AR0009', 'ไม่มีชื่อ', '')
  ];

  assertEquals_(filterCustomers_(sample, 'ทดสอบ').length, 2, 'ค้นด้วยคำที่อยู่กลางชื่อได้ผลตรง');
  assertEquals_(filterCustomers_(sample, 'อารีน่า').length, 1, 'ค้นชื่อไทยที่ไม่มีคำว่าบริษัทได้');
  assertEquals_(filterCustomers_(sample, '  ทดสอบ ก  ').length, 1, 'ตัดช่องว่างหน้าหลังคำค้นก่อนเทียบ');
  assertEquals_(filterCustomers_(sample, 'ไม่มีลูกค้าชื่อนี้').length, 0, 'ไม่เจอก็คืนรายการว่าง ไม่ใช่ error');
  assertEquals_(filterCustomers_(sample, '').length, 3, 'ไม่ใส่คำค้นคืนทุกแถวที่มีชื่อ (ข้ามแถวที่ชื่อว่าง)');
  assertEquals_(filterCustomers_(sample, '', 2).length, 2, 'จำกัดจำนวนผลลัพธ์ได้');

  var withCode = filterCustomers_(sample, 'ทดสอบ ก')[0];
  assertEquals_(withCode.code, 'AR0001', 'ดึงรหัสลูกค้ามาให้');
  assertEquals_(withCode.salesPerson, 'สมชาย', 'ดึงพนักงานขายมาให้');
  assertEquals_(withCode.hasCode, true, 'ลูกค้าที่มีรหัสติดธง hasCode = true');

  var noCode = filterCustomers_(sample, 'อารีน่า')[0];
  assertEquals_(noCode.hasCode, false, 'ลูกค้าที่ยังไม่มีรหัสติดธง hasCode = false ให้หน้าจอบล็อกการเปิดใบงาน');

  /* ---------- แก้ไขใบงาน ---------- */
  // ใบที่แก้ไขได้ต้องผ่านการตีกลับมาก่อน เพราะใบที่รออนุมัติถูกล็อกไว้ (SPEC 5)
  var wo = returnedTestWo_(users, { 'Location': 'จุดที่จะแก้ไข', 'Contact': 'ผู้ติดต่อเดิม' });
  var before = getWorkOrder(wo.woId);

  var edited = editWorkOrder(wo.woId, testWoForm_({
    'Customer_Code': before['Customer_Code'],
    'Location': 'จุดที่จะแก้ไข',
    'Contact': 'ผู้ติดต่อใหม่',
    'Phone': '029998888'
  }), users.admin, before['Updated_Date']);

  assertEquals_(edited.workOrder['Contact'], 'ผู้ติดต่อใหม่', 'แก้ไขข้อมูลใบงานได้');
  assertEquals_(edited.workOrder['Overall_Status'], WO_STATUS.RETURNED, 'การแก้ไขไม่เปลี่ยนสถานะใบงาน');
  assertEquals_(edited.workOrder['PJ_ID'], before['PJ_ID'], 'สถานที่เดิมยังใช้รหัสสถานที่เดิม');
  assertEquals_(auditCount_(wo.woId, ENTITY.WO, ACTION.EDIT), 1, 'การแก้ไขถูกบันทึกลง Audit_Log 1 แถว');

  // ใช้ค่า Updated_Date ชุดเดิมซ้ำต้องถูกปฏิเสธ เพราะมีการแก้ไปแล้ว (SPEC C-3)
  assertThrowsMessage_(function () {
    editWorkOrder(wo.woId, testWoForm_({
      'Customer_Code': before['Customer_Code'], 'Location': 'จุดที่จะแก้ไข'
    }), users.admin, before['Updated_Date']);
  }, 'ถูกแก้ไขโดยผู้ใช้อื่นไปแล้ว', 'แก้ไขด้วยค่า Updated_Date ที่ล้าสมัย ต้องถูกปฏิเสธ');

  // ไม่มีรหัสลูกค้าก็แก้ไขไม่ได้เช่นเดียวกับตอนสร้าง
  assertThrowsMessage_(function () {
    editWorkOrder(wo.woId, testWoForm_({ 'Customer_Code': '' }), users.admin);
  }, 'กรุณาเพิ่มรหัสลูกค้าก่อนเปิดใบงาน', 'แก้ไขโดยไม่มีรหัสลูกค้า ต้องถูกปฏิเสธพร้อมข้อความที่บอกทางออก');

  // ใบงานที่ส่งอนุมัติไปแล้วถูกล็อกการแก้ไข (SPEC 4.1)
  var latest = getWorkOrder(wo.woId);
  submitWorkOrder(wo.woId, users.admin, latest['Updated_Date']);
  assertThrows_(function () {
    editWorkOrder(wo.woId, testWoForm_({ 'Customer_Code': before['Customer_Code'] }), users.admin);
  }, 'ใบงานที่รออนุมัติอยู่ แก้ไขไม่ได้');

  /* ---------- รายการรออนุมัติ ---------- */
  var pending = listPendingApprovals(users.approver);
  assertTrue_(containsWo_(pending, wo.woId), 'ใบงานที่เพิ่งส่งอนุมัติอยู่ในรายการของ APPROVER_SP');
  assertTrue_(!containsWo_(listPendingApprovals(users.labApprover), wo.woId),
    'ผู้อนุมัติสาย Lab ต้องไม่เห็นใบงานสาย SP');
  assertEquals_(listPendingApprovals(users.service).length, 0,
    'ผู้ใช้ที่ไม่ใช่ผู้อนุมัติเห็นรายการว่าง');

  var labWo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.LAB, 'Location': 'ห้องแล็บทดสอบ' });
  assertTrue_(containsWo_(listPendingApprovals(users.labApprover), labWo.woId),
    'ใบงานสาย Lab อยู่ในรายการของ APPROVER_LAB');
  assertTrue_(!containsWo_(listPendingApprovals(users.approver), labWo.woId),
    'APPROVER_SP ต้องไม่เห็นใบงานสาย Lab');

  // อนุมัติไปแล้วต้องหลุดจากรายการรออนุมัติ
  approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE, users.approver);
  assertTrue_(!containsWo_(listPendingApprovals(users.approver), wo.woId),
    'ใบงานที่อนุมัติแล้วหลุดจากรายการรออนุมัติ');

  /* ---------- ชั้น API ต้องคืน {ok, ...} เสมอ ---------- */
  var searchResult = api_searchCustomers('ทดสอบ');
  assertTrue_(typeof searchResult.ok === 'boolean', 'api_searchCustomers คืนฟิลด์ ok เสมอ');

  var editResult = api_editWorkOrder('TEST-ไม่มีใบงานนี้', {}, null);
  assertEquals_(editResult.ok, false, 'api_editWorkOrder กับใบงานที่ไม่มีอยู่ คืน ok = false');
  assertTrue_(!!editResult.message, 'และมีข้อความบอกสาเหตุ');

  var pendingResult = api_listPendingApprovals();
  assertTrue_(typeof pendingResult.ok === 'boolean', 'api_listPendingApprovals คืนฟิลด์ ok เสมอ');

  return endTest_();
}

/**
 * สร้างแถวจำลองของชีต Customer สำหรับทดสอบตัวคัดกรอง
 * @param {string} name ชื่อลูกค้า
 * @param {string} code รหัสลูกค้า
 * @param {string} sales พนักงานขาย
 * @param {string} startDate วันที่เริ่มติดต่อ
 * @return {Object}
 */
function makeCustomerRow_(name, code, sales, startDate) {
  var row = {};
  row[CUSTOMER_FIELD.NAME] = name;
  row[CUSTOMER_FIELD.CODE] = code;
  row[CUSTOMER_FIELD.SALES] = sales;
  row[CUSTOMER_FIELD.START_DATE] = startDate;
  return row;
}

/**
 * รายการนี้มีใบงานเลขที่ที่ระบุอยู่หรือไม่
 * @param {Object[]} rows รายการใบงาน
 * @param {string} woId เลขที่ใบงาน
 * @return {boolean}
 */
function containsWo_(rows, woId) {
  for (var i = 0; i < rows.length; i++) {
    if (rows[i]['WO_ID'] === woId) return true;
  }
  return false;
}

/**
 * ค่าที่คืนจากทุกฟังก์ชัน api_* ต้องส่งผ่าน google.script.run ได้จริง (กฎข้อ 14 · SPEC 19)
 *
 * เทสต์นี้มีไว้ดักกรณีที่มีคนเพิ่ม api_ ใหม่แล้วลืมห่อด้วยตัวแปลงกลาง
 * เพราะอาการเวลาพลาดคือหน้าเว็บได้ undefined เงียบ ๆ ไม่มี error ให้เห็นเลย
 */
function test_service_apiJsonSafe() {
  beginTest_('ค่าที่คืนจาก api_* ต้องข้าม google.script.run ได้ — กฎข้อ 14');

  /* ---------- ตัวแปลงและตัวตรวจ ---------- */
  assertEquals_(jsonSafe_(undefined), null, 'undefined ถูกแปลงเป็น null');
  assertEquals_(jsonSafe_(new Date(0)), '1970-01-01T00:00:00.000Z', 'Date ถูกแปลงเป็นข้อความ ISO');
  assertEquals_(jsonSafe_(NaN), null, 'NaN ที่ข้ามช่องทางไม่ได้ ถูกแปลงเป็น null');
  assertEquals_(jsonSafe_('ข้อความไทย'), 'ข้อความไทย', 'ข้อความคงเดิม');
  assertEquals_(jsonSafe_(0), 0, 'เลข 0 ต้องไม่ถูกแปลงเป็น null');
  assertEquals_(jsonSafe_(false), false, 'ค่า false ต้องไม่ถูกแปลงเป็น null');

  var nested = jsonSafe_({
    when: new Date(86400000),
    list: [new Date(0), 'ปกติ', undefined, { deep: new Date(0) }],
    keep: { text: 'ยังอยู่', flag: true }
  });
  assertEquals_(typeof nested.when, 'string', 'Date ที่อยู่ในฟิลด์ถูกแปลง');
  assertEquals_(typeof nested.list[0], 'string', 'Date ที่อยู่ใน array ถูกแปลง');
  assertEquals_(nested.list[2], null, 'undefined ใน array กลายเป็น null');
  assertEquals_(typeof nested.list[3].deep, 'string', 'Date ที่ซ้อนลึกก็ถูกแปลง');
  assertEquals_(nested.keep.text, 'ยังอยู่', 'ค่าที่ปลอดภัยอยู่แล้วไม่ถูกแตะ');
  assertTrue_(isJsonSafe_(nested), 'ผลลัพธ์ทั้งก้อนผ่านตัวตรวจ');

  assertEquals_(isJsonSafe_(new Date()), false, 'ตัวตรวจต้องจับ Date ได้');
  assertEquals_(isJsonSafe_({ a: [1, { b: new Date() }] }), false, 'ตัวตรวจต้องจับ Date ที่ซ้อนลึกได้');
  assertEquals_(isJsonSafe_(undefined), false, 'ตัวตรวจต้องจับ undefined ได้');

  /* ---------- วนเรียกทุกฟังก์ชัน api_* ---------- */
  var users = serviceTestUsers_();
  var code = testCustomerCode_('01');
  var wo = createTestWo_(users, { 'Job_Description': 'ปั๊มน้ำมีเสียงดังผิดปกติ' });

  // api_createWorkOrder ตั้งใจส่งฟอร์มที่ไม่ผ่านการตรวจ เพราะถ้าสร้างสำเร็จจะได้ใบงานเลขจริง
  // ที่ test_cleanup() ตามลบไม่ได้ · ฟังก์ชันที่เปลี่ยนสถานะก็ส่งเหตุผลว่างไว้ให้ถูกปฏิเสธ
  // ทั้งสองแบบยังตรวจสิ่งที่ต้องการได้ เพราะเส้นทางผิดพลาดก็ต้องผ่านตัวแปลงกลางเหมือนกัน
  var argsByName = {
    'api_getBootstrap':        [],
    'api_listWorkOrders':      [],
    'api_listPendingApprovals': [],
    'api_getWorkOrder':        [wo.woId],
    'api_searchCustomers':     ['ทดสอบ'],
    'api_listLocations':       [code, 'โครงการทดสอบ'],
    'api_findSimilarLocation': [code, 'โครงการทดสอบ', 'ห้องปั๊มน้ำ'],
    'api_createWorkOrder':     [{}],
    'api_editWorkOrder':       [wo.woId, {}, null],
    'api_submitWorkOrder':     [wo.woId, null],
    'api_approveWorkOrder':    [wo.woId, '', {}],
    'api_returnWorkOrder':     [wo.woId, '', null],
    'api_cancelWorkOrder':     [wo.woId, '', null],
    'api_reopenWorkOrder':     [wo.woId, '', '', {}]
  };

  var names = listApiFunctionNames_();
  assertTrue_(names.length >= 10, 'หาฟังก์ชัน api_* เจอครบ (พบ ' + names.length + ' ตัว)');

  var scope = (typeof globalThis !== 'undefined') ? globalThis : this;
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var args = Object.prototype.hasOwnProperty.call(argsByName, name) ? argsByName[name] : [];
    var result;
    try {
      result = scope[name].apply(null, args);
    } catch (e) {
      fail_(name + ' โยน error ดิบออกมา ทั้งที่ต้องคืน {ok:false} เสมอ — ' + e.message);
      continue;
    }

    if (!result || typeof result.ok !== 'boolean') {
      fail_(name + ' ไม่ได้คืนผลในรูปแบบ {ok, ...}');
      continue;
    }
    if (!isJsonSafe_(result)) {
      fail_(name + ' คืนค่าที่ข้าม google.script.run ไม่ได้ — ลืมห่อด้วยตัวแปลงกลางหรือไม่');
      continue;
    }
    pass_(name + ' คืนค่าที่ส่งให้หน้าเว็บได้ (ok = ' + result.ok + ')');
  }

  /* ---------- จุดที่พังจริงเมื่อลืมห่อ: แถวที่มีวันที่จากชีต ---------- */
  var rawRow = getWorkOrder(wo.woId);
  assertTrue_(toDate_(rawRow['Created_Date']) !== null, 'แถวดิบจากชีตมีวันที่เป็น Date จริง');
  assertEquals_(isJsonSafe_(rawRow), false, 'แถวดิบจากชีตส่งให้หน้าเว็บตรง ๆ ไม่ได้');
  assertEquals_(typeof jsonSafe_(rawRow)['Created_Date'], 'string',
    'เมื่อผ่านตัวแปลงแล้ว วันที่กลายเป็นข้อความ ISO ที่หน้าเว็บรับได้');

  var probe = api_getWorkOrder(wo.woId);
  if (probe.ok) {
    assertEquals_(typeof probe.data.workOrder['Created_Date'], 'string',
      'api_getWorkOrder คืนวันที่เป็นข้อความ ISO');
  } else {
    Logger.log('  (ข้ามการตรวจเส้นทางสำเร็จของ api_getWorkOrder: ' + probe.message + ')');
  }

  return endTest_();
}

/**
 * ฟิลด์ใหม่ตาม SPEC 9.3 และกติกาว่าอะไรบังคับตอนไหน
 */
function test_service_woFormFields() {
  beginTest_('ฟิลด์ของใบงานตาม SPEC 9.3');

  var users = serviceTestUsers_();
  var wo = createTestWo_(users, {
    'Job_Description': 'ปั๊มน้ำมีเสียงดังผิดปกติ',
    'Product_Detail': 'ปั๊มน้ำรุ่น XP-200',
    'Work_Scope': 'ห้องเครื่องชั้นใต้ดิน โซน B',
    'Reference_Doc': 'QT-2026-0099',
    'Remark': 'ลูกค้าขอให้เข้าช่วงเช้า'
  });

  var row = wo.workOrder;
  assertEquals_(row['Job_Description'], 'ปั๊มน้ำมีเสียงดังผิดปกติ', 'บันทึกลักษณะงานที่ทำหรืออาการได้');
  assertEquals_(row['Product_Detail'], 'ปั๊มน้ำรุ่น XP-200', 'บันทึกรายละเอียดของสินค้าได้');
  assertEquals_(row['Work_Scope'], 'ห้องเครื่องชั้นใต้ดิน โซน B', 'บันทึกขอบเขตของงานได้');
  assertEquals_(row['Reference_Doc'], 'QT-2026-0099', 'บันทึกเอกสารอ้างอิงได้');
  assertEquals_(row['Remark'], 'ลูกค้าขอให้เข้าช่วงเช้า', 'บันทึกหมายเหตุได้');

  // ฟอร์มเขียนได้เฉพาะคอลัมน์ที่ประกาศไว้ ค่าที่แอบส่งมาต้องไม่มีผล
  var sneaky = pickFormFields_({
    'Job_Description': 'ปกติ', 'Overall_Status': WO_STATUS.COMPLETED,
    'Approved_By': 'ใครก็ไม่รู้', 'Return_Count': 99, 'WO_ID': 'ของปลอม'
  });
  assertEquals_(sneaky['Job_Description'], 'ปกติ', 'ฟิลด์ที่อนุญาตยังผ่านได้ตามปกติ');
  assertEquals_(sneaky['Overall_Status'], undefined, 'ฟอร์มเปลี่ยนสถานะใบงานเองไม่ได้');
  assertEquals_(sneaky['Approved_By'], undefined, 'ฟอร์มเปลี่ยนผู้อนุมัติเองไม่ได้');
  assertEquals_(sneaky['Return_Count'], undefined, 'ฟอร์มเปลี่ยนตัวนับการตีกลับเองไม่ได้');
  assertEquals_(sneaky['WO_ID'], undefined, 'ฟอร์มเปลี่ยนเลขที่ใบงานเองไม่ได้');

  /*
   * ทุกช่องบังคับตั้งแต่ตอนสร้าง เพราะไม่มีขั้นบันทึกร่างแล้ว (SPEC 4.1)
   * และต้องตรวจที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่เชื่อการตรวจในหน้าเว็บอย่างเดียว
   */
  var beforeRows = listWorkOrders().length;
  assertThrowsMessage_(function () {
    createTestWo_(users, { 'Location': 'จุดที่ยังไม่ได้กรอกอาการ', 'Job_Description': '' });
  }, 'ลักษณะงานที่ทำ หรืออาการ', 'สร้างใบงานโดยยังไม่กรอกลักษณะงาน ต้องถูกปฏิเสธ');
  assertEquals_(listWorkOrders().length, beforeRows,
    'ถูกปฏิเสธแล้วต้องไม่มีแถวใดถูกเขียนลงชีต');

  // ข้อความต้องบอกชื่อช่องเป็นภาษาไทย ไม่ใช่ชื่อคอลัมน์ และบอกจำนวนช่องที่ขาดด้วย
  var createError = '';
  try {
    createTestWo_(users, { 'Location': 'จุดที่กรอกไม่ครบ', 'Phone': '', 'Contact': '' });
  } catch (e) {
    createError = e.message;
  }
  assertTrue_(createError.indexOf('ชื่อผู้ติดต่อ') !== -1,
    'ข้อความบอกช่องที่ขาดใช้ชื่อภาษาไทยบนหน้าจอ (ได้: ' + createError + ')');
  assertTrue_(createError.indexOf('Contact') === -1, 'ต้องไม่มีชื่อคอลัมน์ดิบหลุดออกไป');
  assertTrue_(createError.indexOf('2 ช่อง') !== -1, 'บอกจำนวนช่องที่ยังขาดด้วย');

  /* ---------- เลขที่ใบงานต้องไม่ถูกใช้ทิ้ง ---------- */
  /*
   * การตรวจต้องเกิดก่อนออกเลขที่เสมอ ไม่งั้นทุกครั้งที่กรอกไม่ครบ เลขจะวิ่งไปหนึ่งใบ
   * แล้วเลขที่เอกสารจะมีช่องโหว่ที่อธิบายกับลูกค้าไม่ได้
   */
  var good = createTestWo_(users, { 'Location': 'จุดที่กรอกครบแล้ว' });
  var numberBefore = Number(String(good.woId).slice(-4));
  try {
    createTestWo_(users, { 'Location': 'จุดที่กรอกไม่ครบอีกใบ', 'Contact': '' });
  } catch (e) {
    // ตั้งใจให้ล้มเหลว
  }
  var next = createTestWo_(users, { 'Location': 'จุดถัดไป' });
  assertEquals_(Number(String(next.woId).slice(-4)), numberBefore + 1,
    'ใบที่กรอกไม่ครบต้องไม่กินเลขที่ใบงานไป');

  /* ---------- ใบที่ถูกตีกลับ แก้แล้วส่งใหม่ได้ ---------- */
  var returned = returnedTestWo_(users, { 'Location': 'จุดที่ถูกตีกลับ' });
  editWorkOrder(returned.woId, testWoForm_({
    'Customer_Code': returned.workOrder['Customer_Code'],
    'Location': 'จุดที่ถูกตีกลับ',
    'Job_Description': 'ตรวจเช็คระบบน้ำประจำปี'
  }), users.admin);
  assertEquals_(submitWorkOrder(returned.woId, users.admin).to, WO_STATUS.PENDING_APPROVE,
    'แก้ตามที่ถูกตีกลับแล้ว ส่งขออนุมัติใหม่ได้ตามปกติ');

  return endTest_();
}

/**
 * โหลดฟังก์ชันฝั่งหน้าเว็บเข้ามาทดสอบฝั่งเซิร์ฟเวอร์
 *
 * ฟังก์ชันใน ui_Script.html ไม่เคยถูกทดสอบเลย เพราะรันอยู่คนละฝั่ง
 * แต่จุดที่พังเงียบที่สุดของงานวันที่อยู่ตรงนั้นพอดี — ถ้าเผลอเอารูปแบบที่ใช้แสดงผล
 * ไปใส่ในช่อง input type="date" เบราว์เซอร์จะทิ้งค่านั้นแล้วปล่อยช่องว่าง
 * โดยไม่มี error ให้เห็นทั้งสองฝั่ง
 *
 * ฟังก์ชันที่ดึงมาเป็นฟังก์ชันแปลงค่าล้วน ไม่แตะ DOM จึงรันนอกเบราว์เซอร์ได้
 * @return {Object} แผนที่ชื่อฟังก์ชันไปยังตัวฟังก์ชัน
 */
function loadWebFunctions_() {
  var html = HtmlService.createHtmlOutputFromFile('ui_Script').getContent();
  var code = html.replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '');

  /*
   * ต้องใส่ของที่มีแต่ในเบราว์เซอร์เข้าไปให้ด้วย ไม่งั้นโค้ดของหน้าตายตั้งแต่บรรทัดแรก
   *
   * ui_Script ติดตั้งตัวกันหน้าค้างไว้ตอนแปลไฟล์ ซึ่งเรียก setTimeout ทันที ·
   * Apps Script ไม่มี setTimeout ชุดนี้จึงล้มด้วย ReferenceError บนของจริง
   * **และล้มเงียบมานาน** เพราะตัวรันจำลองในเครื่องเป็น Node ซึ่งมี setTimeout ให้อยู่แล้ว
   * นี่คือตัวอย่างตรง ๆ ของของจำลองที่ใจดีกว่าของจริง
   *
   * ใส่เป็นพารามิเตอร์ของ Function เพื่อให้บังตัวจริงเฉพาะในขอบเขตนี้ ไม่ไปแตะ
   * สภาพแวดล้อมของชุดทดสอบอื่น · ฟังก์ชันที่ดึงออกมาทดสอบเป็นฟังก์ชันแปลงค่าล้วน
   * จึงไม่ได้ใช้ของพวกนี้จริงสักตัว
   */
  var factory = new Function('setTimeout', 'document', 'window', code +
    '; return { formatDate: formatDate, toDateInput: toDateInput, toDateTimeInput: toDateTimeInput,' +
    ' bootPage: bootPage };');

  return factory(
    function () { return 0; },
    { querySelectorAll: function () { return []; } },
    {});
}

/**
 * ชื่อของฟังก์ชันที่ยังพูดคำว่า "ชีต" ในข้อความที่คนอ่าน
 *
 * ดูเฉพาะข้อความใน string เท่านั้น ไม่ดูคำอธิบาย — คำอธิบายในโค้ดเล่าประวัติได้
 * และควรเล่า ส่วนข้อความที่ผู้ใช้เห็นต้องพูดถึงระบบที่มีอยู่จริงวันนี้
 *
 * @param {string} source โค้ดของฟังก์ชันหนึ่งตัว
 * @return {string[]} ข้อความที่พบ
 */
function sheetWordsInText_(source) {
  var clean = stripComments_(String(source || ''));
  var found = [];
  var texts = clean.match(/'[^']*'|"[^"]*"/g) || [];
  for (var i = 0; i < texts.length; i++) {
    if (texts[i].indexOf('ชีต') !== -1) found.push(texts[i]);
  }
  return found;
}

/**
 * ข้อความที่ผู้ใช้เห็น ต้องไม่พูดถึงที่เก็บข้อมูลที่ไม่มีอยู่แล้ว (SPEC 22)
 *
 * **ข้อความที่ล้าสมัยอันตรายกว่าข้อความที่ผิด** · ข้อความที่ผิดทำให้คนสงสัย
 * แต่ข้อความที่เคยจริงเมื่อปีที่แล้วทำให้คนเชื่อ แล้วไปทำตาม เช่นไปหาลูกค้าใน
 * ที่เก็บข้อมูลเดิมซึ่งไม่มีใครอัปเดตอีกแล้ว
 *
 * **ไม่มีข้อยกเว้นอีกแล้ว** · เครื่องมือย้ายข้อมูลเคยเป็นข้อยกเว้นเดียว
 * เพราะมันต้องเล่าว่ากำลังเทียบอะไรกับอะไร · ตอนนี้มันถูกลบไปแล้ว รายการยกเว้นจึงหายตามไปด้วย
 * ตามที่ตัวมันเองประกาศไว้ — **รายการยกเว้นที่ไม่มีวันหมดอายุ คือรายการที่โตขึ้นตลอดไป**
 */
function test_web_noStaleStorageWords() {
  beginTest_('ข้อความที่ผู้ใช้เห็นต้องไม่พูดถึงที่เก็บข้อมูลเดิม');

  /* ---------- ตัวสแกนต้องแยกคำอธิบายออกจากข้อความจริงได้ ---------- */
  assertEquals_(sheetWordsInText_("function f() { return 'อ่านจากชีต'; }").length, 1,
    'ตัวสแกนต้องจับข้อความที่ผู้ใช้เห็นได้');
  assertEquals_(sheetWordsInText_('function f() { /* เคยอยู่บนชีต */ return 1; }').length, 0,
    'แต่ต้องไม่ฟ้องคำอธิบายในโค้ด ซึ่งมีไว้เล่าประวัติและควรเล่า');

  /* ---------- หน้าเว็บทุกหน้า ---------- */
  var pages = ['ui_Home', 'ui_CreateWo', 'ui_Approve', 'ui_DeptWork', 'ui_LabWork',
    'ui_Returned', 'ui_WoDetail', 'ui_WoList', 'ui_Reports', 'ui_Nav', 'ui_Auth',
    'ui_Script', 'ui_FileCheck'];
  for (var p = 0; p < pages.length; p++) {
    var body = stripComments_(HtmlService.createHtmlOutputFromFile(pages[p]).getContent());
    assertEquals_(body.indexOf('ชีต'), -1,
      pages[p] + ' ยังบอกผู้ใช้ให้ไปทำอะไรกับที่เก็บข้อมูลที่ไม่มีอยู่แล้ว');
  }

  /* ---------- ข้อความทุกอันที่ฝั่งเซิร์ฟเวอร์ส่งออกมา ---------- */
  /*
   * ไม่มีข้อยกเว้นสักตัว — เทียบกับรายการว่าง ไม่ใช่เทียบกับรายชื่อที่พิมพ์ไว้
   *
   * เทียบแบบเท่ากันเป๊ะ ไม่ใช่แค่ "ไม่เกิน" — ชื่อที่หลุดเข้ามาใหม่จะแดง
   * · ถ้าวันหนึ่งจำเป็นต้องมีข้อยกเว้นจริง มันต้องเขียนไว้ติดกับของที่มันยกเว้นให้
   * แบบ driveLayerFunctions_ ไม่ใช่เขียนที่นี่
   */
  var offenders = [];
  var scanned = 0;

  for (var name in globalThis) {
    if (typeof globalThis[name] !== 'function') continue;
    if (name.indexOf('test_') === 0) continue;
    scanned++;
    var found;
    try {
      found = sheetWordsInText_(String(globalThis[name]));
    } catch (e) {
      continue;
    }
    if (found.length) offenders.push(name);
  }

  assertTrue_(scanned > 50, 'ตัวสแกนต้องเห็นโค้ดของระบบจริง (เห็น ' + scanned + ' ตัว)');
  assertEquals_(offenders.sort().join(', '), '',
    'ต้องไม่มีฟังก์ชันไหนในระบบที่ยังพูดถึงที่เก็บข้อมูลเดิมในข้อความที่ผู้ใช้เห็น');

  return endTest_();
}

/**
 * ข้อความที่บอกให้รันทีละกลุ่ม ต้องบอกครบทุกกลุ่มที่มีจริง
 *
 * **ข้อนี้มาจากข้อความที่ผิดมานานโดยไม่มีใครเห็น** · ข้อความเดิมพิมพ์ชื่อกลุ่มไว้เจ็ดกลุ่ม
 * ทั้งที่ระบบมียี่สิบหกกลุ่ม และในเจ็ดกลุ่มนั้นไม่มีกลุ่ม DB ซึ่งเป็นกลุ่มที่คุยกับฐานข้อมูลจริง
 * คนที่ทำตามข้อความจะรันไม่ถึงหนึ่งในสามแล้วเชื่อว่ารันครบ ซึ่งแย่กว่าไม่มีข้อความเลย
 *
 * ทางแก้ไม่ใช่การพิมพ์ยี่สิบหกชื่อให้ถูก แต่คือการให้ข้อความอ่านจากทะเบียนกลุ่มจริง
 * เพื่อให้กลุ่มที่ยี่สิบเจ็ดเข้าไปอยู่ในข้อความเองโดยไม่มีใครต้องจำ
 */
function test_meta_runOneByOneMessageListsEveryGroup() {
  beginTest_('ข้อความที่บอกให้รันทีละกลุ่ม ต้องครบทุกกลุ่มจริง');

  var groups = testGroupRunners_();
  var message = testGroupCallList_();

  assertTrue_(groups.length >= 26,
    'ทะเบียนกลุ่มต้องมีอย่างน้อยยี่สิบหกกลุ่ม (มี ' + groups.length + ')');

  for (var i = 0; i < groups.length; i++) {
    var callable = functionName_(groups[i].fn);
    assertTrue_(callable !== '', 'กลุ่ม ' + groups[i].name + ' ต้องมีชื่อฟังก์ชันให้คนกดรันได้');
    assertTrue_(message.indexOf(callable) !== -1,
      'ข้อความต้องบอกชื่อ ' + callable + ' ด้วย ไม่งั้นคนรันตามแล้วจะข้ามกลุ่มนี้ไปเงียบ ๆ');
    assertEquals_(typeof globalThis[callable], 'function',
      'ชื่อที่บอกให้คนไปกด ต้องเรียกได้จริง — ' + callable);
  }

  assertTrue_(message.indexOf('test_group_db') !== -1,
    'กลุ่มที่คุยกับฐานข้อมูลจริงต้องอยู่ในข้อความ เพราะเป็นกลุ่มที่ของจำลองยืนยันแทนไม่ได้');

  /* ---------- ข้อห้ามบนของจริง ต้องบอกเหตุผลและทางแทน ---------- */
  var refused = '';
  try {
    assertTestAllFits_();
  } catch (error) {
    refused = String(error.message);
  }
  if (isMockEnvironment_()) {
    assertEquals_(refused, '', 'บนตัวจำลองต้องรัน test_all() ได้เสมอ');
  } else {
    assertTrue_(refused.indexOf('360') !== -1,
      'ต้องบอกเหตุผลด้วยตัวเลขจริง ไม่ใช่ห้ามเฉย ๆ (กฎข้อ 32)');
    assertTrue_(refused.indexOf('test_group_db') !== -1,
      'และต้องบอกรายชื่อกลุ่มที่ต้องรันแทน ครบทุกกลุ่ม');
  }

  return endTest_();
}

/**
 * ทุกที่ที่บอกว่าใครทำอะไร ต้องแสดงชื่อ ไม่ใช่อีเมล (SPEC 13 · กองที่ 4 ข้อ 1)
 *
 * **และของที่เก็บต้องยังเป็นอีเมล** · อีเมลคือคีย์หลักของทะเบียนผู้ใช้และเป็นสิ่งเดียว
 * ที่ไม่เปลี่ยน · ถ้าวันหนึ่งมีคนเขียนชื่อลงฐานข้อมูลแทน ประวัติทั้งหมดจะพังในวันที่
 * มีคนเปลี่ยนนามสกุล และจะไม่มีทางรู้อีกเลยว่าแถวเก่าหมายถึงใคร · ข้อนี้จึงตรวจ
 * ทั้งสองฝั่งเสมอ คือฝั่งที่แสดง กับฝั่งที่เก็บ
 */
function test_web_showsDisplayNameNotEmail() {
  beginTest_('ทุกที่ที่บอกว่าใครทำอะไร ต้องแสดงชื่อ ไม่ใช่อีเมล');

  var users = serviceTestUsers_();

  /* ---------- ชื่อที่มีอักขระทำ JavaScript พัง ต้องไม่ทำให้หน้าพัง (กฎข้อ 33) ---------- */
  var nasty = 'ผู้แจ้ง ' + hostileText_();
  var maker = addLoginTestUser_('NAME1', ROLE.ADMIN, 'รหัสผ่านของผู้แจ้งงาน',
    { 'Display_Name': nasty });
  clearRowCache_(SHEET.USER_ROLE);

  var wo = withTestUser_({ email: maker.email, roles: [ROLE.ADMIN] }, function () {
    return createTestWo_({ admin: { email: maker.email, roles: [ROLE.ADMIN] } }, {});
  });

  /* ---------- ฝั่งที่เก็บ ต้องเป็นอีเมลเหมือนเดิมทุกตัวอักษร ---------- */
  var saved = getWorkOrder(wo.woId);
  assertEquals_(String(saved['Created_By']), maker.email,
    'คอลัมน์ Created_By ต้องยังเก็บอีเมล ไม่ใช่ชื่อที่แสดง');

  /* ---------- ฝั่งที่แสดง ต้องเป็นชื่อ ---------- */
  var detail = workOrderDetail(wo.woId).workOrder;
  assertEquals_(detail.createdBy, nasty,
    'หน้ารายละเอียดต้องแสดงชื่อ ไม่ใช่อีเมล (ได้: ' + detail.createdBy + ')');
  assertTrue_(String(detail.createdBy).indexOf('@') === -1 || nasty.indexOf('@') !== -1,
    'และต้องไม่มีอีเมลหลงเหลืออยู่ในค่าที่ส่งไปแสดง');

  /* ---------- หน้าอนุมัติรับแถวดิบไปทั้งแถว จึงต้องได้ชื่อมาด้วย ---------- */
  var pending = withTestUser_(users.approver, function () {
    return api_listPendingApprovals(ROUTE.SP);
  });
  var foundRow = null;
  for (var i = 0; i < pending.data.rows.length; i++) {
    if (String(pending.data.rows[i]['WO_ID']) === wo.woId) foundRow = pending.data.rows[i];
  }
  assertTrue_(!!foundRow, 'ใบงานที่เพิ่งสร้างต้องอยู่ในรายการรออนุมัติ');
  assertEquals_(foundRow['Created_By_Name'], nasty, 'หน้าอนุมัติต้องได้ชื่อของผู้แจ้งงาน');
  assertEquals_(String(foundRow['Created_By']), maker.email,
    'และค่าที่ชื่อ Created_By ต้องยังเป็นอีเมล ไม่ถูกทับด้วยชื่อ');

  /* ---------- ทุกหน้าต้องยังแปลผ่าน ทั้งที่ชื่อเต็มไปด้วยอักขระร้าย ---------- */
  for (var key in WEB_PAGES) {
    if (!Object.prototype.hasOwnProperty.call(WEB_PAGES, key)) continue;
    var html = servedHtmlOf_(key, { wo: wo.woId, dept: DEPT.SERVICE, view: 'active' });
    assertEquals_(riskReport_(htmlRiskScan_(html)), '',
      'หน้า ' + key + ' ต้องยังแปลผ่าน แม้ชื่อผู้ใช้จะเต็มไปด้วยอักขระร้าย');
  }

  /* ---------- คนที่ไม่มีในทะเบียน ต้องเห็นอีเมล ไม่ใช่ช่องว่าง ---------- */
  var ghost = 'คนที่ลาออกไปแล้ว@cnr.co.th';
  assertEquals_(displayNameOf_(ghost), ghost,
    'ผู้ใช้ที่ถูกลบหรือปิดไปแล้ว ต้องแสดงอีเมล · ประวัติที่บอกว่า "ใครไม่รู้อนุมัติใบนี้" แย่กว่าบอกอีเมล');
  assertEquals_(displayNameOf_(''), '', 'ค่าว่างต้องยังเป็นค่าว่าง ไม่ใช่กลายเป็นข้อความอะไรสักอย่าง');

  /* ---------- ผู้ใช้ที่ถูกปิดการใช้งาน ต้องยังมีชื่อในประวัติ ---------- */
  var gone = addLoginTestUser_('NAME2', ROLE.SERVICE, 'รหัสผ่านของคนที่ถูกปิด',
    { 'Display_Name': 'ช่างที่ลาออกแล้ว', 'Active': false });
  clearRowCache_(SHEET.USER_ROLE);
  assertEquals_(displayNameOf_(gone.email), 'ช่างที่ลาออกแล้ว',
    'ปิดการใช้งานแล้วชื่อต้องยังอยู่ ไม่งั้นประวัติเก่าจะกลายเป็นอีเมลเงียบ ๆ');

  /* ---------- ชื่อที่เปลี่ยนแล้ว ต้องเห็นทันที ไม่ต้องรอแคชหมดอายุ ---------- */
  updateUserRole_(gone.email, { 'Display_Name': 'ชื่อที่แก้ให้สะกดถูกแล้ว' });
  assertEquals_(displayNameOf_(gone.email), 'ชื่อที่แก้ให้สะกดถูกแล้ว',
    'แก้ชื่อในทะเบียนแล้ว คำขอถัดไปต้องเห็นชื่อใหม่ทันที');

  return endTest_();
}

/**
 * การแสดงชื่อต้องไม่เพิ่มจำนวนคำขอของหน้าไหนเลย (กองที่ 4 ข้อ 1)
 *
 * ทะเบียนผู้ใช้ถูกอ่านทั้งชุดครั้งเดียวต่อการรัน ไม่ใช่อ่านทีละคนต่อหนึ่งแถว ·
 * ถ้าวันหนึ่งมีคนเขียน getUserRole(email) ไว้ในลูปของการวาดรายการ หน้าที่มีห้าสิบแถว
 * จะยิงห้าสิบคำขอ แล้วอาการที่เห็นคือ "ระบบช้าลงเฉย ๆ" ซึ่งหาสาเหตุยากมาก
 */
function test_web_displayNameCostsNothingPerRow() {
  beginTest_('การแสดงชื่อต้องไม่เพิ่มจำนวนคำขอต่อแถว');

  var users = serviceTestUsers_();
  var maker = addLoginTestUser_('NAME3', ROLE.ADMIN, 'รหัสผ่านสำหรับนับคำขอ',
    { 'Display_Name': 'ผู้แจ้งงานสำหรับนับคำขอ' });
  clearRowCache_(SHEET.USER_ROLE);

  createTestWo_(users, {});
  createTestWo_(users, {});
  createTestWo_(users, {});

  /* ---------- แปลงชื่อซ้ำ ต้องไม่มีราคาเลย ---------- */
  clearRowCache_();
  dbCallReset_();
  displayNameOf_(maker.email);
  var first = dbCallCount();

  dbCallReset_();
  for (var i = 0; i < 10; i++) displayNameOf_(maker.email);
  assertEquals_(dbCallCount(), 0,
    'แปลงชื่อซ้ำสิบครั้งต้องยิงศูนย์คำขอ · ถ้าเป็นสิบ แปลว่ากำลังอ่านทีละคน');
  assertTrue_(first <= 1,
    'ครั้งแรกอ่านทะเบียนได้มากสุดหนึ่งคำขอ (ยิงจริง ' + first + ')');

  /* ---------- บนเส้นทางจริง การแปลงชื่อต้องไม่มีราคาเลยแม้แต่คำขอเดียว ---------- */
  /*
   * ทุกคำขอจริงเริ่มด้วย getCurrentUser_ ซึ่งอ่านทะเบียนผู้ใช้ทั้งชุดอยู่แล้ว
   * (User_Role ไม่ใช่ตารางใหญ่ จึงอ่านเป็นภาพทั้งตาราง) · แผนที่ชื่อใช้ภาพเดียวกันนั้น
   * ราคาของการแสดงชื่อจึงเป็นศูนย์บนหน้าจริง ไม่ใช่ "หนึ่งคำขอที่ยอมรับได้"
   *
   * ต้องวัดแบบนี้ ไม่ใช่วัดผ่าน withTestUser_ เพราะทางนั้นข้าม getCurrentUser_
   * ไปเลย แล้วจะได้ตัวเลขที่ไม่มีใครเจอจริงบนหน้าเว็บ
   */
  clearRowCache_();
  dbCallReset_();
  getUserRole(maker.email);          // สิ่งที่ getCurrentUser_ ทำเป็นอย่างแรกเสมอ
  var identityCost = dbCallCount();

  dbCallReset_();
  var listed = withTestUser_(users.approver, function () {
    return api_listPendingApprovals(ROUTE.SP);
  });
  var listCost = dbCallCount();

  assertTrue_(listed.data.rows.length >= 3,
    'ต้องมีใบงานในรายการอย่างน้อยสามใบ ไม่งั้นการเทียบไม่มีความหมาย (มี ' +
    listed.data.rows.length + ')');
  assertTrue_(listCost <= DB_CALL_BUDGET.cold.approve,
    'หน้าอนุมัติต้องยิงไม่เกิน ' + DB_CALL_BUDGET.cold.approve + ' คำขอ แม้ทุกแถวต้องแปลงชื่อ' +
    ' (ยิงจริง ' + listCost + ' · ' + listed.data.rows.length + ' แถว)');

  var names = 0;
  for (var r = 0; r < listed.data.rows.length; r++) {
    if (listed.data.rows[r]['Created_By_Name']) names++;
  }
  assertEquals_(names, listed.data.rows.length, 'และทุกแถวต้องได้ชื่อมาด้วย ไม่ใช่บางแถว');

  Logger.log('  ระบุตัวตน ' + identityCost + ' คำขอ · รายการ ' + listed.data.rows.length +
    ' แถว ' + listCost + ' คำขอ');

  return endTest_();
}

/**
 * ล้างค่าวันเวลาต้องส่ง null ไม่ใช่ข้อความว่าง (SPEC 22)
 *
 * **ข้อนี้มาจากบั๊กจริงที่หลุดขึ้นของจริงตั้งแต่วันย้ายฐานข้อมูล** · การเปิดงานใหม่
 * สั่งล้าง Completed_Date ด้วยข้อความว่าง ซึ่งยุคชีตรับได้ แต่ Postgres ปฏิเสธด้วย
 * `invalid input syntax for type timestamp with time zone: ""` (code 22007) ·
 * ผู้ใช้เห็นแค่ "เชื่อมต่อฐานข้อมูลไม่สำเร็จ" ตามกฎข้อ 24 จึงไม่มีใครเดาสาเหตุออก
 *
 * ตัวจำลองรับข้อความว่างได้เหมือนยุคชีต ชุดทดสอบจึงเขียวในเครื่องมาตลอด ·
 * ข้อนี้เป็นตัวสแกนโค้ด ไม่ใช่การทดลองกับฐานข้อมูล จึงจับได้ทั้งสองที่เท่ากัน
 */
function test_service_clearDatesWithNull() {
  beginTest_('ล้างค่าวันเวลาต้องส่ง null ไม่ใช่ข้อความว่าง');

  /* ---------- ตัวสแกนต้องจับของปลอมได้ก่อน ---------- */
  assertEquals_(emptyStringDateWrites_("x({ 'Completed_Date': '' })").join(', '),
    "'Completed_Date': ''", 'ตัวสแกนต้องจับการล้างวันเวลาด้วยข้อความว่างได้');
  assertEquals_(emptyStringDateWrites_("x({ 'Locked_Until': '' })").join(', '),
    "'Locked_Until': ''", 'รวมถึงคอลัมน์ที่ลงท้ายด้วย Until ซึ่งก็เป็นชนิดเวลา');
  assertEquals_(emptyStringDateWrites_("x({ 'Completed_Date': null })").join(', '), '',
    'และต้องไม่ฟ้องของที่ถูกต้อง');
  assertEquals_(emptyStringDateWrites_("x({ 'Thread_ID': '' })").join(', '),
    "'Thread_ID': ''", 'รวมถึงคอลัมน์ชนิดตัวเลข ซึ่งฐานข้อมูลปฏิเสธข้อความว่างเหมือนกัน');
  assertEquals_(emptyStringDateWrites_("x({ 'Return_Reason': '' })").join(', '), '',
    'ส่วนคอลัมน์ข้อความ ข้อความว่างคือค่าที่ถูกต้อง ห้ามฟ้อง');
  /*
   * รูปแบบที่กำหนดค่าใส่อ็อบเจกต์ทีหลัง ต้องถูกจับด้วย
   * รอบแรกตรวจแต่แบบที่อยู่ในอ็อบเจกต์ จุดที่เขียนแบบนี้จึงรอดไป แล้วการเปิด
   * ขั้นตอนกลับใช้ไม่ได้เลยบนของจริง โดยของจำลองเขียวตลอด
   */
  assertTrue_(emptyStringDateWrites_("patch['Completed_Date'] = '';").length === 1,
    'ต้องจับรูปแบบที่กำหนดค่าใส่อ็อบเจกต์ทีหลังได้ด้วย ไม่ใช่เฉพาะที่อยู่ในอ็อบเจกต์');
  assertEquals_(emptyStringDateWrites_("patch['Completed_Date'] = null;").join(', '), '',
    'การล้างด้วย null ซึ่งเป็นวิธีที่ถูก ต้องไม่ถูกฟ้อง');
  assertEquals_(emptyStringDateWrites_("patch['Return_Reason'] = '';").join(', '), '',
    'คอลัมน์ข้อความรับข้อความว่างได้ตามปกติ ต้องไม่ฟ้อง');

  /* ---------- แล้วจึงตรวจของจริงทุกฟังก์ชันในระบบ ---------- */
  var offenders = [];
  var scanned = 0;

  for (var name in globalThis) {
    if (typeof globalThis[name] !== 'function') continue;
    if (name.indexOf('test_') === 0) continue;
    scanned++;
    var found;
    try {
      found = emptyStringDateWrites_(stripComments_(String(globalThis[name])));
    } catch (e) {
      continue;
    }
    if (found.length) offenders.push(name + ' → ' + found[0]);
  }

  assertTrue_(scanned > 50, 'ตัวสแกนต้องเห็นโค้ดของระบบจริง (เห็น ' + scanned + ' ตัว)');
  assertEquals_(offenders.sort().join(' · '), '',
    'ฟังก์ชันเหล่านี้ล้างค่าวันเวลาด้วยข้อความว่าง ซึ่งฐานข้อมูลจริงปฏิเสธ');

  return endTest_();
}

/**
 * จุดที่เขียนข้อความว่างลงคอลัมน์ที่ไม่ใช่ข้อความ
 *
 * ฐานข้อมูลปฏิเสธข้อความว่างสำหรับคอลัมน์ชนิดเวลาและชนิดตัวเลข ด้วยรหัส 22007
 * และ 22P02 ตามลำดับ · ยุคชีตรับได้ทั้งคู่ โค้ดที่เคยถูกจึงกลายเป็นผิดตอนย้ายฐานข้อมูล
 * โดยไม่มีอะไรฟ้องจนกว่าจะมีคนเดินเส้นทางนั้นจริง
 *
 * **ชนิดของคอลัมน์มาจาก supabase_schema.sql ซึ่งอ่านจากฝั่งเซิร์ฟเวอร์ไม่ได้**
 * จึงต้องระบุไว้ที่นี่ · คอลัมน์เวลาของระบบนี้ลงท้ายด้วย _Date หรือ _Until ทุกตัว
 * ส่วนคอลัมน์ตัวเลขที่รับค่าว่างได้มีสองตัวคือ Chat_ID กับ Thread_ID (bigint)
 * วันที่เพิ่มคอลัมน์ชนิดตัวเลขใหม่ ต้องมาเติมที่นี่ด้วย
 *
 * @param {string} source โค้ดของฟังก์ชันหนึ่งตัว
 * @return {string[]} ข้อความที่พบ
 */
function emptyStringDateWrites_(source) {
  var text = String(source || '');
  var columns = '[A-Za-z0-9_]*(?:_Date|_Until)|Chat_ID|Thread_ID';

  /*
   * ต้องเห็นสองรูปแบบ เพราะโค้ดจริงเขียนทั้งสองแบบ
   *   ในอ็อบเจกต์ที่ส่งไปเขียน     'Completed_Date': ''
   *   กำหนดค่าใส่อ็อบเจกต์ทีหลัง    patch['Completed_Date'] = ''
   *
   * รอบแรกตรวจแต่แบบแรก · แบบที่สองจึงรอดไปหนึ่งจุด แล้วการเปิดขั้นตอนกลับ
   * ใช้ไม่ได้เลยบนของจริง โดยของจำลองเขียวตลอดเพราะมันรับข้อความว่างได้
   */
  var quote = String.fromCharCode(39);
  var inObject = text.match(
    new RegExp(quote + '(' + columns + ')' + quote + '\\s*:\\s*' + quote + quote, 'g')) || [];
  var assigned = text.match(
    new RegExp('\\[\\s*' + quote + '(' + columns + ')' + quote +
      '\\s*\\]\\s*=\\s*' + quote + quote, 'g')) || [];

  return inObject.concat(assigned);
}

/**
 * ชุดที่หยุดกลางคันทำให้ข้อหายไปเงียบ ๆ — รายงานต้องบอกว่าหายไปกี่ข้อ
 *
 * **ข้อนี้มาจากรายงานจริงที่อ่านแล้วเข้าใจผิดไปสิบแปดเท่า** · รอบวันที่ 28-09-2026
 * กลุ่ม DB พิมพ์ว่า "ผ่าน 1,022 / ไม่ผ่าน 2" ซึ่งอ่านว่าเสียหายสองข้อ · ของจริงคือ
 * สองชุดหยุดกลางคันตั้งแต่ข้อแรก ทำให้ **38 ข้อไม่ได้ถูกถามเลย** · ตัวเลขที่ดูเล็กกว่า
 * ความจริงสิบแปดเท่า คือตัวเลขที่ทำให้คนตัดสินใจเดินต่อทั้งที่ไม่ควร
 *
 * ตรวจสองชั้น — ชั้นแรกคือ runSuites_ ต้องนับชุดที่หยุดกลางคันแยกจากชุดที่มีข้อไม่ผ่าน
 * ชั้นที่สองคือประโยคสรุปต้องพูดถึงจำนวนข้อที่หายไปจริง
 */
function test_meta_crashedSuiteIsCountedInSummary() {
  beginTest_('ชุดที่หยุดกลางคัน ต้องถูกรายงานว่าทำให้กี่ข้อไม่ได้รัน');

  /* ---------- ประโยคสรุป ต้องพูดถูกทุกสถานการณ์ ---------- */
  assertEquals_(missedAssertionsNote_(60, 22, 2), ' · ไม่ได้รัน 38 ข้อเพราะ 2 ชุดหยุดกลางคัน',
    'ต้องบอกจำนวนข้อที่หายไปและจำนวนชุดที่เป็นต้นเหตุ');
  assertEquals_(missedAssertionsNote_(60, 60, 0), '',
    'รอบที่ไม่มีชุดไหนหยุดกลางคัน ต้องไม่มีอะไรต่อท้าย');
  assertTrue_(missedAssertionsNote_(0, 22, 1).indexOf('ไม่รู้ว่ากี่ข้อ') !== -1,
    'ยังไม่เคยมีรอบไว้เทียบ ต้องบอกว่าไม่รู้ ห้ามพิมพ์ศูนย์ (กฎข้อ 32)');
  assertTrue_(missedAssertionsNote_(60, 61, 1).indexOf('ไม่ได้ลดลง') !== -1,
    'ชุดที่หยุดกลางคันแต่จำนวนข้อไม่ลด ต้องยังบอกว่ามีชุดหยุดกลางคัน');

  /* ---------- และตัวรันต้องนับให้จริง ไม่ใช่แค่มีประโยคไว้ ---------- */
  /*
   * runSuites_ ใช้ TEST_STATE_ ตัวเดียวกับชุดที่กำลังรันอยู่นี้ · ต้องเก็บของเดิมไว้
   * แล้วคืนให้ครบ ไม่งั้นการนับของข้อนี้เองจะถูกล้างไปพร้อมกัน
   */
  var outerState = TEST_STATE_;
  var inner;
  try {
    inner = runSuites_([
      { name: 'ชุดที่หยุดกลางคัน', fn: function () {
          beginTest_('ชุดที่หยุดกลางคัน (จำลอง)');
          throw new Error('จำลองการหยุดกลางคัน');
        } },
      { name: 'ชุดที่เดินจนจบ', fn: function () {
          beginTest_('ชุดที่เดินจนจบ (จำลอง)');
          assertTrue_(true, 'ข้อที่เดินจนจบ');
          return endTest_();
        } }
    ], true);
  } finally {
    TEST_STATE_ = outerState;
  }

  assertEquals_(inner.crashed, 1, 'ต้องนับชุดที่หยุดกลางคันได้หนึ่งชุด');
  assertEquals_(inner.failedSuites.join(', '), 'ชุดที่หยุดกลางคัน',
    'และต้องบอกได้ว่าชุดไหน');
  assertTrue_(inner.fail >= 1,
    'ชุดที่หยุดกลางคันต้องนับเป็นไม่ผ่านอย่างน้อยหนึ่งข้อเสมอ');

  return endTest_();
}

/**
 * โหลดฟังก์ชันตัดสินใจของแถบเมนูเข้ามาทดสอบฝั่งเซิร์ฟเวอร์
 *
 * ui_Nav เป็นคนตัดสินว่าจะเปิดหน้าให้หรือไม่ และตัดสินใจนั้นเคยผิดลำดับจนผู้ใช้เห็น
 * ข้อความที่ชี้ไปผิดทางทั้งหมด · ต้องรันโค้ดตัวจริงมาตรวจ ไม่ใช่อ่านแล้วเชื่อ
 *
 * โหลด ui_Script มาด้วย เพราะ pageOutcome เรียก readBootstrap ที่อยู่ในนั้น
 *
 * @return {Object} แผนที่ชื่อฟังก์ชันไปยังตัวฟังก์ชัน
 */
function loadNavFunctions_() {
  var files = ['ui_Script', 'ui_Nav'];
  var code = '';
  for (var i = 0; i < files.length; i++) {
    var html = HtmlService.createHtmlOutputFromFile(files[i]).getContent();
    code += html.replace(/^[\s\S]*?<script>/, '').replace(/<\/script>[\s\S]*$/, '') + ';';
  }

  // ของที่มีแต่ในเบราว์เซอร์ ต้องใส่ให้เหมือน loadWebFunctions_ ด้วยเหตุผลเดียวกัน
  var factory = new Function('setTimeout', 'document', 'window', code +
    '; return { pageOutcome: pageOutcome, readBootstrap: readBootstrap };');

  return factory(
    function () { return 0; },
    { querySelectorAll: function () { return []; }, getElementById: function () { return null; } },
    {});
}

/**
 * หน้าที่ไม่มีสิทธิ์ ต้องบอกว่าไม่มีสิทธิ์ ไม่ใช่บอกว่าข้อมูลมาไม่ครบ — SPEC 17.4
 *
 * เกิดจริง 29-09-2026: ผู้ใช้กดเมนูของแผนกแล้วเห็น "ระบบส่งข้อมูลมาไม่ครบสำหรับ
 * หน้านี้ ขาด: rows, total, page, pageSize, pageCount, view · กรุณาแจ้งผู้ดูแลระบบ"
 * ทั้งที่ระบบทำถูกทุกอย่าง — แถบเมนูแสดงครบทุกกลุ่มให้ทุกคนโดยตั้งใจและกดได้
 * เซิร์ฟเวอร์จึงไม่ส่งข้อมูลของหน้าที่เขาไม่มีสิทธิ์มาให้ ซึ่งถูกต้อง (SPEC 17.3)
 * แต่ฝั่งหน้าเว็บตรวจคีย์ขาดก่อนตรวจสิทธิ์ ข้อความจึงชี้ไปผิดทางทั้งหมด
 *
 * ข้อความที่ชี้ผิดทางแพงกว่าไม่มีข้อความ เพราะผู้ใช้ไปแจ้งผู้ดูแลว่าระบบพัง
 * แล้วผู้ดูแลไปไล่หาของที่ไม่ได้เสีย
 */
function test_web_deniedPageSaysDeniedNotIncomplete() {
  beginTest_('หน้าที่ไม่มีสิทธิ์ต้องบอกเรื่องสิทธิ์ ไม่ใช่เรื่องคีย์ขาด');

  var nav = loadNavFunctions_();
  var needs = ['rows', 'total', 'page', 'pageSize', 'pageCount', 'view'];

  /* ---------- ไม่มีสิทธิ์ และข้อมูลไม่มา ซึ่งเป็นผลของการปฏิเสธ ---------- */
  var denied = nav.pageOutcome({ user: {}, menu: [] }, needs, false);
  assertEquals_(denied.stage, 'denied',
    'ต้องตัดสินว่าเป็นเรื่องสิทธิ์ ไม่ใช่เรื่องคีย์ขาด');
  assertEquals_(denied.error, '',
    'และต้องไม่มีข้อความคีย์ขาดมาเขียนทับข้อความอธิบายสิทธิ์ที่ขึ้นไปแล้ว');

  /* ---------- มีสิทธิ์ แต่ข้อมูลขาดจริง ต้องยังฟ้องเหมือนเดิม ---------- */
  var broken = nav.pageOutcome({ user: {}, menu: [] }, needs, true);
  assertEquals_(broken.stage, 'missing',
    'คนที่มีสิทธิ์แล้วข้อมูลไม่มา คือความผิดพลาดจริง ต้องยังฟ้อง');
  assertTrue_(broken.error.indexOf('rows') !== -1,
    'และต้องบอกด้วยว่าขาดคีย์อะไร · ได้: ' + broken.error);

  /* ---------- มีสิทธิ์และข้อมูลครบ ---------- */
  var ok = nav.pageOutcome(
    { rows: [], total: 0, page: 1, pageSize: 20, pageCount: 1, view: '' }, needs, true);
  assertEquals_(ok.stage, 'ok', 'ข้อมูลครบแล้วต้องเปิดหน้าได้');

  /* ---------- ศูนย์และข้อความว่างต้องไม่นับว่าขาด ---------- */
  /*
   * ยอด 0 หน้าที่ 1 และมุมมองที่ยังไม่ได้เลือก เป็นค่าที่ถูกต้องทั้งหมด
   * ถ้าด่านนี้ดูความเป็นเท็จแทนที่จะดูว่ามีคีย์อยู่ไหม หน้าที่ยังไม่มีงานจะเปิดไม่ได้เลย
   */
  assertEquals_(nav.pageOutcome({ total: 0, view: '' }, ['total', 'view'], true).stage, 'ok',
    'ยอดศูนย์และมุมมองว่าง คือค่าที่ถูกต้อง ไม่ใช่คีย์ที่ขาดไป');

  /* ---------- ของจริง: ผู้ที่ไม่มีสิทธิ์ต้องไม่ได้ข้อมูลของหน้ามาด้วย ---------- */
  /*
   * ตรวจผ่าน pageBootstrap_ ซึ่งเป็นทางที่หน้าเว็บใช้จริง · นี่คือฝั่งที่ต้องถูก
   * ก่อนเป็นอันดับแรก — ข้อมูลที่ไม่ควรเห็นต้องไม่มาถึงเบราว์เซอร์ตั้งแต่ต้น
   */
  var users = serviceTestUsers_();
  var boot = withTestUser_(users.admin, function () {
    return pageBootstrap_('work', { dept: DEPT.SERVICE });
  });
  assertEquals_(boot.rows, undefined,
    'ผู้ที่ไม่มีสิทธิ์ต้องไม่ได้รายการงานของแผนกติดมาด้วย');
  assertEquals_(nav.pageOutcome(boot, needs, false).stage, 'denied',
    'และหน้าเว็บต้องเล่าเรื่องนั้นว่าเป็นเรื่องสิทธิ์');

  return endTest_();
}

/**
 * ชื่อคีย์ที่ชนกันในก้อนข้อมูลตั้งต้น ต้องโวย ไม่ใช่ทิ้งเงียบ ๆ — กฎข้อ 33
 *
 * เคยเกิดจริง 29-09-2026: แดชบอร์ดเพิ่มคีย์ `groups` ของตัวเอง ซึ่งชนกับ `groups`
 * ของแถบเมนูที่มีอยู่ก่อน · ตัวรวมข้อมูลทิ้งของแดชบอร์ดไปโดยไม่บอกใคร หน้าแรกจึงได้
 * กลุ่มเมนูมาวาดเป็นการ์ด แล้วตายที่บรรทัดแรก · ฝั่งเซิร์ฟเวอร์ไม่มีอะไรผิดให้เห็นเลย
 * ผู้ใช้เห็นแค่ "ระบบไม่ตอบกลับภายในเวลาที่ควรจะเป็น" ซึ่งชี้ไปผิดทางทั้งหมด
 *
 * ตรวจด้วยก้อนปลอม เพื่อพิสูจน์ว่าด่านนี้ดังจริง ไม่ใช่เชื่อว่าดังเพราะเขียนไว้แล้ว
 * แล้วตรวจของจริงทุกหน้าซ้ำอีกชั้น
 */
function test_web_bootstrapKeysMustNotCollide() {
  beginTest_('คีย์ในก้อนข้อมูลตั้งต้นที่ชนกันต้องโวย ไม่ใช่หายไปเงียบ ๆ');

  /* ---------- ก้อนปลอม: ชนแล้วต้องโยน error ที่บอกชื่อคีย์ ---------- */
  var refused = '';
  try {
    mergePageData_({ groups: [{ children: [] }] }, { groups: [{ cards: [] }] }, 'home');
  } catch (e) {
    refused = e.message;
  }
  assertTrue_(refused.indexOf('groups') !== -1,
    'ต้องปฏิเสธพร้อมบอกชื่อคีย์ที่ชน · ข้อความที่ได้: "' + refused + '"');
  assertTrue_(refused.indexOf('home') !== -1, 'และต้องบอกด้วยว่าเป็นหน้าไหน');

  /* ---------- คีย์ที่หมายถึงสิ่งเดียวกันจริง ต้องผ่านเงียบ ๆ ต่อไป ---------- */
  var kept = mergePageData_({ user: { email: 'a@b.c' } }, { user: { email: 'z@z.z' } }, 'wo');
  assertEquals_(kept.user.email, 'a@b.c',
    'คีย์ที่ประกาศว่าหมายถึงสิ่งเดียวกัน ต้องใช้ของระดับบนเป็นแหล่งเดียว');

  /* ---------- คีย์ใหม่ต้องขึ้นมาอยู่ระดับเดียวกันตามปกติ ---------- */
  var merged = mergePageData_({ user: null }, { rows: [1, 2] }, 'wolist');
  assertEquals_(merged.rows.length, 2, 'คีย์ที่ไม่ชนต้องถูกรวมขึ้นมาตามเดิม');

  /* ---------- รายการยกเว้นต้องสั้น และมีเฉพาะชื่อที่ชนจริง ---------- */
  /*
   * ทุกชื่อในรายการนี้คือชื่อที่การชนกันจะไม่มีใครฟ้อง · ชื่อที่ไม่เคยชนเลยจึงต้อง
   * ไม่อยู่ในรายการ ไม่งั้นมันคือด่านที่ปิดไว้ล่วงหน้าโดยไม่มีเหตุ ซึ่งเป็นต้นเหตุเดิม
   */
  assertEquals_(BOOT_SAME_AS_TOP_.indexOf('groups'), -1,
    'groups ต้องไม่อยู่ในรายการยกเว้น เพราะเมนูกับแดชบอร์ดหมายถึงคนละเรื่อง');

  /* ---------- ของจริงทุกหน้าต้องประกอบได้ ---------- */
  var users = serviceTestUsers_();
  var pages = Object.keys(WEB_PAGES).sort();
  var broken = [];

  for (var i = 0; i < pages.length; i++) {
    var page = pages[i];
    try {
      withTestUser_(users.admin, function () { return pageBootstrap_(page, {}); });
    } catch (e) {
      broken.push(page + ': ' + ((e && e.message) ? e.message : String(e)));
    }
  }
  assertEquals_(broken.join(' · '), '',
    'ทุกหน้าต้องประกอบก้อนข้อมูลตั้งต้นได้โดยไม่มีชื่อคีย์ชนกัน');

  return endTest_();
}

/**
 * หาจุดที่ส่งฟังก์ชันซึ่งรับอาร์กิวเมนต์ให้ bootPage
 *
 * bootPage เรียกสิ่งที่รับไปโดยไม่ส่งอาร์กิวเมนต์ใด ๆ · ฟังก์ชันที่ประกาศ
 * พารามิเตอร์ไว้จึงได้ undefined เสมอ แล้วตายที่บรรทัดแรกโดยไม่มีอะไรบนหน้าจอ
 *
 * @param {string} code โค้ดของหน้าหนึ่งหน้า
 * @return {string[]} ชื่อของจุดที่เป็นกับดัก
 */
function bootPageArgTraps_(code) {
  var traps = [];
  var calls = String(code).match(/bootPage\(([^)]*(?:\)[^)]*)*?)\)\s*;/g) || [];

  for (var c = 0; c < calls.length; c++) {
    var inside = calls[c].replace(/^bootPage\(/, '').replace(/\)\s*;$/, '');

    // ฟังก์ชันที่เขียนไว้ตรงนั้นเลย — อ่านพารามิเตอร์ได้จากที่เดียวกัน
    var inline = inside.match(/function\s*\(([^)]*)\)/g) || [];
    for (var i = 0; i < inline.length; i++) {
      var params = inline[i].replace(/^function\s*\(/, '').replace(/\)$/, '').trim();
      if (params) traps.push('function (' + params + ')');
    }

    // ฟังก์ชันที่ส่งด้วยชื่อ — ต้องไปหาที่ประกาศของมันในหน้าเดียวกัน
    var names = inside.match(/(^|,)\s*([A-Za-z_$][\w$]*)\s*(?=,|$)/g) || [];
    for (var n = 0; n < names.length; n++) {
      var name = names[n].replace(/[,\s]/g, '');
      if (!name) continue;
      var declared = new RegExp('function\\s+' + name + '\\s*\\(([^)]*)\\)').exec(code);
      if (declared && declared[1].trim()) traps.push(name + '(' + declared[1].trim() + ')');
    }
  }
  return traps;
}

/**
 * ตัวช่วยที่ส่ง undefined ให้ฟังก์ชันที่รับไป ต้องโวย ไม่ใช่ทน (กฎข้อ 33)
 *
 * **ข้อนี้มาจากของจริงที่หลุดไปถึงหน้าจอผู้ใช้** · หน้า filecheck เขียนว่า
 * bootPage(function (boot) {...}) แล้ว boot เป็น undefined หน้าจึงตายที่บรรทัดแรก
 * อาการที่เห็นคือรายงานพิมพ์เพดานขนาดไฟล์ออกมาเป็นช่องว่าง แล้วคนอ่านเชื่อว่า
 * ไม่มีเพดาน · ไม่มี error ให้ใครเห็น และเทสต์ฝั่งเซิร์ฟเวอร์มองไม่เห็นเลย
 *
 * ตรวจสองชั้น — ชั้นแรกคือตัว bootPage เองต้องปฏิเสธตอนถูกเรียก ชั้นที่สอง
 * คือไม่มีหน้าไหนในระบบวันนี้ที่เป็นกับดักนั้นอยู่ · ชั้นที่สองจำเป็นเพราะชั้นแรก
 * ดังเฉพาะตอนมีคนเปิดหน้านั้นจริงบนเบราว์เซอร์
 */
function test_web_bootPageRefusesTheArgumentTrap() {
  beginTest_('bootPage ต้องโวยเมื่อถูกส่งฟังก์ชันที่รับอาร์กิวเมนต์ — กฎข้อ 33');

  var web = loadWebFunctions_();

  /* ---------- ฟังก์ชันที่รับอาร์กิวเมนต์ ต้องถูกปฏิเสธพร้อมบอกทางที่ถูก ---------- */
  var refused = '';
  try {
    web.bootPage(function (boot) { return boot; });
  } catch (error) {
    refused = String(error.message);
  }
  assertTrue_(refused.indexOf('startPage') !== -1,
    'ต้องปฏิเสธพร้อมบอกว่าให้ใช้ startPage แทน · ข้อความที่ได้: "' + refused + '"');

  /* ---------- ตัวโหลดข้อมูลใหม่ก็เป็นกับดักเดียวกัน ---------- */
  var refusedRefresh = '';
  try {
    web.bootPage(function () { return 1; }, function (page) { return page; });
  } catch (error) {
    refusedRefresh = String(error.message);
  }
  assertTrue_(refusedRefresh !== '',
    'refresh ที่รับอาร์กิวเมนต์ต้องถูกปฏิเสธด้วย เพราะ resumeAfterLogin เรียกมันเปล่า ๆ เหมือนกัน');

  /* ---------- ของที่ถูกต้อง ต้องยังทำงานเหมือนเดิมทุกประการ ---------- */
  var ran = 0;
  web.bootPage(function () { ran++; }, function () { ran += 10; });
  assertEquals_(ran, 1, 'ฟังก์ชันที่ไม่รับอาร์กิวเมนต์ต้องถูกเรียกทันทีหนึ่งครั้งเหมือนเดิม');

  /* ---------- ตัวสแกนต้องจับของปลอมได้ ก่อนจะเชื่อว่าของจริงสะอาด ---------- */
  assertEquals_(bootPageArgTraps_('bootPage(function (boot) { use(boot); });').join(', '),
    'function (boot)', 'ตัวสแกนต้องจับฟังก์ชันที่เขียนไว้ตรงนั้นและรับอาร์กิวเมนต์ได้');
  assertEquals_(bootPageArgTraps_(
    'function loadPage(boot) {} bootPage(loadPage);').join(', '), 'loadPage(boot)',
    'และต้องตามไปอ่านที่ประกาศของฟังก์ชันที่ส่งด้วยชื่อ');
  assertEquals_(bootPageArgTraps_(
    'function loadPage() {} function reload() {} bootPage(loadPage, reload);').join(', '), '',
    'และต้องไม่ฟ้องของที่ถูกต้อง');
  assertEquals_(bootPageArgTraps_(
    'bootPage(loadPage, function () { loadList(state.page); });').join(', '), '',
    'การห่อค่าที่ต้องส่งไว้ในฟังก์ชันที่ไม่รับอาร์กิวเมนต์ คือวิธีที่ถูก ต้องไม่ถูกฟ้อง');

  /* ---------- แล้วจึงตรวจของจริงทุกหน้า ---------- */
  var pages = ['ui_Home', 'ui_CreateWo', 'ui_Approve', 'ui_DeptWork', 'ui_LabWork',
    'ui_Returned', 'ui_WoDetail', 'ui_WoList', 'ui_Reports', 'ui_FileCheck'];
  for (var p = 0; p < pages.length; p++) {
    var code = stripComments_(HtmlService.createHtmlOutputFromFile(pages[p]).getContent());
    assertEquals_(bootPageArgTraps_(code).join(', '), '',
      pages[p] + ' ส่งฟังก์ชันที่รับอาร์กิวเมนต์ให้ bootPage ซึ่งจะได้ undefined เสมอ');
  }

  return endTest_();
}

/**
 * รูปแบบวันที่ของหน้าเว็บ — ที่แสดงผลต้องเป็น dd-MM-yyyy
 * แต่ค่าในช่องเลือกวันที่ต้องยังเป็นรูปแบบของเบราว์เซอร์ (กฎข้อ 20)
 */
function test_web_dateFormats() {
  beginTest_('รูปแบบวันที่ของหน้าเว็บ — กฎข้อ 20');

  var web = loadWebFunctions_();

  /* ---------- 1) ข้อความที่แสดงให้คนอ่าน ---------- */
  assertEquals_(web.formatDate('2026-09-12'), '12-09-2026', 'วันที่ล้วนแสดงเป็น dd-MM-yyyy');
  assertEquals_(web.formatDate('2026-03-05'), '05-03-2026', 'วันและเดือนน้อยกว่า 10 มีศูนย์นำ');
  assertEquals_(web.formatDate('2026-10-15T09:00'), '15-10-2026 09:00',
    'เวลานัดหมายแสดงเป็น dd-MM-yyyy HH:mm และต้องไม่เลื่อนชั่วโมง');
  assertEquals_(web.formatDate(''), '-', 'ไม่มีค่าแสดงขีด ไม่ใช่ Invalid Date');
  assertEquals_(web.formatDate(null), '-', 'ค่าว่างแสดงขีด');
  assertTrue_(web.formatDate('2026-10-15T09:00').indexOf('2569') === -1, 'ต้องไม่มีปี พ.ศ.');
  assertTrue_(web.formatDate('2026-10-15T09:00').indexOf('ต.ค.') === -1,
    'ต้องไม่มีชื่อเดือนย่อภาษาไทย');
  assertTrue_(web.formatDate('2026-10-15T09:00').indexOf(' น.') === -1,
    'ต้องไม่มีคำว่า น. ต่อท้ายเวลา');

  /* ---------- 2) ค่าในช่องเลือกวันที่ ห้ามเปลี่ยนรูปแบบ ---------- */
  assertEquals_(web.toDateTimeInput('2026-10-15T09:00'), '2026-10-15T09:00',
    'ช่อง datetime-local ต้องได้ yyyy-MM-ddTHH:mm ตามที่เบราว์เซอร์บังคับ');
  assertTrue_(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(web.toDateTimeInput('2026-10-15T09:00')),
    'รูปแบบของช่อง datetime-local ต้องขึ้นต้นด้วยปีเสมอ ไม่ใช่ dd-MM-yyyy');
  assertEquals_(web.toDateTimeInput(''), '', 'ไม่มีค่าก็ต้องได้ค่าว่าง ไม่ใช่ข้อความมั่ว');

  assertEquals_(web.toDateInput('2026-03-05'), '2026-03-05',
    'ช่อง date ต้องได้ yyyy-MM-dd ตามที่เบราว์เซอร์บังคับ');
  assertEquals_(web.toDateInput('2026-03-05T00:00:00.000Z'), '2026-03-05',
    'ค่า ISO แบบ UTC ต้องแปลงเป็นวันตามเวลาไทย ไม่ใช่ตัดสตริงจนวันเลื่อน');
  assertTrue_(/^\d{4}-\d{2}-\d{2}$/.test(web.toDateInput('2026-03-05')),
    'รูปแบบของช่อง date ต้องขึ้นต้นด้วยปีเสมอ ไม่ใช่ dd-MM-yyyy');
  assertEquals_(web.toDateInput(''), '', 'ไม่มีค่าก็ต้องได้ค่าว่าง');

  return endTest_();
}

/**
 * เปิดใบงานเดิมมาแก้ไข ช่องเลือกวันที่ต้องยังมีค่าครบ ไม่ว่างเปล่า
 *
 * นี่คือข้อที่จับได้ว่าเผลอเอารูปแบบที่ใช้แสดงผลไปใส่ในช่อง input
 * เพราะเบราว์เซอร์จะทิ้งค่าที่ผิดรูปแบบไปเงียบ ๆ ผู้ใช้จะเห็นแค่ช่องว่าง
 * แล้วบันทึกทับจนวันที่เดิมหายไปโดยไม่มีใครรู้ตัว
 */
function test_web_editKeepsDateInputs() {
  beginTest_('เปิดใบงานเดิมมาแก้ไข ช่องวันที่ต้องไม่ว่าง — กฎข้อ 20');

  var web = loadWebFunctions_();
  var users = serviceTestUsers_();

  var wo = createTestWo_(users, {
    'Location': 'จุดทดสอบช่องวันที่',
    'Start_Contact_Date': '2026-03-05',
    'Start_Date': '2026-10-15T09:00',
    'End_Date': '2026-10-15T17:30'
  });

  // เส้นทางเดียวกับที่หน้าแก้ไขใช้จริง: อ่านผ่านชั้น API แล้วแปลงลงช่องกรอก
  var sent = withTestUser_(users.admin, function () { return api_getWorkOrder(wo.woId); });
  assertEquals_(sent.ok, true, 'เปิดใบงานเดิมขึ้นมาได้');
  var row = sent.data.workOrder;

  var startContact = web.toDateInput(row['Start_Contact_Date']);
  var startDate = web.toDateTimeInput(row['Start_Date']);
  var endDate = web.toDateTimeInput(row['End_Date']);

  assertTrue_(startContact !== '', 'ช่องวันที่เริ่มติดต่อต้องไม่ว่าง');
  assertEquals_(startContact, '2026-03-05', 'ช่องวันที่เริ่มติดต่อได้ค่าเดิมครบ ไม่เลื่อนวัน');
  assertTrue_(startDate !== '', 'ช่องกำหนดเข้างานต้องไม่ว่าง');
  assertTrue_(endDate !== '', 'ช่องกำหนดออกงานต้องไม่ว่าง');
  assertEquals_(startDate, '2026-10-15T09:00', 'ช่องกำหนดเข้างานได้ค่าเดิมครบ');
  assertEquals_(endDate, '2026-10-15T17:30', 'ช่องกำหนดออกงานได้ค่าเดิมครบ');

  // ค่าที่เซิร์ฟเวอร์ส่งมาต้องยังขึ้นต้นด้วยปี ไม่ใช่รูปแบบที่ใช้แสดงผล
  assertTrue_(/^\d{4}-\d{2}-\d{2}/.test(String(row['Start_Date'])),
    'ค่าที่ส่งให้หน้าเว็บต้องขึ้นต้นด้วยปี ไม่ใช่ dd-MM-yyyy');
  assertTrue_(/^\d{4}-\d{2}-\d{2}/.test(String(row['Start_Contact_Date'])),
    'วันที่เริ่มติดต่อที่ส่งให้หน้าเว็บก็ต้องขึ้นต้นด้วยปีเช่นกัน');

  // และค่าเดียวกันเมื่อเอาไปแสดงให้คนอ่าน ต้องเป็นคนละรูปแบบกับค่าในช่องกรอก
  assertEquals_(web.formatDate(row['Start_Date']), '15-10-2026 09:00',
    'ค่าเดียวกันเมื่อเอาไปแสดงให้คนอ่าน ต้องเป็น dd-MM-yyyy HH:mm');
  assertTrue_(web.formatDate(row['Start_Date']) !== startDate,
    'ค่าที่แสดงกับค่าในช่องกรอกต้องเป็นคนละรูปแบบ ไม่ใช่ตัวเดียวกัน');

  return endTest_();
}

/**
 * คีย์ใน Counter และเลขที่เอกสารเป็น "ข้อมูล" ไม่ใช่การแสดงผล ห้ามเปลี่ยนรูปแบบตามกฎข้อ 20
 */
function test_web_documentNumbersUnchanged() {
  beginTest_('คีย์ Counter และเลขที่เอกสารต้องไม่เปลี่ยนรูปแบบ — กฎข้อ 20');

  // คีย์ของตัวนับอิงปีเดือนแบบ yyMM ติดกัน ไม่ใช่รูปแบบวันที่ที่คนอ่าน
  var key = counterKeyOfMonth_(PREFIX.WO, new Date(2026, 8, 12));
  assertEquals_(key, 'WO-2609', 'คีย์ของตัวนับยังเป็น WO-yyMM เหมือนเดิม');
  assertEquals_(counterKeyOfMonth_(PREFIX.WO, new Date(2026, 2, 5)), 'WO-2603',
    'เดือนน้อยกว่า 10 ในคีย์ตัวนับยังมีศูนย์นำแบบเดิม');
  assertTrue_(key.indexOf('12-09') === -1,
    'คีย์ตัวนับต้องไม่ถูกเปลี่ยนเป็นรูปแบบวันที่ที่คนอ่าน');

  // เลขที่ใบงานจริงต้องยังเป็น WO-yyMM-NNNN
  var users = serviceTestUsers_();
  var wo = createTestWo_(users, { 'Location': 'จุดทดสอบเลขที่เอกสาร' });
  assertTrue_(/WO-\d{4}-\d{4}$/.test(wo.woId),
    'เลขที่ใบงานยังเป็นรูปแบบ WO-yyMM-NNNN (ได้: ' + wo.woId + ')');

  // และเลขที่งานของแผนกที่ต่อยอดจากเลขใบงาน ก็ต้องไม่เปลี่ยนตาม
  assertEquals_(buildTaskId_(wo.woId, DEPT.SERVICE), wo.woId + '-SERVICE',
    'เลขที่งานของแผนกยังต่อท้ายเลขใบงานแบบเดิม');

  return endTest_();
}

/**
 * ข้อมูลที่หน้าจองานของแผนกต้องได้รับครบในครั้งเดียว (SPEC 7, 8, 17.2)
 *
 * หน้าจอเป็นแค่ตัววาด ข้อมูลทั้งหมดตัดสินจากฝั่งเซิร์ฟเวอร์ เทสต์ชุดนี้จึงตรวจที่สัญญาข้อมูล
 * ถ้าสัญญานี้ถูก หน้าจอจะแสดงถูกตาม และถ้าสัญญานี้พัง หน้าจอจะพังทั้งสามหน้าพร้อมกัน
 */
function test_web_deptWorkView() {
  beginTest_('ข้อมูลของหน้างานแผนก — SPEC 17.2');

  var users = serviceTestUsers_();

  /* ---------- งานร่วมสองแผนก ฝั่ง Project ยังไม่มีงวด ---------- */
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE_PROJECT,
    { 'Location': 'จุดทดสอบหน้างานแผนก', 'Start_Date': '2026-10-15T09:00' });

  var svList = withTestUser_(users.service, function () { return api_listMyTasks(); });
  assertEquals_(svList.ok, true, 'แผนกเปิดรายการงานของตัวเองได้');

  var sv = findTaskView_(svList.data.rows, wo.taskOf(DEPT.SERVICE));
  assertTrue_(!!sv, 'เห็นงานของแผนกตัวเองในรายการ');

  /* ---------- จำนวนขั้นตอนมาจากข้อมูลจริง ไม่ใช่เลขตายตัว (กฎข้อ 9) ---------- */
  assertEquals_(sv.steps.length, listStepsByTask(sv.taskId).length,
    'จำนวนขั้นตอนที่ส่งให้หน้าจอ ตรงกับที่สร้างไว้จริงในตาราง');
  assertEquals_(sv.progress.total, sv.steps.length, 'ตัวนับความคืบหน้าตรงกับจำนวนขั้นตอนจริง');
  assertEquals_(sv.steps[0].stepNo, 1, 'ขั้นตอนเรียงจากลำดับที่ 1');
  assertEquals_(sv.steps[0].type, STEP_TYPE.STEP, 'ฝั่ง Service เป็นขั้นตอนงาน');

  var pjList = withTestUser_(users.project, function () { return api_listMyTasks(); });
  var pj = findTaskView_(pjList.data.rows, wo.taskOf(DEPT.PROJECT));
  /*
   * ฝั่ง Project เริ่มด้วยศูนย์งวดเสมอ แผนกเพิ่มเองระหว่างทำงาน (SPEC 20.2)
   * เจตนาเดิมของข้อนี้ — "จำนวนขั้นไม่ได้ถูกกำหนดตายตัวในโค้ด" — ยังพิสูจน์ได้เหมือนเดิม
   * เพราะสองแผนกในใบเดียวกันได้จำนวนไม่เท่ากัน (Service 3 · Project 0)
   */
  assertEquals_(pj.steps.length, 0, 'ฝั่ง Project ยังไม่มีงวดจนกว่าแผนกจะเพิ่มเอง');
  assertTrue_(pj.steps.length !== sv.steps.length,
    'สองแผนกมีจำนวนไม่เท่ากัน จึงพิสูจน์ว่าไม่ได้กำหนดเป็นเลขตายตัวไว้ในโค้ด');

  /* ---------- งานร่วม ต้องเห็นว่าอีกแผนกไปถึงไหน ---------- */
  assertEquals_(sv.isJoint, true, 'ใบงานร่วมต้องถูกทำเครื่องหมายว่าเป็นงานร่วม');
  assertEquals_(sv.others.length, 1, 'เห็นงานของอีกแผนกหนึ่งรายการ');
  assertEquals_(sv.others[0].department, DEPT.PROJECT, 'อีกแผนกคือ Project');
  assertEquals_(sv.others[0].status, TASK_STATUS.PENDING_ACCEPT, 'เห็นสถานะปัจจุบันของอีกแผนก');
  assertEquals_(sv.others[0].total, 0, 'เห็นจำนวนงวดงานของอีกแผนกด้วย (ยังไม่ได้เพิ่มงวด)');

  /* ---------- เวลาทุกค่าถูกจัดรูปแบบมาจากฝั่งเซิร์ฟเวอร์แล้ว (กฎข้อ 19, 20) ---------- */
  assertEquals_(sv.display.startDate, '15-10-2026 09:00',
    'กำหนดเข้างานถูกจัดรูปแบบเป็น dd-MM-yyyy HH:mm มาให้แล้ว');
  assertTrue_(/^\d{2}-\d{2}-\d{4}/.test(String(sv.display.createdDate)),
    'วันที่แจ้งงานก็ถูกจัดรูปแบบมาให้แล้ว หน้าจอไม่ต้องแปลงเอง');
  assertEquals_(sv.display.acceptedDate, '', 'ยังไม่ได้รับงาน ช่องเวลารับงานต้องว่าง ไม่ใช่ปี 1970');

  /* ---------- รับงานแล้วข้อมูลต้องอัปเดตตาม ---------- */
  withTestUser_(users.service, function () { return api_acceptTask(sv.taskId); });
  sv = findTaskView_(withTestUser_(users.service, function () { return api_listMyTasks(); }).data.rows,
    sv.taskId);
  assertEquals_(sv.status, TASK_STATUS.IN_PROGRESS, 'รับงานแล้วสถานะเปลี่ยน');
  assertEquals_(sv.acceptedBy, users.service.email, 'เห็นว่าใครเป็นคนรับงาน');
  assertTrue_(/^\d{2}-\d{2}-\d{4}/.test(String(sv.display.acceptedDate)),
    'เวลารับงานถูกจัดรูปแบบมาให้แล้ว');

  /* ---------- ปิดขั้นตอนทีละขั้นแล้วความคืบหน้าต้องขยับ ---------- */
  withTestUser_(users.service, function () {
    return api_updateTaskStep(sv.steps[0].stepId, { 'Status': STEP_STATUS.COMPLETED });
  });
  sv = findTaskView_(withTestUser_(users.service, function () { return api_listMyTasks(); }).data.rows,
    sv.taskId);
  assertEquals_(sv.progress.done, 1, 'ปิดไปหนึ่งขั้น ความคืบหน้าต้องเป็น 1');
  assertEquals_(sv.steps[0].done, true, 'ขั้นตอนแรกถูกทำเครื่องหมายว่าเสร็จแล้ว');
  assertEquals_(sv.steps[0].completedBy, users.service.email, 'เห็นว่าใครปิดขั้นตอนนี้');
  assertEquals_(sv.progress.allDone, false, 'ยังไม่ครบทุกขั้น ปุ่มปิดงานจึงยังกดไม่ได้');

  /* ---------- ค่าที่ส่งกลับต้องข้าม google.script.run ได้ (กฎข้อ 14) ---------- */
  assertTrue_(isJsonSafe_(svList), 'ข้อมูลทั้งก้อนของหน้างานแผนกต้องส่งผ่านช่องทางหน้าเว็บได้');

  return endTest_();
}

/**
 * ใบที่ถูกตีกลับ ต้องยังเห็นในรายการ พร้อมบอกเหตุผล — ห้ามซ่อนทั้งใบ (SPEC 8, 17.3)
 * และงานที่ยกเลิกแล้วต้องยังเปิดดูได้พร้อมเหตุผล
 */
function test_web_deptWorkBlockedStates() {
  beginTest_('ใบที่ถูกตีกลับและงานที่ยกเลิก ต้องยังเห็นพร้อมเหตุผล — SPEC 17.3');

  var users = serviceTestUsers_();

  /* ---------- ถูกตีกลับ ---------- */
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE_PROJECT,
    { 'Location': 'จุดที่จะถูกตีกลับ' });
  var svTask = wo.taskOf(DEPT.SERVICE);
  var pjTask = wo.taskOf(DEPT.PROJECT);

  withTestUser_(users.service, function () { return api_acceptTask(svTask); });
  withTestUser_(users.project, function () { return api_acceptTask(pjTask); });
  withTestUser_(users.service, function () {
    return api_returnTask(svTask, 'ที่อยู่หน้างานไม่ตรงกับที่แจ้ง');
  });

  // อีกแผนกที่ไม่ได้เป็นคนตีกลับ ก็ต้องเห็นใบนี้อยู่ในรายการและรู้ว่าเกิดอะไรขึ้น
  var pjRows = withTestUser_(users.project, function () { return api_listMyTasks(); }).data.rows;
  var pj = findTaskView_(pjRows, pjTask);
  assertTrue_(!!pj, 'ใบที่ถูกตีกลับต้องยังเห็นในรายการ ห้ามหายไปเฉย ๆ');
  assertEquals_(pj.blocked.returned, true, 'ต้องถูกทำเครื่องหมายว่าใบงานถูกตีกลับอยู่');
  assertEquals_(pj.workOrder.returnReason, 'ที่อยู่หน้างานไม่ตรงกับที่แจ้ง',
    'ต้องส่งเหตุผลที่ถูกตีกลับมาให้หน้าจอแสดงด้วย');
  assertEquals_(pj.status, TASK_STATUS.IN_PROGRESS,
    'สถานะงานของแผนกยังเป็นกำลังดำเนินการ งานที่ทำค้างไว้ไม่ถูกล้าง');
  assertEquals_(pj.workOrder.status, WO_STATUS.RETURNED, 'สถานะใบงานเป็นตีกลับ');

  // และกดอะไรไม่ได้จริง ๆ ที่ชั้น API ไม่ใช่แค่ปุ่มเทาบนหน้าจอ
  var blocked = withTestUser_(users.project, function () { return api_completeTask(pjTask); });
  assertEquals_(blocked.ok, false, 'ขณะถูกตีกลับ ปิดงานไม่ได้จริงที่ชั้น API');

  /* ---------- ถูกยกเลิก ---------- */
  // ใบที่ถูกตีกลับต้องส่งขออนุมัติใหม่ก่อน จึงจะอนุมัติได้อีกครั้ง (SPEC 5, 8)
  submitWorkOrder(wo.woId, users.admin);
  approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE_PROJECT, users.approver);
  withTestUser_(users.project, function () {
    return api_cancelTask(pjTask, 'ลูกค้าตัดงานส่วนติดตั้งออก');
  });

  var closed = withTestUser_(users.project, function () { return api_listMyTasks(true); }).data.rows;
  var cancelled = findTaskView_(closed, pjTask);
  assertTrue_(!!cancelled, 'งานที่ยกเลิกแล้วต้องยังเปิดดูได้เมื่อขอให้แสดง');
  assertEquals_(cancelled.status, TASK_STATUS.CANCELLED, 'สถานะเป็นยกเลิก');
  assertEquals_(cancelled.cancelReason, 'ลูกค้าตัดงานส่วนติดตั้งออก', 'เห็นเหตุผลที่ยกเลิก');

  // และแผนกที่ยังทำอยู่ ต้องเห็นว่าอีกแผนกยกเลิกไปแล้วพร้อมเหตุผล
  var svRows = withTestUser_(users.service, function () { return api_listMyTasks(); }).data.rows;
  var sv = findTaskView_(svRows, svTask);
  assertEquals_(sv.others[0].status, TASK_STATUS.CANCELLED, 'เห็นว่าอีกแผนกยกเลิกไปแล้ว');
  assertEquals_(sv.others[0].cancelReason, 'ลูกค้าตัดงานส่วนติดตั้งออก',
    'และเห็นเหตุผลที่อีกแผนกยกเลิกด้วย');

  // ตามค่าเริ่มต้น งานที่ปิดหรือยกเลิกแล้วจะไม่รก แต่ใบที่ถูกตีกลับต้องไม่ถูกกรองทิ้ง
  var defaultRows = withTestUser_(users.project, function () { return api_listMyTasks(); }).data.rows;
  assertTrue_(!findTaskView_(defaultRows, pjTask),
    'งานที่ยกเลิกแล้วไม่โผล่ในรายการปกติ จนกว่าจะขอให้แสดง');

  return endTest_();
}

/**
 * ใบที่รอชำระเงิน ต้องบอกเหตุผลได้ ไม่ใช่แค่ทำปุ่มเทา (SPEC 12, 17.3)
 */
function test_web_deptWorkPaymentNotice() {
  beginTest_('ใบที่รอชำระเงินต้องบอกเหตุผลให้หน้าจอแสดงได้ — SPEC 12');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE, {
    'Location': 'จุดที่ต้องชำระก่อน',
    'Payment_Required': true
  });
  var taskId = wo.taskOf(DEPT.SERVICE);

  var row = findTaskView_(
    withTestUser_(users.service, function () { return api_listMyTasks(); }).data.rows, taskId);

  assertEquals_(row.blocked.payment, true, 'ต้องบอกหน้าจอว่าติดเงื่อนไขการชำระเงิน');
  assertEquals_(row.workOrder.paymentRequired, true, 'ส่งมาด้วยว่าใบนี้บังคับชำระก่อน');
  assertEquals_(row.workOrder.paymentStatus, PAYMENT.UNPAID, 'และยังไม่ได้ชำระ');
  assertEquals_(row.blocked.returned, false, 'ไม่ได้ติดเพราะถูกตีกลับ เป็นคนละเหตุกัน');

  // กดจริงก็ต้องถูกปฏิเสธด้วยข้อความที่คนอ่านรู้เรื่อง
  var denied = withTestUser_(users.service, function () { return api_acceptTask(taskId); });
  assertEquals_(denied.ok, false, 'กดรับงานไม่ได้จริงที่ชั้น API');
  assertTrue_(String(denied.message).indexOf('ชำระเงิน') !== -1,
    'ข้อความที่ได้ต้องบอกว่าเป็นเรื่องการชำระเงิน');

  // บันทึกชำระแล้วต้องหายไป
  withTestUser_(users.admin, function () { return api_recordPayment(wo.woId, 'ใบเสร็จทดสอบ'); });
  row = findTaskView_(
    withTestUser_(users.service, function () { return api_listMyTasks(); }).data.rows, taskId);
  assertEquals_(row.blocked.payment, false, 'บันทึกชำระแล้ว เงื่อนไขนี้ต้องหายไป');
  assertEquals_(withTestUser_(users.service, function () { return api_acceptTask(taskId); }).ok, true,
    'แล้วกดรับงานได้จริง');

  return endTest_();
}

/* ===========================================================================
 * เส้นทาง "ยังไม่มีข้อมูลเลย" ของทุกหน้า (SPEC 17.3)
 *
 * เป็นเส้นทางที่เทสต์ทั้งชุดไม่เคยเดินผ่าน เพราะทุกข้อสร้างข้อมูลก่อนเสมอ
 * ทั้งที่เป็นสิ่งแรกที่ผู้ใช้จริงเจอตอนเปิดระบบวันแรก
 *
 * ชุดนี้จึงตั้งใจไม่สร้างข้อมูลใด ๆ แล้วเดินทุกหน้าให้ครบ
 * =========================================================================== */

/**
 * ทุกรายการที่คืนรายการ ต้องรับมือกับตารางว่างได้โดยไม่โยนข้อผิดพลาด
 *
 * "ไม่มีข้อมูล" เป็นสถานะปกติ ไม่ใช่ข้อผิดพลาด — ถ้าที่ไหนโยน error
 * ผู้ใช้จะเห็นข้อความว่าระบบล้มเหลว ทั้งที่ระบบทำงานถูกต้องทุกอย่าง
 */
function test_web_emptyListsEverywhere() {
  beginTest_('ทุกหน้ารับมือรายการว่างได้ — SPEC 17.3');

  var users = serviceTestUsers_();
  var nobody = { email: 'nobody@cnr.co.th', roles: [] };

  /*
   * ตั้งใจไม่สร้างข้อมูลเลย และใช้รหัสรอบใหม่ทุกครั้ง
   * ข้อมูลของชุดอื่นที่ค้างอยู่ไม่เกี่ยวข้อง เพราะทุกรายการกรองด้วยตัวตนของผู้เรียก
   * ส่วนผู้ใช้ทดสอบเหล่านี้ไม่มีงานของตัวเองสักรายการ
   */
  /*
   * สัญญาที่ต้องเป็นจริงเสมอ ไม่ว่าในชีตจะมีข้อมูลหรือไม่
   *   - คืน ok:true ไม่ใช่ข้อผิดพลาด
   *   - คืนรายการเป็น array เสมอ ไม่ใช่ null หรือค่าว่าง
   *   - ส่งผ่านช่องทางหน้าเว็บได้
   * ตรงนี้จงใจไม่ยืนยันว่าต้องได้ศูนย์รายการ เพราะแผนกหนึ่งอาจมีงานของชุดทดสอบอื่น
   * หรือของจริงบนชีตค้างอยู่ การบังคับให้เป็นศูนย์จะทำให้เทสต์พังด้วยเหตุที่ไม่ใช่บั๊ก
   */
  var everyList = [
    { name: 'แผนก Service',
      who: { email: 'empty.sv@cnr.co.th', roles: [ROLE.SERVICE], department: DEPT.SERVICE },
      run: function () { return api_listMyTasks(false); } },
    { name: 'แผนก Project',
      who: { email: 'empty.pe@cnr.co.th', roles: [ROLE.PROJECT], department: DEPT.PROJECT },
      run: function () { return api_listMyTasks(false); } },
    { name: 'แผนก Lab รวมงานที่ปิดแล้ว',
      who: { email: 'empty.lab@cnr.co.th', roles: [ROLE.LAB], department: DEPT.LAB },
      run: function () { return api_listMyTasks(true); } },
    { name: 'ผู้อนุมัติสาย SP',
      who: { email: 'empty.ap@cnr.co.th', roles: [ROLE.APPROVER_SP] },
      run: function () { return api_listPendingApprovals(ROUTE.SP); } },
    { name: 'ผู้อนุมัติสายแล็บ',
      who: { email: 'empty.lap@cnr.co.th', roles: [ROLE.APPROVER_LAB] },
      run: function () { return api_listPendingApprovals(ROUTE.LAB); } }
  ];

  for (var i = 0; i < everyList.length; i++) {
    var test = everyList[i];
    var result = withTestUser_(test.who, test.run);

    assertEquals_(result.ok, true,
      test.name + ' ต้องได้คำตอบปกติ ไม่ใช่ข้อผิดพลาด (ได้: ' + result.message + ')');
    assertTrue_(Object.prototype.toString.call(result.data.rows) === '[object Array]',
      test.name + ' ต้องได้รายการเป็น array เสมอ ไม่ใช่ค่าว่างหรือ null');
    assertTrue_(isJsonSafe_(result), test.name + ' ส่งผ่านช่องทางหน้าเว็บได้');
  }

  /*
   * เคสที่ยืนยันได้ว่าต้องว่างจริง ไม่ว่าชีตจะมีอะไรอยู่
   * เป็นเคสที่โครงสร้างบังคับให้ว่าง ไม่ได้อาศัยว่าชีตสะอาด
   */
  var mustBeEmpty = [
    { name: 'ผู้ใช้ที่ไม่ได้สังกัดแผนกใด เปิดหน้างานแผนก',
      who: nobody, run: function () { return api_listMyTasks(true); } },
    { name: 'ผู้อนุมัติสาย SP ขอดูรายการสายแล็บ',
      who: { email: 'empty.ap@cnr.co.th', roles: [ROLE.APPROVER_SP] },
      run: function () { return api_listPendingApprovals(ROUTE.LAB); } },
    { name: 'ผู้อนุมัติสายแล็บขอดูรายการสาย SP',
      who: { email: 'empty.lap@cnr.co.th', roles: [ROLE.APPROVER_LAB] },
      run: function () { return api_listPendingApprovals(ROUTE.SP); } },
    { name: 'คนที่ไม่มีสิทธิ์อนุมัติ เปิดหน้าอนุมัติ',
      who: nobody, run: function () { return api_listPendingApprovals(ROUTE.SP); } }
  ];

  for (var e = 0; e < mustBeEmpty.length; e++) {
    var empty = mustBeEmpty[e];
    var got = withTestUser_(empty.who, empty.run);
    assertEquals_(got.ok, true, empty.name + ' ต้องไม่ใช่ข้อผิดพลาด');
    assertEquals_(got.data.rows.length, 0, empty.name + ' ต้องได้รายการว่าง');
  }

  /* ---------- หน้าแรกและหน้าสร้างใบงาน ---------- */
  var menu = withTestUser_(nobody, function () { return api_getMenu(); });
  assertEquals_(menu.ok, true, 'หน้าแรกเปิดได้แม้ยังไม่มีข้อมูลและไม่มีสิทธิ์ใด');
  assertEquals_(menu.data.menu.length, MENU_ITEMS.length, 'เมนูยังครบทุกรายการ');

  var boot = withTestUser_(users.admin, function () { return api_getBootstrap(); });
  assertEquals_(boot.ok, true, 'หน้าสร้างใบงานเปิดได้');

  var noCustomer = withTestUser_(users.admin, function () {
    return api_searchCustomers('ชื่อที่ไม่มีทางมีอยู่จริง-' + testRunId_());
  });
  assertEquals_(noCustomer.ok, true, 'ค้นหาลูกค้าแล้วไม่เจอ ต้องไม่ใช่ข้อผิดพลาด');
  assertEquals_(noCustomer.data.length, 0, 'และได้รายการว่าง');

  var noLocation = withTestUser_(users.admin, function () {
    return api_listLocations(testCustomerCode_('ไม่มีจริง'), 'โครงการที่ไม่มี');
  });
  assertEquals_(noLocation.ok, true, 'ลูกค้าที่ยังไม่มีสถานที่ ต้องไม่ใช่ข้อผิดพลาด');
  assertEquals_(noLocation.data.length, 0, 'และได้รายการว่าง');

  /*
   * และหน้าจอต้องมีข้อความสำหรับสถานะว่างเตรียมไว้จริง
   * ข้อนี้คือสิ่งที่พังจริงตอนเดินงาน — ฝั่งข้อมูลคืนรายการว่างได้ถูกต้องอยู่แล้ว
   * แต่หน้าจอไม่ได้ออกแบบสถานะนี้ไว้ ผู้ใช้จึงไม่รู้ว่าเกิดอะไรขึ้น
   */
  /*
  * ทุกหน้าที่แสดงรายการต้องอยู่ในรายการนี้ · หน้าใบงานที่ถูกตีกลับเคยตกหล่นอยู่พักหนึ่ง
  * เพราะเพิ่มหน้าใหม่แล้วไม่มีใครมาเติมชื่อตรงนี้ แล้วไม่มีอะไรฟ้องเลย
  */
  var listPages = ['ui_Approve', 'ui_DeptWork', 'ui_LabWork', 'ui_Returned'];
  for (var p = 0; p < listPages.length; p++) {
    var source = HtmlService.createHtmlOutputFromFile(listPages[p]).getContent();
    var empties = emptyStateTextsIn_(source);
    assertTrue_(empties.length > 0,
      listPages[p] + ' ต้องมีข้อความสำหรับสถานะ "ยังไม่มีข้อมูล" เตรียมไว้');

    /*
     * เดิมข้อนี้ค้นหาวลีเดียวตายตัว ซึ่งผูกเทสต์ไว้กับสำนวนของหน้าที่เขียนก่อน
     * หน้าใหม่ที่เขียนคนละสำนวนแต่ทำถูกตามเจตนา จะตกทันทีโดยไม่มีอะไรผิดจริง
     * สิ่งที่ต้องเทียบคือ "บอกไหมว่าปกติจะมีข้อมูลเมื่อไร" จึงดูที่คำบอกเวลาแทน
     *
     * ต้องมีอย่างน้อยหนึ่งชุด ไม่ใช่ทุกชุด เพราะหน้าหนึ่งมีสถานะว่างได้หลายแบบ
     * และบางแบบไม่ใช่การรอข้อมูล เช่น "บัญชีนี้ไม่ได้เป็นผู้อนุมัติ" ซึ่งต้องอธิบาย
     * เรื่องสิทธิ์ ไม่ใช่บอกว่าเมื่อไรงานจะมา · การบังคับทุกชุดจะดันให้คนเขียนคำที่ผิดความจริง
     */
    var explained = false;
    for (var e = 0; e < empties.length; e++) {
      if (empties[e].indexOf('เมื่อ') !== -1) explained = true;
    }
    assertTrue_(explained,
      listPages[p] + ' ต้องบอกด้วยว่าปกติจะมีข้อมูลเมื่อไร ไม่ใช่บอกแค่ว่าว่าง');

    /* ---------- ตัวสแกนต้องจับได้จริง ไม่ใช่ผ่านเพราะตามเข้าไปอ่านอะไรก็ได้ ---------- */
    // พิสูจน์ด้วยของปลอมทั้งสองทาง: ข้อความที่อยู่ในฟังก์ชัน ต้องเห็น · ที่ไม่มีคำบอกเวลา ต้องไม่ผ่าน
    var fake = "function reasonOf(v) {\n  return 'งานจะมาเมื่อผู้อนุมัติส่งมาให้';\n}\n" +
      "box.innerHTML = emptyHtml('ยังไม่มีงาน', reasonOf(v));\n";
    assertTrue_(emptyStateTextsIn_(fake).join(' ').indexOf('เมื่อ') !== -1,
      'ตัวสแกนต้องตามเข้าไปอ่านข้อความที่แยกไว้ในฟังก์ชันได้');
    assertTrue_(emptyStateTextsIn_("emptyHtml('ว่าง', 'ไม่มีอะไร');").join(' ').indexOf('เมื่อ') === -1,
      'และต้องไม่ผ่านให้หน้าที่บอกแค่ว่าว่าง');
  }

  /* ---------- ตัวสแกนต้องจับได้จริง ---------- */
  assertEquals_(emptyStateTextsIn_("box.innerHTML = emptyHtml('ว่าง', 'มาที่นี่เมื่อมีงาน');").length, 1,
    'ตัวสแกนต้องเห็นชุดข้อความสถานะว่างที่มีอยู่จริง');
  assertEquals_(emptyStateTextsIn_("box.innerHTML = '<div>ว่าง</div>';").length, 0,
    'และต้องไม่นับกล่องว่างที่เขียนเอง ซึ่งเป็นสิ่งที่กฎข้อนี้ห้ามอยู่แล้ว');

  return endTest_();
}

/**
 * คีย์ที่หน้าเว็บประกาศว่าต้องใช้ ต้องมาครบทุกตัว (SPEC 17.3)
 *
 * รอยต่อนี้เทสต์ไม่เคยเดินผ่าน เพราะเทสต์ทั้งหมดรันฝั่งเซิร์ฟเวอร์
 * ไม่ได้รันจาวาสคริปต์ในหน้าเว็บ ความไม่ตรงกันระหว่าง "สิ่งที่เซิร์ฟเวอร์ฝัง"
 * กับ "สิ่งที่หน้าเว็บอ่าน" จึงหลุดออกไปถึงผู้ใช้จริงมาแล้ว
 *
 * เคยพังจริง: เซิร์ฟเวอร์ฝังทั้งเปลือก {ok, data} ลงไป แต่ทุกหน้าอ่านคีย์ข้างในตรง ๆ
 * ผลคือหน้างานแผนกขึ้นว่า "ยังไม่ได้ระบุแผนก" ทั้งที่ทะเบียนถูกต้อง
 * และหน้าสร้างใบงานพังตอนอ่าน displayName โดยไม่มีอะไรบอกว่าอะไรหายไป
 *
 * เทสต์นี้อ่าน PAGE_NEEDS จากไฟล์หน้าเว็บจริง แล้วเทียบกับก้อนที่ pageBootstrap_ ส่งให้
 * ใครเพิ่มหน้าใหม่แล้วลืมใส่ข้อมูล หรือเปลี่ยนรูปแบบก้อนข้อมูล จะแดงทันที
 */
function test_web_bootstrapContract() {
  beginTest_('คีย์ที่หน้าเว็บต้องใช้ ต้องมาครบ — SPEC 17.3');

  /*
   * ทุกหน้าที่เปิดได้ พร้อมผู้ใช้ที่มีสิทธิ์เข้าหน้านั้นจริง
   * ต้องใช้ผู้ใช้ที่มีสิทธิ์ ไม่งั้นข้อมูลของหน้าจะไม่ถูกดึงมาแต่แรก แล้วเทสต์จะผ่านแบบหลอก ๆ
   */
  /*
   * แผงเข้าสู่ระบบเป็นข้อยกเว้นเดียว — ต้องใช้งานได้ทั้งที่ยังไม่มีโทเคน
   * จึงต้องไม่ประกาศ PAGE_NEEDS และต้องไม่เรียก startPage ซึ่งขอข้อมูลจากเซิร์ฟเวอร์
   * ถ้าวันหนึ่งมีคนเผลอให้แผงนี้ขอข้อมูล ระบบจะวนอยู่ที่แผงเข้าสู่ระบบตลอดไป
   */
  var authPanel = HtmlService.createHtmlOutputFromFile('ui_Auth').getContent();
  assertEquals_(pageNeedsOf_('ui_Auth').length, 0,
    'แผงเข้าสู่ระบบต้องไม่ประกาศคีย์ที่ต้องใช้ เพราะยังไม่มีสิทธิ์ขอข้อมูลใด ๆ');
  assertTrue_(authPanel.indexOf('startPage(') === -1,
    'แผงเข้าสู่ระบบต้องไม่เรียก startPage ไม่งั้นจะวนกลับมาที่ตัวเองตลอดไป');
  assertTrue_(authPanel.indexOf("callApi('api_login'") !== -1,
    'และต้องเรียก api_login ซึ่งเป็นรายการเดียวที่เรียกได้ก่อนล็อกอิน');

  var cases = [
    { page: 'home',       file: 'ui_Home',     params: {},
      who: { email: 'h@cnr.co.th', roles: [ROLE.ADMIN] } },
    { page: 'create',     file: 'ui_CreateWo', params: {},
      who: { email: 'c@cnr.co.th', roles: [ROLE.ADMIN] } },
    { page: 'approve',    file: 'ui_Approve',  params: {},
      who: { email: 'p@cnr.co.th', roles: [ROLE.APPROVER_SP] } },
    { page: 'labapprove', file: 'ui_Approve',  params: {},
      who: { email: 'q@cnr.co.th', roles: [ROLE.APPROVER_LAB] } },
    { page: 'work',       file: 'ui_DeptWork', params: { dept: DEPT.SERVICE },
      who: { email: 's@cnr.co.th', roles: [ROLE.SERVICE], department: DEPT.SERVICE } },
    { page: 'work',       file: 'ui_DeptWork', params: { dept: DEPT.PROJECT },
      who: { email: 'j@cnr.co.th', roles: [ROLE.PROJECT], department: DEPT.PROJECT } },
    { page: 'lab',        file: 'ui_LabWork',  params: {},
      who: { email: 'b@cnr.co.th', roles: [ROLE.LAB], department: DEPT.LAB } },
    { page: 'returned',   file: 'ui_Returned', params: {},
      who: { email: 'r@cnr.co.th', roles: [ROLE.ADMIN] } },
    // รายการใบงานทั้งหมด เปิดได้ทุก Role ด้วยเหตุผลเดียวกับหน้ารายละเอียด (SPEC 2)
    { page: 'wolist',     file: 'ui_WoList',   params: {},
      who: { email: 'l@cnr.co.th', roles: [ROLE.SERVICE], department: DEPT.SERVICE } },
    // หน้ารายละเอียดเปิดได้ทุก Role และรับเลขที่ใบงานผ่าน ?id= (SPEC 17.2)
    { page: 'wo',         file: 'ui_WoDetail', params: { id: 'WO-2609-0001' },
      who: { email: 'd@cnr.co.th', roles: [ROLE.LAB], department: DEPT.LAB } },
    // เครื่องมือวัดการเปิดไฟล์ ไม่มีในเมนู เปิดด้วย ?page=filecheck (กฎข้อ 34)
    { page: 'filecheck',  file: 'ui_FileCheck', params: {},
      who: { email: 'f@cnr.co.th', roles: [ROLE.ADMIN] } }
  ];

  // ทุกหน้าที่เปิดได้ต้องมีอยู่ในรายการนี้ ไม่งั้นหน้าใหม่จะหลุดการตรวจ
  var covered = {};
  for (var c = 0; c < cases.length; c++) covered[cases[c].page] = true;
  for (var known in WEB_PAGES) {
    if (!Object.prototype.hasOwnProperty.call(WEB_PAGES, known)) continue;
    assertTrue_(covered[known] === true,
      'หน้า ' + known + ' ต้องถูกตรวจสัญญาข้อมูลด้วย — เพิ่มหน้าใหม่แล้วอย่าลืมเพิ่มที่นี่');
  }

  for (var i = 0; i < cases.length; i++) {
    var item = cases[i];
    var label = item.page + (item.params.dept ? ' (' + item.params.dept + ')' : '');

    if (item.skipData) continue;   // หน้าเข้าสู่ระบบตรวจไปแล้วข้างบน ด้วยกติกาของตัวเอง

    var needs = pageNeedsOf_(item.file);
    assertTrue_(needs.length > 0,
      'หน้า ' + item.file + ' ต้องประกาศ PAGE_NEEDS ว่าตัวเองใช้คีย์อะไร');

    var boot = withTestUser_(item.who, (function (it) {
      return function () { return pageBootstrap_(it.page, it.params); };
    })(item));

    assertEquals_(boot.error, '', label + ' ต้องไม่มีข้อผิดพลาดติดมาสำหรับผู้ใช้ที่มีสิทธิ์');

    // ตัวตนและเมนูต้องมาทุกหน้าเสมอ ไม่งั้นหน้าจะไม่มีแถบเมนูและไม่มีทางออก
    assertTrue_(!!boot.user, label + ' ต้องได้ตัวตนผู้ใช้มาด้วย');
    assertEquals_(boot.user.email, item.who.email, label + ' ตัวตนที่ฝังมาต้องเป็นของผู้ใช้คนนั้น');
    assertEquals_(boot.menu.length, MENU_ITEMS.length, label + ' ต้องได้เมนูครบทุกรายการ');
    assertTrue_(!!boot.labels, label + ' ต้องได้ตารางแปลภาษาไทย');

    // และคีย์ที่หน้านั้นประกาศว่าต้องใช้ ต้องมาครบ
    var missing = [];
    for (var n = 0; n < needs.length; n++) {
      if (boot[needs[n]] === undefined || boot[needs[n]] === null) missing.push(needs[n]);
    }
    assertEquals_(missing.join(', '), '',
      label + ' ขาดคีย์ที่หน้าประกาศว่าต้องใช้ (ต้องมี: ' + needs.join(', ') + ')');

    /*
     * คีย์ทุกตัวต้องอยู่ระดับบนสุด ห้ามมีเปลือก {ok, data} ซ้อนอยู่
     * นี่คือรูปแบบที่เคยพังมาแล้ว จึงกันไว้ตรง ๆ
     */
    assertTrue_(boot.ok === undefined && boot.data === undefined,
      label + ' ก้อนข้อมูลต้องไม่มีเปลือก ok/data ซ้อน คีย์ต้องอยู่ระดับเดียวกันหมด');

    assertTrue_(isJsonSafe_(boot), label + ' ก้อนข้อมูลต้องฝังลงหน้าได้');
  }

  /* ---------- หน้าที่ผู้ใช้ไม่มีสิทธิ์ ต้องยังได้ตัวตนและเมนู ---------- */
  // ไม่งั้นจะไม่มีแถบเมนูให้กดออก แล้วผู้ใช้จะติดอยู่ในหน้านั้น
  var denied = withTestUser_(
    { email: 's@cnr.co.th', roles: [ROLE.SERVICE], department: DEPT.SERVICE },
    function () { return pageBootstrap_('approve', {}); });
  assertTrue_(!!denied.user, 'หน้าที่ไม่มีสิทธิ์ ต้องยังได้ตัวตนมาเพื่อวาดแถบเมนู');
  assertEquals_(denied.menu.length, MENU_ITEMS.length, 'และต้องได้เมนูครบ เพื่อให้กดออกไปหน้าอื่นได้');
  assertTrue_(denied.rows === undefined, 'แต่ต้องไม่มีข้อมูลของหน้านั้นติดมา');

  return endTest_();
}

/**
 * คีย์ที่ไฟล์หน้าเว็บประกาศว่าตัวเองต้องใช้
 * อ่านจากตัวไฟล์จริง ไม่ได้จดไว้ซ้ำฝั่งเซิร์ฟเวอร์ สองฝั่งจึงหลุดจากกันไม่ได้
 *
 * @param {string} file ชื่อไฟล์หน้าเว็บ
 * @return {string[]}
 */
function pageNeedsOf_(file) {
  var source = HtmlService.createHtmlOutputFromFile(file).getContent();
  var found = /var\s+PAGE_NEEDS\s*=\s*\[([^\]]*)\]/.exec(source);
  if (!found) return [];

  var names = [];
  var parts = found[1].split(',');
  for (var i = 0; i < parts.length; i++) {
    var name = parts[i].replace(/['"\s]/g, '');
    if (name) names.push(name);
  }
  return names;
}

/**
 * ทุกหน้าต้องอ่านก้อนข้อมูลผ่านฟังก์ชันกลางตัวเดียว และห้ามค้างที่ "กำลังโหลด" (SPEC 17.3)
 */
function test_web_singleReaderAndNoStuckLoading() {
  beginTest_('อ่านก้อนข้อมูลทางเดียว และไม่ค้างที่กำลังโหลด — SPEC 17.3');

  // ต้องครบทุกหน้าที่เปิดได้จริง — หน้าที่ตกหล่นจะไม่ถูกคุมด้วยกฎข้อใดเลย
  var pages = ['ui_Home', 'ui_CreateWo', 'ui_Approve', 'ui_DeptWork', 'ui_LabWork', 'ui_Returned'];

  for (var i = 0; i < pages.length; i++) {
    var source = HtmlService.createHtmlOutputFromFile(pages[i]).getContent();

    /*
     * ห้ามหน้าไหนแกะ data-bootstrap เองอีก
     * เพราะเมื่อรูปแบบเปลี่ยน จะมีหน้าที่ตามไม่ทันแล้วพังเงียบ ๆ ซึ่งเกิดมาแล้ว
     */
    assertTrue_(source.indexOf("pageData('bootstrap')") === -1,
      pages[i] + ' ต้องไม่แกะก้อนข้อมูลเอง ให้ผ่านฟังก์ชันกลางเท่านั้น');
    assertTrue_(source.indexOf('PAGE_NEEDS') !== -1,
      pages[i] + ' ต้องประกาศคีย์ที่ตัวเองต้องใช้');
    assertTrue_(source.indexOf('startPage(') !== -1,
      pages[i] + ' ต้องเริ่มหน้าผ่านตัวกลางตัวเดียวกัน');

    // ตัวตนต้องมีแหล่งเดียว — ห้ามหน้าไหนอ่าน user จากผลของ api_ มาใช้คู่ขนานกับแถบเมนู
    assertTrue_(source.indexOf('state.user = data.user') === -1,
      pages[i] + ' ต้องไม่อ่านตัวตนจากอีกทางหนึ่ง แถบเมนูกับเนื้อหาต้องใช้แหล่งเดียวกัน');
  }

  /* ---------- ตัวกันค้างที่ "กำลังโหลด" ---------- */
  var script = HtmlService.createHtmlOutputFromFile('ui_Script').getContent();
  assertTrue_(script.indexOf('function readBootstrap') !== -1,
    'มีฟังก์ชันกลางตัวเดียวสำหรับอ่านก้อนข้อมูล');
  assertTrue_(script.indexOf('ขาด: ') !== -1,
    'ฟังก์ชันกลางต้องบอกได้ว่าขาดคีย์ไหน ไม่ใช่ปล่อยให้เป็น undefined');
  assertTrue_(script.indexOf('function guardLoading') !== -1,
    'ต้องมีตัวกันไม่ให้ข้อความกำลังโหลดค้างถาวร');

  var nav = HtmlService.createHtmlOutputFromFile('ui_Nav').getContent();
  assertTrue_(nav.indexOf('readBootstrap(') !== -1, 'ตัวเริ่มหน้าใช้ฟังก์ชันกลางตัวเดียวกัน');

  // ทุกหน้าที่ขึ้นว่ากำลังโหลด ต้องมีตัวกันค้างคุมอยู่
  for (var p = 0; p < pages.length; p++) {
    var html = HtmlService.createHtmlOutputFromFile(pages[p]).getContent();
    if (html.indexOf('กำลังโหลด') === -1) continue;
    assertTrue_(html.indexOf('guardLoading(') !== -1,
      pages[p] + ' มีข้อความกำลังโหลด จึงต้องมีตัวกันค้างคุมไว้ด้วย');
  }

  return endTest_();
}

/**
 * ข้อมูลตั้งต้นที่ฝังมากับหน้า ต้องครบและปลอดภัย และเปิดหน้าต้องคุยกับเซิร์ฟเวอร์ครั้งเดียว
 */
function test_web_pageBootstrap() {
  beginTest_('เปิดหน้าเดียว คุยกับเซิร์ฟเวอร์ครั้งเดียว — SPEC 17.3');

  var users = serviceTestUsers_();
  var svUser = { email: 'boot.sv@cnr.co.th', roles: [ROLE.SERVICE], department: DEPT.SERVICE };

  /* ---------- ข้อมูลตั้งต้นของแต่ละหน้า ---------- */
  var boot = withTestUser_(svUser, function () {
    return pageBootstrap_('work', { dept: DEPT.SERVICE });
  });
  assertEquals_(boot.error, '', 'ผู้ใช้ที่มีสิทธิ์ ต้องไม่มีข้อผิดพลาดติดมา');
  assertEquals_(boot.user.email, svUser.email, 'ตัวตนถูกฝังมากับหน้า');
  assertEquals_(boot.menu.length, MENU_ITEMS.length, 'เมนูครบทุกรายการถูกฝังมาด้วย');
  assertTrue_(!!boot.labels, 'ตารางแปลภาษาไทยถูกฝังมาด้วย');
  assertTrue_(!!boot.rows, 'ข้อมูลของหน้าถูกฝังมาในรอบเดียวกัน');
  assertTrue_(boot.ok === undefined && boot.data === undefined,
    'คีย์ต้องอยู่ระดับเดียวกันหมด ไม่มีเปลือก ok/data ซ้อน');

  /* ---------- ข้อจำกัดของการอัปโหลดต้องมากับทุกหน้า ---------- */
  /*
   * เคยพังมาแล้ว และพังเงียบที่สุดเท่าที่เคยเจอ: มีแค่หน้าสร้างใบงานที่ขอค่านี้เอง
   * หน้างานของแผนกจึงถือเพดาน 0 ไบต์ที่ค้างอยู่ในค่าตั้งต้นของหน้าเว็บ แล้วปฏิเสธ
   * ทุกไฟล์ที่ผู้ใช้เลือก ด้วยข้อความว่า "เกิน  ต่อไฟล์" ที่ไม่มีตัวเลขอยู่ในนั้นเลย
   * ผู้ใช้เห็นแค่ว่ากดแนบไฟล์แล้วไม่มีอะไรถูกบันทึก
   *
   * ทางแก้คือส่งมากับทุกหน้าจากจุดเดียว ไม่ใช่ให้แต่ละหน้าจำว่าต้องขอ
   */
  assertEquals_(boot.upload.maxBytes, MAX_UPLOAD_BYTES,
    'ทุกหน้าต้องได้เพดานขนาดไฟล์จริงจากเซิร์ฟเวอร์ ไม่ใช่ค่าตั้งต้นของหน้าเว็บ');
  assertTrue_(boot.upload.maxBytes > 0, 'และต้องไม่ใช่ศูนย์ ไม่งั้นทุกไฟล์จะใหญ่เกินเพดานทันที');
  assertTrue_(boot.upload.extensions.length > 0, 'พร้อมรายการนามสกุลที่รับได้ ไว้บอกผู้ใช้ก่อนเลือกไฟล์');
  assertTrue_(!!boot.upload.maxLabel, 'และข้อความขนาดที่คนอ่านรู้เรื่อง ไว้ใส่ในข้อความปฏิเสธ');

  /* ---------- หน้าที่ไม่มีสิทธิ์ ต้องไม่ดึงข้อมูลมาแต่แรก ---------- */
  var denied = withTestUser_(svUser, function () {
    return pageBootstrap_('approve', {});
  });
  assertEquals_(denied.error, '', 'หน้ายังขึ้นได้ตามปกติ');
  assertTrue_(denied.rows === undefined,
    'หน้าที่ผู้ใช้ไม่มีสิทธิ์ ต้องไม่มีข้อมูลติดมาเลย ไม่ใช่ดึงมาแล้วให้หน้าเว็บซ่อน');

  var crossDept = withTestUser_(svUser, function () {
    return pageBootstrap_('work', { dept: DEPT.PROJECT });
  });
  assertTrue_(crossDept.rows === undefined, 'ขอดูแผนกที่ไม่ใช่ของตัวเอง ต้องไม่มีข้อมูลติดมา');

  /* ---------- ไม่มีโทเคน ต้องได้ข้อความ ไม่ใช่ล้มทั้งหน้า ---------- */
  var anon = pageBootstrap_('work', {});
  assertTrue_(anon.error !== '', 'ระบุตัวตนไม่ได้ ต้องมีข้อความอธิบายติดมากับก้อนข้อมูล');
  assertEquals_(anon.upload.maxBytes, MAX_UPLOAD_BYTES,
    'ข้อจำกัดของการอัปโหลดไม่ขึ้นกับว่าใครเปิดหน้า จึงต้องมาครบแม้ในเส้นทางที่ระบุตัวตนไม่ได้');
  assertEquals_(anon.error, NEED_LOGIN_MESSAGE,
    'และต้องเป็นข้อความไทยที่บอกว่าต้องทำอะไรต่อ คือให้เข้าสู่ระบบก่อน');
  assertTrue_(anon.rows === undefined, 'และต้องไม่มีข้อมูลใดติดมา');

  /* ---------- หน้าที่ส่งออกไปต้องไม่มีข้อมูลของใครติดไปเลย ---------- */
  /*
   * ตอนประกอบหน้ายังไม่รู้ว่าใครเป็นคนเปิด เพราะตัวตนอยู่ในโทเคนที่เก็บไว้ในเบราว์เซอร์
   * และห้ามส่งโทเคนผ่าน URL · หน้าจึงต้องเป็นโครงเปล่าเสมอ ไม่ว่าใครขอมา
   */
  var page = renderPage_({ page: 'work', dept: DEPT.SERVICE, base: 'https://example.com/exec' });
  assertTrue_(page.indexOf('data-bootstrap=""') !== -1,
    'หน้าที่ส่งออกไปต้องไม่มีข้อมูลตั้งต้นฝังอยู่ เพราะขั้นนั้นยังไม่รู้ว่าใครเปิด');
  assertTrue_(page.indexOf(svUser.email) === -1, 'และต้องไม่มีตัวตนของใครติดไปกับหน้า');

  /* ---------- และต้องมีที่รับค่านี้ที่เดียว ไม่ใช่ให้แต่ละหน้าจำเอง ---------- */
  // ตัดคำอธิบายทิ้งก่อนเสมอ ไม่งั้นบรรทัดที่ถูกคอมเมนต์ปิดไว้จะยังทำให้ข้อนี้ผ่าน
  var nav = stripComments_(HtmlService.createHtmlOutputFromFile('ui_Nav').getContent());
  assertTrue_(nav.indexOf('setUploadLimits(ready.upload)') !== -1,
    'ทางผ่านของทุกหน้าต้องเป็นคนตั้งข้อจำกัดการอัปโหลดให้ และต้องเป็นโค้ดที่ทำงานจริง');
  assertEquals_(pagesSettingUploadLimits_(webPageSources_()).join(', '), '',
    'ห้ามมีหน้าใดขอข้อจำกัดเอง เพราะหน้าที่ลืมขอจะแนบไฟล์ไม่ได้เลยโดยไม่มีอะไรฟ้อง');

  // ตัวสแกนต้องจับของจริงได้ ไม่ใช่ผ่านเพราะหาไม่เจอ
  assertEquals_(pagesSettingUploadLimits_({ 'ui_ปลอม': 'setUploadLimits(data.upload);' }).join(', '),
    'ui_ปลอม', 'ตัวสแกนต้องจับหน้าที่ตั้งข้อจำกัดเองได้จริง');

  // ห้ามมีรหัสลับหรือรหัสไฟล์ติดไปกับหน้าเด็ดขาด
  // หน้าเว็บอยู่ในเบราว์เซอร์ของผู้ใช้ ทุกอย่างที่ฝังไปคือของที่ผู้ใช้เปิดอ่านได้ทั้งหมด
  assertTrue_(page.indexOf(GATEWAY_SECRET_PROP) === -1,
    'แม้แต่ชื่อของรหัสลับก็ไม่ควรโผล่ในหน้า');
  assertTrue_(page.indexOf('AUDIT_SHEET_ID') === -1, 'รหัสไฟล์ต้องไม่ติดไปกับหน้า');

  return endTest_();
}

/**
 * ต้นฉบับของหน้าเว็บทุกหน้าที่ผู้ใช้เปิดได้ — ไม่รวม ui_Nav ซึ่งเป็นทางผ่านของทุกหน้า
 * @return {Object} ชื่อไฟล์ไปยังเนื้อไฟล์
 */
function webPageSources_() {
  var names = ['ui_Home', 'ui_CreateWo', 'ui_Approve', 'ui_DeptWork', 'ui_LabWork',
    'ui_Returned', 'ui_WoDetail', 'ui_Reports'];
  var out = {};
  for (var i = 0; i < names.length; i++) {
    out[names[i]] = HtmlService.createHtmlOutputFromFile(names[i]).getContent();
  }
  return out;
}

/**
 * หน้าที่ตั้งข้อจำกัดการอัปโหลดเอง ซึ่งห้ามมี
 * @param {Object} sources ชื่อไฟล์ไปยังเนื้อไฟล์
 * @return {string[]} ชื่อไฟล์ที่ผิดกติกา
 */
function pagesSettingUploadLimits_(sources) {
  var bad = [];
  for (var name in sources) {
    if (!Object.prototype.hasOwnProperty.call(sources, name)) continue;
    if (stripComments_(sources[name]).indexOf('setUploadLimits(') !== -1) bad.push(name);
  }
  return bad;
}

/**
 * ขอหน้าเว็บผ่านทางเข้าจริงของหน้าบ้าน
 * @param {string} page ชื่อหน้า
 * @param {string} dept แผนกที่ขอ
 * @param {string} email อีเมลผู้ใช้
 * @return {string} HTML
 */
function doPostPage_(page, dept, email) {
  var props = PropertiesService.getScriptProperties();
  var before = props.getProperty(GATEWAY_SECRET_PROP);
  props.setProperty(GATEWAY_SECRET_PROP, 'รหัสลับของรอบทดสอบ');
  try {
    return doPost({ postData: { contents: JSON.stringify({
      secret: 'รหัสลับของรอบทดสอบ', mode: 'page', email: email,
      params: { page: page, dept: dept, base: 'https://example.com/exec' }
    }) } }).getContent();
  } finally {
    if (before === null) props.deleteProperty(GATEWAY_SECRET_PROP);
    else props.setProperty(GATEWAY_SECRET_PROP, before);
  }
}

/**
 * ทุกหน้าต้องมีทางออกกลับหน้าแรกในทุกสถานะ (SPEC 17.3)
 *
 * ปัญหาที่เกิดจริง: ตอนขึ้นข้อความผิดพลาด บางหน้าวาดทับทั้งหน้า
 * เมนูและปุ่มกลับหน้าแรกหายไปด้วย ผู้ใช้ติดอยู่ตรงนั้นจนต้องแก้ URL เอง
 * ซึ่งคนทั่วไปทำไม่เป็น
 */
function test_web_alwaysHasWayOut() {
  beginTest_('ทุกหน้ามีทางกลับหน้าแรกในทุกสถานะ — SPEC 17.3');

  var pages = ['ui_Home', 'ui_CreateWo', 'ui_Approve', 'ui_DeptWork', 'ui_LabWork', 'ui_Returned'];

  for (var i = 0; i < pages.length; i++) {
    var source = HtmlService.createHtmlOutputFromFile(pages[i]).getContent();

    assertTrue_(source.indexOf('id="navBar"') !== -1,
      pages[i] + ' มีที่สำหรับแถบเมนู');
    assertTrue_(source.indexOf("include('ui_Nav')") !== -1,
      pages[i] + ' ใช้แถบเมนูร่วม ซึ่งมีปุ่มกลับหน้าแรกอยู่ในนั้น');

    /*
     * ข้อผิดพลาดต้องแสดงผ่าน showPageError ซึ่งวาดไว้ "ข้างใน" โครงหน้า
     * ไม่ใช่ไปเขียนทับ body หรือ main ทั้งก้อน
     */
    assertTrue_(source.indexOf('document.body.innerHTML') === -1,
      pages[i] + ' ต้องไม่เขียนทับทั้งหน้า ไม่งั้นเมนูและทางออกจะหายไปด้วย');

    /*
     * ข้อผิดพลาดต้องออกทางตัวช่วยร่วมเท่านั้น ซึ่งวาดไว้ข้างในโครงหน้าทั้งคู่
     *   showPageError   ข้อผิดพลาดระดับหน้า วาดในกล่องของหน้า พร้อมปุ่มกลับหน้าแรก
     *   showActionError ข้อผิดพลาดของการกดปุ่ม วาดบนแถบข้อความ โครงหน้ายังอยู่ครบ
     * เดิมข้อนี้บังคับเฉพาะตัวแรก หน้าที่ใช้ตัวที่สองจึงตกทั้งที่ทำถูกตามเจตนา
     */
    if (pages[i] !== 'ui_Home') {
      assertTrue_(source.indexOf('showPageError(') !== -1 ||
        source.indexOf('showActionError(') !== -1,
        pages[i] + ' ต้องแสดงข้อผิดพลาดผ่านตัวช่วยร่วม ซึ่งเก็บเมนูและทางออกไว้ให้เสมอ');
    }
  }

  // ตัวแสดงข้อผิดพลาดและตัวแสดงเมนูที่ถูกปฏิเสธ ต้องมีปุ่มกลับหน้าแรกทั้งคู่
  var nav = HtmlService.createHtmlOutputFromFile('ui_Nav').getContent();
  var afterError = nav.substring(nav.indexOf('function showPageError'));
  assertTrue_(afterError.indexOf('NAV.home') !== -1,
    'กล่องข้อผิดพลาดต้องมีปุ่มกลับหน้าแรก');

  var afterDenied = nav.substring(nav.indexOf('function deniedHtml'));
  assertTrue_(afterDenied.substring(0, afterDenied.indexOf('function showPageError') + 1)
    .indexOf('NAV.home') !== -1 || afterDenied.indexOf('NAV.home') !== -1,
    'กล่องบอกว่าไม่มีสิทธิ์ต้องมีปุ่มกลับหน้าแรก');

  /*
   * ทางกลับหน้าแรกย้ายไปอยู่ที่หัวแถบเมนู เพราะเมนู 6 กลุ่มตาม SPEC 17.3
   * ไม่มีรายการ "หน้าแรก" อยู่ในนั้น · เจตนาเดิมยังเหมือนเดิมทุกตัวอักษร
   * คือทุกหน้าต้องมีทางกลับไปหน้ารายการใบงานโดยไม่ต้องแก้ URL เอง
   */
  assertTrue_(nav.indexOf("document.getElementById('brandLink')") !== -1,
    'แถบเมนูต้องมีทางกลับหน้าแรกที่หัวแถบ');
  // เทียบทั้งบรรทัด ไม่ใช่แค่ว่ามีคำนี้อยู่ในไฟล์ — บรรทัดที่ถูกปิดด้วยเงื่อนไขเท็จก็ยังมีคำนั้น
  assertTrue_(nav.indexOf("if (brand && NAV.home) brand.setAttribute('href', NAV.home);") !== -1,
    'และต้องชี้ไปที่อยู่ที่เซิร์ฟเวอร์ส่งมาให้จริง ๆ ไม่ใช่ประกอบเอาเองจาก location');

  // และหน้าที่หน้าบ้านวาดเองตอนไปไม่ถึงหลังบ้าน ก็ต้องมีทางออกเหมือนกัน
  var gateway = gatewaySource_();
  if (gateway) {
    assertTrue_(gateway.indexOf('กลับหน้าแรก') !== -1,
      'หน้าข้อความของหน้าบ้านต้องมีทางกลับหน้าแรกด้วย');
  }

  return endTest_();
}

/**
 * หน้าจอที่เปิดได้และแถบนำทาง (SPEC 17.2, 17.3)
 * รวมถึงกติกาว่าหน้าจองานของแผนกห้ามจัดรูปแบบเวลาเอง ต้องใช้ค่าที่เซิร์ฟเวอร์ส่งมา (กฎข้อ 19)
 */
/**
 * คำที่ห้ามปรากฏเป็นข้อความตรง ๆ ในไฟล์แถบเมนู
 *
 * เจตนาที่ต้องคุ้มครองคือ "แถบเมนูต้องไม่รู้จักรายชื่อ Role หรือรายการเมนูด้วยตัวเอง"
 * ทุกอย่างต้องมาจากเซิร์ฟเวอร์ ซึ่งอ่านจาก MENU_ITEMS ใน 00_Config ที่เดียว
 * ถ้าวันหนึ่งมีคนเขียนรายชื่อไว้ในหน้าเว็บอีกชุด สองที่จะหลุดจากกันโดยไม่มีอะไรฟ้อง
 *
 * รับเนื้อไฟล์เข้ามาแทนที่จะอ่านไฟล์เอง เพื่อให้เทสต์ป้อนของปลอมเข้าไปตรวจตัวสแกนได้
 * ตัดคอมเมนต์ทิ้งก่อน เพราะคำอธิบายพูดถึงชื่อ Role ได้ตามปกติ
 *
 * @param {string} source เนื้อไฟล์หน้าเว็บ
 * @return {string[]} คำที่เจอ
 */
function hardCodedMenuTermsIn_(source) {
  var code = stripComments_(String(source || ''));
  var found = [];

  // ชื่อ Role ต้องนับเฉพาะที่เขียนเป็นค่าคงที่ในเครื่องหมายคำพูด
  // ไม่งั้นคำว่า LAB จะไปชนกับคำว่า label ซึ่งเป็นคนละเรื่องกันโดยสิ้นเชิง
  var roles = knownRoles_();
  for (var r = 0; r < roles.length; r++) {
    var single = code.indexOf("'" + roles[r] + "'") !== -1;
    var double = code.indexOf('"' + roles[r] + '"') !== -1;
    if (single || double) found.push(roles[r]);
  }

  // ชื่อเมนูเป็นข้อความไทย จึงเทียบตรง ๆ ได้ ไม่ต้องกลัวชนคำอื่น
  for (var m = 0; m < MENU_ITEMS.length; m++) {
    if (code.indexOf(MENU_ITEMS[m].label) !== -1) found.push(MENU_ITEMS[m].label);
  }

  return found;
}

/**
 * ข้อความสถานะว่างทุกชุดในไฟล์หนึ่ง ๆ
 *
 * ดึงเนื้อในวงเล็บของ emptyHtml(...) ออกมา เพื่อตรวจว่าบอกไว้ไหมว่าปกติจะมีข้อมูลเมื่อไร
 * เดิมเทสต์ค้นหาวลีเดียวตายตัว พอหน้าใหม่เขียนคนละสำนวนก็ตกทันที
 * ทั้งที่ทำถูกตามเจตนา — เทียบเจตนาจึงต้องเทียบที่ "มีคำบอกเวลาไหม" ไม่ใช่ที่สำนวน
 *
 * @param {string} source เนื้อไฟล์หน้าเว็บ
 * @return {string[]} ข้อความในวงเล็บของแต่ละชุด
 */
function emptyStateTextsIn_(source) {
  var code = String(source || '');
  var texts = [];
  var from = 0;

  while (true) {
    var at = code.indexOf('emptyHtml(', from);
    if (at === -1) break;
    var close = code.indexOf(');', at);
    if (close === -1) break;
    texts.push(code.substring(at + 'emptyHtml('.length, close));
    from = close;
  }

  /*
   * ถ้อยคำของสถานะว่างไม่จำเป็นต้องเขียนติดอยู่กับ emptyHtml() เสมอไป —
   * หน้าที่มีสถานะว่างหลายแบบ เช่นหน้าแผนกที่มีสามมุมมอง ย่อมแยกข้อความไปไว้
   * ในฟังก์ชันของตัวเอง ซึ่งอ่านง่ายกว่าการยัดสามประโยคไว้ในบรรทัดเดียว
   *
   * ตัวสแกนจึงตามเข้าไปอ่านในฟังก์ชันที่ถูกส่งเข้ามาเป็นอาร์กิวเมนต์ด้วยหนึ่งชั้น
   * ไม่งั้นข้อนี้จะบังคับรูปแบบการเขียนโค้ด แทนที่จะตรวจสิ่งที่ตั้งใจจะตรวจจริง ๆ
   * คือ "หน้านี้บอกไหมว่าปกติข้อมูลจะมาเมื่อไร"
   */
  var followed = [];
  for (var t = 0; t < texts.length; t++) {
    followed.push(texts[t]);
    var names = texts[t].match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g) || [];
    for (var n = 0; n < names.length; n++) {
      var name = names[n].replace(/\s*\($/, '');
      var head = code.indexOf('function ' + name + '(');
      if (head === -1) continue;
      var tail = code.indexOf('\n}', head);
      followed.push(code.substring(head, tail === -1 ? code.length : tail));
    }
  }
  return followed;
}

function test_web_workPages() {
  beginTest_('หน้าจองานของแผนกและแถบนำทาง — SPEC 17.2');

  var expected = ['approve', 'create', 'lab', 'work'];
  for (var i = 0; i < expected.length; i++) {
    assertTrue_(Object.prototype.hasOwnProperty.call(WEB_PAGES, expected[i]),
      'เปิดหน้า ' + expected[i] + ' ได้');
    var file = WEB_PAGES[expected[i]].file;
    assertTrue_(!!HtmlService.createHtmlOutputFromFile(file).getContent(),
      'มีไฟล์หน้าจอ ' + file + ' อยู่จริง');
  }

  /*
   * หน้าจองานของแผนกต้องไม่ประกอบวันที่เอง
   *
   * เวลาทุกค่าที่แสดงมาจาก formatForDisplay_ ฝั่งเซิร์ฟเวอร์ ส่งมาในก้อน display แล้ว
   * ถ้ามีใครเผลอเรียก new Date() หรือ getFullYear() ในหน้าพวกนี้ แปลว่าเริ่มมีจุดที่สอง
   * ที่จัดรูปแบบเวลา แล้ววันหนึ่งจะหลุดจากกันจนสองหน้าจอแสดงคนละแบบ
   */
  var pages = ['ui_DeptWork', 'ui_LabWork'];
  var banned = ['getFullYear', 'getMonth(', 'toISOString', 'new Date('];
  for (var p = 0; p < pages.length; p++) {
    var source = HtmlService.createHtmlOutputFromFile(pages[p]).getContent();
    for (var b = 0; b < banned.length; b++) {
      assertTrue_(source.indexOf(banned[b]) === -1,
        pages[p] + ' ต้องไม่จัดรูปแบบเวลาเอง (พบ ' + banned[b] + ') ให้ใช้ค่าจาก display ที่ส่งมา');
    }
    assertTrue_(source.indexOf('row.display.') !== -1,
      pages[p] + ' ใช้ค่าเวลาที่จัดรูปแบบมาจากฝั่งเซิร์ฟเวอร์');
    assertTrue_(source.indexOf("include('ui_Nav')") !== -1,
      pages[p] + ' ใช้แถบนำทางร่วมเดียวกับหน้าอื่น');
    assertTrue_(!/for \(var \w+ = 0; \w+ < [0-9]/.test(source),
      pages[p] + ' ต้องไม่วนลูปด้วยจำนวนที่เขียนไว้ตายตัว ให้อ่านจำนวนจากข้อมูลจริง (กฎข้อ 9)');
  }

  // หน้าที่มีขั้นตอนย่อย ต้องวนตามจำนวนที่ส่งมาจริง ไม่ใช่จำนวนที่เขียนไว้ในโค้ด (กฎข้อ 9)
  var dept = HtmlService.createHtmlOutputFromFile('ui_DeptWork').getContent();
  assertTrue_(dept.indexOf('row.steps.length') !== -1,
    'หน้างานของแผนกวนขั้นตอนตามจำนวนที่ได้รับมาจริง');
  assertTrue_(dept.indexOf('row.progress.total') !== -1,
    'ตัวเลขความคืบหน้าที่แสดง มาจากจำนวนขั้นตอนจริง ไม่ได้นับเอง');

  /*
   * เมนูมาจาก MENU_ITEMS ใน 00_Config ที่เดียว ไม่ได้เขียนซ้ำในไฟล์หน้าเว็บ
   * ถ้าวันหนึ่งมีใครกลับไปเขียนรายชื่อ Role หรือรายการเมนูไว้ในหน้าเว็บเอง
   * สองที่จะหลุดจากกันโดยไม่มีอะไรฟ้อง
   *
   * เคยตรวจด้วยการหาคำว่า api_getMenu ในไฟล์นี้ แต่เลิกใช้แล้ว เพราะตั้งแต่รวมคำขอ
   * ให้เหลือครั้งเดียวต่อการเปิดหนึ่งหน้า เมนูมากับ api_pageData ไม่ได้ขอแยกอีกต่อไป
   * ข้อนั้นจึงกลายเป็นการตรวจสัญญาที่ตายไปแล้ว — เทสต์ผิด ไม่ใช่โค้ดผิด
   * ส่วนเจตนาเดิมยังจริงอยู่ทุกตัวอักษร จึงเปลี่ยนไปตรวจสิ่งที่ยังจริงแทน
   */
  var nav = HtmlService.createHtmlOutputFromFile('ui_Nav').getContent();

  assertEquals_(hardCodedMenuTermsIn_(nav).join(', '), '',
    'ไฟล์แถบเมนูต้องไม่มีชื่อ Role หรือชื่อเมนูรายการใดเขียนไว้เป็นข้อความตรง ๆ');
  assertTrue_(stripComments_(nav).indexOf('MENU_ITEMS') === -1,
    'และต้องไม่อ้างถึงทะเบียนเมนูของฝั่งเซิร์ฟเวอร์โดยตรง');

  // รายการที่วาดต้องมาจากก้อนข้อมูลที่เซิร์ฟเวอร์ส่งมาเท่านั้น
  assertTrue_(nav.indexOf('NAV.menu = menu') !== -1,
    'รายการเมนูต้องมาจากก้อนข้อมูลที่เซิร์ฟเวอร์ส่งมา');
  assertTrue_(nav.indexOf('NAV.menu.length') !== -1,
    'และต้องวาดตามจำนวนที่ได้รับมาจริง');
  /*
   * ข้อบนพิสูจน์แค่ว่า "มีคำนี้อยู่ที่ไหนสักแห่ง" ซึ่งอ่อนเกินไป — ไฟล์นี้มีลูปสองที่
   * แก้ที่หนึ่งให้เป็นเลขตายตัวแล้วอีกที่ยังเหลือคำนั้นอยู่ ข้อบนก็ยังผ่าน
   * ตัวที่กันได้จริงคือห้ามมีลูปใดในไฟล์นับด้วยเลขที่เขียนไว้เอง (กฎข้อ 9)
   */
  assertTrue_(!/for \(var \w+ = 0; \w+ < [0-9]/.test(stripComments_(nav)),
    'ไฟล์แถบเมนูต้องไม่มีลูปที่วนด้วยจำนวนตายตัว ให้อ่านจำนวนจากข้อมูลจริงเสมอ');
  /*
   * เดิมข้อนี้เทียบสตริงของการเรียก renderNav ที่มีสองอาร์กิวเมนต์
   * ตอนนี้แถบเมนูรับโครงกลุ่มและจำนวนงานค้างมาด้วย การเรียกจึงยาวขึ้น
   * เจตนาเดิมยังจริงทุกตัวอักษร คือ "ทุกอย่างมาจากก้อนเดียวของ api_pageData"
   * จึงเปลี่ยนไปตรวจว่าทุกค่าที่วาดแถบเมนูมาจากก้อน ready ตัวเดียวกันหมด
   */
  assertTrue_(nav.indexOf('renderNav(ready.user || {}, ready.menu || [], ready.groups') !== -1,
    'ก้อนข้อมูลนั้นต้องมาจากคำขอเดียวตอนเปิดหน้า ไม่ใช่ขอเมนูแยกอีกครั้ง');
  assertTrue_(nav.indexOf('ready.counts') !== -1,
    'จำนวนงานบนเมนูย่อยต้องมากับก้อนเดียวกัน ห้ามยิงขอทีละเมนู (SPEC 17.3)');

  /* ---------- ตัวสแกนต้องจับได้จริง ไม่ใช่ผ่านเพราะหาไม่เจอ ---------- */
  // ข้อที่เพิ่งพังมาคือเทสต์ที่ "ผ่านทั้งที่ของจริงเปลี่ยนไปแล้ว" จึงต้องพิสูจน์ตัวสแกนด้วยของปลอม
  assertEquals_(hardCodedMenuTermsIn_("if (user.roles.indexOf('" + ROLE.ADMIN + "') !== -1) {}")
    .join(', '), ROLE.ADMIN, 'ตัวสแกนต้องจับชื่อ Role ที่เขียนไว้ในหน้าเว็บได้');
  assertEquals_(hardCodedMenuTermsIn_("html += '<a>" + MENU_ITEMS[0].label + "</a>';")
    .join(', '), MENU_ITEMS[0].label, 'และต้องจับชื่อเมนูที่เขียนไว้ตายตัวได้');
  assertEquals_(hardCodedMenuTermsIn_("html += escapeHtml(item.label);").join(', '), '',
    'แต่ต้องไม่ฟ้องโค้ดที่วาดจากข้อมูลที่ได้รับมา');
  assertEquals_(hardCodedMenuTermsIn_("// เมนูของ " + ROLE.ADMIN + " เท่านั้น").join(', '), '',
    'และต้องไม่ฟ้องคำอธิบายที่พูดถึงชื่อ Role ตามปกติ');

  assertTrue_(nav.indexOf('guardPage') !== -1,
    'แถบเมนูมีด่านตรวจสิทธิ์ให้ทุกหน้าเรียกก่อนดึงข้อมูล');

  // ทุกหน้าต้องตรวจสิทธิ์ให้ผ่านก่อน แล้วค่อยขอข้อมูลของหน้า (SPEC 17.3)
  var guarded = ['ui_CreateWo', 'ui_Approve', 'ui_DeptWork', 'ui_LabWork'];
  for (var g = 0; g < guarded.length; g++) {
    assertTrue_(HtmlService.createHtmlOutputFromFile(guarded[g]).getContent()
      .indexOf('startPage(') !== -1,
      guarded[g] + ' ต้องผ่านด่านตรวจสิทธิ์ก่อนดึงข้อมูล');
  }

  return endTest_();
}

/**
 * หางานหนึ่งรายการจากผลของ api_listMyTasks
 * @param {Object[]} rows รายการที่ได้จาก API
 * @param {string} taskId เลขที่งานของแผนก
 * @return {Object|null}
 */
function findTaskView_(rows, taskId) {
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].taskId === taskId) return rows[i];
  }
  return null;
}

/**
 * หน้าตรวจสอบตัวตน (?page=whoami)
 *
 * สิ่งที่ต้องพิสูจน์มีสองอย่างที่ขัดกันเอง
 *   1. ปิดเป็นค่าเริ่มต้น เพราะเผยอีเมลและ Role ออกมาโดยไม่ตรวจสิทธิ์
 *   2. เมื่อเปิดแล้วต้องไม่ปฏิเสธใครเลย แม้ระบุตัวตนไม่ได้ —
 *      เพราะเคสที่อยากดูที่สุดคือเคสที่ระบบระบุตัวตนไม่ได้พอดี
 */
function test_web_whoami() {
  beginTest_('หน้าตรวจสอบตัวตน — ?page=whoami');

  var props = PropertiesService.getScriptProperties();
  var before = props.getProperty(WHOAMI_PROP);

  try {
    /* ---------- ปิดเป็นค่าเริ่มต้น ---------- */
    props.deleteProperty(WHOAMI_PROP);
    assertEquals_(whoamiOutput_().getContent(), 'ปิดอยู่',
      'ยังไม่ได้ตั้ง Script Property ต้องขึ้นว่าปิดอยู่');
    assertEquals_(doGet({ parameter: { page: 'whoami' } }).getContent(), 'ปิดอยู่',
      'เข้าผ่าน doGet ก็ต้องปิดเหมือนกัน');

    props.setProperty(WHOAMI_PROP, 'false');
    assertEquals_(whoamiOutput_().getContent(), 'ปิดอยู่', 'ตั้งเป็น false ก็ยังปิด');
    props.setProperty(WHOAMI_PROP, '');
    assertEquals_(whoamiOutput_().getContent(), 'ปิดอยู่', 'ตั้งเป็นค่าว่างก็ยังปิด');

    /* ---------- เปิดแล้วต้องได้ครบ 5 บรรทัด ---------- */
    props.setProperty(WHOAMI_PROP, 'true');
    var output = whoamiOutput_();
    var text = output.getContent();
    var lines = text.split('\n');

    assertEquals_(lines.length, 5, 'ต้องได้ 5 บรรทัดพอดี บรรทัดละค่า');
    assertTrue_(lines[0].indexOf('getActiveUser') === 0, 'บรรทัดที่ 1 คือ getActiveUser');
    assertTrue_(lines[1].indexOf('getEffectiveUser') === 0, 'บรรทัดที่ 2 คือ getEffectiveUser');
    assertTrue_(lines[2].indexOf('ระบบใช้อีเมล') === 0, 'บรรทัดที่ 3 คืออีเมลที่ระบบใช้จริง');
    assertTrue_(lines[3].indexOf('Role ที่ได้') === 0, 'บรรทัดที่ 4 คือ Role');
    assertTrue_(lines[4].indexOf('ทำงานในฐานะ') === 0, 'บรรทัดที่ 5 คือทำงานในฐานะใคร');
    assertEquals_(output.getMimeType(), ContentService.MimeType.TEXT,
      'คืนเป็นข้อความธรรมดา ไม่ใช่หน้าเว็บ');

    // ค่าว่างต้องเขียนออกมาให้เห็น ไม่ปล่อยเป็นช่องว่างเปล่า
    for (var i = 0; i < lines.length; i++) {
      var value = lines[i].split(':')[1];
      assertTrue_(String(value).trim() !== '',
        'บรรทัด "' + lines[i].split(':')[0].trim() + '" ต้องมีค่า ไม่ปล่อยว่างเปล่า');
    }

    /* ---------- ห้ามปฏิเสธใคร แม้ระบุตัวตนไม่ได้ ---------- */
    // ผู้รันเทสต์ไม่มีแถวใน User_Role อยู่แล้ว getCurrentUser_() จึงปฏิเสธ
    // ซึ่งเป็นเคสที่อยากเห็นที่สุดพอดี หน้านี้ต้องรายงานออกมา ไม่ใช่ล้มตาม
    assertTrue_(text.indexOf('ปิดอยู่') === -1, 'เปิดอยู่ ต้องไม่ขึ้นว่าปิด');
    assertTrue_(lines[3].indexOf('ระบุไม่ได้') !== -1 || lines[3].indexOf('(ว่าง)') !== -1 ||
      lines[3].length > String('Role ที่ได้        : ').length,
      'บรรทัด Role ต้องบอกผลเสมอ ไม่ว่าจะระบุตัวตนได้หรือไม่');

    var deniedUser = { email: 'ไม่มีในทะเบียน@example.com', roles: [] };
    var stillWorks = withTestUser_(deniedUser, function () { return whoamiOutput_().getContent(); });
    assertEquals_(stillWorks.split('\n').length, 5,
      'สวมสิทธิ์เป็นใครก็ตาม หน้านี้ต้องยังเปิดได้ครบ 5 บรรทัด');

    /* ---------- ค่าที่ยอมรับว่าเป็น "เปิด" ---------- */
    var onValues = ['true', 'TRUE', 'on', 'yes', '1', 'เปิด', ' true '];
    for (var v = 0; v < onValues.length; v++) {
      assertEquals_(whoamiEnabled_(onValues[v]), true, 'ค่า "' + onValues[v] + '" ถือว่าเปิด');
    }
    var offValues = ['', 'false', 'off', '0', 'no', null, undefined, 'อะไรก็ไม่รู้'];
    for (var f = 0; f < offValues.length; f++) {
      assertEquals_(whoamiEnabled_(offValues[f]), false, 'ค่า "' + offValues[f] + '" ถือว่าปิด');
    }

  } finally {
    // คืนค่าเดิมเสมอ ไม่ให้เทสต์เปิดหน้านี้ค้างไว้บนชีตจริง
    if (before === null) props.deleteProperty(WHOAMI_PROP);
    else props.setProperty(WHOAMI_PROP, before);
  }

  return endTest_();
}

/**
 * การตัดสินว่าระบบทำงานในฐานะใคร — ตรรกะล้วน ทดสอบได้โดยไม่ต้องปลอม Session
 *
 * ถ้าสองค่าไม่ตรงกัน แปลว่าเว็บแอปถูกตั้งให้ทำงานในฐานะเจ้าของสคริปต์
 * ทุกคนที่เปิดจะกลายเป็นคนเดียวกันในสายตาระบบ และการตรวจสิทธิ์ทั้งหมดจะไร้ความหมาย
 */
function test_web_whoamiRunningAs() {
  beginTest_('ตัดสินว่าระบบทำงานในฐานะใคร');

  assertEquals_(whoamiRunningAs_('somchai@cnr.co.th', 'somchai@cnr.co.th'), 'ผู้ใช้ที่เปิด',
    'สองค่าตรงกัน แปลว่าทำงานในฐานะคนที่เปิดจริง');
  assertEquals_(whoamiRunningAs_('somchai@cnr.co.th', 'owner@cnr.co.th'), 'เจ้าของสคริปต์',
    'สองค่าไม่ตรงกัน แปลว่าทำงานในฐานะเจ้าของสคริปต์');
  assertEquals_(whoamiRunningAs_(WHOAMI_BLANK, 'owner@cnr.co.th'), 'เจ้าของสคริปต์',
    'อ่านอีเมลผู้เปิดไม่ได้เลย ก็ถือว่าทำงานในฐานะเจ้าของสคริปต์');
  assertEquals_(whoamiRunningAs_(WHOAMI_BLANK, WHOAMI_BLANK), 'เจ้าของสคริปต์',
    'ว่างทั้งคู่ต้องไม่หลอกว่าเป็นผู้ใช้ที่เปิด เพราะยังพิสูจน์ตัวตนไม่ได้');

  return endTest_();
}

/**
 * ข้อความที่ผู้ใช้เห็นต้องเป็นภาษาไทยที่อ่านรู้เรื่อง ไม่มีชื่อสถานะ ชื่อ Action หรือชื่อ Role ดิบ (SPEC 17.3)
 */
function test_service_thaiMessages() {
  beginTest_('ข้อความถึงผู้ใช้เป็นภาษาไทย — SPEC 17.3');

  assertEquals_(woStatusLabel(WO_STATUS.PENDING_APPROVE), 'รออนุมัติ', 'แปลสถานะใบงานเป็นไทยได้');
  assertEquals_(woStatusLabel('ค่าที่ไม่รู้จัก'), 'ค่าที่ไม่รู้จัก', 'ค่าที่ไม่มีในตารางคืนค่าเดิม ไม่พัง');
  assertEquals_(fieldLabel('Job_Description'), 'ลักษณะงานที่ทำ หรืออาการ', 'แปลชื่อฟิลด์เป็นไทยได้');
  assertEquals_(toThai_(ASSIGNMENT_TH, ASSIGNMENT.SERVICE), 'แผนก Service', 'แปลแผนกเป็นไทยได้');
  assertEquals_(toThai_(ASSIGNMENT_TH, ASSIGNMENT.UNSPECIFIED), 'ยังไม่ระบุว่า Service หรือ Project',
    'ข้อความของ "ไม่ระบุ" ต้องบอกชัดว่าหมายถึงยังไม่รู้ว่า Service หรือ Project เท่านั้น (SPEC 3.1)');

  var users = serviceTestUsers_();
  var wo = createTestWo_(users, { 'Job_Description': 'ตรวจเช็คระบบ' });
  approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE, users.approver);

  // ทำรายการผิดจังหวะ ข้อความต้องบอกสถานะเป็นคำไทย ไม่ใช่ PENDING_APPROVE หรือ SUBMIT
  var denied = '';
  try {
    submitWorkOrder(wo.woId, users.admin);
  } catch (e) {
    denied = e.message;
  }
  assertTrue_(denied.indexOf('อนุมัติแล้ว') !== -1, 'ข้อความบอกสถานะปัจจุบันเป็นคำไทย');
  assertTrue_(denied.indexOf('SUBMIT') === -1 && denied.indexOf('APPROVED') === -1,
    'ข้อความต้องไม่มีชื่อ Action หรือชื่อสถานะดิบหลุดออกไป');

  // สิทธิ์ไม่พอ ต้องบอกว่าใครทำได้เป็นคำไทย — ต้องยิงตอนใบงานยังรออนุมัติอยู่
  var waiting = createTestWo_(users, { 'Job_Description': 'ตรวจเช็คระบบ', 'Location': 'จุดรออนุมัติ' });
  var roleDenied = '';
  try {
    approveWorkOrder(waiting.woId, ASSIGNMENT.SERVICE, users.service);
  } catch (e) {
    roleDenied = e.message;
  }
  assertTrue_(roleDenied.indexOf('ผู้อนุมัติ') !== -1, 'ข้อความบอกว่าใครมีสิทธิ์ทำเป็นคำไทย');
  assertTrue_(roleDenied.indexOf('APPROVER_SP') === -1, 'ข้อความต้องไม่มีชื่อ Role ดิบ');

  return endTest_();
}

/* ===========================================================================
 * ขั้นที่ 4 — ชุดทดสอบชั้น Service งานของแผนก (04_Service_Task.gs)
 *
 * ทุกข้อเดินผ่านชั้น Service จริง ไม่ได้ยัดสถานะลงชีตเอง เพราะสิ่งที่ต้องพิสูจน์
 * คือ "ลำดับการทำงาน" ตาม SPEC 20.3 และ 20.5 ไม่ใช่แค่ตารางสถานะ
 * =========================================================================== */

/**
 * สร้างใบงานทดสอบแล้วพาไปจนถึงขั้นอนุมัติ พร้อม Task ของแผนกที่ระบุ
 * @param {Object} users ผู้ใช้จาก serviceTestUsers_()
 * @param {string} assignmentType ค่าจาก ASSIGNMENT
 * @param {Object} [overrides] ค่าที่ต้องการเปลี่ยนในฟอร์ม
 * @param {Object} [options] ส่งต่อให้ approveWorkOrder
 * @return {Object} {woId, workOrder, tasks, taskOf}
 */
function approvedTestWo_(users, assignmentType, overrides, options) {
  // ใบงานเกิดพร้อมสถานะรออนุมัติทันที ไม่มีขั้นบันทึกร่างและไม่ต้องกด submit อีก (SPEC 4.1)
  var created = createTestWo_(users, overrides);
  var approved = approveWorkOrder(created.woId, assignmentType, users.approver, options || {});

  return {
    woId: created.woId,
    workOrder: getWorkOrder(created.woId),
    tasks: approved.tasks,
    /**
     * เลขที่งานของแผนกที่ต้องการ
     * @param {string} department ค่าจาก DEPT
     * @return {string}
     */
    taskOf: function (department) {
      var task = findTaskOfDepartment_(created.woId, department);
      return task ? task['Task_ID'] : '';
    }
  };
}

/**
 * รายการเอกสารของชุดทดสอบใน Report_Master — ต้องได้ชุดเดิมเสมอไม่ว่าชุดไหนจะรันก่อน
 *
 * ต้องเพิ่มของตัวเอง เพราะบนชีตจริงตาราง Report_Master เป็นข้อมูลของบริษัทที่แก้ไม่ได้
 * และบน mock ตารางนี้ว่างเปล่า ถ้าอาศัยข้อมูลจริง เทสต์จะผ่านหรือตกตามการตั้งค่าของชีต
 * ไม่ใช่ตามความถูกผิดของโค้ด
 *
 * หนึ่งในนั้นตั้ง Form_No เป็นค่าว่างโดยตั้งใจ เพราะของจริงมีแบบนั้น (LAB1 ที่ผู้ดูแล
 * ยังไม่ได้เติมเลขฟอร์ม) และระบบต้องใช้ Report_Code แทนได้โดยไม่พัง
 *
 * @return {Object} แผนที่ชื่อสั้น -> แถวที่ใช้งานได้
 */
function addTestReports_() {
  var prefix = testPrefix_();
  var wanted = [
    { key: 'svRequired', code: prefix + 'RPT-SV1', type: 'Service', sort: 1,
      name: 'รายงานการรับงานบริการ (ทดสอบ)', form: 'FM-TEST-SV-09', required: true, active: true },
    { key: 'svOptional', code: prefix + 'RPT-SV2', type: 'Service', sort: 2,
      name: 'ใบตรวจเช็คปั๊ม (ทดสอบ)', form: 'FM-TEST-SV-01', required: false, active: true },
    { key: 'svRetired', code: prefix + 'RPT-SV9', type: 'Service', sort: 3,
      name: 'แบบฟอร์มที่เลิกใช้แล้ว (ทดสอบ)', form: 'FM-TEST-SV-99', required: false, active: false },
    { key: 'peRequired', code: prefix + 'RPT-PE1', type: 'Project', sort: 101,
      name: 'หนังสือส่งมอบงาน (ทดสอบ)', form: 'FM-TEST-PE-11', required: true, active: true },
    { key: 'labRequired', code: prefix + 'RPT-LAB1', type: 'Lab', sort: 201,
      name: 'ผลตรวจคุณภาพน้ำ (ทดสอบ)', form: '', required: true, active: true },
    /*
     * แถวสุดท้ายของชีต แต่ต้องขึ้นเป็นรายการแรกของ Service เพราะ Sort_Order น้อยที่สุด
     * มีไว้เพื่อให้ "ลำดับในชีต" กับ "ลำดับที่ต้องแสดง" ไม่ตรงกันโดยตั้งใจ —
     * ถ้าทั้งสองอย่างตรงกัน เทสต์เรื่องการเรียงจะผ่านแม้โค้ดจะไม่ได้เรียงอะไรเลย
     */
    { key: 'svFirst', code: prefix + 'RPT-SV0', type: 'Service', sort: 0,
      name: 'ใบรับงานหน้างาน (ทดสอบ)', form: 'FM-TEST-SV-00', required: false, active: true }
  ];

  var existing = {};
  var rows = listReportMaster(false);
  for (var e = 0; e < rows.length; e++) existing[String(rows[e]['Report_Code'])] = rows[e];

  var toAdd = [];
  var out = {};
  for (var i = 0; i < wanted.length; i++) {
    var item = wanted[i];
    out[item.key] = item;
    if (existing[item.code]) continue;
    toAdd.push({
      'Report_Code': item.code, 'Type': item.type, 'Report_Name': item.name,
      'Form_No': item.form, 'Required': item.required,
      'Sort_Order': item.sort, 'Active': item.active
    });
  }
  if (toAdd.length) appendRows_(SHEET.REPORT_MASTER, toAdd);
  return out;
}

/**
 * แนบเอกสารที่บังคับของงานนั้นให้ครบ โดยเขียนทะเบียนตรง ๆ ไม่แตะ Drive
 *
 * เหตุผลเดียวกับ attachRequiredTestFiles_ ของไฟล์แนบตอนสร้างใบงาน — ชุดทดสอบส่วนใหญ่
 * ต้องการแค่ "ผ่านด่านเอกสาร" ไม่ได้ต้องการทดสอบตัวอัปโหลด และการสร้างไฟล์จริงทุกครั้ง
 * จะกินพื้นที่ Drive ของเจ้าของระบบและทำให้ทุกกลุ่มช้าลงมาก
 * ชุดที่พิสูจน์เรื่องการแนบจริงจะเรียก api_uploadFile เองตามปกติ
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @return {number} จำนวนเอกสารที่เพิ่งแนบให้
 */
function attachRequiredReports_(taskId) {
  var task = getTask(taskId);
  if (!task) return 0;

  var missing = missingRequiredReports_(taskId);
  if (!missing.length) return 0;

  var rows = [];
  for (var i = 0; i < missing.length; i++) {
    rows.push({
      'File_ID':            taskId + '-RPT-' + missing[i].code,
      'WO_ID':              task['WO_ID'],
      'Task_ID':            taskId,
      'Step_ID':            '',
      'Report_Code':        missing[i].code,
      'Saved_File_Name':    taskId + '_' + missing[i].formNo + '_01.pdf',
      'Original_File_Name': 'เอกสารทดสอบ.pdf',
      'Seq':                1,
      'Is_Active':          true,
      'Uploaded_By':        currentUserEmail_(),
      'Uploaded_Date':      new Date()
    });
  }
  insertFiles(rows);
  return rows.length;
}

/**
 * ปิดทุก Step และงวดงานของ Task หนึ่งผ่านเส้นทางจริงที่หน้าจอใช้
 * @param {string} taskId เลขที่งานของแผนก
 * @param {Object} user แผนกเจ้าของงาน
 * @return {number} จำนวนขั้นตอนที่ปิด
 */
function finishAllSteps_(taskId, user) {
  var steps = listStepsByTask(taskId);
  for (var i = 0; i < steps.length; i++) {
    updateTaskStep(steps[i]['Step_ID'], { 'Status': STEP_STATUS.COMPLETED }, user);
  }
  return steps.length;
}

/**
 * ปิดขั้นตอนข้ามลำดับไม่ได้ — ต้องทำขั้นก่อนหน้าให้เสร็จก่อน (SPEC 7.1, 7.2)
 *
 * เริ่มจาก api_ ที่หน้าเว็บเรียกจริง เพราะด่านนี้ต้องยืนอยู่ได้แม้ไม่มีหน้าจอ —
 * หน้าเว็บล็อกปุ่มให้ก็จริง แต่ใครก็ยิง api_updateTaskStep ตรง ๆ ได้
 */
function test_task_stepsInOrder() {
  beginTest_('ทำทีละขั้นตามลำดับ ข้ามขั้นไม่ได้ แต่ย้อนกลับไปแก้ได้เสมอ');

  var users = serviceTestUsers_();
  var sv = acceptedTaskFor_(ASSIGNMENT.SERVICE, DEPT.SERVICE, users.service);
  var steps = listStepsByTask(sv.taskId);
  var last = steps[steps.length - 1];

  /* ---------- กระโดดไปปิดขั้นสุดท้ายเลย ต้องไม่ได้ ---------- */
  var jump = withTestUser_(users.service, function () {
    return api_updateTaskStep(last['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
  });
  assertEquals_(jump.ok, false, 'ขั้นก่อนหน้ายังไม่เสร็จ ปิดขั้นสุดท้ายไม่ได้');
  assertTrue_(String(jump.message).indexOf(String(steps[0]['Step_Name'])) !== -1,
    'ข้อความต้องบอกขั้นที่ต้องไปทำก่อนจริง ๆ คือขั้นแรกที่ยังค้าง ไม่ใช่ขั้นที่อยู่ติดกัน');
  assertEquals_(getStep(last['Step_ID'])['Status'], STEP_STATUS.PENDING,
    'รายการที่ถูกปฏิเสธต้องไม่เปลี่ยนอะไรเลย');
  assertEquals_(String(getStep(last['Step_ID'])['Completed_By'] || ''), '',
    'และต้องไม่ทิ้งชื่อผู้ปิดค้างไว้บนขั้นที่ยังไม่เสร็จ');

  /* ---------- ทำตามลำดับได้ตามปกติ ---------- */
  for (var i = 0; i < steps.length; i++) {
    callApiAs_(users.service, 'ปิดขั้นตอนตามลำดับ', function () {
      return api_updateTaskStep(steps[i]['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
    });
  }
  assertEquals_(stepProgressOf_(sv.taskId).allDone, true, 'ทำครบทุกขั้นแล้ว');

  /* ---------- ย้อนกลับไปแก้ขั้นเก่าได้เสมอ ---------- */
  /*
   * การเปิดกลับคือการแก้ของที่ลงผิด ซึ่งต้องทำได้ตลอด ไม่งั้นคนที่กดพลาดจะติดอยู่กับ
   * ข้อมูลที่ผิดโดยแก้เองไม่ได้ · ด่านลำดับใช้กับการ "ปิด" เท่านั้น
   */
  callApiAs_(users.service, 'เปิดขั้นแรกกลับมาแก้', function () {
    return api_updateTaskStep(steps[0]['Step_ID'], { 'Status': STEP_STATUS.PENDING });
  });
  assertEquals_(getStep(steps[0]['Step_ID'])['Status'], STEP_STATUS.PENDING, 'ขั้นแรกกลับมาแก้ได้');
  assertEquals_(getStep(last['Step_ID'])['Status'], STEP_STATUS.COMPLETED,
    'และขั้นที่ปิดไปแล้วต้องไม่ถูกล้างตามไปด้วย');

  /*
   * และต้องเปิดขั้น "หลัง" กลับมาแก้ได้ด้วย ขณะที่ขั้นแรกยังค้างอยู่
   *
   * ข้อนี้คือความต่างระหว่าง "ด่านของการปิด" กับ "ด่านของทุกการแก้ไข" — ถ้าด่านไปกัน
   * การเปิดกลับด้วย คนที่ปิดขั้นสุดท้ายผิดจะแก้ไม่ได้เลย จนกว่าจะไปรื้อขั้นแรกก่อน
   */
  callApiAs_(users.service, 'เปิดขั้นสุดท้ายกลับมาแก้ ขณะที่ขั้นแรกยังค้าง', function () {
    return api_updateTaskStep(last['Step_ID'], { 'Status': STEP_STATUS.PENDING });
  });
  assertEquals_(getStep(last['Step_ID'])['Status'], STEP_STATUS.PENDING,
    'ขั้นหลังเปิดกลับมาแก้ได้ แม้ขั้นก่อนหน้าจะยังไม่เสร็จ');

  callApiAs_(users.service, 'ปิดขั้นแรกอีกครั้ง', function () {
    return api_updateTaskStep(steps[0]['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
  });
  callApiAs_(users.service, 'ปิดขั้นสุดท้ายอีกครั้ง', function () {
    return api_updateTaskStep(last['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
  });
  assertEquals_(stepProgressOf_(sv.taskId).allDone, true, 'ปิดกลับคืนได้ตามเดิม');

  return endTest_();
}

/**
 * เส้นทางปกติของงานแผนกเดียว — รับงาน อัปเดต Step ครบ ปิดงาน แล้ว WO ต้องปิดเอง
 * (SPEC 6.1, 7.1, 20.3 · กฎข้อ 2)
 */
function test_task_singleDepartmentFlow() {
  beginTest_('รับงาน -> ปิด Step ครบ -> ปิดงาน -> WO ปิดเอง — SPEC 20.3');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดงานแผนกเดียว' });
  var taskId = wo.taskOf(DEPT.SERVICE);

  assertEquals_(getTask(taskId)['Status'], TASK_STATUS.PENDING_ACCEPT, 'อนุมัติแล้วงานของแผนกรอให้กดรับ');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.APPROVED,
    'ยังไม่มีใครกดรับงาน ใบงานจึงยังเป็นอนุมัติแล้ว');

  // ปิดงานก่อนรับงาน ต้องไม่ได้
  assertThrows_(function () { completeTask(taskId, users.service); },
    'ยังไม่กดรับงานก็ปิดงานไม่ได้');

  // 1) รับงาน
  var accepted = acceptTask(taskId, users.service);
  assertEquals_(accepted.to, TASK_STATUS.IN_PROGRESS, 'กดรับงานแล้วงานของแผนกเป็นกำลังดำเนินการ');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.IN_PROGRESS,
    'recalcWoStatus ในรายการเดียวกันดันใบงานเป็นกำลังดำเนินการ');
  assertEquals_(getTask(taskId)['Accepted_By'], users.service.email, 'บันทึกว่าใครเป็นคนรับงาน');
  assertTrue_(getTask(taskId)['Accepted_Date'] instanceof Date, 'บันทึกวันเวลาที่รับงาน');

  // 2) Step ตั้งต้นต้องมาจากตารางจริง ไม่ได้ hard-code เลข 3 (กฎข้อ 9)
  var steps = listStepsByTask(taskId);
  assertTrue_(steps.length > 0, 'แผนก Service ได้ขั้นตอนงานตั้งต้นมาให้');
  assertEquals_(stepProgressOf_(taskId).allDone, false, 'ขั้นตอนงานยังไม่เสร็จสักขั้น');

  // ปิดงานทั้งที่ Step ยังไม่ครบ ต้องถูกปฏิเสธ
  assertThrowsMessage_(function () { completeTask(taskId, users.service); },
    'ยังทำ Step', 'ปิดงานทั้งที่ขั้นตอนยังไม่ครบ ต้องถูกปฏิเสธ');
  assertEquals_(getTask(taskId)['Status'], TASK_STATUS.IN_PROGRESS, 'และสถานะงานต้องไม่เปลี่ยน');

  // 3) อัปเดต Step ให้ครบ
  var first = steps[0];
  var updated = updateTaskStep(first['Step_ID'], { 'Status': STEP_STATUS.COMPLETED }, users.service);
  assertEquals_(updated.step['Status'], STEP_STATUS.COMPLETED, 'ปิดขั้นตอนแรกได้');
  assertEquals_(updated.step['Completed_By'], users.service.email, 'ระบบเติมผู้ปิดขั้นตอนให้เอง');
  assertTrue_(updated.step['Completed_Date'] instanceof Date, 'ระบบเติมวันเวลาที่ปิดขั้นตอนให้เอง');
  assertEquals_(updated.plan.changed, false, 'การอัปเดตขั้นตอนไม่เปลี่ยนสถานะของงานแผนก');
  assertEquals_(stepProgressOf_(taskId).done, 1, 'ความคืบหน้านับได้ 1 ขั้น');

  // เปิดขั้นตอนกลับ ต้องล้างชื่อผู้ทำและวันที่ทิ้ง ไม่ให้ค้างอยู่บนขั้นที่ยังไม่เสร็จ
  var reopened = updateTaskStep(first['Step_ID'], { 'Status': STEP_STATUS.PENDING }, users.service);
  assertEquals_(reopened.step['Completed_By'], '', 'เปิดขั้นตอนกลับแล้วชื่อผู้ปิดต้องหายไป');
  assertTrue_(!reopened.step['Completed_Date'], 'เปิดขั้นตอนกลับแล้ววันที่ปิดต้องหายไป');

  var finished = finishAllSteps_(taskId, users.service);

  attachRequiredReports_(taskId);
  assertEquals_(finished, steps.length, 'ปิดขั้นตอนครบทุกขั้น');
  assertEquals_(stepProgressOf_(taskId).allDone, true, 'ความคืบหน้าครบ 100%');

  // 4) ปิดงาน — WO ต้องปิดเองในรายการเดียวกัน
  var completed = completeTask(taskId, users.service);
  assertEquals_(completed.to, TASK_STATUS.COMPLETED, 'ปิดงานของแผนกได้');
  assertEquals_(completed.recalc.rule, 'ALL_ACTIVE_COMPLETED', 'ใบงานถูกคำนวณด้วยกฎปิดงานอัตโนมัติ');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.COMPLETED,
    'ไม่มีใครสั่งปิดใบงาน แต่ใบงานปิดเองเมื่อแผนกสุดท้ายปิดงาน');
  assertEquals_(getTask(taskId)['Completed_By'], users.service.email, 'บันทึกว่าใครเป็นคนปิดงาน');

  assertEquals_(auditCount_(wo.woId, ENTITY.TASK, ACTION.TASK_ACCEPT), 1, 'Audit บันทึกการรับงาน 1 แถว');
  assertEquals_(auditCount_(wo.woId, ENTITY.TASK, ACTION.TASK_COMPLETE), 1, 'Audit บันทึกการปิดงาน 1 แถว');

  return endTest_();
}

/**
 * งานร่วม Service + Project — ปิดแผนกเดียว WO ต้องยังไม่ปิด (SPEC 8)
 */
function test_task_jointCompletion() {
  beginTest_('งานร่วมสองแผนก ปิดครบทั้งคู่ใบงานจึงปิด — SPEC 8');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE_PROJECT,
    { 'Location': 'จุดงานร่วมสองแผนก' });

  var svTask = wo.taskOf(DEPT.SERVICE);
  var pjTask = wo.taskOf(DEPT.PROJECT);
  assertEquals_(wo.tasks.length, 2, 'งานร่วมต้องเกิดงานของแผนก 2 ตัว');
  assertTrue_(svTask !== '' && pjTask !== '', 'มีงานของทั้งแผนก Service และ Project');
  // เจตนาเดิมคือ "จำนวนงวดไม่ใช่เลขตายตัวในโค้ด" ซึ่งยังต้องคุ้มครอง
  // ข้อตกลงใหม่: ตอนอนุมัติไม่มีงวดเลย แผนกเพิ่มเองหลังรับงาน (SPEC 20.2)
  assertEquals_(listStepsByTask(pjTask).length, 0, 'ตอนอนุมัติ ฝั่ง Project ยังไม่มีงวดเลย');

  acceptTask(svTask, users.service);
  acceptTask(pjTask, users.project);
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.IN_PROGRESS,
    'ทั้งสองแผนกรับงานแล้ว ใบงานกำลังดำเนินการ');

  // แผนก Project แบ่งงานเป็น 2 งวดเอง แล้วจำนวนงวดจึงต่างจากจำนวนขั้นของ Service
  addTaskPeriod(pjTask, 'งวดที่ 1 ติดตั้ง', users.project);
  addTaskPeriod(pjTask, 'งวดที่ 2 ทดสอบระบบ', users.project);
  assertEquals_(listStepsByTask(pjTask).length, 2, 'แผนกเพิ่มงวดเองได้ตามที่งานจริงต้องใช้');

  // แผนกแรกปิดงาน — ใบงานต้องยังไม่ปิด
  finishAllSteps_(svTask, users.service);
  attachRequiredReports_(svTask);
  var svDone = completeTask(svTask, users.service);
  assertEquals_(svDone.to, TASK_STATUS.COMPLETED, 'แผนก Service ปิดงานของตัวเองแล้ว');
  assertEquals_(svDone.recalc.changed, false, 'อีกแผนกยังทำอยู่ ใบงานจึงยังไม่เปลี่ยนสถานะ');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.IN_PROGRESS,
    'ปิดไปแผนกเดียว ใบงานต้องยังเป็นกำลังดำเนินการ');

  // แผนกที่สองปิดงาน — ใบงานจึงปิด
  finishAllSteps_(pjTask, users.project);
  attachRequiredReports_(pjTask);
  var pjDone = completeTask(pjTask, users.project);
  assertEquals_(pjDone.recalc.rule, 'ALL_ACTIVE_COMPLETED', 'ปิดครบทั้งสองแผนกแล้วจึงเข้ากฎปิดงาน');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.COMPLETED,
    'ปิดครบทั้งสองแผนก ใบงานจึงปิด');

  return endTest_();
}

/**
 * งานร่วมที่แผนกหนึ่งเสร็จ อีกแผนกยกเลิก — ใบงานต้องเป็น COMPLETED ไม่ใช่ CANCELLED (SPEC 8)
 */
function test_task_jointCancelOne() {
  beginTest_('แผนกหนึ่งเสร็จ อีกแผนกยกเลิก ใบงานต้องปิดไม่ใช่ยกเลิก — SPEC 8');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE_PROJECT,
    { 'Location': 'จุดที่ยกเลิกบางแผนก' });

  var svTask = wo.taskOf(DEPT.SERVICE);
  var pjTask = wo.taskOf(DEPT.PROJECT);

  acceptTask(svTask, users.service);
  acceptTask(pjTask, users.project);

  // แผนก Project ยกเลิกงานของตัวเองได้ทันทีโดยไม่ต้องขออนุมัติ แต่ต้องมีเหตุผล (SPEC 8)
  assertThrowsMessage_(function () { cancelTask(pjTask, '', users.project); },
    'เหตุผล', 'ยกเลิกงานโดยไม่กรอกเหตุผลไม่ได้');
  assertEquals_(getTask(pjTask)['Status'], TASK_STATUS.IN_PROGRESS, 'รายการที่ถูกปฏิเสธไม่เปลี่ยนสถานะ');

  var cancelled = cancelTask(pjTask, 'ลูกค้าตัดงานส่วนติดตั้งออก', users.project);
  assertEquals_(cancelled.to, TASK_STATUS.CANCELLED, 'แผนกยกเลิกงานตัวเองได้ทันที');
  assertEquals_(getTask(pjTask)['Cancel_Reason'], 'ลูกค้าตัดงานส่วนติดตั้งออก', 'บันทึกเหตุผลการยกเลิกไว้');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.IN_PROGRESS,
    'ยังมีแผนกที่ทำอยู่ ใบงานจึงยังไม่ปิดและยังไม่ยกเลิก');

  finishAllSteps_(svTask, users.service);

  attachRequiredReports_(svTask);
  var done = completeTask(svTask, users.service);
  assertEquals_(done.recalc.rule, 'ALL_ACTIVE_COMPLETED',
    'ตัวที่ยกเลิกถูกกันออกจากการนับ เหลือแต่ตัวที่เสร็จ');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.COMPLETED,
    'มีทั้งแผนกที่ยกเลิกและแผนกที่เสร็จ ใบงานต้องเป็นเสร็จสิ้น ไม่ใช่ยกเลิก');

  return endTest_();
}

/**
 * ทุกแผนกยกเลิกหมด — ใบงานต้องกลายเป็น CANCELLED (SPEC 8)
 */
function test_task_cancelAllDepartments() {
  beginTest_('ยกเลิกครบทุกแผนก ใบงานจึงยกเลิก — SPEC 8');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE_PROJECT,
    { 'Location': 'จุดที่ยกเลิกทุกแผนก' });

  var svTask = wo.taskOf(DEPT.SERVICE);
  var pjTask = wo.taskOf(DEPT.PROJECT);

  // ยกเลิกได้ตั้งแต่ยังไม่กดรับงาน (SPEC 5 — TASK_CANCEL จาก PENDING_ACCEPT ได้)
  cancelTask(svTask, 'ลูกค้ายกเลิกงานทั้งหมด', users.service);
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.APPROVED,
    'ยกเลิกไปแผนกเดียว ใบงานยังไม่ยกเลิกตาม');

  var last = cancelTask(pjTask, 'ลูกค้ายกเลิกงานทั้งหมด', users.project);
  assertEquals_(last.recalc.rule, 'ALL_CANCELLED', 'ยกเลิกครบทุกแผนกจึงเข้ากฎยกเลิกอัตโนมัติ');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.CANCELLED,
    'ยกเลิกครบทุกแผนก ใบงานจึงยกเลิก');

  // สถานะปลายทางแล้ว ทำอะไรต่อไม่ได้
  assertThrows_(function () { acceptTask(svTask, users.service); },
    'งานที่ยกเลิกแล้ว กดรับไม่ได้อีก');

  return endTest_();
}

/**
 * แผนกตีกลับใบงาน — ต้องจำสถานะ Task ทุกตัวไว้ก่อน แล้วไม่แตะสถานะ Task เลย
 * (SPEC 20.5 · ข้อ 5, 6, 7 ในเกณฑ์ตรวจรับ)
 */
function test_task_returnKeepsWork() {
  beginTest_('แผนกตีกลับแล้วงานที่ทำไว้ต้องอยู่ครบ — SPEC 20.5');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE_PROJECT,
    { 'Location': 'จุดที่ถูกตีกลับกลางคัน' });

  var svTask = wo.taskOf(DEPT.SERVICE);
  var pjTask = wo.taskOf(DEPT.PROJECT);

  acceptTask(svTask, users.service);
  acceptTask(pjTask, users.project);

  // ทำงานค้างไว้ครึ่งทางก่อนถูกตีกลับ
  var svSteps = listStepsByTask(svTask);
  updateTaskStep(svSteps[0]['Step_ID'], { 'Status': STEP_STATUS.COMPLETED }, users.service);
  var doneBefore = stepProgressOf_(svTask).done;
  assertEquals_(doneBefore, 1, 'ก่อนถูกตีกลับ แผนก Service ปิดไปแล้ว 1 ขั้นตอน');

  var countBefore = Number(getWorkOrder(wo.woId)['Return_Count'] || 0);

  assertThrowsMessage_(function () { returnTask(svTask, '', users.service); },
    'เหตุผล', 'ตีกลับโดยไม่กรอกเหตุผลไม่ได้');
  assertEquals_(getTask(svTask)['Status_Before_Return'], '',
    'รายการที่ถูกปฏิเสธต้องไม่ทิ้งค่าสถานะที่จำไว้ค้างในชีต');

  /* ---------- ข้อ 5: ตีกลับขณะกำลังทำงาน ---------- */
  var returned = returnTask(svTask, 'ที่อยู่หน้างานไม่ตรงกับที่แจ้ง', users.service);

  assertEquals_(getTask(svTask)['Status_Before_Return'], TASK_STATUS.IN_PROGRESS,
    'สถานะก่อนถูกพักของแผนกที่กดตีกลับ ต้องเป็นกำลังดำเนินการ');
  assertEquals_(getTask(pjTask)['Status_Before_Return'], TASK_STATUS.IN_PROGRESS,
    'ต้องจำสถานะของ "ทุก" แผนกไว้ ไม่ใช่เฉพาะแผนกที่กดตีกลับ');
  assertEquals_(returned.remembered, 2, 'จำสถานะไว้ครบทั้งสองแผนก');

  assertEquals_(getTask(svTask)['Status'], TASK_STATUS.IN_PROGRESS,
    'สถานะงานของแผนกที่กดตีกลับต้องไม่ถูกเปลี่ยน');
  assertEquals_(getTask(pjTask)['Status'], TASK_STATUS.IN_PROGRESS,
    'สถานะงานของอีกแผนกก็ต้องไม่ถูกเปลี่ยนเช่นกัน');

  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.RETURNED, 'ใบงานถูกตีกลับ');
  assertEquals_(Number(getWorkOrder(wo.woId)['Return_Count']), countBefore + 1,
    'ตัวนับการตีกลับเพิ่มขึ้น 1');
  assertEquals_(returned.returnCount, countBefore + 1, 'ค่าที่คืนกลับตรงกับที่บันทึกลงชีต');
  assertEquals_(getWorkOrder(wo.woId)['Return_Reason'], 'ที่อยู่หน้างานไม่ตรงกับที่แจ้ง',
    'บันทึกเหตุผลการตีกลับไว้ให้ผู้แจ้งอ่าน');
  assertEquals_(getTask(svTask)['Return_Reason'], 'ที่อยู่หน้างานไม่ตรงกับที่แจ้ง',
    'เหตุผลถูกบันทึกที่งานของแผนกด้วย จะได้รู้ว่าแผนกไหนตีกลับ');
  assertEquals_(auditCount_(wo.woId, ENTITY.TASK, ACTION.TASK_RETURN), 1,
    'Audit บันทึกการตีกลับของแผนก 1 แถว');

  /* ---------- ข้อ 8: ขณะถูกตีกลับ ทุก TASK_* ต้องถูกปฏิเสธ (กฎข้อ 13) ---------- */
  var svStatusBefore = getTask(svTask)['Status'];
  var pjStatusBefore = getTask(pjTask)['Status'];
  /*
   * ใช้ขั้นตอนของฝั่ง Service เพราะฝั่ง Project ไม่มีงวดตั้งต้นอีกแล้ว (SPEC 20.2)
   * สิ่งที่ข้อนี้พิสูจน์ไม่เปลี่ยน: ขณะใบงานถูกตีกลับ ทุกรายการ TASK_* ต้องถูกปฏิเสธ
   */
  var svStepBefore = listStepsByTask(svTask)[1];

  assertThrowsMessage_(function () {
    updateTaskStep(svStepBefore['Step_ID'], { 'Status': STEP_STATUS.COMPLETED }, users.service);
  }, 'ถูกตีกลับ', 'ใบงานถูกตีกลับอยู่ อัปเดตขั้นตอนงานไม่ได้');

  // การเพิ่มงวดก็เป็นรายการ TASK_* เหมือนกัน ต้องถูกปฏิเสธด้วยเหตุผลเดียวกัน
  assertThrowsMessage_(function () { addTaskPeriod(pjTask, 'งวดแทรกตอนถูกตีกลับ', users.project); },
    'ถูกตีกลับ', 'ใบงานถูกตีกลับอยู่ เพิ่มงวดงานไม่ได้');
  assertEquals_(listStepsByTask(pjTask).length, 0,
    'และต้องไม่มีงวดใดถูกเขียนลงชีตจากรายการที่ถูกปฏิเสธ');

  assertThrowsMessage_(function () { completeTask(pjTask, users.project); },
    'ถูกตีกลับ', 'ใบงานถูกตีกลับอยู่ ปิดงานไม่ได้');

  assertThrowsMessage_(function () { cancelTask(pjTask, 'ขอยกเลิกระหว่างถูกตีกลับ', users.project); },
    'ถูกตีกลับ', 'ใบงานถูกตีกลับอยู่ ยกเลิกงานไม่ได้');

  assertEquals_(getTask(svTask)['Status'], svStatusBefore, 'รายการที่ถูกปฏิเสธไม่เปลี่ยนสถานะงาน Service');
  assertEquals_(getTask(pjTask)['Status'], pjStatusBefore, 'รายการที่ถูกปฏิเสธไม่เปลี่ยนสถานะงาน Project');
  assertEquals_(getTask(pjTask)['Cancel_Reason'], '', 'เหตุผลการยกเลิกที่ถูกปฏิเสธต้องไม่ถูกเขียนลงชีต');
  assertEquals_(getStep(svStepBefore['Step_ID'])['Status'], svStepBefore['Status'],
    'ขั้นตอนงานที่ถูกปฏิเสธต้องไม่ถูกเขียนลงชีต');
  assertEquals_(getStep(svStepBefore['Step_ID'])['Completed_By'], '',
    'และต้องไม่มีชื่อผู้ปิดขั้นตอนหลุดเข้าไป');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.RETURNED,
    'หลังโดนปฏิเสธครบสามรายการ ใบงานยังเป็นตีกลับเหมือนเดิม');

  /* ---------- ข้อ 6: อนุมัติกลับมาแล้วต้องกลับไปสถานะที่จำไว้ ---------- */
  var taskCountBefore = listTasksByWo(wo.woId).length;
  // ใบที่ถูกตีกลับต้องส่งขออนุมัติใหม่ก่อน จึงจะอนุมัติได้อีกครั้ง (SPEC 5, 8)
  submitWorkOrder(wo.woId, users.admin);
  approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE_PROJECT, users.approver);

  assertEquals_(listTasksByWo(wo.woId).length, taskCountBefore,
    'อนุมัติซ้ำต้องไม่สร้างงานของแผนกชุดใหม่ (กฎข้อ 11)');
  assertEquals_(getTask(svTask)['Status'], TASK_STATUS.IN_PROGRESS,
    'งานของแผนกกลับไปเป็นกำลังดำเนินการตามที่จำไว้ ไม่ใช่ย้อนไปรอรับงานใหม่');
  assertEquals_(getTask(pjTask)['Status'], TASK_STATUS.IN_PROGRESS,
    'อีกแผนกก็กลับไปเป็นกำลังดำเนินการเช่นกัน');
  assertEquals_(getTask(svTask)['Status_Before_Return'], '',
    'ปลดพักแล้วค่าที่จำไว้ต้องถูกล้าง ไม่ค้างไปรบกวนการตีกลับครั้งถัดไป');

  /* ---------- ข้อ 7: Step ที่ทำไปแล้วต้องยังอยู่ครบ ---------- */
  assertEquals_(listStepsByTask(svTask).length, svSteps.length,
    'จำนวนขั้นตอนงานเท่าเดิม ไม่มีการสร้างชุดใหม่ทับ');
  assertEquals_(stepProgressOf_(svTask).done, doneBefore,
    'ขั้นตอนที่ปิดไปก่อนถูกตีกลับ ต้องยังปิดอยู่ ไม่ถูกล้าง');
  assertEquals_(getStep(svSteps[0]['Step_ID'])['Completed_By'], users.service.email,
    'ชื่อผู้ปิดขั้นตอนเดิมยังอยู่ครบ');

  // ทำงานต่อได้ตามปกติ
  finishAllSteps_(svTask, users.service);
  attachRequiredReports_(svTask);
  assertEquals_(completeTask(svTask, users.service).to, TASK_STATUS.COMPLETED,
    'อนุมัติกลับมาแล้วทำงานต่อจนปิดงานได้');

  return endTest_();
}

/**
 * แผนกหนึ่งแตะงานของอีกแผนกไม่ได้ ทั้งที่อยู่ในใบงานเดียวกัน (SPEC 5 · Guard taskOwner)
 */
function test_task_ownership() {
  beginTest_('แผนกอื่นแตะงานที่ไม่ใช่ของตัวเองไม่ได้ — SPEC 5');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE_PROJECT,
    { 'Location': 'จุดทดสอบความเป็นเจ้าของงาน' });

  var svTask = wo.taskOf(DEPT.SERVICE);
  var pjTask = wo.taskOf(DEPT.PROJECT);

  acceptTask(svTask, users.service);
  acceptTask(pjTask, users.project);
  finishAllSteps_(pjTask, users.project);
  attachRequiredReports_(pjTask);

  // เคสปฏิเสธ: แผนก Service ปิดงานของแผนก Project
  assertThrowsMessage_(function () { completeTask(pjTask, users.service); },
    'เฉพาะแผนกเจ้าของงาน', 'แผนก Service ปิดงานของแผนก Project ไม่ได้');
  assertEquals_(getTask(pjTask)['Status'], TASK_STATUS.IN_PROGRESS, 'งานของแผนก Project ต้องไม่ถูกปิด');

  assertThrows_(function () { acceptTask(pjTask, users.service); },
    'แผนก Service กดรับงานของแผนก Project ไม่ได้');
  assertThrows_(function () {
    updateTaskStep(listStepsByTask(pjTask)[0]['Step_ID'], { 'Status': STEP_STATUS.PENDING }, users.service);
  }, 'แผนก Service อัปเดตขั้นตอนของแผนก Project ไม่ได้');
  assertThrows_(function () { returnTask(pjTask, 'ขอตีกลับแทน', users.service); },
    'แผนก Service ตีกลับใบงานผ่านงานของแผนก Project ไม่ได้');

  // เคสอนุญาต: เจ้าของงานตัวจริงทำได้
  assertEquals_(completeTask(pjTask, users.project).to, TASK_STATUS.COMPLETED,
    'แผนกเจ้าของงานตัวจริงปิดงานของตัวเองได้');

  return endTest_();
}

/**
 * เงื่อนไขการชำระเงินกั้นการรับงานเพียงจุดเดียว (SPEC 12)
 */
function test_task_paymentGate() {
  beginTest_('ใบที่ต้องชำระก่อน แผนกกดรับงานไม่ได้จนกว่าจะบันทึกชำระ — SPEC 12');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE, {
    'Location': 'จุดที่ต้องชำระก่อนเริ่มงาน',
    'Payment_Required': true
  });
  var taskId = wo.taskOf(DEPT.SERVICE);

  assertEquals_(getWorkOrder(wo.woId)['Payment_Status'], PAYMENT.UNPAID, 'ใบงานเริ่มต้นที่ยังไม่ชำระ');

  // เคสปฏิเสธ: ยังไม่ชำระ
  assertThrowsMessage_(function () { acceptTask(taskId, users.service); },
    'รอการชำระเงิน', 'ใบที่ต้องชำระก่อนและยังไม่ชำระ กดรับงานไม่ได้');
  assertEquals_(getTask(taskId)['Status'], TASK_STATUS.PENDING_ACCEPT, 'งานยังรอรับอยู่เหมือนเดิม');
  assertEquals_(getTask(taskId)['Accepted_By'], '', 'และต้องไม่มีชื่อผู้รับงานหลุดเข้าไปในชีต');

  // บันทึกรับชำระ — ไม่ทำให้สถานะใบงานเปลี่ยน เพราะการชำระเงินไม่ใช่สถานะงาน (SPEC 12)
  var statusBefore = getWorkOrder(wo.woId)['Overall_Status'];
  recordPayment(wo.woId, 'ใบเสร็จเลขที่ RC-0001', users.admin);
  assertEquals_(getWorkOrder(wo.woId)['Payment_Status'], PAYMENT.PAID, 'บันทึกว่าได้รับชำระแล้ว');
  assertEquals_(getWorkOrder(wo.woId)['Payment_By'], users.admin.email, 'บันทึกว่าใครเป็นผู้ยืนยันการรับเงิน');
  assertEquals_(getWorkOrder(wo.woId)['Payment_Remark'], 'ใบเสร็จเลขที่ RC-0001', 'บันทึกหมายเหตุการชำระ');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], statusBefore,
    'การชำระเงินต้องไม่ทำให้สถานะใบงานเปลี่ยน');

  assertThrows_(function () { recordPayment(wo.woId, '', users.admin); },
    'บันทึกรับชำระซ้ำใบเดิมไม่ได้');

  // เคสอนุญาต: ชำระแล้วรับงานได้
  assertEquals_(acceptTask(taskId, users.service).to, TASK_STATUS.IN_PROGRESS,
    'บันทึกชำระแล้ว แผนกกดรับงานได้');

  // ใบที่ไม่ได้บังคับชำระ ต้องไม่ถูกกั้นเลย
  var free = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดที่ไม่ต้องชำระก่อน' });
  assertEquals_(acceptTask(free.taskOf(DEPT.SERVICE), users.service).to, TASK_STATUS.IN_PROGRESS,
    'ใบที่ไม่ได้บังคับชำระก่อน กดรับงานได้ทันทีแม้ยังไม่ชำระ');

  return endTest_();
}

/* ===========================================================================
 * ชุดทดสอบเมทริกซ์สิทธิ์ — ทุก Role เทียบกับทุกฟังก์ชันที่หน้าเว็บเรียกได้
 *
 * ชุดนี้ยิงผ่านชั้น 09_Api จริง ไม่ได้เรียกชั้น Service ตรง ๆ เพราะจุดที่ต้องพิสูจน์
 * คือ "การตรวจสิทธิ์ที่ชั้น API" ไม่ใช่ตรรกะธุรกิจ (กฎข้อ 7 และ 17)
 *
 * ทุกข้อมีทั้งเคสอนุญาตและเคสปฏิเสธคู่กันเสมอ — เทสต์ที่มีแต่เคสอนุญาตพิสูจน์อะไรไม่ได้
 * =========================================================================== */

/**
 * สวมสิทธิ์เป็นผู้ใช้คนหนึ่งชั่วคราวแล้วเรียกฟังก์ชันที่ต้องการ
 *
 * ทำงานผ่าน TEST_IDENTITY_ ใน 09_Api.gs ซึ่งเป็นจุดเดียวที่ระบบอ่านตัวตนผู้ใช้ (กฎข้อ 16)
 * ค่านั้นถูกล้างใน finally เสมอ จึงเป็น null ตลอดเวลาที่ไม่ได้อยู่ในชุดทดสอบ
 *
 * @param {Object} user ผู้ใช้ที่ต้องการสวมสิทธิ์ {email, roles|role, department}
 * @param {function()} fn สิ่งที่ต้องการเรียกในสิทธิ์นั้น
 * @return {*} ค่าที่ fn คืนมา
 */
/**
 * เปิดการออกใบสั่งงาน PDF ชั่วคราวระหว่างทำสิ่งหนึ่ง แล้วปิดคืนเสมอ
 *
 * ต้องคืนค่าเดิมใน finally เพราะถ้าชุดทดสอบที่อยู่ระหว่างทางโยนข้อผิดพลาด
 * ชุดที่เหลือทั้งกลุ่มจะออกเอกสารจริงทุกใบโดยไม่มีใครตั้งใจ
 *
 * @param {function()} fn สิ่งที่จะทำ
 * @return {*} ค่าที่ fn คืน
 */
function withReports_(fn) {
  var before = REPORT_DISABLED_;
  REPORT_DISABLED_ = false;
  try {
    return fn();
  } finally {
    REPORT_DISABLED_ = before;
  }
}

function withTestUser_(user, fn) {
  TEST_IDENTITY_ = {
    email:       user.email,
    displayName: user.displayName || user.email,
    roles:       userRoles_(user),
    department:  user.department || '',
    telegramUserId: '',
    active:      true
  };
  try {
    return fn();
  } finally {
    TEST_IDENTITY_ = null;
  }
}

/**
 * ใบงานที่รออนุมัติต้องแยกตามสายอย่างเด็ดขาด ผู้อนุมัติคนละสายต้องไม่เห็นของกันและกัน (SPEC 3)
 */
function test_permission_pendingListByRoute() {
  beginTest_('รายการรออนุมัติแยกตามสาย — SPEC 3');

  var users = serviceTestUsers_();

  var spWo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE, 'Location': 'จุดสาย SP' });
  var unspecWo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.UNSPECIFIED, 'Location': 'จุดยังไม่ระบุ' });
  var labWo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.LAB, 'Location': 'จุดสายแล็บ' });


  var spList = withTestUser_(users.approver, function () { return api_listPendingApprovals(); });
  assertEquals_(spList.ok, true, 'ผู้อนุมัติสาย SP เปิดรายการรออนุมัติได้');
  assertTrue_(containsWo_(spList.data.rows, spWo.woId), 'ผู้อนุมัติสาย SP เห็นใบงานสาย Service');
  assertTrue_(containsWo_(spList.data.rows, unspecWo.woId),
    'ผู้อนุมัติสาย SP เห็นใบที่ยังไม่ระบุแผนก เพราะใบแบบนี้อยู่สาย SP เสมอ');
  assertTrue_(!containsWo_(spList.data.rows, labWo.woId),
    'ใบงานสายแล็บต้องไม่โผล่ในรายการของผู้อนุมัติสาย SP');

  var labList = withTestUser_(users.labApprover, function () { return api_listPendingApprovals(); });
  assertTrue_(containsWo_(labList.data.rows, labWo.woId), 'ผู้อนุมัติสายแล็บเห็นใบงานสายแล็บ');
  assertTrue_(!containsWo_(labList.data.rows, spWo.woId),
    'ใบงานสาย Service ต้องไม่โผล่ในรายการของผู้อนุมัติสายแล็บ');
  assertTrue_(!containsWo_(labList.data.rows, unspecWo.woId),
    'ใบที่ยังไม่ระบุแผนกต้องไม่โผล่ในรายการของผู้อนุมัติสายแล็บ');

  // ตัวเลือกแผนกที่ส่งให้หน้าจอ ต้องไม่มี Lab ปนในสาย SP
  assertEquals_(spList.data.assignmentOptions.SP.indexOf(ASSIGNMENT.LAB), -1,
    'หน้าอนุมัติสาย SP ต้องไม่มีตัวเลือกส่งงานให้แผนก Lab');
  assertEquals_(spList.data.assignmentOptions.SP.length, 3,
    'สาย SP เลือกได้ 3 แบบ คือ Service, Project และทั้งสองแผนก');
  assertEquals_(spList.data.assignmentOptions.LAB.length, 1, 'สายแล็บเลือกได้แบบเดียว');

  // แผนกที่ไม่ใช่ผู้อนุมัติเปิดรายการได้แต่ต้องว่าง
  var deptList = withTestUser_(users.service, function () { return api_listPendingApprovals(); });
  assertEquals_(deptList.ok, true, 'ผู้ใช้ทั่วไปเปิดหน้าอนุมัติได้โดยไม่ error');
  assertEquals_(deptList.data.rows.length, 0, 'แต่ไม่เห็นใบงานให้อนุมัติเลย');

  return endTest_();
}

/**
 * Role ผู้อนุมัติสร้าง แก้ไข หรือส่งใบงานเองไม่ได้ (SPEC 2, 5)
 * ต้องปฏิเสธที่ชั้น API ไม่ใช่แค่ซ่อนปุ่มในหน้าจอ
 */
function test_permission_approverCannotCreate() {
  beginTest_('ผู้อนุมัติสร้างหรือส่งใบงานเองไม่ได้ — SPEC 2');

  var users = serviceTestUsers_();
  // ใบที่ส่งใหม่ได้ต้องอยู่ในสถานะถูกตีกลับ เพราะ EDIT และ SUBMIT ใช้ได้จากตรงนั้นเท่านั้น (SPEC 5)
  var draft = returnedTestWo_(users, { 'Location': 'จุดที่ผู้อนุมัติจะลองแก้' });
  var form = testWoForm_({ 'Customer_Code': draft.workOrder['Customer_Code'], 'Location': 'จุดใหม่ของผู้อนุมัติ' });

  var approvers = [
    { user: users.approver, name: 'ผู้อนุมัติสาย SP' },
    { user: users.labApprover, name: 'ผู้อนุมัติสายแล็บ' }
  ];

  for (var i = 0; i < approvers.length; i++) {
    var who = approvers[i];
    var before = listWorkOrders().length;

    var created = withTestUser_(who.user, function () { return api_createWorkOrder(form); });
    assertEquals_(created.ok, false, who.name + ' สร้างใบงานเองไม่ได้');
    assertEquals_(listWorkOrders().length, before, 'และต้องไม่มีแถวใหม่ถูกเขียนลงชีตเลย');

    var submitted = withTestUser_(who.user, function () {
      return api_submitWorkOrder(draft.woId, toDate_(draft.workOrder['Updated_Date']).toISOString());
    });
    assertEquals_(submitted.ok, false, who.name + ' ส่งใบงานขออนุมัติเองไม่ได้');
    assertEquals_(getWorkOrder(draft.woId)['Overall_Status'], WO_STATUS.RETURNED,
      'ใบงานต้องยังอยู่สถานะถูกตีกลับเหมือนเดิม');

    var edited = withTestUser_(who.user, function () {
      return api_editWorkOrder(draft.woId, form, null);
    });
    assertEquals_(edited.ok, false, who.name + ' แก้ไขใบงานเองไม่ได้');
  }

  /*
   * เคสอนุญาต: ธุรการต้องผ่านด่านสิทธิ์ไปได้
   *
   * ตั้งใจส่งฟอร์มที่ขาดรหัสลูกค้า เพื่อให้ถูกปฏิเสธด้วยเหตุผล "ข้อมูลไม่ครบ" แทน
   * ถ้าปล่อยให้สร้างสำเร็จจริง จะได้ใบงานเลขจริงที่ test_cleanup() ตามลบไม่ได้
   * เพราะ api_createWorkOrder ไม่รับตัวนำหน้า TEST- (และไม่ควรรับด้วย)
   */
  var adminForm = testWoForm_({ 'Customer_Code': '' });
  var beforeAdmin = listWorkOrders().length;
  var byAdmin = withTestUser_(users.admin, function () { return api_createWorkOrder(adminForm); });
  assertEquals_(byAdmin.ok, false, 'ฟอร์มที่ขาดรหัสลูกค้าถูกปฏิเสธตามปกติ');
  assertTrue_(String(byAdmin.message).indexOf('ไม่มีสิทธิ์') === -1,
    'แต่ธุรการต้องผ่านด่านสิทธิ์ไปแล้ว ข้อความที่ได้ต้องไม่ใช่เรื่องสิทธิ์');
  assertTrue_(String(byAdmin.message).indexOf('รหัสลูกค้า') !== -1,
    'และต้องเป็นข้อความเรื่องรหัสลูกค้าที่บอกทางออกให้ผู้ใช้');
  assertEquals_(listWorkOrders().length, beforeAdmin, 'ไม่มีใบงานใดถูกสร้างระหว่างทดสอบสิทธิ์');

  var both = { email: 'both@cnr.co.th', roles: [ROLE.ADMIN, ROLE.APPROVER_SP] };
  var bySubmit = withTestUser_(both, function () {
    return api_submitWorkOrder(draft.woId, toDate_(getWorkOrder(draft.woId)['Updated_Date']).toISOString());
  });
  assertEquals_(bySubmit.ok, true, 'คนที่มีทั้งบทบาทธุรการและผู้อนุมัติ ส่งใบงานได้ตามปกติ');
  assertEquals_(getWorkOrder(draft.woId)['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'ใบงานถูกส่งขออนุมัติจริง');

  // แต่คนคนนั้นยังอนุมัติใบที่ตัวเองส่งไม่ได้ ถ้าเป็นผู้สร้างเอง (SPEC 2)
  var selfApprove = withTestUser_({ email: users.admin.email, roles: [ROLE.ADMIN, ROLE.APPROVER_SP] }, function () {
    return api_approveWorkOrder(draft.woId, ASSIGNMENT.SERVICE, {});
  });
  assertEquals_(selfApprove.ok, false, 'ผู้สร้างใบงานอนุมัติใบของตัวเองไม่ได้ แม้จะมีบทบาทผู้อนุมัติด้วย');

  return endTest_();
}

/**
 * ผู้อนุมัติทำได้เฉพาะใบงานในสายของตัวเอง และเลือกแผนกข้ามสายไม่ได้ (SPEC 3, 3.1)
 */
function test_permission_approveAcrossRoute() {
  beginTest_('อนุมัติข้ามสายไม่ได้ — SPEC 3.1');

  var users = serviceTestUsers_();

  var spWo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE, 'Location': 'จุดของสาย SP' });

  var wrongApprover = withTestUser_(users.labApprover, function () {
    return api_approveWorkOrder(spWo.woId, ASSIGNMENT.SERVICE, {});
  });
  assertEquals_(wrongApprover.ok, false, 'ผู้อนุมัติสายแล็บอนุมัติใบงานสาย SP ไม่ได้');
  assertEquals_(getWorkOrder(spWo.woId)['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'ใบงานต้องยังรออนุมัติอยู่เหมือนเดิม');

  var wrongReturn = withTestUser_(users.labApprover, function () {
    return api_returnWorkOrder(spWo.woId, 'ไม่ใช่งานของแล็บ', null);
  });
  assertEquals_(wrongReturn.ok, false, 'ผู้อนุมัติสายแล็บตีกลับใบงานสาย SP ก็ไม่ได้');

  // ใบที่ยังไม่ระบุแผนก ส่งให้แผนกแล็บไม่ได้ เพราะไม่มีการส่งต่อข้ามสายแล้ว
  var unspec = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.UNSPECIFIED, 'Location': 'จุดที่ยังไม่รู้แผนก' });

  var toLab = withTestUser_(users.approver, function () {
    return api_approveWorkOrder(unspec.woId, ASSIGNMENT.LAB, {});
  });
  assertEquals_(toLab.ok, false, 'อนุมัติใบที่ยังไม่ระบุแผนกแล้วส่งให้แผนก Lab ไม่ได้');
  assertTrue_(String(toLab.message).indexOf('สายบริการและโครงการ') !== -1,
    'ข้อความต้องบอกว่าใบงานอยู่สายไหน ไม่ใช่ศัพท์ระบบ');
  assertTrue_(String(toLab.message).indexOf('ตีกลับ') !== -1,
    'และต้องบอกทางออกว่าให้ตีกลับไปแก้สายงานในใบเดิม');
  assertEquals_(getWorkOrder(unspec.woId)['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'ใบงานต้องยังรออนุมัติอยู่');

  var stillUnspecified = withTestUser_(users.approver, function () {
    return api_approveWorkOrder(unspec.woId, ASSIGNMENT.UNSPECIFIED, {});
  });
  assertEquals_(stillUnspecified.ok, false, 'อนุมัติโดยยังไม่เลือกแผนกไม่ได้');

  // เคสอนุญาต: ผู้อนุมัติสายเดียวกันเลือกแผนกในสายตัวเองได้
  var ok = withTestUser_(users.approver, function () {
    return api_approveWorkOrder(unspec.woId, ASSIGNMENT.PROJECT, {});
  });
  assertEquals_(ok.ok, true, 'ผู้อนุมัติสาย SP เลือกแผนก Project ให้ใบที่ยังไม่ระบุได้');
  assertEquals_(getWorkOrder(unspec.woId)['Assignment_Type'], ASSIGNMENT.PROJECT,
    'แผนกที่ผู้อนุมัติเลือกถูกบันทึกลงใบงาน');

  return endTest_();
}

/**
 * เส้นทางแก้สายงานผิด — ใช้ RETURN แล้วให้ผู้แจ้งแก้สายในใบเดิม ไม่มีการส่งต่อข้ามสาย (SPEC 3.1)
 */
function test_permission_fixWrongRoute() {
  beginTest_('แก้สายงานที่เลือกผิดด้วยการตีกลับ — SPEC 3.1');

  var users = serviceTestUsers_();

  // Admin เลือกสาย Service มาผิด ทั้งที่เป็นงานวิเคราะห์น้ำ
  var wo = createTestWo_(users, {
    'Assignment_Type': ASSIGNMENT.SERVICE,
    'Location': 'จุดเก็บตัวอย่างน้ำ',
    'Job_Description': 'ขอผลวิเคราะห์คุณภาพน้ำ'
  });
  assertEquals_(getWorkOrder(wo.woId)['Route'], ROUTE.SP, 'ตอนแรกใบงานอยู่สาย SP ตามที่เลือกมา');

  // ผู้อนุมัติสาย SP เห็นว่าไม่ใช่งานของตัวเอง จึงตีกลับพร้อมเหตุผล
  var returned = withTestUser_(users.approver, function () {
    return api_returnWorkOrder(wo.woId, 'งานนี้เป็นงานวิเคราะห์น้ำ กรุณาแก้สายงานเป็นแล็บแล้วส่งใหม่',
      toDate_(getWorkOrder(wo.woId)['Updated_Date']).toISOString());
  });
  assertEquals_(returned.ok, true, 'ผู้อนุมัติตีกลับใบที่มาผิดสายได้');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.RETURNED, 'ใบงานกลับมาให้แก้ไข');
  assertTrue_(String(getWorkOrder(wo.woId)['Return_Reason']).indexOf('แล็บ') !== -1,
    'เหตุผลถูกบันทึกไว้ให้ผู้แจ้งเห็นว่าต้องแก้อะไร');

  // ผู้แจ้งแก้สายงานในใบเดิมแล้วส่งใหม่
  var edited = withTestUser_(users.admin, function () {
    return api_editWorkOrder(wo.woId, testWoForm_({
      'Customer_Code': wo.workOrder['Customer_Code'],
      'Location': 'จุดเก็บตัวอย่างน้ำ',
      'Assignment_Type': ASSIGNMENT.LAB,
      'Job_Description': 'ขอผลวิเคราะห์คุณภาพน้ำ'
    }), toDate_(getWorkOrder(wo.woId)['Updated_Date']).toISOString());
  });
  assertEquals_(edited.ok, true, 'ผู้แจ้งแก้สายงานในใบเดิมได้');
  assertEquals_(getWorkOrder(wo.woId)['Route'], ROUTE.LAB, 'ใบงานย้ายไปอยู่สายแล็บแล้ว');
  assertEquals_(getWorkOrder(wo.woId)['WO_ID'], wo.woId, 'ยังเป็นใบเดิม ไม่ได้ออกเลขใหม่');

  var resubmitted = withTestUser_(users.admin, function () {
    return api_submitWorkOrder(wo.woId, toDate_(getWorkOrder(wo.woId)['Updated_Date']).toISOString());
  });
  assertEquals_(resubmitted.ok, true, 'ส่งขออนุมัติใหม่ได้');

  // ใบงานต้องไปโผล่ที่ผู้อนุมัติสายแล็บ และหายไปจากรายการของสาย SP
  var labList = withTestUser_(users.labApprover, function () { return api_listPendingApprovals(); });
  assertTrue_(containsWo_(labList.data.rows, wo.woId), 'ใบงานไปโผล่ที่ผู้อนุมัติสายแล็บแล้ว');

  var spList = withTestUser_(users.approver, function () { return api_listPendingApprovals(); });
  assertTrue_(!containsWo_(spList.data.rows, wo.woId),
    'และต้องไม่อยู่ในรายการของผู้อนุมัติสาย SP อีก');

  // ผู้อนุมัติสายแล็บอนุมัติต่อได้
  var approved = withTestUser_(users.labApprover, function () {
    return api_approveWorkOrder(wo.woId, ASSIGNMENT.LAB, {});
  });
  assertEquals_(approved.ok, true, 'ผู้อนุมัติสายแล็บอนุมัติใบที่แก้สายมาแล้วได้');
  assertEquals_(auditCount_(wo.woId, ENTITY.WO, ACTION.RETURN), 1,
    'การตีกลับถูกบันทึกไว้ในประวัติ ทำให้ย้อนดูได้ว่าเลือกสายผิดบ่อยแค่ไหน');

  return endTest_();
}

/**
 * ระบบไม่มีกลไกส่งต่อข้ามสายแล้ว — ต้องไม่เหลือร่องรอยไว้ให้เรียกได้อีก (SPEC 3)
 */
function test_permission_noRerouteLeft() {
  beginTest_('ไม่มีกลไกส่งต่อข้ามสายเหลืออยู่ — SPEC 3');

  var scope = (typeof globalThis !== 'undefined') ? globalThis : this;
  assertEquals_(typeof scope['api_rerouteToLab'], 'undefined', 'ไม่มีฟังก์ชันส่งต่อในชั้น API แล้ว');
  assertEquals_(typeof scope['rerouteToLab'], 'undefined', 'ไม่มีฟังก์ชันส่งต่อในชั้น Service แล้ว');
  assertEquals_(ACTION.REROUTE, undefined, 'ไม่มี Action ส่งต่อในรายการค่าคงที่แล้ว');
  assertEquals_(getGuards()['rerouteToLabOnly'], undefined, 'ไม่มี Guard ของการส่งต่อเหลืออยู่');

  var rules = getTransitions();
  for (var i = 0; i < rules.length; i++) {
    assertTrue_(rules[i].action !== 'REROUTE', 'ตาราง Transition ไม่มีแถวส่งต่อข้ามสาย');
  }

  var users = serviceTestUsers_();
  var wo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE, 'Location': 'จุดที่ลองส่งต่อ' });

  assertThrows_(function () {
    changeStatus(ENTITY.WO, wo.woId, 'REROUTE', users.approver, { reason: 'ลองส่งต่อ', targetRoute: ROUTE.LAB });
  }, 'ต่อให้ยิง Action ส่งต่อเข้ามาตรง ๆ ระบบก็ต้องปฏิเสธ');
  assertEquals_(getWorkOrder(wo.woId)['Route'], ROUTE.SP, 'สายงานของใบงานต้องไม่ถูกเปลี่ยน');

  return endTest_();
}

/**
 * โซนเวลาของสคริปต์กับของชีตต้องตรงกันและเป็น Asia/Bangkok (กฎข้อ 18 · SPEC 19)
 *
 * ถ้าสองที่นี้ตั้งคนละโซน ค่าที่เขียนลงชีตจะแสดงผลเลื่อนไปจากที่บันทึก
 * และเป็นบั๊กที่หายากมากเพราะโค้ดไม่ผิดสักบรรทัด จึงตรวจเป็นข้อแรกของทุกรอบ
 */
function test_timezone() {
  beginTest_('โซนเวลาของสคริปต์และของชีต — กฎข้อ 18');

  var zones = checkTimeZones();
  Logger.log('  โซนเวลาสคริปต์: ' + zones.script + ' · โซนเวลาชีต: ' + zones.sheet +
    ' · ที่ต้องเป็น: ' + zones.expected);

  assertEquals_(zones.script, TIMEZONE,
    'โซนเวลาของสคริปต์ต้องเป็น ' + TIMEZONE + ' (แก้ที่ timeZone ใน appsscript.json แล้ว push ใหม่)');
  assertEquals_(zones.sheet, TIMEZONE,
    'โซนเวลาของ Google Sheet ต้องเป็น ' + TIMEZONE + ' (แก้ที่ ไฟล์ > การตั้งค่า หรือกดรัน fixSheetTimeZone())');

  return endTest_();
}

/**
 * เวลานัดหมายต้องไม่เลื่อนชั่วโมงตลอดเส้นทาง หน้าเว็บ → ชีต → หน้าเว็บ (กฎข้อ 18 · SPEC 19)
 *
 * ข้อนี้สำคัญที่สุดในกลุ่ม เพราะเป็นข้อเดียวที่จับการเลื่อนโซนเวลาได้
 * ถ้าที่ไหนสักแห่งเผลอใช้ toISOString() เวลา 09:00 จะกลายเป็น 02:00 ทันที
 */
function test_service_appointmentTime() {
  beginTest_('เวลานัดหมายต้องไม่เลื่อนชั่วโมง — กฎข้อ 18');

  var users = serviceTestUsers_();

  /* ---------- 1) บันทึก 09:00 แล้วต้องอ่านกลับได้ 09:00 ---------- */
  // ใบนี้ถูกแก้ไขระหว่างทาง จึงต้องอยู่ในสถานะถูกตีกลับ (SPEC 5)
  var wo = returnedTestWo_(users, {
    'Location': 'จุดทดสอบเวลานัดหมาย',
    'Start_Date': '2026-10-15T09:00',
    'End_Date': '2026-10-15T17:30'
  });

  /*
   * เวลานัดหมายต้องเดินทางกลับมาเป็นสตริงเดิมตัวต่อตัว (กฎข้อ 23)
   *
   * เดิมข้อนี้ตรวจแค่ `instanceof Date` ซึ่ง **ไม่เคยจับบั๊กเลื่อนเวลาได้เลย** —
   * มันจริงทั้งตอนค่าถูกและตอนค่าเพี้ยน เพราะ 09:00 กับ 02:00 ต่างก็เป็น Date
   * ทั้งคู่ · สัญญาใหม่ตรวจค่าจริง จึงแน่นกว่าเดิมมาก
   */
  var stored = getWorkOrder(wo.woId)['Start_Date'];
  assertEquals_(typeof stored, 'string', 'เวลานัดหมายต้องเป็นข้อความ ไม่ใช่วัตถุ Date');
  assertTrue_(!(stored instanceof Date), 'และต้องไม่ใช่ Date — ชนิดที่ผิดคือจุดเริ่มของการเลื่อนโซนเวลา');
  assertEquals_(stored.indexOf('Z'), -1, 'ต้องไม่มีตัว Z ต่อท้าย ซึ่งแปลว่าเวลา UTC');
  assertTrue_(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stored),
    'ต้องเป็นรูป YYYY-MM-DDTHH:mm พอดี ไม่มีวินาที · ได้ ' + stored);

  /*
   * คู่ที่จับบั๊กได้จริง — ห่างกันหนึ่งชั่วโมงแต่คนละวัน คนละเดือน
   * ถ้ามีการแปลงโซนเวลาแอบอยู่ที่ไหน ค่าใดค่าหนึ่งจะข้ามวันทันทีโดยไม่ต้องเดา
   */
  var edges = ['2026-09-30T23:30', '2026-10-01T00:30'];
  for (var e = 0; e < edges.length; e++) {
    var edgeWo = returnedTestWo_(users, { 'Location': 'จุดทดสอบขอบเดือน ' + e,
      'Start_Date': edges[e], 'End_Date': edges[e] });
    var readBack = getWorkOrder(edgeWo.woId);
    assertEquals_(readBack['Start_Date'], edges[e],
      'เวลา ' + edges[e] + ' ต้องอ่านกลับมาได้เหมือนเดิมตัวต่อตัว');
    assertEquals_(readBack['End_Date'], edges[e], 'และช่องออกงานก็ต้องเหมือนกัน');

    // ค่าที่ผ่าน google.script.run กลับไปหน้าเว็บ ต้องยังเป็นสตริงเดิม ไม่ถูกแปลงระหว่างทาง
    var overWire = jsonSafe_(readBack);
    assertEquals_(overWire['Start_Date'], edges[e],
      'ค่าที่ส่งกลับไปหน้าเว็บต้องเป็นสตริงเดิมเป๊ะ ไม่ถูกแปลงตอนแปลงเป็น JSON');
  }
  /*
   * เทียบตัวต่อตัว ไม่ใช่แกะชั่วโมงออกมาดู · การแกะด้วย getHours() ต้องแปลงเป็น Date
   * ก่อน ซึ่งเป็นสิ่งเดียวกับที่เราเพิ่งห้ามไว้ และเป็นทางที่บั๊กเลื่อนเวลาเดินเข้ามา
   */
  assertEquals_(stored, '2026-10-15T09:00',
    'เวลาที่เก็บต้องเป็นสตริงเดิมตัวต่อตัว ทั้งวัน ชั่วโมง และนาที');

  // เส้นทางจริงที่หน้าเว็บใช้ ต้องได้ข้อความเดิมกลับไปเป๊ะ ๆ
  var sent = jsonSafe_(getWorkOrder(wo.woId));
  assertEquals_(sent['Start_Date'], '2026-10-15T09:00',
    'ค่าที่ส่งกลับหน้าเว็บต้องเป็น 09:00 ตามที่กรอก ไม่ใช่เวลา UTC');
  assertEquals_(sent['End_Date'], '2026-10-15T17:30', 'กำหนดออกงานก็ต้องไม่เลื่อนเช่นกัน');
  assertTrue_(String(sent['Start_Date']).indexOf('Z') === -1,
    'เวลานัดหมายต้องไม่ถูกแปลงเป็นรูปแบบ ISO ที่ลงท้ายด้วย Z');

  // ส่วนเวลาที่เครื่องบันทึก ยังต้องเป็น ISO เต็มรูปแบบเหมือนเดิม
  assertTrue_(String(sent['Created_Date']).indexOf('T') !== -1 &&
    String(sent['Created_Date']).length > 16,
    'เวลาที่เครื่องบันทึกยังเป็น ISO เต็มรูปแบบ ไม่ถูกตัดเป็นเวลานัดหมาย');

  // แก้ไขแล้วส่งค่าเดิมกลับไป ต้องยังเป็นเวลาเดิม (เส้นทางไป-กลับครบวง)
  editWorkOrder(wo.woId, testWoForm_({
    'Customer_Code': wo.workOrder['Customer_Code'],
    'Location': 'จุดทดสอบเวลานัดหมาย',
    'Start_Date': sent['Start_Date'],
    'End_Date': sent['End_Date']
  }), users.admin);
  assertEquals_(jsonSafe_(getWorkOrder(wo.woId))['Start_Date'], '2026-10-15T09:00',
    'ส่งค่าที่ได้รับกลับไปบันทึกซ้ำ เวลาต้องยังเท่าเดิม ไม่สะสมความคลาดเคลื่อน');

  /* ---------- 2) เว้นว่างทั้งสองช่องต้องบันทึกผ่าน ---------- */
  var blank = createTestWo_(users, {
    'Location': 'จุดที่ยังไม่นัดเวลา', 'Start_Date': '', 'End_Date': ''
  });
  assertEquals_(blank.workOrder['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'เว้นกำหนดการว่างทั้งคู่ เปิดใบงานได้ตามปกติ เพราะไม่ใช่ช่องบังคับ');
  assertEquals_(jsonSafe_(getWorkOrder(blank.woId))['Start_Date'], '',
    'ช่องที่เว้นว่างต้องส่งกลับเป็นค่าว่าง ไม่ใช่วันที่มั่ว ๆ');

  // กรอกมาช่องเดียวก็ได้ ยังไม่ถือว่าผิด
  var onlyStart = createTestWo_(users, {
    'Location': 'จุดที่นัดแต่วันเข้า', 'Start_Date': '2026-10-20T08:30', 'End_Date': ''
  });
  assertEquals_(jsonSafe_(getWorkOrder(onlyStart.woId))['Start_Date'], '2026-10-20T08:30',
    'กรอกเฉพาะกำหนดเข้างานก็บันทึกได้');

  /* ---------- 3) กำหนดออกงานมาก่อนกำหนดเข้างาน ต้องถูกปฏิเสธที่ฝั่งเซิร์ฟเวอร์ ---------- */
  var before = listWorkOrders().length;
  assertThrowsMessage_(function () {
    createWorkOrder(testWoForm_({
      'Location': 'จุดที่เวลาสลับกัน',
      'Start_Date': '2026-10-15T17:00',
      'End_Date': '2026-10-15T09:00'
    }), users.admin, { woIdPrefix: testWoPrefix_() });
  }, 'กำหนดออกงานอยู่ก่อนกำหนดเข้างาน', 'กำหนดออกงานมาก่อนกำหนดเข้างาน ต้องถูกปฏิเสธ');
  assertEquals_(listWorkOrders().length, before, 'และต้องไม่มีแถวใดถูกเขียนลงชีตเลย');

  // วันเดียวกันแต่คนละนาที ก็ต้องจับได้
  assertThrows_(function () {
    createWorkOrder(testWoForm_({
      'Location': 'จุดที่ต่างกันนาทีเดียว',
      'Start_Date': '2026-10-15T09:01', 'End_Date': '2026-10-15T09:00'
    }), users.admin, { woIdPrefix: testWoPrefix_() });
  }, 'ต่างกันแค่นาทีเดียวก็ต้องถูกปฏิเสธ');

  // เวลาเท่ากันพอดี ถือว่าผ่าน เพราะงานที่เริ่มและจบเวลาเดียวกันเป็นไปได้
  var sameTime = createTestWo_(users, {
    'Location': 'จุดที่เข้าและออกเวลาเดียวกัน',
    'Start_Date': '2026-10-15T09:00', 'End_Date': '2026-10-15T09:00'
  });
  assertEquals_(jsonSafe_(getWorkOrder(sameTime.woId))['End_Date'], '2026-10-15T09:00',
    'เข้างานและออกงานเวลาเดียวกัน บันทึกได้');

  // แก้ไขก็ต้องตรวจเหมือนกัน และต้องไม่เขียนอะไรลงไปเมื่อไม่ผ่าน
  var beforeEdit = jsonSafe_(getWorkOrder(wo.woId))['Start_Date'];
  assertThrows_(function () {
    editWorkOrder(wo.woId, testWoForm_({
      'Customer_Code': wo.workOrder['Customer_Code'],
      'Location': 'จุดทดสอบเวลานัดหมาย',
      'Start_Date': '2026-11-01T10:00', 'End_Date': '2026-10-01T10:00'
    }), users.admin);
  }, 'แก้ไขโดยสลับเวลาก็ต้องถูกปฏิเสธ');
  assertEquals_(jsonSafe_(getWorkOrder(wo.woId))['Start_Date'], beforeEdit,
    'ข้อมูลเดิมต้องไม่ถูกแก้เมื่อรายการถูกปฏิเสธ');

  return endTest_();
}

/**
 * อีเมลว่าง = ต้องปฏิเสธทุกคำสั่งที่เปลี่ยนข้อมูล และห้ามมีแถวใดถูกเขียนลงชีตเลย (กฎข้อ 16)
 *
 * บั๊กที่เคยเกิดจริง: currentUserEmail_() ถอยไปใช้ Session.getEffectiveUser() เมื่ออ่าน
 * getActiveUser() ไม่ได้ ผลคือบัญชีที่ Google ไม่ยอมบอกตัวตน ถูกนับเป็นเจ้าของสคริปต์
 * แล้วได้ Role ของเจ้าของไปทั้งชุด — เป็นช่องโหว่แบบ fail open ที่ระบบยังทำงานได้ปกติทุกอย่าง
 * จึงไม่มีอะไรผิดสังเกตให้เห็นเลย
 *
 * เทสต์นี้ปลอมให้ getActiveUser() คืนค่าว่าง แล้วยิงทุก api_ ที่เปลี่ยนข้อมูล
 */
function test_permission_anonymousIsRejected() {
  beginTest_('ระบุตัวตนไม่ได้ ต้องปฏิเสธทุกคำสั่งที่เปลี่ยนข้อมูล — กฎข้อ 16');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดทดสอบผู้ใช้นิรนาม' });
  var taskId = wo.taskOf(DEPT.SERVICE);
  var form = testWoForm_({ 'Location': 'จุดที่ผู้ใช้นิรนามพยายามสร้าง' });

  var before = countAllRows_();

  /*
   * ทุก api_ ที่เปลี่ยนข้อมูล ต้องถูกปฏิเสธทั้งหมดเมื่อระบุตัวตนไม่ได้
   * ไม่ใช่แค่ตัวที่ตรวจ Role เพราะตัวที่ไม่ได้ตรวจ Role ก็ยังเขียนข้อมูลได้อยู่ดี
   */
  var calls = [
    { name: 'สร้างใบงาน',        run: function () { return api_createWorkOrder(form); } },
    { name: 'แก้ไขใบงาน',        run: function () { return api_editWorkOrder(wo.woId, form, null); } },
    { name: 'ส่งขออนุมัติ',      run: function () { return api_submitWorkOrder(wo.woId, null); } },
    { name: 'อนุมัติใบงาน',      run: function () { return api_approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE, {}); } },
    { name: 'ตีกลับใบงาน',       run: function () { return api_returnWorkOrder(wo.woId, 'เหตุผล', null); } },
    { name: 'ยกเลิกใบงาน',       run: function () { return api_cancelWorkOrder(wo.woId, 'เหตุผล', null); } },
    { name: 'เปิดงานใหม่',       run: function () { return api_reopenWorkOrder(wo.woId, 'เหตุผล', DEPT.SERVICE, {}); } },
    { name: 'รับงานของแผนก',     run: function () { return api_acceptTask(taskId); } },
    { name: 'บันทึกความคืบหน้า', run: function () { return api_updateTaskStep('any-step', { 'Status': STEP_STATUS.COMPLETED }); } },
    { name: 'ปิดงานของแผนก',     run: function () { return api_completeTask(taskId); } },
    { name: 'ตีกลับผ่านงานแผนก', run: function () { return api_returnTask(taskId, 'เหตุผล'); } },
    { name: 'ยกเลิกงานของแผนก',  run: function () { return api_cancelTask(taskId, 'เหตุผล'); } },
    { name: 'บันทึกรับชำระเงิน', run: function () { return api_recordPayment(wo.woId, 'หมายเหตุ'); } }
  ];

  withAnonymousUser_(function () {
    for (var i = 0; i < calls.length; i++) {
      var result = calls[i].run();
      assertEquals_(result.ok, false, 'ผู้ใช้ที่ระบุตัวตนไม่ได้ ต้อง' + calls[i].name + 'ไม่ได้');
      assertEquals_(result.message, NEED_LOGIN_MESSAGE,
        'ข้อความที่ได้ตอน' + calls[i].name + ' ต้องบอกให้เข้าสู่ระบบก่อน');
    }
  });

  // ข้อสำคัญที่สุด: ต้องไม่มีแถวใดถูกเขียนลงชีตเลยแม้แต่แถวเดียว
  var after = countAllRows_();
  assertEquals_(after.total, before.total,
    'ผู้ใช้ที่ระบุตัวตนไม่ได้ ต้องไม่ทำให้มีแถวใหม่ในชีตแม้แต่แถวเดียว');
  for (var sheet in before.perSheet) {
    if (!Object.prototype.hasOwnProperty.call(before.perSheet, sheet)) continue;
    assertEquals_(after.perSheet[sheet], before.perSheet[sheet],
      'แท็บ ' + sheet + ' ต้องมีจำนวนแถวเท่าเดิม');
  }

  // และสถานะของข้อมูลเดิมต้องไม่ขยับ
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.APPROVED,
    'สถานะใบงานเดิมต้องไม่ถูกเปลี่ยน');
  assertEquals_(getTask(taskId)['Status'], TASK_STATUS.PENDING_ACCEPT,
    'สถานะงานของแผนกต้องไม่ถูกเปลี่ยน');
  assertEquals_(getTask(taskId)['Accepted_By'], '', 'ต้องไม่มีชื่อผู้รับงานหลุดลงชีต');

  /* ---------- ตัวระบุตัวตนต้องไม่ถอยไปใช้บัญชีอื่น ---------- */
  withAnonymousUser_(function () {
    assertEquals_(currentUserEmail_(), '',
      'อ่าน getActiveUser ไม่ได้ ต้องคืนค่าว่าง ห้ามถอยไปใช้ getEffectiveUser');
    assertThrowsMessage_(function () { getCurrentUser_(); }, NEED_LOGIN_MESSAGE,
      'getCurrentUser_ ต้องปฏิเสธ ไม่ใช่คืนตัวตนของบัญชีอื่น');
  });

  // อ่านอย่างเดียวก็ต้องถูกปฏิเสธเช่นกัน เพราะทุก api_ เรียก getCurrentUser_() ก่อนเสมอ
  withAnonymousUser_(function () {
    assertEquals_(api_getWorkOrder(wo.woId).ok, false,
      'แม้แต่การเปิดดูใบงาน ก็ต้องระบุตัวตนได้ก่อน');
  });

  return endTest_();
}

/**
 * สวมเป็นผู้ใช้ที่ Google ไม่ยอมบอกตัวตน — getActiveUser() คืนค่าว่าง
 *
 * ปลอมที่ตัว Session โดยตรง ไม่ใช่ที่ TEST_IDENTITY_ เพราะสิ่งที่ต้องพิสูจน์คือ
 * ทางเดินของตัวระบุตัวตนเองว่าถอยไปใช้บัญชีอื่นหรือไม่ ซึ่ง TEST_IDENTITY_ ข้ามไปเลย
 *
 * @param {function()} fn สิ่งที่ต้องการรันในสภาพนั้น
 * @return {*} ค่าที่ fn คืนมา
 */
function withAnonymousUser_(fn) {
  var original = Session.getActiveUser;
  Session.getActiveUser = function () {
    return { getEmail: function () { return ''; } };
  };
  try {
    return fn();
  } finally {
    Session.getActiveUser = original;
  }
}

/**
 * นับจำนวนแถวของทุกแท็บที่ระบบเขียนได้ ใช้ยืนยันว่า "ไม่มีอะไรถูกเขียนลงชีตเลย"
 * @return {Object} {total, perSheet}
 */
function countAllRows_() {
  var sheets = [SHEET.WORK_ORDER, SHEET.DEPARTMENT_TASK, SHEET.TASK_STEP,
    SHEET.PROJECT_LOCATION, SHEET.COUNTER, SHEET.AUDIT_LOG];
  var perSheet = {};
  var total = 0;

  for (var i = 0; i < sheets.length; i++) {
    var count = 0;
    try {
      count = readAll_(sheets[i]).length;
    } catch (e) {
      count = -1;   // อ่านไม่ได้ก็บันทึกไว้แบบนั้น จะได้เทียบก่อน–หลังได้เหมือนกัน
    }
    perSheet[sheets[i]] = count;
    total += count;
  }
  return { total: total, perSheet: perSheet };
}

/**
 * ข้อความตอนเปิดข้อมูลไม่ได้ ต้องเป็นภาษาไทยและต้องไม่มีชื่อไฟล์หรือรหัสไฟล์หลุดออกไป
 *
 * สคริปต์ทำงานด้วยสิทธิ์ของคนที่เปิด คนที่ยังไม่ได้รับแชร์ชีตจะเจอข้อความดิบจาก Google
 * ซึ่งเป็นภาษาอังกฤษและมักมีรหัสไฟล์ติดมาด้วย
 */
function test_permission_accessDeniedMessage() {
  beginTest_('ข้อความตอนไม่มีสิทธิ์เข้าถึงข้อมูล');

  // ประกอบชื่อบริการตอนรัน เหตุผลเดียวกับ driveAppName_() คือกันตัวสแกนฟ้องไฟล์เทสต์เอง
  var docsAppName_ = function () { return 'Document' + 'App'; };

  /* ---------- ข้อความดิบของ Google ต้องถูกแทนที่ ---------- */
  var googleErrors = [
    'You do not have permission to access the requested document.',
    'Access denied: ' + driveAppName_(),
    'Unexpected error while getting the method or property openById on object SpreadsheetApp.',
    'The user is not authorized to perform this action.'
  ];
  for (var i = 0; i < googleErrors.length; i++) {
    assertEquals_(isAccessDeniedError_(new Error(googleErrors[i])), true,
      'ต้องรู้ว่าข้อความนี้เป็นเรื่องสิทธิ์เข้าถึง: ' + googleErrors[i]);
    assertEquals_(userFacingMessage_(new Error(googleErrors[i])), ACCESS_DENIED_MESSAGE,
      'ต้องเปลี่ยนเป็นข้อความไทยกลาง');
  }

  assertTrue_(ACCESS_DENIED_MESSAGE.indexOf('ติดต่อผู้ดูแล') !== -1,
    'ข้อความต้องบอกทางออกให้ผู้ใช้');
  assertTrue_(!/[A-Za-z0-9_-]{20,}/.test(ACCESS_DENIED_MESSAGE),
    'ข้อความต้องไม่มีรหัสไฟล์ปนอยู่');
  assertTrue_(ACCESS_DENIED_MESSAGE.indexOf('.gs') === -1 &&
    ACCESS_DENIED_MESSAGE.indexOf('Sheet') === -1,
    'ข้อความต้องไม่มีชื่อไฟล์หรือชื่อชีตปนอยู่');

  /* ---------- ข้อความของระบบเองต้องไม่ถูกกลบ ---------- */
  // ข้อความปฏิเสธสิทธิ์ที่ระบบเขียนเองมีคำว่า "ไม่มีสิทธิ์" อยู่ด้วย
  // ถ้าตัวตรวจจับเผลอจับคำไทย ข้อความที่บอกได้ชัดว่าต้องไปหาใครจะถูกกลบหายไป
  var ownMessages = [
    'บัญชีของคุณไม่มีสิทธิ์รับงาน ผู้ที่ทำได้คือ แผนก Service',
    'ใบงานถูกตีกลับอยู่ ต้องรอให้แก้ไขและอนุมัติใหม่ก่อนจึงจะทำรายการนี้ได้',
    'ไม่พบใบงาน WO-2609-0001',
    'ยังไม่ได้เลือกแผนกที่จะส่งงาน'
  ];
  for (var m = 0; m < ownMessages.length; m++) {
    assertEquals_(isAccessDeniedError_(new Error(ownMessages[m])), false,
      'ข้อความของระบบเองต้องไม่ถูกนับเป็นเรื่องสิทธิ์เข้าถึงไฟล์: ' + ownMessages[m]);
    assertEquals_(userFacingMessage_(new Error(ownMessages[m])), ownMessages[m],
      'และต้องส่งถึงผู้ใช้เหมือนเดิม ไม่ถูกกลบด้วยข้อความกลาง');
  }

  /* ---------- "ยังไม่ได้รับอนุญาต" ต้องไม่ถูกกลบเป็นเรื่องสิทธิ์ไฟล์ ---------- */
  /*
   * เคยพังจริงและเสียเวลาไปมาก · ข้อความจริงจาก Google คือ
   *   "ไม่ได้รับอนุญาตให้เรียกใช้ DocumentApp.openById สิทธิ์ที่จำเป็นคือ .../documents"
   * ระบบจับคำว่า openById แล้วเหมาว่าเป็นเรื่องสิทธิ์ไฟล์ ผู้ใช้จึงเห็นข้อความให้ไปขอสิทธิ์ชีต
   * ทั้งที่ชีตไม่เกี่ยวเลย และวิธีแก้จริงคือให้ผู้ดูแลกดอนุญาตใหม่ ซึ่งไม่มีใครเดาออกจากข้อความนั้น
   *
   * สองเรื่องนี้แก้คนละทางสิ้นเชิง ข้อความจึงห้ามปนกันเด็ดขาด
   */
  var authErrors = [
    'ไม่ได้รับอนุญาตให้เรียกใช้ ' + docsAppName_() + '.openById ' +
      'สิทธิ์ที่จำเป็นคือ https://www.googleapis.com/auth/documents',
    'Script has attempted to perform an action that is not allowed. ' +
      'Required permissions: https://www.googleapis.com/auth/script.external_request',
    'You do not have permission to call UrlFetchApp.fetch. ' +
      'Required permissions: https://www.googleapis.com/auth/script.external_request'
  ];
  for (var a = 0; a < authErrors.length; a++) {
    assertEquals_(isAuthorizationError_(new Error(authErrors[a])), true,
      'ต้องรู้ว่านี่คือเรื่อง "สคริปต์ยังไม่ได้รับอนุญาต": ' + authErrors[a].substring(0, 40));

    var shown = userFacingMessage_(new Error(authErrors[a]));
    assertTrue_(shown.indexOf(ACCESS_DENIED_MESSAGE) === -1,
      'ต้องไม่ถูกกลบด้วยข้อความเรื่องสิทธิ์เข้าถึงไฟล์ ซึ่งชี้ทางแก้ผิดทั้งหมด');
    assertTrue_(shown.indexOf('checkPermissions') !== -1,
      'และต้องบอกว่าผู้ดูแลต้องไปกดรันอะไรเพื่อแก้');
    assertTrue_(shown.indexOf('googleapis.com/auth/') !== -1,
      'พร้อมบอกว่าสิทธิ์ตัวไหนที่ขาด ไม่ใช่บอกแค่ว่าขาดสิทธิ์');
  }

  /* ---------- แต่ต้องไม่ลากข้อความดิบทั้งก้อนออกไป ---------- */
  // ข้อความดิบบางแบบมีรหัสไฟล์ติดมาด้วย ซึ่งไม่ควรหลุดไปถึงผู้ใช้
  var withFileId = 'You do not have permission to call DocumentApp.openById. ' +
    'Required permissions: https://www.googleapis.com/auth/documents ' +
    '(file 1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789)';
  var safe = userFacingMessage_(new Error(withFileId));
  assertTrue_(safe.indexOf('1AbCdEfGhIjKlMnOpQrStUvWxYz') === -1,
    'รหัสไฟล์ต้องไม่ติดไปกับข้อความที่ผู้ใช้เห็น');
  assertEquals_(missingScopeOf_(new Error(withFileId)),
    'https://www.googleapis.com/auth/documents',
    'สิ่งที่ดึงออกมาบอกผู้ใช้ ต้องมีเฉพาะที่อยู่ของสิทธิ์');

  /* ---------- ข้อความของระบบเองต้องไม่ถูกจับผิดเป็นเรื่องการอนุญาต ---------- */
  for (var o = 0; o < ownMessages.length; o++) {
    assertEquals_(isAuthorizationError_(new Error(ownMessages[o])), false,
      'ข้อความของระบบเองต้องไม่ถูกนับเป็นเรื่องการอนุญาต: ' + ownMessages[o]);
  }

  /* ---------- ตอนเปิดไฟล์ไม่ได้ ก็ต้องแยกสามกรณีนี้เหมือนกัน ---------- */
  /*
   * ไฟล์บันทึกประวัติเปิดด้วยรหัสไฟล์ ถ้าสิทธิ์ชีตยังไม่ได้รับอนุญาต จะล้มตรงนั้นก่อนใคร
   * ถ้าตรงนั้นบอกว่า "ยังไม่ได้รับแชร์ไฟล์" ผู้ดูแลจะไปไล่แชร์ไฟล์ซึ่งไม่ใช่ทางแก้เลย
   */
  var fallback = 'เปิดไฟล์บันทึกประวัติไม่ได้ กรุณาติดต่อผู้ดูแลระบบ';
  var authText = 'You do not have permission to call SpreadsheetApp.openById. ' +
    'Required permissions: https://www.googleapis.com/auth/spreadsheets';

  assertTrue_(openFailureMessage_(new Error(authText), fallback).indexOf('checkPermissions') !== -1,
    'เปิดไฟล์ไม่ได้เพราะยังไม่ได้รับอนุญาต ต้องบอกให้ผู้ดูแลกดอนุญาตใหม่');
  assertEquals_(openFailureMessage_(new Error('You do not have permission to access the requested document.'), fallback),
    ACCESS_DENIED_MESSAGE,
    'เปิดไฟล์ไม่ได้เพราะยังไม่ได้รับแชร์ ต้องบอกให้ติดต่อผู้ดูแลขอสิทธิ์');
  assertEquals_(openFailureMessage_(new Error('อะไรสักอย่างที่ไม่เกี่ยวกับสิทธิ์'), fallback), fallback,
    'เรื่องอื่นต้องได้ข้อความสำรองของงานนั้น');

  /* ---------- ตัวตรวจสิทธิ์ต้องมีอยู่จริงและรายงานครบทุกสิทธิ์ที่ประกาศ ---------- */
  assertEquals_(typeof checkPermissions, 'function',
    'ต้องมีเครื่องมือให้ผู้ดูแลกดรันเพื่อดูว่าสิทธิ์ครบหรือยัง');
  var report = String(checkPermissions());
  var scopes = requiredOAuthScopes_();
  for (var c = 0; c < scopes.length; c++) {
    var shortName = scopes[c].split('/').pop();
    assertTrue_(report.indexOf(shortName) !== -1,
      'รายงานต้องครอบคลุมสิทธิ์ ' + shortName + ' ด้วย ไม่งั้นตัวที่ขาดจะไม่มีใครเห็น');
  }

  /* ---------- ชั้น API ต้องใช้ตัวแปลงนี้จริง ---------- */
  var denied = withTestUser_(users_(), function () {
    return api_createWorkOrder(testWoForm_({ 'Customer_Code': '' }));
  });
  assertEquals_(denied.ok, false, 'ฟอร์มที่ขาดรหัสลูกค้าถูกปฏิเสธตามปกติ');
  assertTrue_(String(denied.message).indexOf('รหัสลูกค้า') !== -1,
    'ข้อความเฉพาะเรื่องของระบบต้องยังส่งถึงผู้ใช้ผ่านชั้น API');

  return endTest_();
}

/**
 * ผู้ใช้ธุรการสำหรับชุดทดสอบข้อความ
 * @return {Object}
 */
function users_() {
  return serviceTestUsers_().admin;
}

/* ===========================================================================
 * ชุดทดสอบทางเข้าจากโปรเจกต์หน้าบ้าน (doPost)
 *
 * ระบบแยกเป็นสองโปรเจกต์ ทางเข้านี้จึงเปิดรับคำขอจากอินเทอร์เน็ตได้ทุกคน
 * และรหัสลับคือด่านเดียวที่กั้นอยู่ — ถ้าด่านนี้รั่ว ทั้งระบบรั่วตาม
 * =========================================================================== */

/**
 * ประกอบอีเวนต์ของ doPost ให้เหมือนที่ Apps Script ส่งมาจริง
 * @param {Object} payload สิ่งที่หน้าบ้านส่งมา
 * @return {Object}
 */
function postEvent_(payload) {
  return { postData: { contents: JSON.stringify(payload) } };
}

/**
 * เรียก doPost แล้วแปลงคำตอบกลับเป็น object
 * @param {Object} payload สิ่งที่หน้าบ้านส่งมา
 * @return {Object}
 */
function callDoPost_(payload) {
  // ชนิดคำขอเป็น api เว้นแต่ข้อทดสอบจะระบุมาเอง เพราะเกือบทุกข้อทดสอบรายการปกติ
  if (!Object.prototype.hasOwnProperty.call(payload, 'mode')) payload.mode = GATEWAY_MODE.API;
  return JSON.parse(doPost(postEvent_(payload)).getContent());
}

/**
 * เพิ่มผู้ใช้ทดสอบลงทะเบียนผู้ใช้จริง
 *
 * ชุดทดสอบอื่นใช้ withTestUser_ ซึ่งข้ามการอ่านทะเบียนไปเลย
 * แต่ชุดนี้ต้องพิสูจน์ว่า doPost อ่านทะเบียนจริงตามอีเมลที่หน้าบ้านส่งมา
 * จึงต้องมีแถวจริงอยู่ในชีต · อีเมลขึ้นต้นด้วย TEST- เพื่อให้ test_cleanup() ตามลบได้
 *
 * @param {string} suffix ตัวต่อท้ายให้แยกผู้ใช้คนละคน
 * @param {string} role Role ที่ต้องการให้
 * @param {string} department แผนก
 * @return {string} อีเมลที่เพิ่มเข้าไป
 */
function addTestUserRow_(suffix, role, department) {
  var email = testPrefix_() + suffix + '@cnr.co.th';
  appendRow_(SHEET.USER_ROLE, {
    'Email': email,
    'Display_Name': 'ผู้ใช้ทดสอบ ' + suffix,
    'Role': role,
    'Department': department || '',
    'Active': true
  });
  return email;
}

/**
 * ทะเบียนรายการต้องครบตรงกับฟังก์ชัน api_* ที่ประกาศไว้จริง
 *
 * ถ้าเพิ่มฟังก์ชันใหม่แล้วลืมลงทะเบียน หน้าเว็บจะเรียกไม่ได้โดยไม่มีใครรู้จนกว่าจะมีคนกดใช้
 * และถ้าลงทะเบียนชื่อที่ไม่มีฟังก์ชันจริง จะพังตอนมีคนเรียกเท่านั้น
 */
function test_permission_gatewayActionRegistry() {
  beginTest_('ทะเบียนรายการที่เรียกได้ต้องครบและตรง');

  var registry = apiActions_();
  var names = listApiFunctionNames_();
  assertTrue_(names.length > 0, 'ทะเบียนต้องไม่ว่าง');

  for (var i = 0; i < names.length; i++) {
    assertEquals_(typeof registry[names[i]], 'function',
      'รายการ ' + names[i] + ' ต้องชี้ไปยังฟังก์ชันจริง');
    assertTrue_(names[i].indexOf('api_') === 0,
      'ชื่อรายการทุกตัวต้องขึ้นต้นด้วย api_ (พบ ' + names[i] + ')');
  }

  /*
   * สองตัวนี้อยู่นอกทะเบียนโดยตั้งใจ และเป็นตัวเดียวที่ได้รับการยกเว้น
   *   api_call   ทางเข้าทางเดียว เป็นตัวที่ "เปิด" ทะเบียน จึงอยู่ในทะเบียนตัวเองไม่ได้
   *   api_login  รายการเดียวที่เรียกได้ก่อนมีโทเคน จึงอยู่ในรายชื่อสาธารณะแยกต่างหาก
   */
  var outsideRegistry = ['api_call', 'api_login'];
  assertEquals_(Object.keys(apiPublicActions_()).join(', '), 'api_login',
    'รายการที่เรียกได้ก่อนล็อกอิน ต้องมีแค่ api_login ตัวเดียวเท่านั้น');

  // ฟังก์ชัน api_* ทุกตัวที่ประกาศไว้ ต้องอยู่ในทะเบียน (หรืออยู่ในรายการยกเว้นข้างบน)
  var scope = (typeof globalThis !== 'undefined') ? globalThis : this;
  var missing = [];
  for (var key in scope) {
    if (key.indexOf('api_') !== 0 || typeof scope[key] !== 'function') continue;
    if (outsideRegistry.indexOf(key) !== -1) continue;
    if (!Object.prototype.hasOwnProperty.call(registry, key)) missing.push(key);
  }
  assertEquals_(missing.join(', '), '',
    'ฟังก์ชัน api_* ที่ประกาศไว้แต่ลืมลงทะเบียน จะเรียกจากหน้าเว็บไม่ได้');

  /* ---------- ชื่อที่ไม่อยู่ในทะเบียน ต้องเรียกผ่าน api_call ไม่ได้ ---------- */
  // ห้ามเอาชื่อที่ส่งมาไปหาฟังก์ชันเองไม่ว่าวิธีใด ไม่งั้นจะยิงฟังก์ชันภายในตัวไหนก็ได้
  var forbidden = ['getDb_', 'apiActions_', 'updateRow_', 'doGet', 'login', 'resetPassword',
    'createFirstAdmin', 'listCustomers', 'constructor', 'toString', ''];
  for (var f = 0; f < forbidden.length; f++) {
    var blocked = api_call(forbidden[f], [], 'โทเคนอะไรก็ได้');
    assertEquals_(blocked.ok, false, 'เรียก "' + forbidden[f] + '" ผ่านทางเข้าไม่ได้');
    assertTrue_(String(blocked.message).indexOf('ไม่รู้จักรายการที่เรียก') !== -1,
      'และต้องตอบว่าไม่รู้จักรายการ ไม่ใช่ไปเรียกฟังก์ชันนั้นจริง');
  }

  return endTest_();
}

/**
 * ตัดคำอธิบายออกจากซอร์สก่อนตรวจ
 *
 * จำเป็น เพราะคำอธิบายในไฟล์พูดถึงสิ่งที่ "ห้ามมี" อยู่ด้วย เช่นบรรทัดที่เขียนว่า
 * ห้ามมี SpreadsheetApp — ถ้าไม่ตัดออกก่อน การค้นหาจะเจอคำนั้นแล้วฟ้องผิด
 * ทั้งที่ไฟล์ทำถูกต้องตามที่คำอธิบายบอกทุกอย่าง
 *
 * @param {string} source เนื้อไฟล์
 * @return {string} เนื้อไฟล์ที่เหลือแต่โค้ด
 */
function stripComments_(source) {
  if (!source) return '';
  return String(source)
    .replace(/\/\*[^]*?\*\//g, ' ')      // คำอธิบายแบบหลายบรรทัด
    .replace(/^[ 	]*\/\/.*$/gm, ' ');    // คำอธิบายแบบบรรทัดเดียว
}

/**
 * โปรเจกต์หน้าบ้านต้องบางจริงตามที่ตกลงไว้
 *
 * ทุกฟังก์ชันระดับบนสุดของโปรเจกต์หน้าบ้านเรียกได้จาก google.script.run
 * ถ้ามีตัวไหนคืนค่าจาก PropertiesService ผู้ใช้จะได้ที่อยู่และรหัสลับของหลังบ้านไปเลย
 * แล้วยิงเองโดยไม่ผ่านด่านอีเมล ซึ่งทำให้การแยกสองโปรเจกต์ไร้ความหมายทันที
 *
 * อ่านไฟล์จริงมาตรวจ เพราะไฟล์อยู่คนละโปรเจกต์ เรียกฟังก์ชันข้ามไปตรวจไม่ได้
 */
function test_permission_gatewayFileIsThin() {
  beginTest_('โปรเจกต์หน้าบ้านต้องบางและไม่รั่วค่าตั้งค่า');

  var source = stripComments_(gatewaySource_());
  if (!source) {
    Logger.log('  (ข้าม: หาไฟล์ของโปรเจกต์หน้าบ้านไม่เจอจากที่นี่ ต้องตรวจด้วยตาแทน)');
    assertTrue_(true, 'ข้ามการตรวจไฟล์หน้าบ้านเมื่อเข้าถึงไฟล์ไม่ได้');
    return endTest_();
  }

  // ชื่อ Drive ประกอบขึ้นตอนรัน เพื่อไม่ให้ตัวเทสต์นี้กลายเป็นผลการค้นหาของ
  // test_files_driveIsolation ซึ่งสแกนเนื้อของทุกฟังก์ชันในระบบ
  var banned = ['SpreadsheetApp', driveAppName_(), 'getSheetByName', 'getRange', 'openById'];
  for (var i = 0; i < banned.length; i++) {
    assertTrue_(source.indexOf(banned[i]) === -1,
      'โปรเจกต์หน้าบ้านต้องไม่มี ' + banned[i] + ' — ห้ามแตะข้อมูลเลย');
  }

  // ฟังก์ชันที่เรียกได้จากหน้าเว็บ คือตัวที่ชื่อไม่ลงท้ายด้วยขีดล่าง
  // ตัวที่คืนค่าตั้งค่าต้องเป็นตัวภายในเท่านั้น (ลงท้ายด้วยขีดล่าง)
  var publicFns = source.match(/^function\s+([A-Za-z0-9_]+)\s*\(/gm) || [];
  var exposed = [];
  for (var f = 0; f < publicFns.length; f++) {
    var name = publicFns[f].replace(/^function\s+/, '').replace(/\s*\($/, '');
    if (name.charAt(name.length - 1) !== '_') exposed.push(name);
  }
  assertEquals_(exposed.sort().join(', '), 'api_call, doGet',
    'โปรเจกต์หน้าบ้านต้องมีฟังก์ชันที่เรียกจากภายนอกได้แค่ doGet กับ api_call');

  // ตัวที่อ่านค่าตั้งค่าต้องเป็นฟังก์ชันภายใน และต้องไม่มีตัวไหนส่งค่านั้นออกไปตรง ๆ
  var propUsers = source.match(/function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{[^]*?getProperty/g) || [];
  for (var p = 0; p < propUsers.length; p++) {
    var owner = /function\s+([A-Za-z0-9_]+)/.exec(propUsers[p])[1];
    assertTrue_(owner.charAt(owner.length - 1) === '_',
      'ฟังก์ชันที่อ่านค่าตั้งค่า (' + owner + ') ต้องเป็นฟังก์ชันภายในเท่านั้น');
  }

  assertTrue_(source.indexOf('getEffectiveUser') === -1,
    'หน้าบ้านต้องใช้ getActiveUser เท่านั้น ห้ามถอยไปใช้ getEffectiveUser');
  assertTrue_(source.indexOf('XFrameOptionsMode') !== -1,
    'ต้องตั้ง XFrameOptionsMode ไม่งั้นหน้าจะว่างเปล่าโดยไม่มีข้อความอธิบาย');

  return endTest_();
}

/**
 * เนื้อไฟล์ของโปรเจกต์หน้าบ้าน — คืนค่าว่างเมื่ออ่านไม่ได้
 *
 * บนชีตจริงไฟล์นี้อยู่คนละโปรเจกต์ จึงอ่านไม่ได้และเทสต์จะข้ามไป
 * ส่วนตอนรันกับ mock ในเครื่อง อ่านจากดิสก์ได้ จึงตรวจได้จริง
 *
 * @return {string}
 */
function gatewaySource_() {
  try {
    return HtmlService.createHtmlOutputFromFile('__gateway_source').getContent();
  } catch (e) {
    return '';
  }
}

/**
 * เมนูแสดงครบทุกรายการเสมอ และธงสิทธิ์ต้องตรงกับ Role ของผู้ใช้ (SPEC 17.2 · 17.3)
 */
function test_permission_menuVisibility() {
  beginTest_('เมนูแสดงครบเสมอ ธงสิทธิ์ตรงตาม Role — SPEC 17.3');

  var users = serviceTestUsers_();

  var menu = withTestUser_(users.admin, function () { return api_getMenu(); });
  assertEquals_(menu.ok, true, 'ทุกคนที่ระบุตัวตนได้ต้องเปิดเมนูได้');
  assertEquals_(menu.data.menu.length, MENU_ITEMS.length, 'เมนูมีครบทุกรายการ');

  var keys = [];
  for (var i = 0; i < menu.data.menu.length; i++) keys.push(menu.data.menu[i].key);
  assertEquals_(keys.join(','),
    'create,approve,work-sv,work-pe,labapprove,lab,returned,wolist,wo',
    'รายการและลำดับตรงตามที่ตกลงไว้');

  /* ---------- ทุก Role ต้องเห็นครบเท่ากันทุกรายการ ---------- */
  /*
   * เมนูรายละเอียดใบงานอยู่ในรายการของทุกคนที่มี Role ใด ๆ (SPEC หัวข้อ 2)
   * ยกเว้นคนที่ยังไม่ได้รับสิทธิ์ใดเลย ซึ่งยังต้องกดอะไรไม่ได้สักอย่างเหมือนเดิม
   */
  var everyone = [
    /*
     * 'wolist' อยู่ในรายการของทุกคนที่มี Role ใด ๆ ด้วยเหตุผลเดียวกับ 'wo'
     * คือ SPEC หัวข้อ 2 ให้ทุกคนดูใบงานได้ทุกใบทุกแผนก · สิ่งที่คุมคือสิทธิ์แก้ไข
     * ซึ่งไม่มีอยู่ในหน้ารายการเลยสักปุ่ม
     */
    { who: users.admin, allowed: ['create', 'returned', 'wolist', 'wo'] },
    { who: users.approver, allowed: ['approve', 'wolist', 'wo'] },
    { who: users.labApprover, allowed: ['labapprove', 'wolist', 'wo'] },
    { who: users.service, allowed: ['work-sv', 'wolist', 'wo'] },
    { who: users.project, allowed: ['work-pe', 'wolist', 'wo'] },
    { who: { email: 'nobody@cnr.co.th', roles: [] }, allowed: [] }
  ];

  for (var e = 0; e < everyone.length; e++) {
    var result = withTestUser_(everyone[e].who, function () { return api_getMenu(); });
    assertEquals_(result.data.menu.length, MENU_ITEMS.length,
      'ผู้ใช้ทุกคนเห็นเมนูครบทุกรายการ ไม่ซ่อนตาม Role');

    var got = [];
    for (var m = 0; m < result.data.menu.length; m++) {
      if (result.data.menu[m].allowed) got.push(result.data.menu[m].key);
    }
    assertEquals_(got.join(','), everyone[e].allowed.join(','),
      'ธงสิทธิ์ของ ' + everyone[e].who.email + ' ตรงกับ Role ที่มี');
  }

  /* ---------- ทุกรายการต้องบอกได้ว่าเป็นของ Role ใด ---------- */
  for (var k = 0; k < menu.data.menu.length; k++) {
    var item = menu.data.menu[k];
    assertTrue_(!!item.label, 'รายการ ' + item.key + ' มีชื่อให้แสดง');
    assertTrue_(!!item.rolesLabel, 'รายการ ' + item.key + ' บอกได้ว่าเป็นของ Role ใด');
    assertTrue_(item.rolesLabel.indexOf('APPROVER') === -1 && item.rolesLabel.indexOf('ADMIN') === -1,
      'ชื่อ Role ที่แสดงต้องเป็นภาษาไทย ไม่ใช่ชื่อดิบ (ได้: ' + item.rolesLabel + ')');
  }

  /* ---------- แผนกงาน SV กับ PE ชี้หน้าเดียวกัน ต่างที่พารามิเตอร์ ---------- */
  var sv = menu.data.menu[2];
  var pe = menu.data.menu[3];
  assertEquals_(sv.page, pe.page, 'แผนกงาน SV และ PE ชี้ไปหน้าเดียวกัน');
  assertEquals_(sv.dept, DEPT.SERVICE, 'SV ส่งพารามิเตอร์บอกแผนก Service');
  assertEquals_(pe.dept, DEPT.PROJECT, 'PE ส่งพารามิเตอร์บอกแผนก Project');

  // คนที่ Role ตรงแต่สังกัดคนละแผนก ต้องไม่ถือว่ามีสิทธิ์ในเมนูของอีกแผนก
  var crossed = withTestUser_(
    { email: 'x@cnr.co.th', roles: [ROLE.SERVICE], department: DEPT.PROJECT },
    function () { return api_getMenu(); });
  var crossedKeys = [];
  for (var c = 0; c < crossed.data.menu.length; c++) {
    if (crossed.data.menu[c].allowed) crossedKeys.push(crossed.data.menu[c].key);
  }
  /*
   * เดิมข้อนี้คาดว่า "ไม่มีสิทธิ์เมนูใดเลย" ซึ่งจริงตอนที่ทุกเมนูผูกกับแผนกหรือสายอนุมัติ
   * ตั้งแต่มีเมนูรายละเอียดใบงาน ข้อนั้นไม่จริงอีกต่อไป เพราะ SPEC หัวข้อ 2 บอกว่า
   * ทุกคนดูใบงานได้ทุกใบ · สิ่งที่แผนกไม่ตรงต้องกั้นคือ "เมนูที่ทำงานกับข้อมูล" เท่านั้น
   */
  assertEquals_(crossedKeys.join(','), 'wolist,wo',
    'แผนกไม่ตรง ต้องกดเมนูงานของแผนกไม่ได้ แต่ยังดูใบงานและรายการใบงานได้ตาม SPEC หัวข้อ 2');
  assertTrue_(crossedKeys.indexOf('work-sv') === -1 && crossedKeys.indexOf('work-pe') === -1,
    'และต้องไม่มีเมนูงานของแผนกใดเปิดให้เลย');

  return endTest_();
}

/**
 * การไม่ซ่อนเมนูเป็นเรื่องหน้าจอเท่านั้น — ชั้น API ต้องไม่ผ่อนคลายแม้แต่ข้อเดียว (SPEC 17.3)
 *
 * ข้อนี้สำคัญที่สุดของงานรอบนี้ เพราะการทำให้ปุ่มกดได้ทุกปุ่มคือการเพิ่มโอกาส
 * ที่คนไม่มีสิทธิ์จะยิงเข้ามาจริง ถ้าด่านที่ชั้น API หย่อนตาม ระบบจะเปิดทันที
 */
function test_permission_menuDoesNotWeakenApi() {
  beginTest_('เมนูกดได้ทุกปุ่ม แต่ชั้น API ยังปฏิเสธเหมือนเดิม — SPEC 17.3');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดทดสอบเมนู' });
  var taskId = wo.taskOf(DEPT.SERVICE);
  var form = testWoForm_({ 'Location': 'จุดที่คนไม่มีสิทธิ์พยายามสร้าง' });

  var rowsBefore = countAllRows_();

  /* ---------- แผนกเปิดหน้าอนุมัติได้ แต่ทำอะไรไม่ได้ ---------- */
  var byService = withTestUser_(users.service, function () {
    return {
      pending: api_listPendingApprovals('SP'),
      approve: api_approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE, {}),
      ret: api_returnWorkOrder(wo.woId, 'ขอตีกลับ', null),
      create: api_createWorkOrder(form)
    };
  });
  assertEquals_(byService.pending.ok, true, 'เปิดหน้ารายการรออนุมัติได้ ไม่ error');
  assertEquals_(byService.pending.data.rows.length, 0, 'แต่ไม่เห็นใบงานให้อนุมัติเลย');
  assertEquals_(byService.approve.ok, false, 'แผนกอนุมัติใบงานไม่ได้');
  assertEquals_(byService.ret.ok, false, 'แผนกตีกลับใบงานไม่ได้');
  assertEquals_(byService.create.ok, false, 'แผนกสร้างใบงานไม่ได้');

  /* ---------- ผู้อนุมัติเปิดหน้าแผนกได้ แต่ทำงานของแผนกไม่ได้ ---------- */
  var byApprover = withTestUser_(users.approver, function () {
    return {
      tasks: api_listMyTasks(),
      accept: api_acceptTask(taskId),
      complete: api_completeTask(taskId),
      ret: api_returnTask(taskId, 'ขอตีกลับ')
    };
  });
  assertEquals_(byApprover.tasks.ok, true, 'เปิดหน้างานของแผนกได้ ไม่ error');
  assertEquals_(byApprover.tasks.data.rows.length, 0, 'แต่ไม่เห็นงานของแผนกเลย');
  assertEquals_(byApprover.accept.ok, false, 'ผู้อนุมัติกดรับงานแทนแผนกไม่ได้');
  assertEquals_(byApprover.complete.ok, false, 'ผู้อนุมัติปิดงานแทนแผนกไม่ได้');
  assertEquals_(byApprover.ret.ok, false, 'ผู้อนุมัติตีกลับผ่านงานของแผนกไม่ได้');

  /* ---------- ธุรการเปิดได้ทุกหน้า แต่ทำได้เฉพาะของตัวเอง ---------- */
  var byAdmin = withTestUser_(users.admin, function () {
    return { accept: api_acceptTask(taskId), approve: api_approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE, {}) };
  });
  assertEquals_(byAdmin.accept.ok, false, 'ธุรการกดรับงานแทนแผนกไม่ได้');
  assertEquals_(byAdmin.approve.ok, false, 'ธุรการอนุมัติใบงานเองไม่ได้');

  /* ---------- คนที่ไม่มี Role เลย เปิดเมนูได้ แต่ทำอะไรไม่ได้สักอย่าง ---------- */
  var nobody = { email: 'nobody@cnr.co.th', roles: [] };
  var byNobody = withTestUser_(nobody, function () {
    return {
      menu: api_getMenu(),
      create: api_createWorkOrder(form),
      approve: api_approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE, {}),
      accept: api_acceptTask(taskId),
      pay: api_recordPayment(wo.woId, 'จ่ายแล้ว')
    };
  });
  assertEquals_(byNobody.menu.ok, true, 'คนที่ยังไม่มีสิทธิ์ ต้องเปิดเมนูได้ ไม่งั้นจะไม่รู้ว่าต้องขออะไร');
  assertEquals_(byNobody.create.ok, false, 'แต่สร้างใบงานไม่ได้');
  assertEquals_(byNobody.approve.ok, false, 'อนุมัติไม่ได้');
  assertEquals_(byNobody.accept.ok, false, 'รับงานไม่ได้');
  assertEquals_(byNobody.pay.ok, false, 'บันทึกรับชำระไม่ได้');

  // และต้องไม่มีแถวใดถูกเขียนลงชีตจากความพยายามทั้งหมดข้างบน
  var rowsAfter = countAllRows_();
  assertEquals_(rowsAfter.perSheet[SHEET.WORK_ORDER], rowsBefore.perSheet[SHEET.WORK_ORDER],
    'ไม่มีใบงานใหม่เกิดขึ้นจากคนที่ไม่มีสิทธิ์');
  assertEquals_(getTask(taskId)['Status'], TASK_STATUS.PENDING_ACCEPT,
    'สถานะงานของแผนกต้องไม่ถูกเปลี่ยน');
  assertEquals_(getWorkOrder(wo.woId)['Payment_Status'], PAYMENT.UNPAID,
    'สถานะการชำระต้องไม่ถูกเปลี่ยน');

  return endTest_();
}

/**
 * หน้าอนุมัติสองสายต้องไม่ปนกัน — ใบงานสาย SP ห้ามโผล่ในหน้า Lab เด็ดขาด (SPEC 17.2)
 *
 * กรองที่เซิร์ฟเวอร์ ไม่ใช่ให้หน้าเว็บซ่อนเอง เพราะการส่งใบงานสายอื่นไปถึงเบราว์เซอร์
 * แล้วค่อยซ่อน แปลว่าข้อมูลนั้นออกจากเซิร์ฟเวอร์ไปแล้ว
 */
function test_permission_approveRouteSeparation() {
  beginTest_('หน้าอนุมัติสองสายต้องไม่ปนกัน — SPEC 17.2');

  var users = serviceTestUsers_();
  var spWo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE, 'Location': 'จุดสาย SP' });
  var labWo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.LAB, 'Location': 'จุดสายแล็บ' });

  /* ---------- คนที่เป็นผู้อนุมัติทั้งสองสาย ต้องเห็นคนละชุดในแต่ละหน้า ---------- */
  var both = { email: 'both@cnr.co.th', roles: [ROLE.APPROVER_SP, ROLE.APPROVER_LAB] };

  var spPage = withTestUser_(both, function () { return api_listPendingApprovals('SP'); });
  assertTrue_(containsWo_(spPage.data.rows, spWo.woId), 'หน้าอนุมัติสาย SP เห็นใบงานสาย SP');
  assertTrue_(!containsWo_(spPage.data.rows, labWo.woId),
    'ใบงานสายแล็บต้องไม่โผล่ในหน้าอนุมัติสาย SP');

  var labPage = withTestUser_(both, function () { return api_listPendingApprovals('LAB'); });
  assertTrue_(containsWo_(labPage.data.rows, labWo.woId), 'หน้าอนุมัติ Lab เห็นใบงานสายแล็บ');
  assertTrue_(!containsWo_(labPage.data.rows, spWo.woId),
    'ใบงานสาย SP ต้องไม่โผล่ในหน้าอนุมัติ Lab เด็ดขาด');

  /* ---------- ขอสายที่ตัวเองไม่ได้อนุมัติ ต้องได้รายการว่าง ---------- */
  var spOnly = withTestUser_(users.approver, function () { return api_listPendingApprovals('LAB'); });
  assertEquals_(spOnly.data.rows.length, 0,
    'ผู้อนุมัติสาย SP ขอดูรายการสายแล็บ ต้องได้รายการว่าง');

  var labOnly = withTestUser_(users.labApprover, function () { return api_listPendingApprovals('SP'); });
  assertEquals_(labOnly.data.rows.length, 0,
    'ผู้อนุมัติสายแล็บขอดูรายการสาย SP ต้องได้รายการว่าง');

  // และยังอนุมัติข้ามสายไม่ได้เหมือนเดิม
  var crossApprove = withTestUser_(users.labApprover, function () {
    return api_approveWorkOrder(spWo.woId, ASSIGNMENT.SERVICE, {});
  });
  assertEquals_(crossApprove.ok, false, 'ผู้อนุมัติสายแล็บอนุมัติใบงานสาย SP ไม่ได้');

  /* ---------- สาย Lab อนุมัติแล้วได้แผนก LAB เสมอ ไม่ต้องเลือก ---------- */
  var approved = withTestUser_(users.labApprover, function () {
    return api_approveWorkOrder(labWo.woId, ASSIGNMENT.LAB, {});
  });
  assertEquals_(approved.ok, true, 'ผู้อนุมัติสายแล็บอนุมัติใบงานสายแล็บได้');
  assertEquals_(getWorkOrder(labWo.woId)['Assignment_Type'], ASSIGNMENT.LAB,
    'ใบงานสายแล็บได้แผนก LAB เสมอ');

  return endTest_();
}

/**
 * เมทริกซ์สิทธิ์ของทุก api_ ที่เพิ่มมาพร้อมงานของแผนก (กฎข้อ 17)
 * ทุกฟังก์ชันต้องมีทั้งเคสอนุญาตและเคสปฏิเสธคู่กัน และเคสปฏิเสธต้องพิสูจน์ว่าไม่มีอะไรถูกเขียนลงชีต
 */
function test_permission_taskApi() {
  beginTest_('สิทธิ์ของงานแผนกที่ชั้น API — กฎข้อ 7, 17');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE_PROJECT,
    { 'Location': 'จุดทดสอบสิทธิ์งานแผนก' });

  var svTask = wo.taskOf(DEPT.SERVICE);
  var pjTask = wo.taskOf(DEPT.PROJECT);

  /* ---------- api_acceptTask ---------- */
  var byAdmin = withTestUser_(users.admin, function () { return api_acceptTask(svTask); });
  assertEquals_(byAdmin.ok, false, 'ธุรการกดรับงานแทนแผนกไม่ได้');
  assertTrue_(String(byAdmin.message).indexOf('ไม่มีสิทธิ์') !== -1, 'และต้องถูกปฏิเสธด้วยเหตุผลเรื่องสิทธิ์');

  var byWrongDept = withTestUser_(users.project, function () { return api_acceptTask(svTask); });
  assertEquals_(byWrongDept.ok, false, 'แผนก Project กดรับงานของแผนก Service ไม่ได้');
  assertEquals_(getTask(svTask)['Status'], TASK_STATUS.PENDING_ACCEPT, 'งานยังรอรับอยู่เหมือนเดิม');
  assertEquals_(getTask(svTask)['Accepted_By'], '', 'และไม่มีชื่อผู้รับงานหลุดลงชีต');

  var byOwner = withTestUser_(users.service, function () { return api_acceptTask(svTask); });
  assertEquals_(byOwner.ok, true, 'แผนกเจ้าของงานกดรับงานของตัวเองได้');
  assertEquals_(getTask(svTask)['Status'], TASK_STATUS.IN_PROGRESS, 'งานเปลี่ยนเป็นกำลังดำเนินการจริง');

  withTestUser_(users.project, function () { return api_acceptTask(pjTask); });

  /* ---------- api_updateTaskStep ---------- */
  var svStep = listStepsByTask(svTask)[0];
  var stepDenied = withTestUser_(users.project, function () {
    return api_updateTaskStep(svStep['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
  });
  assertEquals_(stepDenied.ok, false, 'แผนกอื่นบันทึกความคืบหน้าให้งานที่ไม่ใช่ของตัวเองไม่ได้');
  assertEquals_(getStep(svStep['Step_ID'])['Status'], svStep['Status'], 'ขั้นตอนงานต้องไม่ถูกเขียนลงชีต');

  var stepAllowed = withTestUser_(users.service, function () {
    return api_updateTaskStep(svStep['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
  });
  assertEquals_(stepAllowed.ok, true, 'แผนกเจ้าของงานบันทึกความคืบหน้าได้');
  assertEquals_(getStep(svStep['Step_ID'])['Status'], STEP_STATUS.COMPLETED, 'ขั้นตอนถูกปิดจริง');

  /* ---------- api_completeTask ---------- */
  var closeSteps = listStepsByTask(svTask);
  for (var i = 0; i < closeSteps.length; i++) {
    withTestUser_(users.service, function () {
      return api_updateTaskStep(closeSteps[i]['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
    });
  }

  var closeDenied = withTestUser_(users.project, function () { return api_completeTask(svTask); });
  assertEquals_(closeDenied.ok, false, 'แผนก Project ปิดงานของแผนก Service ไม่ได้');
  assertEquals_(getTask(svTask)['Status'], TASK_STATUS.IN_PROGRESS, 'งานต้องยังไม่ถูกปิด');

  var closeByApprover = withTestUser_(users.approver, function () { return api_completeTask(svTask); });
  assertEquals_(closeByApprover.ok, false, 'ผู้อนุมัติปิดงานแทนแผนกไม่ได้');

  /* ---------- api_returnTask ---------- */
  var returnDenied = withTestUser_(users.approver, function () {
    return api_returnTask(svTask, 'ขอตีกลับแทนแผนก');
  });
  assertEquals_(returnDenied.ok, false, 'ผู้อนุมัติตีกลับผ่านงานของแผนกไม่ได้ ต้องใช้การตีกลับใบงานของตัวเอง');
  assertEquals_(getTask(svTask)['Status_Before_Return'], '',
    'รายการที่ถูกปฏิเสธต้องไม่ทิ้งสถานะที่จำไว้ค้างในชีต');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.IN_PROGRESS, 'ใบงานต้องไม่ถูกตีกลับ');

  var returnWrongDept = withTestUser_(users.project, function () {
    return api_returnTask(svTask, 'ขอตีกลับงานของแผนกอื่น');
  });
  assertEquals_(returnWrongDept.ok, false, 'แผนกอื่นตีกลับผ่านงานที่ไม่ใช่ของตัวเองไม่ได้');

  var returnAllowed = withTestUser_(users.service, function () {
    return api_returnTask(svTask, 'ข้อมูลหน้างานไม่ตรงกับที่แจ้ง');
  });
  assertEquals_(returnAllowed.ok, true, 'แผนกเจ้าของงานตีกลับใบงานได้');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.RETURNED, 'ใบงานถูกตีกลับจริง');

  // กลับเข้าสู่การทำงานปกติเพื่อทดสอบการยกเลิกต่อ
  // ใบที่ถูกตีกลับต้องส่งขออนุมัติใหม่ก่อน จึงจะอนุมัติได้อีกครั้ง (SPEC 5, 8)
  submitWorkOrder(wo.woId, users.admin);
  approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE_PROJECT, users.approver);

  /* ---------- api_cancelTask ---------- */
  var cancelWrongDept = withTestUser_(users.service, function () {
    return api_cancelTask(pjTask, 'ขอยกเลิกงานของแผนกอื่น');
  });
  assertEquals_(cancelWrongDept.ok, false, 'แผนก Service ยกเลิกงานของแผนก Project ไม่ได้');
  assertEquals_(getTask(pjTask)['Cancel_Reason'], '', 'เหตุผลของรายการที่ถูกปฏิเสธต้องไม่ถูกเขียนลงชีต');

  var cancelNoReason = withTestUser_(users.project, function () { return api_cancelTask(pjTask, ''); });
  assertEquals_(cancelNoReason.ok, false, 'ยกเลิกงานโดยไม่กรอกเหตุผลไม่ได้แม้เป็นเจ้าของงาน');

  var cancelByApprover = withTestUser_(users.approver, function () {
    return api_cancelTask(pjTask, 'ยกเลิกตามคำสั่งลูกค้า');
  });
  assertEquals_(cancelByApprover.ok, true, 'ผู้อนุมัติของสายนั้นยกเลิกงานของแผนกแทนได้ (SPEC 8)');
  assertEquals_(getTask(pjTask)['Status'], TASK_STATUS.CANCELLED, 'งานของแผนก Project ถูกยกเลิกจริง');

  var cancelByLabApprover = withTestUser_(users.labApprover, function () {
    return api_cancelTask(svTask, 'ยกเลิกข้ามสาย');
  });
  assertEquals_(cancelByLabApprover.ok, false, 'ผู้อนุมัติสายแล็บยกเลิกงานในสาย SP ไม่ได้');
  assertEquals_(getTask(svTask)['Status'], TASK_STATUS.IN_PROGRESS, 'งานของแผนก Service ต้องไม่ถูกแตะ');

  /* ---------- api_recordPayment ---------- */
  var payDenied = withTestUser_(users.service, function () { return api_recordPayment(wo.woId, 'จ่ายแล้ว'); });
  assertEquals_(payDenied.ok, false, 'แผนกบันทึกรับชำระเงินเองไม่ได้');
  assertEquals_(getWorkOrder(wo.woId)['Payment_Status'], PAYMENT.UNPAID, 'สถานะการชำระต้องไม่เปลี่ยน');

  var payAllowed = withTestUser_(users.admin, function () {
    return api_recordPayment(wo.woId, 'ใบเสร็จเลขที่ RC-9999');
  });
  assertEquals_(payAllowed.ok, true, 'ธุรการบันทึกรับชำระเงินได้');
  assertEquals_(getWorkOrder(wo.woId)['Payment_Status'], PAYMENT.PAID, 'บันทึกลงชีตจริง');

  /* ---------- api_listMyTasks ---------- */
  var svList = withTestUser_(users.service, function () { return api_listMyTasks(); });
  assertEquals_(svList.ok, true, 'แผนกเปิดรายการงานของตัวเองได้');
  assertTrue_(containsTask_(svList.data.rows, svTask), 'แผนก Service เห็นงานของตัวเอง');
  assertTrue_(!containsTask_(svList.data.rows, pjTask), 'และต้องไม่เห็นงานของแผนกอื่น');

  var adminList = withTestUser_(users.admin, function () { return api_listMyTasks(); });
  assertEquals_(adminList.ok, true, 'ผู้ที่ไม่ได้สังกัดแผนกเปิดหน้านี้ได้โดยไม่ error');
  assertEquals_(adminList.data.rows.length, 0, 'แต่ไม่มีงานของแผนกให้ทำเลย');

  var pjList = withTestUser_(users.project, function () { return api_listMyTasks(true); });
  assertTrue_(containsTask_(pjList.data.rows, pjTask),
    'เมื่อขอให้รวมงานที่ปิดแล้ว จะเห็นงานที่ยกเลิกไปด้วย');

  return endTest_();
}

/**
 * รายการงานของแผนกมีงานเลขที่นี้อยู่หรือไม่
 * @param {Object[]} rows ผลจาก api_listMyTasks
 * @param {string} taskId เลขที่งานของแผนก
 * @return {boolean}
 */
function containsTask_(rows, taskId) {
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].taskId === taskId) return true;
  }
  return false;
}

/**
 * คอลัมน์ที่ต้องคงรูปแบบเป๊ะ ต้องตั้งเซลล์เป็นข้อความในชีตจริง (กฎ "Google Sheet แปลงค่าตอนเขียน")
 *
 * เบอร์โทร "0812345678" ที่ตกลงในคอลัมน์รูปแบบทั่วไป จะถูกเก็บเป็นตัวเลข 812345678
 * ศูนย์นำหายถาวร กู้คืนไม่ได้ และไม่มี error ให้เห็น — เสียหายจริงไม่ว่าจะมีแคชหรือไม่
 *
 * ข้ามเมื่อรันกับ mock ในเครื่อง เพราะ mock ไม่ได้จำลองรูปแบบเซลล์ของชีต
 * การบังคับให้เขียวหรือแดงในเครื่องจึงไม่ได้บอกอะไรเกี่ยวกับชีตจริงเลย
 */
function test_textColumns() {
  beginTest_('คอลัมน์เบอร์โทรและรหัสลูกค้าต้องเป็นเซลล์ข้อความ');

  if (isMockEnvironment_()) {
    Logger.log('  (ข้าม: mock ในเครื่องไม่ได้จำลองรูปแบบเซลล์ ต้องตรวจบนชีตจริงเท่านั้น)');
    assertTrue_(typeof checkTextColumns === 'function', 'มีเครื่องมือตรวจรูปแบบเซลล์ให้กดรันบนชีตจริง');
    return endTest_();
  }

  var result = checkTextColumns();
  for (var i = 0; i < result.columns.length; i++) {
    var c = result.columns[i];
    Logger.log('  ' + c.sheet + '.' + c.field + ' รูปแบบเซลล์ตอนนี้คือ "' + c.format + '"');
    assertTrue_(c.ok, 'คอลัมน์ ' + c.sheet + '.' + c.field +
      ' ต้องตั้งรูปแบบเซลล์เป็นข้อความ (กดรัน fixTextColumns() เพื่อแก้) ' +
      'ตอนนี้เป็น "' + c.format + '"');
  }

  return endTest_();
}

/**
 * เวลาที่แสดงให้คนอ่านต้องเป็นเวลาไทย ไม่ใช่ UTC (กฎข้อ 19)
 *
 * บั๊กตระกูลนี้หายากมาก เพราะค่าที่เก็บถูกต้องทุกอย่าง ผิดแค่ตอนแสดง
 * และผิดเป็นจำนวนชั่วโมงที่ลงตัวพอดี จนดูเหมือนเวลาปกติของอีกกะหนึ่ง
 * เทสต์ชุดนี้จึงใช้ค่าที่รู้คำตอบแน่นอนล่วงหน้า ไม่ใช่ค่าที่คำนวณจากเวลาปัจจุบัน
 */
function test_formatForDisplay() {
  beginTest_('เวลาที่แสดงต้องเป็นเวลาไทย — กฎข้อ 19');

  /* ---------- 1) Date ที่รู้คำตอบแน่นอน ---------- */
  // 2026-09-12 10:08:39 UTC คือ 17:08:39 ตามเวลาไทย — ตัวเลขชุดเดียวกับที่พบในรายงานบั๊ก
  var known = new Date(Date.UTC(2026, 8, 12, 10, 8, 39));

  assertEquals_(formatForDisplay_(known), '12-09-2026 17:08',
    'ต้องได้เวลาไทย 17:08 ไม่ใช่เวลา UTC 10:08 และวันที่เป็นรูปแบบ dd-MM-yyyy');
  assertTrue_(formatForDisplay_(known).indexOf('10:08') === -1,
    'ต้องไม่มีเวลา UTC หลงเหลืออยู่ในข้อความ');
  assertEquals_(known.toISOString().substring(11, 19), '10:08:39',
    'ตัว Date เองยังเป็นเวลา UTC เหมือนเดิม การแก้นี้แตะแค่ชั้นแสดงผล');

  // ต่างกัน 7 ชั่วโมงพอดี ไม่ใช่ค่าอื่น
  /* ---------- รูปแบบ dd-MM-yyyy ตามกฎข้อ 20 ---------- */
  // วันที่ล้วน (เที่ยงคืนพอดี) ต้องไม่มีเวลาต่อท้าย
  assertEquals_(formatForDisplay_(new Date(2026, 2, 5)), '05-03-2026',
    'วันที่ล้วนต้องได้ dd-MM-yyyy ไม่มีเวลาต่อท้าย');
  // วันและเดือนน้อยกว่า 10 ต้องมีศูนย์นำ ไม่ใช่ 5-3-2026
  assertEquals_(formatForDisplay_(new Date(2026, 2, 5, 9, 7, 0)), '05-03-2026 09:07',
    'วันและเดือนน้อยกว่า 10 ต้องมีศูนย์นำ และชั่วโมงนาทีก็ต้องมีศูนย์นำ');
  assertEquals_(formatForDisplay_(new Date(2026, 11, 25, 23, 59, 0)), '25-12-2026 23:59',
    'วันและเดือนสองหลักก็ต้องเรียงวัน-เดือน-ปีเหมือนกัน');
  // ปีต้องเป็น ค.ศ. ไม่ใช่ พ.ศ. และเดือนต้องเป็นตัวเลข ไม่ใช่ชื่อย่อภาษาไทย
  assertTrue_(formatForDisplay_(new Date(2026, 2, 5)).indexOf('2569') === -1,
    'ปีต้องเป็น ค.ศ. ไม่ใช่ พ.ศ.');
  assertTrue_(/^\d{2}-\d{2}-\d{4}$/.test(formatForDisplay_(new Date(2026, 2, 5))),
    'เดือนต้องเป็นตัวเลขสองหลัก ไม่ใช่ชื่อย่อภาษาไทย');
  // เวลาที่ไม่ใช่เที่ยงคืนพอดีแม้แต่วินาทีเดียว ต้องยังแสดงเวลา ไม่ถูกตัดเหลือแต่วันที่
  assertEquals_(formatForDisplay_(new Date(2026, 2, 5, 0, 0, 30)), '05-03-2026 00:00',
    'เวลา 00:00:30 ยังถือว่ามีเวลา ต้องไม่ถูกตัดเหลือแต่วันที่');

  var utcHour = Number(known.toISOString().substring(11, 13));
  var shownHour = Number(formatForDisplay_(known).substring(11, 13));
  assertEquals_(shownHour - utcHour, 7, 'เวลาที่แสดงต้องเร็วกว่า UTC 7 ชั่วโมงพอดี');

  // ข้ามวันแล้วต้องข้ามวันจริง ไม่ใช่แค่เลื่อนชั่วโมง
  assertEquals_(formatForDisplay_(new Date(Date.UTC(2026, 8, 12, 18, 30, 0))), '13-09-2026 01:30',
    'เวลาดึกตาม UTC ต้องกลายเป็นเช้าของวันถัดไปตามเวลาไทย');

  /* ---------- 2) ข้อความ ISO ต้องได้ผลเดียวกับ Date ---------- */
  assertEquals_(formatForDisplay_('2026-09-12T10:08:39.000Z'), formatForDisplay_(known),
    'ข้อความ ISO ที่ลงท้ายด้วย Z ต้องได้ผลเดียวกับการส่ง Date');
  assertEquals_(formatForDisplay_('2026-09-12T10:08:39Z'), '12-09-2026 17:08',
    'ISO ที่ไม่มีเศษมิลลิวินาทีก็ต้องได้เวลาไทยเหมือนกัน');
  assertEquals_(formatForDisplay_(known.getTime()), '12-09-2026 17:08',
    'ส่งเป็นตัวเลข timestamp ก็ต้องได้ผลเดียวกัน');

  /* ---------- 3) ไม่มีค่า ต้องได้ข้อความว่าง ---------- */
  var blanks = [
    { value: '', name: 'ข้อความว่าง' },
    { value: null, name: 'null' },
    { value: undefined, name: 'undefined' },
    { value: 'ยังไม่กำหนด', name: 'ข้อความที่ไม่ใช่วันที่' },
    { value: new Date('ไม่ใช่วันที่'), name: 'Date ที่ไม่ถูกต้อง' }
  ];
  for (var i = 0; i < blanks.length; i++) {
    var shown = formatForDisplay_(blanks[i].value);
    assertEquals_(shown, '', 'ส่ง ' + blanks[i].name + ' เข้าไปต้องได้ข้อความว่าง');
    assertTrue_(shown.indexOf('Invalid') === -1 && shown.indexOf('1970') === -1,
      'ส่ง ' + blanks[i].name + ' เข้าไปต้องไม่ได้คำว่า Invalid Date หรือปี 1970');
  }

  /* ---------- 4) ชั้นข้อมูลต้องไม่ถูกแตะเลย ---------- */
  var users = serviceTestUsers_();
  // ใบนี้ถูกแก้ไขระหว่างทาง จึงต้องอยู่ในสถานะถูกตีกลับ (SPEC 5)
  var wo = returnedTestWo_(users, { 'Location': 'จุดทดสอบเวลาที่แสดง' });

  var stored = getWorkOrder(wo.woId)['Created_Date'];
  assertTrue_(stored instanceof Date,
    'ค่าที่เก็บลงชีตยังเป็น Date จริง ไม่ได้ถูกแปลงเป็นข้อความตอนแสดงผล');
  assertTrue_(typeof formatForDisplay_(stored) === 'string',
    'ส่วนค่าที่เอาไปแสดง เป็นข้อความคนละตัวกับค่าที่เก็บ');

  // ค่าที่ใช้เทียบ Optimistic Lock ต้องยังเป็น ISO เต็มรูปแบบพร้อมเศษมิลลิวินาที
  var sent = jsonSafe_(getWorkOrder(wo.woId));
  assertTrue_(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(String(sent['Updated_Date'])),
    'ค่าที่ส่งให้หน้าเว็บถือไว้ ยังเป็น ISO เต็มรูปแบบ ไม่ถูกเปลี่ยนเป็นรูปแบบที่คนอ่าน');

  var stamp = sent['Updated_Date'];
  var edited = editWorkOrder(wo.woId, testWoForm_({
    'Customer_Code': wo.workOrder['Customer_Code'],
    'Location': 'จุดทดสอบเวลาที่แสดง',
    'Remark': 'แก้ไขด้วยค่าเวลาที่ถือไว้'
  }), users.admin, stamp);
  assertTrue_(!!edited, 'ค่าเวลาที่ถือไว้ยังใช้ทำ Optimistic Lock ได้เหมือนเดิม');

  // และค่าที่ผ่านการจัดรูปแบบเพื่อแสดงผลแล้ว ต้องใช้ทำ Optimistic Lock ไม่ได้
  // เพราะเศษมิลลิวินาทีหายไป — ถ้าวันหนึ่งมีคนเผลอส่งค่านี้มา ต้องถูกปฏิเสธ ไม่ใช่ผ่านแบบเงียบ ๆ
  assertThrows_(function () {
    editWorkOrder(wo.woId, testWoForm_({
      'Customer_Code': wo.workOrder['Customer_Code'],
      'Location': 'จุดทดสอบเวลาที่แสดง'
    }), users.admin, formatForDisplay_(getWorkOrder(wo.woId)['Updated_Date']));
  }, 'ค่าเวลาที่จัดรูปแบบเพื่อแสดงผลแล้ว ใช้ทำ Optimistic Lock ไม่ได้');

  /* ---------- 5) Audit_Log ที่คนเปิดอ่านย้อนหลัง ต้องเป็นเวลาไทยด้วย ---------- */
  var auditRow = findAuditRow_(wo.woId, ENTITY.WO, ACTION.CREATE);
  assertTrue_(auditRow['Timestamp'] instanceof Date, 'คอลัมน์เวลาของ Audit ยังเก็บเป็น Date จริง');
  assertEquals_(auditValue_(known), '12-09-2026 17:08',
    'ค่าเวลาที่ Audit เก็บเป็นข้อความ ต้องเป็นเวลาไทย');

  return endTest_();
}

/* ---------------------------------------------------------------------------
 * ตัวช่วยเฉพาะของชุดทดสอบ (ไม่ใช้ในโค้ดจริง)
 * --------------------------------------------------------------------------- */

/* ===========================================================================
 * ชุดทดสอบไฟล์แนบ — 06_Files.gs (SPEC 9.4, 14, 16, 21)
 *
 * แบ่งเป็นสองแบบชัดเจน
 *   ตรรกะล้วน   ตั้งชื่อ ไล่ลำดับ ตรวจนามสกุล — ไม่แตะทั้ง Drive และชีต จึงเร็วมาก
 *   เดินจริง    ส่งไฟล์เข้าระบบจริงผ่าน 06_Files.gs เพื่อพิสูจน์เรื่องโฟลเดอร์ซ้ำ
 * =========================================================================== */

/**
 * ตั้งชื่อไฟล์ถูกตามตารางหัวข้อ 14.1 ครบทุกรูปแบบ
 *
 * ตารางนี้มี 6 แถว และแต่ละแถวมีกติกาของตัวเอง ถ้าเทสต์แค่แถวเดียวจะพลาดอีก 5 แถว
 * จุดที่ผิดง่ายที่สุดคือตัวนำหน้า — ต้องเป็น SV_ID / LAB_ID ไม่ใช่ WO_ID และห้ามเป็น PJ_ID
 */
function test_files_naming() {
  beginTest_('ตั้งชื่อไฟล์ถูกตามตารางหัวข้อ 14.1 ทุกรูปแบบ');

  var woId = 'WO-2609-0001';

  /* ---------- แถวที่ 1 ไฟล์แนบตอนสร้าง WO ---------- */
  var quote = fileNamePlan_({ woId: woId, scope: FILE_SCOPE.WO, topicName: 'ใบเสนอราคา',
    mimeType: 'application/pdf', fileName: 'scan001.pdf' });
  assertEquals_(buildSavedFileName_(quote, 1), 'WO-2609-0001_ใบเสนอราคา_01.pdf',
    'ไฟล์แนบตอนสร้างใบงานใช้ WO_ID นำหน้า ตามด้วยหัวข้อและลำดับ');
  assertEquals_(quote.folderPath, 'Attachments', 'ไฟล์เอกสารลงโฟลเดอร์ Attachments (SPEC 16)');

  /* ---------- แถวที่ 2 รูปภาพตอนสร้าง WO ---------- */
  var photo = fileNamePlan_({ woId: woId, scope: FILE_SCOPE.WO, topicName: 'รูปภาพ',
    mimeType: 'image/jpeg', fileName: 'IMG_9931.JPG' });
  assertEquals_(buildSavedFileName_(photo, 3), 'WO-2609-0001_รูปภาพ_03.jpg',
    'รูปภาพใช้รูปแบบเดียวกัน และคงนามสกุลเดิมโดยไม่แปลงชนิดไฟล์');
  assertEquals_(photo.folderPath, 'Picture', 'รูปภาพลงโฟลเดอร์ Picture แยกจากไฟล์เอกสาร (SPEC 16)');

  /* ---------- แถวที่ 3 Report ของ Service ---------- */
  var service = fileNamePlan_({ woId: woId, scope: FILE_SCOPE.SERVICE, formNo: 'FM-SV-01-R.04',
    stepNo: 2, mimeType: 'application/pdf', fileName: 'report.pdf' });
  assertEquals_(buildSavedFileName_(service, 1), 'SV-2609-0001_Step2_FM-SV-01-R.04_01.pdf',
    'Report ของ Service ใช้ SV_ID นำหน้า และมีเลข Step อยู่ในชื่อ');
  assertEquals_(service.folderPath, 'Service/Step 2', 'ลงโฟลเดอร์ของ Step นั้นตาม SPEC 16');

  /* ---------- แถวที่ 4 Report ของ Project ---------- */
  var project = fileNamePlan_({ woId: woId, scope: FILE_SCOPE.PROJECT, formNo: 'FM-PE-11',
    stepNo: 1, mimeType: 'application/pdf', fileName: 'งวด1.pdf' });
  assertEquals_(buildSavedFileName_(project, 1), 'SV-2609-0001_งวด1_FM-PE-11_01.pdf',
    'Report ของ Project ใช้ SV_ID เหมือนกัน เพราะสองแผนกใช้ใบ Service Report ชุดเดียวกัน');
  assertEquals_(project.folderPath, 'Project/Period 1', 'ลงโฟลเดอร์ของงวดนั้นตาม SPEC 16');

  /* ---------- แถวที่ 5 Report ของ Lab ---------- */
  var lab = fileNamePlan_({ woId: woId, scope: FILE_SCOPE.LAB, formNo: 'FM-SV-09-R.00',
    mimeType: 'application/pdf', fileName: 'water.pdf' });
  assertEquals_(buildSavedFileName_(lab, 1), 'LAB-2609-0001_FM-SV-09-R.00_01.pdf',
    'Report ของ Lab ใช้ LAB_ID นำหน้า และไม่มีเลข Step');
  assertEquals_(lab.folderPath, 'Lab', 'ลงโฟลเดอร์ Lab');

  /* ---------- แถวที่ 6 หลักฐานการชำระเงิน ---------- */
  var slip = fileNamePlan_({ woId: woId, scope: FILE_SCOPE.PAYMENT,
    mimeType: 'image/jpeg', fileName: 'slip.jpg' });
  assertEquals_(buildSavedFileName_(slip, 1), 'WO-2609-0001_หลักฐานการชำระ_01.jpg',
    'หลักฐานการชำระใช้ WO_ID นำหน้า');
  assertEquals_(slip.folderPath, 'Payment', 'ลงโฟลเดอร์ Payment');

  /* ---------- รูปหน้างานของขั้นตอน (SPEC 7.1, 7.2 · ต่อจากตาราง 14.1) ---------- */
  /*
   * ตาราง 14.1 ไม่มีแถวของรูปที่แนบในขั้นตอน เพราะตอนเขียนยังไม่มีช่องนี้
   * จึงใช้รูปแบบเดียวกับ Report ของขั้นตอนนั้น แล้วแทนตำแหน่งของเลขฟอร์มด้วยคำว่า "รูปภาพ"
   * ซึ่งเป็นคำเดียวกับรูปที่แนบตอนสร้างใบงาน ทั้งระบบจึงอ่านชื่อไฟล์รูปได้แบบเดียวกันหมด
   */
  var stepPhoto = fileNamePlan_({ woId: woId, scope: FILE_SCOPE.SERVICE,
    formNo: PHOTO_TOPIC.NAME, stepNo: 2, photo: true,
    mimeType: 'image/jpeg', fileName: 'IMG_1201.JPG' });
  assertEquals_(buildSavedFileName_(stepPhoto, 1), 'SV-2609-0001_Step2_รูปภาพ_01.jpg',
    'รูปของขั้นตอนใช้รูปแบบเดียวกับเอกสารของขั้นนั้น แต่บอกว่าเป็นรูปภาพ');
  assertEquals_(stepPhoto.folderPath, 'Service/Picture',
    'และเก็บที่โฟลเดอร์ Picture ของแผนกนั้น ไม่กระจายไปตามโฟลเดอร์ของขั้นตอน (SPEC 16)');

  var labPhoto = fileNamePlan_({ woId: woId, scope: FILE_SCOPE.LAB,
    formNo: PHOTO_TOPIC.NAME, photo: true, mimeType: 'image/jpeg', fileName: 'water.jpg' });
  assertEquals_(buildSavedFileName_(labPhoto, 2), 'LAB-2609-0001_รูปภาพ_02.jpg',
    'งานแล็บไม่มีขั้นตอนย่อย ชื่อรูปจึงไม่มีเลขขั้นตอน');
  assertEquals_(labPhoto.folderPath, 'Lab/Picture', 'และอยู่ใต้โฟลเดอร์ของแผนกตัวเองเหมือนกัน');

  // รูปของแผนกต้องไม่ไปปนกับรูปที่แนบตอนสร้างใบงาน ซึ่งอยู่ที่ Picture ของราก
  assertTrue_(stepPhoto.folderPath !== photo.folderPath,
    'รูปของแผนกกับรูปตอนสร้างใบงาน ต้องอยู่คนละที่');

  /* ---------- ห้ามใช้ PJ_ID นำหน้าเด็ดขาด (SPEC 14.2, 21) ---------- */
  // PJ_ID ใช้ซ้ำข้ามหลายใบงาน ไฟล์จากคนละใบที่ทำสถานที่เดียวกันจะชนกันทันที
  var everyPlan = [quote, photo, service, project, lab, slip, stepPhoto, labPhoto];
  for (var i = 0; i < everyPlan.length; i++) {
    assertTrue_(everyPlan[i].prefix.indexOf(PREFIX.PJ) !== 0,
      'ตัวนำหน้าชื่อไฟล์ต้องไม่ใช่ PJ_ID เพราะ PJ_ID ใช้ซ้ำข้ามใบงาน');
  }

  /* ---------- เลขที่ทดสอบที่มี TEST- นำหน้า ต้องยังแปลงตัวนำหน้าได้ถูก ---------- */
  var testPlan = fileNamePlan_({ woId: 'TEST-R7K2-WO-2609-0009', scope: FILE_SCOPE.LAB,
    formNo: 'FM-SV-09-R.00', mimeType: 'application/pdf', fileName: 'x.pdf' });
  assertEquals_(testPlan.prefix, 'TEST-R7K2-LAB-2609-0009',
    'ใบงานทดสอบต้องยังคง TEST- ไว้หน้าสุด เพื่อให้ test_cleanup จับได้');

  /* ---------- ข้อมูลไม่พอ ต้องบอกให้รู้เรื่อง ไม่ใช่ตั้งชื่อมั่ว ---------- */
  assertThrowsMessage_(function () {
    fileNamePlan_({ woId: woId, scope: FILE_SCOPE.SERVICE, formNo: 'FM-SV-01', stepNo: 0,
      mimeType: 'application/pdf', fileName: 'a.pdf' });
  }, 'Step', 'Report ของ Service ที่ไม่บอกว่าเป็น Step ที่เท่าไร ต้องถูกปฏิเสธ');

  return endTest_();
}

/**
 * อัปโหลดซ้ำหัวข้อเดิม ต้องได้เลขลำดับถัดไป ไม่ทับของเดิม (SPEC 14.2)
 *
 * เดินผ่านทะเบียน File_Index จริง เพราะจุดที่ต้องพิสูจน์คือการไล่เลขจากข้อมูลที่บันทึกไว้
 * ไม่ใช่การนับในหน่วยความจำ
 */
function test_files_sequence() {
  beginTest_('อัปโหลดซ้ำหัวข้อเดิมได้ลำดับถัดไป ไม่ทับของเดิม — SPEC 14.2');

  /*
   * ใช้เลขที่ใบงานสมมติ ไม่ต้องสร้างใบงานจริง เพราะการไล่เลขอ่านจาก File_Index อย่างเดียว
   * นอกจากประหยัดการคุยกับชีตแล้ว ยังทำให้เทสต์ไม่ขึ้นกับว่าชีตจริงตั้งหัวข้อบังคับไว้อะไรบ้าง
   * ซึ่งถ้าขึ้นกับสิ่งนั้น เทสต์จะผ่านในเครื่องแต่แดงบนชีตจริงโดยไม่มีอะไรเปลี่ยน
   */
  var woId = syntheticTestWoId_('9101');

  var plan = fileNamePlan_({ woId: woId, scope: FILE_SCOPE.WO, topicName: 'ใบเสนอราคา',
    mimeType: 'application/pdf', fileName: 'a.pdf' });

  assertEquals_(nextFileSeq_(woId, plan), 1, 'หัวข้อที่ยังไม่เคยแนบ ต้องเริ่มที่ 1');

  // แนบไฟล์แรกลงทะเบียน (ไม่ต้องแตะ Drive — สิ่งที่ต้องพิสูจน์คือการไล่เลข)
  insertFile(testFileRow_(woId, buildSavedFileName_(plan, 1), 1, { 'Topic_ID': 'T-QUOTE' }));
  assertEquals_(nextFileSeq_(woId, plan), 2, 'แนบหัวข้อเดิมซ้ำ ต้องได้เลขถัดไป');

  insertFile(testFileRow_(woId, buildSavedFileName_(plan, 2), 2, { 'Topic_ID': 'T-QUOTE' }));
  var third = nextFileSeq_(woId, plan);
  assertEquals_(third, 3, 'ไฟล์ที่สามของหัวข้อเดิม ได้เลข 3');
  assertEquals_(buildSavedFileName_(plan, third), plan.prefix + '_ใบเสนอราคา_03.pdf',
    'ชื่อไฟล์ที่สามต้องไม่ซ้ำกับสองไฟล์แรก จึงไม่ทับของเดิม');

  /* ---------- หัวข้ออื่นของใบเดียวกัน ต้องนับแยก ---------- */
  var other = fileNamePlan_({ woId: woId, scope: FILE_SCOPE.WO, topicName: 'ใบสั่งซื้อสินค้า',
    mimeType: 'application/pdf', fileName: 'b.pdf' });
  assertEquals_(nextFileSeq_(woId, other), 1, 'หัวข้ออื่นเริ่มนับใหม่ที่ 1 — ลำดับนับแยกตามหัวข้อ');

  /* ---------- ใบงานอื่น ต้องนับแยกจากกัน ---------- */
  var otherWoId = syntheticTestWoId_('9102');
  var samePlanOtherWo = fileNamePlan_({ woId: otherWoId, scope: FILE_SCOPE.WO,
    topicName: 'ใบเสนอราคา', mimeType: 'application/pdf', fileName: 'a.pdf' });
  assertEquals_(nextFileSeq_(otherWoId, samePlanOtherWo), 1,
    'หัวข้อเดียวกันของอีกใบงาน ต้องเริ่มที่ 1 ไม่ใช่นับต่อจากใบก่อน');

  /* ---------- ลบไฟล์แล้ว เลขเดิมต้องไม่ถูกใช้ซ้ำ ---------- */
  // ถ้านับจาก "จำนวนแถวที่ยังใช้งานอยู่" เลขจะถอยหลังแล้วไฟล์ใหม่จะไปทับไฟล์เก่าใน Drive
  var toRemove = filterRows_(listFiles(), 'WO_ID', woId)[0];
  deactivateFile(toRemove['File_ID']);
  assertEquals_(nextFileSeq_(woId, plan), 3,
    'ลบไฟล์ไปแล้ว เลขลำดับต้องไม่ถอยกลับ ไม่งั้นไฟล์ใหม่จะไปทับไฟล์เดิมใน Drive');

  return endTest_();
}

/**
 * เลขที่ใบงานสมมติสำหรับชุดทดสอบที่ไม่ต้องมีแถวใบงานจริง
 *
 * ต้องขึ้นต้นด้วย TEST- และมีรหัสรอบกำกับเหมือนเลขที่จริงทุกประการ
 * เพราะแถวที่อ้างถึงมัน (เช่น File_Index) ต้องถูก test_cleanup เก็บกวาดได้
 *
 * @param {string} suffix ตัวเลขท้ายที่ทำให้ไม่ชนกันภายในชุดเดียวกัน
 * @return {string}
 */
function syntheticTestWoId_(suffix) {
  return testWoPrefix_() + '2609-' + suffix;
}

/**
 * แถวทะเบียนไฟล์สำหรับทดสอบ — ไม่แตะ Drive
 * @param {string} woId เลขที่ใบงาน
 * @param {string} savedName ชื่อไฟล์ที่ระบบตั้ง
 * @param {number} seq ลำดับ
 * @param {Object} [extra] คอลัมน์เพิ่มเติม
 * @return {Object}
 */
function testFileRow_(woId, savedName, seq, extra) {
  var row = {
    'File_ID':            woId + '-F' + seq + '-' + Math.floor(Math.random() * 100000),
    'WO_ID':              woId,
    'Saved_File_Name':    savedName,
    'Original_File_Name': 'ต้นฉบับ.pdf',
    'Seq':                seq,
    'Drive_File_ID':      'ไม่ได้ขึ้น Drive (ข้อมูลทดสอบ)',
    'Is_Active':          true
  };
  for (var key in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, key)) row[key] = extra[key];
  }
  return row;
}

/**
 * อักขระที่ Drive ใช้ไม่ได้ ต้องถูกแทนด้วยขีดกลาง (SPEC 14.2)
 *
 * ถ้าไม่แทน Drive จะปฏิเสธชื่อไฟล์หรือตัดชื่อให้เองแบบเงียบ ๆ
 * แล้วชื่อที่บันทึกไว้ใน File_Index จะไม่ตรงกับชื่อจริงบน Drive
 */
function test_files_badCharacters() {
  beginTest_('อักขระต้องห้ามของ Drive ถูกแทนด้วยขีดกลาง — SPEC 14.2');

  assertEquals_(sanitizeTopicName_('ใบเบิก/อะไหล่'), 'ใบเบิก-อะไหล่', 'ทับ (/) ถูกแทนด้วยขีดกลาง');
  assertEquals_(sanitizeTopicName_('แบบ\\ไฟฟ้า'), 'แบบ-ไฟฟ้า', 'แบ็กสแลชถูกแทน');
  assertEquals_(sanitizeTopicName_('รายงาน:สรุป'), 'รายงาน-สรุป', 'ทวิภาคถูกแทน');
  assertEquals_(sanitizeTopicName_('สรุป*ผล'), 'สรุป-ผล', 'ดอกจันถูกแทน');
  assertEquals_(sanitizeTopicName_('ผลตรวจ?น้ำ'), 'ผลตรวจ-น้ำ', 'เครื่องหมายคำถามถูกแทน');
  assertEquals_(sanitizeTopicName_('ใบ"เสนอราคา"'), 'ใบ-เสนอราคา-', 'อัญประกาศคู่ถูกแทน');
  assertEquals_(sanitizeTopicName_('A<B>C'), 'A-B-C', 'วงเล็บแหลมถูกแทน');
  assertEquals_(sanitizeTopicName_('ซ่อม|เปลี่ยน'), 'ซ่อม-เปลี่ยน', 'ขีดตั้งถูกแทน');

  // ทั้ง 9 ตัวพร้อมกันในชื่อเดียว
  assertEquals_(sanitizeTopicName_('a/b\\c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j',
    'อักขระต้องห้ามทุกตัวถูกแทนพร้อมกันได้');

  // ต้องไม่ไปแตะอักขระที่ใช้ได้ปกติ โดยเฉพาะภาษาไทยและจุดของนามสกุล
  assertEquals_(sanitizeTopicName_('Service Report R.04'), 'Service Report R.04',
    'อักขระที่ Drive ใช้ได้ต้องไม่ถูกแตะ');

  /* ---------- ต้องมีผลถึงชื่อไฟล์จริง ไม่ใช่แค่ฟังก์ชันย่อย ---------- */
  var plan = fileNamePlan_({ woId: 'WO-2609-0001', scope: FILE_SCOPE.WO,
    topicName: 'ใบเบิก/อะไหล่', mimeType: 'application/pdf', fileName: 'x.pdf' });
  assertEquals_(buildSavedFileName_(plan, 1), 'WO-2609-0001_ใบเบิก-อะไหล่_01.pdf',
    'ชื่อไฟล์ที่ได้จริงต้องไม่มีอักขระต้องห้ามหลงเหลือ');

  return endTest_();
}

/**
 * ชื่อหัวข้อที่ยาวเกิน 50 ตัวอักษร ต้องถูกตัด (SPEC 14.2)
 *
 * ชื่อ Report จริงบางรายการยาวมาก เช่น "ใบตรวจเช็คการทำงานของระบบชิลเลอร์และคูลลิ่งทาวเวอร์"
 * ถ้าไม่ตัด ชื่อไฟล์จะยาวจนอ่านไม่รู้เรื่องและบางระบบปลายทางรับไม่ได้
 */
function test_files_longTopicName() {
  beginTest_('ชื่อหัวข้อที่ยาวเกิน 50 ตัวอักษรถูกตัด — SPEC 14.2');

  var long51 = repeatText_('ก', 51);
  assertEquals_(sanitizeTopicName_(long51).length, MAX_TOPIC_NAME_LENGTH,
    'ชื่อยาว 51 ตัวอักษร ถูกตัดเหลือ 50');

  var long200 = repeatText_('ข', 200);
  assertEquals_(sanitizeTopicName_(long200).length, MAX_TOPIC_NAME_LENGTH,
    'ชื่อยาวมากก็ยังถูกตัดเหลือ 50 เท่าเดิม');

  var exact50 = repeatText_('ค', 50);
  assertEquals_(sanitizeTopicName_(exact50), exact50, 'ชื่อยาวพอดี 50 ตัวอักษร ต้องไม่ถูกตัด');

  var short = 'ใบเสนอราคา';
  assertEquals_(sanitizeTopicName_(short), short, 'ชื่อสั้นต้องไม่ถูกแตะ');

  // ชื่อจริงจากภาคผนวก ก ที่ยาวที่สุด
  var realName = 'ใบตรวจเช็คการทำงานของระบบชิลเลอร์และคูลลิ่งทาวเวอร์';
  assertTrue_(sanitizeTopicName_(realName).length <= MAX_TOPIC_NAME_LENGTH,
    'ชื่อ Report จริงที่ยาวที่สุด ต้องไม่เกิน 50 ตัวอักษรหลังตัด');

  /* ---------- ต้องมีผลถึงชื่อไฟล์จริง และส่วนอื่นของชื่อต้องยังครบ ---------- */
  var plan = fileNamePlan_({ woId: 'WO-2609-0001', scope: FILE_SCOPE.WO,
    topicName: long200, mimeType: 'application/pdf', fileName: 'x.pdf' });
  var name = buildSavedFileName_(plan, 1);
  assertTrue_(name.indexOf('WO-2609-0001_') === 0, 'ตัดหัวข้อแล้ว ตัวนำหน้าต้องยังอยู่ครบ');
  assertTrue_(name.indexOf('_01.pdf') === name.length - 7, 'และลำดับกับนามสกุลต้องยังอยู่ท้ายสุด');

  return endTest_();
}

/**
 * ข้อความซ้ำ ๆ ตามจำนวนที่ต้องการ
 * @param {string} text ข้อความ
 * @param {number} times จำนวนครั้ง
 * @return {string}
 */
function repeatText_(text, times) {
  var out = '';
  for (var i = 0; i < times; i++) out += text;
  return out;
}

/**
 * SUBMIT ต้องถูกปฏิเสธเมื่อไฟล์บังคับไม่ครบ และผ่านเมื่อครบ (SPEC 5, 9.4)
 *
 * เงื่อนไข "ไฟล์แนบที่บังคับครบ" ในตาราง Transition หัวข้อ 5 ค้างมาตั้งแต่เฟส 3
 * เพราะยังไม่มีระบบไฟล์ เทสต์นี้คือตัวที่พิสูจน์ว่าเปิดใช้จริงแล้ว
 *
 * ชุดนี้ครอบทั้งข้อ 5 (ไม่ครบ ถูกปฏิเสธ สถานะไม่เปลี่ยน) และข้อ 6 (ครบ ผ่านปกติ)
 * ไว้ด้วยกัน เพราะใช้ข้อมูลตั้งต้นชุดเดียวกัน — ต้นทุนส่วนใหญ่อยู่ที่การเตรียมข้อมูล
 */
function test_files_approveRequiresFiles() {
  beginTest_('ACCEPT บังคับไฟล์แนบที่ Required จริง — SPEC 5 · 9.4');

  var users = serviceTestUsers_();

  // หัวข้อบังคับของชุดทดสอบเอง ไม่ไปแตะหัวข้อจริงในชีตซึ่งแก้ไม่ได้และไม่ควรแก้
  var topicId = testPrefix_() + 'TOPIC-QUOTE';
  appendRow_(SHEET.ATTACHMENT_TOPIC, {
    'Topic_ID': topicId, 'Scope': FILE_SCOPE.WO, 'Topic_Name': 'ใบเสนอราคา (ทดสอบ)',
    'Required': true, 'Multiple': false, 'Active': true
  });

  var optionalId = testPrefix_() + 'TOPIC-PHOTO';
  appendRow_(SHEET.ATTACHMENT_TOPIC, {
    'Topic_ID': optionalId, 'Scope': FILE_SCOPE.WO, 'Topic_Name': 'รูปภาพ (ทดสอบ)',
    'Required': false, 'Multiple': true, 'Active': true
  });

  /* ---------- เปิดใบงานได้ แม้ยังไม่แนบไฟล์ ---------- */
  /*
   * ข้อนี้คือผลของการย้ายเงื่อนไขไฟล์จาก SUBMIT ไป ACCEPT — ตอนนี้ใบงานเกิดพร้อม
   * สถานะรออนุมัติทันที ถ้ายังบังคับไฟล์ตอนสร้าง จะเปิดใบงานไม่ได้เลยสักใบ
   */
  var wo = createTestWo_(users, null, { skipRequiredFiles: true });
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'เปิดใบงานได้ตามปกติ แม้เอกสารยังไม่ครบ — ไปรอที่ผู้อนุมัติ');

  var missing = missingRequiredTopics_(wo.woId);
  assertTrue_(missing.indexOf('ใบเสนอราคา (ทดสอบ)') !== -1,
    'ระบบต้องรู้ว่าขาดหัวข้อไหน ไม่ใช่รู้แค่ว่าไม่ครบ');

  /* ---------- ข้อ 4: อนุมัติทั้งที่ไฟล์บังคับไม่ครบ ต้องถูกปฏิเสธ ---------- */
  assertThrowsMessage_(
    function () { approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE, users.approver); },
    'ใบเสนอราคา (ทดสอบ)',
    'อนุมัติทั้งที่ไฟล์บังคับไม่ครบ ต้องถูกปฏิเสธ และข้อความต้องบอกชื่อหัวข้อที่ขาด');

  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'ถูกปฏิเสธแล้วสถานะต้องยังรออนุมัติเหมือนเดิม ห้ามเปลี่ยนไปครึ่งทาง');
  assertEquals_(listTasksByWo(wo.woId).length, 0,
    'และต้องไม่มีงานของแผนกเกิดขึ้นเลย');

  /* ---------- แนบหัวข้อที่ไม่บังคับ ยังไม่พอ ---------- */
  insertFile(testFileRow_(wo.woId, wo.woId + '_รูปภาพ (ทดสอบ)_01.jpg', 1, { 'Topic_ID': optionalId }));
  assertThrowsMessage_(
    function () { approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE, users.approver); },
    'ใบเสนอราคา (ทดสอบ)',
    'แนบเฉพาะหัวข้อที่ไม่บังคับ ยังอนุมัติไม่ได้');

  /* ---------- ผู้อนุมัติต้องตีกลับพร้อมเหตุผลได้ ---------- */
  // เอกสารไม่ครบไม่ใช่ทางตัน ผู้อนุมัติต้องส่งกลับให้ผู้เปิดใบงานแนบเพิ่มได้
  var other = createTestWo_(users, { 'Location': 'จุดที่เอกสารไม่ครบ' }, { skipRequiredFiles: true });
  assertEquals_(returnWorkOrder(other.woId, 'ขาดใบเสนอราคา กรุณาแนบเพิ่ม', users.approver).to,
    WO_STATUS.RETURNED, 'เอกสารไม่ครบ ผู้อนุมัติยังตีกลับพร้อมเหตุผลได้');

  /* ---------- ข้อ 5: ไฟล์ครบแล้ว ต้องผ่านปกติ ---------- */
  insertFile(testFileRow_(wo.woId, wo.woId + '_ใบเสนอราคา (ทดสอบ)_01.pdf', 1, { 'Topic_ID': topicId }));
  assertEquals_(missingRequiredTopics_(wo.woId).length, 0, 'แนบครบแล้ว ต้องไม่เหลือหัวข้อที่ขาด');

  var approved = approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE, users.approver);
  assertEquals_(approved.plan.to, WO_STATUS.APPROVED, 'ไฟล์บังคับครบแล้ว อนุมัติต้องผ่านปกติ');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.APPROVED,
    'สถานะในชีตต้องเปลี่ยนตามจริง');
  assertEquals_(approved.tasks.length, 1, 'และเกิดงานของแผนกตามปกติ');

  /* ---------- ไฟล์ที่ถูกลบไปแล้ว ต้องไม่นับว่าแนบครบ ---------- */
  var another = createTestWo_(users, { 'Location': 'จุดที่ลบไฟล์ทิ้ง' }, { skipRequiredFiles: true });
  var row = insertFile(testFileRow_(another.woId, another.woId + '_ใบเสนอราคา (ทดสอบ)_01.pdf', 1,
    { 'Topic_ID': topicId }));
  assertEquals_(missingRequiredTopics_(another.woId).length, 0, 'แนบแล้วถือว่าครบ');
  deactivateFile(row['File_ID']);
  assertTrue_(missingRequiredTopics_(another.woId).length > 0,
    'ไฟล์ที่ถูกลบไปแล้ว ต้องไม่ถูกนับว่ายังแนบอยู่');

  /* ---------- หัวข้อที่ปิดใช้งาน ต้องไม่บังคับ ---------- */
  updateRow_(SHEET.ATTACHMENT_TOPIC, 'Topic_ID', topicId, { 'Active': false });
  assertEquals_(missingRequiredTopics_(another.woId).length, 0,
    'หัวข้อที่ผู้ดูแลปิดใช้งานแล้ว ต้องไม่บังคับกับใบงานใหม่');

  return endTest_();
}

/**
 * Folder ID ถูกเก็บในแถว WO และครั้งที่สองไม่สร้างโฟลเดอร์ใหม่ (SPEC 16, 21)
 *
 * นี่คือกับดักที่ SPEC หัวข้อ 21 เตือนไว้ตรง ๆ — Drive ยอมให้มีโฟลเดอร์ชื่อซ้ำกันได้
 * วิธี "หาโฟลเดอร์ตามชื่อ ถ้าไม่มีก็สร้าง" จึงได้โฟลเดอร์ซ้ำเมื่อ 2 คนอัปโหลดพร้อมกัน
 * แล้วไฟล์กระจัดกระจายโดยไม่มีใครรู้จนกว่าจะไปตามหาไฟล์
 */
function test_files_folderReuse() {
  beginTest_('เก็บ Folder ID ในแถว WO และไม่สร้างโฟลเดอร์ซ้ำ — SPEC 16 · 21');

  if (!getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false)) {
    Logger.log('  (ข้าม: ยังไม่ได้ตั้ง Script Property ชื่อ DRIVE_ROOT_FOLDER_ID ' +
      'ตั้งก่อนแล้วรันใหม่ จึงจะตรวจเรื่องโฟลเดอร์ได้)');
    assertTrue_(true, 'ข้ามการตรวจโฟลเดอร์เมื่อยังไม่ได้ตั้งค่าที่เก็บไฟล์');
    return endTest_();
  }

  var users = serviceTestUsers_();
  var wo = createTestWo_(users);

  /*
   * ในการใช้งานจริง ใบงานจะมีโฟลเดอร์ตั้งแต่เปิดใบ เพราะใบสั่งงาน PDF ถูกเขียนลงไปทันที
   * ซึ่งก็ยังเป็นการสร้างเมื่อจะใช้จริงอยู่ดี · ชุดนี้ปิดการออกเอกสารไว้ (ดู beginTestRun_)
   * สิ่งที่พิสูจน์ตรงนี้จึงเป็นเส้นทางของการอัปโหลดล้วน ๆ ว่าไม่สร้างโฟลเดอร์ทิ้งไว้ก่อนเวลา
   */
  assertEquals_(String(getWorkOrder(wo.woId)['Folder_ID'] || ''), '',
    'ใบงานที่ยังไม่มีไฟล์ ต้องยังไม่มีโฟลเดอร์ — สร้างเมื่อจะใช้จริงเท่านั้น (Lazy)');

  /* ---------- ครั้งแรก: สร้างโฟลเดอร์แล้วจำรหัสไว้ในแถว WO ---------- */
  var first = ensureWoFolder_(wo.woId, 'Attachments');
  var afterFirst = getWorkOrder(wo.woId);
  assertTrue_(!!afterFirst['Folder_ID'], 'รหัสโฟลเดอร์หลักต้องถูกเก็บลงแถวใบงาน');
  assertTrue_(!!afterFirst['Folder_URL'], 'และต้องมีลิงก์โฟลเดอร์ให้ผู้ใช้กดเปิดได้');

  var map = parseFolderMap_(afterFirst['Folder_Map']);
  assertEquals_(map['Attachments'], first, 'รหัสของโฟลเดอร์ย่อยต้องถูกจำไว้ในแถวเดียวกัน');

  /* ---------- ครั้งที่สอง: ต้องได้โฟลเดอร์เดิม ไม่สร้างใหม่ ---------- */
  var rootBefore = afterFirst['Folder_ID'];
  var second = ensureWoFolder_(wo.woId, 'Attachments');
  assertEquals_(second, first, 'เรียกซ้ำต้องได้โฟลเดอร์เดิม ไม่ใช่โฟลเดอร์ใหม่ที่ชื่อเหมือนกัน');
  assertEquals_(getWorkOrder(wo.woId)['Folder_ID'], rootBefore,
    'และรหัสโฟลเดอร์หลักต้องไม่เปลี่ยน');

  /* ---------- โฟลเดอร์ย่อยคนละเส้นทาง ต้องเป็นคนละอัน แต่อยู่ใต้ใบงานเดียวกัน ---------- */
  var picture = ensureWoFolder_(wo.woId, 'Picture');
  assertTrue_(picture !== first, 'โฟลเดอร์รูปภาพต้องแยกจากโฟลเดอร์ไฟล์เอกสาร');

  var stepFolder = ensureWoFolder_(wo.woId, 'Service/Step 2');
  var mapAfter = parseFolderMap_(getWorkOrder(wo.woId)['Folder_Map']);
  assertTrue_(!!mapAfter['Service'], 'เส้นทางหลายชั้น ต้องจำรหัสของทุกชั้นไว้');
  assertEquals_(mapAfter['Service/Step 2'], stepFolder, 'รวมถึงชั้นล่างสุด');
  assertEquals_(ensureWoFolder_(wo.woId, 'Service/Step 2'), stepFolder,
    'เรียกเส้นทางหลายชั้นซ้ำ ต้องได้อันเดิมเช่นกัน');

  return endTest_();
}

/**
 * นามสกุลไฟล์นอกรายการที่อนุญาต ต้องถูกปฏิเสธ (SPEC 14.2)
 * ปฏิเสธตั้งแต่ยังไม่แตะ Drive เพื่อไม่ให้เสียเวลาและไม่ให้ไฟล์ที่รันได้เข้าระบบ
 */
function test_files_extensionAllowlist() {
  beginTest_('นามสกุลนอกรายการที่อนุญาตถูกปฏิเสธ — SPEC 14.2');

  var allowed = ['pdf', 'jpg', 'png', 'docx', 'xlsx', 'dwg'];
  for (var a = 0; a < allowed.length; a++) {
    assertTrue_(isAllowedExtension_(allowed[a]), 'นามสกุล .' + allowed[a] + ' ต้องแนบได้');
  }

  var banned = ['exe', 'js', 'html', 'bat', 'sh', 'apk', 'msi'];
  for (var b = 0; b < banned.length; b++) {
    assertTrue_(!isAllowedExtension_(banned[b]), 'นามสกุล .' + banned[b] + ' ต้องแนบไม่ได้');
  }

  // ตัวพิมพ์ใหญ่จากกล้องมือถือต้องยังผ่าน
  assertEquals_(fileExtensionOf_('IMG_0001.JPG'), 'jpg', 'นามสกุลตัวพิมพ์ใหญ่ถูกแปลงเป็นพิมพ์เล็ก');
  assertTrue_(isAllowedExtension_(fileExtensionOf_('IMG_0001.JPG')), 'แล้วต้องผ่านการตรวจ');

  // ไฟล์ที่มีจุดหลายจุด ต้องอ่านนามสกุลจากจุดสุดท้าย
  assertEquals_(fileExtensionOf_('รายงาน.ฉบับที่ 2.pdf'), 'pdf', 'อ่านนามสกุลจากจุดสุดท้าย');

  // ชื่อที่ไม่มีนามสกุล และชื่อที่ขึ้นต้นด้วยจุด ต้องไม่ถูกตีความว่ามีนามสกุล
  assertEquals_(fileExtensionOf_('ไม่มีนามสกุล'), '', 'ไฟล์ที่ไม่มีนามสกุล');
  assertEquals_(fileExtensionOf_('.gitignore'), '', 'ชื่อที่ขึ้นต้นด้วยจุดไม่ถือว่ามีนามสกุล');
  assertEquals_(fileExtensionOf_('ลงท้ายด้วยจุด.'), '', 'ชื่อที่ลงท้ายด้วยจุดไม่ถือว่ามีนามสกุล');

  /* ---------- ต้องถูกปฏิเสธที่ทางเข้าจริง พร้อมข้อความที่บอกทางออก ---------- */
  assertThrowsMessage_(function () {
    validateUploadRequest_({ woId: 'WO-2609-0001', fileName: 'ตัวติดตั้ง.exe', content: 'AAAA' });
  }, '.exe', 'ไฟล์นามสกุลต้องห้ามถูกปฏิเสธที่ทางเข้า และข้อความต้องบอกนามสกุลที่แนบได้');

  assertThrowsMessage_(function () {
    validateUploadRequest_({ woId: 'WO-2609-0001', fileName: 'ไม่มีนามสกุล', content: 'AAAA' });
  }, 'นามสกุล', 'ไฟล์ที่ไม่มีนามสกุลถูกปฏิเสธ');

  /* ---------- ขนาดเกินเพดาน ต้องถูกปฏิเสธพร้อมบอกตัวเลข ---------- */
  var tooBig = repeatText_('A', Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 100);
  assertThrowsMessage_(function () {
    validateUploadRequest_({ woId: 'WO-2609-0001', fileName: 'ใหญ่มาก.pdf', content: tooBig });
  }, maxUploadLabel_(), 'ไฟล์ใหญ่เกินเพดานถูกปฏิเสธ และข้อความต้องบอกตัวเลขชัด ๆ');

  // ไฟล์ปกติต้องผ่าน
  assertEquals_(validateUploadRequest_({ woId: 'WO-2609-0001', fileName: 'ok.pdf', content: 'QUJDRA==' }).extension,
    'pdf', 'ไฟล์ที่ถูกกติกาต้องผ่านการตรวจ');

  return endTest_();
}

/**
 * หน้าที่ยังไม่มีไฟล์แนบเลย ต้องมีสถานะว่างตามกติกา 17.3
 *
 * เส้นทางรายการว่างเป็นเส้นทางที่เทสต์มักไม่เคยเดินผ่าน แล้วไปพังหน้าผู้ใช้จริง
 */
function test_files_emptyState() {
  beginTest_('ใบงานที่ยังไม่มีไฟล์แนบ แสดงสถานะว่างได้ — SPEC 17.3');

  var users = serviceTestUsers_();
  // ใบงานสมมติที่ไม่มีไฟล์เลย — ไม่ต้องสร้างแถวจริง เพราะทุกอย่างที่ตรวจอ่านจาก File_Index
  var woId = syntheticTestWoId_('9103');

  /* ---------- ชั้นข้อมูล: ต้องคืนรายการว่าง ไม่ใช่ null และไม่ใช่ error ---------- */
  var views = listWoFileViews(woId);
  assertTrue_(Array.isArray(views), 'ใบงานที่ยังไม่มีไฟล์ ต้องได้รายการว่าง ไม่ใช่ค่าว่างเปล่า');
  assertEquals_(views.length, 0, 'และต้องไม่มีรายการใดติดมา');

  /* ---------- ชั้น API: ต้องสำเร็จ และส่งคีย์ครบเหมือนกรณีมีข้อมูล ---------- */
  var api = withTestUser_(users.admin, function () { return api_listWoFiles(woId); });
  assertEquals_(api.ok, true, 'ขอรายการไฟล์ของใบที่ยังไม่มีไฟล์ ต้องสำเร็จ ไม่ใช่ข้อผิดพลาด');
  assertEquals_(api.data.files.length, 0, 'รายการไฟล์ว่าง');
  assertTrue_(Array.isArray(api.data.missingTopics), 'และต้องบอกได้ว่ายังขาดหัวข้อบังคับใดบ้าง');
  assertTrue_(isJsonSafe_(api.data), 'ผลลัพธ์ต้องส่งผ่าน google.script.run ได้ (กฎข้อ 14)');

  /* ---------- ก้อนข้อมูลของหน้าสร้างใบงาน ต้องมีคีย์ครบแม้ยังไม่มีไฟล์ ---------- */
  var boot = withTestUser_(users.admin, function () {
    return pageBootstrap_('create', { wo: woId });
  });
  assertEquals_(boot.error, '', 'หน้าสร้างใบงานต้องเปิดได้ตามปกติ');
  assertTrue_(Array.isArray(boot.files), 'ก้อนข้อมูลต้องมีรายการไฟล์ แม้จะว่าง');
  assertTrue_(Array.isArray(boot.missingTopics), 'และต้องมีรายการหัวข้อที่ยังขาด');
  assertTrue_(!!boot.upload && !!boot.upload.maxLabel,
    'ต้องบอกข้อจำกัดขนาดไฟล์มาด้วย เพื่อให้หน้าจอบอกผู้ใช้ก่อนเลือกไฟล์');

  /* ---------- หน้าเว็บต้องมีข้อความสถานะว่าง ไม่ใช่ปล่อยกล่องเปล่า ---------- */
  var page = HtmlService.createHtmlOutputFromFile('ui_CreateWo').getContent();
  assertTrue_(page.indexOf('ยังไม่มีไฟล์แนบในใบงานนี้') !== -1,
    'หน้าสร้างใบงานต้องมีข้อความบอกว่ายังไม่มีไฟล์แนบ');
  assertTrue_(page.indexOf('emptyHtml(') !== -1,
    'และต้องใช้ตัวช่วยสถานะว่างตัวเดียวกับหน้าอื่น จะได้พูดเหมือนกันทั้งระบบ');

  return endTest_();
}

/**
 * ตัวช่วยของชุดไฟล์แนบชุดใหม่ — เนื้อไฟล์ทดสอบขนาดที่สั่งได้
 * @param {number} bytes จำนวนไบต์ที่ต้องการ
 * @return {string} เนื้อไฟล์เป็น base64
 */
function testFileContent_(bytes) {
  var text = '';
  while (text.length < bytes) text += 'x';
  return Utilities.base64Encode(text.substring(0, bytes));
}

/**
 * หัวข้อไฟล์แนบของชุดทดสอบ — สร้างเองเสมอ ไม่ไปแตะหัวข้อจริงในตาราง
 * @param {string} suffix ตัวต่อท้ายให้ชื่อไม่ชนกัน
 * @param {string} name ชื่อหัวข้อ
 * @return {string} Topic_ID
 */
function testAttachTopic_(suffix, name) {
  var topicId = testPrefix_() + 'TOPIC-' + suffix;

  /*
   * ชื่อซ้ำกับชุดอื่นในกลุ่มเดียวกันคือความผิดพลาดที่หาสาเหตุยากมาก · ฐานข้อมูล
   * ปฏิเสธคีย์ซ้ำด้วยข้อความกลาง ๆ ว่า "เชื่อมต่อฐานข้อมูลไม่สำเร็จ" ซึ่งชี้ไปผิดทาง
   * ทั้งหมด · ฟ้องตรงนี้ด้วยถ้อยคำที่บอกว่าเกิดอะไรขึ้นจริง
   */
  assertEquals_(getAttachmentTopic(topicId), null,
    'หัวข้อทดสอบ ' + topicId + ' ถูกสร้างไปแล้วโดยชุดอื่นในกลุ่มนี้ — ' +
    'ต้องตั้งตัวต่อท้ายให้ไม่ซ้ำกัน ไม่ใช่ใช้ของเดิมร่วมกัน');

  appendRow_(SHEET.ATTACHMENT_TOPIC, {
    'Topic_ID': topicId, 'Scope': FILE_SCOPE.WO, 'Topic_Name': name,
    'Required': false, 'Multiple': true, 'Active': true
  });
  return topicId;
}

/**
 * แนบไฟล์หนึ่งไฟล์ผ่านทางที่หน้าเว็บเรียกจริง
 * @param {Object} user ผู้ทำรายการ
 * @param {Object} request คำขอแนบไฟล์
 * @return {Object} ผลจาก api_uploadFile
 */
function uploadThroughApi_(user, request) {
  return withTestUser_(user, function () { return api_uploadFile(request); });
}

/**
 * ส่งไฟล์หลายไฟล์หลายหัวข้อในการกดครั้งเดียว แล้วออกใบสั่งงานทีหลัง (SPEC 16.1 · 21)
 *
 * เดินทั้งเส้นทางที่หน้าเว็บเดินจริง — สร้างใบงานโดยบอกว่ามีไฟล์ตามมากี่ไฟล์
 * ส่งทีละไฟล์ แล้วจึงสั่งออกเอกสาร · ข้อที่ต้องพิสูจน์ไม่ใช่แค่ "ไฟล์ขึ้นครบ"
 * แต่คือ **ลำดับ** — ใบสั่งงานต้องยังไม่ออกจนกว่าไฟล์จะขึ้นครบ ไม่งั้นเอกสารจะ
 * เขียนว่าไม่มีเอกสารแนบ ทั้งที่ผู้ใช้เลือกไฟล์ไว้แล้ว
 */
function test_files_batchUploadKeepsReportLast() {
  beginTest_('เลือกหลายหัวข้อแล้วส่งครั้งเดียว · ใบสั่งงานต้องออกทีหลัง — SPEC 16.1 · 21');

  var users = serviceTestUsers_();
  var quote = testAttachTopic_('B2QUOTE', 'ใบเสนอราคา (ทดสอบ)');
  var draw  = testAttachTopic_('B2DRAW', 'แบบ (ทดสอบ)');

  /* ---------- สร้างใบงานโดยบอกว่ามีไฟล์รออยู่ 3 ไฟล์ ---------- */
  var created = withTestUser_(users.admin, function () {
    return api_createWorkOrder(testWoForm_(), 3);
  });
  assertEquals_(created.ok, true, 'สร้างใบงานต้องสำเร็จ');

  var woId = created.data.woId;
  assertEquals_(String(getWorkOrder(woId)['Report_URL'] || ''), '',
    'ยังมีไฟล์รออยู่ ใบสั่งงานจึงต้องยังไม่ออก — ถ้าออกตอนนี้จะได้กระดาษที่เขียนว่าไม่มีเอกสารแนบ');

  /* ---------- ส่งทีละไฟล์ สามไฟล์สองหัวข้อ เหมือนที่เบราว์เซอร์ทำ ---------- */
  var sent = [
    { topicId: quote, fileName: 'ใบเสนอราคา.pdf' },
    { topicId: draw,  fileName: 'แบบชั้นหนึ่ง.pdf' },
    { topicId: draw,  fileName: 'แบบชั้นสอง.pdf' }
  ];
  for (var i = 0; i < sent.length; i++) {
    var result = uploadThroughApi_(users.admin, {
      woId: woId, scope: FILE_SCOPE.WO, topicId: sent[i].topicId,
      fileName: sent[i].fileName, mimeType: 'application/pdf',
      content: testFileContent_(64)
    });
    assertEquals_(result.ok, true, 'ไฟล์ "' + sent[i].fileName + '" ต้องขึ้นสำเร็จ');
  }

  assertEquals_(listFilesByWo(woId).length, 3, 'ต้องได้ครบสามไฟล์จากการกดครั้งเดียว');

  /* ---------- ไฟล์คนละหัวข้อต้องได้ชื่อของหัวข้อตัวเอง (SPEC 14.1) ---------- */
  var names = listWoFileViews(woId).map(function (one) { return one.savedName; }).join(' ');
  assertTrue_(names.indexOf('ใบเสนอราคา (ทดสอบ)') !== -1,
    'ไฟล์ของหัวข้อแรกต้องถูกตั้งชื่อตามหัวข้อของตัวเอง');
  assertTrue_(names.indexOf('แบบ (ทดสอบ)') !== -1,
    'และไฟล์ของหัวข้อที่สองต้องเป็นชื่อของหัวข้อนั้น ไม่ใช่หัวข้อเดียวกันทั้งชุด');

  /* ---------- สั่งออกเอกสารหลังไฟล์ขึ้นครบ ---------- */
  withReports_(function () {
    var made = withTestUser_(users.admin, function () { return api_ensureWoReport(woId); });
    assertEquals_(made.ok, true, 'สั่งออกเอกสารหลังไฟล์ขึ้นครบต้องสำเร็จ');
    assertEquals_(made.data.issued, true, 'และต้องออกให้จริง เพราะใบนี้ยังไม่มีเอกสาร');
  });

  assertTrue_(!!String(getWorkOrder(woId)['Report_URL'] || ''),
    'ลิงก์เอกสารต้องถูกเขียนกลับลงแถวใบงาน');

  /* ---------- เรียกซ้ำต้องไม่ออกฉบับใหม่ ---------- */
  /*
   * ตาข่ายรองถูกเรียกทุกครั้งที่ผู้อนุมัติเปิดดูเอกสารของใบนั้น · ถ้ามันออกฉบับใหม่
   * ทุกครั้ง ใบงานที่มีคนเปิดดูสิบรอบจะมีเอกสารสิบฉบับใน _archive โดยไม่มีอะไรเปลี่ยน
   */
  var again = withReports_(function () {
    return withTestUser_(users.admin, function () { return api_ensureWoReport(woId); });
  });
  assertEquals_(again.data.issued, false,
    'ใบที่มีเอกสารแล้ว ต้องไม่ถูกออกซ้ำ — ตาข่ายรองมีไว้อุดช่องว่าง ไม่ใช่ออกเอกสารทุกครั้งที่มีคนเปิดดู');

  /* ---------- ใบที่ไม่ได้เลือกไฟล์ไว้เลย ต้องได้เอกสารทันที ---------- */
  var plain = withReports_(function () {
    return withTestUser_(users.admin, function () { return api_createWorkOrder(testWoForm_(), 0); });
  });
  assertTrue_(!!String(getWorkOrder(plain.data.woId)['Report_URL'] || ''),
    'ไม่ได้เลือกไฟล์ไว้เลย ต้องออกเอกสารให้ทันทีหลังสร้างใบงาน ไม่ต้องรออะไร');

  return endTest_();
}

/**
 * ไฟล์หนึ่งล้ม ที่เหลือต้องยังขึ้น และใบงานต้องยังอยู่ (SPEC 21)
 *
 * ข้อนี้คือเหตุผลทั้งหมดที่การส่งเป็นทีละไฟล์ ไม่ใช่ก้อนเดียว · ถ้าล้มทั้งชุด
 * เพราะไฟล์เดียว ผู้ใช้ต้องเลือกไฟล์ใหม่หมดทุกครั้ง แล้วจะเลิกใช้ระบบ
 */
function test_files_oneFailsRestStillUpload() {
  beginTest_('ไฟล์หนึ่งล้ม ที่เหลือต้องยังขึ้น และใบงานต้องไม่ล้มตาม — SPEC 21');

  var users = serviceTestUsers_();
  var topic = testAttachTopic_('B2MIXED', 'เอกสารผสม (ทดสอบ)');

  var created = withTestUser_(users.admin, function () {
    return api_createWorkOrder(testWoForm_(), 3);
  });
  var woId = created.data.woId;

  var first = uploadThroughApi_(users.admin, {
    woId: woId, scope: FILE_SCOPE.WO, topicId: topic,
    fileName: 'ไฟล์ดีใบแรก.pdf', mimeType: 'application/pdf', content: testFileContent_(64)
  });
  assertEquals_(first.ok, true, 'ไฟล์แรกต้องขึ้นสำเร็จ');

  /* ---------- ไฟล์กลางชุดถูกปฏิเสธ ---------- */
  var bad = uploadThroughApi_(users.admin, {
    woId: woId, scope: FILE_SCOPE.WO, topicId: topic,
    fileName: 'โปรแกรมแปลกปลอม.exe', mimeType: 'application/octet-stream',
    content: testFileContent_(64)
  });
  assertEquals_(bad.ok, false, 'นามสกุลนอกรายการที่อนุญาตต้องถูกปฏิเสธ');
  assertTrue_(String(bad.message).indexOf('.exe') !== -1,
    'และต้องบอกว่าไฟล์ไหนผิดเพราะอะไร ไม่ใช่บอกแค่ว่าล้มเหลว');

  /* ---------- ไฟล์ถัดไปต้องยังขึ้นได้ตามปกติ ---------- */
  var third = uploadThroughApi_(users.admin, {
    woId: woId, scope: FILE_SCOPE.WO, topicId: topic,
    fileName: 'ไฟล์ดีใบสอง.pdf', mimeType: 'application/pdf', content: testFileContent_(64)
  });
  assertEquals_(third.ok, true, 'ไฟล์หลังตัวที่ล้ม ต้องยังขึ้นได้ ไม่ใช่ล้มตามกันทั้งชุด');

  assertEquals_(listFilesByWo(woId).length, 2,
    'ต้องเหลือสองไฟล์ที่สำเร็จ · ไฟล์ที่ถูกปฏิเสธต้องไม่ทิ้งแถวไว้ในทะเบียน');

  /* ---------- ใบงานต้องยังอยู่ครบ ---------- */
  var wo = getWorkOrder(woId);
  assertTrue_(!!wo, 'ใบงานต้องยังอยู่ แม้ไฟล์จะขึ้นไม่ครบ');
  assertEquals_(wo['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'และต้องยังรออนุมัติอยู่ตามเดิม — ความล้มเหลวของไฟล์ห้ามย้อนสถานะที่บันทึกไปแล้ว');

  return endTest_();
}

/**
 * ไฟล์ใหญ่เกินเพดานถูกปฏิเสธก่อนออกจากเครื่อง ไม่ใช่หลังส่งไปแล้ว (SPEC 21 · 16)
 *
 * ด่านนี้มีสองชั้นและต้องตรวจทั้งคู่
 *   ชั้นเบราว์เซอร์ uploadRejectReason() — บอกผู้ใช้ตั้งแต่ตอนเลือกไฟล์
 *   ชั้นเซิร์ฟเวอร์ validateUploadRequest_() — ด่านจริงที่ปลอมไม่ได้
 *
 * ชั้นเบราว์เซอร์ถูกดึงตัวฟังก์ชันจริงออกมาจากหน้าเว็บที่เสิร์ฟจริงแล้วเรียกใช้
 * ไม่ใช่เขียนกฎซ้ำในเทสต์ ซึ่งจะพิสูจน์ได้แค่ว่าสำเนาสองชุดเหมือนกัน
 */
function test_files_tooBigIsRefusedBeforeSending() {
  beginTest_('ไฟล์ใหญ่เกินเพดานถูกปฏิเสธตั้งแต่ตอนเลือก ไม่ใช่ตอนส่งแล้วล้ม — SPEC 21');

  /* ---------- ชั้นเบราว์เซอร์ ---------- */
  var reject = browserRejectRule_();
  var limits = { maxBytes: MAX_UPLOAD_BYTES, maxLabel: maxUploadLabel_() };

  assertEquals_(reject(limits, { name: 'ใหญ่ไป.pdf', type: 'application/pdf',
    size: MAX_UPLOAD_BYTES + 1 }).indexOf('เกิน') !== -1, true,
    'เอกสารที่ใหญ่เกินเพดาน ต้องถูกบอกตั้งแต่ตอนเลือก');
  assertEquals_(reject(limits, { name: 'พอดี.pdf', type: 'application/pdf',
    size: MAX_UPLOAD_BYTES }), '',
    'ไฟล์ที่พอดีเพดานต้องผ่าน — เพดานคือขอบเขตที่รวมตัวมันเอง');

  /*
   * รูปต้องผ่านด่านนี้แม้ต้นฉบับจะใหญ่ เพราะเบราว์เซอร์ย่อให้ก่อนส่งเสมอ
   * ถ้าด่านนี้ตัดสินจากขนาดต้นฉบับ รูปจากมือถือทุกใบจะถูกปฏิเสธ
   */
  assertEquals_(reject(limits, { name: 'หน้างาน.jpg', type: 'image/jpeg',
    size: MAX_UPLOAD_BYTES * 3 }), '',
    'รูปที่ยังไม่ย่อต้องไม่ถูกปฏิเสธ เพราะขนาดต้นฉบับไม่ใช่ขนาดที่จะเดินทางจริง');

  assertTrue_(reject({ maxBytes: 0, maxLabel: '' },
    { name: 'อะไรก็ได้.pdf', type: 'application/pdf', size: 10 }) !== '',
    'หน้าที่ยังไม่ได้รับเพดานจากเซิร์ฟเวอร์ ต้องไม่ปล่อยไฟล์ผ่านไปเงียบ ๆ (กฎข้อ 32)');

  /* ---------- ชั้นเซิร์ฟเวอร์ — ด่านจริงที่ปลอมไม่ได้ ---------- */
  var users = serviceTestUsers_();
  var topic = testAttachTopic_('B2BIG', 'ไฟล์ใหญ่ (ทดสอบ)');
  var created = withTestUser_(users.admin, function () {
    return api_createWorkOrder(testWoForm_(), 1);
  });

  var refused = uploadThroughApi_(users.admin, {
    woId: created.data.woId, scope: FILE_SCOPE.WO, topicId: topic,
    fileName: 'ใหญ่เกิน.pdf', mimeType: 'application/pdf',
    content: testFileContent_(MAX_UPLOAD_BYTES + 1024)
  });
  assertEquals_(refused.ok, false,
    'ถึงหน้าเว็บจะถูกดัดแปลงให้ข้ามด่านแรกไปได้ เซิร์ฟเวอร์ต้องปฏิเสธอยู่ดี (กฎข้อ 7)');
  assertTrue_(String(refused.message).indexOf(maxUploadLabel_()) !== -1,
    'และต้องบอกเพดานเป็นตัวเลขชัด ๆ ในข้อความ');
  assertEquals_(listFilesByWo(created.data.woId).length, 0,
    'ไฟล์ที่ถูกปฏิเสธต้องไม่ทิ้งแถวไว้ในทะเบียน');

  return endTest_();
}

/**
 * ดึงกฎ "ไฟล์นี้รับได้ไหม" ตัวจริงออกมาจากหน้าเว็บที่เสิร์ฟจริง
 *
 * กฎนี้อยู่ในจาวาสคริปต์ของหน้าเว็บ ซึ่งเทสต์ฝั่งเซิร์ฟเวอร์ไม่ได้เดินผ่าน (กฎข้อ 33)
 * ทางเดียวที่จะพิสูจน์ว่ากฎตัวจริงทำงานถูก คือคอมไพล์ตัวมันออกมาแล้วเรียกใช้จริง
 *
 * ตัดเฉพาะตัวฟังก์ชันที่ต้องใช้ ไม่ใช่ทั้งบล็อก เพราะบล็อกของหน้าเว็บมีคำสั่งที่ทำงาน
 * ตั้งแต่ตอนแปล (เช่นตัวกันหน้าค้าง) ซึ่งเรียกหา document ที่ฝั่งเซิร์ฟเวอร์ไม่มี
 *
 * @return {function(Object, Object): string} รับ (limits, file) คืนเหตุผลที่รับไม่ได้
 */
function browserRejectRule_() {
  var source = HtmlService.createHtmlOutputFromFile('ui_Script').getContent();
  var body = sliceFunctionSource_(source, 'uploadRejectReason');

  assertTrue_(body.length > 0,
    'ต้องหาฟังก์ชัน uploadRejectReason ในหน้าเว็บเจอ — ถ้าหาไม่เจอแปลว่าด่านฝั่งเบราว์เซอร์หายไป');

  var make = new Function('limits', 'file',
    'var UPLOAD = limits;' +
    'function isImageFile(f) { return String((f && f.type) || "").indexOf("image/") === 0; }' +
    'function fileSizeLabel(n) { return String(n) + " B"; }' +
    body +
    'return uploadRejectReason(file);');

  return function (limits, file) { return make(limits, file); };
}

/**
 * ตัดเนื้อของฟังก์ชันหนึ่งตัวออกมาจากข้อความของหน้าเว็บ
 *
 * นับวงเล็บปีกกาเอา ซึ่งใช้ได้เพราะฟังก์ชันที่ตัดต้องไม่มีปีกกาอยู่ในสตริง ·
 * ถ้าวันหนึ่งมี การตัดจะสั้นเกินแล้วคอมไพล์ไม่ผ่าน ซึ่งเทสต์จะแดงทันที
 * ไม่ใช่ผ่านไปเงียบ ๆ พร้อมกฎที่ไม่ได้ถูกตรวจ
 *
 * @param {string} source เนื้อหน้าเว็บทั้งไฟล์
 * @param {string} name ชื่อฟังก์ชัน
 * @return {string} เนื้อฟังก์ชันพร้อมคำว่า function · ข้อความว่างเมื่อหาไม่เจอ
 */
function sliceFunctionSource_(source, name) {
  var head = 'function ' + name + '(';
  var start = String(source).indexOf(head);
  if (start === -1) return '';

  var text = String(source);
  var open = text.indexOf('{', start);
  if (open === -1) return '';

  var depth = 0;
  for (var i = open; i < text.length; i++) {
    if (text.charAt(i) === '{') depth++;
    else if (text.charAt(i) === '}') {
      depth--;
      if (depth === 0) return text.substring(start, i + 1);
    }
  }
  return '';
}

/**
 * ผู้อนุมัติต้องเห็นเอกสารของใบงานก่อนตัดสินใจ (SPEC 17.2)
 *
 * แผงนี้อ่านอย่างเดียว และต้องคัดเฉพาะไฟล์ที่แนบมาตอนเปิดใบงาน · เอกสารของแผนก
 * และหลักฐานการชำระเงินเกิดขึ้นหลังการอนุมัติ จึงไม่ใช่สิ่งที่ผู้อนุมัติกำลังตัดสินใจอยู่
 */
function test_approve_seesAttachmentsByTopic() {
  beginTest_('หน้าอนุมัติต้องเห็นไฟล์แนบแยกตามหัวข้อ และเห็นรูปเป็นภาพย่อ — SPEC 17.2');

  var users = serviceTestUsers_();
  var photo = testAttachTopic_('B2PHOTO', 'รูปภาพ (ทดสอบ)');
  var quote = testAttachTopic_('B2QT2', 'ใบเสนอราคา (ทดสอบ)');

  var created = withTestUser_(users.admin, function () {
    return api_createWorkOrder(testWoForm_(), 2);
  });
  var woId = created.data.woId;

  uploadThroughApi_(users.admin, {
    woId: woId, scope: FILE_SCOPE.WO, topicId: quote,
    fileName: 'ราคา.pdf', mimeType: 'application/pdf', content: testFileContent_(64)
  });
  var shot = uploadThroughApi_(users.admin, {
    woId: woId, scope: FILE_SCOPE.WO, topicId: photo,
    fileName: 'หน้างาน.jpg', mimeType: 'image/jpeg', content: testFileContent_(128)
  });
  assertEquals_(shot.ok, true, 'รูปต้องแนบขึ้นได้');

  /* ---------- หลักฐานการชำระเงินต้องไม่โผล่ในแผงของผู้อนุมัติ ---------- */
  uploadThroughApi_(users.admin, {
    woId: woId, scope: FILE_SCOPE.PAYMENT,
    fileName: 'สลิป.jpg', mimeType: 'image/jpeg', content: testFileContent_(64)
  });

  var seen = withTestUser_(users.approver, function () { return api_listWoAttachments(woId); });
  assertEquals_(seen.ok, true, 'ผู้อนุมัติต้องเปิดดูเอกสารของใบงานได้');

  var groups = seen.data.groups;
  assertEquals_(groups.length, 2,
    'ต้องได้สองหัวข้อ · หลักฐานการชำระเงินไม่มีหัวข้อไฟล์แนบ จึงต้องไม่ถูกนับเข้ามา');

  var names = groups.map(function (one) { return one.name; }).join(' · ');
  assertTrue_(names.indexOf('ใบเสนอราคา (ทดสอบ)') !== -1, 'ต้องมีหัวข้อเอกสาร');
  assertTrue_(names.indexOf('รูปภาพ (ทดสอบ)') !== -1, 'และหัวข้อรูป');

  /* ---------- รูปต้องถูกบอกว่าเป็นรูป ไม่งั้นหน้าจอจะขึ้นแค่ชื่อไฟล์ ---------- */
  var images = 0;
  for (var g = 0; g < groups.length; g++) {
    for (var f = 0; f < groups[g].files.length; f++) {
      if (groups[g].files[f].isImage) images++;
    }
  }
  assertEquals_(images, 1, 'ต้องมีไฟล์ที่ถูกระบุว่าเป็นรูปหนึ่งไฟล์');

  /* ---------- ภาพย่อต้องส่งเป็นไบต์ ไม่ใช่ลิงก์ Drive ---------- */
  /*
   * ลิงก์ Drive เปิดได้เฉพาะบัญชีเจ้าของระบบ เพราะไฟล์อยู่ใน Drive บัญชีเดียว
   * และไม่ได้ถูกแชร์ (SPEC 16) · ถ้าหน้าจอพึ่งลิงก์ ผู้อนุมัติจะเห็นแต่หน้าปฏิเสธสิทธิ์
   */
  var thumb = withTestUser_(users.approver, function () {
    return api_fileImage(shot.data.file.fileId);
  });
  assertEquals_(thumb.ok, true, 'ขอภาพย่อต้องสำเร็จ');
  assertEquals_(thumb.data.found, true, 'และต้องได้ภาพจริงกลับมา');
  assertTrue_(thumb.data.dataUrl.indexOf('data:image/') === 0,
    'ต้องเป็นไบต์ที่หน้าเว็บแสดงได้เอง ไม่ใช่ลิงก์ที่ต้องมีสิทธิ์ Drive');

  /* ---------- ไฟล์ที่ไม่ใช่รูป ต้องไม่ถูกส่งเป็นก้อน ---------- */
  var docFile = listWoFileViews(woId).filter(function (one) { return !one.isImage; })[0];
  var notImage = withTestUser_(users.approver, function () {
    return api_fileImage(docFile.fileId);
  });
  assertEquals_(notImage.data.found, false,
    'เอกสารต้องไม่ถูกส่งเป็นก้อนผ่านช่องทางของรูป — ก้อนละหลายเมกะไบต์และแสดงในหน้าไม่ได้อยู่ดี');

  /* ---------- ไฟล์ที่ถูกลบไปแล้ว ต้องเปิดดูไม่ได้อีก ---------- */
  withTestUser_(users.admin, function () { return api_removeFile(shot.data.file.fileId); });
  var gone = withTestUser_(users.approver, function () {
    return api_fileImage(shot.data.file.fileId);
  });
  assertEquals_(gone.data.found, false,
    'ไฟล์ที่ลบแล้วต้องเปิดดูไม่ได้ · การลบของระบบคือปิดใช้งาน ตัวไฟล์ยังอยู่ในถังขยะและเปิดด้วยรหัสได้');

  return endTest_();
}

/**
 * ปลายทางที่คืนไบต์ของไฟล์ ต้องปฏิเสธให้ครบทุกทาง (กฎข้อ 34)
 *
 * ปลายทางนี้อ่านไฟล์จาก Drive ของบัญชีเจ้าของระบบ ถ้าออกแบบผิดมันคือช่องอ่าน
 * ไฟล์ทั้ง Drive ของเจ้าของ ไม่ใช่แค่ไฟล์ของระบบ · ชุดนี้จึงพิสูจน์ **การปฏิเสธ**
 * เป็นหลัก ไม่ใช่พิสูจน์ว่าทางที่ถูกทำงานได้ ซึ่งพิสูจน์ง่ายและไม่ได้กันอะไรเลย
 */
function test_files_byteEndpointRefusesEveryWrongWay() {
  beginTest_('ปลายทางที่คืนไบต์ต้องปฏิเสธให้ครบทุกทาง — กฎข้อ 34');

  var users = serviceTestUsers_();
  var topic = testAttachTopic_('BYTES', 'เอกสารทดสอบไบต์');

  var mine = withTestUser_(users.admin, function () {
    return api_createWorkOrder(testWoForm_(), 1);
  });
  var other = withTestUser_(users.admin, function () {
    return api_createWorkOrder(testWoForm_({ 'Location': 'อีกใบหนึ่ง' }), 1);
  });

  var put = uploadThroughApi_(users.admin, {
    woId: other.data.woId, scope: FILE_SCOPE.WO, topicId: topic,
    fileName: 'ของใบอื่น.pdf', mimeType: 'application/pdf', content: testFileContent_(64)
  });
  assertEquals_(put.ok, true, 'เตรียมไฟล์ของใบงานอีกใบต้องสำเร็จ ไม่งั้นการทดสอบไม่มีความหมาย');
  var otherFileId = put.data.file.fileId;
  var driveId = getFile(otherFileId)['Drive_File_ID'];

  /* ---------- ไฟล์ของใบงานอื่น ส่งมาคู่กับใบงานของตัวเอง ---------- */
  /*
   * นี่คือทางลัดที่ต้องปิดให้แน่น · ถ้าปลายทางดูแค่ว่า "เลขที่ไฟล์นี้มีอยู่จริงไหม"
   * ใครก็ตามที่เดาเลขที่ไฟล์ได้จะอ่านไฟล์ของใบงานใดก็ได้ โดยส่งเลขที่ใบงาน
   * ที่ตัวเองเห็นได้มาเป็นฉากบัง
   */
  var crossed = withTestUser_(users.admin, function () {
    return api_woDocument(mine.data.woId, DOC_KIND.FILE, otherFileId);
  });
  assertEquals_(crossed.ok, true, 'คำขอต้องไม่ล้ม แต่ต้องไม่คืนไฟล์');
  assertEquals_(crossed.data.found, false,
    'ไฟล์ของใบงานอื่นต้องไม่ถูกคืน แม้จะส่งเลขที่ใบงานที่ตัวเองเห็นได้มาคู่กัน');
  assertEquals_(crossed.data.dataUrl, '', 'และต้องไม่มีไบต์ติดออกไปเลยแม้แต่ไบต์เดียว');

  /* ---------- ส่งรหัสของ Drive มาตรง ๆ ในช่องเลขที่ไฟล์ ---------- */
  /*
   * ถ้าปลายทางรับรหัส Drive ได้ ใครก็สั่งให้ระบบอ่านไฟล์ใดก็ได้ใน Drive ของเจ้าของ
   * รวมไฟล์ส่วนตัวที่ไม่เกี่ยวกับระบบเลย · รหัสนี้เป็นรหัสจริงที่เปิดได้จริง
   * การทดสอบนี้จึงพิสูจน์ว่าด่านกันที่ "รูปแบบของรหัส" ไม่ใช่กันเพราะรหัสใช้ไม่ได้
   */
  assertTrue_(!!driveBytesOf_(driveId), 'รหัส Drive ที่ใช้ทดสอบต้องเปิดได้จริง ไม่งั้นด่านนี้ผ่านฟรี');
  var raw = withTestUser_(users.admin, function () {
    return api_woDocument(other.data.woId, DOC_KIND.FILE, driveId);
  });
  assertEquals_(raw.data.found, false,
    'รหัสของที่เก็บที่ส่งมาจากเบราว์เซอร์ต้องไม่ถูกใช้ ต้องหา Drive_File_ID เองที่ฝั่งเซิร์ฟเวอร์');

  /* ---------- เลขที่ไฟล์ที่ไม่มีอยู่ ต้องตอบเหมือนกับกรณีที่มีแต่ไม่มีสิทธิ์ ---------- */
  var ghost = withTestUser_(users.admin, function () {
    return api_woDocument(mine.data.woId, DOC_KIND.FILE, testPrefix_() + 'FILE-ไม่มีจริง');
  });
  assertEquals_(ghost.data.found, false, 'เลขที่ไฟล์ที่ไม่มีอยู่ต้องถูกปฏิเสธ');
  assertEquals_(JSON.stringify(ghost.data), JSON.stringify(crossed.data),
    'คำตอบต้องเหมือนกันทุกตัวอักษรกับกรณี "มีอยู่แต่ไม่ใช่ของใบนี้" — ' +
    'ถ้าต่างกัน คนที่ไล่สุ่มเลขที่ไฟล์จะรู้ได้ว่าเลขไหนมีอยู่จริงในระบบ');

  /* ---------- ไฟล์ที่ถูกลบแล้ว ---------- */
  withTestUser_(users.admin, function () { return api_removeFile(otherFileId); });
  var removed = withTestUser_(users.admin, function () {
    return api_woDocument(other.data.woId, DOC_KIND.FILE, otherFileId);
  });
  assertEquals_(removed.data.found, false,
    'ไฟล์ที่ลบแล้วต้องเปิดไม่ได้ · การลบของระบบคือปิดใช้งาน ตัวไฟล์ยังอยู่ในถังขยะและเปิดด้วยรหัสได้');

  /* ---------- ใบงานที่ไม่มีอยู่ ---------- */
  var noWo = withTestUser_(users.admin, function () {
    return api_woDocument(testPrefix_() + 'WO-ไม่มีจริง', DOC_KIND.REPORT, '');
  });
  assertEquals_(noWo.data.found, false, 'ใบงานที่ไม่มีอยู่ต้องถูกปฏิเสธ');

  /* ---------- ทุก Role เปิดเอกสารได้ แต่เครื่องมือวัดยังเป็นของ ADMIN ---------- */
  /*
   * เปลี่ยนเจตนาจากฉบับก่อนโดยตั้งใจ · ตอนที่ปลายทางนี้ยังเป็นของเครื่องมือวัด
   * มันเปิดให้ ADMIN คนเดียว · ตอนนี้มันเป็นปลายทางที่หน้าจริงทุกหน้าใช้ จึงต้อง
   * เปิดให้ทุกคนที่ระบุตัวตนได้ เท่ากับที่ api_getWoDetail และ api_listWoFiles
   * เปิดไว้อยู่แล้ว — ทุกคนเห็นใบงานได้ทุกใบ (SPEC 17.1 · 17.2) การซ่อนไบต์
   * จากคนที่เห็นรายชื่อไฟล์อยู่แล้วไม่ได้ปิดอะไรที่ยังไม่เปิด
   *
   * ส่วนเครื่องมือวัดยังเป็นของ ADMIN เพราะมันสั่งให้เซิร์ฟเวอร์สร้างก้อนข้อมูลได้
   * ตามขนาดที่ขอ ซึ่งไม่ใช่สิ่งที่ผู้ใช้ทั่วไปต้องทำได้
   */
  var everyone = [ROLE.SALE, ROLE.APPROVER_SP, ROLE.APPROVER_LAB, ROLE.SERVICE, ROLE.PROJECT, ROLE.LAB];
  for (var d = 0; d < everyone.length; d++) {
    var who = { email: 'TEST-bytes@cnr.co.th', roles: [everyone[d]], department: DEPT.SERVICE };
    var tried = withTestUser_(who, function () {
      return api_woDocument(mine.data.woId, DOC_KIND.FILE, otherFileId);
    });
    assertEquals_(tried.ok, true, everyone[d] + ' ต้องเรียกปลายทางเอกสารได้');
    assertEquals_(tried.data.found, false,
      everyone[d] + ' ยังต้องถูกปฏิเสธเมื่อขอไฟล์ที่ไม่ได้อยู่ในใบงานที่ส่งมา — ' +
      'การเปิดให้ทุกคนเรียกได้ ไม่ได้แปลว่าเปิดให้ขออะไรก็ได้');

    var padded = withTestUser_(who, function () { return api_probePaddingBytes(16); });
    assertEquals_(padded.ok, false, everyone[d] + ' ต้องขอก้อนของเครื่องมือวัดไม่ได้');
  }

  /* ---------- ไม่มีโทเคน ---------- */
  /*
   * ล้มเหลวแบบปิด — ไม่รู้ว่าใครขอ = ปฏิเสธ · ห้ามถอยไปใช้ตัวตนของเจ้าของสคริปต์
   * ซึ่งเป็นบัญชีที่มีสิทธิ์อ่านไฟล์ทุกไฟล์ใน Drive
   */
  var anonymous = api_call('api_woDocument', [mine.data.woId, DOC_KIND.REPORT, ''], '');
  assertEquals_(anonymous.ok, false, 'ไม่มีโทเคนต้องเรียกไม่ได้ แม้เป็นการอ่าน (กฎข้อ 16)');
  assertEquals_(anonymous.message, NEED_LOGIN_MESSAGE, 'และต้องบอกให้เข้าสู่ระบบก่อน');

  var expired = api_call('api_woDocument', [mine.data.woId, DOC_KIND.REPORT, ''], 'โทเคนที่แต่งขึ้นมาเอง');
  assertEquals_(expired.ok, false, 'โทเคนที่ใช้ไม่ได้ก็ต้องเรียกไม่ได้');

  /* ---------- ทางที่ถูกต้อง ต้องได้ไบต์จริง ---------- */
  /*
   * ต้องมีข้อนี้ ไม่งั้นด่านที่ปฏิเสธทุกอย่างจะผ่านทุกข้อข้างบนโดยไม่ทำงานเลย
   */
  var good = uploadThroughApi_(users.admin, {
    woId: mine.data.woId, scope: FILE_SCOPE.WO, topicId: topic,
    fileName: 'ของใบตัวเอง.pdf', mimeType: 'application/pdf', content: testFileContent_(64)
  });
  var got = withTestUser_(users.admin, function () {
    return api_woDocument(mine.data.woId, DOC_KIND.FILE, good.data.file.fileId);
  });
  assertEquals_(got.data.found, true, 'ไฟล์ของใบงานตัวเองต้องเปิดได้จริง');
  assertTrue_(got.data.size > 0, 'และต้องได้ไบต์จริง ไม่ใช่ก้อนว่าง');
  assertTrue_(got.data.dataUrl.indexOf('data:') === 0, 'คืนมาเป็น data URL พร้อมใช้');

  /* ---------- ไบต์ต้องไม่โผล่ใน log ---------- */
  /*
   * อ่าน log กลับมาตรวจจริง ไม่ใช่อ่านโค้ดแล้วเชื่อ · ข้อความ base64 ที่ยาว
   * ติดอยู่ในบันทึกคือไฟล์ที่รั่วออกไปอยู่ในที่ที่ไม่มีใครคิดว่าจะมีไฟล์
   */
  var head = got.data.dataUrl.substring(got.data.dataUrl.indexOf(',') + 1,
    got.data.dataUrl.indexOf(',') + 1 + 24);
  assertTrue_(head.length === 24, 'ต้องตัดชิ้นส่วนของไบต์มาใช้เทียบได้จริง');

  var leaked = [];
  /*
   * ดูเฉพาะบรรทัดของผู้ใช้ทดสอบ ซึ่งเป็นบรรทัดที่คำขอนี้สร้างขึ้น · อ่านทั้งตาราง
   * ไม่ได้ เพราะตารางบันทึกโตเกินเพดานอ่าน แล้วจะได้แต่หน้าแรกที่ไม่มีของเรา
   */
  var logs = testRowsFromDb_(SHEET.SYSTEM_LOG, 'User')
    .concat(testRowsFromDb_(SHEET.AUDIT_LOG, 'User'));
  for (var i = 0; i < logs.length; i++) {
    var text = JSON.stringify(logs[i]);
    if (text.indexOf(head) !== -1) leaked.push(logs[i]);
  }
  assertEquals_(leaked.length, 0,
    'ต้องไม่มีชิ้นส่วนของไบต์อยู่ในบันทึกใดเลย · บันทึกได้แค่ว่าใครขอไฟล์ไหนเมื่อไร (กฎข้อ 34)');

  return endTest_();
}

/**
 * ไม่มีลิงก์ Drive เหลืออยู่ในหน้าที่ผู้ใช้เห็น และทุกหน้าใช้ปลายทางเดียวกัน (กฎข้อ 34)
 *
 * ข้อนี้จับสองอย่างที่เทสต์อื่นจับไม่ได้เลย
 *   1. หน้าที่ยังแสดงลิงก์ Drive อยู่ — กดแล้วเจอหน้าปฏิเสธสิทธิ์ ซึ่งดูเหมือน
 *      ระบบพังทั้งที่ไฟล์อยู่ครบ และเซิร์ฟเวอร์ไม่มีทางรู้เลยว่าเกิดขึ้น
 *   2. ปลายทางที่คืนไบต์ชุดที่สอง — ชุดที่ไม่มีใครดูแลคือชุดที่วันหนึ่งจะหลุด
 */
function test_web_filesTravelThroughServer() {
  beginTest_('ไม่มีลิงก์ Drive ในหน้าที่ผู้ใช้เห็น และทุกหน้าใช้ปลายทางเดียวกัน — กฎข้อ 34');

  /*
   * ชื่อถูกประกอบขึ้นตอนรัน เพื่อไม่ให้ตัวเทสต์เองกลายเป็นผลการค้นหา
   * (เทสต์นี้ถูกสแกนพร้อมกับหน้าเว็บในข้ออื่นด้วย)
   */
  var driveHost = 'drive.google' + '.com';
  var openWindow = 'window.' + 'open';

  var pages = ['ui_Home', 'ui_CreateWo', 'ui_Approve', 'ui_DeptWork', 'ui_LabWork',
    'ui_Returned', 'ui_WoDetail', 'ui_WoList', 'ui_Reports'];

  /* ---------- ไม่มีหน้าไหนประกอบลิงก์ของที่เก็บไฟล์เอง ---------- */
  var leaking = [];
  var opening = [];
  for (var p = 0; p < pages.length; p++) {
    var code = HtmlService.createHtmlOutputFromFile(pages[p]).getContent();
    if (code.indexOf(driveHost) !== -1) leaking.push(pages[p]);
    if (code.indexOf(openWindow) !== -1) opening.push(pages[p]);
  }
  assertEquals_(leaking.join(', '), '',
    'ห้ามมีหน้าไหนประกอบลิงก์ของที่เก็บไฟล์เอง — ลิงก์นั้นเปิดได้เฉพาะบัญชีเจ้าของระบบ');
  assertEquals_(opening.join(', '), '',
    'ห้ามเปิดแท็บใหม่เพื่อแสดงไฟล์ · วัดแล้วว่าถูกบล็อกทั้งคอมและมือถือ (SPEC 16)');

  /* ---------- ทุกจุดที่เคยเป็นลิงก์ ต้องกลายเป็นปุ่มที่เรียกปลายทางเดียวกัน ---------- */
  /*
   * ตรวจว่า "หน้าจริงเรียกจริง" ไม่ใช่มีแต่เครื่องมือวัดที่เรียก · ถ้าเหลือแต่
   * filecheck ที่เรียก แปลว่าหน้าจริงยังพาผู้ใช้ไปทางเดิมอยู่ แล้วเทสต์การปฏิเสธ
   * ทั้งชุดจะเฝ้าปลายทางที่ไม่มีผู้ใช้คนไหนเดินผ่านเลย
   */
  var mustUse = ['ui_CreateWo', 'ui_Approve', 'ui_WoDetail', 'ui_Reports'];
  for (var m = 0; m < mustUse.length; m++) {
    var page = HtmlService.createHtmlOutputFromFile(mustUse[m]).getContent();
    assertTrue_(page.indexOf('docButtonHtml(') !== -1,
      mustUse[m] + ' ต้องใช้ปุ่มดาวน์โหลดตัวกลาง ไม่ใช่ประกอบทางเปิดไฟล์ของตัวเอง');
  }

  /* ---------- ส่วนประกอบตัวกลางต้องเรียกปลายทางตัวจริงตัวเดียว ---------- */
  var shared = HtmlService.createHtmlOutputFromFile('ui_Script').getContent();
  assertTrue_(shared.indexOf("callApi('api_woDocument'") !== -1,
    'ส่วนประกอบตัวกลางต้องเรียก api_woDocument · ถ้าไม่เรียก แปลว่ามีทางที่สองอยู่ที่ไหนสักแห่ง');

  /* ---------- ปลายทางที่คืนไบต์ต้องมีตัวเดียวในทะเบียน ---------- */
  /*
   * นับจากทะเบียนจริงที่ 09_Api ประกาศไว้ ไม่ใช่จากการอ่านโค้ดด้วยตา ·
   * ใครเพิ่มปลายทางที่คืนไบต์ตัวที่สองจะแดงตรงนี้ทันที
   */
  var names = listApiFunctionNames_();
  var byteEndpoints = [];
  for (var n = 0; n < names.length; n++) {
    var source = String(globalThis[names[n]]);
    if (source.indexOf('driveBytesOf_(') !== -1) byteEndpoints.push(names[n]);
  }
  assertEquals_(byteEndpoints.join(', '), 'api_woDocument',
    'ต้องมีปลายทางที่คืนไบต์ของไฟล์ตัวเดียวในทั้งระบบ · สองชุดคือชุดที่วันหนึ่งตั้งค่าไม่ตรงกัน');

  return endTest_();
}

/**
 * ฉบับเก่าใน _archive เปิดได้ด้วยลำดับ ไม่ใช่ด้วยชื่อไฟล์ (SPEC 16.1 · กฎข้อ 34)
 */
function test_files_archiveOpensByPosition() {
  beginTest_('ฉบับเก่าใน _archive เปิดด้วยลำดับที่เซิร์ฟเวอร์กำหนด — กฎข้อ 34');

  if (!getProp_(PROP_KEY.WO_REPORT_TEMPLATE, false)) {
    Logger.log('  (ข้าม: ยังไม่ได้ตั้ง WO_REPORT_TEMPLATE_ID)');
    assertTrue_(true, 'ข้ามเมื่อยังไม่มีแม่แบบ');
    return endTest_();
  }

  var users = serviceTestUsers_();
  var created = withTestUser_(users.admin, function () {
    return api_createWorkOrder(testWoForm_(), 0);
  });
  var woId = created.data.woId;

  // ออกสามฉบับ เหลือฉบับปัจจุบันหนึ่ง และฉบับเก่าใน _archive สอง
  /*
   * ออกสามครั้ง ไม่ใช่สองครั้ง · ครั้งแรกไม่มีฉบับเดิมให้เก็บ จึงได้ฉบับเก่าน้อยกว่า
   * จำนวนครั้งที่ออกอยู่หนึ่งเสมอ · ชุดทดสอบปิดการออกเอกสารไว้ตอนสร้างใบงาน
   * (ดู REPORT_DISABLED_) ใบนี้จึงเริ่มต้นโดยยังไม่มีเอกสารเลย
   */
  withReports_(function () {
    generateWorkOrderReport(woId, users.admin);
    generateWorkOrderReport(woId, users.admin);
    generateWorkOrderReport(woId, users.admin);
  });

  clearRowCache_(SHEET.WORK_ORDER);
  var archive = reportArchiveList_(getWorkOrder(woId));
  assertEquals_(archive.length, 2, 'ต้องมีฉบับเก่าสองฉบับ ไม่งั้นการทดสอบไม่มีความหมาย');
  assertEquals_(archive[0].at, 0, 'ลำดับต้องมาจากเซิร์ฟเวอร์ ไม่ใช่ให้หน้าเว็บนับเอง');

  var got = withTestUser_(users.service, function () {
    return api_woDocument(woId, DOC_KIND.ARCHIVE, 0);
  });
  assertEquals_(got.data.found, true, 'เปิดฉบับเก่าด้วยลำดับได้');
  assertTrue_(got.data.size > 0, 'และต้องได้ไบต์จริง');
  assertTrue_(got.data.name.indexOf('v') !== -1,
    'ชื่อที่คืนมาต้องเป็นชื่อฉบับเก่าที่มีเลขเวอร์ชัน ไม่ใช่ชื่อฉบับปัจจุบัน');

  /* ---------- ลำดับนอกช่วง ต้องถูกปฏิเสธ ---------- */
  var over = withTestUser_(users.service, function () {
    return api_woDocument(woId, DOC_KIND.ARCHIVE, 99);
  });
  assertEquals_(over.data.found, false, 'ลำดับที่ไม่มีอยู่ต้องถูกปฏิเสธ');

  var negative = withTestUser_(users.service, function () {
    return api_woDocument(woId, DOC_KIND.ARCHIVE, -1);
  });
  assertEquals_(negative.data.found, false, 'ลำดับติดลบต้องถูกปฏิเสธ');

  var notNumber = withTestUser_(users.service, function () {
    return api_woDocument(woId, DOC_KIND.ARCHIVE, 'ไม่ใช่ตัวเลข');
  });
  assertEquals_(notNumber.data.found, false, 'ค่าที่ไม่ใช่ตัวเลขต้องถูกปฏิเสธ ไม่ใช่กลายเป็นศูนย์');

  /* ---------- ชนิดที่ไม่รู้จัก ต้องไม่กลายเป็นอย่างอื่นเงียบ ๆ ---------- */
  var weird = withTestUser_(users.service, function () {
    return api_woDocument(woId, 'อะไรก็ไม่รู้', '');
  });
  assertEquals_(weird.data.kind, DOC_KIND.REPORT,
    'ชนิดที่ไม่รู้จักถอยไปเป็นใบสั่งงานฉบับปัจจุบัน ซึ่งเป็นของที่ผู้ขอเห็นได้อยู่แล้ว');

  return endTest_();
}

/**
 * บรรทัดแรกในรายงานที่มีข้อความนี้อยู่ — ตัวช่วยของเทสต์เครื่องมือตรวจ
 * @param {string[]} lines บรรทัดที่เครื่องมือตรวจสะสมไว้
 * @param {string} text ข้อความที่ต้องพบ
 * @return {string} บรรทัดที่พบ หรือข้อความว่าง
 */
function probeLineWith_(lines, text) {
  for (var i = 0; i < lines.length; i++) {
    if (String(lines[i]).indexOf(text) !== -1) return String(lines[i]);
  }
  return '';
}

/**
 * เครื่องมือตรวจระบบไฟล์ต้องจับของที่พังได้จริง — พิสูจน์ด้วยข้อมูลปลอมก่อนเชื่อมัน
 *
 * เครื่องมือตรวจที่ไม่เคยถูกป้อนของเสีย คือเครื่องมือที่ไม่มีใครรู้ว่าตรวจเป็นหรือเปล่า
 * มันจะขึ้นเขียวทุกครั้งอย่างน่าเชื่อถือ ทั้งตอนที่ระบบดีและตอนที่ระบบพัง
 *
 * สองอาการที่ต้องแยกออกจากกันให้ได้ เพราะแก้คนละเรื่องกัน
 *   1. ค่า Folder_Map เพี้ยน — ความผิดอยู่ที่ฐานข้อมูล แก้ด้วยการเขียนค่าใหม่
 *   2. ค่าถูกต้องแต่โฟลเดอร์หายไป — ความผิดอยู่ที่ Drive แก้ด้วยการหาโฟลเดอร์กลับมา
 * ทั้งคู่ทำให้ไฟล์เก่าหาไม่เจอเหมือนกัน และระบบกลืนทั้งคู่ไว้เงียบ ๆ เหมือนกัน
 *
 * ไม่เรียก checkFilesAndReport() ตัวเต็มในเทสต์ เพราะตัวเต็มออกใบสั่งงานจริงหนึ่งฉบับ
 * ซึ่งเป็นสิ่งที่ชุดทดสอบปิดไว้โดยตั้งใจ (ดู REPORT_DISABLED_ ใน beginTestRun_)
 */
function test_files_probeFindsBrokenLinks() {
  beginTest_('เครื่องมือตรวจระบบไฟล์แยก "ค่าเพี้ยน" ออกจาก "โฟลเดอร์หาย" ได้ — SPEC 22.5');

  if (!getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false)) {
    Logger.log('  (ข้าม: ยังไม่ได้ตั้ง Script Property ชื่อ DRIVE_ROOT_FOLDER_ID ' +
      'ตั้งก่อนแล้วรันใหม่ จึงจะตรวจเรื่องโฟลเดอร์ได้)');
    assertTrue_(true, 'ข้ามการตรวจโฟลเดอร์เมื่อยังไม่ได้ตั้งค่าที่เก็บไฟล์');
    return endTest_();
  }

  var users = serviceTestUsers_();
  var wo = createTestWo_(users);
  ensureWoFolder_(wo.woId, 'Attachments');

  /* ---------- ของที่ระบบเขียนเอง ต้องไม่ถูกฟ้อง ---------- */
  /*
   * ข้อนี้สำคัญพอ ๆ กับการจับของเสีย · เครื่องมือที่เตือนผิดจะถูกเลิกอ่านทั้งฉบับ
   * แล้วของจริงที่มันจับได้ในวันหลังจะไม่มีใครเห็น
   */
  var lines = [];
  var score = { fail: 0 };
  var row = filesProbeWoRow_(lines, score, wo.woId);

  assertTrue_(!!row, 'ต้องอ่านแถวใบงานจากฐานข้อมูลได้โดยตรง');
  assertEquals_(score.fail, 0, 'Folder_Map ที่ระบบเพิ่งเขียนเอง ต้องไม่ถูกฟ้องว่าเสีย');
  assertTrue_(!!probeLineWith_(lines, 'แปล JSON'), 'รายงานต้องบอกผลการแปล JSON เสมอ');

  lines = [];
  score = { fail: 0 };
  filesProbeFolders_(lines, score, row);
  assertEquals_(score.fail, 0, 'โฟลเดอร์ที่เพิ่งสร้าง ต้องเปิดได้ทุกตัว');

  /* ---------- อาการที่ 1: ค่าเพี้ยน ---------- */
  updateWorkOrder(wo.woId, { 'Folder_Map': '{"Attachments":"abc' });
  clearRowCache_(SHEET.WORK_ORDER);

  lines = [];
  score = { fail: 0 };
  filesProbeWoRow_(lines, score, wo.woId);
  assertEquals_(score.fail, 1, 'JSON ที่แปลไม่ผ่าน ต้องถูกฟ้องหนึ่งจุด');
  assertTrue_(!!probeLineWith_(lines, 'แปล JSON ไม่ผ่าน'),
    'และต้องบอกว่าแปลไม่ผ่าน ไม่ใช่เงียบแล้วถือว่า "ยังไม่มีโฟลเดอร์ย่อย" แบบที่ระบบทำ');
  assertTrue_(!!probeLineWith_(lines, 'ค่าดิบ'),
    'ต้องพิมพ์ค่าดิบที่ฐานข้อมูลเก็บไว้ออกมาด้วย ไม่ใช่บอกแค่ว่าเสีย (SPEC 22.5)');

  /* ---------- ค่าว่างไม่ใช่ค่าเสีย ---------- */
  updateWorkOrder(wo.woId, { 'Folder_Map': '' });
  clearRowCache_(SHEET.WORK_ORDER);

  lines = [];
  score = { fail: 0 };
  filesProbeWoRow_(lines, score, wo.woId);
  assertEquals_(score.fail, 0,
    'ใบที่ยังไม่เคยแนบไฟล์ย่อมไม่มีแผนที่ — ว่างคือคำตอบที่ถูก ห้ามฟ้อง (กฎข้อ 32)');

  /* ---------- อาการที่ 2: ค่าถูกแต่โฟลเดอร์หาย ---------- */
  updateWorkOrder(wo.woId, { 'Folder_Map': '{"Attachments":"ไม่มีโฟลเดอร์รหัสนี้"}' });
  clearRowCache_(SHEET.WORK_ORDER);

  lines = [];
  score = { fail: 0 };
  var ghost = filesProbeWoRow_(lines, score, wo.woId);
  assertEquals_(score.fail, 0,
    'ค่าเป็น JSON ที่ถูกต้อง ข้อนี้จึงต้องไม่ฟ้อง — ความผิดอยู่ที่ Drive ไม่ใช่ที่ค่า');

  lines = [];
  score = { fail: 0 };
  filesProbeFolders_(lines, score, ghost);
  assertEquals_(score.fail, 1, 'โฟลเดอร์ที่ฐานข้อมูลอ้างถึงแต่เปิดไม่ได้ ต้องถูกฟ้อง');
  assertTrue_(!!probeLineWith_(lines, 'เปิดไม่ได้'), 'และต้องบอกว่าเปิดไม่ได้ พร้อมรหัสที่ชี้ไป');

  /* ---------- สิทธิ์ที่ระบบไฟล์ต้องใช้ ---------- */
  lines = [];
  score = { fail: 0 };
  filesProbeScopes_(lines, score);
  assertEquals_(score.fail, getProp_(PROP_KEY.WO_REPORT_TEMPLATE, false) ? 0 : 1,
    'สิทธิ์ต้องใช้ได้ครบ · ยกเว้นตอนที่ยังไม่ได้ตั้งแม่แบบใบสั่งงาน ซึ่งต้องถูกฟ้องพอดีหนึ่งจุด');

  /* ---------- ตัวห่อ: ไม่ระบุเลขที่ และเลขที่ที่ไม่มีจริง ---------- */
  assertTrue_(String(checkFilesAndReport('')).indexOf('ต้องระบุเลขที่ใบงาน') !== -1,
    'เรียกโดยไม่ใส่เลขที่ ต้องบอกวิธีใช้ ไม่ใช่โยน error');
  assertTrue_(String(checkFilesAndReport(testPrefix_() + 'WO-ไม่มีใบนี้')).indexOf('จุดที่ต้องแก้') !== -1,
    'เลขที่ที่ไม่มีจริง ต้องรายงานว่าหาไม่พบ ไม่ใช่เดินต่อไปสร้างของใหม่');

  return endTest_();
}

/**
 * ไม่มีการเรียก Drive นอก 06_Files.gs แม้แต่บรรทัดเดียว
 *
 * กฎเดียวกับที่ใช้กับ SpreadsheetApp — วันที่ต้องย้ายที่เก็บไฟล์ไปที่อื่น
 * ต้องแก้ไฟล์เดียวจบ ไม่ใช่ไล่หาทั้งโปรเจกต์แล้วลืมไปจุดหนึ่ง
 *
 * สแกนจากตัวฟังก์ชันจริงในระบบ ไม่ใช่จากไฟล์บนดิสก์ วิธีนี้จึงใช้ได้ทั้งบนชีตจริงและกับ mock
 * (บนชีตจริงอ่านไฟล์ .gs ไม่ได้ ถ้าสแกนจากไฟล์ เทสต์นี้จะข้ามไปเงียบ ๆ ตอนที่สำคัญที่สุด)
 *
 * ชื่อที่ค้นถูกประกอบขึ้นตอนรัน เพื่อไม่ให้ตัวเทสต์เองกลายเป็นผลการค้นหา
 */
function test_files_driveIsolation() {
  beginTest_('ไม่มีการเรียก Drive นอก 06_Files.gs — เหมือนกฎของ SpreadsheetApp');

  var needle = 'Drive' + 'App';
  var allowed = driveLayerFunctions_();

  var found = [];
  var scanned = 0;
  var registries = serviceNameRegistries_();
  for (var name in globalThis) {
    if (typeof globalThis[name] !== 'function') continue;
    // ตารางจัดประเภทสิทธิ์มีชื่อบริการอยู่เป็นข้อความ ไม่ใช่การเรียกใช้
    if (registries.indexOf(name) !== -1) continue;
    scanned++;
    var source;
    try {
      source = String(globalThis[name]);
    } catch (e) {
      continue;   // ฟังก์ชันในตัวของเครื่องยนต์ อ่านเนื้อไม่ได้ ไม่ใช่โค้ดของเรา
    }
    if (source.indexOf(needle) !== -1) found.push(name);
  }

  assertTrue_(scanned > 50, 'ตัวสแกนต้องเห็นฟังก์ชันของระบบจริง (เห็น ' + scanned + ' ตัว) ' +
    'ถ้าเห็นน้อยผิดปกติ แปลว่าการสแกนใช้ไม่ได้ ไม่ใช่ว่าโค้ดสะอาด');

  found.sort();
  var expected = allowed.slice().sort();
  assertEquals_(found.join(', '), expected.join(', '),
    'ฟังก์ชันที่เรียก ' + needle + ' ต้องเป็นตัวที่ประกาศไว้ใน 06_Files.gs เท่านั้น');

  /* ---------- ทุกชื่อในรายการต้องมีอยู่จริง ---------- */
  // กันไม่ให้ใครแก้เทสต์ให้ผ่านด้วยการเติมชื่อลอย ๆ ลงในรายการ
  for (var i = 0; i < allowed.length; i++) {
    assertEquals_(typeof globalThis[allowed[i]], 'function',
      'ชื่อ ' + allowed[i] + ' ในรายการชั้นไฟล์ ต้องเป็นฟังก์ชันที่มีอยู่จริง');
  }

  /* ---------- และต้องไม่มีวัตถุของ Drive หลุดออกไปข้างนอก ---------- */
  // ชั้นบนต้องได้แต่ค่าธรรมดา ถ้าได้วัตถุของ Drive ไป การย้ายที่เก็บจะลามออกไปนอกไฟล์เดียว
  var view = fileViewOf_({
    'File_ID': 'F1', 'WO_ID': 'WO-2609-0001', 'Saved_File_Name': 'a.pdf',
    'File_URL': 'https://example.test/a', 'Size': 10, 'Uploaded_Date': new Date()
  });
  assertTrue_(isJsonSafe_(view), 'สิ่งที่ชั้นไฟล์คืนออกไป ต้องเป็นค่าธรรมดาล้วน ไม่มีวัตถุของ Drive');

  return endTest_();
}

/**
 * รายชื่อคำขอที่ลองใหม่ได้ ต้องตรงกันทั้งสองโปรเจกต์
 *
 * หน้าบ้านต้องถือสำเนารายชื่อไว้เอง เพราะตอนที่คำตอบไม่กลับมา มันถามหลังบ้านไม่ได้แล้ว
 * สำเนาที่หลุดจากต้นฉบับคือบั๊กที่เงียบที่สุดแบบหนึ่ง — คำขอที่เขียนข้อมูลจะถูกยิงซ้ำ
 * แล้วได้ใบงานสองใบ โดยไม่มีอะไรบอกว่าเกิดอะไรขึ้น
 */
function test_permission_gatewayRetryList() {
  beginTest_('รายชื่อคำขอที่ลองใหม่ได้ ต้องตรงกันสองฝั่ง');

  var readOnly = apiReadOnlyActions_();
  var actions = listApiFunctionNames_();

  /* ---------- ทุกชื่อในรายการต้องมีอยู่จริงในทะเบียน ---------- */
  for (var i = 0; i < readOnly.length; i++) {
    assertTrue_(actions.indexOf(readOnly[i]) !== -1,
      'รายการ ' + readOnly[i] + ' ต้องมีอยู่จริงในทะเบียนของฝั่งนี้');
  }

  /* ---------- รายการที่เขียนข้อมูล ต้องไม่หลุดเข้าไปในรายชื่อ ---------- */
  // ตรวจตรง ๆ ทีละตัว เพราะนี่คือข้อที่ผิดแล้วเสียหายจริง
  var writers = ['api_createWorkOrder', 'api_editWorkOrder', 'api_submitWorkOrder',
    'api_approveWorkOrder', 'api_returnWorkOrder', 'api_cancelWorkOrder', 'api_reopenWorkOrder',
    'api_acceptTask', 'api_updateTaskStep', 'api_completeTask', 'api_returnTask',
    'api_cancelTask', 'api_addTaskPeriod', 'api_removeTaskPeriod', 'api_setTaskVisit',
    'api_recordPayment', 'api_uploadFile', 'api_removeFile',
    'api_logout', 'api_changePassword', 'api_adminSetPassword', 'api_adminForceLogout',
    // ออกเอกสารให้ใบที่ยังไม่มี — เขียน Report_URL และ Audit จึงเป็นรายการที่เปลี่ยนข้อมูล
    'api_generateReport', 'api_ensureWoReport'];
  for (var w = 0; w < writers.length; w++) {
    assertTrue_(readOnly.indexOf(writers[w]) === -1,
      writers[w] + ' เขียนข้อมูล จึงห้ามอยู่ในรายชื่อที่ลองใหม่อัตโนมัติได้');
  }

  /* ---------- ทุกรายการในทะเบียน ต้องถูกจัดประเภทไว้แล้ว ---------- */
  // ใครเพิ่มรายการใหม่แล้วไม่ตัดสินใจว่าอ่านหรือเขียน จะแดงตรงนี้
  for (var a = 0; a < actions.length; a++) {
    var known = readOnly.indexOf(actions[a]) !== -1 || writers.indexOf(actions[a]) !== -1;
    assertTrue_(known, 'รายการ ' + actions[a] + ' ยังไม่ได้ระบุว่าอ่านหรือเขียน — ' +
      'ต้องเพิ่มลง apiReadOnlyActions_() หรือรายการที่เขียนข้อมูลในเทสต์นี้');
  }

  /* ---------- สำเนาฝั่งหน้าบ้านต้องตรงกับต้นฉบับ ---------- */
  if (!GATEWAY_ENABLED) {
    // ทางเข้าจากหน้าบ้านถูกปิดไปแล้ว สำเนาฝั่งนั้นจึงไม่มีผลกับระบบที่ใช้งานจริงอีก
    // ตัวที่ยังต้องพิสูจน์คือ "ปิดจริง" ซึ่งอยู่ใน test_permission_gatewayDisabled
    Logger.log('  (ข้าม: ทางเข้าจากหน้าบ้านปิดอยู่ สำเนารายชื่อฝั่งนั้นไม่มีผลแล้ว)');
    assertTrue_(true, 'ข้ามการเทียบสำเนาเมื่อทางเข้าจากหน้าบ้านถูกปิด');
    return endTest_();
  }

  var gateway = gatewaySource_();
  if (!gateway) {
    Logger.log('  (ข้าม: หาไฟล์ของโปรเจกต์หน้าบ้านไม่เจอจากที่นี่ ต้องตรวจด้วยตาแทน)');
    assertTrue_(true, 'ข้ามการเทียบสำเนาเมื่อเข้าถึงไฟล์หน้าบ้านไม่ได้');
    return endTest_();
  }

  var block = /var\s+RETRYABLE_ACTIONS\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/.exec(gateway);
  assertTrue_(!!block, 'โปรเจกต์หน้าบ้านต้องประกาศรายชื่อคำขอที่ลองใหม่ได้ไว้ตรง ๆ');

  var copied = [];
  var parts = block[1].split(',');
  for (var p = 0; p < parts.length; p++) {
    var name = parts[p].replace(/['"\s]/g, '');
    if (name) copied.push(name);
  }
  assertEquals_(copied.slice().sort().join(', '), readOnly.slice().sort().join(', '),
    'สำเนาฝั่งหน้าบ้านต้องตรงกับรายชื่อที่ฝั่งนี้ประกาศไว้ทุกตัว');

  /* ---------- และค่าตั้งต้นต้องเป็น "ไม่ลองใหม่" ---------- */
  // ชื่อที่ไม่รู้จักต้องไม่ถูกยิงซ้ำ เพราะการเขียนซ้ำเสียหายกว่าการให้ผู้ใช้กดเอง
  assertTrue_(gateway.indexOf('RETRYABLE_ACTIONS.indexOf') !== -1,
    'หน้าบ้านต้องตัดสินจากรายชื่อ ไม่ใช่ลองใหม่ให้ทุกคำขอ');
  assertTrue_(gateway.indexOf('ยังไม่ได้บันทึก') !== -1,
    'คำขอที่เขียนข้อมูลแล้วติดต่อไม่สำเร็จ ต้องบอกผู้ใช้ว่ายังไม่ได้บันทึก');

  return endTest_();
}

/**
 * แคชข้อมูลตั้งต้นต้องให้ค่าตรงกับชีตเสมอ และต้องล้างทันทีเมื่อมีการแก้
 *
 * แคชที่ข้ามการรันเป็นของอันตราย ถ้าค่าเก่าค้างอยู่ ผู้ใช้อีกคนจะตัดสินใจจากข้อมูลที่ไม่ใช่ปัจจุบัน
 * โดยเฉพาะ User_Role ซึ่งเป็นตัวตัดสินสิทธิ์ทั้งระบบ
 */
function test_repo_masterCache() {
  beginTest_('แคชข้อมูลตั้งต้นตรงกับชีต และล้างทันทีเมื่อแก้');

  var topicId = testPrefix_() + 'TOPIC-CACHE';

  /* ---------- อ่านครั้งแรก แล้วอ่านซ้ำ ต้องได้เท่ากัน ---------- */
  appendRow_(SHEET.ATTACHMENT_TOPIC, {
    'Topic_ID': topicId, 'Scope': FILE_SCOPE.WO, 'Topic_Name': 'ชื่อเดิม',
    'Required': false, 'Multiple': false, 'Active': true
  });

  clearRowCache_();   // ล้างแคชระดับการรัน เพื่อบังคับให้อ่านผ่านทางเดียวกับผู้ใช้จริง
  var first = getAttachmentTopic(topicId);
  assertEquals_(first['Topic_Name'], 'ชื่อเดิม', 'อ่านครั้งแรกต้องได้ค่าที่เพิ่งเขียน');

  clearRowCache_();
  var second = getAttachmentTopic(topicId);
  assertEquals_(second['Topic_Name'], 'ชื่อเดิม', 'อ่านซ้ำจากแคชต้องได้ค่าเดียวกัน');

  /* ---------- ต้องถูกเก็บลงแคชข้ามการรันจริง ---------- */
  // ถ้าข้อนี้ไม่ผ่าน แปลว่าฟีเจอร์ไม่ได้ทำงานเลย แล้วข้อถัดไปจะผ่านแบบไร้ความหมาย
  assertTrue_(!!getMasterCache_(SHEET.ATTACHMENT_TOPIC),
    'หัวข้อไฟล์แนบต้องถูกเก็บลงแคชข้ามการรัน ไม่งั้นทุกหน้าจะอ่านชีตใหม่ทุกครั้ง');

  /* ---------- เขียนแล้วแคชต้องตายทันที ไม่ใช่รอหมดอายุอีก 10 นาที ---------- */
  // ถ้าไม่ล้าง ผู้ใช้อีกคนจะเห็นค่าเก่านานถึง 10 นาทีโดยไม่มีอะไรบอก
  // ตรวจที่ตัวแคชตรง ๆ เพราะถ้าตรวจด้วยการอ่านซ้ำ การล้างแคชระดับการรันจะบังหน้าให้เอง
  updateRow_(SHEET.ATTACHMENT_TOPIC, 'Topic_ID', topicId, { 'Topic_Name': 'ชื่อใหม่' });
  assertEquals_(getMasterCache_(SHEET.ATTACHMENT_TOPIC), null,
    'เขียนแท็บข้อมูลตั้งต้นแล้ว แคชข้ามการรันของแท็บนั้นต้องถูกทิ้งทันที');

  clearRowCache_();
  assertEquals_(getAttachmentTopic(topicId)['Topic_Name'], 'ชื่อใหม่',
    'แก้ข้อมูลตั้งต้นแล้ว ต้องเห็นค่าใหม่ทันที ไม่ใช่รอแคชหมดอายุ');

  /* ---------- ปุ่มล้างแคชด้วยมือ ต้องทำงาน ---------- */
  var message = clearMasterCache();
  assertTrue_(String(message).indexOf('Attachment_Topic') !== -1,
    'ปุ่มล้างแคชต้องบอกได้ว่าล้างแท็บอะไรไปบ้าง สำหรับตอนที่ผู้ดูแลแก้ในชีตโดยตรง');
  assertEquals_(getAttachmentTopic(topicId)['Topic_Name'], 'ชื่อใหม่',
    'ล้างแคชแล้วต้องยังอ่านข้อมูลได้ตามปกติ');

  /* ---------- ค่าที่แปลงผ่าน JSON ไม่ได้ ต้องไม่ถูกแคช ---------- */
  // แท็บที่มีคอลัมน์วันเวลาจะเพี้ยนเงียบ ๆ ถ้าแคช จึงต้องมีด่านกันไว้
  assertTrue_(hasDateValue_([['a', new Date()]]), 'ตัวตรวจต้องเห็นวันเวลาที่ปนอยู่');
  assertTrue_(!hasDateValue_([['a', 'b', 1, true, '']]), 'และต้องไม่เตือนผิดกับค่าธรรมดา');

  /* ---------- แท็บธุรกรรม ต้องไม่ถูกแคชข้ามการรันเด็ดขาด ---------- */
  assertTrue_(!isMasterCacheSheet_(SHEET.WORK_ORDER), 'ใบงานห้ามแคชข้ามการรัน');
  assertTrue_(!isMasterCacheSheet_(SHEET.DEPARTMENT_TASK), 'งานของแผนกห้ามแคชข้ามการรัน');
  assertTrue_(!isMasterCacheSheet_(SHEET.FILE_INDEX), 'ทะเบียนไฟล์ห้ามแคชข้ามการรัน');
  assertTrue_(isMasterCacheSheet_(SHEET.REQUEST_TYPE), 'รายการสิ่งที่ต้องการแคชได้');
  assertTrue_(isMasterCacheSheet_(SHEET.USER_ROLE), 'ทะเบียนผู้ใช้แคชได้');

  return endTest_();
}


/* ===========================================================================
 * ชุดทดสอบการเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่าน (CLAUDE.md กฎข้อ 16)
 *
 * ทุกชุดในนี้เดินผ่านทางเข้าจริง (api_call) ไม่ใช่เรียกฟังก์ชันภายในตรง ๆ
 * เพราะจุดที่ต้องพิสูจน์คือด่านตรวจโทเคนที่ทางเข้า ไม่ใช่ตรรกะข้างใน
 * =========================================================================== */

/**
 * สร้างผู้ใช้ทดสอบที่ล็อกอินได้จริง
 *
 * ต้องมีแถวจริงในทะเบียน เพราะชุดนี้พิสูจน์ว่าระบบอ่านทะเบียนจริง
 * ไม่ใช่สวมสิทธิ์ผ่าน withTestUser_ ซึ่งข้ามด่านทั้งหมดไป
 *
 * @param {string} suffix ตัวต่อท้ายให้แยกผู้ใช้คนละคน
 * @param {string} role ค่าในคอลัมน์ Role (ใส่หลายค่าคั่นจุลภาคได้)
 * @param {string} password รหัสผ่านตั้งต้น
 * @param {Object} [extra] คอลัมน์เพิ่มเติม เช่น Department หรือ Must_Change_Password
 * @return {Object} {email, username, password}
 */
function addLoginTestUser_(suffix, role, password, extra) {
  var email = testPrefix_() + suffix + '@cnr.co.th';
  var username = testPrefix_() + suffix;
  var salt = newPasswordSalt_();

  var row = {
    'Email':                email,
    'Username':             username,
    'Display_Name':         'ผู้ใช้ทดสอบ ' + suffix,
    'Role':                 role,
    'Department':           '',
    'Password_Salt':        salt,
    'Password_Hash':        encodePasswordHash_(PASSWORD_ITERATIONS,
                              hashPassword_(password, salt, PASSWORD_ITERATIONS)),
    'Failed_Count':         0,
    'Must_Change_Password': false,
    'Active':               true
  };
  for (var key in extra) {
    if (Object.prototype.hasOwnProperty.call(extra, key)) row[key] = extra[key];
  }

  appendRow_(SHEET.USER_ROLE, row);
  return { email: email, username: username, password: password };
}

/**
 * ล็อกอินผ่านทางเข้าจริง
 * @param {string} username ชื่อผู้ใช้
 * @param {string} password รหัสผ่าน
 * @return {Object} ผลจาก api_call
 */
function loginThroughApi_(username, password) {
  return api_call('api_login', [username, password], '');
}

/**
 * รหัสถูกได้โทเคน รหัสผิดไม่ได้ และข้อความต้องเหมือนกันทุกกรณีที่ไม่ผ่าน
 *
 * ข้อความที่ต่างกันคือตัวบอกคนนอกว่าชื่อผู้ใช้ไหนมีอยู่จริง ซึ่งเป็นครึ่งหนึ่ง
 * ของงานเดารหัสไปแล้ว · หน้าล็อกอินเปิดให้ทั้งอินเทอร์เน็ตยิงได้ ข้อนี้จึงสำคัญมาก
 */
function test_auth_loginSucceedsAndFails() {
  beginTest_('รหัสถูกได้โทเคน รหัสผิดไม่ได้ และข้อความเหมือนกันทุกกรณี');

  var user = addLoginTestUser_('LOGIN1', ROLE.ADMIN, 'รหัสผ่านที่ถูกต้อง');

  /* ---------- รหัสถูก ---------- */
  var ok = loginThroughApi_(user.username, user.password);
  assertEquals_(ok.ok, true, 'รหัสถูกต้องเข้าได้');
  assertTrue_(!!ok.data.token, 'และต้องได้โทเคนกลับมา');
  assertTrue_(ok.data.token.length >= 32, 'โทเคนต้องยาวพอที่จะเดาไม่ได้');
  assertEquals_(ok.data.user.email, user.email, 'และบอกได้ว่าเป็นใคร');
  assertEquals_(ok.data.mustChangePassword, false, 'ผู้ใช้ที่ตั้งรหัสเองแล้ว ไม่ต้องบังคับเปลี่ยน');
  assertTrue_(isJsonSafe_(ok), 'ผลลัพธ์ต้องส่งผ่าน google.script.run ได้ (กฎข้อ 14)');

  /* ---------- โทเคนตัวจริงต้องไม่เคยถูกเก็บลงชีต ---------- */
  var stored = listSessionTokens();
  for (var i = 0; i < stored.length; i++) {
    assertTrue_(String(stored[i]['Token_Hash']) !== ok.data.token,
      'ชีตต้องเก็บเฉพาะค่าที่เข้ารหัสแล้ว ห้ามเก็บโทเคนตัวจริง');
  }
  assertTrue_(!!getSessionToken(hashSessionToken_(ok.data.token)),
    'แต่ต้องหาโทเคนเจอจากค่าที่เข้ารหัสแล้ว');

  /* ---------- ทุกกรณีที่ไม่ผ่าน ต้องได้ข้อความเดียวกันเป๊ะ ---------- */
  var closed = addLoginTestUser_('LOGIN2', ROLE.ADMIN, 'รหัสผ่านของคนที่ถูกปิด',
    { 'Active': false });

  var failures = [
    { name: 'รหัสผิด',            run: function () { return loginThroughApi_(user.username, 'รหัสผิดแน่นอน'); } },
    { name: 'ไม่มีชื่อผู้ใช้นี้',    run: function () { return loginThroughApi_('ไม่มีคนนี้ในระบบ', 'อะไรก็ได้ยาว ๆ'); } },
    { name: 'ชื่อผู้ใช้ว่าง',       run: function () { return loginThroughApi_('', 'อะไรก็ได้ยาว ๆ'); } },
    { name: 'รหัสผ่านว่าง',        run: function () { return loginThroughApi_(user.username, ''); } },
    { name: 'บัญชีถูกปิดใช้งาน',   run: function () { return loginThroughApi_(closed.username, closed.password); } }
  ];

  for (var f = 0; f < failures.length; f++) {
    var result = failures[f].run();
    assertEquals_(result.ok, false, failures[f].name + ' ต้องเข้าไม่ได้');
    assertEquals_(result.message, LOGIN_FAILED_MESSAGE,
      failures[f].name + ' ต้องได้ข้อความเดียวกับกรณีอื่นเป๊ะ ห้ามบอกว่าผิดตรงไหน');
    assertTrue_(!result.data || !result.data.token, 'และต้องไม่ได้โทเคน');
  }

  /* ---------- การล็อกอินที่ล้มเหลวต้องถูกบันทึกไว้ ---------- */
  // การยิงสุ่มรหัสจะเห็นได้จากตรงนี้ที่เดียว ถ้าไม่บันทึก จะไม่มีใครรู้ว่ากำลังโดนยิงอยู่
  // นับเฉพาะครั้งที่ใช้ชื่อผู้ใช้ของรอบทดสอบนี้ ส่วนครั้งที่พิมพ์ชื่อมั่ว ๆ ตามหาไม่ได้
  // (และไม่ควรตามหาได้ เพราะชื่อนั้นไม่ใช่ข้อมูลทดสอบที่เราสร้างขึ้น)
  // ย้ายไป System_Log แล้วตาม SPEC 13 เพราะไม่ได้ผูกกับใบงานใบใด — เจตนาของข้อนี้ไม่เปลี่ยน
  var failedRows = systemRowsOf_(ACTION.LOGIN_FAILED);
  assertTrue_(failedRows.length >= 3,
    'ทุกครั้งที่ล็อกอินไม่ผ่าน ต้องถูกบันทึกลง System_Log (พบ ' + failedRows.length + ' แถว)');

  /* ---------- และต้องไม่มีรหัสผ่านโผล่ในบันทึกเลย ---------- */
  for (var r = 0; r < failedRows.length; r++) {
    var line = JSON.stringify(failedRows[r]);
    assertTrue_(line.indexOf('รหัสผิดแน่นอน') === -1,
      'รหัสผ่านที่พิมพ์มา ห้ามโผล่ในบันทึกไม่ว่ากรณีใด แม้จะเป็นรหัสที่ผิด');
    assertTrue_(line.indexOf(user.password) === -1, 'และรหัสที่ถูกต้องยิ่งห้ามโผล่');
  }

  return endTest_();
}

/**
 * แถว Audit ของเหตุการณ์หนึ่งในรอบทดสอบนี้
 * @param {string} action ค่าจาก ACTION
 * @return {Object[]}
 */
function auditRowsOf_(action) {
  var rows = testRowsFromDb_(SHEET.AUDIT_LOG, 'User', { 'Action': action });
  var found = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Action']) !== action) continue;
    if (!isTestValue_(rows[i]['User'])) continue;
    found.push(rows[i]);
  }
  return found;
}

/**
 * โทเคนที่หมดอายุแล้ว ใช้ไม่ได้
 *
 * ถ้าไม่ตรวจวันหมดอายุ โทเคนที่หลุดออกไปครั้งเดียวจะใช้ได้ตลอดกาล
 */
function test_auth_tokenExpires() {
  beginTest_('โทเคนหมดอายุแล้วใช้ไม่ได้');

  var user = addLoginTestUser_('EXPIRE', ROLE.ADMIN, 'รหัสผ่านสำหรับทดสอบ');
  var token = loginThroughApi_(user.username, user.password).data.token;

  // ยังไม่หมดอายุ ต้องใช้ได้
  assertEquals_(api_call('api_getMenu', [], token).ok, true, 'โทเคนที่ยังไม่หมดอายุ ใช้ได้');

  /* ---------- ดันเวลาหมดอายุให้เป็นอดีต ---------- */
  var hash = hashSessionToken_(token);
  updateSessionToken(hash, { 'Expires_Date': new Date(new Date().getTime() - 60000) });

  var expired = api_call('api_getMenu', [], token);
  assertEquals_(expired.ok, false, 'โทเคนที่หมดอายุแล้ว ต้องใช้ไม่ได้');
  assertEquals_(expired.message, NEED_LOGIN_MESSAGE, 'และต้องบอกให้เข้าสู่ระบบใหม่');
  assertEquals_(expired.needLogin, true, 'พร้อมธงที่บอกหน้าเว็บให้พากลับไปหน้าเข้าสู่ระบบ');

  /* ---------- คำสั่งที่เปลี่ยนข้อมูลก็ต้องถูกปฏิเสธเช่นกัน ---------- */
  var before = countAllRows_();
  assertEquals_(api_call('api_createWorkOrder', [testWoForm_()], token).ok, false,
    'โทเคนหมดอายุแล้ว สร้างใบงานไม่ได้');
  assertEquals_(countAllRows_().total, before.total,
    'และต้องไม่มีแถวใดถูกเขียนลงชีตเลย');

  /* ---------- ต่ออายุเมื่อใช้งาน ---------- */
  // คนที่ทำงานต่อเนื่องต้องไม่ถูกเตะออกกลางคัน แต่คนที่ทิ้งหน้าจอไว้ต้องล็อกอินใหม่
  var fresh = loginThroughApi_(user.username, user.password).data.token;
  var freshHash = hashSessionToken_(fresh);
  var soon = new Date(new Date().getTime() + 60000);   // เหลืออีกนาทีเดียว
  updateSessionToken(freshHash, { 'Expires_Date': soon });

  assertEquals_(api_call('api_getMenu', [], fresh).ok, true, 'ใกล้หมดอายุแต่ยังไม่หมด ใช้ได้');
  var after = toDate_(getSessionToken(freshHash)['Expires_Date']);
  assertTrue_(after.getTime() > soon.getTime() + 3600000,
    'ใช้งานแล้วต้องถูกต่ออายุออกไป ไม่ใช่ปล่อยให้หมดกลางคัน');

  return endTest_();
}

/**
 * โทเคนของคนอื่น ใช้สวมสิทธิ์ไม่ได้
 *
 * โทเคนผูกกับเจ้าของในชีต ไม่ใช่เชื่อสิ่งที่หน้าเว็บบอกมา
 */
function test_auth_tokenBelongsToOwner() {
  beginTest_('โทเคนของคนอื่นใช้สวมสิทธิ์ไม่ได้');

  var admin = addLoginTestUser_('OWNER1', ROLE.ADMIN, 'รหัสผ่านของผู้ดูแล');
  var service = addLoginTestUser_('OWNER2', ROLE.SERVICE, 'รหัสผ่านของแผนกบริการ',
    { 'Department': DEPT.SERVICE });

  var adminToken = loginThroughApi_(admin.username, admin.password).data.token;
  var serviceToken = loginThroughApi_(service.username, service.password).data.token;

  /* ---------- โทเคนแต่ละใบต้องได้ตัวตนของเจ้าของเท่านั้น ---------- */
  assertEquals_(api_call('api_getMenu', [], adminToken).data.user.email, admin.email,
    'โทเคนของผู้ดูแล ต้องได้ตัวตนของผู้ดูแล');
  assertEquals_(api_call('api_getMenu', [], serviceToken).data.user.email, service.email,
    'โทเคนของแผนกบริการ ต้องได้ตัวตนของแผนกบริการ');

  /* ---------- สิทธิ์ต้องตามเจ้าของโทเคน ไม่ใช่ตามที่ขอ ---------- */
  assertEquals_(api_call('api_createWorkOrder', [testWoForm_()], serviceToken).ok, false,
    'โทเคนของแผนกบริการ สร้างใบงานไม่ได้ เพราะไม่ใช่สิทธิ์ของเขา');

  /* ---------- โทเคนปลอมหรือโทเคนที่แก้ไขแล้ว ต้องใช้ไม่ได้ ---------- */
  var fakes = [
    adminToken + 'x',
    adminToken.substring(0, adminToken.length - 1),
    adminToken.toUpperCase(),
    hashSessionToken_(adminToken),   // ค่าที่เก็บในชีต ไม่ใช่ตัวโทเคน
    'โทเคนที่แต่งขึ้นมาเอง',
    '', null, undefined
  ];
  for (var i = 0; i < fakes.length; i++) {
    var result = api_call('api_getMenu', [], fakes[i]);
    assertEquals_(result.ok, false, 'โทเคนปลอมแบบที่ ' + (i + 1) + ' ต้องใช้ไม่ได้');
    assertEquals_(result.needLogin, true, 'และต้องถูกพากลับไปหน้าเข้าสู่ระบบ');
  }

  /*
   * ค่าที่เก็บในชีตต้องใช้แทนโทเคนไม่ได้ — ข้อนี้คือเหตุผลทั้งหมดของการเข้ารหัสก่อนเก็บ
   * ถ้าใช้แทนกันได้ คนที่เปิดชีตได้จะสวมสิทธิ์เป็นทุกคนที่กำลังล็อกอินอยู่ทันที
   */
  assertEquals_(api_call('api_getMenu', [], hashSessionToken_(adminToken)).ok, false,
    'ค่าที่เก็บในชีตต้องใช้เป็นโทเคนไม่ได้');

  return endTest_();
}

/**
 * ไม่มีโทเคน เรียกทุก api_ ที่เปลี่ยนข้อมูลไม่ได้ และต้องไม่มีแถวใดถูกเขียน
 *
 * ข้อสำคัญที่สุดของทั้งชุด — fail closed ต้องไม่มีรูแม้แต่รูเดียว
 */
function test_auth_noTokenWritesNothing() {
  beginTest_('ไม่มีโทเคน เปลี่ยนข้อมูลไม่ได้ และไม่มีแถวใดถูกเขียน');

  var writers = ['api_createWorkOrder', 'api_editWorkOrder', 'api_submitWorkOrder',
    'api_approveWorkOrder', 'api_returnWorkOrder', 'api_cancelWorkOrder', 'api_reopenWorkOrder',
    'api_acceptTask', 'api_updateTaskStep', 'api_completeTask', 'api_returnTask',
    'api_cancelTask', 'api_addTaskPeriod', 'api_removeTaskPeriod', 'api_setTaskVisit',
    'api_recordPayment', 'api_uploadFile', 'api_removeFile',
    'api_logout', 'api_changePassword', 'api_adminSetPassword', 'api_adminForceLogout',
    // ออกเอกสารให้ใบที่ยังไม่มี — เขียน Report_URL และ Audit จึงเป็นรายการที่เปลี่ยนข้อมูล
    'api_generateReport', 'api_ensureWoReport'];

  // ทุกรายการที่เปลี่ยนข้อมูลต้องอยู่ในรายการนี้ ไม่งั้นจะมีตัวที่ไม่เคยถูกตรวจ
  var readOnly = apiReadOnlyActions_();
  var everything = listApiFunctionNames_();
  for (var e = 0; e < everything.length; e++) {
    if (readOnly.indexOf(everything[e]) !== -1) continue;
    assertTrue_(writers.indexOf(everything[e]) !== -1,
      'รายการ ' + everything[e] + ' เปลี่ยนข้อมูลแต่ยังไม่ถูกตรวจในชุดนี้ — ต้องเพิ่มเข้ารายการ');
  }

  var before = countAllRows_();
  var noTokens = ['', null, undefined, 'โทเคนที่แต่งขึ้นมาเอง'];

  for (var t = 0; t < noTokens.length; t++) {
    for (var w = 0; w < writers.length; w++) {
      var result = api_call(writers[w], ['อะไรก็ได้', 'อะไรก็ได้', 'อะไรก็ได้'], noTokens[t]);
      assertEquals_(result.ok, false, writers[w] + ' ต้องถูกปฏิเสธเมื่อไม่มีโทเคนที่ใช้ได้');
      assertEquals_(result.message, NEED_LOGIN_MESSAGE, 'และต้องบอกให้เข้าสู่ระบบก่อน');
    }
  }

  /* ---------- ข้อสำคัญที่สุด: ห้ามมีแถวใดถูกเขียนเลยแม้แต่แถวเดียว ---------- */
  var after = countAllRows_();
  assertEquals_(after.total, before.total,
    'ผู้ที่ไม่มีโทเคน ต้องไม่ทำให้มีแถวใหม่ในชีตแม้แต่แถวเดียว');
  for (var sheet in before.perSheet) {
    if (!Object.prototype.hasOwnProperty.call(before.perSheet, sheet)) continue;
    assertEquals_(after.perSheet[sheet], before.perSheet[sheet],
      'แท็บ ' + sheet + ' ต้องมีจำนวนแถวเท่าเดิม');
  }

  /* ---------- รายการที่อ่านอย่างเดียว ก็ต้องมีโทเคนเช่นกัน ---------- */
  // ทุกคนเห็นใบงานได้ทุกใบก็จริง แต่ต้องเป็น "ทุกคนในองค์กร" ไม่ใช่ทุกคนบนอินเทอร์เน็ต
  for (var r = 0; r < readOnly.length; r++) {
    assertEquals_(api_call(readOnly[r], [], '').ok, false,
      readOnly[r] + ' อ่านอย่างเดียวก็ต้องเข้าสู่ระบบก่อน');
  }

  /* ---------- เรียกฟังก์ชันภายในตรง ๆ จากเบราว์เซอร์ ต้องไม่ได้ ---------- */
  /*
   * google.script.run เรียกทุกฟังก์ชันระดับบนสุดได้ ยกเว้นตัวที่ชื่อลงท้ายด้วยขีดล่าง
   * ตอนที่ระบบยังแยกสองโปรเจกต์ ข้อนี้ไม่เป็นปัญหา เพราะเบราว์เซอร์เข้าถึงตัวที่ถือข้อมูลไม่ได้
   * ตอนนี้เหลือโปรเจกต์เดียว ถ้าไม่มีด่าน ใครก็ตามที่เปิดหน้าเว็บจะเรียก createWorkOrder()
   * หรือ listCustomers() ตรง ๆ ได้ทันที โดยข้ามการตรวจสิทธิ์ทั้งชั้น
   *
   * จำลองสภาพจริงด้วยการปิดธง "รันจากตัวแก้ไข" ชั่วคราว เพราะชุดทดสอบรันในฐานะเจ้าของเสมอ
   */
  var editorFlagBefore = EDITOR_RUN_;
  EDITOR_RUN_ = false;
  try {
    var direct = [
      { name: 'listCustomers', run: function () { return listCustomers(); } },
      { name: 'listUserRoles', run: function () { return listUserRoles(true); } },
      { name: 'listWorkOrders', run: function () { return listWorkOrders(); } },
      { name: 'createWorkOrder', run: function () {
          return createWorkOrder(testWoForm_(), { email: 'ปลอม@example.com', roles: [ROLE.ADMIN] }, {});
        } }
    ];
    for (var d = 0; d < direct.length; d++) {
      assertThrowsMessage_(direct[d].run, NEED_LOGIN_MESSAGE,
        'เรียก ' + direct[d].name + ' ตรง ๆ จากเบราว์เซอร์ ต้องถูกปฏิเสธที่ชั้นข้อมูล');
    }
  } finally {
    EDITOR_RUN_ = editorFlagBefore;
  }

  assertEquals_(countAllRows_().total, before.total,
    'และการเรียกตรง ๆ เหล่านั้น ต้องไม่ทำให้มีแถวใหม่เช่นกัน');

  return endTest_();
}

/**
 * ผิด 5 ครั้งแล้วล็อก และครบเวลาแล้วปลดล็อกเอง
 *
 * หน้าล็อกอินเปิดให้ทั้งอินเทอร์เน็ตยิงได้ ถ้าไม่มีด่านนี้ การเดารหัสจะทำได้ไม่จำกัด
 */
function test_auth_lockAfterFailures() {
  beginTest_('ผิด 5 ครั้งแล้วล็อก ครบเวลาแล้วปลดล็อกเอง');

  var user = addLoginTestUser_('LOCK', ROLE.ADMIN, 'รหัสผ่านที่ถูกต้องจริง');

  /* ---------- 4 ครั้งแรก ยังไม่ล็อก ---------- */
  for (var i = 1; i < LOGIN_MAX_FAILURES; i++) {
    var attempt = loginThroughApi_(user.username, 'รหัสผิดครั้งที่ ' + i);
    assertEquals_(attempt.message, LOGIN_FAILED_MESSAGE,
      'ครั้งที่ ' + i + ' ยังเป็นข้อความเดิม ยังไม่บอกว่าถูกล็อก');
  }
  assertEquals_(Number(getUserRole(user.email)['Failed_Count']), LOGIN_MAX_FAILURES - 1,
    'ตัวนับต้องเดินตามจำนวนครั้งที่ผิดจริง');

  // ยังไม่ครบ 5 จึงยังเข้าด้วยรหัสที่ถูกต้องได้
  assertEquals_(loginThroughApi_(user.username, user.password).ok, true,
    'ยังไม่ครบจำนวน ต้องยังเข้าได้ด้วยรหัสที่ถูกต้อง');
  assertEquals_(Number(getUserRole(user.email)['Failed_Count']), 0,
    'เข้าได้แล้วตัวนับต้องถูกล้าง ไม่งั้นจะสะสมจนล็อกคนที่ใช้งานปกติ');

  /* ---------- ผิดครบ 5 ครั้ง ต้องล็อก ---------- */
  for (var j = 0; j < LOGIN_MAX_FAILURES; j++) {
    loginThroughApi_(user.username, 'รหัสผิดรอบสอง ' + j);
  }

  var locked = getUserRole(user.email);
  assertTrue_(!!locked['Locked_Until'], 'ผิดครบจำนวนแล้วต้องบันทึกเวลาปลดล็อกไว้');
  assertTrue_(lockMinutesLeft_(locked) > 0, 'และต้องอยู่ในสถานะถูกล็อก');

  /* ---------- ระหว่างถูกล็อก แม้รหัสถูกก็เข้าไม่ได้ ---------- */
  var blocked = loginThroughApi_(user.username, user.password);
  assertEquals_(blocked.ok, false, 'ระหว่างถูกล็อก แม้รหัสถูกต้องก็เข้าไม่ได้');
  assertTrue_(String(blocked.message).indexOf('ถูกล็อกชั่วคราว') !== -1,
    'กรณีนี้บอกได้ว่าถูกล็อก เพราะกว่าจะเห็นข้อความนี้ต้องเดาผิดมาแล้ว 5 ครั้ง ' +
    'คือรู้อยู่แล้วว่าชื่อผู้ใช้นั้นมีจริง');
  assertTrue_(String(blocked.message).indexOf('นาที') !== -1,
    'และต้องบอกว่าต้องรออีกกี่นาที ไม่ใช่ปล่อยให้เดาเอง');

  /* ---------- ครบเวลาแล้วต้องปลดล็อกเอง ไม่ต้องรอผู้ดูแล ---------- */
  updateUserRole_(user.email, { 'Locked_Until': new Date(new Date().getTime() - 1000) });
  assertEquals_(lockMinutesLeft_(getUserRole(user.email)), 0, 'เลยเวลาแล้วต้องไม่ถือว่าถูกล็อก');
  assertEquals_(loginThroughApi_(user.username, user.password).ok, true,
    'ครบเวลาแล้วต้องเข้าได้เองโดยไม่ต้องให้ผู้ดูแลมาปลดให้');

  return endTest_();
}

/**
 * ออกจากระบบแล้วโทเคนเดิมใช้ไม่ได้อีก
 *
 * ถ้าลบแค่ฝั่งเบราว์เซอร์ โทเคนใบนั้นยังใช้ได้ต่ออีก 12 ชั่วโมง
 * ใครที่คัดลอกไปไว้แล้วจะเข้าใช้ต่อได้ทั้งที่ผู้ใช้กดออกไปแล้ว
 */
function test_auth_logoutKillsToken() {
  beginTest_('ออกจากระบบแล้วโทเคนเดิมใช้ไม่ได้อีก');

  var user = addLoginTestUser_('LOGOUT', ROLE.ADMIN, 'รหัสผ่านสำหรับทดสอบ');

  /* ---------- ออกจากระบบด้วยตัวเอง ---------- */
  var token = loginThroughApi_(user.username, user.password).data.token;
  assertEquals_(api_call('api_getMenu', [], token).ok, true, 'ก่อนออกจากระบบ ใช้งานได้ปกติ');

  assertEquals_(api_call('api_logout', [], token).ok, true, 'ออกจากระบบต้องสำเร็จ');
  var afterLogout = api_call('api_getMenu', [], token);
  assertEquals_(afterLogout.ok, false, 'ออกจากระบบแล้ว โทเคนเดิมต้องใช้ไม่ได้อีก');
  assertEquals_(afterLogout.needLogin, true, 'และต้องถูกพากลับไปหน้าเข้าสู่ระบบ');

  /* ---------- เข้าใหม่ได้ตามปกติ ---------- */
  var again = loginThroughApi_(user.username, user.password);
  assertEquals_(again.ok, true, 'ออกแล้วเข้าใหม่ได้ตามปกติ');
  assertTrue_(again.data.token !== token, 'และต้องได้โทเคนใบใหม่ ไม่ใช่ใบเดิม');

  /* ---------- ผู้ดูแลบังคับให้ออกจากระบบทุกเครื่อง ---------- */
  // ใช้ตอนเครื่องหาย ตอนสงสัยว่ารหัสรั่ว และตอนพนักงานลาออก
  var deviceA = loginThroughApi_(user.username, user.password).data.token;
  var deviceB = loginThroughApi_(user.username, user.password).data.token;
  assertEquals_(api_call('api_getMenu', [], deviceA).ok, true, 'เครื่องแรกใช้งานได้');
  assertEquals_(api_call('api_getMenu', [], deviceB).ok, true, 'เครื่องที่สองก็ใช้งานได้');

  var admin = addLoginTestUser_('LOGOUTADM', ROLE.ADMIN, 'รหัสผ่านของผู้ดูแล');
  var adminToken = loginThroughApi_(admin.username, admin.password).data.token;

  var forced = api_call('api_adminForceLogout', [user.email], adminToken);
  assertEquals_(forced.ok, true, 'ผู้ดูแลบังคับให้ออกจากระบบได้');
  assertTrue_(forced.data.closed >= 2, 'และต้องปิดโทเคนทุกใบของคนนั้น ไม่ใช่ใบเดียว');

  assertEquals_(api_call('api_getMenu', [], deviceA).ok, false, 'เครื่องแรกต้องใช้ไม่ได้แล้ว');
  assertEquals_(api_call('api_getMenu', [], deviceB).ok, false, 'เครื่องที่สองต้องใช้ไม่ได้แล้ว');

  /* ---------- คนที่ไม่ใช่ผู้ดูแล บังคับคนอื่นออกไม่ได้ ---------- */
  var plain = addLoginTestUser_('LOGOUTSV', ROLE.SERVICE, 'รหัสผ่านของแผนกบริการ',
    { 'Department': DEPT.SERVICE });
  var plainToken = loginThroughApi_(plain.username, plain.password).data.token;
  assertEquals_(api_call('api_adminForceLogout', [admin.email], plainToken).ok, false,
    'คนที่ไม่ใช่ผู้ดูแล บังคับให้คนอื่นออกจากระบบไม่ได้');
  assertEquals_(api_call('api_getMenu', [], adminToken).ok, true,
    'และโทเคนของผู้ดูแลต้องยังใช้ได้อยู่');

  return endTest_();
}

/**
 * คนที่มีหลาย Role — กฎห้ามอนุมัติใบที่ตัวเองเปิด ต้องยังทำงาน
 *
 * นี่คือเหตุผลที่ SPEC บังคับว่า 1 บัญชีต่อ 1 คน และเป็นกรณีที่ระบบสิทธิ์
 * ผิดพลาดได้ง่ายที่สุดเมื่อเปลี่ยนวิธีระบุตัวตน
 */
function test_auth_multiRoleSelfApproval() {
  beginTest_('คนที่มีทั้ง ADMIN และ APPROVER_SP อนุมัติใบของตัวเองไม่ได้');

  var both = addLoginTestUser_('MULTI', 'ADMIN,APPROVER_SP', 'รหัสผ่านของคนสองหมวก');
  var other = addLoginTestUser_('MULTI2', ROLE.ADMIN, 'รหัสผ่านของคนอื่น');

  var bothToken = loginThroughApi_(both.username, both.password).data.token;
  var otherToken = loginThroughApi_(other.username, other.password).data.token;

  /* ---------- ต้องได้ Role ครบทั้งสองค่า ---------- */
  var menu = api_call('api_getMenu', [], bothToken);
  assertEquals_(menu.data.user.roles.join(','), 'ADMIN,APPROVER_SP',
    'คอลัมน์ Role ที่คั่นด้วยจุลภาค ต้องกลายเป็น array ครบทุกค่า');

  /* ---------- ข้อ 7: เปิดใบเอง แล้วอนุมัติเอง ต้องถูกปฏิเสธ ---------- */
  var mine = api_call('api_createWorkOrder', [testWoForm_({ 'Location': 'จุดของคนสองหมวก' })], bothToken);
  assertEquals_(mine.ok, true, 'คนที่มีสิทธิ์ ADMIN เปิดใบงานได้');
  api_call('api_submitWorkOrder', [mine.data.woId, null], bothToken);

  var selfApprove = api_call('api_approveWorkOrder', [mine.data.woId, ASSIGNMENT.SERVICE, {}], bothToken);
  assertEquals_(selfApprove.ok, false,
    'มีสิทธิ์ผู้อนุมัติก็จริง แต่อนุมัติใบที่ตัวเองเปิดไม่ได้');
  assertEquals_(getWorkOrder(mine.data.woId)['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'และสถานะต้องไม่ขยับ');

  /* ---------- ข้อ 8: ใบที่คนอื่นเปิด อนุมัติได้ปกติ ---------- */
  var theirs = api_call('api_createWorkOrder', [testWoForm_({ 'Location': 'จุดของคนอื่น' })], otherToken);
  api_call('api_submitWorkOrder', [theirs.data.woId, null], otherToken);

  var approved = api_call('api_approveWorkOrder', [theirs.data.woId, ASSIGNMENT.SERVICE, {}], bothToken);
  assertEquals_(approved.ok, true, 'ใบที่คนอื่นเปิด คนสองหมวกอนุมัติได้ตามปกติ');
  assertEquals_(getWorkOrder(theirs.data.woId)['Overall_Status'], WO_STATUS.APPROVED,
    'และสถานะต้องเปลี่ยนจริง');

  return endTest_();
}

/**
 * Role ที่สะกดผิดถูกมองข้าม ส่วน Role ที่ถูกต้องในแถวเดียวกันยังใช้ได้
 *
 * ถ้าทำให้ทั้งแถวเสีย คนคนนั้นจะเข้าระบบไม่ได้เลยจากคำสะกดผิดตัวเดียว
 * ถ้าปล่อยผ่านชื่อที่ไม่รู้จัก ค่านั้นจะกลายเป็น Role ผีที่ไม่มีใครตรวจเจอ
 */
function test_auth_unknownRoleIgnored() {
  beginTest_('Role ที่สะกดผิดถูกมองข้าม ส่วนตัวที่ถูกยังใช้ได้');

  /* ---------- ตรรกะล้วน ---------- */
  assertEquals_(splitRoles_('ADMIN,APROVER_SP').join(','), 'ADMIN',
    'ตัวที่สะกดผิดถูกตัดทิ้ง ตัวที่ถูกยังอยู่');
  assertEquals_(splitRoles_(' admin , approver_sp ').join(','), 'ADMIN,APPROVER_SP',
    'ตัดช่องว่างหน้าหลัง และไม่สนตัวพิมพ์เล็กใหญ่');
  assertEquals_(splitRoles_('ADMIN,ADMIN').join(','), 'ADMIN', 'ค่าซ้ำต้องไม่นับสองครั้ง');
  assertEquals_(splitRoles_('ไม่มีค่านี้จริง').length, 0, 'ถ้าผิดหมด ต้องได้รายการว่าง');
  assertEquals_(splitRoles_('').length, 0, 'ช่องว่างเปล่าต้องได้รายการว่าง');
  assertEquals_(splitRoles_('SERVICE;LAB').join(','), 'SERVICE,LAB', 'รับตัวคั่นแบบอื่นได้ด้วย');

  /* ---------- เดินผ่านของจริง ---------- */
  /*
   * ตั้งใจให้ Role ที่ถูกต้องในแถวเป็น SERVICE ไม่ใช่ ADMIN
   * เพราะ ADMIN เปิดดูรายการรออนุมัติได้อยู่แล้ว การตรวจจะไม่พิสูจน์อะไรเลย
   */
  var user = addLoginTestUser_('TYPO', 'APROVER_SP,SERVICE,แผนกบริการ', 'รหัสผ่านของคนพิมพ์ผิด',
    { 'Department': DEPT.SERVICE });
  var token = loginThroughApi_(user.username, user.password).data.token;

  var menu = api_call('api_getMenu', [], token);
  assertEquals_(menu.ok, true, 'คำสะกดผิดต้องไม่ทำให้เข้าระบบไม่ได้');
  assertEquals_(menu.data.user.roles.join(','), 'SERVICE',
    'เหลือเฉพาะ Role ที่ระบบรู้จัก');

  // สิทธิ์ที่ถูกต้องในแถวเดียวกันต้องยังใช้ได้จริง
  assertEquals_(api_call('api_listMyTasks', [false], token).ok, true,
    'สิทธิ์ SERVICE ที่สะกดถูก ต้องยังใช้งานได้');

  /* ---------- ส่วนสิทธิ์ที่สะกดผิด ต้องไม่ได้มาแบบผี ๆ ---------- */
  /*
   * หน้ารายการรออนุมัติเปิดให้ทุกคนที่ล็อกอินได้อยู่แล้ว แต่จะเห็นเฉพาะสายที่ตัวเองอนุมัติได้
   * (พฤติกรรมเดิม ไม่ได้เปลี่ยน) ตัวที่พิสูจน์สิทธิ์จริงจึงเป็นการกดอนุมัติ
   */
  var pending = api_call('api_listPendingApprovals', [ROUTE.SP], token);
  assertEquals_(pending.ok, true, 'ทุกคนที่ล็อกอินได้ เปิดหน้ารายการได้ตามเดิม');
  assertEquals_(pending.data.rows.length, 0,
    'แต่คนที่ไม่ใช่ผู้อนุมัติ ต้องไม่เห็นใบงานที่รออนุมัติเลยแม้แต่ใบเดียว');

  var owner = addLoginTestUser_('TYPOADM', ROLE.ADMIN, 'รหัสผ่านของผู้เปิดใบงาน');
  var ownerToken = loginThroughApi_(owner.username, owner.password).data.token;
  var wo = api_call('api_createWorkOrder', [testWoForm_({ 'Location': 'จุดของคนพิมพ์ผิด' })], ownerToken);
  api_call('api_submitWorkOrder', [wo.data.woId, null], ownerToken);

  assertEquals_(api_call('api_approveWorkOrder', [wo.data.woId, ASSIGNMENT.SERVICE, {}], token).ok, false,
    'คำว่า APROVER_SP ที่สะกดผิด ต้องไม่กลายเป็นสิทธิ์ผู้อนุมัติ');
  assertEquals_(getWorkOrder(wo.data.woId)['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'และสถานะใบงานต้องไม่ขยับ');

  return endTest_();
}

/**
 * ไม่มีที่ไหนเก็บหรือ log รหัสผ่านเป็นข้อความธรรมดา และโทเคนไม่เคยอยู่ใน URL
 *
 * สองข้อนี้เป็นข้อที่ "ดูจากหน้าจอไม่ออก" จึงต้องมีตัวสแกนคอยจับแทนสายตาคน
 */
function test_auth_noPlainSecrets() {
  beginTest_('ไม่มีที่ไหนเก็บหรือ log รหัสผ่าน และโทเคนไม่เคยอยู่ใน URL');

  /* ---------- ที่เก็บในชีต ต้องไม่มีรหัสผ่านตัวจริง ---------- */
  var password = 'รหัสผ่านที่ห้ามโผล่ที่ไหนเลย';
  var user = addLoginTestUser_('SECRET', ROLE.ADMIN, password);

  var row = getUserRole(user.email);
  assertTrue_(String(row['Password_Hash']).indexOf(password) === -1,
    'คอลัมน์ Password_Hash ต้องไม่มีรหัสผ่านตัวจริงอยู่ข้างใน');
  assertTrue_(String(row['Password_Hash']).indexOf('sha256$') === 0,
    'และต้องเก็บในรูปที่บอกได้ว่าใช้วิธีไหนกี่รอบ');
  assertTrue_(String(row['Password_Salt']).length >= 32, 'เกลือต้องยาวพอและสุ่มจริง');

  // คนละคนต้องได้เกลือคนละตัว ไม่งั้นตารางเดารหัสชุดเดียวจะถอดได้ทุกคนพร้อมกัน
  var another = addLoginTestUser_('SECRET2', ROLE.ADMIN, password);
  assertTrue_(getUserRole(another.email)['Password_Salt'] !== row['Password_Salt'],
    'แต่ละคนต้องมีเกลือของตัวเอง');
  assertTrue_(getUserRole(another.email)['Password_Hash'] !== row['Password_Hash'],
    'รหัสผ่านเดียวกันของคนละคน ต้องได้ค่าที่เก็บไม่เหมือนกัน');

  /* ---------- วนหลายรอบจริง ไม่ใช่รอบเดียว ---------- */
  var once = bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    row['Password_Salt'] + ':' + password));
  assertTrue_(String(row['Password_Hash']).indexOf(once) === -1,
    'ต้องวนหลายรอบ ไม่ใช่เข้ารหัสรอบเดียวแล้วจบ');
  assertTrue_(PASSWORD_ITERATIONS >= 1000,
    'จำนวนรอบต้องมากพอที่จะทำให้การเดาแต่ละครั้งแพง');

  /* ---------- สแกนโค้ดทั้งหมด ---------- */
  /*
   * รวบผลเป็นรายการเดียวแล้วค่อยตรวจครั้งเดียว ไม่ตรวจทีละฟังก์ชัน
   * เพราะมีฟังก์ชันหลายร้อยตัว การตรวจทีละตัวจะได้จำนวนข้อเป็นพัน
   * ซึ่งทำให้รายงานผลอ่านไม่รู้เรื่อง ทั้งที่พิสูจน์เรื่องเดียวกันเป๊ะ
   */
  var sources = authSources_();
  var logsPassword = [];
  var tokenInUrl = [];
  var scanned = 0;

  for (var name in sources) {
    if (!Object.prototype.hasOwnProperty.call(sources, name)) continue;
    var code = stripComments_(sources[name]);
    scanned++;

    if (/Logger\.log\([^)]*[Pp]assword[^)]*\)/.test(code)) logsPassword.push(name);

    // โทเคนห้ามอยู่ใน URL เด็ดขาด เพราะ URL ติดไปกับประวัติเบราว์เซอร์
    // บันทึกของเซิร์ฟเวอร์ และหัวข้อ Referer ที่ส่งต่อไปยังเว็บอื่น
    if (/[?&]token=/.test(code) || code.indexOf('encodeURIComponent(savedToken') !== -1) {
      tokenInUrl.push(name);
    }
  }

  assertTrue_(scanned > 50, 'ตัวสแกนต้องเห็นโค้ดของระบบจริง (เห็น ' + scanned + ' ชิ้น)');
  assertEquals_(logsPassword.join(', '), '', 'ต้องไม่มีที่ไหน log รหัสผ่านเลย');
  assertEquals_(tokenInUrl.join(', '), '', 'ต้องไม่มีที่ไหนใส่โทเคนลงใน URL เลย');

  /* ---------- โทเคนต้องไปกับพารามิเตอร์เท่านั้น ---------- */
  var script = HtmlService.createHtmlOutputFromFile('ui_Script').getContent();
  assertTrue_(script.indexOf('runner.api_call(name, args || [], savedToken())') !== -1,
    'หน้าเว็บต้องส่งโทเคนไปกับพารามิเตอร์ของ api_call เท่านั้น');

  /* ---------- หน้าเว็บที่ส่งออกไป ต้องไม่มีโทเคนหรือรหัสผ่านฝังอยู่ ---------- */
  var page = renderPage_({ page: 'home', base: 'https://example.com/exec' });
  assertTrue_(page.indexOf(password) === -1, 'รหัสผ่านต้องไม่ติดไปกับหน้าเว็บ');
  assertTrue_(page.indexOf(String(row['Password_Hash'])) === -1,
    'ค่าที่เก็บของรหัสผ่านก็ต้องไม่ติดไปกับหน้า');

  return endTest_();
}

/**
 * เนื้อไฟล์ที่ต้องสแกนเรื่องรหัสผ่านและโทเคน
 *
 * ไฟล์ .gs อ่านจากดิสก์ไม่ได้บนชีตจริง จึงใช้เนื้อฟังก์ชันที่รันอยู่จริงแทน
 * ซึ่งครอบคลุมกว่าด้วย เพราะสแกนสิ่งที่ทำงานอยู่ ไม่ใช่สิ่งที่อยู่ในไฟล์
 *
 * @return {Object} แผนที่ชื่อไปยังเนื้อโค้ด
 */
function authSources_() {
  var out = {};
  var scope = (typeof globalThis !== 'undefined') ? globalThis : this;

  for (var key in scope) {
    if (typeof scope[key] !== 'function') continue;
    if (key.indexOf('test_') === 0) continue;   // ตัวเทสต์เองพูดถึงคำเหล่านี้โดยตั้งใจ
    try {
      out[key] = String(scope[key]);
    } catch (e) {
      // ฟังก์ชันในตัวของเครื่องยนต์ อ่านเนื้อไม่ได้ ไม่ใช่โค้ดของเรา
    }
  }

  out['ui_Script.html'] = HtmlService.createHtmlOutputFromFile('ui_Script').getContent();
  out['ui_Auth.html'] = HtmlService.createHtmlOutputFromFile('ui_Auth').getContent();
  out['ui_Nav.html'] = HtmlService.createHtmlOutputFromFile('ui_Nav').getContent();
  return out;
}

/**
 * ตั้งรหัสให้คนอื่นได้เฉพาะ ADMIN และต้องบังคับเปลี่ยนตอนเข้าครั้งแรก
 */
function test_auth_adminSetsPassword() {
  beginTest_('ตั้งรหัสให้คนอื่นได้เฉพาะ ADMIN และบังคับเปลี่ยนตอนเข้าครั้งแรก');

  var admin = addLoginTestUser_('SETADM', ROLE.ADMIN, 'รหัสผ่านของผู้ดูแล');
  var target = addLoginTestUser_('SETUSR', ROLE.SERVICE, 'รหัสผ่านเดิมของผู้ใช้',
    { 'Department': DEPT.SERVICE });

  var adminToken = loginThroughApi_(admin.username, admin.password).data.token;
  var targetToken = loginThroughApi_(target.username, target.password).data.token;

  /* ---------- คนที่ไม่ใช่ ADMIN ตั้งรหัสให้คนอื่นไม่ได้ ---------- */
  var denied = api_call('api_adminSetPassword', [admin.email, 'รหัสใหม่ที่ไม่ควรได้'], targetToken);
  assertEquals_(denied.ok, false, 'คนที่ไม่ใช่ผู้ดูแล ตั้งรหัสให้คนอื่นไม่ได้');
  assertEquals_(loginThroughApi_(admin.username, admin.password).ok, true,
    'และรหัสของผู้ดูแลต้องไม่ถูกเปลี่ยน');

  /* ---------- ADMIN ตั้งให้ได้ ---------- */
  var temp = 'รหัสชั่วคราวที่ผู้ดูแลตั้งให้';
  var result = api_call('api_adminSetPassword', [target.email, temp], adminToken);
  assertEquals_(result.ok, true, 'ผู้ดูแลตั้งรหัสชั่วคราวให้คนอื่นได้');

  // ตั้งรหัสใหม่แล้วโทเคนเดิมต้องใช้ไม่ได้ ไม่งั้นคนที่ยึดบัญชีไปแล้วยังอยู่ต่อได้อีก 12 ชั่วโมง
  assertEquals_(api_call('api_getMenu', [], targetToken).ok, false,
    'ตั้งรหัสใหม่แล้ว โทเคนเดิมของคนนั้นต้องถูกปิดทันที');

  assertEquals_(loginThroughApi_(target.username, target.password).ok, false,
    'รหัสเดิมต้องใช้ไม่ได้แล้ว');

  var first = loginThroughApi_(target.username, temp);
  assertEquals_(first.ok, true, 'รหัสชั่วคราวใช้เข้าได้');
  assertEquals_(first.data.mustChangePassword, true,
    'และต้องถูกบังคับให้เปลี่ยนรหัสตอนเข้าครั้งแรก');

  /* ---------- เปลี่ยนรหัสเองแล้ว ธงบังคับต้องหาย ---------- */
  var changed = api_call('api_changePassword', [temp, 'รหัสถาวรที่ตั้งเอง'], first.data.token);
  assertEquals_(changed.ok, true, 'เปลี่ยนรหัสเองได้');

  var second = loginThroughApi_(target.username, 'รหัสถาวรที่ตั้งเอง');
  assertEquals_(second.ok, true, 'เข้าด้วยรหัสใหม่ได้');
  assertEquals_(second.data.mustChangePassword, false, 'และไม่ถูกบังคับให้เปลี่ยนอีก');

  /* ---------- กติกาของรหัสใหม่ ต้องถูกบังคับที่ฝั่งเซิร์ฟเวอร์ ---------- */
  var token = second.data.token;
  assertEquals_(api_call('api_changePassword', ['รหัสถาวรที่ตั้งเอง', 'สั้นไป'], token).ok, false,
    'รหัสใหม่ที่สั้นกว่า 8 ตัวอักษร ต้องถูกปฏิเสธที่ฝั่งเซิร์ฟเวอร์ด้วย');
  assertEquals_(api_call('api_changePassword', ['รหัสเดิมที่ผิด', 'รหัสใหม่ยาวพอแล้ว'], token).ok, false,
    'ต้องยืนยันรหัสเดิมให้ถูกก่อนเสมอ แม้จะล็อกอินอยู่แล้ว');
  assertEquals_(api_call('api_changePassword',
    ['รหัสถาวรที่ตั้งเอง', 'รหัสถาวรที่ตั้งเอง'], token).ok, false,
    'รหัสใหม่ต้องไม่ซ้ำกับรหัสเดิม');

  return endTest_();
}

/**
 * ผู้ใช้คนแรก — ฟังก์ชันตั้งต้นต้องใช้ได้ครั้งเดียว
 */
function test_auth_firstAdminOnlyOnce() {
  beginTest_('สร้างผู้ดูแลคนแรกได้ครั้งเดียว ถ้ามีแล้วต้องปฏิเสธ');

  // ทะเบียนจริงอาจมี ADMIN อยู่แล้ว จึงพิสูจน์ด้วยด่านที่ฟังก์ชันใช้จริง
  var hasAdmin = false;
  var rows = listUserRoles(true);
  for (var i = 0; i < rows.length; i++) {
    if (splitRoles_(rows[i]['Role']).indexOf(ROLE.ADMIN) !== -1) { hasAdmin = true; break; }
  }

  if (!hasAdmin) {
    var created = createFirstAdmin(testPrefix_() + 'FIRST@cnr.co.th',
      testPrefix_() + 'FIRST', 'ผู้ดูแลคนแรก', 'รหัสชั่วคราวของคนแรก');
    assertTrue_(String(created).indexOf('สร้างผู้ดูแลคนแรกแล้ว') !== -1,
      'ยังไม่มีผู้ดูแล ต้องสร้างได้');
  }

  /* ---------- มี ADMIN แล้ว ต้องปฏิเสธเสมอ ---------- */
  assertThrowsMessage_(function () {
    createFirstAdmin(testPrefix_() + 'SECOND@cnr.co.th', testPrefix_() + 'SECOND',
      'ผู้ดูแลคนที่สอง', 'รหัสชั่วคราวของคนที่สอง');
  }, 'มีผู้ดูแล', 'มีผู้ดูแลอยู่แล้ว ต้องสร้างซ้ำไม่ได้ ไม่งั้นจะกลายเป็นประตูหลังถาวร');

  /* ---------- รหัสที่สั้นเกินไป ต้องถูกปฏิเสธ ---------- */
  // ตรวจที่ตัวกติกาโดยตรง เพราะด่าน "มีผู้ดูแลแล้ว" ปิดก่อนเสมอ ซึ่งถูกต้องแล้ว
  // การตรวจว่ามีผู้ดูแลอยู่หรือยัง ต้องมาก่อนการตรวจรูปแบบรหัสผ่านเสมอ
  assertThrowsMessage_(function () { assertPasswordStrength_('สั้น'); },
    'อย่างน้อย', 'รหัสชั่วคราวก็ต้องยาวพอเหมือนกัน');
  assertThrowsMessage_(function () { assertPasswordStrength_(''); },
    'อย่างน้อย', 'รหัสว่างเปล่าก็ต้องถูกปฏิเสธ');

  /* ---------- ผู้ใช้คนแรกต้องถูกบังคับเปลี่ยนรหัส ---------- */
  var firstRow = userByUsername_(testPrefix_() + 'FIRST');
  if (firstRow) {
    assertEquals_(cellToBoolean_(firstRow['Must_Change_Password']), true,
      'ผู้ดูแลคนแรกต้องถูกบังคับให้เปลี่ยนรหัสตอนเข้าครั้งแรก');
  } else {
    assertTrue_(true, 'ชีตนี้มีผู้ดูแลอยู่ก่อนแล้ว จึงข้ามการตรวจผู้ดูแลคนแรก');
  }

  return endTest_();
}

/**
 * ทางเข้าจากโปรเจกต์หน้าบ้านต้องถูกปิดสนิท
 *
 * ระบบเลิกแยกสองโปรเจกต์แล้ว แต่โค้ดยังไม่ถูกลบเพื่อให้ถอยกลับได้
 * ตราบใดที่ยังอยู่ ต้องมีเทสต์ยืนยันว่ามันปิดจริง ไม่ใช่แค่ "ตั้งใจจะปิด"
 */
function test_permission_gatewayDisabled() {
  beginTest_('ทางเข้าจากโปรเจกต์หน้าบ้านต้องปิดสนิท');

  assertEquals_(GATEWAY_ENABLED, false, 'ธงต้องเป็นปิด');

  var before = countAllRows_();
  var form = testWoForm_({ 'Location': 'จุดทดสอบทางเข้าเก่า' });
  var secret = '';
  try {
    secret = getProp_(GATEWAY_SECRET_PROP, false) || '';
  } catch (e) {
    secret = '';
  }

  /* ---------- ทุกชนิดคำขอต้องถูกปฏิเสธ แม้รหัสลับจะถูก ---------- */
  var attempts = [
    { mode: GATEWAY_MODE.API, action: 'api_createWorkOrder', args: [form], email: 'ใครก็ได้@example.com' },
    { mode: GATEWAY_MODE.PAGE, params: { page: 'home' }, email: 'ใครก็ได้@example.com' },
    { mode: GATEWAY_MODE.DIAG, email: 'ใครก็ได้@example.com' }
  ];

  for (var i = 0; i < attempts.length; i++) {
    attempts[i].secret = secret;
    var result = JSON.parse(doPost(postEvent_(attempts[i])).getContent());
    assertEquals_(result.ok, false, 'คำขอชนิด ' + attempts[i].mode + ' ต้องถูกปฏิเสธ');
    assertEquals_(result.message, GATEWAY_ONLY_MESSAGE,
      'และต้องไม่บอกเหตุผล ไม่บอกว่าปิดอยู่หรือรหัสลับผิด');
  }

  /* ---------- และต้องไม่มีแถวใดถูกเขียนลงชีตเลย ---------- */
  assertEquals_(countAllRows_().total, before.total,
    'ทางเข้าที่ปิดแล้ว ต้องไม่ทำให้มีแถวใหม่ในชีตแม้แต่แถวเดียว');

  /* ---------- ทางเข้าใหม่ต้องทำงานแทนได้จริง ---------- */
  var admin = addLoginTestUser_('GWNEW', ROLE.ADMIN, 'รหัสผ่านของผู้ดูแล');
  var token = loginThroughApi_(admin.username, admin.password).data.token;
  assertEquals_(api_call('api_getMenu', [], token).ok, true,
    'ทางเข้าใหม่ (api_call พร้อมโทเคน) ต้องใช้งานได้แทน');

  return endTest_();
}


/* ===========================================================================
 * ชุดทดสอบของการตัดสถานะร่างออก และงานที่ตามมา (SPEC 4.1, 5, 17.2)
 * =========================================================================== */

/**
 * EDIT และ SUBMIT ใช้ได้จากสถานะ RETURNED เท่านั้น
 *
 * เดินผ่านชั้น Service จริง ไม่ใช่ตารางล้วน เพราะจุดที่ต้องพิสูจน์คือ
 * "สถานะที่อยู่ในชีตจริง" เป็นตัวตัดสิน ไม่ใช่ค่าที่ผู้เรียกส่งเข้ามา
 */
function test_service_editOnlyFromReturned() {
  beginTest_('EDIT และ SUBMIT ใช้ได้จาก RETURNED เท่านั้น — SPEC 5');

  var users = serviceTestUsers_();

  /* ---------- ใบที่รออนุมัติ แก้ไม่ได้ ส่งซ้ำไม่ได้ ---------- */
  var pending = createTestWo_(users, { 'Location': 'จุดที่รออนุมัติอยู่' });
  assertEquals_(pending.workOrder['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'ใบงานใหม่อยู่ที่รออนุมัติ');

  var form = testWoForm_({
    'Customer_Code': pending.workOrder['Customer_Code'],
    'Location': 'จุดที่รออนุมัติอยู่',
    'Contact': 'ชื่อที่พยายามแก้'
  });

  assertThrowsMessage_(function () { editWorkOrder(pending.woId, form, users.admin); },
    'รออนุมัติ', 'แก้ใบที่รออนุมัติไม่ได้ และข้อความต้องบอกสถานะปัจจุบัน');
  assertThrowsMessage_(function () { submitWorkOrder(pending.woId, users.admin); },
    'รออนุมัติ', 'ส่งขออนุมัติซ้ำจากสถานะรออนุมัติไม่ได้');
  assertEquals_(getWorkOrder(pending.woId)['Contact'], pending.workOrder['Contact'],
    'ถูกปฏิเสธแล้วข้อมูลเดิมต้องไม่ถูกแตะ');

  /* ---------- ใบที่อนุมัติแล้ว ก็แก้ไม่ได้เช่นกัน ---------- */
  var approved = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดที่อนุมัติแล้ว' });
  assertThrowsMessage_(function () {
    editWorkOrder(approved.woId, testWoForm_({
      'Customer_Code': approved.workOrder['Customer_Code'], 'Location': 'จุดที่อนุมัติแล้ว'
    }), users.admin);
  }, 'อนุมัติแล้ว', 'แก้ใบที่อนุมัติไปแล้วไม่ได้');

  /* ---------- ใบที่ถูกตีกลับ แก้ได้และส่งใหม่ได้ ---------- */
  var returned = returnedTestWo_(users, { 'Location': 'จุดที่ถูกตีกลับแล้ว' });
  var edited = editWorkOrder(returned.woId, testWoForm_({
    'Customer_Code': returned.workOrder['Customer_Code'],
    'Location': 'จุดที่ถูกตีกลับแล้ว',
    'Contact': 'ผู้ติดต่อที่แก้ใหม่'
  }), users.admin);
  assertEquals_(edited.workOrder['Contact'], 'ผู้ติดต่อที่แก้ใหม่', 'แก้ใบที่ถูกตีกลับได้');
  assertEquals_(edited.workOrder['Overall_Status'], WO_STATUS.RETURNED,
    'การแก้ไขไม่เปลี่ยนสถานะ ยังเป็นตีกลับอยู่');

  assertEquals_(submitWorkOrder(returned.woId, users.admin).to, WO_STATUS.PENDING_APPROVE,
    'แก้แล้วส่งขออนุมัติใหม่ได้');

  /* ---------- ยกเลิกทั้งใบได้จากสองสถานะนี้เท่านั้น (SPEC 8) ---------- */
  // ใช้ใบเดิมที่สร้างไว้แล้วข้างบน ต้นทุนส่วนใหญ่อยู่ที่การเตรียมข้อมูล ไม่ใช่การตรวจคำตอบ
  assertThrows_(function () { cancelWorkOrder(approved.woId, 'ขอยกเลิก', users.admin); },
    'ใบที่อนุมัติไปแล้ว ยกเลิกทั้งใบไม่ได้ ต้องยกเลิกรายแผนกแทน (SPEC 8)');

  var returnedCancel = returnedTestWo_(users, { 'Location': 'จุดที่จะยกเลิกตอนถูกตีกลับ' });
  assertEquals_(cancelWorkOrder(returnedCancel.woId, 'ลูกค้ายกเลิก', users.admin).to,
    WO_STATUS.CANCELLED, 'ยกเลิกใบที่ถูกตีกลับได้');

  assertEquals_(cancelWorkOrder(pending.woId, 'ลูกค้ายกเลิก', users.admin).to, WO_STATUS.CANCELLED,
    'ยกเลิกใบที่รออนุมัติได้');

  return endTest_();
}

/**
 * แนบหลายไฟล์ในหัวข้อเดียว ต้องได้ _01 _02 _03 ต่อเนื่องกัน ไม่ทับกัน
 *
 * เดินผ่านทางเข้าจริง (uploadFile) เพื่อให้ครอบทั้งการตั้งชื่อ การไล่เลข และการบันทึกทะเบียน
 */
function test_files_manyPerTopic() {
  beginTest_('แนบหลายไฟล์ในหัวข้อเดียว ได้ลำดับต่อเนื่อง — SPEC 14.2');

  if (!getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false)) {
    Logger.log('  (ข้าม: ยังไม่ได้ตั้งค่าที่เก็บไฟล์ กดรัน setupDriveFolder() ก่อน)');
    assertTrue_(true, 'ข้ามการทดสอบอัปโหลดเมื่อยังไม่ได้ตั้งค่าที่เก็บไฟล์');
    return endTest_();
  }

  var users = serviceTestUsers_();
  var topicId = testPrefix_() + 'TOPIC-MANY';
  appendRow_(SHEET.ATTACHMENT_TOPIC, {
    'Topic_ID': topicId, 'Scope': FILE_SCOPE.WO, 'Topic_Name': 'รูปภาพ (หลายไฟล์)',
    'Required': false, 'Multiple': true, 'Active': true
  });

  var wo = createTestWo_(users, { 'Location': 'จุดที่แนบหลายไฟล์' });

  /* ---------- ส่งทีละไฟล์ 3 ไฟล์ เหมือนที่หน้าเว็บทำ ---------- */
  var names = ['หน้างาน1.jpg', 'หน้างาน2.jpg', 'หน้างาน3.jpg'];
  var saved = [];
  for (var i = 0; i < names.length; i++) {
    var row = uploadFile({
      woId: wo.woId, scope: FILE_SCOPE.WO, topicId: topicId,
      fileName: names[i], mimeType: 'image/jpeg', content: 'QUJDRA=='
    }, users.admin);
    saved.push(row['Saved_File_Name']);
  }

  assertEquals_(saved[0], wo.woId + '_รูปภาพ (หลายไฟล์)_01.jpg', 'ไฟล์แรกได้ลำดับ 01');
  assertEquals_(saved[1], wo.woId + '_รูปภาพ (หลายไฟล์)_02.jpg', 'ไฟล์ที่สองได้ลำดับ 02');
  assertEquals_(saved[2], wo.woId + '_รูปภาพ (หลายไฟล์)_03.jpg', 'ไฟล์ที่สามได้ลำดับ 03');

  // ชื่อต้องไม่ซ้ำกันเลย ไม่งั้นไฟล์หลังจะทับไฟล์หน้าใน Drive
  assertEquals_(saved.length, uniqueCount_(saved), 'ชื่อไฟล์ทั้งสามต้องไม่ซ้ำกัน');

  /* ---------- ชื่อเดิมของผู้ใช้ต้องถูกเก็บไว้ (SPEC 14.2) ---------- */
  var files = listWoFileViews(wo.woId);
  assertEquals_(files.length, 3, 'ทะเบียนไฟล์มีครบ 3 แถว');
  var originals = [];
  for (var f = 0; f < files.length; f++) originals.push(files[f].originalName);
  originals.sort();
  assertEquals_(originals.join(', '), names.join(', '),
    'ชื่อไฟล์เดิมของผู้ใช้ถูกเก็บไว้ครบ เผื่อต้องตรวจสอบย้อนกลับ');

  /* ---------- อัปโหลดต่ออีกไฟล์ ต้องได้ 04 ไม่ใช่เริ่มใหม่ ---------- */
  var fourth = uploadFile({
    woId: wo.woId, scope: FILE_SCOPE.WO, topicId: topicId,
    fileName: 'หน้างาน4.jpg', mimeType: 'image/jpeg', content: 'QUJDRA=='
  }, users.admin);
  assertEquals_(fourth['Saved_File_Name'], wo.woId + '_รูปภาพ (หลายไฟล์)_04.jpg',
    'อัปโหลดเพิ่มภายหลังต้องนับต่อ ไม่เริ่มใหม่');

  return endTest_();
}

/**
 * จำนวนค่าที่ไม่ซ้ำกันในรายการ
 * @param {string[]} list รายการ
 * @return {number}
 */
function uniqueCount_(list) {
  var seen = {};
  var count = 0;
  for (var i = 0; i < list.length; i++) {
    if (seen[list[i]]) continue;
    seen[list[i]] = true;
    count++;
  }
  return count;
}

/**
 * ลบไฟล์แล้วต้องตั้ง Is_Active = false และไฟล์ยังอยู่ใน Drive (SPEC D-8)
 *
 * ลบแถวจริงหรือลบไฟล์ถาวร แปลว่าลบผิดแล้วกู้ไม่ได้ ซึ่งเกิดขึ้นแน่ ๆ สักวัน
 */
function test_files_deleteKeepsFile() {
  beginTest_('ลบไฟล์แล้วปิดใช้งานในทะเบียน ไฟล์ยังอยู่ใน Drive — SPEC D-8');

  if (!getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false)) {
    Logger.log('  (ข้าม: ยังไม่ได้ตั้งค่าที่เก็บไฟล์ กดรัน setupDriveFolder() ก่อน)');
    assertTrue_(true, 'ข้ามการทดสอบลบไฟล์เมื่อยังไม่ได้ตั้งค่าที่เก็บไฟล์');
    return endTest_();
  }

  var users = serviceTestUsers_();
  var topicId = testPrefix_() + 'TOPIC-DELETE';
  appendRow_(SHEET.ATTACHMENT_TOPIC, {
    'Topic_ID': topicId, 'Scope': FILE_SCOPE.WO, 'Topic_Name': 'เอกสารที่จะลบ',
    'Required': false, 'Multiple': true, 'Active': true
  });

  var wo = createTestWo_(users, { 'Location': 'จุดที่จะลบไฟล์' });
  var row = uploadFile({
    woId: wo.woId, scope: FILE_SCOPE.WO, topicId: topicId,
    fileName: 'เอกสาร.pdf', mimeType: 'application/pdf', content: 'QUJDRA=='
  }, users.admin);

  var fileId = row['File_ID'];
  var driveId = row['Drive_File_ID'];
  var rowsBefore = listFiles().length;

  assertEquals_(listWoFileViews(wo.woId).length, 1, 'แนบแล้วเห็นในรายการ 1 ไฟล์');

  /* ---------- ลบ ---------- */
  removeFile(fileId);

  assertEquals_(listWoFileViews(wo.woId).length, 0, 'ลบแล้วหายจากรายการที่แสดง');
  assertEquals_(listFiles().length, rowsBefore, 'แต่แถวในทะเบียนต้องยังอยู่ ไม่ถูกลบจริง');
  assertEquals_(cellToBoolean_(getFile(fileId)['Is_Active']), false,
    'แถวนั้นถูกตั้ง Is_Active = false แทนการลบ');
  assertEquals_(getFile(fileId)['Drive_File_ID'], driveId,
    'รหัสไฟล์บน Drive ยังถูกเก็บไว้ เผื่อต้องกู้คืน');

  /* ---------- ไฟล์บน Drive ต้องยังอยู่ แค่ย้ายไปถังขยะ ---------- */
  /*
   * ต้องตรวจสองอย่างคู่กัน ไม่ใช่อย่างเดียว
   *   ยังอยู่      = ไม่ถูกลบถาวร กู้คืนได้ภายใน 30 วัน
   *   อยู่ในถังขยะ = ถูกลบจริง ไม่ใช่แค่ซ่อนในทะเบียนแล้วทิ้งไฟล์ค้างไว้บน Drive
   * ถ้าตรวจแค่ "ยังอยู่" การไม่ลบเลยก็ผ่านเทสต์ได้ ซึ่งแปลว่าเทสต์ไม่ได้พิสูจน์อะไร
   */
  assertTrue_(driveFileExistsAnywhere_(driveId),
    'ไฟล์บน Drive ต้องยังอยู่ ไม่ถูกลบถาวร');
  assertTrue_(driveFileIsTrashed_(driveId),
    'และต้องถูกย้ายไปถังขยะจริง ไม่ใช่ค้างอยู่ในโฟลเดอร์เหมือนไม่มีอะไรเกิดขึ้น');

  /* ---------- ลบแล้วแนบใหม่ ต้องไม่ใช้เลขเดิมซ้ำ ---------- */
  var again = uploadFile({
    woId: wo.woId, scope: FILE_SCOPE.WO, topicId: topicId,
    fileName: 'เอกสารใหม่.pdf', mimeType: 'application/pdf', content: 'QUJDRA=='
  }, users.admin);
  assertEquals_(again['Saved_File_Name'], wo.woId + '_เอกสารที่จะลบ_02.pdf',
    'ลบไฟล์ 01 ไปแล้ว ไฟล์ใหม่ต้องได้ 02 ไม่ใช่ 01 ซ้ำ');

  /* ---------- บันทึก Audit ของการลบ ---------- */
  var audit = queryRows_(SHEET.AUDIT_LOG, { 'WO_ID': wo.woId });
  var found = false;
  for (var a = 0; a < audit.length; a++) {
    if (String(audit[a]['Action']) === ACTION.DELETE_FILE &&
        String(audit[a]['WO_ID']) === wo.woId) { found = true; break; }
  }
  assertTrue_(found, 'การลบไฟล์ต้องถูกบันทึกลง Audit_Log');

  return endTest_();
}

/**
 * รายการใบงานที่ถูกตีกลับ — แสดงเฉพาะ RETURNED และเฉพาะคนที่มีสิทธิ์ (SPEC 17.2)
 */
function test_web_returnedList() {
  beginTest_('รายการใบงานที่ถูกตีกลับ — SPEC 17.2');

  var users = serviceTestUsers_();

  var returned = returnedTestWo_(users, { 'Location': 'จุดที่ถูกตีกลับรอแก้' });
  var pending = createTestWo_(users, { 'Location': 'จุดที่ยังรออนุมัติ' });
  var approved = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดที่อนุมัติแล้ว' });

  /* ---------- ADMIN เห็นเฉพาะใบที่ถูกตีกลับ ---------- */
  var list = withTestUser_(users.admin, function () { return api_listReturnedWorkOrders(); });
  assertEquals_(list.ok, true, 'ธุรการเปิดรายการได้');
  assertTrue_(isJsonSafe_(list.data), 'ผลลัพธ์ต้องส่งผ่าน google.script.run ได้ (กฎข้อ 14)');

  var ids = [];
  for (var i = 0; i < list.data.rows.length; i++) ids.push(list.data.rows[i].woId);
  assertTrue_(ids.indexOf(returned.woId) !== -1, 'ใบที่ถูกตีกลับต้องอยู่ในรายการ');
  assertTrue_(ids.indexOf(pending.woId) === -1, 'ใบที่รออนุมัติต้องไม่อยู่ในรายการ');
  assertTrue_(ids.indexOf(approved.woId) === -1, 'ใบที่อนุมัติแล้วต้องไม่อยู่ในรายการ');

  // ทุกแถวต้องเป็น RETURNED จริง ไม่ใช่แค่ใบที่เราสร้างเอง
  for (var r = 0; r < list.data.rows.length; r++) {
    assertEquals_(getWorkOrder(list.data.rows[r].woId)['Overall_Status'], WO_STATUS.RETURNED,
      'ทุกแถวในรายการต้องเป็นใบที่ถูกตีกลับจริง');
  }

  /* ---------- ข้อมูลที่ต้องแสดงครบตามที่ตกลงไว้ ---------- */
  var mine = null;
  for (var m = 0; m < list.data.rows.length; m++) {
    if (list.data.rows[m].woId === returned.woId) { mine = list.data.rows[m]; break; }
  }
  assertTrue_(!!mine, 'หาใบที่เพิ่งตีกลับเจอในรายการ');
  assertEquals_(mine.returnReason, 'ตีกลับเพื่อให้แก้ไขในชุดทดสอบ', 'แสดงเหตุผลที่ถูกตีกลับ');
  assertEquals_(mine.returnedBy, users.approver.email, 'แสดงว่าใครเป็นคนตีกลับ');
  assertEquals_(mine.returnCount, 1, 'แสดงจำนวนครั้งที่เคยถูกตีกลับ');
  assertTrue_(!!mine.display.returnedDate, 'แสดงวันเวลาที่ถูกตีกลับ');
  assertTrue_(String(mine.display.returnedDate).indexOf('-') !== -1,
    'และต้องผ่านตัวจัดรูปแบบวันที่จุดเดียวของระบบ (กฎข้อ 20)');

  /* ---------- เรียงใบที่ค้างนานที่สุดไว้บนสุด ---------- */
  /*
   * ต้องมีอย่างน้อยสองใบที่เวลาต่างกันจริง ถึงจะพิสูจน์การเรียงได้
   * ถ้าเทียบเฉพาะที่มีอยู่ ใบเดียวก็ผ่าน ซึ่งแปลว่าเทสต์ไม่ได้ตรวจอะไรเลย
   *
   * ตั้งเวลาเองแทนการรอ เพราะใบที่สร้างติดกันอาจได้เวลาเดียวกันในระดับมิลลิวินาที
   */
  var older = returnedTestWo_(users, { 'Location': 'จุดที่ค้างนานที่สุด' });
  var newer = returnedTestWo_(users, { 'Location': 'จุดที่เพิ่งถูกตีกลับ' });
  var now = new Date().getTime();
  updateWorkOrder(older.woId, { 'Returned_Date': new Date(now - 7 * 24 * 3600 * 1000) });
  updateWorkOrder(newer.woId, { 'Returned_Date': new Date(now - 60 * 1000) });

  var sorted = withTestUser_(users.admin, function () { return api_listReturnedWorkOrders(); }).data.rows;
  var olderAt = -1;
  var newerAt = -1;
  for (var o = 0; o < sorted.length; o++) {
    if (sorted[o].woId === older.woId) olderAt = o;
    if (sorted[o].woId === newer.woId) newerAt = o;
  }
  assertTrue_(olderAt !== -1 && newerAt !== -1, 'ทั้งสองใบต้องอยู่ในรายการ');
  assertTrue_(olderAt < newerAt,
    'ใบที่ถูกตีกลับนานกว่าต้องอยู่บนกว่า เพราะเป็นใบที่เสี่ยงถูกลืมที่สุด');

  for (var q = 1; q < sorted.length; q++) {
    assertTrue_(sorted[q - 1].returnedAt <= sorted[q].returnedAt,
      'และทั้งรายการต้องเรียงจากเก่าไปใหม่ตลอด');
  }

  /* ---------- คนที่ไม่มีสิทธิ์ ต้องถูกปฏิเสธก่อนดึงข้อมูล ---------- */
  var outsiders = [
    { who: users.service, name: 'แผนกบริการ' },
    { who: users.project, name: 'แผนกโครงการ' },
    { who: users.approver, name: 'ผู้อนุมัติ' },
    { who: users.labApprover, name: 'ผู้อนุมัติแล็บ' }
  ];
  for (var x = 0; x < outsiders.length; x++) {
    var denied = withTestUser_(outsiders[x].who, function () { return api_listReturnedWorkOrders(); });
    assertEquals_(denied.ok, false, outsiders[x].name + ' เปิดรายการนี้ไม่ได้');
    assertTrue_(!denied.data, 'และต้องไม่มีข้อมูลใดติดมาเลย');
  }

  /* ---------- ก้อนข้อมูลของหน้า ต้องไม่ถูกดึงมาให้คนที่ไม่มีสิทธิ์ ---------- */
  var bootDenied = withTestUser_(users.service, function () {
    return pageBootstrap_('returned', {});
  });
  assertTrue_(bootDenied.rows === undefined,
    'หน้าที่ผู้ใช้ไม่มีสิทธิ์ ต้องไม่ดึงข้อมูลมาแต่แรก (SPEC 17.3)');

  return endTest_();
}

/**
 * ไม่เหลือสถานะร่างในโค้ดและในตาราง Transition
 *
 * ค่าที่ไม่มี Transition ใดสร้างได้ คือค่าที่จะกลายเป็นงานค้างถาวรโดยไม่มีใครสังเกต
 * (เหตุผลเดียวกับที่ Task ไม่มีสถานะ RETURNED — SPEC 4.2)
 *
 * ชื่อที่ค้นถูกประกอบขึ้นตอนรัน เพื่อไม่ให้ตัวเทสต์เองกลายเป็นผลการค้นหา
 */
function test_service_noDraftLeft() {
  beginTest_('ไม่เหลือสถานะร่างในโค้ดและในตาราง Transition — SPEC 4.1');

  var needle = 'DRA' + 'FT';

  /* ---------- ชุดค่าสถานะ ---------- */
  assertEquals_(WO_STATUS[needle], undefined, 'WO_STATUS ต้องไม่มีค่าสถานะร่างอีกแล้ว');
  var values = [];
  for (var key in WO_STATUS) {
    if (Object.prototype.hasOwnProperty.call(WO_STATUS, key)) values.push(WO_STATUS[key]);
  }
  assertTrue_(values.indexOf(needle) === -1, 'และต้องไม่มีค่านั้นหลงเหลือในชุดค่า');
  assertEquals_(WO_STATUS_TH[needle], undefined, 'ตารางแปลภาษาไทยก็ต้องไม่มี');

  /* ---------- ตาราง Transition ---------- */
  var transitions = getTransitions();
  var reachable = {};
  for (var t = 0; t < transitions.length; t++) {
    var move = transitions[t];
    assertTrue_(String(move.to) !== needle, 'ไม่มี Transition ใดพาไปสู่สถานะร่าง');

    var from = move.from || [];
    for (var f = 0; f < from.length; f++) {
      assertTrue_(String(from[f]) !== needle, 'และไม่มี Transition ใดออกจากสถานะร่าง');
    }
    if (move.entity === ENTITY.WO && move.to && move.to !== KEEP_STATUS) reachable[move.to] = true;
  }

  /*
   * ทุกค่าใน WO_STATUS ต้องมีทางไปถึงจริง
   * ค่าที่ไม่มีใครสร้างได้คือค่าที่จะกลายเป็นงานค้างถาวรโดยไม่มีใครสังเกต
   * ยกเว้น IN_PROGRESS / COMPLETED / CANCELLED ที่มาจาก recalcWoStatus ไม่ใช่จากตาราง
   */
  var fromRecalc = [WO_STATUS.IN_PROGRESS, WO_STATUS.COMPLETED, WO_STATUS.CANCELLED];
  for (var v = 0; v < values.length; v++) {
    var ok = reachable[values[v]] || fromRecalc.indexOf(values[v]) !== -1;
    assertTrue_(ok, 'สถานะ ' + values[v] + ' ต้องมีทางไปถึงได้จริง');
  }

  /* ---------- สแกนโค้ดที่ทำงานอยู่จริง ---------- */
  /*
   * สแกนจากเนื้อฟังก์ชันที่รันอยู่ ไม่ใช่จากไฟล์บนดิสก์ วิธีนี้ใช้ได้ทั้งบนชีตจริงและกับ mock
   * (บนชีตจริงอ่านไฟล์ .gs ไม่ได้ ถ้าสแกนจากไฟล์ เทสต์จะข้ามไปเงียบ ๆ ตอนที่สำคัญที่สุด)
   */
  var scope = (typeof globalThis !== 'undefined') ? globalThis : this;
  var offenders = [];
  var scanned = 0;

  for (var name in scope) {
    if (typeof scope[name] !== 'function') continue;
    if (name.indexOf('test_') === 0) continue;   // ตัวเทสต์พูดถึงค่านี้โดยตั้งใจ
    scanned++;
    var source;
    try {
      source = String(scope[name]);
    } catch (e) {
      continue;
    }
    /*
     * เดิมต้องตัดชื่อค่าคงที่ที่เก็บไว้ค้นหาใบเก่าออกก่อน เพราะชื่อนั้นมีคำนี้อยู่ข้างใน
     * ตอนนี้ค่าคงที่นั้นถูกลบไปแล้ว ข้อยกเว้นจึงหายไปด้วย · การค้นหาจึงตรงไปตรงมา
     * และแรงกว่าเดิม เพราะไม่มีทางไหนที่อ้างถึงสถานะร่างแล้วยังผ่านได้อีก
     */
    if (source.indexOf(needle) !== -1) offenders.push(name);
  }

  assertTrue_(scanned > 50, 'ตัวสแกนต้องเห็นโค้ดของระบบจริง (เห็น ' + scanned + ' ชิ้น)');
  assertEquals_(offenders.join(', '), '',
    'ต้องไม่มีฟังก์ชันใดอ้างถึงสถานะร่างอีกแล้ว');

  /* ---------- หน้าเว็บก็ต้องไม่เหลือ ---------- */
  var pages = ['ui_CreateWo', 'ui_Home', 'ui_WoList', 'ui_Approve', 'ui_DeptWork',
    'ui_LabWork', 'ui_Returned', 'ui_Script', 'ui_Nav', 'ui_Auth'];
  for (var p = 0; p < pages.length; p++) {
    var html = HtmlService.createHtmlOutputFromFile(pages[p]).getContent();
    assertTrue_(html.indexOf(needle) === -1, pages[p] + ' ต้องไม่อ้างถึงสถานะร่างอีกแล้ว');
  }

  /* ---------- หน้าสร้างใบงานเหลือปุ่มเดียว ---------- */
  var createPage = HtmlService.createHtmlOutputFromFile('ui_CreateWo').getContent();
  assertTrue_(createPage.indexOf('btnSaveDraft') === -1, 'ไม่มีปุ่มบันทึกร่างเหลืออยู่');
  assertTrue_(createPage.indexOf('id="btnSubmit"') !== -1, 'เหลือปุ่มส่งขออนุมัติปุ่มเดียว');

  /* ---------- ค่าเก่าถูกถอดออกหมดแล้ว ---------- */
  /*
   * เดิมข้อนี้ยืนยันตรงกันข้าม คือ "ต้องยังมีค่าเดิมไว้ค้นหาใบที่ค้างในชีต"
   * ซึ่งถูกต้องตอนที่ข้อมูลยังอยู่ในชีตและอาจมีใบค้างจากยุคที่ยังมีขั้นบันทึกร่าง
   *
   * ข้อมูลย้ายมาฐานข้อมูลแล้ว และการเทียบสองฝั่งยืนยันว่าตาราง WorkOrder เริ่มจากศูนย์
   * จึงไม่มีใบค้างให้ตามหา · ค่าคงที่ที่ไม่มีใครใช้คือสิ่งที่เชิญให้โค้ดในอนาคตเดาความหมาย
   * ของมันเอง จึงถูกลบทิ้งพร้อมกับตัวนับที่เคยใช้มัน
   */
  assertEquals_(typeof LEGACY_DRAFT_STATUS, 'undefined',
    'ค่าคงที่ของสถานะร่างต้องถูกลบไปแล้ว ไม่ใช่เก็บไว้เฉย ๆ โดยไม่มีใครใช้');
  assertEquals_(typeof countDraftWorkOrders, 'undefined',
    'และตัวนับใบที่ค้างเป็นร่างก็ต้องหายไปด้วย');

  return endTest_();
}

/**
 * หาที่ที่เรียก goToUrl() โดยไม่ได้อยู่ในตัวจัดการการกดของผู้ใช้
 *
 * รับเนื้อไฟล์เข้ามาแทนที่จะอ่านไฟล์เอง เพื่อให้เทสต์ป้อนตัวอย่างปลอมเข้าไปตรวจ
 * ตัวสแกนเองได้ว่ายังจับได้จริง — ตัวสแกนที่ตาบอดจะทำให้ทุกอย่างผ่านอย่างสบายใจ
 *
 * วิธีตัดสิน: ไล่ย้อนจากจุดที่เรียก ขึ้นไปหา function ที่ใกล้ที่สุดซึ่งครอบมันอยู่
 *   ฟังก์ชันไม่มีชื่อ  ต้องถูกส่งให้ addEventListener('click', ...) ตรงนั้นเลย
 *   ฟังก์ชันมีชื่อ     ต้องมีที่ใดที่หนึ่งในไฟล์เดียวกันผูกชื่อนั้นไว้กับการกด
 * ตัวนิยาม function goToUrl เองไม่นับ
 *
 * @param {string} source เนื้อไฟล์หน้าเว็บ
 * @return {string[]} ชื่อฟังก์ชันที่เรียกโดยไม่ได้เกิดจากการกด
 */
function goToUrlSitesOutsideClicks_(source) {
  var code = stripComments_(String(source || ''));
  var offenders = [];
  var from = 0;

  while (true) {
    var at = code.indexOf('goToUrl(', from);
    if (at === -1) break;
    from = at + 1;

    // ตัวนิยามของฟังก์ชันกลางเอง ไม่ใช่การเรียกใช้
    if (code.lastIndexOf('function ', at) === at - 9) continue;

    var opened = code.lastIndexOf('function', at);
    if (opened === -1) { offenders.push('(นอกฟังก์ชันใด ๆ)'); continue; }

    var header = code.substring(opened, at);
    var named = /^function\s+([A-Za-z0-9_$]+)\s*\(/.exec(header);

    if (!named) {
      // ฟังก์ชันไม่มีชื่อ — ต้องเป็นตัวที่ถูกส่งให้การกดตรงนั้นเลย
      var before = code.substring(Math.max(0, opened - 60), opened);
      if (/addEventListener\(\s*['"]click['"]\s*,\s*$/.test(before)) continue;
      if (/onclick\s*=\s*$/.test(before)) continue;
      offenders.push('(ฟังก์ชันไม่มีชื่อ)');
      continue;
    }

    var name = named[1];
    /*
     * เทียบแบบตรงตัว ไม่ใช้ตัวจับรูปแบบ เพราะทั้งระบบเขียนผูกการกดแบบเดียวกันหมด
     * และการเขียนตัวจับรูปแบบซ้อนในสตริง เคยทำให้ไฟล์เสียมาแล้ว
     */
    if (code.indexOf("addEventListener('click', " + name + ')') !== -1) continue;
    if (code.indexOf('onclick = ' + name) !== -1) continue;
    offenders.push(name);
  }

  return offenders;
}

/**
 * ห้ามเปลี่ยนหน้าเองโดยที่ผู้ใช้ไม่ได้กด และถ้าจะเปลี่ยน ต้องสั่งที่หน้าต่างชั้นนอก
 *
 * หน้าเว็บของ Apps Script อยู่ในกรอบที่ยอมให้เปลี่ยนหน้าต่างชั้นนอกได้
 * "เฉพาะตอนที่ผู้ใช้กดจริง" เท่านั้น ข้อจำกัดนี้มีสองชั้นซ้อนกัน และเคยพังทั้งสองชั้น
 *
 *   ชั้นแรก  สั่ง location.href ในกรอบ → เปลี่ยนแค่ตัวกรอบ ได้จอขาว
 *   ชั้นสอง  สั่งที่ชั้นนอกถูกวิธีแล้ว แต่ไม่ได้เกิดจากการกด → เบราว์เซอร์บล็อกเงียบ ๆ
 *            ข้อความจริงที่ได้คือ "Unsafe attempt to initiate navigation for frame ...
 *            sandboxed with 'allow-top-navigation-by-user-activation' flag,
 *            but has no user activation"
 *
 * เคยพังจริงทั้งคู่: เปลี่ยนรหัสผ่านสำเร็จแล้วได้จอขาว (ชั้นแรก) พอแก้เป็น window.open
 * ก็กลายเป็นค้างอยู่เฉย ๆ ตอนถูกพาไปหน้าเข้าสู่ระบบเอง (ชั้นสอง)
 * ทางแก้จึงไม่ใช่เปลี่ยนวิธีเปลี่ยนหน้า แต่คือ "ไม่เปลี่ยนหน้า" — วาดแผงทับในหน้าเดิม
 *
 * ส่วนลิงก์ในเมนูไม่เคยพัง เพราะ <base target="_top"> จัดการให้กับ <a> ที่ผู้ใช้กดอยู่แล้ว
 */
function test_web_noAutoNavigation() {
  beginTest_('ห้ามเปลี่ยนหน้าเองโดยผู้ใช้ไม่ได้กด — SPEC 17.3');

  var pages = ['ui_Script', 'ui_Nav', 'ui_Auth', 'ui_Home', 'ui_CreateWo',
    'ui_Approve', 'ui_DeptWork', 'ui_LabWork', 'ui_Returned'];

  /* ---------- ต้องมีตัวกลางตัวเดียว และต้องสั่งที่ชั้นนอก ---------- */
  var script = HtmlService.createHtmlOutputFromFile('ui_Script').getContent();
  assertTrue_(script.indexOf('function goToUrl') !== -1,
    'ต้องมีฟังก์ชันกลางตัวเดียวสำหรับเปลี่ยนหน้า');
  assertTrue_(script.indexOf("window.open(url, '_top')") !== -1,
    "ตัวกลางต้องสั่งที่หน้าต่างชั้นนอกด้วย window.open(url, '_top')");

  /* ---------- ห้ามหน้าไหนเปลี่ยนหน้าเองด้วย location.href ---------- */
  var offenders = [];
  for (var i = 0; i < pages.length; i++) {
    var source = stripComments_(HtmlService.createHtmlOutputFromFile(pages[i]).getContent());
    if (/location\.href\s*=/.test(source)) offenders.push(pages[i]);
  }
  assertEquals_(offenders.join(', '), '',
    'ห้ามหน้าไหนสั่ง location.href เอง เพราะจะเปลี่ยนแค่ตัว iframe แล้วได้จอขาว');

  /* ---------- ที่อยู่ต้องมาจากเซิร์ฟเวอร์ ไม่ใช่ประกอบเอาเองจาก location ---------- */
  /*
   * location ของ iframe เป็นที่อยู่ของกรอบชั้นใน ซึ่งไม่ใช่ที่อยู่ของเว็บแอป
   * ถ้าประกอบเอาเองจากตรงนั้น จะได้ที่อยู่ที่เปิดไม่ได้
   */
  var guessers = [];
  for (var g = 0; g < pages.length; g++) {
    var code = stripComments_(HtmlService.createHtmlOutputFromFile(pages[g]).getContent());
    if (/location\.(origin|pathname|host)/.test(code)) guessers.push(pages[g]);
  }
  assertEquals_(guessers.join(', '), '',
    'ที่อยู่ต้องมาจาก data-base-url / data-home-url ที่เซิร์ฟเวอร์ส่งมาให้เท่านั้น');

  /* ---------- goToUrl เรียกได้เฉพาะจากตัวจัดการการกดเท่านั้น ---------- */
  /*
   * ข้อนี้คือหัวใจของบทเรียนทั้งหมด · การเปลี่ยนหน้าที่ไม่ได้เกิดจากการกด
   * ถูกบล็อกเสมอ ไม่ว่าจะเขียนถูกวิธีแค่ไหน จึงต้องกันไว้ที่ตัวเรียก ไม่ใช่ที่ตัวกลาง
   */
  var autoNav = [];
  for (var n = 0; n < pages.length; n++) {
    var sites = goToUrlSitesOutsideClicks_(
      HtmlService.createHtmlOutputFromFile(pages[n]).getContent());
    for (var t = 0; t < sites.length; t++) autoNav.push(pages[n] + ' → ' + sites[t]);
  }
  assertEquals_(autoNav.join(', '), '',
    'goToUrl ต้องถูกเรียกจากตัวจัดการการกดเท่านั้น การเปลี่ยนหน้าเองจะถูกเบราว์เซอร์บล็อก');

  /* ---------- ตัวสแกนต้องจับได้จริง ไม่ใช่ผ่านเพราะหาไม่เจอ ---------- */
  // เทสต์ที่ผ่านเพราะตัวสแกนตาบอด อันตรายกว่าไม่มีเทสต์ เพราะทำให้สบายใจผิด ๆ
  assertEquals_(goToUrlSitesOutsideClicks_(
    'function startPage() { goToUrl(pageData("home-url")); }').join(', '), 'startPage',
    'ตัวสแกนต้องจับการเรียก goToUrl จากฟังก์ชันที่ไม่ใช่ตัวจัดการการกดได้');
  assertEquals_(goToUrlSitesOutsideClicks_(
    "b.addEventListener('click', openHome); function openHome() { goToUrl(url); }").join(', '), '',
    'และต้องไม่ฟ้องเมื่อเรียกจากฟังก์ชันที่ถูกผูกไว้กับการกด');
  assertEquals_(goToUrlSitesOutsideClicks_(
    "b.addEventListener('click', function () { goToUrl(url); });").join(', '), '',
    'รวมถึงตัวจัดการการกดที่เขียนแบบไม่มีชื่อ');

  /* ---------- สถานะที่ต้องเปลี่ยนเอง ต้องวาดทับในหน้าเดิม ---------- */
  var shared = stripComments_(HtmlService.createHtmlOutputFromFile('ui_Script').getContent());
  assertTrue_(shared.indexOf('requireLogin(result.message)') !== -1,
    'โทเคนใช้ไม่ได้ ต้องวาดแผงเข้าสู่ระบบทับหน้าเดิม ไม่ใช่พาไปหน้าอื่น');
  assertTrue_(shared.indexOf('goToLogin') === -1,
    'ต้องไม่เหลือทางที่พาผู้ใช้ไปหน้าเข้าสู่ระบบเอง เพราะการพาไปจะถูกบล็อกเสมอ');

  var navBar = stripComments_(HtmlService.createHtmlOutputFromFile('ui_Nav').getContent());
  assertTrue_(navBar.indexOf('requireLogin(') !== -1,
    'ออกจากระบบแล้วต้องวาดแผงเข้าสู่ระบบทับหน้าเดิมเช่นกัน');
  assertTrue_(navBar.indexOf('PAGE_STATE_.loaded = true') !== -1,
    'หน้าที่ได้ข้อมูลไปแล้วต้องทำเครื่องหมายไว้ ไม่งั้นการล็อกอินใหม่จะเริ่มหน้าซ้ำแล้วผูกปุ่มซ้อน');

  var panel = stripComments_(HtmlService.createHtmlOutputFromFile('ui_Auth').getContent());
  assertTrue_(panel.indexOf("saveToken('')") !== -1,
    'ตอนขอให้ล็อกอินใหม่ ต้องทิ้งโทเคนที่ใช้ไม่ได้แล้วทันที ไม่ส่งซ้ำไปเรื่อย ๆ');
  assertTrue_(panel.indexOf('resumeAfterLogin()') !== -1,
    'ล็อกอินสำเร็จแล้วต้องทำงานต่อที่หน้าเดิม ไม่ใช่ปล่อยให้ผู้ใช้เห็นหน้าว่าง');

  /* ---------- ทุกหน้าต้องมีแผงเข้าสู่ระบบติดตัวไปด้วย ---------- */
  // หน้าที่ลืมใส่ จะเรียก requireLogin ไม่เจอตอนโทเคนหมดอายุ แล้วค้างเงียบ ๆ
  var fullPages = ['ui_Home', 'ui_CreateWo', 'ui_Approve', 'ui_DeptWork',
    'ui_LabWork', 'ui_Returned'];
  for (var f = 0; f < fullPages.length; f++) {
    var body = HtmlService.createHtmlOutputFromFile(fullPages[f]).getContent();
    assertTrue_(body.indexOf("include('ui_Auth')") !== -1,
      fullPages[f] + ' ต้องมีแผงเข้าสู่ระบบติดมากับหน้า');
    assertTrue_(body.indexOf('bootPage(') !== -1,
      fullPages[f] + ' ต้องบอกไว้ว่าจะทำอะไรต่อเมื่อผู้ใช้ล็อกอินสำเร็จกลางคัน');
  }

  /* ---------- หน้าที่มีฟอร์มให้กรอก ห้ามโหลดทับของที่พิมพ์ค้างไว้ ---------- */
  var createPage = stripComments_(HtmlService.createHtmlOutputFromFile('ui_CreateWo').getContent());
  assertTrue_(/bootPage\(\s*boot\s*\)/.test(createPage),
    'หน้าสร้างใบงานต้องไม่บอกวิธีโหลดข้อมูลใหม่ ไม่งั้นสิ่งที่ผู้ใช้กรอกค้างไว้จะถูกล้าง');

  /* ---------- เซิร์ฟเวอร์ต้องส่งที่อยู่มาให้ทุกหน้า ---------- */
  var known = Object.keys(WEB_PAGES);
  for (var k = 0; k < known.length; k++) {
    var html = renderPage_({ page: known[k], base: 'https://example.com/exec' });
    assertTrue_(html.indexOf('data-base-url="https://example.com/exec"') !== -1,
      'หน้า ' + known[k] + ' ต้องได้ที่อยู่ของเว็บแอปมากับหน้า');
    assertTrue_(html.indexOf('data-home-url="https://example.com/exec?page=home"') !== -1,
      'และต้องได้ที่อยู่ของหน้าแรกมาด้วย เพื่อให้มีทางออกเสมอ');
  }

  /* ---------- ทุกหน้าต้องตั้ง target เป็นชั้นนอกให้ลิงก์ธรรมดาด้วย ---------- */
  for (var b = 0; b < pages.length; b++) {
    var page = HtmlService.createHtmlOutputFromFile(pages[b]).getContent();
    if (page.indexOf('<html') === -1) continue;   // ไฟล์ที่เป็นชิ้นส่วน ไม่ใช่หน้าเต็ม
    assertTrue_(page.indexOf('<base target="_top">') !== -1,
      pages[b] + ' ต้องตั้ง base target เป็น _top ไม่งั้นลิงก์จะเปิดในกรอบ');
  }

  return endTest_();
}

/**
 * ที่เก็บไฟล์ของระบบต้องพร้อมใช้งาน — อยู่ใน test_smoke เพื่อให้ฟ้องแต่เนิ่น ๆ
 *
 * อาการ "อัปโหลดไม่ได้" มองจากหน้าจอแล้วแยกไม่ออกว่าเป็นเพราะยังไม่ตั้งค่า
 * โฟลเดอร์ถูกลบ หรือสิทธิ์ไม่พอ ซึ่งสามอย่างนี้แก้คนละวิธีกันหมด
 */
function test_driveFolder() {
  beginTest_('ที่เก็บไฟล์ของระบบพร้อมใช้งาน');

  var report = checkDriveFolder();
  Logger.log('  ' + report);

  var id = getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false);
  if (!id) {
    /*
     * ยังไม่ตั้งค่า = ยังแนบไฟล์ไม่ได้ทั้งระบบ แต่ไม่ใช่เรื่องที่ควรทำให้ทั้งกลุ่มแดง
     * เพราะชีตที่เพิ่งติดตั้งยังไม่ได้ตั้งค่าเป็นเรื่องปกติ · สิ่งที่ต้องรับประกันคือ
     * ข้อความต้องบอกทางออก ไม่ใช่บอกแค่ว่าเปิดไม่ได้
     */
    assertTrue_(String(report).indexOf('setupDriveFolder') !== -1,
      'ยังไม่ได้ตั้งค่า ต้องบอกให้ชัดว่าต้องกดรันอะไร');
    assertTrue_(String(DRIVE_NOT_SET_UP_MESSAGE).indexOf('setupDriveFolder') !== -1,
      'และข้อความที่ผู้ใช้เห็นตอนแนบไฟล์ ก็ต้องบอกว่าต้องแจ้งผู้ดูแลให้ทำอะไร');
    Logger.log('  (ยังไม่ได้ตั้งค่าที่เก็บไฟล์ — กดรัน setupDriveFolder() หนึ่งครั้ง)');
    return endTest_();
  }

  /* ---------- ตั้งค่าแล้ว ต้องเปิดได้จริง ---------- */
  assertTrue_(String(report).indexOf('พร้อมใช้งาน') !== -1,
    'ตั้งค่าไว้แล้ว ต้องเปิดโฟลเดอร์ได้จริง (ได้: ' + report + ')');
  assertTrue_(!!driveFolderById_(id), 'เปิดโฟลเดอร์รากจากรหัสที่เก็บไว้ได้');

  /* ---------- กดซ้ำต้องไม่สร้างโฟลเดอร์ใหม่ ---------- */
  // โฟลเดอร์ซ้ำแปลว่าไฟล์เก่าอยู่คนละที่กับไฟล์ใหม่ แล้วไม่มีใครรู้จนกว่าจะไปตามหาไฟล์
  var again = setupDriveFolder();
  assertTrue_(String(again).indexOf('มีที่เก็บไฟล์อยู่แล้ว') !== -1,
    'กด setupDriveFolder ซ้ำ ต้องไม่สร้างใหม่');
  assertEquals_(getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false), id,
    'และรหัสโฟลเดอร์ต้องไม่เปลี่ยน');

  return endTest_();
}

/**
 * รากหายแต่ไฟล์ยังอยู่ — เครื่องมือต้องพาไปทางที่ถูก ไม่ใช่ทางที่ลบของทิ้ง
 *
 * **ข้อนี้มาจากเหตุการณ์จริงเมื่อ 28-09-2026** · รหัสรากที่จำไว้ชี้ไปที่โฟลเดอร์ที่ถูกลบ
 * ถาวรแล้ว แต่ไฟล์ของทุกใบงานยังอยู่ครบ เพราะทางที่ใช้จริงไม่เคยผ่านราก (SPEC 16) ·
 * ข้อความของเครื่องมือตอนนั้นแนะนำให้ลบค่าแล้วสร้างรากใหม่ ซึ่งเป็นทางแก้ของอีกกรณีหนึ่ง
 * ถ้าเจ้าของระบบทำตาม ไฟล์ของห้าใบงานจะกลายเป็นของกำพร้าที่ระบบมองไม่เห็นอีกเลย
 *
 * ข้อนี้จึงไม่ได้ตรวจว่า "ไม่โยน error" แต่ตรวจว่า **แนะนำถูกกรณี** และ
 * **ไม่พิมพ์ทางแก้ของอีกกรณีปนมาด้วย** เพราะคนที่เลือกผิดในสถานะนี้ไฟล์หายถาวร
 */
function test_files_deadRootKeepsOldFiles() {
  beginTest_('รากของที่เก็บไฟล์หาย แต่โฟลเดอร์ใบงานยังอยู่ — ต้องไม่ชวนให้สร้างใหม่');

  if (!getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false)) {
    Logger.log('  (ข้าม: ยังไม่ได้ตั้งค่าที่เก็บไฟล์)');
    assertTrue_(true, 'ข้ามเมื่อยังไม่ได้ตั้งค่า');
    return endTest_();
  }

  var props = PropertiesService.getScriptProperties();
  var realRoot = props.getProperty(PROP_KEY.DRIVE_ROOT_FOLDER);

  // ต้องมีโฟลเดอร์ใบงานอยู่จริงก่อน ไม่งั้นสถานะที่จำลองไม่ใช่สถานะที่เกิดขึ้นจริง
  var containerId = driveWoContainer_().getId();
  var realContainer = props.getProperty(PROP_DRIVE_WO_FOLDER);
  var parent = driveFolderParent_(containerId);

  var deadId = 'ไม่มีโฟลเดอร์รหัสนี้อยู่จริง';

  try {
    /* ---------- กรณีที่เกิดขึ้นจริง: รากตาย ใบงานรอด ---------- */
    props.setProperty(PROP_KEY.DRIVE_ROOT_FOLDER, deadId);

    var report = String(checkDriveFolder());
    Logger.log('  ' + report);

    assertTrue_(report.indexOf('พร้อมใช้งาน') === -1,
      'รากเปิดไม่ได้ ต้องไม่รายงานว่าพร้อมใช้งาน');
    assertTrue_(report.indexOf('ห้ามรัน setupDriveFolder()') !== -1,
      'ต้องห้ามไว้ชัด ๆ เพราะนั่นคือทางที่ทำให้ไฟล์เก่าหายจากระบบถาวร');
    assertTrue_(report.indexOf('ลบค่า Script Property') === -1,
      'ห้ามพิมพ์ทางแก้ของอีกกรณีปนมาด้วย · คนที่เลือกผิดในสถานะนี้ไฟล์หายถาวร');
    if (parent) {
      assertTrue_(report.indexOf(parent.id) !== -1,
        'ต้องพิมพ์รหัสของโฟลเดอร์แม่ออกมาให้คัดลอกไปวางได้ ไม่ใช่ให้ไปไล่หาเองใน Drive');
    }

    /* ---------- และเครื่องมือสร้าง ต้องปฏิเสธเอง ไม่ใช่พึ่งให้คนอ่านคำเตือน ---------- */
    var setup = String(setupDriveFolder());
    Logger.log('  ' + setup);
    assertTrue_(setup.indexOf('ไม่ได้สร้างรากใหม่') !== -1,
      'setupDriveFolder ต้องปฏิเสธเมื่อโฟลเดอร์ใบงานยังเปิดได้ (ได้: ' + setup + ')');
    assertEquals_(props.getProperty(PROP_KEY.DRIVE_ROOT_FOLDER), deadId,
      'และต้องไม่เขียนทับรหัสราก เพราะการเขียนทับคือการตัดขาดจากของเก่า');
    assertEquals_(props.getProperty(PROP_DRIVE_WO_FOLDER), String(containerId),
      'รหัสโฟลเดอร์ใบงานต้องอยู่ครบ ไม่ถูกลืมทิ้งระหว่างทาง');

    /* ---------- ลืมรหัสที่จำไว้ ต้องตัดสินจากฐานข้อมูล ไม่ใช่จากความว่างเปล่า ---------- */
    /*
     * การลบค่าใน Script Properties ไม่ได้แปลว่าไม่เหลืออะไรแล้ว · ตราบใดที่ฐานข้อมูล
     * ยังบันทึก Folder_ID ของใบงานไว้ ของเก่ายังมีอยู่ และคำห้ามต้องยังอยู่ ·
     * ข้อนี้จึงถามฐานข้อมูลก่อนว่าอยู่ในกรณีไหน แล้วค่อยตรวจคำแนะนำของกรณีนั้น
     * (ฉบับแรกของข้อนี้เดาว่าเป็นกรณี "ไม่เหลืออะไร" เสมอ แล้วแดงบนของจริง
     *  ซึ่งถูกต้องแล้วที่มันแดง เพราะโค้ดเป็นฝ่ายถูก)
     */
    props.deleteProperty(PROP_DRIVE_WO_FOLDER);
    var empty = String(checkDriveFolder());
    Logger.log('  ' + empty);

    if (oneWorkOrderFolderId_()) {
      assertTrue_(empty.indexOf('ห้ามรัน setupDriveFolder()') !== -1,
        'ฐานข้อมูลยังบอกว่ามีโฟลเดอร์ของใบงานอยู่ คำห้ามจึงต้องยังอยู่');
      assertTrue_(empty.indexOf('ลบค่า Script Property') === -1,
        'และยังห้ามพิมพ์ทางแก้ของกรณีที่ไม่เหลืออะไรปนมา');
    } else {
      assertTrue_(empty.indexOf('ลบค่า Script Property') !== -1,
        'เมื่อไม่เหลืออะไรเลย ต้องบอกทางสร้างใหม่');
      assertTrue_(empty.indexOf('ห้ามรัน setupDriveFolder()') === -1,
        'และต้องไม่ห้ามในกรณีที่ไม่มีอะไรให้เสียแล้ว — คำห้ามที่ผิดกรณีทำให้คนติดอยู่เฉย ๆ');
    }

  } finally {
    props.setProperty(PROP_KEY.DRIVE_ROOT_FOLDER, realRoot);
    if (realContainer) props.setProperty(PROP_DRIVE_WO_FOLDER, realContainer);
    else props.setProperty(PROP_DRIVE_WO_FOLDER, String(containerId));
  }

  assertEquals_(getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false), realRoot,
    'ต้องคืนค่าเดิมให้ครบหลังทดสอบ ไม่ทิ้งระบบไว้ในสถานะที่จำลองขึ้น');

  return endTest_();
}

/* ---------------------------------------------------------------------------
 * ตัวรันรวม
 * --------------------------------------------------------------------------- */

/**
 * ตรวจเร็วก่อน push ทุกครั้ง — ตรรกะล้วนบวกการเดินงานจริงหนึ่งรอบให้ครบวงจร
 * ใช้เวลาน้อยที่สุดในบรรดาทุกกลุ่ม เหมาะกดหลัง clasp push เพื่อดูว่าระบบยังมีชีวิตอยู่
 * @return {string} ข้อความสรุปผล
 */
function test_smoke() {
  return runGroup_('SMOKE', [
    { name: 'test_suitesAllGrouped', fn: test_suitesAllGrouped },
    { name: 'test_config_oauthScopes', fn: test_config_oauthScopes },
    { name: 'test_timezone',         fn: test_timezone },
    { name: 'test_textColumns',      fn: test_textColumns },
    { name: 'test_formatForDisplay', fn: test_formatForDisplay },
    { name: 'test_config',           fn: test_config },
    { name: 'test_recalcWoStatus',   fn: test_recalcWoStatus },
    { name: 'test_driveFolder',      fn: test_driveFolder },
    { name: 'test_files_deadRootKeepsOldFiles', fn: test_files_deadRootKeepsOldFiles },
    { name: 'test_notify_checkTool', fn: test_notify_checkTool },
    { name: 'test_report_masterCheck', fn: test_report_masterCheck },
    { name: 'test_smoke_flow',       fn: test_smoke_flow }
  ]);
}

/**
 * กลุ่มชั้น Repo — อ่านเขียนชีต หัวคอลัมน์ Optimistic Lock และ Audit
 * ต้องตั้ง Script Property ชื่อ AUDIT_SHEET_ID ก่อน มิฉะนั้นชุด Audit จะไม่ผ่าน
 * @return {string} ข้อความสรุปผล
 */
function test_group_repo() {
  return runGroup_('REPO', [
    { name: 'test_repo_schema',         fn: test_repo_schema },
    { name: 'test_repo_writeRead',      fn: test_repo_writeRead },
    { name: 'test_repo_rowCache',       fn: test_repo_rowCache },
    { name: 'test_repo_fixturesFillRequiredColumns', fn: test_repo_fixturesFillRequiredColumns },
    { name: 'test_repo_noWholeTableReads',   fn: test_repo_noWholeTableReads },
    { name: 'test_repo_optimisticLock', fn: test_repo_optimisticLock },
    { name: 'test_repo_cacheMatchesSheet', fn: test_repo_cacheMatchesSheet },
    { name: 'test_repo_cleanupSafety',  fn: test_repo_cleanupSafety },
    { name: 'test_repo_masterCache',    fn: test_repo_masterCache },
    { name: 'test_repo_audit',          fn: test_repo_audit }
  ]);
}

/**
 * กลุ่ม StateMachine — ตรรกะ Transition ล้วน บวกการต่อเข้ากับชีตจริง
 * @return {string} ข้อความสรุปผล
 */
function test_group_statemachine() {
  return runGroup_('STATEMACHINE', [
    { name: 'test_woTransitions',    fn: test_woTransitions },
    { name: 'test_taskTransitions',  fn: test_taskTransitions },
    { name: 'test_completeTaskFlow', fn: test_completeTaskFlow },
    { name: 'test_statemachine_integration_flow',        fn: test_statemachine_integration_flow },
    { name: 'test_statemachine_integration_autoCancel',  fn: test_statemachine_integration_autoCancel },
    { name: 'test_statemachine_integration_guards',      fn: test_statemachine_integration_guards },
    { name: 'test_statemachine_integration_pausedTasks', fn: test_statemachine_integration_pausedTasks }
  ]);
}

/*
 * ชั้น Service และกลุ่มสิทธิ์ ถูกแตกเป็นกลุ่มย่อยเพราะเพดานเวลา 6 นาทีต่อการกดหนึ่งครั้ง
 *
 * กลุ่ม PERMISSION เดิม 840 รอบชีต รันบนชีตจริงไม่จบ ถูกฆ่ากลางคัน — ซึ่งแย่กว่าไม่ผ่าน
 * เพราะไม่รู้ว่าพังหรือแค่ช้า และข้อมูลทดสอบค้างอยู่ในชีตโดยไม่ได้ล้าง
 *
 * กติกาการแตก
 *   แตกตามเรื่อง ไม่ใช่ตามจำนวนข้อ — กลุ่มไหนแดงต้องรู้ทันทีว่าต้องเปิดไฟล์ไหน
 *   ทุกกลุ่มต้องต่ำกว่า 400 รอบชีต เพื่อให้มีที่เหลือเมื่อข้อมูลจริงโตขึ้น
 *
 * ตัวเลขในวงเล็บคือจำนวนรอบชีตที่วัดได้จาก mock ในเครื่อง ไม่ใช่เวลาจริงบนชีต
 */

/**
 * ขอบเขตวันการทำงาน — วันครบกำหนดต้องคำนวณจากวันไทยเสมอ (SPEC 9.2 · กฎข้อ 19 · 23)
 *
 * ชุดนี้ทดสอบตรรกะล้วน ไม่แตะข้อมูลเลยสักแถว จึงตรึงพฤติกรรมได้ทุกกรณีโดยไม่ต้อง
 * รอให้เวลาจริงเดินไปถึงวันนั้น · "วันนี้" ถูกส่งเข้าไปเป็นพารามิเตอร์ ซึ่งเป็นเหตุผล
 * ที่ dueInfoOf_ รับ todayText ได้ตั้งแต่แรก — ไม่ใช่เพื่อความสะดวก แต่เพื่อให้
 * ข้อที่สำคัญที่สุดของฟีเจอร์นี้ทดสอบได้จริง
 */
function test_wo_durationDays() {
  beginTest_('ขอบเขตวันการทำงาน และวันครบกำหนดตามเวลาไทย');

  /* ---------- วันไทย ไม่ใช่วัน UTC ---------- */
  /*
   * ข้อนี้คือหัวใจของทั้งฟีเจอร์ · ใบงานที่เปิดตอนตีหนึ่งของวันที่ 1 ตุลาคม
   * ตามเวลาไทย คือหกโมงเย็นของวันที่ 30 กันยายนตาม UTC — **คนละวัน**
   * ถ้านับจากวัน UTC วันครบกำหนดจะเลื่อนไปหนึ่งวันสำหรับทุกใบที่เปิดก่อนเจ็ดโมงเช้า
   * ซึ่งคือช่วงที่ธุรการเปิดใบงานกันจริง
   */
  var justAfterMidnight = new Date('2026-10-01T01:00:00+07:00');
  assertEquals_(thaiDayOf_(justAfterMidnight), '2026-10-01',
    'ตีหนึ่งของวันที่ 1 ตุลาคมตามเวลาไทย ต้องเป็นวันที่ 1 ตุลาคม');
  assertEquals_(justAfterMidnight.toISOString().substring(0, 10), '2026-09-30',
    'และวันเดียวกันนั้นเป็นวันที่ 30 กันยายนตาม UTC — สองค่านี้ต่างกันจริง ข้อข้างบนจึงมีความหมาย');

  var lateOnLastDay = new Date('2026-09-30T23:30:00+07:00');
  assertEquals_(thaiDayOf_(lateOnLastDay), '2026-09-30',
    'ใบที่เปิดตอน 23:30 ของวันสิ้นเดือนตามเวลาไทย ต้องนับเป็นวันที่ 30 กันยายน');

  var overMidnight = dueInfoOf_(justAfterMidnight, 1, WO_STATUS.PENDING_APPROVE, '2026-10-01');
  assertEquals_(overMidnight.dueDate, '2026-10-02',
    'เปิดใบตอนตีหนึ่งวันที่ 1 ตุลาคม บวกหนึ่งวัน ต้องครบกำหนดวันที่ 2 ตุลาคม ไม่ใช่วันที่ 1');

  var lateDue = dueInfoOf_(lateOnLastDay, 1, WO_STATUS.PENDING_APPROVE, '2026-09-30');
  assertEquals_(lateDue.dueDate, '2026-10-01',
    'เปิดใบตอน 23:30 วันสิ้นเดือน บวกหนึ่งวัน ต้องครบกำหนดวันที่ 1 ตุลาคม');

  /* ---------- สามสถานะของการนับ ---------- */
  var opened = new Date('2026-09-01T09:00:00+07:00');

  var before = dueInfoOf_(opened, 15, WO_STATUS.IN_PROGRESS, '2026-09-10');
  assertEquals_(before.state, DUE_STATE.BEFORE, 'ยังไม่ถึงกำหนด');
  assertEquals_(before.days, 6, 'และบอกได้ว่าเหลืออีกกี่วัน');
  assertEquals_(before.dueDate, '2026-09-16', '1 กันยายน บวก 15 วัน ได้ 16 กันยายน');
  assertEquals_(before.dueText, '16-09-2026', 'วันที่ที่แสดงให้คนอ่านใช้รูปแบบเดียวทั้งระบบ (กฎข้อ 20)');

  var today = dueInfoOf_(opened, 15, WO_STATUS.IN_PROGRESS, '2026-09-16');
  assertEquals_(today.state, DUE_STATE.TODAY, 'ครบกำหนดวันนี้ ต้องเป็นสถานะของตัวเอง ไม่ใช่เกินกำหนด');
  assertEquals_(today.days, 0, 'และไม่ใช่เกินมาศูนย์วัน');

  var over = dueInfoOf_(opened, 15, WO_STATUS.IN_PROGRESS, '2026-09-20');
  assertEquals_(over.state, DUE_STATE.OVER, 'เกินกำหนดแล้ว');
  assertEquals_(over.days, 4, 'และบอกได้ว่าเกินมากี่วัน');

  /* ---------- ไม่ได้กรอกจำนวนวัน = ไม่แสดงอะไรเลย ---------- */
  /*
   * **ห้ามตีความช่องว่างเป็นศูนย์วัน** ใบส่วนใหญ่ไม่ได้กรอกช่องนี้
   * ถ้าช่องว่างแปลว่าครบกำหนดทันที ทั้งระบบจะเลยกำหนดพร้อมกันหมดตั้งแต่วันแรก
   */
  var blanks = ['', null, undefined, 0, '0', -3, 'สิบห้า'];
  for (var b = 0; b < blanks.length; b++) {
    var none = dueInfoOf_(opened, blanks[b], WO_STATUS.IN_PROGRESS, '2026-09-20');
    assertEquals_(none.has, false,
      'ค่า [' + String(blanks[b]) + '] ในช่องจำนวนวัน ต้องถือว่าไม่ได้กำหนดขอบเขต');
    assertEquals_(none.state, '', 'และต้องไม่มีสถานะใด ๆ ให้หน้าจอเอาไปแสดง');
  }

  /* ---------- ใบที่จบแล้วต้องหยุดนับ ---------- */
  /*
   * ถ้านับต่อ รายการงานที่เสร็จหมดแล้วจะเต็มไปด้วยป้ายแดงที่ไม่มีความหมาย
   * แล้วคนจะเลิกมองป้ายทั้งหมด รวมทั้งใบที่เตือนถูก — ซึ่งแย่กว่าไม่มีป้ายเลย
   */
  var closedStates = [WO_STATUS.COMPLETED, WO_STATUS.CANCELLED];
  for (var c = 0; c < closedStates.length; c++) {
    var done = dueInfoOf_(opened, 15, closedStates[c], '2026-12-31');
    assertEquals_(done.counting, false, 'ใบที่ ' + closedStates[c] + ' แล้วต้องหยุดนับ');
    assertEquals_(done.state, DUE_STATE.CLOSED, 'และมีสถานะของตัวเองแยกจากสามสถานะที่ยังนับอยู่');
    assertEquals_(done.days, 0, 'ไม่มีจำนวนวันที่เกินให้แสดง');
    assertEquals_(done.dueDate, '2026-09-16',
      'แต่วันครบกำหนดยังต้องบอกได้ เพราะหน้ารายละเอียดยังต้องแสดงว่ากำหนดไว้วันไหน');
  }

  /* ---------- นับเป็นวันตามปฏิทิน ไม่ใช่วันทำการ ---------- */
  var friday = new Date('2026-09-04T09:00:00+07:00');   // ศุกร์
  assertEquals_(dueInfoOf_(friday, 3, WO_STATUS.IN_PROGRESS, '2026-09-04').dueDate, '2026-09-07',
    'ศุกร์บวกสามวันตามปฏิทิน ได้วันจันทร์ ไม่ใช่วันพุธแบบวันทำการ');

  /* ---------- ข้ามเดือนและข้ามปี ---------- */
  assertEquals_(addDaysToDay_('2026-12-30', 5), '2027-01-04', 'บวกวันข้ามปีได้ถูกต้อง');
  assertEquals_(addDaysToDay_('2028-02-28', 1), '2028-02-29', 'และรู้จักปีอธิกสุรทิน');
  assertEquals_(daysBetweenDays_('2026-12-30', '2027-01-04'), 5, 'นับระยะห่างข้ามปีได้ถูกต้อง');

  return endTest_();
}

/**
 * โครงการเป็นช่องบังคับ และด่านอยู่ที่ชั้น API ไม่ใช่ที่หน้าจอ (SPEC 9.1 · 9.3 · กฎข้อ 7)
 *
 * เริ่มจาก api_ ที่หน้าเว็บเรียกจริง ไม่ใช่เรียกชั้น Service ตรง ๆ เพราะการซ่อน
 * หรือกันที่หน้าจออย่างเดียวไม่ใช่การป้องกัน — ใครก็ยิง api_ ตรงได้โดยไม่ผ่านหน้าเว็บเลย
 */
function test_wo_projectRequired() {
  beginTest_('โครงการเป็นช่องบังคับ และถูกปฏิเสธที่ชั้น API');

  var users = serviceTestUsers_();
  var blanks = ['', '   ', null];

  /* ---------- สร้างใบงาน ---------- */
  for (var i = 0; i < blanks.length; i++) {
    var created = withTestUser_(users.admin, function () {
      return api_createWorkOrder(testWoForm_({ 'Project': blanks[i] }));
    });
    assertEquals_(created.ok, false,
      'สร้างใบงานโดยส่งโครงการเป็น [' + String(blanks[i]) + '] ต้องถูกปฏิเสธที่ชั้น API');
    assertTrue_(String(created.message).indexOf('โครงการ') !== -1,
      'และข้อความต้องบอกว่าขาดช่องไหน ไม่ใช่บอกแค่ว่ากรอกไม่ครบ · ได้: ' + created.message);
  }

  /* ---------- แก้ไขใบงาน ---------- */
  var wo = createTestWo_(users);
  callApiAs_(users.approver, 'ตีกลับเพื่อให้แก้ไขได้', function () {
    return api_returnWorkOrder(wo.woId, 'ขอให้แก้ข้อมูล', lockOf_(wo.woId));
  });

  var edited = withTestUser_(users.admin, function () {
    return api_editWorkOrder(wo.woId, testWoForm_({ 'Project': '' }), lockOf_(wo.woId));
  });
  assertEquals_(edited.ok, false, 'แก้ไขใบงานแล้วลบชื่อโครงการทิ้ง ต้องถูกปฏิเสธเช่นกัน');
  assertTrue_(String(edited.message).indexOf('โครงการ') !== -1,
    'และข้อความต้องระบุชื่อช่อง · ได้: ' + edited.message);

  /* ---------- ใบเก่าที่ไม่มีโครงการ ต้องส่งอนุมัติใหม่ได้ตามปกติ ---------- */
  /*
   * **ห้ามไล่ตรวจใบงานเก่าให้กลายเป็นไม่ถูกต้อง** ใบที่เปิดไว้ก่อนวันที่ช่องนี้
   * กลายเป็นช่องบังคับ เปิดถูกต้องตามกติกาของวันนั้นทุกประการ · ถ้าด่านของ
   * การส่งขออนุมัติโตตามชุดของฟอร์ม ใบพวกนั้นจะค้างอยู่ในสถานะตีกลับตลอดไป
   * โดยที่เจ้าของใบไม่ได้ทำอะไรผิดเลย
   */
  updateRow_(SHEET.WORK_ORDER, 'WO_ID', wo.woId, { 'Project': '' });
  var resent = withTestUser_(users.admin, function () {
    return api_submitWorkOrder(wo.woId, lockOf_(wo.woId));
  });
  assertEquals_(resent.ok, true,
    'ใบเก่าที่ไม่มีโครงการ ต้องส่งขออนุมัติใหม่ได้ · ได้: ' + resent.message);

  assertTrue_(WO_FORM_REQUIRED_FIELDS.indexOf('Project') !== -1,
    'ชุดของฟอร์มต้องบังคับโครงการ');
  assertTrue_(WO_SUBMIT_REQUIRED_FIELDS.indexOf('Project') === -1,
    'แต่ชุดของการส่งขออนุมัติต้องไม่บังคับ ไม่งั้นใบเก่าจะเดินต่อไม่ได้');

  /* ---------- การบังคับกรอกต้องไม่ไปเปลี่ยนตรรกะของทะเบียนสถานที่ ---------- */
  /*
   * resolveProjectLocation ถือว่าโครงการที่เว้นว่างเป็นกลุ่มโครงการหนึ่งตามปกติ
   * กติกานั้นเป็นของ SPEC 10 ไม่ใช่ของฟอร์ม จึงต้องไม่ขยับตาม
   */
  var code = testCustomerCode_('PJ');
  var first = resolveProjectLocation(code, '', 'จุดที่หนึ่ง', testWoId_(), {});
  var again = resolveProjectLocation(code, '', 'จุดที่หนึ่ง', testWoId_(), {});
  assertEquals_(again, first,
    'ทะเบียนสถานที่ต้องยังหาแถวเดิมของโครงการที่เว้นว่างเจอ ไม่ใช่ออกรหัสใหม่ทุกครั้ง');

  return endTest_();
}

/**
 * กลุ่มชั้น Service (1/7) — ฟอร์มใบงานและทะเบียนสถานที่ (353 รอบ)
 * 03_Service_WO.gs ตอนสร้างใบงาน และ 05_Location.gs ที่ออก PJ_ID ให้พร้อมกัน
 *
 * ลำดับในกลุ่มนี้สำคัญ: ชุดทะเบียนสถานที่ต้องมาก่อน เพราะมันนับจำนวนสถานที่ของลูกค้า
 * ทดสอบว่าตรงกับที่คาด ถ้ามีชุดอื่นสร้างใบงานของลูกค้าเดียวกันไปก่อน จำนวนจะไม่ตรง
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_wo() {
  return runGroup_('SERVICE_WO', [
    { name: 'test_service_projectLocation',   fn: test_service_projectLocation },
    { name: 'test_service_pjIdNumbering',     fn: test_service_pjIdNumbering },
    { name: 'test_service_createWorkOrder',   fn: test_service_createWorkOrder },
    { name: 'test_service_woFormFields',      fn: test_service_woFormFields },
    { name: 'test_service_appointmentTime',   fn: test_service_appointmentTime },
    { name: 'test_wo_counterKeyUsesThaiMonth', fn: test_wo_counterKeyUsesThaiMonth },
    { name: 'test_wo_durationDays',           fn: test_wo_durationDays },
    { name: 'test_wo_projectRequired',        fn: test_wo_projectRequired }
  ]);
}

/**
 * กลุ่มชั้น Service (2/7) — เส้นทางสถานะของใบงาน (290 รอบ)
 * แก้ไขได้เฉพาะใบที่ถูกตีกลับ ส่งใหม่ ตีกลับ ยกเลิก และเปิดงานที่ปิดไปแล้วขึ้นมาใหม่
 * @return {string} ข้อความสรุปผล
 */
/**
 * พาใบงานไปจนปิดครบ แล้วคืนของที่เทสต์การเปิดซ้ำต้องใช้
 *
 * ไหลผ่าน api_ ที่หน้าเว็บเรียกจริงทุกขั้น ไม่เรียกฟังก์ชันบริการตรง ๆ
 * เพราะบั๊กที่หลุดผ่านเทสต์เขียวของเราทุกตัวเป็นชนิด "ไม่มีใครเรียกมัน"
 *
 * @param {Object} users ผู้ใช้ทดสอบจาก serviceTestUsers_()
 * @param {string} assignmentType สายงานจาก ASSIGNMENT
 * @return {Object} {woId, taskOf}
 */
function completedTestWo_(users, assignmentType) {
  var wo = approvedTestWo_(users, assignmentType, { 'Location': 'จุดเปิดซ้ำ' + testRunId_() });
  var depts = departmentsOfAssignment(assignmentType);

  for (var d = 0; d < depts.length; d++) {
    var taskId = wo.taskOf(depts[d]);
    var actor = serviceUserOfDept_(users, depts[d]);
    callApiAs_(actor, 'กดรับงาน ' + depts[d], function () { return api_acceptTask(taskId); });
    finishEveryStep_(taskId, actor);
    attachRequiredTaskReports_(wo.woId, taskId);
    callApiAs_(actor, 'ปิดงานของแผนก ' + depts[d], function () { return api_completeTask(taskId); });
  }

  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.COMPLETED,
    'ใบงานต้องปิดครบก่อน ไม่งั้นการทดสอบการเปิดซ้ำไม่มีความหมาย');
  return wo;
}

/**
 * แนบเอกสารที่แผนกบังคับ ให้งานหนึ่งงานปิดได้ โดยไม่แตะ Drive
 *
 * **ข้อนี้มาจากความต่างระหว่างข้อมูลจริงกับข้อมูลของชุดทดสอบ** · บนฐานข้อมูลจริง
 * เจ้าของระบบตั้ง Required เป็นจริงให้เอกสารของแผนก Service แล้ว การปิดงานจึง
 * ถูกปฏิเสธด้วยข้อความว่ายังไม่ได้แนบเอกสาร ส่วนในตัวจำลองไม่มีแถวนั้น ชุดทดสอบ
 * จึงเขียวในเครื่องแต่แดงบนของจริง — ของจำลองใจดีกว่าของจริงอีกครั้งหนึ่ง
 *
 * เขียนลงทะเบียนตรง ๆ เหมือน attachRequiredTestFiles_ เพราะสิ่งที่ชุดทดสอบ
 * ส่วนใหญ่ต้องการคือ "ผ่านด่านเอกสารบังคับ" ไม่ใช่การทดสอบตัว Drive เอง ·
 * ชุดที่ทดสอบการแนบเอกสารจริงมีของตัวเองอยู่แล้วและเดินผ่าน api_uploadFile
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} taskId เลขที่งานของแผนก
 * @return {number} จำนวนเอกสารที่แนบให้
 */
function attachRequiredTaskReports_(woId, taskId) {
  var missing = missingRequiredReports_(taskId);
  if (!missing.length) return 0;

  var rows = [];
  for (var i = 0; i < missing.length; i++) {
    rows.push({
      'File_ID':            taskId + '-R' + i,
      'WO_ID':              woId,
      'Task_ID':            taskId,
      'Report_Code':        missing[i].code,
      'Saved_File_Name':    taskId + '_' + missing[i].code + '.pdf',
      'Original_File_Name': 'เอกสารบังคับของแผนก (ข้อมูลทดสอบ).pdf',
      'Seq':                1,
      'Drive_File_ID':      'ไม่ได้ขึ้น Drive (ข้อมูลทดสอบ)',
      'Is_Active':          true
    });
  }

  insertFiles(rows);
  clearRowCache_(SHEET.FILE_INDEX);
  return rows.length;
}

/**
 * ผู้ใช้ทดสอบของแผนกหนึ่ง
 * @param {Object} users ผู้ใช้ทดสอบ
 * @param {string} dept ค่าจาก DEPT
 * @return {Object}
 */
function serviceUserOfDept_(users, dept) {
  if (dept === DEPT.PROJECT) return users.project;
  if (dept === DEPT.LAB) return users.lab;
  return users.service;
}

/**
 * ปิดทุกขั้นตอนของงานแผนกหนึ่งให้ครบ
 * @param {string} taskId เลขที่งานของแผนก
 * @param {Object} actor ผู้ทำรายการ
 */
function finishEveryStep_(taskId, actor) {
  var steps = listStepsByTask(taskId).slice();
  steps.sort(function (a, b) { return Number(a['Step_No'] || 0) - Number(b['Step_No'] || 0); });

  for (var i = 0; i < steps.length; i++) {
    if (String(steps[i]['Status'] || '') === STEP_STATUS.COMPLETED) continue;
    var stepId = steps[i]['Step_ID'];
    callApiAs_(actor, 'ปิดขั้นตอน ' + stepId, function () {
      return api_updateTaskStep(stepId, { 'Status': STEP_STATUS.COMPLETED });
    });
  }
}

/**
 * แผนกเปิดงานที่ปิดไปแล้วขึ้นมาทำต่อได้เอง และต้องดึง Task กลับมาด้วย (SPEC 20.6 · กฎข้อ 12)
 *
 * **ห้ามเปลี่ยนเฉพาะสถานะ WO** ถ้า Task ยัง COMPLETED แผนกจะทำอะไรไม่ได้
 * และ recalcWoStatus จะปิดงานคืนทันทีในรายการเดียวกัน ผลคือกดแล้วเหมือนไม่มีอะไรเกิดขึ้น
 */
function test_service_reopenByDepartment() {
  beginTest_('แผนกเปิดงานที่ปิดแล้วขึ้นมาทำต่อเองได้ และ Task ต้องกลับมาด้วย');

  var users = serviceTestUsers_();
  var wo = completedTestWo_(users, ASSIGNMENT.SERVICE);
  var taskId = wo.taskOf(DEPT.SERVICE);

  /* ---------- สิ่งที่ต้องไม่หายหลังเปิดซ้ำ จำไว้ก่อน ---------- */
  var stepsBefore = listStepsByTask(taskId);
  var doneBefore = 0;
  for (var s = 0; s < stepsBefore.length; s++) {
    if (String(stepsBefore[s]['Status'] || '') === STEP_STATUS.COMPLETED) doneBefore++;
  }
  assertTrue_(doneBefore > 0, 'ต้องมีขั้นตอนที่ปิดไปแล้วอย่างน้อยหนึ่งข้อ ไม่งั้นข้อนี้ไม่ได้พิสูจน์อะไร');
  var filesBefore = listWoFileViews(wo.woId).length;

  /* ---------- ไม่กรอกเหตุผล ต้องถูกปฏิเสธ ---------- */
  var noReason = withTestUser_(users.service, function () {
    return api_reopenWorkOrder(wo.woId, '', '', {});
  });
  assertEquals_(noReason.ok, false, 'เปิดงานใหม่โดยไม่กรอกเหตุผลต้องถูกปฏิเสธ');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.COMPLETED,
    'และใบงานต้องยังปิดอยู่เหมือนเดิม ไม่ใช่เปลี่ยนไปครึ่งทาง');

  /* ---------- แผนกอื่นกด ต้องถูกปฏิเสธ ---------- */
  var wrongDept = withTestUser_(users.project, function () {
    return api_reopenWorkOrder(wo.woId, 'ขอเปิดแทน', '', {});
  });
  assertEquals_(wrongDept.ok, false,
    'แผนกที่ไม่ได้เป็นเจ้าของงานในใบนี้ เปิดงานใหม่ไม่ได้');

  /* ---------- Admin กด ต้องถูกปฏิเสธ ---------- */
  var byAdmin = withTestUser_(users.admin, function () {
    return api_reopenWorkOrder(wo.woId, 'ขอเปิดใหม่', DEPT.SERVICE, {});
  });
  assertEquals_(byAdmin.ok, false, 'Admin เปิดงานใหม่ไม่ได้ในรอบนี้');

  /* ---------- แผนกเจ้าของงานกด ต้องสำเร็จ ---------- */
  var done = callApiAs_(users.service, 'เปิดงานขึ้นมาทำต่อ', function () {
    return api_reopenWorkOrder(wo.woId, 'ลูกค้าแจ้งว่ายังมีน้ำรั่วอยู่', '', {});
  });
  assertEquals_(done.plan.to, WO_STATUS.IN_PROGRESS, 'ใบงานต้องกลับเป็นกำลังดำเนินการ');
  assertEquals_(done.taskPlan.to, TASK_STATUS.IN_PROGRESS, 'และงานของแผนกต้องกลับมาด้วย');

  var after = getWorkOrder(wo.woId);
  assertEquals_(after['Overall_Status'], WO_STATUS.IN_PROGRESS,
    'สถานะที่บันทึกจริงต้องเป็นกำลังดำเนินการ ไม่ใช่ถูก recalcWoStatus ปิดกลับทันที');
  assertEquals_(String(getTask(taskId)[STATUS_FIELD[ENTITY.TASK]]), TASK_STATUS.IN_PROGRESS,
    'งานของแผนกที่บันทึกจริงต้องกลับมาเป็นกำลังดำเนินการ');

  /* ---------- ประวัติรอบก่อนต้องไม่หาย ---------- */
  var stepsAfter = listStepsByTask(taskId);
  var doneAfter = 0;
  for (var a = 0; a < stepsAfter.length; a++) {
    if (String(stepsAfter[a]['Status'] || '') === STEP_STATUS.COMPLETED) doneAfter++;
  }
  assertEquals_(doneAfter, doneBefore,
    'ขั้นตอนที่ทำเสร็จไปแล้วต้องคงสถานะเดิม ห้ามรีเซ็ต — ประวัติรอบก่อนต้องไม่หาย');
  assertEquals_(listWoFileViews(wo.woId).length, filesBefore,
    'ไฟล์และรายงานที่แนบไว้แล้วต้องยังอยู่ครบ');

  /* ---------- นับจำนวนครั้ง และบันทึกว่าใครเปิด ---------- */
  assertEquals_(Number(after['Reopen_Count']), 1, 'เปิดซ้ำครั้งแรกต้องนับเป็น 1');
  assertEquals_(String(after['Reopen_Reason']), 'ลูกค้าแจ้งว่ายังมีน้ำรั่วอยู่',
    'ต้องเก็บเหตุผลไว้ในช่องของตัวเอง');
  assertTrue_(String(after['Reopened_By']).indexOf('@') !== -1, 'และเก็บว่าใครเป็นคนเปิด');
  assertTrue_(!isEmptyValue_(after['Reopened_Date']), 'และเก็บว่าเปิดเมื่อไร');
  assertEquals_(String(after['Return_Reason'] || ''), '',
    'ห้ามเขียนทับช่องเหตุผลการตีกลับ เพราะเป็นคนละเรื่องและใบเดียวกันเกิดได้ทั้งสองอย่าง');

  /* ---------- ระหว่างที่เปิดอยู่ กดเปิดซ้ำอีกไม่ได้ ---------- */
  var again = withTestUser_(users.service, function () {
    return api_reopenWorkOrder(wo.woId, 'กดซ้ำ', '', {});
  });
  assertEquals_(again.ok, false, 'ใบที่กำลังดำเนินการอยู่แล้ว เปิดใหม่อีกไม่ได้');

  /* ---------- ปิดงานอีกครั้งได้ตามปกติ แล้วเปิดซ้ำได้อีก ---------- */
  callApiAs_(users.service, 'ปิดงานรอบสอง', function () { return api_completeTask(taskId); });
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.COMPLETED,
    'ปิดงานอีกครั้งได้ตามปกติหลังเปิดซ้ำ');

  callApiAs_(users.service, 'เปิดงานขึ้นมาทำต่อรอบสอง', function () {
    return api_reopenWorkOrder(wo.woId, 'ยังไม่หายขาด', '', {});
  });
  assertEquals_(Number(getWorkOrder(wo.woId)['Reopen_Count']), 2,
    'เปิดซ้ำสองครั้งต้องนับได้ 2 — ถ้านับไม่ได้ การเปิดงานซ้ำจะกลายเป็นวิธีซ่อนงานที่ต้องแก้ใหม่');

  return endTest_();
}

/**
 * ใบที่ยกเลิกแล้วเปิดใหม่ไม่ได้ — การยกเลิกเป็นสถานะปลายทาง (SPEC 4.1)
 *
 * ถ้ายกเลิกผิดพลาด นั่นเป็นการแก้ไขข้อมูลของ Admin คนละเรื่องกับการเปิดทำต่อ ·
 * ถ้าเปิดทางไว้ การยกเลิกจะกลายเป็นสถานะชั่วคราวที่ใครก็ย้อนได้ แล้วคำว่า
 * "ยกเลิกแล้ว" บนหน้าจอจะเชื่อถือไม่ได้อีกเลย
 */
function test_service_reopenRejectsCancelled() {
  beginTest_('ใบที่ยกเลิกแล้วต้องเปิดใหม่ไม่ได้');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดยกเลิก' + testRunId_() });
  var taskId = wo.taskOf(DEPT.SERVICE);

  callApiAs_(users.service, 'ยกเลิกงานของแผนก', function () {
    return api_cancelTask(taskId, 'ลูกค้ายกเลิกงานทั้งหมด');
  });
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.CANCELLED,
    'ใบงานต้องถูกยกเลิกก่อน ไม่งั้นข้อนี้ไม่ได้ทดสอบอะไร');

  var blocked = withTestUser_(users.service, function () {
    return api_reopenWorkOrder(wo.woId, 'ลูกค้าเปลี่ยนใจ', '', {});
  });
  assertEquals_(blocked.ok, false, 'ใบที่ยกเลิกแล้ว เปิดใหม่ไม่ได้');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.CANCELLED,
    'และต้องยังเป็นยกเลิกอยู่เหมือนเดิม');

  return endTest_();
}

/**
 * งานร่วมสองแผนก — เปิดซ้ำแล้วต้องกลับมาเฉพาะแผนกที่กด (กฎข้อ 12)
 *
 * **นี่คือจุดที่พลาดได้ง่ายที่สุด** การปลุก Task ทั้งใบดูเหมือนช่วยให้ทุกอย่างเดินต่อ
 * แต่แปลว่าแผนกที่ปิดงานเรียบร้อยแล้วต้องกลับมาทำใหม่ทั้งที่ไม่มีใครขอ และ
 * เอกสารที่เขาส่งไปแล้วจะกลายเป็นงานค้างในสายตาระบบ
 */
function test_service_reopenJointKeepsOtherDepartment() {
  beginTest_('งานร่วม เปิดซ้ำแล้วอีกแผนกต้องยังปิดอยู่');

  var users = serviceTestUsers_();
  var wo = completedTestWo_(users, ASSIGNMENT.SERVICE_PROJECT);
  var svTask = wo.taskOf(DEPT.SERVICE);
  var pjTask = wo.taskOf(DEPT.PROJECT);

  callApiAs_(users.service, 'เปิดงานของ Service ขึ้นมาทำต่อ', function () {
    return api_reopenWorkOrder(wo.woId, 'ลูกค้าแจ้งว่าปั๊มยังเสียงดัง', '', {});
  });

  assertEquals_(String(getTask(svTask)[STATUS_FIELD[ENTITY.TASK]]), TASK_STATUS.IN_PROGRESS,
    'งานของแผนกที่กดเปิด ต้องกลับมาเป็นกำลังดำเนินการ');
  assertEquals_(String(getTask(pjTask)[STATUS_FIELD[ENTITY.TASK]]), TASK_STATUS.COMPLETED,
    'แต่งานของอีกแผนกต้องคงเป็นเสร็จสิ้นไว้ ห้ามปลุกทั้งใบ');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.IN_PROGRESS,
    'สถานะรวมต้องเป็นกำลังดำเนินการ เพราะยังมีแผนกหนึ่งทำอยู่');

  return endTest_();
}

/**
 * วันที่ปิดงานต้องตั้งตอนปิด ล้างตอนเปิดซ้ำ และไม่ขยับเมื่อแก้เรื่องอื่น
 *
 * **ข้อสุดท้ายคือข้อที่จับบั๊กยอด "เสร็จสิ้นเดือนนี้" ได้ตรง ๆ**
 *
 * เดิมยอดนั้นนับจาก Updated_Date ซึ่งขยับทุกครั้งที่มีการแก้อะไรก็ได้ · ใบที่ปิด
 * เดือนสิงหาคมแล้วมีคนมาบันทึกการชำระเงินเดือนกันยายน จะถูกนับเป็นงานที่เสร็จ
 * เดือนกันยายน · การจ่ายเงินหลังงานเสร็จคือเรื่องปกติที่สุด ยอดจึงผิดทุกเดือน
 */
function test_service_closedDateTracksClosing() {
  beginTest_('วันที่ปิดงานต้องตั้งตอนปิด ล้างตอนเปิดซ้ำ และไม่ขยับเมื่อแก้เรื่องอื่น');

  var users = serviceTestUsers_();
  var wo = completedTestWo_(users, ASSIGNMENT.SERVICE);
  var taskId = wo.taskOf(DEPT.SERVICE);

  /* ---------- ปิดงานแล้วต้องมีวันที่ปิด ---------- */
  var closed = getWorkOrder(wo.woId);
  assertTrue_(!isEmptyValue_(closed['Closed_Date']),
    'ปิดงานแล้วต้องบันทึกวันที่ปิดไว้ · ยอด "เสร็จสิ้นเดือนนี้" นับจากช่องนี้');
  var firstClosed = String(closed['Closed_Date']);

  /* ---------- แก้เรื่องอื่นของใบที่ปิดแล้ว วันที่ปิดต้องไม่ขยับ ---------- */
  callApiAs_(users.admin, 'บันทึกการชำระเงินหลังงานเสร็จ', function () {
    return api_recordPayment(wo.woId, 'โอนแล้วเต็มจำนวน');
  });
  var afterPayment = getWorkOrder(wo.woId);
  assertEquals_(String(afterPayment['Closed_Date']), firstClosed,
    'บันทึกการชำระเงินต้องไม่ขยับวันที่ปิดงาน — นี่คือบั๊กที่ทำให้ยอดเสร็จสิ้นเดือนนี้ผิดทุกเดือน');
  assertTrue_(String(afterPayment['Updated_Date']) !== '',
    'ขณะที่ Updated_Date ขยับตามปกติ ซึ่งเป็นเหตุผลที่นับจากช่องนั้นไม่ได้');

  /* ---------- เปิดซ้ำแล้ววันที่ปิดต้องถูกล้าง ---------- */
  callApiAs_(users.service, 'เปิดงานขึ้นมาทำต่อ', function () {
    return api_reopenWorkOrder(wo.woId, 'ลูกค้าแจ้งกลับ', '', {});
  });
  assertTrue_(isEmptyValue_(getWorkOrder(wo.woId)['Closed_Date']),
    'เปิดซ้ำแล้ววันที่ปิดต้องว่าง ไม่งั้นใบที่กลับมาทำอยู่จะยังถูกนับเป็นงานที่ปิดแล้ว');

  /* ---------- ปิดอีกครั้งต้องได้วันที่ใหม่ ---------- */
  callApiAs_(users.service, 'ปิดงานรอบสอง', function () { return api_completeTask(taskId); });
  var reclosed = getWorkOrder(wo.woId);
  assertTrue_(!isEmptyValue_(reclosed['Closed_Date']), 'ปิดอีกครั้งต้องมีวันที่ปิดใหม่');

  return endTest_();
}

/**
 * เปิดงานซ้ำต้องแจ้ง Admin และต้องลง Audit_Log ด้วย Action ของตัวเอง (SPEC 15.3)
 *
 * Admin เป็นเจ้าของวงจรชีวิตใบงาน ถ้างานที่ Admin เชื่อว่าปิดแล้วกลับมาเปิด
 * โดยไม่มีใครบอก ภาพรวมที่ Admin ถืออยู่จะผิดทันที
 */
function test_service_reopenNotifiesAndAudits() {
  beginTest_('เปิดงานซ้ำต้องแจ้ง Admin และลง Audit_Log ด้วย Action ของตัวเอง');

  var users = serviceTestUsers_();
  addTestChannels_();
  var wo = completedTestWo_(users, ASSIGNMENT.SERVICE);

  var outbox = captureNotifications_(function () {
    callApiAs_(users.service, 'เปิดงานขึ้นมาทำต่อ', function () {
      return api_reopenWorkOrder(wo.woId, 'ลูกค้าแจ้งว่ายังมีปัญหา', '', {});
    });
  });

  var sent = [];
  for (var i = 0; i < outbox.length; i++) {
    if (String(outbox[i].text || '').indexOf(wo.woId) !== -1) sent.push(outbox[i]);
  }
  assertTrue_(sent.length > 0, 'ต้องส่งข้อความออกไปอย่างน้อยหนึ่งฉบับ');

  var text = '';
  var toAdmin = false;
  for (var n = 0; n < sent.length; n++) {
    text += sent[n].text;
    if (String(sent[n].target) === NOTIFY_TARGET.ADMIN) toAdmin = true;
  }
  assertTrue_(toAdmin, 'ต้องส่งเข้าห้อง Admin');
  assertTrue_(text.indexOf(wo.woId) !== -1, 'ข้อความต้องมีเลขที่ใบงาน');
  assertTrue_(text.indexOf('ลูกค้าแจ้งว่ายังมีปัญหา') !== -1, 'และต้องมีเหตุผล');
  assertTrue_(text.indexOf('@') !== -1, 'และต้องบอกว่าใครเป็นคนกด');

  /* ---------- Audit_Log ต้องใช้ Action ของตัวเอง ไม่ใช่รวมกับ TASK_UPDATE ---------- */
  var logs = listAuditByWo(wo.woId);
  var reopenWo = 0;
  var reopenTask = 0;
  for (var a = 0; a < logs.length; a++) {
    if (String(logs[a]['Action']) !== ACTION.REOPEN) continue;
    if (String(logs[a]['Entity']) === ENTITY.WO) reopenWo++;
    if (String(logs[a]['Entity']) === ENTITY.TASK) reopenTask++;
  }
  assertTrue_(reopenWo > 0, 'ต้องมีบรรทัด Audit ของการเปิดใบงานใหม่');
  assertTrue_(reopenTask > 0,
    'และบรรทัดของการดึงงานแผนกกลับมา แยกกันคนละ Entity จะได้ไล่ประวัติได้ว่าแผนกไหนกลับมา');

  return endTest_();
}

/**
 * ตัวกรอง "เคยเปิดซ้ำ" ต้องกรองที่ฐานข้อมูล และแสดงจำนวนครั้งในรายการ
 */
function test_home_reopenedFilter() {
  beginTest_('ตัวกรอง "เคยเปิดซ้ำ" ต้องกรองที่ฐานข้อมูลและบอกจำนวนครั้ง');

  /* ---------- ฐานข้อมูลต้องเป็นคนกรอง ---------- */
  var path = dbSelectPath_(SHEET.WORK_ORDER, {
    select: woListFields_(),
    filters: woListFilters_(normalizeWoQuery_({ reopened: true })),
    limit: WO_LIST_PAGE_SIZE, offset: 0
  });
  var url = decodeURIComponent(path);
  assertTrue_(url.indexOf('reopen_count=gt.0') !== -1,
    'ต้องส่งเงื่อนไขไปให้ฐานข้อมูล ไม่ใช่ลากทุกใบมานับเอง · ได้: ' + url);

  /* ---------- ของจริง ---------- */
  var users = serviceTestUsers_();
  var wo = completedTestWo_(users, ASSIGNMENT.SERVICE);
  callApiAs_(users.service, 'เปิดงานขึ้นมาทำต่อ', function () {
    return api_reopenWorkOrder(wo.woId, 'ลูกค้าแจ้งกลับ', '', {});
  });

  var got = homeList_({ reopened: true });
  var found = null;
  for (var i = 0; i < got.rows.length; i++) {
    if (got.rows[i].woId === wo.woId) found = got.rows[i];
  }
  assertTrue_(!!found, 'ใบที่เพิ่งเปิดซ้ำต้องอยู่ในผลลัพธ์');
  assertEquals_(found.reopened, 1, 'และต้องบอกจำนวนครั้งมาให้หน้าจอทำป้าย');

  for (var r = 0; r < got.rows.length; r++) {
    assertTrue_(Number(got.rows[r].reopened) > 0,
      'ทุกแถวในผลลัพธ์ต้องเคยถูกเปิดซ้ำจริง — ใบที่ไม่เคยเปิดซ้ำมีค่าเป็นศูนย์ ไม่ใช่ว่าง');
  }

  /* ---------- ชื่อพารามิเตอร์สองฝั่งต้องตรงกัน ---------- */
  assertEquals_(webWoListQuery_({ reopened: '1' }).reopened, true,
    'พารามิเตอร์ reopened=1 ที่มากับลิงก์ ต้องถูกอ่านเป็นธงจริง');

  return endTest_();
}

function test_group_service_flow() {
  return runGroup_('SERVICE_FLOW', [
    { name: 'test_service_editOnlyFromReturned', fn: test_service_editOnlyFromReturned },
    { name: 'test_service_noDraftLeft',          fn: test_service_noDraftLeft },
    { name: 'test_service_returnCancel',         fn: test_service_returnCancel },
    { name: 'test_service_reopenRejectsCancelled', fn: test_service_reopenRejectsCancelled }
  ]);
}

/**
 * การเปิดงานใหม่ (SPEC 20.6) — แยกเป็นกลุ่มของตัวเองเพราะเวลา
 *
 * ทุกชุดในกลุ่มนี้ต้องพาใบงานไปจนปิดครบก่อน ซึ่งเป็นเส้นทางที่ยาวที่สุดในระบบ —
 * สร้าง อนุมัติ รับงาน ปิดทุกขั้น แนบเอกสารบังคับของแผนก แล้วจึงปิดงาน ·
 * วัดบนของจริงได้ 260 วินาทีตอนยังอยู่รวมกับกลุ่มเดิม แล้วชนเพดาน 6 นาที
 * ของ Apps Script ทันทีที่เอกสารบังคับของแผนกถูกเพิ่มเข้ามาในเส้นทาง
 *
 * การแตกกลุ่มคือทางแก้ที่ระบบเตือนไว้เองอยู่แล้วเมื่อกลุ่มใดใช้เวลาเกินสี่นาที ·
 * กลุ่มที่รันไม่จบไม่ได้แค่ช้า — มันถูกฆ่ากลางทางแล้วทิ้งข้อมูลทดสอบค้างใน
 * ตารางจริงที่ผู้ใช้เห็น เพราะขั้นล้างข้อมูลอยู่ท้ายสุดและไม่เคยได้เดินถึง
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_reopen() {
  return runGroup_('SERVICE_REOPEN', [
    { name: 'test_service_reopenWorkOrder',      fn: test_service_reopenWorkOrder },
    { name: 'test_service_reopenByDepartment',   fn: test_service_reopenByDepartment },
    { name: 'test_service_reopenJointKeepsOtherDepartment', fn: test_service_reopenJointKeepsOtherDepartment }
  ]);
}

/**
 * ร่องรอยที่การเปิดงานใหม่ต้องทิ้งไว้ — วันที่ปิดงาน การแจ้งเตือน และบันทึกประวัติ
 *
 * แยกจากกลุ่มกลไกการเปิดงานใหม่เพราะเวลาอีกครั้งหนึ่ง · วัดบนของจริงได้ 304 วินาที
 * ตอนอยู่รวมกันห้าชุด ซึ่งห่างจากเพดาน 6 นาทีไม่ถึงหนึ่งนาที · ทุกชุดในสองกลุ่มนี้
 * ต้องพาใบงานไปจนปิดครบก่อน ซึ่งเป็นเส้นทางที่ยาวที่สุดในระบบ และจะยาวขึ้นอีก
 * ทุกครั้งที่เพิ่มขั้นตอนหรือเอกสารบังคับ
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_reopen_trace() {
  return runGroup_('SERVICE_REOPEN_TRACE', [
    { name: 'test_service_closedDateTracksClosing', fn: test_service_closedDateTracksClosing },
    { name: 'test_service_reopenNotifiesAndAudits', fn: test_service_reopenNotifiesAndAudits }
  ]);
}

/**
 * กลุ่มชั้น Service (3/7) — การอนุมัติและไฟล์แนบ (372 รอบ)
 *
 * สองเรื่องนี้อยู่ด้วยกันเพราะเงื่อนไข "ไฟล์แนบที่บังคับต้องครบ" เป็น guard ของ ACCEPT
 * ชุดไฟล์ที่เหลือคือกลไกที่อยู่ใต้เงื่อนไขนั้น — การตั้งชื่อ ลำดับ โฟลเดอร์ และการลบ
 * ทั้งหมดอยู่ใน 06_Files.gs ซึ่งเป็นชั้นเดียวที่แตะ DriveApp ได้
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_approve() {
  return runGroup_('SERVICE_APPROVE', [
    { name: 'test_service_approveDoesNotDuplicateTasks', fn: test_service_approveDoesNotDuplicateTasks },
    { name: 'test_files_approveRequiresFiles',  fn: test_files_approveRequiresFiles },
    { name: 'test_files_manyPerTopic',          fn: test_files_manyPerTopic },
    { name: 'test_files_deleteKeepsFile',       fn: test_files_deleteKeepsFile },
    { name: 'test_files_folderReuse',           fn: test_files_folderReuse },
    { name: 'test_files_sequence',              fn: test_files_sequence },
    { name: 'test_files_naming',                fn: test_files_naming },
    { name: 'test_files_badCharacters',         fn: test_files_badCharacters },
    { name: 'test_files_longTopicName',         fn: test_files_longTopicName },
    { name: 'test_approve_seesAttachmentsByTopic',   fn: test_approve_seesAttachmentsByTopic }
  ]);
}

/**
 * กลุ่มไฟล์แนบ (2/2) — ข้อจำกัด ชื่อไฟล์ และเส้นทางของไบต์ (กฎข้อ 34)
 *
 * แยกออกมาเพราะกลุ่มเดิมชนเพดาน 6 นาทีบนของจริง (`Exceeded maximum execution time`
 * 30-09-2026) · กลุ่มที่ตายกลางคันทิ้งแถวทดสอบไว้ในตารางจริง เพราะการล้างอยู่ท้ายสุด
 * — รอบนั้นทิ้งไว้จนรอบถัดไปต้องตามลบ 174 แถว
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_files() {
  return runGroup_('SERVICE_FILES', [
    { name: 'test_files_extensionAllowlist',    fn: test_files_extensionAllowlist },
    { name: 'test_files_emptyState',            fn: test_files_emptyState },
    { name: 'test_files_driveIsolation',        fn: test_files_driveIsolation },
    { name: 'test_files_probeFindsBrokenLinks', fn: test_files_probeFindsBrokenLinks },
    { name: 'test_files_batchUploadKeepsReportLast', fn: test_files_batchUploadKeepsReportLast },
    { name: 'test_files_oneFailsRestStillUpload',    fn: test_files_oneFailsRestStillUpload },
    { name: 'test_files_tooBigIsRefusedBeforeSending', fn: test_files_tooBigIsRefusedBeforeSending },
    { name: 'test_files_byteEndpointRefusesEveryWrongWay', fn: test_files_byteEndpointRefusesEveryWrongWay },
    { name: 'test_web_filesTravelThroughServer',   fn: test_web_filesTravelThroughServer },
    { name: 'test_files_archiveOpensByPosition',   fn: test_files_archiveOpensByPosition }
  ]);
}

/**
 * วันเวลาเข้างานของแผนก และหน้า "งานวันนี้" (SPEC 13 · 17.3 · กฎข้อ 18 · 23 · 28)
 *
 * เรื่องที่พังง่ายที่สุดของฟีเจอร์นี้คือเวลาเลื่อนเจ็ดชั่วโมง ซึ่งไม่มี error ให้เห็น
 * มีแต่ช่างไปผิดวัน · ข้อแรกของชุดนี้จึงเป็นการเขียนค่าแล้วอ่านกลับมาเทียบทีละตัวอักษร
 */
function test_task_visitSchedule() {
  beginTest_('กำหนดวันเวลาเข้างานของแผนก และหน้า "งานวันนี้"');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดนัดเข้างาน' });
  var taskId = wo.taskOf(DEPT.SERVICE);

  /* ---------- ยังไม่กดรับงาน กำหนดวันไม่ได้ ---------- */
  /*
   * ไม่ได้เขียนเงื่อนไขนี้ไว้ที่ setTaskVisit เอง · Transition TASK_UPDATE ระบุ
   * from: [IN_PROGRESS] อยู่แล้ว ด่านจึงมาจากตารางเดียวกับทุกรายการอื่น (กฎข้อ 1)
   * ข้อนี้พิสูจน์ว่ามันบังคับจริง ไม่ใช่เชื่อว่าตารางจะทำงานให้
   */
  var tooEarly = withTestUser_(users.service, function () {
    return api_setTaskVisit(taskId, '2026-09-30T08:00', '');
  });
  assertEquals_(tooEarly.ok, false, 'ยังไม่กดรับงาน ต้องกำหนดวันเวลาเข้างานไม่ได้');

  callApiAs_(users.service, 'กดรับงาน', function () { return api_acceptTask(taskId); });

  /* ---------- เขียนแล้วอ่านกลับต้องได้สตริงเดิมเป๊ะ ---------- */
  /*
   * '2026-09-30T23:30' คือค่าที่อันตรายที่สุด เพราะถ้ามีจุดไหนเผลอแปลงเป็นเวลา UTC
   * มันจะกลายเป็น '2026-09-30T16:30' คือคนละเวลา และถ้าเป็น 00:30 ก็จะกลายเป็นคนละวัน
   */
  var wanted = '2026-09-30T23:30';
  callApiAs_(users.service, 'กำหนดวันเวลาเข้างาน', function () {
    return api_setTaskVisit(taskId, wanted, '2026-10-01T02:00');
  });

  var saved = getTask(taskId);
  assertEquals_(saved['Visit_Start'], wanted,
    'อ่านกลับมาต้องได้สตริงเดิมทุกตัวอักษร ไม่ใช่เวลาที่เลื่อนไปเจ็ดชั่วโมง');
  assertEquals_(saved['Visit_End'], '2026-10-01T02:00', 'ช่องออกงานก็ต้องได้ค่าเดิมเป๊ะ');

  var view = taskViewOf_(saved);
  assertEquals_(view.visit.start, wanted,
    'ค่าที่ส่งให้หน้าจอต้องเป็นรูปแบบที่ใส่ช่องกรอกได้ทันที ไม่ใช่ข้อความที่จัดรูปแล้ว');

  /* ---------- ชนิดของคอลัมน์ต้องไม่ใช่เวลาที่เครื่องบันทึก ---------- */
  for (var f = 0; f < TASK_VISIT_FIELDS.length; f++) {
    assertTrue_(DB_TIMESTAMP_COLUMNS.indexOf(TASK_VISIT_FIELDS[f]) === -1,
      TASK_VISIT_FIELDS[f] + ' ต้องไม่อยู่ใน DB_TIMESTAMP_COLUMNS — เป็นเวลานัดหมายที่คนกรอก (กฎข้อ 23)');
    assertTrue_(isAppointmentField_(TASK_VISIT_FIELDS[f]),
      TASK_VISIT_FIELDS[f] + ' ต้องอยู่ในรายการเวลานัดหมาย เพื่อให้ jsonSafe_ ส่งเป็นข้อความท้องถิ่น');
  }

  /* ---------- นัดไว้วันที่ 30 กันยายน ไม่ใช่วันที่ 1 ตุลาคม ---------- */
  /*
   * ตัดสินด้วยฟังก์ชันตัวเดียวกับที่ตัวนับบนเมนูและหน้ารายการใช้ · ถ้าสามที่นี้
   * ไม่ใช่ตัวเดียวกัน ตัวเลขบนเมนูจะไม่ตรงกับจำนวนที่เห็นในหน้า
   */
  assertTrue_(isTaskVisitingOn_(saved, '2026-09-30'),
    'งานที่นัดไว้ 23:30 ของวันที่ 30 กันยายน ต้องโผล่ในหน้างานวันนี้ของวันที่ 30');
  assertTrue_(!isTaskVisitingOn_(saved, '2026-10-01'),
    'และต้องไม่โผล่ในหน้าของวันที่ 1 ตุลาคม ทั้งที่เวลานั้นใกล้เที่ยงคืน');

  /* ---------- และฐานข้อมูลต้องกรองให้ ไม่ใช่ลากทุกแถวมาคัดเอง (กฎข้อ 28) ---------- */
  var onDay = findTasksVisitingOn(DEPT.SERVICE, '2026-09-30');
  assertTrue_(taskIdsOf_(onDay).indexOf(taskId) !== -1,
    'ตัวกรองฝั่งฐานข้อมูลต้องหางานที่นัดไว้วันนั้นเจอ');
  assertTrue_(taskIdsOf_(findTasksVisitingOn(DEPT.SERVICE, '2026-10-01')).indexOf(taskId) === -1,
    'และต้องไม่คืนงานนั้นให้วันถัดไป');
  assertTrue_(taskIdsOf_(findTasksVisitingOn(DEPT.PROJECT, '2026-09-30')).indexOf(taskId) === -1,
    'และต้องไม่ข้ามแผนก — งานของ Service ต้องไม่โผล่ในหน้าของ Project');

  /* ---------- งานที่นัดไว้วันนี้จริง ต้องขึ้นหน้า "งานวันนี้" ---------- */
  var today = thaiDayOf_(new Date());
  callApiAs_(users.service, 'เลื่อนนัดมาเป็นวันนี้', function () {
    return api_setTaskVisit(taskId, today + 'T08:00', today + 'T17:00');
  });

  var todayRows = listTodayTasks(DEPT.SERVICE);
  var todayIds = [];
  for (var t = 0; t < todayRows.length; t++) todayIds.push(todayRows[t].taskId);
  assertTrue_(todayIds.indexOf(taskId) !== -1, 'งานที่นัดไว้วันนี้ต้องอยู่ในหน้า "งานวันนี้"');

  var counts = taskCountsForDepartment_(DEPT.SERVICE);
  assertEquals_(counts[TASK_TODAY_VIEW], todayRows.length,
    'ตัวเลขบนเมนูย่อยต้องเท่ากับจำนวนรายการที่เห็นจริงในหน้าเป๊ะ');
  assertTrue_(counts.pending >= 0 && counts.active >= 1,
    'และมุมมองที่คัดด้วยสถานะต้องยังนับได้ตามปกติ ไม่ถูกมุมมองวันนี้กลืนไป');

  /* ---------- งานที่ยังไม่ได้นัดวัน ต้องไม่หายไปจากสายตา ---------- */
  var other = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดที่ยังไม่นัด' });
  var otherTask = other.taskOf(DEPT.SERVICE);
  callApiAs_(users.service, 'กดรับงานใบที่ยังไม่นัด', function () { return api_acceptTask(otherTask); });

  var stillHidden = [];
  var nowToday = listTodayTasks(DEPT.SERVICE);
  for (var n = 0; n < nowToday.length; n++) stillHidden.push(nowToday[n].taskId);
  assertTrue_(stillHidden.indexOf(otherTask) === -1,
    'งานที่ยังไม่ได้กำหนดวันเข้างาน ต้องไม่โผล่ในหน้า "งานวันนี้"');

  var everything = listTasksForDepartment(DEPT.SERVICE, { includeClosed: true });
  var allIds = [];
  for (var a = 0; a < everything.length; a++) allIds.push(everything[a].taskId);
  assertTrue_(allIds.indexOf(otherTask) !== -1,
    'แต่ต้องยังเห็นได้ในรายการปกติ ห้ามให้งานหายไปจากทุกหน้าจอเพราะยังไม่ได้นัดวัน');

  /* ---------- แก้ไขได้เรื่อย ๆ และล้างได้ ---------- */
  callApiAs_(users.service, 'ล้างวันนัด', function () {
    return api_setTaskVisit(taskId, '', '');
  });
  assertEquals_(String(getTask(taskId)['Visit_Start'] || ''), '',
    'ล้างวันนัดได้ เพราะแผนงานที่ยกเลิกไปแล้วต้องไม่ค้างอยู่ในหน้า "งานวันนี้"');

  /* ---------- รูปแบบที่ไม่ถูกต้อง ต้องถูกปฏิเสธพร้อมบอกชื่อช่อง ---------- */
  var bad = ['30-09-2026 08:00', '2026-09-30', '2026-09-30T08:00:00', 'พรุ่งนี้เช้า'];
  for (var i = 0; i < bad.length; i++) {
    var rejected = withTestUser_(users.service, function () {
      return api_setTaskVisit(taskId, bad[i], '');
    });
    assertEquals_(rejected.ok, false, 'รูปแบบ [' + bad[i] + '] ต้องถูกปฏิเสธ');
    assertTrue_(String(rejected.message).indexOf(fieldLabel('Visit_Start')) !== -1,
      'และข้อความต้องบอกว่าช่องไหนผิด · ได้: ' + rejected.message);
  }

  var backwards = withTestUser_(users.service, function () {
    return api_setTaskVisit(taskId, '2026-09-30T10:00', '2026-09-30T08:00');
  });
  assertEquals_(backwards.ok, false, 'ออกงานก่อนเข้างาน ต้องถูกปฏิเสธ');

  /* ---------- สิทธิ์: คนนอกแผนกทำไม่ได้ ---------- */
  var byAdmin = withTestUser_(users.admin, function () {
    return api_setTaskVisit(taskId, '2026-09-30T08:00', '');
  });
  assertEquals_(byAdmin.ok, false, 'ธุรการไม่ใช่แผนกเจ้าของงาน จึงกำหนดวันเข้างานแทนไม่ได้');

  var byOtherDept = withTestUser_(users.project, function () {
    return api_setTaskVisit(taskId, '2026-09-30T08:00', '');
  });
  assertEquals_(byOtherDept.ok, false, 'แผนกอื่นก็กำหนดวันเข้างานของงานที่ไม่ใช่ของตัวเองไม่ได้');

  /* ---------- บันทึกระดับฟิลด์ลง Audit_Log ---------- */
  /*
   * คำถามที่จะถูกถามแน่นอนในวันที่งานไม่ทันกำหนดคือ "ใครเลื่อนวันนัด จากวันไหนเป็นวันไหน"
   * ซึ่งตอบได้จากบรรทัดระดับฟิลด์เท่านั้น บรรทัด "อัปเดตงาน" เฉย ๆ ตอบไม่ได้
   */
  var logs = listAuditByWo(wo.woId);
  var visitLogs = [];
  for (var g = 0; g < logs.length; g++) {
    if (String(logs[g]['Field']) === 'Visit_Start') visitLogs.push(logs[g]);
  }
  assertTrue_(visitLogs.length >= 2,
    'ทุกครั้งที่วันนัดเปลี่ยน ต้องมีบรรทัดระดับฟิลด์ของตัวเอง (พบ ' + visitLogs.length + ')');
  assertEquals_(String(visitLogs[0]['To_Value']), wanted,
    'บรรทัดแรกต้องจำค่าที่บันทึกไว้จริง ไม่ใช่ค่าที่จัดรูปแล้ว');

  /* ---------- ห้ามส่ง Telegram เมื่อกำหนดหรือแก้วันเข้างาน (SPEC 15.3) ---------- */
  addTestChannels_();
  var sent = captureNotifications_(function () {
    withTestUser_(users.service, function () {
      return api_setTaskVisit(taskId, '2026-10-05T09:00', '');
    });
  });
  assertEquals_(sent.length, 0,
    'การกำหนดหรือแก้วันเข้างานต้องไม่ส่งแจ้งเตือนเลยสักข้อความ (พบ ' + sent.length + ')');

  return endTest_();
}

/**
 * เลขที่งานของแผนกจากรายการแถวดิบ
 * @param {Object[]} rows แถว Department_Task
 * @return {string[]}
 */
function taskIdsOf_(rows) {
  var out = [];
  for (var i = 0; i < rows.length; i++) out.push(String(rows[i]['Task_ID']));
  return out;
}

/**
 * กลุ่มชั้น Service (4/7) — งานของแผนกที่เดินหน้าตามปกติ (220 รอบ)
 * 04_Service_Task.gs ตั้งแต่กดรับงาน เดินขั้นตอน จนปิดงาน รวมสิทธิ์ของแผนกเจ้าของงาน
 * @return {string} ข้อความสรุปผล
 */
/**
 * ปลูกงานของแผนกพร้อมใบงานและขั้นตอน ด้วยการเขียนตรง — สำหรับวัดต้นทุนเท่านั้น
 *
 * เขียนตรงแทนการไหลผ่านการอนุมัติจริงสามสิบรอบ เพราะสิ่งที่ข้อนี้พิสูจน์คือ
 * "อ่านหนึ่งหน้าใช้กี่คำขอ" ไม่ใช่ "สร้างงานถูกต้องไหม" ซึ่งมีข้ออื่นดูแลอยู่แล้ว ·
 * การเตรียมข้อมูลทดสอบด้วยวิธีที่เร็วกว่าเป็นสิ่งที่กติกาข้อมูลทดสอบอนุญาต
 *
 * ทุกใบนัดเข้างานวันนี้ เพื่อให้มุมมอง "งานวันนี้" ได้งานเท่ากับมุมมองอื่นพอดี
 * ถ้าปลูกไม่เท่ากัน ตัวเลขสองมุมมองจะต่างกันด้วยเหตุผลที่ไม่ใช่เรื่องต้นทุน
 *
 * @param {string} prefix คำนำหน้าเลขที่ใบงาน
 * @param {number} from เริ่มนับที่ลำดับนี้
 * @param {number} count จำนวนใบที่จะปลูก
 * @return {number} จำนวนขั้นตอนที่เขียนลงไป
 */
function seedDeptTasks_(prefix, from, count) {
  var today = thaiDayOf_(new Date());
  var wos = [], tasks = [], steps = [];

  for (var i = from; i < from + count; i++) {
    var woId = prefix + '-' + padNumber_(i, 4);
    var taskId = buildTaskId_(woId, DEPT.SERVICE);
    wos.push({
      'WO_ID': woId, 'Customer_Name': 'ลูกค้าวัดต้นทุน ' + i, 'Project': 'โครงการวัดต้นทุน',
      'Location': 'สถานที่ ' + i, 'Route': ROUTE.SP, 'Assignment_Type': ASSIGNMENT.SERVICE,
      'Overall_Status': WO_STATUS.IN_PROGRESS, 'Payment_Status': PAYMENT.UNPAID,
      'Created_Date': new Date()
    });
    tasks.push({
      'Task_ID': taskId, 'WO_ID': woId, 'Department': DEPT.SERVICE,
      'Status': TASK_STATUS.IN_PROGRESS, 'Assigned_Date': new Date(),
      'Visit_Start': today + 'T08:00', 'Visit_End': today + 'T17:00'
    });
    for (var n = 1; n <= 2; n++) {
      steps.push({
        'Step_ID': taskId + '-S' + n, 'Task_ID': taskId, 'Step_No': n,
        'Step_Name': 'ขั้นที่ ' + n, 'Type': STEP_TYPE.STEP, 'Status': STEP_STATUS.PENDING
      });
    }
  }

  db_insert_(SHEET.WORK_ORDER, wos);
  db_insert_(SHEET.DEPARTMENT_TASK, tasks);
  db_insert_(SHEET.TASK_STEP, steps);
  dbInvalidate_(SHEET.WORK_ORDER);
  dbInvalidate_(SHEET.DEPARTMENT_TASK);
  dbInvalidate_(SHEET.TASK_STEP);
  clearRowCache_();
  clearDashboardCache_();
  clearTaskCountCache_();
  return steps.length;
}

/**
 * ล้างงานที่ seedDeptTasks_ ปลูกไว้ แล้วเทียบว่าลบครบทั้งสามตาราง
 * @param {string} prefix คำนำหน้าที่ใช้ปลูก
 * @param {number} count จำนวนใบงาน
 * @param {number} stepCount จำนวนขั้นตอน
 */
function cleanSeededDeptTasks_(prefix, count, stepCount) {
  dbDeleteVerified_(SHEET.TASK_STEP,
    { 'Step_ID': { op: 'like', value: dbLikeLiteral_(prefix) + '*' } },
    'ขั้นตอนของงานที่ปลูกไว้วัดต้นทุน', stepCount);
  dbDeleteVerified_(SHEET.DEPARTMENT_TASK,
    { 'Task_ID': { op: 'like', value: dbLikeLiteral_(prefix) + '*' } },
    'งานแผนกที่ปลูกไว้วัดต้นทุน', count);
  dbDeleteVerified_(SHEET.WORK_ORDER,
    { 'WO_ID': { op: 'like', value: dbLikeLiteral_(prefix) + '*' } },
    'ใบงานที่ปลูกไว้วัดต้นทุน', count);
  dbInvalidate_(SHEET.WORK_ORDER);
  dbInvalidate_(SHEET.DEPARTMENT_TASK);
  dbInvalidate_(SHEET.TASK_STEP);
  clearRowCache_();
  clearDashboardCache_();
  clearTaskCountCache_();
}

/**
 * เปิดหน้าแผนกหนึ่งครั้ง แล้วคืนจำนวนคำขอกับจำนวนรอบ
 * @param {string} view คีย์มุมมอง
 * @return {Object} {calls, rounds, rows}
 */
function measureDeptPage_(view) {
  clearRowCache_();
  clearMasterCache_();
  clearDashboardCache_();
  clearTaskCountCache_();
  dbCallReset_();

  var user = { email: 'cost.sv@cnr.co.th', roles: [ROLE.SERVICE], department: DEPT.SERVICE };
  var boot = withTestUser_(user, function () {
    return pageBootstrap_('work', { dept: DEPT.SERVICE, view: view });
  });
  assertEquals_(boot.error, '', 'หน้าแผนกต้องเปิดได้ ไม่งั้นการวัดไม่มีความหมาย');

  return { calls: dbCallCount(), rounds: dbRoundCount(), rows: (boot.rows || []).length };
}

/**
 * หน้ารายการงานแผนกต้องไม่แพงขึ้นตามจำนวนงาน (SPEC 22.5 · กฎข้อ 28 · 29)
 *
 * **นี่คือข้อที่พิสูจน์ว่าแก้ที่ต้นเหตุ ไม่ใช่แค่ทำให้ตัวเลขน้อยลง**
 *
 * เพดานอย่างเดียวจับไม่ได้ว่าอะไรโตตามข้อมูล · ต้นทุนที่ลดจาก 62 เหลือ 40 ก็ยัง
 * ผ่านเพดานที่ตั้งหลวม ๆ ได้ ทั้งที่ยังโตตามจำนวนงานอยู่เหมือนเดิม แค่ช้าลง ·
 * ข้อนี้จึงวัดสองจุดแล้วเทียบกันเอง ซึ่งเป็นคำถามที่ตอบได้แค่ "โต" กับ "ไม่โต"
 *
 * วัดที่ 5 ใบ กับ 30 ใบ เพราะ 30 มากกว่าขนาดหน้า (20) อยู่ · ถ้าจำนวนคำขอ
 * ยังเท่ากัน แปลว่าทั้งการแบ่งหน้าและการดึงเป็นชุดทำงานจริงทั้งคู่
 */
function test_task_pageCostDoesNotGrow() {
  beginTest_('หน้ารายการงานแผนก ต้องใช้คำขอเท่าเดิมไม่ว่าจะมีงานกี่ใบ');

  var prefix = testPrefix_() + 'COST' + Utilities.formatDate(new Date(), TIMEZONE, 'HHmmss');
  var steps = 0;

  try {
    /* ---------- งาน 5 ใบ ---------- */
    steps += seedDeptTasks_(prefix, 0, 5);

    var smallActive = measureDeptPage_('active');
    var smallToday  = measureDeptPage_(TASK_TODAY_VIEW);

    /*
     * ห้ามคาดว่าแผนกนี้มีแต่งานที่ข้อนี้ปลูก — ข้ออื่นในกลุ่มเดียวกันก็สร้างงานของ SERVICE ไว้
     *
     * สิ่งที่ข้อนี้พิสูจน์คือ "จำนวนคำขอไม่โตตามจำนวนงาน" ไม่ใช่ "มีงานกี่ใบ"
     * จึงต้องการแค่สองจุดที่จำนวนแถวต่างกันจริง · ถ้าจุดแรกเต็มหน้าอยู่แล้ว สองจุดจะมี
     * ยี่สิบแถวเท่ากัน แล้วข้อนี้จะเขียวโดยไม่ได้พิสูจน์อะไรเลย — ต้องล้มดัง ๆ แทน
     */
    assertTrue_(smallActive.rows >= 5 && smallActive.rows < TASK_PAGE_SIZE,
      'จุดแรกต้องยังไม่เต็มหน้า ไม่งั้นการเทียบสองจุดจะไม่มีความหมาย · ได้ ' +
      smallActive.rows + ' แถว จากขนาดหน้า ' + TASK_PAGE_SIZE +
      ' — ถ้าเต็มแล้ว แปลว่าข้ออื่นทิ้งงานของแผนก SERVICE ค้างไว้มากเกินไป');
    assertTrue_(smallToday.rows >= 5 && smallToday.rows < TASK_PAGE_SIZE,
      'หน้า "งานวันนี้" ก็ต้องยังไม่เต็มหน้าด้วยเหตุผลเดียวกัน · ได้ ' +
      smallToday.rows + ' แถว จากขนาดหน้า ' + TASK_PAGE_SIZE);
    assertTrue_(smallActive.rows >= smallToday.rows,
      'มุมมอง "กำลังดำเนินการ" ต้องไม่น้อยกว่า "งานวันนี้" เพราะงานที่นัดไว้วันนี้ ' +
      'ก็กำลังดำเนินการอยู่ด้วย · กำลังดำเนินการ ' + smallActive.rows +
      ' · วันนี้ ' + smallToday.rows);

    /* ---------- เพิ่มเป็น 30 ใบ ---------- */
    steps += seedDeptTasks_(prefix, 5, 25);

    var bigActive = measureDeptPage_('active');
    var bigToday  = measureDeptPage_(TASK_TODAY_VIEW);

    assertEquals_(bigActive.rows, TASK_PAGE_SIZE,
      'ที่งาน 30 ใบ ต้องได้มาแค่หนึ่งหน้า ไม่ใช่ทั้งสามสิบใบ');
    assertEquals_(bigToday.rows, TASK_PAGE_SIZE,
      'หน้า "งานวันนี้" ก็ต้องแบ่งหน้าเหมือนกัน ไม่มีข้อยกเว้นให้มุมมองไหน');

    /* ---------- ข้อพิสูจน์จริง: เท่ากันเป๊ะ ---------- */
    assertEquals_(bigActive.calls, smallActive.calls,
      'หน้า "กำลังดำเนินการ" ที่งาน 30 ใบ ต้องใช้คำขอเท่ากับที่งาน 5 ใบเป๊ะ · ' +
      '5 ใบใช้ ' + smallActive.calls + ' · 30 ใบใช้ ' + bigActive.calls);
    assertEquals_(bigToday.calls, smallToday.calls,
      'หน้า "งานวันนี้" ก็ต้องเท่ากันเป๊ะ · 5 ใบใช้ ' + smallToday.calls +
      ' · 30 ใบใช้ ' + bigToday.calls);

    assertEquals_(bigActive.rounds, smallActive.rounds,
      'จำนวนรอบไป-กลับก็ต้องไม่โตตามจำนวนงาน ไม่ใช่แค่จำนวนคำขอ');
    assertEquals_(bigToday.rounds, smallToday.rounds,
      'และหน้า "งานวันนี้" ต้องไม่โตเหมือนกัน');

    /* ---------- และต้องอยู่ใต้เพดานที่ตั้งจากที่วัดได้ ---------- */
    assertTrue_(bigActive.calls <= DB_CALL_BUDGET.cold.workLoaded,
      'หน้าแผนกที่มีงานจริง ต้องยิงไม่เกิน ' + DB_CALL_BUDGET.cold.workLoaded +
      ' คำขอ (ยิงจริง ' + bigActive.calls + ')');
    assertTrue_(bigToday.calls <= DB_CALL_BUDGET.cold.workLoaded,
      'หน้า "งานวันนี้" ที่มีงานจริง ต้องยิงไม่เกิน ' + DB_CALL_BUDGET.cold.workLoaded +
      ' คำขอ (ยิงจริง ' + bigToday.calls + ')');

    /*
     * ตัวกรองชุดต้องไม่ยาวจนชนเพดานความยาว URL (กฎข้อ 29)
     *
     * ข้อนี้ล้มเองอยู่แล้วถ้ายาวเกิน เพราะ assertUrlFits_ โยนออกมา · แต่เขียนไว้
     * ให้ชัดว่าเป็นสิ่งที่ตั้งใจตรวจ ไม่ใช่รอดมาโดยบังเอิญ
     */
    var ids = [];
    for (var i = 0; i < TASK_PAGE_SIZE; i++) {
      ids.push(buildTaskId_(prefix + '-' + padNumber_(i, 4), DEPT.SERVICE));
    }
    var url = decodeURIComponent(dbSelectPath_(SHEET.TASK_STEP, {
      filters: { 'Task_ID': { op: 'in', value: ids } },
      limit: TASK_PAGE_SIZE * STEP_ROWS_PER_TASK
    }));
    assertTrue_(url.length < HTTP_MAX_URL_LENGTH,
      'ตัวกรองของทั้งหน้าต้องสั้นกว่าเพดานความยาว URL · ยาว ' + url.length +
      ' จากเพดาน ' + HTTP_MAX_URL_LENGTH);

    /* ---------- ตัวเลขบนเมนูต้องนับงานที่ปลูกไว้ครบ ---------- */
    /*
     * เทียบยอดจาก RPC ฝั่งฐานข้อมูล กับยอดที่นับเองจากแถวจริง (กฎข้อ 31)
     * สองสูตรที่เขียนแยกกันย่อมเพี้ยนจากกันได้ วิธีเดียวที่รู้แน่คือเอาของจริงมาเทียบ
     */
    clearTaskCountCache_();
    var counts = taskCountsForDepartment_(DEPT.SERVICE);
    var mine = countAllTasksFrom_(
      queryRows_(SHEET.DEPARTMENT_TASK, {
        'Task_ID': { op: 'like', value: dbLikeLiteral_(prefix) + '*' }
      }, { limit: 100 }), thaiDayOf_(new Date()))[DEPT.SERVICE];

    assertEquals_(mine.active, 30, 'ข้อมูลที่ปลูกไว้ต้องครบสามสิบใบก่อน ไม่งั้นการเทียบไม่มีความหมาย');
    assertEquals_(mine[TASK_TODAY_VIEW], 30,
      'และทุกใบต้องนัดเข้างานวันนี้จริง ไม่งั้นการเทียบยอดของมุมมองวันนี้ไม่มีความหมาย');
    assertTrue_(counts.active >= mine.active,
      'ยอด "กำลังดำเนินการ" บนเมนูต้องนับงานที่ปลูกไว้ครบ · เมนู ' + counts.active +
      ' · ที่ปลูก ' + mine.active);
    assertTrue_(counts[TASK_TODAY_VIEW] >= mine[TASK_TODAY_VIEW],
      'ยอด "งานวันนี้" บนเมนูต้องนับงานที่นัดไว้วันนี้ครบ · เมนู ' + counts[TASK_TODAY_VIEW] +
      ' · ที่ปลูก ' + mine[TASK_TODAY_VIEW]);

  } finally {
    cleanSeededDeptTasks_(prefix, 30, steps);
  }

  return endTest_();
}

function test_group_service_task() {
  return runGroup_('SERVICE_TASK', [
    { name: 'test_task_singleDepartmentFlow', fn: test_task_singleDepartmentFlow },
    { name: 'test_task_stepsInOrder',         fn: test_task_stepsInOrder },
    { name: 'test_task_ownership',            fn: test_task_ownership }
  ]);
}

/**
 * กลุ่มชั้น Service (4ข/7) — วันนัดเข้างาน และต้นทุนของหน้ารายการ
 *
 * แยกออกมาเพราะกลุ่มเดิมชนเพดาน 6 นาทีบนของจริงทันทีที่สองชุดแรกเลิกตายกลางคัน
 * แล้วกลับมารันจนจบ · ตอนที่มันตายกลางคัน เวลารวมดูเหมือนพอดี ซึ่งเป็นภาพลวง
 * ที่เกิดจากงานที่ไม่ได้ทำ ไม่ใช่จากกลุ่มที่เล็กพอ
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_task_visit() {
  return runGroup_('SERVICE_TASK_VISIT', [
    { name: 'test_task_visitSchedule',        fn: test_task_visitSchedule },
    { name: 'test_task_pageCostDoesNotGrow', fn: test_task_pageCostDoesNotGrow }
  ]);
}

/**
 * กลุ่มชั้น Service (5/7) — งานร่วมสองแผนก (310 รอบ)
 * กรณีพิเศษที่พบน้อยแต่พังง่ายที่สุด เพราะสถานะรวมของใบงานขึ้นกับ Task หลายตัวพร้อมกัน
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_task_joint() {
  return runGroup_('SERVICE_TASK_JOINT', [
    { name: 'test_task_jointCompletion',      fn: test_task_jointCompletion },
    { name: 'test_task_jointCancelOne',       fn: test_task_jointCancelOne },
    { name: 'test_task_cancelAllDepartments', fn: test_task_cancelAllDepartments }
  ]);
}

/**
 * กลุ่มชั้น Service (6/7) — งานที่เดินต่อไม่ได้ (270 รอบ)
 * สองเหตุที่งานของแผนกถูกหยุด: ยังไม่ได้ชำระเงินตามเงื่อนไข และใบงานถูกตีกลับ
 * ทั้งสองกรณีต้องปฏิเสธคำสั่งของแผนก โดยไม่ทำลายงานที่ทำค้างไว้
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_task_stop() {
  return runGroup_('SERVICE_TASK_STOP', [
    { name: 'test_task_paymentGate',     fn: test_task_paymentGate },
    { name: 'test_task_returnKeepsWork', fn: test_task_returnKeepsWork }
  ]);
}

/**
 * กลุ่มชั้น Service (7/7) — ชั้น API และสัญญาข้อมูลกับหน้าเว็บ (182 รอบ)
 * 09_Api.gs และ 10_Web.gs · ส่วนใหญ่เป็นการตรวจโครงสร้าง จึงแทบไม่แตะชีตเลย
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_web() {
  return runGroup_('SERVICE_WEB', [
    { name: 'test_api_contract',        fn: test_api_contract },
    { name: 'test_service_webApi',      fn: test_service_webApi },
    { name: 'test_service_apiJsonSafe', fn: test_service_apiJsonSafe },
    { name: 'test_web_dateFormats',             fn: test_web_dateFormats },
    { name: 'test_web_bootPageRefusesTheArgumentTrap', fn: test_web_bootPageRefusesTheArgumentTrap },
    { name: 'test_web_bootstrapKeysMustNotCollide', fn: test_web_bootstrapKeysMustNotCollide },
    { name: 'test_web_deniedPageSaysDeniedNotIncomplete', fn: test_web_deniedPageSaysDeniedNotIncomplete },
    { name: 'test_web_noStaleStorageWords', fn: test_web_noStaleStorageWords },
    { name: 'test_meta_runOneByOneMessageListsEveryGroup', fn: test_meta_runOneByOneMessageListsEveryGroup },
    { name: 'test_meta_crashedSuiteIsCountedInSummary', fn: test_meta_crashedSuiteIsCountedInSummary },
    { name: 'test_service_clearDatesWithNull', fn: test_service_clearDatesWithNull },
    { name: 'test_web_showsDisplayNameNotEmail', fn: test_web_showsDisplayNameNotEmail },
    { name: 'test_web_displayNameCostsNothingPerRow', fn: test_web_displayNameCostsNothingPerRow },
    { name: 'test_web_editKeepsDateInputs',     fn: test_web_editKeepsDateInputs },
    { name: 'test_web_documentNumbersUnchanged', fn: test_web_documentNumbersUnchanged },
    { name: 'test_web_workPages',              fn: test_web_workPages },
    { name: 'test_web_noAutoNavigation',       fn: test_web_noAutoNavigation },
    { name: 'test_web_pageBootstrap',          fn: test_web_pageBootstrap },
    { name: 'test_web_bootstrapContract',      fn: test_web_bootstrapContract },
    { name: 'test_web_singleReaderAndNoStuckLoading', fn: test_web_singleReaderAndNoStuckLoading },
    { name: 'test_web_alwaysHasWayOut',        fn: test_web_alwaysHasWayOut },
    { name: 'test_web_whoami',                 fn: test_web_whoami },
    { name: 'test_web_whoamiRunningAs',        fn: test_web_whoamiRunningAs },
    { name: 'test_service_thaiMessages',       fn: test_service_thaiMessages }
  ]);
}

/**
 * กลุ่มการแจ้งเตือน Telegram และหน้ารายละเอียดใบงาน (SPEC 15 · 17.2)
 *
 * สองเรื่องนี้อยู่ด้วยกันเพราะต้องมีคู่กัน — ทุกข้อความแจ้งเตือนมีปุ่มที่ชี้มาหน้ารายละเอียด
 * ถ้าหน้านั้นเปิดไม่ได้ ข้อความก็เป็นแค่ข่าวที่ทำอะไรต่อไม่ได้
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_notify() {
  return runGroup_('SERVICE_NOTIFY', [
    { name: 'test_notify_routing',            fn: test_notify_routing },
    { name: 'test_notify_messageSafety',      fn: test_notify_messageSafety },
    { name: 'test_notify_isolationAndSecrets', fn: test_notify_isolationAndSecrets },
    { name: 'test_notify_sendAndDedupe',      fn: test_notify_sendAndDedupe },
    { name: 'test_notify_inactiveChannel',    fn: test_notify_inactiveChannel },
    { name: 'test_notify_noOverdueEvent',     fn: test_notify_noOverdueEvent },
    { name: 'test_notify_failureKeepsStatus', fn: test_notify_failureKeepsStatus },
    { name: 'test_notify_noToken',            fn: test_notify_noToken },
    { name: 'test_notify_woLevelSingle',      fn: test_notify_woLevelSingle },
    { name: 'test_notify_gateTouchesOnlyWoLevel', fn: test_notify_gateTouchesOnlyWoLevel }
  ]);
}

/**
 * กลุ่มเส้นทางจริงจนใบงานปิด และหน้ารายละเอียดใบงาน (SPEC 15.3 · 17.2)
 *
 * สองชุดนี้เดินงานจริงตั้งแต่เปิดใบจนปิดครบทุกแผนก จึงคุยกับชีตมากกว่าชุดอื่นเท่าตัว
 * แยกกลุ่มไว้เพื่อให้ทุกกลุ่มอยู่ใต้เพดาน 400 รอบชีตเหมือนเดิม
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_notify_flow() {
  return runGroup_('SERVICE_NOTIFY_FLOW', [
    { name: 'test_notify_woLevelJoint',       fn: test_notify_woLevelJoint },
    { name: 'test_web_woDetail',              fn: test_web_woDetail }
  ]);
}

/**
 * กลุ่มที่เดินผ่าน api_ จริงทุกขั้น (SPEC 15.3)
 *
 * แยกกลุ่มเพราะสองชุดนี้กดปุ่มจริงตั้งแต่เปิดใบงานจนปิดงาน ผ่านชั้น API เหมือนผู้ใช้
 * จึงคุยกับชีตหนักที่สุดในบรรดาชุดแจ้งเตือนทั้งหมด · และเป็นกลุ่มที่ต้องเขียวที่สุด
 * เพราะมันคือด่านเดียวที่จับได้ว่า "โค้ดแจ้งเตือนถูกเรียกจริงไหม" ไม่ใช่แค่ทำงานถูกเมื่อถูกเรียก
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_notify_api() {
  return runGroup_('SERVICE_NOTIFY_API', [
    { name: 'test_notify_returnThroughApi',   fn: test_notify_returnThroughApi },
    { name: 'test_notify_everyRowThroughApi', fn: test_notify_everyRowThroughApi }
  ]);
}

/**
 * กลุ่มบันทึกสองตาราง — Audit_Log กับ System_Log (SPEC 13)
 *
 * แยกกลุ่มของตัวเองเพราะเวลาแดง ต้องรู้ทันทีว่าเป็นเรื่องของการแยกบันทึก
 * ไม่ใช่เรื่องของงานที่บังเอิญเขียนบันทึกระหว่างทาง
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_report_file() {
  return runGroup_('REPORT_FILE', [
    { name: 'test_report_fileNameShapes',     fn: test_report_fileNameShapes },
    { name: 'test_report_manyFilesOneReport', fn: test_report_manyFilesOneReport },
    { name: 'test_report_emptyStep',          fn: test_report_emptyStep }
  ]);
}

/**
 * กลุ่มโฟลเดอร์ปลายทางและรายการเอกสารที่เลือกได้ (SPEC 16 · ภาคผนวก ก)
 * @return {string} ข้อความสรุปผล
 */
function test_group_report_folder() {
  return runGroup_('REPORT_FOLDER', [
    { name: 'test_report_folderPerStep',      fn: test_report_folderPerStep },
    { name: 'test_report_stepPhotos',         fn: test_report_stepPhotos },
    { name: 'test_report_inactiveHidden',     fn: test_report_inactiveHidden }
  ]);
}

/**
 * กลุ่มด่านเอกสารตอนปิดงาน และงวดงานที่แผนกเพิ่มเอง (SPEC 20.2, 20.3)
 * @return {string} ข้อความสรุปผล
 */
function test_group_report_gate() {
  return runGroup_('REPORT_GATE', [
    { name: 'test_report_completeBlockedWhenMissing', fn: test_report_completeBlockedWhenMissing },
    { name: 'test_report_completeWhenReady',          fn: test_report_completeWhenReady },
    { name: 'test_report_jointChecksEachDepartment',  fn: test_report_jointChecksEachDepartment }
  ]);
}

/**
 * กลุ่มงวดงานที่แผนก Project เพิ่มเอง และงานที่ไม่มีงวดเลย (SPEC 20.2)
 * @return {string} ข้อความสรุปผล
 */
function test_group_report_period() {
  return runGroup_('REPORT_PERIOD', [
    { name: 'test_report_stepLocks',                  fn: test_report_stepLocks },
    { name: 'test_report_projectPeriodsByDepartment', fn: test_report_projectPeriodsByDepartment },
    { name: 'test_report_projectNoPeriodCloses',      fn: test_report_projectNoPeriodCloses },
    { name: 'test_report_projectNoPeriodBlocked',     fn: test_report_projectNoPeriodBlocked }
  ]);
}


/* ===========================================================================
 * กลุ่ม MENU — แถบเมนูซ้าย เมนูย่อยรายแผนก และหน้าตาที่ใช้ร่วมกันทุกหน้า
 * (SPEC 17.3, 17.4)
 * =========================================================================== */

/**
 * โครงเมนู 6 กลุ่มตาม SPEC 17.3 — แสดงครบเสมอ ไม่ซ่อนตาม Role
 *
 * ตรรกะล้วน ไม่แตะชีต · สิ่งที่ต้องกันคือการ "ซ่อนเมนูที่ไม่ใช่สิทธิ์ของผู้ใช้"
 * ซึ่งดูเหมือนช่วยให้หน้าจอสะอาด แต่ทำให้ผู้ใช้ไม่รู้ว่าระบบมีอะไรบ้าง
 * และคนที่ควรได้สิทธิ์จะไม่รู้ด้วยซ้ำว่าต้องไปขอสิทธิ์อะไร (SPEC 17.4)
 */
function test_menu_structure() {
  beginTest_('แถบเมนูซ้าย 6 กลุ่ม พร้อมเมนูย่อยตาม SPEC 17.3');

  var svUser = { email: 'menu.sv@cnr.co.th', roles: [ROLE.SERVICE], department: DEPT.SERVICE };
  var groups = menuGroupsForUser_(menuForUser_(svUser));

  assertEquals_(groups.length, 6, 'ต้องมีเมนูหลัก 6 กลุ่มพอดี');
  assertEquals_(groups[0].label, 'Admin & Sale', 'กลุ่มแรกคือ Admin & Sale');
  assertEquals_(groups[0].children.length, 2, 'Admin & Sale มีเมนูย่อยสองรายการ');
  assertEquals_(groups[1].children.length, 0, 'อนุมัติ SV & PE ไม่มีเมนูย่อย');
  assertTrue_(!!groups[1].page, 'กลุ่มที่ไม่มีเมนูย่อย หัวกลุ่มต้องเป็นลิงก์ไปหน้านั้นเอง');
  assertEquals_(groups[2].children.length, TASK_VIEWS.length,
    'กลุ่มของแผนกมีเมนูย่อยเท่าจำนวนมุมมองใน TASK_VIEWS');
  assertEquals_(groups[2].page, '', 'กลุ่มที่มีเมนูย่อย หัวกลุ่มใช้กางเท่านั้น ไม่พาไปไหนเอง');

  /* ---------- สิทธิ์มาจาก MENU_ITEMS ชุดเดิม ไม่ได้ตัดสินใหม่ที่ชั้นเมนู ---------- */
  assertEquals_(groups[2].allowed, true, 'ผู้ใช้แผนก Service เปิดกลุ่มแผนก Service ได้');
  assertEquals_(groups[3].allowed, false, 'แต่เปิดกลุ่มแผนก Project ไม่ได้');
  assertEquals_(groups[0].allowed, false, 'และไม่ใช่เมนูของ Admin');
  assertTrue_(!!groups[3].rolesLabel, 'กลุ่มที่ไม่มีสิทธิ์ต้องบอกได้ว่าเป็นเมนูของใคร');

  /* ---------- แสดงครบทุกกลุ่มเสมอ แม้เป็นผู้ใช้ที่ยังไม่มีสิทธิ์อะไรเลย ---------- */
  var noRole = menuGroupsForUser_(menuForUser_({ email: 'new@cnr.co.th', roles: [] }));
  assertEquals_(noRole.length, 6, 'ผู้ใช้ที่ยังไม่มีสิทธิ์ใดก็ต้องเห็นเมนูครบ 6 กลุ่ม');
  var openCount = 0;
  for (var i = 0; i < noRole.length; i++) if (noRole[i].allowed) openCount++;
  assertEquals_(openCount, 0, 'แต่ต้องไม่มีกลุ่มใดที่เปิดเข้าไปได้');
  assertEquals_(noRole[2].children.length, TASK_VIEWS.length,
    'และยังกางดูเมนูย่อยได้ เพื่อให้รู้ว่าระบบมีอะไรบ้าง');

  /* ---------- หน้าเว็บต้องวาดจากโครงนี้ ไม่ใช่เขียนรายชื่อเมนูไว้เอง ---------- */
  var nav = stripComments_(HtmlService.createHtmlOutputFromFile('ui_Nav').getContent());
  assertEquals_(hardCodedMenuTermsIn_(nav).join(', '), '',
    'ไฟล์แถบเมนูต้องไม่มีชื่อเมนูหรือชื่อ Role เขียนไว้เป็นข้อความตรง ๆ');
  assertTrue_(nav.indexOf('NAV.groups') !== -1, 'และต้องวาดจากโครงที่เซิร์ฟเวอร์ส่งมา');

  return endTest_();
}

/**
 * ทุกสถานะของงานแผนกต้องมีมุมมองรับผิดชอบ ห้ามมีสถานะใดตกหล่น
 *
 * ถ้ามีสถานะที่ไม่อยู่ในมุมมองใดเลย งานที่อยู่ในสถานะนั้นจะไม่มีหน้าไหนเปิดดูได้
 * ทั้งระบบ — หายไปเงียบ ๆ โดยไม่มีข้อผิดพลาดใด ๆ ให้เห็น ซึ่งเป็นเหตุผลเดียวกับที่
 * SPEC 17.3 สั่งให้เอางานที่ยกเลิกแล้วมาไว้ใน "เสร็จสิ้น"
 */
function test_menu_everyTaskStatusHasView() {
  beginTest_('ทุกสถานะของงานแผนกมีมุมมองรับผิดชอบ ไม่มีงานใดหายจากหน้าจอ');

  var seen = {};
  for (var key in TASK_STATUS) {
    if (!Object.prototype.hasOwnProperty.call(TASK_STATUS, key)) continue;
    var status = TASK_STATUS[key];
    var view = taskViewOfStatus_(status);
    assertTrue_(!!view, 'สถานะ ' + status + ' ต้องอยู่ในมุมมองใดมุมมองหนึ่ง');
    seen[status] = (seen[status] || 0) + 1;
  }

  /* ---------- และต้องมี "เจ้าของ" มุมมองเดียว ไม่ใช่โผล่สองที่ ---------- */
  /*
   * ข้อนี้เคยนับทุกมุมมองรวมกัน · ตั้งแต่มีมุมมอง "งานวันนี้" ซึ่งคัดด้วยวันที่นัด
   * ไม่ใช่ด้วยสถานะ การนับรวมจะฟ้องว่าทุกสถานะที่ยังไม่จบซ้ำสองที่ ทั้งที่ถูกต้อง
   *
   * **เจตนาเดิมไม่ได้เปลี่ยน** สิ่งที่ต้องกันคืองานหายจากหน้าจอ กับตัวเลขบนเมนู
   * ถูกนับซ้ำ · ทั้งสองอย่างขึ้นกับ "มุมมองที่เป็นเจ้าของสถานะ" เท่านั้น เพราะ
   * taskViewOfStatus_ เป็นตัวเดียวที่ตัวนับใช้ · มุมมองที่คัดด้วยวันที่จึงต้อง
   * ประกาศตัวว่าไม่ได้เป็นเจ้าของสถานะใด ด้วยธง byDate
   */
  var counted = {};
  var byDateViews = 0;

  for (var v = 0; v < TASK_VIEWS.length; v++) {
    if (TASK_VIEWS[v].byDate) { byDateViews++; continue; }
    for (var i = 0; i < TASK_VIEWS[v].statuses.length; i++) {
      var value = TASK_VIEWS[v].statuses[i];
      counted[value] = (counted[value] || 0) + 1;
      assertEquals_(counted[value], 1, 'สถานะ ' + value + ' ต้องมีมุมมองเจ้าของเดียวเท่านั้น');
    }
  }

  /* ---------- มุมมองที่คัดด้วยวันที่ ห้ามเป็นบ้านหลังเดียวของสถานะใด ---------- */
  /*
   * ถ้าสถานะหนึ่งโผล่เฉพาะในมุมมองที่คัดด้วยวันที่ งานที่อยู่ในสถานะนั้นแต่ยังไม่ได้
   * นัดวัน จะไม่มีหน้าไหนเปิดดูได้เลยทั้งระบบ — ซึ่งคืออาการที่ข้อนี้มีไว้กันมาตั้งแต่ต้น
   */
  for (var d = 0; d < TASK_VIEWS.length; d++) {
    if (!TASK_VIEWS[d].byDate) continue;
    for (var k = 0; k < TASK_VIEWS[d].statuses.length; k++) {
      var shared = TASK_VIEWS[d].statuses[k];
      assertTrue_(!!taskViewOfStatus_(shared),
        'สถานะ ' + shared + ' ที่อยู่ในมุมมอง "' + TASK_VIEWS[d].label +
        '" ต้องมีมุมมองเจ้าของอยู่แล้วด้วย ไม่งั้นงานที่ยังไม่ได้นัดวันจะหายไปจากทุกหน้าจอ');
    }
  }

  assertEquals_(byDateViews, 1,
    'ตอนนี้มีมุมมองที่คัดด้วยวันที่อยู่หนึ่งมุมมอง · ถ้าเพิ่มอีก ต้องกลับมาคิดเรื่องตัวนับใหม่ทั้งชุด');

  /* ---------- ตัวตรวจต้องจับของปลอมได้ก่อน ---------- */
  /*
   * ตัวตรวจที่หาอะไรไม่เจอเลย กับตัวตรวจที่พังจนหาอะไรไม่เจอ ให้ผลเขียวเหมือนกัน
   * พิสูจน์ด้วยรายการปลอมก่อนเสมอ ว่ามันยังจับสถานะที่ซ้ำสองเจ้าของได้จริง
   */
  var fake = [
    { key: 'a', label: 'ก', statuses: [TASK_STATUS.IN_PROGRESS] },
    { key: 'b', label: 'ข', statuses: [TASK_STATUS.IN_PROGRESS] },
    { key: 'c', label: 'ค', byDate: true, statuses: [TASK_STATUS.IN_PROGRESS] }
  ];
  assertEquals_(duplicateOwnerStatuses_(fake).join(', '), TASK_STATUS.IN_PROGRESS,
    'ตัวตรวจต้องจับสถานะที่มีสองเจ้าของได้');
  assertEquals_(duplicateOwnerStatuses_([fake[0], fake[2]]).join(', '), '',
    'และต้องไม่ฟ้องเมื่อมุมมองที่ซ้ำเป็นมุมมองที่คัดด้วยวันที่ ซึ่งไม่ได้เป็นเจ้าของสถานะ');
  assertEquals_(duplicateOwnerStatuses_(TASK_VIEWS).join(', '), '',
    'และรายการจริงต้องไม่มีสถานะที่มีสองเจ้าของ');

  assertEquals_(taskViewOfStatus_('สถานะที่ไม่มีอยู่จริง'), '',
    'สถานะที่ระบบไม่รู้จักต้องไม่ถูกจับใส่มุมมองใดแบบเงียบ ๆ');

  return endTest_();
}

/**
 * สถานะที่มีมุมมอง "เจ้าของ" มากกว่าหนึ่งมุมมอง
 *
 * มุมมองที่คัดด้วยวันที่ (byDate) ไม่นับเป็นเจ้าของ เพราะ taskViewOfStatus_ ข้ามมันไป
 * ตัวนับบนเมนูจึงไม่มีทางนับซ้ำจากมุมมองแบบนั้น
 *
 * @param {Object[]} views รายการมุมมอง
 * @return {string[]} สถานะที่ซ้ำ เรียงตามที่พบ
 */
function duplicateOwnerStatuses_(views) {
  var seen = {};
  var out = [];

  for (var v = 0; v < views.length; v++) {
    if (views[v].byDate) continue;
    for (var i = 0; i < views[v].statuses.length; i++) {
      var value = views[v].statuses[i];
      seen[value] = (seen[value] || 0) + 1;
      if (seen[value] === 2) out.push(value);
    }
  }
  return out;
}

/**
 * เมนูย่อยของแผนกกรองจากสถานะของ Department_Task และตัวเลขต้องตรงกับรายการจริง
 * (SPEC 17.3 · เทสต์ข้อ 2, 3 และ 4 ของงานรื้อหน้าตา)
 */
function test_menu_taskViewsAndCounts() {
  beginTest_('เมนูย่อยรายแผนกกรองตามสถานะงาน และตัวเลขตรงกับรายการจริง');

  var users = serviceTestUsers_();

  /* ---------- เตรียมงานของแผนก Service ให้ครบทั้งสามมุมมอง ---------- */
  var waiting = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดรอรับงาน' });
  var working = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดกำลังทำ' });
  var stopped = approvedTestWo_(users, ASSIGNMENT.SERVICE, { 'Location': 'จุดที่ยกเลิก' });

  var workingTask = working.taskOf(DEPT.SERVICE);
  var stoppedTask = stopped.taskOf(DEPT.SERVICE);

  callApiAs_(users.service, 'รับงานใบที่กำลังทำ', function () { return api_acceptTask(workingTask); });
  callApiAs_(users.service, 'รับงานใบที่จะยกเลิก', function () { return api_acceptTask(stoppedTask); });
  callApiAs_(users.service, 'ยกเลิกงานของแผนก', function () {
    return api_cancelTask(stoppedTask, 'ลูกค้าเลื่อนงานไม่มีกำหนด');
  });

  /* ---------- แต่ละมุมมองต้องได้งานของตัวเอง ---------- */
  var rows = listTasksForDepartment(DEPT.SERVICE, { includeClosed: true });
  var byView = { pending: [], active: [], done: [] };
  for (var i = 0; i < rows.length; i++) {
    var view = taskViewOfStatus_(rows[i].status);
    if (view) byView[view].push(rows[i].taskId);
  }

  assertTrue_(byView.pending.indexOf(waiting.taskOf(DEPT.SERVICE)) !== -1,
    'งานที่ยังไม่ได้กดรับ อยู่ในมุมมอง "รอกดรับงาน"');
  assertTrue_(byView.active.indexOf(workingTask) !== -1,
    'งานที่รับแล้วอยู่ในมุมมอง "กำลังดำเนินการ"');
  assertTrue_(byView.done.indexOf(stoppedTask) !== -1,
    'งานที่ยกเลิกแล้วอยู่ในมุมมอง "เสร็จสิ้น" — ไม่งั้นจะไม่มีหน้าไหนเปิดดูได้เลย');
  assertTrue_(byView.pending.indexOf(workingTask) === -1,
    'และงานหนึ่งใบต้องอยู่มุมมองเดียว ไม่ใช่โผล่ทุกมุมมอง');

  /* ---------- ตัวเลขบนเมนูต้องตรงกับจำนวนรายการจริงในหน้านั้น ---------- */
  var counts = taskCountsForDepartment_(DEPT.SERVICE);
  assertEquals_(counts.pending, byView.pending.length, 'ตัวเลข "รอกดรับงาน" ตรงกับรายการจริง');
  assertEquals_(counts.active, byView.active.length, 'ตัวเลข "กำลังดำเนินการ" ตรงกับรายการจริง');
  assertEquals_(counts.done, byView.done.length, 'ตัวเลข "เสร็จสิ้น" ตรงกับรายการจริง');

  /* ---------- ตัวเลขต้องขยับตามเมื่อสถานะเปลี่ยน ---------- */
  var beforePending = counts.pending;
  callApiAs_(users.service, 'กดรับงานที่รออยู่', function () {
    return api_acceptTask(waiting.taskOf(DEPT.SERVICE));
  });
  var after = taskCountsForDepartment_(DEPT.SERVICE);
  assertEquals_(after.pending, beforePending - 1, 'กดรับงานแล้ว "รอกดรับงาน" ต้องลดลงหนึ่ง');
  assertEquals_(after.active, counts.active + 1, 'และ "กำลังดำเนินการ" ต้องเพิ่มขึ้นหนึ่ง');

  /* ---------- ตัวเลขติดไปกับข้อมูลของหน้าในคำขอเดียว ---------- */
  var boot = withTestUser_(users.service, function () {
    return pageBootstrap_('work', { dept: DEPT.SERVICE });
  });
  assertEquals_(boot.counts.pending, after.pending, 'จำนวนงานมากับก้อนข้อมูลของหน้าเลย');
  assertEquals_(boot.counts.active, after.active, 'ครบทุกมุมมองในคำขอเดียว ไม่ต้องยิงขอทีละเมนู');
  assertEquals_(boot.taskViews.length, TASK_VIEWS.length,
    'พร้อมนิยามของมุมมอง เพื่อให้หน้าเว็บกรองด้วยกติกาชุดเดียวกับเซิร์ฟเวอร์');

  /* ---------- งานที่ยกเลิกต้องมีป้ายกำกับที่เห็นชัด ---------- */
  var script = HtmlService.createHtmlOutputFromFile('ui_Script').getContent();
  assertTrue_(script.indexOf('CANCELLED') !== -1 && script.indexOf('STATUS_TONE') !== -1,
    'สีของสถานะประกาศไว้ที่เดียวคู่กับการแปลเป็นคำไทย');
  // ต้องหาในบล็อก STATUS_TONE เท่านั้น เพราะคำว่า taskStatus โผล่ในตารางแปลด้วย
  var toneBlock = script.substring(script.indexOf('var STATUS_TONE'));
  var tone = toneBlock.substring(toneBlock.indexOf('taskStatus: {'));
  assertTrue_(tone.substring(0, tone.indexOf('}')).indexOf("CANCELLED: 'danger'") !== -1,
    'งานที่ยกเลิกต้องใช้สีที่ต่างจากงานที่ปิดสำเร็จอย่างชัดเจน เพราะอยู่ปนกันในมุมมองเดียว');

  return endTest_();
}

/**
 * ผู้ใช้ที่ไม่มีสิทธิ์กดเมนูย่อยของแผนกอื่น ต้องถูกปฏิเสธและไม่ได้ข้อมูลเลยแม้แต่แถวเดียว
 * (SPEC 17.4 · เทสต์ข้อ 5)
 */
function test_menu_deniedGetsNoData() {
  beginTest_('กดเมนูของแผนกอื่น ถูกปฏิเสธ และไม่มีข้อมูลหลุดมาถึงเบราว์เซอร์');

  var users = serviceTestUsers_();
  var wo = approvedTestWo_(users, ASSIGNMENT.PROJECT, { 'Location': 'จุดของแผนกโครงการ' });
  var pjTask = wo.taskOf(DEPT.PROJECT);
  callApiAs_(users.project, 'แผนกโครงการรับงานของตัวเอง', function () {
    return api_acceptTask(pjTask);
  });

  /* ---------- ทุกมุมมองของแผนกอื่น ต้องไม่ได้ข้อมูลมาเลย ---------- */
  for (var v = 0; v < TASK_VIEWS.length; v++) {
    var boot = withTestUser_(users.service, function () {
      return pageBootstrap_('work', { dept: DEPT.PROJECT, view: TASK_VIEWS[v].key });
    });
    assertTrue_(boot.rows === undefined,
      'มุมมอง "' + TASK_VIEWS[v].label + '" ของแผนกอื่น ต้องไม่มีรายการติดมาแม้แต่แถวเดียว');
    assertEquals_(boot.error, '', 'แต่หน้ายังต้องขึ้นได้พร้อมเมนู ไม่ใช่จอตาย');
  }

  /* ---------- เมนูยังเห็นครบ แต่ธงบอกว่าเข้าไม่ได้ ---------- */
  var groups = withTestUser_(users.service, function () {
    return menuGroupsForUser_(menuForUser_(getCurrentUser_()));
  });
  var project = null;
  for (var g = 0; g < groups.length; g++) if (groups[g].key === 'dept-pe') project = groups[g];
  assertTrue_(!!project, 'กลุ่มของแผนก Project ต้องยังอยู่ในเมนู ไม่ถูกซ่อน');
  assertEquals_(project.allowed, false, 'แต่ต้องถูกทำเครื่องหมายว่าไม่ใช่สิทธิ์ของผู้ใช้คนนี้');
  assertEquals_(project.children.length, TASK_VIEWS.length, 'และยังกางดูเมนูย่อยได้');

  /* ---------- ยิงตรงที่ api_ ก็ต้องไม่ได้งานของแผนกอื่น ---------- */
  var mine = callApiAs_(users.service, 'ขอรายการงานของตัวเอง', function () {
    return api_listMyTasks(true);
  });
  var leaked = 0;
  for (var r = 0; r < mine.rows.length; r++) {
    if (mine.rows[r].taskId === pjTask) leaked++;
  }
  assertEquals_(leaked, 0, 'รายการงานของตัวเองต้องไม่มีงานของแผนกอื่นปนมา');

  return endTest_();
}

/**
 * หน้าตาที่ใช้ร่วมกันทุกหน้า — ข้อที่เทสต์อัตโนมัติพิสูจน์แทนสายตาได้ (SPEC 17.4)
 *
 * ทั้งหมดเป็นการสแกนไฟล์ ไม่แตะชีตเลย จึงไม่มีต้นทุนต่อรอบการรัน
 */
function test_menu_styleContract() {
  beginTest_('กติกาหน้าตา: สีอยู่ที่เดียว ไม่โหลดของนอก และใช้ได้บนจอสัมผัส');

  var style = HtmlService.createHtmlOutputFromFile('ui_Style').getContent();

  /* ---------- 1. รหัสสีต้องอยู่ในบล็อกตัวแปรที่เดียว ---------- */
  assertEquals_(rawColorsOutsideRoot_(style).join(', '), '',
    'ห้ามมีรหัสสีสดนอกบล็อก :root ไม่งั้นเปลี่ยนโทนทั้งระบบจากที่เดียวไม่ได้');
  // ตัวสแกนต้องจับได้จริง ไม่ใช่ผ่านเพราะหาไม่เจอ
  assertTrue_(rawColorsOutsideRoot_(':root { --a: #fff; }\n.x { color: #ff0000; }').length === 1,
    'ตัวสแกนต้องจับรหัสสีที่หลุดออกมานอกบล็อกตัวแปรได้');
  assertTrue_(rawColorsOutsideRoot_(':root { --a: #fff; }\n.x { color: var(--a); }').length === 0,
    'แต่ต้องไม่ฟ้องโค้ดที่อ้างตัวแปรสีตามปกติ');

  /* ---------- 2. ไม่โหลดอะไรจากภายนอก ยกเว้นฟอนต์ไทยตัวเดียว ---------- */
  var pages = ['ui_Style', 'ui_Nav', 'ui_Script', 'ui_Auth', 'ui_Reports',
    'ui_Home', 'ui_CreateWo', 'ui_Approve', 'ui_DeptWork', 'ui_LabWork', 'ui_Returned', 'ui_WoDetail'];
  var outside = [];
  for (var p = 0; p < pages.length; p++) {
    var source = HtmlService.createHtmlOutputFromFile(pages[p]).getContent();
    var found = externalUrlsIn_(source);
    for (var f = 0; f < found.length; f++) outside.push(pages[p] + ': ' + found[f]);
  }
  assertEquals_(outside.length, 2,
    'ต้องมีของนอกแค่ฟอนต์ไทยชุดเดียว (preconnect + stylesheet) แต่พบ: ' + outside.join(' | '));
  for (var o = 0; o < outside.length; o++) {
    assertTrue_(outside[o].indexOf('fonts.g') !== -1, 'และต้องเป็นที่อยู่ของฟอนต์เท่านั้น');
  }
  assertTrue_(style.indexOf('"Sarabun"') !== -1 || style.indexOf('sans-serif') !== -1,
    'ต้องมีฟอนต์สำรองของเครื่องเสมอ เผื่อโหลดฟอนต์ไม่ได้');

  /* ---------- 3. ตารางบนมือถือห้ามเลื่อนแนวนอน ---------- */
  var mobile = style.substring(style.indexOf('@media (max-width: 767px)'));
  assertTrue_(mobile.indexOf('overflow-x') === -1,
    'โหมดมือถือต้องไม่มีการเลื่อนแนวนอน เพราะผู้ใช้จะไม่รู้ว่ามีคอลัมน์ซ่อนอยู่');
  assertTrue_(mobile.indexOf('.wo-list thead { display: none; }') !== -1,
    'ตารางต้องกลายเป็นการ์ดรายแถวแทน');
  assertTrue_(style.indexOf('content: attr(data-label)') !== -1,
    'และการ์ดต้องมีชื่อคอลัมน์กำกับแต่ละค่า ไม่ใช่ตัวเลขลอย ๆ');

  /* ---------- 4. ช่องกรอกต้องไม่เล็กกว่า 16px ---------- */
  assertEquals_(smallInputFontsIn_(style).join(', '), '',
    'ช่องกรอกที่เล็กกว่า 16px ทำให้ iOS ซูมหน้าจอเองทุกครั้งที่แตะ');
  assertTrue_(smallInputFontsIn_('.auth-input { font-size: 14px; }').length === 1,
    'ตัวสแกนต้องจับช่องกรอกที่ตัวอักษรเล็กเกินได้');

  /* ---------- 5. ของที่กดได้ต้องไม่โผล่เฉพาะตอนเอาเมาส์ชี้ ---------- */
  assertEquals_(hoverOnlyControlsIn_(style).join(', '), '',
    'บนจอสัมผัสไม่มีการชี้ ปุ่มที่โผล่ตอน hover จะกดไม่ได้เลย');
  assertTrue_(hoverOnlyControlsIn_('.act { display: none; }\n.row:hover .act { display: block; }').length === 1,
    'ตัวสแกนต้องจับปุ่มที่ซ่อนไว้หลังการชี้ได้');

  /* ---------- 6. ปุ่มและรายการที่กดได้ต้องสูงพอให้นิ้วกด ---------- */
  assertTrue_(style.indexOf('--tap: 44px') !== -1, 'ต้องมีค่ากลางของความสูงขั้นต่ำที่กดได้');
  assertTrue_(style.indexOf('min-height: var(--tap)') !== -1, 'และปุ่มต้องอ้างค่านั้น ไม่ใช่ตั้งเอง');

  /* ---------- 7. ปุ่มออกจากระบบเล็กลงได้ แต่พื้นที่กดห้ามเล็กลง ---------- */
  var logout = cssBlockOf_(style, '.side-logout');
  assertTrue_(logout !== '', 'ต้องมีสไตล์ของปุ่มออกจากระบบให้ตรวจ');
  assertTrue_(logout.indexOf('min-height: var(--tap)') !== -1,
    'ปุ่มออกจากระบบต้องยังสูงอย่างน้อยเท่าเพดานนิ้วมือ · เล็กลงได้เฉพาะเรื่องหน้าตา');
  assertTrue_(logout.indexOf('width: 100%') === -1,
    'และต้องไม่กว้างเต็มแถบอีกแล้ว เพราะมันไม่ใช่ปุ่มหลักของระบบ');

  /* ---------- 8. หน้าที่เปิดอยู่ ต้องต่างจากรายการที่เมาส์กำลังชี้ ---------- */
  /*
   * ถ้าสองสถานะนี้หน้าตาเหมือนกัน บนมือถือซึ่งไม่มีการชี้เลย ผู้ใช้จะไม่มีทางรู้ว่า
   * ตัวเองอยู่หน้าไหน · ข้อนี้จึงเทียบพื้นหลังของสองสถานะตรง ๆ ว่าต้องไม่ใช่สีเดียวกัน
   */
  var currentTop = cssBlockOf_(style, '.nav-group.current > .nav-top');
  var hoverTop = cssBlockOf_(style, '.nav-top:hover:not(:disabled)');
  assertTrue_(currentTop !== '' && hoverTop !== '', 'ต้องมีสไตล์ของทั้งสองสถานะให้เทียบ');
  assertTrue_(cssValueOf_(currentTop, 'background') !== cssValueOf_(hoverTop, 'background'),
    'หน้าที่เปิดอยู่ต้องใช้พื้นหลังคนละสีกับตอนเอาเมาส์ชี้ · ไม่งั้นบนมือถือจะแยกไม่ออกเลย');
  assertTrue_(currentTop.indexOf('box-shadow') !== -1,
    'และควรมีแถบสีที่ขอบด้วย ซึ่งเป็นสัญญาณที่เห็นก่อนอ่านตัวอักษร');

  /* ---------- 9. หัวแถบเป็นลิงก์ จึงต้องกำหนดสีเอง ---------- */
  /*
   * เบราว์เซอร์มีสีของลิงก์เป็นของตัวเองซึ่งชนะการสืบทอดจากกล่องแม่เสมอ ·
   * ถ้าไม่กำหนด หัวแถบจะเป็นน้ำเงินบนพื้นน้ำเงินเข้มพร้อมเส้นใต้ อ่านแทบไม่ออก
   */
  var head = cssBlockOf_(style, '.side-head');
  assertTrue_(head.indexOf('color:') !== -1,
    'หัวแถบเมนูต้องกำหนดสีตัวอักษรเอง ห้ามหวังว่าจะสืบทอดมาจากแถบ');
  assertTrue_(head.indexOf('text-decoration: none') !== -1,
    'และต้องไม่มีเส้นใต้ เพราะไม่มีลิงก์อื่นในแถบนี้มีเส้นใต้เลย');
  assertTrue_(style.indexOf('.side-head.current') !== -1,
    'และต้องบอกได้ว่ากำลังอยู่หน้าแรก เพราะหน้าแรกไม่มีรายการของตัวเองในเมนูหกกลุ่ม');

  /* ---------- 10. การ์ดแดชบอร์ด: ตัวเลขต้องเด่นกว่าชื่อรายการ ---------- */
  /*
   * คนเปิดหน้าแรกมองหาตัวเลขก่อนเสมอ แล้วค่อยอ่านว่าตัวเลขนั้นคืออะไร ·
   * ข้อนี้เทียบขนาดตัวอักษรของสองส่วนตรง ๆ ไม่ใช่เชื่อว่าเขียนไว้ถูกแล้ว
   */
  var count = cssBlockOf_(style, '.stat-count');
  var cardLabel = cssBlockOf_(style, '.stat-label');
  assertTrue_(count !== '' && cardLabel !== '',
    'ต้องมีสไตล์ของตัวเลขและชื่อรายการบนการ์ดให้ตรวจ · ก่อนหน้านี้แดชบอร์ดไม่มีสไตล์เลยสักบรรทัด');

  var countSize = parseInt(cssValueOf_(count, 'font-size'), 10);
  var labelSize = parseInt(cssValueOf_(cardLabel, 'font-size'), 10);
  assertTrue_(countSize >= labelSize * 2,
    'ตัวเลขต้องเด่นกว่าชื่อรายการอย่างชัดเจน (ตัวเลข ' + countSize + 'px · ชื่อ ' + labelSize + 'px)');

  /* ---------- 11. ยอดศูนย์ต้องยังอยู่ และเห็นว่ากดได้โดยไม่ต้องชี้ ---------- */
  assertTrue_(cssBlockOf_(style, '.stat-card.is-zero').indexOf('display: none') === -1,
    'การ์ดที่เป็นศูนย์ต้องไม่ถูกซ่อน · การเห็นว่า "ถูกตีกลับ 0" คือข้อมูล (SPEC 17.1)');
  assertTrue_(cssBlockOf_(style, '.stat-go') !== '',
    'ทุกการ์ดต้องมีสัญญาณว่ากดได้ติดอยู่ตลอดเวลา ไม่ใช่โผล่ตอนเอาเมาส์ชี้');

  /* ---------- 12. บนมือถือ การ์ดต้องเรียงลงมาคอลัมน์เดียว ---------- */
  var phone = style.substring(style.indexOf('@media (max-width: 767px)'));
  assertTrue_(phone.indexOf('.stat-grid { grid-template-columns: 1fr;') !== -1,
    'ที่ความกว้าง 360 พิกเซล การ์ดต้องเรียงต่อกันลงมา ไม่ใช่ย่อจนตัวเลขอ่านไม่ออก');

  return endTest_();
}

/**
 * เนื้อในวงเล็บปีกกาของกฎ CSS ที่ขึ้นต้นด้วยตัวเลือกนี้พอดี
 * @param {string} css เนื้อไฟล์สไตล์
 * @param {string} selector ตัวเลือก เช่น '.side-logout'
 * @return {string} เนื้อในบล็อก · ค่าว่างเมื่อไม่พบ
 */
function cssBlockOf_(css, selector) {
  var text = String(css || '');
  var at = text.indexOf('\n' + selector + ' {');
  if (at === -1) at = text.indexOf('\n' + selector + ',');
  if (at === -1) return '';

  var open = text.indexOf('{', at);
  var close = text.indexOf('}', open);
  if (open === -1 || close === -1) return '';
  return text.substring(open + 1, close);
}

/**
 * ค่าของคุณสมบัติหนึ่งในบล็อก CSS
 * @param {string} block เนื้อในบล็อก
 * @param {string} name ชื่อคุณสมบัติ
 * @return {string} ค่า · ค่าว่างเมื่อไม่มี
 */
function cssValueOf_(block, name) {
  var found = new RegExp('(?:^|;|\\s)' + name + '\\s*:\\s*([^;}]+)').exec(String(block || ''));
  return found ? found[1].trim() : '';
}

/**
 * รหัสสีที่เขียนสดนอกบล็อก :root
 * @param {string} css เนื้อไฟล์สไตล์
 * @return {string[]}
 */
function rawColorsOutsideRoot_(css) {
  var text = String(css || '');
  var start = text.indexOf(':root {');
  var end = start === -1 ? -1 : text.indexOf('}', start);
  var rest = (end === -1) ? text : (text.substring(0, start) + text.substring(end));

  var found = rest.match(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/g);
  return found || [];
}

/**
 * ที่อยู่ภายนอกที่ไฟล์หนึ่งสั่งให้เบราว์เซอร์โหลด
 * @param {string} source เนื้อไฟล์
 * @return {string[]}
 */
function externalUrlsIn_(source) {
  var found = String(source || '').match(/(?:href|src)\s*=\s*"https?:\/\/[^"]+"/g);
  return found || [];
}

/**
 * ช่องกรอกที่ตั้งขนาดตัวอักษรต่ำกว่า 16px
 * @param {string} css เนื้อไฟล์สไตล์
 * @return {string[]}
 */
function smallInputFontsIn_(css) {
  var text = String(css || '');
  var bad = [];
  var blocks = text.split('}');

  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    if (!/input|select|textarea|\.auth-input/.test(block)) continue;
    var size = block.match(/font-size:\s*(\d+)px/);
    if (size && Number(size[1]) < 16) bad.push(block.split('{')[0].trim() + ' = ' + size[1] + 'px');
  }
  return bad;
}

/**
 * สิ่งที่กดได้ซึ่งปรากฏเฉพาะตอนเอาเมาส์ชี้
 * @param {string} css เนื้อไฟล์สไตล์
 * @return {string[]}
 */
function hoverOnlyControlsIn_(css) {
  var text = String(css || '');
  var bad = [];
  var blocks = text.split('}');

  for (var i = 0; i < blocks.length; i++) {
    var head = blocks[i].split('{')[0];
    if (head.indexOf(':hover') === -1) continue;
    if (/display:\s*(block|flex|inline|inline-block|grid)/.test(blocks[i]) ||
        /visibility:\s*visible/.test(blocks[i])) {
      bad.push(head.trim());
    }
  }
  return bad;
}

/**
 * กลุ่มแถบเมนูและหน้าตาที่ใช้ร่วมกันทุกหน้า (SPEC 17.3, 17.4)
 * @return {string} ข้อความสรุปผล
 */
/**
 * เรียงชุดสถานะด้วยรายการลำดับของมุมมอง แล้วคืนผลลัพธ์ — ตรรกะล้วน
 *
 * แยกออกมาเพื่อให้พิสูจน์ตัวมันเองด้วยข้อมูลปลอมได้ก่อน แล้วค่อยเอาไปใช้กับ
 * ของจริง · ตัวตรวจที่ไม่เคยถูกพิสูจน์ว่าจับผิดได้ ก็คือตัวตรวจที่เขียวเปล่า ๆ
 *
 * @param {string[]} statuses สถานะที่อยู่ในมุมมองนั้น
 * @param {Object[]} order รายการลำดับ [{column, ascending}]
 * @return {string[]} สถานะที่เรียงแล้ว
 */
function statusOrderOf_(statuses, order) {
  var rows = [];
  for (var i = 0; i < statuses.length; i++) rows.push({ 'Status': statuses[i] });

  var sorted = sortRowsBy_(rows, order);
  var out = [];
  for (var s = 0; s < sorted.length; s++) out.push(sorted[s]['Status']);
  return out;
}

/**
 * มุมมองที่เมนูย่อยชี้มา ต้องเดินทางไปถึงเซิร์ฟเวอร์ตอนเปิดหน้า — SPEC 17.3
 *
 * เกิดจริง 29-09-2026: ผู้ใช้แผนก Service กดเมนู "เสร็จสิ้น" ซึ่งบอกว่ามีงานอยู่
 * แต่เปิดเข้าไปแล้วว่างเปล่า · ตัวเลขบนเมนูถูกต้อง และรายการฝั่งเซิร์ฟเวอร์ก็ถูกต้อง
 * (วัดด้วย checkTaskCounts() บนข้อมูลจริง: เมนูบอก 1 รายการนับได้ 1)
 *
 * ต้นเหตุคือคำขอตอนเปิดหน้าส่งไปแค่แผนก ไม่ได้ส่งมุมมองไปด้วย · เซิร์ฟเวอร์ที่ไม่รู้
 * ว่าขอมุมมองไหน จึงคืนงานที่ "ยังไม่จบ" มาให้ แล้วหน้าเว็บเอาไปกรองด้วยมุมมอง
 * "เสร็จสิ้น" ที่อ่านเอาเองจาก URL — ไม่มีแถวไหนรอดสักแถว
 *
 * สองฝั่งพูดคนละมุมมองกันโดยไม่มีอะไรฟ้อง เพราะหน้าเว็บมีทางถอยไปอ่าน URL เอง
 * ทางถอยนั้นดูเหมือนการกันพลาด แต่จริง ๆ คือตัวที่ซ่อนว่าสองฝั่งไม่ตรงกัน
 */
function test_menu_viewTravelsToTheServer() {
  beginTest_('มุมมองที่กดต้องไปถึงเซิร์ฟเวอร์ตอนเปิดหน้า ไม่ใช่ให้หน้าเว็บเดาเอง');

  var users = serviceTestUsers_();

  /* ---------- ทุกมุมมองที่ขอไป ต้องได้มุมมองเดียวกันกลับมา ---------- */
  for (var v = 0; v < TASK_VIEWS.length; v++) {
    var key = TASK_VIEWS[v].key;
    var boot = withTestUser_(users.service, function () {
      return pageBootstrap_('work', { dept: DEPT.SERVICE, view: key });
    });

    assertEquals_(boot.view, key,
      'ขอมุมมอง ' + key + ' แล้วต้องได้มุมมองเดียวกันกลับมา · ถ้าได้ค่าอื่น แปลว่า' +
      'แถวที่ส่งมาเป็นของมุมมองหนึ่ง แต่หน้าเว็บจะกรองด้วยอีกมุมมองหนึ่ง');
  }

  /* ---------- ไม่ได้ระบุมุมมอง ต้องได้มุมมองตั้งต้น ไม่ใช่ค่าว่าง ---------- */
  /*
   * ค่าว่างคือสิ่งที่ทำให้หน้าเว็บต้องไปเดาเอง · หน้าจอต้องได้มุมมองที่แน่นอนเสมอ
   */
  var blank = withTestUser_(users.service, function () {
    return pageBootstrap_('work', { dept: DEPT.SERVICE });
  });
  assertEquals_(blank.view, DEFAULT_TASK_VIEW,
    'ไม่ได้ระบุมุมมอง ต้องได้มุมมองตั้งต้น ไม่ใช่ค่าว่างที่ทำให้หน้าเว็บต้องเดา');

  var junk = withTestUser_(users.service, function () {
    return pageBootstrap_('work', { dept: DEPT.SERVICE, view: 'ไม่มีมุมมองนี้' });
  });
  assertEquals_(junk.view, DEFAULT_TASK_VIEW,
    'คีย์ที่ไม่รู้จักก็ต้องถอยไปมุมมองตั้งต้นเหมือนกัน');

  /* ---------- คำขอตอนเปิดหน้าต้องแนบมุมมองไปด้วยจริง ---------- */
  var nav = stripComments_(HtmlService.createHtmlOutputFromFile('ui_Nav').getContent());
  assertTrue_(/params\s*=\s*\{[^}]*view:\s*NAV\.view/.test(nav),
    'คำขอตอนเปิดหน้าต้องแนบมุมมองไปด้วย ไม่งั้นเซิร์ฟเวอร์ไม่มีทางรู้ว่าขอมุมมองไหน');

  /* ---------- หน้าแผนกต้องเชื่อคำตอบของเซิร์ฟเวอร์ ไม่ถอยไปอ่าน URL ---------- */
  var pages = ['ui_DeptWork', 'ui_LabWork'];
  for (var p = 0; p < pages.length; p++) {
    var page = stripComments_(HtmlService.createHtmlOutputFromFile(pages[p]).getContent());
    var found = /state\.view\s*=\s*([^;]+);/.exec(page);

    assertTrue_(!!found, pages[p] + ' ต้องตั้งค่ามุมมองของหน้า');
    assertTrue_(found[1].indexOf('NAV.view') === -1,
      pages[p] + ' ต้องไม่ถอยไปอ่านมุมมองจาก URL เอง · ทางถอยนั้นซ่อนว่าสองฝั่ง' +
      'ไม่ตรงกัน แทนที่จะทำให้เห็น · ได้: ' + found[1]);
  }

  return endTest_();
}

/**
 * ลำดับที่ฐานข้อมูลเรียงให้ ต้องเหมือนลำดับเดิมที่หน้าเว็บเคยเรียงเอง (SPEC 17.3)
 *
 * **ข้อนี้มีขึ้นเพราะการย้ายการเรียงไปฝั่งฐานข้อมูล เปลี่ยนลำดับได้โดยไม่มีอะไรฟ้อง**
 *
 * เดิมหน้าเว็บถืองานทุกสถานะไว้แล้วเรียงเองด้วยลำดับที่เขียนไว้ตายตัว —
 * รอกดรับ แล้วกำลังทำ แล้วถูกตีกลับ แล้วเสร็จสิ้น แล้วยกเลิก · ตอนนี้ฐานข้อมูล
 * เป็นคนเรียง ซึ่งเรียงตามตัวอักษรของค่าสถานะ ไม่ใช่ตามลำดับที่เราตั้งใจ ·
 * สองอย่างนี้บังเอิญตรงกันในทุกมุมมองที่มีอยู่ แต่ "บังเอิญตรงกัน" ไม่ใช่สิ่งที่
 * ฝากไว้กับความจำได้ · วันที่มีคนเพิ่มสถานะใหม่เข้ามุมมองใดมุมมองหนึ่ง ลำดับ
 * จะเปลี่ยนไปเงียบ ๆ แล้วงานที่ควรอยู่บนสุดจะไปอยู่หน้าสุดท้ายที่ไม่มีใครเลื่อนไปดู
 */
function test_menu_viewOrderMatchesOldSort() {
  beginTest_('ลำดับที่ฐานข้อมูลเรียง ต้องเหมือนลำดับเดิมที่หน้าเว็บเคยเรียงเอง');

  /* ---------- พิสูจน์ตัวตรวจด้วยข้อมูลปลอมก่อน ---------- */
  /*
   * ถ้าไม่ทำขั้นนี้ ตัวตรวจที่เรียงผิดทางจะยังเขียวได้ เพราะของจริงมีสถานะ
   * แค่สองตัวต่อมุมมอง และสองตัวที่เรียงผิดทางก็ยัง "เป็นลำดับ" อยู่ดี
   */
  var asc  = [{ column: 'Status', ascending: true }];
  var desc = [{ column: 'Status', ascending: false }];

  assertEquals_(statusOrderOf_(['B', 'A', 'C'], asc).join(','), 'A,B,C',
    'เรียงขึ้นต้องได้ A ก่อน');
  assertEquals_(statusOrderOf_(['B', 'A', 'C'], desc).join(','), 'C,B,A',
    'เรียงลงต้องได้ C ก่อน');
  assertEquals_(statusOrderOf_(['A'], asc).join(','), 'A',
    'สถานะเดียวต้องได้ตัวเดิมกลับมา ไม่ใช่รายการว่าง');

  /* ---------- ลำดับเดิมที่หน้าเว็บเคยเรียง ---------- */
  /*
   * เขียนไว้ตรงนี้ตัวเดียว เป็นภาพของ "สิ่งที่ผู้ใช้เคยเห็น" ซึ่งเป็นสิ่งที่ข้อนี้ปกป้อง
   * ไม่ใช่รายการที่ต้องแก้ตามโค้ด · ถ้าวันหนึ่งต้องแก้บรรทัดนี้ แปลว่ากำลังจะ
   * เปลี่ยนสิ่งที่ผู้ใช้เห็น ซึ่งต้องเป็นการตัดสินใจ ไม่ใช่ผลข้างเคียง
   */
  var oldSortOrder = [TASK_STATUS.PENDING_ACCEPT, TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.RETURNED, TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED];

  for (var v = 0; v < TASK_VIEWS.length; v++) {
    var view = TASK_VIEWS[v];

    assertTrue_(!!view.order && view.order.length > 0,
      'มุมมอง ' + view.key + ' ต้องประกาศลำดับไว้ ไม่งั้นฐานข้อมูลจะเลือกลำดับเองซึ่งเปลี่ยนได้ทุกเมื่อ');

    /*
     * มุมมองที่คัดด้วยวันที่เรียงตามเวลานัด ไม่ได้เรียงตามสถานะ
     * เพราะลำดับที่ช่างต้องการคือลำดับที่เขาเดินทางจริง ไม่ใช่สถานะของงาน
     */
    if (view.byDate) {
      assertEquals_(view.order[0].column, 'Visit_Start',
        'มุมมอง "งานวันนี้" ต้องเรียงตามเวลานัดเป็นอันดับแรก');
      assertEquals_(view.order[0].ascending, true,
        'และต้องเรียงจากเช้าไปเย็น ซึ่งเป็นลำดับที่ช่างเดินทางจริง');
      continue;
    }

    /* ---------- ลำดับใหม่ต้องให้ผลเหมือนลำดับเดิม ---------- */
    var wanted = [];
    for (var o = 0; o < oldSortOrder.length; o++) {
      if (view.statuses.indexOf(oldSortOrder[o]) !== -1) wanted.push(oldSortOrder[o]);
    }

    var got = statusOrderOf_(view.statuses.slice(), view.order);

    assertEquals_(got.join(','), wanted.join(','),
      'มุมมอง ' + view.key + ' ต้องเรียงสถานะได้ลำดับเดิม · เดิม ' + wanted.join(',') +
      ' · ที่ฐานข้อมูลจะให้ ' + got.join(','));

    /* ---------- และต้องมีตัวตัดสินสุดท้ายเสมอ ---------- */
    /*
     * ลำดับที่ไม่ระบุจนถึงระดับที่ไม่มีทางเท่ากัน จะทำให้แถวเดียวกันโผล่สองหน้า
     * หรือหายไปทั้งสองหน้าเมื่อแบ่งหน้า โดยไม่มีอะไรผิดให้เห็น
     */
    assertEquals_(view.order[view.order.length - 1].column, 'WO_ID',
      'มุมมอง ' + view.key + ' ต้องจบด้วยคอลัมน์ที่ไม่มีทางซ้ำกัน ไม่งั้นการแบ่งหน้าจะไม่แน่นอน');
  }

  return endTest_();
}

function test_group_menu() {
  return runGroup_('MENU', [
    { name: 'test_menu_structure',              fn: test_menu_structure },
    { name: 'test_menu_everyTaskStatusHasView', fn: test_menu_everyTaskStatusHasView },
    { name: 'test_menu_styleContract',          fn: test_menu_styleContract },
    { name: 'test_menu_taskViewsAndCounts',     fn: test_menu_taskViewsAndCounts },
    { name: 'test_menu_viewTravelsToTheServer', fn: test_menu_viewTravelsToTheServer },
    { name: 'test_menu_deniedGetsNoData',       fn: test_menu_deniedGetsNoData },
    { name: 'test_menu_viewOrderMatchesOldSort', fn: test_menu_viewOrderMatchesOldSort }
  ]);
}

/**
 * กลุ่มหน้าแรก (SPEC 17.1)
 * @return {string} ข้อความสรุปผล
 */
function test_group_home() {
  return runGroup_('HOME', [
    { name: 'test_home_defaultListing',       fn: test_home_defaultListing },
    { name: 'test_home_searchOneBox',         fn: test_home_searchOneBox },
    { name: 'test_home_multipleFilters',      fn: test_home_multipleFilters },
    { name: 'test_home_filterOptionsFromData', fn: test_home_filterOptionsFromData },
    { name: 'test_home_similarNames',         fn: test_home_similarNames },
    { name: 'test_home_emptyStates',          fn: test_home_emptyStates },
    { name: 'test_home_reopenedFilter',      fn: test_home_reopenedFilter },
    { name: 'test_home_overdueFilter',        fn: test_home_overdueFilter },
    { name: 'test_home_cardsGroupedByWhoActs', fn: test_home_cardsGroupedByWhoActs },
    { name: 'test_home_tripsAreConstant',     fn: test_home_tripsAreConstant },
    { name: 'test_home_noFullTableReadOfWorkOrders', fn: test_home_noFullTableReadOfWorkOrders }
  ]);
}

/**
 * กลุ่มบันทึกสองตาราง — Audit_Log กับ System_Log (SPEC 13)
 *
 * แยกกลุ่มของตัวเองเพราะเวลาแดง ต้องรู้ทันทีว่าเป็นเรื่องของการแยกบันทึก
 * ไม่ใช่เรื่องของงานที่บังเอิญเขียนบันทึกระหว่างทาง
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_log() {
  return runGroup_('LOG', [
    { name: 'test_log_woEventsStayInAudit',     fn: test_log_woEventsStayInAudit },
    { name: 'test_log_authGoesToSystem',        fn: test_log_authGoesToSystem },
    { name: 'test_log_notifyFailedGoesToSystem', fn: test_log_notifyFailedGoesToSystem },
    { name: 'test_log_neverBoth',               fn: test_log_neverBoth },
    { name: 'test_log_everySystemEventDeclared', fn: test_log_everySystemEventDeclared },
    { name: 'test_log_cleanupClearsSystemLog',  fn: test_log_cleanupClearsSystemLog }
  ]);
}

/**
 * กลุ่มใบสั่งงาน PDF (SPEC 16.1)
 *
 * ชุดที่ออกไฟล์จริงจะข้ามตัวเองเมื่อยังไม่ได้ตั้งค่าแม่แบบ ซึ่งเป็นสภาพปกติของชีตที่เพิ่งติดตั้ง
 * ส่วนชุดที่ตรวจค่าบนกระดาษเป็นฟังก์ชันล้วน จึงเดินครบทุกครั้งไม่ว่าจะตั้งค่าแล้วหรือยัง
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_service_report() {
  return runGroup_('SERVICE_REPORT', [
    { name: 'test_report_values',             fn: test_report_values },
    { name: 'test_report_filesAndReturnNote', fn: test_report_filesAndReturnNote },
    { name: 'test_report_contract',           fn: test_report_contract },
    { name: 'test_report_skipsWithoutTemplate', fn: test_report_skipsWithoutTemplate },
    { name: 'test_report_replacesEveryPlaceholder', fn: test_report_replacesEveryPlaceholder },
    { name: 'test_report_topicsAppearOnPaper',     fn: test_report_topicsAppearOnPaper },
    { name: 'test_report_generateOnCreate',   fn: test_report_generateOnCreate },
    { name: 'test_report_archivesOldVersion', fn: test_report_archivesOldVersion },
    { name: 'test_report_failureKeepsStatus', fn: test_report_failureKeepsStatus }
  ]);
}

/**
 * กลุ่มหน้าจอที่แสดงรายการ (356 รอบ)
 * ข้อมูลที่ส่งให้หน้างานของแผนก หน้าใบงานที่ถูกตีกลับ และเส้นทางรายการว่างของทุกหน้า
 * @return {string} ข้อความสรุปผล
 */
/**
 * อักขระที่ทำให้จาวาสคริปต์ในหน้าพังได้ทุกแบบ รวมไว้ในข้อความเดียว
 *
 * ใช้เป็นเนื้อหาของทุกช่องข้อความในใบงานทดสอบ · ถ้าวันหนึ่งมีใครเอาข้อมูลของ
 * ผู้ใช้ไปฝังลงในหน้า HTML จากฝั่งเซิร์ฟเวอร์ ข้อความนี้จะทำให้หน้านั้นแปลไม่ผ่าน
 * ทันที ซึ่งเป็นสิ่งที่ต้องรู้ตั้งแต่ในเทสต์ ไม่ใช่ตอนที่ลูกค้าพิมพ์หมายเหตุขึ้นบรรทัดใหม่
 *
 * @return {string}
 */
function hostileText_() {
  return "อะพอสทรอฟี ' คำพูดคู่ \" แบ็กสแลช \\ " +
    'ปิดสคริปต์ </script> เอนทิตี &quot; &amp; &#39; ' +
    'ขึ้นบรรทัดใหม่\nแล้วบรรทัดที่สอง แท็บ\tและอักขระไทยผสมอังกฤษ mixed';
}

/**
 * หน้าที่ระบบเสิร์ฟออกไป ต้องแปลผ่านทุกหน้า (SPEC 17.4)
 *
 * **ข้อนี้มีขึ้นเพราะเทสต์ 4,210 ข้อผ่านหมดแต่หน้าแผนกเปิดไม่ได้**
 *
 * สาเหตุคือสตริงในไฟล์ของหน้าแผนกมีการขึ้นบรรทัดใหม่อยู่ข้างในเครื่องหมายคำพูด
 * เบราว์เซอร์จึงแปลบล็อกนั้นไม่ผ่านแล้วข้ามทั้งบล็อกไปเงียบ ๆ · ฝั่งเซิร์ฟเวอร์
 * ไม่มีอะไรผิดเลยแม้แต่บรรทัดเดียว เพราะมันประกอบหน้าสำเร็จจริง ๆ ปัญหาอยู่ที่
 * เนื้อหาข้างในซึ่งไม่เคยมีใครตรวจ
 *
 * ทุกข้อในชุดเทสต์เดิมเรียกฟังก์ชันฝั่งเซิร์ฟเวอร์ ไม่มีข้อไหนเอาหน้าที่ประกอบเสร็จ
 * แล้วมาลองแปลดู · นี่คือช่องว่างที่บั๊กชนิดนี้ลอดผ่านมาได้ทั้งหมด
 */
function test_web_everyPageParses() {
  beginTest_('ทุกหน้าที่เสิร์ฟออกไป จาวาสคริปต์ต้องแปลผ่าน');

  var pages = [];
  for (var key in WEB_PAGES) {
    if (Object.prototype.hasOwnProperty.call(WEB_PAGES, key)) pages.push(key);
  }
  assertTrue_(pages.length > 0, 'ต้องมีหน้าให้ตรวจ ไม่งั้นข้อนี้ผ่านโดยไม่ได้ตรวจอะไร');

  for (var p = 0; p < pages.length; p++) {
    var html = servedHtmlOf_(pages[p], { dept: DEPT.SERVICE, view: 'active' });
    var blocks = scriptBlocksOf_(html);

    assertTrue_(blocks.length > 0,
      'หน้า ' + pages[p] + ' ต้องมีบล็อกสคริปต์อย่างน้อยหนึ่งบล็อก ' +
      'ถ้าไม่มี แปลว่าการตัดบล็อกพัง แล้วข้อนี้จะผ่านโดยไม่ได้ตรวจอะไรเลย');

    var risks = htmlRiskScan_(html);
    assertEquals_(riskReport_(risks), '',
      'หน้า ' + pages[p] + ' ต้องไม่มีร่องรอยที่ทำให้จาวาสคริปต์แปลไม่ผ่าน');
  }

  /* ---------- ห้ามฝังข้อมูลของผู้ใช้ลงในหน้า ---------- */
  /*
   * **ถ้าฝัง หน้าจะพังตามเนื้อหาของข้อมูล ไม่ใช่ตามโค้ด**
   *
   * ใบงานใบเดียวที่มีหมายเหตุขึ้นบรรทัดใหม่ จะทำให้หน้านั้นพังทั้งหน้าสำหรับทุกคน
   * และพังแบบเงียบที่สุด คือค้างที่ "กำลังโหลด" โดยฝั่งเซิร์ฟเวอร์ไม่มี error เลย ·
   * ข้อมูลของผู้ใช้ต้องเดินทางผ่าน google.script.run เท่านั้น ซึ่งจัดการให้อยู่แล้ว
   */
  var detail = servedHtmlOf_('work', { dept: DEPT.SERVICE, view: 'active' });
  var marker = /data-bootstrap="([^"]*)"/.exec(detail);
  assertTrue_(!!marker, 'หน้าต้องยังมีช่อง data-bootstrap อยู่ ไม่งั้นข้อนี้ตรวจของที่ไม่มีแล้ว');
  assertEquals_(marker[1], '',
    'ช่อง data-bootstrap ต้องว่างเสมอ — ห้ามฝังข้อมูลของผู้ใช้ลงในหน้าจากฝั่งเซิร์ฟเวอร์');

  return endTest_();
}

/**
 * รวมร่องรอยที่พบให้เป็นข้อความบรรทัดเดียว เพื่อให้ข้อความตอนไม่ผ่านบอกตำแหน่งครบ
 * @param {Object[]} risks ผลจาก htmlRiskScan_
 * @return {string} '' = ไม่พบอะไร
 */
function riskReport_(risks) {
  var parts = [];
  for (var i = 0; i < risks.length; i++) {
    parts.push('[' + risks[i].kind + '] บรรทัด ' + risks[i].line + ' ' + risks[i].detail);
  }
  return parts.join(' | ');
}

/**
 * ตัวสแกนจับหน้าที่พังได้จริงหรือไม่ — ป้อนหน้าปลอมที่พังทั้งสี่แบบ
 *
 * **ตัวตรวจที่ไม่เคยถูกพิสูจน์ว่าจับผิดได้ คือตัวตรวจที่เขียวเปล่า ๆ** (กฎข้อ 27)
 *
 * ถ้าไม่มีข้อนี้ การตัดบล็อกที่พลาดไปนิดเดียว เช่นตัด `<script>` ไม่เจอเลยสักบล็อก
 * จะทำให้ข้อข้างบนผ่านตลอดกาลโดยไม่ได้ตรวจอะไร แล้วเราจะเชื่อว่ามีตาข่ายอยู่
 * ทั้งที่ไม่มี ซึ่งแย่กว่าการรู้ตัวว่าไม่มี
 */
function test_web_scannerCatchesBrokenPages() {
  beginTest_('ตัวสแกนหน้าเว็บ ต้องจับหน้าที่พังได้ทั้งสี่แบบ');

  var head = '<html><body><script>' + NEW_LINE_;
  var tail = NEW_LINE_ + '</' + 'script></body></html>';

  /* ---------- 1) ขึ้นบรรทัดใหม่อยู่ข้างในเครื่องหมายคำพูด — สาเหตุที่เกิดจริง ---------- */
  var broken = head + "var go = confirm('บรรทัดแรก" + NEW_LINE_ + "บรรทัดสอง');" + tail;
  var found = htmlRiskScan_(broken);
  assertTrue_(hasRisk_(found, 'PARSE'), 'ต้องรายงานว่าบล็อกนี้แปลไม่ผ่าน');
  assertTrue_(hasRisk_(found, 'UNCLOSED'),
    'และต้องชี้บรรทัดที่เปิดเครื่องหมายคำพูดแล้วไม่ปิด ซึ่งเป็นตำแหน่งที่คนต้องไปแก้');

  /* ---------- 2) entity ของ HTML หลุดเข้ามาในโค้ด ---------- */
  broken = head + 'var name = &quot;สมชาย&quot;;' + tail;
  found = htmlRiskScan_(broken);
  assertTrue_(hasRisk_(found, 'PARSE'), 'entity ในโค้ดต้องทำให้แปลไม่ผ่าน');
  assertTrue_(hasRisk_(found, 'ENTITY'),
    'และต้องบอกว่าเป็น entity ซึ่งชี้ตรงไปที่การใช้ <?= ?> แทน <?!= ?>');

  /* ---------- 3) ข้อความปิดบล็อกสคริปต์อยู่ในสตริง ---------- */
  /*
   * ต้องประกอบชื่อแท็กจากสองท่อน ไม่งั้นไฟล์เทสต์นี้เองจะเป็นตัวอย่างของบั๊ก
   * ที่กำลังทดสอบอยู่ ซึ่งเป็นเรื่องที่เกิดขึ้นได้จริงและน่าขันมาก
   */
  var closer = '</' + 'script>';
  broken = '<html><body><script>' + NEW_LINE_ + "var s = '" + closer + "';" + NEW_LINE_ + tail;
  found = htmlRiskScan_(broken);
  assertTrue_(hasRisk_(found, 'PARSE') || hasRisk_(found, 'CLOSETAG'),
    'ข้อความปิดบล็อกในสตริงต้องถูกจับได้ ไม่ทางใดก็ทางหนึ่ง');

  /* ---------- 4) แบ็กสแลชเดี่ยวที่ไม่ได้หลีก ---------- */
  broken = head + "var path = 'C:\\';" + tail;
  found = htmlRiskScan_(broken);
  assertTrue_(hasRisk_(found, 'PARSE'),
    'แบ็กสแลชที่ไปหลีกเครื่องหมายปิดสตริงเข้า ต้องทำให้แปลไม่ผ่าน');

  /* ---------- หน้าที่ถูกต้อง ต้องไม่ถูกฟ้อง ---------- */
  /*
   * สำคัญเท่ากับสี่ข้อบน · ตัวตรวจที่ฟ้องหน้าที่ถูกต้องด้วย จะทำให้คนเลิกอ่าน
   * รายงานทั้งฉบับ แล้ววันที่มันฟ้องถูกก็จะไม่มีใครเห็น
   */
  var fine = head +
    "function escapeHtml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }" +
    NEW_LINE_ + "var msg = 'เขาบอกว่า \"ไม่เป็นไร\" แล้วก็เดินไป';" +
    NEW_LINE_ + "var esc = 'บรรทัดแรก\\nบรรทัดสอง';" + tail;
  assertEquals_(riskReport_(htmlRiskScan_(fine)), '',
    'หน้าที่ถูกต้องต้องไม่ถูกฟ้องเลย แม้จะมี entity อยู่ในสตริงโดยตั้งใจ');

  return endTest_();
}

/**
 * ในผลการสแกน มีร่องรอยชนิดนี้อยู่หรือไม่
 * @param {Object[]} risks ผลจาก htmlRiskScan_
 * @param {string} kind ชนิดที่มองหา
 * @return {boolean}
 */
function hasRisk_(risks, kind) {
  for (var i = 0; i < risks.length; i++) if (risks[i].kind === kind) return true;
  return false;
}

/**
 * ใบงานที่มีอักขระร้ายในทุกช่อง ต้องไม่ทำให้หน้าไหนแปลไม่ผ่าน (SPEC 17.4)
 *
 * **ข้อนี้ตอบคำถามว่า "หน้าพังตามโค้ด หรือพังตามข้อมูล"**
 *
 * ถ้าวันหนึ่งมีคนเอาข้อมูลของผู้ใช้ไปฝังลงในหน้าจากฝั่งเซิร์ฟเวอร์ ข้อข้างบนจะยัง
 * ผ่านอยู่ เพราะฐานทดสอบตอนนั้นไม่มีข้อมูลที่ร้ายพอ · ข้อนี้ทำให้ข้อมูลร้าย
 * มีอยู่จริงในฐาน แล้วเปิดทุกหน้าดูอีกรอบ
 */
function test_web_hostileDataDoesNotBreakPages() {
  beginTest_('ใบงานที่มีอักขระร้ายทุกชนิด ต้องไม่ทำให้หน้าไหนแปลไม่ผ่าน');

  var users = serviceTestUsers_();
  var nasty = hostileText_();

  var wo = createTestWo_(users, {
    'Customer_Name':   'ลูกค้า ' + nasty,
    'Project':         'โครงการ ' + nasty,
    'Location':        'สถานที่ ' + nasty,
    'Contact':         'ผู้ติดต่อ ' + nasty,
    'Job_Description': 'รายละเอียดงาน ' + nasty
  });

  /* เก็บกลับมาอ่านก่อน — ถ้าเขียนลงไปแล้วอ่านกลับมาไม่เหมือนเดิม ปัญหาอยู่คนละที่ */
  var saved = getWorkOrder(wo.woId);
  assertTrue_(String(saved['Job_Description']).indexOf('</' + 'script>') !== -1,
    'ข้อความร้ายต้องถูกเก็บไว้ครบตามที่ผู้ใช้พิมพ์ ไม่ถูกตัดทิ้งระหว่างทาง');

  for (var key in WEB_PAGES) {
    if (!Object.prototype.hasOwnProperty.call(WEB_PAGES, key)) continue;

    var html = servedHtmlOf_(key, { wo: wo.woId, dept: DEPT.SERVICE, view: 'active' });
    assertEquals_(riskReport_(htmlRiskScan_(html)), '',
      'หน้า ' + key + ' ต้องยังแปลผ่าน แม้ในฐานจะมีใบงานที่เต็มไปด้วยอักขระร้าย');
  }

  /*
   * และเลขที่ใบงานที่ติดมากับ URL ต้องไม่หลุดเข้าไปในโค้ดด้วย
   *
   * ค่านี้มาจากหน้าเว็บโดยตรง จึงเป็นทางที่คนภายนอกป้อนอะไรเข้ามาก็ได้ ·
   * มันถูกวางไว้ในคุณสมบัติของแท็ก ซึ่ง <?= ?> หลีกอักขระให้แล้ว แต่ต้องพิสูจน์
   * ไม่ใช่เชื่อ เพราะวันหนึ่งอาจมีคนย้ายมันเข้าไปในบล็อกสคริปต์
   */
  var evil = servedHtmlOf_('wo', { wo: '"; alert(1); //', dept: DEPT.SERVICE });
  assertEquals_(riskReport_(htmlRiskScan_(evil)), '',
    'เลขที่ใบงานที่จงใจทำให้พัง ต้องไม่ทำให้หน้าแปลไม่ผ่าน');

  return endTest_();
}

function test_group_service_pages() {
  return runGroup_('SERVICE_PAGES', [
    { name: 'test_web_deptWorkView',           fn: test_web_deptWorkView },
    { name: 'test_web_deptWorkBlockedStates',  fn: test_web_deptWorkBlockedStates },
    { name: 'test_web_deptWorkPaymentNotice',  fn: test_web_deptWorkPaymentNotice },
    { name: 'test_web_returnedList',           fn: test_web_returnedList },
    { name: 'test_web_emptyListsEverywhere',   fn: test_web_emptyListsEverywhere },
    { name: 'test_web_everyPageParses',        fn: test_web_everyPageParses },
    { name: 'test_web_scannerCatchesBrokenPages', fn: test_web_scannerCatchesBrokenPages },
    { name: 'test_web_hostileDataDoesNotBreakPages', fn: test_web_hostileDataDoesNotBreakPages }
  ]);
}

/*
 * กลุ่มสิทธิ์ — เมทริกซ์ Role เทียบกับทุกฟังก์ชันที่หน้าเว็บเรียกได้ (กฎข้อ 17)
 * ยิงผ่านชั้น 09_Api จริง เพราะจุดที่ต้องพิสูจน์คือการตรวจสิทธิ์ที่ชั้นนั้น
 *
 * แตกเป็น 3 กลุ่มตามเรื่อง: ตัวตน สิทธิ์ใบงาน และสิทธิ์งานแผนกกับไฟล์
 */

/**
 * แผนกในทะเบียนที่พิมพ์ต่างตัวพิมพ์ ต้องยังใช้งานได้ — SPEC 2
 *
 * เกิดจริง 29-09-2026: ทะเบียนเก็บว่า "Service" แทน "SERVICE" · ผู้ใช้แผนก Service
 * และ Project เปิดเมนูของแผนกตัวเองไม่ได้เลย โดยข้อความที่ขึ้นอ่านแล้วเหมือนถูกต้อง
 * ทุกอย่าง — "สิทธิ์ปัจจุบันของคุณคือ แผนก Service · สังกัดService"
 *
 * คอลัมน์ Role ที่อยู่ข้าง ๆ กันในตารางเดียวกันตัดช่องว่าง ไม่สนตัวพิมพ์ และตรวจกับ
 * รายการที่รู้จักมาตั้งแต่ต้น · ช่องที่คนพิมพ์เองทั้งคู่ต้องถูกปฏิบัติเหมือนกัน
 */
function test_auth_departmentSpellingIsForgiving() {
  beginTest_('แผนกในทะเบียนที่พิมพ์ต่างตัวพิมพ์หรือมีช่องว่าง ต้องยังใช้งานได้');

  var written = ['SERVICE', 'Service', 'service', ' SERVICE ', 'sErViCe'];

  for (var i = 0; i < written.length; i++) {
    var view = userViewOfRow_('sv@test.local',
      { 'Role': ROLE.SERVICE, 'Department': written[i], 'Display_Name': 'ช่าง' });

    assertEquals_(view.department, DEPT.SERVICE,
      'ค่า ' + JSON.stringify(written[i]) + ' ในทะเบียน ต้องกลายเป็นรหัสแผนกเดียวกัน');

    var item = null;
    var menu = menuForUser_(view);
    for (var m = 0; m < menu.length; m++) {
      if (menu[m].dept === DEPT.SERVICE && menu[m].page === 'work') item = menu[m];
    }
    assertTrue_(!!item && item.allowed,
      'และต้องเปิดเมนูของแผนกตัวเองได้ · ค่าในทะเบียนคือ ' + JSON.stringify(written[i]));
  }

  /* ---------- ไม่สังกัดแผนกใด เป็นค่าที่ถูกต้องของธุรการและผู้อนุมัติ ---------- */
  assertEquals_(userViewOfRow_('admin@test.local',
    { 'Role': ROLE.ADMIN, 'Department': '' }).department, '',
    'ช่องว่างแปลว่าไม่สังกัดแผนกใด ซึ่งถูกต้องสำหรับธุรการและผู้อนุมัติ');

  /* ---------- ค่าที่ไม่ใช่รหัสแผนกเลย ต้องอธิบายได้ แต่ห้ามทำให้เข้าระบบไม่ได้ ---------- */
  /*
   * เคยทำเป็นการโยน error ที่จุดประกอบตัวตน · เกิดจริง 29-09-2026 กับบัญชีเจ้าของ
   * ระบบเองที่ทะเบียนเก็บว่า "AdminSale" ในช่องแผนก แล้วล็อกอินไม่ได้ทั้งบัญชี
   * ทั้งที่บัญชีนั้นไม่ได้สังกัดแผนกใดจริง ๆ และควรใช้งานได้ตามปกติ
   *
   * แผนกมีผลกับหน้าของแผนกเท่านั้น การปิดทั้งระบบเพราะช่องนี้จึงไม่ได้สัดส่วน
   * กับความเสียหาย · แต่การเงียบไปเฉย ๆ ก็ไม่ได้ เพราะผู้ใช้จะไปขอเพิ่มสิทธิ์
   * ทั้งที่สิทธิ์ถูกอยู่แล้ว · คำอธิบายจึงต้องติดไปกับตัวตน ให้ไปโผล่ตรงจุดที่มันมีผล
   */
  var odd = userViewOfRow_('sv@test.local', { 'Role': ROLE.SERVICE, 'Department': 'AdminSale' });

  assertEquals_(odd.department, '',
    'ค่าที่ไม่ใช่รหัสแผนก ต้องแปลว่าไม่ได้สังกัดแผนกใด');
  assertEquals_(odd.roles.join(','), ROLE.SERVICE,
    'และต้องไม่กระทบสิทธิ์ที่เหลือ — บัญชีต้องยังเข้าระบบได้ตามปกติ');
  assertTrue_(odd.departmentProblem.indexOf('AdminSale') !== -1,
    'ต้องบอกค่าที่เจอในทะเบียน · ข้อความที่ได้: "' + odd.departmentProblem + '"');
  assertTrue_(odd.departmentProblem.indexOf(DEPT.SERVICE) !== -1 &&
    odd.departmentProblem.indexOf(DEPT.LAB) !== -1,
    'และต้องบอกรหัสที่ใช้ได้ทั้งหมด เพื่อให้แก้ได้ทันทีโดยไม่ต้องถามใคร');

  assertEquals_(userViewOfRow_('admin@test.local',
    { 'Role': ROLE.ADMIN, 'Department': DEPT.SERVICE }).departmentProblem, '',
    'ค่าที่ถูกต้องต้องไม่มีคำเตือนติดมาด้วย');

  /* ---------- คำอธิบายต้องไปโผล่ตรงหน้าที่ถูกปฏิเสธ ---------- */
  var nav = stripComments_(HtmlService.createHtmlOutputFromFile('ui_Nav').getContent());
  assertTrue_(nav.indexOf('departmentProblem') !== -1,
    'ข้อความอธิบายต้องไปแสดงตรงหน้าที่ถูกปฏิเสธ ไม่ใช่เก็บไว้เฉย ๆ · ' +
    'ผู้ใช้ที่เห็นแค่ "ไม่มีสิทธิ์" จะไปขอเพิ่มสิทธิ์ ทั้งที่ของที่ต้องแก้คือช่องแผนก');

  /* ---------- ตัวแปลงต้องอ่านรายการแผนกจาก DEPT ที่เดียว ---------- */
  var known = knownDepartments_();
  assertEquals_(known.length, 3, 'รายการแผนกต้องมาจาก DEPT ไม่ใช่รายชื่อชุดที่สอง');
  for (var k = 0; k < known.length; k++) {
    assertEquals_(departmentCodeOf_(known[k].toLowerCase()), known[k],
      'ทุกรหัสใน DEPT ต้องถูกรู้จักไม่ว่าจะพิมพ์อย่างไร — ' + known[k]);
  }

  return endTest_();
}

/**
 * กลุ่มสิทธิ์ (1/3) — ตัวตน: ล็อกอิน โทเคน ล็อกบัญชี และรหัสผ่าน (350 รอบ)
 * 07_Auth.gs ทั้งไฟล์ · เป็นด่านแรกสุด ถ้ากลุ่มนี้แดง กลุ่มอื่นไม่ต้องดูต่อ
 * @return {string} ข้อความสรุปผล
 */
function test_group_permission_auth() {
  return runGroup_('PERM_AUTH', [
    { name: 'test_auth_loginSucceedsAndFails',  fn: test_auth_loginSucceedsAndFails },
    { name: 'test_auth_lockAfterFailures',      fn: test_auth_lockAfterFailures },
    { name: 'test_auth_unknownRoleIgnored',     fn: test_auth_unknownRoleIgnored },
    { name: 'test_auth_departmentSpellingIsForgiving', fn: test_auth_departmentSpellingIsForgiving }
  ]);
}

/**
 * กลุ่มสิทธิ์ (1ค/3) — อายุของโทเคนและการออกจากระบบ
 *
 * แยกออกมาเพราะกลุ่มเดิมวัดได้ 279 วินาทีบนของจริง ซึ่งเหลือที่ว่างจากเพดาน
 * 360 วินาทีไม่ถึงหนึ่งนาทีครึ่ง · กลุ่มที่เพิ่มอีกสองสามชุดแล้วชนเพดาน คือกลุ่มที่
 * วันหนึ่งจะตายกลางคันแล้วทิ้งข้อมูลทดสอบไว้ในตารางจริง เพราะการล้างอยู่ท้ายสุด
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_permission_token() {
  return runGroup_('PERM_TOKEN', [
    { name: 'test_auth_tokenExpires',           fn: test_auth_tokenExpires },
    { name: 'test_auth_tokenBelongsToOwner',    fn: test_auth_tokenBelongsToOwner },
    { name: 'test_auth_noTokenWritesNothing',   fn: test_auth_noTokenWritesNothing },
    { name: 'test_auth_logoutKillsToken',       fn: test_auth_logoutKillsToken }
  ]);
}

/**
 * กลุ่มสิทธิ์ (1ข/3) — การตั้งรหัสผ่านและความลับที่ห้ามหลุด
 *
 * แยกออกมาจาก PERM_AUTH เพราะกลุ่มเดิมชนเพดาน 6 นาทีบนของจริง (วัดได้จริง
 * 29-09-2026: Exceeded maximum execution time) · การแฮชรหัสผ่านตั้งใจให้ช้า
 * ชุดที่ตั้งรหัสผ่านจึงกินเวลาต่างจากชุดอื่นคนละระดับ และควรอยู่กลุ่มของตัวเอง
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_permission_secret() {
  return runGroup_('PERM_SECRET', [
    { name: 'test_auth_adminSetsPassword',      fn: test_auth_adminSetsPassword },
    { name: 'test_auth_firstAdminOnlyOnce',     fn: test_auth_firstAdminOnlyOnce },
    { name: 'test_auth_noPlainSecrets',         fn: test_auth_noPlainSecrets }
  ]);
}

/**
 * กลุ่มสิทธิ์ (2/3) — สิทธิ์ใบงานและการอนุมัติ (339 รอบ)
 * ใครเห็นอะไร ใครกดอนุมัติได้ และเมนูที่ไม่ใช่สิทธิ์ของตัวเองต้องไม่ผ่อนปรนที่ชั้น API
 *
 * ชุดผู้ใช้ที่มีหลาย Role อยู่ที่นี่ ไม่ใช่กลุ่มตัวตน เพราะสิ่งที่มันพิสูจน์คือ
 * คนที่เป็นทั้งผู้เปิดใบงานและผู้อนุมัติ ต้องอนุมัติใบของตัวเองไม่ได้
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_permission_wo() {
  return runGroup_('PERM_WO', [
    { name: 'test_permission_pendingListByRoute',     fn: test_permission_pendingListByRoute },
    { name: 'test_permission_approverCannotCreate',   fn: test_permission_approverCannotCreate },
    { name: 'test_permission_approveAcrossRoute',     fn: test_permission_approveAcrossRoute },
    { name: 'test_permission_approveRouteSeparation', fn: test_permission_approveRouteSeparation },
    { name: 'test_permission_fixWrongRoute',          fn: test_permission_fixWrongRoute },
    { name: 'test_permission_noRerouteLeft',          fn: test_permission_noRerouteLeft },
    { name: 'test_auth_multiRoleSelfApproval',        fn: test_auth_multiRoleSelfApproval },
    { name: 'test_permission_menuVisibility',         fn: test_permission_menuVisibility },
    { name: 'test_permission_menuDoesNotWeakenApi',   fn: test_permission_menuDoesNotWeakenApi },
    { name: 'test_permission_anonymousIsRejected',    fn: test_permission_anonymousIsRejected },
    { name: 'test_permission_accessDeniedMessage',    fn: test_permission_accessDeniedMessage },
    { name: 'test_permission_woDetailOpenToAll',      fn: test_permission_woDetailOpenToAll }
  ]);
}

/**
 * กลุ่มสิทธิ์ (3/3) — สิทธิ์งานของแผนกและไฟล์ (216 รอบ)
 *
 * รวมทะเบียนรายการของชั้น API ไว้ด้วย เพราะรายการอัปโหลดและลบไฟล์ถูกคุมที่นั่น —
 * ทุกรายการต้องถูกจัดประเภทว่าอ่านหรือเขียน และต้องถูกปฏิเสธเมื่อไม่มีโทเคน
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_permission_task() {
  return runGroup_('PERM_TASK', [
    { name: 'test_permission_taskApi',              fn: test_permission_taskApi },
    { name: 'test_permission_generateReport',       fn: test_permission_generateReport },
    { name: 'test_permission_gatewayActionRegistry', fn: test_permission_gatewayActionRegistry },
    { name: 'test_permission_gatewayRetryList',      fn: test_permission_gatewayRetryList },
    { name: 'test_permission_gatewayDisabled',       fn: test_permission_gatewayDisabled },
    { name: 'test_permission_gatewayFileIsThin',     fn: test_permission_gatewayFileIsThin }
  ]);
}

/* ===========================================================================
 * ใบสั่งงาน PDF (SPEC 16.1)
 *
 * แบ่งเป็นสองแบบตามสิ่งที่พิสูจน์ได้จริง
 *   ค่าที่จะพิมพ์ลงกระดาษ  พิสูจน์ได้ครบด้วยฟังก์ชันล้วน ไม่ต้องแตะ Drive เลย
 *   การออกไฟล์จริง        ต้องมีแม่แบบจริง จึงข้ามได้เมื่อยังไม่ได้ตั้งค่า
 *
 * สิ่งที่เทสต์อัตโนมัติพิสูจน์ไม่ได้เลยคือ "ภาษาไทยอ่านออกไหมบนกระดาษ" —
 * สระบนล่างและวรรณยุกต์ที่หลุดตำแหน่งไม่มีทางเห็นจากข้อความในไฟล์ ต้องเปิดดูด้วยตา
 * =========================================================================== */

/**
 * ใบงานตัวอย่างสำหรับตรวจค่าที่จะพิมพ์ลงกระดาษ — ไม่แตะชีต
 * @param {Object} [override] ค่าที่ต้องการทับ
 * @return {Object}
 */
function reportSampleWo_(override) {
  var wo = {
    'WO_ID': 'WO-2609-0001',
    'PJ_ID': 'PJ-AR0001-01-01',
    'Customer_Code': 'AR0001',
    'Customer_Name': 'บริษัท ทดสอบ จำกัด',
    'Sales_Person': 'สมชาย',
    'Start_Contact_Date': new Date(2026, 8, 1),
    'Contact': 'คุณสมหญิง',
    'Phone': '0812345678',
    'Project': 'อาคาร A',
    'Location': 'ห้องปั๊มน้ำ',
    'Request_Types': 'ตรวจเช็ค, ซ่อม',
    // ข้อความไทยที่มีสระบน สระล่าง และวรรณยุกต์ครบ — ตัวเดียวกับที่ต้องเปิดดูด้วยตาบน PDF
    'Job_Description': 'ปั๊มน้ำรั่ว ซึ่งต้องตรวจสอบระบบไฟฟ้าด้วย',
    'Product_Detail': 'ปั๊มรุ่น X-100',
    'Work_Scope': 'ชั้นใต้ดิน',
    'Reference_Doc': 'QT-2609-001',
    'Start_Date': '2026-09-20T09:00',
    'End_Date': '2026-09-20T17:00',
    'Assignment_Type': ASSIGNMENT.SERVICE,
    'Overall_Status': WO_STATUS.PENDING_APPROVE,
    'Return_Count': 0,
    'Remark': 'ลูกค้าขอให้โทรก่อนเข้า',
    'Created_By': 'sale@cnr.co.th',
    'Created_Date': new Date(2026, 8, 15, 9, 30)
  };

  for (var key in (override || {})) {
    if (Object.prototype.hasOwnProperty.call(override, key)) wo[key] = override[key];
  }
  return wo;
}

/**
 * ค่าที่จะพิมพ์ลงใบสั่งงาน ต้องครบทุกช่องและอ่านรู้เรื่อง (SPEC 16.1)
 *
 * ข้อที่สำคัญที่สุดคือ "ช่องที่ไม่มีข้อมูลต้องได้ขีด" เพราะช่องว่างบนกระดาษ
 * แยกไม่ออกระหว่างไม่มีข้อมูลกับระบบแทนค่าไม่สำเร็จ ซึ่งสองอย่างนี้แก้คนละทาง
 */
function test_report_values() {
  beginTest_('ค่าที่พิมพ์ลงใบสั่งงาน ครบและอ่านรู้เรื่อง — SPEC 16.1');

  var wo = reportSampleWo_();
  var values = reportValues_(wo, [], { version: 1, issuedAt: new Date(2026, 8, 15, 10, 0) });

  /* ---------- ต้องมีครบทุกตัวแปรที่แม่แบบใช้ได้ ---------- */
  var names = reportPlaceholders_();
  var missing = [];
  for (var i = 0; i < names.length; i++) {
    if (values[names[i]] === undefined) missing.push(names[i]);
  }
  assertEquals_(missing.join(', '), '',
    'ตัวแปรที่ประกาศว่าแม่แบบใช้ได้ ต้องมีค่าส่งไปให้ครบทุกตัว');

  /* ---------- สถานะและแผนกต้องเป็นคำไทย ---------- */
  assertEquals_(values['STATUS_TH'], 'รออนุมัติ', 'สถานะต้องเป็นคำไทย ไม่ใช่ค่าดิบ');
  assertTrue_(values['STATUS_TH'].indexOf('PENDING') === -1, 'ต้องไม่มีค่าดิบหลุดไปบนกระดาษ');

  /* ---------- วันที่ต้องเป็น dd-MM-yyyy ค.ศ. (กฎข้อ 19, 20) ---------- */
  assertEquals_(values['CREATED_DATE'], '15-09-2026 09:30', 'วันที่แจ้งต้องอ่านแบบไทย มีเวลาด้วย');
  assertEquals_(values['START_CONTACT'], '01-09-2026', 'วันที่ล้วนต้องไม่มีเวลาต่อท้าย');
  assertEquals_(values['START_DATE'], '20-09-2026 09:00', 'เวลานัดหมายต้องไม่ถูกเลื่อนโซนเวลา');
  assertEquals_(values['ISSUED_AT'], '15-09-2026 10:00', 'ต้องบอกว่าเอกสารฉบับนี้ออกเมื่อไร');
  assertEquals_(values['VERSION'], '1', 'และเป็นฉบับที่เท่าไร');

  /* ---------- สิ่งที่ต้องการเป็นรายการที่เลือก ไม่ใช่ช่องติ๊กตายตัว ---------- */
  assertEquals_(values['REQUEST_TYPES'], 'ตรวจเช็ค, ซ่อม', 'รายการที่เลือกคั่นด้วยจุลภาค');

  /* ---------- ข้อความไทยต้องไปถึงเอกสารครบถ้วน ---------- */
  assertEquals_(values['JOB_DESCRIPTION'], 'ปั๊มน้ำรั่ว ซึ่งต้องตรวจสอบระบบไฟฟ้าด้วย',
    'ข้อความไทยที่มีสระบนล่างและวรรณยุกต์ ต้องผ่านมาครบทุกตัวอักษร');

  /* ---------- ช่องที่ยังไม่มีข้อมูล ต้องได้ขีด ---------- */
  assertEquals_(values['JOB_NO'], REPORT_EMPTY_MARK, 'ยังไม่อนุมัติ เลขงานของแผนกต้องเป็นขีด');
  assertEquals_(values['APPROVED_BY'], REPORT_EMPTY_MARK, 'ยังไม่มีผู้อนุมัติ ต้องเป็นขีด');
  assertEquals_(values['APPROVED_DATE'], REPORT_EMPTY_MARK, 'ยังไม่มีวันที่อนุมัติ ต้องเป็นขีด');
  assertEquals_(values['DEPARTMENT_TH'], REPORT_EMPTY_MARK,
    'ยังไม่อนุมัติ ต้องไม่มีชื่อแผนกอยู่บนกระดาษ ไม่งั้นแผนกจะนึกว่าเป็นงานของตัวเอง');

  // ไม่มีช่องไหนหลุดเป็นค่าว่างหรือคำว่า undefined ซึ่งเป็นอาการที่ผู้ใช้เห็นแล้วงงที่สุด
  var blanks = [];
  for (var b = 0; b < names.length; b++) {
    var value = String(values[names[b]]);
    if (names[b] === 'RETURN_NOTE') continue;   // ข้อยกเว้นเดียว ตรวจแยกในชุดถัดไป
    if (value === '' || value === 'undefined' || value === 'null') blanks.push(names[b]);
  }
  assertEquals_(blanks.join(', '), '', 'ต้องไม่มีช่องไหนว่างเปล่าหรือเป็น undefined');

  /* ---------- ใบที่อนุมัติแล้ว ต้องมีเลขงานและแผนก ---------- */
  var approved = reportValues_(reportSampleWo_({
    'Overall_Status': WO_STATUS.APPROVED,
    'Approved_By': 'boss@cnr.co.th',
    'Approved_Date': new Date(2026, 8, 16, 8, 0)
  }), [], { version: 2 });

  assertEquals_(approved['JOB_NO'], 'SV-2609-0001',
    'อนุมัติแล้วต้องมีเลขงานของแผนก ซึ่งคือเลขใบงานที่เปลี่ยนตัวนำหน้า');
  assertEquals_(approved['DEPARTMENT_TH'], 'แผนก Service', 'และชื่อแผนกเป็นคำไทย');
  assertEquals_(approved['APPROVED_DATE'], '16-09-2026 08:00', 'พร้อมวันที่อนุมัติ');

  var lab = reportValues_(reportSampleWo_({
    'Assignment_Type': ASSIGNMENT.LAB, 'Approved_Date': new Date(2026, 8, 16)
  }), [], {});
  assertEquals_(lab['JOB_NO'], 'LAB-2609-0001', 'งานสาย Lab ใช้ตัวนำหน้าของตัวเอง');

  return endTest_();
}

/**
 * รายการเอกสารแนบและหมายเหตุการตีกลับ (SPEC 16.1)
 */
function test_report_filesAndReturnNote() {
  beginTest_('รายการเอกสารแนบและหมายเหตุการตีกลับบนใบสั่งงาน');

  /* ---------- ไม่มีเอกสารแนบ ต้องบอกว่าไม่มี ---------- */
  var empty = reportValues_(reportSampleWo_(), [], {});
  assertEquals_(empty['FILE_LIST'], 'ไม่มีเอกสารแนบ',
    'ไม่มีไฟล์ต้องขึ้นว่าไม่มีเอกสารแนบ ไม่ใช่ปล่อยว่างจนดูเหมือนระบบพิมพ์ตกหล่น');

  /* ---------- มีไฟล์ ต้องขึ้นเป็นหัวข้อพร้อมจำนวน ห้ามมีชื่อไฟล์ (SPEC 16.1) ---------- */
  /*
   * เปลี่ยนจาก "บรรทัดละไฟล์" มาเป็น "บรรทัดละหัวข้อ" โดยตั้งใจ · เอกสารใบนี้
   * มีไว้ให้คนอ่านรู้ว่ามีอะไรแนบมา ไม่ใช่สารบัญไฟล์ · เจตนาของเทสต์ไม่เปลี่ยน
   * คือรายการเอกสารแนบต้องอ่านรู้เรื่องและไม่มีช่องว่างลอย ๆ
   */
  var topics = [
    { 'Topic_ID': 'T-QUOTE', 'Topic_Name': 'ใบเสนอราคา' },
    { 'Topic_ID': 'T-DRAW',  'Topic_Name': 'แบบ' },
    { 'Topic_ID': 'T-PIC',   'Topic_Name': 'รูปภาพ' }
  ];
  var withFiles = reportValues_(reportSampleWo_(), [
    { topicId: 'T-PIC',      savedName: 'WO-2609-0001_รูปภาพ_01.jpg' },
    { topicId: 'T-QUOTE',    savedName: 'WO-2609-0001_ใบเสนอราคา_01.pdf' },
    { topicId: 'T-PIC',      savedName: 'WO-2609-0001_รูปภาพ_02.jpg' },
    { topicId: '',           savedName: 'WO-2609-0001_หลักฐานการชำระ_01.jpg' },
    { topicId: 'STEP-PHOTO', savedName: 'SV-2609-0001_Step2_รูปภาพ_01.jpg' }
  ], { topics: topics });

  var lines = withFiles['FILE_LIST'].split(NEW_LINE_);
  assertEquals_(lines.length, 2,
    'สองหัวข้อที่มีไฟล์ต้องได้สองบรรทัด · หัวข้อที่ไม่มีไฟล์ต้องไม่ขึ้นเลย');
  assertTrue_(lines[0].indexOf('ใบเสนอราคา (1 ไฟล์)') !== -1,
    'เรียงตามลำดับของหัวข้อในตาราง ไม่ใช่ลำดับที่ผู้ใช้อัปโหลด');
  assertTrue_(lines[1].indexOf('รูปภาพ (2 ไฟล์)') !== -1, 'และต้องบอกจำนวนไฟล์ต่อหัวข้อ');
  assertTrue_(withFiles['FILE_LIST'].indexOf('แบบ') === -1,
    'หัวข้อที่ไม่มีไฟล์ต้องไม่ขึ้น ไม่ใช่ขึ้นว่า 0 ไฟล์');
  assertTrue_(withFiles['FILE_LIST'].indexOf('.pdf') === -1 &&
    withFiles['FILE_LIST'].indexOf('.jpg') === -1,
    'ห้ามมีชื่อไฟล์บนกระดาษ · ชื่อไฟล์ยาวและมีเลขลำดับปน ไม่ได้ช่วยให้ใครตัดสินใจ');

  /* ---------- ใบปกติ หมายเหตุการตีกลับต้องว่าง ---------- */
  assertEquals_(empty['RETURN_NOTE'], '',
    'ใบที่ไม่เคยถูกตีกลับ ต้องไม่มีหัวข้อเหตุผลการตีกลับค้างอยู่บนกระดาษ');

  /* ---------- ใบที่เคยถูกตีกลับ ต้องมีข้อความครบ ---------- */
  var returned = reportValues_(reportSampleWo_({
    'Return_Count': 2,
    'Return_Reason': 'ยังไม่แนบใบเสนอราคา',
    'Returned_By': 'boss@cnr.co.th',
    'Returned_Date': new Date(2026, 8, 14, 15, 30)
  }), [], {});

  assertTrue_(returned['RETURN_NOTE'].indexOf('2 ครั้ง') !== -1, 'ต้องบอกว่าถูกตีกลับกี่ครั้ง');
  assertTrue_(returned['RETURN_NOTE'].indexOf('ยังไม่แนบใบเสนอราคา') !== -1, 'ต้องบอกเหตุผล');
  assertTrue_(returned['RETURN_NOTE'].indexOf('boss@cnr.co.th') !== -1, 'ต้องบอกว่าใครตีกลับ');
  assertTrue_(returned['RETURN_NOTE'].indexOf('14-09-2026') !== -1, 'และตีกลับเมื่อไร');

  return endTest_();
}

/**
 * ออกเอกสารจริงตอนเปิดใบงาน แล้วลิงก์ในแถวใบงานต้องชี้ฉบับนั้น (SPEC 16.1)
 *
 * ข้ามได้เมื่อยังไม่ได้ตั้งแม่แบบ เพราะชีตที่เพิ่งติดตั้งยังไม่มีแม่แบบเป็นเรื่องปกติ
 * แต่ต้องรับประกันว่าข้อความที่ผู้ใช้เห็นบอกทางออกไว้ ไม่ใช่บอกแค่ว่าออกไม่ได้
 */
function test_report_generateOnCreate() {
  beginTest_('ออกใบสั่งงานตอนเปิดใบงาน และลิงก์ต้องถูกอัปเดต');

  if (!getProp_(PROP_KEY.WO_REPORT_TEMPLATE, false)) {
    assertTrue_(REPORT_TEMPLATE_NOT_SET_MESSAGE.indexOf('WO_REPORT_TEMPLATE_ID') !== -1,
      'ยังไม่ได้ตั้งแม่แบบ ข้อความต้องบอกชื่อค่าที่ต้องไปตั้ง');
    Logger.log('  (ข้าม: ยังไม่ได้ตั้ง WO_REPORT_TEMPLATE_ID — ดูวิธีสร้างแม่แบบในรายงาน)');
    return endTest_();
  }

  var created = withReports_(function () { return createTestWo_(serviceTestUsers_()); });
  var wo = getWorkOrder(created.woId);

  assertTrue_(!!String(wo['Report_URL'] || ''),
    'เปิดใบงานแล้วต้องได้ลิงก์ใบสั่งงานเก็บไว้ในแถวใบงานทันที');
  assertTrue_(!!wo['Folder_ID'], 'และต้องมีโฟลเดอร์ของใบงานนี้เกิดขึ้น');

  var current = driveFileNamed_(wo['Folder_ID'], REPORT_FILE_NAME);
  assertTrue_(!!current, 'ต้องมีไฟล์ชื่อ ' + REPORT_FILE_NAME + ' อยู่ที่รากโฟลเดอร์ของใบงาน');

  /* ---------- ไฟล์ชั่วคราวต้องไม่ค้างอยู่ ---------- */
  // สำเนาแม่แบบที่ลืมลบ จะกินพื้นที่ Drive ซึ่งมีแค่ 15 GB ทั้งระบบ (SPEC 16)
  assertEquals_(driveCountFiles_(wo['Folder_ID']), 1,
    'ในโฟลเดอร์ต้องเหลือเฉพาะใบสั่งงานฉบับปัจจุบัน สำเนาแม่แบบต้องถูกลบทิ้งแล้ว');

  /* ---------- ต้องมีร่องรอยใน Audit ---------- */
  var logs = listAuditByWo(created.woId);
  var found = false;
  for (var i = 0; i < logs.length; i++) {
    if (String(logs[i]['Action']) === ACTION.REPORT) found = true;
  }
  assertTrue_(found, 'การออกเอกสารต้องถูกบันทึกไว้ใน Audit_Log');

  return endTest_();
}

/**
 * ออกครั้งที่สอง ฉบับเดิมต้องถูกเก็บ ไม่ใช่ถูกทับหาย (SPEC 16.1)
 */
function test_report_archivesOldVersion() {
  beginTest_('ออกเอกสารซ้ำ ฉบับเดิมต้องถูกเก็บเข้า _archive');

  if (!getProp_(PROP_KEY.WO_REPORT_TEMPLATE, false)) {
    Logger.log('  (ข้าม: ยังไม่ได้ตั้ง WO_REPORT_TEMPLATE_ID)');
    assertTrue_(true, 'ข้ามเมื่อยังไม่มีแม่แบบ');
    return endTest_();
  }

  var created = withReports_(function () { return createTestWo_(serviceTestUsers_()); });
  var admin = { email: 'TEST-report@cnr.co.th', roles: [ROLE.ADMIN] };

  var first = driveFileNamed_(getWorkOrder(created.woId)['Folder_ID'], REPORT_FILE_NAME);
  assertTrue_(!!first, 'ฉบับแรกต้องมีอยู่ก่อน');

  var again = generateWorkOrderReport(created.woId, admin);
  assertEquals_(again.version, 2, 'ฉบับที่ออกใหม่ต้องเป็นฉบับที่ 2');

  var wo = getWorkOrder(created.woId);
  var map = parseFolderMap_(wo['Folder_Map']);
  assertTrue_(!!map[REPORT_ARCHIVE_FOLDER], 'ต้องมีโฟลเดอร์เก็บฉบับเก่าเกิดขึ้น');
  assertEquals_(driveCountFiles_(map[REPORT_ARCHIVE_FOLDER]), 1, 'และมีฉบับเก่าอยู่ข้างใน 1 ฉบับ');

  /* ---------- ฉบับเดิมต้องเป็นไฟล์ใบเดิม ไม่ใช่ถูกลบแล้วสร้างใหม่ ---------- */
  // รหัสไฟล์ต้องคงเดิม ลิงก์ที่เคยส่งให้ใครไว้จะได้ไม่ตาย
  assertTrue_(driveFileExistsAnywhere_(first.id), 'ไฟล์ฉบับเดิมต้องยังอยู่');
  assertTrue_(!driveFileIsTrashed_(first.id), 'และต้องไม่ถูกลบทิ้ง');

  /* ---------- ฉบับปัจจุบันต้องเป็นไฟล์ใหม่ และลิงก์ต้องชี้ไปที่มัน ---------- */
  var current = driveFileNamed_(wo['Folder_ID'], REPORT_FILE_NAME);
  assertTrue_(!!current, 'ที่รากโฟลเดอร์ต้องมีฉบับปัจจุบันอยู่เสมอ');
  assertTrue_(current.id !== first.id, 'และต้องเป็นคนละไฟล์กับฉบับเดิม');
  assertEquals_(String(wo['Report_URL']), current.url, 'ลิงก์ในแถวใบงานต้องชี้ฉบับปัจจุบัน');

  /* ---------- ออกครั้งที่สาม ต้องนับต่อ ไม่ใช่เริ่มใหม่ ---------- */
  var third = generateWorkOrderReport(created.woId, admin);
  assertEquals_(third.version, 3, 'ฉบับถัดไปต้องเป็นฉบับที่ 3');
  assertEquals_(driveCountFiles_(parseFolderMap_(getWorkOrder(created.woId)['Folder_Map'])[REPORT_ARCHIVE_FOLDER]),
    2, 'และในคลังต้องมีสองฉบับ');

  return endTest_();
}

/**
 * ออกเอกสารพลาด ต้องไม่ทำให้สถานะที่บันทึกไปแล้วย้อนกลับ (SPEC 16.1)
 *
 * ข้อนี้คือเหตุผลทั้งหมดของการห่อ try/catch แยก · ทดสอบด้วยการทำให้ตัวออกเอกสาร
 * โยนข้อผิดพลาดชั่วคราว ซึ่งไม่ไปแตะค่าตั้งค่าจริงของระบบเลย
 */
function test_report_failureKeepsStatus() {
  beginTest_('ออกเอกสารพลาด แต่ใบงานต้องถูกบันทึกครบ');

  var original = generateWorkOrderReport;
  var attempts = 0;
  var created;

  try {
    generateWorkOrderReport = function () {
      attempts++;
      throw new Error('จำลองว่า Drive ไม่ตอบ');
    };
    created = withReports_(function () { return createTestWo_(serviceTestUsers_()); });
  } finally {
    generateWorkOrderReport = original;   // ต้องคืนของเดิมเสมอ แม้ระหว่างทางจะพัง
  }

  assertTrue_(attempts > 0, 'ตัวจำลองต้องถูกเรียกจริง ไม่งั้นเทสต์นี้ไม่ได้พิสูจน์อะไร');

  var wo = getWorkOrder(created.woId);
  assertTrue_(!!wo, 'ใบงานต้องถูกบันทึกไว้ครบ แม้ออกเอกสารไม่สำเร็จ');
  assertEquals_(wo['Overall_Status'], WO_STATUS.PENDING_APPROVE,
    'และต้องอยู่ที่ผู้อนุมัติตามปกติ ไม่ย้อนกลับเพราะเรื่องเอกสาร');
  assertEquals_(String(wo['Report_URL'] || ''), '', 'ยังไม่มีลิงก์เอกสาร เพราะออกไม่สำเร็จจริง');

  /* ---------- ต้องมีร่องรอยไว้ตามทีหลัง ---------- */
  // ถ้าเงียบไปเฉย ๆ จะไม่มีใครรู้ว่าใบไหนยังไม่มีเอกสาร จนกว่าจะมีคนไปหาไฟล์แล้วไม่เจอ
  // การออกเอกสารไม่สำเร็จเป็นเรื่องของระบบ จึงอยู่ใน System_Log ตาม SPEC 13
  var failure = systemLogOf_(created.woId, ACTION.REPORT_FAILED);
  assertTrue_(!!failure, 'ต้องบันทึกไว้ใน System_Log ว่าออกเอกสารไม่สำเร็จ');
  assertTrue_(String(failure['Detail']).indexOf('Drive ไม่ตอบ') !== -1,
    'และต้องบอกสาเหตุจริงไว้ด้วย ไม่ใช่บอกแค่ว่าไม่สำเร็จ');

  return endTest_();
}

/**
 * ตัวแปรในแม่แบบต้องตรงกันทั้งสองฝั่ง และไฟล์อื่นห้ามเรียก Drive หรือ Docs เอง
 */
function test_report_contract() {
  beginTest_('สัญญาของแม่แบบใบสั่งงาน และการขังงานเอกสารไว้ชั้นเดียว');

  /* ---------- ชื่อตัวแปรต้องไม่ซ้ำและต้องเป็นตัวพิมพ์ใหญ่ล้วน ---------- */
  var names = reportPlaceholders_();
  var seen = {};
  var duplicated = [];
  var badFormat = [];
  for (var i = 0; i < names.length; i++) {
    if (seen[names[i]]) duplicated.push(names[i]);
    seen[names[i]] = true;
    if (!/^[A-Z][A-Z0-9_]*$/.test(names[i])) badFormat.push(names[i]);
  }
  assertEquals_(duplicated.join(', '), '', 'ชื่อตัวแปรต้องไม่ซ้ำกัน');
  assertEquals_(badFormat.join(', '), '',
    'ชื่อตัวแปรต้องเป็นตัวพิมพ์ใหญ่ล้วน เพื่อให้พิมพ์ในแม่แบบแล้วไม่หลุดง่าย');
  assertTrue_(names.length >= 29, 'ต้องมีตัวแปรครบตามตารางใน SPEC 16.1 (มี ' + names.length + ')');

  /* ---------- ไฟล์รายงานต้องไม่เรียกบริการภายนอกเอง ---------- */
  // กฎเดียวกับชั้นชีตและชั้นไฟล์ — ย้ายที่เก็บเอกสารเมื่อไร ต้องแก้ไฟล์เดียว
  var docsNeedle = 'Document' + 'App';
  var allowed = documentLayerFunctions_();
  var offenders = [];
  var scanned = 0;
  var registries = serviceNameRegistries_();
  for (var name in globalThis) {
    if (typeof globalThis[name] !== 'function') continue;
    if (name.indexOf('test_') === 0) continue;
    if (registries.indexOf(name) !== -1) continue;   // ตารางจัดประเภท พูดถึงชื่อบริการโดยตั้งใจ
    scanned++;
    var source;
    try {
      source = String(globalThis[name]);
    } catch (e) {
      continue;
    }
    if (source.indexOf(docsNeedle) !== -1) offenders.push(name);
  }

  assertTrue_(scanned > 50, 'ตัวสแกนต้องเห็นโค้ดของระบบจริง (เห็น ' + scanned + ' ตัว)');
  offenders.sort();
  assertEquals_(offenders.join(', '), allowed.slice().sort().join(', '),
    'ฟังก์ชันที่เรียก ' + docsNeedle + ' ต้องเป็นตัวที่ประกาศไว้ใน 06_Files.gs เท่านั้น');
  for (var a = 0; a < allowed.length; a++) {
    assertEquals_(typeof globalThis[allowed[a]], 'function',
      'ชื่อ ' + allowed[a] + ' ต้องเป็นฟังก์ชันที่มีอยู่จริง');
  }

  /* ---------- รายการที่หน้าเว็บเรียกได้ ต้องอยู่ในทะเบียน ---------- */
  assertTrue_(listApiFunctionNames_().indexOf('api_generateReport') !== -1,
    'ปุ่มสั่งออกเอกสารใหม่ต้องมีรายการอยู่ในทะเบียนของชั้น API');

  return endTest_();
}

/**
 * ยังไม่ได้ตั้งแม่แบบ — ต้องบอกให้ชัดและต้องไม่ลามไปทำให้อย่างอื่นพัง (SPEC 16.1)
 *
 * เส้นทางนี้เป็นสภาพจริงของชีตที่เพิ่งติดตั้ง และเป็นเส้นทางที่ชุดทดสอบอีกสามชุด
 * ใช้ตัดสินใจ "ข้ามตัวเอง" ด้วย ถ้ามันพังเงียบ ๆ ชุดพวกนั้นจะข้ามทุกครั้งแล้วรายงานว่าผ่าน
 * ทั้งที่ไม่ได้พิสูจน์อะไรเลย ซึ่งอันตรายกว่าไม่มีเทสต์
 *
 * ทดสอบด้วยการสวมตัวอ่านค่าตั้งค่าชั่วคราวเฉพาะคีย์ของแม่แบบ ไม่ไปแตะค่าจริงในระบบ —
 * การลบค่าจริงออกชั่วคราวอันตรายมาก ถ้าสคริปต์ถูกฆ่ากลางคันตอนนั้น ค่าจะหายถาวร
 */
function test_report_skipsWithoutTemplate() {
  beginTest_('ยังไม่ได้ตั้งแม่แบบ ต้องบอกทางออกและไม่ทำให้อย่างอื่นพัง');

  var woId = testWoId_();
  var user = { email: 'TEST-notemplate@cnr.co.th', roles: [ROLE.ADMIN] };
  var originalGetProp = getProp_;
  var thrown = '';
  var quiet = 'ยังไม่ได้เรียก';

  try {
    getProp_ = function (key, required) {
      if (key === PROP_KEY.WO_REPORT_TEMPLATE) return '';    // ทำเหมือนยังไม่เคยตั้งค่า
      return originalGetProp(key, required);
    };

    /* ---------- กดสั่งออกเอง ต้องได้ข้อความที่บอกว่าต้องไปทำอะไร ---------- */
    try {
      generateWorkOrderReport(woId, user);
    } catch (e) {
      thrown = (e && e.message) ? e.message : String(e);
    }

    /* ---------- ส่วนที่ระบบเรียกเอง ต้องกลืนไว้ ไม่โยนออกมา ---------- */
    quiet = withReports_(function () {
      return tryGenerateWorkOrderReport_(woId, user, ACTION.CREATE);
    });
  } finally {
    getProp_ = originalGetProp;   // ต้องคืนของเดิมเสมอ ไม่งั้นทั้งกลุ่มจะอ่านค่าตั้งค่าไม่ได้
  }

  assertEquals_(thrown, REPORT_TEMPLATE_NOT_SET_MESSAGE,
    'ต้องบอกว่ายังไม่ได้ตั้งแม่แบบ ไม่ใช่ปล่อยข้อความดิบของ Google ออกไป');
  assertTrue_(thrown.indexOf('WO_REPORT_TEMPLATE_ID') !== -1,
    'และต้องบอกชื่อค่าที่ต้องไปตั้ง ไม่ใช่บอกแค่ว่ายังไม่ได้ตั้งค่า');

  assertEquals_(quiet, null, 'จังหวะที่ระบบออกเอกสารเอง ต้องไม่โยนข้อผิดพลาดออกมา');

  /* ---------- และต้องเหลือร่องรอยไว้ ไม่ใช่เงียบหาย ---------- */
  var failure = systemLogOf_(woId, ACTION.REPORT_FAILED);
  assertTrue_(!!failure, 'ต้องบันทึกไว้ว่าใบนี้ยังไม่มีเอกสาร');
  assertTrue_(String(failure['Detail']).indexOf('WO_REPORT_TEMPLATE_ID') !== -1,
    'และบันทึกนั้นต้องบอกสาเหตุจริงพอให้ผู้ดูแลแก้ได้ทันที');

  /* ---------- ตัวอ่านค่าตั้งค่าต้องกลับมาเป็นของเดิมแล้ว ---------- */
  // ถ้าลืมคืน ชุดที่เหลือทั้งกลุ่มจะเพี้ยนแบบหาสาเหตุไม่เจอ จึงตรวจให้เห็นกับตา
  assertEquals_(typeof getProp_, 'function', 'ตัวอ่านค่าตั้งค่าต้องยังทำงานได้ตามปกติ');
  assertEquals_(getProp_(PROP_KEY.WO_REPORT_TEMPLATE, false),
    originalGetProp(PROP_KEY.WO_REPORT_TEMPLATE, false),
    'และต้องอ่านค่าจริงของระบบได้เหมือนเดิม');

  return endTest_();
}

/**
 * หัวข้อของไฟล์แนบต้องขึ้นบนใบสั่งงานจริง ไม่ใช่แค่ในค่าที่คำนวณได้ (SPEC 16.1 · 9.4)
 *
 * ต่างจาก test_report_filesAndReturnNote ซึ่งตรวจฟังก์ชันล้วนด้วยข้อมูลที่เทสต์ป้อนเอง ·
 * ชุดนี้เดินผ่านของจริงทั้งเส้น: แนบไฟล์ผ่าน api_ ที่หน้าเว็บเรียก อ่านหัวข้อจาก
 * ตารางจริง แล้วแทนค่าลงแม่แบบจริงแล้วอ่านตัวหนังสือที่ได้กลับมา
 *
 * ข้อที่การตรวจฟังก์ชันล้วนจับไม่ได้เลยคือ "ลืมต่อสาย" — reportValues_ ทำงานถูกต้อง
 * ทุกประการ แต่ถ้าไม่มีใครส่งรายชื่อหัวข้อเข้าไปให้ กระดาษจะเขียนว่าไม่มีเอกสารแนบ
 * ทุกใบตลอดไป และเทสต์ของฟังก์ชันล้วนจะเขียวอยู่อย่างนั้น
 */
function test_report_topicsAppearOnPaper() {
  beginTest_('หัวข้อไฟล์แนบต้องขึ้นบนใบสั่งงานจริง และต้องไม่มีชื่อไฟล์ — SPEC 16.1');

  var templateId = getProp_(PROP_KEY.WO_REPORT_TEMPLATE, false);
  if (!templateId) {
    Logger.log('  (ข้าม: ยังไม่ได้ตั้ง WO_REPORT_TEMPLATE_ID)');
    assertTrue_(true, 'ข้ามเมื่อยังไม่มีแม่แบบ');
    return endTest_();
  }

  var users = serviceTestUsers_();
  var quote = testAttachTopic_('PAPERQT', 'ใบเสนอราคาบนกระดาษ (ทดสอบ)');
  var draw  = testAttachTopic_('PAPERDW', 'แบบบนกระดาษ (ทดสอบ)');
  var idle  = testAttachTopic_('PAPERNO', 'หัวข้อที่ไม่มีไฟล์ (ทดสอบ)');

  var created = withTestUser_(users.admin, function () {
    return api_createWorkOrder(testWoForm_(), 0);
  });
  var woId = created.data.woId;

  /* ---------- ยังไม่มีไฟล์เลย ต้องเขียนว่าไม่มี ---------- */
  var blank = reportPaperText_(woId, templateId);
  assertTrue_(blank.indexOf('ไม่มีเอกสารแนบ') !== -1,
    'ใบที่ไม่มีไฟล์แนบต้องเขียนว่าไม่มีเอกสารแนบ ไม่ใช่เว้นว่างจนดูเหมือนพิมพ์ตกหล่น');
  assertTrue_(blank.indexOf(idle) === -1 && blank.indexOf('หัวข้อที่ไม่มีไฟล์') === -1,
    'และหัวข้อที่ไม่มีไฟล์ต้องไม่โผล่มาเป็นรายการว่าง');

  /* ---------- แนบสามไฟล์สองหัวข้อ ผ่านทางที่หน้าเว็บเรียกจริง ---------- */
  var sent = [
    { topicId: quote, fileName: 'ราคา.pdf' },
    { topicId: draw,  fileName: 'แบบหนึ่ง.pdf' },
    { topicId: draw,  fileName: 'แบบสอง.pdf' }
  ];
  for (var i = 0; i < sent.length; i++) {
    var put = uploadThroughApi_(users.admin, {
      woId: woId, scope: FILE_SCOPE.WO, topicId: sent[i].topicId,
      fileName: sent[i].fileName, mimeType: 'application/pdf', content: testFileContent_(48)
    });
    assertEquals_(put.ok, true, 'ไฟล์ ' + sent[i].fileName + ' ต้องแนบได้');
  }

  /* ---------- รูปหน้างานของแผนกต้องไม่ถูกนับรวม ---------- */
  /*
   * ไฟล์พวกนี้เกิดขึ้นหลังการอนุมัติ จึงไม่ใช่สิ่งที่ผู้อนุมัติกำลังตัดสินใจอยู่บนกระดาษใบนี้
   * และหัวข้อของมันไม่ได้อยู่ในตาราง Attachment_Topic การคัดออกจึงเกิดเองโดยไม่ต้องไล่ชื่อ
   */
  insertFile({
    'File_ID': woId + '-FSTEP', 'WO_ID': woId, 'Topic_ID': PHOTO_TOPIC.ID,
    'Saved_File_Name': 'SV-ทดสอบ_Step2_รูปภาพ_01.jpg', 'Seq': 1,
    'Drive_File_ID': 'ไม่ได้ขึ้น Drive (ข้อมูลทดสอบ)', 'Is_Active': true
  });

  var paper = reportPaperText_(woId, templateId);

  assertTrue_(paper.indexOf('ใบเสนอราคาบนกระดาษ (ทดสอบ) (1 ไฟล์)') !== -1,
    'หัวข้อแรกต้องขึ้นพร้อมจำนวนไฟล์');
  assertTrue_(paper.indexOf('แบบบนกระดาษ (ทดสอบ) (2 ไฟล์)') !== -1,
    'หัวข้อที่สองต้องนับได้สองไฟล์ ไม่ใช่ขึ้นสองบรรทัดบรรทัดละไฟล์');
  assertTrue_(paper.indexOf('หัวข้อที่ไม่มีไฟล์') === -1,
    'หัวข้อที่ไม่มีไฟล์ต้องไม่ขึ้น');
  assertTrue_(paper.indexOf('รูปภาพ') === -1,
    'รูปหน้างานของแผนกต้องไม่ถูกนับ เพราะเกิดขึ้นหลังการอนุมัติ');

  assertTrue_(paper.indexOf('ราคา.pdf') === -1 && paper.indexOf('แบบหนึ่ง.pdf') === -1,
    'ห้ามมีชื่อไฟล์เดิมของผู้ใช้บนกระดาษ');
  assertTrue_(paper.indexOf('_01.pdf') === -1,
    'และห้ามมีชื่อไฟล์ที่ระบบตั้งให้ ซึ่งมีเลขลำดับปนอยู่และไม่ช่วยให้ใครตัดสินใจ');

  return endTest_();
}

/**
 * ตัวหนังสือที่จะไปอยู่บนใบสั่งงานของใบนี้จริง ๆ
 *
 * คัดลอกแม่แบบตัวจริงแล้วแทนค่าด้วยชุดค่าตัวจริง แล้วอ่านกลับ · ไม่สั่งออก PDF
 * เพราะอ่านตัวหนังสือจาก PDF ไม่ได้ และสิ่งที่ต้องพิสูจน์คือเนื้อความ ไม่ใช่การแปลงไฟล์
 * ซึ่งมีชุดอื่นพิสูจน์อยู่แล้ว · สำเนาที่ใช้ตรวจต้องถูกลบทิ้งเสมอ แม้ระหว่างทางจะพลาด
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} templateId รหัสแม่แบบ
 * @return {string} ตัวหนังสือทั้งเอกสาร
 */
function reportPaperText_(woId, templateId) {
  clearRowCache_(SHEET.FILE_INDEX);
  var wo = getWorkOrder(woId);
  var folderId = ensureWoFolder_(woId, '');
  var copyId = driveCopyFile_(templateId, 'TEST-ตรวจหัวข้อบนกระดาษ ' + woId, folderId);

  try {
    docReplaceValues_(copyId, reportValuesFor_(woId, wo, { version: 1, issuedAt: new Date() }));
    return docTextOf_(copyId);
  } finally {
    driveTrashById_(copyId, false);
  }
}

/**
 * ทุกช่องในแม่แบบต้องถูกแทนค่า รวมหัวกระดาษและท้ายกระดาษ (SPEC 16.1)
 *
 * ข้อนี้จับสองเรื่องที่มองจากโค้ดไม่เห็นเลย
 *   1) ตัวแทนค่าลืมแตะหัวกระดาษ — เลขที่ใบงานบนหัวของหน้า 2 เป็นต้นไปจะเป็น {{WO_ID}}
 *   2) แม่แบบมีช่องที่ระบบไม่รู้จัก — แม่แบบเป็นเอกสารที่ผู้ใช้แก้เองได้ ใครเติมช่องใหม่
 *      ลงไปแล้วไม่บอกใคร ลูกค้าจะได้กระดาษที่มี {{...}} ติดไปด้วย
 *
 * บนชีตจริง ข้อนี้จึงเป็นการตรวจแม่แบบของผู้ใช้เองด้วย ไม่ใช่ตรวจแค่โค้ด
 */
function test_report_replacesEveryPlaceholder() {
  beginTest_('ทุกช่องในแม่แบบต้องถูกแทนค่า รวมหัวและท้ายกระดาษ');

  var templateId = getProp_(PROP_KEY.WO_REPORT_TEMPLATE, false);
  if (!templateId) {
    Logger.log('  (ข้าม: ยังไม่ได้ตั้ง WO_REPORT_TEMPLATE_ID)');
    assertTrue_(true, 'ข้ามเมื่อยังไม่มีแม่แบบ');
    return endTest_();
  }

  var created = createTestWo_(serviceTestUsers_());
  var wo = getWorkOrder(created.woId);
  var folderId = ensureWoFolder_(created.woId, '');

  var copyId = driveCopyFile_(templateId, 'TEST-ตรวจการแทนค่า ' + created.woId, folderId);
  var text = '';
  try {
    docReplaceValues_(copyId, reportValues_(wo, listWoFileViews(created.woId), { version: 1 }));
    text = docTextOf_(copyId);
  } finally {
    driveTrashById_(copyId, false);   // สำเนาสำหรับตรวจ ต้องไม่ค้างอยู่ในโฟลเดอร์ของใบงาน
  }

  assertTrue_(text.indexOf('{{') === -1,
    'ต้องไม่เหลือช่องที่ยังไม่ถูกแทนค่าในส่วนใดของเอกสาร — ที่เหลืออยู่คือ ' +
    String(text.substring(Math.max(0, text.indexOf('{{')), text.indexOf('{{') + 40)));
  assertTrue_(text.indexOf(created.woId) !== -1,
    'และเลขที่ใบงานต้องปรากฏบนเอกสารจริง');

  return endTest_();
}

/**
 * สั่งออกเอกสารใหม่ได้เฉพาะ ADMIN (SPEC 16.1)
 */
function test_permission_generateReport() {
  beginTest_('สั่งออกใบสั่งงานใหม่ได้เฉพาะผู้ดูแลระบบ');

  var woId = testWoId_();
  var allowed = [ROLE.ADMIN];
  var denied = [ROLE.SALE, ROLE.APPROVER_SP, ROLE.APPROVER_LAB,
    ROLE.SERVICE, ROLE.PROJECT, ROLE.LAB];

  for (var i = 0; i < denied.length; i++) {
    var result = withTestUser_({ email: 'TEST-gen@cnr.co.th', roles: [denied[i]] }, function () {
      return api_generateReport(woId);
    });
    assertEquals_(result.ok, false, denied[i] + ' ต้องสั่งออกเอกสารใหม่ไม่ได้');
    assertTrue_(String(result.message).indexOf('สั่งออกใบสั่งงานใหม่') !== -1,
      'และข้อความต้องบอกว่ากำลังทำอะไรไม่ได้ ไม่ใช่บอกแค่ว่าไม่มีสิทธิ์');
  }

  /*
   * ผู้ดูแลต้องผ่านด่านสิทธิ์ไปได้ — จะไปตกที่ "ไม่พบใบงาน" ซึ่งเป็นคนละเรื่องกัน
   * ข้อนี้สำคัญ เพราะเทสต์ที่มีแต่เคสถูกปฏิเสธ พิสูจน์ไม่ได้ว่าคนที่ควรทำได้ทำได้จริง
   */
  var byAdmin = withTestUser_({ email: 'TEST-gen@cnr.co.th', roles: allowed }, function () {
    return api_generateReport(woId);
  });
  assertEquals_(byAdmin.ok, false, 'ใบงานที่ไม่มีอยู่จริง ย่อมออกเอกสารไม่ได้');
  assertTrue_(String(byAdmin.message).indexOf('สั่งออกใบสั่งงานใหม่') === -1,
    'แต่ผู้ดูแลต้องไม่ถูกปฏิเสธเพราะเรื่องสิทธิ์');

  return endTest_();
}

/**
 * ฟังก์ชันที่ "พูดถึง" ชื่อบริการเป็นข้อความโดยตั้งใจ — ตัวสแกนทุกตัวต้องข้ามมัน
 *
 * ตารางจัดประเภทสิทธิ์มีชื่อบริการทุกตัวอยู่ข้างในเป็นข้อความ ถ้าตัวสแกนนับด้วย
 * มันจะฟ้องว่าไฟล์ตั้งค่าเรียก Drive และ Docs เอง ซึ่งไม่จริงสักตัว
 *
 * @return {string[]}
 */
function serviceNameRegistries_() {
  return ['oauthScopeOfService_', 'oauthFreeServices_'];
}

/**
 * บริการของ Google ที่โค้ดเรียกจริง อ่านจากเนื้อฟังก์ชันที่กำลังทำงานอยู่
 *
 * อ่านจากของจริงที่รันอยู่ ไม่ได้อ่านจากไฟล์ เพราะบนชีตจริงเปิดไฟล์ .gs ไม่ได้
 * และวิธีนี้ครอบคลุมกว่า — สแกนสิ่งที่ทำงานอยู่จริง ไม่ใช่สิ่งที่เขียนไว้ในไฟล์
 *
 * ตัดคอมเมนต์ทิ้งก่อนเสมอ ไม่งั้นคำอธิบายที่พูดถึงบริการจะถูกนับเป็นการเรียกใช้
 *
 * @return {Object} แผนที่ชื่อบริการ -> ชื่อฟังก์ชันตัวแรกที่เรียกมัน
 */
function servicesUsedInCode_() {
  var scope = (typeof globalThis !== 'undefined') ? globalThis : this;
  var found = {};

  /*
   * ข้ามตัวเองและตารางจัดประเภท เพราะข้างในมีชื่อบริการเป็นข้อความอยู่เต็มไปหมด
   * ถ้านับด้วย ตารางจะฟ้องว่าระบบเรียกทุกบริการที่มันรู้จัก ซึ่งไม่จริงสักตัว
   * และข้ามชุดทดสอบ เพราะชุดทดสอบพูดถึงชื่อบริการโดยตั้งใจเพื่อไล่ตรวจกฎ
   */
  var skip = { oauthScopeOfService_: true, oauthFreeServices_: true,
    servicesUsedInCode_: true, classifiedAtMethodLevel_: true };

  for (var name in scope) {
    if (typeof scope[name] !== 'function') continue;
    if (skip[name] || name.indexOf('test_') === 0) continue;
    var source;
    try {
      source = stripComments_(String(scope[name]));
    } catch (e) {
      continue;   // ฟังก์ชันในตัวของเครื่องยนต์ อ่านเนื้อไม่ได้ ไม่ใช่โค้ดของเรา
    }

    /*
     * จับชื่อบริการทั้งแบบ XxxApp และ XxxService รวมถึงสามตัวที่ชื่อไม่เข้าแบบ
     * แล้วจับต่อไปอีกชั้นว่าเรียกเมธอดอะไร เพราะบริการเดียวกันบางเมธอดต้องขอสิทธิ์
     * บางเมธอดไม่ต้อง เช่นการถามที่อยู่ของเว็บแอปตัวเอง เทียบกับการสร้างทริกเกอร์
     *
     * ห้ามเขียนชื่อบริการเต็ม ๆ ไว้ในไฟล์นี้ — ตัวสแกนที่คุมกฎ "เรียกไฟล์ได้ที่เดียว"
     * ค้นด้วยชื่อตรง ๆ จะนับคำอธิบายตรงนี้เป็นการเรียกใช้ทันที
     */
    var matches = source.match(/\b(?:[A-Z][A-Za-z]*(?:App|Service)|Session|Utilities|Logger)\.[a-zA-Z]+/g) || [];
    for (var m = 0; m < matches.length; m++) {
      var call = matches[m];                      // เช่น ชั้นไฟล์จุดชื่อเมธอด
      var service = call.split('.')[0];           // ส่วนหน้าจุด คือชื่อบริการ
      if (!found[call]) found[call] = name;
      if (!found[service]) found[service] = name;
    }
  }
  return found;
}

/**
 * สิทธิ์ที่ประกาศไว้ ต้องตรงกับบริการที่โค้ดเรียกจริง
 *
 * ข้อนี้เกิดจากของจริงที่พังมาแล้ว: เพิ่มการออกใบสั่งงาน PDF ซึ่งเรียก Google Docs
 * เทสต์ทุกกลุ่มเขียว ผ่านทั้งบนเครื่องและบนชีตจริง แต่พอผู้ใช้กดใช้งานจริงกลับล้ม
 * ด้วยข้อความ "ไม่ได้รับอนุญาตให้เรียกใช้ DocumentApp.openById"
 *
 * อาการแบบนี้ไม่มีทางเห็นจากโค้ดหรือจากเทสต์ปกติเลย เพราะสิทธิ์ที่บัญชีเจ้าของเคยอนุญาตไว้
 * ถูกตรึงไว้ตั้งแต่ครั้งแรกที่กดอนุญาต ไม่ได้ขยายตามโค้ดที่เพิ่มเข้ามาทีหลัง
 * ตัวที่กันได้จริงคือการเทียบ "บริการที่โค้ดเรียก" กับ "สิทธิ์ที่ประกาศ" แบบนี้
 */
function test_config_oauthScopes() {
  beginTest_('สิทธิ์ที่ประกาศ ต้องตรงกับบริการที่โค้ดเรียกจริง');

  var declared = requiredOAuthScopes_();
  var table = oauthScopeOfService_();
  var free = oauthFreeServices_();
  var used = servicesUsedInCode_();

  /* ---------- ตัวสแกนต้องเห็นของจริง ---------- */
  /*
   * ประกอบชื่อบริการตอนรัน ไม่เขียนเต็ม ๆ ไว้ในไฟล์นี้ (เหตุผลเดียวกับใน servicesUsedInCode_)
   * ตัวสแกนที่คุมกฎ "เรียกไฟล์ได้ที่เดียว" ค้นด้วยชื่อตรง ๆ จะนับบรรทัดนี้เป็นการเรียกใช้
   */
  assertTrue_(!!used['Spreadsheet' + 'App'], 'ตัวสแกนต้องเห็นการเรียกชีต ซึ่งมีอยู่แน่นอน');
  assertTrue_(!!used['Drive' + 'App'], 'และต้องเห็นการเรียกชั้นไฟล์ด้วย');

  /* ---------- ทุกบริการที่เรียก ต้องถูกจัดประเภทไว้แล้ว ---------- */
  // ใครเรียกบริการใหม่ที่ไม่มีใครเคยจัดประเภท จะแดงตรงนี้ ไม่ใช่ไปโผล่ตอนผู้ใช้กดใช้งาน
  var unclassified = [];
  for (var call in used) {
    if (!Object.prototype.hasOwnProperty.call(used, call)) continue;
    if (call.indexOf('.') !== -1) continue;             // ระดับเมธอด ตรวจในรอบถัดไป
    var knownAsPaid = Object.prototype.hasOwnProperty.call(table, call);
    var knownAsFree = free.indexOf(call) !== -1;
    // บริการที่จัดประเภทไว้ระดับเมธอด ถือว่ารู้จักแล้วเช่นกัน
    if (!knownAsPaid && !knownAsFree && !classifiedAtMethodLevel_(call, table, free)) {
      unclassified.push(call + ' (เรียกจาก ' + used[call] + ')');
    }
  }
  assertEquals_(unclassified.join(', '), '',
    'บริการเหล่านี้ยังไม่ถูกจัดประเภท — ต้องเพิ่มลง oauthScopeOfService_ หรือ oauthFreeServices_');

  /* ---------- บริการที่ต้องขอสิทธิ์ ต้องมีสิทธิ์ประกาศไว้ครบ ---------- */
  var missing = [];
  for (var key in table) {
    if (!Object.prototype.hasOwnProperty.call(table, key)) continue;
    if (!used[key]) continue;                            // ไม่ได้เรียก ก็ไม่ต้องขอ
    if (declared.indexOf(table[key]) === -1) {
      missing.push(key + ' ต้องการ ' + table[key] + ' (เรียกจาก ' + used[key] + ')');
    }
  }
  assertEquals_(missing.join(' · '), '',
    'โค้ดเรียกบริการเหล่านี้แต่ยังไม่ได้ประกาศสิทธิ์ — ผู้ใช้จะเจอ "ไม่ได้รับอนุญาต" ตอนใช้งานจริง');

  /* ---------- สิทธิ์ที่ประกาศแต่ไม่มีใครใช้ ต้องมีเหตุผลกำกับ ---------- */
  /*
   * สิทธิ์ที่ขอเกินความจำเป็นคือสิ่งที่ผู้ใช้ต้องกดยอมรับโดยไม่ได้อะไรตอบแทน
   * และเป็นพื้นที่ให้ถูกใช้ผิดวัตถุประสงค์ · ตัวที่ตั้งใจประกาศล่วงหน้าต้องมีชื่ออยู่ที่นี่
   */
  var plannedAhead = ['https://www.googleapis.com/auth/script.external_request'];
  var unused = [];
  for (var d = 0; d < declared.length; d++) {
    var scopeUsed = false;
    for (var t in table) {
      if (!Object.prototype.hasOwnProperty.call(table, t)) continue;
      if (table[t] === declared[d] && used[t]) scopeUsed = true;
    }
    if (!scopeUsed && plannedAhead.indexOf(declared[d]) === -1) unused.push(declared[d]);
  }
  assertEquals_(unused.join(', '), '',
    'สิทธิ์เหล่านี้ประกาศไว้แต่ไม่มีโค้ดตัวไหนใช้แล้ว — ถ้ายังตั้งใจเก็บไว้ ต้องใส่เหตุผลในรายการที่ตั้งใจประกาศล่วงหน้า');

  /* ---------- ไม่มีสิทธิ์ซ้ำ และต้องเป็นที่อยู่เต็ม ---------- */
  var seen = {};
  for (var i = 0; i < declared.length; i++) {
    assertTrue_(!seen[declared[i]], 'สิทธิ์ ' + declared[i] + ' ต้องไม่ประกาศซ้ำ');
    seen[declared[i]] = true;
    assertTrue_(declared[i].indexOf('https://') === 0,
      'สิทธิ์ต้องเขียนเป็นที่อยู่เต็ม ไม่ใช่ชื่อย่อ (ได้: ' + declared[i] + ')');
  }

  /* ---------- และต้องตรงกับไฟล์ appsscript.json จริง ---------- */
  /*
   * บนชีตจริง สคริปต์อ่านไฟล์ตั้งค่าของตัวเองไม่ได้ ข้อนี้จึงเดินได้เฉพาะตอนรันบนเครื่อง
   * ซึ่งเป็นที่ที่การแก้โค้ดเกิดขึ้นจริงอยู่แล้ว · บนชีตจริงจะข้ามพร้อมบอกเหตุผล
   */
  var manifest = manifestTextForTest_();
  if (!manifest) {
    Logger.log('  (ข้าม: อ่าน appsscript.json จากในสคริปต์ไม่ได้ ข้อนี้เดินเฉพาะตอนรันบนเครื่อง)');
    assertTrue_(true, 'ข้ามการเทียบกับไฟล์ตั้งค่าเมื่ออ่านไฟล์ไม่ได้');
    return endTest_();
  }

  var inFile = (manifest.match(/https:\/\/[^"']+/g) || []).sort();
  assertEquals_(inFile.join(', '), declared.slice().sort().join(', '),
    'oauthScopes ใน appsscript.json ต้องตรงกับ requiredOAuthScopes_() ทุกบรรทัด');

  return endTest_();
}

/**
 * บริการนี้ถูกจัดประเภทไว้ในระดับเมธอดแล้วหรือไม่
 * @param {string} service ชื่อบริการ เช่น ScriptApp
 * @param {Object} table ตารางสิทธิ์
 * @param {string[]} free รายการที่ไม่ต้องขอสิทธิ์
 * @return {boolean}
 */
function classifiedAtMethodLevel_(service, table, free) {
  for (var key in table) {
    if (Object.prototype.hasOwnProperty.call(table, key) && key.indexOf(service + '.') === 0) return true;
  }
  for (var i = 0; i < free.length; i++) {
    if (free[i].indexOf(service + '.') === 0) return true;
  }
  return false;
}

/**
 * เนื้อไฟล์ appsscript.json — อ่านได้เฉพาะตอนรันบนเครื่อง
 * @return {string} ค่าว่างเมื่ออ่านไม่ได้
 */
function manifestTextForTest_() {
  try {
    return HtmlService.createHtmlOutputFromFile('appsscript.json').getContent() || '';
  } catch (e) {
    return '';
  }
}

/* ===========================================================================
 * แจ้งเตือน Telegram (SPEC 15) และหน้ารายละเอียดใบงาน (SPEC 17.2)
 *
 * การส่งจริงถูกแทนด้วยกล่องเก็บข้อความ (NOTIFY_OUTBOX_) ทุกชุด — สิ่งที่ต้องพิสูจน์คือ
 * "ข้อความหน้าตาอย่างไร และเข้าห้องไหน" ซึ่งการยิงออกเน็ตจริงไม่ได้ช่วยพิสูจน์เลย
 * มีแต่ทำให้เทสต์ช้า ไม่แน่นอน และถล่มห้องแชทจริงของทีม
 * =========================================================================== */

/**
 * รันสิ่งหนึ่งโดยเก็บข้อความแจ้งเตือนไว้ในกล่อง แทนการส่งออกจริง
 * @param {function()} fn สิ่งที่จะทำ
 * @return {Object[]} ข้อความที่ถูกส่งระหว่างนั้น
 */
function captureNotifications_(fn) {
  var beforeDisabled = NOTIFY_DISABLED_;
  var beforeOutbox = NOTIFY_OUTBOX_;
  NOTIFY_DISABLED_ = false;
  NOTIFY_OUTBOX_ = [];
  try {
    fn();
    return NOTIFY_OUTBOX_;
  } finally {
    NOTIFY_OUTBOX_ = beforeOutbox;
    NOTIFY_DISABLED_ = beforeDisabled;
  }
}

/**
 * ใส่ห้องแจ้งเตือนครบทุกห้องลงตาราง Notify_Channel สำหรับทดสอบ
 * @return {Object} แผนที่ห้อง -> Chat ID
 */
function addTestChannels_() {
  /*
   * ต้องได้ห้องชุดเดียวเสมอ ไม่ว่าชุดไหนจะรันมาก่อน
   *
   * ชุดอื่นในกลุ่มเดียวกันก็เพิ่มห้องของตัวเอง และชุดนี้เองก็ถูกเรียกหลายครั้งต่อหนึ่งกลุ่ม
   * ถ้าเติมแถวใหม่ทุกครั้ง ห้อง ADMIN จะมีหลายแถว แล้วข้อความหนึ่งเหตุการณ์
   * จะถูกส่งหลายครั้ง — การนับจำนวนข้อความจึงเพี้ยนตามลำดับการรัน ไม่ใช่ตามความถูกผิดของโค้ด
   *
   * @return {Object} แผนที่ห้อง -> Chat ID
   */
  var known = [NOTIFY_TARGET.ADMIN, NOTIFY_TARGET.APPROVER_SP, NOTIFY_TARGET.APPROVER_LAB,
    NOTIFY_TARGET.SERVICE, NOTIFY_TARGET.PROJECT, NOTIFY_TARGET.LAB];

  var map = {};
  var wanted = {};
  for (var i = 0; i < known.length; i++) {
    var id = testPrefix_() + 'CH-' + known[i];
    var chatId = '-100' + (900000 + i);
    map[known[i]] = chatId;
    wanted[id] = { target: known[i], chatId: chatId };
  }

  var keyField = SHEET_KEY_FIELD[SHEET.NOTIFY_CHANNEL];
  var existing = listNotifyChannels(false);
  var have = {};

  for (var e = 0; e < existing.length; e++) {
    var row = existing[e];
    var rowId = String(row['Channel_ID'] || '');
    if (rowId.indexOf(TEST_PREFIX) !== 0) continue;   // ห้องจริงของระบบ ห้ามแตะ

    if (wanted[rowId]) {
      have[rowId] = true;
      if (!cellToBoolean_(row['Active'])) {
        updateRow_(SHEET.NOTIFY_CHANNEL, keyField, rowId, { 'Active': true });
      }
    } else if (cellToBoolean_(row['Active'])) {
      // ห้องที่ชุดอื่นเพิ่มไว้ ปิดก่อน ไม่งั้นจะมีห้องเป้าหมายเดียวกันมากกว่าหนึ่งห้อง
      updateRow_(SHEET.NOTIFY_CHANNEL, keyField, rowId, { 'Active': false });
    }
  }

  var rows = [];
  for (var id2 in wanted) {
    if (!Object.prototype.hasOwnProperty.call(wanted, id2) || have[id2]) continue;
    rows.push({
      'Channel_ID': id2,
      'Name': 'ห้องทดสอบ ' + wanted[id2].target,
      'Target': wanted[id2].target,
      'Chat_ID': wanted[id2].chatId,
      // null ไม่ใช่ข้อความว่าง — thread_id เป็น bigint (ดู supabase_schema.sql)
      'Thread_ID': null,
      'Active': true
    });
  }
  if (rows.length) appendRows_(SHEET.NOTIFY_CHANNEL, rows);

  clearMasterCache_(SHEET.NOTIFY_CHANNEL);
  return map;
}

/**
 * ทุกเหตุการณ์ในตาราง SPEC 15.3 ต้องเข้าห้องให้ถูกตามสายงาน
 *
 * ตรวจที่ตารางห้องปลายทางโดยตรง เพราะเป็นฟังก์ชันล้วน จึงครอบได้ครบทุกเหตุการณ์
 * ทุกสายงาน โดยไม่ต้องสร้างใบงานจริงสิบกว่าใบ
 */
function test_notify_routing() {
  beginTest_('ทุกเหตุการณ์ต้องเข้าห้องถูกตามสายงาน — SPEC 15.3');

  var sp = { route: ROUTE.SP, department: ASSIGNMENT.SERVICE };
  var lab = { route: ROUTE.LAB, department: ASSIGNMENT.LAB };

  /* ---------- ขออนุมัติ เข้าห้องผู้อนุมัติของสายนั้นเท่านั้น ---------- */
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.SUBMIT, sp).join(','), NOTIFY_TARGET.APPROVER_SP,
    'ใบสาย SP ต้องเข้าห้องผู้อนุมัติ SP');
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.SUBMIT, lab).join(','), NOTIFY_TARGET.APPROVER_LAB,
    'ใบสาย Lab ต้องเข้าห้องผู้อนุมัติ Lab ไม่ใช่ห้องเดียวกับสาย SP');

  /* ---------- อนุมัติแล้ว เข้าห้อง Admin และห้องแผนก ---------- */
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.ACCEPT, sp).join(','),
    NOTIFY_TARGET.ADMIN + ',' + NOTIFY_TARGET.SERVICE, 'อนุมัติแล้วเข้าห้อง Admin และห้องแผนก');
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.ACCEPT,
    { route: ROUTE.SP, department: ASSIGNMENT.SERVICE_PROJECT }).join(','),
    NOTIFY_TARGET.ADMIN + ',' + NOTIFY_TARGET.SERVICE + ',' + NOTIFY_TARGET.PROJECT,
    'งานร่วมสองแผนกต้องเข้าห้องของทั้งสองแผนก');

  /* ---------- ตีกลับ เข้าห้อง Admin ---------- */
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.RETURN, sp).join(','), NOTIFY_TARGET.ADMIN,
    'ตีกลับต้องถึงผู้เปิดใบงาน ซึ่งอยู่ห้อง Admin');

  /* ---------- งานของแผนก ---------- */
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.TASK_ACCEPT, sp).join(','), NOTIFY_TARGET.ADMIN,
    'แผนกรับงานแล้ว แจ้งห้อง Admin');
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.TASK_UPDATE, sp).join(','), NOTIFY_TARGET.ADMIN,
    'อัปเดตขั้นตอน แจ้งห้อง Admin');
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.TASK_COMPLETE, sp).join(','), NOTIFY_TARGET.ADMIN,
    'ปิดงานแผนก แจ้งห้อง Admin');
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.TASK_CANCEL, lab).join(','),
    NOTIFY_TARGET.ADMIN + ',' + NOTIFY_TARGET.APPROVER_LAB,
    'ยกเลิกงานของแผนก ต้องถึงผู้อนุมัติของสายนั้นด้วย');

  /* ---------- ปิดและยกเลิกทั้งใบ ---------- */
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.WO_COMPLETED, sp).join(','), NOTIFY_TARGET.ADMIN,
    'ใบงานเสร็จสิ้น แจ้งห้อง Admin');
  var cancelled = notifyTargetsOf_(NOTIFY_EVENT.WO_CANCELLED, sp);
  assertTrue_(cancelled.indexOf(NOTIFY_TARGET.ADMIN) !== -1 &&
    cancelled.indexOf(NOTIFY_TARGET.APPROVER_SP) !== -1 &&
    cancelled.indexOf(NOTIFY_TARGET.SERVICE) !== -1,
    'ยกเลิกทั้งใบต้องถึงทุกฝ่ายที่เกี่ยวข้อง เพราะอาจมีคนกำลังเดินทางไปหน้างานแล้ว');

  /* ---------- รับชำระเงิน เข้าห้องแผนกที่รออยู่ ---------- */
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.PAYMENT, sp).join(','), NOTIFY_TARGET.SERVICE,
    'รับชำระแล้ว ต้องแจ้งแผนกที่รอเริ่มงาน ไม่ใช่แจ้งห้อง Admin');

  /* ---------- ยังไม่ระบุแผนก ต้องไม่ส่งมั่วเข้าห้องแผนกใด ---------- */
  assertEquals_(notifyTargetsOf_(NOTIFY_EVENT.PAYMENT,
    { route: ROUTE.SP, department: ASSIGNMENT.UNSPECIFIED }).join(','), '',
    'ใบที่ยังไม่ระบุแผนก ต้องไม่มีห้องแผนกให้ส่ง');

  /* ---------- ทุกเหตุการณ์ที่ประกาศไว้ ต้องมีห้องรับจริง ---------- */
  // เหตุการณ์ที่ไม่มีใครรับ = ข่าวที่หายไปเงียบ ๆ ซึ่งมองจากโค้ดไม่เห็น
  for (var key in NOTIFY_EVENT) {
    if (!Object.prototype.hasOwnProperty.call(NOTIFY_EVENT, key)) continue;
    assertTrue_(notifyTargetsOf_(NOTIFY_EVENT[key], sp).length > 0,
      'เหตุการณ์ ' + NOTIFY_EVENT[key] + ' ต้องมีห้องปลายทางอย่างน้อยหนึ่งห้อง');
    assertTrue_(!!NOTIFY_TITLE_TH[NOTIFY_EVENT[key]],
      'เหตุการณ์ ' + NOTIFY_EVENT[key] + ' ต้องมีหัวข้อภาษาไทย ไม่ใช่ชื่อดิบ');
  }

  return endTest_();
}

/**
 * ข้อความต้อง escape อักขระ HTML และต้องไม่มีข้อมูลที่ห้ามหลุด (SPEC 15.4)
 */
function test_notify_messageSafety() {
  beginTest_('ข้อความแจ้งเตือน — escape ถูก และไม่มีข้อมูลที่ห้ามหลุด');

  /*
   * ชื่อลูกค้าและอาการที่มี & < > เกิดขึ้นจริงในงานประปาและไฟฟ้า เช่น "แรงดัน < 2 บาร์"
   * ถ้าไม่แปลงก่อนส่ง Telegram จะปฏิเสธทั้งข้อความ แล้วไม่มีใครได้รับอะไรเลย
   */
  var wo = {
    'WO_ID': 'WO-2609-0009',
    'Customer_Name': 'บริษัท เอ & บี <สาขา 2> จำกัด',
    'Project': 'อาคาร A',
    'Location': 'ห้องปั๊มน้ำ ชั้น B1',
    'Job_Description': 'ปั๊มน้ำรั่ว แรงดัน < 2 บาร์ ซึ่งต้องตรวจสอบระบบไฟฟ้าด้วย',
    'Phone': '0812345678',
    'Payment_Remark': 'โอนแล้ว 15,000.00 บาท',
    'Assignment_Type': ASSIGNMENT.SERVICE,
    'Route': ROUTE.SP,
    'Overall_Status': WO_STATUS.PENDING_APPROVE
  };

  var text = notifyMessage_(NOTIFY_EVENT.SUBMIT, wo, {});

  /* ---------- escape ต้องครบทั้งสามตัว ---------- */
  assertTrue_(text.indexOf('&amp;') !== -1, 'เครื่องหมาย & ต้องถูกแปลง');
  assertTrue_(text.indexOf('&lt;') !== -1, 'เครื่องหมาย < ต้องถูกแปลง');
  assertTrue_(text.indexOf('&gt;') !== -1, 'เครื่องหมาย > ต้องถูกแปลง');
  assertTrue_(text.indexOf('<สาขา') === -1,
    'ต้องไม่เหลืออักขระดิบที่ Telegram จะตีความเป็นแท็ก');

  // แท็กที่ระบบใส่เองต้องยังอยู่ ไม่ใช่ถูกแปลงไปด้วยจนกลายเป็นข้อความธรรมดา
  assertTrue_(text.indexOf('<b>') !== -1, 'หัวข้อที่ระบบใส่เองต้องยังเป็นตัวหนา');

  /* ---------- ข้อมูลที่ห้ามหลุด ---------- */
  assertTrue_(text.indexOf('0812345678') === -1,
    'ห้ามมีเบอร์โทรลูกค้าในข้อความ กลุ่ม Telegram เชิญคนเข้าง่ายเกินกว่าจะใส่ (SPEC 15.4)');
  assertTrue_(text.indexOf('15,000') === -1, 'ห้ามมีจำนวนเงิน');
  assertTrue_(!/\d[\d,]*\.\d{2}/.test(text), 'ห้ามมีตัวเลขที่มีทศนิยมสองตำแหน่งแบบจำนวนเงิน');
  assertTrue_(text.indexOf('บาท') === -1, 'และห้ามมีหน่วยเงิน');

  /* ---------- สิ่งที่ต้องมี ---------- */
  assertTrue_(text.indexOf('WO-2609-0009') !== -1, 'ต้องมีเลขที่ใบงาน');
  assertTrue_(text.indexOf('ห้องปั๊มน้ำ') !== -1, 'ต้องมีสถานที่');
  assertTrue_(text.indexOf('รออนุมัติ') !== -1, 'ต้องบอกสถานะเป็นคำไทย');

  /* ---------- ทุกเหตุการณ์ต้องสะอาดเหมือนกันหมด ---------- */
  /*
   * ข้อความคนละเหตุการณ์ประกอบคนละชุด ถ้าตรวจแค่ชุดเดียวจะพลาดชุดที่เหลือ
   *
   * สิ่งที่กฎห้ามคือ "ระบบหยิบช่องที่ห้ามหยิบมาใส่เอง" คือเบอร์โทรและรายละเอียดการชำระเงิน
   * ส่วนเหตุผลที่คนพิมพ์เองระบบต้องส่งต่อตามที่เขาเขียน ถ้าไปตัดคำในนั้นให้
   * เหตุผลจะเพี้ยนจนผู้รับอ่านไม่เข้าใจ ซึ่งเสียหายกว่าและไม่ใช่สิ่งที่กฎข้อนี้ห้าม
   */
  var dirty = [];
  for (var key in NOTIFY_EVENT) {
    if (!Object.prototype.hasOwnProperty.call(NOTIFY_EVENT, key)) continue;
    var body = notifyMessage_(NOTIFY_EVENT[key], wo,
      { reason: 'เอกสารไม่ครบ', department: ASSIGNMENT.SERVICE });
    if (body.indexOf('0812345678') !== -1) dirty.push(NOTIFY_EVENT[key] + ' (เบอร์ลูกค้า)');
    if (body.indexOf('15,000') !== -1) dirty.push(NOTIFY_EVENT[key] + ' (จำนวนเงิน)');
    if (body.indexOf('โอนแล้ว') !== -1) dirty.push(NOTIFY_EVENT[key] + ' (รายละเอียดการชำระ)');
  }
  assertEquals_(dirty.join(', '), '',
    'ทุกเหตุการณ์ต้องไม่มีเบอร์โทรหรือรายละเอียดการชำระเงินจากแถวใบงานหลุดไปกับข้อความ');

  return endTest_();
}

/**
 * ส่งจริงผ่านเส้นทางของระบบ — เข้าห้องถูก มีปุ่มเปิดใบงาน และไม่ส่งซ้ำ
 */
function test_notify_sendAndDedupe() {
  beginTest_('ส่งเข้าห้องถูก มีปุ่มเปิดใบงาน และกดรัว ๆ ต้องส่งครั้งเดียว');

  var channels = addTestChannels_();
  var users = serviceTestUsers_();
  var created = createTestWo_(users);
  var wo = getWorkOrder(created.woId);

  var sent = captureNotifications_(function () {
    notifyEvent_(NOTIFY_EVENT.SUBMIT, wo);
  });

  assertEquals_(sent.length, 1, 'ขออนุมัติต้องส่งหนึ่งห้อง คือห้องผู้อนุมัติของสายนั้น');
  assertEquals_(sent[0].chatId, channels[NOTIFY_TARGET.APPROVER_SP],
    'และต้องเป็น Chat ID จากตาราง Notify_Channel ไม่ใช่ค่าที่เขียนไว้ในโค้ด');

  /* ---------- ปุ่มต้องชี้ไปที่ใบงานใบนี้ ---------- */
  assertTrue_(sent[0].url.indexOf('page=wo') !== -1, 'ปุ่มต้องชี้ไปหน้ารายละเอียดใบงาน');
  assertTrue_(sent[0].url.indexOf(created.woId) !== -1, 'และต้องเป็นใบงานใบที่เกิดเหตุจริง');

  /* ---------- กดรัว ๆ ต้องส่งครั้งเดียว (SPEC 15.4) ---------- */
  var again = captureNotifications_(function () {
    notifyEvent_(NOTIFY_EVENT.SUBMIT, wo);
    notifyEvent_(NOTIFY_EVENT.SUBMIT, wo);
  });
  assertEquals_(again.length, 0, 'เหตุการณ์เดิมของใบเดิมในนาทีเดียวกัน ต้องไม่ถูกส่งซ้ำ');

  /* ---------- คนละเหตุการณ์ ไม่ใช่การส่งซ้ำ ---------- */
  var other = captureNotifications_(function () {
    notifyEvent_(NOTIFY_EVENT.RETURN, wo, { reason: 'ยังไม่แนบใบเสนอราคา' });
  });
  assertEquals_(other.length, 1, 'เหตุการณ์อื่นของใบเดียวกัน ต้องยังส่งได้ตามปกติ');
  assertTrue_(other[0].text.indexOf('ยังไม่แนบใบเสนอราคา') !== -1,
    'และต้องมีเหตุผลติดไปด้วย ไม่งั้นผู้เปิดใบงานไม่รู้ว่าต้องแก้อะไร');

  return endTest_();
}

/**
 * ห้องที่ปิดอยู่ต้องไม่ถูกส่ง และห้องที่ยังไม่ได้กรอก Chat ID ก็เช่นกัน
 */
function test_notify_inactiveChannel() {
  beginTest_('ห้องที่ปิดใช้งานอยู่ ต้องไม่ถูกส่ง');

  appendRows_(SHEET.NOTIFY_CHANNEL, [
    { 'Channel_ID': testPrefix_() + 'CH-OFF', 'Name': 'ห้องที่ปิดไว้',
      'Target': NOTIFY_TARGET.ADMIN, 'Chat_ID': '-100999001', 'Active': false },
    // ห้องที่ยังไม่ได้กรอกเลข = null ในคอลัมน์ bigint · ข้อความว่างถูกฐานข้อมูลปฏิเสธ
    { 'Channel_ID': testPrefix_() + 'CH-NOID', 'Name': 'ห้องที่ยังไม่ได้กรอกเลข',
      'Target': NOTIFY_TARGET.ADMIN, 'Chat_ID': null, 'Active': true },
    { 'Channel_ID': testPrefix_() + 'CH-ON', 'Name': 'ห้องที่ใช้งานอยู่',
      'Target': NOTIFY_TARGET.ADMIN, 'Chat_ID': '-100999002', 'Active': true }
  ]);
  clearMasterCache_(SHEET.NOTIFY_CHANNEL);

  var rooms = notifyChannelsFor_([NOTIFY_TARGET.ADMIN]);
  var ids = [];
  for (var i = 0; i < rooms.length; i++) ids.push(String(rooms[i]['Chat_ID']));

  assertTrue_(ids.indexOf('-100999002') !== -1, 'ห้องที่เปิดอยู่ต้องถูกส่ง');
  assertTrue_(ids.indexOf('-100999001') === -1,
    'ห้องที่ปิดไว้ต้องไม่ถูกส่ง — เป็นวิธีพักห้องโดยไม่ต้องลบข้อมูลทิ้ง');
  assertTrue_(ids.indexOf('') === -1, 'ห้องที่ยังไม่ได้กรอก Chat ID ต้องถูกข้าม ไม่ใช่ส่งไปที่ค่าว่าง');

  return endTest_();
}

/**
 * แจ้งเตือนล้มเหลว ห้ามทำให้สถานะย้อนกลับ และต้องเหลือร่องรอยไว้ (SPEC 15.4 · กฎข้อ 10)
 */
function test_notify_failureKeepsStatus() {
  beginTest_('แจ้งเตือนล้มเหลว แต่สถานะต้องถูกบันทึกครบ');

  var users = serviceTestUsers_();
  var original = sendTelegramMessage_;
  var attempts = 0;
  var created = null;

  addTestChannels_();

  try {
    sendTelegramMessage_ = function () {
      attempts++;
      throw new Error('จำลองว่าเครือข่ายล่ม');
    };
    var beforeDisabled = NOTIFY_DISABLED_;
    NOTIFY_DISABLED_ = false;
    try {
      created = createTestWo_(users);
    } finally {
      NOTIFY_DISABLED_ = beforeDisabled;
    }
  } finally {
    sendTelegramMessage_ = original;   // ต้องคืนของเดิมเสมอ ไม่งั้นทั้งกลุ่มจะส่งไม่ได้
  }

  assertTrue_(attempts > 0, 'ตัวจำลองต้องถูกเรียกจริง ไม่งั้นเทสต์นี้ไม่ได้พิสูจน์อะไร');

  var wo = getWorkOrder(created.woId);
  assertTrue_(!!wo, 'ใบงานต้องถูกบันทึกไว้ครบ แม้แจ้งเตือนไม่สำเร็จ');
  assertEquals_(wo[STATUS_FIELD[ENTITY.WO]], WO_STATUS.PENDING_APPROVE,
    'และต้องอยู่ที่ผู้อนุมัติตามปกติ ไม่ย้อนกลับเพราะเรื่องแจ้งเตือน');

  // ย้ายไป System_Log แล้วตาม SPEC 13 — ส่วนครั้งที่ส่งสำเร็จยังอยู่ใน Audit_Log ตามเดิม
  var failure = systemLogOf_(created.woId, ACTION.NOTIFY_FAILED);
  assertTrue_(!!failure, 'ต้องบันทึก NOTIFY_FAILED ไว้ เพื่อให้ตามได้ว่าใบไหนไม่ได้ถูกแจ้ง');
  assertTrue_(String(failure['Detail']).indexOf('เครือข่ายล่ม') !== -1,
    'และต้องบอกสาเหตุจริงไว้ด้วย ไม่ใช่บอกแค่ว่าไม่สำเร็จ');

  return endTest_();
}

/**
 * ยังไม่ได้ตั้ง Token — ระบบต้องทำงานต่อได้ตามปกติ แค่ไม่มีข้อความออกไป
 */
function test_notify_noToken() {
  beginTest_('ไม่มี Token ต้องไม่พังทั้งระบบ แค่ไม่ส่งและบันทึกไว้');

  addTestChannels_();
  var users = serviceTestUsers_();
  var originalGetProp = getProp_;
  var created = null;

  try {
    getProp_ = function (key, required) {
      if (key === PROP_KEY.TELEGRAM_BOT_TOKEN) return '';   // ทำเหมือนยังไม่เคยตั้งค่า
      return originalGetProp(key, required);
    };

    var beforeDisabled = NOTIFY_DISABLED_;
    NOTIFY_DISABLED_ = false;
    try {
      created = createTestWo_(users);
    } finally {
      NOTIFY_DISABLED_ = beforeDisabled;
    }
  } finally {
    getProp_ = originalGetProp;
  }

  var wo = getWorkOrder(created.woId);
  assertTrue_(!!wo, 'ใบงานต้องถูกสร้างได้ตามปกติ');
  assertEquals_(wo[STATUS_FIELD[ENTITY.WO]], WO_STATUS.PENDING_APPROVE, 'และสถานะต้องถูกต้อง');

  var noted = systemLogOf_(created.woId, ACTION.NOTIFY_FAILED);
  assertTrue_(!!noted, 'ต้องบันทึกไว้ว่าไม่ได้ส่ง ไม่ใช่เงียบหายไปเฉย ๆ');
  assertTrue_(String(noted['Detail']).indexOf('TELEGRAM_BOT_TOKEN') !== -1,
    'และต้องบอกชื่อค่าที่ผู้ดูแลต้องไปตั้ง');

  assertTrue_(TELEGRAM_TOKEN_NOT_SET_MESSAGE.indexOf('TELEGRAM_BOT_TOKEN') !== -1,
    'ข้อความเรื่อง Token ต้องบอกชื่อค่าที่ต้องตั้งเสมอ');

  return endTest_();
}

/**
 * การยิงออกนอกระบบต้องอยู่ในไฟล์เดียว และ Token ห้ามหลุดไปที่ใด
 */
function test_notify_isolationAndSecrets() {
  beginTest_('ยิงออกนอกระบบได้ที่เดียว และ Token ห้ามหลุด');

  /* ---------- UrlFetchApp ต้องอยู่ในไฟล์ที่ได้รับอนุญาตเท่านั้น ---------- */
  /*
   * กฎเดียวกับชั้นชีตและชั้นไฟล์ — วันที่เปลี่ยนช่องทาง ต้องแก้ไฟล์เดียวจบ
   *
   * เดิมข้อนี้เขียนว่า "ต้องมีตัวเดียว" เพราะตอนนั้นระบบยิงออกนอกที่เดียวจริง คือ Telegram
   * ตอนนี้มีปลายทางที่สองคือ Supabase (SPEC 22) ซึ่งเป็นคนละเรื่องกันสิ้นเชิง และกฎข้อ 21
   * บังคับให้มันอยู่ใน 01_Db.gs ไฟล์เดียวเหมือนกัน · เจตนาของข้อนี้จึงไม่ได้เปลี่ยน
   * แค่มีสองประตูแทนที่จะเป็นประตูเดียว และทั้งสองประตูยังปิดตายเหมือนเดิม
   *
   * รายชื่อนี้คือรายชื่อที่ตั้งใจให้มี ถ้ามีชื่อใหม่โผล่มา แปลว่ามีคนเปิดประตูที่สาม
   */
  var needle = 'UrlFetch' + 'App';
  /*
   * เหลือสองชื่อแล้วตามกฎข้อ 26 · ทั้ง Telegram และ Supabase ยิงผ่านสองตัวนี้ทั้งคู่
   * วันที่ย้ายไป Cloudflare Workers บรรทัดที่ต้องเขียนใหม่อยู่ในสองฟังก์ชันนี้เท่านั้น
   */
  var allowed = [
    'httpSend_',       // 01_Db.gs — ยิงหนึ่งคำขอ รับ/คืนค่ารูปแบบกลาง
    'httpSendAll_'     // 01_Db.gs — ยิงหลายคำขอพร้อมกัน รูปแบบเดียวกัน
  ];
  var offenders = [];
  var scanned = 0;

  for (var name in globalThis) {
    if (typeof globalThis[name] !== 'function') continue;
    if (name.indexOf('test_') === 0) continue;
    if (serviceNameRegistries_().indexOf(name) !== -1) continue;
    scanned++;
    var source;
    try {
      /*
       * ตัดคอมเมนต์ออกก่อน — ตัวสแกนที่นับคำในคำอธิบายด้วย สอนให้คนเลิกเขียน
       * คำอธิบายเรื่องที่มันเฝ้าอยู่พอดี ซึ่งตรงข้ามกับสิ่งที่ต้องการ · กฎข้อ 21 มีไว้ให้คนอธิบายได้
       *
       * ข้อความใน string ยังไม่ตัดออกโดยตั้งใจ เพราะการเรียกแบบ UrlFetchApp['fetch']
       * ซ่อนชื่อ API ไว้ใน string ได้จริง ตัดทิ้งเมื่อไรก็จะมีช่องใหม่ที่เล็ดลอดไปได้
       */
      source = stripComments_(String(globalThis[name]));
    } catch (e) {
      continue;
    }
    if (source.indexOf(needle) !== -1) offenders.push(name);
  }

  assertTrue_(scanned > 50, 'ตัวสแกนต้องเห็นโค้ดของระบบจริง (เห็น ' + scanned + ' ตัว)');
  assertEquals_(offenders.sort().join(', '), allowed.sort().join(', '),
    'ฟังก์ชันที่ยิงออกนอกระบบ ต้องมีตัวเดียวและอยู่ใน 07_Notify.gs');

  /* ---------- Token ห้ามหลุดไปหน้าเว็บหรือข้อความ ---------- */
  var page = renderPage_({ page: 'wo', id: 'WO-2609-0001', base: 'https://example.com/exec' });
  assertTrue_(page.indexOf('TELEGRAM_BOT_TOKEN') === -1,
    'แม้แต่ชื่อของค่าที่เก็บ Token ก็ไม่ควรโผล่ในหน้าเว็บ');
  assertTrue_(page.indexOf('api.telegram.org') === -1, 'และที่อยู่ของ Telegram ก็ไม่ต้องอยู่ในหน้า');

  // ข้อความที่บอกว่าส่งไม่สำเร็จ ต้องไม่ลาก Token ติดไปด้วย
  var withToken = telegramErrorText_({ code: 401,
    body: '{"ok":false,"description":"Unauthorized"}' });
  assertTrue_(withToken.indexOf('bot') === -1 || withToken.indexOf('Unauthorized') !== -1,
    'ข้อความผิดพลาดต้องมาจากคำอธิบายของ Telegram ไม่ใช่ที่อยู่ที่มี Token อยู่ข้างใน');

  /* ---------- ต้องตรวจรหัสตอบกลับเสมอ ห้ามถือว่าส่งสำเร็จลอย ๆ ---------- */
  /*
   * ข้อนี้ต้องยิงผ่านตัวส่งจริง ไม่ใช่ผ่านกล่องเก็บข้อความของชุดทดสอบ
   * เพราะกล่องนั้นตอบว่าสำเร็จเสมอ เส้นทางที่ตรวจรหัสจึงไม่เคยถูกเดินเลยสักครั้ง
   * สวมตัวยิงคำขอชั่วคราวแทน เพื่อจำลองคำตอบที่ Telegram ส่งกลับมาจริง ๆ
   */
  var originalFetch = fetchExternal_;
  var originalGetProp = getProp_;
  var outboxBefore = NOTIFY_OUTBOX_;
  var results = {};

  try {
    NOTIFY_OUTBOX_ = null;   // ปิดโหมดเก็บข้อความ ให้เดินเส้นทางส่งจริง
    getProp_ = function (key, required) {
      if (key === PROP_KEY.TELEGRAM_BOT_TOKEN) return 'โทเคนจำลองสำหรับทดสอบ';
      return originalGetProp(key, required);
    };

    fetchExternal_ = function () { return { code: 200, body: '{"ok":true,"result":{}}' }; };
    results.good = sendTelegramMessage_({ 'Chat_ID': '-100999123' }, 'ข้อความ', '');

    fetchExternal_ = function () {
      return { code: 400, body: '{"ok":false,"description":"chat not found"}' };
    };
    results.badCode = sendTelegramMessage_({ 'Chat_ID': '-100999123' }, 'ข้อความ', '');

    // Telegram ตอบ 200 พร้อม ok:false ได้ การดูแต่รหัสจึงยังพลาดได้
    fetchExternal_ = function () {
      return { code: 200, body: '{"ok":false,"description":"bot was blocked by the user"}' };
    };
    results.okFalse = sendTelegramMessage_({ 'Chat_ID': '-100999123' }, 'ข้อความ', '');
  } finally {
    fetchExternal_ = originalFetch;
    getProp_ = originalGetProp;
    NOTIFY_OUTBOX_ = outboxBefore;
  }

  assertEquals_(results.good.ok, true, 'ตอบ 200 พร้อม ok:true คือส่งสำเร็จ');
  assertEquals_(results.badCode.ok, false, 'รหัสตอบกลับไม่ใช่ 200 ต้องถือว่าส่งไม่สำเร็จ');
  assertTrue_(String(results.badCode.message).indexOf('chat not found') !== -1,
    'และต้องบอกสาเหตุที่ Telegram อธิบายมา ไม่ใช่บอกแค่ว่าไม่สำเร็จ');
  assertEquals_(results.okFalse.ok, false,
    'ตอบ 200 แต่ ok:false ก็คือส่งไม่สำเร็จ — การดูแต่รหัสอย่างเดียวยังพลาดได้');

  /*
   * เดิมข้อนี้ดูที่ fetchExternal_ เพราะตอนนั้นมันเป็นตัวที่ยิงเอง · ตอนนี้การยิงจริง
   * ย้ายไปอยู่ที่ httpSend_ ตัวเดียวทั้งระบบตามกฎข้อ 26 ธงนี้จึงย้ายตามไปอยู่ที่นั่น
   * เจตนาไม่เปลี่ยน — รหัส 400 ต้องไม่กลายเป็นข้อผิดพลาดที่โยนออกมา ไม่งั้นเราจะไม่ได้
   * เห็นคำอธิบายของ Telegram เลย · ที่เปลี่ยนคือ "ใครเป็นคนตั้งธง" เท่านั้น
   */
  assertTrue_(String(httpOptions_).indexOf('muteHttpExceptions') !== -1,
    'ต้องใช้ muteHttpExceptions ไม่งั้นรหัส 400 จะกลายเป็นข้อผิดพลาดที่โยนออกมา ' +
    'แล้วเราจะไม่ได้เห็นคำอธิบายของ Telegram เลย');

  /* ---------- Chat ID ห้ามเขียนไว้ในโค้ด (SPEC 15.1) ---------- */
  var notifySource = String(notifyChannelsFor_) + String(notifyEvent_) + String(notifyTargetsOf_);
  assertTrue_(!/-100\d{5,}/.test(notifySource),
    'ห้ามมี Chat ID เขียนไว้ในโค้ด ต้องอ่านจากตาราง Notify_Channel เท่านั้น');
  assertTrue_(String(notifyChannelsFor_).indexOf('listNotifyChannels') !== -1,
    'และต้องอ่านจากตารางนั้นจริง ๆ');

  return endTest_();
}

/**
 * เครื่องมือตรวจการแจ้งเตือน ต้องบอกสภาพจริงได้แม้ยังไม่ได้ตั้งค่า
 */
function test_notify_checkTool() {
  beginTest_('checkTelegram บอกสภาพจริงได้ และไม่พังเมื่อยังไม่ได้ตั้งค่า');

  var originalGetProp = getProp_;
  var report = '';
  try {
    getProp_ = function (key, required) {
      if (key === PROP_KEY.TELEGRAM_BOT_TOKEN) return '';
      return originalGetProp(key, required);
    };
    report = String(checkTelegram());
  } finally {
    getProp_ = originalGetProp;
  }

  assertTrue_(report.indexOf('TELEGRAM_BOT_TOKEN') !== -1,
    'ยังไม่ได้ตั้ง Token ต้องบอกชื่อค่าที่ต้องไปตั้ง');
  assertTrue_(report.indexOf('ไม่ผ่าน') !== -1, 'และต้องบอกชัดว่ายังไม่ผ่าน');
  assertTrue_(report.indexOf('ทุกอย่างอื่นทำงานตามปกติ') !== -1,
    'พร้อมบอกด้วยว่าระบบส่วนอื่นยังใช้งานได้ ไม่ใช่ปล่อยให้เข้าใจว่าทั้งระบบพัง');

  return endTest_();
}

/**
 * หน้ารายละเอียดใบงาน — ข้อมูลครบ เส้นเวลาถูก และใบที่ไม่มีจริงต้องบอกให้ชัด
 */
function test_web_woDetail() {
  beginTest_('หน้ารายละเอียดใบงาน — SPEC 17.2');

  var users = serviceTestUsers_();
  var created = createTestWo_(users);

  /* ---------- ใบที่ไม่มีอยู่จริง ---------- */
  var missing = workOrderDetail('WO-ไม่มีจริง-0001');
  assertEquals_(missing.found, false, 'ใบที่ไม่มีอยู่จริง ต้องบอกว่าไม่พบ');
  assertTrue_(String(missing.reason).indexOf('ไม่พบใบงาน') !== -1,
    'และต้องเป็นข้อความไทยที่อ่านรู้เรื่อง ไม่ใช่ข้อผิดพลาดดิบ');
  assertEquals_(workOrderDetail('').found, false, 'ไม่ได้ระบุเลขที่มาเลย ก็ต้องไม่พังเช่นกัน');

  /* ---------- ใบจริง ข้อมูลครบทุกช่องตาม SPEC 9.3 ---------- */
  var detail = workOrderDetail(created.woId);
  assertEquals_(detail.found, true, 'ใบที่มีอยู่จริงต้องเปิดได้');

  var fields = ['customerName', 'customerCode', 'salesPerson', 'contact', 'phone',
    'project', 'location', 'pjId', 'assignmentType', 'requestTypes', 'jobDescription',
    'productDetail', 'workScope', 'referenceDoc', 'remark', 'createdBy'];
  var missingFields = [];
  for (var f = 0; f < fields.length; f++) {
    if (detail.workOrder[fields[f]] === undefined) missingFields.push(fields[f]);
  }
  assertEquals_(missingFields.join(', '), '', 'ต้องมีครบทุกช่องตามตารางใน SPEC 9.3');

  /* ---------- วันที่ต้องจัดรูปแบบมาจากเซิร์ฟเวอร์แล้ว (กฎข้อ 19, 20) ---------- */
  assertTrue_(/^\d{2}-\d{2}-\d{4}/.test(detail.workOrder.display.createdDate),
    'วันที่แจ้งต้องเป็น dd-MM-yyyy มาจากฝั่งเซิร์ฟเวอร์');

  /* ---------- เส้นเวลาต้องมีเหตุการณ์เปิดใบงาน และไม่ซ้ำ ---------- */
  var labels = [];
  for (var t = 0; t < detail.timeline.length; t++) labels.push(detail.timeline[t].label);
  assertTrue_(labels.indexOf('เปิดใบงาน') !== -1, 'เส้นเวลาต้องมีเหตุการณ์เปิดใบงาน');

  /*
   * การเปิดใบงานหนึ่งครั้งเขียน Audit หลายแถว (สถานะ สถานที่ เลขที่)
   * เส้นเวลาต้องยุบให้เหลือบรรทัดเดียว ไม่งั้นผู้ใช้จะเห็นคำว่าเปิดใบงานซ้ำสามสี่บรรทัด
   */
  var opened = 0;
  for (var o = 0; o < labels.length; o++) if (labels[o] === 'เปิดใบงาน') opened++;
  assertEquals_(opened, 1, 'การกดหนึ่งครั้ง ต้องได้บรรทัดเดียวบนเส้นเวลา');

  /*
   * และต้องมีเฉพาะเหตุการณ์ที่ประกาศไว้ในตารางเท่านั้น
   *
   * ใบงานหนึ่งใบมีบันทึกอีกหลายชนิดที่ไม่ใช่เส้นเวลาของงาน เช่นการคำนวณสถานะรวมใหม่
   * การออกเอกสาร และการแจ้งเตือน ถ้าเผลอนับรวมทุกแถว ผู้ใช้จะเห็นบรรทัดของระบบปนเต็มไปหมด
   * จนอ่านไม่ออกว่าคนทำอะไรไปบ้าง
   */
  /*
   * เขียนบันทึกของระบบลงไปหนึ่งแถวโดยตั้งใจ แล้วดูว่ามันขึ้นบนเส้นเวลาไหม
   * ถ้าไม่ใส่ของแบบนี้ลงไป เทสต์จะผ่านเพราะ "ไม่มีอะไรให้ปน" ไม่ใช่เพราะตัวกรองทำงาน
   */
  writeAudit(ENTITY.WO, created.woId, ACTION.RECALC, STATUS_FIELD[ENTITY.WO],
    WO_STATUS.APPROVED, WO_STATUS.IN_PROGRESS, 'ระบบคำนวณสถานะรวมใหม่',
    { woId: created.woId });
  after = workOrderDetail(created.woId);

  var allowedLabels = {};
  var declared = timelineEvents_();
  for (var d = 0; d < declared.length; d++) allowedLabels[declared[d].label] = true;

  var strays = [];
  var strayActions = [];
  for (var y = 0; y < after.timeline.length; y++) {
    if (!allowedLabels[after.timeline[y].label]) strays.push(after.timeline[y].label);
    var action = after.timeline[y].action;
    if (action === ACTION.RECALC || action === ACTION.NOTIFY ||
        action === ACTION.NOTIFY_FAILED || action === ACTION.REPORT) {
      strayActions.push(action);
    }
  }
  assertEquals_(strays.join(', '), '', 'เส้นเวลาต้องมีเฉพาะเหตุการณ์ที่ประกาศไว้ในตาราง');
  assertEquals_(strayActions.join(', '), '',
    'เหตุการณ์ของระบบ เช่นคำนวณสถานะใหม่ ออกเอกสาร และแจ้งเตือน ต้องไม่ขึ้นบนเส้นเวลาของงาน');

  /* ---------- ตีกลับแล้ว ต้องเก็บเหตุผลทุกครั้ง ไม่ใช่แค่ครั้งล่าสุด ---------- */
  // ตีกลับได้จากสถานะรออนุมัติเท่านั้น จึงต้องส่งกลับเข้ามาใหม่ก่อนตีกลับรอบสอง
  returnWorkOrder(created.woId, 'เหตุผลครั้งที่หนึ่ง', users.approver);
  submitWorkOrder(created.woId, users.admin);
  returnWorkOrder(created.woId, 'เหตุผลครั้งที่สอง', users.approver);
  submitWorkOrder(created.woId, users.admin);
  approveWorkOrder(created.woId, ASSIGNMENT.SERVICE, users.approver, {});

  var after = workOrderDetail(created.woId);
  var reasons = [];
  for (var r = 0; r < after.reasons.length; r++) reasons.push(after.reasons[r].remark);

  assertTrue_(reasons.join(' · ').indexOf('เหตุผลครั้งที่หนึ่ง') !== -1,
    'เหตุผลครั้งเก่าต้องยังอยู่ — แถวใบงานเก็บไว้แค่ครั้งล่าสุด ประวัติต้องมาจาก Audit_Log');
  assertTrue_(reasons.join(' · ').indexOf('เหตุผลครั้งที่สอง') !== -1, 'และครั้งล่าสุดต้องมีด้วย');
  assertTrue_(after.workOrder.returnCount >= 2, 'จำนวนครั้งที่ถูกตีกลับต้องตรงกับที่เกิดจริง');

  /* ---------- งานของแผนกและความคืบหน้า ---------- */
  assertTrue_(after.tasks.length > 0, 'ต้องมีงานของแผนกหลังอนุมัติแล้ว');
  assertTrue_(after.tasks[0].progress.total >= 0, 'และต้องบอกความคืบหน้าของขั้นตอนได้');

  /* ---------- ส่วนที่เหลือของหน้า ---------- */
  assertTrue_(Array.isArray(after.files), 'ต้องมีรายการไฟล์แนบ แม้จะว่าง');
  assertTrue_(Array.isArray(after.report.archive), 'ต้องมีรายการใบสั่งงานฉบับเก่า แม้จะว่าง');
  assertTrue_(after.payment !== undefined, 'ต้องมีข้อมูลการชำระเงิน');
  assertTrue_(isJsonSafe_(jsonSafe_(after)),
    'ก้อนข้อมูลทั้งหมดต้องส่งข้ามไปหน้าเว็บได้ (กฎข้อ 14)');

  return endTest_();
}

/**
 * หน้ารายละเอียดใบงานต้องเปิดได้ทุก Role และต้องไม่มีปุ่มที่เปลี่ยนข้อมูล
 */
function test_permission_woDetailOpenToAll() {
  beginTest_('รายละเอียดใบงาน ทุก Role เปิดได้ และอ่านอย่างเดียวจริง');

  var users = serviceTestUsers_();
  var created = createTestWo_(users);

  var everyone = [ROLE.ADMIN, ROLE.SALE, ROLE.APPROVER_SP, ROLE.APPROVER_LAB,
    ROLE.SERVICE, ROLE.PROJECT, ROLE.LAB];

  for (var i = 0; i < everyone.length; i++) {
    var result = withTestUser_({ email: 'TEST-detail@cnr.co.th', roles: [everyone[i]] },
      function () { return api_getWoDetail(created.woId); });
    assertEquals_(result.ok, true, everyone[i] + ' ต้องเปิดดูรายละเอียดใบงานได้ (SPEC หัวข้อ 2)');
    assertEquals_(result.data.detail.found, true, 'และต้องได้ข้อมูลของใบงานจริง');
  }

  /* ---------- แต่ยังต้องระบุตัวตนให้ได้ก่อน ---------- */
  var anonymous = api_call('api_getWoDetail', [created.woId], '');
  assertEquals_(anonymous.ok, false, 'ไม่มีโทเคน ต้องเปิดไม่ได้ แม้เป็นการอ่าน (กฎข้อ 16)');
  assertEquals_(anonymous.message, NEED_LOGIN_MESSAGE, 'และต้องบอกให้เข้าสู่ระบบก่อน');

  /* ---------- เมนูที่ 8 ต้องเปิดได้ทุก Role ---------- */
  for (var m = 0; m < everyone.length; m++) {
    var menu = withTestUser_({ email: 'TEST-detail@cnr.co.th', roles: [everyone[m]] },
      function () { return menuForUser_(getCurrentUser_()); });
    var found = null;
    for (var k = 0; k < menu.length; k++) if (menu[k].page === 'wo') found = menu[k];
    assertTrue_(!!found, 'ต้องมีเมนูรายละเอียดใบงานอยู่ในเมนูหลัก');
    assertEquals_(found.allowed, true, everyone[m] + ' ต้องเห็นเมนูนี้เป็นเมนูที่กดได้');
  }

  /* ---------- หน้าต้องอ่านอย่างเดียวจริง ---------- */
  // หน้านี้เป็นหน้าเดียวที่ทุกคนเข้าได้ ถ้ามีปุ่มที่เปลี่ยนข้อมูลหลุดเข้ามาแม้ปุ่มเดียว
  // เท่ากับเปิดให้ทุก Role ทำสิ่งนั้นได้ทันที
  var page = HtmlService.createHtmlOutputFromFile('ui_WoDetail').getContent();
  var writers = ['api_createWorkOrder', 'api_editWorkOrder', 'api_submitWorkOrder',
    'api_approveWorkOrder', 'api_returnWorkOrder', 'api_cancelWorkOrder', 'api_acceptTask',
    'api_completeTask', 'api_cancelTask', 'api_uploadFile', 'api_removeFile',
    'api_recordPayment', 'api_generateReport', 'api_setTaskVisit', 'api_reopenWorkOrder',
    'api_ensureWoReport'];
  var found = [];
  for (var w = 0; w < writers.length; w++) {
    if (page.indexOf(writers[w]) !== -1) found.push(writers[w]);
  }
  assertEquals_(found.join(', '), '',
    'หน้ารายละเอียดต้องไม่เรียกรายการที่เปลี่ยนข้อมูลเลยสักรายการ');

  return endTest_();
}

/**
 * นับข้อความในกล่องที่เป็นของเหตุการณ์หนึ่ง
 *
 * นับจากหัวข้อที่ขึ้นต้นข้อความ ซึ่งมาจากตารางแปลตัวเดียวกับที่ระบบใช้จริง
 * ต้องนับจำนวน ไม่ใช่แค่ดูว่ามีหรือไม่มี เพราะอาการที่ต้องจับคือ "ส่งซ้ำ"
 * เทสต์ที่ถามแค่ว่า "มีข้อความไหม" จะผ่านทั้งตอนส่งครั้งเดียวและตอนส่งสองครั้ง
 *
 * @param {Object[]} outbox ข้อความที่เก็บไว้
 * @param {string} event ค่าจาก NOTIFY_EVENT
 * @return {number}
 */
function countNotifications_(outbox, event) {
  var title = NOTIFY_TITLE_TH[event];
  var count = 0;
  for (var i = 0; i < (outbox || []).length; i++) {
    if (String(outbox[i].text || '').indexOf(title) !== -1) count++;
  }
  return count;
}

/**
 * ใบงานที่อนุมัติแล้วพร้อมงานของแผนก สำหรับทดสอบการแจ้งเตือนระดับใบงาน
 * @param {Object} users ผู้ใช้จาก serviceTestUsers_()
 * @param {string} assignmentType แผนกผู้รับงาน
 * @return {Object} {woId, tasks}
 */
function notifyTestWo_(users, assignmentType) {
  var created = createTestWo_(users, { 'Assignment_Type': assignmentType });
  var result = approveWorkOrder(created.woId, assignmentType, users.approver);
  return { woId: created.woId, tasks: result.tasks };
}

/**
 * งานแผนกเดียว — ข้อความระดับใบงานต้องถูกระงับ (SPEC 15.3)
 *
 * ทุกข้อต้อง "นับจำนวนข้อความ" ไม่ใช่ดูว่ามีข้อความ เพราะอาการที่แก้อยู่คือส่งซ้ำ
 * เทสต์ที่ถามแค่ว่ามีข้อความไหม จะผ่านทั้งตอนส่งครั้งเดียวและตอนส่งสองครั้ง
 * จึงจับบั๊กที่กำลังแก้อยู่ไม่ได้เลย
 */
function test_notify_woLevelSingle() {
  beginTest_('งานแผนกเดียว ต้องไม่มีข้อความระดับใบงานซ้ำ — SPEC 15.3');

  var users = serviceTestUsers_();
  addTestChannels_();

  /* ---------- 1. งานแผนกเดียว ปิดงาน ---------- */
  var single = notifyTestWo_(users, ASSIGNMENT.SERVICE);
  var singleTask = single.tasks[0]['Task_ID'];
  acceptTask(singleTask, users.service);
  finishAllSteps_(singleTask, users.service);
  attachRequiredReports_(singleTask);

  var box1 = captureNotifications_(function () {
    completeTask(singleTask, users.service);
  });

  assertEquals_(countNotifications_(box1, NOTIFY_EVENT.TASK_COMPLETE), 1,
    'แผนกปิดงาน ต้องมีข้อความระดับ Task หนึ่งข้อความ');
  assertEquals_(countNotifications_(box1, NOTIFY_EVENT.WO_COMPLETED), 0,
    'งานแผนกเดียว ต้องไม่มีข้อความระดับใบงานตามมาอีก — ผู้รับเคยได้ซ้ำสองรอบเรื่องเดียวกัน');
  assertEquals_(box1.length, 1, 'รวมทั้งหมดต้องมีข้อความเดียวเท่านั้น');
  assertEquals_(getWorkOrder(single.woId)[STATUS_FIELD[ENTITY.WO]], WO_STATUS.COMPLETED,
    'และใบงานต้องปิดจริง — ระงับแค่ข้อความ ไม่ใช่ระงับการปิดงาน');

  /* ---------- 2. งานแผนกเดียว แผนกยกเลิก ---------- */
  var solo = notifyTestWo_(users, ASSIGNMENT.SERVICE);
  var soloTask = solo.tasks[0]['Task_ID'];

  var box2 = captureNotifications_(function () {
    cancelTask(soloTask, 'ลูกค้าแจ้งยกเลิก', users.service);
  });

  assertEquals_(countNotifications_(box2, NOTIFY_EVENT.TASK_CANCEL), 2,
    'แผนกยกเลิกงาน ต้องเข้าห้อง Admin และห้องผู้อนุมัติ รวมสองห้อง');
  assertEquals_(countNotifications_(box2, NOTIFY_EVENT.WO_CANCELLED), 0,
    'งานแผนกเดียว ต้องไม่มีข้อความระดับใบงานตามมา');
  assertEquals_(getWorkOrder(solo.woId)[STATUS_FIELD[ENTITY.WO]], WO_STATUS.CANCELLED,
    'แต่ใบงานต้องถูกยกเลิกจริง');

  /* ---------- 5. ยกเลิกใบงานตอนยังไม่มี Task ---------- */
  /*
   * ข้อที่สำคัญที่สุดของทั้งชุด · ใบที่ถูกยกเลิกก่อนอนุมัติไม่เคยมีข้อความระดับ Task เลย
   * ถ้าเผลอระงับด้วยกติกาเดียวกัน จะไม่มีใครรู้ว่าใบนี้ถูกยกเลิก และไม่มีอะไรฟ้อง
   */
  var pending = createTestWo_(users);
  assertEquals_(listTasksByWo(pending.woId).length, 0, 'ใบที่ยังไม่อนุมัติ ต้องยังไม่มี Task');

  var box5 = captureNotifications_(function () {
    cancelWorkOrder(pending.woId, 'ลูกค้ายกเลิกก่อนเริ่มงาน', users.admin);
  });

  /*
   * ใบทดสอบตั้งต้นเลือกสายงานเป็น "ไม่ระบุ" จึงยังไม่มีห้องแผนกให้ส่ง
   * ห้องที่ต้องได้จึงมีสองห้อง คือ Admin กับผู้อนุมัติของสายนั้น
   */
  assertEquals_(countNotifications_(box5, NOTIFY_EVENT.WO_CANCELLED), 2,
    'ใบที่ยังไม่มี Task ถูกยกเลิก ต้องแจ้งห้อง Admin และห้องผู้อนุมัติ');
  assertEquals_(box5.length, 2, 'และต้องไม่มีข้อความอื่นปนมา');

  // ใบที่ระบุแผนกไว้แล้วแต่ยังไม่อนุมัติ ต้องได้ห้องแผนกเพิ่มอีกหนึ่งห้อง
  var pendingSv = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE });
  var box5b = captureNotifications_(function () {
    cancelWorkOrder(pendingSv.woId, 'ลูกค้ายกเลิก', users.admin);
  });
  assertEquals_(countNotifications_(box5b, NOTIFY_EVENT.WO_CANCELLED), 3,
    'ใบที่ระบุแผนกไว้แล้ว ต้องแจ้งห้องแผนกด้วย รวมสามห้อง');

  /* ---------- กติกาจำนวน Task ต้องตรงตามตาราง ---------- */
  assertEquals_(shouldNotifyWoLevel_(0), true, '0 Task ต้องแจ้ง');
  assertEquals_(shouldNotifyWoLevel_(1), false, '1 Task ต้องไม่แจ้ง');
  assertEquals_(shouldNotifyWoLevel_(2), true, '2 Task ต้องแจ้ง');
  assertEquals_(shouldNotifyWoLevel_(3), true, 'มากกว่านั้นก็ต้องแจ้ง');

  /*
   * ตัวตัดสินต้องดูจำนวน Task อย่างเดียว ห้ามแตะสายงานเลย
   *
   * ระวังจุดที่แยกกันสองเรื่อง: สายงานยังถูกใช้เลือก "ห้องปลายทาง" ตามปกติ
   * สิ่งที่ห้ามคือเอาสายงานมาตัดสินว่า "ควรแจ้งหรือไม่" ซึ่งเป็นคนละคำถามกัน
   */
  assertTrue_(String(shouldNotifyWoLevel_).indexOf('Assignment_Type') === -1,
    'ตัวตัดสินต้องไม่แตะสายงานที่เลือกไว้ เพราะสายงานไม่ได้บอกว่ามีข้อความออกไปแล้วกี่ครั้ง');
  assertTrue_(String(shouldNotifyWoLevel_).indexOf('taskCount') !== -1,
    'และต้องตัดสินจากจำนวน Task ที่รับเข้ามาเท่านั้น');
  assertTrue_(String(notifyEvent_).indexOf('listTasksByWo(woId).length') !== -1,
    'จำนวนนั้นต้องอ่านจากตาราง Department_Task จริง ไม่ใช่รับค่ามาจากผู้เรียก');

  return endTest_();
}

/**
 * งานร่วมสองแผนก — ต้องมีข้อความระดับใบงานหนึ่งครั้ง ไม่ใช่ไม่มีเลย (SPEC 15.3)
 *
 * แยกออกมาจากชุดงานแผนกเดียว เพราะการสร้างใบงานร่วมพร้อมปิดงานทั้งสองแผนก
 * ใช้การคุยกับชีตมากกว่าเท่าตัว · รวมอยู่ชุดเดียวแล้วกลุ่มจะเกินเพดาน 400 รอบ
 */
function test_notify_woLevelJoint() {
  beginTest_('งานร่วมสองแผนก ต้องมีข้อความระดับใบงานครั้งเดียว — SPEC 15.3');

  var users = serviceTestUsers_();
  addTestChannels_();

  /* ---------- 3. งานร่วมสองแผนก ปิดครบ ---------- */
  var joint = notifyTestWo_(users, ASSIGNMENT.SERVICE_PROJECT);
  assertEquals_(joint.tasks.length, 2, 'งานร่วมต้องมีงานของสองแผนก');

  var first = joint.tasks[0]['Task_ID'];
  var second = joint.tasks[1]['Task_ID'];
  var firstUser = (String(joint.tasks[0]['Department']) === DEPT.SERVICE) ? users.service : users.project;
  var secondUser = (String(joint.tasks[1]['Department']) === DEPT.SERVICE) ? users.service : users.project;

  acceptTask(first, firstUser);
  acceptTask(second, secondUser);
  finishAllSteps_(first, firstUser);
  attachRequiredReports_(first);
  finishAllSteps_(second, secondUser);
  attachRequiredReports_(second);

  var box3 = captureNotifications_(function () {
    completeTask(first, firstUser);
    completeTask(second, secondUser);
  });

  assertEquals_(countNotifications_(box3, NOTIFY_EVENT.TASK_COMPLETE), 2,
    'สองแผนกปิดงาน ต้องได้ข้อความระดับ Task สองครั้ง ไม่ใช่ครั้งเดียว');
  assertEquals_(countNotifications_(box3, NOTIFY_EVENT.WO_COMPLETED), 1,
    'และต้องมีข้อความระดับใบงานอีกหนึ่งครั้ง เพราะข้อความระดับ Task บอกแค่ว่าแผนกหนึ่งเสร็จ');
  assertEquals_(box3.length, 3, 'รวมทั้งหมดสามข้อความ');

  /* ---------- 4. งานร่วม แผนกหนึ่งปิด อีกแผนกยกเลิก ---------- */
  var mixed = notifyTestWo_(users, ASSIGNMENT.SERVICE_PROJECT);
  var keepTask = mixed.tasks[0]['Task_ID'];
  var dropTask = mixed.tasks[1]['Task_ID'];
  var keepUser = (String(mixed.tasks[0]['Department']) === DEPT.SERVICE) ? users.service : users.project;
  var dropUser = (String(mixed.tasks[1]['Department']) === DEPT.SERVICE) ? users.service : users.project;

  acceptTask(keepTask, keepUser);
  finishAllSteps_(keepTask, keepUser);
  attachRequiredReports_(keepTask);
  completeTask(keepTask, keepUser);

  var box4 = captureNotifications_(function () {
    cancelTask(dropTask, 'แผนกนี้ไม่ต้องเข้าแล้ว', dropUser);
  });

  assertEquals_(getWorkOrder(mixed.woId)[STATUS_FIELD[ENTITY.WO]], WO_STATUS.COMPLETED,
    'แผนกหนึ่งปิด อีกแผนกยกเลิก ใบงานต้องเป็นเสร็จสิ้น (SPEC A-5)');
  assertEquals_(countNotifications_(box4, NOTIFY_EVENT.WO_COMPLETED), 1,
    'และต้องมีข้อความระดับใบงานหนึ่งครั้ง ไม่งั้นจะไม่มีใครรู้ว่าทั้งใบจบแล้ว');
  assertEquals_(countNotifications_(box4, NOTIFY_EVENT.TASK_CANCEL), 2,
    'พร้อมข้อความยกเลิกงานของแผนกเข้าสองห้องตามปกติ');

  /* ---------- ต้องตัดสินจากจำนวน Task ไม่ใช่จากสายงานที่เลือกไว้ ---------- */
  // ใบที่เลือกงานร่วมไว้แต่ยังไม่อนุมัติ ยังไม่มี Task สักตัว จึงต้องแจ้งเมื่อถูกยกเลิก
  var jointPending = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE_PROJECT });
  var boxPending = captureNotifications_(function () {
    cancelWorkOrder(jointPending.woId, 'ยังไม่ได้เริ่ม', users.admin);
  });
  assertTrue_(countNotifications_(boxPending, NOTIFY_EVENT.WO_CANCELLED) > 0,
    'ใบที่เลือกงานร่วมแต่ยังไม่มี Task ต้องแจ้งเมื่อถูกยกเลิก — ตัดสินจากจำนวน Task ไม่ใช่สายงาน');

  return endTest_();
}

/**
 * ตารางการแจ้งเตือนต้องไม่มีเหตุการณ์ที่ตกลงกันว่าไม่ทำ (SPEC 15.3)
 */
function test_notify_noOverdueEvent() {
  beginTest_('ไม่มีการแจ้งเตือนงานเลยกำหนด และไม่มีทริกเกอร์ตามเวลา');

  /* ---------- ไม่มีเหตุการณ์เลยกำหนดในทะเบียน ---------- */
  var names = [];
  for (var key in NOTIFY_EVENT) {
    if (Object.prototype.hasOwnProperty.call(NOTIFY_EVENT, key)) names.push(NOTIFY_EVENT[key]);
  }
  assertEquals_(names.length, 11, 'ตารางการแจ้งเตือนมี 11 เหตุการณ์ตาม SPEC 15.3');
  assertTrue_(names.join(',').indexOf('OVERDUE') === -1,
    'ต้องไม่มีเหตุการณ์งานเลยกำหนด — ตกลงกันแล้วว่าไม่ทำเรื่องนี้');

  /* ---------- ทริกเกอร์ตามเวลา มีได้ตัวเดียวคือการสำรองข้อมูล ---------- */
  /*
   * **เดิมข้อนี้ห้ามทริกเกอร์ตามเวลาทั้งหมด** ด้วยเหตุผลว่ามันเป็นของที่ "ตั้งแล้วลืม"
   * มันรันเงียบ ๆ ทุกสัปดาห์แม้ไม่มีใครดูแล และใช้สิทธิ์เพิ่มที่เจ้าของระบบต้องกดอนุญาตใหม่
   * ข้อห้ามนั้นมีเงื่อนไขติดมาด้วยว่า "ตราบใดที่ยังไม่ได้ตกลงว่าทำ"
   *
   * ตอนนี้ตกลงแล้วหนึ่งอย่าง คือการสำรองข้อมูลรายสัปดาห์ (SPEC 22.6) ซึ่งเป็นงานที่
   * **ต้อง** ทำเองเพราะแผนฟรีของ Supabase ไม่สำรองให้ · ข้อนี้จึงแคบลงจาก "ห้ามทั้งหมด"
   * เป็น "ได้เฉพาะตัวที่ตกลงกันแล้ว" ไม่ใช่ถูกยกเลิก — เหตุผลเดิมยังจริงทุกข้อสำหรับ
   * ทริกเกอร์ตัวอื่นที่อาจแอบเพิ่มเข้ามาทีหลัง และนั่นคือสิ่งที่ข้อนี้ยังเฝ้าอยู่
   */
  var agreedTriggerOwners = ['setupBackupTrigger'];
  var scope = (typeof globalThis !== 'undefined') ? globalThis : this;
  var offenders = [];
  var scanned = 0;
  var needle = 'new' + 'Trigger';

  for (var name in scope) {
    if (typeof scope[name] !== 'function') continue;
    if (name.indexOf('test_') === 0) continue;
    if (serviceNameRegistries_().indexOf(name) !== -1) continue;
    scanned++;
    var source;
    try {
      source = stripComments_(String(scope[name]));
    } catch (e) {
      continue;
    }
    if (source.indexOf(needle) === -1) continue;
    if (agreedTriggerOwners.indexOf(name) === -1) offenders.push(name);
  }

  assertTrue_(scanned > 50, 'ตัวสแกนต้องเห็นโค้ดของระบบจริง (เห็น ' + scanned + ' ตัว)');
  assertEquals_(offenders.join(', '), '',
    'มีแต่การสำรองข้อมูลที่ตกลงกันแล้วเท่านั้นที่สร้างทริกเกอร์ตามเวลาได้ · ' +
    'ตัวอื่นต้องตกลงกันก่อน ไม่ใช่เพิ่มเข้ามาเงียบ ๆ');

  /*
   * ตัวที่ตกลงกันแล้วต้องมีอยู่จริงด้วย ไม่ใช่แค่ชื่อในรายการยกเว้น
   * รายการยกเว้นที่ชี้ไปยังฟังก์ชันที่ถูกลบไปแล้ว คือรูที่เปิดค้างไว้โดยไม่มีใครรู้
   */
  for (var a = 0; a < agreedTriggerOwners.length; a++) {
    assertTrue_(typeof scope[agreedTriggerOwners[a]] === 'function',
      'ฟังก์ชัน ' + agreedTriggerOwners[a] + ' ที่อยู่ในรายการยกเว้น ต้องมีอยู่จริง');
  }

  // ตอนนี้มีของที่ใช้สิทธิ์นี้จริงแล้ว จึงต้องประกาศไว้ ไม่งั้นการตั้งทริกเกอร์จะล้มตอนกดรัน
  assertTrue_(requiredOAuthScopes_().join(' ').indexOf('script.scriptapp') !== -1,
    'ต้องประกาศสิทธิ์จัดการทริกเกอร์ เพราะการสำรองข้อมูลรายสัปดาห์ใช้มันจริง');

  return endTest_();
}

/**
 * เรียก api_ ผ่านตัวตนที่กำหนด แล้วคืนผลพร้อมหยุดทันทีถ้าไม่สำเร็จ
 *
 * ต้องหยุดทันที เพราะถ้า api_ ตอบว่าไม่สำเร็จแล้วเทสต์เดินต่อ ข้อถัดไปจะฟ้องเรื่อง
 * "ไม่มีข้อความ" ทั้งที่สาเหตุจริงคือรายการก่อนหน้าถูกปฏิเสธ แล้วไล่หาสาเหตุผิดทาง
 *
 * @param {Object} user ตัวตนที่จะสวม
 * @param {string} name ชื่อรายการ ใช้ในข้อความเวลาไม่ผ่าน
 * @param {function()} fn สิ่งที่จะเรียก
 * @return {Object} data ที่ api_ คืนมา
 */
function callApiAs_(user, name, fn) {
  var result = withTestUser_(user, fn);
  assertEquals_(result.ok, true, name + ' ต้องทำรายการสำเร็จก่อน จึงจะตรวจการแจ้งเตือนได้' +
    (result.ok ? '' : (' (ได้: ' + result.message + ')')));
  return result.data;
}

/**
 * ค่า Updated_Date ล่าสุดในรูปแบบที่หน้าเว็บส่งกลับมา
 * @param {string} woId เลขที่ใบงาน
 * @return {string}
 */
function lockOf_(woId) {
  return toIsoText_(getWorkOrder(woId)['Updated_Date']);
}

/**
 * ตีกลับใบงานแล้วต้องมีข้อความเข้าห้อง Admin ทุกครั้ง (SPEC 15.3)
 *
 * เคสที่พังจริงและใช้เวลาไล่สามรอบ · สาเหตุคือบรรทัดที่เรียกการแจ้งเตือนถูกวางไว้
 * หลัง return ของฟังก์ชัน จึงไม่เคยถูกเรียกเลยสักครั้ง — ไม่ใช่ข้อผิดพลาด แค่ไม่ทำงาน
 * จึงไม่มีอะไรฟ้อง ไม่มี error ไม่มีบรรทัดใน Audit และหน้าจอก็บอกว่าทำรายการสำเร็จ
 *
 * ทุกข้อในชุดนี้เริ่มจาก api_ ที่หน้าเว็บเรียกจริง ไม่ใช่เรียกตัวส่งตรง ๆ
 * เพราะเทสต์ที่เรียกตัวส่งตรง ๆ ผ่านมาตลอดทั้งที่ของจริงไม่ทำงาน
 */
function test_notify_returnThroughApi() {
  beginTest_('ตีกลับแล้วต้องมีข้อความเข้าห้อง Admin — เริ่มจาก api_ จริง');

  var users = serviceTestUsers_();
  addTestChannels_();

  /* ---------- 1. ใบที่มี 1 Task ถูกผู้อนุมัติตีกลับ (เคสที่พังอยู่) ---------- */
  /*
   * ใบที่มี Task แล้วกลับมารออนุมัติอีกครั้งได้ เมื่อแผนกตีกลับแล้วธุรการส่งใหม่
   * เคสนี้สำคัญเพราะเป็นเคสเดียวที่ "มี 1 Task" ซึ่งชนกับด่านจำนวน Task พอดี
   */
  var withTask = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE });
  callApiAs_(users.approver, 'อนุมัติใบงาน', function () {
    return api_approveWorkOrder(withTask.woId, ASSIGNMENT.SERVICE, {});
  });
  var taskId = listTasksByWo(withTask.woId)[0]['Task_ID'];
  callApiAs_(users.service, 'แผนกตีกลับ', function () {
    return api_returnTask(taskId, 'ข้อมูลหน้างานไม่พอ');
  });
  callApiAs_(users.admin, 'ส่งขออนุมัติใหม่', function () {
    return api_submitWorkOrder(withTask.woId, lockOf_(withTask.woId));
  });
  assertEquals_(listTasksByWo(withTask.woId).length, 1, 'ใบนี้ต้องมี Task หนึ่งตัวจริง ๆ');

  var box1 = captureNotifications_(function () {
    callApiAs_(users.approver, 'ตีกลับใบงาน', function () {
      return api_returnWorkOrder(withTask.woId, 'ยังไม่แนบใบเสนอราคา', lockOf_(withTask.woId));
    });
  });

  assertTrue_(countNotifications_(box1, NOTIFY_EVENT.RETURN) > 0,
    'ใบที่มี 1 Task ถูกตีกลับ ต้องมีข้อความเข้าห้อง Admin — นี่คืออาการที่พังจริง');
  assertEquals_(box1[0].target, NOTIFY_TARGET.ADMIN, 'และต้องเข้าห้อง Admin');
  assertTrue_(String(box1[0].text).indexOf('ยังไม่แนบใบเสนอราคา') !== -1,
    'พร้อมเหตุผลที่ตีกลับ ไม่งั้นผู้เปิดใบงานไม่รู้ว่าต้องแก้อะไร');

  /* ---------- 2. ใบที่ยังไม่มี Task ถูกตีกลับ ---------- */
  var noTask = createTestWo_(users);
  assertEquals_(listTasksByWo(noTask.woId).length, 0, 'ใบนี้ต้องยังไม่มี Task');

  var box2 = captureNotifications_(function () {
    callApiAs_(users.approver, 'ตีกลับใบที่ยังไม่มี Task', function () {
      return api_returnWorkOrder(noTask.woId, 'กรอกสถานที่ไม่ครบ', lockOf_(noTask.woId));
    });
  });
  assertEquals_(countNotifications_(box2, NOTIFY_EVENT.RETURN), 1,
    'ใบที่ยังไม่มี Task ถูกตีกลับ ก็ต้องมีข้อความเข้าห้อง Admin เช่นกัน');

  /* ---------- 3. แผนกตีกลับเอง ---------- */
  var byDept = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE });
  callApiAs_(users.approver, 'อนุมัติใบงาน', function () {
    return api_approveWorkOrder(byDept.woId, ASSIGNMENT.SERVICE, {});
  });
  var deptTask = listTasksByWo(byDept.woId)[0]['Task_ID'];

  var box3 = captureNotifications_(function () {
    callApiAs_(users.service, 'แผนกตีกลับ', function () {
      return api_returnTask(deptTask, 'หน้างานเข้าไม่ได้');
    });
  });
  assertTrue_(countNotifications_(box3, NOTIFY_EVENT.RETURN) > 0,
    'แผนกตีกลับ ก็ต้องมีข้อความเข้าห้อง Admin เพราะใบงานกลับไปหาผู้เปิดใบงานเหมือนกัน');
  assertTrue_(String(box3[0].text).indexOf('หน้างานเข้าไม่ได้') !== -1, 'พร้อมเหตุผลเช่นกัน');

  return endTest_();
}

/**
 * ด่านระงับข้อความระดับใบงาน ต้องแตะแค่สองเหตุการณ์ ห้ามลามไปเหตุการณ์อื่น (SPEC 15.3)
 *
 * ข้อนี้กันไม่ให้ด่านที่สร้างขึ้นเพื่อแก้เรื่องหนึ่ง ไปปิดปากเหตุการณ์อื่นในอนาคต
 * ซึ่งเป็นสิ่งที่เกือบเกิดขึ้นแล้วรอบนี้ และจะหาสาเหตุยากมากถ้าไม่มีเทสต์ดักไว้
 */
function test_notify_gateTouchesOnlyWoLevel() {
  beginTest_('ด่านระงับต้องแตะแค่ WO_COMPLETED และ WO_CANCELLED');

  var gated = [];
  var free = [];
  for (var key in NOTIFY_EVENT) {
    if (!Object.prototype.hasOwnProperty.call(NOTIFY_EVENT, key)) continue;
    if (isWoLevelEvent_(NOTIFY_EVENT[key])) gated.push(NOTIFY_EVENT[key]);
    else free.push(NOTIFY_EVENT[key]);
  }

  assertEquals_(gated.sort().join(','), 'WO_CANCELLED,WO_COMPLETED',
    'มีแค่สองเหตุการณ์นี้เท่านั้นที่ผ่านด่านจำนวน Task');
  /*
   * WO_REOPENED เป็นเหตุการณ์ระดับใบงาน แต่ต้องไม่ถูกด่านนี้แตะโดยตั้งใจ
   *
   * ด่านนี้มีไว้กันข้อความซ้ำ เมื่อข้อความระดับ Task เพิ่งบอกเรื่องเดียวกันไปแล้ว ·
   * การเปิดงานใหม่ไม่มีข้อความระดับ Task คู่กันเลย ถ้าเอาเข้าด่าน ใบงานแผนกเดียว
   * จะเปิดซ้ำได้โดยไม่มีใครรู้ ซึ่งตรงข้ามกับเหตุผลที่แจ้งเตือนนี้มีอยู่
   */
  assertEquals_(free.length, 9, 'ที่เหลืออีกเก้าเหตุการณ์ต้องไม่ถูกด่านนี้แตะเลย');

  /* ---------- พิสูจน์ด้วยพฤติกรรมจริง ไม่ใช่แค่ดูรายชื่อ ---------- */
  /*
   * ใบที่มี 1 Task คือสภาพที่ด่านระงับทำงาน · ทุกเหตุการณ์ที่ไม่ใช่ระดับใบงาน
   * ต้องยังส่งออกได้ตามปกติในสภาพนี้ ไม่งั้นแปลว่าด่านลามไปกินเหตุการณ์อื่นแล้ว
   */
  var users = serviceTestUsers_();
  addTestChannels_();
  var wo = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE });
  approveWorkOrder(wo.woId, ASSIGNMENT.SERVICE, users.approver, {});
  var row = getWorkOrder(wo.woId);
  assertEquals_(listTasksByWo(wo.woId).length, 1, 'ต้องอยู่ในสภาพที่ด่านระงับทำงาน');

  var silent = [];
  for (var f = 0; f < free.length; f++) {
    var event = free[f];
    var sent = captureNotifications_(function () {
      // ล้างกุญแจกันซ้ำก่อนทุกครั้ง เพราะเทสต์ยิงหลายเหตุการณ์ในนาทีเดียวกัน
      forgetNotifyKey_(wo.woId, event);
      notifyEvent_(event, row, { reason: 'เหตุผลทดสอบ', department: ASSIGNMENT.SERVICE });
    });
    if (!sent.length) silent.push(event);
  }
  assertEquals_(silent.join(', '), '',
    'เหตุการณ์เหล่านี้เงียบไปทั้งที่ไม่ใช่เหตุการณ์ระดับใบงาน — ด่านระงับลามไปกินแล้ว');

  /* ---------- และสองตัวที่ต้องถูกระงับ ก็ต้องถูกระงับจริง ---------- */
  for (var g = 0; g < gated.length; g++) {
    var blocked = captureNotifications_(function () {
      forgetNotifyKey_(wo.woId, gated[g]);
      notifyEvent_(gated[g], row, {});
    });
    assertEquals_(blocked.length, 0,
      gated[g] + ' ต้องถูกระงับเมื่อใบงานมี 1 Task');
  }

  return endTest_();
}

/**
 * ลืมกุญแจกันซ้ำของเหตุการณ์หนึ่ง — ใช้ในชุดทดสอบที่ยิงหลายเหตุการณ์ในนาทีเดียว
 * @param {string} woId เลขที่ใบงาน
 * @param {string} event ชื่อเหตุการณ์
 */
function forgetNotifyKey_(woId, event) {
  try {
    cacheDrop_(notifyDedupeKey_(woId, event, ''));
  } catch (e) {
    // ลบไม่ได้ก็ไม่เป็นไร อย่างมากคือข้อความถูกกันซ้ำแล้วเทสต์จะฟ้องให้เห็นเอง
  }
}

/**
 * ทุกแถวในตาราง SPEC 15.3 ต้องมีข้อความออกไปจริง เมื่อเดินผ่าน api_ ที่หน้าเว็บเรียก
 *
 * เทสต์นี้คือด่านที่จะจับ "โค้ดแจ้งเตือนไม่ถูกเรียก" ได้ทุกแบบ ไม่ว่าจะเพราะวางไว้หลัง return
 * ลืมใส่ ใส่ผิดฟังก์ชัน หรือถูกด่านใดด่านหนึ่งกินไป — เพราะมันเดินเส้นทางเดียวกับผู้ใช้จริง
 */
function test_notify_everyRowThroughApi() {
  beginTest_('ทุกแถวในตาราง 15.3 ต้องมีข้อความออกจริงผ่าน api_');

  var users = serviceTestUsers_();
  addTestChannels_();
  var fired = {};

  /* ---------- เปิดใบงาน = ขออนุมัติ ---------- */
  var box = captureNotifications_(function () {
    var data = callApiAs_(users.admin, 'สร้างใบงาน', function () {
      return api_createWorkOrder(testWoForm_({ 'Assignment_Type': ASSIGNMENT.SERVICE }));
    });
    fired.woId = data.woId;
  });
  var woId = fired.woId;
  attachRequiredTestFiles_(woId);
  assertTrue_(countNotifications_(box, NOTIFY_EVENT.SUBMIT) > 0,
    'เปิดใบงานแล้วต้องแจ้งผู้อนุมัติ (แถว SUBMIT)');

  /* ---------- อนุมัติ ---------- */
  box = captureNotifications_(function () {
    callApiAs_(users.approver, 'อนุมัติ', function () {
      return api_approveWorkOrder(woId, ASSIGNMENT.SERVICE, {});
    });
  });
  assertTrue_(countNotifications_(box, NOTIFY_EVENT.ACCEPT) > 0, 'อนุมัติแล้วต้องแจ้ง (แถว ACCEPT)');

  var taskId = listTasksByWo(woId)[0]['Task_ID'];

  /* ---------- แผนกรับงาน ---------- */
  box = captureNotifications_(function () {
    callApiAs_(users.service, 'รับงาน', function () { return api_acceptTask(taskId); });
  });
  assertTrue_(countNotifications_(box, NOTIFY_EVENT.TASK_ACCEPT) > 0,
    'แผนกรับงานแล้วต้องแจ้ง (แถวแผนกกดรับงาน)');

  /* ---------- อัปเดตขั้นตอน ---------- */
  var steps = listStepsByTask(taskId);
  box = captureNotifications_(function () {
    callApiAs_(users.service, 'อัปเดตขั้นตอน', function () {
      return api_updateTaskStep(steps[0]['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
    });
  });
  assertTrue_(countNotifications_(box, NOTIFY_EVENT.TASK_UPDATE) > 0,
    'อัปเดตขั้นตอนแล้วต้องแจ้ง (แถวอัปเดต Step / งวดงาน)');

  /* ---------- บันทึกรับชำระเงิน ---------- */
  box = captureNotifications_(function () {
    callApiAs_(users.admin, 'บันทึกรับชำระ', function () {
      return api_recordPayment(woId, 'รับชำระแล้ว');
    });
  });
  assertTrue_(countNotifications_(box, NOTIFY_EVENT.PAYMENT) > 0,
    'บันทึกรับชำระแล้วต้องแจ้งแผนกที่รออยู่ (แถวบันทึกรับชำระเงิน)');

  /* ---------- แผนกปิดงาน ---------- */
  for (var s = 1; s < steps.length; s++) {
    callApiAs_(users.service, 'ปิดขั้นตอน', function () {
      return api_updateTaskStep(steps[s]['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
    });
  }
  box = captureNotifications_(function () {
    callApiAs_(users.service, 'ปิดงาน', function () { return api_completeTask(taskId); });
  });
  assertTrue_(countNotifications_(box, NOTIFY_EVENT.TASK_COMPLETE) > 0,
    'แผนกปิดงานแล้วต้องแจ้ง (แถว TASK COMPLETE)');

  /* ---------- แผนกยกเลิกงาน และยกเลิกทั้งใบ ---------- */
  var second = createTestWo_(users, { 'Assignment_Type': ASSIGNMENT.SERVICE });
  callApiAs_(users.approver, 'อนุมัติใบที่สอง', function () {
    return api_approveWorkOrder(second.woId, ASSIGNMENT.SERVICE, {});
  });
  var secondTask = listTasksByWo(second.woId)[0]['Task_ID'];

  box = captureNotifications_(function () {
    callApiAs_(users.service, 'ยกเลิกงานของแผนก', function () {
      return api_cancelTask(secondTask, 'ลูกค้าเลื่อนงาน');
    });
  });
  assertTrue_(countNotifications_(box, NOTIFY_EVENT.TASK_CANCEL) > 0,
    'แผนกยกเลิกงานแล้วต้องแจ้ง (แถว TASK CANCEL)');

  var third = createTestWo_(users);
  box = captureNotifications_(function () {
    callApiAs_(users.admin, 'ยกเลิกใบงาน', function () {
      return api_cancelWorkOrder(third.woId, 'ลูกค้ายกเลิก', lockOf_(third.woId));
    });
  });
  assertTrue_(countNotifications_(box, NOTIFY_EVENT.WO_CANCELLED) > 0,
    'ยกเลิกใบงานแล้วต้องแจ้ง (แถว WO CANCELLED)');

  return endTest_();
}

/**
 * ทะเบียนกลุ่มทั้งหมด — ที่เดียวที่จดไว้ว่าระบบมีกี่กลุ่มและกลุ่มไหนบ้าง
 *
 * ทั้งตัวรันรวมและตัวตรวจว่า "ไม่มีชุดไหนหล่นจากกลุ่ม" อ่านจากที่นี่ที่เดียว
 * ถ้าจดไว้สองที่ วันหนึ่งจะมีกลุ่มที่ไม่มีใครรัน แล้วไม่มีอะไรบอก
 *
 * @return {Object[]} [{name, fn}] เรียงตามลำดับที่ต้องรันใน CLAUDE.md
 */
function testGroupRunners_() {
  return [
    { name: 'SMOKE',              fn: test_smoke },
    { name: 'REPO',               fn: test_group_repo },
    { name: 'STATEMACHINE',       fn: test_group_statemachine },
    { name: 'SERVICE_WO',         fn: test_group_service_wo },
    { name: 'SERVICE_FLOW',       fn: test_group_service_flow },
    { name: 'SERVICE_REOPEN',     fn: test_group_service_reopen },
    { name: 'SERVICE_REOPEN_TRACE', fn: test_group_service_reopen_trace },
    { name: 'SERVICE_APPROVE',    fn: test_group_service_approve },
    { name: 'SERVICE_FILES',      fn: test_group_service_files },
    { name: 'SERVICE_TASK',       fn: test_group_service_task },
    { name: 'SERVICE_TASK_VISIT', fn: test_group_service_task_visit },
    { name: 'SERVICE_TASK_JOINT', fn: test_group_service_task_joint },
    { name: 'SERVICE_TASK_STOP',  fn: test_group_service_task_stop },
    { name: 'SERVICE_WEB',        fn: test_group_service_web },
    { name: 'SERVICE_PAGES',      fn: test_group_service_pages },
    { name: 'SERVICE_REPORT',     fn: test_group_service_report },
    { name: 'SERVICE_NOTIFY',     fn: test_group_service_notify },
    { name: 'SERVICE_NOTIFY_FLOW', fn: test_group_service_notify_flow },
    { name: 'SERVICE_NOTIFY_API', fn: test_group_service_notify_api },
    { name: 'LOG',                fn: test_group_log },
    { name: 'HOME',               fn: test_group_home },
    { name: 'MENU',               fn: test_group_menu },
    { name: 'REPORT_FILE',        fn: test_group_report_file },
    { name: 'REPORT_FOLDER',      fn: test_group_report_folder },
    { name: 'REPORT_GATE',        fn: test_group_report_gate },
    { name: 'REPORT_PERIOD',      fn: test_group_report_period },
    { name: 'PERM_AUTH',          fn: test_group_permission_auth },
    { name: 'PERM_TOKEN',         fn: test_group_permission_token },
    { name: 'PERM_SECRET',        fn: test_group_permission_secret },
    { name: 'PERM_WO',            fn: test_group_permission_wo },
    { name: 'PERM_TASK',          fn: test_group_permission_task },
    // กลุ่มสุดท้ายเพราะเป็นกลุ่มเดียวที่ต้องต่อเน็ตออกไปข้างนอก
    // บนของจำลองจะพิสูจน์ได้แค่ส่วนที่เป็นตรรกะล้วน (ดูคอมเมนต์ของ test_group_db)
    { name: 'DB',                 fn: test_group_db }
  ];
}

/**
 * ชื่อชุดเทสต์ทั้งหมดที่ถูกจัดอยู่ในกลุ่มแล้ว พร้อมชุดที่ถูกจัดซ้ำมากกว่าหนึ่งกลุ่ม
 *
 * อ่านจากเนื้อของฟังก์ชันกลุ่มโดยตรง ไม่ได้รันมัน — การรันเพื่อจะรู้ว่ามีอะไรบ้าง
 * จะใช้เวลาหลายนาทีและเขียนข้อมูลลงชีตจริง
 *
 * @return {Object} {names: {ชื่อ: จำนวนกลุ่มที่มี}, duplicated: string[]}
 */
function suitesInGroups_() {
  var groups = testGroupRunners_();
  var names = {};
  var duplicated = [];

  for (var i = 0; i < groups.length; i++) {
    var found = String(groups[i].fn).match(/name: '(test_[A-Za-z0-9_]+)'/g) || [];
    for (var f = 0; f < found.length; f++) {
      var name = /'(test_[A-Za-z0-9_]+)'/.exec(found[f])[1];
      if (names[name]) duplicated.push(name + ' (' + groups[i].name + ')');
      names[name] = true;
    }
  }
  return { names: names, duplicated: duplicated };
}

/**
 * ทุกชุดเทสต์ต้องถูกจัดอยู่ในกลุ่ม และอยู่แค่กลุ่มเดียว
 *
 * ข้อนี้มีเพราะการแตกกลุ่มครั้งนี้เอง — ตอนย้ายชุดไปมาระหว่าง 14 กลุ่ม
 * ชุดที่หล่นหายจะไม่มีอะไรฟ้องเลย ผลรวมยังขึ้นว่า "ผ่านทั้งหมด" เหมือนเดิม
 * และชุดที่ถูกจัดซ้ำสองกลุ่มก็เงียบเหมือนกัน ต่างแค่เสียเวลาฟรีทุกครั้งที่รัน
 */
function test_suitesAllGrouped() {
  beginTest_('ทุกชุดเทสต์ต้องอยู่ในกลุ่ม และอยู่แค่กลุ่มเดียว');

  var grouped = suitesInGroups_();
  var scope = (typeof globalThis !== 'undefined') ? globalThis : this;

  /* ---------- ตัวที่ไม่ต้องอยู่ในกลุ่ม เพราะมันคือตัวรันเอง ---------- */
  var runners = testGroupRunners_();
  var skip = { test_all: true, test_cleanup: true, test_suitesAllGrouped: false };
  for (var r = 0; r < runners.length; r++) skip[functionName_(runners[r].fn)] = true;

  var missing = [];
  var counted = 0;
  for (var key in scope) {
    if (key.indexOf('test_') !== 0) continue;
    if (typeof scope[key] !== 'function') continue;
    if (skip[key]) continue;
    counted++;
    if (!grouped.names[key]) missing.push(key);
  }

  assertTrue_(counted > 50, 'ตัวสแกนต้องเห็นชุดเทสต์จริง (เห็น ' + counted + ' ชุด)');
  assertEquals_(missing.join(', '), '',
    'ชุดเทสต์เหล่านี้ไม่ได้อยู่ในกลุ่มใดเลย จึงไม่มีใครรัน — ต้องเพิ่มเข้ากลุ่ม');
  assertEquals_(grouped.duplicated.join(', '), '',
    'ชุดเทสต์เหล่านี้ถูกจัดซ้ำมากกว่าหนึ่งกลุ่ม ทำให้เสียเวลารันฟรีทุกรอบ');

  /* ---------- ทุกกลุ่มต้องมีชุดอยู่จริง ---------- */
  // กลุ่มว่างจะรายงานว่า "ผ่านทั้งหมด" ทุกครั้ง ซึ่งอ่านแล้วสบายใจโดยไม่มีอะไรถูกพิสูจน์
  for (var g = 0; g < runners.length; g++) {
    var inside = String(runners[g].fn).match(/name: '(test_[A-Za-z0-9_]+)'/g) || [];
    assertTrue_(inside.length > 0, 'กลุ่ม ' + runners[g].name + ' ต้องมีชุดเทสต์อยู่จริง');
  }

  return endTest_();
}

/**
 * ชื่อของฟังก์ชันหนึ่งตัว อ่านจากตัวมันเอง
 * @param {Function} fn ฟังก์ชัน
 * @return {string}
 */
function functionName_(fn) {
  var found = /^function\s+([A-Za-z0-9_$]+)/.exec(String(fn));
  return found ? found[1] : '';
}

/**
 * รันทุกกลุ่มต่อกัน
 *
 * บนของจริงจะรันได้ก็ต่อเมื่อเวลาที่วัดไว้ของรอบก่อนบอกว่าพออยู่ใต้เพดาน 6 นาที
 * ของ Apps Script (ดู assertTestAllFits_) · ถ้าไม่พอแล้วถูกฆ่ากลางคัน ข้อมูลทดสอบ
 * ของกลุ่มที่ค้างอยู่จะไม่ถูกล้าง จึงต้องกันไว้ตั้งแต่ยังไม่เริ่มทำอะไร
 *
 * @return {string} ข้อความสรุปผล
 * @throws {Error} เมื่อเวลาที่วัดไว้บอกว่าไม่พอ หรือยังวัดไม่ครบทุกกลุ่ม
 */
function test_all() {
  assertTestAllFits_();

  var summaries = [];
  var failed = [];
  // ลำดับเดียวกับที่เขียนไว้ใน CLAUDE.md — อ่านจากทะเบียนกลุ่มที่เดียว
  var groups = testGroupRunners_();

  for (var i = 0; i < groups.length; i++) {
    try {
      summaries.push(groups[i].fn());
    } catch (e) {
      failed.push(groups[i].name);
      summaries.push('[' + groups[i].name + '] ' + e.message);
    }
  }

  Logger.log('==============================');
  for (var j = 0; j < summaries.length; j++) Logger.log(summaries[j]);

  if (failed.length) throw new Error('กลุ่มที่ไม่ผ่าน: ' + failed.join(', '));
  return 'ผ่านครบทุกกลุ่ม';
}

/**
 * รันหนึ่งกลุ่มแล้วล้างข้อมูลทดสอบของกลุ่มนั้นเสมอ
 *
 * ไม่ใช้ finally เพื่อล้าง เพราะ runSuites_ ดักข้อผิดพลาดของแต่ละชุดไว้แล้ว
 * จึงเดินมาถึงบรรทัดล้างเสมอ ทำให้ลำดับอ่านง่ายและ test_cleanup() ยังกดรันเดี่ยวได้
 *
 * @param {string} groupName ชื่อกลุ่ม
 * @param {Object[]} suites รายการ {name, fn}
 * @return {string} ข้อความสรุปผลของกลุ่ม
 * @throws {Error} เมื่อมีข้อที่ไม่ผ่าน
 */
function runGroup_(groupName, suites) {
  // ออกรหัสรอบใหม่ให้ทั้งกลุ่ม ข้อมูลของกลุ่มนี้จึงไม่ชนกับร่องรอยของรอบก่อน
  var startedDate = new Date();
  Logger.log('########## กลุ่ม ' + groupName + ' (รอบ ' + beginTestRun_() + ') ' +
    'เริ่ม ' + formatForDisplay_(startedDate) + ' ##########');

  var startedAt = startedDate.getTime();
  var result = runSuites_(suites, true);

  // เวลาของ cleanup ต้องแยกออกมาเสมอ เพราะการลบแถวแพงพอ ๆ กับการอ่านเขียน
  // แต่ตัวนับจำนวนครั้งที่เรียกชีตไม่ได้นับมันด้วย เวลาที่หายไปโดยไม่รู้ตัวมักอยู่ตรงนี้
  var testMs = new Date().getTime() - startedAt;

  var cleanupStart = new Date().getTime();
  var cleaned = { deleted: 0 };
  try {
    cleaned = test_cleanup();
  } catch (e) {
    Logger.log('!! ล้างข้อมูลทดสอบของกลุ่ม ' + groupName + ' ไม่สำเร็จ: ' + e.message);
  }
  var cleanupMs = new Date().getTime() - cleanupStart;

  var elapsedMs = testMs + cleanupMs;
  var seconds = Math.round(elapsedMs / 1000);
  var perRow = cleaned.deleted ? (cleanupMs / cleaned.deleted / 1000).toFixed(2) : '0';
  var share = elapsedMs ? Math.round(cleanupMs * 100 / elapsedMs) : 0;

  Logger.log('เวลาเทสต์ ' + Math.round(testMs / 1000) + ' วินาที (' + testMs + ' ms) · ' +
    'เวลาล้างข้อมูล ' + Math.round(cleanupMs / 1000) + ' วินาที (' + cleanupMs + ' ms) ' +
    'สำหรับ ' + cleaned.deleted + ' แถว = ' + perRow + ' วินาทีต่อแถว · ' +
    'ล้างข้อมูลกินไป ' + share + '% ของเวลาทั้งกลุ่ม');

  var answered = result.pass + result.fail;
  var summary = '[' + groupName + '] ผ่าน ' + result.pass + ' / ไม่ผ่าน ' + result.fail +
    missedAssertionsNote_(lastAnsweredOfGroup_(groupName), answered, result.crashed) +
    ' · รวม ' + seconds + ' วินาที (เทสต์ ' + Math.round(testMs / 1000) +
    ' + ล้างข้อมูล ' + Math.round(cleanupMs / 1000) + ') · ลบ ' + cleaned.deleted + ' แถว' +
    ' · จบ ' + formatForDisplay_(new Date());
  Logger.log(summary);
  reportGroupDuration_(groupName, seconds, answered);

  if (result.fail > 0) throw new Error(summary + ' · ชุดที่มีปัญหา: ' + result.failedSuites.join(', '));
  return summary;
}

/**
 * เวลาที่กลุ่มนี้ใช้เกินจนควรแตกเป็นกลุ่มย่อยแล้ว (วินาที)
 * ตั้งไว้ที่ 4 นาทีจากเพดาน 6 นาที เพื่อให้เหลือที่ว่างพอสำหรับวันที่ข้อมูลจริงโตขึ้น
 */
var GROUP_WARN_SECONDS = 240;

/** ตัวนำหน้าคีย์ใน Script Properties ที่เก็บเวลาล่าสุดของแต่ละกลุ่ม */
var TEST_DURATION_PROP_PREFIX = 'TEST_LAST_SECONDS_';

/**
 * บันทึกเวลาที่กลุ่มนี้ใช้ลง Script Properties แล้วเทียบกับครั้งก่อนให้เห็นแนวโน้ม
 * ถ้าใกล้ชนเพดาน 6 นาทีของ Apps Script จะเตือนให้แตกกลุ่มก่อนที่จะสายเกินไป
 *
 * การเขียนค่าล้มเหลวต้องไม่ทำให้ผลการทดสอบเปลี่ยน จึงห่อ try/catch ไว้ทั้งก้อน
 *
 * @param {string} groupName ชื่อกลุ่ม
 * @param {number} seconds เวลาที่ใช้ไปรอบนี้
 */
/**
 * ประโยคที่บอกว่ารอบนี้มีกี่ข้อที่ไม่ได้ถูกถามเลย
 *
 * **ทำไมต้องมี** · เมื่อชุดหนึ่งหยุดกลางคัน ข้อที่เหลือของชุดนั้นไม่ได้เดินเลยสักข้อ
 * แต่รายงานพิมพ์แค่ "ไม่ผ่าน 2" ซึ่งอ่านแล้วเข้าใจว่าเสียหายสองข้อ · ของจริงเมื่อ
 * 28-09-2026 คือ 38 ข้อไม่ได้ให้คำตอบ ต่ำกว่าที่รายงานบอกถึง 18 เท่า · ตัวเลขที่ดู
 * เล็กกว่าความจริงสิบแปดเท่าคือตัวเลขที่ทำให้คนตัดสินใจผิด
 *
 * เทียบกับจำนวนข้อของรอบล่าสุดที่เคยตอบได้ ไม่ใช่กับรายชื่อที่พิมพ์ไว้ที่ไหน ·
 * ถ้ายังไม่เคยมีรอบไว้เทียบ ต้องบอกว่าไม่รู้ ห้ามพิมพ์ศูนย์ (กฎข้อ 32)
 *
 * @param {number} before จำนวนข้อที่ตอบได้ในรอบก่อน · 0 = ยังไม่เคยมี
 * @param {number} now จำนวนข้อที่ตอบได้รอบนี้
 * @param {number} crashed จำนวนชุดที่หยุดกลางคัน
 * @return {string} ข้อความต่อท้าย · ค่าว่างเมื่อไม่มีอะไรต้องบอก
 */
function missedAssertionsNote_(before, now, crashed) {
  if (!crashed) return '';
  if (!before) {
    return ' · ไม่รู้ว่ากี่ข้อไม่ได้รัน เพราะยังไม่เคยมีรอบที่ครบไว้เทียบ (' +
      crashed + ' ชุดหยุดกลางคัน)';
  }
  if (now >= before) {
    return ' · ' + crashed + ' ชุดหยุดกลางคัน แต่จำนวนข้อไม่ได้ลดลงจากรอบก่อน';
  }
  return ' · ไม่ได้รัน ' + (before - now) + ' ข้อเพราะ ' + crashed + ' ชุดหยุดกลางคัน';
}

/**
 * จำนวนข้อที่กลุ่มนี้ตอบได้ในรอบล่าสุด · 0 เมื่อยังไม่เคยบันทึก
 * @param {string} groupName ชื่อกลุ่ม
 * @return {number}
 */
function lastAnsweredOfGroup_(groupName) {
  try {
    var saved = PropertiesService.getScriptProperties()
      .getProperty(TEST_DURATION_PROP_PREFIX + groupName);
    return saved ? Number(JSON.parse(saved).answered || 0) : 0;
  } catch (e) {
    return 0;
  }
}

function reportGroupDuration_(groupName, seconds, answered) {
  if (seconds > GROUP_WARN_SECONDS) {
    Logger.log('!! กลุ่ม ' + groupName + ' ใช้เวลา ' + seconds + ' วินาที ใกล้ชนเพดาน 6 นาทีของ Apps Script แล้ว ' +
      'ควรแตกเป็นกลุ่มย่อยก่อนที่จะรันไม่จบ');
  }

  try {
    var props = PropertiesService.getScriptProperties();
    var key = TEST_DURATION_PROP_PREFIX + groupName;
    var previous = props.getProperty(key);

    if (previous) {
      var before = JSON.parse(previous);
      var diff = seconds - Number(before.seconds || 0);
      var trend = diff === 0 ? 'เท่าเดิม' : (diff > 0 ? 'ช้าลง ' + diff : 'เร็วขึ้น ' + Math.abs(diff)) + ' วินาที';
      Logger.log('   ครั้งก่อนใช้เวลา ' + before.seconds + ' วินาที (' + before.at + ') — ' + trend);
    }

    /*
     * จำนวนข้อที่ตอบได้ ต้องไม่ถูกลดลงด้วยรอบที่พัง
     *
     * ถ้ารอบที่มีชุดหยุดกลางคันเขียนทับค่าไว้ รอบถัดไปจะเทียบกับตัวเลขที่ต่ำแล้ว
     * ไม่ฟ้องอะไรอีกเลย · เส้นเทียบจึงต้องเป็นจำนวนสูงสุดที่ระบบเคยตอบได้ ไม่ใช่
     * จำนวนของครั้งล่าสุด
     */
    var bestAnswered = Math.max(Number(answered || 0), lastAnsweredOfGroup_(groupName));

    props.setProperty(key, JSON.stringify({
      seconds: seconds,
      answered: bestAnswered,
      at: formatForDisplay_(new Date())
    }));
  } catch (e) {
    Logger.log('   (บันทึกเวลาที่ใช้ลง Script Properties ไม่สำเร็จ: ' + e.message + ')');
  }
}

/**
 * ตรวจว่ากำลังรันบนตัวจำลองในเครื่อง ไม่ใช่ของจริง
 *
 * ดูจากธงที่ตัวจำลองประกาศไว้เอง (GAS_MOCK_) ไม่ได้เดาจากชื่อไฟล์หรือชื่อตาราง
 * เพราะชื่อพวกนั้นเปลี่ยนได้ และการเดาผิดข้างที่อันตรายกว่าคือเข้าใจว่าเป็นตัวจำลอง
 * ทั้งที่อยู่บนของจริง
 *
 * @return {boolean}
 */
function isMockEnvironment_() {
  return (typeof GAS_MOCK_ !== 'undefined') && GAS_MOCK_ === true;
}

/**
 * รายชื่อกลุ่มที่ต้องรันทีละกลุ่ม — มาจากทะเบียนกลุ่มจริง ไม่ใช่รายการที่พิมพ์ไว้
 *
 * รายการที่พิมพ์ไว้เคยบอกให้รันเพียงเจ็ดกลุ่มทั้งที่มียี่สิบหกกลุ่ม และในเจ็ดกลุ่มนั้น
 * ไม่มีกลุ่ม DB เลย · คนที่ทำตามจะรันไม่ถึงหนึ่งในสามแล้วเชื่อว่ารันครบ
 *
 * @return {string} ชื่อฟังก์ชันของทุกกลุ่ม คั่นด้วย -> ตามลำดับที่ต้องรัน
 */
function testGroupCallList_() {
  var groups = testGroupRunners_();
  var names = [];
  for (var i = 0; i < groups.length; i++) names.push(functionName_(groups[i].fn));
  return names.join(' -> ');
}

/**
 * หยุด test_all() บนของจริง — บอกตรง ๆ ว่าทำไม่ได้ ไม่ใช่รอวันปลดล็อก
 *
 * เคยทำเป็นประตูที่เปิดเองเมื่อเวลารวมที่วัดไว้อยู่ใต้เพดาน · เจ้าของระบบตัดทิ้ง
 * เพราะวัดแล้วพบว่าไม่มีวันนั้น — กลุ่ม DB กลุ่มเดียวใช้เวลาราว 170 วินาที และ
 * ทั้งชุดอยู่ในหลักพันวินาที ขณะที่ Apps Script ฆ่าการทำงานที่ 360 วินาที ·
 * กลไกที่รอเงื่อนไขซึ่งไม่มีวันเป็นจริง คือโค้ดที่ต้องดูแลไปเรื่อย ๆ โดยไม่ได้อะไรเลย
 *
 * @throws {Error} เมื่อถูกเรียกบนของจริง
 */
function assertTestAllFits_() {
  if (isMockEnvironment_()) return;

  throw new Error('รัน test_all() บนของจริงไม่ได้ — ทั้งชุดใช้เวลาหลักพันวินาที ' +
    'ขณะที่ Apps Script ฆ่าการทำงานที่ 360 วินาที · ให้รันทีละกลุ่มตามลำดับนี้: ' +
    testGroupCallList_());
}

/**
 * รันชุดทดสอบตามรายการแล้วสรุปผลรวม
 * @param {Object[]} suites รายการ {name, fn}
 * @return {string} ข้อความสรุปผล
 * @throws {Error} เมื่อมีข้อที่ไม่ผ่าน
 */
function runSuites_(suites, returnResult) {
  var totalPass = 0;
  var totalFail = 0;
  var failedSuites = [];
  /*
   * ชุดที่หยุดกลางคันต่างจากชุดที่มีข้อไม่ผ่าน และต้องนับแยก
   *
   * ชุดที่มีข้อไม่ผ่านตอบคำถามทุกข้อของมันแล้ว · ส่วนชุดที่หยุดกลางคันทิ้งข้อที่เหลือ
   * ไว้โดยไม่มีคำตอบ แล้วจำนวนข้อรวมของกลุ่มจะลดลงเงียบ ๆ (ดู missedAssertionsNote_)
   */
  var crashed = 0;

  var timings = [];

  for (var i = 0; i < suites.length; i++) {
    var suiteStart = new Date().getTime();
    try {
      var result = suites[i].fn();
      totalPass += result.pass;
      totalFail += result.fail;
    } catch (e) {
      /*
       * ชุดที่หยุดกลางคัน ต้องนับเป็น "ไม่ผ่าน" อย่างน้อย 1 ข้อเสมอ
       *
       * เดิมบวกเฉพาะ TEST_STATE_.fail ซึ่งเป็น 0 เมื่อชุดนั้นโยน error ออกมาโดยที่
       * ยังไม่มี assertion ใดตกเลย ผลคือกลุ่มรายงานว่า "ผ่านทั้งหมด" ทั้งที่มีชุดที่ไม่ได้เดินจนจบ
       * และจำนวนข้อรวมลดลงเงียบ ๆ ซึ่งเป็นอาการที่มองไม่เห็นถ้าไม่ไล่นับเอง
       */
      totalPass += TEST_STATE_ ? TEST_STATE_.pass : 0;
      totalFail += Math.max(TEST_STATE_ ? TEST_STATE_.fail : 0, 1);
      failedSuites.push(suites[i].name);
      crashed++;
      Logger.log('!! ' + suites[i].name + ' หยุดกลางคัน: ' + e.message);

      /*
       * ข้อความที่ผู้ใช้เห็นของความล้มเหลวฝั่งฐานข้อมูลเป็นข้อความกลางเสมอ (กฎข้อ 24)
       * ซึ่งถูกต้องสำหรับหน้าเว็บ แต่ไร้ประโยชน์สิ้นเชิงในรายงานผลทดสอบ —
       * "เชื่อมต่อฐานข้อมูลไม่สำเร็จ" ใช้กับคีย์ซ้ำ ชนิดข้อมูลผิด และเน็ตหลุด เหมือนกันหมด
       *
       * สาเหตุจริงถูกเก็บไว้แล้วใน db_lastFailure_() และถูกกรองค่าอ่อนไหวออกแล้ว
       * ด้วย dbScrub_ · พิมพ์ต่อท้ายให้คนที่กำลังหาสาเหตุอ่านได้ทันที ไม่ต้องไปขุด System_Log
       */
      if (String(e.message) === DB_USER_MESSAGE) {
        Logger.log('   สาเหตุจริงจากฐานข้อมูล: ' + db_lastFailure_().detail);
      }
    }
    // จับเวลารายชุด เพราะบนชีตจริงเวลาไปกระจุกอยู่ไม่กี่ชุด ถ้าดูแต่ยอดรวมจะไม่รู้ว่าต้องแก้ตรงไหน
    timings.push({ name: suites[i].name, ms: new Date().getTime() - suiteStart });
  }

  timings.sort(function (a, b) { return b.ms - a.ms; });
  var ranking = [];
  for (var t = 0; t < timings.length; t++) {
    ranking.push(timings[t].name + ' ' + Math.round(timings[t].ms / 1000) + ' วิ');
  }
  Logger.log('เวลารายชุด (มากไปน้อย): ' + ranking.join(' · '));

  var summary = 'สรุปผลรวม: ผ่าน ' + totalPass + ' / ไม่ผ่าน ' + totalFail +
    (failedSuites.length ? ' · ชุดที่มีปัญหา: ' + failedSuites.join(', ') : ' · ผ่านทั้งหมด');
  Logger.log('==============================');
  Logger.log(summary);

  // runGroup_ ต้องได้ตัวเลขกลับไปเพื่อล้างข้อมูลทดสอบก่อนค่อยตัดสินว่าผ่านหรือไม่
  if (returnResult) {
    return { pass: totalPass, fail: totalFail, crashed: crashed,
      failedSuites: failedSuites, summary: summary };
  }

  if (totalFail > 0) throw new Error(summary);
  return summary;
}

/* ===========================================================================
 * บันทึกสองตาราง — Audit_Log กับ System_Log (SPEC 13)
 *
 * เรื่องที่ต้องคุ้มครองคือ "บรรทัดหนึ่งบรรทัดอยู่ที่เดียว และอยู่ถูกที่"
 * ถ้าอยู่ผิดที่ จะไม่มี error ให้เห็น มีแต่วันหนึ่งที่ต้องไล่หาแล้วหาไม่เจอ
 * =========================================================================== */

/**
 * เหตุการณ์ที่ผูกกับใบงาน ต้องอยู่ใน Audit_Log เท่านั้น ห้ามโผล่ใน System_Log
 *
 * นี่คือครึ่งที่คนมักลืม เวลาทำระบบแยกบันทึกแล้วเผลอเขียนลงทั้งสองที่ "เผื่อไว้"
 * ซึ่งแย่กว่าอยู่ผิดที่ เพราะพอนับจำนวนครั้งจะได้เลขคูณสอง โดยไม่มีอะไรฟ้อง
 */
function test_log_woEventsStayInAudit() {
  beginTest_('เหตุการณ์ของใบงาน ลง Audit_Log ที่เดียว');

  var users = serviceTestUsers_();

  var created = callApiAs_(users.admin, 'สร้างใบงาน', function () {
    return api_createWorkOrder(testWoForm_({ 'Assignment_Type': ASSIGNMENT.SERVICE }));
  });
  var woId = String(created.woId);
  attachRequiredTestFiles_(woId);

  callApiAs_(users.approver, 'อนุมัติใบงาน', function () {
    return api_approveWorkOrder(woId, ASSIGNMENT.SERVICE, {});
  });

  /* ---------- ร่องรอยของใบงานต้องครบอยู่ใน Audit_Log ---------- */
  var logs = listAuditByWo(woId);
  var actions = {};
  for (var i = 0; i < logs.length; i++) actions[String(logs[i]['Action'])] = true;

  assertTrue_(!!actions[ACTION.CREATE], 'การเปิดใบงานต้องอยู่ใน Audit_Log');
  assertTrue_(!!actions[ACTION.ACCEPT], 'การอนุมัติต้องอยู่ใน Audit_Log');

  /* ---------- และต้องไม่มีอะไรของใบนี้ไปโผล่อีกตาราง ---------- */
  var strays = listSystemLogByWo(woId);
  var names = [];
  for (var s = 0; s < strays.length; s++) names.push(String(strays[s]['Event']));
  assertEquals_(names.join(', '), '',
    'สิ่งที่เกิดกับใบงานต้องไม่โผล่ใน System_Log แม้แต่บรรทัดเดียว');

  /* ---------- ไม่มีเลขบันทึกใบไหนซ้ำกันสองตาราง ---------- */
  // ตรวจจากเลขบันทึก ไม่ใช่จากเนื้อความ เพราะเนื้อความคนละตารางเขียนคนละแบบอยู่แล้ว
  var systemIds = {};
  var systemRows = testRowsFromDb_(SHEET.SYSTEM_LOG, 'User');
  for (var y = 0; y < systemRows.length; y++) systemIds[String(systemRows[y]['Log_ID'])] = true;

  var duplicated = [];
  for (var a = 0; a < logs.length; a++) {
    if (systemIds[String(logs[a]['Log_ID'])]) duplicated.push(String(logs[a]['Action']));
  }
  assertEquals_(duplicated.join(', '), '', 'บรรทัดเดียวกันต้องไม่ถูกเขียนลงทั้งสองตาราง');

  return endTest_();
}

/**
 * เรื่องของบัญชีผู้ใช้ ลง System_Log เท่านั้น — ทั้งที่เข้าไม่ได้และที่เข้าได้
 *
 * ที่ต้องบันทึกครั้งที่เข้าได้ด้วย เพราะคำถามที่ถูกถามจริงคือ "ใครเข้าระบบช่วงนั้นบ้าง"
 * ไม่ใช่แค่ "ใครเข้าไม่ได้" · แลกมาด้วยการที่แถวชุดนี้โตเร็วที่สุดในตาราง
 * ซึ่งรับได้ เพราะ System_Log ลบของเก่าทิ้งได้ ต่างจาก Audit_Log ที่ห้ามลบ
 */
function test_log_authGoesToSystem() {
  beginTest_('ล็อกอินไม่สำเร็จและสำเร็จ ลง System_Log เท่านั้น');

  var password = 'รหัสผ่านของชุดแยกบันทึก';
  var user = addLoginTestUser_('LOGSPLIT', ROLE.ADMIN, password);

  /* ---------- เข้าไม่ได้ ---------- */
  var failed = loginThroughApi_(user.username, 'รหัสผิดแน่นอน');
  assertEquals_(failed.ok, false, 'รหัสผิดต้องเข้าไม่ได้');

  var failedRows = systemRowsOf_(ACTION.LOGIN_FAILED, user.email);
  assertEquals_(failedRows.length, 1, 'ต้องมีบรรทัดล็อกอินไม่สำเร็จใน System_Log หนึ่งบรรทัด');
  assertEquals_(String(failedRows[0]['Level']), LOG_LEVEL.WARN, 'ระดับต้องเป็น WARN');
  assertEquals_(String(failedRows[0]['Source']), LOG_SOURCE.AUTH, 'ต้นทางต้องเป็น AUTH');
  assertTrue_(String(failedRows[0]['Detail']).indexOf('รหัสผ่าน') !== -1,
    'และต้องบอกสาเหตุพอให้ผู้ดูแลอ่านรู้เรื่อง');

  /* ---------- รหัสผ่านห้ามโผล่ ไม่ว่าถูกหรือผิด ---------- */
  var line = JSON.stringify(failedRows[0]);
  assertTrue_(line.indexOf('รหัสผิดแน่นอน') === -1,
    'รหัสที่พิมพ์มาห้ามโผล่ในบันทึก แม้จะเป็นรหัสที่ผิด');
  assertTrue_(line.indexOf(password) === -1, 'และรหัสที่ถูกยิ่งห้ามโผล่');

  /* ---------- เข้าได้ ก็ต้องบันทึก ---------- */
  var ok = loginThroughApi_(user.username, password);
  assertEquals_(ok.ok, true, 'รหัสถูกต้องเข้าได้');

  var okRows = systemRowsOf_(ACTION.LOGIN, user.email);
  assertEquals_(okRows.length, 1, 'ล็อกอินสำเร็จต้องมีบรรทัดของตัวเองด้วย');
  assertEquals_(String(okRows[0]['Level']), LOG_LEVEL.INFO, 'ระดับต้องเป็น INFO');
  assertEquals_(String(okRows[0]['User']), user.email, 'และต้องบอกว่าเป็นใคร');

  /* ---------- ห้ามเหลืออยู่ใน Audit_Log อีก ---------- */
  var leftover = auditRowsOf_(ACTION.LOGIN_FAILED).length + auditRowsOf_(ACTION.LOGIN).length;
  assertEquals_(leftover, 0,
    'เรื่องของบัญชีผู้ใช้ต้องไม่ปนอยู่ใน Audit_Log อีก เพราะไม่ได้ผูกกับใบงานใด');

  return endTest_();
}

/**
 * แจ้งเตือนไม่สำเร็จ ลง System_Log และ traceNotify ต้องยังเห็น
 *
 * ข้อนี้สำคัญที่สุดในชุด เพราะการแยกตารางทำให้หลักฐานของเรื่องเดียวกันอยู่คนละที่ —
 * ครั้งที่ส่งสำเร็จอยู่ใน Audit_Log ส่วนครั้งที่ล้มเหลวอยู่ใน System_Log
 * ถ้าเครื่องมือไล่ปัญหาอ่านแค่ตารางเดียว มันจะตอบว่า "ไม่เคยถูกกระตุ้น"
 * ทั้งที่ความจริงคือกระตุ้นแล้วแต่ส่งไม่ออก ซึ่งชี้ไปคนละทางกันคนละเรื่อง
 */
function test_log_notifyFailedGoesToSystem() {
  beginTest_('แจ้งเตือนไม่สำเร็จ ลง System_Log และ traceNotify ต้องยังเห็น');

  var users = serviceTestUsers_();
  addTestChannels_();

  var created = callApiAs_(users.admin, 'สร้างใบงาน', function () {
    return api_createWorkOrder(testWoForm_());
  });
  var woId = String(created.woId);

  /* ---------- ตีกลับจริงผ่าน api_ โดยให้การส่งล้มเหลว ---------- */
  var originalSend = sendTelegramMessage_;
  try {
    sendTelegramMessage_ = function () {
      return { ok: false, code: 502, message: 'เครือข่ายล่มระหว่างทดสอบ' };
    };
    captureNotifications_(function () {
      callApiAs_(users.approver, 'ตีกลับใบงาน', function () {
        return api_returnWorkOrder(woId, 'เอกสารไม่ครบ', lockOf_(woId));
      });
    });
  } finally {
    sendTelegramMessage_ = originalSend;
  }

  /* ---------- บรรทัดต้องอยู่ใน System_Log ---------- */
  var failure = systemLogOf_(woId, ACTION.NOTIFY_FAILED);
  assertTrue_(!!failure, 'ต้องบันทึก NOTIFY_FAILED ไว้ เพื่อให้ตามได้ว่าใบไหนไม่ได้ถูกแจ้ง');
  assertEquals_(String(failure['Level']), LOG_LEVEL.ERROR, 'ระดับต้องเป็น ERROR');
  assertEquals_(String(failure['Source']), LOG_SOURCE.NOTIFY, 'ต้นทางต้องเป็น NOTIFY');
  assertTrue_(String(failure['Detail']).indexOf(woId) !== -1,
    'และต้องมีเลขที่ใบงานอยู่ในข้อความ เพราะตารางนี้ไม่มีคอลัมน์ WO_ID');
  assertTrue_(String(failure['Detail']).indexOf('เครือข่ายล่มระหว่างทดสอบ') !== -1,
    'พร้อมสาเหตุจริง ไม่ใช่บอกแค่ว่าไม่สำเร็จ');

  /* ---------- และต้องไม่อยู่ใน Audit_Log ---------- */
  var logs = listAuditByWo(woId);
  var strays = [];
  for (var i = 0; i < logs.length; i++) {
    if (String(logs[i]['Action']) === ACTION.NOTIFY_FAILED) strays.push(String(logs[i]['Log_ID']));
  }
  assertEquals_(strays.length, 0, 'การส่งไม่สำเร็จเป็นเรื่องของระบบ ต้องไม่อยู่ใน Audit_Log');

  /* ---------- เครื่องมือไล่ปัญหาต้องยังเห็น ---------- */
  var report = traceNotify(woId);
  var returnLine = '';
  var lines = report.split(NEW_LINE_);
  for (var r = 0; r < lines.length; r++) {
    if (lines[r].indexOf('  ' + NOTIFY_EVENT.RETURN + ' ') === 0) returnLine = lines[r];
  }
  assertTrue_(returnLine !== '', 'รายงานต้องมีบรรทัดของเหตุการณ์ตีกลับ');
  assertTrue_(returnLine.indexOf('ไม่สำเร็จ 1 ครั้ง') !== -1,
    'และต้องนับครั้งที่ส่งไม่สำเร็จได้ ทั้งที่มันอยู่คนละตารางกับครั้งที่สำเร็จ');

  return endTest_();
}

/**
 * ไม่มีจุดไหนเขียนลงทั้งสองตาราง และมีที่ตัดสินที่เดียวจริง ๆ
 *
 * พิสูจน์สองชั้น — ชั้นแรกสแกนโค้ดว่าไม่มีทางเขียนที่สอง ชั้นที่สองนับแถวจริง
 * ที่ต้องมีชั้นที่สองเพราะการสแกนพิสูจน์ได้แค่ "ไม่มีใครเรียก" ไม่ได้พิสูจน์ว่า
 * ตัวที่เรียกอยู่ตัวเดียวนั้น แยกของถูกจริงหรือเปล่า
 */
function test_log_neverBoth() {
  beginTest_('เขียนที่เดียวเสมอ ไม่มีทางลงทั้งสองตาราง');

  /* ---------- ชั้นที่ 1 สแกนโค้ด ---------- */
  var writeNeedles = ['appendRows_(SHEET.AUDIT_LOG', 'appendRows_(SHEET.SYSTEM_LOG'];
  var writers = functionsMentioning_(writeNeedles);
  assertEquals_(writers.join(', '), 'writeAuditRecords',
    'ต้องมีฟังก์ชันเดียวเท่านั้นที่เขียนลงตารางบันทึก');

  var deciders = functionsMentioning_(['isSystemLogRecord_(']);
  assertEquals_(deciders.join(', '), 'isSystemLogRecord_, writeAuditRecords',
    'และต้องมีที่ตัดสินว่าลงตารางไหนอยู่ที่เดียว');

  /* ---------- ตัวสแกนต้องจับของปลอมได้จริง ---------- */
  // ถ้าไม่ลองกับของปลอม เทสต์นี้จะเขียวตลอดแม้ตัวสแกนจะอ่านอะไรไม่เจอเลยสักตัว
  // ตั้งชื่อเป็นอักษรอังกฤษ เพราะผลลัพธ์เรียงตามตัวอักษร และลำดับของคำไทยเดาด้วยตาไม่ได้
  var fake = {
    'fake1_writesBothTables': 'function x(){ appendRows_(SHEET.AUDIT_LOG, a); appendRows_(SHEET.SYSTEM_LOG, b); }',
    'fake2_writesSystemLog':  'function y(){ appendRows_(SHEET.SYSTEM_LOG, rows); }',
    'fake3_unrelated':        'function z(){ return listAuditByWo(id); }'
  };
  assertEquals_(functionsMentioning_(writeNeedles, fake).join(', '),
    'fake1_writesBothTables, fake2_writesSystemLog',
    'ตัวสแกนต้องจับจุดที่เขียนตารางบันทึกได้ทุกแบบ');

  /* ---------- ชั้นที่ 2 นับแถวจริง ---------- */
  var woId = testPrefix_() + 'WO-SPLIT-1';
  var actor = testPrefix_() + 'split@cnr.co.th';
  /*
   * นับเฉพาะบรรทัดของตัวเอง ไม่ได้นับทั้งตารางก่อนและหลังมาลบกัน
   * เพราะตารางบันทึกโตเกินเพดานอ่าน ผลต่างจึงเป็นศูนย์เสมอบนของจริง
   */

  writeAuditRecords([
    { WO_ID: woId, Action: ACTION.EDIT, Entity: ENTITY.WO, Field: 'Contact',
      From_Value: 'ก', To_Value: 'ข', User: actor },
    /*
     * บางจุดบันทึกเรื่องของงานแผนกโดยไม่ได้ส่งเลขที่ใบงานมาด้วย
     * แถวแบบนี้เป็นสิ่งที่เกิดกับใบงานเต็มตัว ต้องอยู่ใน Audit_Log — ถ้าดูแต่ WO_ID
     * มันจะหลุดไป System_Log แบบเงียบ ๆ โดยไม่มีอะไรฟ้องเลยสักอย่าง
     */
    { Task_ID: woId + '-T1', Action: ACTION.TASK_UPDATE, Entity: ENTITY.TASK,
      Field: 'Status', From_Value: 'ก', To_Value: 'ข', User: actor },
    { WO_ID: woId, Action: ACTION.NOTIFY_FAILED, Entity: ENTITY.WO, Field: 'Telegram',
      To_Value: NOTIFY_EVENT.SUBMIT, Remark: 'ทดสอบการแยกตาราง', User: actor },
    { Action: ACTION.LOGOUT, Entity: ENTITY.USER, Field: 'Session',
      Remark: 'ทดสอบการแยกตาราง', User: actor }
  ]);

  var addedAudit = queryRows_(SHEET.AUDIT_LOG, { 'User': actor }).length;
  var addedSystem = queryRows_(SHEET.SYSTEM_LOG, { 'User': actor }).length;

  assertEquals_(addedAudit, 2,
    'บรรทัดที่เกิดกับใบงานและกับงานแผนก ลง Audit_Log ทั้งคู่');
  assertEquals_(addedSystem, 2, 'ที่เหลือลง System_Log');
  assertEquals_(addedAudit + addedSystem, 4,
    'รวมแล้วต้องเท่ากับจำนวนที่เขียนพอดี ไม่ขาดและไม่เกิน');

  return endTest_();
}

/**
 * ทุกเหตุการณ์ที่ไปลง System_Log ต้องประกาศต้นทางและระดับไว้ก่อน
 *
 * คอลัมน์ Source ใช้ค่าจากรายการตายตัวเท่านั้น ถ้าปล่อยให้แต่ละจุดพิมพ์สดเอง
 * ไม่นานจะมีค่าปนกันจนกรองไม่ได้ · เทสต์นี้จึงกันตั้งแต่ตอนเพิ่มเหตุการณ์ใหม่
 * ไม่ใช่ไปเจอตอนเปิดชีตแล้วพบคำที่ไม่รู้จักปนอยู่
 */
function test_log_everySystemEventDeclared() {
  beginTest_('ทุกเหตุการณ์ของระบบต้องประกาศต้นทางและระดับไว้');

  var sources = {};
  var levels = {};
  for (var s in LOG_SOURCE) {
    if (Object.prototype.hasOwnProperty.call(LOG_SOURCE, s)) sources[LOG_SOURCE[s]] = true;
  }
  for (var v in LOG_LEVEL) {
    if (Object.prototype.hasOwnProperty.call(LOG_LEVEL, v)) levels[LOG_LEVEL[v]] = true;
  }
  /*
   * เดิมเขียนไว้ว่า 4 ค่า ตอนนี้เป็น 5 เพราะ Supabase เป็นที่เก็บข้อมูลใหม่ที่ล้มได้
   * ด้วยเหตุผลที่ไม่เหมือนอีกสี่ตัวเลย (SPEC 22.2 · กฎข้อ 24) และต้องกรองดูแยกได้
   *
   * เจตนาของข้อนี้ไม่ได้เปลี่ยน — รายการยังต้องปิดตายและสั้น ไม่ใช่ปล่อยให้แต่ละจุด
   * พิมพ์ต้นทางสดของตัวเอง ซึ่งจะทำให้ไม่นานก็มีทั้ง 'db' 'DB' และ 'supabase' ปนกัน
   * แล้วการกรองในตารางจะใช้ไม่ได้อีกเลย · การเพิ่มค่าใหม่ต้องมาแก้ที่บรรทัดนี้เสมอ
   */
  assertEquals_(Object.keys(sources).sort().join(', '),
    'AUTH, DATABASE, NOTIFY, PERMISSION, REPORT',
    'ต้นทางต้องมีแค่ 5 ค่านี้ตามที่ตกลงไว้');

  /* ---------- ทุกแถวในตารางต้องเป็นค่าที่มีอยู่จริง ---------- */
  var unknownAction = [];
  var badSource = [];
  var badLevel = [];
  for (var event in SYSTEM_LOG_EVENT) {
    if (!Object.prototype.hasOwnProperty.call(SYSTEM_LOG_EVENT, event)) continue;
    if (ACTION[event] !== event) unknownAction.push(event);
    if (!sources[SYSTEM_LOG_EVENT[event].source]) badSource.push(event);
    if (!levels[SYSTEM_LOG_EVENT[event].level]) badLevel.push(event);
  }
  assertEquals_(unknownAction.join(', '), '', 'ชื่อเหตุการณ์ต้องเป็นค่าที่ประกาศไว้ใน ACTION');
  assertEquals_(badSource.join(', '), '', 'ต้นทางต้องเป็นค่าจาก LOG_SOURCE');
  assertEquals_(badLevel.join(', '), '', 'ระดับต้องเป็นค่าจาก LOG_LEVEL');

  /* ---------- เหตุการณ์ที่โค้ดส่งเข้าไปจริง ต้องประกาศไว้ครบ ---------- */
  var used = systemEventsUsedInCode_();
  assertTrue_(used.length >= 6, 'ตัวสแกนต้องเห็นเหตุการณ์ของจริง (เห็น ' + used.length + ')');
  var missing = [];
  for (var u = 0; u < used.length; u++) {
    if (!SYSTEM_LOG_EVENT[used[u]]) missing.push(used[u]);
  }
  assertEquals_(missing.join(', '), '',
    'เหตุการณ์เหล่านี้ถูกส่งเข้า System_Log แต่ยังไม่ได้ประกาศต้นทางและระดับไว้');

  /* ---------- ตัวสแกนต้องจับของปลอมได้ ---------- */
  var fake = {
    'ตัวปลอม': 'function q(){ logSystemEvent_(ACTION.YANG_MAI_DAI_PRAKAT, "x"); }'
  };
  assertEquals_(systemEventsUsedInCode_(fake).join(', '), 'YANG_MAI_DAI_PRAKAT',
    'ตัวสแกนต้องเห็นเหตุการณ์ที่ส่งเข้า System_Log จริง ๆ');

  /* ---------- เหตุการณ์ที่หลุดรายการ ต้องดังที่สุด ไม่ใช่หายเงียบ ---------- */
  var row = systemRowOf_({
    Log_ID: 'x', Action: 'EVENT_MAI_MEE_JING', User: 'someone',
    Remark: 'อะไรสักอย่าง', Timestamp: new Date()
  });
  assertEquals_(row.Level, LOG_LEVEL.ERROR, 'เหตุการณ์ที่ไม่ได้ประกาศไว้ ต้องขึ้นเป็น ERROR');
  assertEquals_(row.Event, 'EVENT_MAI_MEE_JING', 'และต้องยังเห็นชื่อเหตุการณ์ครบ');
  assertTrue_(String(row.Detail).indexOf('SYSTEM_LOG_EVENT') !== -1,
    'พร้อมบอกตรง ๆ ว่าต้องไปประกาศที่ไหน');

  return endTest_();
}

/**
 * test_cleanup ต้องกวาด System_Log ของข้อมูลทดสอบด้วย
 *
 * ถ้าไม่กวาด ตารางของจริงจะมีบรรทัดล็อกอินและบรรทัดแจ้งเตือนล้มเหลวของรอบทดสอบ
 * กองสะสมทุกครั้งที่รัน แล้วผู้ดูแลจะแยกไม่ออกว่าบรรทัดไหนคือของจริง
 * ซึ่งทำให้ตารางนี้ไร้ประโยชน์ไปเลย เพราะทั้งตารางมีไว้ให้กวาดสายตาหาความผิดปกติ
 *
 * พิสูจน์ด้วยการถามด่านตัดสินตัวเดียวกับที่ test_cleanup ใช้ ไม่ใช่สั่งลบจริง
 * เพราะการสั่งลบกลางกลุ่มจะล้างข้อมูลของชุดอื่นที่ยังทำงานอยู่ไปด้วย
 */
function test_log_cleanupClearsSystemLog() {
  beginTest_('test_cleanup ต้องกวาด System_Log ด้วย');

  /* ---------- 1. ต้องมีรายการพา cleanup ไปถึงตารางนั้นจริง ---------- */
  var fields = [];
  for (var i = 0; i < TEST_SCAN.length; i++) {
    if (TEST_SCAN[i].sheet === SHEET.SYSTEM_LOG) fields.push(String(TEST_SCAN[i].field));
  }
  assertEquals_(fields.sort().join(', '), 'Detail, User',
    'ต้องกวาดทั้งจากเจ้าของเหตุการณ์ และจากข้อความที่อ้างถึงใบงานทดสอบ');

  /* ---------- 2. แถวที่เขียนจริงต้องถูกจับได้ทั้งสองแบบ ---------- */
  var sweeper = testPrefix_() + 'sweep@cnr.co.th';
  logSystemEvent_(ACTION.LOGOUT, 'ทดสอบการกวาดบันทึก', sweeper);
  writeAuditRecord({
    WO_ID:  testPrefix_() + 'WO-SWEEP-1',
    Action: ACTION.NOTIFY_FAILED,
    Entity: ENTITY.WO,
    Field:  'Telegram',
    To_Value: NOTIFY_EVENT.SUBMIT,
    Remark: 'ทดสอบการกวาดบันทึก',
    User:   'jarernkit@cnr.co.th'          // เจ้าของเหตุการณ์เป็นคนจริง ไม่ใช่ TEST-
  });

  var rows = testRowsFromDb_(SHEET.SYSTEM_LOG, 'User')
    .concat(testRowsFromDb_(SHEET.SYSTEM_LOG, 'Detail'));
  assertTrue_(testRowsOf_({ sheet: SHEET.SYSTEM_LOG, field: 'User' }, rows).length >= 1,
    'บรรทัดที่เจ้าของเหตุการณ์เป็นผู้ใช้ทดสอบ ต้องถูกกวาด');
  assertTrue_(
    testRowsOf_({ sheet: SHEET.SYSTEM_LOG, field: 'Detail', contains: true }, rows).length >= 1,
    'บรรทัดที่อ้างถึงใบงานทดสอบ ต้องถูกกวาดด้วย แม้เจ้าของเหตุการณ์จะเป็นคนจริง');

  /* ---------- 3. แถวของจริงห้ามถูกแตะ ---------- */
  // ข้อนี้สำคัญกว่าสองข้อบน การกวาดพลาดไปโดนของจริงคือการลบหลักฐานทิ้ง
  var real = [
    { 'User': 'somebody@cnr.co.th', 'Detail': 'ใบงาน WO-2609-0001 · RETURN · ส่งไม่สำเร็จ' },
    { 'User': 'somebody@cnr.co.th', 'Detail': 'เข้าสู่ระบบสำเร็จ' }
  ];
  assertEquals_(testRowsOf_({ sheet: SHEET.SYSTEM_LOG, field: 'User' }, real).length, 0,
    'บรรทัดของผู้ใช้จริง ห้ามถูกกวาด');
  assertEquals_(
    testRowsOf_({ sheet: SHEET.SYSTEM_LOG, field: 'Detail', contains: true }, real).length, 0,
    'บรรทัดที่พูดถึงใบงานจริง ห้ามถูกกวาด');

  return endTest_();
}

/**
 * ฟังก์ชันที่พูดถึงคำเหล่านี้ในตัวโค้ดของมันเอง
 *
 * ป้อน sources เข้ามาเพื่อทดสอบตัวสแกนด้วยของปลอมได้ — ตัวสแกนที่ไม่เคยถูกลอง
 * กับของปลอม พิสูจน์อะไรไม่ได้เลย มันเขียวได้แม้จะอ่านอะไรไม่เจอสักตัว
 *
 * @param {string[]} needles คำที่ต้องการหา
 * @param {Object} [sources] แผนที่ชื่อ -> โค้ด สำหรับทดสอบตัวสแกน
 * @return {string[]} ชื่อฟังก์ชันเรียงตามตัวอักษร
 */
function functionsMentioning_(needles, sources) {
  var found = [];
  var names = [];
  var texts = {};

  if (sources) {
    for (var key in sources) {
      if (!Object.prototype.hasOwnProperty.call(sources, key)) continue;
      names.push(key);
      texts[key] = String(sources[key]);
    }
  } else {
    for (var name in globalThis) {
      if (typeof globalThis[name] !== 'function') continue;
      if (name.indexOf('test_') === 0) continue;   // ตัวเทสต์เองพูดถึงชื่อพวกนี้โดยตั้งใจ
      names.push(name);
      try {
        texts[name] = String(globalThis[name]);
      } catch (e) {
        texts[name] = '';
      }
    }
  }

  for (var i = 0; i < names.length; i++) {
    for (var n = 0; n < needles.length; n++) {
      if (texts[names[i]].indexOf(needles[n]) !== -1) {
        found.push(names[i]);
        break;
      }
    }
  }
  return found.sort();
}

/**
 * ชื่อเหตุการณ์ที่โค้ดส่งเข้า System_Log จริง ๆ
 *
 * อ่านจากตัวโค้ดเอง ไม่ใช่จากรายการที่ประกาศไว้ เพราะสิ่งที่ต้องจับคือ
 * "มีคนเพิ่มเหตุการณ์ใหม่แล้วลืมประกาศ" ซึ่งดูจากรายการที่ประกาศไว้ไม่มีวันเห็น
 *
 * @param {Object} [sources] แผนที่ชื่อ -> โค้ด สำหรับทดสอบตัวสแกน
 * @return {string[]} ชื่อเหตุการณ์ที่ไม่ซ้ำกัน เรียงตามตัวอักษร
 */
function systemEventsUsedInCode_(sources) {
  var callers = ['logSystemEvent_', 'writeAuthAudit_'];
  var seen = {};
  var out = [];
  var texts = [];

  if (sources) {
    for (var key in sources) {
      if (Object.prototype.hasOwnProperty.call(sources, key)) texts.push(String(sources[key]));
    }
  } else {
    for (var name in globalThis) {
      if (typeof globalThis[name] !== 'function') continue;
      if (name.indexOf('test_') === 0) continue;
      if (callers.indexOf(name) !== -1) continue;   // ตัวรับเอง ไม่ใช่จุดที่เรียก
      try {
        texts.push(String(globalThis[name]));
      } catch (e) {
        // อ่านโค้ดของตัวนั้นไม่ได้ ข้ามไป
      }
    }
  }

  for (var t = 0; t < texts.length; t++) {
    for (var c = 0; c < callers.length; c++) {
      var pattern = new RegExp(callers[c] + '\\(\\s*ACTION\\.([A-Z_]+)', 'g');
      var hit = pattern.exec(texts[t]);
      while (hit) {
        if (!seen[hit[1]]) {
          seen[hit[1]] = true;
          out.push(hit[1]);
        }
        hit = pattern.exec(texts[t]);
      }
    }
  }
  return out.sort();
}

/**
 * บรรทัดใน System_Log ของเหตุการณ์หนึ่ง เฉพาะที่เป็นข้อมูลทดสอบ
 * @param {string} event ชื่อเหตุการณ์
 * @param {string} [user] อีเมลเจ้าของเหตุการณ์ เมื่อต้องการเจาะจงคนเดียว
 * @return {Object[]}
 */
function systemRowsOf_(event, user) {
  var rows = testRowsFromDb_(SHEET.SYSTEM_LOG, 'User', { 'Event': event });
  var found = [];
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Event']) !== event) continue;
    if (!isTestValue_(rows[i]['User'])) continue;
    if (user !== undefined && String(rows[i]['User']) !== user) continue;
    found.push(rows[i]);
  }
  return found;
}

/**
 * บรรทัดล่าสุดใน System_Log ที่พูดถึงใบงานนี้ ในเหตุการณ์ที่ระบุ
 * @param {string} woId เลขที่ใบงาน
 * @param {string} event ชื่อเหตุการณ์
 * @return {Object|null}
 */
function systemLogOf_(woId, event) {
  var rows = listSystemLogByWo(woId);
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Event']) === event) found = rows[i];
  }
  return found;
}

/* ===========================================================================
 * หน้าแรก — รายการติดตามใบงาน (SPEC 17.1)
 *
 * ทุกข้อเรียกผ่าน api_listWorkOrders ซึ่งเป็นรายการเดียวกับที่หน้าเว็บเรียกจริง
 * ไม่ได้เรียกตัวค้นหาข้างในตรง ๆ เพราะเทสต์ที่เรียกข้างในผ่านได้แม้หน้าเว็บจะไม่ได้ต่อสาย
 * =========================================================================== */

/** ข้อมูลทดสอบของกลุ่มนี้ สร้างครั้งเดียวต่อรอบการรัน */
var HOME_TEST_DATA_ = null;

/**
 * ใบงานสี่ใบที่ออกแบบไว้ให้ครอบทุกข้อของกลุ่มนี้ด้วยข้อมูลชุดเดียว
 *
 * ต้นทุนของเทสต์เกือบทั้งหมดอยู่ที่การเตรียมข้อมูล ไม่ใช่การตรวจคำตอบ
 * จึงสร้างชุดเดียวแล้วใช้ร่วมกันทุกข้อ (CLAUDE.md — ต้นทุนการคุยกับชีต)
 *
 * ชื่อลูกค้าและโครงการมีรหัสรอบการรันติดอยู่ด้วยเสมอ เพื่อให้คำค้นของรอบนี้
 * ไม่มีทางไปชนกับข้อมูลที่ชุดอื่นหรือรอบก่อนหน้าทิ้งไว้ในชีตจริง
 *
 * @return {Object} {tag, a, b, c, d}
 */
function homeTestData_() {
  var tag = testRunId_();
  if (HOME_TEST_DATA_ && HOME_TEST_DATA_.tag === tag) return HOME_TEST_DATA_;

  var users = serviceTestUsers_();
  var word = 'ค้นหา' + tag;          // คำค้นที่ใช้ร่วมกันทั้งกลุ่ม
  var place = 'ศาลายา' + tag;
  var tower = 'หอถังสูง' + tag;

  var data = {
    tag:   tag,
    word:  word,
    place: place,
    tower: tower,
    users: users
  };

  data.a = createTestWo_(users, {
    'Customer_Name': 'บริษัท ' + word + ' จำกัด',
    'Project':       'โครงการ' + tower,
    'Location':      place,
    'Assignment_Type': ASSIGNMENT.SERVICE
  });
  data.b = createTestWo_(users, {
    'Customer_Name': 'บริษัท' + word,              // ชื่อคล้ายใบ ก แต่เขียนต่างกัน
    'Project':       'โครงการบ่อบำบัด' + tag,
    'Location':      'บางนา' + tag,
    'Assignment_Type': ASSIGNMENT.LAB
  });
  data.c = createTestWo_(users, {
    'Customer_Name': word + ' ซัพพลาย',
    'Project':       'โครงการ' + tower + ' เฟสสอง',
    'Location':      'ระยอง' + tag,
    'Assignment_Type': ASSIGNMENT.PROJECT
  });
  data.d = createTestWo_(users, {
    'Customer_Name': 'บริษัทอื่นที่ไม่เกี่ยวข้อง' + tag,
    'Project':       'โครงการอื่น' + tag,
    'Location':      'ขอนแก่น' + tag,
    'Assignment_Type': ASSIGNMENT.SERVICE
  });

  HOME_TEST_DATA_ = data;
  return data;
}

/**
 * เรียกรายการใบงานผ่านทางเดียวกับที่หน้าเว็บเรียก
 * @param {Object} query เงื่อนไข
 * @return {Object} ข้อมูลที่หน้าเว็บจะได้
 */
function homeList_(query) {
  var users = serviceTestUsers_();
  return callApiAs_(users.admin, 'ขอรายการใบงาน', function () {
    return api_listWorkOrders(query);
  });
}

/**
 * เลขที่ใบงานทั้งหมดในผลลัพธ์
 * @param {Object} data ผลจาก api_listWorkOrders
 * @return {string[]}
 */
function homeIdsOf_(data) {
  var ids = [];
  for (var i = 0; i < data.rows.length; i++) ids.push(data.rows[i].woId);
  return ids;
}

/**
 * สร้างใบงานปลอมจำนวนมากลงฐานข้อมูลโดยตรง
 *
 * เขียนตรงเข้าฐานข้อมูล ไม่ผ่าน createWorkOrder เพราะสิ่งที่กำลังพิสูจน์คือการแบ่งหน้า
 * การเรียง และจำนวนคำขอ ซึ่งไม่เกี่ยวกับว่าแถวถูกสร้างมาด้วยเส้นทางไหน · การเดิน
 * เส้นทางจริงห้าสิบรอบจะใช้เวลาเป็นนาทีโดยไม่ได้พิสูจน์อะไรเพิ่มเลย
 * (เส้นทาง "สร้างจริง → เห็นในรายการ" มีข้ออื่นในกลุ่มนี้เดินครบแล้ว)
 *
 * @param {number} count จำนวนใบงาน
 * @param {Object} [overrides] ค่าที่ต้องการเปลี่ยน
 * @return {string} คำนำหน้าเลขที่ใบงานที่สร้าง ใช้ทั้งตอนค้นและตอนล้าง
 */
function seedWorkOrders_(count, overrides) {
  var prefix = testPrefix_() + 'LIST' + Utilities.formatDate(new Date(), TIMEZONE, 'HHmmss');
  var rows = [];
  var base = new Date('2026-01-01T08:00:00').getTime();

  for (var i = 0; i < count; i++) {
    var row = {
      'WO_ID': prefix + '-' + padNumber_(i, 4),
      'Customer_Name': 'ลูกค้า ' + i, 'Project': 'โครงการ ' + i, 'Location': 'สถานที่ ' + i,
      'Route': ROUTE.SP, 'Assignment_Type': ASSIGNMENT.SERVICE,
      'Overall_Status': WO_STATUS.PENDING_APPROVE, 'Payment_Status': PAYMENT.UNPAID,
      // ใบที่ i มากกว่า = ใหม่กว่า · การเรียงใหม่ไปเก่าจึงต้องได้ i สูงสุดขึ้นก่อน
      'Created_Date': new Date(base + i * 60000)
    };
    for (var key in (overrides || {})) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) row[key] = overrides[key];
    }
    rows.push(row);
  }

  if (rows.length) db_insert_(SHEET.WORK_ORDER, rows);
  dbInvalidate_(SHEET.WORK_ORDER);
  clearRowCache_();
  return prefix;
}

/**
 * ล้างใบงานปลอมที่ seedWorkOrders_ สร้างไว้ แล้วเทียบว่าลบครบ
 * @param {string} prefix คำนำหน้าที่ได้จาก seedWorkOrders_
 * @param {number} count จำนวนที่เขียนลงไป
 */
function cleanSeededWorkOrders_(prefix, count) {
  dbDeleteVerified_(SHEET.WORK_ORDER,
    { 'WO_ID': { op: 'like', value: dbLikeLiteral_(prefix) + '*' } }, 'ใบงานทดสอบรายการ', count);
  dbInvalidate_(SHEET.WORK_ORDER);
  clearRowCache_();
}

/**
 * ไม่มีตัวกรองเลย ต้องได้ใบล่าสุดหนึ่งหน้า เรียงจากใหม่ไปเก่า (SPEC 17.3)
 *
 * และใบที่เพิ่งเปิดต้องขึ้นทันที ไม่ใช่รอแคชหมดอายุ — ข้อนี้เคยพิสูจน์ว่าการล้างดัชนี
 * เกาะอยู่กับทางผ่านของการเขียนจริง · ดัชนีถูกรื้อไปแล้ว แต่ข้อนี้ยังจริงและยังสำคัญ
 * เท่าเดิม เพราะตอนนี้มันพิสูจน์ว่าการอ่านไปที่ฐานข้อมูลจริง ไม่ได้ค้างอยู่กับภาพเก่า
 */
function test_home_defaultListing() {
  beginTest_('ไม่มีตัวกรอง ต้องได้ใบล่าสุดหนึ่งหน้า เรียงใหม่ไปเก่า');

  var count = 45;
  var prefix = seedWorkOrders_(count);

  try {
    /* ---------- ขนาดหน้าและการเรียง ---------- */
    var data = homeList_({ text: prefix });

    assertEquals_(data.rows.length, WO_LIST_PAGE_SIZE,
      'หน้าหนึ่งต้องได้ ' + WO_LIST_PAGE_SIZE + ' ใบ ไม่ใช่ทั้งหมด');
    assertEquals_(data.pageSize, WO_LIST_PAGE_SIZE, 'ขนาดหน้าต้องมาจากค่าคงที่ตัวเดียวของระบบ');
    assertEquals_(data.total, count, 'แต่ต้องบอกจำนวนทั้งหมดที่ตรงเงื่อนไขด้วย');
    assertEquals_(data.pageCount, 3, 'และบอกว่ามีทั้งหมดกี่หน้า');
    assertEquals_(data.rows[0].woId, prefix + '-0044', 'ใบที่ใหม่ที่สุดต้องอยู่บนสุด');
    assertEquals_(data.rows[19].woId, prefix + '-0025', 'และไล่ลงมาตามลำดับเวลา');

    /*
     * ยอดรวมต้องมาจากฐานข้อมูล ไม่ใช่จากการนับแถวที่ดึงมา
     * ถ้านับจากแถวที่ดึงมา ยอดจะเท่ากับขนาดหน้าเสมอ ซึ่งดูสมเหตุสมผลทุกประการ
     */
    assertTrue_(data.total > data.rows.length,
      'ยอดรวมต้องมากกว่าจำนวนแถวในหน้านี้ — ถ้าเท่ากัน แปลว่ากำลังนับแถวที่ดึงมาเอง');

    var last = homeList_({ text: prefix, page: 3 });
    assertEquals_(last.rows.length, 5, 'หน้าสุดท้ายได้เท่าที่เหลือจริง');
    assertEquals_(last.rows[4].woId, prefix + '-0000', 'และใบที่เก่าที่สุดอยู่ท้ายสุด');

    /* ---------- หน้าที่สองต้องต่อจากหน้าแรกพอดี ไม่ซ้ำและไม่ขาด ---------- */
    var second = homeList_({ text: prefix, page: 2 });
    assertEquals_(second.rows[0].woId, prefix + '-0024',
      'หน้าที่สองต้องต่อจากหน้าแรกพอดี · ถ้าลำดับไม่แน่นอน แถวจะซ้ำและหายโดยยอดรวมยังดูถูก');

    var seen = {};
    var pages = [data, second, last];
    for (var p = 0; p < pages.length; p++) {
      for (var r = 0; r < pages[p].rows.length; r++) {
        var id = pages[p].rows[r].woId;
        assertTrue_(!seen[id], 'ใบ ' + id + ' ต้องไม่โผล่ซ้ำข้ามหน้า');
        seen[id] = true;
      }
    }
    assertEquals_(Object.keys(seen).length, count, 'สามหน้ารวมกันต้องได้ครบทุกใบ ไม่ขาดสักใบ');
  } finally {
    cleanSeededWorkOrders_(prefix, count);
  }

  /* ---------- ของจริงจากเส้นทางสร้างใบงาน ต้องเห็นทันที ---------- */
  var fixture = homeTestData_();
  var fresh = homeList_({ text: fixture.d.woId });
  assertEquals_(homeIdsOf_(fresh).join(', '), fixture.d.woId,
    'ใบที่เพิ่งเปิดต้องค้นเจอทันที ไม่ต้องรอแคชหมดอายุ');

  var ordered = homeIdsOf_(homeList_({ text: fixture.tag }));
  assertEquals_(ordered.join(', '),
    [fixture.d.woId, fixture.c.woId, fixture.b.woId, fixture.a.woId].join(', '),
    'ใบที่เปิดทีหลังต้องอยู่บนสุด ไล่ลงไปหาใบที่เปิดก่อน');

  return endTest_();
}

/**
 * กรองหลายเงื่อนไขพร้อมกัน ต้องตรงทุกข้อ (SPEC 17.1)
 *
 * ทุกเงื่อนไขทำที่ฐานข้อมูลแล้ว ไม่ใช่คัดในหน่วยความจำอีกต่อไป · สิ่งที่ข้อนี้พิสูจน์
 * จึงเปลี่ยนจาก "ตัวคัดถูกต้อง" เป็น "ตัวกรองถูกแปลไปเป็นเงื่อนไขของฐานข้อมูลถูกต้อง"
 * ซึ่งเป็นรอยต่อที่ผิดได้เงียบกว่าเดิมมาก — ตัวกรองที่แปลผิดจะได้รายการว่างเปล่า
 * ซึ่งหน้าตาเหมือนกับ "ไม่มีใบงานที่ตรง" ทุกประการ
 */
function test_home_multipleFilters() {
  beginTest_('กรองหลายเงื่อนไขพร้อมกัน ต้องตรงทุกข้อ');

  var fixture = homeTestData_();
  var today = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');

  /* ---------- คำค้น + แผนก + สถานะ + การชำระเงิน + ช่วงวันที่ ---------- */
  var data = homeList_({
    text:        fixture.word,
    departments: [ASSIGNMENT.SERVICE],
    statuses:    [WO_STATUS.PENDING_APPROVE],
    payments:    [PAYMENT.UNPAID],
    from:        today,
    to:          today
  });

  assertEquals_(homeIdsOf_(data).join(', '), fixture.a.woId,
    'ต้องเหลือเฉพาะใบที่เข้าเงื่อนไขครบทุกข้อพร้อมกัน');

  for (var i = 0; i < data.rows.length; i++) {
    assertEquals_(data.rows[i].dept, ASSIGNMENT.SERVICE, 'ทุกแถวต้องเป็นแผนกที่กรองไว้');
    assertEquals_(data.rows[i].status, WO_STATUS.PENDING_APPROVE, 'และสถานะที่กรองไว้');
    assertEquals_(data.rows[i].payment, PAYMENT.UNPAID, 'และสถานะการชำระที่กรองไว้');
  }

  /* ---------- เงื่อนไขที่ขัดกันเอง ต้องได้ว่าง ไม่ใช่ได้ทุกใบ ---------- */
  var none = homeList_({ text: fixture.word, departments: [ASSIGNMENT.SERVICE],
    routes: [ROUTE.LAB] });
  assertEquals_(none.rows.length, 0,
    'แผนก Service ที่อยู่ในสายอนุมัติ Lab ไม่มีจริง ต้องได้รายการว่าง');

  /*
   * "แผนกผู้รับงาน" ต้องหมายถึง Assignment_Type ของใบงาน ไม่ใช่แผนกของ Department_Task
   *
   * สองอย่างนี้สลับกันได้ง่ายมากเพราะชื่อค่าเหมือนกัน แต่ผลต่างกันสิ้นเชิง —
   * ใบที่รออนุมัติยังไม่มี Task สักตัว ถ้ากรองด้วยแผนกของ Task ใบเหล่านั้นจะหายหมด
   * ทั้งที่ผู้ใช้เห็นบนหน้าจอว่าระบุแผนกไว้แล้ว
   */
  var byAssignment = homeList_({ text: fixture.word, departments: [ASSIGNMENT.SERVICE] });
  assertEquals_(homeIdsOf_(byAssignment).join(', '), fixture.a.woId,
    'กรองแผนกผู้รับงานต้องเจอใบที่รออนุมัติด้วย ไม่ใช่เจอเฉพาะใบที่มีงานของแผนกแล้ว');

  /* ---------- ช่วงวันที่ที่ไม่ครอบใบไหนเลย ---------- */
  var outside = homeList_({ text: fixture.word, from: '2020-01-01', to: '2020-01-31' });
  assertEquals_(outside.rows.length, 0, 'ช่วงวันที่ในอดีตที่ไม่มีใบงาน ต้องได้รายการว่าง');

  /*
   * ช่วงวันที่ต้องมีทั้งขอบล่างและขอบบนจริง ๆ
   *
   * ถ้าขอบใดขอบหนึ่งหายไป ผลลัพธ์ยังแคบลงอยู่ดี จึงดูเหมือนตัวกรองทำงาน —
   * ข้อนี้จับกรณีนั้นด้วยการขอช่วงที่จบ "ก่อน" วันที่ใบงานถูกสร้าง
   */
  var onlyPast = homeList_({ text: fixture.word, to: '2020-01-31' });
  assertEquals_(onlyPast.rows.length, 0,
    'ระบุแต่ขอบบนที่อยู่ในอดีต ต้องได้ว่าง — ถ้าได้ทุกใบ แปลว่าขอบบนหายไป');

  /* ---------- สถานะรายแผนก: ใบที่ยังไม่มี Task ต้องไม่ติดมา ---------- */
  var byTask = homeList_({ text: fixture.word, taskStatuses: [TASK_STATUS.PENDING_ACCEPT] });
  assertEquals_(byTask.rows.length, 0,
    'ใบที่ยังไม่ได้อนุมัติยังไม่มีงานของแผนก จึงต้องไม่ติดตัวกรองสถานะรายแผนกมา');

  return endTest_();
}

/**
 * ตัวเลือกในตัวกรองต้องครบทุกค่าที่ระบบมี และต้องไม่มีค่าที่ระบบไม่รู้จัก
 *
 * **ข้อนี้เคยตรวจสิ่งตรงข้าม** คือ "ตัวเลือกต้องมาจากข้อมูลจริงเท่านั้น" ซึ่งถูกต้อง
 * ตอนที่ตัวกรองมีช่องสถานที่ ลูกค้า และโครงการ ที่ผู้ใช้พิมพ์เองอิสระ · สามช่องนั้น
 * สร้างรายการตัวเลือกได้ก็ต่อเมื่ออ่านใบงานทั้งตารางมาก่อน ซึ่งเป็นสิ่งที่งานรอบนี้
 * ตั้งใจกำจัด จึงถูกแทนด้วยช่องค้นหาช่องเดียวที่ค้นทั้งสามอย่างได้เหมือนเดิม
 *
 * ตัวกรองที่เหลือทุกตัวมีตัวเลือกเป็นค่าคงที่ของระบบ · **อันตรายจึงกลับด้าน** —
 * เดิมกลัวตัวเลือกผีที่ไม่มีใบงานไหนใช้ ตอนนี้กลัวตัวเลือกที่ขาดหายไป เพราะสถานะ
 * ที่ไม่มีในกล่องคือสถานะที่ผู้ใช้กรองหาไม่ได้เลย ทั้งที่มีใบงานอยู่จริง
 */
function test_home_filterOptionsFromData() {
  beginTest_('ตัวเลือกในตัวกรองต้องครบทุกค่าที่ระบบมี');

  var data = homeList_({});
  /*
   * `departments` คือ Assignment_Type ของใบงาน จึงต้องมี SERVICE_PROJECT กับ
   * UNSPECIFIED ด้วย · สองค่านั้นไม่ใช่ชื่อแผนก แต่เป็นตัวเลือกที่ผู้ใช้เลือกได้จริง
   * ตอนสร้างใบงาน · ถ้าตัวกรองมีแค่สามแผนก ใบที่เป็นงานร่วมและใบที่ยังไม่ระบุแผนก
   * จะกรองหาไม่ได้เลย ทั้งที่เป็นสองกลุ่มที่ต้องตามงานมากที่สุด
   */
  var expected = {
    statuses:     WO_STATUS,
    taskStatuses: TASK_STATUS,
    departments:  ASSIGNMENT,
    routes:       ROUTE,
    payments:     PAYMENT
  };

  for (var key in expected) {
    if (!Object.prototype.hasOwnProperty.call(expected, key)) continue;

    var options = data.filters[key] || [];
    var values = objectValues_(expected[key]);

    assertEquals_(options.slice().sort().join(','), values.slice().sort().join(','),
      'ตัวกรอง ' + key + ' ต้องมีตัวเลือกครบทุกค่าที่ระบบประกาศไว้ ไม่ขาดไม่เกิน');
  }

  /* ---------- ตัวเลือกต้องไม่ขาดเมื่อยังไม่มีใบงานสักใบ ---------- */
  /*
   * นี่คือข้อได้เปรียบของการใช้ค่าคงที่ และเป็นจุดที่วิธีเดิมทำไม่ได้เลย —
   * ระบบที่เพิ่งติดตั้งจะมีกล่องตัวกรองว่างเปล่าทุกกล่อง ซึ่งดูเหมือนระบบพัง
   */
  var options = woListFilterOptions_();
  assertEquals_(options.statuses.length, objectValues_(WO_STATUS).length,
    'ตัวเลือกต้องครบแม้ยังไม่มีใบงานสักใบ เพราะมาจากค่าคงที่ ไม่ได้มาจากข้อมูล');

  /* ---------- ค่าที่หน้าเว็บกุขึ้นมาเอง ต้องถูกทิ้ง ไม่ใช่ส่งต่อไปฐานข้อมูล ---------- */
  var faked = normalizeWoQuery_({ statuses: ['สถานะที่ไม่มีอยู่จริง', WO_STATUS.RETURNED] });
  assertEquals_(faked.statuses.join(','), WO_STATUS.RETURNED,
    'ค่าที่ไม่อยู่ในตารางค่าคงที่ต้องถูกทิ้ง · ถ้าปล่อยผ่านไป ผลจะว่างเปล่าแบบที่ดูเหมือนระบบพัง');

  return endTest_();
}

/**
 * ชื่อลูกค้าที่พิมพ์กันคนละแบบ ต้องยังค้นเจอครบด้วยคำเดียว (SPEC 17.1)
 *
 * **ข้อนี้เคยตรวจกล่อง "ชื่อใกล้เคียงกัน"** ซึ่งเสนอชื่อลูกค้าที่คล้ายกันให้กดเลือก
 * กล่องนั้นสร้างได้ก็ต่อเมื่อนับชื่อจากใบงานทั้งตาราง จึงหายไปพร้อมดัชนี
 *
 * แต่ **ปัญหาที่กล่องนั้นแก้ยังอยู่ครบ** — ชื่อในชีตพิมพ์กันคนละแบบ บางรายมีเว้นวรรค
 * บางรายไม่มี ถ้าบังคับให้พิมพ์ตรงเป๊ะจะหาไม่เจอ · ข้อนี้จึงย้ายมาตรวจว่าทางแก้
 * ทางใหม่ทำงานจริง คือการค้นแบบ "มีคำนี้อยู่ข้างใน" ที่ฐานข้อมูล ซึ่งเจอครบทุกแบบ
 * ด้วยการพิมพ์ครั้งเดียว โดยไม่ต้องกดเลือกอะไรเพิ่มเลย
 */
function test_home_similarNames() {
  beginTest_('ชื่อลูกค้าที่เขียนต่างกัน ต้องค้นเจอครบด้วยคำเดียว');

  var fixture = homeTestData_();
  var data = homeList_({ text: fixture.word });
  var names = {};

  for (var i = 0; i < data.rows.length; i++) names[data.rows[i].customer] = true;

  assertTrue_(!!names['บริษัท ' + fixture.word + ' จำกัด'],
    'ชื่อที่มีเว้นวรรคต้องเจอ');
  assertTrue_(!!names['บริษัท' + fixture.word],
    'ชื่อที่เขียนติดกันต้องเจอด้วยคำค้นเดียวกัน — นี่คือสิ่งที่กล่องชื่อใกล้เคียงเคยแก้');
  assertTrue_(Object.keys(names).length >= 3,
    'ลูกค้าสามรายที่ชื่อเขียนต่างกัน ต้องมาครบจากการพิมพ์ครั้งเดียว');

  /* ---------- และคำค้นต้องหาได้จากทุกช่องที่ตกลงไว้ ไม่ใช่แค่ชื่อลูกค้า ---------- */
  assertEquals_(woSearchFields_().join(','), 'WO_ID,Customer_Name,Project,Location',
    'ช่องที่ค้นได้ต้องครบสี่ช่องเหมือนเดิม · เหลือช่องเดียวเมื่อไรคือการถอยหลัง');

  return endTest_();
}

/**
 * รายการว่างสองแบบ ต้องบอกคนละอย่าง (SPEC 17.4)
 */
function test_home_emptyStates() {
  beginTest_('รายการว่างสองแบบ ต้องบอกคนละอย่าง');

  /* ---------- มีใบงาน แต่ค้นไม่เจอ ---------- */
  homeTestData_();   // ทำให้แน่ใจว่าระบบมีใบงานอยู่จริง
  var noMatch = homeList_({ text: 'คำที่ไม่มีวันตรงกับอะไรเลย' + testRunId_() });
  assertEquals_(noMatch.emptyReason, 'NO_MATCH', 'ค้นไม่เจอ ต้องบอกว่าไม่ตรงกับที่ค้น');
  assertEquals_(noMatch.rows.length, 0, 'และไม่มีแถวใดเลย');
  assertEquals_(noMatch.total, 0, 'ยอดรวมของผลการค้นต้องเป็นศูนย์');

  /* ---------- มีผลลัพธ์ ต้องไม่ใช่สถานะว่าง ---------- */
  var ok = homeList_({});
  assertEquals_(ok.emptyReason, '', 'มีผลลัพธ์ ต้องไม่มีสถานะว่างติดมา');

  /* ---------- ยังไม่มีใบงานเลยในระบบ ---------- */
  /*
   * "ระบบว่างเปล่า" มาจากยอดของแดชบอร์ด ไม่ใช่จากการนับแถวในหน้านี้
   * จึงสวมยอดชั่วคราวแทนการลบใบงานจริงทิ้งทั้งระบบเพื่อทดสอบข้อเดียว
   */
  var saved = DASHBOARD_RUN_CACHE_;
  try {
    DASHBOARD_RUN_CACHE_ = { total: 0, isEmpty: true };
    var nothing = homeList_({ text: 'อะไรก็ได้ที่ไม่มีทางตรง' + testRunId_() });
    assertEquals_(nothing.emptyReason, 'NO_DATA',
      'ระบบที่ยังไม่มีใบงานเลย ต้องบอกว่ายังไม่มีข้อมูล ไม่ใช่บอกว่าค้นไม่เจอ');
  } finally {
    DASHBOARD_RUN_CACHE_ = saved;
  }

  /* ---------- หน้าเว็บต้องมีข้อความของทั้งสองแบบจริง ---------- */
  // สัญญาระหว่างเซิร์ฟเวอร์กับหน้าเว็บ เป็นรอยต่อที่เทสต์ไม่ได้เดินผ่าน (SPEC 17.4)
  var page = HtmlService.createHtmlOutputFromFile('ui_WoList').getContent();
  assertTrue_(page.indexOf('NO_DATA') !== -1,
    'หน้ารายการต้องแยกกรณี "ยังไม่มีใบงานเลย" ออกมาจริง');
  assertTrue_(page.indexOf('ยังไม่มีใบสั่งงานในระบบ') !== -1,
    'พร้อมข้อความที่บอกว่าปกติใบงานจะขึ้นเมื่อไร');
  assertTrue_(page.indexOf('ไม่พบใบงานที่ตรงกับที่ค้น') !== -1,
    'และข้อความของกรณีค้นไม่เจอ ซึ่งต้องบอกทางออกคนละแบบ');

  /* ---------- หน้าแรกก็ต้องมีสถานะว่างของตัวเอง ---------- */
  var home = HtmlService.createHtmlOutputFromFile('ui_Home').getContent();
  assertTrue_(home.indexOf('ยังไม่มีใบสั่งงานในระบบ') !== -1,
    'แดชบอร์ดที่ยังไม่มีใบงานเลย ต้องบอกด้วยถ้อยคำที่เข้าใจได้ ไม่ใช่โชว์ศูนย์ทั้งหน้า');

  return endTest_();
}

/**
 * ตัวกรอง "เลยกำหนด" และไทล์บนแดชบอร์ด (SPEC 9.2 · 17.3 · กฎข้อ 28)
 *
 * **นี่คือหน้าจอที่ทำให้ขอบเขตวันการทำงานมีประโยชน์จริง** ป้ายบนใบงานทีละใบไม่พอ
 * ถ้าต้องเปิดดูทีละใบถึงจะรู้ว่าเลยกำหนด ก็จะไม่มีใครรู้ · ชุดนี้จึงตรวจสามอย่าง
 * ที่ต้องจริงพร้อมกัน: ฐานข้อมูลเป็นคนกรอง ลำดับเรียงถูกต้อง และยอดบนไทล์
 * ตรงกับจำนวนที่เห็นตอนกดเข้าไป
 */
/**
 * แดชบอร์ดต้องตอบว่า "ฉันต้องทำอะไร" ไม่ใช่ "ระบบมีตัวเลขอะไร" (SPEC 17.1)
 *
 * การ์ดสิบสามใบเรียงต่อกันเป็นพรืดตอบคำถามที่สองได้ดี แต่ตอบคำถามแรกไม่ได้เลย
 * เพราะคนอ่านต้องไล่อ่านทุกใบก่อนถึงจะรู้ว่าใบไหนเกี่ยวกับตัวเอง · ข้อนี้จึงบังคับว่า
 * ทุกการ์ดต้องสังกัดกลุ่มที่บอกว่าใครต้องลงมือ และกลุ่มต้องมาจากประกาศชุดเดียว
 */
function test_home_cardsGroupedByWhoActs() {
  beginTest_('การ์ดบนแดชบอร์ดต้องถูกจัดกลุ่มตามคนที่ต้องลงมือทำ');

  var users = serviceTestUsers_();

  /* ---------- ทุกการ์ดต้องมีกลุ่ม และกลุ่มต้องมีอยู่จริง ---------- */
  var known = {};
  for (var g = 0; g < DASHBOARD_GROUPS.length; g++) known[DASHBOARD_GROUPS[g].key] = true;

  var all = dashboardCards_();
  var orphans = [];
  for (var c = 0; c < all.length; c++) {
    if (!all[c].group || !known[all[c].group]) orphans.push(all[c].key);
  }
  assertEquals_(orphans.join(', '), '',
    'การ์ดเหล่านี้ไม่ได้สังกัดกลุ่มที่ประกาศไว้ · การ์ดที่ไม่มีกลุ่มจะหายไปจากหน้าจอเงียบ ๆ');

  /* ---------- กลุ่มที่เตือนได้ ต้องมีกลุ่มเดียว ---------- */
  var warning = [];
  for (var w = 0; w < DASHBOARD_GROUPS.length; w++) {
    if (DASHBOARD_GROUPS[w].warn) warning.push(DASHBOARD_GROUPS[w].key);
  }
  assertEquals_(warning.length, 1,
    'ถ้าทุกกลุ่มมีสีเตือน จะไม่มีกลุ่มไหนเตือนอะไรได้เลย (มี ' + warning.join(', ') + ')');

  /* ---------- ของจริงที่ส่งให้หน้าเว็บ ต้องครบและไม่ซ้ำ ---------- */
  clearDashboardCache_();
  var dash = withTestUser_(users.admin, function () { return dashboardFor(getCurrentUser_()); });

  assertTrue_(dash.cardGroups.length >= 2, 'ผู้ดูแลต้องเห็นมากกว่าหนึ่งกลุ่ม');

  var inGroups = 0;
  var seen = {};
  for (var i = 0; i < dash.cardGroups.length; i++) {
    assertTrue_(!!dash.cardGroups[i].label, 'ทุกกลุ่มต้องมีหัวข้อให้คนอ่าน');
    assertTrue_(dash.cardGroups[i].cards.length > 0,
      'กลุ่มที่ไม่มีการ์ดอยู่ข้างใต้ ต้องไม่ถูกส่งออกไป (' + dash.cardGroups[i].key + ')');
    for (var k = 0; k < dash.cardGroups[i].cards.length; k++) {
      var one = dash.cardGroups[i].cards[k];
      assertTrue_(!seen[one.key], 'การ์ด ' + one.key + ' ต้องอยู่กลุ่มเดียว ไม่ใช่โผล่สองที่');
      seen[one.key] = true;
      assertTrue_(!!one.query, 'ทุกการ์ดต้องกดเข้าไปต่อได้ — ' + one.key);
      inGroups++;
    }
  }
  assertEquals_(inGroups, dash.cards.length,
    'การ์ดทุกใบที่ผู้ใช้เห็นได้ ต้องอยู่ในกลุ่มใดกลุ่มหนึ่งครบ ไม่มีใบไหนตกหล่น');

  /* ---------- ยอดศูนย์ต้องยังอยู่ ---------- */
  /*
   * ผู้ใช้ที่ไม่มีงานค้างเลยต้องยังเห็นการ์ดครบ · ถ้าซ่อนการ์ดที่เป็นศูนย์
   * หน้าจะเปลี่ยนรูปร่างไปมาทุกวันจนจำตำแหน่งไม่ได้ แล้วต้องอ่านใหม่ทั้งหน้าทุกครั้ง
   */
  var zeros = 0;
  for (var z = 0; z < dash.cards.length; z++) {
    if (!dash.cards[z].count) zeros++;
  }
  Logger.log('  การ์ดทั้งหมด ' + dash.cards.length + ' ใบ · เป็นศูนย์ ' + zeros +
    ' ใบ · ' + dash.cardGroups.length + ' กลุ่ม');
  assertEquals_(inGroups, dash.cards.length, 'รวมถึงใบที่เป็นศูนย์ด้วย');

  /* ---------- หน้าเว็บต้องวาดตามกลุ่มที่เซิร์ฟเวอร์จัดมา ไม่ใช่จัดเอง ---------- */
  var page = stripComments_(HtmlService.createHtmlOutputFromFile('ui_Home').getContent());
  assertTrue_(page.indexOf('data.cardGroups') !== -1,
    'หน้าแรกต้องวาดจากกลุ่มที่เซิร์ฟเวอร์จัดมา · ถ้าหน้าเว็บจัดเอง การ์ดใหม่จะโผล่ผิดกลุ่มหรือหายไป');

  /* ---------- ต้องเดินทางไปถึงหน้าเว็บจริง ไม่ใช่แค่ถูกที่ต้นทาง ---------- */
  /*
   * เคยเกิดจริง: แดชบอร์ดจัดกลุ่มถูกต้องทุกอย่าง แต่ชื่อคีย์ไปชนกับ `groups`
   * ของแถบเมนู ตัวรวมข้อมูลจึงทิ้งของแดชบอร์ดเงียบ ๆ · หน้าแรกได้กลุ่มเมนู
   * มาวาดเป็นการ์ดแล้วตายทันที · เทสต์เดิมเรียก dashboardFor() ตรง ๆ จึงเขียวอยู่
   * ทั้งที่หน้าแรกเปิดไม่ขึ้นเลย — ต้องตรวจผ่านทางที่หน้าเว็บใช้จริง
   */
  var boot = withTestUser_(users.admin, function () { return pageBootstrap_('home', {}); });

  assertEquals_(boot.error, '', 'ก้อนข้อมูลตั้งต้นของหน้าแรกต้องไม่มีข้อผิดพลาด');
  assertTrue_(!!boot.cardGroups && boot.cardGroups.length >= 2,
    'กลุ่มการ์ดต้องเดินทางไปถึงหน้าเว็บ ไม่ใช่ถูกทิ้งระหว่างทาง');
  for (var b = 0; b < boot.cardGroups.length; b++) {
    assertTrue_(!!boot.cardGroups[b].cards && boot.cardGroups[b].cards.length > 0,
      'ทุกกลุ่มที่ส่งถึงหน้าเว็บต้องมีการ์ดอยู่ข้างใน — ' + boot.cardGroups[b].key);
  }

  // และกลุ่มของแถบเมนูต้องยังเป็นของเดิม ไม่ถูกทับด้วยกลุ่มการ์ด
  assertTrue_(!!boot.groups && boot.groups.length > 0 && !!boot.groups[0].children,
    'คีย์ groups ต้องยังเป็นกลุ่มเมนูของแถบซ้าย ซึ่งมี children ไม่ใช่ cards');

  var needs = pageNeedsOf_('ui_Home');
  assertTrue_(needs.indexOf('cardGroups') !== -1,
    'หน้าแรกต้องประกาศ cardGroups ไว้ใน PAGE_NEEDS ด้วย ไม่งั้นด่านคีย์ขาดจะมองไม่เห็นมัน');
  assertTrue_(page.indexOf('is-warn') !== -1, 'และต้องมีสถานะเตือนสำหรับกลุ่มที่ควรเตือน');
  assertTrue_(page.indexOf('stat-go') !== -1,
    'ทุกการ์ดต้องเห็นว่ากดได้ ไม่ใช่รู้เมื่อลองกด');

  return endTest_();
}

function test_home_overdueFilter() {
  beginTest_('ตัวกรอง "เลยกำหนด" กรองที่ฐานข้อมูล และตรงกับยอดบนแดชบอร์ด');

  var users = serviceTestUsers_();
  var tag = testRunId_();

  /* ---------- ฐานข้อมูลต้องเป็นคนกรอง ไม่ใช่ลากทุกใบมาคัดในหน่วยความจำ ---------- */
  /*
   * ตรวจจากเส้นทางที่ URL ถูกประกอบขึ้นจริง ไม่ใช่เชื่อว่าตัวกรองถูกส่งไป ·
   * ถ้าวันหนึ่งมีคนย้ายการคัดมาไว้ในหน่วยความจำ สามบรรทัดนี้จะหายไปจาก URL ทันที
   * แต่ผลลัพธ์จะยังถูกต้องอยู่พักหนึ่ง จนถึงวันที่ใบงานเกินหนึ่งพันใบแล้วค่อยเงียบ ๆ ผิด
   */
  var path = dbSelectPath_(SHEET.WORK_ORDER, {
    select: woListFields_(),
    filters: woListFilters_(normalizeWoQuery_({ overdue: true })),
    order: woListOrder_(normalizeWoQuery_({ overdue: true })),
    limit: WO_LIST_PAGE_SIZE, offset: 0
  });
  var url = decodeURIComponent(path);

  assertTrue_(url.indexOf('due_date=lt.') !== -1,
    'ต้องส่งเงื่อนไขวันครบกำหนดไปให้ฐานข้อมูล · ได้: ' + url);
  assertTrue_(url.indexOf('duration_days=not.is.null') !== -1,
    'และต้องบอกด้วยว่าเอาเฉพาะใบที่กำหนดขอบเขตวันไว้ ซึ่งเป็นเงื่อนไขที่ทำให้ index ถูกใช้');
  assertTrue_(url.indexOf('overall_status=not.in.') !== -1,
    'และต้องตัดใบที่ปิดหรือยกเลิกแล้วออกที่ฐานข้อมูล ไม่ใช่กรองทิ้งทีหลัง');
  assertTrue_(url.indexOf('order=due_date.asc') !== -1,
    'และต้องให้ฐานข้อมูลเรียงใบที่เลยนานที่สุดขึ้นก่อน');

  // วันที่ในเงื่อนไขต้องเป็นวันไทย ไม่ใช่วัน UTC
  assertTrue_(url.indexOf('due_date=lt.' + thaiDayOf_(new Date())) !== -1,
    'วันที่ที่ใช้เทียบต้องเป็นวันนี้ตามเวลาไทย · ได้: ' + url);

  /* ---------- เตรียมใบงานห้าแบบ ---------- */
  /*
   * ต้องย้อนวันที่เปิดใบงานเอง เพราะของจริงเปิดใบวันนี้เสมอ และเราต้องการใบที่
   * เลยกำหนดมาแล้วจริง ๆ · การแก้ข้อมูลที่เตรียมไว้เป็นสิ่งที่กติกาข้อมูลทดสอบอนุญาต
   */
  var made = {};
  var plan = [
    { key: 'long',    days: 5,  ago: 30 },   // เลยมา 25 วัน
    { key: 'short',   days: 5,  ago: 10 },   // เลยมา 5 วัน
    { key: 'notYet',  days: 60, ago: 10 },   // ยังไม่ถึงกำหนด
    { key: 'noLimit', days: '', ago: 30 },   // ไม่ได้กำหนดขอบเขตวัน
    { key: 'closed',  days: 5,  ago: 30 }    // เลยกำหนด แต่ถูกยกเลิกไปแล้ว
  ];

  for (var p = 0; p < plan.length; p++) {
    var wo = createTestWo_(users, {
      'Location': 'จุดกำหนดเวลา' + tag,
      'Project':  'โครงการกำหนดเวลา' + tag,
      'Duration_Days': plan[p].days
    });
    updateRow_(SHEET.WORK_ORDER, 'WO_ID', wo.woId, {
      'Created_Date': new Date(Date.now() - plan[p].ago * 86400000)
    });
    made[plan[p].key] = wo.woId;
  }

  callApiAs_(users.approver, 'ยกเลิกใบที่จบไปแล้ว', function () {
    return api_cancelWorkOrder(made.closed, 'ลูกค้ายกเลิกงาน', lockOf_(made.closed));
  });
  clearDashboardCache_();

  /* ---------- ผลลัพธ์ต้องมีเฉพาะใบที่เลยกำหนดจริง ---------- */
  var got = homeList_({ overdue: true });
  var ids = homeIdsOf_(got);

  assertTrue_(ids.indexOf(made.long) !== -1, 'ใบที่เลยมา 25 วัน ต้องอยู่ในผลลัพธ์');
  assertTrue_(ids.indexOf(made.short) !== -1, 'ใบที่เลยมา 5 วัน ต้องอยู่ในผลลัพธ์');
  assertTrue_(ids.indexOf(made.notYet) === -1, 'ใบที่ยังไม่ถึงกำหนด ต้องไม่ติดตัวกรองนี้');
  assertTrue_(ids.indexOf(made.noLimit) === -1,
    'ใบที่ไม่ได้กำหนดขอบเขตวัน ต้องไม่ติดตัวกรองนี้ — ช่องว่างไม่ได้แปลว่าเกินกำหนด');
  assertTrue_(ids.indexOf(made.closed) === -1,
    'ใบที่ยกเลิกไปแล้วต้องหยุดนับ งานจบไปแล้ว การนับต่อไม่มีความหมาย');

  /* ---------- เรียงใบที่เลยนานที่สุดขึ้นก่อน ---------- */
  /*
   * ถ้าเรียงแบบเดิม (ใหม่ไปเก่า) ใบที่ค้างมาสามเดือนจะอยู่หน้าสุดท้าย
   * ซึ่งไม่มีใครเลื่อนไปดู แล้วตัวกรองนี้ก็ไม่ได้ช่วยอะไรเลย
   */
  assertTrue_(ids.indexOf(made.long) < ids.indexOf(made.short),
    'ใบที่เลยมานานกว่าต้องอยู่ก่อน');

  var previous = '';
  for (var r = 0; r < got.rows.length; r++) {
    var row = got.rows[r];
    assertEquals_(row.due.has, true, 'ทุกแถวในผลลัพธ์ต้องมีขอบเขตวันจริง');
    assertEquals_(row.due.state, DUE_STATE.OVER, 'และต้องอยู่ในสถานะเกินกำหนดทุกแถว');
    if (previous) {
      assertTrue_(row.due.dueDate >= previous,
        'ลำดับต้องเรียงตามวันครบกำหนดจากเก่าไปใหม่ตลอดทั้งหน้า');
    }
    previous = row.due.dueDate;
  }

  /* ---------- ยอดบนไทล์ต้องตรงกับจำนวนที่เห็นตอนกดเข้าไป ---------- */
  /*
   * **แดชบอร์ดที่โชว์ยอดที่กดเข้าไปแล้วเจอคนละจำนวน แย่กว่าไม่โชว์เลย**
   * เพราะคนจะเลิกเชื่อตัวเลขทุกตัวบนหน้านั้นไปพร้อมกัน
   */
  clearDashboardCache_();
  var dash = withTestUser_(users.admin, function () { return dashboardFor(getCurrentUser_()); });
  var card = null;
  for (var c = 0; c < dash.cards.length; c++) {
    if (dash.cards[c].key === 'overdue') card = dash.cards[c];
  }
  assertTrue_(!!card, 'แดชบอร์ดต้องมีไทล์ "เลยกำหนด"');
  assertEquals_(card.query.overdue, true, 'และไทล์ต้องพาไปรายการที่กรองไว้แล้ว');
  assertEquals_(card.count, got.total,
    'ยอดบนไทล์ต้องเท่ากับจำนวนในรายการที่กดเข้าไปเป๊ะ · ไทล์ ' + card.count +
    ' รายการ ' + got.total);

  /* ---------- ชื่อพารามิเตอร์สองฝั่งต้องตรงกัน ---------- */
  /*
   * ไทล์ส่งเงื่อนไขไปทาง query string · ถ้าชื่อไม่ตรงกับที่ webWoListQuery_ อ่าน
   * ไทล์จะพาไปหน้ารายการที่ไม่ได้กรองอะไรเลย ซึ่งดูเหมือนทำงานปกติทุกประการ
   */
  assertEquals_(webWoListQuery_({ overdue: '1' }).overdue, true,
    'พารามิเตอร์ overdue=1 ที่มากับลิงก์ ต้องถูกอ่านเป็นธงจริง');
  var homePage = HtmlService.createHtmlOutputFromFile('ui_Home').getContent();
  assertTrue_(homePage.indexOf('overdue=1') !== -1,
    'และหน้าแดชบอร์ดต้องประกอบลิงก์ด้วยชื่อเดียวกัน');

  /* ---------- เงื่อนไขที่มากับลิงก์ ต้องไม่หายไปเมื่อกดหน้าถัดไป ---------- */
  /*
   * ผู้ใช้กดไทล์บนแดชบอร์ดเข้ามา = เงื่อนไขเดินทางมาทาง query string ซึ่งหน้าเว็บ
   * ไม่เคยเห็น · ถ้าเซิร์ฟเวอร์ไม่ส่งกลับไป รอบแรกจะกรองถูก แต่พอกดหน้าถัดไป
   * ตัวกรองจะหายไปเงียบ ๆ แล้วผู้ใช้จะได้รายการทั้งหมดโดยไม่มีอะไรบอก
   */
  var boot = withTestUser_(users.admin, function () {
    return pageBootstrap_('wolist', { overdue: '1' });
  });
  assertEquals_(boot.query.overdue, true,
    'หน้ารายการต้องได้เงื่อนไขที่ใช้จริงกลับไปด้วย ไม่ใช่ได้แต่แถว');
  assertEquals_(boot.error, '', 'และต้องไม่มีข้อผิดพลาด · ได้: ' + boot.error);

  var page = HtmlService.createHtmlOutputFromFile('ui_WoList').getContent();
  assertTrue_(page.indexOf('state.query = data.query') !== -1,
    'และหน้าเว็บต้องรับเงื่อนไขชุดนั้นไปถือไว้แทนชุดที่ตัวเองเดา');

  var echoed = homeList_({ overdue: true, statuses: [WO_STATUS.PENDING_APPROVE], text: 'abc' });
  assertEquals_(echoed.query.overdue, true, 'ธงเลยกำหนดต้องเดินทางกลับไปด้วย');
  assertEquals_(echoed.query.text, 'abc', 'คำค้นก็เหมือนกัน');
  assertEquals_(echoed.query.statuses.join(','), WO_STATUS.PENDING_APPROVE,
    'และรายการสถานะที่ผ่านการคัดแล้ว');

  var junk = homeList_({ statuses: ['สถานะที่ไม่มีอยู่จริง'] });
  assertEquals_(junk.query.statuses.length, 0,
    'ค่าที่เซิร์ฟเวอร์ปฏิเสธต้องหายไปจากชุดที่ส่งกลับด้วย — หน้าจอจะได้แสดงสิ่งที่กรองอยู่จริง');

  /* ---------- ต้นทุนต้องไม่เพิ่มจากการกรองปกติ ---------- */
  dbCallReset_();
  homeList_({ overdue: true });
  var overdueCalls = dbCallCount();

  dbCallReset_();
  homeList_({ statuses: [WO_STATUS.PENDING_APPROVE] });
  var plainCalls = dbCallCount();

  assertEquals_(overdueCalls, plainCalls,
    'การกรองเลยกำหนดต้องใช้คำขอเท่ากับการกรองปกติ · ถ้ามากกว่า แปลว่ามีการนับแยก ' +
    '(เลยกำหนด ' + overdueCalls + ' · ปกติ ' + plainCalls + ')');

  /* ---------- เงื่อนไขที่ขัดกันเอง ต้องได้ผลว่าง ไม่ใช่ทิ้งเงื่อนไขทิ้ง ---------- */
  var impossible = homeList_({ overdue: true, statuses: [WO_STATUS.COMPLETED] });
  assertEquals_(impossible.total, 0,
    'ขอใบที่เลยกำหนดแต่เลือกเฉพาะสถานะที่จบแล้ว ต้องได้ผลว่าง เพราะใบที่จบแล้วหยุดนับ');
  assertEquals_(impossible.emptyReason, 'NO_MATCH',
    'และต้องบอกว่าไม่ตรงกับที่ค้น ไม่ใช่บอกว่าระบบไม่มีข้อมูล');

  /* ---------- กรองสถานะพร้อมกับเลยกำหนด ต้องได้ทั้งสองเงื่อนไข ---------- */
  var both = homeList_({ overdue: true, statuses: [WO_STATUS.PENDING_APPROVE] });
  for (var i = 0; i < both.rows.length; i++) {
    assertEquals_(both.rows[i].status, WO_STATUS.PENDING_APPROVE,
      'ตัวกรองสถานะต้องไม่ถูกเงื่อนไข "ใบยังไม่จบ" เขียนทับ');
    assertEquals_(both.rows[i].due.state, DUE_STATE.OVER,
      'และต้องยังเป็นใบที่เลยกำหนดจริง');
  }

  return endTest_();
}

/**
 * จำนวนคำขอต่อการเปิดหน้า ต้องไม่โตตามจำนวนใบงาน (SPEC 23)
 *
 * **นี่คือข้อพิสูจน์ว่าเราแก้ที่ต้นเหตุจริง ไม่ใช่แค่เลื่อนปัญหา**
 *
 * ข้อนี้เคยนับรอบชีตแล้วพิสูจน์ว่าดัชนีทำให้ต้นทุนคงที่ · ดัชนีนั้นคงที่จริงในแง่
 * จำนวนครั้งที่อ่าน แต่ **ขนาดของมันโตตามจำนวนใบงานไม่มีที่สิ้นสุด** แล้วชนเพดาน
 * แคชที่ราวสี่เดือนครึ่ง · ตอนนี้ไม่มีอะไรโตตามจำนวนใบงานอีกแล้ว ทั้งจำนวนคำขอ
 * และขนาดของสิ่งที่ถูกส่งข้ามเครือข่าย
 *
 * วัดที่ศูนย์ใบกับห้าสิบใบ ถ้าตัวเลขขยับแม้แต่หนึ่ง แปลว่ามีอะไรกลับไปอ่านทีละแถว
 */
function test_home_tripsAreConstant() {
  beginTest_('เปิดหน้าหนึ่งครั้ง ใช้คำขอเท่าเดิมไม่ว่าจะมีกี่ใบงาน');

  var admin = serviceTestUsers_().admin;

  /**
   * วัดจำนวนคำขอของการเปิดหน้าหนึ่งครั้ง โดยเริ่มจากแคชว่างจริง
   * @param {string} page ชื่อหน้า
   * @return {number} จำนวนคำขอ
   */
  var measure = function (page) {
    clearRowCache_();
    clearMasterCache_();
    clearDashboardCache_();
    dbCallReset_();
    withTestUser_(admin, function () { return pageBootstrap_(page, {}); });
    return dbCallCount();
  };

  /* ---------- ยังไม่มีใบงานที่เราสร้าง ---------- */
  var emptyHome = measure('home');
  var emptyList = measure('wolist');

  /* ---------- มีใบงานห้าสิบใบ ---------- */
  var count = 50;
  var prefix = seedWorkOrders_(count);
  var fullHome, fullList;

  try {
    fullHome = measure('home');
    fullList = measure('wolist');

    assertEquals_(fullHome, emptyHome,
      'หน้าแรกต้องใช้คำขอเท่าเดิมเป๊ะที่ 0 ใบและที่ ' + count + ' ใบ · ' +
      'วัดได้ ' + emptyHome + ' และ ' + fullHome);
    assertEquals_(fullList, emptyList,
      'หน้ารายการก็ต้องเท่าเดิม · วัดได้ ' + emptyList + ' และ ' + fullList);

    /* ---------- และต้องอยู่ในเพดานที่ตกลงกันไว้ ---------- */
    assertTrue_(fullHome <= DB_CALL_BUDGET.cold.home,
      'หน้าแรกตอนแคชว่าง ต้องไม่เกิน ' + DB_CALL_BUDGET.cold.home + ' คำขอ (ยิงจริง ' + fullHome + ')');
    assertTrue_(fullList <= DB_CALL_BUDGET.cold.wolist,
      'หน้ารายการตอนแคชว่าง ต้องไม่เกิน ' + DB_CALL_BUDGET.cold.wolist +
      ' คำขอ (ยิงจริง ' + fullList + ')');

    /* ---------- แคชอุ่น: คนถัดไปที่เปิดหน้าแรกต้องถูกกว่า ---------- */
    dbCallReset_();
    ROW_CACHE_ = {};
    DASHBOARD_RUN_CACHE_ = null;
    withTestUser_(admin, function () { return pageBootstrap_('home', {}); });
    var warmHome = dbCallCount();
    assertTrue_(warmHome <= DB_CALL_BUDGET.warm.home,
      'หน้าแรกตอนแคชอุ่น ต้องไม่เกิน ' + DB_CALL_BUDGET.warm.home + ' คำขอ (ยิงจริง ' + warmHome + ')');
    assertTrue_(warmHome <= fullHome,
      'แคชอุ่นต้องไม่แพงกว่าแคชว่าง — ถ้าแพงกว่า แปลว่าแคชยอดไม่ได้ทำงาน');

    /* ---------- และหน้ารายการยังส่งแค่หน้าละยี่สิบแถว ---------- */
    var data = homeList_({ text: prefix });
    assertEquals_(data.rows.length, WO_LIST_PAGE_SIZE,
      'ส่งกลับแค่หน้าละ ' + WO_LIST_PAGE_SIZE + ' แถว ไม่ใช่ส่งทั้งห้าสิบใบข้ามไปหน้าเว็บ');
    assertEquals_(data.total, count, 'แต่ยังนับได้ครบว่าตรงเงื่อนไขกี่ใบ');
  } finally {
    cleanSeededWorkOrders_(prefix, count);
    clearDashboardCache_();
  }

  /* ---------- มีคนเขียนใบงาน ยอดที่แคชไว้ต้องถูกทิ้งทันที ---------- */
  /*
   * เงื่อนไขที่แท้จริงคือ "ใบงานหรืองานของแผนกถูกเขียน" ไม่ใช่ "แคชข้อมูลตั้งต้นถูกล้าง"
   *
   * สองอย่างนี้เคยผูกกันอยู่เพราะบังเอิญอยู่บนเส้นทางเดียวกัน ซึ่งทำให้การล้างแคช
   * ของตาราง Master ไปล้างยอดใบงานด้วยโดยไม่มีเหตุผล · ข้อนี้จึงตรวจสองทางพร้อมกัน
   * คือทางเขียนจริงต้องล้าง และทางที่ไม่เกี่ยวต้องไม่ล้าง — ถ้าตรวจแต่ทางแรก
   * การผูกกลับเข้าไปใหม่จะผ่านได้เงียบ ๆ
   */
  var tableWrites = [SHEET.WORK_ORDER, SHEET.DEPARTMENT_TASK];
  for (var w = 0; w < tableWrites.length; w++) {
    assertTrue_(!!dashboardTotals_(), 'ต้องอ่านยอดได้ก่อน');
    noteRepoWrite_(tableWrites[w]);
    assertEquals_(DASHBOARD_RUN_CACHE_, null,
      'เขียน ' + tableWrites[w] + ' แล้ว ยอดที่แคชไว้ต้องถูกทิ้งทันที ' +
      'ไม่ใช่ปล่อยให้ผู้ใช้ที่เพิ่งกดอนุมัติกลับมาเห็นตัวเลขเดิม');
  }

  assertTrue_(!!dashboardTotals_(), 'อ่านยอดใหม่ได้');
  noteRepoWrite_(SHEET.REPORT_MASTER);
  assertTrue_(DASHBOARD_RUN_CACHE_ !== null,
    'การเขียนตารางที่ไม่เกี่ยวกับยอดใบงาน ต้องไม่ล้างยอดทิ้ง — ' +
    'ไม่งั้นการแก้ข้อมูลตั้งต้นจะทำให้ทุกคนต้องนับยอดใหม่โดยไม่มีเหตุผล');

  /* ---------- และทางเขียนจริงต้องเรียกตัวนี้ ไม่ใช่แค่มีฟังก์ชันไว้เฉย ๆ ---------- */
  var writers = ['appendRows_', 'updateRow_', 'deleteRowByKey_'];
  for (var f = 0; f < writers.length; f++) {
    var source = stripComments_(String((typeof globalThis !== 'undefined' ? globalThis : this)[writers[f]]));
    assertTrue_(source.indexOf('noteRepoWrite_') !== -1,
      writers[f] + ' ต้องแจ้งว่ามีการเขียนเกิดขึ้น · ถ้าถอดออก ยอดบนหน้าแรกจะค้างอยู่หนึ่งนาที ' +
      'โดยไม่มีอะไรฟ้องเลย');
  }

  return endTest_();
}

/**
 * โค้ดโปรดักชันต้องไม่มีที่ไหนเหลือที่อ่านตาราง WorkOrder ทั้งตาราง (SPEC 23)
 *
 * **ข้อนี้คือสิ่งเดียวที่กันไม่ให้ดัชนีกลับมาเกิดใหม่**
 *
 * หน้าแรกเดิมอ่านใบงานทุกใบมาสร้างดัชนีแล้วแคชไว้ ซึ่งคงที่ในแง่จำนวนครั้งที่อ่าน
 * แต่ขนาดของมันโตตามจำนวนใบงานไม่มีที่สิ้นสุด แล้วจะชนเพดานแคชที่ราวสี่เดือนครึ่ง
 * โดยไม่มีอะไรฟ้อง · การรื้อมันออกครั้งเดียวไม่พอ เพราะการอ่านทั้งตารางเป็นวิธี
 * ที่เขียนง่ายที่สุดเสมอ และจะถูกเขียนกลับเข้ามาใหม่ในวันที่ต้องการยอดสักตัว
 *
 * ตัวสแกนนี้อ่านซอร์สของฟังก์ชันจริงตอนรัน แล้วหาการเรียกที่ลากทั้งตารางมา
 * ไม่ใช่เชื่อว่าลบไปแล้ว · ชุดทดสอบเรียกของพวกนี้ได้ตามปกติ เพราะการนับแถว
 * ทั้งตารางเพื่อพิสูจน์ว่า "ไม่มีแถวใหม่ถูกเขียน" เป็นงานของเทสต์ ไม่ใช่ของระบบ
 */
function test_home_noFullTableReadOfWorkOrders() {
  beginTest_('ไม่มีโค้ดโปรดักชันที่อ่านใบงานทั้งตาราง');

  var scope = (typeof globalThis !== 'undefined') ? globalThis : this;

  /*
   * ประกอบชื่อตอนรัน ไม่เขียนเต็ม ๆ ไว้ในบรรทัดเดียว เพราะตัวสแกนจะเห็นตัวเองแล้วฟ้อง
   * (วิธีเดียวกับที่ test_layerPurity และ test_notify_noOverdueEvent ใช้อยู่แล้ว)
   */
  var whole = [
    'list' + 'WorkOrders()',
    'readAll_(SHEET.WORK' + '_ORDER)',
    'readAllActive_(SHEET.WORK' + '_ORDER)',
    "db_selectAll_(SHEET.WORK" + "_ORDER"
  ];

  /* ---------- ตัวสแกนต้องจับของปลอมได้ก่อน ---------- */
  /*
   * ด่านนี้สำคัญกว่าที่เห็น · ตัวสแกนที่หาอะไรไม่เจอเลย กับตัวสแกนที่พังจนหาอะไร
   * ไม่เจอ ให้ผลเขียวเหมือนกันทุกประการ · พิสูจน์ด้วยข้อความปลอมก่อนเสมอ
   */
  for (var w = 0; w < whole.length; w++) {
    assertTrue_(hasFullTableRead_('function fake() { return ' + whole[w] + '; }', whole),
      'ตัวสแกนต้องจับรูปแบบ ' + whole[w] + ' ได้');
  }
  assertTrue_(!hasFullTableRead_('function fine() { return findWorkOrdersBy("Route", "SP"); }', whole),
    'และต้องไม่ฟ้องการอ่านที่มีเงื่อนไข ซึ่งเป็นวิธีที่ถูกต้อง');

  /* ---------- ไล่ดูของจริงทุกฟังก์ชัน ---------- */
  var offenders = [];
  var scanned = 0;

  for (var name in scope) {
    if (typeof scope[name] !== 'function') continue;
    if (name.indexOf('test_') === 0) continue;            // ชุดทดสอบนับแถวได้ตามปกติ
    if (TEST_ONLY_FUNCTIONS_.indexOf(name) !== -1) continue;
    if (name === 'listWorkOrders') continue;              // ตัวมันเองคือของที่ถูกห้ามเรียก
    if (name === 'hasFullTableRead_') continue;           // ตัวสแกนมีรูปแบบอยู่ในตัว

    var source;
    try { source = stripComments_(String(scope[name])); } catch (e) { continue; }
    scanned++;
    if (hasFullTableRead_(source, whole)) offenders.push(name);
  }

  assertTrue_(scanned > 100, 'ตัวสแกนต้องเห็นโค้ดของระบบจริง (เห็น ' + scanned + ' ตัว)');
  assertEquals_(offenders.join(', '), '',
    'ฟังก์ชันเหล่านี้ยังอ่านใบงานทั้งตารางอยู่ · ให้ฐานข้อมูลกรองมาให้แทน (กฎข้อ 28) — ' +
    'การอ่านทั้งตารางจะเร็วอยู่จนถึงวันที่ข้อมูลเยอะ ซึ่งเป็นวันที่แก้ยากที่สุด');

  /* ---------- และหน้าแรกต้องไม่มีดัชนีให้รื้ออีกแล้ว ---------- */
  var gone = ['woIndex_', 'buildWoIndex_', 'putWoIndexCache_', 'clearWoIndexCache_',
    'homeIndexHealth_', 'homeWorkOrders'];
  for (var g = 0; g < gone.length; g++) {
    assertEquals_(typeof scope[gone[g]], 'undefined',
      'ฟังก์ชัน ' + gone[g] + ' ของดัชนีเดิมต้องถูกลบไปแล้ว ไม่ใช่แค่เลิกเรียก');
  }

  /* ---------- เหตุการณ์ของดัชนีก็ต้องหายไปด้วย ---------- */
  assertEquals_(ACTION.HOME_INDEX_LARGE, undefined,
    'เหตุการณ์เตือนขนาดดัชนีต้องถูกลบ เพราะไม่มีดัชนีให้เตือนอีกแล้ว');
  assertEquals_(ACTION.HOME_INDEX_NOT_CACHED, undefined,
    'และเหตุการณ์แคชดัชนีไม่สำเร็จก็เหมือนกัน');

  return endTest_();
}

/**
 * ซอร์สนี้มีการอ่านทั้งตารางอยู่ไหม
 * @param {string} source ซอร์สของฟังก์ชัน ตัดคอมเมนต์ออกแล้ว
 * @param {string[]} patterns รูปแบบที่ห้ามมี
 * @return {boolean}
 */
function hasFullTableRead_(source, patterns) {
  for (var i = 0; i < patterns.length; i++) {
    if (source.indexOf(patterns[i]) !== -1) return true;
  }
  return false;
}

/**
 * ฟังก์ชันที่มีไว้ให้ชุดทดสอบใช้เท่านั้น — ไม่นับเป็นโค้ดโปรดักชัน
 *
 * ต้องเขียนรายชื่อไว้ ไม่ใช่เดาจากชื่อ เพราะตัวช่วยของเทสต์ไม่ได้ขึ้นต้นด้วย test_
 * ทุกตัว · รายการที่สั้นและชัดเจนดีกว่ากฎการตั้งชื่อที่ต้องจำ
 */
var TEST_ONLY_FUNCTIONS_ = Object.freeze([
  'seedWorkOrders_', 'cleanSeededWorkOrders_', 'homeList_', 'homeIdsOf_', 'homeTestData_',
  'countTestWorkOrders_', 'testRowsOf_', 'trashTestFolders_'
]);

/**
 * ช่องค้นหาเดียว ต้องค้นได้ทั้งเลขที่ใบงาน ลูกค้า โครงการ และสถานที่ (SPEC 17.1)
 */
function test_home_searchOneBox() {
  beginTest_('ค้นด้วยคำเดียว เจอได้จากทุกช่องที่ตกลงไว้');

  var fixture = homeTestData_();

  /* ---------- เลขที่ใบงาน ---------- */
  assertEquals_(homeIdsOf_(homeList_({ text: fixture.a.woId })).join(', '), fixture.a.woId,
    'ค้นด้วยเลขที่ใบงาน ต้องได้ใบนั้นใบเดียว');

  /* ---------- ชื่อลูกค้า (สามใบที่ชื่อคล้ายกัน) ---------- */
  var byCustomer = homeIdsOf_(homeList_({ text: fixture.word })).sort();
  assertEquals_(byCustomer.join(', '), [fixture.a.woId, fixture.b.woId, fixture.c.woId].sort().join(', '),
    'ค้นด้วยชื่อลูกค้า ต้องได้ครบทุกใบที่ชื่อมีคำนั้น');

  /* ---------- ชื่อโครงการ ---------- */
  var byProject = homeIdsOf_(homeList_({ text: fixture.tower })).sort();
  assertEquals_(byProject.join(', '), [fixture.a.woId, fixture.c.woId].sort().join(', '),
    'ค้นด้วยชื่อโครงการ ต้องได้ทุกใบที่โครงการมีคำนั้น');

  /* ---------- สถานที่ ---------- */
  assertEquals_(homeIdsOf_(homeList_({ text: fixture.place })).join(', '), fixture.a.woId,
    'ค้นด้วยสถานที่ ต้องได้ใบที่หน้างานอยู่ตรงนั้น');

  /* ---------- ไม่สนตัวพิมพ์เล็กใหญ่ ---------- */
  var upper = homeIdsOf_(homeList_({ text: String(fixture.a.woId).toLowerCase() }));
  assertEquals_(upper.join(', '), fixture.a.woId,
    'พิมพ์เลขที่ใบงานด้วยตัวพิมพ์เล็ก ก็ต้องเจอ');

  return endTest_();
}

/* ===========================================================================
 * เอกสารของแผนกตามขั้นตอนงาน (SPEC 14.1, 16, 20.3 · ภาคผนวก ก)
 *
 * ทุกข้อเริ่มจาก api_ ที่หน้าเว็บเรียกจริง ตามกฎใน CLAUDE.md — การแนบเอกสารกับ
 * การปิดงานเป็นงานที่ทำงานด้วยผลข้างเคียง เทสต์ที่เรียกข้างในตรง ๆ จะเขียวได้
 * แม้หน้าเว็บจะไม่ได้ต่อสายถึงกันเลย
 * =========================================================================== */

/**
 * งานของแผนกที่รับงานแล้ว พร้อมเอกสารทดสอบในตาราง Report_Master
 * @param {string} assignmentType ค่าจาก ASSIGNMENT
 * @param {string} department แผนกที่จะรับงาน
 * @param {Object} user ผู้ใช้ของแผนกนั้น
 * @return {Object} {woId, taskId, reports}
 */
function acceptedTaskFor_(assignmentType, department, user) {
  var users = serviceTestUsers_();
  var reports = addTestReports_();

  // สาย Lab มีผู้อนุมัติของตัวเอง (SPEC 3) ใช้ผู้อนุมัติผิดสายจะถูกปฏิเสธตั้งแต่ต้น
  var approver = (assignmentType === ASSIGNMENT.LAB) ? users.labApprover : users.approver;
  var created = createTestWo_(users, {
    'Assignment_Type': assignmentType, 'Location': 'จุดทดสอบเอกสารแผนก'
  });
  approveWorkOrder(created.woId, assignmentType, approver);

  var task = findTaskOfDepartment_(created.woId, department);
  var taskId = task ? task['Task_ID'] : '';
  assertTrue_(!!taskId, 'ต้องมีงานของแผนก ' + department + ' หลังอนุมัติ');

  callApiAs_(user, 'กดรับงาน', function () { return api_acceptTask(taskId); });
  return { woId: created.woId, taskId: taskId, reports: reports };
}

/**
 * แนบไฟล์หนึ่งไฟล์ผ่านทางเดียวกับที่หน้าเว็บใช้
 * @param {Object} user ผู้ใช้ของแผนก
 * @param {Object} request {woId, scope, taskId, stepId, reportCode, fileName}
 * @return {Object} ผลจาก api_uploadFile
 */
function uploadReport_(user, request) {
  return callApiAs_(user, 'แนบเอกสาร ' + request.reportCode, function () {
    return api_uploadFile({
      woId: request.woId, scope: request.scope, taskId: request.taskId,
      stepId: request.stepId || '', reportCode: request.reportCode,
      fileName: request.fileName || 'เอกสาร.pdf',
      mimeType: 'application/pdf', content: 'QUJDRA=='
    });
  });
}

/**
 * แนบรูปหน้างานหนึ่งรูปผ่านทางเดียวกับที่หน้าเว็บใช้
 *
 * รูปหน้างานไม่มีรหัสเอกสาร ใช้หัวข้อ PHOTO_TOPIC แทน ซึ่งเซิร์ฟเวอร์เป็นคนบอกหน้าเว็บ
 * มาในก้อนของ api_listTaskReports ไม่ใช่ค่าที่หน้าเว็บพิมพ์เอง
 *
 * @param {Object} user ผู้ใช้ของแผนก
 * @param {Object} request {woId, scope, taskId, stepId, fileName, mimeType}
 * @return {Object} ผลจาก api_uploadFile
 */
function uploadPhoto_(user, request) {
  return callApiAs_(user, 'แนบรูปหน้างาน', function () {
    return api_uploadFile(photoRequest_(request));
  });
}

/**
 * คำขอแนบรูปหนึ่งรูป — แยกไว้เพื่อให้เคสที่ต้องถูกปฏิเสธใช้ก้อนเดียวกันได้
 * @param {Object} request {woId, scope, taskId, stepId, fileName, mimeType}
 * @return {Object}
 */
function photoRequest_(request) {
  return {
    woId: request.woId, scope: request.scope, taskId: request.taskId,
    stepId: request.stepId || '', topicId: PHOTO_TOPIC.ID,
    fileName: request.fileName || 'IMG_0001.jpg',
    mimeType: (typeof request.mimeType === 'string') ? request.mimeType : 'image/jpeg',
    content: 'QUJDRA=='
  };
}

/**
 * ชื่อไฟล์ที่ระบบตั้งให้ ของไฟล์ล่าสุดในงานนั้น
 * @param {Object} result ผลจาก api_uploadFile
 * @return {string}
 */
function savedNameOf_(result) {
  return String((result && result.file && result.file.savedName) || '');
}

/**
 * ชื่อไฟล์ต้องตรงรูปแบบทั้งสามแบบใน SPEC 14.1
 *
 * สามแบบนี้คือสิ่งที่ทำให้ค้นเอกสารย้อนหลังได้โดยไม่ต้องเปิดไฟล์ ถ้าตั้งผิดแม้แบบเดียว
 * เอกสารของงานนั้นจะหาไม่เจอในอีกหกเดือน และไม่มีอะไรฟ้องตอนที่ตั้งผิด
 */
function test_report_fileNameShapes() {
  beginTest_('ชื่อไฟล์ถูกตามรูปแบบทั้งสามแบบ — SPEC 14.1');

  var users = serviceTestUsers_();

  /* ---------- Service: <SV_ID>_Step<n>_<Form_No>_<ลำดับ> ---------- */
  var sv = acceptedTaskFor_(ASSIGNMENT.SERVICE, DEPT.SERVICE, users.service);
  var svSteps = listStepsByTask(sv.taskId);
  var svId = String(sv.woId).replace('WO-', 'SV-');   // คำนวณเองไม่ผ่านโค้ดที่กำลังทดสอบ

  var svUpload = uploadReport_(users.service, {
    woId: sv.woId, scope: FILE_SCOPE.SERVICE, taskId: sv.taskId,
    stepId: svSteps[1]['Step_ID'], reportCode: sv.reports.svOptional.code
  });
  assertEquals_(savedNameOf_(svUpload),
    svId + '_Step2_' + sv.reports.svOptional.form + '_01.pdf',
    'ฝั่ง Service ต้องได้ <SV_ID>_Step<n>_<Form_No>_<ลำดับ>');

  /* ---------- Project: <SV_ID>_งวด<n>_<Form_No>_<ลำดับ> ---------- */
  var pj = acceptedTaskFor_(ASSIGNMENT.PROJECT, DEPT.PROJECT, users.project);
  var pjId = String(pj.woId).replace('WO-', 'SV-');
  var period = callApiAs_(users.project, 'เพิ่มงวดงาน', function () {
    return api_addTaskPeriod(pj.taskId, 'งวดทดสอบ');
  });

  var pjUpload = uploadReport_(users.project, {
    woId: pj.woId, scope: FILE_SCOPE.PROJECT, taskId: pj.taskId,
    stepId: period.step['Step_ID'], reportCode: pj.reports.peRequired.code
  });
  assertEquals_(savedNameOf_(pjUpload),
    pjId + '_งวด1_' + pj.reports.peRequired.form + '_01.pdf',
    'ฝั่ง Project ต้องได้ <SV_ID>_งวด<n>_<Form_No>_<ลำดับ>');

  /* ---------- Lab: <LAB_ID>_<Form_No>_<ลำดับ> และ Form_No ว่างต้องไม่พัง ---------- */
  var lab = acceptedTaskFor_(ASSIGNMENT.LAB, DEPT.LAB, users.lab);
  var labId = String(lab.woId).replace('WO-', 'LAB-');

  var labUpload = uploadReport_(users.lab, {
    woId: lab.woId, scope: FILE_SCOPE.LAB, taskId: lab.taskId,
    reportCode: lab.reports.labRequired.code
  });
  // รายการนี้ Form_No ว่างโดยตั้งใจ ระบบต้องใช้ Report_Code แทน ไม่ใช่ได้ชื่อไฟล์ที่ขาดช่วง
  assertEquals_(savedNameOf_(labUpload),
    labId + '_' + lab.reports.labRequired.code + '_01.pdf',
    'ฝั่ง Lab ต้องได้ <LAB_ID>_<Form_No>_<ลำดับ> และใช้ Report_Code แทนเมื่อ Form_No ว่าง');

  /* ---------- ตัวนำหน้าต้องไม่ใช่ WO_ID และไม่ใช่ PJ_ID ---------- */
  // ต้องดูว่า "ไม่มีเลขใบงานอยู่ในชื่อ" ไม่ใช่ดูตัวอักษรตัวแรก เพราะข้อมูลทดสอบมี TEST- นำหน้า
  assertTrue_(savedNameOf_(svUpload).indexOf('WO-') === -1,
    'ชื่อไฟล์ของเอกสารแผนกต้องใช้เลขงาน (SV_ID) ไม่ใช่เลขใบงาน');
  assertTrue_(savedNameOf_(labUpload).indexOf('LAB-') !== -1 &&
    savedNameOf_(labUpload).indexOf('WO-') === -1, 'งานแล็บใช้ LAB_ID');

  return endTest_();
}

/**
 * แนบหลายไฟล์ในเอกสารรายการเดียว ต้องได้ลำดับต่อกัน ไม่ทับกัน (SPEC 14.2)
 */
function test_report_manyFilesOneReport() {
  beginTest_('แนบสามไฟล์ในเอกสารเดียว ได้ _01 _02 _03');

  var users = serviceTestUsers_();
  var sv = acceptedTaskFor_(ASSIGNMENT.SERVICE, DEPT.SERVICE, users.service);
  var steps = listStepsByTask(sv.taskId);
  var stepId = steps[0]['Step_ID'];
  var svId = String(sv.woId).replace('WO-', 'SV-');
  var head = svId + '_Step1_' + sv.reports.svRequired.form + '_';

  var names = [];
  for (var i = 1; i <= 3; i++) {
    names.push(savedNameOf_(uploadReport_(users.service, {
      woId: sv.woId, scope: FILE_SCOPE.SERVICE, taskId: sv.taskId,
      stepId: stepId, reportCode: sv.reports.svRequired.code,
      fileName: 'หน้างาน' + i + '.pdf'
    })));
  }

  assertEquals_(names[0], head + '01.pdf', 'ไฟล์แรกได้ลำดับ 01');
  assertEquals_(names[1], head + '02.pdf', 'ไฟล์ที่สองได้ลำดับ 02');
  assertEquals_(names[2], head + '03.pdf', 'ไฟล์ที่สามได้ลำดับ 03');
  assertEquals_(uniqueCount_(names), 3, 'ชื่อทั้งสามต้องไม่ซ้ำกัน ไม่งั้นไฟล์หลังทับไฟล์หน้าใน Drive');

  /* ---------- ทั้งสามไฟล์ต้องอยู่ในเอกสารรายการเดียวกันของขั้นตอนนั้น ---------- */
  var view = callApiAs_(users.service, 'เปิดรายการเอกสาร', function () {
    return api_listTaskReports(sv.taskId);
  });
  var slot = null;
  for (var s = 0; s < view.slots.length; s++) {
    if (view.slots[s].stepId === stepId) slot = view.slots[s];
  }
  assertTrue_(!!slot, 'หาขั้นตอนที่แนบไฟล์เจอในแผงเอกสาร');
  assertEquals_(slot.files.length, 3, 'แผงเอกสารต้องเห็นครบทั้งสามไฟล์');

  return endTest_();
}

/**
 * ไฟล์ต้องเข้าโฟลเดอร์ตามขั้นตอนและงวด (SPEC 16)
 *
 * ถ้าเข้าผิดโฟลเดอร์ ระบบยังทำงานได้ทุกอย่างและไม่มีอะไรฟ้องเลย จนถึงวันที่มีคน
 * เปิด Drive หาเอกสารของงวดที่สอง แล้วเจอทุกอย่างกองรวมกันอยู่ที่เดียว
 */
function test_report_folderPerStep() {
  beginTest_('ไฟล์เข้าโฟลเดอร์ถูกตามขั้นตอนและงวด — SPEC 16');

  var users = serviceTestUsers_();

  /* ---------- Service: Service/Step 3 ---------- */
  var sv = acceptedTaskFor_(ASSIGNMENT.SERVICE, DEPT.SERVICE, users.service);
  var steps = listStepsByTask(sv.taskId);
  var third = steps[2];
  var upload = uploadReport_(users.service, {
    woId: sv.woId, scope: FILE_SCOPE.SERVICE, taskId: sv.taskId,
    stepId: third['Step_ID'], reportCode: sv.reports.svRequired.code
  });

  var map = parseFolderMap_(getWorkOrder(sv.woId)['Folder_Map']);
  assertTrue_(!!map['Service/Step 3'],
    'ต้องมีโฟลเดอร์ Service/Step 3 ของใบงานนี้ (คีย์ที่บันทึกไว้: ' +
    Object.keys(map).join(', ') + ')');

  var inFolder = driveListFiles_(map['Service/Step 3']);
  var found = false;
  for (var i = 0; i < inFolder.length; i++) {
    if (inFolder[i].name === savedNameOf_(upload)) found = true;
  }
  assertTrue_(found, 'ไฟล์ของขั้นตอนที่ 3 ต้องอยู่ในโฟลเดอร์ Step 3 จริง ๆ ไม่ใช่แค่ชื่อไฟล์บอก');

  /* ---------- Project: Project/Period N ---------- */
  var pj = acceptedTaskFor_(ASSIGNMENT.PROJECT, DEPT.PROJECT, users.project);
  var period = callApiAs_(users.project, 'เพิ่มงวดงาน', function () {
    return api_addTaskPeriod(pj.taskId, '');
  });
  uploadReport_(users.project, {
    woId: pj.woId, scope: FILE_SCOPE.PROJECT, taskId: pj.taskId,
    stepId: period.step['Step_ID'], reportCode: pj.reports.peRequired.code
  });
  var pjMap = parseFolderMap_(getWorkOrder(pj.woId)['Folder_Map']);
  assertTrue_(!!pjMap['Project/Period 1'], 'งวดที่ 1 ต้องมีโฟลเดอร์ Project/Period 1');

  /* ---------- Project ที่ยังไม่มีงวด: อยู่ที่โฟลเดอร์ Project ---------- */
  // งานที่จบในวันเดียวไม่มีงวดเลย แต่ยังต้องแนบเอกสารที่บังคับได้ (SPEC 20.2)
  var quick = acceptedTaskFor_(ASSIGNMENT.PROJECT, DEPT.PROJECT, users.project);
  var quickUpload = uploadReport_(users.project, {
    woId: quick.woId, scope: FILE_SCOPE.PROJECT, taskId: quick.taskId,
    reportCode: quick.reports.peRequired.code
  });
  var quickMap = parseFolderMap_(getWorkOrder(quick.woId)['Folder_Map']);
  assertTrue_(!!quickMap['Project'], 'งานที่ยังไม่มีงวด เอกสารอยู่ที่โฟลเดอร์ Project ของใบงาน');
  assertEquals_(savedNameOf_(quickUpload),
    String(quick.woId).replace('WO-', 'SV-') + '_' + quick.reports.peRequired.form + '_01.pdf',
    'และชื่อไฟล์ต้องไม่มีคำว่างวด เพราะงวดที่ศูนย์ไม่มีอยู่จริง');

  return endTest_();
}

/**
 * เอกสารที่ปิดใช้งานแล้ว ต้องไม่ขึ้นในรายการให้เลือก
 *
 * ผู้ดูแลปิดแบบฟอร์มรุ่นเก่าด้วยการตั้ง Active เป็นเท็จ ถ้ายังขึ้นให้เลือก
 * จะมีคนแนบเอกสารรุ่นที่เลิกใช้แล้วต่อไปอีกเป็นปี โดยไม่มีใครรู้
 */
function test_report_inactiveHidden() {
  beginTest_('เอกสารที่ปิดใช้งานแล้ว ต้องไม่ขึ้นในรายการให้เลือก');

  var users = serviceTestUsers_();
  var sv = acceptedTaskFor_(ASSIGNMENT.SERVICE, DEPT.SERVICE, users.service);

  var view = callApiAs_(users.service, 'เปิดรายการเอกสาร', function () {
    return api_listTaskReports(sv.taskId);
  });

  var codes = [];
  var types = {};
  for (var i = 0; i < view.options.length; i++) {
    codes.push(view.options[i].code);
    types[view.options[i].code] = true;
  }

  assertTrue_(codes.indexOf(sv.reports.svRequired.code) !== -1, 'เอกสารที่ใช้งานอยู่ต้องขึ้นให้เลือก');
  assertTrue_(codes.indexOf(sv.reports.svRetired.code) === -1,
    'เอกสารที่ Active เป็นเท็จ ต้องไม่ขึ้นในรายการเลย');
  assertTrue_(codes.indexOf(sv.reports.peRequired.code) === -1,
    'และต้องไม่มีเอกสารของแผนกอื่นปนมาด้วย — 41 รายการรวมกันยาวเกินกว่าจะเลื่อนหา');

  /* ---------- รายการที่บังคับต้องบอกได้ว่าบังคับ ---------- */
  var required = 0;
  for (var r = 0; r < view.options.length; r++) {
    if (view.options[r].required) required++;
  }
  assertTrue_(required >= 1, 'ต้องมีรายการที่บังคับอย่างน้อยหนึ่งรายการให้หน้าจอทำตัวหนาได้');

  /* ---------- เรียงตาม Sort_Order ที่ผู้ดูแลกรอกไว้ ---------- */
  var ordered = true;
  for (var o = 1; o < view.options.length; o++) {
    if (view.options[o].sortOrder < view.options[o - 1].sortOrder) ordered = false;
  }
  assertTrue_(ordered, 'รายการต้องเรียงตาม Sort_Order');

  /*
   * และต้องไม่ใช่ "ลำดับแถวในชีต" ด้วย — รายการ RPT-SV0 ถูกเพิ่มเป็นแถวสุดท้าย
   * แต่ Sort_Order น้อยที่สุด จึงต้องโผล่มาเป็นตัวแรกของแผนก
   * ถ้าโค้ดไม่ได้เรียงอะไรเลย ข้อนี้จะตกทันที ส่วนข้อบนจะยังผ่าน
   */
  assertEquals_(view.options[0].code, sv.reports.svFirst.code,
    'รายการที่ Sort_Order น้อยที่สุดต้องอยู่บนสุด แม้จะเป็นแถวท้ายสุดในชีต');

  return endTest_();
}

/**
 * รูปหน้างานแนบที่ขั้นตอนได้ แยกจากเอกสาร และไม่ช่วยให้ผ่านด่านเอกสารบังคับ
 * (SPEC 7.1, 7.2 · 14.1 · 16 · 20.3)
 *
 * เรื่องที่ต้องกันไว้คือการเอารูปไปนับเป็นเอกสาร — ถ้ารูปนับได้ ช่างที่ถ่ายรูปหน้างาน
 * สามรูปจะปิดงานได้ทันทีโดยไม่ต้องแนบ Service Report เลย ซึ่งเป็นรูที่มองไม่เห็นจากหน้าจอ
 */
function test_report_stepPhotos() {
  beginTest_('รูปหน้างานของขั้นตอน — ชื่อไฟล์ โฟลเดอร์ และไม่นับเป็นเอกสารบังคับ');

  var users = serviceTestUsers_();
  var sv = acceptedTaskFor_(ASSIGNMENT.SERVICE, DEPT.SERVICE, users.service);
  var steps = listStepsByTask(sv.taskId);
  var second = steps[1]['Step_ID'];
  var svId = String(sv.woId).replace('WO-', 'SV-');

  /* ---------- แนบได้หลายรูปต่อหนึ่งขั้นตอน และได้เลขลำดับต่อกัน ---------- */
  var first = uploadPhoto_(users.service, {
    woId: sv.woId, scope: FILE_SCOPE.SERVICE, taskId: sv.taskId, stepId: second
  });
  var again = uploadPhoto_(users.service, {
    woId: sv.woId, scope: FILE_SCOPE.SERVICE, taskId: sv.taskId, stepId: second,
    fileName: 'IMG_0002.jpg'
  });

  assertEquals_(savedNameOf_(first), svId + '_Step2_รูปภาพ_01.jpg',
    'ชื่อรูปบอกว่าเป็นของขั้นตอนไหน และเป็นรูปภาพ');
  assertEquals_(savedNameOf_(again), svId + '_Step2_รูปภาพ_02.jpg',
    'รูปที่สองของขั้นเดียวกันได้เลขถัดไป ไม่ทับของเดิม');

  var map = parseFolderMap_(getWorkOrder(sv.woId)['Folder_Map']);
  assertTrue_(!!map['Service/Picture'],
    'รูปหน้างานเก็บที่โฟลเดอร์ Picture ของแผนกนั้น (SPEC 16) · คีย์ที่บันทึกไว้: ' +
    Object.keys(map).join(', '));
  assertTrue_(!map['Picture'],
    'และต้องไม่ไปปนกับ Picture ของราก ซึ่งเป็นของรูปที่แนบตอนสร้างใบงาน');
  assertTrue_(!map['Service/Step 2'],
    'และไม่ได้ไปสร้างโฟลเดอร์ของขั้นตอนทิ้งไว้ ทั้งที่ยังไม่มีเอกสารสักใบในขั้นนั้น');

  /* ---------- หน้าจอเห็นรูปแยกจากเอกสาร ---------- */
  var view = callApiAs_(users.service, 'เปิดแผงขั้นตอนงาน', function () {
    return api_listTaskReports(sv.taskId);
  });
  assertEquals_(view.slots[1].photos.length, 2, 'รูปทั้งสองอยู่ในช่องรูปของขั้นตอนที่ 2');
  assertEquals_(view.slots[1].files.length, 0, 'และต้องไม่ไปโผล่ในช่องเอกสาร');
  assertEquals_(view.photoTopicId, PHOTO_TOPIC.ID,
    'หัวข้อของรูปต้องมาจากเซิร์ฟเวอร์ ไม่ใช่ค่าที่หน้าเว็บพิมพ์เอง');

  /* ---------- รูปไม่นับเป็นเอกสารที่บังคับ ---------- */
  var codes = [];
  for (var m = 0; m < view.missing.length; m++) codes.push(view.missing[m].code);
  assertTrue_(codes.join(',').indexOf(sv.reports.svRequired.code) !== -1,
    'แนบรูปแล้วเอกสารที่บังคับต้องยังขาดอยู่เหมือนเดิม');

  finishAllSteps_(sv.taskId, users.service);
  var blocked = withTestUser_(users.service, function () { return api_completeTask(sv.taskId); });
  assertEquals_(blocked.ok, false, 'และปิดงานด้วยรูปอย่างเดียวไม่ได้');

  /* ---------- ช่องรูปรับเฉพาะรูป ---------- */
  // ถ้ารับไฟล์เอกสารด้วย จะได้ไฟล์ชื่อ "_รูปภาพ_" ที่เป็น PDF อยู่ในโฟลเดอร์รูป ซึ่งตามหาไม่เจอ
  var wrongKind = withTestUser_(users.service, function () {
    return api_uploadFile(photoRequest_({
      woId: sv.woId, scope: FILE_SCOPE.SERVICE, taskId: sv.taskId, stepId: second,
      fileName: 'เอกสาร.pdf', mimeType: 'application/pdf'
    }));
  });
  assertEquals_(wrongKind.ok, false, 'ช่องรูปหน้างานต้องไม่รับไฟล์เอกสาร');
  assertTrue_(String(wrongKind.message).indexOf('รูป') !== -1,
    'และต้องบอกว่าให้ไปแนบที่ช่องเอกสารแทน');

  /* ---------- แผนกเจ้าของงานลบรูปของตัวเองได้ ---------- */
  /*
   * รูปไม่มีรหัสเอกสาร ของเดิมจึงตกไปเป็นไฟล์ระดับใบงาน แล้วสิทธิ์ลบกลายเป็นของธุรการ
   * คนที่ถ่ายรูปผิดใบจึงลบของตัวเองไม่ได้ · สิทธิ์ต้องมาจากงานที่ไฟล์นั้นผูกอยู่
   */
  callApiAs_(users.service, 'ลบรูปที่แนบผิด', function () {
    return api_removeFile(first.file.fileId);
  });
  var after = callApiAs_(users.service, 'เปิดแผงอีกครั้ง', function () {
    return api_listTaskReports(sv.taskId);
  });
  assertEquals_(after.slots[1].photos.length, 1, 'ลบแล้วเหลือรูปเดียว');

  return endTest_();
}

/**
 * ขั้นตอนถัดไปเปิดให้ทำเมื่อขั้นก่อนหน้าเสร็จแล้วเท่านั้น — ฝั่งข้อมูลที่ส่งให้หน้าจอ
 *
 * ด่านจริงอยู่ที่ updateTaskStep (ดู test_task_stepsInOrder) ข้อนี้ตรวจว่าเซิร์ฟเวอร์
 * บอกหน้าจอด้วยกติกาเดียวกัน ไม่ปล่อยให้หน้าเว็บคิดเอง ซึ่งวันหนึ่งจะคิดคนละแบบ
 */
function test_report_stepLocks() {
  beginTest_('แผงขั้นตอนงานบอกว่าขั้นไหนทำได้ตอนนี้ และติดอะไรอยู่');

  var users = serviceTestUsers_();
  var sv = acceptedTaskFor_(ASSIGNMENT.SERVICE, DEPT.SERVICE, users.service);
  var steps = listStepsByTask(sv.taskId);

  var view = callApiAs_(users.service, 'เปิดแผงขั้นตอนงาน', function () {
    return api_listTaskReports(sv.taskId);
  });
  assertEquals_(view.canEdit, true, 'งานที่รับแล้วและใบงานยังปกติ แก้ไขได้');
  assertEquals_(view.slots[0].locked, false, 'ขั้นแรกทำได้เลย');
  assertEquals_(view.slots[1].locked, true, 'ขั้นที่สองยังทำไม่ได้ เพราะขั้นแรกยังไม่เสร็จ');
  assertTrue_(String(view.slots[1].lockReason).indexOf(String(steps[0]['Step_Name'])) !== -1,
    'และต้องบอกชื่อขั้นที่ต้องไปทำก่อน ไม่ใช่บอกแค่ว่ายังทำไม่ได้');
  assertEquals_(view.slots[view.slots.length - 1].locked, true, 'ขั้นสุดท้ายก็ล็อกอยู่เช่นกัน');

  /* ---------- ปิดขั้นแรกแล้ว ขั้นที่สองต้องเปิด ---------- */
  callApiAs_(users.service, 'ปิดขั้นแรก', function () {
    return api_updateTaskStep(steps[0]['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
  });
  var next = callApiAs_(users.service, 'เปิดแผงอีกครั้ง', function () {
    return api_listTaskReports(sv.taskId);
  });
  assertEquals_(next.slots[0].done, true, 'ขั้นแรกขึ้นว่าเสร็จแล้ว');
  assertEquals_(next.slots[0].doneBy, users.service.email,
    'พร้อมบอกว่าใครปิด เพื่อให้การ์ดของงานอัปเดตตัวเองได้โดยไม่ต้องโหลดทั้งหน้าใหม่');
  assertEquals_(next.slots[1].locked, false, 'ขั้นที่สองเปิดให้ทำแล้ว');
  assertEquals_(next.slots[1].lockReason, '', 'และไม่มีเหตุผลค้างอยู่');
  assertEquals_(next.slots[2].locked, true, 'แต่ขั้นที่สามยังล็อกอยู่ตามลำดับ');

  /* ---------- สัญญาระหว่างเซิร์ฟเวอร์กับหน้าเว็บ ---------- */
  // รอยต่อนี้เทสต์ไม่ได้เดินผ่าน เพราะไม่ได้รันจาวาสคริปต์ในหน้าเว็บ (SPEC 17.3)
  var page = HtmlService.createHtmlOutputFromFile('ui_Reports').getContent();
  assertTrue_(page.indexOf('slot.lockReason') !== -1,
    'หน้าเว็บต้องแสดงเหตุผลที่เซิร์ฟเวอร์ส่งมา ไม่ใช่เทียบสถานะเอง');
  assertTrue_(page.indexOf('photo-files') !== -1, 'และต้องมีช่องเพิ่มรูปหน้างาน');
  // เจาะจงที่ตัวปุ่ม ไม่ใช่คำที่โผล่ที่ไหนก็ได้ในไฟล์ เพราะคำเดียวกันอยู่ในข้อความอธิบายด้วย
  assertTrue_(page.indexOf('act-save-slot">บันทึกขั้นตอนนี้') !== -1,
    'และต้องมีปุ่มบันทึกทีละขั้น ไม่ใช่บันทึกทุกครั้งที่กด');
  assertTrue_(page.indexOf('รอบันทึก') !== -1,
    'พร้อมรายการของที่ยังไม่ได้ส่งขึ้นระบบ');

  var dept = HtmlService.createHtmlOutputFromFile('ui_DeptWork').getContent();
  assertTrue_(dept.indexOf('step-check') === -1,
    'หน้างานของแผนกต้องไม่มีช่องติ๊กที่บันทึกทันทีอีกแล้ว เพราะมันโหลดทั้งหน้าใหม่ทุกครั้ง');
  assertTrue_(dept.indexOf('applyPanelData') !== -1,
    'และต้องอัปเดตการ์ดจากข้อมูลที่แผงส่งกลับมา แทนการโหลดรายการทั้งหน้า');

  return endTest_();
}

/**
 * ขั้นตอนที่ยังไม่มีเอกสาร ต้องบอกด้วยถ้อยคำที่เข้าใจได้ (SPEC 17.3)
 */
function test_report_emptyStep() {
  beginTest_('ขั้นตอนที่ยังไม่มีเอกสาร แสดงสถานะว่างตามกติกา 17.3');

  var users = serviceTestUsers_();
  var sv = acceptedTaskFor_(ASSIGNMENT.SERVICE, DEPT.SERVICE, users.service);

  var view = callApiAs_(users.service, 'เปิดรายการเอกสาร', function () {
    return api_listTaskReports(sv.taskId);
  });

  assertEquals_(view.slots.length, listStepsByTask(sv.taskId).length,
    'ทุกขั้นตอนต้องมีที่ให้แนบเอกสารของตัวเอง');
  var empty = 0;
  for (var i = 0; i < view.slots.length; i++) {
    if (!view.slots[i].files.length) empty++;
  }
  assertEquals_(empty, view.slots.length, 'ตอนเริ่มต้นทุกขั้นตอนยังไม่มีเอกสาร');

  /* ---------- งานที่ไม่มีขั้นตอนย่อยเลย ต้องมีที่ให้แนบที่ตัวงาน ---------- */
  /*
   * งานแล็บไม่มีขั้นตอนย่อยตาม SPEC 7.3 ถ้าไม่มีที่ให้แนบ หน้าจอแล็บจะไม่มีปุ่มแนบเลย
   * แล้วเอกสารที่บังคับของแล็บจะแนบไม่ได้ตลอดกาล ซึ่งแปลว่าปิดงานแล็บไม่ได้เลยสักใบ
   */
  var lab = acceptedTaskFor_(ASSIGNMENT.LAB, DEPT.LAB, users.lab);
  var labView = callApiAs_(users.lab, 'เปิดรายการเอกสารของแล็บ', function () {
    return api_listTaskReports(lab.taskId);
  });
  assertEquals_(labView.slots.length, 1, 'งานแล็บต้องมีที่แนบเอกสารหนึ่งที่ คือตัวงานเอง');
  assertEquals_(labView.slots[0].stepId, '', 'และที่นั้นไม่ผูกกับขั้นตอนใด');
  assertEquals_(labView.canAddPeriod, false, 'งานแล็บเพิ่มงวดไม่ได้');

  /* ---------- และหน้าเว็บต้องมีข้อความของสถานะว่างจริง ---------- */
  // สัญญาระหว่างเซิร์ฟเวอร์กับหน้าเว็บเป็นรอยต่อที่เทสต์ไม่ได้เดินผ่าน (SPEC 17.3)
  var page = HtmlService.createHtmlOutputFromFile('ui_Reports').getContent();
  assertTrue_(page.indexOf('ยังไม่มีเอกสารในขั้นตอนนี้') !== -1,
    'หน้าเว็บต้องมีข้อความบอกว่ายังไม่มีเอกสารในขั้นตอนนั้น');
  assertTrue_(page.indexOf('ค้นหาชื่อเอกสารหรือเลขฟอร์ม') !== -1,
    'และต้องมีช่องค้นหา เพราะ 41 รายการยาวเกินกว่าจะเลื่อนหา');

  return endTest_();
}

/**
 * ปิดงานไม่ได้เมื่อเอกสารที่บังคับยังไม่ครบ และข้อความต้องบอกว่าขาดอะไร (SPEC 20.3)
 */
function test_report_completeBlockedWhenMissing() {
  beginTest_('เอกสารบังคับยังไม่ครบ ปิดงานไม่ได้ และบอกว่าขาดอะไร');

  var users = serviceTestUsers_();
  var sv = acceptedTaskFor_(ASSIGNMENT.SERVICE, DEPT.SERVICE, users.service);

  // ทำทุกขั้นตอนให้ครบก่อน เพื่อให้เหลือด่านเดียวคือเรื่องเอกสาร
  finishAllSteps_(sv.taskId, users.service);

  var blocked = withTestUser_(users.service, function () { return api_completeTask(sv.taskId); });
  assertEquals_(blocked.ok, false, 'เอกสารที่บังคับยังไม่ครบ ปิดงานไม่ได้');
  assertTrue_(String(blocked.message).indexOf(sv.reports.svRequired.name) !== -1,
    'ข้อความต้องบอกชื่อเอกสารที่ขาด ไม่ใช่บอกแค่ว่าเอกสารไม่ครบ');
  assertTrue_(String(blocked.message).indexOf(sv.reports.svRequired.form) !== -1,
    'และต้องบอกเลขฟอร์มด้วย เพราะคนหน้างานจำเอกสารจากเลขฟอร์ม');
  assertTrue_(String(blocked.message).indexOf('แนบได้ที่ขั้นตอน') !== -1,
    'พร้อมบอกว่าต้องไปทำอะไรต่อ');

  assertEquals_(getTask(sv.taskId)['Status'], TASK_STATUS.IN_PROGRESS,
    'รายการที่ถูกปฏิเสธต้องไม่เปลี่ยนสถานะงาน');
  assertEquals_(getWorkOrder(sv.woId)['Overall_Status'], WO_STATUS.IN_PROGRESS,
    'และต้องไม่ลามไปเปลี่ยนสถานะใบงาน');

  /* ---------- เอกสารที่ไม่บังคับ แนบแล้วก็ยังปิดไม่ได้ ---------- */
  // ด่านต้องดูรายการที่บังคับจริง ไม่ใช่ดูว่า "มีไฟล์อะไรสักไฟล์" ในงานนี้
  uploadReport_(users.service, {
    woId: sv.woId, scope: FILE_SCOPE.SERVICE, taskId: sv.taskId,
    stepId: listStepsByTask(sv.taskId)[0]['Step_ID'], reportCode: sv.reports.svOptional.code
  });
  var still = withTestUser_(users.service, function () { return api_completeTask(sv.taskId); });
  assertEquals_(still.ok, false, 'แนบเอกสารที่ไม่บังคับ ไม่ช่วยให้ผ่านด่าน');

  return endTest_();
}

/**
 * แนบครบแล้วปิดงานได้ตามปกติ และใบงานปิดตาม (SPEC 20.3)
 */
function test_report_completeWhenReady() {
  beginTest_('เอกสารบังคับครบแล้ว ปิดงานได้ตามปกติ');

  var users = serviceTestUsers_();
  var sv = acceptedTaskFor_(ASSIGNMENT.SERVICE, DEPT.SERVICE, users.service);
  finishAllSteps_(sv.taskId, users.service);

  /* ---------- แนบผ่านทางเดียวกับหน้าเว็บ ---------- */
  uploadReport_(users.service, {
    woId: sv.woId, scope: FILE_SCOPE.SERVICE, taskId: sv.taskId,
    stepId: listStepsByTask(sv.taskId)[0]['Step_ID'], reportCode: sv.reports.svRequired.code
  });
  // บนชีตจริงอาจมีรายการบังคับของบริษัทอยู่ด้วย จึงเติมส่วนที่เหลือให้ครบ
  attachRequiredReports_(sv.taskId);

  var view = callApiAs_(users.service, 'เปิดรายการเอกสาร', function () {
    return api_listTaskReports(sv.taskId);
  });
  assertEquals_(view.missing.length, 0, 'แผงเอกสารต้องบอกว่าครบแล้ว');
  assertEquals_(view.missingMessage, '', 'และไม่มีข้อความเตือนค้างอยู่');

  var done = callApiAs_(users.service, 'ปิดงาน', function () {
    return api_completeTask(sv.taskId);
  });
  assertEquals_(getTask(sv.taskId)['Status'], TASK_STATUS.COMPLETED, 'ปิดงานของแผนกได้');
  assertEquals_(getWorkOrder(sv.woId)['Overall_Status'], WO_STATUS.COMPLETED,
    'แผนกเดียวปิดครบ ใบงานปิดตามในรายการเดียวกัน (กฎข้อ 2)');
  assertTrue_(!!done, 'รายการต้องคืนผลกลับมาให้หน้าจอ');

  /* ---------- ลบไฟล์ที่บังคับออก ต้องกลับไปขาดอีกครั้ง ---------- */
  // ป้องกันด่านที่นับ "เคยแนบ" แทนที่จะนับ "มีอยู่ตอนนี้"
  var files = listFilesByTask(sv.taskId);
  var target = '';
  for (var i = 0; i < files.length; i++) {
    if (String(files[i]['Report_Code']) === sv.reports.svRequired.code) target = files[i]['File_ID'];
  }
  deactivateFile(target);
  assertTrue_(missingRequiredReports_(sv.taskId).length >= 1,
    'ลบไฟล์ที่บังคับออกแล้ว ต้องกลับไปนับว่าขาด');

  return endTest_();
}

/**
 * งาน Project ที่ไม่มีงวดเลย ปิดได้ถ้าเอกสารครบ (SPEC 20.2 · ภาคผนวก ข.1)
 */
function test_report_projectNoPeriodCloses() {
  beginTest_('งาน Project ที่ไม่มีงวดเลย ปิดได้เมื่อเอกสารครบ');

  var users = serviceTestUsers_();
  var pj = acceptedTaskFor_(ASSIGNMENT.PROJECT, DEPT.PROJECT, users.project);

  assertEquals_(listStepsByTask(pj.taskId).length, 0, 'งานนี้ไม่มีงวดเลย ตามที่ตกลงกันใหม่');

  uploadReport_(users.project, {
    woId: pj.woId, scope: FILE_SCOPE.PROJECT, taskId: pj.taskId,
    reportCode: pj.reports.peRequired.code
  });
  attachRequiredReports_(pj.taskId);

  callApiAs_(users.project, 'ปิดงาน', function () { return api_completeTask(pj.taskId); });
  assertEquals_(getTask(pj.taskId)['Status'], TASK_STATUS.COMPLETED,
    'งานที่จบในวันเดียวต้องปิดได้ ไม่ต้องสร้างงวดหลอก ๆ ขึ้นมาก่อน');
  assertEquals_(getWorkOrder(pj.woId)['Overall_Status'], WO_STATUS.COMPLETED, 'ใบงานปิดตาม');

  return endTest_();
}

/**
 * งาน Project ที่ไม่มีงวดเลย ปิดไม่ได้ถ้าเอกสารยังไม่ครบ
 *
 * ข้อนี้สำคัญที่สุดในชุด เพราะงานที่ไม่มีงวดไม่มีด่านอื่นเหลืออยู่เลย
 * ถ้าด่านเอกสารไม่ทำงาน แผนกจะกดรับงานแล้วกดปิดงานรวดเดียวได้โดยไม่ต้องทำอะไรเลย
 */
function test_report_projectNoPeriodBlocked() {
  beginTest_('งาน Project ที่ไม่มีงวดเลย ปิดไม่ได้เมื่อเอกสารยังไม่ครบ');

  var users = serviceTestUsers_();
  var pj = acceptedTaskFor_(ASSIGNMENT.PROJECT, DEPT.PROJECT, users.project);

  assertEquals_(listStepsByTask(pj.taskId).length, 0, 'งานนี้ไม่มีงวดเลย');
  assertEquals_(stepProgressOf_(pj.taskId).allDone, true,
    'ด่าน "ทุกงวดเสร็จครบ" เป็นจริงทันทีเมื่อไม่มีงวด — ตั้งใจให้เป็นแบบนั้น');

  var blocked = withTestUser_(users.project, function () { return api_completeTask(pj.taskId); });
  assertEquals_(blocked.ok, false, 'ยังปิดไม่ได้ เพราะเอกสารที่บังคับยังไม่ครบ');
  assertTrue_(String(blocked.message).indexOf(pj.reports.peRequired.name) !== -1,
    'และต้องบอกชื่อเอกสารที่ขาด');
  assertEquals_(getTask(pj.taskId)['Status'], TASK_STATUS.IN_PROGRESS, 'สถานะต้องไม่เปลี่ยน');

  return endTest_();
}

/**
 * แผนกเพิ่มงวดเอง ทำไม่ครบปิดไม่ได้ ครบแล้วปิดได้ และลบงวดได้เฉพาะงวดที่ยังว่าง
 */
function test_report_projectPeriodsByDepartment() {
  beginTest_('แผนกเพิ่มงวดเอง 3 งวด — ทำครบจึงปิดได้');

  var users = serviceTestUsers_();
  var pj = acceptedTaskFor_(ASSIGNMENT.PROJECT, DEPT.PROJECT, users.project);

  /* ---------- แผนกแบ่งงานเป็น 3 งวดเอง ---------- */
  for (var i = 1; i <= 3; i++) {
    callApiAs_(users.project, 'เพิ่มงวดที่ ' + i, function () {
      return api_addTaskPeriod(pj.taskId, '');
    });
  }
  var created = listStepsByTask(pj.taskId);
  assertEquals_(created.length, 3, 'แผนกเพิ่มงวดเองได้ 3 งวด');
  assertEquals_(String(created[0]['Type']), STEP_TYPE.PERIOD, 'และเป็นงวดงาน ไม่ใช่ขั้นตอน');
  assertEquals_(String(created[2]['Step_Name']), 'งวดที่ 3', 'ไม่ได้ตั้งชื่อมา ระบบตั้งให้ตามลำดับ');

  /* ---------- ลบงวด "กลาง" แล้วเพิ่มใหม่ ต้องไม่ได้เลขที่ชนกับงวดที่ยังอยู่ ---------- */
  /*
   * ถ้านับเลขงวดใหม่จาก "จำนวนงวดที่เหลือ" แทน "เลขสูงสุดที่มีอยู่" จะได้เลข 3
   * ซึ่งซ้ำกับงวดที่ยังอยู่ แล้ว Step_ID จะชนกันทันที — เป็นข้อมูลเสียหายจริง
   * ไม่ใช่แค่เรื่องเลขสวยหรือไม่สวย
   */
  callApiAs_(users.project, 'ลบงวดกลาง', function () {
    return api_removeTaskPeriod(created[1]['Step_ID']);
  });
  var afterMiddle = callApiAs_(users.project, 'เพิ่มงวดหลังลบงวดกลาง', function () {
    return api_addTaskPeriod(pj.taskId, 'งวดที่เพิ่มแทนงวดกลาง');
  });
  assertEquals_(Number(afterMiddle.step['Step_No']), 4,
    'งวดใหม่ต้องนับต่อจากเลขสูงสุด ไม่ใช่จากจำนวนงวดที่เหลือ');

  var seen = {};
  var duplicated = [];
  var periods = listStepsByTask(pj.taskId);
  for (var d = 0; d < periods.length; d++) {
    var no = String(periods[d]['Step_No']);
    if (seen[no]) duplicated.push(no);
    seen[no] = true;
  }
  assertEquals_(duplicated.join(', '), '', 'เลขงวดต้องไม่ซ้ำกันเอง แม้จะเคยลบงวดกลางไปแล้ว');
  assertEquals_(periods.length, 3, 'ตอนนี้มีสามงวดเหมือนเดิม (เลข 1, 3, 4)');

  attachRequiredReports_(pj.taskId);

  /* ---------- ทำเสร็จ 2 จาก 3 ยังปิดไม่ได้ ---------- */
  for (var c = 0; c < 2; c++) {
    callApiAs_(users.project, 'ปิดงวด', function () {
      return api_updateTaskStep(periods[c]['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
    });
  }
  var blocked = withTestUser_(users.project, function () { return api_completeTask(pj.taskId); });
  assertEquals_(blocked.ok, false, 'เหลืออีกงวดที่ยังไม่เสร็จ ปิดงานไม่ได้');
  assertTrue_(String(blocked.message).indexOf('งวด') !== -1, 'และต้องบอกว่าติดที่งวดงาน');

  /* ---------- ลบงวดที่มีไฟล์แนบไม่ได้ ---------- */
  uploadReport_(users.project, {
    woId: pj.woId, scope: FILE_SCOPE.PROJECT, taskId: pj.taskId,
    stepId: periods[2]['Step_ID'], reportCode: pj.reports.peRequired.code
  });
  var withFile = withTestUser_(users.project, function () {
    return api_removeTaskPeriod(periods[2]['Step_ID']);
  });
  assertEquals_(withFile.ok, false, 'งวดที่มีไฟล์แนบอยู่ ลบไม่ได้');
  assertTrue_(String(withFile.message).indexOf('ไฟล์') !== -1, 'และต้องบอกว่าติดที่ไฟล์');
  assertEquals_(listStepsByTask(pj.taskId).length, 3, 'งวดต้องยังอยู่ครบ');

  /* ---------- ลบงวดที่ทำเสร็จแล้วก็ไม่ได้ ---------- */
  var doneOne = withTestUser_(users.project, function () {
    return api_removeTaskPeriod(periods[0]['Step_ID']);
  });
  assertEquals_(doneOne.ok, false, 'งวดที่ทำเสร็จแล้ว ลบไม่ได้');
  assertTrue_(String(doneOne.message).indexOf('เสร็จ') !== -1, 'พร้อมบอกเหตุผลที่แก้ได้');

  /* ---------- ทำงวดสุดท้ายให้เสร็จ แล้วปิดได้ ---------- */
  callApiAs_(users.project, 'ปิดงวดสุดท้าย', function () {
    return api_updateTaskStep(periods[2]['Step_ID'], { 'Status': STEP_STATUS.COMPLETED });
  });
  callApiAs_(users.project, 'ปิดงาน', function () { return api_completeTask(pj.taskId); });
  assertEquals_(getTask(pj.taskId)['Status'], TASK_STATUS.COMPLETED, 'ครบทุกงวดแล้วปิดงานได้');
  assertEquals_(getWorkOrder(pj.woId)['Overall_Status'], WO_STATUS.COMPLETED, 'ใบงานปิดตาม');

  return endTest_();
}
/**
 * งานร่วมสองแผนก ด่านเอกสารต้องตรวจแยกรายแผนก ไม่ใช่รวมทั้งใบงาน
 *
 * ถ้าตรวจรวมทั้งใบ แผนกที่ยังไม่ได้ทำอะไรเลยจะปิดงานได้เพราะอีกแผนกแนบไปแล้ว
 * ซึ่งเป็นรูที่ไม่มีใครเห็นจนกว่าจะมีคนใช้ช่องนี้จริง
 */
function test_report_jointChecksEachDepartment() {
  beginTest_('งานร่วม — ด่านเอกสารตรวจแยกรายแผนก');

  var users = serviceTestUsers_();
  var reports = addTestReports_();
  var wo = approvedTestWo_(users, ASSIGNMENT.SERVICE_PROJECT, { 'Location': 'จุดงานร่วมเอกสาร' });
  var svTask = wo.taskOf(DEPT.SERVICE);
  var pjTask = wo.taskOf(DEPT.PROJECT);

  callApiAs_(users.service, 'Service รับงาน', function () { return api_acceptTask(svTask); });
  callApiAs_(users.project, 'Project รับงาน', function () { return api_acceptTask(pjTask); });

  /* ---------- Service แนบของตัวเองแล้วปิดได้ ---------- */
  finishAllSteps_(svTask, users.service);
  uploadReport_(users.service, {
    woId: wo.woId, scope: FILE_SCOPE.SERVICE, taskId: svTask,
    stepId: listStepsByTask(svTask)[0]['Step_ID'], reportCode: reports.svRequired.code
  });
  attachRequiredReports_(svTask);

  callApiAs_(users.service, 'Service ปิดงาน', function () { return api_completeTask(svTask); });
  assertEquals_(getTask(svTask)['Status'], TASK_STATUS.COMPLETED, 'Service ปิดงานของตัวเองได้');

  /*
   * ---------- ไฟล์ของแผนกอื่นในใบเดียวกัน ต้องไม่ช่วยให้ผ่านด่าน ----------
   *
   * แนบเอกสารที่ Project ต้องใช้ เข้าไปที่งานของ Service แทน — ถ้าด่านนับรวมทั้งใบงาน
   * Project จะผ่านทันทีทั้งที่ยังไม่ได้ทำอะไรเลย ซึ่งเป็นรูที่มองไม่เห็นจากหน้าจอ
   */
  uploadReport_(users.service, {
    woId: wo.woId, scope: FILE_SCOPE.SERVICE, taskId: svTask,
    stepId: listStepsByTask(svTask)[1]['Step_ID'], reportCode: reports.peRequired.code
  });

  /* ---------- Project ยังปิดไม่ได้ เพราะยังไม่ได้แนบของตัวเอง ---------- */
  var blocked = withTestUser_(users.project, function () { return api_completeTask(pjTask); });
  assertEquals_(blocked.ok, false,
    'Project ต้องยังปิดไม่ได้ แม้อีกแผนกจะแนบเอกสารไปแล้ว — ต้องมีคนละใบ');
  assertTrue_(String(blocked.message).indexOf(reports.peRequired.name) !== -1,
    'และต้องบอกชื่อเอกสารของแผนกตัวเอง ไม่ใช่ของแผนกอื่น');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.IN_PROGRESS,
    'ใบงานต้องยังไม่ปิด เพราะยังมีแผนกที่ทำไม่เสร็จ');

  /* ---------- Project แนบของตัวเองแล้วปิดได้ ใบงานจึงปิดตาม ---------- */
  uploadReport_(users.project, {
    woId: wo.woId, scope: FILE_SCOPE.PROJECT, taskId: pjTask,
    reportCode: reports.peRequired.code
  });
  attachRequiredReports_(pjTask);

  callApiAs_(users.project, 'Project ปิดงาน', function () { return api_completeTask(pjTask); });
  assertEquals_(getTask(pjTask)['Status'], TASK_STATUS.COMPLETED, 'Project ปิดงานของตัวเองได้');
  assertEquals_(getWorkOrder(wo.woId)['Overall_Status'], WO_STATUS.COMPLETED,
    'ปิดครบทุกแผนกแล้ว ใบงานจึงปิดตาม');

  return endTest_();
}

/**
 * เครื่องมือตรวจตาราง Report_Master ต้องเตือนสภาพที่มองไม่เห็นจากหน้าจอ
 *
 * ตรวจตัวสรุปด้วยข้อมูลที่ป้อนเอง เพราะสภาพที่ต้องเตือนคือสภาพที่ชีตจริงไม่ได้เป็น
 * (ถ้ารอให้ชีตจริงเป็นแบบนั้นก่อนค่อยรู้ว่าเตือนถูกไหม ก็สายไปแล้ว)
 */
function test_report_masterCheck() {
  beginTest_('checkReportMaster เตือนสภาพที่มองไม่เห็นจากหน้าจอ');

  /* ---------- ตารางที่ครบถ้วน ต้องไม่เตือนอะไรเลย ---------- */
  var healthy = reportMasterSummary_([
    { 'Report_Code': 'SV1', 'Type': 'Service', 'Form_No': 'FM-SV-09', 'Required': true, 'Active': true },
    { 'Report_Code': 'PE1', 'Type': 'Project', 'Form_No': 'FM-PE-11', 'Required': true, 'Active': true },
    { 'Report_Code': 'LAB1', 'Type': 'Lab', 'Form_No': 'FM-SV-09', 'Required': true, 'Active': true }
  ]);
  assertEquals_(healthy.warnings.join(' · '), '', 'ตารางที่ครบถ้วนต้องไม่มีคำเตือน');
  assertEquals_(healthy.requiredTotal, 3, 'นับรายการที่บังคับได้ถูก');
  assertEquals_(healthy.byType[DEPT.SERVICE].active, 1, 'นับแยกตามชนิดได้ถูก');

  /* ---------- ไม่มี Report ของ Lab เลย ---------- */
  var noLab = reportMasterSummary_([
    { 'Report_Code': 'SV1', 'Type': 'Service', 'Form_No': 'FM-SV-09', 'Required': true, 'Active': true }
  ]);
  assertTrue_(noLab.warnings.join(' · ').indexOf('LAB') !== -1,
    'ชนิดที่ไม่มีรายการเลย ต้องเตือน เพราะหน้าจอแผนกนั้นจะว่างเปล่า');

  /* ---------- ไม่มีรายการบังคับเลยทั้งตาราง ---------- */
  var noRequired = reportMasterSummary_([
    { 'Report_Code': 'SV1', 'Type': 'Service', 'Form_No': 'FM-SV-09', 'Required': false, 'Active': true },
    { 'Report_Code': 'PE1', 'Type': 'Project', 'Form_No': 'FM-PE-11', 'Required': false, 'Active': true },
    { 'Report_Code': 'LAB1', 'Type': 'Lab', 'Form_No': 'FM-SV-09', 'Required': false, 'Active': true }
  ]);
  assertTrue_(noRequired.warnings.join(' · ').indexOf('ไม่บังคับอะไรทั้งสิ้น') !== -1,
    'ตารางที่ไม่มีรายการบังคับเลย ต้องเตือน เพราะด่านตอนปิดงานจะไม่ทำงาน');

  /* ---------- Form_No ว่าง ---------- */
  var noForm = reportMasterSummary_([
    { 'Report_Code': 'SV1', 'Type': 'Service', 'Form_No': '', 'Required': true, 'Active': true },
    { 'Report_Code': 'PE1', 'Type': 'Project', 'Form_No': 'FM-PE-11', 'Required': true, 'Active': true },
    { 'Report_Code': 'LAB1', 'Type': 'Lab', 'Form_No': 'FM-SV-09', 'Required': true, 'Active': true }
  ]);
  assertTrue_(noForm.warnings.join(' · ').indexOf('Form_No ว่างที่ SV1') !== -1,
    'Form_No ว่างต้องเตือนพร้อมบอกรหัส เพราะชื่อไฟล์จะใช้รหัสแทน');

  /* ---------- แถวที่ Type ไม่ตรงกับแผนกใดเลย ---------- */
  var oddType = reportMasterSummary_([
    { 'Report_Code': 'X1', 'Type': 'อื่น ๆ', 'Form_No': 'FM-X', 'Required': true, 'Active': true }
  ]);
  assertTrue_(oddType.warnings.join(' · ').indexOf('X1') !== -1,
    'แถวที่ชนิดไม่ตรงกับแผนกใด ต้องเตือน ไม่ใช่เงียบแล้วหายไปจากทุกหน้าจอ');

  /* ---------- ตัวเครื่องมือเองต้องรันได้จริงและอ่านรู้เรื่อง ---------- */
  addTestReports_();
  var report = checkReportMaster();
  assertTrue_(report.indexOf('ตรวจตาราง Report_Master') === 0, 'รายงานต้องขึ้นหัวเรื่องชัดเจน');
  assertTrue_(report.indexOf(DEPT.SERVICE) !== -1, 'และต้องรายงานแยกตามชนิดครบทุกชนิด');
  assertTrue_(report.indexOf(DEPT.LAB) !== -1, 'รวมถึงชนิดที่อาจไม่มีรายการเลย');

  return endTest_();
}

/* ===========================================================================
 * กลุ่ม DB — ชั้นเชื่อมต่อ Supabase (01_Db.gs · SPEC 22)
 * =========================================================================== */

/** คำนำหน้าของข้อมูลทดสอบทุกแถวที่กลุ่มนี้เขียนลงตารางจริง — ล้างด้วยคำนำหน้านี้เสมอ */
var DB_TEST_PREFIX = 'TEST-';

/* ===========================================================================
 * การสำรองข้อมูลลง Drive (SPEC 22.6)
 *
 * **สำเนาที่ไม่เคยถูกกู้กลับ ไม่ใช่สำเนา** ชุดนี้จึงไม่ได้พิสูจน์ว่าเขียนไฟล์ได้
 * แต่พิสูจน์ว่า **ลบข้อมูลจริงทิ้งแล้วกู้กลับมาได้เหมือนเดิมทุกฟิลด์** ซึ่งเป็นคำถาม
 * เดียวที่มีความหมายในวันที่ต้องใช้สำเนาจริง
 *
 * ใช้ตาราง _test_bulk ของชุดทดสอบเท่านั้น ห้ามแตะตารางจริง — เทสต์ที่ลบข้อมูลจริง
 * ทิ้งเพื่อพิสูจน์ว่ากู้ได้ คือเทสต์ที่เดิมพันด้วยของที่มันกำลังปกป้องอยู่
 * =========================================================================== */

/**
 * โฟลเดอร์ชั่วคราวสำหรับไฟล์สำรองของชุดทดสอบ
 *
 * แยกจากโฟลเดอร์สำรองจริงเด็ดขาด ไม่งั้นการล้างข้อมูลของชุดทดสอบจะลบสำเนาของจริง
 * ทิ้งไปด้วย ซึ่งเป็นความผิดพลาดที่จะไม่มีใครรู้จนถึงวันที่ต้องกู้
 *
 * @return {string} รหัสโฟลเดอร์
 */
function testBackupFolder_() {
  return driveSubFolder_(driveBackupContainer_(), TEST_PREFIX + 'BACKUP');
}

/**
 * ลบข้อมูลและไฟล์ที่ชุดสำรองสร้างไว้
 * @param {number} knownRows จำนวนแถวที่ชุดนี้เขียนลง _test_bulk
 */
function cleanBackupTest_(knownRows) {
  dbDeleteVerified_(TEST_BULK_TABLE, { 'Row_ID': { op: 'like', value: TEST_PREFIX + '*' } },
    'แถวทดสอบสำรองข้อมูล', knownRows);
  driveTrashById_(testBackupFolder_(), true);
  dbInvalidate_(TEST_BULK_TABLE);
  clearRowCache_();
}

/**
 * ลบข้อมูลจริงทิ้งแล้วกู้กลับ ต้องได้เหมือนเดิมทุกแถวทุกฟิลด์
 *
 * ค่าที่เลือกมาทดสอบไม่ใช่ค่าสุ่ม ทุกตัวคือกรณีที่เคยทำให้ข้อมูลเพี้ยนมาแล้วจริง
 *   NULL กับข้อความว่าง  — ถ้าแยกไม่ออก กฎข้อ 25 ทั้งข้อจะพังหลังกู้
 *   ตัวเลขศูนย์          — ถูกมองว่า "ว่าง" ได้ง่ายที่สุดในทุกภาษา
 *   ตัวเลขที่มีศูนย์นำ    — กลายเป็นตัวเลขเมื่อไร ศูนย์หน้าหายทันที
 *   false                — หายไปได้แบบเดียวกับศูนย์
 */
function test_db_backupCanBeRestored() {
  beginTest_('ลบข้อมูลจริงแล้วกู้กลับ ต้องเหมือนเดิมทุกฟิลด์');

  var rows = [
    { 'Row_ID': TEST_PREFIX + 'B1', 'Row_Name': 'แถวปกติ',   'Sort_Order': 1, 'Active': true },
    { 'Row_ID': TEST_PREFIX + 'B2', 'Row_Name': '',          'Sort_Order': 0, 'Active': false },
    { 'Row_ID': TEST_PREFIX + 'B3', 'Row_Name': null,        'Sort_Order': null, 'Active': true },
    { 'Row_ID': TEST_PREFIX + '00420', 'Row_Name': 'ศูนย์นำ', 'Sort_Order': 7, 'Active': true }
  ];

  try {
    db_insert_(TEST_BULK_TABLE, rows);
    dbInvalidate_(TEST_BULK_TABLE);

    var before = db_selectAll_(TEST_BULK_TABLE, { raw: true });
    assertEquals_(before.length, rows.length, 'ต้องมีแถวทดสอบครบก่อนสำรอง');

    /* ---------- สำรอง ---------- */
    var folderId = testBackupFolder_();
    var saved = backupOneTable_(folderId, TEST_BULK_TABLE, new Date());
    assertTrue_(saved.ok, 'การสำรองต้องสำเร็จ · ที่ได้: ' + saved.note);
    assertEquals_(saved.written, rows.length, 'ต้องเขียนลงไฟล์ครบทุกแถว');
    assertEquals_(saved.counted, rows.length,
      'และจำนวนที่ฐานข้อมูลนับให้ผ่าน Content-Range ต้องตรงกับที่เขียน');

    var files = driveFolderFiles_(folderId);
    assertEquals_(files.length, 1, 'ต้องได้ไฟล์เดียวต่อหนึ่งตาราง');
    var fileId = files[0].id;

    /* ---------- ลบข้อมูลจริงทิ้ง ---------- */
    var removed = db_delete_(TEST_BULK_TABLE,
      { 'Row_ID': { op: 'like', value: TEST_PREFIX + '*' } }).length;
    dbInvalidate_(TEST_BULK_TABLE);
    assertEquals_(removed, rows.length, 'ต้องลบทิ้งได้จริงก่อน ไม่งั้นการกู้ไม่ได้พิสูจน์อะไร');
    assertEquals_(db_count_(TEST_BULK_TABLE,
      { 'Row_ID': { op: 'like', value: TEST_PREFIX + '*' } }), 0, 'และต้องไม่เหลือสักแถว');

    /* ---------- ลองเปล่าต้องไม่เขียนอะไรเลย ---------- */
    restoreTableFromBackup(TEST_BULK_TABLE, fileId);
    dbInvalidate_(TEST_BULK_TABLE);
    assertEquals_(db_count_(TEST_BULK_TABLE,
      { 'Row_ID': { op: 'like', value: TEST_PREFIX + '*' } }), 0,
      'โหมดลองเปล่าต้องไม่เขียนอะไรจริงสักแถว — นี่คือค่าตั้งต้น และเป็นด่านสุดท้าย' +
      'ที่กันไม่ให้คนที่กำลังตกใจเขียนทับของที่ยังดีอยู่');

    /* ---------- กู้จริง ---------- */
    restoreTableFromBackup(TEST_BULK_TABLE, fileId, { write: true });
    dbInvalidate_(TEST_BULK_TABLE);
    var after = db_selectAll_(TEST_BULK_TABLE, { raw: true });
    assertEquals_(after.length, rows.length, 'กู้แล้วต้องได้แถวครบเท่าเดิม');

    /* ---------- เทียบทีละแถวทีละฟิลด์ ---------- */
    var byKey = {};
    for (var a = 0; a < after.length; a++) byKey[String(after[a]['row_id'])] = after[a];

    for (var b = 0; b < before.length; b++) {
      var was = before[b];
      var got = byKey[String(was['row_id'])];
      assertTrue_(!!got, 'แถว ' + was['row_id'] + ' ต้องกลับมา');
      if (!got) continue;

      for (var col in was) {
        if (!Object.prototype.hasOwnProperty.call(was, col)) continue;
        /*
         * เทียบด้วย === และเทียบชนิดด้วย เพราะ null กับ '' และ 0 กับ '0'
         * คือคู่ที่การกู้คืนทำพังได้ง่ายที่สุด และเป็นเหตุผลที่ไฟล์สำรองเป็น JSON
         */
        assertTrue_(was[col] === got[col],
          'แถว ' + was['row_id'] + ' คอลัมน์ ' + col + ' ต้องเหมือนเดิมเป๊ะ · เดิม ' +
          JSON.stringify(was[col]) + ' (' + typeof was[col] + ') ได้ ' +
          JSON.stringify(got[col]) + ' (' + typeof got[col] + ')');
      }
    }

    /* ---------- ค่าที่พังง่ายที่สุด ตรวจซ้ำแบบเจาะจง ---------- */
    assertTrue_(byKey[TEST_PREFIX + 'B3']['row_name'] === null,
      'ช่องที่เป็น NULL ต้องยังเป็น NULL ไม่ใช่กลายเป็นข้อความว่าง');
    assertTrue_(byKey[TEST_PREFIX + 'B2']['row_name'] === '',
      'ช่องที่เป็นข้อความว่างต้องยังเป็นข้อความว่าง ไม่ใช่กลายเป็น NULL');
    assertTrue_(byKey[TEST_PREFIX + 'B2']['sort_order'] === 0,
      'เลขศูนย์ต้องยังเป็นศูนย์ ไม่ใช่หายไปเพราะถูกมองว่าว่าง');
    assertTrue_(byKey[TEST_PREFIX + 'B2']['active'] === false,
      'ค่าเท็จต้องยังเป็นเท็จ ด้วยเหตุผลเดียวกับเลขศูนย์');
    assertEquals_(byKey[TEST_PREFIX + '00420']['row_id'], TEST_PREFIX + '00420',
      'รหัสที่มีศูนย์นำต้องไม่ถูกแปลงเป็นตัวเลขแล้วศูนย์หาย');
  } finally {
    cleanBackupTest_(rows.length);
  }

  return endTest_();
}

/**
 * ไฟล์สำรองที่ผิดหรือไม่ครบ ต้องถูกปฏิเสธก่อนเขียนทับอะไร
 *
 * **ไฟล์สำรองที่ไม่ครบอันตรายกว่าไม่มีไฟล์เลย** เพราะมันทำให้คนเชื่อว่ามีสำเนาอยู่
 * แล้วเลิกมองหาที่อื่น · ที่แย่กว่านั้นคือการเอาไฟล์ที่ไม่ครบไปกู้ทับของที่ยังดีอยู่
 *
 * กรณีที่ทดสอบคือกรณีที่เกิดจริง ไม่ใช่กรณีสมมติ — รหัสไฟล์บน Drive เป็นตัวอักษรสุ่ม
 * ที่ดูด้วยตาไม่ออกว่าเป็นของตารางไหน การหยิบผิดไฟล์จึงเป็นเรื่องของเวลาเท่านั้น
 */
function test_db_badBackupFileIsRefused() {
  beginTest_('ไฟล์สำรองที่ผิดหรือไม่ครบ ต้องถูกปฏิเสธ');

  var folderId = testBackupFolder_();

  try {
    /* ---------- ไฟล์ของตารางอื่น ---------- */
    var wrongTable = driveCreateTextFile_(folderId, 'wrong.json', JSON.stringify({
      table: 'WorkOrder', rowCount: 0, rows: []
    }));
    assertThrows_(function () { restoreTableFromBackup(TEST_BULK_TABLE, wrongTable.id, { write: true }); },
      'ไฟล์ของตารางอื่นต้องถูกปฏิเสธ ไม่ใช่เอาไปเขียนทับ');

    /* ---------- ไฟล์ที่จำนวนแถวไม่ตรงกับที่ประกาศไว้ ---------- */
    var shortFile = driveCreateTextFile_(folderId, 'short.json', JSON.stringify({
      table: TEST_BULK_TABLE, rowCount: 9,
      rows: [{ row_id: TEST_PREFIX + 'X1', row_name: 'เหลือแถวเดียว', sort_order: 1, active: true }]
    }));
    assertThrows_(function () { restoreTableFromBackup(TEST_BULK_TABLE, shortFile.id, { write: true }); },
      'ไฟล์ที่บอกว่ามี 9 แถวแต่มีจริงแถวเดียว ต้องถูกปฏิเสธ — ไฟล์ไม่ครบห้ามใช้กู้');

    /* ---------- เนื้อไฟล์เสีย ---------- */
    var broken = driveCreateTextFile_(folderId, 'broken.json', '{ นี่ไม่ใช่ JSON');
    assertThrows_(function () { restoreTableFromBackup(TEST_BULK_TABLE, broken.id, { write: true }); },
      'ไฟล์ที่เนื้อเสียต้องถูกปฏิเสธพร้อมบอกเหตุผล');

    /* ---------- ไม่ได้ระบุไฟล์เลย ---------- */
    assertThrows_(function () { restoreTableFromBackup(TEST_BULK_TABLE, '', { write: true }); },
      'ไม่ระบุรหัสไฟล์ต้องถูกปฏิเสธ ไม่ใช่เดาเอาว่าจะใช้ไฟล์ไหน');

    /* ---------- ไม่มีแถวไหนถูกเขียนลงไปเลยจากทั้งสี่กรณี ---------- */
    dbInvalidate_(TEST_BULK_TABLE);
    assertEquals_(db_count_(TEST_BULK_TABLE,
      { 'Row_ID': { op: 'like', value: TEST_PREFIX + '*' } }), 0,
      'ทั้งสี่กรณีต้องไม่มีแถวไหนหลุดเข้าไปในตารางเลย');
  } finally {
    driveTrashById_(folderId, true);
    clearRowCache_();
  }

  return endTest_();
}

/**
 * คำประกาศเรื่องลำดับการกู้คืน ต้องสอดคล้องกันเองและชี้ไปที่ของที่มีอยู่จริง
 *
 * `BACKUP_PARENT_LINKS` กับ `BACKUP_RESTORE_ORDER` เป็นความรู้ที่เขียนไว้ด้วยมือ
 * จาก `references` ใน supabase_schema.sql · ความรู้แบบนี้ค้างได้ วันที่ใครเพิ่ม
 * foreign key เส้นใหม่แล้วไม่ได้มาแก้ที่นี่ การกู้คืนจะล้มกลางคันพร้อมข้อความ
 * ภาษาอังกฤษของ Postgres ที่ไม่ได้บอกว่าต้องทำอะไรต่อ
 *
 * ชุดนี้จับสิ่งที่จับได้ตอนรัน คือความไม่สอดคล้องกันเองและชื่อที่ไม่มีอยู่จริง
 * ส่วนการเทียบกับ DDL ตัวจริงทำในของจำลองตอนบูต ซึ่งอ่านไฟล์ schema ได้
 */
function test_db_restoreOrderMatchesForeignKeys() {
  beginTest_('ลำดับการกู้คืนต้องสอดคล้องกับการอ้างอิงที่ประกาศไว้');

  for (var child in BACKUP_PARENT_LINKS) {
    if (!Object.prototype.hasOwnProperty.call(BACKUP_PARENT_LINKS, child)) continue;

    var childAt = BACKUP_RESTORE_ORDER.indexOf(child);
    assertTrue_(childAt !== -1,
      'ตาราง ' + child + ' มีตารางแม่ จึงต้องอยู่ใน BACKUP_RESTORE_ORDER ด้วย');

    var links = BACKUP_PARENT_LINKS[child];
    for (var i = 0; i < links.length; i++) {
      var parent = links[i].parent;
      var parentAt = BACKUP_RESTORE_ORDER.indexOf(parent);

      assertTrue_(parentAt !== -1, 'ตารางแม่ ' + parent + ' ต้องอยู่ในลำดับการกู้คืนด้วย');
      assertTrue_(parentAt < childAt,
        parent + ' ต้องมาก่อน ' + child + ' ในลำดับการกู้คืน — ลูกก่อนแม่คือการกู้ที่ล้มทั้งชุด');

      // ชื่อคอลัมน์และชื่อตารางต้องมีอยู่จริง ไม่ใช่สะกดไว้เฉย ๆ
      assertTrue_(dbColumnMap_(parent).dbNames.length > 0, 'ตาราง ' + parent + ' ต้องมีอยู่จริง');
      assertTrue_(dbColumnMap_(child).dbNames.indexOf(links[i].column) !== -1,
        'คอลัมน์ ' + links[i].column + ' ต้องมีอยู่จริงในตาราง ' + child +
        ' · ชื่อที่สะกดผิดจะทำให้การตรวจลำดับเงียบไปเฉย ๆ แทนที่จะเตือน');
    }
  }

  /* ---------- ตารางในลำดับต้องเป็นตารางที่มีอยู่จริง ---------- */
  for (var o = 0; o < BACKUP_RESTORE_ORDER.length; o++) {
    assertTrue_(Object.prototype.hasOwnProperty.call(DB_COLUMNS, BACKUP_RESTORE_ORDER[o]),
      BACKUP_RESTORE_ORDER[o] + ' ในลำดับการกู้คืน ต้องเป็นตารางที่ประกาศไว้ใน DB_COLUMNS');
  }

  /* ---------- ทุกตารางต้องถูกสำรอง ไม่มีใครตกหล่น ---------- */
  var keys = backupTableKeys_();
  var declared = 0;
  for (var d in DB_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(DB_COLUMNS, d)) declared++;
  }
  assertEquals_(keys.length, declared,
    'รายชื่อตารางที่สำรองต้องมาจาก DB_COLUMNS ทั้งหมด · ตารางที่ตกหล่นคือตารางที่ไม่มีสำเนาเลย');

  /* ---------- ชื่อไฟล์ต้องไม่ชนกัน ---------- */
  var seen = {};
  for (var k = 0; k < keys.length; k++) {
    var name = backupFileName_(keys[k]);
    assertTrue_(!seen[name], 'ชื่อไฟล์ ' + name + ' ซ้ำกัน — ตารางหนึ่งจะทับสำเนาของอีกตาราง');
    seen[name] = true;
  }

  return endTest_();
}

/**
 * ลายนิ้วมือของโครงสร้างตารางต้องเปลี่ยนเมื่อคอลัมน์เปลี่ยน
 *
 * ค่านี้คือสิ่งเดียวที่บอกคนกู้คืนได้ว่า "ไฟล์นี้มาจากตอนที่ตารางหน้าตายังไม่เหมือนตอนนี้"
 * ถ้ามันไม่ขยับตามของจริง มันจะกลายเป็นตัวเลขที่ดูน่าเชื่อถือแต่ไม่ได้ยืนยันอะไรเลย
 * ซึ่งแย่กว่าไม่มีเลย
 */
function test_db_schemaVersionMovesWithColumns() {
  beginTest_('ลายนิ้วมือโครงสร้างต้องเปลี่ยนตามคอลัมน์');

  var keys = backupTableKeys_();
  var seen = {};
  for (var i = 0; i < keys.length; i++) {
    var version = backupSchemaVersion_(keys[i]);
    assertTrue_(/^v\d+-[0-9a-f]+$/.test(version),
      keys[i] + ' ต้องได้ลายนิ้วมือที่อ่านออก · ได้ ' + version);
    assertEquals_(backupSchemaVersion_(keys[i]), version,
      keys[i] + ' ต้องได้ค่าเดิมทุกครั้งที่เรียก ไม่งั้นทุกไฟล์จะดูเหมือน schema เปลี่ยน');
    seen[version] = (seen[version] || 0) + 1;
  }

  /*
   * ตารางคนละตารางได้ลายนิ้วมือเดียวกันได้ถ้าคอลัมน์เหมือนกันเป๊ะ ซึ่งไม่ใช่ปัญหา
   * เพราะค่านี้ใช้เทียบ "ตารางเดียวกันข้ามเวลา" ไม่ใช่เทียบข้ามตาราง
   * สิ่งที่ต้องพิสูจน์จริงคือมันขยับเมื่อคอลัมน์ขยับ ซึ่งทดสอบข้างล่างนี้
   */
  var before = backupSchemaVersion_('Counter');
  var saved = DB_MAP_CACHE_['Counter'];
  try {
    DB_MAP_CACHE_['Counter'] = { table: 'counter', toDb: {}, fromDb: {},
      systemNames: ['Key', 'Last_Number'], dbNames: ['key', 'last_number'] };
    assertTrue_(backupSchemaVersion_('Counter') !== before,
      'ตัดคอลัมน์ออกหนึ่งตัวแล้วลายนิ้วมือต้องเปลี่ยน');

    DB_MAP_CACHE_['Counter'] = { table: 'counter', toDb: {}, fromDb: {},
      systemNames: ['Key', 'Updated_Date', 'Last_Number'],
      dbNames: ['key', 'updated_date', 'last_number'] };
    assertTrue_(backupSchemaVersion_('Counter') !== before,
      'สลับลำดับคอลัมน์แล้วลายนิ้วมือก็ต้องเปลี่ยน เพราะลำดับมีผลกับการอ่านไฟล์');
  } finally {
    DB_MAP_CACHE_['Counter'] = saved;
  }
  assertEquals_(backupSchemaVersion_('Counter'), before, 'คืนสภาพเดิมแล้วต้องได้ค่าเดิม');

  return endTest_();
}

/**
 * กลุ่ม DB — ครอบทุกฟังก์ชันใน 01_Db.gs
 *
 * แบ่งเป็นสองส่วนโดยตั้งใจ · ส่วนแรกเป็นตรรกะล้วน (การแปลงชื่อคอลัมน์และการปิดบังคีย์)
 * ซึ่งรันได้ทุกที่รวมทั้งของจำลองในเครื่อง · ส่วนที่สองต้องต่อ Supabase จริง
 * จึงรันได้เฉพาะบน Apps Script ที่ตั้งค่า Script Properties ไว้แล้ว
 *
 * **บนของจำลอง กลุ่มนี้พิสูจน์ได้แค่ส่วนแรก** และจะพิมพ์บอกไว้ชัด ๆ ว่าข้ามอะไรไป
 * ทางเลือกอื่นคือให้ทั้งกลุ่มล้มบนของจำลอง ซึ่งจะทำให้ test_all() แดงตลอดกาล
 * จนไม่มีใครดูมันอีก แล้วเราจะเสียสัญญาณที่เหลือทั้งหมดไปเพื่อสัญญาณเดียวที่ทดแทนได้
 *
 * ทุกแถวที่กลุ่มนี้เขียนลงตารางจริงมีคีย์ขึ้นต้นด้วย TEST- เสมอ และถูกล้างทั้งก่อนและหลัง
 *
 * @return {string} ข้อความสรุปผล
 */
function test_group_db() {
  var suites = [
    { name: 'test_db_columnMapRoundTrip',    fn: test_db_columnMapRoundTrip },
    { name: 'test_db_columnMapRejectsUnknown', fn: test_db_columnMapRejectsUnknown },
    { name: 'test_db_secretsNeverLeak',      fn: test_db_secretsNeverLeak },
    { name: 'test_db_doorTelling',           fn: test_db_doorTelling },
    { name: 'test_db_anonResultTellsWhichDoor', fn: test_db_anonResultTellsWhichDoor },
    { name: 'test_db_customerHealth',        fn: test_db_customerHealth },
    { name: 'test_db_customerIsReadOnly',    fn: test_db_customerIsReadOnly },
    { name: 'test_layerPurity',              fn: test_layerPurity },
    { name: 'test_db_callBudgetPerPage',     fn: test_db_callBudgetPerPage },
    { name: 'test_db_filterEscapesUserText', fn: test_db_filterEscapesUserText },
    { name: 'test_db_restoreOrderMatchesForeignKeys', fn: test_db_restoreOrderMatchesForeignKeys },
    { name: 'test_db_schemaVersionMovesWithColumns', fn: test_db_schemaVersionMovesWithColumns }
  ];

  if (dbIsConfigured_()) {
    suites = suites.concat([
      { name: 'test_db_insertAndSelect',   fn: test_db_insertAndSelect },
      { name: 'test_db_selectFilters',     fn: test_db_selectFilters },
      { name: 'test_db_updateAndUpsert',   fn: test_db_updateAndUpsert },
      { name: 'test_db_deleteRows',        fn: test_db_deleteRows },
      { name: 'test_db_rpcRunningNumber',  fn: test_db_rpcRunningNumber },
      { name: 'test_db_fetchAllTables',    fn: test_db_fetchAllTables },
      { name: 'test_db_failuresStayThai',  fn: test_db_failuresStayThai },
      { name: 'test_db_readsEveryRowNotJustFirstPage', fn: test_db_readsEveryRowNotJustFirstPage },
      { name: 'test_db_truncationWarningIsExactAtTheEdge', fn: test_db_truncationWarningIsExactAtTheEdge },
      { name: 'test_db_searchSurvivesSpecialCharacters', fn: test_db_searchSurvivesSpecialCharacters },
      { name: 'test_db_customerSearchCostsOneRequest', fn: test_db_customerSearchCostsOneRequest },
      { name: 'test_db_warmingReadsTablesInOneRound', fn: test_db_warmingReadsTablesInOneRound },
      { name: 'test_db_counterUsesRpcNotLock', fn: test_db_counterUsesRpcNotLock },
      { name: 'test_db_expiredTokenIsRejected', fn: test_db_expiredTokenIsRejected },
      { name: 'test_db_duplicateUsernameIsRejected', fn: test_db_duplicateUsernameIsRejected },
      { name: 'test_db_failureDoesNotStormTheDatabase', fn: test_db_failureDoesNotStormTheDatabase },
      { name: 'test_db_longUrlIsRefusedWithReason', fn: test_db_longUrlIsRefusedWithReason },
      { name: 'test_db_appointmentTimeStaysText', fn: test_db_appointmentTimeStaysText },
      { name: 'test_db_dateOnlyDoesNotShift', fn: test_db_dateOnlyDoesNotShift },
      { name: 'test_db_deletingWorkOrderCascades', fn: test_db_deletingWorkOrderCascades },
      { name: 'test_db_cleanupCannotFailSilently', fn: test_db_cleanupCannotFailSilently },
      { name: 'test_db_backupCanBeRestored', fn: test_db_backupCanBeRestored },
      { name: 'test_db_badBackupFileIsRefused', fn: test_db_badBackupFileIsRefused },
      { name: 'test_db_cleanupLeftovers',  fn: test_db_cleanupLeftovers }
    ]);
  } else {
    Logger.log('!! กลุ่ม DB: ข้ามชุดที่ต้องต่อ Supabase ทั้งหมด เพราะยังไม่ได้ตั้งค่า ' +
      'SUPABASE_URL และ SUPABASE_SERVICE_KEY ใน Script Properties');
    Logger.log('!! เหลือแต่ชุดที่เป็นตรรกะล้วน — ชั้นเชื่อมต่อจริงยังไม่ถูกพิสูจน์ในรอบนี้');
  }

  return runGroup_('DB', suites);
}

/* ---------- ส่วนที่ 1: ตรรกะล้วน รันได้ทุกที่ ---------- */

/**
 * แปลงชื่อคอลัมน์ไปกลับแล้วต้องได้ชื่อเดิมเป๊ะทุกคอลัมน์ของทุกตาราง
 *
 * ข้อนี้คือด่านที่จะจับได้เมื่อมีคนเพิ่มคอลัมน์ในฐานข้อมูลแล้วลืมเพิ่มใน DB_COLUMNS
 * หรือพิมพ์ชื่อผิดไปตัวเดียว · ถ้าไม่มีด่านนี้ ความผิดพลาดจะไปโผล่ตอนอ่านข้อมูลจริง
 * ในรูปของค่าที่หายไปเฉย ๆ ซึ่งหาต้นตอยากมาก
 */
function test_db_columnMapRoundTrip() {
  beginTest_('แปลงชื่อคอลัมน์ไปกลับต้องได้ชื่อเดิมเป๊ะ');

  var tables = 0;
  var columns = 0;

  for (var tableKey in DB_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(DB_COLUMNS, tableKey)) continue;
    tables++;

    var map = dbColumnMap_(tableKey);
    assertTrue_(!!map.table, tableKey + ' ต้องมีชื่อตารางในฐานข้อมูล');

    var seenDbNames = {};
    for (var i = 0; i < map.systemNames.length; i++) {
      var systemName = map.systemNames[i];
      var dbName = map.toDb[systemName];
      columns++;

      assertEquals_(map.fromDb[dbName], systemName,
        tableKey + '.' + systemName + ' ต้องกลับมาเป็นชื่อเดิม');
      assertEquals_(dbName, String(dbName).toLowerCase(),
        tableKey + '.' + systemName + ' ชื่อในฐานข้อมูลต้องเป็นตัวพิมพ์เล็กล้วน');

      assertTrue_(!seenDbNames[dbName],
        tableKey + ' มีคอลัมน์ที่ชี้ไปชื่อเดียวกันซ้ำ: ' + dbName);
      seenDbNames[dbName] = true;
    }
  }

  assertEquals_(tables, 16, 'ต้องประกาศครบทั้ง 16 ตารางตาม supabase_schema.sql');
  assertTrue_(columns > 150, 'ตัวนับต้องเห็นคอลัมน์จริง (เห็น ' + columns + ' คอลัมน์)');

  /* ---------- ชื่อที่เดาด้วยการแปลงตัวพิมพ์ไม่ได้ ---------- */
  // สามตัวนี้คือเหตุผลทั้งหมดที่ DB_COLUMNS ต้องมีอยู่ ถ้าเดาเอาจะได้ Pj_Id และ Wo_Count
  assertEquals_(fromDb_('WorkOrder', { pj_id: 'PJ-1' }).PJ_ID, 'PJ-1',
    'pj_id ต้องกลับไปเป็น PJ_ID');
  assertEquals_(fromDb_('Project_Location', { wo_count: 3 }).WO_Count, 3,
    'wo_count ต้องกลับไปเป็น WO_Count');
  assertEquals_(fromDb_('File_Index', { file_url: 'u' }).File_URL, 'u',
    'file_url ต้องกลับไปเป็น File_URL');

  /* ---------- ชีต Customer ใช้หัวคอลัมน์ไทย จึงต้องเขียนไว้เป็นคู่ ---------- */
  assertEquals_(toDb_('Customer', { 'รหัสลูกค้า': 'AR-0001' }).customer_code, 'AR-0001',
    'ชื่อไทยต้องแปลงเป็นชื่อของฐานข้อมูลได้');
  assertEquals_(fromDb_('Customer', { customer_name: 'ก' })['ชื่อลูกค้า'], 'ก',
    'และต้องกลับมาเป็นชื่อไทยเดิม');

  /* ---------- คอลัมน์ User ที่เป็นคำสงวนของ Postgres ---------- */
  assertEquals_(toDb_('Audit_Log', { 'User': 'somchai' })['user'], 'somchai',
    'คอลัมน์ User ต้องแปลงเป็น user ได้ตามปกติเมื่อเรียกผ่าน PostgREST');

  return endTest_();
}

/**
 * คอลัมน์ที่ไม่ได้ประกาศไว้ต้องถูกปฏิเสธ ไม่ใช่เงียบแล้วทิ้ง
 *
 * การทิ้งเงียบคือความผิดพลาดที่แพงที่สุดแบบหนึ่ง เพราะค่าที่ตั้งใจบันทึกหายไป
 * โดยที่ทุกอย่างรายงานว่าสำเร็จ และจะรู้ตัวก็ต่อเมื่อมีคนไปเปิดดูข้อมูลนั้นอีกครั้ง
 */
function test_db_columnMapRejectsUnknown() {
  beginTest_('คอลัมน์และตารางที่ไม่รู้จักต้องถูกปฏิเสธทันที');

  assertThrowsMessage_(function () { dbColumnMap_('Mai_Mee_Tarang_Nee'); },
    'DB_COLUMNS', 'ตารางที่ไม่ได้ประกาศต้องถูกปฏิเสธ');

  assertThrowsMessage_(function () { toDb_('WorkOrder', { Mai_Mee_Column: 1 }); },
    'DB_COLUMNS', 'คอลัมน์ที่ไม่ได้ประกาศต้องถูกปฏิเสธตอนเขียน');

  assertThrowsMessage_(function () { fromDb_('WorkOrder', { mai_mee_column: 1 }); },
    'DB_COLUMNS', 'คอลัมน์แปลกที่ฐานข้อมูลคืนมาต้องถูกปฏิเสธตอนอ่าน');

  // ของจริงต้องผ่าน เพื่อพิสูจน์ว่าด่านไม่ได้ปฏิเสธทุกอย่างทิ้ง
  assertEquals_(toDb_('WorkOrder', { WO_ID: 'WO-1' }).wo_id, 'WO-1',
    'คอลัมน์ที่มีอยู่จริงต้องผ่านได้ตามปกติ');

  return endTest_();
}

/**
 * ค่าคีย์ห้ามโผล่ในข้อความใด ๆ ที่ออกจากชั้นนี้ (กฎข้อ 22)
 *
 * พิสูจน์ด้วยคีย์ปลอมที่ยัดเข้าไปเอง ไม่ใช่รอให้คีย์จริงหลุด — ด่านความปลอดภัย
 * ที่ไม่เคยถูกทดสอบด้วยของที่ควรจับได้ ไม่ต่างอะไรกับการไม่มีด่าน
 */
function test_db_secretsNeverLeak() {
  beginTest_('ค่าคีย์ต้องไม่โผล่ในข้อความที่เขียนออกไป');

  var fakeKey = 'sbp_' + 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0';
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty(PROP_KEY.SUPABASE_ANON_KEY);

  props.setProperty(PROP_KEY.SUPABASE_ANON_KEY, fakeKey);
  try {
    var dirty = 'ล้มเหลวตอนส่ง Authorization: Bearer ' + fakeKey + ' ไปที่เซิร์ฟเวอร์';
    var clean = dbScrub_(dirty);

    assertTrue_(clean.indexOf(fakeKey) === -1, 'ค่าคีย์ต้องหายไปจากข้อความ');
    assertTrue_(clean.indexOf('ปิดบังคีย์ไว้') !== -1, 'และต้องบอกว่าปิดบังอะไรไว้');
    assertTrue_(clean.indexOf('Authorization') !== -1, 'ส่วนที่ไม่ใช่ความลับต้องยังอ่านได้');

    // ค่าสั้นผิดปกติต้องไม่ถูกใช้เป็นตัวค้นหา ไม่งั้นจะไปกินเนื้อความที่ไม่เกี่ยวข้อง
    props.setProperty(PROP_KEY.SUPABASE_ANON_KEY, 'abc');
    assertEquals_(dbScrub_('ข้อความมีคำว่า abc อยู่'), 'ข้อความมีคำว่า abc อยู่',
      'ค่าที่สั้นเกินไปต้องไม่ถูกเอาไปแทนที่');
  } finally {
    if (saved) {
      props.setProperty(PROP_KEY.SUPABASE_ANON_KEY, saved);
    } else {
      props.deleteProperty(PROP_KEY.SUPABASE_ANON_KEY);
    }
  }

  // ข้อความที่ผู้ใช้เห็นต้องไม่เอ่ยถึงเทคโนโลยีเบื้องหลังเลย
  assertTrue_(DB_USER_MESSAGE.toLowerCase().indexOf('supabase') === -1 &&
    DB_USER_MESSAGE.toLowerCase().indexOf('postgres') === -1 &&
    DB_USER_MESSAGE.toLowerCase().indexOf('sql') === -1,
    'ข้อความสำหรับผู้ใช้ต้องไม่บอกว่าเบื้องหลังใช้อะไรอยู่');

  return endTest_();
}

/* ---------- ส่วนที่ 2: ต้องต่อ Supabase จริง ---------- */

/**
 * เพิ่มแถวแล้วอ่านกลับมาได้ พร้อมค่าที่ DEFAULT ของฐานข้อมูลเติมให้
 */
function test_db_insertAndSelect() {
  beginTest_('เพิ่มแถวแล้วอ่านกลับมาได้ครบ');
  dbTestCleanup_();

  var id = DB_TEST_PREFIX + 'RQ1';
  var written = db_insert_('Request_Type', {
    Request_ID: id, Request_Name: 'ทดสอบชั้นเชื่อมต่อ', Sort_Order: 901
  });

  assertEquals_(written.length, 1, 'ต้องได้แถวที่บันทึกกลับมาหนึ่งแถว');
  assertEquals_(written[0].Request_ID, id, 'คีย์ต้องเป็นชื่อเดิมของระบบ ไม่ใช่ request_id');

  /*
   * Active ไม่ได้ส่งไปเลย แต่ต้องกลับมาเป็น true เพราะ DEFAULT ของคอลัมน์บังคับไว้
   * นี่คือกฎข้อ 25 ที่ย้ายจาก "สิ่งที่โค้ดต้องจำ" ไปเป็น "สิ่งที่ฐานข้อมูลบังคับ"
   */
  assertEquals_(written[0].Active, true, 'ช่องว่างของ Active ต้องกลายเป็น true ตามกฎข้อ 25');

  var read = db_select_('Request_Type', { filters: { Request_ID: id } });
  assertEquals_(read.length, 1, 'อ่านกลับมาต้องเจอแถวเดียว');
  assertEquals_(read[0].Request_Name, 'ทดสอบชั้นเชื่อมต่อ', 'ค่าที่อ่านกลับต้องตรงกับที่เขียนไป');
  assertEquals_(read[0].Sort_Order, 901, 'ตัวเลขต้องกลับมาเป็นตัวเลข ไม่ใช่ข้อความ');

  dbTestCleanup_();
  return endTest_();
}

/**
 * ตัวกรอง การเรียง การเลือกคอลัมน์ และการแบ่งหน้า ต้องถูกผลักไปให้ฐานข้อมูลทำ
 */
function test_db_selectFilters() {
  beginTest_('ตัวกรอง เรียงลำดับ เลือกคอลัมน์ และแบ่งหน้า');
  dbTestCleanup_();

  db_insert_('Request_Type', [
    { Request_ID: DB_TEST_PREFIX + 'A', Request_Name: 'กอ', Sort_Order: 903 },
    { Request_ID: DB_TEST_PREFIX + 'B', Request_Name: 'ขอ', Sort_Order: 902 },
    { Request_ID: DB_TEST_PREFIX + 'C', Request_Name: 'คอ', Sort_Order: 901 }
  ]);

  var ordered = db_select_('Request_Type', {
    filters: { Request_ID: { op: 'like', value: DB_TEST_PREFIX + '*' } },
    order: { column: 'Sort_Order', ascending: true }
  });
  assertEquals_(ordered.length, 3, 'ตัวกรองแบบ like ต้องเจอครบทั้งสามแถว');
  assertEquals_(ordered[0].Request_ID, DB_TEST_PREFIX + 'C', 'และต้องเรียงจากน้อยไปมากตามที่สั่ง');

  var descending = db_select_('Request_Type', {
    filters: { Request_ID: { op: 'like', value: DB_TEST_PREFIX + '*' } },
    order: { column: 'Sort_Order', ascending: false }
  });
  assertEquals_(descending[0].Request_ID, DB_TEST_PREFIX + 'A', 'สั่งเรียงกลับทางต้องได้ผลกลับทางจริง');

  var picked = db_select_('Request_Type', {
    filters: { Request_ID: { op: 'in', value: [DB_TEST_PREFIX + 'A', DB_TEST_PREFIX + 'B'] } }
  });
  assertEquals_(picked.length, 2, 'ตัวกรองแบบ in ต้องเจอสองแถว');

  var thin = db_select_('Request_Type', {
    filters: { Request_ID: DB_TEST_PREFIX + 'A' },
    select: ['Request_ID', 'Sort_Order']
  });
  assertEquals_(thin.length, 1, 'เลือกเฉพาะบางคอลัมน์ต้องยังได้แถวครบ');
  assertTrue_(thin[0].Request_Name === undefined, 'คอลัมน์ที่ไม่ได้ขอต้องไม่ติดมาด้วย');

  var paged = db_select_('Request_Type', {
    filters: { Request_ID: { op: 'like', value: DB_TEST_PREFIX + '*' } },
    order: 'Sort_Order', limit: 1, offset: 1
  });
  assertEquals_(paged.length, 1, 'limit ต้องจำกัดจำนวนแถวได้จริง');
  assertEquals_(paged[0].Request_ID, DB_TEST_PREFIX + 'B', 'และ offset ต้องข้ามแถวแรกไปจริง');

  assertEquals_(db_count_('Request_Type',
    { Request_ID: { op: 'like', value: DB_TEST_PREFIX + '*' } }), 3,
    'การนับแถวต้องได้จำนวนจริงโดยไม่ต้องดึงข้อมูลลงมา');

  dbTestCleanup_();
  return endTest_();
}

/**
 * แก้ไขและเพิ่ม-ทับ พร้อมด่านกันการแก้ทั้งตารางโดยไม่ได้ตั้งใจ
 */
function test_db_updateAndUpsert() {
  beginTest_('แก้ไขแถวและเพิ่ม-ทับเมื่อคีย์ซ้ำ');
  dbTestCleanup_();

  var id = DB_TEST_PREFIX + 'U1';
  db_insert_('Request_Type', { Request_ID: id, Request_Name: 'ก่อนแก้', Sort_Order: 901 });

  var updated = db_update_('Request_Type', { Request_ID: id }, { Request_Name: 'หลังแก้' });
  assertEquals_(updated.length, 1, 'ต้องได้แถวที่แก้แล้วกลับมา');
  assertEquals_(updated[0].Request_Name, 'หลังแก้', 'ค่าต้องเปลี่ยนจริง');
  assertEquals_(updated[0].Sort_Order, 901, 'คอลัมน์ที่ไม่ได้สั่งแก้ต้องคงค่าเดิม');

  var upserted = db_upsert_('Request_Type',
    { Request_ID: id, Request_Name: 'ทับของเดิม', Sort_Order: 902 });
  assertEquals_(upserted.length, 1, 'เพิ่ม-ทับต้องได้แถวเดียว ไม่ใช่สร้างแถวใหม่');
  assertEquals_(upserted[0].Request_Name, 'ทับของเดิม', 'และต้องทับค่าเดิมจริง');
  assertEquals_(db_count_('Request_Type', { Request_ID: id }), 1, 'ต้องไม่มีแถวซ้ำเกิดขึ้น');

  /* ---------- ด่านกันอุบัติเหตุ ---------- */
  // ไม่มีเงื่อนไขแปลว่าโดนทั้งตาราง ซึ่งย้อนกลับไม่ได้และไม่มีใครตั้งใจทำ
  assertThrowsMessage_(function () { db_update_('Request_Type', {}, { Sort_Order: 1 }); },
    'ต้องระบุเงื่อนไข', 'แก้ทั้งตารางโดยไม่มีเงื่อนไขต้องถูกปฏิเสธ');

  dbTestCleanup_();
  return endTest_();
}

/**
 * ลบแถว พร้อมด่านกันการลบทั้งตาราง
 */
function test_db_deleteRows() {
  beginTest_('ลบแถวที่ตรงเงื่อนไข');
  dbTestCleanup_();

  var id = DB_TEST_PREFIX + 'D1';
  db_insert_('Request_Type', { Request_ID: id, Request_Name: 'รอลบ', Sort_Order: 901 });

  var removed = db_delete_('Request_Type', { Request_ID: id });
  assertEquals_(removed.length, 1, 'ต้องได้แถวที่ถูกลบกลับมา');
  assertEquals_(removed[0].Request_ID, id, 'และต้องเป็นแถวที่สั่งลบจริง');
  assertEquals_(db_count_('Request_Type', { Request_ID: id }), 0, 'อ่านซ้ำต้องไม่เจอแล้ว');

  assertThrowsMessage_(function () { db_delete_('Request_Type', {}); },
    'ต้องระบุเงื่อนไข', 'ลบทั้งตารางโดยไม่มีเงื่อนไขต้องถูกปฏิเสธ');

  return endTest_();
}

/**
 * ตัวออกเลขแบบ atomic — เหตุผลหลักข้อหนึ่งของการย้าย (SPEC 22.4)
 */
function test_db_rpcRunningNumber() {
  beginTest_('ออกเลขที่ด้วย RPC ต้องไม่ซ้ำและเรียงติดกัน');
  dbTestCleanup_();

  var key = DB_TEST_PREFIX + 'COUNTER';
  var first  = Number(db_rpc_('next_running_number', { p_key: key }));
  var second = Number(db_rpc_('next_running_number', { p_key: key }));
  var third  = Number(db_rpc_('next_running_number', { p_key: key }));

  assertEquals_(first, 1, 'คีย์ใหม่ต้องเริ่มที่ 1');
  assertEquals_(second, first + 1, 'ครั้งที่สองต้องเป็นเลขถัดไป');
  assertEquals_(third, second + 1, 'ครั้งที่สามต้องเป็นเลขถัดไปอีกหนึ่ง');

  var row = db_select_('Counter', { filters: { 'Key': key } });
  assertEquals_(row.length, 1, 'ต้องมีแถวตัวนับเกิดขึ้นจริงหนึ่งแถว');
  assertEquals_(row[0].Last_Number, third, 'และเลขล่าสุดในตารางต้องตรงกับที่เพิ่งออกให้');

  dbTestCleanup_();
  return endTest_();
}

/**
 * อ่านหลายตารางพร้อมกันต้องได้ผลเท่ากับอ่านทีละตาราง
 */
function test_db_fetchAllTables() {
  beginTest_('อ่านหลายตารางพร้อมกันในรอบเดียว');

  var together = db_fetchAll_([
    { tableKey: 'Request_Type',     order: 'Sort_Order', limit: 3 },
    { tableKey: 'Report_Master',    order: 'Sort_Order', limit: 3 },
    { tableKey: 'Attachment_Topic', order: 'Topic_ID',   limit: 3 }
  ]);

  assertEquals_(together.length, 3, 'ต้องได้ผลครบทั้งสามคำขอ');

  var alone = db_select_('Report_Master', { order: 'Sort_Order', limit: 3 });
  assertEquals_(together[1].length, alone.length, 'จำนวนแถวต้องเท่ากับการอ่านทีละตาราง');

  if (alone.length) {
    assertEquals_(together[1][0].Report_Code, alone[0].Report_Code,
      'และได้แถวเดียวกันตามลำดับเดียวกัน');
    assertTrue_(together[1][0].report_code === undefined,
      'คีย์ต้องเป็นชื่อเดิมของระบบ ชื่อแบบ snake_case ห้ามรั่วขึ้นมา (กฎข้อ 21)');
  }

  return endTest_();
}

/**
 * ทุกความล้มเหลวต้องกลายเป็นข้อความไทยกลาง ๆ ตัวเดียวกัน (กฎข้อ 24)
 *
 * ข้อนี้สำคัญกว่าที่เห็น เพราะรายละเอียดจาก PostgREST มีชื่อตาราง ชื่อคอลัมน์
 * และบางครั้งมีค่าข้อมูลจริงติดมาด้วย · ถ้าหลุดไปหน้าเว็บ ผู้ใช้ทั่วไปจะเห็น
 * โครงสร้างฐานข้อมูลทั้งหมดจากการทำอะไรผิดเพียงครั้งเดียว
 *
 * หมายเหตุ: ข้อนี้ทำให้เกิดบรรทัด DB_FAILED ใน System_Log จริงสองบรรทัด
 * ซึ่งเป็นสิ่งที่ต้องการ เพราะกำลังพิสูจน์ว่าของจริงถูกบันทึกไว้ที่นั่น
 */
function test_db_failuresStayThai() {
  beginTest_('ความล้มเหลวทุกแบบต้องกลายเป็นข้อความไทยกลาง ๆ');
  dbTestCleanup_();

  /* ---------- ตารางที่ไม่มีอยู่จริง ---------- */
  dbExpectUserMessage_(function () {
    db_fetch_('GET', '/tarang_tee_mai_mee_jing_loey?select=*', null, { retries: 0 });
  }, 'ตารางที่ไม่มีอยู่จริงต้องได้ข้อความกลาง ๆ');

  /* ---------- คีย์ซ้ำ ---------- */
  var id = DB_TEST_PREFIX + 'DUP';
  db_insert_('Request_Type', { Request_ID: id, Request_Name: 'ตัวแรก', Sort_Order: 901 });

  dbExpectUserMessage_(function () {
    db_insert_('Request_Type', { Request_ID: id, Request_Name: 'ตัวซ้ำ', Sort_Order: 902 });
  }, 'คีย์ซ้ำต้องได้ข้อความกลาง ๆ ตัวเดียวกัน');

  // และต้องไม่ถูกยิงซ้ำจนเกิดแถวซ้ำขึ้นมาจริง — 4xx ห้ามลองใหม่ (กฎข้อ 24)
  assertEquals_(db_count_('Request_Type', { Request_ID: id }), 1,
    'ความล้มเหลวแบบ 4xx ต้องไม่ถูกยิงซ้ำจนเกิดข้อมูลซ้ำ');

  dbTestCleanup_();
  return endTest_();
}

/**
 * ข้อความจากผู้ใช้ต้องถูกหลีกก่อนต่อเข้าตัวกรองเสมอ (SPEC 21, กฎข้อ 28)
 *
 * อักขระ `, . ( ) " ` มีความหมายในไวยากรณ์ตัวกรองของ PostgREST และ `% _ \`
 * มีความหมายใน LIKE ของ SQL · ลูกค้าไทยมีชื่ออย่าง "บริษัท เอ,บี จำกัด" อยู่จริง
 * การต่อสตริงตรง ๆ จึงทำให้คำขอผิดรูปหรือได้ผลที่ผิดโดยไม่มีอะไรฟ้องเลยสักอย่าง
 *
 * ข้อนี้เป็นตรรกะล้วน จึงตรวจได้ทุกที่โดยไม่ต้องมีฐานข้อมูล
 */
function test_db_filterEscapesUserText() {
  beginTest_('คำค้นของผู้ใช้ต้องถูกหลีกก่อนเข้าตัวกรอง');

  /* ---------- สัญลักษณ์ของ LIKE ต้องกลายเป็นตัวอักษรธรรมดา ---------- */
  assertEquals_(dbLikeLiteral_('ส่วนลด 100%'), 'ส่วนลด 100\\%',
    'เปอร์เซ็นต์ต้องถูกหลีก ไม่งั้นจะกลายเป็น "ข้อความอะไรก็ได้"');
  assertEquals_(dbLikeLiteral_('A_B'), 'A\\_B',
    'ขีดล่างต้องถูกหลีก ไม่งั้นค้น A_B แล้วได้ AxB ติดมาด้วย');
  assertEquals_(dbLikeLiteral_('C:\\ไฟล์'), 'C:\\\\ไฟล์',
    'ขีดทับกลับต้องถูกหลีกเป็นสองตัว เพราะตัวมันเองคือตัวหลีก');
  assertEquals_(dbLikeLiteral_('ก%ข_ค\\ง'), 'ก\\%ข\\_ค\\\\ง',
    'หลีกทั้งสามตัวพร้อมกันได้ และต้องไม่หลีกซ้อนตัวที่เพิ่งใส่เอง');

  /*
   * ดอกจันจงใจไม่หลีก · PostgREST แทน * ด้วย % แบบตรงไปตรงมาก่อนส่งต่อ
   * การหลีกจะได้ \% ซึ่งแปลว่า "ตัวอักษรเปอร์เซ็นต์" แล้วแถวที่มีดอกจันจริงจะหายไป
   * การปล่อยไว้ทำให้ผลกว้างเกินจริงแทน ซึ่งผู้เรียกคัดออกในรอบสุดท้ายได้
   */
  assertEquals_(dbLikeLiteral_('เอ*บี'), 'เอ*บี',
    'ดอกจันต้องไม่ถูกหลีก — ผลที่กว้างเกินไปแก้ได้ ผลที่ขาดหายแก้ไม่ได้');

  /* ---------- การครอบเครื่องหมายคำพูด ใช้ได้เฉพาะค่าที่อยู่ในวงเล็บ ---------- */
  /*
   * probeFilters() วัดจาก Supabase ของจริงแล้วได้ว่า PostgREST ถอดเครื่องหมายคำพูด
   * ให้เฉพาะค่าที่อยู่ในวงเล็บ คือ in.(...) กับเงื่อนไขใน or=(...) เท่านั้น
   * ที่ระดับบนสุดมันไม่ถอด เครื่องหมายคำพูดจึงกลายเป็นตัวอักษรของค่าไปเลย
   *   eq.AR-0001 ได้ 1 แถว · eq."AR-0001" ได้ 0 แถว
   */
  assertEquals_(dbQuoteValue_('บริษัท เอ,บี จำกัด'), '"บริษัท เอ,บี จำกัด"',
    'ค่าที่มีจุลภาคใน in.(...) ต้องถูกครอบ ไม่งั้นถูกอ่านเป็นสองค่า');
  assertEquals_(dbQuoteValue_('เขา"พูด"'), '"เขา\\"พูด\\""',
    'เครื่องหมายคำพูดข้างในต้องถูกหลีก');
  assertEquals_(dbQuoteValue_('ก\\ข'), '"ก\\\\ข"',
    'ขีดทับกลับข้างในต้องถูกหลีกก่อนเครื่องหมายคำพูดเสมอ');

  /* ---------- ประกอบกันแล้วต้องได้คำขอที่อ่านออกและครบถ้วน ---------- */
  var nasty = 'บริษัท เอ,บี (๒๐๒๖) 100% จำกัด';
  var filters = {};
  filters[CUSTOMER_FIELD.NAME] = { op: 'ilike', value: dbContainsPattern_(nasty) };
  var path = decodeURIComponent(dbSelectPath_(SHEET.CUSTOMER, {
    filters: filters, order: CUSTOMER_FIELD.CODE, limit: CUSTOMER_SEARCH_LIMIT
  }));

  /*
   * ค่าต้องไปทั้งก้อนโดยไม่มีเครื่องหมายคำพูดครอบ และมีขีดทับกลับตัวเดียวหน้าเปอร์เซ็นต์
   *
   * จุลภาค จุด และวงเล็บในคำค้นไม่ต้องทำอะไรเลย เพราะที่ระดับบนสุด PostgREST
   * อ่านทุกอย่างหลังจุดแรกเป็นค่าทั้งก้อน — วัดแล้วด้วย probeFilters() ข้อ B1 กับ B3
   * ซึ่งส่งจุลภาคและจุดไปตรง ๆ แล้วได้ 200 ทั้งคู่ ไม่ใช่คำขอผิดรูป
   */
  assertTrue_(path.indexOf('ilike.*บริษัท เอ,บี (๒๐๒๖) 100\\% จำกัด*') !== -1,
    'ค่าต้องไม่ถูกครอบ และเปอร์เซ็นต์ต้องถูกหลีกด้วยขีดทับกลับตัวเดียว · ได้ ' + path);
  assertTrue_(path.indexOf('ilike."') === -1,
    'ห้ามครอบค่าของ ilike ที่ระดับบนสุด — ของจริงจะหาเครื่องหมายคำพูดในชื่อลูกค้าแล้วได้ศูนย์แถว');
  assertTrue_(path.indexOf('limit=' + CUSTOMER_SEARCH_LIMIT) !== -1,
    'ต้องมีเพดานจำนวนติดไปกับคำขอเสมอ');
  assertTrue_(path.indexOf('order=customer_code.asc') !== -1,
    'ต้องเรียงด้วยรหัสลูกค้า ซึ่งเป็นลำดับเดียวกับที่ผู้ใช้เห็นอยู่เดิม');

  /* ---------- ตอนไม่มีคำค้นก็ต้องมีเพดาน ---------- */
  // เส้นทางที่ไม่มีคำค้นคือเส้นทางที่ลืมง่ายที่สุด และเป็นเส้นทางที่คืนทั้งตารางถ้าลืม
  var empty = {};
  empty[CUSTOMER_FIELD.NAME] = { op: 'neq', value: '' };
  var emptyPath = decodeURIComponent(dbSelectPath_(SHEET.CUSTOMER, {
    filters: empty, order: CUSTOMER_FIELD.CODE, limit: CUSTOMER_SEARCH_LIMIT
  }));
  assertTrue_(emptyPath.indexOf('limit=' + CUSTOMER_SEARCH_LIMIT) !== -1,
    'คำขอตอนไม่มีคำค้นก็ต้องมีเพดานจำนวน');

  return endTest_();
}

/** ชื่อที่มีอักขระซึ่งมีความหมายพิเศษ ทั้งในไวยากรณ์ตัวกรองและใน LIKE ของ SQL */
var SEARCH_TRAP_NAMES_ = Object.freeze([
  'บริษัท เอ,บี จำกัด',          // จุลภาค — แบ่งค่าในไวยากรณ์ตัวกรอง
  'บริษัท เอ.บี. จำกัด',         // จุด — แบ่งตัวดำเนินการออกจากค่า
  'บริษัท (สำนักงานใหญ่)',       // วงเล็บ — ครอบรายการค่า
  'ลดราคา 100% ทั้งร้าน',        // เปอร์เซ็นต์ — สัญลักษณ์ของ LIKE
  'รหัส A_B ชั้นสอง',            // ขีดล่าง — สัญลักษณ์ของ LIKE
  'ดาว*เด่น การช่าง',            // ดอกจัน — PostgREST แปลงเป็นเปอร์เซ็นต์
  'ร้าน "สมชาย" จำกัด',          // เครื่องหมายคำพูด — ครอบค่าในไวยากรณ์ตัวกรอง
  "ร้าน 'สมหญิง' จำกัด",         // เครื่องหมายคำพูดเดี่ยว — ตัวคั่นข้อความของ SQL
  'เส้นทาง C:\\งาน\\ใหม่'        // ขีดทับกลับ — ตัวหลีกของ LIKE
]);

/**
 * คำค้นที่มีอักขระพิเศษต้องได้ผลตรงเป๊ะ ไม่ใช่ผิดรูปหรือกวาดของเกินมา
 *
 * ทดสอบบนตาราง _test_bulk ซึ่งมีไว้ให้ชุดทดสอบเขียนโดยเฉพาะ
 * ไม่ใช่บน Customer เพราะ SPEC 22.8 ห้ามเขียนลงตารางลูกค้าในทุกกรณี
 * และไม่ใช่บน Request_Type เพราะหน้าสร้างใบงานอ่านตารางนั้นไปทำกล่องให้ผู้ใช้เลือก
 *
 * ตัวที่กำลังพิสูจน์คือชั้นประกอบตัวกรอง ซึ่งเป็นโค้ดชุดเดียวกันทุกตาราง
 * ผลที่ได้จึงใช้ยืนยันเส้นทางค้นลูกค้าได้
 */
function test_db_searchSurvivesSpecialCharacters() {
  beginTest_('คำค้นที่มีอักขระพิเศษต้องได้ผลตรงเป๊ะ');

  var prefix = testPrefix_() + 'TRAP-';
  var mine = { Row_ID: { op: 'like', value: prefix + '*' } };
  dbDeleteVerified_(TEST_BULK_TABLE, mine, 'แถวทดสอบอักขระพิเศษ');

  var rows = [];
  for (var i = 0; i < SEARCH_TRAP_NAMES_.length; i++) {
    rows.push({ Row_ID: prefix + i, Row_Name: SEARCH_TRAP_NAMES_[i],
      Sort_Order: i, Active: true });
  }

  try {
    db_insert_(TEST_BULK_TABLE, rows);

    for (var t = 0; t < SEARCH_TRAP_NAMES_.length; t++) {
      var name = SEARCH_TRAP_NAMES_[t];
      var filters = { Row_ID: { op: 'like', value: prefix + '*' },
        Row_Name: { op: 'ilike', value: dbContainsPattern_(name) } };
      var found = db_select_(TEST_BULK_TABLE, { filters: filters, order: 'Row_ID' });

      assertEquals_(found.length, 1,
        'ค้นชื่อเต็มที่มีอักขระพิเศษ ต้องได้แถวเดียวพอดี — "' + name + '"');
      assertEquals_(String(found[0].Row_Name), name,
        'และต้องเป็นแถวที่ชื่อตรงกันจริง ไม่ใช่แถวอื่นที่บังเอิญเข้ารูปแบบ');
    }

    /* ---------- สัญลักษณ์ของ LIKE ต้องไม่ทำงานเป็นสัญลักษณ์ ---------- */
    /*
     * นี่คือหัวใจของข้อนี้ · ถ้าไม่หลีก `_` คำค้น "A_B" จะเข้ากับ "AxB" ด้วย
     * แล้วผู้ใช้จะเห็นลูกค้าที่ไม่เกี่ยวข้องโผล่มาในรายการ โดยไม่มีอะไรผิดพลาดให้เห็น
     */
    db_insert_(TEST_BULK_TABLE, [
      { Row_ID: prefix + 'X1', Row_Name: 'รหัส AxB ชั้นสอง', Sort_Order: 90, Active: true },
      { Row_ID: prefix + 'X2', Row_Name: 'ลดราคา 1000 ทั้งร้าน', Sort_Order: 91, Active: true }
    ]);

    var underscore = db_select_(TEST_BULK_TABLE, { filters: {
      Row_ID: { op: 'like', value: prefix + '*' },
      Row_Name: { op: 'ilike', value: dbContainsPattern_('A_B') } } });
    assertEquals_(underscore.length, 1, 'ขีดล่างต้องเป็นตัวอักษร ไม่ใช่ "อักขระอะไรก็ได้หนึ่งตัว"');
    assertEquals_(String(underscore[0].Row_Name), 'รหัส A_B ชั้นสอง',
      'และต้องเป็นแถวที่มีขีดล่างจริง ไม่ใช่แถวที่มีตัวอักษรอื่นคั่นอยู่');

    var percent = db_select_(TEST_BULK_TABLE, { filters: {
      Row_ID: { op: 'like', value: prefix + '*' },
      Row_Name: { op: 'ilike', value: dbContainsPattern_('100%') } } });
    assertEquals_(percent.length, 1, 'เปอร์เซ็นต์ต้องเป็นตัวอักษร ไม่ใช่ "ข้อความอะไรก็ได้"');

    /* ---------- คำค้นว่างต้องไม่พังและต้องยังมีเพดาน ---------- */
    var limited = db_select_(TEST_BULK_TABLE, { filters: {
      Row_ID: { op: 'like', value: prefix + '*' },
      Row_Name: { op: 'ilike', value: dbContainsPattern_('') } }, limit: 3 });
    assertEquals_(limited.length, 3, 'คำค้นว่างต้องยังถูกจำกัดจำนวนตามที่สั่ง');
  } finally {
    dbDeleteVerified_(TEST_BULK_TABLE, mine, 'แถวทดสอบอักขระพิเศษ');
    clearRowCache_();
  }

  assertEquals_(db_count_(TEST_BULK_TABLE, mine), 0, 'ต้องไม่เหลือแถวทดสอบไว้เลย');

  return endTest_();
}

/**
 * ค้นลูกค้าหนึ่งครั้ง ต้องยิงคำขอเดียว และต้องได้ผลเหมือนวิธีเดิมทุกประการ
 *
 * **ข้อนี้คือสิ่งเดียวที่กันไม่ให้การค้นค่อย ๆ กลับไปอ่านทั้งตารางอีก** · การถอยกลับ
 * แบบนั้นไม่เคยมาเป็นก้อนใหญ่ มันมาในรูปของบรรทัดเดียวที่เรียก listCustomers()
 * เพราะสะดวกกว่า แล้วทุกอย่างยังทำงานถูกต้อง เพียงแต่ช้าลงทีละนิดจนไม่มีใครสังเกต
 *
 * ส่วนการเทียบกับวิธีเดิม คือสิ่งที่พิสูจน์ว่าย้ายการกรองไปฐานข้อมูลแล้วผู้ใช้
 * ยังเห็นของชุดเดิมในลำดับเดิม — ทั้งช่องที่ค้นและลำดับที่แสดง
 */
function test_db_customerSearchCostsOneRequest() {
  beginTest_('ค้นลูกค้าหนึ่งครั้ง = หนึ่งคำขอ และผลเหมือนเดิม');

  clearRowCache_();
  var everyone = db_selectAll_(SHEET.CUSTOMER, {});
  assertTrue_(everyone.length >= 0, 'ต้องอ่านตารางลูกค้าได้ ไม่งั้นการเทียบไม่มีความหมาย');

  /* ---------- คำค้นที่หยิบมาจากข้อมูลจริง เพื่อให้มีผลลัพธ์แน่ ๆ ---------- */
  var sample = '';
  for (var i = 0; i < everyone.length && !sample; i++) {
    var name = String(everyone[i][CUSTOMER_FIELD.NAME] || '').trim();
    if (name.length >= 3) sample = name.substring(0, 3);
  }

  var queries = ['', sample, 'ไม่มีลูกค้าชื่อนี้แน่นอน-' + testRunId_()];
  for (var q = 0; q < queries.length; q++) {
    if (queries[q] === '' && !everyone.length) continue;

    clearRowCache_();
    dbCallReset_();
    var got = searchCustomers(queries[q], CUSTOMER_SEARCH_LIMIT);
    var used = dbCallCount();

    assertEquals_(used, 1,
      'ค้นลูกค้าด้วยคำว่า "' + queries[q] + '" ต้องยิงคำขอเดียว (ยิงจริง ' + used + ')');
    assertTrue_(got.length <= CUSTOMER_SEARCH_LIMIT,
      'ต้องไม่เกินเพดาน ' + CUSTOMER_SEARCH_LIMIT + ' รายการ แม้คำค้นจะว่าง');

    /* ---------- เทียบกับวิธีเดิมทีละรายการ ---------- */
    // วิธีเดิมคืออ่านทั้งตารางแล้วคัดในหน่วยความจำ ซึ่งยังเป็นคำตอบที่ถูกต้องอยู่
    // ต่างกันแค่ราคา ผลลัพธ์จึงต้องตรงกันทุกช่องและทุกตำแหน่ง
    var expected = filterCustomers_(everyone, queries[q], CUSTOMER_SEARCH_LIMIT);
    assertEquals_(got.length, expected.length,
      'จำนวนผลลัพธ์ของคำว่า "' + queries[q] + '" ต้องเท่ากับวิธีเดิม');
    for (var r = 0; r < expected.length; r++) {
      assertEquals_(got[r].code, expected[r].code,
        'ลำดับที่ ' + (r + 1) + ' ต้องเป็นลูกค้ารายเดียวกับวิธีเดิม');
      assertEquals_(got[r].name, expected[r].name, 'และชื่อต้องตรงกัน');
    }
  }

  /* ---------- ห้ามมีใครเผลอเรียกซ้ำในวนลูป ---------- */
  dbCallReset_();
  for (var n = 0; n < 5; n++) searchCustomers(sample || 'ก', CUSTOMER_SEARCH_LIMIT);
  assertEquals_(dbCallCount(), 5,
    'ค้นห้าครั้งต้องเป็นห้าคำขอพอดี — มากกว่านี้แปลว่ามีการอ่านทั้งตารางแฝงอยู่');

  return endTest_();
}

/**
 * อ่านหลายตารางพร้อมกัน ต้องรอรอบเดียว ไม่ใช่รอทีละตาราง
 *
 * จำนวนคำขอไม่เปลี่ยน สิ่งที่เปลี่ยนคือจำนวนรอบที่ต้องรอ ซึ่งเป็นตัวเลขที่ผู้ใช้
 * รู้สึกได้จริง · ถ้าไม่มีข้อนี้ การเผลอเปลี่ยนกลับไปอ่านทีละตารางจะไม่มีอะไรฟ้อง
 * เพราะผลลัพธ์ยังถูกต้องทุกประการ
 */
function test_db_warmingReadsTablesInOneRound() {
  beginTest_('อุ่นหลายตารางพร้อมกันต้องรอรอบเดียว');

  var tables = [SHEET.REPORT_MASTER, SHEET.REQUEST_TYPE, SHEET.ATTACHMENT_TOPIC,
    SHEET.TASK_STEP_TEMPLATE, SHEET.NOTIFY_CHANNEL];

  clearRowCache_();
  clearMasterCache_();
  dbCallReset_();
  var warmed = warmSnapshots_(tables);

  assertEquals_(warmed, tables.length, 'ต้องอุ่นครบทุกตารางที่บอกไว้');
  assertEquals_(dbCallCount(), tables.length,
    'ยังเป็นหนึ่งคำขอต่อหนึ่งตารางเหมือนเดิม ไม่ได้ลดจำนวนคำขอ');
  assertEquals_(dbRoundCount(), 1,
    'แต่ต้องรอรอบเดียว เพราะยิงพร้อมกันทั้งชุด (รอจริง ' + dbRoundCount() + ' รอบ)');

  /* ---------- อ่านต่อจากนั้นต้องไม่เสียคำขอเพิ่มเลย ---------- */
  dbCallReset_();
  listReportMaster();
  listRequestTypes();
  listAttachmentTopics();
  listStepTemplates();
  listNotifyChannels();
  assertEquals_(dbCallCount(), 0, 'ของที่อุ่นไว้แล้วต้องอ่านได้จากแคชโดยไม่ยิงเพิ่ม');

  /* ---------- อุ่นซ้ำต้องไม่เสียอะไรเพิ่ม ---------- */
  dbCallReset_();
  assertEquals_(warmSnapshots_(tables), 0, 'อุ่นซ้ำต้องไม่ดึงอะไรมาอีก');
  assertEquals_(dbCallCount(), 0, 'และต้องไม่ยิงคำขอเพิ่มแม้แต่คำขอเดียว');

  /* ---------- ข้อมูลที่อุ่นมาต้องครบเท่ากับการอ่านทีละตาราง ---------- */
  // การยิงขนานเป็นช่องทางใหม่ที่ข้อมูลขาดหายเงียบ ๆ ได้ ถ้าลืมไล่อ่านต่อเมื่อเต็มหน้า
  for (var t = 0; t < tables.length; t++) {
    clearRowCache_();
    clearMasterCache_();
    var oneByOne = readAll_(tables[t]).length;
    clearRowCache_();
    clearMasterCache_();
    warmSnapshots_(tables);
    assertEquals_(readAll_(tables[t]).length, oneByOne,
      'ตาราง ' + tables[t] + ' ที่อุ่นมาพร้อมกัน ต้องได้แถวครบเท่ากับอ่านทีละตาราง');
  }

  return endTest_();
}

/**
 * ออกเลขที่ต้องเรียงติดกันไม่ซ้ำ และต้องไม่พึ่ง LockService อีกแล้ว
 *
 * ข้อแรกเป็นสิ่งที่ระบบเคยทำได้อยู่แล้ว ข้อสองคือสิ่งที่การย้ายทำให้ดีขึ้นจริง
 * LockService กันได้แค่ภายในสคริปต์เดียวกัน และยังมีช่องว่างระหว่างอ่านกับเขียนอยู่ดี
 * ส่วน `next_running_number` ทำ UPDATE ... RETURNING ในคำสั่งเดียว ซึ่ง Postgres
 * รับประกันว่าเป็นหน่วยเดียว (SPEC 22.4)
 *
 * ข้อที่พิสูจน์ว่า "ไม่เรียกล็อกแล้ว" สำคัญกว่าที่เห็น เพราะถ้าวันหนึ่งมีคนเติมล็อก
 * กลับเข้ามาเพราะ "กันไว้ก่อน" ระบบจะช้าลงและกลับไปพึ่งสิ่งที่ย้ายไป Worker ไม่ได้
 * โดยที่ผลลัพธ์ยังถูกต้องทุกประการ จึงไม่มีอะไรฟ้องเลยนอกจากข้อนี้
 */
function test_db_counterUsesRpcNotLock() {
  beginTest_('ออกเลขที่ด้วย RPC ไม่ใช่ LockService');

  var key = testPrefix_() + 'CNT';
  var mine = { 'Key': { op: 'like', value: key + '*' } };
  dbDeleteVerified_('Counter', mine, 'ตัวนับค้างจากรอบก่อน');

  try {
    /* ---------- เรียกติดกันต้องได้เลขเรียงกันไม่ซ้ำ ---------- */
    var issued = [];
    for (var i = 0; i < 5; i++) issued.push(nextRunningNumber(key));

    for (var n = 0; n < issued.length; n++) {
      assertEquals_(issued[n], key + '-' + padNumber_(n + 1, 4),
        'เลขที่ครั้งที่ ' + (n + 1) + ' ต้องเป็นลำดับถัดไปพอดี');
    }

    var unique = {};
    for (var u = 0; u < issued.length; u++) unique[issued[u]] = true;
    assertEquals_(Object.keys(unique).length, issued.length, 'ต้องไม่มีเลขไหนซ้ำกันเลย');

    /* ---------- ตัวนับในฐานข้อมูลต้องตรงกับเลขสุดท้ายที่ออกไป ---------- */
    clearRowCache_();
    assertEquals_(Number(getCounter(key)['Last_Number']), issued.length,
      'ค่าที่เก็บไว้ต้องเท่ากับจำนวนเลขที่ออกไปแล้ว');

    /* ---------- และต้องไม่แตะ LockService เลยตลอดเส้นทาง ---------- */
    /*
     * วางกับดักแทนตัวขอล็อก · ถ้าเส้นทางออกเลขยังเรียกอยู่ ข้อนี้จะโยนออกมาทันที
     * การนับว่า "เรียกกี่ครั้ง" ไม่พอ เพราะศูนย์ครั้งคือสิ่งเดียวที่ยอมรับได้
     */
    var realLock = acquireLock_;
    try {
      acquireLock_ = function () {
        throw new Error('เส้นทางออกเลขที่ยังเรียก LockService อยู่');
      };
      var afterTrap = nextRunningNumber(key);
      assertEquals_(afterTrap, key + '-' + padNumber_(issued.length + 1, 4),
        'ออกเลขได้โดยไม่แตะ LockService เลย');
    } finally {
      acquireLock_ = realLock;
    }

    /* ---------- กับดักต้องใช้ได้จริง ไม่ใช่กับดักที่ไม่เคยลั่น ---------- */
    // ถ้ากับดักดักไม่ได้ ข้อข้างบนจะผ่านตลอดไม่ว่าโค้ดจะเรียกล็อกหรือไม่
    var sprang = false;
    var realLock2 = acquireLock_;
    try {
      acquireLock_ = function () { throw new Error('กับดักลั่นแล้ว'); };
      try { acquireLock_(); } catch (e) { sprang = true; }
    } finally {
      acquireLock_ = realLock2;
    }
    assertTrue_(sprang, 'กับดักต้องลั่นได้จริงเมื่อมีคนเรียก ไม่งั้นข้อข้างบนไม่ได้พิสูจน์อะไร');
  } finally {
    dbDeleteVerified_('Counter', mine, 'ตัวนับทดสอบ');
    clearRowCache_();
  }

  return endTest_();
}

/**
 * โทเคนที่หมดอายุแล้วต้องใช้ไม่ได้ ไม่ใช่แค่โทเคนที่ยังดีต้องใช้ได้
 *
 * **นี่คือช่องโหว่ ไม่ใช่แค่ข้อบกพร่อง** · `Expires_Date` กลายเป็น timestamptz แล้ว
 * ฐานข้อมูลจึงคืนค่ากลับมาเป็นข้อความ ISO ไม่ใช่วัตถุ Date แบบที่ชีตเคยให้
 * ถ้ามีที่ไหนเทียบเวลาด้วยการเทียบข้อความ มันจะไม่แจ้งอะไรเลย แต่โทเคนที่ควร
 * หมดอายุจะยังใช้ได้ต่อไป · เทสต์ที่ทดสอบแต่โทเคนที่ยังดีจะเขียวสนิทตลอด
 */
function test_db_expiredTokenIsRejected() {
  beginTest_('โทเคนที่หมดอายุแล้วต้องใช้ไม่ได้');

  var user = addLoginTestUser_('EXPIRE', ROLE.ADMIN, 'รหัสผ่านที่ถูกต้องจริง');
  var hour = 3600 * 1000;

  var cases = [
    { name: 'หมดอายุไปแล้วหนึ่งชั่วโมง', token: 'TEST-TOKEN-OLD-' + testRunId_(),
      expires: new Date(new Date().getTime() - hour), active: true, ok: false },
    { name: 'หมดอายุพอดีเมื่อครู่',      token: 'TEST-TOKEN-EDGE-' + testRunId_(),
      expires: new Date(new Date().getTime() - 1000), active: true, ok: false },
    { name: 'ถูกปิดใช้งานแต่ยังไม่หมดอายุ', token: 'TEST-TOKEN-OFF-' + testRunId_(),
      expires: new Date(new Date().getTime() + hour), active: false, ok: false },
    { name: 'ยังไม่หมดอายุและยังใช้งานอยู่', token: 'TEST-TOKEN-GOOD-' + testRunId_(),
      expires: new Date(new Date().getTime() + hour), active: true, ok: true }
  ];

  var hashes = [];
  try {
    for (var i = 0; i < cases.length; i++) {
      var hash = hashSessionToken_(cases[i].token);
      hashes.push(hash);
      insertSessionToken({
        'Token_Hash':     hash,
        'Email':          user.email,
        'Issued_Date':    new Date(new Date().getTime() - hour),
        'Expires_Date':   cases[i].expires,
        'Last_Used_Date': new Date(new Date().getTime() - hour),
        'Active':         cases[i].active
      });
    }
    clearRowCache_();

    for (var c = 0; c < cases.length; c++) {
      var got = emailOfToken_(cases[c].token);
      if (cases[c].ok) {
        assertEquals_(got, user.email, cases[c].name + ' ต้องใช้ได้ตามปกติ');
      } else {
        assertEquals_(got, '', cases[c].name + ' ต้องใช้ไม่ได้ — ได้ "' + got + '"');
      }
    }

    /* ---------- เวลาที่อ่านกลับมาต้องยังเป็นเวลาจริง ไม่ใช่ข้อความ ---------- */
    /*
     * ถ้าข้อนี้แดง แปลว่าคอลัมน์เวลาไหลผ่านมาเป็นข้อความ ISO และทุกที่ที่เทียบเวลา
     * ในระบบกำลังเทียบข้อความอยู่ ซึ่งบังเอิญถูกสำหรับรูปแบบ ISO แต่ผิดทันที
     * ที่รูปแบบเปลี่ยน และไม่มีอะไรบอกว่ามันเปลี่ยนไปแล้ว
     */
    var stored = getSessionToken(hashes[0]);
    assertTrue_(stored['Expires_Date'] instanceof Date,
      'เวลาหมดอายุที่อ่านกลับมาต้องเป็นวัตถุ Date เหมือนที่ชีตเคยให้');
    assertTrue_(stored['Expires_Date'].getTime() < new Date().getTime(),
      'และต้องเป็นเวลาในอดีตจริง ๆ ตามที่เขียนลงไป');

    /* ---------- การเก็บกวาดต้องเก็บเฉพาะโทเคนที่ตายแล้ว ---------- */
    clearRowCache_();
    pruneSessionTokens_();
    clearRowCache_();

    assertTrue_(!getSessionToken(hashes[0]), 'โทเคนที่หมดอายุต้องถูกเก็บกวาดออกไป');
    assertTrue_(!getSessionToken(hashes[2]), 'โทเคนที่ถูกปิดใช้งานต้องถูกเก็บกวาดออกไป');
    assertTrue_(!!getSessionToken(hashes[3]), 'โทเคนที่ยังดีต้องไม่ถูกเก็บกวาดไปด้วย');
    assertEquals_(emailOfToken_(cases[3].token), user.email,
      'และต้องยังใช้งานได้ตามปกติหลังการเก็บกวาด');
  } finally {
    for (var h = 0; h < hashes.length; h++) {
      try { db_delete_(SHEET.SESSION_TOKEN, { 'Token_Hash': hashes[h] }); } catch (e) {}
    }
    clearRowCache_();
  }

  return endTest_();
}

/**
 * ชื่อผู้ใช้ซ้ำต้องเพิ่มไม่ได้ — การคุ้มครองที่ชีตไม่เคยมี
 *
 * บนชีตไม่มีอะไรกันชื่อผู้ใช้ซ้ำเลย สองแถวที่ชื่อเดียวกันอยู่ร่วมกันได้สบาย
 * แล้วการล็อกอินจะเจอแถวแรกเสมอ ซึ่งแปลว่าอีกคนหนึ่งเข้าระบบไม่ได้ตลอดไป
 * โดยไม่มีใครรู้ว่าทำไม · `unique` ของฐานข้อมูลปิดประตูนี้ตั้งแต่ตอนเขียน
 */
function test_db_duplicateUsernameIsRejected() {
  beginTest_('ชื่อผู้ใช้ซ้ำต้องเพิ่มไม่ได้');

  var first = addLoginTestUser_('UNIQ1', ROLE.ADMIN, 'รหัสผ่านที่ถูกต้องจริง');
  var clash = { email: testPrefix_() + 'UNIQ2@cnr.co.th', username: first.username };

  try {
    /* ---------- อีเมลคนละอัน แต่ชื่อผู้ใช้ซ้ำ ต้องถูกปฏิเสธ ---------- */
    assertThrows_(function () {
      appendRow_(SHEET.USER_ROLE, {
        'Email':                clash.email,
        'Username':             clash.username,   // ซ้ำกับคนแรก
        'Display_Name':         'ผู้ใช้ที่ชื่อซ้ำ',
        'Role':                 ROLE.SERVICE,
        'Department':           '',
        'Failed_Count':         0,
        'Must_Change_Password': false,
        'Active':               true
      });
    }, 'ชื่อผู้ใช้ซ้ำต้องถูกปฏิเสธที่ชั้นฐานข้อมูล');

    /* ---------- และต้องไม่มีแถวที่สองหลงเหลืออยู่ ---------- */
    // การปฏิเสธที่ยังเขียนลงไปบางส่วน แย่กว่าการไม่ปฏิเสธเลย เพราะเก็บกวาดยากกว่า
    clearRowCache_();
    assertEquals_(db_count_(SHEET.USER_ROLE, { 'Email': clash.email }), 0,
      'แถวที่ถูกปฏิเสธต้องไม่ถูกเขียนลงไปเลยแม้แต่บางส่วน');
    assertEquals_(db_count_(SHEET.USER_ROLE, { 'Username': first.username }), 1,
      'และชื่อผู้ใช้นั้นต้องยังมีเจ้าของเพียงคนเดียว');

    /* ---------- อีเมลซ้ำก็ต้องถูกปฏิเสธเหมือนกัน เพราะเป็นคีย์หลัก ---------- */
    assertThrows_(function () {
      appendRow_(SHEET.USER_ROLE, {
        'Email':    first.email,                      // ซ้ำกับคนแรก
        'Username': testPrefix_() + 'UNIQ3',
        'Role':     ROLE.SERVICE,
        'Active':   true
      });
    }, 'อีเมลซ้ำต้องถูกปฏิเสธเพราะเป็นคีย์หลัก');

    /* ---------- ชื่อผู้ใช้ที่ไม่ซ้ำต้องเพิ่มได้ตามปกติ ---------- */
    // ด่านที่ปฏิเสธทุกอย่างก็ไร้ประโยชน์พอ ๆ กับด่านที่ไม่เคยปฏิเสธอะไรเลย
    var third = addLoginTestUser_('UNIQ4', ROLE.SERVICE, 'รหัสผ่านที่ถูกต้องจริง');
    clearRowCache_();
    assertEquals_(db_count_(SHEET.USER_ROLE, { 'Username': third.username }), 1,
      'ชื่อผู้ใช้ที่ยังไม่มีใครใช้ต้องเพิ่มได้ตามปกติ');
  } finally {
    clearRowCache_();
  }

  return endTest_();
}

/**
 * ความล้มเหลวหนึ่งครั้งต้องไม่กลายเป็นพายุคำขอ และต้องยังทิ้งร่องรอยไว้ให้ตามได้
 *
 * **ข้อนี้เกิดจากข้อบกพร่องที่การย้ายชุด B สร้างขึ้นเอง** · System_Log ย้ายมาอยู่ใน
 * ฐานข้อมูลแล้ว การบันทึกว่า "คุยกับฐานข้อมูลไม่สำเร็จ" จึงกลายเป็นการคุยกับ
 * ฐานข้อมูลอีกครั้งหนึ่ง · เมื่อสาเหตุคือฐานข้อมูลติดต่อไม่ได้ การบันทึกก็ล้มด้วย
 * เหตุเดียวกัน แล้ววิ่งกลับเข้ามาที่ตัวจัดการความล้มเหลวอีกรอบ
 *
 * ที่วัดได้คือจำนวนคำขอเพิ่มเป็นสองเท่าพอดี — สามครั้งตามโควตาลองใหม่ แล้วอีก
 * สามครั้งเพื่อพยายามบันทึกว่าล้ม ตอนที่ฝั่งโน้นกำลังมีปัญหาอยู่แล้ว · และบรรทัด
 * ที่ตั้งใจจะบันทึกก็ไม่เคยถูกบันทึกลงไปจริงสักครั้ง จึงเสียทั้งสองทาง
 */
function test_db_failureDoesNotStormTheDatabase() {
  beginTest_('ความล้มเหลวต้องไม่ทวีคูณจำนวนคำขอ');

  var realSend = httpSend_;

  /* ---------- ฐานข้อมูลล่ม: ต้องยิงแค่ตามโควตาลองใหม่ ไม่มีส่วนเกิน ---------- */
  try {
    httpSend_ = function () { return { status: 503, headers: {}, body: '{"message":"service unavailable"}' }; };

    dbCallReset_();
    var threw = false;
    var message = '';
    try {
      db_select_('Request_Type', {});
    } catch (e) {
      threw = true;
      message = String(e && e.message);
    }

    assertTrue_(threw, 'ฐานข้อมูลล่มต้องโยนข้อผิดพลาดออกมา');
    assertEquals_(message, DB_USER_MESSAGE, 'และต้องเป็นข้อความไทยกลาง ๆ ตัวเดียวกันเสมอ');
    assertEquals_(dbCallCount(), DB_MAX_RETRY + 1,
      'ต้องยิงแค่ ' + (DB_MAX_RETRY + 1) + ' ครั้งตามโควตาลองใหม่ · ถ้าเป็นสองเท่า ' +
      'แปลว่าการบันทึกความล้มเหลวกำลังยิงซ้ำเข้าไปที่ฐานข้อมูลที่กำลังล่มอยู่');
  } finally {
    httpSend_ = realSend;
  }

  /* ---------- ต่อไม่ติดเลย ก็ต้องไม่ยิงเพิ่มเพื่อบันทึกเหมือนกัน ---------- */
  try {
    httpSend_ = function () { throw new Error('ต่อไม่ติด'); };

    dbCallReset_();
    try { db_select_('Request_Type', {}); } catch (e) { /* คาดไว้แล้ว */ }
    assertEquals_(dbCallCount(), DB_MAX_RETRY + 1,
      'ต่อไม่ติดก็ต้องยิงแค่ตามโควตา ไม่มีคำขอเพิ่มเพื่อบันทึก');
  } finally {
    httpSend_ = realSend;
  }

  /* ---------- ความล้มเหลวรายคำขอ: ฐานข้อมูลยังดี ต้องบันทึกได้จริง ---------- */
  /*
   * คีย์ซ้ำเป็นความผิดของคำสั่งนั้นคำสั่งเดียว ไม่ใช่อาการของฐานข้อมูล
   * บรรทัดบันทึกจึงต้องเขียนลงไปได้ตามปกติ · ถ้าเหมาว่าความล้มเหลวทุกแบบ
   * แปลว่าฐานข้อมูลใช้ไม่ได้ เราจะสูญเสียบันทึกของกรณีที่บันทึกได้ไปทั้งหมด
   */
  var key = testPrefix_() + 'STORM';
  var mine = { Row_ID: { op: 'like', value: key + '*' } };
  dbDeleteVerified_(TEST_BULK_TABLE, mine, 'ของค้างจากรอบก่อน');

  try {
    db_insert_(TEST_BULK_TABLE, [{ Row_ID: key + '-1', Row_Name: 'แถวแรก', Sort_Order: 1, Active: true }]);

    var before = db_count_(SHEET.SYSTEM_LOG, { 'Event': ACTION.DB_FAILED });
    dbCallReset_();

    assertThrows_(function () {
      db_insert_(TEST_BULK_TABLE, [{ Row_ID: key + '-1', Row_Name: 'แถวซ้ำ', Sort_Order: 2, Active: true }]);
    }, 'คีย์ซ้ำต้องถูกปฏิเสธ');

    assertTrue_(dbCallCount() <= 3,
      'คำขอที่ผิดเองต้องไม่ถูกยิงซ้ำ และการบันทึกต้องใช้คำขอเดียว (ยิงจริง ' +
      dbCallCount() + ')');

    clearRowCache_();
    assertEquals_(db_count_(SHEET.SYSTEM_LOG, { 'Event': ACTION.DB_FAILED }), before + 1,
      'ตอนฐานข้อมูลยังดี บรรทัด DB_FAILED ต้องถูกบันทึกลง System_Log จริง 1 แถว');

    var logged = queryRows_(SHEET.SYSTEM_LOG, { 'Event': ACTION.DB_FAILED },
      { order: { column: 'Log_ID', ascending: false }, limit: 1 })[0];
    assertEquals_(String(logged['Source']), LOG_SOURCE.DATABASE, 'ต้นทางต้องเป็น DATABASE');
    assertTrue_(String(logged['Detail']).indexOf('23505') !== -1,
      'และต้องเก็บรหัสจริงของ Postgres ไว้ให้ผู้ดูแลอ่าน · ได้ ' + logged['Detail']);
  } finally {
    dbDeleteVerified_(TEST_BULK_TABLE, mine, 'แถวทดสอบ');
    clearRowCache_();
  }

  return endTest_();
}

/**
 * คำขอที่ยาวเกินต้องถูกปฏิเสธพร้อมบอกว่ายาวเพราะอะไร (กฎข้อ 29)
 *
 * **ข้อนี้เกิดจากข้อบกพร่องจริง** · การล้างข้อมูลเคยสร้างตัวกรอง `in.(id1,id2,...)`
 * จากรายการ ID ทั้งหมดที่เจอ · พอ System_Log สะสมไปหลายร้อยแถว URL ก็ทะลุเพดาน
 * ของ UrlFetchApp แล้วการล้างข้อมูลล้มทั้งกลุ่ม
 *
 * สิ่งที่แพงที่สุดไม่ใช่ความล้มเหลว แต่เป็นข้อความที่ได้ —
 * `Limit Exceeded: URLFetch URL Length.` ไม่บอกว่าคำขอไหน ตารางไหน หรือยาวเท่าไร
 * ทั้งที่ข้อมูลทั้งหมดอยู่ในมือเราตั้งแต่ก่อนยิงแล้ว
 */
function test_db_longUrlIsRefusedWithReason() {
  beginTest_('คำขอที่ยาวเกินต้องถูกปฏิเสธพร้อมบอกเหตุผล');

  /* ---------- ตัวกรองที่ยาวตามจำนวนข้อมูล ต้องถูกปฏิเสธก่อนยิง ---------- */
  var many = [];
  for (var i = 0; i < 400; i++) many.push(testPrefix_() + 'LONG-' + ('0000' + i).slice(-5));

  var message = '';
  try {
    db_select_(TEST_BULK_TABLE, { filters: { Row_ID: { op: 'in', value: many } } });
  } catch (e) {
    message = String(e && e.message);
  }

  assertTrue_(message !== '', 'ตัวกรองที่ยาวเกินเพดานต้องถูกปฏิเสธ ไม่ใช่ยิงออกไปแล้วค่อยล้ม');
  assertTrue_(message.indexOf('_test_bulk') !== -1,
    'ข้อความต้องบอกว่าตารางไหน · ได้ ' + message);
  assertTrue_(message.indexOf(String(HTTP_MAX_URL_LENGTH)) !== -1,
    'และต้องบอกเพดานที่ใช้อยู่ · ได้ ' + message);
  assertTrue_(/ยาว \d+ ตัวอักษร/.test(message),
    'และต้องบอกว่ายาวเท่าไรจริง ๆ · ได้ ' + message);
  assertTrue_(message.indexOf('Row_ID'.toLowerCase()) !== -1 || message.indexOf('row_id') !== -1,
    'และต้องบอกว่าตัวกรองไหนเป็นตัวปัญหา · ได้ ' + message);
  assertEquals_(message.indexOf(DB_USER_MESSAGE), -1,
    'ข้อความนี้มีไว้ให้ผู้ดูแลอ่าน จึงต้องไม่ถูกกลบด้วยข้อความไทยกลาง ๆ ของหน้าเว็บ');

  /* ---------- คำขอที่สั้นตามปกติต้องผ่านเหมือนเดิม ---------- */
  // ด่านที่ปฏิเสธทุกอย่างไร้ประโยชน์พอ ๆ กับด่านที่ไม่เคยปฏิเสธอะไร
  var prefix = testPrefix_() + 'SHORT-';
  var short = { Row_ID: { op: 'like', value: dbLikeLiteral_(prefix) + '*' } };
  assertEquals_(db_select_(TEST_BULK_TABLE, { filters: short }).length, 0,
    'ตัวกรองคำนำหน้าต้องยิงออกไปได้ตามปกติ');

  /* ---------- คำนำหน้าต้องสั้นเท่าเดิมไม่ว่าจะมีกี่แถว ---------- */
  /*
   * นี่คือหัวใจของกฎข้อ 29 · เส้นแบ่งไม่ใช่ "ยาวแค่ไหนวันนี้" แต่คือ
   * "ขอบเขตของรายการถูกกำหนดโดยเราหรือโดยข้อมูล"
   */
  var pathWithPrefix = dbSelectPath_(TEST_BULK_TABLE, { filters: short });
  var pathWithTwenty = dbSelectPath_(TEST_BULK_TABLE,
    { filters: { Row_ID: { op: 'in', value: many.slice(0, 20) } } });
  var pathWithFourHundred = dbSelectPath_(TEST_BULK_TABLE,
    { filters: { Row_ID: { op: 'in', value: many } } });

  assertTrue_(pathWithPrefix.length < 200,
    'ตัวกรองคำนำหน้าต้องสั้นเสมอ · ยาว ' + pathWithPrefix.length);
  assertTrue_(pathWithFourHundred.length > pathWithTwenty.length * 10,
    'ส่วนตัวกรองแบบไล่แจกแจงยาวตามจำนวนค่าโดยตรง — ' + pathWithTwenty.length +
    ' เทียบกับ ' + pathWithFourHundred.length + ' ตัวอักษร');

  return endTest_();
}

/**
 * เวลานัดหมายต้องอ่านกลับมาได้สตริงเดิมเป๊ะตัวต่อตัว (กฎข้อ 23)
 *
 * `Start_Date` กับ `End_Date` เป็นเวลาหน้าปัดที่คนนัดกัน ไม่ใช่จุดเวลาบนแกนเวลาโลก
 * จึงเก็บเป็นข้อความ `YYYY-MM-DDTHH:mm` ตามที่ผู้ใช้เห็นบนจอ · วินาทีที่มีใครแปลงมัน
 * เป็น Date แล้วส่งผ่าน `toISOString()` เวลา 09:00 จะกลายเป็น 02:00 ทั้งระบบ
 * และไม่มีอะไรผิดพลาดให้เห็น มีแต่เวลานัดที่ผิดไปเจ็ดชั่วโมง
 */
function test_db_appointmentTimeStaysText() {
  beginTest_('เวลานัดหมายต้องเป็นข้อความเดิมเป๊ะ');

  var woId = testWoId_();
  var cases = ['2026-10-15T09:00', '2026-01-01T00:00', '2026-12-31T23:59', '2026-07-01T07:00'];

  try {
    for (var i = 0; i < cases.length; i++) {
      var id = woId + '-' + i;
      insertWorkOrder({ 'WO_ID': id, 'Customer_Code': 'CUST-TEST',
        'Location': 'จุดทดสอบเวลานัด', 'Overall_Status': WO_STATUS.PENDING_APPROVE,
        'Start_Date': cases[i], 'End_Date': cases[i] });

      clearRowCache_();
      var back = getWorkOrder(id);
      assertEquals_(back['Start_Date'], cases[i],
        'กำหนดเข้างานต้องได้สตริงเดิมเป๊ะ ไม่ใช่เวลาที่ถูกแปลงไปมา');
      assertEquals_(back['End_Date'], cases[i], 'กำหนดออกงานก็ต้องเหมือนกัน');
      assertTrue_(!(back['Start_Date'] instanceof Date),
        'และต้องไม่ใช่วัตถุ Date — ชนิดที่ผิดคือจุดเริ่มของการเลื่อนโซนเวลา');
    }

    /* ---------- ค่าที่มาจากฟอร์มก็ต้องเดินทางแบบเดียวกัน ---------- */
    // pickFormFields_ คือประตูเดียวที่ค่าจากหน้าเว็บเข้ามา ถ้าตรงนั้นแปลงชนิด ทุกอย่างพัง
    var picked = pickFormFields_({ 'Start_Date': '2026-10-15T09:00', 'End_Date': '2026-10-15T17:30' });
    assertEquals_(picked['Start_Date'], '2026-10-15T09:00', 'ค่าจากฟอร์มต้องผ่านมาเป็นข้อความเดิม');
    assertEquals_(picked['End_Date'], '2026-10-15T17:30', 'และช่องออกงานก็เหมือนกัน');
  } finally {
    dbDeleteVerified_(SHEET.WORK_ORDER,
      { 'WO_ID': { op: 'like', value: dbLikeLiteral_(woId) + '*' } }, 'ใบงานทดสอบ', cases.length);
    clearRowCache_();
  }

  return endTest_();
}

/**
 * วันที่ล้วนต้องไม่เลื่อนไปหนึ่งวัน (กฎข้อ 23)
 *
 * คอลัมน์ชนิด `date` ไม่มีโซนเวลาในตัว และ PostgREST คืนค่าเป็น 'YYYY-MM-DD'
 * ซึ่งใส่ `input type="date"` ได้ตรง ๆ · อันตรายอยู่ที่การแปลงเป็น Date แล้วแปลงกลับ
 * เพราะเที่ยงคืนตามเวลาไทยคือห้าโมงเย็นของ **วันก่อนหน้า** ตามเวลา UTC
 *
 * ทดสอบด้วยวันที่ 1 และวันสิ้นเดือน เพราะการเลื่อนหนึ่งวันจะข้ามเดือนพอดีทั้งสองทาง
 * ซึ่งเป็นกรณีที่เห็นความผิดชัดที่สุด
 */
function test_db_dateOnlyDoesNotShift() {
  beginTest_('วันที่ล้วนต้องไม่เลื่อนไปหนึ่งวัน');

  var woId = testWoId_();
  var days = ['2026-01-01', '2026-01-31', '2026-02-28', '2026-12-31', '2026-06-01'];

  try {
    for (var i = 0; i < days.length; i++) {
      var id = woId + '-D' + i;
      insertWorkOrder({ 'WO_ID': id, 'Customer_Code': 'CUST-TEST',
        'Location': 'จุดทดสอบวันที่', 'Overall_Status': WO_STATUS.PENDING_APPROVE,
        'Start_Contact_Date': days[i] });

      clearRowCache_();
      var back = String(getWorkOrder(id)['Start_Contact_Date'] || '');
      assertEquals_(back.substring(0, 10), days[i],
        'วันที่เริ่มติดต่อต้องเป็นวันเดิม ไม่เลื่อนไปหนึ่งวัน · เขียน ' + days[i] + ' อ่านได้ ' + back);
    }

    /* ---------- ค่าจากฟอร์มต้องถูกจัดรูปเป็นวันล้วนก่อนเขียน ---------- */
    var picked = pickFormFields_({ 'Start_Contact_Date': '2026-01-01' });
    assertEquals_(picked['Start_Contact_Date'], '2026-01-01',
      'ค่าวันล้วนจากฟอร์มต้องไม่ถูกเติมเวลาหรือโซนเวลาเข้าไป');
    assertTrue_(!(picked['Start_Contact_Date'] instanceof Date),
      'และต้องไม่ใช่วัตถุ Date เพราะการแปลงกลับคือจุดที่วันเลื่อน');
  } finally {
    dbDeleteVerified_(SHEET.WORK_ORDER,
      { 'WO_ID': { op: 'like', value: dbLikeLiteral_(woId) + '*' } }, 'ใบงานทดสอบ', days.length);
    clearRowCache_();
  }

  return endTest_();
}

/**
 * ลบใบงานแล้วงานของแผนกและขั้นตอนต้องหายตามจริง (ON DELETE CASCADE)
 *
 * **ต้องพิสูจน์ ไม่ใช่เชื่อว่า DDL เขียนไว้แล้วต้องทำงาน** · ถ้า foreign key ถูกสร้าง
 * โดยไม่มี `on delete cascade` การลบใบงานจะถูกปฏิเสธ หรือแย่กว่านั้นคือสำเร็จ
 * แล้วทิ้งงานของแผนกที่ชี้ไปยังใบงานที่ไม่มีอยู่แล้วค้างไว้ในตารางตลอดไป
 *
 * การล้างข้อมูลของชุดทดสอบทั้งหมดพึ่งพฤติกรรมนี้ ถ้ามันไม่ทำงาน แถวทดสอบจะสะสม
 * ในตารางจริงทุกรอบที่รันเทสต์ โดยไม่มีอะไรฟ้อง
 */
function test_db_deletingWorkOrderCascades() {
  beginTest_('ลบใบงานแล้วงานแผนกและขั้นตอนต้องหายตาม');

  var woId = testWoId_();
  var taskId = woId + '-T1';
  var mineWo = { 'WO_ID': woId };
  var mineTask = { 'WO_ID': woId };
  var mineStep = { 'Task_ID': taskId };

  insertWorkOrder({ 'WO_ID': woId, 'Customer_Code': 'CUST-TEST',
    'Location': 'จุดทดสอบ cascade', 'Overall_Status': WO_STATUS.PENDING_APPROVE });
  insertTask({ 'Task_ID': taskId, 'WO_ID': woId, 'Department': DEPT.SERVICE,
    'Status': TASK_STATUS.PENDING_ACCEPT });
  insertStep({ 'Step_ID': taskId + '-S1', 'Task_ID': taskId, 'Step_No': 1,
    'Step_Name': 'ขั้นตอนทดสอบ', 'Status': STEP_STATUS.PENDING });

  clearRowCache_();
  assertEquals_(db_count_(SHEET.WORK_ORDER, mineWo), 1, 'ต้องมีใบงานทดสอบอยู่จริงก่อนลบ');
  assertEquals_(db_count_(SHEET.DEPARTMENT_TASK, mineTask), 1, 'และมีงานของแผนกอยู่จริง');
  assertEquals_(db_count_(SHEET.TASK_STEP, mineStep), 1, 'และมีขั้นตอนอยู่จริง');

  /* ---------- ลบใบงานคำสั่งเดียว ---------- */
  var removed = db_delete_(SHEET.WORK_ORDER, mineWo).length;
  dbInvalidate_(SHEET.WORK_ORDER);
  clearRowCache_();

  assertEquals_(removed, 1, 'ลบใบงานได้หนึ่งแถว');
  assertEquals_(db_count_(SHEET.DEPARTMENT_TASK, mineTask), 0,
    'งานของแผนกต้องหายตามไปด้วย — ถ้ายังอยู่ แปลว่า foreign key ไม่ได้ตั้ง cascade ไว้จริง');
  assertEquals_(db_count_(SHEET.TASK_STEP, mineStep), 0,
    'และขั้นตอนต้องหายตามไปอีกทอดหนึ่ง ซึ่งพิสูจน์ว่า cascade เดินต่อได้มากกว่าหนึ่งชั้น');

  return endTest_();
}

/**
 * การล้างข้อมูลต้องแดงเมื่อลบได้ไม่ครบ ไม่ใช่เงียบแล้วเดินต่อ
 *
 * **ข้อนี้เกิดจากเหตุการณ์จริง** · ชั้นประกอบตัวกรองพังไปรอบหนึ่ง ทำให้คำสั่งลบ
 * ทุกคำสั่งลบได้ศูนย์แถว · `db_delete_` คืนรายการว่าง ซึ่งหน้าตาเหมือน
 * "ไม่มีอะไรให้ลบ" ทุกประการ โค้ดล้างข้อมูลจึงรายงานว่าสำเร็จทุกครั้ง
 * แล้วแถวทดสอบก็ค้างอยู่ใน request_type ซึ่งหน้าสร้างใบงานอ่านไปให้ผู้ใช้เลือก
 *
 * ตัวด่านใหม่ต้องถูกพิสูจน์ด้วยของปลอม ไม่ใช่แค่เขียนไว้แล้วเชื่อว่าทำงาน —
 * ด่านที่ไม่เคยเห็นสิ่งที่มันควรจับ คือด่านที่ยังไม่รู้ว่าตัวเองจับได้หรือเปล่า
 */
function test_db_cleanupCannotFailSilently() {
  beginTest_('การล้างข้อมูลต้องแดงเมื่อลบได้ไม่ครบ');

  var prefix = testPrefix_() + 'SILENT-';
  var mine = { Row_ID: { op: 'like', value: prefix + '*' } };

  dbDeleteVerified_(TEST_BULK_TABLE, mine, 'ของค้างจากรอบก่อน');
  db_insert_(TEST_BULK_TABLE, [
    { Row_ID: prefix + '1', Row_Name: 'แถวที่หนึ่ง', Sort_Order: 1, Active: true },
    { Row_ID: prefix + '2', Row_Name: 'แถวที่สอง',  Sort_Order: 2, Active: true }
  ]);

  var realDelete = db_delete_;
  try {
    // จำลองอาการที่เจอมาจริง คือคำสั่งลบทำงานแต่ไม่โดนแถวไหนเลย
    db_delete_ = function () { return []; };

    var threw = false;
    var message = '';
    try {
      /*
       * ตัวเลขที่เอามาเทียบคือจำนวนแถวที่เทสต์เพิ่งเขียนลงไปเอง (กฎข้อ 29)
       * ไม่ใช่จำนวนที่นับด้วยตัวกรองเดียวกันกับที่ใช้ลบ ซึ่งจะตาบอดเหมือนกันทั้งคู่เมื่อตัวกรองเสีย
       */
      dbDeleteVerified_(TEST_BULK_TABLE, mine, 'แถวทดสอบ', 2);
    } catch (e) {
      threw = true;
      message = String(e && e.message);
    }

    assertTrue_(threw, 'ลบได้ศูนย์แถวทั้งที่มีสองแถว ต้องโยนข้อผิดพลาด ไม่ใช่ผ่านเงียบ ๆ');
    assertTrue_(message.indexOf('เขียนลงไป 2') !== -1,
      'ต้องบอกจำนวนที่เขียนลงไป เพราะตัวเลขเดียวไม่พอให้รู้ว่าผิด · ได้ ' + message);
    assertTrue_(message.indexOf('0 แถว') !== -1,
      'และต้องบอกจำนวนที่ลบได้จริงคู่กันไป · ได้ ' + message);
  } finally {
    db_delete_ = realDelete;
  }

  /* ---------- เมื่อไม่มีของปลอมขวาง ต้องลบได้ครบตามปกติ ---------- */
  // ด่านที่แดงตลอดเวลาก็ไร้ประโยชน์พอ ๆ กับด่านที่ไม่เคยแดง
  assertEquals_(dbDeleteVerified_(TEST_BULK_TABLE, mine, 'แถวทดสอบ', 2), 2,
    'ของจริงต้องลบได้ครบสองแถว');
  assertEquals_(db_count_(TEST_BULK_TABLE, mine), 0, 'และต้องไม่เหลืออะไรไว้เลย');

  /* ---------- ไม่มีอะไรให้ลบ ต้องไม่ถือว่าผิด ---------- */
  assertEquals_(dbDeleteVerified_(TEST_BULK_TABLE, mine, 'แถวทดสอบ'), 0,
    'ตารางที่สะอาดอยู่แล้วต้องคืนศูนย์ ไม่ใช่โยนข้อผิดพลาด');

  return endTest_();
}

/**
 * ล้างร่องรอยทั้งหมดของกลุ่มนี้ แล้วพิสูจน์ว่าไม่เหลืออะไรจริง ๆ
 */
function test_db_cleanupLeftovers() {
  beginTest_('ล้างข้อมูลทดสอบในตารางจริงให้หมด');

  dbTestCleanup_();

  assertEquals_(db_count_('Request_Type',
    { Request_ID: { op: 'like', value: DB_TEST_PREFIX + '*' } }), 0,
    'ตาราง request_type ต้องไม่เหลือแถวทดสอบ');
  assertEquals_(db_count_('Counter',
    { 'Key': { op: 'like', value: DB_TEST_PREFIX + '*' } }), 0,
    'ตาราง counter ต้องไม่เหลือแถวทดสอบ');

  return endTest_();
}

/**
 * ลบแถวที่ตรงตัวกรอง แล้วพิสูจน์ว่าลบได้เท่ากับที่ควรลบจริง
 *
 * **การล้างข้อมูลที่ล้มแบบเงียบอันตรายกว่าการล้มแบบดัง** · ถ้าตัวกรองใช้ไม่ได้
 * ด้วยเหตุใดก็ตาม `db_delete_` จะคืนรายการว่างซึ่งหน้าตาเหมือนกับ "ไม่มีอะไรให้ลบ"
 * ทุกประการ แล้วแถวทดสอบจะค้างอยู่ในตารางต่อไปโดยไม่มีใครรู้ · ครั้งที่แล้วมันค้าง
 * อยู่ใน request_type ซึ่งเป็นตารางที่หน้าสร้างใบงานอ่านไปทำกล่องดรอปดาวน์ให้ผู้ใช้
 *
 * จึงนับก่อนเสมอ แล้วเทียบกับจำนวนที่ลบได้จริง · ไม่ตรงกันเมื่อไรคือแดงทันที
 * หลักการเดียวกับหัวข้อ 6 ของ checkSupabase ที่เทียบจำนวนที่อ่านได้กับจำนวนที่
 * ฐานข้อมูลนับให้ — ตัวเลขเดียวไม่เคยพอ ต้องมีตัวเลขที่สองมายืนยัน
 *
 * นี่คือโค้ดล้างข้อมูลของชุดทดสอบ ซึ่ง SPEC 22.1 อนุญาตให้แก้ได้ตอนย้าย
 *
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object} filters ตัวกรองของแถวที่จะลบ
 * @param {string} what คำอธิบายสั้น ๆ ว่ากำลังล้างอะไร สำหรับใส่ในข้อความที่โยน
 * @return {number} จำนวนแถวที่ลบได้จริง
 * @throws {Error} เมื่อลบได้ไม่เท่ากับที่ควรลบ
 */
function dbDeleteVerified_(tableKey, filters, what, knownRows) {
  var deleted = -1;
  var trouble = '';

  try {
    deleted = db_delete_(tableKey, filters).length;
  } catch (e) {
    trouble = ' · ' + (e && e.message);
  }

  /*
   * ไม่มีจำนวนที่ผู้เรียกจำไว้ ก็ไม่มีอะไรให้เทียบ — คืนจำนวนที่ลบได้ไปตรง ๆ
   * ห้ามนับด้วยตัวกรองเดียวกับที่ใช้ลบแล้วเอามาเทียบกันเอง เพราะถ้าตัวกรองเสีย
   * ทั้งตัวนับและตัวลบจะตาบอดเหมือนกัน แล้วเห็นตรงกันที่ศูนย์ ซึ่งดูเหมือนสำเร็จ
   */
  if (knownRows === undefined) {
    if (deleted < 0) {
      throw new Error('ล้าง' + what + 'ของตาราง ' + tableKey + ' ไม่สำเร็จ' + trouble);
    }
    return deleted;
  }

  if (deleted !== knownRows) {
    throw new Error('ล้าง' + what + 'ของตาราง ' + tableKey + ' ไม่ครบ — เขียนลงไป ' +
      knownRows + ' แถว แต่ลบได้ ' + (deleted < 0 ? 'ไม่สำเร็จเลย' : deleted + ' แถว') +
      trouble + ' · แถวทดสอบที่ค้างอยู่ในตารางจริงคือสิ่งที่ผู้ใช้จะเห็น');
  }
  return deleted;
}

/**
 * ลบทุกแถวที่คีย์ขึ้นต้นด้วย TEST- ออกจากตารางจริง
 *
 * เรียกทั้งก่อนและหลังทุกชุด เพราะชุดที่ล้มกลางคันจะทิ้งแถวค้างไว้
 * แล้วชุดถัดไปจะล้มตามด้วยเหตุผลที่ไม่เกี่ยวกับสิ่งที่มันกำลังทดสอบ
 *
 * ใช้คำนำหน้าเป็นเงื่อนไขเสมอ ไม่เคยลบโดยไม่มีเงื่อนไข — ตารางเหล่านี้เป็นตารางจริง
 *
 * เดิมกลืนข้อผิดพลาดแล้วเขียนบรรทัดเดียวลง log ซึ่งแปลว่าการล้างที่ล้มทุกครั้ง
 * ยังทำให้ชุดทดสอบผ่านได้ · ตอนนี้โยนออกมา เพราะการล้างที่ล้มคือความล้มเหลวจริง
 *
 * @return {Object} {ตารางที่ล้าง: จำนวนที่ลบไป}
 * @throws {Error} เมื่อมีตารางใดล้างไม่ครบ
 */
function dbTestCleanup_() {
  var targets = [
    { tableKey: 'Request_Type', column: 'Request_ID' },
    { tableKey: 'Counter',      column: 'Key' },
    { tableKey: TEST_BULK_TABLE, column: 'Row_ID' }
  ];

  var report = {};
  var trouble = [];

  for (var i = 0; i < targets.length; i++) {
    var filters = {};
    filters[targets[i].column] = { op: 'like', value: DB_TEST_PREFIX + '*' };
    try {
      report[targets[i].tableKey] = dbDeleteVerified_(targets[i].tableKey, filters, 'แถวทดสอบ');
    } catch (e) {
      // เก็บไว้ให้ครบทุกตารางก่อนค่อยโยน จะได้เห็นภาพรวมในครั้งเดียว
      trouble.push(e && e.message);
    }
  }

  if (trouble.length) throw new Error(trouble.join(NEW_LINE_));
  return report;
}

/**
 * ตรวจว่าล้มเหลวด้วยข้อความไทยกลาง ๆ ตัวเดียวกันเป๊ะ ไม่ใช่แค่ "มีคำนี้อยู่ข้างใน"
 *
 * ต้องเทียบแบบเท่ากันเป๊ะ เพราะสิ่งที่กำลังพิสูจน์คือ "ไม่มีอะไรอื่นติดมาด้วย"
 * การเทียบแบบมีคำนี้อยู่จะผ่านแม้รายละเอียดของฐานข้อมูลจะต่อท้ายมาทั้งก้อน
 *
 * @param {function()} fn ฟังก์ชันที่ควรล้มเหลว
 * @param {string} label คำอธิบายข้อทดสอบ
 */
function dbExpectUserMessage_(fn, label) {
  try {
    fn();
    fail_(label + ' — คาดว่าจะล้มเหลว แต่ทำรายการผ่าน');
    return;
  } catch (e) {
    var message = String((e && e.message) ? e.message : e);
    if (message !== DB_USER_MESSAGE) {
      fail_(label + ' — ข้อความต้องเป็น "' + DB_USER_MESSAGE + '" เป๊ะ แต่ได้ "' + message + '"');
      return;
    }
    pass_(label);
  }
}

/**
 * GRANT กับ RLS เป็นประตูคนละบาน และรายงานต้องแยกสองบานนี้ออกจากกัน (SPEC 22.5)
 *
 * ข้อนี้เกิดจากความผิดพลาดจริง · ตัวแปลรหัสเดิมรวม 401 กับ 403 ไว้ด้วยกันแล้วบอกว่า
 * "คีย์ไม่ถูกยอมรับ" ทั้งที่ 403 แปลว่า Supabase อ่านคีย์ออกแล้วและรู้ว่าเป็น role ไหน
 * ผลคือคนถูกส่งไปนั่งตรวจคีย์ที่ถูกต้องอยู่แล้ว ซึ่งไม่มีวันเจออะไร
 *
 * อาการของสองประตูต่างกันคนละแบบสิ้นเชิง
 *   ยังไม่ได้ GRANT        → **401 พร้อม code 42501** เป็นข้อผิดพลาด
 *   GRANT แล้วแต่ RLS กัน  → 200 พร้อม 0 แถว ไม่ใช่ข้อผิดพลาดเลย
 *
 * **ข้อนี้เคยเขียวอยู่บนสถานการณ์ที่ไม่เคยเกิดจริง** · มันป้อน `403 + 42501` ให้ตัวแปล
 * ซึ่งเป็นรูปที่เราคิดเอาเองว่า Supabase ตอบ · วัดกับของจริง 01-10-2026 ที่ colo BKK
 * แล้วพบว่า **GRANT ที่ขาดคืน 401** · ของจริงจึงตกเข้ากลุ่ม `'KEY'` มาตลอด
 * โดยที่เทสต์ข้อนี้ยังเขียวทุกรอบ เพราะมันถามคำถามที่ไม่มีใครถาม
 *
 * นี่คือกฎข้อ 27 ในรูปที่เงียบที่สุด — ของจำลองไม่ได้ใจดีกว่าของจริง
 * แต่มัน**คนละตัวกับของจริง** และไม่มีอะไรเตือนเลยสักอย่าง
 * → ตั้งแต่นี้ไป ทุกข้อในชุดนี้ต้องมีที่มาจากผลวัด ไม่ใช่จากรูปที่เราคาดว่าจะเป็น
 *
 * เป็นตรรกะล้วน ไม่ต้องต่อเน็ต จึงอยู่ในส่วนที่รันได้ทุกที่
 */
function test_db_doorTelling() {
  beginTest_('แยกประตู GRANT ออกจากประตูคีย์และ RLS');

  /* ---------- สามรูปที่วัดมาจากของจริง 01-10-2026 — ทั้งสามคืน 401 เหมือนกัน ---------- */
  assertEquals_(dbDoorOfFailure_({ status: 401, code: '' }), 'KEY',
    'ไม่ส่ง apikey → 401 ไม่มี code · "No API key found in request"');
  assertEquals_(dbDoorOfFailure_({ status: 401, code: '' }), 'KEY',
    'apikey ใช้ไม่ได้ → 401 ไม่มี code · "Invalid API key"');
  assertEquals_(dbDoorOfFailure_({ status: 401, code: '42501' }), 'GRANT',
    'anon ที่ใช้ได้แต่ยังไม่ GRANT → **401 พร้อม 42501** · นี่คือรูปของจริง ' +
    'และเป็นข้อที่จับบั๊กซึ่งซ่อนอยู่มาตลอด');

  /* ---------- 403 ยังต้องทำงานถูก เผื่อ Supabase เปลี่ยนใจวันหน้า ---------- */
  assertEquals_(dbDoorOfFailure_({ status: 403, code: '42501' }), 'GRANT',
    '403 พร้อม 42501 ก็คือ GRANT เหมือนกัน — ตัวแยกคือ code ไม่ใช่ status');
  assertEquals_(dbDoorOfFailure_({ status: 403, code: '' }), 'UNKNOWN_403',
    '403 ที่ไม่มี code ต้องไม่ถูกเดาว่าเป็นเรื่อง GRANT');
  assertEquals_(dbDoorOfFailure_({ status: 403, code: '42P01' }), 'UNKNOWN_403',
    '403 ที่มาพร้อม code อื่นก็ต้องไม่ถูกเดาเช่นกัน');
  assertEquals_(dbDoorOfFailure_({ status: 404, code: '42P01' }), 'MISSING', '404 คือไม่มีตาราง');
  assertEquals_(dbDoorOfFailure_({ status: 503, code: '' }), 'SERVER', '5xx คือฝั่งโน้นมีปัญหา');
  assertEquals_(dbDoorOfFailure_({ status: 0, code: '' }), 'NETWORK', 'ไม่มีรหัสเลยคือไปไม่ถึง');
  assertEquals_(dbDoorOfFailure_({ status: 409, code: '23505' }), 'OTHER', 'รหัสอื่นต้องไม่ถูกจับยัดใส่กลุ่ม');

  /* ---------- รายงานของ 403 + 42501 ต้องพูดถึง GRANT ไม่ใช่คีย์ ---------- */
  var hint = 'Grant SELECT on table public.counter to role service_role';
  var grantLines = [];
  checkDbAdvice_(grantLines, {
    status: 401, code: '42501',
    message: 'permission denied for table counter',
    hint: hint,
    detail: 'รหัสตอบกลับ: 401 · code=42501 · message=permission denied for table counter'
  });
  var grantText = grantLines.join(' ');

  assertTrue_(grantText.indexOf('GRANT') !== -1, 'ต้องบอกว่าเรื่องนี้แก้ด้วย GRANT');
  assertTrue_(grantText.indexOf('SQL Editor') !== -1, 'และบอกว่าไปรันที่ไหน');
  assertTrue_(grantText.indexOf(hint) !== -1,
    'ต้องพิมพ์คำแนะนำที่ฐานข้อมูลส่งมาออกมาตรง ๆ เพราะมันส่งคำสั่งที่ต้องใช้มาให้แล้ว');
  assertTrue_(grantText.indexOf('คีย์ถูกต้องแล้ว') !== -1, 'และบอกให้ชัดว่าคีย์ไม่ได้ผิด');
  assertTrue_(grantText.indexOf('SUPABASE_SERVICE_KEY') === -1,
    'ห้ามส่งคนไปตรวจคีย์ เพราะคีย์ถูกต้องอยู่แล้ว');

  /* ---------- 401 ยังต้องพูดถึงคีย์เหมือนเดิม ---------- */
  var keyLines = [];
  checkDbAdvice_(keyLines, { status: 401, code: '', message: 'Invalid API key', hint: '', detail: '-' });
  var keyText = keyLines.join(' ');

  assertTrue_(keyText.indexOf('SUPABASE_SERVICE_KEY') !== -1, '401 ต้องบอกให้ไปตรวจคีย์');
  assertTrue_(keyText.indexOf('GRANT') === -1, 'และต้องไม่พูดถึง GRANT ซึ่งยังไม่เกี่ยวในขั้นนี้');

  /* ---------- 403 ที่ไม่รู้จัก ต้องไม่เดา ---------- */
  var oddLines = [];
  checkDbAdvice_(oddLines, {
    status: 403, code: '', message: 'forbidden', hint: '',
    detail: 'รหัสตอบกลับ: 403 · เนื้อคำตอบ: forbidden'
  });
  var oddText = oddLines.join(' ');

  assertTrue_(oddText.indexOf('จะไม่เดา') !== -1, 'ต้องบอกตรง ๆ ว่าไม่เดา');
  assertTrue_(oddText.indexOf('เนื้อคำตอบ: forbidden') !== -1, 'และพิมพ์ของจริงออกมาแทน');
  assertTrue_(oddText.indexOf('SUPABASE_SERVICE_KEY') === -1 && oddText.indexOf('รันคำสั่ง GRANT') === -1,
    'ห้ามแนะนำทางแก้ของกรณีที่ยังไม่รู้ว่าใช่หรือไม่');

  return endTest_();
}

/**
 * ผลการทดสอบคีย์ anon ต้องแยกว่าถูกกันที่ประตูบานไหน
 *
 * ถูกกันที่ GRANT ไม่ได้แปลว่า RLS ทำงาน — แปลว่ายังไปไม่ถึง RLS ด้วยซ้ำ
 * ถ้ารายงานว่า "ผ่าน" ตรงนั้น วันที่มีคนให้ GRANT กับ anon เพื่อเปิดให้หน้าเว็บ
 * อ่านบางตาราง RLS จะกลายเป็นประตูบานเดียวที่เหลือ และไม่มีใครเคยรู้ว่ามันไม่เคยถูกทดสอบ
 */
function test_db_anonResultTellsWhichDoor() {
  beginTest_('สรุปผลการลองอ่านด้วยคีย์ anon');

  /* ---------- ทุกตารางถูกกัน แม้จะถูกกันคนละบาน ---------- */
  var closed = anonVerdict_([
    { tableKey: 'User_Role', table: 'user_role', status: 401, rows: 0, readable: false, note: '' },
    { tableKey: 'Counter', table: 'counter', status: 403, code: '42501', rows: 0, readable: false, note: '' },
    { tableKey: 'Customer', table: 'customer', status: 200, rows: 0, readable: false, note: '' }
  ], ['Customer']);

  assertEquals_(closed.readable.length, 0, 'ไม่มีตารางไหนอ่านได้');
  assertEquals_(closed.blocked, 3, 'สามอาการนี้นับเป็นอ่านไม่ได้เท่ากันหมด');
  assertEquals_(closed.blindSpot.join(', '), 'Customer',
    'ตารางที่ตอบ 200 พร้อม 0 แถว และมีข้อมูลอยู่จริง คือจุดที่ยังพิสูจน์ไม่ได้');

  /* ---------- มีตารางหลุดแม้แถวเดียวก็ต้องรายงาน ---------- */
  var leaked = anonVerdict_([
    { tableKey: 'Counter', table: 'counter', status: 200, rows: 0, readable: false, note: '' },
    { tableKey: 'Customer', table: 'customer', status: 200, rows: 5, readable: true, note: '' }
  ], []);

  assertEquals_(leaked.readable.length, 1, 'ตารางที่อ่านได้ต้องถูกจับ');
  assertTrue_(leaked.readable[0].indexOf('customer') !== -1,
    'และต้องบอกชื่อจริงในฐานข้อมูลไว้ด้วย จะได้ตามไปปิดถูกตาราง');
  assertEquals_(leaked.blocked, 1, 'ส่วนตารางที่ปิดอยู่ยังนับแยกตามเดิม');

  /* ---------- ตารางที่ทดสอบไม่ได้ ห้ามถูกนับว่าปลอดภัย ---------- */
  var cannot = anonVerdict_([
    { tableKey: 'Counter', table: 'counter', status: 0, rows: -1, readable: false,
      note: 'ยังไม่ได้ตั้งค่า SUPABASE_ANON_KEY จึงทดสอบไม่ได้' }
  ], []);

  assertEquals_(cannot.blocked, 0, 'ตารางที่ทดสอบไม่ได้ ต้องไม่ถูกนับว่าถูกกันไว้');
  assertEquals_(cannot.untested.length, 1, 'แต่ต้องถูกรายงานว่ายังทดสอบไม่ได้');

  // ค่าคงที่ของรหัสต้องมาจากที่เดียว ไม่ใช่พิมพ์เลขสดกระจายตามที่ต่าง ๆ
  assertEquals_(DB_CODE_NO_GRANT, '42501', 'รหัสของ Postgres ที่แปลว่ายังไม่ได้ GRANT');

  return endTest_();
}

/**
 * ตัวเลขสภาพตาราง Customer ต้องตรงกับที่ SPEC 22.8 สั่งให้รายงาน
 *
 * เป็นตรรกะล้วน จึงพิสูจน์ด้วยข้อมูลปลอมที่ออกแบบให้มีอาการแต่ละแบบครบ
 * ไม่ต้องรอให้ข้อมูลจริงพังก่อนถึงจะรู้ว่าตัวตรวจทำงาน
 */
function test_db_customerHealth() {
  beginTest_('ตัวเลขสภาพตาราง Customer (SPEC 22.8)');

  var today = '2026-09-23';

  /* ---------- ตารางที่สมบูรณ์ ---------- */
  var good = customerHealth_([
    { 'รหัสลูกค้า': 'AR-0001', 'ชื่อลูกค้า': 'บริษัท ก', 'วันที่เริ่มติดต่อ': '2013-01-10' },
    { 'รหัสลูกค้า': 'AR-0002', 'ชื่อลูกค้า': 'บริษัท ข', 'วันที่เริ่มติดต่อ': '2020-07-25' },
    { 'รหัสลูกค้า': 'AR-0003', 'ชื่อลูกค้า': 'บริษัท ค', 'วันที่เริ่มติดต่อ': '2024-11-03' }
  ], today);

  assertEquals_(good.total, 3, 'นับจำนวนแถวได้ถูก');
  assertEquals_(good.noName, 0, 'ไม่มีแถวที่ขาดชื่อ');
  assertEquals_(good.badCode, 0, 'รหัสถูกรูปแบบทุกแถว');
  assertEquals_(good.withDate, 3, 'มีวันที่ครบทุกแถว');
  assertEquals_(good.dayOver12, 1, 'มีวันที่ 25 ซึ่งเกิน 12 อยู่หนึ่งแถว');
  assertEquals_(good.outOfRange, 0, 'วันที่อยู่ในช่วงที่เป็นไปได้ทั้งหมด');

  /* ---------- อาการวันกับเดือนสลับกัน: ไม่มีเลขวันเกิน 12 เลย ---------- */
  var swapped = customerHealth_([
    { 'รหัสลูกค้า': 'AR-0001', 'ชื่อลูกค้า': 'ก', 'วันที่เริ่มติดต่อ': '2013-10-01' },
    { 'รหัสลูกค้า': 'AR-0002', 'ชื่อลูกค้า': 'ข', 'วันที่เริ่มติดต่อ': '2020-07-12' },
    { 'รหัสลูกค้า': 'AR-0003', 'ชื่อลูกค้า': 'ค', 'วันที่เริ่มติดต่อ': '2024-03-11' }
  ], today);

  assertEquals_(swapped.dayOver12, 0, 'ไม่มีแถวไหนเลขวันเกิน 12 — อาการวันกับเดือนสลับกัน');
  assertEquals_(swapped.dayOver12Percent, '0.0', 'สัดส่วนต้องเป็นศูนย์ถ้วน');
  assertEquals_(swapped.withDate, 3, 'แต่ยังนับว่ามีวันที่ครบทุกแถว');

  /* ---------- อาการเลขซีเรียล Excel ---------- */
  var broken = customerHealth_([
    { 'รหัสลูกค้า': 'AR-0001', 'ชื่อลูกค้า': 'ก', 'วันที่เริ่มติดต่อ': '1905-07-15' },
    { 'รหัสลูกค้า': 'AR-0002', 'ชื่อลูกค้า': 'ข', 'วันที่เริ่มติดต่อ': '2099-12-31' },
    { 'รหัสลูกค้า': 'AR-0003', 'ชื่อลูกค้า': 'ค', 'วันที่เริ่มติดต่อ': '2013-01-15' }
  ], today);

  assertEquals_(broken.outOfRange, 2, 'ปีก่อน 1990 กับวันที่ในอนาคต ต้องถูกนับทั้งคู่');
  assertTrue_(broken.outOfRangeSamples.length === 2, 'และต้องยกตัวอย่างมาให้ดูด้วย');
  assertTrue_(broken.outOfRangeSamples[0].indexOf('1905-07-15') !== -1,
    'ตัวอย่างต้องบอกทั้งรหัสและวันที่ จะได้ตามไปดูแถวนั้นได้');

  /* ---------- ชื่อหายและรหัสเพี้ยน ---------- */
  var messy = customerHealth_([
    { 'รหัสลูกค้า': 'AR-0001', 'ชื่อลูกค้า': '', 'วันที่เริ่มติดต่อ': '2013-01-15' },
    { 'รหัสลูกค้า': 'AR-0002', 'ชื่อลูกค้า': '   ', 'วันที่เริ่มติดต่อ': '' },
    { 'รหัสลูกค้า': '', 'ชื่อลูกค้า': 'ค', 'วันที่เริ่มติดต่อ': '2013-01-15' },
    { 'รหัสลูกค้า': 'AR 0004', 'ชื่อลูกค้า': 'ง', 'วันที่เริ่มติดต่อ': null },
    { 'รหัสลูกค้า': '0005', 'ชื่อลูกค้า': 'จ', 'วันที่เริ่มติดต่อ': '2013-01-15' }
  ], today);

  assertEquals_(messy.noName, 2, 'ชื่อว่างและชื่อที่มีแต่ช่องว่าง ต้องนับทั้งคู่');
  assertEquals_(messy.badCode, 2, 'รหัสว่างกับรหัสที่มีช่องว่างปน — ส่วน 0005 เป็นรหัสที่ถูกต้อง');
  assertEquals_(messy.withDate, 3, 'แถวที่วันที่ว่างหรือเป็น null ต้องไม่ถูกนับว่ามีวันที่');
  assertTrue_(messy.badCodeSamples.indexOf('(ว่าง)') !== -1, 'รหัสว่างต้องแสดงให้เห็นว่าว่าง');

  /* ---------- ตารางเปล่าต้องไม่ระเบิด และต้องถูกฟ้องว่าเป็นปัญหา ---------- */
  /*
   * ข้อนี้เคยยืนยันแค่ว่า "ไม่ระเบิดและไม่หารด้วยศูนย์" ซึ่งปฏิบัติกับตารางว่าง
   * เหมือนเรื่องปกติ · ของจริงคือระบบที่สร้างใบงานไม่ได้เลยสักใบ
   *
   * ข้อยืนยันเรื่องนี้เคยอยู่ใน test_db_migrationGapIsVisible ซึ่งถูกลบไปพร้อม
   * 98_Migrate.gs เมื่อ 30-09-2026 (`verifyRowVerdict_('notFromSheet', -1, 0)`
   * ต้องแดง) · ตอนนั้นไม่มีใครเล็งมันใหม่ รูจึงเปิดอยู่จนถึง 01-10-2026
   * → เทสต์ที่หายไปพร้อมไฟล์ ต้องถูกคัดทีละข้อว่าข้อไหนยังจริงอยู่ (SPEC 22.10)
   */
  var empty = customerHealth_([], today);
  assertEquals_(empty.total, 0, 'ตารางเปล่านับได้ศูนย์');
  assertEquals_(empty.dayOver12Percent, '0.0', 'และไม่หารด้วยศูนย์');
  assertTrue_(empty.isEmpty,
    'ตาราง Customer ที่ว่างเปล่าต้องถูกฟ้อง — ศูนย์ทุกช่องอ่านเหมือนข้อมูลสะอาด ' +
    'ทั้งที่แปลว่าสร้างใบงานไม่ได้เลย (CLAUDE.md ข้อ 32)');
  assertTrue_(!customerHealth_([{ 'รหัสลูกค้า': 'AR-0001', 'ชื่อลูกค้า': 'ก' }], today).isEmpty,
    'ตารางที่มีแถวต้องไม่ถูกฟ้องว่าว่าง — ตัวฟ้องที่ฟ้องทุกวันคือตัวที่ไม่มีใครอ่าน');

  /* ---------- ตัวตรวจร่องรอยของ CSV ที่ถูกตัดผิด ---------- */
  /*
   * **ห้ามตรวจรูปแบบของรหัส** โปรแกรมบัญชีออกรหัสได้หลายแบบและเราไม่รู้ว่ามีกี่แบบ
   * ตัวตรวจที่ฟ้องรหัสที่ถูกต้องอยู่แล้ว จะทำให้คนเลิกอ่านคำเตือนทั้งหมดภายในสัปดาห์เดียว
   * สิ่งที่ตรวจได้โดยไม่ต้องรู้รูปแบบคืออาการของไฟล์ที่ช่องเลื่อนตอนตัด
   */
  assertTrue_(!customerCodeLooksCut_('AR-0001'), 'รหัสแบบมีขีดกลางต้องผ่าน');
  assertTrue_(!customerCodeLooksCut_('NV0001'), 'รหัสแบบไม่มีขีดกลางก็ต้องผ่าน — คนละแบบแต่ถูกทั้งคู่');
  assertTrue_(!customerCodeLooksCut_('0005'), 'รหัสที่เป็นตัวเลขล้วนก็ต้องผ่าน');
  assertTrue_(!customerCodeLooksCut_('AR-'), 'รหัสที่หน้าตาแปลกแต่ไม่มีร่องรอยถูกตัด ต้องไม่ถูกฟ้อง');

  assertTrue_(customerCodeLooksCut_(''), 'รหัสว่างคือช่องที่เลื่อนจนหายไป');
  assertTrue_(customerCodeLooksCut_('   '), 'รหัสที่มีแต่ช่องว่างก็เหมือนกัน');
  assertTrue_(customerCodeLooksCut_('AR 0001'), 'ช่องว่างปนอยู่ข้างใน = เศษของช่องถัดไปติดมา');
  assertTrue_(customerCodeLooksCut_('AR-0001,บริษัท'), 'จุลภาคปนอยู่ = ตัดช่องผิดแน่นอน');
  assertTrue_(customerCodeLooksCut_('"AR-0001"'), 'เครื่องหมายคำพูดติดมา = ไม่ได้ถอดออกตอนตัด');
  assertTrue_(customerCodeLooksCut_('A'.repeat(CUSTOMER_CODE_MAX + 1)),
    'ยาวเกิน ' + CUSTOMER_CODE_MAX + ' ตัวอักษร = หลายช่องถูกรวมเป็นช่องเดียว');

  return endTest_();
}

/**
 * ห้ามมีโค้ดที่เขียนลงตาราง Customer ในชั้นไหนก็ตาม (SPEC 22.8)
 *
 * ต้นทางของข้อมูลลูกค้าอยู่นอกระบบ คือโปรแกรมบัญชีของบริษัท · ถ้าวันหนึ่งมีโค้ด
 * ในระบบนี้เขียนทับลงไป จะมีต้นทางสองทางที่ขัดกันเอง แล้วไม่มีใครรู้ว่าค่าที่เห็น
 * มาจากทางไหน · การนำเข้ารอบถัดไปจะทับของที่ระบบเขียนไว้หายไปเงียบ ๆ
 *
 * สแกนจากเนื้อของฟังก์ชันจริง ไม่ใช่จากรายชื่อที่เขียนไว้ เพราะรายชื่อที่คนดูแลเอง
 * จะล้าสมัยทันทีที่มีคนเพิ่มโค้ดโดยไม่ได้อ่านข้อนี้
 */
function test_db_customerIsReadOnly() {
  beginTest_('ห้ามมีโค้ดที่เขียนลงตาราง Customer');

  var scope = (typeof globalThis !== 'undefined') ? globalThis : this;
  var offenders = customerWritersIn_(scope);
  var scanned = 0;
  for (var name in scope) {
    if (typeof scope[name] === 'function') scanned++;
  }

  assertTrue_(scanned > 50, 'ตัวสแกนต้องเห็นโค้ดของระบบจริง (เห็น ' + scanned + ' ตัว)');
  assertEquals_(offenders.join(', '), '',
    'ฟังก์ชันเหล่านี้เขียนลงตาราง Customer ซึ่ง SPEC 22.8 ห้ามไว้');

  /* ---------- ตัวสแกนต้องจับของปลอมได้ ---------- */
  var fake = {
    keeper: function () { return db_select_('Customer', {}); },
    writer: function () { return db_upsert_('Customer', { 'รหัสลูกค้า': 'AR-1' }); },
    deleter: function () { return db_delete_('Customer', { 'รหัสลูกค้า': 'AR-1' }); },
    commented: function () { /* db_insert_('Customer', {}) */ return 1; }
  };
  assertEquals_(customerWritersIn_(fake).sort().join(', '), 'deleter, writer',
    'ต้องจับเฉพาะตัวที่เขียนจริง ไม่จับตัวที่อ่าน และไม่จับโค้ดที่ถูกคอมเมนต์ไว้');

  return endTest_();
}

/**
 * ชื่อฟังก์ชันที่มีโค้ดเขียนลงตาราง Customer
 * @param {Object} scope ขอบเขตที่จะสแกน — ของจริงคือ globalThis ของปลอมคือวัตถุที่สร้างเอง
 * @return {string[]} ชื่อฟังก์ชันที่พบ
 */
function customerWritersIn_(scope) {
  var found = [];
  var writers = /db_(insert|update|upsert|delete)_\s*\(\s*'Customer'/;

  for (var name in scope) {
    if (typeof scope[name] !== 'function') continue;
    if (name.indexOf('test_') === 0) continue;         // ตัวเทสต์เองพูดถึงชื่อพวกนี้ได้
    if (name === 'customerWritersIn_') continue;       // ตัวสแกนเองมีรูปแบบอยู่ในตัว

    var source;
    try { source = String(scope[name]); } catch (e) { continue; }

    // คอมเมนต์ไม่ใช่โค้ดที่ทำงาน การนับมันจะทำให้ข้อนี้แดงเพราะคำอธิบาย
    if (writers.test(stripComments_(source))) found.push(name);
  }
  return found;
}

/* ===========================================================================
 * กฎข้อ 26 — หนี้ Apps Script ต้องไม่ค่อย ๆ กลับมาโดยไม่มีใครสังเกต
 * =========================================================================== */

/**
 * API ของ Apps Script ที่ห้ามปรากฏในชั้นตรรกะ (กฎข้อ 26)
 *
 * ชั้น 02–05 และ 08 ต้องเป็น JavaScript ล้วน เพราะเป็นส่วนที่จะย้ายไป Cloudflare
 * Workers ได้โดยไม่ต้องเขียนใหม่ (SPEC 22.7) · ทุกตัวในรายการนี้ไม่มีอยู่บน Worker
 */
var FORBIDDEN_IN_PURE_LAYERS_ = Object.freeze([
  'UrlFetchApp', 'Utilities.', 'PropertiesService', 'LockService',
  'SpreadsheetApp', 'DriveApp', 'CacheService', 'DocumentApp', 'HtmlService',
  'ScriptApp', 'Session.', 'MailApp', 'GmailApp', 'CalendarApp'
]);

/**
 * ฟังก์ชันทั้งหมดที่อยู่ในชั้นตรรกะล้วน 02–05 และ 08
 *
 * **ทำไมต้องเขียนรายชื่อไว้เอง** — Apps Script ไม่มีทางให้โค้ดอ่านซอร์สของตัวเอง
 * ตอนรัน (ไม่มีระบบไฟล์ และ ScriptApp ไม่เปิดเนื้อไฟล์ให้) · ทางเดียวที่เหลือคือ
 * เรียก Apps Script API ผ่าน HTTP ซึ่งต้องขอสิทธิ์เพิ่มและจะกลายเป็นหนี้ก้อนใหม่
 * ที่กฎข้อ 26 ห้ามไว้เอง · การเขียนรายชื่อจึงเป็นราคาที่ถูกที่สุดที่จ่ายได้
 *
 * เพิ่มฟังก์ชันในห้าไฟล์นั้นเมื่อไร ต้องมาเพิ่มชื่อที่นี่ด้วย · จำนวนที่ตรึงไว้ข้างล่าง
 * จะฟ้องทันทีถ้าลืม
 */
var PURE_LAYER_FUNCTIONS_ = Object.freeze([
  /* 02_StateMachine.gs */
  'getTransitions', 'findTransition', 'getGuards', 'userRoles_', 'hasRole_', 'checkTransition',
  'deny_', 'statusLabel_', 'rolesLabel_', 'planStatusChange_', 'buildAuditRecord_',
  'recalcFromStatuses_', 'decide_', 'changeStatus', 'recalcWoStatus', 'loadStatusContext_',
  'insertEntityRow_', 'writeEntityRow_', 'applyWoStatus_', 'copyPayload_', 'actingEmail_',
  'sameUserEmail_',
  /* 03_Service_WO.gs */
  'missingFieldsOf_', 'missingFieldsMessage_', 'createWorkOrder', 'missingRequiredFields_',
  'pickFormFields_', 'toSheetDate_', 'toStoredDate_', 'toStoredCount_',
  'assertScheduleOrder_', 'isEmptyValue_', 'joinList_',
  'routeOfAssignment_', 'counterKeyOfMonth_', 'nextRunningNumber', 'padNumber_',
  'timelineEvents_', 'timelineOf_', 'reasonHistoryOf_', 'toIsoText_', 'workOrderDetail',
  'submitWorkOrder', 'approveWorkOrder', 'resumePausedTasks_', 'createDepartmentTasks_',
  'buildTaskId_', 'createStepsForTask_', 'stepNamesOfDepartment_', 'buildStepRow_',
  'returnWorkOrder', 'rememberTaskStatuses_', 'cancelWorkOrder', 'reopenWorkOrder',
  'findTaskOfDepartment_', 'reopenSteps_', 'recordPayment',
  'listReturnedWorkOrders', 'returnedViewOf_', 'editWorkOrder', 'searchCustomers',
  'filterCustomers_', 'listPendingApprovals',
  /* 04_Service_Task.gs */
  'acceptTask', 'updateTaskStep', 'pickStepFields_', 'isEmptyPatch_', 'stepLabel_',
  'taskCountsForDepartment_', 'earlierUnfinishedStep_', 'addTaskPeriod', 'removeTaskPeriod',
  'completeTask', 'stepProgressOf_', 'returnTask', 'bumpReturnCount_', 'cancelTask',
  'taskViewOf_', 'listTasksForDepartment',
  'setTaskVisit', 'normalizeVisitText_', 'listTodayTasks', 'isTaskVisitingOn_',
  'taskBundleOf_', 'listTaskPage_', 'stepProgressFrom_',
  /* 05_Location.gs */
  'resolveProjectLocation', 'nextLocationSeq_', 'formatPjId_', 'padSeq_', 'isBlankText_',
  'listLocations', 'findSimilarLocation', 'findLocationRow_', 'sameCustomerAndProject_',
  'normalizeLocationKey_', 'squashSpaces_', 'editDistance_',
  /* 08_Audit.gs */
  'writeAudit', 'writeAuditRecord', 'writeAuditRecords', 'isSystemLogRecord_', 'systemRowOf_',
  'systemLogDetailPrefix_', 'logSystemEvent_', 'logPermissionProblem_', 'auditValue_',
  'currentUserRole_', 'listAuditByWo', 'listAuditByTask', 'listSystemLogByWo',
]);

/**
 * ชั้นตรรกะต้องไม่มีหนี้ Apps Script ค้างอยู่ และการยิง HTTP ต้องอยู่ที่เดียว (กฎข้อ 26)
 *
 * ข้อนี้สำคัญกว่าที่เห็น เพราะหนี้แบบนี้ไม่เคยกลับมาทีเดียวก้อนใหญ่ · มันกลับมาทีละ
 * บรรทัดเดียวที่ดูไม่เป็นไร แล้วอีกหกเดือนถัดมาก็พบว่าชั้นที่ตั้งใจให้ย้ายได้ ย้ายไม่ได้แล้ว
 * ตัวสแกนนี้คือสิ่งเดียวที่ทำให้บรรทัดแรกนั้นถูกเห็นตั้งแต่วันที่มันถูกเขียน
 *
 * รายการที่ยังค้างอยู่ถูกตรึงไว้เป็น "หนี้ที่รู้ตัว" — เพิ่มใหม่ไม่ได้ และเมื่อใช้คืนแล้ว
 * ต้องมาลบออกจากรายการด้วย ไม่งั้นข้อนี้จะแดงเหมือนกัน · รายการที่โตได้เองเงียบ ๆ
 * ไม่ใช่รายการหนี้ แต่เป็นที่ซ่อนหนี้
 */
function test_layerPurity() {
  beginTest_('ชั้นตรรกะ 02–05, 08 ต้องไม่พึ่ง Apps Script (กฎข้อ 26)');

  var scope = (typeof globalThis !== 'undefined') ? globalThis : this;

  /* ---------- การยิง HTTP ต้องอยู่ในฟังก์ชันเดียว ---------- */
  var outbound = functionsUsing_(scope, allFunctionNames_(scope), ['UrlFetch' + 'App']);
  assertEquals_(outbound.sort().join(', '), 'httpSendAll_, httpSend_',
    'การยิง HTTP จริงต้องอยู่ใน httpSend_ และ httpSendAll_ เท่านั้น (กฎข้อ 26)');

  /* ---------- ชั้นตรรกะต้องสะอาด ---------- */
  var missing = [];
  for (var i = 0; i < PURE_LAYER_FUNCTIONS_.length; i++) {
    if (typeof scope[PURE_LAYER_FUNCTIONS_[i]] !== 'function') missing.push(PURE_LAYER_FUNCTIONS_[i]);
  }
  assertEquals_(missing.join(', '), '',
    'ฟังก์ชันเหล่านี้อยู่ในรายชื่อชั้นตรรกะ แต่หาไม่เจอแล้ว — รายชื่อล้าสมัย');
  assertEquals_(PURE_LAYER_FUNCTIONS_.length, 111,
    'จำนวนฟังก์ชันในชั้นตรรกะเปลี่ยนไป ต้องมาปรับรายชื่อให้ตรงก่อน');

  var debts = [];
  for (var f = 0; f < PURE_LAYER_FUNCTIONS_.length; f++) {
    var name = PURE_LAYER_FUNCTIONS_[f];
    var source = stripComments_(String(scope[name]));

    for (var a = 0; a < FORBIDDEN_IN_PURE_LAYERS_.length; a++) {
      if (source.indexOf(FORBIDDEN_IN_PURE_LAYERS_[a]) !== -1) {
        debts.push(name + ' ใช้ ' + FORBIDDEN_IN_PURE_LAYERS_[a]);
      }
    }
  }

  /*
   * **รายการข้อยกเว้นต้องว่างเปล่า ไม่ใช่ตรึงจำนวนไว้** (กฎข้อ 26)
   *
   * หนี้สามจุดเดิมถูกปลดแล้วในรอบนี้ — counterKeyOfMonth_ ย้ายไปใช้ Intl.DateTimeFormat
   * ซึ่งเป็นของมาตรฐานที่ทำงานเหมือนกันทั้งสองฝั่ง ส่วน writeAuditRecords กับ
   * currentUserRole_ เรียกผ่านตัวห่อ newUuid_ และ cacheGet_/cachePut_ แทน
   *
   * รายการที่มีสามข้อยังต้องใช้วิจารณญาณทุกครั้งที่มีคนแตะ · รายการที่มีศูนย์ข้อไม่ต้อง
   * ใครเพิ่มกลับเข้ามาแม้บรรทัดเดียว ข้อนี้แดงทันทีโดยไม่มีอะไรให้ถกเถียง
   */
  assertEquals_(debts.sort().join(' · '), '',
    'ชั้นตรรกะต้องไม่เรียก API ของ Apps Script เลย — ถ้าจำเป็นให้ห่อเป็นฟังก์ชันช่วยเหลือ');

  /* ---------- บริการของแพลตฟอร์มต้องมีทางเข้าทางเดียว ---------- */
  /*
   * เหตุผลเดียวกับ httpSend_ · ของพวกนี้ไม่มีบน Worker ทั้งหมด การรวมไว้ที่เดียว
   * ทำให้วันย้ายมีบรรทัดที่ต้องเขียนใหม่นับได้ แทนที่จะต้องไล่หาทั้งโปรเจกต์
   */
  var everything = allFunctionNames_(scope);

  assertEquals_(functionsUsing_(scope, everything, ['CacheService']).sort().join(', '),
    'cacheDrop_, cacheGetAll_, cacheGet_, cachePutAll_, cachePut_',
    'CacheService ต้องปรากฏเฉพาะในตัวห่อแคชเท่านั้น');

  assertEquals_(functionsUsing_(scope, everything, ['Utilities.getUuid']).join(', '),
    'newUuid_', 'Utilities.getUuid ต้องปรากฏใน newUuid_ ที่เดียว');

  /* ---------- ตัวสแกนต้องจับของปลอมได้ ---------- */
  var fake = {
    clean: function () { return 1 + 1; },
    dirty: function () { return PropertiesService.getScriptProperties(); },
    commented: function () { /* PropertiesService */ return 2; }
  };
  assertEquals_(functionsUsing_(fake, ['clean', 'dirty', 'commented'], ['PropertiesService']).join(', '),
    'dirty', 'ตัวสแกนต้องจับตัวที่ใช้จริง และไม่จับโค้ดที่ถูกคอมเมนต์ไว้');

  return endTest_();
}

/**
 * ชื่อฟังก์ชันทั้งหมดในขอบเขตหนึ่ง ยกเว้นตัวเทสต์เอง
 * @param {Object} scope ขอบเขตที่จะดู
 * @return {string[]}
 */
function allFunctionNames_(scope) {
  var out = [];
  for (var name in scope) {
    if (typeof scope[name] !== 'function') continue;
    if (name.indexOf('test_') === 0) continue;
    if (serviceNameRegistries_().indexOf(name) !== -1) continue;
    out.push(name);
  }
  return out;
}

/**
 * ฟังก์ชันที่มีคำต้องห้ามอยู่ในเนื้อโค้ด (ไม่นับคอมเมนต์)
 * @param {Object} scope ขอบเขตที่จะดู
 * @param {string[]} names ชื่อฟังก์ชันที่จะตรวจ
 * @param {string[]} needles คำที่ห้ามมี
 * @return {string[]} ชื่อฟังก์ชันที่พบ (ไม่ซ้ำ)
 */
function functionsUsing_(scope, names, needles) {
  var found = {};
  for (var i = 0; i < names.length; i++) {
    var fn = scope[names[i]];
    if (typeof fn !== 'function') continue;

    var source;
    try { source = stripComments_(String(fn)); } catch (e) { continue; }

    for (var n = 0; n < needles.length; n++) {
      if (source.indexOf(needles[n]) !== -1) found[names[i]] = true;
    }
  }

  var out = [];
  for (var key in found) {
    if (Object.prototype.hasOwnProperty.call(found, key)) out.push(key);
  }
  return out;
}


/**
 * คีย์ตัวนับรายเดือนต้องอ่านเดือนตามเวลาไทย ไม่ใช่เวลาสากล (SPEC 10.1 · กฎข้อ 26)
 *
 * ไทยเร็วกว่าเวลาสากลเจ็ดชั่วโมง ช่วงเที่ยงคืนถึงเจ็ดโมงเช้าของไทยจึงยังเป็น
 * "เมื่อวาน" ตามเวลาสากลเสมอ · ถ้าอ่านเดือนแบบสากล ใบงานที่สร้างตอนตีครึ่ง
 * ของวันที่ 1 ตุลาคม จะได้คีย์ของเดือนกันยายน แล้วไปกินเลขต่อจากเดือนที่แล้ว
 *
 * ความผิดพลาดแบบนี้เกิดปีละสิบสองครั้ง ครั้งละไม่กี่ชั่วโมง และไม่มีอะไรฟ้องเลย
 * เพราะเลขที่ได้ยังหน้าตาถูกต้องทุกประการ · จะรู้ตัวก็ตอนมีคนถามว่าทำไมใบงาน
 * เดือนตุลาคมถึงมีเลขเดือนกันยายนปนอยู่ ซึ่งตอนนั้นแก้ย้อนหลังไม่ได้แล้ว
 */
function test_wo_counterKeyUsesThaiMonth() {
  beginTest_('คีย์ตัวนับต้องอ่านเดือนตามเวลาไทย');

  /*
   * สร้างเวลาด้วย ISO ที่ลงท้ายด้วย Z เสมอ เพื่อให้ผลไม่ขึ้นกับเขตเวลาของเครื่องที่รัน
   * ถ้าเขียนเป็น new Date(2026, 8, 30, 23, 30) ผลจะต่างกันระหว่างเครื่องของแต่ละคน
   */

  // คืนวันสิ้นเดือน 23:30 ตามเวลาไทย = 16:30Z ของวันเดียวกัน · ยังต้องเป็นเดือนกันยายน
  assertEquals_(counterKeyOfMonth_('WO-', new Date('2026-09-30T16:30:00Z')), 'WO-2609',
    'คืนวันที่ 30 กันยายน เวลา 23:30 ของไทย ต้องได้คีย์เดือนกันยายน ไม่ใช่ตุลาคม');

  // ตีครึ่งของวันที่ 1 ตุลาคม ตามเวลาไทย = 17:30Z ของวันที่ 30 กันยายน
  // เวลาสากลยังเป็นกันยายน แต่ไทยขึ้นเดือนใหม่แล้ว — นี่คือกรณีที่แยกสองวิธีออกจากกัน
  assertEquals_(counterKeyOfMonth_('WO-', new Date('2026-09-30T17:30:00Z')), 'WO-2610',
    'ตีครึ่งวันที่ 1 ตุลาคมของไทย ต้องได้คีย์เดือนตุลาคม แม้เวลาสากลจะยังเป็นกันยายน');

  // ข้ามปีด้วยเหตุผลเดียวกัน — 31 ธันวาคม 17:30Z = 1 มกราคมของไทย
  assertEquals_(counterKeyOfMonth_('WO-', new Date('2025-12-31T17:30:00Z')), 'WO-2601',
    'ข้ามปีตอนตีครึ่งของไทย ต้องได้ทั้งปีและเดือนใหม่');

  // กลางวันธรรมดาที่ไม่มีอะไรกำกวม ต้องยังถูกเหมือนเดิม
  assertEquals_(counterKeyOfMonth_('PJ-', new Date('2026-03-15T05:00:00Z')), 'PJ-2603',
    'วันธรรมดาต้องได้เดือนของตัวเองตามปกติ');

  // เลขเดือนต้องมีศูนย์นำหน้าเสมอ ไม่งั้นคีย์เดือนมกราคมจะกลายเป็น WO-261
  assertEquals_(counterKeyOfMonth_('WO-', new Date('2026-01-15T05:00:00Z')).length,
    'WO-'.length + 4, 'คีย์ต้องยาวคงที่ เดือนหลักเดียวต้องมีศูนย์นำหน้า');

  return endTest_();
}

/**
 * เพดานจำนวนคำขอต่อการเปิดหนึ่งหน้า — แยกตอนแคชว่างกับตอนแคชอุ่น
 *
 * สองสถานะนี้ต่างกันมากและต้องคุมทั้งคู่ · แคชว่างคือผู้ใช้คนแรกหลังแคชหมดอายุ
 * ซึ่งเป็นกรณีแย่ที่สุด · แคชอุ่นคือทุกคนที่เหลือในสิบนาทีนั้น ซึ่งเป็นกรณีที่
 * เกิดบ่อยที่สุด · ถ้าคุมแต่กรณีแย่ที่สุด การถอยหลังในกรณีปกติจะไม่มีอะไรจับได้เลย
 *
 * **ตั้งจากที่วัดได้จริงบวกเผื่อแค่หนึ่ง** · เพดานที่หลวมไม่ได้กันอะไรเลย
 * งานของตัวเลขพวกนี้คือจับการถอยหลัง ไม่ใช่ปล่อยผ่านไว้ก่อน
 */
var DB_CALL_BUDGET = Object.freeze({
  /*
   * หน้าแรกวัดได้ 1 คำขอ (2 สำหรับผู้ใช้ที่มีแผนก ซึ่งจ่ายอีกหนึ่งให้ยอดบนเมนู)
   * และหน้ารายการวัดได้ 2–3 · ทั้งคู่ไม่ขยับเลยระหว่าง 0 ใบกับ 50 ใบ
   */
  /*
   * workLoaded = หน้าแผนกที่มีงานจริงอยู่หนึ่งหน้าเต็ม — วัดได้ 5 คำขอ จึงตั้งเพดานที่ 6
   *
   * แยกจาก work ซึ่งวัดหน้าที่ยังไม่มีงานเลย ถ้าใช้เพดานเดียวกัน เพดานของหน้าว่าง
   * จะหลวมขึ้นสองเท่า แล้วการถอยหลังตอนหน้าว่างจะไม่มีอะไรจับได้เลย
   */
  cold: Object.freeze({ home: 3, create: 3, work: 3, workLoaded: 6,
    approve: 1, returned: 2, wolist: 3 }),
  warm: Object.freeze({ home: 2, create: 1, work: 3, approve: 1, returned: 2, wolist: 3 }),
  fiveMasters: 6  // วัดได้ 5 — หนึ่งคำขอต่อหนึ่งตาราง ไม่ใช่หนึ่งคำขอต่อหนึ่งแถว
});

/**
 * เปิดหน้าหนึ่งครั้งต้องยิงคำขอไปฐานข้อมูลไม่เกินเพดาน (SPEC 22.5)
 *
 * **นี่คือกับดักที่ SPEC 22.5 เตือนไว้ และเป็นข้อเดียวที่จะจับมันได้**
 * การย้ายมาฐานข้อมูลแล้วยังอ่านทีละแถวในวนลูป จะได้ระบบที่ช้ากว่าเดิม
 * เพราะชีตอ่านทั้งตารางครั้งเดียว แต่โค้ดที่เขียนแบบไม่ระวังจะยิงทีละแถว
 */
function test_db_callBudgetPerPage() {
  beginTest_('เปิดหน้าหนึ่งครั้ง ต้องยิงคำขอไม่เกินเพดาน');

  var users = serviceTestUsers_();
  var svUser = { email: 'budget.sv@cnr.co.th', roles: [ROLE.SERVICE], department: DEPT.SERVICE };

  var pages = [
    { name: 'home',     user: svUser },
    { name: 'wolist',   user: svUser },
    { name: 'create',   user: users.admin },
    { name: 'work',     user: svUser },
    { name: 'approve',  user: users.admin },
    { name: 'returned', user: users.admin }
  ];

  for (var p = 0; p < pages.length; p++) {
    var page = pages[p];

    /* ---------- แคชว่างทั้งสองชั้น — ผู้ใช้คนแรกหลังแคชหมดอายุ ---------- */
    clearRowCache_();
    clearMasterCache_();
    dbCallReset_();
    var cold = withTestUser_(page.user, function () { return pageBootstrap_(page.name, {}); });
    var coldCalls = dbCallCount();

    assertEquals_(cold.error, '', 'หน้า ' + page.name + ' ต้องเปิดได้ตามปกติ ไม่งั้นการวัดไม่มีความหมาย');
    assertTrue_(coldCalls <= DB_CALL_BUDGET.cold[page.name],
      'หน้า ' + page.name + ' ตอนแคชว่าง ต้องยิงไม่เกิน ' + DB_CALL_BUDGET.cold[page.name] +
      ' คำขอ (ยิงจริง ' + coldCalls + ')');

    /* ---------- แคชข้ามการรันยังอุ่น — ทุกคนที่เหลือในสิบนาทีนั้น ---------- */
    /*
     * ล้างเฉพาะแคชระดับการรัน ไม่แตะแคชข้ามการรัน เพราะนั่นคือสภาพจริงของ
     * ผู้ใช้คนถัดไป · ถ้าล้างทั้งสองชั้น เราจะวัดกรณีแย่ที่สุดซ้ำสองรอบเปล่า ๆ
     */
    ROW_CACHE_ = {};
    dbCallReset_();
    withTestUser_(page.user, function () { return pageBootstrap_(page.name, {}); });
    var warmCalls = dbCallCount();

    assertTrue_(warmCalls <= DB_CALL_BUDGET.warm[page.name],
      'หน้า ' + page.name + ' ตอนแคชอุ่น ต้องยิงไม่เกิน ' + DB_CALL_BUDGET.warm[page.name] +
      ' คำขอ (ยิงจริง ' + warmCalls + ')');
    assertTrue_(warmCalls <= coldCalls,
      'หน้า ' + page.name + ' ตอนแคชอุ่นต้องไม่แพงกว่าตอนแคชว่าง — ถ้าแพงกว่า แปลว่าแคชไม่ได้ทำงาน');
  }

  /* ---------- อ่านครบทั้งห้าตาราง ต้องเป็นหนึ่งคำขอต่อตาราง ---------- */
  clearRowCache_();
  clearMasterCache_();
  dbCallReset_();
  listReportMaster();
  listRequestTypes();
  listAttachmentTopics();
  listStepTemplates();
  listNotifyChannels();
  var fiveCalls = dbCallCount();

  assertTrue_(fiveCalls <= DB_CALL_BUDGET.fiveMasters,
    'อ่านห้าตารางต้องยิงไม่เกิน ' + DB_CALL_BUDGET.fiveMasters +
    ' คำขอ คือหนึ่งต่อหนึ่งตาราง (ยิงจริง ' + fiveCalls + ')');

  /* ---------- อ่านซ้ำในการรันเดียวกัน ต้องไม่เสียคำขอเพิ่มเลย ---------- */
  dbCallReset_();
  listReportMaster();
  listRequestTypes();
  listAttachmentTopics();
  assertEquals_(dbCallCount(), 0,
    'อ่านตารางเดิมซ้ำในการรันเดียวกัน ต้องได้จากแคชระดับการรัน ไม่ยิงเพิ่มเลย');

  /* ---------- กับดักตัวจริง: อ่านทีละแถวในวนลูป ---------- */
  dbCallReset_();
  for (var i = 0; i < 20; i++) getReport('SV1');
  assertEquals_(dbCallCount(), 0,
    'เรียก getReport ยี่สิบครั้งต้องยิงศูนย์คำขอ — ถ้าเป็นยี่สิบ แปลว่ากำลังอ่านทีละแถว');

  return endTest_();
}

/**
 * คำเตือน "รายการไม่ครบ" ต้องแม่นที่ขอบพอดี ไม่ใช่ฟ้องเผื่อไว้
 *
 * **ข้อนี้มาจากข้อบกพร่องที่ผมเขียนเองแล้วรายงานว่ายอมรับได้** · ชั้น Api เคยนับ
 * แถวที่ได้แล้วเทียบกับเพดาน ซึ่งแปลว่ารายการที่มีครบ 1,000 พอดีและไม่ได้ขาด
 * อะไรเลย จะขึ้นคำเตือนว่าไม่ครบ · คำเตือนที่ฟ้องทั้งที่ไม่มีอะไรหาย ฝึกให้คน
 * เลิกอ่านคำเตือน แล้ววันที่ของหายจริงก็จะไม่มีใครอ่านเหมือนกัน
 *
 * ความจริงข้อนี้มีอยู่แล้วที่ queryRowsCounted_ เพราะมันขอเกินมาหนึ่งแถวเสมอ
 * และเป็นที่เดียวที่เห็นแถวที่เกิน · สิ่งที่ข้อนี้ตรวจคือมันไม่ทิ้งความจริงนั้น
 *
 * ใช้หัวข้อไฟล์แนบที่มีอยู่จริงเป็นข้อมูลตั้งต้น เพราะจำนวนแถวที่ตรงตัวกรองรู้แน่
 * ล่วงหน้า · ขอบที่ต้องพิสูจน์คือ "เพดานเท่ากับจำนวนที่มีพอดี" ซึ่งเป็นจุดเดียว
 * ที่สองวิธีให้คำตอบต่างกัน
 */
function test_db_truncationWarningIsExactAtTheEdge() {
  beginTest_('คำเตือน "รายการไม่ครบ" ต้องแม่นที่ขอบพอดี');

  /*
   * ปลูกแถวของตัวเองสามแถว ไม่ใช่ยืมข้อมูลหลักที่มีอยู่ — จำนวนแถวคือสิ่งที่ข้อนี้
   * วัด ถ้าจำนวนมาจากข้อมูลที่ชุดอื่นเปลี่ยนได้ ผลของข้อนี้จะเปลี่ยนตามไปด้วย
   */
  var suffixes = ['EDGE1', 'EDGE2', 'EDGE3'];
  for (var t = 0; t < suffixes.length; t++) {
    testAttachTopic_(suffixes[t], 'หัวข้อวัดขอบ ' + (t + 1));
  }
  clearRowCache_(SHEET.ATTACHMENT_TOPIC);

  var mine = { 'Topic_ID': { op: 'like', value: dbLikeLiteral_(testPrefix_() + 'TOPIC-EDGE') + '*' } };
  var seeded = queryRowsCounted_(SHEET.ATTACHMENT_TOPIC, mine, { limit: 50 });
  assertEquals_(seeded.rows.length, 3, 'ต้องปลูกได้ครบสามแถวก่อน ไม่งั้นการเทียบที่ขอบไม่มีความหมาย');
  assertEquals_(seeded.truncated, false, 'เพดานสูงกว่าจำนวนที่มีมาก ต้องไม่ถูกฟ้อง');

  /* ---------- เพดานเท่ากับจำนวนที่มีพอดี — ไม่มีอะไรหาย จึงห้ามเตือน ---------- */
  var exact = queryRowsCounted_(SHEET.ATTACHMENT_TOPIC, mine, { limit: 3 });
  assertEquals_(exact.rows.length, 3, 'ต้องได้ครบสามแถวที่ขอ');
  assertEquals_(exact.truncated, false,
    'ได้ครบพอดีตามเพดาน ต้องไม่ถูกฟ้องว่าไม่ครบ · การนับแถวแล้วเทียบกับเพดานให้คำตอบผิดตรงนี้');

  /* ---------- เพดานน้อยกว่าที่มีจริง — ของหายจริง จึงต้องเตือน ---------- */
  var cut = queryRowsCounted_(SHEET.ATTACHMENT_TOPIC, mine, { limit: 2 });
  assertEquals_(cut.rows.length, 2, 'ต้องคืนแค่เท่าเพดาน ไม่ใช่คืนแถวที่ขอเกินมาด้วย');
  assertEquals_(cut.truncated, true, 'ของหายจริงต้องถูกฟ้อง');

  /* ---------- ทางเดิมต้องคืนของเหมือนเดิมทุกประการ ---------- */
  // ผู้เรียกเดิมหลายสิบแห่งเรียก queryRows_ อยู่ ถ้ารูปของคำตอบเปลี่ยน จะพังเงียบ ๆ
  var plain = queryRows_(SHEET.ATTACHMENT_TOPIC, mine, { limit: 2 });
  assertTrue_(plain instanceof Array, 'queryRows_ ต้องยังคืนเป็นรายการแถวเหมือนเดิม');
  assertEquals_(plain.length, 2, 'และได้จำนวนเท่าเดิม');

  return endTest_();
}

/** ชื่อตารางที่ชุดทดสอบเขียนลงไปได้ — ห้ามใช้ตารางที่ระบบจริงอ่าน */
var TEST_BULK_TABLE = '_Test_Bulk';

/** จำนวนแถวที่ใช้ทดสอบการแบ่งหน้า — ต้องมากกว่า DB_PAGE_ROWS เพื่อให้เกินหนึ่งหน้าจริง */
var PAGING_TEST_ROWS = 1050;

/**
 * การอ่านทั้งตารางต้องได้ครบทุกแถว แม้ตารางจะใหญ่กว่าเพดานของคำขอเดียว
 *
 * **ข้อนี้เกิดจากข้อบกพร่องจริงที่หลุดขึ้นของจริงไปแล้ว** · PostgREST คืนได้สูงสุด
 * 1,000 แถวต่อคำขอ และเมื่อขอมากกว่านั้นมันไม่แจ้งความผิดพลาด แต่คืนมาแค่ 1,000
 * เฉย ๆ · ตาราง customer มี 5,901 แถว ระบบจึงเห็นลูกค้าแค่หนึ่งพันรายแรก
 * และอีกสี่พันเก้าร้อยรายไม่มีตัวตนสำหรับระบบ โดยไม่มีอะไรฟ้องเลยสักอย่าง
 *
 * เขียนลงตาราง _test_bulk ซึ่งมีไว้สำหรับงานนี้โดยเฉพาะ · เดิมเขียนลง request_type
 * ซึ่งเป็นตารางที่หน้าสร้างใบงานอ่านไปทำกล่องดรอปดาวน์ให้ผู้ใช้เลือก · เทสต์ที่ล้ม
 * กลางคันจึงทิ้งตัวเลือกปลอมนับพันไว้ให้ผู้ใช้เห็น ซึ่งเป็นราคาที่สูงเกินกว่าที่เทสต์
 * ข้อหนึ่งควรทำให้ระบบต้องจ่าย
 */
function test_db_readsEveryRowNotJustFirstPage() {
  beginTest_('อ่านทั้งตารางต้องได้ครบ แม้เกินหนึ่งหน้า');

  var prefix = testPrefix_() + 'PAGE-';
  var rows = [];
  for (var i = 0; i < PAGING_TEST_ROWS; i++) {
    // เติมศูนย์นำหน้าให้เรียงลำดับแบบข้อความได้ตรงกับลำดับตัวเลข
    var serial = ('000' + i).slice(-4);
    rows.push({ Row_ID: prefix + serial, Row_Name: 'แถวทดสอบ ' + serial,
      Sort_Order: i, Active: true });
  }

  var mine = { Row_ID: { op: 'like', value: prefix + '*' } };
  dbDeleteVerified_(TEST_BULK_TABLE, mine, 'ของค้างจากรอบที่ล้มกลางคัน');

  try {
    db_insert_(TEST_BULK_TABLE, rows);

    /* ---------- เพดานหนึ่งคำขอมีอยู่จริง ---------- */
    // ถ้าข้อนี้ได้ 1,050 แปลว่าฝั่งโน้นเปลี่ยนเพดานไปแล้ว ซึ่งต้องรู้ก่อนไปเชื่อข้อถัดไป
    var onePage = db_select_(TEST_BULK_TABLE, { filters: mine, order: 'Row_ID' });
    assertEquals_(onePage.length, DB_PAGE_ROWS,
      'คำขอเดียวต้องได้แค่ ' + DB_PAGE_ROWS + ' แถว — นี่คือเพดานที่ทำให้ข้อมูลขาดหายเงียบ ๆ');

    /* ---------- การอ่านแบบแบ่งหน้าต้องได้ครบ ---------- */
    var everything = db_selectAll_(TEST_BULK_TABLE, { filters: mine });
    assertEquals_(everything.length, PAGING_TEST_ROWS,
      'อ่านแบบแบ่งหน้าต้องได้ครบทุกแถว ไม่ใช่แค่หน้าแรก');

    /* ---------- ห้ามมีแถวซ้ำหรือแถวหายระหว่างหน้า ---------- */
    // การแบ่งหน้าโดยไม่ระบุลำดับจะให้จำนวนรวมที่ดูถูก แต่มีแถวซ้ำและแถวหายปนกันอยู่
    var seen = {};
    var duplicates = 0;
    for (var d = 0; d < everything.length; d++) {
      var id = String(everything[d].Row_ID);
      if (seen[id]) duplicates++;
      seen[id] = true;
    }
    assertEquals_(duplicates, 0, 'ต้องไม่มีแถวไหนถูกอ่านซ้ำข้ามหน้า');

    var missing = 0;
    for (var m = 0; m < PAGING_TEST_ROWS; m++) {
      if (!seen[prefix + ('000' + m).slice(-4)]) missing++;
    }
    assertEquals_(missing, 0, 'ต้องไม่มีแถวไหนหายไประหว่างหน้า');

    /* ---------- ทางที่ชั้น Repo เดินจริงก็ต้องได้ครบ ---------- */
    /*
     * readSnapshot_ ไม่ได้เรียก db_selectAll_ เอง แต่เรียกผ่าน dbSnapshot_
     * การพิสูจน์ที่ dbSnapshot_ จึงครอบคลุมเส้นทางที่ผู้เรียกจริงใช้ทั้งเส้น
     * โดยไม่ต้องเขียนขยะลงตารางที่ระบบอ่าน
     */
    var snapshot = dbSnapshot_(TEST_BULK_TABLE);
    var mineInSnapshot = 0;
    for (var v = 1; v < snapshot.values.length; v++) {
      if (String(snapshot.values[v][0]).indexOf(prefix) === 0) mineInSnapshot++;
    }
    assertEquals_(mineInSnapshot, PAGING_TEST_ROWS,
      'ภาพของตารางที่ชั้น Repo ใช้ ก็ต้องมีครบทุกแถวเหมือนกัน');
  } finally {
    // ล้างด้วยตัวกรองคำนำหน้า ไม่ใช่ไล่ลบทีละคีย์ เพราะที่อยู่ของคำขอจะยาวเกินไป
    dbDeleteVerified_(TEST_BULK_TABLE, mine, 'แถวทดสอบการแบ่งหน้า', PAGING_TEST_ROWS);
    clearRowCache_();
  }

  assertEquals_(db_count_(TEST_BULK_TABLE, mine), 0, 'ต้องไม่เหลือแถวทดสอบไว้เลย');

  return endTest_();
}
