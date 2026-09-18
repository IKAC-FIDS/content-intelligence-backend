import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as XLSX from 'xlsx';
import { ImportResultDto } from './dto/import-result.dto';

@Injectable()
export class ImportService {
  constructor(private prisma: PrismaService) {}

  async importSAMList(
    fileBuffer: Buffer,
    userId: string,
  ): Promise<ImportResultDto> {
    // ۱. خواندن فایل اکسل
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data: any[] = XLSX.utils.sheet_to_json(sheet);

    if (!data || data.length === 0) {
      throw new BadRequestException('فایل اکسل خالی است یا فرمت آن صحیح نیست');
    }

    const result: ImportResultDto = {
      totalRows: data.length,
      successful: 0,
      failed: 0,
      errors: [],
      summary: {
        companiesCreated: 0,
        peopleCreated: 0,
      },
    };

    // ۲. پردازش هر ردیف
    for (let index = 0; index < data.length; index++) {
      const row = data[index];
      const rowNumber = index + 2; // +2 چون سطر اول هدر است و اندیس از ۰ شروع می‌شود

      try {
        await this.processRow(row, userId);
        result.successful++;
        result.summary.companiesCreated++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          row: rowNumber,
          message: error.message || 'خطای ناشناخته',
        });
      }
    }

    return result;
  }

  private async processRow(row: any, userId: string) {
    // ستون‌های مورد انتظار در فایل اکسل
    const legalName = row['نام شرکت'] || row['legalName'] || row['نام'];
    const brandName = row['نام تجاری'] || row['brandName'];
    const industry = row['صنعت'] || row['industry'];
    const website = row['وبسایت'] || row['website'];
    const headOfficeCity = row['شهر'] || row['headOfficeCity'] || row['شهر دفتر مرکزی'];
    const priority = row['اولویت'] || row['priority'] || 'MEDIUM';
    const source = 'SAM_IMPORT';

    // اطلاعات مخاطب (اختیاری)
    const personFullName = row['نام مخاطب'] || row['personName'] || row['نام کامل'];
    const personTitle = row['سمت'] || row['title'];
    const personEmail = row['ایمیل'] || row['email'];
    
    // ✅ تبدیل phone به String (حل مشکل نوع داده)
    let personPhone = row['تلفن'] || row['phone'];
    if (personPhone !== undefined && personPhone !== null) {
      personPhone = String(personPhone);
    }
    
    const personaTag = row['نقش'] || row['personaTag'];

    if (!legalName) {
      throw new Error('نام شرکت الزامی است');
    }

    // ۱. ایجاد شرکت
    const company = await this.prisma.company.create({
      data: {
        legalName,
        brandName,
        industry,
        website,
        headOfficeCity,
        priority: this.mapPriority(priority),
        source,
        ownerId: userId,
      },
    });

    // ۲. ایجاد مخاطب (اگر اطلاعات وجود داشته باشد)
    if (personFullName) {
      await this.prisma.person.create({
        data: {
          companyId: company.id,
          fullName: personFullName,
          title: personTitle,
          email: personEmail,
          phone: personPhone, // ✅ حالا String است
          personaTag: personaTag,
          isPrimaryContact: true,
        },
      });
      // به‌روزرسانی آمار
      // این بخش در حلقه اصلی انجام می‌شود، اما برای دقت می‌توان اینجا هم مقداردهی کرد
    }

    return company;
  }

  private mapPriority(priority: string): 'LOW' | 'MEDIUM' | 'HIGH' | 'STRATEGIC' {
    const normalized = priority?.toLowerCase() || 'medium';
    if (normalized.includes('strategic') || normalized.includes('استراتژیک')) {
      return 'STRATEGIC';
    }
    if (normalized.includes('high') || normalized.includes('بالا')) {
      return 'HIGH';
    }
    if (normalized.includes('low') || normalized.includes('پایین')) {
      return 'LOW';
    }
    return 'MEDIUM';
  }
}