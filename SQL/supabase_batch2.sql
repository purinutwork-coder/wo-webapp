-- =====================================================================
--  department_task_counts() — ยอดบนเมนูย่อยของทุกแผนก ในคำขอเดียว (SPEC 17.1 · 17.3)
--
--  ตัวเลขชุดนี้ติดไปกับ **ทุกหน้า** ในระบบ ไม่ใช่เฉพาะหน้าแผนก เพราะมันอยู่บนเมนู
--  จึงต้องเป็นคำขอเดียวเท่านั้น ไม่ใช่สี่คำขอเพื่อตัวเลขสี่ตัว
--
--  เดิมนับด้วยการอ่านงานของแผนกมาทั้งหมดแล้วนับในหน่วยความจำ ซึ่งเป็นหนึ่งคำขอ
--  เท่ากัน แต่ PostgREST คืนสูงสุด 1,000 แถวต่อคำขอและ **ไม่แจ้งความผิดพลาด**
--  เมื่อมีมากกว่านั้น · แผนกที่มีงานสะสมเกินพันใบ ตัวเลขบนเมนูจะค้างอยู่ที่เดิม
--  แบบเงียบ ๆ โดยไม่มีอะไรบอกเลยว่าทำไม (กฎข้อ 28)
--
--  ** ไม่รับอาร์กิวเมนต์เลย และคืนยอดครบทุกแผนก ** (SPEC 17.1)
--
--  หลักเดียวกับ dashboard_summary() — ฟังก์ชันใน Postgres ไม่รู้จักว่าใครเป็นใคร
--  มันคืนยอดครบทุกแผนกมาให้ แล้วชั้น Api คัดว่าผู้ใช้คนนั้นเห็นแผนกไหน จาก
--  getCurrentUser_() เท่านั้น · **การไม่รับเลย ดีกว่าการป้องกันไว้** เพราะมันทำให้
--  ค่าจากหน้าเว็บไม่มีทางเดินทางมาถึง SQL ได้ ไม่ใช่แค่ถูกกันไว้ที่ด่านใดด่านหนึ่ง
--
--  ของแถมคือก้อนดิบก้อนเดียวใช้ได้กับทุกคน จึงแคชร่วมกันทั้งระบบได้ตามกฎข้อ 30
--  (แคชเก็บก้อนก่อนคัด · การคัดตามสิทธิ์ทำใหม่ทุกคำขอ)
--
--  ** ต้องรัน supabase_schema.sql ฉบับล่าสุดก่อนไฟล์นี้ ** เพราะ checkSupabase()
--  อ่านรายชื่อของในฐานข้อมูลผ่าน db_objects() ซึ่งประกาศไว้ในไฟล์นั้น
--
--  วางทั้งไฟล์ใน SQL Editor แล้ว Run · รันซ้ำได้ไม่มีผลข้างเคียง
-- =====================================================================

/*
  ลบตัวที่รับพารามิเตอร์ทิ้งก่อนเสมอ

  `create or replace function` **เปลี่ยนลายเซ็นของฟังก์ชันไม่ได้** ถ้าเคยมี
  department_task_counts(text) อยู่ การสร้างตัวที่ไม่รับอาร์กิวเมนต์จะไม่ทับของเดิม
  แต่จะกลายเป็นฟังก์ชันสองตัวซ้อนกันคนละลายเซ็น · แล้ว PostgREST อาจเรียกตัวผิด
  ขึ้นกับรูปร่างของคำขอที่ส่งไป ซึ่งเป็นอาการที่หาสาเหตุยากที่สุดแบบหนึ่ง
  เพราะทั้งสองตัวทำงานได้ ไม่มี error ให้เห็น มีแต่ตัวเลขที่บางครั้งก็ถูกบางครั้งก็ผิด

  if exists เพื่อให้รันได้ทั้งกับฐานที่เคยรันฉบับก่อนและฐานที่ยังไม่เคยรันเลย
*/
drop function if exists department_task_counts(text);

create or replace function department_task_counts()
returns json
language sql
stable
as $$
  with today_th as (
    -- วันนี้ตามเวลาไทย ไม่ใช่วัน UTC · ระหว่างเที่ยงคืนถึงเจ็ดโมงเช้าตามเวลาไทย
    -- วัน UTC ยังเป็นเมื่อวาน ป้าย "งานวันนี้" จะว่างเปล่าทุกเช้าทั้งที่มีงานนัดไว้
    select to_char((now() at time zone 'Asia/Bangkok')::date, 'YYYY-MM-DD') as day
  ),

  /*
    ทุกแผนกต้องมีอยู่ในคำตอบเสมอ แม้ไม่มีงานสักใบ

    ถ้าปล่อยให้แผนกที่ไม่มีงานหายไปจากก้อน JSON ฝั่งโค้ดจะได้ undefined ซึ่งต่างจาก
    ศูนย์ (กฎข้อ 32) · แผนกที่ยังไม่เคยมีงานเลยต้องเห็นป้าย "0" ไม่ใช่เห็นป้ายหายไป
    แล้วเข้าใจว่าเมนูพัง · left join กับรายชื่อแผนกจึงจำเป็น ไม่ใช่ของเผื่อ
  */
  dept(name) as (
    select unnest(array['SERVICE', 'PROJECT', 'LAB'])
  ),

  /*
    **นับให้เสร็จตรงนี้ก่อน แล้วค่อยรวมเป็น JSON ที่ชั้นนอก**

    เอา count() ไปวางไว้ข้างใน json_object_agg() ตรง ๆ ไม่ได้ Postgres ปฏิเสธด้วย
    ERROR 42803 aggregate function calls cannot be nested · ตัวรวมสองชั้นต้องแยก
    เป็นคนละระดับของคำสั่งเสมอ คือนับทีละแผนกใน CTE นี้ แล้วให้ชั้นนอกรวมแถวของ
    CTE เป็นก้อนเดียว · json_build_object ไม่ใช่ตัวรวม จึงอยู่ข้างใน json_object_agg ได้
  */
  per_dept as (
    select
      dept.name as department,
      /*
       * งานวันนี้ — Visit_Start เก็บเป็นข้อความ 'YYYY-MM-DDTHH:mm' ตามเวลาไทยอยู่แล้ว
       * (กฎข้อ 23) วันที่จึงอ่านได้จากสิบตัวอักษรแรกตรง ๆ ไม่ต้องแปลงชนิดและไม่ต้อง
       * คำนวณเขตเวลา ซึ่งเป็นขั้นตอนที่ทำให้วันเลื่อนมาตลอด
       *
       * ใช้ left() ไม่ใช่ like เพราะต้องให้ผลตรงกับ isTaskVisitingOn_ ฝั่ง JavaScript
       * ที่เทียบสิบตัวอักษรแรกเป๊ะ ๆ เหมือนกัน
       */
      count(t.*) filter (
        where t.status in ('PENDING_ACCEPT', 'IN_PROGRESS', 'RETURNED')
          and t.visit_start is not null
          and left(t.visit_start, 10) = (select day from today_th)) as today,
      count(t.*) filter (where t.status = 'PENDING_ACCEPT')                  as pending,
      count(t.*) filter (where t.status in ('IN_PROGRESS', 'RETURNED'))      as active,
      count(t.*) filter (where t.status in ('COMPLETED', 'CANCELLED'))       as done
    from dept
    left join department_task t on t.department = dept.name
    group by dept.name
  )

  select json_object_agg(department, json_build_object(
    'today',   today,
    'pending', pending,
    'active',  active,
    'done',    done
  ))
  from per_dept;
$$;

comment on function department_task_counts() is
  'ยอดบนเมนูย่อยของทุกแผนกในคำขอเดียว · ไม่รับอาร์กิวเมนต์โดยตั้งใจ (SPEC 17.1) ชั้น Api คัดจาก getCurrentUser_() ว่าใครเห็นแผนกไหน';

-- service_role เท่านั้นที่เรียกได้ เหมือนทุกอย่างในระบบนี้
revoke all on function department_task_counts() from public, anon, authenticated;
grant execute on function department_task_counts() to service_role;

-- ---------------------------------------------------------------------
-- index ที่ยอดชุดนี้พึ่ง — มีอยู่แล้วทั้งคู่ ไม่ต้องสร้างใหม่
--   idx_dt_dept  (department, status)      -> สามมุมมองที่คัดด้วยสถานะ
--   idx_dt_visit (department, visit_start) -> มุมมองงานวันนี้
--                สร้างไว้ใน supabase_batch1.sql
-- ---------------------------------------------------------------------

-- ตรวจว่าใช้ได้จริง — ควรได้ JSON ก้อนเดียวที่มีครบทั้งสามแผนก แผนกละสี่คีย์
select department_task_counts();

-- และต้องไม่มีฟังก์ชันตัวที่รับพารามิเตอร์หลงเหลืออยู่ — ควรได้แถวเดียว pronargs = 0
select p.proname, p.pronargs
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'department_task_counts';


-- ---------------------------------------------------------------------
--  เวอร์ชันของไฟล์นี้ — checkSupabase() อ่านค่านี้ไปเทียบกับที่โค้ดคาดหวัง
--  (ตัวนับงานของแผนกบนเมนูย่อย · ไม่รับพารามิเตอร์ · นับใน CTE ก่อนรวมเป็น JSON)
--  ห้ามใช้คอมเมนต์บอกเวอร์ชันแทน เพราะอ่านกลับจากฐานข้อมูลไม่ได้
-- ---------------------------------------------------------------------
create or replace function sql_version_batch2() returns text
  language sql immutable as $$ select 'batch2-2026-09-26-c' $$;
revoke all on function sql_version_batch2() from public, anon, authenticated;
grant execute on function sql_version_batch2() to service_role;

-- บอก PostgREST ให้โหลดรายชื่อฟังก์ชันใหม่ ไม่งั้นของที่เพิ่งสร้างจะยังเรียกไม่ได้
notify pgrst, 'reload schema';
