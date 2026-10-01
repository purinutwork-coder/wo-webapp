/**
 * 07_Notify.gs — แจ้งเตือนผ่าน Telegram (SPEC 15)
 *
 * ไฟล์นี้เป็นที่เดียวของทั้งระบบที่คุยกับ Telegram · การยิงจริงผ่าน httpSend_ ใน 01_Db.gs
 * กฎเดียวกับที่ใช้กับ SpreadsheetApp, DriveApp และ DocumentApp — วันที่เปลี่ยนช่องทาง
 * แจ้งเตือนจาก Telegram ไปเป็นอย่างอื่น จะแก้ไฟล์เดียวจบ · มีเทสต์สแกนคุมไว้
 *
 * กฎเหล็กสามข้อที่ห้ามละเมิด (SPEC 15.4 · CLAUDE.md กฎข้อ 10)
 *   1. ส่ง "หลัง" บันทึกสถานะสำเร็จแล้วเท่านั้น และห่อ try/catch แยกไว้เสมอ
 *      ส่งไม่สำเร็จห้ามทำให้สถานะย้อนกลับ ให้บันทึก NOTIFY_FAILED ไว้ตามทีหลัง
 *   2. ต้องใช้ muteHttpExceptions แล้วตรวจรหัสตอบกลับเอง — ไม่ตรวจเท่ากับไม่รู้ว่าส่งไม่ถึง
 *   3. ข้อความต้อง escape อักขระ HTML ก่อนส่ง ไม่งั้นชื่อลูกค้าที่มี & < > จะทำให้
 *      Telegram ปฏิเสธทั้งข้อความ แล้วเงียบหายไปทั้งใบ
 *
 * ข้อมูลที่ห้ามใส่ในข้อความ: เบอร์โทรลูกค้า ราคา และรายละเอียดการชำระเงิน
 * กลุ่ม Telegram เชิญคนเข้าง่ายมาก ข้อความจึงมีเท่าที่คนรับงานต้องใช้จริงเท่านั้น
 */

/** ที่อยู่ของ Telegram Bot API — ต่อท้ายด้วย Token แล้วตามด้วยชื่อคำสั่ง */
var TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

/** เหตุการณ์ที่แจ้งเตือนได้ ตามตาราง SPEC 15.3 */
var NOTIFY_EVENT = Object.freeze({
  SUBMIT:        'SUBMIT',          // ขออนุมัติ (รวมตอนเปิดใบงาน เพราะเปิดแล้วไปรออนุมัติทันที)
  ACCEPT:        'ACCEPT',          // ผู้อนุมัติอนุมัติผ่าน
  RETURN:        'RETURN',          // ตีกลับให้แก้ไข
  TASK_ACCEPT:   'TASK_ACCEPT',     // แผนกกดรับงาน
  TASK_UPDATE:   'TASK_UPDATE',     // อัปเดตขั้นตอนหรืองวดงาน
  TASK_COMPLETE: 'TASK_COMPLETE',   // แผนกปิดงาน
  TASK_CANCEL:   'TASK_CANCEL',     // แผนกยกเลิกงานของตัวเอง
  WO_COMPLETED:  'WO_COMPLETED',    // ใบงานปิดครบทุกแผนก
  WO_CANCELLED:  'WO_CANCELLED',    // ใบงานถูกยกเลิก
  WO_REOPENED:   'WO_REOPENED',     // ใบงานที่ปิดแล้วถูกเปิดขึ้นมาทำต่อ
  PAYMENT:       'PAYMENT'          // บันทึกรับชำระเงิน
});

/**
 * ปิดการแจ้งเตือนชั่วคราว — ชุดทดสอบเท่านั้น (เหตุผลเดียวกับ REPORT_DISABLED_)
 * การรันหนึ่งรอบกดปุ่มนับร้อยครั้ง ถ้าส่งจริงทุกครั้งห้องแชทจะถูกถล่มและโดนจำกัดอัตราส่ง
 */
var NOTIFY_DISABLED_ = false;

/**
 * กล่องเก็บข้อความแทนการส่งจริง — ชุดทดสอบเท่านั้น
 *
 * เป็น null ในการใช้งานจริงเสมอ · เมื่อเป็น array ตัวส่งจะหย่อนข้อความลงกล่องนี้แทน
 * ที่ต้องมีเพราะข้อความที่ประกอบขึ้นคือสิ่งที่ต้องพิสูจน์ (escape ถูกไหม มีเบอร์โทรปนไหม
 * เข้าห้องถูกไหม) และการพิสูจน์ด้วยการยิงออกเน็ตจริงคือการทดสอบที่เชื่อถือไม่ได้
 */
var NOTIFY_OUTBOX_ = null;

/* ---------------------------------------------------------------------------
 * ส่วนที่ 1 — ตารางว่าเหตุการณ์ไหนเข้าห้องไหน (SPEC 15.3)
 * --------------------------------------------------------------------------- */

/**
 * ห้องปลายทางของเหตุการณ์หนึ่ง
 *
 * ตารางนี้คือ SPEC 15.3 แปลงเป็นโค้ด — ที่เดียวที่ตัดสินว่าใครได้รับข่าว
 * แยกเป็นฟังก์ชันล้วนเพื่อให้เทสต์เทียบได้ครบทุกเหตุการณ์โดยไม่ต้องส่งอะไรเลย
 *
 * @param {string} event ค่าจาก NOTIFY_EVENT
 * @param {Object} context {route, department} สายอนุมัติและแผนกผู้รับงานของใบนั้น
 * @return {string[]} รายชื่อห้อง (ค่าจาก NOTIFY_TARGET) ไม่ซ้ำกัน
 */
function notifyTargetsOf_(event, context) {
  context = context || {};
  var approver = (String(context.route || '') === ROUTE.LAB)
    ? NOTIFY_TARGET.APPROVER_LAB : NOTIFY_TARGET.APPROVER_SP;
  var departments = departmentTargetsOf_(context.department);
  var targets = [];

  if (event === NOTIFY_EVENT.SUBMIT) targets = [approver];
  else if (event === NOTIFY_EVENT.ACCEPT) targets = [NOTIFY_TARGET.ADMIN].concat(departments);
  else if (event === NOTIFY_EVENT.RETURN) targets = [NOTIFY_TARGET.ADMIN];
  else if (event === NOTIFY_EVENT.TASK_ACCEPT) targets = [NOTIFY_TARGET.ADMIN];
  else if (event === NOTIFY_EVENT.TASK_UPDATE) targets = [NOTIFY_TARGET.ADMIN];
  else if (event === NOTIFY_EVENT.TASK_COMPLETE) targets = [NOTIFY_TARGET.ADMIN];
  else if (event === NOTIFY_EVENT.TASK_CANCEL) targets = [NOTIFY_TARGET.ADMIN, approver];
  else if (event === NOTIFY_EVENT.WO_COMPLETED) targets = [NOTIFY_TARGET.ADMIN];
  // ยกเลิกทั้งใบ = ทุกฝ่ายที่เกี่ยวข้องต้องรู้ เพราะอาจมีคนกำลังเตรียมของหรือเดินทางอยู่
  else if (event === NOTIFY_EVENT.WO_CANCELLED) {
    targets = [NOTIFY_TARGET.ADMIN, approver].concat(departments);
  }
  /*
   * เปิดงานใหม่ = Admin ต้องรู้ (SPEC 15.3)
   *
   * Admin เป็นเจ้าของวงจรชีวิตใบงาน · ถ้างานที่ Admin เชื่อว่าปิดแล้วกลับมาเปิด
   * โดยไม่มีใครบอก ภาพรวมที่ Admin ถืออยู่จะผิดทันที แล้วจะไปรู้ตอนสรุปยอด
   * สิ้นเดือน ซึ่งสายเกินกว่าจะทำอะไรได้
   *
   * ไม่ส่งเข้าห้องแผนก เพราะคนกดคือแผนกเองในกรณีที่พบบ่อยที่สุด
   * การส่งข่าวกลับไปหาคนที่เพิ่งกดเอง คือเสียงรบกวนที่ทำให้คนเลิกอ่านห้องนั้น
   */
  else if (event === NOTIFY_EVENT.WO_REOPENED) targets = [NOTIFY_TARGET.ADMIN];
  else if (event === NOTIFY_EVENT.PAYMENT) targets = departments;

  return uniqueList_(targets);
}

/**
 * เหตุการณ์นี้เป็นเหตุการณ์ "ระดับใบงาน" หรือไม่
 *
 * สองตัวนี้ต่างจากตัวอื่นตรงที่มันพูดเรื่องเดียวกับข้อความระดับ Task ที่เพิ่งออกไป
 * จึงต้องผ่านกติกาจำนวน Task ก่อน ส่วนเหตุการณ์อื่นส่งได้ตามปกติเสมอ
 *
 * @param {string} event ค่าจาก NOTIFY_EVENT
 * @return {boolean}
 */
function isWoLevelEvent_(event) {
  return event === NOTIFY_EVENT.WO_COMPLETED || event === NOTIFY_EVENT.WO_CANCELLED;
}

/**
 * ควรแจ้งเหตุการณ์ระดับใบงานหรือไม่ — ตัดสินจากจำนวน Task จริงของใบนั้น (SPEC 15.3)
 *
 * ปัญหาที่เจอจากการใช้งานจริง: งานแผนกเดียว ผู้รับได้ข้อความสองรอบเรื่องเดียวกัน
 * รอบแรกตอนแผนกปิดงาน รอบสองตอนใบงานปิดตาม ทั้งที่เป็นเหตุการณ์เดียวกันในสายตาคนอ่าน
 *
 * ต้องตัดสินจาก "จำนวน Department_Task" ไม่ใช่จาก Assignment_Type
 * เพราะจำนวน Task จริงคือสิ่งเดียวที่บอกว่ามีข้อความระดับ Task ออกไปแล้วกี่ครั้ง
 * สายงานที่เลือกไว้ตอนเปิดใบไม่ได้บอกเรื่องนั้น — ใบที่เลือกงานร่วมแต่ยังไม่อนุมัติ
 * ก็ยังไม่มี Task สักตัว และใบที่เลือกแผนกเดียวก็อาจถูกเปิดงานใหม่จนมี Task เพิ่มได้
 *
 *   0 Task        แจ้ง   — ใบที่ถูกยกเลิกตั้งแต่ยังไม่อนุมัติ ไม่เคยมีข้อความระดับ Task เลย
 *                         ถ้าระงับด้วยจะไม่มีใครรู้ว่าใบนี้ถูกยกเลิก
 *   1 Task        ไม่แจ้ง — ข้อความตอนแผนกปิดหรือยกเลิกงาน บอกเรื่องเดียวกันไปแล้ว
 *   2 Task ขึ้นไป แจ้ง   — ข้อความระดับ Task บอกแค่ว่าแผนกหนึ่งเสร็จ ยังไม่ได้บอกว่าทั้งใบปิด
 *
 * @param {number} taskCount จำนวน Department_Task ของใบงานนั้น
 * @return {boolean}
 */
function shouldNotifyWoLevel_(taskCount) {
  return Number(taskCount || 0) !== 1;
}

/**
 * ห้องของแผนกผู้รับงาน — งานร่วมสองแผนกต้องได้ทั้งสองห้อง
 * @param {string} department ค่าจาก ASSIGNMENT
 * @return {string[]}
 */
function departmentTargetsOf_(department) {
  var value = String(department || '');
  if (value === ASSIGNMENT.SERVICE) return [NOTIFY_TARGET.SERVICE];
  if (value === ASSIGNMENT.PROJECT) return [NOTIFY_TARGET.PROJECT];
  if (value === ASSIGNMENT.LAB) return [NOTIFY_TARGET.LAB];
  if (value === ASSIGNMENT.SERVICE_PROJECT) {
    return [NOTIFY_TARGET.SERVICE, NOTIFY_TARGET.PROJECT];
  }
  return [];   // ยังไม่ระบุแผนก ยังไม่มีห้องของแผนกให้ส่ง
}

/**
 * รายการที่ไม่ซ้ำกัน โดยคงลำดับเดิมไว้
 * @param {string[]} list รายการตั้งต้น
 * @return {string[]}
 */
function uniqueList_(list) {
  var seen = {};
  var out = [];
  for (var i = 0; i < (list || []).length; i++) {
    var value = String(list[i] || '');
    if (!value || seen[value]) continue;
    seen[value] = true;
    out.push(value);
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * ส่วนที่ 2 — ข้อความ
 * --------------------------------------------------------------------------- */

/** หัวข้อภาษาไทยของแต่ละเหตุการณ์ — ขึ้นต้นข้อความ ให้อ่านปราดเดียวรู้ว่าเรื่องอะไร */
var NOTIFY_TITLE_TH = Object.freeze({
  'SUBMIT':        'ใบงานรออนุมัติ',
  'ACCEPT':        'อนุมัติแล้ว ส่งงานให้แผนก',
  'RETURN':        'ใบงานถูกตีกลับให้แก้ไข',
  'TASK_ACCEPT':   'แผนกรับงานแล้ว',
  'TASK_UPDATE':   'อัปเดตความคืบหน้า',
  'TASK_COMPLETE': 'แผนกปิดงานแล้ว',
  'TASK_CANCEL':   'แผนกยกเลิกงาน',
  'WO_COMPLETED':  'ใบงานเสร็จสิ้น',
  'WO_CANCELLED':  'ใบงานถูกยกเลิก',
  'WO_REOPENED':   'เปิดงานที่ปิดแล้วขึ้นมาทำต่อ',
  'PAYMENT':       'รับชำระเงินแล้ว เริ่มงานได้'
});

/**
 * แปลงอักขระที่ Telegram ตีความเป็น HTML ให้เป็นข้อความธรรมดา
 *
 * ต้องทำก่อนส่งทุกครั้ง เพราะ parse_mode เป็น HTML · ชื่อลูกค้าอย่าง "เอ แอนด์ บี <สาขา 2>"
 * หรืออาการที่พิมพ์ว่า "แรงดัน < 2 บาร์" จะทำให้ Telegram ปฏิเสธทั้งข้อความ
 * ผลคือไม่มีใครได้รับอะไรเลย และไม่มีอะไรบอกว่าเกิดอะไรขึ้นถ้าไม่ตรวจรหัสตอบกลับ
 *
 * @param {*} value ข้อความที่ยังไม่ได้แปลง
 * @return {string}
 */
function escapeTelegramHtml_(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * ประกอบข้อความของเหตุการณ์หนึ่ง — ฟังก์ชันล้วน ไม่แตะชีตและไม่ส่งอะไร
 *
 * ใส่เท่าที่คนรับงานต้องใช้: เลขที่ใบงาน ลูกค้า สถานที่ สิ่งที่ต้องทำ และสถานะ
 * ห้ามใส่เบอร์โทร ราคา หรือรายละเอียดการชำระเงินเด็ดขาด (SPEC 15.4) มีเทสต์สแกนคุมไว้
 *
 * @param {string} event ค่าจาก NOTIFY_EVENT
 * @param {Object} wo แถวใบงาน
 * @param {Object} [extra] {reason, department, stepName, done, total}
 * @return {string} ข้อความพร้อมส่ง (escape แล้ว)
 */
function notifyMessage_(event, wo, extra) {
  wo = wo || {};
  extra = extra || {};

  var lines = [];
  lines.push('<b>' + escapeTelegramHtml_(NOTIFY_TITLE_TH[event] || event) + '</b>');
  lines.push('เลขที่ ' + escapeTelegramHtml_(wo['WO_ID']));
  lines.push('ลูกค้า ' + escapeTelegramHtml_(wo['Customer_Name']));

  var place = [wo['Project'], wo['Location']];
  var placeText = [];
  for (var p = 0; p < place.length; p++) {
    if (!isEmptyValue_(place[p])) placeText.push(String(place[p]));
  }
  if (placeText.length) lines.push('สถานที่ ' + escapeTelegramHtml_(placeText.join(' · ')));

  if (!isEmptyValue_(wo['Job_Description'])) {
    lines.push('สิ่งที่ต้องทำ ' + escapeTelegramHtml_(wo['Job_Description']));
  }

  if (!isEmptyValue_(extra.department)) {
    lines.push('แผนก ' + escapeTelegramHtml_(toThai_(ASSIGNMENT_TH, extra.department)));
  }
  if (!isEmptyValue_(extra.stepName)) {
    var progress = (extra.total ? (' (' + extra.done + '/' + extra.total + ')') : '');
    lines.push('ขั้นตอน ' + escapeTelegramHtml_(extra.stepName) + escapeTelegramHtml_(progress));
  }
  /*
   * ผู้กด — ใส่เมื่อผู้เรียกส่งมาเท่านั้น ไม่ได้ไปหยิบจากแถวใบงานเอง
   *
   * เหตุการณ์ส่วนใหญ่ไม่ต้องรู้ว่าใครกด เพราะคำถามคือ "งานถึงไหนแล้ว" · แต่การเปิดงาน
   * ที่ปิดไปแล้วเป็นการย้อนกลับสิ่งที่ถือว่าจบไปแล้ว คำถามแรกของคนอ่านคือ "ใครเป็นคนตัดสินใจ"
   */
  if (!isEmptyValue_(extra.actor)) {
    lines.push('ผู้กด ' + escapeTelegramHtml_(extra.actor));
  }
  if (!isEmptyValue_(extra.reason)) {
    lines.push('เหตุผล ' + escapeTelegramHtml_(extra.reason));
  }

  lines.push('สถานะ ' + escapeTelegramHtml_(woStatusLabel(wo[STATUS_FIELD[ENTITY.WO]])));
  return lines.join(NEW_LINE_);
}

/**
 * ที่อยู่ของหน้ารายละเอียดใบงาน ใช้ทำปุ่มในข้อความ (SPEC 15.4)
 *
 * ผู้ที่ยังไม่ได้ล็อกอินกดแล้วจะเจอแผงเข้าสู่ระบบวาดทับหน้านั้น พอล็อกอินเสร็จ
 * ระบบจะทำงานต่อที่หน้าเดิม ไม่ใช่เด้งไปหน้าแรก (กลไกใน ui_Auth.html)
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {string} ค่าว่างเมื่อยังไม่ได้ตั้งที่อยู่เว็บแอปไว้
 */
function notifyWoUrl_(woId) {
  var base = '';
  try {
    base = getProp_(PROP_KEY.WEBAPP_URL, false) || '';
  } catch (e) {
    base = '';
  }
  /*
   * ยังไม่ได้ตั้งค่าไว้ ให้ถามที่อยู่ของตัวเอง แทนที่จะส่งข้อความที่ไม่มีปุ่ม
   * ปุ่มคือสิ่งเดียวที่ทำให้ข้อความมีประโยชน์ — ข่าวที่กดต่อไม่ได้ ผู้รับต้องไปหาเอง
   */
  if (!base) {
    try {
      base = selfUrl_() || '';
    } catch (e) {
      base = '';
    }
  }
  if (!base) return '';
  return base + '?page=wo&id=' + encodeURIComponent(String(woId || ''));
}

/* ---------------------------------------------------------------------------
 * ส่วนที่ 3 — การส่งจริง
 * --------------------------------------------------------------------------- */

/**
 * ยิงคำขอไป Telegram แล้วคืนผลแบบตรวจแล้ว — ที่เดียวของไฟล์นี้ที่ออกไปนอกระบบ
 *
 * ต้องใช้ muteHttpExceptions เสมอ ไม่งั้นรหัส 400 จะกลายเป็นข้อผิดพลาดที่โยนออกมา
 * แล้วเราจะไม่ได้เห็นเนื้อความที่ Telegram อธิบายว่าปฏิเสธเพราะอะไร
 *
 * @param {string} url ที่อยู่ปลายทาง
 * @param {Object} [options] {method, headers, payload} · payload เป็นคู่คีย์-ค่าแบบฟอร์ม
 * @return {Object} {code, body}
 */
async function fetchExternal_(url, options) {
  var given = options || {};

  /*
   * ยิงผ่าน httpSend_ ซึ่งเป็นที่เดียวในระบบที่เรียกบริการ HTTP ของ Apps Script ได้ (กฎข้อ 26)
   * วันที่ย้ายไป Cloudflare Workers บรรทัดที่ต้องเขียนใหม่จะอยู่ในฟังก์ชันนั้นตัวเดียว
   *
   * Telegram รับเนื้อคำขอแบบฟอร์ม ไม่ใช่ JSON จึงส่งไปทาง form ของรูปแบบกลาง
   * ให้ชั้นยิงเป็นคนเข้ารหัสเอง แทนที่จะให้ที่นี่รู้วิธีเข้ารหัสของ Apps Script
   */
  var result = await httpSend_({
    method: given.method || 'get',
    url: url,
    headers: given.headers,
    form: given.payload
  });
  return { code: result.status, body: result.body };
}

/**
 * รหัสตอบกลับของที่อยู่หนึ่ง — ใช้ตรวจว่าระบบยิงออกนอกได้หรือยัง
 * @param {string} url ที่อยู่ปลายทาง
 * @return {number}
 */
async function fetchStatusCode_(url) {
  return await fetchExternal_(url, { method: 'get' }).code;
}

/**
 * Token ของบอท — อยู่ใน Script Properties เท่านั้น ห้ามหลุดไปหน้าเว็บหรือ log (SPEC 15.1)
 * @return {string} ค่าว่างเมื่อยังไม่ได้ตั้ง
 */
function telegramToken_() {
  try {
    return getProp_(PROP_KEY.TELEGRAM_BOT_TOKEN, false) || '';
  } catch (e) {
    return '';
  }
}

/**
 * ส่งข้อความหนึ่งข้อความเข้าห้องหนึ่งห้อง
 *
 * @param {Object} channel แถวจากตาราง Notify_Channel
 * @param {string} text ข้อความที่ escape แล้ว
 * @param {string} buttonUrl ที่อยู่ของปุ่มเปิดใบงาน · ค่าว่าง = ไม่มีปุ่ม
 * @param {boolean} [isRetry] true = เป็นการลองใหม่หลังแก้เลขห้องแล้ว ห้ามแก้ซ้ำอีก
 * @return {Object} {ok, code, message}
 */
async function sendTelegramMessage_(channel, text, buttonUrl, isRetry) {
  /*
   * โหมดเก็บข้อความของชุดทดสอบ — ต้องอยู่ก่อนทุกอย่าง
   * เพื่อให้เทสต์พิสูจน์เนื้อข้อความและห้องปลายทางได้โดยไม่ต้องมี Token และไม่ต้องต่อเน็ต
   */
  if (NOTIFY_OUTBOX_) {
    NOTIFY_OUTBOX_.push({
      chatId: String(channel['Chat_ID'] || ''),
      threadId: String(channel['Thread_ID'] || ''),
      target: String(channel['Target'] || ''),
      text: text,
      url: buttonUrl
    });
    return { ok: true, code: 200, message: '' };
  }

  var token = telegramToken_();
  if (!token) {
    // ยังไม่ได้ตั้ง Token ไม่ใช่เรื่องผิดปกติของชีตที่เพิ่งติดตั้ง แต่ต้องรู้ว่าไม่ได้ส่ง
    return { ok: false, code: 0, message: TELEGRAM_TOKEN_NOT_SET_MESSAGE };
  }

  var payload = {
    chat_id: String(channel['Chat_ID'] || ''),
    text: text,
    parse_mode: 'HTML'
  };
  if (!isEmptyValue_(channel['Thread_ID'])) {
    payload.message_thread_id = String(channel['Thread_ID']);
  }
  if (buttonUrl) {
    payload.reply_markup = JSON.stringify({
      inline_keyboard: [[{ text: 'เปิดใบงาน', url: buttonUrl }]]
    });
  }

  var result = await fetchExternal_(TELEGRAM_API_BASE + token + '/sendMessage',
    { method: 'post', payload: payload });

  /*
   * ต้องตรวจทั้งรหัส HTTP และธง ok ในเนื้อความ
   * Telegram ตอบ 200 พร้อม ok:false ได้ในบางกรณี การดูแต่รหัสจึงยังพลาดได้
   */
  var ok = result.code === 200 && result.body.indexOf('"ok":true') !== -1;

  /*
   * กลุ่มที่ถูกยกระดับเป็น supergroup จะเปลี่ยนเลขห้อง และ Telegram ตอบกลับมาว่า
   * เลขใหม่คืออะไร · ถ้าไม่แก้ตาม ห้องนั้นจะเงียบไปตลอดกาลโดยไม่มีใครรู้สาเหตุ
   * จึงแก้ให้เองแล้วลองใหม่ครั้งเดียว — และต้องเหลือร่องรอยไว้เสมอ เพราะนี่คือ
   * การที่ระบบแก้ค่าตั้งค่าของผู้ดูแลโดยไม่มีใครสั่ง
   */
  var movedTo = ok ? '' : migratedChatIdOf_(result.body);
  if (movedTo && !isRetry) return await resendAfterChatMove_(channel, movedTo, text, buttonUrl);

  return { ok: ok, code: result.code, message: ok ? '' : telegramErrorText_(result) };
}

/**
 * เลขห้องใหม่ที่ Telegram บอกมา เมื่อกลุ่มถูกยกระดับเป็น supergroup
 * @param {string} body เนื้อความที่ตอบกลับมา
 * @return {string} ค่าว่างเมื่อไม่ใช่กรณีนี้
 */
function migratedChatIdOf_(body) {
  var found = /"migrate_to_chat_id"\s*:\s*(-?\d+)/.exec(String(body || ''));
  return found ? found[1] : '';
}

/**
 * แก้เลขห้องในตาราง Notify_Channel แล้วส่งใหม่ครั้งเดียว
 * @param {Object} channel แถวจากตาราง Notify_Channel
 * @param {string} newChatId เลขห้องใหม่
 * @param {string} text ข้อความที่ escape แล้ว
 * @param {string} buttonUrl ที่อยู่ของปุ่มเปิดใบงาน
 * @return {Object} {ok, code, message}
 */
async function resendAfterChatMove_(channel, newChatId, text, buttonUrl) {
  var target = String(channel['Target'] || '');
  var oldChatId = String(channel['Chat_ID'] || '');

  try {
    await updateNotifyChannel_(String(channel['Channel_ID'] || ''), { 'Chat_ID': newChatId });
  } catch (e) {
    // แก้ตารางไม่ได้ ก็ยังส่งรอบนี้ให้ถึงก่อน แล้วค่อยให้ผู้ดูแลตามแก้เอง
    await logSystemEvent_(ACTION.CHANNEL_FIXED, 'ห้อง ' + target + ' ย้ายไปเลข ' + newChatId +
      ' แต่แก้ตาราง Notify_Channel ไม่สำเร็จ ผู้ดูแลต้องแก้เอง');
  }

  await logSystemEvent_(ACTION.CHANNEL_FIXED, 'ห้อง ' + target + ' ถูกยกระดับเป็น supergroup · ' +
    'ระบบแก้ Chat_ID จาก ' + oldChatId + ' เป็น ' + newChatId + ' ให้เองแล้ว');

  channel['Chat_ID'] = newChatId;
  return await sendTelegramMessage_(channel, text, buttonUrl, true);
}

/**
 * คำอธิบายสั้น ๆ ของการส่งที่ไม่สำเร็จ โดยไม่ให้ Token หลุดไปกับข้อความ
 * @param {Object} result ผลจาก fetchExternal_
 * @return {string}
 */
function telegramErrorText_(result) {
  var body = String(result.body || '');
  var found = /"description"\s*:\s*"([^"]*)"/.exec(body);
  var detail = found ? found[1] : body.substring(0, 120);
  return 'รหัสตอบกลับ ' + result.code + (detail ? (' · ' + detail) : '');
}

/** ข้อความเมื่อยังไม่ได้ตั้ง Token — ต้องบอกว่าต้องไปทำอะไร ไม่ใช่บอกแค่ว่าไม่มี */
var TELEGRAM_TOKEN_NOT_SET_MESSAGE =
  'ยังไม่ได้ตั้งค่า Telegram Bot Token จึงยังไม่มีการแจ้งเตือน ' +
  'ผู้ดูแลระบบต้องใส่ค่าใน Script Properties ชื่อ TELEGRAM_BOT_TOKEN';

/* ---------------------------------------------------------------------------
 * ส่วนที่ 4 — ทางเข้าที่ชั้นบริการเรียกใช้
 * --------------------------------------------------------------------------- */

/**
 * แจ้งเตือนหนึ่งเหตุการณ์ — ห้ามโยนข้อผิดพลาดออกไปเด็ดขาด (SPEC 15.4 · กฎข้อ 10)
 *
 * เรียกหลังบันทึกสถานะสำเร็จแล้วเท่านั้น · ถ้าส่งไม่สำเร็จจะบันทึก NOTIFY_FAILED
 * ลง Audit_Log พร้อมเหตุผล เพื่อให้ตามได้ว่าใบไหนไม่ได้ถูกแจ้งและเพราะอะไร
 *
 * @param {string} event ค่าจาก NOTIFY_EVENT
 * @param {Object} wo แถวใบงาน
 * @param {Object} [extra] {reason, department, stepName, done, total}
 * @return {Object} {sent, skipped, failed} — จำนวนห้องในแต่ละผล
 */
async function notifyEvent_(event, wo, extra) {
  var summary = { sent: 0, skipped: 0, failed: 0 };
  if (NOTIFY_DISABLED_) return summary;

  try {
    var woId = String((wo || {})['WO_ID'] || '');

    // กันแจ้งซ้ำตอนผู้ใช้กดปุ่มรัวหรือสคริปต์รันซ้ำ (SPEC 15.4)
    var scope = String((extra && extra.taskId) ? extra.taskId : '');
    if (notifyAlreadySent_(woId, event, scope)) {
      summary.skipped++;
      return summary;
    }

    /*
     * เหตุการณ์ระดับใบงาน ต้องผ่านกติกาจำนวน Task ก่อน (SPEC 15.3)
     * อ่านจำนวน Task จริงตรงนี้ ไม่รับมาจากผู้เรียก เพราะผู้เรียกแต่ละที่รู้ไม่เท่ากัน
     * และข้อที่ต้องตัดสินคือ "ทั้งใบมีกี่ Task" ซึ่งมีแหล่งเดียวคือตาราง Department_Task
     */
    if (isWoLevelEvent_(event) && !shouldNotifyWoLevel_(await listTasksByWo(woId).length)) {
      summary.skipped++;
      return summary;
    }

    var context = {
      route: (wo || {})['Route'],
      department: (extra && extra.department) ? extra.department : (wo || {})['Assignment_Type']
    };
    var targets = notifyTargetsOf_(event, context);
    var channels = await notifyChannelsFor_(targets);

    if (!channels.length) {
      /*
       * ไม่มีห้องที่ตั้งค่าไว้ ไม่ใช่ข้อผิดพลาดของผู้ใช้ แต่ต้องรู้
       * ไม่งั้นระบบจะดูเหมือนทำงานปกติทั้งที่ไม่มีใครได้รับข่าวเลยสักคน
       */
      await writeNotifyAudit_(woId, event, ACTION.NOTIFY_FAILED,
        'ไม่มีห้องที่ตั้งค่าไว้สำหรับ ' + targets.join(', '));
      summary.failed++;
      return summary;
    }

    var text = notifyMessage_(event, wo, extra);
    var url = notifyWoUrl_(woId);
    var problems = [];

    for (var i = 0; i < channels.length; i++) {
      var result = await sendTelegramMessage_(channels[i], text, url);
      if (result.ok) summary.sent++;
      else {
        summary.failed++;
        problems.push(String(channels[i]['Target'] || '') + ': ' + result.message);
      }
    }

    if (problems.length) {
      await writeNotifyAudit_(woId, event, ACTION.NOTIFY_FAILED, problems.join(' · '));
    } else {
      markNotifySent_(woId, event, scope);
      await writeNotifyAudit_(woId, event, ACTION.NOTIFY,
        'ส่งเข้าห้อง ' + targets.join(', ') + ' รวม ' + summary.sent + ' ห้อง');
    }
  } catch (err) {
    /*
     * ถึงตรงนี้แปลว่ามีอะไรผิดที่ไม่ได้คาดไว้เลย เช่นชีตเปิดไม่ได้
     * ห้ามให้หลุดออกไป เพราะรายการหลักบันทึกสำเร็จไปแล้ว การโยนต่อจะทำให้ผู้ใช้
     * เห็นว่ารายการล้มเหลวทั้งที่ข้อมูลถูกบันทึกเรียบร้อย ซึ่งอันตรายกว่าไม่แจ้งเตือน
     */
    summary.failed++;
    Logger.log('แจ้งเตือน ' + event + ' ไม่สำเร็จ: ' + ((err && err.message) ? err.message : err));
    try {
      await writeNotifyAudit_(String((wo || {})['WO_ID'] || ''), event, ACTION.NOTIFY_FAILED,
        (err && err.message) ? err.message : String(err));
    } catch (ignored) {
      // เขียน Audit ไม่ได้ด้วย ก็ยังห้ามทำให้รายการหลักล้ม — เหลือร่องรอยใน Logger แล้ว
    }
  }

  return summary;
}

/**
 * แจ้งเตือนระดับใบงานเมื่อใบปิดไปแล้ว — เรียกหลังงานของแผนกเปลี่ยนสถานะ
 *
 * รวมไว้ที่เดียวเพราะมีสองทางที่ทำให้ใบปิดได้ คือแผนกสุดท้ายปิดงาน กับแผนกสุดท้ายยกเลิกงาน
 * ถ้าปล่อยให้แต่ละที่เขียนเอง วันหนึ่งจะมีทางหนึ่งที่ลืมแจ้ง แล้วไม่มีใครรู้ว่าใบนั้นจบแล้ว
 *
 * @param {Object} wo แถวใบงานหลังเปลี่ยนสถานะแล้ว
 * @param {string} [reason] เหตุผล ใช้เมื่อใบถูกยกเลิก
 */
async function notifyWoClosedIfNeeded_(wo, reason) {
  if (!wo) return;
  var status = wo[STATUS_FIELD[ENTITY.WO]];
  if (status === WO_STATUS.COMPLETED) await notifyEvent_(NOTIFY_EVENT.WO_COMPLETED, wo);
  else if (status === WO_STATUS.CANCELLED) {
    await notifyEvent_(NOTIFY_EVENT.WO_CANCELLED, wo, { reason: reason });
  }
}

/**
 * ห้องทั้งหมดที่ต้องส่งเข้า ตามรายชื่อห้องที่ขอมา
 *
 * อ่านจากตาราง Notify_Channel เท่านั้น ห้ามมี Chat ID เขียนไว้ในโค้ด (SPEC 15.1)
 * แถวที่ Active เป็นเท็จถูกข้ามทั้งหมด — เป็นวิธีปิดห้องชั่วคราวโดยไม่ต้องลบข้อมูลทิ้ง
 *
 * @param {string[]} targets รายชื่อห้อง (ค่าจาก NOTIFY_TARGET)
 * @return {Object[]} แถวจากตาราง Notify_Channel
 */
async function notifyChannelsFor_(targets) {
  var rows = await listNotifyChannels(true);   // true = เฉพาะแถวที่ Active
  var out = [];

  for (var i = 0; i < rows.length; i++) {
    var target = String(rows[i]['Target'] || '').trim().toUpperCase();
    if (targets.indexOf(target) === -1) continue;
    if (isEmptyValue_(rows[i]['Chat_ID'])) continue;   // ยังไม่ได้กรอกห้อง ส่งไม่ได้
    out.push(rows[i]);
  }
  return out;
}

/**
 * กุญแจกันแจ้งซ้ำ — WO_ID + เหตุการณ์ + งานของแผนก + เวลาระดับนาที (SPEC 15.4)
 *
 * ต้องมีเลขที่งานของแผนกอยู่ในกุญแจด้วย ไม่ใช่แค่เลขที่ใบงาน
 * เพราะงานร่วมสองแผนกที่ปิดงานในนาทีเดียวกัน คือสองเหตุการณ์คนละเรื่อง ไม่ใช่การกดซ้ำ
 * ถ้าไม่แยก ข้อความของแผนกที่สองจะหายไปเงียบ ๆ และไม่มีอะไรบอกว่าหายไป
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} event ชื่อเหตุการณ์
 * @param {string} [scope] เลขที่งานของแผนก ถ้าเป็นเหตุการณ์ระดับ Task
 * @return {string}
 */
function notifyDedupeKey_(woId, event, scope) {
  var minute = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmm');
  return 'notify:' + woId + ':' + event + ':' + String(scope || '') + ':' + minute;
}

/**
 * เคยส่งข่าวนี้ไปในนาทีเดียวกันแล้วหรือยัง
 *
 * ใช้ CacheService ไม่ใช่ชีต เพราะเป็นข้อมูลที่หมดอายุเองและไม่มีใครต้องย้อนดู
 * ถ้าเก็บลงชีตจะเพิ่มการเขียนหนึ่งครั้งต่อการกดปุ่มหนึ่งครั้ง ซึ่งแพงและไม่มีประโยชน์
 *
 * @param {string} woId เลขที่ใบงาน
 * @param {string} event ชื่อเหตุการณ์
 * @return {boolean}
 */
function notifyAlreadySent_(woId, event, scope) {
  try {
    return !!cacheGet_(notifyDedupeKey_(woId, event, scope));
  } catch (e) {
    return false;   // แคชใช้ไม่ได้ ให้ส่งไปดีกว่าเงียบ — แจ้งซ้ำรำคาญกว่า แต่ไม่รู้เรื่องแย่กว่า
  }
}

/**
 * จำไว้ว่าส่งข่าวนี้ไปแล้ว
 * @param {string} woId เลขที่ใบงาน
 * @param {string} event ชื่อเหตุการณ์
 * @param {string} [scope] เลขที่งานของแผนก ถ้าเป็นเหตุการณ์ระดับ Task
 */
function markNotifySent_(woId, event, scope) {
  try {
    // เก็บสองนาที เผื่อการกดรัวคร่อมเส้นแบ่งนาทีพอดี
    cachePut_(notifyDedupeKey_(woId, event, scope), '1', 120);
  } catch (e) {
    // จำไม่ได้ก็ไม่เป็นไร อย่างมากคือมีข้อความซ้ำ ไม่ใช่ข้อมูลเสียหาย
  }
}

/**
 * บันทึกผลการแจ้งเตือนลง Audit_Log
 * @param {string} woId เลขที่ใบงาน
 * @param {string} event ชื่อเหตุการณ์
 * @param {string} action ค่าจาก ACTION (NOTIFY หรือ NOTIFY_FAILED)
 * @param {string} remark รายละเอียด
 */
async function writeNotifyAudit_(woId, event, action, remark) {
  await writeAudit(ENTITY.WO, woId, action, 'Telegram', '', event, remark, { woId: woId });
}

/* ---------------------------------------------------------------------------
 * ส่วนที่ 5 — เครื่องมือตรวจสำหรับผู้ดูแล
 * --------------------------------------------------------------------------- */

/**
 * ไล่ดูการแจ้งเตือนของใบงานหนึ่ง — กดรันจากตัวแก้ไข Apps Script (อ่านอย่างเดียว)
 *
 * ตอบสามคำถามที่ต้องไล่กันหลายรอบทุกครั้งที่มีคนบอกว่า "ไม่ได้รับข้อความ"
 *   1. เหตุการณ์นั้นถูกกระตุ้นจริงไหม   อ่านจาก Audit_Log ของใบนั้น
 *   2. ถ้าถูกกระตุ้น ส่งเข้าห้องไหน      คำนวณจากตารางห้องปลายทางกับ Notify_Channel
 *   3. ถ้าไม่ได้ส่ง ติดที่ด่านไหน        ไล่ด่านทีละชั้นแล้วบอกชื่อด่านกับเหตุผล
 *
 * ที่ต้องมีเครื่องมือนี้เพราะการแจ้งเตือนพังแบบ "เงียบ" ได้หลายแบบมาก และทุกแบบหน้าตาเหมือนกัน
 * จากฝั่งผู้ใช้ — ไม่มีข้อความเข้าห้อง · ของจริงที่เคยเจอคือโค้ดแจ้งเตือนถูกวางไว้หลัง
 * return จึงไม่เคยถูกเรียกเลย ซึ่งมองจากโค้ดผ่าน ๆ ไม่เห็น และไม่มี error ให้จับ
 *
 * ไม่ส่งข้อความจริงแม้แต่ข้อความเดียว
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {string} รายงานที่อ่านได้ทันที
 */
async function traceNotify(woId) {
  var id = String(woId || '').trim();
  var lines = ['ไล่ดูการแจ้งเตือนของใบงาน ' + (id || '(ไม่ได้ระบุเลขที่)')];

  if (!id) {
    lines.push('ต้องระบุเลขที่ใบงาน เช่น traceNotify("WO-2609-0001")');
    return logAndReturn_(lines);
  }

  var wo = await getWorkOrder(id);
  if (!wo) {
    lines.push('ไม่พบใบงานนี้ในระบบ — ตรวจเลขที่อีกครั้ง');
    return logAndReturn_(lines);
  }

  var tasks = await listTasksByWo(id);
  lines.push('สถานะ ' + woStatusLabel(wo[STATUS_FIELD[ENTITY.WO]]) +
    ' · สายงาน ' + (wo['Route'] || '-') +
    ' · แผนกผู้รับงาน ' + (wo['Assignment_Type'] || '-') +
    ' · จำนวน Task ' + tasks.length);

  /*
   * ---------- อ่านร่องรอยจากทั้งสองตาราง ----------
   *
   * ต้องอ่านสองที่ เพราะบันทึกถูกแยกตาม SPEC 13 — ครั้งที่ส่งสำเร็จอยู่ใน Audit_Log
   * (เป็นสิ่งที่เกิดกับใบงาน) ส่วนครั้งที่ส่งไม่สำเร็จอยู่ใน System_Log (เป็นเรื่องของระบบ)
   * ถ้าอ่านแค่ตารางเดียว จะสรุปผิดว่า "ไม่เคยถูกกระตุ้น" ทั้งที่กระตุ้นแล้วแต่ส่งไม่ออก
   * ซึ่งเป็นคำตอบที่ชี้ไปผิดทางที่สุดเท่าที่เครื่องมือนี้จะตอบได้
   */
  var names = notifyEventNames_();
  var history = {};

  var logs = await listAuditByWo(id);
  for (var i = 0; i < logs.length; i++) {
    if (String(logs[i]['Action'] || '') !== ACTION.NOTIFY) continue;
    var event = String(logs[i]['To_Value'] || '');
    if (!history[event]) history[event] = { sent: 0, failed: 0, last: '' };
    history[event].sent++;
    history[event].last = String(logs[i]['Remark'] || '');
  }

  var failures = await listSystemLogByWo(id);
  for (var f = 0; f < failures.length; f++) {
    if (String(failures[f]['Event'] || '') !== ACTION.NOTIFY_FAILED) continue;
    var detail = String(failures[f]['Detail'] || '');
    for (var n = 0; n < names.length; n++) {
      var head = systemLogDetailPrefix_(id, names[n]);
      if (detail.indexOf(head) !== 0) continue;
      if (!history[names[n]]) history[names[n]] = { sent: 0, failed: 0, last: '' };
      history[names[n]].failed++;
      history[names[n]].last = detail.substring(head.length);
      break;
    }
  }

  for (var e = 0; e < names.length; e++) {
    var event = names[e];
    var targets = notifyTargetsOf_(event, {
      route: wo['Route'],
      department: wo['Assignment_Type']
    });
    var channels = await notifyChannelsFor_(targets);
    var past = history[event];

    var state;
    if (isWoLevelEvent_(event) && !shouldNotifyWoLevel_(tasks.length)) {
      state = 'ถูกระงับที่ด่านจำนวน Task (มี ' + tasks.length + ' Task จึงถือว่าซ้ำกับข้อความระดับ Task)';
    } else if (!targets.length) {
      state = 'ไม่มีห้องปลายทางสำหรับใบนี้ (ยังไม่ได้ระบุแผนก)';
    } else if (!channels.length) {
      state = 'ยังไม่ได้ตั้งห้อง ' + targets.join(', ') + ' ในตาราง Notify_Channel';
    } else if (notifyAlreadySent_(id, event, '')) {
      state = 'ถูกกันซ้ำอยู่ในนาทีนี้ (เพิ่งส่งไปเมื่อครู่)';
    } else {
      state = 'พร้อมส่งเข้า ' + targets.join(', ') + ' รวม ' + channels.length + ' ห้อง';
    }

    var trace = past
      ? ('เคยส่งสำเร็จ ' + past.sent + ' ครั้ง · ไม่สำเร็จ ' + past.failed + ' ครั้ง' +
         (past.last ? (' · ล่าสุด: ' + past.last) : ''))
      : 'ยังไม่เคยถูกกระตุ้นเลย';

    lines.push('  ' + padRight_(event, 14) + trace);
    lines.push('  ' + padRight_('', 14) + 'ตอนนี้: ' + state);
  }

  lines.push('หมายเหตุ: "ยังไม่เคยถูกกระตุ้นเลย" ทั้งที่เหตุการณ์นั้นเกิดไปแล้วจริง ' +
    'แปลว่าโค้ดที่ควรเรียกการแจ้งเตือนไม่ได้ทำงาน ไม่ใช่เรื่องห้องหรือ Token');
  return logAndReturn_(lines);
}

/**
 * ชื่อเหตุการณ์แจ้งเตือนทั้งหมด
 * @return {string[]}
 */
function notifyEventNames_() {
  var names = [];
  for (var key in NOTIFY_EVENT) {
    if (Object.prototype.hasOwnProperty.call(NOTIFY_EVENT, key)) names.push(NOTIFY_EVENT[key]);
  }
  return names;
}

/**
 * เติมช่องว่างท้ายข้อความให้ยาวเท่ากัน เพื่อให้รายงานอ่านเป็นคอลัมน์
 * @param {string} text ข้อความ
 * @param {number} width ความกว้าง
 * @return {string}
 */
function padRight_(text, width) {
  var out = String(text || '');
  while (out.length < width) out += ' ';
  return out;
}

/**
 * บันทึกรายงานลง Logger แล้วคืนค่าเดียวกัน
 * @param {string[]} lines บรรทัดของรายงาน
 * @return {string}
 */
function logAndReturn_(lines) {
  var report = lines.join(NEW_LINE_);
  Logger.log(report);
  return report;
}

/**
 * ตรวจว่าการแจ้งเตือนพร้อมใช้งานหรือยัง — กดรันจากตัวแก้ไข Apps Script
 *
 * แบบเดียวกับ checkDriveFolder() และ checkPermissions() · เครื่องมือชุดนี้มีไว้เพราะ
 * ระบบภายนอกพังแบบเงียบเสมอ: โค้ดถูก เทสต์เขียว แต่ของจริงไม่ทำงานและไม่มีใครรู้
 * จนกว่าจะมีคนมาถามว่าทำไมไม่ได้รับข้อความ
 *
 * ไม่ส่งข้อความเข้าห้องจริง ใช้คำสั่ง getChat ซึ่งเป็นการอ่านอย่างเดียว
 * ห้องที่บอทยังไม่ได้ถูกเชิญเข้าไปจะฟ้องตรงนี้ทันที
 *
 * @return {string} ผลการตรวจแบบอ่านได้ทันที
 */
async function checkTelegram() {
  var lines = [];
  var token = telegramToken_();

  if (!token) {
    lines.push('ไม่ผ่าน Bot Token — ' + TELEGRAM_TOKEN_NOT_SET_MESSAGE);
    lines.push('เมื่อยังไม่มี Token ระบบจะไม่ส่งข้อความเลย แต่ทุกอย่างอื่นทำงานตามปกติ');
    var report = lines.join(NEW_LINE_);
    Logger.log(report);
    return report;
  }

  /* ---------- บอทใช้งานได้จริงไหม ---------- */
  var me = await fetchExternal_(TELEGRAM_API_BASE + token + '/getMe', { method: 'get' });
  if (me.code === 200 && me.body.indexOf('"ok":true') !== -1) {
    var name = /"username"\s*:\s*"([^"]*)"/.exec(me.body);
    lines.push('ผ่าน    Bot Token — บอทชื่อ @' + (name ? name[1] : 'ไม่ทราบชื่อ'));
  } else {
    lines.push('ไม่ผ่าน Bot Token — ' + telegramErrorText_(me) +
      ' · ตรวจว่าคัดลอก Token มาครบและไม่มีช่องว่างติดมา');
  }

  /* ---------- ห้องที่ตั้งค่าไว้ ส่งได้จริงไหม ---------- */
  var rows = await listNotifyChannels(false);   // false = เอาทั้งหมด รวมห้องที่ปิดอยู่ด้วย
  lines.push('ห้องในตาราง Notify_Channel ทั้งหมด ' + rows.length + ' ห้อง');

  var known = [];
  for (var key in NOTIFY_TARGET) {
    if (Object.prototype.hasOwnProperty.call(NOTIFY_TARGET, key)) known.push(NOTIFY_TARGET[key]);
  }

  var usable = 0;
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var target = String(row['Target'] || '').trim().toUpperCase();
    var label = '  ' + (target || '(ยังไม่ได้กรอกห้อง)') + ' · ' + (row['Name'] || row['Channel_ID']);

    if (!cellToBoolean_(row['Active'])) { lines.push('ข้าม   ' + label + ' — ปิดใช้งานอยู่'); continue; }
    if (known.indexOf(target) === -1) {
      lines.push('ไม่ผ่าน ' + label + ' — ช่อง Target ต้องเป็นค่าใดค่าหนึ่งใน ' + known.join(', '));
      continue;
    }
    if (isEmptyValue_(row['Chat_ID'])) {
      lines.push('ไม่ผ่าน ' + label + ' — ยังไม่ได้กรอก Chat ID');
      continue;
    }

    var chat = await fetchExternal_(TELEGRAM_API_BASE + token +
      '/getChat?chat_id=' + encodeURIComponent(String(row['Chat_ID'])), { method: 'get' });
    if (chat.code === 200 && chat.body.indexOf('"ok":true') !== -1) {
      usable++;
      lines.push('ผ่าน   ' + label + ' — ส่งเข้าห้องนี้ได้');
    } else {
      lines.push('ไม่ผ่าน ' + label + ' — ' + telegramErrorText_(chat) +
        ' · ตรวจว่าเชิญบอทเข้ากลุ่มแล้ว และ Chat ID ของกลุ่มเป็นเลขติดลบ');
    }
  }

  /* ---------- เหตุการณ์ไหนยังไม่มีห้องรับ ---------- */
  // ห้องที่ขาดแปลว่าเหตุการณ์นั้นจะเงียบตลอดไป ซึ่งมองจากหน้าจอไม่เห็นเลย
  var missing = [];
  for (var t = 0; t < known.length; t++) {
    if (!await notifyChannelsFor_([known[t]]).length) missing.push(known[t]);
  }
  if (missing.length) {
    lines.push('!! ยังไม่มีห้องที่ใช้งานได้สำหรับ ' + missing.join(', ') +
      ' — เหตุการณ์ที่ส่งเข้าห้องเหล่านี้จะไม่มีใครได้รับ');
  } else {
    lines.push('ทุกห้องที่ระบบต้องใช้ มีครบและใช้งานได้ · ส่งได้จริง ' + usable + ' ห้อง');
  }

  var out = lines.join(NEW_LINE_);
  Logger.log(out);
  return out;
}
