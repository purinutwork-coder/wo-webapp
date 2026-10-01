/**
 * 10_Web.gs — ตัวจัดเส้นทางของหน้าเว็บ (doGet) และตัวช่วยประกอบไฟล์ HTML
 *
 * ไฟล์นี้ไม่มีตรรกะธุรกิจและไม่แตะชีตเลย — หน้าเว็บคุยกับระบบผ่าน 09_Api.gs เท่านั้น
 * และการตรวจสิทธิ์ทั้งหมดอยู่ที่ชั้นนั้น (กฎข้อ 7) การเลือกว่าจะแสดงหน้าไหน
 * ไม่ใช่การให้สิทธิ์ ผู้ใช้เปิดหน้า Approve ได้แต่จะกดอะไรไม่ได้ถ้าไม่ใช่ผู้อนุมัติ
 *
 * หน้าที่เปิดได้ตาม SPEC หัวข้อ 17.2
 *   ?page=create (ค่าเริ่มต้น)  หน้าสร้าง / แก้ไขใบงาน · เติม &wo=WO-2609-0001 เพื่อแก้ไขใบเดิม
 *   ?page=approve               หน้าอนุมัติของสาย Service / Project
 *   ?page=work                  งานของแผนก Service และ Project
 *   ?page=lab                   งานของแผนก Lab
 *   ?page=whoami                หน้าตรวจสอบตัวตนสำหรับไล่ปัญหา เปิดด้วย Script Property ชื่อ WHOAMI
 */

/*
 * ไม่มีหน้า "เข้าสู่ระบบ" แยกอีกแล้ว (SPEC 17.3)
 *
 * หน้าเว็บอยู่ในกรอบที่เปลี่ยนหน้าต่างชั้นนอกได้เฉพาะตอนผู้ใช้กดจริง การพาไปหน้า
 * เข้าสู่ระบบเองตอนยังไม่ได้ล็อกอินหรือตอนโทเคนหมดอายุ จึงถูกเบราว์เซอร์บล็อกเสมอ
 * ทุกหน้าจึงวาดแผงเข้าสู่ระบบทับในหน้าเดิมแทน (ui_Auth.html)
 *
 * ที่อยู่เดิม ?page=login ที่ใครบุ๊กมาร์กไว้ ยังเปิดได้ตามปกติ — ชื่อหน้าที่ไม่รู้จัก
 * จะตกมาที่หน้าแรก แล้วแผงเข้าสู่ระบบจะขึ้นเองถ้ายังไม่ได้ล็อกอิน
 */

/** หน้าที่เปิดได้ และไฟล์ HTML ของแต่ละหน้า */
var WEB_PAGES = Object.freeze({
  home:    { file: 'ui_Home',      title: 'ระบบใบสั่งงาน' },
  // รายการใบงานที่ย้ายออกมาจากหน้าแรก · หน้าแรกเป็นแดชบอร์ดแทนแล้ว (SPEC 17.3)
  wolist:  { file: 'ui_WoList',    title: 'ใบงานทั้งหมด' },
  create:  { file: 'ui_CreateWo',  title: 'สร้าง / แก้ไขใบสั่งงาน' },
  // หน้าอนุมัติใช้ไฟล์เดียวกันทั้งสองสาย ต่างกันแค่สายที่ขอมา
  // สาย Lab ไม่มีงานร่วม จึงไม่ต้องเลือกแผนกตอนอนุมัติ ซึ่งหน้ารู้ได้จากสายที่ส่งมา
  approve:    { file: 'ui_Approve', title: 'อนุมัติใบสั่งงาน (Service / Project)', route: 'SP' },
  labapprove: { file: 'ui_Approve', title: 'อนุมัติใบสั่งงาน (Lab)', route: 'LAB' },
  // Service กับ Project ใช้ไฟล์เดียวกัน เพราะ SPEC 17.2 นับเป็นหน้าจอเดียว
  // และต่างกันแค่คำว่า "ขั้นตอน" กับ "งวดงาน" ซึ่งมาจากข้อมูลในตาราง Task_Step ไม่ใช่จากโค้ด
  // หน้าจะรู้เองว่าผู้ใช้อยู่แผนกไหนจากทะเบียนผู้ใช้ ไม่ได้ดูจาก URL
  work:    { file: 'ui_DeptWork',  title: 'งานของแผนก' },
  lab:     { file: 'ui_LabWork',   title: 'งานแล็บ' },
  returned: { file: 'ui_Returned', title: 'ใบงานที่ถูกตีกลับ' },
  // หน้าอ่านอย่างเดียว เปิดด้วย ?page=wo&id=WO-2609-0001 · ทุก Role เปิดได้ (SPEC 2)
  wo:       { file: 'ui_WoDetail', title: 'รายละเอียดใบสั่งงาน' },
  /*
   * เครื่องมือวัดว่าเบราว์เซอร์เปิดไฟล์จากไบต์ได้ด้วยวิธีไหน (กฎข้อ 34)
   *
   * ไม่มีในเมนูโดยตั้งใจ เปิดด้วย ?page=filecheck เท่านั้น · ไม่ใช่หน้าใช้งาน
   * และปลายทางที่มันเรียกเปิดให้เฉพาะ ADMIN · ที่ต้องเป็นหน้าจริงไม่ใช่สคริปต์
   * ในตัวแก้ไข เพราะคำถามที่ต้องตอบเป็นคำถามของเบราว์เซอร์ ไม่ใช่ของเซิร์ฟเวอร์
   * และคำตอบต่างกันระหว่างคอมพิวเตอร์กับมือถือ
   */
  filecheck: { file: 'ui_FileCheck', title: 'ตรวจการเปิดไฟล์' }
});

/** หน้าที่ใช้เมื่อไม่ได้ระบุ page มา หรือระบุมาไม่ตรงกับที่มี */
// หน้าเริ่มต้นคือ Home เพื่อให้ผู้ใช้เห็นเมนูทั้งหมดก่อนว่าระบบมีอะไรบ้าง (SPEC 17.2)
var WEB_DEFAULT_PAGE = 'home';

/**
 * จุดเข้าของเว็บแอป — อ่าน e.parameter.page แล้วส่งไฟล์ HTML ที่ตรงกัน
 * @param {Object} e อีเวนต์จาก Apps Script (มี parameter ของ query string)
 * @return {HtmlOutput}
 */
async function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var requested = String(params.page || WEB_DEFAULT_PAGE);

  // เปิดให้แตะชีตได้ตลอดคำขอนี้ — doGet เป็นทางเข้าที่ถูกต้องทางหนึ่ง (ดู 00_Config.gs)
  beginAnonymousRequest_();
  try {
    return await doGetRoute_(requested, params);
  } finally {
    endRequest_();
  }
}

/**
 * เลือกว่าจะตอบอะไรให้คำขอ doGet หนึ่งครั้ง
 * @param {string} requested ชื่อหน้าที่ขอมา
 * @param {Object} params ค่าจาก query string
 * @return {HtmlOutput|TextOutput}
 */
async function doGetRoute_(requested, params) {
  // หน้าตรวจสอบตัวตนคืนข้อความธรรมดาอยู่แล้ว จึงแยกออกมาก่อนเข้าเส้นทางปกติ
  if (requested === WHOAMI_PAGE) return await whoamiOutput_();

  /*
   * ตอนนี้เหลือโปรเจกต์เดียว เบราว์เซอร์จึงเปิดตัวนี้ตรง ๆ
   *
   * ขั้นนี้ยังไม่รู้ว่าใครเป็นคนเปิด เพราะตัวตนอยู่ในโทเคนที่เก็บไว้ในเบราว์เซอร์
   * และห้ามส่งโทเคนผ่าน URL เด็ดขาด · หน้าที่ส่งออกไปจึงเป็นโครงเปล่า
   * แล้วหน้านั้นจะขอข้อมูลของตัวเองด้วย api_pageData ในคำขอเดียว
   *
   * ผู้ที่ยังไม่ล็อกอินจะได้ข้อมูลไม่ได้ แล้วหน้าเว็บจะวาดแผงเข้าสู่ระบบทับหน้าเดิมเอง
   * (ไม่พาไปหน้าอื่น เพราะกรอบของ Apps Script บล็อกการเปลี่ยนหน้าที่ผู้ใช้ไม่ได้กด)
   * การตรวจสิทธิ์จริงยังอยู่ที่ชั้น 09_Api เหมือนเดิมทุกข้อ
   */
  return htmlOut_(await renderPage_(params), requested);
}

/**
 * ส่งหน้าเว็บออกไปให้เบราว์เซอร์โดยตรง
 *
 * ต้องตั้ง XFrameOptionsMode เป็น ALLOWALL มิฉะนั้น Apps Script จะไม่ยอมให้หน้าแสดงผล
 * ในกรอบของตัวเอง แล้วผู้ใช้จะเห็นหน้าว่างเปล่าโดยไม่มีข้อความอธิบายใด ๆ
 *
 * @param {string} html เนื้อหน้าเว็บ
 * @param {string} page ชื่อหน้า ใช้ตั้งชื่อแท็บของเบราว์เซอร์
 * @return {HtmlOutput}
 */
function htmlOut_(html, page) {
  var known = Object.prototype.hasOwnProperty.call(WEB_PAGES, page) ? page : WEB_DEFAULT_PAGE;
  return HtmlService.createHtmlOutput(String(html))
    .setTitle(WEB_PAGES[known].title)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------------------------------------------------------------------
 * ทางเข้าจากโปรเจกต์หน้าบ้าน
 *
 * ระบบแยกเป็นสองโปรเจกต์ Apps Script เพื่อไม่ต้องแชร์ Google Sheet ให้ผู้ใช้ทุกคน
 *   หน้าบ้าน  ผู้ใช้เปิดตัวนี้ · อ่านอีเมลจริงจาก Session ได้ · ไม่แตะข้อมูลเลย
 *   ตัวนี้     ถือข้อมูลทั้งหมด · ไม่มีผู้ใช้คนไหนเปิดได้โดยตรง · รับคำขอจากหน้าบ้านเท่านั้น
 *
 * ถ้าไม่แยก ผู้ใช้ทุกคนต้องมีสิทธิ์แก้ไขชีต ซึ่งเท่ากับเปิดให้ทุกคนดาวน์โหลดฐานลูกค้าทั้งบริษัทได้
 * --------------------------------------------------------------------------- */

/**
 * ทางเข้าจากโปรเจกต์หน้าบ้าน "ปิดใช้งานแล้ว"
 *
 * ระบบเลิกพึ่งบัญชี Google ระบุตัวตนแล้ว จึงไม่ต้องแยกสองโปรเจกต์อีก
 * เหลือโปรเจกต์เดียวที่เบราว์เซอร์เปิดตรง ๆ ซึ่งเร็วกว่าเพราะตัดการเดินทางออกไปหนึ่งต่อ
 *
 * โค้ดทั้งบล็อกนี้ยังไม่ถูกลบ เพื่อให้ถอยกลับได้ทันทีถ้าการเปลี่ยนวิธีระบุตัวตนมีปัญหา
 * ปิดด้วยธงตัวเดียวที่นี่ ไม่ได้แก้กระจาย · ลบทั้งบล็อกได้เมื่อมั่นใจแล้ว
 * และเมื่อลบ ให้ลบ GATEWAY_SECRET กับ BACKEND_URL ใน Script Properties ด้วย
 */
var GATEWAY_ENABLED = false;

/** ชื่อ Script Property ที่เก็บรหัสลับร่วมระหว่างสองโปรเจกต์ */
var GATEWAY_SECRET_PROP = 'GATEWAY_SECRET';

/** ข้อความเดียวที่ตอบกลับเมื่อรหัสลับไม่ตรง — ไม่บอกเหตุผล ไม่บอกว่าผิดตรงไหน */
var GATEWAY_ONLY_MESSAGE = 'ไม่สามารถให้บริการคำขอนี้ได้';

/**
 * ชนิดของคำขอที่รับได้ — รายชื่อตายตัวเหมือนทะเบียนรายการ
 *   PAGE  ขอหน้าเว็บมาแสดง (ไม่ใช่ api_ จึงต้องมีที่ทางของตัวเอง)
 *   API   เรียกรายการใน apiActions_()
 *   DIAG  ขอรายชื่อที่ยอมรับ เพื่อไล่ปัญหาชื่อไม่ตรงกัน — เปิดเฉพาะตอน WHOAMI เปิด
 */
var GATEWAY_MODE = Object.freeze({ PAGE: 'page', API: 'api', DIAG: 'diag' });

/**
 * ข้อความเมื่อเรียกสิ่งที่ไม่อยู่ในรายชื่อ
 *
 * ตอนปกติบอกสั้น ๆ ไม่บอกว่าอะไรถูกปฏิเสธ เพราะการบอกชื่อกลับไปเท่ากับ
 * ให้คนที่ยิงสุ่มมาใช้เป็นเครื่องมือไล่หาว่าฟังก์ชันไหนมีอยู่จริง
 * แต่ตอน WHOAMI เปิด (โหมดไล่ปัญหา) ให้บอกชื่อที่ถูกปฏิเสธด้วย
 * เพราะตอนนั้นผู้ดูแลกำลังหาสาเหตุอยู่ และการเดาเองเสียเวลามาก
 *
 * @param {string} what สิ่งที่ถูกปฏิเสธ
 * @return {string}
 */
function unknownActionMessage_(what) {
  var base = 'ไม่รู้จักรายการที่เรียก';
  if (!whoamiIsOn_()) return base;
  return base + ' — ที่ส่งมาคือ ' + what + ' · ดูรายชื่อที่รับได้ที่หน้า ?page=diag';
}

/**
 * โหมดไล่ปัญหาเปิดอยู่หรือไม่ (Script Property ชื่อ WHOAMI)
 * @return {boolean}
 */
function whoamiIsOn_() {
  try {
    return whoamiEnabled_(getProp_(WHOAMI_PROP, false));
  } catch (e) {
    return false;
  }
}

/**
 * รายชื่อทุกอย่างที่ฝั่งนี้ยอมรับ พร้อมรายชื่อที่หน้าเว็บจะเรียกจริง
 *
 * มีไว้เทียบสองฝั่งให้เห็นในหน้าเดียว ปัญหา "ชื่อไม่ตรงกัน" จะได้ไม่ต้องเดาอีก
 * ตัว calledByPages อ่านจากไฟล์หน้าเว็บจริง จึงจับได้ทันทีว่าหน้าไหนเรียกชื่อที่ไม่มีในทะเบียน
 *
 * @return {Object} {ok, data} หรือ {ok:false} เมื่อโหมดไล่ปัญหาปิดอยู่
 */
async function diagReport_() {
  if (!whoamiIsOn_()) {
    return { ok: false, message: 'หน้าไล่ปัญหาปิดอยู่' };
  }

  /*
   * รายชื่อที่ยอมรับต้องรวมรายการที่เรียกได้ก่อนล็อกอินด้วย ไม่งั้นหน้าเข้าสู่ระบบ
   * จะถูกรายงานว่าเรียกชื่อที่ไม่มีในทะเบียน ทั้งที่เป็นรายการที่ตั้งใจเปิดไว้
   */
  var actions = listApiFunctionNames_();
  for (var publicName in apiPublicActions_()) {
    if (Object.prototype.hasOwnProperty.call(apiPublicActions_(), publicName)) {
      actions.push(publicName);
    }
  }
  var called = callApiNamesInPages_();
  var missing = [];
  for (var i = 0; i < called.length; i++) {
    if (actions.indexOf(called[i]) === -1) missing.push(called[i]);
  }

  return {
    ok: true,
    data: {
      modes: [GATEWAY_MODE.PAGE, GATEWAY_MODE.API, GATEWAY_MODE.DIAG],
      pages: Object.keys(WEB_PAGES).sort(),
      actions: actions,
      // รายชื่อคำขอที่ลองใหม่อัตโนมัติได้ — หน้าบ้านถือสำเนาไว้ ต้องตรงกับรายการนี้เสมอ
      // ถ้าสองฝั่งหลุดจากกัน คำขอที่เขียนข้อมูลอาจถูกยิงซ้ำจนได้ข้อมูลสองชุด
      readOnly: apiReadOnlyActions_(),
      calledByPages: called,
      missing: missing,
      bootstrap: await bootstrapDiag_()
    }
  };
}

/**
 * เทียบก้อนข้อมูลที่ฝังลงแต่ละหน้า กับคีย์ที่หน้านั้นประกาศว่าต้องใช้
 *
 * มีไว้ไล่ปัญหา "หน้าขึ้นมาแต่เนื้อหาว่างหรือพัง" ซึ่งเกิดจากสองฝั่งพูดคนละรูปแบบ
 * อาการแบบนี้ดูจากหน้าจอไม่ออกเลย เพราะแถบเมนูด้านบนถูกต้องทุกอย่าง
 *
 * @return {Object[]} [{page, keys, needs, missing}]
 */
async function bootstrapDiag_() {
  var pages = Object.keys(WEB_PAGES).sort();
  var out = [];

  for (var i = 0; i < pages.length; i++) {
    var page = pages[i];
    var row = { page: page, keys: [], needs: [], missing: [] };

    try {
      var boot = await pageBootstrap_(page, {});
      for (var key in boot) {
        if (Object.prototype.hasOwnProperty.call(boot, key)) row.keys.push(key);
      }
      row.keys.sort();

      var source = HtmlService.createHtmlOutputFromFile(WEB_PAGES[page].file).getContent();
      var found = /var\s+PAGE_NEEDS\s*=\s*\[([^\]]*)\]/.exec(source);
      if (found) {
        var parts = found[1].split(',');
        for (var p = 0; p < parts.length; p++) {
          var name = parts[p].replace(/['"\s]/g, '');
          if (!name) continue;
          row.needs.push(name);
          if (boot[name] === undefined || boot[name] === null) row.missing.push(name);
        }
      }
    } catch (e) {
      row.missing.push('อ่านไม่ได้: ' + ((e && e.message) ? e.message : String(e)));
    }
    out.push(row);
  }
  return out;
}

/**
 * ชื่อรายการที่ไฟล์หน้าเว็บเรียกจริง — อ่านจากตัวไฟล์ ไม่ได้จดไว้ซ้ำที่ไหน
 * รายการที่หน้าเว็บเรียกด้วยตัวแปรจะไม่ถูกจับ จึงเป็นรายชื่อขั้นต่ำ ไม่ใช่ทั้งหมด
 * @return {string[]}
 */
function callApiNamesInPages_() {
  // ต้องครบทุกไฟล์ที่เรียกรายการได้จริง รวมแผงเข้าสู่ระบบซึ่งเรียก api_login ก่อนมีโทเคน
  var files = ['ui_Home', 'ui_WoList', 'ui_CreateWo', 'ui_Approve', 'ui_DeptWork', 'ui_LabWork',
    'ui_Returned', 'ui_Reports', 'ui_Nav', 'ui_Auth'];
  var found = {};

  for (var i = 0; i < files.length; i++) {
    var source = '';
    try {
      source = HtmlService.createHtmlOutputFromFile(files[i]).getContent();
    } catch (e) {
      continue;
    }
    var matches = source.match(/callApi\(\s*'([A-Za-z0-9_]+)'/g) || [];
    for (var m = 0; m < matches.length; m++) {
      found[/'([A-Za-z0-9_]+)'/.exec(matches[m])[1]] = true;
    }
  }

  var names = [];
  for (var key in found) {
    if (Object.prototype.hasOwnProperty.call(found, key)) names.push(key);
  }
  names.sort();
  return names;
}

/**
 * ข้อมูลตั้งต้นที่ฝังไปกับหน้า — ตัวตน เมนู และข้อมูลของหน้านั้น (SPEC 17.3)
 *
 * เป้าหมายคือเปิดหนึ่งหน้า คุยกับเซิร์ฟเวอร์ครั้งเดียว
 *
 * ทุกก้อนผ่าน jsonSafe_ เหมือนเส้นทาง api_ ปกติ เพราะเป็นข้อมูลชุดเดียวกัน
 * และผ่าน apiRun_ เหมือนกัน ความผิดพลาดของข้อมูลหน้าหนึ่งจึงไม่ทำให้ทั้งหน้าพัง —
 * หน้าจะยังขึ้นมาพร้อมเมนูและปุ่มกลับหน้าแรก แล้วแสดงข้อความผิดพลาดอยู่ข้างใน
 *
 * ข้อจำกัดของการอัปโหลดมากับทุกหน้า ไม่ใช่เฉพาะหน้าที่นึกได้ว่าจะแนบไฟล์
 * เพราะหน้าที่ลืมขอค่านี้จะแนบไฟล์ไม่ได้เลยแบบเงียบ ๆ — เคยเกิดมาแล้วกับหน้างานของแผนก
 * ซึ่งเทียบขนาดไฟล์กับเพดาน 0 ไบต์ที่ค้างอยู่ในค่าตั้งต้น แล้วปฏิเสธทุกไฟล์
 * โดยขึ้นข้อความว่า "เกิน  ต่อไฟล์" ที่ไม่มีตัวเลขใด ๆ อยู่ในนั้น
 *
 * @param {string} page ชื่อหน้า
 * @param {Object} params ค่าที่หน้าบ้านส่งมา
 * @return {Object} {user, menu, labels, upload, error} บวกคีย์ของหน้านั้นที่ระดับเดียวกัน
 */
/**
 * คีย์ที่ข้อมูลของหน้าส่งซ้ำมาได้ เพราะหมายถึงสิ่งเดียวกันกับที่ระดับบน (SPEC 17.4)
 *
 * รายการนี้ต้องสั้นที่สุดเท่าที่จะเป็นไปได้ · ทุกชื่อที่อยู่ในนี้คือชื่อที่การชนกัน
 * จะไม่มีใครฟ้อง จึงต้องใส่เฉพาะตัวที่หมายถึงสิ่งเดียวกันจริง ๆ ไม่ใช่ใส่เพื่อให้เงียบ
 */
var BOOT_SAME_AS_TOP_ = Object.freeze(['user', 'labels', 'upload', 'counts']);

async function pageBootstrap_(page, params) {
  var boot = { user: null, menu: [], groups: [], counts: null,
    labels: null, upload: uploadLimits_(),
    // นิยามของมุมมองงานแผนกมาจาก TASK_VIEWS ที่เดียว หน้าเว็บจึงไม่มีรายการสถานะของตัวเอง
    taskViews: TASK_VIEWS, defaultView: DEFAULT_TASK_VIEW,
    error: '' };

  try {
    var user = await getCurrentUser_();
    boot.user = jsonSafe_(user);
    boot.menu = jsonSafe_(menuForUser_(user));
    /*
     * โครงเมนู 6 กลุ่มของแถบซ้าย (SPEC 17.3) — เป็นการจัดกลุ่มเพื่อแสดงผลเท่านั้น
     * สิทธิ์ทั้งหมดยังมาจาก boot.menu ชุดเดิม ไม่มีการตัดสินสิทธิ์รอบสองที่นี่
     */
    boot.groups = jsonSafe_(menuGroupsForUser_(menuForUser_(user)));
    /*
     * จำนวนงานของแผนกตัวเอง ติดไปกับทุกหน้าในคำขอเดียวกัน (SPEC 17.3)
     * ห้ามให้แถบเมนูยิงขอทีละเมนู เพราะหกเมนูย่อยคือหกคำขอต่อการเปิดหนึ่งหน้า
     */
    boot.counts = user.department ? await taskCountsForDepartment_(user.department) : null;
    boot.labels = jsonSafe_(uiLabels_());
  } catch (e) {
    // ระบุตัวตนไม่ได้ หรือไม่อยู่ในทะเบียน — หน้ายังต้องขึ้นมาพร้อมข้อความอธิบาย
    boot.error = userFacingMessage_(e);
    return boot;
  }

  // ข้อมูลของหน้านั้น ๆ — ถ้าหน้าไหนไม่มีข้อมูลตั้งต้นก็ไม่ต้องมีในตารางนี้
  var loaders = {
    // หน้าแรกได้ยอดทั้งชุดมาพร้อมกันเลย จะได้ไม่ต้องยิงถามซ้ำตอนเปิด (SPEC 17.4)
    home:       async function () { return await api_getDashboard(); },
    // หน้ารายการได้หน้าแรกของรายการมาพร้อมกัน ด้วยเหตุผลเดียวกัน
    wolist:     async function () { return await api_listWorkOrders(webWoListQuery_(params)); },
    create:     async function () { return await api_getBootstrap(String(params.wo || '')); },
    approve:    async function () { return await api_listPendingApprovals(ROUTE.SP); },
    labapprove: async function () { return await api_listPendingApprovals(ROUTE.LAB); },
    /*
     * หน้าแผนกมีสองแหล่งข้อมูล ตามมุมมองที่เมนูย่อยเลือกมา (SPEC 17.3)
     *
     *   งานวันนี้   ฐานข้อมูลกรองด้วยวันนัดและสถานะมาให้ (กฎข้อ 28)
     *   มุมมองอื่น  ขอมาทุกสถานะครั้งเดียว แล้วสลับมุมมองในหน้าได้โดยไม่ยิงเพิ่ม
     *
     * ยังเป็นคำขอเดียวต่อการเปิดหนึ่งหน้าเหมือนเดิม ไม่ได้เพิ่มขึ้นเลย
     */
    work:       async function () { return await webTaskPageData_(params); },
    lab:        async function () { return await webTaskPageData_(params); },
    returned:   async function () { return await api_listReturnedWorkOrders(); },
    wo:         async function () { return await api_getWoDetail(String(params.id || params.wo || '')); }
  };

  if (!loaders[page] || !allowedPage_(boot.menu, page, String(params.dept || ''))) return boot;

  /*
   * คลี่เปลือก {ok, data} ออกแล้วรวมคีย์ข้างในขึ้นมาไว้ระดับเดียวกับ user และ menu
   *
   * เดิมฝังทั้งเปลือกลงไป หน้าเว็บจึงต้องแกะสองชั้นเอง ซึ่งไม่มีใครแกะ —
   * ทุกหน้าอ่าน data.rows, data.user, data.requestTypes ตรง ๆ แล้วได้ undefined
   * กลายเป็นหน้าขึ้นว่า "ยังไม่ได้ระบุแผนก" ทั้งที่ทะเบียนถูกต้อง
   * และหน้าสร้างใบงานพังตอนอ่าน user.displayName
   *
   * ระดับเดียวจึงเป็นสัญญาที่ตรวจได้: หน้าประกาศว่าต้องใช้คีย์อะไร แล้วเทียบตรง ๆ ได้เลย
   */
  var envelope = loaders[page]();
  if (!envelope.ok) {
    boot.error = envelope.message;
    return boot;
  }

  mergePageData_(boot, envelope.data || {}, page);
  return boot;
}

/**
 * รวมข้อมูลของหน้าขึ้นมาไว้ระดับเดียวกับตัวตนและเมนู แล้วโวยเมื่อชื่อชนกัน (SPEC 17.4)
 *
 * แยกออกมาเป็นฟังก์ชันของตัวเองเพื่อให้เทสต์ป้อนก้อนปลอมเข้าไปพิสูจน์ได้ว่า
 * ด่านนี้ดังจริง ไม่ใช่เชื่อว่าดังเพราะเขียนไว้แล้ว
 *
 * @param {Object} boot ก้อนข้อมูลตั้งต้น แก้ไขในที่
 * @param {Object} payload ข้อมูลของหน้านั้นที่คลี่เปลือก {ok, data} ออกแล้ว
 * @param {string} page ชื่อหน้า ใช้บอกในข้อความเมื่อชื่อชนกัน
 * @return {Object} boot ตัวเดิม
 */
function mergePageData_(boot, payload, page) {
  for (var key in payload) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;

    // คีย์เหล่านี้หมายถึงสิ่งเดียวกันกับที่ระดับบน ต้องเหลือแหล่งเดียว ไม่ให้สองที่หลุดจากกัน
    if (BOOT_SAME_AS_TOP_.indexOf(key) !== -1) continue;

    /*
     * ชื่อที่ชนกันโดยหมายถึงคนละเรื่อง ต้องโวย ไม่ใช่ทิ้งเงียบ ๆ
     *
     * เคยเกิดจริง: แดชบอร์ดเริ่มส่งคีย์ `groups` ของตัวเอง ซึ่งชนกับ `groups`
     * ของแถบเมนูที่มีอยู่ก่อน · ตอนนั้นตัวรวมข้อมูลทิ้งของแดชบอร์ดไปเงียบ ๆ
     * หน้าแรกจึงได้กลุ่มเมนูมาวาดเป็นการ์ด แล้วตายตั้งแต่บรรทัดแรก · ฝั่งเซิร์ฟเวอร์
     * ไม่มีอะไรผิดให้เห็นเลย ผู้ใช้เห็นแค่ "ระบบไม่ตอบกลับภายในเวลาที่ควรจะเป็น"
     * ซึ่งชี้ไปผิดทางทั้งหมด
     */
    if (Object.prototype.hasOwnProperty.call(boot, key)) {
      throw new Error('ข้อมูลตั้งต้นของหน้า ' + page + ' ส่งคีย์ "' + key + '" ซึ่งมีความหมาย' +
        'อื่นอยู่แล้วที่ระดับบน · ต้องเปลี่ยนชื่อคีย์ของหน้าให้ต่างออกไป ' +
        'หรือถ้าหมายถึงสิ่งเดียวกันจริง ให้ประกาศไว้ใน BOOT_SAME_AS_TOP_');
    }
    boot[key] = payload[key];
  }
  return boot;
  return boot;
}

/**
 * ผู้ใช้เปิดหน้านี้ได้หรือไม่ ตามเมนูที่คำนวณไว้แล้ว
 *
 * ใช้ตัดสินว่าจะดึงข้อมูลตั้งต้นมาให้หรือไม่ — หน้าที่ผู้ใช้ไม่มีสิทธิ์
 * ต้องไม่ดึงข้อมูลมาแต่แรก ไม่ใช่ดึงมาแล้วให้หน้าเว็บซ่อน (SPEC 17.3)
 *
 * หน้าที่ไม่อยู่ในเมนู เช่นหน้าแรก ถือว่าเปิดได้เสมอ
 *
 * @param {Object[]} menu เมนูของผู้ใช้คนนี้
 * @param {string} page ชื่อหน้า
 * @param {string} dept แผนกที่ขอมา
 * @return {boolean}
 */
function allowedPage_(menu, page, dept) {
  var found = false;
  for (var i = 0; i < menu.length; i++) {
    if (menu[i].page !== page) continue;
    if (menu[i].dept && menu[i].dept !== dept) continue;
    found = true;
    if (menu[i].allowed) return true;
  }
  return !found;
}

/**
 * ประกอบหน้าเว็บหนึ่งหน้าเป็นข้อความ HTML
 *
 * ใช้ร่วมกันทั้งทาง doPost (ทางที่หน้าบ้านใช้จริง) และ doGet (ไว้เปิดตรวจเองตอนไล่ปัญหา)
 * ลิงก์ทุกปุ่มชี้กลับไปที่หน้าบ้าน ไม่ใช่ชี้มาที่นี่ เพราะเบราว์เซอร์ของผู้ใช้
 * คุยกับหน้าบ้านเท่านั้น ไม่เคยเห็นที่อยู่ของโปรเจกต์นี้เลย
 *
 * @param {Object} params ค่าที่หน้าบ้านส่งมา (page, wo, base)
 * @return {string} HTML
 */
async function renderPage_(params) {
  var requested = String(params.page || WEB_DEFAULT_PAGE);
  var page = Object.prototype.hasOwnProperty.call(WEB_PAGES, requested) ? requested : WEB_DEFAULT_PAGE;

  /*
   * ที่อยู่ของเว็บแอปตัวนี้เอง — ลิงก์ทุกปุ่มในหน้าชี้กลับมาที่นี่
   * เดิมค่านี้ถูกส่งมาจากโปรเจกต์หน้าบ้าน เพราะเบราว์เซอร์ไม่เคยเห็นที่อยู่ของตัวหลังบ้าน
   * ตอนนี้เหลือโปรเจกต์เดียว จึงถามตัวเองได้ตรง ๆ
   */
  var base = String(params.base || selfUrl_());

  try {
    var template = HtmlService.createTemplateFromFile(WEB_PAGES[page].file);
    template.page = page;
    /*
     * รับได้ทั้ง ?wo= และ ?id= — หน้ารายละเอียดใช้ id ตามที่ลิงก์ในข้อความ Telegram ส่งมา
     * ส่วนหน้าสร้าง/แก้ไขใช้ wo มาตั้งแต่แรก · รับทั้งสองชื่อ ลิงก์เก่าจึงไม่ตายเมื่อมีหน้าใหม่
     */
    template.woId = String(params.wo || params.id || '');
    // สามค่านี้บอกหน้าว่าถูกเรียกในบริบทไหน — แผนกที่ขอดู มุมมองของเมนูย่อย และสายอนุมัติ
    template.dept = String(params.dept || '');
    template.view = String(params.view || '');
    template.route = String(WEB_PAGES[page].route || '');
    template.homeUrl = pageUrl_(base, 'home');
    template.baseUrl = base;

    /*
     * ไม่ฝังข้อมูลตั้งต้นลงหน้าอีกแล้ว
     *
     * เดิมฝังได้เพราะตอน doGet ระบบรู้ว่าใครเป็นคนเปิดจาก Session ของ Google
     * ตอนนี้ตัวตนอยู่ในโทเคนที่เก็บไว้ในเบราว์เซอร์ และห้ามส่งโทเคนผ่าน URL เด็ดขาด
     * ขั้นนี้จึงไม่มีทางรู้ว่าใครเปิด · หน้าจะขอข้อมูลของตัวเองด้วย api_pageData
     * ซึ่งยังเป็น "คำขอเดียว" ต่อการเปิดหนึ่งหน้าเหมือนเดิม (SPEC 17.3)
     *
     * รวมแล้วยังเร็วกว่าเดิม เพราะเมื่อก่อนทุกคำขอต้องวิ่งข้ามสองโปรเจกต์
     */
    template.bootstrapJson = '';
    return template.evaluate().getContent();
  } catch (err) {
    Logger.log('ประกอบหน้า ' + page + ' ไม่สำเร็จ: ' + ((err && err.message) ? err.message : String(err)));
    // ขอบที่สองของระบบ — ข้อผิดพลาดหนึ่งครั้งผ่านขอบเดียว จึงไม่ได้บรรทัดซ้ำ
    await logPermissionProblem_(err);
    return doGetErrorHtml_(userFacingMessage_(err));
  }
}

/**
 * รหัสลับที่ส่งมาตรงกับที่ตั้งไว้หรือไม่
 *
 * เทียบแบบตรงตัวทั้งสตริง และต้องไม่ยอมให้ผ่านเมื่อยังไม่ได้ตั้งรหัสไว้
 * ไม่งั้นโปรเจกต์ที่ลืมตั้งค่าจะเปิดรับคำขอจากใครก็ได้บนอินเทอร์เน็ต
 *
 * @param {*} candidate รหัสลับที่มากับคำขอ
 * @return {boolean}
 */
function secretMatches_(candidate) {
  var expected = '';
  try {
    expected = getProp_(GATEWAY_SECRET_PROP, false) || '';
  } catch (e) {
    expected = '';
  }
  if (!expected) return false;
  return String(candidate || '') === String(expected);
}

/**
 * ทางเข้าของทุกรายการที่หน้าบ้านส่งมา
 *
 * ลำดับสำคัญมาก: ตรวจรหัสลับก่อนทุกอย่าง ก่อนแม้แต่จะดูว่าเขาขออะไรมา
 * เพราะที่อยู่ของโปรเจกต์นี้เปิดรับคำขอจากอินเทอร์เน็ตได้ทุกคน รหัสลับคือด่านเดียวที่กั้นอยู่
 *
 * @param {Object} e อีเวนต์จาก Apps Script (e.postData.contents คือ JSON ที่หน้าบ้านส่งมา)
 * @return {TextOutput} JSON ของ {ok, data} หรือ {ok, message}
 */
async function doPost(e) {
  /*
   * ปิดไว้ทั้งทาง — ผู้ใช้เปิดโปรเจกต์นี้ตรง ๆ แล้ว ไม่มีใครต้องยิง POST เข้ามาอีก
   * ทางนี้เคยเป็นช่องทางเดียวที่รับคำขอจากภายนอก การปิดไว้จึงลดพื้นที่ที่ถูกยิงได้ลงทั้งทาง
   */
  if (!GATEWAY_ENABLED) return jsonOut_({ ok: false, message: GATEWAY_ONLY_MESSAGE });

  var payload = {};
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (parseError) {
    return jsonOut_({ ok: false, message: GATEWAY_ONLY_MESSAGE });
  }

  if (!secretMatches_(payload.secret)) {
    // ไม่บอกว่าผิดตรงไหน เพราะการบอกว่า "รหัสผิด" ก็คือการยืนยันว่ามีรหัสอยู่จริง
    return jsonOut_({ ok: false, message: GATEWAY_ONLY_MESSAGE });
  }

  /*
   * คำขอจากหน้าบ้านมีได้ 3 ชนิดเท่านั้น และต้องระบุชนิดมาเสมอ
   *
   * การขอหน้าเว็บ (page) ไม่ใช่ api_ ปกติ จึงต้องมีที่ทางของตัวเองในรายชื่อนี้
   * ตอนแรกลืมไป ทำให้การเปิดหน้าเว็บถูกปฏิเสธด้วยข้อความ "ไม่รู้จักรายการที่เรียก"
   * ทั้งที่ไม่ได้ส่งชื่อรายการมาตั้งแต่แรก เพราะมันคนละเรื่องกัน
   */
  var mode = String(payload.mode || '');

  if (mode === GATEWAY_MODE.PAGE) {
    /*
     * ตั้งตัวตนก่อนประกอบหน้า เพราะตอนนี้หน้าถูกส่งมาพร้อมข้อมูลตั้งต้นแล้ว
     * ซึ่งต้องรู้ว่าใครเป็นคนเปิดจึงจะรู้ว่าให้เห็นอะไรได้บ้าง
     */
    beginRequest_(payload.email);
    try {
      return textOut_(await renderPage_(payload.params || {}));
    } finally {
      endRequest_();
    }
  }

  if (mode === GATEWAY_MODE.DIAG) {
    return jsonOut_(await diagReport_());
  }

  if (mode !== GATEWAY_MODE.API) {
    return jsonOut_({ ok: false, message: unknownActionMessage_('ชนิดคำขอ "' + mode + '"') });
  }

  var action = String(payload.action || '');
  var registry = apiActions_();
  if (!Object.prototype.hasOwnProperty.call(registry, action)) {
    // ชื่อรายการต้องอยู่ในทะเบียนที่เขียนไว้ตายตัวเท่านั้น
    // ห้ามเอาชื่อที่ส่งมาไปหาฟังก์ชันเองไม่ว่าวิธีใด ไม่งั้นจะยิงฟังก์ชันภายในตัวไหนก็ได้
    return jsonOut_({ ok: false, message: unknownActionMessage_(action) });
  }

  var args = (Object.prototype.toString.call(payload.args) === '[object Array]') ? payload.args : [];

  beginRequest_(payload.email);
  try {
    return jsonOut_(registry[action].apply(null, args));
  } finally {
    // ต้องล้างเสมอ ไม่ให้ตัวตนของคำขอหนึ่งค้างไปถึงคำขอถัดไปที่ใช้การรันเดียวกัน
    endRequest_();
  }
}

/**
 * ตอบกลับเป็น JSON
 * @param {*} value ค่าที่จะส่งกลับ
 * @return {TextOutput}
 */
function jsonOut_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ตอบกลับเป็นข้อความธรรมดา — ใช้ส่ง HTML ดิบให้หน้าบ้านเอาไปแสดงต่อ
 * ต้องเป็นข้อความ ไม่ใช่ HtmlOutput เพราะถ้าคืนเป็นหน้าเว็บ Google จะห่อกรอบของตัวเองมาด้วย
 * แล้วหน้าบ้านจะได้หน้าเว็บซ้อนหน้าเว็บ
 * @param {string} text เนื้อข้อความ
 * @return {TextOutput}
 */
function textOut_(text) {
  return ContentService.createTextOutput(String(text))
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * ที่อยู่ของหน้าหนึ่งบนโปรเจกต์หน้าบ้าน
 * @param {string} base ที่อยู่ของหน้าบ้าน ที่หน้าบ้านส่งมาให้
 * @param {string} page ชื่อหน้าใน WEB_PAGES
 * @return {string}
 */
function pageUrl_(base, page) {
  if (!base) return '';
  return base + '?page=' + encodeURIComponent(page);
}

/**
 * ที่อยู่ของเว็บแอปตัวนี้ — คืนค่าว่างเมื่อถามไม่ได้ (เช่นตอนรันจากตัวแก้ไข)
 *
 * ค่าว่างไม่ทำให้หน้าพัง แค่ทำให้ลิงก์ในหน้าเป็นค่าว่าง ซึ่งเกิดเฉพาะตอนรันเทสต์
 *
 * @return {string}
 */
function selfUrl_() {
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (e) {
    return '';
  }
}

/**
 * หน้าข้อความอย่างง่ายเมื่อเปิดหน้าปกติไม่ได้
 * @param {string} message ข้อความภาษาไทยที่ผู้ใช้อ่านรู้เรื่อง
 * @return {string} HTML
 */
function doGetErrorHtml_(message) {
  var safe = String(message)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return '<div style="font-family:sans-serif;padding:24px;line-height:1.6;max-width:520px">' +
    safe + '</div>';
}

/**
 * ประกอบไฟล์ HTML อื่นเข้ามาในหน้า ใช้ใน template ด้วย <?!= include('ui_Style') ?>
 * @param {string} filename ชื่อไฟล์ HTML โดยไม่ต้องมีนามสกุล
 * @return {string} เนื้อไฟล์
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}


/* ---------------------------------------------------------------------------
 * หน้าตรวจสอบตัวตน (?page=whoami)
 *
 * มีไว้ไล่ปัญหาเรื่อง "ระบบมองเราเป็นใคร" ซึ่งเป็นปัญหาที่เดาจากข้างนอกไม่ได้เลย
 * เพราะ Session.getActiveUser() คืนค่าว่างได้จริงเมื่อผู้ใช้อยู่นอกโดเมนของสคริปต์
 * และเว็บแอปที่ตั้งค่าให้ทำงาน "ในฐานะเจ้าของสคริปต์" จะเห็นอีเมลเจ้าของ ไม่ใช่คนที่เปิด
 *
 * หน้านี้ห้ามตรวจสิทธิ์และห้ามปฏิเสธใครเด็ดขาด ต้องเปิดได้เสมอแม้ระบุตัวตนไม่ได้
 * เพราะเคสที่อยากดูที่สุดคือเคสที่ระบบระบุตัวตนไม่ได้พอดี ถ้าหน้านี้ปฏิเสธด้วยก็จะไม่เห็นอะไรเลย
 *
 * ปิดไว้เป็นค่าเริ่มต้น เพราะเผยอีเมลของผู้เปิดและ Role ออกมาโดยไม่ตรวจสิทธิ์
 * --------------------------------------------------------------------------- */

/** ชื่อหน้าและชื่อ Script Property ที่ใช้เปิด–ปิดหน้าตรวจสอบตัวตน */
var WHOAMI_PAGE = 'whoami';
var WHOAMI_PROP = 'WHOAMI';

/** ข้อความแทนค่าว่าง — ต้องเขียนออกมาให้เห็น ไม่ปล่อยเป็นช่องว่างเปล่า */
var WHOAMI_BLANK = '(ว่าง)';

/**
 * ค่าที่ถือว่า "เปิด" — ยอมรับหลายแบบเพราะคนกรอกใน Script Properties ด้วยมือ
 * @param {string} value ค่าจาก Script Property
 * @return {boolean}
 */
function whoamiEnabled_(value) {
  var text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === 'on' || text === 'yes' || text === '1' || text === 'เปิด';
}

/**
 * ข้อความของหน้าตรวจสอบตัวตน
 * @return {TextOutput}
 */
async function whoamiOutput_() {
  var out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.TEXT);

  var enabled = false;
  try {
    enabled = whoamiEnabled_(getProp_(WHOAMI_PROP, false));
  } catch (e) {
    enabled = false;
  }
  if (!enabled) return out.setContent('ปิดอยู่');

  return out.setContent(await whoamiReport_());
}

/**
 * ประกอบรายงาน 5 บรรทัด
 *
 * ทุกค่าห่อ try/catch เดี่ยว ๆ เพราะเป้าหมายคือ "ได้เห็นเท่าที่เห็นได้"
 * ค่าไหนอ่านไม่ได้ก็บอกไปตรง ๆ แล้วอ่านค่าถัดไปต่อ ห้ามให้ค่าเดียวล้มทั้งหน้า
 *
 * นี่เป็นที่เดียวในระบบที่เรียก Session.getActiveUser() กับ getEffectiveUser() ตรง ๆ
 * นอกเหนือจาก currentUserEmail_() ซึ่งขัดกับกฎข้อ 16 โดยเจตนา
 * เพราะหน้าที่ของหน้านี้คือเปรียบเทียบค่าดิบสองตัวนั้นให้เห็นกับตา ไม่ใช่ใช้ตัดสินใจอะไร
 *
 * @return {string}
 */
async function whoamiReport_() {
  var active = whoamiValue_(function () { return Session.getActiveUser().getEmail(); });
  var effective = whoamiValue_(function () { return Session.getEffectiveUser().getEmail(); });

  var systemEmail = whoamiValue_(function () { return currentUserEmail_(); });

  // getCurrentUser_() ปฏิเสธได้ตามกฎข้อ 16 ซึ่งเป็นข้อมูลที่เราอยากเห็นพอดี
  // จึงรับข้อความปฏิเสธมาแสดงแทน ไม่ปล่อยให้หน้าล้ม
  var roles = WHOAMI_BLANK;
  try {
    var user = await getCurrentUser_();
    roles = (user.roles && user.roles.length) ? user.roles.join(', ') : WHOAMI_BLANK;
  } catch (e) {
    roles = 'ระบุไม่ได้: ' + ((e && e.message) ? e.message : String(e));
  }

  return [
    'getActiveUser    : ' + active,
    'getEffectiveUser : ' + effective,
    'ระบบใช้อีเมล      : ' + systemEmail,
    'Role ที่ได้        : ' + roles,
    'ทำงานในฐานะ      : ' + whoamiRunningAs_(active, effective)
  ].join('\n');
}

/**
 * อ่านค่าหนึ่งค่าแบบไม่ยอมให้ล้ม — ค่าว่างต้องเขียนว่า (ว่าง) ไม่ใช่ปล่อยช่องว่างเปล่า
 * ไม่งั้นคนอ่านจะแยกไม่ออกระหว่าง "ได้ค่าว่างมาจริง" กับ "หน้าแสดงผลพัง"
 * @param {function()} read สิ่งที่ต้องการอ่าน
 * @return {string}
 */
function whoamiValue_(read) {
  try {
    var value = read();
    return (value === null || value === undefined || String(value) === '')
      ? WHOAMI_BLANK : String(value);
  } catch (e) {
    return 'อ่านไม่ได้: ' + ((e && e.message) ? e.message : String(e));
  }
}

/**
 * ระบบกำลังทำงานในฐานะใคร ตัดสินจากการเทียบค่าดิบสองตัว
 *
 * ถ้าสองค่าไม่ตรงกัน แปลว่าเว็บแอปถูกตั้งให้ทำงาน "ในฐานะเจ้าของสคริปต์"
 * ซึ่งทำให้ทุกคนที่เปิดกลายเป็นคนเดียวกันในสายตาระบบ และการตรวจสิทธิ์ทั้งหมดจะไร้ความหมาย
 * เป็นอาการที่ดูจากข้างนอกไม่ออกเลย ระบบจะทำงานได้ปกติทุกอย่างยกเว้นเรื่องสิทธิ์
 *
 * แยกออกมาเป็นฟังก์ชันล้วน เพื่อให้ทดสอบได้โดยไม่ต้องปลอม Session
 *
 * @param {string} active ค่าจาก Session.getActiveUser()
 * @param {string} effective ค่าจาก Session.getEffectiveUser()
 * @return {string}
 */
function whoamiRunningAs_(active, effective) {
  if (String(active) === WHOAMI_BLANK || String(active) !== String(effective)) {
    return 'เจ้าของสคริปต์';
  }
  return 'ผู้ใช้ที่เปิด';
}

/**
 * เงื่อนไขตั้งต้นของหน้ารายการใบงาน อ่านจาก query string
 *
 * มีเพื่อให้การ์ดบนแดชบอร์ดกดแล้วมาถึงรายการที่กรองไว้แล้วได้ทันทีในคำขอเดียว
 * ถ้าไม่มี หน้าจะต้องเปิดมาโล่ง ๆ แล้วยิงถามซ้ำอีกครั้งเพื่อกรอง ซึ่งช้ากว่าและ
 * ทำให้ผู้ใช้เห็นรายการที่ยังไม่กรองแวบหนึ่งก่อน ซึ่งชวนให้เข้าใจผิดว่ากดผิดการ์ด
 *
 * ค่าที่ไม่ใช่ค่าคงที่ของระบบจะถูก normalizeWoQuery_ ทิ้งให้เองอีกชั้นหนึ่ง
 * ที่นี่จึงแค่ส่งต่อ ไม่ต้องตรวจซ้ำ — การตรวจสองที่แปลว่ามีสองที่ที่ต้องแก้ให้ตรงกัน
 *
 * @param {Object} params query string ที่ผู้ใช้เปิดมา
 * @return {Object} เงื่อนไขดิบ
 */
function webWoListQuery_(params) {
  return {
    text:         String(params.q || ''),
    statuses:     webListParam_(params.status),
    taskStatuses: webListParam_(params.taskStatus),
    departments:  webListParam_(params.dept),
    taskDepartments: webListParam_(params.taskDept),
    routes:       webListParam_(params.route),
    payments:     webListParam_(params.payment),
    paymentRequired: String(params.mustPay || '') === '1',
    // ธง "เลยกำหนด" ต้องเดินทางมากับลิงก์ด้วย ไม่งั้นไทล์บนแดชบอร์ดจะพาไปรายการ
    // ที่กว้างกว่าตัวเลขบนไทล์ ซึ่งดูเหมือนทำงานปกติทุกประการ
    overdue:      String(params.overdue || '') === '1',
    reopened:     String(params.reopened || '') === '1',
    from:         String(params.from || ''),
    to:           String(params.to || ''),
    page:         Number(params.p || 1)
  };
}

/**
 * ข้อมูลตั้งต้นของหน้าแผนก — เลือกแหล่งตามมุมมองที่เมนูย่อยขอมา (SPEC 17.3)
 *
 * "งานวันนี้" ต้องให้ฐานข้อมูลกรองมาให้ ไม่ใช่ขอมาทั้งหมดแล้วคัดที่เบราว์เซอร์
 * เพราะจำนวนงานของแผนกหนึ่งโตตามการใช้งานจริง ส่วนงานที่นัดไว้วันนี้มีไม่กี่รายการเสมอ
 *
 * @param {Object} params ค่าที่หน้าบ้านส่งมา
 * @return {Object} เปลือก {ok, data} แบบเดียวกับรายการ api_ อื่น
 */
async function webTaskPageData_(params) {
  /*
   * มุมมองที่เมนูย่อยชี้มา ถูกส่งต่อเข้าไปตรง ๆ แล้วให้ taskViewByKey_ เป็นคนตัดสิน
   * ว่ารู้จักหรือไม่ ที่นี่จึงไม่มีรายชื่อมุมมองเขียนซ้ำไว้ (กฎข้อ 1)
   *
   * หน้ามาจาก query string ได้ด้วย เพื่อให้ลิงก์ที่ส่งต่อกันกลับมาที่หน้าเดิมได้
   */
  /*
   * หน้าแผนกต้องได้มุมมองที่แน่นอนเสมอ · คีย์ที่ไม่รู้จักหรือไม่ได้ส่งมา ให้ถอยไป
   * มุมมองตั้งต้น ไม่ใช่ถอยไปเส้นทาง "ทุกสถานะที่ยังไม่จบ" ซึ่งมีไว้ให้ผู้เรียก
   * ที่ไม่ใช่หน้าจอ · เพราะเมื่อเซิร์ฟเวอร์คืนมุมมองว่าง หน้าเว็บจะไปหยิบมุมมอง
   * จาก URL มากรองแทน แล้วสองฝั่งก็พูดคนละมุมมองกันโดยไม่มีอะไรฟ้อง
   */
  var view = taskViewByKey_(params.view) ? String(params.view) : DEFAULT_TASK_VIEW;
  return await api_listMyTasks(false, view, Number(params.page) || 1);
}

/**
 * ค่าที่ส่งมาทาง query string คั่นด้วยจุลภาค — คืนเป็นรายการเสมอ
 * @param {*} value ค่าดิบ
 * @return {string[]}
 */
function webListParam_(value) {
  var text = String(value === null || value === undefined ? '' : value).trim();
  return text ? text.split(',') : [];
}
