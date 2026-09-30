/**
 * 01_Repo_WorkOrder.gs — อ่าน/เขียนแท็บ WorkOrder เท่านั้น (SPEC 13)
 *
 * เป็น wrapper บาง ๆ ของ 01_Repo_Sheet.gs — ห้ามมีตรรกะธุรกิจ ห้ามตรวจสถานะ
 * ห้ามตัดสินใจอะไรทั้งสิ้น การตรวจ Transition เป็นหน้าที่ของ 02_StateMachine.gs
 * และการตรวจสิทธิ์เป็นหน้าที่ของ 09_Api.gs
 *
 * WorkOrder ไม่มีคอลัมน์สถานะใช้งานตาม SPEC 13 จึงไม่มีการลบ —
 * ใบงานที่ไม่ใช้แล้วต้องยกเลิกด้วย CANCEL_WO ผ่าน changeStatus()
 */

/**
 * อ่านใบงานตามเลขที่
 * @param {string} woId เลขที่ใบงาน
 * @return {Object|null} แถวใบงานพร้อมฟิลด์ _row หรือ null เมื่อไม่พบ
 */
function getWorkOrder(woId) {
  return findOne_(SHEET.WORK_ORDER, 'WO_ID', woId);
}

/**
 * อ่านใบงานทั้งหมด
 * @return {Object[]}
 */
function listWorkOrders() {
  return readAll_(SHEET.WORK_ORDER);
}

/**
 * อ่านใบงานหลายใบตามเลขที่ — ทั้งชุดในคำขอเดียว
 *
 * ขอบเขตของรายการต้องมาจากขนาดหน้าที่ผู้เรียกตั้งเอง ไม่ใช่จากจำนวนข้อมูลที่มีอยู่ (กฎข้อ 29)
 * หนึ่งเลขที่มีได้แถวเดียว เพราะ WO_ID เป็นคีย์หลัก
 *
 * @param {string[]} woIds เลขที่ใบงาน
 * @return {Object[]}
 */
function findWorkOrdersIn(woIds) {
  return queryRowsIn_(SHEET.WORK_ORDER, 'WO_ID', woIds || [], {
    order: { column: 'WO_ID', ascending: true },
    rowsPerValue: 1
  });
}

/**
 * ค้นใบงานตามค่าในคอลัมน์ใดคอลัมน์หนึ่ง เช่น Overall_Status, Route, Created_By
 * @param {string} field ชื่อคอลัมน์ตาม SPEC 13
 * @param {*} value ค่าที่ต้องการ
 * @return {Object[]}
 */
function findWorkOrdersBy(field, value) {
  return findBy_(SHEET.WORK_ORDER, field, value);
}

/**
 * เขียนใบงานใหม่ 1 แถว
 * @param {Object} workOrder ข้อมูลใบงาน โดย key คือชื่อคอลัมน์ตาม SPEC 13
 * @return {Object} ข้อมูลที่เขียนจริง พร้อมฟิลด์ _row
 */
function insertWorkOrder(workOrder) {
  return appendRow_(SHEET.WORK_ORDER, workOrder);
}

/**
 * แก้ไขใบงาน
 * @param {string} woId เลขที่ใบงาน
 * @param {Object} patch เฉพาะคอลัมน์ที่ต้องการเปลี่ยน
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่ผู้ใช้เห็นตอนเปิดหน้า (SPEC C-3)
 * @return {Object} ข้อมูลแถวหลังแก้ไข
 */
function updateWorkOrder(woId, patch, expectedUpdatedDate) {
  return updateRow_(SHEET.WORK_ORDER, 'WO_ID', woId, patch, expectedUpdatedDate);
}
