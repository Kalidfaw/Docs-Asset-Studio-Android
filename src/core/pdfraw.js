/* استخراج بايتات JPEG الأصلية من ملف PDF (بلا إعادة ترميز) — نقي بلا DOM.
   نبحث عن «N G obj» في البايتات الخام (آخر ظهور يفوز بسبب التحديثات التزايدية). صور XObject تكون دائماً Streams مباشرة
   (لا تُخزَّن داخل ObjStm). نقبل فقط: DCTDecode وحده، بلا SMask/Mask/Decode، وJPEG بمكوّن واحد أو ثلاثة بدقة 8 بت
   (CMYK/Adobe المقلوب يُترك لـ pdf.js فيُعاد ترميزه كما كان). */

const latin1 = (bytes) => { let s = ''; const CH = 1 << 15; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return s; };

export function parseRef(ref) {
  const m = /^(\d+)R(\d*)$/.exec(String(ref || ''));
  return m ? { num: +m[1], gen: m[2] ? +m[2] : 0 } : null;
}

/* بيانات ترويسة JPEG: { comps, precision, w, h } أو null */
export function jpegInfo(b) {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { precision: b[i + 4], h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}

/* فك ASCII85 (يستعمله reportlab وغيره قبل DCT) */
export function ascii85(bytes) {
  const out = []; let tuple = 0, n = 0;
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c === 0x7e) break;                                   // ~> نهاية
    if (c <= 0x20) continue;
    if (c === 0x7a && n === 0) { out.push(0, 0, 0, 0); continue; }
    if (c < 0x21 || c > 0x75) return null;
    tuple = tuple * 85 + (c - 0x21); n++;
    if (n === 5) { out.push((tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255); tuple = 0; n = 0; }
  }
  if (n > 1) {
    for (let k = n; k < 5; k++) tuple = tuple * 85 + 84;
    const b4 = [(tuple >>> 24) & 255, (tuple >>> 16) & 255, (tuple >>> 8) & 255, tuple & 255];
    out.push(...b4.slice(0, n - 1));
  }
  return Uint8Array.from(out);
}

export class RawPdf {
  constructor(bytes) { this.b = bytes; this.s = latin1(bytes); }

  /* → Uint8Array لبايتات JPEG الأصلية، أو null إن لم تنطبق الشروط */
  jpeg(ref) {
    const r = typeof ref === 'string' ? parseRef(ref) : ref;
    if (!r) return null;
    const re = new RegExp(`(?:^|[\\r\\n\\s])${r.num}\\s+${r.gen}\\s+obj\\b`, 'g');
    let m, at = -1;
    while ((m = re.exec(this.s))) at = m.index + m[0].length;
    if (at < 0) return null;
    const sIdx = this.s.indexOf('stream', at);
    if (sIdx < 0) return null;
    const dict = this.s.slice(at, sIdx);
    if (!/\/Subtype\s*\/Image\b/.test(dict)) return null;
    const fm = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(dict);
    const names = fm ? fm[1].match(/\/\w+/g) : null;
    const a85 = !!names && names.length === 2 && names[0] === '/ASCII85Decode' && names[1] === '/DCTDecode';
    if (!names || (!a85 && (names.length !== 1 || names[0] !== '/DCTDecode'))) return null;   // DCT وحده أو ASCII85 ثم DCT
    if (/\/(SMask|Mask|Decode|ImageMask)\b/.test(dict)) return null;                 // شفافية أو قلب ألوان: يتولاها pdf.js
    let p = sIdx + 6;
    if (this.s[p] === '\r') p++;
    if (this.s[p] === '\n') p++;
    let end = -1;
    const lm = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    if (lm) {
      const e = p + +lm[1];
      if (/^\s*endstream/.test(this.s.slice(e, e + 12))) end = e;
    }
    if (end < 0) {
      const es = this.s.indexOf('endstream', p);
      if (es < 0) return null;
      end = es;
      if (this.s[end - 1] === '\n') end--;
      if (this.s[end - 1] === '\r') end--;
    }
    let data = this.b.subarray(p, end);
    if (a85) { data = ascii85(data); if (!data) return null; }
    const info = jpegInfo(data);
    if (!info || info.precision !== 8 || (info.comps !== 1 && info.comps !== 3)) return null;
    return data;
  }
}
