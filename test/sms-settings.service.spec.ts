import { BadRequestException } from "@nestjs/common"
import { SmsSettingsService } from "../src/notification-core/sms/sms-settings.service"

function setup(row: Record<string, unknown> | null = null) {
  const prisma = { notificationSmsSettings: { findUnique: jest.fn().mockResolvedValue(row), upsert: jest.fn().mockImplementation(({ create }) => ({ id: "sms-1", updatedAt: new Date(), ...create })) } }
  const secrets = { encryptSecret: jest.fn((value: string) => `enc:${value}`), decryptSecret: jest.fn((value: string) => value.replace("enc:", "")) }
  const provider = { code: "GENERIC_HTTP_JSON", validateConfig: jest.fn(), send: jest.fn().mockResolvedValue({ success: true, providerMessageId: "m-1" }) }
  const providers = { get: jest.fn().mockReturnValue(provider), list: jest.fn().mockReturnValue([provider.code]) }
  const audit = { record: jest.fn().mockResolvedValue({}) }
  const contacts = { normalize: jest.fn().mockReturnValue("+989121234567"), mask: jest.fn().mockReturnValue("+989***4567") }
  return { prisma, secrets, provider, providers, audit, contacts, service: new SmsSettingsService(prisma as never, secrets as never, providers as never, audit as never, contacts as never) }
}

describe("SmsSettingsService", () => {
  it("never returns the encrypted API key", async () => {
    const { service } = setup({ provider: "GENERIC_HTTP_JSON", apiUrl: "https://sms.test", apiKeyEnc: "enc:secret", senderNumber: "3000", enabled: true, timeoutMs: 1000, updatedAt: new Date() })
    const result = await service.get("org-a")
    expect(result.apiKeyConfigured).toBe(true)
    expect(JSON.stringify(result)).not.toContain("secret")
  })
  it("keeps existing secret when PATCH omits apiKey", async () => {
    const { service, prisma, secrets } = setup({ apiKeyEnc: "enc:existing" })
    await service.update("org-a", "actor-a", { provider: "GENERIC_HTTP_JSON", apiUrl: "https://sms.test", senderNumber: "3000", enabled: true, timeoutMs: 1000 })
    expect(prisma.notificationSmsSettings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ apiKeyEnc: "enc:existing" }) }))
    expect(secrets.encryptSecret).not.toHaveBeenCalled()
  })
  it("rejects test sending when SMS is disabled", async () => {
    const { service } = setup({ enabled: false })
    await expect(service.test("org-a", "actor-a", { recipient: "09121234567" })).rejects.toThrow(BadRequestException)
  })
  it("uses current organization settings for a real test call", async () => {
    const row = { provider: "GENERIC_HTTP_JSON", apiUrl: "https://sms.test", apiKeyEnc: "enc:secret", senderNumber: "3000", enabled: true, timeoutMs: 1000 }
    const { service, prisma, provider } = setup(row)
    await expect(service.test("org-a", "actor-a", { recipient: "09121234567", message: "test" })).resolves.toMatchObject({ success: true })
    expect(prisma.notificationSmsSettings.findUnique).toHaveBeenCalledWith({ where: { organizationId: "org-a" } })
    expect(provider.send).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "secret" }), expect.objectContaining({ to: "+989121234567", sender: "3000" }))
  })
})
