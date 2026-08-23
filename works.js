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

  function initDiag() {
    if (location.search.indexOf("diag=1") < 0) return;
    if (document.getElementById("diag")) return;
    window.__diagErrors = window.__diagErrors || [];
    window.addEventListener("error", function (e) { window.__diagErrors.push(e.message); renderDiag(); });
    var panel = document.createElement("div");
    panel.id = "diag";
    panel.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:2147483647;background:#111;color:#0f0;font:11px/1.5 monospace;padding:10px;max-width:92vw;white-space:pre-wrap;word-break:break-all;";
    document.body.appendChild(panel);
    function renderDiag() {
      var work = document.getElementById("work");
      panel.textContent =
        "UA: " + navigator.userAgent.slice(0, 90) + "\n" +
        "innerH: " + window.innerHeight + "\n" +
        "scrollH: " + document.documentElement.scrollHeight + "\n" +
        "workH: " + (work ? work.offsetHeight : "NA") + "\n" +
        "wheelCards: " + document.querySelectorAll(".wheel-card").length + "\n" +
        "css: " + Array.prototype.map.call(document.querySelectorAll('link[rel="stylesheet"]'), function (l) { return l.getAttribute("href"); }).join(",") + "\n" +
        "errors: " + (window.__diagErrors.length ? window.__diagErrors.join(" ; ") : "none");
    }
    window.renderDiag = renderDiag;
    renderDiag();
    setInterval(renderDiag, 1500);
  }

  function build(works) {
    var workEl = document.getElementById("work");
    if (!workEl || !works) return;
    PROFILE_URL = works.profileUrl || "";
    items = [];
    (works.dramas || []).forEach(function (d) { items.push({ id: d.id, title: d.title, cover: d.cover, tags: d.tags, cat: "Radio Drama", playUrl: d.playUrl }); });
    (works.records || []).forEach(function (r) { items.push({ id: r.id, title: r.title, cover: r.cover, tags: r.tags, cat: "Record", playUrl: r.playUrl }); });
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

    renderCards();
    var dots = document.getElementById("workDots");
    if (dots) dots.style.display = "none";
    render();
    bind();
    initDiag();
    syncRemote();
  }

  function renderCards() {
    if (!cardsEl) return;
    cardsEl.innerHTML = "";
    items.forEach(function (it) {
      var card = document.createElement("div");
      card.className = "wheel-card";
      card.innerHTML =
        '<a class="wheel-card__link" href="' + esc(it.playUrl || PROFILE_URL) + '" target="_blank" rel="noopener" draggable="false">' +
          '<div class="wheel-card__cover"><img src="' + esc(it.cover) + '" alt="' + esc(it.title) + '" loading="lazy" draggable="false">' +
            '<span class="wheel-card__badge">' + esc(it.cat) + "</span></div>" +
          '<div class="wheel-card__body"><h3 class="wheel-card__title">' + esc(it.title) + "</h3>" +
            '<div class="wheel-card__tags">' + (it.tags || []).slice(0, 3).map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" +
          "</div>" +
        "</a>";
      cardsEl.appendChild(card);
    });
  }

  function resizeRemote(url, size) {
    return url + "?x-oss-process=image/resize,m_mfit,h_" + size + ",w_" + size + ",limit_0/crop,w_" + size + ",h_" + size + ",g_center";
  }

  function syncRemote() {
    // Live sync: Manbo's public profile API allows cross-origin reads, so new
    // dramas/records published on the account appear here automatically.
    fetch("https://manbo.kilaaudio.com/Tg/personalH5?uid=3684994445375", { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("status " + r.status); return r.json(); })
      .then(function (j) {
        var d = (j && j.data) || {};
        var uw = d.userWorkResp || {};
        var byId = {};
        items.forEach(function (it) { byId[it.id] = it; });
        function makeRemoteItem(it, cat) {
          var r = it.radioDramaResp;
          var id = r.radioDramaIdStr;
          if (byId[id]) return byId[id];
          var src = resizeRemote(r.coverPic, 400);
          return {
            id: id,
            title: r.title,
            cover: src,
            srcCover: src,
            tags: (r.categoryLabels || []).map(function (l) { return l.name; }).slice(0, 4),
            studio: r.ownerResp ? r.ownerResp.nickname : "",
            playUrl: "https://manbo.hongdoulive.com/Activecard/radioplay?id=" + id,
            cat: cat
          };
        }
        var apiDramas = ((uw.radioDramaWorks && uw.radioDramaWorks.radioDramas) || []).map(function (it) { return makeRemoteItem(it, "Radio Drama"); });
        var apiRecords = ((uw.recordWorks && uw.recordWorks.records) || []).map(function (it) { return makeRemoteItem(it, "Record"); });
        var merged = apiDramas.concat(apiRecords);
        var apiIds = {};
        merged.forEach(function (it) { apiIds[it.id] = true; });
        items.forEach(function (it) { if (!apiIds[it.id]) merged.push(it); });
        var same = merged.length === items.length && merged.every(function (m, i) { return m === items[i]; });
        if (same) return;
        items = merged;
        index = clamp(index, 0, items.length - 1);
        visual = index;
        velocity = 0;
        renderCards();
        render();
      })
      .catch(function () { /* Manbo API unreachable — keep the local snapshot */ });
  }

  function bind() {
    var wheel = document.querySelector(".wheel");
    if (!wheel) return;

    // Robust jump: any "#work" link scrolls via JS (WKWebView anchor nav can fail).
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href="#work"]') : null;
      if (!a) return;
      e.preventDefault();
      var w = document.getElementById("work");
      if (w) {
        try { w.scrollIntoView({ behavior: "smooth", block: "start" }); }
        catch (err) { w.scrollIntoView(); }
      }
    }, true);

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
    .catch(function (e) {
      var workEl = document.getElementById("work");
      if (workEl) workEl.innerHTML = '<div class="works-page"><p class="works-about">Works failed to load (works.json missing?)</p></div>';
      initDiag();
    });
})();
