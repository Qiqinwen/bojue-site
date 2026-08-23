/* ============================================================
 *  theme.js — shared light/dark theme system for the tokenized
 *  pages (landing + about). Drop-in, same spirit as site-logo.js:
 *  add ONCE in <head> (synchronous, so the theme is set before the
 *  first paint — no flash), then place <theme-toggle></theme-toggle>
 *  wherever the switch should live (e.g. the Projects/About nav pill).
 *
 *  Behaviour
 *    • Initial theme: a saved manual choice wins; otherwise it follows
 *      the visitor's LOCAL TIME — 06:00–17:59 → light, 18:00–05:59 → dark.
 *    • The sun/moon toggle flips light⇄dark, PERSISTS the choice
 *      (localStorage), and emits a 'themechange' event so canvas-based
 *      pages (the landing's particle field) can repaint to match.
 *    • Dark values are warm charcoal — the brand is warm ink on paper,
 *      so the dark side stays warm, never cold black.
 *
 *  Only the tokenized pages load this. Untokenized project scrapes are
 *  left alone; a page that must stay dark regardless can set
 *  <html data-theme="dark" data-theme-lock> and the toggle won't move it.
 * ============================================================ */
(function () {
  'use strict';

  var KEY = 'yx-theme';
  var root = document.documentElement;

  function byTime() {
    var h = new Date().getHours();
    return (h >= 6 && h < 18) ? 'light' : 'dark';
  }
  function saved() {
    try {
      var value = localStorage.getItem(KEY);
      return value === 'dark' || value === 'light' ? value : null;
    } catch (e) { return null; }
  }
  function locked() { return root.hasAttribute('data-theme-lock'); }
  function current() { return root.getAttribute('data-theme') || 'light'; }

  // ---- Pre-paint: decide + apply immediately (this runs from <head>) ----
  if (!root.getAttribute('data-theme')) {
    root.setAttribute('data-theme', saved() || byTime());
  }

  function apply(theme, persist) {
    if (locked()) return;
    root.setAttribute('data-theme', theme);
    if (persist) { try { localStorage.setItem(KEY, theme); } catch (e) {} }
    var pressed = theme === 'dark' ? 'true' : 'false';
    var toggles = document.querySelectorAll('theme-toggle .theme-toggle-btn');
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].setAttribute('aria-pressed', pressed);
      toggles[i].setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
  }
  function toggle() { apply(current() === 'dark' ? 'light' : 'dark', true); }

  // Small public hooks (handy for debugging / other scripts).
  window.__setTheme = function (t) { apply(t === 'dark' ? 'dark' : 'light', true); };
  window.__setThemeTransient = function (t) { apply(t === 'dark' ? 'dark' : 'light', false); };
  window.__getPreferredTheme = function () { return saved() || byTime(); };
  window.__toggleTheme = toggle;

  // ---- Styles: warm-charcoal dark tokens (one source of truth) + toggle ----
  if (!document.getElementById('theme-styles')) {
    var s = document.createElement('style');
    s.id = 'theme-styles';
    s.textContent =
      // `data-hero-veil="dark"` lets a light-themed page borrow the dark tokens for a
      // dark hero (the landing's grass field) and cross-fade to light as you scroll.
      'html[data-theme="dark"], html[data-hero-veil="dark"]{' +
        '--paper-0:#1d1916;--paper-50:#121110;' +
        '--page-bg:#181818;' +
        '--color-bg:#121110;--color-bg-subtle:#17150f;' +
        '--color-text-primary:#f2ede6;--color-text-body:#c5beb4;--color-text-muted:#948c82;' +
        '--color-border:#322d27;' +
        '--ui-text:rgba(240,234,226,0.90);--ui-text-dim:rgba(240,234,226,0.45);' +
        '--glass-bg:rgba(255,255,255,0.05);--glass-border:rgba(255,255,255,0.14);--chip-bg:rgba(255,255,255,0.12);' +
        '--material-bg:rgba(32,28,24,0.55);--material-border:rgba(255,255,255,0.10);' +
        '--project-card-bg:#262626;--project-media-backplate:#ffffff;' +
        '--material-shadow:0 10px 34px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.06);' +
        '--plate-bg:var(--material-bg);--plate-border:var(--material-border);--plate-shadow:var(--material-shadow);' +
        '--plate-chip:rgba(255,255,255,0.12);' +
      '}' +
      // smooth cross-fade on toggle
      'html[data-theme] body{transition:background-color .5s ease,color .5s ease;}' +
      '.nav{transition:background .5s ease,border-color .5s ease;}' +
      // toggle button — sized to sit inside the frosted nav pill
      'theme-toggle{display:inline-flex;align-items:center;}' +
      '.theme-toggle-btn{display:inline-flex;align-items:center;justify-content:center;' +
        'width:32px;height:32px;padding:0;border:none;background:transparent;' +
        'border-radius:var(--radius-round,999px);color:var(--ui-text,currentColor);' +
        'cursor:pointer;-webkit-tap-highlight-color:transparent;' +
        'transition:background .25s ease,color .25s ease;}' +
      '.theme-toggle-btn:hover{background:var(--plate-chip,rgba(0,0,0,0.08));}' +
      '.theme-toggle-btn svg{width:16px;height:16px;display:block;}' +
      // sun shows in light (current = day); moon shows in dark (current = night)
      '.theme-toggle-btn .ico-moon{display:none;}' +
      'html[data-theme="dark"] .theme-toggle-btn .ico-sun{display:none;}' +
      'html[data-theme="dark"] .theme-toggle-btn .ico-moon{display:block;}' +
      '@media (prefers-reduced-motion: reduce){html[data-theme] body{transition:none;}.nav{transition:none;}}';
    document.head.appendChild(s);
  }

  var SUN = '<svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="4"/>' +
    '<path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.5 1.5M17.9 17.9l1.5 1.5M2.5 12h2M19.5 12h2M4.6 19.4l1.5-1.5M17.9 6.1l1.5-1.5"/>' +
    '</svg>';
  var MOON = '<svg class="ico-moon" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">' +
    '<path d="M21 12.9A8.5 8.5 0 1 1 11.1 3a6.6 6.6 0 0 0 9.9 9.9z"/></svg>';

  function render(el) {
    var btn = document.createElement('button');
    btn.className = 'theme-toggle-btn';
    btn.type = 'button';
    btn.setAttribute('aria-label', current() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    btn.setAttribute('aria-pressed', current() === 'dark' ? 'true' : 'false');
    btn.innerHTML = SUN + MOON;
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggle(); });
    el.appendChild(btn);
  }

  if (window.customElements && !customElements.get('theme-toggle')) {
    customElements.define('theme-toggle', class extends HTMLElement {
      connectedCallback() {
        if (this.__rendered) return;   // render once
        this.__rendered = true;
        render(this);
      }
    });
  }
})();
