/* جسر آمن بين العملية الرئيسية والصفحة: يمرّر الملفات المفتوحة فقط (لا وصول لنظام الملفات من الصفحة) */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

let handler = null;
const queue = [];
ipcRenderer.on('open-files', (_e, files) => {
  if (handler) handler(files); else queue.push(files);
});

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  pathOf(file) { try { return webUtils.getPathForFile(file) || ''; } catch (e) { return ''; } },
  setLang(l) { ipcRenderer.send('set-lang', l === 'fr' ? 'fr' : 'ar'); },
  exitFullscreen() { ipcRenderer.send('exit-fullscreen'); },
  readFile(p) { return ipcRenderer.invoke('read-file', p); },
  onOpenFiles(fn) {
    handler = fn;
    queue.splice(0).forEach((files) => fn(files));
  }
});
