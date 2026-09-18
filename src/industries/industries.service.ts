import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIndustryDto } from './dto/create-industry.dto';
import { UpdateIndustryDto } from './dto/update-industry.dto';

@Injectable()
export class IndustriesService {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // ۱. ایجاد صنعت جدید
  // ============================================================
  async create(dto: CreateIndustryDto) {
    // بررسی وجود نام تکراری
    const existing = await this.prisma.industry.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('صنعتی با این نام قبلاً وجود دارد');
    }

    return this.prisma.industry.create({
      data: {
        name: dto.name,
        description: dto.description,
        painPoints: {
          create: dto.painPointIds?.map((id) => ({ painPointId: id })) || [],
        },
        useCases: {
          create: dto.useCaseIds?.map((id) => ({ useCaseId: id })) || [],
        },
      },
      include: {
        painPoints: { include: { painPoint: true } },
        useCases: { include: { useCase: true } },
      },
    });
  }

  // ============================================================
  // ۲. دریافت لیست همه صنایع
  // ============================================================
  async findAll() {
    return this.prisma.industry.findMany({
      orderBy: { name: 'asc' },
      include: {
        painPoints: { include: { painPoint: true } },
        useCases: { include: { useCase: true } },
      },
    });
  }

  // ============================================================
  // ۳. دریافت یک صنعت
  // ============================================================
  async findOne(id: string) {
    const industry = await this.prisma.industry.findUnique({
      where: { id },
      include: {
        painPoints: { include: { painPoint: true } },
        useCases: { include: { useCase: true } },
      },
    });
    if (!industry) {
      throw new NotFoundException('صنعت پیدا نشد');
    }
    return industry;
  }

  // ============================================================
  // ۴. ویرایش صنعت
  // ============================================================
  async update(id: string, dto: UpdateIndustryDto) {
    await this.findOne(id);

    // اگر نام تغییر کرده، بررسی تکراری نبودن
    if (dto.name) {
      const existing = await this.prisma.industry.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('صنعتی با این نام قبلاً وجود دارد');
      }
    }

    const updateData: any = {
      name: dto.name,
      description: dto.description,
    };

    // مدیریت ارتباطات Many-to-Many (بازنویسی کامل)
    if (dto.painPointIds !== undefined) {
      updateData.painPoints = {
        deleteMany: {},
        create: dto.painPointIds.map((id) => ({ painPointId: id })),
      };
    }

    if (dto.useCaseIds !== undefined) {
      updateData.useCases = {
        deleteMany: {},
        create: dto.useCaseIds.map((id) => ({ useCaseId: id })),
      };
    }

    return this.prisma.industry.update({
      where: { id },
      data: updateData,
      include: {
        painPoints: { include: { painPoint: true } },
        useCases: { include: { useCase: true } },
      },
    });
  }

  // ============================================================
  // ۵. حذف صنعت
  // ============================================================
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.industry.delete({ where: { id } });
  }
}