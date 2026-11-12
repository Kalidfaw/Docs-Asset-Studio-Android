/* نقطة دخول الـ Web Worker (تُجمَّع بواسطة build.mjs وتُضمَّن كنص داخل التطبيق) */
import { processImage } from './imaging.js';

self.onmessage = async (e) => {
  try {
    self.postMessage({ ok: true, r: await processImage(e.data.blob, e.data.opts) });
  } catch (err) {
    self.postMessage({ ok: false, err: String((err && err.message) || err) });
  }
};
