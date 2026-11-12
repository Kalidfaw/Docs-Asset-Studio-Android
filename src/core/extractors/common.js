/* أدوات مشتركة بين المستخرجات */
import { locRank, sortLocs, locKey } from '../loc.js';

export const IMG_EXT = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
export const UNSUPPORTED_EXT = new Set(['emf', 'wmf', 'tif', 'tiff', 'wdp', 'jxr', 'heic', 'pict']);

export function extOf(path) { return path.split('.').pop().toLowerCase(); }

/* هدف علاقة → اسم ملف الوسائط (أو null إن لم يكن من مجلد media) */
export function mediaBase(target) {
  if (!/media\//i.test(target)) return null;
  let n = target.split('/').pop();
  try { n = decodeURIComponent(n); } catch (e) { /* اتركه كما هو */ }
  return n;
}

/* خريطة: اسم ملف الوسائط ← (مفتاح القص ← {crop, locs, alt}) */
export class Usage {
  constructor() { this.map = new Map(); }
  add(base, loc, crop, alt, ctx, xf) {
    if (!this.map.has(base)) this.map.set(base, new Map());
    const g = this.map.get(base);
    const key = (crop ? `${crop.l},${crop.t},${crop.r},${crop.b}` : '') + (xf ? `|${xf.rot},${+xf.fh},${+xf.fv}` : '');
    if (!g.has(key)) g.set(key, { crop, xf: xf || null, locs: new Map(), alt: '', ctx: { title: '', caption: '' } });
    const u = g.get(key);
    u.locs.set(locKey(loc), loc);
    if (alt && !u.alt) u.alt = alt;
    if (ctx) { if (ctx.title && !u.ctx.title) u.ctx.title = ctx.title; if (ctx.caption && !u.ctx.caption) u.ctx.caption = ctx.caption; }
  }
  groups(base) {
    const g = this.map.get(base);
    if (!g) return [];
    return [...g.values()].map((u) => ({ crop: u.crop, locs: [...u.locs.values()].sort(sortLocs), alt: u.alt, ctx: u.ctx, xf: u.xf }));
  }
}

/* يحوّل محتوى الحزمة + جدول الاستخدام إلى قائمة مدخلات جاهزة للمعالجة:
   entry = { path, entry(JSZip object), ext, base, category, variants:[{crop, xf, locs, alt, ctx}] } */
export function collectEntries(zip, { dir, usage, bgSet, useCrop }) {
  const entries = [];
  let unsupported = 0;
  zip.forEach((path, entry) => {
    if (entry.dir || !path.startsWith(dir)) return;
    const ext = extOf(path);
    if (UNSUPPORTED_EXT.has(ext)) { unsupported++; return; }
    if (!IMG_EXT[ext]) return;
    const base = path.split('/').pop();
    const groups = usage.groups(base);
    let variants;
    if (!groups.length) {
      variants = [{ crop: null, xf: null, locs: [], alt: '', ctx: { title: '', caption: '' } }];
    } else if (useCrop) {
      variants = groups.map((g) => ({ crop: g.crop, xf: g.xf, locs: g.locs, alt: g.alt, ctx: g.ctx }));
      variants.sort((a, b) => ((a.crop ? 1 : 0) + (a.xf ? 1 : 0)) - ((b.crop ? 1 : 0) + (b.xf ? 1 : 0)));        // الصورة الكاملة أولاً
    } else {
      const all = new Map(); let alt = ''; const ctx = { title: '', caption: '' };
      groups.forEach((g) => { g.locs.forEach((l) => all.set(locKey(l), l)); if (!alt) alt = g.alt; if (!ctx.title) ctx.title = g.ctx.title; if (!ctx.caption) ctx.caption = g.ctx.caption; });
      variants = [{ crop: null, xf: null, locs: [...all.values()].sort(sortLocs), alt, ctx }];
    }
    const templateOnly = groups.length > 0 && groups.every((g) => g.locs.every((l) => l.k === 'l' || l.k === 'm'));
    const category = ((!groups.length && bgSet && bgSet.has(base)) || templateOnly) ? 'background' : 'media';
    const first = Math.min(...variants.map((v) => (v.locs.length ? locRank(v.locs[0]) : Infinity)));
    entries.push({ path, entry, ext, base, category, variants, first });
  });
  entries.sort((a, b) => {
    if (a.first !== b.first) return a.first === Infinity ? 1 : b.first === Infinity ? -1 : a.first - b.first;
    return a.path.localeCompare(b.path, undefined, { numeric: true });
  });
  return { entries, unsupported };
}
