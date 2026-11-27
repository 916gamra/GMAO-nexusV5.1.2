# 🗓️ توثيق منظومة الصيانة الوقائية والعدادات والرقابة الشرطية (`PREVENTIVE_VIEW.md`)

يوثق هذا الملف المعمارية التقنية والوظيفية لوحدة **الصيانة الوقائية (`PreventiveView.tsx`, `TabMainView.tsx`, `PreventiveSecondaryView.tsx`, `PreventiveMetersView.tsx`, `CbmIoTSensorPanel.tsx`)** ومحركات التنفيذ المؤرخ (`ExecutionService.ts`) والعدادات (`MeterService.ts`) والقياسات الميدانية الشرطية (`cbmTelemetryService.ts`) والتحليلات (`preventiveAnalyticsEngine.ts`).

---

## 🏛️ 1. الفلسفة والفضاءات الأربعة الموحدة

1. **الفضاء 1 — التخطيط والتنفيذ (`Planning & Exécution`) :**
   - **قمرة الأسبوع (`PreventiveWeeklyCockpit`) :** قائمة أولويات المتأخرات والأسبوع الجاري، تصفية حسب الفني الميداني، مصادقة سريعة بضغطة واحدة محمية بحارس `taskHasRequiredPdr` (لمنع تجاوز خصم `PDR`)، زر طباعة `OT` مباشرة، وجولات النظام العام (`SystemGeneralRoundModal`).
   - **5 عروض تخطيط قابلة للتبديل :** `Liste Tâches` (مع تعديل/إعادة إسناد `✏️` وحذف `🗑️`)، `Matrice S1-S52`، `Grille Jours J1-J31`، `Par Machine`، و`Calendrier Mensuel`.
   - **أمر العمل المطبوع (`PrintWorkOrderModal`) :** قائمة تحقق `LOTO`، حل تلقائي للقطع الموصوفة (`pdr_requises` و`pdr_ref`)، وأسطر ملاحظات ميدانية فارغة (بدون `RAS` افتراضية).
2. **الفضاء 2 — العدادات والرقابة الشرطية (`Compteurs & Heures` + `CBM Terrain`) :**
   - **صيانة بالعدادات (`MeterService.ts`) :** 3 أنماط إطلاق (`CALENDRIER`، `COMPTEUR`، `HYBRIDE`) مع تقييم `OK / WARNING / OVERDUE` وجولة قراءة مجمعة (`Tournée d'Atelier`) منسوبة للفني الميداني.
   - **قياسات شرطية ميدانية (`CbmIoTSensorPanel` / `cbmTelemetryService.ts`) :** بروتوكول ميداني صادق (`MANUEL`)، تحقق رياضي من العتبات (`HIGH_BAD` / `LOW_BAD`) مع هسترة، وإنشاء `DI` علاجية تلقائية دون تكرار عند تجاوز الحد الحرج.
3. **الفضاء 3 — السجل والتحليلات (`Historique & Analytics`) :**
   - **الذاكرة الزمنية (`PREVENTIVE_EXECUTIONS`) :** سجل غير قابل للطمس قابل للتصفية حسب الفترة، حالة المصادقة، والفني المنفذ؛ وحذف أي تنفيذ خاطئ يعيد حساب `derniere_realisation` و`etat` للمهمة المرتبطة تلقائياً.
   - **التحليلات (`PreventiveAnalyticsView`) :** مؤشر الالتزام `OTCR`، توازن `PM/CM`، مخاطر نقص `PDR`، وجدول **حمولة وأداء الفنيين (`Charge & Performance par Technicien`)**.
4. **الفضاء 4 — الخطط والأدلة (`#preventive_referentiel` — محمي بصلاحية `preventive.manage`) :**
   - `Concepteur de Plans` (`TabPlanBuilder`) مع استبعاد الآلات والفنيين المؤرشفين، وحماية الترددات المخصصة، وتصفية المستهلكات؛ `Fiches Guides` (`TabGuide`) بدون بيانات وهمية؛ و`Catalogue Actions AFNOR` (`TabActions`) مع حماية الرموز الأساسية (`C / N / G / V`) من الحذف.

---

## 🧭 2. التوافق بين `TEAM_FULL` و`SOLO_EXPERT` وإدارة الفنيين

| البند | وضع `TEAM_FULL` | وضع `SOLO_EXPERT` |
| :--- | :--- | :--- |
| **الحوكمة** | `TEAM_MAKER_CHECKER` (`PENDING_VALIDATION` للفنيين + اعتماد المشرف) | `SOLO_DIRECT` (تنفيذ مباشر لحساب `ADMIN` مع توثيق `AUDIT_EVENTS`) |
| **إدارة الفنيين الميدانيين** | حسابات متعددة + تعيين + متابعة الحمولة | كاملة بدون حسابات متعددة: إسناد/إعادة إسناد (`✏️`)، تصفية القمرة والسجل، طباعة `OT`، نسب قراءات العدادات و`CBM`، وجدول أداء الفنيين |
| **التكاليف والعملة الديناميكية (`useCurrency`)** | ظاهرة في المؤشرات والجداول و`OT` و`CSV/Excel` | مخفية افتراضياً (`showFinance: false`) وتُستبدل بـ `Charge Horaire Préventive` (قابلة لإعادة التفعيل) |
| **مرشحات `Maker-Checker` و`Blueprints`** | ظاهرة افتراضياً | مخفية تلقائياً (`Blueprints` اختيارية، و`Maker-Checker` يختفي عند عدم وجود مهام معلقة) |
| **العزل الأمني (`RBAC` و`R4`)** | الفني يرى نطاقه فقط (`scopedTasks`) و`VIEWER` للقراءة فقط | `@admin` يملك الصلاحية الكاملة مع إبقاء كافة ضوابط المخزون و`AUDIT_EVENTS` |

---

## 💾 3. مفاتيح التخزين القياسية (`STORAGE_KEYS`)

| الكيان | المفتاح القياسي | الخدمة المسؤولة |
| :--- | :--- | :--- |
| **المهام الوقائية (`preventiveTasks`)** | `gmao_preventive_tasks_v9` | `DataGateway.savePreventiveTasks` |
| **سجل التنفيذات المؤرخة (`preventiveExecutions`)** | `gmao_preventive_executions_v1` | `ExecutionService.recordExecution` |
| **قراءات العدادات (`meterReadings`)** | `gmao_meter_readings_v1` | `MeterService` / `DataGateway.saveMeterReadings` |
| **قواعد الرقابة الشرطية اليدوية (`CBM`)** | `gmao_cbm_manual_rules_v1` | `CbmIoTSensorPanel` (تُفرَّغ تلقائياً عند تفريغ المصنع) |
| **رموز الإجراءات (`preventiveActions`)** | `gmao_preventive_actions_v3` | `DataGateway.savePreventiveActions` |
| **الأدلة الفنية (`preventiveGuides`)** | `gmao_preventive_guides_v3` | `DataGateway.savePreventiveGuides` |
| **الخطط الوقائية (`preventivePlans`)** | `gmao_preventive_plans_v3` | `DataGateway.savePreventivePlans` |
