/**
 * 01_Repo_File.gs — อ่าน/เขียนแท็บ File_Index เท่านั้น (SPEC 13, 14)
 *
 * เป็น wrapper บาง ๆ ของ 01_Repo_Sheet.gs — ห้ามมีตรรกะธุรกิจ
 * การตั้งชื่อไฟล์ การจองเลขลำดับ และการอัปโหลดขึ้น Drive เป็นหน้าที่ของ 06_Files.gs
 *
 * File_Index เป็นตารางที่โตเร็ว ควรแยกเป็นไฟล์รายปีเมื่อข้อมูลเริ่มมาก (SPEC D-5, D-6)
 */

/**
 * อ่านรายการไฟล์ตามเลขที่
 * @param {string} fileId เลขที่ไฟล์ในทะเบียน
 * @return {Object|null}
 */
async function getFile(fileId) {
  return await findOne_(SHEET.FILE_INDEX, 'File_ID', fileId);
}

/**
 * อ่านไฟล์ทั้งหมดของใบงาน (เฉพาะที่ Is_Active ยังเป็นจริง)
 * @param {string} woId เลขที่ใบงาน
 * @return {Object[]}
 */
async function listFilesByWo(woId) {
  return await filesMatching_({ 'WO_ID': woId });
}

/**
 * อ่านไฟล์ทั้งหมดของงานแผนก (เฉพาะที่ Is_Active ยังเป็นจริง)
 * @param {string} taskId เลขที่งานของแผนก
 * @return {Object[]}
 */
async function listFilesByTask(taskId) {
  return await filesMatching_({ 'Task_ID': taskId });
}

/**
 * อ่านไฟล์ทั้งหมดของ Step หรืองวดงาน (เฉพาะที่ Is_Active ยังเป็นจริง)
 * @param {string} stepId เลขที่ Step
 * @return {Object[]}
 */
async function listFilesByStep(stepId) {
  return await filesMatching_({ 'Step_ID': stepId });
}

/**
 * ไฟล์ที่ตรงเงื่อนไขและยังใช้งานอยู่
 *
 * ให้ฐานข้อมูลกรองด้วยคีย์ก่อน แล้วค่อยคัดสถานะใช้งานในหน่วยความจำ (กฎข้อ 28 + 25)
 * ที่ต้องคัดสถานะทีหลัง เพราะ `Is_Active` ใช้กติกา "ช่องว่างแปลว่ายังใช้อยู่"
 * ซึ่งตัวกรองของฐานข้อมูลตอบไม่ได้ ถ้ามีแถวเก่าที่ค่าเป็น NULL หลงเหลืออยู่
 *
 * ผลที่กรองมาแล้วมีไม่กี่สิบแถว การคัดต่อในหน่วยความจำจึงไม่ใช่การลากทั้งตารางมาคัด
 *
 * @param {Object} filters เงื่อนไขของทะเบียนไฟล์
 * @return {Object[]}
 */
async function filesMatching_(filters) {
  return activeRowsOf_(SHEET.FILE_INDEX,
    await queryRows_(SHEET.FILE_INDEX, filters, { order: 'File_ID' }));
}

/**
 * อ่านทะเบียนไฟล์ทั้งหมด รวมแถวที่ปิดใช้งานแล้ว
 * @return {Object[]}
 */
async function listFiles() {
  return await readAll_(SHEET.FILE_INDEX);
}

/**
 * เขียนทะเบียนไฟล์ใหม่ 1 แถว
 * @param {Object} file ข้อมูลไฟล์
 * @return {Object}
 */
async function insertFile(file) {
  return await appendRow_(SHEET.FILE_INDEX, file);
}

/**
 * เขียนทะเบียนไฟล์หลายแถวพร้อมกัน
 * @param {Object[]} files รายการไฟล์
 * @return {Object[]}
 */
async function insertFiles(files) {
  return await appendRows_(SHEET.FILE_INDEX, files);
}

/**
 * แก้ไขทะเบียนไฟล์ เช่นเพิ่มเลข Version เมื่ออัปโหลดทับ
 * @param {string} fileId เลขที่ไฟล์
 * @param {Object} patch เฉพาะคอลัมน์ที่ต้องการเปลี่ยน
 * @return {Object}
 */
async function updateFile(fileId, patch) {
  return await updateRow_(SHEET.FILE_INDEX, 'File_ID', fileId, patch);
}

/**
 * ปิดใช้งานไฟล์ด้วยการตั้ง Is_Active = false (SPEC D-8) — ห้ามลบแถวจริง
 * ไฟล์บน Drive ยังอยู่ ผู้ใช้จึงกู้คืนได้ถ้าลบผิด
 * @param {string} fileId เลขที่ไฟล์
 * @return {Object}
 */
async function deactivateFile(fileId) {
  return await deactivateRow_(SHEET.FILE_INDEX, fileId);
}

/**
 * กรองรายการที่อ่านมาแล้วด้วยค่าในคอลัมน์หนึ่ง — กรองใน memory ไม่อ่านชีตซ้ำ
 * @param {Object[]} rows แถวที่อ่านมาแล้ว
 * @param {string} field ชื่อคอลัมน์
 * @param {*} value ค่าที่ต้องการ
 * @return {Object[]}
 */
function filterRows_(rows, field, value) {
  var found = [];
  for (var i = 0; i < rows.length; i++) {
    if (valuesEqual_(rows[i][field], value)) found.push(rows[i]);
  }
  return found;
}
