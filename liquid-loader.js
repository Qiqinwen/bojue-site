(() => {
  'use strict';

  if (customElements.get('liquid-loader')) return;

  const CYCLE_DURATION = 2100;
  const CYCLE_COUNT = 4;
  const LOOP_DURATION = CYCLE_DURATION * CYCLE_COUNT;
  const FRAME_RATE = 30;
  const FRAME_INTERVAL = 1000 / FRAME_RATE;
  const THEME_TRANSITION = 500;
  const TAU = Math.PI * 2;

  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        --liquid-loader-label-color: currentColor;
        --liquid-loader-label-size: 12px;
        --liquid-loader-gap: 7px;
        display: inline-grid;
        width: 280px;
        max-width: 100%;
        justify-items: center;
        gap: var(--liquid-loader-gap);
        color: inherit;
        contain: layout style;
      }

      .stage {
        position: relative;
        width: 100%;
        aspect-ratio: 2 / 1;
      }

      canvas {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
      }

      .fallback {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 88px;
        height: 48px;
        color: currentColor;
        translate: -50% -50%;
        animation: fallback-orbit ${LOOP_DURATION}ms linear infinite;
      }

      .fallback::before,
      .fallback::after {
        content: "";
        position: absolute;
        top: 2px;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: currentColor;
      }

      .fallback::before { left: 2px; }
      .fallback::after { right: 2px; }

      .fallback-bridge {
        position: absolute;
        top: 15px;
        left: 50%;
        width: 20px;
        height: 18px;
        border-radius: 50%;
        background: currentColor;
        translate: -50% 0;
      }

      :host(.webgl-ready) .fallback { display: none; }

      .label {
        margin: 0;
        color: var(--liquid-loader-label-color, currentColor);
        font-family: "Noto Sans", "Helvetica Neue", Arial, sans-serif;
        font-size: var(--liquid-loader-label-size);
        font-style: normal;
        font-weight: 400;
        line-height: 1.3;
        letter-spacing: 0.06em;
        text-transform: lowercase;
        opacity: 0.38;
        animation: label-breathe ${CYCLE_DURATION / 2}ms cubic-bezier(0.45, 0, 0.55, 1) infinite alternate;
        transition: color ${THEME_TRANSITION}ms cubic-bezier(0.45, 0, 0.55, 1);
      }

      :host([hide-label]) .label { display: none; }

      :host([capture]) .label,
      :host([data-capture]) .label {
        animation: none;
        opacity: var(--liquid-loader-capture-label-opacity, 0.38);
        translate: 0 var(--liquid-loader-capture-label-y, 0px);
      }

      @keyframes label-breathe {
        from { opacity: 0.38; translate: 0 0; }
        to { opacity: 0.82; translate: 0 -1px; }
      }

      @keyframes fallback-orbit {
        to { rotate: 1turn; }
      }

      @media (prefers-reduced-motion: reduce) {
        .fallback,
        .label {
          animation: none;
        }

        .label { opacity: 0.64; }
        .fallback { rotate: -45deg; }
      }
    </style>
    <div class="stage" part="stage" aria-hidden="true">
      <canvas part="canvas"></canvas>
      <span class="fallback" part="fallback"><span class="fallback-bridge"></span></span>
    </div>
    <span class="label" part="label" role="status">loading</span>
  `;

  const vertexSource = `#version 300 es
    precision highp float;
    void main() {
      vec2 point = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
      gl_Position = vec4(point * 2.0 - 1.0, 0.0, 1.0);
    }
  `;

  const fragmentSource = `#version 300 es
    precision highp float;
    uniform vec2 uResolution;
    uniform float uDpr;
    uniform vec4 uBallA;
    uniform vec4 uBallB;
    uniform float uAngle;
    uniform float uPresenceA;
    uniform float uPresenceB;
    uniform float uFusion;
    uniform vec4 uInk;
    out vec4 outColor;

    float smoothMinimum(float a, float b, float smoothing) {
      float h = max(smoothing - abs(a - b), 0.0) / max(smoothing, 0.0001);
      return min(a, b) - h * h * smoothing * 0.25;
    }

    float ellipseDistance(vec2 point, vec2 radii) {
      vec2 safeRadii = max(radii, vec2(0.5));
      float k0 = length(point / safeRadii);
      float k1 = length(point / (safeRadii * safeRadii));
      return k0 * (k0 - 1.0) / max(k1, 0.0001);
    }

    vec2 rotatePoint(vec2 point, float angle) {
      float sine = sin(angle);
      float cosine = cos(angle);
      return mat2(cosine, -sine, sine, cosine) * point;
    }

    void main() {
      vec2 pixel = gl_FragCoord.xy / uDpr;
      pixel.y = uResolution.y - pixel.y;
      float distanceToCell = 10000.0;
      if (uPresenceA > 0.001) {
        distanceToCell = ellipseDistance(
          rotatePoint(pixel - uBallA.xy, -uAngle),
          uBallA.zw
        );
      }
      if (uPresenceB > 0.001) {
        float distanceB = ellipseDistance(
          rotatePoint(pixel - uBallB.xy, -uAngle),
          uBallB.zw
        );
        distanceToCell = uPresenceA > 0.001
          ? smoothMinimum(distanceToCell, distanceB, uFusion)
          : distanceB;
      }
      float antialias = max(fwidth(distanceToCell), 0.65);
      float coverage = 1.0 - smoothstep(-antialias, antialias, distanceToCell);
      float alpha = coverage * uInk.a;
      outColor = vec4(uInk.rgb * alpha, alpha);
    }
  `;

  class LiquidLoader extends HTMLElement {
    static get observedAttributes() {
      return ['capture', 'hide-label', 'label', 'paused'];
    }

    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).append(template.content.cloneNode(true));
      this._stage = this.shadowRoot.querySelector('.stage');
      this._canvas = this.shadowRoot.querySelector('canvas');
      this._fallback = this.shadowRoot.querySelector('.fallback');
      this._label = this.shadowRoot.querySelector('.label');
      this._reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
      this._darkScheme = matchMedia('(prefers-color-scheme: dark)');

      this._connected = false;
      this._intersecting = true;
      this._hasLayout = false;
      this._pageSuspended = false;
      this._frameRequest = 0;
      this._lastDrawAt = -Infinity;
      this._startedAt = performance.now();
      this._pausedPhase = 0;
      this._captureFrame = 0;
      this._captureFrameRate = FRAME_RATE;
      this._manualCapture = false;
      this._cssWidth = 280;
      this._cssHeight = 140;
      this._dpr = 1;

      this._gl = null;
      this._program = null;
      this._uniforms = null;
      this._contextLost = false;

      this._inkCurrent = [0, 0, 0, 1];
      this._inkFrom = this._inkCurrent.slice();
      this._inkTarget = this._inkCurrent.slice();
      this._inkTransitionStartedAt = 0;
      this._inkTransitionActive = false;
      this._colourCanvas = document.createElement('canvas');
      this._colourCanvas.width = 1;
      this._colourCanvas.height = 1;
      this._colourContext = this._colourCanvas.getContext('2d', { willReadFrequently: true });

      this._onFrame = this._onFrame.bind(this);
      this._onVisibilityChange = this._onVisibilityChange.bind(this);
      this._onPageHide = this._onPageHide.bind(this);
      this._onPageShow = this._onPageShow.bind(this);
      this._onMotionPreference = this._onMotionPreference.bind(this);
      this._onThemeChange = this._onThemeChange.bind(this);
      this._onContextLost = this._onContextLost.bind(this);
      this._onContextRestored = this._onContextRestored.bind(this);
    }

    get duration() { return LOOP_DURATION; }
    get frameRate() { return FRAME_RATE; }

    connectedCallback() {
      if (this._connected) return;
      this._connected = true;
      this._syncLabel();
      this._inkCurrent = this._readInk();
      this._inkFrom = this._inkCurrent.slice();
      this._inkTarget = this._inkCurrent.slice();

      this._canvas.addEventListener('webglcontextlost', this._onContextLost);
      this._canvas.addEventListener('webglcontextrestored', this._onContextRestored);
      document.addEventListener('visibilitychange', this._onVisibilityChange);
      window.addEventListener('pagehide', this._onPageHide);
      window.addEventListener('pageshow', this._onPageShow);
      window.addEventListener('themechange', this._onThemeChange);
      this._reduceMotion.addEventListener('change', this._onMotionPreference);
      this._darkScheme.addEventListener('change', this._onThemeChange);

      this._resizeObserver = new ResizeObserver(() => this._resize());
      this._resizeObserver.observe(this._stage);
      this._intersectionObserver = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const wasIntersecting = this._intersecting;
        this._intersecting = entry.isIntersecting;
        if (this._intersecting && !wasIntersecting) {
          this._resize();
          this.restart();
        } else if (!this._intersecting) {
          this._pause();
        }
      }, { rootMargin: '40px' });
      this._intersectionObserver.observe(this);

      this._themeObserver = new MutationObserver(this._onThemeChange);
      this._themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-theme', 'style'],
      });

      this._initialiseWebGL();
      this._resize();
      this.restart();
    }

    disconnectedCallback() {
      if (!this._connected) return;
      this._connected = false;
      this._pause();
      this._resizeObserver?.disconnect();
      this._intersectionObserver?.disconnect();
      this._themeObserver?.disconnect();
      this._resizeObserver = null;
      this._intersectionObserver = null;
      this._themeObserver = null;

      this._canvas.removeEventListener('webglcontextlost', this._onContextLost);
      this._canvas.removeEventListener('webglcontextrestored', this._onContextRestored);
      document.removeEventListener('visibilitychange', this._onVisibilityChange);
      window.removeEventListener('pagehide', this._onPageHide);
      window.removeEventListener('pageshow', this._onPageShow);
      window.removeEventListener('themechange', this._onThemeChange);
      this._reduceMotion.removeEventListener('change', this._onMotionPreference);
      this._darkScheme.removeEventListener('change', this._onThemeChange);
      this._destroyWebGL(true);
    }

    attributeChangedCallback(name) {
      if (name === 'label') this._syncLabel();
      if (!this._connected) return;
      if (name === 'capture') {
        if (this.hasAttribute('capture')) this.setFrame(this._captureFrame, this._captureFrameRate);
        else this.play();
      } else if (name === 'paused') {
        this.hasAttribute('paused') ? this._pause() : this._start();
      }
    }

    restart() {
      this._pausedPhase = 0;
      this._startedAt = performance.now();
      this._lastDrawAt = -Infinity;
      [this._fallback, this._label].forEach((element) => {
        element.getAnimations().forEach((animation) => { animation.currentTime = 0; });
      });
      if (this.hasAttribute('capture') || this._manualCapture) {
        this._captureFrame = 0;
        this._renderCaptureFrame();
      } else {
        this._clearCaptureLabel();
        this._renderPhase(0, performance.now());
        this._start();
      }
    }

    play() {
      if (this.hasAttribute('capture')) {
        this.removeAttribute('capture');
        return;
      }
      this._manualCapture = false;
      this.removeAttribute('data-capture');
      this._clearCaptureLabel();
      this._startedAt = performance.now() - this._pausedPhase * LOOP_DURATION;
      this._start();
    }

    pause() {
      this._pause();
    }

    setFrame(frameNumber, frameRate = FRAME_RATE) {
      this._manualCapture = !this.hasAttribute('capture');
      if (this._manualCapture) this.setAttribute('data-capture', '');
      this._captureFrame = Math.max(0, Number(frameNumber) || 0);
      this._captureFrameRate = Math.max(1, Number(frameRate) || FRAME_RATE);
      this._pause();
      this._renderCaptureFrame();
    }

    sample(phase) {
      return this._sampleMotion(phase, false);
    }

    _syncLabel() {
      if (!this._label) return;
      this._label.textContent = this.getAttribute('label') || 'loading';
    }

    _compile(type, source) {
      const shader = this._gl.createShader(type);
      this._gl.shaderSource(shader, source);
      this._gl.compileShader(shader);
      if (!this._gl.getShaderParameter(shader, this._gl.COMPILE_STATUS)) {
        console.warn('Liquid loader shader:', this._gl.getShaderInfoLog(shader));
        this._gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    _initialiseWebGL() {
      if (!this._connected || this._contextLost) return false;
      this._destroyWebGL();
      this._gl = this._canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        powerPreference: 'low-power',
      });
      if (!this._gl) return false;

      const vertex = this._compile(this._gl.VERTEX_SHADER, vertexSource);
      const fragment = this._compile(this._gl.FRAGMENT_SHADER, fragmentSource);
      if (!vertex || !fragment) {
        if (vertex) this._gl.deleteShader(vertex);
        if (fragment) this._gl.deleteShader(fragment);
        return false;
      }

      const program = this._gl.createProgram();
      this._gl.attachShader(program, vertex);
      this._gl.attachShader(program, fragment);
      this._gl.linkProgram(program);
      this._gl.deleteShader(vertex);
      this._gl.deleteShader(fragment);
      if (!this._gl.getProgramParameter(program, this._gl.LINK_STATUS)) {
        console.warn('Liquid loader program:', this._gl.getProgramInfoLog(program));
        this._gl.deleteProgram(program);
        return false;
      }

      this._program = program;
      this._uniforms = {
        resolution: this._gl.getUniformLocation(program, 'uResolution'),
        dpr: this._gl.getUniformLocation(program, 'uDpr'),
        ballA: this._gl.getUniformLocation(program, 'uBallA'),
        ballB: this._gl.getUniformLocation(program, 'uBallB'),
        angle: this._gl.getUniformLocation(program, 'uAngle'),
        presenceA: this._gl.getUniformLocation(program, 'uPresenceA'),
        presenceB: this._gl.getUniformLocation(program, 'uPresenceB'),
        fusion: this._gl.getUniformLocation(program, 'uFusion'),
        ink: this._gl.getUniformLocation(program, 'uInk'),
      };
      this.classList.add('webgl-ready');
      return true;
    }

    _destroyWebGL(loseContext = false) {
      if (this._gl && this._program && !this._contextLost) {
        this._gl.deleteProgram(this._program);
      }
      if (loseContext && this._gl && !this._contextLost) {
        this._gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      this._program = null;
      this._uniforms = null;
      this._gl = null;
      this.classList.remove('webgl-ready');
    }

    _sampleMotion(phase, reducedMotion) {
      const time = ((phase % 1) + 1) % 1;
      const cyclePosition = time * CYCLE_COUNT;
      const cycleIndex = Math.min(CYCLE_COUNT - 1, Math.floor(cyclePosition));
      const cycleTime = cyclePosition - cycleIndex;
      const pairLife = 0.5 - 0.5 * Math.cos(TAU * cycleTime);
      const rotation = TAU * time;
      const baseRadius = Math.min(this._cssWidth, this._cssHeight) * 0.255;
      const equalRadius = baseRadius / Math.sqrt(2);
      const victimRadius = equalRadius * pairLife;
      const receiverRadius = Math.sqrt(Math.max(
        equalRadius * equalRadius,
        baseRadius * baseRadius - victimRadius * victimRadius,
      ));
      const leftIsVictim = cycleIndex % 2 === 0;
      const leftRadius = leftIsVictim ? victimRadius : receiverRadius;
      const rightRadius = leftIsVictim ? receiverRadius : victimRadius;
      const separation = baseRadius * (reducedMotion ? 1.28 : 1.78) * pairLife;
      const axisX = Math.cos(rotation);
      const axisY = Math.sin(rotation);
      const carrierX = this._cssWidth * 0.5
        + Math.cos(rotation + 0.32) * baseRadius * 0.055;
      const carrierY = this._cssHeight * 0.5
        + Math.sin(rotation - 0.28) * baseRadius * 0.04;
      const halfSeparation = separation * 0.5;
      const bridge = Math.sin(Math.PI * pairLife);
      const stretchX = 1 + bridge * 0.11;
      const stretchY = 1 - bridge * 0.055;

      return {
        ballA: {
          x: carrierX - axisX * halfSeparation,
          y: carrierY - axisY * halfSeparation,
          radiusX: Math.max(0.5, leftRadius * stretchX),
          radiusY: Math.max(0.5, leftRadius * stretchY),
        },
        ballB: {
          x: carrierX + axisX * halfSeparation,
          y: carrierY + axisY * halfSeparation,
          radiusX: Math.max(0.5, rightRadius * stretchX),
          radiusY: Math.max(0.5, rightRadius * stretchY),
        },
        angle: rotation,
        presenceA: leftRadius > 0.6 ? 1 : 0,
        presenceB: rightRadius > 0.6 ? 1 : 0,
        fusion: baseRadius * (0.34 + bridge * 0.16),
        phase: time,
        cycleIndex,
        cycleTime,
        pairLife,
      };
    }

    _resize() {
      const rect = this._stage.getBoundingClientRect();
      const hadLayout = this._hasLayout;
      this._hasLayout = rect.width > 0.5 && rect.height > 0.5;
      if (!this._hasLayout) {
        this._pause();
        return;
      }

      this._cssWidth = Math.max(1, rect.width);
      this._cssHeight = Math.max(1, rect.height);
      this._dpr = Math.min(devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(this._cssWidth * this._dpr));
      const height = Math.max(1, Math.round(this._cssHeight * this._dpr));
      if (this._canvas.width !== width || this._canvas.height !== height) {
        this._canvas.width = width;
        this._canvas.height = height;
      }
      if (this._gl) this._gl.viewport(0, 0, width, height);

      if (!hadLayout && this._connected) {
        this.restart();
      } else if (this.hasAttribute('capture') || this._manualCapture) {
        this._renderCaptureFrame();
      } else {
        this._renderPhase(this._pausedPhase, performance.now());
      }
    }

    _renderPhase(phase, now) {
      if (!this._gl || !this._program || !this._hasLayout) return;
      const reduced = this._reduceMotion.matches;
      const motion = reduced
        ? this._sampleMotion(0.125, true)
        : this._sampleMotion(phase, false);
      const ink = this._inkAt(now);

      this._gl.useProgram(this._program);
      this._gl.viewport(0, 0, this._canvas.width, this._canvas.height);
      this._gl.clearColor(0, 0, 0, 0);
      this._gl.clear(this._gl.COLOR_BUFFER_BIT);
      this._gl.uniform2f(this._uniforms.resolution, this._cssWidth, this._cssHeight);
      this._gl.uniform1f(this._uniforms.dpr, this._dpr);
      this._gl.uniform4f(
        this._uniforms.ballA,
        motion.ballA.x,
        motion.ballA.y,
        motion.ballA.radiusX,
        motion.ballA.radiusY,
      );
      this._gl.uniform4f(
        this._uniforms.ballB,
        motion.ballB.x,
        motion.ballB.y,
        motion.ballB.radiusX,
        motion.ballB.radiusY,
      );
      this._gl.uniform1f(this._uniforms.angle, motion.angle);
      this._gl.uniform1f(this._uniforms.presenceA, motion.presenceA);
      this._gl.uniform1f(this._uniforms.presenceB, motion.presenceB);
      this._gl.uniform1f(this._uniforms.fusion, motion.fusion);
      this._gl.uniform4f(this._uniforms.ink, ink[0], ink[1], ink[2], ink[3]);
      this._gl.drawArrays(this._gl.TRIANGLES, 0, 3);
      this._pausedPhase = motion.phase;
      this.dataset.phase = motion.phase.toFixed(4);
    }

    _onFrame(now) {
      if (!this._shouldPlay()) {
        this._frameRequest = 0;
        return;
      }
      if (now - this._lastDrawAt >= FRAME_INTERVAL) {
        this._lastDrawAt = now;
        this._renderPhase((now - this._startedAt) / LOOP_DURATION, now);
      }
      this._frameRequest = requestAnimationFrame(this._onFrame);
    }

    _shouldPlay() {
      return this._connected
        && !document.hidden
        && !this._pageSuspended
        && this._intersecting
        && this._hasLayout
        && !this._reduceMotion.matches
        && !this.hasAttribute('capture')
        && !this.hasAttribute('paused')
        && !this._manualCapture
        && Boolean(this._gl && this._program);
    }

    _start() {
      cancelAnimationFrame(this._frameRequest);
      this._frameRequest = 0;
      if (!this._shouldPlay()) {
        this._renderPhase(this._pausedPhase, performance.now());
        return;
      }
      this._startedAt = performance.now() - this._pausedPhase * LOOP_DURATION;
      this._frameRequest = requestAnimationFrame(this._onFrame);
    }

    _pause() {
      if (this._frameRequest) {
        this._pausedPhase = ((performance.now() - this._startedAt) / LOOP_DURATION % 1 + 1) % 1;
      }
      cancelAnimationFrame(this._frameRequest);
      this._frameRequest = 0;
    }

    _renderCaptureFrame() {
      const seconds = this._captureFrame / this._captureFrameRate;
      const phase = seconds * 1000 / LOOP_DURATION;
      const cycleBreath = 0.5 - 0.5 * Math.cos(TAU * seconds * 1000 / CYCLE_DURATION);
      this.style.setProperty(
        '--liquid-loader-capture-label-opacity',
        (0.38 + cycleBreath * 0.44).toFixed(3),
      );
      this.style.setProperty(
        '--liquid-loader-capture-label-y',
        `${(-cycleBreath).toFixed(3)}px`,
      );
      this._renderPhase(phase, performance.now());
      this.dataset.frame = String(this._captureFrame);
    }

    _clearCaptureLabel() {
      this.style.removeProperty('--liquid-loader-capture-label-opacity');
      this.style.removeProperty('--liquid-loader-capture-label-y');
      delete this.dataset.frame;
    }

    _readInk() {
      const value = getComputedStyle(this).color;
      const match = value.match(/rgba?\(([^)]+)\)/i);
      if (match) {
        const values = match[1].match(/[\d.]+/g)?.map(Number) || [];
        if (values.length >= 3) {
          return [
            values[0] / 255,
            values[1] / 255,
            values[2] / 255,
            values.length > 3 ? values[3] : 1,
          ];
        }
      }

      if (this._colourContext) {
        this._colourContext.clearRect(0, 0, 1, 1);
        this._colourContext.fillStyle = '#000';
        this._colourContext.fillStyle = value;
        this._colourContext.fillRect(0, 0, 1, 1);
        const pixel = this._colourContext.getImageData(0, 0, 1, 1).data;
        return [pixel[0] / 255, pixel[1] / 255, pixel[2] / 255, pixel[3] / 255];
      }
      return [0, 0, 0, 1];
    }

    _inkAt(now) {
      if (!this._inkTransitionActive) return this._inkCurrent;
      const progress = Math.min(1, Math.max(0, (now - this._inkTransitionStartedAt) / THEME_TRANSITION));
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * progress);
      this._inkCurrent = this._inkFrom.map((from, index) => (
        from + (this._inkTarget[index] - from) * eased
      ));
      if (progress >= 1) {
        this._inkCurrent = this._inkTarget.slice();
        this._inkTransitionActive = false;
      }
      return this._inkCurrent;
    }

    _onThemeChange() {
      if (!this._connected) return;
      const now = performance.now();
      const from = this._inkAt(now).slice();
      const target = this._readInk();
      const changed = target.some((value, index) => Math.abs(value - from[index]) > 0.001);
      if (!changed) {
        this._renderPhase(this._pausedPhase, now);
        return;
      }
      if (this._reduceMotion.matches || this.hasAttribute('capture') || this._manualCapture) {
        this._inkCurrent = target;
        this._inkTarget = target.slice();
        this._inkTransitionActive = false;
      } else {
        this._inkFrom = from;
        this._inkTarget = target;
        this._inkTransitionStartedAt = now;
        this._inkTransitionActive = true;
      }
      this._renderPhase(this._pausedPhase, now);
      this._start();
    }

    _onVisibilityChange() {
      if (document.hidden) this._pause();
      else this._start();
    }

    _onPageHide() {
      this._pageSuspended = true;
      this._pause();
    }

    _onPageShow() {
      this._pageSuspended = false;
      this._resize();
      this._start();
    }

    _onMotionPreference() {
      this._pause();
      this._renderPhase(this._pausedPhase, performance.now());
      this._start();
    }

    _onContextLost(event) {
      event.preventDefault();
      this._contextLost = true;
      this.classList.remove('webgl-ready');
      this._pause();
      this._program = null;
      this._uniforms = null;
      this._gl = null;
    }

    _onContextRestored() {
      this._contextLost = false;
      this._initialiseWebGL();
      this._resize();
      this._start();
    }
  }

  customElements.define('liquid-loader', LiquidLoader);
})();
