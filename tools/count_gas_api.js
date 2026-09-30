/*
  นับการอ้างถึง API ของ Apps Script ที่เหลืออยู่ในโปรเจกต์ แยกรายไฟล์

  ความคืบหน้าของการย้ายเคยวัดด้วยคำบรรยาย ซึ่งอ่านแล้วตีความได้ทั้งสองทาง
  ตัวเลขที่เดินลงทุกกองจนถึงศูนย์คือสิ่งเดียวที่ตอบได้ว่าเหลืออีกไกลแค่ไหน

  เรียก:  node wo-cf/tools/count_gas_api.js
          node wo-cf/tools/count_gas_api.js --audit      พิมพ์ทุกจุดที่ตัดออก พร้อมเลขบรรทัด
          node wo-cf/tools/count_gas_api.js <โฟลเดอร์>   นับโฟลเดอร์อื่น เช่นเส้นเทียบที่แช่แข็ง
*/
var fs = require('fs');
var path = require('path');

/*
  รายชื่อนี้พิมพ์ไว้โดยตั้งใจ เพราะเป็นคำศัพท์ของแพลตฟอร์มอื่น ไม่ใช่ของโปรเจกต์นี้
  จึงไม่มีที่ไหนในโค้ดให้ดึงมาได้ · แบ่งตามความยากของการย้าย ไม่ใช่ตามตัวอักษร
*/
var GROUPS = [
  ['ไม่มีของแทน ต้องออกแบบใหม่',
   ['SpreadsheetApp', 'DriveApp', 'DocumentApp', 'HtmlService', 'ScriptApp']],
  ['มีของแทนตรง ๆ บน Cloudflare',
   ['PropertiesService', 'CacheService', 'LockService', 'Utilities', 'Logger', 'Session']],
  ['สะพานจากหน้าเว็บ',
   ['google.script.run']]
];

var ALL = [];
GROUPS.forEach(function (g) { ALL = ALL.concat(g[1]); });

var NL = String.fromCharCode(10);

/**
 * ขึ้นบรรทัดใหม่เท่าจำนวนที่มีอยู่ในช่วงที่ตัดทิ้ง
 *
 * ตัดออกเฉย ๆ จะทำให้เลขบรรทัดของโค้ดที่เหลือเลื่อนไปจากต้นฉบับ แล้ว --audit
 * จะชี้ผิดบรรทัดทุกจุด · ตัวนับที่ตรวจไม่ได้คือตัวนับที่ไม่ควรเชื่อ
 */
function newlinesIn(chunk) {
  return new Array(String(chunk).split(NL).length).join(NL);
}

/**
 * ตัดคำอธิบาย ข้อความ และรูปแบบการค้นออก เหลือแต่โค้ดที่ทำงานจริง
 *
 * ต้องตัดข้อความด้วย ไม่ใช่แค่คำอธิบาย — ชุดทดสอบเก็บข้อความแจ้งความผิดพลาดของจริง
 * ไว้เทียบ เช่น "permission to call SpreadsheetApp.openById" และ 00_Config.gs เก็บ
 * ชื่อ API เป็นคีย์ของตารางสิทธิ์ · ทั้งสองอย่างเป็นข้อมูล ไม่ใช่การเรียกใช้
 * ถ้านับด้วย ตัวเลขจะไม่มีวันถึงศูนย์แม้โค้ดจะสะอาดแล้ว
 *
 * **เดินทีละตัวอักษร ไม่ใช่ไล่แทนที่ด้วยรูปแบบ** · สองอย่างที่การไล่แทนที่ทำพังจริง
 *   - ฟันหนูเดี่ยวที่อยู่ข้างในข้อความที่ครอบด้วยฟันหนูคู่ จะไปจับคู่กับตัวถัดไป
 *     ที่อยู่ไกลออกไป แล้วกลืนโค้ดจริงที่คั่นตรงกลาง — 10_Web.gs หายไป 3 จุดจาก 6
 *   - รูปแบบการค้นที่มีฟันหนูอยู่ข้างใน เช่น /[\\/:*?"<>|]/g ใน 06_Files.gs
 *     จะเปิดข้อความค้างไว้แล้วกลืนทั้งไฟล์ — DriveApp 31 จุดกลายเป็นศูนย์
 */
function codeOnly(text) {
  var src = String(text);
  var out = [];
  var i = 0;
  // ตัวอักษรที่ถ้ามาก่อน / แปลว่าตัวนั้นเริ่มรูปแบบการค้น ไม่ใช่ตัวหาร
  var BEFORE_REGEX = '(,=:[!&|?{};+-*%~^<>';
  var last = '';

  while (i < src.length) {
    var c = src.charAt(i);
    var two = src.substr(i, 2);
    var stop;

    if (two === '/*') {
      stop = src.indexOf('*/', i + 2);
      stop = (stop === -1) ? src.length : stop + 2;
      out.push(newlinesIn(src.slice(i, stop)));
      i = stop;
      continue;
    }

    if (two === '//' && src.charAt(i - 1) !== ':') {
      stop = src.indexOf(NL, i);
      i = (stop === -1) ? src.length : stop;
      continue;
    }

    if (src.substr(i, 4) === '<!--') {
      stop = src.indexOf('-->', i + 4);
      stop = (stop === -1) ? src.length : stop + 3;
      out.push(newlinesIn(src.slice(i, stop)));
      i = stop;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      var sFrom = i;
      i++;
      while (i < src.length && src.charAt(i) !== c) {
        if (src.charAt(i) === '\\') i++;
        i++;
      }
      i++;
      out.push('""' + newlinesIn(src.slice(sFrom, i)));
      last = ')';
      continue;
    }

    if (c === '/' && (last === '' || BEFORE_REGEX.indexOf(last) !== -1)) {
      i++;
      var inClass = false;
      while (i < src.length && src.charAt(i) !== NL) {
        var r = src.charAt(i);
        if (r === '\\') { i += 2; continue; }
        if (r === '[') inClass = true;
        else if (r === ']') inClass = false;
        else if (r === '/' && !inClass) { i++; break; }
        i++;
      }
      out.push(' ');
      last = ')';   // ผลของรูปแบบการค้นเป็นค่า ตัว / ที่ตามมาจึงเป็นการหาร
      continue;
    }

    out.push(c);
    if (!/\s/.test(c)) last = c;
    i++;
  }
  return out.join('');
}

/** รูปแบบที่ถือว่าเป็น "การเรียกใช้" — ชื่อที่ลอยอยู่เฉย ๆ ไม่นับ */
function apiPattern(api) {
  return new RegExp('\\b' + api.replace(/\./g, '\\.') + '\\s*[.(]', 'g');
}

function countOf(text, api) {
  return (String(text).match(apiPattern(api)) || []).length;
}

function pad(text, width) {
  var out = String(text);
  while (out.length < width) out += ' ';
  return out;
}

/* ---------------------------------------------------------------- */

var args = process.argv.slice(2);
var audit = args.indexOf('--audit') !== -1;
var given = args.filter(function (a) { return a.charAt(0) !== '-'; })[0];
var dir = given || path.join(__dirname, '..', 'src');

/*
  ต้องนับ .gs ด้วย ไม่ใช่แค่ .js
  เส้นเทียบที่แช่แข็งไว้ (wo-webapp/) เป็นไฟล์ .gs ทั้งกอง เพราะเป็นของยุค Apps Script
  ตัวนับที่อ่านเส้นเทียบไม่ได้ ก็เทียบ "ก่อน" กับ "หลัง" ไม่ได้ ซึ่งเป็นงานเดียวที่มันมี
  เคยพลาดจริง: สั่งนับ wo-webapp/ แล้วได้ 1 จุดจาก 14 ไฟล์ ทั้งที่ของจริงมี 40 ไฟล์
  — ตัวเลขนั้นดูเหมือนคำตอบ และต่ำกว่าความจริงหลายร้อยเท่า
*/
var files = fs.readdirSync(dir).filter(function (name) {
  return /\.(gs|js|html)$/.test(name);
}).sort();

if (!files.length) throw new Error('ไม่พบไฟล์ .gs .js หรือ .html ใน ' + dir);

var rows = [];
var byApi = {};
var excluded = [];

files.forEach(function (name) {
  var raw = fs.readFileSync(path.join(dir, name), 'utf8');
  var code = codeOnly(raw);
  var rawLines = raw.split(NL);
  var codeLines = code.split(NL);
  var hits = {};
  var total = 0;

  ALL.forEach(function (api) {
    var n = countOf(code, api);
    if (n) {
      hits[api] = n;
      total += n;
      byApi[api] = (byApi[api] || 0) + n;
    }
    // เก็บจุดที่ตัดออกไว้ให้ตรวจด้วยตา พร้อมเลขบรรทัดของต้นฉบับ
    if (countOf(raw, api) !== n) {
      for (var L = 0; L < rawLines.length; L++) {
        var inRaw = countOf(rawLines[L], api);
        var inCode = countOf(codeLines[L] || '', api);
        if (inRaw > inCode) {
          excluded.push(name + ':' + (L + 1) + '  [' + api + ']  ' +
            rawLines[L].trim().slice(0, 76));
        }
      }
    }
  });

  if (total) rows.push({ file: name, total: total, hits: hits });
});

if (audit) {
  console.log('===== ทุกจุดที่ไม่นับ เพราะอยู่ในคำอธิบาย ข้อความ หรือรูปแบบการค้น =====');
  excluded.forEach(function (line) { console.log('  ' + line); });
  console.log('');
  console.log('รวม ' + excluded.length + ' จุด — ทุกบรรทัดต้องอธิบายได้ว่าทำไมไม่ใช่การเรียกใช้');
  return;
}

var grand = 0;
rows.forEach(function (r) { grand += r.total; });

console.log('===== การอ้างถึง API ของ Apps Script ที่เหลืออยู่ =====');
console.log('โฟลเดอร์: ' + dir);
console.log('');
if (!rows.length) {
  console.log('  ไม่เหลือเลยสักจุด');
} else {
  rows.sort(function (a, b) { return b.total - a.total; });
  rows.forEach(function (r) {
    var parts = Object.keys(r.hits)
      .sort(function (a, b) { return r.hits[b] - r.hits[a]; })
      .map(function (a) { return a + ' ' + r.hits[a]; });
    console.log('  ' + pad(r.file, 24) + pad(r.total, 6) + parts.join(' · '));
  });
}

console.log('');
console.log('----- แยกตาม API -----');
GROUPS.forEach(function (group) {
  var sum = 0;
  group[1].forEach(function (a) { sum += (byApi[a] || 0); });
  console.log('  ' + group[0] + ': ' + sum);
  group[1].forEach(function (a) {
    console.log('      ' + pad(a, 20) + (byApi[a] || 0));
  });
});

console.log('');
console.log('รวมทั้งโปรเจกต์: ' + grand + ' จุด ใน ' + rows.length + ' ไฟล์' +
  ' (จากทั้งหมด ' + files.length + ' ไฟล์)');
console.log('ไม่นับอีก ' + excluded.length + ' จุดที่อยู่ในคำอธิบาย ข้อความ หรือรูปแบบการค้น' +
  ' — ดูทุกจุดด้วย --audit');
