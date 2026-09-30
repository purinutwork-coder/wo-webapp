-- =====================================================================
--  ตาราง _test_bulk — ที่ทิ้งขยะของชุดทดสอบโดยเฉพาะ
--
--  เหตุผลที่ต้องมี: ชุดทดสอบเคยเขียนแถวทดสอบนับพันแถวลง request_type
--  ซึ่งเป็นตารางที่ "หน้าสร้างใบงานอ่านไปใช้จริง" · เทสต์ที่ล้มกลางคันจึงทิ้ง
--  ตัวเลือกปลอมไว้ในกล่องดรอปดาวน์ที่ผู้ใช้เห็น และการล้างข้อมูลที่ล้มแบบเงียบ
--  ทำให้ไม่มีใครรู้ว่ามันยังอยู่
--
--  โครงสร้างล้อตาม request_type ทุกคอลัมน์ เพื่อให้ย้ายเทสต์มาได้โดยแทบไม่ต้องแก้
--  ชื่อขึ้นต้นด้วยขีดล่าง เพื่อให้เห็นได้ทันทีว่าไม่ใช่ตารางของระบบ
--
--  วางทั้งไฟล์ใน SQL Editor แล้ว Run · รันซ้ำได้ไม่มีผลข้างเคียง
-- =====================================================================

create table if not exists public._test_bulk (
  row_id      text primary key,
  row_name    text,
  sort_order  integer,
  active      boolean not null default true
);

comment on table public._test_bulk is
  'ตารางสำหรับชุดทดสอบเท่านั้น · ระบบจริงไม่อ่านตารางนี้ที่ไหนเลย · ลบทิ้งได้เสมอ';

-- สิทธิ์ให้เฉพาะ service_role เหมือนตารางอื่นทั้งหมด
-- anon กับ authenticated ต้องเข้าไม่ได้ แม้แต่ตารางทดสอบ
grant select, insert, update, delete on public._test_bulk to service_role;
revoke all on public._test_bulk from anon, authenticated;

alter table public._test_bulk enable row level security;

-- ตรวจว่าสร้างแล้วจริง
select table_name,
       (select count(*) from information_schema.columns c
         where c.table_name = t.table_name and c.table_schema = 'public') as cols
from information_schema.tables t
where table_schema = 'public' and table_name = '_test_bulk';


-- ---------------------------------------------------------------------
--  เวอร์ชันของไฟล์นี้ — checkSupabase() อ่านค่านี้ไปเทียบกับที่โค้ดคาดหวัง
--  (ข้อมูลทดสอบจำนวนมาก — ไม่บังคับ)
--  ห้ามใช้คอมเมนต์บอกเวอร์ชันแทน เพราะอ่านกลับจากฐานข้อมูลไม่ได้
-- ---------------------------------------------------------------------
create or replace function sql_version_test_bulk() returns text
  language sql immutable as $$ select 'test_bulk-2026-09-26-a' $$;
revoke all on function sql_version_test_bulk() from public, anon, authenticated;
grant execute on function sql_version_test_bulk() to service_role;

-- บอก PostgREST ให้โหลดรายชื่อฟังก์ชันใหม่ ไม่งั้นของที่เพิ่งสร้างจะยังเรียกไม่ได้
notify pgrst, 'reload schema';
