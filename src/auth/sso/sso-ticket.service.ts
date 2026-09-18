import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

export interface ConsumedSsoTicket {
  userId: string;
  providerId: string | null;
}

@Injectable()
export class SsoTicketService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async createTicket(
    userId: string,
    providerId?: string | null,
  ): Promise<string> {
    const ticket = randomBytes(48).toString('base64url');
    const ticketHash = this.hashTicket(ticket);
    const ttlSeconds = this.config.get<number>('SSO_TICKET_TTL', 120);

    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.ssoLoginTicket.create({
      data: {
        ticketHash,
        userId,
        providerId: providerId ?? null,
        expiresAt,
      },
    });

    return ticket;
  }

  async consumeTicket(ticket: string): Promise<ConsumedSsoTicket> {
    const ticketHash = this.hashTicket(ticket);

    const found = await this.prisma.ssoLoginTicket.findUnique({
      where: { ticketHash },
    });

    if (!found) {
      throw new BadRequestException('Invalid SSO ticket');
    }

    if (found.consumedAt) {
      throw new BadRequestException('SSO ticket has already been consumed');
    }

    if (found.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('SSO ticket has expired');
    }

    await this.prisma.ssoLoginTicket.update({
      where: { id: found.id },
      data: { consumedAt: new Date() },
    });

    return {
      userId: found.userId,
      providerId: found.providerId,
    };
  }

  private hashTicket(ticket: string): string {
    return createHash('sha256').update(ticket).digest('hex');
  }
}