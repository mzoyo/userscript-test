// ==UserScript==
// @name        IG View Once (TEST v4.3)
// @description Test: fetch + XHR hook via blob
// @match       https://www.instagram.com/*
// @version     4.3.1
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

  // Inyectar hook lo más temprano posible — antes de que IG guarde referencias
  var hookCode = [
    '(function() {',
    '  window.__igvo_hook_installed = true;',
    '  var captured = [];',
    '  window.__igvo_captured = captured;',
    '',
    '  function processCapture(urlStr, status, body, method) {',
    '    try {',
    '      var isDM = urlStr.indexOf("/direct_v2/") > -1 || urlStr.indexOf("/direct/") > -1;',
    '      var isAPI = urlStr.indexOf("/api/v1/") > -1 || urlStr.indexOf("/api/v2/") > -1;',
    '      if (!isDM && !isAPI) return;',
    '      var data = JSON.parse(body);',
    '      var entry = {',
    '        time: new Date().toLocaleTimeString("es", {hour:"2-digit",minute:"2-digit",second:"2-digit"}),',
    '        method: method,',
    '        url: urlStr.replace("https://www.instagram.com", "").split("?")[0],',
    '        status: status,',
    '        size: body.length,',
    '        isDM: isDM,',
    '      };',
    '      if (data.inbox && data.inbox.threads) {',
    '        entry.type = "inbox";',
    '        entry.detail = data.inbox.threads.length + " threads";',
    '      } else if (data.thread && data.thread.items) {',
    '        entry.type = "thread";',
    '        entry.detail = data.thread.items.length + " items, " + (data.thread.thread_title || "?");',
    '      } else {',
    '        entry.type = isDM ? "dm-other" : "api";',
    '        var path = urlStr.split("?")[0].split("/");',
    '        entry.detail = path.slice(-2).join("/");',
    '      }',
    '      captured.push(entry);',
    '      window.dispatchEvent(new Event("igvo-capture"));',
    '    } catch(e) {}',
    '  }',
    '',
    '  // Hook fetch — captura TODAS las peticiones para debug',
    '  var origFetch = window.fetch;',
    '  window.__igvo_fetch_count = 0;',
    '  window.fetch = function(url, opts) {',
    '    window.__igvo_fetch_count++;',
    '    var urlStr = (typeof url === "string") ? url : (url && url.url ? url.url : String(url));',
    '    return origFetch.apply(this, arguments).then(function(r) {',
    '      try { r.clone().text().then(function(body) { processCapture(urlStr, r.status, body, "fetch"); }); } catch(e) {}',
    '      return r;',
    '    });',
    '  };',
    '',
    '  // Hook XMLHttpRequest',
    '  var origXHROpen = XMLHttpRequest.prototype.open;',
    '  var origXHRSend = XMLHttpRequest.prototype.send;',
    '  window.__igvo_xhr_count = 0;',
    '  XMLHttpRequest.prototype.open = function(method, url) {',
    '    this._igvo_url = url;',
    '    this._igvo_method = method;',
    '    return origXHROpen.apply(this, arguments);',
    '  };',
    '  XMLHttpRequest.prototype.send = function() {',
    '    window.__igvo_xhr_count++;',
    '    var self = this;',
    '    var url = self._igvo_url || "";',
    '    self.addEventListener("load", function() {',
    '      try { processCapture(url, self.status, self.responseText || "", "XHR"); } catch(e) {}',
    '    });',
    '    return origXHRSend.apply(this, arguments);',
    '  };',
    '',
    '})();'
  ].join('\n');

  // Inyectar via blob URL (inline scripts bloqueados por CSP)
  var hookBlob = new Blob([hookCode], { type: 'application/javascript' });
  var hookUrl = URL.createObjectURL(hookBlob);
  var script = doc.createElement('script');
  script.src = hookUrl;
  (doc.head || doc.documentElement).appendChild(script);

  // Panel de monitoreo
  setTimeout(function() {
    var panel = doc.createElement('div');
    panel.id = 'igvo-hook-panel';
    panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#1a1a2e;color:#fff;font-family:monospace;font-size:10px;padding:14px 16px;padding-bottom:max(14px,env(safe-area-inset-bottom));min-height:200px;max-height:60vh;overflow-y:auto;box-shadow:0 -2px 10px rgba(0,0,0,0.5);display:none;';

    var toggle = doc.createElement('button');
    toggle.id = 'igvo-hook-toggle';
    toggle.textContent = 'Hook';
    toggle.style.cssText = 'position:fixed;bottom:24px;left:24px;z-index:2147483646;background:#30d158;color:#fff;border:none;width:48px;height:48px;border-radius:50%;font-size:11px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,0.3);cursor:pointer;';
    toggle.onclick = toPage(function() {
      var p = doc.getElementById('igvo-hook-panel');
      p.style.display = p.style.display === 'none' ? 'block' : 'none';
      renderCaptures();
    });
    doc.body.appendChild(toggle);
    doc.body.appendChild(panel);

    // Escuchar capturas
    w.addEventListener('igvo-capture', toPage(function() {
      var badge = doc.getElementById('igvo-hook-badge');
      var count = (w.__igvo_captured || []).length;
      if (!badge) {
        badge = doc.createElement('span');
        badge.id = 'igvo-hook-badge';
        badge.style.cssText = 'position:absolute;top:-2px;right:-2px;background:#FF3B30;color:#fff;font-size:9px;font-weight:700;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;';
        toggle.style.position = 'fixed';
        toggle.appendChild(badge);
      }
      badge.textContent = count;
      // Auto-render si panel visible
      var p = doc.getElementById('igvo-hook-panel');
      if (p && p.style.display !== 'none') renderCaptures();
    }));

    function renderCaptures() {
      var p = doc.getElementById('igvo-hook-panel');
      var items = w.__igvo_captured || [];

      var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
      var hookOk = w.__igvo_hook_installed ? 'YES' : 'NO';
      var fc = w.__igvo_fetch_count || 0;
      var xc = w.__igvo_xhr_count || 0;
      html += '<span style="font-size:12px;font-weight:bold;">Hook v4.3</span>';
      html += '<div style="color:#888;font-size:9px;margin:4px 0;">hook:' + hookOk + ' fetch:' + fc + ' xhr:' + xc + ' captured:' + items.length + '</div>';
      html += '<span style="cursor:pointer;color:#888;font-size:16px;padding:2px 6px;" onclick="document.getElementById(\'igvo-hook-panel\').style.display=\'none\'">✕</span>';
      html += '</div>';

      if (!items.length) {
        html += '<div style="color:#666;padding:20px 0;text-align:center;">Navega por tus DMs para capturar peticiones...</div>';
      } else {
        items.slice().reverse().forEach(function(e) {
          var color = e.type === 'inbox' ? '#007AFF' : e.type === 'thread' ? '#30d158' : '#888';
          html += '<div style="padding:6px 0;border-bottom:1px solid #2a2a2e;">';
          html += '<span style="color:' + color + ';font-weight:600;">[' + e.type + ']</span> ';
          html += '<span style="color:#ff9f0a;font-size:9px;">' + e.method + '</span> ';
          html += '<span style="color:#888;">' + e.time + '</span> ';
          html += '<span style="color:#ccc;">' + e.detail + '</span>';
          html += '<div style="color:#555;font-size:9px;margin-top:2px;">' + e.url.substring(0, 80) + ' — ' + Math.round(e.size/1024) + 'KB</div>';
          html += '</div>';
        });
      }

      // Botón copiar
      html += '<div style="margin-top:8px;"><button id="igvo-hook-copy" style="background:#007AFF;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">Copiar todo</button></div>';

      p.innerHTML = html;

      var copyBtn = doc.getElementById('igvo-hook-copy');
      if (copyBtn) {
        copyBtn.onclick = toPage(function() {
          var text = items.map(function(e) {
            return e.time + ' | ' + e.type + ' | ' + e.detail + ' | ' + e.url.substring(0, 80);
          }).join('\n');
          text = 'Hook v4.3 — hook:' + hookOk + ' fetch:' + fc + ' xhr:' + xc + ' captured:' + items.length + '\n' + text;
          try { GM_setClipboard(text, 'text'); copyBtn.textContent = 'Copiado'; copyBtn.style.background = '#30d158'; } catch(e) {
            var ta = doc.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
            doc.body.appendChild(ta); ta.select(); doc.execCommand('copy'); ta.remove();
            copyBtn.textContent = 'Copiado'; copyBtn.style.background = '#30d158';
          }
        });
      }
    }
  }, 2000);
})();
