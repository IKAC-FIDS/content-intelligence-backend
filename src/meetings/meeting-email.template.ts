import { MeetingMode } from '@prisma/client';

export interface MeetingEmailTemplateInput {
  recipientName?: string | null;
  title: string;
  companyName: string;
  startAt: Date;
  endAt: Date;
  mode: MeetingMode;
  location?: string | null;
  meetingUrl?: string | null;
  agenda?: string | null;
  description?: string | null;
  locale?: string | null;
  timeZone?: string | null;
}

const modeLabels: Record<MeetingMode, string> = {
  IN_PERSON: 'حضوری',
  ONLINE: 'آنلاین',
  HYBRID: 'ترکیبی',
};

export function meetingAssigneeEmail(input: MeetingEmailTemplateInput) {
  const locale = input.locale || 'fa-IR';
  const dateTime = new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: input.timeZone || 'UTC',
    calendar: 'persian',
  });
  const fields = [
    ['موضوع جلسه', input.title],
    ['شرکت', input.companyName],
    ['زمان شروع', dateTime.format(input.startAt)],
    ['زمان پایان', dateTime.format(input.endAt)],
    ['نحوه برگزاری', modeLabels[input.mode]],
    ['محل جلسه', input.location],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const greeting = `سلام ${input.recipientName?.trim() || 'همکار گرامی'}`;
  const textSections = [
    greeting,
    '',
    'جلسه زیر برای شما ثبت شده است:',
    '',
    ...fields.map(([label, value]) => `${label}: ${value}`),
    input.agenda ? `\nدستور جلسه:\n${input.agenda}` : '',
    input.description ? `\nتوضیحات:\n${input.description}` : '',
    input.meetingUrl ? `\nورود به جلسه:\n${input.meetingUrl}` : '',
    '',
    'این پیام به‌صورت خودکار از سامانه مرکز عملیات نشانه ارسال شده است.',
  ].filter((value) => value !== '');

  const rows = fields
    .map(([label, value]) => `<tr><td style="padding:8px;color:#64748b;white-space:nowrap">${escapeHtml(label)}</td><td style="padding:8px;font-weight:600">${escapeHtml(value)}</td></tr>`)
    .join('');
  const optionalSection = (title: string, value?: string | null) => value?.trim()
    ? `<div style="margin-top:20px"><strong>${escapeHtml(title)}</strong><p style="white-space:pre-wrap;line-height:1.9">${escapeHtml(value)}</p></div>`
    : '';
  const cta = input.meetingUrl
    ? `<p style="margin:24px 0"><a href="${escapeHtml(input.meetingUrl)}" style="display:inline-block;padding:11px 20px;border-radius:10px;background:#2563eb;color:#fff;text-decoration:none">ورود به جلسه</a></p>`
    : '';

  return {
    subject: `اعلان جلسه | ${input.title}`,
    text: textSections.join('\n'),
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:640px;margin:auto;color:#0f172a"><div style="padding:24px;border:1px solid #e2e8f0;border-radius:16px"><p>${escapeHtml(greeting)}</p><p>جلسه زیر برای شما ثبت شده است:</p><table style="width:100%;border-collapse:collapse">${rows}</table>${optionalSection('دستور جلسه', input.agenda)}${optionalSection('توضیحات', input.description)}${cta}<p style="margin-top:28px;padding-top:16px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px">این پیام به‌صورت خودکار از سامانه مرکز عملیات نشانه ارسال شده است.</p></div></div>`,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character] || character);
}
