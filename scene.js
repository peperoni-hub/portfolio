// ---------- Sunflower field scene ----------
// A tiny pixel-art world. The canvas is drawn at low resolution and scaled
// up with crisp pixels. The light follows the real sun over Tuzla, the
// sunflowers sway in the wind, and a calico cat lives at the edge of the field.
(() => {
  const hero = document.querySelector('.hero');
  const canvas = hero ? hero.querySelector('.scene') : null;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TUZLA = { lat: 44.538, lon: 18.676 };
  const MODE_ALTITUDE = { day: 38, dusk: -1.5, night: -18 };
  let mode = 'live';

  // ----- Small helpers -----
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  // 4x4 ordered dither, the classic pixel-art way to blend two colours
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16);
  const bayer = (x, y) => BAYER[(x & 3) + ((y & 3) << 2)];

  function seeded(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Height of the sun above the horizon, in degrees, for a place and moment
  function sunAltitude(time, lat, lon) {
    const rad = Math.PI / 180;
    const d = time / 86400000 - 10957.5; // days since 1 Jan 2000, noon
    const g = (357.529 + 0.98560028 * d) * rad;
    const q = 280.459 + 0.98564736 * d;
    const l = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
    const e = (23.439 - 0.00000036 * d) * rad;
    const ra = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l));
    const dec = Math.asin(Math.sin(e) * Math.sin(l));
    const hourAngle = ((18.697374558 + 24.06570982441908 * d) * 15 + lon) * rad - ra;
    const alt = Math.asin(
      Math.sin(lat * rad) * Math.sin(dec) + Math.cos(lat * rad) * Math.cos(dec) * Math.cos(hourAngle)
    );
    return alt / rad;
  }

  // ----- Colours: each set is [night, dusk, day] -----
  const set = (night, dusk, day) => [hex(night), hex(dusk), hex(day)];
  const SKY = [
    set('#070d22', '#34417f', '#4aa3ec'),
    set('#0e1838', '#a8648c', '#86c4f2'),
    set('#1c2a50', '#ffb07a', '#d6eeff'),
  ];
  const CLOUD = [
    set('#38425f', '#ffe3d2', '#ffffff'),
    set('#2a3350', '#f0b2a6', '#edf4fb'),
    set('#1e2640', '#b4879e', '#c9d9ea'),
  ];
  // Land colours are painted in daylight and multiplied by this tint
  const TINT = [[0.24, 0.29, 0.46], [1, 0.8, 0.7], [1, 1, 1]];
  const LAND = {
    farHill: '#a8cdb0', farHillTop: '#bcdcc0', nearHill: '#7fb565', nearHillTop: '#93c474',
    field1: '#86ba58', field2: '#68a33f', field3: '#4f8b31',
    speck: '#3f7527', speckLight: '#a3cf6c',
    path: '#9bcf62', pathDark: '#86bd52', tuft: '#5f9a3a', clover: '#fff6e6', clover2: '#ffb6c8',
  };
  const FLOWER = {
    y: '#ffd43b', Y: '#f4a91c', b: '#7b4a1f', B: '#4d2b10', stem: '#4c8a2c', leaf: '#69a93b',
  };
  const COLORS = {
    k: '#2a211d', w: '#f8f2e7', s: '#d6cab9', o: '#e58b3a', O: '#b5652a', b: '#3b3230',
    p: '#ee9aa2', g: '#8fc34a', c: '#f5d06a', C: '#dea53c', m: '#fff4dc', a: '#ff8fb1', A: '#ffc6d6',
  };

  const light = { alt: 0, toDusk: 0, toDay: 0, night: 0, day: 0, tint: [1, 1, 1] };
  const byLight = (s) => mix(mix(s[0], s[1], light.toDusk), s[2], light.toDay);

  // Daylight colour -> colour in the current light. `lift` keeps the cat
  // and her cup a little brighter than the field, so she never gets lost.
  const litCache = new Map();
  function lit(h, lift = 0) {
    const key = h + lift;
    let c = litCache.get(key);
    if (!c) {
      const t = mix(light.tint, [1, 1, 1], lift);
      c = css(hex(h).map((v, i) => v * t[i]));
      litCache.set(key, c);
    }
    return c;
  }

  // ----- Sprites ('.' is see-through, other letters are COLORS keys) -----
  const LYING = [
    '................k.....k.',
    '...............kok...kbk',
    '...............koowwwbbk',
    '...............kowwwwwbk',
    '...kkkkkkkkkkkkkwgwwwgwk',
    '..kwoooooobbbwwkwwwpwwwk',
    '..koooowwwbbwwwwkwwwwwk.',
    '..kwooowwwwwwwwwwkkkkkwk',
    '..kwwwwwwwwwwwwwwwwwwwwk',
    '.koooowwwwwwwwwwwwwwwwwk',
    '.ksssssssssssssswwwkwwwk',
    '..kkkkkkkkkkkkkkkkkkkkk.',
  ];
  const WALK = [
    '...............k...k..',
    '..............kok.kbk.',
    '..............kooowbbk',
    '..............koowwgwk',
    '..kkkkkkkkkkkkkwwwwwwp',
    '.kwoooooobbbwwwwwkkkk.',
    '.kooooowwbbbwwwwwwk...',
    '.kwwwwwwwwwwwwwwwwk...',
    '..kkkkkkkkkkkkkkkk....',
  ];
  const BLINK = { '17,4': 'k', '21,4': 'k' };
  const ASLEEP = { '17,4': 'k', '18,4': 'k', '20,4': 'k', '21,4': 'k' };
  const WALK_BLINK = { '19,3': 'k' };
  const MUG = ['kkkkkk..', 'kmmmmkkk', 'kcCcck.k', 'kcCcckkk', '.kkkk...'];
  const WINGS_OPEN = ['aa.aa', 'aAkAa', '.a.a.'];
  const WINGS_SHUT = ['.a.a.', '.aka.', '.....'];
  const BANG = ['k', 'k', 'k', '.', 'k'];
  const ZED = ['wwwww', '...w.', '..w..', '.w...', 'wwwww'];
  const HEADS = {
    1: ['.y.', 'yby', '.y.'],
    2: ['.yYy.', 'yybyy', 'YbBbY', 'yybyy', '.yYy.'],
    3: ['..yYy..', '.yyyyy.', 'yYbbbYy', 'yybBbyy', 'yYbbbYy', '.yyyyy.', '..yYy..'],
  };
  // Legs of the walking cat: far legs are a shade darker
  const LEGS = [
    { at: 4, c: 'O', pair: 0 },
    { at: 14, c: 's', pair: 1 },
    { at: 6, c: 'o', pair: 1 },
    { at: 16, c: 'w', pair: 0 },
  ];
  const STRIDE = [[-1, 1], [0, 0], [1, -1], [0, 0]];

  function sprite(rows, x, y, flip = false, swap = null, lift = 0.5) {
    const w = rows[0].length;
    for (let j = 0; j < rows.length; j++) {
      for (let i = 0; i < w; i++) {
        const ch = (swap && swap[i + ',' + j]) || rows[j][i];
        if (ch === '.') continue;
        ctx.fillStyle = lit(COLORS[ch], lift);
        ctx.fillRect(x + (flip ? w - 1 - i : i), y + j, 1, 1);
      }
    }
  }

  // ----- The world: sizes, layout and cached layers -----
  let W = 0, H = 0, PX = 4, horizon = 0, pathTop = 0, baseY = 0;
  // The cat, her cup and the butterfly are drawn S times bigger on wide
  // screens, so they live in their own coordinates: CW wide, ground at CB.
  let S = 2, CW = 0, CB = 0, homeX = 0;
  let stars = [], clouds = [], rows = [], specks = [], tufts = [], fireflies = [], pollen = [];
  let farHills = [], nearHills = [];
  const skyLayer = document.createElement('canvas');
  const landLayer = document.createElement('canvas');
  const headLayers = { 1: document.createElement('canvas'), 2: document.createElement('canvas'), 3: document.createElement('canvas') };
  let paintedAt = null;

  function build() {
    const r = seeded(20261126);
    stars = Array.from({ length: Math.round(W / 4) }, () => ({
      x: Math.floor(r() * W), y: Math.floor(r() * horizon * 0.85), p: r() * 6.28, s: 0.4 + r() * 1.6, big: r() < 0.12,
    }));

    clouds = Array.from({ length: Math.max(3, Math.round(W / 70)) }, () => makeCloud(r));

    const a = r() * 6, b = r() * 6;
    farHills = Array.from({ length: W }, (_, x) =>
      Math.round(horizon - 9 - 5 * Math.sin(x * 0.019 + a) - 3 * Math.sin(x * 0.051 + b)));
    nearHills = Array.from({ length: W }, (_, x) =>
      Math.round(horizon - 3 - 3 * Math.sin(x * 0.033 + b) - 1.5 * Math.sin(x * 0.11 + a)));

    specks = Array.from({ length: Math.round(W * (pathTop - horizon) / 14) }, () => ({
      x: Math.floor(r() * W), y: horizon + Math.floor(r() * (pathTop - horizon)), light: r() < 0.3,
    }));
    tufts = [];
    for (let x = 0; x < W; x++) {
      if (r() < 0.45) tufts.push({ x, h: 1 + Math.floor(r() * 3) });
      if (r() < 0.04) tufts.push({ x, y: pathTop + 3 + Math.floor(r() * (H - pathTop - 4)), clover: r() < 0.5 ? 1 : 2 });
    }

    // Sunflowers in rows, small and dense at the back, big at the front
    rows = [];
    for (let y = horizon + 2; y < pathTop; ) {
      const d = (y - horizon) / (pathTop - horizon);
      const gap = 4 + d * 11;
      const row = [];
      for (let x = r() * gap; x < W + 4; x += gap * (0.75 + r() * 0.5)) {
        row.push({
          x: Math.round(x), y, d,
          size: d < 0.18 ? 0 : d < 0.42 ? 1 : d < 0.72 ? 2 : 3,
          h: Math.round(2 + d * d * 20 + r() * 3),
          p: r() * 6.28, leaf: r() < 0.5 ? -1 : 1, top: 0,
        });
      }
      rows.push(row);
      y += Math.max(1, Math.round(1 + d * 3.5));
    }

    // Fireflies: a little cloud of them around the cat, the rest over the field and sky
    fireflies = Array.from({ length: 30 }, (_, i) => {
      const near = i < 11;
      return {
        x: near ? (homeX + 14) * S + (r() - 0.5) * 60 : r() * W,
        y: near ? baseY - 6 - r() * 22 * S : horizon - 45 + r() * (pathTop - horizon + 35),
        ax: 3 + r() * 7, ay: 2 + r() * 4, s1: 0.2 + r() * 0.45, s2: 0.6 + r() * 1.3, p: r() * 6.28,
      };
    });
    pollen = Array.from({ length: 16 }, () => ({ x: r() * W, y: horizon - 30 + r() * (pathTop - horizon + 20), s: 0.5 + r(), p: r() * 6.28 }));
  }

  // A cloud is a row of round puffs on a flat bottom, tallest in the middle
  function makeCloud(r) {
    const w = Math.round(24 + r() * 30);
    const h = Math.round(9 + r() * 6);
    const n = 3 + Math.floor(r() * 3);
    const base = h - 1;
    const puffs = Array.from({ length: n }, (_, i) => {
      const middle = 1 - Math.abs(i / (n - 1) - 0.5) * 1.3;
      return { x: w * (0.14 + (0.72 * i) / (n - 1)) + (r() - 0.5) * 3, r: h * (0.42 + 0.55 * middle) * (0.85 + r() * 0.3) };
    });
    const pixels = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let edge = -1;
        for (const p of puffs) edge = Math.max(edge, p.r - Math.hypot(x - p.x, (y - base) * 1.1));
        if (edge + (bayer(x, y) - 0.5) * 1.2 <= 0) continue;
        const shade = y / h + (bayer(x, y) - 0.5) * 0.2;
        pixels.push([x, y, shade < 0.55 ? 0 : shade < 0.82 ? 1 : 2]);
      }
    }
    const layer = document.createElement('canvas');
    layer.width = w;
    layer.height = h;
    return { x: r() * W, y: Math.round(4 + r() * horizon * 0.42), w, sp: 0.6 + r() * 0.7, pixels, layer };
  }

  // Repaint the layers that only change when the light changes
  function paint() {
    litCache.clear();

    // Sky: a three-stop gradient, posterised with dithering for the pixel look
    const sctx = skyLayer.getContext('2d');
    const sky = sctx.createImageData(W, horizon);
    const top = byLight(SKY[0]), mid = byLight(SKY[1]), low = byLight(SKY[2]);
    for (let y = 0; y < horizon; y++) {
      const t = y / Math.max(1, horizon - 1);
      const c = t < 0.55 ? mix(top, mid, t / 0.55) : mix(mid, low, (t - 0.55) / 0.45);
      for (let x = 0; x < W; x++) {
        const d = bayer(x, y);
        const i = (y * W + x) * 4;
        sky.data[i] = Math.floor(c[0] / 9 + d) * 9;
        sky.data[i + 1] = Math.floor(c[1] / 9 + d) * 9;
        sky.data[i + 2] = Math.floor(c[2] / 9 + d) * 9;
        sky.data[i + 3] = 255;
      }
    }
    sctx.putImageData(sky, 0, 0);

    // Clouds
    const tones = CLOUD.map(byLight);
    for (const cloud of clouds) {
      const cctx = cloud.layer.getContext('2d');
      cctx.clearRect(0, 0, cloud.w, cloud.layer.height);
      for (const [x, y, s] of cloud.pixels) {
        cctx.fillStyle = css(tones[s]);
        cctx.fillRect(x, y, 1, 1);
      }
    }

    // Hills, field and the grassy path in front
    const lctx = landLayer.getContext('2d');
    const land = lctx.createImageData(W, H);
    const tint = (h) => hex(h).map((v, i) => v * light.tint[i]);
    const L = Object.fromEntries(Object.entries(LAND).map(([k, v]) => [k, tint(v)]));
    const put = (x, y, c) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 4;
      land.data[i] = c[0];
      land.data[i + 1] = c[1];
      land.data[i + 2] = c[2];
      land.data[i + 3] = 255;
    };
    for (let x = 0; x < W; x++) {
      for (let y = farHills[x]; y < horizon; y++) put(x, y, y === farHills[x] ? L.farHillTop : L.farHill);
      for (let y = nearHills[x]; y < horizon; y++) put(x, y, y === nearHills[x] ? L.nearHillTop : L.nearHill);
    }
    const bands = [L.field1, L.field2, L.field3];
    for (let y = horizon; y < pathTop; y++) {
      const v = ((y - horizon) / (pathTop - horizon)) * 2;
      for (let x = 0; x < W; x++) {
        const band = Math.floor(v);
        put(x, y, bands[Math.min(2, band + (v - band > bayer(x, y) ? 1 : 0))]);
      }
    }
    for (const s of specks) put(s.x, s.y, s.light ? L.speckLight : L.speck);
    // The farthest sunflowers are just yellow dots, baked into the field
    const farYellow = tint(FLOWER.y);
    for (const row of rows) for (const f of row) if (f.size === 0) put(f.x, f.y - 1, farYellow);
    for (let y = pathTop; y < H; y++) {
      for (let x = 0; x < W; x++) put(x, y, y - pathTop < 2 && bayer(x, y) < 0.5 ? L.pathDark : L.path);
    }
    for (const t of tufts) {
      if (t.clover) put(t.x, t.y, t.clover === 1 ? L.clover : L.clover2);
      else for (let j = 1; j <= t.h; j++) put(t.x, pathTop - j + 1, L.tuft);
    }
    lctx.putImageData(land, 0, 0);

    // Sunflower heads, one small canvas per size
    for (const size of [1, 2, 3]) {
      const art = HEADS[size];
      const layer = headLayers[size];
      layer.width = layer.height = art.length;
      const hctx = layer.getContext('2d');
      art.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch === '.') return;
        hctx.fillStyle = lit(FLOWER[ch]);
        hctx.fillRect(i, j, 1, 1);
      }));
    }
  }

  // ----- Light -----
  let alt = null;
  let heroLight = -1;
  const targetAltitude = () =>
    mode === 'live' ? sunAltitude(Date.now(), TUZLA.lat, TUZLA.lon) : MODE_ALTITUDE[mode];

  function updateLight(dt, snap) {
    const target = targetAltitude();
    alt = alt === null || snap ? target : alt + (target - alt) * (1 - Math.exp(-dt * 2.4));
    light.alt = alt;
    light.toDusk = smooth(-12, -2, alt);
    light.toDay = smooth(0, 12, alt);
    light.night = 1 - smooth(-9, -3, alt);
    light.day = smooth(4, 14, alt);
    light.tint = mix(mix(TINT[0], TINT[1], light.toDusk), TINT[2], light.toDay);
    if (W && (paintedAt === null || Math.abs(paintedAt - alt) > 0.12)) {
      paint();
      paintedAt = alt;
    }

    // The name and intro line sit on the sky: dark ink by day, cream at night
    const v = smooth(-2, 8, alt);
    if (Math.abs(v - heroLight) > 0.01) {
      heroLight = v;
      const s = hero.style;
      s.setProperty('--hero-ink', css(mix([246, 240, 222], [45, 41, 32], v)));
      s.setProperty('--hero-muted', css(mix([218, 211, 190], [58, 52, 38], v)));
      s.setProperty('--hero-accent', css(mix([255, 214, 92], [107, 74, 5], v)));
      s.setProperty('--hero-mark', css(mix([255, 214, 92], [247, 221, 124], v), 0.35 + 0.65 * v));
      s.setProperty('--hero-shadow', `rgba(0, 0, 0, ${(0.35 * (1 - v)).toFixed(2)})`);
    }
  }

  // ----- Drawing the parts of the scene -----
  const wind = (t) => 0.55 + 0.25 * Math.sin(t * 0.21) + 0.2 * Math.sin(t * 0.53 + 1.3) + 0.12 * Math.sin(t * 1.7 + 0.4);

  function disc(cx, cy, r, color, alpha, ring = 0) {
    ctx.fillStyle = css(color, alpha);
    for (let y = -Math.ceil(r); y <= r; y++) {
      for (let x = -Math.ceil(r); x <= r; x++) {
        const d = Math.hypot(x, y);
        if (d > r || d < ring) continue;
        if (ring && bayer(cx + x, cy + y) > 0.5) continue;
        ctx.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }

  function drawSkyLights(t) {
    if (light.night > 0.01) {
      for (const s of stars) {
        const a = light.night * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p)));
        ctx.fillStyle = `rgba(255, 251, 232, ${a})`;
        ctx.fillRect(s.x, s.y, 1, 1);
        if (s.big && a > 0.75) {
          ctx.fillStyle = `rgba(255, 251, 232, ${a * 0.35})`;
          ctx.fillRect(s.x - 1, s.y, 3, 1);
          ctx.fillRect(s.x, s.y - 1, 1, 3);
        }
      }
      const mx = Math.round(W * 0.8), my = Math.round(horizon * 0.3);
      disc(mx, my, 9, [243, 238, 214], 0.18 * light.night, 6);
      disc(mx, my, 5, [243, 238, 214], light.night);
      ctx.fillStyle = `rgba(206, 197, 168, ${light.night})`;
      ctx.fillRect(mx - 2, my - 1, 2, 2);
      ctx.fillRect(mx + 2, my + 2, 1, 1);
      ctx.fillRect(mx + 1, my - 3, 1, 1);
    }
    if (light.alt > -5) {
      const x = Math.round(W * 0.84);
      const y = Math.round(horizon - 3 - (clamp(light.alt, -5, 45) / 45) * horizon * 0.8);
      disc(x, y, 10, mix([255, 176, 112], [255, 240, 160], light.toDay), 0.45, 6.5);
      disc(x, y, 5.5, mix([255, 157, 77], [255, 246, 196], light.toDay), 1);
    }
  }

  function drawClouds(dt, w) {
    for (const c of clouds) {
      c.x += dt * (1 + w * 2.6) * c.sp;
      if (c.x > W + 2) c.x = -c.w - 2;
      ctx.drawImage(c.layer, Math.round(c.x), c.y);
    }
  }

  function drawFlowers(t, w) {
    const sway = 0.25 + w * 0.75;
    const droop = Math.round(light.night * 1.2);
    const stem = lit(FLOWER.stem), leaf = lit(FLOWER.leaf);
    for (const row of rows) {
      if (row[0].size === 0) continue;
      ctx.fillStyle = stem;
      for (const f of row) {
        const amp = 0.4 + f.d * 2.6;
        // The sine travels across the field, so the wind looks like waves
        f.top = (Math.sin(t * 1.8 - f.x * 0.13 + f.p * 0.3) * sway + w * 0.7) * amp;
        let from = 0, cur = 0;
        for (let j = 1; j <= f.h; j++) {
          const dx = j < f.h ? Math.round(f.top * (j / f.h) ** 2) : null;
          if (dx !== cur) {
            ctx.fillRect(f.x + cur, f.y - j + 1, 1, j - from);
            from = j;
            cur = dx;
          }
        }
      }
      ctx.fillStyle = leaf;
      for (const f of row) {
        if (f.size < 2) continue;
        const j = Math.round(f.h * 0.45);
        const lx = f.x + Math.round(f.top * (j / f.h) ** 2);
        ctx.fillRect(f.leaf > 0 ? lx + 1 : lx - 2, f.y - j, 2, 1);
        ctx.fillRect(f.leaf > 0 ? lx + 2 : lx - 2, f.y - j - 1, 1, 1);
      }
      for (const f of row) {
        const half = (HEADS[f.size].length - 1) / 2;
        ctx.drawImage(headLayers[f.size], f.x + Math.round(f.top) - half, f.y - f.h - half + droop);
      }
    }
  }

  function drawPollen(t, dt, w) {
    if (light.day < 0.05) return;
    ctx.fillStyle = `rgba(255, 242, 168, ${0.8 * light.day})`;
    for (const p of pollen) {
      p.x += dt * (5 + w * 16) * p.s;
      if (p.x > W + 1) p.x = -1;
      ctx.fillRect(Math.round(p.x), Math.round(p.y + Math.sin(t * 1.6 + p.p) * 3), 1, 1);
    }
  }

  function drawFireflies(t) {
    if (light.night < 0.02) return;
    for (const f of fireflies) {
      const x = Math.round(f.x + Math.sin(t * f.s1 + f.p) * f.ax);
      const y = Math.round(f.y + Math.cos(t * f.s1 * 1.3 + f.p) * f.ay);
      const glow = Math.max(0, Math.sin(t * f.s2 + f.p * 2));
      const a = light.night * (0.2 + 0.8 * glow * glow);
      ctx.fillStyle = `rgba(255, 244, 160, ${a})`;
      ctx.fillRect(x, y, 1, 1);
      if (glow > 0.6) {
        ctx.fillStyle = `rgba(214, 242, 107, ${a * 0.45})`;
        ctx.fillRect(x - 1, y, 1, 1);
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x, y - 1, 1, 1);
        ctx.fillRect(x, y + 1, 1, 1);
      }
    }
  }

  // ----- The cat, her milk and the butterfly -----
  const cat = { x: 0, dir: 1, state: 'rest', t: 0, step: 0, hop: 0, cool: 0, blink: 0, nextBlink: 2, moving: false };
  let fly = null;
  let nextVisit = 7;
  let zeds = [];
  let zedTimer = 0;

  function setCat(state) {
    cat.state = state;
    cat.t = 0;
  }

  function moveCat(target, speed, dt, stepRate) {
    const dx = target - cat.x;
    if (Math.abs(dx) < 0.5) {
      cat.x = target;
      return true;
    }
    cat.dir = Math.sign(dx);
    cat.x += cat.dir * Math.min(Math.abs(dx), speed * dt);
    cat.step += dt * stepRate;
    cat.moving = true;
    return false;
  }

  function updateCat(dt) {
    cat.t += dt;
    cat.cool -= dt;
    cat.moving = false;
    cat.hop = Math.max(0, cat.hop - dt);
    cat.nextBlink -= dt;
    if (cat.nextBlink < 0) {
      cat.blink = 0.15;
      cat.nextBlink = 2.5 + Math.random() * 4;
    }
    cat.blink -= dt;

    const sleepy = light.night > 0.55;
    switch (cat.state) {
      case 'rest':
        if (sleepy) setCat('sleep');
        break;
      case 'sleep':
        if (light.night < 0.4) setCat('rest');
        break;
      case 'stand':
        if (fly) cat.dir = Math.sign(fly.x - (cat.x + 11)) || cat.dir;
        if (cat.t > 0.6) setCat(fly ? 'chase' : 'return');
        break;
      case 'chase': {
        if (!fly) {
          setCat('return');
          break;
        }
        // Run until her nose is just behind the butterfly, then pounce
        const ahead = fly.x > cat.x + 11;
        const target = clamp(ahead ? fly.x - 25 : fly.x + 3, 1, CW - 23);
        moveCat(target, 34, dt, 15);
        if (!cat.moving) cat.dir = ahead ? 1 : -1;
        if (Math.abs(target - cat.x) < 5 && fly.y > CB - 30 && cat.cool <= 0 && cat.hop <= 0) {
          cat.hop = 0.45;
          cat.cool = 1.8;
        }
        break;
      }
      case 'return':
        if (moveCat(homeX, 17, dt, 9)) {
          cat.dir = 1;
          setCat(sleepy ? 'sleep' : 'rest');
        }
        break;
    }

    if (cat.state === 'sleep') {
      zedTimer -= dt;
      if (zedTimer <= 0) {
        zeds.push({ x: cat.x + 21, y: CB - 15, t: 0 });
        zedTimer = 1.8;
      }
    }
    zeds = zeds.filter((z) => (z.t += dt) < 2.6);
  }

  function updateFly(dt) {
    if (!fly) {
      if (light.day > 0.7 && cat.state === 'rest') {
        nextVisit -= dt;
        if (nextVisit <= 0) {
          const fromLeft = Math.random() < 0.5;
          fly = { x: fromLeft ? -4 : CW + 4, y: CB - 34, tx: 0, ty: 0, t: 0, timer: 0, phase: 'arrive' };
        }
      }
      return;
    }

    fly.t += dt;
    const headX = cat.x + 19, headY = CB - 17;
    const near = (r) => Math.hypot(fly.tx - fly.x, fly.ty - fly.y) < r;
    const wander = () => {
      let x;
      do x = 6 + Math.random() * (CW - 14);
      while (Math.abs(x - (cat.x + 11)) < 30 && CW > 90);
      fly.tx = x;
      fly.ty = CB - 16 - Math.random() * 16;
    };
    const leave = () => {
      fly.phase = 'leave';
      fly.tx = fly.x + (Math.random() < 0.5 ? -40 : 40);
      fly.ty = -14;
    };

    if (light.day < 0.5 && fly.phase !== 'leave') leave();
    if (fly.phase === 'arrive') {
      fly.tx = headX;
      fly.ty = headY - 4;
      if (near(3)) {
        fly.phase = 'tease';
        fly.timer = 2.4;
        setCat('alert');
      }
    } else if (fly.phase === 'tease') {
      fly.tx = headX + Math.sin(fly.t * 2.2) * 4;
      fly.ty = headY - 5 + Math.cos(fly.t * 3.1) * 2;
      fly.timer -= dt;
      if (fly.timer <= 0) {
        fly.phase = 'flee';
        fly.timer = 8 + Math.random() * 4;
        wander();
        setCat('stand');
      }
    } else if (fly.phase === 'flee') {
      if (near(3)) wander();
      fly.timer -= dt;
      if (fly.timer <= 0) leave();
    } else if (fly.y < -6) {
      fly = null;
      nextVisit = 35 + Math.random() * 30;
      if (cat.state !== 'rest' && cat.state !== 'sleep') setCat('return');
      return;
    }

    const speed = { arrive: 16, tease: 14, flee: 27, leave: 24 }[fly.phase];
    const dx = fly.tx - fly.x, dy = fly.ty - fly.y;
    const dist = Math.hypot(dx, dy) || 1;
    const stepLen = Math.min(dist, speed * dt);
    fly.x += (dx / dist) * stepLen;
    fly.y += (dy / dist) * stepLen + Math.sin(fly.t * 8) * 0.35;
  }

  function drawTail(x, y, dir, start, bend, sway, t, length = 8) {
    const points = [];
    let px = 0, py = 0, a = start;
    for (let i = 0; i < length; i++) {
      a += bend + Math.sin(t * 2.1 - i * 0.55) * sway * (i / length);
      px += Math.cos(a) * 1.15;
      py += Math.sin(a) * 1.15;
      points.push([x + Math.round(px * dir), y + Math.round(py)]);
    }
    ctx.fillStyle = lit(COLORS.k, 0.5);
    for (const [qx, qy] of points) ctx.fillRect(qx - 1, qy - 1, 4, 4);
    points.forEach(([qx, qy], i) => {
      ctx.fillStyle = lit(i < length * 0.6 ? COLORS.o : COLORS.b, 0.5);
      ctx.fillRect(qx, qy, 2, 2);
    });
  }

  function drawLegs(x, y, flip, frame) {
    for (const leg of LEGS) {
      const off = frame < 0 ? 0 : STRIDE[frame][leg.pair];
      const lifted = (frame === 1 && leg.pair === 0) || (frame === 3 && leg.pair === 1);
      const len = lifted ? 2 : 3;
      const lx = leg.at + off;
      const px = x + (flip ? WALK[0].length - 2 - lx : lx);
      ctx.fillStyle = lit(COLORS[leg.c], 0.5);
      ctx.fillRect(px, y + 9, 2, len - 1);
      ctx.fillStyle = lit(COLORS.k, 0.5);
      ctx.fillRect(px, y + 8 + len, 2, 1);
    }
  }

  function drawCat(t) {
    const x = Math.round(cat.x);
    const top = CB - 11;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(x + 2, CB + 1, 20, 1);

    if (cat.state === 'rest' || cat.state === 'alert' || cat.state === 'sleep') {
      const asleep = cat.state === 'sleep';
      if (!asleep) drawTail(x + 1, top + 8, 1, Math.PI, 0.17, 0.9, t);
      sprite(LYING, x, top, false, asleep ? ASLEEP : cat.blink > 0 ? BLINK : null);
      if (asleep) drawTail(x + 2, top + 9, 1, 1.25, -0.13, 0.25, t * 0.5, 13);
      if (cat.state === 'alert') sprite(BANG, x + 19, top - 7);
      return;
    }

    const flip = cat.dir < 0;
    const bob = cat.moving && cat.state === 'chase' ? Math.floor(cat.step) % 2 : 0;
    const hop = cat.hop > 0 ? Math.round(Math.sin(Math.PI * (cat.hop / 0.45)) * 7) : 0;
    const y = top - bob - hop;
    drawTail(flip ? x + 20 : x + 1, y + 5, flip ? -1 : 1, Math.PI + 1, 0.1, 0.5, t);
    drawLegs(x, y, flip, cat.moving ? Math.floor(cat.step) % 4 : -1);
    sprite(WALK, x, y, flip, cat.blink > 0 ? WALK_BLINK : null);
  }

  function drawMug(t) {
    const mx = homeX + 25, my = CB - 4;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(mx, CB + 1, 7, 1);
    sprite(MUG, mx, my);
    // Steam from the warm milk
    for (let k = 0; k < 3; k++) {
      const rise = (t * 5 + k * 2.4) % 7;
      const sx = mx + 1 + k + Math.round(Math.sin(t * 2 + k + rise * 0.7));
      ctx.fillStyle = `rgba(255, 255, 255, ${0.6 * (1 - rise / 7)})`;
      ctx.fillRect(sx, Math.round(my - 1 - rise), 1, 1);
    }
  }

  function drawFlyAndZeds() {
    if (fly) {
      const open = Math.sin(fly.t * 22) > 0;
      sprite(open ? WINGS_OPEN : WINGS_SHUT, Math.round(fly.x) - 2, Math.round(fly.y) - 1, false, null, 0.6);
    }
    for (const z of zeds) {
      ctx.globalAlpha = Math.min(1, (2.6 - z.t) / 1.2) * 0.9;
      sprite(ZED, Math.round(z.x + z.t * 2 + Math.sin(z.t * 3)), Math.round(z.y - z.t * 5), false, null, 0.7);
      ctx.globalAlpha = 1;
    }
  }

  // ----- One frame -----
  function render(t, dt, snap = false) {
    updateLight(dt, snap);
    const w = wind(t);
    ctx.drawImage(skyLayer, 0, 0);
    drawSkyLights(t);
    drawClouds(dt, w);
    ctx.drawImage(landLayer, 0, 0);
    drawFlowers(t, w);
    drawPollen(t, dt, w);
    updateCat(dt);
    updateFly(dt);
    ctx.save();
    ctx.scale(S, S);
    drawMug(t);
    drawCat(t);
    drawFlyAndZeds();
    ctx.restore();
    drawFireflies(t);
  }

  // ----- Size, start and stop -----
  let clock = 0;
  function resize() {
    const box = hero.getBoundingClientRect();
    PX = clamp(Math.round(box.height / 220), 2, 6);
    W = Math.ceil(box.width / PX);
    H = Math.ceil(box.height / PX);
    canvas.width = skyLayer.width = landLayer.width = W;
    canvas.height = landLayer.height = H;
    canvas.style.width = W * PX + 'px';
    canvas.style.height = H * PX + 'px';
    horizon = Math.round(H * 0.6);
    skyLayer.height = horizon;
    pathTop = H - 16;
    baseY = H - 5;
    S = W >= 200 ? 2 : 1;
    CW = Math.floor(W / S);
    CB = Math.floor(baseY / S);
    homeX = Math.round(CW / 2 - 16);
    cat.x = cat.state === 'rest' || cat.state === 'sleep' || cat.state === 'alert' ? homeX : clamp(cat.x, 1, CW - 23);
    build();
    paintedAt = null;
    render(clock, 0);
  }

  let frame = 0, last = 0, onScreen = true;
  function tick(now) {
    frame = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    if (dt < 1 / 32) return; // about 30 frames a second is plenty for pixel art
    last = now;
    clock += dt;
    render(clock, dt);
  }
  function start() {
    if (frame || reduceMotion || !onScreen || document.hidden) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  // ----- Live clock and the Live / Day / Dusk / Night menu -----
  const control = hero.querySelector('.sky-control');
  if (control) {
    const button = control.querySelector('.sky-button');
    const menu = control.querySelector('.sky-menu');
    const timeText = control.querySelector('.sky-time');
    const modeText = control.querySelector('.sky-mode');
    const choices = [...menu.querySelectorAll('[data-mode]')];
    const tuzlaTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sarajevo', hour: '2-digit', minute: '2-digit' });

    const showMode = () => {
      modeText.textContent = mode[0].toUpperCase() + mode.slice(1);
      control.classList.toggle('is-live', mode === 'live');
      for (const choice of choices) choice.setAttribute('aria-pressed', String(choice.dataset.mode === mode));
    };
    const showTime = () => {
      timeText.textContent = tuzlaTime.format(new Date());
    };
    const openMenu = (open) => {
      menu.hidden = !open;
      button.setAttribute('aria-expanded', String(open));
    };

    try {
      const saved = localStorage.getItem('sky-mode');
      if (saved === 'live' || saved in MODE_ALTITUDE) mode = saved;
    } catch {
      // No saved choice (private window or blocked storage): stay on Live
    }
    showMode();
    showTime();
    setInterval(showTime, 1000);

    button.addEventListener('click', () => openMenu(menu.hidden));
    menu.addEventListener('click', (event) => {
      const choice = event.target.closest('[data-mode]');
      if (!choice) return;
      mode = choice.dataset.mode;
      try {
        localStorage.setItem('sky-mode', mode);
      } catch {
        // The choice just won't be remembered next time
      }
      showMode();
      openMenu(false);
      button.focus();
      if (reduceMotion) render(clock, 0, true);
    });
    document.addEventListener('click', (event) => {
      if (!control.contains(event.target)) openMenu(false);
    });
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        openMenu(false);
        button.focus();
      }
    });
  }

  updateLight(0, true);
  if (light.night > 0.55) cat.state = 'sleep';
  new ResizeObserver(resize).observe(hero);
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    onScreen ? start() : stop();
  }).observe(hero);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  // With reduced motion the scene stays still, and only the light updates
  if (reduceMotion) setInterval(() => render(clock, 0), 60000);
  start();
})();
