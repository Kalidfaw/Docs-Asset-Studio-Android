/* ترجمة الواجهة (عربي ⇄ فرنسي). العربية هي المفتاح الأصلي (كما في gettext): النص العربي في القالب والكود يبقى كما هو،
   والقاموس FR يترجمه عند اختيار الفرنسية. النصوص الثابتة في الصفحة تُترجم بالمرور على العقد، والديناميكية عبر tr(). */

const pl = (n, one, many) => (n > 1 ? many : one);                      // الفرنسية: 0 و1 مفرد
export const FR = {
  /* ---- عام / الشريط العلوي / منطقة الإفلات ---- */
  'Docs Asset Studio — مستخرج صور المستندات': 'Docs Asset Studio — Extracteur d’images de documents',
  'مستخرج صور المستندات': 'Extracteur d’images de documents',
  'من إعداد الأستاذ خالد فوزي': 'Réalisé par le professeur Khalid Faouzi',
  'الإعدادات': 'Paramètres', 'داكن': 'Sombre', 'فاتح': 'Clair', 'العربية': 'العربية',
  'اختيار ملفات المستندات': 'Choisir des documents',
  'أفلت المستندات هنا لاستخراج صورها': 'Déposez vos documents ici pour en extraire les images',
  'ملفات PowerPoint و Word و Excel و PDF، ملف واحد أو عدة ملفات. اضغط للاختيار من جهازك.': 'Fichiers PowerPoint, Word, Excel et PDF, un ou plusieurs. Cliquez pour les choisir sur votre appareil.',
  'تبقى الملفات على جهازك، لا شيء يُرفع': 'Vos fichiers restent sur votre appareil, rien n’est envoyé',
  'إلغاء': 'Annuler',
  /* ---- شريط الأدوات ---- */
  'التحديد': 'Sélection', 'تحديد الكل': 'Tout sélectionner', 'عكس': 'Inverser',
  'المكرر': 'Doublons', 'يحدد النسخ الأقل جودة فقط': 'Sélectionne uniquement les copies de moindre qualité',
  'فحص المكرر': 'Détecter les doublons', 'ترتيب بالتشابه': 'Trier par similarité',
  'الأسماء': 'Noms', 'يطبّق الأسماء المقترحة على الصور المحددة، مع تراجع': 'Applique les noms suggérés aux images sélectionnées (annulable)',
  'اقتراح الأسماء': 'Suggérer des noms', 'تسمية بالموضع': 'Nommer par position',
  'الحفظ': 'Enregistrement', 'يحفظ المحددة في المكتبة المحلية': 'Enregistre la sélection dans la bibliothèque locale',
  'حفظ في المكتبة': 'Enregistrer dans la bibliothèque', 'حذف الصور المحددة، مع تراجع': 'Supprime les images sélectionnées (annulable)',
  'حذف': 'Supprimer', 'عرض': 'Affichage', 'كل الصور': 'Toutes les images', 'صور المحتوى': 'Images du contenu',
  'إخفاء صور الصفحة الكاملة': 'Masquer les images pleine page', 'صور الصفحة الكاملة فقط': 'Images pleine page uniquement',
  'خلفيات القوالب': 'Arrière-plans de modèles', 'محددة ·': 'sélectionnée(s) ·',
  'تصدير منظّم مع فهرس CSV، أو ملف يستورده برنامج السبورة': 'Export organisé avec index CSV, ou fichier importable par l’application Tableau interactif',
  'تصدير…': 'Exporter…', 'تحميل ZIP': 'Télécharger ZIP',
  /* ---- الدرج ---- */
  '⚙️ الإعدادات': '⚙️ Paramètres', 'إغلاق': 'Fermer', '🖼️ الاستخراج': '🖼️ Extraction',
  'تطبيق القص والتدوير الأصليين للمستند': 'Appliquer le recadrage et la rotation d’origine du document',
  'إن استُخدمت الصورة بقصّين أو بتدويرين مختلفين تظهر نسخة لكل منهما. يسري على الرفع التالي.': 'Si une image est utilisée avec deux recadrages ou rotations différents, une copie apparaît pour chacun. S’applique au prochain chargement.',
  'قص الهوامش البيضاء أو الشفافة': 'Rogner les marges blanches ou transparentes', 'حد البياض': 'Seuil de blanc',
  'أصغر حجم للصورة (KB)': 'Taille minimale de l’image (Ko)',
  'إضافة الملفات الجديدة بدل الاستبدال': 'Ajouter les nouveaux fichiers au lieu de remplacer',
  'مفيد لمقارنة المكرر بين مستندات تُفتح على دفعات.': 'Utile pour comparer les doublons entre des documents ouverts par lots.',
  '🔍 التشابه': '🔍 Similarité', 'حساسية كشف التشابه': 'Sensibilité de détection des similarités',
  'القيمة الأقل تعني مطابقة أدق.': 'Une valeur plus faible signifie une correspondance plus stricte.',
  '🏷️ الأسماء والمكتبة': '🏷️ Noms et bibliothèque', 'قالب الأسماء المقترحة': 'Modèle des noms suggérés',
  '{loc} موضع الصورة، {text} النص من التعليق أو العنوان.': '{loc} position de l’image, {text} texte de la légende ou du titre.',
  'بادئة اسم الملف': 'Préfixe du nom de fichier',
  'إضافة الصور المصدَّرة إلى المكتبة تلقائياً': 'Ajouter automatiquement les images exportées à la bibliothèque',
  'تُحفظ بأسمائها النهائية فتُقترح لاحقاً.': 'Enregistrées sous leur nom final, elles seront suggérées plus tard.',
  'حفظ نسخة كاملة من كل صورة': 'Conserver une copie complète de chaque image',
  'الافتراضي: الفهرس والمصغّرة فقط.': 'Par défaut : index et miniature seulement.',
  '📦 التصدير': '📦 Export', 'الصيغة': 'Format', 'كما هي (دون إعادة ترميز)': 'Telles quelles (sans réencodage)',
  'JPG (خلفية بيضاء للشفاف)': 'JPG (fond blanc pour la transparence)', 'جودة JPG و WebP (0.5 إلى 1)': 'Qualité JPG et WebP (0,5 à 1)',
  'مجلد لكل مستند داخل ZIP': 'Un dossier par document dans le ZIP',
  'يسري عند اختيار صور من أكثر من مستند.': 'S’applique lorsque les images viennent de plusieurs documents.',
  '✏️ المحرر': '✏️ Éditeur', 'حفظ تلقائي عند إغلاق المحرر': 'Enregistrement automatique à la fermeture de l’éditeur',
  'عند الحفظ': 'À l’enregistrement', 'إنشاء نسخة جديدة': 'Créer une nouvelle copie', 'استبدال الصورة الأصلية': 'Remplacer l’image d’origine',
  'العودة لأعلى الصفحة': 'Haut de page',
  /* ---- المكتبة ---- */
  'المكتبة': 'Bibliothèque', '📚 المكتبة المحلية': '📚 Bibliothèque locale',
  'ابحث بالاسم أو المستند أو العنوان أو التعليق…': 'Rechercher par nom, document, titre ou légende…', 'بحث': 'Recherche',
  'تصدير الفهرس JSON': 'Exporter l’index JSON', 'تصدير الفهرس': 'Exporter l’index', 'مسح المكتبة': 'Vider la bibliothèque',
  'المكتبة ({n})': 'Bibliothèque ({n})', 'المكتبة (0)': 'Bibliothèque (0)', 'Français / العربية': 'Français / العربية',
  '📚 المكتبة: {created} صورة جديدة، {merged} موجودة (دُمجت)، {apps} ظهور مضاف.': '📚 Bibliothèque : {created} nouvelle(s) image(s), {merged} déjà présente(s) (fusionnée(s)), {apps} apparition(s) ajoutée(s).',
  ' (التخزين الدائم غير متاح: الحفظ للجلسة فقط)': ' (stockage permanent indisponible : enregistrement pour la session seulement)',
  '{images} صورة · {docs} مستند · {apps} ظهور · {full} بنسخة كاملة': '{images} image(s) · {docs} document(s) · {apps} apparition(s) · {full} avec copie complète',
  ' — المعروض {n}': ' — affichées : {n}', ' — (ذاكرة الجلسة فقط)': ' — (mémoire de session seulement)',
  'لا نتائج.': 'Aucun résultat.',
  'المكتبة فارغة. حدّد صوراً في المعرض واضغط «حفظ في المكتبة».': 'La bibliothèque est vide. Sélectionnez des images dans la galerie et cliquez sur « Enregistrer dans la bibliothèque ».',
  'اسم الصورة في المكتبة': 'Nom de l’image dans la bibliothèque',
  '{w}×{h} · {n} ظهور في {d} مستند': '{w}×{h} · {n} apparition(s) dans {d} document(s)', ' · نسخة كاملة': ' · copie complète', ' ، ': ', ',
  'تنزيل': 'Télécharger', 'فتح المستند': 'Ouvrir le document',
  'تعذّر فتح المستند (نُقل أو حُذف؟).': 'Impossible d’ouvrir le document (déplacé ou supprimé ?).',
  'حذف من المكتبة': 'Supprimer de la bibliothèque',
  'عُرض أول 200 من {n} — ضيّق البحث.': 'Les 200 premiers sur {n} sont affichés — affinez la recherche.',
  'حذف كل المكتبة (الفهرس والمصغّرات والنسخ الكاملة)؟ لا يمكن التراجع.': 'Supprimer toute la bibliothèque (index, miniatures et copies complètes) ? Action irréversible.',
  /* ---- نافذة التصدير ---- */
  'تصدير': 'Exporter', '📦 تصدير الصور المحددة': '📦 Exporter les images sélectionnées',
  '🗂️ منظّم + فهرس CSV': '🗂️ Organisé + index CSV',
  'مجلد لكل مستند، وملف index.csv يسرد كل صورة: مستندها، مواضعها (صفحات/شرائح)، تعليقها، أبعادها وحجمها. يفتح في Excel بالعربية.': 'Un dossier par document et un fichier index.csv listant chaque image : document, positions (pages/diapositives), légende, dimensions et taille. S’ouvre correctement dans Excel.',
  '🧑‍🏫 للسبورة (موسوعة)': '🧑‍🏫 Pour le Tableau (encyclopédie)',
  'ملف ZIP يستورده برنامج السبورة من «📥 استيراد الموسوعة»، فتظهر الصور في موسوعتك بأسمائها ومادتها. لا اتصال بين البرنامجين، مجرد ملف.': 'Fichier ZIP que l’application Tableau interactif importe via « 📥 استيراد الموسوعة » : les images apparaissent dans votre encyclopédie avec leur nom et leur matière. Aucun lien entre les deux applications, ce n’est qu’un fichier.',
  'المادة (اختياري):': 'Matière (facultatif) :', 'مثال: الرياضيات': 'Exemple : Mathématiques', 'تصدير للسبورة': 'Exporter vers le Tableau',
  /* ---- المعاينة والمحرر ---- */
  'السابقة': 'Précédente', 'التالية': 'Suivante', '✕ إغلاق (Esc)': '✕ Fermer (Échap)',
  '🎨 محرر الصورة —': '🎨 Éditeur d’image —', '✕ إغلاق': '✕ Fermer', '✂️ قص': '✂️ Recadrer', '🧹 ممحاة بيضاء': '🧹 Gomme blanche',
  'الحجم': 'Taille', '↔️ أفقي': '↔️ Horizontal', '↕️ عمودي': '↕️ Vertical', '🧩 تقسيم:': '🧩 Diviser :',
  'الصفوف': 'Lignes', 'الأعمدة': 'Colonnes', 'تطبيق': 'Appliquer', '↩️ تراجع': '↩️ Annuler', '🔁 إعادة': '🔁 Rétablir', '💾 حفظ التعديل': '💾 Enregistrer la modification',
  /* ---- رسائل التطبيق (ديناميكية) ---- */
  'الأفضل ★': 'Meilleure ★', 'مكررة {p}%': 'Doublon {p}%',
  'الأفضل جودة بين {n} نسخ متشابهة': 'Meilleure qualité parmi {n} copies similaires', 'مكررة لـ «{name}»': 'Doublon de « {name} »',
  'تم تحديد {dups} نسخة مكررة (الأقل جودة فقط)': (v) => `${v.dups} ${pl(v.dups, 'copie en double sélectionnée', 'copies en double sélectionnées')} (qualité la plus faible uniquement)`,
  ' — منها {cross} مكررة بين مستندات مختلفة': (v) => ` — dont ${v.cross} entre documents différents`,
  '. راجعها ثم اضغط «حذف المحددة».': '. Vérifiez-les puis cliquez sur « Supprimer ».',
  'لم يتم العثور على صور متشابهة.': 'Aucune image similaire trouvée.',
  'تم تجميع الصور المتشابهة بجانب بعضها.': 'Les images similaires ont été regroupées.',
  'مُدار': 'Pivotée', 'مقلوب': 'Retournée',
  'جاري قراءة {name}...': 'Lecture de {name}...', 'قراءة الصفحة {d} / {n} من {name}...': 'Lecture de la page {d} / {n} de {name}...',
  'معالجة {done} / {n} ...': 'Traitement {done} / {n} ...',
  'هناك معالجة جارية، انتظر أو اضغط إلغاء.': 'Un traitement est en cours : patientez ou cliquez sur Annuler.',
  'الصيغة غير مدعومة. المدعوم: {fmts} (الملفات القديمة .ppt/.doc/.xls غير مدعومة).': 'Format non pris en charge. Formats acceptés : {fmts} (les anciens fichiers .ppt/.doc/.xls ne sont pas pris en charge).',
  'تم تجاهل {n} ملف بصيغة غير مدعومة.': (v) => `${v.n} ${pl(v.n, 'fichier ignoré', 'fichiers ignorés')} (format non pris en charge).`,
  'طُبّق القص الأصلي للمستند على {n}': 'Recadrage d’origine appliqué à {n}', 'طُبّق التدوير/القلب الأصلي على {n}': 'Rotation/retournement d’origine appliqué à {n}',
  '{n} صغيرة جداً': (v) => `${v.n} ${pl(v.n, 'trop petite', 'trop petites')}`,
  '{n} بصيغ غير مدعومة (EMF/WMF/TIFF...)': '{n} dans des formats non pris en charge (EMF/WMF/TIFF...)',
  '{n} تعذّر فك ترميزها': (v) => `${v.n} ${pl(v.n, 'impossible à décoder', 'impossibles à décoder')}`,
  '{n} ملف تعذّرت قراءته': (v) => `${v.n} ${pl(v.n, 'fichier illisible', 'fichiers illisibles')}`,
  '، ': ', ', ' — {tail}': ' — {tail}',
  'ملف {label}': 'du fichier {label}', '{n} ملفات': 'de {n} fichiers',
  '❌ تعذّرت قراءة الملف (قد يكون تالفاً أو ليس ملف {label} صالحاً).': '❌ Lecture impossible (le fichier est peut-être endommagé ou n’est pas un fichier {label} valide).',
  '⏹️ تم الإلغاء بعد {n} صورة{tail}': (v) => `⏹️ Annulé après ${v.n} ${pl(v.n, 'image', 'images')}${v.tail}`,
  '✅ تم استخراج {n} صورة من {from}{tail}': (v) => `✅ ${v.n} ${pl(v.n, 'image extraite', 'images extraites')} de ${v.from}${v.tail}`,
  '⚠️ لم يتم العثور على صور صالحة{tail}': '⚠️ Aucune image valide trouvée{tail}',
  'تحديد الصورة': 'Sélectionner l’image', 'معاينة': 'Aperçu', 'تعديل الصورة': 'Modifier l’image', 'حذف الصورة': 'Supprimer l’image',
  'في المكتبة': 'En bibliothèque', 'بلا اسم': 'Sans nom', '{name} — {n} ظهور سابق': '{name} — {n} apparition(s) précédente(s)',
  'معدلة': 'Modifiée', 'قص العرض': 'Recadrée', 'صفحة كاملة': 'Pleine page', 'اسم الملف': 'Nom du fichier',
  'اسم محفوظ في المكتبة لصورة مطابقة': 'Nom enregistré dans la bibliothèque pour une image identique', 'من تعليق الصورة': 'Depuis la légende de l’image',
  'من النص البديل': 'Depuis le texte alternatif', 'من عنوان الشريحة/القسم': 'Depuis le titre de la diapositive/section', ' — اضغط للتطبيق': ' — cliquez pour appliquer',
  'لا توجد أسماء مقترحة جديدة (تحتاج الصورة تعليقاً أو نصاً بديلاً أو عنوان شريحة، أو صورة سبق حفظها في المكتبة).': 'Aucun nouveau nom suggéré (l’image doit avoir une légende, un texte alternatif, un titre de diapositive, ou avoir déjà été enregistrée dans la bibliothèque).',
  'طُبّق {n} اسم مقترح.': '{n} nom(s) suggéré(s) appliqué(s).', 'تراجع': 'Annuler',
  'حدد صوراً لحفظها في المكتبة.': 'Sélectionnez des images à enregistrer dans la bibliothèque.',
  'تمت إعادة تسمية {n} صورة حسب موضعها في المستند.': '{n} image(s) renommée(s) selon leur position dans le document.',
  'لا توجد صور مرتبطة بمواضع.': 'Aucune image liée à une position.',
  'تم حذف {n} صورة': (v) => `${v.n} ${pl(v.n, 'image supprimée', 'images supprimées')}`,
  'حدد صوراً للحذف أولاً.': 'Sélectionnez d’abord des images à supprimer.',
  '📦 تجهيز {i} / {n} ...': '📦 Préparation {i} / {n} ...', '📦 جاري بناء ملف ZIP...': '📦 Création du fichier ZIP...',
  '✅ تم تجهيز {n} صورة للتحميل.': '✅ {n} image(s) prête(s) à télécharger.', '❌ فشل التصدير.': '❌ Échec de l’export.',
  'حدث خطأ أثناء التصدير.': 'Une erreur est survenue pendant l’export.', 'حدد صوراً للتصدير أولاً.': 'Sélectionnez d’abord des images à exporter.',
  'مستند': 'document', 'خلفية قالب': 'Arrière-plan de modèle', 'محتوى': 'Contenu', 'نعم': 'Oui',
  'الملف': 'Fichier', 'المستند': 'Document', 'المواضع': 'Positions', 'الاسم': 'Nom', 'العنوان': 'Titre', 'التعليق': 'Légende',
  'النص البديل': 'Texte alternatif', 'العرض': 'Largeur', 'الارتفاع': 'Hauteur', 'الحجم KB': 'Taille Ko', 'الفئة': 'Catégorie', 'قص': 'Recadrage', 'تدوير/قلب': 'Rotation/retournement',
  '✅ جاهز لاستيراده في السبورة: {n} صورة.': '✅ Prêt à importer dans le Tableau : {n} image(s).',
  '✅ تم تجهيز {n} صورة مع فهرس CSV.': '✅ {n} image(s) préparée(s) avec index CSV.',
  'حفظ أو مشاركة الملف': 'Enregistrer ou partager le fichier',
  'الملف كبير جدًا للهاتف، صدّر عددًا أقل من الصور.': 'Fichier trop volumineux pour le téléphone, exportez moins d’images.',
  'تعذّر حفظ الملف.': 'Impossible d’enregistrer le fichier.',
  'تعذّر فتح الصورة في المحرر.': 'Impossible d’ouvrir l’image dans l’éditeur.',
  'تم حفظ التعديل تلقائياً.': 'Modification enregistrée automatiquement.', 'تعذّر الحفظ التلقائي.': 'Échec de l’enregistrement automatique.',
  'لديك تعديلات غير محفوظة. هل تريد تجاهلها؟': 'Vous avez des modifications non enregistrées. Les ignorer ?',
  'تم حفظ التعديل.': 'Modification enregistrée.', 'تعذّر حفظ التعديل.': 'Impossible d’enregistrer la modification.',
  'اختر صفوفاً أو أعمدة أكثر من 1.': 'Choisissez plus d’une ligne ou colonne.',
  'تم إنشاء {n} قطعة وإضافتها للمعرض.': '{n} morceau(x) créé(s) et ajouté(s) à la galerie.', 'تعذّر تقسيم الصورة.': 'Impossible de diviser l’image.'
};

let lang = 'ar';
const subs = new Set();
export const getLang = () => lang;
export const onLang = (fn) => { subs.add(fn); };

/* ترجمة نص ديناميكي: tr('تم حذف {n} صورة', { n: 3 }) */
export function tr(key, vars) {
  let v = lang === 'fr' ? FR[key] : undefined;
  if (v === undefined) v = key;
  if (typeof v === 'function') return v(vars || {});
  return vars ? v.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : v;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const ATTRS = ['title', 'aria-label', 'placeholder'];

function textNode(n) {
  if (n.__o !== undefined && n.nodeValue !== n.__o && n.nodeValue !== n.__t) n.__o = undefined;      // غيّره كود التطبيق: نعتمد قيمته
  if (n.__o === undefined) n.__o = n.nodeValue;
  let out = n.__o;
  if (lang === 'fr') {
    const k = norm(out), v = FR[k];
    if (typeof v === 'string') out = out.match(/^\s*/)[0] + v + out.match(/\s*$/)[0];
  }
  n.__t = out;
  if (n.nodeValue !== out) n.nodeValue = out;
}
function attrs(e) {
  for (const a of ATTRS) {
    if (!e.hasAttribute(a)) continue;
    e.__oa = e.__oa || {};
    const cur = e.getAttribute(a);
    if (e.__oa[a] === undefined || (cur !== e.__oa[a] && cur !== e.__ta?.[a])) e.__oa[a] = cur;
    let out = e.__oa[a];
    if (lang === 'fr') { const v = FR[norm(out)]; if (typeof v === 'string') out = v; }
    e.__ta = e.__ta || {}; e.__ta[a] = out;
    if (cur !== out) e.setAttribute(a, out);
  }
}
export function applyDom(root = document.body) {
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    if (n.nodeType === 3) { if (n.parentNode && !/^(SCRIPT|STYLE)$/.test(n.parentNode.nodeName)) textNode(n); }
    else attrs(n);
  }
}

export function setLang(l) {
  lang = l === 'fr' ? 'fr' : 'ar';
  const h = document.documentElement;
  h.lang = lang; h.dir = lang === 'fr' ? 'ltr' : 'rtl';
  document.title = tr('Docs Asset Studio — مستخرج صور المستندات');
  applyDom(document.body);
  subs.forEach((fn) => { try { fn(lang); } catch (e) { console.error(e); } });
}
