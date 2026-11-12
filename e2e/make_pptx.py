import zipfile, random, io, sys
from PIL import Image, ImageDraw
random.seed(7)

def noisy(w, h, base, margin=0, noise=25):
    im = Image.new('RGB', (w, h), (255, 255, 255))
    px = im.load()
    for y in range(margin, h - margin):
        for x in range(margin, w - margin):
            r, g, b = base(x - margin, y - margin, w - 2*margin, h - 2*margin)
            n = random.randint(-noise, noise)
            px[x, y] = (max(0, min(254, r + n)), max(0, min(254, g + n)), max(0, min(254, b + n)))
    return im
def png(im):
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()
def jpg(im):
    b = io.BytesIO(); im.save(b, 'JPEG', quality=90); return b.getvalue()

grad = lambda x, y, w, h: (int(200 * x / w) + 20, int(150 * y / h) + 40, 120)
halves = lambda x, y, w, h: (200, 30, 30) if x < w / 2 else (30, 30, 200)
other = lambda x, y, w, h: (40, 160, 60) if (x // 40 + y // 40) % 2 else (230, 200, 40)

img1 = noisy(600, 400, grad, margin=50)                 # بهوامش بيضاء
img2 = noisy(600, 400, halves)                           # نصف أحمر | نصف أزرق
img3 = noisy(300, 200, grad, margin=25)                  # نفس img1 بدقة أقل (مكرر)
img4 = noisy(500, 300, other)                            # خلفية قالب
tiny = Image.new('RGB', (8, 8), (10, 10, 10))

def slide(n, pics, title=''):
    shapes = ''
    if title:
        shapes += f'<p:sp><p:nvSpPr><p:cNvPr id="1" name="Title"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>{title}</a:t></a:r></a:p></p:txBody></p:sp>'
    for i, (rid, descr, crop, *rest) in enumerate(pics):
        rot = rest[0] if rest else 0
        flip = rest[1] if len(rest) > 1 else False
        sr = f'<a:srcRect l="{crop[0]}" t="{crop[1]}" r="{crop[2]}" b="{crop[3]}"/>' if crop else ''
        d = f' descr="{descr}"' if descr else ''
        shapes += f'<p:pic><p:nvPicPr><p:cNvPr id="{i+2}" name="Picture {i}"{d}/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="{rid}"/>{sr}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm' + (f' rot="{rot}"' if rot else '') + (' flipH="1"' if flip else '') + '><a:off x="0" y="0"/></a:xfrm></p:spPr></p:pic>'
    return f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>{shapes}</p:spTree></p:cSld></p:sld>'
def rels(items):
    body = ''.join(f'<Relationship Id="{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/{t}"/>' for i, t in items)
    return f'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{body}</Relationships>'

out = sys.argv[1] if __name__ == "__main__" else None
if out:
  with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr('ppt/media/image1.png', png(img1))
    z.writestr('ppt/media/image2.png', png(img2))
    z.writestr('ppt/media/image3.png', png(img3))
    z.writestr('ppt/media/image4.jpg', jpg(img4))
    z.writestr('ppt/media/tiny.png', png(tiny))
    z.writestr('ppt/media/vector.emf', b'EMF' * 2000)
    # الشريحة 1: image2 كاملة + image2 بقص الأيمن (l=50%) + image1 مع alt
    z.writestr('ppt/slides/slide1.xml', slide(1, [('rId1', '', None), ('rId1', '', (50000, 0, 0, 0)), ('rId2', 'شعار &amp; الشركة', None)], 'ملخص النتائج'))
    z.writestr('ppt/slides/_rels/slide1.xml.rels', rels([('rId1', 'image2.png'), ('rId2', 'image1.png')]))
    # الشريحة 2: image2 بنفس القص + image3
    z.writestr('ppt/slides/slide2.xml', slide(2, [('rId1', '', (50000, 0, 0, 0)), ('rId2', 'Image 7', None)], 'Résultats trimestriels'))
    z.writestr('ppt/slides/_rels/slide2.xml.rels', rels([('rId1', 'image2.png'), ('rId2', 'image3.png')]))
    # قالب: image4 كخلفية فقط
    z.writestr('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([('rId1', 'image4.jpg')]))
  print('ok', out)
