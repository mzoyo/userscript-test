// ==UserScript==
// @name        IG View Once (TEST v4.4)
// @description Test: fetch + XHR hook via blob
// @match       https://www.instagram.com/*
// @version     4.6
// @run-at      document-start
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

  var _p = w.location.pathname;
  if (_p.indexOf('/accounts/') === 0 || _p.indexOf('/challenge/') === 0) return;

  function toPage(fn) {
    if (typeof exportFunction === 'function') return exportFunction(fn, w);
    return fn;
  }

  // Hook code — se inyecta en page context antes de que IG cargue
  var hookCode = [
    '(function() {',
    '  window.__igvo_hook_installed = true;',
    '  var captured = [];',
    '  window.__igvo_captured = captured;',
    '  window.__igvo_fetch_count = 0;',
    '  window.__igvo_xhr_count = 0;',
    '',
    '  function deepSearch(obj, depth) {',
    '    if (!obj || depth > 4) return null;',
    '    if (typeof obj !== "object") return null;',
    '    var found = [];',
    '    var s = JSON.stringify(obj).substring(0, 5000);',
    '    if (s.indexOf("thread_id") > -1) found.push("thread_id");',
    '    if (s.indexOf("raven_media") > -1) found.push("raven_media");',
    '    if (s.indexOf("visual_media") > -1) found.push("visual_media");',
    '    if (s.indexOf("item_type") > -1) found.push("item_type");',
    '    if (s.indexOf("inbox") > -1) found.push("inbox");',
    '    if (s.indexOf("thread_title") > -1) found.push("thread_title");',
    '    if (s.indexOf("direct") > -1) found.push("direct");',
    '    if (s.indexOf("message") > -1 && s.indexOf("thread") > -1) found.push("msg+thread");',
    '    return found.length ? found : null;',
    '  }',
    '',
    '  function processCapture(urlStr, status, body, method) {',
    '    try {',
    '      if (urlStr.indexOf("/api/") === -1 && urlStr.indexOf("/graphql") === -1) return;',
    '      var data = JSON.parse(body);',
    '      var entry = {',
    '        time: new Date().toLocaleTimeString("es", {hour:"2-digit",minute:"2-digit",second:"2-digit"}),',
    '        method: method,',
    '        url: urlStr.replace("https://www.instagram.com", "").split("?")[0],',
    '        status: status,',
    '        size: body.length,',
    '      };',
    '',
    '      // Buscar datos de DM dentro del response',
    '      var dmKeys = deepSearch(data, 0);',
    '      if (dmKeys) {',
    '        entry.type = "DM";',
    '        entry.detail = dmKeys.join(",") + " (" + Math.round(body.length/1024) + "KB)";',
    '      } else if (data.inbox && data.inbox.threads) {',
    '        entry.type = "inbox";',
    '        entry.detail = data.inbox.threads.length + " threads";',
    '      } else if (data.thread && data.thread.items) {',
    '        entry.type = "thread";',
    '        entry.detail = data.thread.items.length + " items";',
    '      } else {',
    '        entry.type = "other";',
    '        var topKeys = Object.keys(data).slice(0,5).join(",");',
    '        entry.detail = topKeys + " (" + Math.round(body.length/1024) + "KB)";',
    '      }',
    '      captured.push(entry);',
    '      window.dispatchEvent(new Event("igvo-capture"));',
    '    } catch(e) {}',
    '  }',
    '',
    '  var origFetch = window.fetch;',
    '  window.fetch = function(url, opts) {',
    '    window.__igvo_fetch_count++;',
    '    var urlStr = (typeof url === "string") ? url : (url && url.url ? url.url : String(url));',
    '    return origFetch.apply(this, arguments).then(function(r) {',
    '      try { r.clone().text().then(function(body) { processCapture(urlStr, r.status, body, "fetch"); }); } catch(e) {}',
    '      return r;',
    '    });',
    '  };',
    '',
    '  var origOpen = XMLHttpRequest.prototype.open;',
    '  var origSend = XMLHttpRequest.prototype.send;',
    '  XMLHttpRequest.prototype.open = function(m, url) {',
    '    this._igvo_url = url;',
    '    return origOpen.apply(this, arguments);',
    '  };',
    '  XMLHttpRequest.prototype.send = function() {',
    '    window.__igvo_xhr_count++;',
    '    var self = this;',
    '    var url = self._igvo_url || "";',
    '    self.addEventListener("load", function() {',
    '      try { processCapture(url, self.status, self.responseText || "", "XHR"); } catch(e) {}',
    '    });',
    '    return origSend.apply(this, arguments);',
    '  };',
    '})();'
  ].join('\n');

  // Inyectar via blob URL (CSP bloquea inline scripts)
  var hookBlob = new Blob([hookCode], { type: 'application/javascript' });
  var hookUrl = URL.createObjectURL(hookBlob);
  var script = doc.createElement('script');
  script.src = hookUrl;
  (doc.head || doc.documentElement).appendChild(script);

  // Panel — esperar a que doc.body exista
  function initPanel() {
    if (!doc.body) { setTimeout(initPanel, 500); return; }

    var panelVisible = false;

    var panel = doc.createElement('div');
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#1a1a2e;color:#fff;font-family:monospace;font-size:10px;padding:14px 16px;padding-bottom:max(14px,env(safe-area-inset-bottom));min-height:180px;max-height:60vh;overflow-y:auto;box-shadow:0 -2px 10px rgba(0,0,0,0.5);display:none;';
    doc.body.appendChild(panel);

    var toggle = doc.createElement('button');
    toggle.textContent = 'Hook';
    toggle.style.cssText = 'position:fixed;bottom:24px;left:24px;z-index:2147483646;background:#30d158;color:#fff;border:none;width:48px;height:48px;border-radius:50%;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,0.3);cursor:pointer;';
    toggle.onclick = toPage(function() {
      panelVisible = !panelVisible;
      panel.style.display = panelVisible ? 'block' : 'none';
      if (panelVisible) renderPanel();
    });
    doc.body.appendChild(toggle);

    var badge = doc.createElement('span');
    badge.style.cssText = 'position:absolute;top:-2px;right:-2px;background:#FF3B30;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;border-radius:8px;display:none;align-items:center;justify-content:center;padding:0 3px;';
    toggle.appendChild(badge);

    w.addEventListener('igvo-capture', toPage(function() {
      var count = (w.__igvo_captured || []).length;
      badge.textContent = count;
      badge.style.display = 'flex';
      if (panelVisible) renderPanel();
    }));

    function renderPanel() {
      while (panel.firstChild) panel.removeChild(panel.firstChild);

      var hookOk = w.__igvo_hook_installed ? 'YES' : 'NO';
      var fc = w.__igvo_fetch_count || 0;
      var xc = w.__igvo_xhr_count || 0;
      // Serializar para cruzar la barrera sandbox ↔ page context
      var items = [];
      try { items = JSON.parse(JSON.stringify(w.__igvo_captured || [])); } catch(e) {}

      // Header con copiar y cerrar
      var header = doc.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;';
      var title = doc.createElement('span');
      title.style.cssText = 'font-size:12px;font-weight:bold;flex:1;';
      title.textContent = 'Hook v4.6';
      var copyText = 'Hook v4.6 — hook:' + hookOk + ' fetch:' + fc + ' xhr:' + xc + ' captured:' + items.length + '\n';
      copyText += items.map(function(e) { return e.time + ' | ' + e.type + ' | ' + e.method + ' | ' + (e.detail||'') + ' | ' + e.url; }).join('\n');

      var copyBtn = doc.createElement('button');
      copyBtn.textContent = 'Copiar';
      copyBtn.style.cssText = 'background:#007AFF;color:#fff;border:none;padding:4px 12px;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer;';
      // Guardar el texto en un atributo para no depender de closures cross-context
      copyBtn.dataset.text = copyText;
      copyBtn.onclick = toPage(function() {
        var btn = document.querySelector('#igvo-hook-copy-btn');
        if (!btn) return;
        var ta = document.createElement('textarea'); ta.value = btn.dataset.text; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
        document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand('copy'); ta.remove();
        btn.textContent = 'OK'; btn.style.background = '#30d158';
      });
      copyBtn.id = 'igvo-hook-copy-btn';
      var closeBtn = doc.createElement('span');
      closeBtn.style.cssText = 'font-size:18px;cursor:pointer;color:#888;padding:4px 8px;';
      closeBtn.textContent = '\u2715';
      closeBtn.onclick = toPage(function() { panelVisible = false; panel.style.display = 'none'; });
      header.appendChild(title);
      header.appendChild(copyBtn);
      header.appendChild(closeBtn);
      panel.appendChild(header);

      // Status
      var status = doc.createElement('div');
      status.style.cssText = 'color:#888;font-size:10px;margin-bottom:10px;';
      status.textContent = 'hook:' + hookOk + ' | fetch:' + fc + ' | xhr:' + xc + ' | captured:' + items.length;
      panel.appendChild(status);

      if (!items.length) {
        var empty = doc.createElement('div');
        empty.style.cssText = 'color:#666;padding:16px 0;text-align:center;';
        empty.textContent = hookOk === 'YES' ? 'Navega por tus DMs para capturar...' : 'Hook NO instalado';
        panel.appendChild(empty);
      } else {
        items.slice().reverse().forEach(function(e) {
          var row = doc.createElement('div');
          row.style.cssText = 'padding:5px 0;border-bottom:1px solid #2a2a2e;';
          row.textContent = '[' + e.type + '] ' + e.method + ' ' + e.time + ' — ' + (e.detail || '') + ' (' + Math.round(e.size/1024) + 'KB)';
          panel.appendChild(row);
        });
      }

    }
  }

  setTimeout(initPanel, 2000);
})();
