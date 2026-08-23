(function () {
  'use strict';

  function el(doc, tag, className) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function icon(doc, src, marker) {
    var image = el(doc, 'img');
    image.src = src;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    if (marker) image.setAttribute(marker, '');
    return image;
  }

  function install(doc) {
    if (!doc || !doc.head || !doc.body || doc.getElementById('dimPromoSection')) return;
    var intro = doc.querySelector('._100vwcontentholder > .overviewwrapper');
    var introSection = intro && intro.closest('._100vwcontentholder');
    if (!introSection || !introSection.parentNode) return;

    var stylesheet = doc.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = '/case/dim-media.css?v=20260814a';
    doc.head.appendChild(stylesheet);

    var section = el(doc, 'section', '_100vwcontentholder dim-promo-section');
    section.id = 'dimPromoSection';
    section.setAttribute('aria-label', 'Dim promotional film');
    var stage = el(doc, 'div', 'dim-promo');
    var video = el(doc, 'video', 'dim-promo__video');
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    var source = doc.createElement('source');
    source.src = '/videos/dim%20november%20ph.mp4';
    source.type = 'video/mp4';
    video.appendChild(source);

    var controls = el(doc, 'div', 'dim-promo__controls');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Video controls');

    var play = el(doc, 'button', 'dim-promo__control');
    play.type = 'button';
    play.setAttribute('aria-label', 'Pause video');
    var pauseIcon = icon(doc, '/images/pause.svg');
    pauseIcon.className = 'dim-promo__pause';
    var playIcon = el(doc, 'span', 'dim-promo__play');
    playIcon.setAttribute('aria-hidden', 'true');
    play.appendChild(pauseIcon);
    play.appendChild(playIcon);

    var sound = el(doc, 'button', 'dim-promo__control');
    sound.type = 'button';
    sound.setAttribute('aria-label', 'Unmute video');
    var mutedIcon = icon(doc, '/images/speaker.slash.svg', 'data-dim-muted');
    var audibleIcon = icon(doc, '/images/speaker.wave.2.svg', 'data-dim-audible');
    audibleIcon.hidden = true;
    sound.appendChild(mutedIcon);
    sound.appendChild(audibleIcon);

    controls.appendChild(play);
    controls.appendChild(sound);
    stage.appendChild(video);
    stage.appendChild(controls);
    section.appendChild(stage);
    introSection.insertAdjacentElement('afterend', section);

    function syncPlayback() {
      var paused = video.paused;
      play.classList.toggle('is-paused', paused);
      play.setAttribute('aria-label', paused ? 'Play video' : 'Pause video');
    }

    function syncSound() {
      mutedIcon.hidden = !video.muted;
      audibleIcon.hidden = video.muted;
      sound.setAttribute('aria-label', video.muted ? 'Unmute video' : 'Mute video');
    }

    play.addEventListener('click', function () {
      if (video.paused) video.play().catch(function () {});
      else video.pause();
    });
    sound.addEventListener('click', function () { video.muted = !video.muted; });
    video.addEventListener('play', syncPlayback);
    video.addEventListener('pause', syncPlayback);
    video.addEventListener('volumechange', syncSound);

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) video.pause();
    else video.play().catch(function () {});
    syncPlayback();
    syncSound();
  }

  window.DimMedia = { install: install };
})();
