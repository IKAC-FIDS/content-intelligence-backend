-- Separate person domain lookups for department, job title, and sales persona role.
-- This migration is intentionally non-destructive: old personaTag values are preserved.

WITH lookup_seed("group", "code", "label", "sortOrder") AS (
  VALUES
    ('departments', 'IT', 'فناوری اطلاعات', 10),
    ('departments', 'SECURITY', 'امنیت', 20),
    ('departments', 'INFRASTRUCTURE', 'زیرساخت', 30),
    ('departments', 'FINANCE', 'مالی', 40),
    ('departments', 'HR', 'منابع انسانی', 50),
    ('departments', 'PROCUREMENT', 'تدارکات', 60),
    ('departments', 'OPERATIONS', 'عملیات', 70),
    ('departments', 'MANAGEMENT', 'مدیریت', 80),

    ('job-titles', 'CEO', 'مدیرعامل', 10),
    ('job-titles', 'CFO', 'مدیر مالی', 20),
    ('job-titles', 'CIO', 'مدیر فناوری اطلاعات', 30),
    ('job-titles', 'CTO', 'مدیر فنی', 40),
    ('job-titles', 'CISO', 'مدیر امنیت اطلاعات', 50),
    ('job-titles', 'IT_MANAGER', 'مدیر IT', 60),
    ('job-titles', 'DIGITAL_TRANSFORMATION_MANAGER', 'مدیر تحول دیجیتال', 70),
    ('job-titles', 'PROCUREMENT_MANAGER', 'مدیر تدارکات', 80),
    ('job-titles', 'SECURITY_MANAGER', 'مدیر حراست', 90),
    ('job-titles', 'INFRASTRUCTURE_MANAGER', 'مدیر زیرساخت', 100),
    ('job-titles', 'HR_MANAGER', 'مدیر منابع انسانی', 110),
    ('job-titles', 'OPERATIONS_MANAGER', 'مدیر عملیات', 120),

    ('seniority-levels', 'C_LEVEL', 'مدیر ارشد', 10),
    ('seniority-levels', 'VP', 'معاون', 20),
    ('seniority-levels', 'DIRECTOR', 'مدیر', 30),
    ('seniority-levels', 'MANAGER', 'سرپرست / مدیر میانی', 40),
    ('seniority-levels', 'EXPERT', 'کارشناس', 50),
    ('seniority-levels', 'UNKNOWN', 'نامشخص', 60),

    ('persona-roles', 'FINAL_DECISION_MAKER', 'تصمیم‌گیر نهایی', 10),
    ('persona-roles', 'TECHNICAL_DECISION_MAKER', 'تصمیم‌گیر فنی', 20),
    ('persona-roles', 'ECONOMIC_BUYER', 'تصمیم‌گیر اقتصادی', 30),
    ('persona-roles', 'INFLUENCER', 'اثرگذار', 40),
    ('persona-roles', 'CHAMPION', 'حامی داخلی', 50),
    ('persona-roles', 'BLOCKER', 'مخالف / مانع', 60),
    ('persona-roles', 'END_USER', 'کاربر نهایی', 70),
    ('persona-roles', 'PROCUREMENT_ROLE', 'خرید / تدارکات', 80),
    ('persona-roles', 'LEGAL_REVIEWER', 'حقوقی / بررسی قرارداد', 90),
    ('persona-roles', 'UNKNOWN', 'نامشخص', 100),

    ('persona-tags', 'FINAL_DECISION_MAKER', 'تصمیم‌گیر نهایی', 10),
    ('persona-tags', 'TECHNICAL_DECISION_MAKER', 'تصمیم‌گیر فنی', 20),
    ('persona-tags', 'ECONOMIC_BUYER', 'تصمیم‌گیر اقتصادی', 30),
    ('persona-tags', 'INFLUENCER', 'اثرگذار', 40),
    ('persona-tags', 'CHAMPION', 'حامی داخلی', 50),
    ('persona-tags', 'BLOCKER', 'مخالف / مانع', 60),
    ('persona-tags', 'END_USER', 'کاربر نهایی', 70),
    ('persona-tags', 'PROCUREMENT_ROLE', 'خرید / تدارکات', 80),
    ('persona-tags', 'LEGAL_REVIEWER', 'حقوقی / بررسی قرارداد', 90),
    ('persona-tags', 'UNKNOWN', 'نامشخص', 100)
)
INSERT INTO "lookup_options" ("id", "group", "code", "label", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT 'lookup_' || md5("group" || ':' || "code"), "group", "code", "label", "sortOrder", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM lookup_seed
ON CONFLICT ("group", "code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

WITH job_title_values(value) AS (
  VALUES
    ('CEO'),
    ('CFO'),
    ('CIO'),
    ('CTO'),
    ('CISO'),
    ('IT_MANAGER'),
    ('DIGITAL_TRANSFORMATION_MANAGER'),
    ('PROCUREMENT_MANAGER'),
    ('SECURITY_MANAGER'),
    ('INFRASTRUCTURE_MANAGER'),
    ('HR_MANAGER'),
    ('OPERATIONS_MANAGER'),
    ('IT Manager'),
    ('Digital Transformation Manager'),
    ('Procurement Manager'),
    ('Security Manager'),
    ('Infrastructure Manager'),
    ('HR Manager'),
    ('Operations Manager'),
    ('مدیرعامل'),
    ('مدیر مالی'),
    ('مدیر فناوری اطلاعات'),
    ('مدیر فنی'),
    ('مدیر امنیت اطلاعات'),
    ('مدیر IT'),
    ('مدیر تحول دیجیتال'),
    ('مدیر تدارکات'),
    ('مدیر حراست'),
    ('مدیر زیرساخت'),
    ('مدیر منابع انسانی'),
    ('مدیر عملیات')
)
UPDATE "people"
SET "title" = "personaTag",
    "updatedAt" = CURRENT_TIMESTAMP
WHERE ("title" IS NULL OR btrim("title") = '')
  AND "personaTag" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM job_title_values
    WHERE lower(job_title_values.value) = lower(btrim("people"."personaTag"))
  );
