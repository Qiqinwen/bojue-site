/* 漫播作品半轮（Half-Wheel）：广播剧在左、唱片在右，滚轮/触屏/拖拽浏览。 */
(function () {
  "use strict";

  var PROFILE_URL = "";
  var items = [];          // {id,title,cover,tags,cat}
  var index = 0;           // target (integer)
  var visual = 0;          // animated position
  var velocity = 0;
  var raf = 0;
  var last = performance.now();
  var ANGLE_MAX = 78 * Math.PI / 180;
  var STEP = ANGLE_MAX / 3.1;
  var MAX_D = 3.4;
  var stageEl = null, cardsEl = null, metaIndex = null, metaCat = null;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function geometry() {
    var w = stageEl.clientWidth;
    var h = stageEl.clientHeight;
    var first = cardsEl.children[0];
    var cardW = first ? first.offsetWidth : Math.min(250, Math.max(140, w * 0.4));
    var cardH = first ? first.offsetHeight : cardW * 1.22;
    var cx = w / 2;
    var baseY = h - 72 - cardH * 0.5;
    var R = Math.min(Math.max(w * 0.55, h * 0.75), 640);
    return { cx: cx, baseY: baseY, R: R, cardW: cardW, cardH: cardH };
  }

  function render() {
    var g = geometry();
    var selected = clamp(Math.round(visual), 0, items.length - 1);
    var cards = cardsEl.children;
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var d = i - visual;
      var angle = d * STEP;
      if (Math.abs(d) > MAX_D) {
        card.style.opacity = "0";
        card.style.zIndex = "0";
        continue;
      }
      var scale = clamp(0.5 + 0.5 * Math.pow(Math.max(0, Math.cos(angle)), 1.15), 0.45, 1);
      var opacity = clamp(1.18 - Math.abs(d) * 0.28, 0, 1);
      var x = g.cx + g.R * Math.sin(angle);
      var y = g.baseY - g.R * (1 - Math.cos(angle));
      var rot = angle * 180 / Math.PI * 0.35;
      card.style.transform = "translate3d(" + (x - g.cardW / 2).toFixed(2) + "px," +
        (y - g.cardH / 2).toFixed(2) + "px,0) rotate(" + rot.toFixed(2) + "deg) scale(" + scale.toFixed(3) + ")";
      card.style.opacity = opacity.toFixed(3);
      card.style.zIndex = String(100 - Math.round(Math.abs(d) * 2));
      card.classList.toggle("is-active", i === selected);
      card.setAttribute("aria-hidden", i === selected ? "false" : "true");
    }
    if (metaIndex) metaIndex.textContent = (selected + 1) + " / " + items.length;
    if (metaCat && items[selected]) metaCat.textContent = items[selected].cat;
  }

  function animate(now) {
    raf = 0;
    var dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000));
    last = now;
    var stiffness = 170, damping = 20;
    var before = index - visual;
    var acc = before * stiffness - velocity * damping;
    velocity += acc * dt;
    visual += velocity * dt;
    var after = index - visual;
    if (before * after < 0 && Math.abs(after) > 0.08) {
      visual = index - Math.sign(after) * 0.08;
      velocity *= 0.45;
    }
    render();
    if (Math.abs(index - visual) > 0.0005 || Math.abs(velocity) > 0.0005) {
      raf = requestAnimationFrame(animate);
    } else {
      visual = index;
      velocity = 0;
      render();
    }
  }

  function ensure() {
    if (reduceMotion.matches) {
      visual = index;
      velocity = 0;
      render();
      return;
    }
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(animate);
    }
  }

  function step(delta) {
    index = clamp(index + delta, 0, items.length - 1);
    ensure();
  }

  function goto(i) {
    index = clamp(i, 0, items.length - 1);
    ensure();
  }

  function build(works) {
    var workEl = document.getElementById("work");
    if (!workEl || !works) return;
    PROFILE_URL = works.profileUrl || "";
    items = [];
    (works.dramas || []).forEach(function (d) { items.push({ id: d.id, title: d.title, cover: d.cover, tags: d.tags, cat: "Radio Drama" }); });
    (works.records || []).forEach(function (r) { items.push({ id: r.id, title: r.title, cover: r.cover, tags: r.tags, cat: "Record" }); });
    if (!items.length) return;

    workEl.innerHTML =
      '<div class="works-page works-page--wheel">' +
        '<p class="works-about">' + esc(works.profile.intro || "") + "</p>" +
        '<div class="wheel">' +
          '<span class="wheel-caption wheel-caption--left">Radio Dramas</span>' +
          '<span class="wheel-caption wheel-caption--right">Records</span>' +
          '<div class="wheel-stage" id="wheelStage"><div class="wheel-cards" id="wheelCards"></div></div>' +
          '<button class="wheel-btn wheel-btn--prev" type="button" aria-label="Previous work">‹</button>' +
          '<button class="wheel-btn wheel-btn--next" type="button" aria-label="Next work">›</button>' +
          '<div class="wheel-meta"><span id="wheelIndex">1 / ' + items.length + '</span><span id="wheelCat">' + items[0].cat + "</span></div>" +
          '<p class="wheel-hint">Scroll or swipe to browse</p>' +
        "</div>" +
      "</div>";

    stageEl = document.getElementById("wheelStage");
    cardsEl = document.getElementById("wheelCards");
    metaIndex = document.getElementById("wheelIndex");
    metaCat = document.getElementById("wheelCat");

    items.forEach(function (it) {
      var card = document.createElement("div");
      card.className = "wheel-card";
      card.innerHTML =
        '<a class="wheel-card__link" href="' + esc(PROFILE_URL) + '" target="_blank" rel="noopener" draggable="false">' +
          '<div class="wheel-card__cover"><img src="' + esc(it.cover) + '" alt="' + esc(it.title) + '" loading="lazy" draggable="false">' +
            '<span class="wheel-card__badge">' + esc(it.cat) + "</span></div>" +
          '<div class="wheel-card__body"><h3 class="wheel-card__title">' + esc(it.title) + "</h3>" +
            '<div class="wheel-card__tags">' + (it.tags || []).slice(0, 3).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" +
          "</div>" +
        "</a>";
      cardsEl.appendChild(card);
    });

    var dots = document.getElementById("workDots");
    if (dots) dots.style.display = "none";
    render();
    bind();
  }

  function bind() {
    var wheel = document.querySelector(".wheel");
    if (!wheel) return;

    var wheelAcc = 0;
    wheel.addEventListener("wheel", function (e) {
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) >= 38) {
        step(wheelAcc > 0 ? 1 : -1);
        wheelAcc = 0;
      }
    }, { passive: false });

    var touchStartX = null;
    wheel.addEventListener("touchstart", function (e) {
      touchStartX = e.touches && e.touches[0] ? e.touches[0].clientX : null;
    }, { passive: true });
    wheel.addEventListener("touchend", function (e) {
      if (touchStartX == null) return;
      var dx = e.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(dx) > 36) step(dx < 0 ? 1 : -1);
    }, { passive: true });

    var dragX = null;
    var justDragged = false;
    wheel.addEventListener("pointerdown", function (e) {
      if (e.target.closest && e.target.closest(".wheel-btn")) return;
      dragX = e.clientX;
    });
    window.addEventListener("pointerup", function (e) {
      if (dragX == null) return;
      var dx = e.clientX - dragX;
      dragX = null;
      justDragged = Math.abs(dx) > 36;
      if (justDragged) step(dx < 0 ? 1 : -1);
    });
    window.addEventListener("pointercancel", function () { dragX = null; });
    document.addEventListener("click", function (e) {
      if (!justDragged) return;
      e.preventDefault();
      e.stopPropagation();
      justDragged = false;
    }, true);

    var prev = wheel.querySelector(".wheel-btn--prev");
    var next = wheel.querySelector(".wheel-btn--next");
    if (prev) prev.addEventListener("click", function () { step(-1); });
    if (next) next.addEventListener("click", function () { step(1); });

    document.addEventListener("keydown", function (e) {
      var work = document.getElementById("work");
      var r = work.getBoundingClientRect();
      if (r.top > window.innerHeight || r.bottom < 0) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    });

    var resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        visual = index;
        velocity = 0;
        render();
      }, 120);
    });
  }

  fetch("works.json").then(function (r) { return r.json(); }).then(build)
    .catch(function () { /* keep existing content if works.json is missing */ });
})();
