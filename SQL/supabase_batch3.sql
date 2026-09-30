-- =====================================================================
--  งานปรับปรุงกองที่ 3 — เปิดงานที่ปิดไปแล้วขึ้นมาทำต่อ (SPEC 5 · 20.6)
--
--  ** ต้องรันหลัง push โค้ดชุดนี้แล้ว **
--
--  ถ้ายังไม่รัน: หน้าสร้างใบงานและหน้าแก้ไขจะบันทึกไม่ได้เลย เพราะโค้ดส่งคอลัมน์
--  ที่ยังไม่มีไปด้วยทุกครั้ง · ปุ่ม "เปิดงานนี้ขึ้นมาทำต่อ" จะกดแล้วขึ้นข้อผิดพลาด ·
--  และยอด "เสร็จสิ้นเดือนนี้" กับ "ยกเลิกเดือนนี้" บนแดชบอร์ดจะเรียกไม่ได้
--
--  รันได้ทั้งกับฐานที่เคยรันฉบับก่อนและฐานที่ยังไม่เคยรัน · รันซ้ำได้ไม่มีผลข้างเคียง
--  วางทั้งไฟล์ใน SQL Editor แล้ว Run ครั้งเดียว
-- =====================================================================


-- ---------------------------------------------------------------------
--  1) ห้าคอลัมน์ใหม่ใน work_order
-- ---------------------------------------------------------------------

alter table work_order add column if not exists reopen_count  integer not null default 0;
alter table work_order add column if not exists reopen_reason text;
alter table work_order add column if not exists reopened_by   text;
alter table work_order add column if not exists reopened_date timestamptz;
alter table work_order add column if not exists closed_date   timestamptz;

comment on column work_order.reopen_count is
  'จำนวนครั้งที่ใบงานถูกเปิดขึ้นมาทำต่อหลังปิดไปแล้ว · ค่าตั้งต้น 0 ไม่ใช่ NULL ตัวกรอง "เคยเปิดซ้ำ" จึงใช้ > 0';
comment on column work_order.reopen_reason is
  'เหตุผลการเปิดงานใหม่ครั้งล่าสุด · แยกจาก return_reason เพราะการตีกลับกับการเปิดงานใหม่เป็นคนละเรื่อง และใบเดียวกันเกิดได้ทั้งสองอย่าง';
comment on column work_order.closed_date is
  'เวลาที่ใบงานเข้าสู่สถานะปิดหรือยกเลิกจริง · ล้างเป็น NULL เมื่อถูกเปิดขึ้นมาทำต่อ · ยอด "เสร็จสิ้นเดือนนี้" นับจากช่องนี้';

/*
  ** ใบที่ปิดไปก่อนมีคอลัมน์นี้ ปล่อยให้ closed_date เป็น NULL โดยตั้งใจ **

  เดาย้อนหลังจาก updated_date ไม่ได้ เพราะนั่นคือค่าที่ผิดตั้งแต่ต้น — มันขยับทุกครั้ง
  ที่มีคนแก้อะไรก็ได้ · การเติมค่าที่รู้อยู่แล้วว่าผิด จะได้ตัวเลขที่ดูน่าเชื่อถือแต่เชื่อไม่ได้
  ซึ่งแย่กว่าการยอมรับว่าประวัติก่อนวันนี้นับไม่ได้

  ผลที่ตามมา: ยอด "เสร็จสิ้นเดือนนี้" จะนับได้เฉพาะใบที่ปิดตั้งแต่วันที่รันไฟล์นี้เป็นต้นไป
  เดือนแรกตัวเลขจะต่ำกว่าความจริง แล้วจะถูกต้องเต็มเดือนตั้งแต่เดือนถัดไป
*/


-- ---------------------------------------------------------------------
--  2) dashboard_summary ฉบับที่นับจาก closed_date
-- ---------------------------------------------------------------------
/*
  ไม่ต้อง drop เพราะลายเซ็นไม่เปลี่ยน — ยังเป็น dashboard_summary() ที่ไม่รับอาร์กิวเมนต์
  create or replace ทับได้ตรง ๆ
*/

create or replace function dashboard_summary()
returns json
language sql
stable
as $$
  with
  -- เดือนนี้ตามเวลาไทย ไม่ใช่ตามเวลา UTC
  -- ใบที่ปิดตอนตีหนึ่งของวันที่ 1 ตามเวลาไทย ยังเป็นเวลา 18:00 ของเดือนก่อนตาม UTC
  month_start as (
    select date_trunc('month', (now() at time zone 'Asia/Bangkok'))
             at time zone 'Asia/Bangkok' as at
  ),

  -- วันนี้ตามเวลาไทย ใช้ตัดสินว่าใบไหนเลยกำหนดแล้ว
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
       */
      count(*) filter (where overall_status = 'COMPLETED'
                         and closed_date >= (select at from month_start)) as completed_month,
      count(*) filter (where overall_status = 'CANCELLED'
                         and closed_date >= (select at from month_start)) as cancelled_month,
      count(*) filter (where payment_required
                         and coalesce(payment_status, '') <> 'PAID')  as unpaid,
      /*
       * เลยกำหนด — ใช้ฟังก์ชัน due_date() ตัวเดียวกับที่หน้ารายการใช้กรอง
       * ยอดบนการ์ดกับจำนวนที่เห็นตอนกดเข้าไปจึงมาจากสูตรเดียวกันเสมอ
       */
      count(*) filter (where duration_days is not null
                         and overall_status not in ('COMPLETED', 'CANCELLED')
                         and due_date(work_order) < (select at from today_th)) as overdue
    from work_order
  ),

  -- ยอดของแผนกมาจากสถานะของ department_task ไม่ใช่สถานะของใบงาน (SPEC 17.3)
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
    'isEmpty',           (wo.total = 0),
    'asOf',              to_char(now() at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI:SS')
  )
  from wo, task;
$$;

comment on function dashboard_summary() is
  'ยอดหน้าแรกทั้งชุดในคำขอเดียว · ไม่รับ role เป็นอาร์กิวเมนต์โดยตั้งใจ ฝั่ง Apps Script เป็นคนตัดสินว่าใครเห็นช่องไหน · ยอดเสร็จสิ้นและยกเลิกเดือนนี้นับจาก closed_date';

revoke all on function dashboard_summary() from public, anon, authenticated;
grant execute on function dashboard_summary() to service_role;


-- ---------------------------------------------------------------------
--  3) index ที่ชี้ไปยังคอลัมน์จริง
-- ---------------------------------------------------------------------
/*
  ชื่อ idx_wo_closed_at บอกเจตนามาตั้งแต่แรกว่าอยากได้ closed-at แต่ตอนนั้นยังไม่มี
  คอลัมน์ให้ใช้ จึงไปเกาะ updated_date ไว้ก่อน · ตอนนี้มีแล้วจึงย้ายให้ตรง

  ต้อง drop ก่อน เพราะ create index if not exists จะเห็นว่าชื่อนี้มีอยู่แล้วแล้วข้ามไปเงียบ ๆ
  ผลคือ index ยังเกาะคอลัมน์เดิม ตัวนับก็ยังช้าเท่าเดิม และไม่มีอะไรบอกว่าทำไม
*/
drop index if exists idx_wo_closed_at;
create index if not exists idx_wo_closed_at
  on work_order (overall_status, closed_date desc)
  where overall_status in ('COMPLETED', 'CANCELLED');

-- ตัวกรอง "เคยเปิดซ้ำ" ในหน้าใบงานทั้งหมด · ใบส่วนใหญ่มีค่า 0 จึงใช้ partial index
create index if not exists idx_wo_reopened
  on work_order (reopen_count)
  where reopen_count > 0;


-- ---------------------------------------------------------------------
--  4) ตรวจว่าสำเร็จจริง
-- ---------------------------------------------------------------------

-- ควรได้ห้าแถว ตามลำดับ closed_date · reopen_count · reopen_reason · reopened_by · reopened_date
-- และ reopen_count ต้องเป็น integer ที่ is_nullable = NO พร้อม column_default = 0
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'work_order'
  and column_name in ('reopen_count', 'reopen_reason', 'reopened_by', 'reopened_date', 'closed_date')
order by column_name;

-- ควรได้ JSON ที่มี completedMonth และ cancelledMonth อยู่ด้วย
-- ทั้งสองค่าจะเป็น 0 ในเดือนที่รันไฟล์นี้ ถ้ายังไม่มีใบไหนปิดหลังจากนี้ — ถูกต้องแล้ว
select dashboard_summary();

-- ควรได้สองแถว · idx_wo_closed_at ต้องมีคำว่า closed_date อยู่ในนิยาม ไม่ใช่ updated_date
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and indexname in ('idx_wo_closed_at', 'idx_wo_reopened')
order by indexname;

-- ควรได้ 0 — ไม่มีใบเก่าใบไหนถูกเดาวันปิดย้อนหลัง
select count(*) as ใบเก่าที่ถูกเดาวันปิดย้อนหลัง
from work_order
where overall_status in ('COMPLETED', 'CANCELLED') and closed_date is not null
  and updated_date < now() - interval '1 minute';


-- ---------------------------------------------------------------------
--  เวอร์ชันของไฟล์นี้ — checkSupabase() อ่านค่านี้ไปเทียบกับที่โค้ดคาดหวัง
--  ห้ามใช้คอมเมนต์บอกเวอร์ชันแทน เพราะอ่านกลับจากฐานข้อมูลไม่ได้
-- ---------------------------------------------------------------------
create or replace function sql_version_batch3() returns text
  language sql immutable as $$ select 'batch3-2026-09-26-a' $$;
revoke all on function sql_version_batch3() from public, anon, authenticated;
grant execute on function sql_version_batch3() to service_role;

-- dashboard_summary ถูกเขียนทับในไฟล์นี้ จึงต้องขยับเวอร์ชันของไฟล์นั้นตามไปด้วย
create or replace function sql_version_dashboard() returns text
  language sql immutable as $$ select 'dashboard-2026-09-26-b' $$;
revoke all on function sql_version_dashboard() from public, anon, authenticated;
grant execute on function sql_version_dashboard() to service_role;

-- บอก PostgREST ให้โหลดรายชื่อคอลัมน์และฟังก์ชันใหม่ ไม่งั้นของที่เพิ่งสร้างจะยังเรียกไม่ได้
notify pgrst, 'reload schema';
