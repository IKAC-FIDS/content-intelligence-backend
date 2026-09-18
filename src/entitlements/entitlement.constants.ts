import { FeatureKey } from '@prisma/client';

export const FEATURE_METADATA: Readonly<Record<FeatureKey, { label: string }>> = {
  SSO: { label: 'Single sign-on' },
  PASSKEY: { label: 'Passkey authentication' },
  ADVANCED_RBAC: { label: 'Advanced tenant RBAC' },
  CUSTOM_DOMAINS: { label: 'Custom organization domains' },
  BRANDING: { label: 'Organization branding' },
  AUDIT: { label: 'Audit log' },
  REPORTING: { label: 'Advanced reporting' },
};
