/**
 * 01_Repo_Location.gs — อ่าน/เขียนแท็บ Project_Location เท่านั้น (SPEC 13)
 *
 * เป็น wrapper บาง ๆ ของ 01_Repo_Sheet.gs — ห้ามมีตรรกะธุรกิจ
 * การตัดสินว่าจะออก PJ_ID ใหม่หรือใช้ของเดิม และการ normalize Location_Key
 * เป็นหน้าที่ของ resolveProjectLocation() ใน 05_Location.gs ไม่ใช่ที่นี่ (SPEC 10)
 */

/**
 * อ่านทะเบียนสถานที่ตาม PJ_ID
 * @param {string} pjId รหัสสถานที่ (ไม่ใช่เลขงาน)
 * @return {Object|null}
 */
function getLocation(pjId) {
  return findOne_(SHEET.PROJECT_LOCATION, 'PJ_ID', pjId);
}

/**
 * อ่านทะเบียนสถานที่ทั้งหมด รวมแถวที่ปิดใช้งานแล้ว
 * (ชื่อ listLocations() ถูกใช้โดย 05_Location.gs ซึ่งกรองตามลูกค้าและโครงการให้แล้ว)
 * @return {Object[]}
 */
function listAllLocations() {
  return readAll_(SHEET.PROJECT_LOCATION);
}

/**
 * อ่านเฉพาะทะเบียนสถานที่ที่ยังใช้งานอยู่ (คอลัมน์ Active)
 * @return {Object[]}
 */
function listActiveLocations() {
  return readAllActive_(SHEET.PROJECT_LOCATION);
}

/**
 * ค้นทะเบียนสถานที่ตามค่าในคอลัมน์ใดคอลัมน์หนึ่ง เช่น Customer_Code, Location_Key
 * @param {string} field ชื่อคอลัมน์ตาม SPEC 13
 * @param {*} value ค่าที่ต้องการ
 * @return {Object[]}
 */
function findLocationsBy(field, value) {
  return findBy_(SHEET.PROJECT_LOCATION, field, value);
}

/**
 * เขียนทะเบียนสถานที่ใหม่ 1 แถว
 * @param {Object} location ข้อมูลทะเบียนสถานที่
 * @return {Object}
 */
function insertLocation(location) {
  return appendRow_(SHEET.PROJECT_LOCATION, location);
}

/**
 * แก้ไขทะเบียนสถานที่ เช่นเพิ่มค่า WO_Count
 * @param {string} pjId รหัสสถานที่
 * @param {Object} patch เฉพาะคอลัมน์ที่ต้องการเปลี่ยน
 * @return {Object}
 */
function updateLocation(pjId, patch) {
  return updateRow_(SHEET.PROJECT_LOCATION, 'PJ_ID', pjId, patch);
}

/**
 * ปิดใช้งานทะเบียนสถานที่ด้วยการตั้ง Active = false (SPEC D-8) — ห้ามลบแถวจริง
 * @param {string} pjId รหัสสถานที่
 * @return {Object}
 */
function deactivateLocation(pjId) {
  return deactivateRow_(SHEET.PROJECT_LOCATION, pjId);
}
