import zipfile, random, io, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from make_pptx import noisy, png, jpg, grad, halves, other, tiny
random.seed(11)

img1 = noisy(600, 400, grad, margin=50)      # هوامش بيضاء → 500×300
img2 = noisy(600, 400, halves)               # أحمر | أزرق
img3 = noisy(300, 200, grad, margin=25)      # مكرر لـ img1 (ترويسة)
img4 = noisy(500, 300, other)                # VML مع cropright=0.5 → 250×300

W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"'
def drawing(rid, n, descr='', crop=None):
    d = f' descr="{descr}"' if descr else ''
    sr = f'<a:srcRect l="{crop}"/>' if crop else ''
    return f'<w:p><w:r><w:drawing><wp:inline><wp:docPr id="{n}" name="Picture {n}"{d}/><a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="p{n}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="{rid}"/>{sr}<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr/></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
def rels(items):
    return '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + ''.join(f'<Relationship Id="{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{t}"/>' for i, t in items) + '</Relationships>'

def para(text, style=None):
    st = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ''
    return f'<w:p>{st}<w:r><w:t>{text}</w:t></w:r></w:p>'
STYLES = f'<?xml version="1.0"?><w:styles {W}><w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Lgende"><w:name w:val="caption"/></w:style></w:styles>'
body = (para('المقدمة', 'Titre1') + drawing('rId1', 1, 'مخطط &amp; نتائج') + drawing('rId2', 2) + para('شكل 2: الهيكل التنظيمي', 'Lgende') + drawing('rId2', 3, '', 50000) +
        '<w:p><w:r><w:pict><v:shape><v:imagedata r:id="rId4" o:title="قديمة" cropright="0.5"/></v:shape></w:pict></w:r></w:p>')
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr('word/media/image1.png', png(img1))
    z.writestr('word/media/image2.png', png(img2))
    z.writestr('word/media/image3.png', png(img3))
    z.writestr('word/media/image4.jpg', jpg(img4))
    z.writestr('word/media/tiny.png', png(tiny))
    z.writestr('word/media/chart.emf', b'EMF' * 2000)
    z.writestr('word/document.xml', f'<?xml version="1.0"?><w:document {W}><w:body>{body}</w:body></w:document>')
    z.writestr('word/styles.xml', STYLES)
    z.writestr('word/_rels/document.xml.rels', rels([('rId1', 'image1.png'), ('rId2', 'image2.png'), ('rId4', 'image4.jpg')]))
    z.writestr('word/header1.xml', f'<?xml version="1.0"?><w:hdr {W}>{drawing("rId1", 9)}</w:hdr>')
    z.writestr('word/_rels/header1.xml.rels', rels([('rId1', 'image3.png')]))
print('ok', sys.argv[1])
