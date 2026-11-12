/* اختبارات المستخرجات على حزم ZIP تُبنى في الذاكرة:  npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { pptx } from '../src/core/extractors/pptx.js';
import { docx } from '../src/core/extractors/docx.js';
import { pickExtractor, ACCEPT } from '../src/core/extractors/index.js';

const bytes = (n) => new Uint8Array(n).fill(7);
const rels = (items) => `<Relationships xmlns="x">${items.map(([id, t]) => `<Relationship Id="${id}" Type="image" Target="${t}"/>`).join('')}</Relationships>`;
const pic = (rid, crop, descr) => `<w:drawing><wp:docPr id="1" name="p"${descr ? ` descr="${descr}"` : ''}/><pic:pic><pic:blipFill><a:blip r:embed="${rid}"/>${crop ? `<a:srcRect l="${crop}"/>` : ''}</pic:blipFill></pic:pic></w:drawing>`;

test('pickExtractor وACCEPT', () => {
  assert.equal(pickExtractor('عرض.PPTX').id, 'pptx');
  assert.equal(pickExtractor('تقرير.docx').id, 'docx');
  assert.equal(pickExtractor('old.doc'), null);
  assert.equal(pickExtractor('noext'), null);
  assert.equal(ACCEPT, '.pptx,.docx,.xlsx,.pdf');
  assert.equal(pickExtractor('موازنة.XLSX').id, 'xlsx');
});

test('docx: ترتيب المتن، القص، alt، ترويسة/تذييل، تعدد النسخ، EMF، يتيمة', async () => {
  const z = new JSZip();
  z.file('word/media/image1.png', bytes(10));
  z.file('word/media/image2.jpeg', bytes(10));
  z.file('word/media/logo.png', bytes(10));
  z.file('word/media/orphan.png', bytes(10));
  z.file('word/media/chart.emf', bytes(10));
  z.file('word/document.xml', `<w:body>
    ${pic('rId1', null, 'الأولى &amp; الهامة')}
    ${pic('rId2', null)}
    ${pic('rId1', 30000)}
  </w:body>`);
  z.file('word/_rels/document.xml.rels', rels([['rId1', 'media/image1.png'], ['rId2', 'media/image2.jpeg']]));
  z.file('word/header1.xml', `<w:hdr>${pic('rId1', null)}</w:hdr>`);
  z.file('word/_rels/header1.xml.rels', rels([['rId1', 'media/logo.png']]));
  z.file('word/footer2.xml', `<w:ftr>${pic('rId1', null)}</w:ftr>`);
  z.file('word/_rels/footer2.xml.rels', rels([['rId1', 'media/logo.png']]));

  const { entries, unsupported } = await docx.scan(z, { useCrop: true });
  assert.equal(unsupported, 1);
  const by = Object.fromEntries(entries.map((e) => [e.base, e]));
  assert.deepEqual(Object.keys(by).sort(), ['image1.png', 'image2.jpeg', 'logo.png', 'orphan.png']);

  // image1: نسخة كاملة (الموضع 1) ثم نسخة مقصوصة (الموضع 3)
  assert.equal(by['image1.png'].variants.length, 2);
  assert.deepEqual({ ...by['image1.png'].variants[0], ctx: undefined }, { crop: null, locs: [{ k: 'p', n: 1 }], alt: 'الأولى & الهامة', ctx: undefined, xf: null });
  assert.deepEqual(by['image1.png'].variants[1].crop, { l: 30000, t: 0, r: 0, b: 0 });
  assert.deepEqual(by['image1.png'].variants[1].locs, [{ k: 'p', n: 3 }]);
  assert.deepEqual(by['image2.jpeg'].variants[0].locs, [{ k: 'p', n: 2 }]);
  // الشعار في الترويسة والتذييل معاً (نسخة واحدة بموضعين)
  assert.equal(by['logo.png'].variants.length, 1);
  assert.deepEqual(by['logo.png'].variants[0].locs, [{ k: 'h', n: 1 }, { k: 'f', n: 2 }]);
  // الصورة اليتيمة تُستخرج بلا موضع، وتأتي آخراً
  assert.deepEqual(by['orphan.png'].variants[0].locs, []);
  assert.equal(entries[entries.length - 1].base, 'orphan.png');
  assert.ok(entries.every((e) => e.category === 'media'));
});

test('docx: إيقاف القص يدمج كل الاستخدامات في نسخة واحدة', async () => {
  const z = new JSZip();
  z.file('word/media/a.png', bytes(10));
  z.file('word/document.xml', `<w:body>${pic('rId1', null)}${pic('rId1', 40000)}</w:body>`);
  z.file('word/_rels/document.xml.rels', rels([['rId1', 'media/a.png']]));
  const { entries } = await docx.scan(z, { useCrop: false });
  assert.equal(entries[0].variants.length, 1);
  assert.equal(entries[0].variants[0].crop, null);
  assert.deepEqual(entries[0].variants[0].locs, [{ k: 'p', n: 1 }, { k: 'p', n: 2 }]);
});

test('docx: VML القديم يُقرأ، ومستند بلا علاقات لا ينهار', async () => {
  const z = new JSZip();
  z.file('word/media/old.png', bytes(10));
  z.file('word/document.xml', `<w:body><w:pict><v:imagedata r:id="rId4" o:title="قديمة" cropright="0.25"/></w:pict></w:body>`);
  z.file('word/_rels/document.xml.rels', rels([['rId4', 'media/old.png']]));
  const { entries } = await docx.scan(z, { useCrop: true });
  assert.deepEqual(entries[0].variants[0].locs, [{ k: 'p', n: 1 }]);
  assert.equal(entries[0].variants[0].alt, 'قديمة');
  assert.ok(Math.abs(entries[0].variants[0].crop.r - 25000) < 1e-6);

  const z2 = new JSZip();
  z2.file('word/media/x.png', bytes(10));
  z2.file('word/document.xml', '<w:body/>');
  const r2 = await docx.scan(z2, {});
  assert.equal(r2.entries.length, 1);
});

test('pptx: مواضع الشرائح، القص، خلفيات القوالب، وعلاقات بلا XML', async () => {
  const sld = (picsXml) => `<p:sld><p:cSld><p:spTree>${picsXml}</p:spTree></p:cSld></p:sld>`;
  const p = (rid, crop, descr) => `<p:pic><p:nvPicPr><p:cNvPr id="2" name="x"${descr ? ` descr="${descr}"` : ''}/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/>${crop ? `<a:srcRect l="${crop}"/>` : ''}</p:blipFill></p:pic>`;
  const z = new JSZip();
  ['image1.png', 'image2.png', 'bg.jpg', 'extra.png'].forEach((n) => z.file('ppt/media/' + n, bytes(10)));
  z.file('ppt/media/v.emf', bytes(10));
  z.file('ppt/slides/slide1.xml', sld(p('rId1', null, 'alt1') + p('rId1', 50000) + p('rId2', null)));
  z.file('ppt/slides/_rels/slide1.xml.rels', rels([['rId1', '../media/image1.png'], ['rId2', '../media/image2.png']]));
  z.file('ppt/slides/slide2.xml', sld(p('rId1', 50000)));
  z.file('ppt/slides/_rels/slide2.xml.rels', rels([['rId1', '../media/image1.png'], ['rId9', '../media/extra.png']]));
  z.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([['rId1', '../media/bg.jpg']]));

  const { entries, unsupported } = await pptx.scan(z, { useCrop: true });
  assert.equal(unsupported, 1);
  const by = Object.fromEntries(entries.map((e) => [e.base, e]));
  assert.equal(by['image1.png'].variants.length, 2);
  assert.deepEqual(by['image1.png'].variants[0].locs, [{ k: 's', n: 1 }]);
  assert.equal(by['image1.png'].variants[0].alt, 'alt1');
  assert.deepEqual(by['image1.png'].variants[1].locs, [{ k: 's', n: 1 }, { k: 's', n: 2 }]);
  assert.deepEqual(by['extra.png'].variants[0].locs, [{ k: 's', n: 2 }]);     // علاقة بلا ظهور في XML
  assert.equal(by['bg.jpg'].category, 'background');
  assert.deepEqual(by['bg.jpg'].variants[0].locs, []);
  assert.equal(entries[0].base, 'image1.png');
  assert.equal(entries[entries.length - 1].base, 'bg.jpg');
});

test('التدوير والقلب: xformOf يلتقط مضاعفات 90° فقط', async () => {
  const { xformOf } = await import('../src/core/xml.js');
  assert.deepEqual(xformOf('<a:xfrm rot="5400000"><a:off/></a:xfrm>'), { rot: 90, fh: false, fv: false });
  assert.deepEqual(xformOf('<a:xfrm rot="16200000" flipH="1">'), { rot: 270, fh: true, fv: false });
  assert.deepEqual(xformOf('<a:xfrm flipV="true">'), { rot: 0, fh: false, fv: true });
  assert.deepEqual(xformOf('<a:xfrm rot="-5400000">'), { rot: 270, fh: false, fv: false });
  assert.equal(xformOf('<a:xfrm rot="1500000">'), null);       // 25° — لا يُطبَّق
  assert.equal(xformOf('<a:xfrm><a:off x="0" y="0"/></a:xfrm>'), null);
});

test('pptx: صورة بتدوير مختلف = نسخة مستقلة؛ تخطيط وماستر بقصّهما ومواضعهما', async () => {
  const p = (rid, xfrm) => `<p:pic><p:nvPicPr><p:cNvPr id="2" name="x"/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/></p:blipFill><p:spPr><a:xfrm${xfrm}><a:off x="0" y="0"/></a:xfrm></p:spPr></p:pic>`;
  const z = new JSZip();
  ['a.png', 'bg.jpg', 'logo.png'].forEach((n) => z.file('ppt/media/' + n, bytes(10)));
  z.file('ppt/slides/slide1.xml', `<p:sld>${p('rId1', '')}${p('rId1', ' rot="5400000"')}</p:sld>`);
  z.file('ppt/slides/_rels/slide1.xml.rels', rels([['rId1', '../media/a.png']]));
  z.file('ppt/slideLayouts/slideLayout2.xml', `<p:sldLayout><p:cSld><p:bg><p:bgPr><a:blipFill><a:blip r:embed="rId1"/><a:srcRect t="10000"/></a:blipFill></p:bgPr></p:bg></p:cSld></p:sldLayout>`);
  z.file('ppt/slideLayouts/_rels/slideLayout2.xml.rels', rels([['rId1', '../media/bg.jpg']]));
  z.file('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster>${p('rId1', '')}</p:sldMaster>`);
  z.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([['rId1', '../media/logo.png']]));
  const { entries } = await pptx.scan(z, { useCrop: true });
  const by = Object.fromEntries(entries.map((e) => [e.base, e]));
  assert.equal(by['a.png'].variants.length, 2);
  assert.equal(by['a.png'].variants[0].xf, null);
  assert.deepEqual(by['a.png'].variants[1].xf, { rot: 90, fh: false, fv: false });
  assert.equal(by['bg.jpg'].category, 'background');
  assert.deepEqual(by['bg.jpg'].variants[0].locs, [{ k: 'l', n: 2 }]);
  assert.deepEqual(by['bg.jpg'].variants[0].crop, { l: 0, t: 10000, r: 0, b: 0 });
  assert.equal(by['logo.png'].category, 'background');
  assert.deepEqual(by['logo.png'].variants[0].locs, [{ k: 'm', n: 1 }]);
  const off = await pptx.scan(z, { useCrop: false });
  assert.equal(off.entries.find((e) => e.base === 'a.png').variants.length, 1);
});

test('docx: تدوير pic:spPr', async () => {
  const z = new JSZip();
  z.file('word/media/a.png', bytes(10));
  z.file('word/document.xml', `<w:body><w:drawing><pic:pic><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill><pic:spPr><a:xfrm rot="10800000" flipH="1"/></pic:spPr></pic:pic></w:drawing></w:body>`);
  z.file('word/_rels/document.xml.rels', rels([['rId1', 'media/a.png']]));
  const { entries } = await docx.scan(z, { useCrop: true });
  assert.deepEqual(entries[0].variants[0].xf, { rot: 180, fh: true, fv: false });
});

/* ---- Excel ---- */
import { xlsx } from '../src/core/extractors/xlsx.js';
import { colName, colIndex, anchorCell, cellContext, sheetTexts, parseSharedStrings } from '../src/core/xml.js';
import { locsLabel, locName, sortLocs } from '../src/core/loc.js';

test('xlsx: أسماء الأعمدة وحل الخلية', () => {
  assert.equal(colName(0), 'A'); assert.equal(colName(25), 'Z'); assert.equal(colName(26), 'AA'); assert.equal(colName(27), 'AB');
  assert.equal(colIndex('AB'), 27);
  const xml = '<xdr:twoCellAnchor><xdr:from><xdr:col>1</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:pic>X</xdr:pic></xdr:twoCellAnchor><xdr:absoluteAnchor><xdr:pic>Y</xdr:pic></xdr:absoluteAnchor>';
  assert.deepEqual(anchorCell(xml, xml.indexOf('X')), { col: 1, row: 3, cell: 'B4' });
  assert.equal(anchorCell(xml, xml.indexOf('Y')), null);          // مرساة مطلقة: لا خلية
});

test('xlsx: سياق الخلية من نصوص مشتركة ومضمّنة', () => {
  const shared = parseSharedStrings('<sst><si><t>شعار الشركة</t></si><si><r><t>Total </t></r><r><t>Q1</t></r></si></sst>');
  assert.deepEqual(shared, ['شعار الشركة', 'Total Q1']);
  const texts = sheetTexts('<sheetData><row><c r="B3" t="s"><v>0</v></c><c r="A4" t="inlineStr"><is><t>Légende</t></is></c><c r="C9"><v>12</v></c></row></sheetData>', shared);
  assert.equal(cellContext(texts, { col: 1, row: 3 }), 'شعار الشركة');   // فوق B4
  assert.equal(cellContext(texts, { col: 1, row: 3 }), 'شعار الشركة');
  assert.equal(cellContext(texts, { col: 1, row: 3 + 0 }), 'شعار الشركة');
  assert.equal(cellContext(texts, { col: 1, row: 3 }), 'شعار الشركة');
  assert.equal(cellContext(texts, { col: 5, row: 8 }), '');         // الأرقام لا تُعدّ نصاً
  assert.equal(cellContext(texts, { col: 1, row: 3 }), 'شعار الشركة');
  const left = cellContext(sheetTexts('<c r="A4" t="inlineStr"><is><t>Légende</t></is></c>', []), { col: 1, row: 3 });
  assert.equal(left, 'Légende');                                    // يسار B4
});

test('xlsx: ورقة ← رسم ← صورة مع الموضع والقص والتدوير والسياق', async () => {
  const z = new JSZip();
  ['logo.png', 'chart.png', 'orphan.png'].forEach((n) => z.file('xl/media/' + n, bytes(10)));
  z.file('xl/workbook.xml', '<workbook><sheets><sheet name="الموازنة" sheetId="1" r:id="rId1"/><sheet name="Bilan &amp; Co" sheetId="2" r:id="rId2"/></sheets></workbook>');
  z.file('xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/></Relationships>');
  z.file('xl/sharedStrings.xml', '<sst><si><t>شعار الجهة</t></si></sst>');
  z.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="2"><c r="B2" t="s"><v>0</v></c></row></sheetData></worksheet>');
  z.file('xl/worksheets/_rels/sheet1.xml.rels', '<Relationships><Relationship Id="rId1" Type="drawing" Target="../drawings/drawing1.xml"/></Relationships>');
  z.file('xl/worksheets/sheet2.xml', '<worksheet/>');
  z.file('xl/worksheets/_rels/sheet2.xml.rels', '<Relationships><Relationship Id="rId1" Type="drawing" Target="../drawings/drawing2.xml"/></Relationships>');
  const anchor = (c, r, rid, extra = '', xfrm = '') => `<xdr:twoCellAnchor><xdr:from><xdr:col>${c}</xdr:col><xdr:row>${r}</xdr:row></xdr:from><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="p" descr="وصف"/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/>${extra}</xdr:blipFill><xdr:spPr><a:xfrm${xfrm}/></xdr:spPr></xdr:pic></xdr:twoCellAnchor>`;
  z.file('xl/drawings/drawing1.xml', `<xdr:wsDr>${anchor(1, 2, 'rId1')}${anchor(4, 9, 'rId1', '<a:srcRect l="25000"/>', ' rot="5400000"')}</xdr:wsDr>`);
  z.file('xl/drawings/_rels/drawing1.xml.rels', rels([['rId1', '../media/logo.png']]));
  z.file('xl/drawings/drawing2.xml', `<xdr:wsDr>${anchor(0, 0, 'rId1')}</xdr:wsDr>`);
  z.file('xl/drawings/_rels/drawing2.xml.rels', rels([['rId1', '../media/chart.png']]));

  const { entries } = await xlsx.scan(z, { useCrop: true });
  const by = Object.fromEntries(entries.map((e) => [e.base, e]));
  const logo = by['logo.png'];
  assert.equal(logo.variants.length, 2);
  assert.deepEqual(logo.variants[0].locs, [{ k: 'x', n: 1, name: 'الموازنة', cell: 'B3', o: 1 }]);
  assert.equal(logo.variants[0].ctx.caption, 'شعار الجهة');         // نص B2 فوق B3
  assert.equal(logo.variants[0].ctx.title, 'الموازنة');
  assert.equal(logo.variants[0].alt, 'وصف');
  assert.deepEqual(logo.variants[1].crop, { l: 25000, t: 0, r: 0, b: 0 });
  assert.deepEqual(logo.variants[1].xf, { rot: 90, fh: false, fv: false });
  assert.equal(logo.variants[1].locs[0].cell, 'E10');
  assert.equal(by['chart.png'].variants[0].locs[0].name, 'Bilan & Co');
  assert.equal(by['chart.png'].variants[0].locs[0].n, 2);
  assert.deepEqual(by['orphan.png'].variants[0].locs, []);
  // التسمية والعرض والترتيب
  assert.equal(locName(logo.variants[0].locs[0]), 'الموازنة_B3');
  assert.equal(locName(by['chart.png'].variants[0].locs[0]), 'Bilan_Co_A1');
  assert.equal(locsLabel(logo.variants[0].locs), 'ورقة «الموازنة» B3');
  // تعدد صور في الورقة نفسها لا يدمج المواضع
  const merged = (await xlsx.scan(z, { useCrop: false })).entries.find((e) => e.base === 'logo.png');
  assert.equal(merged.variants.length, 1);
  assert.deepEqual(merged.variants[0].locs.map((l) => l.cell), ['B3', 'E10']);
});
