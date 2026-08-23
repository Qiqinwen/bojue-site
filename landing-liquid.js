(() => {
  'use strict';

  const canvas = document.getElementById('landingLiquid');
  const effectsCanvas = document.getElementById('landingPopEffects');
  const bio = document.getElementById('landingBio');
  if (!canvas || !effectsCanvas || !bio) {
    window.dispatchEvent(new CustomEvent('landing-liquid-ready'));
    return;
  }

  const MAX_SHAPES = 32;
  const STROKE = 1;
  const FUSION = 60;
  const INTRO_DURATION = 900;
  const INTRO_STAGGER = 170;
  const POP_RUPTURE_DELAY = 24;
  const POP_MEMBRANE_DURATION = 170;
  const POP_SPRING_DURATION = 760;
  const REFERENCE_WIDTH = 1710;
  const REFERENCE_HEIGHT = 978;
  const NOT_FOUND_REFERENCE_WIDTH = 2048;
  const NOT_FOUND_REFERENCE_HEIGHT = 1175;
  const NOT_FOUND_FUSION = 30;
  const AMBIENT_FRAME_INTERVAL = 1000 / 30;
  const THEME_DURATION = 500;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isNotFoundPage = document.body.classList.contains('not-found');

  // These are authored compositions rather than regenerated clusters. Their geometry
  // is expressed in the 1710 x 978 reference viewport used to capture the originals.
  const PRESETS = [
    {
      name: 'replica-01',
      circles: [
        [147.4, 527.6, 261.7],
        [389.3, 664.8, 139.4],
        [463.0, 460.0, 170.3],
        [685.4, 475.0, 153.3],
        [879.6, 595.3, 222.4],
        [966.7, 316.9, 145.3],
        [1143.3, 273.3, 127.5],
        [1383.7, 311.5, 216.7],
        [1577.9, 462.5, 185.5],
      ],
    },
    {
      name: 'replica-02',
      circles: [
        [130.0, 390.0, 245.0],
        [390.0, 605.0, 215.0],
        [545.0, 390.0, 195.0],
        [837.3, 540.3, 197.9],
        [1176.1, 418.2, 286.7],
        [1580.0, 20.0, 330.0],
        [1353.6, 533.3, 190.3],
      ],
    },
    {
      name: 'replica-03',
      circles: [
        [215.0, 800.0, 269.0],
        [257.6, 353.2, 171.3],
        [433.0, 650.4, 180.0],
        [610.6, 362.2, 149.8],
        [838.0, 541.2, 199.0],
        [1092.5, 752.8, 299.8],
        [1316.0, 287.7, 469.4],
      ],
    },
  ];
  // The 404 uses the same renderer and interactions as the landing, but its authored
  // composition hugs all four viewport edges to leave a quiet, readable center.
  const NOT_FOUND_PRESET = {
    name: 'not-found-edge-frame',
    circles: [
      // [center x, center y, radius]. Every primitive is a true circle; the
      // deliberately uneven radii, crop and density create the organic frame.
      [-18, 298, 142],
      [300, 42, 98],
      [448, 36, 156],
      [590, 24, 97],
      [925, -60, 441],
      [1320, -72, 396],
      [1500, 24, 91],
      [1592, 8, 116],
      [1724, 28, 120],
      [1928, 112, 365],
      [2110, 390, 235],
      [2074, 612, 192],
      [2025, 825, 227],
      [2072, 1080, 272],
      [1602, 1100, 126],
      [1360, 1080, 268],
      [1136, 1090, 129],
      [805, 1138, 384],
      [402, 1282, 305],
      [126, 1224, 173],
      [-84, 1092, 213],
      [-78, 742, 370],
      [-24, 520, 128],
      [-28, 390, 135],
    ],
  };
  const selectedPresetIndex = isNotFoundPage ? -1 : Math.floor(Math.random() * PRESETS.length);
  const selectedPreset = isNotFoundPage ? NOT_FOUND_PRESET : PRESETS[selectedPresetIndex];
  const MOBILE_BOUNDARY_X = [
    { top: 0.08, bottom: 0.92 },
    { top: 0.72, bottom: 0.28 },
    { top: 0.20, bottom: 0.75 },
  ];

  const PALETTES = isNotFoundPage ? {
    light: { background: [1, 1, 1], ink: [0, 0, 0] },
    dark: { background: [0, 0, 0], ink: [1, 1, 1] },
  } : {
    light: {
      background: [250 / 255, 249 / 255, 247 / 255],
      ink: [43 / 255, 39 / 255, 34 / 255],
    },
    dark: {
      background: [24 / 255, 24 / 255, 24 / 255],
      ink: [242 / 255, 237 / 255, 230 / 255],
    },
  };

  let nextShapeId = 1;
  let introStartedAt = performance.now();
  let initialIds = new Set();
  let gesture = null;
  let lastTouchTap = null;
  let activePops = [];
  let activeClickSprings = [];
  let frameRequest = 0;
  let lastFrameAt = performance.now();
  let lastAmbientDrawAt = 0;
  let lastDebugPublishedAt = 0;
  let pendingSmallCommit = 0;
  let heroNearViewport = true;

  const initialTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const themeState = {
    from: PALETTES[initialTheme],
    to: PALETTES[initialTheme],
    name: initialTheme,
    startedAt: -Infinity,
  };

  const size = { width: 1, height: 1, dpr: 1 };
  const state = { shapes: [], preview: null };
  const effects = effectsCanvas.getContext('2d');

  const vertexShader = [
    '#version 300 es',
    'precision highp float;',
    'void main() {',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}',
  ].join('\n');

  const fragmentShader = [
    '#version 300 es',
    'precision highp float;',
    'out vec4 outColor;',
    'uniform vec2 uResolution;',
    'uniform float uDpr;',
    'uniform float uStroke;',
    'uniform float uFusion;',
    'uniform vec3 uBackground;',
    'uniform vec3 uInk;',
    'uniform int uCount;',
    'uniform vec4 uShapeA[' + MAX_SHAPES + '];',
    'uniform vec4 uShapeB[' + MAX_SHAPES + '];',
    'uniform float uPopAngle[' + MAX_SHAPES + '];',
    'float smoothMinimum(float a, float b, float k) {',
    '  float h = max(k - abs(a - b), 0.0) / max(k, 0.0001);',
    '  return min(a, b) - h * h * k * 0.25;',
    '}',
    'float sdEllipse(vec2 p, vec2 halfSize) {',
    '  vec2 safeSize = max(halfSize, vec2(0.001));',
    '  return (length(p / safeSize) - 1.0) * min(safeSize.x, safeSize.y);',
    '}',
    'void main() {',
    '  vec2 screen = vec2(gl_FragCoord.x / uDpr, uResolution.y - gl_FragCoord.y / uDpr);',
    '  vec2 world = screen - uResolution * 0.5;',
    '  float distanceToInk = 100000.0;',
    '  float halfStroke = uStroke * 0.5;',
    '  for (int i = 0; i < ' + MAX_SHAPES + '; i++) {',
    '    if (i >= uCount) break;',
    '    vec4 shapeA = uShapeA[i];',
    '    vec4 shapeB = uShapeB[i];',
    '    vec2 local = world - shapeA.xy;',
    '    vec2 halfSize = max(shapeA.zw, vec2(0.001));',
    '    float markDistance = abs(sdEllipse(local, halfSize)) - halfStroke;',
    '    if (shapeB.y > 0.0001) {',
    '      float rupture = clamp(shapeB.y, 0.0, 1.0);',
    '      float radius = min(halfSize.x, halfSize.y);',
    '      float maximumRadius = max(halfSize.x, halfSize.y);',
    '      vec2 direction = vec2(cos(uPopAngle[i]), sin(uPopAngle[i]));',
    '      vec2 tangent = vec2(-direction.y, direction.x);',
    '      float edgeDistance = min(',
    '        halfSize.x / max(abs(direction.x), 0.001),',
    '        halfSize.y / max(abs(direction.y), 0.001)',
    '      );',
    '      float biteRadius = mix(radius * 0.055, maximumRadius * 1.75, rupture);',
    '      vec2 biteCenter = direction * edgeDistance * mix(1.08, 0.30, rupture);',
    '      float primaryBite = length(local - biteCenter) - biteRadius;',
    '      float upperBite = length(local - (biteCenter - direction * radius * 0.13 + tangent * radius * 0.18)) - biteRadius * 0.72;',
    '      float lowerBite = length(local - (biteCenter - direction * radius * 0.20 - tangent * radius * 0.22)) - biteRadius * 0.60;',
    '      float biteDistance = smoothMinimum(primaryBite, upperBite, radius * 0.075);',
    '      biteDistance = smoothMinimum(biteDistance, lowerBite, radius * 0.06);',
    '      markDistance = max(markDistance, -biteDistance);',
    '    }',
    '    if (i == 0) distanceToInk = markDistance;',
    '    else distanceToInk = smoothMinimum(distanceToInk, markDistance, uFusion);',
    '  }',
    '  float antialias = max(fwidth(distanceToInk), 0.72);',
    '  float ink = uCount > 0 ? 1.0 - smoothstep(-antialias, antialias, distanceToInk) : 0.0;',
    '  outColor = vec4(mix(uBackground, uInk, ink), 1.0);',
    '}',
  ].join('\n');

  let gl = null;
  let program = null;
  let fallback = null;
  let uniforms = null;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function easeInOutCubic(value) {
    const t = clamp(value, 0, 1);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function mixColor(from, to, amount) {
    return from.map((value, index) => value + (to[index] - value) * amount);
  }

  function paletteAt(now = performance.now()) {
    const amount = reduceMotion.matches
      ? 1
      : easeInOutCubic((now - themeState.startedAt) / THEME_DURATION);
    return {
      background: mixColor(themeState.from.background, themeState.to.background, amount),
      ink: mixColor(themeState.from.ink, themeState.to.ink, amount),
    };
  }

  function themeTransitionActive(now) {
    return !reduceMotion.matches && now < themeState.startedAt + THEME_DURATION;
  }

  function colorCss(color) {
    return 'rgb(' + color.map((value) => Math.round(value * 255)).join(',') + ')';
  }

  function transitionTheme(theme) {
    const nextName = theme === 'dark' ? 'dark' : 'light';
    const now = performance.now();
    const current = paletteAt(now);
    themeState.from = current;
    themeState.to = PALETTES[nextName];
    themeState.name = nextName;
    themeState.startedAt = reduceMotion.matches ? -Infinity : now;
    draw(now);
    scheduleFrame();
  }

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function initWebGL() {
    gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) return false;
    const vertex = compileShader(gl.VERTEX_SHADER, vertexShader);
    const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentShader);
    if (!vertex || !fragment) return false;
    program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return false;
    }
    uniforms = {
      resolution: gl.getUniformLocation(program, 'uResolution'),
      dpr: gl.getUniformLocation(program, 'uDpr'),
      stroke: gl.getUniformLocation(program, 'uStroke'),
      fusion: gl.getUniformLocation(program, 'uFusion'),
      background: gl.getUniformLocation(program, 'uBackground'),
      ink: gl.getUniformLocation(program, 'uInk'),
      count: gl.getUniformLocation(program, 'uCount'),
      shapeA: gl.getUniformLocation(program, 'uShapeA[0]'),
      shapeB: gl.getUniformLocation(program, 'uShapeB[0]'),
      popAngle: gl.getUniformLocation(program, 'uPopAngle[0]'),
    };
    return true;
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left - rect.width * 0.5,
      y: clientY - rect.top - rect.height * 0.5,
    };
  }

  function worldToScreen(x, y) {
    return { x: size.width * 0.5 + x, y: size.height * 0.5 + y };
  }

  function getPresetLayout() {
    if (isNotFoundPage) {
      return {
        mode: 'not-found-edge-frame',
        mobile: size.width <= 760,
        scale: Math.max(size.width / NOT_FOUND_REFERENCE_WIDTH, size.height / NOT_FOUND_REFERENCE_HEIGHT),
        scaleX: size.width / NOT_FOUND_REFERENCE_WIDTH,
        scaleY: size.height / NOT_FOUND_REFERENCE_HEIGHT,
        verticalInset: 0,
        renderedWidth: size.width,
        renderedHeight: size.height,
        offsetX: 0,
        offsetY: 0,
      };
    }
    const mobile = size.width <= 760;
    if (mobile) {
      const verticalInset = clamp(size.height * 0.07, 36, 68);
      const scale = Math.max(0.001, Math.min(
        size.width / REFERENCE_HEIGHT,
        Math.max(1, size.height - verticalInset * 2) / REFERENCE_WIDTH,
      ));
      const renderedWidth = REFERENCE_HEIGHT * scale;
      const renderedHeight = REFERENCE_WIDTH * scale;
      return {
        mode: 'portrait-clockwise',
        mobile: true,
        scale,
        verticalInset,
        renderedWidth,
        renderedHeight,
        offsetX: (size.width - renderedWidth) * 0.5,
        offsetY: (size.height - renderedHeight) * 0.5,
      };
    }

    const scale = Math.max(
      size.width / REFERENCE_WIDTH,
      size.height / REFERENCE_HEIGHT,
    );
    const renderedWidth = REFERENCE_WIDTH * scale;
    const renderedHeight = REFERENCE_HEIGHT * scale;
    return {
      mode: 'landscape-cover',
      mobile: false,
      scale,
      verticalInset: 0,
      renderedWidth,
      renderedHeight,
      offsetX: (size.width - renderedWidth) * 0.5,
      offsetY: (size.height - renderedHeight) * 0.5,
    };
  }

  function presetCircleToWorld(circle, layout, index) {
    const referenceX = circle[0];
    const referenceY = circle[1];
    if (isNotFoundPage) {
      let screenX = referenceX * layout.scaleX;
      let screenY = referenceY * layout.scaleY;
      // Positions follow the viewport axes, while a single uniform radius scale keeps
      // every shape mathematically circular at every aspect ratio.
      const radiusScale = layout.mobile
        ? layout.scaleX * 1.48
        : Math.sqrt(layout.scaleX * layout.scaleY);
      const radius = circle[2] * radiusScale;
      if (layout.mobile) {
        if (referenceX < 0) screenX = -radius * 0.25;
        else if (referenceX > NOT_FOUND_REFERENCE_WIDTH) screenX = size.width + radius * 0.25;
        if (referenceY < 0) screenY = -radius * 0.25;
        else if (referenceY > NOT_FOUND_REFERENCE_HEIGHT) screenY = size.height + radius * 0.25;
      }
      return {
        x: screenX - size.width * 0.5,
        y: screenY - size.height * 0.5,
        radius,
        radiusX: radius,
        radiusY: radius,
      };
    }
    let screenX = layout.mobile
      ? layout.offsetX + (REFERENCE_HEIGHT - referenceY) * layout.scale
      : layout.offsetX + referenceX * layout.scale;
    let screenY = layout.mobile
      ? layout.offsetY + referenceX * layout.scale
      : layout.offsetY + referenceY * layout.scale;
    let radius = circle[2] * layout.scale;

    // On phones, the composition should feel like it continues beyond the glass.
    // Enlarge the first/last authored rings and pin their centers just outside the
    // vertical bounds; the intervening rings retain the rotated replica geometry.
    if (layout.mobile) {
      const lastIndex = selectedPreset.circles.length - 1;
      const anchors = MOBILE_BOUNDARY_X[selectedPresetIndex];
      const boundaryRadius = size.width * 0.78;
      if (index === 0) {
        radius = Math.max(radius, boundaryRadius);
        screenX = size.width * anchors.top;
        screenY = -radius * 0.12;
      } else if (index === lastIndex) {
        radius = Math.max(radius, boundaryRadius);
        screenX = size.width * anchors.bottom;
        screenY = size.height + radius * 0.12;
      }
    }
    return {
      x: screenX - size.width * 0.5,
      y: screenY - size.height * 0.5,
      radius,
    };
  }

  function getInitialBounds() {
    const layout = getPresetLayout();
    return {
      left: layout.offsetX,
      right: layout.offsetX + layout.renderedWidth,
      top: layout.offsetY,
      bottom: layout.offsetY + layout.renderedHeight,
      mode: layout.mode,
      scale: layout.scale,
      verticalInset: layout.verticalInset,
    };
  }

  function driftParameters(index) {
    const seed = (selectedPresetIndex + 1) * 101 + (index + 1) * 47;
    return {
      amplitudeX: 4 + (seed % 5),
      amplitudeY: 4 + ((seed * 3 + 2) % 5),
      periodX: 20000 + ((seed * 137) % 12001),
      periodY: 20000 + ((seed * 211 + 1703) % 12001),
      phaseX: ((seed * 29) % 360) * Math.PI / 180,
      phaseY: ((seed * 43 + 71) % 360) * Math.PI / 180,
    };
  }

  function layoutInitialShapes() {
    const layout = getPresetLayout();
    for (const shape of state.shapes) {
      if (!shape.starter || !shape.referenceCircle) continue;
      const placed = presetCircleToWorld(shape.referenceCircle, layout, shape.introIndex);
      shape.x = placed.x;
      shape.y = placed.y;
      shape.radius = placed.radius;
      shape.radiusX = placed.radiusX || placed.radius;
      shape.radiusY = placed.radiusY || placed.radius;
    }
  }

  function generateInitialCircles() {
    const layout = getPresetLayout();
    state.shapes = selectedPreset.circles.map((circle, index) => {
      const placed = presetCircleToWorld(circle, layout, index);
      return {
        id: nextShapeId++,
        x: placed.x,
        y: placed.y,
        radius: placed.radius,
        radiusX: placed.radiusX || placed.radius,
        radiusY: placed.radiusY || placed.radius,
        introIndex: index,
        starter: true,
        referenceCircle: circle.slice(),
        drift: driftParameters(index),
      };
    });
    initialIds = new Set(state.shapes.map((shape) => shape.id));
    introStartedAt = reduceMotion.matches ? -Infinity : performance.now();
    publishDebugSnapshot();
  }

  function introEndsAt() {
    const duration = isNotFoundPage ? 700 : INTRO_DURATION;
    const stagger = isNotFoundPage ? 55 : INTRO_STAGGER;
    return introStartedAt + duration + stagger * Math.max(0, selectedPreset.circles.length - 1);
  }

  function driftOffset(shape, now) {
    if (!shape.starter || !initialIds.has(shape.id) || reduceMotion.matches || !shape.drift) {
      return { x: 0, y: 0 };
    }
    const elapsed = now - introEndsAt();
    if (elapsed <= 0) return { x: 0, y: 0 };
    const mobileScale = getPresetLayout().mobile ? 0.6 : 1;
    const ramp = easeInOutCubic(elapsed / 2600);
    return {
      x: Math.sin(elapsed / shape.drift.periodX * Math.PI * 2 + shape.drift.phaseX)
        * shape.drift.amplitudeX * mobileScale * ramp,
      y: Math.sin(elapsed / shape.drift.periodY * Math.PI * 2 + shape.drift.phaseY)
        * shape.drift.amplitudeY * mobileScale * ramp,
    };
  }

  function introScale(shape, now) {
    if (!initialIds.has(shape.id) || reduceMotion.matches) return 1;
    const duration = isNotFoundPage ? 700 : INTRO_DURATION;
    const stagger = isNotFoundPage ? 55 : INTRO_STAGGER;
    return easeInOutCubic((now - introStartedAt - shape.introIndex * stagger) / duration);
  }

  function visibleStateShape(shape, now) {
    const visible = { ...shape };
    const drift = driftOffset(shape, now);
    visible.x += drift.x;
    visible.y += drift.y;

    for (const clickSpring of activeClickSprings) {
      const elapsed = Math.max(0, now - clickSpring.startedAt);
      if (elapsed >= POP_SPRING_DURATION) continue;
      const response = clickSpring.responses.get(shape.id);
      if (!response) continue;
      const spring = springValue(elapsed);
      visible.x += response.x * spring;
      visible.y += response.y * spring;
      const responseScale = Math.max(0.92, 1 + response.scale * spring);
      visible.radius *= responseScale;
      visible.radiusX = (visible.radiusX || shape.radius) * responseScale;
      visible.radiusY = (visible.radiusY || shape.radius) * responseScale;
    }

    for (const pop of activePops) {
      const elapsed = Math.max(0, now - pop.startedAt);
      if (elapsed >= POP_SPRING_DURATION) continue;
      const response = pop.responses.get(shape.id);
      if (!response) continue;
      const spring = springValue(elapsed);
      visible.x += response.x * spring;
      visible.y += response.y * spring;
      const responseScale = Math.max(0.92, 1 + response.scale * spring);
      visible.radius *= responseScale;
      visible.radiusX = (visible.radiusX || shape.radius) * responseScale;
      visible.radiusY = (visible.radiusY || shape.radius) * responseScale;
    }
    return visible;
  }

  function ruptureProgress(elapsed) {
    if (elapsed <= POP_RUPTURE_DELAY) return 0;
    const progress = clamp(
      (elapsed - POP_RUPTURE_DELAY) / (POP_MEMBRANE_DURATION - POP_RUPTURE_DELAY),
      0,
      1,
    );
    return progress * progress * (3 - 2 * progress);
  }

  function membraneScale(elapsed) {
    if (elapsed <= POP_RUPTURE_DELAY) {
      const progress = clamp(elapsed / POP_RUPTURE_DELAY, 0, 1);
      return 1 + 0.022 * (1 - Math.pow(1 - progress, 3));
    }
    return 1.022 - ruptureProgress(elapsed) * 0.014;
  }

  function springValue(elapsed) {
    const seconds = Math.max(0, elapsed - 48) / 1000;
    return Math.exp(-6.5 * seconds) * Math.sin(23 * seconds);
  }

  function animatedScene(now) {
    const shapes = state.shapes.map((shape) => visibleStateShape(shape, now));

    for (const pop of activePops) {
      const elapsed = Math.max(0, now - pop.startedAt);
      if (elapsed >= POP_MEMBRANE_DURATION) continue;
      const scale = membraneScale(elapsed);
      shapes.push({
        ...pop.source,
        popGhost: true,
        popProgress: ruptureProgress(elapsed),
        popAngle: pop.ruptureAngle,
        radius: pop.source.radius * scale,
        radiusX: (pop.source.radiusX || pop.source.radius) * scale,
        radiusY: (pop.source.radiusY || pop.source.radius) * scale,
      });
    }

    if (state.preview) shapes.push({ ...state.preview, isPreview: true });
    return shapes.sort((a, b) => a.id - b.id);
  }

  function animatedFusion(now) {
    const pulse = [...activePops, ...activeClickSprings].reduce((total, springEvent) => {
      const elapsed = now - springEvent.startedAt;
      return elapsed < POP_SPRING_DURATION
        ? total + springValue(elapsed) * springEvent.strongestInfluence * 0.09
        : total;
    }, 0);
    return (isNotFoundPage ? NOT_FOUND_FUSION : FUSION) * clamp(1 + pulse, 0.86, 1.14);
  }

  function drawFallback(shapes, now) {
    if (!fallback) return;
    const palette = paletteAt(now);
    fallback.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    fallback.fillStyle = colorCss(palette.background);
    fallback.fillRect(0, 0, size.width, size.height);
    fallback.strokeStyle = colorCss(palette.ink);
    fallback.lineWidth = STROKE;
    for (const shape of shapes) {
      const scale = shape.popGhost ? 1 : introScale(shape, now);
      if (scale <= 0.001) continue;
      const point = worldToScreen(shape.x, shape.y);
      fallback.beginPath();
      fallback.ellipse(
        point.x,
        point.y,
        Math.max(0.001, (shape.radiusX || shape.radius) * scale),
        Math.max(0.001, (shape.radiusY || shape.radius) * scale),
        0,
        0,
        Math.PI * 2,
      );
      fallback.stroke();
    }
  }

  function draw(now = performance.now()) {
    const shapes = animatedScene(now).slice(0, MAX_SHAPES);
    if (!gl || !program) {
      drawFallback(shapes, now);
      drawEffects(now);
      if (now - lastDebugPublishedAt >= 250) publishDebugSnapshot(now);
      return;
    }

    const palette = paletteAt(now);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.uniform2f(uniforms.resolution, size.width, size.height);
    gl.uniform1f(uniforms.dpr, size.dpr);
    gl.uniform1f(uniforms.stroke, STROKE);
    gl.uniform1f(uniforms.fusion, animatedFusion(now));
    gl.uniform3fv(uniforms.background, palette.background);
    gl.uniform3fv(uniforms.ink, palette.ink);
    gl.uniform1i(uniforms.count, shapes.length);

    const shapeA = new Float32Array(MAX_SHAPES * 4);
    const shapeB = new Float32Array(MAX_SHAPES * 4);
    const popAngles = new Float32Array(MAX_SHAPES);
    shapes.forEach((shape, index) => {
      const scale = shape.popGhost || shape.isPreview ? 1 : introScale(shape, now);
      const radiusX = Math.max(0.001, (shape.radiusX || shape.radius) * scale);
      const radiusY = Math.max(0.001, (shape.radiusY || shape.radius) * scale);
      shapeA[index * 4] = shape.x;
      shapeA[index * 4 + 1] = shape.y;
      shapeA[index * 4 + 2] = radiusX;
      shapeA[index * 4 + 3] = radiusY;
      shapeB[index * 4 + 1] = shape.popProgress || 0;
      popAngles[index] = shape.popAngle || 0;
    });
    gl.uniform4fv(uniforms.shapeA, shapeA);
    gl.uniform4fv(uniforms.shapeB, shapeB);
    gl.uniform1fv(uniforms.popAngle, popAngles);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawEffects(now);
    if (now - lastDebugPublishedAt >= 250) publishDebugSnapshot(now);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const previousWidth = size.width;
    const previousHeight = size.height;
    size.width = Math.max(1, rect.width);
    size.height = Math.max(1, rect.height);
    size.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(size.width * size.dpr));
    const height = Math.max(1, Math.round(size.height * size.dpr));
    canvas.width = width;
    canvas.height = height;
    effectsCanvas.width = width;
    effectsCanvas.height = height;
    layoutInitialShapes();
    if (
      previousWidth > 1
      && (Math.abs(previousWidth - size.width) > 1 || Math.abs(previousHeight - size.height) > 1)
    ) {
      activePops = [];
      activeClickSprings = [];
    }
    updateHeroProximity();
    draw();
    scheduleFrame();
  }

  function shapeDistance(shape, point) {
    const radiusX = Math.max(0.001, shape.radiusX || shape.radius);
    const radiusY = Math.max(0.001, shape.radiusY || shape.radius);
    return (Math.hypot((point.x - shape.x) / radiusX, (point.y - shape.y) / radiusY) - 1)
      * Math.min(radiusX, radiusY);
  }

  function findPoppableShape(point) {
    let match = null;
    const now = performance.now();
    for (let index = state.shapes.length - 1; index >= 0; index -= 1) {
      const shape = state.shapes[index];
      const visible = visibleStateShape(shape, now);
      const distance = shapeDistance(visible, point);
      if (distance > STROKE * 0.5 + 7) continue;
      const score = distance <= 0 ? Math.abs(distance) * 0.2 : distance;
      if (!match || score < match.score) match = { id: shape.id, score };
    }
    return match ? match.id : null;
  }

  function buildSpringResponses(source, now) {
    const responses = new Map();
    let strongestInfluence = 0;
    for (const shape of state.shapes) {
      const visible = visibleStateShape(shape, now);
      const dx = visible.x - source.x;
      const dy = visible.y - source.y;
      const distance = Math.hypot(dx, dy);
      const gap = Math.max(0, distance - source.radius - visible.radius);
      const reach = Math.max(110, source.radius * 0.72) + (isNotFoundPage ? NOT_FOUND_FUSION : FUSION);
      const linear = clamp(1 - gap / reach, 0, 1);
      const influence = linear * linear * (3 - 2 * linear);
      if (influence <= 0) continue;
      const angle = distance < 0.001
        ? ((shape.id * 137.508) % 360) * Math.PI / 180
        : Math.atan2(dy, dx);
      const travel = Math.min(34, Math.max(10, source.radius * 0.11)) * influence;
      responses.set(shape.id, {
        x: Math.cos(angle) * travel,
        y: Math.sin(angle) * travel,
        scale: 0.042 * influence,
      });
      strongestInfluence = Math.max(strongestInfluence, influence);
    }
    return { responses, strongestInfluence };
  }

  function makeParticles(source) {
    const particles = [];
    const count = clamp(Math.round(source.radius * 1.1), 72, 180);
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2 + (Math.random() - 0.5) * 0.05;
      const travel = 16 + Math.random() * Math.min(48, source.radius * 0.28 + 14);
      particles.push({
        angle,
        travel,
        size: 0.7 + Math.random() * 1.8,
        delay: 18 + Math.random() * 34,
        duration: 170 + Math.random() * 110,
        gravity: 3 + Math.random() * 8,
        opacity: 0.62 + Math.random() * 0.36,
      });
    }
    return particles;
  }

  function popShape(shapeId, clientX, clientY) {
    const index = state.shapes.findIndex((shape) => shape.id === shapeId);
    if (index < 0) return;
    const now = performance.now();
    const source = visibleStateShape(state.shapes[index], now);
    activeClickSprings = activeClickSprings.filter((spring) => spring.shapeId !== shapeId);
    state.shapes.splice(index, 1);
    initialIds.delete(source.id);
    publishDebugSnapshot();

    if (reduceMotion.matches) {
      draw();
      return;
    }

    const impact = screenToWorld(clientX, clientY);
    const impactDistance = Math.hypot(impact.x - source.x, impact.y - source.y);
    const ruptureAngle = impactDistance > source.radius * 0.08
      ? Math.atan2(impact.y - source.y, impact.x - source.x)
      : ((source.id * 137.508) % 360) * Math.PI / 180;
    const response = buildSpringResponses(source, now);
    activePops = activePops.slice(-4);
    activePops.push({
      source,
      ruptureAngle,
      responses: response.responses,
      strongestInfluence: response.strongestInfluence,
      particles: makeParticles(source),
      startedAt: now,
    });
    scheduleFrame();
  }

  function springShape(shapeId) {
    const index = state.shapes.findIndex((shape) => shape.id === shapeId);
    if (index < 0) return;
    if (reduceMotion.matches) {
      draw();
      return;
    }
    const startedAt = performance.now();
    activeClickSprings = activeClickSprings
      .filter((spring) => (
        spring.shapeId !== shapeId
        && startedAt - spring.startedAt < POP_SPRING_DURATION
      ));
    const source = visibleStateShape(state.shapes[index], startedAt);
    const response = buildSpringResponses(source, startedAt);
    activeClickSprings.push({
      shapeId,
      responses: response.responses,
      strongestInfluence: response.strongestInfluence,
      startedAt,
    });
    scheduleFrame();
  }

  function drawEffects(now) {
    if (!effects) return;
    effects.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    effects.clearRect(0, 0, size.width, size.height);
    effects.fillStyle = colorCss(paletteAt(now).ink);
    for (const pop of activePops) {
      const elapsed = now - pop.startedAt;
      const center = worldToScreen(pop.source.x, pop.source.y);
      for (const particle of pop.particles) {
        const progress = clamp((elapsed - particle.delay) / particle.duration, 0, 1);
        if (progress <= 0 || progress >= 1) continue;
        const release = 1 - Math.pow(1 - progress, 4);
        const originX = center.x + Math.cos(particle.angle) * (pop.source.radiusX || pop.source.radius);
        const originY = center.y + Math.sin(particle.angle) * (pop.source.radiusY || pop.source.radius);
        const x = originX + Math.cos(particle.angle) * particle.travel * release;
        const y = originY + Math.sin(particle.angle) * particle.travel * release + particle.gravity * progress * progress;
        effects.globalAlpha = Math.min(1, (1 - progress) / 0.55) * particle.opacity;
        const particleSize = Math.max(0.35, particle.size * (1 - progress * 0.55));
        effects.fillRect(x - particleSize * 0.5, y - particleSize * 0.5, particleSize, particleSize);
      }
    }
    effects.globalAlpha = 1;
  }

  function updatePreview(start, current, fromCenter) {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const multiplier = fromCenter ? 1 : 0.5;
    state.preview = {
      id: MAX_SHAPES + 1,
      x: fromCenter ? start.x : start.x + dx * 0.5,
      y: fromCenter ? start.y : start.y + dy * 0.5,
      radius: Math.max(0.001, Math.hypot(dx, dy) * multiplier),
    };
    draw();
  }

  function commitPreview(preview) {
    if (!preview || preview.radius <= 3 || state.shapes.length >= MAX_SHAPES) return;
    state.shapes.push({ ...preview, id: nextShapeId++, introIndex: -1 });
    publishDebugSnapshot();
    draw();
  }

  function finishPointer(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const completed = gesture;
    gesture = null;
    const preview = state.preview ? { ...state.preview } : null;
    state.preview = null;
    canvas.classList.remove('is-drawing');
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);

    const travel = Math.hypot(
      event.clientX - completed.startClient.x,
      event.clientY - completed.startClient.y,
    );
    if (event.pointerType === 'touch' && travel <= 12) {
      const shapeId = findPoppableShape(screenToWorld(event.clientX, event.clientY));
      const tappedAt = performance.now();
      const doubleTap = shapeId !== null
        && lastTouchTap
        && lastTouchTap.shapeId === shapeId
        && tappedAt - lastTouchTap.tappedAt <= 360
        && Math.hypot(event.clientX - lastTouchTap.x, event.clientY - lastTouchTap.y) <= 28;
      if (doubleTap) {
        lastTouchTap = null;
        popShape(shapeId, event.clientX, event.clientY);
      } else {
        lastTouchTap = shapeId === null ? null : {
          shapeId,
          x: event.clientX,
          y: event.clientY,
          tappedAt,
        };
        if (shapeId === null) draw();
        else springShape(shapeId);
      }
      return;
    }

    if (travel <= 8) {
      const shapeId = findPoppableShape(screenToWorld(event.clientX, event.clientY));
      if (shapeId !== null) {
        springShape(shapeId);
        return;
      }
    }

    if (preview && preview.radius > 3) {
      if (event.pointerType === 'mouse' && preview.radius < 10) {
        window.clearTimeout(pendingSmallCommit);
        pendingSmallCommit = window.setTimeout(() => {
          pendingSmallCommit = 0;
          commitPreview(preview);
        }, 280);
      } else {
        commitPreview(preview);
      }
    } else {
      draw();
    }
  }

  function cancelPointer(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture = null;
    state.preview = null;
    canvas.classList.remove('is-drawing');
    draw();
  }

  const pointer = { x: 0, y: 0 };
  const bioPan = { x: 0, y: 0, vx: 0, vy: 0, amp: 18, k: 42, c: 10 };
  let draggingText = false;
  let textPointerId = null;
  let grabX = 0;
  let baseWidth = 0;
  let spaceLeft = 0;
  let spaceRight = 0;
  let stretch = 0;
  let stretchVelocity = 0;
  let anchor = 0;
  let anchorVelocity = 0;

  function pointInBio(clientX, clientY, padding = 16) {
    const rect = bio.getBoundingClientRect();
    return clientX >= rect.left - padding
      && clientX <= rect.right + padding
      && clientY >= rect.top - padding
      && clientY <= rect.bottom + padding;
  }

  function updatePointer(clientX, clientY) {
    pointer.x = clientX / Math.max(1, window.innerWidth) * 2 - 1;
    pointer.y = -(clientY / Math.max(1, window.innerHeight) * 2 - 1);
  }

  function updateBio(dt) {
    if (isNotFoundPage) return false;
    const targetX = pointer.x * bioPan.amp;
    const targetY = -pointer.y * bioPan.amp;
    bioPan.vx += (-(bioPan.x - targetX) * bioPan.k - bioPan.vx * bioPan.c) * dt;
    bioPan.vy += (-(bioPan.y - targetY) * bioPan.k - bioPan.vy * bioPan.c) * dt;
    bioPan.x += bioPan.vx * dt;
    bioPan.y += bioPan.vy * dt;

    let targetStretch = 0;
    let targetAnchor = 0;
    if (draggingText) {
      const delta = pointerClientX - grabX;
      const available = (delta < 0 ? spaceLeft : spaceRight) - 24;
      targetStretch = Math.max(0, Math.min(200, Math.abs(delta) * 0.85, available));
      targetAnchor = delta < 0 ? -targetStretch : 0;
    }
    stretchVelocity += (-(stretch - targetStretch) * 120 - stretchVelocity * 16) * dt;
    anchorVelocity += (-(anchor - targetAnchor) * 120 - anchorVelocity * 16) * dt;
    stretch += stretchVelocity * dt;
    anchor += anchorVelocity * dt;

    if (stretch < 0.05 && !draggingText) {
      if (bio.style.width) bio.style.width = '';
      stretch = 0;
    } else if (baseWidth) {
      bio.style.width = (baseWidth + Math.max(0, stretch)).toFixed(1) + 'px';
    }
    bio.style.transform = 'translate3d('
      + (bioPan.x + anchor).toFixed(2) + 'px,'
      + bioPan.y.toFixed(2) + 'px,0)';

    return draggingText
      || Math.abs(bioPan.vx) + Math.abs(bioPan.vy) > 0.03
      || Math.abs(stretchVelocity) + Math.abs(anchorVelocity) > 0.03
      || Math.abs(bioPan.x - targetX) + Math.abs(bioPan.y - targetY) > 0.03
      || stretch > 0.05;
  }

  let pointerClientX = window.innerWidth * 0.5;

  function updateHeroProximity() {
    const wasNear = heroNearViewport;
    heroNearViewport = window.scrollY <= Math.max(size.height, window.innerHeight) * 1.25;
    if (!wasNear && heroNearViewport && document.visibilityState === 'visible') scheduleFrame();
  }

  function ambientActive() {
    return !reduceMotion.matches
      && heroNearViewport
      && document.visibilityState === 'visible'
      && state.shapes.some((shape) => shape.starter && initialIds.has(shape.id));
  }

  function frame(now) {
    frameRequest = 0;
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrameAt) / 1000));
    lastFrameAt = now;
    const bioMoving = updateBio(dt);
    activePops = activePops.filter((pop) => now - pop.startedAt < POP_SPRING_DURATION);
    activeClickSprings = activeClickSprings.filter((spring) => (
      now - spring.startedAt < POP_SPRING_DURATION
    ));
    const introActive = !reduceMotion.matches && now < introEndsAt();
    const transitionActive = themeTransitionActive(now);
    const interactiveActive = introActive
      || activePops.length > 0
      || activeClickSprings.length > 0
      || bioMoving
      || Boolean(gesture)
      || transitionActive;
    const ambient = ambientActive();
    const ambientDue = now - lastAmbientDrawAt >= AMBIENT_FRAME_INTERVAL;

    if (interactiveActive || (ambient && ambientDue)) {
      draw(now);
      if (ambientDue) lastAmbientDrawAt = now;
    }
    if (interactiveActive || ambient) scheduleFrame();
  }

  function scheduleFrame() {
    if (!frameRequest) frameRequest = window.requestAnimationFrame(frame);
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointInBio(event.clientX, event.clientY)) return;
    const start = screenToWorld(event.clientX, event.clientY);
    gesture = {
      pointerId: event.pointerId,
      start,
      startClient: { x: event.clientX, y: event.clientY },
      fromCenter: event.altKey,
    };
    state.preview = { id: MAX_SHAPES + 1, x: start.x, y: start.y, radius: 0.001 };
    canvas.classList.add('is-drawing');
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture.fromCenter = gesture.fromCenter || event.altKey;
    updatePreview(gesture.start, screenToWorld(event.clientX, event.clientY), gesture.fromCenter);
  });

  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', cancelPointer);
  canvas.addEventListener('lostpointercapture', (event) => {
    if (gesture && event.pointerId === gesture.pointerId) cancelPointer(event);
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('dblclick', (event) => {
    if (event.button !== 0) return;
    window.clearTimeout(pendingSmallCommit);
    pendingSmallCommit = 0;
    gesture = null;
    state.preview = null;
    const shapeId = findPoppableShape(screenToWorld(event.clientX, event.clientY));
    if (shapeId === null) {
      draw();
      return;
    }
    event.preventDefault();
    popShape(shapeId, event.clientX, event.clientY);
  });

  window.addEventListener('pointermove', (event) => {
    pointerClientX = event.clientX;
    updatePointer(event.clientX, event.clientY);
    // Apply one spring step synchronously while held so even a quick drag visibly
    // prolongs the leaders; the scheduled frames preserve the soft trailing motion.
    if (draggingText) updateBio(1 / 60);
    scheduleFrame();
  }, { passive: true });

  window.addEventListener('pointerdown', (event) => {
    if (event.target && event.target.closest && event.target.closest('a,button,input,select,textarea')) return;
    if (window.scrollY > window.innerHeight * 0.5 || !pointInBio(event.clientX, event.clientY)) return;
    const rect = bio.getBoundingClientRect();
    draggingText = true;
    textPointerId = event.pointerId;
    grabX = event.clientX;
    baseWidth = rect.width - stretch;
    spaceLeft = rect.left;
    spaceRight = window.innerWidth - rect.right;
    scheduleFrame();
  });

  function releaseText(event) {
    if (!draggingText || (textPointerId !== null && event.pointerId !== textPointerId)) return;
    draggingText = false;
    textPointerId = null;
    scheduleFrame();
  }

  window.addEventListener('pointerup', releaseText);
  window.addEventListener('pointercancel', releaseText);
  window.addEventListener('blur', () => {
    draggingText = false;
    textPointerId = null;
    gesture = null;
    state.preview = null;
    scheduleFrame();
  });
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', updateHeroProximity, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastFrameAt = performance.now();
      updateHeroProximity();
      draw();
      scheduleFrame();
    }
  });
  window.addEventListener('themechange', (event) => {
    const theme = event.detail && event.detail.theme
      ? event.detail.theme
      : document.documentElement.getAttribute('data-theme');
    transitionTheme(theme);
  });
  reduceMotion.addEventListener?.('change', () => {
    activePops = [];
    activeClickSprings = [];
    introStartedAt = reduceMotion.matches ? -Infinity : performance.now();
    draw();
    scheduleFrame();
  });

  const hasWebGL = initWebGL();
  if (!hasWebGL) fallback = canvas.getContext('2d');
  resize();
  generateInitialCircles();
  draw();
  scheduleFrame();

  window.__landingLiquidDebug = Object.freeze({
    snapshot() {
      return createDebugSnapshot(performance.now());
    },
  });

  function createDebugSnapshot(now) {
    return {
      renderer: gl && program ? 'webgl2' : '2d',
      presetIndex: selectedPresetIndex,
      presetNumber: selectedPresetIndex + 1,
      presetName: selectedPreset.name,
      bounds: getInitialBounds(),
      shapeCount: state.shapes.length,
      initialIds: Array.from(initialIds),
      shapes: state.shapes.map((shape) => {
        const visible = visibleStateShape(shape, now);
        const baseScreen = worldToScreen(shape.x, shape.y);
        const visibleScreen = worldToScreen(visible.x, visible.y);
        return {
          id: shape.id,
          x: visibleScreen.x,
          y: visibleScreen.y,
          radius: visible.radius,
          radiusX: visible.radiusX || visible.radius,
          radiusY: visible.radiusY || visible.radius,
          baseX: baseScreen.x,
          baseY: baseScreen.y,
          baseRadius: shape.radius,
          visibleX: visibleScreen.x,
          visibleY: visibleScreen.y,
          visibleRadius: visible.radius,
          initial: initialIds.has(shape.id),
          starter: Boolean(shape.starter),
        };
      }),
    };
  }

  function publishDebugSnapshot(now = performance.now()) {
    canvas.dataset.debugSnapshot = JSON.stringify(createDebugSnapshot(now));
    lastDebugPublishedAt = now;
  }

  publishDebugSnapshot();

  window.requestAnimationFrame(() => {
    draw();
    window.dispatchEvent(new CustomEvent('landing-liquid-ready'));
  });
})();
