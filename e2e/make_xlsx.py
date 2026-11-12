"""ملف XLSX للاختبار: ورقتان، صور مرساة بخلايا، نصوص مجاورة، قص وتدوير (يعيد استخدام صور make_pptx)"""
import zipfile, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from make_pptx import png, jpg, img1, img2, img4, rels

X = 'xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

def anchor(c, r, rid, descr='', crop='', xfrm=''):
    d = f' descr="{descr}"' if descr else ''
    return (f'<xdr:twoCellAnchor><xdr:from><xdr:col>{c}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{r}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>'
            f'<xdr:to><xdr:col>{c+3}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{r+8}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>'
            f'<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Picture"{d}/><xdr:cNvPicPr/></xdr:nvPicPr>'
            f'<xdr:blipFill><a:blip r:embed="{rid}"/>{crop}<a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'
            f'<xdr:spPr><a:xfrm{xfrm}><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>')

with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr('xl/media/image1.png', png(img1))
    z.writestr('xl/media/image2.png', png(img2))
    z.writestr('xl/media/image3.jpg', jpg(img4))
    z.writestr('xl/workbook.xml', f'<?xml version="1.0"?><workbook {X}><sheets><sheet name="الموازنة" sheetId="1" r:id="rId1"/><sheet name="Bilan 2024" sheetId="2" r:id="rId2"/></sheets></workbook>')
    z.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/></Relationships>')
    z.writestr('xl/sharedStrings.xml', '<sst><si><t>شعار الجهة</t></si><si><t>Organigramme</t></si></sst>')
    z.writestr('xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="2"><c r="B2" t="s"><v>0</v></c></row></sheetData></worksheet>')
    z.writestr('xl/worksheets/sheet2.xml', '<worksheet><sheetData><row r="5"><c r="A5" t="s"><v>1</v></c></row></sheetData></worksheet>')
    for n, d in ((1, 'drawing1'), (2, 'drawing2')):
        z.writestr(f'xl/worksheets/_rels/sheet{n}.xml.rels', f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="drawing" Target="../drawings/{d}.xml"/></Relationships>')
    # الورقة 1: الصورة كاملة في B3، ونفسها مقصوصة ومُدارة في F3
    z.writestr('xl/drawings/drawing1.xml', f'<xdr:wsDr {X}>' + anchor(1, 2, 'rId1', 'شعار') + anchor(5, 2, 'rId1', '', '<a:srcRect l="50000"/>', ' rot="5400000"') + '</xdr:wsDr>')
    z.writestr('xl/drawings/_rels/drawing1.xml.rels', rels([('rId1', 'image2.png')]))
    # الورقة 2: صورتان، إحداهما بجوار نص في A5 (يسارها B5)، والأخرى نسخة من صورة الورقة الأولى (مكرر)
    z.writestr('xl/drawings/drawing2.xml', f'<xdr:wsDr {X}>' + anchor(1, 4, 'rId1') + anchor(8, 20, 'rId2') + '</xdr:wsDr>')
    z.writestr('xl/drawings/_rels/drawing2.xml.rels', rels([('rId1', 'image1.png'), ('rId2', 'image3.jpg')]))
print('ok', sys.argv[1])
