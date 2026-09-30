/**
 * 04_Service_Task.gs — ตรรกะงานของแผนก (SPEC 7, 8, 20.3, 20.5)
 *
 * ชั้นนี้ทำหน้าที่ประกอบลำดับการทำงานของแผนกเจ้าของ Task เท่านั้น
 * การตัดสินว่า "ทำได้หรือไม่" ทั้งหมดอยู่ในตาราง Transition และ Guard ของ 02_StateMachine.gs
 * ไม่มีการเขียนสถานะลงชีตจากไฟล์นี้โดยตรง และไม่มีการคำนวณสถานะ WO เอง (กฎข้อ 1, 2)
 *
 * สิ่งที่ไฟล์นี้รับผิดชอบ
 *   - รวบรวมข้อเท็จจริงที่ชีตรู้แต่ Guard ไม่รู้ เช่น "Step ครบหรือยัง" แล้วส่งเข้า changeStatus()
 *   - เขียนคอลัมน์ประกอบที่ไม่ใช่สถานะ เช่น Accepted_By, Completed_Date, Cancel_Reason
 *   - จัดลำดับขั้นตอนของ returnTask ให้ตรง SPEC 20.5 (จำสถานะ Task ทุกตัวก่อนแตะอะไรทั้งสิ้น)
 *
 * เงื่อนไขการชำระเงิน (SPEC 12) ไม่ได้ตรวจที่นี่ — Guard ชื่อ paymentCleared ตรวจให้แล้ว
 * โดยอ่าน Payment_Required / Payment_Status จากใบงานจริงผ่าน loadStatusContext_()
 * ผู้เรียกจึงยัดค่าผ่านหน้าเว็บมาข้ามด่านนี้ไม่ได้
 */

/* ---------------------------------------------------------------------------
 * รับงาน
 * --------------------------------------------------------------------------- */

/**
 * แผนกกดรับงานของตัวเอง PENDING_ACCEPT -> IN_PROGRESS (SPEC 7, 12)
 *
 * ด่านที่ต้องผ่านทั้งหมดถูกบังคับโดย Transition TASK_ACCEPT
 *   woNotReturned   ใบงานต้องไม่ถูกตีกลับค้างอยู่ (กฎข้อ 13)
 *   taskOwner       ต้องเป็นแผนกเจ้าของงานจริง
 *   paymentCleared  ใบที่ Payment_Required = true ต้อง PAID ก่อน (SPEC 12)
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @param {Object} user ผู้กดรับงาน {email, role|roles, department}
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่ (SPEC C-3)
 * @return {Object} แผนการเปลี่ยนสถานะจาก changeStatus()
 * @throws {Error} เมื่อไม่พบงาน สิทธิ์ไม่พอ ใบงานถูกตีกลับ หรือยังไม่ชำระเงิน
 */
function acceptTask(taskId, user, expectedUpdatedDate) {
  var task = getTask(taskId);
  if (!task) throw new Error('ไม่พบงานของแผนก ' + taskId);

  var plan = changeStatus(ENTITY.TASK, taskId, ACTION.TASK_ACCEPT, user, {
    expectedUpdatedDate: expectedUpdatedDate,
    fields: {
      'Accepted_By':   actingEmail_(user),
      'Accepted_Date': new Date()
    }
  });
  // แจ้งห้อง Admin ว่าแผนกรับงานแล้ว (SPEC 15.3)
  notifyEvent_(NOTIFY_EVENT.TASK_ACCEPT, getWorkOrder(task['WO_ID']),
    { department: task['Department'], taskId: taskId });
  return plan;
}

/* ---------------------------------------------------------------------------
 * อัปเดต Step และงวดงาน
 * --------------------------------------------------------------------------- */

/** คอลัมน์ของ Task_Step ที่หน้าจอแก้ได้ (SPEC 13) — คอลัมน์อื่นห้ามให้ผู้ใช้เขียนทับ */
var STEP_EDITABLE_FIELDS = Object.freeze(['Step_Name', 'Status', 'Due_Date']);

/**
 * อัปเดต Step หรืองวดงานหนึ่งรายการ
 *
 * ลำดับสำคัญมาก: ตรวจสิทธิ์ผ่าน changeStatus() ให้ผ่านก่อน แล้วจึงเขียน Task_Step
 * ถ้าเขียนก่อนตรวจ รายการที่ถูกปฏิเสธจะทิ้งร่องรอยไว้ในชีต ซึ่งเป็นอาการที่กฎข้อ 13 ต้องกัน
 * (TASK_UPDATE ไม่เปลี่ยนสถานะ Task แต่ยังต้องผ่าน changeStatus() เพราะที่นั่นคือที่เดียว
 *  ที่ตรวจว่าใบงานถูกตีกลับอยู่หรือไม่ ผู้กดเป็นเจ้าของงานหรือไม่ และเขียน Audit ให้เอง)
 *
 * @param {string} stepId เลขที่ Step หรืองวดงาน
 * @param {Object} data ค่าที่ต้องการเปลี่ยน คีย์ตาม STEP_EDITABLE_FIELDS
 * @param {Object} user ผู้ทำรายการ
 * @return {Object} {plan, step} — step คือแถวหลังแก้ไข
 * @throws {Error} เมื่อไม่พบ Step ไม่พบงานต้นทาง สิทธิ์ไม่พอ หรือใบงานถูกตีกลับอยู่
 */
function updateTaskStep(stepId, data, user) {
  data = data || {};

  var step = getStep(stepId);
  if (!step) throw new Error('ไม่พบขั้นตอนงาน ' + stepId);

  var taskId = step['Task_ID'];
  var task = getTask(taskId);
  if (!task) throw new Error('ไม่พบงานของแผนกที่เป็นเจ้าของขั้นตอน ' + stepId);

  var patch = pickStepFields_(data);
  if (isEmptyPatch_(patch)) throw new Error('ไม่มีข้อมูลที่จะบันทึกในขั้นตอนงานนี้');

  /*
   * ทำทีละขั้นตามลำดับ — ปิดขั้นที่ 3 ก่อนที่ขั้นที่ 2 จะเสร็จไม่ได้ (SPEC 7.1, 7.2)
   *
   * ด่านอยู่ที่นี่ ไม่ใช่ที่หน้าเว็บ เพราะหน้าเว็บที่ล็อกปุ่มให้ก็จริง แต่ใครก็ยิง
   * api_updateTaskStep ตรง ๆ ได้ · และข้อความต้องบอกว่าติดที่ขั้นไหน ไม่ใช่บอกแค่ว่าทำไม่ได้
   *
   * การ "เปิดกลับ" ขั้นที่ปิดไปแล้วยังทำได้เสมอ เพราะนั่นคือการแก้ของที่ลงผิด
   * ซึ่งต้องทำได้ตลอด ไม่งั้นคนที่กดพลาดจะติดอยู่กับข้อมูลที่ผิดโดยแก้เองไม่ได้
   */
  if (patch['Status'] === STEP_STATUS.COMPLETED) {
    var blocking = earlierUnfinishedStep_(listStepsByTask(taskId), step);
    if (blocking) {
      throw new Error('ยังปิด' + stepLabel_(step) + 'ไม่ได้ เพราะ' + stepLabel_(blocking) +
        'ยังไม่เสร็จ — ระบบให้ทำทีละขั้นตามลำดับ ทำขั้นก่อนหน้าให้เสร็จแล้วจึงกลับมาขั้นนี้');
    }
  }

  // ปิดขั้นตอนแล้วต้องรู้ว่าใครปิดและปิดเมื่อไร ส่วนการเปิดกลับต้องล้างของเดิมทิ้ง
  // ไม่งั้นจะเหลือชื่อผู้ทำเก่าค้างอยู่บนขั้นตอนที่ยังไม่เสร็จ
  if (patch['Status'] === STEP_STATUS.COMPLETED) {
    patch['Completed_By'] = actingEmail_(user);
    patch['Completed_Date'] = new Date();
  } else if (patch['Status'] === STEP_STATUS.PENDING) {
    patch['Completed_By'] = '';
    // คอลัมน์วันเวลาต้องล้างด้วย null · Postgres ปฏิเสธข้อความว่างด้วยรหัส 22007
    patch['Completed_Date'] = null;
  }

  var plan = changeStatus(ENTITY.TASK, taskId, ACTION.TASK_UPDATE, user, {
    remark: 'อัปเดต' + stepLabel_(step)
  });

  var saved = updateStep(stepId, patch);

  // changeStatus() บันทึกไว้แล้วว่ามีการอัปเดตงานนี้ แต่ไม่รู้ว่าขั้นตอนไหน
  // จึงบันทึกอีกแถวที่ระบุขั้นตอนและสถานะก่อน–หลัง ให้ตามรอยได้ว่าใครปิดขั้นไหนเมื่อไร
  writeAudit(ENTITY.TASK, taskId, ACTION.TASK_UPDATE, stepId,
    step['Status'] || '', saved['Status'] || '',
    stepLabel_(step), { woId: task['WO_ID'], taskId: taskId });

  // แจ้งห้อง Admin ว่างานคืบหน้าถึงขั้นไหนแล้ว (SPEC 15.3 แถวอัปเดต Step / งวดงาน)
  var progress = stepProgressOf_(taskId);
  notifyEvent_(NOTIFY_EVENT.TASK_UPDATE, getWorkOrder(task['WO_ID']), {
    department: task['Department'],
    taskId: taskId,
    stepName: stepLabel_(step),
    done: progress.done,
    total: progress.total
  });

  return { plan: plan, step: saved };
}

/**
 * คัดเฉพาะคอลัมน์ที่หน้าจอแก้ได้ ทิ้งคีย์แปลกปลอมที่ส่งมาจากหน้าเว็บทั้งหมด
 * @param {Object} data ค่าที่หน้าจอส่งมา
 * @return {Object}
 */
function pickStepFields_(data) {
  var patch = {};
  for (var i = 0; i < STEP_EDITABLE_FIELDS.length; i++) {
    var field = STEP_EDITABLE_FIELDS[i];
    if (Object.prototype.hasOwnProperty.call(data, field)) patch[field] = data[field];
  }
  return patch;
}

/**
 * patch นี้ว่างเปล่าหรือไม่
 * @param {Object} patch
 * @return {boolean}
 */
function isEmptyPatch_(patch) {
  for (var key in patch) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) return false;
  }
  return true;
}

/**
 * ชื่อขั้นตอนหรืองวดงานที่เอาไปแสดงในข้อความและ Audit ได้เลย
 * @param {Object} step แถว Task_Step
 * @return {string}
 */
function stepLabel_(step) {
  var name = step['Step_Name'] || '';
  var kind = (step['Type'] === STEP_TYPE.PERIOD) ? 'งวดงาน' : 'ขั้นตอน';
  return name ? (kind + ' ' + name) : kind;
}

/**
 * จำนวนงานของแผนกหนึ่ง แยกตามมุมมองในเมนูย่อย (SPEC 17.3)
 *
 * นับจากแถวดิบของ Department_Task อย่างเดียว ไม่ประกอบมุมมองเต็มของแต่ละงาน
 * เพราะตัวเลขนี้ติดไปกับ "ทุกหน้า" ไม่ใช่เฉพาะหน้าแผนก — ถ้านับแบบแพง
 * ทุกหน้าในระบบจะช้าลงตามจำนวนงานของแผนกนั้น
 *
 * แท็บนี้ถูกอ่านทั้งตารางครั้งเดียวต่อการรัน (ROW_CACHE_) หน้าที่อ่านอยู่แล้ว
 * เช่นหน้าแผนก จึงไม่เสียรอบเพิ่มเลยแม้แต่รอบเดียว
 *
 * @param {string} department ค่าจาก DEPT
 * @return {Object} {pending, active, done} ตามคีย์ของ TASK_VIEWS
 */
function taskCountsForDepartment_(department) {
  var counts = emptyTaskCounts_();
  if (!department) return counts;

  /*
   * คัดแผนกของผู้ใช้ออกจากก้อนดิบที่มีครบทุกแผนก (SPEC 17.1 · กฎข้อ 30)
   *
   * ฐานข้อมูลไม่รู้จักว่าใครเป็นใคร มันคืนยอดมาครบทุกแผนกเสมอ · การตัดสินว่า
   * ผู้ใช้คนนี้เห็นแผนกไหน เกิดขึ้นที่นี่ จากค่าที่มาจาก getCurrentUser_() เท่านั้น
   * และเกิดใหม่ทุกคำขอ ไม่ได้ถูกเก็บลงแคชที่แชร์กัน
   *
   * แผนกที่ไม่มีงานเลยจะไม่มีอยู่ในก้อนที่ได้มา ซึ่งต้องแปลว่าศูนย์ ไม่ใช่ว่างเปล่า
   * จึงตั้งต้นด้วยศูนย์ครบทุกมุมมองไว้ก่อนเสมอ (กฎข้อ 32)
   */
  var all = countAllTasksByView();
  var mine = all[department];
  if (!mine) return counts;

  for (var key in counts) {
    if (!Object.prototype.hasOwnProperty.call(counts, key)) continue;
    if (typeof mine[key] !== 'undefined') counts[key] = Number(mine[key]) || 0;
  }
  return counts;
}



/**
 * งานของแผนกนี้ นัดเข้างานในวันนั้นและยังไม่จบหรือไม่ — ตรรกะล้วน
 *
 * ใช้ทั้งฝั่งตัวนับบนเมนูและฝั่งที่คัดรอบสุดท้ายหลังฐานข้อมูลกรองมาแล้ว
 * **ต้องเป็นตัวเดียวกันทั้งสองฝั่ง** ไม่งั้นตัวเลขบนเมนูจะไม่ตรงกับจำนวนที่เห็นในหน้า
 * ซึ่งเป็นอาการที่ผู้ใช้เห็นทันทีและทำให้เลิกเชื่อตัวเลขทุกตัว
 *
 * เทียบด้วยคำนำหน้าของสตริง เพราะ Visit_Start เก็บเป็นข้อความ 'YYYY-MM-DDTHH:mm'
 * ตามเวลาไทยอยู่แล้ว (กฎข้อ 23) วันที่จึงอ่านได้จากสิบตัวอักษรแรกตรง ๆ
 * ไม่ต้องแปลงเป็น Date แล้วแปลงกลับ ซึ่งเป็นขั้นตอนที่ทำให้วันเลื่อนมาตลอด
 *
 * @param {Object} task แถว Department_Task
 * @param {string} dayText วันที่ 'YYYY-MM-DD' ตามเวลาไทย
 * @return {boolean}
 */
function isTaskVisitingOn_(task, dayText) {
  if (!dayText) return false;

  var status = String(task[STATUS_FIELD[ENTITY.TASK]] || '');
  if (status === TASK_STATUS.COMPLETED || status === TASK_STATUS.CANCELLED) return false;

  return String(task['Visit_Start'] || '').substring(0, 10) === dayText;
}

/**
 * ขั้นตอนก่อนหน้าที่ยังไม่เสร็จ — ตัวที่กั้นไม่ให้ปิดขั้นตอนนี้ (SPEC 7.1, 7.2)
 *
 * ตรรกะล้วน รับแถวเข้ามาทั้งชุด จึงทดสอบได้ตรง ๆ และใช้ได้ทั้งตอนบันทึก (ด่านจริง)
 * และตอนวาดหน้าจอ (บอกว่าขั้นไหนยังกดไม่ได้) โดยไม่ต้องอ่านชีตซ้ำ
 *
 * เทียบด้วย Step_No ไม่ใช่ลำดับในอาร์เรย์ เพราะงวดที่ถูกลบไปทำให้เลขไม่ต่อกัน
 * และคืนตัวที่เลขน้อยที่สุด เพื่อให้ข้อความบอกขั้นที่ต้องไปทำก่อนจริง ๆ ไม่ใช่ขั้นที่อยู่ติดกัน
 *
 * @param {Object[]} steps ทุกขั้นตอนหรือทุกงวดของงานนั้น
 * @param {Object} step ขั้นตอนที่กำลังจะปิด
 * @return {Object|null} null = ไม่มีอะไรกั้น
 */
function earlierUnfinishedStep_(steps, step) {
  var target = Number(step['Step_No'] || 0);
  var blocking = null;

  for (var i = 0; i < steps.length; i++) {
    var other = steps[i];
    if (Number(other['Step_No'] || 0) >= target) continue;
    if (String(other['Status'] || '') === STEP_STATUS.COMPLETED) continue;
    if (!blocking || Number(other['Step_No'] || 0) < Number(blocking['Step_No'] || 0)) {
      blocking = other;
    }
  }
  return blocking;
}

/* ---------------------------------------------------------------------------
 * งวดงานที่แผนกเพิ่มเอง (SPEC 20.2 · ภาคผนวก ข.1)
 *
 * ฝั่ง Project ไม่มีงวดตั้งต้นอีกแล้ว เพราะตอนอนุมัติยังไม่มีใครรู้ว่างานจะแบ่งกี่งวด
 * คนที่รู้คือแผนกที่ลงมือทำ · งานที่จบในวันเดียวจะไม่มีงวดเลย ซึ่งถูกต้อง
 * --------------------------------------------------------------------------- */

/**
 * เพิ่มงวดงานหนึ่งงวดให้งานของแผนก Project
 *
 * ผ่าน changeStatus(TASK_UPDATE) ก่อนเสมอ เพราะที่นั่นคือที่เดียวที่ตรวจว่าใบงานถูกตีกลับอยู่
 * ผู้กดเป็นเจ้าของงานจริงไหม และงานอยู่ในสถานะที่แก้ได้ — เขียนชีตก่อนตรวจไม่ได้เด็ดขาด
 *
 * เลขงวดใหม่นับต่อจากเลขสูงสุดของงวดที่มีอยู่ตอนนั้น · เลขวนกลับมาใช้ซ้ำได้หลังลบงวด
 * และไม่เป็นอันตราย เพราะลบได้เฉพาะงวดที่ไม่มีไฟล์แนบเลย (ดู removeTaskPeriod)
 * จึงไม่มีไฟล์เก่าที่ถือเลขนั้นอยู่ให้ชนกัน — และตัวนับลำดับไฟล์นับจาก "ชื่อไฟล์ที่เคยออก"
 * ทั้งหมดรวมแถวที่ปิดใช้งานแล้ว (ดู nextFileSeq_) จึงไม่มีทางได้ชื่อซ้ำแม้เลขงวดจะซ้ำ
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @param {string} name ชื่องวดที่ผู้ใช้ตั้ง (ว่างได้ ระบบตั้งให้เป็น "งวดที่ N")
 * @param {Object} user ผู้ทำรายการ
 * @return {Object} แถวงวดที่สร้าง
 * @throws {Error} เมื่อไม่ใช่งานของแผนก Project สิทธิ์ไม่พอ หรือใบงานถูกตีกลับอยู่
 */
function addTaskPeriod(taskId, name, user) {
  var task = getTask(taskId);
  if (!task) throw new Error('ไม่พบงานของแผนก ' + taskId);

  if (String(task['Department']) !== DEPT.PROJECT) {
    throw new Error('งวดงานมีเฉพาะงานของแผนก Project — งานของแผนกอื่นใช้ขั้นตอนที่ตั้งไว้แล้ว');
  }

  var steps = listStepsByTask(taskId);
  var highest = 0;
  for (var i = 0; i < steps.length; i++) {
    var no = Number(steps[i]['Step_No'] || 0);
    if (no > highest) highest = no;
  }
  var stepNo = highest + 1;
  var stepName = String(name || '').trim() || ('งวดที่ ' + stepNo);

  changeStatus(ENTITY.TASK, taskId, ACTION.TASK_UPDATE, user, {
    remark: 'เพิ่มงวดงาน ' + stepName
  });

  var row = insertStep(buildStepRow_(taskId, stepNo, stepName, STEP_TYPE.PERIOD));

  writeAudit(ENTITY.TASK, taskId, ACTION.PERIOD_ADD, row['Step_ID'], '', stepName,
    'เพิ่มงวดงาน', { woId: task['WO_ID'], taskId: taskId });

  return row;
}

/**
 * ลบงวดงานที่เพิ่มผิด — ลบได้เฉพาะงวดที่ยังไม่เสร็จและยังไม่มีไฟล์แนบ
 *
 * สองเงื่อนไขนี้ทำให้การลบไม่ทำลายอะไรเลย: งวดที่ยังไม่เสร็จไม่มีผลงานผูกอยู่
 * และงวดที่ไม่มีไฟล์ก็ไม่มีเอกสารที่จะกลายเป็นไฟล์กำพร้าใน Drive
 * ถ้าขาดข้อใดข้อหนึ่ง ต้องปฏิเสธพร้อมบอกเหตุผลที่แก้ได้ ไม่ใช่บอกแค่ว่าลบไม่ได้
 *
 * @param {string} stepId เลขที่งวดงาน
 * @param {Object} user ผู้ทำรายการ
 * @return {Object} {taskId, stepName}
 * @throws {Error} เมื่อลบไม่ได้ตามเงื่อนไข
 */
function removeTaskPeriod(stepId, user) {
  var step = getStep(stepId);
  if (!step) throw new Error('ไม่พบงวดงานที่ต้องการลบ อาจถูกลบไปแล้ว');

  if (String(step['Type']) !== STEP_TYPE.PERIOD) {
    throw new Error('ลบได้เฉพาะงวดงานของแผนก Project — ขั้นตอนมาตรฐานของ Service ลบไม่ได้');
  }
  if (String(step['Status'] || '') === STEP_STATUS.COMPLETED) {
    throw new Error('งวดนี้ทำเสร็จไปแล้ว ลบไม่ได้ — ถ้าลงผิดงวด ให้เปิดงวดกลับเป็นยังไม่เสร็จก่อน');
  }

  var files = listFilesByStep(stepId);
  var active = 0;
  for (var i = 0; i < files.length; i++) {
    if (cellToBoolean_(files[i]['Is_Active'])) active++;
  }
  if (active) {
    throw new Error('งวดนี้มีไฟล์แนบอยู่ ' + active + ' ไฟล์ ลบไม่ได้ — ' +
      'ให้ลบไฟล์ในงวดนี้ออกก่อน แล้วจึงลบงวด');
  }

  var taskId = String(step['Task_ID']);
  var task = getTask(taskId);
  if (!task) throw new Error('ไม่พบงานของแผนกที่เป็นเจ้าของงวดนี้');

  var stepName = stepLabel_(step);
  changeStatus(ENTITY.TASK, taskId, ACTION.TASK_UPDATE, user, {
    remark: 'ลบ' + stepName
  });

  deleteStep(stepId);

  writeAudit(ENTITY.TASK, taskId, ACTION.PERIOD_REMOVE, stepId, step['Step_Name'] || '', '',
    'ลบงวดงาน', { woId: task['WO_ID'], taskId: taskId });

  return { taskId: taskId, stepName: stepName };
}

/* ---------------------------------------------------------------------------
 * ปิดงานของแผนก
 * --------------------------------------------------------------------------- */

/**
 * ปิดงานของแผนกตามลำดับใน SPEC 20.3
 *
 * 1. ตรวจว่าผู้กดเป็นแผนกเจ้าของงานจริง          (Guard taskOwner)
 * 2. ตรวจว่าทุก Step / งวด เสร็จครบ               (allStepsDone ที่คำนวณจากชีตในฟังก์ชันนี้)
 * 3. เปลี่ยน Task เป็น COMPLETED                  (changeStatus)
 * 4. เรียก recalcWoStatus() ในรายการเดียวกัน      (changeStatus ทำให้อัตโนมัติ — กฎข้อ 2)
 *
 * ข้อ 4 คือจุดที่งานร่วมทำงานถูกต้องโดยไม่ต้องเขียนเงื่อนไขพิเศษ: แผนกแรกที่ปิดงาน
 * จะเห็นว่าอีกแผนกยังไม่เสร็จ recalc จึงคง WO ไว้ที่ IN_PROGRESS จนกว่าแผนกสุดท้ายจะปิดหรือยกเลิก
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @param {Object} user ผู้ปิดงาน
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} แผนการเปลี่ยนสถานะ พร้อม plan.recalc ที่บอกผลการคำนวณสถานะ WO
 * @throws {Error} เมื่อไม่พบงาน สิทธิ์ไม่พอ ใบงานถูกตีกลับ หรือ Step ยังไม่ครบ
 */
function completeTask(taskId, user, expectedUpdatedDate) {
  var task = getTask(taskId);
  if (!task) throw new Error('ไม่พบงานของแผนก ' + taskId);

  var progress = stepProgressOf_(taskId);

  /*
   * ด่าน Report ที่บังคับ (SPEC 20.3 ข้อ 2) — ค้างมาตั้งแต่เฟส 4 เพราะยังไม่มีระบบแนบ
   *
   * ตรวจที่นี่ ไม่ใช่ที่หน้าเว็บ · หน้าเว็บซ่อนปุ่มให้ก็จริง แต่ใครก็ยิง api_completeTask
   * ตรง ๆ ได้ และงาน Project ที่ไม่มีงวดเลยจะไม่มีด่านอื่นเหลืออยู่เลยนอกจากด่านนี้
   */
  var missing = missingRequiredReports_(taskId);

  var plan = changeStatus(ENTITY.TASK, taskId, ACTION.TASK_COMPLETE, user, {
    allStepsDone: progress.allDone,
    requiredReportsOk: missing.length === 0,
    missingReportsMessage: missing.length
      ? missingReportsMessage_(missing, task['Department']) : '',
    expectedUpdatedDate: expectedUpdatedDate,
    fields: {
      'Completed_By':   actingEmail_(user),
      'Completed_Date': new Date()
    }
  });
  /*
   * แจ้งสองเหตุการณ์ได้ในการกดครั้งเดียว (SPEC 15.3 · 20.3 ข้อ 5)
   *   แผนกปิดงาน     เกิดทุกครั้ง
   *   ใบงานเสร็จสิ้น  เกิดเฉพาะเมื่อแผนกสุดท้ายปิดแล้วระบบคำนวณสถานะรวมใหม่เป็น COMPLETED
   * อ่านสถานะรวมใหม่หลัง changeStatus เพราะ recalcWoStatus ทำงานไปแล้วในนั้น
   */
  var woAfter = getWorkOrder(task['WO_ID']);
  notifyEvent_(NOTIFY_EVENT.TASK_COMPLETE, woAfter,
    { department: task['Department'], taskId: taskId });
  notifyWoClosedIfNeeded_(woAfter);
  return plan;
}

/**
 * นับความคืบหน้าของ Step และงวดงานของ Task หนึ่ง
 *
 * ห้าม hard-code จำนวนขั้นเป็น 3 หรือจำนวนงวดเป็น 3 (กฎข้อ 9) — อ่านจากแถวที่สร้างไว้จริง
 * Task ที่ไม่มี Step เลย (งาน Lab ตาม SPEC 7.3) ถือว่าครบ เพราะไม่มีอะไรให้ค้าง
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @return {Object} {total, done, allDone, pending: ชื่อขั้นที่ยังไม่เสร็จ}
 */
function stepProgressOf_(taskId) {
  return stepProgressFrom_(listStepsByTask(taskId));
}

/**
 * ความคืบหน้าจากขั้นตอนที่อ่านมาแล้ว — ตรรกะล้วน ไม่อ่านอะไรเพิ่ม
 *
 * แยกออกมาเพื่อให้หน้ารายการคิดความคืบหน้าจากขั้นตอนชุดที่ดึงมาทั้งหน้าแล้ว
 * โดยไม่ต้องยิงถามซ้ำทีละงาน สูตรการนับจึงมีที่เดียวทั้งสองเส้นทาง
 *
 * @param {Object[]} steps ขั้นตอนทั้งหมดของงานนั้น
 * @return {Object} {total, done, allDone, pending}
 */
function stepProgressFrom_(steps) {
  var done = 0;
  var pending = [];

  for (var i = 0; i < steps.length; i++) {
    if (String(steps[i]['Status'] || '') === STEP_STATUS.COMPLETED) done++;
    else pending.push(steps[i]['Step_Name'] || steps[i]['Step_ID']);
  }

  return { total: steps.length, done: done, allDone: pending.length === 0, pending: pending };
}

/* ---------------------------------------------------------------------------
 * ตีกลับและยกเลิก
 * --------------------------------------------------------------------------- */

/**
 * แผนกตีกลับใบงานให้ Admin/Sale แก้ไข ตามลำดับใน SPEC 20.5
 *
 * 1. ตรวจสิทธิ์และตรวจว่ากรอกเหตุผลแล้ว
 * 2. บันทึกสถานะปัจจุบันของ Task "ทุกตัว" ของใบงานนั้นลง Status_Before_Return
 *    ก่อนเปลี่ยนอะไรทั้งสิ้น — ไม่ใช่เฉพาะตัวที่กดตีกลับ เพราะงานร่วมมีอีกแผนกที่กำลังทำอยู่
 *    ถ้าไม่จำไว้ พออนุมัติกลับมาจะไม่มีใครรู้ว่าตอนถูกพักแต่ละแผนกทำถึงไหนแล้ว
 * 3. เปลี่ยน WO เป็น RETURNED และเพิ่ม Return_Count
 * 4. ไม่แตะสถานะของ Task และไม่ล้าง Step หรืองวดที่ทำไปแล้ว —
 *    Task ถูกพักเองโดยอัตโนมัติเพราะ Guard woNotReturned ตรวจสถานะ WO อยู่แล้ว (กฎข้อ 13)
 *
 * ฟังก์ชันนี้ไม่รับ expectedUpdatedDate ต่างจากตัวอื่นในไฟล์นี้ เพราะขั้นที่ 2 ต้องเขียน
 * Status_Before_Return ลงทุกแถวรวมทั้งแถวของผู้กดเอง ค่า Updated_Date ที่หน้าจอถืออยู่
 * จึงเก่าไปแล้วเสมอตั้งแต่ยังไม่ถึงขั้นที่ 3 · การตีกลับเป็นการกดปุ่มเดียวที่ไม่ได้แก้ข้อมูลในแถว
 * จึงไม่มีการแก้ของสองคนให้ชนกันตั้งแต่แรก
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @param {string} reason เหตุผลการตีกลับ — บังคับ
 * @param {Object} user ผู้ตีกลับ (แผนกเจ้าของงาน)
 * @return {Object} {plan, remembered, returnCount}
 * @throws {Error} เมื่อไม่พบงาน ไม่กรอกเหตุผล หรือสิทธิ์ไม่พอ
 */
function returnTask(taskId, reason, user) {
  var task = getTask(taskId);
  if (!task) throw new Error('ไม่พบงานของแผนก ' + taskId);
  if (isEmptyValue_(reason)) throw new Error('ต้องระบุเหตุผลการตีกลับ');

  var woId = task['WO_ID'];
  var wo = getWorkOrder(woId);
  if (!wo) throw new Error('ไม่พบใบงานต้นทางของงานแผนก ' + taskId);

  /*
   * ตรวจสิทธิ์ให้จบก่อนแตะชีต
   *
   * ขั้นที่ 2 เขียนข้อมูลลงทุก Task ของใบงาน ถ้าปล่อยให้ changeStatus() เป็นตัวปฏิเสธ
   * คนที่ไม่มีสิทธิ์จะทิ้ง Status_Before_Return ไว้เต็มไปหมดก่อนโดนปฏิเสธ
   * checkTransition() เป็นการตรวจล้วน ไม่เขียนอะไร จึงใช้ยิงลองก่อนได้ปลอดภัย
   */
  var check = checkTransition(ENTITY.TASK, task[STATUS_FIELD[ENTITY.TASK]], ACTION.TASK_RETURN, user, {
    reason: reason,
    department: task['Department'],
    route: wo['Route'],
    woId: woId,
    woStatus: wo[STATUS_FIELD[ENTITY.WO]]
  });
  if (!check.allowed) throw new Error(check.message);

  // ข้อ 2: จำสถานะเดิมของ Task ทุกตัวไว้ก่อน แล้วค่อยเปลี่ยนอะไรก็ได้
  var remembered = rememberTaskStatuses_(woId);

  // ข้อ 3–4: WO -> RETURNED ผ่าน woEffect ของ Transition · สถานะ Task คงเดิมเพราะ to เป็น KEEP_STATUS
  var plan = changeStatus(ENTITY.TASK, taskId, ACTION.TASK_RETURN, user, {
    reason: reason,
    fields: { 'Return_Reason': reason }
  });

  var returnCount = bumpReturnCount_(woId, reason);

  // แผนกตีกลับ = ใบงานกลับไปหาผู้เปิดใบงานเหมือนกัน จึงเข้าห้อง Admin พร้อมเหตุผล
  notifyEvent_(NOTIFY_EVENT.RETURN, getWorkOrder(woId),
    { reason: reason, department: task['Department'] });
  return { plan: plan, remembered: remembered, returnCount: returnCount };
}

/**
 * เพิ่มตัวนับการตีกลับของใบงานพร้อมบันทึกเหตุผล (SPEC 8 · 20.5 ข้อ 3)
 *
 * แยกจาก changeStatus() เพราะสองคอลัมน์นี้อยู่บนแถว WorkOrder ส่วนรายการที่ผู้ใช้กด
 * เป็น Action ระดับ Task ซึ่ง fields ของมันเขียนลงแถว Department_Task
 * ไม่ใช่การเปลี่ยนสถานะ จึงไม่ขัดกฎข้อ 1 แต่ยังเขียน Audit ไว้ให้ตามรอยได้
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} reason เหตุผลการตีกลับ
 * @return {number} จำนวนครั้งที่ถูกตีกลับหลังเพิ่มแล้ว
 */
function bumpReturnCount_(woId, reason) {
  var wo = getWorkOrder(woId);
  var before = Number(wo['Return_Count'] || 0);
  var after = before + 1;

  updateWorkOrder(woId, { 'Return_Reason': reason, 'Return_Count': after });
  writeAudit(ENTITY.WO, woId, ACTION.TASK_RETURN, 'Return_Count', before, after, reason,
    { woId: woId });

  return after;
}

/**
 * แผนกยกเลิกงานของตัวเอง — ทำได้ทันทีโดยไม่ต้องขออนุมัติ แต่ต้องกรอกเหตุผล (SPEC 8)
 *
 * ผู้อนุมัติของสายนั้นและ ADMIN/SALE ยกเลิกแทนได้เช่นกัน (Guard taskOwnerOrManager)
 * หลังยกเลิก changeStatus() จะเรียก recalcWoStatus() ให้เอง ซึ่งเป็นตัวตัดสินว่า
 * ใบงานจะกลายเป็น CANCELLED (ยกเลิกครบทุกแผนก) หรือ COMPLETED (อีกแผนกเสร็จแล้ว) ตามกฎในหัวข้อ 8
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @param {string} reason เหตุผลการยกเลิก — บังคับ
 * @param {Object} user ผู้ยกเลิก
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} แผนการเปลี่ยนสถานะ พร้อม plan.recalc
 * @throws {Error} เมื่อไม่พบงาน ไม่กรอกเหตุผล สิทธิ์ไม่พอ หรือใบงานถูกตีกลับอยู่
 */
function cancelTask(taskId, reason, user, expectedUpdatedDate) {
  var task = getTask(taskId);
  if (!task) throw new Error('ไม่พบงานของแผนก ' + taskId);
  if (isEmptyValue_(reason)) throw new Error('ต้องระบุเหตุผลการยกเลิกงาน');

  var plan = changeStatus(ENTITY.TASK, taskId, ACTION.TASK_CANCEL, user, {
    reason: reason,
    expectedUpdatedDate: expectedUpdatedDate,
    fields: { 'Cancel_Reason': reason }
  });
  // แจ้งห้อง Admin และผู้อนุมัติของสายนั้นทุกครั้ง พร้อมเหตุผล (SPEC 8 · 15.3)
  var afterCancel = getWorkOrder(task['WO_ID']);
  notifyEvent_(NOTIFY_EVENT.TASK_CANCEL, afterCancel,
    { reason: reason, department: task['Department'], taskId: taskId });

  /*
   * การยกเลิกงานของแผนกสุดท้าย ทำให้ทั้งใบปิดตามไปด้วย (SPEC 8 · A-5)
   * ใบจะกลายเป็น CANCELLED เมื่อทุกแผนกยกเลิกครบ หรือ COMPLETED เมื่อแผนกอื่นปิดงานไปแล้ว
   * ทั้งสองทางต้องแจ้งระดับใบงาน ซึ่งกติกาจำนวน Task จะเป็นตัวตัดสินอีกชั้นว่าซ้ำไหม
   */
  notifyWoClosedIfNeeded_(afterCancel, reason);
  return plan;
}


/* ---------------------------------------------------------------------------
 * กำหนดวันเวลาเข้างานของแผนก (SPEC 13 · 17.3)
 *
 * **เก็บแยกจาก WorkOrder.Start_Date / End_Date โดยตั้งใจ** สองอย่างนี้ตอบคนละคำถาม
 * ของใบงานคือสิ่งที่ตกลงกับลูกค้า ของแผนกคือวันที่ช่างไปจริง · ถ้าใช้ช่องเดียวกัน
 * แล้วแผนกเขียนทับ คำถาม "เลยกำหนดแล้วช่างนัดไว้วันไหน" จะตอบไม่ได้เลย
 * ซึ่งเป็นคำถามหลักที่ขอบเขตวันการทำงานมีไว้ตอบ
 * --------------------------------------------------------------------------- */

/** คอลัมน์เวลานัดหมายของงานแผนก — ประกาศไว้ที่เดียว (SPEC 13) */
var TASK_VISIT_FIELDS = Object.freeze(['Visit_Start', 'Visit_End']);

/**
 * กำหนดหรือแก้วันเวลาที่แผนกจะเข้างาน
 *
 * ผ่าน changeStatus(TASK_UPDATE) ก่อนเสมอ เพราะที่นั่นคือที่เดียวที่ตรวจว่าใบงาน
 * ถูกตีกลับอยู่ไหม ผู้กดเป็นเจ้าของงานจริงไหม และงานอยู่ในสถานะที่แก้ได้ไหม —
 * ซึ่ง `from: [IN_PROGRESS]` ของ Transition นั้นบังคับ "กรอกได้หลังกดรับงานแล้ว"
 * ให้เราอยู่แล้ว ไม่ต้องเขียนเงื่อนไขซ้ำที่นี่
 *
 * **แก้ไขได้เรื่อย ๆ** เพราะแผนงานเลื่อนได้จริง ไม่ใช่กรอกครั้งเดียวแล้วล็อก
 * และ **ไม่ส่ง Telegram** ตามที่ตกลงกันไว้ว่ายกเลิกการแจ้งเตือนเรื่องกำหนดเวลา (SPEC 15.3)
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @param {string} visitStart 'YYYY-MM-DDTHH:mm' หรือค่าว่างเพื่อล้าง
 * @param {string} visitEnd 'YYYY-MM-DDTHH:mm' หรือค่าว่างเพื่อล้าง
 * @param {Object} user ผู้ทำรายการ
 * @return {Object} {plan, task} — task คือแถวหลังแก้ไข
 * @throws {Error} เมื่อไม่พบงาน สิทธิ์ไม่พอ ใบงานถูกตีกลับ หรือรูปแบบเวลาไม่ถูกต้อง
 */
function setTaskVisit(taskId, visitStart, visitEnd, user) {
  var task = getTask(taskId);
  if (!task) throw new Error('ไม่พบงานของแผนก ' + taskId);

  var start = normalizeVisitText_(visitStart, fieldLabel('Visit_Start'));
  var end = normalizeVisitText_(visitEnd, fieldLabel('Visit_End'));

  /*
   * เทียบเป็นข้อความได้ตรง ๆ เพราะรูปแบบ 'YYYY-MM-DDTHH:mm' เรียงลำดับแบบข้อความ
   * ได้ถูกต้องอยู่แล้ว · การแปลงเป็น Date เพื่อเทียบคือการเพิ่มขั้นตอนที่ทำให้วันเลื่อน
   */
  if (start && end && end < start) {
    throw new Error('วันเวลาที่ออกงานต้องไม่มาก่อนวันเวลาที่เข้างาน');
  }

  var plan = changeStatus(ENTITY.TASK, taskId, ACTION.TASK_UPDATE, user, {
    remark: 'กำหนดวันเวลาเข้างานของแผนก'
  });

  var patch = { 'Visit_Start': start, 'Visit_End': end };
  var saved = updateTask(taskId, patch);

  /*
   * บันทึกระดับฟิลด์ ทีละช่องที่เปลี่ยนจริง (SPEC 13)
   *
   * changeStatus บันทึกไปแล้วว่ามีการอัปเดตงานนี้ แต่ไม่รู้ว่าช่องไหนและจากค่าอะไร
   * ซึ่งเป็นสิ่งเดียวที่ตอบได้ว่า "ใครเลื่อนวันนัด จากวันไหนเป็นวันไหน" — คำถามที่
   * จะถูกถามแน่นอนในวันที่งานไม่ทันกำหนด · ช่องที่ค่าไม่เปลี่ยนไม่ต้องบันทึก
   * ไม่งั้นการกดบันทึกโดยไม่แก้อะไรจะทิ้งแถวเปล่าไว้ทุกครั้ง
   */
  for (var i = 0; i < TASK_VISIT_FIELDS.length; i++) {
    var field = TASK_VISIT_FIELDS[i];
    var before = String(task[field] || '');
    var after = String(saved[field] || '');
    if (before === after) continue;

    writeAudit(ENTITY.TASK, taskId, ACTION.TASK_UPDATE, field, before, after,
      fieldLabel(field), { woId: task['WO_ID'], taskId: taskId });
  }

  return { plan: plan, task: saved };
}

/**
 * ตรวจรูปแบบเวลานัดหมายที่คนกรอก — ต้องเป็น 'YYYY-MM-DDTHH:mm' หรือว่าง
 *
 * เก็บเป็นข้อความตามที่ผู้ใช้เห็นบนจอ ห้ามแปลงเป็นชนิดเวลา (กฎข้อ 18 · 23)
 * แต่ก็ต้องไม่รับข้อความอะไรก็ได้เข้ามา ไม่งั้นค่าที่เรียงลำดับไม่ได้จะเข้าไปอยู่
 * ในคอลัมน์ที่หน้า "งานวันนี้" กรองด้วยคำนำหน้าวัน แล้วงานนั้นจะไม่โผล่ที่ไหนเลย
 *
 * @param {*} value ค่าจากหน้าจอ
 * @param {string} label ชื่อช่องภาษาไทย ใช้ในข้อความแจ้งผู้ใช้ (SPEC 17.4)
 * @return {string} ข้อความที่ตรวจแล้ว หรือค่าว่าง
 * @throws {Error} เมื่อรูปแบบไม่ถูกต้อง
 */
function normalizeVisitText_(value, label) {
  var text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return '';

  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    throw new Error('รูปแบบของ' + label + 'ไม่ถูกต้อง ต้องเป็นวันที่พร้อมเวลา เช่น 30-09-2026 08:30');
  }
  return text;
}

/**
 * ของทุกอย่างที่หน้ารายการต้องใช้ ดึงมาเป็นชุดเดียว แทนการวนดึงทีละใบ (SPEC 22.5)
 *
 * **นี่คือหัวใจของการทำให้หน้ารายการไม่แพงขึ้นตามจำนวนงาน**
 *
 * เดิม `taskViewOf_` อ่านใบงาน ขั้นตอน และงานของแผนกอื่น แยกทีละใบ คิดเป็นราว
 * สี่คำขอต่องานหนึ่งใบ · งาน 20 ใบจึงเป็น 80 คำขอ ซึ่งบนชีตแทบไม่มีราคาเพราะ
 * ข้อมูลถูกอ่านมาทั้งแผ่นแล้ว แต่บน Supabase ทุกครั้งคือการเดินทางไป-กลับจริง
 * และไม่มีอะไรผิดให้เห็นเลย นอกจากหน้าที่ค่อย ๆ ช้าลงตามจำนวนงานที่สะสม
 *
 * ตอนนี้เป็นสามคำขอคงที่ ไม่ว่าหน้านั้นจะมีงานหนึ่งใบหรือยี่สิบใบ —
 * ใบงานทั้งหน้าหนึ่งคำขอ · งานของทุกแผนกบนใบเหล่านั้นหนึ่งคำขอ · ขั้นตอนของ
 * งานทั้งหมดนั้นหนึ่งคำขอ
 *
 * **ขอบเขตของรายการมาจากขนาดหน้าที่เราตั้งเอง ไม่ใช่จากจำนวนข้อมูล** (กฎข้อ 29)
 * ถ้าวันหนึ่งมีคนเอาฟังก์ชันนี้ไปใช้กับรายการที่ไม่ได้แบ่งหน้า ตัวกรอง `in.(...)`
 * จะยาวตามจำนวนงานแล้วชนเพดานความยาว URL ซึ่งเป็นการย้ายปัญหา ไม่ใช่แก้ปัญหา
 *
 * @param {Object[]} tasks แถว Department_Task ของหน้านั้น
 * @return {Object} {wos, tasksByWo, stepsByTask}
 */
function taskBundleOf_(tasks) {
  var empty = { wos: {}, tasksByWo: {}, stepsByTask: {} };
  if (!tasks || !tasks.length) return empty;

  var woIds = [];
  for (var i = 0; i < tasks.length; i++) woIds.push(String(tasks[i]['WO_ID'] || ''));

  var wos = {};
  var woRows = findWorkOrdersIn(woIds);
  for (var w = 0; w < woRows.length; w++) wos[String(woRows[w]['WO_ID'])] = woRows[w];

  /*
   * งานของทุกแผนกบนใบเหล่านี้ — ชุดนี้ครอบทั้งงานที่อยู่ในหน้าและงานของแผนกอื่น
   * บนใบเดียวกัน จึงไม่ต้องยิงถามพี่น้องแยกอีกรอบ · และ `Task_ID` ที่ต้องใช้ถาม
   * ขั้นตอนก็มาจากชุดนี้ทั้งหมด ไม่ต้องประกอบเองจากสองที่ให้มีโอกาสตกหล่น
   */
  var sibling = listTasksByWos(woIds);
  var taskIds = [];
  for (var s = 0; s < sibling.length; s++) taskIds.push(String(sibling[s]['Task_ID'] || ''));

  return {
    wos:         wos,
    tasksByWo:   groupRowsBy_(sibling, 'WO_ID'),
    stepsByTask: groupRowsBy_(listStepsByTasks(taskIds), 'Task_ID')
  };
}

/**
 * งานของแผนกหนึ่งหน้า พร้อมข้อมูลครบสำหรับวาดการ์ด (SPEC 17.2 · 17.3)
 *
 * **ทางเดียวที่หน้ารายการของแผนกได้ข้อมูลมา** ทั้งสี่มุมมองเดินทางนี้เหมือนกันหมด
 * ต่างกันแค่ชุดสถานะกับลำดับ ซึ่งมาจาก `TASK_VIEWS` ที่เดียว (กฎข้อ 1)
 *
 * ไม่มีมุมมองไหนอ่านทั้งตารางมาคัดในหน่วยความจำ และไม่มีมุมมองไหนยิงถามทีละแถว
 * จำนวนคำขอจึงคงที่ ไม่ว่าแผนกนั้นจะมีงานสิบใบหรือหมื่นใบ
 *
 * @param {string} department แผนกเจ้าของงาน (ค่าจาก DEPT)
 * @param {Object} [options] {view, page, includeClosed}
 * @return {Object} {rows, total, page, pageSize, view, today}
 */
function listTaskPage_(department, options) {
  options = options || {};
  var today = thaiDayOf_(new Date());
  var view = taskViewByKey_(options.view);

  var statuses, order, dayText = '';
  if (view) {
    statuses = view.statuses.slice();
    order    = view.order;
    /*
     * มุมมองที่คัดด้วยวันที่ ตัดสิน "วันนี้" ที่ฝั่งเซิร์ฟเวอร์ด้วยวันไทยเสมอ (กฎข้อ 19)
     * ถ้าให้เบราว์เซอร์ส่งวันมาเอง เครื่องที่ตั้งเขตเวลาผิดจะเห็นงานของวันอื่น
     * โดยไม่มีอะไรบอก และเลวร้ายกว่านั้นคือส่งวันอะไรมาก็ได้
     */
    if (view.byDate) dayText = today;
  } else {
    /*
     * ไม่ได้ระบุมุมมอง = ขอทุกสถานะที่ผู้เรียกสนใจ · เส้นทางนี้มีไว้ให้ผู้เรียก
     * ที่ต้องการภาพรวม ไม่ใช่หน้าจอ ซึ่งส่งมุมมองมาเสมอ · ยังแบ่งหน้าเหมือนกัน
     * เพราะการอ่านที่ไม่มีเพดานคือสิ่งที่กฎข้อ 28 ห้ามไว้ ไม่มีข้อยกเว้นให้ใคร
     */
    statuses = options.includeClosed ? TASK_ALL_STATUSES.slice() : TASK_OPEN_STATUSES.slice();
    order    = TASK_DEFAULT_ORDER;
  }

  var page = Math.max(1, Number(options.page) || 1);
  var got  = findTaskPage(department, statuses, dayText, order,
    TASK_PAGE_SIZE, (page - 1) * TASK_PAGE_SIZE);

  /*
   * คัดซ้ำด้วยตรรกะตัวเดียวกับที่ตัวนับบนเมนูใช้ · ฐานข้อมูลกรองมาให้แล้วทั้งสองเงื่อนไข
   * การคัดซ้ำจึงไม่ควรตัดอะไรออกเลย · ถ้าวันหนึ่งมันตัด แปลว่าสองฝั่งเริ่มไม่ตรงกัน
   * ซึ่งเป็นอาการที่ต้องเห็นตั้งแต่ตอนนั้น ไม่ใช่ตอนที่ผู้ใช้ทักว่าตัวเลขไม่ตรง
   */
  var rows = got.rows;
  if (dayText) {
    var kept = [];
    for (var k = 0; k < rows.length; k++) {
      if (isTaskVisitingOn_(rows[k], dayText)) kept.push(rows[k]);
    }
    rows = kept;
  }

  var bundle = taskBundleOf_(rows);
  var out = [];
  for (var i = 0; i < rows.length; i++) out.push(taskViewOf_(rows[i], bundle));

  return {
    rows:     out,
    total:    got.total,
    page:     page,
    pageSize: TASK_PAGE_SIZE,
    view:     view ? view.key : '',
    today:    today
  };
}

/**
 * งานของแผนกที่นัดไว้วันนี้ และยังไม่จบ (SPEC 17.3 — หน้า "งานวันนี้")
 *
 * **จุดประสงค์: ช่างเปิดเว็บแล้วรู้ทันทีว่าวันนี้ต้องไปทำ WO อะไรบ้าง**
 * แสดงงานของทั้งแผนก ไม่รู้จักช่างเป็นรายคน ซึ่งเป็นการตัดสินใจที่ตกลงกันแล้ว —
 * ไม่มีช่องผู้รับผิดชอบ ไม่ผูกกับบัญชีผู้ใช้ และไม่มีหน้าจอมอบงาน
 *
 * @param {string} department แผนกเจ้าของงาน (ค่าจาก DEPT)
 * @param {number} [page] หน้าที่ต้องการ เริ่มที่ 1
 * @return {Object[]} ข้อมูลพร้อมแสดงผลจาก taskViewOf_()
 */
function listTodayTasks(department, page) {
  if (!department) return [];
  return listTaskPage_(department, { view: TASK_TODAY_VIEW, page: page }).rows;
}

/* ---------------------------------------------------------------------------
 * มุมมองงานของแผนก
 * --------------------------------------------------------------------------- */

/**
 * ประกอบข้อมูลงานของแผนกหนึ่งให้หน้าจอใช้ได้ครบในครั้งเดียว (SPEC 17.2)
 *
 * หน้าจอต้องรู้มากกว่าตัว Task เอง จึงรวมมาให้ที่นี่ทีเดียว แทนที่จะให้หน้าเว็บยิงถามทีละอย่าง
 *   - ขั้นตอนหรืองวดงานจริงที่สร้างไว้ อ่านจากตาราง ไม่ได้กำหนดจำนวนตายตัว (กฎข้อ 9)
 *   - งานของแผนกอื่นในใบเดียวกัน เพราะคนทำงานต้องรู้ว่าปิดของตัวเองแล้วใบงานจะปิดตามหรือยังต้องรอ
 *   - เหตุที่กดอะไรไม่ได้ เพื่อให้หน้าจออธิบายเป็นประโยคได้ ไม่ใช่ทำปุ่มเทาเฉย ๆ (SPEC 17.3)
 *   - เวลาทุกค่าที่เอาไปแสดง ผ่าน formatForDisplay_() จุดเดียว (กฎข้อ 19)
 *
 * **อ่านทุกอย่างจากชุดที่ถูกดึงมาแล้ว ไม่ยิงคำขอเองแม้แถวเดียว** (SPEC 22.5)
 * ฟังก์ชันนี้ถูกเรียกหนึ่งครั้งต่อหนึ่งแถวในหน้า ถ้ามันอ่านฐานข้อมูลเอง
 * ต้นทุนของทั้งหน้าจะโตตามจำนวนงานทันที ซึ่งเป็นสิ่งที่การรวบของมาเป็นชุดมีไว้เพื่อกำจัด
 *
 * @param {Object} task แถว Department_Task
 * @param {Object} bundle ของทั้งหน้าจาก taskBundleOf_()
 * @return {Object} ข้อมูลพร้อมแสดงผล
 */
function taskViewOf_(task, bundle) {
  bundle = bundle || taskBundleOf_([task]);

  var woId = task['WO_ID'];
  var wo = bundle.wos[String(woId)] || {};
  var taskId = task['Task_ID'];

  var steps = (bundle.stepsByTask[String(taskId)] || []).slice();
  steps.sort(function (a, b) { return Number(a['Step_No'] || 0) - Number(b['Step_No'] || 0); });

  var stepViews = [];
  for (var i = 0; i < steps.length; i++) {
    stepViews.push({
      stepId:   steps[i]['Step_ID'],
      stepNo:   Number(steps[i]['Step_No'] || 0),
      stepName: steps[i]['Step_Name'],
      type:     steps[i]['Type'],
      status:   steps[i]['Status'],
      done:     String(steps[i]['Status'] || '') === STEP_STATUS.COMPLETED,
      completedBy:   displayNameOf_(steps[i]['Completed_By']),
      completedDate: formatForDisplay_(steps[i]['Completed_Date'])
    });
  }

  // งานของแผนกอื่นในใบเดียวกัน — ใบงานร่วมจะปิดก็ต่อเมื่อทุกแผนกปิดหรือยกเลิกครบ (SPEC 8)
  var others = [];
  var siblings = bundle.tasksByWo[String(woId)] || [];
  for (var s = 0; s < siblings.length; s++) {
    if (siblings[s]['Task_ID'] === taskId) continue;
    var sibProgress = stepProgressFrom_(bundle.stepsByTask[String(siblings[s]['Task_ID'])] || []);
    others.push({
      department: siblings[s]['Department'],
      status:     siblings[s][STATUS_FIELD[ENTITY.TASK]],
      done:       sibProgress.done,
      total:      sibProgress.total,
      cancelReason: siblings[s]['Cancel_Reason'] || ''
    });
  }

  var woStatus = wo[STATUS_FIELD[ENTITY.WO]] || '';
  var paymentBlocked = cellToBoolean_(wo['Payment_Required']) &&
    String(wo['Payment_Status'] || PAYMENT.UNPAID) !== PAYMENT.PAID;

  return {
    taskId:     taskId,
    woId:       woId,
    department: task['Department'],
    status:     task[STATUS_FIELD[ENTITY.TASK]],
    steps:      stepViews,
    progress:   stepProgressFrom_(steps),
    others:     others,
    isJoint:    others.length > 0,

    workOrder: {
      woId:         woId,
      status:       woStatus,
      customerName: wo['Customer_Name'] || '',
      project:      wo['Project'] || '',
      location:     wo['Location'] || '',
      contact:      wo['Contact'] || '',
      phone:        isEmptyValue_(wo['Phone']) ? '' : String(wo['Phone']),
      jobDescription: wo['Job_Description'] || '',
      assignmentType: wo['Assignment_Type'] || '',
      returnReason:   wo['Return_Reason'] || '',
      paymentRequired: cellToBoolean_(wo['Payment_Required']),
      paymentStatus:   wo['Payment_Status'] || PAYMENT.UNPAID
    },

    /* เหตุที่ทำรายการไม่ได้ หน้าจอเอาไปเขียนเป็นประโยคบอกผู้ใช้ ไม่ใช่ทำปุ่มเทาเฉย ๆ */
    blocked: {
      returned: woStatus === WO_STATUS.RETURNED,
      payment:  paymentBlocked
    },

    /*
     * เปิดงานที่ปิดแล้วขึ้นมาทำต่อได้หรือไม่ (SPEC 20.6 · กฎข้อ 12)
     *
     * **ฝั่งเซิร์ฟเวอร์ตัดสิน หน้าจอไม่รู้กติกาเลยสักข้อ** · เงื่อนไขมีสามชั้นและ
     * เปลี่ยนได้ในอนาคต ถ้าหน้าจอคัดลอกไปเขียนเอง วันที่กติกาเปลี่ยนจะมีที่หนึ่ง
     * ที่ได้แก้และอีกที่หนึ่งที่ลืม แล้วปุ่มจะโผล่ในที่ที่กดแล้วถูกปฏิเสธ
     *
     * ใบที่ยกเลิกแล้วเปิดใหม่ไม่ได้ เพราะการยกเลิกเป็นสถานะปลายทาง — เงื่อนไข
     * `woStatus === COMPLETED` ครอบเรื่องนี้ไว้แล้วโดยไม่ต้องเขียนแยก
     *
     * นี่เป็นแค่การซ่อนปุ่ม ไม่ใช่การป้องกัน · ด่านจริงอยู่ที่ชั้น 09_Api และ
     * ตาราง Transition ซึ่งตรวจซ้ำทุกครั้งไม่ว่าคำขอจะมาจากไหน (กฎข้อ 7)
     */
    canReopen: String(task[STATUS_FIELD[ENTITY.TASK]] || '') === TASK_STATUS.COMPLETED &&
      woStatus === WO_STATUS.COMPLETED &&
      REOPEN_DEPARTMENTS.indexOf(task['Department']) !== -1,

    /*
     * วันเวลาที่แผนกจะเข้างานจริง (SPEC 13 · 17.3)
     *
     * ส่งค่าดิบไปด้วย ไม่ใช่ส่งแต่ข้อความที่จัดรูปแล้ว เพราะช่องกรอกของเบราว์เซอร์
     * ต้องได้ 'YYYY-MM-DDTHH:mm' เท่านั้น (กฎข้อ 20) ถ้าส่งไปแต่ dd-MM-yyyy
     * ช่องเลือกวันเวลาจะว่างเปล่าโดยไม่มี error ให้เห็นเลยสักอย่าง
     *
     * `suggest` คือค่าที่เติมให้อัตโนมัติตอนเปิดช่องครั้งแรก มาจากกำหนดการของใบงาน
     * เพราะส่วนใหญ่ช่างจะไปตามที่ตกลงกับลูกค้าอยู่แล้ว ถ้าตรงกันก็กดผ่านได้เลย
     * ไม่ต้องพิมพ์ใหม่ · ตัดสินที่ฝั่งเซิร์ฟเวอร์ เพื่อไม่ให้หน้าจอต้องรู้กติกานี้เอง
     */
    visit: {
      start:     String(task['Visit_Start'] || ''),
      end:       String(task['Visit_End'] || ''),
      startText: formatForDisplay_(task['Visit_Start']),
      endText:   formatForDisplay_(task['Visit_End']),
      isSet:     !!String(task['Visit_Start'] || ''),
      /*
       * "นัดไว้วันนี้ไหม" ตัดสินที่ฝั่งเซิร์ฟเวอร์ด้วยวันไทย ไม่ใช่ให้เบราว์เซอร์ตัดสิน
       * เบราว์เซอร์ของช่างตั้งเขตเวลาอะไรก็ได้ และเครื่องที่ตั้งผิดจะเห็นงานของวันอื่น
       * โดยไม่มีอะไรบอกเลย · ตัวนับบนเมนูอ่านค่านี้ จึงตรงกับรายการที่เห็นเสมอ
       */
      isToday:   isTaskVisitingOn_(task, thaiDayOf_(new Date())),
      suggest: {
        start: appointmentTextOf_(wo['Start_Date']),
        end:   appointmentTextOf_(wo['End_Date'])
      }
    },

    /* เวลาทุกค่าที่เอาไปแสดง จัดรูปแบบมาจากฝั่งเซิร์ฟเวอร์แล้ว หน้าเว็บไม่ต้องแปลงเอง (กฎข้อ 19) */
    display: {
      createdDate:   formatForDisplay_(wo['Created_Date']),
      startDate:     formatForDisplay_(wo['Start_Date']),
      endDate:       formatForDisplay_(wo['End_Date']),
      assignedDate:  formatForDisplay_(task['Assigned_Date']),
      acceptedDate:  formatForDisplay_(task['Accepted_Date']),
      completedDate: formatForDisplay_(task['Completed_Date']),
      paymentDate:   formatForDisplay_(wo['Payment_Date'])
    },

    acceptedBy:   displayNameOf_(task['Accepted_By']),
    completedBy:  displayNameOf_(task['Completed_By']),
    cancelReason: task['Cancel_Reason'] || '',
    returnReason: task['Return_Reason'] || ''
  };
}

/**
 * รายการงานที่แผนกหนึ่งต้องทำ พร้อมข้อมูลใบงานและความคืบหน้าของ Step
 *
 * งานที่ยกเลิกหรือปิดแล้วยังต้องเปิดดูได้ (SPEC 17.2) จึงมีตัวเลือกให้รวมมาด้วย
 * แต่ใบที่ถูกตีกลับต้อง "ยังเห็น" ในรายการปกติเสมอ ไม่ถูกกรองทิ้ง
 * ไม่งั้นผู้ใช้จะงงว่างานที่ทำค้างไว้หายไปไหน
 *
 * @param {string} department แผนกเจ้าของงาน (ค่าจาก DEPT)
 * @param {Object} [options] {includeClosed: รวมงานที่ปิดหรือยกเลิกแล้วด้วย}
 * @return {Object[]} ข้อมูลพร้อมแสดงผลจาก taskViewOf_()
 */
function listTasksForDepartment(department, options) {
  options = options || {};
  return listTaskPage_(department, {
    view:          options.view,
    page:          options.page,
    includeClosed: !!options.includeClosed
  }).rows;
}
