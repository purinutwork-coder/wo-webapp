/*
  ตัดคำอธิบาย ข้อความ และรูปแบบการค้นออก เหลือแต่โค้ดที่ทำงานจริง

  **มีที่เดียวในโปรเจกต์** เพราะเคยมีสองตัวแล้วตัวที่สองพังทันที
  ด้วยอาการที่ตัวแรกเขียนเตือนไว้คำต่อคำ (01-10-2026) — กราฟการเรียกที่ควรได้
  406 ฟังก์ชัน ได้ 8 ฟังก์ชัน เพราะ regex ที่มีฟันหนูข้างในกลืนทั้งไฟล์

  **เดินทีละตัวอักษร ไม่ใช่ไล่แทนที่ด้วยรูปแบบ** · สองอย่างที่การไล่แทนที่ทำพังจริง
    - ฟันหนูเดี่ยวที่อยู่ข้างในข้อความที่ครอบด้วยฟันหนูคู่ จะไปจับคู่กับตัวถัดไป
      ที่อยู่ไกลออกไป แล้วกลืนโค้ดจริงที่คั่นตรงกลาง — 10_Web.gs หายไป 3 จุดจาก 6
    - รูปแบบการค้นที่มีฟันหนูอยู่ข้างใน เช่น /[\/:*?"<>|]/g ใน 06_Files.gs
      จะเปิดข้อความค้างไว้แล้วกลืนทั้งไฟล์ — DriveApp 31 จุดกลายเป็นศูนย์

  **ผลลัพธ์ยาวเท่าต้นฉบับเสมอ** ทุกตัวอักษรที่ตัดออกถูกแทนด้วยช่องว่าง
  และขึ้นบรรทัดใหม่ถูกเก็บไว้ · เครื่องมือที่ต้องใช้ตำแหน่งตัวอักษรเพื่อแทรกข้อความ
  (เช่น tools/add_await.js) จึงใช้ผลนี้อ้างอิงตำแหน่งในต้นฉบับได้ตรง ๆ
  — ตัวตัดที่เปลี่ยนความยาวบังคับให้ผู้ใช้คำนวณตำแหน่งเอง ซึ่งพลาดเงียบ
*/
'use strict';

var NL = String.fromCharCode(10);

/** แทนช่วงที่ตัดออกด้วยช่องว่าง โดยเก็บขึ้นบรรทัดใหม่ไว้ให้เลขบรรทัดไม่เลื่อน */
function blank(chunk) {
  var out = '';
  for (var i = 0; i < chunk.length; i++) out += (chunk.charAt(i) === NL) ? NL : ' ';
  return out;
}

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
      out.push(blank(src.slice(i, stop)));
      i = stop;
      continue;
    }

    if (two === '//' && src.charAt(i - 1) !== ':') {
      stop = src.indexOf(NL, i);
      stop = (stop === -1) ? src.length : stop;
      out.push(blank(src.slice(i, stop)));
      i = stop;
      continue;
    }

    if (src.substr(i, 4) === '<!--') {
      stop = src.indexOf('-->', i + 4);
      stop = (stop === -1) ? src.length : stop + 3;
      out.push(blank(src.slice(i, stop)));
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
      out.push(blank(src.slice(sFrom, i)));
      last = ')';
      continue;
    }

    if (c === '/' && (last === '' || BEFORE_REGEX.indexOf(last) !== -1)) {
      var rFrom = i;
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
      out.push(blank(src.slice(rFrom, i)));
      last = ')';   // ผลของรูปแบบการค้นเป็นค่า ตัว / ที่ตามมาจึงเป็นการหาร
      continue;
    }

    out.push(c);
    if (!/\s/.test(c)) last = c;
    i++;
  }

  var result = out.join('');
  if (result.length !== src.length) {
    throw new Error('codeOnly เปลี่ยนความยาวของข้อความ (' + src.length + ' -> ' +
      result.length + ') ซึ่งทำให้ตำแหน่งตัวอักษรของผู้เรียกผิดทั้งหมด');
  }
  return result;
}

module.exports = { codeOnly: codeOnly };
