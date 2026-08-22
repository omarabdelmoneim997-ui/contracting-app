# Project Status

## 1. Project Overview
"Omar ERP" — نظام إدارة مالية وحسابات لشركة مقاولات (Arabic RTL). يدير مشروعات، بنود أعمال، تكاليف (مشتريات/مصنعيات/مصروفات/عهد/مصروفات عمومية)، مستخلصات وتحصيلات، ومقارنة الميزانية بالفعلي.

## 2. Technology Stack
- React 18 + Vite (SPA, single build output)
- Tailwind (utility classes, loaded via CDN in index.html)
- recharts (بار شارت للميزانية مقابل الفعلي)
- lucide-react (أيقونات)
- Supabase (Postgres + supabase-js) — قاعدة بيانات وتوثيق
- Hosting: Vercel (auto-deploy عند كل commit على main)
- Source control: GitHub (رفع الملفات يدويًا عبر واجهة الويب — مفيش git CLI من طرف المستخدم)

## 3. Project Structure
```
contracting-app/
├── index.html          # نقطة الدخول، تحميل Tailwind CDN
├── vite.config.js
├── package.json
├── src/
│   ├── main.jsx         # React root
│   ├── App.jsx          # الملف الرئيسي (كل الشاشات والمكونات في ملف واحد)
│   └── supabaseClient.js # تهيئة عميل Supabase (URL + publishable key)
```
داخل `App.jsx`: `App` (auth gate) ← `LoginScreen` أو `ContractingApp` (الشاشة الرئيسية) وبداخلها تابات: `Dashboard`, `WorkItemsTab`, `CostsTab`, `ExtractsTab`, `BudgetTab`, بالإضافة لمكونات فورم مشتركة (`Field`, `SelectField`) و`NewProjectModal`.

## 4. Database (Supabase — eu-west-1, ref: pywkkzedqqgmaghdqxba)
جداول: `projects` ← `work_items` ← `costs` (work_item_id nullable), `projects` ← `extracts` ← `collections`.
جدول إضافي: `app_users` (id, username, password) — RLS مفعّل بدون أي policies (مقفول تمامًا من القراءة المباشرة)، الوصول ليه فقط عبر دالة `verify_login(username, password)` بصلاحية SECURITY DEFINER مسموحة للـ anon.
باقي الجداول (`projects`, `work_items`, `costs`, `extracts`, `collections`): RLS مفعّل مع policy عامة `using (true) with check (true)` — أي حد معاه الـ anon key يقدر يقرأ/يكتب.

## 5. Completed Features
- تبديل بين المشروعات + إضافة مشروع جديد + **حذف مشروع كامل** (زرار في أسفل السايدبار، مع تأكيد، وحذف cascade لكل البيانات المرتبطة)
- بنود الأعمال: عرض + إضافة + **تعديل (inline) + حذف** (متصل بقاعدة البيانات بالكامل)
- التكاليف: 5 أنواع (مشتريات، مصنعيات، مصروفات، عهد، مصروفات عمومية ببنود فرعية جاهزة) + فلترة + إضافة + **تعديل + حذف**
- المستخلصات والتحصيلات: عرض/إضافة + **تعديل مستخلص + حذف مستخلص + حذف تحصيل فردي**، صف قابل للتوسيع لعرض التحصيلات لكل مستخلص
- تاب المقايسة (Budget vs Actual) بشريط نسبة صرف
- الداشبورد: كروت إحصائية + بار شارت ميزانية/فعلي لكل بند
- شاشة دخول (Login) بيوزر وباسورد مخزّنين في Supabase، تحقق عبر RPC، بدون حفظ جلسة (لازم تسجيل دخول من جديد كل مرة يتقفل المتصفح)، مع ساعة حية في الفوتر
- كل أزرار التعديل/الحذف بتظهر عند مرور الماوس (hover) فوق الصف، وكل حذف بيطلب تأكيد (`window.confirm`) قبل التنفيذ

## 6. Current Features (تعمل فعليًا في الإنتاج/Vercel)
كل ما ذُكر في القسم 5 بالكامل — منشور ومؤكد شغال. مفيش وظائف أساسية pending حاليًا.

## 7. Known Issues
- الباندل حجمه كبير نسبيًا (~790kB) — تحذير build فقط، مش خطأ وظيفي
- الباسورد في `app_users` متخزن نص عادي (plain text) مش مشفّر — مقبول لأداة داخلية بيوزر واحد بس مش أفضل ممارسة أمنية
- مفيش أدوار/صلاحيات لمستخدمين متعددين — يوزر واحد بس حاليًا
- علاقة `work_items → costs` في قاعدة البيانات هي `ON DELETE SET NULL` مش Cascade (بعكس باقي العلاقات اللي كلها Cascade) — تم التعامل معاها بحذف صريح للتكاليف المرتبطة في كود `deleteWorkItem` قبل حذف البند نفسه، بدل تغيير السكيما

## 8. Pending Tasks
مفيش مهمة جارية حاليًا. باقي الـ backlog (لسه معملناش فيه حاجة، ولسه محتاج قرار من المستخدم قبل البدء فيه):
- طباعة/تقارير PDF (مستخلص/تقرير مشروع)
- مستخدمين متعددين وصلاحيات
- موديول مخزون
- تذكيرات/جدولة زمنية
- مرفقات ومستندات

## 9. Important Rules
- المستخدم بيرفع الكود يدويًا عبر واجهة GitHub الويب (نسخ/لصق) — مفيش git push مباشر من Claude. أي تعديل لازم يتقدم للمستخدم كملف كامل مع تعليمات "امسح الكل (Ctrl+A ثم Delete) قبل ما تلصق".
- غلطة متكررة معروفة: تعديل اسم ملف عبر خانة الاسم في GitHub من غير ما تتمسح بالكامل الأول بيسبب تضاعف مسارات (زي `src/src/...`) — لازم التأكيد على مسح الخانة بالكامل أولاً.
- Vercel متصل بـ GitHub main ويعمل auto-deploy عند كل commit — مفيش داعي لـ Redeploy يدوي إلا لو الـ deploy فشل.
- الـ anon/publishable key من Supabase مقصود يكون public، لكن جدول `app_users` لازم يفضل مقفول بدون policies، والوصول بس عبر `verify_login` RPC.
- كل القراءة/الكتابة لازم تعدي على Supabase — ممنوع الرجوع لبيانات seed محلية في الـ state.
- تسجيل الدخول متعمّد إنه مايتحفظش (مفيش localStorage/sessionStorage) — لازم تسجيل دخول من جديد كل مرة يتقفل المتصفح، بناءً على طلب صريح من المستخدم.

## 10. Last Changes
تم إكمال ونشر مهمة التعديل والحذف بالكامل:
- ربط دوال التعديل/الحذف (كانت موجودة مسبقًا كـ backend functions) بالواجهة في `WorkItemsTab`, `CostsTab`, `ExtractsTab`, وزرار حذف مشروع في السايدبار
- إصلاح إضافي: `deleteWorkItem` بقى بيمسح التكاليف المرتبطة صراحةً من Supabase (بدل الاعتماد على `ON DELETE SET NULL` اللي كان هيسيب التكاليف موجودة بـ work_item_id = NULL)
- كل التعديلات دي اتبنت (`npm run build` ناجح) واترفعت يدويًا على GitHub واتأكد نجاح الـ deploy على Vercel

## 11. How To Continue
1. الملف المرجعي الأحدث موجود في الـ sandbox: `/home/claude/contracting-app/src/App.jsx` — دلوقتي متزامن مع اللي على GitHub/Vercel (آخر تحديث كان ناجح ومؤكد).
2. مفيش مهمة جارية — أي جلسة جديدة تقدر تبدأ مباشرة من قسم "Pending Tasks" (قسم 8) وتسأل المستخدم يختار منها، من غير حاجة لمراجعة الكود من الأول.
3. بيانات Supabase: project ref `pywkkzedqqgmaghdqxba` (eu-west-1). الجداول: `projects`, `work_items`, `costs`, `extracts`, `collections`, `app_users`.
4. بيانات الدخول: يوزر `Omar`، الباسورد متخزن في `app_users` — متعرضوش الباسورد تاني في الشات لأسباب أمنية.
5. الرفع للإنتاج يدوي بالكامل عبر GitHub الويب من مستخدم غير تقني — دايمًا اديله محتوى الملف كامل + خطوات واضحة جدًا + اطلب سكرين شوت للتأكيد بعد كل خطوة حساسة.
6. لو حصل تعديل جديد على App.jsx، لازم يتحدّث هذا الملف (PROJECT_STATUS.md) بعده مباشرة عشان يفضل دقيق.
