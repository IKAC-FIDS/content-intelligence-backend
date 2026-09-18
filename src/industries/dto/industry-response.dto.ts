import { Industry, PainPoint, UseCase } from '@prisma/client';

export class IndustryResponseDto {
  id: string;
  name: string;
  description?: string;
  painPoints: PainPoint[];
  useCases: UseCase[];
  createdAt: Date;
  updatedAt: Date;
}