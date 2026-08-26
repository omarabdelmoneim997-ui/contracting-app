# Omar ERP — Current Project Context

## المشروع

Omar ERP هو نظام إدارة لشركة مقاولات، باللغة العربية RTL، يركز على إدارة المشروعات وتكاليفها وإيراداتها وتقاريرها.

## التقنية

* React 18 + Vite
* Tailwind CSS
* Recharts
* lucide-react
* Supabase (Postgres + supabase-js)
* Vercel + GitHub
* المستخدم يرفع الملفات يدويًا من GitHub Web، ولا يستخدم Git CLI.

## الملفات الأساسية

```text
contracting-app/
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx
    ├── App.jsx
    └── supabaseClient.js
```

`App.jsx` يحتوي معظم الواجهة والمكونات.

## قاعدة البيانات

Supabase project ref:
`pywkkzedqqgmaghdqxba`

الجداول:

* projects (يشمل عمود `treasury_opening_balance` لرصيد بداية الخزينة اليدوي)
* work_items
* costs
* extracts
* collections
* app_users
* treasury_entries (حركات خزينة كل مشروع: إيداع/صرف)
* funders (الممولين)
* financings (تمويلات كل مشروع من ممول معين)
* financing_repayments (سدادات كل تمويل)

العلاقات الأساسية:

* project → work_items: Cascade
* project → costs: Cascade
* project → extracts: Cascade
* extracts → collections: Cascade
* work_items → costs: SET NULL
* project → treasury_entries: Cascade
* project → financings: Cascade
* funders → financings: SET NULL
* financings → financing_repayments: Cascade

عند حذف Work Item يتم حذف التكاليف المرتبطة به صراحةً من الكود قبل حذف البند.
عند حذف مشروع، يتم حذف حركات الخزينة الخاصة به من الـ state صراحةً بعد نجاح حذف المشروع من قاعدة البيانات (باقي الجداول بتتنضف تلقائيًا عبر Cascade).

كل الجداول الجديدة (treasury_entries, funders, financings, financing_repayments) عليها RLS مفعّل مع policy عامة `using (true) with check (true)`، بنفس نمط باقي الجداول العادية.

## Login

يوجد جدول `app_users` يحتوي username/password.
RLS مفعّل بدون policies.
التحقق يتم فقط عن طريق:
`verify_login(username, password)`
وهي Security Definer ومسموحة للـ anon.

لا يتم حفظ تسجيل الدخول في:

* localStorage
* sessionStorage

المستخدم يجب أن يسجل الدخول مرة أخرى بعد إغلاق المتصفح.

**مهم:** لا تعرض كلمة المرور في الشات.

## الحالة الحالية

المشروع منشور ويعمل على Vercel Production، وكل المميزات الحالية تعمل.

### المميزات الموجودة

* إنشاء / تعديل / حذف المشروعات
* حذف المشروع بالكامل مع البيانات المرتبطة
* إدارة بنود الأعمال: إضافة / تعديل / حذف
* إدارة التكاليف:

  * مشتريات
  * مصنعيات
  * مصروفات
  * عهد
  * مصروفات عمومية
* تعديل وحذف التكاليف
* المستخلصات:

  * إضافة
  * تعديل
  * حذف
* التحصيلات:

  * إضافة
  * حذف
* طباعة المستخلص PDF من المتصفح باستخدام `window.print()`
* **خزينة المشروع** (تاب منفصل لكل مشروع):

  * رصيد بداية يدوي قابل للتعديل
  * تسجيل حركات إيداع/صرف بتاريخ ومبلغ وملاحظة
  * جدول مجمّع تلقائيًا حسب اليوم: رصيد أول اليوم، إجمالي الإيداع، إجمالي الصرف، رصيد آخر اليوم
  * تعديل وحذف كل حركة
  * رصيد حالي محسوب تلقائيًا
* **السلف والتمويلات** (تاب منفصل لكل مشروع):

  * تسجيل تمويل من ممول لمشروع معين (مبلغ/تاريخ/ملاحظة)
  * إضافة ممول جديد مباشرة أثناء تسجيل التمويل (بدون شاشة منفصلة)
  * تسجيل سدادات متعددة لكل تمويل بالتواريخ
  * حساب تلقائي للمسدد والمتبقي لكل تمويل وإجماليًا للمشروع
  * تعديل وحذف التمويلات، وحذف السدادات
* Dashboard
* Budget vs Actual
* فلترة التكاليف
* ساعة حية في الـ Footer
* RTL / Arabic UI

## الطباعة

طباعة المستخلص موجودة بالفعل وتعمل في Production.

زر الطباعة يفتح نافذة جديدة بتصميم A4/RTL ويعرض:

* بيانات المشروع والعميل
* رقم المستخلص
* التاريخ
* النسبة
* القيمة
* إجمالي المحصل
* المتبقي
* جدول التحصيلات

لا توجد مكتبة PDF إضافية.

## Build / Deploy

آخر Build نجح بدون أخطاء (بعد إضافة الخزينة والسلف والتمويلات).
يوجد فقط تحذير حجم Bundle حوالي 814KB، وهو تحذير أداء وليس خطأ وظيفي (في ازدياد تدريجي مع كل ميزة جديدة، يستحق المتابعة لو استمر في الزيادة).

Vercel متصل بـ GitHub `main` ويعمل Auto Deploy بعد كل Commit.

## Known Issues

1. Bundle كبير نسبيًا وفي ازدياد تدريجي.
2. Passwords في `app_users` مخزنة Plain Text — أداة داخلية حاليًا.
3. لا توجد Multi-user permissions حاليًا.
4. work_items → costs تستخدم SET NULL وتم التعامل معها في الكود.
5. funders → financings تستخدم SET NULL (لو اتمسح ممول، التمويلات المرتبطة بيه بتفضل موجودة بـ funder_id = NULL وتظهر كـ "ممول محذوف" في الواجهة) — سلوك مقصود، مش خطأ.

## Backlog

لا توجد مهمة جارية حاليًا.

المهام القادمة:

1. Multi-users & Permissions
2. Inventory Module
3. Reminders / Scheduling
4. Attachments / Documents

## أهم قواعد العمل

* كل البيانات يجب أن تأتي من Supabase.
* ممنوع الرجوع إلى Seed/Mock Local Data.
* `app_users` يجب أن يظل مقفولًا بدون Read Policy.
* الوصول لتسجيل الدخول فقط عبر `verify_login`.
* لا تضف localStorage/sessionStorage لحفظ الجلسة.
* المستخدم يرفع الكود يدويًا عبر GitHub Web.

### عند تعديل App.jsx

لا تعطِ المستخدم Patch جزئي.
أعطه **الملف كاملًا**.

ويجب أن تكون تعليمات GitHub واضحة جدًا:

1. افتح الملف.
2. اضغط Ctrl+A.
3. اضغط Delete.
4. الصق الملف الجديد كاملًا.
5. Commit changes.

### تحذير مهم جدًا

عند تغيير اسم الملف في GitHub:
يجب مسح خانة اسم الملف بالكامل أولًا، حتى لا يحدث خطأ مثل:
`src/src/...`

## المرجع المحلي

آخر نسخة معروفة من App.jsx موجودة في:
`/home/claude/contracting-app/src/App.jsx`

هذه النسخة متزامنة مع آخر نسخة منشورة حسب آخر حالة معروفة (تشمل الخزينة والسلف والتمويلات).

## طريقة المتابعة

لا تعيد تحليل المشروع بالكامل من البداية.
ابدأ مباشرة من الـ Backlog أعلاه أو من طلب المستخدم الحالي.

قبل إجراء تعديل كبير:

* راجع فقط الملفات المطلوبة.
* لا تعدّل قاعدة البيانات إلا عند الحاجة.
* لا تضف مكتبات جديدة إلا إذا كانت ضرورية.
* حافظ على التصميم الحالي والـ RTL.
* بعد أي تعديل على App.jsx، حدّث PROJECT_STATUS.md ليعكس الحالة الجديدة.
