# StageChat — Ready Repo (Ahmed)
هذا المستودع جاهز للنشر فورًا على خدمات مجانية.

## الخطوة 1: ارفع إلى GitHub
- أنشئ Repo جديد (خاص).
- على جهازك:
```bash
unzip StageChat_ReadyRepo_Ahmed_v1.zip && cd StageChat_ReadyRepo_Ahmed_v1
./scripts/setup_github.sh https://github.com/USERNAME/REPO.git
```
> على Windows استخدم Git Bash لتشغيل السكربت.

## الخطوة 2: أنشئ الخدمة على Render (Blueprint)
1) ادخل render.com → New → **Blueprint** → اختر ريبو GitHub اللي دفعت له.
2) Render بيقرأ `render.yaml` تلقائيًا ويبني **خادم الإشارات**.
3) بعد النشر، خذ رابط الخدمة (مثل: `https://stagechat-signaling.onrender.com`).

## الخطوة 3: انشر الويب على Vercel
1) ادخل vercel.com → Add New → Project → اختر مجلد `web/` من نفس الريبو.
2) Vercel يقرأ `web/vercel.json`. قبل النشر عدّل قيمة:
   - **NEXT_PUBLIC_SIGNALING_URL** إلى رابط Render اللي أخذته.
   - تقدر تغيّرها من Settings → Environment Variables أو تعدّل `vercel.json` وتدفع كومِت.
3) اضغط Deploy.

## روابط الاستخدام
- واجهة المستخدم: `https://YOUR-VERCEL-DOMAIN/`
- لوحة الأدمن: `https://YOUR-VERCEL-DOMAIN/admin/dashboard`
- دخول المستخدم: `https://YOUR-VERCEL-DOMAIN/join`

## بيانات الأدمن الافتراضية
- اسم الأدمن المبدئي: Ahmed
- كلمة سر الأدمن: As66773707
> للأمان، غيّر كلمة السر من Render (Environment).

## محليًا (اختياري)
- السيرفر:
```bash
cd server && npm i && export ADMIN_PASSWORD=As66773707 && npm run dev
```
- الويب:
```bash
cd web && npm i && export NEXT_PUBLIC_SIGNALING_URL="http://localhost:4000" && npm run dev
```

## ملاحظة السعة
الاتصال Mesh يناسب ~5–8 مشاركين. للغرف الكبيرة استخدم SFU لاحقًا.