import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePainPointDto } from './dto/create-pain-point.dto';
import { UpdatePainPointDto } from './dto/update-pain-point.dto';

@Injectable()
export class PainPointsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreatePainPointDto) {
    return this.prisma.painPoint.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
      },
    });
  }

  async findAll() {
    return this.prisma.painPoint.findMany({
      orderBy: { title: 'asc' },
      include: {
        industries: {
          include: {
            industry: true,
          },
        },
      },
    });
  }

  async findOne(id: string) {
    const painPoint = await this.prisma.painPoint.findUnique({
      where: { id },
      include: {
        industries: {
          include: {
            industry: true,
          },
        },
      },
    });
    if (!painPoint) {
      throw new NotFoundException('Pain Point پیدا نشد');
    }
    return painPoint;
  }

  async update(id: string, dto: UpdatePainPointDto) {
    await this.findOne(id); // بررسی وجود
    return this.prisma.painPoint.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.painPoint.delete({ where: { id } });
  }
}