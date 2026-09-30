/*
  กองที่ 0 — เครื่องวัด ไม่ใช่ของที่ย้ายมา

  Worker ตัวนี้ไม่ได้เขียนอะไรลงฐานข้อมูลเลย อ่านอย่างเดียว และไม่มีเส้นทางไหน
  ที่แก้ข้อมูลได้ · มีไว้ตอบสองคำถามด้วยตัวเลขจริง

    /speed  อ่าน Supabase เรียงกัน 6 ครั้ง แบบเดียวกับหน้าแผนกวันนี้
    /hash   ต้นทุน CPU ของการตรวจรหัสผ่านหนึ่งครั้ง ด้วยวิธีของระบบเดิม

  กุญแจไม่เคยอยู่ในไฟล์นี้ มาจากความลับฝั่ง Cloudflare เท่านั้น
*/

import { createHash } from 'node:crypto';
import puppeteer from '@cloudflare/puppeteer';

/**
 * หน้าทดสอบภาษาไทย — ตัวอักษรที่หักได้ง่ายที่สุดอยู่ครบ
 *
 * เลือกคำที่มี **วรรณยุกต์วางบนสระบน** ซึ่งเป็นจุดที่ฟอนต์หรือตัวจัดวางที่ทำไม่ครบ
 * จะพังให้เห็นทันที เช่น "เพี้ยน" (สระอี + ไม้โท) "ที่" (สระอี + ไม้เอก)
 * "ผู้" (สระอู + ไม้โท) · บวกสระล่างอย่าง "ดุ" และตัวที่มีเชิงอย่าง "ญ ฐ"
 *
 * ถ้าฟอนต์ไทยไม่มีในเครื่องที่เรนเดอร์ จะได้กล่องสี่เหลี่ยมแทนตัวอักษร
 * ซึ่งเป็นคำตอบที่ต้องรู้ให้ได้ในกองนี้ ไม่ใช่ไปเจอตอนย้ายจริง
 */
const THAI_TEST_HTML = `<!doctype html>
<html lang="th"><head><meta charset="utf-8">
<style>
  body { font-family: "Noto Sans Thai", "Sarabun", "Tahoma", sans-serif;
         padding: 28px; color: #111; }
  h1 { font-size: 22px; margin: 0 0 14px; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { border: 1px solid #999; padding: 7px 9px; text-align: left; }
  th { background: #eee; }
  .big { font-size: 30px; letter-spacing: .5px; margin: 16px 0; }
  .note { font-size: 12px; color: #555; margin-top: 18px; }
</style></head><body>
  <h1>ใบสั่งงาน — ทดสอบการวางรูปอักษรไทย</h1>
  <div class="big">เพี้ยน · ที่ · ผู้ · ปั๊ม · ญี่ปุ่น · ฐานข้อมูล · กุ๊กกิ๊ก</div>
  <table>
    <tr><th>หัวข้อ</th><th>ค่า</th></tr>
    <tr><td>เลขที่ใบสั่งงาน</td><td>WO-2609-0042</td></tr>
    <tr><td>ผู้เปิดใบงาน</td><td>ปุริณัฐ ชัยนริศ</td></tr>
    <tr><td>แผนกผู้รับผิดชอบ</td><td>แผนก Service</td></tr>
    <tr><td>สถานะ</td><td>รอผู้อนุมัติตรวจสอบ</td></tr>
    <tr><td>อาการที่แจ้ง</td><td>เครื่องวัดค่าเพี้ยน ผู้ใช้แจ้งว่าตัวเลขไม่นิ่ง</td></tr>
    <tr><td>วันที่นัดเข้างาน</td><td>๓๐ กันยายน ๒๕๖๙ เวลา ๐๙:๓๐ น.</td></tr>
  </table>
  <div class="note">
    บรรทัดนี้ไว้ดูสระล่างและเชิงอักษร: ดุ ปู ญาติ ฐาน ฏีกา กระทรวงอุตสาหกรรม
  </div>
</body></html>`;

/** จำนวนรอบที่ระบบเดิมใช้จริง — อ่านมาจาก PASSWORD_ITERATIONS ใน 00_Config.gs */
const PASSWORD_ITERATIONS = 5000;

/** จำนวนครั้งที่หน้าแผนกวันนี้ต้องอ่านฐานข้อมูลต่อการเปิดหนึ่งหน้า */
const READS_PER_PAGE = 6;

/**
 * แฮชรหัสผ่านด้วยวิธีเดียวกับระบบเดิมเป๊ะ
 * ตั้งต้นจาก "เกลือ:รหัสผ่าน" แล้วแต่ละรอบเอาผลฐานสิบหกของรอบก่อนไปแฮชต่อ
 */
function hashPassword(password, salt, iterations) {
  let value = salt + ':' + password;
  for (let i = 0; i < iterations; i++) {
    value = createHash('sha256').update(value, 'utf8').digest('hex');
  }
  return value;
}

/** ยิงอ่านหนึ่งครั้ง แล้วคืนเวลาที่ใช้ — ไม่คืนข้อมูลที่อ่านได้ออกไป */
async function readOnce(env, path) {
  const started = Date.now();
  const response = await fetch(env.SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      'apikey': env.SUPABASE_KEY,
      'Authorization': 'Bearer ' + env.SUPABASE_KEY,
      'Accept': 'application/json',
      'Prefer': 'count=exact'
    }
  });
  // อ่านเนื้อให้จบจริง ไม่งั้นเวลาที่วัดได้จะเป็นแค่เวลาถึง header
  const body = await response.text();
  return {
    ms: Date.now() - started,
    status: response.status,
    bytes: body.length,
    rows: response.headers.get('content-range') || ''
  };
}

/**
 * ด่านรหัสลับ — ทุกทางต้องผ่าน ไม่มีข้อยกเว้น
 *
 * URL ของ workers.dev เปิดถึงได้จากทั้งอินเทอร์เน็ต · ถ้าไม่กั้น ทาง /hash
 * จะกลายเป็นเครื่องเผา CPU ให้ใครก็ได้ใช้ฟรี และ /speed จะกลายเป็นเครื่องยิง
 * ฐานข้อมูลของเราให้คนอื่นใช้
 *
 * ปิดตายเมื่อยังไม่ได้ตั้งรหัส (fail closed) · Worker ที่เผลอ deploy โดยยังไม่มี
 * ความลับ ต้องไม่ยอมทำงานเลย ดีกว่าเปิดรับทุกคนเงียบ ๆ
 *
 * @param {Request} request คำขอที่เข้ามา
 * @param {Object} env ความลับและตัวแปรของ Worker
 * @return {Response|null} คำตอบปฏิเสธ หรือ null เมื่อผ่าน
 */
function refuseUnlessAllowed(request, env) {
  const expected = env.PROOF_TOKEN || '';
  if (!expected) {
    return new Response('ยังไม่ได้ตั้งรหัสลับของเครื่องวัด — ปิดไว้ก่อน\n', { status: 503 });
  }

  const url = new URL(request.url);
  const given = request.headers.get('x-proof-token') || url.searchParams.get('t') || '';

  /*
   * เทียบแบบใช้เวลาเท่ากันทุกครั้ง ไม่ให้เดาทีละตัวอักษรจากเวลาที่ใช้
   * เครื่องวัดก็ต้องไม่สอนวิธีเจาะตัวเอง
   */
  if (given.length !== expected.length) return new Response('ไม่ได้รับอนุญาต\n', { status: 403 });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return new Response('ไม่ได้รับอนุญาต\n', { status: 403 });

  return null;
}

export default {
  async fetch(request, env) {
    const denied = refuseUnlessAllowed(request, env);
    if (denied) return denied;

    const url = new URL(request.url);
    const where = {
      colo: request.cf ? request.cf.colo : '(ไม่รู้)',
      country: request.cf ? request.cf.country : '(ไม่รู้)',
      city: request.cf ? request.cf.city : '(ไม่รู้)'
    };

    if (url.pathname === '/pdf' || url.pathname === '/png') {
      /*
       * ออกเอกสารจาก HTML ด้วยเบราว์เซอร์จริงของ Cloudflare
       *
       * มีสองทางออกโดยตั้งใจ — PDF ไว้ให้เจ้าของระบบเปิดดูด้วยตา และ PNG ไว้ให้
       * ตรวจได้โดยไม่ต้องเปิดโปรแกรมอ่าน PDF · "สร้างไฟล์ได้" กับ "ตัวหนังสืออ่านออก"
       * เป็นคนละคำถาม และคำถามหลังตอบได้ด้วยการมองเท่านั้น
       */
      const wantPdf = url.pathname === '/pdf';
      const started = Date.now();

      const browser = await puppeteer.launch(env.BROWSER);
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 900, height: 1200 });
        await page.setContent(THAI_TEST_HTML, { waitUntil: 'networkidle0' });

        // ชื่อฟอนต์ที่เบราว์เซอร์เลือกใช้จริง ไม่ใช่ชื่อที่เราขอไป
        const fonts = await page.evaluate(() => {
          const probe = document.querySelector('.big');
          return {
            ขอไป: getComputedStyle(probe).fontFamily,
            ความกว้างของข้อความ: Math.round(probe.getBoundingClientRect().width),
            ความสูงของข้อความ: Math.round(probe.getBoundingClientRect().height)
          };
        });

        const bytes = wantPdf
          ? await page.pdf({ format: 'A4', printBackground: true })
          : await page.screenshot({ type: 'png', fullPage: true });

        const ms = Date.now() - started;
        return new Response(bytes, {
          headers: {
            'content-type': wantPdf ? 'application/pdf' : 'image/png',
            'x-took-ms': String(ms),
            'x-font-asked': fonts.ขอไป,
            'x-text-width': String(fonts.ความกว้างของข้อความ),
            'x-text-height': String(fonts.ความสูงของข้อความ),
            'cache-control': 'no-store'
          }
        });
      } finally {
        // ต้องปิดเสมอ ไม่งั้นโควตาเบราว์เซอร์ถูกกินค้างไว้จนเต็ม
        await browser.close();
      }
    }

    if (url.pathname === '/hash') {
      /*
       * วัดต้นทุน CPU ของการตรวจรหัสผ่าน · ใช้รหัสและเกลือสมมติล้วน
       * ไม่แตะทะเบียนผู้ใช้จริงแม้แต่แถวเดียว
       *
       * **นาฬิกาในตัว Worker วัดเรื่องนี้ไม่ได้** · Date.now() ไม่เดินระหว่างการ
       * คำนวณที่ไม่มี I/O ซึ่งเป็นมาตรการกัน Spectre ของแพลตฟอร์ม · เวลาที่อ่านได้
       * จึงเป็น 0 เสมอไม่ว่าจะวนกี่รอบ
       *
       * ทางที่ใช้ได้คือให้ทำงานซ้ำ K ครั้งแล้ววัดจากฝั่งผู้เรียก · เวลาเครือข่าย
       * เท่ากันทุกครั้ง พอเทียบ K น้อยกับ K มาก ส่วนต่างที่เหลือคือเวลาคำนวณล้วน
       */
      const repeat = Math.min(200, Math.max(1, Number(url.searchParams.get('repeat')) || 1));
      let digest = '';
      for (let r = 0; r < repeat; r++) {
        digest = hashPassword('Ab3!xyzQ', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', PASSWORD_ITERATIONS);
      }

      return Response.json({
        รอบที่วนต่อการตรวจหนึ่งครั้ง: PASSWORD_ITERATIONS,
        ตรวจกี่ครั้งในคำขอนี้: repeat,
        นาฬิกาในตัว_ms: 0,
        หมายเหตุ: 'Date.now() ไม่เดินระหว่างคำนวณ ต้องวัดจากฝั่งผู้เรียก',
        // ตรงกับค่าที่วัดในเครื่อง แปลว่า Worker คำนวณได้ค่าเดียวกันจริง
        ค่าที่ได้ขึ้นต้นด้วย: digest.slice(0, 24),
        รันที่: where
      }, { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/speed') {
      /*
       * กองนี้ใช้ anon key เท่านั้น ไม่ใช้ service role
       *
       * ตารางเปิด RLS โดยไม่มี policy · anon จึงเดินทางไปถึงฐานข้อมูลครบทุกขั้น
       * แล้วได้ผลว่างกลับมา ซึ่งวัดเวลาได้เท่ากับของจริงทุกประการ · และ anon key
       * ออกแบบมาให้เปิดเผยได้ หลุดแล้วไม่เสียหาย ต่างจาก service role ที่เปิดประตูทั้งบาน
       */
      if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
        return Response.json({
          ผิดพลาด: 'ยังไม่ได้ตั้งค่า SUPABASE_URL หรือ SUPABASE_KEY ในความลับของ Worker',
          รันที่: where
        }, { status: 500 });
      }

      /*
       * รูปร่างเดียวกับหน้าแผนก — อ่านทีละหน้า มีตัวกรองและการเรียง
       * ยิงเรียงกัน ไม่ใช่พร้อมกัน เพราะของเดิมก็เรียงกัน การวัดจึงต้องเทียบกันได้
       */
      const table = env.SUPABASE_TABLE || 'department_task';
      const path = table +
        '?select=task_id,wo_id,department,status,visit_start' +
        '&department=eq.SERVICE' +
        '&order=wo_id.desc' +
        '&limit=20';

      const each = [];
      const started = Date.now();
      for (let i = 0; i < READS_PER_PAGE; i++) {
        each.push(await readOnce(env, path));
      }
      const total = Date.now() - started;

      return Response.json({
        อ่านกี่ครั้ง: READS_PER_PAGE,
        รวม_ms: total,
        เฉลี่ยต่อครั้ง_ms: Math.round(total / READS_PER_PAGE),
        แต่ละครั้ง: each,
        ของเดิมวัดไว้: { คำขอเดียว_ms: '423-485', หกครั้งเรียงกัน_ms: 2271 },
        รันที่: where
      }, { headers: { 'cache-control': 'no-store' } });
    }

    return Response.json({
      นี่คืออะไร: 'เครื่องวัดของกองที่ 0 — ไม่ได้ย้ายระบบมา และไม่เขียนอะไรลงฐานข้อมูล',
      ทางที่เปิดให้: ['/speed', '/hash'],
      รันที่: where
    }, { headers: { 'cache-control': 'no-store' } });
  }
};
