/**
 * 02_StateMachine.gs — ตาราง Transition + changeStatus() + recalcWoStatus()
 *
 * อ้างอิง SPEC.md หัวข้อ 5 (ตาราง Transition), 8 (กฎปิดงาน/Return/Cancel), 20.4 (ตรรกะ recalcWoStatus)
 *
 * หลักการ: ถ้า Action ใดไม่อยู่ในตาราง ระบบต้องปฏิเสธเสมอ (SPEC 5)
 * ทุกการเปลี่ยนสถานะต้องผ่าน changeStatus() และสถานะ WO ต้องคำนวณจาก recalcWoStatus() ที่เดียวเท่านั้น
 *
 * ไฟล์นี้แบ่งเป็นสองชั้นชัดเจน
 *   - ชั้นตรรกะ (ไม่แตะ Sheet): ตาราง Transition, Guard, planStatusChange_() และ recalcFromStatuses_()
 *     เป็นส่วนที่ชุดทดสอบตรรกะยิงตรงเข้ามา และต้องไม่เปลี่ยนพฤติกรรมเมื่อฐานข้อมูลเปลี่ยน
 *   - ชั้นเชื่อมกับ Repo (ท้ายไฟล์): changeStatus() และ recalcWoStatus(woId)
 *     อ่านสถานะปัจจุบันจากชีต เขียนสถานะใหม่กลับ และเขียน Audit_Log ให้อัตโนมัติ
 */

/* ค่าที่ใช้แทน "คงสถานะเดิม" ในคอลัมน์สถานะถัดไปของตาราง Transition */
var KEEP_STATUS = null;

/* แคชตาราง Transition ไว้ในตัวแปรระดับสคริปต์
 * (สร้างในฟังก์ชัน ไม่สร้างที่ top-level เพราะลำดับโหลดไฟล์ .gs ไม่แน่นอน) */
var TRANSITIONS_CACHE_ = null;

/**
 * ตาราง Transition ทั้งหมด (SPEC 5)
 * from: array ของสถานะที่ทำ Action นี้ได้ · null = ยังไม่มีเอกสาร (ใช้กับ CREATE)
 * to: สถานะถัดไป · KEEP_STATUS = คงเดิม
 * woEffect: สถานะ WO ที่เปลี่ยนตามทันทีจาก Action ระดับ Task
 *           (COMPLETED / CANCELLED / IN_PROGRESS ไม่ใส่ตรงนี้ เพราะต้องผ่าน recalcWoStatus เท่านั้น)
 * @return {Object[]}
 */
function getTransitions() {
  if (TRANSITIONS_CACHE_) return TRANSITIONS_CACHE_;

  TRANSITIONS_CACHE_ = [
    /* ---------- ระดับใบงาน (WorkOrder) ---------- */
    {
      entity: ENTITY.WO, action: ACTION.CREATE,
      from: null, to: WO_STATUS.PENDING_APPROVE,
      roles: ROLE_GROUP.ADMIN,
      guards: ['requiredFields'],
      note: 'Required Fields ครบทุกช่อง (สายงานเป็น "ไม่ระบุ" ได้) — ไม่มีขั้นบันทึกร่าง (SPEC 4.1)'
    },
    {
      entity: ENTITY.WO, action: ACTION.EDIT,
      from: [WO_STATUS.RETURNED], to: KEEP_STATUS,
      roles: ROLE_GROUP.ADMIN,
      guards: ['ownerOfWo'],
      note: 'เป็นเจ้าของใบงาน · แก้ได้เฉพาะใบที่ถูกตีกลับ เพราะใบที่รออนุมัติถูกล็อกไว้'
    },
    {
      entity: ENTITY.WO, action: ACTION.SUBMIT,
      from: [WO_STATUS.RETURNED], to: WO_STATUS.PENDING_APPROVE,
      roles: ROLE_GROUP.ADMIN,
      guards: ['requiredFields'],
      note: 'Required Fields ครบ — ส่งอนุมัติใหม่หลังแก้ไขตามที่ถูกตีกลับ ต้องอนุมัติซ้ำเสมอ (SPEC 8)'
    },
    {
      entity: ENTITY.WO, action: ACTION.ACCEPT,
      from: [WO_STATUS.PENDING_APPROVE], to: WO_STATUS.APPROVED,
      roles: ROLE_GROUP.APPROVER,
      guards: ['approverOfRoute', 'notCreator', 'assignmentSpecified', 'requiredFiles'],
      /*
       * เงื่อนไขไฟล์แนบย้ายมาจาก SUBMIT (SPEC 5)
       *
       * ตอนนี้ไม่มีขั้นบันทึกร่างแล้ว ใบงานเกิดพร้อมสถานะรออนุมัติทันที
       * จึงไม่มีช่วงเวลาให้แนบไฟล์ก่อนส่ง · การบังคับที่ SUBMIT จะทำให้เปิดใบงานไม่ได้เลย
       * ย้ายมาไว้ที่ผู้อนุมัติแทน ซึ่งเป็นคนที่ต้องใช้เอกสารตัดสินใจอยู่แล้ว
       * และถ้าไม่ครบก็ตีกลับพร้อมเหตุผลที่ชัดเจนได้ทันที
       */
      note: 'ไม่ใช่ผู้สร้าง WO เอง · ไฟล์แนบที่บังคับครบ · ต้องระบุแผนกผู้รับงาน (ห้ามเป็น UNSPECIFIED)'
    },
    {
      entity: ENTITY.WO, action: ACTION.RETURN,
      from: [WO_STATUS.PENDING_APPROVE], to: WO_STATUS.RETURNED,
      roles: ROLE_GROUP.APPROVER,
      guards: ['approverOfRoute', 'reason'],
      note: 'ต้องระบุเหตุผล และเพิ่มตัวนับ Return_Count (SPEC 8)'
    },
    {
      entity: ENTITY.WO, action: ACTION.CANCEL_WO,
      from: [WO_STATUS.PENDING_APPROVE, WO_STATUS.RETURNED], to: WO_STATUS.CANCELLED,
      roles: ROLE_GROUP.ADMIN.concat(ROLE_GROUP.APPROVER),
      guards: ['reason'],
      note: 'ยกเลิกทั้งใบได้เฉพาะก่อนอนุมัติ (SPEC 8) หลังอนุมัติแล้วต้องยกเลิกรายแผนกด้วย TASK_CANCEL'
    },
    {
      entity: ENTITY.WO, action: ACTION.REOPEN,
      from: [WO_STATUS.COMPLETED], to: WO_STATUS.IN_PROGRESS,
      roles: ROLE_GROUP.APPROVER.concat(REOPEN_DEPARTMENTS),
      guards: ['reopenAllowed', 'reason'],
      note: 'เปิดงานที่ปิดไปแล้วใหม่ เพื่อไม่ให้ผู้ใช้เลี่ยงไปเปิด WO ใบใหม่จนประวัติขาดตอน (SPEC 8) · ' +
            'แผนกใน REOPEN_DEPARTMENTS กดเองได้ เพราะคนที่รู้ว่างานยังไม่จบคือแผนก ไม่ใช่ผู้อนุมัติ · ' +
            'จาก CANCELLED เปิดใหม่ไม่ได้ เพราะการยกเลิกเป็นสถานะปลายทาง ถ้ายกเลิกผิดเป็นงานแก้ไขของ Admin คนละเรื่อง'
    },

    /* ---------- ระดับงานของแผนก (Department_Task) ---------- */
    {
      entity: ENTITY.TASK, action: ACTION.CREATE,
      from: null, to: TASK_STATUS.PENDING_ACCEPT,
      roles: ROLE_GROUP.APPROVER,
      guards: ['approverOfRoute'],
      note: 'ผู้อนุมัติสร้าง Task ตอน ACCEPT — 1 ตัว หรือ 2 ตัวเมื่อเป็น SERVICE_PROJECT (SPEC 20.2)'
    },
    {
      entity: ENTITY.TASK, action: ACTION.TASK_ACCEPT,
      from: [TASK_STATUS.PENDING_ACCEPT], to: TASK_STATUS.IN_PROGRESS,
      roles: ROLE_GROUP.DEPARTMENT,
      guards: ['woNotReturned', 'taskOwner', 'paymentCleared'],
      note: 'WO ต้องไม่ถูกตีกลับอยู่ · ผ่านเงื่อนไขการชำระเงิน (SPEC 12) · WO จะกลายเป็น IN_PROGRESS ผ่าน recalcWoStatus'
    },
    {
      entity: ENTITY.TASK, action: ACTION.TASK_UPDATE,
      from: [TASK_STATUS.IN_PROGRESS], to: KEEP_STATUS,
      roles: ROLE_GROUP.DEPARTMENT,
      guards: ['woNotReturned', 'taskOwner'],
      note: 'อัปเดต Step / งวดงาน / ผลแล็บ — สถานะ Task คงเดิม · ทำไม่ได้ขณะ WO ถูกตีกลับ'
    },
    {
      entity: ENTITY.TASK, action: ACTION.TASK_COMPLETE,
      from: [TASK_STATUS.IN_PROGRESS], to: TASK_STATUS.COMPLETED,
      roles: ROLE_GROUP.DEPARTMENT,
      guards: ['woNotReturned', 'taskOwner', 'allStepsDone', 'requiredReports'],
      note: 'WO ต้องไม่ถูกตีกลับอยู่ · ทุก Step/งวดเสร็จครบ และ Report ที่บังคับอัปโหลดครบ (SPEC 20.3)'
    },
    {
      entity: ENTITY.TASK, action: ACTION.TASK_RETURN,
      from: [TASK_STATUS.PENDING_ACCEPT, TASK_STATUS.IN_PROGRESS], to: KEEP_STATUS,
      roles: ROLE_GROUP.DEPARTMENT,
      guards: ['taskOwner', 'reason'],
      woEffect: WO_STATUS.RETURNED,
      note: 'แผนกตีกลับ → WO กลับไป RETURNED แต่ "สถานะ Task คงเดิม" ตาม SPEC 20.5 ข้อ 4 · ' +
            'งานที่ทำค้างไว้ยังอยู่ครบ และถูกพักโดยอัตโนมัติเพราะ guard woNotReturned ตรวจสถานะ WO ให้แล้ว · ' +
            'ถ้าเปลี่ยน Task เป็น RETURNED ด้วย พออนุมัติกลับมาจะไม่มี Transition ใดพากลับไป IN_PROGRESS ได้เลย'
    },
    {
      entity: ENTITY.TASK, action: ACTION.TASK_CANCEL,
      from: [TASK_STATUS.PENDING_ACCEPT, TASK_STATUS.IN_PROGRESS], to: TASK_STATUS.CANCELLED,
      roles: ROLE_GROUP.DEPARTMENT.concat(ROLE_GROUP.APPROVER, ROLE_GROUP.ADMIN),
      guards: ['woNotReturned', 'taskOwnerOrManager', 'reason'],
      note: 'แผนกยกเลิกงานตัวเองได้ทันทีโดยไม่ต้องขออนุมัติ แต่ต้องกรอกเหตุผลและแจ้ง Admin + ผู้อนุมัติ (SPEC 8) · ทำไม่ได้ขณะ WO ถูกตีกลับ'
    },
    {
      entity: ENTITY.TASK, action: ACTION.REOPEN,
      from: [TASK_STATUS.COMPLETED], to: TASK_STATUS.IN_PROGRESS,
      roles: ROLE_GROUP.APPROVER.concat(REOPEN_DEPARTMENTS),
      guards: ['reopenAllowed', 'reason'],
      note: 'REOPEN ต้องดึง Task ของแผนกที่ระบุกลับมาทำต่อในรายการเดียวกัน ' +
            'ไม่งั้น recalcWoStatus จะเห็นว่า Task ยัง COMPLETED แล้วปิดงานทันที (SPEC 20.6 · กฎข้อ 12)'
    }
  ];

  return TRANSITIONS_CACHE_;
}

/**
 * หาแถวในตาราง Transition ที่ตรงกับ entity + สถานะปัจจุบัน + action
 * @param {string} entity ค่าจาก ENTITY
 * @param {string|null} fromStatus สถานะปัจจุบัน (null/'' = ยังไม่มีเอกสาร ใช้กับ CREATE)
 * @param {string} action ค่าจาก ACTION
 * @return {Object|null} แถวในตาราง หรือ null ถ้าไม่มี
 */
function findTransition(entity, fromStatus, action) {
  var rules = getTransitions();
  var isNew = !fromStatus;
  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];
    if (rule.entity !== entity || rule.action !== action) continue;
    if (rule.from === null) {
      if (isNew) return rule;
    } else if (!isNew && rule.from.indexOf(fromStatus) !== -1) {
      return rule;
    }
  }
  return null;
}

/* ---------------------------------------------------------------------------
 * Guard — เงื่อนไขเพิ่มเติมของแต่ละแถวในตาราง Transition
 *
 * Guard ที่ต้องดูข้อมูลในชีต (Required Fields, ไฟล์แนบ, Step, Report, การชำระเงิน)
 * ให้ชั้น Service ตรวจแล้วส่งผลเข้ามาทาง payload — ถ้าไม่ส่งมา ถือว่า "ยังไม่ผ่าน" เสมอ
 * เพื่อไม่ให้เผลออนุมัติผ่านโดยยังไม่ได้ตรวจ
 * --------------------------------------------------------------------------- */

/**
 * ตารางฟังก์ชัน Guard — คืน null เมื่อผ่าน หรือคืนข้อความภาษาไทยเมื่อไม่ผ่าน
 * @return {Object} แผนที่ชื่อ Guard ไปยังฟังก์ชันตรวจ
 */
function getGuards() {
  return {
    reason: function (ctx) {
      var reason = ctx.payload.reason;
      return (typeof reason === 'string' && reason.trim() !== '')
        ? null : 'ต้องระบุเหตุผล';
    },

    ownerOfWo: function (ctx) {
      return ctx.payload.isOwner === true
        ? null : 'แก้ไขได้เฉพาะเจ้าของใบงานเท่านั้น';
    },

    notCreator: function (ctx) {
      return ctx.payload.isCreator === false
        ? null : 'ผู้อนุมัติต้องไม่ใช่ผู้สร้างใบงานเอง';
    },

    approverOfRoute: function (ctx) {
      var need = approverRoleOfRoute(ctx.payload.route);
      return hasRole_(ctx.user, [need])
        ? null : 'ใบงานสายนี้ต้องให้ ' + need + ' เป็นผู้ดำเนินการ';
    },

    /**
     * เปิดงานที่ปิดไปแล้วขึ้นมาทำต่อ — ผู้อนุมัติของสาย หรือแผนกที่กลับไปทำ (SPEC 5 · 20.6)
     *
     * **คนที่รู้ว่างานยังไม่จบจริงคือแผนก ไม่ใช่ผู้อนุมัติ** ลูกค้าโทรมาหาช่างที่เคยไปทำ
     * ถ้าต้องรอให้ผู้อนุมัติมากดก่อน ช่างจะเลี่ยงไปเปิดใบใหม่แทน แล้วประวัติของงาน
     * ก็ขาดตอน ซึ่งเป็นสิ่งที่ REOPEN มีไว้เพื่อกันตั้งแต่แรก
     *
     * ตรวจสามชั้นสำหรับแผนก — อยู่ในรายชื่อที่เปิดซ้ำได้ · มี Role ของแผนกนั้น ·
     * และสังกัดแผนกนั้นจริง · ขาดชั้นใดชั้นหนึ่งแปลว่าคนที่สวม Role แผนกหนึ่ง
     * เปิดงานของอีกแผนกได้
     */
    reopenAllowed: function (ctx) {
      /* ผู้อนุมัติของสายนั้น ทำได้เหมือนเดิมทุกประการ (SPEC 5) */
      if (hasRole_(ctx.user, [approverRoleOfRoute(ctx.payload.route)])) return null;

      var dept = ctx.payload.department;
      if (!dept) return 'ต้องระบุแผนกที่กลับไปทำก่อนจึงจะเปิดงานใหม่ได้';

      if (REOPEN_DEPARTMENTS.indexOf(dept) === -1) {
        return 'แผนก' + toThai_(ASSIGNMENT_TH, dept) +
          'เปิดงานที่ปิดแล้วเองไม่ได้ ต้องให้ผู้อนุมัติของสายนี้เป็นคนเปิด';
      }

      var sameDept = !ctx.user || !ctx.user.department || ctx.user.department === dept;
      return (hasRole_(ctx.user, [dept]) && sameDept)
        ? null
        : 'เปิดงานใหม่ได้เฉพาะแผนกเจ้าของงาน (' + dept + ') หรือผู้อนุมัติของสายนั้น';
    },

/*
     * ต้องระบุแผนก และแผนกที่ระบุต้องอยู่ในสายเดียวกับใบงาน (SPEC 3)
     * ระบบไม่มีการส่งต่อข้ามสายแล้ว ใบสาย SP จึงส่งให้ Lab ไม่ได้ และใบสาย Lab ก็ส่งให้ Service/Project ไม่ได้
     * ถ้า Admin เลือกสายผิด ให้ผู้อนุมัติตีกลับแล้วแก้สายในใบเดิม (SPEC 3.1)
     */
    assignmentSpecified: function (ctx) {
      var type = ctx.payload.assignmentType;
      if (!type || type === ASSIGNMENT.UNSPECIFIED) return 'ยังไม่ได้เลือกแผนกที่จะส่งงาน';

      var allowed = assignmentTypesOfRoute(ctx.payload.route);
      if (allowed.indexOf(type) === -1) {
        return 'ใบงานนี้อยู่' + routeLabel_(ctx.payload.route) + ' จึงส่งให้' +
          toThai_(ASSIGNMENT_TH, type) + 'ไม่ได้ ถ้าเลือกสายมาผิด ให้ตีกลับแล้วให้ผู้แจ้งแก้สายงานในใบเดิม';
      }
      return null;
    },

    /**
     * ขณะ WO ถูกตีกลับ Task ทุกตัวของใบงานนั้นถูกพักไว้ทั้งหมด (SPEC 8 · กฎข้อ 13)
     * ในงานร่วม ถ้า Service ตีกลับ ฝั่ง Project ต้องทำงานต่อไม่ได้จนกว่าจะอนุมัติผ่านอีกครั้ง
     * มิฉะนั้นแผนกหนึ่งจะปิดงานไปเรื่อย ๆ ทั้งที่ข้อมูลใบงานกำลังถูกแก้อยู่
     *
     * ค่า woStatus มาจาก loadStatusContext_() ที่อ่านจากชีตเท่านั้น ผู้เรียกส่งเข้ามาเองไม่ได้
     * เมื่อเรียก planStatusChange_() ตรง ๆ ในชุดทดสอบตรรกะจะไม่มีค่านี้ Guard จึงไม่มีอะไรให้ปฏิเสธ
     */
    woNotReturned: function (ctx) {
      return ctx.payload.woStatus === WO_STATUS.RETURNED
        ? 'ใบงานถูกตีกลับอยู่ ต้องรอให้แก้ไขและอนุมัติใหม่ก่อนจึงจะทำรายการนี้ได้' : null;
    },

    taskOwner: function (ctx) {
      var dept = ctx.payload.department;
      if (!dept) return 'ไม่ทราบแผนกเจ้าของงาน';
      var sameDept = !ctx.user || !ctx.user.department || ctx.user.department === dept;
      return (hasRole_(ctx.user, [dept]) && sameDept)
        ? null : 'ทำได้เฉพาะแผนกเจ้าของงาน (' + dept + ') เท่านั้น';
    },

    taskOwnerOrManager: function (ctx) {
      if (hasRole_(ctx.user, ROLE_GROUP.ADMIN)) return null;
      if (hasRole_(ctx.user, [approverRoleOfRoute(ctx.payload.route)])) return null;
      return getGuards().taskOwner(ctx);
    },

    requiredFields: function (ctx) {
      return ctx.payload.requiredFieldsOk === true
        ? null : 'กรอกข้อมูลที่บังคับไม่ครบ';
    },

    requiredFiles: function (ctx) {
      return ctx.payload.requiredFilesOk === true
        ? null : 'แนบไฟล์ที่บังคับไม่ครบ';
    },

    requiredReports: function (ctx) {
      if (ctx.payload.requiredReportsOk === true) return null;
      /*
       * ข้อความต้องบอกชื่อเอกสารและเลขฟอร์มที่ขาด ไม่ใช่บอกแค่ว่าไม่ครบ (SPEC 17.3)
       * ผู้เรียกเป็นคนประกอบข้อความ เพราะที่นี่ไม่รู้จักตาราง Report_Master
       * และไม่ควรรู้ — ด่านมีหน้าที่ตัดสินอย่างเดียว
       */
      return ctx.payload.missingReportsMessage || 'อัปโหลด Report ที่บังคับไม่ครบ';
    },

    allStepsDone: function (ctx) {
      return ctx.payload.allStepsDone === true
        ? null : 'ยังทำ Step / งวดงาน ไม่ครบ';
    },

    paymentCleared: function (ctx) {
      if (ctx.payload.paymentRequired !== true) return null;
      return ctx.payload.paymentStatus === PAYMENT.PAID
        ? null : 'รอการชำระเงินก่อนจึงจะรับงานได้';
    }
  };
}

/**
 * รวม Role ของผู้ใช้เป็น array เสมอ (ผู้ใช้ 1 คนมีได้หลาย Role — SPEC 2)
 * @param {Object} user {email, role|roles, department}
 * @return {string[]}
 */
function userRoles_(user) {
  if (!user) return [];
  if (Object.prototype.toString.call(user.roles) === '[object Array]') return user.roles;
  return user.role ? [user.role] : [];
}

/**
 * ผู้ใช้มี Role อยู่ในรายการที่กำหนดหรือไม่
 * @param {Object} user
 * @param {string[]} allowed
 * @return {boolean}
 */
function hasRole_(user, allowed) {
  var roles = userRoles_(user);
  for (var i = 0; i < roles.length; i++) {
    if (allowed.indexOf(roles[i]) !== -1) return true;
  }
  return false;
}

/**
 * ตรวจว่า Action นี้ทำได้หรือไม่ โดยไม่โยน error (ใช้ตัดสินว่าจะแสดงปุ่มหรือไม่ก็ได้
 * แต่การซ่อนปุ่มไม่ใช่การป้องกัน — ชั้น API ต้องเรียก changeStatus() ตรวจซ้ำเสมอ)
 * @param {string} entity ค่าจาก ENTITY
 * @param {string|null} fromStatus สถานะปัจจุบัน
 * @param {string} action ค่าจาก ACTION
 * @param {Object} user {email, role|roles, department}
 * @param {Object} [payload] ข้อมูลประกอบและผลการตรวจ Guard
 * @return {Object} {allowed, message, to, changed, woEffect, rule}
 */
function checkTransition(entity, fromStatus, action, user, payload) {
  payload = payload || {};

  // ข้อความทุกบรรทัดในนี้ไปโผล่บนหน้าจอผู้ใช้ จึงต้องเป็นภาษาไทยที่อ่านแล้วรู้เรื่องทันที
  // ห้ามมีชื่อ Action ชื่อสถานะ หรือชื่อ Role ดิบ ๆ หลุดออกไป (SPEC 17.3)
  var rule = findTransition(entity, fromStatus, action);
  if (!rule) {
    var statusText = fromStatus
      ? 'ตอนนี้อยู่ในสถานะ "' + statusLabel_(entity, fromStatus) + '"'
      : 'ยังไม่มีข้อมูลนี้ในระบบ';
    return deny_(statusText + ' จึง' + toThai_(ACTION_TH, action) + 'ไม่ได้', null);
  }
  if (!hasRole_(user, rule.roles)) {
    return deny_('บัญชีของคุณไม่มีสิทธิ์' + toThai_(ACTION_TH, action) +
      ' ผู้ที่ทำได้คือ ' + rolesLabel_(rule.roles), rule);
  }

  var guards = getGuards();
  var names = rule.guards || [];
  for (var i = 0; i < names.length; i++) {
    var guard = guards[names[i]];
    if (!guard) return deny_('ไม่รู้จัก Guard ชื่อ ' + names[i], rule);
    var problem = guard({
      entity: entity, fromStatus: fromStatus, action: action,
      user: user, payload: payload, rule: rule
    });
    if (problem) return deny_(problem, rule);
  }

  var to = (rule.to === KEEP_STATUS) ? fromStatus : rule.to;
  return {
    allowed: true,
    message: null,
    to: to || null,
    changed: to !== fromStatus,
    woEffect: rule.woEffect || null,
    rule: rule
  };
}

/**
 * สร้างผลลัพธ์ "ไม่อนุญาต"
 * @param {string} message ข้อความภาษาไทยที่แสดงให้ผู้ใช้เห็นได้
 * @param {Object} rule แถวในตาราง Transition ที่เกี่ยวข้อง (null ถ้าไม่มีแถวตรงเลย)
 * @return {Object}
 */
function deny_(message, rule) {
  return { allowed: false, message: message, to: null, changed: false, woEffect: null, rule: rule || null };
}

/**
 * ชื่อภาษาไทยของสถานะ โดยเลือกตารางแปลตามชนิดของสิ่งที่กำลังเปลี่ยน
 * @param {string} entity ค่าจาก ENTITY
 * @param {string} status ค่าสถานะ
 * @return {string}
 */
function statusLabel_(entity, status) {
  return toThai_(entity === ENTITY.TASK ? TASK_STATUS_TH : WO_STATUS_TH, status);
}

/**
 * ชื่อภาษาไทยของกลุ่มผู้มีสิทธิ์ ใช้บอกผู้ใช้ว่าใครทำรายการนี้ได้
 * @param {string[]} roles รายชื่อ Role
 * @return {string}
 */
function rolesLabel_(roles) {
  var names = [];
  for (var i = 0; i < roles.length; i++) {
    var name = toThai_(ROLE_TH, roles[i]);
    if (names.indexOf(name) === -1) names.push(name);
  }
  return names.join(' หรือ ');
}

/**
 * ตรรกะการเปลี่ยนสถานะล้วน ๆ — ไม่แตะ Sheet เลย
 *
 * รับสถานะปัจจุบันทาง payload.fromStatus แล้วคืน "แผนการเปลี่ยนสถานะ" พร้อมแถว Audit ที่ต้องเขียน
 * เป็นหัวใจที่ชุดทดสอบตรรกะทั้งหมดยิงตรงเข้ามา ส่วน changeStatus() ที่ต่อกับ Repo เรียกฟังก์ชันนี้อีกที
 *
 * @param {string} entity ค่าจาก ENTITY
 * @param {string} id WO_ID หรือ Task_ID (ว่างได้เมื่อเป็น CREATE)
 * @param {string} action ค่าจาก ACTION
 * @param {Object} user {email, role|roles, department}
 * @param {Object} payload สถานะปัจจุบัน (fromStatus) + ข้อมูลประกอบ + ผลการตรวจ Guard
 * @return {Object} {entity, id, action, from, to, changed, woEffect, audit}
 * @throws {Error} เมื่อ Transition ไม่ถูกต้อง สิทธิ์ไม่พอ หรือ Guard ไม่ผ่าน
 */
function planStatusChange_(entity, id, action, user, payload) {
  payload = payload || {};
  var from = payload.fromStatus || null;

  var result = checkTransition(entity, from, action, user, payload);
  if (!result.allowed) {
    throw new Error(result.message);
  }

  return {
    entity: entity,
    id: id || null,
    action: action,
    from: from,
    to: result.to,
    changed: result.changed,
    woEffect: result.woEffect,
    audit: buildAuditRecord_(entity, id, action, user, from, result.to, payload)
  };
}

/**
 * ประกอบแถว Audit_Log (SPEC 13) — ขั้นที่ 2 จะส่งต่อให้ writeAudit() เขียนลงชีต
 * @return {Object} แถว Audit_Log ที่ยังไม่ได้เขียนลงชีต
 */
function buildAuditRecord_(entity, id, action, user, from, to, payload) {
  return {
    WO_ID:      payload.woId || (entity === ENTITY.WO ? (id || null) : null),
    Task_ID:    payload.taskId || (entity === ENTITY.TASK ? (id || null) : null),
    User:       (user && user.email) ? user.email : null,
    Role:       userRoles_(user).join(','),
    Action:     action,
    Entity:     entity,
    Field:      'Status',
    From_Value: from,
    To_Value:   to,
    Remark:     payload.reason || payload.remark || '',
    Timestamp:  new Date()
  };
}

/**
 * คำนวณสถานะรวมของ WO จากสถานะของ Task ทุกตัว (SPEC 8, 20.4)
 * ห้ามคำนวณสถานะ WO ที่อื่นนอกจากฟังก์ชันนี้ และต้องเรียกทุกครั้งที่ Task เปลี่ยน
 * ในรายการเดียวกัน ไม่ใช่แยกไปทำทีหลังหรือให้ Trigger มาไล่เก็บ (SPEC 20.3, 21)
 *
 * เป็นตรรกะล้วน รับ array ของสถานะ Task มาตรง ๆ ไม่แตะ Sheet —
 * ตัวที่อ่านจากตาราง Department_Task จริงคือ recalcWoStatus(woId) ซึ่งเรียกฟังก์ชันนี้อีกที
 *
 * ลำดับการตัดสิน (ห้ามสลับ):
 *   1. ไม่มี Task เลย                                -> คงสถานะเดิม
 *   2. ทุกตัว CANCELLED                              -> CANCELLED
 *   3. ตัวที่ไม่ใช่ CANCELLED เป็น COMPLETED ทั้งหมด
 *      และมีอย่างน้อย 1 ตัว                          -> COMPLETED
 *   4. มีตัวใดตัวหนึ่ง IN_PROGRESS                    -> IN_PROGRESS
 *   5. นอกนั้น                                       -> คงสถานะเดิม
 *
 * @param {string[]} taskStatuses สถานะของ Task ทุกตัวของ WO ใบนั้น (ค่าจาก TASK_STATUS)
 * @param {string} currentWoStatus สถานะ WO ปัจจุบัน (ค่าจาก WO_STATUS)
 * @return {Object} {status, changed, rule}
 * @throws {Error} เมื่อพบสถานะ Task ที่ไม่รู้จัก
 */
function recalcFromStatuses_(taskStatuses, currentWoStatus) {
  var statuses = taskStatuses || [];
  var keep = { status: currentWoStatus, changed: false, rule: 'KEEP' };

  // กฎ 1 — ยังไม่มี Task (เช่น WO ที่ยังไม่ผ่านการอนุมัติ) ไม่เปลี่ยนสถานะ
  if (statuses.length === 0) return keep;

  var cancelled = 0;
  var completed = 0;
  var inProgress = 0;

  for (var i = 0; i < statuses.length; i++) {
    var status = statuses[i];
    switch (status) {
      case TASK_STATUS.CANCELLED:      cancelled++;  break;
      case TASK_STATUS.COMPLETED:      completed++;  break;
      case TASK_STATUS.IN_PROGRESS:    inProgress++; break;
      case TASK_STATUS.PENDING_ACCEPT: break;
      case TASK_STATUS.RETURNED:       break;
      default:
        throw new Error('พบสถานะของงานแผนกที่ระบบไม่รู้จักในใบงานนี้ กรุณาติดต่อผู้ดูแลระบบให้ตรวจข้อมูลในฐานข้อมูล');
    }
  }

  var active = statuses.length - cancelled;  // จำนวน Task ที่ไม่ถูกยกเลิก

  // กฎ 2 — ยกเลิกครบทุกตัว (งานแผนกเดียวจบทันที · งานร่วมต้องยกเลิกครบทั้ง Service และ Project)
  if (cancelled === statuses.length) {
    return decide_(WO_STATUS.CANCELLED, currentWoStatus, 'ALL_CANCELLED');
  }

  // กฎ 3 — Task ที่ไม่ถูกยกเลิกเสร็จครบและมีอย่างน้อย 1 ตัว
  //         (ถ้ามี Task ที่ยกเลิกปนอยู่ ปิดงานได้ แต่ต้องแสดงหมายเหตุแผนกที่ยกเลิก — SPEC 8)
  if (active > 0 && completed === active) {
    return decide_(WO_STATUS.COMPLETED, currentWoStatus, 'ALL_ACTIVE_COMPLETED');
  }

  // กฎ 4 — มีแผนกใดกำลังทำงานอยู่
  if (inProgress > 0) {
    return decide_(WO_STATUS.IN_PROGRESS, currentWoStatus, 'ANY_IN_PROGRESS');
  }

  // กฎ 5 — นอกนั้นคงสถานะเดิม (เช่นยังรอแผนกกดรับงาน หรือถูกตีกลับอยู่)
  return keep;
}

/**
 * ประกอบผลลัพธ์ของ recalcWoStatus พร้อมบอกว่าสถานะเปลี่ยนจริงหรือไม่
 * @param {string} nextStatus สถานะที่คำนวณได้
 * @param {string} currentWoStatus สถานะ WO ปัจจุบัน
 * @param {string} rule ชื่อกฎที่ทำให้ได้ผลนี้ (ใช้ลง Audit / Log)
 * @return {Object} {status, changed, rule}
 */
function decide_(nextStatus, currentWoStatus, rule) {
  return {
    status: nextStatus,
    changed: nextStatus !== currentWoStatus,
    rule: rule
  };
}

/* ===========================================================================
 * ชั้นเชื่อมกับ Repo — ขั้นที่ 2
 *
 * ตรรกะทั้งหมดข้างบนยังเหมือนเดิมทุกบรรทัด (planStatusChange_ และ recalcFromStatuses_)
 * ส่วนข้างล่างนี้ทำหน้าที่แค่ 3 อย่าง
 *   1. อ่านสถานะปัจจุบันและข้อมูลประกอบจาก Repo แทนการให้ผู้เรียกส่งมาเอง
 *   2. เขียนสถานะใหม่ลงชีตผ่าน Repo
 *   3. เขียน Audit_Log ให้อัตโนมัติทุกครั้งที่ทำรายการสำเร็จ
 * =========================================================================== */

/**
 * เปลี่ยนสถานะ — ทางเดียวที่ระบบยอมให้เปลี่ยนสถานะได้ (SPEC 5, C-1, 21)
 *
 * อ่านสถานะปัจจุบันจากชีตเอง ผู้เรียกไม่ต้องส่ง fromStatus มา
 * ข้อมูลที่ชีตรู้อยู่แล้ว (สายอนุมัติ แผนกเจ้าของงาน ผู้สร้างใบงาน สถานะการชำระเงิน)
 * จะถูกเติมให้เองก่อนตรวจ Guard — ผู้เรียกส่งมาเฉพาะสิ่งที่ชีตไม่รู้ เช่น
 * ผลการตรวจ Required Fields ไฟล์แนบ Step Report และเหตุผล
 *
 * เมื่อทำรายการสำเร็จจะเขียน Audit_Log ให้เสมอ และถ้าเป็นการเปลี่ยนสถานะระดับ Task
 * จะเรียก recalcWoStatus() ต่อทันทีในรายการเดียวกันตาม SPEC 20.3
 *
 * @param {string} entity ค่าจาก ENTITY
 * @param {string} id WO_ID หรือ Task_ID
 * @param {string} action ค่าจาก ACTION
 * @param {Object} user {email, role|roles, department}
 * @param {Object} [payload] ผลการตรวจ Guard ที่ชีตไม่รู้ และตัวเลือกเพิ่มเติม
 *        payload.fields ข้อมูลคอลัมน์อื่นที่ต้องการเขียนไปพร้อมกัน
 *                       (ตอน CREATE คือข้อมูลทั้งแถวที่จะสร้าง)
 *        payload.expectedUpdatedDate ค่า Updated_Date ที่หน้าจอถืออยู่ ใช้ทำ Optimistic Lock
 * @return {Object} แผนที่ทำไปจริง {entity, id, action, from, to, changed, woEffect, audit, recalc}
 * @throws {Error} เมื่อไม่พบข้อมูล Transition ไม่ถูกต้อง สิทธิ์ไม่พอ หรือ Guard ไม่ผ่าน
 */
function changeStatus(entity, id, action, user, payload) {
  payload = payload || {};

  var context = loadStatusContext_(entity, id, action, user, payload);
  var plan = planStatusChange_(entity, id, action, user, context.payload);

  if (action === ACTION.CREATE) {
    if (payload.fields) insertEntityRow_(entity, plan, payload.fields);
  } else if (plan.changed || payload.fields) {
    writeEntityRow_(entity, id, plan, payload);
  }

  writeAuditRecord(plan.audit);

  if (plan.woEffect && context.payload.woId) {
    // Action ที่ตารางระบุสถานะ WO ไว้ตรง ๆ (TASK_RETURN -> RETURNED ตาม SPEC 5) ถือว่าชี้ขาด
    // และต้องไม่ให้ recalcWoStatus มาทับ เพราะในงานร่วม Task ของอีกแผนกยังเป็น IN_PROGRESS อยู่
    // ถ้าปล่อยให้ recalc ทำงานต่อ มันจะดึง WO กลับไป IN_PROGRESS แล้วการตีกลับก็หายไปเฉย ๆ
    applyWoStatus_(context.payload.woId, plan.woEffect, action, context.payload.reason);
  } else if (entity === ENTITY.TASK && context.payload.woId) {
    // ทุกครั้งที่ Task เปลี่ยน ต้องคำนวณสถานะ WO ใหม่ในรายการเดียวกัน (SPEC 20.3 · กฎข้อ 2)
    plan.recalc = recalcWoStatus(context.payload.woId);
  }

  return plan;
}

/**
 * คำนวณสถานะรวมของ WO ใหม่จาก Task ทุกตัวของใบงานนั้น แล้วบันทึกเมื่อสถานะเปลี่ยน (SPEC 8, 20.4)
 * ตรรกะการตัดสินอยู่ใน recalcFromStatuses_ ที่เดียว ฟังก์ชันนี้แค่โหลดข้อมูลกับบันทึกผล
 *
 * @param {string} woId เลขที่ใบงาน
 * @return {Object} {status, changed, rule}
 * @throws {Error} เมื่อไม่พบใบงาน
 */
function recalcWoStatus(woId) {
  var wo = getWorkOrder(woId);
  if (!wo) throw new Error('ไม่พบใบงาน ' + woId + ' จึงคำนวณสถานะรวมไม่ได้');

  var tasks = listTasksByWo(woId);
  var statuses = [];
  for (var i = 0; i < tasks.length; i++) {
    statuses.push(tasks[i][STATUS_FIELD[ENTITY.TASK]]);
  }

  var result = recalcFromStatuses_(statuses, wo[STATUS_FIELD[ENTITY.WO]]);
  if (result.changed) {
    applyWoStatus_(woId, result.status, ACTION.RECALC, 'คำนวณจากสถานะ Task ตามกฎ ' + result.rule);
  }
  return result;
}

/**
 * อ่านสถานะปัจจุบันและข้อมูลประกอบจากชีต แล้วประกอบเป็น payload ให้ตรรกะใช้ตรวจ Guard
 *
 * ค่าที่ชีตรู้ดีกว่าผู้เรียกจะถูกเติมทับเสมอ (สถานะปัจจุบัน สายอนุมัติ แผนกเจ้าของงาน
 * ผู้สร้างใบงาน สถานะการชำระเงิน) ส่วนค่าที่ชีตไม่รู้จะคงตามที่ผู้เรียกส่งมา
 *
 * @param {string} entity ค่าจาก ENTITY
 * @param {string} id WO_ID หรือ Task_ID
 * @param {string} action ค่าจาก ACTION
 * @param {Object} user ผู้ทำรายการ {email, role|roles, department}
 * @param {Object} payload payload ที่ผู้เรียกส่งมา
 * @return {Object} {payload, row, wo}
 * @throws {Error} เมื่อไม่พบแถวที่จะเปลี่ยนสถานะ
 */
function loadStatusContext_(entity, id, action, user, payload) {
  var enriched = copyPayload_(payload);
  var isCreate = (action === ACTION.CREATE);
  var fields = payload.fields || {};

  // สถานะของทั้งสองระดับต้องมาจากชีตเท่านั้น ถ้าผู้เรียกแนบมาด้วยให้ทิ้งทันที
  // ไม่งั้นหน้าเว็บที่ถูกดัดแปลงจะข้าม Guard ที่อิงสถานะได้ทั้งชุด
  delete enriched.fromStatus;
  delete enriched.woStatus;

  if (entity === ENTITY.WO) {
    if (isCreate) {
      enriched.fromStatus = null;
      enriched.woId = id;
      return { payload: enriched, row: null, wo: null };
    }
    var wo = getWorkOrder(id);
    if (!wo) throw new Error('ไม่พบใบงาน ' + id);

    enriched.fromStatus = wo[STATUS_FIELD[ENTITY.WO]] || null;
    enriched.woId = id;
    enriched.route = wo['Route'] || enriched.route || null;
    enriched.isCreator = sameUserEmail_(wo['Created_By'], actingEmail_(user));
    enriched.isOwner = enriched.isCreator;
    if (enriched.assignmentType === undefined) enriched.assignmentType = wo['Assignment_Type'];
    return { payload: enriched, row: wo, wo: wo };
  }

  if (entity !== ENTITY.TASK) throw new Error('ไม่รู้จัก Entity: ' + entity);

  var task = isCreate ? null : getTask(id);
  if (!isCreate && !task) throw new Error('ไม่พบงานของแผนก ' + id);

  var woId = (task ? task['WO_ID'] : (fields['WO_ID'] || payload.woId)) || null;
  var parent = woId ? getWorkOrder(woId) : null;
  if (!parent) throw new Error('ไม่พบใบงานต้นทางของงานแผนก ' + (id || '(ใหม่)'));

  enriched.fromStatus = task ? (task[STATUS_FIELD[ENTITY.TASK]] || null) : null;
  enriched.woId = woId;
  enriched.taskId = id;
  enriched.department = task ? task['Department'] : (fields['Department'] || enriched.department);
  enriched.route = parent['Route'] || enriched.route || null;
  enriched.woStatus = parent[STATUS_FIELD[ENTITY.WO]] || null;
  enriched.paymentRequired = cellToBoolean_(parent['Payment_Required']);
  enriched.paymentStatus = parent['Payment_Status'] || PAYMENT.UNPAID;
  return { payload: enriched, row: task, wo: parent };
}

/**
 * สร้างแถวใหม่พร้อมสถานะตั้งต้นที่ตรรกะตัดสินให้ (ใช้กับ Action CREATE)
 * @param {string} entity ค่าจาก ENTITY
 * @param {Object} plan แผนที่ได้จาก planStatusChange_
 * @param {Object} fields ข้อมูลทั้งแถวที่จะสร้าง
 * @return {Object} แถวที่เขียนจริง
 */
function insertEntityRow_(entity, plan, fields) {
  var row = copyPayload_(fields);
  row[STATUS_FIELD[entity]] = plan.to;
  return (entity === ENTITY.WO) ? insertWorkOrder(row) : insertTask(row);
}

/**
 * เขียนสถานะใหม่ และคอลัมน์อื่นที่ส่งมาพร้อมกัน ลงแถวเดิม
 * @param {string} entity ค่าจาก ENTITY
 * @param {string} id WO_ID หรือ Task_ID
 * @param {Object} plan แผนที่ได้จาก planStatusChange_
 * @param {Object} payload payload ที่ผู้เรียกส่งมา
 * @return {Object} แถวหลังแก้ไข
 */
function writeEntityRow_(entity, id, plan, payload) {
  var patch = copyPayload_(payload.fields || {});
  if (plan.changed) patch[STATUS_FIELD[entity]] = plan.to;
  if (entity === ENTITY.WO) {
    applyClosedDate_(patch, plan.changed ? plan.from : null, plan.changed ? plan.to : null);
    return updateWorkOrder(id, patch, payload.expectedUpdatedDate);
  }
  return updateTask(id, patch, payload.expectedUpdatedDate);
}

/**
 * วันที่ปิดงาน — ตั้งเมื่อใบงานเข้าสู่สถานะปิด และล้างเมื่อออกจากสถานะปิด
 *
 * **มีขึ้นเพราะยอด "เสร็จสิ้นเดือนนี้" นับผิดมาตลอด**
 *
 * เดิมนับจาก `Updated_Date` ซึ่งขยับทุกครั้งที่มีการแก้อะไรก็ได้ ไม่ใช่เฉพาะตอนปิดงาน ·
 * ใบที่ปิดเดือนสิงหาคมแล้วมีคนมาบันทึกการชำระเงินเดือนกันยายน จะถูกนับเป็นงาน
 * ที่เสร็จเดือนกันยายน · การจ่ายเงินหลังงานเสร็จคือเรื่องปกติที่สุด ยอดนี้จึงผิด
 * ทุกเดือน ไม่ใช่ผิดในกรณีหายาก
 *
 * **ต้องเรียกจากทั้งสองทางที่สถานะ WO เปลี่ยนได้** คือ `writeEntityRow_` เมื่อผู้ใช้
 * สั่งตรง ๆ และ `applyWoStatus_` เมื่อระบบคำนวณใหม่จาก Task · ทางที่สองคือทางที่
 * ใบงานเข้าสู่ COMPLETED จริง ๆ เกือบทุกครั้ง ถ้าลืมทางนั้นคอลัมน์นี้จะว่างตลอดกาล
 *
 * **แตะเฉพาะตอนสถานะเปลี่ยนจริง** · การบันทึกการชำระเงินไม่เปลี่ยนสถานะ จึงต้อง
 * ไม่ขยับวันที่ปิดงาน ซึ่งเป็นทั้งหมดของเหตุผลที่คอลัมน์นี้มีอยู่
 *
 * @param {Object} patch ชุดค่าที่กำลังจะเขียน — ถูกแก้ในที่
 * @param {string|null} fromStatus สถานะเดิม · null = ไม่ได้เปลี่ยนสถานะ
 * @param {string|null} toStatus สถานะใหม่ · null = ไม่ได้เปลี่ยนสถานะ
 * @return {Object} patch ตัวเดิม เพื่อให้ต่อคำสั่งได้
 */
function applyClosedDate_(patch, fromStatus, toStatus) {
  if (!toStatus) return patch;

  var closed = [WO_STATUS.COMPLETED, WO_STATUS.CANCELLED];
  var wasClosed = closed.indexOf(fromStatus) !== -1;
  var isClosed  = closed.indexOf(toStatus) !== -1;

  if (isClosed) {
    patch['Closed_Date'] = new Date();
  } else if (wasClosed) {
    /*
     * ออกจากสถานะปิดแล้ว ต้องล้างให้ว่าง ไม่งั้นใบที่เปิดซ้ำจะยังถูกนับเป็นงานที่ปิดแล้ว
     * ค่าว่างที่ถูกต้องคือ null ไม่ใช่ข้อความว่าง เพราะคอลัมน์เป็น timestamptz
     */
    patch['Closed_Date'] = null;
  }
  return patch;
}

/**
 * เขียนสถานะ WO พร้อม Audit — ใช้กับผลจาก recalcWoStatus และ woEffect ของ Action ระดับ Task
 * เป็นทางเดียวที่สถานะ WO เปลี่ยนโดยไม่ได้มาจาก Action ของผู้ใช้โดยตรง
 * @param {string} woId เลขที่ใบงาน
 * @param {string} nextStatus สถานะใหม่จาก WO_STATUS
 * @param {string} action Action ที่ทำให้เกิดการเปลี่ยน (ใช้ลง Audit)
 * @param {string} [remark] หมายเหตุที่จะบันทึกลง Audit
 * @return {string|null} สถานะใหม่ หรือ null เมื่อสถานะเดิมตรงอยู่แล้ว
 */
function applyWoStatus_(woId, nextStatus, action, remark) {
  var wo = getWorkOrder(woId);
  if (!wo) throw new Error('ไม่พบใบงาน ' + woId);

  var from = wo[STATUS_FIELD[ENTITY.WO]] || null;
  if (from === nextStatus) return null;

  var patch = {};
  patch[STATUS_FIELD[ENTITY.WO]] = nextStatus;
  /*
   * ทางนี้คือทางที่ใบงานเข้าสู่ COMPLETED จริง ๆ เกือบทุกครั้ง เพราะสถานะรวม
   * ถูกคำนวณจาก Task ไม่ได้มาจากการกดของผู้ใช้โดยตรง (กฎข้อ 2)
   */
  applyClosedDate_(patch, from, nextStatus);
  updateWorkOrder(woId, patch);

  writeAuditRecord({
    WO_ID: woId,
    Action: action,
    Entity: ENTITY.WO,
    Field: STATUS_FIELD[ENTITY.WO],
    From_Value: from,
    To_Value: nextStatus,
    Remark: remark || ''
  });
  return nextStatus;
}

/**
 * คัดลอก object ชั้นเดียว เพื่อไม่ให้เผลอไปแก้ payload ของผู้เรียก
 * @param {Object} source object ต้นทาง
 * @return {Object}
 */
function copyPayload_(source) {
  var copy = {};
  for (var key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) copy[key] = source[key];
  }
  return copy;
}

/**
 * อีเมลของผู้ทำรายการ — ใช้ค่าที่ชั้น API ระบุตัวตนมาแล้วก่อน
 * ถ้าไม่ได้ส่งมาจึงถอยไปใช้ผู้ใช้ที่กำลังเรียกสคริปต์อยู่ (SPEC E)
 * @param {Object} user {email, role|roles, department}
 * @return {string}
 */
function actingEmail_(user) {
  return (user && user.email) ? String(user.email) : currentUserEmail_();
}

/**
 * เทียบอีเมลสองค่าโดยไม่สนตัวพิมพ์ใหญ่เล็กและช่องว่างหัวท้าย
 * @param {*} a อีเมลจากชีต
 * @param {*} b อีเมลผู้ใช้ปัจจุบัน
 * @return {boolean}
 */
function sameUserEmail_(a, b) {
  if (!a || !b) return false;
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}
