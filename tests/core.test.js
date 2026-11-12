/* اختبارات وحدة المنطق النقي:  npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pop32, hamming, similarity, clusterImages, dhashFromGray } from '../src/core/hash.js';
import { boundsFromData, cropRect } from '../src/core/geometry.js';
import { xmlDecode, parseRels, parseBlips } from '../src/core/xml.js';
import { locsLabel, locName, locRank } from '../src/core/loc.js';

const COL = new Uint8Array(48).fill(100);
const img = (lo, hi, w, h, color = COL) => ({ sig: { lo: lo >>> 0, hi: hi >>> 0, color }, width: w, height: h });

test('pop32 / hamming', () => {
  assert.equal(pop32(0), 0);
  assert.equal(pop32(0xFFFFFFFF), 32);
  assert.equal(pop32(0x80000001), 2);
  assert.equal(hamming({ lo: 0xFFFFFFFF, hi: 0 }, { lo: 0, hi: 0xF }), 36);
  assert.equal(hamming({ lo: 123, hi: 456 }, { lo: 123, hi: 456 }), 0);
});

test('similarity: نسبة الأبعاد وفرق اللون يمنعان الإيجابيات الخاطئة', () => {
  const a = img(0b1010, 0, 100, 100);
  assert.equal(similarity(a, img(0b1011, 0, 400, 400), 6), 1);
  assert.equal(similarity(a, img(0b1010, 0, 100, 300), 6), null);
  assert.equal(similarity(a, img(0b1010, 0, 100, 100, new Uint8Array(48).fill(220)), 6), null);
  assert.equal(similarity(a, img(0xFFFFFFFF, 0xFFFFFFFF, 100, 100), 6), null);
  assert.equal(similarity({ width: 1, height: 1 }, a, 6), null);
});

test('clusterImages: تجميع متعدٍّ (A~B وB~C فتجتمع الثلاث)', () => {
  const a = img(0b0000, 0, 100, 100), b = img(0b0111, 0, 100, 100), c = img(0b1111111, 0, 100, 100);
  assert.ok(hamming(a.sig, b.sig) <= 3 && hamming(b.sig, c.sig) <= 4 && hamming(a.sig, c.sig) > 4);
  assert.deepEqual(clusterImages([a, b, c], 4).map((g) => g.length), [3]);
  const far = img(0xFFFFFFFF, 0xFFFFFFFF, 100, 100);
  assert.deepEqual(clusterImages([a, far], 4).map((g) => g.length), [1, 1]);
  assert.deepEqual(clusterImages([], 4), []);
});

test('dhashFromGray', () => {
  assert.deepEqual(dhashFromGray(new Array(72).fill(128)), { lo: 0, hi: 0 });
  const desc = Array.from({ length: 72 }, (_, i) => 255 - (i % 9) * 20);
  assert.deepEqual(dhashFromGray(desc), { lo: 0xFFFFFFFF, hi: 0xFFFFFFFF });
  const asc = Array.from({ length: 72 }, (_, i) => (i % 9) * 20);
  assert.deepEqual(dhashFromGray(asc), { lo: 0, hi: 0 });
});

test('dhashFromGray: ضجيج ±1 في منطقة مسطحة لا يغيّر البصمة، لكن الحافة الحقيقية تُسجَّل', () => {
  const flat = Array.from({ length: 72 }, (_, i) => 90 + ((i * 7) % 3) - 1);      // 89..91 عشوائياً
  assert.deepEqual(dhashFromGray(flat), { lo: 0, hi: 0 });
  const a = Array.from({ length: 72 }, (_, i) => ((i % 9) < 4 ? 91 : 49) + ((i * 5) % 3) - 1);   // يسار فاتح | يمين داكن
  const b = Array.from({ length: 72 }, (_, i) => ((i % 9) < 4 ? 91 : 49) + ((i * 11) % 3) - 1);  // ضجيج مختلف
  assert.deepEqual(dhashFromGray(a), dhashFromGray(b));
  assert.notDeepEqual(dhashFromGray(a), { lo: 0, hi: 0 });                          // الحافة الفعلية ظاهرة
});

function rgba(w, h, fill) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) d.set(fill, i * 4);
  return d;
}
function paint(d, w, x0, y0, x1, y1, color) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) d.set(color, (y * w + x) * 4);
}

test('boundsFromData: هوامش بيضاء وشفافة، وصورة بيضاء، وممتلئة', () => {
  const w = 100, h = 80;
  const d = rgba(w, h, [255, 255, 255, 255]);
  paint(d, w, 20, 10, 59, 49, [200, 30, 30, 255]);
  assert.deepEqual(boundsFromData(d, w, h, 245), { x: 20, y: 10, w: 40, h: 40 });
  const t = rgba(w, h, [0, 0, 0, 0]);
  paint(t, w, 5, 5, 14, 14, [10, 10, 10, 255]);
  assert.deepEqual(boundsFromData(t, w, h, 245), { x: 5, y: 5, w: 10, h: 10 });
  assert.equal(boundsFromData(rgba(50, 50, [255, 255, 255, 255]), 50, 50, 245), null);
  assert.deepEqual(boundsFromData(rgba(30, 20, [10, 10, 10, 255]), 30, 20, 245), { x: 0, y: 0, w: 30, h: 20 });
});

test('boundsFromData: يتجاهل البكسل الشارد المنفرد', () => {
  const w = 1000, h = 1000;
  const d = rgba(w, h, [255, 255, 255, 255]);
  paint(d, w, 300, 300, 699, 699, [0, 0, 0, 255]);
  d.set([0, 0, 0, 255], (5 * w + 5) * 4);
  d.set([0, 0, 0, 255], (6 * w + 5) * 4);
  assert.deepEqual(boundsFromData(d, w, h, 245), { x: 300, y: 300, w: 400, h: 400 });
});

test('cropRect: تحويل srcRect إلى مستطيل بكسلات', () => {
  assert.equal(cropRect(1000, 500, null), null);
  assert.equal(cropRect(1000, 500, { l: 0, t: 0, r: 0, b: 0 }), null);
  assert.deepEqual(cropRect(1000, 500, { l: 10000, t: 20000, r: 30000, b: 0 }), { x: 100, y: 100, w: 600, h: 400 });
  assert.deepEqual(cropRect(1000, 500, { l: -5000, t: 0, r: 50000, b: 0 }), { x: 0, y: 0, w: 500, h: 500 });
  assert.equal(cropRect(100, 100, { l: 60000, t: 0, r: 60000, b: 0 }), null);
});

test('xmlDecode', () => {
  assert.equal(xmlDecode('a &amp; b &quot;c&quot; &lt;d&gt; &#1575;'), 'a & b "c" <d> ا');
});

test('parseRels: أي ترتيب للسمات', () => {
  const m = parseRels(`<Relationships>
    <Relationship Id="rId1" Type="t" Target="../slideLayouts/slideLayout1.xml"/>
    <Relationship Target="../media/image%201.png" Id="rId2" Type="img"/></Relationships>`);
  assert.equal(m.get('rId1'), '../slideLayouts/slideLayout1.xml');
  assert.equal(m.get('rId2'), '../media/image%201.png');
  assert.equal(m.size, 2);
});

test('parseBlips (pptx): srcRect وalt والأشكال والقص السالب', () => {
  const xml = `<p:cSld><p:spTree>
    <p:pic><p:nvPicPr><p:cNvPr id="4" name="P" descr="شعار &amp; &quot;الشركة&quot;"/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId2"/><a:srcRect l="10000" t="5000" r="20000" b="0"/><a:stretch/></p:blipFill></p:pic>
    <p:pic><p:nvPicPr><p:cNvPr id="5" name="P4"/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId3"><a:extLst/></a:blip><a:stretch/></p:blipFill></p:pic>
    <p:sp><p:spPr><a:blipFill><a:blip r:embed="rId4"/><a:srcRect/></a:blipFill></p:spPr></p:sp>
    <p:pic><p:nvPicPr><p:cNvPr id="6" name="P" descr="x"/></p:nvPicPr>
      <p:blipFill><a:blip r:embed="rId5"/><a:srcRect l="-3000" r="0"/></p:blipFill></p:pic>
  </p:spTree></p:cSld>`;
  const b = parseBlips(xml);
  assert.equal(b.length, 4);
  assert.deepEqual(b[0], { rid: 'rId2', crop: { l: 10000, t: 5000, r: 20000, b: 0 }, alt: 'شعار & "الشركة"' });
  assert.deepEqual(b[1], { rid: 'rId3', crop: null, alt: '' });
  assert.deepEqual(b[2], { rid: 'rId4', crop: null, alt: '' });
  assert.deepEqual(b[3], { rid: 'rId5', crop: null, alt: 'x' });
});

test('parseBlips (docx): pic:blipFill مع docPr.descr وsrcRect', () => {
  const xml = `<w:body><w:p><w:r><w:drawing><wp:inline>
      <wp:docPr id="1" name="Picture 1" descr="مخطط &amp; نتائج"/>
      <a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="x.png"/></pic:nvPicPr>
        <pic:blipFill><a:blip r:embed="rId5"/><a:srcRect l="25000" b="10000"/><a:stretch/></pic:blipFill>
      </pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
    <w:p><w:r><w:drawing><wp:anchor><wp:docPr id="2" name="Picture 2"/>
      <a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId6"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>
    </wp:anchor></w:drawing></w:r></w:p></w:body>`;
  const b = parseBlips(xml);
  assert.equal(b.length, 2);
  assert.deepEqual(b[0], { rid: 'rId5', crop: { l: 25000, t: 0, r: 0, b: 10000 }, alt: 'مخطط & نتائج' });
  assert.deepEqual(b[1], { rid: 'rId6', crop: null, alt: '' });
});

test('parseBlips (docx): alt لا يتسرب من رسم سابق إلى لاحق', () => {
  const xml = `<w:drawing><wp:docPr id="1" name="a" descr="الأول"/><pic:pic><pic:blipFill><a:blip r:embed="rId1"/></pic:blipFill></pic:pic></w:drawing>
    <w:drawing><wp:docPr id="2" name="b"/><pic:pic><pic:blipFill><a:blip r:embed="rId2"/></pic:blipFill></pic:pic></w:drawing>`;
  const b = parseBlips(xml);
  assert.equal(b[0].alt, 'الأول');
  assert.equal(b[1].alt, '');
});

test('parseBlips (docx القديم VML): imagedata مع القص بصيغة 16.16 وبالكسر، وترتيب الظهور', () => {
  const xml = `<w:pict><v:shape><v:imagedata r:id="rId7" o:title="شعار" cropleft="6554f" croptop="0.1"/></v:shape></w:pict>
    <w:drawing><pic:pic><pic:blipFill><a:blip r:embed="rId8"/></pic:blipFill></pic:pic></w:drawing>
    <w:pict><v:imagedata r:id="rId9"/></w:pict>`;
  const b = parseBlips(xml);
  assert.deepEqual(b.map((x) => x.rid), ['rId7', 'rId8', 'rId9']);
  assert.equal(b[0].alt, 'شعار');
  assert.ok(Math.abs(b[0].crop.l - 10000) < 5 && Math.abs(b[0].crop.t - 10000) < 1e-6);
  assert.equal(b[0].crop.r, 0);
  assert.equal(b[1].crop, null);
  assert.equal(b[2].crop, null);
});

test('loc: التسمية والترتيب', () => {
  assert.equal(locsLabel([]), '');
  assert.equal(locsLabel([{ k: 's', n: 1 }]), 'شريحة 1');
  assert.equal(locsLabel([1, 3, 5, 7, 9].map((n) => ({ k: 's', n }))), 'شرائح 1، 3، 5، 7…');
  assert.equal(locsLabel([{ k: 'h', n: 1 }, { k: 'p', n: 4 }]), 'موضع 4 · ترويسة 1');
  assert.equal(locName({ k: 's', n: 5 }), 'slide05');
  assert.equal(locName({ k: 'p', n: 12 }), 'img12');
  assert.ok(locRank({ k: 's', n: 99 }) < locRank({ k: 'p', n: 1 }));
});

/* ---- الأسماء من السياق ---- */
import { suggestName, isJunkText, slugify, uniqueNames } from '../src/core/naming.js';
import { slideTitle, parseStyleNames, docParagraphs, docContext } from '../src/core/xml.js';

test('naming: alt مهمل يُرفض والمفيد يُقبل', () => {
  for (const j of ['Image 12', 'Picture 3', 'image1.png', 'صورة 4', 'Description générée automatiquement', 'Capture d’écran 2024', '12']) assert.ok(isJunkText(j), j);
  assert.ok(!isJunkText('مخطط سير العمل'));
  assert.ok(!isJunkText('Organigramme du service'));
});
test('naming: الأولوية تعليق > alt > عنوان، وبادئة الشكل تُحذف', () => {
  const r = suggestName({ caption: 'الشكل 3: مخطط سير العمل', alt: 'Organigramme', title: 'عنوان' }, { loc: 'slide05' });
  assert.equal(r.name, 'slide05_مخطط_سير_العمل'); assert.equal(r.source, 'caption');
  assert.equal(suggestName({ alt: 'Image 4', title: 'Résultats trimestriels' }, { loc: 'slide02' }).name, 'slide02_Résultats_trimestriels');
  assert.equal(suggestName({ alt: 'Image 4', title: '' }, { loc: 'x' }), null);
});
test('naming: slugify آمن لأسماء الملفات', () => {
  assert.equal(slugify('a/b:c*d?"<>|e'), 'a_b_c_d_e');
  assert.equal(slugify('عَنوانٌ  طَويل'), 'عنوان_طويل');
  assert.ok(slugify('كلمة '.repeat(30)).length <= 48);
});
test('naming: uniqueNames', () => assert.deepEqual(uniqueNames(['a', 'A', 'b', 'a']), ['a', 'A_2', 'b', 'a_3']));
test('xml: slideTitle من عنصر العنوان', () => {
  const x = '<p:sp><p:txBody><a:t>ذيل</a:t></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Bilan</a:t></a:r><a:r><a:t> 2024</a:t></a:r></a:p></p:txBody></p:sp>';
  assert.equal(slideTitle(x), 'Bilan 2024');
});
test('xml: docContext يجد العنوان والتعليق', () => {
  const styles = parseStyleNames('<w:style w:styleId="H1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="Cap"><w:name w:val="caption"/></w:style>');
  const xml = '<w:p><w:pPr><w:pStyle w:val="H1"/></w:pPr><w:r><w:t>المقدمة</w:t></w:r></w:p><w:p><w:r><w:drawing>X</w:drawing></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Cap"/></w:pPr><w:r><w:t>شكل 1: الهيكل</w:t></w:r></w:p>';
  const paras = docParagraphs(xml, styles);
  assert.deepEqual(docContext(paras, xml.indexOf('<w:drawing')), { title: 'المقدمة', caption: 'شكل 1: الهيكل' });
});

/* ---- المكتبة وذاكرة الأسماء ---- */
import { normText, addToLibrary, searchLibrary, rememberedName, libraryStats, findMatch } from '../src/core/library.js';
const mkSig = (lo, hi) => ({ sig: { lo, hi, color: new Array(48).fill(100) }, width: 100, height: 100 });
test('library: normText يوحّد العربية والفرنسية', () => {
  assert.equal(normText('الإِدارَة'), normText('الاداره'));
  assert.equal(normText('Élève_Réunion'), 'eleve reunion');
});
test('library: الدمج والظهورات ولا تكرار', () => {
  const recs = [];
  const a = addToLibrary(recs, { ...mkSig(1, 2), name: 'شعار', appearances: [{ doc: 'd1', loc: 'slide01' }] }, { now: 1 });
  assert.ok(a.isNew);
  const b = addToLibrary(recs, { ...mkSig(1, 3), name: 'شعار_الشركة', appearances: [{ doc: 'd2', loc: 'slide04' }, { doc: 'd1', loc: 'slide01' }] }, { now: 2 });
  assert.ok(!b.isNew); assert.equal(b.addedAppearances, 1);
  assert.equal(recs.length, 1); assert.equal(recs[0].appearances.length, 2); assert.equal(recs[0].name, 'شعار_الشركة');
  addToLibrary(recs, { ...mkSig(0xffffffff, 0), appearances: [{ doc: 'd1', loc: 'slide02' }] });
  assert.equal(recs.length, 2);
  assert.deepEqual(libraryStats(recs), { images: 2, documents: 2, appearances: 3, withFull: 0 });
});
test('library: البحث AND بتطبيع، وذاكرة الأسماء', () => {
  const recs = [];
  addToLibrary(recs, { ...mkSig(1, 2), name: 'logo_société', appearances: [{ doc: 'تقرير', loc: 'slide01', title: 'الإدارة العامة' }] });
  addToLibrary(recs, { ...mkSig(0xf0f0f0f0, 0x0f0f0f0f), name: 'chart', appearances: [{ doc: 'rapport', loc: 'p01' }] });
  assert.equal(searchLibrary(recs, 'societe').length, 1);
  assert.equal(searchLibrary(recs, 'الاداره العامه').length, 1);
  assert.equal(searchLibrary(recs, 'societe rapport').length, 0);
  assert.equal(searchLibrary(recs, '').length, 2);
  assert.equal(rememberedName(recs, mkSig(1, 2)).name, 'logo_société');
  assert.equal(rememberedName(recs, mkSig(0x0ff00ff0, 0xf00ff00f)), null);
});

/* ---- PDF: رياضيات ونصوص ---- */
import { mul, unitBBox, coverage, xfFromMatrix, buildLines, pageContext } from '../src/core/pdfmath.js';
test('pdf: تغطية الصفحة وحدود الصورة', () => {
  const view = [0, 0, 595, 842];
  assert.deepEqual(unitBBox([300, 0, 0, 150, 50, 560]), [50, 560, 350, 710]);
  assert.ok(coverage(unitBBox([595, 0, 0, 842, 0, 0]), view) > 0.99);
  assert.ok(coverage(unitBBox([300, 0, 0, 150, 50, 560]), view) < 0.1);
  assert.ok(coverage(unitBBox([2000, 0, 0, 2000, -500, -500]), view) > 0.99);   // أكبر من الصفحة: تُقصّ على الصفحة
});
test('pdf: xfFromMatrix يميّز الأوضاع الثمانية ويرفض المائل', () => {
  assert.equal(xfFromMatrix([300, 0, 0, 150, 0, 0]), null);
  assert.deepEqual(xfFromMatrix([-200, 0, 0, 100, 0, 0]), { rot: 0, fh: true, fv: false });
  assert.deepEqual(xfFromMatrix([300, 0, 0, -150, 0, 0]), { rot: 0, fh: false, fv: true });
  assert.deepEqual(xfFromMatrix([-300, 0, 0, -150, 0, 0]), { rot: 180, fh: false, fv: false });
  const cw = [0, -150, 150, 0, 0, 0];                       // الصورة تدور مع عقارب الساعة 90°
  assert.deepEqual(xfFromMatrix(cw), { rot: 90, fh: false, fv: false });
  assert.deepEqual(xfFromMatrix([0, 150, -150, 0, 0, 0]), { rot: 270, fh: false, fv: false });
  assert.equal(xfFromMatrix([100, 100, -100, 100, 0, 0]), undefined);   // 45°
});
test('pdf: تركيب المصفوفات (cm) بالترتيب الصحيح', () => {
  const scale = [2, 0, 0, 2, 0, 0], move = [1, 0, 0, 1, 10, 5];
  assert.deepEqual(mul(move, scale), [2, 0, 0, 2, 10, 5]);   // تكبير ثم نقل
  assert.deepEqual(mul(scale, move), [2, 0, 0, 2, 20, 10]);
});
test('pdf: تعليق أسفل الصورة وعنوان الصفحة (لاتيني وعربي)', () => {
  const it = (str, x, y, w, h) => ({ str, transform: [h, 0, 0, h, x, y], width: w, height: h });
  const lines = buildLines([it('Rapport trimestriel', 50, 790, 200, 22), it('Figure 1 : ', 50, 540, 50, 11), it('Organigramme', 100, 540, 80, 11), it('bas de page', 50, 30, 60, 9)]);
  const ctx = pageContext(lines, [50, 560, 350, 710]);
  assert.equal(ctx.caption, 'Figure 1 : Organigramme');
  assert.equal(ctx.title, 'Rapport trimestriel');
  const ar = buildLines([it('الهيكل', 300, 540, 40, 11), it('شكل 2:', 345, 540, 30, 11)]);    // عربي: يُرتَّب من اليمين لليسار
  assert.equal(ar[0].text, 'شكل 2: الهيكل');
  assert.equal(pageContext(lines, [50, 100, 300, 200]).caption, '');   // لا نص قريب
});

/* ---- التصدير: CSV وبيان الموسوعة ---- */
import { toCsv, csvCell, wbManifest, wbId } from '../src/core/exporters.js';
test('csv: BOM وهروب الفواصل والاقتباس ومنع الصيغ', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('قال "نعم"'), '"قال ""نعم"""');
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  const t = toCsv(['x', 'y'], [['1', 'سطر\nثانٍ']]);
  assert.ok(t.startsWith('﻿x,y\r\n'));
  assert.ok(t.includes('"سطر\nثانٍ"'));
});
test('موسوعة السبورة: معرّفات صالحة وأسماء مقصوصة وفريدة', () => {
  assert.match(wbId(), /^[\w-]{4,40}$/);
  const { manifest, ids } = wbManifest([{ name: 'ا'.repeat(80), subject: ' رياضيات ', mime: 'image/png', w: 10, h: 20 }, { name: '', subject: '', mime: 'image/jpeg', w: 1, h: 1 }], 1000);
  assert.equal(manifest.format, 'wb-encyclopedia');
  assert.equal(manifest.version, 1);
  assert.equal(manifest.items[0].name.length, 40);
  assert.equal(manifest.items[0].subject, 'رياضيات');
  assert.equal(manifest.items[1].name, 'صورة');
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.every((i) => /^[\w-]{4,40}$/.test(i)));
});

/* ---- PDF: استخراج JPEG الخام ---- */
import { RawPdf, parseRef, jpegInfo } from '../src/core/pdfraw.js';
const fakeJpeg = (comps = 3) => Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 8 + comps * 3, 8, 0, 2, 0, 3, comps, ...Array(comps * 3).fill(1), 0xff, 0xda, 0, 2, 1, 2, 3, 0xff, 0xd9]);
const pdfWith = (dict, data) => {
  const head = new TextEncoder().encode(`%PDF-1.4\n7 0 obj\n<< /Type /XObject /Subtype /Image ${dict} /Length ${data.length} >>\nstream\n`);
  const tail = new TextEncoder().encode('\nendstream\nendobj\n');
  const out = new Uint8Array(head.length + data.length + tail.length);
  out.set(head); out.set(data, head.length); out.set(tail, head.length + data.length);
  return out;
};
test('pdfraw: parseRef وترويسة JPEG', () => {
  assert.deepEqual(parseRef('7R'), { num: 7, gen: 0 });
  assert.deepEqual(parseRef('12R3'), { num: 12, gen: 3 });
  assert.equal(parseRef('x'), null);
  assert.deepEqual(jpegInfo(fakeJpeg(3)), { precision: 8, h: 2, w: 3, comps: 3 });
});
test('pdfraw: يُرجع بايتات JPEG الأصلية كما هي، ويرفض الحالات غير الآمنة', () => {
  const j = fakeJpeg(3);
  const ok = new RawPdf(pdfWith('/Width 3 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode', j)).jpeg('7R');
  assert.deepEqual(Array.from(ok), Array.from(j));
  assert.ok(new RawPdf(pdfWith('/Filter [/DCTDecode]', j)).jpeg('7R'));
  assert.equal(new RawPdf(pdfWith('/Filter /DCTDecode /SMask 9 0 R', j)).jpeg('7R'), null);          // له قناع شفافية
  assert.equal(new RawPdf(pdfWith('/Filter /DCTDecode /Decode [1 0 1 0 1 0]', j)).jpeg('7R'), null);
  assert.equal(new RawPdf(pdfWith('/Filter [/FlateDecode /DCTDecode]', j)).jpeg('7R'), null);       // سلسلة مرشّحات
  assert.equal(new RawPdf(pdfWith('/Filter /FlateDecode', j)).jpeg('7R'), null);
  assert.equal(new RawPdf(pdfWith('/Filter /DCTDecode', fakeJpeg(4))).jpeg('7R'), null);            // CMYK
  assert.equal(new RawPdf(pdfWith('/Filter /DCTDecode', j)).jpeg('8R'), null);                      // كائن غير موجود
});
import { ascii85 } from '../src/core/pdfraw.js';
test('pdfraw: ASCII85 ثم DCT', () => {
  // "Man " → 9jqo^
  assert.equal(new TextDecoder().decode(ascii85(new TextEncoder().encode('9jqo^~>'))), 'Man ');
  assert.deepEqual(Array.from(ascii85(new TextEncoder().encode('z~>'))), [0, 0, 0, 0]);
  const j = fakeJpeg(3);
  const enc85 = (b) => { let s = ''; for (let i = 0; i < b.length; i += 4) { const ch = b.slice(i, i + 4); const n = ch.length; let v = 0; for (let k = 0; k < 4; k++) v = v * 256 + (ch[k] || 0); const d = []; for (let k = 0; k < 5; k++) { d.unshift(v % 85); v = Math.floor(v / 85); } s += String.fromCharCode(...d.map((x) => x + 33)).slice(0, n === 4 ? 5 : n + 1); } return s + '~>'; };
  const ok = new RawPdf(pdfWith('/Filter [ /ASCII85Decode /DCTDecode ]', new TextEncoder().encode(enc85(j)))).jpeg('7R');
  assert.deepEqual(Array.from(ok), Array.from(j));
});

/* ---- الترجمة: لا نص عربي في القالب أو الكود بلا مقابل فرنسي ---- */
import fs from 'node:fs';
import { FR, tr } from '../src/ui/i18n.js';
const AR = /[؀-ۿ]/;
const nrm = (s) => s.replace(/\s+/g, ' ').trim();
const decodeEnt = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
test('i18n: كل نص عربي ثابت في القالب له ترجمة', () => {
  const html = fs.readFileSync(new URL('../src/ui/index.template.html', import.meta.url), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '');
  const missing = new Set();
  for (const m of html.matchAll(/>([^<>]+)</g)) { const t = nrm(decodeEnt(m[1])); if (AR.test(t) && FR[t] === undefined) missing.add(t); }
  for (const m of html.matchAll(/\s(?:title|aria-label|placeholder)="([^"]*)"/g)) { const t = nrm(decodeEnt(m[1])); if (AR.test(t) && FR[t] === undefined) missing.add(t); }
  assert.deepEqual([...missing], []);
});
test('i18n: كل مفتاح tr(...) في الكود له ترجمة، وقيم الدوال تعمل', () => {
  const missing = new Set();
  for (const f of ['../src/ui/app.js', '../src/ui/library-ui.js']) {
    const js = fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const m of js.matchAll(/\btr\(\s*'((?:[^'\\]|\\.)*)'/g)) { const k = m[1].replace(/\\'/g, "'"); if (AR.test(k) && FR[k] === undefined) missing.add(k); }
  }
  assert.deepEqual([...missing], []);
  for (const [k, v] of Object.entries(FR)) if (typeof v === 'function') assert.equal(typeof v({ n: 2, dups: 2, cross: 1, from: 'x', tail: '' }), 'string', k);
  assert.equal(tr('تم حذف {n} صورة', { n: 3 }), 'تم حذف 3 صورة');           // العربية: استبدال المتغيرات فقط
});
