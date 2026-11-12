/* «مواضع» الصورة داخل المستند: {k, n}
   s = شريحة n (pptx)         p = الصورة رقم n بترتيب ظهورها في متن المستند (docx — لا أرقام صفحات في XML)
   h = ترويسة n   f = تذييل n   n = حاشية (1 سفلية، 2 ختامية)
   l = تخطيط شريحة (Layout) n   m = ماستر n */

const KINDS = {
  s: { one: 'شريحة', many: 'شرائح', name: 'slide' },
  p: { one: 'موضع', many: 'مواضع', name: 'img' },
  h: { one: 'ترويسة', many: 'ترويسات', name: 'header' },
  f: { one: 'تذييل', many: 'تذييلات', name: 'footer' },
  n: { one: 'حاشية', many: 'حواشٍ', name: 'note' },
  l: { one: 'قالب', many: 'قوالب', name: 'layout' },
  m: { one: 'ماستر', many: 'ماسترات', name: 'master' },
  x: { one: 'ورقة', many: 'أوراق', name: 'sheet' },
  g: { one: 'صفحة', many: 'صفحات', name: 'page' }
};
/* الفرنسية: تُضبط من الواجهة؛ الأسماء المقترحة للملفات (slide05…) إنجليزية ثابتة ولا تتأثر باللغة */
const KINDS_FR = {
  s: ['diapositive', 'diapositives'], p: ['image', 'images'], h: ['en-tête', 'en-têtes'], f: ['pied de page', 'pieds de page'],
  n: ['note', 'notes'], l: ['modèle', 'modèles'], m: ['masque', 'masques'], x: ['feuille', 'feuilles'], g: ['page', 'pages']
};
let LANG = 'ar';
export function setLocLang(l) { LANG = l === 'fr' ? 'fr' : 'ar'; }
const SEP = () => (LANG === 'fr' ? ', ' : '، ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const kindLabel = (k, many) => (LANG === 'fr' ? cap(KINDS_FR[k][many ? 1 : 0]) : (many ? KINDS[k].many : KINDS[k].one));

const ORDER = ['s', 'p', 'h', 'f', 'n', 'l', 'm', 'x', 'g'];

/* x (Excel): n = رقم الورقة، name = اسمها، cell = الخلية (B4)، o = الترتيب داخل الورقة */
export function locRank(l) { return ORDER.indexOf(l.k) * 1e9 + l.n * 1e4 + (l.o || 0); }
export function locKey(l) { return l.k + l.n + (l.cell || '') + (l.o || ''); }
export function sortLocs(a, b) { return locRank(a) - locRank(b); }

/* «شريحة 1، 3» أو «ترويسة 1 · موضع 4» */
export function locsLabel(locs) {
  if (!locs || !locs.length) return '';
  const parts = [];
  for (const k of ORDER) {
    if (k === 'x') {
      const xs = locs.filter((l) => l.k === 'x');
      if (xs.length) parts.push(xs.slice(0, 3).map((l) => (LANG === 'fr' ? `Feuille « ${l.name || l.n} »` : `ورقة «${l.name || l.n}»`) + (l.cell ? ' ' + l.cell : '')).join(SEP()) + (xs.length > 3 ? '…' : ''));
      continue;
    }
    const ns = locs.filter((l) => l.k === k).map((l) => l.n);
    if (!ns.length) continue;
    const shown = ns.slice(0, 4).join(SEP()) + (ns.length > 4 ? '…' : '');
    parts.push(`${kindLabel(k, ns.length !== 1)} ${shown}`);
  }
  return parts.join(' · ');
}

/* اسم ملف مقترح من الموضع: slide05 / img03 / header01 */
export function locName(l) {
  if (l.k === 'x') {
    const nm = String(l.name || '').normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || `sheet${String(l.n).padStart(2, '0')}`;
    return l.cell ? `${nm}_${l.cell}` : nm;
  }
  return `${KINDS[l.k].name}${String(l.n).padStart(2, '0')}`;
}
