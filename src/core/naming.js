/* اقتراح أسماء للصور من سياق المستند — نقي ومحلي (لا يفهم الصورة، بل يقرأ ما كتبه المؤلف حولها) */
import { CAPTION_LABEL } from './xml.js';

const JUNK_ALT = [
  /^(?:picture|image|photo|graphic|figure|pic|img|capture|screenshot|logo)?\s*[\d_\- ]*$/i,
  /^(?:image|picture|photo|capture d.écran|zone de texte|text box|rectangle|ellipse|connecteur|content placeholder|espace réservé\w*)\b.*\d+$/i,
  /^(?:description générée automatiquement|alt text|texte alternatif|une image contenant\b.*|a picture containing\b.*|description automatically generated)$/i,
  /^(?:صورة|شكل|رسم|لقطة شاشة|مستطيل|صندوق نص)\s*\d*$/,
  /\.(?:png|jpe?g|gif|bmp|webp|svg|emf|wmf)$/i,
  /^[\d\s_\p{P}\p{S}]+$/u
];

export function isJunkText(s) {
  const t = (s || '').trim();
  if (t.length < 3) return true;
  return JUNK_ALT.some((re) => re.test(t));
}

/* ينظّف النص ليصلح اسم ملف: يحفظ العربية والحروف اللاتينية المشكّلة، يحذف الرموز المحظورة، يقصّ على كلمات */
export function slugify(text, { maxWords = 6, maxLen = 48 } = {}) {
  let t = (text || '').normalize('NFC')
    .replace(/[ً-ٰٟـ]/g, '')           // التشكيل والتطويل
    .replace(/[\\/:*?"<>|\x00-\x1f#%&{}$!'`@+=~^;,.()\[\]«»“”‘’…]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const words = t.split(' ').filter(Boolean).slice(0, maxWords);
  t = words.join('_');
  if (t.length > maxLen) t = t.slice(0, maxLen).replace(/_[^_]*$/, '') || t.slice(0, maxLen);
  return t.replace(/^[_\-.]+|[_\-.]+$/g, '');
}

/* يعيد { text, source } لأفضل نص سياقي، أو null. الأولوية: تعليق > alt مفلتر > عنوان الشريحة/القسم */
export function bestContext({ caption, alt, title } = {}) {
  const cap = (caption || '').replace(CAPTION_LABEL, '').trim();
  if (cap && !isJunkText(cap)) return { text: cap, source: 'caption' };
  if (alt && !isJunkText(alt)) return { text: alt.trim(), source: 'alt' };
  if (title && !isJunkText(title)) return { text: title.trim(), source: 'title' };
  return null;
}

/* قالب: {loc} موضع الصورة (slide05)، {text} النص السياقي، {src} اسم المستند */
export function suggestName(info, { template = '{loc}_{text}', loc = '', src = '' } = {}) {
  const ctx = bestContext(info);
  if (!ctx) return null;
  const text = slugify(ctx.text);
  if (!text) return null;
  const name = template.replace('{loc}', loc).replace('{text}', text).replace('{src}', src)
    .replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '');
  return { name, source: ctx.source, text: ctx.text };
}

/* يجعل مجموعة أسماء فريدة بإلحاق _2 _3 */
export function uniqueNames(names, taken = new Set()) {
  const used = new Set(taken);
  return names.map((n) => {
    let c = n, k = 2;
    while (used.has(c.toLowerCase())) c = `${n}_${k++}`;
    used.add(c.toLowerCase());
    return c;
  });
}
