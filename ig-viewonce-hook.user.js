// ==UserScript==
// @name        IG View Once Hook
// @description Detect and show view-once media when browsing DMs
// @match       https://www.instagram.com/*
// @version     0.1.0
// @run-at      document-start
// @sandbox     JavaScript
// @grant       GM_addElement
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

  // =============================================
  // Hook XHR — interceptar respuestas GraphQL con view-once media
  // Se inyecta via blob en page context antes de que IG cargue
  // =============================================
  var hookCode = [
    '(function() {',
    '  var origOpen = XMLHttpRequest.prototype.open;',
    '  var origSend = XMLHttpRequest.prototype.send;',
    '',
    '  XMLHttpRequest.prototype.open = function(method, url) {',
    '    this._igvo_url = url;',
    '    return origOpen.apply(this, arguments);',
    '  };',
    '',
    '  XMLHttpRequest.prototype.send = function() {',
    '    var self = this;',
    '    var url = self._igvo_url || "";',
    '    if (url.indexOf("/api/graphql") > -1 || url.indexOf("/graphql/query") > -1) {',
    '      self.addEventListener("load", function() {',
    '        try {',
    '          var body = self.responseText;',
    '          if (body.indexOf("raven_media") === -1 && body.indexOf("visual_media") === -1) return;',
    '          var data = JSON.parse(body);',
    '          var items = findViewOnceItems(data);',
    '          if (items.length > 0) {',
    '            window.dispatchEvent(new CustomEvent("igvo-found", {',
    '              detail: JSON.stringify(items)',
    '            }));',
    '          }',
    '        } catch(e) {}',
    '      });',
    '    }',
    '    return origSend.apply(this, arguments);',
    '  };',
    '',
    '  // Buscar recursivamente items view-once en el response GraphQL',
    '  function findViewOnceItems(obj) {',
    '    var results = [];',
    '    searchObj(obj, results, 0);',
    '    return results;',
    '  }',
    '',
    '  function searchObj(obj, results, depth) {',
    '    if (!obj || typeof obj !== "object" || depth > 10) return;',
    '',
    '    // Si es un item con raven_media o visual_media',
    '    if (obj.item_type === "raven_media" || obj.item_type === "visual_media") {',
    '      if (obj.is_sent_by_viewer) return;',
    '      var media = obj.raven_media || (obj.visual_media && obj.visual_media.media);',
    '      if (!media) return;',
    '      var imgCandidates = (media.image_versions2 && media.image_versions2.candidates) || [];',
    '      var vidVersions = media.video_versions || [];',
    '      if (imgCandidates.length === 0 && vidVersions.length === 0) return;',
    '',
    '      var bestImg = imgCandidates.length > 0 ? imgCandidates.reduce(function(a,b) {',
    '        return (a.width*a.height) > (b.width*b.height) ? a : b;',
    '      }) : null;',
    '      var bestVid = vidVersions.length > 0 ? vidVersions.reduce(function(a,b) {',
    '        return (a.width*a.height) > (b.width*b.height) ? a : b;',
    '      }) : null;',
    '',
    '      results.push({',
    '        itemId: obj.item_id || "",',
    '        isVideo: vidVersions.length > 0,',
    '        imgUrl: bestImg ? bestImg.url : null,',
    '        vidUrl: bestVid ? bestVid.url : null,',
    '        width: (bestVid && bestVid.width) || (bestImg && bestImg.width),',
    '        height: (bestVid && bestVid.height) || (bestImg && bestImg.height),',
    '        timestamp: obj.timestamp || null,',
    '      });',
    '      return;',
    '    }',
    '',
    '    // Recursión',
    '    if (Array.isArray(obj)) {',
    '      for (var i = 0; i < obj.length; i++) searchObj(obj[i], results, depth + 1);',
    '    } else {',
    '      var keys = Object.keys(obj);',
    '      for (var k = 0; k < keys.length; k++) searchObj(obj[keys[k]], results, depth + 1);',
    '    }',
    '  }',
    '})();'
  ].join('\n');

  var blob = new Blob([hookCode], { type: 'application/javascript' });
  var script = doc.createElement('script');
  script.src = URL.createObjectURL(blob);
  (doc.head || doc.documentElement).appendChild(script);

  // =============================================
  // UI — mostrar notificación cuando se detecten view-once
  // Se crea cuando doc.body existe
  // =============================================
  function initUI() {
    if (!doc.body) { setTimeout(initUI, 500); return; }

    // Estilos
    var style = doc.createElement('style');
    style.textContent = [
      '#igvo-notif {',
      '  position:fixed; top:max(12px,env(safe-area-inset-top)); right:12px;',
      '  z-index:2147483647; background:rgba(0,0,0,0.85);',
      '  backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);',
      '  border-radius:14px; padding:0; max-width:340px; width:calc(100% - 24px);',
      '  box-shadow:0 4px 20px rgba(0,0,0,0.4); font-family:-apple-system,sans-serif;',
      '  color:#fff; overflow:hidden; display:none;',
      '  animation:igvo-slide-in 0.3s ease-out;',
      '}',
      '@keyframes igvo-slide-in { from { transform:translateY(-20px); opacity:0; } to { transform:translateY(0); opacity:1; } }',
      '#igvo-notif .notif-header {',
      '  padding:12px 14px; display:flex; align-items:center; gap:8px;',
      '  border-bottom:1px solid rgba(255,255,255,0.1);',
      '}',
      '#igvo-notif .notif-header .notif-title { font-size:13px; font-weight:700; flex:1; }',
      '#igvo-notif .notif-header .notif-count {',
      '  background:#FF3B30; font-size:11px; font-weight:700; padding:2px 7px;',
      '  border-radius:10px; min-width:20px; text-align:center;',
      '}',
      '#igvo-notif .notif-header .notif-close {',
      '  color:#888; font-size:18px; cursor:pointer; padding:0 4px; line-height:1;',
      '}',
      '#igvo-notif .notif-body { padding:10px; max-height:50vh; overflow-y:auto; }',
      '#igvo-notif .notif-item {',
      '  margin-bottom:8px; border-radius:10px; overflow:hidden;',
      '  background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.08);',
      '}',
      '#igvo-notif .notif-item img, #igvo-notif .notif-item video {',
      '  width:100%; display:block; background:rgba(255,255,255,0.05);',
      '}',
      '#igvo-notif .notif-item-footer {',
      '  padding:8px 10px; display:flex; justify-content:space-between; align-items:center;',
      '}',
      '#igvo-notif .notif-tag {',
      '  font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;',
      '}',
      '#igvo-notif .notif-tag.photo { background:rgba(0,122,255,0.2); color:#5ac8fa; }',
      '#igvo-notif .notif-tag.video { background:rgba(255,59,48,0.2); color:#ff6961; }',
      '#igvo-notif .notif-dim { color:rgba(255,255,255,0.3); font-size:10px; }',
      '#igvo-notif .notif-dl {',
      '  background:rgba(255,255,255,0.12); color:#fff; border:none;',
      '  padding:6px 12px; border-radius:6px; font-size:11px; font-weight:600; cursor:pointer;',
      '}',
      '#igvo-notif .notif-dl:active { opacity:0.5; }',
    ].join('\n');
    doc.head.appendChild(style);

    // Escuchar detecciones de view-once
    var shownItemIds = {};

    w.addEventListener('igvo-found', toPage(function(e) {
      try {
        var items = JSON.parse(e.detail);
        // Filtrar duplicados
        var newItems = items.filter(function(item) {
          if (shownItemIds[item.itemId]) return false;
          shownItemIds[item.itemId] = true;
          return true;
        });
        if (newItems.length > 0) showNotification(newItems);
      } catch(err) {}
    }));
  }

  function showNotification(items) {
    // Crear o actualizar notificación
    var existing = doc.getElementById('igvo-notif');
    if (existing) existing.remove();

    var notif = doc.createElement('div');
    notif.id = 'igvo-notif';
    notif.style.display = 'block';

    // Header
    var header = doc.createElement('div');
    header.className = 'notif-header';
    var title = doc.createElement('span');
    title.className = 'notif-title';
    title.textContent = 'View Once';
    var count = doc.createElement('span');
    count.className = 'notif-count';
    count.textContent = items.length;
    var close = doc.createElement('span');
    close.className = 'notif-close';
    close.textContent = '\u2715';
    close.onclick = toPage(function() { notif.style.display = 'none'; });
    header.appendChild(title);
    header.appendChild(count);
    header.appendChild(close);
    notif.appendChild(header);

    // Body
    var body = doc.createElement('div');
    body.className = 'notif-body';

    items.forEach(function(m) {
      var card = doc.createElement('div');
      card.className = 'notif-item';

      // Media
      if (m.isVideo && m.vidUrl) {
        var vid = doc.createElement('video');
        vid.src = m.vidUrl;
        vid.controls = true;
        vid.playsInline = true;
        vid.preload = 'metadata';
        card.appendChild(vid);
      } else if (m.imgUrl) {
        var img = doc.createElement('img');
        img.src = m.imgUrl;
        card.appendChild(img);
      }

      // Footer
      var footer = doc.createElement('div');
      footer.className = 'notif-item-footer';

      var meta = doc.createElement('div');
      var tag = doc.createElement('span');
      tag.className = 'notif-tag ' + (m.isVideo ? 'video' : 'photo');
      tag.textContent = m.isVideo ? 'Video' : 'Foto';
      var dim = doc.createElement('span');
      dim.className = 'notif-dim';
      dim.textContent = ' ' + m.width + 'x' + m.height;
      meta.appendChild(tag);
      meta.appendChild(dim);

      var dlBtn = doc.createElement('button');
      dlBtn.className = 'notif-dl';
      dlBtn.textContent = 'Guardar';
      var mediaUrl = m.isVideo ? m.vidUrl : m.imgUrl;
      dlBtn.onclick = (function(url, isVideo) {
        return toPage(function() {
          fetch(url).then(function(r) { return r.blob(); }).then(function(blob) {
            var ext = isVideo ? '.mp4' : '.jpg';
            var file = new File([blob], 'viewonce_' + Date.now() + ext, { type: blob.type || (isVideo ? 'video/mp4' : 'image/jpeg') });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
              navigator.share({ files: [file] });
            } else {
              var blobUrl = URL.createObjectURL(blob);
              var a = document.createElement('a'); a.href = blobUrl; a.download = file.name; a.click();
              setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 5000);
            }
          }).catch(function() {
            window.open(url, '_blank');
          });
        });
      })(mediaUrl, m.isVideo);

      footer.appendChild(meta);
      footer.appendChild(dlBtn);
      card.appendChild(footer);
      body.appendChild(card);
    });

    notif.appendChild(body);
    doc.body.appendChild(notif);
  }

  setTimeout(initUI, 1500);
})();
