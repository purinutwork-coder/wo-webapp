-- =====================================================================
--  แพตช์: ให้สิทธิ์ service_role เข้าถึงตาราง
--  แก้อาการ 403 · code=42501 · permission denied for table ...
--
--  สาเหตุ: ตั้งแต่ 30 พ.ค. 2026 Supabase เปลี่ยนค่าเริ่มต้นของโปรเจกต์ใหม่
--  ตารางใน schema public จะ "ไม่" ถูกให้สิทธิ์กับ anon / authenticated /
--  service_role โดยอัตโนมัติอีกต่อไป ต้อง GRANT เองทุกตาราง
--  (โปรเจกต์เก่าจะโดนกฎเดียวกันวันที่ 30 ต.ค. 2026)
--
--  ไฟล์นี้ให้สิทธิ์ "เฉพาะ service_role" เท่านั้นโดยตั้งใจ
--  anon กับ authenticated ยังต้องเข้าอะไรไม่ได้เลย ซึ่งคือคุณสมบัติที่เราต้องการ
--
--  วางทั้งไฟล์ใน SQL Editor แล้ว Run · รันซ้ำได้ไม่มีผลข้างเคียง
-- =====================================================================


-- 1) เข้าถึง schema ได้
grant usage on schema public to service_role;

-- 2) ตารางและ sequence ที่มีอยู่แล้วทั้งหมด
grant select, insert, update, delete on all tables    in schema public to service_role;
grant usage, select                  on all sequences in schema public to service_role;
grant execute                        on all functions in schema public to service_role;

-- 3) ตารางที่จะสร้างในอนาคตด้วย จะได้ไม่ต้องกลับมารันไฟล์นี้ทุกครั้งที่เพิ่มตาราง
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables    to service_role;
alter default privileges for role postgres in schema public
  grant usage, select                  on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute                        on functions to service_role;


-- 4) ปิดประตูฝั่งหน้าเว็บให้แน่นอีกชั้น
--    ถึงคีย์ anon จะหลุดออกไป ก็ยังอ่านอะไรไม่ได้
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables    from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;


-- 5) ยกเลิก FORCE ROW LEVEL SECURITY ที่ไฟล์ schema เดิมตั้งไว้
--    ENABLE อย่างเดียวพอแล้ว · FORCE บังคับ RLS กับเจ้าของตาราง (postgres) ด้วย
--    ซึ่งทำให้ "เปิดดูข้อมูลในหน้า Table Editor ของ Supabase เองไม่เห็นสักแถว"
--    แล้วจะเข้าใจผิดว่าข้อมูลหาย · ส่วนการกันฝั่งหน้าเว็บ ข้อ 4 ทำแทนได้แน่นกว่า
do $$
declare t text;
begin
  foreach t in array array[
    'customer','report_master','attachment_topic','task_step_template',
    'request_type','notify_channel','user_role','session_token',
    'project_location','work_order','department_task','task_step',
    'file_index','audit_log','system_log','counter'
  ] loop
    execute format('alter table %I no force row level security', t);
  end loop;
end $$;


-- =====================================================================
--  6) ตรวจผล — ต้องได้ service_role ครบ 16 ตาราง และไม่มี anon/authenticated เลย
-- =====================================================================
select grantee,
       count(distinct table_name) as tables,
       string_agg(distinct privilege_type, ', ' order by privilege_type) as privs
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('service_role', 'anon', 'authenticated')
group by grantee
order by grantee;


-- ---------------------------------------------------------------------
--  เวอร์ชันของไฟล์นี้ — checkSupabase() อ่านค่านี้ไปเทียบกับที่โค้ดคาดหวัง
--  (สิทธิ์ของ service_role และการปิดประตู anon)
--  ห้ามใช้คอมเมนต์บอกเวอร์ชันแทน เพราะอ่านกลับจากฐานข้อมูลไม่ได้
-- ---------------------------------------------------------------------
create or replace function sql_version_grants() returns text
  language sql immutable as $$ select 'grants-2026-09-26-a' $$;
revoke all on function sql_version_grants() from public, anon, authenticated;
grant execute on function sql_version_grants() to service_role;

-- บอก PostgREST ให้โหลดรายชื่อฟังก์ชันใหม่ ไม่งั้นของที่เพิ่งสร้างจะยังเรียกไม่ได้
notify pgrst, 'reload schema';
