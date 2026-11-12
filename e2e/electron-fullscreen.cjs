/* Esc يجب أن يُنهي ملء الشاشة في غلاف سطح المكتب.  xvfb-run -a node e2e/electron-fullscreen.cjs */
const { _electron } = require('playwright');
const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const app = await _electron.launch({ executablePath: require('electron'), args: ['--no-sandbox', path.join(__dirname, '..', 'electron', 'main.cjs')] });
  const page = await app.firstWindow();
  await page.waitForLoadState('load');
  const isFs = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen());
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
  await sleep(1200);
  const before = await isFs();
  await page.keyboard.press('Escape');
  await sleep(1200);
  const after = await isFs();
  console.log((before ? '  ✓ ' : '  ✗ ') + 'دخل ملء الشاشة');
  console.log((!after ? '  ✓ ' : '  ✗ ') + 'Esc أنهى ملء الشاشة');
  await app.close();
  process.exit(before && !after ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
