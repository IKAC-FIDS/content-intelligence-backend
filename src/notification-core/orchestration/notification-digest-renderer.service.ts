import { Injectable } from "@nestjs/common"
import type { TenantTransactionClient } from "../../prisma/prisma.service"
import { NotificationTemplateEngineService } from "../notification-template-engine.service"

@Injectable()
export class NotificationDigestRendererService {
  constructor(private readonly templates: NotificationTemplateEngineService) {}

  async render(bucketId: string, recipientUserId: string, db: TenantTransactionClient) {
    const bucket = await db.notificationDigestBucket.findUniqueOrThrow({
      where: { id: bucketId },
      include: { policy: { select: { name: true, subjectTemplate: true, introText: true } }, items: { orderBy: { createdAt: "asc" }, include: { bucket: false } } },
    })
    const deliveries = await db.notificationDelivery.findMany({
      where: { id: { in: bucket.items.map(item => item.deliveryId) } },
      include: { event: true, template: true }, orderBy: { createdAt: "asc" },
    })
    const rendered = [] as Array<{ subject: string; body: string }>
    for (const delivery of deliveries) {
      if (!delivery.template) continue
      const item = await this.templates.renderStoredTemplate(delivery.event, recipientUserId, delivery.template, db)
      rendered.push({ subject: item.subject?.trim() || delivery.event.eventName, body: item.body.trim() })
    }
    return {
      subject: `${bucket.policy.subjectTemplate} — ${rendered.length.toLocaleString("fa-IR")} اعلان`,
      body: `${bucket.policy.introText}\n\n${rendered.map((item, index) => `${index + 1}. ${item.subject}\n${item.body}`).join("\n\n──────────\n\n")}`,
    }
  }
}
