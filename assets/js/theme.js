/**
 * theme.js  -  light / dark mode for the TEACHER pages
 * Load in <head> (before the page paints) so there is no flash:
 *     <script src="../assets/js/theme.js"></script>
 * The choice is remembered in this browser. Teachers start in LIGHT mode.
 * Any element with  data-theme-toggle  becomes the switch (topNav.js adds one beside the SejarahWira title).
 */
(function () {
  var KEY = 'sw_teacher_theme';
  var root = document.documentElement;

  // inline icons: no dependency on Font Awesome (works offline / when the CDN is blocked)
  var SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var MOON = SVG + '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var SUN = SVG + '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

  function read() {
    try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* the page still works without storage */ }
  }

  function paint(button) {
    var dark = root.getAttribute('data-theme') === 'dark';
    var label = dark ? 'Tukar ke mod cerah' : 'Tukar ke mod gelap';
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', dark ? 'true' : 'false');
    button.title = label;
    button.innerHTML = dark ? SUN : MOON;
  }

  function apply(v) {
    root.setAttribute('data-theme', v);
    document.querySelectorAll('[data-theme-toggle]').forEach(paint);
  }

  var SWTheme = {
    get: function () { return root.getAttribute('data-theme') || 'light'; },
    set: function (v) { write(v); apply(v); },
    toggle: function () { SWTheme.set(SWTheme.get() === 'dark' ? 'light' : 'dark'); },
    /** wire every [data-theme-toggle] inside `scope` (call again after rendering new buttons) */
    bind: function (scope) {
      (scope || document).querySelectorAll('[data-theme-toggle]').forEach(function (b) {
        if (!b.__swBound) { b.__swBound = true; b.addEventListener('click', SWTheme.toggle); }
        paint(b);
      });
    }
  };
  window.SWTheme = SWTheme;

  root.setAttribute('data-theme', read());
  document.addEventListener('DOMContentLoaded', function () { SWTheme.bind(document); });
})();
