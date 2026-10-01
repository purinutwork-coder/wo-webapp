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
  var g = gas.makeGasGlobals({ timeZone: 'Asia/Bangkok' });

  var ctx = {
    console: console, Date: Date, JSON: JSON, Math: Math, RegExp: RegExp,
    String: String, Number: Number, Boolean: Boolean, Array: Array, Object: Object,
    Error: Error, TypeError: TypeError, RangeError: RangeError, Function: Function,
    Promise: Promise, Set: Set, Map: Map, Intl: Intl,
    isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent
  };
  Object.assign(ctx, g.globals);

  if (mode === 'fetch') {
    ctx.fetch = http.makeFetch(world, counters);
    ctx.AbortController = AbortController;
    ctx.DOMException = DOMException;
    ctx.crypto = { randomUUID: require('crypto').randomUUID, subtle: require('crypto').webcrypto.subtle };
  } else {
    ctx.UrlFetchApp = http.makeUrlFetchApp(world, counters);
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

  return { ctx: ctx, world: world, counters: counters, gas: g, loaded: loaded };
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
      gasCalls: built.gas.counters
    };
  } catch (e) {
    return {
      mode: mode, name: name, ok: false, kind: classify(e),
      reason: String((e && e.message) || e).slice(0, 300),
      ms: Date.now() - startedAt, http: built.counters.http
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

  if (mode === 'both') {
    var a = rows.filter(function (r) { return r.mode === 'urlfetchapp'; });
    var b = rows.filter(function (r) { return r.mode === 'fetch'; });
    var onlyB = b.filter(function (r, i) { return !r.ok && a[i] && a[i].ok; });
    console.log('\n── เทียบสองโหมด ──');
    console.log('  urlfetchapp ผ่าน ' + a.filter(function (r) { return r.ok; }).length + '/' + a.length);
    console.log('  fetch       ผ่าน ' + b.filter(function (r) { return r.ok; }).length + '/' + b.length);
    console.log('  ข้อที่เขียววันนี้แต่แดงเมื่อย้าย: ' + onlyB.length +
      ' (async ' + onlyB.filter(function (r) { return r.kind === 'async'; }).length +
      ' · พฤติกรรมต่างจริง ' + onlyB.filter(function (r) { return r.kind !== 'async'; }).length + ')');
    console.log('  → ข้อที่แดงเพราะ async คืองานไล่เติม await ซึ่งรู้ราคาแล้ว');
    console.log('  → ข้อที่แดงเพราะพฤติกรรมต่างจริง คือสิ่งที่ SPEC 22.10 เตือนไว้');
  }
}

if (require.main === module) main();
module.exports = { buildContext: buildContext, runOne: runOne, sourceFiles: sourceFiles };
