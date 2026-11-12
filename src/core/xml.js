/* قراءة XML الخاص بحزم OOXML (pptx/docx) — نقية بلا DOM */

export function xmlDecode(s) {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
}

/* *.rels → Map(Id → Target) */
export function parseRels(xml) {
  const m = new Map();
  const re = /<Relationship\b[^>]*>/g;
  let x;
  while ((x = re.exec(xml))) {
    const id = /\sId="([^"]*)"/.exec(x[0]);
    const tg = /\sTarget="([^"]*)"/.exec(x[0]);
    if (id && tg) m.set(id[1], tg[1]);
  }
  return m;
}

/* النص البديل: أقرب حاوية رسم تسبق الموضع ولم تُغلق قبله (pptx: p:pic — docx: w:drawing / w:pict) */
function altBefore(xml, idx) {
  const containers = [['<xdr:pic', '</xdr:pic>'], ['<p:pic', '</p:pic>'], ['<w:drawing', '</w:drawing>'], ['<w:pict', '</w:pict>']];
  for (const [open, close] of containers) {
    const s = xml.lastIndexOf(open, idx), e = xml.lastIndexOf(close, idx);
    if (s > e) {
      const d = /<(?:wp:docPr|p:cNvPr|pic:cNvPr|xdr:cNvPr)\b[^>]*\sdescr="([^"]*)"/.exec(xml.slice(s, idx));
      return d ? xmlDecode(d[1]) : '';
    }
  }
  return '';
}

/* التدوير والقلب من <a:xfrm rot flipH flipV>: مضاعفات 90° فقط (الزوايا الأخرى تُهمل) → {rot, fh, fv} | null */
export function xformOf(frag) {
  const m = /<a:xfrm\b([^>]*)>/.exec(frag);
  if (!m) return null;
  const rot = /\srot="(-?\d+)"/.exec(m[1]);
  let deg = rot ? (+rot[1] / 60000) % 360 : 0;
  if (deg < 0) deg += 360;
  const snapped = Math.round(deg / 90) * 90;
  deg = Math.abs(deg - snapped) <= 1 ? snapped % 360 : 0;
  const fh = /\sflipH="(?:1|true)"/.test(m[1]), fv = /\sflipV="(?:1|true)"/.test(m[1]);
  return (deg || fh || fv) ? { rot: deg, fh, fv } : null;
}

function srcRectOf(block) {
  const sr = /<a:srcRect\b([^>]*)>/.exec(block);
  if (!sr) return null;
  const g = (k) => { const v = new RegExp('\\s' + k + '="(-?\\d+)"').exec(sr[1]); return v ? +v[1] : 0; };
  const crop = { l: g('l'), t: g('t'), r: g('r'), b: g('b') };
  return (crop.l > 0 || crop.t > 0 || crop.r > 0 || crop.b > 0) ? crop : null;
}

/* قيم VML: كسر عشري، أو "6554f" (ثابت 16.16)، أو نسبة مئوية */
function vmlFrac(v) {
  if (v == null) return 0;
  v = String(v).trim();
  if (/f$/i.test(v)) return (parseFloat(v) || 0) / 65536;
  if (/%$/.test(v)) return (parseFloat(v) || 0) / 100;
  return parseFloat(v) || 0;
}

/* يستخرج كل الصور المستخدمة في جزء XML بترتيب ظهورها في المستند:
   - DrawingML:  <p:blipFill> (صور pptx) / <pic:blipFill> (صور docx) / <a:blipFill> (تعبئات وخلفيات) مع srcRect
   - VML القديم: <v:imagedata r:id=... cropleft=...>  (ملفات docx القديمة)
   → [{ rid, crop|null, alt }] */
export function parseBlipsAt(xml) {   // → [{ rid, crop, alt, at }]
  const found = [];
  const re = /<(p|a|pic|xdr):blipFill\b[\s\S]*?<\/\1:blipFill>/g;
  let m;
  while ((m = re.exec(xml))) {
    const e = /<a:blip\b[^>]*\sr:embed="([^"]+)"/.exec(m[0]);
    if (!e) continue;
    let xf = null;
    if (m[1] !== 'a') {                                    // xfrm الصورة يلي blipFill داخل نفس الحاوية
      const end = xml.indexOf(`</${m[1]}:pic>`, m.index);
      if (end > 0) xf = xformOf(xml.slice(m.index, end));
    }
    found.push({ at: m.index, rid: e[1], crop: srcRectOf(m[0]), alt: altBefore(xml, m.index), xf });
  }
  const vre = /<v:imagedata\b[^>]*>/g;
  while ((m = vre.exec(xml))) {
    const tag = m[0];
    const id = /\sr:id="([^"]+)"/.exec(tag);
    if (!id) continue;
    const attr = (k) => { const v = new RegExp('\\s' + k + '="([^"]*)"').exec(tag); return v ? v[1] : null; };
    const c = { l: vmlFrac(attr('cropleft')) * 100000, t: vmlFrac(attr('croptop')) * 100000,
                r: vmlFrac(attr('cropright')) * 100000, b: vmlFrac(attr('cropbottom')) * 100000 };
    const has = c.l > 0 || c.t > 0 || c.r > 0 || c.b > 0;
    const title = attr('o:title');
    found.push({ at: m.index, rid: id[1], crop: has ? c : null, alt: title ? xmlDecode(title) : '', xf: null });
  }
  found.sort((a, b) => a.at - b.at);
  return found;
}

export function parseBlips(xml) {
  return parseBlipsAt(xml).map(({ rid, crop, alt }) => ({ rid, crop, alt }));
}


/* نص عناصر <a:t>/<w:t> داخل مقطع XML */
function textOf(frag) {
  const out = [];
  const re = /<(?:a|w):t\b[^>]*>([^<]*)<\/(?:a|w):t>/g;
  let m;
  while ((m = re.exec(frag))) out.push(xmlDecode(m[1]));
  return out.join('').replace(/\s+/g, ' ').trim();
}

/* عنوان الشريحة: نص عنصر نائب title/ctrTitle، وإلا فأول نص في الشريحة */
export function slideTitle(xml) {
  const sps = xml.match(/<p:sp\b[\s\S]*?<\/p:sp>/g) || [];
  for (const sp of sps) {
    if (/<p:ph\b[^>]*\stype="(?:title|ctrTitle)"/.test(sp)) { const t = textOf(sp); if (t) return t; }
  }
  for (const sp of sps) { const t = textOf(sp); if (t) return t; }
  return '';
}

const HEADING_STYLE = /^(?:heading|titre|title|titolo|überschrift|عنوان)\s*\d*$/i;
const CAPTION_STYLE = /^(?:caption|légende|legende|beschriftung|تعليق|وصف)/i;
export const CAPTION_LABEL = /^\s*(?:figure|fig\.?|image|photo|illustration|tableau|schéma|schema|شكل|صورة|الشكل|الصورة|رسم)\s*\d*\s*[:.\-–—)]?\s*/i;

/* يقرأ word/styles.xml → Map(styleId → اسم النمط) */
export function parseStyleNames(xml) {
  const m = new Map();
  const re = /<w:style\b[^>]*\sw:styleId="([^"]+)"[\s\S]*?<\/w:style>/g;
  let x;
  while ((x = re.exec(xml))) {
    const n = /<w:name\b[^>]*\sw:val="([^"]*)"/.exec(x[0]);
    m.set(x[1], n ? xmlDecode(n[1]) : x[1]);
  }
  return m;
}

/* فقرات المتن: [{ s, e, style, text }] */
export function docParagraphs(xml, styleNames = new Map()) {
  const ps = [];
  const re = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(xml))) {
    const st = /<w:pStyle\b[^>]*\sw:val="([^"]*)"/.exec(m[0]);
    const id = st ? st[1] : '';
    ps.push({ s: m.index, e: m.index + m[0].length, style: styleNames.get(id) || id, text: textOf(m[0]), hasImg: /<w:drawing\b|<w:pict\b/.test(m[0]) });
  }
  return ps;
}

/* سياق صورة في docx عند الموضع at: أقرب عنوان سابق + تعليقها (فقرة تالية بنمط تعليق أو بادئة «شكل/Figure») */
export function docContext(paras, at) {
  const i = paras.findIndex((p) => at >= p.s && at < p.e);
  if (i < 0) return { title: '', caption: '' };
  const isCap = (p) => p && p.text && (CAPTION_STYLE.test(p.style) || CAPTION_LABEL.test(p.text) && p.text.length < 160);
  let caption = '';
  if (isCap(paras[i + 1])) caption = paras[i + 1].text;
  else if (isCap(paras[i])) caption = paras[i].text;
  else if (isCap(paras[i - 1]) && !(paras[i - 2] && paras[i - 2].hasImg)) caption = paras[i - 1].text;   // تعليق علوي، بشرط ألا يكون تعليقاً لصورة سابقة
  let title = '';
  for (let k = i; k >= 0; k--) if (HEADING_STYLE.test(paras[k].style) && paras[k].text) { title = paras[k].text; break; }
  return { title, caption };
}


/* ============== Excel (xlsx) ============== */

export function colName(c) {                    // 0 → A ، 27 → AB
  let s = '';
  for (c += 1; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
}
export function colIndex(letters) {              // 'AB' → 27
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/* مرساة الصورة في رسم Excel: الخلية العليا اليسرى { col, row, cell:'B4' } أو null (مرساة مطلقة) */
export function anchorCell(xml, at) {
  const from = xml.lastIndexOf('<xdr:from>', at);
  const end = Math.max(xml.lastIndexOf('</xdr:twoCellAnchor>', at), xml.lastIndexOf('</xdr:oneCellAnchor>', at), xml.lastIndexOf('</xdr:absoluteAnchor>', at));
  if (from < 0 || from < end) return null;
  const seg = xml.slice(from, xml.indexOf('</xdr:from>', from));
  const c = /<xdr:col>(\d+)<\/xdr:col>/.exec(seg), r = /<xdr:row>(\d+)<\/xdr:row>/.exec(seg);
  if (!c || !r) return null;
  return { col: +c[1], row: +r[1], cell: colName(+c[1]) + (+r[1] + 1) };
}

/* xl/sharedStrings.xml → مصفوفة نصوص */
export function parseSharedStrings(xml) {
  const out = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m;
  while ((m = re.exec(xml))) out.push(textOfT(m[1]));
  return out;
}
function textOfT(frag) {
  const out = [];
  const re = /<t\b[^>]*>([^<]*)<\/t>/g;
  let m;
  while ((m = re.exec(frag))) out.push(xmlDecode(m[1]));
  return out.join('').replace(/\s+/g, ' ').trim();
}

/* نصوص خلايا الورقة: Map('B4' → نص) — للخلايا النصية فقط (مشتركة أو مضمّنة) */
export function sheetTexts(xml, shared) {
  const map = new Map();
  const re = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  let m;
  while ((m = re.exec(xml))) {
    const ref = /\sr="([A-Z]+\d+)"/.exec(m[1]);
    if (!ref) continue;
    const t = /\st="([^"]*)"/.exec(m[1]);
    let text = '';
    if (t && t[1] === 's') { const v = /<v>(\d+)<\/v>/.exec(m[2]); text = v ? shared[+v[1]] || '' : ''; }
    else if (t && t[1] === 'inlineStr') text = textOfT(m[2]);
    if (text) map.set(ref[1], text);
  }
  return map;
}

/* سياق الصورة: تعليق = نص الخلية فوقها مباشرة وإلا التي على يسارها */
export function cellContext(texts, a) {
  if (!a) return '';
  const above = a.row > 0 ? texts.get(colName(a.col) + a.row) : '';
  const left = a.col > 0 ? texts.get(colName(a.col - 1) + (a.row + 1)) : '';
  return above || left || '';
}
