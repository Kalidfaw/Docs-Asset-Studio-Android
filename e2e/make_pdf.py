"""PDF للاختبار (reportlab): قناع شفافية، صورة مكررة في صفحتين، صورة بحجم الصفحة، تدوير 90°، قلب أفقي، نص تعليق أسفل الصورة"""
import sys, io
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

def rgb(w, h, left, right):
    im = Image.new('RGB', (w, h)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w // 2, h], fill=left); d.rectangle([w // 2, 0, w, h], fill=right)
    d.ellipse([w // 4, h // 4, 3 * w // 4, 3 * h // 4], outline=(255, 255, 255), width=4)
    return im
def rgba_disc(w, h):                       # دائرة حمراء على شفافية (قناع ألفا)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); ImageDraw.Draw(im).ellipse([4, 4, w - 5, h - 5], fill=(220, 30, 30, 255))
    return im
def jpeg(im):
    b = io.BytesIO(); im.save(b, 'JPEG', quality=92); b.seek(0); return ImageReader(b)

A = rgb(600, 300, (200, 30, 30), (30, 30, 200))      # يسار أحمر | يمين أزرق
B = rgb(300, 300, (30, 160, 60), (240, 200, 20))
C = rgb(800, 1100, (20, 120, 200), (250, 250, 250))  # بحجم الصفحة

c = canvas.Canvas(sys.argv[1], pagesize=(595, 842))
c.setFont('Helvetica-Bold', 22); c.drawString(50, 790, 'Rapport trimestriel')
c.drawImage(jpeg(A), 50, 560, 300, 150)                       # صفحة 1: صورة JPEG عادية
c.setFont('Helvetica', 11); c.drawString(50, 540, 'Figure 1 : Organigramme du service')
c.drawImage(ImageReader(rgba_disc(200, 200)), 380, 560, 120, 120, mask='auto')   # بقناع شفافية
c.showPage()
c.setFont('Helvetica-Bold', 22); c.drawString(50, 790, 'Deuxieme page')
c.drawImage(jpeg(A), 50, 600, 300, 150)                       # صفحة 2: الصورة نفسها (يجب ألا تتكرر)
c.saveState(); c.translate(400, 300); c.rotate(-90); c.drawImage(jpeg(B), 0, 0, 150, 150); c.restoreState()   # مُدارة 90° (مع عقارب الساعة)
c.saveState(); c.translate(250, 200); c.scale(-1, 1); c.drawImage(jpeg(A), 0, 0, 200, 100); c.restoreState()   # مقلوبة أفقياً
c.showPage()
c.drawImage(jpeg(C), 0, 0, 595, 842)                          # صفحة 3: بحجم الصفحة كاملة
c.showPage()
c.save()
print('ok', sys.argv[1])
