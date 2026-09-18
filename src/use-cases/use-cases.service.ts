import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUseCaseDto } from './dto/create-use-case.dto';
import { UpdateUseCaseDto } from './dto/update-use-case.dto';

@Injectable()
export class UseCasesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUseCaseDto) {
    return this.prisma.useCase.create({
      data: {
        title: dto.title,
        description: dto.description,
        category: dto.category,
      },
    });
  }

  async findAll() {
    return this.prisma.useCase.findMany({
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
    const useCase = await this.prisma.useCase.findUnique({
      where: { id },
      include: {
        industries: {
          include: {
            industry: true,
          },
        },
      },
    });
    if (!useCase) {
      throw new NotFoundException('Use Case پیدا نشد');
    }
    return useCase;
  }

  async update(id: string, dto: UpdateUseCaseDto) {
    await this.findOne(id); // بررسی وجود
    return this.prisma.useCase.update({
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
    return this.prisma.useCase.delete({ where: { id } });
  }
}