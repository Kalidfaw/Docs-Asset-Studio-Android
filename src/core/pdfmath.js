/* رياضيات PDF ونصوصه — نقية بلا pdf.js ولا DOM (قابلة للاختبار في Node)
   المصفوفة [a,b,c,d,e,f]: x' = a·x + c·y + e ، y' = b·x + d·y + f (إحداثيات PDF: y للأعلى) */

export const IDENT = [1, 0, 0, 1, 0, 0];

/* m ثم n: نقطة تمرّ بـ n أولاً ثم m — هكذا تُركَّب مصفوفات cm (الجديدة تُضرب من اليسار) */
export function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}

/* مربع الوحدة (الصورة) بعد المصفوفة → المستطيل المحيط [x0,y0,x1,y1] */
export function unitBBox(m) {
  const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
  const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/* نسبة تغطية الصورة للصفحة (0..1) */
export function coverage(bbox, view) {
  const w = Math.max(0, Math.min(bbox[2], view[2]) - Math.max(bbox[0], view[0]));
  const h = Math.max(0, Math.min(bbox[3], view[3]) - Math.max(bbox[1], view[1]));
  const area = (view[2] - view[0]) * (view[3] - view[1]);
  return area > 0 ? (w * h) / area : 0;
}

/* التدوير/القلب من المصفوفة (مضاعفات 90° فقط) → { rot, fh, fv } | null (لا تحويل) | undefined (زاوية أخرى)
   الصورة الطبيعية: a>0 و d>0 (أعلى الصورة نحو الأعلى). xf = قلب ثم تدوير مع عقارب الساعة، كما في imaging.js */
export function xfFromMatrix(m) {
  const [a, b, c, d] = m;
  const s1 = Math.hypot(a, b) || 1, s2 = Math.hypot(c, d) || 1;      // لكل عمود مقياسه (صورة غير مربعة)
  const n = [a / s1, b / s1, c / s2, d / s2].map((v) => (Math.abs(v) < 0.02 ? 0 : v));
  const sgn = (v) => (v > 0.5 ? 1 : v < -0.5 ? -1 : 0);
  const got = [sgn(n[0]), sgn(n[1]), sgn(n[2]), sgn(n[3])];
  for (const rot of [0, 90, 180, 270]) {
    const cs = Math.round(Math.cos((rot * Math.PI) / 180)), sn = Math.round(Math.sin((rot * Math.PI) / 180));
    for (const fh of [false, true]) {
      for (const fv of [false, true]) {
        if (fh && fv) continue;                                  // قلبان معاً = تدوير 180°
        const sx = fh ? -1 : 1, sy = fv ? -1 : 1;
        const exp = [cs * sx, -sn * sx, sn * sy, cs * sy];      // R_cw(θ)·diag(sx,sy) في إحداثيات y للأعلى
        if (exp.every((v, i) => v === got[i])) return (rot || fh || fv) ? { rot, fh, fv } : null;
      }
    }
  }
  return undefined;
}

/* ---- النص: عناصر pdf.js { str, transform, width, height } → أسطر ---- */
const ARABIC = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g;

export function buildLines(items) {
  const its = items.filter((i) => i.str && i.str.trim()).map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0, h: Math.abs(i.height || i.transform[3] || 0) }));
  its.sort((p, q) => q.y - p.y || p.x - q.x);
  const lines = [];
  for (const it of its) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= Math.max(2, Math.min(last.h, it.h) * 0.5)) last.items.push(it);
    else lines.push({ y: it.y, h: it.h, items: [it] });
  }
  return lines.map((l) => {
    const text0 = l.items.map((i) => i.str).join('');
    const rtl = (text0.match(ARABIC) || []).length > text0.length / 3;
    const ordered = l.items.slice().sort((p, q) => (rtl ? q.x - p.x : p.x - q.x));
    const x0 = Math.min(...l.items.map((i) => i.x)), x1 = Math.max(...l.items.map((i) => i.x + i.w));
    return { y: l.y, h: Math.max(...l.items.map((i) => i.h)), x0, x1, text: ordered.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim() };
  });
}

/* تعليق الصورة: أقرب سطر تحتها (حتى 48 نقطة) متقاطع أفقياً معها، وإلا فوقها (حتى 30)؛ العنوان: أكبر خط في الصفحة */
export function pageContext(lines, bbox) {
  const overlap = (l) => Math.min(l.x1, bbox[2]) - Math.max(l.x0, bbox[0]) > 0.3 * Math.min(l.x1 - l.x0 || 1, bbox[2] - bbox[0]);
  let caption = '';
  const below = lines.filter((l) => l.y < bbox[1] + 4 && bbox[1] - l.y <= 48 && overlap(l)).sort((p, q) => q.y - p.y)[0];
  if (below) caption = below.text;
  else {
    const above = lines.filter((l) => l.y > bbox[3] - 4 && l.y - bbox[3] <= 30 && overlap(l)).sort((p, q) => p.y - q.y)[0];
    if (above) caption = above.text;
  }
  let title = '';
  if (lines.length) {
    const top = lines.slice().sort((p, q) => q.h - p.h || q.y - p.y)[0];
    title = top.text.slice(0, 100);
  }
  return { title, caption: caption.slice(0, 160) };
}
