/**
 * 01_Db.gs — ไฟล์เดียวในระบบที่รู้จัก Supabase (CLAUDE.md กฎข้อ 21 · SPEC 22)
 *
 * **ห้ามเรียก UrlFetchApp ไปหา Supabase จากไฟล์อื่นเด็ดขาด แม้แต่ในเทสต์** ทุกคำสั่ง
 * ต้องผ่าน `db_fetch_()` ตัวเดียว เพราะสิ่งที่ต้องทำให้ถูกทุกครั้งมีหลายอย่างพร้อมกัน
 * — ใส่ header ให้ครบ, ไม่ให้คีย์หลุด, ตรวจรหัสตอบกลับเอง, ลองใหม่เฉพาะกรณีที่ควรลอง,
 * และแปลงข้อผิดพลาดเป็นภาษาไทย · ถ้ามีทางยิงหลายทาง วันหนึ่งจะมีทางที่ลืมทำข้อใดข้อหนึ่ง
 *
 * สามเรื่องที่ไฟล์นี้ต้องรับผิดชอบ และเป็นเหตุผลของโครงสร้างข้างล่าง
 *
 *   1. **คีย์ service_role ข้าม RLS ได้ทั้งฐานข้อมูล (กฎข้อ 22)** ใครได้ไปคือเจ้าของ
 *      ข้อมูลทั้งหมด · คีย์อยู่ใน header เท่านั้น ไม่เคยอยู่ใน query string เพราะ
 *      query string ติดไปกับ log ของทุกชั้นระหว่างทาง · และก่อนเขียน log ทุกครั้ง
 *      ข้อความจะถูกกรองผ่าน `dbScrub_()` เพื่อกันกรณีที่คีย์หลุดมาทางอื่นที่ยังไม่รู้จัก
 *
 *   2. **ข้อผิดพลาดของฐานข้อมูลห้ามไหลขึ้นหน้าเว็บ (กฎข้อ 24)** PostgREST คืน
 *      `{message, code, details, hint}` ซึ่ง `hint` มักมีชื่อคอลัมน์ และบางครั้งมี
 *      ค่าข้อมูลจริงติดมาด้วย · ของจริงลง System_Log ผู้ใช้ได้ข้อความกลาง ๆ เสมอ
 *
 *   3. **ชั้นเหนือขึ้นไปต้องไม่เห็นชื่อคอลัมน์ของฐานข้อมูลเลย (กฎข้อ 21)** ทุกแถว
 *      ที่ออกจากไฟล์นี้ผ่าน `fromDb_()` แล้ว จึงมีคีย์ `WO_ID` ไม่ใช่ `wo_id`
 *      ถ้าวันหนึ่งเห็น `row.wo_id` ที่ไหนสักแห่ง แปลว่ามีคนยิงตรงข้ามไฟล์นี้ไป
 */

/** ข้อความเดียวที่ผู้ใช้จะได้เห็นเมื่อคุยกับฐานข้อมูลไม่สำเร็จ ไม่ว่าสาเหตุจริงคืออะไร */
var DB_USER_MESSAGE = 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';

/**
 * จำนวนครั้งที่ลองใหม่ได้ (ไม่นับครั้งแรก) — ลองได้เฉพาะ 5xx กับ timeout (กฎข้อ 24)
 *
 * 4xx ห้ามลองใหม่ เพราะมันแปลว่า "คำสั่งนี้ผิด" การยิงซ้ำจะผิดเหมือนเดิมทุกครั้ง
 * เสียแค่เวลา และถ้าเป็น 409 คีย์ซ้ำ การลองใหม่อาจสร้างข้อมูลซ้ำขึ้นมาจริง ๆ
 */
var DB_MAX_RETRY = 2;

/** เวลารอก่อนลองใหม่ครั้งที่ n (มิลลิวินาที) — เพิ่มเป็นเท่าตัวเพื่อไม่ไปซ้ำเติมฝั่งที่กำลังล้ม */
var DB_RETRY_WAIT_MS = 500;

/** แคชตารางแปลงชื่อคอลัมน์ ระดับการรันเดียว — สร้างใหม่ทุกครั้งที่สคริปต์เริ่มทำงาน */
var DB_MAP_CACHE_ = {};

/**
 * ความล้มเหลวครั้งล่าสุดของการคุยกับฐานข้อมูล เก็บไว้ระดับการรันเดียว
 *
 * มีไว้ให้เครื่องมือตรวจของผู้ดูแลอ่านเท่านั้น (checkSupabase) · ผู้ใช้ปลายทางยังได้
 * DB_USER_MESSAGE เหมือนเดิมทุกกรณี เพราะไม่มี api_ ตัวไหนอ่านค่านี้ และชื่อฟังก์ชัน
 * ที่ใช้อ่านลงท้ายด้วยขีดล่าง จึงเรียกจาก google.script.run ไม่ได้ (กฎข้อ 21)
 *
 * ที่ต้องมี เพราะเครื่องมือตรวจที่บอกว่า "ต่อไม่ได้ ไปหาสาเหตุเอาเองในอีกไฟล์หนึ่ง"
 * ไม่ได้ทำหน้าที่ของเครื่องมือตรวจเลย · ข้อความนี้ถูกกรองผ่าน dbScrub_ มาแล้ว
 */
var DB_LAST_FAILURE_ = null;

/**
 * สาเหตุจริงของความล้มเหลวครั้งล่าสุด สำหรับเครื่องมือตรวจของผู้ดูแล
 * @return {Object} {status, detail} — status เป็น 0 เมื่อต่อไม่ติดเลย
 */
function db_lastFailure_() {
  return DB_LAST_FAILURE_ ||
    { status: 0, code: '', message: '', hint: '', detail: 'ยังไม่มีความล้มเหลวในการรันครั้งนี้' };
}

/**
 * รหัสของ Postgres ที่แปลว่า "role นี้ไม่มีสิทธิ์ระดับตาราง" — ยังไม่ได้ GRANT
 *
 * ต้องประกาศไว้ที่เดียว เพราะเป็นตัวเดียวที่แยกสองประตูออกจากกันได้จริง
 */
var DB_CODE_NO_GRANT = '42501';

/**
 * ความล้มเหลวครั้งนี้ติดอยู่ที่ประตูบานไหน (SPEC 22.5)
 *
 * **GRANT กับ RLS เป็นประตูคนละบาน และมีอาการคนละแบบสิ้นเชิง ห้ามแปลรวมกัน**
 *
 *   ยังไม่ได้ GRANT   → **401 พร้อม code 42501** · เป็น **ข้อผิดพลาด** เห็นทันที
 *   GRANT แล้วแต่ RLS ไม่ให้ผ่าน → **200 พร้อม 0 แถว** ไม่ใช่ข้อผิดพลาดเลย
 *   คีย์ไม่ถูกยอมรับ → 401 **ที่ไม่มี code** · ยังไม่ทันได้ดูว่าเป็น role ไหน
 *
 * **รหัส HTTP แยกสองบานนี้ไม่ได้ ต้องดู `code` เท่านั้น** — วัดกับของจริงแล้ว
 * 01-10-2026 ที่ colo BKK: GRANT ที่ขาดคืน **401** ไม่ใช่ 403 อย่างที่เคยเขียนไว้
 * ทั้งใน SPEC และในคอมเมนต์นี้ · ทั้งสามสาเหตุข้างล่างคืน 401 เหมือนกันหมด
 *
 *   ไม่ส่ง apikey          → 401 · ไม่มี code · "No API key found in request"
 *   apikey ใช้ไม่ได้        → 401 · ไม่มี code · "Invalid API key"
 *   anon ที่ใช้ได้ ไม่ GRANT → 401 · **code 42501** · "permission denied for table ..."
 *
 * โค้ดเดิมเช็ค `status === 403` ก่อนถึงจะดู code ผลคือ GRANT ที่ขาดตกไปอยู่ในกลุ่ม
 * `'KEY'` ทุกครั้ง แล้วรายงานส่งคนไปนั่งตรวจคีย์ที่ถูกต้องอยู่แล้ว — ซึ่งเป็นอาการ
 * ที่คอมเมนต์นี้เตือนไว้เองคำต่อคำ และเงียบมาตลอดเพราะเทสต์ป้อน 403 ให้มันตรวจ
 *
 * การแปลผิดว่า "คีย์ผิด" ทำให้คนไปนั่งตรวจคีย์ที่ถูกต้องอยู่แล้ว ซึ่งเสียเวลาเปล่า
 * และไม่มีวันเจอ เพราะคีย์ไม่ได้ผิด · ส่วนการแปลว่า "RLS กันอยู่" แย่กว่านั้นอีก
 * เพราะทำให้เชื่อว่า RLS ทำงาน ทั้งที่ยังไม่เคยมีใครพิสูจน์เลยสักครั้ง
 *
 * ยังไม่ได้วัดว่า `service_role` ให้ status เดียวกับ anon ไหม — วัดด้วย anon เท่านั้น
 * แต่การดู code ก่อนถูกต้องทั้งสองทาง ไม่ว่าคำตอบของข้อนั้นจะเป็นอะไร
 *
 * @param {Object} failure ผลจาก db_lastFailure_()
 * @return {string} 'KEY' | 'GRANT' | 'UNKNOWN_403' | 'MISSING' | 'SERVER' | 'NETWORK' | 'OTHER'
 */
function dbDoorOfFailure_(failure) {
  var status = failure ? Number(failure.status) : 0;
  var code = failure ? String(failure.code || '') : '';

  if (!status) return 'NETWORK';

  // code ตัดสินก่อน status เสมอ — เป็นตัวเดียวที่แยกสองประตูออกจากกันได้จริง
  if (code === DB_CODE_NO_GRANT) return 'GRANT';

  if (status === 401) return 'KEY';
  if (status === 403) return 'UNKNOWN_403';
  if (status === 404) return 'MISSING';
  if (status >= 500) return 'SERVER';
  return 'OTHER';
}


/* ---------------------------------------------------------------------------
 * ชั้นยิง HTTP — จุดเดียวในทั้งระบบที่ UrlFetchApp ปรากฏได้ (กฎข้อ 26)
 * --------------------------------------------------------------------------- */

/**
 * ยิงคำขอ HTTP หนึ่งคำขอ — **ที่เดียวในทั้งระบบที่ UrlFetchApp ปรากฏได้**
 *
 * รับและคืนค่าในรูปแบบกลางที่ไม่ผูกกับ Apps Script เลย เพื่อให้วันที่ย้ายไป
 * Cloudflare Workers (SPEC 22.7) มีบรรทัดที่ต้องเขียนใหม่อยู่ในฟังก์ชันนี้ฟังก์ชันเดียว
 * ส่วนที่เหลือทั้งระบบไม่ต้องแตะแม้แต่บรรทัดเดียว
 *
 * รูปแบบที่รับเข้ามา
 *   method      'get' | 'post' | 'patch' | 'delete'
 *   url         ที่อยู่เต็ม
 *   headers     วัตถุของหัวคำขอ
 *   body        เนื้อคำขอเป็นข้อความ (ปกติคือ JSON ที่แปลงมาแล้ว)
 *   form        เนื้อคำขอแบบฟอร์ม คู่คีย์-ค่า · Telegram ใช้แบบนี้ ไม่ใช่ JSON
 *   contentType ชนิดของเนื้อคำขอ
 *   timeoutMs   เวลาที่ยอมรอ · **Apps Script ไม่มีให้ตั้ง จึงถูกเพิกเฉยในตอนนี้**
 *               แต่รับไว้ในรูปแบบกลาง เพราะ Workers ตั้งได้ และผู้เรียกควรบอกเจตนาไว้
 *
 * @param {Object} request คำขอในรูปแบบกลาง
 * @return {Object} {status, headers, body} — headers เป็นตัวพิมพ์เล็กทั้งหมด
 * @throws {Error} เมื่อคำขอไปไม่ถึงปลายทางเลย
 */
async function httpSend_(request) {
  assertUrlFits_(request);
  var response = UrlFetchApp.fetch(request.url, httpOptions_(request));
  return httpResult_(response);
}

/**
 * ปฏิเสธคำขอที่ URL ยาวเกินเพดาน พร้อมบอกว่ายาวเพราะอะไร (กฎข้อ 29)
 *
 * `UrlFetchApp` โยนคำว่า `Limit Exceeded: URLFetch URL Length.` เฉย ๆ ไม่มีชื่อตาราง
 * ไม่มีตัวกรอง ไม่มีความยาว · เจอครั้งแรกเสียเวลาไล่หาว่าคำขอไหนเป็นตัวปัญหานานมาก
 * ทั้งที่ข้อมูลทั้งหมดอยู่ในมือเราตั้งแต่ก่อนยิงแล้ว
 *
 * ด่านนี้ต้องอยู่ที่นี่ เพราะที่นี่คือจุดเดียวที่ทุกคำขอของทั้งระบบเดินผ่าน
 * และเป็นจุดเดียวที่ยังเห็น URL เต็ม ๆ ก่อนมันจะกลายเป็นความผิดพลาดที่ไร้ข้อมูล
 *
 * @param {Object} request คำขอในรูปแบบกลาง
 * @throws {Error} เมื่อ URL ยาวเกิน HTTP_MAX_URL_LENGTH
 */
function assertUrlFits_(request) {
  if (request && request.skipLengthCheck) return;   // มีที่เดียวคือ probeUrlLimit()
  var url = String((request && request.url) || '');
  if (url.length <= HTTP_MAX_URL_LENGTH) return;

  /*
   * ตัดที่อยู่พื้นฐานออกให้เหลือแต่เส้นทางกับตัวกรอง เพราะส่วนที่ยาวผิดปกติ
   * อยู่ตรงนั้นเสมอ และส่วนที่ตัดออกคือส่วนที่เป็นความลับ
   */
  var at = url.indexOf('/rest/v1');
  var path = (at === -1) ? url : url.substring(at + '/rest/v1'.length);
  var table = /^\/([^?]+)/.exec(path);
  var query = decodeURIComponent(path.indexOf('?') === -1 ? '' : path.substring(path.indexOf('?') + 1));

  throw new Error('คำขอยาวเกินกว่าที่ยิงออกไปได้ · ตาราง ' + (table ? table[1] : 'ไม่ทราบ') +
    ' · ยาว ' + url.length + ' ตัวอักษร เพดาน ' + HTTP_MAX_URL_LENGTH +
    ' · ตัวกรอง: ' + urlSnippet_(query) +
    ' · ตัวกรองที่ยาวตามจำนวนข้อมูลต้องเปลี่ยนเป็นการกรองด้วยคำนำหน้าหรือคีย์ของแม่ (กฎข้อ 29)');
}

/**
 * ตัดตัวกรองให้พออ่านออกว่ายาวเพราะอะไร โดยไม่ลากมาทั้งก้อน
 * @param {string} text ตัวกรองที่ถอดรหัสแล้ว
 * @return {string}
 */
function urlSnippet_(text) {
  var value = String(text || '');
  if (value.length <= 200) return value;
  // เอาทั้งหัวและหางมา เพราะหัวบอกว่ากรองคอลัมน์ไหน ส่วนหางบอกว่ามันจบยังไง
  return value.substring(0, 140) + ' …(ตัดออก ' + (value.length - 200) + ' ตัวอักษร)… ' +
    value.substring(value.length - 60);
}

/**
 * ยิงหลายคำขอพร้อมกัน — คู่แฝดของ httpSend_ สำหรับกรณีขนาน
 *
 * แยกเป็นคนละฟังก์ชันแทนที่จะให้ httpSend_ รับรายการ เพราะสองอย่างนี้มีสัญญาต่างกัน
 * ตัวเดียวโยนเมื่อไปไม่ถึง ส่วนตัวหลายอันคืนผลของทุกคำขอเสมอ แล้วให้ผู้เรียกตัดสินทีละอัน
 *
 * @param {Object[]} requests คำขอในรูปแบบกลาง
 * @return {Object[]} ผลในรูปแบบเดียวกับ httpSend_ เรียงตามลำดับที่ส่งเข้ามา
 * @throws {Error} เมื่อยิงทั้งชุดไม่สำเร็จ
 */
function httpSendAll_(requests) {
  var options = [];
  for (var i = 0; i < requests.length; i++) {
    assertUrlFits_(requests[i]);
    var one = httpOptions_(requests[i]);
    one.url = requests[i].url;     // fetchAll ต้องการที่อยู่อยู่ในวัตถุเดียวกับตัวเลือก
    options.push(one);
  }

  var responses = UrlFetchApp.fetchAll(options);
  var out = [];
  for (var r = 0; r < responses.length; r++) out.push(httpResult_(responses[r]));
  return out;
}

/**
 * แปลงคำขอรูปแบบกลางเป็นตัวเลือกของ UrlFetchApp
 *
 * ทั้งหมดที่ผูกกับ Apps Script อยู่ในฟังก์ชันนี้กับ httpResult_ สองตัวเท่านั้น
 *
 * @param {Object} request คำขอในรูปแบบกลาง
 * @return {Object} ตัวเลือกของ UrlFetchApp
 */
function httpOptions_(request) {
  var options = {
    method: String(request.method || 'get').toLowerCase(),
    // ตรวจรหัสตอบกลับเองเสมอ · ถ้าปล่อยให้โยน เราจะไม่ได้เห็นเนื้อข้อความที่อธิบายว่าผิดตรงไหน
    muteHttpExceptions: true
  };

  if (request.headers) options.headers = request.headers;
  if (request.contentType) options.contentType = request.contentType;

  // body เป็นข้อความที่แปลงมาแล้ว ส่วน form เป็นคู่คีย์-ค่าที่ให้ชั้นล่างเข้ารหัสเอง
  if (request.body !== undefined && request.body !== null) options.payload = request.body;
  else if (request.form) options.payload = request.form;

  return options;
}

/**
 * แปลงคำตอบของ UrlFetchApp เป็นรูปแบบกลาง
 * @param {HTTPResponse} response คำตอบจาก UrlFetchApp
 * @return {Object} {status, headers, body}
 */
function httpResult_(response) {
  var raw = response.getAllHeaders() || {};
  var headers = {};

  // ชื่อ header ตัวพิมพ์ใหญ่เล็กไม่คงที่ระหว่างเซิร์ฟเวอร์ การอ่านตรง ๆ จึงพลาดเป็นครั้งคราว
  for (var name in raw) {
    if (Object.prototype.hasOwnProperty.call(raw, name)) headers[String(name).toLowerCase()] = raw[name];
  }

  return {
    status: response.getResponseCode(),
    headers: headers,
    body: String(response.getContentText() || '')
  };
}

/* ---------------------------------------------------------------------------
 * การตั้งค่า
 * --------------------------------------------------------------------------- */

/**
 * ที่อยู่ของโปรเจกต์ Supabase โดยไม่มีเครื่องหมายทับปิดท้าย
 * @return {string}
 * @throws {Error} เมื่อยังไม่ได้ตั้งค่า
 */
function dbBaseUrl_() {
  var url = String(getProp_(PROP_KEY.SUPABASE_URL) || '').trim();
  return url.replace(/\/+$/, '');
}

/**
 * คีย์ service_role — ค่านี้ห้ามถูกพิมพ์ออกไปที่ใดทั้งสิ้น (กฎข้อ 22)
 * @return {string}
 * @throws {Error} เมื่อยังไม่ได้ตั้งค่า
 */
function dbServiceKey_() {
  return String(getProp_(PROP_KEY.SUPABASE_SERVICE_KEY) || '').trim();
}

/**
 * คีย์ anon — มีไว้เพื่อพิสูจน์ว่ามันอ่านอะไรไม่ได้เท่านั้น
 * @return {string} ว่างเมื่อยังไม่ได้ตั้งค่า
 */
function dbAnonKey_() {
  return String(getProp_(PROP_KEY.SUPABASE_ANON_KEY, false) || '').trim();
}

/**
 * ตั้งค่า Supabase ครบแล้วหรือยัง — ใช้ตัดสินว่าจะรันสิ่งที่ต้องต่อเน็ตได้ไหม
 * @return {boolean}
 */
function dbIsConfigured_() {
  try {
    return !!(dbBaseUrl_() && dbServiceKey_());
  } catch (e) {
    return false;   // getProp_ โยนเมื่อยังไม่ได้ตั้งค่า ซึ่งคือคำตอบว่า "ยัง"
  }
}

/**
 * ลบค่าคีย์ทุกตัวออกจากข้อความก่อนเอาไปเขียน log หรือใส่ข้อความผิดพลาด
 *
 * ตามการออกแบบแล้วคีย์ไม่ควรโผล่ในข้อความใด ๆ อยู่แล้ว เพราะอยู่แต่ใน header
 * ตัวนี้จึงเป็นด่านที่สองสำหรับทางที่ยังไม่รู้จัก เช่นข้อความผิดพลาดของ UrlFetchApp
 * ที่อาจพ่นค่าที่ส่งไปออกมาในวันข้างหน้า · ด่านที่สองที่ไม่เคยได้ทำงานเลยถือว่าดี
 * ส่วนการไม่มีด่านที่สองแล้วคีย์หลุดครั้งเดียว แปลว่าต้องออกคีย์ใหม่ทั้งระบบ
 *
 * @param {*} text ข้อความต้นฉบับ
 * @return {string} ข้อความที่ไม่มีค่าคีย์อยู่เลย
 */
function dbScrub_(text) {
  var out = String(text === null || text === undefined ? '' : text);
  var keys = [];

  try { keys.push(dbServiceKey_()); } catch (e) { /* ยังไม่ได้ตั้งค่า ก็ไม่มีอะไรให้ปิด */ }
  keys.push(dbAnonKey_());

  for (var i = 0; i < keys.length; i++) {
    // กันคีย์สั้นผิดปกติ เพราะการแทนที่ข้อความสั้น ๆ จะไปโดนเนื้อความที่ไม่เกี่ยวข้อง
    if (!keys[i] || keys[i].length < 20) continue;
    while (out.indexOf(keys[i]) !== -1) out = out.replace(keys[i], '(ปิดบังคีย์ไว้)');
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * การแปลงชื่อคอลัมน์ — สองทาง อ่านจาก DB_COLUMNS เท่านั้น
 * --------------------------------------------------------------------------- */

/**
 * ตารางแปลงชื่อของตารางหนึ่งตาราง สร้างจาก DB_COLUMNS ครั้งเดียวต่อการรัน
 * @param {string} tableKey ชื่อตารางในระบบ เช่น 'WorkOrder'
 * @return {Object} {table, toDb, fromDb, systemNames}
 * @throws {Error} เมื่อยังไม่ได้ประกาศตารางนี้ใน DB_COLUMNS
 */
function dbColumnMap_(tableKey) {
  if (DB_MAP_CACHE_[tableKey]) return DB_MAP_CACHE_[tableKey];

  // ตารางของชุดทดสอบอยู่คนละรายการ รายงานที่ไล่ DB_COLUMNS จึงไม่มีวันได้เห็นมัน
  var spec = DB_COLUMNS[tableKey] || DB_TEST_COLUMNS[tableKey];
  if (!spec) {
    throw new Error('ไม่รู้จักตาราง "' + tableKey + '" — ต้องประกาศไว้ใน DB_COLUMNS ของ 00_Config.gs ก่อน');
  }

  // dbNames เรียงตรงกับ systemNames ตัวต่อตัว · การสำรองข้อมูลต้องบันทึกชื่อคอลัมน์
  // ฝั่งฐานข้อมูลลงไฟล์ เพราะไฟล์สำรองเก็บค่าดิบและต้องอ่านรู้เรื่องโดยไม่ต้องมีโค้ดเรา
  var map = { table: spec.table, toDb: {}, fromDb: {}, readable: {},
    systemNames: [], dbNames: [] };

  for (var i = 0; i < spec.columns.length; i++) {
    var entry = spec.columns[i];
    var systemName = (entry instanceof Array) ? entry[0] : entry;
    var dbName = (entry instanceof Array) ? entry[1] : String(entry).toLowerCase();

    map.toDb[systemName] = dbName;
    map.fromDb[dbName] = systemName;
    map.readable[systemName] = dbName;
    map.systemNames.push(systemName);
    map.dbNames.push(dbName);
  }

  /*
   * คอลัมน์ที่ฐานข้อมูลคำนวณให้ตอนอ่าน — **อ่านได้ แต่เขียนไม่ได้** (DB_COMPUTED_COLUMNS)
   *
   * เติมลงเฉพาะ readable กับ fromDb ไม่เติมลง toDb โดยตั้งใจ
   *   readable  ใช้ตอนเลือกคอลัมน์ ตอนกรอง และตอนเรียง — สามอย่างนี้อ่านอย่างเดียว
   *   fromDb    ใช้ตอนแปลงแถวที่อ่านมากลับเป็นชื่อของระบบ
   *   toDb      ใช้ตอนเขียน จึงต้องไม่รู้จักชื่อพวกนี้เลย
   *
   * ถ้าเติมลง toDb ด้วย คำสั่งเขียนที่เผลอส่งค่านี้ไปจะถูกฐานข้อมูลปฏิเสธทั้งรายการ
   * ด้วยข้อความที่ไม่ได้ชี้มาที่ช่องนี้ · การให้ toDb_ โยนตั้งแต่ในเครื่องว่า
   * "ไม่มีคอลัมน์นี้ในตาราง" ทำให้รู้ทันทีว่าผิดตรงไหน
   *
   * และ fromDb ต้องรู้จักไว้เสมอ แม้เราจะไม่ได้ขอมันมาทุกคำขอ เพราะ fromDb_
   * โยนทิ้งเมื่อเจอคอลัมน์ที่ไม่รู้จัก · ถ้าวันหนึ่ง PostgREST เปลี่ยนใจแล้วคืน
   * คอลัมน์คำนวณมากับ select=* ด้วย การอ่านใบงานทุกครั้งจะล้มพร้อมกันทั้งระบบ
   */
  var computed = DB_COMPUTED_COLUMNS[tableKey] || {};
  for (var name in computed) {
    if (!Object.prototype.hasOwnProperty.call(computed, name)) continue;
    map.readable[name] = computed[name];
    map.fromDb[computed[name]] = name;
  }

  DB_MAP_CACHE_[tableKey] = map;
  return map;
}

/**
 * แปลง object ของระบบให้เป็นคีย์ของฐานข้อมูล
 *
 * คอลัมน์ที่ไม่มีในตารางแปลงจะโยนข้อผิดพลาด ไม่ใช่เงียบแล้วทิ้ง เพราะการทิ้งเงียบ
 * แปลว่าค่าที่ตั้งใจบันทึกหายไปโดยไม่มีใครรู้ ซึ่งเป็นความผิดพลาดที่หายากที่สุดแบบหนึ่ง
 *
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object} obj ค่าที่มีคีย์ชื่อเดิม เช่น {WO_ID: 'WO-001'}
 * @return {Object} คีย์เป็นชื่อในฐานข้อมูล เช่น {wo_id: 'WO-001'}
 */
function toDb_(tableKey, obj) {
  var map = dbColumnMap_(tableKey);
  var out = {};

  for (var key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    if (!Object.prototype.hasOwnProperty.call(map.toDb, key)) {
      throw new Error('คอลัมน์ "' + key + '" ไม่มีอยู่ในตาราง ' + tableKey +
        ' ตามที่ประกาศไว้ใน DB_COLUMNS');
    }
    out[map.toDb[key]] = obj[key];
  }
  return out;
}

/**
 * แปลงแถวจากฐานข้อมูลกลับเป็นคีย์ชื่อเดิมเป๊ะ
 *
 * เดาด้วยการแปลงตัวพิมพ์ไม่ได้ `pj_id` ต้องกลับไปเป็น `PJ_ID` ไม่ใช่ `Pj_Id`
 * จึงต้องเปิดตารางอ่านทุกครั้ง · คอลัมน์ที่ฐานข้อมูลมีแต่ DB_COLUMNS ไม่รู้จัก
 * จะโยนข้อผิดพลาด เพราะถ้าปล่อยผ่าน ชื่อแบบ snake_case จะรั่วขึ้นไปชั้นบน
 * ซึ่งเป็นสิ่งที่กฎข้อ 21 ห้ามไว้ และจะไม่มีอะไรฟ้องจนกว่าจะมีคนไปอ่านค่านั้น
 *
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object} row แถวที่ PostgREST คืนมา
 * @return {Object} คีย์เป็นชื่อเดิมของระบบ
 */
function fromDb_(tableKey, row) {
  var map = dbColumnMap_(tableKey);
  var out = {};

  for (var key in row) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    if (!Object.prototype.hasOwnProperty.call(map.fromDb, key)) {
      throw new Error('ฐานข้อมูลคืนคอลัมน์ "' + key + '" ของตาราง ' + tableKey +
        ' ซึ่งยังไม่ได้ประกาศไว้ใน DB_COLUMNS — ต้องเพิ่มก่อนใช้งาน');
    }
    var systemName = map.fromDb[key];
    var value = row[key];

    /*
     * ค่าว่างในฐานข้อมูลคือ NULL ส่วนค่าว่างในชีตคือข้อความว่าง และทั้งระบบตีความ
     * ช่องว่างแบบชีตมาตลอด — `isTruthyCell_('')` คือจริง, `toDate_('')` คือ null,
     * และการเทียบ `=== ''` มีอยู่หลายที่ · แปลงตรงนี้ที่เดียวจึงทำให้ผู้เรียกทุกคน
     * เห็นของแบบเดิมเป๊ะ โดยไม่ต้องรู้ว่าข้อมูลย้ายไปไหน (เหตุผลเดียวกับ dbValuesOf_)
     */
    if (value === null || value === undefined) value = '';

    out[systemName] = isTimestampColumn_(systemName) ? dbToDate_(value) : value;
  }
  return out;
}

/**
 * แปลงข้อความ ISO ที่ฐานข้อมูลคืนมา กลับเป็นวัตถุ Date แบบที่ชีตเคยให้
 *
 * ค่าว่างต้องคืนข้อความว่าง ไม่ใช่ Date ที่ไม่ถูกต้อง เพราะช่องว่างในชีตคือข้อความว่าง
 * และทั้งระบบตีความช่องว่างแบบนั้นมาตลอด · ข้อความที่แปลงเป็นวันที่ไม่ได้ให้คืนของเดิมไป
 * ดีกว่าเปลี่ยนเป็น null เงียบ ๆ แล้วทำให้ค่าที่ผิดปกติหายไปจากสายตา
 *
 * @param {*} value ค่าจากฐานข้อมูล
 * @return {Date|string|*}
 */
function dbToDate_(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return value;

  var date = new Date(value);
  return isNaN(date.getTime()) ? value : date;
}

/**
 * แปลงทั้งชุด
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object[]} rows แถวจากฐานข้อมูล
 * @return {Object[]}
 */
function fromDbRows_(tableKey, rows) {
  var out = [];
  for (var i = 0; i < (rows || []).length; i++) out.push(fromDb_(tableKey, rows[i]));
  return out;
}

/* ---------------------------------------------------------------------------
 * ตัวกลางตัวเดียวที่ยิงออกไปจริง
 * --------------------------------------------------------------------------- */

/**
 * ยิงคำสั่งหนึ่งคำสั่งไปที่ Supabase — ทางออกทางเดียวของทั้งระบบ
 *
 * @param {string} method 'GET' | 'POST' | 'PATCH' | 'DELETE'
 * @param {string} path เส้นทางหลัง /rest/v1 เช่น '/work_order?wo_id=eq.WO-001'
 * @param {Object} [body] เนื้อคำสั่ง จะถูกแปลงเป็น JSON ให้เอง
 * @param {Object} [opts] {prefer, anon, retries, context}
 * @return {Object} {status, headers, text, json}
 * @throws {Error} ข้อความไทยกลาง ๆ เสมอ — ของจริงถูกเขียนลง System_Log แล้ว
 */
async function db_fetch_(method, path, body, opts) {
  opts = opts || {};

  var url = dbBaseUrl_() + '/rest/v1' + (path.charAt(0) === '/' ? path : '/' + path);
  var key = opts.anon ? dbAnonKey_() : dbServiceKey_();
  var context = opts.context || (method + ' ' + path);

  var headers = {
    // คีย์อยู่ใน header เท่านั้น ห้ามย้ายไป query string ไม่ว่าจะสะดวกแค่ไหน (SPEC 22.5)
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Accept': 'application/json'
  };
  if (opts.prefer) headers['Prefer'] = opts.prefer;

  var request = { method: method, url: url, headers: headers };
  if (body !== undefined && body !== null) {
    request.contentType = 'application/json';
    request.body = JSON.stringify(body);
  }

  /*
   * ตรวจความยาวก่อนเข้าวงลองใหม่ และตั้งใจให้โยนทะลุออกไปเลย (กฎข้อ 29)
   *
   * คำขอที่ยาวเกินไม่ใช่ปัญหาชั่วคราว ยิงซ้ำอีกกี่ครั้งก็ยาวเท่าเดิม · และถ้าปล่อยให้
   * ตกลงไปใน catch ของวงลูป มันจะถูกนับเป็น "ต่อไม่ติด" แล้วกลายเป็นข้อความไทย
   * กลาง ๆ ของหน้าเว็บ ซึ่งลบข้อมูลที่ผู้ดูแลต้องใช้ตามหาต้นเหตุทิ้งไปทั้งหมด
   */
  assertUrlFits_(request);

  var allowed = (opts.retries === undefined) ? DB_MAX_RETRY : opts.retries;
  var lastError = null;

  for (var attempt = 0; attempt <= allowed; attempt++) {
    if (attempt > 0) Utilities.sleep(DB_RETRY_WAIT_MS * attempt);
    DB_CALL_COUNT_++;
    DB_ROUND_COUNT_++;

    var result = null;
    try {
      result = await httpSend_(request);
    } catch (e) {
      // ต่อไม่ติดหรือหมดเวลา — เป็นกรณีที่ลองใหม่แล้วมีโอกาสสำเร็จจริง
      lastError = e;
      continue;
    }

    if (result.status >= 200 && result.status < 300) return dbResult_(result);

    // 5xx คือฝั่งโน้นมีปัญหาชั่วคราว ลองใหม่ได้ · 4xx คือคำสั่งเราผิด ยิงซ้ำก็ผิดเหมือนเดิม
    if (result.status >= 500 && attempt < allowed) {
      lastError = new Error('HTTP ' + result.status);
      continue;
    }

    await dbFail_(context, result.status, result.body, null);
  }

  await dbFail_(context, 0, '', lastError);
}

/**
 * เติมส่วนที่ PostgREST ต้องใช้ลงในผลรูปแบบกลาง — แปลงเนื้อความเป็น JSON
 * @param {Object} result ผลจาก httpSend_
 * @return {Object} {status, headers, text, json}
 */
function dbResult_(result) {
  var json = null;
  if (result.body) {
    try { json = JSON.parse(result.body); } catch (e) { json = null; }
  }
  return { status: result.status, headers: result.headers, text: result.body, json: json };
}

/**
 * บันทึกของจริงลง System_Log แล้วโยนข้อความไทยกลาง ๆ ให้ผู้ใช้ (กฎข้อ 24)
 *
 * @param {string} context คำสั่งที่กำลังทำ เขียนให้ผู้ดูแลอ่านรู้เรื่อง
 * @param {number} status รหัสตอบกลับ (0 เมื่อต่อไม่ติดเลย)
 * @param {string} text เนื้อคำตอบจาก PostgREST
 * @param {Error} [error] ข้อผิดพลาดตอนต่อไม่ติด
 * @throws {Error} เสมอ
 */
async function dbFail_(context, status, text, error) {
  var parts = ['คำสั่ง: ' + dbScrub_(context)];
  parts.push(status ? ('รหัสตอบกลับ: ' + status) : 'ต่อไม่ติดหรือหมดเวลา');

  /*
   * PostgREST คืน {message, code, details, hint} · hint มักมีชื่อคอลัมน์
   * และบางครั้งมีค่าข้อมูลจริงติดมาด้วย จึงลงได้แค่ System_Log เท่านั้น
   * ผู้ใช้ปลายทางได้ DB_USER_MESSAGE เสมอไม่ว่าเนื้อในจะเป็นอะไร
   */
  var body = null;
  if (text) {
    try { body = JSON.parse(text); } catch (e) { body = null; }

    if (body && (body.message || body.code)) {
      parts.push('code=' + (body.code || '-'));
      parts.push('message=' + (body.message || '-'));
      if (body.details) parts.push('details=' + body.details);
      if (body.hint) parts.push('hint=' + body.hint);
    } else {
      body = null;
      parts.push('เนื้อคำตอบ: ' + String(text).substring(0, 300));
    }
  }
  if (error) parts.push('ข้อผิดพลาด: ' + ((error && error.message) ? error.message : error));

  var detail = dbScrub_(parts.join(' · '));

  /*
   * เก็บ code แยกจากข้อความ เพราะรหัสตอบกลับ HTTP อย่างเดียวบอกไม่พอว่าเกิดอะไรขึ้น
   * **401 มาได้จากสามสาเหตุที่แก้คนละวิธีกันสิ้นเชิง** — ไม่ส่งกุญแจ · กุญแจใช้ไม่ได้ ·
   * และกุญแจที่ใช้ได้แต่ยังไม่ได้ GRANT · ตัวที่แยกได้คือ code ของ Postgres ที่ติดมา
   * ในเนื้อคำตอบ ไม่ใช่รหัส HTTP (ดู dbDoorOfFailure_ · วัดกับของจริง 01-10-2026)
   */
  DB_LAST_FAILURE_ = {
    status: status,
    code: (body && body.code) ? String(body.code) : '',
    message: (body && body.message) ? dbScrub_(String(body.message)) : '',
    hint: (body && body.hint) ? dbScrub_(String(body.hint)) : '',
    detail: detail
  };

  /*
   * -------------------------------------------------------------------------
   * บันทึกความล้มเหลว โดยไม่วิ่งกลับเข้ามาที่ตัวเอง
   * -------------------------------------------------------------------------
   * System_Log ย้ายมาอยู่ในฐานข้อมูลแล้ว การเขียนบันทึกจึงเป็นการคุยกับฐานข้อมูล
   * อีกครั้งหนึ่ง · ถ้าสาเหตุที่ล้มคือ "ฐานข้อมูลติดต่อไม่ได้" การเขียนบันทึกจะล้ม
   * ด้วยเหตุเดียวกัน แล้ววิ่งกลับเข้ามาที่ฟังก์ชันนี้อีกรอบ
   *
   * ผลที่วัดได้คือจำนวนคำขอเพิ่มเป็นสองเท่าพอดี — ล้มสามครั้งตามโควตาลองใหม่
   * แล้วยิงอีกสามครั้งเพื่อพยายามบันทึกว่าล้ม ทั้งที่ฐานข้อมูลกำลังมีปัญหาอยู่
   * และบรรทัดที่ตั้งใจจะบันทึกก็ไม่เคยถูกบันทึกลงไปจริงสักครั้ง
   *
   * ธงนี้จึงทำให้ความล้มเหลวชั้นในไม่พยายามเขียนอะไรอีก แต่ยังพิมพ์ลง
   * Execution log ให้ผู้ดูแลที่กำลังหาสาเหตุอ่านได้ครบ (SPEC 22.5)
   */
  /*
   * และเมื่อตัวฐานข้อมูลเองติดต่อไม่ได้ การพยายามเขียนบันทึกลงไปก็ไม่มีทางสำเร็จ
   * มันจะล้มด้วยเหตุเดียวกัน และจ่ายโควตาลองใหม่ไปอีกชุดหนึ่ง ตอนที่ฝั่งโน้นกำลังมีปัญหาอยู่พอดี
   * วัดได้จริงคือจำนวนคำขอเพิ่มเป็นสองเท่าพอดี — สามครั้งตามโควตาลองใหม่ แล้วอีกสามครั้งเพื่อบอกว่าล้ม
   *
   * ส่วนความล้มเหลวรายคำขอ เช่นคีย์ซ้ำหรือตารางหาย ต้องบันทึกตามปกติ เพราะตัวฐานข้อมูลยังดีอยู่
   */
  var unreachable = (dbDoorOfFailure_(DB_LAST_FAILURE_) === 'SERVER' ||
    dbDoorOfFailure_(DB_LAST_FAILURE_) === 'NETWORK');

  if (DB_FAILING_ || unreachable) {
    Logger.log('DB_FAILED (' +
      (unreachable ? 'ติดต่อฐานข้อมูลไม่ได้ จึงไม่พยายามเขียนลง System_Log'
                  : 'ซ้อนอยู่ในความล้มเหลวก่อนหน้า') + '): ' + detail);
    throw new Error(DB_USER_MESSAGE);
  }

  DB_FAILING_ = true;
  try {
    await logSystemEvent_(ACTION.DB_FAILED, detail);
  } catch (e) {
    // เขียนบันทึกไม่สำเร็จไม่ควรกลบสาเหตุจริงที่กำลังจะโยนออกไป
    Logger.log('บันทึก DB_FAILED ลง System_Log ไม่สำเร็จ · ' + detail);
  } finally {
    DB_FAILING_ = false;
  }

  throw new Error(DB_USER_MESSAGE);
}

/**
 * กำลังจัดการความล้มเหลวอยู่หรือไม่ — กันการวนกลับเข้าตัวเองของ dbFail_
 *
 * ต้องเป็นธงระดับการรัน ไม่ใช่พารามิเตอร์ที่ส่งต่อกันไป เพราะเส้นทางที่วิ่งกลับ
 * เข้ามาผ่านชั้น Audit ซึ่งไม่รู้จักเรื่องนี้เลยและไม่ควรต้องรู้
 */
var DB_FAILING_ = false;

/* ---------------------------------------------------------------------------
 * คำสั่งระดับตาราง
 * --------------------------------------------------------------------------- */

/**
 * ประกอบ query string ของตัวกรอง
 *
 * ค่าของตัวกรองเขียนได้สองแบบ
 *   `{WO_ID: 'WO-001'}`                        เท่ากับพอดี
 *   `{Overall_Status: {op: 'in', value: [..]}}` ตัวดำเนินการอื่นของ PostgREST
 *
 * @param {Object} map ตารางแปลงชื่อของตารางนั้น
 * @param {Object} filters ตัวกรอง
 * @return {string[]} ชิ้นส่วนของ query string
 */
function dbFilterParts_(map, filters) {
  var parts = [];

  for (var key in (filters || {})) {
    if (!Object.prototype.hasOwnProperty.call(filters, key)) continue;

    // คำค้นเดียวที่ต้องตรงสักคอลัมน์หนึ่งในหลายคอลัมน์ — เขียนเป็น or=(...) ของ PostgREST
    if (key === DB_OR_KEY) { parts.push(dbOrPart_(map, filters[key])); continue; }

    // ตัวกรองอ่านอย่างเดียว จึงใช้ readable ซึ่งรวมคอลัมน์ที่ฐานข้อมูลคำนวณให้ด้วย
    if (!Object.prototype.hasOwnProperty.call(map.readable, key)) {
      throw new Error('คอลัมน์ "' + key + '" ไม่มีอยู่ในตาราง ' + map.table +
        ' ตามที่ประกาศไว้ใน DB_COLUMNS');
    }

    var column = map.readable[key];
    var raw = filters[key];

    /*
     * รายการของ {op, value} = หลายเงื่อนไขบนคอลัมน์เดียวกัน ต่อกันด้วย และ
     *
     * จำเป็นสำหรับช่วงวันที่ ซึ่งต้องมีทั้งขอบล่างและขอบบนบนคอลัมน์เดียว ·
     * PostgREST รับพารามิเตอร์ชื่อเดียวกันซ้ำได้และตีความเป็น AND อยู่แล้ว
     * แต่ object ของ JavaScript มีคีย์ซ้ำไม่ได้ จึงต้องเขียนเป็นรายการแทน
     *
     * ระวัง: `{op, value}` ตัวเดียวไม่ใช่รายการ และ Date ก็ไม่ใช่ ทั้งคู่ต้องไม่ตกมาที่นี่
     */
    if (raw instanceof Array && raw.length && raw[0] && typeof raw[0] === 'object' &&
        !(raw[0] instanceof Date) && raw[0].op !== undefined) {
      for (var t = 0; t < raw.length; t++) {
        parts.push(encodeURIComponent(column) + '=' +
          encodeURIComponent(String(raw[t].op) + '.' + dbFilterValue_(String(raw[t].op), raw[t].value)));
      }
      continue;
    }

    var op = 'eq';
    var value = raw;

    if (raw && typeof raw === 'object' && !(raw instanceof Array) && !(raw instanceof Date)) {
      op = String(raw.op || 'eq');
      value = raw.value;
    }

    parts.push(encodeURIComponent(column) + '=' + encodeURIComponent(op + '.' + dbFilterValue_(op, value)));
  }
  return parts;
}

/**
 * ชื่อคีย์พิเศษของตัวกรองแบบ "ตรงสักข้อหนึ่ง"
 *
 * ขึ้นต้นด้วย $ เพราะต้องไม่มีวันชนกับชื่อคอลัมน์จริง ซึ่งเป็นตัวอักษรกับขีดล่างเท่านั้น
 * ถ้าชนกันเมื่อไร คอลัมน์จริงจะถูกตีความเป็นคำสั่งพิเศษแล้วตัวกรองจะเงียบ ๆ ให้ผลผิด
 */
var DB_OR_KEY = '$or';

/**
 * ตัวกรองแบบ "ตรงสักคอลัมน์หนึ่ง" — `or=(col.op.value,col.op.value)`
 *
 * ใช้กับช่องค้นหาช่องเดียวที่ต้องค้นหลายคอลัมน์พร้อมกัน เช่นเลขที่ใบงาน ชื่อลูกค้า
 * ชื่อโครงการ และสถานที่ · **การเหลือช่องค้นเพียงคอลัมน์เดียวคือการถอยหลัง**
 * ผู้ใช้ที่เคยพิมพ์ชื่อสถานที่แล้วเจอ จะพิมพ์แล้วไม่เจออีกต่อไปโดยไม่มีอะไรบอก
 *
 * **ค่าในวงเล็บต้องครอบด้วยเครื่องหมายคำพูด** ต่างจากระดับบนสุดที่ห้ามครอบ ·
 * `probeFilters()` วัดจากของจริงแล้วว่า PostgREST ถอดเครื่องหมายคำพูดเฉพาะในวงเล็บ
 * ถ้าไม่ครอบ คำค้นที่มีจุลภาคจะถูกอ่านเป็นสองเงื่อนไขแล้วได้ผลที่ผิดแบบเงียบ ๆ
 *
 * @param {Object} map ตารางแปลงชื่อคอลัมน์
 * @param {Object[]} terms [{column, op, value}] — column เป็นชื่อในระบบ
 * @return {string} ส่วนหนึ่งของ query string
 */
function dbOrPart_(map, terms) {
  var list = (terms instanceof Array) ? terms : [];
  if (!list.length) {
    throw new Error('ตัวกรองแบบ "ตรงสักข้อหนึ่ง" ต้องมีเงื่อนไขอย่างน้อยหนึ่งข้อ · ' +
      'การส่งรายการว่างมาจะกลายเป็นเงื่อนไขที่ไม่มีวันจริง แล้วผลลัพธ์จะว่างเปล่าเสมอ');
  }

  var conditions = [];
  for (var i = 0; i < list.length; i++) {
    var name = list[i].column;
    if (!Object.prototype.hasOwnProperty.call(map.readable, name)) {
      throw new Error('คอลัมน์ "' + name + '" ไม่มีอยู่ในตาราง ' + map.table +
        ' ตามที่ประกาศไว้ใน DB_COLUMNS');
    }
    conditions.push(map.readable[name] + '.' + String(list[i].op || 'eq') + '.' +
      dbQuoteValue_(list[i].value));
  }
  return 'or=' + encodeURIComponent('(' + conditions.join(',') + ')');
}

/**
 * ค่าฝั่งขวาของตัวกรอง ในรูปที่ PostgREST เข้าใจ
 *
 * ตัวดำเนินการที่ขึ้นต้นด้วย `not.` คือการกลับผลของตัวที่ตามมา (`not.in`, `not.is`)
 * รูปของ **ค่า** ไม่เปลี่ยนตามการกลับผลเลย — `not.in.(...)` ยังต้องมีวงเล็บและ
 * เครื่องหมายคำพูดเหมือน `in.(...)` ทุกประการ · จึงต้องตัดคำนำหน้าออกก่อนตัดสินรูปของค่า
 *
 * ถ้าไม่ตัด `not.in` จะไม่เข้าเงื่อนไขของ `in` แล้วรายการค่าจะถูกส่งไปเป็นข้อความ
 * ที่มีจุลภาคคั่นโดยไม่มีวงเล็บ ซึ่ง PostgREST ตอบ 400 พร้อมข้อความที่ไม่ได้ชี้มาที่นี่
 *
 * @param {string} op ตัวดำเนินการ อาจมีคำนำหน้า not.
 * @param {*} value ค่า
 * @return {string}
 */
function dbFilterValue_(op, value) {
  var bare = String(op).indexOf('not.') === 0 ? String(op).substring(4) : String(op);

  if (bare === 'in') {
    var items = (value instanceof Array) ? value : [value];
    var quoted = [];
    // ใส่เครื่องหมายคำพูดเสมอ เพราะค่าที่มีจุลภาคอยู่ข้างใน เช่น 'ADMIN,APPROVER_SP'
    // จะถูกอ่านเป็นสองค่าทันทีถ้าไม่ใส่ แล้วตัวกรองจะเงียบ ๆ ให้ผลที่ผิด
    for (var i = 0; i < items.length; i++) {
      quoted.push(dbQuoteValue_(items[i]));
    }
    return '(' + quoted.join(',') + ')';
  }
  if (value === null || value === undefined) return 'null';
  if (value instanceof Date) return value.toISOString();

  /*
   * -------------------------------------------------------------------------
   * ห้ามครอบค่าด้วยเครื่องหมายคำพูดที่นี่ — วัดมาแล้วว่ามันพัง
   * -------------------------------------------------------------------------
   * probeFilters() ยิงคู่เทียบ "ครอบ / ไม่ครอบ" ไปที่ Supabase ของจริงแล้วได้ว่า
   *
   *   ระดับบนสุด (column=op.value) เครื่องหมายคำพูด **ไม่ถูกถอด**
   *     eq.AR-0001   ได้ 1 แถว      eq."AR-0001"   ได้ 0 แถว
   *     ilike.*บริ*  ได้ 5 แถว      ilike."*บริ*"  ได้ 0 แถว
   *
   *   ในวงเล็บ (in.(...) และเงื่อนไขใน or=(...)) เครื่องหมายคำพูด **ถูกถอด**
   *     in.(AR-0001) ได้ 1 แถว      in.("AR-0001") ได้ 1 แถว
   *
   * และค่าที่มีจุลภาคกับจุดอยู่ข้างใน ส่งตรง ๆ ที่ระดับบนสุดได้อยู่แล้ว (200 ทั้งคู่)
   * เพราะ PostgREST อ่านทุกอย่างหลังจุดแรกเป็นค่าทั้งก้อน ไม่ได้แยกอะไรต่อ
   *
   * สิ่งที่ต้องป้องจริง ๆ จึงเหลือแค่สัญลักษณ์ของ LIKE ซึ่ง dbLikeLiteral_ จัดการไปแล้ว
   * และการหลีกด้วยขีดทับกลับก็ถูกวัดแล้วว่าใช้ได้จริง (ข้อ D3 กับ D7 ของรายงาน)
   */
  return String(value);
}

/**
 * ครอบค่าด้วยเครื่องหมายคำพูด — **ใช้กับค่าที่อยู่ในวงเล็บเท่านั้น**
 *
 * คือ in.(...) กับเงื่อนไขใน or=(...) ซึ่งเป็นสองที่ที่ PostgREST ถอดเครื่องหมายคำพูดออกจริง
 * ตามที่ probeFilters() วัดได้ · ที่ระดับบนสุดมันไม่ถอด การครอบที่นั่นจึงทำให้ได้ศูนย์แถว
 *
 * ข้างในเครื่องหมายคำพูด ขีดทับกลับคือตัวหลีก ตัวมันเองกับเครื่องหมายคำพูด
 * จึงต้องถูกหลีกก่อน · ต้องเรียงลำดับแบบนี้เท่านั้น ถ้าหลีกเครื่องหมายคำพูดก่อน
 * ขีดทับกลับที่เพิ่งใส่เข้าไปจะถูกหลีกซ้ำอีกชั้นในรอบถัดมา
 *
 * @param {*} value ค่าที่จะครอบ
 * @return {string}
 */
function dbQuoteValue_(value) {
  return '"' + String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

/**
 * ทำให้ข้อความกลายเป็นตัวอักษรธรรมดาทั้งหมดในรูปแบบของ LIKE
 *
 * ใน LIKE ของ SQL มีสัญลักษณ์อยู่สามตัวคือ `%` (ข้อความยาวเท่าใดก็ได้)
 * `_` (อักขระตัวเดียว) และขีดทับกลับซึ่งเป็นตัวหลีก · คำค้นที่มีสามตัวนี้ปนอยู่
 * จะกวาดแถวที่ไม่เกี่ยวข้องมาด้วย เช่นค้น "A_B" แล้วได้ "AxB" ติดมา
 *
 * **ดอกจันจงใจไม่หลีก** · PostgREST แทน `*` ด้วย `%` แบบตรงไปตรงมาก่อนส่งต่อให้
 * ฐานข้อมูล โดยไม่สนใจขีดทับกลับที่นำหน้าอยู่ การหลีกจึงได้ `\%` ซึ่งแปลว่า
 * "ตัวอักษรเปอร์เซ็นต์" แล้วแถวที่มีดอกจันจริงจะหายไปเงียบ ๆ · การปล่อยไว้ทำให้
 * ดอกจันกลายเป็นตัวแทนข้อความ ซึ่งได้ผลลัพธ์ที่ "กว้างเกินจริง" แทนที่จะ "ขาดหาย"
 * และผู้เรียกคัดรอบสุดท้ายในหน่วยความจำอยู่แล้ว ผลที่ได้จึงยังตรงเป๊ะ
 *
 * @param {string} text ข้อความจากผู้ใช้
 * @return {string} ข้อความที่ปลอดสัญลักษณ์ของ LIKE แล้ว
 */
function dbLikeLiteral_(text) {
  return String(text === null || text === undefined ? '' : text)
    .replace(/\\/g, '\\\\')      // ต้องมาก่อนเสมอ ไม่งั้นจะไปหลีกตัวที่เพิ่งใส่เอง
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

/**
 * รูปแบบ "มีคำนี้อยู่ข้างใน" สำหรับตัวกรอง ilike
 * @param {string} text คำค้นจากผู้ใช้
 * @return {string}
 */
function dbContainsPattern_(text) {
  return '*' + dbLikeLiteral_(text) + '*';
}

/**
 * อ่านข้อมูลจากตารางเดียว
 *
 * @param {string} tableKey ชื่อตารางในระบบ เช่น 'WorkOrder'
 * @param {Object} [opts] {filters, select, order, limit, offset}
 *   order เขียนได้เป็น 'Created_Date' หรือ {column: 'Created_Date', ascending: false}
 *   หรือเป็นรายการของสองแบบนั้น
 * @return {Object[]} แถวที่มีคีย์ชื่อเดิมของระบบ
 */
async function db_select_(tableKey, opts) {
  var result = await db_fetch_('GET', dbSelectPath_(tableKey, opts), null,
    { context: 'อ่านตาราง ' + tableKey });
  var rows = result.json || [];

  /*
   * โหมดดิบ — คืนสิ่งที่ PostgREST ส่งมาตรง ๆ โดยไม่ผ่าน fromDb_
   *
   * มีไว้ให้การสำรองข้อมูลเท่านั้น และมีเหตุผลเดียวที่หนักแน่นพอ: `fromDb_` แปลง
   * NULL ให้เป็นข้อความว่าง ซึ่งถูกต้องสำหรับโค้ดที่เคยอ่านชีต แต่เป็นการ **ทำลาย
   * ข้อมูล** สำหรับไฟล์สำรอง — ช่องที่ไม่เคยถูกกรอก กับช่องที่ถูกกรอกเป็นค่าว่าง
   * จะกลายเป็นสิ่งเดียวกันตลอดไป และกู้กลับมาแยกไม่ออกอีกเลย
   *
   * นี่คือเหตุผลเดียวกับที่ไฟล์สำรองเป็น JSON ไม่ใช่ CSV · ถ้าอ่านผ่านตัวแปลง
   * เราจะเสียความต่างนั้นไปตั้งแต่ก่อนถึงไฟล์ แล้วการเลือก JSON ก็ไม่มีความหมาย
   *
   * ชื่อคอลัมน์ที่ได้จึงเป็นชื่อในฐานข้อมูล (`wo_id`) ไม่ใช่ชื่อในระบบ (`WO_ID`)
   * ซึ่งกฎข้อ 21 ห้ามไม่ให้รั่วขึ้นไปเหนือชั้น Repo · 98_Backup.gs จึงเป็นที่เดียว
   * ที่เรียกโหมดนี้ได้ และไม่ส่งต่อค่าพวกนี้ให้ใครนอกจากเขียนลงไฟล์
   */
  return (opts && opts.raw) ? rows : fromDbRows_(tableKey, rows);
}

/**
 * แถวของหน้าที่กำลังดู พร้อมจำนวนทั้งหมด — **ในคำขอเดียว**
 *
 * PostgREST ตอบจำนวนทั้งหมดมาทาง header `Content-Range: 0-19/1234` เมื่อขอด้วย
 * `Prefer: count=exact` · จึงได้ทั้งแถวของหน้านี้และยอดรวมโดยไม่ต้องยิงสองครั้ง
 *
 * **นี่คือเหตุผลที่หน้ารายการไม่ต้องอ่านทั้งตารางอีกต่อไป** ยอดรวมที่เคยต้องนับเอง
 * จากดัชนีที่อ่านมาทั้งหมด ตอนนี้มาจากฐานข้อมูลพร้อมกับแถวที่กำลังจะแสดง
 *
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object} opts เหมือน db_select_ · ต้องมี limit และ offset เสมอ
 * @return {Object} {rows, total} — total เป็น -1 เมื่ออ่านจาก header ไม่ได้
 */
async function db_selectPage_(tableKey, opts) {
  if (!opts || opts.limit === undefined) {
    throw new Error('db_selectPage_ ต้องระบุ limit เสมอ — การอ่านที่ไม่มีเพดานคือสิ่งที่กฎข้อ 28 ห้ามไว้');
  }

  var result = await db_fetch_('GET', dbSelectPath_(tableKey, opts), null, {
    prefer: 'count=exact',
    context: 'อ่านตาราง ' + tableKey + ' ทีละหน้า'
  });

  var range = String(result.headers['content-range'] || '');
  var slash = range.lastIndexOf('/');
  var total = (slash === -1) ? -1 : (range.substring(slash + 1) === '*' ? -1
    : Number(range.substring(slash + 1)));

  return { rows: fromDbRows_(tableKey, result.json || []), total: total };
}

/**
 * เพิ่มหรือทับแถวด้วยค่าดิบที่ใช้ชื่อคอลัมน์ของฐานข้อมูลอยู่แล้ว
 *
 * คู่ตรงข้ามของ `db_select_` โหมดดิบ และมีไว้ให้การกู้คืนเท่านั้น · ไฟล์สำรองเก็บ
 * ชื่อคอลัมน์ฝั่งฐานข้อมูลไว้ตามที่อ่านมา การส่งกลับจึงต้องไม่ผ่าน `toDb_` อีกรอบ
 * ไม่งั้นชื่อจะถูกแปลงสองครั้งแล้วไม่ตรงกับอะไรเลย
 *
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object[]} rawRows แถวที่คีย์เป็นชื่อคอลัมน์ของฐานข้อมูล
 * @return {number} จำนวนแถวที่ฐานข้อมูลรับไว้
 */
async function db_upsertRaw_(tableKey, rawRows) {
  var map = dbColumnMap_(tableKey);

  var result = await db_fetch_('POST', '/' + map.table, rawRows, {
    prefer: 'resolution=merge-duplicates,return=representation',
    context: 'กู้คืนแถวลงตาราง ' + tableKey
  });
  return (result.json || []).length;
}

/**
 * ประกอบเส้นทางของคำสั่งอ่าน — แยกออกมาเพราะ db_fetchAll_ ต้องใช้ตัวเดียวกัน
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object} [opts] เหมือน db_select_
 * @return {string}
 */
function dbSelectPath_(tableKey, opts) {
  opts = opts || {};
  var map = dbColumnMap_(tableKey);
  var query = [];

  if (opts.select && opts.select !== '*') {
    var columns = [];
    var wanted = (opts.select instanceof Array) ? opts.select : [opts.select];
    for (var i = 0; i < wanted.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(map.readable, wanted[i])) {
        throw new Error('คอลัมน์ "' + wanted[i] + '" ไม่มีอยู่ในตาราง ' + tableKey +
          ' ตามที่ประกาศไว้ใน DB_COLUMNS');
      }
      columns.push(map.readable[wanted[i]]);
    }
    query.push('select=' + encodeURIComponent(columns.join(',')));
  } else {
    query.push('select=*');
  }

  query = query.concat(dbFilterParts_(map, opts.filters));

  if (opts.order) {
    var orders = (opts.order instanceof Array) ? opts.order : [opts.order];
    var terms = [];
    for (var o = 0; o < orders.length; o++) {
      var one = orders[o];
      var name = (typeof one === 'string') ? one : one.column;
      var asc = (typeof one === 'string') ? true : (one.ascending !== false);
      if (!Object.prototype.hasOwnProperty.call(map.readable, name)) {
        throw new Error('คอลัมน์ "' + name + '" ไม่มีอยู่ในตาราง ' + tableKey +
          ' ตามที่ประกาศไว้ใน DB_COLUMNS');
      }
      terms.push(map.readable[name] + '.' + (asc ? 'asc' : 'desc'));
    }
    query.push('order=' + encodeURIComponent(terms.join(',')));
  }

  if (opts.limit !== undefined)  query.push('limit=' + Number(opts.limit));
  if (opts.offset !== undefined) query.push('offset=' + Number(opts.offset));

  return '/' + map.table + '?' + query.join('&');
}

/**
 * จำนวนแถวสูงสุดที่ PostgREST คืนได้ในคำขอเดียว
 *
 * Supabase ตั้ง db-max-rows ไว้ที่ 1000 เป็นค่าตั้งต้น · **ถ้าขอมากกว่านี้ มันไม่แจ้ง
 * ความผิดพลาด แต่คืนมาแค่ 1000 แถวเฉย ๆ** ซึ่งอ่านแล้วดูเหมือนตารางมีเท่านั้นจริง ๆ
 *
 * ตารางลูกค้ามี 5,901 แถว การอ่านโดยไม่แบ่งหน้าจึงเห็นลูกค้าแค่หนึ่งพันรายแรก
 * แล้วอีกสี่พันเก้าร้อยรายจะ "ไม่มีตัวตน" สำหรับระบบ โดยไม่มีอะไรฟ้องเลยสักอย่าง
 */
var DB_PAGE_ROWS = 1000;

/**
 * เพดานจำนวนหน้าที่ยอมไล่อ่าน — กันการวนไม่รู้จบเมื่อฝั่งโน้นทำตัวไม่เหมือนที่คาด
 * 50 หน้า = 50,000 แถว ซึ่งมากกว่าตารางใหญ่ที่สุดของระบบเกือบสิบเท่า
 */
var DB_MAX_PAGES = 50;

/**
 * อ่านทั้งตารางจริง ๆ โดยไล่ทีละหน้าจนหมด
 *
 * ต้องเรียงลำดับด้วยคอลัมน์คีย์เสมอ ไม่ใช่ปล่อยให้ฐานข้อมูลเลือกลำดับเอง
 * เพราะการแบ่งหน้าโดยไม่ระบุลำดับ ไม่รับประกันว่าหน้าที่สองจะต่อจากหน้าแรกพอดี
 * แถวบางแถวจึงหายไปและบางแถวมาซ้ำ โดยที่จำนวนรวมยังดูถูกต้อง
 *
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object} [opts] เหมือน db_select_ แต่ห้ามใส่ limit หรือ offset
 * @return {Object[]} ทุกแถวของตาราง
 * @throws {Error} เมื่ออ่านไม่ครบภายในเพดานจำนวนหน้า
 */
async function db_selectAll_(tableKey, opts) {
  opts = opts || {};
  var keyColumn = dbColumnMap_(tableKey).systemNames[0];
  var out = [];

  for (var page = 0; page < DB_MAX_PAGES; page++) {
    var got = await db_select_(tableKey, {
      filters: opts.filters,
      select: opts.select,
      order: opts.order || keyColumn,
      raw: opts.raw,              // โหมดดิบต้องเดินทางผ่านการแบ่งหน้าไปด้วย
      limit: DB_PAGE_ROWS,
      offset: page * DB_PAGE_ROWS
    });
    out = out.concat(got);

    // ได้ไม่เต็มหน้า แปลว่าหมดแล้ว · เต็มหน้าพอดีต้องขอหน้าถัดไปเพื่อยืนยันว่าหมดจริง
    if (got.length < DB_PAGE_ROWS) return out;
  }

  /*
   * มาถึงตรงนี้แปลว่าอ่านครบ 50 หน้าแล้วยังไม่จบ ซึ่งผิดปกติจนต้องหยุด
   * การคืนของที่อาจไม่ครบโดยไม่บอกใคร คือสิ่งเดียวกับที่ทำให้ต้องเขียนฟังก์ชันนี้ตั้งแต่แรก
   */
  throw new Error('อ่านตาราง ' + tableKey + ' ไม่จบใน ' + DB_MAX_PAGES +
    ' หน้า (' + out.length + ' แถว) — หยุดไว้ก่อนเพราะข้อมูลที่ได้อาจไม่ครบ');
}

/**
 * จำนวนแถวทั้งตาราง โดยไม่ต้องดึงข้อมูลลงมาสักแถว
 *
 * ใช้ `Prefer: count=exact` คู่กับ `limit=0` · PostgREST ตอบจำนวนมาทาง header
 * `Content-Range: 0-0/1234` ซึ่งเป็นตัวเลขที่เชื่อได้ ต่างจากการนับแถวที่ดึงมา
 * ซึ่งจะได้แค่จำนวนที่ดึงมาเท่านั้น และมองไม่เห็นว่าข้างหลังยังมีอีกเท่าไร
 *
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object} [filters] ตัวกรอง
 * @return {number} จำนวนแถว (-1 เมื่ออ่านจาก header ไม่ได้)
 */
async function db_count_(tableKey, filters) {
  var map = dbColumnMap_(tableKey);
  var query = ['select=*', 'limit=0'].concat(dbFilterParts_(map, filters));

  var result = await db_fetch_('GET', '/' + map.table + '?' + query.join('&'), null, {
    prefer: 'count=exact',
    context: 'นับแถวตาราง ' + tableKey
  });

  var range = String(result.headers['content-range'] || '');
  var slash = range.lastIndexOf('/');
  if (slash === -1) return -1;

  var total = range.substring(slash + 1);
  return (total === '*') ? -1 : Number(total);
}

/**
 * เพิ่มแถวใหม่
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object|Object[]} rows แถวเดียวหรือหลายแถว คีย์เป็นชื่อเดิมของระบบ
 * @return {Object[]} แถวที่ถูกบันทึกจริง พร้อมค่าที่ฐานข้อมูลเติมให้เอง
 */
async function db_insert_(tableKey, rows) {
  var map = dbColumnMap_(tableKey);
  var list = (rows instanceof Array) ? rows : [rows];
  var payload = [];
  for (var i = 0; i < list.length; i++) payload.push(toDb_(tableKey, list[i]));

  var result = await db_fetch_('POST', '/' + map.table, payload, {
    // ขอแถวที่บันทึกจริงกลับมาด้วย เพื่อให้เห็นค่าที่ DEFAULT ของฐานข้อมูลเติมให้
    // ซึ่งเป็นที่เดียวที่กฎ "ช่องว่างแปลว่าอะไร" ของกฎข้อ 25 ถูกบังคับใช้จริง
    prefer: 'return=representation',
    context: 'เพิ่มแถวในตาราง ' + tableKey
  });
  return fromDbRows_(tableKey, result.json || []);
}

/**
 * แก้ไขแถวที่ตรงเงื่อนไข
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object} filters เงื่อนไข ต้องมีอย่างน้อยหนึ่งข้อ
 * @param {Object} patch ค่าที่จะเปลี่ยน คีย์เป็นชื่อเดิมของระบบ
 * @return {Object[]} แถวหลังแก้
 */
async function db_update_(tableKey, filters, patch) {
  var map = dbColumnMap_(tableKey);
  var parts = dbFilterParts_(map, filters);

  // ไม่มีเงื่อนไขเลยแปลว่าแก้ทั้งตาราง ซึ่งไม่มีใครตั้งใจทำ และย้อนกลับไม่ได้
  if (!parts.length) {
    throw new Error('แก้ไขทั้งตาราง ' + tableKey + ' ไม่ได้ — ต้องระบุเงื่อนไขอย่างน้อยหนึ่งข้อ');
  }

  var result = await db_fetch_('PATCH', '/' + map.table + '?' + parts.join('&'),
    toDb_(tableKey, patch), {
      prefer: 'return=representation',
      context: 'แก้ไขแถวในตาราง ' + tableKey
    });
  return fromDbRows_(tableKey, result.json || []);
}

/**
 * เพิ่มหรือทับของเดิมเมื่อคีย์หลักซ้ำ
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object|Object[]} rows แถวเดียวหรือหลายแถว
 * @return {Object[]} แถวหลังบันทึก
 */
async function db_upsert_(tableKey, rows) {
  var map = dbColumnMap_(tableKey);
  var list = (rows instanceof Array) ? rows : [rows];
  var payload = [];
  for (var i = 0; i < list.length; i++) payload.push(toDb_(tableKey, list[i]));

  var result = await db_fetch_('POST', '/' + map.table, payload, {
    prefer: 'resolution=merge-duplicates,return=representation',
    context: 'เพิ่มหรือทับแถวในตาราง ' + tableKey
  });
  return fromDbRows_(tableKey, result.json || []);
}

/**
 * ลบแถวที่ตรงเงื่อนไข
 *
 * ระบบนี้ลบข้อมูลจริงน้อยมาก — การลบไฟล์ใช้ `Is_Active = false` ตามกฎข้อ 8
 * ตัวนี้จึงมีไว้สำหรับข้อมูลชั่วคราวเป็นหลัก เช่นโทเคนที่หมดอายุและแถวทดสอบ
 *
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object} filters เงื่อนไข ต้องมีอย่างน้อยหนึ่งข้อ
 * @return {Object[]} แถวที่ถูกลบ
 */
async function db_delete_(tableKey, filters) {
  var map = dbColumnMap_(tableKey);
  var parts = dbFilterParts_(map, filters);

  if (!parts.length) {
    throw new Error('ลบทั้งตาราง ' + tableKey + ' ไม่ได้ — ต้องระบุเงื่อนไขอย่างน้อยหนึ่งข้อ');
  }

  var result = await db_fetch_('DELETE', '/' + map.table + '?' + parts.join('&'), null, {
    prefer: 'return=representation',
    context: 'ลบแถวในตาราง ' + tableKey
  });
  return fromDbRows_(tableKey, result.json || []);
}

/**
 * เรียกฟังก์ชันในฐานข้อมูล
 *
 * ตัวที่ใช้จริงตัวแรกคือ `next_running_number` ซึ่งทำ UPDATE ... RETURNING
 * ในคำสั่งเดียว จึงออกเลขซ้ำกันไม่ได้ในทางทฤษฎี ต่างจาก LockService ที่กันได้
 * แค่ภายในสคริปต์เดียวกัน และยังมีช่องว่างระหว่างอ่านกับเขียนอยู่ดี (SPEC 22.4)
 *
 * @param {string} fnName ชื่อฟังก์ชันใน Postgres
 * @param {Object} [args] อาร์กิวเมนต์ ชื่อตรงกับที่ประกาศไว้ในฟังก์ชัน
 * @return {*} ค่าที่ฟังก์ชันคืนมา
 */
async function db_rpc_(fnName, args) {
  var result = await db_fetch_('POST', '/rpc/' + fnName, args || {}, {
    context: 'เรียกฟังก์ชัน ' + fnName
  });
  return result.json;
}

/**
 * อ่านหลายตารางพร้อมกันในรอบเดียว
 *
 * หน้าเว็บที่ต้องอ่าน 4 ตารางจะเสียเวลาเท่ากับอ่านตารางเดียว (SPEC 22.2)
 * เพราะ `UrlFetchApp.fetchAll()` ยิงทั้งหมดขนานกัน ไม่ใช่เรียงทีละตัว
 *
 * ตัวนี้ยิง UrlFetchApp เองแทนที่จะวนเรียก db_fetch_ เพราะการยิงขนานคือทั้งหมด
 * ของเหตุผลที่มันมีอยู่ · กติกาเรื่อง header คีย์ และการแปลงข้อผิดพลาดยังเหมือนกัน
 * ทุกข้อ และยังอยู่ในไฟล์นี้ไฟล์เดียวตามกฎข้อ 21
 *
 * @param {Object[]} requests รายการ {tableKey, filters, select, order, limit, offset}
 * @return {Object[][]} ผลของแต่ละคำขอ เรียงตามลำดับที่ส่งเข้ามา
 */
async function db_fetchAll_(requests) {
  if (!requests || !requests.length) return [];

  var key = dbServiceKey_();
  var base = dbBaseUrl_() + '/rest/v1';
  var params = [];

  for (var i = 0; i < requests.length; i++) {
    params.push({
      url: base + dbSelectPath_(requests[i].tableKey, requests[i]),
      method: 'get',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' }
    });
  }

  // เหตุผลเดียวกับใน db_fetch_ — ความยาวเกินต้องโยนทะลุออกไป ไม่ใช่กลายเป็นความล้มเหลวทั่วไป
  for (var c = 0; c < params.length; c++) assertUrlFits_(params[c]);

  DB_CALL_COUNT_ += params.length;
  DB_ROUND_COUNT_++;      // ยิงพร้อมกันทั้งชุด จึงรอเพียงรอบเดียวไม่ว่าจะกี่คำขอ

  var results = null;
  try {
    results = httpSendAll_(params);
  } catch (e) {
    await dbFail_('อ่านหลายตารางพร้อมกัน', 0, '', e);
  }

  var out = [];
  for (var r = 0; r < results.length; r++) {
    var tableKey = requests[r].tableKey;

    // คำขอใดคำขอหนึ่งพังแปลว่าหน้าที่กำลังสร้างจะขาดข้อมูลไปส่วนหนึ่ง
    // การคืนของที่ไม่ครบโดยไม่บอกใครแย่กว่าการหยุด จึงหยุดที่ตัวแรกที่พัง
    if (results[r].status < 200 || results[r].status >= 300) {
      await dbFail_('อ่านตาราง ' + tableKey + ' (พร้อมกันหลายตาราง)', results[r].status,
        results[r].body, null);
    }

    out.push(fromDbRows_(tableKey, dbResult_(results[r]).json || []));
  }
  return out;
}

/**
 * ลบแถวในหลายตารางพร้อมกันในรอบเดียว
 *
 * **ทำไมต้องมี** · การล้างข้อมูลทดสอบต้องแตะทุกตารางที่เทสต์เขียนลงไป ซึ่งวันนี้
 * มีสิบสามตาราง · การยิงทีละตารางแล้วรอคำตอบ ทำให้ราคาคงที่ของการเดินทางไป-กลับ
 * ถูกจ่ายสิบสามครั้งทั้งที่ตารางส่วนใหญ่ไม่มีอะไรให้ลบเลย · วัดจากของจริงได้ 14-16
 * วินาทีต่อกลุ่ม ซึ่งไม่ได้แปรตามจำนวนแถว แต่แปรตามจำนวนตาราง
 *
 * เรื่องที่สำคัญกว่าความเร็ว: วันที่การล้างข้อมูลชนเพดาน 6 นาที มันจะตายกลางทาง
 * แล้วทิ้งแถวทดสอบค้างใน **ตารางจริงที่ผู้ใช้เห็น** ซึ่งเคยเกิดแล้ว 1,065 แถว
 *
 * กติกาเรื่องหัวคำขอ คีย์ และการแปลงข้อผิดพลาด เหมือน db_fetchAll_ ทุกข้อ
 *
 * @param {Object[]} requests รายการ {tableKey, filters}
 * @return {Object[][]} แถวที่ถูกลบของแต่ละคำขอ เรียงตามลำดับที่ส่งเข้ามา
 */
async function db_deleteAll_(requests) {
  if (!requests || !requests.length) return [];

  var key = dbServiceKey_();
  var base = dbBaseUrl_() + '/rest/v1';
  var params = [];

  for (var i = 0; i < requests.length; i++) {
    var map = dbColumnMap_(requests[i].tableKey);
    var parts = dbFilterParts_(map, requests[i].filters);

    // เหตุผลเดียวกับ db_delete_ — คำสั่งลบที่ไม่มีเงื่อนไขคือคำสั่งลบทั้งตาราง
    if (!parts.length) {
      throw new Error('ลบทั้งตาราง ' + requests[i].tableKey + ' ไม่ได้ — ต้องระบุเงื่อนไขอย่างน้อยหนึ่งข้อ');
    }

    params.push({
      url: base + '/' + map.table + '?' + parts.join('&'),
      method: 'delete',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key,
        'Accept': 'application/json', 'Prefer': 'return=representation' }
    });
  }

  for (var c = 0; c < params.length; c++) assertUrlFits_(params[c]);

  DB_CALL_COUNT_ += params.length;
  DB_ROUND_COUNT_++;      // ยิงพร้อมกันทั้งชุด จึงรอเพียงรอบเดียวไม่ว่าจะกี่คำขอ

  var results = null;
  try {
    results = httpSendAll_(params);
  } catch (e) {
    await dbFail_('ลบหลายตารางพร้อมกัน', 0, '', e);
  }

  var out = [];
  for (var r = 0; r < results.length; r++) {
    var tableKey = requests[r].tableKey;

    // ตารางใดลบไม่สำเร็จ ต้องหยุดและบอกชื่อตาราง ไม่ใช่รายงานรวมว่าล้างเสร็จแล้ว
    if (results[r].status < 200 || results[r].status >= 300) {
      await dbFail_('ลบตาราง ' + tableKey + ' (พร้อมกันหลายตาราง)', results[r].status,
        results[r].body, null);
    }

    out.push(fromDbRows_(tableKey, dbResult_(results[r]).json || []));
  }
  return out;
}

/**
 * ยิงคำขออ่านดิบ ๆ ไปที่ฐานข้อมูล แล้วคืนคำตอบทั้งก้อนตามที่ได้มาจริง
 *
 * ต่างจาก db_fetch_ ทุกข้อที่สำคัญ — **ไม่ลองใหม่ ไม่แปลความ ไม่เขียน System_Log
 * และไม่โยนข้อผิดพลาด** เพราะสิ่งที่กำลังหาคือ "ฝั่งโน้นตอบว่าอะไร" ไม่ใช่
 * "เราควรบอกผู้ใช้ว่าอะไร" · คำตอบที่เป็นความผิดพลาดคือผลลัพธ์ที่ต้องการ ไม่ใช่เหตุขัดข้อง
 *
 * มีไว้ให้ probeFilters() ใช้สำรวจว่าตัวกรองแต่ละรูปแบบถูกฝั่งโน้นตีความอย่างไร
 * ก่อนที่เราจะไปสอนของจำลองตาม · กฎข้อ 27 ฉบับที่แก้แล้วบอกว่าของจำลองต้องสร้าง
 * จากสิ่งที่ **สังเกตเห็น** ไม่ใช่จากสิ่งที่เราเชื่อว่าปลายทางทำ
 *
 * @param {string} path เส้นทางหลัง /rest/v1 ที่ประกอบมาเองทั้งก้อน เช่น '/customer?select=*&limit=1'
 * @param {string} [method='get'] วิธีของคำขอ · ใช้ 'delete' ได้เมื่อต้องล้างของค้าง
 *   โดยไม่ผ่านชั้นประกอบตัวกรองที่กำลังถูกสงสัยอยู่
 * @return {Object} {path, status, code, message, hint, details, rows, body}
 */
async function db_probeRaw_(path, method, allowLongUrl) {
  var out = { path: path, status: 0, code: '', message: '', hint: '', details: '',
    rows: -1, body: '' };

  var key = dbServiceKey_();
  var result = null;

  DB_CALL_COUNT_++;
  DB_ROUND_COUNT_++;

  try {
    result = await httpSend_({
      method: String(method || 'get').toLowerCase(),
      url: dbBaseUrl_() + '/rest/v1' + path,
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key,
        'Accept': 'application/json', 'Prefer': 'return=representation' },
      // probeUrlLimit() ต้องยิงของที่ยาวเกินด่านของเราเอง เพราะกำลังวัดด่านของ Apps Script
      skipLengthCheck: allowLongUrl === true
    });
  } catch (e) {
    out.message = 'ต่อไม่ติด: ' + dbScrub_(e && e.message);
    return out;
  }

  out.status = result.status;
  out.body = dbScrub_(String(result.body === null || result.body === undefined ? '' : result.body));

  var parsed = null;
  try { parsed = JSON.parse(result.body); } catch (e) { parsed = null; }

  if (parsed instanceof Array) {
    out.rows = parsed.length;
    return out;
  }
  if (parsed && typeof parsed === 'object') {
    out.code    = dbScrub_(dbProbeText_(parsed.code));
    out.message = dbScrub_(dbProbeText_(parsed.message));
    out.hint    = dbScrub_(dbProbeText_(parsed.hint));
    out.details = dbScrub_(dbProbeText_(parsed.details));
  }
  return out;
}

/**
 * ค่าจาก PostgREST ที่อาจเป็น null ให้กลายเป็นข้อความเสมอ
 * @param {*} value ค่าที่ได้มา
 * @return {string}
 */
function dbProbeText_(value) {
  return (value === null || value === undefined) ? '' : String(value);
}

/**
 * ลองอ่านด้วยคีย์ anon เพื่อพิสูจน์ว่า RLS ปิดประตูอยู่จริง
 *
 * ตัวนี้ต้องอยู่ในไฟล์นี้เพราะกฎข้อ 21 ห้ามไฟล์อื่นยิง UrlFetchApp ไปหา Supabase
 * และต้องไม่ผ่าน db_fetch_ ตามปกติ เพราะสิ่งที่กำลังทดสอบคือ "การถูกปฏิเสธ"
 * ซึ่งเป็นผลลัพธ์ที่ถูกต้อง ไม่ใช่ข้อผิดพลาดที่ต้องเขียนลง System_Log
 *
 * @param {string} tableKey ตารางที่จะลองอ่าน
 * @return {Object} {ok, status, rows, reason} — ok=true แปลว่าปิดประตูอยู่จริง
 */
async function db_probeAnon_(tableKey) {
  var key = dbAnonKey_();
  if (!key) return { ok: false, status: 0, rows: -1, reason: 'ยังไม่ได้ตั้งค่า SUPABASE_ANON_KEY จึงยังพิสูจน์ไม่ได้' };

  var map = dbColumnMap_(tableKey);
  var result = null;
  try {
    result = await httpSend_({
      method: 'get',
      url: dbBaseUrl_() + '/rest/v1/' + map.table + '?select=*&limit=5',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' }
    });
  } catch (e) {
    return { ok: false, status: 0, rows: -1, reason: 'ต่อไม่ติด: ' + dbScrub_(e && e.message) };
  }

  var status = result.status;
  var text = result.body;
  var body = null;
  try { body = JSON.parse(text); } catch (e) { body = null; }

  /*
   * ถูกปฏิเสธที่ชั้น GRANT ไม่ได้แปลว่า RLS ทำงาน — มันแปลว่ายังไปไม่ถึง RLS ด้วยซ้ำ
   * ทั้งสองอย่างกันคนนอกออกไปได้จริงในวันนี้ แต่ถ้าวันหนึ่งมีคนให้ GRANT กับ anon
   * (ซึ่งเป็นเรื่องปกติเวลาจะเปิด API ให้หน้าเว็บอ่านบางตาราง) RLS จะกลายเป็น
   * ประตูบานเดียวที่เหลือ · ถ้าตอนนั้นมันไม่ทำงาน ข้อมูลทั้งฐานจะเปิดออกทันที
   * โดยที่รายงานฉบับนี้เคยบอกไว้ว่า "ผ่าน" มาตลอด
   */
  // ดู code ก่อน status — GRANT ที่ขาดมาพร้อม 401 ไม่ใช่ 403 (วัดจริง 01-10-2026)
  if (body && String(body.code) === DB_CODE_NO_GRANT) {
    return {
      ok: true, proven: false, status: status, code: String(body.code), rows: 0,
      door: 'GRANT',
      reason: 'ถูกกันที่ชั้น GRANT ตั้งแต่ยังไม่ถึง RLS — อ่านไม่ได้จริง แต่ยังไม่ได้พิสูจน์ว่า RLS ทำงาน'
    };
  }

  if (status === 401 || status === 403) {
    return {
      ok: true, proven: false, status: status, code: body ? String(body.code || '') : '', rows: 0,
      door: 'KEY',
      reason: 'ถูกปฏิเสธตั้งแต่ชั้นคีย์ — อ่านไม่ได้จริง แต่ยังไม่ได้พิสูจน์ว่า RLS ทำงาน'
    };
  }

  var rows = (body instanceof Array) ? body : [];

  // ผ่านทั้งคีย์และ GRANT มาแล้ว แต่ได้ 0 แถว — นี่คืออาการของ RLS ที่ทำงานจริง
  return {
    ok: rows.length === 0,
    proven: rows.length === 0,
    status: status,
    code: '',
    rows: rows.length,
    door: 'RLS',
    reason: rows.length === 0
      ? 'ผ่านชั้นคีย์และ GRANT มาแล้ว แต่ได้ 0 แถว — RLS ทำงานจริง'
      : 'ผ่านมาถึง RLS แล้วยังอ่านข้อมูลออกมาได้'
  };
}

/* ---------------------------------------------------------------------------
 * การวัดและการตรวจ — ยังอยู่ในไฟล์นี้เพราะกฎข้อ 21 ห้ามไฟล์อื่นยิงออกนอกระบบ
 * --------------------------------------------------------------------------- */

/**
 * ที่อยู่ที่ใช้วัดต้นทุนคงที่ของ UrlFetchApp เอง
 *
 * ตอบ 204 เปล่า ๆ ไม่มีเนื้อหา ไม่ต้องใช้คีย์ และไม่เกี่ยวกับ Supabase เลย
 * เวลาที่วัดได้จากที่นี่คือส่วนที่ Apps Script กินไปก่อนที่คำขอจะออกจากเครื่อง
 * ซึ่งเป็นต้นทุนที่หนีไม่พ้นไม่ว่าฐานข้อมูลจะเร็วแค่ไหน
 */
var DB_BASELINE_URL = 'https://www.gstatic.com/generate_204';

/** จำนวนคำขอที่ใช้เทียบ "ยิงพร้อมกัน" กับ "ยิงเรียงกัน" */
var DB_PARALLEL_COUNT = 6;

/**
 * วัดเวลาของคำขอหนึ่งแบบ — สำหรับเครื่องมือวัดของผู้ดูแลเท่านั้น
 *
 * ต่างจาก db_fetch_ สามข้อโดยตั้งใจ
 *   1. ไม่ลองใหม่ เพราะการลองใหม่จะทำให้ตัวเลขที่วัดได้ไม่ใช่เวลาของคำขอเดียว
 *   2. ไม่เขียน System_Log เพราะความล้มเหลวตรงนี้คือ "ข้อมูลที่วัดได้" ไม่ใช่เหตุการณ์
 *   3. คืนสถานะกลับไปให้ผู้เรียกตัดสินเอง ไม่โยนข้อผิดพลาด
 *
 * @param {string} kind ชนิดของการวัด
 * @param {string} [arg] ค่าประกอบ เช่นรหัสลูกค้าที่มีอยู่จริง
 * @return {Object} {ms, status, headers, calls, note}
 */
async function db_probeTiming_(kind, arg) {
  var key = dbServiceKey_();
  var headers = { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' };
  var base = dbBaseUrl_() + '/rest/v1';
  var small = base + '/' + dbColumnMap_('Counter').table + '?select=*&limit=1';

  if (kind === 'BASELINE') {
    return await dbTimeOne_(DB_BASELINE_URL, {});
  }
  if (kind === 'ROOT') {
    return await dbTimeOne_(base + '/', headers);
  }
  if (kind === 'SMALL') {
    return await dbTimeOne_(small, headers);
  }
  if (kind === 'INDEXED') {
    var customer = dbColumnMap_('Customer');
    return await dbTimeOne_(base + '/' + customer.table + '?' +
      customer.toDb['รหัสลูกค้า'] + '=eq.' + encodeURIComponent(arg) + '&select=*&limit=1', headers);
  }

  if (kind === 'PARALLEL' || kind === 'SERIAL') {
    var requests = [];
    for (var i = 0; i < DB_PARALLEL_COUNT; i++) {
      requests.push({ url: small, method: 'get', headers: headers });
    }

    var startedAt = new Date().getTime();
    var status = 0;
    try {
      if (kind === 'PARALLEL') {
        var all = httpSendAll_(requests);
        status = all.length ? all[0].status : 0;
      } else {
        for (var s = 0; s < requests.length; s++) {
          status = (await httpSend_(requests[s])).status;
        }
      }
    } catch (e) {
      return { ms: new Date().getTime() - startedAt, status: 0, headers: {},
        calls: DB_PARALLEL_COUNT, note: dbScrub_(e && e.message) };
    }
    return { ms: new Date().getTime() - startedAt, status: status, headers: {},
      calls: DB_PARALLEL_COUNT, note: '' };
  }

  return { ms: 0, status: 0, headers: {}, calls: 0, note: 'ไม่รู้จักชนิดการวัด ' + kind };
}

/**
 * ยิงหนึ่งครั้งแล้วจับเวลา
 * @param {string} url ที่อยู่ปลายทาง
 * @param {Object} headers หัวของคำขอ
 * @return {Object} {ms, status, headers, calls, note}
 */
async function dbTimeOne_(url, headers) {
  var startedAt = new Date().getTime();
  try {
    var result = await httpSend_({ method: 'get', url: url, headers: headers });
    return { ms: new Date().getTime() - startedAt, status: result.status,
      headers: result.headers, calls: 1, note: '' };
  } catch (e) {
    return { ms: new Date().getTime() - startedAt, status: 0, headers: {}, calls: 1,
      note: dbScrub_(e && e.message) };
  }
}

/**
 * ลองอ่านทุกตารางด้วยคีย์ anon ในรอบเดียว
 *
 * สิ่งที่ต้องพิสูจน์คือ **คีย์ฝั่งหน้าเว็บอ่านข้อมูลไม่ได้** ไม่ใช่ว่าชั้นไหนเป็นตัวกัน
 * ตอนนี้ปิดไว้สองชั้นคือถอน GRANT แล้ว และเปิด RLS โดยไม่มี policy · ชั้นไหนทำงานก่อน
 * ไม่สำคัญต่อผลลัพธ์ที่ต้องการ ตราบใดที่ผลคือ "อ่านไม่ได้" ทุกตาราง
 *
 * อ่านไม่ได้นับรวมทั้ง 401 · 403 · และ 200 ที่คืน 0 แถว — สามอาการนี้ปลอดภัยเท่ากัน
 * ส่วนการอ่านได้แม้แถวเดียวคือประตูเปิด ไม่ว่าจะเปิดด้วยเหตุผลอะไร
 *
 * @param {string[]} tableKeys ชื่อตารางในระบบ
 * @return {Object[]} [{tableKey, table, status, code, rows, readable, note}]
 */
function db_probeAnonAll_(tableKeys) {
  var key = dbAnonKey_();
  var base = dbBaseUrl_() + '/rest/v1/';
  var out = [];

  if (!key) {
    for (var n = 0; n < tableKeys.length; n++) {
      out.push({ tableKey: tableKeys[n], table: dbColumnMap_(tableKeys[n]).table,
        status: 0, code: '', rows: -1, readable: false,
        note: 'ยังไม่ได้ตั้งค่า SUPABASE_ANON_KEY จึงทดสอบไม่ได้' });
    }
    return out;
  }

  var requests = [];
  for (var i = 0; i < tableKeys.length; i++) {
    requests.push({
      url: base + dbColumnMap_(tableKeys[i]).table + '?select=*&limit=5',
      method: 'get',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' }
    });
  }

  var responses = [];
  try {
    responses = httpSendAll_(requests);
  } catch (e) {
    for (var f = 0; f < tableKeys.length; f++) {
      out.push({ tableKey: tableKeys[f], table: dbColumnMap_(tableKeys[f]).table,
        status: 0, code: '', rows: -1, readable: false, note: dbScrub_(e && e.message) });
    }
    return out;
  }

  for (var r = 0; r < responses.length; r++) {
    var status = responses[r].status;
    var body = null;
    try { body = JSON.parse(responses[r].body); } catch (e2) { body = null; }

    var rows = (body instanceof Array) ? body.length : 0;
    out.push({
      tableKey: tableKeys[r],
      table: dbColumnMap_(tableKeys[r]).table,
      status: status,
      code: (body && !(body instanceof Array) && body.code) ? String(body.code) : '',
      rows: rows,
      readable: (status >= 200 && status < 300) && rows > 0,
      note: ''
    });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * สะพานเข้ากับชั้น Repo — ทำให้ตารางที่ย้ายแล้วหน้าตาเหมือนแท็บในชีตทุกประการ
 * --------------------------------------------------------------------------- */

/**
 * อ่านทั้งตารางจาก Supabase แล้วคืนในรูป "ภาพของแท็บ" แบบเดียวกับที่อ่านจากชีต
 *
 * คืนเป็น {header, values} ที่ values[0] คือแถวหัวคอลัมน์ เพราะนั่นคือรูปที่
 * readSnapshot_ กับแคชทั้งสองชั้นใช้กันอยู่แล้ว · การคืนรูปเดิมทำให้ readAll_,
 * findBy_, แคชระดับการรัน และแคชข้ามการรัน ทำงานต่อได้โดยไม่ต้องรู้ว่าข้อมูลย้ายไปไหน
 *
 * ค่า null จากฐานข้อมูลถูกแปลงเป็นข้อความว่าง เพื่อให้เหมือนช่องว่างในชีต
 * ซึ่งเป็นสิ่งที่ isTruthyCell_ กับ cellToBoolean_ ตีความไว้แล้ว (กฎข้อ 25)
 *
 * @param {string} tableKey ชื่อตารางในระบบ ซึ่งเป็นชื่อเดียวกับชื่อแท็บ
 * @return {Object} {header, values}
 */
async function dbSnapshot_(tableKey) {
  return dbValuesOf_(tableKey, await db_selectAll_(tableKey, {}));
}

/**
 * อ่านหลายตารางพร้อมกันในรอบเดียว แล้วคืนเป็นภาพของแท็บทั้งชุด
 *
 * หน้าหนึ่งหน้าที่ต้องใช้ตารางแม่แบบหลายตาราง เคยต้องรอทีละตารางเรียงกัน —
 * สี่ตารางคือสี่รอบไปกลับ ทั้งที่ไม่มีตารางไหนต้องรอผลของตารางก่อนหน้าเลย
 * `httpSendAll_` มีอยู่เพื่อกรณีนี้โดยเฉพาะ และนี่คือจุดที่มันคุ้มที่สุดในระบบ
 *
 * ตารางที่คืนมาเต็มหน้าพอดีจะถูกไล่อ่านต่อทีละหน้า เพราะ "เต็มพอดี" แปลว่า
 * ข้างหลังอาจยังมีอีก · ถ้าไม่มีด่านนี้ การอ่านขนานจะกลายเป็นช่องทางใหม่
 * ที่ทำให้ข้อมูลขาดหายเงียบ ๆ แบบเดียวกับที่เคยเกิดกับตารางลูกค้ามาแล้ว
 *
 * @param {string[]} tableKeys ชื่อตารางในระบบ
 * @return {Object} แผนที่จากชื่อตารางไปยัง {header, values}
 */
async function dbSnapshots_(tableKeys) {
  var requests = [];
  for (var i = 0; i < tableKeys.length; i++) {
    requests.push({
      tableKey: tableKeys[i],
      // เรียงด้วยคอลัมน์คีย์เสมอ ให้ได้ลำดับเดียวกับ db_selectAll_ ทุกประการ
      order: dbColumnMap_(tableKeys[i]).systemNames[0],
      limit: DB_PAGE_ROWS
    });
  }

  var results = await db_fetchAll_(requests);
  var out = {};
  for (var r = 0; r < results.length; r++) {
    var rows = results[r];
    if (rows.length >= DB_PAGE_ROWS) rows = await db_selectAll_(tableKeys[r], {});
    out[tableKeys[r]] = dbValuesOf_(tableKeys[r], rows);
  }
  return out;
}

/**
 * จัดแถวที่อ่านมาแล้วให้อยู่ในรูป "ภาพของแท็บ"
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object[]} rows แถวที่อ่านมา
 * @return {Object} {header, values}
 */
function dbValuesOf_(tableKey, rows) {
  var header = dbColumnMap_(tableKey).systemNames.slice();
  var values = [header.slice()];

  for (var r = 0; r < rows.length; r++) {
    var line = [];
    for (var c = 0; c < header.length; c++) {
      var value = rows[r][header[c]];
      line.push((value === null || value === undefined) ? '' : value);
    }
    values.push(line);
  }
  return { header: header, values: values };
}

/**
 * เพิ่มแถวลงตารางที่ย้ายแล้ว
 *
 * ไม่เติม Created_Date / Created_By ให้เหมือนฝั่งชีต เพราะหกตารางของชุด A
 * ไม่มีคอลัมน์เหล่านั้น · ถ้าวันหนึ่งย้ายตารางที่มี ให้ฐานข้อมูลเติมเองผ่าน DEFAULT
 * ซึ่งเชื่อถือได้กว่าการให้โค้ดจำว่าต้องเติม (เหตุผลเดียวกับกฎข้อ 25)
 *
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {Object[]} objs แถวที่จะเพิ่ม คีย์เป็นชื่อเดิมของระบบ
 * @return {Object[]} แถวที่บันทึกจริง พร้อมค่าที่ฐานข้อมูลเติมให้
 */
async function dbAppendRows_(tableKey, objs) {
  var written = await db_insert_(tableKey, objs);
  dbInvalidate_(tableKey);
  return written;
}

/**
 * แก้ไขแถวเดียวในตารางที่ย้ายแล้ว
 * @param {string} tableKey ชื่อตารางในระบบ
 * @param {string} keyField คอลัมน์ที่ใช้ค้น
 * @param {*} keyValue ค่าที่ค้น
 * @param {Object} patchObj คอลัมน์ที่จะเปลี่ยน
 * @return {Object} แถวหลังแก้
 * @throws {Error} เมื่อไม่พบแถวนั้น
 */
async function dbUpdateRow_(tableKey, keyField, keyValue, patchObj) {
  var filters = {};
  filters[keyField] = keyValue;

  var rows = await db_update_(tableKey, filters, patchObj);
  dbInvalidate_(tableKey);

  if (!rows.length) {
    throw new Error('ไม่พบข้อมูล ' + keyField + ' = ' + keyValue + ' ในแท็บ "' + tableKey + '"');
  }
  return rows[0];
}

/**
 * ทิ้งแคชของตารางที่เพิ่งเขียน — ทั้งระดับการรันและข้ามการรัน
 *
 * ต้องทิ้งทั้งสองชั้น ไม่ใช่ปะภาพในมือ ด้วยเหตุผลเดียวกับ patchRowCache_ ของฝั่งชีต
 * คือคนอื่นอาจเขียนตารางเดียวกันอยู่คนละการรัน ภาพที่ปะจากมุมมองของเราจึงไม่ใช่ความจริง
 *
 * @param {string} tableKey ชื่อตารางในระบบ ซึ่งเป็นชื่อเดียวกับชื่อแท็บ
 */
function dbInvalidate_(tableKey) {
  // clearRowCache_ เรียก clearMasterCache_ ให้เองอยู่แล้ว จึงเรียกซ้ำไม่ได้ประโยชน์
  clearRowCache_(tableKey);
}

/* ---------------------------------------------------------------------------
 * ตัวนับคำขอต่อการรัน — กับดักสำหรับการเผลอเรียก repo ในวนลูป (SPEC 22.5)
 * --------------------------------------------------------------------------- */

/**
 * จำนวนคำขอที่ยิงออกไปหาฐานข้อมูลในการรันครั้งนี้
 *
 * นับรวมการลองใหม่ด้วย เพราะสิ่งที่ต้องการรู้คือ "จ่ายไปกี่รอบจริง ๆ" ไม่ใช่
 * "ตั้งใจจะยิงกี่ครั้ง" · เริ่มนับใหม่ทุกครั้งที่สคริปต์เริ่มทำงาน
 */
var DB_CALL_COUNT_ = 0;

/**
 * อ่านจำนวนคำขอที่ยิงไปแล้วในการรันนี้
 *
 * มีไว้ให้ชุดทดสอบตั้งเพดานได้ · SPEC 22.5 เตือนไว้แล้วว่าห้ามย้ายแล้วยังอ่าน
 * ทีละแถวในวนลูป แต่กับดักที่ไม่มีเทสต์คอยจับคือกับดักที่จะโดนแน่นอน
 * ตัวเลขนี้คือสิ่งเดียวที่ทำให้การเผลอเรียก repo ในลูปถูกเห็นตั้งแต่วันที่เขียน
 *
 * @return {number}
 */
function dbCallCount() {
  return DB_CALL_COUNT_;
}

/**
 * เริ่มนับใหม่ — ใช้ในชุดทดสอบก่อนวัดแต่ละครั้ง
 * @return {number} ค่าก่อนรีเซ็ต
 */
function dbCallReset_() {
  var before = DB_CALL_COUNT_;
  DB_CALL_COUNT_ = 0;
  DB_ROUND_COUNT_ = 0;
  return before;
}

/**
 * จำนวน "รอบ" ที่ต้องรอฐานข้อมูลตอบในการรันครั้งนี้
 *
 * ต่างจาก DB_CALL_COUNT_ ตรงที่การยิงขนานสิบคำขอด้วย httpSendAll_ นับเป็นหนึ่งรอบ
 * ไม่ใช่สิบ · เวลาที่ผู้ใช้รอจริงขึ้นกับจำนวนรอบ ไม่ใช่จำนวนคำขอ เพราะคำขอที่ยิง
 * พร้อมกันเดินทางไปกลับพร้อมกัน · ถ้าไม่มีตัวเลขนี้ การเปลี่ยนมาใช้ httpSendAll_
 * จะพิสูจน์ไม่ได้เลย เพราะจำนวนคำขอเท่าเดิมทุกประการ
 */
var DB_ROUND_COUNT_ = 0;

/**
 * อ่านจำนวนรอบที่รอฐานข้อมูลตอบในการรันนี้
 * @return {number}
 */
function dbRoundCount() {
  return DB_ROUND_COUNT_;
}
