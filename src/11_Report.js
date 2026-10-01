/**
 * 11_Report.gs — ออกใบสั่งงานเป็น PDF (SPEC 16.1)
 *
 * วิธีทำงาน: คัดลอกแม่แบบ Google Docs -> แทนค่าทุกตัวแปร -> ส่งออกเป็น PDF ->
 * ลบไฟล์ชั่วคราวทิ้ง · ไม่แปลง HTML เป็น PDF เพราะฟอนต์ไทยไม่ถูกฝังไปด้วย
 * แล้วจะได้สระลอย วรรณยุกต์หลุด หรือกล่องว่าง ซึ่งดูจากโค้ดไม่มีทางรู้
 *
 * ไฟล์นี้ไม่เรียก DriveApp และ DocumentApp เอง — เรียกผ่าน 06_Files.gs เท่านั้น
 * ตามกฎเดียวกับที่ใช้กับ SpreadsheetApp เพื่อให้วันที่ย้ายที่เก็บไฟล์ แก้ที่เดียวจบ
 *
 * ออกอัตโนมัติ 3 จังหวะตามตารางใน SPEC 16.1 — CREATE, ACCEPT และ SUBMIT หลังถูกตีกลับ
 * ทุกจังหวะออก "หลังบันทึกสถานะสำเร็จแล้ว" และถูกห่อ try/catch ไว้แยก
 */

/** ชื่อไฟล์ฉบับปัจจุบัน อยู่ที่รากโฟลเดอร์ของใบงาน (SPEC 16) */
var REPORT_FILE_NAME = 'Work Order Report.pdf';

/** โฟลเดอร์เก็บฉบับเก่า — ห้ามทับฉบับเดิมทิ้ง (SPEC 16.1) */
var REPORT_ARCHIVE_FOLDER = '_archive';

/**
 * เครื่องหมายสำหรับช่องที่ยังไม่มีข้อมูล
 *
 * ต้องมีอะไรสักอย่างเสมอ ห้ามเว้นว่าง เพราะช่องว่างบนกระดาษแยกไม่ออกระหว่าง
 * "ไม่มีข้อมูล" กับ "ระบบแทนค่าไม่สำเร็จ" ซึ่งสองอย่างนี้ต้องแก้คนละทาง
 */
var REPORT_EMPTY_MARK = '—';

/** ข้อความเมื่อยังไม่ได้ตั้งค่าแม่แบบ — ต้องบอกว่าต้องไปทำอะไรต่อ ไม่ใช่บอกแค่ว่าไม่มี */
var REPORT_TEMPLATE_NOT_SET_MESSAGE =
  'ยังไม่ได้ตั้งค่าแม่แบบใบสั่งงาน จึงออกเอกสารไม่ได้ ' +
  'กรุณาแจ้งผู้ดูแลระบบให้ใส่รหัสไฟล์แม่แบบ Google Docs ไว้ใน Script Properties ชื่อ WO_REPORT_TEMPLATE_ID';

/** ข้อความเมื่อเปิดแม่แบบไม่ได้ (ถูกลบ ย้าย หรือรหัสผิด) */
var REPORT_TEMPLATE_BROKEN_MESSAGE =
  'เปิดแม่แบบใบสั่งงานไม่ได้ อาจถูกลบ ถูกย้าย หรือรหัสที่ตั้งไว้ไม่ถูกต้อง ' +
  'กรุณาแจ้งผู้ดูแลระบบให้ตรวจค่า WO_REPORT_TEMPLATE_ID ใน Script Properties';

/**
 * ปิดการออกเอกสารอัตโนมัติชั่วคราว — ชุดทดสอบเท่านั้น (ดู tryGenerateWorkOrderReport_)
 * ห้ามมีโค้ดจริงที่ไหนตั้งค่านี้ และมีเทสต์คุมว่าค่าตั้งต้นต้องเป็น false
 */
var REPORT_DISABLED_ = false;

/**
 * ตัวแปรทั้งหมดที่แม่แบบใช้ได้ — แหล่งเดียวที่จดรายชื่อไว้ (SPEC 16.1)
 *
 * เทสต์อ่านรายการนี้ไปตรวจว่า reportValues_() ส่งค่าครบทุกตัว
 * ถ้าจดไว้สองที่ วันหนึ่งแม่แบบจะมีช่องที่ไม่มีใครแทนค่า แล้วผู้ใช้จะเห็น {{...}} บนกระดาษจริง
 *
 * @return {string[]}
 */
function reportPlaceholders_() {
  return [
    // หัวเอกสาร — บอกว่าใบนี้คือฉบับไหนของสถานะใด (SPEC 16.1)
    'WO_ID', 'JOB_NO', 'STATUS_TH', 'ISSUED_AT', 'VERSION',
    // ลูกค้า
    'CUSTOMER_NAME', 'CUSTOMER_CODE', 'CONTACT', 'PHONE', 'SALES_PERSON', 'START_CONTACT',
    // สถานที่
    'PROJECT', 'LOCATION', 'PJ_ID',
    // เนื้องาน
    'ASSIGNMENT_TH', 'REQUEST_TYPES', 'JOB_DESCRIPTION', 'PRODUCT_DETAIL',
    'WORK_SCOPE', 'REFERENCE_DOC',
    // กำหนดการ
    'START_DATE', 'END_DATE',
    // ผลการอนุมัติ
    'DEPARTMENT_TH', 'APPROVED_BY', 'APPROVED_DATE', 'RETURN_NOTE',
    // ท้ายเอกสาร
    'FILE_LIST', 'REMARK', 'CREATED_BY', 'CREATED_DATE'
  ];
}

/**
 * ค่าที่จะแทนลงแม่แบบ — ฟังก์ชันล้วน ไม่แตะชีตและไม่แตะ Drive
 *
 * แยกออกมาเป็นฟังก์ชันล้วนเพราะนี่คือส่วนที่ผิดง่ายที่สุดและต้องเทสต์ถี่ที่สุด
 * (ช่องว่าง วันที่ผิดรูปแบบ สถานะเป็นภาษาอังกฤษ) ส่วนการคุยกับ Drive พิสูจน์ได้ยากกว่ามาก
 *
 * @param {Object} wo แถวใบงานจากชีต
 * @param {Object[]} files รายการไฟล์ที่ยังใช้งานอยู่ของใบงานนี้ (จาก listWoFileViews)
 * @param {Object} meta {version: เลขฉบับ, issuedAt: เวลาที่ออกเอกสาร,
 *                       topics: แถวหัวข้อไฟล์แนบตามลำดับในตาราง Attachment_Topic}
 * @return {Object} แผนที่ชื่อตัวแปร -> ข้อความ
 */
async function reportValues_(wo, files, meta) {
  wo = wo || {};
  meta = meta || {};

  var values = {
    'WO_ID':         wo['WO_ID'],
    'JOB_NO':        reportJobNo_(wo),
    // สถานะและแผนกต้องเป็นคำไทยจากตารางแปลใน 00_Config เท่านั้น ห้ามพิมพ์สดที่นี่ (SPEC 17.3)
    'STATUS_TH':     woStatusLabel(wo['Overall_Status']),
    'ISSUED_AT':     formatForDisplay_(meta.issuedAt || new Date()),
    'VERSION':       String(meta.version || 1),

    'CUSTOMER_NAME': wo['Customer_Name'],
    'CUSTOMER_CODE': wo['Customer_Code'],
    'CONTACT':       wo['Contact'],
    'PHONE':         wo['Phone'],
    'SALES_PERSON':  wo['Sales_Person'],
    'START_CONTACT': formatForDisplay_(wo['Start_Contact_Date']),

    'PROJECT':       wo['Project'],
    'LOCATION':      wo['Location'],
    'PJ_ID':         wo['PJ_ID'],

    'ASSIGNMENT_TH': toThai_(ASSIGNMENT_TH, wo['Assignment_Type']),
    // สิ่งที่ต้องการเป็น Master Data ที่เพิ่มลบได้ จึงพิมพ์เป็นรายการที่เลือกจริง
    // ไม่ใช่ช่องติ๊กตายตัวบนแม่แบบ ซึ่งจะไม่ตรงทันทีที่มีคนเพิ่มรายการใหม่ (กฎข้อ 9)
    'REQUEST_TYPES': reportListText_(wo['Request_Types']),
    'JOB_DESCRIPTION': wo['Job_Description'],
    'PRODUCT_DETAIL':  wo['Product_Detail'],
    'WORK_SCOPE':      wo['Work_Scope'],
    'REFERENCE_DOC':   wo['Reference_Doc'],

    // เวลานัดหมายเก็บเป็นข้อความเวลาท้องถิ่น (กฎข้อ 18) ผ่านตัวจัดรูปแบบตัวเดียวกับทุกที่
    'START_DATE':    formatForDisplay_(wo['Start_Date']),
    'END_DATE':      formatForDisplay_(wo['End_Date']),

    'DEPARTMENT_TH': reportDepartment_(wo),
    'APPROVED_BY':   await displayNameOf_(wo['Approved_By']),
    'APPROVED_DATE': formatForDisplay_(wo['Approved_Date']),

    // หัวข้อของเอกสารแนบ ไม่ใช่ชื่อไฟล์ · รายชื่อหัวข้อมาจาก meta เพราะฟังก์ชันนี้ห้ามแตะชีต
    'FILE_LIST':     reportFileList_(files, meta.topics),
    'REMARK':        wo['Remark'],
    'CREATED_BY':    await displayNameOf_(wo['Created_By']),
    'CREATED_DATE':  formatForDisplay_(wo['Created_Date'])
  };

  // ช่องที่ไม่มีข้อมูลต้องได้ขีด ไม่ใช่ค่าว่างหรือคำว่า undefined
  var names = reportPlaceholders_();
  for (var i = 0; i < names.length; i++) {
    var key = names[i];
    var value = values[key];
    values[key] = isEmptyValue_(value) ? REPORT_EMPTY_MARK : String(value);
  }

  /*
   * หมายเหตุการตีกลับเป็นข้อยกเว้นเดียวที่เว้นว่างได้ (SPEC 16.1)
   *
   * ใบส่วนใหญ่ไม่เคยถูกตีกลับ ถ้าใส่ขีดไว้ทุกใบ จะมีหัวข้อ "เหตุผลที่ถูกตีกลับ"
   * ค้างอยู่บนกระดาษของงานที่ไม่มีอะไรผิด ซึ่งชวนให้เข้าใจผิดมากกว่าไม่มีอะไรเลย
   * ต้องใส่ทีหลังการเติมขีด ไม่งั้นค่าว่างจะถูกแทนด้วยขีดไปแล้ว
   */
  values['RETURN_NOTE'] = reportReturnNote_(wo);

  return values;
}

/**
 * เลขงานของแผนกที่พิมพ์บนเอกสาร (SPEC A-17)
 *
 * ว่างจนกว่าจะอนุมัติ เพราะก่อนอนุมัติยังไม่รู้ว่างานไปอยู่สายไหน
 * และเลขนี้คือ WO_ID ที่เปลี่ยนตัวนำหน้า ไม่ใช่ตัวนับแยก
 *
 * @param {Object} wo แถวใบงาน
 * @return {string} ค่าว่างเมื่อยังไม่อนุมัติ
 */
function reportJobNo_(wo) {
  if (!wo['Approved_Date']) return '';

  var assignment = String(wo['Assignment_Type'] || '');
  if (assignment === ASSIGNMENT.LAB) return documentIdForFile_(wo['WO_ID'], FILE_SCOPE.LAB);
  if (assignment === ASSIGNMENT.UNSPECIFIED || !assignment) return '';
  return documentIdForFile_(wo['WO_ID'], FILE_SCOPE.SERVICE);
}

/**
 * แผนกผู้รับงานที่พิมพ์บนเอกสาร
 *
 * ต่างจาก ASSIGNMENT_TH ตรงที่ตัวนั้นคือ "สายที่ขอมา" ซึ่งมีค่าตั้งแต่เปิดใบงาน
 * ส่วนตัวนี้คือ "แผนกที่รับงานจริง" ซึ่งเกิดขึ้นตอนอนุมัติเท่านั้น
 * ใบที่ยังไม่อนุมัติจึงต้องไม่มีชื่อแผนกอยู่บนกระดาษ ไม่งั้นแผนกจะนึกว่าเป็นงานของตัวเอง
 *
 * @param {Object} wo แถวใบงาน
 * @return {string}
 */
function reportDepartment_(wo) {
  if (!wo['Approved_Date']) return '';
  return toThai_(ASSIGNMENT_TH, wo['Assignment_Type']);
}

/**
 * ข้อความหมายเหตุกรณีเคยถูกตีกลับ — ปกติเว้นว่าง (SPEC 16.1)
 * @param {Object} wo แถวใบงาน
 * @return {string}
 */
function reportReturnNote_(wo) {
  var count = Number(wo['Return_Count'] || 0);
  if (!count) return '';

  var parts = ['ใบงานนี้เคยถูกตีกลับ ' + count + ' ครั้ง'];
  if (wo['Returned_Date']) parts.push('ครั้งล่าสุด ' + formatForDisplay_(wo['Returned_Date']));
  if (wo['Returned_By']) parts.push('โดย ' + wo['Returned_By']);
  if (wo['Return_Reason']) parts.push('เหตุผล: ' + wo['Return_Reason']);
  return parts.join(' · ');
}

/**
 * รายการ **หัวข้อ** ของเอกสารแนบ พร้อมจำนวนไฟล์ต่อหัวข้อ (SPEC 16.1 · 9.4)
 *
 * เอกสารใบนี้มีไว้ให้คนอ่านรู้ว่ามีอะไรแนบมา ไม่ใช่สารบัญไฟล์ · จึงบอกแค่หัวข้อ
 * **ห้ามพิมพ์ชื่อไฟล์ ขนาดไฟล์ หรือลิงก์ลงบนกระดาษ** ชื่อไฟล์ที่ระบบตั้งให้ยาว
 * และมีเลขลำดับปนอยู่ ซึ่งไม่ได้ช่วยให้ใครตัดสินใจอะไรได้ · ส่วนลิงก์บนกระดาษ
 * กดไม่ได้อยู่แล้ว และเอกสารใบนี้ถูกพิมพ์ออกกระดาษไปหน้างานจริง
 *
 * เรียงตามลำดับของหัวข้อในตาราง Attachment_Topic ไม่ใช่ลำดับที่ไฟล์ถูกอัปโหลด
 * เพื่อให้ใบสั่งงานสองใบของงานชนิดเดียวกันอ่านเทียบกันได้ · หัวข้อที่ไม่มีไฟล์
 * ถูกข้ามไปเลย ไม่ใช่พิมพ์ว่า 0 ไฟล์ ซึ่งจะทำให้รายการยาวขึ้นโดยไม่ได้ข้อมูลเพิ่ม
 *
 * ไฟล์ที่ไม่ได้อยู่ในหัวข้อของตารางนี้จะไม่ถูกนับ — รูปหน้างานของแผนก เอกสาร
 * ที่แผนกแนบตอนทำงาน และหลักฐานการชำระเงิน ล้วนเกิดขึ้น **หลัง** ใบสั่งงานใบนี้
 * ถูกอนุมัติ จึงไม่ใช่สิ่งที่ผู้อนุมัติเห็นตอนตัดสินใจ
 *
 * ฟังก์ชันล้วน ไม่แตะชีต — รายชื่อหัวข้อถูกส่งเข้ามาโดยผู้เรียก
 *
 * @param {Object[]} files รายการไฟล์ที่ยังใช้งานอยู่ (จาก listWoFileViews)
 * @param {Object[]} topics แถวหัวข้อจากตาราง Attachment_Topic ตามลำดับในตาราง
 * @return {string}
 */
function reportFileList_(files, topics) {
  var counts = {};
  var list = files || [];
  for (var i = 0; i < list.length; i++) {
    var id = String(list[i].topicId || '');
    if (!id) continue;
    counts[id] = (counts[id] || 0) + 1;
  }

  var lines = [];
  var order = topics || [];
  for (var t = 0; t < order.length; t++) {
    var topicId = String(order[t]['Topic_ID'] || '');
    var found = counts[topicId] || 0;
    if (!found) continue;
    lines.push('- ' + String(order[t]['Topic_Name'] || topicId) + ' (' + found + ' ไฟล์)');
  }

  // ว่างต้องพูดว่าว่าง ไม่ใช่ปล่อยช่องโหว่ให้คนอ่านเดาว่าระบบพิมพ์ตกหล่น
  return lines.length ? lines.join(NEW_LINE_) : 'ไม่มีเอกสารแนบ';
}

/**
 * ค่าที่เลือกได้หลายอย่าง ให้อ่านเป็นรายการคั่นด้วยจุลภาค
 * @param {*} value ค่าจากชีต (ข้อความคั่นด้วยจุลภาคอยู่แล้ว หรือ array)
 * @return {string}
 */
function reportListText_(value) {
  if (Object.prototype.toString.call(value) === '[object Array]') {
    return value.join(', ');
  }
  return String(value === null || value === undefined ? '' : value)
    .split(',')
    .map(function (item) { return item.trim(); })
    .filter(function (item) { return item !== ''; })
    .join(', ');
}

/**
 * ชื่อของฉบับเก่าที่ถูกย้ายเข้า _archive
 * ต้องมีทั้งเลขฉบับและวันเวลา เพื่อให้เรียงตามลำดับและรู้ว่าฉบับไหนออกเมื่อไร
 * @param {number} version เลขฉบับ
 * @param {Date} issuedAt เวลาที่ย้าย
 * @return {string}
 */
function reportArchiveName_(version, issuedAt) {
  var stamp = Utilities.formatDate(issuedAt, Session.getScriptTimeZone(), 'dd-MM-yyyy HH-mm-ss');
  return 'Work Order Report v' + version + ' (' + stamp + ').pdf';
}

/**
 * จำนวนฉบับที่เคยเก็บไว้แล้ว โดยไม่สร้างโฟลเดอร์ใหม่
 *
 * อ่านรหัสโฟลเดอร์จากแผนที่ในแถวใบงาน ไม่ได้ค้นหาตามชื่อ (SPEC 21)
 * และไม่เรียก ensureWoFolder_ เพราะโฟลเดอร์ต้องสร้างเมื่อจะใช้จริงเท่านั้น (SPEC 16)
 *
 * @param {Object} wo แถวใบงาน
 * @return {number}
 */
function reportArchiveCount_(wo) {
  var map = parseFolderMap_(wo['Folder_Map']);
  return driveCountFiles_(map[REPORT_ARCHIVE_FOLDER] || '');
}

/**
 * ฉบับเก่าทั้งหมดที่เก็บไว้ใน _archive พร้อมลิงก์เปิด (SPEC 16.1)
 *
 * อ่านรหัสโฟลเดอร์จากแผนที่ในแถวใบงาน ไม่ได้ค้นหาตามชื่อ (SPEC 21)
 * และไม่สร้างโฟลเดอร์ให้ เพราะนี่คือการอ่านเพื่อแสดงผลเท่านั้น
 *
 * @param {Object} wo แถวใบงาน
 * @return {Object[]} [{name, url}] เรียงจากใหม่ไปเก่า
 */
function reportArchiveList_(wo) {
  var map = parseFolderMap_((wo || {})['Folder_Map']);
  var files = driveListFiles_(map[REPORT_ARCHIVE_FOLDER] || '');
  var out = [];
  for (var i = 0; i < files.length; i++) {
    /*
     * ลำดับในรายการคือสิ่งที่หน้าเว็บส่งกลับมาตอนขอไฟล์ ไม่ใช่ชื่อไฟล์หรือรหัสไฟล์ (กฎข้อ 34)
     *
     * ชื่อไฟล์ที่เบราว์เซอร์ส่งกลับมาเชื่อไม่ได้ และรหัสของ Drive ห้ามออกไปถึงเบราว์เซอร์เลย ·
     * ลำดับเป็นค่าที่ฝั่งเซิร์ฟเวอร์เป็นคนกำหนดเองทั้งหมด ตัวเลขที่ถูกดัดแปลงจึงทำได้
     * อย่างมากแค่ชี้ไปยังฉบับเก่าอีกฉบับของใบงานเดียวกัน ซึ่งผู้ขอมีสิทธิ์เห็นอยู่แล้ว
     */
    out.push({ at: i, name: files[i].name, url: files[i].url });
  }
  return out;
}

/**
 * ออกใบสั่งงานฉบับใหม่ (SPEC 16.1)
 *
 * ลำดับสำคัญ: เก็บฉบับเดิมเข้า _archive ให้เรียบร้อยก่อน แล้วจึงเขียนฉบับใหม่ทับที่เดิม
 * ถ้าทำกลับกัน ฉบับเดิมจะหายไปทันทีที่เขียนทับ และกู้คืนไม่ได้เลย
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {Object} user ผู้สั่งออกเอกสาร
 * @return {Object} {woId, version, url, fileId}
 * @throws {Error} เมื่อไม่พบใบงาน ยังไม่ได้ตั้งแม่แบบ หรือออกเอกสารไม่สำเร็จ
 */
async function generateWorkOrderReport(woId, user) {
  var templateId = getProp_(PROP_KEY.WO_REPORT_TEMPLATE, false);
  if (!templateId) throw new Error(REPORT_TEMPLATE_NOT_SET_MESSAGE);

  var wo = await getWorkOrder(woId);
  if (!wo) throw new Error('ไม่พบใบงาน ' + woId);

  var issuedAt = new Date();
  var folderId = await ensureWoFolder_(woId, '');       // รากของใบงานนี้ สร้างให้ถ้ายังไม่มี

  /* ---------- 1) เก็บฉบับเดิมก่อน ห้ามทับทิ้ง ---------- */
  var archived = reportArchiveCount_(wo);
  var current = driveFileNamed_(folderId, REPORT_FILE_NAME);
  if (current) {
    var archiveId = await ensureWoFolder_(woId, REPORT_ARCHIVE_FOLDER);
    driveMoveFile_(current.id, archiveId, reportArchiveName_(archived + 1, issuedAt));
    archived++;
  }
  var version = archived + 1;

  /* ---------- 2) คัดลอกแม่แบบแล้วแทนค่า ---------- */
  var values = await reportValuesFor_(woId, wo, { version: version, issuedAt: issuedAt });

  var tempId = '';
  try {
    tempId = driveCopyFile_(templateId, 'ชั่วคราว ' + woId + ' v' + version, folderId);
  } catch (e) {
    throw new Error(REPORT_TEMPLATE_BROKEN_MESSAGE);
  }

  var pdf;
  try {
    docReplaceValues_(tempId, values);
    pdf = driveExportPdf_(tempId, folderId, REPORT_FILE_NAME);
  } finally {
    // ไฟล์ชั่วคราวต้องหายไปเสมอ แม้ขั้นตอนถัดไปจะล้ม ไม่งั้นโฟลเดอร์ของใบงานจะรกขึ้นเรื่อย ๆ
    driveTrashById_(tempId, false);
  }

  /* ---------- 3) ให้ลิงก์ในแถวใบงานชี้ฉบับปัจจุบันเสมอ ---------- */
  await updateWorkOrder(woId, { 'Report_URL': pdf.url });
  await writeAudit(ENTITY.FILE, woId, ACTION.REPORT, 'Report_URL',
    wo['Report_URL'] || '', pdf.url, 'ออกใบสั่งงานฉบับที่ ' + version, { woId: woId });

  return { woId: woId, version: version, url: pdf.url, fileId: pdf.id };
}

/**
 * ค่าที่จะแทนลงแม่แบบ พร้อมของที่ต้องอ่านจากฐานข้อมูลก่อน
 *
 * แยกจาก reportValues_ เพราะตัวนั้นเป็นฟังก์ชันล้วนและต้องเป็นอย่างนั้นต่อไป —
 * มันคือส่วนที่ผิดง่ายที่สุดและต้องเทสต์ถี่ที่สุด · ตัวนี้เป็นชั้นบาง ๆ ที่รู้ว่า
 * ต้องไปอ่านอะไรมาให้บ้าง และเป็นจุดที่เทสต์ใช้พิสูจน์ว่าการต่อสายถูกต้อง
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {Object} wo แถวใบงาน
 * @param {Object} meta {version, issuedAt}
 * @return {Object} แผนที่ชื่อตัวแปร -> ข้อความ
 */
async function reportValuesFor_(woId, wo, meta) {
  return await reportValues_(wo, await listWoFileViews(woId), {
    version:  meta.version,
    issuedAt: meta.issuedAt,
    /*
     * อ่านทั้งชุดรวมหัวข้อที่ปิดใช้งานแล้วด้วย (activeOnly = false) เพราะใบงานเก่า
     * อาจมีไฟล์อยู่ในหัวข้อที่วันนี้เลิกใช้ไปแล้ว · ถ้าอ่านแต่หัวข้อที่ยังเปิดอยู่
     * ไฟล์เหล่านั้นจะหายไปจากใบสั่งงานเงียบ ๆ ทั้งที่ไฟล์ยังอยู่ครบ
     *
     * ตารางนี้อยู่ในชุดที่แคชไว้ จึงไม่ใช่คำขอเพิ่มในทางปฏิบัติ (SPEC 22.5)
     */
    topics:   await listAttachmentTopics(false)
  });
}

/**
 * ออกใบสั่งงานแบบ "พลาดได้" — ใช้กับ 3 จังหวะอัตโนมัติ (SPEC 16.1)
 *
 * การออกเอกสารต้องไม่ทำให้รายการหลักล้ม สถานะที่บันทึกไปแล้วห้ามย้อนกลับเพราะ
 * Drive ตอบช้าหรือแม่แบบหาย · ความผิดพลาดจึงถูกกลืนไว้ที่นี่ แต่ต้องไม่เงียบหาย —
 * บันทึกลง Audit_Log ไว้ เพื่อให้ตามได้ว่าใบไหนยังไม่มีเอกสาร แล้วสั่งออกใหม่ทีหลังได้
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {Object} user ผู้ทำรายการ
 * @param {string} when จังหวะที่ออก (ค่าจาก ACTION) ใช้บอกใน Audit ว่าพลาดตอนไหน
 * @return {Object|null} ผลของการออกเอกสาร หรือ null เมื่อไม่สำเร็จ
 */
async function tryGenerateWorkOrderReport_(woId, user, when) {
  /*
   * ชุดทดสอบปิดการออกเอกสารไว้ (ดู beginTestRun_ ใน 99_Test.gs)
   *
   * เหตุผลเดียวกับที่ชุดทดสอบไม่อัปโหลดไฟล์จริงทุกครั้ง — การรันหนึ่งรอบสร้างใบงาน
   * นับร้อยใบ ถ้าออก PDF ทุกใบจะกินพื้นที่ Drive ของเจ้าของระบบ (มีแค่ 15 GB ทั้งระบบ)
   * และเพิ่มเวลาจนทุกกลุ่มชนเพดาน 6 นาที · ชุดที่ต้องพิสูจน์เรื่องเอกสารจะเปิดเองเฉพาะตอนใช้
   *
   * ค่านี้เป็น false เสมอในการใช้งานจริง มีแต่ 99_Test.gs ที่แตะมัน (แบบเดียวกับ TEST_IDENTITY_)
   */
  if (REPORT_DISABLED_) return null;

  try {
    return await generateWorkOrderReport(woId, user);
  } catch (err) {
    var message = (err && err.message) ? err.message : String(err);
    Logger.log('ออกใบสั่งงาน ' + woId + ' ไม่สำเร็จ (' + when + '): ' + message);
    try {
      await writeAudit(ENTITY.FILE, woId, ACTION.REPORT_FAILED, 'Report_URL', '', '',
        'ออกเอกสารตอน ' + when + ' ไม่สำเร็จ: ' + message, { woId: woId });
    } catch (ignored) {
      // เขียน Audit ไม่ได้ด้วย ก็ยังห้ามทำให้รายการหลักล้ม — เหลือร่องรอยใน Logger แล้ว
    }
    return null;
  }
}

/* ---------------------------------------------------------------------------
 * ตาข่ายรองของการออกเอกสาร (SPEC 16.1)
 *
 * ตั้งแต่ใบสั่งงานถูกย้ายไปออก **หลัง** ไฟล์แนบขึ้นครบ (เพื่อให้เอกสารบอกได้ว่า
 * มีอะไรแนบมาบ้าง) ก็เกิดช่องว่างใหม่ขึ้นมาหนึ่งช่อง — ผู้ใช้ปิดแท็บระหว่างที่
 * ไฟล์กำลังทยอยขึ้น · ใบงานถูกสร้างเรียบร้อยแล้ว ไฟล์ขึ้นไปบางส่วน แต่ไม่มีใคร
 * สั่งออกเอกสาร และจะไม่มีใครสั่งตลอดไปถ้าไม่มีตาข่ายรอง
 * --------------------------------------------------------------------------- */

/** ป้ายบอกจังหวะที่ตาข่ายรองทำงาน — ไปโผล่ใน Audit_Log ตอนออกเอกสารไม่สำเร็จ */
var REPORT_WHEN_UPLOADED = 'อัปโหลดไฟล์แนบครบ';

/** จังหวะที่ผู้อนุมัติเปิดหน้ารายการแล้วพบใบที่ยังไม่มีเอกสาร */
var REPORT_WHEN_MISSING = 'พบใบที่ยังไม่มีเอกสาร';

/** กันการสั่งออกพร้อมกันหลายครั้งของใบเดียวกัน (วินาที) */
var REPORT_GUARD_TTL_SEC = 120;

/**
 * ออกใบสั่งงานให้ **ก็ต่อเมื่อยังไม่มี** — เรียกซ้ำกี่ครั้งก็ได้ผลเดียวกัน
 *
 * ต่างจาก generateWorkOrderReport() ซึ่งออกฉบับใหม่ทุกครั้งที่ถูกเรียก (และนั่นถูกแล้ว
 * สำหรับสามจังหวะตามสเปก เพราะข้อมูลในใบงานเปลี่ยนไปจริง) · ตัวนี้มีไว้อุดช่องว่าง
 * จึงต้องไม่สร้างฉบับซ้ำให้ใบที่มีเอกสารอยู่แล้ว
 *
 * กันการยิงพร้อมกันด้วยรอยในแคชอายุสั้น ไม่ใช่ด้วย LockService เพราะ
 * generateWorkOrderReport() ไปจับล็อกตัวเดียวกันอยู่ข้างในผ่าน ensureWoFolder_
 * การจับซ้อนกันเองเป็นเรื่องที่ไม่ควรเสี่ยง · รอยในแคชไม่ใช่การกันที่สมบูรณ์
 * แต่สิ่งที่หลุดออกไปคือ "ได้เอกสารเพิ่มอีกหนึ่งฉบับ" ซึ่งฉบับเดิมยังอยู่ใน _archive
 * ครบตามสเปก ไม่มีข้อมูลหาย
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {Object} user ผู้ทำรายการ
 * @param {string} when จังหวะที่เรียก ใช้บอกใน Audit เมื่อออกไม่สำเร็จ
 * @return {Object|null} ผลของการออกเอกสาร · null เมื่อมีอยู่แล้วหรือออกไม่สำเร็จ
 */
async function ensureWorkOrderReport_(woId, user, when) {
  var id = String(woId || '');
  if (!id) return null;

  /*
   * อ่านจากของจริงเสมอ ไม่ใช่จากแคชของการรัน · ผู้เรียกคนก่อนในคำขอเดียวกัน
   * อาจเพิ่งออกเอกสารไปหมาด ๆ แล้วแคชยังถือแถวก่อนหน้านั้นอยู่
   */
  clearRowCache_(SHEET.WORK_ORDER);
  var wo = await getWorkOrder(id);
  if (!wo) return null;
  if (String(wo['Report_URL'] || '')) return null;

  var guard = 'woreport:' + id;
  if (cacheGet_(guard)) return null;
  cachePut_(guard, '1', REPORT_GUARD_TTL_SEC);

  return await tryGenerateWorkOrderReport_(id, user, when);
}
