// ==UserScript==
// @name        IG View Once (TEST v3)
// @description Test: blob injection cross-platform
// @match       https://www.instagram.com/*
// @version     3.0-test
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

  var w = unsafeWindow;
  var doc = w.document;
  if (w.self !== w.top) return;

  var results = [];
  var totalAsync = 3;
  var asyncDone = 0;

  // Helper: exportar funciones al contexto de la página (Firefox)
  function toPage(fn) {
    if (typeof exportFunction === 'function') return exportFunction(fn, w);
    return fn;
  }

  // =============================================
  // Test 1: Bridge — exponer función al page context
  // =============================================
  try {
    w.__igvo_test_bridge = toPage(function(msg) {
      return 'echo:' + msg;
    });
    results.push({ test: 'bridge', ok: true, detail: 'OK' });
  } catch(e) {
    results.push({ test: 'bridge', ok: false, detail: e.message });
  }

  // =============================================
  // Test 2: GM_xmlhttpRequest cross-origin
  // =============================================
  try {
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://httpbin.org/get',
      onload: function(response) {
        results.push({
          test: 'XHR cross-origin',
          ok: response.status === 200,
          detail: 'OK'
        });
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

  // =============================================
  // Test 3: IG API
  // =============================================
  try {
    var csrfCookie = doc.cookie.match(/csrftoken=([^;]+)/);
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

  // =============================================
  // Test 4: FLUJO COMPLETO
  // blob inject + bridge + DOM + cookies + fetch IG + click
  // Simula exactamente lo que hará el cascarón en producción
  // =============================================
  try {
    // El cascarón expone el bridge de sync
    w.__igvo_test_sync = toPage(function(action, data) {
      w.__igvo_test_sync_called = action + ':' + JSON.stringify(data);
    });

    // Simular código remoto (lo que vendría de Supabase)
    var remoteCode = [
      '(function() {',
      '  var csrf = document.cookie.match(/csrftoken=([^;]+)/);',
      '  var csrfOk = !!(csrf && csrf[1]);',
      '',
      '  var div = document.createElement("div");',
      '  div.id = "igvo-blob-test";',
      '  div.style.cssText = "display:none";',
      '  div.dataset.csrf = csrfOk ? "ok" : "no";',
      '  document.body.appendChild(div);',
      '',
      '  if (window.__igvo_test_sync) {',
      '    window.__igvo_test_sync("test_action", { foo: "bar" });',
      '  }',
      '',
      '  fetch("/api/v1/accounts/current_user/?edit=true", {',
      '    headers: {',
      '      "x-ig-app-id": "936619743392459",',
      '      "x-csrftoken": csrf ? csrf[1] : "",',
      '      "x-requested-with": "XMLHttpRequest"',
      '    },',
      '    credentials: "include"',
      '  }).then(function(r) {',
      '    div.dataset.fetch = r.status;',
      '  }).catch(function(e) {',
      '    div.dataset.fetch = "err";',
      '  });',
      '',
      '  var btn = document.createElement("button");',
      '  btn.id = "igvo-blob-btn-test";',
      '  btn.style.cssText = "display:none";',
      '  btn.onclick = function() { btn.dataset.clicked = "yes"; };',
      '  document.body.appendChild(btn);',
      '  btn.click();',
      '})();'
    ].join('\n');

    var blob = new Blob([remoteCode], { type: 'application/javascript' });
    var blobUrl = URL.createObjectURL(blob);
    GM_addElement('script', { src: blobUrl });

    setTimeout(function() {
      var div = doc.getElementById('igvo-blob-test');
      var btn = doc.getElementById('igvo-blob-btn-test');
      var syncCalled = w.__igvo_test_sync_called;

      var domOk = !!(div);
      var csrfOk = div && div.dataset.csrf === 'ok';
      var fetchStatus = div ? (div.dataset.fetch || 'pending') : 'no-div';
      var fetchOk = fetchStatus === '200';
      var bridgeOk = syncCalled === 'test_action:{"foo":"bar"}';
      var clickOk = btn && btn.dataset.clicked === 'yes';

      var allOk = domOk && csrfOk && bridgeOk && clickOk;

      var details = [];
      details.push('DOM:' + (domOk ? 'ok' : 'no'));
      details.push('csrf:' + (csrfOk ? 'ok' : 'no'));
      details.push('fetch:' + fetchStatus);
      details.push('bridge:' + (bridgeOk ? 'ok' : 'no'));
      details.push('click:' + (clickOk ? 'ok' : 'no'));

      results.push({
        test: 'blob inject full',
        ok: allOk,
        detail: details.join(', ')
      });

      if (div) div.remove();
      if (btn) btn.remove();
      delete w.__igvo_test_bridge;
      delete w.__igvo_test_sync;
      delete w.__igvo_test_sync_called;
      URL.revokeObjectURL(blobUrl);

      checkDone();
    }, 2000);
  } catch(e) {
    results.push({ test: 'blob inject full', ok: false, detail: e.message });
    checkDone();
  }

  showResults(results);

  function checkDone() {
    asyncDone++;
    showResults(results);
  }

  function copyResults() {
    var text = results.map(function(r) {
      return (r.ok ? 'OK' : 'FAIL') + ' | ' + r.test + ' | ' + r.detail;
    }).join('\n');
    var ua = (w.navigator || navigator).userAgent || '';
    var platform = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : 'Desktop';
    text = 'Tests v3 — ' + platform + '\n' + text;
    try { GM_setClipboard(text, 'text'); return true; } catch(e) {}
    try { navigator.clipboard.writeText(text); return true; } catch(e) {}
    return false;
  }

  function showResults(res) {
    var existing = doc.getElementById('igvo-csp-banner');
    if (existing) existing.remove();

    var banner = doc.createElement('div');
    banner.id = 'igvo-csp-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
      'background:#1a1a2e;color:#fff;font-family:monospace;font-size:11px;' +
      'padding:12px 16px;padding-top:max(12px, env(safe-area-inset-top));' +
      'line-height:1.8;box-shadow:0 2px 10px rgba(0,0,0,0.5);max-height:85vh;overflow-y:auto;';

    var header = doc.createElement('div');
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
    var titleEl = doc.createElement('span');
    titleEl.style.cssText = 'font-size:13px;font-weight:bold;';
    titleEl.textContent = 'Tests v3';
    var closeX = doc.createElement('span');
    closeX.style.cssText = 'font-size:18px;cursor:pointer;padding:4px 8px;color:#888;';
    closeX.textContent = '\u2715';
    closeX.onclick = toPage(function() { banner.remove(); });
    header.appendChild(titleEl);
    header.appendChild(closeX);
    banner.appendChild(header);

    res.forEach(function(r) {
      var line = doc.createElement('div');
      line.textContent = (r.ok ? '\u2705' : '\u274C') + ' ' + r.test + ': ' + r.detail;
      banner.appendChild(line);
    });

    if (asyncDone < totalAsync) {
      var pending = doc.createElement('div');
      pending.style.cssText = 'margin-top:4px;color:#ffd700;';
      pending.textContent = '\u23F3 ' + (totalAsync - asyncDone) + ' pendiente(s)...';
      banner.appendChild(pending);
    }

    var btnWrap = doc.createElement('div');
    btnWrap.style.cssText = 'margin-top:10px;';
    var copyBtn = doc.createElement('button');
    copyBtn.textContent = 'Copiar';
    copyBtn.style.cssText = 'background:#007AFF;color:#fff;border:none;padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent;';
    copyBtn.onclick = toPage(function() {
      var ok = copyResults();
      copyBtn.textContent = ok ? 'Copiado \u2713' : 'Error';
      copyBtn.style.background = ok ? '#30d158' : '#FF3B30';
    });
    btnWrap.appendChild(copyBtn);
    banner.appendChild(btnWrap);

    doc.body.appendChild(banner);
  }
})();
