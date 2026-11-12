/* منطق المكتبة الدائمة وذاكرة الأسماء — نقي بلا DOM/IndexedDB (التخزين في src/ui/store.js) */
import { similarity } from './hash.js';

/* تطبيع للبحث: عربي (تشكيل، تطويل، توحيد الألف والياء) + فرنسي (إزالة التشكيل اللاتيني) + حالة الأحرف */
export function normText(s) {
  return (s || '').normalize('NFD')
    .replace(/[ً-ٰٟـ̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[_\-.]+/g, ' ')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/* يجد سجلاً مطابقاً بصرياً (نفس معيار كشف التكرار) أو null */
export function findMatch(records, item, thr = 5) {
  let best = null, bd = Infinity;
  for (const r of records) {
    const d = similarity(r, item, thr);
    if (d !== null && d < bd) { best = r; bd = d; }
  }
  return best;
}

const appKey = (a) => `${a.doc}|${a.loc}`;

/* يضيف صورة إلى المكتبة: يدمجها في سجل موجود (ظهور جديد) أو ينشئ سجلاً.
   item = { sig, width, height, name, appearances:[{doc, loc, title, caption, alt}] }
   → { record, isNew, addedAppearances } ويعدّل records في مكانه */
export function addToLibrary(records, item, { thr = 5, now = Date.now(), newId } = {}) {
  const found = findMatch(records, item, thr);
  const apps = item.appearances || [];
  if (found) {
    const have = new Set(found.appearances.map(appKey));
    let added = 0;
    for (const a of apps) if (!have.has(appKey(a))) { found.appearances.push({ ...a, at: now }); have.add(appKey(a)); added++; }
    if (item.name) found.name = item.name;
    if (item.hasFull && !found.hasFull) found.hasFull = true;
    found.updatedAt = now;
    return { record: found, isNew: false, addedAppearances: added };
  }
  const rec = {
    id: newId ? newId() : `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sig: item.sig, width: item.width, height: item.height, name: item.name || '',
    appearances: apps.map((a) => ({ ...a, at: now })), hasFull: !!item.hasFull, addedAt: now, updatedAt: now
  };
  records.push(rec);
  return { record: rec, isNew: true, addedAppearances: rec.appearances.length };
}

function haystack(r) {
  return normText([r.name, ...r.appearances.flatMap((a) => [a.doc, a.title, a.caption, a.alt])].join(' '));
}

/* بحث: كل الكلمات يجب أن تظهر (AND) في الاسم/المستند/العنوان/التعليق/alt */
export function searchLibrary(records, query) {
  const toks = normText(query).split(' ').filter(Boolean);
  if (!toks.length) return records.slice();
  return records.filter((r) => { const h = haystack(r); return toks.every((t) => h.includes(t)); });
}

/* ذاكرة الأسماء: الاسم الذي اختاره المستخدم سابقاً لصورة مطابقة */
export function rememberedName(records, item, thr = 5) {
  const r = findMatch(records, item, thr);
  return r && r.name ? { name: r.name, record: r } : null;
}

export function libraryStats(records) {
  const docs = new Set();
  let apps = 0;
  for (const r of records) for (const a of r.appearances) { docs.add(a.doc); apps++; }
  return { images: records.length, documents: docs.size, appearances: apps, withFull: records.filter((r) => r.hasFull).length };
}
