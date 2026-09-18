# 🚀 IAM Sales CRM - Backend

**سیستم مدیریت فرآیند فروش IAM** – بک‌اند قدرتمند برای مدیریت لیدها، پایپ‌لاین فروش، تماس‌ها و گزارش‌گیری.

[![NestJS](https://img.shields.io/badge/NestJS-10.x-E0234E?logo=nestjs)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-5.x-2D3748?logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-24.x-2496ED?logo=docker)](https://www.docker.com/)

---

## 📋 فهرست مطالب

- [معرفی پروژه](#معرفی-پروژه)
- [ویژگی‌های کلیدی](#ویژگی‌های-کلیدی)
- [معماری سیستم](#معماری-سیستم)
- [نصب و راه‌اندازی](#نصب-و-راه‌اندازی)
- [ساختار پروژه](#ساختار-پروژه)
- [مدل‌های دیتابیس](#مدل‌های-دیتابیس)
- [سیستم دسترسی‌ها (Policy)](#سیستم-دسترسی‌ها-policy)
- [راهنمای API](#راهنمای-api)
- [گزارش‌گیری](#گزارش‌گیری)
- [Import SAM List](#import-sam-list)
- [تست با Postman](#تست-با-postman)
- [توسعه و مشارکت](#توسعه-و-مشارکت)

---

## 🎯 معرفی پروژه

**IAM Sales CRM** یک سیستم مدیریت فرآیند فروش است که برای شرکت‌های فعال در حوزه **Identity & Access Management (IAM)** طراحی شده است. این سیستم به تیم‌های فروش کمک می‌کند تا:

- **لیدها** را از لیست‌های SAM (Service Addressable Market) وارد کنند.
- **پایپ‌لاین فروش** را با مراحل مشخص مدیریت کنند (از LEAD تا DONE).
- **تماس‌ها و فعالیت‌ها** را ثبت و پیگیری کنند.
- **گزارش‌های تحلیلی** برای بهبود نرخ تبدیل دریافت کنند.
- **دسترسی‌ها** را به‌صورت پویا و نقش‌محور مدیریت کنند.

---

## ✨ ویژگی‌های کلیدی

### 🏗️ مدیریت شرکت‌ها و مخاطبین
- ایجاد، ویرایش و مشاهده شرکت‌ها با صفحه‌بندی
- مدیریت مخاطبین (افراد) هر شرکت
- ثبت شعب و کانال‌های اجتماعی شرکت‌ها

### 🔄 پایپ‌لاین فروش (Kanban)
- تغییر مرحله با ثبت خودکار تاریخچه
- مشاهده تاریخچه تغییرات هر شرکت
- ۱۷ مرحله از LEAD تا DONE

### 📞 مدیریت فعالیت‌ها و تماس‌ها
- ثبت تماس، ایمیل، پیام لینکدین، جلسه و یادداشت
- یادآوری‌های سررسید (Follow-up)
- مشاهده فعالیت‌های هر شرکت با صفحه‌بندی

### 🃏 Call Card
- کارت تماس اختصاصی برای هر شرکت
- پیشنهاد خودکار Pain Point و Use Case بر اساس:
  - کتابخانه Persona (سمت مخاطب)
  - کتابخانه صنعت (نوع شرکت)

### 📊 گزارش‌گیری پیشرفته
- نرخ تبدیل بین مراحل پایپ‌لاین
- میانگین زمان ماندگاری در هر مرحله
- خلاصه وضعیت پایپ‌لاین
- گزارش فعالیت‌ها در بازه زمانی

### 🛡️ سیستم دسترسی‌های پویا (Policy)
- مدیریت دسترسی‌ها در سطح Action (مثلاً `company:view`)
- اختصاص دسترسی به نقش‌ها (ADMIN, MANAGER, REP, BOARDS)
- قابلیت مدیریت در پنل ادمین بدون تغییر کد
- کش خودکار برای افزایش سرعت

### 📥 Import SAM List
- آپلود فایل Excel با فرمت `.xlsx` یا `.xls`
- ایجاد خودکار شرکت‌ها و مخاطبین
- گزارش خطاها برای هر ردیف

### 🔐 امنیت و اعتبارسنجی
- احراز هویت با JWT (۸ ساعت اعتبار)
- Rate Limiting برای جلوگیری از حملات Brute-Force
- اعتبارسنجی متغیرهای محیطی در زمان استارت
- ایندکس‌های دیتابیس برای بهبود عملکرد

---

## 🏗️ معماری سیستم

### تکنولوژی‌های استفاده‌شده

| بخش | تکنولوژی |
|-----|----------|
| **Backend Framework** | NestJS 10.x |
| **ORM** | Prisma 5.x |
| **Database** | PostgreSQL 16 |
| **Authentication** | JWT + Passport |
| **Validation** | class-validator + class-transformer |
| **Environment** | @nestjs/config + Joi |
| **Rate Limiting** | @nestjs/throttler |
| **Excel Import** | xlsx + multer |
| **Containerization** | Docker + Docker Compose |

---

## 🔧 نصب و راه‌اندازی

### پیش‌نیازها

- **Node.js** 18+
- **npm** 9+
- **PostgreSQL** 14+ (یا Docker)
- **Docker** (اختیاری، برای دیتابیس)

### روش اول: اجرا با Docker (تولید)

```bash
# ۱. کلون پروژه
git clone <repository-url>
cd iam-crm-backend

# ۲. ساخت و اجرا
docker compose up -d --build

# ۳. اجرای Seed (داده‌های اولیه)
docker compose exec api npm run seed
```

### روش دوم: اجرا محلی (توسعه)

```bash
# ۱. نصب وابستگی‌ها
npm install

# ۲. تنظیم فایل .env
cp .env.example .env
# ویرایش مقادیر DATABASE_URL و JWT_SECRET

# ۳. راه‌اندازی دیتابیس با Docker (فقط دیتابیس)
docker run --name iam-crm-db \
  -e POSTGRES_USER=iam_crm \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=iam_crm \
  -p 5432:5432 \
  -v iam_crm_db_data:/var/lib/postgresql/data \
  -d postgres:16-alpine

# ۴. ایجاد و اعمال Migration‌ها
npx prisma migrate dev --name init

# ۵. اجرای Seed
npm run seed

# ۶. اجرای پروژه
npm run start:dev
```

### متغیرهای محیطی (.env)

```env
DATABASE_URL="postgresql://iam_crm:changeme@localhost:5432/iam_crm?schema=public"
JWT_SECRET="your-32-character-secret-key-here"
JWT_EXPIRES_IN="8h"
PORT=3000
THROTTLE_TTL=60000
THROTTLE_LIMIT=100
NODE_ENV=development
```

---

## 📂 ساختار پروژه

```
iam-crm-backend/
├── prisma/
│   ├── schema.prisma          ← مدل‌های دیتابیس
│   ├── seed.ts                ← داده‌های اولیه
│   └── migrations/            ← فایل‌های Migration
├── src/
│   ├── auth/                  ← احراز هویت (JWT)
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts
│   │   ├── auth.controller.ts
│   │   ├── jwt.strategy.ts
│   │   └── dto/
│   ├── users/                 ← مدیریت کاربران
│   │   ├── users.module.ts
│   │   ├── users.service.ts
│   │   ├── users.controller.ts
│   │   └── dto/
│   ├── companies/             ← مدیریت شرکت‌ها
│   │   ├── companies.module.ts
│   │   ├── companies.service.ts
│   │   ├── companies.controller.ts
│   │   └── dto/
│   ├── people/                ← مدیریت مخاطبین
│   ├── activities/            ← مدیریت فعالیت‌ها
│   ├── call-cards/            ← مدیریت Call Card
│   ├── reports/               ← گزارش‌گیری
│   ├── import/                ← Import SAM List
│   ├── company-branches/      ← مدیریت شعب
│   ├── company-social-channels/ ← مدیریت کانال‌های اجتماعی
│   ├── admin/                 ← مدیریت دسترسی‌ها (Policy)
│   ├── common/                ← قابلیت‌های مشترک
│   │   ├── guards/            ← گاردهای امنیتی
│   │   ├── decorators/        ← دکوراتورها
│   │   ├── dto/               ← DTOهای مشترک
│   │   └── validators/        ← اعتبارسنجی‌ها
│   ├── prisma/                ← Prisma Service
│   ├── app.module.ts          ← ماژول اصلی
│   └── main.ts                ← نقطه ورود
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🗄️ مدل‌های دیتابیس

### مدل‌های اصلی

| مدل | توضیح |
|-----|-------|
| **User** | کاربران سیستم (ADMIN, MANAGER, REP, BOARDS) |
| **Company** | شرکت‌ها (لیدها) |
| **Person** | مخاطبین هر شرکت |
| **Activity** | فعالیت‌ها و تعاملات (تماس، ایمیل، جلسه، ...) |
| **PipelineStageHistory** | تاریخچه تغییرات مرحله پایپ‌لاین |
| **CallCard** | کارت تماس هر شرکت |
| **CompanyBranch** | شعب شرکت |
| **CompanySocialChannel** | کانال‌های اجتماعی شرکت |
| **PersonaLibrary** | کتابخانه Persona (CIO, CISO, ...) |
| **IndustryPlaybook** | کتابخانه صنعت (بانک, بیمه, ...) |

### مدل‌های سیستم دسترسی‌ها (Policy)

| مدل | توضیح |
|-----|-------|
| **Permission** | دسترسی‌های سیستم (مثلاً `company:view`) |
| **RolePermission** | اختصاص دسترسی‌ها به نقش‌ها |

---

## 🛡️ سیستم دسترسی‌ها (Policy)

### معماری

```
┌─────────────────────────────────────────────────────────────┐
│                       Request                              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    JwtAuthGuard                            │
│              (احراز هویت با توکن JWT)                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    RolesGuard                              │
│              (بررسی نقش‌های مجاز)                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  PermissionsGuard                          │
│    (بررسی دسترسی‌های مورد نیاز با کش از دیتابیس)          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Controller                             │
│            (اجرای منطق اصلی با @Permissions)               │
└─────────────────────────────────────────────────────────────┘
```

### نقش‌های سیستم

| نقش | توضیح |
|-----|-------|
| **ADMIN** | دسترسی کامل به همه بخش‌ها |
| **MANAGER** | مدیریت شرکت‌های تیم خود + گزارش‌ها |
| **REP** | مدیریت شرکت‌های خود + فعالیت‌ها |
| **BOARDS** | فقط مشاهده گزارش‌ها |

### لیست دسترسی‌های تعریف‌شده

| دسترسی | توضیح |
|--------|-------|
| `user:create` | ایجاد کاربر جدید |
| `user:view` | مشاهده لیست کاربران |
| `user:deactivate` | غیرفعال کردن کاربر |
| `user:activate` | فعال‌سازی مجدد کاربر |
| `company:view` | مشاهده شرکت‌ها |
| `company:create` | ایجاد شرکت جدید |
| `company:update` | ویرایش شرکت |
| `company:delete` | حذف شرکت |
| `company:change-stage` | تغییر مرحله پایپ‌لاین |
| `company:change-owner` | تغییر مالکیت شرکت |
| `company:bulk-change-owner` | تغییر مالکیت گروهی |
| `import:sam` | آپلود لیست SAM |
| `report:view` | مشاهده گزارش‌ها |
| `call-card:view` | مشاهده Call Card |
| `call-card:manage` | مدیریت Call Card |
| `activity:view` | مشاهده فعالیت‌ها |
| `activity:create` | ثبت فعالیت جدید |
| `person:view` | مشاهده مخاطبین |
| `person:create` | ایجاد مخاطب جدید |
| `person:update` | ویرایش مخاطب |
| `person:delete` | حذف مخاطب |
| `branch:manage` | مدیریت شعب |
| `social-channel:manage` | مدیریت کانال‌های اجتماعی |
| `library:persona:view` | مشاهده کتابخانه Persona |
| `library:persona:manage` | مدیریت کتابخانه Persona |
| `library:industry:view` | مشاهده کتابخانه صنعت |
| `library:industry:manage` | مدیریت کتابخانه صنعت |

---

## 🌐 راهنمای API

### احراز هویت (Auth)

#### 🔐 Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@yourcompany.com",
  "password": "ChangeMe123!"
}
```

**پاسخ:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "fullName": "مدیر سیستم",
    "email": "admin@yourcompany.com",
    "role": "ADMIN",
    "permissions": ["user:create", "company:view", ...]
  }
}
```

---

### مدیریت کاربران (Users)

| متد | مسیر | توضیح | دسترسی مورد نیاز |
|-----|------|-------|-------------------|
| `POST` | `/users` | ایجاد کاربر جدید | `user:create` |
| `GET` | `/users` | دریافت لیست کاربران | `user:view` |
| `GET` | `/users/:id` | دریافت یک کاربر | `user:view` |
| `PATCH` | `/users/:id/deactivate` | غیرفعال کردن کاربر | `user:deactivate` |
| `PATCH` | `/users/:id/activate` | فعال‌سازی مجدد کاربر | `user:activate` |
| `PATCH` | `/users/:id/role` | تغییر نقش کاربر | `user:create` |

---

### مدیریت شرکت‌ها (Companies)

| متد | مسیر | توضیح | دسترسی مورد نیاز |
|-----|------|-------|-------------------|
| `GET` | `/companies` | دریافت لیست شرکت‌ها (با صفحه‌بندی) | `company:view` |
| `GET` | `/companies/:id` | دریافت یک شرکت | `company:view` |
| `POST` | `/companies` | ایجاد شرکت جدید | `company:create` |
| `PATCH` | `/companies/:id` | ویرایش شرکت | `company:update` |
| `PATCH` | `/companies/:id/stage` | تغییر مرحله پایپ‌لاین | `company:change-stage` |
| `PATCH` | `/companies/:id/owner` | تغییر مالکیت | `company:change-owner` |
| `PATCH` | `/companies/bulk/owner` | تغییر مالکیت گروهی | `company:bulk-change-owner` |

**پارامترهای Query در `GET /companies`:**

| پارامتر | توضیح | مثال |
|---------|-------|-------|
| `page` | شماره صفحه | `1` |
| `limit` | تعداد آیتم در هر صفحه | `20` |
| `stage` | فیلتر بر اساس مرحله | `LEAD` |
| `priority` | فیلتر بر اساس اولویت | `HIGH` |
| `withoutOwner` | شرکت‌های بدون مالک | `true` |

---

### مدیریت مخاطبین (People)

| متد | مسیر | توضیح |
|-----|------|-------|
| `GET` | `/people?companyId=:companyId` | دریافت مخاطبین یک شرکت |
| `GET` | `/people/:id` | دریافت یک مخاطب |
| `POST` | `/people` | ایجاد مخاطب جدید |
| `PATCH` | `/people/:id` | ویرایش مخاطب |
| `DELETE` | `/people/:id` | حذف مخاطب |

---

### مدیریت فعالیت‌ها (Activities)

| متد | مسیر | توضیح |
|-----|------|-------|
| `GET` | `/activities?companyId=:companyId` | دریافت فعالیت‌های یک شرکت |
| `GET` | `/activities/follow-ups/due` | دریافت یادآوری‌های سررسید |
| `POST` | `/activities` | ثبت فعالیت جدید |

---

### مدیریت Call Card

| متد | مسیر | توضیح |
|-----|------|-------|
| `GET` | `/companies/:companyId/call-card` | دریافت Call Card |
| `GET` | `/companies/:companyId/call-card/suggest` | دریافت پیشنهادات خودکار |
| `PUT` | `/companies/:companyId/call-card` | ایجاد/ویرایش Call Card |

---

### مدیریت کتابخانه‌ها

| متد | مسیر | توضیح | دسترسی |
|-----|------|-------|---------|
| `GET` | `/persona-library` | دریافت لیست Personaها | `library:persona:view` |
| `POST` | `/persona-library` | ایجاد Persona جدید | `library:persona:manage` |
| `PATCH` | `/persona-library/:id` | ویرایش Persona | `library:persona:manage` |
| `DELETE` | `/persona-library/:id` | حذف Persona | `library:persona:manage` |

(همین ساختار برای `industry-playbook` نیز وجود دارد)

---

### مدیریت شعب (Company Branches)

| متد | مسیر | توضیح |
|-----|------|-------|
| `POST` | `/companies/:companyId/branches` | ایجاد شعبه جدید |
| `GET` | `/companies/:companyId/branches` | دریافت لیست شعب |
| `GET` | `/companies/:companyId/branches/:id` | دریافت یک شعبه |
| `PATCH` | `/companies/:companyId/branches/:id` | ویرایش شعبه |
| `DELETE` | `/companies/:companyId/branches/:id` | حذف شعبه |

---

### مدیریت کانال‌های اجتماعی (Social Channels)

| متد | مسیر | توضیح |
|-----|------|-------|
| `POST` | `/companies/:companyId/social-channels` | ایجاد کانال جدید |
| `GET` | `/companies/:companyId/social-channels` | دریافت لیست کانال‌ها |
| `GET` | `/companies/:companyId/social-channels/:id` | دریافت یک کانال |
| `PATCH` | `/companies/:companyId/social-channels/:id` | ویرایش کانال |
| `DELETE` | `/companies/:companyId/social-channels/:id` | حذف کانال |

---

## 📊 گزارش‌گیری (Reports)

### مسیرهای گزارش‌ها (فقط `report:view`)

| متد | مسیر | توضیح |
|-----|------|-------|
| `GET` | `/reports/conversion-rates` | نرخ تبدیل بین مراحل |
| `GET` | `/reports/stage-durations` | میانگین زمان ماندگاری در هر مرحله |
| `GET` | `/reports/pipeline-summary` | خلاصه وضعیت پایپ‌لاین |
| `GET` | `/reports/activities` | گزارش فعالیت‌ها در بازه زمانی |

---

## 📥 Import SAM List

### آپلود لیست SAM

```http
POST /api/import/sam
Authorization: Bearer {{token}}
Content-Type: multipart/form-data

Body: form-data
  Key: file
  Type: File
  Value: [انتخاب فایل Excel]
```

**ستون‌های قابل‌شناسایی در فایل Excel:**

| نام ستون فارسی | نام ستون انگلیسی |
|----------------|------------------|
| نام شرکت | legalName |
| نام تجاری | brandName |
| صنعت | industry |
| وبسایت | website |
| شهر | headOfficeCity |
| اولویت | priority |
| نام مخاطب | personName |
| سمت | title |
| ایمیل | email |
| تلفن | phone |
| نقش | personaTag |

**پاسخ موفق:**

```json
{
  "totalRows": 10,
  "successful": 8,
  "failed": 2,
  "errors": [
    {
      "row": 3,
      "message": "نام شرکت الزامی است"
    }
  ],
  "summary": {
    "companiesCreated": 8,
    "peopleCreated": 5
  }
}
```

---

## 🛡️ مدیریت دسترسی‌ها (Admin Permissions)

### مسیرهای مدیریت (فقط ADMIN)

| متد | مسیر | توضیح |
|-----|------|-------|
| `GET` | `/admin/permissions` | دریافت لیست تمام دسترسی‌ها |
| `GET` | `/admin/permissions/roles/:role` | دریافت دسترسی‌های یک نقش |
| `GET` | `/admin/permissions/roles/:role/with-details` | دریافت وضعیت کامل دسترسی‌های یک نقش |
| `POST` | `/admin/permissions/assign` | اختصاص یک دسترسی به نقش |
| `POST` | `/admin/permissions/bulk-assign` | اختصاص گروهی دسترسی‌ها |
| `DELETE` | `/admin/permissions/revoke` | حذف یک دسترسی از نقش |
| `POST` | `/admin/permissions/bulk-revoke` | حذف گروهی دسترسی‌ها |
| `POST` | `/admin/permissions/create` | ایجاد دسترسی جدید |
| `DELETE` | `/admin/permissions/:action` | حذف دسترسی |

---

## 🐳 Docker

### ساخت و اجرا

```bash
# ساخت و اجرا
docker compose up -d --build

# مشاهده لاگ‌ها
docker compose logs -f api

# اجرای Seed
docker compose exec api npm run seed

# دسترسی به Prisma Studio
docker compose exec api npx prisma studio

# توقف
docker compose down
```

---

## 🧑‍💻 توسعه و مشارکت

### دستورات مفید

```bash
# نصب وابستگی‌ها
npm install

# اجرا در حالت توسعه (با Hot-Reload)
npm run start:dev

# ساخت پروژه
npm run build

# اجرا در حالت تولید
npm run start:prod

# ایجاد Migration
npx prisma migrate dev --name migration_name

# اعمال Migration در تولید
npx prisma migrate deploy

# اجرای Seed
npm run seed

# باز کردن Prisma Studio
npx prisma studio
```

---

## 📝 یادداشت‌های فنی

### نکات امنیتی

- **JWT_SECRET** باید حداقل ۳۲ کاراکتر باشد
- **Rate Limiting** روی همه APIها اعمال می‌شود (۱۰۰ درخواست در ۶۰ ثانیه)
- **لاگین** محدود به ۵ درخواست در ۶۰ ثانیه است
- دسترسی‌ها در دو سطح **نقش** و **Permission** بررسی می‌شوند

### بهینه‌سازی عملکرد

- **ایندکس‌ها** روی فیلدهای پرکاربرد اضافه شده‌اند
- **کش** برای دسترسی‌های هر نقش (TTL: ۱۰ دقیقه)
- **صفحه‌بندی** برای تمام لیست‌ها (پیش‌فرض ۲۰ آیتم)

---

**ساخته‌شده با ❤️ برای تیم فروش IAM**