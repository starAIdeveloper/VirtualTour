export function gray(image) {
  const out = new Float32Array(image.width * image.height);
  for (let i = 0; i < out.length; i++)
    out[i] =
      (0.299 * image.data[i * 4] +
        0.587 * image.data[i * 4 + 1] +
        0.114 * image.data[i * 4 + 2]) /
      255;
  return out;
}
export function corners(image, limit = 180) {
  const { width: w, height: h } = image,
    g = gray(image),
    gx = new Float32Array(w * h),
    gy = new Float32Array(w * h),
    scores = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      gx[i] = (g[i + 1] - g[i - 1]) / 2;
      gy[i] = (g[i + w] - g[i - w]) / 2;
    }
  for (let y = 5; y < h - 5; y += 2)
    for (let x = 5; x < w - 5; x += 2) {
      let a = 0,
        b = 0,
        c = 0;
      for (let yy = -1; yy <= 1; yy++)
        for (let xx = -1; xx <= 1; xx++) {
          const i = (y + yy) * w + x + xx;
          a += gx[i] ** 2;
          b += gx[i] * gy[i];
          c += gy[i] ** 2;
        }
      const score = a * c - b * b - 0.04 * (a + c) ** 2;
      if (score > 0.00003) scores.push({ x, y, score });
    }
  scores.sort((a, b) => b.score - a.score);
  const points = [];
  for (const p of scores) {
    if (points.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 8)) continue;
    const patch = [];
    let mean = 0;
    for (let yy = -3; yy <= 3; yy++)
      for (let xx = -3; xx <= 3; xx++) {
        const v = g[(p.y + yy) * w + p.x + xx];
        patch.push(v);
        mean += v;
      }
    mean /= patch.length;
    const norm = Math.sqrt(patch.reduce((s, v) => s + (v - mean) ** 2, 0)) || 1;
    p.descriptor = patch.map((v) => (v - mean) / norm);
    points.push(p);
    if (points.length >= limit) break;
  }
  return points;
}
export function match(a, b) {
  const result = [];
  for (const p of a) {
    let best = Infinity,
      second = Infinity,
      target = null;
    for (const q of b) {
      let d = 0;
      for (let i = 0; i < p.descriptor.length; i++)
        d += (p.descriptor[i] - q.descriptor[i]) ** 2;
      if (d < best) {
        second = best;
        best = d;
        target = q;
      } else second = Math.min(second, d);
    }
    if (target && best < second * 0.65 && best < 1.2)
      result.push({ a: p, b: target, distance: best });
  }
  const used = new Set();
  return result
    .sort((a, b) => a.distance - b.distance)
    .filter((m) => {
      if (used.has(m.b)) return false;
      used.add(m.b);
      return true;
    });
}
export function translation(matches) {
  if (matches.length < 3) return null;
  const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)],
    dx = median(matches.map((m) => m.a.x - m.b.x)),
    dy = median(matches.map((m) => m.a.y - m.b.y)),
    inliers = matches.filter(
      (m) => Math.hypot(m.a.x - m.b.x - dx, m.a.y - m.b.y - dy) <= 6,
    );
  return {
    dx,
    dy,
    inliers: inliers.length,
    total: matches.length,
    rms: inliers.length
      ? Math.sqrt(
          inliers.reduce(
            (s, m) => s + (m.a.x - m.b.x - dx) ** 2 + (m.a.y - m.b.y - dy) ** 2,
            0,
          ) / inliers.length,
        )
      : null,
  };
}
export function blend(images, overlap = 0.25) {
  if (
    !Array.isArray(images) ||
    images.length < 2 ||
    images.length > 8 ||
    !Number.isFinite(overlap) ||
    overlap < 0.05 ||
    overlap > 0.75
  )
    throw Error("Use 2–8 images with 5–75% overlap");
  const h = images[0].height;
  if (
    images.some(
      (im) =>
        im.height !== h || im.width < 8 || im.data.length !== im.width * h * 4,
    )
  )
    throw Error("Incompatible images");
  let width = images[0].width;
  const offsets = [0];
  for (let i = 1; i < images.length; i++) {
    const shift = Math.round(images[i - 1].width * (1 - overlap));
    offsets.push(offsets[i - 1] + shift);
    width = Math.max(width, offsets[i] + images[i].width);
  }
  if (width * h > 8000000) throw Error("Output exceeds 8 megapixels");
  const values = new Float32Array(width * h * 3),
    weights = new Float32Array(width * h);
  images.forEach((im, k) => {
    const feather = Math.max(1, Math.round(im.width * overlap));
    for (let y = 0; y < h; y++)
      for (let x = 0; x < im.width; x++) {
        let weight = 1;
        if (k > 0) weight = Math.min(weight, (x + 1) / feather);
        if (k < images.length - 1)
          weight = Math.min(weight, (im.width - x) / feather);
        const to = y * width + offsets[k] + x,
          from = (y * im.width + x) * 4;
        for (let c = 0; c < 3; c++)
          values[to * 3 + c] += im.data[from + c] * weight;
        weights[to] += weight;
      }
  });
  const data = new Uint8ClampedArray(width * h * 4);
  for (let i = 0; i < weights.length; i++) {
    for (let c = 0; c < 3; c++)
      data[i * 4 + c] = values[i * 3 + c] / (weights[i] || 1);
    data[i * 4 + 3] = 255;
  }
  return { width, height: h, data };
}
