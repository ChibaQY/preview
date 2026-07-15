(function () {
  'use strict';
  var root = document.documentElement;
  var toggle = document.getElementById('themeToggle');
  var KEY = 'preview-theme';

  function preferred() { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }

  function sync(t) {
    var sun = toggle && toggle.querySelector('.icon-sun');
    var moon = toggle && toggle.querySelector('.icon-moon');
    if (sun && moon) { sun.hidden = t === 'dark'; moon.hidden = t !== 'dark'; }
    root.setAttribute('data-theme', t);
    try { localStorage.setItem(KEY, t); } catch (_) {}
  }

  function current() { return root.getAttribute('data-theme') || preferred(); }

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    var s; try { s = localStorage.getItem(KEY); } catch (_) {}
    if (!s) sync(e.matches ? 'dark' : 'light');
  });

  if (toggle) toggle.addEventListener('click', function () { sync(current() === 'dark' ? 'light' : 'dark'); });

  var s; try { s = localStorage.getItem(KEY); } catch (_) {}
  sync(s || preferred());
})();