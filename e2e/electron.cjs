/* اختبار غلاف سطح المكتب: تشغيل Electron فعلياً وفتح الملفات عبر سطر الأوامر ثم عبر نسخة ثانية.
   يُشغَّل على Linux بلا شاشة:  xvfb-run -a node e2e/electron.cjs   (أو: npm run e2e:electron) */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MAIN = path.join(ROOT, 'electron', 'main.cjs');
const FIX = path.join(__dirname, 'fixtures');
fs.mkdirSync(FIX, { recursive: true });
execFileSync('python3', ['-I', path.join(__dirname, 'make_pptx.py'), path.join(FIX, 'test.pptx')], { stdio: 'ignore' });
execFileSync('python3', ['-I', path.join(__dirname, 'make_docx.py'), path.join(FIX, 'test.docx')], { stdio: 'ignore' });

let failures = 0;
const check = (cond, msg, extra) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg + (cond || extra === undefined ? '' : '  → ' + JSON.stringify(extra)));
  if (!cond) failures++;
};
const status = (page) => page.textContent('#status');
const waitDone = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.getElementById('status').textContent), re.source, { timeout: 60000 });

(async () => {
  const userData = fs.mkdtempSync(path.join(require('os').tmpdir(), 'das-'));
  const args = ['--no-sandbox', `--user-data-dir=${userData}`, MAIN];
  const exe = require('electron');

  console.log('\n=== التشغيل بملفين (DOCX + PPTX) في سطر الأوامر ===');
  const PORT = 9333 + Math.floor(Math.random() * 500);
  const proc = spawn(exe, [...args, `--remote-debugging-port=${PORT}`, path.join(FIX, 'test.docx'), path.join(FIX, 'test.pptx')], { stdio: 'ignore', env: process.env });
  let browser = null;
  for (let i = 0; i < 60 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch (e) { await new Promise((r) => setTimeout(r, 500)); }
  }
  if (!browser) throw new Error('تعذّر الاتصال بـ Electron');
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('file://')) || null;
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  if (!page) throw new Error('لم تظهر نافذة التطبيق');
  const app = { windows: () => browser.contexts().flatMap((c) => c.pages()).filter((p) => p.url().startsWith('file://')), close: async () => { await browser.close().catch(() => {}); const done = new Promise((r) => proc.once('exit', r)); proc.kill(); await Promise.race([done, new Promise((r) => setTimeout(r, 8000))]); } };
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await waitDone(page, /✅/);
  const st = await status(page);
  console.log('  الحالة:', st);
  check(/من 2 ملفات/.test(st) && /10 صورة/.test(st), 'فُتح الملفان تلقائياً من argv واستُخرجت 10 صور', st);
  check((await page.title()).includes('Docs Asset Studio'), 'عنوان النافذة', await page.title());
  check(await page.evaluate(() => !!(window.desktop && window.desktop.isDesktop)), 'جسر desktop متاح في الصفحة');
  check(await page.evaluate(() => typeof require === 'undefined' && typeof process === 'undefined'), 'الصفحة معزولة: لا require ولا process');
  check(await page.evaluate(() => window.__das.pool().ok), 'الـ Web Workers تعمل تحت سياسة CSP');
  const csp = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]') ? 1 : 0);
  check(csp === 1, 'سياسة CSP مفعّلة');
  const names = await page.$$eval('.img-name-input', (els) => els.map((e) => e.value).sort());
  check(names.length === 10 && new Set(names).size === 10 && names.every((n) => /^test_(docx|pptx)_/.test(n)), 'أسماء الصور فريدة ومسبوقة باسم المستند', names);

  console.log('\n=== نسخة ثانية بملف PPTX ← تُمرَّر للنافذة الحالية ===');
  const second = spawn(exe, [...args, path.join(FIX, 'test.pptx')], { stdio: 'ignore', env: process.env });
  const exited = await new Promise((res) => { second.on('exit', (c) => res(c)); setTimeout(() => res('timeout'), 30000); });
  check(exited !== 'timeout', 'النسخة الثانية أغلقت نفسها (نسخة واحدة فقط)', exited);
  await waitDone(page, /ملف PowerPoint/);
  const st2 = await status(page);
  check(/ملف PowerPoint/.test(st2) && /5 صورة/.test(st2), 'النافذة الأولى فتحت ملف PPTX المُمرَّر', st2);
  check((await app.windows()).length === 1, 'نافذة واحدة فقط');

  const fx = path.join(FIX, 'test.docx');
  const rf = await page.evaluate(async (p) => { const r = await window.desktop.readFile(p); return r && { name: r.name, path: r.path, n: r.data.byteLength }; }, fx);
  check(rf && rf.name === 'test.docx' && rf.path === fx && rf.n > 1000, 'readFile: إعادة قراءة مستند من مساره المحفوظ', rf);
  fs.writeFileSync(path.join(FIX, 'x.txt'), 'x');
  const bad = await page.evaluate(async (p) => [await window.desktop.readFile(p[0]), await window.desktop.readFile(p[1]), await window.desktop.readFile('relative.docx'), await window.desktop.readFile(p[2])], [path.join(FIX, 'x.txt'), '/etc/passwd', path.join(FIX, 'missing.docx')]);
  check(bad.every((x) => x === null), 'readFile يرفض غير pptx/docx والمسارات النسبية والمفقودة', bad);
  check(errors.length === 0, 'لا أخطاء في الـ console', errors);
  await app.close();
  try { fs.rmSync(userData, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch (e) { /* مجلد مؤقت فقط */ }
  console.log(failures ? `\n❌ فشل ${failures} فحص` : '\n✅ نجحت كل الفحوص');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
