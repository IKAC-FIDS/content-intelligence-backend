import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // ---------- اجباری ----------
  DATABASE_URL: Joi.string()
    .required()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .messages({
      'any.required': 'DATABASE_URL اجباری است',
      'string.uri': 'DATABASE_URL باید یک URI معتبر با پروتکل postgresql یا postgres باشد',
    }),

  JWT_SECRET: Joi.string()
    .required()
    .min(32)
    .messages({
      'any.required': 'JWT_SECRET اجباری است',
      'string.min': 'JWT_SECRET باید حداقل ۳۲ کاراکتر باشد',
    }),

  // ---------- اختیاری با مقدار پیش‌فرض ----------
  PORT: Joi.number()
    .default(3000)
    .integer()
    .min(1)
    .max(65535)
    .messages({
      'number.base': 'PORT باید یک عدد باشد',
      'number.integer': 'PORT باید عدد صحیح باشد',
      'number.min': 'PORT باید حداقل ۱ باشد',
      'number.max': 'PORT باید حداکثر ۶۵۵۳۵ باشد',
    }),

  JWT_EXPIRES_IN: Joi.string()
      .default('15m')
      .pattern(/^\d+[smhdw]$/)
      .messages({
        'string.pattern.base': 'JWT_EXPIRES_IN باید فرمت زمان معتبر داشته باشد (مثلاً 15m, 8h, 7d)',
      }),

    REFRESH_TOKEN_EXPIRES_IN: Joi.string()
      .default('30d')
      .pattern(/^\d+[smhdw]$/)
      .messages({
        'string.pattern.base': 'REFRESH_TOKEN_EXPIRES_IN باید فرمت زمان معتبر داشته باشد (مثلاً 30d, 12h, 4w)',
      }),

    REFRESH_TOKEN_COOKIE_SECURE: Joi.boolean()
      .truthy('true')
      .falsy('false')
      .optional(),

    REFRESH_TOKEN_COOKIE_SAME_SITE: Joi.string()
      .valid('lax', 'strict', 'none')
      .optional(),

    REFRESH_TOKEN_COOKIE_PATH: Joi.string()
      .pattern(/^\//)
      .default('/api/auth'),

  NODE_ENV: Joi.string()
      .valid('development', 'production', 'test')
      .default('development')
      .messages({
        'any.only': 'NODE_ENV باید یکی از مقادیر development, production, test باشد',
      }),

    APP_VERSION: Joi.string()
      .optional()
      .messages({
        'string.base': 'APP_VERSION باید رشته باشد',
      }),

    APP_COMMIT_SHA: Joi.string()
      .optional()
      .messages({
        'string.base': 'APP_COMMIT_SHA باید رشته باشد',
      }),

    APP_BUILD_TIME: Joi.string()
      .optional()
      .messages({
        'string.base': 'APP_BUILD_TIME باید رشته باشد',
      }),

  // ---------- CORS ----------
  CORS_ORIGINS: Joi.string()
    .default('http://localhost:5173')
    .messages({
      'string.base': 'CORS_ORIGINS باید یک رشته شامل originهای مجاز باشد',
    }),

  CORS_CREDENTIALS: Joi.boolean()
      .truthy('true')
      .falsy('false')
      .default(true)
      .messages({
        'boolean.base': 'CORS_CREDENTIALS باید true یا false باشد',
      }),

  // ---------- SSO ----------
  SSO_SECRET_ENCRYPTION_KEY: Joi.string()
      .min(32)
      .optional()
      .messages({
        'string.base': 'SSO_SECRET_ENCRYPTION_KEY باید رشته باشد',
        'string.min': 'SSO_SECRET_ENCRYPTION_KEY باید حداقل ۳۲ کاراکتر باشد',
      }),

    SSO_TICKET_TTL: Joi.number()
      .default(120)
      .integer()
      .min(30)
      .messages({
        'number.base': 'SSO_TICKET_TTL باید یک عدد باشد',
        'number.integer': 'SSO_TICKET_TTL باید عدد صحیح باشد',
        'number.min': 'SSO_TICKET_TTL باید حداقل ۳۰ ثانیه باشد',
      }),

    FRONTEND_SSO_CALLBACK_URL: Joi.string()
      .uri()
      .default('http://localhost:5173/auth/sso/callback')
      .messages({
        'string.uri': 'FRONTEND_SSO_CALLBACK_URL باید یک URL معتبر باشد',
      }),

    BACKEND_PUBLIC_URL: Joi.string()
      .uri()
      .default('http://localhost:3000')
      .messages({
        'string.uri': 'BACKEND_PUBLIC_URL باید یک URL معتبر باشد',
      }),

  // ---------- Rate Limiting (اختیاری) ----------
  THROTTLE_TTL: Joi.number()
    .default(60000)
    .integer()
    .min(1000)
    .messages({
      'number.base': 'THROTTLE_TTL باید یک عدد باشد',
      'number.min': 'THROTTLE_TTL باید حداقل ۱۰۰۰ (۱ ثانیه) باشد',
    }),

  THROTTLE_LIMIT: Joi.number()
    .default(100)
    .integer()
    .min(1)
    .messages({
      'number.base': 'THROTTLE_LIMIT باید یک عدد باشد',
      'number.min': 'THROTTLE_LIMIT باید حداقل ۱ باشد',
    }),

 ATTACHMENT_STORAGE_DRIVER: Joi.string()
    .valid('local', 'minio')
    .default('local')
    .messages({
      'any.only': 'ATTACHMENT_STORAGE_DRIVER باید یکی از مقادیر local یا minio باشد',
      'string.base': 'ATTACHMENT_STORAGE_DRIVER باید رشته باشد',
    }),

  ATTACHMENT_STORAGE_ROOT: Joi.string()
    .default('storage/attachments')
    .messages({
      'string.base': 'ATTACHMENT_STORAGE_ROOT باید رشته باشد',
    }),

  MAX_ATTACHMENT_SIZE_BYTES: Joi.number()
    .default(26214400)
    .integer()
    .min(1024)
    .messages({
      'number.base': 'MAX_ATTACHMENT_SIZE_BYTES باید عدد باشد',
      'number.min': 'MAX_ATTACHMENT_SIZE_BYTES باید حداقل ۱۰۲۴ بایت باشد',
    }),

  ALLOWED_ATTACHMENT_MIME_TYPES: Joi.string()
    .default(
      [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain',
        'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ].join(','),
    )
    .messages({
      'string.base': 'ALLOWED_ATTACHMENT_MIME_TYPES باید رشته باشد',
    }),

  S3_ENDPOINT: Joi.string()
    .uri()
    .optional()
    .messages({
      'string.uri': 'S3_ENDPOINT باید URL معتبر باشد',
    }),

  S3_REGION: Joi.string()
    .default('us-east-1')
    .messages({
      'string.base': 'S3_REGION باید رشته باشد',
    }),

  S3_BUCKET: Joi.string()
    .default('iam-crm-attachments')
    .messages({
      'string.base': 'S3_BUCKET باید رشته باشد',
    }),

  S3_ACCESS_KEY_ID: Joi.string()
    .optional()
    .messages({
      'string.base': 'S3_ACCESS_KEY_ID باید رشته باشد',
    }),

  S3_SECRET_ACCESS_KEY: Joi.string()
    .optional()
    .messages({
      'string.base': 'S3_SECRET_ACCESS_KEY باید رشته باشد',
    }),

  S3_FORCE_PATH_STYLE: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(true)
    .messages({
      'boolean.base': 'S3_FORCE_PATH_STYLE باید true یا false باشد',
    }),

  WEBAUTHN_RP_NAME: Joi.string().default('IAM CRM'),

  WEBAUTHN_RP_ID: Joi.string().default('localhost'),

  WEBAUTHN_ORIGIN: Joi.string().uri().default('http://localhost:5173'),
});
