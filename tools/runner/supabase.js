/*
  PostgREST จำลอง — พอให้ชุดเทสต์เดินได้ ไม่ใช่ Postgres ทั้งตัว

  **ของจำลองต้องใจร้ายเท่าของจริง** (CLAUDE.md ข้อ 27) · ความใจร้ายที่ตั้งใจใส่ไว้

    - **คืนสูงสุด 1,000 แถวต่อคำขอ และไม่แจ้งความผิดพลาดเมื่อมีมากกว่านั้น** (กฎข้อ 28)
      ของจริงเงียบสนิท · ของจำลองที่คืนครบทุกแถวจะทำให้โค้ดที่ลืมไล่อ่านทีละหน้า
      เขียวในเครื่องตลอดไป แล้วข้อมูลหายเงียบบนของจริงตอนตารางโตพอ

    - **GRANT ที่ขาดคืน `401` พร้อม `code 42501`** ไม่ใช่ 403 (วัดจริง 01-10-2026)

    - **คีย์ที่ไม่ถูกต้องคืน `401` ที่ไม่มี `code`** ซึ่งต่างจากข้างบนคนละเรื่อง

    - **RLS ที่กันอยู่คืน `200` พร้อม 0 แถว ไม่ใช่ error** (SPEC 22.2)

  **สิ่งที่ยังไม่ได้จำลอง** — ประกาศไว้ตรง ๆ ดีกว่าให้คนเข้าใจผิดว่าครบ
    - การเชื่อมตาราง (`select=a,b(c)`) · ธุรกรรม · ลำดับหลายคอลัมน์
    - ชนิดข้อมูลของ Postgres · การแปลงค่าอัตโนมัติ · constraint นอกจาก unique
    - `code` ของ Postgres นอกจาก 42501 และ 23505
*/
'use strict';

var MAX_ROWS = 1000;              // เพดานของ PostgREST ที่เงียบ (กฎข้อ 28)
var CODE_NO_GRANT = '42501';
var CODE_DUPLICATE = '23505';


/* ---------------------------------------------------------------------------
 * อ่านโครงสร้างจาก SQL จริง ไม่ใช่พิมพ์ไว้เอง
 *
 * DEFAULT · unique · primary key · และ ON DELETE CASCADE เป็นสิ่งที่ฐานข้อมูล
 * บังคับ ไม่ใช่สิ่งที่โค้ดจำ (กฎข้อ 25) · ของจำลองที่ไม่บังคับตามจะใจดีกว่าของจริง
 * แล้วเทสต์จะเขียวบนพฤติกรรมที่ไม่มีอยู่
 *
 * **และต้องอ่านจากไฟล์ ไม่ใช่พิมพ์รายการไว้** ด้วยเหตุผลเดียวกับที่ตัวรันอ่าน
 * รายชื่อไฟล์จากโฟลเดอร์ — คอลัมน์ใหม่ที่ใครเพิ่มใน SQL ต้องมีผลกับของจำลองเอง
 * โดยไม่มีใครต้องจำไปแก้สองที่
 * --------------------------------------------------------------------------- */

function parseSchema(sqlText) {
  var tables = {};
  var re = /create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z_0-9]+)\s*\(([\s\S]*?)\n\);/gi;
  var m;
  while ((m = re.exec(sqlText))) {
    var name = m[1];
    var inner = m[2];
    var spec = { defaults: {}, unique: [], primaryKey: [], references: [] };

    inner.split(/,\s*\n/).forEach(function (line) {
      var text = line.trim();
      if (!text || text.charAt(0) === '-') return;

      var col = /^([a-z_0-9]+)\s+/.exec(text);
      if (!col) return;
      var column = col[1];
      if (/^(primary|unique|constraint|foreign|check)$/i.test(column)) {
        var pk = /primary\s+key\s*\(([^)]+)\)/i.exec(text);
        if (pk) spec.primaryKey = pk[1].split(',').map(function (c) { return c.trim(); });
        var uq = /unique\s*\(([^)]+)\)/i.exec(text);
        if (uq) spec.unique.push(uq[1].split(',').map(function (c) { return c.trim(); }));
        return;
      }

      var def = /\bdefault\s+([^\s,]+(?:\([^)]*\))?)/i.exec(text);
      if (def) {
        var raw = def[1].replace(/::[a-z ]+$/i, '');
        var value;
        if (/^true$/i.test(raw)) value = true;
        else if (/^false$/i.test(raw)) value = false;
        else if (/^now\(\)$/i.test(raw)) value = '@now';
        else if (/^'.*'$/.test(raw)) value = raw.slice(1, -1);
        else if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw);
        else value = null;
        if (value !== null) spec.defaults[column] = value;
      }

      if (/\bprimary\s+key\b/i.test(text)) spec.primaryKey = [column];
      if (/\bunique\b/i.test(text)) spec.unique.push([column]);

      var ref = /\breferences\s+([a-z_0-9]+)\s*\(([^)]+)\)([^,]*)/i.exec(text);
      if (ref && /on\s+delete\s+cascade/i.test(ref[3] || '')) {
        spec.references.push({ parent: ref[1], parentColumn: ref[2].trim(), column: column });
      }
    });

    tables[name] = spec;
  }
  return tables;
}

function jsonBody(value) { return JSON.stringify(value); }

/** แปลงตัวกรองหนึ่งตัวเป็นฟังก์ชันคัดแถว · รองรับเท่าที่ระบบใช้จริง */
function predicate(column, expr) {
  var at = String(expr).indexOf('.');
  var op = at === -1 ? 'eq' : String(expr).slice(0, at);
  var raw = at === -1 ? String(expr) : String(expr).slice(at + 1);

  // PostgREST ถอดเครื่องหมายคำพูด **เฉพาะค่าที่อยู่ในวงเล็บ** (SPEC 22.2)
  function unquote(v) {
    var t = String(v).trim();
    return (t.length > 1 && t.charAt(0) === '"' && t.charAt(t.length - 1) === '"') ? t.slice(1, -1) : t;
  }
  function likeToRegExp(pattern) {
    // `*` ของ PostgREST คือ `%` ของ LIKE · ของจริงแทนโดยไม่สนขีดทับกลับ
    var escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/%/g, '.*');
    return new RegExp('^' + escaped + '$');
  }

  switch (op) {
    case 'eq':  return function (r) { return String(r[column]) === raw; };
    case 'neq': return function (r) { return String(r[column]) !== raw; };
    case 'gt':  return function (r) { return String(r[column]) >  raw; };
    case 'gte': return function (r) { return String(r[column]) >= raw; };
    case 'lt':  return function (r) { return String(r[column]) <  raw; };
    case 'lte': return function (r) { return String(r[column]) <= raw; };
    case 'is':  return function (r) {
      if (raw === 'null') return r[column] === null || r[column] === undefined;
      if (raw === 'true') return r[column] === true;
      if (raw === 'false') return r[column] === false;
      return false;
    };
    case 'in': {
      var inner = raw.replace(/^\(/, '').replace(/\)$/, '');
      var values = inner.length ? inner.split(',').map(unquote) : [];
      return function (r) { return values.indexOf(String(r[column])) !== -1; };
    }
    case 'like':  { var re = likeToRegExp(unquote(raw)); return function (r) { return re.test(String(r[column])); }; }
    case 'ilike': { var ri = new RegExp(likeToRegExp(unquote(raw)).source, 'i'); return function (r) { return ri.test(String(r[column])); }; }
    default: return function () { return true; };
  }
}

/**
 * สร้าง PostgREST จำลองหนึ่งตัว
 *
 * @param {Object} options  tables · grants · rpc
 * @return {Object} { handle, seed, rows, state }
 */
function makePostgrest(options) {
  var opt = options || {};
  var tables = {};                              // ชื่อตารางฝั่งฐานข้อมูล -> แถว
  var granted = opt.grants === undefined ? null : opt.grants;   // null = ให้ทุกตาราง
  var rpc = Object.assign({}, opt.rpc || {});
  var calls = [];
  var schema = opt.schema || {};

  /** เติมค่าตั้งต้นที่ฐานข้อมูลเติมให้เอง — ความหมายของช่องว่างอยู่ที่ DEFAULT (กฎข้อ 25) */
  function applyDefaults(table, row) {
    var spec = schema[table];
    if (!spec) return row;
    Object.keys(spec.defaults).forEach(function (col) {
      if (row[col] === undefined || row[col] === null || row[col] === '') {
        var v = spec.defaults[col];
        row[col] = (v === '@now') ? new Date().toISOString() : v;
      }
    });
    return row;
  }

  /** คีย์ที่ห้ามซ้ำ — ของจริงปฏิเสธด้วย 409 code 23505 ไม่ใช่เขียนทับเงียบ ๆ */
  function duplicateOf(table, row, existing) {
    var spec = schema[table];
    if (!spec) return null;
    var keys = spec.unique.slice();
    if (spec.primaryKey.length) keys.push(spec.primaryKey);
    for (var i = 0; i < keys.length; i++) {
      var cols = keys[i];
      var clash = existing.some(function (r) {
        return cols.every(function (c) {
          return r[c] !== undefined && row[c] !== undefined && String(r[c]) === String(row[c]);
        });
      });
      if (clash) return cols;
    }
    return null;
  }

  /** ลบลูกตาม ON DELETE CASCADE ที่ประกาศไว้ใน SQL จริง */
  function cascade(parentTable, removedRows, tablesRef) {
    var total = 0;
    Object.keys(schema).forEach(function (child) {
      schema[child].references.forEach(function (ref) {
        if (ref.parent !== parentTable) return;
        var keep = [];
        var killed = 0;
        (tablesRef[child] || []).forEach(function (r) {
          var orphan = removedRows.some(function (p) {
            return String(p[ref.parentColumn]) === String(r[ref.column]);
          });
          if (orphan) killed++; else keep.push(r);
        });
        if (killed) {
          var gone = (tablesRef[child] || []).filter(function (r) { return keep.indexOf(r) === -1; });
          tablesRef[child] = keep;
          total += killed + cascade(child, gone, tablesRef);
        }
      });
    });
    return total;
  }

  function store(name) {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function denyGrant(table) {
    return {
      status: 401,
      body: jsonBody({
        code: CODE_NO_GRANT,
        details: null,
        hint: 'Grant the required privileges to the current role with: GRANT SELECT ON public.' + table + ' TO anon;',
        message: 'permission denied for table ' + table
      })
    };
  }

  return {
    /** ใส่ข้อมูลตั้งต้น · ชื่อตารางเป็นชื่อฝั่งฐานข้อมูล (ตัวพิมพ์เล็ก) */
    seed: function (table, rows) {
      tables[table] = (rows || []).map(function (r) { return Object.assign({}, r); });
      return this;
    },
    rows: function (table) { return (tables[table] || []).map(function (r) { return Object.assign({}, r); }); },
    calls: function () { return calls.slice(); },
    defineRpc: function (name, fn) { rpc[name] = fn; return this; },

    /** จัดการคำขอหนึ่งคำขอ · คืน { status, body, headers } ในรูปของ outcome */
    handle: function (request) {
      var url = String(request.url);
      var method = String(request.method || 'get').toLowerCase();
      var at = url.indexOf('/rest/v1');
      if (at === -1) return { status: 404, body: jsonBody({ message: 'ไม่ใช่เส้นทางของ PostgREST' }) };

      var rest = url.slice(at + '/rest/v1'.length);
      var qAt = rest.indexOf('?');
      var pathname = (qAt === -1 ? rest : rest.slice(0, qAt)).replace(/^\//, '');
      var query = qAt === -1 ? '' : rest.slice(qAt + 1);
      var params = new URLSearchParams(query);
      calls.push({ method: method, path: pathname, query: query });

      /* ---------- RPC ---------- */
      if (pathname.indexOf('rpc/') === 0) {
        var fnName = pathname.slice('rpc/'.length);
        if (!Object.prototype.hasOwnProperty.call(rpc, fnName)) {
          return {
            status: 404,
            body: jsonBody({
              code: 'PGRST202', details: null,
              hint: 'Perhaps you meant to call a different function',
              message: 'Could not find the function public.' + fnName + ' in the schema cache'
            })
          };
        }
        var args = {};
        try { args = JSON.parse(request.body || '{}'); } catch (e) { args = {}; }
        return { status: 200, body: jsonBody(rpc[fnName](args, tables)) };
      }

      var table = pathname;
      if (granted && granted.indexOf(table) === -1) return denyGrant(table);

      var rowsOf = store(table);

      /* ---------- ตัวกรอง ---------- */
      var tests = [];
      params.forEach(function (value, key) {
        if (['select', 'order', 'limit', 'offset', 'on_conflict'].indexOf(key) !== -1) return;
        tests.push(predicate(key, value));
      });
      function matches(r) { return tests.every(function (t) { return t(r); }); }

      if (method === 'get') {
        var picked = rowsOf.filter(matches);

        var order = params.get('order');
        if (order) {
          var parts = String(order).split('.');
          var col = parts[0];
          var desc = parts.indexOf('desc') !== -1;
          picked = picked.slice().sort(function (a, b) {
            var x = String(a[col] === undefined ? '' : a[col]);
            var y = String(b[col] === undefined ? '' : b[col]);
            return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1);
          });
        }

        var total = picked.length;
        var offset = Number(params.get('offset') || '0');
        var limit = params.get('limit') === null ? MAX_ROWS : Math.min(Number(params.get('limit')), MAX_ROWS);
        // **ตัดที่ 1,000 เงียบ ๆ เหมือนของจริง** ห้ามโยน ห้ามเตือน (กฎข้อ 28)
        var page = picked.slice(offset, offset + limit);

        var select = params.get('select');
        if (select && select !== '*') {
          var want = select.split(',').map(function (c) { return c.trim(); }).filter(Boolean);
          page = page.map(function (r) {
            var out = {};
            want.forEach(function (c) { if (c in r) out[c] = r[c]; });
            return out;
          });
        }

        var headers = {};
        var prefer = (request.headers && (request.headers.Prefer || request.headers.prefer)) || '';
        if (String(prefer).indexOf('count=exact') !== -1) {
          headers['content-range'] = offset + '-' + (offset + page.length - 1) + '/' + total;
        }
        return { status: 200, body: jsonBody(page), headers: headers };
      }

      if (method === 'post') {
        var incoming = [];
        try { incoming = JSON.parse(request.body || '[]'); } catch (e) { incoming = []; }
        if (!(incoming instanceof Array)) incoming = [incoming];
        var added = incoming.map(function (r) { return applyDefaults(table, Object.assign({}, r)); });
        var onConflict = params.get('on_conflict');
        for (var ai = 0; ai < added.length; ai++) {
          var clashCols = duplicateOf(table, added[ai], rowsOf);
          if (clashCols) {
            if (onConflict) {
              // upsert — ทับแถวเดิมแทนที่จะปฏิเสธ
              var keyCols = String(onConflict).split(',').map(function (c) { return c.trim(); });
              for (var ri = 0; ri < rowsOf.length; ri++) {
                var same = keyCols.every(function (c) { return String(rowsOf[ri][c]) === String(added[ai][c]); });
                if (same) { Object.assign(rowsOf[ri], added[ai]); break; }
              }
              added.splice(ai, 1); ai--;
              continue;
            }
            return {
              status: 409,
              body: jsonBody({
                code: CODE_DUPLICATE, details: null,
                hint: null,
                message: 'duplicate key value violates unique constraint "' + table + '_' + clashCols.join('_') + '_key"'
              })
            };
          }
          rowsOf.push(added[ai]);
        }
        var wantRows = String((request.headers && (request.headers.Prefer || request.headers.prefer)) || '')
          .indexOf('return=representation') !== -1;
        return { status: 201, body: jsonBody(wantRows ? added : []) };
      }

      if (method === 'patch') {
        var patch = {};
        try { patch = JSON.parse(request.body || '{}'); } catch (e) { patch = {}; }
        var touched = [];
        rowsOf.forEach(function (r) { if (matches(r)) { Object.assign(r, patch); touched.push(Object.assign({}, r)); } });
        return { status: 200, body: jsonBody(touched) };
      }

      if (method === 'delete') {
        var removed = rowsOf.filter(matches);
        tables[table] = rowsOf.filter(function (r) { return !matches(r); });
        cascade(table, removed, tables);
        return { status: 200, body: jsonBody(removed) };
      }

      return { status: 405, body: jsonBody({ message: 'วิธีนี้ไม่รองรับในของจำลอง: ' + method }) };
    }
  };
}

module.exports = { makePostgrest: makePostgrest, parseSchema: parseSchema, MAX_ROWS: MAX_ROWS, CODE_NO_GRANT: CODE_NO_GRANT, CODE_DUPLICATE: CODE_DUPLICATE };
