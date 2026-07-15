(function () {
  'use strict';

  var state = {
    files: new Map(),
    blobUrls: [],
    rootHandle: null,
    current: null,
    device: 'phone',
    isOpen: false,
  };

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.from((c || document).querySelectorAll(s)); };

  var el = {
    menuBtn:     $('#menuBtn'),
    fileBadge:   $('#fileBadge'),
    exitBtn:     $('#exitBtn'),
    scrim:       $('#scrim'),
    sidebar:     $('#sidebar'),
    sidebarClose:$('#sidebarClose'),
    searchInput: $('#searchInput'),
    tree:        $('#tree'),
    treeCount:   $('#treeCount'),
    refreshBtn:  $('#refreshBtn'),
    empty:       $('#empty'),
    previewArea: $('#previewArea'),
    deviceWrap:  $('#deviceWrap'),
    device:      $('#device'),
    preview:     $('#preview'),
    nav:         $('#nav'),
    dragVeil:    $('#dragVeil'),
    toastStack:  $('#toastStack'),
    openBtn:     $('#openBtn'),
    folderInput: $('#folderInput'),
  };

  var EXT = {
    html:'html', htm:'html', xhtml:'html',
    css:'css', js:'js', mjs:'js',
    json:'json',
    png:'img', jpg:'img', jpeg:'img', gif:'img', webp:'img',
    svg:'img', bmp:'img', ico:'img',
    txt:'text', md:'text', xml:'text',
    yaml:'text', yml:'text', toml:'text', pdf:'pdf',
  };

  var MIME = {
    html:'text/html', htm:'text/html', xhtml:'application/xhtml+xml',
    css:'text/css', js:'text/javascript', mjs:'text/javascript',
    json:'application/json',
    png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg',
    gif:'image/gif', webp:'image/webp',
    svg:'image/svg+xml', bmp:'image/bmp', ico:'image/x-icon',
    pdf:'application/pdf', txt:'text/plain', md:'text/markdown',
    xml:'text/xml', yaml:'text/yaml', yml:'text/yaml', toml:'text/toml',
  };

  var TEXT_RE = /\.(js|json|css|html?|xhtml|xml|svg|ya?ml|toml|txt|md|sh|env|mjs|cjs|csv)$/i;

  function extOf(n) { var i = n.lastIndexOf('.'); return i > 0 ? n.slice(i + 1).toLowerCase() : ''; }
  function catOf(n) { return EXT[extOf(n)] || 'file'; }
  function mimeOf(n) { return MIME[extOf(n)] || 'application/octet-stream'; }
  function isText(f) { return /^text\//.test(f.type) || TEXT_RE.test(f.name); }
  function isAbs(u) { return /^(https?:|data:|about:|javascript:|#|\/\/|blob:|mailto:|tel:)/i.test(u); }

  function resolve(url, base) {
    if (!url || isAbs(url)) return url;
    var b = base.indexOf('/') !== -1 ? base.slice(0, base.lastIndexOf('/')) : '';
    var segs = b ? b.split('/') : [];
    for (var i = 0; i < url.split('/').length; i++) {
      var p = url.split('/')[i];
      if (p === '.' || p === '') continue;
      if (p === '..') { if (segs.length) segs.pop(); }
      else segs.push(p);
    }
    return segs.join('/');
  }

  function makeBlob(c, t) {
    var b = new Blob([c], { type: (t || '') + ';charset=utf-8' });
    var u = URL.createObjectURL(b);
    state.blobUrls.push(u);
    return u;
  }

  function releaseBlobs() { for (var i = 0; i < state.blobUrls.length; i++) { try { URL.revokeObjectURL(state.blobUrls[i]); } catch (_) {} } state.blobUrls = []; }

  function toast(msg, type) {
    var n = document.createElement('div');
    n.className = 'toast' + (type === 'error' ? ' is-error' : '');
    n.textContent = msg;
    el.toastStack.appendChild(n);
    setTimeout(function () { n.classList.add('is-leaving'); setTimeout(function () { n.remove(); }, 180); }, 2000);
  }

  function readBlob(f) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      if (isText(f)) r.readAsText(f); else r.readAsDataURL(f);
    });
  }

  function detectDeviceType() {
    var w = window.innerWidth;
    if (w < 640) return 'phone';
    if (w < 1024) return 'tablet';
    return 'desktop';
  }

  function sizeDevice() {
    var wrap = el.deviceWrap;
    if (!wrap || wrap.clientWidth === 0 || wrap.clientHeight === 0) return;

    var rw = 9, rh = 19;
    if (state.device === 'tablet') { rw = 3; rh = 4; }
    else if (state.device === 'desktop') { rw = 16; rh = 10; }

    var w = Math.min(wrap.clientWidth, wrap.clientHeight * rw / rh);
    w = Math.max(w, 100);

    el.device.style.width = w + 'px';
    el.device.style.height = (w * rh / rw) + 'px';
  }

  function applyDevice() {
    var detected = detectDeviceType();
    if (detected === state.device && el.device.style.width) return;

    state.device = detected;
    el.device.className = 'device is-' + detected;

    var notch = el.device.querySelector('.device-notch');
    if (notch) notch.style.display = detected === 'phone' ? 'flex' : 'none';

    sizeDevice();
  }

  async function walkFS(dir, prefix) {
    for await (var entry of dir.values()) {
      var full = prefix ? prefix + '/' + entry.name : entry.name;
      if (entry.kind === 'directory') {
        state.files.set(full, { name: entry.name, path: full, type: 'dir' });
        await walkFS(entry, full);
      } else {
        try {
          var f = await entry.getFile();
          var c = await readBlob(f);
          state.files.set(full, { name: entry.name, path: full, type: 'file', mime: f.type || mimeOf(entry.name), content: c, size: f.size });
        } catch (_) {}
      }
    }
  }

  async function openFolder() {
    if (state.isOpen) return;
    state.isOpen = true;
    state.files.clear();
    releaseBlobs();
    try {
      if ('showDirectoryPicker' in window) {
        state.rootHandle = await window.showDirectoryPicker({ mode: 'read' });
        await walkFS(state.rootHandle, '');
      } else {
        if (el.folderInput) { el.folderInput.click(); state.isOpen = false; return; }
      }
    } catch (err) {
      state.isOpen = false;
      if (['AbortError', 'SecurityError'].includes(err.name)) return;
      toast(err.message || err.name, 'error');
      return;
    }
    state.isOpen = false;
    onLoaded(state.rootHandle && state.rootHandle.name);
  }

  el.folderInput.addEventListener('change', async function (e) {
    if (state.isOpen) return;
    state.isOpen = true;
    var list = e.target.files;
    if (!list || !list.length) { state.isOpen = false; return; }
    state.files.clear();
    releaseBlobs();
    var rootName = '';
    for (var i = 0; i < list.length; i++) {
      var file = list[i];
      var parts = file.webkitRelativePath.split('/');
      var rel = parts.slice(1);
      if (!rel.length) continue;
      if (!rootName) rootName = parts[0];
      var p = rel.join('/');
      var acc = '';
      for (var j = 0; j < rel.length - 1; j++) {
        acc = acc ? acc + '/' + rel[j] : rel[j];
        if (!state.files.has(acc)) state.files.set(acc, { name: rel[j], path: acc, type: 'dir' });
      }
      var c = await readBlob(file);
      state.files.set(p, { name: file.name, path: p, type: 'file', mime: file.type || mimeOf(file.name), content: c, size: file.size });
    }
    state.isOpen = false;
    onLoaded(rootName);
  });

  function fileCount() { var n = 0; for (var e of state.files.values()) { if (e.type === 'file') n++; } return n; }

  function transitionToPreview(callback) {
    el.empty.classList.add('is-exiting');
    el.exitBtn.hidden = false;
    setTimeout(function () {
      el.empty.classList.add('hidden-state');
      el.empty.classList.remove('is-exiting');
      el.empty.setAttribute('aria-hidden', 'true');

      el.previewArea.classList.add('is-visible');
      el.previewArea.setAttribute('aria-hidden', 'false');

      applyDevice();

      el.previewArea.style.animation = 'none';
      void el.previewArea.offsetWidth;
      el.previewArea.style.animation = '';

      if (callback) setTimeout(callback, 30);
    }, 280);
  }

  function exitFolder() {
    el.previewArea.classList.remove('is-visible');
    setTimeout(function () {
      el.previewArea.setAttribute('aria-hidden', 'true');
      state.files.clear(); releaseBlobs(); state.rootHandle = null; state.current = null;
      el.fileBadge.hidden = true; el.exitBtn.hidden = true; el.refreshBtn.hidden = true;
      el.treeCount.textContent = ''; el.tree.innerHTML = ''; el.nav.innerHTML = ''; el.preview.src = '';
      el.device.style.width = ''; el.device.style.height = '';
      el.empty.classList.remove('hidden-state');
      el.empty.setAttribute('aria-hidden', 'false');
      el.empty.classList.add('is-entering');
      void el.empty.offsetWidth;
      el.empty.classList.add('enter-done');
      setTimeout(function () { el.empty.classList.remove('is-entering', 'enter-done'); }, 350);
    }, 420);
  }

  el.exitBtn.addEventListener('click', exitFolder);

  function onLoaded(folderName) {
    var n = fileCount();
    if (!n) { toast('没有可预览的文件', 'error'); return; }
    el.fileBadge.textContent = n + ' 个文件';
    el.fileBadge.hidden = false;
    el.treeCount.textContent = n + ' 个文件';
    el.refreshBtn.hidden = false;
    renderTree();
    renderNav();
    transitionToPreview(function () {
      var html = pickEntry();
      if (html) serve(html);
    });
  }

  function pickEntry() {
    var best = null;
    for (var entry of state.files) { var p = entry[0], e = entry[1]; if (e.type !== 'file') continue; var x = extOf(e.name); if (x !== 'html' && x !== 'htm') continue; if (/^index\.html?$/i.test(e.name)) return p; if (!best) best = p; }
    return best;
  }

  function rewriteCss(css, base) {
    return css.replace(/url\(([\"']?)([^\"')]+)\1\)/g, function (_, q, u) {
      if (isAbs(u)) return 'url(' + q + u + q + ')';
      var r = resolve(u, base);
      var f = state.files.get(r);
      if (!f || typeof f.content !== 'string') return 'url(' + q + u + q + ')';
      var src = f.content.indexOf('data:') === 0 ? f.content : makeBlob(f.content, f.mime);
      return 'url(' + q + src + q + ')';
    });
  }

  function getFile(path) { var e = state.files.get(path); return (e && e.type === 'file' && typeof e.content === 'string') ? e : null; }

  function serve(htmlPath) {
    state.current = htmlPath;
    var entry = getFile(htmlPath);
    if (!entry) {
      el.preview.srcdoc = '<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;font:14px system-ui;color:#999">无法加载</body>';
      return;
    }

    el.device.classList.add('loading');
    var screen = el.device.querySelector('.device-screen');
    if (screen) screen.classList.add('is-exiting');

    var loadTimer = setTimeout(function () { el.device.classList.remove('loading'); }, 3000);

    requestAnimationFrame(function () {
    try {
      var doc = new DOMParser().parseFromString(entry.content, 'text/html');

      $$('link[href]', doc).forEach(function (link) {
        var v = link.getAttribute('href');
        if (!v || isAbs(v)) return;
        var r = resolve(v, htmlPath);
        var f = getFile(r);
        if (!f) return;
        link.setAttribute('href', extOf(f.name) === 'css' ? makeBlob(rewriteCss(f.content, htmlPath), 'text/css') : (f.content.indexOf('data:') === 0 ? f.content : makeBlob(f.content, f.mime)));
      });

      function attrMap(sel, attr) { $$(sel, doc).forEach(function (node) { var v = node.getAttribute(attr); if (!v || isAbs(v)) return; var r = resolve(v, htmlPath); var f = getFile(r); if (!f) return; node.setAttribute(attr, f.content.indexOf('data:') === 0 ? f.content : makeBlob(f.content, f.mime)); }); }

      attrMap('script[src]', 'src'); attrMap('img[src]', 'src'); attrMap('source[src]', 'src');
      attrMap('video[src]', 'src'); attrMap('audio[src]', 'src'); attrMap('object[data]', 'data'); attrMap('embed[src]', 'src');

      $$('img[srcset], source[srcset]', doc).forEach(function (node) {
        var ss = node.getAttribute('srcset');
        if (!ss) return;
        node.setAttribute('srcset', ss.split(',').map(function (part) { var seg = part.trim().split(/\s+/); var u = seg[0]; if (!u || isAbs(u)) return part.trim(); var r = resolve(u, htmlPath); var f = getFile(r); if (!f) return part.trim(); var src = f.content.indexOf('data:') === 0 ? f.content : makeBlob(f.content, f.mime); return seg[1] ? src + ' ' + seg[1] : src; }).join(', '));
      });

      $$('[style]', doc).forEach(function (node) { var s = node.getAttribute('style'); if (s && s.indexOf('url(') !== -1) node.setAttribute('style', rewriteCss(s, htmlPath)); });
      $$('style', doc).forEach(function (sty) { if (sty.textContent.indexOf('url(') !== -1) sty.textContent = rewriteCss(sty.textContent, htmlPath); });

      $$('a[href]', doc).forEach(function (a) {
        var v = a.getAttribute('href');
        if (!v || isAbs(v) || v.indexOf('#') === 0 || v.indexOf('javascript:') === 0) return;
        var clean = v.split('?')[0].split('#')[0];
        var r = resolve(clean, htmlPath);
        var f = getFile(r);
        if (!f) return;
        var x = extOf(f.name);
        if (x !== 'html' && x !== 'htm') return;
        a.setAttribute('data-preview-link', r);
        a.setAttribute('href', 'javascript:void(0)');
      });

      var bridge = doc.createElement('script');
      bridge.textContent = '(function(){document.addEventListener("click",function(e){var a=e.target.closest("[data-preview-link]");if(a){e.preventDefault();parent.postMessage({type:"previewNavigate",path:a.getAttribute("data-preview-link")},"*")}})})();';
      doc.body.appendChild(bridge);

      var url = makeBlob(doc.documentElement.outerHTML, 'text/html');
      el.preview.onload = function () {
        clearTimeout(loadTimer);
        el.device.classList.remove('loading');
        if (screen) screen.classList.remove('is-exiting');
      };
      el.preview.src = url;
      markActive(htmlPath);
      markTab(htmlPath);
    } catch (err) {
      clearTimeout(loadTimer);
      el.preview.srcdoc = '<!doctype html><meta charset="utf-8"><body style="margin:0;display:grid;place-items:center;height:100vh;font:14px system-ui;color:#c44">加载失败</body>';
      el.device.classList.remove('loading');
      if (screen) screen.classList.remove('is-exiting');
    }
    });
  }

  var ICONS = {
    folder: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M1 3 h6 l2 2 h6 a1 1 0 0 1 1 1 v8 a1 1 0 0 1-1 1 h-14 a1 1 0 0 1-1-1 v-10 a1 1 0 0 1 1-1 z"/></svg>',
    folderOpen: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M1 5 h6 l2 2 h7 a1 1 0 0 1 1 1 l-2 6 a1 1 0 0 1-1 1 h-12 a1 1 0 0 1-1-1 l2-8 a1 1 0 0 1 1-1 z"/></svg>',
    html: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M11 5 l3 3 -3 3"/><path d="M5 5 l-3 3 3 3"/><line x1="7" y1="3" x2="9" y2="13" opacity="0.3"/></svg>',
    css: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 2 l12 1 -1.5 11 -4.5 2 -4.5-2 -0.5-3"/><line x1="5" y1="6" x2="11" y2="6.5" opacity="0.4"/></svg>',
    js: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><polygon points="8 1 14 4 14 12 8 15 2 12 2 4"/><path d="M5.5 6.5 L5.5 11" opacity="0.5"/><path d="M10.5 6 v3 a1 1 0 0 0 1 1 a1 1 0 0 0 1-1" opacity="0.5"/></svg>',
    file: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M10 1 h-6 a1 1 0 0 0-1 1 v12 a1 1 0 0 0 1 1 h8 a1 1 0 0 0 1-1 v-9 z"/><path d="M10 1 v5 h5" opacity="0.4"/></svg>',
  };

  function iconFor(name) { return ICONS[catOf(name)] || ICONS.file; }

  function buildTree(filter) {
    var root = { type: 'dir', children: [], map: {} };
    var lo = filter ? filter.toLowerCase() : '';
    for (var entry of state.files) { var path = entry[0], e = entry[1]; if (lo && e.type === 'file' && path.toLowerCase().indexOf(lo) === -1) continue; var parts = path.split('/'); var cur = root; for (var i = 0; i < parts.length; i++) { var seg = parts[i]; if (!cur.map[seg]) { var pp = parts.slice(0, i + 1).join('/'); var fe = state.files.get(pp); cur.map[seg] = { name: seg, path: pp, type: fe && fe.type === 'dir' ? 'dir' : 'file', children: [], map: {} }; cur.children.push(cur.map[seg]); } cur = cur.map[seg]; } }
    sortTree(root); return root;
  }

  function sortTree(node) { node.children.sort(function (a, b) { if (a.type !== b.type) return a.type === 'dir' ? -1 : 1; return a.name.localeCompare(b.name, undefined, { numeric: true }); }); for (var i = 0; i < node.children.length; i++) { if (node.children[i].children.length) sortTree(node.children[i]); } }

  function renderTree(filter) {
    var root = buildTree(filter);
    el.tree.innerHTML = '';
    if (!root.children.length) { el.tree.innerHTML = '<li class="tree-empty">无匹配文件</li>'; return; }
    var frag = document.createDocumentFragment();
    for (var i = 0; i < root.children.length; i++) frag.appendChild(createNode(root.children[i], 0));
    el.tree.appendChild(frag);
    var items = $$('.tree-item', el.tree);
    for (var j = 0; j < items.length; j++) {
      (function (el, d) { setTimeout(function () { el.classList.add('tree-in'); }, d * 18); })(items[j], j);
    }
  }

  function getPageTitle(path) {
    var e = state.files.get(path);
    if (!e || typeof e.content !== 'string') return '';
    var m = e.content.match(/<title[^>]*>([^<]+)<\/title>/i);
    return m ? m[1].trim() : '';
  }

  function createNode(n, depth) {
    var isDir = n.type === 'dir';
    var li = document.createElement('li');
    li.dataset.path = n.path;
    var item = document.createElement('div');
    item.className = 'tree-item' + (isDir ? ' is-folder' : ' is-' + catOf(n.name));
    item.style.paddingLeft = (depth * 14 + 12) + 'px';

    if (isDir) {
      var iconSpan = document.createElement('span'); iconSpan.className = 'tree-icon'; iconSpan.innerHTML = ICONS.folder; item.appendChild(iconSpan);
      var nameSpan = document.createElement('span'); nameSpan.className = 'tree-name'; nameSpan.textContent = n.name; item.appendChild(nameSpan);
      li.appendChild(item);
      var cc = document.createElement('ul'); cc.className = 'tree-children'; cc.style.maxHeight = depth === 0 ? 'none' : '0';
      if (n.children.length) { var cf = document.createDocumentFragment(); for (var i = 0; i < n.children.length; i++) cf.appendChild(createNode(n.children[i], depth + 1)); cc.appendChild(cf); }
      li.appendChild(cc);
      if (depth === 0) iconSpan.innerHTML = ICONS.folderOpen;
      item.addEventListener('click', function (e) { e.stopPropagation(); var isOpen = cc.style.maxHeight !== '0px' && cc.style.maxHeight !== '0'; cc.style.maxHeight = isOpen ? '0' : 'none'; iconSpan.innerHTML = isOpen ? ICONS.folder : ICONS.folderOpen; });
    } else {
      var iconSpan = document.createElement('span'); iconSpan.className = 'tree-icon'; iconSpan.innerHTML = iconFor(n.name); item.appendChild(iconSpan);
      var nameSpan = document.createElement('span'); nameSpan.className = 'tree-name'; nameSpan.textContent = n.name; item.appendChild(nameSpan);
      li.appendChild(item);
      item.addEventListener('click', function (e) { e.stopPropagation(); var x = extOf(n.name); if (x === 'html' || x === 'htm') { serve(n.path); if (window.innerWidth < 768) closeSidebar(); } else toast('仅 HTML 文件可预览'); });
      if (extOf(n.name) === 'html' || extOf(n.name) === 'htm') {
        var longT;
        item.addEventListener('pointerdown', function () { longT = setTimeout(function () { var t = getPageTitle(n.path); if (t) toast(t); }, 600); });
        item.addEventListener('pointerup', function () { clearTimeout(longT); });
        item.addEventListener('pointerleave', function () { clearTimeout(longT); });
        item.addEventListener('contextmenu', function (e) { e.preventDefault(); var t = getPageTitle(n.path); if (t) toast(t); });
      }
    }
    if (state.current === n.path) item.classList.add('active');
    return li;
  }

  function markActive(path) { $$('.tree-item.active').forEach(function (e) { e.classList.remove('active'); }); var items = $$('.tree-item'); for (var i = 0; i < items.length; i++) { if (items[i].parentElement && items[i].parentElement.dataset.path === path) { items[i].classList.add('active'); break; } } }

  function renderNav() {
    el.nav.innerHTML = '';
    var htmls = [];
    for (var entry of state.files) { var p = entry[0], e = entry[1]; if (e.type !== 'file') continue; var x = extOf(e.name); if (x === 'html' || x === 'htm') htmls.push({ path: p, name: e.name }); }
    for (var i = 0; i < htmls.length; i++) { var btn = document.createElement('button'); btn.className = 'preview-tab'; btn.textContent = htmls[i].name; btn.dataset.path = htmls[i].path; (function (path) { btn.addEventListener('click', function () { serve(path); }); })(htmls[i].path); el.nav.appendChild(btn); }
    $$('.preview-tab').forEach(function (btn) {
      var path = btn.dataset.path;
      var longT2;
      btn.addEventListener('pointerdown', function () { longT2 = setTimeout(function () { var t = getPageTitle(path); if (t) toast(t); }, 600); });
      btn.addEventListener('pointerup', function () { clearTimeout(longT2); });
      btn.addEventListener('pointerleave', function () { clearTimeout(longT2); });
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); var t = getPageTitle(path); if (t) toast(t); });
    });
  }

  function markTab(path) { $$('.preview-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.path === path); }); var active = $('.preview-tab.active'); if (active) active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); }

  function openSidebar() { el.sidebar.classList.add('is-open'); el.scrim.classList.add('is-on'); }
  function closeSidebar() { el.sidebar.classList.remove('is-open'); el.scrim.classList.remove('is-on'); }

  el.menuBtn.addEventListener('click', function () { el.sidebar.classList.contains('is-open') ? closeSidebar() : openSidebar(); });
  el.scrim.addEventListener('click', closeSidebar);
  el.sidebarClose.addEventListener('click', closeSidebar);

  var searchT;
  el.searchInput.addEventListener('input', function () { clearTimeout(searchT); searchT = setTimeout(function () { renderTree(el.searchInput.value.trim()); }, 120); });

  document.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    if (e.key === 'Escape' && el.sidebar.classList.contains('is-open')) closeSidebar();
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openSidebar(); setTimeout(function () { el.searchInput.focus(); }, 250); }
    if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); openFolder(); }
  });

  var dc = 0;
  document.addEventListener('dragenter', function (e) { e.preventDefault(); if (!e.dataTransfer) return; dc++; if (Array.from(e.dataTransfer.types).indexOf('Files') !== -1) el.dragVeil.classList.add('is-on'); });
  document.addEventListener('dragleave', function (e) { e.preventDefault(); dc = Math.max(0, dc - 1); if (dc === 0) el.dragVeil.classList.remove('is-on'); });
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', async function (e) {
    e.preventDefault(); el.dragVeil.classList.remove('is-on'); dc = 0;
    var items = e.dataTransfer && e.dataTransfer.items; if (!items) return;
    var dirEntry = null;
    for (var i = 0; i < items.length; i++) { var entry = items[i].webkitGetAsEntry ? items[i].webkitGetAsEntry() : null; if (entry && entry.isDirectory) { dirEntry = entry; break; } }
    if (!dirEntry) { toast('请拖拽整个文件夹', 'error'); return; }
    state.files.clear(); releaseBlobs(); await readEntry(dirEntry, ''); onLoaded(dirEntry.name);
  });

  async function readEntry(entry, prefix) {
    if (entry.isDirectory) {
      var full = prefix ? prefix + '/' + entry.name : entry.name;
      state.files.set(full, { name: entry.name, path: full, type: 'dir' });
      var reader = entry.createReader();
      await new Promise(function (res) { var all = []; function step() { reader.readEntries(function (ents) { if (!ents.length) { Promise.all(all.map(function (c) { return readEntry(c, full); })).then(res); return; } for (var i = 0; i < ents.length; i++) all.push(ents[i]); step(); }, res); } step(); });
    } else {
      var full = prefix ? prefix + '/' + entry.name : entry.name;
      var f = await new Promise(function (res, rej) { entry.file(res, rej); });
      var c = await readBlob(f);
      state.files.set(full, { name: entry.name, path: full, type: 'file', mime: f.type || mimeOf(entry.name), content: c, size: f.size });
    }
  }

  el.openBtn.addEventListener('click', openFolder);
  el.refreshBtn.addEventListener('click', function () { if (state.rootHandle && 'showDirectoryPicker' in window) openFolder(); else el.folderInput.click(); });

  var resizeT;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (el.previewArea.classList.contains('is-visible')) {
        applyDevice();
      }
    }, 150);
  });

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'previewNavigate') {
      var path = e.data.path;
      var f = state.files.get(path);
      if (f && f.type === 'file') { serve(path); }
    }
  });

  if (!('showDirectoryPicker' in window)) {
    toast('当前浏览器不支持文件夹选择，请使用 Chrome 或 Edge', 'error');
  }
})();