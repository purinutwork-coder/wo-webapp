/*
  DriveApp จำลอง — ที่เก็บไฟล์ในหน่วยความจำ

  **ไม่ใช่ Drive ทั้งตัว** · มีเท่าที่ `06_Files.gs` เรียกใช้จริง ซึ่งนับได้จาก
  โค้ด ไม่ใช่เดา · ทุก `DriveApp.*` ใน `06_Files.gs` อยู่ในฟังก์ชัน `drive*_`
  ครบ 100% จึงเป็นชั้นที่ของจำลองเสียบได้สะอาด

  ความใจร้ายที่ตั้งใจใส่
    - **รหัสที่ไม่มีอยู่ต้องโยน** ด้วยข้อความเดียวกับของจริง
      (`Requested entity was not found` ซึ่งอ่านเหมือนถูกลบ ทั้งที่อาจเป็นเรื่องสิทธิ์
      — เป็นอาการที่ SPEC 16 บันทึกไว้ว่าเคยหลอกทีมมาแล้ว)
    - **ไฟล์ที่ถูกทิ้งลงถังยังอยู่** อ่านได้ ไม่หายไปเฉย ๆ
*/
'use strict';

var NOT_FOUND = 'Requested entity was not found.';

function makeDrive() {
  var nodes = new Map();     // id -> { id, name, isFolder, parent, data, mime, trashed, created }
  var nextId = 1;

  function makeId(prefix) { return prefix + String(nextId++).padStart(12, '0'); }

  function iterator(list) {
    var i = 0;
    return {
      hasNext: function () { return i < list.length; },
      next: function () {
        if (i >= list.length) throw new Error('No more items');
        return list[i++];
      }
    };
  }

  function childrenOf(parentId, wantFolder) {
    return Array.from(nodes.values())
      .filter(function (n) { return n.parent === parentId && n.isFolder === wantFolder && !n.trashed; })
      .map(wrap);
  }

  function wrap(node) {
    var api = {
      getId: function () { return node.id; },
      getName: function () { return node.name; },
      setName: function (name) { node.name = String(name); return api; },
      getUrl: function () {
        return 'https://drive.google.com/' + (node.isFolder ? 'drive/folders/' : 'file/d/') + node.id;
      },
      isTrashed: function () { return !!node.trashed; },
      setTrashed: function (yes) { node.trashed = !!yes; return api; },
      getDateCreated: function () { return node.created; },
      getParents: function () {
        var p = node.parent ? [wrap(nodes.get(node.parent))] : [];
        return iterator(p);
      }
    };

    if (node.isFolder) {
      api.createFolder = function (name) {
        var child = { id: makeId('folder-'), name: String(name), isFolder: true,
          parent: node.id, trashed: false, created: new Date() };
        nodes.set(child.id, child);
        return wrap(child);
      };
      api.createFile = function (a, b, c) {
        // รองรับทั้ง createFile(blob) และ createFile(name, content, mime)
        var name, data, mime;
        if (a && typeof a.getName === 'function') {
          name = a.getName(); data = a.getDataAsString(); mime = a.getContentType();
        } else {
          name = String(a); data = String(b === undefined ? '' : b); mime = c || 'text/plain';
        }
        var child = { id: makeId('file-'), name: name, isFolder: false, parent: node.id,
          data: data, mime: mime, trashed: false, created: new Date() };
        nodes.set(child.id, child);
        return wrap(child);
      };
      api.getFolders = function () { return iterator(childrenOf(node.id, true)); };
      api.getFiles = function () { return iterator(childrenOf(node.id, false)); };
      api.getFoldersByName = function (name) {
        return iterator(childrenOf(node.id, true).filter(function (f) { return f.getName() === String(name); }));
      };
      api.getFilesByName = function (name) {
        return iterator(childrenOf(node.id, false).filter(function (f) { return f.getName() === String(name); }));
      };
    } else {
      api.getSize = function () { return Buffer.byteLength(String(node.data || ''), 'utf8'); };
      api.getMimeType = function () { return node.mime || 'application/octet-stream'; };
      api.getBlob = function () {
        return {
          getBytes: function () { return Array.from(Buffer.from(String(node.data || ''))); },
          getDataAsString: function () { return String(node.data || ''); },
          getContentType: function () { return node.mime || 'application/octet-stream'; },
          getName: function () { return node.name; }
        };
      };
      api.getAs = function () { return api.getBlob(); };
      api.makeCopy = function (name, folder) {
        var parentId = folder ? folder.getId() : node.parent;
        var copy = { id: makeId('file-'), name: String(name || node.name), isFolder: false,
          parent: parentId, data: node.data, mime: node.mime, trashed: false, created: new Date() };
        nodes.set(copy.id, copy);
        return wrap(copy);
      };
    }

    return api;
  }

  function byId(id, wantFolder) {
    var node = nodes.get(String(id));
    // ของจริงโยนข้อความนี้ และมันอ่านเหมือน "ถูกลบ" ทั้งที่อาจเป็นเรื่องสิทธิ์ (SPEC 16)
    if (!node || node.isFolder !== wantFolder) throw new Error(NOT_FOUND);
    return wrap(node);
  }

  // รากของระบบ — มีตั้งแต่ต้น เพื่อให้ตั้ง DRIVE_ROOT_FOLDER_ID ได้ทันที
  var root = { id: makeId('folder-'), name: 'Web App', isFolder: true,
    parent: null, trashed: false, created: new Date() };
  nodes.set(root.id, root);

  return {
    rootId: root.id,
    DriveApp: {
      getFolderById: function (id) { return byId(id, true); },
      getFileById: function (id) { return byId(id, false); },
      createFolder: function (name) {
        var f = { id: makeId('folder-'), name: String(name), isFolder: true,
          parent: null, trashed: false, created: new Date() };
        nodes.set(f.id, f);
        return wrap(f);
      },
      getRootFolder: function () { return wrap(root); }
    },
    count: function () { return nodes.size; }
  };
}

module.exports = { makeDrive: makeDrive, NOT_FOUND: NOT_FOUND };
