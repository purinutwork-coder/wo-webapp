/*
  เครื่องวัดของกองที่ 1 ข้อ 2 — fetch บน Worker ต่างจาก UrlFetchApp ตรงไหน

  ของจำลองที่เราใช้อยู่ถูกสร้างจากพฤติกรรมของ UrlFetchApp · ถ้ายกมาใช้กับ fetch
  ตรง ๆ โดยไม่วัดก่อน ของจำลองจะเขียวอยู่บนพฤติกรรมที่ไม่มีอยู่จริง ซึ่งแย่กว่า
  ไม่มีของจำลองเลย เพราะมันให้ความมั่นใจที่ผิด

  ทุกทางมีรหัสลับกำกับ และ Worker ตัวนี้ต้องถูกลบทิ้งทันทีที่วัดเสร็จ
  ไม่มีความลับของฐานข้อมูลอยู่ในนี้เลย — การวัดที่ตั้งใจไว้ไม่ต้องใช้สิทธิ์อ่านข้อมูล

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
 * ทางที่มีไว้ให้ตัวเองยิงใส่ — สร้างสถานการณ์ที่ควบคุมได้โดยไม่พึ่งใคร
 * --------------------------------------------------------------------------- */

/** ตอบทันที ใช้เป็นเป้าราคาถูกตอนนับเพดานจำนวนคำขอ */
function routePing() {
  return new Response('ok');
}

/** ตอบ 503 พร้อม body — ใช้แยก "5xx" ออกจาก "ต่อไม่ติด" */
function route503() {
  return new Response(JSON.stringify({ message: 'จำลองฝั่งโน้นล่ม', code: '53300' }),
    { status: 503, headers: { 'content-type': 'application/json' } });
}

/** ค้างไว้ตามจำนวนวินาทีที่สั่ง แล้วค่อยตอบ — ใช้วัดว่า fetch มีเพดานเวลาในตัวไหม */
async function routeSlow(url) {
  const seconds = Number(url.searchParams.get('s') || '30');
  await new Promise((r) => setTimeout(r, seconds * 1000));
  return new Response('ตอบหลังจากค้างไว้ ' + seconds + ' วินาที');
}

/** body ใหญ่ ๆ ที่ตั้งใจจะไม่อ่านให้จบ */
function routeBig(url) {
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

/*
 * ตัวนับว่าทางนี้ถูกเรียกไปกี่ครั้ง — ใช้ดูว่า Worker ลองใหม่ให้เองหรือไม่
 *
 * อยู่ในตัวแปรระดับโมดูล จึงอยู่ได้เท่าที่ isolate ตัวนี้ยังอยู่ · ไม่ใช่ตัวนับที่
 * เชื่อถือได้ข้ามคำขอในระยะยาว แต่พอสำหรับคำถามว่า "ยิงหนึ่งครั้ง ปลายทางเห็นกี่ครั้ง"
 * ภายในคำขอเดียวกัน ซึ่งเป็นคำถามที่เรากำลังถาม
 */
let hitCount = 0;

function routeCounted() {
  hitCount++;
  return new Response(JSON.stringify({ ครั้งที่: hitCount }), { status: 500 });
}

/* ---------------------------------------------------------------------------
 * การวัดแต่ละข้อ
 * --------------------------------------------------------------------------- */

/** ข้อ 1 — 4xx อ่าน body ได้ไหม และรหัสของ Postgres มาครบหรือไม่ */
async function measureBody4xx() {
  const results = [];

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
async function measureNetworkFailure(origin) {
  const results = [];

  results.push(await observe('ชื่อโดเมนที่ไม่มีอยู่จริง',
    () => fetch('https://ไม่มีโดเมนนี้จริง-' + Date.now() + '.example/')));

  results.push(await observe('โดเมนที่มีอยู่แต่พอร์ตไม่เปิด',
    () => fetch('https://' + SUPABASE_REF + '.supabase.co:8443/')));

  results.push(await observe('ใบรับรองไม่ตรงกับชื่อ',
    () => fetch('https://expired.badssl.com/')));

  // 5xx ที่ควบคุมได้ ยิงใส่ตัวเอง — ต้องได้ Response ไม่ใช่การโยน
  results.push(await observe('5xx จริงจากปลายทางที่ยังตอบอยู่',
    () => fetch(origin + '/self/503', { headers: { 'x-proof-depth': '1' } })));

  return results;
}

/** ข้อ 3 — fetch มีเพดานเวลาในตัวหรือไม่ */
async function measureTimeout(origin, url) {
  const wait = Number(url.searchParams.get('s') || '35');
  const results = [];

  results.push(await observe('ปล่อยให้ค้าง ' + wait + ' วินาที ไม่ใส่เพดานเอง',
    () => fetch(origin + '/self/slow?s=' + wait, { headers: { 'x-proof-depth': '1' } })));

  // ใส่เพดานเองด้วย AbortSignal — ต้องรู้ว่าหน้าตาของการยกเลิกเป็นอะไร
  results.push(await observe('ใส่เพดานเอง 3 วินาที แล้วยกเลิก', () => {
    return fetch(origin + '/self/slow?s=' + wait, {
      headers: { 'x-proof-depth': '1' },
      signal: AbortSignal.timeout(3000)
    });
  }));

  return results;
}

/**
 * ข้อ 4 — เพดานจำนวนคำขอย่อยต่อหนึ่งคำขอ
 *
 * หน้ารายการงานแผนกเคยใช้ 62 คำขอก่อนที่เราจะลดเหลือ 5 · ถ้าเพดานต่ำกว่านั้น
 * หน้าที่ยิงเยอะจะตายโดยไม่มีใครเดาถูกว่าทำไม จึงต้องรู้ทั้งตัวเลขและหน้าตาตอนชน
 */
async function measureSubrequests(origin, url) {
  const want = Number(url.searchParams.get('n') || '60');
  let done = 0;
  let broke = null;

  for (let i = 0; i < want; i++) {
    try {
      const res = await fetch(origin + '/self/ping?i=' + i, { headers: { 'x-proof-depth': '1' } });
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

  return { ขอไป: want, สำเร็จ: done, ชนเพดาน: broke };
}

/** ข้อ 5 — ยิงหนึ่งครั้ง ปลายทางเห็นกี่ครั้ง */
async function measureRetry(origin) {
  const before = await (await fetch(origin + '/self/hits', { headers: { 'x-proof-depth': '1' } })).json();
  const one = await observe('ยิงไปที่ทางที่ตอบ 500 หนึ่งครั้ง',
    () => fetch(origin + '/self/counted', { headers: { 'x-proof-depth': '1' } }));
  const after = await (await fetch(origin + '/self/hits', { headers: { 'x-proof-depth': '1' } })).json();

  return {
    หมายเหตุ: 'ตัวนับอยู่ใน isolate เดียวกันเท่านั้น ถ้าตัวเลขกระโดดแปลก ๆ แปลว่าคนละ isolate',
    ก่อนยิง: before,
    ผลของการยิง: one,
    หลังยิง: after,
    ปลายทางเห็นเพิ่มขึ้น: after.hits - before.hits
  };
}

/** ข้อ 6 — ไม่อ่าน body จนจบ มีผลอะไรไหม */
async function measureUnreadBody(origin, url) {
  const rounds = Number(url.searchParams.get('n') || '12');
  const results = [];
  const started = Date.now();
  let failedAt = null;

  for (let i = 0; i < rounds; i++) {
    try {
      // ขอ body ใหญ่ แล้วทิ้งไปเลยโดยไม่อ่าน
      const res = await fetch(origin + '/self/big?mb=4', { headers: { 'x-proof-depth': '1' } });
      results.push({ รอบที่: i + 1, status: res.status, อ่านbody: false });
    } catch (e) {
      failedAt = { รอบที่: i + 1, ชื่อ: e && e.name, ข้อความ: e && e.message };
      break;
    }
  }

  // รอบสุดท้ายอ่านจนจบ เพื่อเทียบว่าต่างกันไหม
  const readFully = await observe('รอบที่อ่าน body จนจบ', async () => {
    const res = await fetch(origin + '/self/big?mb=4', { headers: { 'x-proof-depth': '1' } });
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
    const origin = url.origin;

    /*
     * ทางที่มีไว้ให้ตัวเองยิงใส่ ไม่ต้องผ่านด่านรหัสลับ แต่ต้องมาจากการยิงของตัวเอง
     * เท่านั้น · ดูจากหัวข้อความที่เราใส่เอง ซึ่งคนนอกใส่ตามได้ — แต่ทางเหล่านี้
     * ไม่ได้ทำอะไรนอกจากตอบข้อความคงที่ จึงไม่มีอะไรให้เสียหาย
     */
    if (url.pathname.startsWith('/self/')) {
      if (request.headers.get('x-proof-depth') !== '1') {
        return new Response('ทางนี้มีไว้ให้เครื่องวัดยิงใส่ตัวเองเท่านั้น\n', { status: 403 });
      }
      switch (url.pathname) {
        case '/self/ping':    return routePing();
        case '/self/503':     return route503();
        case '/self/slow':    return await routeSlow(url);
        case '/self/big':     return routeBig(url);
        case '/self/counted': return routeCounted();
        case '/self/hits':    return new Response(JSON.stringify({ hits: hitCount }));
        default: return new Response('ไม่มีทางนี้\n', { status: 404 });
      }
    }

    const denied = refuseUnlessAllowed(request, env);
    if (denied) return denied;

    const where = request.cf
      ? { colo: request.cf.colo, country: request.cf.country }
      : { colo: '(ไม่รู้)', country: '(ไม่รู้)' };

    switch (url.pathname) {
      case '/body4xx':
        return say({ วัด: '4xx อ่าน body ได้ไหม', ที่: where, ผล: await measureBody4xx() });
      case '/netfail':
        return say({ วัด: 'ความล้มเหลวทางเครือข่าย', ที่: where, ผล: await measureNetworkFailure(origin) });
      case '/timeout':
        return say({ วัด: 'เพดานเวลาของ fetch', ที่: where, ผล: await measureTimeout(origin, url) });
      case '/subrequests':
        return say({ วัด: 'เพดานจำนวนคำขอย่อย', ที่: where, ผล: await measureSubrequests(origin, url) });
      case '/retry':
        return say({ วัด: 'Worker ลองใหม่ให้เองไหม', ที่: where, ผล: await measureRetry(origin) });
      case '/unread':
        return say({ วัด: 'ไม่อ่าน body จนจบ', ที่: where, ผล: await measureUnreadBody(origin, url) });
      default:
        return say({
          เครื่องวัด: 'กองที่ 1 ข้อ 2 — fetch เทียบ UrlFetchApp',
          ที่: where,
          ทางที่มี: ['/body4xx', '/netfail', '/timeout', '/subrequests', '/retry', '/unread'],
          เตือน: 'ลบ Worker ตัวนี้ทิ้งทันทีที่วัดเสร็จ'
        });
    }
  }
};
