/*
  ของจำลองของ API ที่ Apps Script มีให้ — ตัวที่ไม่เกี่ยวกับ HTTP

  **ของจำลองต้องใจร้ายเท่าของจริง** (CLAUDE.md ข้อ 27) · ทุกเพดาน ทุกการปฏิเสธ
  ทุกการแปลงค่าที่ของจริงทำ ของจำลองต้องทำเหมือนกัน · ของจำลองที่ใจดีกว่าของจริง
  คือเทสต์ที่ผ่านแล้วโกหก

  **ห้ามเติมของที่มีแต่ในเบราว์เซอร์ให้เป็น global** (`setTimeout` `document` `window`)
  เคยเกิดจริง 29-09-2026: สามชุดแดงบนของจริงด้วย `setTimeout is not defined`
  แต่เขียวบนตัวรันจำลองมาตลอด เพราะ Node มีของพวกนี้ให้อยู่แล้ว
*/
'use strict';
var crypto = require('crypto');

/** รายการที่ใช้นับว่าตัวรันถูกเรียกอะไรไปบ้าง — ตัวเลขนี้พยากรณ์เวลาบนของจริงได้ */
function newCounters() {
  return { logger: 0, formatDate: 0, digest: 0, uuid: 0, props: 0, cacheGet: 0, cachePut: 0, lock: 0 };
}

/**
 * จัดรูปเวลาตามโซนที่สั่ง — ของจริงเปลี่ยนโซนให้จริง ไม่ใช่แค่ต่อท้าย
 *
 * ถ้าของจำลองไม่แปลงโซน บั๊กเลื่อน 7 ชั่วโมงจะไม่มีวันถูกจับได้ในเครื่อง
 * แล้วไปโผล่บนของจริงแทน ซึ่งเป็นบั๊กที่โปรเจกต์นี้เจอมาแล้ว (กฎข้อ 19)
 */
function formatDate(date, timeZone, pattern) {
  var parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date).reduce(function (acc, p) { acc[p.type] = p.value; return acc; }, {});

  // 24 นาฬิกาเที่ยงคืนบางสภาพแวดล้อมคืน '24' ซึ่งไม่ใช่เวลาที่มีอยู่จริง
  if (parts.hour === '24') parts.hour = '00';

  return String(pattern)
    .replace(/yyyy/g, parts.year)
    .replace(/MM/g, parts.month)
    .replace(/dd/g, parts.day)
    .replace(/HH/g, parts.hour)
    .replace(/mm/g, parts.minute)
    .replace(/ss/g, parts.second);
}

/**
 * แฮชแล้วคืน **ไบต์ที่มีเครื่องหมาย** (-128 ถึง 127) เหมือน Apps Script เป๊ะ
 *
 * ของจริงคืนไบต์ที่มีเครื่องหมาย และ `bytesToHex_` ใน 07_Auth.gs แปลงด้วย
 * `(b + 256) % 256` เพราะรู้เรื่องนี้ · ถ้าของจำลองคืนไบต์ไม่มีเครื่องหมาย
 * ผลจะบังเอิญเท่ากัน แต่เราจะไม่มีวันรู้ว่าโค้ดที่เขียนใหม่วันหน้าพึ่งสิ่งไหนอยู่
 */
function computeDigest(_algorithm, value) {
  var buf = crypto.createHash('sha256').update(String(value), 'utf8').digest();
  var out = [];
  for (var i = 0; i < buf.length; i++) out.push(buf[i] > 127 ? buf[i] - 256 : buf[i]);
  return out;
}

/**
 * สร้างชุด global ของ Apps Script
 *
 * @param {Object} options  timeZone · activeUserEmail · scriptProperties
 * @return {Object} { globals, counters, state }
 */
function makeGasGlobals(options) {
  var opt = options || {};
  var timeZone = opt.timeZone || 'Asia/Bangkok';
  var counters = newCounters();
  var lines = [];
  var props = Object.assign({}, opt.scriptProperties || {});
  var cache = new Map();

  /*
    เพดานของแคชที่ของจริงมี และต้องมีในของจำลองด้วย
    ค่าเดียวเกิน 100 KB เก็บไม่ได้ และของจริง **ไม่โยน** มันเงียบไปเฉย ๆ
    ซึ่งเป็นอาการที่ทำให้ดัชนีหน้าแรกชนเพดานที่ราว 2,293 ใบแล้วไม่มีใครรู้
  */
  var CACHE_MAX_VALUE_BYTES = 100 * 1024;

  var globals = {
    Logger: {
      log: function (text) { counters.logger++; lines.push(String(text)); }
    },

    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256', SHA_1: 'SHA_1', MD5: 'MD5' },
      formatDate: function (date, tz, pattern) {
        counters.formatDate++;
        return formatDate(date, tz || timeZone, pattern);
      },
      computeDigest: function (alg, value) { counters.digest++; return computeDigest(alg, value); },
      getUuid: function () { counters.uuid++; return crypto.randomUUID(); },
      base64Encode: function (value) { return Buffer.from(String(value), 'utf8').toString('base64'); },
      base64Decode: function (value) {
        var buf = Buffer.from(String(value), 'base64');
        var out = [];
        for (var i = 0; i < buf.length; i++) out.push(buf[i] > 127 ? buf[i] - 256 : buf[i]);
        return out;
      },
      newBlob: function (data, contentType, name) {
        return {
          getBytes: function () { return Array.from(Buffer.from(String(data))); },
          getDataAsString: function () { return String(data); },
          getContentType: function () { return contentType || 'application/octet-stream'; },
          getName: function () { return name || 'blob'; }
        };
      },
      // ของจริงหยุดสคริปต์จริง ๆ · ของจำลองนับไว้เฉย ๆ แล้วไม่หยุด
      // เพราะการหยุดจริงทำให้ชุดเทสต์ช้าโดยไม่ได้พิสูจน์อะไรเพิ่ม
      sleep: function (ms) { counters.sleptMs = (counters.sleptMs || 0) + Number(ms || 0); }
    },

    PropertiesService: {
      getScriptProperties: function () {
        counters.props++;
        return {
          // ของจริงคืน null เมื่อไม่มีคีย์ ไม่ใช่ undefined หรือข้อความว่าง
          getProperty: function (key) {
            return Object.prototype.hasOwnProperty.call(props, key) ? String(props[key]) : null;
          },
          setProperty: function (key, value) { props[key] = String(value); return this; },
          deleteProperty: function (key) { delete props[key]; return this; },
          getProperties: function () { return Object.assign({}, props); }
        };
      }
    },

    CacheService: {
      getScriptCache: function () {
        return {
          get: function (key) {
            counters.cacheGet++;
            var hit = cache.get(String(key));
            return hit === undefined ? null : hit;   // ของจริงคืน null ไม่ใช่ undefined
          },
          put: function (key, value, _seconds) {
            counters.cachePut++;
            var text = String(value);
            // เกินเพดานแล้วเงียบ — เหมือนของจริงทุกประการ ห้ามโยน
            if (Buffer.byteLength(text, 'utf8') > CACHE_MAX_VALUE_BYTES) return;
            cache.set(String(key), text);
          },
          getAll: function (keys) {
            counters.cacheGet++;
            var out = {};
            (keys || []).forEach(function (k) {
              var hit = cache.get(String(k));
              if (hit !== undefined) out[String(k)] = hit;   // คีย์ที่ไม่มี ต้องไม่โผล่ในผล
            });
            return out;
          },
          putAll: function (values, _seconds) {
            counters.cachePut++;
            Object.keys(values || {}).forEach(function (k) {
              var text = String(values[k]);
              if (Buffer.byteLength(text, 'utf8') > CACHE_MAX_VALUE_BYTES) return;
              cache.set(String(k), text);
            });
          },
          remove: function (key) { cache.delete(String(key)); },
          removeAll: function (keys) { (keys || []).forEach(function (k) { cache.delete(String(k)); }); }
        };
      }
    },

    LockService: {
      getScriptLock: function () {
        counters.lock++;
        return {
          tryLock: function () { return true; },
          waitLock: function () { return undefined; },
          releaseLock: function () { return undefined; },
          hasLock: function () { return true; }
        };
      }
    },

    Session: {
      getScriptTimeZone: function () { return timeZone; },
      getActiveUser: function () {
        return { getEmail: function () { return opt.activeUserEmail || ''; } };
      },
      getEffectiveUser: function () {
        return { getEmail: function () { return opt.effectiveUserEmail || opt.activeUserEmail || ''; } };
      }
    }
  };

  return {
    globals: globals,
    counters: counters,
    state: { props: props, cache: cache, logLines: lines },
    cacheMaxValueBytes: CACHE_MAX_VALUE_BYTES
  };
}

module.exports = { makeGasGlobals: makeGasGlobals, formatDate: formatDate, computeDigest: computeDigest };
