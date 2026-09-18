import { Injectable, Logger } from "@nestjs/common"
import { Interval } from "@nestjs/schedule"
import { OrganizationStatus } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { NotificationDeliveryDispatcher } from "../notification-delivery-dispatcher.service"
import { NotificationDeliveryQueueService } from "./notification-delivery-queue.service"

@Injectable()
export class NotificationDeliveryWorkerService {
  private readonly logger = new Logger(NotificationDeliveryWorkerService.name)
  private running = false
  private lastRunAt = 0
  constructor(private readonly prisma: PrismaService, private readonly queue: NotificationDeliveryQueueService, private readonly dispatcher: NotificationDeliveryDispatcher) {}

  @Interval(1_000)
  async tick() {
    if (!this.enabled() || this.running || Date.now() - this.lastRunAt < this.intervalMs()) return
    this.running = true; this.lastRunAt = Date.now()
    try {
      const organizations = await this.prisma.organization.findMany({ where: { status: OrganizationStatus.ACTIVE }, select: { id: true } })
      for (const organization of organizations) await this.processOrganization(organization.id)
    } catch (error) { this.logger.error(`Notification queue scan failed category=${error instanceof Error ? error.name : "UNKNOWN"}`) }
    finally { this.running = false }
  }

  async processOrganization(organizationId: string, now = new Date()) {
    const recovered = await this.queue.recoverStale(organizationId, now)
    if (recovered.count) this.logger.warn(`Recovered ${recovered.count} stale notification jobs organizationId=${organizationId}`)
    const jobs = await this.queue.due(organizationId, now)
    const results = await Promise.allSettled(jobs.map(job => this.dispatcher.dispatch(job.id, organizationId)))
    const rejected = results.filter(result => result.status === "rejected").length
    if (rejected) this.logger.warn(`Notification worker failures organizationId=${organizationId} count=${rejected}`)
    return { queued: jobs.length, rejected, recovered: recovered.count }
  }

  private enabled() { return !["false", "0", "off"].includes((process.env.NOTIFICATION_WORKER_ENABLED ?? "true").toLowerCase()) }
  private intervalMs() { const value = Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS ?? 5000); return Number.isInteger(value) && value >= 1000 && value <= 60000 ? value : 5000 }
}
