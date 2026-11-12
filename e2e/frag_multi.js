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
  setStatus(`⏳ ${tag}جاري قراءة ${file.name}...`);
  const zip = await JSZip.loadAsync(file);
  const { entries, unsupported } = await ex.scan(zip, { useCrop: $('useSrcRect').checked });
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
        name: k === 0 ? stem : `${stem}_v${k + 1}`, category: e.category, locs: v.locs, crop: v.crop,
        trim: true, alt: v.alt, source: info.source
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
      setStatus(`⏳ ${tag}معالجة ${done} / ${entries.length} ...`);
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
  if (state.busy) { toast('هناك معالجة جارية، انتظر أو اضغط إلغاء.'); return; }
  const all = Array.from(input || []);
  const files = all.filter((f) => pickExtractor(f.name));
  if (!files.length) {
    toast(`الصيغة غير مدعومة. المدعوم: ${FORMATS_LABEL} (الملفات القديمة .ppt/.doc غير مدعومة).`, { duration: 6000 });
    return;
  }
  if (files.length < all.length) toast(`تم تجاهل ${all.length - files.length} ملف بصيغة غير مدعومة.`, { duration: 6000 });

  const append = $('appendMode').checked && state.images.length > 0;
  if (!append) resetAll();
  const labels = sourceLabels(files);
  const multi = files.length > 1 || (append && state.sources.size > 0);
  state.busy = true; state.cancel = false;
  if (files.length === 1 && !append) state.sourceName = files[0].name.replace(/\.[^.]+$/, '');
  showProgress(true, 0);

  const totals = { tooSmall: 0, failed: 0, cropped: 0, unsupported: 0, badFiles: 0 };
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
    if (state.sources.size > 1) render();       // ليظهر اسم المستند على كل البطاقات
    const added = state.images.length - before;
    const notes = [];
    if (totals.cropped) notes.push(`طُبّق القص الأصلي للمستند على ${totals.cropped}`);
    if (totals.tooSmall) notes.push(`${totals.tooSmall} صغيرة جداً`);
    if (totals.unsupported) notes.push(`${totals.unsupported} بصيغ غير مدعومة (EMF/WMF/TIFF...)`);
    if (totals.failed) notes.push(`${totals.failed} تعذّر فك ترميزها`);
    if (totals.badFiles && files.length > 1) notes.push(`${totals.badFiles} ملف تعذّرت قراءته`);
    const tail = notes.length ? ` — ${notes.join('، ')}` : '';
    const from = files.length === 1 ? `ملف ${lastEx.label}` : `${files.length - totals.badFiles} ملفات`;
    if (files.length === 1 && totals.badFiles) setStatus(`❌ تعذّرت قراءة الملف (قد يكون تالفاً أو ليس ملف ${lastEx.label} صالحاً).`);
    else if (state.cancel) setStatus(`⏹️ تم الإلغاء بعد ${added} صورة${tail}`);
    else if (added) setStatus(`✅ تم استخراج ${added} صورة من ${from}${tail}`);
    else setStatus(`⚠️ لم يتم العثور على صور صالحة${tail}`);
  } finally {
    state.busy = false;
    showProgress(false);
    updateStats();
  }
}

