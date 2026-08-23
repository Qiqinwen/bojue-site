/*
 * PhoneMockup
 * --------------------------------------------------------------------------
 * Reusable iPhone 17 Pro video mockup.
 *
 * Usage:
 *   <script src="/phone-mockup.js" defer></script>
 *   <phone-mockup
 *     src="/videos/Staypass/raffles_detail_page.mp4"
 *     aria-label="StayPass hotel detail screen recording">
 *   </phone-mockup>
 *
 * The frame measurements come from the source PNG itself:
 *   frame canvas: 1350 x 2760
 *   screen aperture: x 72, y 69, width 1206, height 2622
 *   safe screen corner radius: 188 px
 *
 * Keeping those measurements as percentages makes the video, rounded screen,
 * transparent canvas padding, and silver frame scale as one unit at any width.
 */
(function () {
  'use strict';

  if (!window.customElements || customElements.get('phone-mockup')) return;

  var scriptSource = document.currentScript && document.currentScript.src;
  var defaultFrameSource = scriptSource
    ? new URL('images/iPhone 17 Pro - Silver - Portrait.png', scriptSource).href
    : '/images/iPhone%2017%20Pro%20-%20Silver%20-%20Portrait.png';

  var template = document.createElement('template');
  template.innerHTML =
    '<style>' +
      ':host{' +
        'display:block;' +
        'position:relative;' +
        'width:100%;' +
        'aspect-ratio:1350/2760;' +
        'isolation:isolate;' +
        '--phone-media-fit:cover;' +
        '--phone-media-position:50% 50%;' +
        '--phone-shadow:drop-shadow(0 28px 28px rgba(0,0,0,.16)) drop-shadow(0 8px 10px rgba(0,0,0,.12));' +
      '}' +
      ':host([hidden]){display:none}' +
      '.device{' +
        'position:absolute;' +
        'inset:0;' +
        'filter:var(--phone-shadow);' +
      '}' +
      '.screen{' +
        'position:absolute;' +
        'left:5.3333333333%;' +
        'top:2.5%;' +
        'width:89.3333333333%;' +
        'height:95%;' +
        'overflow:hidden;' +
        'border-radius:15.5887230514% / 7.1700991609%;' +
        'background:#000;' +
        'transform:translateZ(0);' +
      '}' +
      'video{' +
        'display:block;' +
        'width:100%;' +
        'height:100%;' +
        'object-fit:var(--phone-media-fit);' +
        'object-position:var(--phone-media-position);' +
      '}' +
      '.frame{' +
        'position:absolute;' +
        'inset:0;' +
        'z-index:1;' +
        'display:block;' +
        'width:100%;' +
        'height:100%;' +
        'object-fit:contain;' +
        'pointer-events:none;' +
        'user-select:none;' +
        '-webkit-user-drag:none;' +
      '}' +
    '</style>' +
    '<div class="device" part="device">' +
      '<div class="screen" part="screen">' +
        '<video part="media" muted playsinline preload="metadata"></video>' +
      '</div>' +
      '<img class="frame" part="frame" alt="" draggable="false" decoding="async">' +
    '</div>';

  function copyAttribute(element, name, value) {
    if (value === null || value === '') element.removeAttribute(name);
    else element.setAttribute(name, value);
  }

  class PhoneMockup extends HTMLElement {
    static get observedAttributes() {
      return ['src', 'poster', 'fit', 'media-position', 'frame-src', 'preload'];
    }

    constructor() {
      super();
      var root = this.attachShadow({ mode: 'open' });
      root.appendChild(template.content.cloneNode(true));
      this._video = root.querySelector('video');
      this._frame = root.querySelector('.frame');
      this._observer = null;
      this._isVisible = false;
      this._onVisibilityChange = this._handleVisibilityChange.bind(this);
    }

    connectedCallback() {
      var fallback = this.querySelector('.phone-mockup-fallback');
      if (fallback) fallback.remove();
      this._syncAllAttributes();
      this._video.muted = true;
      this._video.loop = !this.hasAttribute('no-loop');
      this._video.playsInline = true;
      if (!this.hasAttribute('manual')) this._observeVisibility();
      document.addEventListener('visibilitychange', this._onVisibilityChange);
    }

    disconnectedCallback() {
      if (this._observer) this._observer.disconnect();
      this._observer = null;
      this._video.pause();
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
    }

    attributeChangedCallback() {
      if (this.isConnected) this._syncAllAttributes();
    }

    get video() {
      return this._video;
    }

    play() {
      return this._video.play();
    }

    pause() {
      this._video.pause();
    }

    _syncAllAttributes() {
      var src = this.getAttribute('src');
      var poster = this.getAttribute('poster');
      var frameSource = this.getAttribute('frame-src') || defaultFrameSource;
      var fit = this.getAttribute('fit') || 'cover';
      var position = this.getAttribute('media-position') || '50% 50%';
      var preload = this.getAttribute('preload') || 'metadata';

      if (src && this._video.getAttribute('src') !== src) this._video.src = src;
      if (!src) this._video.removeAttribute('src');
      copyAttribute(this._video, 'poster', poster);
      this._video.preload = preload;
      this._frame.src = frameSource;
      this.style.setProperty('--phone-media-fit', fit);
      this.style.setProperty('--phone-media-position', position);
    }

    _observeVisibility() {
      var self = this;
      if (!('IntersectionObserver' in window)) {
        this._isVisible = true;
        this._playWhenReady();
        return;
      }
      this._observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          self._isVisible = entry.isIntersecting;
          if (self._isVisible) self._playWhenReady();
          else self._video.pause();
        });
      }, { threshold: 0.15 });
      this._observer.observe(this);
    }

    _handleVisibilityChange() {
      if (document.hidden) this._video.pause();
      else if (this._isVisible) this._playWhenReady();
    }

    _playWhenReady() {
      if (!this.getAttribute('src') || document.hidden) return;
      this._video.play().catch(function () {});
    }
  }

  window.PhoneMockup = PhoneMockup;
  customElements.define('phone-mockup', PhoneMockup);
})();
