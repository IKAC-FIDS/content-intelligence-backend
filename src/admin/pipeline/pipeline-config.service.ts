import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PipelineStage, Prisma, UserRole } from '@prisma/client';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStageDto } from './dto/create-stage.dto';
import { CreateTransitionDto } from './dto/create-transition.dto';
import { ReorderStagesDto } from './dto/reorder-stages.dto';
import { TERMINAL_TYPES, UpdateStageConfigDto } from './dto/update-stage-config.dto';
import { UpdateTransitionDto } from './dto/update-transition.dto';

const transitionInclude = {
  fromStage: { select: { id: true, code: true, label: true } },
  toStage: { select: { id: true, code: true, label: true } },
} satisfies Prisma.PipelineStageTransitionInclude;

@Injectable()
export class PipelineConfigService {
  constructor(private prisma: PrismaService, private audit: AuditLogService) {}

  getStages(activeOnly = false) {
    return this.prisma.pipelineStage.findMany({ where: activeOnly ? { isActive: true } : {}, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] });
  }

  async getStage(id: string) {
    const stage = await this.prisma.pipelineStage.findUnique({ where: { id } });
    if (!stage) throw new NotFoundException('Pipeline stage not found');
    return stage;
  }

  async createStage(dto: CreateStageDto, actorId?: string) {
    const code = this.normalizeCode(dto.code);
    this.validateTerminal(dto.isTerminal ?? false, dto.terminalType ?? 'NONE');
    if (dto.isDefault && (dto.isActive === false || dto.isTerminal)) throw new BadRequestException('Default stage must be active and non-terminal');
    const existing = await this.prisma.pipelineStage.findUnique({ where: { code } });
    if (existing) throw new ConflictException('Pipeline stage code already exists');
    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.pipelineStage.updateMany({ data: { isDefault: false } });
      return tx.pipelineStage.create({ data: { ...dto, code, terminalType: dto.terminalType ?? 'NONE' } });
    });
    await this.audit.record({ actorId, entityType: 'pipeline_stage', entityId: created.id, action: 'pipeline.stage_created', after: created });
    return created;
  }

  async updateStage(id: string, dto: UpdateStageConfigDto, actorId?: string) {
    const current = await this.getStage(id);
    const isActive = dto.isActive ?? current.isActive;
    const isTerminal = dto.isTerminal ?? current.isTerminal;
    const terminalType = dto.terminalType === undefined ? current.terminalType : dto.terminalType;
    const isDefault = dto.isDefault ?? current.isDefault;
    this.validateTerminal(isTerminal, terminalType ?? 'NONE');
    if (isDefault && (!isActive || isTerminal)) throw new BadRequestException('Default stage must be active and non-terminal');
    if (current.isActive && !current.isTerminal && (!isActive || isTerminal)) await this.assertAnotherActiveNonTerminal(id);
    if (dto.isActive === false) {
      const inUse = await this.prisma.opportunity.count({ where: { stageId: id, archivedAt: null } });
      if (inUse) throw new ConflictException(`Stage is used by ${inUse} active opportunities; use DELETE with replacementStageId`);
    }
    if (current.isDefault && dto.isDefault === false) throw new BadRequestException('Assign another default stage instead of clearing the only default');
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.pipelineStage.updateMany({ where: { NOT: { id } }, data: { isDefault: false } });
      return tx.pipelineStage.update({ where: { id }, data: dto });
    });
    await this.audit.record({ actorId, entityType: 'pipeline_stage', entityId: id, action: 'pipeline.stage_updated', before: current, after: updated });
    return updated;
  }

  async deactivateStage(id: string, replacementStageId: string | undefined, actorId?: string) {
    const current = await this.getStage(id);
    const activeOpportunities = await this.prisma.opportunity.findMany({ where: { stageId: id, archivedAt: null }, select: { id: true } });
    let replacement: PipelineStage | null = null;
    if (current.isDefault && !replacementStageId) throw new ConflictException('Default stage requires an active non-terminal replacement');
    if (replacementStageId) {
      if (replacementStageId === id) throw new BadRequestException('Replacement stage must be different');
      replacement = await this.getStage(replacementStageId);
      if (!replacement.isActive) throw new BadRequestException('Replacement stage must be active');
    }
    if (activeOpportunities.length && !replacement) throw new ConflictException(`Stage is used by ${activeOpportunities.length} active opportunities; replacementStageId is required`);
    if (current.isDefault && replacement?.isTerminal) throw new BadRequestException('Default replacement must be non-terminal');
    if (current.isActive && !current.isTerminal) await this.assertAnotherActiveNonTerminal(id);
    await this.prisma.$transaction(async (tx) => {
      if (replacement && activeOpportunities.length) {
        await tx.opportunity.updateMany({ where: { id: { in: activeOpportunities.map((item) => item.id) } }, data: { stageId: replacement.id, wonAt: replacement.terminalType === 'WON' ? new Date() : null, lostAt: replacement.terminalType === 'LOST' ? new Date() : null } });
        await tx.opportunityStageHistory.createMany({ data: activeOpportunities.map((item) => ({ opportunityId: item.id, fromStageId: id, toStageId: replacement.id, changedById: actorId })) });
      }
      await tx.pipelineStage.update({ where: { id }, data: { isActive: false, isDefault: false } });
      if (current.isDefault && replacement) await tx.pipelineStage.update({ where: { id: replacement.id }, data: { isDefault: true } });
    });
    const updated = await this.getStage(id);
    await this.audit.record({ actorId, entityType: 'pipeline_stage', entityId: id, action: 'pipeline.stage_deactivated', before: current, after: updated, metadata: { replacementStageId, movedOpportunities: activeOpportunities.length } });
    return updated;
  }

  async reorderStages(dto: ReorderStagesDto, actorId?: string) {
    const ids = dto.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Stage IDs must be unique');
    const found = await this.prisma.pipelineStage.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new NotFoundException('One or more pipeline stages were not found');
    await this.prisma.$transaction(dto.items.map((item) => this.prisma.pipelineStage.update({ where: { id: item.id }, data: { sortOrder: item.sortOrder } })));
    await this.audit.record({ actorId, entityType: 'pipeline_stage', action: 'pipeline.stages_reordered', metadata: dto });
    return this.getStages();
  }

  getTransitions() {
    return this.prisma.pipelineStageTransition.findMany({ include: transitionInclude, orderBy: [{ fromStageId: 'asc' }, { toStageId: 'asc' }, { role: 'asc' }] });
  }

  async createTransition(dto: CreateTransitionDto, actorId?: string) {
    await this.validateTransitionStages(dto.fromStageId ?? null, dto.toStageId);
    await this.assertUnique(dto.fromStageId ?? null, dto.toStageId, dto.role ?? null);
    const created = await this.prisma.pipelineStageTransition.create({ data: { fromStageId: dto.fromStageId ?? null, toStageId: dto.toStageId, role: dto.role ?? null, isAllowed: dto.isAllowed }, include: transitionInclude });
    await this.audit.record({ actorId, entityType: 'pipeline_transition', entityId: created.id, action: 'pipeline.transition_rule_created', after: created });
    return created;
  }

  async updateTransition(id: string, dto: UpdateTransitionDto, actorId?: string) {
    const current = await this.findTransition(id);
    const fromStageId = dto.fromStageId === undefined ? current.fromStageId : dto.fromStageId;
    const toStageId = dto.toStageId ?? current.toStageId;
    const role = dto.role === undefined ? current.role : dto.role;
    await this.validateTransitionStages(fromStageId, toStageId);
    await this.assertUnique(fromStageId, toStageId, role, id);
    const updated = await this.prisma.pipelineStageTransition.update({ where: { id }, data: dto, include: transitionInclude });
    await this.audit.record({ actorId, entityType: 'pipeline_transition', entityId: id, action: 'pipeline.transition_rule_updated', before: current, after: updated });
    return updated;
  }

  async deleteTransition(id: string, actorId?: string) {
    const current = await this.findTransition(id);
    const deleted = await this.prisma.pipelineStageTransition.delete({ where: { id } });
    await this.audit.record({ actorId, entityType: 'pipeline_transition', entityId: id, action: 'pipeline.transition_rule_deleted', before: current });
    return deleted;
  }

  async assertTransitionAllowed(fromStageId: string, toStageId: string, role: UserRole) {
    const target = await this.getStage(toStageId);
    const rules = await this.prisma.pipelineStageTransition.findMany({ where: { fromStageId, toStageId, OR: [{ role }, { role: null }] } });
    const rule = rules.find((item) => item.role === role) ?? rules.find((item) => item.role === null);
    if (!target.isActive || !rule?.isAllowed) throw new BadRequestException('انتقال از این مرحله به مرحله انتخاب‌شده مجاز نیست.');
    return target;
  }

  async assertTransitionAllowedByCode(fromCode: string, toCode: string, role: UserRole) {
    const stages = await this.prisma.pipelineStage.findMany({ where: { code: { in: [fromCode, toCode] } } });
    const from = stages.find((item) => item.code === fromCode);
    const to = stages.find((item) => item.code === toCode);
    if (!from || !to) throw new BadRequestException('Pipeline stage is not configured');
    return this.assertTransitionAllowed(from.id, to.id, role);
  }

  private async findTransition(id: string) {
    const item = await this.prisma.pipelineStageTransition.findUnique({ where: { id }, include: transitionInclude });
    if (!item) throw new NotFoundException('Pipeline stage transition not found');
    return item;
  }

  private async assertUnique(fromStageId: string | null, toStageId: string, role: UserRole | null, excludeId?: string) {
    const existing = await this.prisma.pipelineStageTransition.findFirst({ where: { fromStageId, toStageId, role, ...(excludeId && { NOT: { id: excludeId } }) } });
    if (existing) throw new ConflictException('This pipeline transition rule already exists');
  }

  private async validateTransitionStages(fromStageId: string | null, toStageId: string) {
    if (fromStageId === toStageId) throw new BadRequestException('fromStageId and toStageId must be different');
    const count = await this.prisma.pipelineStage.count({ where: { id: { in: [fromStageId, toStageId].filter((id): id is string => Boolean(id)) } } });
    if (count !== (fromStageId ? 2 : 1)) throw new NotFoundException('Transition stage not found');
  }

  private async assertAnotherActiveNonTerminal(excludeId: string) {
    const count = await this.prisma.pipelineStage.count({ where: { id: { not: excludeId }, isActive: true, isTerminal: false } });
    if (!count) throw new ConflictException('At least one active non-terminal stage must remain');
  }

  private validateTerminal(isTerminal: boolean, terminalType: string) {
    if (!TERMINAL_TYPES.includes(terminalType as typeof TERMINAL_TYPES[number])) throw new BadRequestException('Invalid terminalType');
    if (isTerminal && terminalType === 'NONE') throw new BadRequestException('Terminal stages require a terminalType');
    if (!isTerminal && terminalType !== 'NONE') throw new BadRequestException('Non-terminal stages must use terminalType NONE');
  }

  private normalizeCode(code: string) {
    return code.trim().toUpperCase().replace(/\s+/g, '_');
  }
}
