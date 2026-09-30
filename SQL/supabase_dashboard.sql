-- =====================================================================
--  dashboard_summary() — ยอดทั้งหน้าแรกในคำขอเดียว (SPEC 17.3 · 23)
--
--  แทนที่วิธีเดิมที่หน้าแรกอ่านใบงานทั้งหมดมาสร้างดัชนีแล้วแคชไว้สิบนาที
--  ดัชนีนั้นโตตามจำนวนใบงานและชนเพดานแคชที่ราว 2,293 ใบ คือราวสี่เดือนครึ่ง
--  ที่ 500 ใบต่อเดือน · วันที่ชน แคชจะเก็บไม่ได้แบบเงียบ ๆ แล้วหน้าแรกจะกลับไป
--  อ่านทั้งตารางทุกครั้งที่มีคนเปิด ช้าลงเรื่อย ๆ โดยไม่มีอะไรบอกว่าทำไม
--
--  ฟังก์ชันนี้ไม่ได้เลื่อนเส้นตายนั้นออกไป แต่ทำให้ดัชนีไม่จำเป็นอีกเลย
--  เวลาที่ใช้เท่าเดิมไม่ว่าจะมีใบงานร้อยใบหรือแสนใบ เพราะทุกยอดมาจาก count()
--  บน index ที่มีอยู่แล้ว ไม่มีการดึงแถวขึ้นมาสักแถว
--
--  ** ฟังก์ชันนี้ไม่รับ role และไม่รับแผนกเป็นอาร์กิวเมนต์โดยตั้งใจ **
--
--  มันคืนยอดแยกตามแผนกและตามสายมาให้ครบทุกช่อง แล้วฝั่ง Apps Script เป็นคน
--  ตัดสินว่าผู้ใช้คนนั้นเห็นช่องไหนได้บ้าง จาก getCurrentUser_() เท่านั้น
--  เหตุผล: ถ้า role เดินทางมาเป็นอาร์กิวเมนต์ ก็แปลว่ามีเส้นทางที่ค่าจากหน้าเว็บ
--  อาจไปถึง SQL ได้ · การไม่รับเลยทำให้ช่องโหว่นั้นไม่มีทางเกิดขึ้น ไม่ใช่แค่
--  ถูกป้องกันไว้ · และยอดชุดเดียวใช้ได้กับทุกคน จึงแคชร่วมกันได้ทั้งระบบ
--
--  ** ต้องรัน supabase_batch1.sql ก่อนไฟล์นี้ ** เพราะยอด "เลยกำหนด" เรียกใช้
--  ฟังก์ชัน due_date() และคอลัมน์ duration_days ที่ประกาศไว้ในไฟล์นั้น
--
--  วางทั้งไฟล์ใน SQL Editor แล้ว Run · รันซ้ำได้ไม่มีผลข้างเคียง
-- =====================================================================

create or replace function dashboard_summary()
returns json
language sql
stable
as $$
  with
  -- เดือนนี้ตามเวลาไทย ไม่ใช่ตามเวลา UTC
  -- ใบที่ปิดตอนตีหนึ่งของวันที่ 1 ตามเวลาไทย ยังเป็นเวลา 18:00 ของเดือนก่อนตาม UTC
  -- ถ้านับด้วยเวลา UTC ยอด "เสร็จสิ้นเดือนนี้" จะผิดทุกต้นเดือนและปลายเดือน
  month_start as (
    select date_trunc('month', (now() at time zone 'Asia/Bangkok'))
             at time zone 'Asia/Bangkok' as at
  ),

  -- วันนี้ตามเวลาไทย ใช้ตัดสินว่าใบไหนเลยกำหนดแล้ว
  -- ต้องเป็นวันไทย ไม่ใช่วัน UTC — ระหว่างเที่ยงคืนถึงเจ็ดโมงเช้าตามเวลาไทย
  -- วัน UTC ยังเป็นเมื่อวาน ยอด "เลยกำหนด" จะน้อยไปหนึ่งวันทุกเช้า
  today_th as (
    select (now() at time zone 'Asia/Bangkok')::date as at
  ),

  wo as (
    select
      count(*)                                                        as total,
      count(*) filter (where overall_status = 'PENDING_APPROVE'
                         and route = 'SP')                            as pending_approve_sp,
      count(*) filter (where overall_status = 'PENDING_APPROVE'
                         and route = 'LAB')                           as pending_approve_lab,
      count(*) filter (where overall_status = 'RETURNED')             as returned,
      /*
       * นับจาก closed_date ไม่ใช่ updated_date
       *
       * updated_date ขยับทุกครั้งที่มีการแก้อะไรก็ได้ ไม่ใช่เฉพาะตอนปิดงาน ·
       * ใบที่ปิดเดือนสิงหาคม แล้วมีคนมาบันทึกการชำระเงินเดือนกันยายน จะถูกนับเป็น
       * งานที่เสร็จเดือนกันยายน · การจ่ายเงินหลังงานเสร็จคือเรื่องปกติที่สุด
       * ยอดนี้จึงผิดทุกเดือน ไม่ใช่ผิดในกรณีหายาก
       *
       * ใบที่ปิดก่อนมีคอลัมน์นี้ closed_date เป็น NULL จึงไม่ถูกนับ — ตั้งใจ
       * ยอมรับว่าประวัติก่อนวันนี้นับไม่ได้ ดีกว่าเดาย้อนหลังแล้วได้ตัวเลขที่เชื่อไม่ได้
       */
      count(*) filter (where overall_status = 'COMPLETED'
                         and closed_date >= (select at from month_start)) as completed_month,
      count(*) filter (where overall_status = 'CANCELLED'
                         and closed_date >= (select at from month_start)) as cancelled_month,
      count(*) filter (where payment_required
                         and coalesce(payment_status, '') <> 'PAID')  as unpaid,
      /*
       * เลยกำหนด — ใช้ฟังก์ชัน due_date() ตัวเดียวกับที่หน้ารายการใช้กรอง
       * ยอดบนการ์ดกับจำนวนที่เห็นตอนกดเข้าไปจึงมาจากสูตรเดียวกันเสมอ ไม่ใช่สองสูตรที่ต้องคอยดูให้ตรงกัน
       *
       * ใบที่ปิดหรือยกเลิกแล้วต้องหยุดนับ — งานจบไปแล้ว การนับต่อไม่มีความหมาย
       * และถ้านับต่อ รายการงานที่เสร็จหมดแล้วจะเต็มไปด้วยป้ายแดงที่ไม่มีความหมาย
       * แล้วคนจะเลิกมองป้ายทั้งหมด รวมทั้งใบที่เตือนถูก
       */
      count(*) filter (where duration_days is not null
                         and overall_status not in ('COMPLETED', 'CANCELLED')
                         and due_date(work_order) < (select at from today_th)) as overdue
    from work_order
  ),

  -- ยอดของแผนกมาจากสถานะของ department_task ไม่ใช่สถานะของใบงาน (SPEC 17.3)
  -- ใบงานหนึ่งใบมีได้สองแผนกพร้อมกัน การนับจากใบงานจะนับงานร่วมหายไปหนึ่งแผนกเสมอ
  task as (
    select
      count(*) filter (where status = 'PENDING_ACCEPT' and department = 'SERVICE') as accept_service,
      count(*) filter (where status = 'PENDING_ACCEPT' and department = 'PROJECT') as accept_project,
      count(*) filter (where status = 'PENDING_ACCEPT' and department = 'LAB')     as accept_lab,
      count(*) filter (where status = 'IN_PROGRESS'    and department = 'SERVICE') as working_service,
      count(*) filter (where status = 'IN_PROGRESS'    and department = 'PROJECT') as working_project,
      count(*) filter (where status = 'IN_PROGRESS'    and department = 'LAB')     as working_lab
    from department_task
  )

  select json_build_object(
    'pendingApproveSp',  wo.pending_approve_sp,
    'pendingApproveLab', wo.pending_approve_lab,
    'returned',          wo.returned,
    'acceptService',     task.accept_service,
    'acceptProject',     task.accept_project,
    'acceptLab',         task.accept_lab,
    'workingService',    task.working_service,
    'workingProject',    task.working_project,
    'workingLab',        task.working_lab,
    'completedMonth',    wo.completed_month,
    'cancelledMonth',    wo.cancelled_month,
    'unpaid',            wo.unpaid,
    'overdue',           wo.overdue,
    'total',             wo.total,
    -- ตารางว่างเปล่าหรือไม่ ต้องมาจากฝั่งฐานข้อมูล ไม่ใช่ให้โค้ดเดาจากยอดที่เป็นศูนย์
    -- "ยังไม่มีใบงานเลย" กับ "มีใบงานแต่ไม่มีอะไรค้าง" ต้องขึ้นข้อความคนละแบบ
    'isEmpty',           (wo.total = 0),
    -- เวลาที่ฐานข้อมูลตอบ ใช้ยืนยันว่ายอดที่เห็นสดแค่ไหนเมื่อมันมาจากแคช
    'asOf',              to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI:SS')
  )
  from wo, task;
$$;

comment on function dashboard_summary() is
  'ยอดหน้าแรกทั้งชุดในคำขอเดียว · เรียกผ่าน POST /rest/v1/rpc/dashboard_summary {} · ไม่รับ role เป็นอาร์กิวเมนต์โดยตั้งใจ ฝั่ง Apps Script เป็นคนตัดสินว่าใครเห็นช่องไหน';

-- service_role เท่านั้นที่เรียกได้ เหมือนทุกอย่างในระบบนี้
-- ฟังก์ชันประกาศเป็น SECURITY INVOKER (ค่าตั้งต้น) จึงยังเคารพ RLS
-- แปลว่าถึง anon จะเรียกได้ ก็จะได้ยอดศูนย์ทั้งหมด ไม่ใช่ข้อมูลจริง
revoke all on function dashboard_summary() from public, anon, authenticated;
grant execute on function dashboard_summary() to service_role;

-- ---------------------------------------------------------------------
-- index ที่ยอดชุดนี้พึ่ง — สองตัวแรกมีอยู่แล้วใน supabase_schema.sql
--   idx_wo_route   (route, overall_status)  -> รออนุมัติแยกสาย
--   idx_wo_status  (overall_status)         -> ถูกตีกลับ · เสร็จสิ้น · ยกเลิก
--   idx_dt_dept    (department, status)     -> รอกดรับงาน · กำลังดำเนินการ แยกแผนก
--   idx_wo_payment (payment_status) where payment_required -> ยังไม่ชำระ
--   idx_wo_due     (นิพจน์วันครบกำหนด) where duration_days is not null -> เลยกำหนด
--                  สร้างไว้ใน supabase_batch1.sql ซึ่งต้องรันก่อนไฟล์นี้
--
-- ตัวเดียวที่เพิ่มใหม่คือตัวข้างล่าง สำหรับยอด "เสร็จสิ้นเดือนนี้" กับ "ยกเลิกเดือนนี้"
-- ซึ่งกรองด้วยสถานะปลายทางคู่กับช่วงเวลา
-- ---------------------------------------------------------------------
-- ชื่อ index บอกเจตนามาตั้งแต่แรกว่าอยากได้ closed-at แต่ตอนนั้นยังไม่มีคอลัมน์ให้ใช้
-- ตอนนี้มีแล้ว จึงสร้างใหม่ให้ตรงกับสิ่งที่คำสั่งนับใช้จริง — ดู supabase_batch3.sql
create index if not exists idx_wo_closed_at
  on work_order (overall_status, closed_date desc)
  where overall_status in ('COMPLETED', 'CANCELLED');

-- ตรวจว่าใช้ได้จริง — ควรคืน JSON หนึ่งก้อนที่มีทุกคีย์ข้างบน
select dashboard_summary();


-- ---------------------------------------------------------------------
--  เวอร์ชันของไฟล์นี้ — checkSupabase() อ่านค่านี้ไปเทียบกับที่โค้ดคาดหวัง
--  (ยอดทั้งหน้าแรกในคำขอเดียว รวมยอดเลยกำหนด)
--  ห้ามใช้คอมเมนต์บอกเวอร์ชันแทน เพราะอ่านกลับจากฐานข้อมูลไม่ได้
-- ---------------------------------------------------------------------
create or replace function sql_version_dashboard() returns text
  language sql immutable as $$ select 'dashboard-2026-09-26-b' $$;
revoke all on function sql_version_dashboard() from public, anon, authenticated;
grant execute on function sql_version_dashboard() to service_role;

-- บอก PostgREST ให้โหลดรายชื่อฟังก์ชันใหม่ ไม่งั้นของที่เพิ่งสร้างจะยังเรียกไม่ได้
notify pgrst, 'reload schema';
