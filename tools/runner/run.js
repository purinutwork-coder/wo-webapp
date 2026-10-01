/*
  ตัวรันจำลองของโปรเจกต์ — รันชุดเทสต์ในเครื่องโดยไม่ต้อง clasp push

  เรียก
    node tools/runner/run.js --list
    node tools/runner/run.js test_db_doorTelling
    node tools/runner/run.js --mode=fetch test_db_doorTelling
    node tools/runner/run.js --mode=both  test_db_doorTelling

  สองโหมด (SPEC 22.10)
  ---------------------------------------------------------------------------
    urlfetchapp  ของวันนี้ — UrlFetchApp โยนเมื่อเครือข่ายล้มเหลวและเมื่อหมดเวลา
    fetch        ของวันหน้า — fetch คืน Response ที่ Cloudflare สังเคราะห์แทนการโยน
                 มีเพดาน 50 คำขอย่อย และ **เป็น async**

  --mode=both รันชุดเดียวกันสองรอบแล้วเทียบ · ความต่างที่ได้คือราคาของการย้าย
  ซึ่งเป็นตัวเลข ไม่ใช่ความกังวล

  กฎที่ตัวรันนี้ต้องถือ (CLAUDE.md)
  ---------------------------------------------------------------------------
  - **รายชื่อไฟล์ต้องมาจากโปรเจกต์ ไม่ใช่รายชื่อที่คนพิมพ์ไว้** ไฟล์ใหม่ต้องถูกโหลดเอง
    โดยไม่มีใครต้องจำ · และลำดับต้องเรียงตามชื่อไฟล์ เหมือนที่ Apps Script โหลดจริง
  - **ห้ามเติมของที่มีแต่ในเบราว์เซอร์ให้เป็น global** (`setTimeout` `document` `window`)
    เพราะจะกลบความจริงที่ของจริงฟ้อง
  - **ตัวเลขทุกตัวต้องติดมาด้วยว่ารันบนอะไร** ตัวเลขจากคนละตัวรันเอามาลบกันไม่ได้
*/
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var gas = require('./gas');
var http = require('./http');
var supabase = require('./supabase');

var SRC = path.join(__dirname, '..', '..', 'src');
var RUNNER_NAME = 'ตัวรันในเครื่อง (tools/runner)';

/** รายชื่อไฟล์มาจากโฟลเดอร์เสมอ · เรียงตามชื่อ ซึ่งเป็นลำดับเดียวกับที่ Apps Script ใช้ */
function sourceFiles() {
  return fs.readdirSync(SRC).filter(function (f) { return /\.js$/.test(f); }).sort();
}

/**
 * สร้างโลกหนึ่งใบแล้วโหลดโค้ดทั้งโปรเจกต์ลงไป
 *
 * **ห้ามใส่ setTimeout document window ลงใน context** · Apps Script ไม่มีของพวกนี้
 * ถ้าเติมให้ โค้ดที่พึ่งมันจะเขียวในเครื่องแล้วตายบนของจริง (เกิดมาแล้ว 29-09-2026)
 */
function buildContext(mode) {
  var world = http.makeWorld();
  var counters = { http: 0, subrequests: 0 };

  /*
   * ตั้งค่าเชื่อมต่อให้ครบตั้งแต่ต้น · ถ้าไม่ตั้ง กลุ่ม DB จะ **ข้ามชุดที่ต้องต่อ
   * Supabase ทั้งหมด** แล้วรายงานตัวเลขที่อ่านดีแต่ไม่ได้พิสูจน์ชั้นเชื่อมต่อเลย
   * ที่อยู่ไม่ใช่ของจริง เพราะทุกคำขอถูกดักด้วยของจำลองก่อนออกเครือข่าย
   */
  var g = gas.makeGasGlobals({
    timeZone: 'Asia/Bangkok',
    scriptProperties: {
      SUPABASE_URL: 'https://mock-no-network.supabase.co',
      SUPABASE_SERVICE_KEY: 'service-role-ของจำลอง',
      SUPABASE_ANON_KEY: 'anon-ของจำลอง'
    }
  });

  /*
   * PostgREST จำลองรับทุกคำขอที่ไปหา /rest/v1 เป็นกฎพื้นหลัง
   * เทสต์ที่อยากได้สถานการณ์พิเศษวาง world.when(...) ทับได้ เพราะกฎหลังชนะกฎก่อน
   * RPC คืนรูปที่ถูกต้องขั้นต่ำ ไม่ใช่ตรรกะเต็มของ SQL — ประกาศไว้ตรง ๆ ว่าแค่ไหน
   */
  var schema = supabase.parseSchema(
    fs.readFileSync(path.join(__dirname, '..', '..', 'SQL', 'supabase_schema.sql'), 'utf8'));

  var pg = supabase.makePostgrest({
    schema: schema,
    rpc: {
      department_task_counts: function () {
        return [{ department: 'SERVICE', pending_accept: 0, in_progress: 0, returned: 0, completed: 0 }];
      },
      dashboard_summary: function () {
        return [{ total: 0, pending_approve: 0, in_progress: 0, completed: 0, overdue: 0 }];
      },
      next_running_number: function (args) { return [{ last_number: 1, key: args && args.p_key }]; },
      db_objects: function () { return [{ versions: {}, indexes: [], constraints: [], functions: [] }]; }
    }
  });
  world.when(/\/rest\/v1/, { kind: 'postgrest' });

  /*
   * **ห้ามยัดของพื้นฐานของ Node เข้าไปใน context** (`Array` `Object` `JSON` ...)
   *
   * `vm.createContext` สร้าง realm ใหม่ที่มีของพื้นฐานครบอยู่แล้ว · การยัดของจาก
   * realm ของ Node ทับเข้าไป ทำให้ `[1,2] instanceof Array` เป็น **false**
   * เพราะ array literal ข้างใน context สร้างจาก intrinsic ของ context นั้น
   * แต่ชื่อ `Array` ชี้ไปที่ของ Node ซึ่งเป็นคนละตัว
   *
   * เจอจริงตอนสร้างตัวรันนี้ · `dbColumnMap_` ใช้ `entry instanceof Array` เพื่อ
   * แยกคอลัมน์แบบคู่ `['รหัสลูกค้า','customer_code']` ออกจากแบบชื่อเดียว ·
   * ตัวรันทำให้มันเป็น false ตาราง Customer จึงแมปตัวเองไปหาตัวเอง แล้วสามชุดแดง
   * **ถ้าเชื่อตัวรันแล้วไปแก้ 01_Db.gs จะพังโค้ดที่ทำงานถูกอยู่แล้ว**
   *
   * บทเรียนเดียวกับกฎข้อ 27 แต่กลับด้าน — คราวนี้ของจำลอง **ใจร้ายกว่า** ของจริง
   * แล้วฟ้องบั๊กที่ไม่มีอยู่ · ซึ่งเสียเวลาเท่ากันและทำให้คนเลิกเชื่อรายงาน
   */
  var ctx = { console: console };
  Object.assign(ctx, g.globals);

  if (mode === 'fetch') {
    ctx.fetch = http.makeFetch(world, counters, pg);
    ctx.AbortController = AbortController;
    ctx.DOMException = DOMException;
    ctx.crypto = { randomUUID: require('crypto').randomUUID, subtle: require('crypto').webcrypto.subtle };
  } else {
    ctx.UrlFetchApp = http.makeUrlFetchApp(world, counters, pg);
  }

  vm.createContext(ctx);
  var loaded = sourceFiles();
  loaded.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(SRC, f), 'utf8'), ctx, { filename: f });
  });

  /*
   * โหมด fetch ต้องเปลี่ยนไส้ของ httpSend_ เพราะ `fetch` เป็น async
   *
   * **และนี่คือข้อค้นพบที่ใหญ่ที่สุดของการสร้างตัวรันนี้** — `httpSend_` ที่กลายเป็น
   * async ลาก `db_fetch_` ตามไป แล้วลากชั้น Repo ชั้น Service และ `api_*` ตามไปทั้งสาย
   * วัดได้ว่า **405 จาก 693 ฟังก์ชัน (58%) อยู่บนเส้นทางนี้** และโปรเจกต์วันนี้
   * ไม่มี `async` หรือ `await` อยู่เลยสักตัว
   *
   * SPEC 22.7 ให้ความยากของแถวนี้ไว้ว่า "แทบไม่ต้องแก้" ซึ่งเป็นการประเมินที่ผิด
   * มากที่สุดในตารางนั้น
   */
  if (mode === 'fetch') {
    ctx.httpSend_ = async function (request) {
      ctx.assertUrlFits_(request);
      var res = await ctx.fetch(request.url, ctx.httpOptions_
        ? toFetchInit(ctx.httpOptions_(request))
        : { method: String(request.method || 'get') });
      var text = await res.text();
      return { status: res.status, headers: res._allHeaders || {}, body: text };
    };
  }

  return { ctx: ctx, world: world, counters: counters, gas: g, loaded: loaded, pg: pg };
}

function toFetchInit(options) {
  var init = { method: String(options.method || 'get').toUpperCase() };
  if (options.headers) init.headers = options.headers;
  if (options.payload !== undefined) init.body = options.payload;
  return init;
}

/* ---------------------------------------------------------------------------
 * การจัดกลุ่มความล้มเหลว
 * --------------------------------------------------------------------------- */

/**
 * แยกว่าแดงเพราะอะไร — "เพราะ async" หรือ "เพราะพฤติกรรมต่างกันจริง"
 *
 * ถ้าไม่แยก ตัวเลขแดงของโหมด fetch จะเป็นก้อนเดียวที่อ่านไม่ได้ความ · ของที่
 * เราอยากรู้คือข้อที่สองต่างหาก เพราะข้อแรกเป็นงานไล่เติม `await` ซึ่งรู้ราคาแล้ว
 */
/**
 * แกะผลรายชุดออกจาก Logger — เป็นทางเดียวที่เทียบ A/B ได้ละเอียดกว่าระดับกลุ่ม
 *
 * harness พิมพ์สองรูป
 *   `--- <ชื่อชุด>: ผ่าน N / ไม่ผ่าน M ---`
 *   `!! <ชื่อชุด> หยุดกลางคัน: <เหตุผล>`
 * ชุดที่หยุดกลางคันไม่มีบรรทัดแรก จึงต้องเก็บทั้งสองรูป ไม่งั้นชุดที่หายไป
 * จะถูกนับเป็นศูนย์แทนที่จะถูกนับเป็น "ไม่ได้ตอบ" (CLAUDE.md ข้อ 32)
 */
function suitesFromLog(lines) {
  var out = {};
  lines.forEach(function (line) {
    var done = /^---\s*(.+?):\s*ผ่าน (\d+) \/ ไม่ผ่าน (\d+)\s*---/.exec(line);
    if (done) {
      out[done[1]] = { pass: Number(done[2]), fail: Number(done[3]), crashed: false };
      return;
    }
    var dead = /^!!\s*(\S+)\s+หยุดกลางคัน:\s*(.*)$/.exec(line);
    if (dead) {
      out[dead[1]] = { pass: 0, fail: 0, crashed: true, reason: dead[2].slice(0, 160) };
    }
  });
  return out;
}

function classify(error) {
  var text = String((error && error.message) || error);
  if (/\[object Promise\]|Promise \{|is not a function.*then|\.then is not/.test(text)) return 'async';
  if (/undefined is not an object|Cannot read propert/.test(text) && /Promise/.test(text)) return 'async';
  return 'behaviour';
}

/* ---------------------------------------------------------------------------
 * ทางเข้า
 * --------------------------------------------------------------------------- */

function runOne(mode, name) {
  var built = buildContext(mode);
  var fn = built.ctx[name];
  if (typeof fn !== 'function') {
    return { mode: mode, name: name, ok: false, reason: 'ไม่มีฟังก์ชันชื่อนี้ในโปรเจกต์' };
  }

  var startedAt = Date.now();
  try {
    var out = fn();
    // ฟังก์ชันที่คืน Promise ในโหมด fetch คือร่องรอยของ async ที่ลามขึ้นมา
    if (out && typeof out.then === 'function') {
      return {
        mode: mode, name: name, ok: false, kind: 'async',
        reason: 'คืน Promise — httpSend_ ที่เป็น async ลามขึ้นมาถึงฟังก์ชันนี้แล้ว',
        ms: Date.now() - startedAt, http: built.counters.http
      };
    }
    return {
      mode: mode, name: name, ok: true, result: out,
      ms: Date.now() - startedAt, http: built.counters.http,
      gasCalls: built.gas.counters, suites: suitesFromLog(built.gas.state.logLines)
    };
  } catch (e) {
    return {
      mode: mode, name: name, ok: false, kind: classify(e),
      reason: String((e && e.message) || e).slice(0, 300),
      ms: Date.now() - startedAt, http: built.counters.http,
      suites: suitesFromLog(built.gas.state.logLines)
    };
  }
}

function main() {
  var args = process.argv.slice(2);
  var mode = 'urlfetchapp';
  var names = [];
  args.forEach(function (a) {
    var m = /^--mode=(.+)$/.exec(a);
    if (m) { mode = m[1]; return; }
    if (a.charAt(0) !== '-') names.push(a);
  });

  var built = buildContext('urlfetchapp');

  if (args.indexOf('--list') !== -1 || !names.length) {
    var tests = Object.keys(built.ctx).filter(function (k) { return /^test_/.test(k); }).sort();
    console.log('ตัวรัน: ' + RUNNER_NAME);
    console.log('โหลดไฟล์จาก src/ ตามลำดับชื่อ ' + built.loaded.length + ' ไฟล์');
    console.log('ฟังก์ชัน test_ ที่โหลดได้ ' + tests.length + ' ตัว');
    console.log('\nกลุ่ม:');
    tests.filter(function (t) { return /^test_group_|^test_smoke$|^test_all$/.test(t); })
      .forEach(function (t) { console.log('  ' + t); });
    console.log('\nเรียก: node tools/runner/run.js [--mode=urlfetchapp|fetch|both] <ชื่อฟังก์ชัน>');
    return;
  }

  var modes = (mode === 'both') ? ['urlfetchapp', 'fetch'] : [mode];
  var rows = [];
  modes.forEach(function (m) {
    names.forEach(function (n) { rows.push(runOne(m, n)); });
  });

  console.log('ตัวรัน: ' + RUNNER_NAME + '  ·  ตัวเลขจากตัวรันนี้เทียบกับของจริงตรง ๆ ไม่ได้\n');
  rows.forEach(function (r) {
    var tag = r.ok ? 'ผ่าน ' : (r.kind === 'async' ? 'แดง[async]' : 'แดง ');
    console.log('[' + r.mode + '] ' + tag + ' ' + r.name +
      (r.ms !== undefined ? ('  ' + r.ms + ' ms · http ' + r.http + ' ครั้ง') : ''));
    if (!r.ok) console.log('        ' + r.reason);
  });

  if (mode === 'both') reportDiff(rows);
}

/**
 * เทียบสองโหมดรายชุด ไม่ใช่ระดับกลุ่ม
 *
 * **ห้ามเทียบแต่ยอดรวม** · กลุ่มที่หายไปสามข้อกับกลุ่มที่เพิ่มมาสามข้อหักกลบกัน
 * เป็นศูนย์แล้วซ่อนทั้งสองฝั่ง (CLAUDE.md) · ต้องไล่ทีละชุดเสมอ
 */
function reportDiff(rows) {
  var A = {}, B = {};
  rows.forEach(function (r) {
    var into = (r.mode === 'urlfetchapp') ? A : B;
    Object.keys(r.suites || {}).forEach(function (k) { into[k] = r.suites[k]; });
  });

  var names = Object.keys(A).concat(Object.keys(B))
    .filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort();

  var worse = [], gone = [], same = 0;
  names.forEach(function (n) {
    var a = A[n], b = B[n];
    if (!b) { gone.push(n); return; }
    if (!a) return;
    if (a.crashed === b.crashed && a.pass === b.pass && a.fail === b.fail) { same++; return; }
    worse.push({ name: n, a: a, b: b });
  });

  function total(map, field) {
    return Object.keys(map).reduce(function (sum, k) { return sum + (map[k][field] || 0); }, 0);
  }
  function crashedCount(map) {
    return Object.keys(map).filter(function (k) { return map[k].crashed; }).length;
  }

  console.log('\n── เทียบสองโหมดรายชุด ──');
  console.log('  ชุดที่เห็นทั้งสองโหมด ' + names.length + ' ชุด · เหมือนเดิม ' + same + ' ชุด');
  console.log('');
  console.log('              urlfetchapp    fetch');
  console.log('  ผ่าน           ' + String(total(A, 'pass')).padStart(6) + '      ' + String(total(B, 'pass')).padStart(6));
  console.log('  ไม่ผ่าน        ' + String(total(A, 'fail')).padStart(6) + '      ' + String(total(B, 'fail')).padStart(6));
  console.log('  ชุดหยุดกลางคัน ' + String(crashedCount(A)).padStart(6) + '      ' + String(crashedCount(B)).padStart(6));

  if (worse.length) {
    console.log('\n  ชุดที่เปลี่ยนไปเมื่อย้ายไป fetch (' + worse.length + ' ชุด):');
    worse.slice(0, 25).forEach(function (w) {
      var before = w.a.crashed ? 'หยุด' : (w.a.pass + '/' + (w.a.pass + w.a.fail));
      var after = w.b.crashed ? 'หยุด' : (w.b.pass + '/' + (w.b.pass + w.b.fail));
      console.log('    ' + w.name);
      console.log('        ' + before + '  →  ' + after + (w.b.reason ? ('  · ' + w.b.reason.slice(0, 110)) : ''));
    });
    if (worse.length > 25) console.log('    ... อีก ' + (worse.length - 25) + ' ชุด');
  }

  if (gone.length) {
    console.log('\n  !! ชุดที่หายไปเลยในโหมด fetch (' + gone.length + ') — ไม่ได้ตอบ ไม่ใช่ผ่าน:');
    gone.slice(0, 15).forEach(function (n) { console.log('    ' + n); });
  }

  console.log('\n  → ตัวเลขทั้งหมดนี้มาจากตัวรันในเครื่อง เทียบกับของจริงตรง ๆ ไม่ได้');
}

if (require.main === module) main();
module.exports = { buildContext: buildContext, runOne: runOne, sourceFiles: sourceFiles };
