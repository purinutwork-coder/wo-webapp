/**
 * 06_Files.gs — ตั้งชื่อไฟล์ อัปโหลดขึ้น Drive และทะเบียน File_Index (SPEC 14, 16, 21)
 *
 * ไฟล์นี้เป็นที่เดียวในระบบที่เรียก DriveApp ได้ — ไฟล์ชั้นอื่นห้ามเรียกตรงแม้แต่บรรทัดเดียว
 * เหมือนกฎที่ใช้กับ SpreadsheetApp ใน 01_Repo_Sheet.gs · เหตุผลเดียวกัน คือวันที่ต้องย้าย
 * ที่เก็บไฟล์ไปที่อื่น (Cloud Storage, S3) จะแก้ไฟล์เดียวจบ ไม่ต้องไล่หาทั้งโปรเจกต์
 * มีเทสต์สแกนยืนยันข้อนี้อยู่ใน 99_Test.gs (test_files_driveIsolation)
 *
 * ชั้นบนเรียกผ่านฟังก์ชันที่รับ-คืนค่าธรรมดาเท่านั้น ไม่มีวัตถุของ Drive (File, Folder, Blob)
 * หลุดออกไปข้างนอกไฟล์นี้เลย
 *
 * โครงของไฟล์แบ่งเป็นสองส่วนชัดเจน
 *   ส่วนที่ 1  ตรรกะล้วน — ตั้งชื่อ ไล่ลำดับ ตรวจไฟล์บังคับ ไม่แตะ Drive เลย จึงเทสต์ได้ตรง ๆ
 *   ส่วนที่ 2  ตัวที่คุยกับ Drive จริง — ตัวเล็ก ๆ ไม่กี่ตัว ไม่มีตรรกะธุรกิจอยู่ข้างใน
 */

/* ---------------------------------------------------------------------------
 * ค่าคงที่ของชั้นไฟล์
 * --------------------------------------------------------------------------- */

/**
 * จุดที่ไฟล์ถูกแนบ — ตัดสินทั้งรูปแบบชื่อไฟล์ (SPEC 14.1) และโฟลเดอร์ปลายทาง (SPEC 16)
 * ค่า WO / SERVICE / PROJECT / LAB ตรงกับคอลัมน์ Scope ของ Attachment_Topic (SPEC 13)
 */
var FILE_SCOPE = Object.freeze({
  WO:      'WO',        // ไฟล์แนบตอนสร้างใบงาน รวมรูปภาพ
  PAYMENT: 'PAYMENT',   // หลักฐานการชำระเงิน
  SERVICE: 'SERVICE',   // Report ของแผนก Service แยกตาม Step
  PROJECT: 'PROJECT',   // Report ของแผนก Project แยกตามงวดงาน
  LAB:     'LAB'        // Report ของแผนก Lab
});

/**
 * หัวข้อของ "รูปหน้างาน" ที่แผนกแนบเข้าไปในขั้นตอนหรืองวดของตัวเอง (SPEC 7.1, 7.2)
 *
 * ไม่ใช่รายการในตาราง Report_Master และจะไม่ใช่ เพราะรูปหน้างานไม่มีเลขฟอร์ม
 * ไม่มีแบบฟอร์มต้นฉบับ และไม่เคยเป็นเอกสารที่บังคับแนบ · ถ้าเอาไปใส่ไว้ในตารางนั้น
 * มันจะไปโผล่ปนกับเอกสาร 41 รายการในช่องเลือก แล้วต้องมีคอลัมน์ใหม่มาบอกว่า
 * แถวไหนไม่ใช่เอกสารจริง ซึ่งเป็นกับดักแบบเดียวกับคอลัมน์ที่ไม่มีความหมาย
 *
 * เก็บลงคอลัมน์ Topic_ID ของ File_Index (ไม่ใช่ Report_Code) เพราะมันคือหัวข้อของไฟล์
 * ไม่ใช่รหัสเอกสาร · ด่าน Report ที่บังคับจึงไม่นับรูปเหล่านี้โดยอัตโนมัติ
 */
var PHOTO_TOPIC = Object.freeze({
  ID:   'STEP-PHOTO',
  NAME: 'รูปภาพ'      // คำเดียวกับรูปที่แนบตอนสร้างใบงาน (SPEC 14.1) ชื่อไฟล์จึงอ่านเหมือนกันทั้งระบบ
});

/**
 * นามสกุลไฟล์ที่รับได้ — นอกรายการนี้ปฏิเสธตั้งแต่ยังไม่แตะ Drive (SPEC 14.2)
 * ไม่รับไฟล์ที่รันได้ (exe, js, html) เพราะไม่มีเหตุผลทางธุรกิจให้แนบ
 */
var ALLOWED_FILE_EXTENSIONS = Object.freeze([
  'pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'dwg', 'dxf', 'zip'
]);

/**
 * ขนาดสูงสุดต่อไฟล์ (ไบต์)
 *
 * ไฟล์วิ่งผ่านโปรเจกต์หน้าบ้านไปหลังบ้าน คือข้าม 2 ต่อ และถูกแปลงเป็น base64
 * ซึ่งทำให้ก้อนใหญ่ขึ้นราวหนึ่งในสามระหว่างทาง ทั้งสองต่อมีเพดานเวลา 6 นาทีของตัวเอง
 * ตัวเลขนี้จึงตั้งไว้ต่ำกว่าเพดานทางเทคนิคมาก เพื่อให้เหลือที่หายใจ
 *
 * ต้องบอกผู้ใช้เป็นตัวเลขชัด ๆ บนหน้าจอเสมอ ห้ามให้รู้ตอนอัปโหลดล้มเหลวแล้ว
 */
var MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** ความยาวสูงสุดของชื่อหัวข้อในชื่อไฟล์ (SPEC 14.2) */
var MAX_TOPIC_NAME_LENGTH = 50;

/** อักขระที่ Drive ใช้ในชื่อไฟล์ไม่ได้ — แทนด้วยขีดกลาง (SPEC 14.2) */
var DRIVE_BAD_CHAR_PATTERN = /[\/\\:*?"<>|]/g;

/** ชื่อโฟลเดอร์ชั้นบนสุดที่เก็บใบงานทุกใบ (SPEC 16) */
var DRIVE_WO_CONTAINER_NAME = 'WO';

/** Script Property ที่จำรหัสโฟลเดอร์ WO ไว้ จะได้ไม่ต้องค้นหาตามชื่อทุกครั้ง */
var PROP_DRIVE_WO_FOLDER = 'DRIVE_WO_FOLDER_ID';

/**
 * ชื่อโฟลเดอร์ที่เก็บไฟล์สำรองฐานข้อมูล (SPEC 22.6)
 *
 * ขึ้นต้นด้วยขีดล่างเพื่อให้เรียงอยู่ต้นรายการและเห็นได้ทันทีว่าไม่ใช่ของผู้ใช้
 * ชื่อเดียวกับที่ 98_Backup.gs พูดถึง แต่อยู่ที่นี่เพราะที่นี่คือชั้นที่รู้จัก Drive
 */
var DRIVE_BACKUP_FOLDER_NAME = '_backup';

/** Script Property ที่จำรหัสโฟลเดอร์สำรองไว้ ด้วยเหตุผลเดียวกับโฟลเดอร์ WO */
var PROP_DRIVE_BACKUP_FOLDER = 'DRIVE_BACKUP_FOLDER_ID';

/** ชื่อโฟลเดอร์รากที่ setupDriveFolder() สร้างให้ (SPEC 16) */
var DRIVE_ROOT_FOLDER_NAME = 'Web App';

/*
 * ข้อความสองอันนี้ต้องบอกว่า "ต้องทำอะไรต่อ" ไม่ใช่บอกแค่ว่าเปิดไม่ได้
 * เพราะคนที่เจอข้อความนี้คือผู้ใช้ที่กำลังจะแนบไฟล์ ซึ่งแก้เองไม่ได้
 * เขาต้องรู้ว่าจะไปบอกผู้ดูแลว่าอะไร ไม่งั้นจะกลายเป็น "ระบบพัง" ลอย ๆ
 */
var DRIVE_NOT_SET_UP_MESSAGE =
  'ระบบยังไม่ได้ตั้งค่าที่เก็บไฟล์ จึงแนบไฟล์ไม่ได้ ' +
  'กรุณาแจ้งผู้ดูแลระบบให้กดรัน setupDriveFolder() หนึ่งครั้ง';

var DRIVE_BROKEN_MESSAGE =
  'ระบบเปิดที่เก็บไฟล์ไม่ได้ อาจถูกลบหรือย้ายไปถังขยะ ' +
  'กรุณาแจ้งผู้ดูแลระบบให้ตรวจด้วย checkDriveFolder()';

/**
 * ข้อความบอกขนาดสูงสุดที่ผู้ใช้อ่านรู้เรื่อง — ใช้ทั้งบนหน้าจอและในข้อความปฏิเสธ
 * @return {string}
 */
function maxUploadLabel_() {
  return (MAX_UPLOAD_BYTES / (1024 * 1024)) + ' MB';
}

/* ===========================================================================
 * ส่วนที่ 1 — ตรรกะล้วน ไม่แตะ Drive
 * =========================================================================== */

/**
 * เลขงานที่ใช้ตั้งชื่อไฟล์ (SPEC 10.1, 14.2)
 *
 * SV_ID และ LAB_ID คือการเปลี่ยนตัวนำหน้าของ WO_ID ใบนั้น ไม่ใช่ตัวนับแยก
 * ห้ามใช้ PJ_ID เป็นตัวนำหน้าเด็ดขาด เพราะ PJ_ID ใช้ซ้ำข้ามหลายใบงาน
 * ไฟล์จากคนละใบงานที่ทำสถานที่เดียวกันจะชนกันทันที
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} scope ค่าจาก FILE_SCOPE
 * @return {string}
 */
function documentIdForFile_(woId, scope) {
  var text = String(woId || '');
  if (scope === FILE_SCOPE.SERVICE || scope === FILE_SCOPE.PROJECT) {
    return text.replace(PREFIX.WO, PREFIX.SV);
  }
  if (scope === FILE_SCOPE.LAB) {
    return text.replace(PREFIX.WO, PREFIX.LAB);
  }
  return text;   // ไฟล์แนบตอนสร้างใบงานและหลักฐานการชำระ ใช้ WO_ID ตรง ๆ
}

/**
 * ทำชื่อหัวข้อให้ใช้เป็นชื่อไฟล์ได้ (SPEC 14.2)
 *
 * แทนอักขระที่ Drive ใช้ไม่ได้ด้วยขีดกลาง แล้วตัดที่ 50 ตัวอักษร
 * เพราะชื่อ Report บางรายการยาวมาก เช่น "ใบตรวจเช็คการทำงานของระบบชิลเลอร์และคูลลิ่งทาวเวอร์"
 *
 * @param {string} name ชื่อหัวข้อจาก Attachment_Topic หรือ Report_Master
 * @return {string}
 */
function sanitizeTopicName_(name) {
  var text = String(name === null || name === undefined ? '' : name)
    .replace(DRIVE_BAD_CHAR_PATTERN, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > MAX_TOPIC_NAME_LENGTH) text = text.substring(0, MAX_TOPIC_NAME_LENGTH).trim();
  return text;
}

/**
 * นามสกุลไฟล์เดิมของผู้ใช้ — คงไว้เสมอ ไม่แปลงชนิดไฟล์ (SPEC 14.2)
 * @param {string} fileName ชื่อไฟล์ที่ผู้ใช้ส่งมา
 * @return {string} นามสกุลตัวพิมพ์เล็ก ไม่มีจุดนำหน้า · ค่าว่างเมื่อไม่มีนามสกุล
 */
function fileExtensionOf_(fileName) {
  var text = String(fileName || '');
  var dot = text.lastIndexOf('.');
  if (dot <= 0 || dot === text.length - 1) return '';
  return text.substring(dot + 1).toLowerCase();
}

/**
 * นามสกุลนี้อยู่ในรายการที่อนุญาตหรือไม่
 * @param {string} extension นามสกุลตัวพิมพ์เล็ก
 * @return {boolean}
 */
function isAllowedExtension_(extension) {
  return ALLOWED_FILE_EXTENSIONS.indexOf(String(extension || '').toLowerCase()) !== -1;
}

/**
 * ลำดับ 2 หลักตามกติกา SPEC 14.2 — เริ่มที่ 01
 * เกิน 99 ให้ขยายเป็น 3 หลักต่อไป ไม่ต้องโยน error (หลักการเดียวกับลำดับใน PJ_ID)
 * @param {number} seq ลำดับ
 * @return {string}
 */
function formatFileSeq_(seq) {
  var text = String(Math.max(1, Number(seq) || 1));
  while (text.length < 2) text = '0' + text;
  return text;
}

/**
 * ประกอบชื่อไฟล์ที่จะบันทึกจริง (SPEC 14.1)
 * @param {Object} plan {prefix, middle, extension}
 * @param {number} seq ลำดับ
 * @return {string}
 */
function buildSavedFileName_(plan, seq) {
  return plan.prefix + '_' + plan.middle + '_' + formatFileSeq_(seq) +
    (plan.extension ? '.' + plan.extension : '');
}

/**
 * แผนการตั้งชื่อและที่เก็บของไฟล์หนึ่งไฟล์ — ตรรกะล้วน ไม่แตะทั้ง Drive และชีต
 *
 * แยกออกมาเป็นฟังก์ชันของตัวเองเพราะนี่คือส่วนที่กติกา SPEC 14 อยู่ครบ
 * และเป็นส่วนที่ต้องเทสต์ให้ครบทุกรูปแบบในตาราง 14.1
 *
 * @param {Object} context {woId, scope, topicName, formNo, stepNo, mimeType, fileName}
 * @return {Object} {prefix, middle, extension, folderPath, seqKey}
 * @throws {Error} เมื่อข้อมูลไม่พอจะตั้งชื่อได้
 */
function fileNamePlan_(context) {
  var scope = context.scope;
  var prefix = documentIdForFile_(context.woId, scope);
  var extension = fileExtensionOf_(context.fileName);

  var middle;
  var folderPath;

  switch (scope) {
    case FILE_SCOPE.WO:
      middle = sanitizeTopicName_(context.topicName);
      // SPEC 16 แยกรูปภาพออกจากไฟล์เอกสาร · ตัดสินจากชนิดไฟล์ ไม่ใช่จากชื่อหัวข้อ
      // เพราะชื่อหัวข้อเป็นข้อความที่ผู้ดูแลแก้ได้ ถ้าผูกกับชื่อ วันหนึ่งจะเงียบ ๆ ผิดที่
      folderPath = isImageMimeType_(context.mimeType) ? 'Picture' : 'Attachments';
      break;

    case FILE_SCOPE.PAYMENT:
      middle = 'หลักฐานการชำระ';
      folderPath = 'Payment';
      break;

    case FILE_SCOPE.SERVICE:
      middle = 'Step' + requireStepNo_(context.stepNo, 'Step') + '_' + sanitizeTopicName_(context.formNo);
      folderPath = 'Service/Step ' + requireStepNo_(context.stepNo, 'Step');
      break;

    case FILE_SCOPE.PROJECT:
      /*
       * งาน Project ไม่มีงวดตั้งต้นอีกแล้ว แผนกเพิ่มเอง และงานที่จบในวันเดียวจะไม่มีงวดเลย
       * (SPEC 20.2) · ใบที่ไม่มีงวดจึงต้องแนบเอกสารที่ตัวงานได้ ไม่งั้นจะแนบเอกสารที่บังคับ
       * ไม่ได้เลยแล้วปิดงานไม่ได้ตลอดกาล · ชื่อไฟล์กรณีนี้ตัดส่วน "งวด" ออกไปตรง ๆ
       * ไม่ใส่ "งวด0" เพราะงวดที่ศูนย์ไม่มีอยู่จริงและจะทำให้คนอ่านเข้าใจผิด
       */
      if (!context.stepNo) {
        middle = sanitizeTopicName_(context.formNo);
        folderPath = 'Project';
        break;
      }
      middle = 'งวด' + requireStepNo_(context.stepNo, 'งวดงาน') + '_' + sanitizeTopicName_(context.formNo);
      folderPath = 'Project/Period ' + requireStepNo_(context.stepNo, 'งวดงาน');
      break;

    case FILE_SCOPE.LAB:
      middle = sanitizeTopicName_(context.formNo);
      folderPath = 'Lab';
      break;

    default:
      throw new Error('ไม่รู้จักประเภทของไฟล์ที่จะแนบ กรุณาแจ้งผู้ดูแลระบบ');
  }

  /*
   * รูปหน้างานเก็บที่โฟลเดอร์ Picture "ของแผนกนั้น" เช่น Service/Picture (SPEC 16)
   *
   * อยู่ใต้แผนกเพราะรูปเป็นผลงานของแผนกที่ถ่ายมา ไม่ใช่ของกลางของใบงาน — เปิดโฟลเดอร์
   * ของแผนกแล้วเห็นทั้งเอกสารและรูปของตัวเองครบในที่เดียว ไม่ต้องข้ามไปอีกโฟลเดอร์
   * ส่วน Picture ที่รากใบงานยังเป็นของรูปที่แนบตอนสร้างใบงานเหมือนเดิม ไม่ปนกัน
   *
   * ไม่ลงลึกถึงระดับขั้นตอน เพราะคำถามที่ถูกถามจริงคือ "ขอดูรูปของแผนกนี้"
   * และชื่อไฟล์มีเลขขั้นตอนอยู่แล้ว จึงยังรู้ได้อยู่ดีว่ารูปใบไหนมาจากขั้นไหน
   */
  if (context.photo) folderPath = departmentFolderOf_(scope) + '/Picture';

  if (!middle) {
    throw new Error('ยังไม่ได้เลือกหัวข้อของไฟล์ กรุณาเลือกหัวข้อก่อนอัปโหลด');
  }

  return { prefix: prefix, middle: middle, extension: extension, folderPath: folderPath };
}

/**
 * โฟลเดอร์ชั้นบนสุดของแผนกนั้นในใบงานหนึ่ง (SPEC 16)
 *
 * แยกออกมาเป็นที่เดียว เพราะทั้งเอกสารและรูปต้องลงใต้โฟลเดอร์เดียวกันเสมอ
 * ถ้าเขียนชื่อโฟลเดอร์ซ้ำสองที่ วันที่เปลี่ยนชื่อจะเหลือของเก่าค้างอยู่ที่หนึ่ง
 *
 * @param {string} scope ค่าจาก FILE_SCOPE
 * @return {string}
 * @throws {Error} เมื่อไม่ใช่ขอบเขตของแผนกใดเลย
 */
function departmentFolderOf_(scope) {
  switch (scope) {
    case FILE_SCOPE.SERVICE: return 'Service';
    case FILE_SCOPE.PROJECT: return 'Project';
    case FILE_SCOPE.LAB:     return 'Lab';
    default:
      throw new Error('รูปหน้างานต้องแนบจากงานของแผนกเท่านั้น กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง');
  }
}

/**
 * เลข Step หรืองวดงานที่ต้องมี
 * @param {*} value เลขที่ส่งมา
 * @param {string} what ชื่อสิ่งนั้นในข้อความภาษาไทย
 * @return {number}
 * @throws {Error} เมื่อไม่มีหรือไม่ใช่เลขที่ใช้ได้
 */
function requireStepNo_(value, what) {
  var number = Number(value);
  if (!number || number < 1) {
    throw new Error('ยังไม่ได้ระบุว่าเป็นไฟล์ของ' + what + 'ที่เท่าไร กรุณาเลือกก่อนอัปโหลด');
  }
  return number;
}

/**
 * ไฟล์นี้เป็นรูปภาพหรือไม่ — ใช้ตัดสินโฟลเดอร์ปลายทาง
 * @param {string} mimeType ชนิดไฟล์ที่เบราว์เซอร์บอกมา
 * @return {boolean}
 */
function isImageMimeType_(mimeType) {
  return String(mimeType || '').toLowerCase().indexOf('image/') === 0;
}

/**
 * ลำดับถัดไปของหัวข้อนั้นในใบงานนั้น (SPEC 14.2)
 *
 * นับจากทะเบียน File_Index ไม่ใช่จากการไล่ดูชื่อไฟล์ใน Drive ซึ่งช้าและพังง่าย
 *
 * เทียบจาก "ชื่อไฟล์ที่ตั้งไว้แล้ว" ไม่ใช่จากรหัสหัวข้อ เพราะสิ่งที่ห้ามชนกันคือชื่อไฟล์
 * Report คนละรหัสที่ใช้ Form_No เดียวกันมีอยู่จริง (SPEC B-3) ถ้านับแยกตามรหัส
 * ทั้งคู่จะได้เลข 01 แล้วได้ชื่อไฟล์เดียวกันทั้งที่เป็นคนละใบ
 *
 * นับรวมแถวที่ปิดใช้งานแล้วด้วย เพื่อไม่ให้เลขที่เคยออกไปถูกใช้ซ้ำแล้วไปทับไฟล์เดิม
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {Object} plan แผนชื่อไฟล์จาก fileNamePlan_()
 * @return {number} ลำดับถัดไป เริ่มที่ 1
 */
function nextFileSeq_(woId, plan) {
  var head = plan.prefix + '_' + plan.middle + '_';

  /*
   * เดิมอ่านทะเบียนไฟล์ทั้งตารางแล้วคัดใบงานใบเดียวออกมาเอง — บนชีตไม่ต่างกัน
   * เพราะอ่านทั้งแท็บมาแล้ว แต่บนฐานข้อมูลมันคือการลากทะเบียนทั้งก้อนข้ามเครือข่าย
   * เพื่อหาเลขเดียว ทุกครั้งที่มีคนแนบไฟล์ (กฎข้อ 28)
   *
   * ใช้ findBy_ ไม่ใช่ listFilesByWo เพราะต้องนับรวมแถวที่ปิดใช้งานไปแล้วด้วย
   * ไม่งั้นไฟล์ใหม่จะได้เลขซ้ำกับไฟล์ที่ถูกลบไปแล้ว
   */
  var rows = findBy_(SHEET.FILE_INDEX, 'WO_ID', woId);
  var highest = 0;

  for (var i = 0; i < rows.length; i++) {
    var name = String(rows[i]['Saved_File_Name'] || '');
    if (name.indexOf(head) !== 0) continue;

    var tail = name.substring(head.length);
    var digits = /^(\d+)/.exec(tail);
    var seq = digits ? Number(digits[1]) : Number(rows[i]['Seq'] || 0);
    if (seq > highest) highest = seq;
  }
  return highest + 1;
}

/**
 * หัวข้อไฟล์แนบที่บังคับของใบงาน แต่ยังไม่ได้แนบ (SPEC 5, 9.4)
 *
 * เงื่อนไข "ไฟล์แนบที่บังคับครบ" ในตาราง Transition หัวข้อ 5 ค้างมาตั้งแต่เฟส 3
 * เพราะตอนนั้นยังไม่มีระบบไฟล์ จึงบังคับอะไรไม่ได้เลย ตอนนี้เปิดใช้ได้แล้ว
 *
 * ต้องคืนเป็น "ชื่อหัวข้อ" ไม่ใช่แค่จำนวน เพราะข้อความต้องบอกว่าขาดหัวข้อไหน
 * ไม่ใช่บอกแค่ว่าไฟล์ไม่ครบ แล้วปล่อยให้ผู้ใช้ไล่หาเองทีละหัวข้อ
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {string[]} ชื่อหัวข้อที่ยังขาด
 */
function missingRequiredTopics_(woId) {
  var topics = listAttachmentTopics();      // คัดเฉพาะ Active มาให้แล้ว
  var attached = {};
  var files = listFilesByWo(woId);          // คัดเฉพาะ Is_Active มาให้แล้ว
  for (var f = 0; f < files.length; f++) {
    attached[String(files[f]['Topic_ID'] || '')] = true;
  }

  var missing = [];
  for (var t = 0; t < topics.length; t++) {
    var topic = topics[t];
    if (String(topic['Scope'] || '') !== FILE_SCOPE.WO) continue;
    if (!cellToBoolean_(topic['Required'])) continue;
    if (attached[String(topic['Topic_ID'] || '')]) continue;
    missing.push(String(topic['Topic_Name'] || topic['Topic_ID']));
  }
  return missing;
}

/**
 * ข้อความบอกว่าขาดไฟล์แนบหัวข้อไหน
 * @param {string[]} missing ชื่อหัวข้อที่ยังขาด
 * @return {string}
 */
function missingTopicsMessage_(missing) {
  return 'ยังไม่ได้แนบไฟล์หัวข้อที่บังคับ: ' + missing.join(', ');
}

/**
 * ตรวจคำขออัปโหลดก่อนแตะ Drive — ผิดตรงไหนต้องรู้ตั้งแต่ยังไม่เปลืองเวลา
 * @param {Object} request คำขอจากหน้าเว็บ
 * @return {Object} {extension, bytesLength}
 * @throws {Error} เมื่อคำขอใช้ไม่ได้
 */
function validateUploadRequest_(request) {
  if (!request || !request.woId) {
    throw new Error('ยังไม่ได้ระบุว่าไฟล์นี้เป็นของใบงานใด กรุณาบันทึกใบงานก่อนแนบไฟล์');
  }
  if (!request.content) {
    throw new Error('ไม่พบเนื้อไฟล์ที่ส่งมา กรุณาเลือกไฟล์ใหม่อีกครั้ง');
  }

  var extension = fileExtensionOf_(request.fileName);
  if (!extension) {
    throw new Error('ไฟล์ "' + String(request.fileName || '') + '" ไม่มีนามสกุล ' +
      'ระบบจึงบอกไม่ได้ว่าเป็นไฟล์ชนิดใด กรุณาตั้งชื่อไฟล์ให้มีนามสกุลก่อน');
  }
  if (!isAllowedExtension_(extension)) {
    throw new Error('ไฟล์นามสกุล .' + extension + ' แนบเข้าระบบไม่ได้ ' +
      'นามสกุลที่แนบได้คือ ' + ALLOWED_FILE_EXTENSIONS.join(', '));
  }

  // base64 ยาว 4 ตัวอักษรต่อข้อมูล 3 ไบต์ จึงประมาณขนาดจริงได้โดยไม่ต้องถอดรหัสก่อน
  var bytesLength = Math.floor(String(request.content).length * 3 / 4);
  if (bytesLength > MAX_UPLOAD_BYTES) {
    throw new Error('ไฟล์ "' + String(request.fileName || '') + '" ใหญ่เกิน ' + maxUploadLabel_() +
      ' ต่อไฟล์ กรุณาย่อขนาดหรือแยกเป็นหลายไฟล์');
  }

  return { extension: extension, bytesLength: bytesLength };
}

/**
 * รวมข้อมูลที่ต้องใช้ตั้งชื่อไฟล์ จากรหัสหัวข้อหรือรหัส Report ที่หน้าเว็บส่งมา
 *
 * ชื่อหัวข้อต้องมาจากตารางที่ตั้งไว้เสมอ ห้ามให้ผู้ใช้พิมพ์เอง (SPEC 14.2)
 * ไม่งั้นแต่ละคนจะสะกดไม่เหมือนกันแล้วค้นหาไม่เจอ
 *
 * @param {Object} request คำขอจากหน้าเว็บ
 * @return {Object} {topicName, formNo, stepNo}
 * @throws {Error} เมื่อหัวข้อที่ส่งมาไม่มีอยู่จริง
 */
function resolveFileTopic_(request) {
  var scope = request.scope;

  if (scope === FILE_SCOPE.WO) {
    var topic = getAttachmentTopic(request.topicId);
    if (!topic) {
      throw new Error('ไม่พบหัวข้อไฟล์แนบที่เลือก กรุณาเลือกจากรายการอีกครั้ง');
    }
    return { topicName: topic['Topic_Name'], formNo: '', stepNo: 0 };
  }

  if (scope === FILE_SCOPE.PAYMENT) {
    return { topicName: '', formNo: '', stepNo: 0 };
  }

  /*
   * รูปหน้างานของขั้นตอน — ไม่มีรหัสเอกสารและไม่มีเลขฟอร์ม
   * ชื่อไฟล์จึงใช้คำว่า "รูปภาพ" แทนตำแหน่งของเลขฟอร์ม ส่วนเลขขั้นตอนยังอยู่ครบ
   */
  if (String(request.topicId || '') === PHOTO_TOPIC.ID) {
    if (!isImageMimeType_(request.mimeType)) {
      throw new Error('ช่องรูปหน้างานรับได้เฉพาะไฟล์รูปภาพ — ' +
        'ไฟล์เอกสารให้แนบที่ช่องเอกสารโดยเลือกหัวข้อของมันก่อน');
    }
    return {
      topicName: PHOTO_TOPIC.NAME,
      formNo:    PHOTO_TOPIC.NAME,
      stepNo:    stepNoOf_(request.stepId),
      photo:     true
    };
  }

  var report = getReport(request.reportCode);
  if (!report) {
    throw new Error('ไม่พบเอกสารที่เลือก กรุณาเลือกจากรายการอีกครั้ง');
  }
  // ใช้ Form_No ในชื่อไฟล์ ไม่ใช่ชื่อเต็ม เพราะชื่อจริงบางรายการยาวเกิน 50 ตัวอักษร
  // และเลขฟอร์มตรงกับระบบเอกสารที่ใช้อยู่แล้ว ทำให้ตามหาต้นฉบับได้ทันที (SPEC 14.2)
  return {
    topicName: report['Report_Name'],
    formNo: report['Form_No'] || report['Report_Code'],
    stepNo: stepNoOf_(request.stepId)
  };
}

/**
 * เลขลำดับของ Step หรืองวดงานจากทะเบียน Task_Step
 * ห้าม hard-code จำนวนขั้นหรือจำนวนงวด ต้องอ่านจากที่สร้างไว้จริง (กฎข้อ 9)
 * @param {string} stepId เลขที่ Step
 * @return {number} 0 เมื่อไม่ได้ระบุมา
 */
function stepNoOf_(stepId) {
  if (!stepId) return 0;
  var step = getStep(stepId);
  if (!step) {
    throw new Error('ไม่พบขั้นตอนหรืองวดงานที่เลือก กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง');
  }
  return Number(step['Step_No'] || 0);
}

/* ===========================================================================
 * ส่วนที่ 2 — ตัวที่คุยกับ Drive จริง
 *
 * ทั้งหมดอยู่ใต้บรรทัดนี้ และไม่มีตรรกะธุรกิจอยู่ข้างใน
 * ถ้าวันหนึ่งย้ายไปที่เก็บอื่น ให้เขียนสี่ตัวนี้ใหม่ ส่วนอื่นไม่ต้องแตะ
 * =========================================================================== */

/**
 * รายชื่อฟังก์ชันในไฟล์นี้ที่เรียก Drive ได้ — เทสต์สแกนใช้รายการนี้เป็นตัวเทียบ
 *
 * เทสต์จะยืนยันสองทาง (1) ทุกฟังก์ชันที่เรียก Drive ต้องมีชื่ออยู่ในรายการนี้
 * (2) ทุกชื่อในรายการนี้ต้องมีอยู่จริง · ใครเพิ่มการเรียก Drive ที่ไฟล์อื่นจะแดงทันที
 *
 * @return {string[]}
 */
function driveLayerFunctions_() {
  return [
    'driveRootFolder_',
    'driveWoContainer_',
    'driveCreateRootFolder_',
    'driveFolderName_',
    'driveCreateFolder_',
    'driveFolderById_',
    'driveFolderParent_',
    'driveCreateFile_',
    'driveFileExistsAnywhere_',
    'driveFileIsTrashed_',
    'driveFileInfo_',
    'driveImageBytes_',
    'driveBytesOf_',
    'driveTrashById_',
    'probeDriveAccess_',
    // ชุดที่ใช้ออกใบสั่งงาน PDF (SPEC 16.1)
    'driveCopyFile_',
    'driveExportPdf_',
    'driveFileNamed_',
    'driveMoveFile_',
    'driveCountFiles_',
    'driveListFiles_',
    // ชุดที่ใช้สำรองและกู้คืนฐานข้อมูล (SPEC 22.6)
    'driveCreateTextFile_',
    'driveReadTextFile_',
    'driveSubFolder_',
    'driveListFolders_',
    'driveFolderFiles_',
    'driveBackupContainer_'
  ];
}

/**
 * รายชื่อฟังก์ชันที่เรียก Google Docs ได้ — กฎเดียวกับ Drive
 *
 * แยกรายการเพราะเป็นบริการคนละตัว แต่เหตุผลเดียวกัน: วันที่ย้ายไปออกเอกสารด้วยวิธีอื่น
 * ต้องแก้ที่ไฟล์นี้ไฟล์เดียว ไม่ใช่ไล่หาทั้งระบบ
 *
 * @return {string[]}
 */
function documentLayerFunctions_() {
  return ['docReplaceValues_', 'docTextOf_', 'probeDocumentAccess_'];
}

/**
 * ลองเปิดเอกสารด้วยสิทธิ์ที่มีอยู่จริงตอนนี้ — ใช้ตรวจว่าได้รับอนุญาตแล้วหรือยัง
 *
 * เปิดแม่แบบที่ตั้งค่าไว้ ไม่ได้สร้างไฟล์ใหม่ จึงไม่ทิ้งขยะไว้ใน Drive
 * และเป็นการเรียกตัวเดียวกับที่ใช้จริงตอนออกใบสั่งงาน ผลที่ได้จึงตรงกับของจริงเสมอ
 *
 * @param {string} docId รหัสเอกสารที่จะลองเปิด
 * @return {Object} {ok, message}
 */
function probeDocumentAccess_(docId) {
  try {
    DocumentApp.openById(docId).getName();
    return { ok: true, message: '' };
  } catch (e) {
    return { ok: false, message: (e && e.message) ? e.message : String(e) };
  }
}

/**
 * โฟลเดอร์ชั้นบนสุดของระบบ ตาม Script Property ที่ผู้ดูแลตั้งไว้
 * @return {Folder}
 * @throws {Error} เมื่อยังไม่ได้ตั้งค่า หรือเปิดโฟลเดอร์ไม่ได้
 */
function driveRootFolder_() {
  var id = getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false);
  if (!id) throw new Error(DRIVE_NOT_SET_UP_MESSAGE);

  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    // ห้ามให้รหัสโฟลเดอร์หรือข้อความดิบของ Google หลุดไปถึงผู้ใช้
    // แต่ต้องบอกผู้ดูแลได้ว่าต้องทำอะไรต่อ ไม่ใช่บอกแค่ว่าเปิดไม่ได้
    throw new Error(DRIVE_BROKEN_MESSAGE);
  }
}

/**
 * รายงานว่าที่เก็บไฟล์ของระบบพร้อมใช้งานหรือยัง — กดรันจากตัวแก้ไข Apps Script
 *
 * แบบเดียวกับ checkTextColumns() คือบอกสภาพปัจจุบันอย่างเดียว ไม่แก้อะไรให้
 * มีไว้เพราะอาการ "อัปโหลดไม่ได้" มองจากหน้าจอแล้วแยกไม่ออกว่าเป็นเพราะยังไม่ตั้งค่า
 * โฟลเดอร์ถูกลบ หรือสิทธิ์ไม่พอ ซึ่งสามอย่างนี้แก้คนละวิธีกันหมด
 *
 * @return {string} ข้อความสรุปสำหรับอ่านใน Execution log
 */
function checkDriveFolder() {
  // สองตัวนี้แตะ Drive โดยไม่ผ่านชั้นชีต ด่านที่ getSheet_() จึงครอบไม่ถึง ต้องกันเอง
  // ไม่งั้นใครก็ตามที่เปิดหน้าเว็บจะสร้างโฟลเดอร์ใน Drive ของเจ้าของระบบได้
  assertDataAccessAllowed_();

  var state = driveStorageState_();

  if (state.rootOk) {
    return adminSay_('ที่เก็บไฟล์พร้อมใช้งาน · โฟลเดอร์ราก "' + driveFolderName_(state.rootId) + '" ' +
      state.root.url + ' · โฟลเดอร์ใบงาน: ' +
      (state.container ? state.container.url : 'ยังไม่ได้สร้าง (ระบบจะสร้างให้ตอนแนบไฟล์ใบแรก)'));
  }

  /*
   * รากเปิดไม่ได้ แต่ของจริงยังอยู่ครบ — ห้ามแนะนำให้สร้างรากใหม่เด็ดขาด
   *
   * เกิดขึ้นจริงเมื่อ 28-09-2026 · รากที่จำไว้ถูกลบถาวร แต่ไฟล์ของทุกใบงานยังอยู่
   * เพราะทางที่ใช้จริงไม่เคยผ่านราก (SPEC 16) · ถ้าคนทำตามคำแนะนำ "สร้างใหม่"
   * ในสถานะนี้ รากใบใหม่จะว่างเปล่า แล้วไฟล์เก่าทั้งหมดกลายเป็นของกำพร้าถาวร
   */
  if (state.container) {
    if (!state.parent) {
      return adminSay_('รากของที่เก็บไฟล์เปิดไม่ได้ แต่โฟลเดอร์ใบงานยังอยู่ครบ — ' +
        'ห้ามรัน setupDriveFolder() เพราะจะสร้างรากใบใหม่ที่ไม่มีไฟล์เก่าอยู่ข้างใต้ · ' +
        'อ่านโฟลเดอร์แม่ของโฟลเดอร์ใบงานไม่ได้ จึงบอกรหัสที่ต้องใช้ไม่ได้ — ' +
        'เปิด ' + state.container.url + ' แล้วดูว่ามันอยู่ในโฟลเดอร์ใด ' +
        'จากนั้นตั้ง Script Property ชื่อ ' + PROP_KEY.DRIVE_ROOT_FOLDER + ' เป็นรหัสของโฟลเดอร์นั้น');
    }
    return adminSay_('รากของที่เก็บไฟล์เปิดไม่ได้ แต่โฟลเดอร์ใบงานยังอยู่ครบ — ' +
      'ห้ามรัน setupDriveFolder() เพราะจะสร้างรากใบใหม่ที่ไม่มีไฟล์เก่าอยู่ข้างใต้ · ' +
      'ให้ตั้ง Script Property ชื่อ ' + PROP_KEY.DRIVE_ROOT_FOLDER + ' เป็น ' + state.parent.id +
      ' ซึ่งคือโฟลเดอร์ "' + state.parent.name + '" ' + state.parent.url +
      ' อันเป็นโฟลเดอร์แม่ของโฟลเดอร์ใบงานที่ใช้อยู่จริง' +
      (state.parent.many ? ' · เตือน: โฟลเดอร์ใบงานนี้มีโฟลเดอร์แม่มากกว่าหนึ่งใบ ' +
        'ต้องเปิดดูก่อนว่าใบที่บอกมานี้ใช่ใบที่ต้องการหรือไม่' : ''));
  }

  if (state.claimedFolderId) {
    return adminSay_('รากของที่เก็บไฟล์เปิดไม่ได้ และโฟลเดอร์ของใบงานที่ฐานข้อมูลบันทึกไว้ก็เปิดไม่ได้เช่นกัน — ' +
      'ห้ามรัน setupDriveFolder() จนกว่าจะรู้ว่าโฟลเดอร์ถูกลบจริง หรือแค่ผู้ที่กดรันไม่มีสิทธิ์เข้าถึง · ' +
      'สองอย่างนี้แก้คนละทางและเดาผิดแล้วไฟล์หายถาวร · ' +
      'ให้เปิด https://drive.google.com/drive/folders/' + state.claimedFolderId +
      ' ด้วยบัญชีเจ้าของระบบเพื่อดูว่ายังอยู่หรือไม่ · ที่มาของข้อสรุปนี้: ' + state.trace);
  }

  if (!state.rootId) {
    return adminSay_('ยังไม่ได้ตั้งค่าที่เก็บไฟล์ — กดรัน setupDriveFolder() หนึ่งครั้งเพื่อให้ระบบสร้างให้');
  }

  return adminSay_('ตั้งค่าไว้แล้วแต่เปิดโฟลเดอร์ไม่ได้ (อาจถูกลบหรือย้ายไปถังขยะ) และไม่มีโฟลเดอร์ใบงานเหลืออยู่ — ' +
    'ลบค่า Script Property ชื่อ ' + PROP_KEY.DRIVE_ROOT_FOLDER + ' แล้วกดรัน setupDriveFolder() ใหม่' +
    ' · ที่มาของข้อสรุปนี้: ' + state.trace);
}

/**
 * พิมพ์ผลของเครื่องมือผู้ดูแลลง log แล้วคืนค่าเดิม
 *
 * **ฟังก์ชันที่คืนค่าอย่างเดียว เวลากดรันในตัวแก้ไข Apps Script จะดูเหมือนไม่มีอะไรเกิดขึ้น**
 * เพราะตัวแก้ไขไม่แสดงค่าที่คืนกลับมา · เจ้าของระบบเจออาการนี้จริงกับ checkDriveFolder()
 * แล้วเข้าใจว่าเครื่องมือพัง ทั้งที่มันตอบมาแล้ว · เครื่องมือที่เงียบสอนให้คนเลิกใช้มัน
 *
 * @param {string} text ข้อความผลการตรวจ
 * @return {string} ข้อความเดิม
 */
function adminSay_(text) {
  Logger.log(text);
  return text;
}

/**
 * สภาพจริงของที่เก็บไฟล์ อ่านครั้งเดียวแล้วตัดสินทีหลัง
 *
 * แยกออกมาเพราะทั้ง checkDriveFolder และ setupDriveFolder ต้องตัดสินจากสภาพชุดเดียวกัน ·
 * ถ้าต่างคนต่างอ่าน วันหนึ่งสองตัวจะเห็นโลกคนละใบแล้วแนะนำคนละทาง
 *
 * @return {Object} {rootId, root, rootOk, container, parent}
 */
function driveStorageState_() {
  var rootId = getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false);
  var root = rootId ? driveFolderById_(rootId) : null;
  var containerId = PropertiesService.getScriptProperties().getProperty(PROP_DRIVE_WO_FOLDER);
  var container = driveFolderById_(containerId);

  /*
   * ไม่มีรหัสโฟลเดอร์ใบงานใน Script Properties ไม่ได้แปลว่าไม่มีไฟล์
   *
   * วัดจากของจริงเมื่อ 28-09-2026: ค่านั้นไม่ถูกตั้งไว้เลย ทั้งที่ใบงานห้าใบมีไฟล์อยู่ครบ
   * เพราะทางที่ใช้จริงอ่าน Folder_ID ของใบงานจากฐานข้อมูล (SPEC 16) · ถ้าด่านกันการ
   * สร้างรากใหม่เชื่อเฉพาะ Script Properties มันจะไม่กันอะไรเลยในสถานะที่ต้องกันที่สุด
   *
   * โฟลเดอร์แม่ของโฟลเดอร์ใบงานหนึ่งใบ คือโฟลเดอร์ใบงานรวม และแม่ของมันคือราก
   */
  var trace = 'รหัสโฟลเดอร์ใบงานรวมมาจาก Script Properties';
  var claimed = '';

  if (!container) {
    var woFolderId = oneWorkOrderFolderId_();
    claimed = woFolderId;
    var known = driveFolderById_(woFolderId);
    var above = known ? driveFolderParent_(known.id) : null;
    if (above) container = { id: above.id, url: above.url };

    /*
     * บอกให้ได้ว่าสะดุดที่ขั้นไหน ไม่ใช่บอกแค่ว่าไม่เจอ (กฎข้อ 32)
     *
     * สามขั้นนี้ล้มด้วยสาเหตุคนละเรื่องและแก้คนละวิธี — ไม่มีใบงานที่มีโฟลเดอร์เลย
     * คนละเรื่องกับมีแต่เปิดไม่ได้ และคนละเรื่องกับเปิดได้แต่อ่านโฟลเดอร์แม่ไม่ได้
     */
    trace = !woFolderId ? 'ไม่พบใบงานที่มี Folder_ID ในฐานข้อมูล'
      : (!known ? 'พบ Folder_ID ของใบงาน (' + woFolderId + ') แต่เปิดโฟลเดอร์นั้นไม่ได้'
        : (!above ? 'เปิดโฟลเดอร์ของใบงานได้ แต่อ่านโฟลเดอร์แม่ของมันไม่ได้'
          : 'รหัสโฟลเดอร์ใบงานรวม มาจากโฟลเดอร์แม่ของใบงานที่มีอยู่จริง'));
  }

  return {
    rootId: rootId || '',
    root: root,
    rootOk: !!root,
    container: container,
    trace: trace,
    /*
     * ฐานข้อมูลบอกว่ามีโฟลเดอร์ของใบงานอยู่ แต่เปิดไม่ได้ — ต้องล้มแบบปิด
     *
     * "เปิดไม่ได้" มีสองสาเหตุที่แยกจากกันไม่ได้จากตรงนี้ คือถูกลบไปแล้ว กับสิทธิ์
     * ของผู้ที่กดรันเข้าไม่ถึง (เกิดขึ้นจริงตอนรันผ่าน clasp run) · สองอย่างนี้
     * ต่างกันคนละขั้ว แต่การเดาผิดข้างเดียวเท่านั้นที่ทำให้ไฟล์หายถาวร จึงห้ามสร้าง
     * รากใหม่ตราบใดที่ฐานข้อมูลยังบอกว่ามีโฟลเดอร์อยู่
     */
    claimedFolderId: container ? '' : claimed,
    parent: container ? driveFolderParent_(container.id) : null
  };
}

/**
 * รหัสโฟลเดอร์ของใบงานสักใบที่มีไฟล์อยู่จริง — ค่าว่างเมื่อไม่มีเลย
 *
 * ใช้เป็นหลักฐานว่า "ของเก่ายังอยู่" ซึ่งเป็นสิ่งเดียวที่แยกกรณีห้ามสร้างรากใหม่
 * ออกจากกรณีที่สร้างได้ · อ่านจากฐานข้อมูลเพราะที่นั่นคือที่ที่ระบบจำไว้จริง
 *
 * @return {string} รหัสโฟลเดอร์ หรือค่าว่าง
 */
function oneWorkOrderFolderId_() {
  try {
    var rows = queryRows_(SHEET.WORK_ORDER, {}, { limit: 20 });
    for (var i = 0; i < rows.length; i++) {
      var folderId = String(rows[i]['Folder_ID'] || '');
      if (folderId) return folderId;
    }
  } catch (e) {
    // อ่านฐานข้อมูลไม่ได้ ต้องไม่ทำให้เครื่องมือตรวจล้มทั้งตัว
  }
  return '';
}

/**
 * สร้างโฟลเดอร์รากของระบบแล้วจำรหัสไว้ — กดรันจากตัวแก้ไข Apps Script ครั้งเดียว
 *
 * ถ้าตั้งค่าไว้แล้วและยังเปิดได้ ต้องไม่สร้างซ้ำเด็ดขาด เพราะโฟลเดอร์ซ้ำแปลว่า
 * ไฟล์เก่าอยู่คนละที่กับไฟล์ใหม่ แล้วไม่มีใครรู้จนกว่าจะไปตามหาไฟล์
 *
 * @return {string} ข้อความสรุปสำหรับอ่านใน Execution log
 */
function setupDriveFolder() {
  // สองตัวนี้แตะ Drive โดยไม่ผ่านชั้นชีต ด่านที่ getSheet_() จึงครอบไม่ถึง ต้องกันเอง
  // ไม่งั้นใครก็ตามที่เปิดหน้าเว็บจะสร้างโฟลเดอร์ใน Drive ของเจ้าของระบบได้
  assertDataAccessAllowed_();

  var props = PropertiesService.getScriptProperties();
  var state = driveStorageState_();

  if (state.rootOk) {
    return 'มีที่เก็บไฟล์อยู่แล้ว ไม่ได้สร้างใหม่ · ' + checkDriveFolder();   // checkDriveFolder พิมพ์เองแล้ว
  }

  /*
   * รากเปิดไม่ได้ แต่โฟลเดอร์ใบงานยังเปิดได้ — ห้ามสร้างรากใบใหม่
   *
   * เหตุผลเดียวกับด่านข้างบนทุกประการ คือรากซ้ำแปลว่าไฟล์เก่าอยู่คนละที่กับไฟล์ใหม่ ·
   * ต่างกันแค่ว่ากรณีนี้รากเก่าหายไปแล้ว ซึ่ง **อันตรายกว่า** เพราะไม่มีอะไรขวางไว้เลย
   * ถ้าด่านนี้ไม่มี · ทางที่ถูกคือชี้รากไปที่โฟลเดอร์แม่ของ WO ที่ใช้อยู่จริง
   */
  if (state.container || state.claimedFolderId) {
    return 'ไม่ได้สร้างรากใหม่ เพราะฐานข้อมูลยังบอกว่ามีโฟลเดอร์ของใบงานอยู่ · ' +
      'การสร้างรากใบใหม่ตอนนี้จะทำให้ไฟล์ของใบงานเก่าทั้งหมดอยู่นอกสายตาระบบถาวร · ' +
      checkDriveFolder();
  }

  var created = driveCreateRootFolder_(DRIVE_ROOT_FOLDER_NAME);
  props.setProperty(PROP_KEY.DRIVE_ROOT_FOLDER, created.id);
  // โฟลเดอร์ใบงานเก่า (ถ้าเคยมี) อยู่ใต้รากเดิม จึงต้องลืมทิ้งไปพร้อมกัน
  props.deleteProperty(PROP_DRIVE_WO_FOLDER);

  return adminSay_('สร้างที่เก็บไฟล์ให้แล้ว: ' + created.url +
    ' · ระบบจะสร้างโฟลเดอร์ของแต่ละใบงานให้เองตอนมีคนแนบไฟล์');
}

/**
 * โฟลเดอร์ WO ที่เก็บโฟลเดอร์ของใบงานทุกใบ (SPEC 16)
 *
 * รหัสถูกจำไว้ใน Script Properties หลังสร้างครั้งแรก จึงไม่ต้องค้นหาตามชื่อซ้ำอีก
 * การค้นหาตามชื่อเกิดได้ครั้งเดียวในชีวิตของระบบ และเกิดในล็อก จึงไม่มีทางได้โฟลเดอร์ซ้ำ
 *
 * @return {Folder}
 */
function driveWoContainer_() {
  var props = PropertiesService.getScriptProperties();
  var known = props.getProperty(PROP_DRIVE_WO_FOLDER);
  if (known) {
    try {
      return DriveApp.getFolderById(known);
    } catch (e) {
      props.deleteProperty(PROP_DRIVE_WO_FOLDER);   // โฟลเดอร์ถูกลบหรือย้าย ให้สร้างใหม่
    }
  }

  var root = driveRootFolder_();
  var found = root.getFoldersByName(DRIVE_WO_CONTAINER_NAME);
  var folder = found.hasNext() ? found.next() : root.createFolder(DRIVE_WO_CONTAINER_NAME);
  props.setProperty(PROP_DRIVE_WO_FOLDER, folder.getId());
  return folder;
}

/**
 * สร้างโฟลเดอร์รากของระบบไว้ใน Drive ของเจ้าของ
 * @param {string} name ชื่อโฟลเดอร์
 * @return {Object} {id, url}
 */
function driveCreateRootFolder_(name) {
  var folder = DriveApp.createFolder(name);
  return { id: folder.getId(), url: folder.getUrl() };
}

/**
 * ชื่อโฟลเดอร์ตามรหัส — คืนค่าว่างเมื่อเปิดไม่ได้
 * @param {string} folderId รหัสโฟลเดอร์
 * @return {string}
 */
function driveFolderName_(folderId) {
  try {
    return DriveApp.getFolderById(folderId).getName();
  } catch (e) {
    return '';
  }
}

/**
 * สร้างโฟลเดอร์ย่อยใต้โฟลเดอร์ที่ระบุ
 * @param {string} parentId รหัสโฟลเดอร์แม่ · ค่าว่าง = โฟลเดอร์ WO
 * @param {string} name ชื่อโฟลเดอร์
 * @return {string} รหัสโฟลเดอร์ที่สร้าง
 */
function driveCreateFolder_(parentId, name) {
  var parent = parentId ? DriveApp.getFolderById(parentId) : driveWoContainer_();
  return parent.createFolder(name).getId();
}

/**
 * เปิดโฟลเดอร์ตามรหัส — คืน null เมื่อเปิดไม่ได้ (ถูกลบหรือย้ายไปแล้ว)
 * @param {string} folderId รหัสโฟลเดอร์
 * @return {Object|null} {id, url}
 */
function driveFolderById_(folderId) {
  if (!folderId) return null;
  try {
    var folder = DriveApp.getFolderById(folderId);
    return { id: folder.getId(), url: folder.getUrl() };
  } catch (e) {
    return null;
  }
}

/**
 * โฟลเดอร์แม่ของโฟลเดอร์หนึ่ง — คืน null เมื่ออ่านไม่ได้หรือไม่มีแม่
 *
 * มีไว้เพื่อกรณีเดียว: รากหายแต่โฟลเดอร์ใบงานยังอยู่ · ทางแก้ที่ถูกคือชี้รากไปที่
 * โฟลเดอร์แม่ของ WO และคนที่ต้องแก้ต้องได้รหัสนั้นไปวางเลย ไม่ใช่ต้องไปไล่หาใน Drive
 * ด้วยตาเอง ซึ่งเป็นขั้นที่หยิบผิดโฟลเดอร์ได้ง่ายที่สุด
 *
 * โฟลเดอร์หนึ่งใบมีแม่ได้หลายใบใน Drive · ถ้าเจอมากกว่าหนึ่งต้องบอก ไม่ใช่เดาให้
 * เพราะการเดาผิดคือการชี้รากไปผิดที่ แล้วไฟล์เก่าหายไปจากสายตาระบบทั้งหมด
 *
 * @param {string} folderId รหัสโฟลเดอร์ลูก
 * @return {Object|null} {id, name, url, many}
 */
function driveFolderParent_(folderId) {
  if (!folderId) return null;
  try {
    var parents = DriveApp.getFolderById(folderId).getParents();
    if (!parents.hasNext()) return null;
    var first = parents.next();
    return { id: first.getId(), name: first.getName(), url: first.getUrl(),
      many: parents.hasNext() };
  } catch (e) {
    return null;
  }
}

/**
 * เขียนไฟล์ลงโฟลเดอร์
 * @param {string} folderId รหัสโฟลเดอร์ปลายทาง
 * @param {string} base64 เนื้อไฟล์
 * @param {string} mimeType ชนิดไฟล์
 * @param {string} name ชื่อไฟล์ที่ระบบตั้งให้
 * @return {Object} {id, url, size, mimeType}
 */
function driveCreateFile_(folderId, base64, mimeType, name) {
  var blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType || 'application/octet-stream', name);
  var file = DriveApp.getFolderById(folderId).createFile(blob);
  return {
    id: file.getId(),
    url: file.getUrl(),
    size: file.getSize(),
    mimeType: file.getMimeType()
  };
}

/**
 * ไฟล์นี้ยังอยู่บน Drive หรือไม่ นับรวมไฟล์ที่อยู่ในถังขยะด้วย
 *
 * มีไว้ให้ชุดทดสอบพิสูจน์ว่าการลบของระบบเป็นการย้ายลงถังขยะ ไม่ใช่ลบถาวร
 * ต้องอยู่ในไฟล์นี้ เพราะ 99_Test.gs ห้ามเรียก Drive เอง
 *
 * @param {string} fileId รหัสไฟล์บน Drive
 * @return {boolean}
 */
function driveFileExistsAnywhere_(fileId) {
  if (!fileId) return false;
  try {
    // getFileById คืนไฟล์ที่อยู่ในถังขยะด้วย ต่างจากไฟล์ที่ถูกลบถาวรซึ่งจะโยน error
    return !!DriveApp.getFileById(fileId).getName();
  } catch (e) {
    return false;
  }
}

/**
 * ไฟล์นี้อยู่ในถังขยะหรือยัง
 *
 * คู่กับ driveFileExistsAnywhere_() — สองตัวรวมกันทำให้แยกออกได้ว่า
 * "ลบแล้วแต่กู้คืนได้" ต่างจาก "ไม่ได้ลบเลย" และต่างจาก "ลบถาวรไปแล้ว"
 * ถ้ามีแต่ตัวแรก เทสต์จะแยกสองกรณีแรกไม่ออก
 *
 * @param {string} fileId รหัสไฟล์บน Drive
 * @return {boolean}
 */
function driveFileIsTrashed_(fileId) {
  if (!fileId) return false;
  try {
    return DriveApp.getFileById(fileId).isTrashed() === true;
  } catch (e) {
    return false;
  }
}

/**
 * สภาพจริงของไฟล์หนึ่งไฟล์บน Drive — ชื่อ ขนาด ชนิด และอยู่ในถังขยะหรือยัง
 *
 * ต่างจาก driveFileExistsAnywhere_ ที่ตอบได้แค่ว่ามีหรือไม่มี · เครื่องมือตรวจ
 * ต้องพิมพ์ **ของจริงที่ได้กลับมา** ไม่ใช่คำว่า "สำเร็จ" (SPEC 22.5) จึงต้องมีขนาด
 * ไฟล์จริงให้พิมพ์ · ขนาดเป็นค่าที่เถียงไม่ได้ว่าไฟล์ออกมาจริงหรือออกมาเป็นก้อนว่าง
 *
 * @param {string} fileId รหัสไฟล์บน Drive
 * @return {Object|null} {id, name, url, size, mimeType, trashed} หรือ null เมื่อเปิดไม่ได้
 */
function driveFileInfo_(fileId) {
  if (!fileId) return null;
  try {
    var file = DriveApp.getFileById(fileId);
    return {
      id:       file.getId(),
      name:     file.getName(),
      url:      file.getUrl(),
      size:     file.getSize(),
      mimeType: file.getMimeType(),
      trashed:  file.isTrashed() === true
    };
  } catch (e) {
    return null;
  }
}

/**
 * ไบต์ของรูปภาพหนึ่งไฟล์ สำหรับส่งให้หน้าเว็บแสดงเอง (SPEC 17.2)
 *
 * **ทำไมต้องส่งไบต์ ทั้งที่มีลิงก์ Drive อยู่แล้ว**
 *
 * ไฟล์ทุกไฟล์อยู่ใน Drive ของบัญชีเจ้าของระบบบัญชีเดียว (SPEC 16) และเว็บแอปนี้
 * ทำงานด้วยสิทธิ์ของเจ้าของ แต่เบราว์เซอร์ของผู้ใช้ไม่ได้เป็นเจ้าของบัญชีนั้น ·
 * ลิงก์ Drive จึงเปิดได้เฉพาะคนที่ล็อกอินบัญชีเจ้าของอยู่ · ภาพย่อที่ฝังมากับหน้า
 * เป็นทางเดียวที่ผู้อนุมัติทุกคนเห็นรูปได้จริง โดยไม่ต้องเปิดสิทธิ์ไฟล์ให้คนนอก
 *
 * ขนาดย่อมาจาก getThumbnail() ของ Drive เอง (ราวสองร้อยพิกเซล ไม่กี่กิโลไบต์)
 * ส่วนขนาดเต็มคือไฟล์จริง ซึ่งถูกย่อให้ด้านยาวไม่เกิน 1600 px ตั้งแต่ตอนอัปโหลดแล้ว
 *
 * รับเฉพาะไฟล์ที่เป็นรูปจริง ๆ — เอกสารและไฟล์บีบอัดต้องไม่ถูกส่งเป็นก้อนผ่าน
 * ช่องทางนี้ เพราะก้อนละหลายเมกะไบต์และไม่มีอะไรให้ดูอยู่ดี
 *
 * @param {string} fileId รหัสไฟล์บน Drive
 * @param {boolean} wantThumb true = ขอภาพย่อ · false = ขอไฟล์เต็ม
 * @return {Object|null} {mimeType, base64, size} หรือ null เมื่อไม่ใช่รูปหรือเปิดไม่ได้
 */
function driveImageBytes_(fileId, wantThumb) {
  if (!fileId) return null;
  try {
    var file = DriveApp.getFileById(fileId);
    if (!isImageMimeType_(file.getMimeType())) return null;

    // ภาพย่อของ Drive ไม่มีให้ทุกไฟล์เสมอไป (ไฟล์ที่เพิ่งขึ้นยังไม่ทันสร้าง) ถอยไปใช้ไฟล์เต็ม
    var blob = wantThumb ? file.getThumbnail() : null;
    if (!blob) blob = file.getBlob();

    var bytes = blob.getBytes();
    return {
      mimeType: blob.getContentType() || file.getMimeType(),
      base64: Utilities.base64Encode(bytes),
      size: bytes.length
    };
  } catch (e) {
    return null;
  }
}

/**
 * ไบต์ของไฟล์ใด ๆ บน Drive — ไม่จำกัดเฉพาะรูป (กฎข้อ 34)
 *
 * ต่างจาก driveImageBytes_ ที่รับเฉพาะรูปและย่อให้ · ตัวนี้คืนไฟล์ตามต้นฉบับ
 * สำหรับเอกสารที่ต้องเปิดดูทั้งใบ เช่นใบสั่งงาน PDF
 *
 * **ไม่มีการตรวจสิทธิ์ที่นี่โดยตั้งใจ** ชั้นนี้รู้จักแต่ Drive · การตัดสินว่าใครขอ
 * ไฟล์ไหนได้เป็นหน้าที่ของชั้น 09_Api ตามกฎข้อ 7 · ผู้เรียกทุกคนต้องตรวจมาก่อน
 *
 * @param {string} fileId รหัสไฟล์บน Drive
 * @return {Object|null} {mimeType, base64, size} หรือ null เมื่อเปิดไม่ได้
 */
function driveBytesOf_(fileId) {
  if (!fileId) return null;
  try {
    var blob = DriveApp.getFileById(fileId).getBlob();
    var bytes = blob.getBytes();
    return {
      mimeType: blob.getContentType() || 'application/octet-stream',
      base64: Utilities.base64Encode(bytes),
      size: bytes.length
    };
  } catch (e) {
    return null;
  }
}

/**
 * รหัสบน Drive ของใบสั่งงานฉบับเก่าลำดับที่ระบุ (SPEC 16.1)
 *
 * ลำดับมาจาก reportArchiveList_ ซึ่งเรียงจากใหม่ไปเก่าและเป็นลำดับที่ฝั่งเซิร์ฟเวอร์
 * เป็นคนกำหนดทั้งหมด · อ่านจากโฟลเดอร์ที่จำไว้ในแถวใบงาน ไม่ได้ค้นตามชื่อ (SPEC 21)
 *
 * @param {Object} wo แถวใบงาน
 * @param {number} at ลำดับในรายการฉบับเก่า
 * @return {string} รหัสไฟล์บน Drive · ข้อความว่างเมื่อไม่มีลำดับนั้น
 */
function woArchiveFileId_(wo, at) {
  var map = parseFolderMap_((wo || {})['Folder_Map']);
  var files = driveListFiles_(map[REPORT_ARCHIVE_FOLDER] || '');
  var want = Number(at);
  if (!(want >= 0) || want >= files.length) return '';
  return String(files[want].id || '');
}

/**
 * รหัสบน Drive ของใบสั่งงานฉบับล่าสุดของใบงานนี้ (SPEC 16.1)
 *
 * หาจากรหัสโฟลเดอร์ที่จำไว้ในแถวใบงาน บวกชื่อไฟล์ที่ตายตัว · ไม่ได้แกะจาก
 * Report_URL เพราะรูปแบบของลิงก์เป็นของ Google ที่เปลี่ยนได้ และไม่ได้ค้นหา
 * ตามชื่อทั้ง Drive ซึ่งช้าและเจอโฟลเดอร์ซ้ำได้ (SPEC 21)
 *
 * @param {Object} wo แถวใบงาน
 * @return {string} รหัสไฟล์บน Drive · ข้อความว่างเมื่อยังไม่มีเอกสาร
 */
function woReportFileId_(wo) {
  var folderId = String((wo || {})['Folder_ID'] || '');
  if (!folderId) return '';
  var found = driveFileNamed_(folderId, REPORT_FILE_NAME);
  return found ? found.id : '';
}

/**
 * ลองใช้สิทธิ์ Drive ด้วยการเปิดโฟลเดอร์รากของระบบ — คู่ขนานกับ probeDocumentAccess_
 *
 * เปิดของที่ระบบใช้จริง ไม่ใช่ของทั่วไป ผลที่ได้จึงตรงกับสิ่งที่จะเกิดตอนอัปโหลดจริง
 * และไม่สร้างอะไรทิ้งไว้เลย
 *
 * แยก "ยังไม่ได้ตั้งค่า" ออกจาก "ตั้งแล้วแต่เปิดไม่ได้" เพราะสองอย่างนี้แก้คนละเรื่อง
 * อย่างแรกคือกด setupDriveFolder() อย่างหลังคือสิทธิ์หรือโฟลเดอร์ถูกลบ
 *
 * @return {Object} {ok, missing, message}
 */
function probeDriveAccess_() {
  var id = getProp_(PROP_KEY.DRIVE_ROOT_FOLDER, false);
  if (!id) return { ok: false, missing: true, message: DRIVE_NOT_SET_UP_MESSAGE };

  try {
    DriveApp.getFolderById(id).getName();
    return { ok: true, missing: false, message: '' };
  } catch (e) {
    return { ok: false, missing: false, message: (e && e.message) ? e.message : String(e) };
  }
}

/**
 * ย้ายไฟล์หรือโฟลเดอร์ลงถังขยะ — ไม่ลบถาวร ผู้ใช้จึงกู้คืนได้ถ้าลบผิด
 * @param {string} id รหัสไฟล์หรือโฟลเดอร์
 * @param {boolean} isFolder true = โฟลเดอร์
 * @return {boolean} true = ทำสำเร็จ
 */
function driveTrashById_(id, isFolder) {
  if (!id) return false;
  try {
    var item = isFolder ? DriveApp.getFolderById(id) : DriveApp.getFileById(id);
    item.setTrashed(true);
    return true;
  } catch (e) {
    return false;   // ของที่ไม่มีอยู่แล้ว ถือว่าลบสำเร็จ ไม่ต้องทำให้รายการล้มตาม
  }
}

/* ---------------------------------------------------------------------------
 * ชุดที่ใช้ออกใบสั่งงาน PDF (SPEC 16.1)
 *
 * วิธีที่ใช้คือคัดลอกแม่แบบ Google Docs แล้วแทนค่า ไม่ได้แปลง HTML เป็น PDF ตรง ๆ
 * เพราะการแปลง HTML ใน Apps Script ไม่ฝังฟอนต์ไทยไปด้วย ผลที่ได้คือสระลอย
 * วรรณยุกต์หลุด หรือกลายเป็นกล่องว่างทั้งแผ่น ซึ่งมองจากโค้ดไม่เห็นเลย
 * --------------------------------------------------------------------------- */

/**
 * คัดลอกไฟล์ไปไว้ในโฟลเดอร์ที่ระบุ
 * @param {string} fileId รหัสไฟล์ต้นฉบับ
 * @param {string} name ชื่อของสำเนา
 * @param {string} folderId โฟลเดอร์ปลายทาง
 * @return {string} รหัสไฟล์สำเนา
 */
function driveCopyFile_(fileId, name, folderId) {
  var folder = DriveApp.getFolderById(folderId);
  return DriveApp.getFileById(fileId).makeCopy(name, folder).getId();
}

/**
 * แทนค่าตัวแปรทุกตัวลงในเอกสาร Google Docs แล้วบันทึก
 *
 * แทนค่าทั้งเนื้อเอกสาร หัวกระดาษ และท้ายกระดาษ เพราะเลขที่ใบงานกับสถานะ
 * มักถูกวางไว้บนหัวกระดาษให้ติดไปทุกแผ่น ถ้าแทนแต่เนื้อ หน้า 2 เป็นต้นไปจะยังเป็น {{...}}
 *
 * ชื่อตัวแปรถูกครอบด้วยวงเล็บปีกกาคู่ ซึ่งเป็นอักขระพิเศษของตัวจับรูปแบบ
 * จึงต้องใส่เครื่องหมายกำกับให้ครบ ไม่งั้นจะไม่มีอะไรถูกแทนเลยและไม่มี error ด้วย
 *
 * @param {string} docId รหัสเอกสาร
 * @param {Object} values แผนที่ชื่อตัวแปร -> ข้อความที่จะใส่แทน
 * @return {number} จำนวนตัวแปรที่แทนค่า
 */
function docReplaceValues_(docId, values) {
  var doc = DocumentApp.openById(docId);
  var parts = [doc.getBody(), doc.getHeader(), doc.getFooter()];
  var count = 0;

  for (var key in values) {
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    var pattern = '\\{\\{' + key + '\\}\\}';
    var text = String(values[key] === null || values[key] === undefined ? '' : values[key]);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i]) parts[i].replaceText(pattern, text);
    }
    count++;
  }

  doc.saveAndClose();
  return count;
}

/**
 * ข้อความทั้งหมดในเอกสาร รวมหัวกระดาษและท้ายกระดาษ
 *
 * มีไว้ให้ชุดทดสอบเปิดดูว่ายังเหลือช่องที่ไม่ถูกแทนค่าหรือไม่ ซึ่งเป็นข้อที่
 * มองจากโค้ดไม่เห็น — แม่แบบเป็นเอกสารที่ผู้ใช้แก้เองได้ ใครเติมช่องใหม่ลงไป
 * แล้วไม่บอกใคร ผู้รับเอกสารจะเห็น {{...}} ติดมาบนกระดาษจริง
 *
 * @param {string} docId รหัสเอกสาร
 * @return {string}
 */
function docTextOf_(docId) {
  var doc = DocumentApp.openById(docId);
  var parts = [doc.getBody(), doc.getHeader(), doc.getFooter()];
  var text = [];
  for (var i = 0; i < parts.length; i++) {
    if (parts[i]) text.push(parts[i].getText());
  }
  return text.join(String.fromCharCode(10));
}

/**
 * ส่งออกไฟล์เป็น PDF แล้วเขียนลงโฟลเดอร์
 * @param {string} fileId รหัสไฟล์ต้นทาง (เอกสารที่แทนค่าแล้ว)
 * @param {string} folderId โฟลเดอร์ปลายทาง
 * @param {string} name ชื่อไฟล์ PDF
 * @return {Object} {id, url}
 */
function driveExportPdf_(fileId, folderId, name) {
  var blob = DriveApp.getFileById(fileId).getAs('application/pdf').setName(name);
  var file = DriveApp.getFolderById(folderId).createFile(blob);
  return { id: file.getId(), url: file.getUrl() };
}

/**
 * หาไฟล์ชื่อนี้ในโฟลเดอร์ — คืนตัวแรกที่เจอ หรือ null
 * @param {string} folderId รหัสโฟลเดอร์
 * @param {string} name ชื่อไฟล์
 * @return {Object|null} {id, url}
 */
function driveFileNamed_(folderId, name) {
  if (!folderId) return null;
  try {
    var found = DriveApp.getFolderById(folderId).getFilesByName(name);
    if (!found.hasNext()) return null;
    var file = found.next();
    return { id: file.getId(), url: file.getUrl() };
  } catch (e) {
    return null;
  }
}

/**
 * ย้ายไฟล์ไปโฟลเดอร์อื่น พร้อมเปลี่ยนชื่อ
 *
 * ย้าย ไม่ใช่คัดลอกแล้วลบ เพราะรหัสไฟล์ต้องคงเดิม ลิงก์ที่เคยส่งให้ใครไว้จะได้ไม่ตาย
 *
 * @param {string} fileId รหัสไฟล์
 * @param {string} folderId โฟลเดอร์ปลายทาง
 * @param {string} newName ชื่อใหม่
 * @return {boolean} true = ย้ายสำเร็จ
 */
function driveMoveFile_(fileId, folderId, newName) {
  try {
    var file = DriveApp.getFileById(fileId);
    file.setName(newName);
    file.moveTo(DriveApp.getFolderById(folderId));
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * รายชื่อไฟล์ในโฟลเดอร์ พร้อมลิงก์เปิด
 *
 * คืนเฉพาะค่าธรรมดา ไม่มีวัตถุของ Drive ติดออกไป เพื่อให้ชั้นบนส่งต่อให้หน้าเว็บได้เลย
 * เรียงจากใหม่ไปเก่า เพราะฉบับล่าสุดคือฉบับที่คนมองหาบ่อยที่สุด
 *
 * @param {string} folderId รหัสโฟลเดอร์ · ค่าว่าง = ไม่มีอะไรเลย
 * @return {Object[]} [{name, url, date}]
 */
function driveListFiles_(folderId) {
  if (!folderId) return [];
  try {
    var files = DriveApp.getFolderById(folderId).getFiles();
    var out = [];
    while (files.hasNext()) {
      var file = files.next();
      // ต้องมีรหัสติดมาด้วย เพราะฉบับเก่าไม่มีแถวใน File_Index ให้หารหัสจากที่อื่น
      out.push({ id: file.getId(), name: file.getName(), url: file.getUrl(),
        date: file.getDateCreated() });
    }
    out.sort(function (a, b) { return b.date - a.date; });
    return out;
  } catch (e) {
    return [];   // โฟลเดอร์ถูกลบหรือย้าย — หน้าจอแสดงว่าไม่มีฉบับเก่า ดีกว่าทำให้ทั้งหน้าล้ม
  }
}

/**
 * จำนวนไฟล์ในโฟลเดอร์ — ใช้นับว่าเคยออกเอกสารมาแล้วกี่ฉบับ
 * @param {string} folderId รหัสโฟลเดอร์ · ค่าว่าง = ยังไม่มีโฟลเดอร์ = 0
 * @return {number}
 */
function driveCountFiles_(folderId) {
  if (!folderId) return 0;
  try {
    var files = DriveApp.getFolderById(folderId).getFiles();
    var count = 0;
    while (files.hasNext()) { files.next(); count++; }
    return count;
  } catch (e) {
    return 0;
  }
}

/* ===========================================================================
 * ส่วนที่ 3 — งานของชั้นนี้ที่ชั้นบนเรียกใช้
 * =========================================================================== */

/**
 * โฟลเดอร์ปลายทางของไฟล์ พร้อมสร้างให้ถ้ายังไม่มี (SPEC 16, 21)
 *
 * ห้ามใช้วิธี "หาโฟลเดอร์ตามชื่อ ถ้าไม่มีก็สร้าง" กับโฟลเดอร์ของใบงาน
 * เพราะ Drive ยอมให้มีโฟลเดอร์ชื่อซ้ำกันในที่เดียวกันได้ ถ้า 2 คนอัปโหลดใบเดียวกัน
 * พร้อมกันจะได้โฟลเดอร์ซ้ำ 2 อัน แล้วไฟล์กระจัดกระจายโดยไม่มีใครรู้
 *
 * ระบบจึงเก็บรหัสโฟลเดอร์ไว้ในแถวของใบงานเอง แล้วอ่านจากตรงนั้นเสมอ
 *   Folder_ID   โฟลเดอร์หลักของใบงาน
 *   Folder_Map  รหัสของโฟลเดอร์ย่อยแต่ละชั้น เก็บเป็น JSON ในเซลล์เดียว
 *
 * ล็อกครอบเฉพาะช่วงสร้างโฟลเดอร์กับเขียนรหัสลงชีตเท่านั้น ไม่ครอบตอนอัปโหลดไฟล์
 * เพราะการอัปโหลดใช้เวลานาน ถ้าล็อกคร่อมไว้ 20 คนจะต่อคิวกันจนใช้งานไม่ได้ (SPEC 21)
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} folderPath เส้นทางโฟลเดอร์ย่อย เช่น 'Attachments' หรือ 'Service/Step 2'
 * @return {string} รหัสโฟลเดอร์ปลายทาง
 */
function ensureWoFolder_(woId, folderPath) {
  var lock = acquireLock_();
  try {
    // อ่านซ้ำในล็อก เผื่อมีคนอื่นเพิ่งสร้างโฟลเดอร์เดียวกันไปก่อนหน้าเสี้ยววินาที
    clearRowCache_(SHEET.WORK_ORDER);
    var wo = getWorkOrder(woId);
    if (!wo) throw new Error('ไม่พบใบงาน ' + woId);

    var patch = {};
    var rootId = String(wo['Folder_ID'] || '');
    if (!rootId || !driveFolderById_(rootId)) {
      rootId = driveCreateFolder_('', woId);
      patch['Folder_ID'] = rootId;
      var root = driveFolderById_(rootId);
      patch['Folder_URL'] = root ? root.url : '';
    }

    var map = parseFolderMap_(wo['Folder_Map']);
    var targetId = resolveFolderPath_(rootId, map, folderPath);
    var mapText = JSON.stringify(map);
    if (mapText !== String(wo['Folder_Map'] || '')) patch['Folder_Map'] = mapText;

    if (hasOwnKeys_(patch)) updateWorkOrder(woId, patch);
    return targetId;
  } finally {
    lock.releaseLock();
  }
}

/**
 * ไล่สร้างโฟลเดอร์ตามเส้นทางที่ขอ โดยจำรหัสของแต่ละชั้นไว้ในแผนที่ (แก้ไขในตัว)
 * @param {string} rootId รหัสโฟลเดอร์หลักของใบงาน
 * @param {Object} map แผนที่เส้นทาง -> รหัสโฟลเดอร์
 * @param {string} folderPath เส้นทางที่ต้องการ
 * @return {string} รหัสโฟลเดอร์ปลายทาง
 */
function resolveFolderPath_(rootId, map, folderPath) {
  var parts = String(folderPath || '').split('/');
  var parentId = rootId;
  var walked = '';

  for (var i = 0; i < parts.length; i++) {
    var name = parts[i].trim();
    if (!name) continue;
    walked = walked ? (walked + '/' + name) : name;

    var known = map[walked];
    if (known && driveFolderById_(known)) {
      parentId = known;
      continue;
    }
    parentId = driveCreateFolder_(parentId, name);
    map[walked] = parentId;
  }
  return parentId;
}

/**
 * อ่านแผนที่โฟลเดอร์จากเซลล์ — ค่าที่อ่านไม่ออกถือว่ายังไม่มี ดีกว่าโยน error ใส่ผู้ใช้
 * @param {*} value ค่าในคอลัมน์ Folder_Map
 * @return {Object}
 */
function parseFolderMap_(value) {
  var text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) return {};
  try {
    var parsed = JSON.parse(text);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    return {};
  }
}

/**
 * object นี้มี key อะไรอยู่บ้างหรือไม่
 * @param {Object} obj object ที่ต้องการตรวจ
 * @return {boolean}
 */
function hasOwnKeys_(obj) {
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) return true;
  }
  return false;
}

/**
 * อัปโหลดไฟล์ 1 ไฟล์ — ทางเดียวที่ไฟล์เข้าระบบได้ (SPEC 14, 16)
 *
 * ทีละไฟล์เสมอ ไม่รับเป็นชุด เพราะเพดานเวลา 6 นาทีและเพดานขนาดพารามิเตอร์
 * ทำให้การยิงพร้อมกันทั้งชุดล้มทั้งชุด แล้วผู้ใช้ต้องเริ่มใหม่หมด (SPEC 21)
 * หน้าเว็บเป็นคนไล่ส่งทีละไฟล์ และรู้ว่าไฟล์ไหนพลาดเพื่อให้ลองใหม่เฉพาะไฟล์นั้น
 *
 * @param {Object} request {woId, scope, topicId, reportCode, taskId, stepId,
 *                          fileName, mimeType, content}
 * @param {Object} user ผู้ทำรายการ
 * @return {Object} แถวในทะเบียนไฟล์ที่เพิ่งบันทึก
 */
function uploadFile(request, user) {
  var checked = validateUploadRequest_(request);
  var topic = resolveFileTopic_(request);

  var plan = fileNamePlan_({
    woId: request.woId,
    scope: request.scope,
    topicName: topic.topicName,
    formNo: topic.formNo,
    stepNo: topic.stepNo,
    photo: topic.photo === true,
    mimeType: request.mimeType,
    fileName: request.fileName
  });

  var seq = nextFileSeq_(request.woId, plan);
  var savedName = buildSavedFileName_(plan, seq);

  // สร้างโฟลเดอร์ (ในล็อก) ให้เสร็จก่อน แล้วค่อยอัปโหลด (นอกล็อก)
  var folderId = ensureWoFolder_(request.woId, plan.folderPath);
  var stored = driveCreateFile_(folderId, request.content, request.mimeType, savedName);

  var row = insertFile({
    'File_ID':            newFileId_(request.woId),
    'WO_ID':              request.woId,
    'Task_ID':            request.taskId || '',
    'Step_ID':            request.stepId || '',
    'Topic_ID':           request.topicId || '',
    'Report_Code':        request.reportCode || '',
    'Saved_File_Name':    savedName,
    'Original_File_Name': String(request.fileName || ''),
    'Seq':                seq,
    'Drive_File_ID':      stored.id,
    'File_URL':           stored.url,
    'Mime_Type':          stored.mimeType || request.mimeType || '',
    'Size':               stored.size || checked.bytesLength,
    'Version':            1,
    'Is_Active':          true,
    'Uploaded_By':        actingEmail_(user),
    'Uploaded_Date':      new Date()
  });

  // ระบุเหตุการณ์ด้วย Entity + Action เสมอ ห้ามให้ใครนับแถวรวมของใบงาน (SPEC 21)
  writeAudit(ENTITY.FILE, row['File_ID'], ACTION.UPLOAD, 'Saved_File_Name', '', savedName,
    'แนบไฟล์ ' + String(request.fileName || ''), { woId: request.woId, taskId: request.taskId || '' });

  return row;
}

/**
 * เลขที่ไฟล์ในทะเบียน — ขึ้นต้นด้วยเลขใบงาน ข้อมูลทดสอบจึงมี TEST- ติดไปเองโดยอัตโนมัติ
 * @param {string} woId เลขที่ใบงาน
 * @return {string}
 */
function newFileId_(woId) {
  return String(woId) + '-F' + newUuid_().substring(0, 8).toUpperCase();
}

/**
 * ลบไฟล์ที่แนบผิด — ปิดใช้งานในทะเบียนและย้ายไฟล์ลงถังขยะ (SPEC D-8)
 * ไม่ลบแถวจริงและไม่ลบไฟล์ถาวร เพื่อให้ย้อนกลับได้เมื่อลบผิด
 * ผู้ทำรายการถูกบันทึกให้เองโดยชั้น Audit จึงไม่ต้องส่งเข้ามา
 *
 * @param {string} fileId เลขที่ไฟล์ในทะเบียน
 * @return {Object} แถวที่ถูกปิดใช้งาน
 */
function removeFile(fileId) {
  var file = getFile(fileId);
  if (!file) throw new Error('ไม่พบไฟล์ที่ต้องการลบ อาจถูกลบไปแล้ว');

  driveTrashById_(file['Drive_File_ID'], false);
  var row = deactivateFile(fileId);

  writeAudit(ENTITY.FILE, fileId, ACTION.DELETE_FILE, 'Is_Active', true, false,
    'ลบไฟล์ ' + String(file['Saved_File_Name'] || ''),
    { woId: file['WO_ID'], taskId: file['Task_ID'] || '' });
  return row;
}

/**
 * ย้ายโฟลเดอร์ของใบงานลงถังขยะ — ใช้ตอนล้างข้อมูลทดสอบเท่านั้น
 *
 * ต้องอยู่ในไฟล์นี้ เพราะเป็นการเรียก Drive และ 99_Test.gs ห้ามเรียก Drive เอง
 *
 * @param {string} folderId รหัสโฟลเดอร์
 * @return {boolean} true = ทำสำเร็จ
 */
function trashFolder_(folderId) {
  return driveTrashById_(folderId, true);
}

/**
 * รายการไฟล์ของใบงานในรูปแบบที่หน้าจอใช้ได้ทันที
 * ไม่มีวัตถุของ Drive ติดออกไป มีแต่ค่าธรรมดา (SPEC 17.3)
 * @param {string} woId เลขที่ใบงาน
 * @return {Object[]}
 */
function listWoFileViews(woId) {
  var files = listFilesByWo(woId);
  var views = [];
  for (var i = 0; i < files.length; i++) {
    views.push(fileViewOf_(files[i]));
  }
  return views;
}

/**
 * แปลงแถวทะเบียนไฟล์เป็นสิ่งที่หน้าจอแสดงได้
 * @param {Object} file แถวจาก File_Index
 * @return {Object}
 */
function fileViewOf_(file) {
  return {
    fileId:      file['File_ID'],
    woId:        file['WO_ID'],
    taskId:      file['Task_ID'] || '',
    stepId:      file['Step_ID'] || '',
    topicId:     file['Topic_ID'] || '',
    reportCode:  file['Report_Code'] || '',
    savedName:   file['Saved_File_Name'],
    originalName: file['Original_File_Name'] || '',
    url:         file['File_URL'] || '',
    size:        Number(file['Size'] || 0),
    // หน้าจอต้องรู้ว่าไฟล์ไหนเป็นรูป เพื่อขอภาพย่อมาแสดงแทนการขึ้นแค่ชื่อไฟล์
    mimeType:    file['Mime_Type'] || '',
    isImage:     isImageMimeType_(file['Mime_Type']),
    uploadedBy:  displayNameOf_(file['Uploaded_By']),
    display: {
      uploadedDate: formatForDisplay_(file['Uploaded_Date'])
    }
  };
}

/**
 * ไฟล์แนบของใบงาน จัดกลุ่มตามหัวข้อ — สำหรับหน้าอนุมัติ (SPEC 17.2)
 *
 * เฉพาะไฟล์ที่แนบมาตอนเปิดใบงานเท่านั้น · รูปหน้างานของแผนก เอกสารที่แผนก
 * แนบตอนทำงาน และหลักฐานการชำระเงิน ล้วนเกิดขึ้น **หลัง** การอนุมัติ จึงไม่ใช่
 * สิ่งที่ผู้อนุมัติกำลังตัดสินใจอยู่บนนั้น · การคัดออกทำโดยเทียบกับตาราง
 * Attachment_Topic ไม่ใช่ด้วยการไล่ชื่อหัวข้อที่ไม่ต้องการทีละอัน
 *
 * เรียงตามลำดับของหัวข้อในตาราง เหมือนที่ใบสั่งงานพิมพ์ออกมา สองที่จึงอ่านตรงกัน
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {Object[]} [{topicId, name, required, files: [...]}]
 */
function listWoAttachmentGroups(woId) {
  var files = listWoFileViews(woId);
  var byTopic = {};

  for (var i = 0; i < files.length; i++) {
    var id = String(files[i].topicId || '');
    if (!id) continue;
    if (!byTopic[id]) byTopic[id] = [];
    byTopic[id].push(files[i]);
  }

  var topics = listAttachmentTopics(false);
  var out = [];
  for (var t = 0; t < topics.length; t++) {
    var topicId = String(topics[t]['Topic_ID'] || '');
    if (!byTopic[topicId]) continue;
    out.push({
      topicId:  topicId,
      name:     String(topics[t]['Topic_Name'] || topicId),
      required: cellToBoolean_(topics[t]['Required']),
      files:    byTopic[topicId]
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * ชุดที่ใช้สำรองข้อมูล (SPEC 22.6)
 *
 * อยู่ในไฟล์นี้เพราะไฟล์นี้เป็นที่เดียวที่เรียก DriveApp ได้ · 98_Backup.gs ถือตรรกะ
 * ของการสำรองและการกู้คืน แต่ไม่รู้จัก Drive เลยสักบรรทัด — วันที่ย้ายไป Workers
 * แล้วไฟล์สำรองไปอยู่ R2 แทน จะแก้แค่ห้าฟังก์ชันข้างล่างนี้
 * --------------------------------------------------------------------------- */

/**
 * เขียนไฟล์ข้อความลงโฟลเดอร์
 *
 * แยกจาก driveCreateFile_ เพราะตัวนั้นรับ base64 ซึ่งมาจากไฟล์ที่ผู้ใช้อัปโหลด
 * ส่วนตัวนี้รับข้อความที่ระบบสร้างเอง · การบังคับให้ไฟล์สำรองเดินผ่านการเข้ารหัส
 * base64 ไปกลับ เป็นการเพิ่มโอกาสพลาดโดยไม่ได้อะไรเลย
 *
 * `Utilities.newBlob` เข้ารหัสข้อความเป็น UTF-8 ให้เอง · ขนาดไฟล์ที่ได้จึงนับเป็น
 * **ไบต์ ไม่ใช่ตัวอักษร** ซึ่งต่างกันเกือบสามเท่าสำหรับข้อมูลภาษาไทย
 *
 * @param {string} folderId รหัสโฟลเดอร์ปลายทาง
 * @param {string} name ชื่อไฟล์
 * @param {string} text เนื้อไฟล์
 * @return {Object} {id, url, size}
 */
function driveCreateTextFile_(folderId, name, text) {
  var blob = Utilities.newBlob(String(text), 'application/json', name);
  var file = DriveApp.getFolderById(folderId).createFile(blob);
  return { id: file.getId(), url: file.getUrl(), size: file.getSize() };
}

/**
 * อ่านเนื้อไฟล์ข้อความกลับมา — ครึ่งหลังของการสำรองข้อมูลที่ขาดไม่ได้
 *
 * สำเนาที่อ่านกลับไม่ได้ ไม่ใช่สำเนา · ฟังก์ชันนี้จึงสำคัญเท่ากับตัวที่เขียนไฟล์
 * และต้องถูกพิสูจน์ด้วยการกู้จริง ไม่ใช่แค่ดูว่าไฟล์มีอยู่
 *
 * @param {string} fileId รหัสไฟล์บน Drive
 * @return {string} เนื้อไฟล์เป็นข้อความ UTF-8
 * @throws {Error} เมื่อเปิดไฟล์ไม่ได้ — การกู้คืนที่อ่านไฟล์ไม่ได้ต้องหยุด ไม่ใช่เดินต่อ
 */
function driveReadTextFile_(fileId) {
  return DriveApp.getFileById(fileId).getBlob().getDataAsString();
}

/**
 * โฟลเดอร์ย่อยตามชื่อ — หาเจอก็ใช้ตัวเดิม ไม่เจอก็สร้างให้
 *
 * ต้องหาก่อนสร้างเสมอ ไม่งั้นการรันซ้ำในวันเดียวกันจะได้โฟลเดอร์ชื่อซ้ำสองอัน
 * ซึ่ง Drive ยอมให้เกิดขึ้นได้ แล้วตัวนับ "มีสำรองกี่ชุด" จะนับผิดตลอดไป
 *
 * @param {string} parentId รหัสโฟลเดอร์แม่
 * @param {string} name ชื่อโฟลเดอร์ย่อย
 * @return {string} รหัสโฟลเดอร์
 */
function driveSubFolder_(parentId, name) {
  var parent = DriveApp.getFolderById(parentId);
  var found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next().getId() : parent.createFolder(name).getId();
}

/**
 * โฟลเดอร์ย่อยทั้งหมดใต้โฟลเดอร์หนึ่ง เรียงจากใหม่ไปเก่าตามชื่อ
 *
 * เรียงตามชื่อได้เพราะชื่อเป็นวันที่รูปแบบ yyyy-MM-dd ซึ่งเรียงตามตัวอักษรแล้วตรงกับ
 * เรียงตามเวลาพอดี · เชื่อถือได้กว่าวันที่สร้างของ Drive ซึ่งเปลี่ยนได้เมื่อมีคนย้ายไฟล์
 *
 * @param {string} parentId รหัสโฟลเดอร์แม่ · ค่าว่าง = ไม่มีอะไรเลย
 * @return {Object[]} [{id, name}] ใหม่สุดอยู่หน้าสุด
 */
function driveListFolders_(parentId) {
  if (!parentId) return [];
  try {
    var folders = DriveApp.getFolderById(parentId).getFolders();
    var out = [];
    while (folders.hasNext()) {
      var folder = folders.next();
      out.push({ id: folder.getId(), name: folder.getName() });
    }
    out.sort(function (a, b) { return a.name < b.name ? 1 : (a.name > b.name ? -1 : 0); });
    return out;
  } catch (e) {
    return [];
  }
}

/**
 * ไฟล์ในโฟลเดอร์พร้อมรหัสและขนาด
 *
 * ต่างจาก driveListFiles_ ที่คืนแค่ชื่อกับที่อยู่ เพราะการกู้คืนต้องใช้ **รหัสไฟล์**
 * และรายงานสภาพการสำรองต้องใช้ **ขนาดเป็นไบต์** · สองอย่างนั้นตัวเดิมไม่มีให้
 *
 * @param {string} folderId รหัสโฟลเดอร์ · ค่าว่าง = ไม่มีอะไรเลย
 * @return {Object[]} [{id, name, size}]
 */
function driveFolderFiles_(folderId) {
  if (!folderId) return [];
  try {
    var files = DriveApp.getFolderById(folderId).getFiles();
    var out = [];
    while (files.hasNext()) {
      var file = files.next();
      out.push({ id: file.getId(), name: file.getName(), size: file.getSize() });
    }
    out.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    return out;
  } catch (e) {
    return [];
  }
}

/**
 * โฟลเดอร์เก็บไฟล์สำรอง — สร้างให้เองครั้งแรกที่ใช้
 *
 * วิธีเดียวกับ driveWoContainer_ ทุกประการ คือจำรหัสไว้ใน Script Properties
 * แล้วสร้างใหม่ให้เมื่อโฟลเดอร์เดิมถูกลบ · ถ้าไม่จำรหัสไว้ การค้นด้วยชื่อทุกครั้ง
 * จะช้าและจะหลงไปเจอโฟลเดอร์ชื่อเดียวกันที่คนอื่นสร้าง
 *
 * @return {string} รหัสโฟลเดอร์
 */
function driveBackupContainer_() {
  var props = PropertiesService.getScriptProperties();
  var known = props.getProperty(PROP_DRIVE_BACKUP_FOLDER);
  if (known) {
    try {
      return DriveApp.getFolderById(known).getId();
    } catch (e) {
      props.deleteProperty(PROP_DRIVE_BACKUP_FOLDER);
    }
  }

  var id = driveSubFolder_(driveRootFolder_().getId(), DRIVE_BACKUP_FOLDER_NAME);
  props.setProperty(PROP_DRIVE_BACKUP_FOLDER, id);
  return id;
}
