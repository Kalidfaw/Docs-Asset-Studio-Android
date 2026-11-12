/* دوال تصدير نقية (بلا DOM): فهرس CSV، وبيان «موسوعة السبورة» (wb-encyclopedia v1) */

export function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                  // يمنع تفسير الخلية كصيغة في Excel
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* BOM كي يفتح Excel العربية صحيحة؛ فاصلة قياسية وCRLF */
export function toCsv(headers, rows) {
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export const WB_MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
export const WB_RAW_MAX = 15 * 1048576;                      // حد السبورة للصورة الواحدة

/* معرّف يطابق /^[\w-]{4,40}$/ الذي تشترطه السبورة */
export function wbId(rand = Math.random) {
  return Array.from({ length: 20 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)]).join('');
}

/* items: [{ name, subject, mime, w, h }] → بيان الموسوعة؛ يُعيد البيان وقائمة المعرّفات بالترتيب نفسه */
export function wbManifest(items, now = Date.now(), rand = Math.random) {
  const ids = new Set();
  const out = items.map((it, i) => {
    let id; do { id = wbId(rand); } while (ids.has(id));
    ids.add(id);
    return { id, name: clean(it.name, 40) || 'صورة', subject: clean(it.subject, 40), mime: it.mime, w: it.w, h: it.h, t: now + i };
  });
  return { manifest: { format: 'wb-encyclopedia', version: 1, created: new Date(now).toISOString(), items: out }, ids: out.map((o) => o.id) };
}
