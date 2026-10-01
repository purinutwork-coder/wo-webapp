/**
 * 01_Repo_Task.gs — อ่าน/เขียนแท็บ Department_Task เท่านั้น (SPEC 13)
 *
 * เป็น wrapper บาง ๆ ของ 01_Repo_Sheet.gs — ห้ามมีตรรกะธุรกิจ ห้ามตรวจสถานะ
 * การคำนวณสถานะ WO จาก Task เป็นหน้าที่ของ recalcWoStatus() ใน 02_StateMachine.gs
 *
 * Department_Task ไม่มีคอลัมน์สถานะใช้งานตาม SPEC 13 จึงไม่มีการลบ —
 * งานที่ไม่ทำแล้วต้องยกเลิกด้วย TASK_CANCEL ผ่าน changeStatus()
 */

/**
 * อ่านงานของแผนกตามเลขที่
 * @param {string} taskId เลขที่งานของแผนก
 * @return {Object|null}
 */
async function getTask(taskId) {
  return await findOne_(SHEET.DEPARTMENT_TASK, 'Task_ID', taskId);
}

/**
 * อ่านงานของแผนกทั้งหมดของใบงานใบหนึ่ง
 * @param {string} woId เลขที่ใบงาน
 * @return {Object[]}
 */
async function listTasksByWo(woId) {
  return await findBy_(SHEET.DEPARTMENT_TASK, 'WO_ID', woId);
}

/**
 * อ่านงานของแผนกทั้งหมด
 * @return {Object[]}
 */
async function listTasks() {
  return await readAll_(SHEET.DEPARTMENT_TASK);
}

/**
 * ค้นงานของแผนกตามค่าในคอลัมน์ใดคอลัมน์หนึ่ง เช่น Department, Status
 * @param {string} field ชื่อคอลัมน์ตาม SPEC 13
 * @param {*} value ค่าที่ต้องการ
 * @return {Object[]}
 */
async function findTasksBy(field, value) {
  return await findBy_(SHEET.DEPARTMENT_TASK, field, value);
}

/**
 * สถานะของงานแผนกที่ยังไม่จบ — งานที่ยังต้องมีคนไปทำ
 *
 * ประกาศไว้ที่เดียว เพราะทั้งตัวกรองฝั่งฐานข้อมูลและตัวคัดรอบสุดท้ายต้องใช้ชุดเดียวกัน
 * RETURNED อยู่ในชุดนี้ด้วย เพราะงานที่ถูกพักไว้ยังไม่จบ แค่ทำต่อไม่ได้ชั่วคราว
 */
var TASK_OPEN_STATUSES = Object.freeze([
  TASK_STATUS.PENDING_ACCEPT, TASK_STATUS.IN_PROGRESS, TASK_STATUS.RETURNED
]);

/**
 * ทุกสถานะที่งานของแผนกเป็นได้ — ใช้เมื่อผู้เรียกขอภาพรวมทั้งหมด
 *
 * ประกอบขึ้นจาก TASK_VIEWS ที่เดียว ไม่ได้เขียนรายชื่อซ้ำไว้เอง ถ้าเขียนซ้ำ
 * วันที่เพิ่มสถานะใหม่ จะมีที่หนึ่งที่ได้แก้และอีกที่หนึ่งที่ลืม แล้วงานจะหายจากรายการเงียบ ๆ
 */
var TASK_ALL_STATUSES = (function () {
  var out = [];
  for (var v = 0; v < TASK_VIEWS.length; v++) {
    for (var s = 0; s < TASK_VIEWS[v].statuses.length; s++) {
      var one = TASK_VIEWS[v].statuses[s];
      if (out.indexOf(one) === -1) out.push(one);
    }
  }
  return Object.freeze(out);
})();

/**
 * ลำดับเมื่อผู้เรียกไม่ได้ระบุมุมมอง
 *
 * เส้นทางนี้ไม่ได้ถูกหน้าจอใช้ เพราะหน้าจอส่งมุมมองมาเสมอ ลำดับนี้จึงไม่เคยถึงตาผู้ใช้
 * ขอเพียงแน่นอนและซ้ำเดิมทุกครั้ง เพราะการแบ่งหน้าที่ลำดับไม่แน่นอน จะทำให้แถวเดียวกัน
 * โผล่สองหน้าหรือหายไปทั้งสองหน้า โดยไม่มีอะไรผิดให้เห็น
 */
var TASK_DEFAULT_ORDER = Object.freeze([
  Object.freeze({ column: 'Status', ascending: true }),
  Object.freeze({ column: 'WO_ID',  ascending: false })
]);

/**
 * ยอดงานของแผนกแยกตามมุมมอง ครบทุกแผนกในก้อนเดียว — นับที่ฐานข้อมูล (กฎข้อ 28)
 *
 * **ไม่รับแผนกเป็นอาร์กิวเมนต์โดยตั้งใจ** เหมือน `dashboard_summary` (SPEC 17.1)
 *
 * มันคืนยอดครบทุกแผนกมาให้ แล้วชั้นบนเป็นคนคัดว่าผู้ใช้คนนั้นเห็นแผนกไหน จาก
 * `getCurrentUser_()` เท่านั้น · การไม่รับเลยทำให้ค่าจากหน้าเว็บไม่มีทางไปถึง SQL
 * ได้ ไม่ใช่แค่ถูกป้องกันไว้ · และก้อนดิบก้อนเดียวใช้ได้กับทุกคน จึงแคชร่วมกัน
 * ทั้งระบบได้ ซึ่งทำให้ยี่สิบคนที่เปิดพร้อมกันตอนเช้ายิงคำขอครั้งเดียว
 *
 * **แคชเก็บก้อนดิบก่อนคัด และการคัดทำใหม่ทุกคำขอ** (กฎข้อ 30) ถ้าวันหนึ่งมีคน
 * เก็บ "ยอดของแผนกที่คัดแล้ว" ลงคีย์ที่แชร์กัน คนแผนกอื่นที่เปิดทีหลังจะเห็นยอด
 * ของแผนกแรก ซึ่งเป็นการรั่วข้ามสิทธิ์ที่ไม่มี error ไม่มี log และดูเหมือนแคช
 * ทำงานปกติทุกอย่าง
 *
 * @return {Object} แผนก → {คีย์ของมุมมอง → จำนวน}
 */
async function countAllTasksByView() {
  if (TASK_COUNT_RUN_CACHE_) return TASK_COUNT_RUN_CACHE_;

  var cached = cacheGet_(TASK_COUNT_CACHE_KEY_);
  if (cached) {
    try {
      TASK_COUNT_RUN_CACHE_ = JSON.parse(cached);
      return TASK_COUNT_RUN_CACHE_;
    } catch (e) {
      // ของในแคชเสีย ถือว่าไม่มี แล้วถามใหม่ ดีกว่าทำให้ทั้งหน้าล้ม
    }
  }

  var totals;
  try {
    totals = await db_rpc_('department_task_counts', {});
  } catch (e) {
    /*
     * บอกชื่อไฟล์ที่ต้องรันออกมาตรง ๆ เพราะข้อความกลาง ๆ จะทำให้ต้องไล่หาสาเหตุ
     * ทั้งที่คำตอบอยู่ในรายงานของ checkSupabase() อยู่แล้ว · ชื่อไฟล์เป็นของเราเอง
     * ไม่ใช่ข้อความจาก PostgREST จึงพูดออกมาได้โดยไม่ขัดกฎข้อ 24
     *
     * ห้ามถอยไปอ่านทั้งตารางมานับเอง นั่นคือการเงียบ ๆ กลับไปทำสิ่งที่กฎข้อ 28 ห้ามไว้
     */
    throw new Error('ยังติดตั้งตัวนับงานของแผนกในฐานข้อมูลไม่ครบ ' +
      '— ให้ผู้ดูแลระบบรัน supabase_batch2.sql แล้วลองใหม่อีกครั้ง');
  }

  /*
   * PostgREST คืนค่าของฟังก์ชันที่ returns json มาเป็นก้อน JSON ตรง ๆ
   * แต่ถ้าวันหนึ่งมันห่อเป็น array มาแทน การอ่านคีย์ตรง ๆ จะได้ undefined ทุกช่อง
   * แล้วป้ายบนเมนูจะขึ้นศูนย์ทั้งแถบโดยไม่มีอะไรผิดพลาดให้เห็น
   */
  if (totals instanceof Array) totals = totals.length ? totals[0] : {};

  TASK_COUNT_RUN_CACHE_ = totals || {};
  cachePut_(TASK_COUNT_CACHE_KEY_, JSON.stringify(TASK_COUNT_RUN_CACHE_),
    TASK_COUNT_CACHE_SECONDS_);
  return TASK_COUNT_RUN_CACHE_;
}

/** ก้อนดิบของยอดทุกแผนก จำไว้ภายในการรันครั้งเดียว (ไม่ข้ามการรัน) */
var TASK_COUNT_RUN_CACHE_ = null;

/** คีย์แคชข้ามการรันของยอดทุกแผนก — ก้อนดิบก่อนคัดสิทธิ์เท่านั้น (กฎข้อ 30) */
var TASK_COUNT_CACHE_KEY_ = 'deptcount:v1';

/**
 * อายุแคชของยอดบนเมนู — สั้นเท่าแดชบอร์ดโดยตั้งใจ
 *
 * ตัวเลขนี้ติดไปกับทุกหน้า คนจึงเห็นมันบ่อยที่สุดในระบบ · แคชยาวกว่านี้จะทำให้
 * คนที่เพิ่งกดรับงานกลับมาเห็นเลขเดิม แล้วเข้าใจว่าการกดของตัวเองไม่มีผล
 * ซึ่งเป็นอาการที่ไม่มีอะไรชี้กลับมาที่แคชเลย
 */
var TASK_COUNT_CACHE_SECONDS_ = 60;

/**
 * ล้างยอดที่จำไว้ทั้งสองชั้น — เรียกจาก noteRepoWrite_() ที่เดียว
 *
 * ต้องล้างทุกครั้งที่ Department_Task ถูกเขียน ไม่ใช่เฉพาะตอนสถานะเปลี่ยน ·
 * การกำหนดวันเข้างานเปลี่ยนป้าย "งานวันนี้" โดยที่สถานะไม่ขยับเลย
 */
function clearTaskCountCache_() {
  TASK_COUNT_RUN_CACHE_ = null;
  try {
    cacheDrop_([TASK_COUNT_CACHE_KEY_]);
  } catch (e) {
    // ล้างแคชไม่สำเร็จต้องไม่ทำให้รายการที่เพิ่งสำเร็จไปแล้วล้มตาม
  }
}

/**
 * นับยอดทุกแผนกจากแถวที่มีอยู่ในมือ — ตรรกะล้วน
 *
 * เป็นสูตรเดียวกับที่ `department_task_counts` ในฐานข้อมูลใช้ จึงเอามาเทียบกันได้
 * ทั้งในเทสต์และใน checkSupabase() — สองสูตรที่เขียนแยกกันย่อมเพี้ยนจากกันได้
 * วิธีเดียวที่รู้แน่คือเอาของจริงมาเทียบ (กฎข้อ 31)
 *
 * @param {Object[]} rows แถว Department_Task ทั้งหมดที่จะนับ
 * @param {string} dayText วันไทย 'YYYY-MM-DD'
 * @return {Object} แผนก → {คีย์ของมุมมอง → จำนวน}
 */
function countAllTasksFrom_(rows, dayText) {
  var out = {};
  var names = deptNames_();
  for (var d = 0; d < names.length; d++) out[names[d]] = emptyTaskCounts_();

  for (var i = 0; i < rows.length; i++) {
    var dept = String(rows[i]['Department'] || '');
    if (!out[dept]) out[dept] = emptyTaskCounts_();

    var view = taskViewOfStatus_(rows[i][STATUS_FIELD[ENTITY.TASK]]);
    if (view) out[dept][view]++;
    if (isTaskVisitingOn_(rows[i], dayText)) out[dept][TASK_TODAY_VIEW]++;
  }
  return out;
}

/** ยอดเริ่มต้นศูนย์ครบทุกมุมมอง — ศูนย์ที่มีอยู่จริง ไม่ใช่คีย์ที่หายไป (กฎข้อ 32) */
function emptyTaskCounts_() {
  var counts = {};
  for (var v = 0; v < TASK_VIEWS.length; v++) counts[TASK_VIEWS[v].key] = 0;
  return counts;
}

/** รายชื่อแผนกทั้งหมดตามที่ DEPT ประกาศไว้ — ไม่เขียนรายชื่อซ้ำที่อื่น */
function deptNames_() {
  var out = [];
  for (var key in DEPT) {
    if (Object.prototype.hasOwnProperty.call(DEPT, key)) out.push(DEPT[key]);
  }
  return out;
}

/**
 * งานของแผนกที่นัดเข้างานในวันหนึ่ง และยังไม่จบ (SPEC 17.3 — หน้า "งานวันนี้")
 *
 * **กรองที่ฐานข้อมูลทั้งสามเงื่อนไข ไม่ลากทุกแถวมาคัดเอง** (กฎข้อ 28)
 * Visit_Start เก็บเป็นข้อความ 'YYYY-MM-DDTHH:mm' ตามเวลาไทย (กฎข้อ 23) จึงกรอง
 * ด้วยคำนำหน้าของวันได้ตรง ๆ โดยไม่ต้องแปลงชนิดหรือคำนวณเขตเวลาที่ฝั่งฐานข้อมูล
 *
 * หลีกอักขระของ LIKE ด้วยตัวที่มีอยู่แล้วเสมอ (กฎข้อ 29 · SPEC 21) แม้วันที่จะมี
 * แต่ตัวเลขกับขีด · การเรียกตัวหลีกทุกครั้งคือกติกา ไม่ใช่การตัดสินใจรายกรณี
 * มิฉะนั้นวันหนึ่งจะมีคนส่งค่าที่ผู้ใช้พิมพ์เองเข้ามาทางนี้แล้วไม่มีใครทันสังเกต
 *
 * เรียงตามเวลานัดจากเช้าไปเย็น เพราะนี่คือลำดับที่ช่างเดินทางจริง
 *
 * ถามวันใดก็ได้ ไม่ใช่แค่วันนี้ · หน้าจอใช้ `findTaskPage` ซึ่งแบ่งหน้าด้วย
 * ส่วนตัวนี้เหลือไว้ให้ผู้เรียกที่ต้องการถามตรง ๆ ว่าวันนั้นมีงานอะไรบ้าง
 *
 * @param {string} department แผนกเจ้าของงาน (ค่าจาก DEPT)
 * @param {string} dayText วันที่ 'YYYY-MM-DD' ตามเวลาไทย
 * @return {Object[]} แถว Department_Task
 */
async function findTasksVisitingOn(department, dayText) {
  if (!department || !dayText) return [];

  return await queryRows_(SHEET.DEPARTMENT_TASK, {
    'Department':  department,
    'Status':      { op: 'in', value: TASK_OPEN_STATUSES.slice() },
    'Visit_Start': { op: 'like', value: dbLikeLiteral_(dayText) + '*' }
  }, {
    order: { column: 'Visit_Start', ascending: true },
    limit: TASK_TODAY_LIMIT
  });
}

/**
 * เพดานจำนวนงานที่ถามวันเดียวแล้วหยิบมาได้
 *
 * เป็นเพดานที่เราตั้งเอง ไม่ใช่ปล่อยให้ข้อมูลเป็นคนกำหนด (กฎข้อ 28 · 29)
 * แผนกหนึ่งนัดเข้างานเกินสองร้อยรายการในวันเดียวไม่ได้ในทางปฏิบัติ ถ้าถึงเพดานนี้
 * แปลว่ามีอะไรผิดปกติ ซึ่ง queryRows_ จะบันทึกลง System_Log ให้เอง ไม่ตัดเงียบ
 */
var TASK_TODAY_LIMIT = 200;

/**
 * งานของแผนกหนึ่งหน้า พร้อมจำนวนทั้งหมด — กรอง เรียง และแบ่งหน้าที่ฐานข้อมูล
 *
 * **ทั้งสี่มุมมองของเมนูย่อยเดินทางนี้ทางเดียว** ไม่มีมุมมองไหนอ่านทั้งตารางมา
 * คัดเอง · ชุดสถานะและลำดับมาจาก `TASK_VIEWS` ที่เดียว (กฎข้อ 1) ผู้เรียกจึงไม่
 * เขียนรายการสถานะซ้ำไว้เอง ซึ่งเป็นที่มาของตัวเลขบนเมนูที่ไม่ตรงกับรายการในหน้า
 *
 * ใช้ `db_selectPage_` เพื่อให้ได้ทั้งแถวของหน้านี้และจำนวนทั้งหมดในคำขอเดียว
 * ผ่านหัวข้อ `Content-Range` · ถ้านับแยกอีกคำขอ ทุกหน้าจะแพงขึ้นหนึ่งคำขอ
 * เพื่อตัวเลขตัวเดียวที่ฐานข้อมูลบอกมาให้ฟรีอยู่แล้ว
 *
 * @param {string} department แผนกเจ้าของงาน (ค่าจาก DEPT)
 * @param {string[]} statuses สถานะที่ต้องการ
 * @param {string} dayText วันไทย 'YYYY-MM-DD' เมื่อคัดด้วยวันนัดด้วย · '' = ไม่คัด
 * @param {Object[]} order ลำดับ [{column, ascending}]
 * @param {number} limit จำนวนต่อหน้า
 * @param {number} offset ข้ามไปกี่แถว
 * @return {Object} {rows, total} · total = -1 เมื่อฐานข้อมูลไม่ได้บอกจำนวนมา
 */
async function findTaskPage(department, statuses, dayText, order, limit, offset) {
  if (!department) return { rows: [], total: 0 };

  var filters = { 'Department': department };
  if (statuses && statuses.length) filters['Status'] = { op: 'in', value: statuses.slice() };
  /*
   * หลีกอักขระของ LIKE ด้วยตัวที่มีอยู่แล้วเสมอ (กฎข้อ 29 · SPEC 21)
   * แม้วันที่จะมีแต่ตัวเลขกับขีด · การเรียกตัวหลีกทุกครั้งคือกติกา
   * ไม่ใช่การตัดสินใจรายกรณีที่วันหนึ่งจะมีคนลืม
   */
  if (dayText) filters['Visit_Start'] = { op: 'like', value: dbLikeLiteral_(dayText) + '*' };

  return await db_selectPage_(SHEET.DEPARTMENT_TASK, {
    filters: filters,
    order:   order,
    limit:   limit,
    offset:  offset
  });
}

/**
 * อ่านงานของแผนกทั้งหมดที่อยู่บนใบงานชุดหนึ่ง — ทั้งชุดในคำขอเดียว
 *
 * ใบงานหนึ่งใบมีงานของแผนกได้ไม่เกินสองแผนก (`departmentsOfAssignment`)
 * เพดานต่อหนึ่งใบจึงตั้งไว้สามเผื่อไว้หนึ่ง ไม่ได้ปล่อยให้ข้อมูลเป็นคนกำหนด
 *
 * @param {string[]} woIds เลขที่ใบงาน — ขอบเขตมาจากขนาดหน้าที่ผู้เรียกตั้งเอง
 * @return {Object[]}
 */
async function listTasksByWos(woIds) {
  return await queryRowsIn_(SHEET.DEPARTMENT_TASK, 'WO_ID', woIds || [], {
    order: { column: 'Task_ID', ascending: true },
    rowsPerValue: 3
  });
}

/**
 * เขียนงานของแผนกใหม่ 1 แถว
 * @param {Object} task ข้อมูลงานของแผนก
 * @return {Object} ข้อมูลที่เขียนจริง พร้อมฟิลด์ _row
 */
async function insertTask(task) {
  return await appendRow_(SHEET.DEPARTMENT_TASK, task);
}

/**
 * เขียนงานของแผนกหลายแถวพร้อมกัน — ใช้ตอนอนุมัติงานร่วม SERVICE_PROJECT ที่เกิด 2 Task
 * @param {Object[]} tasks รายการงานของแผนก
 * @return {Object[]}
 */
async function insertTasks(tasks) {
  return await appendRows_(SHEET.DEPARTMENT_TASK, tasks);
}

/**
 * แก้ไขงานของแผนก
 * @param {string} taskId เลขที่งานของแผนก
 * @param {Object} patch เฉพาะคอลัมน์ที่ต้องการเปลี่ยน
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่ผู้ใช้เห็นตอนเปิดหน้า (SPEC C-3)
 * @return {Object}
 */
async function updateTask(taskId, patch, expectedUpdatedDate) {
  return await updateRow_(SHEET.DEPARTMENT_TASK, 'Task_ID', taskId, patch, expectedUpdatedDate);
}
