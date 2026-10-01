/*
  ของจำลองของชั้นยิง HTTP — สองโหมดที่กินสถานการณ์เดียวกัน แต่แสดงผลคนละแบบ

  เหตุผลที่ต้องมีสองโหมด (SPEC 22.10)
  ---------------------------------------------------------------------------
  ของจำลองเดิมสร้างจากพฤติกรรมของ `UrlFetchApp` · ถ้ายกไปใช้กับ `fetch` ตรง ๆ
  โดยไม่วัดก่อน ของจำลองจะเขียวอยู่บนพฤติกรรมที่ไม่มีอยู่จริง ซึ่งแย่กว่าไม่มี
  ของจำลองเลย เพราะมันให้ความมั่นใจที่ผิด

  โหมดสองตัวนี้จึง **กินสถานการณ์ก้อนเดียวกัน** แล้วต่างกันเฉพาะวิธีที่ความล้มเหลว
  โผล่ออกมา · รันชุดเทสต์เดียวกันสองรอบแล้วเทียบ = เห็นเป็นตัวเลขว่าย้ายไป `fetch`
  แล้วข้อไหนพัง แทนที่จะเป็นความกังวล

  ทุกพฤติกรรมของโหมด fetch มาจากผลวัดของจริงที่ colo BKK 01-10-2026
  ดูตาราง "สัญญาของของจำลอง" ใน README · **ห้ามเติมข้อไหนจากการเดา**
*/
'use strict';

/** เพดานจำนวนคำขอย่อยต่อการเรียกหนึ่งครั้ง — วัดได้ 50 เป๊ะ (ข้อ 4) */
var SUBREQUEST_LIMIT = 50;

/** ข้อความที่ Cloudflare โยนเมื่อชนเพดาน — ของจริงคำต่อคำ */
var SUBREQUEST_MESSAGE =
  'Too many subrequests by single Worker invocation. To configure this limit, ' +
  'refer to https://developers.cloudflare.com/workers/wrangler/configuration/#limits';

/** เพดานความยาว URL ของ UrlFetchApp และข้อความที่มันโยน — ของจริงคำต่อคำ (กฎข้อ 29) */
var URLFETCH_URL_LIMIT = 2048;
var URLFETCH_URL_MESSAGE = 'Limit Exceeded: URLFetch URL Length.';

/* ---------------------------------------------------------------------------
 * โลกที่ทั้งสองโหมดใช้ร่วมกัน
 * --------------------------------------------------------------------------- */

/**
 * สถานการณ์ที่เป็นไปได้ — ตัวที่โหมดสองตัวตีความต่างกัน
 *
 *   ok        ปลายทางตอบจริง ไม่ว่ารหัสจะเป็นอะไร
 *   dnsFail   หาชื่อโดเมนไม่เจอ
 *   certFail  ใบรับรองไม่ตรงกับชื่อ
 *   hang      ปลายทางไม่ตอบภายในเวลาที่กำหนด
 */
function ok(status, body, headers) {
  return { kind: 'ok', status: status, body: body, headers: headers || {} };
}
function dnsFail() { return { kind: 'dnsFail' }; }
function certFail() { return { kind: 'certFail' }; }
function hang(ms) { return { kind: 'hang', ms: ms }; }

/**
 * โลกจำลอง — ตัดสินว่าคำขอหนึ่งควรได้สถานการณ์ไหน
 *
 * เริ่มต้นว่างเปล่าโดยตั้งใจ · **คำขอที่ไม่มีใครวางกฎไว้ต้องล้มดัง ๆ**
 * ไม่ใช่คืน 200 เปล่า ๆ ให้ผ่านไป · ของจำลองที่ตอบทุกอย่างว่าสำเร็จ
 * คือของจำลองที่ทำให้เทสต์เขียวโดยไม่ได้พิสูจน์อะไร
 */
function makeWorld() {
  var rules = [];
  var seen = [];

  return {
    /** วางกฎ: คำขอที่ตรง match จะได้สถานการณ์นั้น · match เป็น RegExp หรือฟังก์ชัน */
    when: function (match, outcome) {
      rules.push({ match: match, outcome: outcome });
      return this;
    },
    /** คำขอทั้งหมดที่ผ่านเข้ามา — ใช้ยืนยันว่ายิงไปกี่ครั้งและยิงอะไรไปบ้าง */
    requests: function () { return seen.slice(); },
    reset: function () { rules = []; seen = []; },

    resolve: function (request) {
      seen.push({ url: request.url, method: String(request.method || 'get').toLowerCase() });
      for (var i = rules.length - 1; i >= 0; i--) {
        var m = rules[i].match;
        var hit = (typeof m === 'function') ? m(request) : m.test(String(request.url));
        if (hit) return rules[i].outcome;
      }
      throw new Error(
        'ของจำลองไม่มีกฎสำหรับคำขอนี้: ' + String(request.method || 'get').toUpperCase() + ' ' +
        String(request.url).slice(0, 200) +
        ' · ต้องวางกฎด้วย world.when(...) ก่อน · ของจำลองที่เดาคำตอบให้เอง ' +
        'คือของจำลองที่ทำให้เทสต์เขียวโดยไม่ได้พิสูจน์อะไร (CLAUDE.md ข้อ 27)');
    }
  };
}

/* ---------------------------------------------------------------------------
 * โหมด A — UrlFetchApp (ของวันนี้)
 * --------------------------------------------------------------------------- */

/**
 * `UrlFetchApp` **โยน** เมื่อเครือข่ายล้มเหลวและเมื่อหมดเวลารอ
 * ซึ่งเป็นจุดที่ต่างจาก `fetch` มากที่สุด และเป็นที่มาของกฎข้อ 24 ทั้งข้อ
 */
function makeUrlFetchApp(world, counters, pg) {
  return {
    fetch: function (url, options) {
      counters.http++;
      var opt = options || {};

      if (String(url).length > URLFETCH_URL_LIMIT) {
        throw new Error(URLFETCH_URL_MESSAGE);
      }

      var outcome = world.resolve({ url: url, method: opt.method, headers: opt.headers, body: opt.payload });
      if (outcome.kind === 'postgrest') {
        outcome = Object.assign({ kind: 'ok' },
          pg.handle({ url: url, method: opt.method, headers: opt.headers, body: opt.payload }));
      }

      if (outcome.kind === 'dnsFail') throw new Error('DNS error: ' + String(url));
      if (outcome.kind === 'certFail') throw new Error('SSL error: ' + String(url));
      if (outcome.kind === 'hang') throw new Error('Address unavailable: ' + String(url));

      var headers = outcome.headers || {};
      return {
        getResponseCode: function () { return outcome.status; },
        getContentText: function () { return String(outcome.body === undefined ? '' : outcome.body); },
        getAllHeaders: function () { return Object.assign({}, headers); }
      };
    },

    fetchAll: function (requests) {
      var self = this;
      return (requests || []).map(function (r) { return self.fetch(r.url, r); });
    }
  };
}

/* ---------------------------------------------------------------------------
 * โหมด B — fetch บน Workers (ของวันหน้า)
 * --------------------------------------------------------------------------- */

/**
 * `fetch` **ไม่โยนเมื่อเครือข่ายล้มเหลว** — คืน Response ที่ Cloudflare สังเคราะห์
 *
 * วัดจริง 01-10-2026 ที่ colo BKK
 *   หาโดเมนไม่เจอ   → status 530 · body `error code: 1016`
 *   ใบรับรองไม่ตรง   → status 526 · body `error code: 526`
 *   ไม่มีเพดานเวลาในตัวที่สั้นกว่า 35 วินาที
 *   ไม่ลองใหม่ให้เอง ยิงหนึ่งครั้งปลายทางเห็นหนึ่งครั้ง
 *   เกิน 50 คำขอย่อยต่อการเรียกหนึ่งครั้ง → โยน
 *
 * **สิ่งเดียวที่โยนคือการยกเลิกที่เราสั่งเอง** กับการชนเพดานคำขอย่อย
 */
function makeFetch(world, counters, pg) {
  function synthetic(status, text) {
    return {
      status: status, ok: false,
      headers: { get: function (k) { return k.toLowerCase() === 'content-type' ? 'text/plain; charset=UTF-8' : null; } },
      text: function () { return Promise.resolve(text); }
    };
  }

  return async function fetchStub(url, init) {
    var opt = init || {};
    counters.http++;
    counters.subrequests++;

    // เพดานนี้ไม่มีอยู่บน Apps Script เลย ของจำลองเดิมจึงไม่มีทางมี (ข้อ 4)
    if (counters.subrequests > SUBREQUEST_LIMIT) {
      throw new Error(SUBREQUEST_MESSAGE);
    }

    if (opt.signal && opt.signal.aborted) {
      throw opt.signal.reason || new Error('aborted');
    }

    var outcome = world.resolve({ url: url, method: opt.method, headers: opt.headers, body: opt.body });
    if (outcome.kind === 'postgrest') {
      outcome = Object.assign({ kind: 'ok' },
        pg.handle({ url: url, method: opt.method, headers: opt.headers, body: opt.body }));
    }

    if (outcome.kind === 'dnsFail') return synthetic(530, 'error code: 1016');
    if (outcome.kind === 'certFail') return synthetic(526, 'error code: 526\n');

    if (outcome.kind === 'hang') {
      // ไม่มีเพดานในตัว · จบได้ทางเดียวคือมีคนยกเลิก
      return new Promise(function (resolve, reject) {
        if (!opt.signal) return;               // ไม่มีใครยกเลิก = ค้างตลอดไป ตรงกับของจริง
        opt.signal.addEventListener('abort', function () {
          reject(opt.signal.reason || new Error('aborted'));
        });
      });
    }

    var headers = outcome.headers || {};
    var lower = {};
    Object.keys(headers).forEach(function (k) { lower[k.toLowerCase()] = headers[k]; });

    return {
      status: outcome.status,
      ok: outcome.status >= 200 && outcome.status < 300,
      headers: { get: function (k) { var v = lower[String(k).toLowerCase()]; return v === undefined ? null : v; } },
      text: function () { return Promise.resolve(String(outcome.body === undefined ? '' : outcome.body)); },
      _allHeaders: lower
    };
  };
}

module.exports = {
  ok: ok, dnsFail: dnsFail, certFail: certFail, hang: hang,
  makeWorld: makeWorld, makeUrlFetchApp: makeUrlFetchApp, makeFetch: makeFetch,
  SUBREQUEST_LIMIT: SUBREQUEST_LIMIT, SUBREQUEST_MESSAGE: SUBREQUEST_MESSAGE,
  URLFETCH_URL_LIMIT: URLFETCH_URL_LIMIT, URLFETCH_URL_MESSAGE: URLFETCH_URL_MESSAGE
};
