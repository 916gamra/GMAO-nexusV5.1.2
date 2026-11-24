# 🏭 CIOB GMAO Nexus v5.1.2 (`GMAO-nexusV5.1.2`)

> **منصة صناعية لإدارة الصيانة والأصول ومخزون قطع الغيار (`GMAO / CMMS`) — تعمل محلياً بدون إنترنت (`Offline-First PWA`)، أو عبر مجلد بيانات على القرص (`GMAO_Data/`), أو عبر خادم شبكة محلية متعدد المحطات (`LAN Host`).**

[![Version](https://img.shields.io/badge/version-5.1.2-047857.svg)](./CHANGELOG.md)
[![Release](https://img.shields.io/badge/release-GMAO--nexusV5.1.2-0f766e.svg)](./CHANGELOG.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8%20(3--Tier%20Check)-3178c6.svg)](./tsconfig.strict.json)
[![React](https://img.shields.io/badge/React-19.2-0284c7.svg)](./package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Security Policy](https://img.shields.io/badge/Security-Fail--Closed%20RBAC-b91c1c.svg)](./SECURITY.md)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](./CODE_OF_CONDUCT.md)

---

## 🎯 ما هو CIOB GMAO Nexus وما القيمة التي يقدمها؟

**CIOB GMAO Nexus** هو نظام تشغيلي صناعي صُمم لمعالجة الفجوات الواقعية في ورش الصيانة ومخازن قطع الغيار (`Magasin PDR`):
- **ضبط الأصول والمكونات:** ربط دقيق بين الآلة الفعلية في الورشة، قوائم مكوناتها (`BOM`)، أعضائها الدوارة (`Bobinage / Entrepôt`)، وذاكرتها الهندسية المتراكمة (`Blueprints`).
- **يقين حسابي للمخزون:** معادلة مخزون حتمية واحدة لا تقبل الخصم المزدوج أو التضارب، مع أتمتة إعادة التموين وأوامر الشراء (`PO`).
- **انضباط الصيانة الوقائية والتصحيحية:** جدولة زمنية وبالعدادات (`ISO 14224`)، آلة حالة صارمة لأوامر العمل (`DI ➔ BT ➔ Clôture`)، وذاكرة تاريخية غير قابلة للطمس لحساب `MTTR` و`MTBF` و`TCO` والإغلاق الشهري.
- **حوكمة ورقابة داخلية حقيقية:** فصل السلطات بين الفني الميداني والمشرف (`Maker-Checker`)، وسجل تدقيق مؤسسي غير قابل للتعديل (`Append-Only Audit Ledger`).
- **سيادة كاملة على البيانات:** العمل دون اشتراك سحابي أو اتصال بالإنترنت، مع خيارات تخزين متعددة: **المتصفح (`IndexedDB`)**، **مجلد JSON محلي مباشر على قرص الحاسوب (`GMAO_Data/`)**، أو **خادم شبكة المصنع المحلية (`LAN Host` + `SQLite WAL`)**.

---

## 🧩 الوحدات التشغيلية والقدرات الفعلية

### 1. الأصول الصناعية والفلسفة الثلاثية (`3-Tier Asset & Cognitive Blueprint`)
يفصل النظام هندسياً بين التصنيف النظري، الأصل الفيزيائي في الورشة، والمعرفة المتراكمة:
- **المستوى 1 — العائلة والقالب (`Family & Template`):** التصنيف الصناعي والمواصفات القياسية للطراز (الصانع، الموديل، القدرة، السرعة).
- **المستوى 2 — الآلة المسجلة (`Machine Registered`):** الأصل الفيزيائي في المصنع (`gmao_machines_v2`)، وهو المالك الحصري للمنطقة الجغرافية (`Zone`)، الفني المسؤول (`Technician`)، عداد التشغيل الحي (`compteur_actuel`)، والمكونات والأجزاء المركبة فعلياً (`machineElementsLedger`).
  - يدعم التجميع التشغيلي الاختياري لخطوط الإنتاج (`Rôle Opérationnel: MACHINE | LINE`) عبر `parent_id` مع منع الحلقات الدائرية (`Cycle Detection`) وفصل الأبناء بأمان عند الأرشفة.
  - يفصل بشكل قاطع بين آلات الإنتاج (`PRODUCTION`) ومعدات المرافق العامة (`SYSTEM_GENERAL`).
- **المستوى 3 — المخطط المعرفي (`Blueprint`):** توأم معرفي افتراضي (`gmao_blueprints_v2`) يراكم شجرة الـ `BOM` النظرية (`components_theoriques`, `parts_theoriques`, `pdr_theoriques` مع وراثة `parent_component_key`)، خطط الوقائي المعيارية، والأعطال الشائعة. **لا يمتلك أبداً منطقة جغرافية ولا فنياً.**
- **جواز السفر الفني 360° (`Machine Passport 360°`):** بطاقة شاملة لكل آلة تعرض درجة الصحة (`Health Score / 100`)، التكلفة الكلية للملكية (`TCO`)، تنبيهات الأعطال المتكررة للأعضاء (`BER Alerts`)، تاريخ العدادات، التدخلات، وطباعة بطاقة `QR` ميدانية بدون إنترنت.

### 2. محرك المخزون (`Stock PDR`)، المستودع (`Entrepôt`)، وإعادة التموين (`PO`)
- **المعادلة الحتمية للمخزون (`O(1) IncrementalStockIndex`):**
  ```text
  stockActuel = stockInitial + Somme(Entrées) − Somme(Sorties)
  alerte      = stockActuel <= 0 ? 'RUPTURE' : (stockActuel <= seuil ? 'ALERTE' : 'OK')
  ```
- **هرم تصنيف قطع الغيار ثلاثي المستويات (`Group ➔ Type ➔ SKU`):** مع عزل كامل بين مجموعات قطع الغيار الاستهلاكية (`PdrGroup`)، الأعضاء الدوارة (`CompGroup`)، والأجزاء الميكانيكية (`PartGroup`)، بالإضافة إلى وسوم السياسة المادية (`MaterialPolicyTag`: `PDR_MAGASIN`, `FABRICABLE_ATELIER`, `REPARABLE_ATELIER`, `SOUS_TRAITABLE`, `CONSOMMABLE_CRITIQUE`).
- **عزل الاستهلاك المخزني (`Consumable PDR Only`):** يمنع خصم الأعضاء الدوارة أو الأجزاء الهيكلية من مخزون `PDR` الاستهلاكي، ويرشّح القطع ذكياً حسب شجرة `BOM` الآلة (`rankStockItemsByMachineBom`).
- **الصرف السريع (`Sortie Rapide`) ودورة التموين (`Replenishment PO FSM`):**
  `BROUILLON ➔ COMMANDE ➔ RECEPTION_PARTIELLE ➔ RECU_CONFORME` مع توليد تلقائي لحركات `Entrée` عند الاستلام برقم `BR` دون كسر معادلة المخزون.
- **مستودع الأعضاء الدوارة والبوبيناج (`Entrepôt`):** تتبع دورة حياة المحركات والمكونات (`En service` / `En réparation` / `Réformé`)، دفتر الحياة الموحد (`Carnet de Vie`)، والإرساليات الخارجية (`Sorties Externes / Bobinage`).

### 3. الصيانة الوقائية (التقويم + العدادات + CBM)
- **نمط الإطلاق الثلاثي (`MeterService.ts` — ISO 14224):**
  - `CALENDRIER`: جدولة دورية ومصفوفة 52 أسبوعاً.
  - `COMPTEUR`: إطلاق شرطي ببلوغ عتبة الساعات / الدورات / الكيلومترات مع إنذار استباقي (`WARNING` ضمن هامش 10%) وترحيل آلي للعتبة القادمة.
  - `HYBRIDE`: الأجل الأسبق (الزمن أو العداد).
- **جولة قراءة العدادات (`Tournée de Relevé Rapide`):** إدخال جماعي لقراءات خطوط الإنتاج مع مزامنة فورية لبطاقة الآلة ومهامها، وقواعد الصيانة الشرطية اليدوية (`cbmManualRules` بواحدات `mm/s` وغيرها).
- **الذاكرة الزمنية غير القابلة للطمس (`PreventiveExecutionRecord`):** كل تنفيذ يولّد حدثاً مؤرخاً مستقلاً (`periodMonth`, `periodWeek`, المدة، الفني، قطع الغيار، التكلفة).

### 4. الصيانة التصحيحية (`Work Order FSM`) وجسر الورشة
- **آلة حالة محدودة صارمة (`WorkOrderStateMachine`):**
  `DEMANDE ➔ BT_PLANIFIE ➔ EN_COURS ⇄ EN_ATTENTE_PDR ➔ CLOTURE` (أو `ANNULE`)، مع إغلاق ذري يمنع الخصم المزدوج.
- **صرف متعدد القطع (`Multi-PDR`):** ربط عدة قطع غيار بأمر عمل واحد مع توليد أذون صرف مستقلة وتحديث حالة المكون في المستودع تلقائياً.
- **توطين الأعطال وجسر الورشة والتموين:** تحديد موقع العطل (`Part Localization`)، إصدار أوامر تصنيع وتجليخ داخلية (`IWorkshopOrder: BR / RECT`)، وطلبات احتياج شراء (`NeedRequest`) مع حراسة منع الإغلاق المبكر لأمر العمل.
- **الجسر التنبؤي (`Correctif ⇄ Préventif`):** رصد الأعطال المتكررة (`≥ 3`) وتحويلها بنقرة إلى خطة صيانة وقائية، وتحويل الشذوذ الوقائي إلى طلب تدخل تصحيحي (`DI`).

### 5. الحوكمة، الرقابة المالية، والتقارير التنفيذية
- **مركز الاعتماد (`Maker-Checker Cockpit — VAL-1..VAL-5`):** إدخالات الفنيين الميدانيين (`BT`، تنفيذات وقائية، طلبات صرف) تدخل حالة `PENDING_VALIDATION` ولا تُخصم من المخزون الفعلي إلا بعد اعتماد المشرف، مع حفظ التصريح الأصلي (`pieces_claimed`) عند التعديل (`VALIDATED_WITH_EDITS`) ومسار `NEEDS_CLARIFICATION / REJECTED`.
- **سجل التدقيق المؤسسي (`Append-Only Audit Ledger`):** يوثق لقطات قبل/بعد (`before / after`) لتعديلات الرصيد الافتتاحي والسعر، أرشفة الآلات، قرارات الاعتماد، أوامر الشراء، وتعديلات الميزانية.
- **الرقابة المالية والعملات (`FinanceView` & `SettingsCurrencyTab`):** ميزانية تشغيلية موزعة عبر 4 بنود (وقائي، تصحيحي، خارجي/بوبيناج، مخزون) و12 شهراً مع إنذارات الحرق المالي (`Burn-Rate`)، وتعدد العملات (`ISO 4217`) و`TVA` وأسعار الصرف.
- **الإغلاق الشهري التنفيذي (`MonthlyExecutiveReportView`):** حساب `MTTR`، `MTBF`، الإتاحة (`Availability %`)، المقارنة الشهرية (`Month-over-Month`)، تصدير مصنف Excel رسمي من **5 أوراق عمل**، وطباعة تنفيذية بتوقيعات ثلاثية.

---

## 💾 معمارية البيانات، التخزين المحلي على القرص (`GMAO_Data/`)، والاستيراد الموحد

### 1. مصدر الحقيقة الواحد (`SSOT`) وصفر حقن صامت
- جميع الحالات تُدار عبر مخزن `Zustand` مقسّم إلى شرائح (`stockSlice`, `assetNexusSlice`, `preventiveSlice`, `correctiveSlice`) وتُحفظ حصرياً عبر `DataGateway.ts` ومفاتيح `STORAGE_KEYS`.
- وضع المصنع الحقيقي الفارغ (`START_MODE === 'empty'`) مضمون بالكامل: بعد التصفير (`clearAllForRealFactory`) وتحديث الصفحة (`F5`) تبقى كافة الجداول عند `0` دون أي إعادة حقن صامتة لبيانات تجريبية.
- الأرشفة الآمنة (`Soft-Archive`): أي آلة أو فني أو عنصر مستودع مرتبط بسجل تاريخي يُؤرشف ولا يُحذف صلباً لحماية سلامة التقارير.

### 2. التخزين المزدوج ومجلد البيانات المحلي (`GMAO_Data/` — Phase L1 / L2)
يتيح قسم الإعدادات التبديل الصريح بين:
1. **وضع تخزين المتصفح (`IndexedDB + localStorage + RAM`)** مع مراقبة الحصة الحقيقية لنظام التشغيل (`navigator.storage.estimate()`) وقفل الاستمرارية (`navigator.storage.persist()`).
2. **وضع مجلد البيانات المحلي على القرص (`GMAO_Data/`)** الجاهز للانتقال إلى تطبيق Windows Desktop:
   - هيكلة قياسية موثّقة بـ `manifest.json` وتغطي **29 ملف JSON** موزعة على:
     - `catalog/` (7 ملفات مطابقة 1:1 لحزم Type A الرسمية)
     - `operational/` (19 ملفاً تشمل الحركات، الوقائي، التصحيحي، الـ Blueprints، العدادات، أوامر الشراء، وسجل التدقيق)
     - `config/` (3 ملفات: تفضيلات الواجهة، العملات والميزانيات، وأعلام النظام — **مع استبعاد تام لأسرار المصادقة وكلمات المرور والـ PIN**)
   - **محرك فحص وإصلاح ذكي (`folderStoreEngine.ts`):** يصنّف أي مجلد إلى 5 حالات (`EMPTY`, `VALID_FULL`, `PARTIAL`, `FOREIGN_NONEMPTY`, `INVALID_MANIFEST`)، وينفّذ إصلاحاً إضافياً (`Additive Repair`) دون المساس بملفات المستخدم القائمة، أو ينشئ مجلداً فرعياً معزولاً `GMAO_Data/` داخل المجلدات المختلطة.
   - **ثلاث آليات وصول حقيقية للقرص بدون أي محاكاة:**
     - **قراءة/كتابة مباشرة على القرص (`showDirectoryPicker`):** على Chrome / Edge على الحاسوب في تبويب مستقل، مع حفظ المقبض في `IndexedDB`، وطابور مزامنة ذري متسلسل، واستئناف تلقائي بعد `F5`.
     - **قراءة حقيقية لمجلدات الحاسوب (`<input webkitdirectory>`):** تعمل حتى في Firefox وSafari والبيئات المدمجة (`readonly-disk-snapshot`).
     - **تصدير/استيراد حزم `PKZIP` القياسية:** يدعم `STORE` و`DEFLATE` مع التحقق من سلامة `CRC-32` وحماية ضد `Zip-Slip`.

### 3. خط أنابيب الاستيراد الموحد (`UnifiedImportPipeline` — Type A vs Type B)
- **ملفات Type A الرسمية القابلة للاستيراد (`REF_PARC`, `REF_PERSONNEL`, `ASSETS_MACHINES`, `REF_PDR`, `PM_CATALOG`, `ENTREPOT_BOM`, `CM_CATALOG`):** قوالب JSON وExcel تحمل ورقة التحقق `README_TYPE_A` وتمر عبر تحقق صارم من العلاقات المرجعية (`FK`) قبل الاعتماد.
- **تصديرات الشاشات التشغيلية (Type B):** موسومة صراحةً كملفات عرض/تقارير غير قابلة لإعادة الاستيراد ويحظرها حارس الاستيراد تلقائياً.

---

## 🛠️ المكدس التقني والمعمارية (`Tech Stack`)

| الطبقة | التقنيات المعتمدة فعلياً في المستودع |
| :--- | :--- |
| **الواجهة الأمامية (`Frontend`)** | `React 19.2`, `TypeScript 5.8`, `Vite 6.2`, `Tailwind CSS 4.3`, `React Router 7`, `Lucide React`, `Motion 13` |
| **إدارة الحالة والتحقق (`State & Validation`)** | `Zustand 5` (Sliced Store Architecture), `Zod 4.5` |
| **محرك الجداول، الصيغ، والرسوم (`Data & Viz`)** | `HyperFormula 3.4`, `ExcelJS 4.4`, `Recharts 3.10`, `@tanstack/react-virtual`, `react-window`, `date-fns 4`, `qrcode` |
| **التخزين والأداء بدون إنترنت (`Offline & PWA`)** | `IndexedDB` + `localStorage` + `MultiLevelCache (L1/L2/L3)` + `LZ-String` + `vite-plugin-pwa` + `File System Access API` |
| **خادم الشبكة المحلية (`LAN Host Backend`)** | `Node.js`, `Express 5.2`, `SQLite (WAL)` / `Atomic JSON (writeQueue)`, `Server-Sent Events (SSE)`, `Swagger UI / OpenAPI 3.0` |
| **الأمن والتشفير (`Security & Crypto`)** | `Web Crypto API` + محرك أصيل `nativeCrypto.ts` (`PBKDF2-HMAC-SHA256 600k`, `AES-256-GCM`, `HMAC-SHA256`), `DOMPurify` |
| **الجودة والاختبارات (`Testing & CI`)** | `Vitest 4.1`, `fast-check` (Property-Based Testing), `Playwright`, `ESLint 9`, `Prettier`, 3 ملفات `tsconfig` تشمل `tsconfig.strict.json` |

---

## 🔒 الأمن السيبراني وحوكمة خادم الشبكة المحلية (`Security-by-Default`)

- **بوابة المفتاح المزدوج (`Dual-Key Gate`):** تتطلب المصادقة المحلية رمز التفعيل المحلي (`Code d'activation local`) + كلمة مرور حساب المستخدم، مع خزنة مشفرة `AES-256-GCM` ومشتقات مفاتيح `PBKDF2-HMAC-SHA256` (600,000 دورة) — لا يُحفظ أي سر أو كلمة مرور بنص صريح.
- **خادم `LAN Host` بمبدأ الرفض الافتراضي (`Fail-Closed RBAC`):**
  - قائمة بيضاء صارمة بـ **45 كياناً** (`ALLOWED_ENTITIES`) وتطهير تلقائي لردود القراءة (`serverReadPolicy.ts`) لإزالة أي حقول كلمات مرور أو `PIN`.
  - مصادقة `X-GMAO-API-TOKEN` + جلسات موقّعة (`serverSession.ts`) مع إلغاء دائم عبر إعادة التشغيل (`gmao_revoked_sessions.json`) وتدوير التوكن (`POST /api/gmao/auth/refresh`).
  - قفل تسلسلي ذري للطفرات (`withMutationLock`)، تحكم تفاؤلي بالتزامن (`version` / `ETag` / `HTTP 409 Conflict`)، ومحدد معدل طلبات (`300 req/min/IP`).
- **تأمين الأجهزة المشتركة (`PWA Hardening`):** جميع مسارات `/api/gmao/*` مضبوطة على `NetworkOnly` في `Service Worker` لمنع تسرب بيانات مستخدم سابق إلى مستخدم تالٍ على نفس الجهاز اللوحي في الورشة.

---

## ⚖️ الحدود الهندسية الصريحة (الشفافية التقنية)

حرصاً على الصدق الهندسي الكامل أمام المستخدمين والمهندسين:
1. **كتابة المجلد المحلي المباشرة (`showDirectoryPicker`):** تعمل في **Chrome / Edge على الحاسوب داخل تبويب مستقل** فقط؛ المتصفحات تمنعها أمنياً داخل إطارات المعاينة المدمجة (`iframe`) وعلى Firefox/Safari/الهواتف (حيث يوفر التطبيق بديلاً حقيقياً عبر القراءة بـ `webkitdirectory` وحزم `.zip`).
2. **نطاق خادم الشبكة المحلية (`LAN Host`):** مصمم لمزامنة حواسيب وهواتف مصنع أو ورشة محلية (`SQLite WAL` / كتابة ذرية)، وليس منصة سحابية متعددة المستأجرين (`Multi-Tenant Cloud ERP`) لآلاف المستخدمين المتزامنين.
3. **التقييم المالي التشغيلي:** يضبط التكاليف والميزانيات التشغيلية للصيانة والمخزون ولا يستبدل أنظمة المحاسبة القانونية والفوترة الضريبية.

---

## 🚀 التشغيل السريع وأوامر التحقق

```bash
# 1. تثبيت الاعتماديات
npm install

# 2. تشغيل بيئة التطوير (الواجهة + خادم LAN Express على المنفذ 3000)
npm run dev

# 3. تشغيل الاختبارات الآلية الشاملة (Vitest)
npm test

# 4. فحص الأنواع الصارم (الواجهة + الخادم + النواة الصارمة)
npm run typecheck
npm run typecheck:server
npm run typecheck:strict

# 5. التدقيق اللغوي للكود والبناء الإنتاجي
npm run lint
npm run build
```

---

## 📂 هيكل المستودع المختصر

```text
├── server.ts                      # نقطة دخول خادم LAN Express + Vite Dev/Static
├── src/
│   ├── application/               # DataGateway، الفهرس التراكمي، محرك folderStore (L1/L2)، وخدمات الأعمال
│   ├── core/                      # الكيانات المجالية، الأمن، التشفير الأصيل، RBAC، والكاش متعدد المستويات
│   ├── domain/                    # قواعد المخزون، آلة حالة التصحيحي (FSM)، وحسابات الإتاحة
│   ├── infrastructure/            # STORAGE_KEYS، الترحيل الآمن، IndexedDB، والمستودعات
│   ├── presentation/              # 15 وحدة واجهة (الأصول، المخزون، الوقائي، التصحيحي، المستودع، الاعتماد، المالية، الإعدادات)
│   ├── server/                    # مسارات API، SQLite WAL، المصادقة، وقفل الطفرات الذري
│   ├── services/                  # UnifiedImportPipeline (Type A)، Excel Engine، المزامنة، والتقارير
│   ├── store/                     # Zustand Store المقسّم إلى شرائح (slices/)
│   └── tests/                     # اختبارات الوحدة والتكامل (Vitest + fast-check)
└── docs/                          # مواصفات البيانات، الاستيراد، الأمن، والشاشات
```

---

## 🧭 البوابة السريعة للتوثيق الهندسي والحوكمة

| الوثيقة | الغرض |
| :--- | :--- |
| **[`AGENTS.md`](./AGENTS.md)** | البوابة الإلزامية الأولى للمطورين ووكلاء الذكاء الاصطناعي (القواعد التسع غير القابلة للتفاوض). |
| **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** | الملخص المعماري التنفيذي، الفلسفة الثلاثية للأصول والـ `Blueprint`، وسجل القرارات (`ADR-01` إلى `ADR-12`). |
| **[`CAPABILITIES_AND_STRENGTHS.md`](./CAPABILITIES_AND_STRENGTHS.md)** | سجل القدرات الهندسية المنفذة بالكود والاختبارات الآلية (`Vitest`). |
| **[`docs/DATA_SSOT.md`](./docs/DATA_SSOT.md)** | مفاتيح التخزين القياسية (`STORAGE_KEYS`) والعلاقات المرجعية (`FK`). |
| **[`docs/DATA_INGESTION_AND_BUNDLES.md`](./docs/DATA_INGESTION_AND_BUNDLES.md)** | مواصفات خط أنابيب الاستيراد الموحد وحزم Type A السبع. |
| **[`docs/SECURITY_LICENSE_GATE.md`](./docs/SECURITY_LICENSE_GATE.md)** | بوابة المفتاح المزدوج ورمز التفعيل المحلي (`LOGIN-LICENSE-P0`). |
| **[`DOCS_INDEX.md`](./DOCS_INDEX.md)** | الفهرس الكامل لوثائق المشروع ومواصفات الشاشات (`docs/*_VIEW.md`). |
| **[`CHANGELOG.md`](./CHANGELOG.md)** | سجل الإصدارات والترقيات (`5.1.2` / `GMAO-nexusV5.1.2` ← `5.0.2` ← `4.2.0` ← `4.0.0`). |
| **[`CONTRIBUTING.md`](./CONTRIBUTING.md)** | دليل المساهمة القياسي، نظام الوسوم (`Git Tags/Releases`)، ومعايير الدمج والاختبار. |
| **[`SECURITY.md`](./SECURITY.md)** | سياسة الأمان، الإبلاغ المسؤول عن الثغرات، وضوابط خادم `LAN` والمصادقة. |
| **[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)** | ميثاق السلوك المهني للمساهمين (`Contributor Covenant v2.1`). |
| **[`LICENSE`](./LICENSE)** | الترخيص القانوني المعتمد للمشروع (**MIT License**). |

---

## 🏷️ هوية الإصدار والأتمتة (`Versioning & Release`)

- **الإصدار المعتمد:** `5.1.2` (**SemVer 2.0.0**)
- **معرّف الإصدار الرسمي:** `GMAO-nexusV5.1.2`
- **اسم الحزمة في `package.json`:** `ciobgmao-nexus`
- **أتمتة الإطلاق:** دفع أي وسم يطابق `GMAO-nexusV*` أو `ciobGMAO-nexusV*` أو `v*.*.*` يشغّل تلقائياً خط أنابيب [`.github/workflows/release.yml`](./.github/workflows/release.yml) للتحقق من التطابق، الفحص ثلاثي المستويات للأنواع، التدقيق الأمني، الاختبارات، وإنشاء GitHub Release.
