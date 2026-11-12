// جسر Android (Capacitor): في المتصفح/Electron لا يفعل شيئًا.
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { App } from '@capacitor/app';

export const isNative = () => { try { return Capacitor.isNativePlatform(); } catch { return false; } };

const CHUNK = 3 * 512 * 1024; // مضاعف لـ3 كي يبقى base64 سليمًا عند كل قطعة
export const NATIVE_MAX = 400 * 1024 * 1024;

const b64 = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1] || '');
  r.onerror = () => rej(r.error);
  r.readAsDataURL(blob);
});

// يكتب الملف في الذاكرة المؤقتة ثم يفتح نافذة المشاركة/الحفظ في Android
export async function saveBlobNative(blob, name, title) {
  if (blob.size > NATIVE_MAX) throw new Error('too-big');
  const path = `export/${Date.now()}_${name.replace(/[\\/:*?"<>|]/g, '_')}`;
  for (let off = 0; off < blob.size || off === 0; off += CHUNK) {
    const data = await b64(blob.slice(off, off + CHUNK));
    if (off === 0) await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
    else await Filesystem.appendFile({ path, data, directory: Directory.Cache });
    if (blob.size === 0) break;
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  await Share.share({ title: name, dialogTitle: title || name, url: uri });
  // تنظيف الملفات المؤقتة القديمة
  setTimeout(() => Filesystem.rmdir({ path: 'export', directory: Directory.Cache, recursive: true }).catch(() => {}), 10 * 60 * 1000);
}

// زر الرجوع: يغلق أعلى طبقة مفتوحة، وإلا يخرج من التطبيق
export function initBackButton(closeTopLayer) {
  if (!isNative()) return;
  App.addListener('backButton', () => { if (!closeTopLayer()) App.exitApp(); });
}
