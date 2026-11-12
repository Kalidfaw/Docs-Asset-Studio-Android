/* مستخرج PowerPoint (.pptx) */
import { parseRels, parseBlipsAt, slideTitle } from '../xml.js';
import { Usage, mediaBase, collectEntries } from './common.js';

export const pptx = {
  id: 'pptx',
  label: 'PowerPoint',
  exts: ['pptx'],

  /* zip: كائن JSZip محمّل. opts = { useCrop }  →  { entries, unsupported } */
  async scan(zip, opts = {}) {
    const slideRels = new Map(), slideXml = new Map(), bgSet = new Set(), tasks = [];
    const tplRels = new Map(), tplXml = new Map();       // تخطيطات وماسترات: المفتاح 'l1' / 'm1'
    zip.forEach((path, entry) => {
      let m;
      if ((m = path.match(/^ppt\/slides\/_rels\/slide(\d+)\.xml\.rels$/))) {
        const num = +m[1];
        tasks.push(entry.async('string').then((t) => slideRels.set(num, parseRels(t))));
      } else if ((m = path.match(/^ppt\/slides\/slide(\d+)\.xml$/))) {
        const num = +m[1];
        tasks.push(entry.async('string').then((t) => slideXml.set(num, t)));
      } else if ((m = path.match(/^ppt\/(slideLayouts|slideMasters)\/_rels\/(?:slideLayout|slideMaster)(\d+)\.xml\.rels$/))) {
        const key = (m[1] === 'slideLayouts' ? 'l' : 'm') + m[2];
        tasks.push(entry.async('string').then((t) => {
          const rels = parseRels(t);
          tplRels.set(key, rels);
          for (const tg of rels.values()) { const b = mediaBase(tg); if (b) bgSet.add(b); }
        }));
      } else if ((m = path.match(/^ppt\/(slideLayouts|slideMasters)\/(?:slideLayout|slideMaster)(\d+)\.xml$/))) {
        const key = (m[1] === 'slideLayouts' ? 'l' : 'm') + m[2];
        tasks.push(entry.async('string').then((t) => tplXml.set(key, t)));
      } else if (/^ppt\/(slideLayouts|slideMasters)\/_rels\/[^/]+\.rels$/.test(path)) {
        tasks.push(entry.async('string').then((t) => {
          for (const tg of parseRels(t).values()) { const b = mediaBase(tg); if (b) bgSet.add(b); }
        }));
      }
    });
    await Promise.all(tasks);

    const usage = new Usage();
    for (const [num, rels] of slideRels) {
      const loc = { k: 's', n: num };
      const seen = new Set();
      const xml = slideXml.get(num);
      const ctx = { title: xml ? slideTitle(xml) : '', caption: '' };
      if (xml) {
        for (const b of parseBlipsAt(xml)) {
          const tg = rels.get(b.rid), base = tg && mediaBase(tg);
          if (!base) continue;
          seen.add(b.rid);
          usage.add(base, loc, b.crop, b.alt, ctx, b.xf);
        }
      }
      for (const [rid, tg] of rels) {                 // علاقات وسائط لم تظهر في XML (خلفية الشريحة مثلاً)
        if (seen.has(rid)) continue;
        const base = mediaBase(tg);
        if (base) usage.add(base, loc, null, '', ctx);
      }
    }
    // التخطيطات والماسترات: لها مواضعها (قالب n / ماستر n) وتُطبَّق عليها srcRect والتدوير كالشرائح
    for (const [key, xml] of tplXml) {
      const rels = tplRels.get(key);
      if (!rels) continue;
      const loc = { k: key[0], n: +key.slice(1) };
      for (const b of parseBlipsAt(xml)) {
        const tg = rels.get(b.rid), base = tg && mediaBase(tg);
        if (base) usage.add(base, loc, b.crop, b.alt, null, b.xf);
      }
    }
    return collectEntries(zip, { dir: 'ppt/', usage, bgSet, useCrop: opts.useCrop !== false });
  }
};
