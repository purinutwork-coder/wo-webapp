/*
  เติม async/await ให้ฟังก์ชันที่อยู่บนเส้นทางไป httpSend_

  ทำไมต้องมีเครื่องมือ ไม่ใช่แก้ด้วยมือ
  ---------------------------------------------------------------------------
  405 จาก 693 ฟังก์ชันอยู่บนเส้นทางนี้ · การไล่แก้ด้วยมือ 405 จุดแล้วพลาดจุดเดียว
  ให้ผลเป็นบั๊กที่เงียบที่สุดแบบหนึ่ง — ฟังก์ชันคืน Promise ไปให้คนที่ไม่ได้รอ
  แล้วค่าที่ได้คือ `[object Promise]` ซึ่งไม่โยน ไม่เตือน และไหลลงฐานข้อมูลได้

  **เครื่องมือนี้ต้องรันซ้ำได้** ไม่เติมซ้ำของที่เติมแล้ว เพื่อให้รันหลัง rebase
  หรือหลังเพิ่มฟังก์ชันใหม่ได้โดยไม่ต้องย้อนก่อน

  สิ่งที่มันทำไม่ได้ และต้องรายงาน ไม่ใช่เงียบ
  ---------------------------------------------------------------------------
  - **การเรียกที่อยู่ใน callback ธรรมดา** เช่น `rows.forEach(function (r) { db_x(r); })`
    ใส่ `await` ตรงนั้นไม่ได้ เพราะ callback ไม่ใช่ async · และการทำ callback
    ให้เป็น async ก็ไม่ช่วย เพราะ `forEach` ไม่รอ Promise ที่ callback คืน
    → ต้องเปลี่ยนเป็น `for` ของจริง ซึ่งเป็นการตัดสินใจเชิงออกแบบ ไม่ใช่การไล่แทนที่
  - เครื่องมือจึง **ข้ามจุดพวกนั้นแล้วพิมพ์รายการออกมา** ให้คนตัดสินทีละจุด

  เรียก:  node tools/add_await.js            ดูว่าจะแก้อะไรบ้าง ไม่เขียนไฟล์
          node tools/add_await.js --write    เขียนจริง
*/
'use strict';
var fs = require('fs');
var path = require('path');

var SRC = path.join(__dirname, '..', 'src');
var SKIP_FILES = ['99_Test.js'];          // ชุดทดสอบเรียกของพวกนี้ แต่ยังรันแบบ sync ได้
var ROOT = 'httpSend_';

function sourceFiles() {
  return fs.readdirSync(SRC)
    .filter(function (f) { return /\.js$/.test(f) && SKIP_FILES.indexOf(f) === -1; })
    .sort();
}

var codeOnly = require('./code_only').codeOnly;

/** แบ่งไฟล์เป็นฟังก์ชันระดับบนสุด — โปรเจกต์นี้ประกาศแบบ `function ชื่อ(` ทั้งหมด */
function topLevelFunctions(text) {
  var re = /^(async\s+)?function\s+([a-zA-Z_0-9$]+)\s*\(/gm;
  var marks = [], m;
  while ((m = re.exec(text))) marks.push({ name: m[2], at: m.index, isAsync: !!m[1] });
  return marks.map(function (mk, i) {
    return {
      name: mk.name, at: mk.at, isAsync: mk.isAsync,
      end: (i + 1 < marks.length) ? marks[i + 1].at : text.length
    };
  });
}

/* ---------- 1) หาเซตของฟังก์ชันที่ต้องเป็น async ---------- */

var files = sourceFiles();
var bodyOf = {}, fileOf = {}, spans = {};
files.forEach(function (f) {
  var text = fs.readFileSync(path.join(SRC, f), 'utf8');
  spans[f] = topLevelFunctions(text);
  var code = codeOnly(text);
  spans[f].forEach(function (fn) {
    bodyOf[fn.name] = code.slice(fn.at, fn.end);
    fileOf[fn.name] = f;
  });
});

var needAsync = new Set([ROOT]);
for (var round = 0; round < 60; round++) {
  var before = needAsync.size;
  Object.keys(bodyOf).forEach(function (name) {
    if (needAsync.has(name)) return;
    for (var target of needAsync) {
      if (new RegExp('\\b' + target.replace(/\$/g, '\\$') + '\\s*\\(').test(bodyOf[name])) {
        needAsync.add(name); return;
      }
    }
  });
  if (needAsync.size === before) break;
}
needAsync.delete(ROOT);
var asyncNames = Array.from(needAsync).concat([ROOT]);

/* ---------- 2) เขียนทับทีละไฟล์ ---------- */

var callPattern = new RegExp(
  '\\b(' + asyncNames.map(function (n) { return n.replace(/\\$/g, '\\\\$'); }).join('|') + ')\\s*\\(', 'g');

var stats = { madeAsync: 0, awaited: 0, asyncCallbacks: 0, skipped: [] };

/**
 * ฟังก์ชันซ้อนตัวในสุดที่ครอบตำแหน่งนี้ · คืน null เมื่ออยู่ที่ตัวฟังก์ชันหลักเอง
 *
 * นับวงเล็บปีกกาจริง ไม่ใช่เดาจากจำนวนคำว่า function ที่เจอก่อนหน้า
 * — การนับแบบหลังมองว่า callback ที่ปิดไปแล้วยังเปิดอยู่ แล้วข้ามงานที่ทำได้ทิ้ง
 */
function innermostNestedFunction(region, at) {
  var re = /\bfunction\s*(?:[a-zA-Z_0-9$]+\s*)?\(/g;
  var m, found = null;
  while ((m = re.exec(region))) {
    if (m.index >= at) break;
    var open = region.indexOf('{', re.lastIndex);
    if (open === -1) continue;
    var depth = 0, i = open, close = -1;
    for (; i < region.length; i++) {
      var ch = region.charAt(i);
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    if (close === -1) close = region.length;
    if (at > open && at < close) found = { at: m.index, open: open, close: close };
  }
  return found;
}

files.forEach(function (f) {
  var full = path.join(SRC, f);
  var text = fs.readFileSync(full, 'utf8');
  var code = codeOnly(text);
  var fns = topLevelFunctions(text);

  /*
   * เดินถอยหลังเสมอ เพราะการแทรกตัวอักษรทำให้ตำแหน่งข้างหลังเลื่อน
   * ถ้าเดินไปข้างหน้า ตำแหน่งที่คำนวณไว้จะผิดตั้งแต่จุดที่สอง
   */
  var edits = [];
  var seenAsyncCallback = {};

  fns.forEach(function (fn) {
    var isTarget = asyncNames.indexOf(fn.name) !== -1;
    if (isTarget && !fn.isAsync) {
      edits.push({ at: fn.at, insert: 'async ' });
      stats.madeAsync++;
    }

    // หาการเรียกข้างในฟังก์ชันนี้
    var region = code.slice(fn.at, fn.end);
    var m;
    callPattern.lastIndex = 0;
    while ((m = callPattern.exec(region))) {
      var absolute = fn.at + m.index;

      // ข้ามบรรทัดที่เป็นตัวประกาศฟังก์ชันเอง
      if (/function\s*$/.test(code.slice(Math.max(0, absolute - 20), absolute))) continue;

      // เติมแล้วอย่าเติมซ้ำ — ต้องรันซ้ำได้
      if (/await\s+$/.test(code.slice(Math.max(0, absolute - 10), absolute))) continue;

      /*
       * อยู่ในฟังก์ชันซ้อนหรือไม่ และถ้าใช่ ซ้อนแบบไหน — **สองแบบนี้ต่างกันสิ้นเชิง**
       *
       *   ส่งให้ตัวที่ไม่รอ (`forEach` `map` `filter` `some` `every` `sort`)
       *     → ใส่ await ไม่ได้ และทำ callback ให้เป็น async ก็ไม่ช่วย
       *       เพราะตัววนไม่รอ Promise ที่ callback คืน · ต้องเปลี่ยนเป็น for ด้วยมือ
       *       ซึ่งเป็นการตัดสินใจเชิงออกแบบ ไม่ใช่การไล่แทนที่
       *
       *   ส่งให้ตัวที่เรียกเองแล้วคืนผล (เช่น `apiRun_(function () {...})`)
       *     → ทำ callback ให้เป็น async แล้ว await ได้ตามปกติ
       *       นี่คือรูปของ api_* เกือบทุกตัวในระบบ จึงเป็นกองใหญ่ที่สุด
       *       ถ้าเหมารวมว่า "อยู่ใน callback = แก้ไม่ได้" จะทิ้งงานที่ทำได้ไป 109 จุด
       */
      var enclosing = innermostNestedFunction(region, m.index);
      if (enclosing) {
        // ตัดช่องว่างท้ายออกก่อนเทียบ · `.forEach(\n      function` มีขึ้นบรรทัดใหม่คั่น
        var before20 = region.slice(Math.max(0, enclosing.at - 40), enclosing.at).replace(/\s+$/, '');
        if (/\.(forEach|map|filter|some|every|sort|reduce|find|findIndex)\s*\($/.test(before20)) {
          stats.skipped.push({
            file: f, fn: fn.name, call: m[1],
            line: text.slice(0, absolute).split('\n').length
          });
          continue;
        }
        // callback ที่ผู้เรียกรอผลได้ — ทำให้เป็น async ด้วย
        var abs = fn.at + enclosing.at;
        if (!/async\s+$/.test(code.slice(Math.max(0, abs - 10), abs)) &&
            !seenAsyncCallback[abs]) {
          edits.push({ at: abs, insert: 'async ' });
          seenAsyncCallback[abs] = true;
          stats.asyncCallbacks++;
        }
        edits.push({ at: absolute, insert: 'await ' });
        stats.awaited++;
        continue;
      }

      if (!isTarget) continue;   // ฟังก์ชันที่ไม่ได้เป็น async ใส่ await ไม่ได้
      edits.push({ at: absolute, insert: 'await ' });
      stats.awaited++;
    }
  });

  if (!edits.length) return;
  edits.sort(function (a, b) { return b.at - a.at; });
  edits.forEach(function (e) { text = text.slice(0, e.at) + e.insert + text.slice(e.at); });

  if (process.argv.indexOf('--write') !== -1) fs.writeFileSync(full, text, 'utf8');
});

/* ---------- 3) รายงาน ---------- */

console.log('ฟังก์ชันที่อยู่บนเส้นทางไป ' + ROOT + ': ' + asyncNames.length);
console.log('ทำให้เป็น async: ' + stats.madeAsync);
console.log('ทำ callback ที่ผู้เรียกรอผลได้ ให้เป็น async: ' + stats.asyncCallbacks);
console.log('เติม await ให้การเรียก: ' + stats.awaited);
console.log('');
console.log('ข้ามเพราะอยู่ใน callback ธรรมดา: ' + stats.skipped.length + ' จุด');
console.log('  (forEach/map/filter ไม่รอ Promise · ต้องเปลี่ยนเป็น for ด้วยมือ)');

var byFile = {};
stats.skipped.forEach(function (s) { byFile[s.file] = (byFile[s.file] || 0) + 1; });
Object.entries(byFile).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 15)
  .forEach(function (e) { console.log('    ' + String(e[1]).padStart(4) + '  ' + e[0]); });

if (process.argv.indexOf('--write') === -1) {
  console.log('\n(ยังไม่ได้เขียนไฟล์ · ใส่ --write เพื่อเขียนจริง)');
}
