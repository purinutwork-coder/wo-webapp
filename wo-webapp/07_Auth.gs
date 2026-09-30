/**
 * 07_Auth.gs — เข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านของระบบเอง (CLAUDE.md กฎข้อ 16)
 *
 * ทำไมไม่ใช้บัญชี Google: การพึ่ง Google ระบุตัวตนบังคับให้ต้องแยกเป็น 2 โปรเจกต์
 * (ตัวหน้าที่อ่านอีเมลได้ กับตัวหลังที่ถือชีต) ทุกการกดปุ่มจึงวิ่งข้ามโปรเจกต์
 * ช้าขึ้น 1-2 วินาที และหลุดเป็นครั้งคราวเวลา UrlFetch หมดเวลารอ
 *
 * ไฟล์นี้เป็นที่เดียวที่รู้เรื่องรหัสผ่านและโทเคน ชั้นบนรู้แค่ว่า "ใครเป็นคนเรียก"
 * ผ่าน getCurrentUser_() เหมือนเดิมทุกอย่าง ระบบสิทธิ์ที่มีอยู่จึงไม่ต้องแก้แม้แต่บรรทัดเดียว
 *
 * สิ่งที่ห้ามพลาดในไฟล์นี้
 *   - ห้ามเก็บหรือ log รหัสผ่านเป็นข้อความธรรมดาที่ใดทั้งสิ้น
 *   - ห้ามเก็บโทเคนตัวจริงลงชีต เก็บเฉพาะค่าที่เข้ารหัสแล้ว
 *   - ข้อความตอนล็อกอินไม่ผ่าน ต้องเหมือนกันทุกกรณี
 */

/* ---------------------------------------------------------------------------
 * รหัสผ่าน
 * --------------------------------------------------------------------------- */

/**
 * เกลือสุ่มประจำตัวผู้ใช้หนึ่งคน
 *
 * ต้องสุ่มใหม่ทุกครั้งที่ตั้งรหัส และต้องไม่ซ้ำกันระหว่างคน เพราะถ้าใช้เกลือร่วมกัน
 * คนที่ได้ชีตไปจะคำนวณตารางเดารหัสชุดเดียวแล้วใช้ถอดได้ทุกคนพร้อมกัน
 *
 * @return {string} ข้อความฐานสิบหก
 */
function newPasswordSalt_() {
  // getUuid() ใช้ตัวสุ่มเชิงรหัสลับของแพลตฟอร์ม ต่อสองตัวได้ความยาวพอสำหรับเกลือ
  return (newUuid_() + newUuid_()).replace(/-/g, '');
}

/**
 * แปลงรหัสผ่านเป็นค่าที่เก็บลงชีตได้ ด้วยการวน SHA-256 หลายพันรอบ
 *
 * วนรอบเดียวไม่พอ เพราะการ์ดจอสมัยใหม่คำนวณ SHA-256 ได้พันล้านครั้งต่อวินาที
 * การวน N รอบทำให้การเดาแต่ละครั้งแพงขึ้น N เท่า (ดูเหตุผลของเลข N ใน 00_Config.gs)
 *
 * @param {string} password รหัสผ่านที่ผู้ใช้พิมพ์
 * @param {string} salt เกลือประจำตัว
 * @param {number} iterations จำนวนรอบ
 * @return {string} ข้อความฐานสิบหก
 */
function hashPassword_(password, salt, iterations) {
  var value = String(salt) + ':' + String(password);
  for (var i = 0; i < iterations; i++) {
    value = bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value));
  }
  return value;
}

/**
 * แปลงผลจาก computeDigest เป็นข้อความฐานสิบหก
 * @param {number[]} bytes ไบต์ที่มีค่า -128 ถึง 127
 * @return {string}
 */
function bytesToHex_(bytes) {
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

/**
 * ค่าที่เก็บลงคอลัมน์ Password_Hash
 *
 * เก็บจำนวนรอบไว้ในค่าด้วย เพื่อให้เพิ่มจำนวนรอบในอนาคตได้โดยรหัสผ่านเดิมยังใช้ได้
 * ถ้าไม่เก็บ วันที่เปลี่ยนเลขจะต้องบังคับให้ทุกคนตั้งรหัสใหม่พร้อมกัน
 *
 * @param {number} iterations จำนวนรอบที่ใช้จริง
 * @param {string} hash ค่าที่ได้จาก hashPassword_
 * @return {string} รูปแบบ sha256$<รอบ>$<ค่า>
 */
function encodePasswordHash_(iterations, hash) {
  return 'sha256$' + iterations + '$' + hash;
}

/**
 * ตรวจว่ารหัสผ่านที่พิมพ์มาตรงกับค่าที่เก็บไว้หรือไม่
 * @param {string} password รหัสผ่านที่ผู้ใช้พิมพ์
 * @param {string} salt เกลือประจำตัว
 * @param {string} stored ค่าในคอลัมน์ Password_Hash
 * @return {boolean}
 */
function passwordMatches_(password, salt, stored) {
  var parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'sha256') return false;

  var iterations = Number(parts[1]);
  if (!iterations || iterations < 1) return false;

  return hashPassword_(password, salt, iterations) === parts[2];
}

/**
 * ตรวจความแข็งแรงของรหัสผ่านฝั่งเซิร์ฟเวอร์
 *
 * หน้าเว็บตรวจให้แล้วก็จริง แต่หน้าเว็บที่ถูกดัดแปลงข้ามการตรวจได้ทั้งชุด
 * ด่านที่นับจริงจึงต้องอยู่ฝั่งนี้เสมอ
 *
 * @param {string} password รหัสผ่านใหม่
 * @throws {Error} เมื่อสั้นเกินไปหรือว่างเปล่า
 */
function assertPasswordStrength_(password) {
  var text = String(password === null || password === undefined ? '' : password);
  if (text.length < PASSWORD_MIN_LENGTH) {
    throw new Error('รหัสผ่านต้องยาวอย่างน้อย ' + PASSWORD_MIN_LENGTH + ' ตัวอักษร');
  }
}

/* ---------------------------------------------------------------------------
 * โทเคน
 * --------------------------------------------------------------------------- */

/**
 * โทเคนสุ่มยาว — ค่านี้คือสิ่งเดียวที่เบราว์เซอร์เก็บไว้ และไม่เคยถูกบันทึกลงชีต
 * @return {string}
 */
function newSessionToken_() {
  return (newUuid_() + newUuid_() + newUuid_()).replace(/-/g, '');
}

/**
 * ค่าที่เข้ารหัสแล้วของโทเคน — ใช้เป็นคีย์ในชีต
 *
 * เก็บเฉพาะค่านี้ ไม่เก็บตัวโทเคน เพราะถ้าใครเปิดชีตได้ (เช่นเจ้าของเผลอแชร์)
 * จะสวมสิทธิ์เป็นทุกคนที่กำลังล็อกอินอยู่ได้ทันทีโดยไม่ต้องรู้รหัสผ่านเลย
 *
 * ไม่ต้องวนหลายรอบเหมือนรหัสผ่าน เพราะโทเคนสุ่มยาวพอที่จะเดาไม่ได้อยู่แล้ว
 * และการวนหลายรอบจะทำให้ "ทุกคำขอ" ช้าลง ไม่ใช่แค่ตอนล็อกอิน
 *
 * @param {string} token โทเคนตัวจริง
 * @return {string}
 */
function hashSessionToken_(token) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token)));
}

/**
 * ตรวจโทเคนแล้วคืนอีเมลเจ้าของ พร้อมต่ออายุให้
 *
 * ต่ออายุทุกครั้งที่ใช้งาน เพื่อให้คนที่ทำงานต่อเนื่องไม่ถูกเตะออกกลางคัน
 * แต่คนที่ทิ้งหน้าจอไว้เกิน 12 ชั่วโมงต้องล็อกอินใหม่
 *
 * @param {string} token โทเคนจากเบราว์เซอร์
 * @return {string} อีเมลเจ้าของ · ค่าว่างเมื่อใช้ไม่ได้
 */
function emailOfToken_(token) {
  if (!token) return '';

  var row = getSessionToken(hashSessionToken_(token));
  if (!row) return '';
  if (!isTruthyCell_(row['Active'])) return '';

  var expires = toDate_(row['Expires_Date']);
  var now = new Date();
  if (!expires || expires.getTime() <= now.getTime()) return '';

  /*
   * ต่ออายุแบบประหยัด — เขียนกลับเฉพาะเมื่อเหลือเวลาไม่ถึงครึ่ง
   * ถ้าเขียนทุกคำขอ จะเพิ่มการคุยกับชีต 1 ครั้งให้ทุกการกดปุ่มของทุกคน
   */
  var ttlMs = TOKEN_TTL_HOURS * 3600 * 1000;
  if (expires.getTime() - now.getTime() < ttlMs / 2) {
    updateSessionToken(row['Token_Hash'], {
      'Expires_Date':   new Date(now.getTime() + ttlMs),
      'Last_Used_Date': now
    });
  }

  return String(row['Email'] || '');
}

/**
 * ลบโทเคนที่หมดอายุหรือถูกปิดใช้งานแล้วออกจากชีต
 *
 * เรียกตอนล็อกอินเท่านั้น ไม่ใช่ทุกคำขอ เพราะการลบแถวเป็นการเขียน
 * ถ้าทำทุกคำขอ ทุกการกดปุ่มจะแพงขึ้นเพื่อแลกกับสิ่งที่ทำวันละครั้งก็พอ
 *
 * @return {number} จำนวนแถวที่ลบ
 */
function pruneSessionTokens_() {
  /*
   * บนฐานข้อมูลสั่งลบได้เลย ไม่ต้องอ่านมาดูก่อนว่าแถวไหนตาย
   * เพดานสะสมก่อนค่อยลบมีไว้เพราะการอ่านทั้งแท็บแพง ซึ่งไม่เกี่ยวกันกับการลบแบบมีเงื่อนไขอีกต่อไป
   */
  if (isDbSheet_(SHEET.SESSION_TOKEN)) return deleteDeadSessionTokens_(new Date());

  var rows = listSessionTokens();
  var now = new Date().getTime();
  var stale = [];

  for (var i = 0; i < rows.length; i++) {
    var expires = toDate_(rows[i]['Expires_Date']);
    var dead = !isTruthyCell_(rows[i]['Active']) || !expires || expires.getTime() <= now;
    if (dead) stale.push(rows[i][ROW_FIELD]);
  }

  /*
   * รอให้สะสมถึงจำนวนหนึ่งก่อนค่อยลบ ไม่ใช่ลบทุกครั้งที่มีแถวตาย
   * เหตุผลคือการลบเป็นการเขียน ซึ่งแพงพอ ๆ กับการอ่าน และไม่มีใครเดือดร้อน
   * กับแถวตายไม่กี่แถว · ที่ต้องกันคือการปล่อยให้โตเป็นหลักหมื่นเท่านั้น
   */
  if (stale.length < TOKEN_PRUNE_THRESHOLD) return 0;
  return deleteSessionTokenRows_(stale);
}

/* ---------------------------------------------------------------------------
 * เข้าสู่ระบบ / ออกจากระบบ
 * --------------------------------------------------------------------------- */

/**
 * อ่านผู้ใช้จากชื่อผู้ใช้ — ไม่สนตัวพิมพ์เล็กใหญ่ และตัดช่องว่างหน้าหลัง
 * @param {string} username ชื่อผู้ใช้
 * @return {Object|null} แถวใน User_Role
 */
function userByUsername_(username) {
  var wanted = String(username || '').trim().toLowerCase();
  if (!wanted) return null;

  var rows = listUserRoles(false);   // รวมแถวที่ปิดใช้งาน เพื่อให้ตอบข้อความเดียวกันทุกกรณี
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Username'] || '').trim().toLowerCase() === wanted) return rows[i];
  }
  return null;
}

/**
 * บัญชีนี้ถูกล็อกอยู่หรือไม่ และเหลืออีกกี่นาที
 * @param {Object} row แถวใน User_Role
 * @return {number} นาทีที่เหลือ · 0 = ไม่ถูกล็อก
 */
function lockMinutesLeft_(row) {
  var until = toDate_(row['Locked_Until']);
  if (!until) return 0;
  var left = until.getTime() - new Date().getTime();
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

/**
 * เข้าสู่ระบบ
 *
 * ข้อความที่ตอบกลับตอนไม่ผ่าน ต้องเหมือนกันทุกกรณี ไม่ว่าจะไม่มีชื่อผู้ใช้นั้น
 * รหัสผิด บัญชีถูกปิด หรือยังไม่เคยตั้งรหัส — เพราะการแยกข้อความเท่ากับบอกคนนอก
 * ว่าชื่อผู้ใช้ไหนมีอยู่จริง ซึ่งเป็นครึ่งหนึ่งของงานเดารหัสไปแล้ว
 * ข้อยกเว้นเดียวคือ "ถูกล็อกชั่วคราว" ซึ่งบอกได้ เพราะกว่าจะเห็นข้อความนั้น
 * ต้องเดารหัสผิดมาแล้ว 5 ครั้ง คือรู้อยู่แล้วว่าชื่อผู้ใช้นั้นมีจริง
 *
 * @param {string} username ชื่อผู้ใช้
 * @param {string} password รหัสผ่าน
 * @return {Object} {token, user, mustChangePassword}
 * @throws {Error} เมื่อเข้าไม่ได้
 */
function login(username, password) {
  var row = userByUsername_(username);

  /*
   * ไม่พบชื่อผู้ใช้ — ยังต้องเสียเวลาเท่ากับกรณีที่พบ
   * ไม่งั้นคนยิงสุ่มจะจับได้จากเวลาที่ตอบกลับว่าชื่อไหนมีอยู่จริง
   */
  if (!row) {
    hashPassword_(String(password || ''), 'no-such-user', PASSWORD_ITERATIONS);
    writeLoginAudit_('', username, 'ไม่พบชื่อผู้ใช้');
    throw new Error(LOGIN_FAILED_MESSAGE);
  }

  var email = String(row['Email'] || '');

  var locked = lockMinutesLeft_(row);
  if (locked) {
    writeLoginAudit_(email, username, 'บัญชีถูกล็อกอยู่');
    throw new Error(LOGIN_LOCKED_MESSAGE + locked + ' นาที');
  }

  var ok = !!row['Password_Hash'] &&
    passwordMatches_(password, row['Password_Salt'], row['Password_Hash']);

  if (!ok || !isTruthyCell_(row['Active'])) {
    registerLoginFailure_(row);
    writeLoginAudit_(email, username, ok ? 'บัญชีถูกปิดการใช้งาน' : 'รหัสผ่านไม่ถูกต้อง');
    throw new Error(LOGIN_FAILED_MESSAGE);
  }

  /*
   * ผ่านแล้ว ล้างตัวนับและปลดล็อก — แต่เขียนกลับเฉพาะเมื่อมีอะไรให้ล้างจริง
   * การเข้าระบบปกติไม่มีอะไรค้างอยู่แล้ว ถ้าเขียนทุกครั้งจะเป็นการคุยกับชีตฟรี ๆ ทุกการล็อกอิน
   */
  if (Number(row['Failed_Count'] || 0) !== 0 || row['Locked_Until']) {
    // null ไม่ใช่ข้อความว่าง — Postgres ปฏิเสธข้อความว่างสำหรับคอลัมน์ชนิดเวลา (code 22007)
    updateUserRole_(email, { 'Failed_Count': 0, 'Locked_Until': null });
  }

  pruneSessionTokens_();   // เก็บกวาดโทเคนเก่า ทำตอนนี้ตอนเดียว ไม่ทำทุกคำขอ

  var token = newSessionToken_();
  var now = new Date();
  insertSessionToken({
    'Token_Hash':     hashSessionToken_(token),
    'Email':          email,
    'Issued_Date':    now,
    'Expires_Date':   new Date(now.getTime() + TOKEN_TTL_HOURS * 3600 * 1000),
    'Last_Used_Date': now,
    'Active':         true
  });

  writeAuthAudit_(ACTION.LOGIN, email, String(row['Role'] || ''), 'เข้าสู่ระบบสำเร็จ');

  return {
    token: token,
    mustChangePassword: cellToBoolean_(row['Must_Change_Password']),
    user: userViewOfRow_(email, row)
  };
}

/**
 * บันทึกความพยายามล็อกอินที่ล้มเหลว และล็อกบัญชีเมื่อผิดครบจำนวน
 *
 * นับรวมทุกครั้งที่ผิด ไม่ได้รีเซ็ตตามเวลา — ตัวที่หมดอายุเองคือการล็อก
 * เมื่อครบเวลาล็อก ตัวนับถูกล้างพร้อมกัน ผู้ใช้จึงได้โควตาใหม่ 5 ครั้งโดยอัตโนมัติ
 *
 * @param {Object} row แถวใน User_Role
 */
function registerLoginFailure_(row) {
  var failed = Number(row['Failed_Count'] || 0) + 1;
  var patch = { 'Failed_Count': failed };

  if (failed >= LOGIN_MAX_FAILURES) {
    patch['Locked_Until'] = new Date(new Date().getTime() + LOGIN_LOCK_MINUTES * 60000);
    patch['Failed_Count'] = 0;   // เริ่มนับใหม่หลังปลดล็อก
  }
  updateUserRole_(String(row['Email'] || ''), patch);

  /*
   * นาทีที่บัญชีถูกล็อกต้องมีบรรทัดของตัวเอง แยกจากบรรทัด "รหัสผ่านไม่ถูกต้อง"
   * เพราะคำถามที่ผู้ดูแลถามคือ "มีใครถูกกันออกจากระบบไปบ้าง" ซึ่งถ้าไม่มีบรรทัดนี้
   * ต้องนั่งนับบรรทัดรหัสผิดของแต่ละคนเอาเองว่าครบห้าครั้งเมื่อไร
   */
  if (patch['Locked_Until']) {
    writeAuthAudit_(ACTION.ACCOUNT_LOCKED, String(row['Email'] || ''),
      String(row['Role'] || ''),
      'ใส่รหัสผ่านผิดครบ ' + LOGIN_MAX_FAILURES + ' ครั้ง บัญชีถูกล็อก ' +
      LOGIN_LOCK_MINUTES + ' นาที');
  }
}

/**
 * บันทึกการล็อกอินที่ล้มเหลวลง Audit_Log
 *
 * ต้องบันทึก เพราะการยิงสุ่มรหัสจะเห็นได้จากตรงนี้ที่เดียว
 * ห้ามบันทึกรหัสผ่านที่พิมพ์มาไม่ว่ากรณีใด แม้จะเป็นรหัสที่ผิด —
 * รหัสที่ผิดของคนหนึ่งมักเป็นรหัสที่ถูกของอีกระบบหนึ่ง
 *
 * @param {string} email อีเมลเจ้าของ (ว่างได้เมื่อไม่พบชื่อผู้ใช้)
 * @param {string} username ชื่อผู้ใช้ที่พิมพ์มา
 * @param {string} reason สาเหตุ สำหรับผู้ดูแลอ่านย้อนหลัง
 */
function writeLoginAudit_(email, username, reason) {
  try {
    writeAuthAudit_(ACTION.LOGIN_FAILED, email || String(username || ''), '', reason);
  } catch (e) {
    // บันทึกไม่สำเร็จต้องไม่ทำให้การตอบกลับเปลี่ยนไป ไม่งั้นจะกลายเป็นตัวบอกว่ามีใครอยู่บ้าง
  }
}

/**
 * บันทึกเหตุการณ์เกี่ยวกับบัญชีผู้ใช้ลง Audit_Log
 *
 * ต่างจากตัวเขียน Audit ปกติตรงที่ระบุ "ผู้กระทำ" เป็นตัวเจ้าของบัญชีเอง ไม่ใช่คนที่รันสคริปต์
 * เพราะเหตุการณ์เข้าสู่ระบบ ผู้กระทำคือคนที่กำลังพยายามเข้า ซึ่งยังไม่มีตัวตนในระบบด้วยซ้ำ
 * ตอนที่แถวนี้ถูกเขียน ถ้าปล่อยให้เติมอัตโนมัติ จะได้ชื่อเจ้าของสคริปต์ซึ่งผิดความจริง
 *
 * ห้ามใส่รหัสผ่านที่พิมพ์มาลงไปไม่ว่ากรณีใด แม้จะเป็นรหัสที่ผิด
 * เพราะรหัสที่ผิดของระบบหนึ่ง มักเป็นรหัสที่ถูกของอีกระบบหนึ่ง
 *
 * @param {string} action ค่าจาก ACTION
 * @param {string} subject อีเมลหรือชื่อผู้ใช้ที่เหตุการณ์นี้เกี่ยวข้อง
 * @param {string} role Role ของเจ้าของบัญชี (ค่าว่างเมื่อยังไม่รู้)
 * @param {string} remark คำอธิบายสำหรับผู้ดูแลอ่านย้อนหลัง
 */
function writeAuthAudit_(action, subject, role, remark) {
  /*
   * บันทึกไม่สำเร็จ ต้องไม่ทำให้การเข้าสู่ระบบล้มตาม
   *
   * เหตุการณ์พวกนี้ลง System_Log ซึ่งเป็นแท็บที่ผู้ดูแลต้องสร้างเองก่อนใช้งาน (SPEC 13)
   * ถ้ายังไม่ได้สร้าง แล้วปล่อยให้ข้อผิดพลาดหลุดออกไป จะกลายเป็น "ทุกคนล็อกอินไม่ได้
   * ทั้งระบบ" เพราะแท็บบันทึกหายไปแท็บเดียว ซึ่งหนักกว่าการเสียบรรทัดบันทึกไปมาก
   */
  try {
    writeAuditRecord({
      User:   String(subject || ''),
      Role:   String(role || ''),
      Action: action,
      Entity: ENTITY.USER,
      Field:  'Session',
      Remark: remark
    });
  } catch (e) {
    Logger.log('บันทึกเหตุการณ์ ' + action + ' ไม่สำเร็จ: ' + ((e && e.message) ? e.message : e));
  }
}

/**
 * ออกจากระบบ — ปิดโทเคนใบนั้นจริง ไม่ใช่แค่ลบฝั่งเบราว์เซอร์
 * @param {string} token โทเคนจากเบราว์เซอร์
 * @return {boolean} true = มีโทเคนให้ปิด
 */
function logout(token) {
  if (!token) return false;
  var row = getSessionToken(hashSessionToken_(token));
  if (!row) return false;

  updateSessionToken(row['Token_Hash'], { 'Active': false, 'Expires_Date': new Date() });
  writeAuthAudit_(ACTION.LOGOUT, String(row['Email'] || ''), '', 'ออกจากระบบ');
  return true;
}

/**
 * บังคับให้ผู้ใช้คนหนึ่งออกจากระบบทุกเครื่อง — ADMIN เท่านั้น
 *
 * ใช้ตอนเครื่องหาย ตอนสงสัยว่ารหัสรั่ว และตอนพนักงานลาออก
 * ต้องมีเสมอ เพราะถ้าไม่มี คนที่ถือโทเคนอยู่จะใช้งานต่อได้อีก 12 ชั่วโมงเต็ม
 *
 * @param {string} email อีเมลของผู้ใช้
 * @return {number} จำนวนโทเคนที่ถูกปิด
 */
function forceLogoutUser(email) {
  var wanted = String(email || '').trim().toLowerCase();
  if (!wanted) throw new Error('ยังไม่ได้ระบุว่าจะให้ใครออกจากระบบ');

  // กรองด้วยอีเมลที่ฐานข้อมูล แล้วยังเทียบซ้ำในหน่วยความจำตามเดิม ผลจึงตรงกันทุกกรณี
  var rows = listSessionTokensOf_(wanted);
  var closed = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i]['Email'] || '').trim().toLowerCase() !== wanted) continue;
    if (!isTruthyCell_(rows[i]['Active'])) continue;
    updateSessionToken(rows[i]['Token_Hash'], { 'Active': false, 'Expires_Date': new Date() });
    closed++;
  }

  writeAuthAudit_(ACTION.FORCE_LOGOUT, wanted, '', 'ปิดโทเคน ' + closed + ' ใบ');
  return closed;
}

/* ---------------------------------------------------------------------------
 * ตั้งและเปลี่ยนรหัสผ่าน
 * --------------------------------------------------------------------------- */

/**
 * เขียนค่ารหัสผ่านใหม่ลงแถวผู้ใช้
 * @param {string} email อีเมล (คีย์หลักของ User_Role)
 * @param {string} password รหัสผ่านใหม่
 * @param {boolean} mustChange บังคับให้เปลี่ยนตอนเข้าครั้งแรกหรือไม่
 * @return {Object} แถวที่แก้แล้ว
 */
function writeNewPassword_(email, password, mustChange) {
  assertPasswordStrength_(password);

  var salt = newPasswordSalt_();
  return updateUserRole_(email, {
    'Password_Salt':        salt,
    'Password_Hash':        encodePasswordHash_(PASSWORD_ITERATIONS,
                              hashPassword_(password, salt, PASSWORD_ITERATIONS)),
    'Must_Change_Password': mustChange === true,
    'Failed_Count':         0,
    // null ไม่ใช่ข้อความว่าง — Postgres ปฏิเสธข้อความว่างสำหรับคอลัมน์ชนิดเวลา (code 22007)
    'Locked_Until':         null
  });
}

/**
 * ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง
 *
 * ต้องยืนยันรหัสเดิมก่อนเสมอ แม้จะล็อกอินอยู่แล้ว เพราะถ้าไม่ตรวจ
 * ใครที่เดินผ่านเครื่องที่เปิดค้างไว้จะยึดบัญชีไปได้ในสามวินาที
 *
 * @param {Object} user ผู้ใช้ปัจจุบันจาก getCurrentUser_()
 * @param {string} oldPassword รหัสเดิม
 * @param {string} newPassword รหัสใหม่
 * @return {Object} {changed:true}
 */
function changeOwnPassword(user, oldPassword, newPassword) {
  var row = getUserRole(user.email);
  if (!row) throw new Error('ไม่พบบัญชีของคุณในทะเบียนผู้ใช้ กรุณาติดต่อผู้ดูแลระบบ');

  if (!passwordMatches_(oldPassword, row['Password_Salt'], row['Password_Hash'])) {
    throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
  }
  if (String(newPassword) === String(oldPassword)) {
    throw new Error('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม');
  }

  writeNewPassword_(user.email, newPassword, false);
  writeAuthAudit_(ACTION.PASSWORD_CHANGE, user.email, '', 'เปลี่ยนรหัสผ่านด้วยตัวเอง');
  return { changed: true };
}

/**
 * ผู้ดูแลตั้งรหัสชั่วคราวให้คนอื่น — บังคับเปลี่ยนตอนเข้าครั้งแรกเสมอ
 *
 * บังคับเปลี่ยนเพราะรหัสชั่วคราวผ่านมือผู้ดูแล ผ่านแชต หรือผ่านกระดาษมาแล้ว
 * ถ้าไม่บังคับ รหัสที่คนอื่นเคยเห็นจะกลายเป็นรหัสถาวรของคนนั้น
 *
 * @param {string} email อีเมลของผู้ใช้
 * @param {string} tempPassword รหัสชั่วคราว
 * @param {Object} actor ผู้ดูแลที่ทำรายการ
 * @return {Object} {email, forcedLogout}
 */
function setPasswordFor(email, tempPassword, actor) {
  var row = getUserRole(email);
  if (!row) throw new Error('ไม่พบผู้ใช้ ' + email + ' ในทะเบียนผู้ใช้');

  writeNewPassword_(email, tempPassword, true);

  // ตั้งรหัสใหม่แล้วโทเคนเดิมต้องใช้ไม่ได้ ไม่งั้นคนที่ยึดบัญชีไปแล้วยังอยู่ต่อได้อีก 12 ชั่วโมง
  var closed = forceLogoutUser(email);

  writeAuthAudit_(ACTION.PASSWORD_RESET, email, '',
    'ผู้ดูแลตั้งรหัสชั่วคราวให้ โดย ' + actingEmail_(actor));
  return { email: email, forcedLogout: closed };
}

/* ---------------------------------------------------------------------------
 * ผู้ใช้คนแรก และงานของผู้ดูแลที่กดรันจากตัวแก้ไข
 * --------------------------------------------------------------------------- */

/**
 * สร้างบัญชี ADMIN คนแรก — กดรันจากตัวแก้ไข Apps Script ครั้งเดียว
 *
 * แก้ปัญหาไก่กับไข่: ต้องมี ADMIN ถึงจะตั้งรหัสให้ใครได้ แต่ตอนเริ่มยังไม่มีใครเลย
 * ทางเดียวที่เชื่อถือได้คือให้คนที่เปิดตัวแก้ไขได้ (คือเจ้าของระบบ) เป็นคนกด
 *
 * ปฏิเสธทันทีถ้ามี ADMIN อยู่แล้ว เพื่อไม่ให้กลายเป็นประตูหลังถาวร
 *
 * @param {string} email อีเมลของผู้ดูแลคนแรก (ใช้เป็นคีย์หลัก ไม่ต้องเป็นบัญชี Google)
 * @param {string} username ชื่อผู้ใช้สำหรับล็อกอิน
 * @param {string} displayName ชื่อที่แสดงบนหน้าจอ
 * @param {string} tempPassword รหัสชั่วคราว อย่างน้อย 8 ตัวอักษร
 * @return {string} ข้อความสรุปสำหรับอ่านใน Execution log
 */
function createFirstAdmin(email, username, displayName, tempPassword) {
  var existing = listUserRoles(true);
  for (var i = 0; i < existing.length; i++) {
    if (splitRoles_(existing[i]['Role']).indexOf(ROLE.ADMIN) !== -1) {
      throw new Error('มีผู้ดูแล (ADMIN) ในระบบอยู่แล้ว — ฟังก์ชันนี้ใช้ได้เฉพาะตอนยังไม่มีใครเลย ' +
        'ถ้าลืมรหัสให้ใช้ resetPassword() แทน');
    }
  }

  if (!email || !username) throw new Error('ต้องระบุทั้งอีเมลและชื่อผู้ใช้');
  assertPasswordStrength_(tempPassword);

  if (userByUsername_(username)) throw new Error('ชื่อผู้ใช้ "' + username + '" ถูกใช้ไปแล้ว');

  var salt = newPasswordSalt_();
  appendRow_(SHEET.USER_ROLE, {
    'Email':                String(email).trim(),
    'Username':             String(username).trim(),
    'Display_Name':         String(displayName || username).trim(),
    'Role':                 ROLE.ADMIN,
    'Department':           '',
    'Password_Salt':        salt,
    'Password_Hash':        encodePasswordHash_(PASSWORD_ITERATIONS,
                              hashPassword_(tempPassword, salt, PASSWORD_ITERATIONS)),
    'Failed_Count':         0,
    'Must_Change_Password': true,
    'Active':               true
  });
  clearDisplayNameCache_();   // มีชื่อใหม่ในทะเบียนแล้ว

  return 'สร้างผู้ดูแลคนแรกแล้ว: ' + username + ' — เข้าระบบครั้งแรกจะถูกบังคับให้เปลี่ยนรหัสทันที';
}

/**
 * ตั้งรหัสชั่วคราวให้ผู้ใช้ที่ลืมรหัส — กดรันจากตัวแก้ไข Apps Script
 *
 * มีไว้สำหรับกรณีที่ไม่มีผู้ดูแลคนอื่นช่วยได้ เช่นผู้ดูแลคนเดียวลืมรหัสเสียเอง
 * คนที่เปิดตัวแก้ไขได้คือเจ้าของระบบอยู่แล้ว จึงไม่ต้องมีด่านเพิ่ม
 *
 * @param {string} username ชื่อผู้ใช้ที่ลืมรหัส
 * @param {string} tempPassword รหัสชั่วคราว อย่างน้อย 8 ตัวอักษร
 * @return {string} ข้อความสรุปสำหรับอ่านใน Execution log
 */
function resetPassword(username, tempPassword) {
  var row = userByUsername_(username);
  if (!row) throw new Error('ไม่พบชื่อผู้ใช้ "' + username + '" ในทะเบียนผู้ใช้');

  var result = setPasswordFor(String(row['Email']), tempPassword,
    { email: 'ผู้ดูแลระบบ (ตัวแก้ไข Apps Script)' });

  return 'ตั้งรหัสชั่วคราวให้ ' + username + ' แล้ว · ปิดโทเคนเดิม ' + result.forcedLogout +
    ' ใบ · เข้าระบบครั้งหน้าจะถูกบังคับให้เปลี่ยนรหัสทันที';
}

/**
 * วัดว่าการเข้ารหัสรหัสผ่านใช้เวลาเท่าไรบนเครื่องจริง — กดรันจากตัวแก้ไข
 *
 * เลขจำนวนรอบใน 00_Config.gs ตั้งไว้ฝั่งปลอดภัยเพราะวัดจากเครื่องพัฒนาไม่ได้
 * กดรันตัวนี้แล้วถ้ายังเร็วกว่าครึ่งวินาทีมาก ให้เพิ่ม PASSWORD_ITERATIONS ขึ้นได้
 * รหัสผ่านเดิมจะยังใช้ได้ เพราะจำนวนรอบถูกเก็บไว้ในค่าที่บันทึกลงชีตแล้ว
 *
 * @return {string} ข้อความสรุปสำหรับอ่านใน Execution log
 */
function measurePasswordCost() {
  var started = new Date().getTime();
  hashPassword_('ตัวอย่างรหัสผ่านสำหรับวัดเวลา', newPasswordSalt_(), PASSWORD_ITERATIONS);
  var used = new Date().getTime() - started;

  var suggestion = Math.floor(PASSWORD_ITERATIONS * 500 / Math.max(used, 1));
  return 'วน ' + PASSWORD_ITERATIONS + ' รอบ ใช้เวลา ' + used + ' มิลลิวินาที · ' +
    'จำนวนรอบที่ใช้เวลาราวครึ่งวินาทีคือประมาณ ' + suggestion + ' รอบ';
}

/* ---------------------------------------------------------------------------
 * ตัวช่วยที่ชั้นอื่นใช้
 * --------------------------------------------------------------------------- */

/**
 * แก้แถวผู้ใช้ — ห่อไว้เพื่อให้จุดที่เขียนทะเบียนผู้ใช้อยู่ที่เดียว
 * @param {string} email อีเมล (คีย์หลัก)
 * @param {Object} patch เฉพาะคอลัมน์ที่ต้องการเปลี่ยน
 * @return {Object}
 */
function updateUserRole_(email, patch) {
  var row = updateRow_(SHEET.USER_ROLE, 'Email', email, patch);
  clearDisplayNameCache_();   // ชื่อที่แสดงอาจเพิ่งเปลี่ยน ต้องไม่ใช้ของเดิมต่อ
  return row;
}

/**
 * ชื่อที่ใช้แสดงของอีเมลหนึ่ง — จุดแปลงจุดเดียวของทั้งระบบ (SPEC 13)
 *
 * **ที่เก็บในฐานข้อมูลยังเป็นอีเมลเสมอ** · อีเมลคือคีย์หลักของทะเบียนผู้ใช้และเป็น
 * สิ่งเดียวที่ไม่เปลี่ยน ส่วนชื่อที่แสดงเปลี่ยนได้ตลอด — คนแต่งงานเปลี่ยนนามสกุล
 * หรือมีคนแก้ให้สะกดถูก · ถ้าเขียนชื่อลงฐานข้อมูลแทนอีเมล ประวัติทั้งหมดจะพัง
 * ในวันที่มีคนเปลี่ยนชื่อ และจะไม่มีทางรู้อีกเลยว่าแถวเก่าหมายถึงใคร
 * **การแปลงจึงเกิดตอนแสดงผลเท่านั้น ไม่ใช่ตอนบันทึก**
 *
 * **หาไม่เจอให้คืนอีเมลนั้น ห้ามคืนค่าว่าง** · ผู้ใช้ที่ถูกปิดการใช้งานหรือลบไปแล้ว
 * ยังมีชื่ออยู่ในประวัติ · ประวัติที่บอกว่า "ใครไม่รู้อนุมัติใบนี้" แย่กว่าประวัติที่บอกอีเมล
 *
 * **ห้ามยิงคำขอเพิ่มต่อหนึ่งแถว** · อ่านทะเบียนทั้งชุดครั้งเดียวผ่าน listUserRoles
 * ซึ่งใช้ภาพของตารางระดับการรันเดียวกับที่ชั้นอื่นใช้อยู่แล้ว · แถวที่สองเป็นต้นไป
 * จึงไม่มีราคา และหน้าที่แสดงชื่อคนห้าสิบชื่อก็ยังยิงเท่าเดิม
 *
 * @param {*} email อีเมลที่เก็บไว้ในฐานข้อมูล
 * @return {string} ชื่อที่ใช้แสดง หรืออีเมลเดิมเมื่อไม่มีในทะเบียน
 */
function displayNameOf_(email) {
  var key = String(email || '').trim();
  if (!key) return '';

  var names = displayNameMap_();
  var found = names[key.toLowerCase()];
  return found || key;
}

/**
 * แผนที่อีเมล → ชื่อที่ใช้แสดง ของทะเบียนผู้ใช้ทั้งชุด
 *
 * เก็บไว้ในตัวแปรระดับการรัน ไม่ใช่ในแคชข้ามการรัน — ทะเบียนผู้ใช้เปลี่ยนไม่บ่อย
 * แต่เมื่อเปลี่ยนแล้วต้องเห็นทันทีในคำขอถัดไป ไม่ใช่รออายุแคชหมด
 *
 * อ่าน **รวมผู้ใช้ที่ปิดการใช้งานแล้ว** เพราะประวัติเก่าอ้างถึงคนเหล่านั้นอยู่
 * ถ้ากรองออก ชื่อในประวัติจะกลายเป็นอีเมลไปเงียบ ๆ ทั้งที่ทะเบียนยังมีชื่ออยู่
 *
 * @return {Object} คีย์เป็นอีเมลตัวพิมพ์เล็ก
 */
function displayNameMap_() {
  if (DISPLAY_NAME_MAP_) return DISPLAY_NAME_MAP_;

  var map = {};
  try {
    var rows = listUserRoles(false);
    for (var i = 0; i < rows.length; i++) {
      var email = String(rows[i]['Email'] || '').trim();
      if (!email) continue;
      var name = String(rows[i]['Display_Name'] || '').trim();
      if (name) map[email.toLowerCase()] = name;
    }
  } catch (e) {
    /*
     * อ่านทะเบียนไม่ได้ ต้องไม่ทำให้หน้าที่กำลังแสดงล้มทั้งหน้า · ผลที่ได้คือ
     * เห็นอีเมลแทนชื่อ ซึ่งอ่านออกและถูกต้องเสมอ ต่างจากช่องว่างที่ไม่บอกอะไรเลย
     */
    Logger.log('อ่านทะเบียนผู้ใช้เพื่อแปลงชื่อไม่ได้ จะแสดงเป็นอีเมลแทน: ' + (e && e.message));
  }

  DISPLAY_NAME_MAP_ = map;
  return map;
}

/** แผนที่ชื่อของการรันนี้ · ล้างด้วย clearDisplayNameCache_() เมื่อทะเบียนเปลี่ยน */
var DISPLAY_NAME_MAP_ = null;

/** ลืมแผนที่ชื่อ — ต้องเรียกทุกครั้งที่ทะเบียนผู้ใช้ถูกแก้ */
function clearDisplayNameCache_() {
  DISPLAY_NAME_MAP_ = null;
}

/**
 * ปัญหาของค่าแผนกในทะเบียน ถ้ามี — ข้อความที่พร้อมให้ผู้ใช้อ่าน
 *
 * **ห้ามทำให้เข้าระบบไม่ได้** · เคยทำเป็นการโยน error ที่จุดประกอบตัวตน ซึ่งแปลว่า
 * ค่าผิดในช่องเดียวทำให้บัญชีนั้นใช้ระบบไม่ได้ทั้งระบบ · เกิดจริง 29-09-2026 กับ
 * บัญชีเจ้าของระบบเองที่ทะเบียนเก็บว่า "AdminSale" ในช่องแผนก — ซึ่งไม่ใช่แผนก
 * แต่เป็นบทบาท · บัญชีนั้นไม่ได้สังกัดแผนกใดจริง ๆ และควรใช้งานได้ตามปกติ
 *
 * แผนกมีผลกับหน้าของแผนกเท่านั้น การปิดทั้งระบบเพราะช่องนี้จึงไม่ได้สัดส่วนกับ
 * ความเสียหาย · สิ่งที่ต้องมีคือคำอธิบายตรงจุดที่มันมีผล ไม่ใช่ประตูที่ล็อกทุกบาน
 *
 * @param {*} value ค่าในคอลัมน์ Department
 * @return {string} ข้อความอธิบาย หรือค่าว่างเมื่อไม่มีปัญหา
 */
function departmentProblemOf_(value) {
  var raw = String(value == null ? '' : value).trim();
  if (!raw || departmentCodeOf_(raw)) return '';

  return 'ทะเบียนผู้ใช้ระบุแผนกของคุณไว้ว่า "' + raw + '" ซึ่งไม่ใช่รหัสแผนกที่ระบบรู้จัก ' +
    '(' + knownDepartments_().join(' ') + ') · ระบบจึงถือว่าคุณไม่ได้สังกัดแผนกใด ' +
    'ถ้าควรสังกัดแผนก กรุณาติดต่อผู้ดูแลระบบให้แก้ค่าในทะเบียน';
}


/**
 * ประกอบตัวตนผู้ใช้จากแถวในทะเบียน — รูปแบบเดียวกับที่ getCurrentUser_() คืน
 * @param {string} email อีเมล
 * @param {Object} row แถวใน User_Role
 * @return {Object}
 */
function userViewOfRow_(email, row) {
  return {
    email:          email,
    username:       row['Username'] || '',
    displayName:    row['Display_Name'] || row['Username'] || email,
    roles:          splitRoles_(row['Role']),
    department:     departmentCodeOf_(row['Department']),
    // ค่าที่ผิดต้องอธิบายได้ตรงจุดที่มันมีผล ไม่ใช่เงียบไปเฉย ๆ และไม่ใช่ปิดทั้งระบบ
    departmentProblem: departmentProblemOf_(row['Department']),
    telegramUserId: row['Telegram_User_ID'] || '',
    active:         true
  };
}
