export const LOOKUP_GROUPS = [
  'teams',
  'departments',
  'job-titles',
  'seniority-levels',
  'persona-roles',
  'persona-tags',
  'opportunity-sources',
  'contact-types',
  'activity-types',
  'person-social-platforms',
  'company-sources',
  'meeting-types',
] as const;

export type LookupGroup = (typeof LOOKUP_GROUPS)[number];
