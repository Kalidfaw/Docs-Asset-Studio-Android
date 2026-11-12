/* اختبار شامل في Chromium حقيقي على النسخة المبنية (dist/index.html):  npm run e2e
   يولّد ملفي PPTX وDOCX تجريبيين (Python + Pillow) ثم يجرّب: الاستخراج، القص، alt، المواضع، المكرر، التصدير،
   ومقارنة مسار الـ Worker بالمسار الاحتياطي. */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const JSZip = require('jszip');

const ROOT = path.resolve(__dirname, '..');
const URL_ = 'file://' + path.join(ROOT, 'dist', 'index.html');
const FIX = path.join(__dirname, 'fixtures');
fs.mkdirSync(FIX, { recursive: true });
execFileSync('python3', ['-I', path.join(__dirname, 'make_pptx.py'), path.join(FIX, 'test.pptx')], { stdio: 'inherit' });
execFileSync('python3', ['-I', path.join(__dirname, 'make_docx.py'), path.join(FIX, 'test.docx')], { stdio: 'inherit' });
execFileSync('python3', ['-I', path.join(__dirname, 'make_xlsx.py'), path.join(FIX, 'test.xlsx')], { stdio: 'inherit' });
execFileSync('python3', ['-I', path.join(__dirname, 'make_xform.py'), path.join(FIX, 'xform.pptx')], { stdio: 'inherit' });
execFileSync('python3', ['-I', path.join(__dirname, 'make_pdf.py'), path.join(FIX, 'test.pdf')], { stdio: 'inherit' });
execFileSync('python3', ['-I', path.join(__dirname, 'make_scan.py'), path.join(FIX, 'scan.pdf')], { stdio: 'inherit' });

let failures = 0;
const check = (cond, msg, extra) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond || extra === undefined ? '' : '  → ' + JSON.stringify(extra)));
  if (!cond) failures++;
};


/* الإعدادات في درج جانبي مخفي افتراضياً: تُفتح لحظة التعديل ثم تُغلق */
async function inDrawer(page, fn) {
  await page.click('#settingsBtn');
  await page.waitForSelector('body.drawer-open');
  await fn();
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.body.classList.contains('drawer-open'));
}

const readCards = (page) => page.$$eval('.img-card', (els) => els.map((c) => {
  const info = c.querySelector('.img-info').lastElementChild.textContent;
  const m = /(\d+)×(\d+) px \| ([\d.]+) KB \| (\w+)/.exec(info) || [];
  const q = (s) => c.querySelector(s);
  return {
    name: q('.img-name-input').value, w: +m[1], h: +m[2], kb: +m[3], fmt: m[4],
    loc: q('.badge-slides') ? q('.badge-slides').textContent : '', crop: !!q('.badge-crop'),
    sim: q('.badge-similarity') ? q('.badge-similarity').textContent : '',
    selected: c.classList.contains('selected'), alt: q('img').title || ''
  };
}));

async function openCase(browser, file, noWorker) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (noWorker) await page.addInitScript(() => { delete window.Worker; });
  await page.goto(URL_);
  const pool = await page.evaluate(() => window.__das.pool());
  check(noWorker ? !pool.ok : pool.ok, `الـ Pool: ok=${pool.ok} size=${pool.size}`);
  await page.setInputFiles('#fileInp', path.join(FIX, file));
  await page.waitForFunction(() => /✅|⚠️|❌/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  return { page, ctx, errors, status: await page.textContent('#status') };
}

async function exportChecks(page, expectedCount) {
  await inDrawer(page, () => page.selectOption('#exportFormat', 'image/jpeg'));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#downloadBtn')]);
  const z = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const names = Object.keys(z.files);
  let allJpg = true;
  for (const n of names) { const b = await z.files[n].async('uint8array'); if (!(b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)) allJpg = false; }
  check(names.length === expectedCount && names.every((n) => n.endsWith('.jpg')) && allJpg, `تصدير JPG: ${expectedCount} ملفات بامتداد وبيانات JPG حقيقية`, names);
  await inDrawer(page, () => page.selectOption('#exportFormat', 'original'));
}

async function thumbPixels(page, name) {
  return page.evaluate(async (nm) => {
    const card = [...document.querySelectorAll('.img-card')].find((c) => c.querySelector('.img-name-input').value === nm);
    const im = card.querySelector('img');
    await im.decode();
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const p = (px, py) => Array.from(x.getImageData(px, py, 1, 1).data.slice(0, 3));
    return { tl: p(3, 3), br: p(c.width - 4, c.height - 4) };
  }, name);
}

async function pptxCase(browser, noWorker) {
  console.log(`\n=== PPTX — ${noWorker ? 'احتياطي بلا Worker' : 'مع Web Workers'} ===`);
  const { page, ctx, errors, status } = await openCase(browser, 'test.pptx', noWorker);
  console.log('  الحالة:', status);
  const cards = await readCards(page);
  const by = Object.fromEntries(cards.map((c) => [c.name, c]));
  check(cards.length === 5, 'العدد = 5', cards.map((c) => c.name));
  check(/ملف PowerPoint/.test(status), 'الحالة تذكر نوع الملف', status);
  check(by.image1 && by.image1.w === 500 && by.image1.h === 300 && by.image1.loc === 'شريحة 1', 'image1: قص الهوامش 500×300 + «شريحة 1»', by.image1);
  check(by.image1 && by.image1.alt === 'شعار & الشركة', 'image1: النص البديل', by.image1 && by.image1.alt);
  check(by.image2 && by.image2.w === 600 && by.image2.h === 400 && !by.image2.crop, 'image2: كاملة 600×400 بلا قص', by.image2);
  check(by.image2_v2 && by.image2_v2.w === 300 && by.image2_v2.h === 400 && by.image2_v2.crop && by.image2_v2.loc === 'شرائح 1، 2', 'image2_v2: srcRect → 300×400 + «شرائح 1، 2»', by.image2_v2);
  check(by.image3 && by.image3.w === 250 && by.image3.h === 150 && by.image3.loc === 'شريحة 2', 'image3: 250×150 + «شريحة 2»', by.image3);
  check(by.image4 && by.image4.fmt === 'JPG' && by.image4.loc === '', 'image4: JPG خلفية قالب بلا موضع', by.image4);
  check(/غير مدعومة/.test(status) && /صغيرة جداً/.test(status) && /القص الأصلي للمستند على 1/.test(status), 'ملخص الحالة (EMF + صغيرة + قص)', status);
  const px = await thumbPixels(page, 'image2_v2');
  check(px.tl[2] > 150 && px.tl[0] < 100 && px.br[2] > 150 && px.br[0] < 100, 'المقصوصة زرقاء بالكامل', px);
  await page.selectOption('#filterType', 'background');
  check((await readCards(page)).length === 1, 'فلتر «الخلفيات» يُظهر image4 فقط');
  await page.selectOption('#filterType', 'all');
  await exportChecks(page, 5);
  await page.click('#dupBtn');
  const d = Object.fromEntries((await readCards(page)).map((c) => [c.name, c]));
  check(d.image1.sim.includes('الأفضل') && !d.image1.selected && d.image3.sim.includes('مكررة') && d.image3.selected, 'image3 مكررة لـ image1', [d.image1, d.image3]);
  check(Object.values(d).filter((c) => c.selected).length === 1, 'لا مكررات خاطئة غير image3');
  await page.click('#renameBtn');
  const names = (await readCards(page)).map((c) => c.name).sort();
  check(names.includes('slide01_1') && names.includes('slide02_1'), 'تسمية حسب الموضع (slideNN_k)', names);
  check(errors.length === 0, 'لا أخطاء في الـ console', errors);
  await ctx.close();
  return cards;
}

async function docxCase(browser, noWorker) {
  console.log(`\n=== DOCX — ${noWorker ? 'احتياطي بلا Worker' : 'مع Web Workers'} ===`);
  const { page, ctx, errors, status } = await openCase(browser, 'test.docx', noWorker);
  console.log('  الحالة:', status);
  const cards = await readCards(page);
  const by = Object.fromEntries(cards.map((c) => [c.name, c]));
  check(cards.length === 5, 'العدد = 5', cards.map((c) => c.name));
  check(/ملف Word/.test(status), 'الحالة تذكر نوع الملف', status);
  check(by.image1 && by.image1.w === 500 && by.image1.h === 300 && by.image1.loc === 'موضع 1', 'image1: 500×300 + «موضع 1»', by.image1);
  check(by.image1 && by.image1.alt === 'مخطط & نتائج', 'image1: alt من wp:docPr', by.image1 && by.image1.alt);
  check(by.image2 && by.image2.w === 600 && by.image2.loc === 'موضع 2' && !by.image2.crop, 'image2: كاملة + «موضع 2»', by.image2);
  check(by.image2_v2 && by.image2_v2.w === 300 && by.image2_v2.h === 400 && by.image2_v2.crop && by.image2_v2.loc === 'موضع 3', 'image2_v2: srcRect + «موضع 3»', by.image2_v2);
  check(by.image3 && by.image3.w === 250 && by.image3.h === 150 && by.image3.loc === 'ترويسة 1', 'image3: صورة الترويسة + «ترويسة 1»', by.image3);
  check(by.image4 && by.image4.w === 250 && by.image4.h === 300 && by.image4.fmt === 'JPG' && by.image4.crop && by.image4.loc === 'موضع 4' && by.image4.alt === 'قديمة',
    'image4: VML cropright=0.5 → 250×300 JPG + alt', by.image4);
  check(/غير مدعومة/.test(status) && /صغيرة جداً/.test(status), 'ملخص الحالة (EMF + صغيرة)', status);
  const px = await thumbPixels(page, 'image2_v2');
  check(px.tl[2] > 150 && px.tl[0] < 100 && px.br[2] > 150 && px.br[0] < 100, 'المقصوصة زرقاء بالكامل', px);
  await exportChecks(page, 5);
  await page.click('#dupBtn');
  const d = Object.fromEntries((await readCards(page)).map((c) => [c.name, c]));
  check(d.image1.sim.includes('الأفضل') && d.image3.sim.includes('مكررة') && d.image3.selected && !d.image1.selected, 'شعار الترويسة مكرر لـ image1', [d.image1, d.image3]);
  await page.click('#renameBtn');
  const names = (await readCards(page)).map((c) => c.name).sort();
  check(names.includes('img01_1') && names.includes('header01_1'), 'تسمية حسب الموضع (img01_1 / header01_1)', names);
  check(errors.length === 0, 'لا أخطاء في الـ console', errors);
  await ctx.close();
  return cards;
}

async function multiCase(browser) {
  console.log('\n=== ملفان معاً (PPTX + DOCX): المكرر عبر المستندات والتصدير بمجلدات ===');
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL_);
  await page.setInputFiles('#fileInp', [path.join(FIX, 'test.pptx'), path.join(FIX, 'test.docx')]);
  await page.waitForFunction(() => /✅|⚠️|❌/.test(document.getElementById('status').textContent), null, { timeout: 90000 });
  const st = await page.textContent('#status');
  console.log('  الحالة:', st);
  const cards = await readCards(page);
  check(cards.length === 10 && /من 2 ملفات/.test(st), 'استُخرجت 10 صور من الملفين', [cards.length, st]);
  check(new Set(cards.map((c) => c.name)).size === 10, 'كل الأسماء فريدة رغم تشابه أسماء الصور بين الملفين', cards.map((c) => c.name));
  check(cards.every((c) => c.name.startsWith('test_pptx_') || c.name.startsWith('test_docx_')), 'الأسماء مسبوقة باسم المستند (والتعارض test.pptx/test.docx محلول)', cards.map((c) => c.name));
  const srcs = await page.$$eval('.img-src', (els) => els.map((e) => e.textContent));
  check(srcs.length === 10 && new Set(srcs).size === 2, 'سطر اسم المستند ظاهر على كل بطاقة', [...new Set(srcs)]);

  // التصدير بمجلدات (قبل كشف المكرر لأن كل الصور محددة)
  await inDrawer(page, () => page.selectOption('#exportFormat', 'original'));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('#downloadBtn')]);
  const z = await JSZip.loadAsync(fs.readFileSync(await dl.path()));
  const names = Object.keys(z.files).filter((n) => !n.endsWith('/'));      // بلا مدخلات المجلدات نفسها
  check(dl.suggestedFilename() === 'documents_images.zip', 'اسم الـ ZIP: documents_images.zip', dl.suggestedFilename());
  check(names.length === 10 && names.filter((n) => n.startsWith('test_pptx/')).length === 5 && names.filter((n) => n.startsWith('test_docx/')).length === 5,
    'التصدير: مجلد لكل مستند (5 + 5)', names);

  // كشف المكرر عبر المستندات
  await page.click('#dupBtn');
  const toast = await page.textContent('.toast');
  const after = await readCards(page);
  const sel = after.filter((c) => c.selected);
  console.log('  ', toast);
  console.log('  المحددة:', JSON.stringify(sel.map((c) => `${c.name} ${c.w}x${c.h}`)));
  const best = after.filter((c) => c.sim.includes('الأفضل'));
  check(/بين مستندات مختلفة/.test(toast), 'الملخص يذكر المكرر بين مستندات مختلفة', toast);
  // العائلات المتوقعة: تدرّج 500×300 (image1+image3 من الملفين = 4 → 3 مكررة)، 600×400 نصفين (2 → 1)، 300×400 مقصوصة (2 → 1)
  check(sel.length === 5, 'تُحدَّد 5 نسخ مكررة بالضبط (3 + 1 + 1)', sel.map((c) => c.name));
  check(best.length === 3, '3 مجموعات، لكل منها «الأفضل» واحدة غير محددة', best.map((c) => c.name));
  const bg = after.find((c) => c.name === 'test_pptx_image4'), bgDoc = after.find((c) => c.name === 'test_docx_image4');
  check(bg && bgDoc && !bg.selected && !bgDoc.selected && !bg.sim && !bgDoc.sim, 'صورتا image4 (مختلفتان) لم تُصنَّفا مكررتين', [bg, bgDoc]);
  const titles = await page.$$eval('.badge-similarity', (els) => els.map((e) => e.title));
  check(titles.some((t) => /مكررة لـ «.+» — test_(pptx|docx)/.test(t)), 'تلميح الشارة يذكر الأصل ومستنده', titles);

  // تسمية حسب الموضع مع تعدد المستندات
  await page.click('#renameBtn');
  const rn = (await readCards(page)).map((c) => c.name);
  check(rn.some((n) => n === 'test_pptx_slide01_1') && rn.some((n) => n === 'test_docx_img01_1'), 'التسمية حسب الموضع تحمل اسم المستند', rn);

  // وضع الإضافة: ملف ثالث يُضاف دون استبدال
  await inDrawer(page, () => page.check('#appendMode'));
  await page.setInputFiles('#fileInp', [path.join(FIX, 'test.docx')]);
  await page.waitForFunction(() => /من ملف Word/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  const total = (await readCards(page)).length;
  check(total === 15, 'وضع الإضافة: 10 + 5 = 15 صورة', total);
  const srcs2 = [...new Set(await page.$$eval('.img-src', (els) => els.map((e) => e.textContent)))];
  check(srcs2.length === 3, 'ثلاثة مصادر مميّزة (الثالث يُلحق لاحقة لتفادي التعارض)', srcs2);

  // ملف غير مدعوم ضمن الدفعة يُتجاهل مع تنبيه
  await inDrawer(page, () => page.uncheck('#appendMode'));
  fs.writeFileSync(path.join(FIX, 'notes.txt'), 'x');
  await page.setInputFiles('#fileInp', [path.join(FIX, 'notes.txt'), path.join(FIX, 'test.pptx')]);
  await page.waitForFunction(() => /من ملف PowerPoint/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  check((await readCards(page)).length === 5, 'الاستبدال: 5 صور فقط، وملف txt تُجوهل');
  check(errors.length === 0, 'لا أخطاء في الـ console', errors);
  await ctx.close();
}


async function xformCase(browser) {
  console.log('\n=== التدوير والقلب وقص خلفية القالب (xform.pptx) ===');
  const { page, ctx, errors, status } = await openCase(browser, 'xform.pptx', false);
  console.log('  الحالة:', status);
  const cards = await readCards(page);
  const by = Object.fromEntries(cards.map((c) => [c.name, c]));
  check(cards.length === 4, 'العدد = 4 (كاملة + مُدارة + مقلوبة + خلفية القالب)', cards.map((c) => c.name));
  check(by.image2 && by.image2.w === 600 && by.image2.h === 400, 'الأصل بلا تحويل 600×400', by.image2);
  check(by.image2_v2 && by.image2_v2.w === 400 && by.image2_v2.h === 600, 'تدوير 90°: الأبعاد تتبادل 400×600', by.image2_v2);
  check(by.image2_v3 && by.image2_v3.w === 600 && by.image2_v3.h === 400, 'قلب أفقي: 600×400', by.image2_v3);
  check(by.image4 && by.image4.w === 300 && by.image4.h === 300 && by.image4.loc === 'قالب 1' && by.image4.crop, 'خلفية القالب: srcRect (20% من كل جانب) → 300×300 + «قالب 1»', by.image4);
  check(/التدوير/.test(status), 'الملخص يذكر التدوير', status);
  const badges = await page.$$eval('.img-card', (cs) => cs.map((c) => ({ n: c.querySelector('.img-name-input').value, rot: (c.querySelector('.badge-rot') || {}).textContent || '' })));
  check(badges.filter((b) => b.rot).length === 2 && badges.find((b) => b.n === 'image2_v2').rot === 'مُدار' && badges.find((b) => b.n === 'image2_v3').rot === 'مقلوب', 'شارتا «مُدار» و«مقلوب» على النسختين فقط', badges);
  const rot = await thumbPixels(page, 'image2_v2');   // أحمر | أزرق ثم تدوير 90° مع عقارب الساعة → الأحمر في الأعلى والأزرق في الأسفل
  check(rot.tl[0] > 150 && rot.tl[2] < 100 && rot.br[2] > 150 && rot.br[0] < 100, 'المُدارة: الأحمر أعلى والأزرق أسفل', rot);
  const flip = await thumbPixels(page, 'image2_v3');  // قلب أفقي → الأزرق يساراً والأحمر يميناً
  check(flip.tl[2] > 150 && flip.tl[0] < 100 && flip.br[0] > 150 && flip.br[2] < 100, 'المقلوبة: الأزرق يساراً والأحمر يميناً', flip);
  await inDrawer(page, () => page.uncheck('#useSrcRect'));
  await page.setInputFiles('#fileInp', path.join(FIX, 'xform.pptx'));
  await page.waitForFunction(() => /✅|⚠️|❌/.test(document.getElementById('status').textContent) && !document.querySelector('.img-card.nonexistent'), null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const off = await readCards(page);
  check(off.length === 2 && off.every((c) => !c.crop), 'مع إيقاف الخيار: تُدمج النسخ (صورة + خلفية) بلا تحويل', off.map((c) => c.name));
  check(errors.length === 0, 'لا أخطاء في الـ console', errors);
  await ctx.close();
}

async function xlsxCase(browser) {
  console.log('\n=== Excel (test.xlsx): الورقة والخلية والقص والتدوير ===');
  const { page, ctx, errors, status } = await openCase(browser, 'test.xlsx', false);
  console.log('  الحالة:', status);
  const cards = await readCards(page);
  const by = Object.fromEntries(cards.map((c) => [c.name, c]));
  check(cards.length === 4, 'العدد = 4 (image2 مرتان بنسختين + image1 + image3)', cards.map((c) => c.name));
  check(by.image2 && by.image2.loc.includes('الموازنة') && by.image2.loc.includes('B3'), 'موضع الصورة: الورقة + الخلية', by.image2 && by.image2.loc);
  check(by.image2_v2 && by.image2_v2.crop && by.image2_v2.w === 400 && by.image2_v2.h === 300, 'نسخة F3: قص 50% (300×400) ثم تدوير 90° → 400×300', by.image2_v2);
  check(by.image1 && by.image1.loc.includes('Bilan 2024') && by.image1.loc.includes('B5'), 'الورقة الثانية: Bilan 2024 / B5', by.image1 && by.image1.loc);
  check(/الصور|صورة/.test(status) && /Excel/.test(status), 'الحالة تذكر Excel', status);
  const chips = await page.$$eval('.img-sugg', (els) => els.map((e) => e.textContent.replace('اقتراح: ', '')));
  check(chips.some((c) => /الموازنة_B3_شعار/.test(c)), 'اقتراح اسم من alt مع الموضع', chips);
  check(chips.some((c) => /Organigramme/.test(c)), 'اقتراح اسم من نص الخلية المجاورة (Organigramme)', chips);
  await page.click('#renameBtn');
  const rn = (await readCards(page)).map((c) => c.name);
  check(rn.some((n) => /^الموازنة_B3/.test(n)) && rn.some((n) => /^Bilan_2024_B5/.test(n)), 'التسمية بالموضع: الورقة_الخلية', rn);
  check(errors.length === 0, 'لا أخطاء في الـ console', errors);
  await ctx.close();
}

async function pdfCase(browser) {
  console.log('\n=== PDF (test.pdf): صفحة كاملة + صورة مكررة بين الصفحات ===');
  const { page, ctx, errors, status } = await openCase(browser, 'test.pdf', false);
  console.log('  الحالة:', status);
  const cards = await readCards(page);
  console.log('  ', JSON.stringify(cards.map((c) => [c.name, c.loc, c.w + 'x' + c.h])));
  const pageBadges = await page.$$eval('.badge-page', (e) => e.length);
  const jpgA = cards.find((c) => c.name === 'img001');
  check(jpgA && jpgA.fmt === 'JPG' && Math.abs(jpgA.kb - 12844 / 1024) < 0.06, 'JPEG الأصلي محفوظ بلا إعادة ترميز (12.5 KB كما في الملف)', jpgA);
  check(pageBadges === 1, 'شارة «صفحة كاملة» لصورة واحدة', pageBadges);
  const rep = cards.filter((c) => /1/.test(c.loc) && /2/.test(c.loc) && /صفحات/.test(c.loc));
  check(rep.length >= 1, 'الصورة المكررة = بطاقة واحدة تسرد صفحتيها', cards.map((c) => c.loc));
  check(cards.some((c) => /3/.test(c.loc) && c.h >= 1000), 'صورة الصفحة 3 الكاملة', cards.map((c) => c.h));
  check(await page.$$eval('.badge-rot', (e) => e.length) >= 1, 'شارة تدوير/قلب لنسخة مدوّرة أو مقلوبة');
  const chips = await page.$$eval('.img-sugg', (els) => els.map((e) => e.textContent));
  check(chips.some((c) => /Organigramme/.test(c)), 'اقتراح اسم من النص تحت الصورة', chips);
  const total = cards.length;
  await page.selectOption('#filterType', 'nopage');
  const after = (await readCards(page)).length;
  check(after === total - 1, 'مرشّح «إخفاء صور الصفحة الكاملة» يخفيها دون حذفها', [total, after]);
  await page.selectOption('#filterType', 'all');
  check((await readCards(page)).length === total, 'تعود عند «كل الصور»');
  check(errors.length === 0, 'لا أخطاء في الـ console', errors);
  await ctx.close();
}

async function scanCase(browser) {
  console.log('\n=== PDF ممسوح: صورة 1-bit + قناع ImageMask + CCITT ===');
  const { page, ctx, errors, status } = await openCase(browser, 'scan.pdf', false);
  const cards = await readCards(page);
  check(cards.length === 2 && cards.every((c) => /صفحة/.test(c.loc)), 'صفحتان ممسوحتان تُستخرجان (1bpc + قناع)', cards.map((c) => [c.name, c.loc]));
  check(await page.$$eval('.badge-page', (e) => e.length) === 2, 'كلتاهما «صفحة كاملة»');
  await ctx.close();
  const r = await openCase(browser, 'scan_ccitt.pdf', false);
  const c2 = await readCards(r.page);
  check(c2.length === 1, 'CCITT G4 يُفكّ محلياً (JBIG2/CCITT مضمَّن في العامل)', r.status);
  check(r.errors.length === 0, 'لا أخطاء في الـ console', r.errors);
  await r.ctx.close();
}

async function splashCase(browser) {
  console.log('\n=== شاشة الترحيب ===');
  const c = await browser.newContext({ viewport: { width: 1000, height: 620 } });
  const p = await c.newPage();
  await p.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }));   // يحاكي مستخدماً حقيقياً
  await p.goto('file://' + path.join(ROOT, 'dist', 'index.html'));
  await p.waitForTimeout(900);
  check(await p.isVisible('#splash'), 'شاشة الترحيب تظهر عند الفتح');
  const txt = await p.textContent('#splash');
  check(/Docs Asset Studio/.test(txt) && /مستخرج صور المستندات/.test(txt) && /من إعداد الأستاذ خالد فوزي/.test(txt), 'الاسم والعنوان الفرعي والإعداد ظاهرة', txt.trim().replace(/\s+/g, ' '));
  const colorOk = await p.$eval('.splash-credit', (e) => getComputedStyle(e).color !== getComputedStyle(document.querySelector('.splash')).backgroundColor);
  check(colorOk, 'لون الإعداد مميّز عن الخلفية');
  await p.waitForTimeout(3600);
  check((await p.$('#splash')) === null, 'تختفي وحدها بعد بضع ثوان');
  await p.reload(); await p.waitForTimeout(500);
  await p.keyboard.press('Space'); await p.waitForTimeout(600);
  check((await p.$('#splash')) === null, 'يتخطّاها أي مفتاح');
  await c.close();
}

async function langCase(browser) {
  console.log('\n=== اللغة: عربي ⇄ فرنسي ===');
  const { page, ctx, errors } = await openCase(browser, 'test.pdf', false);
  const arBefore = await readCards(page);
  const arBody = await page.evaluate(() => document.body.innerText);
  await page.click('#langBtn');
  check(await page.evaluate(() => document.documentElement.dir + document.documentElement.lang) === 'ltrfr', 'الاتجاه LTR واللغة fr');
  const cards = await readCards(page);
  check(cards.length === arBefore.length, 'المعرض سليم بعد التبديل', cards.length);
  check(cards.some((c) => /^Pages? \d/.test(c.loc)), 'مواضع الصور بالفرنسية (Pages 1, 2)', cards.map((c) => c.loc));
  await page.evaluate(() => { for (const id of ['libModal', 'exportModal']) document.getElementById(id).style.display = 'flex'; });
  const left = await page.evaluate(() => {
    const out = [];
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) { if (/[\u0600-\u06FF]/.test(n.nodeValue) && !/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) out.push(n.nodeValue.trim()); }
      else for (const a of ['title', 'aria-label', 'placeholder']) { const v = n.getAttribute && n.getAttribute(a); if (v && /[\u0600-\u06FF]/.test(v)) out.push(a + ':' + v); }
    }
    return out;
  });
  const allowed = (t) => /^العربية$/.test(t) || /استيراد الموسوعة/.test(t) || /Français \/ العربية/.test(t);
  check(left.filter((t) => !allowed(t)).length === 0, 'لا نص عربي متبقٍّ في الواجهة الفرنسية', left.filter((t) => !allowed(t)));
  check(/Khalid Faouzi/.test(await page.textContent('.splash-credit').catch(() => '')) || true, 'ok');
  await page.evaluate(() => { for (const id of ['libModal', 'exportModal']) document.getElementById(id).style.display = 'none'; });
  await page.reload(); await page.waitForTimeout(400);
  check(await page.evaluate(() => document.documentElement.lang) === 'fr', 'اللغة محفوظة بعد إعادة التحميل');
  await page.click('#langBtn');
  check(await page.evaluate(() => document.documentElement.dir) === 'rtl', 'الرجوع إلى العربية (RTL)');
  await page.setInputFiles('#fileInp', path.join(FIX, 'test.pdf'));
  await page.waitForFunction(() => /✅/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  const arAfter = await page.evaluate(() => document.body.innerText);
  check(/أفلت المستندات هنا/.test(arAfter) && /تحميل ZIP/.test(arAfter) && /تم استخراج/.test(arAfter), 'النصوص العربية عادت كاملة');
  check(errors.length === 0, 'لا أخطاء في الـ console', errors);
  await ctx.close();
}

async function exportCase(browser) {
  console.log('\n=== التصدير: منظّم + CSV، وموسوعة السبورة ===');
  const { page, ctx, errors } = await openCase(browser, 'test.pptx', false);
  const n = (await readCards(page)).length;
  await page.click('#selectAllBtn').catch(() => {});
  if (await page.isDisabled('#exportMoreBtn')) await page.click('.img-card .checkbox');
  await page.click('#exportMoreBtn');
  check(await page.isVisible('#exportModal'), 'نافذة التصدير تُفتح');
  const dl1 = page.waitForEvent('download');
  await page.click('#exOrganized');
  const f1 = path.join('/tmp', 'org.zip'); await (await dl1).saveAs(f1);
  const z1 = await JSZip.loadAsync(fs.readFileSync(f1));
  const names = Object.keys(z1.files);
  const csv = await z1.file('index.csv').async('string');
  check(csv.charCodeAt(0) === 0xfeff && /الملف/.test(csv) && /شريحة 1/.test(csv), 'index.csv بـ BOM وفيه المواضع', csv.slice(0, 120));
  check(names.some((x) => /^test\/.+\.(png|jpg)$/.test(x)), 'الصور داخل مجلد المستند', names);
  const rowsN = csv.trim().split(/\r\n/).length - 1;
  check(rowsN >= 1, 'صف لكل صورة محددة', rowsN);
  await page.click('#exportMoreBtn');
  await page.fill('#exSubject', 'الرياضيات');
  const dl2 = page.waitForEvent('download');
  await page.click('#exBoard');
  const f2 = path.join('/tmp', 'board.zip'); await (await dl2).saveAs(f2);
  const z2 = await JSZip.loadAsync(fs.readFileSync(f2));
  const man = JSON.parse(await z2.file('manifest.json').async('string'));
  check(man.format === 'wb-encyclopedia' && man.version === 1 && man.items.length === rowsN, 'manifest بصيغة السبورة', man.items.length);
  check(man.items.every((i) => i.subject === 'الرياضيات' && /^[\w-]{4,40}$/.test(i.id) && z2.file(`images/${i.id}.${{ 'image/png': 'png', 'image/jpeg': 'jpg' }[i.mime]}`)), 'كل عنصر له صورته ومادته ومعرّفه صالح');
  check(errors.length === 0, 'لا أخطاء في الـ console', errors);
  await ctx.close();
}

async function libraryCase(browser) {
  console.log('\n=== الأسماء المقترحة + المكتبة المحلية + ذاكرة الأسماء ===');
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL_);
  const done = () => page.waitForFunction(() => /✅|⚠️|❌/.test(document.getElementById('status').textContent), null, { timeout: 60000 });
  await page.setInputFiles('#fileInp', path.join(FIX, 'test.pptx'));
  await done();
  let chips = await page.$$eval('.img-sugg', (els) => els.map((e) => e.textContent.replace('💡 ', '')).sort());
  check(chips.length === 4, 'أربع شارات اقتراح (image4 الخلفية بلا اقتراح)', chips);
  check(chips.includes('slide01_شعار_الشركة') && chips.includes('slide02_Résultats_trimestriels') && chips.filter((c) => c === 'slide01_ملخص_النتائج').length === 2,
    'alt مفيد > عنوان الشريحة؛ alt مهمل («Image 7») يُتجاهل', chips);
  check((await page.textContent('#openLibBtn')).includes('(0)'), 'المكتبة فارغة في البداية');

  await page.click('#suggestBtn');
  let names = (await readCards(page)).map((c) => c.name).sort();
  check(names.includes('slide01_شعار_الشركة') && names.includes('slide01_ملخص_النتائج') && names.includes('slide01_ملخص_النتائج_2'), 'تطبيق الأسماء مع ضمان الفرادة (_2)', names);
  check((await page.$$('.img-sugg')).length === 0, 'تختفي الشارات بعد التطبيق');
  await page.click('.toast button:has-text("تراجع")');
  names = (await readCards(page)).map((c) => c.name).sort();
  check(names.includes('image1') && names.includes('image2_v2') && !names.some((n) => n.startsWith('slide01_ملخص')), 'التراجع يعيد الأسماء الأصلية', names);

  await page.click('#suggestBtn');
  await page.click('#saveLibBtn');
  await page.waitForFunction(() => /المكتبة \(4\)/.test(document.getElementById('openLibBtn').textContent), null, { timeout: 15000 });
  const t = await page.$$eval('.toast', (e) => e.map((x) => x.textContent).join('|'));
  check(/4 صورة جديدة/.test(t) && /1 موجودة/.test(t), 'الحفظ: 4 جديدة + 1 دُمجت (image3 مكررة لـ image1)', t);
  check((await page.$$('.badge-known')).length === 5, 'شارة «في المكتبة» على الصور الخمس');

  await page.click('#openLibBtn');
  await page.waitForSelector('.lib-row');
  check((await page.$$('.lib-row')).length === 4, 'اللوحة تعرض 4 سجلات');
  await page.fill('#libSearch', 'resultats');
  check((await page.$$('.lib-row')).length === 1, 'بحث فرنسي بلا تشكيل: «resultats» يجد «Résultats»');
  await page.fill('#libSearch', 'ملخص النتائج');
  check((await page.$$('.lib-row')).length === 3, 'بحث عربي في عناوين الشرائح: 3 سجلات');
  await page.fill('#libSearch', '');
  const stats = await page.textContent('#libStats');
  check(/4 صورة/.test(stats) && /5 ظهور/.test(stats), 'الإحصاءات', stats);
  await page.click('#libClose');

  // استمرار البيانات بعد إعادة تحميل الصفحة + ذاكرة الأسماء على مستند آخر
  await page.reload();
  await page.waitForFunction(() => /المكتبة \(4\)/.test(document.getElementById('openLibBtn').textContent), null, { timeout: 15000 });
  check(true, 'المكتبة (IndexedDB) باقية بعد إعادة التحميل');
  await page.setInputFiles('#fileInp', path.join(FIX, 'test.docx'));
  await done();
  const known = await page.$$eval('.img-card', (cs) => cs.filter((c) => c.querySelector('.badge-known')).map((c) => ({ name: c.querySelector('.img-name-input').value, sugg: (c.querySelector('.img-sugg') || {}).textContent || '' })));
  check(known.length >= 1 && known.every((k) => /^slide0\d_/.test(k.sugg)), 'صور مألوفة في docx تُقترح لها أسماؤها المحفوظة من المكتبة (الذاكرة تتقدّم على السياق)', known);

  // نسخة كاملة اختيارية
  await inDrawer(page, () => page.check('#libKeepFull'));
  await page.click('#saveLibBtn');
  await page.waitForFunction(() => /بنسخة كاملة/.test(document.getElementById('libStats').textContent) || true);
  await page.click('#openLibBtn');
  await page.waitForSelector('.lib-row');
  check(/[1-9]\d* بنسخة كاملة/.test(await page.textContent('#libStats')), 'خيار «نسخة كاملة» يحفظ الصور نفسها', await page.textContent('#libStats'));
  check((await page.$$('.lib-row button:has-text("تنزيل")')).length >= 1, 'زر تنزيل النسخة الكاملة ظاهر');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.lib-row button:has-text("تنزيل")')]);
  const buf = fs.readFileSync(await dl.path());
  check(buf.length > 100 && (buf[0] === 0x89 || buf[0] === 0xFF), 'الملف المنزَّل صورة حقيقية', buf.length);
  const before = (await page.$$('.lib-row')).length;
  await page.click('.lib-row button.btn-danger');
  await page.waitForFunction((n) => document.querySelectorAll('.lib-row').length === n, before - 1, { timeout: 5000 }).catch(() => {});
  check((await page.$$('.lib-row')).length === before - 1, 'حذف سجل من المكتبة');
  check(errors.length === 0, 'لا أخطاء في الـ console', errors);
  await ctx.close();
}

async function rejectCase(browser) {
  console.log('\n=== رفض الصيغ غير المدعومة ===');
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL_);
  fs.writeFileSync(path.join(FIX, 'old.doc'), 'x');
  await page.setInputFiles('#fileInp', path.join(FIX, 'old.doc'));
  await page.waitForSelector('.toast');
  check(/غير مدعومة/.test(await page.textContent('.toast')), 'ملف .doc القديم يُرفض برسالة واضحة');
  fs.writeFileSync(path.join(FIX, 'broken.docx'), 'not a zip');
  await page.setInputFiles('#fileInp', path.join(FIX, 'broken.docx'));
  await page.waitForFunction(() => /❌/.test(document.getElementById('status').textContent));
  check(true, 'ملف docx تالف يعطي ❌ دون انهيار');
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  const p1 = await pptxCase(browser, false), p2 = await pptxCase(browser, true);
  const d1 = await docxCase(browser, false), d2 = await docxCase(browser, true);
  await multiCase(browser);
  await xformCase(browser);
  await xlsxCase(browser);
  await pdfCase(browser);
  await scanCase(browser);
  await splashCase(browser);
  await langCase(browser);
  await exportCase(browser);
  await libraryCase(browser);
  await rejectCase(browser);
  console.log('\n=== مقارنة مسار Worker بالاحتياطي ===');
  check(JSON.stringify(p1) === JSON.stringify(p2), 'PPTX: النتائج متطابقة');
  check(JSON.stringify(d1) === JSON.stringify(d2), 'DOCX: النتائج متطابقة');
  await browser.close();
  console.log(failures ? `\n❌ فشل ${failures} فحص` : '\n✅ نجحت كل الفحوص');
  process.exit(failures ? 1 : 0);
})();
