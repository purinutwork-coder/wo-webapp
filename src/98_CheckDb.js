/**
 * 98_CheckDb.gs — เครื่องมือตรวจการเชื่อมต่อ Supabase สำหรับผู้ดูแล (SPEC 22.2)
 *
 * แบบเดียวกับ checkTelegram() และ checkPermissions() ที่มีอยู่แล้ว คือกดรันจาก
 * ตัวแก้ไข Apps Script แล้วอ่านผลใน Execution log · ไม่มีใครในระบบเรียกใช้
 *
 * ไฟล์นี้ **ไม่ยิง UrlFetchApp เอง** แม้แต่ครั้งเดียว ทุกอย่างผ่านฟังก์ชันใน 01_Db.gs
 * ตามกฎข้อ 21 · รวมถึงการทดสอบคีย์ anon ซึ่งเรียกผ่าน `db_probeAnonAll_()`
 */

/** ตารางเล็กที่ใช้วัดเวลาไป-กลับ — เลือกตารางที่แถวน้อยเพื่อให้วัดการเดินทาง ไม่ใช่วัดขนาดข้อมูล */
var CHECK_DB_PING_TABLE = 'Counter';

/** คีย์ที่ใช้ทดสอบตัวออกเลข — ขึ้นต้นด้วย TEST- เหมือนข้อมูลทดสอบอื่นทั้งระบบ แล้วลบทิ้งเสมอ */
var CHECK_DB_COUNTER_KEY = 'TEST-CHECK';

/** จำนวนครั้งที่วัดเวลาไป-กลับ แล้วรายงานค่าเฉลี่ย */
var CHECK_DB_PING_TIMES = 3;

/**
 * ตรวจว่าคุยกับ Supabase ได้จริงหรือยัง แล้วพิมพ์ผลลง Execution log
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function checkSupabase() {
  /*
   * ด่านเดียวกับที่ getSheet_() ใช้ (กฎข้อ 21) · ชื่อฟังก์ชันไม่ลงท้ายด้วยขีดล่าง
   * จึงเรียกได้จาก google.script.run · ถ้าไม่มีบรรทัดนี้ ใครก็ตามที่เปิดหน้าเว็บ
   * จะสั่งให้ระบบรายงานโครงสร้างฐานข้อมูลและจำนวนแถวทุกตารางให้ฟังได้
   */
  assertDataAccessAllowed_();

  var lines = ['===== ตรวจการเชื่อมต่อ Supabase (SPEC 22) ====='];

  if (!checkDbSettings_(lines)) {
    Logger.log(lines.join(NEW_LINE_));
    return 'ยังตั้งค่าไม่ครบ — ดูรายละเอียดใน Execution log';
  }

  var ping = checkDbPing_(lines);

  /*
   * ถ้าต่อไม่ได้ด้วยเหตุที่เหมือนกันทุกตาราง (คีย์ผิด ที่อยู่ผิด โปรเจกต์หยุด)
   * การไล่ยิงอีก 16 ตารางจะได้คำตอบเดิม 16 ครั้ง ไม่ได้ข้อมูลเพิ่มเลย และทิ้งบรรทัด
   * DB_FAILED ไว้ใน System_Log อีก 16 บรรทัด · หยุดตรงนี้แล้วบอกทางแก้ดีกว่า
   *
   * แต่ "ตารางไม่มี" กับ "ยังไม่ได้ GRANT" เป็นเรื่องรายตารางทั้งคู่ — Postgres ให้
   * สิทธิ์ทีละตาราง ตารางอื่นจึงอาจผ่านได้ · สองกรณีนี้ต้องไล่ดูต่อให้ครบ
   * เพราะรายชื่อตารางที่ติดคือสิ่งที่ต้องเอาไปเขียนคำสั่ง GRANT
   */
  var keepScanning = { MISSING: true, GRANT: true };

  if (!ping.ok && !keepScanning[dbDoorOfFailure_(ping.failure)]) {
    checkDbAdvice_(lines, ping.failure);
    Logger.log(lines.join(NEW_LINE_));
    return 'ต่อฐานข้อมูลไม่ได้ — ดูสาเหตุและทางแก้ใน Execution log';
  }

  var tables = checkDbTables_(lines);
  checkDbCounter_(lines);
  checkDbAnon_(lines, tables);
  checkDbCustomer_(lines);
  checkBackupSection_(lines);
  var objects = checkSqlVersions_(lines);
  checkNewColumns_(lines, objects);

  if (!tables.length) checkDbAdvice_(lines, db_lastFailure_());

  Logger.log(lines.join(NEW_LINE_));
  return 'ตรวจเสร็จแล้ว — ดูผลใน Execution log';
}

/**
 * ตั้งค่าครบไหม — บอกแค่ว่ามีหรือไม่มี และยาวเท่าไร ไม่พิมพ์ค่าเด็ดขาด (กฎข้อ 22)
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @return {boolean} true = ตั้งค่าครบพอที่จะตรวจต่อได้
 */
function checkDbSettings_(lines) {
  lines.push('');
  lines.push('########## 1. การตั้งค่าใน Script Properties ##########');

  var url = String(getProp_(PROP_KEY.SUPABASE_URL, false) || '');
  var service = String(getProp_(PROP_KEY.SUPABASE_SERVICE_KEY, false) || '');
  var anon = String(getProp_(PROP_KEY.SUPABASE_ANON_KEY, false) || '');

  // ที่อยู่ไม่ใช่ความลับ พิมพ์ได้ · สองคีย์ที่เหลือเป็นความลับ บอกได้แค่ความยาว
  lines.push('  SUPABASE_URL         : ' + (url ? ('ตั้งค่าแล้ว · ' + url) : 'ยังไม่ตั้ง'));
  lines.push('  SUPABASE_SERVICE_KEY : ' + (service
    ? ('ตั้งค่าแล้ว · ยาว ' + service.length + ' ตัวอักษร')
    : 'ยังไม่ตั้ง'));
  lines.push('  SUPABASE_ANON_KEY    : ' + (anon
    ? ('ตั้งค่าแล้ว · ยาว ' + anon.length + ' ตัวอักษร')
    : 'ยังไม่ตั้ง (ตรวจ RLS ไม่ได้ถ้าไม่มี)'));

  if (url && url.indexOf('/rest/v1') !== -1) {
    lines.push('  ! SUPABASE_URL ไม่ควรมี /rest/v1 ต่อท้าย — ระบบเติมให้เองทุกครั้ง');
  }

  if (!url || !service) {
    lines.push('');
    lines.push('  หยุดตรวจตรงนี้ เพราะขาดค่าที่จำเป็น');
    lines.push('  ตั้งที่ ตัวแก้ไข Apps Script > Project Settings > Script Properties');
    return false;
  }
  return true;
}

/**
 * ต่อได้ไหม และเวลาไป-กลับเท่าไร
 *
 * เมื่อต่อไม่ได้ ต้องพิมพ์สาเหตุจริงออกมาตรงนี้เลย ไม่ใช่ไล่ให้ไปหาเองในไฟล์บันทึก
 * เครื่องมือตรวจที่ซ่อนผลการตรวจไว้ ไม่ได้ทำหน้าที่ของมัน · ข้อความนี้ออกทาง
 * Execution log ซึ่งเห็นได้เฉพาะคนที่เปิดตัวแก้ไขสคริปต์ ไม่ใช่หน้าเว็บของผู้ใช้
 * กฎข้อ 24 ห้ามไม่ให้รายละเอียดไหลไปถึงหน้าเว็บ ซึ่งยังเป็นจริงอยู่ทุกประการ
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @return {Object} {ok, failure}
 */
function checkDbPing_(lines) {
  lines.push('');
  lines.push('########## 2. การเชื่อมต่อและเวลาไป-กลับ ##########');

  var times = [];
  for (var i = 0; i < CHECK_DB_PING_TIMES; i++) {
    var startedAt = new Date().getTime();
    try {
      db_count_(CHECK_DB_PING_TABLE);
    } catch (e) {
      var why = db_lastFailure_();
      lines.push('  ครั้งที่ ' + (i + 1) + ': ต่อไม่สำเร็จ');
      lines.push('  สาเหตุจริงที่ฐานข้อมูลตอบกลับมา:');
      lines.push('    ' + why.detail);
      return { ok: false, failure: why };
    }
    times.push(new Date().getTime() - startedAt);
  }

  var total = 0;
  for (var t = 0; t < times.length; t++) total += times[t];
  var average = Math.round(total / times.length);

  lines.push('  ต่อได้ · วัด ' + times.length + ' ครั้ง: ' + times.join(' / ') + ' ms');
  lines.push('  เฉลี่ย ' + average + ' ms');

  /*
   * ตัวเลขนี้คือเหตุผลทั้งหมดของการย้าย · การอ่านชีตหนึ่งครั้งอยู่ที่ราว 450 ms
   * ถ้าค่าเฉลี่ยที่วัดได้ไม่ต่ำกว่านั้นชัดเจน แปลว่ายังไม่ได้อะไรจากการย้ายเลย
   */
  lines.push('  เทียบกับที่เก็บข้อมูลเดิมซึ่งอ่านหนึ่งครั้งที่ราว 450 ms — ' +
    (average < 300 ? 'เร็วกว่าชัดเจน' : 'ยังไม่เร็วกว่าของเดิมอย่างที่ควรเป็น ต้องดูว่าทำไม'));

  return { ok: true, failure: null };
}

/**
 * แปลรหัสตอบกลับเป็นสิ่งที่ต้องไปทำ — ส่วนที่ทำให้เครื่องมือนี้ใช้แก้ปัญหาได้จริง
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} failure ผลจาก db_lastFailure_()
 */
function checkDbAdvice_(lines, failure) {
  lines.push('');
  lines.push('########## ต้องไปทำอะไรต่อ ##########');

  var door = dbDoorOfFailure_(failure);
  var status = failure ? failure.status : 0;

  if (door === 'KEY') {
    lines.push('  รหัส 401 แปลว่าคีย์ไม่ถูกยอมรับ · ตรวจสามอย่างนี้');
    lines.push('    1. SUPABASE_SERVICE_KEY ต้องเป็นคีย์ฝั่งเซิร์ฟเวอร์ (service_role หรือ sb_secret_...)');
    lines.push('       ไม่ใช่คีย์ฝั่งหน้าเว็บ (anon หรือ sb_publishable_...)');
    lines.push('    2. คัดลอกมาครบทั้งค่า ไม่มีช่องว่างหรือบรรทัดใหม่ติดหัวท้าย');
    lines.push('    3. เป็นคีย์ของโปรเจกต์เดียวกับที่อยู่ใน SUPABASE_URL');
    return;
  }

  if (door === 'GRANT') {
    /*
     * คีย์ถูกต้องแล้ว · Supabase อ่านคีย์ออก รู้ว่าเป็น role ไหน แล้วถึงปฏิเสธ
     * เพราะ role นั้นยังไม่มีสิทธิ์ระดับตาราง · ห้ามส่งคนไปตรวจคีย์เด็ดขาด
     * คีย์ไม่ได้ผิด และการไปตรวจจะไม่มีวันเจออะไร
     */
    lines.push('  code ' + DB_CODE_NO_GRANT + ' แปลว่า **คีย์ถูกต้องแล้ว** ไม่ต้องไปตรวจคีย์');
    lines.push('  (รหัสตอบกลับที่มากับมันคือ ' + status + ' · ของจริงคือ 401 ไม่ใช่ 403 — แยกด้วย code เท่านั้น)');
    lines.push('  Supabase อ่านคีย์ออกและรู้ว่าเป็น role ไหน แต่ role นั้นยังไม่ได้รับสิทธิ์ระดับตาราง');
    lines.push('');
    lines.push('  GRANT กับ RLS เป็นประตูคนละบาน (SPEC 22.5)');
    lines.push('    ยังไม่ได้ GRANT        → code ' + DB_CODE_NO_GRANT + ' แบบที่เห็นอยู่นี้');
    lines.push('    GRANT แล้วแต่ RLS กัน → ได้ 200 พร้อม 0 แถว ไม่ใช่ข้อผิดพลาด');
    lines.push('  ที่ต้องทำคือให้ GRANT · RLS ที่เปิดไว้แล้วยังทำหน้าที่ของมันเหมือนเดิม');
    lines.push('');
    lines.push('  เปิด Supabase > SQL Editor > New query แล้วรันคำสั่ง GRANT');

    if (failure && failure.hint) {
      // Supabase ส่งคำสั่งที่ต้องใช้มาให้อยู่แล้ว การพิมพ์ของจริงออกมาดีกว่าเดาแทนเขา
      lines.push('  คำแนะนำที่ฐานข้อมูลส่งมาเอง:');
      lines.push('    ' + failure.hint);
    }
    if (failure && failure.message) {
      lines.push('  ข้อความเต็ม: ' + failure.message);
    }
    return;
  }

  if (door === 'UNKNOWN_403') {
    lines.push('  รหัส 403 แต่ไม่มี code ' + DB_CODE_NO_GRANT + ' ติดมาด้วย');
    lines.push('  จึงไม่ใช่เรื่องสิทธิ์ระดับตารางที่รู้จัก และผมจะไม่เดาให้ว่าคืออะไร');
    lines.push('  ของจริงที่ฐานข้อมูลตอบกลับมา:');
    lines.push('    ' + (failure ? failure.detail : '-'));
    return;
  }

  if (door === 'MISSING') {
    lines.push('  รหัส 404 แปลว่าที่อยู่ถูกแต่ยังไม่มีตารางนั้น');
    lines.push('    เปิด Supabase > SQL Editor > New query แล้ววาง supabase_schema.sql ทั้งไฟล์ กด Run');
    lines.push('    จากนั้นรัน checkSupabase อีกครั้ง');
    return;
  }

  if (door === 'SERVER') {
    lines.push('  รหัส ' + status + ' แปลว่าฝั่ง Supabase มีปัญหา ไม่ใช่ฝั่งเรา');
    lines.push('    แผนฟรีจะหยุดโปรเจกต์เมื่อไม่มีการใช้งาน 7 วัน (SPEC 22.6)');
    lines.push('    เปิดหน้าจัดการโปรเจกต์ ถ้าขึ้นว่า Paused ให้กดปลุก แล้วรอสักครู่ ข้อมูลไม่หาย');
    return;
  }

  if (door === 'NETWORK') {
    lines.push('  ต่อไม่ติดเลย แปลว่าคำขอไปไม่ถึงปลายทาง');
    lines.push('    ตรวจว่า SUPABASE_URL สะกดถูกและเป็นรูปแบบ https://<รหัสโปรเจกต์>.supabase.co');
    lines.push('    ห้ามมี /rest/v1 ต่อท้าย และห้ามมีช่องว่างติดมา');
    return;
  }

  lines.push('  รหัส ' + status + ' · ยังไม่มีคำแปลสำหรับรหัสนี้ จึงพิมพ์ของจริงออกมาแทนการเดา');
  lines.push('    ' + (failure ? failure.detail : '-'));
}

/**
 * มีครบทั้ง 16 ตารางไหม และแต่ละตารางมีกี่แถว
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @return {string[]} ชื่อตารางในระบบที่มีอยู่จริง
 */
function checkDbTables_(lines) {
  lines.push('');
  lines.push('########## 3. ตารางและจำนวนแถว ##########');

  var keys = [];
  for (var key in DB_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(DB_COLUMNS, key)) keys.push(key);
  }

  var found = [];
  var missing = [];

  for (var i = 0; i < keys.length; i++) {
    var name = keys[i];
    try {
      var rows = db_count_(name);
      found.push(name);
      lines.push('  ' + checkDbPad_(name) + ' → ' + DB_COLUMNS[name].table +
        ' · ' + (rows < 0 ? 'นับไม่ได้' : (rows + ' แถว')));
    } catch (e) {
      missing.push(name);
      lines.push('  ' + checkDbPad_(name) + ' → ' + DB_COLUMNS[name].table +
        ' · อ่านไม่ได้ (รหัส ' + db_lastFailure_().status + ')');
    }
  }

  lines.push('');
  lines.push('  สรุป: อ่านได้ ' + found.length + ' จาก ' + keys.length + ' ตาราง');
  if (missing.length) {
    lines.push('  !! ตารางที่อ่านไม่ได้: ' + missing.join(', '));
    lines.push('  สาเหตุจริงของตารางสุดท้ายที่ลอง:');
    lines.push('    ' + db_lastFailure_().detail);

    // รายชื่อชื่อจริงในฐานข้อมูล คือสิ่งที่ต้องเอาไปเขียนคำสั่ง GRANT หรือ CREATE TABLE
    var dbNames = [];
    for (var m = 0; m < missing.length; m++) dbNames.push(DB_COLUMNS[missing[m]].table);
    lines.push('  ชื่อจริงในฐานข้อมูลของตารางเหล่านั้น: ' + dbNames.join(', '));

    checkDbAdvice_(lines, db_lastFailure_());
  }
  return found;
}

/**
 * เติมช่องว่างให้ชื่อตารางยาวเท่ากัน เพื่อให้คอลัมน์ในรายงานตรงกัน
 * @param {string} name ชื่อตาราง
 * @return {string}
 */
function checkDbPad_(name, width) {
  var out = String(name);
  var want = width || 20;
  while (out.length < want) out += ' ';
  return out;
}

/**
 * ตัวออกเลขแบบ atomic ทำงานจริงไหม — ต้องได้เลขเรียงกันและไม่ซ้ำ
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 */
function checkDbCounter_(lines) {
  lines.push('');
  lines.push('########## 4. ตัวออกเลขที่ next_running_number ##########');

  var numbers = [];
  try {
    for (var i = 0; i < 3; i++) {
      numbers.push(Number(db_rpc_('next_running_number', { p_key: CHECK_DB_COUNTER_KEY })));
    }
  } catch (e) {
    var why = db_lastFailure_();
    lines.push('  เรียกไม่สำเร็จ (รหัส ' + why.status + ')');
    lines.push('  สาเหตุจริงที่ฐานข้อมูลตอบกลับมา:');
    lines.push('    ' + why.detail);
    if (why.status === 404) {
      lines.push('  รหัส 404 ตรงนี้แปลว่ายังไม่ได้สร้างฟังก์ชัน — รัน supabase_schema.sql ส่วนที่ 5');
    }

    /*
     * ไม่ลบแถวทดสอบเมื่อเรียกไม่สำเร็จสักครั้ง เพราะไม่มีแถวให้ลบตั้งแต่แรก
     * การยิงคำสั่งลบตอนนี้จะล้มซ้ำอีกครั้ง แล้วทิ้งบรรทัดใน System_Log เพิ่มฟรี ๆ
     */
    if (numbers.length) checkDbCleanupCounter_(lines);
    return;
  }

  lines.push('  เรียก 3 ครั้งติดกันได้: ' + numbers.join(', '));

  var consecutive = (numbers[1] === numbers[0] + 1) && (numbers[2] === numbers[1] + 1);
  var unique = (numbers[0] !== numbers[1]) && (numbers[1] !== numbers[2]) && (numbers[0] !== numbers[2]);

  lines.push('  เรียงติดกันทีละหนึ่ง: ' + (consecutive ? 'ใช่' : 'ไม่ใช่ !!'));
  lines.push('  ไม่ซ้ำกันเลย: ' + (unique ? 'ใช่' : 'ไม่ใช่ !!'));

  if (!consecutive || !unique) {
    lines.push('  !! ตัวออกเลขยังไม่ปลอดภัย — ห้ามย้าย Counter จนกว่าจะแก้');
  }
  checkDbCleanupCounter_(lines);
}

/**
 * ลบแถวทดสอบของตัวออกเลขทิ้ง — ต้องเรียกทุกทางออก ไม่งั้นจะทิ้งขยะไว้ในตารางจริง
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 */
function checkDbCleanupCounter_(lines) {
  try {
    var removed = db_delete_('Counter', { 'Key': CHECK_DB_COUNTER_KEY });
    lines.push('  ลบแถวทดสอบ ' + CHECK_DB_COUNTER_KEY + ' แล้ว (' + removed.length + ' แถว)');
  } catch (e) {
    lines.push('  ! ลบแถวทดสอบ ' + CHECK_DB_COUNTER_KEY + ' ไม่สำเร็จ ต้องไปลบเองในตาราง counter');
  }
}

/**
 * คีย์ฝั่งหน้าเว็บต้องอ่านอะไรไม่ได้เลยสักตาราง
 *
 * **สิ่งที่ต้องพิสูจน์คือ "คีย์ anon อ่านข้อมูลไม่ได้" ไม่ใช่ "ชั้นไหนเป็นตัวกัน"**
 * ตอนนี้ปิดไว้สองชั้นคือถอน GRANT แล้ว และเปิด RLS โดยไม่มี policy · ชั้นไหนทำงาน
 * ก่อนไม่สำคัญต่อผลลัพธ์ที่ต้องการ ตราบใดที่ผลคือ "อ่านไม่ได้" ทุกตาราง
 *
 * ต้องลองให้ครบทุกตาราง ไม่ใช่ตารางเดียวแล้วเหมาว่าที่เหลือเหมือนกัน เพราะ GRANT
 * ให้ทีละตาราง และ policy ก็เขียนทีละตาราง · ตารางที่หลุดจะหลุดอยู่ตารางเดียวเงียบ ๆ
 * ยิงทั้งหมดในรอบเดียวด้วย fetchAll จึงเสียเวลาเท่ากับยิงตารางเดียว
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {string[]} tables ตารางที่อ่านได้ด้วยคีย์ฝั่งเซิร์ฟเวอร์
 */
function checkDbAnon_(lines, tables) {
  lines.push('');
  lines.push('########## 5. คีย์ฝั่งหน้าเว็บต้องอ่านอะไรไม่ได้เลย ##########');

  var keys = [];
  for (var key in DB_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(DB_COLUMNS, key)) keys.push(key);
  }

  var verdict = anonVerdict_(db_probeAnonAll_(keys), tables);
  var readable = verdict.readable;

  for (var u = 0; u < verdict.untested.length; u++) {
    lines.push('  ' + checkDbPad_(verdict.untested[u].tableKey) +
      ' ทดสอบไม่ได้: ' + verdict.untested[u].note);
  }

  lines.push('  ลองอ่าน ' + verdict.total + ' ตารางด้วยคีย์ anon ในรอบเดียว');
  lines.push('  อ่านไม่ได้ ' + verdict.blocked + ' ตาราง · อ่านได้ ' + readable.length + ' ตาราง');

  if (!readable.length) {
    lines.push('  ผ่าน — คีย์ที่อยู่ฝั่งหน้าเว็บได้เอาข้อมูลออกไปไม่ได้เลยสักตาราง');

    if (verdict.blindSpot.length) {
      lines.push('  หมายเหตุ: ' + verdict.blindSpot.length + ' ตารางตอบ 200 พร้อม 0 แถว ซึ่งตารางว่าง');
      lines.push('  ก็ตอบแบบนี้เหมือนกัน · ผลของตารางที่ยังไม่มีข้อมูลจึงยังไม่ได้พิสูจน์อะไร');
      lines.push('  ต้องตรวจซ้ำอีกครั้งหลังย้ายข้อมูลจริงเข้าไปแล้ว');
    }
    return;
  }

  lines.push('');
  lines.push('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  lines.push('  !!  คำเตือน: คีย์ anon อ่านข้อมูลออกมาได้ ' + readable.length + ' ตาราง');
  for (var r = 0; r < readable.length; r++) {
    lines.push('  !!    ' + readable[r]);
  }
  lines.push('  !!  คีย์ anon อยู่ในหน้าเว็บของทุกคนได้ ใครก็ตามที่ได้ไปจะอ่านตารางเหล่านี้ได้หมด');
  lines.push('  !!  ห้ามย้ายข้อมูลจริงเข้าไปจนกว่าจะปิด — ถอน GRANT ของ anon และเปิด RLS');
  lines.push('  !!  โดยไม่ใส่ policy ให้ครบทุกตารางข้างบน แล้วตรวจใหม่');
  lines.push('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
}

/**
 * สรุปผลการลองอ่านด้วยคีย์ anon — ตรรกะล้วน แยกออกมาเพื่อให้ทดสอบได้โดยไม่ต้องต่อเน็ต
 *
 * "อ่านไม่ได้" นับรวมทั้ง 401 · 403 · และ 200 ที่คืน 0 แถว เพราะสามอาการนี้ปลอดภัย
 * เท่ากันในแง่ของผลลัพธ์ · ส่วน "อ่านได้" คือมีแถวออกมาแม้แถวเดียว ไม่ว่าจะด้วยเหตุใด
 *
 * @param {Object[]} results ผลจาก db_probeAnonAll_()
 * @param {string[]} withData ตารางที่คีย์ฝั่งเซิร์ฟเวอร์อ่านได้ (ใช้หาจุดบอด)
 * @return {Object} {total, blocked, readable, untested, blindSpot}
 */
function anonVerdict_(results, withData) {
  var out = { total: results.length, blocked: 0, readable: [], untested: [], blindSpot: [] };

  for (var i = 0; i < results.length; i++) {
    var one = results[i];

    if (one.note) { out.untested.push(one); continue; }
    if (one.readable) {
      out.readable.push(one.tableKey + ' (' + one.table + ', ' + one.rows + ' แถว)');
      continue;
    }
    out.blocked++;

    /*
     * ตารางที่ยังไม่มีข้อมูลจะคืน 0 แถวเสมอ ไม่ว่าประตูจะปิดหรือเปิด ผลของมันจึงไม่ได้
     * พิสูจน์อะไรเลย · ต้องแยกออกมาบอกไว้ ไม่ใช่นับรวมเป็นข้อพิสูจน์ว่าปลอดภัยแล้ว
     */
    if (one.status >= 200 && one.status < 300 && (withData || []).indexOf(one.tableKey) !== -1) {
      out.blindSpot.push(one.tableKey);
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * สภาพตาราง Customer — ข้อมูลที่ระบบไม่ได้เป็นเจ้าของ (SPEC 22.8)
 * --------------------------------------------------------------------------- */

/** ปีที่เก่าที่สุดที่เป็นไปได้ — เก่ากว่านี้คืออาการของเลขซีเรียล Excel ที่ถูกอ่านเป็นวันที่ */
var CHECK_CUSTOMER_MIN_YEAR = 1990;

/**
 * สภาพของตาราง Customer (SPEC 22.8)
 *
 * ข้อมูลลูกค้ามาจากโปรแกรมบัญชี ไม่ได้เกิดในระบบนี้ ความถูกต้องจึงอยู่นอกการควบคุม
 * ของโค้ด · ห้ามไม่ได้ แต่ตรวจได้ และต้องตรวจ เพราะข้อมูลที่ผิดจะไหลเข้าไปอยู่ใน
 * ใบงานทุกใบที่สร้างหลังจากนั้น แล้วแก้ย้อนหลังไม่ได้
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 */
function checkDbCustomer_(lines) {
  lines.push('');
  lines.push('########## 6. สภาพตาราง Customer (SPEC 22.8) ##########');

  var rows = [];
  try {
    // อ่านทั้งตารางในคำขอเดียว แล้วคำนวณในหน่วยความจำ · การนับแบบที่ต้องดูเลขวัน
    // ของแต่ละแถว ทำด้วยตัวกรองของ PostgREST ไม่ได้ถ้าไม่เขียนฟังก์ชันในฐานข้อมูล
    rows = db_selectAll_('Customer', {
      select: ['รหัสลูกค้า', 'ชื่อลูกค้า', 'วันที่เริ่มติดต่อ']
    });
  } catch (e) {
    lines.push('  อ่านตารางไม่ได้ (รหัส ' + db_lastFailure_().status + ')');
    lines.push('    ' + db_lastFailure_().detail);
    return;
  }

  // ส่งวันนี้เข้าไปเป็นอาร์กิวเมนต์ เพื่อให้ตัวคำนวณเป็นฟังก์ชันล้วนที่ทดสอบได้ตรง ๆ
  var health = customerHealth_(rows, Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd'));

  /*
   * เทียบจำนวนที่อ่านมาได้กับจำนวนที่ฐานข้อมูลนับให้ · ถ้าไม่ตรง แปลว่าการอ่าน
   * ขาดหายระหว่างทาง แล้วตัวเลขที่เหลือทั้งหมดข้างล่างนี้คำนวณจากข้อมูลไม่ครบ
   * ซึ่งแย่กว่าไม่รายงานเลย เพราะมันดูน่าเชื่อถือทุกบรรทัด
   */
  var counted = -1;
  try { counted = db_count_('Customer'); } catch (e) { counted = -1; }

  if (counted >= 0 && counted !== health.total) {
    lines.push('  !! อ่านมาได้ ' + health.total + ' แถว แต่ฐานข้อมูลนับได้ ' + counted + ' แถว');
    lines.push('  !! ตัวเลขข้างล่างคำนวณจากข้อมูลไม่ครบ ห้ามใช้ตัดสินใจ');
  }

  lines.push('  จำนวนแถว                        : ' + health.total +
    (counted >= 0 ? (' (ฐานข้อมูลนับได้ ' + counted + ')') : ''));
  lines.push('  แถวที่ไม่มีชื่อลูกค้า                : ' + health.noName);
  lines.push('  แถวที่รหัสมีร่องรอยถูกตัดผิด        : ' + health.badCode +
    (health.badCodeSamples.length ? ('  เช่น ' + health.badCodeSamples.join(', ')) : ''));
  if (health.badCode) {
    lines.push('    (รหัสว่าง · มีช่องว่าง จุลภาค หรือเครื่องหมายคำพูดปนอยู่ · ยาวเกิน ' +
      CUSTOMER_CODE_MAX + ' ตัวอักษร)');
    lines.push('    ไม่ได้ตรวจรูปแบบของรหัส เพราะโปรแกรมบัญชีออกได้หลายแบบ เช่น AR-0001 กับ NV0001');
  }
  lines.push('  แถวที่มีวันที่เริ่มติดต่อ             : ' + health.withDate);
  lines.push('  วันที่ที่เลขวันเกิน 12              : ' + health.dayOver12 +
    ' (' + health.dayOver12Percent + '% ของแถวที่มีวันที่)');
  lines.push('  วันที่นอกช่วงที่เป็นไปได้           : ' + health.outOfRange +
    (health.outOfRangeSamples.length ? ('  เช่น ' + health.outOfRangeSamples.join(', ')) : ''));

  if (health.withDate && !health.dayOver12) {
    lines.push('');
    lines.push('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    lines.push('  !!  คำเตือน: ไม่มีวันที่สักแถวเลยที่เลขวันเกิน 12');
    lines.push('  !!  จาก ' + health.withDate + ' แถวที่มีวันที่ · เป็นไปไม่ได้ที่จะไม่มีลูกค้า');
    lines.push('  !!  สักรายเริ่มติดต่อหลังวันที่ 12 ของเดือน');
    lines.push('  !!  แปลว่า **วันกับเดือนสลับกันทั้งตาราง** ตอนนำเข้า');
    lines.push('  !!  ต้นเหตุคือ CSV ที่ใช้ DD/MM/YYYY แล้วฐานข้อมูลอ่านแบบ MDY');
    lines.push('  !!  นำเข้าใหม่โดยให้วันที่ใน CSV เป็น YYYY-MM-DD เท่านั้น (SPEC 22.8)');
    lines.push('  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
  }

  if (health.outOfRange) {
    lines.push('');
    lines.push('  ! มีวันที่ ' + health.outOfRange + ' แถวที่อยู่นอกช่วงที่เป็นไปได้');
    lines.push('    (ก่อนปี ' + CHECK_CUSTOMER_MIN_YEAR + ' หรือเป็นอนาคต)');
    lines.push('    เป็นอาการของเลขซีเรียลของ Excel ที่ถูกอ่านเป็นวันที่');
  }

  lines.push('');
  lines.push('  ตารางนี้ระบบอ่านอย่างเดียว ไม่มีโค้ดที่เขียนลงไปเลย (SPEC 22.8)');
  lines.push('  ต้นทางคือโปรแกรมบัญชี · การแก้ต้องแก้ที่การนำเข้า ไม่ใช่แก้ในฐานข้อมูล');
}

/**
 * ตัวเลขบอกสภาพของข้อมูลลูกค้า — ตรรกะล้วน ไม่แตะเครือข่าย จึงทดสอบได้ตรง ๆ
 *
 * เหตุผลที่ดู "เลขวันเกิน 12" เป็นตัวชี้วัด: ถ้าวันกับเดือนสลับกัน ทุกค่าที่เคยเป็น
 * วันที่ 13–31 จะกลายเป็นเดือนที่ 13–31 ซึ่งไม่มีจริง แถวพวกนั้นจึงนำเข้าไม่ได้
 * หรือถูกตีความใหม่ · ผลคือเหลือแต่แถวที่เลขวันอยู่ในช่วง 1–12 ทั้งตาราง
 * ซึ่งเป็นรูปแบบที่เกิดเองไม่ได้ในข้อมูลจริงที่มีหลายพันแถว
 *
 * @param {Object[]} rows แถวจากตาราง Customer (คีย์เป็นชื่อไทยตามระบบ)
 * @param {string} today วันนี้ในรูป 'yyyy-MM-dd' ตามเวลาไทย
 * @return {Object} ตัวเลขทั้งหมดที่ SPEC 22.8 สั่งให้รายงาน
 */
function customerHealth_(rows, today) {
  var out = {
    total: rows.length,
    noName: 0,
    badCode: 0,
    badCodeSamples: [],
    withDate: 0,
    dayOver12: 0,
    dayOver12Percent: '0.0',
    outOfRange: 0,
    outOfRangeSamples: []
  };

  for (var i = 0; i < rows.length; i++) {
    var code = String(rows[i]['รหัสลูกค้า'] === null || rows[i]['รหัสลูกค้า'] === undefined
      ? '' : rows[i]['รหัสลูกค้า']).trim();
    var name = String(rows[i]['ชื่อลูกค้า'] === null || rows[i]['ชื่อลูกค้า'] === undefined
      ? '' : rows[i]['ชื่อลูกค้า']).trim();
    var date = String(rows[i]['วันที่เริ่มติดต่อ'] === null || rows[i]['วันที่เริ่มติดต่อ'] === undefined
      ? '' : rows[i]['วันที่เริ่มติดต่อ']).trim();

    if (!name) out.noName++;

    if (customerCodeLooksCut_(code)) {
      out.badCode++;
      // ต้องยกตัวอย่างเสมอ เพราะตัวเลขอย่างเดียวบอกไม่ได้ว่าต้องไปแก้อะไรที่ไฟล์ต้นทาง
      if (out.badCodeSamples.length < 5) {
        out.badCodeSamples.push(code === '' ? '(ว่าง)' : ('"' + code + '"'));
      }
    }

    if (!date) continue;
    out.withDate++;

    // PostgREST คืนคอลัมน์ชนิด date เป็น 'YYYY-MM-DD' เสมอ จึงตัดเอาส่วนวันได้ตรง ๆ
    var day = Number(date.substring(8, 10));
    if (day > 12) out.dayOver12++;

    var year = Number(date.substring(0, 4));
    if (year < CHECK_CUSTOMER_MIN_YEAR || date > today) {
      out.outOfRange++;
      if (out.outOfRangeSamples.length < 5) out.outOfRangeSamples.push(code + '=' + date);
    }
  }

  if (out.withDate) {
    out.dayOver12Percent = (out.dayOver12 * 100 / out.withDate).toFixed(1);
  }
  return out;
}

/** รหัสลูกค้าที่ยาวเกินนี้ ไม่ใช่รหัสแล้ว แต่เป็นร่องรอยของช่องที่ถูกรวมกันตอนตัด CSV */
var CUSTOMER_CODE_MAX = 20;

/**
 * รหัสลูกค้านี้มีร่องรอยของ CSV ที่ถูกตัดผิดหรือไม่
 *
 * **ไม่ตรวจรูปแบบของรหัส** เพราะรหัสมาจากโปรแกรมบัญชีและมีหลายรูปแบบที่ถูกต้อง
 * ทั้งคู่ เช่น `AR-0001` กับ `NV0001` · เราไม่รู้ว่ามีกี่แบบ และจะไม่มีวันรู้
 * การตรวจรูปแบบจึงมีแต่จะฟ้องผิดกับรหัสที่ถูกต้องอยู่แล้ว แล้วคนก็จะเลิกอ่านคำเตือน
 *
 * สิ่งที่ตรวจได้โดยไม่ต้องรู้รูปแบบ คืออาการของไฟล์ที่ถูกตัดผิดช่อง ซึ่งเกิดจริงเวลา
 * ค่าในไฟล์มีจุลภาคอยู่ข้างในแล้วไม่ได้ครอบเครื่องหมายคำพูดไว้ · ผลคือช่องเลื่อน
 * แล้วรหัสจะกลายเป็นค่าว่าง หรือมีเศษของช่องถัดไปติดมาด้วย
 *
 * @param {string} code รหัสลูกค้า
 * @return {boolean} true = มีร่องรอยผิดปกติ
 */
function customerCodeLooksCut_(code) {
  var text = String(code);
  if (text.trim() === '') return true;                  // ช่องเลื่อนจนรหัสหายไป
  if (/[\s,"']/.test(text)) return true;                // เศษของช่องถัดไปติดมา
  return text.length > CUSTOMER_CODE_MAX;               // หลายช่องถูกรวมเป็นช่องเดียว
}

/* ===========================================================================
 * สำรวจว่า PostgREST ของจริงตีความตัวกรองแต่ละรูปแบบอย่างไร
 *
 * เครื่องมือนี้เกิดขึ้นเพราะของจำลองในเครื่องถูกสอนตาม "สิ่งที่เราเชื่อว่า PostgREST ทำ"
 * ไม่ใช่ "สิ่งที่สังเกตว่ามันทำ" · ของจำลองแบบนั้นยืนยันได้แค่ว่าเราเข้าใจตรงกับตัวเราเอง
 * ชุดทดสอบจึงเขียวครบในเครื่องทั้งที่ของจริงล้ม
 *
 * ทุกคำขอในไฟล์นี้เป็นการ **อ่านอย่างเดียว** บนตาราง customer · ไม่เขียนอะไรเลย
 * คำตอบที่เป็นความผิดพลาดคือผลลัพธ์ที่ต้องการ ไม่ใช่เหตุขัดข้อง
 * =========================================================================== */

/** ตารางที่ใช้สำรวจ — เลือกตารางที่มีข้อมูลจริงอยู่แล้ว จะได้มีของให้ตัวกรองจับ */
var PROBE_TABLE = 'customer';

/** คอลัมน์ข้อความที่ใช้ทดสอบรูปแบบการค้น */
var PROBE_TEXT_COLUMN = 'customer_name';

/** คอลัมน์คีย์ที่ใช้ทดสอบการเทียบค่าแบบเท่ากันพอดี */
var PROBE_KEY_COLUMN = 'customer_code';

/**
 * ยิงตัวกรองทุกรูปแบบที่ระบบใช้จริงไปที่ Supabase ของจริง แล้วพิมพ์คำตอบทั้งก้อน
 *
 * แต่ละรูปแบบยิงสองครั้ง คือแบบครอบเครื่องหมายคำพูดกับแบบไม่ครอบ เพื่อให้เห็นว่า
 * การครอบทำให้ผลต่างกันหรือไม่ · คู่ที่ผลต่างกันคือคำตอบของคำถามที่ตั้งไว้
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function probeFilters() {
  assertDataAccessAllowed_();

  var lines = ['===== สำรวจการตีความตัวกรองของ PostgREST ของจริง ====='];

  if (!dbIsConfigured_()) {
    Logger.log('ยังไม่ได้ตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_KEY จึงสำรวจไม่ได้');
    return 'ยังตั้งค่าไม่ครบ';
  }

  /* ---------- หาแถวจริงมาหนึ่งแถว เพื่อใช้เป็นตัวควบคุมที่ต้องเจอแน่ ๆ ---------- */
  /*
   * ถ้าไม่มีตัวควบคุม เราจะแยกไม่ออกระหว่าง "ไวยากรณ์ผิดจนไม่เจอ" กับ
   * "ไวยากรณ์ถูกแต่ไม่มีแถวไหนตรงเงื่อนไข" ซึ่งทั้งสองอย่างหน้าตาเหมือนกันเป๊ะ คือ 200 กับ 0 แถว
   */
  /*
   * ขอมาห้าแถวแล้วเลือกแถวที่ชื่อยาวพอ เพราะข้อสำรวจกลุ่ม ง. ใช้ `<เศษชื่อ>_`
   * ซึ่งต้องมีอักขระตัวถัดไปให้ขีดล่างแทน · ชื่อสั้นเกินไปจะทำให้ข้อนั้นไม่มีความหมาย
   */
  var seed = db_probeRaw_('/' + PROBE_TABLE + '?select=' + PROBE_KEY_COLUMN + ',' +
    PROBE_TEXT_COLUMN + '&limit=20');

  var sample = null;
  if (seed.status === 200 && seed.rows > 0) {
    var candidates = JSON.parse(seed.body);
    for (var c = 0; c < candidates.length && !sample; c++) {
      if (String(candidates[c][PROBE_TEXT_COLUMN] || '').length >= 5) sample = candidates[c];
    }
  }

  if (!sample) {
    lines.push('หาแถวตัวควบคุมจากตาราง ' + PROBE_TABLE + ' ไม่ได้ (รหัส ' + seed.status +
      ' · ' + seed.rows + ' แถว)');
    lines.push('ต้องมีแถวที่ชื่อยาวอย่างน้อยห้าตัวอักษร ไม่งั้นแยกไม่ออกว่าตัวกรองไม่ทำงาน หรือไม่มีแถวให้จับ');
    Logger.log(lines.join(NEW_LINE_));
    return 'หาแถวตัวควบคุมไม่ได้ — ดูรายละเอียดใน Execution log';
  }

  var code = String(sample[PROBE_KEY_COLUMN] || '');
  var name = String(sample[PROBE_TEXT_COLUMN] || '');
  var frag = name.substring(0, 3);

  lines.push('แถวตัวควบคุม: รหัส "' + code + '" ชื่อขึ้นต้นด้วย "' + frag + '"');
  lines.push('ทุกข้อที่เขียนว่า "ควรเจอ" ต้องได้อย่างน้อย 1 แถว ถ้าได้ 0 แปลว่าตัวกรองไม่ทำงาน');
  lines.push('');

  var cases = probeCases_(code, frag);
  var results = {};

  for (var i = 0; i < cases.length; i++) {
    var one = cases[i];
    var got = db_probeRaw_(one.path);
    results[one.id] = got;
    probePrint_(lines, one, got);
  }

  probeCompare_(lines, cases, results);

  Logger.log(lines.join(NEW_LINE_));
  return 'สำรวจเสร็จแล้ว — ดูผลใน Execution log';
}

/**
 * รายการตัวกรองที่จะยิง — ทุกแบบที่ 01_Db.gs ประกอบขึ้นจริง บวกคู่เทียบแบบไม่ครอบ
 *
 * `hope` บอกว่าคาดหวังอะไร: 'เจอ' คือต้องได้อย่างน้อยหนึ่งแถว · 'ไม่เจอ' คือ
 * ไวยากรณ์ต้องถูกแต่ไม่มีแถวตรงเงื่อนไข · ทั้งสองอย่างต้องได้รหัส 200 เสมอ
 *
 * @param {string} code รหัสของแถวตัวควบคุม
 * @param {string} frag เศษชื่อของแถวตัวควบคุม
 * @return {Object[]}
 */
function probeCases_(code, frag) {
  var K = PROBE_KEY_COLUMN;
  var T = PROBE_TEXT_COLUMN;

  return [
    /* ---------- ก. ค่าง่าย ๆ ที่ต้องเจอแน่ — ตัวชี้ขาดว่าการครอบทำลายการเทียบหรือไม่ ---------- */
    { id: 'A1', pair: 'A', quoted: false, hope: 'เจอ',
      note: 'eq ค่าง่าย ไม่ครอบ', path: probePath_(K, 'eq.' + code) },
    { id: 'A2', pair: 'A', quoted: true, hope: 'เจอ',
      note: 'eq ค่าง่าย ครอบ',   path: probePath_(K, 'eq."' + code + '"') },

    /* ---------- ข. ค่าที่มีอักขระของไวยากรณ์ปนอยู่ ---------- */
    { id: 'B1', pair: 'B', quoted: false, hope: 'ไม่เจอ',
      note: 'eq ค่ามีจุลภาค ไม่ครอบ', path: probePath_(T, 'eq.บริษัท เอ,บี จำกัด') },
    { id: 'B2', pair: 'B', quoted: true, hope: 'ไม่เจอ',
      note: 'eq ค่ามีจุลภาค ครอบ',   path: probePath_(T, 'eq."บริษัท เอ,บี จำกัด"') },
    { id: 'B3', pair: 'C', quoted: false, hope: 'ไม่เจอ',
      note: 'eq ค่ามีจุด ไม่ครอบ',    path: probePath_(T, 'eq.หจก. เอ.บี.ซี.') },
    { id: 'B4', pair: 'C', quoted: true, hope: 'ไม่เจอ',
      note: 'eq ค่ามีจุด ครอบ',      path: probePath_(T, 'eq."หจก. เอ.บี.ซี."') },

    /* ---------- ค. รูปแบบการค้น — หัวใจของเรื่องนี้ ---------- */
    { id: 'C1', pair: 'D', quoted: false, hope: 'เจอ',
      note: 'like ดอกจัน ไม่ครอบ',  path: probePath_(T, 'like.*' + frag + '*') },
    { id: 'C2', pair: 'D', quoted: true, hope: 'เจอ',
      note: 'like ดอกจัน ครอบ',    path: probePath_(T, 'like."*' + frag + '*"') },
    { id: 'C3', pair: 'E', quoted: false, hope: 'เจอ',
      note: 'ilike ดอกจัน ไม่ครอบ', path: probePath_(T, 'ilike.*' + frag + '*') },
    { id: 'C4', pair: 'E', quoted: true, hope: 'เจอ',
      note: 'ilike ดอกจัน ครอบ',   path: probePath_(T, 'ilike."*' + frag + '*"') },
    { id: 'C5', pair: 'F', quoted: false, hope: 'เจอ',
      note: 'ilike ใช้ % แทนดอกจัน ไม่ครอบ', path: probePath_(T, 'ilike.%' + frag + '%') },
    { id: 'C6', pair: 'F', quoted: true, hope: 'เจอ',
      note: 'ilike ใช้ % แทนดอกจัน ครอบ',   path: probePath_(T, 'ilike."%' + frag + '%"') },

    /* ---------- ง. สัญลักษณ์ของ LIKE — หลีกแล้วต้องหาย ไม่หลีกต้องเจอ ---------- */
    /*
     * สี่ข้อนี้สร้างจากชื่อของแถวตัวควบคุมเอง ความคาดหวังจึงแน่นอนโดยไม่ต้องเดาว่า
     * ในตารางมีลูกค้าชื่ออะไรอยู่บ้าง · `<เศษชื่อ>_` ต้องเจอเพราะขีดล่างแทนอักขระ
     * ตัวถัดไปของชื่อนั้นเอง ส่วน `<เศษชื่อ>\_` ต้องไม่เจอเพราะกลายเป็นขีดล่างตัวจริง
     * คู่นี้จึงบอกตรง ๆ ว่าการหลีกด้วยขีดทับกลับทำงานหรือไม่
     */
    { id: 'D1', pair: 'G', quoted: false, hope: 'เจอ',
      note: 'ilike ขีดล่างไม่หลีก ไม่ครอบ', path: probePath_(T, 'ilike.*' + frag + '_*') },
    { id: 'D2', pair: 'G', quoted: true, hope: 'เจอ',
      note: 'ilike ขีดล่างไม่หลีก ครอบ',   path: probePath_(T, 'ilike."*' + frag + '_*"') },
    { id: 'D3', pair: 'H', quoted: false, hope: 'ไม่เจอ',
      note: 'ilike ขีดล่างหลีกแล้ว ไม่ครอบ', path: probePath_(T, 'ilike.*' + frag + '\\_*') },
    { id: 'D4', pair: 'H', quoted: true, hope: 'ไม่เจอ',
      note: 'ilike ขีดล่างหลีกแล้ว ครอบ (รูปที่โค้ดส่งอยู่ตอนนี้)',
      path: probePath_(T, 'ilike."*' + frag + '\\\\_*"') },
    { id: 'D5', pair: 'I', quoted: false, hope: 'เจอ',
      note: 'ilike เปอร์เซ็นต์ไม่หลีก ไม่ครอบ', path: probePath_(T, 'ilike.*' + frag + '%*') },
    { id: 'D6', pair: 'I', quoted: true, hope: 'เจอ',
      note: 'ilike เปอร์เซ็นต์ไม่หลีก ครอบ',   path: probePath_(T, 'ilike."*' + frag + '%*"') },
    { id: 'D7', pair: 'J', quoted: false, hope: 'ไม่เจอ',
      note: 'ilike เปอร์เซ็นต์หลีกแล้ว ไม่ครอบ', path: probePath_(T, 'ilike.*' + frag + '\\%*') },
    { id: 'D8', pair: 'J', quoted: true, hope: 'ไม่เจอ',
      note: 'ilike เปอร์เซ็นต์หลีกแล้ว ครอบ',   path: probePath_(T, 'ilike."*' + frag + '\\\\%*"') },

    /* ---------- จ. ค่าว่าง ซึ่งเส้นทาง "ไม่มีคำค้น" ใช้อยู่ ---------- */
    { id: 'E1', pair: 'K', quoted: false, hope: 'เจอ',
      note: 'neq ค่าว่าง ไม่ครอบ', path: probePath_(T, 'neq.') },
    { id: 'E2', pair: 'K', quoted: true, hope: 'เจอ',
      note: 'neq ค่าว่าง ครอบ',   path: probePath_(T, 'neq.""') },

    /* ---------- ฉ. การเรียงและการรวมเงื่อนไข ---------- */
    { id: 'F1', pair: '', quoted: false, hope: 'เจอ',
      note: 'order เรียงด้วยคอลัมน์คีย์',
      path: probePath_(K, 'eq.' + code) + '&order=' + PROBE_KEY_COLUMN + '.asc' },
    { id: 'F2', pair: 'L', quoted: false, hope: 'เจอ',
      note: 'or สองเงื่อนไข ไม่ครอบ',
      path: '/' + PROBE_TABLE + '?select=' + PROBE_KEY_COLUMN + '&or=' +
        encodeURIComponent('(' + T + '.ilike.*' + frag + '*,' + K + '.eq.' + code + ')') + '&limit=5' },
    { id: 'F3', pair: 'L', quoted: true, hope: 'เจอ',
      note: 'or สองเงื่อนไข ครอบ',
      path: '/' + PROBE_TABLE + '?select=' + PROBE_KEY_COLUMN + '&or=' +
        encodeURIComponent('(' + T + '.ilike."*' + frag + '*",' + K + '.eq."' + code + '")') + '&limit=5' },

    /* ---------- ช. in ซึ่งโค้ดล้างข้อมูลของชุดทดสอบใช้อยู่ ---------- */
    { id: 'G1', pair: 'M', quoted: false, hope: 'เจอ',
      note: 'in ไม่ครอบ', path: probePath_(K, 'in.(' + code + ')') },
    { id: 'G2', pair: 'M', quoted: true, hope: 'เจอ',
      note: 'in ครอบ',   path: probePath_(K, 'in.("' + code + '")') }
  ];
}

/**
 * ประกอบเส้นทางของคำขอสำรวจ — เข้ารหัสแบบเดียวกับที่ dbFilterParts_ ทำทุกประการ
 * @param {string} column ชื่อคอลัมน์ในฐานข้อมูล
 * @param {string} opValue ตัวดำเนินการกับค่า เช่น 'eq.AR-0001'
 * @return {string}
 */
function probePath_(column, opValue) {
  return '/' + PROBE_TABLE + '?select=' + PROBE_KEY_COLUMN + '&' +
    encodeURIComponent(column) + '=' + encodeURIComponent(opValue) + '&limit=5';
}

/**
 * พิมพ์ผลของการสำรวจหนึ่งข้อ — ทั้งคำขอที่ส่งไปจริงและคำตอบทั้งก้อน
 *
 * ที่อยู่ของโปรเจกต์ถูกตัดออก เหลือแต่เส้นทาง เพราะส่วนที่ตัดออกคือส่วนที่เป็นความลับ
 * ส่วนคีย์อยู่ในหัวคำขอ ไม่เคยอยู่ในเส้นทาง จึงไม่มีทางหลุดมาทางนี้อยู่แล้ว
 *
 * @param {string[]} lines บรรทัดรายงาน
 * @param {Object} one ข้อที่สำรวจ
 * @param {Object} got ผลที่ได้
 */
function probePrint_(lines, one, got) {
  lines.push('[' + one.id + '] ' + one.note + ' — ควร' + one.hope);
  lines.push('   ส่ง ' + decodeURIComponent(one.path));

  if (got.status === 200) {
    var verdict = (one.hope === 'เจอ')
      ? (got.rows > 0 ? 'ตรงตามที่ควร' : '<<< ไม่เจอทั้งที่ควรเจอ')
      : (got.rows === 0 ? 'ตรงตามที่ควร' : '<<< เจอทั้งที่ไม่ควรเจอ');
    lines.push('   ได้ 200 · ' + got.rows + ' แถว · ' + verdict);
    return;
  }

  lines.push('   ได้ ' + got.status + ' · code=' + (got.code || '-') +
    ' · ' + probeCut_(got.message));
  if (got.hint)    lines.push('       hint: ' + probeCut_(got.hint));
  if (got.details) lines.push('       details: ' + probeCut_(got.details));
}

/** ตัดข้อความยาวให้พอดีกับ Execution log ซึ่งตัดทิ้งเมื่อเกินราวหนึ่งหมื่นสามพันไบต์ */
function probeCut_(text) {
  var value = String(text || '');
  return (value.length > 160) ? value.substring(0, 160) + '…' : value;
}

/**
 * สรุปว่าการครอบเครื่องหมายคำพูดทำให้ผลต่างกันตรงไหนบ้าง
 *
 * นี่เป็นการเทียบล้วน ๆ ไม่ใช่การตีความ · รายการที่ออกมาคือคู่ที่ "ส่งค่าเดียวกัน
 * ต่างกันแค่การครอบ แล้วได้คำตอบคนละอย่าง" ซึ่งเป็นสิ่งที่ต้องเอาไปสอนของจำลอง
 *
 * @param {string[]} lines บรรทัดรายงาน
 * @param {Object[]} cases ข้อที่สำรวจทั้งหมด
 * @param {Object} results ผลของแต่ละข้อ
 */
function probeCompare_(lines, cases, results) {
  lines.push('');
  lines.push('----- คู่ที่ต่างกันเพราะการครอบเครื่องหมายคำพูด -----');

  var pairs = {};
  for (var i = 0; i < cases.length; i++) {
    if (!cases[i].pair) continue;
    if (!pairs[cases[i].pair]) pairs[cases[i].pair] = {};
    pairs[cases[i].pair][cases[i].quoted ? 'quoted' : 'plain'] = cases[i];
  }

  var differences = 0;
  for (var key in pairs) {
    if (!Object.prototype.hasOwnProperty.call(pairs, key)) continue;
    var plain = pairs[key].plain;
    var quoted = pairs[key].quoted;
    if (!plain || !quoted) continue;

    var a = results[plain.id];
    var b = results[quoted.id];
    if (a.status === b.status && a.rows === b.rows) continue;

    differences++;
    lines.push(plain.note.replace(' ไม่ครอบ', '') + ':  ไม่ครอบ = ' + probeShort_(a) +
      '   ครอบ = ' + probeShort_(b));
  }

  if (!differences) {
    lines.push('ไม่มีคู่ไหนต่างกันเลย — การครอบไม่ใช่ต้นเหตุ ต้องหาที่อื่นต่อ');
  }
}

/** ผลของหนึ่งข้อในรูปสั้นที่สุดที่ยังบอกความต่างได้ */
function probeShort_(got) {
  return (got.status === 200) ? (got.rows + ' แถว') : (got.status + '/' + (got.code || '-'));
}

/* ===========================================================================
 * เก็บกวาดแถวทดสอบที่ค้างอยู่ในตารางจริง
 * =========================================================================== */

/** ตารางจริงที่ชุดทดสอบเคยเขียนลงไป พร้อมคอลัมน์คีย์ของแต่ละตาราง */
var LEFTOVER_TARGETS = Object.freeze([
  { table: 'request_type', column: 'request_id' },
  { table: 'report_master', column: 'report_code' },
  { table: 'counter',      column: 'key' }
]);

/** คำนำหน้าของข้อมูลทดสอบทั้งระบบ */
var LEFTOVER_PREFIX = 'TEST-';

/**
 * หาและลบแถวทดสอบที่ค้างอยู่ในตารางที่ระบบใช้งานจริง
 *
 * **จงใจไม่เรียกผ่าน db_delete_** · เมื่อชั้นประกอบตัวกรองเป็นสิ่งที่กำลังถูกสงสัย
 * เครื่องมือเก็บกวาดต้องไม่พึ่งมัน ไม่งั้นความล้มเหลวแบบเดียวกันจะทำให้เครื่องมือนี้
 * รายงานว่า "ไม่มีอะไรค้าง" ทั้งที่มีอยู่เต็มตาราง · ที่นี่จึงเขียนเส้นทางเองตรง ๆ
 * แล้วยิงผ่าน db_probeRaw_ ซึ่งไม่แปลความอะไรเลย
 *
 * ทำสองขั้นเสมอ คือนับก่อนแล้วค่อยลบ แล้วรายงานสองตัวเลขเทียบกัน
 * การลบที่ลบได้ศูนย์แถวทั้งที่มีของอยู่ คือความล้มเหลวแบบเงียบที่อันตรายที่สุด
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function cleanLeftoverTestRows() {
  assertDataAccessAllowed_();

  var lines = ['===== เก็บกวาดแถวทดสอบที่ค้างในตารางจริง ====='];
  var stillThere = 0;

  for (var i = 0; i < LEFTOVER_TARGETS.length; i++) {
    var target = LEFTOVER_TARGETS[i];
    var where = encodeURIComponent(target.column) + '=' +
      encodeURIComponent('like.' + LEFTOVER_PREFIX + '*');

    var found = db_probeRaw_('/' + target.table + '?select=' + target.column + '&' + where);
    if (found.status !== 200) {
      lines.push(target.table + ': อ่านไม่ได้ — ' + found.status + ' ' +
        (found.code || '') + ' ' + probeCut_(found.message));
      stillThere++;
      continue;
    }

    if (found.rows === 0) {
      lines.push(target.table + ': ไม่มีแถวทดสอบค้างอยู่');
      continue;
    }

    var removed = db_probeRaw_('/' + target.table + '?' + where, 'delete');
    var after = db_probeRaw_('/' + target.table + '?select=' + target.column + '&' + where);

    lines.push(target.table + ': พบ ' + found.rows + ' แถว · ลบได้ ' +
      (removed.status === 200 ? removed.rows : 'ล้มเหลว (' + removed.status + ')') +
      ' · เหลือ ' + (after.status === 200 ? after.rows : '?'));

    if (after.status !== 200 || after.rows !== 0) {
      stillThere++;
      lines.push('   <<< ยังเหลืออยู่ ต้องตามเก็บด้วยมือ เพราะหน้าเว็บอ่านตารางนี้ไปใช้จริง');
      if (removed.message) lines.push('   ' + probeCut_(removed.message));
    }
  }

  lines.push('');
  lines.push(stillThere ? 'ยังมี ' + stillThere + ' ตารางที่ไม่สะอาด'
    : 'ทุกตารางสะอาดแล้ว');

  Logger.log(lines.join(NEW_LINE_));
  return stillThere ? 'ยังเก็บไม่หมด — ดูรายละเอียดใน Execution log'
    : 'เก็บกวาดเรียบร้อย — ดูรายละเอียดใน Execution log';
}

/* ===========================================================================
 * วัดเพดานความยาว URL ของจริง (กฎข้อ 29)
 *
 * ตัวเลขเพดานที่ใช้อยู่ตอนนี้เป็นค่าตั้งไว้ก่อน ไม่ได้มาจากการวัด · เครื่องมือนี้
 * มีไว้หาค่าจริง แล้วเอาไปแก้ HTTP_MAX_URL_LENGTH กับของจำลองให้ตรงกัน
 *
 * ทุกคำขอเป็นการอ่านอย่างเดียวบนตาราง customer ด้วยตัวกรองที่ไม่ตรงแถวไหนเลย
 * จึงไม่แตะข้อมูลและไม่สร้างภาระให้ฝั่งโน้น
 * =========================================================================== */

/** ช่วงความยาวที่ไล่หา — ต่ำสุดที่เชื่อว่าผ่านแน่ ถึงสูงสุดที่เชื่อว่าไม่ผ่านแน่ */
var PROBE_URL_MIN = 500;
var PROBE_URL_MAX = 20000;

/** จำนวนครั้งสูงสุดที่ยอมยิง — การค้นแบบแบ่งครึ่งใช้ราว 15 ครั้งก็พอสำหรับช่วงนี้ */
var PROBE_URL_STEPS = 16;

/**
 * หาเพดานความยาว URL ที่ยิงออกไปได้จริง แล้วพิมพ์ผลลง Execution log
 *
 * ใช้การค้นแบบแบ่งครึ่ง · "ผ่าน" คือได้คำตอบกลับมาไม่ว่ารหัสอะไร แม้แต่ 400
 * เพราะนั่นแปลว่าคำขอเดินทางออกไปถึงปลายทางแล้ว · "ไม่ผ่าน" คือ UrlFetchApp
 * โยนทิ้งตั้งแต่ยังไม่ได้ออกไป ซึ่งเป็นเพดานที่เรากำลังหา
 *
 * @return {string} ข้อความสั้น ๆ บอกว่าให้ไปอ่านผลที่ไหน
 */
function probeUrlLimit() {
  assertDataAccessAllowed_();

  var lines = ['===== วัดเพดานความยาว URL ที่ยิงออกไปได้จริง ====='];

  if (!dbIsConfigured_()) {
    Logger.log('ยังไม่ได้ตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_KEY จึงวัดไม่ได้');
    return 'ยังตั้งค่าไม่ครบ';
  }

  var low = PROBE_URL_MIN;     // ยาวเท่านี้แล้วยังผ่าน
  var high = PROBE_URL_MAX;    // ยาวเท่านี้แล้วไม่ผ่าน
  var checked = [];

  if (!urlLengthWorks_(low, lines)) {
    lines.push('ความยาวต่ำสุดที่ลอง (' + low + ') ก็ยังไม่ผ่าน — ช่วงที่ตั้งไว้ผิด');
    Logger.log(lines.join(NEW_LINE_));
    return 'ช่วงที่ตั้งไว้ผิด — ดูรายละเอียดใน Execution log';
  }
  if (urlLengthWorks_(high, lines)) {
    lines.push('ความยาวสูงสุดที่ลอง (' + high + ') ยังผ่าน — ไม่มีเพดานในช่วงนี้');
    Logger.log(lines.join(NEW_LINE_));
    return 'ไม่พบเพดานในช่วงที่ลอง — ดูรายละเอียดใน Execution log';
  }

  for (var step = 0; step < PROBE_URL_STEPS && (high - low) > 1; step++) {
    var middle = Math.floor((low + high) / 2);
    var works = urlLengthWorks_(middle, lines);
    checked.push(middle + (works ? ' ผ่าน' : ' ไม่ผ่าน'));
    if (works) low = middle; else high = middle;
  }

  lines.push('');
  lines.push('ไล่หา: ' + checked.join(' · '));
  lines.push('');
  lines.push('ยาวที่สุดที่ยังผ่าน  : ' + low + ' ตัวอักษร');
  lines.push('สั้นที่สุดที่ไม่ผ่าน : ' + high + ' ตัวอักษร');
  lines.push('');
  lines.push('ค่าที่ใช้อยู่ใน HTTP_MAX_URL_LENGTH: ' + HTTP_MAX_URL_LENGTH);
  lines.push(HTTP_MAX_URL_LENGTH <= low
    ? 'ค่าที่ตั้งไว้ยังปลอดภัย (ต่ำกว่าหรือเท่ากับเพดานจริง)'
    : '<<< ค่าที่ตั้งไว้สูงเกินเพดานจริง ต้องลดลงมา ไม่งั้นด่านจะปล่อยคำขอที่ยิงไม่ออกผ่านไป');

  Logger.log(lines.join(NEW_LINE_));
  return 'วัดเสร็จแล้ว — ดูผลใน Execution log';
}

/**
 * ยิงคำขอที่ URL ยาวเท่าที่กำหนด แล้วบอกว่าออกไปถึงปลายทางหรือไม่
 *
 * ต้องข้ามด่านวัดความยาวของเราเอง เพราะสิ่งที่กำลังวัดคือด่านของ Apps Script
 * ไม่ใช่ด่านของเรา · นี่เป็นที่เดียวในระบบที่ข้ามด่านนั้นได้
 *
 * @param {number} length ความยาว URL ที่ต้องการ
 * @param {string[]} lines บรรทัดรายงาน
 * @return {boolean} true = คำขอออกไปถึงปลายทางแล้ว
 */
function urlLengthWorks_(length, lines) {
  var got = db_probeRaw_(paddedProbePath_(length), 'get', true);

  // ต่อไม่ติดจริง ๆ กับยาวเกินจนยิงไม่ออก ต้องแยกออกจากกัน ไม่งั้นวัดได้ตัวเลขที่ผิด
  if (got.status === 0 && String(got.message).indexOf('URL Length') === -1 &&
      String(got.message).indexOf('Limit Exceeded') === -1) {
    lines.push('!! ที่ความยาว ' + length + ' ต่อไม่ติดด้วยเหตุอื่น: ' + probeCut_(got.message));
  }
  return got.status !== 0;
}

/**
 * ประกอบเส้นทางอ่านที่ไม่ตรงแถวไหนเลย แล้วเติมให้ยาวเท่าที่ต้องการพอดี
 *
 * เติมด้วยค่าใน in.(...) เพราะนั่นคือรูปแบบเดียวกับตัวกรองที่ทำให้เกิดปัญหาจริง
 * การวัดด้วยรูปแบบอื่นอาจได้ตัวเลขที่ไม่ตรงกับของที่เราต้องกัน
 *
 * @param {number} length ความยาวรวมของ URL ที่ต้องการ
 * @return {string} เส้นทางหลัง /rest/v1
 */
function paddedProbePath_(length) {
  var head = '/' + PROBE_TABLE + '?select=' + PROBE_KEY_COLUMN + '&limit=1&' +
    PROBE_KEY_COLUMN + '=' + encodeURIComponent('in.(');
  var tail = encodeURIComponent(')');
  var fixed = dbBaseUrl_().length + '/rest/v1'.length + head.length + tail.length;

  var filler = '';
  // ค่าที่ไม่มีทางตรงกับรหัสลูกค้าจริง และไม่มีอักขระที่ต้องเข้ารหัสให้ความยาวเพี้ยน
  while (fixed + filler.length < length) filler += 'ZZZZZZZZZ,';
  filler = filler.substring(0, Math.max(0, length - fixed));

  return head + filler + tail;
}

/**
 * สภาพการสำรองข้อมูล — หัวข้อที่ 8 ของ checkSupabase (SPEC 22.6)
 *
 * ต้องอยู่ในเครื่องมือตรวจประจำด้วยเหตุผลเดียวกับหัวข้อที่ 7 · การสำรองที่หยุด
 * ทำงานไปเงียบ ๆ จะไม่มีอาการอะไรให้เห็นเลย จนถึงวันที่ต้องใช้สำเนาแล้วไม่มี
 * ซึ่งเป็นวันที่สายเกินกว่าจะทำอะไรได้แล้ว
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 */
function checkBackupSection_(lines) {
  lines.push('');
  lines.push('########## 7. การสำรองข้อมูลลง Drive ##########');

  try {
    checkBackupReport_(lines);
  } catch (e) {
    lines.push('ตรวจไม่ได้: ' + (e && e.message));
  }
}

/* ---------------------------------------------------------------------------
 * ส่วนที่ 9 — ไฟล์ SQL ถูกรันไปแล้วหรือยัง และเป็นเวอร์ชันไหน
 * --------------------------------------------------------------------------- */

/**
 * ไฟล์ SQL ทุกไฟล์ เรียงตามลำดับที่ต้องรัน พร้อมเวอร์ชันที่โค้ดชุดนี้ต้องการ
 *
 * **เวอร์ชันต้องมาจากฟังก์ชันในฐานข้อมูล ไม่ใช่จากคอมเมนต์ในไฟล์** คอมเมนต์
 * บอกได้แค่ว่าไฟล์ที่เปิดอยู่ตรงหน้าเป็นเวอร์ชันอะไร ซึ่งไม่ใช่คำถาม · คำถามคือ
 * "ของที่อยู่ในฐานข้อมูลตอนนี้มาจากไฟล์เวอร์ชันไหน" และมีแค่สิ่งที่อ่านกลับ
 * จากฐานข้อมูลได้เท่านั้นที่ตอบได้
 *
 * ทุกครั้งที่แก้ไฟล์ SQL ต้องขยับเวอร์ชันสองที่ให้ตรงกัน: ในไฟล์นั้น และในรายการนี้
 * ถ้าลืมที่ใดที่หนึ่ง รายงานจะฟ้องทันทีว่าไม่ตรง ซึ่งเป็นการลืมที่ดังกว่าการลืมรันไฟล์
 *
 * `required` แยก "ไฟล์โครงสร้างที่ระบบทำงานไม่ได้ถ้าขาด" ออกจาก "ไฟล์นำข้อมูลเข้า
 * ที่รันเมื่อจำเป็น" · ถ้าฟ้องเหมือนกันหมด คนจะเห็นเครื่องหมายตกใจทุกครั้งที่เปิดดู
 * แล้วเลิกอ่านทั้งรายงาน
 */
var SQL_FILES = Object.freeze([
  Object.freeze({ file: 'supabase_schema.sql', fn: 'sql_version_schema',
    version: 'schema-2026-09-26-b', required: true,
    note: 'ตาราง index และฟังก์ชันพื้นฐาน',
    creates: Object.freeze([
      Object.freeze({ kind: 'tables',    name: 'work_order' }),
      Object.freeze({ kind: 'functions', name: 'next_running_number' })
    ]) }),
  Object.freeze({ file: 'supabase_grants.sql', fn: 'sql_version_grants',
    version: 'grants-2026-09-26-a', required: true,
    note: 'สิทธิ์ service_role และการปิดประตู anon',
    /*
     * ไฟล์นี้ให้สิทธิ์อย่างเดียว ไม่ได้สร้างของที่มีชื่อให้ตรวจ · จึงบอกไม่ได้เลยว่า
     * เคยรันหรือยังจนกว่าจะมีเวอร์ชันบันทึกไว้ · ต้องพูดออกมาตรง ๆ ว่าตรวจไม่ได้
     * ไม่ใช่ฟ้องว่า "ยังไม่ได้รัน" ซึ่งเป็นคนละเรื่องและทำให้คนไล่หาผิดทาง
     */
    creates: Object.freeze([]) }),
  Object.freeze({ file: 'supabase_batch1.sql', fn: 'sql_version_batch1',
    version: 'batch1-2026-09-26-a', required: true,
    note: 'ขอบเขตวันการทำงาน และวันเวลาเข้างานของแผนก',
    creates: Object.freeze([
      Object.freeze({ kind: 'functions', name: 'due_date' }),
      Object.freeze({ kind: 'indexes',   name: 'idx_wo_due' })
    ]) }),
  Object.freeze({ file: 'supabase_dashboard.sql', fn: 'sql_version_dashboard',
    version: 'dashboard-2026-09-26-b', required: true,
    note: 'ยอดหน้าแรกทั้งชุด — ต้องรันหลัง batch1',
    creates: Object.freeze([
      Object.freeze({ kind: 'functions', name: 'dashboard_summary' }),
      Object.freeze({ kind: 'indexes',   name: 'idx_wo_closed_at' })
    ]) }),
  Object.freeze({ file: 'supabase_batch2.sql', fn: 'sql_version_batch2',
    version: 'batch2-2026-09-26-c', required: true,
    note: 'ตัวนับงานของแผนกบนเมนูย่อย — ขาดแล้วทุกหน้าของแผนกเปิดไม่ได้',
    creates: Object.freeze([
      Object.freeze({ kind: 'functions', name: 'department_task_counts' })
    ]) }),
  Object.freeze({ file: 'supabase_batch3.sql', fn: 'sql_version_batch3',
    version: 'batch3-2026-09-26-a', required: true,
    note: 'เปิดงานซ้ำ และวันที่ปิดงาน — ขาดแล้วสร้างใบงานไม่ได้',
    creates: Object.freeze([
      Object.freeze({ kind: 'functions', name: 'sql_version_batch3' })
    ]) }),
  Object.freeze({ file: 'supabase_customer_import.sql', fn: 'sql_version_customer_import',
    version: 'customer_import-2026-09-26-a', required: false,
    note: 'นำเข้าข้อมูลลูกค้า รันเมื่อมีไฟล์ชุดใหม่',
    creates: Object.freeze([
      Object.freeze({ kind: 'tables', name: 'customer_import' })
    ]) }),
  Object.freeze({ file: 'supabase_test_bulk.sql', fn: 'sql_version_test_bulk',
    version: 'test_bulk-2026-09-26-a', required: false,
    note: 'ข้อมูลทดสอบจำนวนมาก',
    creates: Object.freeze([
      Object.freeze({ kind: 'tables', name: '_test_bulk' })
    ]) })
]);

/**
 * ไฟล์นี้เคยถูกรันไปแล้วหรือไม่ ดูจากของที่มันสร้างไว้ในฐานข้อมูล
 *
 * **นี่คือสิ่งที่แยก "ยังไม่ได้รัน" ออกจาก "รันไปก่อนมีระบบเวอร์ชัน" ได้** (กฎข้อ 32)
 *
 * ทั้งสองกรณีหน้าตาเหมือนกันทุกประการเมื่อดูแต่เวอร์ชัน คือไม่มีเวอร์ชันบันทึกไว้
 * แต่ต้องทำคนละอย่าง — อย่างแรกคือรันไฟล์จริง อีกอย่างคือรันซ้ำเพื่อบันทึกเวอร์ชัน
 * เฉย ๆ · ถ้าบอกเหมือนกัน คนจะรันไฟล์นำเข้าข้อมูลซ้ำโดยไม่จำเป็น หรือเลวร้ายกว่านั้น
 * คือเลิกอ่านรายงานทั้งฉบับเพราะมันฟ้องเรื่องที่ทำไปแล้ว
 *
 * @param {Object} one รายการหนึ่งใน SQL_FILES
 * @param {Object} objects ของในฐานข้อมูลจาก db_objects()
 * @return {string} 'YES' มีของครบ · 'NO' ไม่มีเลย · 'UNKNOWN' ไม่มีของให้ตรวจ
 */
function sqlFileEvidence_(one, objects) {
  var wanted = one.creates || [];
  if (!wanted.length) return 'UNKNOWN';

  for (var i = 0; i < wanted.length; i++) {
    var have = objects[wanted[i].kind];
    /* ฐานข้อมูลไม่ได้ส่งรายการชนิดนี้มา แปลว่า db_objects() เป็นฉบับเก่า ตรวจไม่ได้ */
    if (!have) return 'UNKNOWN';
    var found = false;
    for (var h = 0; h < have.length; h++) {
      if (String(have[h]) === wanted[i].name) found = true;
    }
    if (!found) return 'NO';
  }
  return 'YES';
}

/**
 * ไฟล์ SQL ไหนถูกรันไปแล้ว และเป็นเวอร์ชันตรงกับโค้ดชุดนี้หรือไม่
 *
 * **ข้อนี้มีขึ้นเพราะการส่งงานว่า "ไปรันไฟล์นี้" ล้มเหลวเงียบ ๆ มาแล้วสองรอบ**
 *
 * มันล้มได้หลายทางโดยหน้าตาเหมือนกันหมด — เปิดแท็บเก่าค้างไว้แล้วรันของเก่า ·
 * รันไปครึ่งไฟล์แล้วติดข้อผิดพลาดแต่ส่วนต้นผ่านไปแล้ว · หรือรันไฟล์หนึ่งแล้ว
 * ลืมอีกไฟล์ · ทุกกรณีจบลงเหมือนกันคือระบบทำงานได้เกือบหมด แล้วมีมุมเดียว
 * ที่ผิดโดยไม่มีอะไรฟ้อง และไม่มีใครย้อนไปรู้ได้ว่าเวอร์ชันไหนถูกรันไปจริง
 *
 * ข้อนี้อยู่ก่อนข้อ 9 โดยตั้งใจ เพราะถ้าไฟล์ยังไม่ได้รัน ทุกอย่างที่ข้อ 9 ฟ้อง
 * เป็นแค่ผลพลอยได้ของเรื่องเดียวกัน · คนอ่านควรเห็นต้นเหตุก่อนเห็นอาการ
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @return {Object} ของในฐานข้อมูลจาก db_objects() หรือ {} ถ้าอ่านไม่ได้
 */
function checkSqlVersions_(lines) {
  lines.push('');
  lines.push('########## 8. ไฟล์ SQL ถูกรันครบหรือยัง ##########');

  var objects;
  try {
    objects = db_rpc_('db_objects', {});
  } catch (e) {
    lines.push('  !! เรียก db_objects() ไม่ได้ (รหัส ' + db_lastFailure_().status + ')');
    lines.push('  แปลว่ายังไม่ได้รัน supabase_schema.sql ฉบับที่มีระบบบอกเวอร์ชัน');
    lines.push('  จนกว่าจะรัน จะยังไม่มีทางรู้ว่าไฟล์ไหนถูกรันไปแล้วบ้าง — ให้รันทั้งสี่ไฟล์');
    lines.push('  ตามลำดับ: schema → grants → batch1 → dashboard');
    return {};
  }

  if (objects instanceof Array) objects = objects.length ? objects[0] : {};
  objects = objects || {};
  var versions = objects.versions || {};

  var stale = [];
  var rerun = [];
  // ไฟล์ที่ฐานข้อมูลนำหน้าโค้ดอยู่ — ห้ามปนกับรายการที่ต้องรันใหม่ เพราะทางแก้ตรงกันข้าม
  var ahead = [];

  for (var i = 0; i < SQL_FILES.length; i++) {
    var one = SQL_FILES[i];
    var got = versions[one.fn];
    var mark = one.required ? '!!' : '--';
    var label = '  ' + checkDbPad_(one.file, 30) + ' → ';

    /* ---------- มีเวอร์ชันบันทึกไว้แล้ว เทียบตรง ๆ ได้เลย ---------- */
    if (typeof got !== 'undefined' && got !== null) {
      if (String(got) === one.version) {
        lines.push(label + one.version);
      } else if (String(got) > one.version) {
        /*
         * ฐานข้อมูลใหม่กว่าโค้ด — อันตรายกว่าการลืมรันไฟล์ (SPEC 22.9)
         *
         * เกิดตอนย้อนโค้ดกลับไปเวอร์ชันก่อนโดยที่ฐานข้อมูลยังเป็นของใหม่ ·
         * ทุกอย่างดูปกติทุกประการจนกว่าจะเจอฟิลด์หรือฟังก์ชันที่โค้ดเก่าไม่รู้จัก
         * แล้วตอนนั้นจะไล่หาสาเหตุผิดทาง เพราะฐานข้อมูล "ครบ" กว่าที่โค้ดต้องการ
         *
         * เทียบเป็นข้อความได้ เพราะรูปแบบเวอร์ชันคือ ชื่อไฟล์-ปปปป-ดด-วว-ตัวอักษร
         * ซึ่งเรียงตามเวลาแบบข้อความได้ถูกต้องอยู่แล้ว
         */
        lines.push(label + mark + ' ฐานข้อมูลใหม่กว่าโค้ด — ในฐานเป็น ' + got +
          ' แต่โค้ดชุดนี้เขียนไว้สำหรับ ' + one.version);
        ahead.push(one.file);
      } else {
        lines.push(label + mark + ' รันไปเป็นเวอร์ชันเก่า ' + got +
          ' แต่โค้ดต้องการ ' + one.version);
        if (one.required) stale.push(one.file);
      }
      continue;
    }

    /* ---------- ไม่มีเวอร์ชัน — ต้องแยกให้ออกว่าเพราะอะไร (กฎข้อ 32) ---------- */
    var evidence = sqlFileEvidence_(one, objects);

    if (evidence === 'YES') {
      /*
       * ของที่ไฟล์นี้สร้างมีอยู่จริง แต่ไม่มีเวอร์ชัน = รันไปก่อนที่ระบบเวอร์ชันจะมี
       * ไม่ใช่เรื่องผิดและไม่ต้องรีบ · รันซ้ำเมื่อไรก็ได้เพื่อบันทึกเวอร์ชันลงไป
       */
      lines.push(label + '-- รันไปแล้วก่อนมีระบบเวอร์ชัน (พบ ' +
        sqlFileEvidenceText_(one) + ') · รันซ้ำเพื่อบันทึกเวอร์ชัน');
      rerun.push(one.file);
    } else if (evidence === 'UNKNOWN') {
      /*
       * บอกได้แค่ว่าตรวจไม่ได้ ห้ามเดาว่ายังไม่ได้รัน · สองอย่างนี้แก้คนละทาง
       * และการเดาผิดทำให้คนไปรันไฟล์นำเข้าข้อมูลซ้ำโดยไม่จำเป็น
       */
      lines.push(label + '-- บอกไม่ได้ว่าเคยรันหรือยัง — ไม่มีของที่ตรวจได้ (' + one.note +
        ') · รันซ้ำเพื่อบันทึกเวอร์ชัน');
      rerun.push(one.file);
    } else {
      lines.push(label + mark + ' ยังไม่ได้รัน (' + one.note + ')');
      if (one.required) stale.push(one.file);
    }
  }

  /*
   * ฟังก์ชันเวอร์ชันที่ฐานข้อมูลมี แต่โค้ดไม่รู้จัก · เกิดได้ตอนย้อนโค้ดกลับไป
   * เวอร์ชันเก่าแล้วฐานข้อมูลยังเป็นของใหม่อยู่ ซึ่งอันตรายกว่าการขาดไฟล์
   * เพราะโค้ดเก่าจะเขียนข้อมูลลงโครงสร้างใหม่โดยไม่รู้ว่ามีอะไรเปลี่ยนไปบ้าง
   */
  var unknown = [];
  for (var name in versions) {
    if (!versions.hasOwnProperty(name)) continue;
    var known = false;
    for (var k = 0; k < SQL_FILES.length; k++) if (SQL_FILES[k].fn === name) known = true;
    if (!known) unknown.push(name + ' = ' + versions[name]);
  }
  if (unknown.length) {
    lines.push('  !! ฐานข้อมูลมีเวอร์ชันที่โค้ดชุดนี้ไม่รู้จัก: ' + unknown.join(', '));
    lines.push('     น่าจะเป็นการย้อนโค้ดกลับไปเวอร์ชันเก่าโดยที่ฐานข้อมูลยังเป็นของใหม่');
  }

  lines.push('');
  if (stale.length) {
    lines.push('  !! ต้องรันใหม่ ' + stale.length + ' ไฟล์: ' + stale.join(', '));
    lines.push('  คัดลอกจากไฟล์ในโปรเจกต์ อย่ารันจากแท็บที่เปิดค้างไว้ใน SQL Editor');
    lines.push('  เพราะแท็บที่เปิดค้างคือสาเหตุที่รายงานนี้ต้องมีตั้งแต่แรก');
  } else if (!ahead.length) {
    lines.push('  สรุป: ไฟล์ที่จำเป็นถูกรันครบและเป็นเวอร์ชันตรงกับโค้ดชุดนี้');
  }

  /*
   * ฐานข้อมูลใหม่กว่าโค้ด — ทางแก้ตรงข้ามกับ "ต้องรันใหม่" จึงห้ามอยู่ในรายการเดียวกัน
   *
   * ที่นี่ต้องไม่บอกให้รันไฟล์ทับ เพราะการรันไฟล์รุ่นเก่าทับของใหม่คือการถอยฐานข้อมูล
   * กลับไป ซึ่งทำให้ของที่โค้ดรุ่นใหม่พึ่งอยู่หายไปทั้งชุด · ทางแก้คือเอาโค้ดขึ้นให้ตรง
   */
  if (ahead.length) {
    lines.push('  !! ฐานข้อมูลนำหน้าโค้ดอยู่ ' + ahead.length + ' ไฟล์: ' + ahead.join(', '));
    lines.push('  **ห้ามรันไฟล์เหล่านี้ทับ** การรันฉบับเก่าทับของใหม่คือการถอยฐานข้อมูลกลับ');
    lines.push('  ให้ push โค้ดชุดล่าสุดขึ้นไปแทน หรือตรวจว่ากำลังชี้ไปที่ฐานข้อมูลถูกตัวหรือไม่');
  }

  /*
   * รายการที่รอบันทึกเวอร์ชัน แยกออกจากรายการที่ต้องรีบทำ เพราะสองอย่างนี้เร่งไม่เท่ากัน
   * ของที่ขาดทำให้ระบบทำงานไม่ได้ ส่วนเวอร์ชันที่หายไปแค่ทำให้ครั้งต่อไปตอบไม่ได้ว่ารันอะไรไปแล้ว
   */
  if (rerun.length) {
    lines.push('  รันซ้ำเมื่อสะดวกเพื่อบันทึกเวอร์ชัน ' + rerun.length + ' ไฟล์: ' + rerun.join(', '));
    lines.push('  ไฟล์เหล่านี้ทำงานอยู่แล้ว ไม่มีอะไรพัง — ขาดแต่บรรทัดที่บอกว่าเป็นเวอร์ชันไหน');
  }

  return objects;
}

/**
 * ชื่อของที่ใช้เป็นหลักฐานว่าไฟล์นี้เคยรัน — สำหรับพิมพ์ให้คนอ่าน
 *
 * บอกด้วยว่าตัดสินจากอะไร ไม่ใช่บอกแต่ข้อสรุป เพราะคนที่อ่านต้องตรวจต่อเองได้
 * ว่าสิ่งที่รายงานอ้างถึงมีอยู่จริง ไม่ใช่เชื่อตามรายงานอย่างเดียว
 *
 * @param {Object} one รายการหนึ่งใน SQL_FILES
 * @return {string}
 */
function sqlFileEvidenceText_(one) {
  var parts = [];
  for (var i = 0; i < (one.creates || []).length; i++) parts.push(one.creates[i].name);
  return parts.join(' และ ');
}

/**
 * คอลัมน์ที่งานปรับปรุงกองที่ 1 เพิ่มเข้ามา พร้อมไฟล์ที่ต้องรันเพื่อให้มันเกิดขึ้น
 *
 * ประกาศไว้ที่นี่ ไม่ใช่เดาจาก DB_COLUMNS ทั้งก้อน เพราะคำถามที่ต้องตอบคือ
 * "รันไฟล์นั้นแล้วหรือยัง" ไม่ใช่ "ตารางมีกี่คอลัมน์" · รายการสั้นที่ชี้ไปยังไฟล์เดียว
 * ทำให้คนที่เห็นรายงานรู้ทันทีว่าต้องไปทำอะไร ไม่ใช่ต้องมาไล่เทียบเอง
 */
var CHECK_NEW_COLUMNS = Object.freeze([
  Object.freeze({ table: 'WorkOrder',      column: 'Duration_Days' }),
  Object.freeze({ table: 'Department_Task', column: 'Visit_Start' }),
  Object.freeze({ table: 'Department_Task', column: 'Visit_End' }),
  Object.freeze({ table: 'WorkOrder',      column: 'Reopen_Count' }),
  Object.freeze({ table: 'WorkOrder',      column: 'Closed_Date' })
]);

/**
 * index ทุกตัวที่คำสั่งอ่านของระบบนี้พึ่ง พร้อมไฟล์ที่สร้างมันและงานที่มันรับ
 *
 * ต้องเขียนว่า index ตัวนั้นรับงานอะไร ไม่ใช่แค่ชื่อ · วันที่มันหายไป คนที่อ่าน
 * รายงานต้องตัดสินใจได้ทันทีว่ากระทบหน้าจอไหน โดยไม่ต้องไปไล่อ่าน SQL
 */
var CHECK_DB_INDEXES = Object.freeze([
  Object.freeze({ name: 'idx_wo_status',      file: 'supabase_schema.sql',    why: 'กรองตามสถานะรวม' }),
  Object.freeze({ name: 'idx_wo_created',     file: 'supabase_schema.sql',    why: 'เรียงใบงานใหม่ไปเก่า' }),
  Object.freeze({ name: 'idx_wo_customer',    file: 'supabase_schema.sql',    why: 'ค้นตามรหัสลูกค้า' }),
  Object.freeze({ name: 'idx_wo_pj',          file: 'supabase_schema.sql',    why: 'หาใบงานจาก PJ_ID' }),
  Object.freeze({ name: 'idx_wo_route',       file: 'supabase_schema.sql',    why: 'ยอดรออนุมัติแยกสาย' }),
  Object.freeze({ name: 'idx_wo_payment',     file: 'supabase_schema.sql',    why: 'ยอดยังไม่ชำระ' }),
  Object.freeze({ name: 'idx_dt_wo',          file: 'supabase_schema.sql',    why: 'งานของแผนกในใบงานหนึ่งใบ' }),
  Object.freeze({ name: 'idx_dt_dept',        file: 'supabase_schema.sql',    why: 'รายการงานของแต่ละแผนก' }),
  Object.freeze({ name: 'idx_ts_task',        file: 'supabase_schema.sql',    why: 'ขั้นตอนของงานแผนก' }),
  Object.freeze({ name: 'idx_fi_wo',          file: 'supabase_schema.sql',    why: 'ไฟล์แนบของใบงาน' }),
  Object.freeze({ name: 'idx_fi_task',        file: 'supabase_schema.sql',    why: 'ไฟล์แนบของงานแผนก' }),
  Object.freeze({ name: 'idx_audit_wo',       file: 'supabase_schema.sql',    why: 'ประวัติของใบงาน' }),
  Object.freeze({ name: 'idx_audit_time',     file: 'supabase_schema.sql',    why: 'ประวัติเรียงตามเวลา' }),
  Object.freeze({ name: 'idx_syslog_time',    file: 'supabase_schema.sql',    why: 'log ระบบเรียงตามเวลา' }),
  Object.freeze({ name: 'idx_syslog_level',   file: 'supabase_schema.sql',    why: 'log ระบบแยกตามระดับ' }),
  Object.freeze({ name: 'idx_session_expires', file: 'supabase_schema.sql',   why: 'ล้างโทเคนหมดอายุ' }),
  Object.freeze({ name: 'idx_session_email',  file: 'supabase_schema.sql',    why: 'โทเคนของผู้ใช้คนหนึ่ง' }),
  Object.freeze({ name: 'idx_pl_customer',    file: 'supabase_schema.sql',    why: 'สถานที่ของลูกค้า' }),
  Object.freeze({ name: 'idx_pl_lockey',      file: 'supabase_schema.sql',    why: 'ออก PJ_ID ไม่ให้ซ้ำ' }),
  Object.freeze({ name: 'idx_wo_closed_at',   file: 'supabase_batch3.sql',    why: 'ยอดเสร็จสิ้นและยกเลิกเดือนนี้ นับจาก closed_date' }),
  Object.freeze({ name: 'idx_wo_reopened',    file: 'supabase_batch3.sql',    why: 'ตัวกรอง "เคยเปิดซ้ำ" ในหน้าใบงานทั้งหมด' }),
  Object.freeze({ name: 'idx_wo_due',         file: 'supabase_batch1.sql',    why: 'ตัวกรองและยอดเลยกำหนด' }),
  Object.freeze({ name: 'idx_dt_visit',       file: 'supabase_batch1.sql',    why: 'หน้างานวันนี้ของแต่ละแผนก' })
]);

/**
 * constraint ที่ความถูกต้องของข้อมูลพึ่งอยู่ — ไม่ใช่ทุกตัว แต่เป็นตัวที่หายแล้วเงียบ
 *
 * ไม่ไล่ primary key ทุกตาราง เพราะตารางที่มีอยู่ย่อมมี primary key อยู่แล้ว
 * ตัวที่ตรวจคือสองอย่างที่หายไปแล้วไม่มีอาการ: `on delete cascade` ซึ่งถ้าไม่มี
 * การลบใบงานจะทิ้งงานของแผนกเป็นแถวกำพร้าไว้ และ unique ของชื่อผู้ใช้
 * ซึ่งถ้าไม่มี จะสมัครชื่อซ้ำได้แล้วเข้าสู่ระบบได้สองคนด้วยชื่อเดียวกัน
 */
var CHECK_DB_CONSTRAINTS = Object.freeze([
  Object.freeze({ name: 'department_task_wo_id_fkey', file: 'supabase_schema.sql',
    why: 'ลบใบงานแล้วงานของแผนกต้องหายตาม' }),
  Object.freeze({ name: 'task_step_task_id_fkey', file: 'supabase_schema.sql',
    why: 'ลบงานแผนกแล้วขั้นตอนต้องหายตาม' }),
  Object.freeze({ name: 'user_role_username_key', file: 'supabase_schema.sql',
    why: 'ชื่อผู้ใช้ต้องไม่ซ้ำ' })
]);

/** ฟังก์ชันในฐานข้อมูลที่โค้ดเรียกใช้จริง */
var CHECK_DB_FUNCTIONS = Object.freeze([
  Object.freeze({ name: 'next_running_number', file: 'supabase_schema.sql',
    why: 'ออกเลขที่ใบงานไม่ให้ซ้ำ' }),
  Object.freeze({ name: 'db_objects', file: 'supabase_schema.sql',
    why: 'รายงานนี้เองใช้ตรวจว่าไฟล์ SQL ถูกรันครบหรือยัง' }),
  Object.freeze({ name: 'dashboard_summary', file: 'supabase_dashboard.sql',
    why: 'ยอดหน้าแรกทั้งชุดในคำขอเดียว' }),
  Object.freeze({ name: 'department_task_counts', file: 'supabase_batch2.sql',
    why: 'ยอดบนเมนูย่อยของแผนก ขาดแล้วทุกหน้าของแผนกเปิดไม่ได้' }),
  Object.freeze({ name: 'due_date', file: 'supabase_batch1.sql',
    why: 'วันครบกำหนด ซึ่งไม่มีคอลัมน์เก็บโดยตั้งใจ' })
]);

/**
 * คอลัมน์ใหม่และสูตรวันครบกำหนดมีอยู่จริงในฐานข้อมูลหรือยัง (SPEC 9.2 · 13)
 *
 * **ข้อนี้มีไว้ตอบคำถามเดียว: รัน supabase_batch1.sql แล้วหรือยัง**
 *
 * ถ้ายังไม่ได้รัน อาการที่ผู้ใช้เจอคือหน้าสร้างใบงานบันทึกไม่ได้ และไทล์ "เลยกำหนด"
 * ขึ้นข้อผิดพลาดกลาง ๆ — ทั้งสองอย่างไม่ได้บอกเลยว่าสาเหตุอยู่ที่ฐานข้อมูล
 * เพราะข้อความจริงของ PostgREST ถูกกันไม่ให้ไหลขึ้นหน้าเว็บตามกฎข้อ 24
 *
 * และข้อนี้ยังเทียบ **สูตรสองฝั่ง** ด้วย · วันครบกำหนดถูกคำนวณสองที่โดยตั้งใจ —
 * ฝั่ง SQL เพื่อให้กรองและนับที่ฐานข้อมูลได้ ฝั่ง JavaScript เพื่อให้แสดงผลและ
 * ทดสอบได้ · สองสูตรที่เขียนแยกกันย่อมเพี้ยนจากกันได้ วิธีเดียวที่รู้แน่คือเอาของจริง
 * มาเทียบกันทีละแถว ไม่ใช่เชื่อว่ามันตรงเพราะเราเขียนให้เหมือนกัน
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 */
function checkNewColumns_(lines, objects) {
  lines.push('');
  lines.push('########## 9. ของในฐานข้อมูลที่โค้ดต้องพึ่ง ##########');

  var missing = [];

  for (var i = 0; i < CHECK_NEW_COLUMNS.length; i++) {
    var one = CHECK_NEW_COLUMNS[i];
    var label = one.table + '.' + one.column;
    try {
      db_select_(one.table, { select: [one.column], limit: 1 });
      lines.push('  ' + checkDbPad_(label) + ' → มีแล้ว');
    } catch (e) {
      missing.push(label);
      lines.push('  ' + checkDbPad_(label) + ' → !! ยังไม่มี (รหัส ' + db_lastFailure_().status + ')');
    }
  }

  checkDueDateFormula_(lines, missing);
  checkDashboardOverdue_(lines, missing);
  checkDbObjects_(lines, missing, objects);

  lines.push('');
  if (missing.length) {
    lines.push('  !! ยังไม่ครบ ' + missing.length + ' อย่าง: ' + missing.join(', '));
    lines.push('  ดูข้อ 8 ว่าไฟล์ไหนยังไม่ได้รัน แล้วรันไฟล์นั้นจากโปรเจกต์ ไม่ใช่จากแท็บที่เปิดค้าง');
  } else {
    lines.push('  สรุป: ของที่โค้ดพึ่งมีครบทุกอย่างในฐานข้อมูลจริง');
  }
}

/**
 * index constraint และฟังก์ชันที่โค้ดพึ่ง มีอยู่จริงหรือไม่ (SPEC 22)
 *
 * **สามอย่างนี้ขาดไปแล้วระบบยังทำงานได้ ซึ่งคือเหตุผลที่ต้องตรวจ**
 *
 * ตารางที่ขาดคอลัมน์จะพังทันทีและดังพอให้รู้ · แต่ index ที่ขาดไปไม่ทำให้อะไรผิด
 * เลยสักอย่าง คำสั่งยังคืนคำตอบถูกต้องทุกครั้ง แค่ช้าลงเรื่อย ๆ ตามจำนวนแถว
 * จนวันหนึ่งหน้าจอค้างโดยไม่มีอะไรเปลี่ยนแปลงให้โทษได้ · ส่วน constraint ที่ขาด
 * จะเงียบยิ่งกว่า — `on delete cascade` ที่หายไปแปลว่าลบใบงานแล้วงานของแผนก
 * ยังอยู่ กลายเป็นแถวกำพร้าที่ไม่มีใครเห็นจนกว่าจะไปเจอตอนนับยอด
 *
 * รายการที่ต้องมีอยู่ฝั่งโค้ด ไม่ใช่ฝั่ง SQL โดยตั้งใจ · เพิ่ม index ใหม่ในไฟล์ไหน
 * ก็เติมชื่อกับไฟล์ลงรายการนี้ที่เดียว ไม่ต้องไปแก้ db_objects() อีก
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {string[]} missing รายชื่อสิ่งที่ยังไม่มี
 * @param {Object} objects ของในฐานข้อมูลจาก db_objects()
 */
function checkDbObjects_(lines, missing, objects) {
  objects = objects || {};

  /*
   * ถ้าข้อ 8 อ่าน db_objects() ไม่ได้ ก็ไม่มีข้อมูลจะเทียบ · การเงียบไปเฉย ๆ
   * จะทำให้คนเข้าใจว่าตรวจแล้วผ่าน จึงต้องบอกตรง ๆ ว่ายังไม่ได้ตรวจ
   */
  if (!objects.indexes) {
    lines.push('  ' + checkDbPad_('index และ constraint') +
      ' → ยังไม่ได้ตรวจ เพราะข้อ 8 อ่าน db_objects() ไม่ได้');
    return;
  }

  var groups = [
    { label: 'index',      have: objects.indexes,     want: CHECK_DB_INDEXES },
    { label: 'constraint', have: objects.constraints, want: CHECK_DB_CONSTRAINTS },
    { label: 'ฟังก์ชัน',     have: objects.functions,   want: CHECK_DB_FUNCTIONS }
  ];

  for (var g = 0; g < groups.length; g++) {
    var have = groups[g].have || [];
    var want = groups[g].want;
    var gone = [];

    for (var i = 0; i < want.length; i++) {
      var found = false;
      for (var h = 0; h < have.length; h++) if (String(have[h]) === want[i].name) found = true;
      if (!found) gone.push(want[i]);
    }

    if (!gone.length) {
      lines.push('  ' + checkDbPad_(groups[g].label) + ' → ครบทั้ง ' + want.length + ' ตัว');
      continue;
    }

    missing.push(groups[g].label + ' ' + gone.length + ' ตัว');
    lines.push('  ' + checkDbPad_(groups[g].label) + ' → !! ขาด ' + gone.length +
      ' จาก ' + want.length + ' ตัว');
    for (var n = 0; n < gone.length; n++) {
      lines.push('    ' + checkDbPad_(gone[n].name, 26) + ' ← ' + gone[n].file +
        ' (' + gone[n].why + ')');
    }
  }
}

/**
 * RPC ของแดชบอร์ดรู้จักยอด "เลยกำหนด" แล้วหรือยัง — คือถามว่ารัน supabase_dashboard.sql ซ้ำแล้วหรือยัง
 *
 * **นี่คือความผิดพลาดที่เงียบที่สุดของงานกองนี้** ไฟล์สองไฟล์ต้องรันทั้งคู่ และ
 * ไฟล์แรกคือไฟล์ที่ทำให้คอลัมน์ใหม่เกิดขึ้น · ถ้ารันไฟล์แรกแล้วลืมไฟล์ที่สอง
 * ทุกอย่างจะดูปกติหมด: คอลัมน์มีจริง ตัวกรอง "เลยกำหนด" ทำงานถูกต้อง แต่ฟังก์ชัน
 * `dashboard_summary` ตัวเก่ายังไม่มีคีย์ `overdue` อยู่ · `dashboardFor()` อ่านคีย์ที่
 * ไม่มีได้ `undefined` แล้วแปลงเป็น 0 ตามปกติ ไทล์จึงขึ้น "เลยกำหนด 0" ค้างไว้ตลอดกาล
 * โดยไม่มีข้อผิดพลาดให้เห็นสักบรรทัดเดียว
 *
 * ผลคือแดชบอร์ดบอกว่าไม่มีใบไหนเลยกำหนด ขณะที่กดเข้าไปในรายการแล้วเจอสิบใบ —
 * ซึ่งแย่กว่าไม่มีไทล์เลย เพราะคนจะเลิกเชื่อตัวเลขทุกตัวบนหน้านั้นไปพร้อมกัน
 *
 * เทสต์จับเรื่องนี้ไม่ได้ เพราะเทสต์รันกับตัวจำลองซึ่งมีคีย์นี้เสมอ · สิ่งเดียวที่รู้ได้
 * คือถามฐานข้อมูลจริง
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {string[]} missing รายชื่อสิ่งที่ยังไม่มี — ใช้บันทึกเพิ่มเมื่อ RPC ยังเป็นตัวเก่า
 */
function checkDashboardOverdue_(lines, missing) {
  var label = 'ยอด "เลยกำหนด" ใน RPC';
  var totals;

  try {
    totals = db_rpc_('dashboard_summary', {});
  } catch (e) {
    missing.push('RPC dashboard_summary');
    lines.push('  ' + checkDbPad_(label) +
      ' → !! เรียก dashboard_summary ไม่ได้ (รหัส ' + db_lastFailure_().status + ')');
    lines.push('    ทั้งแดชบอร์ดจะว่างเปล่า ไม่ใช่แค่ไทล์เดียว — ต้องรัน supabase_dashboard.sql');
    return;
  }

  /* คลี่เปลือกแบบเดียวกับ dashboardTotals_() เพื่อให้ตรวจสิ่งเดียวกับที่หน้าแรกอ่านจริง */
  if (totals instanceof Array) totals = totals.length ? totals[0] : {};
  totals = totals || {};

  /*
   * ต้องแยก "ไม่มีคีย์" ออกจาก "มีคีย์แต่เป็นศูนย์" ให้ได้ · ศูนย์เป็นคำตอบที่ถูกต้อง
   * และพบบ่อยที่สุด ถ้าตรวจด้วยความจริงเท็จธรรมดาจะฟ้องผิดทุกวันที่ไม่มีใบเลยกำหนด
   * จนคนเลิกอ่านรายงานนี้ทั้งฉบับ
   */
  if (typeof totals.overdue === 'undefined') {
    missing.push('ยอด overdue ใน dashboard_summary');
    lines.push('  ' + checkDbPad_(label) + ' → !! ยังไม่มีคีย์ overdue — RPC ยังเป็นตัวเก่า');
    lines.push('    ไทล์ "เลยกำหนด" จะขึ้น 0 ค้างไว้เงียบ ๆ ขณะที่กดเข้าไปแล้วเจอใบงานจริง');
    lines.push('    ทางแก้: รัน supabase_dashboard.sql ซ้ำอีกครั้ง (ต้องรันหลัง supabase_batch1.sql)');
    return;
  }

  lines.push('  ' + checkDbPad_(label) + ' → มีแล้ว (ขณะนี้ ' + Number(totals.overdue) + ' ใบ)');
}

/**
 * สูตรวันครบกำหนดฝั่งฐานข้อมูล ตรงกับฝั่งโค้ดหรือไม่ — เทียบจากแถวจริง
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {string[]} missing รายชื่อคอลัมน์ที่ยังไม่มี — ใช้บันทึกเพิ่มเมื่อสูตรหาย
 */
function checkDueDateFormula_(lines, missing) {
  var rows;
  try {
    rows = db_select_(SHEET.WORK_ORDER, {
      select: ['WO_ID', 'Created_Date', 'Duration_Days', 'Due_Date'],
      filters: { 'Duration_Days': { op: 'not.is', value: null } },
      order: { column: 'Created_Date', ascending: false },
      limit: 20
    });
  } catch (e) {
    missing.push('สูตร due_date(work_order)');
    lines.push('  ' + checkDbPad_('สูตร due_date') +
      ' → !! เรียกไม่ได้ (รหัส ' + db_lastFailure_().status + ')');
    lines.push('    ตัวกรอง "เลยกำหนด" และยอดบนแดชบอร์ดจะใช้ไม่ได้ทั้งคู่จนกว่าจะสร้างสูตรนี้');
    return;
  }

  if (!rows.length) {
    lines.push('  ' + checkDbPad_('สูตร due_date') +
      ' → เรียกได้ แต่ยังไม่มีใบงานที่กรอกขอบเขตวันไว้ จึงยังเทียบสูตรสองฝั่งไม่ได้');
    return;
  }

  var today = thaiDayOf_(new Date());
  var wrong = [];

  for (var i = 0; i < rows.length; i++) {
    var fromDb = String(rows[i]['Due_Date'] || '');
    var fromCode = dueInfoOf_(rows[i]['Created_Date'], rows[i]['Duration_Days'], '', today).dueDate;
    if (fromDb !== fromCode) {
      wrong.push(rows[i]['WO_ID'] + ' (ฐานข้อมูล ' + fromDb + ' · โค้ด ' + fromCode + ')');
    }
  }

  if (wrong.length) {
    missing.push('สูตร due_date ไม่ตรงกับฝั่งโค้ด');
    lines.push('  ' + checkDbPad_('สูตร due_date') + ' → !! ไม่ตรงกัน ' + wrong.length +
      ' จาก ' + rows.length + ' แถว');
    for (var w = 0; w < wrong.length && w < 5; w++) lines.push('    ' + wrong[w]);
    lines.push('    ยอดบนไทล์จะไม่ตรงกับป้ายบนแต่ละใบ · ตรวจว่า supabase_batch1.sql เป็นฉบับล่าสุด');
  } else {
    lines.push('  ' + checkDbPad_('สูตร due_date') + ' → ตรงกันทั้ง ' + rows.length +
      ' แถวที่เทียบ (ฐานข้อมูลกับโค้ดคำนวณวันครบกำหนดได้ค่าเดียวกัน)');
  }
}
/* ---------------------------------------------------------------------------
 * ส่วนที่ 11 — ดูหน้า HTML ที่ระบบเสิร์ฟออกไปจริง
 *
 * **มีขึ้นเพราะเทสต์ 4,210 ข้อผ่านหมดแต่หน้าเว็บเปิดไม่ได้**
 *
 * เทสต์ทั้งชุดเรียกฟังก์ชันฝั่งเซิร์ฟเวอร์ ไม่มีข้อไหนเอา HTML ที่ประกอบเสร็จแล้ว
 * มาตรวจว่าจาวาสคริปต์ข้างในอ่านผ่านหรือไม่ · ถ้าอ่านไม่ผ่าน เบราว์เซอร์จะหยุด
 * ตั้งแต่ขั้นแปลไฟล์ โค้ดในหน้าจึงไม่เคยเริ่มทำงานเลยสักบรรทัด ผลคือหน้าค้างอยู่ที่
 * "กำลังโหลด" ตลอดกาล โดยฝั่งเซิร์ฟเวอร์ไม่มีอะไรผิดให้เห็นแม้แต่บรรทัดเดียว
 * --------------------------------------------------------------------------- */

/**
 * หน้า HTML ที่ doGet จะเสิร์ฟออกไปจริง — ประกอบด้วยเส้นทางเดียวกันทุกขั้น
 *
 * เรียก `renderPage_` ตัวเดียวกับที่ doGet ใช้ ไม่ได้ประกอบเองใหม่ · ถ้าประกอบเอง
 * เครื่องมือนี้จะตรวจหน้าที่ไม่มีใครเห็น แล้วบอกว่าปกติดีในขณะที่ของจริงพัง
 *
 * @param {string} pageName ชื่อหน้าตาม WEB_PAGES
 * @param {Object} [params] ค่าที่มากับ query string เช่น {dept, view}
 * @return {string} HTML ทั้งหน้า
 */
function servedHtmlOf_(pageName, params) {
  var one = params || {};
  return renderPage_({
    page: pageName,
    wo:   one.wo   || '',
    dept: one.dept || '',
    view: one.view || '',
    base: one.base || 'https://example.test/exec'
  });
}

/**
 * บล็อก <script> ทุกบล็อกในหน้า พร้อมเลขบรรทัดที่บล็อกนั้นเริ่ม
 *
 * ตัดเฉพาะบล็อกที่มีโค้ดจริง ข้ามบล็อกที่มีแต่ src เพราะเนื้อหาไม่ได้อยู่ในหน้านี้
 *
 * @param {string} html เนื้อหาทั้งหน้า
 * @return {Object[]} [{startLine, code}]
 */
function scriptBlocksOf_(html) {
  var out = [];
  var text = String(html);
  var re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  var found;

  while ((found = re.exec(text)) !== null) {
    if (/\bsrc\s*=/i.test(found[1])) continue;
    out.push({
      startLine: text.substring(0, found.index).split(NEW_LINE_).length,
      code: found[2]
    });
  }
  return out;
}

/**
 * ร่องรอยที่ทำให้จาวาสคริปต์ในหน้าอ่านไม่ผ่าน — สี่อย่างที่เกิดจริงได้
 *
 * **ข้อแรกสำคัญที่สุด: ลองแปลโค้ดจริง ๆ ด้วย `new Function`**
 *
 * `new Function(code)` แปลโค้ดแต่ไม่รันมัน จึงเป็นคำตอบที่ตรงคำถามที่สุดว่า
 * "เบราว์เซอร์จะอ่านผ่านไหม" · การไล่หาด้วยรูปแบบข้อความอย่างเดียวจะพลาดเสมอ
 * เพราะภาษาจาวาสคริปต์ไม่ได้อธิบายด้วยรูปแบบข้อความได้ครบ
 *
 * ส่วนอีกสี่ข้อที่เหลือไม่ได้มีไว้ตัดสินผ่าน-ไม่ผ่าน แต่มีไว้ **ชี้ตำแหน่ง** ว่าพังตรงไหน
 * เพราะข้อความจาก SyntaxError บอกแค่ว่า "unexpected token" ซึ่งไม่ช่วยอะไรเลย
 *
 * @param {string} html เนื้อหาทั้งหน้า
 * @return {Object[]} [{kind, line, detail}] · ว่าง = ไม่พบร่องรอย
 */
function htmlRiskScan_(html) {
  var blocks = scriptBlocksOf_(html);
  var out = [];

  for (var b = 0; b < blocks.length; b++) {
    var code = blocks[b].code;
    var base = blocks[b].startLine;

    /* ---------- คำถามที่แท้จริงข้อเดียว: เบราว์เซอร์จะแปลผ่านไหม ---------- */
    var broke = '';
    try {
      new Function(code);
    } catch (e) {
      broke = (e && e.message) || String(e);
    }
    if (!broke) continue;

    out.push({
      kind: 'PARSE',
      line: base,
      detail: 'บล็อกที่ ' + (b + 1) + ' แปลไม่ผ่าน: ' + broke
    });

    /*
     * บล็อกนี้พังแล้ว ค่อยไล่หาว่าพังเพราะอะไร
     *
     * **ไล่หาเฉพาะบล็อกที่พังจริง ไม่ไล่ทุกบล็อก** เพราะร่องรอยพวกนี้อยู่ในโค้ด
     * ที่ถูกต้องได้ตามปกติ — `escapeHtml` มี '&amp;' อยู่ในสตริงโดยตั้งใจ และ
     * นั่นไม่ใช่ข้อผิดพลาดเลย · ตัวตรวจที่เตือนผิดทุกครั้งที่เปิดดู จะทำให้คน
     * เลิกอ่านรายงานทั้งฉบับ แล้ววันที่มันเตือนถูกก็จะไม่มีใครเห็น
     */
    var lines = code.split(NEW_LINE_);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      /*
       * entity ของ HTML ที่หลุดเข้ามาในโค้ด — เกิดจากใช้ <?= ?> แทน <?!= ?>
       * ในหน้าเว็บ &quot; คือเครื่องหมายคำพูด แต่ในจาวาสคริปต์มันคือตัวอักษรหกตัว
       * ที่ไม่มีความหมาย แล้วสตริงจะไม่มีวันปิด
       */
      var entity = /&(quot|#0?39|amp|lt|gt|nbsp);/.exec(line);
      if (entity) {
        out.push({ kind: 'ENTITY', line: base + i,
          detail: 'พบ ' + entity[0] + ' ในบล็อกที่พัง · ' + checkDbSnippet_(line) });
      }

      /*
       * ข้อความปิดบล็อกสคริปต์ที่อยู่ในสตริง — เบราว์เซอร์ปิดบล็อกทันทีที่เห็น
       * ไม่สนว่าอยู่ในเครื่องหมายคำพูดหรือไม่ โค้ดที่เหลือจะกลายเป็นเนื้อหาของหน้า
       */
      if (/<\/script/i.test(line)) {
        out.push({ kind: 'CLOSETAG', line: base + i,
          detail: 'มีข้อความปิดบล็อกสคริปต์อยู่ในโค้ด · ' + checkDbSnippet_(line) });
      }

      /*
       * เครื่องหมายคำพูดที่เปิดแล้วไม่ปิดภายในบรรทัดเดียวกัน
       *
       * **นี่คือสาเหตุที่เกิดขึ้นจริงมาแล้ว** สตริงในจาวาสคริปต์ข้ามบรรทัดไม่ได้
       * ถ้าไม่ได้ใช้เครื่องหมายเอียงกลับ · บรรทัดที่เปิดแล้วไม่ปิดจึงเป็นตำแหน่ง
       * ที่ต้องดูก่อนเสมอ · นับแบบหยาบพอ เพราะหน้าที่ของมันคือชี้ตำแหน่งให้คนไปดู
       * ไม่ใช่ตัดสินถูกผิด ซึ่ง new Function ตัดสินไปแล้วข้างบน
       */
      if (unbalancedQuote_(line)) {
        out.push({ kind: 'UNCLOSED', line: base + i,
          detail: 'เครื่องหมายคำพูดเปิดแล้วไม่ปิดในบรรทัดเดียวกัน · ' + checkDbSnippet_(line) });
      }
    }
  }

  return out;
}

/**
 * บรรทัดนี้มีเครื่องหมายคำพูดที่เปิดแล้วไม่ปิดหรือไม่ — ตรรกะล้วน
 *
 * เดินทีละตัวอักษรแทนการนับจำนวน เพราะการนับจะผิดทันทีที่มีคำพูดอีกชนิดหนึ่ง
 * อยู่ข้างในสตริง เช่น `'เขาว่า "ไม่"'` ซึ่งถูกต้องทุกประการ
 *
 * ข้ามคอมเมนต์ท้ายบรรทัดด้วย เพราะอะพอสทรอฟีในคอมเมนต์ภาษาอังกฤษพบได้ทั่วไป
 * และไม่เคยทำให้อะไรพัง
 *
 * @param {string} line โค้ดหนึ่งบรรทัด
 * @return {boolean}
 */
function unbalancedQuote_(line) {
  var text = String(line);
  var open = '';

  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);

    if (open) {
      if (ch === '\\') { i++; continue; }         // ตัวถัดไปถูกหลีกแล้ว ข้ามไป
      if (ch === open) open = '';
      continue;
    }

    if (ch === '/' && text.charAt(i + 1) === '/') return false;   // คอมเมนต์ท้ายบรรทัด
    if (ch === '/' && text.charAt(i + 1) === '*') return false;   // คอมเมนต์หลายบรรทัด
    if (ch === "'" || ch === '"') open = ch;
  }

  return open !== '';
}

/**
 * ตัดข้อความยาวให้พอเห็นบริบท — รายงานที่พิมพ์ทั้งบรรทัดยาวสามร้อยตัวอ่านไม่ไหว
 * @param {string} text ข้อความ
 * @return {string}
 */
function checkDbSnippet_(text) {
  var one = String(text).replace(/\s+/g, ' ').trim();
  return one.length > 120 ? (one.substring(0, 120) + '…') : one;
}

/**
 * พิมพ์หน้าที่ระบบเสิร์ฟออกไปจริง พร้อมเลขบรรทัด แล้วชี้ว่าพังตรงไหน
 *
 * **ใช้ตอนหน้าเว็บค้างที่ "กำลังโหลด" หรือขึ้นหน้าขาว** ซึ่งเป็นอาการของ
 * จาวาสคริปต์ที่อ่านไม่ผ่าน ไม่ใช่อาการของฝั่งเซิร์ฟเวอร์ · Execution log
 * จะไม่มีอะไรผิดเลย เพราะฝั่งเซิร์ฟเวอร์ทำงานสำเร็จทุกขั้นจริง ๆ
 *
 * @param {string} pageName ชื่อหน้าตาม WEB_PAGES เช่น 'work'
 * @param {Object} [params] ค่าที่มากับ query string เช่น {dept:'SERVICE', view:'active'}
 * @return {string} ข้อความสรุป
 */
function dumpServedHtml(pageName, params) {
  assertDataAccessAllowed_();

  var page = String(pageName || WEB_DEFAULT_PAGE);
  var lines = ['===== HTML ที่เสิร์ฟออกไปจริงของหน้า ' + page + ' ====='];
  var html;

  try {
    html = servedHtmlOf_(page, params);
  } catch (e) {
    lines.push('!! ประกอบหน้าไม่สำเร็จ: ' + ((e && e.message) || String(e)));
    Logger.log(lines.join(NEW_LINE_));
    return 'ประกอบหน้าไม่สำเร็จ — ดูรายละเอียดใน Execution log';
  }

  var blocks = scriptBlocksOf_(html);
  lines.push('ความยาวทั้งหน้า : ' + html.length + ' ตัวอักษร · ' +
    html.split(NEW_LINE_).length + ' บรรทัด');
  lines.push('บล็อก <script>  : ' + blocks.length + ' บล็อก');

  /* ---------- ร่องรอยที่พบ พิมพ์ก่อนตัวโค้ดเสมอ ---------- */
  var risks = htmlRiskScan_(html);
  lines.push('');
  lines.push('########## ร่องรอยที่ทำให้จาวาสคริปต์อ่านไม่ผ่าน ##########');
  if (!risks.length) {
    lines.push('  ไม่พบ — ทุกบล็อกแปลผ่าน');
  } else {
    for (var r = 0; r < risks.length; r++) {
      lines.push('  !! [' + risks[r].kind + '] บรรทัดที่ ' + risks[r].line + ' · ' + risks[r].detail);
    }
  }

  /* ---------- ตัวโค้ดพร้อมเลขบรรทัดของทั้งหน้า ---------- */
  /*
   * ใช้เลขบรรทัดของทั้งหน้า ไม่ใช่เลขในบล็อก เพราะเลขที่เบราว์เซอร์รายงานมา
   * เป็นเลขของทั้งหน้า · ถ้านับคนละฐาน คนอ่านจะต้องมานั่งบวกเองทุกครั้ง
   */
  for (var b = 0; b < blocks.length; b++) {
    lines.push('');
    lines.push('########## บล็อกที่ ' + (b + 1) + ' เริ่มบรรทัดที่ ' + blocks[b].startLine + ' ##########');
    var code = blocks[b].code.split(NEW_LINE_);
    for (var i = 0; i < code.length; i++) {
      lines.push(checkDbPad_(String(blocks[b].startLine + i), 6) + '| ' + code[i]);
    }
  }

  Logger.log(lines.join(NEW_LINE_));
  return risks.length
    ? ('พบร่องรอย ' + risks.length + ' จุด — ดูรายละเอียดใน Execution log')
    : 'ทุกบล็อกแปลผ่าน — ดูเนื้อหาใน Execution log';
}

/* ===========================================================================
 * ส่วนที่ 12 — ระบบไฟล์แนบและการออกเอกสาร เดินเส้นทางจริงทั้งเส้น
 *
 * ทำไมต้องมีทั้งที่เทสต์เขียวหมดแล้ว: เทสต์เรียกฟังก์ชันบริการบนของจำลอง
 * ซึ่งพิสูจน์ตรรกะได้ดี แต่พิสูจน์ไม่ได้เลยว่า (1) สิทธิ์ Drive และ Docs ยังอยู่
 * (2) แม่แบบที่ตั้งไว้ยังเปิดได้ (3) Folder_Map ที่ย้ายมาจากชีตยังเป็น JSON
 * ที่อ่านกลับได้ · สามเรื่องนี้พังแบบไม่มี error ไม่มี log และไม่มีเทสต์ไหนจับได้
 *
 * Folder_Map เป็นจุดที่น่าสงสัยที่สุด เพราะมันคือ JSON ที่ถูกเก็บในคอลัมน์ข้อความ
 * ผ่านการย้ายฐานข้อมูลมา · ถ้ามันเพี้ยน ระบบจะไม่โยน error — parseFolderMap_()
 * แปลไม่ได้แล้วคืน {} ซึ่งแปลว่า "ยังไม่มีโฟลเดอร์ย่อยเลย" แล้วระบบจะสร้าง
 * โฟลเดอร์ชุดใหม่ซ้อนขึ้นมาเงียบ ๆ ไฟล์เก่ายังอยู่ที่เดิมแต่ไม่มีใครหาเจออีก
 * =========================================================================== */

/** ข้อความในไฟล์ทดสอบ — สั้นและบอกตัวเองว่าคืออะไร เผื่อหลุดรอดการลบ */
var FILES_PROBE_TEXT = 'ไฟล์นี้ถูกสร้างโดย checkFilesAndReport() เพื่อตรวจว่าระบบไฟล์ทำงาน และต้องถูกลบทิ้งทันทีในการตรวจครั้งเดียวกัน';

/** ชื่อไฟล์ที่ผู้ใช้ "อัปโหลด" — ระบบจะตั้งชื่อใหม่ให้เองตาม SPEC 14.1 */
var FILES_PROBE_FILE_NAME = 'ตรวจระบบไฟล์.txt';

/**
 * ตรวจระบบไฟล์แนบและการออกใบสั่งงานของใบงานหนึ่งใบ โดยเดินเส้นทางจริงทั้งเส้น
 *
 * **เครื่องมือนี้เขียนของจริง** อัปโหลดไฟล์ทดสอบหนึ่งไฟล์แล้วเก็บกวาดให้เอง
 * และออกใบสั่งงานฉบับใหม่หนึ่งฉบับ (ฉบับเดิมถูกย้ายเข้า _archive ตาม SPEC 16.1
 * ไม่ถูกทับทิ้ง) · จึงควรเลือกใบงานที่ยอมให้มีฉบับเพิ่มอีกหนึ่งฉบับได้
 *
 * ทุกบรรทัดอ่านจากของจริงโดยไม่ผ่านแคชชั้นใด ๆ (SPEC 22.5)
 *
 * @param {string} woId เลขที่ใบงานที่จะใช้ตรวจ
 * @return {string} ข้อความสรุป — รายละเอียดอยู่ใน Execution log
 */
function checkFilesAndReport(woId) {
  assertDataAccessAllowed_();

  var id = String(woId || '').trim();
  var lines = ['===== ระบบไฟล์แนบและการออกเอกสาร (SPEC 14 · 16 · 16.1) ====='];

  if (!id) {
    lines.push('');
    lines.push('!! ต้องระบุเลขที่ใบงาน เช่น checkFilesAndReport("WO-2609-0001")');
    lines.push('   เลือกใบที่ยอมให้มีใบสั่งงานเพิ่มอีกหนึ่งฉบับได้ เพราะการตรวจจะออกฉบับใหม่จริง');
    Logger.log(lines.join(NEW_LINE_));
    return 'ต้องระบุเลขที่ใบงาน — ดูวิธีใช้ใน Execution log';
  }

  lines.push('ใบงานที่ใช้ตรวจ : ' + id);
  lines.push('เวลาที่ตรวจ    : ' + formatForDisplay_(new Date()));
  lines.push('');
  lines.push('การตรวจนี้เขียนของจริง — อัปโหลดไฟล์ทดสอบหนึ่งไฟล์แล้วลบทิ้ง');
  lines.push('และออกใบสั่งงานฉบับใหม่หนึ่งฉบับ ฉบับเดิมย้ายเข้า _archive ไม่ถูกทับ');

  var score = { fail: 0 };

  filesProbeScopes_(lines, score);
  var wo = filesProbeWoRow_(lines, score, id);

  if (wo) {
    filesProbeFolders_(lines, score, wo);
    filesProbeUpload_(lines, score, wo);
    filesProbeReport_(lines, score, wo);
  }

  lines.push('');
  lines.push('########## สรุป ##########');
  lines.push(score.fail
    ? ('  !! มี ' + score.fail + ' จุดที่ต้องแก้ก่อนสร้างของใหม่ทับ')
    : '  ระบบไฟล์และการออกเอกสารเดินครบทั้งเส้นทางจริง');

  Logger.log(lines.join(NEW_LINE_));
  return score.fail
    ? ('พบ ' + score.fail + ' จุดที่ต้องแก้ — ดูรายละเอียดใน Execution log')
    : 'ผ่านครบทุกข้อ — ดูรายละเอียดใน Execution log';
}

/**
 * สิทธิ์ทั้งสามที่ระบบไฟล์ต้องใช้ — ลองใช้จริง ไม่ใช่อ่านจาก manifest
 *
 * manifest บอกได้แค่ว่า "ขอไว้" ไม่ได้บอกว่า "ได้รับแล้ว" · สองอย่างนี้ต่างกัน
 * และเคยหายไปเงียบ ๆ มาแล้วตอนแก้ไฟล์ appsscript.json
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} score ตัวนับจุดที่ต้องแก้
 */
function filesProbeScopes_(lines, score) {
  lines.push('');
  lines.push('########## 1. สิทธิ์ที่ระบบไฟล์ต้องใช้ ##########');

  /* ---------- script.external_request ---------- */
  /*
   * ไม่ต้องยิงอะไรใหม่ — ถ้าคุยกับฐานข้อมูลไม่ได้ ทุกบรรทัดใต้นี้จะล้มอยู่แล้ว
   * การนับแถวหนึ่งครั้งจึงเป็นหลักฐานที่ถูกที่สุดว่าสิทธิ์นี้ยังอยู่
   */
  try {
    var rows = db_count_(SHEET.FILE_INDEX, {});
    lines.push('  script.external_request → ใช้ได้ (นับ File_Index ได้ ' + rows + ' แถว)');
  } catch (e) {
    score.fail++;
    lines.push('  !! script.external_request → ' + ((e && e.message) || String(e)));
  }

  /* ---------- drive ---------- */
  var drive = probeDriveAccess_();
  if (drive.ok) {
    lines.push('  drive                   → ใช้ได้ (เปิดโฟลเดอร์รากของระบบได้)');
  } else if (drive.missing) {
    score.fail++;
    lines.push('  !! drive                → ยังไม่ได้ตั้งค่าโฟลเดอร์ราก กดรัน setupDriveFolder() หนึ่งครั้ง');
  } else {
    score.fail++;
    lines.push('  !! drive                → ' + drive.message);
  }

  /* ---------- documents ---------- */
  var templateId = getProp_(PROP_KEY.WO_REPORT_TEMPLATE, false);
  if (!templateId) {
    score.fail++;
    lines.push('  !! documents            → ยังไม่ได้ตั้ง ' + PROP_KEY.WO_REPORT_TEMPLATE +
      ' ใน Script Properties จึงยังออกใบสั่งงานไม่ได้เลย');
  } else {
    var doc = probeDocumentAccess_(templateId);
    if (doc.ok) {
      lines.push('  documents               → ใช้ได้ (เปิดแม่แบบที่ตั้งไว้ได้)');
    } else {
      score.fail++;
      lines.push('  !! documents            → ' + doc.message);
    }
  }
}

/**
 * แถวใบงานจากฐานข้อมูลโดยตรง — จุดที่น่าสงสัยที่สุดของการย้าย
 *
 * อ่านด้วย db_select_ ไม่ใช่ getWorkOrder() เพราะตัวหลังผ่านแคชของการรัน
 * และแคชนั้นจะบอกความจริงของเมื่อครู่ ไม่ใช่ของตอนนี้ (SPEC 22.5)
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} score ตัวนับจุดที่ต้องแก้
 * @param {string} woId เลขที่ใบงาน
 * @return {Object|null} แถวใบงาน หรือ null เมื่อไม่พบ
 */
function filesProbeWoRow_(lines, score, woId) {
  lines.push('');
  lines.push('########## 2. Folder_ID และ Folder_Map ในฐานข้อมูล ##########');

  var rows;
  try {
    rows = db_select_(SHEET.WORK_ORDER, { filters: { 'WO_ID': woId }, limit: 1 });
  } catch (e) {
    score.fail++;
    lines.push('  !! อ่านแถวใบงานไม่ได้: ' + ((e && e.message) || String(e)));
    return null;
  }

  if (!rows.length) {
    score.fail++;
    lines.push('  !! ไม่พบใบงาน ' + woId + ' ในฐานข้อมูล');
    return null;
  }

  var wo = rows[0];
  var folderId = String(wo['Folder_ID'] || '');
  var mapText = String(wo['Folder_Map'] === null || wo['Folder_Map'] === undefined
    ? '' : wo['Folder_Map']);

  lines.push('  Folder_ID   : ' + (folderId || '(ว่าง — ใบนี้ยังไม่เคยมีไฟล์)'));
  lines.push('  Folder_URL  : ' + (String(wo['Folder_URL'] || '') || '(ว่าง)'));
  lines.push('  Report_URL  : ' + (String(wo['Report_URL'] || '') || '(ว่าง — ยังไม่เคยออกใบสั่งงาน)'));
  lines.push('  Folder_Map  : ' + mapText.length + ' ตัวอักษร');

  if (!mapText) {
    /*
     * ว่างไม่ใช่ความผิดปกติ — ใบที่ยังไม่เคยแนบไฟล์ย่อมไม่มีแผนที่
     * ชั้นนี้แยก NULL กับข้อความว่างไม่ออก แต่ทั้งสองแปลว่าเรื่องเดียวกันพอดี
     */
    lines.push('  แปล JSON    : ว่าง — ยังไม่มีโฟลเดอร์ย่อย ซึ่งถูกต้องถ้าใบนี้ยังไม่เคยแนบไฟล์');
    return wo;
  }

  lines.push('  ค่าดิบ      : ' + checkDbSnippet_(mapText));

  var parsed = null;
  var broke = '';
  try {
    parsed = JSON.parse(mapText);
  } catch (e) {
    broke = (e && e.message) || String(e);
  }

  if (broke || !parsed || typeof parsed !== 'object' || parsed instanceof Array) {
    /*
     * นี่คืออาการที่ต้องจับให้ได้ก่อนสร้างของใหม่ทับ · parseFolderMap_() จะกลืน
     * ความผิดพลาดนี้แล้วคืน {} ระบบจึงสร้างโฟลเดอร์ชุดใหม่ซ้อนขึ้นมาโดยไม่มีอะไรฟ้อง
     * แล้วไฟล์เก่ากับไฟล์ใหม่จะอยู่คนละที่ตลอดไป
     */
    score.fail++;
    lines.push('  !! แปล JSON ไม่ผ่าน: ' + (broke || 'ได้ค่าที่ไม่ใช่ object'));
    lines.push('  !! ระบบจะไม่โยน error แต่จะถือว่า "ยังไม่มีโฟลเดอร์ย่อย" แล้วสร้างชุดใหม่ซ้อนขึ้นมา');
    lines.push('  !! ไฟล์เก่ายังอยู่บน Drive แต่ระบบจะหาไม่เจออีก — ต้องแก้ค่านี้ก่อนแนบไฟล์เพิ่ม');
    return wo;
  }

  var keys = [];
  for (var key in parsed) {
    if (Object.prototype.hasOwnProperty.call(parsed, key)) keys.push(key);
  }
  keys.sort();

  lines.push('  แปล JSON    : ผ่าน · ' + keys.length + ' โฟลเดอร์ย่อย');
  for (var i = 0; i < keys.length; i++) {
    lines.push('      ' + checkDbPad_(keys[i], 24) + ' → ' + parsed[keys[i]]);
  }
  return wo;
}

/**
 * โฟลเดอร์ทุกตัวที่ฐานข้อมูลอ้างถึง ยังเปิดได้จริงบน Drive หรือไม่
 *
 * รหัสที่ชี้ไปยังโฟลเดอร์ที่ถูกลบไปแล้ว เป็นอาการที่ระบบกลืนเองได้
 * (ensureWoFolder_ จะสร้างใหม่ให้) แต่ผลคือไฟล์เก่าหลุดออกจากสายตาไปเงียบ ๆ
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} score ตัวนับจุดที่ต้องแก้
 * @param {Object} wo แถวใบงาน
 */
function filesProbeFolders_(lines, score, wo) {
  lines.push('');
  lines.push('########## 3. โฟลเดอร์บน Drive ##########');

  var folderId = String(wo['Folder_ID'] || '');
  if (!folderId) {
    lines.push('  ยังไม่มีโฟลเดอร์ของใบงานนี้ — ระบบจะสร้างให้เองในข้อ 4');
    return;
  }

  var root = driveFolderById_(folderId);
  if (!root) {
    score.fail++;
    lines.push('  !! โฟลเดอร์หลัก ' + folderId + ' เปิดไม่ได้ (ถูกลบ ย้ายลงถังขยะ หรือหมดสิทธิ์)');
  } else {
    lines.push('  โฟลเดอร์หลัก : "' + driveFolderName_(folderId) + '" ' + root.url);
  }

  var map = parseFolderMap_(wo['Folder_Map']);
  var missing = 0;
  for (var path in map) {
    if (!Object.prototype.hasOwnProperty.call(map, path)) continue;
    var sub = driveFolderById_(map[path]);
    if (sub) {
      lines.push('  ' + checkDbPad_(path, 24) + ' → "' + driveFolderName_(map[path]) + '" เปิดได้');
    } else {
      missing++;
      lines.push('  !! ' + checkDbPad_(path, 24) + ' → ' + map[path] + ' เปิดไม่ได้');
    }
  }
  if (missing) {
    score.fail++;
    lines.push('  !! มี ' + missing + ' โฟลเดอร์ที่ฐานข้อมูลอ้างถึงแต่เปิดไม่ได้ — ไฟล์ในนั้นหาไม่เจออีก');
  }
}

/**
 * อัปโหลดไฟล์ทดสอบหนึ่งไฟล์ผ่านเส้นทางจริง แล้วเก็บกวาดให้หมด
 *
 * เรียก uploadFile() ตัวเดียวกับที่หน้าเว็บเรียก ไม่ใช่เรียก Drive ตรง ๆ
 * เพราะสิ่งที่ต้องพิสูจน์คือทั้งเส้นทาง ตั้งแต่การตั้งชื่อตาม SPEC 14.1
 * การออกเลขลำดับ การสร้างโฟลเดอร์ ไปจนถึงแถวใน File_Index
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} score ตัวนับจุดที่ต้องแก้
 * @param {Object} wo แถวใบงาน
 */
function filesProbeUpload_(lines, score, wo) {
  lines.push('');
  lines.push('########## 4. อัปโหลดไฟล์ทดสอบแล้วลบทิ้ง ##########');

  var topics;
  try {
    topics = listAttachmentTopics(true);
  } catch (e) {
    score.fail++;
    lines.push('  !! อ่านหัวข้อไฟล์แนบไม่ได้: ' + ((e && e.message) || String(e)));
    return;
  }
  if (!topics.length) {
    score.fail++;
    lines.push('  !! ไม่มีหัวข้อไฟล์แนบที่ใช้งานอยู่เลยในตาราง Attachment_Topic');
    return;
  }

  var topic = topics[0];
  lines.push('  หัวข้อที่ใช้ : ' + topic['Topic_ID'] + ' · ' + topic['Topic_Name']);

  var row;
  try {
    row = uploadFile({
      woId:     wo['WO_ID'],
      scope:    FILE_SCOPE.WO,
      topicId:  topic['Topic_ID'],
      fileName: FILES_PROBE_FILE_NAME,
      mimeType: 'text/plain',
      // base64Encode ของข้อความเข้ารหัสเป็น UTF-8 ให้เอง อักษรไทยหนึ่งตัวจึงเป็นสามไบต์
      content:  Utilities.base64Encode(FILES_PROBE_TEXT)
    }, null);
  } catch (e) {
    score.fail++;
    lines.push('  !! อัปโหลดไม่สำเร็จ: ' + ((e && e.message) || String(e)));
    return;
  }

  lines.push('  ชื่อที่ระบบตั้งให้ : ' + row['Saved_File_Name']);
  lines.push('  ชื่อเดิมของผู้ใช้  : ' + row['Original_File_Name']);
  lines.push('  ลำดับในหัวข้อนี้   : ' + row['Seq']);
  lines.push('  File_ID           : ' + row['File_ID']);
  lines.push('  Drive_File_ID     : ' + row['Drive_File_ID']);
  lines.push('  ลิงก์             : ' + row['File_URL']);

  var info = driveFileInfo_(row['Drive_File_ID']);
  if (!info) {
    score.fail++;
    lines.push('  !! เขียนแถวลงทะเบียนแล้ว แต่เปิดไฟล์บน Drive ไม่ได้ — สองฝั่งไม่ตรงกัน');
  } else {
    lines.push('  ไฟล์จริงบน Drive  : "' + info.name + '" · ' + info.size + ' ไบต์ · ' + info.mimeType);
    if (info.size <= 0) {
      score.fail++;
      lines.push('  !! ไฟล์ขนาดศูนย์ไบต์ — คำสั่งสำเร็จแต่ไม่ได้ทำสิ่งที่ตั้งใจ (กฎข้อ 32)');
    }
  }

  filesProbeCleanup_(lines, score, row);
}

/**
 * ลบไฟล์ทดสอบแล้วอ่านกลับเพื่อยืนยัน — ห้ามเชื่อว่าลบแล้วเพราะคำสั่งไม่โยน error
 *
 * ลบสองชั้นโดยตั้งใจ ชั้นแรกคือ removeFile() ซึ่งเป็นเส้นทางจริงของผู้ใช้
 * (ย้ายลงถังขยะ + Is_Active=false) ชั้นที่สองคือลบแถวในทะเบียนทิ้งจริง ๆ
 *
 * ชั้นที่สองเป็นข้อยกเว้นของกฎ "ห้ามลบแถว" อย่างมีเหตุผล — แถวนี้เกิดจากเครื่องมือตรวจ
 * ไม่ใช่จากผู้ใช้ ไม่เคยมีใครเห็น และถ้าทิ้งไว้ ใบงานจริงจะมีไฟล์ผีค้างอยู่ในทะเบียน
 * ตลอดไป พร้อมกินเลขลำดับของหัวข้อนั้นไปหนึ่งเลข
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} score ตัวนับจุดที่ต้องแก้
 * @param {Object} row แถวไฟล์ที่เพิ่งสร้าง
 */
function filesProbeCleanup_(lines, score, row) {
  var driveId = row['Drive_File_ID'];

  try {
    removeFile(row['File_ID']);
  } catch (e) {
    score.fail++;
    lines.push('  !! ลบไฟล์ทดสอบไม่สำเร็จ: ' + ((e && e.message) || String(e)));
    lines.push('  !! ต้องไปลบด้วยมือ: ' + row['Saved_File_Name'] + ' (' + row['File_ID'] + ')');
    return;
  }

  /* ---------- อ่านกลับจาก Drive ---------- */
  var after = driveFileInfo_(driveId);
  if (after && after.trashed) {
    lines.push('  ลบแล้ว (Drive)    : อยู่ในถังขยะ กู้คืนได้ ตามที่ระบบออกแบบไว้');
  } else if (after) {
    score.fail++;
    lines.push('  !! ไฟล์บน Drive ยังไม่อยู่ในถังขยะ — คำสั่งลบสำเร็จแต่ไม่ได้ลบ');
    lines.push('  !! ต้องไปลบด้วยมือ: ' + after.name);
  } else {
    lines.push('  ลบแล้ว (Drive)    : เปิดไม่ได้อีกแล้ว');
  }

  /* ---------- ลบแถวในทะเบียนแล้วอ่านกลับ ---------- */
  try {
    var removed = db_delete_(SHEET.FILE_INDEX, { 'File_ID': row['File_ID'] });
    clearRowCache_(SHEET.FILE_INDEX);
    var left = db_select_(SHEET.FILE_INDEX, { filters: { 'File_ID': row['File_ID'] }, limit: 1 });
    if (left.length) {
      score.fail++;
      lines.push('  !! ลบแถวในทะเบียนแล้วแต่ยังอ่านเจออยู่ — ' + row['File_ID']);
    } else {
      lines.push('  ลบแล้ว (ทะเบียน)  : ลบได้ ' + removed.length + ' แถว อ่านกลับแล้วไม่เหลือ');
    }
  } catch (e) {
    score.fail++;
    lines.push('  !! ลบแถวในทะเบียนไม่สำเร็จ: ' + ((e && e.message) || String(e)));
  }
}

/**
 * ออกใบสั่งงานจริงหนึ่งฉบับ แล้วยืนยันว่าลิงก์ถูกเขียนกลับลงฐานข้อมูล
 *
 * เรียก generateWorkOrderReport() ตัวเต็ม ไม่ใช่ tryGenerateWorkOrderReport_()
 * เพราะตัวหลังกลืนความผิดพลาดไว้โดยตั้งใจ (SPEC 16.1) ซึ่งถูกสำหรับการใช้งานจริง
 * แต่เป็นสิ่งที่เครื่องมือตรวจต้องไม่ทำ — เรามาที่นี่เพื่ออ่านข้อความผิดพลาดตัวจริง
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} score ตัวนับจุดที่ต้องแก้
 * @param {Object} wo แถวใบงาน
 */
function filesProbeReport_(lines, score, wo) {
  lines.push('');
  lines.push('########## 5. ออกใบสั่งงาน (PDF) ##########');

  var before = String(wo['Report_URL'] || '');
  var result;
  try {
    result = generateWorkOrderReport(wo['WO_ID'], null);
  } catch (e) {
    score.fail++;
    lines.push('  !! ออกเอกสารไม่สำเร็จ: ' + ((e && e.message) || String(e)));
    return;
  }

  lines.push('  ฉบับที่          : ' + result.version);
  lines.push('  ลิงก์            : ' + result.url);

  var info = driveFileInfo_(result.fileId);
  if (!info) {
    score.fail++;
    lines.push('  !! สั่งออกสำเร็จแต่เปิดไฟล์ PDF ไม่ได้');
  } else {
    lines.push('  ไฟล์จริงบน Drive : "' + info.name + '" · ' + info.size + ' ไบต์ · ' + info.mimeType);
    if (info.size <= 0) {
      score.fail++;
      lines.push('  !! PDF ขนาดศูนย์ไบต์ — ออกมาเป็นก้อนว่าง');
    }
  }

  /* ---------- Report_URL ถูกเขียนกลับจริงไหม ---------- */
  /*
   * อ่านกลับจากฐานข้อมูลโดยตรง ไม่ใช่เชื่อค่าที่ฟังก์ชันคืนมา · การเขียนกลับ
   * เป็นคนละคำสั่งกับการสร้างไฟล์ และล้มแยกกันได้ ถ้าลิงก์ไม่ถูกเขียน
   * หน้ารายละเอียดจะไม่มีปุ่มเปิดเอกสาร ทั้งที่เอกสารออกมาเรียบร้อยแล้ว
   */
  clearRowCache_(SHEET.WORK_ORDER);
  var rows = db_select_(SHEET.WORK_ORDER, { filters: { 'WO_ID': wo['WO_ID'] }, limit: 1 });
  var after = rows.length ? String(rows[0]['Report_URL'] || '') : '';

  if (after && after === result.url) {
    lines.push('  Report_URL       : เขียนกลับแล้ว ตรงกับไฟล์ที่เพิ่งออก');
  } else if (after) {
    score.fail++;
    lines.push('  !! Report_URL ในฐานข้อมูลไม่ตรงกับไฟล์ที่เพิ่งออก');
    lines.push('     ในฐานข้อมูล : ' + after);
    lines.push('     เพิ่งออก    : ' + result.url);
  } else {
    score.fail++;
    lines.push('  !! Report_URL ว่างหลังออกเอกสาร — ไฟล์ออกมาแล้วแต่ไม่มีใครหาเจอจากหน้าจอ');
  }

  if (before) {
    lines.push('  ฉบับเดิม         : ย้ายเข้า _archive แล้ว (' + before + ')');
  }

  filesProbeArchive_(lines, score, rows.length ? rows[0] : wo);
}

/**
 * รายชื่อฉบับเก่าใน _archive — ชื่อไฟล์ ไม่ใช่แค่จำนวนหรือลิงก์
 *
 * SPEC 16.1 บอกว่าฉบับเดิมต้องย้ายเข้า _archive **พร้อมเลขเวอร์ชันและวันเวลา**
 * ซึ่งเป็นเรื่องที่ตรวจจากลิงก์ไม่ได้เลย ต้องเห็นชื่อ · ถ้าทุกฉบับชื่อเหมือนกันหมด
 * จะไม่มีทางรู้ว่าฉบับไหนคือฉบับที่ผู้อนุมัติเห็นตอนกดอนุมัติ แยกได้แค่จากวันที่แก้ไข
 * ซึ่งขยับทุกครั้งที่มีอะไรไปแตะไฟล์
 *
 * @param {string[]} lines บรรทัดผลลัพธ์ที่กำลังสะสมอยู่
 * @param {Object} score ตัวนับจุดที่ต้องแก้
 * @param {Object} wo แถวใบงานฉบับล่าสุดที่อ่านกลับมาแล้ว
 */
function filesProbeArchive_(lines, score, wo) {
  var old = reportArchiveList_(wo);

  lines.push('  ฉบับเก่าใน _archive : ' + old.length + ' ไฟล์');
  if (!old.length) {
    lines.push('    (ว่าง — ใบนี้เพิ่งออกเอกสารฉบับแรก จึงยังไม่มีฉบับเก่าให้เก็บ)');
    return;
  }

  var seen = {};
  var repeated = 0;
  for (var i = 0; i < old.length; i++) {
    lines.push('    ' + old[i].name);
    if (seen[old[i].name]) repeated++;
    seen[old[i].name] = true;
  }

  if (repeated) {
    score.fail++;
    lines.push('  !! มีชื่อซ้ำกัน ' + repeated + ' ไฟล์ — แยกไม่ออกว่าฉบับไหนคือฉบับไหน (SPEC 16.1)');
  }
}

/**
 * เทียบตัวเลขบนเมนูย่อยกับจำนวนที่หน้ารายการของแผนกแสดงจริง
 *
 * ตัวเลขบนเมนูมาจากฟังก์ชันนับใน Postgres ส่วนรายการมาจากการอ่านแบบแบ่งหน้า
 * คนละเส้นทางกันคนละฝั่ง · เมื่อสองตัวไม่ตรง ต้องรู้ให้ได้ว่าฝั่งไหนพูดความจริง
 * ก่อนจะไปแก้อะไร และต้องรู้จากข้อมูลจริง ไม่ใช่จากของจำลอง
 *
 * @return {string} รายงานที่อ่านได้ทันที
 */
function checkTaskCounts() {
  clearTaskCountCache_();

  var lines = ['เทียบตัวเลขบนเมนูกับจำนวนที่หน้ารายการแสดงจริง'];
  var depts = knownDepartments_();
  var wrong = 0;

  for (var d = 0; d < depts.length; d++) {
    var counts = taskCountsForDepartment_(depts[d]);
    lines.push('แผนก ' + depts[d]);

    for (var v = 0; v < TASK_VIEWS.length; v++) {
      var view = TASK_VIEWS[v];
      var got = listTaskPage_(depts[d], { view: view.key, page: 1 });
      var same = Number(counts[view.key] || 0) === Number(got.total || 0);
      if (!same) wrong++;

      lines.push('  ' + view.label + ' (' + view.key + ') · เมนูบอก ' +
        counts[view.key] + ' · รายการนับได้ ' + got.total +
        ' · หน้าแรกมี ' + got.rows.length + ' แถว' + (same ? '' : '  <<< ไม่ตรง'));
    }
  }

  lines.push(wrong ? ('ไม่ตรงกัน ' + wrong + ' มุมมอง') : 'ตรงกันทุกมุมมอง');
  return adminSay_(lines.join(String.fromCharCode(10)));
}

/**
 * ตารางที่ถือ "ข้อมูลใบงาน" — ประกาศไว้ที่เดียว พร้อมคอลัมน์กุญแจของแต่ละตาราง
 *
 * ตารางแม่แบบและทะเบียนไม่อยู่ในนี้โดยตั้งใจ — ลูกค้า ประเภทงาน แม่แบบเอกสาร
 * หัวข้อไฟล์แนบ ทะเบียนผู้ใช้ และห้องแจ้งเตือน ต้องอยู่ต่อ เพราะระบบใหม่ใช้ของเดิม
 */
var WIPE_TABLES_ = Object.freeze([
  { sheet: SHEET.TASK_STEP,        key: 'Step_ID' },
  { sheet: SHEET.DEPARTMENT_TASK,  key: 'Task_ID' },
  { sheet: SHEET.FILE_INDEX,       key: 'File_ID' },
  { sheet: SHEET.WORK_ORDER,       key: 'WO_ID' },
  { sheet: SHEET.PROJECT_LOCATION, key: 'First_WO_ID' },
  { sheet: SHEET.AUDIT_LOG,        key: 'Log_ID' },
  { sheet: SHEET.SYSTEM_LOG,       key: 'Log_ID' },
  { sheet: SHEET.COUNTER,          key: 'Key' }
]);

/**
 * ล้างข้อมูลใบงานทั้งหมดเพื่อเริ่มระบบใหม่ — **ลบจริง กู้ไม่ได้**
 *
 * ต้องส่งคำยืนยันมาตรงตัวอักษร ไม่งั้นปฏิเสธทันที · เครื่องมือที่ลบข้อมูลจริงได้
 * ด้วยการกดครั้งเดียวคือกับดักที่รอคนเผลอ และผู้ที่กดผิดจะไม่มีทางกู้กลับ
 *
 * ลำดับสำคัญ: ย้ายโฟลเดอร์บน Drive ลงถังขยะ **ก่อน** ลบแถว เพราะรหัสโฟลเดอร์
 * อยู่ในแถวที่กำลังจะลบ · ลบแถวก่อนแล้วไฟล์จะค้างบน Drive โดยไม่มีอะไรชี้ถึงอีกเลย
 *
 * @param {string} confirm ต้องเป็น 'ลบข้อมูลใบงานทั้งหมด'
 * @return {string} รายงานที่อ่านได้ทันที
 */
function wipeWorkOrderData(confirm) {
  if (String(confirm || '') !== 'ลบข้อมูลใบงานทั้งหมด') {
    return adminSay_('ไม่ได้ลบอะไร — ต้องเรียกพร้อมคำยืนยัน: ' +
      "clasp run wipeWorkOrderData --params " + String.fromCharCode(39) +
      '["ลบข้อมูลใบงานทั้งหมด"]' + String.fromCharCode(39));
  }

  var lines = ['ล้างข้อมูลใบงานทั้งหมดเพื่อเริ่มระบบใหม่'];

  /* ---------- Drive ก่อน เพราะรหัสโฟลเดอร์อยู่ในแถวที่จะลบ ---------- */
  var folders = 0, folderFail = 0;
  var wos = queryRows_(SHEET.WORK_ORDER, {}, { limit: 1000 });
  for (var w = 0; w < wos.length; w++) {
    var folderId = String(wos[w]['Folder_ID'] || '');
    if (!folderId) continue;
    if (trashFolder_(folderId)) folders++; else folderFail++;
  }
  lines.push('โฟลเดอร์บน Drive: ย้ายลงถังขยะ ' + folders + ' โฟลเดอร์' +
    (folderFail ? ' · เปิดไม่ได้ ' + folderFail + ' โฟลเดอร์' : ''));

  /* ---------- แล้วค่อยลบแถว ---------- */
  var total = 0, problems = [];
  for (var i = 0; i < WIPE_TABLES_.length; i++) {
    var one = WIPE_TABLES_[i];
    var before = queryRows_(one.sheet, {}, { limit: 5000 }).length;

    if (before) {
      var filters = {};
      filters[one.key] = { op: 'neq', value: '__ไม่มีค่านี้อยู่จริง__' };
      db_delete_(one.sheet, filters);
    }

    /*
     * อ่านกลับเพื่อยืนยัน ห้ามเชื่อว่าลบแล้วเพราะคำสั่งไม่โยน error
     * นี่คือกติกาเดียวกับที่ใช้กับการล้างข้อมูลทดสอบ
     */
    var after = queryRows_(one.sheet, {}, { limit: 5000 }).length;
    total += before - after;
    lines.push('  ' + one.sheet + ': ' + before + ' → ' + after + ' แถว');
    if (after) problems.push(one.sheet + ' เหลือ ' + after + ' แถว');
  }

  clearRowCache_();
  clearDashboardCache_();
  clearTaskCountCache_();

  lines.push('ลบไปทั้งหมด ' + total + ' แถว');
  lines.push(problems.length ? ('!! ยังไม่ว่าง: ' + problems.join(' · '))
    : 'ทุกตารางว่างแล้ว · เลขใบงานจะเริ่มนับใหม่');
  return adminSay_(lines.join(String.fromCharCode(10)));
}
