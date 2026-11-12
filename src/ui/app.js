
import JSZip from 'jszip';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerSrc from './pdf-worker-src.generated.js';
import { setPdfLib } from '../core/extractors/pdf.js';
import { clusterImages, hamming } from '../core/hash.js';
import { pickExtractor, ACCEPT, FORMATS_LABEL } from '../core/extractors/index.js';
import { IMG_EXT as IMG_MIME } from '../core/extractors/common.js';
import { locsLabel, locName, setLocLang } from '../core/loc.js';
import { tr, setLang, getLang, onLang, applyDom } from './i18n.js';
import { Pool, processAny } from './pool.js';
import { isNative, saveBlobNative, initBackButton } from './native.js';
import { toCsv, wbManifest, WB_MIME_EXT, WB_RAW_MAX } from '../core/exporters.js';
import { suggestName, uniqueNames } from '../core/naming.js';
import { initLibrary, saveToLibrary, knownFor, memoryFor, lib, updateButton as updateLibButton } from './library-ui.js';

/* ============================== ثوابت وحالة ============================== */
const $ = (id) => document.getElementById(id);
const MIME_EXT = { 'image/png':'png', 'image/jpeg':'jpg', 'image/webp':'webp', 'image/gif':'gif', 'image/bmp':'bmp', 'image/svg+xml':'svg' };
const SETTINGS_KEY = 'docs-asset-studio-settings-v1';
const PERSISTED = ['exportFormat','exportQuality','filePrefix','minSizeKB','trimEnabled','useSrcRect','whiteThreshold','simThreshold','autoSaveToggle','saveMode','appendMode','exportFolders','nameTemplate','libAutoAdd','libKeepFull'];

const state = { images: [], nextId: 1, lastClickedId: null, cancel: false, busy: false, sourceName: 'document', sources: new Set() };
const cards = new Map();

/* ============================== أدوات عامة ============================== */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function clampNum(v, min, max, def) {
  v = parseFloat(v);
  if (isNaN(v)) return def;
  return Math.min(max, Math.max(min, v));
}
function sanitizeName(s) {
  return String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.(png|jpe?g|webp|gif|bmp|svg)$/i, '').trim();
}
const tick = () => new Promise((r) => setTimeout(r, 0));

function toast(msg, opts = {}) {
  const box = $('toasts');
  const t = el('div', 'toast');
  t.appendChild(el('span', '', msg));
  let timer;
  const close = () => { clearTimeout(timer); t.remove(); };
  if (opts.action) {
    const b = el('button', '', opts.action.label);
    b.type = 'button';
    b.onclick = () => { opts.action.fn(); close(); };
    t.appendChild(b);
  }
  timer = setTimeout(close, opts.duration || 4500);
  box.appendChild(t);
  return close;
}
let statusFn = null;
function setStatus(msg) { statusFn = typeof msg === 'function' ? msg : null; $('status').textContent = statusFn ? statusFn() : msg; }
function showProgress(on, frac) {
  $('progressWrap').style.display = on ? 'flex' : 'none';
  if (frac != null) $('progress').value = frac;
}

/* ============================== الإعدادات والثيم ============================== */
function applyTheme(th) {
  const t = th;
  document.body.setAttribute('data-theme', t);
  $('themeBtn').querySelector('.lbl').textContent = tr(t === 'light' ? 'داكن' : 'فاتح');
  $('themeBtn').querySelector('use').setAttribute('href', t === 'light' ? '#i-moon' : '#i-sun');
}
function saveSettings() {
  try {
    const s = { theme: document.body.getAttribute('data-theme'), lang: getLang() };
    for (const id of PERSISTED) {
      const e = $(id);
      s[id] = e.type === 'checkbox' ? e.checked : e.value;
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (e) { /* التخزين قد يكون غير متاح */ }
}
function loadSettings() {
  let theme = (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    for (const id of PERSISTED) {
      if (!(id in s)) continue;
      const e = $(id);
      if (e.type === 'checkbox') e.checked = !!s[id]; else e.value = s[id];
    }
    if (s.theme) theme = s.theme;
    if (s.lang === 'fr') { setLocLang('fr'); setLang('fr'); }
  } catch (e) { /* تجاهل */ }
  applyTheme(theme);
  syncSettingOutputs();
}
function syncSettingOutputs() {
  $('whiteVal').textContent = $('whiteThreshold').value;
  $('simVal').textContent = $('simThreshold').value;
  const f = $('exportFormat').value;
  $('qualityGroup').style.display = (f === 'image/jpeg' || f === 'image/webp') ? 'flex' : 'none';
}

/* ============================== معالجة الصور (Canvas) ============================== */
function loadImage(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('decode failed'));
    i.src = src;
  });
}
async function decodeBlob(blob) {
  const url = URL.createObjectURL(blob);
  try { return await loadImage(url); } finally { URL.revokeObjectURL(url); }
}
function imageToCanvas(im, whiteBg) {
  const w = im.naturalWidth || 800, h = im.naturalHeight || 600;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (whiteBg) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
  x.drawImage(im, 0, 0, w, h);
  return c;
}
function canvasToBlob(c, type = 'image/png', q) {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), type, q));
}
async function convertBlob(blob, type, q) {
  const im = await decodeBlob(blob);
  const c = imageToCanvas(im, type === 'image/jpeg');
  return canvasToBlob(c, type, q);
}

/* الأفضل = الأعلى دقة ثم الأكبر حجماً */
function annotateClusters(clusters) {
  let hue = 0;
  for (const c of clusters) {
    if (c.length < 2) { c[0].dup = null; c[0].clusterColor = null; continue; }
    c.sort((a, b) => (b.width * b.height - a.width * a.height) || (b.size - a.size));
    const color = `hsl(${hue},70%,42%)`;
    hue = (hue + 57) % 360;
    c.forEach((img, idx) => {
      img.clusterColor = color;
      img.dup = idx === 0 ? { best: true, n: c.length } : { best: false, pct: Math.round((1 - hamming(c[0].sig, img.sig) / 64) * 100), of: c[0] };
    });
  }
}
function detectDuplicates() {
  const clusters = clusterImages(state.images, +$('simThreshold').value);
  annotateClusters(clusters);
  state.images = clusters.flat();
  state.images.forEach((i) => { i.selected = false; });
  let dups = 0, cross = 0;
  clusters.forEach((c) => { if (c.length > 1) c.slice(1).forEach((i) => { i.selected = true; dups++; if (i.source !== c[0].source) cross++; }); });
  render();
  toast(dups
    ? tr('تم تحديد {dups} نسخة مكررة (الأقل جودة فقط)', { dups }) + (cross ? tr(' — منها {cross} مكررة بين مستندات مختلفة', { cross }) : '') + tr('. راجعها ثم اضغط «حذف المحددة».')
    : tr('لم يتم العثور على صور متشابهة.'), { duration: 6000 });
}
function sortBySimilarity() {
  const clusters = clusterImages(state.images, +$('simThreshold').value);
  annotateClusters(clusters);
  clusters.sort((a, b) => b.length - a.length);
  state.images = clusters.flat();
  render();
  toast(tr('تم تجميع الصور المتشابهة بجانب بعضها.'));
}

/* ============================== إنشاء كائن صورة ============================== */
async function makeImageObj(blob, { name, category = 'media', locs = [], crop = null, xf = null, trim = false, isEdited = false, alt = '', source = '', ctx = null, srcPath = '' }) {
  let r;
  try {
    r = await processAny(blob, { crop, xf, trim: !!trim && $('trimEnabled').checked, thr: +$('whiteThreshold').value });
  } catch (e) { return null; }
  if (!r || !r.width || !r.height) return null;
  const outBlob = r.blob || blob;
  return {
    id: state.nextId++, name: sanitizeName(name) || 'image', blob: outBlob, type: r.type,
    category, locs, alt, source, ctx: ctx || { title: '', caption: '' }, srcPath, thumbBlob: r.thumb, suggestion: null, known: null, dup: null, cropped: !!crop && !isEdited, rotated: !!xf && !isEdited, rotLabel: xf ? (xf.rot ? 'مُدار' : 'مقلوب') : '', size: outBlob.size, width: r.width, height: r.height,
    thumbUrl: URL.createObjectURL(r.thumb), sig: r.sig, selected: true, isEdited, badge: null, clusterColor: null
  };
}

function downloadBlob(blob, name) {
  if (isNative()) {
    saveBlobNative(blob, name, tr('حفظ أو مشاركة الملف'))
      .catch((e) => { console.error(e); toast(e && e.message === 'too-big' ? tr('الملف كبير جدًا للهاتف، صدّر عددًا أقل من الصور.') : tr('تعذّر حفظ الملف.')); });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function resetAll() {
  finalizeDelete();
  state.images.forEach((i) => URL.revokeObjectURL(i.thumbUrl));
  state.images = [];
  state.sources.clear();
  state.lastClickedId = null;
  cards.clear();
  $('gallery').textContent = '';
  $('toolbar').style.display = 'none';
  updateStats();
}

/* تسمية المصدر لكل ملف: اسم الملف بلا امتداد، ويُضاف الامتداد/رقم عند التعارض (test.pptx وtest.docx) */
function sourceLabels(files) {
  const taken = new Set(state.sources);
  const stems = files.map((f) => f.name.replace(/\.[^.]+$/, ''));
  const count = new Map();
  stems.forEach((s) => count.set(s, (count.get(s) || 0) + 1));
  return files.map((f, i) => {
    const ext = f.name.split('.').pop().toLowerCase();
    let label = sanitizeName(stems[i]) || 'document';
    if (count.get(stems[i]) > 1 || taken.has(label)) label = `${label}_${ext}`;
    const base = label;
    let k = 2;
    while (taken.has(label)) label = `${base}_${k++}`;
    taken.add(label);
    return label;
  });
}

/* يعالج ملفاً واحداً ويضيف صوره للمعرض. info = { index, total, source, multi, totals } */
async function processOneFile(file, ex, info) {
  const tag = info.total > 1 ? `[${info.index + 1}/${info.total}] ` : '';
  const frac = (done, n) => (info.index + (n ? done / n : 0)) / info.total;
  setStatus(`⏳ ${tag}${tr('جاري قراءة {name}...', { name: file.name })}`);
  let entries, unsupported;
  if (ex.binary) {
    const doc = await ex.open(file);
    try {
      ({ entries, unsupported } = await ex.scan(doc, {
        useCrop: true, cancelled: () => state.cancel,
        onProgress: (d, n) => { setStatus(`⏳ ${tag}${tr('قراءة الصفحة {d} / {n} من {name}...', { d, n, name: file.name })}`); showProgress(true, frac(d, n) * 0.5); }
      }));
    } finally { try { await (doc.__task ? doc.__task.destroy() : doc.cleanup()); } catch (e) { /* لا يهم */ } }
  } else {
    const zip = await JSZip.loadAsync(file);
    ({ entries, unsupported } = await ex.scan(zip, { useCrop: $('useSrcRect').checked }));
  }
  const minBytes = clampNum($('minSizeKB').value, 0, 500, 2) * 1024;
  state.sources.add(info.source);
  info.totals.unsupported += unsupported;

  const results = new Array(entries.length);
  let next = 0, flushed = 0, done = 0;
  const flush = (force) => {
    while (flushed < entries.length && (results[flushed] !== undefined || force)) {
      for (const o of (results[flushed] || [])) {
        state.images.push(o); appendCardIfVisible(o);
        if (o.cropped) info.totals.cropped++;
        if (o.rotated) info.totals.rotated++;
      }
      flushed++;
    }
    if (state.images.length) $('toolbar').style.display = 'flex';
  };
  const runEntry = async (e) => {
    const buf = await e.entry.async('arraybuffer');
    if (buf.byteLength < minBytes) { info.totals.tooSmall++; return []; }
    const blob = new Blob([buf], { type: IMG_MIME[e.ext] });
    const baseName = e.base.replace(/\.[^.]+$/, '');
    const stem = info.multi ? `${info.source}_${baseName}` : baseName;
    const out = [];
    for (let k = 0; k < e.variants.length; k++) {
      const v = e.variants[k];
      const obj = await makeImageObj(blob, {
        name: k === 0 ? stem : `${stem}_v${k + 1}`, category: e.category, locs: v.locs, crop: v.crop, xf: v.xf,
        trim: true, alt: v.alt, source: info.source, ctx: v.ctx, srcPath: file.__path || ''
      });
      if (obj) out.push(obj); else info.totals.failed++;
    }
    return out;
  };
  const lane = async () => {
    while (!state.cancel) {
      const i = next++;
      if (i >= entries.length) break;
      try { results[i] = await runEntry(entries[i]); } catch (err) { console.error(err); info.totals.failed++; results[i] = []; }
      done++;
      setStatus(`⏳ ${tag}${tr('معالجة {done} / {n} ...', { done, n: entries.length })}`);
      showProgress(true, frac(done, entries.length));
      flush(false);
      await tick();
    }
  };
  const lanes = Pool.ok ? Pool.size + 1 : 1;
  await Promise.all(Array.from({ length: Math.min(lanes, Math.max(1, entries.length)) }, lane));
  flush(true);
}

async function handleFiles(input) {
  if (state.busy) { toast(tr('هناك معالجة جارية، انتظر أو اضغط إلغاء.')); return; }
  const all = Array.from(input || []);
  if (window.desktop && window.desktop.pathOf) all.forEach((f) => { if (!f.__path) f.__path = window.desktop.pathOf(f); });
  const files = all.filter((f) => pickExtractor(f.name));
  if (!files.length) {
    toast(tr('الصيغة غير مدعومة. المدعوم: {fmts} (الملفات القديمة .ppt/.doc/.xls غير مدعومة).', { fmts: FORMATS_LABEL }), { duration: 6000 });
    return;
  }
  if (files.length < all.length) toast(tr('تم تجاهل {n} ملف بصيغة غير مدعومة.', { n: all.length - files.length }), { duration: 6000 });

  const append = $('appendMode').checked && state.images.length > 0;
  if (!append) resetAll();
  const labels = sourceLabels(files);
  const multi = files.length > 1 || (append && state.sources.size > 0);
  state.busy = true; state.cancel = false;
  if (files.length === 1 && !append) state.sourceName = files[0].name.replace(/\.[^.]+$/, '');
  showProgress(true, 0);

  const totals = { tooSmall: 0, failed: 0, cropped: 0, rotated: 0, unsupported: 0, badFiles: 0 };
  const before = state.images.length;
  let lastEx = null;
  try {
    for (let i = 0; i < files.length && !state.cancel; i++) {
      const ex = pickExtractor(files[i].name);
      lastEx = ex;
      try {
        await processOneFile(files[i], ex, { index: i, total: files.length, source: labels[i], multi, totals });
      } catch (err) {
        console.error(err);
        totals.badFiles++;
      }
    }
    refreshInsights(state.images.slice(before));
    render();                                   // شارات الاقتراح والمكتبة واسم المستند
    const added = state.images.length - before;
    const tot = { ...totals }, nFiles = files.length, label = lastEx.label, wasCancel = state.cancel;
    // يُعاد بناء الملخص عند تبديل اللغة (setStatus تقبل دالة)
    setStatus(() => {
      const notes = [];
      if (tot.cropped) notes.push(tr('طُبّق القص الأصلي للمستند على {n}', { n: tot.cropped }));
      if (tot.rotated) notes.push(tr('طُبّق التدوير/القلب الأصلي على {n}', { n: tot.rotated }));
      if (tot.tooSmall) notes.push(tr('{n} صغيرة جداً', { n: tot.tooSmall }));
      if (tot.unsupported) notes.push(tr('{n} بصيغ غير مدعومة (EMF/WMF/TIFF...)', { n: tot.unsupported }));
      if (tot.failed) notes.push(tr('{n} تعذّر فك ترميزها', { n: tot.failed }));
      if (tot.badFiles && nFiles > 1) notes.push(tr('{n} ملف تعذّرت قراءته', { n: tot.badFiles }));
      const tail = notes.length ? ` — ${notes.join(tr('، '))}` : '';
      const from = nFiles === 1 ? tr('ملف {label}', { label }) : tr('{n} ملفات', { n: nFiles - tot.badFiles });
      if (nFiles === 1 && tot.badFiles) return tr('❌ تعذّرت قراءة الملف (قد يكون تالفاً أو ليس ملف {label} صالحاً).', { label });
      if (wasCancel) return tr('⏹️ تم الإلغاء بعد {n} صورة{tail}', { n: added, tail });
      if (added) return tr('✅ تم استخراج {n} صورة من {from}{tail}', { n: added, from, tail });
      return tr('⚠️ لم يتم العثور على صور صالحة{tail}', { tail });
    });
  } finally {
    state.busy = false;
    showProgress(false);
    updateStats();
  }
}

/* ============================== المعرض ============================== */
setPdfLib(pdfjs, pdfWorkerSrc);
const passes = (img, f) => f === 'all' || (f === 'nopage' ? img.category !== 'page' : img.category === f);
function visibleImages() {
  const f = $('filterType').value;
  return state.images.filter((i) => passes(i, f));
}
function mkBtn(cls, txt, label, fn) {
  const b = el('button', cls, txt);
  b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
  b.onclick = (e) => { e.stopPropagation(); fn(e); };
  return b;
}
function buildCard(img) {
  const card = el('div', 'img-card' + (img.selected ? ' selected' : ''));
  if (img.clusterColor) { card.style.setProperty('--cluster', img.clusterColor); card.classList.add('clustered'); }

  const top = el('div', 'card-top-actions');
  const cb = el('button', 'checkbox', img.selected ? '✓' : '');
  cb.type = 'button';
  cb.setAttribute('role', 'checkbox');
  cb.setAttribute('aria-checked', String(img.selected));
  cb.setAttribute('aria-label', tr('تحديد الصورة'));
  cb.onclick = (e) => { e.stopPropagation(); selectImage(img.id, e.shiftKey); };
  const right = el('div', 'card-actions-right');
  right.append(
    mkBtn('edit-btn', '🔍', tr('معاينة'), () => openLightbox(img.id)),
    mkBtn('edit-btn', '✏️', tr('تعديل الصورة'), () => openEditor(img.id)),
    mkBtn('delete-btn', '✕', tr('حذف الصورة'), () => deleteImages(new Set([img.id])))
  );
  top.append(cb, right);

  const box = el('div', 'img-container');
  box.onclick = (e) => selectImage(img.id, e.shiftKey);
  box.ondblclick = () => openLightbox(img.id);
  const im = document.createElement('img');
  im.src = img.thumbUrl; im.alt = img.alt || img.name; if (img.alt) im.title = img.alt; im.loading = 'lazy'; im.decoding = 'async';
  box.appendChild(im);
  if (img.locs.length) box.appendChild(el('div', 'badge-slides', locsLabel(img.locs)));
  if (img.known) { const kb = el('div', 'badge-known', tr('في المكتبة')); kb.title = tr('{name} — {n} ظهور سابق', { name: img.known.name || tr('بلا اسم'), n: img.known.appearances.length }); box.appendChild(kb); }
  if (img.isEdited) box.appendChild(el('div', 'badge-edited', tr('معدلة')));
  else if (img.cropped) box.appendChild(el('div', 'badge-crop', tr('قص العرض')));
  if (img.rotated) box.appendChild(el('div', 'badge-rot', tr(img.rotLabel)));
  if (img.category === 'page') box.appendChild(el('div', 'badge-page', tr('صفحة كاملة')));
  if (img.dup) {
    const d = img.dup;
    const bd = el('div', 'badge-similarity', d.best ? tr('الأفضل ★') : tr('مكررة {p}%', { p: d.pct }));
    bd.title = d.best ? tr('الأفضل جودة بين {n} نسخ متشابهة', { n: d.n }) : tr('مكررة لـ «{name}»', { name: d.of.name }) + (d.of.source ? ' — ' + d.of.source : '');
    box.appendChild(bd);
  }

  const info = el('div', 'img-info');
  const nameInput = el('input', 'img-name-input');
  nameInput.type = 'text'; nameInput.value = img.name; nameInput.setAttribute('aria-label', tr('اسم الملف'));
  nameInput.onchange = () => {
    const n = sanitizeName(nameInput.value);
    if (n) img.name = n;
    nameInput.value = img.name;
  };
  nameInput.onclick = (e) => e.stopPropagation();
  const ext = (MIME_EXT[img.type] || 'png').toUpperCase();
  info.append(nameInput);
  if (img.suggestion && img.suggestion.name !== img.name) {
    const sg = el('button', 'img-sugg', img.suggestion.name);
    sg.type = 'button';
    sg.title = tr(({ memory: 'اسم محفوظ في المكتبة لصورة مطابقة', caption: 'من تعليق الصورة', alt: 'من النص البديل', title: 'من عنوان الشريحة/القسم' })[img.suggestion.source]) + tr(' — اضغط للتطبيق');
    sg.onclick = (e) => { e.stopPropagation(); applySuggestions([img]); };
    info.append(sg);
  }
  if (state.sources.size > 1 && img.source) { const sd = el('div', 'img-src', img.source); sd.title = img.source; info.append(sd); }
  info.append(el('div', '', `${img.width}×${img.height} px | ${(img.size / 1024).toFixed(1)} KB | ${ext}`));

  card.append(top, box, info);
  cards.set(img.id, { card, cb });
  return card;
}
function appendCardIfVisible(img) {
  const f = $('filterType').value;
  if (!passes(img, f)) return;
  $('gallery').appendChild(buildCard(img));
  updateStats();
}
function render() {
  const g = $('gallery');
  g.textContent = '';
  cards.clear();
  const frag = document.createDocumentFragment();
  for (const img of visibleImages()) frag.appendChild(buildCard(img));
  g.appendChild(frag);
  updateStats();
}
function refreshCard(img) {
  const c = cards.get(img.id);
  if (!c) return;
  c.card.classList.toggle('selected', img.selected);
  c.cb.textContent = img.selected ? '✓' : '';
  c.cb.setAttribute('aria-checked', String(img.selected));
}
function selectImage(id, shift) {
  const list = visibleImages();
  const target = list.find((i) => i.id === id);
  if (!target) return;
  if (shift && state.lastClickedId != null) {
    const a = list.findIndex((i) => i.id === state.lastClickedId);
    const b = list.findIndex((i) => i.id === id);
    if (a !== -1) {
      const val = !target.selected;
      for (let k = Math.min(a, b); k <= Math.max(a, b); k++) { list[k].selected = val; refreshCard(list[k]); }
      state.lastClickedId = id;
      updateStats();
      return;
    }
  }
  target.selected = !target.selected;
  state.lastClickedId = id;
  refreshCard(target);
  updateStats();
}
function toggleSelectAll() {
  const list = visibleImages();
  const all = list.length > 0 && list.every((i) => i.selected);
  list.forEach((i) => { i.selected = !all; refreshCard(i); });
  updateStats();
}
function invertSelection() {
  visibleImages().forEach((i) => { i.selected = !i.selected; refreshCard(i); });
  updateStats();
}
function updateStats() {
  const sel = visibleImages().filter((i) => i.selected);
  const bytes = sel.reduce((s, i) => s + i.size, 0);
  document.body.classList.toggle('has-images', state.images.length > 0);
  $('selectedCount').textContent = sel.length;
  $('totalSize').textContent = bytes > 1048576 ? (bytes / 1048576).toFixed(2) + ' MB' : (bytes / 1024).toFixed(1) + ' KB';
  $('downloadBtn').disabled = sel.length === 0 || state.busy;
  $('exportMoreBtn').disabled = sel.length === 0 || state.busy;
  $('deleteBtn').disabled = sel.length === 0;
}
/* ============================== الأسماء المقترحة والمكتبة ============================== */
function locPrefix(img) {
  const base = img.locs.length ? locName(img.locs[0]) : '';
  return (state.sources.size > 1 && img.source ? img.source + '_' : '') + base;
}
function refreshInsights(imgs) {
  const template = $('nameTemplate').value.trim() || '{loc}_{text}';
  for (const img of imgs) {
    img.known = lib.ready ? knownFor(img) : null;
    const mem = lib.ready ? memoryFor(img) : null;
    if (mem) { img.suggestion = { name: mem.name, source: 'memory' }; continue; }
    const r = suggestName({ caption: img.ctx.caption, alt: img.alt, title: img.ctx.title },
      { template, loc: locPrefix(img) });
    img.suggestion = r ? { name: sanitizeName(r.name), source: r.source } : null;
  }
}
function applySuggestions(imgs, { undo = true } = {}) {
  const list = imgs.filter((i) => i.suggestion && i.suggestion.name !== i.name);
  if (!list.length) { toast(tr('لا توجد أسماء مقترحة جديدة (تحتاج الصورة تعليقاً أو نصاً بديلاً أو عنوان شريحة، أو صورة سبق حفظها في المكتبة).'), { duration: 6000 }); return; }
  const ids = new Set(list.map((i) => i.id));
  const taken = new Set(state.images.filter((i) => !ids.has(i.id)).map((i) => i.name.toLowerCase()));
  const names = uniqueNames(list.map((i) => i.suggestion.name), taken);
  const before = list.map((i) => [i, i.name]);
  list.forEach((img, k) => { img.name = names[k]; img.suggestion = null; });
  render();
  toast(tr('طُبّق {n} اسم مقترح.', { n: list.length }), { duration: 10000, action: undo ? { label: tr('تراجع'), fn: () => { before.forEach(([i, n]) => { i.name = n; }); refreshInsights(state.images); render(); } } : null });
}
async function saveSelectedToLibrary() {
  const sel = state.images.filter((i) => i.selected);
  if (!sel.length) { toast(tr('حدد صوراً لحفظها في المكتبة.')); return; }
  await saveToLibrary(sel);
  state.images.forEach((i) => { i.known = knownFor(i); });
  render();
}
function renameByLoc() {
  const counters = new Map();
  let n = 0;
  for (const img of state.images) {
    if (!img.locs.length) continue;
    const base = (state.sources.size > 1 && img.source ? img.source + '_' : '') + locName(img.locs[0]);
    const k = (counters.get(base) || 0) + 1;
    counters.set(base, k);
    img.name = `${base}_${k}`;
    n++;
  }
  render();
  toast(n ? tr('تمت إعادة تسمية {n} صورة حسب موضعها في المستند.', { n }) : tr('لا توجد صور مرتبطة بمواضع.'));
}

/* ============================== الحذف مع إمكانية التراجع ============================== */
let pending = null;
function finalizeDelete() {
  if (!pending) return;
  clearTimeout(pending.timer);
  pending.items.forEach(({ img }) => URL.revokeObjectURL(img.thumbUrl));
  pending = null;
}
function deleteImages(ids) {
  finalizeDelete();
  const items = [];
  state.images.forEach((img, index) => { if (ids.has(img.id)) items.push({ img, index }); });
  if (!items.length) return;
  state.images = state.images.filter((i) => !ids.has(i.id));
  render();
  const p = { items };
  pending = p;
  p.timer = setTimeout(() => { if (pending === p) finalizeDelete(); }, 10000);
  toast(tr('تم حذف {n} صورة', { n: items.length }), { duration: 10000, action: { label: tr('تراجع'), fn: () => undoDelete(p) } });
}
function undoDelete(p) {
  if (pending !== p) return;
  clearTimeout(p.timer);
  pending = null;
  for (const { img, index } of p.items) state.images.splice(Math.min(index, state.images.length), 0, img);
  render();
}
function deleteSelected() {
  const ids = new Set(visibleImages().filter((i) => i.selected).map((i) => i.id));
  if (!ids.size) { toast(tr('حدد صوراً للحذف أولاً.')); return; }
  deleteImages(ids);
}

/* ============================== التصدير ============================== */
async function downloadSelectedZip() {
  const sel = visibleImages().filter((i) => i.selected);
  if (!sel.length || state.busy) return;
  state.busy = true; updateStats();
  const fmt = $('exportFormat').value;
  const q = clampNum($('exportQuality').value, 0.5, 1, 0.92);
  const prefix = sanitizeName($('filePrefix').value);
  const zip = new JSZip();
  const used = new Set();
  const folders = $('exportFolders').checked && new Set(sel.map((i) => i.source).filter(Boolean)).size > 1;
  try {
    for (let i = 0; i < sel.length; i++) {
      const img = sel[i];
      setStatus(tr('📦 تجهيز {i} / {n} ...', { i: i + 1, n: sel.length }));
      showProgress(true, i / sel.length);
      let blob = img.blob;
      let ext = MIME_EXT[img.type] || 'png';
      if (fmt !== 'original' && img.type !== fmt) {
        blob = await convertBlob(img.blob, fmt, q);
        ext = MIME_EXT[blob.type] || MIME_EXT[fmt] || ext;
      }
      let base = (prefix + img.name) || 'image';
      const dir = folders && img.source ? img.source + '/' : '';
      let name = `${dir}${base}.${ext}`, n = 2;
      while (used.has(name.toLowerCase())) name = `${dir}${base}_${n++}.${ext}`;
      used.add(name.toLowerCase());
      zip.file(name, blob);
      if (i % 5 === 4) await tick();
    }
    setStatus(tr('📦 جاري بناء ملف ZIP...'));
    const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    downloadBlob(content, `${state.sources.size > 1 ? 'documents' : state.sourceName}_images.zip`);
    setStatus(tr('✅ تم تجهيز {n} صورة للتحميل.', { n: sel.length }));
    if ($('libAutoAdd').checked) saveToLibrary(sel, { silent: true }).catch(console.error);
  } catch (err) {
    console.error(err);
    setStatus(tr('❌ فشل التصدير.'));
    toast(tr('حدث خطأ أثناء التصدير.'));
  } finally {
    state.busy = false; showProgress(false); updateStats();
  }
}

/* تصدير متقدّم: منظّم + CSV، أو موسوعة السبورة */
function openExport() {
  const sel = visibleImages().filter((i) => i.selected);
  if (!sel.length) { toast(tr('حدد صوراً للتصدير أولاً.')); return; }
  $('exCount').textContent = sel.length;
  $('exportModal').style.display = 'flex';
}
const closeExport = () => { $('exportModal').style.display = 'none'; };

async function exportAdvanced(kind) {
  const sel = visibleImages().filter((i) => i.selected);
  if (!sel.length || state.busy) return;
  closeExport();
  state.busy = true; updateStats();
  const fmt = $('exportFormat').value, q = clampNum($('exportQuality').value, 0.5, 1, 0.92);
  const prefix = sanitizeName($('filePrefix').value);
  const zip = new JSZip(), used = new Set(), rows = [], boardItems = [], boardBlobs = [];
  try {
    for (let i = 0; i < sel.length; i++) {
      const img = sel[i];
      setStatus(tr('📦 تجهيز {i} / {n} ...', { i: i + 1, n: sel.length })); showProgress(true, i / sel.length);
      let blob = img.blob, mime = img.type;
      if (kind === 'board') {
        if (!WB_MIME_EXT[mime]) { blob = await convertBlob(blob, 'image/png'); mime = 'image/png'; }
        if (blob.size > WB_RAW_MAX) { blob = await convertBlob(img.blob, 'image/jpeg', 0.9); mime = 'image/jpeg'; }
        boardItems.push({ name: img.name, subject: $('exSubject').value || '', mime, w: img.width, h: img.height });
        boardBlobs.push(blob);
      } else {
        if (fmt !== 'original' && mime !== fmt) { blob = await convertBlob(blob, fmt, q); mime = blob.type || fmt; }
        const ext = MIME_EXT[mime] || 'png';
        const dir = (sanitizeName(img.source) || tr('مستند')) + '/';
        const base = (prefix + img.name) || 'image';
        let name = `${dir}${base}.${ext}`, n = 2;
        while (used.has(name.toLowerCase())) name = `${dir}${base}_${n++}.${ext}`;
        used.add(name.toLowerCase());
        zip.file(name, blob);
        rows.push([name, img.source || '', locsLabel(img.locs), img.name, (img.ctx && img.ctx.title) || '', (img.ctx && img.ctx.caption) || '', img.alt || '',
          img.width, img.height, ext.toUpperCase(), Math.round(blob.size / 1024), tr(img.category === 'page' ? 'صفحة كاملة' : img.category === 'background' ? 'خلفية قالب' : 'محتوى'),
          img.cropped ? tr('نعم') : '', img.rotated ? tr(img.rotLabel) : '']);
      }
      if (i % 5 === 4) await tick();
    }
    if (kind === 'board') {
      const { manifest, ids } = wbManifest(boardItems);
      zip.file('manifest.json', JSON.stringify(manifest));
      boardBlobs.forEach((b, i) => zip.file(`images/${ids[i]}.${WB_MIME_EXT[boardItems[i].mime]}`, b));
    } else {
      zip.file('index.csv', toCsv(['الملف', 'المستند', 'المواضع', 'الاسم', 'العنوان', 'التعليق', 'النص البديل', 'العرض', 'الارتفاع', 'الصيغة', 'الحجم KB', 'الفئة', 'قص', 'تدوير/قلب'].map((h) => tr(h)), rows));
    }
    setStatus(tr('📦 جاري بناء ملف ZIP...'));
    const content = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const stem = state.sources.size > 1 ? 'documents' : state.sourceName;
    downloadBlob(content, kind === 'board' ? `encyclopedia-${stem}.zip` : `${stem}_organized.zip`);
    setStatus(kind === 'board' ? tr('✅ جاهز لاستيراده في السبورة: {n} صورة.', { n: sel.length }) : tr('✅ تم تجهيز {n} صورة مع فهرس CSV.', { n: sel.length }));
    if ($('libAutoAdd').checked) saveToLibrary(sel, { silent: true }).catch(console.error);
  } catch (err) {
    console.error(err); setStatus(tr('❌ فشل التصدير.')); toast(tr('حدث خطأ أثناء التصدير.'));
  } finally { state.busy = false; showProgress(false); updateStats(); }
}

/* ============================== المعاينة (Lightbox) ============================== */
const LB = { list: [], i: 0, url: null };
function openLightbox(id) {
  LB.list = visibleImages();
  LB.i = LB.list.findIndex((x) => x.id === id);
  if (LB.i < 0) return;
  $('lightbox').style.display = 'flex';
  showLB();
}
function showLB() {
  const img = LB.list[LB.i];
  if (LB.url) URL.revokeObjectURL(LB.url);
  LB.url = URL.createObjectURL(img.blob);
  $('lbImg').src = LB.url;
  $('lbCap').textContent = `${img.name} — ${img.width}×${img.height} — ${LB.i + 1}/${LB.list.length}`;
}
function stepLB(d) {
  if (!LB.list.length) return;
  LB.i = (LB.i + d + LB.list.length) % LB.list.length;
  showLB();
}
function closeLB() {
  $('lightbox').style.display = 'none';
  if (LB.url) { URL.revokeObjectURL(LB.url); LB.url = null; }
  $('lbImg').removeAttribute('src');
}

/* ============================== المحرر ============================== */
const ED = {
  id: null, canvas: null, ctx: null, overlay: null, octx: null, tool: 'crop',
  undo: [], redo: [], ops: 0, scale: 1, drag: null, busy: false
};
function editorOpen() { return $('editorModal').style.display === 'flex'; }

function initEditorRefs() {
  ED.canvas = $('editCanvas');
  ED.ctx = ED.canvas.getContext('2d', { willReadFrequently: true });
  ED.overlay = $('overlayCanvas');
  ED.octx = ED.overlay.getContext('2d');
}
function clearOverlay() { ED.octx.clearRect(0, 0, ED.overlay.width, ED.overlay.height); }

function layoutEditor() {
  const wrap = $('canvasWrap'), c = ED.canvas;
  const maxW = Math.max(50, wrap.clientWidth - 20), maxH = Math.max(50, wrap.clientHeight - 20);
  ED.scale = Math.min(maxW / c.width, maxH / c.height, 3);
  const stage = $('stage');
  stage.style.width = c.width * ED.scale + 'px';
  stage.style.height = c.height * ED.scale + 'px';
  ED.overlay.width = c.width;
  ED.overlay.height = c.height;
}
function pushState(initial) {
  const c = ED.canvas;
  ED.undo.push(ED.ctx.getImageData(0, 0, c.width, c.height));
  ED.redo = [];
  if (!initial) ED.ops++;
  const max = Math.max(5, Math.min(40, Math.floor(160e6 / (c.width * c.height * 4))));
  while (ED.undo.length > max) ED.undo.shift();
}
function restoreState(data) {
  ED.canvas.width = data.width; ED.canvas.height = data.height;
  ED.ctx.putImageData(data, 0, 0);
  layoutEditor();
}
function undoAction() {
  if (ED.undo.length > 1) {
    ED.redo.push(ED.undo.pop());
    restoreState(ED.undo[ED.undo.length - 1]);
    ED.ops--;
  }
}
function redoAction() {
  if (ED.redo.length) {
    const s = ED.redo.pop();
    ED.undo.push(s);
    restoreState(s);
    ED.ops++;
  }
}

async function openEditor(id) {
  const img = state.images.find((i) => i.id === id);
  if (!img) return;
  if (!ED.canvas) initEditorRefs();
  ED.id = id; ED.undo = []; ED.redo = []; ED.ops = 0; ED.drag = null;
  $('editorModal').style.display = 'flex';
  $('editorTitle').textContent = img.name;
  $('saveEditBtn').style.display = $('autoSaveToggle').checked ? 'none' : 'inline-flex';
  const url = URL.createObjectURL(img.blob);
  try {
    const im = await loadImage(url);
    const w = im.naturalWidth || 800, h = im.naturalHeight || 600;
    ED.canvas.width = w; ED.canvas.height = h;
    ED.ctx.drawImage(im, 0, 0, w, h);
  } catch (e) {
    toast(tr('تعذّر فتح الصورة في المحرر.'));
    hideEditor();
    return;
  } finally {
    URL.revokeObjectURL(url);
  }
  pushState(true);
  layoutEditor();
  setTool('crop');
}
function hideEditor() {
  $('editorModal').style.display = 'none';
  ED.id = null; ED.undo = []; ED.redo = []; ED.ops = 0; ED.drag = null;
  if (ED.canvas) { ED.canvas.width = 1; ED.canvas.height = 1; }
}
async function closeEditor(trySave) {
  if (ED.id == null || ED.busy) return;
  if (ED.ops !== 0 && trySave) {
    if ($('autoSaveToggle').checked) {
      ED.busy = true;
      try { await saveEdit(); toast(tr('تم حفظ التعديل تلقائياً.')); }
      catch (e) { console.error(e); toast(tr('تعذّر الحفظ التلقائي.')); }
      ED.busy = false;
    } else if (!confirm(tr('لديك تعديلات غير محفوظة. هل تريد تجاهلها؟'))) {
      return;
    }
  }
  hideEditor();
}
async function saveEditClicked() {
  if (ED.id == null || ED.busy) return;
  ED.busy = true;
  try {
    await saveEdit();
    toast(tr('تم حفظ التعديل.'));
    hideEditor();
  } catch (e) {
    console.error(e);
    toast(tr('تعذّر حفظ التعديل.'));
  }
  ED.busy = false;
}
async function saveEdit() {
  const idx = state.images.findIndex((i) => i.id === ED.id);
  if (idx === -1) return;
  const orig = state.images[idx];
  const blob = await canvasToBlob(ED.canvas, 'image/png');
  if ($('saveMode').value === 'replace') {
    const obj = await makeImageObj(blob, { name: orig.name, category: orig.category, locs: orig.locs, isEdited: true, source: orig.source });
    if (!obj) throw new Error('make failed');
    obj.id = orig.id; obj.selected = orig.selected;
    URL.revokeObjectURL(orig.thumbUrl);
    state.images[idx] = obj;
  } else {
    const name = orig.name.replace(/(_edited)+$/, '') + '_edited';
    const obj = await makeImageObj(blob, { name, category: orig.category, locs: orig.locs, isEdited: true, source: orig.source });
    if (!obj) throw new Error('make failed');
    state.images.splice(idx + 1, 0, obj);
  }
  render();
}

function setTool(tool) {
  ED.tool = tool;
  $('btnCrop').className = 'btn ' + (tool === 'crop' ? 'btn-active' : 'btn-secondary');
  $('btnEraser').className = 'btn ' + (tool === 'eraser' ? 'btn-active' : 'btn-secondary');
  $('brushWrap').style.display = tool === 'eraser' ? 'inline-flex' : 'none';
  clearOverlay();
}
function edPoint(e) {
  const r = ED.overlay.getBoundingClientRect();
  const x = (e.clientX - r.left) * ED.canvas.width / r.width;
  const y = (e.clientY - r.top) * ED.canvas.height / r.height;
  return { x: Math.min(ED.canvas.width, Math.max(0, x)), y: Math.min(ED.canvas.height, Math.max(0, y)) };
}
function brushRadius() { return (+$('brushSize').value / 2) / ED.scale; }
function eraseDot(p) {
  const x = ED.ctx;
  x.fillStyle = '#ffffff';
  x.beginPath(); x.arc(p.x, p.y, brushRadius(), 0, Math.PI * 2); x.fill();
}
function eraseLine(a, b) {
  const x = ED.ctx;
  x.strokeStyle = '#ffffff'; x.lineWidth = brushRadius() * 2; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(a.x, a.y); x.lineTo(b.x, b.y); x.stroke();
}
function drawBrushCursor(p) {
  clearOverlay();
  const o = ED.octx;
  o.strokeStyle = '#ef4444'; o.lineWidth = Math.max(1, 2 / ED.scale);
  o.beginPath(); o.arc(p.x, p.y, brushRadius(), 0, Math.PI * 2); o.stroke();
}
function drawCropOverlay(a, b) {
  clearOverlay();
  const o = ED.octx;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
  o.fillStyle = 'rgba(0,0,0,.45)';
  o.fillRect(0, 0, ED.overlay.width, ED.overlay.height);
  o.clearRect(x, y, w, h);
  o.strokeStyle = '#6366f1'; o.lineWidth = Math.max(1, 2 / ED.scale);
  o.setLineDash([6 / ED.scale, 4 / ED.scale]);
  o.strokeRect(x, y, w, h);
  o.setLineDash([]);
}
function applyCrop(a, b) {
  const W = ED.canvas.width, H = ED.canvas.height;
  const x = Math.max(0, Math.round(Math.min(a.x, b.x)));
  const y = Math.max(0, Math.round(Math.min(a.y, b.y)));
  const w = Math.max(1, Math.min(W - x, Math.round(Math.abs(b.x - a.x))));
  const h = Math.max(1, Math.min(H - y, Math.round(Math.abs(b.y - a.y))));
  const data = ED.ctx.getImageData(x, y, w, h);
  ED.canvas.width = w; ED.canvas.height = h;
  ED.ctx.putImageData(data, 0, 0);
  pushState();
  layoutEditor();
}
function transformCanvas(rotate, flipDir) {
  const c = ED.canvas;
  const tmp = document.createElement('canvas');
  tmp.width = c.width; tmp.height = c.height;
  tmp.getContext('2d').drawImage(c, 0, 0);
  const w = rotate ? c.height : c.width, h = rotate ? c.width : c.height;
  c.width = w; c.height = h;
  const x = ED.ctx;
  x.save();
  if (rotate) {
    x.translate(w / 2, h / 2);
    x.rotate(rotate * Math.PI / 180);
    x.drawImage(tmp, -tmp.width / 2, -tmp.height / 2);
  } else {
    x.translate(flipDir === 'h' ? w : 0, flipDir === 'v' ? h : 0);
    x.scale(flipDir === 'h' ? -1 : 1, flipDir === 'v' ? -1 : 1);
    x.drawImage(tmp, 0, 0);
  }
  x.restore();
  pushState();
  layoutEditor();
}
function splitDims() {
  return {
    rows: Math.round(clampNum($('splitRows').value, 1, 10, 1)),
    cols: Math.round(clampNum($('splitCols').value, 1, 10, 1))
  };
}
function drawSplitPreview() {
  if (!editorOpen() || !ED.canvas) return;
  const { rows, cols } = splitDims();
  clearOverlay();
  if (rows <= 1 && cols <= 1) return;
  const o = ED.octx, W = ED.overlay.width, H = ED.overlay.height;
  o.strokeStyle = '#10b981'; o.lineWidth = Math.max(1, 2 / ED.scale);
  o.setLineDash([8 / ED.scale, 6 / ED.scale]);
  for (let r = 1; r < rows; r++) { const y = Math.round(r * H / rows); o.beginPath(); o.moveTo(0, y); o.lineTo(W, y); o.stroke(); }
  for (let c = 1; c < cols; c++) { const x = Math.round(c * W / cols); o.beginPath(); o.moveTo(x, 0); o.lineTo(x, H); o.stroke(); }
  o.setLineDash([]);
}
async function executeSplit() {
  if (ED.id == null || ED.busy) return;
  const { rows, cols } = splitDims();
  if (rows * cols < 2) { toast(tr('اختر صفوفاً أو أعمدة أكثر من 1.')); return; }
  ED.busy = true;
  const id = ED.id;
  const orig = state.images.find((i) => i.id === id);
  const src = ED.canvas, W = src.width, H = src.height;
  const parts = [];
  try {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = Math.round(c * W / cols), x1 = Math.round((c + 1) * W / cols);
        const y0 = Math.round(r * H / rows), y1 = Math.round((r + 1) * H / rows);
        const w = x1 - x0, h = y1 - y0;
        if (w < 1 || h < 1) continue;
        const t = document.createElement('canvas');
        t.width = w; t.height = h;
        t.getContext('2d').drawImage(src, x0, y0, w, h, 0, 0, w, h);
        const blob = await canvasToBlob(t, 'image/png');
        const obj = await makeImageObj(blob, {
          name: `${orig ? orig.name : 'img'}_r${r + 1}c${c + 1}`,
          category: orig ? orig.category : 'media', locs: orig ? orig.locs : [], isEdited: true, source: orig ? orig.source : ''
        });
        if (obj) parts.push(obj);
      }
    }
    const idx = state.images.findIndex((i) => i.id === id);
    state.images.splice(idx === -1 ? state.images.length : idx + 1, 0, ...parts);
    hideEditor();
    render();
    toast(tr('تم إنشاء {n} قطعة وإضافتها للمعرض.', { n: parts.length }));
  } catch (e) {
    console.error(e);
    toast(tr('تعذّر تقسيم الصورة.'));
  }
  ED.busy = false;
}

function wireEditorPointer() {
  const ov = $('overlayCanvas');
  ov.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    ov.setPointerCapture(e.pointerId);
    const p = edPoint(e);
    ED.drag = { start: p, last: p, cur: p };
    if (ED.tool === 'eraser') { eraseDot(p); drawBrushCursor(p); }
  });
  ov.addEventListener('pointermove', (e) => {
    const p = edPoint(e);
    if (!ED.drag) { if (ED.tool === 'eraser') drawBrushCursor(p); return; }
    if (ED.tool === 'eraser') { eraseLine(ED.drag.last, p); ED.drag.last = p; drawBrushCursor(p); }
    else { ED.drag.cur = p; drawCropOverlay(ED.drag.start, p); }
  });
  const finish = (e) => {
    if (!ED.drag) return;
    const d = ED.drag;
    ED.drag = null;
    if (ED.tool === 'crop') {
      const p = e.type === 'pointerup' ? edPoint(e) : d.cur;
      const w = Math.abs(p.x - d.start.x) * ED.scale, h = Math.abs(p.y - d.start.y) * ED.scale;
      if (w > 10 && h > 10) applyCrop(d.start, p); else clearOverlay();
    } else {
      pushState();
    }
  };
  ov.addEventListener('pointerup', finish);
  ov.addEventListener('pointercancel', finish);
  ov.addEventListener('pointerleave', () => { if (!ED.drag && ED.tool === 'eraser') clearOverlay(); });
}

/* ============================== ربط الأحداث ============================== */
/* تبديل اللغة: كل ما لا يمرّ عبر الترجمة التلقائية للعقد (نصوص يبنيها الكود) يُحدَّث هنا */
function syncLang(l) {
  setLocLang(l);
  applyTheme(document.body.getAttribute('data-theme'));
  $('langBtn').querySelector('.lbl').textContent = l === 'fr' ? 'العربية' : 'Français';
  $('lbPrev').textContent = l === 'fr' ? '‹' : '›';        // أسهم المعاينة تتبع اتجاه الصفحة
  $('lbNext').textContent = l === 'fr' ? '›' : '‹';
  if (window.desktop && window.desktop.setLang) window.desktop.setLang(l);
  try { updateLibButton(); } catch (e) { /* قبل تهيئة المكتبة */ }
  if (state.images.length) render();
  updateStats();
  if (statusFn) setStatus(statusFn);
}

function init() {
  Pool.init();
  window.__das = { pool: () => ({ ok: Pool.ok, size: Pool.size }) };   // للاختبارات
  if (window.desktop) window.desktop.onOpenFiles((list) => handleFiles(list.map((f) => { const file = new File([f.data], f.name); file.__path = f.path || ''; return file; })));   // غلاف Electron
  $('fileInp').accept = ACCEPT;
  loadSettings();
  onLang(syncLang);
  syncLang(getLang());
  $('langBtn').onclick = () => { setLang(getLang() === 'fr' ? 'ar' : 'fr'); saveSettings(); };
  initEditorRefs();
  wireEditorPointer();

  $('themeBtn').onclick = () => {
    applyTheme(document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    saveSettings();
  };
  const setDrawer = (on) => { document.body.classList.toggle('drawer-open', on); $('settingsBtn').setAttribute('aria-expanded', String(on)); if (on) $('settingsPanel').focus(); else $('settingsBtn').focus(); };
  $('settingsBtn').onclick = () => setDrawer(!document.body.classList.contains('drawer-open'));
  $('settingsClose').onclick = () => setDrawer(false);
  $('drawerBackdrop').onclick = () => setDrawer(false);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.body.classList.contains('drawer-open')) setDrawer(false);
    if (window.desktop && window.desktop.exitFullscreen) window.desktop.exitFullscreen();     // Esc ينهي ملء الشاشة في نسخة سطح المكتب
  });
  initBackButton(() => {
    if ($('lightbox').style.display === 'flex') { closeLB(); return true; }
    if (editorOpen()) { closeEditor(true); return true; }
    for (const id of ['exportModal', 'libModal']) if ($(id).style.display !== 'none') { $(id).style.display = 'none'; return true; }
    if (document.body.classList.contains('drawer-open')) { setDrawer(false); return true; }
    return false;
  });
  $('scrollTopBtn').onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  for (const id of PERSISTED) {
    $(id).addEventListener('change', () => { syncSettingOutputs(); saveSettings(); });
    $(id).addEventListener('input', syncSettingOutputs);
  }
  $('filterType').addEventListener('change', render);

  const dz = $('dropZone'), inp = $('fileInp');
  dz.onclick = () => inp.click();
  dz.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('dragover'); };
  dz.ondragleave = () => dz.classList.remove('dragover');
  dz.ondrop = (e) => {
    e.preventDefault(); dz.classList.remove('dragover');
    const fl = e.dataTransfer && e.dataTransfer.files;
    if (fl && fl.length) handleFiles(fl);
  };
  inp.addEventListener('change', () => {
    const fl = Array.from(inp.files);
    inp.value = '';
    if (fl.length) handleFiles(fl);
  });
  $('cancelBtn').onclick = () => { state.cancel = true; };

  $('selectAllBtn').onclick = toggleSelectAll;
  $('invertBtn').onclick = invertSelection;
  $('dupBtn').onclick = detectDuplicates;
  $('sortBtn').onclick = sortBySimilarity;
  $('renameBtn').onclick = renameByLoc;
  $('suggestBtn').onclick = () => applySuggestions(state.images.filter((i) => i.selected));
  $('saveLibBtn').onclick = saveSelectedToLibrary;
  initLibrary({ $, el, toast, sanitizeName, state, download: downloadBlob, openFile: (f) => handleFiles([f]) })
    .then(() => { refreshInsights(state.images); if (state.images.length) render(); });
  $('deleteBtn').onclick = deleteSelected;
  $('downloadBtn').onclick = downloadSelectedZip;
  $('exportMoreBtn').onclick = openExport;
  $('exClose').onclick = closeExport;
  $('exportModal').addEventListener('click', (e) => { if (e.target.id === 'exportModal') closeExport(); });
  $('exOrganized').onclick = () => exportAdvanced('organized');
  $('exBoard').onclick = () => exportAdvanced('board');

  $('lbPrev').onclick = () => stepLB(-1);
  $('lbNext').onclick = () => stepLB(1);
  $('lbClose').onclick = closeLB;

  $('btnCrop').onclick = () => setTool('crop');
  $('btnEraser').onclick = () => setTool('eraser');
  $('btnRot').onclick = () => transformCanvas(90);
  $('btnFlipH').onclick = () => transformCanvas(0, 'h');
  $('btnFlipV').onclick = () => transformCanvas(0, 'v');
  $('btnUndo').onclick = undoAction;
  $('btnRedo').onclick = redoAction;
  $('btnSplit').onclick = executeSplit;
  $('saveEditBtn').onclick = saveEditClicked;
  $('edClose').onclick = () => closeEditor(true);
  $('splitRows').addEventListener('input', drawSplitPreview);
  $('splitCols').addEventListener('input', drawSplitPreview);
  $('splitRows').addEventListener('focus', drawSplitPreview);
  $('splitCols').addEventListener('focus', drawSplitPreview);

  window.addEventListener('resize', () => { if (editorOpen() && ED.canvas) layoutEditor(); });

  document.addEventListener('keydown', (e) => {
    const inField = /^(INPUT|SELECT|TEXTAREA)$/.test((e.target && e.target.tagName) || '');
    if ($('lightbox').style.display === 'flex') {
      if (e.key === 'Escape') closeLB();
      else if (e.key === 'ArrowLeft') stepLB(getLang() === 'fr' ? -1 : 1);
      else if (e.key === 'ArrowRight') stepLB(getLang() === 'fr' ? 1 : -1);
      return;
    }
    if (editorOpen()) {
      if (e.key === 'Escape') { closeEditor(true); return; }
      if (inField && e.target.type !== 'range') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redoAction() : undoAction(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redoAction(); }
    }
  });

  updateStats();
}
init();


/* شاشة الترحيب: تُزال بعد انتهاء تلاشيها، أو فوراً بنقرة/مفتاح، أو في الاختبارات الآلية */
(function splash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const kill = () => { el.classList.add('is-gone'); el.remove(); };
  if (navigator.webdriver) { kill(); return; }
  const skip = () => { el.style.animation = 'splashOut .25s ease forwards'; setTimeout(kill, 280); };
  el.addEventListener('click', skip);
  window.addEventListener('keydown', skip, { once: true });
  setTimeout(kill, 3400);
})();
