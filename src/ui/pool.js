/* مجمّع Web Workers: Worker أولاً، وأي فشل يُعاد تلقائياً في الخيط الرئيسي */
import { processImage } from '../core/imaging.js';
import WORKER_SRC from './worker-src.generated.js';

export const Pool = {
  ok: false, size: 0, idle: [], queue: [],
  init() {
    try {
      if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return;
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
      for (let i = 0; i < n; i++) {
        const w = new Worker(url);
        w.onmessage = (ev) => {
          const job = w._job; w._job = null;
          this.idle.push(w);
          if (job) { if (ev.data.ok) job.res(ev.data.r); else job.rej(new Error(ev.data.err)); }
          this.pump();
        };
        w.onerror = (ev) => {
          if (ev.preventDefault) ev.preventDefault();
          const job = w._job; w._job = null;
          this.ok = false;
          if (job) job.rej(new Error('worker failed'));
          while (this.queue.length) this.queue.shift().rej(new Error('worker failed'));
        };
        this.idle.push(w);
      }
      this.size = n; this.ok = true;
    } catch (e) { this.ok = false; }
  },
  run(blob, opts) {
    return new Promise((res, rej) => { this.queue.push({ blob, opts, res, rej }); this.pump(); });
  },
  pump() {
    while (this.ok && this.idle.length && this.queue.length) {
      const w = this.idle.pop(), job = this.queue.shift();
      w._job = job;
      w.postMessage({ blob: job.blob, opts: job.opts });
    }
  }
};

export async function processAny(blob, opts) {
  if (Pool.ok) {
    try { return await Pool.run(blob, opts); } catch (e) { /* احتياطي */ }
  }
  return processImage(blob, opts);
}
