"""ملف PPTX لاختبار التدوير والقلب وقوالب srcRect (يعيد استخدام صور make_pptx)"""
import zipfile, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from make_pptx import png, jpg, img2, img4, slide, rels

NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr('ppt/media/image2.png', png(img2))       # 600x400: يسار أحمر | يمين أزرق
    z.writestr('ppt/media/image4.jpg', jpg(img4))       # 500x300
    # الشريحة: الصورة كاملة، ثم مُدارة 90°، ثم مقلوبة أفقياً
    z.writestr('ppt/slides/slide1.xml', slide(1, [('rId1', '', None), ('rId1', '', None, 5400000), ('rId1', '', None, 0, True)]))
    z.writestr('ppt/slides/_rels/slide1.xml.rels', rels([('rId1', 'image2.png')]))
    z.writestr('ppt/slideLayouts/slideLayout1.xml', f'<p:sldLayout {NS}><p:cSld><p:bg><p:bgPr><a:blipFill><a:blip r:embed="rId1"/><a:srcRect l="20000" r="20000"/></a:blipFill></p:bgPr></p:bg></p:cSld></p:sldLayout>')
    z.writestr('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([('rId1', 'image4.jpg')]))
print('ok', sys.argv[1])
