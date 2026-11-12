/* سكربت البناء:  node build.mjs
   المخرجات في dist/:
     index.html + app.js + style.css   ← يعمل من file:// ومن Electron/Tauri (بلا CDN وبلا ES modules خارجية)
     standalone.html                   ← الشيء نفسه في ملف واحد (للتوزيع السريع)  */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const p = (...a) => path.join(root, ...a);

/* وضع الحماية:  node build.mjs --protect
   تشويش خفيف لكودنا نحن فقط (src/**) قبل التجميع: مصفوفة نصوص مشفّرة base64 ومبدّلة، وتبسيط وتسمية سداسية.
   لا تسطيح لتدفق التحكم ولا كود ميت ولا حماية من التنقيح (تُبطئ وتكسر)، ومكتبات الطرف الثالث (pdf.js وJSZip) تُترك كما هي. */
const PROTECT = process.argv.includes('--protect');
const OBF = {
  compact: true, simplify: true, identifierNamesGenerator: 'hexadecimal', renameGlobals: false, renameProperties: false,
  stringArray: true, stringArrayThreshold: 1, stringArrayEncoding: ['base64'], stringArrayWrappersCount: 1, rotateStringArray: true, shuffleStringArray: true,
  controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false, debugProtection: false, disableConsoleOutput: false,
  transformObjectKeys: false, numbersToExpressions: false, unicodeEscapeSequence: false, splitStrings: false,
  target: 'browser', sourceType: 'module'
};
const plugins = [];
if (PROTECT) {
  const { default: JSO } = await import('javascript-obfuscator');
  const srcDir = p('src') + path.sep;
  plugins.push({
    name: 'protect-own-code',
    setup(b) {
      b.onLoad({ filter: /\.js$/ }, (args) => {
        if (!args.path.startsWith(srcDir) || /\.generated\.js$/.test(args.path)) return null;       // مكتبات الطرف الثالث والملفات المولَّدة تُترك
        return { contents: JSO.obfuscate(fs.readFileSync(args.path, 'utf8'), OBF).getObfuscatedCode(), loader: 'js' };
      });
    }
  });
  console.log('وضع الحماية: تشويش خفيف لكود src/ فقط');
}

// 1) الـ Worker يُجمَّع كنص ويُضمَّن داخل التطبيق (Blob URL) كي يعمل من file:// بلا مشاكل أصل
const worker = await build({
  plugins, entryPoints: [p('src/core/worker.js')], bundle: true, write: false,
  format: 'iife', minify: true, target: 'es2020', legalComments: 'none'
});
fs.writeFileSync(p('src/ui/worker-src.generated.js'),
  '/* مولَّد تلقائياً بواسطة build.mjs — لا تعدّله */\nexport default ' + JSON.stringify(worker.outputFiles[0].text) + ';\n');

// 1b) عامل pdf.js (وحدة ES) كنص يُنشأ منه Blob عند فتح أول PDF
/* مفكّكات JBIG2/CCITT وJPEG2000 تُحمَّل في pdf.js بـ import() من ملفات خارجية (يمنعه file:// وسياسة الأمان) → نضمّنها داخل العامل */
const wasmDir = p('node_modules/pdfjs-dist/wasm');
const inlineDecoders = {
  name: 'inline-pdf-decoders',
  setup(b) {
    b.onLoad({ filter: /pdf\.worker\.mjs$/ }, (args) => {
      let src = fs.readFileSync(args.path, 'utf8');
      const re = /await import\(\s*\/\*webpackIgnore: true\*\/\s*\/\*@vite-ignore\*\/\s*`\$\{WasmImage\.#wasmUrl\}\$\{this\._noWasmFilename\}`\s*\)/;
      if (!re.test(src)) throw new Error('pdf.worker: نمط تحميل المفكّكات لم يعد موجوداً، حدّث build.mjs');
      src = src.replace(re, 'await __pdfDecoder(this._noWasmFilename)');
      const pre = `import __jb from ${JSON.stringify(path.join(wasmDir, 'jbig2_nowasm_fallback.js'))};\n` +
        `import __op from ${JSON.stringify(path.join(wasmDir, 'openjpeg_nowasm_fallback.js'))};\n` +
        `const __pdfDecoder = async (n) => ({ default: /^jbig2/.test(n) ? __jb : __op });\n`;
      return { contents: pre + src, loader: 'js' };
    });
  }
};
const pw = await build({
  plugins: [inlineDecoders],
  entryPoints: [p('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')], bundle: true, write: false,
  format: 'iife', minify: true, target: 'es2022', legalComments: 'none'
});
fs.writeFileSync(p('src/ui/pdf-worker-src.generated.js'),
  '/* مولَّد تلقائياً بواسطة build.mjs — لا تعدّله */\nexport default ' + JSON.stringify(pw.outputFiles[0].text) + ';\n');

// 2) التطبيق (JSZip مضمّن)
const app = await build({
  plugins, entryPoints: [p('src/ui/app.js')], bundle: true, write: false,
  format: 'iife', minify: true, target: 'es2022', legalComments: 'none'
});
const appJs = app.outputFiles[0].text;
const css = fs.readFileSync(p('src/ui/style.css'), 'utf8');
const tpl = fs.readFileSync(p('src/ui/index.template.html'), 'utf8');

fs.rmSync(p('dist'), { recursive: true, force: true });
fs.mkdirSync(p('dist'), { recursive: true });
fs.writeFileSync(p('dist/app.js'), appJs);
fs.writeFileSync(p('dist/style.css'), css);
// سياسة أمان المحتوى لنسخة dist/index.html (نسخة Electron والمتصفح): لا اتصال خارجي، ولا سكربت إلا app.js، ولا Worker إلا من Blob
const CSP = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; worker-src blob:; connect-src blob:; base-uri 'none'; form-action 'none'">`;
fs.writeFileSync(p('dist/index.html'),
  tpl.replace('<!--STYLE-->', CSP + '\n<link rel="stylesheet" href="style.css">')
     .replace('<!--SCRIPT-->', '<script src="app.js"></script>'));
const safeJs = appJs.replace(/<\/script/gi, '<\\/script');
fs.writeFileSync(p('dist/standalone.html'),
  tpl.replace('<!--STYLE-->', () => '<style>\n' + css + '</style>')
     .replace('<!--SCRIPT-->', () => '<script>\n' + safeJs + '\n</script>'));

// الخط: Cairo (رخصة OFL) من حزمة npm، يُنسخ محلياً: ملفات في dist/fonts ونسخة مضمّنة base64 في standalone
const FONT_DIR = p('node_modules/@fontsource-variable/cairo');
const FONT_SUBSETS = ['arabic', 'latin', 'latin-ext'];
const fontCss = (inline) => fs.readFileSync(path.join(FONT_DIR, 'wght.css'), 'utf8').split('\n\n')
  .filter((b) => FONT_SUBSETS.some((s) => b.includes(`cairo-${s}-wght-normal`)))
  .map((b) => b.replace(/url\(\.\/files\/(cairo-[\w-]+\.woff2)\) format\('woff2-variations'\)/, (m, f) => {
    const buf = fs.readFileSync(path.join(FONT_DIR, 'files', f));
    return inline ? `url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2')` : `url(fonts/${f}) format('woff2')`;
  })).join('\n\n');
fs.mkdirSync(p('dist/fonts'), { recursive: true });
for (const s of FONT_SUBSETS) fs.copyFileSync(path.join(FONT_DIR, 'files', `cairo-${s}-wght-normal.woff2`), p('dist/fonts', `cairo-${s}-wght-normal.woff2`));
fs.writeFileSync(p('dist/style.css'), fontCss(false) + '\n' + css);
fs.writeFileSync(p('dist/standalone.html'), fs.readFileSync(p('dist/standalone.html'), 'utf8').replace('<style>\n', () => '<style>\n' + fontCss(true) + '\n'));

const kb = (f) => (fs.statSync(p('dist', f)).size / 1024).toFixed(0) + ' KB';
console.log(`built: app.js ${kb('app.js')} · standalone.html ${kb('standalone.html')}`);
