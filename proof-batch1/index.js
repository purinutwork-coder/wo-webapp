/*
  เครื่องวัดของกองที่ 1 ข้อ 2 — fetch บน Worker ต่างจาก UrlFetchApp ตรงไหน

  ของจำลองที่เราใช้อยู่ถูกสร้างจากพฤติกรรมของ UrlFetchApp · ถ้ายกมาใช้กับ fetch
  ตรง ๆ โดยไม่วัดก่อน ของจำลองจะเขียวอยู่บนพฤติกรรมที่ไม่มีอยู่จริง ซึ่งแย่กว่า
  ไม่มีของจำลองเลย เพราะมันให้ความมั่นใจที่ผิด

  ทุกทางมีรหัสลับกำกับ และ Worker ตัวนี้ต้องถูกลบทิ้งทันทีที่วัดเสร็จ

  **ความลับที่ต้องตั้งก่อนวัด** — `PROOF_TOKEN` (ด่านของเครื่องวัด) และ
  `SUPABASE_ANON_KEY` · **ห้ามใส่ service_role เด็ดขาด** (CLAUDE.md ข้อ 22)
  anon key จำเป็นเพราะเคสสำคัญที่สุดของข้อ 1 คือเคสที่กุญแจผ่านประตูหน้าเข้าไปแล้ว
  ถูกปฏิเสธที่ชั้น GRANT (`42501`) ซึ่งกุญแจปลอมทำให้เกิดไม่ได้ · anon key เองอ่าน
  ข้อมูลไม่ได้อยู่แล้วเพราะ RLS ไม่มี policy สักข้อ

  เป้าหมายที่ยิงใส่เป็นตัวมันเองเกือบทั้งหมด เพื่อไม่ต้องพึ่งบริการของคนอื่น
  ในการสร้าง 5xx ที่ควบคุมได้ การหน่วงเวลา และ body ขนาดใหญ่
*/

/** ที่อยู่ของ PostgREST ที่ใช้จริง — ใช้แค่ให้มันปฏิเสธ ไม่ได้อ่านข้อมูลอะไร */
const SUPABASE_REF = 'gcljmzffjpgxwxftxmcs';
const REST = `https://${SUPABASE_REF}.supabase.co/rest/v1/`;

/* ---------------------------------------------------------------------------
 * ด่านรหัสลับ — เหมือนกองที่ 0 ทุกประการ
 * --------------------------------------------------------------------------- */

function refuseUnlessAllowed(request, env) {
  const expected = env.PROOF_TOKEN || '';
  if (!expected) {
    return new Response('ยังไม่ได้ตั้งรหัสลับของเครื่องวัด — ปิดไว้ก่อน\n', { status: 503 });
  }
  const url = new URL(request.url);
  const given = request.headers.get('x-proof-token') || url.searchParams.get('t') || '';

  // เทียบแบบใช้เวลาเท่ากันทุกครั้ง เครื่องวัดต้องไม่สอนวิธีเจาะตัวเอง
  if (given.length !== expected.length) return new Response('ไม่ได้รับอนุญาต\n', { status: 403 });
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return new Response('ไม่ได้รับอนุญาต\n', { status: 403 });
  return null;
}

/* ---------------------------------------------------------------------------
 * ตัวช่วยเล่าผล
 * --------------------------------------------------------------------------- */

/**
 * เล่าสิ่งที่ fetch คืนมาหรือโยนออกมา ให้อ่านได้ทั้งสองกรณีในรูปเดียวกัน
 *
 * จุดสำคัญคือต้องแยกให้ออกว่า "คืน Response ที่บอกว่าพัง" กับ "โยน" ต่างกัน
 * เพราะกฎข้อ 24 ให้ลองใหม่ได้เฉพาะ 5xx กับ timeout ส่วน 4xx ห้ามลองใหม่
 * ถ้าแยกไม่ออก เราจะลองใหม่กับคำขอที่ไม่มีวันสำเร็จ หรือไม่ลองกับที่ควรลอง
 */
async function observe(label, run) {
  const started = Date.now();
  try {
    const res = await run();
    const out = {
      label,
      ผล: 'คืน Response',
      status: res.status,
      ok: res.ok,
      ms: Date.now() - started,
      contentType: res.headers.get('content-type') || '(ไม่มี)'
    };
    try {
      const text = await res.text();
      out.bodyอ่านได้ = true;
      out.bodyยาว = text.length;
      out.bodyต้น = text.slice(0, 300);
      try {
        const asJson = JSON.parse(text);
        out.เป็นJSON = true;
        out.คีย์ = Object.keys(asJson);
        /*
         * คำถามของข้อ 1 คือ "แกะรหัสของ Postgres ออกมาได้จริงไหม" ซึ่งตอบได้ด้วยช่อง
         * ที่มีค่าหรือเป็น null เท่านั้น · ปล่อยให้คนไปอ่านเอาเองจาก bodyต้น 300 ตัวอักษร
         * แปลว่าคำตอบขึ้นกับว่าคนอ่านตาดีแค่ไหน ซึ่งไม่ใช่การวัด
         */
        out.postgrest = {
          code: asJson.code === undefined ? null : asJson.code,
          message: asJson.message === undefined ? null : asJson.message,
          details: asJson.details === undefined ? null : asJson.details,
          hint: asJson.hint === undefined ? null : asJson.hint
        };
        out.แกะcodeได้ = asJson.code !== undefined;
        out.code = asJson.code;
        out.message = asJson.message;
        out.hint = asJson.hint;
        out.details = asJson.details;
      } catch (e) {
        out.เป็นJSON = false;
      }
    } catch (e) {
      out.bodyอ่านได้ = false;
      out.bodyพังเพราะ = String(e && e.message);
    }
    return out;
  } catch (e) {
    return {
      label,
      ผล: 'โยนออกมา',
      ms: Date.now() - started,
      ชนิด: e && e.constructor ? e.constructor.name : typeof e,
      ชื่อ: e && e.name,
      ข้อความ: e && e.message,
      // สาเหตุซ้อนข้างใน คือที่เดียวที่บอกได้ว่าเป็น DNS หรือปฏิเสธการต่อ
      สาเหตุซ้อน: e && e.cause ? String(e.cause && e.cause.message || e.cause) : null,
      stackต้น: e && e.stack ? String(e.stack).split('\n')[0] : null
    };
  }
}

function say(body) {
  return new Response(JSON.stringify(body, null, 2) + '\n',
    { headers: { 'content-type': 'application/json; charset=utf-8' } });
}

/* ---------------------------------------------------------------------------
 * เป้าที่ควบคุมได้ — Durable Object ไม่ใช่การยิง fetch ใส่ตัวเอง
 *
 * **ยิง fetch ใส่ Worker ตัวเองไม่ได้** · Cloudflare ปฏิเสธด้วย `404 error code: 1042`
 * ("Worker tried to fetch from another Worker on the same zone") · วัดเจอจริง
 * 01-10-2026 — ข้อ 3, 5, 6 ได้ 1042 ทุกทาง จึงไม่มีคำตอบสักข้อ
 *
 * `wrangler dev` ในเครื่องยอมให้ยิงใส่ตัวเองสบาย ๆ ข้อจำกัดนี้จึงมองไม่เห็นเลย
 * จนกว่าจะ deploy จริง — เป็นครั้งที่สามในวันเดียวที่ในเครื่องผ่านแต่ของจริงไม่ผ่าน
 *
 * Durable Object เรียกผ่าน stub ซึ่งเป็นการเรียกภายใน ไม่ใช่คำขอ HTTP ที่วิ่งออกไป
 * หา zone เดิม จึงไม่ควรชนข้อห้ามนั้น · **ยังไม่เคยพิสูจน์ ต้องดูผลรอบนี้**
 *
 * ผลพลอยได้ที่สำคัญกว่า — ตัวนับของข้อ 5 ย้ายมาอยู่ใน object เดียวที่เรียกด้วยชื่อ
 * ทุกคำขอจึงไปถึงตัวเดียวกันแน่นอน · ปัญหา "สามคำขอตกคนละ isolate" หายไปทั้งหมด
 * ไม่ใช่แค่ถูกตรวจจับได้
 * --------------------------------------------------------------------------- */

/*
 * ข้อความที่ทางค้างจะตอบกลับมาเมื่อมันค้างจนครบเวลาได้สำเร็จ
 *
 * ถ้าไม่มีเครื่องหมายนี้ เราจะแยกไม่ออกระหว่างสองเรื่องที่ต่างกันสิ้นเชิง
 * — `fetch` ไม่มีเพดานเวลาในตัว จึงรอจนปลายทางตอบ
 * — ฝั่งที่ค้างถูกแพลตฟอร์มฆ่าทิ้งแล้วตอบ 5xx กลับมา ซึ่ง `fetch` ก็ "คืน Response" เหมือนกัน
 * สองอย่างนี้ให้คำตอบตรงข้ามกันในการออกแบบ `httpSend_` แต่หน้าตาของผลเหมือนกันมาก
 */
const SLOW_DONE_MARK = 'ค้างครบแล้วตอบเอง';

export class ProbeTarget {
  constructor(state, env) {
    this.state = state;
    // อยู่ในหน่วยความจำของ object นี้ · ไม่ต้องเขียนลงที่เก็บ เพราะต้องการแค่
    // ช่วงชีวิตของการวัดหนึ่งรอบ และการเขียนจะเพิ่มตัวแปรที่ไม่ได้ถูกถาม
    this.hits = 0;
  }

  async fetch(request) {
    const url = new URL(request.url);

    switch (url.pathname) {
      /** ตอบทันที ใช้เป็นเป้าราคาถูกตอนนับเพดานจำนวนคำขอ */
      case '/ping':
        return new Response('ok');

      /** ตอบ 503 พร้อม body — ใช้แยก "5xx ของปลายทางจริง" ออกจาก "ต่อไม่ติด" */
      case '/503':
        return new Response(JSON.stringify({ message: 'จำลองฝั่งโน้นล่ม', code: '53300' }),
          { status: 503, headers: { 'content-type': 'application/json' } });

      /** ค้างไว้ตามจำนวนวินาทีที่สั่ง แล้วค่อยตอบ — วัดว่า fetch มีเพดานเวลาในตัวไหม */
      case '/slow': {
        const seconds = Number(url.searchParams.get('s') || '30');
        await new Promise((r) => setTimeout(r, seconds * 1000));
        // หลักฐานว่าฝั่งที่ค้าง **ค้างจนครบแล้วตอบเอง** ไม่ใช่ถูกใครฆ่ากลางทาง
        return new Response(SLOW_DONE_MARK + ' ' + seconds);
      }

      /** body ใหญ่ ๆ ที่ตั้งใจจะไม่อ่านให้จบ */
      case '/big': {
        const mb = Number(url.searchParams.get('mb') || '4');
        const chunk = 'ก'.repeat(64 * 1024);
        const stream = new ReadableStream({
          start(controller) {
            const total = Math.ceil((mb * 1024 * 1024) / (64 * 1024));
            for (let i = 0; i < total; i++) controller.enqueue(new TextEncoder().encode(chunk));
            controller.close();
          }
        });
        return new Response(stream, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }

      /** นับว่าถูกเรียกไปกี่ครั้ง แล้วตอบ 500 — ใช้ดูว่า Worker ลองใหม่ให้เองไหม */
      case '/counted':
        this.hits++;
        return new Response(JSON.stringify({ ครั้งที่: this.hits }), { status: 500 });

      case '/hits':
        return new Response(JSON.stringify({ hits: this.hits }));

      default:
        return new Response('ไม่มีทางนี้ในเป้า\n', { status: 404 });
    }
  }
}

/**
 * ยิงไปที่เป้า — เป้าเดียวเสมอ เรียกด้วยชื่อคงที่
 *
 * ชื่อคงที่สำคัญ เพราะข้อ 5 ต้องอ่านตัวนับก่อนและหลังจาก **object ตัวเดียวกัน**
 * ถ้าใช้ `newUniqueId()` จะได้ object ใหม่ทุกครั้งแล้วตัวนับเริ่มที่ศูนย์เสมอ
 *
 * ชื่อโดเมนใน URL ไม่มีความหมาย stub ไม่ได้เอาไปใช้หาปลายทาง แต่ `new URL()`
 * ข้างใน DO ต้องการ URL ที่สมบูรณ์ จึงต้องใส่อะไรสักอย่างที่ไม่มีวันเป็นของจริง
 */
function hitTarget(env, path) {
  if (!env.PROBE) {
    throw new Error('ยังไม่ได้ผูก Durable Object ชื่อ PROBE — ต้อง deploy พร้อม migration ก่อน');
  }
  const stub = env.PROBE.get(env.PROBE.idFromName('เป้าเดียวของการวัดทุกรอบ'));
  return stub.fetch('https://probe.invalid' + path);
}

/* ---------------------------------------------------------------------------
 * การวัดแต่ละข้อ
 * --------------------------------------------------------------------------- */

/**
 * ข้อ 1 — 4xx อ่าน body ได้ไหม และรหัสของ Postgres มาครบหรือไม่
 *
 * **เคสที่สำคัญที่สุดคือเคสที่ต้องใช้ anon key ที่ใช้ได้จริง** · กองที่ 0 เจอว่า
 * คำขอได้ `401` ทั้งที่สาเหตุจริงคือ `42501 permission denied` ซึ่งอยู่ใน body
 * ไม่ใช่ใน status · เคสนั้นเกิดได้เฉพาะเมื่อกุญแจ **ผ่านประตูหน้าเข้าไปแล้ว**
 * แล้วถูกปฏิเสธที่ชั้น GRANT ของ Postgres
 *
 * กุญแจที่ใช้ไม่ได้ถูกปฏิเสธที่ประตูหน้า (Kong) ซึ่งตอบด้วย body คนละรูปแบบ
 * และไม่มี `code` ของ Postgres อยู่เลย · **วัดด้วยกุญแจปลอมแล้วสรุปว่าแกะ code ได้
 * คือการตอบคำถามที่ไม่ได้ถาม** ซึ่งเป็นกับดักเดียวกับข้อ 27 ในอีกเสื้อหนึ่ง
 *
 * anon key อ่านข้อมูลไม่ได้อยู่แล้วเพราะ RLS ไม่มี policy สักข้อ (SPEC 22.2)
 * การใส่มันที่นี่จึงไม่ได้เปิดสิทธิ์อะไรให้เครื่องวัด · และห้ามใส่ service_role เด็ดขาด
 */
async function measureBody4xx(env) {
  const results = [];

  const anon = env.SUPABASE_ANON_KEY || '';
  if (anon) {
    results.push(await observe('anon key ที่ใช้ได้จริง — เคส 42501 ของกองที่ 0',
      () => fetch(REST + 'work_order?select=*', {
        headers: { apikey: anon, authorization: 'Bearer ' + anon }
      })));
  } else {
    results.push({
      label: 'anon key ที่ใช้ได้จริง — เคส 42501 ของกองที่ 0',
      ผล: 'ไม่ได้วัด',
      เพราะ: 'ยังไม่ได้ตั้งความลับ SUPABASE_ANON_KEY — เคสสำคัญที่สุดของข้อ 1 จึงยังไม่มีคำตอบ',
      ห้ามสรุปว่า: 'ข้อ 1 ผ่าน'
    });
  }

  // ไม่ส่งกุญแจเลย — PostgREST ตอบ 401 พร้อม body ที่เป็น JSON
  results.push(await observe('ไม่ส่ง apikey เลย', () => fetch(REST + 'work_order?select=*')));

  // กุญแจผิด — คนละเส้นทางกับ "ไม่มีกุญแจ"
  results.push(await observe('ส่ง apikey ที่ใช้ไม่ได้', () => fetch(REST + 'work_order?select=*', {
    headers: { apikey: 'ไม่ใช่กุญแจจริง', authorization: 'Bearer ไม่ใช่กุญแจจริง' }
  })));

  // ตารางที่ไม่มีอยู่ — ดูว่าได้ 404 หรือ 401 มาก่อน
  results.push(await observe('ตารางที่ไม่มีอยู่จริง',
    () => fetch(REST + 'ตารางที่ไม่มีอยู่?select=*')));

  // ที่อยู่ผิดรูป — ให้ PostgREST บ่นเรื่องไวยากรณ์
  results.push(await observe('เงื่อนไขผิดไวยากรณ์',
    () => fetch(REST + 'work_order?select=*&id=eq.')));

  return results;
}

/** ข้อ 2 — ความล้มเหลวทางเครือข่ายหน้าตาเป็นอะไร และแยกจาก 5xx ด้วยอะไร */
async function measureNetworkFailure(env) {
  const results = [];

  results.push(await observe('ชื่อโดเมนที่ไม่มีอยู่จริง',
    () => fetch('https://ไม่มีโดเมนนี้จริง-' + Date.now() + '.example/')));

  results.push(await observe('โดเมนที่มีอยู่แต่พอร์ตไม่เปิด',
    () => fetch('https://' + SUPABASE_REF + '.supabase.co:8443/')));

  results.push(await observe('ใบรับรองไม่ตรงกับชื่อ',
    () => fetch('https://expired.badssl.com/')));

  // 5xx ที่ควบคุมได้ ยิงใส่ตัวเอง — ต้องได้ Response ไม่ใช่การโยน
  results.push(await observe('5xx จริงจากปลายทางที่ยังตอบอยู่',
    () => hitTarget(env, '/503')));

  return results;
}

/** ข้อ 3 — fetch มีเพดานเวลาในตัวหรือไม่ */
async function measureTimeout(env, url) {
  const wait = Number(url.searchParams.get('s') || '35');
  const results = [];

  const ปล่อยค้าง = await observe('ปล่อยให้ค้าง ' + wait + ' วินาที ไม่ใส่เพดานเอง',
    () => hitTarget(env, '/slow?s=' + wait));

  // แยกให้ขาดว่าใครเป็นคนจบรอบนี้ ไม่ใช่ปล่อยให้คนอ่านเดาจากตัวเลข ms
  if (ปล่อยค้าง.ผล === 'คืน Response') {
    const ครบเอง = String(ปล่อยค้าง.bodyต้น || '').indexOf(SLOW_DONE_MARK) !== -1;
    ปล่อยค้าง.ใครจบรอบนี้ = ครบเอง
      ? 'ฝั่งที่ค้างตอบเองหลังครบ ' + wait + ' วินาที — fetch รอจนจบ ไม่มีเพดานในตัวที่สั้นกว่านี้'
      : 'ไม่ใช่ฝั่งที่ค้าง — ได้ Response ที่ไม่มีเครื่องหมายว่าค้างครบ แปลว่ามีใครฆ่ากลางทาง ดู status';
    ปล่อยค้าง.ขอให้ค้างวินาที = wait;
  }
  results.push(ปล่อยค้าง);

  // ใส่เพดานเองด้วย AbortSignal — ต้องรู้ว่าหน้าตาของการยกเลิกเป็นอะไร
  /*
   * `AbortSignal` ส่งผ่าน stub ของ Durable Object ไม่ได้เหมือน `fetch` ธรรมดา
   * จึงวัดด้วยการแข่งกับนาฬิกาของเราเองแทน · สิ่งที่อยากรู้คือ **หน้าตาของการยกเลิก
   * ที่เราสั่งเอง** ซึ่งเป็นสิ่งที่ `httpSend_` ต้องรับมือ ไม่ใช่กลไกของ AbortSignal เอง
   */
  results.push(await observe('ใส่เพดานเอง 3 วินาที แล้วยกเลิก', async () => {
    let นาฬิกา;
    const หมดเวลา = new Promise((_, ปฏิเสธ) => {
      นาฬิกา = setTimeout(
        () => ปฏิเสธ(new DOMException('ครบ 3 วินาทีแล้ว ยกเลิกเอง', 'TimeoutError')),
        3000);
    });
    try {
      return await Promise.race([hitTarget(env, '/slow?s=' + wait), หมดเวลา]);
    } finally {
      clearTimeout(นาฬิกา);
    }
  }));

  return results;
}

/**
 * ข้อ 4 — เพดานจำนวนคำขอย่อยต่อหนึ่งคำขอ
 *
 * หน้ารายการงานแผนกเคยใช้ 62 คำขอก่อนที่เราจะลดเหลือ 5 · ถ้าเพดานต่ำกว่านั้น
 * หน้าที่ยิงเยอะจะตายโดยไม่มีใครเดาถูกว่าทำไม จึงต้องรู้ทั้งตัวเลขและหน้าตาตอนชน
 */
async function measureSubrequests(env, url) {
  /*
   * **เป้าที่ยิงต้องเป็นของนอก ไม่ใช่ตัวเอง** · 62 คำขอที่เป็นต้นเหตุของข้อนี้ยิงไป
   * Supabase ซึ่งเป็นคนละเครื่อง · การยิงใส่ตัวเองเป็นคำขอที่ปลุก Worker ตัวใหม่
   * ซึ่งไม่มีอะไรรับประกันว่าคิดราคาเท่ากัน · วัดด้วยเป้าที่ผิดชนิดแล้วได้ตัวเลขมา
   * จะเอาไปวางแผนหน้าเว็บไม่ได้ ทั้งที่ตัวเลขนั้นดูเหมือนคำตอบ
   *
   * เป้าปริยายคือ PostgREST ที่ไม่ส่งกุญแจ ซึ่งตอบ 401 เร็วและไม่ได้อ่านข้อมูลอะไรเลย
   * ส่งมา `?target=self` ได้ถ้าอยากเทียบว่าสองชนิดคิดราคาต่างกันไหม
   */
  const target = url.searchParams.get('target') === 'do' ? 'do' : 'rest';

  /*
   * **ต้องไต่ให้สูงพอที่จะเจอเพดานของแผนที่จะใช้จริง ไม่ใช่แผนที่ใช้อยู่วันนี้**
   * SPEC 22.7 ตกลงแล้วว่าจะจ่าย Workers Paid · ถ้าหยุดที่ 60 แล้วไม่ชนอะไร
   * เราจะได้คำตอบว่า "เกิน 60" ซึ่งตอบคำถามเรื่อง 62 คำขอไม่ได้เลยสักนิด
   */
  const want = Number(url.searchParams.get('n') || '1200');

  let done = 0;
  let broke = null;
  const started = Date.now();

  for (let i = 0; i < want; i++) {
    try {
      const res = target === 'do'
        ? await hitTarget(env, '/ping?i=' + i)
        : await fetch(REST + 'work_order?select=wo_id&limit=1&i=' + i);
      await res.text();
      done++;
    } catch (e) {
      broke = {
        ชนหลังจากสำเร็จไปแล้ว: done,
        ชื่อ: e && e.name,
        ข้อความ: e && e.message,
        ชนิด: e && e.constructor ? e.constructor.name : typeof e
      };
      break;
    }
  }

  return {
    ยิงใส่: target === 'do' ? 'Durable Object (เทียบเฉย ๆ)' : 'PostgREST ของจริง',
    ขอไป: want,
    สำเร็จ: done,
    ชนเพดาน: broke,
    ใช้เวลาทั้งหมดms: Date.now() - started,
    เทียบกับของจริง: done >= 62
      ? 'เกิน 62 คำขอที่หน้ารายการงานแผนกเคยใช้ — เพดานไม่ใช่ตัวที่ฆ่าหน้านั้น'
      : 'ต่ำกว่า 62 คำขอที่หน้ารายการงานแผนกเคยใช้ — ถ้าไม่ลดคำขอ หน้านั้นตายแน่',
    ต้องเขียนกำกับเสมอ: 'ตัวเลขนี้เป็นของแผนที่บัญชีนี้ใช้อยู่ ณ วันที่วัด ไม่ใช่ของแผนที่จะใช้ตอนเปิดจริง — ถ้าสองอย่างไม่ตรงกัน ต้องวัดซ้ำหลังเปลี่ยนแผน'
  };
}

/** ข้อ 5 — ยิงหนึ่งครั้ง ปลายทางเห็นกี่ครั้ง */
/**
 * อ่านตัวนับจาก /self/hits โดยไม่ยอมโยนออกไปไม่ว่ากรณีใด
 *
 * เดิมเขียนเป็น `await (await fetch(...)).json()` เปล่า ๆ · พอของที่ตอบกลับมา
 * ไม่ใช่ JSON มันโยนทะลุ handler ออกไปเป็น **error 1101** ซึ่งคือหน้าขาวที่
 * ไม่บอกอะไรเลยสักอย่าง · เจอจริงบนของจริง 01-10-2026 ทั้งที่ workerd ในเครื่องผ่าน
 *
 * **เครื่องวัดที่ล้มแทนที่จะรายงาน คือเครื่องวัดที่ซ่อนผลการวัด** และรอบที่ล้ม
 * ก็คือรอบที่มีอะไรน่าสนใจที่สุดเสมอ · ตัวนี้จึงคืนสิ่งที่เจอทุกกรณี
 */
async function readHits(env, label) {
  try {
    const res = await hitTarget(env, '/hits');
    const text = await res.text();
    try {
      const asJson = JSON.parse(text);
      return { อ่านได้: true, status: res.status, hits: asJson.hits };
    } catch (e) {
      return {
        อ่านได้: false, เมื่อ: label, status: res.status,
        เพราะ: 'ตอบกลับมาแต่ไม่ใช่ JSON',
        contentType: res.headers.get('content-type') || '(ไม่มี)',
        bodyยาว: text.length,
        bodyต้น: text.slice(0, 300)
      };
    }
  } catch (e) {
    return {
      อ่านได้: false, เมื่อ: label,
      เพราะ: 'เรียกเป้าไม่สำเร็จ',
      ชื่อ: e && e.name, ข้อความ: e && e.message,
      สาเหตุซ้อน: e && e.cause ? String(e.cause && e.cause.message || e.cause) : null
    };
  }
}

async function measureRetry(env) {
  const before = await readHits(env, 'ก่อนยิง');
  const one = await observe('ยิงไปที่ทางที่ตอบ 500 หนึ่งครั้ง',
    () => hitTarget(env, '/counted'));
  const after = await readHits(env, 'หลังยิง');

  // อ่านตัวนับไม่ได้สักข้าง = ไม่มีอะไรให้ลบกัน ต้องบอกว่าทำไม ไม่ใช่ล้มเงียบ
  if (!before.อ่านได้ || !after.อ่านได้) {
    return {
      ผล: 'วัดไม่ได้ในรอบนี้',
      เพราะ: 'อ่านตัวนับจากเป้าไม่สำเร็จ',
      ห้ามสรุปว่า: 'Worker ไม่ลองใหม่',
      ก่อนยิง: before,
      ผลของการยิง: one,
      หลังยิง: after
    };
  }

  /*
   * ไม่ต้องตรวจว่าสามคำขอตกที่เดียวกันอีกแล้ว — Durable Object ที่เรียกด้วยชื่อคงที่
   * คือ object ตัวเดียวเสมอ · ปัญหา "คนละ isolate" ที่เคยต้องเฝ้าหายไปจริง
   * ไม่ใช่แค่ถูกตรวจจับได้ · นี่คือเหตุผลหลักที่ย้ายมาใช้ DO ไม่ใช่แค่หลบ 1042
   */

  return {
    ผล: 'วัดได้',
    ก่อนยิง: before,
    ผลของการยิง: one,
    หลังยิง: after,
    ปลายทางเห็นเพิ่มขึ้น: after.hits - before.hits,
    แปลว่า: (after.hits - before.hits) === 1
      ? 'ยิงหนึ่งครั้ง ปลายทางเห็นหนึ่งครั้ง — Worker ไม่ได้ลองใหม่ให้เอง'
      : 'ปลายทางเห็นมากกว่าหนึ่งครั้ง — มีการลองใหม่เกิดขึ้นโดยที่เราไม่ได้สั่ง'
  };
}

/** ข้อ 6 — ไม่อ่าน body จนจบ มีผลอะไรไหม */
async function measureUnreadBody(env, url) {
  const rounds = Number(url.searchParams.get('n') || '12');
  const results = [];
  const started = Date.now();
  let failedAt = null;

  for (let i = 0; i < rounds; i++) {
    try {
      // ขอ body ใหญ่ แล้วทิ้งไปเลยโดยไม่อ่าน
      const res = await hitTarget(env, '/big?mb=4');
      results.push({ รอบที่: i + 1, status: res.status, อ่านbody: false });
    } catch (e) {
      failedAt = { รอบที่: i + 1, ชื่อ: e && e.name, ข้อความ: e && e.message };
      break;
    }
  }

  // รอบสุดท้ายอ่านจนจบ เพื่อเทียบว่าต่างกันไหม
  const readFully = await observe('รอบที่อ่าน body จนจบ', async () => {
    const res = await hitTarget(env, '/big?mb=4');
    return res;
  });

  return {
    ทิ้งไปไม่อ่านกี่รอบ: results.length,
    พังตอนรอบไหน: failedAt,
    ใช้เวลาทั้งหมดms: Date.now() - started,
    อ่านจนจบเทียบให้ดู: readFully
  };
}

/* ---------------------------------------------------------------------------
 * ทางเข้า
 * --------------------------------------------------------------------------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /*
     * ทาง `/self/*` ถูกถอดออกทั้งหมด · มันเคยมีไว้ให้ Worker ยิง fetch ใส่ตัวเอง
     * ซึ่ง **Cloudflare ไม่อนุญาต** — ได้ `404 error code: 1042` ทุกครั้งบนของจริง
     * (วัดเจอ 01-10-2026 · `wrangler dev` ในเครื่องยอมให้ทำ จึงไม่มีใครรู้มาก่อน)
     * เป้าที่ควบคุมได้ย้ายไปอยู่ใน Durable Object ชื่อ ProbeTarget แทน
     */

    const denied = refuseUnlessAllowed(request, env);
    if (denied) return denied;

    const where = request.cf
      ? { colo: request.cf.colo, country: request.cf.country }
      : { colo: '(ไม่รู้)', country: '(ไม่รู้)' };

    switch (url.pathname) {
      case '/body4xx':
        return say({ วัด: '4xx อ่าน body ได้ไหม', ที่: where, ผล: await measureBody4xx(env) });
      case '/netfail':
        return say({ วัด: 'ความล้มเหลวทางเครือข่าย', ที่: where, ผล: await measureNetworkFailure(env) });
      case '/timeout':
        return say({ วัด: 'เพดานเวลาของ fetch', ที่: where, ผล: await measureTimeout(env, url) });
      case '/subrequests':
        return say({ วัด: 'เพดานจำนวนคำขอย่อย', ที่: where, ผล: await measureSubrequests(env, url) });
      case '/retry':
        return say({ วัด: 'Worker ลองใหม่ให้เองไหม', ที่: where, ผล: await measureRetry(env) });
      case '/unread':
        return say({ วัด: 'ไม่อ่าน body จนจบ', ที่: where, ผล: await measureUnreadBody(env, url) });
      default:
        return say({
          เครื่องวัด: 'กองที่ 1 ข้อ 2 — fetch เทียบ UrlFetchApp',
          ที่: where,
          ทางที่มี: ['/body4xx', '/netfail', '/timeout', '/subrequests', '/retry', '/unread'],
          ความลับที่ตั้งแล้ว: {
            PROOF_TOKEN: Boolean(env.PROOF_TOKEN),
            SUPABASE_ANON_KEY: Boolean(env.SUPABASE_ANON_KEY)
          },
          เป้าที่ควบคุมได้: env.PROBE
            ? 'Durable Object ผูกไว้แล้ว'
            : '!! ยังไม่ได้ผูก Durable Object ชื่อ PROBE — ข้อ 3, 5, 6 จะวัดไม่ได้',
          เตือน: 'ลบ Worker ตัวนี้ทิ้งทันทีที่วัดเสร็จ'
        });
    }
  }
};
