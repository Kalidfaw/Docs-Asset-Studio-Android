/* مستخرج PDF (.pdf) عبر pdf.js المضمَّن محلياً.
   لكل صفحة: نمرّ على قائمة العمليات متتبّعين مصفوفة التحويل (CTM) فنعرف موضع كل صورة وتدويرها وقلبها،
   ونجمع الصورة المكررة (نفس كائن PDF) في بطاقة واحدة تسرد كل صفحاتها.
   الصورة بحجم الصفحة تُصنَّف category='page' (شارة «صفحة كاملة» + مرشّح لإخفائها). */
import { mul, IDENT, unitBBox, coverage, xfFromMatrix, buildLines, pageContext } from '../pdfmath.js';
import { sortLocs, locRank } from '../loc.js';
import { RawPdf, jpegInfo } from '../pdfraw.js';

export const PAGE_COVER = 0.8;
const MIN_SIDE = 16;                                    // أصغر من هذا (زخارف/نقاط) لا يستحق بطاقة

let lib = null;
export function setPdfLib(pdfjs, workerSrc) {
  lib = { pdfjs, workerSrc };
}
function ensureWorker() {
  if (!lib) throw new Error('pdf.js غير مُحمَّل');
  if (!lib.ready) {
    const url = URL.createObjectURL(new Blob([lib.workerSrc], { type: 'text/javascript' }));
    const w = new Worker(url);
    w.addEventListener('error', (e) => console.error('pdf worker error', e.message, e.filename, e.lineno));
    lib.pdfjs.GlobalWorkerOptions.workerPort = w;
    lib.ready = true;
  }
}

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const blobOf = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), type, q));

/* يحوّل كائن صورة pdf.js إلى Canvas (مع قناع الشفافية إن وُجد) */
function toCanvas(obj, onWhite) {
  const w = obj.width, h = obj.height;
  if (!w || !h) return null;
  const c = mk(w, h), x = c.getContext('2d', { willReadFrequently: true });
  if (onWhite) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }     // القناع: حبر على ورق أبيض
  if (obj.bitmap) { x.drawImage(obj.bitmap, 0, 0); return c; }
  const d = obj.data;
  if (!d) return null;
  const px = w * h, out = x.createImageData(w, h), o = out.data;
  if (d.length === px * 4) o.set(d);
  else if (d.length === px * 3) for (let i = 0, j = 0; i < px; i++, j += 3) { o[i * 4] = d[j]; o[i * 4 + 1] = d[j + 1]; o[i * 4 + 2] = d[j + 2]; o[i * 4 + 3] = 255; }
  else if (d.length === px) for (let i = 0; i < px; i++) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = d[i]; o[i * 4 + 3] = 255; }
  else return null;                                      // 1bpp/قناع: غير مدعوم
  x.putImageData(out, 0, 0);
  return c;
}

/* PNG إن وُجدت شفافية أو ألوان قليلة (رسم)، وإلا JPEG */
async function encode(c) {
  const x = c.getContext('2d', { willReadFrequently: true });
  const step = Math.max(1, Math.floor(Math.sqrt((c.width * c.height) / 4000)));
  let alpha = false; const seen = new Set();
  for (let yy = 0; yy < c.height && !alpha; yy += step) {
    const row = x.getImageData(0, yy, c.width, 1).data;
    for (let xx = 0; xx < c.width; xx += step) {
      const i = xx * 4;
      if (row[i + 3] < 250) { alpha = true; break; }
      if (seen.size < 300) seen.add((row[i] >> 3) << 10 | (row[i + 1] >> 3) << 5 | (row[i + 2] >> 3));
    }
  }
  if (alpha || seen.size < 256) return { blob: await blobOf(c, 'image/png'), ext: 'png' };
  return { blob: await blobOf(c, 'image/jpeg', 0.95), ext: 'jpg' };
}

function fnv(c) {                                         // بصمة محتوى من عينات موزّعة على الصورة كلها (الصفحات الممسوحة تتشابه في الزوايا)
  const x = c.getContext('2d', { willReadFrequently: true });
  const t = x.getImageData(0, 0, c.width, c.height).data;
  const n = t.length >> 2, step = Math.max(1, Math.floor(n / 20000));
  let h = 2166136261 ^ c.width ^ (c.height << 16);
  for (let i = 0; i < n; i += step) h = Math.imul(h ^ t[i << 2] ^ (t[(i << 2) + 1] << 8), 16777619);
  return 'h' + (h >>> 0);
}

const getObj = (page, id) => new Promise((res) => {
  const store = String(id).startsWith('g_') ? page.commonObjs : page.objs;
  try { store.get(id, res); } catch (e) { res(null); }
});

export const pdf = {
  id: 'pdf',
  label: 'PDF',
  exts: ['pdf'],
  binary: true,

  async open(file) {
    ensureWorker();
    const data = new Uint8Array(await file.arrayBuffer());
    const task = lib.pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true, verbosity: 0, useWasm: false });
    const doc = await task.promise;
    doc.__task = task; doc.__file = file;
    return doc;
  },

  /* opts: { useCrop, onProgress(done,total), cancelled() } */
  async scan(doc, opts = {}) {
    const OPS = lib.pdfjs.OPS;
    const groups = new Map();                               // مفتاح الكائن ← { canvas, uses: Map(xfKey ← variant) }
    let order = 0, skipped = 0;
    const total = doc.numPages;

    for (let pn = 1; pn <= total; pn++) {
      if (opts.cancelled && opts.cancelled()) break;
      const page = await doc.getPage(pn);
      const view = page.view;
      const ol = await page.getOperatorList();
      let ctm = IDENT.slice(); const stack = [];
      const placed = [];
      for (let i = 0; i < ol.fnArray.length; i++) {
        const fn = ol.fnArray[i], a = ol.argsArray[i];
        if (fn === OPS.save) stack.push(ctm);
        else if (fn === OPS.restore) ctm = stack.pop() || IDENT.slice();
        else if (fn === OPS.transform) ctm = mul(ctm, a);
        else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (a && a[0]) ctm = mul(ctm, a[0]); }
        else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || IDENT.slice();
        else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
          placed.push({ id: fn === OPS.paintImageXObject ? a[0] : null, mask: false, inline: fn === OPS.paintInlineImageXObject ? a[0] : null, m: ctm.slice() });
        } else if (fn === OPS.paintImageMaskXObject) {
          // قناع (stencil): الصفحات الممسوحة بالأبيض والأسود غالباً هكذا؛ pdf.js يمرّره بمعرّف كائن له bitmap
          if (a[0] && typeof a[0].data === 'string') placed.push({ id: a[0].data, mask: true, m: ctm.slice() }); else skipped++;
        } else if (fn === OPS.paintInlineImageMaskXObject) skipped++;
      }
      let lines = null;
      for (const pl of placed) {
        const obj = pl.inline || await getObj(page, pl.id);
        if (!obj || obj.width < MIN_SIDE || obj.height < MIN_SIDE) continue;
        const key = pl.mask ? null : obj.ref ? 'r' + obj.ref : pl.id || null;      // معرّفات القناع محلية للصفحة فلا تصلح مفتاحاً
        let g = key && groups.get(key);
        if (!g) {
          const canvas = toCanvas(obj, pl.mask);
          if (!canvas) { skipped++; continue; }
          const k2 = key || fnv(canvas);
          g = groups.get(k2);
          if (!g) { g = { canvas, uses: new Map(), maxCover: 0, ref: pl.mask ? null : obj.ref || null }; groups.set(k2, g); }
          if (key) groups.set(key, g);
        }
        const bbox = unitBBox(pl.m), cov = coverage(bbox, view);
        g.maxCover = Math.max(g.maxCover, cov);
        const xf = xfFromMatrix(pl.m);
        const xk = xf ? `${xf.rot},${+xf.fh},${+xf.fv}` : xf === undefined ? 'x' : '';
        if (!g.uses.has(xk)) g.uses.set(xk, { xf: xf || null, locs: new Map(), ctx: { title: '', caption: '' } });
        const u = g.uses.get(xk);
        const loc = { k: 'g', n: pn, o: ++order };
        u.locs.set(String(order), loc);
        if (!lines) { try { const tc = await page.getTextContent(); lines = buildLines(tc.items); } catch (e) { lines = []; } }
        const cx = pageContext(lines, bbox);
        if (cx.title && !u.ctx.title) u.ctx.title = cx.title;
        if (cx.caption && !u.ctx.caption) u.ctx.caption = cx.caption;
      }
      page.cleanup();
      if (opts.onProgress) opts.onProgress(pn, total);
    }

    /* JPEG الأصلي بلا إعادة ترميز: نقرأ بايتات الملف مرة واحدة عند وجود صورة بمرجع */
    let raw = null;
    if ([...groups.values()].some((g) => g.ref) && doc.__file) {
      try { raw = new RawPdf(new Uint8Array(await doc.__file.arrayBuffer())); } catch (e) { raw = null; }
    }
    const rawOf = (g) => {
      if (!raw || !g.ref) return null;
      try {
        const j = raw.jpeg(g.ref);
        const info = j && jpegInfo(j);
        return info && info.w === g.canvas.width && info.h === g.canvas.height ? j : null;
      } catch (e) { return null; }
    };
    const entries = []; const seen = new Set();
    let idx = 0;
    for (const g of groups.values()) {
      if (seen.has(g)) continue; seen.add(g);
      idx++;
      const uses = [...g.uses.values()];
      const variants = uses.map((u) => {
        const byPage = new Map();                           // صفحة واحدة لكل بطاقة حتى لو تكررت داخلها
        for (const l of u.locs.values()) if (!byPage.has(l.n)) byPage.set(l.n, { k: 'g', n: l.n, o: 0 });
        return { crop: null, xf: u.xf, locs: [...byPage.values()].sort(sortLocs), alt: '', ctx: u.ctx };
      });
      variants.sort((a, b) => (a.xf ? 1 : 0) - (b.xf ? 1 : 0));
      const first = Math.min(...variants.map((v) => locRank(v.locs[0])));
      const canvas = g.canvas;
      const category = g.maxCover >= PAGE_COVER ? 'page' : 'media';
      const rawJpg = rawOf(g);
      let enc = null;
      const stem = `img${String(idx).padStart(3, '0')}`;
      entries.push({
        path: `pdf/${stem}`, base: `${stem}.${rawJpg ? 'jpg' : 'png'}`, ext: rawJpg ? 'jpg' : 'png',
        category, variants, first, original: !!rawJpg,
        entry: { async: async () => {
          if (rawJpg) return rawJpg.slice().buffer;
          enc = enc || await encode(canvas); return enc.blob.arrayBuffer();
        } }
      });
    }
    entries.sort((a, b) => a.first - b.first);
    return { entries, unsupported: 0, skipped };
  }
};
