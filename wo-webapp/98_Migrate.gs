/**
 * 98_Migrate.gs — เครื่องมือสำรวจชีตจริงก่อนย้ายฐานข้อมูลไป Supabase (SPEC 22)
 *
 * ไฟล์นี้ **อ่านอย่างเดียวล้วน** ไม่เขียนอะไรลงชีตแม้แต่เซลล์เดียว และไม่มีใครในระบบเรียกใช้
 * เป็นเครื่องมือของผู้ดูแลที่กดรันจากตัวแก้ไข Apps Script เหมือน checkReportMaster()
 * เมื่อย้ายฐานข้อมูลเสร็จแล้วให้ลบไฟล์นี้ทิ้งได้ทันที
 *
 * ทำไมต้องมี: SPEC 22.5 ห้ามเขียน CREATE TABLE จากหัวข้อ 13 โดยตรง เพราะหัวข้อ 13
 * เป็นสิ่งที่ "ตั้งใจให้เป็น" ส่วนชีตจริงคือสิ่งที่ "เป็นอยู่" — สองอย่างนี้ต่างกันแน่นอน
 * ในจุดที่เพิ่มทีหลัง เช่นตาราง Session_Token และคอลัมน์รหัสผ่านใน User_Role
 * ซึ่งเกิดขึ้นหลังหัวข้อ 13 ถูกเขียนไว้ · schema ที่ผิดตั้งแต่วันแรกจะพาข้อมูลผิดตามไปด้วย
 *
 * สามข้อที่ต้องระวังเป็นพิเศษ และเป็นเหตุผลของโค้ดสามส่วนในไฟล์นี้
 *
 *   1. **ห้ามให้ค่าของรหัสผ่านหรือโทเคนหลุดออกมา** ต่อให้เป็นแค่ Execution log
 *      คอลัมน์ที่ชื่อเข้าข่ายจะถูกพิมพ์เป็น "ชื่อคอลัมน์ = ความยาว n ตัวอักษร" เท่านั้น
 *      ไม่มีค่าจริงโผล่ออกมาเลยแม้แต่ตัวเดียว (ดู migrateIsSecret_)
 *
 *   2. **ชนิดของค่าที่อ่านกลับมาสำคัญกว่าชื่อคอลัมน์** Google Sheet แปลงค่าตอนเขียน
 *      ข้อความที่หน้าตาเป็นวันที่อาจกลายเป็น Date และ "TRUE" อาจกลายเป็น boolean
 *      คนละแถวในคอลัมน์เดียวกันเป็นคนละชนิดได้ · ถ้าอ่านแต่ชื่อคอลัมน์มาตั้ง schema
 *      จะเจอปัญหานี้ตอนย้ายข้อมูลจริง ซึ่งสายไปแล้ว จึงต้องพิมพ์ค่าตัวอย่างพร้อมชนิดด้วย
 *
 *   3. **Execution log ของ Apps Script ตัดข้อความทิ้งเมื่อยาวเกินไป** ("Logging output
 *      too large. Truncating output.") ซึ่งแย่กว่าไม่มีผลเลย เพราะผลที่ขาดหายหน้าตา
 *      เหมือนผลที่ครบ · งานจึงถูกแบ่งเป็นคำสั่งย่อย และแต่ละคำสั่งหยุดเองก่อนถึงเพดาน
 *      พร้อมบอกว่าเหลืออะไรที่ยังไม่ได้ดู
 *
 *      เพดานนั้นนับเป็น **ไบต์ ไม่ใช่ตัวอักษร** ซึ่งเป็นเรื่องสำคัญมากกับรายงานภาษาไทย
 *      เพราะอักษรไทยหนึ่งตัวกินสามไบต์ใน UTF-8 · วัดจากของจริงแล้ว รายงานที่ถูกตัดยาว
 *      8,148 ตัวอักษร แต่เป็น 13,434 ไบต์ คือ 1.65 ไบต์ต่อตัวอักษร · การนับเป็นตัวอักษร
 *      จึงประเมินต่ำไปเกือบเท่าตัว และเป็นเหตุที่การรันรอบที่สองยังโดนตัดซ้ำ
 */

/**
 * ฟังก์ชันในไฟล์นี้ที่พูดถึงที่เก็บข้อมูลเดิมในข้อความที่คนอ่าน
 *
 * ทั้งระบบห้ามพูดถึงที่เก็บข้อมูลเดิมในข้อความที่ผู้ใช้เห็น เพราะมันไม่มีอยู่แล้ว
 * และคนที่เชื่อตามจะไปแก้ข้อมูลในที่ที่ไม่มีใครอ่าน · ไฟล์นี้เป็นข้อยกเว้นเดียว
 * เพราะเรื่องที่มันรายงานคือการเทียบของเดิมกับของใหม่ ถ้าตัดคำนั้นออก รายงาน
 * จะบอกไม่ได้ว่ากำลังเทียบอะไรกับอะไร
 *
 * ประกาศไว้ที่นี่ ไม่ใช่ในชุดทดสอบ ด้วยเหตุผลเดียวกับ driveLayerFunctions_ —
 * ข้อยกเว้นควรอยู่ติดกับของที่มันยกเว้นให้ · **และรายการนี้มีวันหมดอายุ** วันที่
 * ลบไฟล์นี้ทิ้งตามที่หัวไฟล์บอกไว้ รายการต้องหายไปพร้อมกัน ไม่ใช่โตขึ้นเรื่อย ๆ
 *
 * @return {string[]} ชื่อฟังก์ชัน
 */
function migrationStoryFunctions_() {
  return ['dumpSheetHeaders', 'migrateStructureOfSheet_', 'migrateSamplesPage_',
    'migrateCompareWithCode_', 'migrateOneTable_', 'verifySetA', 'verifyOneTable_',
    'migrateUserRoleFromSheet', 'migrateCheckSecretShape_', 'migrateCompareUserRows_',
    'verifyMigratedRows_', 'verifyRowVerdict_'];
}

/** จำนวนแถวตัวอย่างที่พิมพ์ออกมาให้ดูหน้าตาข้อมูลจริง */
var MIGRATE_SAMPLE_ROWS = 2;

/**
 * ความยาวสูงสุดของค่าหนึ่งค่าที่ยอมให้พิมพ์ออกมา
 *
 * ที่อยู่ลูกค้าบางรายยาวเป็นร้อยตัวอักษร และความยาวเต็มไม่ได้ช่วยตัดสิน schema เลย
 * สิ่งที่ต้องรู้คือ "เป็นข้อความ ไม่ใช่ตัวเลข" กับ "ยาวเกิน 255 ไหม" ซึ่งบอกแยกไว้แล้ว
 */
var MIGRATE_MAX_TEXT = 60;

/**
 * เพดานความยาวของรายงานหนึ่งครั้ง — หน่วยเป็น **ไบต์ UTF-8** ไม่ใช่ตัวอักษร
 *
 * วัดจากของจริง: Google ตัดรายงานทิ้งที่ราว 13,400 ไบต์ · ตั้งไว้ที่ 9,000 เพื่อเผื่อ
 * ที่ให้บล็อกถัดไปที่ยังไม่รู้ขนาด และเผื่อให้ข้อความท้ายรายงานได้พิมพ์ครบ
 *
 * ตั้งเป็นไบต์เพราะหน่วยที่ผิดคือสาเหตุที่การรันรอบที่สองยังโดนตัดซ้ำ ทั้งที่ตัวเลข
 * ดูเหมือนปลอดภัยแล้ว — รายงานภาษาไทยยาวเป็นไบต์มากกว่าที่นับเป็นตัวอักษรเกือบเท่าตัว
 */
var MIGRATE_LOG_BUDGET = 9000;

/**
 * คำที่บอกว่าคอลัมน์นี้เก็บความลับ — เทียบแบบไม่สนตัวพิมพ์และแบบ "มีคำนี้อยู่ข้างใน"
 *
 * กว้างไว้ก่อนโดยตั้งใจ ถ้าพลาดฝั่งนี้คือปิดบังคอลัมน์ที่ไม่ต้องปิด ซึ่งเสียแค่ความสะดวก
 * แต่ถ้าพลาดอีกฝั่งคือค่าแฮชของรหัสผ่านจริงถูกพิมพ์ออกมาค้างอยู่ใน log
 */
var MIGRATE_SECRET_HINTS = ['password', 'salt', 'token', 'hash', 'secret'];

/* ---------------------------------------------------------------------------
 * คำสั่งที่ 1 — โครงสร้าง: ทุกแท็บ ทุกหัวคอลัมน์ จำนวนแถว
 * --------------------------------------------------------------------------- */

/**
 * สำรวจโครงสร้างของทุกแท็บในทุกไฟล์ที่ระบบใช้ แล้วพิมพ์ผลลง Execution log (SPEC 22.5)
 *
 * เดินทุกแท็บที่มีอยู่จริงในไฟล์ ไม่ใช่เดินตามรายชื่อใน SHEET ของ 00_Config
 * เพราะจุดประสงค์คือหาความต่างระหว่าง "ของที่มีอยู่" กับ "ของที่โค้ดรู้จัก"
 * ถ้าเดินตามรายชื่อในโค้ด แท็บที่โค้ดไม่รู้จักจะไม่มีวันถูกเห็น
 *
 * ไม่พิมพ์ค่าตัวอย่างเลย เพราะค่าตัวอย่างคือส่วนที่ทำให้ log ยาวจนถูกตัด
 * และโครงสร้างคือสิ่งที่ต้องได้มาครบทุกแท็บโดยไม่มีข้อยกเว้น (ค่าจริงอยู่ในคำสั่งที่ 2)
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน — รายละเอียดอยู่ใน log เท่านั้น
 */
function dumpSheetHeaders() {
  /*
   * ด่านเดียวกับที่ getSheet_() ใช้ (CLAUDE.md กฎข้อ 21)
   *
   * ต้องเรียกเองที่นี่ เพราะไฟล์นี้เดินทุกแท็บผ่านตัวไฟล์โดยตรง ไม่ได้ผ่าน getSheet_()
   * จึงไม่ได้ด่านนั้นมาให้เอง · ถ้าไม่มีบรรทัดนี้ ใครก็ตามที่เปิดหน้าเว็บจะเรียก
   * dumpSheetHeaders ผ่าน google.script.run ได้ตรง ๆ แล้วได้โครงสร้างทุกตาราง
   */
  assertDataAccessAllowed_();

  var lines = ['===== สำรวจโครงสร้างชีตจริงก่อนย้ายไป Supabase (SPEC 22) ====='];
  var found = {};
  var withData = [];

  var books = migrateBooks_();
  for (var b = 0; b < books.length; b++) {
    migrateStructureOfBook_(lines, books[b], found, withData);
  }

  migrateCompareWithCode_(lines, found);

  lines.push('');
  lines.push('########## ขั้นต่อไป ##########');
  lines.push(withData.length
    ? '  แท็บที่มีข้อมูลให้ดูหน้าตาค่าจริง: ' + withData.join(', ') + NEW_LINE_ +
      '  รัน dumpSheetSamples() ต่อ เพื่อดูค่าตัวอย่างพร้อมชนิดของแท็บเหล่านี้'
    : '  ทุกแท็บยังไม่มีข้อมูลสักแถว จึงไม่มีค่าตัวอย่างให้ดู ไม่ต้องรัน dumpSheetSamples()');

  return migrateReport_(lines);
}

/**
 * โครงสร้างของทุกแท็บในไฟล์หนึ่งไฟล์
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} entry {label, book, error}
 * @param {Object} found ชื่อแท็บที่เจอแล้ว ไปยังหัวคอลัมน์จริงของแท็บนั้น
 * @param {string[]} withData ชื่อแท็บที่มีข้อมูลอย่างน้อยหนึ่งแถว
 */
function migrateStructureOfBook_(lines, entry, found, withData) {
  lines.push('');
  lines.push('########## ' + entry.label + ' ##########');

  if (!entry.book) {
    lines.push('  ข้ามไฟล์นี้: ' + entry.error);
    return;
  }

  lines.push('  ชื่อไฟล์: ' + entry.book.getName());

  var sheets = entry.book.getSheets();
  lines.push('  จำนวนแท็บทั้งหมด: ' + sheets.length);

  for (var i = 0; i < sheets.length; i++) {
    // เก็บหัวคอลัมน์จริงไว้ใช้ตอนเทียบท้ายรายงาน จะได้ไม่ต้องอ่านชีตซ้ำ
    // และไม่ต้องผ่าน getHeader_() ซึ่งอาจคืนค่าจากแคชอายุ 5 นาที แทนของจริงในชีต
    found[sheets[i].getName()] = migrateStructureOfSheet_(lines, sheets[i], withData);
  }
}

/**
 * โครงสร้างของแท็บเดียว — หัวคอลัมน์ จำนวนคอลัมน์ จำนวนแถว และปัญหาที่ชื่อคอลัมน์
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Sheet} sheet แท็บที่จะสำรวจ
 * @param {string[]} withData ชื่อแท็บที่มีข้อมูล จะถูกเติมเมื่อแท็บนี้มีแถวข้อมูล
 * @return {string[]} หัวคอลัมน์จริงของแท็บนั้น (ว่างเมื่อแท็บว่างเปล่า)
 */
function migrateStructureOfSheet_(lines, sheet, withData) {
  var name = sheet.getName();
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  lines.push('');
  lines.push('--- แท็บ: ' + name + ' ---');

  if (!lastRow || !lastCol) {
    lines.push('  (แท็บว่างเปล่า ไม่มีแม้แต่หัวคอลัมน์)');
    return [];
  }

  // อ่านแค่แถวเดียว คือแถวหัวคอลัมน์ — 1 รอบชีตต่อแท็บ ไม่ว่าแท็บนั้นจะมีกี่พันแถว
  var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var rows = lastRow - 1;
  if (rows > 0) withData.push(name);

  lines.push('  จำนวนคอลัมน์: ' + lastCol + ' · จำนวนแถวข้อมูล (ไม่นับหัว): ' + rows);
  lines.push('  หัวคอลัมน์: ' + header.join(' | '));

  var blanks = migrateBlankHeaders_(header);
  if (blanks.length) {
    lines.push('  ! คอลัมน์ที่ไม่มีชื่อ (ลำดับที่): ' + blanks.join(', ') +
      ' — ต้องตัดสินก่อนย้ายว่าจะทิ้งหรือจะตั้งชื่อให้');
  }

  /*
   * ช่องว่างหน้า/หลังชื่อคอลัมน์มองไม่เห็นด้วยตาทั้งในชีตและในรายงาน แต่ทำให้
   * ชื่อคอลัมน์ที่ "ดูเหมือนตรงกัน" กลายเป็นคนละชื่อตอนย้ายเข้า Postgres
   * ระบบตอนนี้รอดมาได้เพราะ normalizeHeader_() ตัดช่องว่างให้ก่อนเทียบชื่อ
   * แต่สคริปต์ย้ายข้อมูลที่อ่านหัวคอลัมน์ดิบจะไม่รอด จึงต้องเห็นตั้งแต่ตอนนี้
   */
  var spaced = migrateSpacedHeaders_(header);
  if (spaced.length) {
    lines.push('  ! ชื่อคอลัมน์ที่มีช่องว่างติดอยู่หน้า/หลัง: ' + spaced.join(', ') +
      ' — มองไม่เห็นด้วยตา ต้องลบช่องว่างในชีตก่อนย้าย');
  }

  return normalizeHeader_(header);
}

/* ---------------------------------------------------------------------------
 * คำสั่งที่ 2 — หน้าตาข้อมูลจริง: ค่าตัวอย่างพร้อมชนิด
 * --------------------------------------------------------------------------- */

/**
 * พิมพ์ค่าตัวอย่างพร้อมชนิด เฉพาะแท็บที่มีข้อมูลจริง
 *
 * แยกออกมาจาก dumpSheetHeaders() เพราะสองอย่างนี้ถูกจำกัดด้วยคนละเรื่อง
 * โครงสร้างต้องได้ครบทุกแท็บเสมอ ส่วนค่าตัวอย่างยาวเท่าไรขึ้นกับข้อมูลที่มีอยู่จริง
 * ถ้ารวมกันอยู่ในคำสั่งเดียว ข้อมูลที่เยอะขึ้นจะไปเบียดโครงสร้างของแท็บท้าย ๆ ให้หายไป
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function dumpSheetSamples() {
  assertDataAccessAllowed_();
  return migrateReport_(migrateSamplesPage_(1));
}

/**
 * ค่าตัวอย่างหน้าที่ 2 — ต่อจากจุดที่ dumpSheetSamples() หยุดไว้
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function dumpSheetSamples2() {
  assertDataAccessAllowed_();
  return migrateReport_(migrateSamplesPage_(2));
}

/**
 * ค่าตัวอย่างหน้าที่ 3 — ต่อจากจุดที่ dumpSheetSamples2() หยุดไว้
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function dumpSheetSamples3() {
  assertDataAccessAllowed_();
  return migrateReport_(migrateSamplesPage_(3));
}

/**
 * ค่าตัวอย่างหน้าที่ 4 — หน้าสุดท้ายที่มีให้
 *
 * สี่หน้าคือของจริงราวสี่เท่าของข้อมูลที่มีอยู่ตอนนี้ ถ้าวันหนึ่งยังไม่พอ รายงานจะ
 * บอกเองว่าเหลือแท็บไหน แล้วดูทีละแท็บต่อได้ด้วย dumpSheetSamplesOf
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function dumpSheetSamples4() {
  assertDataAccessAllowed_();
  return migrateReport_(migrateSamplesPage_(4));
}

/**
 * รายงานค่าตัวอย่างหนึ่งหน้า
 *
 * ไม่ต้องจำอะไรไว้ระหว่างการรันแต่ละหน้า เพราะลำดับแท็บกับเพดานเป็นของตายตัวทั้งคู่
 * ขอบของหน้าก่อน ๆ จึงคำนวณซ้ำได้เสมอ · ทางเลือกอื่นคือจดความคืบหน้าไว้ใน
 * Script Properties ซึ่งจะทำให้ไฟล์นี้ไม่ใช่เครื่องมืออ่านอย่างเดียวอีกต่อไป จึงไม่เอา
 *
 * ราคาของการคำนวณซ้ำคืออ่านชีตของหน้าก่อน ๆ ใหม่ หน้าละหนึ่งรอบต่อแท็บ
 * ซึ่งถูกกว่าการเดาขอบของหน้ามาก และยังห่างจากเพดาน 400 รอบต่อการรันอยู่หลายเท่า
 *
 * @param {number} pageNo หน้าที่ต้องการ (เริ่มที่ 1)
 * @return {string[]} บรรทัดของรายงานหน้านั้น
 */
function migrateSamplesPage_(pageNo) {
  var targets = migrateSampleTargets_();

  if (!targets.length) {
    return ['===== หน้าตาข้อมูลจริงในชีต =====', '',
      '  ทุกแท็บยังไม่มีข้อมูลสักแถว — ชนิดของค่าจริงจึงยังดูไม่ได้',
      '  ถ้าตั้งใจจะย้ายตารางเปล่า ให้ตัดสินชนิดคอลัมน์จากโค้ดที่เขียนค่าลงไป'];
  }

  // เดินหาขอบของหน้าก่อน ๆ ซ้ำ จนได้จุดเริ่มของหน้าที่ขอมา
  var from = 0;
  for (var p = 1; p < pageNo; p++) {
    var edge = migrateFitFrom_(targets, from);
    if (!edge.stoppedAt) {
      return ['===== หน้าตาข้อมูลจริงในชีต =====', '',
        '  พิมพ์ครบทุกแท็บไปแล้วตั้งแต่หน้าที่ ' + p + ' ไม่มีหน้าที่ ' + pageNo + ' ให้ดู'];
    }
    from = edge.stoppedAt;
  }

  var page = migrateFitFrom_(targets, from);
  var lines = ['===== หน้าตาข้อมูลจริงในชีต หน้าที่ ' + pageNo + ' ' +
    '(แท็บที่ ' + (from + 1) + ' ถึง ' + (page.stoppedAt || targets.length) + ' จาก ' + targets.length + ') ====='];
  lines = lines.concat(page.lines);

  if (page.stoppedAt) {
    var left = [];
    for (var r = page.stoppedAt; r < targets.length; r++) left.push(targets[r].getName());

    lines.push('');
    lines.push('########## หยุดไว้ก่อนเพราะรายงานจะยาวเกินจน log ถูกตัด ##########');
    lines.push('  แท็บที่ยังไม่ได้ดู: ' + left.join(', '));
    lines.push(pageNo < 4
      ? '  รัน dumpSheetSamples' + (pageNo + 1) + '() ต่อ เพื่อดูหน้าถัดไป'
      : '  หมดหน้าที่มีให้แล้ว — ดูแท็บที่เหลือทีละแท็บด้วย dumpSheetSamplesOf');
  }
  return lines;
}

/**
 * ใส่บล็อกของแท็บลงหน้าหนึ่ง จนกว่าจะใกล้ชนเพดาน
 *
 * ตัดสินใจ "ก่อน" เอาบล็อกของแท็บนั้นใส่รายงาน ไม่ใช่หลัง เพราะการเช็กทีหลังแปลว่า
 * บล็อกที่ทำให้ล้นได้เข้าไปอยู่ในรายงานแล้ว ซึ่งเป็นบล็อกที่จะถูกตัดค้างครึ่งทาง
 *
 * @param {Sheet[]} targets แท็บทั้งหมดที่มีข้อมูล เรียงตามลำดับที่แน่นอน
 * @param {number} from ลำดับแท็บที่จะเริ่ม (เริ่มที่ 0)
 * @return {Object} {lines, stoppedAt} — stoppedAt เป็น 0 เมื่อใส่ได้จนหมด
 */
function migrateFitFrom_(targets, from) {
  var lines = [];
  var used = 0;

  for (var i = from; i < targets.length; i++) {
    var block = [];
    migrateSamplesOfSheet_(block, targets[i]);
    var size = migrateByteLength_(block.join(NEW_LINE_));

    // แท็บแรกของหน้าต้องได้พิมพ์เสมอ ถึงจะใหญ่เกินเพดานก็ตาม ไม่งั้นหน้าถัดไปจะไม่ขยับ
    if (used + size > MIGRATE_LOG_BUDGET && i > from) {
      return { lines: lines, stoppedAt: i };
    }

    lines = lines.concat(block);
    used += size;
  }
  return { lines: lines, stoppedAt: 0 };
}

/**
 * แท็บทั้งหมดที่มีข้อมูล เรียงตามลำดับที่แน่นอน — ลำดับนี้คือสิ่งที่ทำให้แบ่งรอบพิมพ์ได้
 * @return {Sheet[]}
 */
function migrateSampleTargets_() {
  var out = [];
  var books = migrateBooks_();

  for (var b = 0; b < books.length; b++) {
    if (!books[b].book) continue;

    var sheets = books[b].book.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      if (sheets[i].getLastRow() >= 2) out.push(sheets[i]);   // มีมากกว่าหัวคอลัมน์
    }
  }
  return out;
}

/**
 * ความยาวของข้อความเป็นไบต์ UTF-8 — หน่วยเดียวกับที่ Apps Script ใช้ตัดรายงาน
 *
 * JavaScript วัดความยาวเป็นหน่วยของ UTF-16 ซึ่งนับอักษรไทยเป็นหนึ่ง ทั้งที่กินสามไบต์
 * ความต่างนี้เกือบเท่าตัวในรายงานภาษาไทย และเป็นสาเหตุที่การตั้งเพดานเป็นตัวอักษรพลาด
 *
 * @param {string} text ข้อความที่จะวัด
 * @return {number} จำนวนไบต์
 */
function migrateByteLength_(text) {
  var bytes = 0;
  for (var i = 0; i < text.length; i++) {
    var code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xD800 && code <= 0xDBFF) { bytes += 4; i++; }   // คู่ surrogate
    else bytes += 3;
  }
  return bytes;
}

/**
 * ค่าตัวอย่างของแท็บเดียวตามชื่อ — ทางออกเมื่อ dumpSheetSamples() หยุดกลางคัน
 * @param {string} sheetName ชื่อแท็บที่ต้องการดู
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function dumpSheetSamplesOf(sheetName) {
  assertDataAccessAllowed_();

  if (!sheetName) {
    Logger.log('ต้องบอกชื่อแท็บด้วย — ฟังก์ชันนี้กดปุ่ม Run ตรง ๆ ไม่ได้เพราะต้องมีชื่อแท็บ');
    return 'ต้องบอกชื่อแท็บด้วย';
  }

  var lines = ['===== หน้าตาข้อมูลจริงของแท็บ ' + sheetName + ' ====='];
  var books = migrateBooks_();

  for (var b = 0; b < books.length; b++) {
    if (!books[b].book) continue;

    var sheet = books[b].book.getSheetByName(sheetName);
    if (!sheet) continue;

    migrateSamplesOfSheet_(lines, sheet);
    return migrateReport_(lines);
  }

  lines.push('  ไม่พบแท็บชื่อนี้ในไฟล์ใดเลย — รัน dumpSheetHeaders() เพื่อดูชื่อแท็บที่มีจริง');
  return migrateReport_(lines);
}

/**
 * ค่าตัวอย่างของแท็บเดียว พร้อมชนิดของทุกค่าและคำเตือนเรื่องชนิดที่ไม่ตรงกัน
 *
 * อ่านแค่ช่วงหัวตารางกับแถวตัวอย่างเท่านั้น ไม่อ่านทั้งแท็บ เพราะ Customer
 * มีเกือบหกพันแถวและไม่มีอะไรในแถวที่ 500 ที่แถวที่ 2 ไม่ได้บอกไว้แล้ว
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Sheet} sheet แท็บที่จะสำรวจ
 */
function migrateSamplesOfSheet_(lines, sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  lines.push('');
  lines.push('--- แท็บ: ' + sheet.getName() + ' (ข้อมูล ' + (lastRow - 1) + ' แถว) ---');

  if (lastRow < 2 || !lastCol) {
    lines.push('  (ยังไม่มีข้อมูลสักแถว มีแต่หัวคอลัมน์)');
    return;
  }

  var wanted = Math.min(lastRow, MIGRATE_SAMPLE_ROWS + 1);   // +1 คือแถวหัวคอลัมน์
  var values = sheet.getRange(1, 1, wanted, lastCol).getValues();
  var header = values[0];

  for (var r = 1; r < values.length; r++) {
    lines.push('  แถวที่ ' + r + ':');
    for (var c = 0; c < header.length; c++) {
      lines.push('      ' + migrateColumnLabel_(header[c], c) + ' = ' +
        migrateValueText_(header[c], values[r][c]));
    }
  }

  /* ---------- คอลัมน์เวลา: Date จริงหรือเป็นข้อความ ---------- */
  /*
   * เรื่องนี้ตัดสิน schema โดยตรง (SPEC 22.3) — คอลัมน์ที่เป็น Date จริงไปเป็น timestamptz ได้
   * ส่วนคอลัมน์ที่เก็บเป็นข้อความต้องไปเป็น text ไม่งั้นเวลานัดหมายจะเลื่อนไป 7 ชั่วโมง
   * และคอลัมน์เดียวกันเป็นคนละชนิดในคนละแถวได้จริง จึงดูทุกแถวตัวอย่างที่มี
   */
  var timeCols = [];
  for (var t = 0; t < header.length; t++) {
    if (!migrateIsTimeColumn_(header[t])) continue;
    timeCols.push('      ' + String(header[t]) + ' -> ' + migrateTimeKinds_(values, t));
  }
  if (timeCols.length) {
    lines.push('  ชนิดของคอลัมน์เวลา (ตามที่อ่านกลับมาได้จริง):');
    for (var k = 0; k < timeCols.length; k++) lines.push(timeCols[k]);
  }

  /* ---------- คอลัมน์ที่คนละแถวเป็นคนละชนิด ---------- */
  var conflicts = migrateTypeConflicts_(values);
  if (conflicts.length) {
    lines.push('  ! คอลัมน์ที่แถวตัวอย่างเป็นคนละชนิดกัน: ' + conflicts.join(' · '));
    lines.push('    แปลว่าค่าในคอลัมน์นี้ถูกกรอกมาสองแบบ ต้องแปลงให้เป็นแบบเดียวตอนย้าย');
  }
}

/* ---------------------------------------------------------------------------
 * ส่วนที่ใช้ร่วมกัน
 * --------------------------------------------------------------------------- */

/**
 * ไฟล์ทั้งหมดที่ระบบใช้จริง
 *
 * ตอนนี้มีสองไฟล์ตามที่ resolveSpreadsheet_() ใน 01_Repo_Sheet.gs แบ่งไว้
 *   1. ไฟล์หลัก ที่สคริปต์ผูกอยู่ — ทุกแท็บรวมทั้ง Customer
 *   2. ไฟล์บันทึกประวัติ ที่แยกออกไปกันชนเพดาน 10 ล้านเซลล์ — Audit_Log และ System_Log
 *
 * เปิดไฟล์ผ่าน getDb_() / getAuditDb_() ของ 00_Config.gs เท่านั้น ไม่เรียกบริการชีตเอง
 * เพื่อให้กติกา "เปิดไฟล์ที่เดียว" ยังเป็นจริง แม้ไฟล์นี้จะเป็นเครื่องมือชั่วคราว
 *
 * @return {Object[]} [{label, book}] — ไฟล์ที่เปิดไม่ได้จะถูกข้ามพร้อมเหตุผล
 */
function migrateBooks_() {
  var books = [];

  books.push({ label: 'ไฟล์หลัก (ฐานข้อมูลระบบ)', book: getDb_() });

  /*
   * ไฟล์บันทึกอาจยังไม่ได้ตั้งค่า AUDIT_SHEET_ID ในบางเครื่อง — กรณีนั้นต้องรายงานว่า
   * ข้ามเพราะอะไร ไม่ใช่ล้มทั้งการสำรวจ เพราะข้อมูลของไฟล์หลักยังมีค่าอยู่
   */
  try {
    books.push({ label: 'ไฟล์บันทึกประวัติ (Audit_Log / System_Log)', book: getAuditDb_() });
  } catch (e) {
    books.push({ label: 'ไฟล์บันทึกประวัติ', book: null, error: userFacingMessage_(e) });
  }
  return books;
}

/**
 * พิมพ์รายงานลง log แล้วคืนข้อความสั้น ๆ — จุดเดียวที่รายงานออกจากไฟล์นี้
 *
 * ไม่คืนตัวรายงานกลับไปทาง return เพราะค่าที่ return จาก google.script.run ไปโผล่
 * ที่หน้าเว็บได้ ส่วน Execution log เห็นได้เฉพาะคนที่เปิดตัวแก้ไขสคริปต์
 *
 * @param {string[]} lines บรรทัดทั้งหมดของรายงาน
 * @return {string} ข้อความบอกที่อยู่ของผล
 */
function migrateReport_(lines) {
  var text = lines.join(NEW_LINE_);
  Logger.log(text);

  var bytes = migrateByteLength_(text);
  if (bytes > MIGRATE_LOG_BUDGET) {
    Logger.log('! รายงานยาว ' + bytes + ' ไบต์ ซึ่งเกินเพดานที่ตั้งไว้ ' + MIGRATE_LOG_BUDGET +
      ' — ถ้าเห็นคำว่า Truncating output แปลว่าผลข้างบนไม่ครบ');
  }
  return 'พิมพ์ผลลง Execution log แล้ว — ดูผลที่นั่น ไม่คืนค่าข้อมูลกลับมาที่นี่';
}

/**
 * ลำดับของคอลัมน์ที่ไม่มีชื่อ — ตัวที่ต้องตัดสินใจก่อนย้าย
 * @param {Array} header แถวหัวคอลัมน์
 * @return {number[]} ลำดับคอลัมน์ (เริ่มที่ 1)
 */
function migrateBlankHeaders_(header) {
  var out = [];
  for (var i = 0; i < header.length; i++) {
    if (String(header[i] === null || header[i] === undefined ? '' : header[i]).trim() === '') {
      out.push(i + 1);
    }
  }
  return out;
}

/**
 * ชื่อคอลัมน์ที่มีช่องว่างติดอยู่หน้าหรือหลัง — เห็นได้ก็ต่อเมื่อเทียบกับตัวที่ตัดช่องว่างแล้ว
 * @param {Array} header แถวหัวคอลัมน์
 * @return {string[]} ชื่อคอลัมน์พร้อมตำแหน่ง เขียนในวงเล็บเหลี่ยมให้เห็นขอบของช่องว่าง
 */
function migrateSpacedHeaders_(header) {
  var out = [];
  for (var i = 0; i < header.length; i++) {
    var raw = String(header[i] === null || header[i] === undefined ? '' : header[i]);
    var trimmed = raw.trim();
    if (trimmed !== '' && raw !== trimmed) {
      out.push('คอลัมน์ที่ ' + (i + 1) + ' [' + raw + ']');
    }
  }
  return out;
}

/**
 * ชื่อคอลัมน์ที่ใช้แสดงในบรรทัดตัวอย่าง — คอลัมน์ที่ไม่มีชื่อยังต้องรู้ว่าอยู่ตำแหน่งไหน
 * @param {*} header ค่าหัวคอลัมน์
 * @param {number} index ลำดับที่ (เริ่มที่ 0)
 * @return {string}
 */
function migrateColumnLabel_(header, index) {
  var name = String(header === null || header === undefined ? '' : header).trim();
  return name || ('(คอลัมน์ที่ ' + (index + 1) + ' ไม่มีชื่อ)');
}

/**
 * คอลัมน์นี้เก็บความลับหรือไม่ — รหัสผ่าน เกลือ โทเคน หรือค่าแฮชใด ๆ
 * @param {*} header ชื่อคอลัมน์
 * @return {boolean}
 */
function migrateIsSecret_(header) {
  var name = String(header || '').toLowerCase();
  for (var i = 0; i < MIGRATE_SECRET_HINTS.length; i++) {
    if (name.indexOf(MIGRATE_SECRET_HINTS[i]) !== -1) return true;
  }
  return false;
}

/**
 * ค่าหนึ่งค่าในรูปที่อ่านแล้วรู้ทั้ง "ค่า" และ "ชนิด"
 *
 * ชนิดสำคัญพอ ๆ กับค่า เพราะช่องว่างในชีตเป็นได้ทั้ง "" และ null และค่าที่หน้าตา
 * เหมือนกันบนหน้าจออาจเป็นคนละชนิดกันจริง ๆ — "TRUE" (ข้อความ) กับ true (boolean)
 * ดูเหมือนกันทุกประการในชีต แต่ย้ายเข้า Postgres คนละแบบ (SPEC 22.3)
 *
 * @param {*} header ชื่อคอลัมน์ ใช้ตัดสินว่าต้องปิดบังค่าหรือไม่
 * @param {*} value ค่าที่อ่านมาจากชีต
 * @return {string}
 */
function migrateValueText_(header, value) {
  if (migrateIsSecret_(header)) {
    // ค่าจริงห้ามออกมา — บอกแค่ว่ามีค่าอยู่และยาวเท่าไร ซึ่งพอจะตั้งความยาวคอลัมน์ได้แล้ว
    var length = String(value === null || value === undefined ? '' : value).length;
    return '(ปิดบังไว้) ความยาว ' + length + ' ตัวอักษร · ชนิด ' + typeof value;
  }

  if (value === null) return '(null)';
  if (value === undefined) return '(undefined)';

  if (value instanceof Date) {
    return 'Date(' + value.toISOString() + ') · typeof=' + (typeof value) + ' · instanceof Date=true';
  }
  if (typeof value === 'string') {
    if (value === '') return '""  (ข้อความว่าง)  · typeof=string';
    return '"' + migrateShorten_(value) + '"  · typeof=string · ยาว ' + value.length + ' ตัวอักษร';
  }
  if (typeof value === 'boolean') return String(value) + '  · typeof=boolean';
  if (typeof value === 'number') return String(value) + '  · typeof=number';
  return String(value) + '  · typeof=' + (typeof value);
}

/**
 * ตัดข้อความยาวให้พอเห็นหน้าตา — ความยาวเต็มถูกบอกไว้แยกต่างหากแล้ว
 * @param {string} text ข้อความเต็ม
 * @return {string}
 */
function migrateShorten_(text) {
  if (text.length <= MIGRATE_MAX_TEXT) return text;
  return text.substring(0, MIGRATE_MAX_TEXT) + '…';
}

/**
 * คอลัมน์นี้เป็นคอลัมน์เวลาหรือไม่ — ชื่อลงท้ายด้วย _Date หรือชื่อว่า Timestamp
 * @param {*} header ชื่อคอลัมน์
 * @return {boolean}
 */
function migrateIsTimeColumn_(header) {
  var name = String(header || '').trim();
  if (!name) return false;
  if (name === 'Timestamp') return true;
  return name.length > 5 && name.substring(name.length - 5) === '_Date';
}

/**
 * ชนิดของค่าที่อ่านได้จริงในคอลัมน์เวลาหนึ่งคอลัมน์ ดูจากทุกแถวตัวอย่างที่มี
 * @param {Array[]} values ค่าทั้งช่วงที่อ่านมา (แถวแรกคือหัวคอลัมน์)
 * @param {number} col ลำดับคอลัมน์ (เริ่มที่ 0)
 * @return {string}
 */
function migrateTimeKinds_(values, col) {
  if (values.length < 2) return '(ยังไม่มีข้อมูลให้ดู)';

  var parts = [];
  for (var r = 1; r < values.length; r++) {
    var value = values[r][col];
    var kind = (value instanceof Date) ? 'Date'
      : (value === '' ? 'ข้อความว่าง' : typeof value);
    parts.push('แถว ' + r + ': typeof=' + (typeof value) +
      ' · instanceof Date=' + (value instanceof Date) + ' · สรุป=' + kind);
  }
  return parts.join(' || ');
}

/**
 * คอลัมน์ที่แถวตัวอย่างเป็นคนละชนิดกัน — สัญญาณว่าข้อมูลถูกกรอกมาสองแบบ
 *
 * เจอของจริงมาแล้วใน Report_Master คอลัมน์ Required ที่แถวหนึ่งเป็น boolean
 * อีกแถวเป็นข้อความ "FALSE" · ถ้าย้ายเข้าคอลัมน์ boolean ตรง ๆ ข้อความ "FALSE"
 * จะกลายเป็นจริง เพราะข้อความที่ไม่ว่างนับเป็นค่าจริงในหลายภาษา
 *
 * ช่องว่างไม่นับเป็นความต่าง เพราะช่องที่ยังไม่ได้กรอกเป็นเรื่องปกติของทุกคอลัมน์
 *
 * @param {Array[]} values ค่าทั้งช่วงที่อ่านมา (แถวแรกคือหัวคอลัมน์)
 * @return {string[]} คำอธิบายของแต่ละคอลัมน์ที่ชนิดไม่ตรงกัน
 */
function migrateTypeConflicts_(values) {
  if (values.length < 3) return [];      // มีตัวอย่างแถวเดียว ยังเทียบกันไม่ได้

  var header = values[0];
  var out = [];

  for (var c = 0; c < header.length; c++) {
    var kinds = [];
    for (var r = 1; r < values.length; r++) {
      var value = values[r][c];
      if (value === '' || value === null || value === undefined) continue;
      var kind = (value instanceof Date) ? 'Date' : typeof value;
      if (kinds.indexOf(kind) === -1) kinds.push(kind);
    }
    if (kinds.length > 1) {
      out.push(migrateColumnLabel_(header[c], c) + ' (' + kinds.join(' กับ ') + ')');
    }
  }
  return out;
}

/**
 * เทียบแท็บที่เจอจริง กับรายชื่อที่โค้ดรู้จัก แล้วรายงานความต่างทั้งสองทาง
 *
 * ความต่างสองแบบนี้มีความหมายคนละอย่างและต้องจัดการคนละแบบ
 *   แท็บที่โค้ดรู้จักแต่ไม่มีในชีต  = ระบบจะพังเมื่อใช้งานส่วนนั้น ต้องสร้างก่อน
 *   แท็บที่มีในชีตแต่โค้ดไม่รู้จัก  = ของที่คนทำไว้เอง ต้องตัดสินว่าจะย้ายด้วยไหม
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} found ชื่อแท็บที่เจอจริง ไปยังหัวคอลัมน์ของแท็บนั้น
 */
function migrateCompareWithCode_(lines, found) {
  lines.push('');
  lines.push('########## เทียบกับรายชื่อแท็บที่โค้ดรู้จัก (SHEET ใน 00_Config.gs) ##########');

  var missing = [];
  var known = {};
  for (var key in SHEET) {
    if (!Object.prototype.hasOwnProperty.call(SHEET, key)) continue;
    known[SHEET[key]] = true;
    if (!Object.prototype.hasOwnProperty.call(found, SHEET[key])) missing.push(SHEET[key]);
  }

  var extra = [];
  for (var name in found) {
    if (Object.prototype.hasOwnProperty.call(found, name) && !known[name]) extra.push(name);
  }

  lines.push('  แท็บที่โค้ดรู้จักแต่ไม่มีในชีต: ' + (missing.length ? missing.join(', ') : '(ไม่มี)'));
  lines.push('  แท็บที่มีในชีตแต่โค้ดไม่รู้จัก: ' + (extra.length ? extra.join(', ') : '(ไม่มี)'));

  /*
   * เทียบหัวคอลัมน์กับสัญญาที่ชุดทดสอบถืออยู่ด้วย ถ้าไฟล์ทดสอบยังอยู่ในโปรเจกต์
   * รายการนั้นคือ "หัวคอลัมน์ที่โค้ดคาดหวัง" ซึ่งใกล้ความจริงกว่าหัวข้อ 13 ของ SPEC
   * เพราะถูกแก้ทุกครั้งที่เพิ่มคอลัมน์ — แต่ก็ยังไม่ใช่ชีตจริง จึงต้องเทียบให้เห็นกับตา
   */
  if (typeof expectedHeaders_ !== 'function') {
    lines.push('  (ไม่มี expectedHeaders_ ในโปรเจกต์นี้ จึงข้ามการเทียบหัวคอลัมน์)');
    return;
  }

  lines.push('');
  lines.push('########## เทียบหัวคอลัมน์จริง กับที่โค้ดคาดหวัง (expectedHeaders_) ##########');

  var expected = expectedHeaders_();
  for (var sheetName in expected) {
    if (!Object.prototype.hasOwnProperty.call(expected, sheetName)) continue;
    if (!Object.prototype.hasOwnProperty.call(found, sheetName)) {
      lines.push('  ' + sheetName + ': ไม่มีแท็บนี้ในชีต จึงเทียบไม่ได้');
      continue;
    }
    lines.push('  ' + sheetName + ': ' +
      migrateHeaderDiff_(found[sheetName], expected[sheetName]));
  }
}

/**
 * ความต่างของหัวคอลัมน์ระหว่างชีตจริงกับที่โค้ดคาดหวัง
 * @param {string[]} actual หัวคอลัมน์จริงที่อ่านมาจากชีต
 * @param {string[]} expected หัวคอลัมน์ที่โค้ดคาดหวัง
 * @return {string} ข้อความสรุปความต่าง
 */
function migrateHeaderDiff_(actual, expected) {
  var missing = [];
  var extra = [];

  for (var e = 0; e < expected.length; e++) {
    if (actual.indexOf(expected[e]) === -1) missing.push(expected[e]);
  }
  for (var a = 0; a < actual.length; a++) {
    if (expected.indexOf(actual[a]) === -1) extra.push(actual[a] || '(ไม่มีชื่อ)');
  }

  if (!missing.length && !extra.length) {
    var sameOrder = expected.join('|') === actual.join('|');
    return sameOrder ? 'ตรงกันทุกคอลัมน์และเรียงเหมือนกัน'
      : 'มีคอลัมน์ครบเท่ากัน แต่เรียงลำดับต่างกัน (ไม่เป็นปัญหาเพราะระบบอ่านด้วยชื่อ)';
  }
  return 'ขาด: ' + (missing.join(', ') || '-') + ' · เกิน: ' + (extra.join(', ') || '-');
}

/* ===========================================================================
 * วัดความเร็ว — รอบนี้วัดอย่างเดียว ไม่แก้อะไรเพื่อให้เร็วขึ้น
 * =========================================================================== */

/** จำนวนครั้งที่วัดแต่ละรายการ */
var BENCH_TIMES = 5;

/** เวลาพักระหว่างสองรอบ (มิลลิวินาที) — ใช้ดูว่าเป็นอาการเครื่องเย็นหรือไม่ */
var BENCH_REST_MS = 60000;

/**
 * รายการที่จะวัด เรียงตามลำดับที่อ่านแล้วเข้าใจว่าแต่ละบรรทัดเพิ่มอะไรจากบรรทัดก่อน
 *
 * ลำดับนี้สำคัญ เพราะสิ่งที่ตอบคำถามไม่ใช่ตัวเลขใดตัวเลขหนึ่ง แต่เป็น **ส่วนต่าง**
 * ระหว่างบรรทัดที่ติดกัน · เวลารวม 1,105 ms เป็นของใครบอกไม่ได้จนกว่าจะแยกชั้นออกมา
 */
var BENCH_STEPS = [
  { kind: 'BASELINE', label: '1. พื้นฐานของ UrlFetchApp (ไม่เกี่ยวกับ Supabase)' },
  { kind: 'ROOT',     label: '2. Supabase แบบไม่แตะตาราง (GET /rest/v1/)' },
  { kind: 'SMALL',    label: '3. อ่านตารางเล็ก (counter limit 1)' },
  { kind: 'INDEXED',  label: '4. อ่านตารางใหญ่ด้วย index (customer 1 แถว)' },
  { kind: 'PARALLEL', label: '5. fetchAll 6 คำขอพร้อมกัน' },
  { kind: 'SERIAL',   label: '6. ยิง 6 คำขอเรียงกันทีละอัน' }
];

/**
 * วัดว่าเวลาที่เสียไปเป็นของชั้นไหน แล้วพิมพ์ผลลง Execution log
 *
 * **ไม่แก้อะไรทั้งสิ้น** เป็นการวัดล้วน ๆ · เหตุผลคือยังไม่รู้ว่าเวลาที่เห็นเป็นของใคร
 * ระหว่างต้นทุนคงที่ของ Apps Script เอง · ระยะทางไปยังภูมิภาคของโปรเจกต์ ·
 * หรือตัวฐานข้อมูล · การแก้ก่อนรู้คำตอบมีโอกาสถูกหนึ่งในสาม และจะกลบหลักฐานทิ้งด้วย
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function benchmarkDb() {
  assertDataAccessAllowed_();

  var lines = ['===== วัดความเร็วของ Supabase (วัดอย่างเดียว ไม่แก้อะไร) ====='];

  if (!dbIsConfigured_()) {
    lines.push('  ยังไม่ได้ตั้งค่า SUPABASE_URL หรือ SUPABASE_SERVICE_KEY');
    Logger.log(lines.join(NEW_LINE_));
    return 'ยังตั้งค่าไม่ครบ';
  }

  var sample = benchSampleCustomerCode_(lines);
  benchRegion_(lines);

  var first = benchRound_(lines, 'รอบที่ 1', sample);

  lines.push('');
  lines.push('  พัก ' + Math.round(BENCH_REST_MS / 1000) + ' วินาทีแล้ววัดอีกรอบ...');
  Utilities.sleep(BENCH_REST_MS);

  var second = benchRound_(lines, 'รอบที่ 2 (หลังพัก 1 นาที)', sample);
  benchCompareRounds_(lines, first, second);

  Logger.log(lines.join(NEW_LINE_));
  return 'วัดเสร็จแล้ว — ดูผลใน Execution log';
}

/**
 * รหัสลูกค้าที่มีอยู่จริงสักตัว สำหรับวัดการอ่านตารางใหญ่ด้วย index
 *
 * ต้องเป็นรหัสที่มีอยู่จริง ไม่ใช่รหัสสมมติ เพราะการค้นหาที่ไม่เจอกับที่เจอ
 * เดินทางคนละเส้นใน Postgres และให้ตัวเลขคนละแบบ
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @return {string} รหัสลูกค้า (ว่างเมื่อหาไม่ได้)
 */
function benchSampleCustomerCode_(lines) {
  try {
    var rows = db_select_('Customer', { select: ['รหัสลูกค้า'], limit: 1 });
    if (rows.length) return String(rows[0]['รหัสลูกค้า']);
  } catch (e) {
    lines.push('  ! อ่านรหัสลูกค้าตัวอย่างไม่ได้ จึงข้ามการวัดข้อ 4');
  }
  return '';
}

/**
 * ภูมิภาคของโปรเจกต์ — พิมพ์ header ทุกตัวที่ได้รับออกมาตรง ๆ
 *
 * ถ้าโปรเจกต์ไม่ได้อยู่สิงคโปร์ นั่นคือคำตอบของทั้งเรื่อง และแก้ได้ทางเดียวคือ
 * สร้างโปรเจกต์ใหม่ในภูมิภาคที่ถูก · **ย้ายภูมิภาคทีหลังไม่ได้**
 *
 * พิมพ์ทุก header ออกมาแทนที่จะเลือกมาเฉพาะตัวที่คิดว่าใช่ เพราะชื่อ header
 * ที่บอกภูมิภาคไม่คงที่ระหว่างรุ่นของ Supabase และการเดาผิดจะได้รายงานว่างเปล่า
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 */
function benchRegion_(lines) {
  lines.push('');
  lines.push('########## ภูมิภาคของโปรเจกต์ ##########');

  var probe = db_probeTiming_('ROOT');
  if (!probe.status) {
    lines.push('  อ่านไม่ได้: ' + (probe.note || 'ต่อไม่ติด'));
    return;
  }

  lines.push('  header ทั้งหมดที่ Supabase ส่งกลับมา:');
  var names = [];
  for (var name in probe.headers) {
    if (Object.prototype.hasOwnProperty.call(probe.headers, name)) names.push(name);
  }
  names.sort();
  for (var i = 0; i < names.length; i++) {
    lines.push('    ' + names[i] + ': ' + String(probe.headers[names[i]]).substring(0, 200));
  }

  /*
   * cf-ray ลงท้ายด้วยรหัสศูนย์ข้อมูลของ Cloudflare สามตัวอักษร เช่น SIN คือสิงคโปร์
   * ตัวนี้บอกว่าคำขอเข้าเครือข่ายที่ไหน ซึ่งใกล้เคียงกับที่ตั้งของโปรเจกต์พอจะใช้ตัดสินได้
   */
  var ray = String(probe.headers['cf-ray'] || '');
  var dash = ray.lastIndexOf('-');
  if (dash !== -1) {
    var colo = ray.substring(dash + 1);
    lines.push('');
    lines.push('  รหัสศูนย์ข้อมูลจาก cf-ray: ' + colo +
      (colo === 'SIN' ? ' — สิงคโปร์ ตามที่ควรเป็น' : ' — **ไม่ใช่ SIN (สิงคโปร์)**'));
    if (colo !== 'SIN') {
      lines.push('  ถ้าโปรเจกต์ไม่ได้อยู่สิงคโปร์ นี่คือสาเหตุของเวลาที่เสียไป');
      lines.push('  และแก้ได้ทางเดียวคือสร้างโปรเจกต์ใหม่ในภูมิภาคที่ถูก ย้ายทีหลังไม่ได้');
    }
  }
}

/**
 * วัดหนึ่งรอบครบทุกรายการ
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {string} title ชื่อรอบ
 * @param {string} sample รหัสลูกค้าที่มีอยู่จริง
 * @return {Object} ค่ามัธยฐานของแต่ละรายการ
 */
function benchRound_(lines, title, sample) {
  lines.push('');
  lines.push('########## ' + title + ' ##########');
  lines.push('  ' + benchPad_('รายการ', 52) + benchPad_('มัธยฐาน', 12) + 'ทุกครั้งที่วัด (ms)');

  var medians = {};

  for (var s = 0; s < BENCH_STEPS.length; s++) {
    var step = BENCH_STEPS[s];
    if (step.kind === 'INDEXED' && !sample) continue;

    var samples = [];
    var status = 0;
    var note = '';
    for (var i = 0; i < BENCH_TIMES; i++) {
      var got = db_probeTiming_(step.kind, sample);
      samples.push(got.ms);
      status = got.status;
      if (got.note) note = got.note;
    }

    var median = benchMedian_(samples);
    medians[step.kind] = median;

    lines.push('  ' + benchPad_(step.label, 52) + benchPad_(String(median), 12) +
      samples.join(' / ') + (status && status >= 400 ? ('  [รหัส ' + status + ']') : '') +
      (note ? ('  [' + note + ']') : ''));
  }

  benchExplain_(lines, medians);
  return medians;
}

/**
 * แปลส่วนต่างระหว่างบรรทัดให้เป็นคำตอบว่าเวลาหายไปที่ชั้นไหน
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} m ค่ามัธยฐานของแต่ละรายการ
 */
function benchExplain_(lines, m) {
  lines.push('');

  if (m.BASELINE !== undefined && m.ROOT !== undefined) {
    var trip = m.ROOT - m.BASELINE;
    lines.push('  ส่วนต่าง ข้อ 2 − ข้อ 1 = ' + trip + ' ms');
    lines.push('    = เวลาเดินทางไป-กลับถึง Supabase จริง ๆ · ส่วนที่เหลือ ' + m.BASELINE +
      ' ms เป็นต้นทุนของ Apps Script เองที่หนีไม่พ้น');
  }
  if (m.ROOT !== undefined && m.SMALL !== undefined) {
    lines.push('  ส่วนต่าง ข้อ 3 − ข้อ 2 = ' + (m.SMALL - m.ROOT) + ' ms = เวลาที่ฐานข้อมูลใช้อ่านตารางเล็ก');
  }
  if (m.SMALL !== undefined && m.INDEXED !== undefined) {
    lines.push('  ส่วนต่าง ข้อ 4 − ข้อ 3 = ' + (m.INDEXED - m.SMALL) +
      ' ms = ราคาของการค้นตารางใหญ่ผ่าน index (ควรใกล้ศูนย์)');
  }

  if (m.PARALLEL !== undefined && m.SERIAL !== undefined) {
    lines.push('');
    lines.push('  ยิงพร้อมกัน 6 คำขอ = ' + m.PARALLEL + ' ms · ยิงเรียงกัน 6 คำขอ = ' + m.SERIAL + ' ms');

    var saved = m.SERIAL - m.PARALLEL;
    var ratio = m.PARALLEL ? (m.SERIAL / m.PARALLEL) : 0;
    lines.push('    ประหยัดได้ ' + saved + ' ms ต่อการเปิดหน้าหนึ่งครั้ง (เร็วขึ้น ' +
      ratio.toFixed(1) + ' เท่า)');

    /*
     * ตัวเลขคู่นี้เป็นตัวตัดสินสถาปัตยกรรม ถ้ายิงพร้อมกัน 6 อันใช้เวลาใกล้เคียงกับ 1 อัน
     * แปลว่าการรวมทุกอย่างที่หน้าหนึ่งต้องใช้ไว้ในคำขอเดียว (bootstrap) คุ้มมาก
     * และการแยกเป็นหลายคำขอเล็ก ๆ จะแพงเท่ากับจำนวนคำขอ ไม่ใช่เท่ากับปริมาณข้อมูล
     */
    if (m.SMALL !== undefined && m.PARALLEL < m.SMALL * 2) {
      lines.push('    สรุป: ยิง 6 อันพร้อมกันแพงพอ ๆ กับยิงอันเดียว — การรวมทุกอย่าง');
      lines.push('    ที่หน้าหนึ่งต้องใช้ไว้ในคำขอเดียวคุ้มมาก และต้องทำตั้งแต่ต้น');
    }
  }
}

/**
 * เทียบสองรอบ เพื่อแยกอาการเครื่องเย็นออกจากปัญหาเครือข่าย
 *
 * แผนฟรีของ Supabase หยุดเครื่องเมื่อไม่มีการใช้งาน ทำให้คำขอแรก ๆ ช้ากว่าปกติมาก
 * ถ้ารอบสองเร็วกว่าชัดเจน แปลว่าที่เห็นตอนแรกคืออาการเครื่องเย็น ไม่ใช่ระยะทาง
 * สองอย่างนี้แก้คนละวิธีสิ้นเชิง — อย่างหนึ่งแก้ด้วยการอุ่นเครื่องไว้ อีกอย่างแก้ไม่ได้เลย
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} first ค่ามัธยฐานรอบแรก
 * @param {Object} second ค่ามัธยฐานรอบสอง
 */
function benchCompareRounds_(lines, first, second) {
  lines.push('');
  lines.push('########## เทียบสองรอบ — เครื่องเย็นหรือระยะทาง ##########');
  lines.push('  ' + benchPad_('รายการ', 52) + benchPad_('รอบ 1', 10) + benchPad_('รอบ 2', 10) + 'ต่างกัน');

  var biggestDrop = 0;
  var biggestPercent = 0;
  for (var s = 0; s < BENCH_STEPS.length; s++) {
    var kind = BENCH_STEPS[s].kind;
    if (first[kind] === undefined || second[kind] === undefined) continue;

    var diff = second[kind] - first[kind];

    /*
     * ดูทั้งจำนวนมิลลิวินาทีและสัดส่วน เพราะเกณฑ์ที่ใช้ตัวเลขดิบอย่างเดียวจะพลาด
     * เมื่อค่าตั้งต้นต่ำ — ลดจาก 40 เหลือ 18 ms คือเร็วขึ้นกว่าครึ่ง แต่เป็นแค่ 22 ms
     */
    if (kind !== 'BASELINE' && -diff > biggestDrop) {
      biggestDrop = -diff;
      biggestPercent = first[kind] ? Math.round(-diff * 100 / first[kind]) : 0;
    }

    lines.push('  ' + benchPad_(BENCH_STEPS[s].label, 52) +
      benchPad_(String(first[kind]), 10) + benchPad_(String(second[kind]), 10) +
      (diff > 0 ? '+' : '') + diff + ' ms');
  }

  lines.push('');
  if (biggestPercent >= 25 && biggestDrop >= 80) {
    lines.push('  รอบสองเร็วกว่าชัดเจน (เร็วขึ้นถึง ' + biggestDrop + ' ms = ' + biggestPercent + '%)');
    lines.push('  = อาการเครื่องเย็นของแผนฟรี ไม่ใช่ปัญหาเครือข่าย');
    lines.push('  ตัวเลขที่ควรใช้ตัดสินใจคือรอบสอง ส่วนผู้ใช้คนแรกของวันจะเจอรอบแรก');
  } else {
    lines.push('  สองรอบใกล้เคียงกัน = ไม่ใช่อาการเครื่องเย็น');
    lines.push('  เวลาที่เห็นเป็นของระยะทางกับต้นทุนคงที่ ซึ่งคงที่ทั้งวัน');
  }
}

/**
 * ค่ามัธยฐาน — ใช้แทนค่าเฉลี่ยเพราะครั้งแรกช้าเสมอและจะดึงค่าเฉลี่ยให้เพี้ยน
 * @param {number[]} values ค่าที่วัดได้
 * @return {number}
 */
function benchMedian_(values) {
  var sorted = values.slice().sort(function (a, b) { return a - b; });
  if (!sorted.length) return 0;

  var middle = Math.floor(sorted.length / 2);
  return (sorted.length % 2) ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/**
 * เติมช่องว่างให้คอลัมน์ในรายงานตรงกัน
 * @param {string} text ข้อความ
 * @param {number} width ความกว้าง
 * @return {string}
 */
function benchPad_(text, width) {
  var out = String(text);
  while (out.length < width) out += ' ';
  // ต้องมีช่องว่างอย่างน้อยหนึ่งตัวเสมอ ไม่งั้นข้อความที่ยาวเกินช่องจะติดกับคอลัมน์ถัดไป
  return (out.length === String(text).length) ? (out + ' ') : out;
}

/* ===========================================================================
 * ย้ายชุด A — ห้าตารางข้อมูลตั้งต้น จากชีตเข้า Supabase (SPEC 22.4)
 * =========================================================================== */

/**
 * ตารางของชุด A ที่ต้องย้ายข้อมูล
 *
 * Customer ไม่อยู่ในรายการ เพราะต้นทางอยู่นอกระบบและผู้ดูแลนำเข้าเองแล้ว (SPEC 22.8)
 * ระบบนี้อ่านอย่างเดียว และห้ามเขียนทับไม่ว่ากรณีใด
 */
var MIGRATE_SET_A = Object.freeze([
  'Report_Master', 'Request_Type', 'Attachment_Topic', 'Task_Step_Template', 'Notify_Channel'
]);

/**
 * คอลัมน์ที่ต้องแปลงชนิดก่อนส่งเข้า Postgres
 *
 * ชีตเก็บ "TRUE" กับ true ปนกัน และเก็บตัวเลขเป็นข้อความได้ · Postgres ไม่ยอม
 * และจะปฏิเสธทั้งแถว · ที่สำคัญกว่าคือกฎช่องว่างของคอลัมน์จริง/เท็จมีสองแบบ
 * และสลับกันไม่ได้ (กฎข้อ 25) — รายการนี้คือที่เดียวที่บอกว่าคอลัมน์ไหนใช้กฎไหน
 */
var MIGRATE_TYPES = Object.freeze({
  // ช่องว่าง = ใช้งานอยู่
  'Active':   'activeBoolean',
  // ช่องว่าง = ไม่
  'Required': 'plainBoolean',
  'Multiple': 'plainBoolean',
  'Must_Change_Password': 'plainBoolean',
  // ตัวเลข · ช่องว่างเป็น null ไม่ใช่ศูนย์ เพราะศูนย์เป็นค่าที่มีความหมายของตัวเอง
  'Sort_Order': 'number',
  'Step_No':    'number',
  'Chat_ID':    'number',
  'Thread_ID':  'number',
  /*
   * ตัวนับที่ช่องว่างแปลว่าศูนย์ ไม่ใช่ "ไม่รู้"
   *
   * ต้องแยกจาก 'number' ข้างบน เพราะสองอย่างนี้ต่างกันจริงในผลลัพธ์ · Failed_Count
   * ที่เป็น null จะทำให้ `Number(row['Failed_Count'] || 0) + 1` ยังทำงานได้ก็จริง
   * แต่คอลัมน์ในฐานข้อมูลประกาศเป็น NOT NULL DEFAULT 0 การส่ง null ไปจะถูกปฏิเสธ
   * ทั้งแถว แล้วผู้ใช้คนนั้นจะหายไปจากการย้ายโดยที่แถวอื่นผ่านหมด
   */
  'Failed_Count': 'zeroNumber'
});

/**
 * ย้ายข้อมูลชุด A จากชีตเข้า Supabase
 *
 * อ่านชีตตรง ๆ ไม่ผ่าน readAll_ เพราะแท็บเหล่านี้ถูกสลับให้อ่านจาก Supabase แล้ว
 * (ดู DB_MIGRATED_SHEETS) การอ่านผ่านทางปกติจึงจะได้ปลายทาง ไม่ใช่ต้นทาง
 *
 * ใช้ upsert ไม่ใช่ insert เพื่อให้รันซ้ำได้โดยไม่ล้มเพราะคีย์ซ้ำ · การย้ายที่รันซ้ำ
 * ไม่ได้คือการย้ายที่ต้องทำถูกตั้งแต่ครั้งแรก ซึ่งไม่ใช่สิ่งที่ควรเดิมพัน
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function migrateSetA() {
  assertDataAccessAllowed_();

  var lines = ['===== ย้ายชุด A เข้า Supabase (SPEC 22.4) ====='];

  if (!dbIsConfigured_()) {
    lines.push('  ยังไม่ได้ตั้งค่า Supabase — รัน checkSupabase ก่อน');
    Logger.log(lines.join(NEW_LINE_));
    return 'ยังตั้งค่าไม่ครบ';
  }

  for (var i = 0; i < MIGRATE_SET_A.length; i++) {
    migrateOneTable_(lines, MIGRATE_SET_A[i]);
  }

  lines.push('');
  lines.push('  Customer ไม่ต้องย้าย — ต้นทางอยู่นอกระบบและนำเข้าไว้แล้ว (SPEC 22.8)');
  lines.push('  ขั้นต่อไป: รัน verifySetA() เพื่อเทียบข้อมูลสองฝั่ง');

  Logger.log(lines.join(NEW_LINE_));
  return 'ย้ายเสร็จแล้ว — ดูผลใน Execution log';
}

/**
 * ย้ายตารางเดียว
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {string} tableKey ชื่อตารางในระบบ
 */
function migrateOneTable_(lines, tableKey) {
  lines.push('');
  lines.push('--- ' + tableKey + ' ---');

  var rows = migrateReadSheetRows_(tableKey);
  if (!rows.length) {
    lines.push('  ไม่มีแถวในชีต จึงไม่มีอะไรให้ย้าย');
    return;
  }

  try {
    var written = db_upsert_(tableKey, rows);
    lines.push('  ย้าย ' + rows.length + ' แถว · ฐานข้อมูลรับไว้ ' + written.length + ' แถว');
  } catch (e) {
    lines.push('  ย้ายไม่สำเร็จ: ' + (e && e.message));
    lines.push('  สาเหตุจริง: ' + db_lastFailure_().detail);
  }
}

/**
 * อ่านแถวจากชีตตรง ๆ แล้วแปลงชนิดให้พร้อมส่งเข้า Postgres
 *
 * @param {string} tableKey ชื่อตารางในระบบ ซึ่งเป็นชื่อเดียวกับชื่อแท็บ
 * @return {Object[]} แถวที่แปลงชนิดแล้ว คีย์เป็นชื่อเดิมของระบบ
 */
function migrateReadSheetRows_(tableKey) {
  var values = getSheet_(tableKey).getDataRange().getValues();
  if (values.length < 2) return [];

  var sheetHeader = normalizeHeader_(values[0]);
  var wanted = dbColumnMap_(tableKey).systemNames;
  var out = [];

  for (var r = 1; r < values.length; r++) {
    if (isBlankRow_(values[r])) continue;

    var row = {};
    for (var c = 0; c < wanted.length; c++) {
      var at = sheetHeader.indexOf(wanted[c]);
      // คอลัมน์ที่ฐานข้อมูลมีแต่ชีตไม่มี ปล่อยให้ค่า DEFAULT ของฐานข้อมูลทำงาน
      if (at === -1) continue;
      row[wanted[c]] = migrateCoerce_(wanted[c], values[r][at]);
    }
    out.push(row);
  }
  return out;
}

/**
 * แปลงค่าหนึ่งค่าให้ตรงกับชนิดของคอลัมน์ปลายทาง (กฎข้อ 25)
 * @param {string} column ชื่อคอลัมน์ในระบบ
 * @param {*} value ค่าที่อ่านมาจากชีต
 * @return {*}
 */
function migrateCoerce_(column, value) {
  var kind = MIGRATE_TYPES[column];

  if (kind === 'activeBoolean') return isTruthyCell_(value);   // ช่องว่าง = ใช้งานอยู่
  if (kind === 'plainBoolean')  return cellToBoolean_(value);  // ช่องว่าง = ไม่

  if (kind === 'number') {
    if (value === '' || value === null || value === undefined) return null;
    var number = Number(value);
    return isNaN(number) ? null : number;
  }

  if (kind === 'zeroNumber') {
    if (value === '' || value === null || value === undefined) return 0;
    var counted = Number(value);
    return isNaN(counted) ? 0 : counted;
  }

  /*
   * คอลัมน์เวลา: ช่องว่างต้องเป็น null ไม่ใช่ข้อความว่าง
   *
   * Postgres ปฏิเสธ '' สำหรับ timestamptz ทั้งแถว ด้วยข้อความที่ชี้ไปที่ชนิดของค่า
   * ไม่ใช่ที่คอลัมน์ · Locked_Until ของผู้ใช้ที่ไม่เคยถูกล็อกคือช่องว่างทุกคน
   * ซึ่งแปลว่าถ้าไม่มีบรรทัดนี้ การย้ายทะเบียนผู้ใช้จะล้มทั้งชุดตั้งแต่แถวแรก
   *
   * อ่านรายชื่อจาก DB_TIMESTAMP_COLUMNS ตัวเดียวกับที่ fromDb_ ใช้ตอนแปลงขากลับ
   * สองทางจึงใช้คำจำกัดความเดียวกันเสมอ ไม่มีวันเถียงกันเอง
   */
  if (isTimestampColumn_(column)) {
    if (value === '' || value === null || value === undefined) return null;
    return (value instanceof Date) ? value.toISOString() : String(value);
  }

  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return value;
}

/* ===========================================================================
 * เทียบสองฝั่งหลังย้าย
 * =========================================================================== */

/** จำนวนแถวที่สุ่มมาเทียบทีละฟิลด์ต่อหนึ่งตาราง */
var VERIFY_SAMPLE_ROWS = 3;

/**
 * เทียบข้อมูลในชีตกับในฐานข้อมูลหลังย้าย
 *
 * เทียบสองระดับ เพราะสองระดับนี้จับคนละอย่าง · จำนวนแถวจับ "แถวหาย" ซึ่งเห็นง่าย
 * ส่วนการเทียบทีละฟิลด์จับ "ค่าเพี้ยน" ซึ่งเห็นยากกว่ามากและอันตรายกว่า —
 * โดยเฉพาะคอลัมน์จริง/เท็จที่ถ้าแปลงผิดกฎ จะได้ค่าที่ดูสมเหตุสมผลทุกแถว
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function verifySetA() {
  assertDataAccessAllowed_();

  var lines = ['===== เทียบข้อมูลชุด A ระหว่างชีตกับฐานข้อมูล ====='];
  var problems = 0;

  for (var i = 0; i < MIGRATE_SET_A.length; i++) {
    problems += verifyOneTable_(lines, MIGRATE_SET_A[i]);
  }

  /* ---------- Customer เทียบคนละแบบ เพราะต้นทางอยู่นอกระบบ ---------- */
  lines.push('');
  lines.push('--- Customer ---');
  try {
    lines.push('  ในฐานข้อมูล: ' + db_count_('Customer') + ' แถว');
    lines.push('  ไม่เทียบกับชีต เพราะต้นทางคือโปรแกรมบัญชี ไม่ใช่ชีต (SPEC 22.8)');
    lines.push('  สภาพของตารางนี้ดูได้จากหัวข้อ 6 ของ checkSupabase');
  } catch (e) {
    problems++;
    lines.push('  อ่านไม่ได้: ' + db_lastFailure_().detail);
  }

  lines.push('');
  lines.push(problems
    ? ('########## พบปัญหา ' + problems + ' จุด — ห้ามถือว่าย้ายสำเร็จ ##########')
    : '########## ตรงกันทุกตารางที่เทียบได้ ##########');

  Logger.log(lines.join(NEW_LINE_));
  return problems ? ('พบปัญหา ' + problems + ' จุด — ดู Execution log') : 'ตรงกันทั้งหมด';
}

/**
 * เทียบตารางเดียว
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {string} tableKey ชื่อตารางในระบบ
 * @return {number} จำนวนปัญหาที่พบ
 */
function verifyOneTable_(lines, tableKey) {
  lines.push('');
  lines.push('--- ' + tableKey + ' ---');

  var sheetRows = migrateReadSheetRows_(tableKey);
  var dbRows;
  try {
    dbRows = db_select_(tableKey, {});
  } catch (e) {
    lines.push('  อ่านจากฐานข้อมูลไม่ได้: ' + db_lastFailure_().detail);
    return 1;
  }

  var problems = 0;
  lines.push('  จำนวนแถว — ชีต ' + sheetRows.length + ' · ฐานข้อมูล ' + dbRows.length);
  if (sheetRows.length !== dbRows.length) {
    problems++;
    lines.push('  !! จำนวนไม่ตรงกัน');
  }

  /* ---------- สุ่มเทียบทีละฟิลด์ ---------- */
  var keyField = dbColumnMap_(tableKey).systemNames[0];
  var byKey = {};
  for (var d = 0; d < dbRows.length; d++) byKey[String(dbRows[d][keyField])] = dbRows[d];

  var step = Math.max(1, Math.floor(sheetRows.length / VERIFY_SAMPLE_ROWS));
  var checked = 0;

  for (var s = 0; s < sheetRows.length && checked < VERIFY_SAMPLE_ROWS; s += step) {
    var sheetRow = sheetRows[s];
    var key = String(sheetRow[keyField]);
    var dbRow = byKey[key];
    checked++;

    if (!dbRow) {
      problems++;
      lines.push('  !! ' + key + ': ไม่มีในฐานข้อมูล');
      continue;
    }

    var wrong = [];
    for (var field in sheetRow) {
      if (!Object.prototype.hasOwnProperty.call(sheetRow, field)) continue;
      if (!verifySameValue_(sheetRow[field], dbRow[field])) {
        wrong.push(field + ': ชีต=' + verifyShow_(sheetRow[field]) +
          ' ฐานข้อมูล=' + verifyShow_(dbRow[field]));
      }
    }

    if (wrong.length) {
      problems++;
      lines.push('  !! ' + key + ' ต่างกัน ' + wrong.length + ' ฟิลด์: ' + wrong.join(' · '));
    } else {
      lines.push('  ' + key + ': ตรงกันทุกฟิลด์');
    }
  }
  return problems;
}

/**
 * สองค่านี้ถือว่าเท่ากันไหม
 *
 * ค่าว่างกับ null ถือว่าเท่ากัน เพราะชีตไม่มี null ส่วน Postgres ไม่มีช่องว่าง
 * นอกนั้นเทียบตรง ๆ รวมทั้งชนิด เพราะ true กับ "TRUE" ต่างกันจริงในเรื่องนี้
 *
 * @param {*} fromSheet ค่าที่แปลงมาจากชีต
 * @param {*} fromDb ค่าที่อ่านกลับมาจากฐานข้อมูล
 * @return {boolean}
 */
function verifySameValue_(fromSheet, fromDb) {
  var blankSheet = (fromSheet === '' || fromSheet === null || fromSheet === undefined);
  var blankDb = (fromDb === '' || fromDb === null || fromDb === undefined);
  if (blankSheet && blankDb) return true;
  if (blankSheet !== blankDb) return false;

  if (typeof fromSheet === 'boolean' || typeof fromDb === 'boolean') return fromSheet === fromDb;
  if (typeof fromSheet === 'number' || typeof fromDb === 'number') {
    return Number(fromSheet) === Number(fromDb);
  }
  return String(fromSheet) === String(fromDb);
}

/**
 * ค่าที่อ่านง่ายพร้อมชนิด — ชนิดสำคัญพอ ๆ กับค่าในเรื่องนี้
 * @param {*} value ค่า
 * @return {string}
 */
function verifyShow_(value) {
  if (value === null) return '(null)';
  if (value === undefined) return '(ไม่มีคอลัมน์)';
  if (value === '') return '""';
  return String(value) + '(' + typeof value + ')';
}

/* ===========================================================================
 * ย้ายทะเบียนผู้ใช้ และทางกลับเข้าระบบเมื่อไม่มีใครล็อกอินได้
 *
 * เรื่องนี้เกิดขึ้นจริงแล้วครั้งหนึ่ง: ชุด B ย้าย **โค้ด** ของ User_Role ไป Supabase
 * แต่ไม่มีใครย้าย **ข้อมูล** 7 แถวตามไป · ตารางในฐานข้อมูลจึงว่างเปล่า และทุกคน
 * ล็อกอินไม่ได้พร้อมกันทั้งระบบ
 *
 * ที่น่ากลัวกว่าคือไม่มีอะไรจับได้เลย ทั้งที่ชุดทดสอบเขียว 3,770 ข้อ — เพราะเทสต์
 * สร้างผู้ใช้ของตัวเองทุกครั้งตามกฎข้อมูลทดสอบ จึงไม่เคยพึ่งแถวจริงสักแถว
 * เทสต์ที่ดีจึงพิสูจน์ได้แค่ว่า "โค้ดทำงานถูก" ไม่ได้พิสูจน์ว่า "ข้อมูลตามไปด้วย"
 * ช่องว่างนั้นปิดด้วย verifyAllMigratedData() ที่อยู่ท้ายไฟล์นี้
 * =========================================================================== */

/**
 * ย้ายทะเบียนผู้ใช้จากชีตเข้า Supabase โดยคงรหัสผ่านเดิมไว้ทุกคน
 *
 * **ห้ามแฮชใหม่และห้ามแตะ Password_Hash กับ Password_Salt เลย** สองช่องนี้ต้อง
 * เดินทางไปถึงปลายทางเป็นตัวอักษรเดิมเป๊ะ · ค่าที่ถูกต้องเขียนด้วยมือไม่ได้ เพราะ
 * มันคือผลของการวน SHA-256 หลายพันรอบกับเกลือที่สุ่มต่อคน (ดู 07_Auth.gs)
 * ถ้าค่าเพี้ยนไปแม้แต่ตัวเดียว รหัสผ่านเดิมของคนนั้นจะใช้ไม่ได้อีกเลย
 * และอาการที่เห็นคือ "รหัสผ่านไม่ถูกต้อง" ซึ่งไม่ชี้ไปที่สาเหตุจริงเลยสักนิด
 *
 * ใช้ upsert เหมือน migrateSetA() เพื่อให้รันซ้ำได้ · การย้ายที่รันซ้ำไม่ได้
 * คือการย้ายที่ต้องทำถูกตั้งแต่ครั้งแรก ซึ่งไม่ใช่สิ่งที่ควรเดิมพันกับการล็อกอิน
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function migrateUserRoleFromSheet() {
  assertDataAccessAllowed_();

  var lines = ['===== ย้ายทะเบียนผู้ใช้จากชีตเข้า Supabase ====='];

  if (!dbIsConfigured_()) {
    lines.push('  ยังไม่ได้ตั้งค่า Supabase — รัน checkSupabase ก่อน');
    Logger.log(lines.join(NEW_LINE_));
    return 'ยังตั้งค่าไม่ครบ';
  }

  var rows;
  try {
    rows = migrateReadSheetRows_(SHEET.USER_ROLE);
  } catch (e) {
    lines.push('  อ่านแท็บ User_Role จากชีตไม่ได้: ' + userFacingMessage_(e));
    lines.push('  ถ้าแท็บถูกลบไปแล้ว ทางเดียวที่เหลือคือ createAdminUser()');
    Logger.log(lines.join(NEW_LINE_));
    return 'อ่านชีตไม่ได้ — ดู Execution log';
  }

  lines.push('');
  lines.push('  อ่านจากชีตได้ ' + rows.length + ' แถว');

  if (!rows.length) {
    lines.push('');
    lines.push('  ชีตไม่มีข้อมูลผู้ใช้แล้ว จึงไม่มีอะไรให้ย้าย');
    lines.push('  ทางที่เหลือคือสร้างผู้ดูแลคนแรกด้วยมือ: createAdminUser(ชื่อผู้ใช้, อีเมล, ชื่อที่แสดง, รหัสชั่วคราว)');
    Logger.log(lines.join(NEW_LINE_));
    return 'ชีตว่าง — ใช้ createAdminUser() แทน';
  }

  var secretProblems = migrateCheckSecretShape_(lines, rows);

  /* ---------- ย้ายจริง ---------- */
  var written;
  try {
    written = db_upsert_(SHEET.USER_ROLE, rows);
  } catch (e) {
    lines.push('  ย้ายไม่สำเร็จ: ' + (e && e.message));
    lines.push('  สาเหตุจริง: ' + db_lastFailure_().detail);
    Logger.log(lines.join(NEW_LINE_));
    return 'ย้ายไม่สำเร็จ — ดู Execution log';
  }

  lines.push('  เขียนเข้าฐานข้อมูลได้ ' + written.length + ' แถว');
  if (written.length !== rows.length) {
    lines.push('  !! จำนวนไม่ตรงกัน — ฐานข้อมูลรับไว้ไม่ครบ');
  }

  /* ---------- ไล่เทียบทีละแถวจากสิ่งที่อ่านกลับมาจริง ---------- */
  dbInvalidate_(SHEET.USER_ROLE);
  clearRowCache_();

  var problems = migrateCompareUserRows_(lines, rows) + secretProblems +
    (written.length === rows.length ? 0 : 1);

  lines.push('');
  lines.push(problems
    ? ('########## พบปัญหา ' + problems + ' จุด — ห้ามถือว่าย้ายสำเร็จ ##########')
    : '########## ตรงกันทุกแถว · รหัสผ่านเดิมของทุกคนยังใช้ได้ ##########');

  Logger.log(lines.join(NEW_LINE_));
  return problems ? ('พบปัญหา ' + problems + ' จุด — ดู Execution log')
    : ('ย้ายผู้ใช้ ' + rows.length + ' คนเรียบร้อย — ดูรายละเอียดใน Execution log');
}

/**
 * ค่าความลับที่อ่านมาจากชีต ยังเป็นข้อความอยู่จริงหรือเปล่า
 *
 * Google Sheet แปลงชนิดให้เองตอนเขียน · เกลือเป็นเลขฐานสิบหก ซึ่งถ้าบังเอิญไม่มี
 * ตัวอักษร a-f ปนเลย ชีตจะเก็บเป็น **ตัวเลข** แล้วความแม่นยำจะหายไปตั้งแต่หลัก
 * ที่ 16 โดยไม่มีอะไรฟ้อง · คนนั้นจะล็อกอินไม่ได้ทั้งที่รหัสผ่านถูก
 *
 * ต้องดูก่อนย้าย ไม่ใช่หลัง เพราะหลังย้ายแล้วต้นทางกับปลายทางจะเพี้ยนตรงกันพอดี
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object[]} rows แถวที่อ่านมาจากชีต
 * @return {number} จำนวนปัญหาที่พบ
 */
function migrateCheckSecretShape_(lines, rows) {
  var fields = ['Password_Hash', 'Password_Salt'];
  var problems = 0;

  for (var r = 0; r < rows.length; r++) {
    for (var f = 0; f < fields.length; f++) {
      var value = rows[r][fields[f]];
      if (value === undefined) continue;
      if (typeof value === 'string' || value === '') continue;

      problems++;
      // ชื่อคอลัมน์กับชนิดเท่านั้น ห้ามให้ค่าจริงออกมาไม่ว่ากรณีใด (กฎข้อ 22)
      lines.push('  !! ' + migrateUserLabel_(rows[r]) + ' · ' + fields[f] +
        ' ไม่ใช่ข้อความ (ชนิด ' + (typeof value) + ') — ชีตแปลงค่าไปแล้ว ย้ายไปก็ล็อกอินไม่ได้');
    }
  }
  return problems;
}

/**
 * ไล่เทียบผู้ใช้ทีละแถวระหว่างชีตกับฐานข้อมูล
 *
 * เทียบสองชั้นด้วยเหตุผลคนละอย่าง · ช่องที่พิมพ์ออกมาได้ (ชื่อผู้ใช้ อีเมล บทบาท
 * แผนก Active) เทียบแล้วพิมพ์ค่าให้เห็นกับตา เพราะคนอ่านต้องยืนยันได้เองว่าคนครบ
 * ส่วนช่องรหัสผ่านเทียบว่า "ตรงกันไหม" แล้วรายงานแค่ผลกับความยาว — ซึ่งพิสูจน์ว่า
 * ค่าเดินทางครบตัวต่อตัว โดยไม่มีค่าจริงหลุดออกมาแม้แต่ตัวเดียว
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object[]} sheetRows แถวที่อ่านมาจากชีต
 * @return {number} จำนวนปัญหาที่พบ
 */
function migrateCompareUserRows_(lines, sheetRows) {
  lines.push('');
  lines.push('########## เทียบทีละแถว ##########');

  var dbRows;
  try {
    dbRows = db_select_(SHEET.USER_ROLE, {});
  } catch (e) {
    lines.push('  อ่านกลับจากฐานข้อมูลไม่ได้: ' + db_lastFailure_().detail);
    return 1;
  }

  var byEmail = {};
  for (var d = 0; d < dbRows.length; d++) {
    byEmail[String(dbRows[d]['Email'] || '').trim().toLowerCase()] = dbRows[d];
  }

  var shown = ['Username', 'Email', 'Role', 'Department', 'Active'];
  var secret = ['Password_Hash', 'Password_Salt'];
  var problems = 0;

  for (var s = 0; s < sheetRows.length; s++) {
    var sheetRow = sheetRows[s];
    var dbRow = byEmail[String(sheetRow['Email'] || '').trim().toLowerCase()];

    if (!dbRow) {
      problems++;
      lines.push('  !! ' + migrateUserLabel_(sheetRow) + ': ไม่มีในฐานข้อมูลหลังย้าย');
      continue;
    }

    var wrong = [];
    var seen = [];
    for (var i = 0; i < shown.length; i++) {
      var name = shown[i];
      seen.push(name + '=' + verifyShow_(dbRow[name]));
      if (!verifySameValue_(sheetRow[name], dbRow[name])) {
        wrong.push(name + ' (ชีต=' + verifyShow_(sheetRow[name]) +
          ' ฐานข้อมูล=' + verifyShow_(dbRow[name]) + ')');
      }
    }

    for (var k = 0; k < secret.length; k++) {
      var field = secret[k];
      var same = String(sheetRow[field] || '') === String(dbRow[field] || '');
      if (!same) wrong.push(field + ' ไม่ตรงกัน (ค่าไม่พิมพ์ออกมา)');
      seen.push(field + ' ' + (same ? 'ตรงกัน' : '!!ไม่ตรง') +
        ' ยาว ' + String(dbRow[field] || '').length + ' ตัวอักษร');
    }

    if (wrong.length) {
      problems++;
      lines.push('  !! ' + migrateUserLabel_(sheetRow) + ' ต่างกัน: ' + wrong.join(' · '));
    } else {
      lines.push('  ' + (s + 1) + '. ' + seen.join(' · '));
    }
  }

  lines.push('  จำนวนแถว — ชีต ' + sheetRows.length + ' · ฐานข้อมูล ' + dbRows.length);
  if (dbRows.length < sheetRows.length) {
    problems++;
    lines.push('  !! ฐานข้อมูลมีน้อยกว่าชีต');
  }
  return problems;
}

/**
 * ชื่อเรียกผู้ใช้ในรายงาน — ไม่มีอะไรที่เป็นความลับอยู่ในนี้เลย
 * @param {Object} row แถวผู้ใช้
 * @return {string}
 */
function migrateUserLabel_(row) {
  return String(row['Username'] || '(ไม่มีชื่อผู้ใช้)') + ' / ' + String(row['Email'] || '(ไม่มีอีเมล)');
}

/**
 * สร้างบัญชีผู้ดูแลด้วยมือ — ทางกลับเข้าระบบเมื่อไม่มีใครล็อกอินได้แล้ว
 *
 * **ตัวนี้ต้องอยู่ถาวร ไม่ใช่เครื่องมือของการย้ายครั้งนี้** ตราบใดที่ยังไม่มีหน้าจอ
 * จัดการผู้ใช้ (SPEC 23) วันไหนที่ทะเบียนผู้ใช้ว่าง เสียหาย หรือผู้ดูแลคนเดียว
 * ล็อกตัวเองออก นี่คือทางเดียวที่เหลือ · คนที่เปิดตัวแก้ไข Apps Script ได้คือ
 * เจ้าของระบบอยู่แล้ว จึงไม่ต้องมีด่านเพิ่ม
 *
 * ต่างจาก createFirstAdmin() ใน 07_Auth.gs ตรงที่ตัวนั้นปฏิเสธทันทีถ้ามี ADMIN
 * อยู่แล้ว ซึ่งถูกต้องสำหรับวันแรกของระบบ แต่ใช้ไม่ได้ในวันที่ตารางผู้ใช้ยังมีคนอยู่
 * แต่ไม่มีใครเข้าได้เลย · ตัวนี้จึงกันแค่การเขียนทับคนที่มีอยู่แล้วเท่านั้น
 *
 * **ใช้ฟังก์ชันแฮชตัวเดียวกับที่ระบบใช้ตอนตั้งรหัสผ่าน** ห้ามเขียนวิธีแฮชขึ้นใหม่
 * เด็ดขาด เพราะถ้าแฮชคนละวิธี รหัสจะตั้งได้แต่ล็อกอินไม่ผ่าน แล้วอาการที่เห็น
 * คือ "รหัสผ่านไม่ถูกต้อง" ซึ่งชี้ไปผิดทางทั้งหมดและหาสาเหตุยากมาก
 *
 * @param {string} username ชื่อผู้ใช้สำหรับล็อกอิน
 * @param {string} email อีเมล — เป็นคีย์หลักของ User_Role ไม่ต้องเป็นบัญชี Google
 * @param {string} displayName ชื่อที่แสดงบนหน้าจอ
 * @param {string} plainPassword รหัสชั่วคราว · **ค่านี้ไม่ถูกบันทึกหรือพิมพ์ที่ใดเลย**
 * @return {string} ข้อความสรุปสำหรับอ่านใน Execution log
 * @throws {Error} เมื่อชื่อผู้ใช้หรืออีเมลนี้มีอยู่แล้ว หรือรหัสสั้นเกินไป
 */
function createAdminUser(username, email, displayName, plainPassword) {
  assertDataAccessAllowed_();

  var wantedName = String(username || '').trim();
  var wantedEmail = String(email || '').trim();

  if (!wantedName || !wantedEmail) {
    throw new Error('ต้องระบุทั้งชื่อผู้ใช้และอีเมล — ฟังก์ชันนี้กดปุ่ม Run ตรง ๆ ไม่ได้');
  }

  // ด่านความแข็งแรงของรหัสผ่านตัวเดิมที่ทุกเส้นทางใช้ร่วมกัน ไม่ได้เขียนเงื่อนไขใหม่ที่นี่
  assertPasswordStrength_(plainPassword);

  /*
   * อ่านทะเบียนครั้งเดียวแล้วตรวจทั้งสองช่อง — Email เป็นคีย์หลักและ Username เป็น
   * unique ทั้งคู่ในฐานข้อมูล · ถ้าปล่อยให้ชนที่ชั้นฐานข้อมูล ข้อความที่ได้จะเป็น
   * ภาษาของ Postgres ซึ่งไม่ได้บอกว่าชนกับใคร และกฎข้อ 24 ก็ห้ามส่งต่อออกไปด้วย
   */
  var existing = listUserRoles(false);
  for (var i = 0; i < existing.length; i++) {
    var row = existing[i];
    if (String(row['Email'] || '').trim().toLowerCase() === wantedEmail.toLowerCase()) {
      throw new Error('มีผู้ใช้อีเมล ' + wantedEmail + ' อยู่แล้ว (ชื่อผู้ใช้ ' +
        String(row['Username'] || '') + ') — ถ้าต้องการตั้งรหัสใหม่ให้ใช้ resetPassword()');
    }
    if (String(row['Username'] || '').trim().toLowerCase() === wantedName.toLowerCase()) {
      throw new Error('ชื่อผู้ใช้ "' + wantedName + '" ถูกใช้ไปแล้ว — ถ้าต้องการตั้งรหัสใหม่ให้ใช้ resetPassword()');
    }
  }

  var salt = newPasswordSalt_();
  appendRow_(SHEET.USER_ROLE, {
    'Email':                wantedEmail,
    'Username':             wantedName,
    'Display_Name':         String(displayName || wantedName).trim(),
    'Role':                 ROLE.ADMIN,
    'Department':           '',
    'Password_Salt':        salt,
    'Password_Hash':        encodePasswordHash_(PASSWORD_ITERATIONS,
                              hashPassword_(plainPassword, salt, PASSWORD_ITERATIONS)),
    'Failed_Count':         0,
    'Must_Change_Password': true,
    'Active':               true
  });

  /*
   * ต้องทิ้งร่องรอยไว้ เพราะนี่คือทางเข้าที่สร้างผู้ดูแลได้โดยไม่ต้องผ่านผู้ดูแลคนไหนเลย
   * ประตูแบบนี้ไม่ควรเปิดได้เงียบ ๆ · บรรทัดนี้ไม่มีรหัสผ่านอยู่ในนั้น
   */
  writeAuthAudit_(ACTION.ADMIN_CREATED, wantedEmail, ROLE.ADMIN,
    'สร้างผู้ดูแลด้วยมือจากตัวแก้ไข Apps Script · ชื่อผู้ใช้ ' + wantedName);

  return 'สร้างผู้ดูแลแล้ว: ' + wantedName + ' (' + wantedEmail + ') · ' +
    'เข้าระบบครั้งแรกจะถูกบังคับให้เปลี่ยนรหัสทันที';
}

/* ===========================================================================
 * เทียบข้อมูลทุกตารางที่ย้ายแล้ว — ช่องว่างที่ทำให้ User_Role หายไปทั้งตาราง
 * =========================================================================== */

/**
 * ตารางที่จำนวนแถวสองฝั่ง **ตั้งใจ** ให้ต่างกัน พร้อมเหตุผลของแต่ละตัว
 *
 * ต้องประกาศไว้เป็นโค้ด ไม่ใช่ปล่อยให้รายงานดูเหมือนผิดแล้วให้คนอ่านจำเอาเองว่า
 * ตัวไหนไม่เป็นไร · รายงานที่มีบรรทัดแดงประจำที่ทุกครั้ง จะสอนให้คนอ่านข้ามบรรทัด
 * แดงทั้งหมด แล้ววันที่แดงจริงจะถูกข้ามไปด้วย
 *
 * **แต่ละคำประกาศถูกตรวจด้วยตัวมันเอง** ไม่ใช่แค่ปิดเสียง — `sheetMustBeEmpty`
 * แปลว่า "เราอ้างว่าชีตไม่มีอะไรค้าง" ซึ่งถ้าอ้างผิดจะแดงทันที · นั่นคือจุดที่
 * เรื่อง User_Role พลาดไป คือมีข้อมูลค้างอยู่ในชีตโดยไม่มีใครดู
 */
var VERIFY_EXPECTED_DIFF = Object.freeze({
  'Session_Token': {
    rule: 'sheetDiscarded',
    why: 'ตั้งใจให้เริ่มจากว่าง · โทเคนเก่าในชีตถูกทิ้ง ทุกคนล็อกอินใหม่ครั้งเดียวแล้วจบ'
  },
  'Customer': {
    rule: 'notFromSheet',
    why: 'ต้นทางคือโปรแกรมบัญชี ไม่ใช่ชีต (SPEC 22.8) · ระบบอ่านอย่างเดียว จึงไม่มีอะไรให้เทียบ'
  },
  'Counter': {
    rule: 'sheetMustBeEmpty',
    why: 'ไม่ได้ย้ายของเก่า ตารางเริ่มจากศูนย์แล้วสะสมเอง · แต่ถ้าชีตยังมีแถวค้าง ' +
      'แปลว่าเคยออกเลขไว้แล้วฐานข้อมูลกำลังจะนับใหม่ ซึ่งจะทำให้เลขใบงานซ้ำของเดิม'
  },
  'Audit_Log': {
    rule: 'sheetMustBeEmpty',
    why: 'บันทึกประวัติไม่ได้ย้ายของเก่า เริ่มสะสมใหม่ในฐานข้อมูล · แถวเก่าที่ค้างในชีต ' +
      'จะไม่มีที่ไหนในระบบอ่านเห็นอีกเลย จึงต้องรู้ว่ามีอยู่'
  },
  'System_Log': {
    rule: 'sheetMustBeEmpty',
    why: 'เหตุผลเดียวกับ Audit_Log'
  },
  'File_Index': {
    rule: 'sheetMustBeEmpty',
    why: 'ไม่ได้ย้ายของเก่า · แถวที่ค้างในชีตแปลว่ามีไฟล์ใน Drive ที่ระบบมองไม่เห็นแล้ว ' +
      'ซึ่งร้ายกว่าไฟล์หาย เพราะไฟล์ยังอยู่แต่ไม่มีทางเปิดจากหน้าเว็บ'
  }
});

/**
 * เทียบจำนวนแถวของทุกตารางที่ย้ายแล้ว ระหว่างชีตต้นทางกับฐานข้อมูลปลายทาง
 *
 * **นี่คือสิ่งเดียวที่จะจับ "ย้ายโค้ดแล้วแต่ลืมย้ายข้อมูล" ได้** ชุดทดสอบจับไม่ได้
 * โดยธรรมชาติ เพราะเทสต์สร้างข้อมูลของตัวเองทุกครั้งตามกฎ จึงไม่เคยแตะแถวจริง
 * ตารางที่ว่างเปล่าจึงผ่านทุกเทสต์ได้สบาย ๆ จนกว่าจะมีคนพยายามใช้งานจริง
 *
 * ชุด A มี verifySetA() ที่เทียบให้แล้ว แต่มันรู้จักแค่ห้าตารางของชุด A
 * ตัวนี้เดินจาก DB_MIGRATED_SHEETS ซึ่งเป็นรายชื่อจริงที่ระบบใช้ตัดสินใจ
 * ตารางที่ย้ายในอนาคตจึงถูกเทียบให้เองโดยไม่ต้องกลับมาแก้ที่นี่ (จุดตัดสินใจจุดเดียว)
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function verifyAllMigratedData() {
  assertDataAccessAllowed_();

  var lines = ['===== ข้อมูลครบทุกตารางที่ย้ายแล้วหรือยัง ====='];

  if (!dbIsConfigured_()) {
    lines.push('  ยังไม่ได้ตั้งค่า Supabase — รัน checkSupabase ก่อน');
    Logger.log(lines.join(NEW_LINE_));
    return 'ยังตั้งค่าไม่ครบ';
  }

  var problems = verifyMigratedRows_(lines);

  Logger.log(lines.join(NEW_LINE_));
  return problems ? ('พบปัญหา ' + problems + ' ตาราง — ดู Execution log')
    : 'ข้อมูลครบทุกตาราง';
}

/**
 * ตารางเทียบจำนวนแถวหนึ่งตาราง — ใช้ร่วมกันระหว่าง verifyAllMigratedData กับ checkSupabase
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @return {number} จำนวนตารางที่มีปัญหา
 */
function verifyMigratedRows_(lines) {
  lines.push('');
  lines.push('  ' + benchPad_('ตาราง', 20) + benchPad_('ในชีต', 10) +
    benchPad_('ในฐานข้อมูล', 14) + 'ตรงกันไหม');

  var problems = 0;
  var notes = [];

  for (var i = 0; i < DB_MIGRATED_SHEETS.length; i++) {
    var tableKey = DB_MIGRATED_SHEETS[i];
    var declared = VERIFY_EXPECTED_DIFF[tableKey] || null;
    var result = verifyOneRowCount_(tableKey, declared);

    lines.push('  ' + benchPad_(tableKey, 20) + benchPad_(result.sheetText, 10) +
      benchPad_(result.dbText, 14) + result.verdict);

    if (result.problem) problems++;
    if (declared) notes.push('  ' + tableKey + ': ' + declared.why);
  }

  if (notes.length) {
    lines.push('');
    lines.push('  ตารางที่ตั้งใจให้ต่างกัน และเหตุผล');
    for (var n = 0; n < notes.length; n++) lines.push(notes[n]);
  }

  lines.push('');
  lines.push(problems
    ? ('  !! พบปัญหา ' + problems + ' ตาราง — ข้อมูลยังไม่ครบ ห้ามถือว่าย้ายเสร็จ')
    : '  ข้อมูลครบทุกตารางเท่าที่เทียบได้');
  return problems;
}

/**
 * เทียบจำนวนแถวของตารางเดียว ตามกติกาที่ประกาศไว้ให้ตารางนั้น
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object|null} declared คำประกาศจาก VERIFY_EXPECTED_DIFF (null = ฐานข้อมูลต้องไม่น้อยกว่าชีต)
 * @return {Object} {sheetText, dbText, verdict, problem}
 */
function verifyOneRowCount_(tableKey, declared) {
  var rule = declared ? declared.rule : 'sheetIsFloor';

  /*
   * ตารางที่ต้องเทียบจำนวนอ่านแบบละเอียด เพราะตัวเลขที่ต้องเทียบคือ "จำนวนแถวที่จะถูก
   * ย้ายจริง" ซึ่งไม่นับแถวว่าง · ตารางที่เหลืออ่านแค่ getLastRow() เพราะคำถามคือ
   * "มีอะไรค้างอยู่ไหม" ไม่ใช่ "กี่แถวกันแน่" และบางตารางใหญ่เกินกว่าจะอ่านทั้งแท็บ
   */
  var sheetRows = verifySheetRowCount_(tableKey, rule === 'sheetIsFloor');
  var dbRows = verifyDbRowCount_(tableKey);
  var judged = verifyRowVerdict_(rule, sheetRows, dbRows);

  return {
    sheetText: (rule === 'notFromSheet') ? '-'
      : (sheetRows < 0 ? '(ไม่มีแท็บ)' : String(sheetRows)),
    dbText: (dbRows < 0) ? '(อ่านไม่ได้)' : String(dbRows),
    verdict: judged.verdict,
    problem: judged.problem
  };
}

/**
 * ตัดสินว่าจำนวนแถวคู่นี้เป็นปัญหาหรือไม่ — ตรรกะล้วน ไม่แตะชีตหรือฐานข้อมูลเลย
 *
 * แยกออกมาจากการอ่านค่าโดยตั้งใจ เพราะนี่คือส่วนที่ "ตัดสินใจ" ซึ่งเป็นส่วนเดียว
 * ที่ผิดได้เงียบ ๆ · การอ่านค่าผิดจะล้มให้เห็น แต่การตัดสินผิดจะได้รายงานสีเขียว
 * ที่ดูน่าเชื่อถือทุกประการ · แยกไว้แล้วจึงพิสูจน์ด้วยตัวเลขที่เราตั้งเองได้
 *
 * @param {string} rule กติกาของตารางนั้น
 * @param {number} sheetRows จำนวนแถวในชีต · -1 = ไม่มีแท็บแล้ว
 * @param {number} dbRows จำนวนแถวในฐานข้อมูล · -1 = อ่านไม่ได้
 * @return {Object} {verdict, problem}
 */
function verifyRowVerdict_(rule, sheetRows, dbRows) {
  if (dbRows < 0) return { verdict: '!! อ่านฐานข้อมูลไม่ได้', problem: true };

  if (rule === 'notFromSheet') {
    // ไม่มีอะไรให้เทียบก็จริง แต่ตารางที่ควรมีข้อมูลแล้วว่างเปล่า ยังเป็นเรื่องใหญ่อยู่ดี
    return dbRows > 0 ? { verdict: 'ไม่เทียบ (มีข้อมูลอยู่)', problem: false }
      : { verdict: '!! ไม่เทียบ แต่ว่างเปล่า', problem: true };
  }

  if (rule === 'sheetDiscarded') {
    return { verdict: 'ไม่เทียบ (ตั้งใจทิ้งของเก่า)', problem: false };
  }

  if (rule === 'sheetMustBeEmpty') {
    return sheetRows > 0 ? { verdict: '!! มีแถวค้างในชีต ' + sheetRows + ' แถว', problem: true }
      : { verdict: 'ชีตไม่มีของค้าง', problem: false };
  }

  if (sheetRows < 0) {
    return dbRows > 0 ? { verdict: 'เทียบไม่ได้ (ไม่มีแท็บ) แต่มีข้อมูล', problem: false }
      : { verdict: '!! ไม่มีทั้งสองฝั่ง', problem: true };
  }

  /*
   * จำนวนในชีตเป็น **พื้น ไม่ใช่เพดาน** — ขาดคือปัญหา เกินไม่ใช่
   *
   * หลังย้ายเสร็จ ชีตหยุดนิ่งอยู่กับที่ แต่ฐานข้อมูลยังโตต่อทุกวันจากการใช้งานจริง
   * ผู้ใช้คนใหม่ ใบงานใบใหม่ ล้วนทำให้ฝั่งฐานข้อมูลมากกว่าชีตอย่างถูกต้อง
   * ถ้าบังคับให้เท่ากันเป๊ะ ตารางพวกนี้จะขึ้นแดงถาวรตั้งแต่สัปดาห์แรก แล้วคนอ่าน
   * จะเรียนรู้ที่จะข้ามบรรทัดแดง ซึ่งทำให้รายงานทั้งฉบับไร้ความหมาย
   *
   * สิ่งที่ต้องจับให้ได้คือ "แถวที่เคยมีในชีตแล้วไม่ได้ตามไป" ซึ่งคือ ขาด เท่านั้น
   */
  if (dbRows < sheetRows) {
    return { verdict: '!! ขาด ' + (sheetRows - dbRows) + ' แถว', problem: true };
  }

  return { verdict: (sheetRows === dbRows) ? 'ตรงกัน'
    : ('ครบ · มากกว่าชีต ' + (dbRows - sheetRows) + ' แถว (เพิ่มหลังย้าย)'), problem: false };
}

/**
 * จำนวนแถวในชีตต้นทาง
 * @param {string} tableKey ชื่อตารางในระบบ ซึ่งเป็นชื่อเดียวกับชื่อแท็บ
 * @param {boolean} deep true = นับเฉพาะแถวที่ไม่ว่าง (อ่านทั้งแท็บ)
 * @return {number} จำนวนแถว · -1 เมื่อไม่มีแท็บนั้นแล้ว
 */
function verifySheetRowCount_(tableKey, deep) {
  try {
    if (deep) return migrateReadSheetRows_(tableKey).length;
    var last = getSheet_(tableKey).getLastRow();
    return last > 0 ? (last - 1) : 0;
  } catch (e) {
    return -1;
  }
}

/**
 * จำนวนแถวในฐานข้อมูลปลายทาง
 * @param {string} tableKey ชื่อตารางในระบบ
 * @return {number} จำนวนแถว · -1 เมื่ออ่านไม่ได้
 */
function verifyDbRowCount_(tableKey) {
  try {
    return db_count_(tableKey);
  } catch (e) {
    return -1;
  }
}
