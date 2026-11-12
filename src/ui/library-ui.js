/* واجهة المكتبة الدائمة: الحفظ، البحث، العرض، الحذف — المنطق النقي في core/library.js */
import { addToLibrary, searchLibrary, findMatch, rememberedName, libraryStats } from '../core/library.js';
import { locName } from '../core/loc.js';
import * as store from './store.js';
import { tr } from './i18n.js';

export const lib = { records: [], ready: false, persistent: false };
let H = null;                 // مساعدات التطبيق: { $, el, toast, sanitizeName, state, download }
const thumbUrls = new Map();

export async function initLibrary(helpers) {
  H = helpers;
  try { lib.persistent = await store.persistent(); lib.records = await store.loadAll(); } catch (e) { console.error(e); }
  lib.ready = true;
  H.$('openLibBtn').onclick = openPanel;
  H.$('libClose').onclick = closePanel;
  H.$('libSearch').oninput = renderList;
  H.$('libExport').onclick = exportIndex;
  H.$('libClear').onclick = clearLibrary;
  updateButton();
}

export function updateButton() {
  const s = libraryStats(lib.records);
  H.$('openLibBtn').querySelector('.lbl').textContent = tr('المكتبة ({n})', { n: s.images });
}

/* بيانات صورة المعرض → عنصر مكتبة */
export function itemOf(img, { full }) {
  return {
    sig: img.sig, width: img.width, height: img.height, name: img.name, hasFull: full,
    appearances: [{
      doc: img.source || H.state.sourceName || 'document',
      loc: img.locs.length ? img.locs.map(locName).join('+') : 'media',
      title: (img.ctx && img.ctx.title) || '', caption: (img.ctx && img.ctx.caption) || '', alt: img.alt || '',
      path: img.srcPath || ''
    }]
  };
}

export function knownFor(img) { return findMatch(lib.records, img, +H.$('simThreshold').value || 5); }
export function memoryFor(img) { return rememberedName(lib.records, img, +H.$('simThreshold').value || 5); }

/* يحفظ صوراً في المكتبة (فهرس + مصغّرة، ونسخة كاملة إن طُلبت أو كانت معدّلة) */
export async function saveToLibrary(imgs, { silent = false } = {}) {
  const keepFull = H.$('libKeepFull').checked;
  let created = 0, merged = 0, apps = 0;
  for (const img of imgs) {
    const full = keepFull || img.isEdited;
    const { record, isNew, addedAppearances } = addToLibrary(lib.records, itemOf(img, { full }), { thr: +H.$('simThreshold').value || 5 });
    if (isNew) { created++; if (img.thumbBlob) await store.putBlob('thumb:' + record.id, img.thumbBlob); } else merged++;
    if (full) await store.putBlob('full:' + record.id, img.blob);
    apps += addedAppearances;
    await store.putRecord(record);
  }
  updateButton();
  if (!silent) H.toast(tr('📚 المكتبة: {created} صورة جديدة، {merged} موجودة (دُمجت)، {apps} ظهور مضاف.', { created, merged, apps }) + (lib.persistent ? '' : tr(' (التخزين الدائم غير متاح: الحفظ للجلسة فقط)')), { duration: 6000 });
  return { created, merged, apps };
}

async function thumbFor(rec) {
  if (thumbUrls.has(rec.id)) return thumbUrls.get(rec.id);
  const b = await store.getBlob('thumb:' + rec.id);
  const u = b ? URL.createObjectURL(b) : '';
  thumbUrls.set(rec.id, u);
  return u;
}

function openPanel() { H.$('libModal').style.display = 'flex'; H.$('libSearch').value = ''; renderList(); H.$('libSearch').focus(); }
function closePanel() { H.$('libModal').style.display = 'none'; }

async function renderList() {
  const { $, el } = H;
  const list = $('libList');
  const found = searchLibrary(lib.records, $('libSearch').value).sort((a, b) => b.updatedAt - a.updatedAt);
  const s = libraryStats(lib.records);
  $('libStats').textContent = tr('{images} صورة · {docs} مستند · {apps} ظهور · {full} بنسخة كاملة', { images: s.images, docs: s.documents, apps: s.appearances, full: s.withFull }) +
    (found.length !== s.images ? tr(' — المعروض {n}', { n: found.length }) : '') + (lib.persistent ? '' : tr(' — (ذاكرة الجلسة فقط)'));
  list.textContent = '';
  if (!found.length) { list.appendChild(el('div', 'lib-empty', tr(s.images ? 'لا نتائج.' : 'المكتبة فارغة. حدّد صوراً في المعرض واضغط «حفظ في المكتبة».'))); return; }
  const seq = ++renderSeq;
  for (const rec of found.slice(0, 200)) {
    const row = el('div', 'lib-row');
    const im = document.createElement('img'); im.alt = ''; im.className = 'lib-thumb';
    thumbFor(rec).then((u) => { if (seq === renderSeq && u) im.src = u; });
    const body = el('div', 'lib-body');
    const nm = el('input', 'img-name-input'); nm.type = 'text'; nm.value = rec.name; nm.setAttribute('aria-label', tr('اسم الصورة في المكتبة'));
    nm.onchange = async () => { const n = H.sanitizeName(nm.value); if (n) { rec.name = n; rec.updatedAt = Date.now(); await store.putRecord(rec); } nm.value = rec.name; };
    const docs = new Set(rec.appearances.map((a) => a.doc));
    const meta = el('div', 'lib-meta', tr('{w}×{h} · {n} ظهور في {d} مستند', { w: rec.width, h: rec.height, n: rec.appearances.length, d: docs.size }) + (rec.hasFull ? tr(' · نسخة كاملة') : ''));
    const apps = el('div', 'lib-apps', rec.appearances.slice(0, 6).map((a) => `${a.doc} (${a.loc})`).join(tr(' ، ')) + (rec.appearances.length > 6 ? ` … +${rec.appearances.length - 6}` : ''));
    const acts = el('div', 'lib-acts');
    if (rec.hasFull) {
      const b = el('button', 'btn btn-secondary', tr('تنزيل')); b.type = 'button';
      b.onclick = async () => { const blob = await store.getBlob('full:' + rec.id); if (blob) H.download(blob, `${rec.name || 'image'}.${(blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`); };
      acts.append(b);
    }
    const withPath = rec.appearances.find((a) => a.path);
    if (withPath && window.desktop && window.desktop.readFile) {
      const b = el('button', 'btn btn-secondary', tr('فتح المستند')); b.type = 'button';
      b.onclick = async () => { const f = await window.desktop.readFile(withPath.path); if (f) { closePanel(); H.openFile(f); } else H.toast(tr('تعذّر فتح المستند (نُقل أو حُذف؟).')); };
      acts.append(b);
    }
    const del = el('button', 'btn btn-danger', tr('حذف')); del.type = 'button'; del.title = tr('حذف من المكتبة');
    del.onclick = async () => { await store.delRecord(rec.id); lib.records = lib.records.filter((r) => r !== rec); thumbUrls.delete(rec.id); updateButton(); renderList(); };
    acts.append(del);
    body.append(nm, meta, apps);
    row.append(im, body, acts);
    list.appendChild(row);
  }
  if (found.length > 200) list.appendChild(el('div', 'lib-empty', tr('عُرض أول 200 من {n} — ضيّق البحث.', { n: found.length })));
}
let renderSeq = 0;

function exportIndex() {
  const data = lib.records.map(({ sig, ...r }) => ({ ...r, sig: undefined }));
  H.download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'library-index.json');
}
async function clearLibrary() {
  if (!lib.records.length || !confirm(tr('حذف كل المكتبة (الفهرس والمصغّرات والنسخ الكاملة)؟ لا يمكن التراجع.'))) return;
  await store.clearAll(); lib.records = []; thumbUrls.clear(); updateButton(); renderList();
}
