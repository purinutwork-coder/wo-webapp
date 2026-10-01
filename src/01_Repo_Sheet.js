/**
 * 01_Repo_Sheet.gs — ตัวช่วยกลางของชั้น Repo ที่ทุกไฟล์ 01_Repo_*.gs เรียกใช้
 *
 * อ้างอิง SPEC.md หัวข้อ 13 (โครงสร้างตาราง), D-3 (อ่าน–เขียนเป็นชุด),
 * D-7 (ล็อกเฉพาะช่วงเขียนจริง), D-8 (Soft Delete), C-3 (Optimistic Lock)
 *
 * ไฟล์นี้เป็นที่เดียวในระบบที่เรียก SpreadsheetApp ได้ — ไฟล์ชั้นอื่นห้ามเรียกตรง
 * เพื่อให้วันที่ต้องย้ายไป Firestore หรือ Cloud SQL แก้เฉพาะชั้นนี้
 *
 * หลักการสำคัญ
 *   - อ่านทั้งช่วงด้วย getValues() ครั้งเดียว แล้วประมวลผลใน memory ห้ามวนอ่านทีละเซลล์
 *   - อ้างอิงคอลัมน์ด้วย "ชื่อหัวคอลัมน์" เสมอ ไม่ผูกกับตำแหน่ง สลับคอลัมน์แล้วต้องยังทำงานได้
 *   - ล็อกเฉพาะช่วงเขียนจริงเท่านั้น ไม่ล็อกคร่อมการอ่านทั้งตารางหรือการคำนวณ
 */

/** เวลารอคิวล็อกก่อนยอมแพ้ (มิลลิวินาที) — สั้นไว้เพราะ 20 คนใช้พร้อมกัน (SPEC D-7) */
var LOCK_TIMEOUT_MS = 10000;

/** ชื่อฟิลด์ภายในที่ชั้น Repo เติมให้ทุกแถว เก็บเลขแถวจริงในชีตไว้ใช้ตอน update */
var ROW_FIELD = '_row';

/**
 * แคชค่าทั้งแท็บ "ภายในการรันครั้งนี้เท่านั้น" key คือชื่อแท็บ
 * ตัวแปรระดับสคริปต์ใน Apps Script เกิดใหม่ทุกครั้งที่รัน จึงไม่มีทางค้างข้ามผู้ใช้
 * (ห้ามย้ายไป CacheService — ดูเหตุผลใน readSnapshot_)
 */
var ROW_CACHE_ = {};

/* ---------------------------------------------------------------------------
 * การเข้าถึงชีตและหัวคอลัมน์
 * --------------------------------------------------------------------------- */

/**
 * เลือกไฟล์ปลายทางของแท็บนั้น — Audit_Log อยู่คนละไฟล์กับตารางหลัก (SPEC D-5)
 *
 * System_Log อยู่ในไฟล์เดียวกับ Audit_Log (SPEC 13) เพราะเป็นบันทึกเหมือนกัน
 * โตเร็วเหมือนกัน และเวลาไล่ปัญหาต้องเปิดดูคู่กันเสมอ
 *
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @return {Spreadsheet}
 */
function resolveSpreadsheet_(sheetName) {
  var inLogFile = (sheetName === SHEET.AUDIT_LOG || sheetName === SHEET.SYSTEM_LOG);
  return inLogFile ? getAuditDb_() : getDb_();
}

/**
 * เปิดแท็บตามชื่อ
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @return {Sheet}
 * @throws {Error} เมื่อไม่พบแท็บชื่อนั้น
 */
function getSheet_(sheetName) {
  // ด่านเดียวที่กันการเรียกฟังก์ชันภายในตรง ๆ จากเบราว์เซอร์ (ดูเหตุผลใน 00_Config.gs)
  // วางไว้ที่นี่เพราะเป็นทางผ่านเดียวของการแตะชีตทุกแท็บ จึงครอบทุกเส้นทางในคราวเดียว
  assertDataAccessAllowed_();

  var sheet = resolveSpreadsheet_(sheetName).getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('ไม่พบแท็บชื่อ "' + sheetName + '" ในไฟล์ฐานข้อมูล — ตรวจว่าสะกดชื่อแท็บตรงกับ SPEC หัวข้อ 13');
  }
  return sheet;
}

/**
 * ตรวจว่าแท็บนี้เขียนได้ — Customer เป็นชีตที่ผู้ใช้อัปโหลดเอง ระบบอ่านอย่างเดียว (SPEC 11)
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @throws {Error} เมื่อพยายามเขียนแท็บที่อ่านอย่างเดียว
 */
function assertWritable_(sheetName) {
  if (READONLY_SHEET.indexOf(sheetName) !== -1) {
    throw new Error('แท็บ "' + sheetName + '" เป็นข้อมูลที่ผู้ใช้อัปโหลดเอง ระบบอ่านได้อย่างเดียว ห้ามเขียนทับ');
  }
}

/**
 * คีย์ที่ใช้เก็บหัวคอลัมน์ใน CacheService
 * @param {string} sheetName ชื่อแท็บ
 * @return {string}
 */
function headerCacheKey_(sheetName) {
  return 'hdr:' + sheetName;
}

/**
 * เก็บหัวคอลัมน์ลงแคช
 * @param {string} sheetName ชื่อแท็บ
 * @param {string[]} header รายชื่อหัวคอลัมน์
 */
function putHeaderCache_(sheetName, header) {
  // แคชล้มเหลวไม่ควรทำให้การอ่านข้อมูลล้มตาม — cachePut_ กลืนข้อผิดพลาดให้แล้ว
  cachePut_(headerCacheKey_(sheetName), JSON.stringify(header), CACHE_TTL_SEC);
}

/**
 * ล้างแคชหัวคอลัมน์ — ต้องเรียกทุกครั้งที่มีการเพิ่ม ลบ หรือสลับตำแหน่งคอลัมน์ในชีต
 * มิฉะนั้น appendRow_ อาจเรียงค่าตามลำดับคอลัมน์เดิมนานสูงสุด 5 นาที
 * @param {string} [sheetName] ชื่อแท็บ · ไม่ระบุ = ล้างของทุกแท็บ
 */
function clearHeaderCache_(sheetName) {
  if (sheetName) {
    cacheDrop_(headerCacheKey_(sheetName));
    return;
  }
  var keys = [];
  for (var name in SHEET) {
    if (Object.prototype.hasOwnProperty.call(SHEET, name)) keys.push(headerCacheKey_(SHEET[name]));
  }
  cacheDrop_(keys);
}

/**
 * อ่านหัวคอลัมน์ของแท็บ โดยใช้แคช 5 นาที เพื่อไม่ต้องอ่านหัวตารางใหม่ทุกครั้ง (SPEC G)
 * readAll_ จะรีเฟรชแคชนี้ให้เองทุกครั้งที่อ่านข้อมูล เพราะได้แถวหัวมาพร้อมกันอยู่แล้ว
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @return {string[]} รายชื่อหัวคอลัมน์ตามลำดับจริงในชีต
 * @throws {Error} เมื่อแท็บยังไม่มีแถวหัวคอลัมน์
 */
function getHeader_(sheetName) {
  // แคชระดับการรันมาก่อนเสมอ เพราะสดที่สุดและไม่ต้องแปลง JSON
  var snapshot = ROW_CACHE_[sheetName];
  if (snapshot) return snapshot.header;

  // หัวคอลัมน์คือรายชื่อใน DB_COLUMNS ไม่ต้องไปถามใคร
  return dbColumnMap_(sheetName).systemNames.slice();
}

/**
 * ตัดช่องว่างหัวคอลัมน์และแปลงเป็นข้อความ
 * @param {Array} rawHeader แถวหัวคอลัมน์ดิบจากชีต
 * @return {string[]}
 */
function normalizeHeader_(rawHeader) {
  var header = [];
  for (var i = 0; i < rawHeader.length; i++) {
    header.push(String(rawHeader[i] === null || rawHeader[i] === undefined ? '' : rawHeader[i]).trim());
  }
  return header;
}

/**
 * ตำแหน่งคอลัมน์ (เริ่มที่ 0) ของชื่อหัวคอลัมน์
 * @param {string[]} header รายชื่อหัวคอลัมน์
 * @param {string} field ชื่อคอลัมน์ที่ต้องการ
 * @return {number} -1 เมื่อไม่พบ
 */
function indexOfField_(header, field) {
  return header.indexOf(field);
}

/* ---------------------------------------------------------------------------
 * การอ่าน
 * --------------------------------------------------------------------------- */

/**
 * แปลงค่าหนึ่งแถวเป็น object โดยอ้างชื่อหัวคอลัมน์ ไม่ผูกกับตำแหน่ง
 * @param {string[]} header รายชื่อหัวคอลัมน์
 * @param {Array} raw ค่าทั้งแถว
 * @return {Object}
 */
function rowToObject_(header, raw) {
  var obj = {};
  for (var c = 0; c < header.length; c++) {
    if (header[c] === '') continue;      // ข้ามคอลัมน์ที่ไม่มีชื่อหัว
    obj[header[c]] = raw[c];
  }
  return obj;
}

/**
 * อ่านแท็บโดยเก็บเฉพาะคอลัมน์ที่ผู้เรียกจะใช้จริง
 *
 * มีไว้สำหรับตารางธุรกรรมที่มีหลายสิบคอลัมน์แต่หน้าจอใช้ไม่กี่คอลัมน์ (SPEC 17.1)
 * สิ่งที่ประหยัดคือ "ของที่ถืออยู่ในมือ" — object ที่สร้างขึ้น ก้อนที่เก็บลงแคช
 * และก้อนที่ส่งข้ามไปหน้าเว็บ ซึ่งเป็นตัวที่โตตามจำนวนใบงานจริง ๆ
 *
 * ไม่ได้ประหยัดจำนวนครั้งที่คุยกับชีต และตั้งใจไม่ประหยัด — ต้นทุนของ Apps Script
 * คิดต่อ "ครั้งที่เรียก" ราว 450 ms ไม่ได้คิดต่อเซลล์ การแยกอ่านทีละคอลัมน์
 * จะกลายเป็น 10 ครั้งต่อการเปิดหนึ่งหน้า ซึ่งช้ากว่าการอ่านทีเดียวหลายเท่า
 *
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {string[]} fields ชื่อคอลัมน์ที่ต้องการ
 * @return {Object[]} แถวที่มีเฉพาะคอลัมน์ที่ขอ พร้อมฟิลด์ _row
 */
async function readFields_(sheetName, fields) {
  var snapshot = await readSnapshot_(sheetName);
  if (!snapshot) return [];

  var index = [];
  for (var f = 0; f < fields.length; f++) {
    index.push(indexOfField_(snapshot.header, fields[f]));
  }

  var values = snapshot.values;
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var raw = values[r];
    if (isBlankRow_(raw)) continue;

    var obj = {};
    for (var c = 0; c < fields.length; c++) {
      obj[fields[c]] = (index[c] === -1) ? '' : raw[index[c]];
    }
    obj[ROW_FIELD] = r + 1;
    rows.push(obj);
  }
  return rows;
}

/**
 * อ่านทั้งแท็บด้วย getValues() ครั้งเดียว แล้วแปลงเป็น array ของ object
 * โดยใช้ชื่อหัวคอลัมน์เป็น key และเติมฟิลด์ _row เก็บเลขแถวจริงไว้ใช้ตอน update
 * ไม่ล็อกในขั้นตอนนี้ตาม SPEC D-7
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @return {Object[]} ทุกแถวที่มีข้อมูล (แถวว่างล้วนถูกข้าม)
 */
async function readAll_(sheetName) {
  var snapshot = await readSnapshot_(sheetName);
  if (!snapshot) return [];

  var header = snapshot.header;
  var values = snapshot.values;

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var raw = values[r];
    if (isBlankRow_(raw)) continue;
    var obj = rowToObject_(header, raw);
    obj[ROW_FIELD] = r + 1;              // แถวหัวคอลัมน์คือแถวที่ 1
    rows.push(obj);
  }
  return rows;
}

/**
 * อ่านค่าทั้งแท็บมาไว้ในหน่วยความจำ พร้อมแคชไว้ใช้ซ้ำ "ภายในการรันครั้งนี้เท่านั้น"
 *
 * เหตุผล: หนึ่งรายการของชั้น Service เรียกอ่านตารางเดิมซ้ำหลายรอบ (ตรวจ Guard, หา Task,
 * คำนวณสถานะ, เขียน Audit) ถ้ายิง getValues() ใหม่ทุกครั้งจะช้าจนชน 6 นาทีบนข้อมูลจริง
 *
 * ทำไมไม่ใช้ CacheService: แคชนั้นข้ามการรันและข้ามผู้ใช้ ถ้าค่าเก่าค้างอยู่แม้ไม่กี่วินาที
 * ผู้ใช้อีกคนจะตัดสินใจจากข้อมูลที่ไม่ใช่ปัจจุบัน แคชนี้จึงเป็นตัวแปรธรรมดาที่ตายไปพร้อมการรัน
 * และถูกล้างทันทีที่แท็บนั้นถูกเขียน
 *
 * คืนค่าเป็นสำเนา values ที่ผู้เรียกเอาไปประกอบ object ใหม่ทุกครั้ง จึงไม่มีทางที่ผู้เรียก
 * จะเผลอไปแก้ค่าในแคช
 *
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @return {Object|null} {header, values} หรือ null เมื่อแท็บยังว่าง
 */
async function readSnapshot_(sheetName) {
  /*
   * ด่านต้องอยู่ก่อนแคชด้วย ไม่ใช่อยู่แค่ที่ getSheet_()
   *
   * ถ้าตรวจแค่ตอนเปิดชีต การอ่านที่ได้คำตอบจากแคชจะเล็ดลอดไปได้
   * ในการใช้งานจริงแคชเกิดใหม่ทุกการรัน ช่องนี้จึงแทบไม่เปิด — แต่ "แทบไม่" ไม่พอ
   * สำหรับด่านที่กันการอ่านฐานลูกค้าทั้งบริษัท
   */
  assertDataAccessAllowed_();

  if (Object.prototype.hasOwnProperty.call(ROW_CACHE_, sheetName)) {
    return ROW_CACHE_[sheetName];
  }

  // ข้อมูลตั้งต้นที่แทบไม่เปลี่ยน ถามแคชข้ามการรันก่อน จะได้ไม่ต้องคุยกับชีตเลย
  var shared = getMasterCache_(sheetName);
  if (shared) {
    ROW_CACHE_[sheetName] = shared;
    return shared;
  }

  /*
   * จุดนี้คือทางผ่านเดียวของการอ่านทั้งระบบ ทุกตารางอ่านจากฐานข้อมูลที่เดียวกัน
   *
   * readAll_, readAllActive_, findBy_, findOne_ และผู้เรียกทุกคนเหนือขึ้นไป
   * เห็นภาพเดียวกันเสมอ ไม่มีใครต้องรู้ว่าข้อมูลมาจากไหน
   */
  var snapshot = await dbSnapshot_(sheetName);
  return cacheSnapshot_(sheetName, snapshot);
}

/**
 * เก็บภาพของแท็บลงแคชทั้งสองชั้นแล้วคืนกลับ
 *
 * แยกออกมาเพราะทั้งการอ่านทีละแท็บและการอุ่นหลายแท็บพร้อมกัน ต้องเก็บแบบเดียวกันเป๊ะ
 * ถ้าปล่อยให้สองทางเก็บกันเอง วันหนึ่งทางหนึ่งจะลืมรีเฟรชแคชแถวหัวคอลัมน์
 *
 * @param {string} sheetName ชื่อแท็บ
 * @param {Object} snapshot {header, values}
 * @return {Object} ภาพเดิมที่ส่งเข้ามา
 */
function cacheSnapshot_(sheetName, snapshot) {
  putHeaderCache_(sheetName, snapshot.header);   // ได้แถวหัวมาฟรีอยู่แล้ว จึงรีเฟรชแคชให้ตรงเสมอ
  putMasterCache_(sheetName, snapshot);
  ROW_CACHE_[sheetName] = snapshot;
  return snapshot;
}

/**
 * อุ่นหลายแท็บพร้อมกันในรอบเดียว ก่อนที่ผู้เรียกจะทยอยอ่านทีละแท็บ
 *
 * หน้าหนึ่งหน้ารู้ล่วงหน้าอยู่แล้วว่าจะใช้ตารางไหนบ้าง การรู้ล่วงหน้านั้นคือสิ่งเดียว
 * ที่ทำให้ยิงขนานได้ · ถ้าไม่บอกไว้ก่อน ชั้น Repo จะเห็นทีละคำขอเสมอ และไม่มีทาง
 * รู้ว่ายังมีอีกสามตารางตามมา จึงต้องรอทีละตารางเรียงกันโดยไม่จำเป็น
 *
 * แท็บที่ยังไม่ย้ายไป Supabase หรือที่มีอยู่ในแคชแล้ว จะถูกข้ามไปเอง เรียกซ้ำได้เสมอ
 * โดยไม่เสียคำขอเพิ่ม และการลืมเรียกไม่ทำให้ผลลัพธ์ผิด เพียงแต่ช้ากว่าที่ควร
 *
 * @param {string[]} sheetNames ชื่อแท็บที่กำลังจะถูกอ่าน
 * @return {number} จำนวนแท็บที่ดึงมาจริงในรอบนี้
 */
async function warmSnapshots_(sheetNames) {
  assertDataAccessAllowed_();

  var wanted = [];
  for (var i = 0; i < sheetNames.length; i++) {
    var name = sheetNames[i];
    if (Object.prototype.hasOwnProperty.call(ROW_CACHE_, name)) continue;

    var shared = getMasterCache_(name);
    if (shared) { ROW_CACHE_[name] = shared; continue; }
    if (wanted.indexOf(name) === -1) wanted.push(name);
  }

  // ตารางเดียวไม่ได้อะไรจากการยิงขนาน ปล่อยให้เดินทางปกติจะอ่านง่ายกว่า
  if (wanted.length < 2) return 0;

  var snapshots = await dbSnapshots_(wanted);
  for (var w = 0; w < wanted.length; w++) cacheSnapshot_(wanted[w], snapshots[wanted[w]]);
  return wanted.length;
}

/* ---------------------------------------------------------------------------
 * แคชข้อมูลตั้งต้นข้ามการรัน (CacheService)
 *
 * ต่างจาก ROW_CACHE_ ข้างบนซึ่งตายไปพร้อมการรันหนึ่งครั้ง — ชั้นนี้อยู่ได้ 10 นาที
 * และผู้ใช้ทุกคนเห็นก้อนเดียวกัน จึงใช้ได้เฉพาะแท็บที่ประกาศไว้ใน MASTER_CACHE_SHEETS
 * ซึ่งเป็นรายการตัวเลือกที่เปลี่ยนปีละไม่กี่ครั้ง ไม่ใช่ตารางธุรกรรม
 *
 * ทุกทางที่เขียนแท็บผ่าน patchRowCache_() และทุกทางที่ลบแถวผ่าน clearRowCache_()
 * ชั้นนี้จึงเกาะไปกับสองตัวนั้น ไม่มีทางที่ใครจะเขียนแล้วลืมล้าง
 * --------------------------------------------------------------------------- */

/**
 * คีย์ของแคชข้อมูลตั้งต้นใน CacheService
 * @param {string} sheetName ชื่อแท็บ
 * @return {string}
 */
function masterCacheKey_(sheetName) {
  return 'master:' + sheetName;
}

/**
 * อ่านภาพของแท็บข้อมูลตั้งต้นจากแคชข้ามการรัน
 * @param {string} sheetName ชื่อแท็บ
 * @return {Object|null} {header, values} หรือ null เมื่อไม่มีหรืออ่านไม่ได้
 */
function getMasterCache_(sheetName) {
  if (!isMasterCacheSheet_(sheetName)) return null;
  try {
    var text = cacheGet_(masterCacheKey_(sheetName));
    if (!text) return null;
    var snapshot = JSON.parse(text);
    // ภาพที่อ่านไม่ออกถือว่าไม่มี ดีกว่าเดาต่อแล้วพังไกลจากต้นเหตุ
    return (snapshot && snapshot.header && snapshot.values) ? snapshot : null;
  } catch (e) {
    return null;
  }
}

/**
 * เก็บภาพของแท็บข้อมูลตั้งต้นลงแคชข้ามการรัน
 *
 * ไม่เก็บเมื่อมี Date ปนอยู่ เพราะ JSON จะแปลงเป็นข้อความ ISO แล้วอ่านกลับมาได้คนละชนิด
 * ซึ่งจะเพี้ยนแบบเงียบ ๆ · แท็บทั้งสี่ในรายการไม่มีคอลัมน์วันเวลาอยู่แล้ว
 * ด่านนี้จึงเป็นตาข่ายกันไว้เผื่อมีคนเพิ่มคอลัมน์วันเวลาในอนาคต
 *
 * และไม่เก็บเมื่อก้อนใหญ่เกินเพดาน 100KB ของ CacheService เพราะจะเก็บไม่สำเร็จเงียบ ๆ
 *
 * @param {string} sheetName ชื่อแท็บ
 * @param {Object} snapshot {header, values}
 */
function putMasterCache_(sheetName, snapshot) {
  if (!isMasterCacheSheet_(sheetName)) return;
  if (hasDateValue_(snapshot.values)) return;

  var text = null;
  try {
    text = JSON.stringify(snapshot);
  } catch (e) {
    return;   // แปลงเป็นข้อความไม่ได้ ก็เก็บไม่ได้ · ครั้งหน้าค่อยอ่านจากชีตใหม่
  }
  if (text.length > 90000) return;
  cachePut_(masterCacheKey_(sheetName), text, MASTER_CACHE_TTL_SEC);
}

/**
 * มี Date ปนอยู่ในค่าที่อ่านมาหรือไม่
 * @param {Array[]} values ค่าทั้งตาราง
 * @return {boolean}
 */
function hasDateValue_(values) {
  for (var r = 0; r < values.length; r++) {
    var row = values[r] || [];
    for (var c = 0; c < row.length; c++) {
      if (row[c] instanceof Date) return true;
    }
  }
  return false;
}

/**
 * บอกว่ามีการเขียนแท็บหนึ่งลงไปแล้ว — ล้างยอดของแดชบอร์ดเมื่อแท็บนั้นเป็นที่มาของยอด
 *
 * **ห้ามถอดการเรียกตัวนี้ออกจากทางเขียนของใบงานและงานของแผนกเด็ดขาด**
 *
 * ยอดบนหน้าแรกถูกแคชไว้ 60 วินาทีเพื่อให้ยี่สิบคนที่เปิดพร้อมกันตอนเช้ายิงคำขอ
 * ครั้งเดียว · สิ่งที่ทำให้ตัวเลขยังสดอยู่คือการล้างตรงนี้เท่านั้น · ถ้าหลุดไป
 * ผู้ใช้ที่เพิ่งกดอนุมัติจะกลับมาเห็นตัวเลขเดิม แล้วเข้าใจว่าการกดของตัวเองไม่มีผล
 * ซึ่งเป็นอาการที่ไม่มีอะไรชี้กลับมาที่แคชเลย
 *
 * **เงื่อนไขที่แท้จริงคือ "สองตารางนี้ถูกเขียน"** ไม่ใช่ "สถานะเปลี่ยน" เพราะการ
 * บันทึกชำระเงินเปลี่ยนยอด "ยังไม่ชำระ" โดยไม่ผ่านการเปลี่ยนสถานะเลย · และไม่ใช่
 * "ข้อมูลตั้งต้นเปลี่ยน" เพราะยอดใบงานไม่เกี่ยวกับตาราง Master สักตาราง
 *
 * @param {string} sheetName ชื่อแท็บที่เพิ่งถูกเขียน
 */
function noteRepoWrite_(sheetName) {
  if (DASHBOARD_SOURCE_SHEETS.indexOf(sheetName) !== -1) {
    clearDashboardCache_();
    /*
     * ยอดบนเมนูย่อยของแผนกก็จำไว้ภายในการรันเหมือนกัน จึงต้องล้างที่เดียวกัน
     * ถ้าล้างคนละที่ วันหนึ่งจะมีที่หนึ่งที่ได้แก้และอีกที่หนึ่งที่ลืม
     */
    clearTaskCountCache_();
  }
}

/**
 * ล้างแคชข้อมูลตั้งต้นข้ามการรัน
 * @param {string} [sheetName] ชื่อแท็บ · ไม่ระบุ = ล้างทุกแท็บในรายการ
 */
function clearMasterCache_(sheetName) {
  // ล้างไม่สำเร็จไม่ควรทำให้รายการที่กำลังทำอยู่ล้มตาม — cacheDrop_ กลืนให้แล้ว
  if (sheetName) {
    if (isMasterCacheSheet_(sheetName)) cacheDrop_(masterCacheKey_(sheetName));
    return;
  }
  var keys = [];
  for (var i = 0; i < MASTER_CACHE_SHEETS.length; i++) {
    keys.push(masterCacheKey_(MASTER_CACHE_SHEETS[i]));
  }
  cacheDrop_(keys);
}

/**
 * ปรับภาพที่แคชไว้ให้ตรงกับสิ่งที่เพิ่งเขียนลงชีต แทนการทิ้งทั้งภาพ
 *
 * เดิมทุกครั้งที่เขียน แคชของแท็บนั้นจะถูกทิ้งทั้งก้อน การอ่านครั้งถัดไปจึงต้องดึงทั้งตารางใหม่
 * ในเส้นทางใช้งานจริง การเขียนกับการอ่านสลับกันตลอด (เปลี่ยนสถานะ แล้วอ่านกลับมาคำนวณต่อ)
 * ค่าใช้จ่ายตรงนี้จึงทบขึ้นเร็วมาก ทั้งที่เรารู้อยู่แล้วว่าเขียนอะไรลงแถวไหน
 *
 * ปลอดภัยเพราะค่าที่ใส่กลับเข้าแคชคืออาร์เรย์ชุดเดียวกับที่ setValues() เขียนลงชีตจริง
 * ไม่ใช่ค่าที่คำนวณขึ้นใหม่ · กรณีใดที่ภาพในมือไม่ตรงกับชีตแน่ ๆ (เลขแถวกระโดดข้าม
 * หรือจำนวนคอลัมน์ไม่พอ) จะทิ้งแคชไปเลยเพื่อให้อ่านใหม่ ไม่เดาต่อ
 *
 * การตรวจ Optimistic Lock ไม่ได้รับผลกระทบ เพราะอ่านผ่าน readRowDirect_() ที่ข้ามแคชอยู่แล้ว
 *
 * @param {string} sheetName ชื่อแท็บ
 * @param {number} startRow เลขแถวจริงของแถวแรกที่เขียน
 * @param {Array[]} rows ค่าที่เขียนลงไป เรียงตามหัวคอลัมน์
 */
function patchRowCache_(sheetName, startRow, rows) {
  if (!rows.length) return;

  /*
   * แคชข้ามการรันปะแบบนี้ไม่ได้ เพราะคนอื่นอาจเขียนแท็บเดียวกันอยู่คนละการรัน
   * ภาพที่ปะจากมุมมองของเราจึงไม่ใช่ความจริงทั้งหมด — ทิ้งไปให้อ่านใหม่ชัดเจนกว่า
   * จุดนี้คือทางผ่านของ "ทุก" การเขียน จึงไม่มีทางที่ใครจะเขียนแล้วลืมล้าง
   */
  clearMasterCache_(sheetName);

  var snapshot = ROW_CACHE_[sheetName];
  if (!snapshot) return;

  var width = snapshot.values.length ? snapshot.values[0].length : rows[0].length;
  if (width < rows[0].length) {       // ชีตกว้างน้อยกว่าที่เพิ่งเขียน ภาพในมือใช้ต่อไม่ได้
    clearRowCache_(sheetName);
    return;
  }

  for (var i = 0; i < rows.length; i++) {
    var index = startRow - 1 + i;
    if (index > snapshot.values.length) {   // มีช่องว่างคั่น แปลว่าภาพในมือตามไม่ทันแล้ว
      clearRowCache_(sheetName);
      return;
    }
    var line = (index < snapshot.values.length) ? snapshot.values[index] : blankLine_(width);
    for (var c = 0; c < rows[i].length; c++) line[c] = rows[i][c];
    if (index === snapshot.values.length) snapshot.values.push(line);
  }
}

/**
 * แถวว่างตามจำนวนคอลัมน์ที่กำหนด
 * @param {number} width จำนวนคอลัมน์
 * @return {Array}
 */
function blankLine_(width) {
  var line = [];
  for (var i = 0; i < width; i++) line.push('');
  return line;
}

/**
 * แท็บที่ลบแถวจริงได้ — ข้อยกเว้นของกฎ "ห้ามลบแถว" ต้องประกาศไว้ที่นี่เท่านั้น
 *
 * เหตุผลที่ยกเว้นให้ Task_Step: งวดงานที่แผนกเพิ่งกดเพิ่มผิด ยังไม่มีงานและไม่มีไฟล์
 * ผูกอยู่เลย มันไม่ใช่ประวัติของอะไรทั้งนั้น ถ้าเก็บไว้เป็นแถวที่ปิดใช้งาน จะต้องเพิ่ม
 * คอลัมน์ใหม่ในชีตและต้องไปกรองทุกที่ที่นับงวด ซึ่งเป็นที่ที่ลืมง่ายที่สุด
 * และจุดที่เรียกลบได้ต้องตรวจก่อนเสมอว่าไม่มีไฟล์และยังไม่เสร็จ (ดู removeTaskPeriod)
 *
 * ไม่มีที่ใดอ้างถึง "เลขแถว" ของ Task_Step ข้ามการรัน — อ้างด้วย Step_ID เสมอ
 */
var DELETABLE_SHEETS = Object.freeze(['Task_Step']);

/**
 * ลบแถวเดียวออกจากชีตจริง ๆ
 *
 * @param {string} sheetName ชื่อแท็บ ต้องอยู่ใน DELETABLE_SHEETS
 * @param {string} keyField คอลัมน์คีย์
 * @param {string} keyValue ค่าของคีย์
 * @return {boolean} true = ลบแล้ว · false = ไม่พบแถวนั้น
 * @throws {Error} เมื่อแท็บนั้นไม่อยู่ในรายการที่ลบได้
 */
async function deleteRowByKey_(sheetName, keyField, keyValue) {
  var done = await deleteRowByKeyInner_(sheetName, keyField, keyValue);
  noteRepoWrite_(sheetName);
  return done;
}

/**
 * เนื้อของการลบ — แยกออกมาเพื่อให้ตัวห่อข้างบนแจ้งการเขียนได้ครบทุกทางออก
 * @param {string} sheetName ชื่อแท็บ
 * @param {string} keyField คอลัมน์ที่ใช้ค้น
 * @param {*} keyValue ค่าที่ค้น
 * @return {boolean}
 */
async function deleteRowByKeyInner_(sheetName, keyField, keyValue) {
  if (DELETABLE_SHEETS.indexOf(sheetName) === -1) {
    throw new Error('แท็บ ' + sheetName + ' ห้ามลบแถว ให้ปิดใช้งานแทน (กฎข้อ 8)');
  }
  assertWritable_(sheetName);

  var target = await findOne_(sheetName, keyField, keyValue);
  if (!target) return false;

  /*
   * ตารางที่ย้ายแล้วลบด้วยคีย์ ไม่ใช่เลขแถว — และไม่ต้องล็อก เพราะ Postgres
   * ลบทีละแถวเป็นหน่วยเดียวอยู่แล้ว · ไม่มีเลขแถวให้เลื่อน ปัญหาที่ล็อกกันไว้จึงไม่มี
   */
  var filters = {};
  filters[keyField] = keyValue;
  var removed = (await db_delete_(sheetName, filters)).length;
  dbInvalidate_(sheetName);
  return removed > 0;
}

/**
 * ล้างแคชระดับการรันของแท็บนั้น ต้องเรียกทุกครั้งที่แท็บถูกเขียนหรือถูกลบแถว
 * @param {string} [sheetName] ชื่อแท็บ · ไม่ระบุ = ล้างทุกแท็บ
 */
function clearRowCache_(sheetName) {
  if (sheetName) delete ROW_CACHE_[sheetName];
  else ROW_CACHE_ = {};
  // แคชข้ามการรันของข้อมูลตั้งต้นต้องตายไปพร้อมกัน ไม่งั้นคนอื่นจะเห็นค่าเก่าอีก 10 นาที
  clearMasterCache_(sheetName);

  /*
   * แผนที่ชื่อที่ใช้แสดงสร้างจากทะเบียนผู้ใช้ จึงต้องตายพร้อมภาพของตารางนั้น
   *
   * ผูกไว้ตรงนี้เพราะที่นี่คือจุดที่ทุกเส้นทางการเขียนเดินผ่านอยู่แล้ว · ถ้าให้แต่ละ
   * เส้นทางจำไว้เอง วันหนึ่งจะมีเส้นทางที่ลืม แล้วหน้าจอจะแสดงชื่อเก่าโดยไม่มีอะไรผิดให้เห็น
   */
  if (!sheetName || sheetName === SHEET.USER_ROLE) clearDisplayNameCache_();
}

/**
 * อ่านค่าจากชีตตรง ๆ โดยไม่ผ่านแคช — ใช้ตอนอ่านซ้ำในล็อกของ updateRow_
 * จุดนั้นต้องเห็นค่าล่าสุดจริงเสมอ ถ้าอ่านจากแคชการตรวจ Optimistic Lock จะไร้ความหมาย
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {number} rowNumber เลขแถวจริงในชีต
 * @param {number} numCols จำนวนคอลัมน์ที่ต้องอ่าน
 * @return {Array} ค่าทั้งแถว
 */
function readRowDirect_(sheetName, rowNumber, numCols) {
  return getSheet_(sheetName).getRange(rowNumber, 1, 1, numCols).getValues()[0];
}

/**
 * อ่านทั้งแท็บแล้วคัดเฉพาะแถวที่ยังใช้งานอยู่ตามคอลัมน์สถานะใช้งานของแท็บนั้น (SPEC D-8)
 * เป็นการกรองเชิงกลไกตามคอลัมน์ที่ประกาศไว้ ไม่ใช่ตรรกะธุรกิจ
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @return {Object[]} แท็บที่ไม่มีคอลัมน์สถานะใช้งาน จะคืนทุกแถว
 */
async function readAllActive_(sheetName) {
  return activeRowsOf_(sheetName, await readAll_(sheetName));
}

/**
 * คัดเฉพาะแถวที่ยังใช้งานอยู่ จากแถวที่อ่านมาแล้ว
 *
 * แยกออกจาก readAllActive_ เพราะการอ่านที่กรองที่ฐานข้อมูลมาแล้ว ก็ต้อง
 * คัดด้วยกติกาเดียวกันเป๊ะ · ช่องว่างแปลว่า "ยังใช้งานอยู่" ตามกฎข้อ 25
 * ซึ่งเป็นกติกาที่ตัวกรองของฐานข้อมูลตอบไม่ได้ ถ้ามีแถวเก่าที่ค่าเป็น NULL หลงเหลืออยู่
 *
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {Object[]} rows แถวที่อ่านมา
 * @return {Object[]}
 */
function activeRowsOf_(sheetName, rows) {
  var activeField = SHEET_ACTIVE_FIELD[sheetName];
  if (!activeField) return rows;

  var active = [];
  for (var i = 0; i < rows.length; i++) {
    if (isTruthyCell_(rows[i][activeField])) active.push(rows[i]);
  }
  return active;
}

/**
 * ตีความค่าในเซลล์เป็นจริง/เท็จ — ชีตอาจเก็บเป็น true, "TRUE", "ใช่" หรือ 1
 * ช่องว่างถือว่าเป็นจริง เพื่อไม่ให้ข้อมูลเดิมที่ยังไม่ได้กรอกคอลัมน์นี้หายไปจากรายการ
 * @param {*} value ค่าจากเซลล์
 * @return {boolean}
 */
function isTruthyCell_(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === '' || value === null || value === undefined) return true;
  var text = String(value).trim().toUpperCase();
  return text !== 'FALSE' && text !== 'NO' && text !== '0' && text !== 'ไม่ใช่';
}

/**
 * ตีความค่าในเซลล์เป็นจริง/เท็จ สำหรับคอลัมน์ที่ "ช่องว่าง = ไม่ใช่"
 * เช่น Payment_Required ที่ไม่ได้ติ๊กไว้ ต้องแปลว่าไม่ต้องชำระก่อนเริ่มงาน
 * (ต่างจาก isTruthyCell_ ที่ใช้กับคอลัมน์สถานะใช้งาน ซึ่งช่องว่างแปลว่ายังใช้อยู่)
 * @param {*} value ค่าจากเซลล์
 * @return {boolean}
 */
function cellToBoolean_(value) {
  if (value === true) return true;
  if (value === '' || value === null || value === undefined || value === false) return false;
  var text = String(value).trim().toUpperCase();
  return text === 'TRUE' || text === 'YES' || text === '1' || text === 'ใช่';
}

/**
 * แถวนี้ว่างทุกช่องหรือไม่
 * @param {Array} raw ค่าทั้งแถว
 * @return {boolean}
 */
function isBlankRow_(raw) {
  for (var i = 0; i < raw.length; i++) {
    if (raw[i] !== '' && raw[i] !== null && raw[i] !== undefined) return false;
  }
  return true;
}

/**
 * อ่านแถวที่ตรงเงื่อนไข โดยให้ฐานข้อมูลเป็นคนกรอง เรียง และจำกัดจำนวน (กฎข้อ 28)
 *
 * นี่คือทางเดียวที่ตารางซึ่งโตได้ควรถูกอ่าน · การอ่านทั้งตารางมาคัดในหน่วยความจำ
 * คือนิสัยจากยุคชีตที่การอ่านทั้งแท็บมีราคาเท่ากับการอ่านแถวเดียว บนฐานข้อมูล
 * มันคือการลากข้อมูลทั้งตารางข้ามเครือข่ายทุกครั้งที่มีคนเปิดหน้า
 *
 * **ขอเกินมาหนึ่งแถวเสมอ** เพื่อให้แยกออกว่า "ได้ครบพอดี" กับ "ถูกตัดเพราะชนเพดาน"
 * ต่างกัน · ถ้าขอเท่าเพดานพอดี ผลที่เต็มพอดีจะหน้าตาเหมือนผลที่ขาดหายทุกประการ
 * ซึ่งเป็นความเงียบแบบเดียวกับที่ทำให้ระบบเห็นลูกค้าแค่หนึ่งพันรายจากห้าพันเก้าร้อย
 *
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {Object} filters เงื่อนไขแบบเดียวกับ db_select_ เช่น {WO_ID: 'WO-001'}
 * @param {Object} [opts] {order, limit} · order ต้องระบุเมื่อผู้เรียกสนใจลำดับ
 * @return {Object[]}
 */
async function queryRows_(sheetName, filters, opts) {
  return (await queryRowsCounted_(sheetName, filters, opts)).rows;
}

/**
 * เหมือน queryRows_ ทุกประการ แต่บอกด้วยว่าผลถูกตัดเพราะชนเพดานหรือไม่
 *
 * **ทำไมต้องมีตัวนี้ แทนที่จะให้ผู้เรียกนับแถวเอง**
 *
 * ผู้เรียกที่นับเองทำได้อย่างเดียวคือเทียบว่าจำนวนแถวเท่ากับเพดานหรือไม่ ซึ่ง
 * **ฟ้องเกินจริงที่ขอบพอดี** — รายการที่มีครบ 1,000 พอดีและไม่ได้ขาดอะไรเลย
 * จะขึ้นคำเตือนว่าไม่ครบ · คำเตือนที่ฟ้องทั้งที่ไม่มีอะไรหายคือคำเตือนที่คนเลิกอ่าน
 * แล้ววันที่ของหายจริงก็จะไม่มีใครอ่านเหมือนกัน
 *
 * ความจริงข้อนี้มีอยู่แล้วที่นี่ เพราะที่นี่เป็นที่เดียวที่เห็นแถวที่ 1,001 ·
 * หน้าที่ของตัวนี้คือ **ไม่ทิ้งมัน** ไม่ใช่คำนวณมันขึ้นมาใหม่เป็นชุดที่สอง
 *
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {Object} filters เงื่อนไขแบบเดียวกับ db_select_
 * @param {Object} [opts] {order, limit}
 * @return {Object} {rows, truncated, limit}
 */
async function queryRowsCounted_(sheetName, filters, opts) {
  assertDataAccessAllowed_();
  opts = opts || {};
  var limit = Number(opts.limit) > 0 ? Number(opts.limit) : DB_ROWS_PER_ENTITY;

  var rows = await db_select_(sheetName, {
    filters: filters,
    // ไม่ระบุลำดับ = ปล่อยให้ฐานข้อมูลเลือกเอง ซึ่งเปลี่ยนได้ทุกเมื่อโดยไม่มีอะไรเตือน
    order: opts.order || dbColumnMap_(sheetName).systemNames[0],
    limit: limit + 1
  });

  if (rows.length > limit) {
    await logReadTruncated_(sheetName, limit);
    return { rows: rows.slice(0, limit), truncated: true, limit: limit };
  }
  return { rows: rows, truncated: false, limit: limit };
}

/**
 * คัดแถวจากภาพของแท็บด้วยเงื่อนไขชุดเดียวกับที่ส่งให้ฐานข้อมูล
 *
 * รองรับเท่าที่เส้นทางยุคชีตต้องใช้จริง คือเท่ากันพอดี กับขึ้นต้นด้วยข้อความหนึ่ง
 * ไม่ได้ทำให้ครบทุกตัวดำเนินการ เพราะทางนี้เป็นทางถอย ไม่ใช่ทางหลัก
 *
 * @param {Object[]} rows แถวทั้งหมด
 * @param {Object} filters เงื่อนไข
 * @return {Object[]}
 */
function filterSnapshotRows_(rows, filters) {
  var out = [];

  for (var i = 0; i < rows.length; i++) {
    var keep = true;
    for (var field in (filters || {})) {
      if (!Object.prototype.hasOwnProperty.call(filters, field)) continue;
      var want = filters[field];

      if (want && typeof want === 'object' && !(want instanceof Date)) {
        /*
         * หนึ่งในหลายค่า — ต้องรองรับด้วย ไม่ใช่ปล่อยให้ตกไปเข้าทางของ 'ขึ้นต้นด้วย'
         * ซึ่งจะเทียบ array กับข้อความแล้วได้ "ไม่ตรง" ทุกแถวแบบเงียบ ๆ
         * คือผลลัพธ์ว่างเปล่าที่ดูเหมือนว่าไม่มีข้อมูลจริง
         */
        if (String(want.op) === 'in') {
          var wanted = (want.value instanceof Array) ? want.value : [want.value];
          var got = rows[i][field];
          var inList = false;
          for (var w = 0; w < wanted.length; w++) {
            if (valuesEqual_(got, wanted[w])) { inList = true; break; }
          }
          if (!inList) { keep = false; break; }
          continue;
        }

        // รูปแบบ 'ข้อความ*' ของ PostgREST คือ "ขึ้นต้นด้วยข้อความนั้น"
        var pattern = String(want.value === undefined ? '' : want.value);
        var head = pattern.replace(/\*$/, '').replace(/\\([%_\\])/g, '$1');
        var text = String(rows[i][field] === null || rows[i][field] === undefined ? '' : rows[i][field]);
        var hit = (String(want.op) === 'ilike')
          ? text.toLowerCase().indexOf(head.toLowerCase()) === 0
          : text.indexOf(head) === 0;
        if (!hit) { keep = false; break; }
        continue;
      }

      if (!valuesEqual_(rows[i][field], want)) { keep = false; break; }
    }
    if (keep) out.push(rows[i]);
  }
  return out;
}

/**
 * บันทึกว่าการอ่านครั้งหนึ่งชนเพดานจนต้องตัดข้อมูลทิ้ง
 *
 * การตัดเงียบคือสิ่งที่กฎข้อ 28 มีไว้กัน · ถ้าวันหนึ่งใบงานใบหนึ่งมีประวัติเกิน
 * ห้าร้อยแถวจริง ๆ ผู้ดูแลต้องรู้จากบันทึก ไม่ใช่รู้จากการที่ผู้ใช้บอกว่า
 * "ประวัติมันหายไปบางส่วน" ซึ่งไม่มีใครสังเกตเห็นจนกว่าจะสายเกินไป
 *
 * @param {string} sheetName ชื่อแท็บ
 * @param {number} limit เพดานที่ใช้
 */
async function logReadTruncated_(sheetName, limit) {
  try {
    await logSystemEvent_(ACTION.DB_TRUNCATED,
      'อ่านตาราง ' + sheetName + ' แล้วได้เกินเพดาน ' + limit +
      ' แถว จึงตัดส่วนเกินทิ้ง — ข้อมูลที่หน้าจอเห็นไม่ครบ');
  } catch (e) {
    // บันทึกไม่ได้ก็ไม่ควรทำให้หน้าที่ผู้ใช้กำลังเปิดอยู่พังตาม
    Logger.log('บันทึกเหตุการณ์อ่านเกินเพดานไม่สำเร็จ: ' + (e && e.message));
  }
}

/**
 * ค้นทุกแถวที่คอลัมน์ field มีค่าตรงกับ value
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {string} field ชื่อคอลัมน์
 * @param {*} value ค่าที่ต้องการ
 * @return {Object[]}
 */
async function findBy_(sheetName, field, value) {
  /*
   * ตารางใหญ่ที่ย้ายแล้ว ต้องให้ฐานข้อมูลเป็นคนกรอง ไม่ใช่ลากทั้งตารางมาคัดเอง (กฎข้อ 28)
   * ส่วนตารางเล็กที่คนเพิ่มด้วยมือ อ่านจากภาพที่แคชไว้เหมือนเดิม ซึ่งถูกกว่าการยิงคำขอใหม่ทุกครั้ง
   */
  if (isLargeDbSheet_(sheetName)) {
    var one = {};
    one[field] = value;
    return await queryRows_(sheetName, one, {});
  }

  var rows = await readAll_(sheetName);
  var found = [];
  for (var i = 0; i < rows.length; i++) {
    if (valuesEqual_(rows[i][field], value)) found.push(rows[i]);
  }
  return found;
}

/**
 * จำนวนค่ามากที่สุดที่ยอมใส่ลงใน `in.(...)` หนึ่งคำขอ
 *
 * ไม่ได้มาจากเพดานของ PostgREST แต่มาจากเพดานความยาว URL ราวสองกิโลไบต์ของ
 * `UrlFetchApp` (กฎข้อ 29) · `Task_ID` ยาวราว 20 ตัวอักษร 40 ค่าจึงกินราว 900
 * ตัวอักษร เหลือที่ให้ชื่อคอลัมน์ ลำดับ และตัวกรองอื่นอย่างสบาย
 *
 * ค่านี้เป็นตาข่ายรับ ไม่ใช่แผนหลัก — แผนหลักคือขนาดหน้าที่เราตั้งเอง ซึ่งทำให้
 * รายการไม่เคยยาวเกินอยู่แล้ว · แต่ถ้าวันหนึ่งมีแผนกที่สามบนใบงานเดียวกัน
 * จำนวนจะโตขึ้นเงียบ ๆ และการแบ่งเป็นชุดทำให้มันยังทำงานถูกต้อง แค่ใช้คำขอเพิ่ม
 */
var DB_IN_CHUNK = 40;

/**
 * เรียงแถวตามรายการลำดับชุดเดียวกับที่ส่งให้ฐานข้อมูล — ใช้ในเส้นทางยุคชีต
 *
 * มีไว้เพื่อให้สองเส้นทางให้ลำดับเดียวกัน ไม่ใช่เพื่อความเร็ว · ถ้าเส้นทางยุคชีต
 * ไม่เรียงเลย เทสต์ที่พิสูจน์ลำดับจะผ่านบนฐานข้อมูลแต่ล้มบนชีต หรือแย่กว่านั้น
 * คือผ่านทั้งคู่เพราะบังเอิญข้อมูลน้อยจนลำดับไม่ต่างกัน
 *
 * เทียบเป็นข้อความเสมอ เพราะคอลัมน์ที่ใช้เรียงในระบบนี้เป็นข้อความทั้งหมด
 * (`WO_ID`, `Task_ID`, `Status`, `Visit_Start`) และรูปแบบของมันเรียงแบบข้อความ
 * ได้ถูกต้องอยู่แล้วโดยตั้งใจ
 *
 * @param {Object[]} rows แถวที่จะเรียง — ไม่ถูกแก้ ฟังก์ชันคืนชุดใหม่
 * @param {Object[]} order [{column, ascending}]
 * @return {Object[]}
 */
function sortRowsBy_(rows, order) {
  var terms = (order instanceof Array) ? order : (order ? [order] : []);
  var out = rows.slice();
  if (!terms.length) return out;

  out.sort(function (a, b) {
    for (var i = 0; i < terms.length; i++) {
      var name = (typeof terms[i] === 'string') ? terms[i] : terms[i].column;
      var asc  = (typeof terms[i] === 'string') ? true : (terms[i].ascending !== false);
      var left  = String(a[name] === null || a[name] === undefined ? '' : a[name]);
      var right = String(b[name] === null || b[name] === undefined ? '' : b[name]);
      if (left === right) continue;
      return (left < right ? -1 : 1) * (asc ? 1 : -1);
    }
    return 0;
  });
  return out;
}

/**
 * อ่านแถวที่คอลัมน์หนึ่งมีค่าอยู่ในรายการที่ให้มา — ทั้งชุดในคำขอเดียว
 *
 * **นี่คือตัวที่ทำให้หน้ารายการเลิกยิงคำขอทีละแถว** (SPEC 22.5) · การเรียกฟังก์ชัน
 * ชั้น Repo ในวนลูปบนชีตแทบไม่มีราคา เพราะข้อมูลถูกอ่านมาทั้งแผ่นแล้ว แต่บน
 * Supabase ทุกครั้งคือการเดินทางไป-กลับจริง · งาน 20 ใบจึงกลายเป็น 80 คำขอ
 * โดยที่ไม่มีอะไรผิดให้เห็น นอกจากหน้าจอที่ค่อย ๆ ช้าลงตามจำนวนงาน
 *
 * **ผู้เรียกต้องเป็นคนกำหนดขอบเขตของรายการเอง** (กฎข้อ 29) ฟังก์ชันนี้ไม่ได้
 * ทำให้รายการที่ยาวตามจำนวนข้อมูลปลอดภัยขึ้น มันแค่แบ่งเป็นชุดให้เท่านั้น
 *
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {string} field ชื่อคอลัมน์ที่ใช้เทียบ
 * @param {string[]} values ค่าที่ต้องการ — ซ้ำได้ จะถูกยุบให้เหลือตัวเดียว
 * @param {Object} [opts] {order, rowsPerValue} · rowsPerValue = เพดานแถวต่อหนึ่งค่า
 * @return {Object[]}
 */
async function queryRowsIn_(sheetName, field, values, opts) {
  opts = opts || {};
  var perValue = Number(opts.rowsPerValue) > 0 ? Number(opts.rowsPerValue) : 1;

  /*
   * ยุบค่าซ้ำก่อนเสมอ · ใบงานร่วมทำให้ `WO_ID` ซ้ำได้สองแถวในหน้าเดียว
   * ถ้าไม่ยุบ URL จะยาวขึ้นเปล่า ๆ และผลลัพธ์จะมีแถวเดิมซ้ำ ซึ่งทำให้ตัวนับผิด
   */
  var unique = [];
  var seen = {};
  for (var i = 0; i < values.length; i++) {
    var one = String(values[i] || '');
    if (!one || seen[one]) continue;
    seen[one] = true;
    unique.push(one);
  }
  if (!unique.length) return [];

  var out = [];
  for (var start = 0; start < unique.length; start += DB_IN_CHUNK) {
    var chunk = unique.slice(start, start + DB_IN_CHUNK);
    var filters = {};
    filters[field] = { op: 'in', value: chunk };
    out = out.concat(await queryRows_(sheetName, filters, {
      order: opts.order,
      limit: chunk.length * perValue
    }));
  }
  return out;
}

/**
 * จัดแถวที่อ่านมาเป็นชุด ให้เป็นตารางค้นตามค่าของคอลัมน์หนึ่ง
 *
 * ผู้เรียกจะได้หยิบของที่ต้องการด้วยคีย์ แทนการวนหาในอาร์เรย์ทุกครั้ง
 * ซึ่งกลายเป็นการวนซ้อนวนเมื่อรายการยาวขึ้น
 *
 * @param {Object[]} rows แถวที่อ่านมาแล้ว
 * @param {string} field ชื่อคอลัมน์ที่ใช้เป็นคีย์
 * @return {Object} คีย์ → อาร์เรย์ของแถว
 */
function groupRowsBy_(rows, field) {
  var out = {};
  for (var i = 0; i < rows.length; i++) {
    var key = String(rows[i][field] || '');
    if (!out[key]) out[key] = [];
    out[key].push(rows[i]);
  }
  return out;
}

/**
 * ค้นแถวแรกที่ตรงเงื่อนไข
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {string} field ชื่อคอลัมน์
 * @param {*} value ค่าที่ต้องการ
 * @return {Object|null}
 */
async function findOne_(sheetName, field, value) {
  var rows = await findBy_(sheetName, field, value);
  return rows.length ? rows[0] : null;
}

/**
 * เทียบค่าจากชีตกับค่าที่ส่งเข้ามา — ชีตอาจคืนตัวเลขหรือวันที่มาแทนข้อความ
 * @param {*} a ค่าจากชีต
 * @param {*} b ค่าที่ต้องการเทียบ
 * @return {boolean}
 */
function valuesEqual_(a, b) {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a).trim() === String(b).trim();
}

/* ---------------------------------------------------------------------------
 * การเขียน — ล็อกเฉพาะช่วงนี้เท่านั้น
 * --------------------------------------------------------------------------- */

/**
 * ขอล็อกสคริปต์ ใช้เฉพาะช่วงเขียนชีตจริง (SPEC D-7)
 * @return {Lock}
 * @throws {Error} เมื่อรอคิวนานเกิน LOCK_TIMEOUT_MS
 */
function acquireLock_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MS)) {
    throw new Error('ระบบกำลังมีผู้ใช้อื่นบันทึกข้อมูลอยู่ กรุณาลองใหม่อีกครั้ง');
  }
  return lock;
}

/**
 * ตรวจว่า object ไม่มี key ที่ไม่ตรงกับหัวคอลัมน์ในชีต
 * ดักคำสะกดผิดตั้งแต่ตอนเขียน ไม่ให้ข้อมูลหายเงียบ ๆ
 * @param {string} sheetName ชื่อแท็บ
 * @param {string[]} header รายชื่อหัวคอลัมน์
 * @param {Object} obj ข้อมูลที่จะเขียน
 * @throws {Error} เมื่อพบ key ที่ไม่มีคอลัมน์รองรับ
 */
function assertKnownFields_(sheetName, header, obj) {
  var unknown = [];
  for (var key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    if (key === ROW_FIELD) continue;
    if (indexOfField_(header, key) === -1) unknown.push(key);
  }
  if (unknown.length) {
    throw new Error('แท็บ "' + sheetName + '" ไม่มีคอลัมน์: ' + unknown.join(', ') +
      ' — ชื่อคอลัมน์ต้องตรงกับ SPEC หัวข้อ 13 ทุกตัวอักษร');
  }
}

/**
 * เติมค่าคอลัมน์มาตรฐานที่ผู้เรียกไม่ได้ระบุมา (เติมเฉพาะเมื่อแท็บมีคอลัมน์นั้นจริง)
 * @param {string[]} header รายชื่อหัวคอลัมน์
 * @param {Object} obj ข้อมูลที่จะเขียน (แก้ไขในตัว)
 * @param {string[]} fields รายชื่อคอลัมน์ที่จะเติม
 * @param {*} value ค่าที่จะเติม
 */
function fillIfMissing_(header, obj, fields, value) {
  for (var i = 0; i < fields.length; i++) {
    var field = fields[i];
    if (indexOfField_(header, field) !== -1 &&
        (obj[field] === undefined || obj[field] === null || obj[field] === '')) {
      obj[field] = value;
    }
  }
}

/**
 * เรียงค่าใน object ตามลำดับหัวคอลัมน์จริงของชีต
 * @param {string[]} header รายชื่อหัวคอลัมน์
 * @param {Object} obj ข้อมูลที่จะเขียน
 * @return {Array} ค่าทั้งแถวเรียงตามคอลัมน์
 */
function toRowArray_(header, obj) {
  var row = [];
  for (var c = 0; c < header.length; c++) {
    var field = header[c];
    var value = (field !== '' && obj[field] !== undefined) ? obj[field] : '';
    row.push(value === null ? '' : value);
  }
  return row;
}

/**
 * เพิ่มแถวใหม่ 1 แถว โดยเรียงค่าตามหัวคอลัมน์จริง ไม่ผูกกับตำแหน่ง
 * เติม Created_By / Created_Date / Updated_By / Updated_Date ให้เองเมื่อแท็บมีคอลัมน์นั้น
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {Object} obj ข้อมูลที่จะเขียน โดย key คือชื่อหัวคอลัมน์
 * @return {Object} ข้อมูลที่เขียนจริง พร้อมฟิลด์ _row
 */
async function appendRow_(sheetName, obj) {
  var written = await appendRows_(sheetName, [obj]);
  return written[0];
}

/**
 * เพิ่มหลายแถวพร้อมกันด้วย setValues() ครั้งเดียว (SPEC D-3)
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {Object[]} objs รายการข้อมูลที่จะเขียน
 * @return {Object[]} ข้อมูลที่เขียนจริง พร้อมฟิลด์ _row
 */
async function appendRows_(sheetName, objs) {
  var written = await appendRowsInner_(sheetName, objs);
  noteRepoWrite_(sheetName);
  return written;
}

/**
 * เนื้อของการเพิ่มแถว — แยกออกมาเพื่อให้ตัวห่อข้างบนแจ้งการเขียนได้ครบทุกทางออก
 * @param {string} sheetName ชื่อแท็บ
 * @param {Object[]} objs ข้อมูลที่จะเขียน
 * @return {Object[]}
 */
async function appendRowsInner_(sheetName, objs) {
  assertWritable_(sheetName);
  if (!objs || !objs.length) return [];

  var header = getHeader_(sheetName);
  var now = new Date();
  var user = currentUserEmail_();

  /*
   * ต้องประทับ Created_By / Created_Date เองที่ชั้นนี้
   *
   * ปล่อยให้ฐานข้อมูลเติม created_date เองผ่าน DEFAULT ก็ได้ค่าถูกต้อง แต่ **ไม่มีใคร
   * เติม Created_By ให้** และเจ้าของใบงานคือสิ่งที่ระบบใช้ตัดสินสิทธิ์แก้ไข ·
   * อาการที่ได้คือคนเปิดใบงานเองแล้วแก้ใบของตัวเองไม่ได้ ซึ่งไม่มีอะไรชี้ว่าสาเหตุ
   * อยู่ที่ชั้นเขียนข้อมูล · ประทับที่ชั้น Repo ที่เดียว ทุกผู้เรียกจึงได้ค่าเหมือนกันเสมอ
   */
  for (var k = 0; k < objs.length; k++) {
    assertKnownFields_(sheetName, header, objs[k]);
    fillIfMissing_(header, objs[k], [COL.CREATED_DATE, COL.UPDATED_DATE], now);
    fillIfMissing_(header, objs[k], [COL.CREATED_BY, COL.UPDATED_BY], user);
  }
  return await dbAppendRows_(sheetName, objs);
}

/**
 * แก้ไขแถวที่มี keyField = keyValue ด้วย setValues() ครั้งเดียว
 *
 * ทำ Optimistic Lock ตาม SPEC C-3: ถ้าส่ง expectedUpdatedDate มาแล้วไม่ตรงกับค่าในชีต
 * แปลว่ามีคนอื่นแก้ไปก่อนแล้ว ระบบต้องปฏิเสธและให้โหลดใหม่ ไม่ใช่เขียนทับ
 *
 * ค้นหาแถวก่อนขอล็อก แล้วล็อกเฉพาะช่วงอ่านซ้ำ 1 แถวและเขียน เพื่อไม่ให้คิวยาว (SPEC D-7)
 *
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {string} keyField ชื่อคอลัมน์ที่ใช้ค้น (ปกติคือ Primary Key)
 * @param {*} keyValue ค่าที่ต้องการค้น
 * @param {Object} patchObj เฉพาะคอลัมน์ที่ต้องการเปลี่ยน
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่ผู้ใช้เห็นตอนเปิดหน้า
 * @return {Object} ข้อมูลแถวหลังแก้ไข พร้อมฟิลด์ _row
 * @throws {Error} เมื่อไม่พบแถว หรือข้อมูลถูกแก้ไปแล้ว
 */
async function updateRow_(sheetName, keyField, keyValue, patchObj, expectedUpdatedDate) {
  var row = await updateRowInner_(sheetName, keyField, keyValue, patchObj, expectedUpdatedDate);
  noteRepoWrite_(sheetName);
  return row;
}

/**
 * เนื้อของการแก้ไข — แยกออกมาเพื่อให้ตัวห่อข้างบนแจ้งการเขียนได้ครบทุกทางออก
 * @param {string} sheetName ชื่อแท็บ
 * @param {string} keyField คอลัมน์ที่ใช้ค้น
 * @param {*} keyValue ค่าที่ค้น
 * @param {Object} patchObj คอลัมน์ที่จะเปลี่ยน
 * @param {Date|string} [expectedUpdatedDate] ค่าที่ผู้ใช้เห็นตอนเปิดหน้า
 * @return {Object}
 */
async function updateRowInner_(sheetName, keyField, keyValue, patchObj, expectedUpdatedDate) {
  assertWritable_(sheetName);

  // ค้นหาแถวนอกล็อก — ไม่ล็อกคร่อมการอ่านทั้งตาราง
  var target = await findOne_(sheetName, keyField, keyValue);
  if (!target) {
    throw new Error('ไม่พบข้อมูล ' + keyField + ' = ' + keyValue + ' ในแท็บ "' + sheetName + '"');
  }

  var header = getHeader_(sheetName);
  assertKnownFields_(sheetName, header, patchObj);

  /*
   * ไม่ต้องใช้ล็อก เพราะ Postgres แก้ทีละแถวเป็นหน่วยเดียวอยู่แล้ว
   *
   * แต่ **ยังต้องตรวจ Optimistic Lock และประทับ Updated_Date ทุกประการ**
   * ตารางแม่แบบไม่มีคอลัมน์นั้นจึงไม่เคยเข้าเงื่อนไข · ตารางธุรกรรมมีครบทุกตาราง
   * ถ้าข้ามไป ผู้ใช้สองคนที่เปิดหน้าเดียวกันจะเขียนทับกันได้โดยระบบไม่รู้ตัว
   * ซึ่งเป็นสิ่งที่ SPEC C-3 มีไว้กันมาตั้งแต่ต้น
   *
   * แถวที่เอามาเทียบคือแถวที่เพิ่งอ่านสด ๆ จาก findOne_ ข้างบน — ตารางใหญ่
   * อ่านผ่าน queryRows_ ซึ่งถามฐานข้อมูลตรง ๆ ไม่ผ่านแคช การเทียบจึงมีความหมายจริง
   */
  var stamped = {};
  for (var field in patchObj) {
    if (Object.prototype.hasOwnProperty.call(patchObj, field) && field !== ROW_FIELD) {
      stamped[field] = patchObj[field];
    }
  }

  if (indexOfField_(header, COL.UPDATED_DATE) !== -1) {
    if (expectedUpdatedDate !== undefined && expectedUpdatedDate !== null && expectedUpdatedDate !== '') {
      assertNotStale_(sheetName, header, toRowArray_(header, target), expectedUpdatedDate);
    }
    stamped[COL.UPDATED_DATE] = nextStamp_(target[COL.UPDATED_DATE]);
  }
  if (indexOfField_(header, COL.UPDATED_BY) !== -1) {
    stamped[COL.UPDATED_BY] = currentUserEmail_();
  }

  return await dbUpdateRow_(sheetName, keyField, keyValue, stamped);
}

/**
 * ตรวจ Optimistic Lock — เทียบ Updated_Date ที่ผู้ใช้ถืออยู่กับค่าปัจจุบันในชีต (SPEC C-3)
 *
 * เทียบตรงระดับมิลลิวินาที ไม่เผื่อคลาดเคลื่อน เพราะถ้าเผื่อไว้แม้แต่ 1 วินาที
 * ผู้ใช้สองคนที่กดบันทึกห่างกันไม่ถึงวินาทีจะเขียนทับกันได้โดยระบบไม่รู้ตัว
 * ค่าที่ฝั่งหน้าเว็บส่งกลับมาต้องเป็นค่าดิบที่อ่านไปเท่านั้น (Date หรือข้อความ ISO)
 * ห้ามส่งค่าที่ผ่าน Utilities.formatDate มาแล้ว เพราะเศษมิลลิวินาทีจะหายไปและถูกปฏิเสธเสมอ
 * @param {string} sheetName ชื่อแท็บ
 * @param {string[]} header รายชื่อหัวคอลัมน์
 * @param {Array} current ค่าปัจจุบันทั้งแถว
 * @param {Date|string} expectedUpdatedDate ค่าที่ผู้ใช้เห็นตอนเปิดหน้า
 * @throws {Error} เมื่อแท็บไม่มีคอลัมน์ Updated_Date หรือค่าไม่ตรง
 */
function assertNotStale_(sheetName, header, current, expectedUpdatedDate) {
  var index = indexOfField_(header, COL.UPDATED_DATE);
  if (index === -1) {
    throw new Error('แท็บ "' + sheetName + '" ไม่มีคอลัมน์ ' + COL.UPDATED_DATE +
      ' จึงตรวจการแก้ไขซ้อนกันไม่ได้');
  }

  var actual = toDate_(current[index]);
  var expected = toDate_(expectedUpdatedDate);
  if (expected === null) {
    throw new Error('ข้อมูลเวลาที่ใช้ตรวจการแก้ซ้อนไม่ถูกต้อง กรุณาโหลดข้อมูลใหม่แล้วทำรายการอีกครั้ง');
  }
  if (actual === null || actual.getTime() !== expected.getTime()) {
    throw new Error('ข้อมูลนี้ถูกแก้ไขโดยผู้ใช้อื่นไปแล้ว กรุณาโหลดข้อมูลใหม่แล้วทำรายการอีกครั้ง');
  }
}

/**
 * ค่า Updated_Date ค่าใหม่ที่ต้อง "เดินหน้า" กว่าค่าเดิมเสมอ
 *
 * ถ้าปล่อยให้ใช้ new Date() ตรง ๆ แล้วมีการแก้ไขสองครั้งตกในมิลลิวินาทีเดียวกัน
 * ค่าประทับจะเท่าเดิม ทำให้ผู้ใช้ที่ถือค่าเก่ายังเขียนทับได้โดยระบบไม่รู้ตัว
 * @param {*} previous ค่า Updated_Date เดิมในแถวนั้น
 * @return {Date}
 */
function nextStamp_(previous) {
  var now = new Date();
  var before = toDate_(previous);
  if (before && now.getTime() <= before.getTime()) return new Date(before.getTime() + 1);
  return now;
}

/**
 * แปลงค่าเป็น Date — รองรับทั้ง Date, ข้อความ ISO และตัวเลข timestamp
 * @param {*} value ค่าที่ต้องการแปลง
 * @return {Date|null} null เมื่อแปลงไม่ได้
 */
function toDate_(value) {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (value === '' || value === null || value === undefined) return null;
  var date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * ทำ Soft Delete — ตั้งคอลัมน์สถานะใช้งานของแท็บนั้นเป็น false (SPEC D-8)
 * ห้ามลบแถวจริง เพราะเลขแถวที่อ้างอิงไว้ที่อื่นจะเลื่อนทั้งหมด
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @param {*} keyValue ค่า Primary Key ของแถวที่จะปิดใช้งาน
 * @return {Object} ข้อมูลแถวหลังแก้ไข
 * @throws {Error} เมื่อแท็บนั้นไม่มีคอลัมน์สถานะใช้งาน
 */
async function deactivateRow_(sheetName, keyValue) {
  var activeField = SHEET_ACTIVE_FIELD[sheetName];
  if (!activeField) {
    throw new Error('แท็บ "' + sheetName + '" ไม่มีคอลัมน์สถานะใช้งาน จึงทำ Soft Delete ไม่ได้ ' +
      '(WO ให้ใช้ CANCEL_WO และ Task ให้ใช้ TASK_CANCEL แทน)');
  }
  var patch = {};
  patch[activeField] = false;
  return await updateRow_(sheetName, keyFieldOf_(sheetName), keyValue, patch);
}

/**
 * คอลัมน์ Primary Key ของแท็บ
 * @param {string} sheetName ชื่อแท็บจาก SHEET
 * @return {string}
 * @throws {Error} เมื่อยังไม่ได้ประกาศคีย์ของแท็บนั้นใน SHEET_KEY_FIELD
 */
function keyFieldOf_(sheetName) {
  var field = SHEET_KEY_FIELD[sheetName];
  if (!field) {
    throw new Error('ยังไม่ได้ประกาศคอลัมน์ Primary Key ของแท็บ "' + sheetName + '" ใน SHEET_KEY_FIELD');
  }
  return field;
}

/**
 * อีเมลของผู้ทำรายการนี้ — จุดเดียวที่ทั้งระบบอ่านตัวตนผู้ใช้ (กฎข้อ 16)
 *
 * ระบบแยกเป็นสองโปรเจกต์ Apps Script เพื่อไม่ต้องแชร์ Google Sheet ให้ผู้ใช้ทุกคน
 * โปรเจกต์นี้เป็นตัวที่ถือข้อมูล ผู้ใช้ไม่เคยเปิดมันโดยตรง จึงอ่านอีเมลจาก Session ไม่ได้
 * ต้องรับมาจากโปรเจกต์หน้าบ้านผ่าน doPost() พร้อมรหัสลับที่พิสูจน์ว่าคำขอมาจากหน้าบ้านจริง
 *
 * ลำดับการตัดสิน
 *   1. ชุดทดสอบสวมสิทธิ์ไว้           -> ใช้ตัวตนนั้น (เฉพาะในโหมดทดสอบ)
 *   2. กำลังให้บริการคำขอจากหน้าบ้าน -> ใช้อีเมลจากคำขอ "เท่านั้น"
 *      ว่างก็คือว่าง ห้ามถอยไปใช้ตัวตนอื่นแทนเด็ดขาด ไม่งั้นคนแปลกหน้าจะได้สิทธิ์ของเจ้าของสคริปต์
 *   3. ไม่ได้อยู่ในคำขอใดเลย          -> แปลว่ามีคนกดปุ่ม Run ในตัวแก้ไข จึงใช้บัญชีของคนนั้น
 *      ทางนี้เข้าถึงได้เฉพาะคนที่เปิดโปรเจกต์ได้อยู่แล้ว จึงไม่ใช่ช่องทางให้ใครเลี่ยงการตรวจสิทธิ์
 *
 * @return {string} อีเมลของผู้ใช้ หรือค่าว่างเมื่อระบุตัวตนไม่ได้
 */
function currentUserEmail_() {
  if (typeof TEST_IDENTITY_ !== 'undefined' && TEST_IDENTITY_ && TEST_IDENTITY_.email) {
    return String(TEST_IDENTITY_.email);
  }
  if (typeof REQUEST_CONTEXT_ !== 'undefined' && REQUEST_CONTEXT_ && REQUEST_CONTEXT_.active) {
    return String(REQUEST_CONTEXT_.email || '');
  }
  return editorUserEmail_();
}

/**
 * บัญชีของคนที่กดปุ่ม Run ในตัวแก้ไข Apps Script
 * ใช้เฉพาะตอนรันชุดทดสอบหรือรันฟังก์ชันมือ ไม่ใช่เส้นทางที่ผู้ใช้จริงเดินผ่าน
 * @return {string}
 */
function editorUserEmail_() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}
