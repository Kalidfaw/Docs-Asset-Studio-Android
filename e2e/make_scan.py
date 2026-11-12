"""PDF ممسوح للاختبار: (1) صورة DeviceGray 1bpc، (2) قناع ImageMask (نص أسود)، (3) CCITT G4 عبر PIL — كل صفحة بحجم الصفحة"""
import sys, zlib
from PIL import Image, ImageDraw

W, H = 400, 566

def pattern():
    im = Image.new('1', (W, H), 1)                # 1 = أبيض
    d = ImageDraw.Draw(im)
    d.rectangle((40, 40, 360, 120), fill=0)       # كتلة سوداء (عنوان)
    for k in range(8):
        d.line((40, 160 + k * 40, 360 - k * 15, 160 + k * 40), fill=0, width=6)
    return im

def pack(im, invert=False):
    rows = []
    for y in range(H):
        bits = [im.getpixel((x, y)) for x in range(W)]
        if invert: bits = [1 - b for b in bits]
        row = bytearray((W + 7) // 8)
        for x, b in enumerate(bits):
            if b: row[x >> 3] |= 0x80 >> (x & 7)
        rows.append(bytes(row))
    return b''.join(rows)

def build(path):
    im = pattern()
    gray = zlib.compress(pack(im))
    mask = zlib.compress(pack(im, invert=True))   # في ImageMask: 0 = يُطلى بلون التعبئة، فنقلب (الأسود=0 يُطلى)؟ نترك Decode الافتراضي
    mask = zlib.compress(pack(im))                # 0 = أسود = يُطلى
    objs = {}
    objs[1] = b'<< /Type /Catalog /Pages 2 0 R >>'
    objs[2] = b'<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>'
    for pg, im_n, cont in ((3, 5, 7), (4, 6, 8)):
        objs[pg] = (f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {W} {H}] /Resources << /XObject << /Im0 {im_n} 0 R >> >> /Contents {cont} 0 R >>').encode()
    def stream(d, data): return (d + f' /Length {len(data)} >>\nstream\n').encode() + data + b'\nendstream'
    objs[5] = stream(f'<< /Type /XObject /Subtype /Image /Width {W} /Height {H} /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /FlateDecode', gray)
    objs[6] = stream(f'<< /Type /XObject /Subtype /Image /Width {W} /Height {H} /ImageMask true /BitsPerComponent 1 /Filter /FlateDecode', mask)
    c = f'q {W} 0 0 {H} 0 0 cm /Im0 Do Q'.encode()
    objs[7] = stream('<<', c); objs[8] = stream('<<', c)
    out = bytearray(b'%PDF-1.4\n'); off = {}
    for n in sorted(objs):
        off[n] = len(out); out += f'{n} 0 obj\n'.encode() + objs[n] + b'\nendobj\n'
    x = len(out)
    out += f'xref\n0 {len(objs)+1}\n0000000000 65535 f \n'.encode()
    for n in sorted(objs): out += f'{off[n]:010d} 00000 n \n'.encode()
    out += f'trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n'.encode()
    open(path, 'wb').write(out)
    pattern().save(path.replace('.pdf', '_ccitt.pdf'), 'PDF', resolution=72)

build(sys.argv[1])
