/**
 * 01_Repo_Session.gs — อ่าน/เขียนแท็บ Session_Token เท่านั้น
 *
 * เป็น wrapper บาง ๆ ของ 01_Repo_Sheet.gs — ห้ามมีตรรกะธุรกิจ
 * การออกโทเคน การเข้ารหัส และการตัดสินว่าโทเคนใช้ได้หรือไม่ เป็นหน้าที่ของ 07_Auth.gs
 *
 * แท็บนี้ไม่มีใน SPEC หัวข้อ 13 เพราะตอนเขียน SPEC ระบบยังระบุตัวตนด้วยบัญชี Google
 * ซึ่งไม่ต้องจำว่าใครล็อกอินอยู่ · Apps Script ไม่มี session ให้ใช้ จึงต้องทำเอง
 *
 *   Token_Hash (PK)   ค่าที่เข้ารหัสแล้วของโทเคน — ตัวโทเคนจริงไม่เคยถูกเก็บลงชีต
 *   Email             เจ้าของโทเคน (คีย์หลักของ User_Role)
 *   Issued_Date       ออกเมื่อไร
 *   Expires_Date      หมดอายุเมื่อไร (ต่ออายุทุกครั้งที่มีการใช้งาน)
 *   Last_Used_Date    ใช้ล่าสุดเมื่อไร
 *   Active            false เมื่อออกจากระบบ หรือถูกผู้ดูแลบังคับให้ออก
 */

/**
 * อ่านโทเคนตามค่าที่เข้ารหัสแล้ว
 * @param {string} tokenHash ค่าที่เข้ารหัสแล้วของโทเคน
 * @return {Object|null}
 */
async function getSessionToken(tokenHash) {
  return await findOne_(SHEET.SESSION_TOKEN, 'Token_Hash', tokenHash);
}

/**
 * โทเคนทั้งหมด รวมที่ปิดใช้งานและหมดอายุแล้ว
 * @return {Object[]}
 */
async function listSessionTokens() {
  return await readAll_(SHEET.SESSION_TOKEN);
}

/**
 * บันทึกโทเคนใหม่
 * @param {Object} row ข้อมูลโทเคน
 * @return {Object}
 */
async function insertSessionToken(row) {
  return await appendRow_(SHEET.SESSION_TOKEN, row);
}

/**
 * แก้ไขโทเคน เช่นต่ออายุหรือปิดใช้งาน
 * @param {string} tokenHash ค่าที่เข้ารหัสแล้วของโทเคน
 * @param {Object} patch เฉพาะคอลัมน์ที่ต้องการเปลี่ยน
 * @return {Object}
 */
async function updateSessionToken(tokenHash, patch) {
  return await updateRow_(SHEET.SESSION_TOKEN, 'Token_Hash', tokenHash, patch);
}

/**
 * โทเคนทั้งหมดของผู้ใช้คนหนึ่ง
 *
 * ค้นด้วย ilike แบบไม่มีสัญลักษณ์ใด ๆ ซึ่งคือ "เท่ากันพอดีแบบไม่สนตัวพิมพ์"
 * เพราะอีเมลในตารางอาจถูกบันทึกมาคนละตัวพิมพ์กับที่ผู้เรียกส่งมา และโค้ดเดิม
 * เทียบแบบ toLowerCase() ทั้งสองฝั่งอยู่แล้ว · การใช้ eq เฉย ๆ จะเปลี่ยนพฤติกรรม
 * ไปเงียบ ๆ ในกรณีที่ตัวพิมพ์ไม่ตรง ซึ่งเป็นกรณีที่หาสาเหตุยากที่สุด
 *
 * @param {string} email อีเมลเจ้าของโทเคน
 * @return {Object[]}
 */
async function listSessionTokensOf_(email) {
  var wanted = String(email || '').trim();
  if (!wanted) return [];

  return await queryRows_(SHEET.SESSION_TOKEN,
    { 'Email': { op: 'ilike', value: dbLikeLiteral_(wanted) } },
    { order: 'Token_Hash' });
}

/**
 * ลบโทเคนที่ตายแล้วทิ้ง โดยไม่ต้องอ่านตารางมาก่อน
 *
 * บนฐานข้อมูลการลบแบบมีเงื่อนไขเป็นคำขอเดียว จึงไม่ต้องลากทั้งตารางมาหาว่า
 * แถวไหนตาย แล้วค่อยสั่งลบทีละแถว · ตารางนี้โตตามจำนวนครั้งที่ทุกคนล็อกอิน
 * ผู้ใช้ยี่สิบคนสะสมเป็นหลักหมื่นแถวได้ในปีเดียว (กฎข้อ 28)
 *
 * แยกเป็นสองคำขอเพราะ "หมดอายุแล้ว" กับ "ถูกปิดใช้งาน" เป็นคนละคอลัมน์
 * และตัวกรองของ PostgREST รวมสองเงื่อนไขแบบ "หรือ" ในคำขอเดียวไม่ได้ในรูปแบบที่เราใช้อยู่
 *
 * @param {Date} now เวลาปัจจุบัน
 * @return {number} จำนวนแถวที่ลบ
 */
async function deleteDeadSessionTokens_(now) {
  var removed = (await db_delete_(SHEET.SESSION_TOKEN,
    { 'Expires_Date': { op: 'lte', value: now } })).length;
  removed += (await db_delete_(SHEET.SESSION_TOKEN, { 'Active': false })).length;
  dbInvalidate_(SHEET.SESSION_TOKEN);
  return removed;
}

/**
 * ลบแถวโทเคนที่ไม่ได้ใช้แล้วออกจากชีต
 *
 * นี่คือข้อยกเว้นเดียวของกฎข้อ 8 (ห้ามลบแถวใน Sheet) และยกเว้นได้เพราะ
 * ไม่มีที่ใดในระบบอ้างถึงเลขแถวของแท็บนี้ — โทเคนถูกค้นด้วยค่าของตัวมันเอง
 * ไม่ใช่ด้วยตำแหน่งแถว การเลื่อนแถวจึงไม่ทำให้อะไรเสีย
 *
 * เหตุผลที่ต้องลบจริง ไม่ใช่แค่ตั้ง Active = false: แท็บนี้ถูกอ่านทั้งตาราง
 * ทุกครั้งที่ผู้ใช้กดปุ่มอะไรก็ตาม ถ้าปล่อยให้โตขึ้นเรื่อย ๆ ทุกการกดจะช้าลงตามไปด้วย
 * ที่ผู้ใช้ 20 คน ปีหนึ่งจะสะสมเป็นหลักหมื่นแถวโดยไม่มีประโยชน์อะไรเลย
 *
 * @param {number[]} rowNumbers เลขแถวจริงในชีต
 * @return {number} จำนวนแถวที่ลบ
 */
function deleteSessionTokenRows_(rowNumbers) {
  if (!rowNumbers || !rowNumbers.length) return 0;

  var sorted = rowNumbers.slice().sort(function (a, b) { return a - b; });
  var sheet = getSheet_(SHEET.SESSION_TOKEN);
  var removed = 0;

  // ลบจากล่างขึ้นบน และจับแถวที่ติดกันเป็นช่วงเดียว เพื่อไม่ให้เลขแถวที่เหลือเลื่อนก่อนถึงคิว
  var end = sorted.length - 1;
  while (end >= 0) {
    var start = end;
    while (start > 0 && sorted[start - 1] === sorted[start] - 1) start--;
    var count = end - start + 1;
    sheet.deleteRows(sorted[start], count);
    removed += count;
    end = start - 1;
  }

  clearRowCache_(SHEET.SESSION_TOKEN);
  clearHeaderCache_(SHEET.SESSION_TOKEN);
  return removed;
}
