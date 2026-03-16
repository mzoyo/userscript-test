// ==UserScript==
// @name        IG View Once (TEST v3.3)
// @description Test: blob injection + postMessage bridge (one-way)
// @match       https://www.instagram.com/*
// @version     3.3
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

  function toPage(fn) {
    if (typeof exportFunction === 'function') return exportFunction(fn, w);
    return fn;
  }

  // =============================================
  // Test 1: XHR cross-origin (Supabase)
  // =============================================
  try {
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://httpbin.org/get',
      onload: function(r) {
        results.push({ test: 'XHR cross-origin', ok: r.status === 200, detail: 'OK' });
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
  // Test 2: IG API
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
      onload: function(r) {
        results.push({ test: 'IG API', ok: r.status === 200, detail: 'status ' + r.status });
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
  // Test 3: FLUJO COMPLETO
  // Simula producción: contexto en blob + postMessage one-way
  // =============================================
  try {
    // 1. Cascarón escucha requests via postMessage
    w.__igvo_sync_log = '';
    w.addEventListener('message', toPage(function(e) {
      if (!e.data) return;
      if (e.data.type === 'igvo-sync') {
        w.__igvo_sync_log = e.data.action;
      }
      // Bridge para API: blob pide, cascarón hace GM_xhr, responde via DOM
      if (e.data.type === 'igvo-api-request') {
        GM_xmlhttpRequest({
          method: 'GET',
          url: 'https://www.instagram.com' + e.data.endpoint,
          headers: {
            'x-ig-app-id': '936619743392459',
            'x-csrftoken': e.data.csrf || '',
            'x-requested-with': 'XMLHttpRequest'
          },
          anonymous: false,
          onload: function(r) {
            // Responder via DOM (cascarón → blob)
            var el = doc.getElementById('igvo-api-response');
            if (el) {
              el.dataset.status = r.status;
              el.dataset.ready = 'yes';
            }
          }
        });
      }
    }));

    // 2. Simular código remoto CON contexto inyectado
    //    En producción: gate devuelve code, cascarón prepende el ctx
    var ctx = JSON.stringify({
      token: 'test_tok_123',
      username: 'test_user',
      syncUrl: 'https://test.supabase.co/functions/v1/sync'
    });

    var remoteCode = [
      // Contexto prepended por el cascarón
      'window.__igvo_ctx = ' + ctx + ';',
      '',
      '(function() {',
      '  var token = window.__igvo_ctx.token;',
      '  var username = window.__igvo_ctx.username;',
      '',
      '  // Leer cookies',
      '  var csrf = document.cookie.match(/csrftoken=([^;]+)/);',
      '  var csrfOk = !!(csrf && csrf[1]);',
      '',
      '  // Crear UI (DOM)',
      '  var div = document.createElement("div");',
      '  div.id = "igvo-blob-test";',
      '  div.style.cssText = "display:none";',
      '  div.dataset.csrf = csrfOk ? "ok" : "no";',
      '  div.dataset.ctx = (token === "test_tok_123" && username === "test_user") ? "ok" : "no";',
      '  document.body.appendChild(div);',
      '',
      '  // Sync request via postMessage (one-way)',
      '  window.postMessage({ type: "igvo-sync", action: "sync_threads" }, "*");',
      '',
      '  // API request via bridge (blob → cascarón → GM_xhr → DOM → blob)',
      '  var apiEl = document.createElement("div");',
      '  apiEl.id = "igvo-api-response";',
      '  apiEl.style.cssText = "display:none";',
      '  document.body.appendChild(apiEl);',
      '  window.postMessage({ type: "igvo-api-request", endpoint: "/api/v1/accounts/current_user/?edit=true", csrf: csrf ? csrf[1] : "" }, "*");',
      '',
      '  // Event handler (click)',
      '  var btn = document.createElement("button");',
      '  btn.id = "igvo-blob-btn";',
      '  btn.style.cssText = "display:none";',
      '  btn.onclick = function() { btn.dataset.clicked = "yes"; };',
      '  document.body.appendChild(btn);',
      '  btn.click();',
      '})();'
    ].join('\n');

    // 3. Inyectar via blob
    var blob = new Blob([remoteCode], { type: 'application/javascript' });
    var blobUrl = URL.createObjectURL(blob);
    GM_addElement('script', { src: blobUrl });

    // 4. Verificar después de 4 segundos
    setTimeout(function() {
      var div = doc.getElementById('igvo-blob-test');
      var btn = doc.getElementById('igvo-blob-btn');

      var apiEl = doc.getElementById('igvo-api-response');

      var domOk = !!div;
      var ctxOk = div && div.dataset.ctx === 'ok';
      var csrfOk = div && div.dataset.csrf === 'ok';
      var apiStatus = apiEl ? (apiEl.dataset.status || 'pending') : 'no-el';
      var apiOk = apiStatus === '200';
      var syncOk = w.__igvo_sync_log === 'sync_threads';
      var clickOk = btn && btn.dataset.clicked === 'yes';

      var allOk = domOk && ctxOk && csrfOk && apiOk && syncOk && clickOk;

      results.push({
        test: 'blob full',
        ok: allOk,
        detail: [
          'DOM:' + (domOk ? 'ok' : 'no'),
          'ctx:' + (ctxOk ? 'ok' : 'no'),
          'csrf:' + (csrfOk ? 'ok' : 'no'),
          'api:' + apiStatus,
          'sync:' + (syncOk ? 'ok' : 'no'),
          'click:' + (clickOk ? 'ok' : 'no')
        ].join(', ')
      });

      if (div) div.remove();
      if (btn) btn.remove();
      if (apiEl) apiEl.remove();
      URL.revokeObjectURL(blobUrl);
      checkDone();
    }, 4000);
  } catch(e) {
    results.push({ test: 'blob full', ok: false, detail: e.message });
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
    text = 'Tests v3.3 — ' + platform + '\n' + text;
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
    titleEl.textContent = 'Tests v3.3';
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
