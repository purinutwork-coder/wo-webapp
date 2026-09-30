-- =====================================================================
--  ขั้นตอนนำเข้าข้อมูลลูกค้าจากโปรแกรมบัญชี (ใช้ซ้ำทุกครั้งที่อัปเดต)
--
--  ทำไมต้องมีตารางพัก: นำเข้า CSV ตรงเข้า customer ทำได้แค่ "เพิ่มใหม่"
--  ลูกค้าเดิมที่เปลี่ยนชื่อหรือเปลี่ยนพนักงานขายจะทำให้การนำเข้าล้มทั้งไฟล์
--  เพราะรหัสซ้ำกับของเดิม · ตารางพักทำให้ "เพิ่มใหม่ + อัปเดตของเดิม" จบในคำสั่งเดียว
--
--  เตรียมไฟล์ CSV ให้มี 4 คอลัมน์ ชื่อหัวตรงนี้เป๊ะ:
--    customer_code, customer_name, sales_person, start_contact_date
--  และ start_contact_date ต้องเป็น YYYY-MM-DD เสมอ
-- =====================================================================


-- ---------------------------------------------------------------------
-- ขั้นที่ 1 · สร้างตารางพัก (รันครั้งเดียวพอ ครั้งต่อไปข้ามได้)
-- ---------------------------------------------------------------------
create table if not exists customer_import (
  customer_code       text,
  customer_name       text,
  sales_person        text,
  start_contact_date  date
);


-- ---------------------------------------------------------------------
-- ขั้นที่ 2 · ล้างตารางพัก แล้วนำเข้า CSV ผ่านหน้า Table Editor
--            เลือกตาราง customer_import > Import data from CSV
-- ---------------------------------------------------------------------
truncate customer_import;

-- << ตรงนี้ไปนำเข้า CSV ที่หน้า Table Editor แล้วค่อยกลับมารันขั้นที่ 3 >>


-- ---------------------------------------------------------------------
-- ขั้นที่ 3 · ตรวจไฟล์ที่เพิ่งนำเข้า "ก่อน" เอาเข้าตารางจริง
--            ถ้าตัวเลขไม่ถูก ให้หยุดตรงนี้ ตารางจริงยังไม่ถูกแตะต้อง
-- ---------------------------------------------------------------------
select
  count(*)                                                          as ทั้งหมด,
  count(distinct customer_code)                                     as รหัสไม่ซ้ำ,
  count(*) filter (where customer_code is null
                      or btrim(customer_code) = '')                 as ไม่มีรหัส,
  count(*) filter (where customer_name is null
                      or btrim(customer_name) = '')                 as ไม่มีชื่อ,
  count(*) filter (where start_contact_date is not null
                     and extract(day from start_contact_date) > 12) as วันเกิน12,
  count(*) filter (where start_contact_date < date '1990-01-01'
                      or start_contact_date > current_date)         as วันที่เป็นไปไม่ได้
from customer_import;

-- อ่านผล:
--   ทั้งหมด = รหัสไม่ซ้ำ            -> ดี · ถ้าไม่เท่ากัน แปลว่าไฟล์มีรหัสซ้ำในตัวเอง
--   ไม่มีรหัส / ไม่มีชื่อ = 0        -> ดี · ถ้ามี แปลว่า CSV ถูกตัดบรรทัดผิด
--   วันเกิน12 ราว 60% ของทั้งหมด   -> ดี · ถ้าได้ 0 แปลว่าวันกับเดือนสลับกันทั้งไฟล์
--   วันที่เป็นไปไม่ได้ = 0          -> ดี · ถ้ามี แปลว่าเลขซีเรียลของ Excel ถูกอ่านเป็นวันที่


-- ---------------------------------------------------------------------
-- ขั้นที่ 4 · รวมเข้าตารางจริง — เพิ่มใหม่และอัปเดตของเดิมในคำสั่งเดียว
--            ลูกค้าที่หายไปจากไฟล์จะยังอยู่ในตารางจริง ไม่ถูกลบ
--            (ตั้งใจ — ใบงานเก่าอ้างถึงลูกค้าเหล่านั้นอยู่)
-- ---------------------------------------------------------------------
insert into customer (customer_code, customer_name, sales_person, start_contact_date)
select btrim(customer_code), btrim(customer_name), btrim(sales_person), start_contact_date
from customer_import
where customer_code is not null and btrim(customer_code) <> ''
on conflict (customer_code) do update
  set customer_name      = excluded.customer_name,
      sales_person       = excluded.sales_person,
      start_contact_date = excluded.start_contact_date;


-- ---------------------------------------------------------------------
-- ขั้นที่ 5 · ดูผลแล้วล้างตารางพักทิ้ง
-- ---------------------------------------------------------------------
select count(*) as แถวในตารางจริงหลังนำเข้า from customer;

truncate customer_import;


-- ---------------------------------------------------------------------
--  เวอร์ชันของไฟล์นี้ — checkSupabase() อ่านค่านี้ไปเทียบกับที่โค้ดคาดหวัง
--  (นำเข้าข้อมูลลูกค้า — ไม่บังคับ รันเมื่อมีไฟล์ลูกค้าชุดใหม่)
--  ห้ามใช้คอมเมนต์บอกเวอร์ชันแทน เพราะอ่านกลับจากฐานข้อมูลไม่ได้
-- ---------------------------------------------------------------------
create or replace function sql_version_customer_import() returns text
  language sql immutable as $$ select 'customer_import-2026-09-26-a' $$;
revoke all on function sql_version_customer_import() from public, anon, authenticated;
grant execute on function sql_version_customer_import() to service_role;

-- บอก PostgREST ให้โหลดรายชื่อฟังก์ชันใหม่ ไม่งั้นของที่เพิ่งสร้างจะยังเรียกไม่ได้
notify pgrst, 'reload schema';
