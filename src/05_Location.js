/**
 * 05_Location.gs — PJ_ID และทะเบียน Project_Location (SPEC 10)
 *
 * PJ_ID คือกุญแจของ "สถานที่" ไม่ใช่เลขงาน — ออกครั้งเดียวต่อชุด ลูกค้า + โครงการ + สถานที่
 * แล้วใช้ซ้ำทุกใบงานถัดไปที่จุดเดียวกัน จึงห้ามเอาไปตั้งชื่อไฟล์หรือใช้เป็นเลขงาน (SPEC 10.1)
 *
 * รูปแบบคือ PJ-<รหัสลูกค้า>-<ลำดับโครงการ>-<ลำดับสถานที่> เช่น PJ-AR0001-01-01
 * ไม่เกี่ยวกับเลขใบงานเลย และลำดับทั้งสองอ่านจากคอลัมน์ Project_Seq / Location_Seq เท่านั้น
 * ห้ามแกะเลขจากตัว PJ_ID เพราะถ้ารูปแบบเปลี่ยนเมื่อไร โค้ดที่แกะจะพังทันที (SPEC 10.2.2)
 *
 * ความเสี่ยงใหญ่สุดของกติกานี้คือการพิมพ์ชื่อสถานที่ไม่ตรงกัน ("ห้องปั๊ม" กับ "ห้อง ปั๊ม")
 * ไฟล์นี้จึงรับมือสามชั้นตาม SPEC 10.3
 *   1. listLocations() ให้หน้าจอแสดงรายการเดิมให้เลือกก่อน ไม่ใช่ช่องพิมพ์เปล่า
 *   2. normalizeLocationKey_() ทำให้การเทียบไม่สนช่องว่างและตัวพิมพ์เล็กใหญ่
 *   3. findSimilarLocation() เตือนก่อนออก PJ_ID ใหม่เมื่อชื่อคล้ายของเดิมมาก
 */

/**
 * หา PJ_ID ของชุด ลูกค้า + โครงการ + สถานที่ — เจอของเดิมใช้ซ้ำ ไม่เจอจึงออกใหม่ (SPEC 10.2)
 *
 * PJ_ID ไม่เกี่ยวกับเลขใบงานเลย เป็น PJ-<รหัสลูกค้า>-<ลำดับโครงการ>-<ลำดับสถานที่>
 * woId ที่รับเข้ามาใช้บันทึกลงคอลัมน์ First_WO_ID อย่างเดียว
 *
 * ล็อกคร่อมทั้งช่วงคำนวณลำดับและเขียนแถวใหม่ เพราะถ้า 2 คนเปิดใบงานให้ลูกค้ารายเดียวกัน
 * พร้อมกัน ทั้งคู่จะคำนวณลำดับโครงการได้เลขเดียวกันแล้วชนกัน (SPEC 10.2.2)
 *
 * @param {string} customerCode รหัสลูกค้า (ใช้รหัส ไม่ใช่ชื่อ เพราะชื่อสะกดต่างกันได้)
 * @param {string} project ชื่อโครงการ (เว้นว่างได้ ถือเป็นกลุ่มโครงการหนึ่งตามปกติ)
 * @param {string} location ชื่อสถานที่ตามที่ผู้ใช้พิมพ์หรือเลือก
 * @param {string} woId เลขที่ใบงานที่เพิ่งออก ใช้บันทึกเป็นใบงานใบแรกของสถานที่นั้น
 * @param {Object} [customer] ข้อมูลประกอบตอนสร้างใหม่ {customerName}
 * @return {string} PJ_ID ที่ใบงานนี้ต้องใช้
 * @throws {Error} เมื่อไม่มีรหัสลูกค้าหรือไม่ได้ระบุสถานที่
 */
function resolveProjectLocation(customerCode, project, location, woId, customer) {
  if (isBlankText_(customerCode)) {
    throw new Error('ลูกค้ารายนี้ยังไม่มีรหัสใน Sheet Customer กรุณาเพิ่มรหัสลูกค้าก่อนเปิดใบงาน');
  }
  if (isBlankText_(location)) {
    throw new Error('ยังไม่ได้ระบุสถานที่ กรุณาเลือกจากรายการเดิม หรือเพิ่มสถานที่ใหม่ก่อน');
  }

  var existing = findLocationRow_(customerCode, project, location);
  if (existing) {
    // ใช้ PJ_ID เดิม แล้วนับจำนวนใบงานของสถานที่นั้นเพิ่ม
    var count = Number(existing['WO_Count'] || 0) + 1;
    updateLocation(existing['PJ_ID'], { 'WO_Count': count });
    return existing['PJ_ID'];
  }

  var lock = acquireLock_();
  try {
    // อ่านซ้ำในล็อก เผื่อมีคนอื่นเพิ่งสร้างสถานที่เดียวกันไปก่อนหน้าเสี้ยววินาที
    var again = findLocationRow_(customerCode, project, location);
    if (again) {
      updateLocation(again['PJ_ID'], { 'WO_Count': Number(again['WO_Count'] || 0) + 1 });
      return again['PJ_ID'];
    }

    var seq = nextLocationSeq_(customerCode, project);
    var pjId = formatPjId_(customerCode, seq.projectSeq, seq.locationSeq);

    insertLocation({
      'PJ_ID':         pjId,
      'Customer_Code': String(customerCode).trim(),
      'Customer_Name': (customer && customer.customerName) || '',
      'Project':       project === null || project === undefined ? '' : String(project).trim(),
      'Project_Seq':   seq.projectSeq,
      'Location':      String(location).trim(),
      'Location_Key':  normalizeLocationKey_(location),
      'Location_Seq':  seq.locationSeq,
      'First_WO_ID':   woId || '',
      'WO_Count':      1,
      'Active':        true
    });
    return pjId;
  } finally {
    lock.releaseLock();
  }
}

/**
 * คำนวณลำดับโครงการและลำดับสถานที่ของสถานที่ใหม่ (SPEC 10.2.2)
 *
 * ลำดับโครงการนับภายใต้รหัสลูกค้า — ชื่อโครงการที่เคยมีใช้เลขเดิม ชื่อใหม่ได้ max + 1
 * ลำดับสถานที่นับภายใต้ รหัสลูกค้า + โครงการ เริ่ม 01 ใหม่ทุกโครงการ
 *
 * อ่านลำดับจากคอลัมน์ Project_Seq / Location_Seq เท่านั้น ห้ามแกะเลขจากตัว PJ_ID
 * เพราะถ้าวันหนึ่งรูปแบบ PJ_ID เปลี่ยน โค้ดจะพังทันที
 *
 * @param {string} customerCode รหัสลูกค้า
 * @param {string} project ชื่อโครงการ
 * @return {Object} {projectSeq, locationSeq}
 */
function nextLocationSeq_(customerCode, project) {
  var rows = listAllLocations();   // รวมแถวที่ปิดใช้งานแล้ว เพื่อไม่ให้ออกเลขซ้ำของเดิม
  var customerKey = normalizeLocationKey_(customerCode);
  var projectKey = normalizeLocationKey_(project);

  var projectSeq = 0;
  var maxProjectSeq = 0;
  var maxLocationSeq = 0;

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (normalizeLocationKey_(row['Customer_Code']) !== customerKey) continue;

    var rowProjectSeq = Number(row['Project_Seq'] || 0);
    if (rowProjectSeq > maxProjectSeq) maxProjectSeq = rowProjectSeq;

    if (normalizeLocationKey_(row['Project']) !== projectKey) continue;

    // โครงการนี้เคยมีแล้ว ใช้ลำดับโครงการเดิม
    if (rowProjectSeq > 0) projectSeq = rowProjectSeq;
    var rowLocationSeq = Number(row['Location_Seq'] || 0);
    if (rowLocationSeq > maxLocationSeq) maxLocationSeq = rowLocationSeq;
  }

  return {
    projectSeq: projectSeq || (maxProjectSeq + 1),
    locationSeq: maxLocationSeq + 1
  };
}

/**
 * ประกอบ PJ_ID ตามรูปแบบ PJ-<รหัสลูกค้า>-<ลำดับโครงการ>-<ลำดับสถานที่> (SPEC 10.1)
 * ลำดับใช้ 2 หลักเป็นหลัก และขยายเป็น 3 หลักเองเมื่อเกิน 99 โดยไม่ต้องโยน error
 * @param {string} customerCode รหัสลูกค้า
 * @param {number} projectSeq ลำดับโครงการ
 * @param {number} locationSeq ลำดับสถานที่
 * @return {string}
 */
function formatPjId_(customerCode, projectSeq, locationSeq) {
  return PREFIX.PJ + String(customerCode).trim() +
    '-' + padSeq_(projectSeq) +
    '-' + padSeq_(locationSeq);
}

/**
 * เติมศูนย์ให้ลำดับเป็น 2 หลัก ส่วนเลขที่เกิน 99 ปล่อยยาวตามจริง
 * @param {number} value ลำดับ
 * @return {string}
 */
function padSeq_(value) {
  var number = Number(value) || 0;
  return number < 10 ? '0' + number : String(number);
}

/**
 * ข้อความนี้ว่างหรือไม่
 * @param {*} value ค่าที่ตรวจ
 * @return {boolean}
 */
function isBlankText_(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

/**
 * รายการสถานที่เดิมของคู่ ลูกค้า + โครงการ สำหรับให้หน้าจอแสดงเป็นตัวเลือกก่อนพิมพ์ใหม่ (SPEC 10.3)
 * @param {string} customerCode รหัสลูกค้า
 * @param {string} project ชื่อโครงการ (ว่างได้)
 * @return {Object[]} แถวจาก Project_Location ที่ยังใช้งานอยู่ เรียงตามชื่อสถานที่
 */
function listLocations(customerCode, project) {
  var rows = listActiveLocations();
  var found = [];
  for (var i = 0; i < rows.length; i++) {
    if (sameCustomerAndProject_(rows[i], customerCode, project)) found.push(rows[i]);
  }
  found.sort(function (a, b) {
    return String(a['Location'] || '').localeCompare(String(b['Location'] || ''));
  });
  return found;
}

/**
 * หาสถานที่เดิมที่ชื่อ "คล้ายกันมาก" กับที่ผู้ใช้กำลังจะพิมพ์เพิ่ม
 * ใช้ถามยืนยันก่อนออก PJ_ID ใหม่ เพื่อกันประวัติงานแตกกระจาย (SPEC 10.3)
 *
 * เกณฑ์ที่ถือว่าคล้าย
 *   - เหมือนกันเมื่อตัดช่องว่างออกทั้งหมด (ห้องปั๊ม / ห้อง ปั๊ม)
 *   - ชื่อหนึ่งเป็นส่วนหนึ่งของอีกชื่อ (ห้องปั๊ม / ห้องปั๊มน้ำ)
 *   - ต่างกันไม่เกิน 2 ตัวอักษรเมื่อชื่อยาวตั้งแต่ 4 ตัวขึ้นไป (ห้องปั๊ม / ห้องปั้ม)
 *
 * @param {string} customerCode รหัสลูกค้า
 * @param {string} project ชื่อโครงการ
 * @param {string} location ชื่อสถานที่ที่กำลังจะเพิ่ม
 * @return {Object[]} รายการที่คล้ายกัน พร้อมฟิลด์ _distance บอกระยะห่างของตัวอักษร
 */
function findSimilarLocation(customerCode, project, location) {
  var target = normalizeLocationKey_(location);
  if (!target) return [];

  var candidates = listLocations(customerCode, project);
  var similar = [];

  for (var i = 0; i < candidates.length; i++) {
    var key = normalizeLocationKey_(candidates[i]['Location']);
    if (key === target) continue;   // ตรงกันเป๊ะไม่ต้องเตือน เพราะจะใช้ PJ_ID เดิมอยู่แล้ว

    var distance = editDistance_(key, target);
    var squashedEqual = squashSpaces_(key) === squashSpaces_(target);
    var contained = key.indexOf(target) !== -1 || target.indexOf(key) !== -1;
    var closeEnough = (Math.min(key.length, target.length) >= 4) && distance <= 2;

    if (squashedEqual || contained || closeEnough) {
      var hit = candidates[i];
      hit._distance = distance;
      similar.push(hit);
    }
  }

  similar.sort(function (a, b) { return a._distance - b._distance; });
  return similar;
}

/**
 * ค้นแถวใน Project_Location ด้วยทั้ง 3 ค่าพร้อมกัน — ต่างกันแม้ค่าเดียวถือเป็นสถานที่ใหม่ (SPEC 10.2)
 * @param {string} customerCode รหัสลูกค้า
 * @param {string} project ชื่อโครงการ
 * @param {string} location ชื่อสถานที่
 * @return {Object|null}
 */
function findLocationRow_(customerCode, project, location) {
  var key = normalizeLocationKey_(location);
  var rows = listActiveLocations();
  for (var i = 0; i < rows.length; i++) {
    if (!sameCustomerAndProject_(rows[i], customerCode, project)) continue;
    if (normalizeLocationKey_(rows[i]['Location_Key'] || rows[i]['Location']) === key) return rows[i];
  }
  return null;
}

/**
 * แถวนี้เป็นของลูกค้าและโครงการเดียวกันหรือไม่
 * รหัสลูกค้าเทียบแบบไม่สนตัวพิมพ์เล็กใหญ่ ส่วนชื่อโครงการ normalize เหมือนสถานที่
 * @param {Object} row แถวจาก Project_Location
 * @param {string} customerCode รหัสลูกค้า
 * @param {string} project ชื่อโครงการ
 * @return {boolean}
 */
function sameCustomerAndProject_(row, customerCode, project) {
  var sameCustomer = normalizeLocationKey_(row['Customer_Code']) === normalizeLocationKey_(customerCode);
  var sameProject = normalizeLocationKey_(row['Project']) === normalizeLocationKey_(project);
  return sameCustomer && sameProject;
}

/**
 * ทำให้ข้อความเทียบกันได้ — ตัดช่องว่างหน้าหลัง ยุบช่องว่างซ้อนเป็นช่องเดียว
 * และไม่สนตัวพิมพ์เล็กใหญ่ (SPEC 10.3)
 * @param {*} value ข้อความที่ผู้ใช้พิมพ์
 * @return {string}
 */
function normalizeLocationKey_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * ตัดช่องว่างออกทั้งหมด ใช้จับกรณีเว้นวรรคต่างกันอย่างเดียว
 * @param {string} value ข้อความที่ normalize มาแล้ว
 * @return {string}
 */
function squashSpaces_(value) {
  return String(value).replace(/\s/g, '');
}

/**
 * ระยะห่างของตัวอักษรสองข้อความแบบ Levenshtein (จำนวนครั้งที่ต้องเพิ่ม ลบ หรือแก้ตัวอักษร)
 * ใช้กับชื่อสถานที่ซึ่งสั้น จึงไม่ต้องกังวลเรื่องความเร็ว
 * @param {string} a ข้อความแรก
 * @param {string} b ข้อความที่สอง
 * @return {number}
 */
function editDistance_(a, b) {
  a = String(a);
  b = String(b);
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  var previous = [];
  for (var j = 0; j <= b.length; j++) previous[j] = j;

  for (var i = 1; i <= a.length; i++) {
    var current = [i];
    for (var k = 1; k <= b.length; k++) {
      var cost = (a.charAt(i - 1) === b.charAt(k - 1)) ? 0 : 1;
      current[k] = Math.min(current[k - 1] + 1, previous[k] + 1, previous[k - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

