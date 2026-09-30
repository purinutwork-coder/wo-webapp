/**
 * 01_Repo_Step.gs — อ่าน/เขียนแท็บ Task_Step เท่านั้น (SPEC 13)
 *
 * เป็น wrapper บาง ๆ ของ 01_Repo_Sheet.gs — ห้ามมีตรรกะธุรกิจ
 * จำนวน Step และจำนวนงวดงานให้อ่านจากแถวที่สร้างไว้จริง ห้าม hard-code เป็น 3 (SPEC 21)
 *
 * Task_Step ไม่มีคอลัมน์สถานะใช้งาน จึงลบงวดที่เพิ่มผิดด้วยการลบแถวจริง
 * ซึ่งเป็นข้อยกเว้นที่ประกาศไว้ใน DELETABLE_SHEETS และมีเงื่อนไขคุมอยู่ที่ชั้นบริการ
 */

/**
 * อ่าน Step หรืองวดงานตามเลขที่
 * @param {string} stepId เลขที่ Step
 * @return {Object|null}
 */
function getStep(stepId) {
  return findOne_(SHEET.TASK_STEP, 'Step_ID', stepId);
}

/**
 * อ่าน Step และงวดงานทั้งหมดของ Task หนึ่ง
 * @param {string} taskId เลขที่งานของแผนก
 * @return {Object[]}
 */
function listStepsByTask(taskId) {
  return findBy_(SHEET.TASK_STEP, 'Task_ID', taskId);
}

/**
 * เพดานจำนวนขั้นตอนและงวดต่องานหนึ่งใบ
 *
 * ขั้นตอนตั้งต้นมาจากแม่แบบซึ่งมีไม่กี่รายการ แต่งวดงานถูกเพิ่มได้เรื่อย ๆ
 * ตัวเลขนี้จึงเผื่อไว้มาก และถ้าวันหนึ่งเต็มจริง queryRows_ จะบันทึกลง System_Log ให้เอง
 * ไม่ตัดทิ้งเงียบ ๆ
 */
var STEP_ROWS_PER_TASK = 50;

/**
 * อ่านขั้นตอนและงวดงานของงานหลายใบ — ทั้งชุดในคำขอเดียว
 *
 * เรียงตาม Task_ID แล้ว Step_No เพื่อให้ผู้เรียกไม่ต้องเรียงเองอีกรอบ
 *
 * @param {string[]} taskIds เลขที่งานของแผนก
 * @return {Object[]}
 */
function listStepsByTasks(taskIds) {
  return queryRowsIn_(SHEET.TASK_STEP, 'Task_ID', taskIds || [], {
    order: [{ column: 'Task_ID', ascending: true }, { column: 'Step_No', ascending: true }],
    rowsPerValue: STEP_ROWS_PER_TASK
  });
}

/**
 * อ่าน Step และงวดงานทั้งหมด
 * @return {Object[]}
 */
function listSteps() {
  return readAll_(SHEET.TASK_STEP);
}

/**
 * เขียน Step ใหม่ 1 แถว
 * @param {Object} step ข้อมูล Step
 * @return {Object}
 */
function insertStep(step) {
  return appendRow_(SHEET.TASK_STEP, step);
}

/**
 * เขียน Step หลายแถวพร้อมกัน — ใช้ตอนอนุมัติเพื่อสร้าง Step ตั้งต้นหรืองวดงานทั้งชุด
 * @param {Object[]} steps รายการ Step
 * @return {Object[]}
 */
function insertSteps(steps) {
  return appendRows_(SHEET.TASK_STEP, steps);
}

/**
 * แก้ไข Step
 * @param {string} stepId เลขที่ Step
 * @param {Object} patch เฉพาะคอลัมน์ที่ต้องการเปลี่ยน
 * @return {Object}
 */
function updateStep(stepId, patch) {
  return updateRow_(SHEET.TASK_STEP, 'Step_ID', stepId, patch);
}

/**
 * ลบงวดงานที่เพิ่มผิดออกจากชีต — เงื่อนไขว่าลบได้หรือไม่อยู่ที่ removeTaskPeriod()
 * @param {string} stepId เลขที่ Step
 * @return {boolean} true = ลบแล้ว
 */
function deleteStep(stepId) {
  return deleteRowByKey_(SHEET.TASK_STEP, 'Step_ID', stepId);
}
