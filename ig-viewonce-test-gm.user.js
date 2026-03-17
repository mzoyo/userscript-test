// ==UserScript==
// @name        IG View Once (TEST v4.0)
// @description Test: iOS download methods
// @match       https://www.instagram.com/*
// @version     4.0
// @run-at      document-end
// @sandbox     JavaScript
// @grant       GM_xmlhttpRequest
// @grant       GM_addElement
// @grant       GM_setClipboard
// @grant       unsafeWindow
// @connect     *
// ==/UserScript==

(function() {
  'use strict';

  var w = unsafeWindow;
  var doc = w.document;
  if (w.self !== w.top) return;

  function toPage(fn) {
    if (typeof exportFunction === 'function') return exportFunction(fn, w);
    return fn;
  }

  // URL pública de test (no requiere login)
  var TEST_CDN_URL = 'https://scontent-mad2-1.cdninstagram.com/v/t51.82787-15/632642641_18686537284056421_4069743155608469683_n.jpg?stp=dst-jpg_e15_tt6&_nc_cat=1&ig_cache_key=MzgzNjI3NzM5NzMxODU3MDU0MDE4Njg2NTM3MjgxMDU2NDIx.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjEwODB4MTkyMC5zZHIuQzMifQ%3D%3D&_nc_ohc=URlBZpQuzfAQ7kNvwGToJNz&_nc_oc=Adk7WJBWOorcEHhRPKsj-Bx3iSE7r4bmpeJ-OR9evncSeBM8Jw0tb1TUKDHDk6vb8Fc&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-mad2-1.cdninstagram.com&_nc_gid=Tmo0F2lTJ_YeUEm2o1_L5A&_nc_ss=8&oh=00_AfwnBgA1YwLOD6twiFbYY6W9ZGduciSfEal2aSQXrTXgfA&oe=69BE34E3';

  // Inyectar el panel de test via blob (page context)
  var testCode = function(cdnUrl) {
    var panel = document.createElement('div');
    panel.id = 'igvo-dl-test-panel';
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#1a1a2e;color:#fff;font-family:monospace;font-size:11px;padding:12px 16px;padding-bottom:max(12px,env(safe-area-inset-bottom));max-height:70vh;overflow-y:auto;box-shadow:0 -2px 10px rgba(0,0,0,0.5);';

    var log = [];
    function addLog(msg) {
      log.push(msg);
      renderLog();
    }
    function renderLog() {
      var logDiv = document.getElementById('igvo-dl-log');
      if (logDiv) logDiv.innerHTML = log.map(function(l) { return '<div>' + l + '</div>'; }).join('');
    }

    var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
    html += '<span style="font-size:13px;font-weight:bold;">Download Tests v4.0</span>';
    html += '<span id="igvo-dl-close" style="font-size:18px;cursor:pointer;color:#888;padding:4px 8px;">✕</span>';
    html += '</div>';
    html += '<div style="margin-bottom:8px;font-size:10px;color:#888;">CDN: ' + (cdnUrl ? cdnUrl.substring(0, 60) + '...' : 'no encontrada') + '</div>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">';
    html += '<button id="igvo-t1" style="background:#007AFF;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;">1. fetch→share</button>';
    html += '<button id="igvo-t2" style="background:#007AFF;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;">2. fetch→a.dl</button>';
    html += '<button id="igvo-t3" style="background:#007AFF;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;">3. canvas→share</button>';
    html += '<button id="igvo-t4" style="background:#007AFF;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;">4. canvas→a.dl</button>';
    html += '<button id="igvo-t5" style="background:#30d158;color:#fff;border:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;">5. window.open</button>';
    html += '</div>';
    html += '<div id="igvo-dl-log" style="font-size:10px;line-height:1.6;"></div>';

    panel.innerHTML = html;
    document.body.appendChild(panel);

    document.getElementById('igvo-dl-close').onclick = function() { panel.remove(); };

    if (!cdnUrl) { addLog('ERROR: no CDN image found on page'); return; }

    // Test 1: fetch → blob → navigator.share (con File)
    document.getElementById('igvo-t1').onclick = function() {
      addLog('T1: fetching...');
      fetch(cdnUrl).then(function(r) {
        addLog('T1: status ' + r.status);
        return r.blob();
      }).then(function(blob) {
        addLog('T1: blob ' + blob.size + ' bytes, type: ' + blob.type);
        var file = new File([blob], 'test_photo.jpg', { type: blob.type || 'image/jpeg' });
        var canShare = navigator.canShare && navigator.canShare({ files: [file] });
        addLog('T1: canShare: ' + canShare);
        if (canShare) {
          return navigator.share({ files: [file] });
        } else {
          addLog('T1: canShare=false, skipped');
        }
      }).then(function() {
        addLog('T1: share OK');
      }).catch(function(e) {
        addLog('T1: ERROR ' + e.message);
      });
    };

    // Test 2: fetch → blob → <a download>
    document.getElementById('igvo-t2').onclick = function() {
      addLog('T2: fetching...');
      fetch(cdnUrl).then(function(r) { return r.blob(); }).then(function(blob) {
        addLog('T2: blob ' + blob.size);
        var blobUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = blobUrl;
        a.download = 'test_photo.jpg';
        a.click();
        addLog('T2: a.click() done');
        setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 5000);
      }).catch(function(e) {
        addLog('T2: ERROR ' + e.message);
      });
    };

    // Test 3: canvas crossOrigin → blob → navigator.share
    document.getElementById('igvo-t3').onclick = function() {
      addLog('T3: loading img...');
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        addLog('T3: img loaded ' + img.width + 'x' + img.height);
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        c.toBlob(function(blob) {
          addLog('T3: blob ' + blob.size);
          var file = new File([blob], 'test_photo.jpg', { type: 'image/jpeg' });
          var canShare = navigator.canShare && navigator.canShare({ files: [file] });
          addLog('T3: canShare: ' + canShare);
          if (canShare) {
            navigator.share({ files: [file] }).then(function() {
              addLog('T3: share OK');
            }).catch(function(e) { addLog('T3: share ERROR ' + e.message); });
          }
        }, 'image/jpeg', 0.95);
      };
      img.onerror = function() { addLog('T3: img load ERROR'); };
      img.src = cdnUrl;
    };

    // Test 4: canvas → blob → <a download>
    document.getElementById('igvo-t4').onclick = function() {
      addLog('T4: loading img...');
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() {
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        c.toBlob(function(blob) {
          addLog('T4: blob ' + blob.size);
          var blobUrl = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = blobUrl;
          a.download = 'test_photo.jpg';
          a.click();
          addLog('T4: a.click() done');
          setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 5000);
        }, 'image/jpeg', 0.95);
      };
      img.onerror = function() { addLog('T4: img ERROR'); };
      img.src = cdnUrl;
    };

    // Test 5: window.open (siempre funciona)
    document.getElementById('igvo-t5').onclick = function() {
      addLog('T5: opening...');
      window.open(cdnUrl, '_blank');
      addLog('T5: done');
    };
  };

  // Inyectar test con URL fija (no requiere login)
  setTimeout(function() {
    var code = '(' + testCode.toString() + ')(' + JSON.stringify(TEST_CDN_URL) + ');';
    var blob = new Blob([code], { type: 'application/javascript' });
    GM_addElement('script', { src: URL.createObjectURL(blob) });
  }, 1500);
})();
