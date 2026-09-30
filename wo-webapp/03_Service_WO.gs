/**
 * 03_Service_WO.gs — ตรรกะใบงาน: create / submit / approve / return / cancel / reopen
 *
 * อ้างอิง SPEC.md หัวข้อ 9 (ฟิลด์), 10 (PJ_ID), 20.1, 20.2, 20.5, 20.6 (ลำดับการทำงาน)
 *
 * กติกาประจำไฟล์นี้
 *   - ทุกการเปลี่ยนสถานะผ่าน changeStatus() เท่านั้น ห้ามเขียนคอลัมน์สถานะเอง (กฎข้อ 1)
 *   - ห้ามเรียก SpreadsheetApp ตรง ๆ อ่านเขียนผ่าน 01_Repo_*.gs เท่านั้น
 *   - ยังไม่ทำเรื่องไฟล์แนบและ Drive (ขั้นที่ 4) กับ Telegram (ขั้นที่ 5)
 *     จุดที่ต้องต่อของสองอย่างนั้นมีคอมเมนต์ TODO กำกับไว้แล้ว
 */

/**
 * ฟิลด์บังคับตอนสร้างใบงาน (SPEC 9.1)
 * Customer_Code ตรวจแยกต่างหากใน createWorkOrder เพราะต้องขึ้นข้อความที่บอกทางออกให้ชัด
 * ว่าต้องไปเพิ่มรหัสใน Sheet Customer ก่อน ไม่ใช่แค่บอกว่ากรอกไม่ครบ (SPEC 10.2.2)
 */
var WO_REQUIRED_FIELDS = Object.freeze([
  'Customer_Name',
  'Contact',
  'Phone',
  'Location',
  'Assignment_Type',
  'Request_Types'
]);

/**
 * ช่องที่ต้องกรอกครบตอน "ส่งขออนุมัติ" ซึ่งตรวจจากแถวที่บันทึกไว้แล้ว (SPEC 9.1)
 *
 * **ชุดนี้ต้องไม่โตตามชุดของฟอร์ม** เพราะมันถูกใช้กับใบงานที่เปิดไว้ก่อนหน้านี้
 * การเพิ่มช่องบังคับเข้ามาที่นี่ = ใบเก่าที่เปิดถูกต้องตามกติกาของวันนั้น
 * จะกลายเป็นใบที่ส่งอนุมัติใหม่ไม่ได้ทันที ทั้งที่เจ้าของใบไม่ได้ทำอะไรผิดเลย
 *
 * ช่องบังคับใหม่จึงไปอยู่ที่ WO_FORM_REQUIRED_FIELDS ซึ่งใช้ตอนสร้างและตอนแก้ไข
 * เท่านั้น · ใบที่ผ่านสองทางนั้นมากรอกครบอยู่แล้ว ส่วนใบเก่าก็เดินต่อได้ตามปกติ
 */
var WO_SUBMIT_REQUIRED_FIELDS = Object.freeze(
  WO_REQUIRED_FIELDS.concat(['Customer_Code', 'Job_Description']));

/**
 * ช่องที่ต้องกรอกครบ ทั้งตอนสร้างใบงานและตอนแก้ไข (SPEC 9.1 · 9.3)
 *
 * ชุดเดียวใช้ทั้งสองจุด เพราะระบบไม่มีขั้นบันทึกร่างแล้ว (SPEC 4.1) —
 * การกรอกใบสั่งงานเป็นการกรอกรอบเดียวจบ ไม่ได้ทยอยกรอกหลายรอบ
 * ถ้าแยกเป็นสองชุด จะมีช่องที่ใบงานผ่านเข้าไปได้ทั้งที่ยังกรอกไม่ครบ
 *
 * **โครงการเป็นช่องบังคับ** ทั้งสาย SP และสาย LAB · ชื่อโครงการเป็นส่วนหนึ่งของ
 * การออก PJ_ID (SPEC 10) และเป็นสิ่งที่ผู้อนุมัติใช้แยกงานที่ลูกค้ารายเดียวกัน
 * มีหลายโครงการพร้อมกัน · ใบที่เว้นว่างไว้จะแยกไม่ออกจากใบอื่นของลูกค้ารายเดียวกันเลย
 */
var WO_FORM_REQUIRED_FIELDS = Object.freeze(
  WO_SUBMIT_REQUIRED_FIELDS.concat(['Project']));

/**
 * ช่องที่ยังกรอกไม่ครบ พร้อมชื่อคอลัมน์ เพื่อให้หน้าจอทำเครื่องหมายถูกช่อง
 *
 * คืนทั้งชื่อคอลัมน์และชื่อไทย — ชื่อคอลัมน์ไว้ให้หน้าจอหาช่องที่ต้องไฮไลต์
 * ส่วนชื่อไทยไว้ประกอบข้อความให้คนอ่าน (SPEC 17.3)
 *
 * @param {Object} form ข้อมูลจากหน้าจอ
 * @param {string[]} fields รายชื่อคอลัมน์ที่ต้องมี
 * @return {Object[]} [{field, label}]
 */
function missingFieldsOf_(form, fields) {
  var missing = [];
  for (var i = 0; i < fields.length; i++) {
    if (isEmptyValue_(form[fields[i]])) {
      missing.push({ field: fields[i], label: fieldLabel(fields[i]) });
    }
  }
  return missing;
}

/**
 * ข้อความบอกว่าช่องไหนยังขาด — ต้องระบุชื่อช่องเสมอ ไม่ใช่บอกแค่ว่าข้อมูลไม่ครบ
 * @param {Object[]} missing ผลจาก missingFieldsOf_
 * @return {string}
 */
function missingFieldsMessage_(missing) {
  var labels = [];
  for (var i = 0; i < missing.length; i++) labels.push(missing[i].label);
  return 'ยังกรอกไม่ครบ ' + labels.length + ' ช่อง: ' + labels.join(', ');
}

/* ---------------------------------------------------------------------------
 * สร้างใบงาน
 * --------------------------------------------------------------------------- */

/**
 * สร้างใบงานใหม่ตามลำดับใน SPEC 20.1 — ลำดับข้อ 3 กับ 4 สลับกันไม่ได้
 * เพราะ PJ_ID ของสถานที่ใหม่ต้องใช้เลขของ WO ที่เพิ่งออก
 *
 * @param {Object} form ข้อมูลจากหน้าจอ โดย key คือชื่อคอลัมน์ตาม SPEC 13
 * @param {Object} user ผู้ทำรายการ {email, role|roles, department}
 * @param {Object} [options] {woIdPrefix: ตัวนำหน้าเลขที่ใบงาน}
 *        woIdPrefix มีไว้ให้ชุดทดสอบออกเลขที่ขึ้นต้นด้วย TEST- เพื่อให้ test_cleanup() ตามลบได้
 *        โค้ดจริงและ 09_Api.gs ไม่ต้องส่งค่านี้ ระบบจะใช้ PREFIX.WO ตาม SPEC 10.1
 * @return {Object} {woId, pjId, workOrder}
 * @throws {Error} เมื่อสิทธิ์ไม่พอหรือกรอกข้อมูลบังคับไม่ครบ
 */
function createWorkOrder(form, user, options) {
  form = form || {};
  options = options || {};

  // 1) ตรวจสิทธิ์ว่าเป็น ADMIN / SALE
  if (!hasRole_(user, ROLE_GROUP.ADMIN)) {
    throw new Error('เฉพาะธุรการหรือฝ่ายขายเท่านั้นที่สร้างใบงานได้');
  }

  // 2) ตรวจ Required Fields ให้ครบ "ก่อนแตะชีตใด ๆ"
  //    รหัสลูกค้าเป็นส่วนหนึ่งของ PJ_ID จึงขาดไม่ได้ และต้องบอกทางออกให้ชัด (SPEC 10.2.2)
  if (isEmptyValue_(form['Customer_Code'])) {
    throw new Error('ลูกค้ารายนี้ยังไม่มีรหัสใน Sheet Customer กรุณาเพิ่มรหัสลูกค้าก่อนเปิดใบงาน');
  }
  /*
   * ต้องครบทุกช่องตั้งแต่ตอนสร้าง เพราะใบงานจะไปอยู่ที่ผู้อนุมัติทันที ไม่มีขั้นร่างให้กลับมาเติม
   * และต้องตรวจตรงนี้ ก่อนออกเลขที่ใบงาน มิฉะนั้นเลขจะวิ่งทิ้งไปเปล่า ๆ ทุกครั้งที่กรอกไม่ครบ
   */
  var missing = missingFieldsOf_(form, WO_FORM_REQUIRED_FIELDS);
  if (missing.length) throw new Error(missingFieldsMessage_(missing));

  var assignmentType = form['Assignment_Type'];
  var route = routeOfAssignment_(assignmentType);

  // ตรวจกำหนดการก่อนแตะชีต ไม่งั้นเลขที่ใบงานจะวิ่งทิ้งไปเปล่า ๆ เมื่อข้อมูลไม่ผ่าน
  var scheduled = pickFormFields_(form);
  assertScheduleOrder_(scheduled);

  // 3) ออก WO_ID ก่อน โดยล็อกเฉพาะช่วงอ่าน–เขียนตาราง Counter
  var woId = nextRunningNumber(counterKeyOfMonth_(options.woIdPrefix || PREFIX.WO, new Date()));

  // 4) แล้วจึงหา PJ_ID — เจอของเดิมใช้ซ้ำ ไม่เจอจึงออกใหม่จากเลข WO ที่เพิ่งได้
  var pjId = resolveProjectLocation(
    form['Customer_Code'], form['Project'], form['Location'], woId,
    { customerName: form['Customer_Name'] });

  // 5) เขียนแถว WorkOrder ผ่าน changeStatus เพื่อให้สถานะตั้งต้นและ Audit_Log มาจากที่เดียว
  var fields = scheduled;
  fields['WO_ID'] = woId;
  fields['PJ_ID'] = pjId;
  fields['Route'] = route;
  fields['Request_Types'] = joinList_(form['Request_Types']);
  fields['Return_Count'] = 0;
  fields['Payment_Status'] = form['Payment_Status'] || PAYMENT.UNPAID;
  fields['Payment_Required'] = form['Payment_Required'] === true;

  changeStatus(ENTITY.WO, woId, ACTION.CREATE, user, {
    requiredFieldsOk: true,
    fields: fields
  });

  /*
   * 6) ออกใบสั่งงานฉบับแรกให้ผู้อนุมัติใช้ประกอบการตัดสินใจ (SPEC 16.1)
   *
   * ต้องอยู่หลัง changeStatus เสมอ — ใบงานถูกบันทึกเรียบร้อยแล้วก่อนถึงบรรทัดนี้
   * ถ้าออกเอกสารไม่สำเร็จ ใบงานยังอยู่ครบและสั่งออกใหม่ได้ภายหลัง
   *
   * **แต่ถ้ายังมีไฟล์รออัปโหลดอยู่ ต้องยังไม่ออก** เพราะเอกสารต้องบอกได้ว่ามีอะไร
   * แนบมาบ้าง · ออกตอนนี้จะได้ใบที่เขียนว่า "ไม่มีเอกสารแนบ" ทั้งที่ผู้ใช้เลือกไฟล์
   * ไว้แล้วและกำลังจะขึ้นในอีกไม่กี่วินาที ซึ่งเป็นข้อมูลที่ผิดบนกระดาษที่ผู้อนุมัติถืออยู่
   *
   * จำนวนไฟล์มาจากหน้าเว็บ ซึ่งเป็นฝ่ายเดียวที่รู้ว่าผู้ใช้เลือกอะไรไว้บ้าง — ค่านี้
   * ตัดสินแค่ "ออกตอนนี้หรือออกทีหลัง" ไม่ได้ให้สิทธิ์อะไรเพิ่ม และทางที่แย่ที่สุด
   * ของค่าที่ผิดคือเอกสารถูกออกช้าไปหนึ่งจังหวะ แล้วตาข่ายรองเก็บให้อยู่ดี
   */
  if (Number(options.filesPending || 0) > 0) {
    Logger.log('ใบงาน ' + woId + ' ยังมีไฟล์รออัปโหลด ' + options.filesPending +
      ' ไฟล์ จึงเลื่อนการออกใบสั่งงานไปหลังอัปโหลดเสร็จ');
  } else {
    tryGenerateWorkOrderReport_(woId, user, ACTION.CREATE);
  }

  /*
   * 7) แจ้งผู้อนุมัติของสายนั้น (SPEC 15.3 แถว SUBMIT)
   *
   * ตั้งแต่ตัดขั้นบันทึกร่างออก การเปิดใบงานคือการขออนุมัติในตัว ใบจึงไปรอที่ผู้อนุมัติทันที
   * เหตุการณ์นี้จึงเป็น SUBMIT ตามตาราง ไม่ใช่เหตุการณ์ใหม่ที่ไม่มีใครรับ
   */
  notifyEvent_(NOTIFY_EVENT.SUBMIT, getWorkOrder(woId));

  // อ่านแถวใหม่ "หลัง" ออกเอกสารแล้ว เพื่อให้หน้าจอได้ Report_URL และ Updated_Date ล่าสุด
  // ถ้าอ่านก่อน หน้าจอจะถือค่าเก่าแล้วชนกับการตรวจ Optimistic Lock ในการกดครั้งถัดไป
  return { woId: woId, pjId: pjId, workOrder: getWorkOrder(woId) };
}

/**
 * รายชื่อฟิลด์บังคับที่ยังไม่ได้กรอก
 * @param {Object} form ข้อมูลจากหน้าจอ
 * @return {string[]}
 */
function missingRequiredFields_(form) {
  var missing = [];
  for (var i = 0; i < WO_REQUIRED_FIELDS.length; i++) {
    var field = WO_REQUIRED_FIELDS[i];
    var value = form[field];
    if (isEmptyValue_(value)) missing.push(fieldLabel(field));   // ชื่อไทย ไม่ใช่ชื่อคอลัมน์ (SPEC 17.3)
  }
  if (form['Assignment_Type'] && departmentsOfAssignment(form['Assignment_Type']).length === 0 &&
      form['Assignment_Type'] !== ASSIGNMENT.UNSPECIFIED) {
    missing.push('สายงานที่เลือกไม่ถูกต้อง');
  }
  return missing;
}

/**
 * คัดเฉพาะคอลัมน์ที่หน้าสร้าง / แก้ไขมีสิทธิ์เขียนได้ (SPEC 9.3)
 *
 * ฟิลด์อย่าง Overall_Status, Approved_By หรือ Return_Count เปลี่ยนได้ทางเดียวคือผ่าน
 * Action ของมันเอง การกรองตรงนี้ทำให้ฟอร์มที่ถูกดัดแปลงส่งค่าพวกนั้นเข้ามาไม่ได้
 *
 * @param {Object} form ข้อมูลดิบจากหน้าเว็บ
 * @return {Object} เฉพาะคอลัมน์ที่อนุญาต
 */
function pickFormFields_(form) {
  var picked = {};
  for (var i = 0; i < WO_FORM_FIELDS.length; i++) {
    var field = WO_FORM_FIELDS[i];
    if (!Object.prototype.hasOwnProperty.call(form, field)) continue;

    if (WO_DATE_FIELDS.indexOf(field) !== -1) {
      picked[field] = toStoredDate_(field, form[field]);
    } else if (WO_COUNT_FIELDS.indexOf(field) !== -1) {
      picked[field] = toStoredCount_(form[field]);
    } else {
      picked[field] = form[field];
    }
  }
  return picked;
}

/** คอลัมน์จำนวนเต็มในฟอร์ม — หน้าเว็บส่งมาเป็นข้อความเสมอ ต้องแปลงก่อนเขียน */
var WO_COUNT_FIELDS = Object.freeze(['Duration_Days']);

/**
 * ค่าจำนวนเต็มในรูปที่ "ที่เก็บของวันนี้" ต้องการ (กฎข้อ 23 เหตุผลเดียวกับ toStoredDate_)
 *
 * **ช่องว่างต้องกลายเป็น null ไม่ใช่ข้อความว่าง** · Postgres ปฏิเสธข้อความว่าง
 * สำหรับคอลัมน์ integer แล้วทั้งรายการจะล้ม พร้อมข้อความที่ชี้ไปที่ชนิดข้อมูล
 * ไม่ใช่ที่ช่องบนหน้าจอ · ส่วนชีตต้องการข้อความว่างเหมือนเดิม
 *
 * ค่าที่ไม่ใช่ตัวเลข ศูนย์ และค่าติดลบ ถือว่า "ไม่ได้กำหนด" ทั้งหมด ไม่ใช่ปฏิเสธ
 * เพราะช่องนี้เป็นช่องไม่บังคับ การขัดขวางการบันทึกใบงานทั้งใบเพราะพิมพ์เลขผิด
 * ในช่องเสริม จะทำให้คนเลิกใช้ช่องนี้ไปเลย ซึ่งแย่กว่าการปล่อยให้เว้นว่าง
 *
 * @param {*} value ค่าจากฟอร์ม
 * @return {number|string|null}
 */
function toStoredCount_(value) {
  var empty = isDbSheet_(SHEET.WORK_ORDER) ? null : '';
  if (isEmptyValue_(value)) return empty;

  var number = Math.floor(Number(value));
  return (isFinite(number) && number > 0) ? number : empty;
}

/**
 * ค่าวันที่ในรูปที่ "ที่เก็บของวันนี้" ต้องการ (กฎข้อ 23)
 *
 * ชีตกับ Postgres ต้องการคนละรูปแบบ และการส่งผิดรูปไม่มีอะไรฟ้อง มีแต่วันที่เลื่อน
 *
 *   ชีต            ต้องการวัตถุ Date จริง ไม่งั้นมันจะตีความข้อความเอาเองตามภาษาของไฟล์
 *   text           `Start_Date` / `End_Date` เก็บสตริง 'YYYY-MM-DDTHH:mm' ตามที่คนเห็นบนจอ
 *                  ส่ง Date เข้าไปจะถูกแปลงเป็น ISO ที่เป็นเวลา UTC แล้ว 09:00 จะกลายเป็น 02:00
 *   date           `Start_Contact_Date` เก็บ 'YYYY-MM-DD' ไม่มีเวลาและไม่มีโซนเวลา
 *                  ส่ง Date เข้าไปจะกลายเป็น ISO เต็มรูป แล้ววันที่เลื่อนไปหนึ่งวันสำหรับ
 *                  ทุกค่าที่อยู่ก่อนเจ็ดโมงเช้าตามเวลาไทย
 *
 * @param {string} field ชื่อคอลัมน์
 * @param {*} value ค่าจากฟอร์ม
 * @return {Date|string}
 */
function toStoredDate_(field, value) {
  if (!isDbSheet_(SHEET.WORK_ORDER)) return toSheetDate_(value);
  if (isEmptyValue_(value)) return '';

  var text = String(value).trim();
  var parts = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!parts) return text;   // รูปแบบที่ไม่รู้จัก ส่งต่อไปตรง ๆ ให้ฐานข้อมูลเป็นคนปฏิเสธ

  var day = parts[1] + '-' + parts[2] + '-' + parts[3];
  if (DB_DATE_ONLY_COLUMNS.indexOf(field) !== -1) return day;

  // คอลัมน์ข้อความ: เก็บวันและเวลาตามที่ผู้ใช้เห็น เวลาที่ไม่ได้กรอกคือเที่ยงคืน
  return day + 'T' + (parts[4] || '00') + ':' + (parts[5] || '00');
}

/** คอลัมน์วันที่ในฟอร์ม — หน้าเว็บส่งมาเป็นข้อความ ต้องแปลงเป็นวันที่จริงก่อนเขียนลงชีต */
var WO_DATE_FIELDS = Object.freeze(['Start_Contact_Date', 'Start_Date', 'End_Date']);

/**
 * แปลงค่าวันที่จากหน้าเว็บให้เป็นวันที่จริงก่อนเขียนลงชีต
 *
 * หน้าเว็บส่งมาในรูป YYYY-MM-DD เพราะ google.script.run ส่ง Date ข้ามไม่ได้ (SPEC 19)
 * ถ้าเขียนลงไปเป็นข้อความ ช่องนั้นจะกลายเป็นข้อความในชีต เรียงวันที่และกรองช่วงวันไม่ได้
 * จึงประกอบเป็นวันที่ตามเขตเวลาของสคริปต์ ไม่ใช่ตีความเป็น UTC ซึ่งจะเพี้ยนไปหนึ่งวัน
 *
 * เวลานัดหมายมาในรูป YYYY-MM-DDTHH:mm จึงต้องเก็บชั่วโมงนาทีไว้ด้วย (กฎข้อ 18)
 *
 * @param {*} value ค่าจากฟอร์ม
 * @return {Date|string} วันเวลาจริง หรือค่าว่างเมื่อไม่ได้กรอก
 */
function toSheetDate_(value) {
  if (isEmptyValue_(value)) return '';
  if (value instanceof Date) return value;

  var text = String(value).trim();
  var parts = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (parts) {
    return new Date(
      Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]),
      Number(parts[4] || 0), Number(parts[5] || 0));
  }

  var parsed = toDate_(text);
  return parsed || '';
}

/**
 * ตรวจว่ากำหนดออกงานไม่มาก่อนกำหนดเข้างาน (SPEC 9.3)
 *
 * เว้นว่างได้ทั้งคู่ และกรอกมาช่องเดียวก็ได้ ตรวจเฉพาะตอนกรอกครบทั้งคู่
 * ต้องเรียกก่อนแตะชีตใด ๆ เพื่อไม่ให้เกิดแถวค้างเมื่อข้อมูลไม่ผ่าน
 *
 * @param {Object} fields ข้อมูลที่ผ่าน pickFormFields_ มาแล้ว
 * @throws {Error} เมื่อกำหนดออกงานมาก่อนกำหนดเข้างาน
 */
function assertScheduleOrder_(fields) {
  var start = toDate_(fields['Start_Date']);
  var end = toDate_(fields['End_Date']);
  if (!start || !end) return;

  if (end.getTime() < start.getTime()) {
    throw new Error('กำหนดออกงานอยู่ก่อนกำหนดเข้างาน กรุณาตรวจวันและเวลาอีกครั้ง');
  }
}

/**
 * ค่าว่างหรือไม่ — รองรับทั้งข้อความ ตัวเลข และรายการ
 * @param {*} value ค่าที่ตรวจ
 * @return {boolean}
 */
function isEmptyValue_(value) {
  if (value === null || value === undefined) return true;
  if (Object.prototype.toString.call(value) === '[object Array]') return value.length === 0;
  return String(value).trim() === '';
}

/**
 * รวมรายการหลายค่าเป็นข้อความเดียวสำหรับเก็บในเซลล์ (เช่น Request_Types)
 * @param {*} value ข้อความหรือ array
 * @return {string}
 */
function joinList_(value) {
  if (Object.prototype.toString.call(value) === '[object Array]') return value.join(', ');
  return value === null || value === undefined ? '' : String(value);
}

/**
 * สายอนุมัติของใบงานตามแผนกที่เลือก (SPEC 3) — งานที่ยังไม่ระบุแผนกเข้าสาย SP ก่อน
 * @param {string} assignmentType ค่าจาก ASSIGNMENT
 * @return {string} ค่าจาก ROUTE
 */
function routeOfAssignment_(assignmentType) {
  return assignmentType === ASSIGNMENT.LAB ? ROUTE.LAB : ROUTE.SP;
}

/**
 * คีย์ของตัวนับรายเดือน เช่น WO-2609 (SPEC 10.1 — ลำดับรีเซ็ตทุกเดือน)
 *
 * ใช้ Intl.DateTimeFormat ซึ่งทำงานเหมือนกันทั้งบน Apps Script V8 และ Cloudflare
 * Workers จึงไม่ต้องเขียนใหม่ตอนย้าย (กฎข้อ 26) · ต่างจาก Utilities.formatDate
 * ที่มีอยู่ฝั่งเดียว
 *
 * **ต้องระบุเขตเวลาไทยเสมอ** ไม่ใช่ปล่อยให้ใช้เขตเวลาของเครื่อง · ใบงานที่สร้าง
 * คืนวันที่ 30 กันยายน เวลา 23:30 ตามเวลาไทย คือวันที่ 30 กันยายน 16:30 ตาม UTC
 * ถ้าอ่านเดือนแบบ UTC จะยังได้เดือนกันยายนเหมือนกัน แต่คืนวันที่ 30 กันยายนเวลา
 * 23:30 ของเดือนที่ต่างกันเจ็ดชั่วโมงหลังเที่ยงคืนไทยจะกลายเป็นเดือนถัดไป
 * แล้วเลขที่ใบงานจะกระโดดข้ามเดือนโดยไม่มีอะไรฟ้อง (ดู test_wo_counterKeyUsesThaiMonth)
 *
 * @param {string} prefix ตัวนำหน้าจาก PREFIX
 * @param {Date} date วันที่อ้างอิง
 * @return {string}
 */
function counterKeyOfMonth_(prefix, date) {
  var parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE, year: '2-digit', month: '2-digit'
  }).formatToParts(date);

  var got = {};
  for (var i = 0; i < parts.length; i++) got[parts[i].type] = parts[i].value;

  return prefix + got.year + got.month;
}

/**
 * ออกเลขที่รันถัดไปของคีย์นั้น (SPEC D-1)
 *
 * ชั้นนี้รู้แค่รูปแบบของเลขที่ ส่วนการทำให้เลขไม่ซ้ำกันเป็นหน้าที่ของชั้น Repo
 * ซึ่งบนฐานข้อมูลใช้ RPC ที่ Postgres รับประกันว่าเป็นหน่วยเดียว —
 * ไม่มี LockService อยู่ในเส้นทางนี้อีกแล้ว (SPEC 22.4, กฎข้อ 26)
 *
 * @param {string} key คีย์ของตัวนับ เช่น WO-2609
 * @return {string} เลขที่เต็มรูปแบบ เช่น WO-2609-0001
 */
function nextRunningNumber(key) {
  return key + '-' + padNumber_(nextCounterValue_(key), 4);
}

/**
 * เติมศูนย์ข้างหน้าให้ครบจำนวนหลัก
 * @param {number} value ตัวเลข
 * @param {number} digits จำนวนหลักที่ต้องการ
 * @return {string}
 */
function padNumber_(value, digits) {
  var text = String(value);
  while (text.length < digits) text = '0' + text;
  return text;
}

/* ---------------------------------------------------------------------------
 * ส่งขออนุมัติ / อนุมัติ / ตีกลับ / ส่งต่อ / ยกเลิก / เปิดใหม่
 * --------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
 * หน้ารายละเอียดใบงาน (SPEC 17.2) — อ่านอย่างเดียวล้วน
 * --------------------------------------------------------------------------- */

/**
 * เหตุการณ์ที่ขึ้นบนเส้นเวลา — เจาะจงด้วย Entity + Action เสมอ
 *
 * ห้ามนับรวมทุกแถวของใบงานนั้น เพราะการกระทำหนึ่งครั้งเกิด Audit ได้หลายแถว
 * (สร้างใบงาน + สร้างสถานที่ + ออกเลขที่) ถ้านับรวมจะได้เส้นเวลาที่ซ้ำกันสามสี่บรรทัด
 * ต่อการกดหนึ่งครั้ง และยังมีเหตุการณ์ของระบบ เช่นการคำนวณสถานะใหม่ ปนเข้ามาด้วย
 *
 * @return {Object[]} [{entity, action, label}] เรียงตามลำดับที่ควรเกิดจริง
 */
function timelineEvents_() {
  return [
    { entity: ENTITY.WO,   action: ACTION.CREATE,        label: 'เปิดใบงาน' },
    { entity: ENTITY.WO,   action: ACTION.SUBMIT,        label: 'ส่งขออนุมัติ' },
    { entity: ENTITY.WO,   action: ACTION.RETURN,        label: 'ตีกลับให้แก้ไข' },
    { entity: ENTITY.WO,   action: ACTION.EDIT,          label: 'แก้ไขใบงาน' },
    { entity: ENTITY.WO,   action: ACTION.ACCEPT,        label: 'อนุมัติ' },
    { entity: ENTITY.TASK, action: ACTION.TASK_ACCEPT,   label: 'แผนกรับงาน' },
    { entity: ENTITY.TASK, action: ACTION.TASK_UPDATE,   label: 'อัปเดตขั้นตอน' },
    { entity: ENTITY.TASK, action: ACTION.TASK_RETURN,   label: 'แผนกตีกลับ' },
    { entity: ENTITY.TASK, action: ACTION.TASK_COMPLETE, label: 'แผนกปิดงาน' },
    { entity: ENTITY.TASK, action: ACTION.TASK_CANCEL,   label: 'แผนกยกเลิกงาน' },
    { entity: ENTITY.WO,   action: ACTION.CANCEL_WO,     label: 'ยกเลิกใบงาน' },
    { entity: ENTITY.WO,   action: ACTION.REOPEN,        label: 'เปิดงานใหม่' }
  ];
}

/**
 * เส้นเวลาของใบงาน อ่านจาก Audit_Log
 *
 * หนึ่งการกระทำอาจมีหลายแถวในบันทึก (คนละฟิลด์ที่เปลี่ยนพร้อมกัน) จึงยุบให้เหลือ
 * บรรทัดเดียวต่อการกระทำหนึ่งครั้ง โดยใช้ เวลา + Action + Entity + Task_ID เป็นกุญแจ
 *
 * @param {Object[]} logs แถวจาก listAuditByWo
 * @return {Object[]} [{label, action, entity, taskId, user, remark, at}]
 */
function timelineOf_(logs) {
  var wanted = timelineEvents_();
  var labels = {};
  for (var w = 0; w < wanted.length; w++) {
    labels[wanted[w].entity + '|' + wanted[w].action] = wanted[w].label;
  }

  var seen = {};
  var out = [];

  for (var i = 0; i < (logs || []).length; i++) {
    var row = logs[i];
    var key = String(row['Entity'] || '') + '|' + String(row['Action'] || '');
    if (!labels[key]) continue;   // เหตุการณ์ที่ไม่ได้อยู่บนเส้นเวลา เช่นการคำนวณสถานะใหม่

    /*
     * กุญแจจับกลุ่มต้องมีหมายเหตุอยู่ด้วย ไม่ใช่แค่เวลา
     *
     * เดิมใช้แค่เวลา แล้วเจอของจริง: การกระทำสองครั้งที่เกิดในมิลลิวินาทีเดียวกัน
     * (เช่นตีกลับสองรอบติดกันในชุดทดสอบ) ถูกยุบเหลือบรรทัดเดียว เหตุผลครั้งหลังหายไปเงียบ ๆ
     * บนชีตจริงเกิดยากกว่าเพราะแต่ละคำสั่งใช้เวลาเป็นวินาที แต่ "เกิดยาก" ไม่ใช่ "เกิดไม่ได้"
     * และสิ่งที่หายคือเหตุผลที่ผู้ใช้ต้องอ่าน ซึ่งไม่มีอะไรบอกว่าหายไป
     */
    var when = row['Timestamp'];
    var group = key + '|' + String(row['Task_ID'] || '') + '|' + toIsoText_(when) +
      '|' + String(row['Remark'] || '');
    if (seen[group]) continue;
    seen[group] = true;

    out.push({
      label:  labels[key],
      action: String(row['Action'] || ''),
      entity: String(row['Entity'] || ''),
      taskId: String(row['Task_ID'] || ''),
      user:   String(row['User'] || ''),
      remark: String(row['Remark'] || ''),
      at:     formatForDisplay_(when)
    });
  }
  return out;
}

/**
 * เหตุผลการตีกลับและการยกเลิกทุกครั้งที่เคยเกิด
 *
 * แถวใบงานเก็บไว้แค่ครั้งล่าสุด (Return_Reason / Cancel_Reason) ประวัติทั้งหมด
 * จึงต้องอ่านจาก Audit_Log ซึ่งเป็นที่เดียวที่เก็บของเก่าไว้ครบ
 *
 * @param {Object[]} logs แถวจาก listAuditByWo
 * @return {Object[]} [{label, user, remark, at}]
 */
function reasonHistoryOf_(logs) {
  var wanted = {};
  wanted[ENTITY.WO + '|' + ACTION.RETURN] = 'ตีกลับให้แก้ไข';
  wanted[ENTITY.WO + '|' + ACTION.CANCEL_WO] = 'ยกเลิกใบงาน';
  wanted[ENTITY.TASK + '|' + ACTION.TASK_RETURN] = 'แผนกตีกลับ';
  wanted[ENTITY.TASK + '|' + ACTION.TASK_CANCEL] = 'แผนกยกเลิกงาน';

  var seen = {};
  var out = [];
  for (var i = 0; i < (logs || []).length; i++) {
    var row = logs[i];
    var key = String(row['Entity'] || '') + '|' + String(row['Action'] || '');
    if (!wanted[key]) continue;
    if (isEmptyValue_(row['Remark'])) continue;   // ไม่มีเหตุผลก็ไม่มีอะไรให้อ่าน

    // เหตุผลต่างกันคือคนละครั้ง แม้เวลาจะตรงกันถึงมิลลิวินาที (ดูเหตุผลใน timelineOf_)
    var group = key + '|' + String(row['Task_ID'] || '') + '|' +
      toIsoText_(row['Timestamp']) + '|' + String(row['Remark'] || '');
    if (seen[group]) continue;
    seen[group] = true;

    out.push({
      label:  wanted[key],
      user:   String(row['User'] || ''),
      remark: String(row['Remark'] || ''),
      at:     formatForDisplay_(row['Timestamp'])
    });
  }
  return out;
}

/**
 * ข้อความ ISO ของค่าวันเวลา ใช้เป็นกุญแจจับกลุ่มเท่านั้น
 * @param {*} value ค่าจากชีต
 * @return {string}
 */
function toIsoText_(value) {
  var date = toDate_(value);
  return date ? date.toISOString() : String(value || '');
}

/**
 * ข้อมูลทั้งหมดของหน้ารายละเอียดใบงาน — ดึงครบในรอบเดียว (SPEC 17.2 · 17.3)
 *
 * อ่านอย่างเดียวล้วน ไม่มีการเขียนใด ๆ ในเส้นทางนี้เลย
 * ใบที่ไม่มีอยู่จริงคืน found:false ไม่ใช่โยนข้อผิดพลาด เพราะหน้าจอต้องขึ้นมาพร้อมเมนู
 * และปุ่มกลับหน้าแรกเสมอ (SPEC 17.3) ไม่ใช่จอว่างหรือข้อความดิบ
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {Object}
 */
function workOrderDetail(woId) {
  var id = String(woId || '').trim();
  if (!id) return { found: false, woId: '', reason: 'ยังไม่ได้เลือกใบงาน' };

  var wo = getWorkOrder(id);
  if (!wo) return { found: false, woId: id, reason: 'ไม่พบใบงาน ' + id };

  var logs = listAuditByWo(id);
  var tasks = listTasksByWo(id);
  var taskViews = [];

  for (var i = 0; i < tasks.length; i++) {
    var taskId = tasks[i]['Task_ID'];
    var steps = listStepsByTask(taskId);
    var stepViews = [];
    for (var s = 0; s < steps.length; s++) {
      stepViews.push({
        stepNo:   steps[s]['Step_No'],
        name:     steps[s]['Step_Name'],
        type:     steps[s]['Type'],
        status:   steps[s]['Status'],
        dueDate:  formatForDisplay_(steps[s]['Due_Date']),
        completedBy:   displayNameOf_(steps[s]['Completed_By']),
        completedDate: formatForDisplay_(steps[s]['Completed_Date'])
      });
    }

    taskViews.push({
      taskId:     taskId,
      department: tasks[i]['Department'],
      status:     tasks[i][STATUS_FIELD[ENTITY.TASK]],
      steps:      stepViews,
      progress:   stepProgressOf_(taskId),
      /*
       * วันเวลาที่แผนกนัดเข้างานจริง — ต้องอยู่ในสายตาพร้อมกับวันครบกำหนดของใบงาน
       * เพราะคำถามที่คนถามจริงคือ "เลยกำหนดแล้ว ช่างนัดไว้วันไหน"
       * ถ้าสองค่านี้อยู่คนละหน้าจอ ก็ต้องเปิดสองหน้ามาเทียบกันเองทุกครั้ง
       */
      visitStart: formatForDisplay_(tasks[i]['Visit_Start']),
      visitEnd:   formatForDisplay_(tasks[i]['Visit_End']),
      acceptedBy:   displayNameOf_(tasks[i]['Accepted_By']),
      completedBy:  displayNameOf_(tasks[i]['Completed_By']),
      cancelReason: tasks[i]['Cancel_Reason'] || '',
      returnReason: tasks[i]['Return_Reason'] || '',
      display: {
        assignedDate:  formatForDisplay_(tasks[i]['Assigned_Date']),
        acceptedDate:  formatForDisplay_(tasks[i]['Accepted_Date']),
        completedDate: formatForDisplay_(tasks[i]['Completed_Date'])
      }
    });
  }

  return {
    found: true,
    woId: id,

    /* ทุกช่องตาม SPEC 9.3 — ค่าที่แสดงให้คนอ่าน จัดรูปแบบมาจากที่นี่ทั้งหมด (กฎข้อ 19, 20) */
    workOrder: {
      woId:         id,
      status:       wo[STATUS_FIELD[ENTITY.WO]] || '',
      customerName: wo['Customer_Name'] || '',
      customerCode: isEmptyValue_(wo['Customer_Code']) ? '' : String(wo['Customer_Code']),
      salesPerson:  wo['Sales_Person'] || '',
      contact:      wo['Contact'] || '',
      phone:        isEmptyValue_(wo['Phone']) ? '' : String(wo['Phone']),
      project:      wo['Project'] || '',
      location:     wo['Location'] || '',
      pjId:         wo['PJ_ID'] || '',
      assignmentType: wo['Assignment_Type'] || '',
      route:          wo['Route'] || '',
      requestTypes:   wo['Request_Types'] || '',
      jobDescription: wo['Job_Description'] || '',
      productDetail:  wo['Product_Detail'] || '',
      workScope:      wo['Work_Scope'] || '',
      referenceDoc:   wo['Reference_Doc'] || '',
      remark:         wo['Remark'] || '',
      /*
       * ขอบเขตวันการทำงานและวันครบกำหนด (SPEC 9.2)
       *
       * ส่งจำนวนวันดิบไปด้วย เพราะหน้าแก้ไขใช้เติมกลับลงช่องกรอก ส่วน `due`
       * เป็นก้อนที่ตัดสินแล้วสำหรับแสดงผล · ทั้งคู่มาจากค่าเดียวกันในฐานข้อมูล
       * จึงไม่มีทางไม่ตรงกัน
       */
      durationDays:   isEmptyValue_(wo['Duration_Days']) ? '' : Number(wo['Duration_Days']),
      due:            dueInfoOf_(wo['Created_Date'], wo['Duration_Days'],
                        wo[STATUS_FIELD[ENTITY.WO]]),
      // ชื่อที่แสดง แปลงตอนส่งออกเท่านั้น ของที่เก็บยังเป็นอีเมล (SPEC 13)
      createdBy:      displayNameOf_(wo['Created_By']),
      approvedBy:     displayNameOf_(wo['Approved_By']),
      returnCount:    Number(wo['Return_Count'] || 0),
      returnReason:   wo['Return_Reason'] || '',
      cancelReason:   wo['Cancel_Reason'] || '',
      /*
       * ประวัติการเปิดงานซ้ำ (SPEC 20.6)
       *
       * แยกจาก `returnReason` โดยตั้งใจ · การตีกลับกับการเปิดงานใหม่เป็นคนละเรื่อง
       * และใบเดียวกันเกิดได้ทั้งสองอย่าง ถ้าใช้ช่องเดียวกันจะทับกันจนอ่านประวัติไม่ออก
       */
      reopenCount:    Number(wo['Reopen_Count'] || 0),
      reopenReason:   wo['Reopen_Reason'] || '',
      reopenedBy:     displayNameOf_(wo['Reopened_By']),
      /*
       * ลิงก์โฟลเดอร์ไม่ถูกส่งออกไปอีกแล้ว (กฎข้อ 34 · SPEC 16)
       *
       * มันเปิดได้เฉพาะบัญชีเจ้าของระบบ การส่งไปให้หน้าเว็บจึงได้แค่ค่าที่แสดงไม่ได้
       * ค่าที่ไม่มีใครแสดง ไม่ควรเดินทางออกจากเซิร์ฟเวอร์เลย
       */
      display: {
        startContactDate: formatForDisplay_(wo['Start_Contact_Date']),
        startDate:    formatForDisplay_(wo['Start_Date']),
        endDate:      formatForDisplay_(wo['End_Date']),
        createdDate:  formatForDisplay_(wo['Created_Date']),
        approvedDate: formatForDisplay_(wo['Approved_Date']),
        updatedDate:  formatForDisplay_(wo['Updated_Date']),
        reopenedDate: formatForDisplay_(wo['Reopened_Date']),
        closedDate:   formatForDisplay_(wo['Closed_Date'])
      }
    },

    tasks: taskViews,
    timeline: timelineOf_(logs),
    reasons: reasonHistoryOf_(logs),
    files: listWoFileViews(id),

    report: {
      currentUrl: wo['Report_URL'] || '',
      archive: reportArchiveList_(wo)
    },

    payment: {
      required: cellToBoolean_(wo['Payment_Required']),
      status:   wo['Payment_Status'] || PAYMENT.UNPAID,
      by:       displayNameOf_(wo['Payment_By']),
      remark:   wo['Payment_Remark'] || '',
      date:     formatForDisplay_(wo['Payment_Date'])
    }
  };
}

/**
 * ส่งใบงานขออนุมัติ (SPEC 5)
 * @param {string} woId เลขที่ใบงาน
 * @param {Object} user ผู้ทำรายการ
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} แผนการเปลี่ยนสถานะ
 */
function submitWorkOrder(woId, user, expectedUpdatedDate) {
  // ตรวจที่นี่ด้วย ไม่ใช่เชื่อการตรวจในหน้าเว็บอย่างเดียว เพราะหน้าที่ถูกดัดแปลงข้ามการตรวจได้ทั้งชุด
  var wo = getWorkOrder(woId);
  if (!wo) throw new Error('ไม่พบใบงาน ' + woId);

  /*
   * ส่งขออนุมัติต้องกรอกครบตาม SPEC 9.1 — ตรวจจากแถวที่บันทึกไว้จริง ไม่ใช่จากหน้าจอ
   * เพราะหน้าจอที่ถูกดัดแปลงจะข้ามการตรวจได้ทั้งชุด และข้อความต้องบอกว่าช่องไหนขาด
   * ไม่ใช่บอกแค่ว่าข้อมูลไม่ครบ ไม่งั้นผู้ใช้ต้องไล่หาเองทีละช่อง
   */
  var missing = missingFieldsOf_(wo, WO_SUBMIT_REQUIRED_FIELDS);
  if (missing.length) {
    throw new Error(missingFieldsMessage_(missing) + ' กรุณากรอกให้ครบก่อนส่งขออนุมัติ');
  }

  /*
   * ไฟล์แนบที่บังคับ ไม่ได้ตรวจที่นี่แล้ว — ย้ายไปเป็นเงื่อนไขของ ACCEPT (SPEC 5)
   * เพราะตอนนี้ใบงานเกิดพร้อมสถานะรออนุมัติทันที ไม่มีช่วงเวลาให้แนบไฟล์ก่อนส่ง
   * คนที่ต้องใช้เอกสารตัดสินใจคือผู้อนุมัติ ด่านจึงควรอยู่ตรงนั้น
   */
  var plan = changeStatus(ENTITY.WO, woId, ACTION.SUBMIT, user, {
    requiredFieldsOk: true,
    expectedUpdatedDate: expectedUpdatedDate
  });

  /*
   * ออกเอกสารฉบับใหม่แทนฉบับเดิมที่ข้อมูลผิด (SPEC 16.1)
   * SUBMIT เกิดได้จากใบที่ถูกตีกลับเท่านั้น ฉบับนี้จึงเป็นฉบับ "แก้แล้ว" เสมอ
   * และจะมีหมายเหตุบอกว่าเคยถูกตีกลับด้วยเหตุผลอะไรติดไปบนกระดาษ
   */
  tryGenerateWorkOrderReport_(woId, user, ACTION.SUBMIT);
  notifyEvent_(NOTIFY_EVENT.SUBMIT, getWorkOrder(woId));
  return plan;
}

/**
 * อนุมัติใบงานตามลำดับใน SPEC 20.2
 *
 * ข้อ 5 คือหัวใจของกฎข้อ 11 — ใบงานที่เคยอนุมัติแล้วถูกตีกลับจะมี Task เดิมอยู่
 * ต้องปลดพักของเดิมแล้วข้ามการสร้าง ไม่งั้นจะได้ Task ซ้อนกันสองชุดและงานจะไม่มีวันปิด
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} assignmentType แผนกผู้รับงานที่ผู้อนุมัติระบุ (ค่าจาก ASSIGNMENT)
 * @param {Object} user ผู้อนุมัติ
 * @param {Object} [options] {expectedUpdatedDate}
 * @return {Object} {plan, tasks, resumed}
 */
function approveWorkOrder(woId, assignmentType, user, options) {
  options = options || {};

  /*
   * ไฟล์แนบที่บังคับต้องครบก่อนอนุมัติ (SPEC 5, 9.4)
   *
   * ตรวจที่นี่ด้วย ไม่ใช่เชื่อการตรวจในหน้าเว็บอย่างเดียว เพราะหน้าจอที่ถูกดัดแปลง
   * จะข้ามการตรวจได้ทั้งชุด · ข้อความต้องบอกว่าขาดหัวข้อไหน ไม่ใช่บอกแค่ว่าไฟล์ไม่ครบ
   * เพื่อให้ผู้อนุมัติตีกลับพร้อมเหตุผลที่ผู้เปิดใบงานเอาไปแก้ได้ทันที
   */
  var missingTopics = missingRequiredTopics_(woId);
  if (missingTopics.length) {
    throw new Error(missingTopicsMessage_(missingTopics) +
      ' อนุมัติไม่ได้จนกว่าเอกสารจะครบ — ถ้าต้องการให้ผู้เปิดใบงานแนบเพิ่ม ให้ตีกลับพร้อมเหตุผล');
  }

  // ข้อ 1–4: Role ตรงสาย ไม่ใช่ผู้สร้างเอง และต้องระบุแผนก — ตรวจโดย Guard ใน changeStatus
  var plan = changeStatus(ENTITY.WO, woId, ACTION.ACCEPT, user, {
    assignmentType: assignmentType,
    requiredFilesOk: true,
    expectedUpdatedDate: options.expectedUpdatedDate,
    fields: {
      'Assignment_Type': assignmentType,
      'Route': routeOfAssignment_(assignmentType),
      'Approved_By': actingEmail_(user),
      'Approved_Date': new Date()
    }
  });

  // ข้อ 5: มี Task เดิมอยู่แล้วหรือไม่ (กฎข้อ 11)
  var existing = listTasksByWo(woId);
  if (existing.length) {
    var resumed = resumePausedTasks_(existing);
    // ฉบับที่แผนกพิมพ์ถือไปหน้างาน — ฉบับที่ถูกใช้จริงที่สุด (SPEC 16.1)
    tryGenerateWorkOrderReport_(woId, user, ACTION.ACCEPT);
    notifyEvent_(NOTIFY_EVENT.ACCEPT, getWorkOrder(woId), { department: assignmentType });
    return { plan: plan, tasks: existing, resumed: resumed };
  }

  // ข้อ 6–7: ยังไม่มี จึงสร้าง Task และ Task_Step ตั้งต้น
  var created = createDepartmentTasks_(woId, assignmentType, user, options);

  /*
   * ออกเอกสารหลังสร้างงานของแผนกแล้ว ไม่ใช่ก่อน (SPEC 16.1)
   * เพราะฉบับนี้ต้องมีแผนกผู้รับงาน ผู้อนุมัติ วันที่อนุมัติ และเลขงานของแผนกครบ
   */
  tryGenerateWorkOrderReport_(woId, user, ACTION.ACCEPT);

  // แจ้งห้อง Admin และห้องของแผนกผู้รับงาน (SPEC 15.3 แถว ACCEPT)
  notifyEvent_(NOTIFY_EVENT.ACCEPT, getWorkOrder(woId), { department: assignmentType });

  return { plan: plan, tasks: created, resumed: 0 };
}

/**
 * ปลดพัก Task เดิมหลังอนุมัติซ้ำ (SPEC 20.2 ข้อ 5 · กฎข้อ 11)
 *
 * ตอน Return ระบบไม่ได้แตะสถานะ Task ตาม SPEC 20.5 ข้อ 4 — Task ถูกพักด้วย Guard
 * ที่ตรวจสถานะ WO ต่างหาก โดยปกติสถานะที่จำไว้จึงตรงกับสถานะปัจจุบันอยู่แล้ว
 * และการปลดพักคือการล้างค่าที่จำไว้ทิ้งเท่านั้น
 *
 * แต่ถ้าค่าต่างกัน (เช่นข้อมูลถูกแก้ด้วยมือ หรือมีขั้นตอนใดในอนาคตไปเปลี่ยนสถานะ Task
 * ระหว่างถูกพัก) ต้องดึงกลับไปสถานะที่จำไว้ ไม่ใช่ปล่อยไว้ตามที่เป็นอยู่ —
 * ปล่อยไว้แล้วงานที่เคยรับไปทำค้างจะกลายเป็น "รอแผนกรับงาน" ใหม่ ทั้งที่แผนกทำไปครึ่งทางแล้ว
 *
 * @param {Object[]} tasks Task ทั้งหมดของใบงาน
 * @return {number} จำนวน Task ที่ปลดพัก
 */
function resumePausedTasks_(tasks) {
  var resumed = 0;
  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var before = task['Status_Before_Return'];
    if (isEmptyValue_(before)) continue;

    var current = task[STATUS_FIELD[ENTITY.TASK]];
    var patch = { 'Status_Before_Return': '' };
    if (String(current) !== String(before)) patch[STATUS_FIELD[ENTITY.TASK]] = before;

    updateTask(task['Task_ID'], patch);
    writeAudit(ENTITY.TASK, task['Task_ID'], ACTION.ACCEPT, 'Status_Before_Return',
      before, '', 'ปลดพักงานหลังอนุมัติซ้ำ', { woId: task['WO_ID'], taskId: task['Task_ID'] });

    if (patch[STATUS_FIELD[ENTITY.TASK]]) {
      writeAudit(ENTITY.TASK, task['Task_ID'], ACTION.ACCEPT, STATUS_FIELD[ENTITY.TASK],
        current, before, 'คืนสถานะงานกลับเป็นค่าก่อนถูกพัก',
        { woId: task['WO_ID'], taskId: task['Task_ID'] });
    }
    resumed++;
  }
  return resumed;
}

/**
 * สร้าง Department_Task และ Task_Step ตั้งต้น (SPEC 20.2 ข้อ 6–7)
 * @param {string} woId เลขที่ใบงาน
 * @param {string} assignmentType ค่าจาก ASSIGNMENT
 * @param {Object} user ผู้อนุมัติ
 * @return {Object[]} Task ที่สร้าง
 */
function createDepartmentTasks_(woId, assignmentType, user) {
  var departments = departmentsOfAssignment(assignmentType);
  var created = [];

  for (var i = 0; i < departments.length; i++) {
    var department = departments[i];
    var taskId = buildTaskId_(woId, department);

    changeStatus(ENTITY.TASK, taskId, ACTION.CREATE, user, {
      woId: woId,
      fields: {
        'Task_ID': taskId,
        'WO_ID': woId,
        'Department': department,
        'Assigned_Date': new Date()
      }
    });

    createStepsForTask_(taskId, department);
    created.push(getTask(taskId));
  }
  return created;
}

/**
 * เลขที่งานของแผนก — อิงเลขใบงานแล้วต่อท้ายด้วยแผนก
 *
 * ใช้เลข WO เป็นฐานเพื่อให้อ่านแล้วรู้ทันทีว่าเป็นงานของใบไหน และไม่ต้องเปิดตัวนับเพิ่ม
 * ต่อท้ายด้วยแผนกเพราะงานร่วม SERVICE_PROJECT เกิด Task 2 ตัวในใบเดียวกัน
 *
 * หมายเหตุ: นี่คือคีย์ของตาราง ไม่ใช่เลขงานที่ใช้ตั้งชื่อไฟล์ — เลขงานคือ SV_ID / LAB_ID
 * ตาม SPEC 10.1 ซึ่งจะสร้างจาก WO_ID ตอนทำเรื่องไฟล์ในขั้นที่ 4
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} department ค่าจาก DEPT
 * @return {string}
 */
function buildTaskId_(woId, department) {
  return woId + '-' + department;
}

/**
 * สร้าง Task_Step ตั้งต้นของ Task หนึ่ง (SPEC 20.2 ข้อ 7)
 *   - Service ใช้แม่แบบจากตาราง Task_Step_Template ถ้ายังไม่มีข้อมูลจึงถอยไปใช้ STEP_DEFAULT
 *   - Project ไม่สร้างงวดใด ๆ เลย แผนกเพิ่มงวดเองระหว่างทำงาน (SPEC 20.2 · ภาคผนวก ข.1)
 *   - Lab ไม่มี Step ย่อย (SPEC 7.3)
 * ห้าม hard-code จำนวนขั้นหรือจำนวนงวด (กฎข้อ 9)
 *
 * งาน Project ที่จบในวันเดียวจะไม่มีงวดเลย ซึ่งถูกต้องตามที่ตกลงไว้ — เงื่อนไข
 * "ทุกงวดเสร็จครบ" จึงเป็นจริงทันที และด่านเดียวที่เหลือคือ Report ที่บังคับ
 *
 * @param {string} taskId เลขที่งานของแผนก
 * @param {string} department แผนกเจ้าของงาน
 * @return {Object[]} Step ที่สร้าง
 */
function createStepsForTask_(taskId, department) {
  if (department !== DEPT.SERVICE) return [];

  var rows = [];
  var names = stepNamesOfDepartment_(department);
  for (var i = 0; i < names.length; i++) {
    rows.push(buildStepRow_(taskId, i + 1, names[i], STEP_TYPE.STEP));
  }
  return rows.length ? insertSteps(rows) : [];
}

/**
 * ชื่อ Step ตั้งต้นของแผนก อ่านจากตาราง Task_Step_Template ก่อนเสมอ
 * @param {string} department แผนกเจ้าของงาน
 * @return {string[]} เรียงตาม Step_No
 */
function stepNamesOfDepartment_(department) {
  var templates = listStepTemplates();
  var mine = [];
  for (var i = 0; i < templates.length; i++) {
    if (String(templates[i]['Department'] || '').toUpperCase() === department) mine.push(templates[i]);
  }
  if (!mine.length) return STEP_DEFAULT.slice();

  mine.sort(function (a, b) { return Number(a['Step_No'] || 0) - Number(b['Step_No'] || 0); });
  var names = [];
  for (var j = 0; j < mine.length; j++) names.push(mine[j]['Step_Name']);
  return names;
}

/**
 * ประกอบแถว Task_Step
 * @param {string} taskId เลขที่งานของแผนก
 * @param {number} stepNo ลำดับที่
 * @param {string} stepName ชื่อขั้นตอนหรือชื่องวด
 * @param {string} type ค่าจาก STEP_TYPE
 * @return {Object}
 */
function buildStepRow_(taskId, stepNo, stepName, type) {
  return {
    'Step_ID':   taskId + '-' + padNumber_(stepNo, 2),
    'Task_ID':   taskId,
    'Step_No':   stepNo,
    'Step_Name': stepName,
    'Type':      type,
    'Status':    STEP_STATUS.PENDING
  };
}

/**
 * ตีกลับใบงานให้ Admin/Sale แก้ไข ตามลำดับใน SPEC 20.5
 * บันทึกสถานะปัจจุบันของ Task ทุกตัวลง Status_Before_Return "ก่อนเปลี่ยนอะไร"
 * แล้วไม่แตะสถานะ Task อีกเลย — Task ถูกพักด้วย Guard ที่ตรวจสถานะ WO (กฎข้อ 13)
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} reason เหตุผลการตีกลับ
 * @param {Object} user ผู้อนุมัติ
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} แผนการเปลี่ยนสถานะ
 */
function returnWorkOrder(woId, reason, user, expectedUpdatedDate) {
  var wo = getWorkOrder(woId);
  if (!wo) throw new Error('ไม่พบใบงาน ' + woId);
  if (isEmptyValue_(reason)) throw new Error('ต้องระบุเหตุผลการตีกลับ');

  // ข้อ 2: จำสถานะเดิมของ Task ทุกตัวไว้ก่อน แล้วค่อยเปลี่ยนสถานะ WO
  rememberTaskStatuses_(woId);

  // ข้อ 3: เปลี่ยน WO เป็น RETURNED และเพิ่มตัวนับ Return_Count
  var plan = changeStatus(ENTITY.WO, woId, ACTION.RETURN, user, {
    reason: reason,
    expectedUpdatedDate: expectedUpdatedDate,
    fields: {
      'Return_Reason': reason,
      'Return_Count': Number(wo['Return_Count'] || 0) + 1,
      /*
       * ผู้ตีกลับและวันเวลา ต้องบันทึกไว้ในแถวใบงานเอง (SPEC 8)
       *
       * อ่านจาก Audit_Log ก็ได้ก็จริง แต่หน้ารายการใบงานที่ถูกตีกลับต้องแสดงค่านี้ทุกแถว
       * ถ้าต้องไปไล่หาใน Audit ทีละใบ หน้าเดียวจะกลายเป็นการอ่านชีตหลายสิบครั้ง
       */
      'Returned_By': actingEmail_(user),
      'Returned_Date': new Date()
    }
  });

  /*
   * แจ้งห้อง Admin พร้อมเหตุผล — ผู้เปิดใบงานต้องรู้ว่าต้องกลับไปแก้อะไร (SPEC 15.3)
   *
   * ต้องอยู่ "ก่อน" return เสมอ · เดิมบรรทัดนี้ถูกวางไว้หลัง return changeStatus(...)
   * จึงเป็นโค้ดที่ไม่มีวันถูกเรียก ระบบจึงเงียบสนิททุกครั้งที่มีการตีกลับ
   * และไม่มีอะไรฟ้องเลย เพราะไม่ใช่ข้อผิดพลาด แค่ไม่ทำงาน
   */
  notifyEvent_(NOTIFY_EVENT.RETURN, getWorkOrder(woId), { reason: reason });
  return plan;
}

/**
 * บันทึกสถานะปัจจุบันของ Task ทุกตัวลง Status_Before_Return (SPEC 20.5 ข้อ 2)
 * @param {string} woId เลขที่ใบงาน
 * @return {number} จำนวน Task ที่บันทึกไว้
 */
function rememberTaskStatuses_(woId) {
  var tasks = listTasksByWo(woId);
  var saved = 0;
  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var current = task[STATUS_FIELD[ENTITY.TASK]];
    if (isEmptyValue_(current)) continue;
    updateTask(task['Task_ID'], { 'Status_Before_Return': current });
    saved++;
  }
  return saved;
}

/**
 * ยกเลิกใบงานทั้งใบ — ทำได้เฉพาะก่อนอนุมัติ (SPEC 8)
 * หลังอนุมัติแล้วต้องยกเลิกรายแผนกด้วย TASK_CANCEL แทน
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} reason เหตุผลการยกเลิก
 * @param {Object} user ผู้ทำรายการ
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่
 * @return {Object} แผนการเปลี่ยนสถานะ
 */
function cancelWorkOrder(woId, reason, user, expectedUpdatedDate) {
  var plan = changeStatus(ENTITY.WO, woId, ACTION.CANCEL_WO, user, {
    reason: reason,
    expectedUpdatedDate: expectedUpdatedDate,
    fields: { 'Cancel_Reason': reason }
  });
  /*
   * ยกเลิกทั้งใบ ต้องแจ้งทุกฝ่ายที่เกี่ยวข้อง (SPEC 15.3)
   * เพราะอาจมีคนกำลังเตรียมของหรือกำลังเดินทางไปหน้างานอยู่แล้ว
   */
  notifyEvent_(NOTIFY_EVENT.WO_CANCELLED, getWorkOrder(woId), { reason: reason });
  return plan;
}

/**
 * เปิดใบงานที่ปิดไปแล้วขึ้นมาทำต่อ ตามลำดับใน SPEC 20.6
 *
 * กฎข้อ 12: ห้ามเปลี่ยนเฉพาะสถานะ WO ต้องระบุแผนกที่กลับไปทำ แล้วดึง Task ของแผนกนั้น
 * กลับเป็น IN_PROGRESS ในรายการเดียวกัน ไม่งั้น recalcWoStatus จะเห็นว่า Task ทุกตัว
 * ยัง COMPLETED แล้วปิดงานกลับทันที
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} reason เหตุผลการเปิดใหม่
 * @param {string} department แผนกที่ต้องกลับไปทำ (ค่าจาก DEPT) — บังคับ
 * @param {Object} user ผู้อนุมัติของสายนั้น
 * @param {Object} [options] {stepIds: Step ที่ต้องตั้งกลับเป็นยังไม่เสร็จ, expectedUpdatedDate}
 * @return {Object} {plan, taskPlan, steps}
 * @throws {Error} เมื่อไม่ระบุแผนก หรือไม่พบ Task ของแผนกนั้น
 */
function reopenWorkOrder(woId, reason, department, user, options) {
  options = options || {};

  // ข้อ 2: บังคับให้ระบุแผนก ถ้าไม่ระบุต้องปฏิเสธตั้งแต่ยังไม่แตะอะไร
  if (isEmptyValue_(department)) {
    throw new Error('ต้องระบุแผนกที่ต้องกลับไปทำก่อนจึงจะเปิดงานใหม่ได้');
  }
  if (isEmptyValue_(reason)) {
    throw new Error('ต้องระบุเหตุผลการเปิดงานใหม่');
  }

  var target = findTaskOfDepartment_(woId, department);
  if (!target) {
    throw new Error('ใบงานนี้ไม่มีงานของ' + toThai_(ASSIGNMENT_TH, department) + ' จึงเปิดงานใหม่ให้แผนกนั้นไม่ได้');
  }

  var before = getWorkOrder(woId);
  if (!before) throw new Error('ไม่พบใบงาน ' + woId);

  /*
   * ข้อ 4: เปลี่ยน WO เป็น IN_PROGRESS ก่อน เพื่อให้ Guard ของ Task ผ่านและ recalc ไม่ดึงกลับ
   *
   * `department` ต้องส่งเข้า payload ด้วย เพราะด่าน `reopenAllowed` ใช้มันตัดสินว่า
   * แผนกนี้เปิดงานเองได้หรือไม่ · ถ้าไม่ส่ง ด่านจะเห็นว่าไม่ระบุแผนกแล้วปฏิเสธทุกครั้ง
   *
   * `Closed_Date` ไม่ได้อยู่ในรายการนี้โดยตั้งใจ — `changeStatus` ล้างให้เองเมื่อ
   * ใบงานออกจากสถานะปิด ซึ่งเป็นที่เดียวที่รู้ว่าสถานะเดิมคืออะไร (กฎข้อ 1)
   */
  var plan = changeStatus(ENTITY.WO, woId, ACTION.REOPEN, user, {
    reason: reason,
    department: department,
    expectedUpdatedDate: options.expectedUpdatedDate,
    fields: reopenFields_(before, reason, user)
  });

  // ข้อ 3: ดึง Task ของแผนกนั้นกลับมาทำต่อในรายการเดียวกัน
  var taskPlan = changeStatus(ENTITY.TASK, target['Task_ID'], ACTION.REOPEN, user, {
    reason: reason,
    department: department
  });

  /*
   * ข้อ 3 (ต่อ): ตั้ง Step หรืองวดที่ผู้เปิดเลือกกลับเป็นยังไม่เสร็จ
   *
   * **ไม่ระบุมาก็ไม่แตะเลย ซึ่งเป็นเส้นทางที่หน้าจอใช้** ประวัติการทำงานรอบก่อน
   * ต้องไม่หาย · การรีเซ็ตทั้งหมดอัตโนมัติจะลบหลักฐานว่ารอบก่อนทำอะไรไปบ้าง
   * แล้วไม่มีทางได้กลับคืน
   */
  var steps = reopenSteps_(target['Task_ID'], options.stepIds);

  /*
   * แจ้ง Admin ว่างานที่เชื่อว่าปิดแล้วกลับมาเปิดอีก (SPEC 15.3)
   *
   * Admin เป็นเจ้าของวงจรชีวิตใบงาน ถ้าใบที่ปิดไปแล้วกลับมาโดยไม่มีใครบอก
   * ภาพรวมที่ Admin ถืออยู่จะผิดทันที และจะไปรู้ตอนสรุปยอดสิ้นเดือนซึ่งสายไปแล้ว
   */
  notifyEvent_(NOTIFY_EVENT.WO_REOPENED, getWorkOrder(woId), {
    reason: reason,
    department: department,
    // ข้อความที่คนอ่านต้องเป็นชื่อ ส่วนที่บันทึกลง Audit_Log ยังเป็นอีเมลเหมือนเดิม
    actor: displayNameOf_(actingEmail_(user))
  });

  return { plan: plan, taskPlan: taskPlan, steps: steps };
}

/**
 * ค่าที่ต้องบันทึกลงใบงานตอนเปิดงานใหม่
 *
 * **`Reopen_Count` มีไว้ให้มองออกจากรายการว่าใบไหนถูกเปิดซ้ำบ่อย** ถ้านับไม่ได้
 * การเปิดงานซ้ำจะกลายเป็นวิธีซ่อนงานที่ต้องแก้ใหม่โดยไม่มีใครเห็น · ใบที่ถูกเปิดซ้ำ
 * ห้าครั้งต้องเห็นได้จากรายการ ไม่ใช่ต้องไปไล่อ่าน Audit_Log ทีละบรรทัดถึงจะรู้
 *
 * ไม่เขียนทับ `Return_Reason` เพราะการตีกลับกับการเปิดงานใหม่เป็นคนละเรื่องกัน
 * และใบเดียวกันเกิดได้ทั้งสองอย่าง ถ้าใช้ช่องเดียวกันจะทับกันจนอ่านประวัติไม่ออก
 *
 * @param {Object} wo แถวใบงานก่อนเปลี่ยน
 * @param {string} reason เหตุผลการเปิดใหม่
 * @param {Object} user ผู้กดเปิด
 * @return {Object}
 */
function reopenFields_(wo, reason, user) {
  return {
    'Reopen_Count':   Number(wo['Reopen_Count'] || 0) + 1,
    'Reopen_Reason':  reason,
    'Reopened_By':    actingEmail_(user),
    'Reopened_Date':  new Date()
  };
}

/**
 * หา Task ของแผนกที่ระบุในใบงานนั้น
 * @param {string} woId เลขที่ใบงาน
 * @param {string} department ค่าจาก DEPT
 * @return {Object|null}
 */
function findTaskOfDepartment_(woId, department) {
  var tasks = listTasksByWo(woId);
  for (var i = 0; i < tasks.length; i++) {
    if (String(tasks[i]['Department'] || '').toUpperCase() === String(department).toUpperCase()) {
      return tasks[i];
    }
  }
  return null;
}

/**
 * ตั้ง Step ที่ระบุกลับเป็นยังไม่เสร็จ — ไม่ระบุมาก็ไม่แตะ Step ใดเลย
 * @param {string} taskId เลขที่งานของแผนก
 * @param {string[]} [stepIds] Step ที่ต้องเปิดใหม่
 * @return {Object[]} Step ที่ถูกแก้
 */
function reopenSteps_(taskId, stepIds) {
  if (!stepIds || !stepIds.length) return [];

  var updated = [];
  var steps = listStepsByTask(taskId);
  for (var i = 0; i < steps.length; i++) {
    if (stepIds.indexOf(steps[i]['Step_ID']) === -1) continue;
    /*
     * ล้างค่าวันเวลาต้องส่ง null ไม่ใช่ข้อความว่าง
     *
     * Postgres ปฏิเสธข้อความว่างสำหรับคอลัมน์ชนิดเวลา ด้วย code 22007
     * (invalid input syntax for type timestamp with time zone: "") ·
     * ส่วนยุคชีตรับข้อความว่างได้ โค้ดบรรทัดนี้จึงเคยถูกต้องและกลายเป็นผิด
     * ตอนย้ายฐานข้อมูล โดยไม่มีอะไรฟ้องจนกว่าจะมีคนกดเปิดงานใหม่จริง
     */
    updated.push(updateStep(steps[i]['Step_ID'], {
      'Status': STEP_STATUS.PENDING,
      'Completed_By': '',
      'Completed_Date': null
    }));
  }
  return updated;
}

/* ---------------------------------------------------------------------------
 * การชำระเงิน (SPEC 12)
 * --------------------------------------------------------------------------- */

/**
 * บันทึกว่าได้รับชำระเงินแล้ว — ADMIN / SALE เท่านั้น
 *
 * การชำระเงินไม่ใช่สถานะงาน จึงไม่ผ่าน changeStatus() และไม่ทำให้ Overall_Status เปลี่ยน
 * (SPEC 12) เงื่อนไขเดียวที่มันไปกั้นงานคือ Guard paymentCleared ตอนแผนกกดรับงาน
 * ใบที่ Payment_Required = true และยัง UNPAID จึงกดรับงานไม่ได้จนกว่าจะบันทึกตรงนี้
 *
 * ยังไม่รองรับการแนบสลิป — ไฟล์แนบทั้งระบบอยู่ในขั้นที่ 4 (06_Files.gs)
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} [remark] เลขที่ใบเสร็จ วิธีชำระ หรือหมายเหตุ
 * @param {Object} user ผู้บันทึก
 * @return {Object} แถวใบงานหลังบันทึก
 * @throws {Error} เมื่อไม่พบใบงาน หรือใบนั้นบันทึกว่าชำระแล้ว
 */
function recordPayment(woId, remark, user) {
  var wo = getWorkOrder(woId);
  if (!wo) throw new Error('ไม่พบใบงาน ' + woId);

  if (String(wo['Payment_Status'] || '') === PAYMENT.PAID) {
    throw new Error('ใบงานนี้บันทึกว่าได้รับชำระเงินแล้ว ไม่ต้องบันทึกซ้ำ');
  }

  var saved = updateWorkOrder(woId, {
    'Payment_Status': PAYMENT.PAID,
    'Payment_Date':   new Date(),
    'Payment_By':     actingEmail_(user),
    'Payment_Remark': isEmptyValue_(remark) ? '' : String(remark)
  });

  writeAudit(ENTITY.WO, woId, ACTION.EDIT, 'Payment_Status',
    wo['Payment_Status'] || PAYMENT.UNPAID, PAYMENT.PAID,
    isEmptyValue_(remark) ? 'บันทึกรับชำระเงิน' : String(remark), { woId: woId });

  // แจ้งห้องของแผนกที่รออยู่ทันที เพราะเป็นสัญญาณว่าเริ่มงานได้แล้ว (SPEC 12 · 15.3)
  // ข้อความบอกแค่ว่ารับชำระแล้ว ไม่มีจำนวนเงินและไม่มีรายละเอียดการชำระ (SPEC 15.4)
  notifyEvent_(NOTIFY_EVENT.PAYMENT, getWorkOrder(woId));
  return saved;
}

/**
 * ใบงานที่ถูกตีกลับทั้งหมด เรียงใบที่ค้างนานที่สุดไว้บนสุด (SPEC 17.2)
 *
 * เรียงจากเก่าไปใหม่ตั้งใจให้ผิดจากหน้าอื่น — ใบที่ถูกตีกลับนานที่สุดคือใบที่เสี่ยงถูกลืม
 * ที่สุด การเอาใบใหม่ไว้บนจะทำให้ใบเก่าจมลงไปเรื่อย ๆ จนไม่มีใครเห็น
 *
 * @return {Object[]} รายการที่หน้าจอใช้ได้ทันที
 */
function listReturnedWorkOrders() {
  /*
   * ให้ฐานข้อมูลกรองมาให้ ไม่ลากทั้งตารางมาคัดเอง (กฎข้อ 28)
   *
   * หน้านี้เปิดบ่อย และเดิมอ่านใบงานทุกใบมาคัดเหลือไม่กี่ใบทุกครั้งที่เปิด ·
   * จำนวนใบที่ถูกตีกลับไม่โตตามอายุของระบบ แต่จำนวนใบทั้งหมดโต ต้นทุนของหน้านี้
   * จึงเคยโตขึ้นเรื่อย ๆ เพื่อคำตอบที่ขนาดเท่าเดิมตลอด
   */
  var rows = findWorkOrdersBy('Overall_Status', WO_STATUS.RETURNED);
  var returned = [];

  for (var i = 0; i < rows.length; i++) {
    returned.push(returnedViewOf_(rows[i]));
  }

  returned.sort(function (a, b) { return a.returnedAt - b.returnedAt; });
  return returned;
}

/**
 * แปลงแถวใบงานที่ถูกตีกลับ เป็นสิ่งที่หน้าจอแสดงได้
 *
 * ทุกเวลาที่แสดงผ่าน formatForDisplay_() จุดเดียวของระบบ (กฎข้อ 19, 20)
 *
 * @param {Object} wo แถวใบงาน
 * @return {Object}
 */
function returnedViewOf_(wo) {
  var when = toDate_(wo['Returned_Date']) || toDate_(wo['Updated_Date']);

  return {
    woId:         wo['WO_ID'],
    customerName: wo['Customer_Name'] || '',
    project:      wo['Project'] || '',
    location:     wo['Location'] || '',
    assignmentType: wo['Assignment_Type'] || '',
    jobDescription: wo['Job_Description'] || '',
    returnReason: wo['Return_Reason'] || '',
    returnedBy:   displayNameOf_(wo['Returned_By']),
    returnCount:  Number(wo['Return_Count'] || 0),
    createdBy:    displayNameOf_(wo['Created_By']),
    // ใช้เรียงลำดับเท่านั้น ไม่ได้เอาไปแสดง จึงเป็นตัวเลขไม่ใช่ข้อความ
    returnedAt:   when ? when.getTime() : 0,
    display: {
      returnedDate: formatForDisplay_(wo['Returned_Date'] || wo['Updated_Date']),
      createdDate:  formatForDisplay_(wo['Created_Date'])
    }
  };
}

/* ---------------------------------------------------------------------------
 * แก้ไขใบงาน และค้นหาลูกค้า — ใช้โดยหน้าสร้าง/แก้ไขใบงาน
 * --------------------------------------------------------------------------- */

/**
 * แก้ไขใบงานที่ถูกตีกลับ (SPEC 5 — Action EDIT · ใช้ได้จากสถานะ RETURNED เท่านั้น)
 *
 * สถานะไม่เปลี่ยน แต่ยังต้องผ่าน changeStatus() เพราะที่นั่นคือที่เดียวที่ตรวจว่า
 * สถานะปัจจุบันแก้ไขได้ไหม ผู้กดเป็นเจ้าของใบงานหรือเปล่า และเขียน Audit ให้อัตโนมัติ
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {Object} form ข้อมูลจากหน้าจอ โดย key คือชื่อคอลัมน์ตาม SPEC 13
 * @param {Object} user ผู้ทำรายการ
 * @param {Date|string} [expectedUpdatedDate] ค่า Updated_Date ที่หน้าจอถืออยู่ (SPEC C-3)
 * @return {Object} {plan, workOrder} — workOrder คือค่าหลังแก้ไข ใช้ Updated_Date ตัวใหม่ทำรายการต่อ
 * @throws {Error} เมื่อไม่พบใบงาน กรอกข้อมูลบังคับไม่ครบ หรือมีคนแก้ไปก่อนแล้ว
 */
function editWorkOrder(woId, form, user, expectedUpdatedDate) {
  form = form || {};

  var current = getWorkOrder(woId);
  if (!current) throw new Error('ไม่พบใบงาน ' + woId);

  if (isEmptyValue_(form['Customer_Code'])) {
    throw new Error('ลูกค้ารายนี้ยังไม่มีรหัสใน Sheet Customer กรุณาเพิ่มรหัสลูกค้าก่อนเปิดใบงาน');
  }
  // แก้ไขแล้วต้องยังครบทุกช่องเหมือนตอนสร้าง — ใบที่ถูกตีกลับต้องส่งใหม่ได้ทันทีหลังแก้
  var missing = missingFieldsOf_(form, WO_FORM_REQUIRED_FIELDS);
  if (missing.length) throw new Error(missingFieldsMessage_(missing));

  var fields = pickFormFields_(form);
  assertScheduleOrder_(fields);   // ตรวจก่อนแตะทะเบียนสถานที่ ซึ่งเป็นการเขียนจุดแรกของขั้นตอนนี้

  // สถานที่อาจถูกเปลี่ยน จึงต้องหา PJ_ID ใหม่ทุกครั้ง — เจอของเดิมก็ใช้ซ้ำตามปกติ
  var pjId = resolveProjectLocation(
    form['Customer_Code'], form['Project'], form['Location'], woId,
    { customerName: form['Customer_Name'] });

  fields['PJ_ID'] = pjId;
  fields['Route'] = routeOfAssignment_(form['Assignment_Type']);
  fields['Request_Types'] = joinList_(form['Request_Types']);

  var plan = changeStatus(ENTITY.WO, woId, ACTION.EDIT, user, {
    expectedUpdatedDate: expectedUpdatedDate,
    fields: fields
  });

  return { plan: plan, workOrder: getWorkOrder(woId) };
}

/**
 * ค้นลูกค้าจากชีต Customer ด้วย "ชื่อลูกค้า" แบบมีคำนั้นอยู่ในชื่อ (SPEC 11)
 *
 * ระบบอ่านชีตนี้อย่างเดียว ไม่เขียนทับ และอ่านโดยอ้างอิงชื่อหัวคอลัมน์
 * แถวที่ไม่มีรหัสลูกค้าก็ยังคืนกลับไป แต่ติดธง hasCode ไว้ให้หน้าจอบล็อกการเปิดใบงาน
 * เพราะ PJ_ID สร้างไม่ได้ถ้าไม่มีรหัสลูกค้า (SPEC 10.2.2)
 *
 * @param {string} query คำค้นจากชื่อลูกค้า
 * @param {number} [limit=20] จำนวนผลลัพธ์สูงสุด
 * @return {Object[]} [{name, code, salesPerson, startContactDate, hasCode}]
 */
function searchCustomers(query, limit) {
  /*
   * ฐานข้อมูลกรองและจำกัดจำนวนมาให้ก่อน แล้ว filterCustomers_ คัดรอบสุดท้าย
   * ในหน่วยความจำและจัดรูปให้หน้าจอ · สองขั้นนี้ไม่ซ้ำซ้อนกัน เพราะตัวกรองของ
   * ฐานข้อมูลอาจกว้างกว่าที่ขอเล็กน้อยเมื่อคำค้นมีดอกจันปนอยู่ (ดู dbLikeLiteral_)
   * การคัดรอบสุดท้ายจึงเป็นสิ่งที่ทำให้ผลลัพธ์ตรงกับของเดิมเป๊ะทุกกรณี
   */
  return filterCustomers_(findCustomers_(query, limit), query, limit);
}

/**
 * คัดรายชื่อลูกค้าตามคำค้น — แยกออกมาเป็นฟังก์ชันล้วนเพื่อทดสอบได้โดยไม่ต้องแตะชีต
 * @param {Object[]} rows แถวจากชีต Customer
 * @param {string} query คำค้น
 * @param {number} [limit=20] จำนวนผลลัพธ์สูงสุด
 * @return {Object[]}
 */
function filterCustomers_(rows, query, limit) {
  var keyword = String(query === null || query === undefined ? '' : query).trim().toLowerCase();
  var max = Number(limit) > 0 ? Number(limit) : CUSTOMER_SEARCH_LIMIT;
  var found = [];

  for (var i = 0; i < rows.length && found.length < max; i++) {
    var name = String(rows[i][CUSTOMER_FIELD.NAME] || '').trim();
    if (!name) continue;
    if (keyword && name.toLowerCase().indexOf(keyword) === -1) continue;

    var code = String(rows[i][CUSTOMER_FIELD.CODE] || '').trim();
    found.push({
      name: name,
      code: code,
      salesPerson: String(rows[i][CUSTOMER_FIELD.SALES] || '').trim(),
      startContactDate: rows[i][CUSTOMER_FIELD.START_DATE] || '',
      hasCode: code !== ''
    });
  }
  return found;
}

/**
 * ใบงานที่รออนุมัติอยู่ในสายที่ผู้ใช้คนนี้อนุมัติได้ (SPEC 3, 17.2)
 *
 * APPROVER_SP เห็นสาย SP ซึ่งรวมงานที่ยังไม่ระบุแผนกไว้แล้ว
 * ส่วน APPROVER_LAB เห็นเฉพาะสาย LAB · ผู้ใช้ที่มีทั้งสอง Role เห็นทั้งสองสาย
 *
 * @param {Object} user ผู้ใช้จาก getCurrentUser_()
 * @return {Object[]} ใบงานที่รออนุมัติ เรียงจากใหม่ไปเก่า
 */
function listPendingApprovals(user, onlyRoute) {
  return pendingApprovalsPage_(user, onlyRoute).rows;
}

/**
 * เหมือน listPendingApprovals แต่บอกด้วยว่ารายการถูกตัดเพราะชนเพดานหรือไม่
 *
 * ความจริงข้อนี้มาจาก queryRowsCounted_ ซึ่งเป็นที่เดียวที่เห็นแถวที่เกินเพดาน ·
 * ที่นี่แค่ส่งต่อ ไม่ได้คำนวณใหม่ · ถ้าคำนวณใหม่ด้วยการนับแถวที่ได้ คำตอบจะผิด
 * ที่ขอบพอดี คือรายการที่ครบ 1,000 พอดีจะถูกฟ้องว่าไม่ครบ
 *
 * @param {Object} user ผู้ใช้จาก getCurrentUser_()
 * @param {string} [onlyRoute] จำกัดเฉพาะสายเดียว
 * @return {Object} {rows, truncated, limit}
 */
function pendingApprovalsPage_(user, onlyRoute) {
  var routes = [];
  if (hasRole_(user, [ROLE.APPROVER_SP])) routes.push(ROUTE.SP);
  if (hasRole_(user, [ROLE.APPROVER_LAB])) routes.push(ROUTE.LAB);

  /*
   * หน้าอนุมัติมีสองหน้าแยกตามสาย คนที่เป็นผู้อนุมัติทั้งสองสายจึงต้องเห็นคนละชุดในแต่ละหน้า
   * กรองที่นี่ ไม่ใช่ให้หน้าเว็บกรองเอง เพราะการส่งใบงานสายอื่นไปถึงเบราว์เซอร์แล้วค่อยซ่อน
   * แปลว่าข้อมูลนั้นออกจากเซิร์ฟเวอร์ไปแล้ว (SPEC 17.3)
   */

  if (onlyRoute) {
    routes = (routes.indexOf(onlyRoute) !== -1) ? [onlyRoute] : [];
  }
  if (!routes.length) return { rows: [], truncated: false, limit: PENDING_APPROVE_SCAN };

  /*
   * กรองสายที่ฐานข้อมูล ไม่ใช่ลากมาคัดในหน่วยความจำ (SPEC 22.5)
   *
   * สองเหตุผล — อย่างแรกคือถูกกว่า · อย่างที่สองสำคัญกว่า: เมื่อไม่มีการคัดทีหลัง
   * จำนวนแถวที่ได้กลับมา **เท่ากับ** จำนวนที่ฐานข้อมูลมีจริงภายใต้เพดานที่ขอ
   * ผู้เรียกจึงบอกได้ว่ารายการถูกตัดหรือไม่ จากการนับอย่างเดียว
   *
   * จำนวนค่าในตัวกรองสายมีได้มากสุดสองค่า ซึ่งเป็นขอบเขตที่เรากำหนดเอง ไม่ใช่
   * ขอบเขตที่โตตามข้อมูล จึงปลอดภัยตามกฎข้อ 29
   */
  var filters = {};
  filters[STATUS_FIELD[ENTITY.WO]] = WO_STATUS.PENDING_APPROVE;
  filters['Route'] = { op: 'in', value: routes };

  var page = queryRowsCounted_(SHEET.WORK_ORDER, filters, { limit: PENDING_APPROVE_SCAN });

  page.rows.sort(function (a, b) {
    var left = toDate_(a['Created_Date']);
    var right = toDate_(b['Created_Date']);
    return (right ? right.getTime() : 0) - (left ? left.getTime() : 0);
  });
  return page;
}
