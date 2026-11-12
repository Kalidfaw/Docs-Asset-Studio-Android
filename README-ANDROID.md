# نسخة Android — الخطوات (مرة واحدة)

البناء يتم على سيرفرات GitHub مجانًا، فلا تحتاج Android Studio ولا Java.

## 1) أنشئ المستودع
1. في github.com اضغط **New repository**، سمّه مثلًا `docs-asset-studio`، واختر **Public** (ضروري كي يعمل رابط التنزيل لأي شخص)، ولا تضف README.
2. فك ضغط المشروع في مجلد جديد فارغ، وافتح الـTerminal داخله ونفّذ (بدّل `USER` باسم حسابك):

```
git init
git add .
git commit -m "Docs Asset Studio 0.14.0"
git branch -M main
git remote add origin https://github.com/USER/docs-asset-studio.git
git push -u origin main
```

## 2) أضف أسرار التوقيع (مرة واحدة)
في المستودع: **Settings → Secrets and variables → Actions → New repository secret**، وأنشئ أربعة أسرار بهذه الأسماء بالضبط:

| الاسم | القيمة |
|---|---|
| `ANDROID_KEYSTORE_B64` | كل محتوى ملف `release.jks.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | من ملف `secrets.txt` |
| `ANDROID_KEY_ALIAS` | `docsassetstudio` |
| `ANDROID_KEY_PASSWORD` | من ملف `secrets.txt` |

> ⚠️ ملف `release.jks` هو هويّة تطبيقك. **احتفظ بنسخة منه في مكانين** (مثلًا حاسوبك + فلاشة/سحابة خاصة). لو ضاع لن تستطيع تحديث التطبيق عند من ثبّتوه، وسيضطرون لحذفه وتثبيته من جديد. لا ترفعه إلى GitHub أبدًا (الـ`.gitignore` يمنع ذلك).

## 3) أنتج الـAPK
```
git tag v0.14.0
git push origin v0.14.0
```
افتح تبويب **Actions** وانتظر نحو 5–10 دقائق حتى يصبح الصف أخضر. ثم من تبويب **Releases** ستجد ملف `Docs-Asset-Studio-0.14.0.apk`. **رابط هذه الصفحة هو الرابط الذي توزّعه.**

لإصدار جديد لاحقًا: غيّر `version` في `package.json`، ثم `git commit` و`git push`، ثم وسمًا جديدًا (`v0.14.1` …).

## 4) التثبيت على الهاتف
1. افتح رابط الإصدار على الهاتف وحمّل ملف `.apk`.
2. عند أول تثبيت يطلب Android السماح بـ«التثبيت من مصادر غير معروفة» للمتصفح — اسمح له.
3. افتح التطبيق، اختر ملفًا، وعند «تحميل ZIP» ستظهر نافذة المشاركة لتحفظه في «الملفات» أو ترسله لتطبيق آخر.

## ملاحظات
- التطبيق يعمل دون إنترنت.
- يُنصح بملفات أقل من نحو 100 ميغا على الهاتف؛ حد التصدير 400 ميغا.
- المعرّف `com.khalidfaouzi.docsassetstudio` دائم بعد التوزيع.
- لو فشل البناء في Actions، افتح الصف الأحمر وأرسل لي آخر 30 سطرًا من الخطأ.
