-- =====================================================================
--  Work Order Web App — Supabase / PostgreSQL schema
--  สร้างจาก "หัวคอลัมน์จริง" ที่ dumpSheetHeaders() รายงานมา ไม่ใช่จาก SPEC 13
--  วางทั้งไฟล์นี้ใน Supabase > SQL Editor > New query แล้วกด Run ครั้งเดียว
--  รันซ้ำได้ (idempotent) เพราะใช้ IF NOT EXISTS ทุกจุด
-- =====================================================================
--  กฎชนิดข้อมูลที่ใช้ทั้งไฟล์ (CLAUDE.md ข้อ 23)
--    timestamptz = เวลาที่เครื่องบันทึก
--    date        = วันที่ล้วนที่คนเลือก (ไม่มีโซนเวลา เลื่อนไม่ได้)
--    text        = เวลานัดหมาย YYYY-MM-DDTHH:mm ตามที่ผู้ใช้เห็นบนจอ
--  กฎ boolean (CLAUDE.md ข้อ 25)
--    active / is_active        DEFAULT true   (ช่องว่างในชีต = ใช้งานอยู่)
--    required / multiple / ... DEFAULT false  (ช่องว่างในชีต = ไม่)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) ตารางข้อมูลหลัก (Master) — ย้ายข้อมูลจริงทั้งหมด
-- ---------------------------------------------------------------------

create table if not exists customer (
  customer_code       text primary key,
  customer_name       text,
  sales_person        text,
  start_contact_date  date
);
comment on table customer is
  'ย่อจากชีต Customer 20 คอลัมน์เหลือ 4 คอลัมน์ที่ระบบใช้จริง · ต้นทางยังเป็นชีตที่ผู้ใช้วางข้อมูลเอง แล้วกดซิงก์เข้ามา';

create table if not exists report_master (
  report_code  text primary key,
  type         text,
  report_name  text,
  form_no      text,
  required     boolean not null default false,
  sort_order   integer,
  active       boolean not null default true
);
comment on column report_master.form_no is
  'ห้ามใช้เป็นคีย์ — SV1 กับ PE1 ใช้ Form_No เดียวกัน (FM-SV-09-R.00)';

create table if not exists attachment_topic (
  topic_id    text primary key,
  scope       text,
  topic_name  text,
  required    boolean not null default false,
  multiple    boolean not null default false,
  active      boolean not null default true
);

create table if not exists task_step_template (
  template_id  text primary key,
  department   text,
  step_no      integer,
  step_name    text,
  description  text,
  active       boolean not null default true
);

create table if not exists request_type (
  request_id    text primary key,
  request_name  text,
  sort_order    integer,
  active        boolean not null default true
);

create table if not exists notify_channel (
  channel_id  text primary key,
  name        text,
  target      text,
  chat_id     bigint,      -- ค่าจริง -5432420278 เกินช่วง 32 บิต ต้องเป็น bigint
  thread_id   bigint,
  active      boolean not null default true
);


-- ---------------------------------------------------------------------
-- 2) ผู้ใช้และการล็อกอิน
-- ---------------------------------------------------------------------

create table if not exists user_role (
  email                 text primary key,
  username              text not null unique,
  password_hash         text,
  password_salt         text,
  failed_count          integer not null default 0,
  locked_until          timestamptz,
  must_change_password  boolean not null default false,
  display_name          text,
  role                  text,     -- หลาย Role คั่นด้วยจุลภาค เช่น 'ADMIN,APPROVER_SP'
  department            text,
  telegram_user_id      text,
  active                boolean not null default true
);
comment on table user_role is
  'Email เป็นคีย์หลักตามเดิม (CLAUDE.md) · username unique เป็นของแถมจากการย้าย — ชีตเดิมไม่มีอะไรกันชื่อผู้ใช้ซ้ำเลย';

create table if not exists session_token (
  token_hash      text primary key,
  email           text not null,
  issued_date     timestamptz not null default now(),
  expires_date    timestamptz not null,
  last_used_date  timestamptz,
  active          boolean not null default true
);
create index if not exists idx_session_expires on session_token (expires_date);
create index if not exists idx_session_email   on session_token (email);
comment on table session_token is
  'ไม่ย้ายข้อมูลเก่า — โทเคนหมดอายุ 12 ชม. อยู่แล้ว สร้างเปล่าแล้วให้ทุกคนล็อกอินใหม่ครั้งเดียว';


-- ---------------------------------------------------------------------
-- 3) ตารางธุรกรรม — ย้ายแต่โครงสร้าง ไม่มีข้อมูลให้ย้าย (0 แถวทุกตาราง)
-- ---------------------------------------------------------------------

create table if not exists project_location (
  pj_id          text primary key,
  customer_code  text,
  customer_name  text,
  project        text,
  project_seq    integer,
  location       text,
  location_key   text,
  location_seq   integer,
  first_wo_id    text,
  wo_count       integer not null default 0,
  created_by     text,
  created_date   timestamptz not null default now(),
  active         boolean not null default true
);
create index if not exists idx_pl_customer on project_location (customer_code);
create index if not exists idx_pl_lockey   on project_location (customer_code, project, location_key);

create table if not exists work_order (
  wo_id               text primary key,
  pj_id               text,
  customer_code       text,
  customer_name       text,
  sales_person        text,
  start_contact_date  date,
  contact             text,
  phone               text,       -- text เสมอ · ปัญหาศูนย์นำหายของชีตหมดไปเอง
  location            text,
  project             text,
  request_types       text,       -- คั่นจุลภาคเหมือนเดิม ห้ามเปลี่ยนเป็น array ในรอบนี้
  job_description     text,
  product_detail      text,
  work_scope          text,
  reference_doc       text,
  remark              text,
  route               text,
  assignment_type     text,
  start_date          text,       -- 'YYYY-MM-DDTHH:mm' เวลานัดหมาย ห้ามเป็น timestamptz
  end_date            text,       -- 'YYYY-MM-DDTHH:mm' เวลานัดหมาย ห้ามเป็น timestamptz
  overall_status      text not null,
  approved_by         text,
  approved_date       timestamptz,
  return_count        integer not null default 0,
  return_reason       text,
  returned_by         text,
  returned_date       timestamptz,
  cancel_reason       text,
  payment_required    boolean not null default false,
  payment_status      text,
  payment_date        timestamptz,
  payment_by          text,
  payment_remark      text,
  folder_id           text,
  folder_map          text,       -- คงเป็น text ในรอบนี้ · เปลี่ยนเป็น jsonb ได้ในรอบปรับปรุง
  report_url          text,
  folder_url          text,
  created_by          text,
  created_date        timestamptz not null default now(),
  updated_by          text,
  updated_date        timestamptz,
  -- ขอบเขตวันการทำงาน · NULL = ไม่ได้กำหนด ไม่ใช่เกินกำหนด
  -- วันครบกำหนดไม่มีคอลัมน์เก็บ คำนวณจาก created_date บวกค่านี้ — ดู supabase_batch1.sql
  duration_days       integer,

  -- เปิดงานที่ปิดไปแล้วขึ้นมาทำต่อ — ดู supabase_batch3.sql
  reopen_count        integer not null default 0,
  reopen_reason       text,
  reopened_by         text,
  reopened_date       timestamptz,

  -- วันที่ปิดงานจริง — ยอด "เสร็จสิ้นเดือนนี้" นับจากช่องนี้ ไม่ใช่ updated_date
  -- ที่ขยับทุกครั้งที่มีการแก้อะไรก็ได้ รวมทั้งการบันทึกการชำระเงินหลังงานเสร็จ
  closed_date         timestamptz
);
create index if not exists idx_wo_status   on work_order (overall_status);
create index if not exists idx_wo_created  on work_order (created_date desc);
create index if not exists idx_wo_customer on work_order (customer_code);
create index if not exists idx_wo_pj       on work_order (pj_id);
create index if not exists idx_wo_route    on work_order (route, overall_status);
create index if not exists idx_wo_payment  on work_order (payment_status) where payment_required;

create table if not exists department_task (
  task_id               text primary key,
  wo_id                 text not null
                          references work_order (wo_id) on delete cascade,
  department            text not null,
  status                text not null,
  status_before_return  text,
  assigned_date         timestamptz,
  accepted_by           text,
  accepted_date         timestamptz,
  completed_by          text,
  completed_date        timestamptz,
  cancel_reason         text,
  return_reason         text,
  remark                text,
  updated_by            text,
  updated_date          timestamptz,
  -- เวลานัดหมายที่คนกรอก สตริง 'YYYY-MM-DDTHH:mm' ห้ามเป็น timestamptz (กฎข้อ 23)
  visit_start           text,
  visit_end             text
);
create index if not exists idx_dt_wo   on department_task (wo_id);
create index if not exists idx_dt_dept on department_task (department, status);

create table if not exists task_step (
  step_id         text primary key,
  task_id         text not null
                    references department_task (task_id) on delete cascade,
  step_no         integer,
  step_name       text,
  type            text,        -- STEP หรือ PERIOD
  status          text,
  due_date        date,        -- วันที่ล้วน ไม่มีเวลา
  completed_by    text,
  completed_date  timestamptz
);
create index if not exists idx_ts_task on task_step (task_id);

create table if not exists file_index (
  file_id             text primary key,
  wo_id               text,
  task_id             text,
  step_id             text,
  topic_id            text,
  report_code         text,
  saved_file_name     text,
  original_file_name  text,
  seq                 integer,
  drive_file_id       text,
  file_url            text,
  mime_type           text,
  size                bigint,
  version             integer not null default 1,
  is_active           boolean not null default true,
  uploaded_by         text,
  uploaded_date       timestamptz not null default now()
);
create index if not exists idx_fi_wo   on file_index (wo_id) where is_active;
create index if not exists idx_fi_task on file_index (task_id) where is_active;
comment on table file_index is
  'ไม่ผูก FK กับ work_order โดยตั้งใจ — ไฟล์บน Drive อยู่ต่อแม้แถวจะถูกยกเลิก และการลบใช้ is_active = false ตามกฎข้อ 8';


-- ---------------------------------------------------------------------
-- 4) บันทึกประวัติ — รวมเป็นตารางเดียว ไม่ต้องแยกไฟล์รายปีอีกแล้ว
-- ---------------------------------------------------------------------

create table if not exists audit_log (
  log_id      text primary key,
  wo_id       text,
  task_id     text,
  "user"      text,     -- user เป็นคำสงวนของ Postgres ต้องใส่ "" ทุกครั้งที่อ้างถึง
  role        text,
  action      text,
  entity      text,
  field       text,
  from_value  text,
  to_value    text,
  remark      text,
  timestamp   timestamptz not null default now()
);
create index if not exists idx_audit_wo   on audit_log (wo_id, timestamp desc);
create index if not exists idx_audit_time on audit_log (timestamp desc);
comment on table audit_log is
  'ห้ามผูก FK กับ work_order — ประวัติต้องอยู่ต่อแม้ใบงานจะถูกลบ และ cascade จะทำลายประวัติทิ้ง · เก็บถาวร ห้ามลบ';

create table if not exists system_log (
  log_id     text primary key,
  level      text,
  source     text,
  event      text,
  "user"     text,
  detail     text,
  timestamp  timestamptz not null default now()
);
create index if not exists idx_syslog_time  on system_log (timestamp desc);
create index if not exists idx_syslog_level on system_log (level, timestamp desc);


-- ---------------------------------------------------------------------
-- 5) ตัวนับเลขที่ + ฟังก์ชันออกเลขแบบ atomic
--    แทน LockService ซึ่งกันได้แค่ในสคริปต์เดียวกันและยังมีช่องว่างระหว่างอ่านกับเขียน
-- ---------------------------------------------------------------------

create table if not exists counter (
  key           text primary key,
  last_number   integer not null default 0,
  updated_date  timestamptz not null default now()
);

create or replace function next_running_number(p_key text)
returns integer
language plpgsql
as $$
declare
  v_next integer;
begin
  insert into counter (key, last_number, updated_date)
  values (p_key, 1, now())
  on conflict (key) do update
    set last_number  = counter.last_number + 1,
        updated_date = now()
  returning last_number into v_next;
  return v_next;
end;
$$;
comment on function next_running_number(text) is
  'เรียกผ่าน POST /rest/v1/rpc/next_running_number {"p_key":"WO-2609"} · เลขซ้ำกันไม่ได้ในทางทฤษฎี ไม่ใช่แค่ในทางปฏิบัติ';


-- ---------------------------------------------------------------------
-- 6) เปิด RLS โดยไม่ใส่ policy สักข้อ
--    = anon / authenticated อ่านอะไรไม่ได้เลย · service_role ข้าม RLS ได้
--    ไม่ใช้ FORCE เพราะ FORCE บังคับ RLS กับเจ้าของตาราง (postgres) ด้วย
--    ซึ่งทำให้เปิดดูข้อมูลในหน้า Table Editor ของ Supabase เองไม่เห็นสักแถว
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'customer','report_master','attachment_topic','task_step_template',
    'request_type','notify_channel','user_role','session_token',
    'project_location','work_order','department_task','task_step',
    'file_index','audit_log','system_log','counter'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 6.1) ให้สิทธิ์ service_role — ขาดข้อนี้จะได้ 403 code=42501 ทุกคำสั่ง
--      ตั้งแต่ 30 พ.ค. 2026 Supabase ไม่ให้สิทธิ์ตารางใหม่กับ anon /
--      authenticated / service_role โดยอัตโนมัติอีกต่อไป ต้อง GRANT เอง
--      RLS กันฝั่งหน้าเว็บ ส่วน GRANT เป็นตัวเปิดประตูให้ฝั่งเซิร์ฟเวอร์
-- ---------------------------------------------------------------------

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables    in schema public to service_role;
grant usage, select                  on all sequences in schema public to service_role;
grant execute                        on all functions in schema public to service_role;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables    to service_role;
alter default privileges for role postgres in schema public
  grant usage, select                  on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute                        on functions to service_role;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;


-- ---------------------------------------------------------------------
-- 7) ตรวจว่าสร้างครบ — ต้องได้ 16 แถว
-- ---------------------------------------------------------------------

select table_name,
       (select count(*) from information_schema.columns c
         where c.table_name = t.table_name and c.table_schema = 'public') as cols
from information_schema.tables t
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;


-- =====================================================================
--  8) เครื่องมือให้ checkSupabase() ตรวจว่าไฟล์ SQL ถูกรันครบหรือยัง
-- =====================================================================
/*
  **ปัญหาที่ส่วนนี้แก้: ไม่มีทางรู้ว่าไฟล์ SQL เวอร์ชันไหนถูกรันไปจริง**

  การส่งงานว่า "ไปรันไฟล์นี้" ล้มเหลวเงียบ ๆ ได้หลายทาง — เปิดแท็บเก่าค้างไว้
  แล้วรันของเก่า · รันไปครึ่งไฟล์แล้วติดข้อผิดพลาดแต่ส่วนต้นผ่านไปแล้ว ·
  หรือรันไฟล์หนึ่งแล้วลืมอีกไฟล์ · ทุกกรณีจบลงเหมือนกันคือระบบทำงานได้เกือบหมด
  แล้วมีอยู่มุมเดียวที่ผิดโดยไม่มีอะไรฟ้อง

  ทางแก้คือให้ทุกไฟล์ประกาศเวอร์ชันของตัวเองเป็น **ฟังก์ชัน** ไม่ใช่คอมเมนต์
  เพราะคอมเมนต์ในไฟล์อ่านกลับจากฐานข้อมูลไม่ได้ · สิ่งที่อ่านกลับได้เท่านั้น
  ที่ใช้ตอบได้ว่า "ของที่อยู่ในฐานข้อมูลตอนนี้มาจากไฟล์เวอร์ชันไหน"

  db_objects() รวบรวมสามอย่างมาในคำขอเดียว: เวอร์ชันของทุกไฟล์ที่เคยรัน
  รายชื่อ index และรายชื่อ constraint · ฝั่ง Apps Script เก็บรายการที่ต้องมี
  แล้วเทียบเอง จึงเพิ่มของใหม่ได้โดยไม่ต้องแก้ SQL ตัวนี้อีก
*/
create or replace function db_objects()
returns json
language plpgsql
stable
as $$
declare
  versions jsonb := '{}'::jsonb;
  r record;
  v text;
begin
  /*
    เรียกทุกฟังก์ชันที่ชื่อขึ้นต้นด้วย sql_version_ แล้วเก็บค่าที่ได้
    ไม่ต้องรู้ล่วงหน้าว่ามีไฟล์อะไรบ้าง — ไฟล์ใหม่ที่ประกาศฟังก์ชันตามแบบเดียวกัน
    จะถูกรายงานทันทีโดยไม่ต้องแก้ตัวนี้ · pronargs = 0 กันไม่ให้เผลอเรียก
    ฟังก์ชันที่ต้องการอาร์กิวเมนต์แล้วทั้งก้อนล้ม
  */
  for r in
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'sql!_version!_%' escape '!'
      and p.pronargs = 0
    order by p.proname
  loop
    execute format('select public.%I()', r.proname) into v;
    versions := versions || jsonb_build_object(r.proname, v);
  end loop;

  return json_build_object(
    'versions', versions,
    'indexes', (
      select coalesce(json_agg(indexname order by indexname), '[]'::json)
      from pg_indexes where schemaname = 'public'
    ),
    'constraints', (
      select coalesce(json_agg(c.conname order by c.conname), '[]'::json)
      from pg_constraint c
      join pg_class t     on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and c.contype in ('c', 'u', 'f')
    ),
    'functions', (
      select coalesce(json_agg(p.proname order by p.proname), '[]'::json)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
    ),
    /*
      รายชื่อตาราง — มีไว้เพื่อแยก "ยังไม่ได้รัน" ออกจาก "รันไปก่อนมีระบบเวอร์ชัน"

      สองอย่างนี้หน้าตาเหมือนกันทุกประการคือ ไม่มีเวอร์ชันบันทึกไว้ แต่ต้องทำคนละอย่าง —
      อย่างแรกคือรันไฟล์จริง อีกอย่างคือรันซ้ำเพื่อบันทึกเวอร์ชัน · ถ้าบอกเหมือนกัน
      คนจะรันไฟล์นำเข้าข้อมูลซ้ำโดยไม่จำเป็น หรือเลวร้ายกว่านั้นคือเลิกอ่านรายงานทั้งฉบับ
    */
    'tables', (
      select coalesce(json_agg(tablename order by tablename), '[]'::json)
      from pg_tables where schemaname = 'public'
    )
  );
end $$;

comment on function db_objects() is
  'รายชื่อของในฐานข้อมูลที่ checkSupabase() ใช้เทียบ · เวอร์ชันของทุกไฟล์ SQL ที่เคยรัน พร้อม index constraint และฟังก์ชัน';

-- อ่านโครงสร้างฐานข้อมูลได้ จึงต้องปิดเหมือนทุกอย่างในระบบนี้
revoke all on function db_objects() from public, anon, authenticated;
grant execute on function db_objects() to service_role;


-- ---------------------------------------------------------------------
--  เวอร์ชันของไฟล์นี้
-- ---------------------------------------------------------------------
create or replace function sql_version_schema() returns text
  language sql immutable as $$ select 'schema-2026-09-26-b' $$;
revoke all on function sql_version_schema() from public, anon, authenticated;
grant execute on function sql_version_schema() to service_role;

/*
  PostgREST จำรายชื่อฟังก์ชันไว้ในหน่วยความจำ · ถ้าไม่บอกให้โหลดใหม่
  ฟังก์ชันที่เพิ่งสร้างจะยังเรียกผ่าน REST ไม่ได้อีกสักพัก แล้ว checkSupabase()
  จะรายงานว่า "ยังไม่ได้รันไฟล์นี้" ทั้งที่เพิ่งรันไปหมาด ๆ
*/
notify pgrst, 'reload schema';

-- ควรได้เวอร์ชันของทุกไฟล์ที่รันไปแล้ว พร้อมรายชื่อ index และ constraint
select db_objects();
