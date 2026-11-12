/* خط معالجة الصورة (Canvas / OffscreenCanvas): يعمل داخل Worker وفي الخيط الرئيسي */
import { dhashFromGray } from './hash.js';
import { boundsFromData, cropRect } from './geometry.js';

const HAS_DOM = typeof document !== 'undefined';

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function ctx2d(c) { return c.getContext('2d', { willReadFrequently: true }); }
function canvasBlob(c, type, q) {
  if (c.convertToBlob) return c.convertToBlob({ type, quality: q });
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), type, q));
}

/* قلب ثم تدوير باتجاه عقارب الساعة (xf = { rot: 0|90|180|270, fh, fv }) */
function applyXform(c, xf) {
  const swap = xf.rot === 90 || xf.rot === 270;
  const o = makeCanvas(swap ? c.height : c.width, swap ? c.width : c.height);
  const x = ctx2d(o);
  x.translate(o.width / 2, o.height / 2);
  x.rotate((xf.rot * Math.PI) / 180);
  x.scale(xf.fh ? -1 : 1, xf.fv ? -1 : 1);
  x.drawImage(c, -c.width / 2, -c.height / 2);
  return o;
}

async function decodeSource(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); } catch (e) { /* SVG وبعض الصيغ → المسار الاحتياطي */ }
  }
  if (!HAS_DOM) throw new Error('decode failed');
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('decode failed'));
      i.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
}

function subCanvas(src, r) {
  const c = makeCanvas(r.w, r.h);
  ctx2d(c).drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return c;
}

/* تصغير تدريجي (نصف كل مرة) لتفادي الـ aliasing */
function downscaleTo(src, tw, th) {
  let cur = src;
  while (cur.width > tw * 2 || cur.height > th * 2) {
    const n = makeCanvas(Math.max(tw, Math.ceil(cur.width / 2)), Math.max(th, Math.ceil(cur.height / 2)));
    const nx = ctx2d(n);
    nx.fillStyle = '#fff'; nx.fillRect(0, 0, n.width, n.height);
    nx.imageSmoothingQuality = 'high';
    nx.drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
  }
  const f = makeCanvas(tw, th);
  const fx = ctx2d(f);
  fx.fillStyle = '#fff'; fx.fillRect(0, 0, tw, th);
  fx.imageSmoothingQuality = 'high';
  fx.drawImage(cur, 0, 0, tw, th);
  return f;
}

function computeSignature(canvas) {
  const g = ctx2d(downscaleTo(canvas, 9, 8)).getImageData(0, 0, 9, 8).data;
  const gray = [];
  for (let i = 0; i < g.length; i += 4) gray.push(g[i] * 0.299 + g[i + 1] * 0.587 + g[i + 2] * 0.114);
  const { lo, hi } = dhashFromGray(gray);
  const cd = ctx2d(downscaleTo(canvas, 4, 4)).getImageData(0, 0, 4, 4).data;
  const color = new Uint8Array(48);
  for (let i = 0, k = 0; i < cd.length; i += 4) { color[k++] = cd[i]; color[k++] = cd[i + 1]; color[k++] = cd[i + 2]; }
  return { lo, hi, color };
}

async function makeThumbBlob(canvas) {
  const s = Math.min(1, 320 / Math.max(canvas.width, canvas.height));
  const t = makeCanvas(Math.max(1, Math.round(canvas.width * s)), Math.max(1, Math.round(canvas.height * s)));
  const x = ctx2d(t);
  x.imageSmoothingQuality = 'high';
  x.drawImage(canvas, 0, 0, t.width, t.height);
  return canvasBlob(t, 'image/webp', 0.8);
}

/* فك ترميز ← قص (srcRect) ← قص الهوامش ← مصغّر ← بصمة
   opts = { crop, xf, trim, thr } — تُعيد blob=null إذا لم يتغير شيء (يُستخدم الأصل بلا إعادة ترميز) */
export async function processImage(blob, opts) {
  opts = opts || {};
  const src = await decodeSource(blob);
  let W = src.naturalWidth || src.width, H = src.naturalHeight || src.height;
  if (!W || !H) { W = 800; H = 600; }
  let canvas = makeCanvas(W, H);
  ctx2d(canvas).drawImage(src, 0, 0, W, H);
  if (src.close) src.close();
  let type = blob.type || 'image/png';
  let changed = false;
  const cr = cropRect(W, H, opts.crop);
  if (cr) { canvas = subCanvas(canvas, cr); changed = true; }
  if (opts.xf && (opts.xf.rot || opts.xf.fh || opts.xf.fv)) { canvas = applyXform(canvas, opts.xf); changed = true; }
  if (opts.trim && type !== 'image/gif' && type !== 'image/svg+xml') {
    const d = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
    const b = boundsFromData(d, canvas.width, canvas.height, opts.thr || 245);
    if (b && (b.w < canvas.width || b.h < canvas.height)) { canvas = subCanvas(canvas, b); changed = true; }
  }
  let outBlob = null;
  if (changed) {
    const outType = type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    outBlob = await canvasBlob(canvas, outType, 0.95);
    type = outType;
  }
  const thumb = await makeThumbBlob(canvas);
  const sig = computeSignature(canvas);
  return { blob: outBlob, type, width: canvas.width, height: canvas.height, thumb, sig };
}
