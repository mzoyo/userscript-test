// ==UserScript==
// @name        IG View Once (TEST GM v2)
// @description Test: compatibility checks
// @match       https://www.instagram.com/*
// @version     2.1-test-gm
// @run-at      document-end
// @sandbox     JavaScript
// @grant       GM_xmlhttpRequest
// @grant       GM_addElement
// @grant       GM_setClipboard
// @grant       unsafeWindow
// @connect     httpbin.org
// @connect     *.supabase.co
// ==/UserScript==

(function() {
  'use strict';

  if (unsafeWindow.self !== unsafeWindow.top) return;

  var results = [];
  var totalAsync = 4;
  var asyncDone = 0;

  // Test 1
  try {
    var fn = new Function('return 1+1');
    var r = fn();
    results.push({ test: 'new Function()', ok: r === 2, detail: 'resultado: ' + r });
  } catch(e) {
    results.push({ test: 'new Function()', ok: false, detail: e.message });
  }

  // Test 2
  try {
    var ev = eval('1+1');
    results.push({ test: 'eval()', ok: ev === 2, detail: 'resultado: ' + ev });
  } catch(e) {
    results.push({ test: 'eval()', ok: false, detail: e.message });
  }

  // Test 3
  try {
    var remoteCode = 'var csrf = w.document.cookie.match(/csrftoken=([^;]+)/); return csrf ? csrf[1] : "no-csrf";';
    var remoteFn = new Function('w', remoteCode);
    var csrfResult = remoteFn(unsafeWindow);
    results.push({
      test: 'Function + DOM',
      ok: csrfResult !== 'no-csrf',
      detail: csrfResult !== 'no-csrf' ? 'OK' : 'NO'
    });
  } catch(e) {
    results.push({ test: 'Function + DOM', ok: false, detail: e.message });
  }

  // Test 4
  try {
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://httpbin.org/get',
      onload: function(response) {
        try {
          var data = JSON.parse(response.responseText);
          results.push({ test: 'XHR cross-origin', ok: true, detail: 'OK' });
        } catch(e) {
          results.push({ test: 'XHR cross-origin', ok: false, detail: e.message });
        }
        checkDone();
      },
      onerror: function() {
        results.push({ test: 'XHR cross-origin', ok: false, detail: 'error' });
        checkDone();
      }
    });
  } catch(e) {
    results.push({ test: 'XHR cross-origin', ok: false, detail: e.message });
    checkDone();
  }

  // Test 5
  try {
    unsafeWindow.__igvo_blob_gm_test = false;
    var blobCode = 'window.__igvo_blob_gm_test = true;';
    var blob = new Blob([blobCode], { type: 'application/javascript' });
    var blobUrl = URL.createObjectURL(blob);
    GM_addElement('script', { src: blobUrl });
    setTimeout(function() {
      results.push({
        test: 'addElement blob',
        ok: unsafeWindow.__igvo_blob_gm_test === true,
        detail: unsafeWindow.__igvo_blob_gm_test ? 'OK' : 'blocked'
      });
      checkDone();
    }, 500);
  } catch(e) {
    results.push({ test: 'addElement blob', ok: false, detail: e.message });
    checkDone();
  }

  // Test 6
  try {
    var simCode = [
      'var doc = w.document;',
      'var csrf = doc.cookie.match(/csrftoken=([^;]+)/);',
      'var div = doc.createElement("div");',
      'div.id = "igvo-remote-test";',
      'div.style.cssText = "display:none";',
      'div.textContent = csrf ? csrf[1] : "fail";',
      'doc.body.appendChild(div);',
      'return div.id;'
    ].join('\n');

    var execFn = new Function('w', 'GM_xhr', simCode);
    var execResult = execFn(unsafeWindow, GM_xmlhttpRequest);
    var testDiv = unsafeWindow.document.getElementById('igvo-remote-test');
    var domOk = testDiv && testDiv.textContent !== 'fail';

    results.push({
      test: 'remote exec + DOM',
      ok: execResult === 'igvo-remote-test' && domOk,
      detail: (execResult === 'igvo-remote-test' && domOk) ? 'OK' : 'parcial'
    });
    if (testDiv) testDiv.remove();
  } catch(e) {
    results.push({ test: 'remote exec + DOM', ok: false, detail: e.message });
  }

  // Test 7
  try {
    var csrfCookie = unsafeWindow.document.cookie.match(/csrftoken=([^;]+)/);
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://www.instagram.com/api/v1/direct_v2/inbox/?limit=1',
      headers: {
        'x-ig-app-id': '936619743392459',
        'x-csrftoken': csrfCookie ? csrfCookie[1] : '',
        'x-requested-with': 'XMLHttpRequest'
      },
      anonymous: false,
      onload: function(response) {
        results.push({
          test: 'IG API',
          ok: response.status === 200,
          detail: 'status ' + response.status
        });
        checkDone();
      },
      onerror: function() {
        results.push({ test: 'IG API', ok: false, detail: 'error' });
        checkDone();
      }
    });
  } catch(e) {
    results.push({ test: 'IG API', ok: false, detail: e.message });
    checkDone();
  }

  // Test 8
  try {
    var iframe = unsafeWindow.document.createElement('iframe');
    iframe.style.cssText = 'display:none!important;width:0;height:0;';
    iframe.src = 'about:blank';
    unsafeWindow.document.body.appendChild(iframe);
    setTimeout(function() {
      try {
        var iframeFn = iframe.contentWindow.Function('return 2+2');
        var iframeResult = iframeFn();
        results.push({
          test: 'iframe Function()',
          ok: iframeResult === 4,
          detail: 'resultado: ' + iframeResult
        });
      } catch(e) {
        results.push({ test: 'iframe Function()', ok: false, detail: e.message });
      }
      iframe.remove();
      checkDone();
    }, 300);
  } catch(e) {
    results.push({ test: 'iframe Function()', ok: false, detail: e.message });
    checkDone();
  }

  showResults(results);

  function checkDone() {
    asyncDone++;
    showResults(results);
  }

  // Helper: exportar función al contexto de la página
  // En @sandbox JavaScript, las funciones del sandbox no se pueden usar
  // como event handlers directamente en elementos de la página.
  // exportFunction (API de Firefox) soluciona esto.
  function pageHandler(fn) {
    if (typeof exportFunction === 'function') {
      return exportFunction(fn, unsafeWindow);
    }
    return fn; // fallback si no existe (otros navegadores)
  }

  function copyResults() {
    var text = results.map(function(r) {
      return (r.ok ? 'OK' : 'FAIL') + ' | ' + r.test + ' | ' + r.detail;
    }).join('\n');

    var ua = (unsafeWindow.navigator || navigator).userAgent || '';
    var platform = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'Desktop';
    text = 'Tests — ' + platform + '\n' + text;

    // GM_setClipboard (más fiable en sandbox)
    try {
      GM_setClipboard(text, 'text');
      return true;
    } catch(e) {}

    // Fallback: clipboard API
    try {
      navigator.clipboard.writeText(text);
      return true;
    } catch(e) {}

    return false;
  }

  function showResults(res) {
    var doc = unsafeWindow.document;
    var existing = doc.getElementById('igvo-csp-banner');
    if (existing) existing.remove();

    var banner = doc.createElement('div');
    banner.id = 'igvo-csp-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
      'background:#1a1a2e;color:#fff;font-family:monospace;font-size:11px;' +
      'padding:12px 16px;padding-top:max(12px, env(safe-area-inset-top));' +
      'line-height:1.8;box-shadow:0 2px 10px rgba(0,0,0,0.5);max-height:85vh;overflow-y:auto;';

    // Header
    var header = doc.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
    var title = doc.createElement('span');
    title.style.cssText = 'font-size:13px;font-weight:bold;';
    title.textContent = 'Tests v2.1';
    var closeX = doc.createElement('span');
    closeX.style.cssText = 'font-size:18px;cursor:pointer;padding:4px 8px;color:#888;';
    closeX.textContent = '✕';
    closeX.onclick = pageHandler(function() { banner.remove(); });
    header.appendChild(title);
    header.appendChild(closeX);
    banner.appendChild(header);

    // Results
    res.forEach(function(r) {
      var line = doc.createElement('div');
      line.textContent = (r.ok ? '✅' : '❌') + ' ' + r.test + ': ' + r.detail;
      banner.appendChild(line);
    });

    // Pending
    if (asyncDone < totalAsync) {
      var pending = doc.createElement('div');
      pending.style.cssText = 'margin-top:4px;color:#ffd700;';
      pending.textContent = '⏳ ' + (totalAsync - asyncDone) + ' pendiente(s)...';
      banner.appendChild(pending);
    }

    // Copy button
    var btnWrap = doc.createElement('div');
    btnWrap.style.cssText = 'margin-top:10px;';
    var copyBtn = doc.createElement('button');
    copyBtn.textContent = 'Copiar';
    copyBtn.style.cssText = 'background:#007AFF;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;';
    copyBtn.onclick = pageHandler(function() {
      var ok = copyResults();
      copyBtn.textContent = ok ? 'Copiado ✓' : 'Error';
      copyBtn.style.background = ok ? '#30d158' : '#FF3B30';
    });
    btnWrap.appendChild(copyBtn);
    banner.appendChild(btnWrap);

    doc.body.appendChild(banner);
  }
})();
