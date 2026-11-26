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
  };
  const FLOWER = {
    y: '#ffd43b', Y: '#f4a91c', b: '#7b4a1f', B: '#4d2b10', stem: '#4c8a2c', leaf: '#69a93b',
  };
  const COLORS = {
    k: '#2b1d17', w: '#f7ecdc', s: '#e3cfb6', o: '#e08238', O: '#b35e26', b: '#7d5a48', B: '#5e4235',
    p: '#f2a3a3', g: '#2f5c9e', m: '#fff4dc', M: '#f1dfbd', a: '#ff8fb1',
    // Pink cat-face bowl
    r: '#c9627a', q: '#f6a5b8', Q: '#ffd0dc', x: '#fffaf4',
    // Butterfly with pale, see-through fairy wings
    e: '#5f86bd', i: '#dcefff', v: '#3d3550',
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
  // Her bowl of warm milk: pink on top, a white cat face underneath
  const BOWL = [
    '.rrrrrrrrrrr.',
    'rQmmmmmmmmmQr',
    'rqMmmmmmmmMqr',
    'rqqxqqqqqxqqr',
    '.rxxxqqqxxxr.',
    '.rxxrxxxrxxr.',
    '..rqxxrxxqr..',
    '...rrrrrrr...',
  ];
  const LITTLE_HEART = ['a.a', 'aaa', '.a.'];
  const WINGS_OPEN = ['ee...ee', 'eieveie', 'eiiviie', '.eivie.', '..e.e..'];
  const WINGS_SHUT = ['.e...e.', '.eivie.', '..eve..', '...v...', '.......'];
  const BANG = ['k', 'k', 'k', '.', 'k'];
  const ZED = ['wwwww', '...w.', '..w..', '.w...', 'wwwww'];
  const HEART = ['aa.aa', 'aaaaa', '.aaa.', '..a..'];
  const HEADS = {
    1: ['.y.', 'yby', '.y.'],
    2: ['.yYy.', 'yybyy', 'YbBbY', 'yybyy', '.yYy.'],
    3: ['..yYy..', '.yyyyy.', 'yYbbbYy', 'yybBbyy', 'yYbbbYy', '.yyyyy.', '..yYy..'],
  };
  function sprite(rows, x, y, flip = false, swap = null, lift = 0.6) {
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
  // baseY is the ground line the cat lies on, partway down the field
  // The canvas has FINE x FINE real pixels per scene pixel, so the cat can be drawn in more detail
  const FINE = 2;
  let W = 0, H = 0, PX = 4, horizon = 0, baseY = 0, homeX = 0, frontRow = 0;
  let stars = [], clouds = [], rows = [], specks = [], fireflies = [], pollen = [];
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

    specks = Array.from({ length: Math.round(W * (H - horizon) / 14) }, () => ({
      x: Math.floor(r() * W), y: horizon + Math.floor(r() * (H - horizon)), light: r() < 0.3,
    }));

    // Sunflowers in rows, small and dense at the back, big at the front.
    // The front rows start below the screen so their heads fill the bottom.
    rows = [];
    for (let y = horizon + 2; y < H + 24; ) {
      const d = (y - horizon) / (H - horizon);
      const gap = 4 + Math.min(d, 1) * 9;
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
    // Rows from here on are in front of the cat
    frontRow = rows.findIndex((row) => row[0].y > baseY);
    if (frontRow < 0) frontRow = rows.length;

    // Fireflies: a little cloud of them around the cat, the rest over the field and sky
    fireflies = Array.from({ length: 30 }, (_, i) => {
      const near = i < 11;
      return {
        x: near ? (homeX + 14) + (r() - 0.5) * 60 : r() * W,
        y: near ? baseY - 6 - r() * 22 : horizon - 45 + r() * (H - horizon + 30),
        ax: 3 + r() * 7, ay: 2 + r() * 4, s1: 0.2 + r() * 0.45, s2: 0.6 + r() * 1.3, p: r() * 6.28,
      };
    });
    pollen = Array.from({ length: 16 }, () => ({ x: r() * W, y: horizon - 30 + r() * (H - horizon + 10), s: 0.5 + r(), p: r() * 6.28 }));
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
    for (let y = horizon; y < H; y++) {
      const v = ((y - horizon) / (H - horizon)) * 2;
      for (let x = 0; x < W; x++) {
        const band = Math.floor(v);
        put(x, y, bands[Math.min(2, band + (v - band > bayer(x, y) ? 1 : 0))]);
      }
    }
    for (const s of specks) put(s.x, s.y, s.light ? L.speckLight : L.speck);
    // The farthest sunflowers are just yellow dots, baked into the field
    const farYellow = tint(FLOWER.y);
    for (const row of rows) for (const f of row) if (f.size === 0) put(f.x, f.y - 1, farYellow);
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

    // Once the sun is well down, the rest of the page goes dark too
    const sky = alt < -3 ? 'night' : 'day';
    if (document.documentElement.dataset.sky !== sky) document.documentElement.dataset.sky = sky;
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

  // Draws flower rows [from, to). Flowers in front of the cat and her cup
  // bend aside and dip down, like a little nest, so she stays in view.
  function drawFlowers(t, w, from, to) {
    const sway = 0.25 + w * 0.75;
    const droop = Math.round(light.night * 1.2);
    const stem = lit(FLOWER.stem), leaf = lit(FLOWER.leaf);
    const nests = [[cat.x - 3, cat.x + 27], [homeX + 23, homeX + 39]];
    const catMiddle = cat.x + 12;
    for (let r = from; r < to; r++) {
      const row = rows[r];
      if (row[0].size === 0) continue;
      for (const f of row) {
        const amp = 0.4 + f.d * 2.6;
        // The sine travels across the field, so the wind looks like waves
        f.top = (Math.sin(t * 1.8 - f.x * 0.13 + f.p * 0.3) * sway + w * 0.7) * amp;
        f.len = f.h;
        if (f.y > baseY) {
          const gap = Math.min(...nests.map(([a, b]) => (f.x < a ? a - f.x : f.x > b ? f.x - b : 0)));
          const push = 1 - smooth(0, 9, gap);
          if (push > 0) {
            const half = (HEADS[f.size].length - 1) / 2;
            const low = Math.max(1, f.y - baseY - half - 1);
            f.len = Math.round(f.h + (Math.min(f.h, low) - f.h) * push);
            f.top += Math.sign(f.x - catMiddle) * push * 2.5;
          }
        }
      }
      ctx.fillStyle = stem;
      for (const f of row) {
        let from = 0, cur = 0;
        for (let j = 1; j <= f.len; j++) {
          const dx = j < f.len ? Math.round(f.top * (j / f.len) ** 2) : null;
          if (dx !== cur) {
            ctx.fillRect(f.x + cur, f.y - j + 1, 1, j - from);
            from = j;
            cur = dx;
          }
        }
      }
      ctx.fillStyle = leaf;
      for (const f of row) {
        if (f.size < 2 || f.len < 6) continue;
        const j = Math.round(f.len * 0.45);
        const lx = f.x + Math.round(f.top * (j / f.len) ** 2);
        ctx.fillRect(f.leaf > 0 ? lx + 1 : lx - 2, f.y - j, 2, 1);
        ctx.fillRect(f.leaf > 0 ? lx + 2 : lx - 2, f.y - j - 1, 1, 1);
      }
      for (const f of row) {
        const half = (HEADS[f.size].length - 1) / 2;
        ctx.drawImage(headLayers[f.size], f.x + Math.round(f.top) - half, f.y - f.len - half + droop);
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
    // When the Morse secret is solved, the fireflies gather into a heart
    // above the cat (even in daylight), then drift back home
    const gather = party > 0 ? smooth(0, 1.5, Math.min(PARTY - party, party)) : 0;
    const shown = Math.max(light.night, gather);
    if (shown < 0.02) return;
    const hx = (cat.x + 12), hy = (baseY - 26);
    fireflies.forEach((f, i) => {
      let x = f.x + Math.sin(t * f.s1 + f.p) * f.ax;
      let y = f.y + Math.cos(t * f.s1 * 1.3 + f.p) * f.ay;
      let glow = Math.max(0, Math.sin(t * f.s2 + f.p * 2));
      if (gather > 0) {
        const a = (i / fireflies.length) * Math.PI * 2;
        const px = 16 * Math.sin(a) ** 3;
        const py = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
        x += (hx + px * 1.1 - x) * gather;
        y += (hy + py * 1.1 - y) * gather;
        glow += (0.8 + 0.2 * Math.sin(t * 3 + i) - glow) * gather;
      }
      x = Math.round(x);
      y = Math.round(y);
      const a = shown * (0.2 + 0.8 * glow * glow);
      // Yellow glow at night; pink in daylight, so the heart shows on the sunflowers
      const pink = light.day * gather;
      ctx.fillStyle = css(mix([255, 244, 160], [255, 96, 150], pink), a);
      ctx.fillRect(x, y, 1, 1);
      if (glow > 0.6) {
        ctx.fillStyle = css(mix([214, 242, 107], [255, 170, 200], pink), a * (0.45 + 0.4 * pink));
        ctx.fillRect(x - 1, y, 1, 1);
        ctx.fillRect(x + 1, y, 1, 1);
        ctx.fillRect(x, y - 1, 1, 1);
        ctx.fillRect(x, y + 1, 1, 1);
      }
    });
  }

  // The firefly beside the cat that blinks MEOW in Morse code
  function drawMessenger(t) {
    if (light.night < 0.3 || party > 0) return;
    const x = Math.round((homeX + 30) + Math.sin(t * 0.5) * 4);
    const y = Math.round((baseY - 22) + Math.cos(t * 0.7) * 3);
    const a = light.night;
    if (!morseOn(t)) {
      ctx.fillStyle = `rgba(255, 236, 150, ${0.15 * a})`;
      ctx.fillRect(x, y, 1, 1);
      return;
    }
    ctx.fillStyle = `rgba(255, 214, 92, ${0.35 * a})`;
    ctx.fillRect(x - 2, y - 1, 5, 3);
    ctx.fillRect(x - 1, y - 2, 3, 5);
    ctx.fillStyle = `rgba(255, 250, 200, ${a})`;
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
  }

  // ----- The cat, her milk and the butterfly -----
  const cat = { x: 0, dir: 1, state: 'rest', t: 0, step: 0, hop: 0, cool: 0, blink: 0, nextBlink: 2, moving: false, happy: 0 };
  let fly = null;
  let nextVisit = 7;
  let zeds = [];
  let zedTimer = 0;
  let hearts = [];
  let heartTimer = 0;
  // Morse code secret state (see the secret section further down)
  const PARTY = 9;
  let party = 0;
  let marks = [];

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
        if (sleepy && cat.happy <= 0) setCat('sleep');
        break;
      case 'sleep':
        if (light.night < 0.4 || cat.happy > 0) setCat('rest');
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
        // Always face the butterfly (turning round if it flies over her back),
        // run forwards until her nose is just behind it, then pounce
        const offset = fly.x - (cat.x + 11);
        if (Math.abs(offset) > 3) cat.dir = Math.sign(offset);
        const target = clamp(cat.dir > 0 ? fly.x - 24 : fly.x + 2, 1, W - 23);
        if ((target - cat.x) * cat.dir > 0) moveCat(target, 34, dt, 15);
        const gap = cat.dir > 0 ? fly.x - (cat.x + 21) : cat.x - fly.x;
        if (gap > -3 && gap < 8 && fly.y > baseY - 30 && cat.cool <= 0 && cat.hop <= 0) {
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
        zeds.push({ x: cat.x + 19, y: baseY - 15, t: 0 });
        zedTimer = 1.8;
      }
    }
    zeds = zeds.filter((z) => (z.t += dt) < 2.6);

    // A happy cat (secret solved) sends little hearts up
    cat.happy = Math.max(0, cat.happy - dt);
    if (cat.happy > 0) {
      heartTimer -= dt;
      if (heartTimer <= 0) {
        hearts.push({ x: cat.x + 17 + Math.random() * 4, y: baseY - 15, t: 0 });
        heartTimer = 0.7;
      }
    }
    hearts = hearts.filter((h) => (h.t += dt) < 2.2);
    marks = marks.filter((m) => (m.t += dt) < 1.6);
  }

  function updateFly(dt) {
    if (!fly) {
      if (light.day > 0.7 && cat.state === 'rest') {
        nextVisit -= dt;
        if (nextVisit <= 0) {
          const fromLeft = Math.random() < 0.5;
          fly = { x: fromLeft ? -4 : W + 4, y: baseY - 34, tx: 0, ty: 0, t: 0, timer: 0, phase: 'arrive' };
        }
      }
      return;
    }

    fly.t += dt;
    const headX = cat.x + 19, headY = baseY - 17;
    const near = (r) => Math.hypot(fly.tx - fly.x, fly.ty - fly.y) < r;
    const wander = () => {
      let x;
      do x = 6 + Math.random() * (W - 14);
      while (Math.abs(x - (cat.x + 11)) < 30 && W > 90);
      fly.tx = x;
      fly.ty = baseY - 16 - Math.random() * 16;
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

    const speed = { arrive: 26, tease: 14, flee: 27, leave: 24 }[fly.phase];
    const dx = fly.tx - fly.x, dy = fly.ty - fly.y;
    const dist = Math.hypot(dx, dy) || 1;
    const stepLen = Math.min(dist, speed * dt);
    fly.x += (dx / dist) * stepLen;
    fly.y += (dy / dist) * stepLen + Math.sin(fly.t * 8) * 0.35;
  }

  // ----- Painting the cat -----
  // She's drawn at FINE times the scene's detail. Each frame her pose is
  // painted from simple shapes (ellipses for body and head, rounded sticks
  // for legs, a chain of dots for the tail) into a grid of colour letters,
  // then given a thin outline. x points the way she faces; (0, 0) is the
  // ground under her middle.
  const GRID_W = 80, GRID_H = 56, GX = 40, GY = 52;
  const grid = new Array(GRID_W * GRID_H).fill('.');
  const inGrid = (x, y) => x + GX >= 0 && x + GX < GRID_W && y + GY >= 0 && y + GY < GRID_H;
  const at = (x, y) => (inGrid(x, y) ? grid[x + GX + (y + GY) * GRID_W] : '.');
  const plot = (x, y, c) => {
    if (inGrid(x, y)) grid[x + GX + (y + GY) * GRID_W] = c;
  };

  // Fill an ellipse. `color` is a letter or (x, y) => letter. With `over`,
  // it only paints on top of fur that's already there (for patches).
  function blob(cx, cy, rx, ry, color, over = false) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1 || (over && at(x, y) === '.')) continue;
        plot(x, y, typeof color === 'function' ? color(x, y) : color);
      }
    }
  }

  // A rounded stick from (x1, y1) to (x2, y2); `color` gets 0 at the top, 1 at the paw
  function limb(x1, y1, x2, y2, r, color) {
    const len2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
    for (let y = Math.floor(Math.min(y1, y2) - r); y <= Math.ceil(Math.max(y1, y2) + r); y++) {
      for (let x = Math.floor(Math.min(x1, x2) - r); x <= Math.ceil(Math.max(x1, x2) + r); x++) {
        const px = x + 0.5, py = y + 0.5;
        const t = clamp(((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / len2, 0, 1);
        if (Math.hypot(px - x1 - t * (x2 - x1), py - y1 - t * (y2 - y1)) <= r) plot(x, y, color(t));
      }
    }
  }

  function triangle(ax, ay, bx, by, cx, cy, color) {
    const side = (x1, y1, x2, y2, x, y) => (x2 - x1) * (y - y1) - (y2 - y1) * (x - x1);
    for (let y = Math.floor(Math.min(ay, by, cy)); y <= Math.ceil(Math.max(ay, by, cy)); y++) {
      for (let x = Math.floor(Math.min(ax, bx, cx)); x <= Math.ceil(Math.max(ax, bx, cx)); x++) {
        const px = x + 0.5, py = y + 0.5;
        const s1 = side(ax, ay, bx, by, px, py), s2 = side(bx, by, cx, cy, px, py), s3 = side(cx, cy, ax, ay, px, py);
        if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) plot(x, y, color);
      }
    }
  }

  // A banded calico tail: a chain of dots that curls and sways
  function tail(x, y, start, bend, sway, t, count) {
    let a = start;
    for (let i = 0; i < count; i++) {
      a += bend + Math.sin(t * 2.1 - i * 0.45) * sway * (i / count);
      x += Math.cos(a) * 1.5;
      y += Math.sin(a) * 1.5;
      blob(x, y, 1.9, 1.9, i >= count - 2 ? 'b' : Math.floor(i / 2) % 2 ? 'O' : 'o');
    }
  }

  function eye(x, y, closed) {
    if (closed) {
      plot(x, y + 1, 'k');
      plot(x + 1, y + 1, 'k');
      return;
    }
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) plot(x + dx, y + dy, 'g');
    plot(x + 1, y, 'x'); // a little shine
  }

  // Standing or walking, side view. `phase` turns the legs, `stride` is how far they swing.
  function paintStanding(t, phase, stride, blink) {
    const legLength = 11;
    const by = -(legLength + 6) - Math.abs(Math.sin(phase)) * stride * 0.15;
    const paw = (hx, offset) => [
      hx + Math.sin(phase + offset) * stride,
      -Math.max(0, Math.cos(phase + offset)) * stride * 0.55,
    ];
    // Diagonal pairs move together: far back + near front, far front + near back
    const leg = (hx, offset, top, bottom) => {
      const [px, py] = paw(hx, offset);
      limb(hx, by + 2, px, py - 2, 2.2, (s) => (s > 0.8 ? bottom : top));
    };
    leg(-8, Math.PI, 'O', 's');
    leg(6, 0, 's', 's');
    tail(-12, by - 3, Math.PI + 1.25, 0.07, 0.45, t, 12);
    blob(0, by, 12, 7, 'w');
    blob(-6, by - 2.5, 7.5, 5, 'o', true);
    blob(2.5, by - 5, 4.5, 2.5, 'b', true);
    blob(0, by + 4.5, 9.5, 2.4, 's', true);
    leg(-5, 0, 'o', 'w');
    leg(9, Math.PI, 'w', 'w');

    const hx = 12, hy = by - 7;
    triangle(hx - 6, hy - 4, hx - 1, hy - 6, hx - 5, hy - 11, 'b');
    triangle(hx, hy - 5, hx + 6, hy - 4, hx + 4, hy - 11, 'o');
    triangle(hx + 1.5, hy - 5, hx + 4.5, hy - 4.5, hx + 3.6, hy - 8.5, 'p');
    blob(hx, hy, 7, 6.3, (x, y) => (y < hy - 1 && x < hx + 4 ? 'o' : 'w'));
    blob(hx - 4, hy - 3, 3, 3.2, 'b', true);
    eye(hx + 2, hy - 1, blink);
    plot(hx + 6, hy + 1, 'p');
  }

  // Lying down like a loaf, head up and facing you, front paws stretched out
  function paintLying(t, blink, alert) {
    tail(-15, -3, Math.PI, 0.16, 0.9, t, 11);
    blob(-1, -6.5, 15, 6.5, 'w');
    blob(-8, -8.5, 7.5, 5, 'o', true);
    blob(0, -11.5, 4.5, 2.2, 'b', true);
    blob(-11, -4, 4.5, 3.5, 'o', true);
    blob(-2, -1.4, 13, 1.6, 's', true);
    blob(13, -1.8, 4, 1.9, 'w');
    blob(18, -1.8, 3.6, 1.9, 'w');
    plot(15, -2, 's');
    plot(15, -1, 's');

    const hx = 12, hy = alert ? -15 : -14;
    triangle(hx - 7, hy - 2, hx - 2, hy - 5.5, hx - 6, hy - 11, 'o');
    triangle(hx - 5.6, hy - 4, hx - 3, hy - 5.2, hx - 5.2, hy - 8.4, 'p');
    triangle(hx + 2, hy - 5.5, hx + 7, hy - 2, hx + 6, hy - 11, 'b');
    blob(hx, hy, 7.5, 6.5, (x, y) => (y < hy - 2 ? 'o' : 'w'));
    blob(hx + 4.5, hy - 3.5, 3.5, 3, 'b', true);
    eye(hx - 4, hy - 1, blink);
    eye(hx + 2, hy - 1, blink);
    plot(hx - 1, hy + 2, 'p');
    plot(hx, hy + 2, 'p');
    plot(hx - 2, hy + 3, 's');
    plot(hx + 1, hy + 3, 's');
  }

  // Asleep: curled into a ball, head tucked in, striped tail wrapped round the front
  function paintCurled(t) {
    const breath = Math.sin(t * 1.4) * 0.5;
    blob(-1, -9, 16, 9 + breath, 'w');
    blob(-9, -11, 8, 6, 'o', true);
    blob(-1, -16 - breath, 5, 2.6, 'b', true);
    blob(-13, -5, 4, 3.5, 'o', true);
    blob(-2, -6, 13, 2.2, 's', true);
    for (let x = -13; x <= 8; x++) {
      blob(x, -2.6, 0.8, 2.3, x > 4 ? 's' : Math.floor((x + 13) / 3) % 2 ? 'O' : 'o');
    }

    const hx = 9, hy = -9;
    triangle(hx + 1, hy - 5, hx + 7, hy - 3, hx + 6, hy - 10, 'o');
    triangle(hx + 2.6, hy - 4.6, hx + 5.6, hy - 3.6, hx + 5.2, hy - 7.4, 'p');
    triangle(hx - 5, hy - 4, hx - 1, hy - 6, hx - 4, hy - 10, 'b');
    blob(hx, hy, 7, 6.2, (x, y) => (y < hy - 1 ? 'o' : 'w'));
    for (let x = hx - 3; x <= hx + 1; x += 2) {
      if (at(x, hy - 4) === 'o') plot(x, hy - 4, 'b');
      if (at(x, hy - 3) === 'o') plot(x, hy - 3, 'b');
    }
    plot(hx - 1, hy + 1, 'k');
    plot(hx, hy + 2, 'k');
    plot(hx + 1, hy + 2, 'k');
    plot(hx + 2, hy + 1, 'k');
    plot(hx + 5, hy + 2, 'p');
  }

  // A thin dark line all the way round her
  function outline() {
    const edges = [];
    for (let y = -GY; y < GRID_H - GY; y++) {
      for (let x = -GX; x < GRID_W - GX; x++) {
        if (at(x, y) !== '.') continue;
        if (at(x + 1, y) !== '.' || at(x - 1, y) !== '.' || at(x, y + 1) !== '.' || at(x, y - 1) !== '.') edges.push([x, y]);
      }
    }
    for (const [x, y] of edges) plot(x, y, 'k');
  }

  function drawCat(t) {
    grid.fill('.');
    const lying = cat.state === 'rest' || cat.state === 'alert' || cat.state === 'sleep';
    if (cat.state === 'sleep') paintCurled(t);
    else if (lying) paintLying(t, cat.blink > 0, cat.state === 'alert');
    else {
      const running = cat.state === 'chase';
      paintStanding(t, cat.step * 0.9, cat.moving ? (running ? 4.5 : 3) : 0, cat.blink > 0);
    }
    outline();

    // Draw the grid at full detail, one colour at a time
    const ox = Math.round((cat.x + 12) * FINE);
    const ground = (baseY + 1) * FINE;
    const hop = cat.hop > 0 ? Math.round(Math.sin(Math.PI * (cat.hop / 0.45)) * 7 * FINE) : 0;
    const flip = !lying && cat.dir < 0;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(ox - 16, ground - 1, 32, 2);
    const byColor = {};
    grid.forEach((c, i) => {
      if (c !== '.') (byColor[c] ||= []).push(i);
    });
    for (const c in byColor) {
      ctx.fillStyle = lit(COLORS[c], 0.6);
      for (const i of byColor[c]) {
        const x = (i % GRID_W) - GX, y = Math.floor(i / GRID_W) - GY;
        ctx.fillRect(ox + (flip ? -x - 1 : x), ground + y - hop, 1, 1);
      }
    }
    ctx.restore();
    if (cat.state === 'alert') sprite(BANG, Math.round(cat.x) + 18, baseY - 19);
  }

  // A patch of flattened grass where she naps, so she stands out from the flowers
  function drawNest() {
    const cx = homeX + 16, rx = 21, ry = 3.5;
    ctx.fillStyle = lit('#8cc257');
    for (let y = -4; y <= 4; y++) {
      for (let x = -rx - 2; x <= rx + 2; x++) {
        const d = (x / rx) ** 2 + (y / ry) ** 2;
        if (d < 1 - bayer(cx + x, baseY + y) * 0.45) ctx.fillRect(cx + x, baseY + y, 1, 1);
      }
    }
  }

  function drawBowl(t) {
    const bx = homeX + 25, by = baseY - 7;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    ctx.fillRect(bx + 3, baseY + 1, 7, 1);
    sprite(BOWL, bx, by);
    // A wisp of steam from the warm milk, and a little heart bobbing above
    for (let k = 0; k < 2; k++) {
      const rise = (t * 4 + k * 3.5) % 7;
      const sx = bx + 4 + k * 4 + Math.round(Math.sin(t * 2 + k + rise * 0.7));
      ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * (1 - rise / 7)})`;
      ctx.fillRect(sx, Math.round(by - 1 - rise), 1, 1);
    }
    sprite(LITTLE_HEART, bx + 5, by - 6 + Math.round(Math.sin(t * 1.6)), false, null, 0.8);
  }

  function drawFlyAndFloaters() {
    if (fly) {
      const open = Math.sin(fly.t * 22) > 0;
      ctx.globalAlpha = 0.9; // the wings are a little see-through
      sprite(open ? WINGS_OPEN : WINGS_SHUT, Math.round(fly.x) - 3, Math.round(fly.y) - 2, false, null, 0.7);
      ctx.globalAlpha = 1;
    }
    for (const z of zeds) {
      ctx.globalAlpha = Math.min(1, (2.6 - z.t) / 1.2) * 0.9;
      sprite(ZED, Math.round(z.x + z.t * 2 + Math.sin(z.t * 3)), Math.round(z.y - z.t * 5), false, null, 0.7);
      ctx.globalAlpha = 1;
    }
    for (const h of hearts) {
      ctx.globalAlpha = Math.min(1, (2.2 - h.t) / 0.8);
      sprite(HEART, Math.round(h.x + Math.sin(h.t * 4) * 1.5), Math.round(h.y - h.t * 7), false, null, 0.8);
      ctx.globalAlpha = 1;
    }
    // The dots and dashes a visitor taps, floating up above the cat
    for (const m of marks) {
      ctx.fillStyle = `rgba(255, 246, 214, ${1 - m.t / 1.6})`;
      ctx.fillRect(Math.round(m.x), Math.round(baseY - 19 - m.t * 6), m.sym === '.' ? 1 : 3, 1);
    }
  }

  // ----- One frame -----
  function render(t, dt, snap = false) {
    updateLight(dt, snap);
    // The scene is drawn at its own pixel size; the cat (drawCat) uses the finer one
    ctx.setTransform(FINE, 0, 0, FINE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const w = wind(t);
    ctx.drawImage(skyLayer, 0, 0);
    drawSkyLights(t);
    drawClouds(dt, w);
    ctx.drawImage(landLayer, 0, 0);
    updateCat(dt);
    updateFly(dt);
    // The cat and her cup sit between the flowers behind and in front of her
    drawFlowers(t, w, 0, frontRow);
    drawNest();
    drawBowl(t);
    drawCat(t);
    drawFlowers(t, w, frontRow, rows.length);
    drawPollen(t, dt, w);
    drawFlyAndFloaters();
    party = Math.max(0, party - dt);
    drawFireflies(t);
    drawMessenger(t);
  }

  // ----- Size, start and stop -----
  let clock = 0;
  function resize() {
    const box = hero.getBoundingClientRect();
    PX = clamp(Math.round(box.height / 220), 2, 6);
    W = Math.ceil(box.width / PX);
    H = Math.ceil(box.height / PX);
    skyLayer.width = landLayer.width = W;
    canvas.width = W * FINE;
    landLayer.height = H;
    canvas.height = H * FINE;
    canvas.style.width = W * PX + 'px';
    canvas.style.height = H * PX + 'px';
    horizon = Math.round(H * 0.6);
    skyLayer.height = horizon;
    baseY = Math.round(horizon + (H - horizon) * 0.68);
    homeX = Math.round(W / 2 - 16);
    cat.x = cat.state === 'rest' || cat.state === 'sleep' || cat.state === 'alert' ? homeX : clamp(cat.x, 1, W - 23);
    zeds = [];
    hearts = [];
    marks = [];
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

  // ----- Morse code secret -----
  // At night the firefly beside the cat blinks MEOW in Morse code. Answer
  // her in Morse (tap the cat: a quick tap is a dot, a longer press is a
  // dash, or type . and -) and every firefly gathers into a heart.
  const MORSE = { M: '--', E: '.', O: '---', W: '.--' };
  const SECRET_WORD = 'MEOW';
  const ANSWER = [...SECRET_WORD].map((letter) => MORSE[letter]).join('');
  const UNIT = 0.3; // seconds in one Morse "dot"
  // The blink pattern as [light on?, length in units]: 1 for a dot, 3 for a
  // dash, 1 between signals, 3 between letters, a long rest before repeating
  const BLINKS = [];
  [...SECRET_WORD].forEach((letter, li) => {
    [...MORSE[letter]].forEach((signal, si, all) => {
      BLINKS.push([true, signal === '.' ? 1 : 3]);
      BLINKS.push([false, si < all.length - 1 ? 1 : li < SECRET_WORD.length - 1 ? 3 : 10]);
    });
  });
  const BLINK_UNITS = BLINKS.reduce((sum, [, length]) => sum + length, 0);

  function morseOn(t) {
    let u = (t / UNIT) % BLINK_UNITS;
    for (const [on, length] of BLINKS) {
      if (u < length) return on;
      u -= length;
    }
    return false;
  }

  const toast = hero.querySelector('.secret-toast');
  let taps = '', lastTap = 0, pressedAt = 0;

  function overCat(event) {
    const box = canvas.getBoundingClientRect();
    const x = (event.clientX - box.left) / PX;
    const y = (event.clientY - box.top) / PX;
    return x > cat.x - 3 && x < cat.x + 27 && y > baseY - 16 && y < baseY + 3;
  }

  function answer(signal) {
    const now = performance.now();
    if (now - lastTap > 2500) taps = '';
    lastTap = now;
    taps = (taps + signal).slice(-ANSWER.length);
    marks.push({ sym: signal, x: cat.x + 2 + (taps.length - 1) * 2.5, t: 0 });
    if (taps === ANSWER) celebrate();
    if (reduceMotion) render(clock, 0);
  }

  function celebrate() {
    taps = '';
    party = PARTY;
    cat.happy = PARTY;
    if (!toast) return;
    toast.textContent = 'You speak firefly. She says meow back ♥';
    toast.classList.add('is-shown');
    setTimeout(() => toast.classList.remove('is-shown'), 6000);
  }

  hero.addEventListener('pointerdown', (event) => {
    if (event.target.closest('a, button') || !overCat(event)) return;
    pressedAt = performance.now();
  });
  hero.addEventListener('pointerup', () => {
    if (!pressedAt) return;
    answer(performance.now() - pressedAt < 220 ? '.' : '-');
    pressedAt = 0;
  });
  hero.addEventListener('pointercancel', () => {
    pressedAt = 0;
  });
  hero.addEventListener('pointermove', (event) => {
    hero.style.cursor = !event.target.closest('a, button') && overCat(event) ? 'pointer' : '';
  });
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]')) return;
    if (event.key === '.' || event.key === '-') answer(event.key);
  });

  // The only clue, for anyone curious enough to open the browser console
  console.log('%c✦ Psst. The fireflies are talking.', 'font: italic 16px Georgia, serif; color: #e5a50a;');
  console.log(
    '%cWatch the one beside the cat at night. She answers to taps.\n.-.. .. ... - . -.',
    'font: 12px monospace; color: #8a7a4a;'
  );

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
