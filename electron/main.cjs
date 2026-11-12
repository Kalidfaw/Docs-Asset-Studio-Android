/* غلاف سطح المكتب (Electron): نافذة تحمّل dist/index.html، وتفتح ملفات PPTX/DOCX من:
   القائمة (Ctrl+O) · سطر الأوامر / سحب الملف على أيقونة البرنامج · نسخة ثانية من البرنامج (تُمرَّر للنافذة الحالية) */
const { app, BrowserWindow, Menu, dialog, shell, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const SUPPORTED = /\.(pptx|docx|xlsx|pdf)$/i;
const INDEX = path.join(__dirname, '..', 'dist', 'index.html');
const isDev = !app.isPackaged;

let win = null;
let pendingFiles = [];        // ملفات طُلب فتحها قبل جاهزية النافذة
let rendererReady = false;    // اكتمل تحميل الصفحة وسُجّل معالج الفتح

function filesFromArgv(argv) {
  return argv.slice(1).filter((a) => SUPPORTED.test(a) && fs.existsSync(a));
}

async function openFilesInWindow(paths) {
  paths = (paths || []).filter(Boolean);
  if (!paths.length) return;
  if (!win || !rendererReady) { pendingFiles.push(...paths); return; }
  try {
    const files = [];
    for (const f of paths) files.push({ name: path.basename(f), path: f, data: await fs.promises.readFile(f) });
    win.webContents.send('open-files', files);
    if (win.isMinimized()) win.restore();
    win.focus();
  } catch (err) {
    dialog.showErrorBox(L('تعذّر فتح الملف'), String(err.message || err));
  }
}

/* إعادة قراءة مستند من مسار محفوظ في المكتبة: تُقبل فقط ملفات pptx/docx/xlsx موجودة، ومن نافذة التطبيق نفسها */
/* لغة القوائم والحوارات (العربية افتراضياً؛ الصفحة تُرسل لغتها عند الفتح والتبديل) */
let LANG = 'ar';
const FR = {
  'ملف': 'Fichier', 'فتح مستندات…': 'Ouvrir des documents…', 'خروج': 'Quitter', 'عرض': 'Affichage', 'الحجم الأصلي': 'Taille réelle',
  'تكبير': 'Zoom avant', 'تصغير': 'Zoom arrière', 'ملء الشاشة': 'Plein écran', 'اختيار مستندات': 'Choisir des documents',
  'مستندات Office': 'Documents Office', 'تعذّر فتح الملف': 'Impossible d’ouvrir le fichier'
};
const L = (s) => (LANG === 'fr' && FR[s]) || s;
ipcMain.on('set-lang', (_e, l) => { LANG = l === 'fr' ? 'fr' : 'ar'; buildMenu(); });

ipcMain.on('exit-fullscreen', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && w.isFullScreen()) w.setFullScreen(false);
});

ipcMain.handle('read-file', async (e, p) => {
  try {
    if (!win || e.sender !== win.webContents) return null;
    if (typeof p !== 'string' || !path.isAbsolute(p) || !SUPPORTED.test(p)) return null;
    const st = await fs.promises.stat(p);
    if (!st.isFile()) return null;
    return { name: path.basename(p), path: p, data: await fs.promises.readFile(p) };
  } catch (err) { return null; }
});

async function chooseFile() {
  const r = await dialog.showOpenDialog(win, {
    title: L('اختيار مستندات'),
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: L('مستندات Office'), extensions: ['pptx', 'docx', 'xlsx', 'pdf'] }]
  });
  if (!r.canceled && r.filePaths.length) openFilesInWindow(r.filePaths);
}

function buildMenu() {
  const template = [
    { label: L('ملف'), submenu: [
      { label: L('فتح مستندات…'), accelerator: 'CmdOrCtrl+O', click: chooseFile },
      { type: 'separator' },
      { role: 'quit', label: L('خروج') }
    ] },
    { label: L('عرض'), submenu: [
      { role: 'resetZoom', label: L('الحجم الأصلي') },
      { role: 'zoomIn', label: L('تكبير') },
      { role: 'zoomOut', label: L('تصغير') },
      { role: 'togglefullscreen', label: L('ملء الشاشة') },
      ...(isDev ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] : [])
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 820, minHeight: 600,
    title: 'Docs Asset Studio', icon: path.join(__dirname, '..', 'build', 'icon.png'), backgroundColor: '#0f172a', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  rendererReady = false;
  // Esc يُنهي ملء الشاشة (قائمة «ملء الشاشة» وحدها لا تفعل ذلك، وChromium يتولاه فقط لواجهة HTML fullscreen)
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && !input.isAutoRepeat && win && win.isFullScreen()) win.setFullScreen(false);
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(INDEX);
  win.webContents.once('did-finish-load', () => {
    rendererReady = true;
    if (pendingFiles.length) { const f = pendingFiles; pendingFiles = []; openFilesInWindow(f); }
  });
  // أمان: لا تنقّل خارج التطبيق ولا نوافذ جديدة؛ الروابط الخارجية (إن وُجدت) تُفتح في المتصفح الافتراضي
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  win.on('closed', () => { win = null; rendererReady = false; });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => openFilesInWindow(filesFromArgv(argv)));
  app.on('open-file', (e, p) => { e.preventDefault(); if (SUPPORTED.test(p)) openFilesInWindow([p]); });   // macOS
  app.whenReady().then(() => {
    buildMenu();
    pendingFiles = filesFromArgv(process.argv);
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
