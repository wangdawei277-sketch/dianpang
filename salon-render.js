(() => {
  'use strict';

  const styles = [
    { id: 'original', sides: '自然渐短', title: '原生短发', src: 'assets/salon/original.webp', mask: 'assets/salon/original-mask.png', length: '短发', curl: '微弯', fringe: '露额', part: '中分', tie: '不扎发' },
    { id: 'slick', sides: '自然渐短', title: '侧分背头', src: 'assets/salon/slick.webp', mask: 'assets/salon/slick-mask.png', length: '短发', curl: '直发', fringe: '露额', part: '侧分', tie: '不扎发' },
    { id: 'curls', sides: '保留两侧', title: '法式卷发', src: 'assets/salon/curls.webp', mask: 'assets/salon/curls-mask.png', length: '短发', curl: '卷发', fringe: '卷刘海', part: '自然散分', tie: '不扎发' },
    { id: 'bob', sides: '齐整侧发', title: '齐耳波波', src: 'assets/salon/bob.webp', mask: 'assets/salon/bob-mask.png', length: '齐耳', curl: '直发', fringe: '齐刘海', part: '中分', tie: '不扎发' },
    { id: 'buzz', sides: '渐变推短', title: '银灰寸头', src: 'assets/salon/buzz.webp', mask: 'assets/salon/buzz-mask.png', length: '寸头', curl: '直发', fringe: '露额', part: '无分缝', tie: '不扎发' },
    { id: 'bun', sides: '贴头收束', title: '武士丸子', src: 'assets/salon/bun.webp', mask: 'assets/salon/bun-mask.png', length: '长发（扎起）', curl: '直发', fringe: '露额', part: '后梳', tie: '丸子头' }
  ];
  styles.push(...window.DIANPANG_HAIRCLIP_STYLES);
  const modes = new Set(['original', 'solid', 'gradient', 'streaks', 'tips']);
  const sourceCache = new Map();
  const latestRequest = new WeakMap();
  let localPayload;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const mix = (a, b, amount) => a + (b - a) * amount;
  const luminance = (r, g, b) => (54 * r + 183 * g + 19 * b) / 256;
  function smooth(value) {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  }
  function valueInRange(value, fallback, min, max) {
    const number = Number(value ?? fallback);
    return Number.isFinite(number) ? clamp(number, min, max) : fallback;
  }
  function rgb(hex, fallback) {
    const valid = typeof hex === 'string' && /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
    const n = parseInt(valid.slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }

  function getLocalPayload() {
    if (window.DIANPANG_SALON_LOCAL) return Promise.resolve(window.DIANPANG_SALON_LOCAL);
    if (!localPayload) {
      localPayload = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'assets/salon/local-data.js';
        const finish = () => {
          script.remove();
          if (window.DIANPANG_SALON_LOCAL) resolve(window.DIANPANG_SALON_LOCAL);
          else reject(new Error('无法读取离线发型素材。'));
        };
        script.onload = script.onerror = finish;
        document.head.append(script);
      }).catch(error => { localPayload = null; throw error; });
    }
    return localPayload;
  }

  async function imageFrom(url) {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  }
  function pixelsOf(image) {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }
  function distribution(histogram, fraction, count) {
    let sum = 0;
    for (let i = 0; i < histogram.length; i++) {
      sum += histogram[i];
      if (sum >= count * fraction) return i;
    }
    return 255;
  }

  async function initialize(style) {
    let photo = style.src, maskUrl = style.mask;
    if (location.protocol === 'file:' && !/^(?:blob|data):/i.test(photo)) {
      const pair = (await getLocalPayload())[style.id];
      if (!Array.isArray(pair) || pair.length !== 2) throw new Error('缺少这款发型的离线素材。');
      photo = pair[0].startsWith('data:') ? pair[0] : 'data:image/webp;base64,' + pair[0];
      maskUrl = pair[1].startsWith('data:') ? pair[1] : 'data:image/png;base64,' + pair[1];
    }
    const [image, matte] = await Promise.all([imageFrom(photo), imageFrom(maskUrl)]);
    const width = image.naturalWidth, height = image.naturalHeight;
    if (matte.naturalWidth !== width || matte.naturalHeight !== height) throw new Error('发型蒙版和原照片尺寸不一致。');
    const pixels = pixelsOf(image), maskPixels = pixelsOf(matte);
    const mask = new Uint8Array(width * height), histogram = new Uint32Array(256);
    const top = new Int32Array(width).fill(height), bottom = new Int32Array(width).fill(-1);
    let x0 = width, y0 = height, x1 = -1, y1 = -1, count = 0;
    for (let i = 0; i < mask.length; i++) {
      const p = 4 * i;
      const a = Math.round(maskPixels[p] * maskPixels[p + 3] / 255);
      mask[i] = a;
      if (a < 3) continue;
      const x = i % width, y = Math.floor(i / width);
      x0 = Math.min(x, x0); x1 = Math.max(x, x1);
      y0 = Math.min(y, y0); y1 = Math.max(y, y1);
      if (a < 80) continue;
      top[x] = Math.min(top[x], y); bottom[x] = Math.max(bottom[x], y);
      histogram[Math.round(luminance(pixels[p], pixels[p + 1], pixels[p + 2]))]++;
      count++;
    }
    if (!count) throw new Error('发型蒙版中没有可用的头发区域。');
    return { id: style.id, pixels, frame: new ImageData(pixels, width, height), width, height, mask, top, bottom, x0, y0, x1, y1,
      median: distribution(histogram, .50, count), high: distribution(histogram, .94, count) };
  }

  function sourceFor(style) {
    let promise = sourceCache.get(style.id);
    if (promise) sourceCache.delete(style.id);
    else {
      promise = initialize(style).catch(error => {
        if (sourceCache.get(style.id) === promise) sourceCache.delete(style.id);
        throw error;
      });
    }
    sourceCache.set(style.id, promise);
    if (sourceCache.size > 3) sourceCache.delete(sourceCache.keys().next().value);
    return promise;
  }

  function streakPattern(style, u, depth) {
    // Follow curved locks outwards from the part. Unequal spacing and widths
    // avoid a repeated set of straight bands across the head.
    const part = style === 'slick' ? .74 : .49;
    const curve = style === 'curls' ? .074 : style === 'slick' ? .051 : .019;
    const lane = part + (u - part) / (.73 + .27 * depth) +
      curve * Math.sin(5.7 * depth + 11 * u);
    const stroke = (centre, width) => smooth(1 - Math.abs(lane - centre) / width);
    return Math.max(stroke(.15,.035), stroke(.24,.065), stroke(.43,.020),
      stroke(.53,.042), stroke(.73,.063), stroke(.87,.023));
  }

  function geometryFor(source, volume) {
    if (source.geometry?.volume === volume) return source.geometry;
    const { width, height, pixels, mask, x0, x1, y0, y1 } = source;
    const hairWidth = Math.max(1, x1 - x0), hairHeight = Math.max(1, y1 - y0);
    const centre = (x0 + x1) / 2;
    // Anchor the crown at its hairline. Long locks can extend below the chin.
    const hairline = Array.from(source.bottom.subarray(Math.floor(width * .45), Math.ceil(width * .55)))
      .filter(y => y > y0).sort((a, b) => a - b);
    const centreEdge = hairline.length ? hairline[Math.floor(hairline.length / 2)] : y1;
    const anchor = Math.max(y0 + 1, Math.min(y0 + .81 * hairHeight, centreEdge, height * .46));
    const grow = (volume - 100) / 100;
    // Preserve some air above the crown, even for a high bun near the edge.
    const lift = Math.min(grow * .79 * (anchor - y0), Math.max(0, y0 - 2) * .75);
    const yScale = 1 + lift / Math.max(1, anchor - y0);
    const xPad = Math.ceil(grow * hairWidth * .48) + 2;
    const left = Math.max(0, x0 - xPad), right = Math.min(width - 1, x1 + xPad);
    const upper = Math.max(0, y0 - Math.ceil(lift) - 2), lower = Math.min(height - 1, y1 + 1);
    const w = right - left + 1, h = lower - upper + 1, size = w * h;
    const base = new Uint8ClampedArray(size * 4);
    const coverage = new Uint8Array(size), tone = new Uint8Array(size);
    const depth = new Uint8Array(size), streak = new Uint8Array(size);
    const tipDye = new Uint8Array(size), tipSecond = new Uint8Array(size);

    for (let row = 0; row < h; row++) {
      const y = upper + row;
      const fy = clamp(y < anchor ? anchor + (y - anchor) / yScale : y, 0, height - 1);
      const ay = Math.floor(fy), by = Math.min(ay + 1, height - 1), ty = fy - ay;
      const crown = smooth((anchor - y) / Math.max(1, anchor - y0));
      const xScale = 1 + grow * (.34 + .53 * crown);
      const from = 4 * (y * width + left);
      base.set(pixels.subarray(from, from + w * 4), row * w * 4);
      for (let column = 0; column < w; column++) {
        const x = left + column, slot = row * w + column, p = 4 * slot;
        let fx = x, alpha = mask[y * width + x];
        if (volume !== 100) {
          // Sample premultiplied hair only. The original fringe fills areas
          // uncovered by expansion, without copying eyes or skin into the hair.
          fx = clamp(centre + (x - centre) / xScale, 0, width - 1);
          const ax = Math.floor(fx), bx = Math.min(ax + 1, width - 1), tx = fx - ax;
          const i0 = ay * width + ax, i1 = ay * width + bx;
          const i2 = by * width + ax, i3 = by * width + bx;
          const w0 = (1-tx) * (1-ty) * mask[i0], w1 = tx * (1-ty) * mask[i1];
          const w2 = (1-tx) * ty * mask[i2], w3 = tx * ty * mask[i3];
          const m = w0 + w1 + w2 + w3;
          if (m > 0) {
            for (let c = 0; c < 3; c++) {
              const hair = (w0 * pixels[4*i0+c] + w1 * pixels[4*i1+c] +
                w2 * pixels[4*i2+c] + w3 * pixels[4*i3+c]) / m;
              base[p+c] = mix(base[p+c], hair, m / 255);
            }
          }
          alpha = Math.max(alpha, Math.round(m));
        }
        if (!alpha) continue;
        coverage[slot] = alpha;
        tone[slot] = Math.round(luminance(base[p], base[p+1], base[p+2]));

        const u = clamp((fx - x0) / hairWidth, 0, 1);
        const globalDepth = clamp((fy - y0) / hairHeight, 0, 1);
        const sx = Math.round(fx), start = source.top[sx], end = source.bottom[sx];
        const localDepth = end - start > 8 ? clamp((fy - start) / (end - start), 0, 1) : globalDepth;
        const d = .32 * globalDepth + .68 * localDepth;
        depth[slot] = Math.round(255 * smooth((d - .12) / .76));
        const fiberLight = smooth((tone[slot] - source.median * .60) /
          Math.max(12, source.high - source.median * .60));
        const lock = streakPattern(source.id, u, d);
        streak[slot] = Math.round(255 * lock * (.22 + .72 * fiberLight));
        tipDye[slot] = Math.round(255 * smooth((d - .42) / .35));
        tipSecond[slot] = Math.round(255 * smooth((d - .70) / .24));
      }
    }
    source.geometry = { volume, left, upper, w, h, base, coverage, tone, depth, streak,
      tipDye, tipSecond, output: new ImageData(w, h) };
    return source.geometry;
  }

  function dyeTable(source, color) {
    const median = Math.max(8, source.median), high = Math.max(median + 8, source.high);
    const palette = new Float32Array(256 * 3);
    for (let value = 0; value < 256; value++) {
      // Anchor the dye to this photograph's actual shadow and highlight range.
      // The continuous response preserves individual dark and light hair strands.
      const upper = smooth((value - median) / (high - median));
      const beyond = smooth((value - high) / Math.max(1, 255 - high));
      const shade = value < median ? .08 + .59 * Math.pow(value / median, .72) :
        .67 + .24 * upper + .07 * beyond;
      const shine = .16 * upper + .45 * beyond;
      for (let c = 0; c < 3; c++) {
        const channel = color[c] * shade;
        palette[value * 3 + c] = mix(channel, 255, shine);
      }
    }
    return palette;
  }

  function paint(ctx, source, options) {
    ctx.putImageData(source.frame, 0, 0);
    const mode = modes.has(options.mode) ? options.mode : 'original';
    const volume = Math.round(valueInRange(options.volume, 100, 100, 115));
    const gloss = valueInRange(options.gloss, 0, 0, 100) / 100;
    if (mode === 'original' && volume === 100 && gloss === 0) return;

    const shape = geometryFor(source, volume);
    const { base, coverage, tone, output } = shape;
    const out = output.data;
    out.set(base);
    const colored = mode !== 'original';
    if (colored || gloss) {
      const first = dyeTable(source, rgb(options.primary, '#754336'));
      const second = dyeTable(source, rgb(options.secondary, '#d7a577'));
      const weights = mode === 'gradient' ? shape.depth :
        mode === 'streaks' ? shape.streak : mode === 'tips' ? shape.tipSecond : null;
      const saturation = colored ? valueInRange(options.saturation, 100, 0, 180) / 100 : 1;
      const lightness = colored ? valueInRange(options.lightness, 0, -40, 40) : 0;
      const gain = Math.pow(2, lightness / 62), add = Math.max(0, lightness) * .21;
      const shine = new Float32Array(256);
      if (gloss) {
        const floor = Math.max(0, source.median * .69);
        for (let y = 0; y < 256; y++) {
          shine[y] = gloss * .38 * smooth((y - floor) / Math.max(12, source.high - floor));
        }
      }
      for (let i = 0; i < coverage.length; i++) {
        if (!coverage[i]) continue;
        const p = 4*i, v = tone[i], key = 3*v;
        const twin = weights ? weights[i] / 255 : 0;
        const dye = !colored ? 0 : mode === 'tips' ? .96 * shape.tipDye[i] / 255 : .96;
        let r = mix(base[p], mix(first[key], second[key], twin), dye);
        let g = mix(base[p+1], mix(first[key+1], second[key+1], twin), dye);
        let b = mix(base[p+2], mix(first[key+2], second[key+2], twin), dye);
        const y = luminance(r, g, b), mask = coverage[i] / 255, highlight = shine[v];
        r = (y + (r-y) * saturation) * gain + add;
        g = (y + (g-y) * saturation) * gain + add;
        b = (y + (b-y) * saturation) * gain + add;
        out[p] = mix(base[p], mix(r, 255, highlight), mask);
        out[p+1] = mix(base[p+1], mix(g, 255, highlight), mask);
        out[p+2] = mix(base[p+2], mix(b, 255, highlight), mask);
      }
    }
    ctx.putImageData(output, shape.left, shape.upper);
  }

  async function render(canvas, styleId, options = {}) {
    const style = styles.find(item => item.id === styleId);
    if (!style) throw new Error('未知发型。');
    const token = {};
    latestRequest.set(canvas, token);
    const settings = { ...options };
    let source;
    try {
      source = await sourceFor(style);
    } catch (error) {
      if (latestRequest.get(canvas) !== token) return false;
      throw error;
    }
    if (latestRequest.get(canvas) !== token) return false;
    // Coalesce slider inputs that arrive in the same frame.
    if (!document.hidden) await new Promise(resolve => requestAnimationFrame(resolve));
    if (latestRequest.get(canvas) !== token) return false;
    if (canvas.width !== source.width) canvas.width = source.width;
    if (canvas.height !== source.height) canvas.height = source.height;
    const ctx = canvas.getContext('2d');
    paint(ctx, source, settings);
    return true;
  }

  window.PointSalon = Object.freeze({ styles, render });
})();
