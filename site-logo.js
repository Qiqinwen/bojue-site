/* ============================================================
 *  site-logo.js — the 一宸 brand mark as a reusable component.
 *
 *  Drop-in: add this once per page (in <head>, so the mark paints
 *  styled without a flash) and use the element anywhere:
 *
 *      <site-logo></site-logo>                  → the plain mark (e.g. home)
 *      <site-logo href="index.html"></site-logo> → the mark as a link home
 *
 *  The mark uses local vector outlines derived from the Noto Serif SC
 *  web face, so it is identical on every device without waiting for a
 *  Chinese font to download. Keep the tag EMPTY: the component renders
 *  the mark itself. (Loaded from <head>, the element upgrades mid-parse,
 *  so any inner text would be appended after the rendered mark.)
 * ============================================================ */
(function () {
  'use strict';

  var MARK = '伯爵';
  var script = document.currentScript;
  var assetBase = script && script.src
    ? new URL('.', script.src).href
    : new URL('.', document.baseURI).href;
  var DARK_SRC = assetBase + 'images/yichen-logo-dark.svg';
  var LIGHT_SRC = assetBase + 'images/yichen-logo-light.svg';

  // Inject the component styles once. Both vector variants are present in
  // the DOM so theme changes swap instantly without fetching at interaction time.
  if (!document.getElementById('site-logo-styles')) {
    var style = document.createElement('style');
    style.id = 'site-logo-styles';
    style.textContent =
      'site-logo{display:inline-block;line-height:0;}' +
      'site-logo .site-logo__mark{' +
        'display:inline-flex;align-items:center;justify-content:center;' +
        'color:var(--ui-text,currentColor);text-decoration:none;' +
      '}' +
      'site-logo .site-logo__asset{' +
        'display:block;width:clamp(36px,4.2vw,54px);height:auto;flex:none;' +
      '}' +
      'site-logo .site-logo__asset--light{display:none;}' +
      'html[data-theme="dark"] site-logo .site-logo__asset--dark,' +
      'html[data-hero-veil="dark"] site-logo .site-logo__asset--dark{display:none;}' +
      'html[data-theme="dark"] site-logo .site-logo__asset--light,' +
      'html[data-hero-veil="dark"] site-logo .site-logo__asset--light{display:block;}';
    document.head.appendChild(style);
  }

  function markup(el) {
    var href = el.getAttribute('href');
    var label = el.getAttribute('label') || (href ? 'Home — ' + MARK : MARK);
    var assets =
      '<img class="site-logo__asset site-logo__asset--dark" src="' + DARK_SRC + '" alt="" aria-hidden="true" width="1000" height="1920">' +
      '<img class="site-logo__asset site-logo__asset--light" src="' + LIGHT_SRC + '" alt="" aria-hidden="true" width="1000" height="1920">';
    return href
      ? '<a class="site-logo__mark" href="' + href + '" aria-label="' + label + '">' + assets + '</a>'
      : '<span class="site-logo__mark" role="img" aria-label="' + label + '">' + assets + '</span>';
  }

  if (window.customElements && !customElements.get('site-logo')) {
    customElements.define('site-logo', class extends HTMLElement {
      connectedCallback() {
        if (this.__rendered) return;   // render once; ignore re-connects
        this.__rendered = true;
        this.innerHTML = markup(this);
      }
    });
  }
})();
