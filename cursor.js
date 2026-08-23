/* ============================================================
 *  cursor.js — the site-wide custom cursor (一宸 portfolio)
 *
 *  A self-contained, drop-in module: it injects its own font, styles and
 *  markup, then runs the controller. Add it to ANY page with one line:
 *
 *      <script src="cursor.js" defer></script>          (root pages)
 *      <script src="../cursor.js" defer></script>       (pages in /case)
 *
 *  Behaviour — a blue dot that morphs between four states (pure CSS
 *  transitions, so it truly morphs rather than swaps):
 *    • default  — small solid dot
 *    • hover    — grows into a hollow ring over any link/button/control
 *    • pressed  — squashes + dims on mousedown
 *    • label    — morphs into a labelled pill over elements that carry a
 *                 label (see "Labels" below)
 *  The pointer is always the pill's TOP-LEFT corner, so it opens rightward.
 *  Follows with a gentle lag (restrained, not glued to the pointer).
 *  Only runs on fine pointers; touch keeps the native cursor. Honours
 *  prefers-reduced-motion (drops the lag + shortens the morph).
 *
 *  Labels — two ways for an element to drive the pill:
 *    1. data-cursor-key="<key>"  → looks up window.CURSOR_LABELS[key] =
 *       { labels: [..], variant? } and ROTATES through the list (a fresh
 *       line each hover). The homepage uses this for its project cards.
 *    2. data-cursor-label="text" (+ optional data-cursor-variant="pink")
 *       → a static single-line pill, for one-off elements on any page.
 * ============================================================ */
(function () {
  'use strict';

  // Fine-pointer only — touch / coarse pointers keep the native cursor.
  if (!window.matchMedia || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var CSS = '\
:root{\
--cursor-blue:#1f49c4;--cursor-pink:#ff40b9;--cursor-dot:11px;\
--cursor-ease:cubic-bezier(0.33,1.18,0.37,1);\
--cursor-font:"JetBrains Mono",ui-monospace,"SF Mono",SFMono-Regular,Menlo,monospace;}\
.cursor-on,.cursor-on *{cursor:none!important;}\
.cursor-on input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),\
.cursor-on textarea,.cursor-on [contenteditable="true"]{cursor:text!important;}\
.cursor{position:fixed;top:0;left:0;z-index:2147483600;pointer-events:none;\
transform:translate3d(-100px,-100px,0);will-change:transform;opacity:0;transition:opacity .25s ease;}\
.cursor.is-active{opacity:1;}\
.cursor.is-hidden{opacity:0;transition:none;}\
.cursor__shape{position:absolute;top:0;left:0;box-sizing:border-box;display:inline-flex;\
align-items:center;justify-content:flex-start;width:var(--cursor-dot);height:var(--cursor-dot);\
padding:0;border:0 solid var(--cursor-blue);border-radius:999px;background:var(--cursor-blue);\
color:#fff;overflow:hidden;white-space:nowrap;box-shadow:0 3px 14px rgba(20,40,120,.30);\
transform:scale(1);transform-origin:top left;\
transition:width .46s var(--cursor-ease),height .46s var(--cursor-ease),padding .46s var(--cursor-ease),\
border-width .3s var(--cursor-ease),background-color .32s ease,box-shadow .32s ease,\
transform .26s cubic-bezier(0.2,0.8,0.2,1);}\
.cursor.is-hover .cursor__shape{width:34px;height:34px;border-width:1.5px;background:rgba(31,73,196,.10);box-shadow:none;}\
.cursor.is-down .cursor__shape{transform:scale(0.82);}\
.cursor.is-label .cursor__shape{height:28px;padding:0 13px;border-width:0;background:var(--cursor-blue);box-shadow:0 8px 24px rgba(20,40,120,.26);}\
.cursor.is-label.is-pink .cursor__shape{background:var(--cursor-pink);box-shadow:0 8px 24px rgba(180,30,120,.30);}\
.cursor__label{font:500 12px/1 var(--cursor-font);letter-spacing:0;opacity:0;transform:translateY(2px);\
transition:opacity .2s ease,transform .32s var(--cursor-ease);}\
.cursor.is-label .cursor__label{opacity:1;transform:none;transition-delay:.07s,.07s;}\
.cursor-probe{position:fixed;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;\
white-space:nowrap;font:500 12px/1 var(--cursor-font);letter-spacing:0;}\
.cursor.reduce .cursor__shape,.cursor.reduce .cursor__label{transition-duration:.12s;}';

  var cursor, shape, label, probe;

  function inject() {
    // Mono face (matches index.html's request — skip if already requested).
    if (!document.querySelector('link[href*="JetBrains+Mono"]')) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap';
      document.head.appendChild(link);
    }
    if (!document.getElementById('cursor-styles')) {
      var style = document.createElement('style');
      style.id = 'cursor-styles';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    cursor = document.getElementById('cursor');
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.className = 'cursor';
      cursor.id = 'cursor';
      cursor.setAttribute('aria-hidden', 'true');
      cursor.innerHTML = '<div class="cursor__shape"><span class="cursor__label"></span></div>';
      document.body.appendChild(cursor);
      probe = document.createElement('span');
      probe.className = 'cursor-probe';
      probe.id = 'cursorProbe';
      probe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(probe);
    } else {
      probe = document.getElementById('cursorProbe');
    }
    shape = cursor.querySelector('.cursor__shape');
    label = cursor.querySelector('.cursor__label');
  }

  function start() {
    inject();
    if (!cursor || !shape || !label || !probe) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) cursor.classList.add('reduce');
    document.body.classList.add('cursor-on');   // hide the native cursor

    var HOVER_SEL = 'a, button, [role="button"], summary, label, select, .work-dot, .switch, .case-tab, input[type="range"]';
    var TEXT_SEL = 'input:not([type="range"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"]';
    var PAD = 26;   // .is-label horizontal padding (13 × 2)

    var tx = window.innerWidth / 2, ty = window.innerHeight / 2;   // target (pointer)
    var cx = tx, cy = ty;                                          // current (lerped)
    var EASE = reduce ? 1 : 0.2;
    var shown = false, host = null, snapToPointer = false;
    var seen = {};   // per-key rotation index → a different tagline each hover

    // Cross-frame coordination — the single-dot guarantee.
    // The parent page AND each same-origin case-study iframe run this same module,
    // so the pointer is only ever "in" one of them at a time. Each frame stamps the
    // shared top window as the owner whenever the pointer moves within it; every
    // frame's render loop hides its own dot while it is NOT the owner. This makes
    // the handoff immune to mouseleave / :hover timing races (which previously let a
    // second dot linger on the backdrop after you moved into the case window).
    var TOP = (function () { try { return window.top; } catch (e) { return window; } })();
    function claimCursor() { try { TOP.__inkCursorOwner = window; } catch (e) {} }
    function ownsCursor() {
      try { var o = TOP.__inkCursorOwner; return o == null || o === window; }
      catch (e) { return true; }   // cross-origin top: behave as a normal standalone cursor
    }
    // Every same-origin cursor frame except this one (the top page + its iframes).
    // Cross-origin frames don't run this module and throw on access, so they are
    // skipped. This is how we enforce the single dot the instant the
    // pointer enters a frame, without waiting on a render-loop tick (rAF is paused
    // in background tabs, so the hide must be event-driven to be reliable).
    function eachOtherCursor(fn) {
      var frames = [];
      try {
        if (TOP !== window) frames.push(TOP);
        var ifr = TOP.document.getElementsByTagName('iframe');
        for (var i = 0; i < ifr.length; i++) {
          try { var w = ifr[i].contentWindow; if (w && w !== window) frames.push(w); } catch (e) {}
        }
      } catch (e) {}
      frames.forEach(function (w) {
        try { var c = w.document.getElementById('cursor'); if (c) fn(c); } catch (e) {}
      });
    }
    function hideOtherCursors() { eachOtherCursor(function (c) { c.classList.add('is-hidden'); }); }

    function pickLabel(key, list) {
      if (list.length < 2) return list[0];
      var i = seen[key] == null ? 0 : (seen[key] + 1) % list.length;
      seen[key] = i;
      return list[i];
    }

    (function frame() {
      // Not the owning frame? The pointer is in another frame (e.g. the open case
      // window) — hide our dot so only one is ever visible.
      if (!ownsCursor()) cursor.classList.add('is-hidden');
      var ease = snapToPointer ? 1 : EASE;
      cx += (tx - cx) * ease; cy += (ty - cy) * ease;
      cursor.style.transform = 'translate3d(' + cx.toFixed(2) + 'px,' + cy.toFixed(2) + 'px,0)';
      requestAnimationFrame(frame);
    })();

    // Resolve an element's label source: a rotating keyed list, or a static line.
    function resolveEntry(el) {
      var key = el.dataset.cursorKey;
      if (key && window.CURSOR_LABELS && window.CURSOR_LABELS[key]) return window.CURSOR_LABELS[key];
      if (el.dataset.cursorLabel != null) return { labels: [el.dataset.cursorLabel], variant: el.dataset.cursorVariant };
      return null;
    }

    var hostKey = null;
    function setLabel(el) {
      // re-resolve when the SAME host's key changes in place (the about-page
      // portrait mutates data-cursor-key as its photo rotates)
      var key = el ? (el.dataset.cursorKey || el.dataset.cursorLabel || '') : null;
      if (el === host && key === hostKey) return;
      host = el; hostKey = key;
      var entry = el && resolveEntry(el);
      if (entry && entry.labels && entry.labels.length) {
        var rkey = el.dataset.cursorKey || el.dataset.cursorLabel || '';
        var text = pickLabel(rkey, entry.labels);
        cursor.classList.remove('is-hover');
        label.textContent = text;
        cursor.classList.toggle('is-pink', entry.variant === 'pink');
        probe.textContent = text;
        shape.style.width = (Math.ceil(probe.offsetWidth) + PAD) + 'px';   // animate dot → pill
        cursor.classList.add('is-label');
      } else {
        cursor.classList.remove('is-label', 'is-pink');
        shape.style.width = '';   // animate pill → dot
      }
    }

    function onMove(e) {
      tx = e.clientX; ty = e.clientY;
      if (!shown) { shown = true; cursor.classList.add('is-active'); cx = tx; cy = ty; }
      var t = e.target;
      // Dense project titles need the cursor hotspot to match the real pointer.
      // Keeping the pill exact inside the list prevents it from visually lagging
      // into the neighboring title or the deliberate dead gap between rows.
      snapToPointer = !!(t && t.closest && t.closest('.desktop-project-list'));
      // Over an iframe we can't track the pointer (events don't cross the frame),
      // so hide our dot and let that frame's own cursor take over. Same-origin
      // case-study frames load this same module, so the handoff is seamless.
      if (t && t.tagName === 'IFRAME') { cursor.classList.add('is-hidden'); return; }
      // Pointer is genuinely in THIS frame → take ownership and immediately hide
      // every other frame's dot, so only one is ever visible (no handoff race).
      claimCursor();
      hideOtherCursors();
      // Re-appearing after the handoff: snap to the pointer so the dot doesn't
      // slide in from the stale, lagged spot it was hidden at (which is what made
      // a second dot appear to "stay" behind on the backdrop).
      if (cursor.classList.contains('is-hidden')) { cx = tx; cy = ty; }
      cursor.classList.remove('is-hidden');
      if (!t || !t.closest) return;
      var labelHost = t.closest('[data-cursor-key], [data-cursor-label]');
      if (labelHost) { setLabel(labelHost); return; }
      setLabel(null);
      if (t.closest(TEXT_SEL)) { cursor.classList.add('is-hidden'); return; }
      cursor.classList.toggle('is-hover', !!t.closest(HOVER_SEL));
    }

    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseover', onMove, { passive: true });
    document.addEventListener('mousedown', function () { cursor.classList.add('is-down'); });
    document.addEventListener('mouseup', function () { cursor.classList.remove('is-down'); });
    document.addEventListener('mouseleave', function () { cursor.classList.add('is-hidden'); });
    document.addEventListener('mouseenter', function () { cursor.classList.remove('is-hidden'); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
