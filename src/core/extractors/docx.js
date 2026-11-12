/* مستخرج Word (.docx)
   - المتن word/document.xml: تُرقَّم الصور بترتيب ظهورها (k='p') لأن ملف docx لا يحمل أرقام صفحات.
   - الترويسات/التذييلات/الحواشي لها مواضعها الخاصة (h/f/n).
   - يدعم DrawingML الحديث (مع srcRect) وVML القديم (cropleft…). */
import { parseRels, parseBlipsAt, parseStyleNames, docParagraphs, docContext } from '../xml.js';
import { Usage, mediaBase, collectEntries } from './common.js';

function partOf(path) {
  let m;
  if (path === 'word/document.xml') return { k: 'p', n: 0 };
  if ((m = path.match(/^word\/header(\d+)\.xml$/))) return { k: 'h', n: +m[1] };
  if ((m = path.match(/^word\/footer(\d+)\.xml$/))) return { k: 'f', n: +m[1] };
  if (path === 'word/footnotes.xml') return { k: 'n', n: 1 };
  if (path === 'word/endnotes.xml') return { k: 'n', n: 2 };
  return null;
}

export const docx = {
  id: 'docx',
  label: 'Word',
  exts: ['docx'],

  async scan(zip, opts = {}) {
    const parts = [];
    zip.forEach((path) => { const p = partOf(path); if (p) parts.push({ path, ...p }); });
    parts.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

    const stylesFile = zip.file('word/styles.xml');
    const styleNames = stylesFile ? parseStyleNames(await stylesFile.async('string')) : new Map();
    const usage = new Usage();
    for (const part of parts) {
      const xml = await zip.file(part.path).async('string');
      const relsFile = zip.file(`word/_rels/${part.path.split('/').pop()}.rels`);
      const rels = relsFile ? parseRels(await relsFile.async('string')) : new Map();
      const paras = docParagraphs(xml, styleNames);
      let ordinal = 0;
      for (const b of parseBlipsAt(xml)) {
        const tg = rels.get(b.rid), base = tg && mediaBase(tg);
        if (!base) continue;
        const loc = part.k === 'p' ? { k: 'p', n: ++ordinal } : { k: part.k, n: part.n };
        usage.add(base, loc, b.crop, b.alt, part.k === 'p' ? docContext(paras, b.at) : null, b.xf);
      }
    }
    return collectEntries(zip, { dir: 'word/', usage, bgSet: null, useCrop: opts.useCrop !== false });
  }
};
