import { NotificationChannel, NotificationDeliveryStatus } from "@prisma/client"
import { SmsNotificationChannelHandler } from "../src/notification-core/sms/sms-notification-channel.handler"

function setup(options?: { claim?: number; phone?: string | null; providerSuccess?: boolean }) {
  const provider = { code: "GENERIC_HTTP_JSON", send: jest.fn().mockResolvedValue(options?.providerSuccess === false ? { success: false, errorCode: "HTTP_500", errorMessage: "Rejected" } : { success: true, providerMessageId: "provider-1" }) }
  const delivery = { id: "delivery-1", deduplicationKey: "dedupe-1", recipientUser: { id: "user-1" }, template: { id: "template-1" }, event: { organizationId: "org-1" } }
  const notificationDelivery = { updateMany: jest.fn().mockResolvedValue({ count: options?.claim ?? 1 }), findFirst: jest.fn().mockResolvedValue(delivery), update: jest.fn().mockResolvedValue({}) }
  const prisma = { notificationDelivery, withTenantTransaction: jest.fn(async (_context, callback) => callback({ notificationDelivery })) }
  const templates = { renderStoredTemplate: jest.fn().mockResolvedValue({ body: "سلام علی" }) }
  const contacts = { resolve: jest.fn().mockResolvedValue(options?.phone === undefined ? "+989121234567" : options.phone), mask: jest.fn().mockReturnValue("+989***4567") }
  const settings = { configured: jest.fn().mockResolvedValue({ provider, config: { senderNumber: "3000" } }) }
  return { provider, prisma, templates, contacts, settings, handler: new SmsNotificationChannelHandler(prisma as never, templates as never, contacts as never, settings as never) }
}

describe("SmsNotificationChannelHandler", () => {
  it("claims, renders and persists a successful SMS", async () => {
    const { handler, prisma, provider, templates } = setup()
    await expect(handler.dispatch("delivery-1", "org-1")).resolves.toMatchObject({ status: "SENT", sent: true })
    expect(templates.renderStoredTemplate).toHaveBeenCalled()
    expect(provider.send).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ to: "+989121234567", message: "سلام علی", sender: "3000" }))
    expect(prisma.notificationDelivery.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: NotificationDeliveryStatus.SENT, destination: "+989121234567", providerMessageId: "provider-1" }) }))
  })
  it("skips a recipient without mobile", async () => {
    const { handler, prisma, provider } = setup({ phone: null })
    await expect(handler.dispatch("delivery-1", "org-1")).resolves.toMatchObject({ status: "SKIPPED", reason: "MISSING_SMS_DESTINATION" })
    expect(provider.send).not.toHaveBeenCalled()
    expect(prisma.notificationDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ failureCode: "MISSING_SMS_DESTINATION" }) }))
  })
  it("persists controlled provider failure", async () => {
    const { handler, prisma } = setup({ providerSuccess: false })
    await expect(handler.dispatch("delivery-1", "org-1")).resolves.toMatchObject({ status: "FAILED", reason: "HTTP_500" })
    expect(prisma.notificationDelivery.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: NotificationDeliveryStatus.FAILED, failureCode: "HTTP_500" }) }))
  })
  it("does not send an already claimed or terminal delivery", async () => {
    const { handler, provider, prisma } = setup({ claim: 0 })
    prisma.notificationDelivery.findFirst.mockResolvedValue({ status: NotificationDeliveryStatus.SENT, channel: NotificationChannel.SMS })
    await expect(handler.dispatch("delivery-1", "org-1")).resolves.toMatchObject({ sent: false, reason: "DELIVERY_NOT_CLAIMABLE" })
    expect(provider.send).not.toHaveBeenCalled()
  })
})
