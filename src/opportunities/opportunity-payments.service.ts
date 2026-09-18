import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CurrentUserPayload } from '../common/decorators/current-user.decorator';
import { userTeamScopeWhere } from '../common/tenant/team-scope.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOpportunityPaymentDto } from './dto/create-opportunity-payment.dto';
import { FindOpportunityPaymentsDto } from './dto/find-opportunity-payments.dto';
import { MarkPaymentPaidDto } from './dto/mark-payment-paid.dto';
import { UpdateOpportunityPaymentDto } from './dto/update-opportunity-payment.dto';
import { parseApiDate, parseApiDateRange } from '../common/dates/api-date.util';

const paymentInclude = {
  commercialDocument: {
    select: {
      id: true,
      type: true,
      status: true,
      number: true,
      title: true,
      amount: true,
      currency: true,
    },
  },
} satisfies Prisma.OpportunityPaymentInclude;

@Injectable()
export class OpportunityPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(
    opportunityId: string,
    query: FindOpportunityPaymentsDto,
    user: CurrentUserPayload,
  ) {
    await this.getOpportunityForView(opportunityId, user);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.OpportunityPaymentWhereInput = {
      opportunityId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.commercialDocumentId) {
      where.commercialDocumentId = query.commercialDocumentId;
    }

    const dueRange = parseApiDateRange(query.dueFrom, query.dueTo, 'dueFrom', 'dueTo');
    if (dueRange) where.dueDate = dueRange;

    const [data, total] = await Promise.all([
      this.prisma.opportunityPayment.findMany({
        where,
        include: paymentInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.opportunityPayment.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
      },
    };
  }

  async findOne(
    opportunityId: string,
    paymentId: string,
    user: CurrentUserPayload,
  ) {
    await this.getOpportunityForView(opportunityId, user);

    const payment = await this.prisma.opportunityPayment.findFirst({
      where: {
        id: paymentId,
        opportunityId,
      },
      include: paymentInclude,
    });

    if (!payment) {
      throw new NotFoundException('پرداخت پیدا نشد');
    }

    return payment;
  }

  async create(
    opportunityId: string,
    dto: CreateOpportunityPaymentDto,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(opportunityId, user);

    if (dto.commercialDocumentId) {
      await this.assertDocumentBelongsToOpportunity(
        opportunity.id,
        dto.commercialDocumentId,
      );
    }

    const payment = await this.prisma.opportunityPayment.create({
      data: {
        opportunityId: opportunity.id,
        commercialDocumentId: dto.commercialDocumentId,
        status: dto.status ?? PaymentStatus.PENDING,
        amount: this.toPositiveDecimal(dto.amount, 'amount'),
        currency: dto.currency?.trim().toUpperCase() || 'IRR',
        dueDate: dto.dueDate ? parseApiDate(dto.dueDate, 'dueDate') : undefined,
        paidAt: dto.paidAt ? parseApiDate(dto.paidAt, 'paidAt') : undefined,
        method: dto.method,
        referenceNumber: dto.referenceNumber?.trim() || undefined,
        description: dto.description?.trim() || undefined,
        notes: dto.notes?.trim() || undefined,
        createdById: user.userId,
        updatedById: user.userId,
      },
      include: paymentInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity-payment',
      entityId: payment.id,
      action: 'opportunity.payment_created',
      after: payment,
      metadata: {
        opportunityId: opportunity.id,
        commercialDocumentId: payment.commercialDocumentId,
      },
    });

    return payment;
  }

  async update(
    opportunityId: string,
    paymentId: string,
    dto: UpdateOpportunityPaymentDto,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(opportunityId, user);

    const current = await this.prisma.opportunityPayment.findFirst({
      where: {
        id: paymentId,
        opportunityId,
      },
      include: paymentInclude,
    });

    if (!current) {
      throw new NotFoundException('پرداخت پیدا نشد');
    }

    if (dto.commercialDocumentId) {
      await this.assertDocumentBelongsToOpportunity(
        opportunity.id,
        dto.commercialDocumentId,
      );
    }

    const data: Prisma.OpportunityPaymentUncheckedUpdateInput = {
      updatedById: user.userId,
    };

    if (dto.commercialDocumentId !== undefined) {
      data.commercialDocumentId = dto.commercialDocumentId || null;
    }

    if (dto.status !== undefined) data.status = dto.status;
    if (dto.amount !== undefined) data.amount = this.toPositiveDecimal(dto.amount, 'amount');
    if (dto.currency !== undefined) data.currency = dto.currency.trim().toUpperCase() || 'IRR';
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? parseApiDate(dto.dueDate, 'dueDate') : null;
    if (dto.paidAt !== undefined) data.paidAt = dto.paidAt ? parseApiDate(dto.paidAt, 'paidAt') : null;
    if (dto.method !== undefined) data.method = dto.method;
    if (dto.referenceNumber !== undefined) data.referenceNumber = dto.referenceNumber?.trim() || null;
    if (dto.description !== undefined) data.description = dto.description?.trim() || null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;

    const updated = await this.prisma.opportunityPayment.update({
      where: { id: paymentId },
      data,
      include: paymentInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity-payment',
      entityId: paymentId,
      action: 'opportunity.payment_updated',
      before: current,
      after: updated,
      metadata: {
        opportunityId: opportunity.id,
      },
    });

    return updated;
  }

  async markPaid(
    opportunityId: string,
    paymentId: string,
    dto: MarkPaymentPaidDto,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(opportunityId, user);

    const current = await this.prisma.opportunityPayment.findFirst({
      where: {
        id: paymentId,
        opportunityId,
      },
      include: paymentInclude,
    });

    if (!current) {
      throw new NotFoundException('پرداخت پیدا نشد');
    }

    const updated = await this.prisma.opportunityPayment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.PAID,
        paidAt: dto.paidAt ? parseApiDate(dto.paidAt, 'paidAt') : new Date(),
        method: dto.method ?? current.method,
        referenceNumber: dto.referenceNumber?.trim() || current.referenceNumber,
        notes: dto.notes?.trim() || current.notes,
        updatedById: user.userId,
      },
      include: paymentInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity-payment',
      entityId: paymentId,
      action: 'opportunity.payment_marked_paid',
      before: {
        status: current.status,
        paidAt: current.paidAt,
      },
      after: {
        status: updated.status,
        paidAt: updated.paidAt,
      },
      metadata: {
        opportunityId: opportunity.id,
        referenceNumber: updated.referenceNumber,
      },
    });

    return updated;
  }

  async cancel(
    opportunityId: string,
    paymentId: string,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(opportunityId, user);

    const current = await this.prisma.opportunityPayment.findFirst({
      where: {
        id: paymentId,
        opportunityId,
      },
      include: paymentInclude,
    });

    if (!current) {
      throw new NotFoundException('پرداخت پیدا نشد');
    }

    const updated = await this.prisma.opportunityPayment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.CANCELLED,
        updatedById: user.userId,
      },
      include: paymentInclude,
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity-payment',
      entityId: paymentId,
      action: 'opportunity.payment_cancelled',
      before: {
        status: current.status,
      },
      after: {
        status: updated.status,
      },
      metadata: {
        opportunityId: opportunity.id,
      },
    });

    return updated;
  }

  async remove(
    opportunityId: string,
    paymentId: string,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.getOpportunityForMutation(opportunityId, user);

    const current = await this.prisma.opportunityPayment.findFirst({
      where: {
        id: paymentId,
        opportunityId,
      },
    });

    if (!current) {
      throw new NotFoundException('پرداخت پیدا نشد');
    }

    const deleted = await this.prisma.opportunityPayment.delete({
      where: { id: paymentId },
    });

    await this.audit.record({
      actorId: user.userId,
      entityType: 'opportunity-payment',
      entityId: paymentId,
      action: 'opportunity.payment_deleted',
      before: current,
      metadata: {
        opportunityId: opportunity.id,
      },
    });

    return deleted;
  }

  private async assertDocumentBelongsToOpportunity(
    opportunityId: string,
    commercialDocumentId: string,
  ) {
    const document = await this.prisma.opportunityCommercialDocument.findFirst({
      where: {
        id: commercialDocumentId,
        opportunityId,
      },
    });

    if (!document) {
      throw new BadRequestException('سند تجاری انتخاب‌شده متعلق به این فرصت فروش نیست');
    }
  }

  private toPositiveDecimal(value: number, fieldName: string) {
    const decimal = new Prisma.Decimal(value);

    if (decimal.lessThanOrEqualTo(0)) {
      throw new BadRequestException(`${fieldName} باید بزرگ‌تر از صفر باشد`);
    }

    return decimal;
  }

  private async getOpportunityForView(
    opportunityId: string,
    user: CurrentUserPayload,
  ) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: {
        AND: [
          { id: opportunityId },
          this.opportunityScopeWhere(user),
        ],
      },
    });

    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }

    return opportunity;
  }

  private async getOpportunityForMutation(
    opportunityId: string,
    user: CurrentUserPayload,
  ) {
    if (user.role === UserRole.BOARDS) {
      throw new ForbiddenException('Opportunity is read-only for this role');
    }

    const opportunity = await this.getOpportunityForView(opportunityId, user);

    if (opportunity.archivedAt) {
      throw new BadRequestException('Archived opportunities cannot be changed');
    }

    return opportunity;
  }

  private opportunityScopeWhere(
    user: CurrentUserPayload,
  ): Prisma.OpportunityWhereInput {
    if (user.role === UserRole.ADMIN || user.role === UserRole.BOARDS) {
      return {};
    }

    if (user.role === UserRole.MANAGER) {
      return user.teamId || user.team
        ? { company: { owner: userTeamScopeWhere(user) } }
        : { id: { in: [] } };
    }

    return {
      OR: [
        { ownerId: user.userId },
        { company: { ownerId: user.userId } },
      ],
    };
  }
}
