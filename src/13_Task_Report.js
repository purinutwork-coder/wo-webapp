/**
 * 13_Task_Report.gs — Report ของแผนกตามขั้นตอนงาน (SPEC 14.1, 16, 20.3, ภาคผนวก ก)
 *
 * ตอบสองเรื่องที่ต้องเดินคู่กันเสมอ
 *   1. แผนกเลือก Report จากตาราง Report_Master แล้วแนบไฟล์เข้าไปที่ขั้นตอนหรืองวดของตัวเอง
 *   2. ตอนปิดงาน ระบบตรวจว่า Report ที่ Required แนบครบแล้วหรือยัง (SPEC 20.3 ข้อ 2)
 *
 * กติกาที่ตกลงกันแล้วและมีผลกับทั้งไฟล์นี้
 *   - Report ทุกรายการใช้ได้กับทุกขั้นตอนและทุกงวด — กรองด้วย Type อย่างเดียว
 *     (ไม่มีคอลัมน์ผูก Report กับ Step และจะไม่มี · ดู SPEC 13)
 *   - ด่าน Required ตรวจ "รายแผนก" ไม่ใช่รายใบงาน งานร่วมสองแผนกจึงต้องแนบคนละใบ
 *     และแผนกที่แนบครบก่อนปิดงานของตัวเองได้เลย โดยอีกแผนกยังปิดไม่ได้
 *   - Form_No ว่างได้ ระบบใช้ Report_Code แทนในชื่อไฟล์ (SPEC 14.2 · resolveFileTopic_)
 */

/* ---------------------------------------------------------------------------
 * ส่วนที่ 1 — รายการ Report ที่แผนกหนึ่งใช้ได้
 * --------------------------------------------------------------------------- */

/**
 * ชนิดของ Report ในตาราง Report_Master ที่คู่กับแผนกนั้น
 *
 * เทียบแบบไม่สนตัวพิมพ์ใหญ่เล็ก เพราะคอลัมน์ Type ในชีตเขียนว่า Service / Project / Lab
 * ส่วนค่าคงที่ของแผนกในโค้ดเป็นตัวพิมพ์ใหญ่ทั้งหมด — ถ้าเทียบตรง ๆ จะไม่เจอสักแถว
 * แล้วหน้าจอแผนกจะว่างเปล่าโดยไม่มีข้อผิดพลาดให้เห็น
 *
 * @param {string} department ค่าจาก DEPT
 * @return {string} ชนิดที่ต้องเทียบ (ตัวพิมพ์ใหญ่)
 */
function reportTypeOfDepartment_(department) {
  return String(department || '').trim().toUpperCase();
}

/**
 * Report ทั้งหมดที่แผนกนี้เลือกแนบได้ (SPEC 17.2)
 *
 * เรียงตาม Sort_Order ที่ผู้ดูแลกรอกไว้ ไม่ใช่ตามลำดับแถวในชีต เพราะผู้ดูแลจัดลำดับ
 * ให้รายการที่ใช้บ่อยอยู่บนแล้ว · แถวที่ Active เป็นเท็จถูกตัดออกทั้งหมด
 *
 * @param {string} department ค่าจาก DEPT
 * @return {Object[]} [{code, name, formNo, required}]
 */
async function reportOptionsFor(department) {
  var wanted = reportTypeOfDepartment_(department);
  if (!wanted) return [];

  var rows = await listReportMaster(true);   // true = เฉพาะแถวที่ Active
  var out = [];

  for (var i = 0; i < rows.length; i++) {
    if (reportTypeOfDepartment_(rows[i]['Type']) !== wanted) continue;
    out.push({
      code:     String(rows[i]['Report_Code'] || ''),
      name:     String(rows[i]['Report_Name'] || ''),
      // ชื่อไฟล์ใช้ Form_No ถ้ามี ไม่มีก็ใช้รหัสแทน หน้าจอจึงต้องบอกค่าเดียวกับที่จะได้จริง
      formNo:   String(rows[i]['Form_No'] || rows[i]['Report_Code'] || ''),
      hasFormNo: !isEmptyValue_(rows[i]['Form_No']),
      required: cellToBoolean_(rows[i]['Required']),
      sortOrder: Number(rows[i]['Sort_Order'] || 0)
    });
  }

  out.sort(function (a, b) {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return (a.code < b.code) ? -1 : ((a.code > b.code) ? 1 : 0);
  });
  return out;
}

/* ---------------------------------------------------------------------------
 * ส่วนที่ 2 — ด่าน Report ที่บังคับ (SPEC 20.3 ข้อ 2)
 * --------------------------------------------------------------------------- */

/**
 * Report ที่บังคับของแผนกนี้ แต่ยังไม่ได้แนบในงานนี้
 *
 * นับจากทะเบียน File_Index ของ "งานของแผนกนั้น" เท่านั้น ไม่ใช่ของทั้งใบงาน —
 * งานร่วมสองแผนกต้องมี Service Report คนละใบ ถ้านับรวมทั้งใบ แผนกที่ยังไม่ได้ทำอะไรเลย
 * จะปิดงานได้เพราะอีกแผนกแนบไปแล้ว ซึ่งเป็นรูที่มองไม่เห็นจนกว่าจะมีคนใช้ช่องนี้
 *
 * ไฟล์ที่ถูกลบไปแล้วไม่นับ — listFilesByTask() คืนเฉพาะแถวที่ Is_Active ยังเป็นจริงอยู่แล้ว
 * จึงไม่ต้องกรองซ้ำที่นี่ · ถ้าวันหนึ่งชั้น Repo เปลี่ยนไปคืนทุกแถว ข้อนี้จะพังทันที
 * และมีเทสต์ที่ลบไฟล์แล้วตรวจว่ากลับมาขาดคอยจับอยู่
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @return {Object[]} [{code, name, formNo}] ว่าง = ครบแล้ว
 */
async function missingRequiredReports_(taskId) {
  var task = await getTask(taskId);
  if (!task) return [];

  var options = await reportOptionsFor(task['Department']);
  var required = [];
  for (var i = 0; i < options.length; i++) {
    if (options[i].required) required.push(options[i]);
  }
  if (!required.length) return [];

  var attached = {};
  var files = await listFilesByTask(taskId);
  for (var f = 0; f < files.length; f++) {
    var code = String(files[f]['Report_Code'] || '');
    if (code) attached[code] = true;
  }

  var missing = [];
  for (var r = 0; r < required.length; r++) {
    if (!attached[required[r].code]) missing.push(required[r]);
  }
  return missing;
}

/**
 * ข้อความบอกว่าขาด Report อะไรบ้าง — ต้องอ่านแล้วลงมือต่อได้ทันที (SPEC 17.3)
 *
 * บอกชื่อเต็มและเลขฟอร์ม เพราะผู้ใช้หน้างานจำเอกสารจากเลขฟอร์ม ส่วนหัวหน้างานจำจากชื่อ
 * และบอกด้วยว่าแนบได้ที่ไหน — ไม่ระบุขั้นตอน เพราะ Report ทุกรายการแนบได้ทุกขั้น
 *
 * @param {Object[]} missing ผลจาก missingRequiredReports_()
 * @param {string} department แผนกเจ้าของงาน
 * @return {string}
 */
function missingReportsMessage_(missing, department) {
  var parts = [];
  for (var i = 0; i < missing.length; i++) {
    parts.push(missing[i].name + ' (' + missing[i].formNo + ')');
  }
  return 'ยังไม่ได้แนบเอกสารที่บังคับของ' + departmentLabel_(department) + ' ' +
    parts.length + ' รายการ: ' + parts.join(' · ') +
    ' — แนบได้ที่ขั้นตอนหรืองวดใดก็ได้ของงานนี้ แล้วจึงกดปิดงานอีกครั้ง';
}

/**
 * ชื่อแผนกที่อ่านเป็นภาษาไทย
 * @param {string} department ค่าจาก DEPT
 * @return {string}
 */
function departmentLabel_(department) {
  return toThai_(ASSIGNMENT_TH, department);
}

/* ---------------------------------------------------------------------------
 * ส่วนที่ 3 — ข้อมูลที่หน้าจอแผนกต้องใช้
 * --------------------------------------------------------------------------- */

/**
 * ทุกอย่างที่หน้าจอแผนกต้องใช้เรื่องเอกสารของงานหนึ่ง — ขอครั้งเดียวจบ (SPEC 17.3)
 *
 * รวมถึงคำตอบว่า "ขั้นตอนไหนทำได้ตอนนี้" ด้วย ไม่ปล่อยให้หน้าเว็บคิดเอง
 * เพราะกติกาการทำทีละขั้นถูกบังคับจริงที่ updateTaskStep ถ้าหน้าเว็บคิดเองอีกชุด
 * วันหนึ่งสองฝั่งจะไม่ตรงกัน แล้วผู้ใช้จะเห็นปุ่มที่กดแล้วโดนปฏิเสธเสมอ
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @return {Object} {taskId, woId, department, canEdit, canAddPeriod, scope, options,
 *                   photoTopicId, slots, missing, missingMessage}
 */
async function taskReportView(taskId) {
  var task = await getTask(taskId);
  if (!task) throw new Error('ไม่พบงานของแผนก ' + taskId);

  var department = String(task['Department'] || '');
  var files = await listFilesByTask(taskId);
  var missing = await missingRequiredReports_(taskId);

  /* ---------- ไฟล์ที่แนบแล้ว แยกตามขั้นตอน และแยกเอกสารออกจากรูปหน้างาน ---------- */
  var byStep = {};
  var photosByStep = {};

  for (var i = 0; i < files.length; i++) {
    var isPhoto = String(files[i]['Topic_ID'] || '') === PHOTO_TOPIC.ID;
    // ไฟล์ที่แนบตอนสร้างใบงานไม่ใช่ของแผนก จึงไม่มาอยู่ในแผงนี้
    if (!isPhoto && !String(files[i]['Report_Code'] || '')) continue;

    var key = String(files[i]['Step_ID'] || '');
    var bucket = isPhoto ? photosByStep : byStep;
    if (!bucket[key]) bucket[key] = [];
    bucket[key].push(taskFileView_(files[i]));
  }

  /*
   * ---------- แก้ไขอะไรได้บ้างในตอนนี้ ----------
   *
   * ตัดสินที่นี่ที่เดียวแล้วส่งเป็นข้อความไปให้หน้าเว็บแสดง ไม่ให้หน้าเว็บเทียบสถานะเอง
   * เพราะการซ่อนปุ่มไม่ใช่การป้องกัน (กฎข้อ 7) ด่านจริงอยู่ที่ changeStatus ทุกทาง
   */
  var wo = await getWorkOrder(task['WO_ID']) || {};
  var taskStatus = String(task[STATUS_FIELD[ENTITY.TASK]] || '');
  var woReturned = String(wo[STATUS_FIELD[ENTITY.WO]] || '') === WO_STATUS.RETURNED;
  var canEdit = (taskStatus === TASK_STATUS.IN_PROGRESS) && !woReturned;

  var closedReason = '';
  if (woReturned) {
    closedReason = 'ใบงานนี้ถูกตีกลับอยู่ ทำรายการกับงานนี้ไม่ได้จนกว่าธุรการจะแก้ไขและส่งอนุมัติใหม่';
  } else if (taskStatus !== TASK_STATUS.IN_PROGRESS) {
    closedReason = 'งานนี้อยู่ในสถานะ ' + toThai_(TASK_STATUS_TH, taskStatus) +
      ' จึงดูเอกสารที่แนบไว้ได้อย่างเดียว';
  }

  /* ---------- ที่ที่แนบได้ — ขั้นตอน งวด หรือตัวงานเอง ---------- */
  var slots = [];
  var steps = await listStepsByTask(taskId).slice();
  steps.sort(function (a, b) { return Number(a['Step_No'] || 0) - Number(b['Step_No'] || 0); });

  for (var s = 0; s < steps.length; s++) {
    var stepId = String(steps[s]['Step_ID']);
    var blocking = earlierUnfinishedStep_(steps, steps[s]);

    slots.push({
      stepId:   stepId,
      stepNo:   Number(steps[s]['Step_No'] || 0),
      // ส่งทั้งชื่อเต็มที่ใช้พาดหัว และชื่อล้วนที่การ์ดของงานใช้แสดงในรายการของตัวเอง
      label:    stepLabel_(steps[s]),
      stepName: String(steps[s]['Step_Name'] || ''),
      type:     steps[s]['Type'],
      done:     String(steps[s]['Status'] || '') === STEP_STATUS.COMPLETED,
      doneBy:   await displayNameOf_(steps[s]['Completed_By']),
      doneDate: formatForDisplay_(steps[s]['Completed_Date']),
      // ทำทีละขั้นตามลำดับ · เหตุผลต้องเป็นประโยคที่บอกว่าต้องไปทำอะไรก่อน (SPEC 17.3)
      locked:   !canEdit || !!blocking,
      lockReason: !canEdit ? closedReason
        : (blocking ? ('ต้องทำ' + stepLabel_(blocking) + 'ให้เสร็จก่อน จึงจะบันทึกขั้นตอนนี้ได้') : ''),
      files:    byStep[stepId] || [],
      photos:   photosByStep[stepId] || []
    });
  }

  /*
   * งานที่ไม่มีขั้นตอนเลย (Lab เสมอ · Project ที่ยังไม่ได้เพิ่มงวด) ต้องแนบได้ที่ตัวงาน
   * ไม่งั้นงาน Project ที่จบในวันเดียวจะแนบเอกสารที่บังคับไม่ได้เลย แล้วปิดงานไม่ได้ตลอดกาล
   */
  if (!slots.length) {
    slots.push({
      stepId: '', stepNo: 0, label: 'เอกสารของงานนี้', stepName: '', type: '',
      done: false, doneBy: '', doneDate: '',
      locked: !canEdit, lockReason: closedReason,
      files: byStep[''] || [], photos: photosByStep[''] || []
    });
  }

  /*
   * "เพิ่มงวดได้ไหม" ต้องตัดสินที่นี่ ไม่ใช่ที่หน้าเว็บ — หน้าเว็บที่ตัดสินเองจะเพี้ยน
   * ทันทีที่กติกาเปลี่ยน และการซ่อนปุ่มไม่ใช่การป้องกัน (กฎข้อ 7) ด่านจริงอยู่ที่
   * addTaskPeriod ซึ่งผ่าน changeStatus อีกชั้นเสมอ
   */
  var canAddPeriod = canEdit && department === DEPT.PROJECT;

  return {
    taskId:     taskId,
    woId:       task['WO_ID'],
    department: department,
    canEdit:    canEdit,
    closedReason: closedReason,
    canAddPeriod: canAddPeriod,
    scope:      fileScopeOfDepartment_(department),
    options:    await reportOptionsFor(department),
    // หัวข้อของรูปหน้างานมาจากเซิร์ฟเวอร์ ไม่ให้หน้าเว็บพิมพ์รหัสนี้เอง (SPEC 14.2)
    photoTopicId:   PHOTO_TOPIC.ID,
    photoTopicName: PHOTO_TOPIC.NAME,
    slots:      slots,
    missing:    missing,
    missingMessage: missing.length ? missingReportsMessage_(missing, department) : ''
  };
}

/**
 * ไฟล์หนึ่งไฟล์ในรูปแบบที่หน้าจอแผนกใช้ได้ทันที
 * เวลาถูกจัดรูปแบบมาจากจุดเดียวของระบบแล้ว หน้าเว็บจึงไม่ต้องแตะวันที่เลย (กฎข้อ 19)
 *
 * @param {Object} row แถวจาก File_Index
 * @return {Object}
 */
function taskFileView_(row) {
  return {
    fileId:     row['File_ID'],
    reportCode: String(row['Report_Code'] || ''),
    name:       row['Saved_File_Name'],
    url:        row['File_URL'],
    uploadedBy: row['Uploaded_By'] || '',
    uploadedDate: formatForDisplay_(row['Uploaded_Date'])
  };
}

/**
 * ประเภทของไฟล์ (FILE_SCOPE) ที่คู่กับแผนกนั้น — ใช้ตอนอัปโหลด
 * @param {string} department ค่าจาก DEPT
 * @return {string}
 */
function fileScopeOfDepartment_(department) {
  switch (String(department || '')) {
    case DEPT.SERVICE: return FILE_SCOPE.SERVICE;
    case DEPT.PROJECT: return FILE_SCOPE.PROJECT;
    case DEPT.LAB:     return FILE_SCOPE.LAB;
    default: return '';
  }
}

/* ---------------------------------------------------------------------------
 * ส่วนที่ 4 — เครื่องมือตรวจข้อมูลตั้งต้น
 * --------------------------------------------------------------------------- */

/**
 * สรุปสภาพของตาราง Report_Master — ตรรกะล้วน ป้อนแถวเข้ามาได้ จึงทดสอบได้ตรง ๆ
 *
 * @param {Object[]} rows แถวทั้งหมดของ Report_Master (รวมแถวที่ปิดใช้งาน)
 * @return {Object} {byType, requiredTotal, warnings}
 */
function reportMasterSummary_(rows) {
  var types = [DEPT.SERVICE, DEPT.PROJECT, DEPT.LAB];
  var byType = {};
  for (var t = 0; t < types.length; t++) {
    byType[types[t]] = { total: 0, active: 0, required: 0, noFormNo: [] };
  }

  var other = [];
  var requiredTotal = 0;

  for (var i = 0; i < rows.length; i++) {
    var type = reportTypeOfDepartment_(rows[i]['Type']);
    var code = String(rows[i]['Report_Code'] || '');
    if (!byType[type]) { other.push(code + ' (Type=' + (rows[i]['Type'] || 'ว่าง') + ')'); continue; }

    byType[type].total++;
    if (!cellToBoolean_(rows[i]['Active'])) continue;

    byType[type].active++;
    if (cellToBoolean_(rows[i]['Required'])) {
      byType[type].required++;
      requiredTotal++;
    }
    if (isEmptyValue_(rows[i]['Form_No'])) byType[type].noFormNo.push(code);
  }

  var warnings = [];
  for (var w = 0; w < types.length; w++) {
    var info = byType[types[w]];
    if (!info.active) {
      warnings.push('ไม่มี Report ของ ' + types[w] + ' เลยสักรายการ — ' +
        'หน้าจอของแผนกนี้จะไม่มีอะไรให้เลือก');
    }
    if (info.noFormNo.length) {
      warnings.push('Form_No ว่างที่ ' + info.noFormNo.join(', ') +
        ' — ชื่อไฟล์จะใช้ Report_Code แทน ซึ่งตามหาต้นฉบับยากกว่า');
    }
  }
  if (!requiredTotal) {
    warnings.push('ทั้งตารางไม่มีรายการที่ Required เลย — ด่านตอนปิดงานจะไม่บังคับอะไรทั้งสิ้น ' +
      'งานที่ไม่มีงวดจะปิดได้ทันทีที่กดรับงาน');
  }
  if (other.length) {
    warnings.push('มีแถวที่ Type ไม่ตรงกับแผนกใดเลย: ' + other.join(', '));
  }

  return { byType: byType, requiredTotal: requiredTotal, warnings: warnings };
}

/**
 * ตรวจตาราง Report_Master — กดรันจากตัวแก้ไข Apps Script (อ่านอย่างเดียว)
 *
 * มีไว้เพราะความผิดปกติของตารางนี้ไม่มีทางเห็นจากหน้าจอเลย: แผนกที่ไม่มี Report
 * จะเห็นรายการว่างแล้วคิดว่าระบบพัง และตารางที่ไม่มี Required สักรายการจะทำให้
 * ด่านตอนปิดงานไม่บังคับอะไรเลย ซึ่งดูเหมือนทำงานปกติทุกประการ
 *
 * @return {string} รายงานที่อ่านได้ทันที
 */
async function checkReportMaster() {
  var lines = ['ตรวจตาราง Report_Master'];
  var rows;

  try {
    rows = await listReportMaster(false);   // false = เอาแถวที่ปิดใช้งานมาด้วย
  } catch (e) {
    lines.push('อ่านตารางไม่ได้: ' + openFailureMessage_(e, (e && e.message) ? e.message : String(e)));
    return logAndReturn_(lines);
  }

  var summary = reportMasterSummary_(rows);
  lines.push('ทั้งหมด ' + rows.length + ' รายการ · บังคับแนบ ' + summary.requiredTotal + ' รายการ');

  for (var type in summary.byType) {
    if (!Object.prototype.hasOwnProperty.call(summary.byType, type)) continue;
    var info = summary.byType[type];
    lines.push('  ' + padRight_(type, 10) + 'ใช้งานอยู่ ' + info.active + ' รายการ · ' +
      'บังคับ ' + info.required + ' รายการ' +
      ((info.total !== info.active) ? (' · ปิดใช้งานไว้ ' + (info.total - info.active)) : ''));
  }

  if (!summary.warnings.length) lines.push('ไม่พบสิ่งผิดปกติ');
  for (var w = 0; w < summary.warnings.length; w++) {
    lines.push('  ! ' + summary.warnings[w]);
  }

  return logAndReturn_(lines);
}
