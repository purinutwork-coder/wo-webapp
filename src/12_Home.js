/**
 * 12_Home.gs — แดชบอร์ดหน้าแรก และรายการใบงานทั้งหมด (SPEC 17.3 · 23)
 *
 * **ไฟล์นี้เคยเป็นที่อยู่ของดัชนีใบงาน และตอนนี้ไม่มีดัชนีแล้ว**
 *
 * วิธีเดิมอ่านใบงานทุกใบมาสร้างดัชนีแล้วแคชไว้สิบนาที · วัดแล้วว่า 392 ตัวอักษร
 * ต่อใบงาน กับเพดานแคชราว 900,000 ตัวอักษร จึงชนที่ราว 2,293 ใบ คือสี่เดือนครึ่ง
 * ที่ 500 ใบต่อเดือน · วันที่ชน แคชจะเก็บไม่สำเร็จแบบเงียบ ๆ แล้วหน้าแรกจะกลับไป
 * อ่านทั้งตารางทุกครั้งที่มีคนเปิด ช้าลงเรื่อย ๆ โดยไม่มีอะไรบอกว่าทำไม
 *
 * **งานรอบนี้ไม่ได้เลื่อนเส้นตายนั้น แต่ทำให้ดัชนีไม่จำเป็นอีกเลย** ต้นทุนของทั้งสองหน้า
 * ตอนนี้คงที่ ไม่ว่าจะมีใบงานศูนย์ใบหรือแสนใบ เพราะ
 *
 *   หน้าแรก   ยอดทั้งชุดมาจาก RPC `dashboard_summary` คำขอเดียว ซึ่งเป็น count()
 *             บน index ไม่มีการดึงแถวขึ้นมาสักแถว · แคชไว้ 60 วินาทีให้ทุกคนใช้ร่วมกัน
 *   หน้ารายการ ค้น กรอง เรียง และแบ่งหน้า ทำที่ฐานข้อมูลทั้งหมด (กฎข้อ 28)
 *             หนึ่งคำขอได้ทั้งยี่สิบแถวของหน้านี้และยอดรวมจาก header Content-Range
 *
 * สิ่งที่หายไปพร้อมดัชนี และเป็นการแลกที่ตั้งใจ
 *   ตัวกรองแบบเลือกจากรายการค่าที่มีอยู่จริง (สถานที่ ลูกค้า โครงการ) — สามอย่างนี้
 *   สร้างได้เฉพาะเมื่ออ่านทั้งตาราง จึงเปลี่ยนเป็นการพิมพ์ในช่องค้นหาเดียว ซึ่งค้นได้
 *   ทั้งสี่ช่องเหมือนเดิม · ส่วนตัวกรองที่เป็นค่าคงที่อยู่แล้ว — สถานะ แผนก สาย
 *   การชำระเงิน — ยังอยู่ครบ เพราะรายการตัวเลือกมาจากค่าคงที่ ไม่ต้องอ่านข้อมูลเลย
 */

/**
 * จัดการ์ดเข้ากลุ่ม โดยคงลำดับของกลุ่มและของการ์ดภายในกลุ่มไว้ตามที่ประกาศ
 *
 * กลุ่มที่ไม่มีการ์ดของผู้ใช้คนนี้เลย จะไม่ถูกส่งออกไป — ต่างจากการ์ดที่เป็นศูนย์
 * ซึ่งต้องยังอยู่ (SPEC 17.1) · หัวข้อกลุ่มที่ไม่มีอะไรอยู่ข้างใต้ ไม่ได้บอกอะไรเลย
 * ส่วนการ์ดที่เป็นศูนย์บอกว่า "ตรวจแล้ว ไม่มี" ซึ่งเป็นข้อมูล
 *
 * @param {Object[]} cards การ์ดที่ผู้ใช้คนนี้เห็นได้
 * @return {Object[]} [{key, label, warn, cards}]
 */
function dashboardGroupsOf_(cards) {
  var out = [];

  for (var g = 0; g < DASHBOARD_GROUPS.length; g++) {
    var group = DASHBOARD_GROUPS[g];
    var mine = [];
    for (var c = 0; c < cards.length; c++) {
      if (cards[c].group === group.key) mine.push(cards[c]);
    }
    if (!mine.length) continue;
    out.push({ key: group.key, label: group.label, warn: group.warn === true, cards: mine });
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * ส่วนที่ 1 — แดชบอร์ด
 * --------------------------------------------------------------------------- */

/** คีย์ของยอดหน้าแรกในแคชข้ามการรัน */
var DASHBOARD_CACHE_KEY_ = 'dash:v1';

/**
 * อายุแคชของยอดหน้าแรก (วินาที)
 *
 * สั้นมากโดยตั้งใจ · งานของแคชนี้ไม่ใช่การลดจำนวนคำขอตลอดวัน แต่คือการกันไม่ให้
 * ยี่สิบคนที่เปิดหน้าแรกพร้อมกันตอนเช้ายิงคำขอยี่สิบครั้งเพื่อได้ตัวเลขชุดเดียวกัน
 *
 * และตัวเลขยังสดอยู่เสมอ เพราะ `clearDashboardCache_()` ถูกเรียกทุกครั้งที่สถานะเปลี่ยน
 * หกสิบวินาทีจึงเป็นเพดานของกรณีที่ไม่มีใครเปลี่ยนอะไรเลยเท่านั้น
 */
var DASHBOARD_CACHE_SECONDS_ = 60;

/** ยอดที่อ่านมาแล้วในการรันนี้ — กันการถามซ้ำภายในคำขอเดียวกัน */
var DASHBOARD_RUN_CACHE_ = null;

/**
 * ยอดดิบทั้งชุดจากฐานข้อมูล — ยังไม่ได้คัดตามสิทธิ์ของใคร
 *
 * ยอดชุดนี้เหมือนกันสำหรับทุกคน จึงแคชร่วมกันได้ทั้งระบบ · การคัดตามสิทธิ์ทำทีหลัง
 * ในหน่วยความจำ ซึ่งไม่มีต้นทุนและไม่ต้องแคชแยกรายคน
 *
 * @return {Object} ยอดทุกช่องตามที่ dashboard_summary คืนมา
 */
async function dashboardTotals_() {
  if (DASHBOARD_RUN_CACHE_) return DASHBOARD_RUN_CACHE_;

  var cached = cacheGet_(DASHBOARD_CACHE_KEY_);
  if (cached) {
    try {
      DASHBOARD_RUN_CACHE_ = JSON.parse(cached);
      return DASHBOARD_RUN_CACHE_;
    } catch (e) {
      // ของในแคชเสีย ถือว่าไม่มี แล้วถามใหม่ ดีกว่าทำให้ทั้งหน้าล้ม
    }
  }

  var totals = await db_rpc_('dashboard_summary', {});

  /*
   * PostgREST คืนค่าของฟังก์ชันที่ returns json มาเป็นก้อน JSON ตรง ๆ
   * แต่ถ้าวันหนึ่งมันห่อเป็น array มาแทน (ซึ่ง returns table จะเป็นแบบนั้น)
   * การอ่านคีย์ตรง ๆ จะได้ undefined ทุกช่อง แล้วแดชบอร์ดจะขึ้นศูนย์ทั้งหน้า
   * โดยไม่มีอะไรผิดพลาดให้เห็น — คลี่เปลือกตรงนี้ทีเดียวจึงถูกกว่าไปเดาทีหลัง
   */
  if (totals instanceof Array) totals = totals.length ? totals[0] : {};

  DASHBOARD_RUN_CACHE_ = totals || {};
  cachePut_(DASHBOARD_CACHE_KEY_, JSON.stringify(DASHBOARD_RUN_CACHE_), DASHBOARD_CACHE_SECONDS_);
  return DASHBOARD_RUN_CACHE_;
}

/**
 * ล้างยอดที่แคชไว้ — เรียกจาก changeStatus() ที่เดียว
 *
 * `changeStatus()` เป็นทางผ่านเดียวที่สถานะเปลี่ยนได้ตามกฎข้อ 1 จึงเป็นที่เดียว
 * ที่รู้แน่นอนว่ายอดเปลี่ยนแล้ว · ถ้าไปล้างที่อื่นด้วย จะกลายเป็นสองที่ที่ต้องจำ
 * และวันหนึ่งจะมีเส้นทางที่ลืมล้าง แล้วผู้ใช้จะเห็นตัวเลขเก่าโดยไม่รู้ว่าเก่า
 */
function clearDashboardCache_() {
  DASHBOARD_RUN_CACHE_ = null;
  try {
    cacheDrop_([DASHBOARD_CACHE_KEY_]);
  } catch (e) {
    // ล้างแคชไม่สำเร็จต้องไม่ทำให้รายการที่เพิ่งสำเร็จไปแล้วล้มตาม
  }
}

/**
 * กลุ่มของการ์ดบนแดชบอร์ด — จัดตาม "ใครต้องลงมือทำ" ไม่ใช่ตามลำดับที่โค้ดส่งมา
 *
 * แดชบอร์ดมีหน้าที่ตอบว่า "ฉันต้องทำอะไร" ไม่ใช่ "ระบบมีตัวเลขอะไร" · การ์ดสิบสามใบ
 * เรียงต่อกันเป็นพรืดตอบคำถามที่สองได้ดี แต่ตอบคำถามแรกไม่ได้เลย เพราะคนอ่านต้อง
 * ไล่อ่านทุกใบก่อนถึงจะรู้ว่าใบไหนเกี่ยวกับตัวเอง
 *
 * เรียงตามความเร่ง — ของที่ค้างและมีคนรออยู่มาก่อน ของที่เป็นสรุปย้อนหลังอยู่ท้ายสุด
 *
 * `warn` = กลุ่มที่ใช้สีเตือนได้เมื่อมีของค้างจริง · **มีกลุ่มเดียวโดยตั้งใจ**
 * ถ้าทุกการ์ดมีสีเตือน จะไม่มีการ์ดไหนเตือนอะไรได้เลย
 */
var DASHBOARD_GROUPS = Object.freeze([
  Object.freeze({ key: 'attention', label: 'ต้องรีบจัดการ', warn: true }),
  Object.freeze({ key: 'approve',   label: 'รอผู้อนุมัติ' }),
  Object.freeze({ key: 'dept',      label: 'รอแผนกลงมือ' }),
  Object.freeze({ key: 'month',     label: 'สรุปของเดือนนี้' })
]);

/**
 * การ์ดทั้งหมดที่แดชบอร์ดมี พร้อมสิทธิ์และปลายทางของแต่ละใบ (SPEC 17.3)
 *
 * **ทุกการ์ดต้องกดเข้าไปต่อได้** และปลายทางต้องเป็นรายการที่กรองไว้ตรงกับตัวเลข
 * บนการ์ดเป๊ะ · แดชบอร์ดที่โชว์ยอดที่กดเข้าไปแล้วเจอศูนย์ แย่กว่าไม่โชว์เลย
 * เพราะคนจะเลิกเชื่อตัวเลขทุกตัวบนหน้านั้นไปพร้อมกัน
 *
 * `roles` คือคนที่ **เห็นการ์ดนี้** ซึ่งแคบกว่าคนที่เปิดใบงานดูได้ (SPEC 2 ให้ทุกคน
 * เปิดดูได้ทุกใบ) · เหตุผลคือแดชบอร์ดเป็นหน้าที่ตอบว่า "วันนี้ฉันต้องทำอะไร"
 * ไม่ใช่หน้าที่ตอบว่า "ระบบมีอะไรอยู่บ้าง" ซึ่งเป็นงานของหน้ารายการใบงาน
 *
 * @return {Object[]} [{key, label, count, roles, query}]
 */
function dashboardCards_() {
  return [
    { key: 'pendingApproveSp', label: 'รออนุมัติ (SV/PE)', group: 'approve',
      roles: [ROLE.ADMIN, ROLE.SALE, ROLE.APPROVER_SP],
      query: { statuses: [WO_STATUS.PENDING_APPROVE], routes: [ROUTE.SP] } },
    { key: 'pendingApproveLab', label: 'รออนุมัติ (Lab)', group: 'approve',
      roles: [ROLE.ADMIN, ROLE.SALE, ROLE.APPROVER_LAB],
      query: { statuses: [WO_STATUS.PENDING_APPROVE], routes: [ROUTE.LAB] } },
    { key: 'returned', label: 'ถูกตีกลับ', group: 'attention',
      roles: [ROLE.ADMIN, ROLE.SALE],
      query: { statuses: [WO_STATUS.RETURNED] } },

    { key: 'acceptService', label: 'รอกดรับงาน (Service)', group: 'dept',
      roles: [ROLE.ADMIN, ROLE.SALE, ROLE.SERVICE],
      query: { taskDepartments: [DEPT.SERVICE], taskStatuses: [TASK_STATUS.PENDING_ACCEPT] } },
    { key: 'acceptProject', label: 'รอกดรับงาน (Project)', group: 'dept',
      roles: [ROLE.ADMIN, ROLE.SALE, ROLE.PROJECT],
      query: { taskDepartments: [DEPT.PROJECT], taskStatuses: [TASK_STATUS.PENDING_ACCEPT] } },
    { key: 'acceptLab', label: 'รอกดรับงาน (Lab)', group: 'dept',
      roles: [ROLE.ADMIN, ROLE.SALE, ROLE.LAB],
      query: { taskDepartments: [DEPT.LAB], taskStatuses: [TASK_STATUS.PENDING_ACCEPT] } },

    { key: 'workingService', label: 'กำลังดำเนินการ (Service)', group: 'dept',
      roles: [ROLE.ADMIN, ROLE.SALE, ROLE.SERVICE],
      query: { taskDepartments: [DEPT.SERVICE], taskStatuses: [TASK_STATUS.IN_PROGRESS] } },
    { key: 'workingProject', label: 'กำลังดำเนินการ (Project)', group: 'dept',
      roles: [ROLE.ADMIN, ROLE.SALE, ROLE.PROJECT],
      query: { taskDepartments: [DEPT.PROJECT], taskStatuses: [TASK_STATUS.IN_PROGRESS] } },
    { key: 'workingLab', label: 'กำลังดำเนินการ (Lab)', group: 'dept',
      roles: [ROLE.ADMIN, ROLE.SALE, ROLE.LAB],
      query: { taskDepartments: [DEPT.LAB], taskStatuses: [TASK_STATUS.IN_PROGRESS] } },

    /*
     * เสร็จสิ้นกับยกเลิกต้องเป็นคนละการ์ด ไม่ใช่รวมเป็น "ปิดงานแล้ว"
     * สองอย่างนี้ต่างกันในทางธุรกิจสิ้นเชิง และการรวมกันจะซ่อนเดือนที่ยกเลิกเยอะผิดปกติ
     */
    { key: 'completedMonth', label: 'เสร็จสิ้นเดือนนี้', group: 'month',
      roles: [ROLE.ADMIN, ROLE.SALE, ROLE.APPROVER_SP, ROLE.APPROVER_LAB,
        ROLE.SERVICE, ROLE.PROJECT, ROLE.LAB],
      query: { statuses: [WO_STATUS.COMPLETED] } },
    { key: 'cancelledMonth', label: 'ยกเลิกเดือนนี้', group: 'month',
      roles: [ROLE.ADMIN, ROLE.SALE, ROLE.APPROVER_SP, ROLE.APPROVER_LAB,
        ROLE.SERVICE, ROLE.PROJECT, ROLE.LAB],
      query: { statuses: [WO_STATUS.CANCELLED] } },

    { key: 'unpaid', label: 'ยังไม่ชำระ', group: 'attention',
      roles: [ROLE.ADMIN, ROLE.SALE],
      query: { payments: [PAYMENT.UNPAID], paymentRequired: true } },

    /*
     * เลยกำหนด (SPEC 9.2 · 13)
     *
     * **นี่คือหน้าจอที่ทำให้ขอบเขตวันการทำงานมีประโยชน์จริง** ป้ายบนใบงานทีละใบ
     * ไม่พอ ถ้าต้องเปิดดูทีละใบถึงจะรู้ว่าเลยกำหนด ก็จะไม่มีใครรู้
     *
     * ทุกแผนกและผู้อนุมัติเห็นได้ ไม่ใช่เฉพาะธุรการ เพราะคำถามที่ตามมาทันทีคือ
     * "ทำไมช่างถึงยังไม่เข้าไปทำ" ซึ่งคนตอบคือแผนก ไม่ใช่คนเปิดใบงาน
     *
     * ยอดนี้มาจาก RPC ตัวเดียวกับยอดอื่นทุกตัว ไม่ได้ยิงคำขอเพิ่มเพื่อนับมัน
     */
    { key: 'overdue', label: 'เลยกำหนด', group: 'attention',
      roles: [ROLE.ADMIN, ROLE.SALE, ROLE.APPROVER_SP, ROLE.APPROVER_LAB,
        ROLE.SERVICE, ROLE.PROJECT, ROLE.LAB],
      query: { overdue: true } }
  ];
}

/**
 * ยอดของหน้าแรก คัดเฉพาะการ์ดที่ผู้ใช้คนนี้เห็นได้ (SPEC 17.3)
 *
 * **Role และแผนกต้องมาจาก getCurrentUser_() เท่านั้น** ฟังก์ชันนี้รับ user มาจาก
 * ชั้น API ซึ่งอ่านจากโทเคน ไม่เคยรับจากหน้าเว็บ · ถ้าวันหนึ่งมีใครส่ง role
 * เข้ามาทางพารามิเตอร์ได้ ใครก็ตามที่แก้คำขอจะเห็นยอดของทุกแผนกทันที
 *
 * ยอดที่เป็นศูนย์ยังต้องแสดง ไม่ใช่ซ่อน — "ถูกตีกลับ 0" คือข้อมูลที่มีค่า
 * และการซ่อนการ์ดที่เป็นศูนย์จะทำให้หน้าเปลี่ยนรูปร่างไปมาจนจำตำแหน่งไม่ได้
 *
 * @param {Object} user ผู้ใช้ปัจจุบันจาก getCurrentUser_()
 * @return {Object} {cards, cardGroups, total, isEmpty, asOf}
 */
async function dashboardFor(user) {
  var totals = await dashboardTotals_();
  var all = dashboardCards_();
  var cards = [];

  for (var i = 0; i < all.length; i++) {
    if (!hasRole_(user, all[i].roles)) continue;
    cards.push({
      key:   all[i].key,
      label: all[i].label,
      group: all[i].group,
      count: Number(totals[all[i].key] || 0),
      query: all[i].query
    });
  }

  return {
    /*
     * ชื่อคีย์ต้องไม่ใช่ `groups` เด็ดขาด — ก้อนข้อมูลตั้งต้นของทุกหน้ามี `groups`
     * ของแถบเมนูอยู่แล้ว · ครั้งหนึ่งชื่อนี้ชนกันจริง หน้าแรกจึงได้กลุ่มเมนูมาวาด
     * เป็นการ์ด แล้วตายที่บรรทัดแรกโดยเซิร์ฟเวอร์ไม่มีอะไรผิดให้เห็นเลย
     */
    cardGroups: dashboardGroupsOf_(cards),
    cards:   cards,
    total:   Number(totals.total || 0),
    isEmpty: totals.isEmpty === true,
    asOf:    String(totals.asOf || '')
  };
}

/* ---------------------------------------------------------------------------
 * ส่วนที่ 2 — รายการใบงานทั้งหมด
 * --------------------------------------------------------------------------- */

/** จำนวนแถวต่อหนึ่งหน้าของรายการใบงาน */
var WO_LIST_PAGE_SIZE = 20;

/**
 * คอลัมน์ที่หน้ารายการแสดงจริง
 *
 * ขอเฉพาะที่ใช้ ไม่ขอทั้งแถว เพราะใบงานหนึ่งใบมีสี่สิบคอลัมน์ และคอลัมน์อย่าง
 * `Job_Description` ยาวเป็นย่อหน้า · การส่งของที่หน้าจอไม่ได้ใช้ข้ามเครือข่าย
 * คือการจ่ายเวลาไปกับสิ่งที่ไม่มีใครเห็น
 *
 * @return {string[]}
 */
function woListFields_() {
  return ['WO_ID', 'Customer_Name', 'Project', 'Location', 'Route', 'Assignment_Type',
    'Overall_Status', 'Payment_Required', 'Payment_Status', 'Created_Date', 'Duration_Days',
    'Reopen_Count'];
}

/**
 * คอลัมน์ที่ช่องค้นหาช่องเดียวค้นได้ (SPEC 17.1)
 *
 * สี่ช่องนี้คือสิ่งที่ผู้ใช้เคยค้นได้มาตลอด · **ห้ามตัดให้เหลือช่องเดียวเพื่อความง่าย**
 * คนที่เคยพิมพ์ชื่อสถานที่แล้วเจอ จะพิมพ์แล้วไม่เจออีกต่อไปโดยไม่มีอะไรบอกเลย
 *
 * @return {string[]}
 */
function woSearchFields_() {
  return ['WO_ID', 'Customer_Name', 'Project', 'Location'];
}

/**
 * ตัวเลือกของตัวกรอง — มาจากค่าคงที่ของระบบ ไม่ได้อ่านข้อมูลเลยสักแถว
 *
 * ต่างจากวิธีเดิมที่สร้างรายการตัวเลือกจากค่าที่มีอยู่จริงในใบงานทุกใบ ซึ่งแปลว่า
 * ต้องอ่านทั้งตารางเพื่อจะวาดกล่องตัวเลือก · ค่าพวกนี้เป็นค่าคงที่ของระบบอยู่แล้ว
 * การอ่านข้อมูลเพื่อค้นหาค่าที่เรารู้ล่วงหน้าอยู่แล้ว จึงเป็นงานที่ไม่ต้องทำตั้งแต่แรก
 *
 * @return {Object}
 */
function woListFilterOptions_() {
  return {
    statuses:     objectValues_(WO_STATUS),
    taskStatuses: objectValues_(TASK_STATUS),
    departments:  objectValues_(ASSIGNMENT),
    routes:       objectValues_(ROUTE),
    payments:     objectValues_(PAYMENT)
  };
}

/**
 * ค่าทั้งหมดของตารางค่าคงที่ เรียงตามที่ประกาศไว้
 * @param {Object} table ตารางค่าคงที่
 * @return {string[]}
 */
function objectValues_(table) {
  var out = [];
  for (var key in table) {
    if (Object.prototype.hasOwnProperty.call(table, key)) out.push(table[key]);
  }
  return out;
}

/**
 * รายการใบงานหนึ่งหน้า — ค้น กรอง เรียง และนับ ที่ฐานข้อมูลทั้งหมด (กฎข้อ 28)
 *
 * ต้นทุนคงที่ไม่ว่าจะมีใบงานกี่ใบ
 *   ไม่ได้กรองตามสถานะของแผนก  1 คำขอ (ได้ทั้งแถวของหน้านี้และยอดรวม)
 *   กรองตามสถานะของแผนกด้วย    2 คำขอ (คำขอแรกหาว่าใบไหนเข้าเงื่อนไข)
 *
 * @param {Object} [query] เงื่อนไขจากหน้าจอ ดู normalizeWoQuery_()
 * @return {Object} {rows, total, page, pageSize, pageCount, filters, emptyReason}
 */
async function listWorkOrdersPage(query) {
  var q = normalizeWoQuery_(query);

  /*
   * เงื่อนไขที่ขัดกันเองต้องจบตั้งแต่ตรงนี้ ไม่ใช่ส่งต่อไปให้ฐานข้อมูล
   *
   * เลือกแต่สถานะที่จบแล้ว คู่กับ "เลยกำหนด" คือชุดเงื่อนไขที่ไม่มีวันจริง ·
   * ถ้าส่งต่อ มันจะกลายเป็น `in.()` ที่มีวงเล็บเปล่า ซึ่ง PostgREST บางรุ่นตอบ 400
   * และบางรุ่นตอบศูนย์แถว — พฤติกรรมที่เปลี่ยนได้โดยที่เราไม่ได้แก้อะไรเลย
   */
  if (woQueryIsImpossible_(q)) return await woListEmptyResult_(q, 'NO_MATCH');

  var filters = woListFilters_(q);

  /*
   * กรองตามสถานะของแผนก ต้องผ่าน Department_Task ก่อน เพราะสถานะของแผนก
   * ไม่ได้อยู่ในตารางใบงาน · จำกัดจำนวนที่หยิบมาเสมอ และใช้คำนำหน้าเป็นตัวกรอง
   * ไม่ใช่รายชื่อ WO_ID ที่ยาวตามจำนวนข้อมูล ซึ่งกฎข้อ 29 ห้ามไว้
   */
  if (q.taskStatuses.length || q.taskDepartments.length) {
    var ids = await woIdsFromTasks_(q);
    if (!ids.length) {
      return await woListEmptyResult_(q, 'NO_MATCH');
    }
    filters['WO_ID'] = { op: 'in', value: ids };
  }

  var page = Math.max(1, q.page);
  var got = await db_selectPage_(SHEET.WORK_ORDER, {
    select: woListFields_(),
    filters: filters,
    order: woListOrder_(q),
    limit: WO_LIST_PAGE_SIZE,
    offset: (page - 1) * WO_LIST_PAGE_SIZE
  });

  var total = got.total < 0 ? got.rows.length : got.total;
  var pageCount = Math.max(1, Math.ceil(total / WO_LIST_PAGE_SIZE));

  return {
    rows:      await woListRows_(got.rows),
    total:     total,
    page:      page,
    pageSize:  WO_LIST_PAGE_SIZE,
    pageCount: pageCount,
    filters:   woListFilterOptions_(),
    // เงื่อนไขที่ใช้จริง ส่งกลับไปให้หน้าจอถือไว้ — ดู woQueryEcho_
    query:     woQueryEcho_(q),
    /*
     * สองสถานะว่างนี้ต้องแยกกันให้ชัด (SPEC 17.4)
     *   ยังไม่มีใบงานเลยในระบบ  ต้องชวนให้ไปเปิดใบงาน
     *   ค้นแล้วไม่เจอ            ข้อมูลมีอยู่ แต่เงื่อนไขแคบไป ต้องชวนให้ล้างตัวกรอง
     * ถ้าใช้ข้อความเดียวกัน ผู้ใช้ที่ค้นไม่เจอจะเข้าใจว่าระบบไม่มีข้อมูลเลย
     *
     * "ระบบว่างเปล่าหรือไม่" มาจากยอดของแดชบอร์ด ซึ่งแคชอยู่แล้ว จึงไม่มีคำขอเพิ่ม
     */
    emptyReason: total ? '' : (await woSystemIsEmpty_() ? 'NO_DATA' : 'NO_MATCH')
  };
}

/**
 * ลำดับของรายการ — ต่อท้ายด้วยคีย์หลักเสมอ
 *
 * ถ้าลำดับไม่แน่นอน หน้าที่สองจะไม่ต่อจากหน้าแรกพอดี แถวบางแถวจะหายและบางแถวมาซ้ำ
 * โดยไม่มีอะไรฟ้อง · คอลัมน์แรกมีค่าซ้ำกันได้ทั้งคู่ คีย์หลักจึงเป็นตัวตัดสินสุดท้าย
 *
 * **กรองหาใบที่เลยกำหนด ต้องเรียงใบที่เลยนานที่สุดขึ้นก่อน** ไม่ใช่เรียงตามวันที่แจ้ง ·
 * ใบที่ครบกำหนดเร็วที่สุดคือใบที่เลยมานานที่สุด จึงเรียงวันครบกำหนดจากน้อยไปมาก ·
 * ถ้าเรียงแบบเดิม ใบที่ค้างมาสามเดือนจะอยู่หน้าสุดท้ายซึ่งไม่มีใครเลื่อนไปดู
 * แล้วตัวกรองนี้ก็ไม่ได้ช่วยอะไรเลย
 *
 * @param {Object} q เงื่อนไขที่จัดรูปแล้ว
 * @return {Object[]}
 */
function woListOrder_(q) {
  if (q.overdue) {
    return [{ column: 'Due_Date', ascending: true }, { column: 'WO_ID', ascending: true }];
  }
  // ใหม่ไปเก่าตามค่าตั้งต้น ซึ่งเป็นลำดับที่หน้ารายการใช้มาตลอด (SPEC 17.1)
  return [{ column: 'Created_Date', ascending: false }, { column: 'WO_ID', ascending: false }];
}

/**
 * จัดรูปแถวให้หน้าจอ พร้อมสถานะรายแผนกของใบงานในหน้านี้
 *
 * **สถานะรายแผนกยังอยู่ครบ และไม่ได้แลกมาด้วยการอ่านทั้งตาราง** · ใบงานหนึ่งใบ
 * มีได้หลายแผนกพร้อมกัน คอลัมน์นี้จึงเป็นสิ่งเดียวที่บอกได้ว่างานร่วมเดินไปถึงไหน
 * ของแต่ละฝั่ง · ตัดทิ้งเมื่อไรคือหน้ารายการที่ตอบคำถามนั้นไม่ได้อีกเลย
 *
 * ใช้คำขอเพิ่มหนึ่งครั้งสำหรับยี่สิบใบของหน้านี้ ไม่ใช่หนึ่งครั้งต่อหนึ่งใบ ·
 * รายการเลขที่ใบงานที่ส่งไปยาวไม่เกินยี่สิบเสมอ **เพราะเราเป็นคนกำหนดขนาดหน้า
 * ไม่ใช่ข้อมูลเป็นคนกำหนด** ซึ่งเป็นเส้นแบ่งที่กฎข้อ 29 วางไว้
 *
 * @param {Object[]} rows แถวใบงานของหน้านี้
 * @return {Object[]} แถวในรูปที่หน้าจอใช้
 */
async function woListRows_(rows) {
  if (!rows.length) return [];

  var ids = [];
  for (var i = 0; i < rows.length; i++) ids.push(String(rows[i]['WO_ID']));

  var byWo = {};
  var tasks = await db_select_(SHEET.DEPARTMENT_TASK, {
    select: ['WO_ID', 'Department', 'Status'],
    filters: { 'WO_ID': { op: 'in', value: ids } },
    // เพดานนี้เป็นของเรา ไม่ใช่ของข้อมูล · ยี่สิบใบมีงานแผนกได้ไม่เกินสองแผนกต่อใบ
    limit: WO_LIST_PAGE_SIZE * 3
  });
  for (var t = 0; t < tasks.length; t++) {
    var key = String(tasks[t]['WO_ID']);
    if (!byWo[key]) byWo[key] = [];
    byWo[key].push({ dept: tasks[t]['Department'], status: tasks[t]['Status'] });
  }

  var today = thaiDayOf_(new Date());
  var out = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    out.push({
      woId:     row['WO_ID'],
      customer: row['Customer_Name'],
      project:  row['Project'],
      location: row['Location'],
      route:    row['Route'],
      dept:     row['Assignment_Type'],
      status:   row['Overall_Status'],
      payment:  row['Payment_Status'] || PAYMENT.UNPAID,
      // ใบที่ติ๊ก "ต้องชำระก่อนเริ่มงาน" ไว้ เป็นคนละเรื่องกับสถานะการชำระ
      // ส่งแยกมาให้หน้าจอ ไม่ใช่เอาไปกลบสถานะ ซึ่งจะเปลี่ยนสิ่งที่ผู้ใช้เคยเห็นมาตลอด
      mustPay:  isTruthyCell_(row['Payment_Required']),
      created:  formatForDisplay_(row['Created_Date']),
      /*
       * ขอบเขตวันการทำงาน — คำนวณจาก Created_Date บวก Duration_Days ตามเวลาไทย
       * ส่งมาเป็นก้อนที่ตัดสินแล้ว หน้าจอไม่ต้องรู้กติกาเลยสักข้อ (กฎข้อ 19)
       * ใบที่ไม่ได้กรอกขอบเขตวันได้ has:false แล้วหน้าจอไม่แสดงอะไรเลย
       *
       * ส่ง today เข้าไปตัวเดียวกันทุกแถว เพื่อให้ทั้งหน้าตัดสินจากวันเดียวกัน ·
       * ถ้าปล่อยให้แต่ละแถวอ่านเวลาเองแล้วหน้าถูกเปิดคร่อมเที่ยงคืนพอดี
       * แถวบนกับแถวล่างในหน้าเดียวกันจะนับคนละวัน
       */
      due:      dueInfoOf_(row['Created_Date'], row['Duration_Days'],
                  row['Overall_Status'], today),
      /*
       * จำนวนครั้งที่เปิดซ้ำ — ส่งเป็นตัวเลขเสมอ ให้หน้าจอตัดสินเองว่าจะแสดงไหม
       *
       * ใบที่ถูกเปิดซ้ำห้าครั้งต้องมองออกจากรายการ ไม่ใช่ต้องเปิดเข้าไปดูทีละใบ
       * หรือไล่อ่าน Audit_Log ถึงจะรู้ · ถ้าไม่เห็นจากรายการ การเปิดงานซ้ำจะกลายเป็น
       * วิธีซ่อนงานที่ต้องแก้ใหม่โดยไม่มีใครเห็น
       */
      reopened: Number(row['Reopen_Count'] || 0),
      tasks:    byWo[String(row['WO_ID'])] || []
    });
  }
  return out;
}

/**
 * ผลลัพธ์ว่างที่ยังมีโครงสร้างครบ — หน้าจอต้องวาดตัวกรองได้เหมือนกรณีปกติ
 * @param {Object} q เงื่อนไขที่จัดรูปแล้ว
 * @param {string} reason เหตุผลที่ว่าง
 * @return {Object}
 */
async function woListEmptyResult_(q, reason) {
  return {
    rows: [], total: 0, page: Math.max(1, q.page), pageSize: WO_LIST_PAGE_SIZE, pageCount: 1,
    filters: woListFilterOptions_(),
    query: woQueryEcho_(q),
    emptyReason: await woSystemIsEmpty_() ? 'NO_DATA' : reason
  };
}

/**
 * ระบบยังไม่มีใบงานเลยหรือไม่ — อ่านจากยอดที่แดชบอร์ดแคชไว้แล้ว
 *
 * ไม่ยิงคำขอใหม่ เพราะยอดชุดนั้นมีคำตอบอยู่แล้วและสดพอสำหรับคำถามนี้
 * ต่อให้คลาดไปหกสิบวินาที ผลคือข้อความชวนให้ไปเปิดใบงานกับข้อความชวนให้ล้างตัวกรอง
 * สลับกันชั่วคราว ซึ่งไม่ใช่ความเสียหาย · ส่วนการยิงเพิ่มหนึ่งคำขอทุกครั้งที่ค้นไม่เจอ
 * คือต้นทุนที่จ่ายตลอดไปเพื่อความแม่นยำที่ไม่มีใครต้องการ
 *
 * @return {boolean}
 */
async function woSystemIsEmpty_() {
  try {
    return (await dashboardTotals_()).isEmpty === true;
  } catch (e) {
    return false;   // อ่านยอดไม่ได้ ให้ถือว่ามีข้อมูล เพื่อไม่ชวนให้ไปสร้างใบงานซ้ำ
  }
}

/**
 * เงื่อนไขชุดนี้ขัดกันเองจนไม่มีวันมีแถวไหนเข้าข่ายหรือไม่
 *
 * ตอนนี้มีกรณีเดียว: ขอ "เลยกำหนด" พร้อมกับเลือกเฉพาะสถานะที่จบไปแล้ว ·
 * ใบที่จบแล้วหยุดนับกำหนดเวลาตามกติกา สองอย่างนี้จึงอยู่ด้วยกันไม่ได้
 *
 * @param {Object} q เงื่อนไขที่จัดรูปแล้ว
 * @return {boolean}
 */
function woQueryIsImpossible_(q) {
  if (!q.overdue || !q.statuses.length) return false;

  for (var i = 0; i < q.statuses.length; i++) {
    if (q.statuses[i] !== WO_STATUS.COMPLETED && q.statuses[i] !== WO_STATUS.CANCELLED) {
      return false;
    }
  }
  return true;
}

/**
 * ตัวกรองฝั่งใบงาน แปลงจากเงื่อนไขของหน้าจอเป็นตัวกรองของฐานข้อมูล
 * @param {Object} q เงื่อนไขที่จัดรูปแล้ว
 * @return {Object}
 */
function woListFilters_(q) {
  var filters = {};

  if (q.statuses.length) filters['Overall_Status'] = { op: 'in', value: q.statuses };
  if (q.routes.length)   filters['Route'] = { op: 'in', value: q.routes };

  /*
   * "แผนกผู้รับงาน" คือ Assignment_Type ของใบงาน ไม่ใช่แผนกของ Department_Task
   *
   * สองอย่างนี้ต่างกันจริงและสลับกันไม่ได้ · Assignment_Type มีค่า SERVICE_PROJECT
   * กับ UNSPECIFIED ซึ่งไม่ใช่ชื่อแผนกเลย และใบที่ยังไม่ได้อนุมัติยังไม่มี Task สักตัว
   * การกรองด้วยแผนกของ Task จึงทำให้ใบที่รออนุมัติหายไปทั้งหมด ทั้งที่ผู้ใช้เห็น
   * ว่ามันระบุแผนกไว้แล้วบนหน้าจอ
   */
  if (q.departments.length) filters['Assignment_Type'] = { op: 'in', value: q.departments };

  // ตัวกรอง "การชำระเงิน" ดูที่สถานะอย่างเดียว เหมือนที่เคยเป็นมา
  if (q.payments.length) filters['Payment_Status'] = { op: 'in', value: q.payments };

  /*
   * "ต้องชำระก่อนเริ่มงาน" เป็นเงื่อนไขแยกต่างหาก ไม่ใช่ส่วนหนึ่งของสถานะการชำระ
   *
   * การ์ด "ยังไม่ชำระ" บนแดชบอร์ดนับเฉพาะใบที่ต้องชำระจริง จึงส่งเงื่อนไขนี้มาด้วย ·
   * แต่ตัวกรองบนหน้ารายการต้องไม่ถูกบังคับตามไปด้วย ไม่งั้นการกรองหา "ใบที่ชำระแล้ว"
   * จะซ่อนใบที่ไม่ต้องชำระทั้งหมดทิ้งไปเงียบ ๆ ซึ่งไม่ใช่สิ่งที่ผู้ใช้ขอ
   */
  if (q.paymentRequired) filters['Payment_Required'] = true;

  /*
   * เลยกำหนด — สามเงื่อนไขที่ต้องมาพร้อมกันเสมอ ห้ามขาดตัวใดตัวหนึ่ง
   *
   *   Duration_Days ไม่เป็น NULL  ใบที่ไม่ได้กรอกขอบเขตวันต้องไม่ติดตัวกรองนี้
   *                               และเงื่อนไขนี้คือสิ่งที่ทำให้ตัวเลือกแผนงานหยิบ
   *                               index บางส่วน idx_wo_due ได้ · ถ้าตัดออก ผลยังถูก
   *                               (NULL ทำให้การเทียบเป็นเท็จอยู่แล้ว) แต่ฐานข้อมูล
   *                               ต้องไล่อ่านทั้งตารางเพื่อพิสูจน์ ซึ่งแพงขึ้นทุกวัน
   *   ใบยังไม่จบ                  ใบที่ปิดหรือยกเลิกแล้วต้องหยุดนับ งานจบไปแล้ว
   *   Due_Date < วันนี้           วันนี้ตามเวลาไทย ไม่ใช่ตาม UTC
   *
   * Due_Date เป็นคอลัมน์ที่ฐานข้อมูลคำนวณให้ตอนอ่าน ไม่ได้เก็บค่าไว้ (DB_COMPUTED_COLUMNS)
   * สูตรจึงมีอยู่ที่เดียวและใช้ร่วมกับยอดบนแดชบอร์ด ตัวเลขสองที่จึงตรงกันเสมอ
   */
  if (q.overdue) {
    filters['Duration_Days'] = { op: 'not.is', value: null };
    filters['Due_Date'] = { op: 'lt', value: thaiDayOf_(new Date()) };

    /*
     * "ใบยังไม่จบ" ต้องรวมเข้ากับตัวกรองสถานะที่ผู้ใช้เลือกไว้ ไม่ใช่เขียนทับมัน
     *
     * ทั้งสองเงื่อนไขอยู่บนคอลัมน์เดียวกัน และ object ของ JavaScript มีคีย์ซ้ำไม่ได้ ·
     * ถ้าเขียนทับ ผู้ใช้ที่กรองหา "รออนุมัติ" แล้วติ๊กเลยกำหนดด้วย จะได้ใบทุกสถานะ
     * ที่เลยกำหนด ซึ่งกว้างกว่าที่ขอ แต่ดูเหมือนตัวกรองทำงานอยู่เพราะผลลัพธ์ก็แคบลงจริง
     */
    var openOnly = [];
    for (var s = 0; s < q.statuses.length; s++) {
      if (q.statuses[s] !== WO_STATUS.COMPLETED && q.statuses[s] !== WO_STATUS.CANCELLED) {
        openOnly.push(q.statuses[s]);
      }
    }

    filters['Overall_Status'] = q.statuses.length
      ? { op: 'in', value: openOnly }
      : { op: 'not.in', value: [WO_STATUS.COMPLETED, WO_STATUS.CANCELLED] };
  }

  /*
   * เคยเปิดซ้ำ — กรองที่ฐานข้อมูล ไม่ใช่ลากทุกใบมานับเอง (กฎข้อ 28)
   *
   * ใช้ `gt 0` ไม่ใช่ `not.is null` เพราะใบเก่าทุกใบมีค่าเป็น 0 ตามค่าตั้งต้นของคอลัมน์
   * ไม่ใช่ NULL · การกรองด้วย NULL จะได้ทุกใบในระบบกลับมา ซึ่งดูเหมือนตัวกรองพัง
   * แต่จริง ๆ คือเขียนเงื่อนไขผิดชนิด
   */
  if (q.reopened) filters['Reopen_Count'] = { op: 'gt', value: 0 };

  /*
   * ช่วงวันที่เป็นสองเงื่อนไขบนคอลัมน์เดียวกัน ต้องส่งเป็นรายการ ไม่ใช่ค่าเดี่ยว
   *
   * เขียนเป็นค่าเดี่ยวสองครั้งไม่ได้ เพราะคีย์ซ้ำใน object จะทับกันเอง แล้วขอบหนึ่ง
   * จะหายไปเงียบ ๆ — ผู้ใช้ที่เลือกช่วง "1 ถึง 31 มกราคม" จะได้ทุกใบตั้งแต่ 1 มกราคม
   * เป็นต้นไปจนถึงวันนี้ ซึ่งดูเหมือนตัวกรองทำงานอยู่ เพราะผลลัพธ์ก็แคบลงจริง
   */
  var dateTerms = [];
  if (q.from) dateTerms.push({ op: 'gte', value: new Date(q.from) });
  if (q.to)   dateTerms.push({ op: 'lte', value: new Date(q.to) });
  if (dateTerms.length) filters['Created_Date'] = dateTerms;

  /*
   * คำค้นเดียวที่ต้องตรงสักช่องหนึ่งในสี่ช่อง · หลีกอักขระของ LIKE เสมอ (SPEC 21)
   * ไม่งั้นคำค้นที่มี % หรือ _ ปนอยู่จะกวาดแถวที่ไม่เกี่ยวข้องมาด้วย
   */
  if (q.text) {
    var pattern = dbContainsPattern_(q.text);
    var fields = woSearchFields_();
    var terms = [];
    for (var i = 0; i < fields.length; i++) {
      terms.push({ column: fields[i], op: 'ilike', value: pattern });
    }
    filters[DB_OR_KEY] = terms;
  }

  return filters;
}

/**
 * เลขที่ใบงานที่มีงานของแผนกตรงเงื่อนไข
 *
 * **จำกัดจำนวนเสมอ** เพราะรายการนี้จะกลายเป็นตัวกรอง `in.(...)` ซึ่งยาวตามจำนวน
 * ที่ได้มา · กฎข้อ 29 ห้ามสร้างตัวกรองจากรายการที่ยาวตามจำนวนข้อมูล และเพดาน
 * ความยาว URL ก็บังคับอยู่แล้ว · เพดานนี้เป็นของเราเอง ไม่ใช่ของข้อมูล จึงปลอดภัย
 *
 * @param {Object} q เงื่อนไขที่จัดรูปแล้ว
 * @return {string[]} เลขที่ใบงาน ไม่ซ้ำ
 */
async function woIdsFromTasks_(q) {
  var filters = {};
  if (q.taskStatuses.length)    filters['Status'] = { op: 'in', value: q.taskStatuses };
  if (q.taskDepartments.length) filters['Department'] = { op: 'in', value: q.taskDepartments };

  var rows = await db_select_(SHEET.DEPARTMENT_TASK, {
    select: ['WO_ID'],
    filters: filters,
    order: { column: 'WO_ID', ascending: false },
    limit: WO_TASK_FILTER_LIMIT
  });

  var seen = {};
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var id = String(rows[i]['WO_ID'] || '');
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

/**
 * เพดานจำนวนใบงานที่ตัวกรองสถานะของแผนกหยิบมาได้
 *
 * ตั้งจากเพดานความยาว URL ซึ่งวัดจากของจริงไว้ที่ 2,082 ตัวอักษร (กฎข้อ 29)
 * เลขที่ใบงานยาว 15 ตัวอักษร บวกเครื่องหมายคำพูดและจุลภาคเป็น 18 ·
 * 1,873 หารด้วย 18 ได้ราว 104 ตัว หักที่อยู่พื้นฐานกับตัวกรองอื่นออก เหลือ 80
 *
 * ถึงเพดานเมื่อไรแปลว่าผู้ใช้กำลังกรองกว้างเกินกว่าที่หน้ารายการจะช่วยได้
 * ซึ่งเป็นกรณีที่ควรใช้แดชบอร์ดแทน · แต่ต้องไม่เงียบ — ดู woIdsFromTasks_
 */
var WO_TASK_FILTER_LIMIT = 80;

/**
 * จัดเงื่อนไขที่หน้าจอส่งมาให้อยู่ในรูปที่ตรวจง่ายและปลอดภัย
 *
 * ทุกอย่างที่มาจากหน้าเว็บถือว่าไม่น่าเชื่อถือ ต้องแปลงชนิดเองทั้งหมด
 * และ **ค่าที่ไม่ใช่ค่าคงที่ของระบบต้องถูกทิ้ง** ไม่ใช่ส่งต่อไปให้ฐานข้อมูล
 * เพราะสถานะที่ไม่มีอยู่จริงจะได้ผลว่างเปล่าซึ่งดูเหมือนระบบพัง
 *
 * @param {Object} query เงื่อนไขดิบ
 * @return {Object}
 */
function normalizeWoQuery_(query) {
  var raw = query || {};
  return {
    text:         String(raw.text || '').trim(),
    statuses:     woAllowedValues_(raw.statuses, WO_STATUS),
    taskStatuses: woAllowedValues_(raw.taskStatuses, TASK_STATUS),
    // แผนกผู้รับงานของใบงาน — รวม SERVICE_PROJECT และ UNSPECIFIED ซึ่งไม่ใช่ชื่อแผนก
    departments:  woAllowedValues_(raw.departments, ASSIGNMENT),
    // แผนกเจ้าของงานใน Department_Task — สามค่าจริงเท่านั้น ใช้คู่กับ taskStatuses
    taskDepartments: woAllowedValues_(raw.taskDepartments, DEPT),
    routes:       woAllowedValues_(raw.routes, ROUTE),
    payments:     woAllowedValues_(raw.payments, PAYMENT),
    paymentRequired: raw.paymentRequired === true || String(raw.paymentRequired) === 'true',
    overdue:      raw.overdue === true || String(raw.overdue) === 'true',
    /*
     * เคยเปิดซ้ำ — ธงเดียวกับ overdue ไม่ใช่ตัวเลือกหลายค่า
     *
     * คำถามที่คนถามคือ "ใบไหนเคยถูกเปิดซ้ำบ้าง" ไม่ใช่ "ใบไหนเปิดซ้ำสามครั้งพอดี"
     * ถ้าทำเป็นช่องกรอกจำนวน คนจะต้องเดาว่าควรใส่เลขอะไร แล้วส่วนใหญ่จะไม่ใช้เลย
     */
    reopened:     raw.reopened === true || String(raw.reopened) === 'true',
    from:         homeDayStart_(raw.from),
    to:           homeDayEnd_(raw.to),
    /*
     * เก็บข้อความวันที่ตามที่ผู้ใช้เลือกไว้ด้วย นอกเหนือจากตัวเลขที่ใช้กรอง
     *
     * ช่อง `input type="date"` ต้องการ 'yyyy-MM-dd' เท่านั้น (กฎข้อ 20) การแปลง
     * ตัวเลขกลับเป็นข้อความที่หน้าเว็บ คือการเปิดทางให้วันเลื่อนอีกรอบหนึ่งโดยไม่จำเป็น
     */
    fromDay:      String(raw.from || '').trim(),
    toDay:        String(raw.to || '').trim(),
    page:         Math.max(1, Math.floor(Number(raw.page || 1)) || 1)
  };
}

/**
 * เงื่อนไขที่เซิร์ฟเวอร์ใช้จริง ในรูปที่หน้าจอส่งกลับมาได้ตรง ๆ
 *
 * **หน้าจอต้องรับเงื่อนไขชุดนี้ไปถือไว้แทนของเดิมเสมอ** เพราะเงื่อนไขเดินทางมาได้
 * สองทาง: จากหน้าจอเอง กับจาก query string ตอนที่ผู้ใช้กดไทล์บนแดชบอร์ดเข้ามา ·
 * ทางที่สองหน้าจอไม่เคยเห็นเลย ถ้าไม่ส่งกลับไป หน้าจะแสดงผลที่กรองแล้วรอบแรก
 * แต่พอกดหน้าถัดไปหรือกดค้นหา ตัวกรองจะหายไปเงียบ ๆ แล้วผู้ใช้จะเจอรายการทั้งหมด
 * โดยไม่รู้ว่าเกิดอะไรขึ้น · ค่าที่เซิร์ฟเวอร์ปฏิเสธก็หายไปจากชุดนี้ด้วย ซึ่งถูกต้อง —
 * หน้าจอจะได้แสดงสิ่งที่กรองอยู่จริง ไม่ใช่สิ่งที่ขอไป
 *
 * @param {Object} q เงื่อนไขที่จัดรูปแล้ว
 * @return {Object}
 */
function woQueryEcho_(q) {
  return {
    text:            q.text,
    statuses:        q.statuses,
    taskStatuses:    q.taskStatuses,
    departments:     q.departments,
    taskDepartments: q.taskDepartments,
    routes:          q.routes,
    payments:        q.payments,
    paymentRequired: q.paymentRequired,
    overdue:         q.overdue,
    reopened:        q.reopened,
    from:            q.fromDay,
    to:              q.toDay,
    page:            q.page
  };
}

/**
 * เฉพาะค่าที่อยู่ในตารางค่าคงที่จริง — ค่าที่หน้าเว็บกุขึ้นมาถูกทิ้งเงียบ ๆ
 * @param {*} value ค่าที่ส่งมา รับทั้ง array และค่าเดี่ยว
 * @param {Object} table ตารางค่าคงที่ที่ยอมรับ
 * @return {string[]}
 */
function woAllowedValues_(value, table) {
  var allowed = objectValues_(table);
  var list = homeListOf_(value);
  var out = [];

  for (var i = 0; i < list.length; i++) {
    if (allowed.indexOf(list[i]) !== -1 && out.indexOf(list[i]) === -1) out.push(list[i]);
  }
  return out;
}

/**
 * รายการค่าที่เลือกไว้ — รับทั้ง array และค่าเดี่ยว
 * @param {*} value ค่าที่ส่งมา
 * @return {string[]}
 */
function homeListOf_(value) {
  if (value === null || value === undefined || value === '') return [];
  var list = (Object.prototype.toString.call(value) === '[object Array]') ? value : [value];
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var text = String(list[i] === null || list[i] === undefined ? '' : list[i]).trim();
    if (text) out.push(text);
  }
  return out;
}

/**
 * ต้นวันของวันที่ที่เลือก (เวลาไทย) เป็นตัวเลข
 * @param {string} value ข้อความ yyyy-MM-dd จากช่องเลือกวันที่
 * @return {number} 0 = ไม่ได้เลือก
 */
function homeDayStart_(value) {
  var day = String(value || '').trim();
  if (!day) return 0;
  var at = toDate_(day + 'T00:00:00');
  return at ? at.getTime() : 0;
}

/**
 * ปลายวันของวันที่ที่เลือก (เวลาไทย) เป็นตัวเลข
 *
 * ต้องเป็นวินาทีสุดท้ายของวัน ไม่ใช่เที่ยงคืนของวันนั้น ไม่งั้นใบงานที่สร้างระหว่างวัน
 * ในวันสุดท้ายของช่วงจะหลุดออกไปทั้งหมด ซึ่งเป็นความผิดที่มองไม่เห็นจนกว่าจะมีคนทัก
 *
 * @param {string} value ข้อความ yyyy-MM-dd จากช่องเลือกวันที่
 * @return {number} 0 = ไม่ได้เลือก
 */
function homeDayEnd_(value) {
  var day = String(value || '').trim();
  if (!day) return 0;
  var at = toDate_(day + 'T23:59:59');
  return at ? at.getTime() : 0;
}
