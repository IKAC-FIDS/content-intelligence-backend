import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertCallCardDto } from './dto/upsert-call-card.dto';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { CompanyAccessService } from '../companies/company-access.service';

@Injectable()
export class CallCardsService {
  constructor(private prisma: PrismaService, private companyAccess: CompanyAccessService) {}

  // ============================================================
  // متد کمکی: بررسی دسترسی به شرکت
  // ============================================================
  private async validateCompanyAccess(companyId: string, user: CurrentUserPayload) {
    await this.companyAccess.assertCompanyMutable(companyId, user);
  }

  // ============================================================
  // ۱. دریافت Call Card یک شرکت (با بررسی دسترسی)
  // ============================================================
  async findByCompany(companyId: string, user: CurrentUserPayload) {
    await this.validateCompanyAccess(companyId, user);
    return this.prisma.callCard.findUnique({ where: { companyId } });
  }

  // ============================================================
  // ۲. ایجاد/بروزرسانی Call Card (با بررسی دسترسی)
  // ============================================================
  async upsert(companyId: string, dto: UpsertCallCardDto, user: CurrentUserPayload) {
    await this.validateCompanyAccess(companyId, user);

    const data: any = { ...dto };
    if (data.discoveryQs) {
      data.discoveryQs = data.discoveryQs as any;
    }
    if (data.objections) {
      data.objections = data.objections as any;
    }

    return this.prisma.callCard.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: { ...data },
    });
  }

  // ============================================================
  // ۳. دریافت پیشنهادات خودکار (با استفاده از مدل جدید Industry)
  // ============================================================
  async suggest(companyId: string, user: CurrentUserPayload) {
    await this.validateCompanyAccess(companyId, user);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: { people: true },
    });
    if (!company) throw new NotFoundException('شرکت پیدا نشد');

    const personaTags = company.people.map((p) => p.personaTag).filter(Boolean) as string[];

    const personaMatches = personaTags.length
      ? await this.prisma.personaLibrary.findMany({
          where: { titlePattern: { in: personaTags } },
        })
      : [];

    // ✅ استفاده از مدل جدید Industry
    const industryData = company.industry
      ? await this.prisma.industry.findFirst({
          where: { name: company.industry },
          include: {
            painPoints: {
              include: { painPoint: true },
              orderBy: { priority: 'asc' },
            },
            useCases: {
              include: { useCase: true },
              orderBy: { priority: 'asc' },
            },
          },
        })
      : null;

    return {
      suggestedPainPoints: [
        ...personaMatches.map((m) => m.defaultPainPoint).filter(Boolean),
        ...(industryData?.painPoints.map((p) => p.painPoint.title) || []),
      ].filter(Boolean),
      suggestedUseCases: [
        ...personaMatches.map((m) => m.defaultUseCase).filter(Boolean),
        ...(industryData?.useCases.map((u) => u.useCase.title) || []),
      ].filter(Boolean),
      matchedPersonas: personaMatches,
      matchedIndustry: industryData,
    };
  }
}
