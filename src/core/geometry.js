/* هندسة القص — نقية بلا DOM */

/* حدود المحتوى: مسح من الأطراف نحو الداخل مع توقف مبكر وتسامح مع الضجيج. data = RGBA */
export function boundsFromData(data, w, h, thr) {
  const tolR = Math.max(1, Math.round(w * 0.002));
  const isContent = (i) => data[i + 3] >= 10 && !(data[i] > thr && data[i + 1] > thr && data[i + 2] > thr);
  const rowHas = (y) => {
    let c = 0; const base = y * w * 4;
    for (let x = 0; x < w; x++) if (isContent(base + x * 4) && ++c >= tolR) return true;
    return false;
  };
  let top = 0;
  while (top < h && !rowHas(top)) top++;
  if (top >= h) return null;
  let bottom = h - 1;
  while (bottom > top && !rowHas(bottom)) bottom--;
  const tolC = Math.max(1, Math.min(Math.round(h * 0.002), bottom - top + 1));
  const colHas = (x) => {
    let c = 0;
    for (let y = top; y <= bottom; y++) if (isContent((y * w + x) * 4) && ++c >= tolC) return true;
    return false;
  };
  let left = 0;
  while (left < w && !colHas(left)) left++;
  if (left >= w) return null;
  let right = w - 1;
  while (right > left && !colHas(right)) right--;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/* srcRect: القيم بوحدة 1/1000 من الواحد في المئة (100000 = 100%). السالب (حشو) يُعامل كصفر */
export function cropRect(W, H, crop) {
  if (!crop) return null;
  const f = (v) => Math.min(1, Math.max(0, (v || 0) / 100000));
  const l = f(crop.l), t = f(crop.t), r = f(crop.r), b = f(crop.b);
  if (!(l || t || r || b)) return null;
  const x = Math.round(l * W), y = Math.round(t * H);
  const w = W - x - Math.round(r * W), h = H - y - Math.round(b * H);
  if (w < 1 || h < 1) return null;
  if (w === W && h === H) return null;
  return { x, y, w, h };
}
