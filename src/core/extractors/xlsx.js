/* مستخرج Excel (.xlsx): الورقة ← الرسم ← الصورة
   workbook.xml يعطي أسماء الأوراق وترتيبها؛ علاقات الورقة تشير إلى drawingN.xml؛ علاقات الرسم تشير إلى xl/media.
   موضع الصورة = الورقة + الخلية العليا اليسرى (B4)، وسياقها نص الخلية فوقها أو يسارها (للأسماء المقترحة). */
import { parseRels, parseBlipsAt, anchorCell, parseSharedStrings, sheetTexts, cellContext, xmlDecode } from '../xml.js';
import { Usage, mediaBase, collectEntries } from './common.js';

const norm = (base, target) => {                // يحلّ Target نسبياً إلى مسار داخل الحزمة
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.split('/'); parts.pop();
  for (const seg of target.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  return parts.join('/');
};

export const xlsx = {
  id: 'xlsx',
  label: 'Excel',
  exts: ['xlsx'],

  async scan(zip, opts = {}) {
    const text = async (p) => { const f = zip.file(p); return f ? f.async('string') : ''; };
    const wb = await text('xl/workbook.xml');
    const wbRels = parseRels(await text('xl/_rels/workbook.xml.rels'));
    const sheets = [];
    const re = /<sheet\b[^>]*>/g;
    let m;
    while ((m = re.exec(wb))) {
      const name = /\sname="([^"]*)"/.exec(m[0]), rid = /\sr:id="([^"]*)"/.exec(m[0]);
      if (!rid || !wbRels.has(rid[1])) continue;
      sheets.push({ name: name ? xmlDecode(name[1]) : '', path: norm('xl/workbook.xml', wbRels.get(rid[1])) });
    }
    const shared = parseSharedStrings(await text('xl/sharedStrings.xml'));

    const usage = new Usage();
    for (let i = 0; i < sheets.length; i++) {
      const sh = sheets[i];
      const sheetRelsPath = sh.path.replace(/([^/]+)$/, '_rels/$1.rels');
      const srels = parseRels(await text(sheetRelsPath));
      const texts = sheetTexts(await text(sh.path), shared);
      let ordinal = 0;
      for (const target of srels.values()) {
        if (!/drawings\/[^/]+\.xml$/i.test(target)) continue;
        const dpath = norm(sh.path, target);
        const dxml = await text(dpath);
        if (!dxml) continue;
        const drels = parseRels(await text(dpath.replace(/([^/]+)$/, '_rels/$1.rels')));
        for (const b of parseBlipsAt(dxml)) {
          const tg = drels.get(b.rid), base = tg && mediaBase(tg);
          if (!base) continue;
          const a = anchorCell(dxml, b.at);
          const loc = { k: 'x', n: i + 1, name: sh.name, cell: a ? a.cell : '', o: ++ordinal };
          usage.add(base, loc, b.crop, b.alt, { title: sh.name, caption: cellContext(texts, a) }, b.xf);
        }
      }
    }
    return collectEntries(zip, { dir: 'xl/media/', usage, bgSet: null, useCrop: opts.useCrop !== false });
  }
};
