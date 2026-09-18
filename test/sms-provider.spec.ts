import { BadRequestException } from "@nestjs/common"
import { GenericHttpSmsProvider } from "../src/notification-core/sms/generic-http-sms.provider"
import { SmsProviderRegistry } from "../src/notification-core/sms/sms-provider.registry"

const config = { apiUrl: "https://sms.example.com/send", apiKey: "top-secret", senderNumber: "3000", timeoutMs: 1000 }

describe("SMS provider", () => {
  afterEach(() => jest.restoreAllMocks())
  it("resolves a registered provider and rejects unknown providers", () => {
    const provider = new GenericHttpSmsProvider()
    const registry = new SmsProviderRegistry(provider)
    expect(registry.get(provider.code)).toBe(provider)
    expect(() => registry.get("UNKNOWN")).toThrow(BadRequestException)
  })
  it("passes destination, sender and idempotency key", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true, messageId: "m-1", status: "accepted" }), { status: 200, headers: { "content-type": "application/json" } }))
    const result = await new GenericHttpSmsProvider().send(config, { to: "+989121234567", sender: "5000", message: "سلام", idempotencyKey: "delivery-1" })
    expect(result).toMatchObject({ success: true, providerMessageId: "m-1" })
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ to: "+989121234567", sender: "5000", idempotencyKey: "delivery-1" })
  })
  it.each([401, 403, 500])("maps HTTP %s without leaking the API key", async (status) => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: config.apiKey }), { status }))
    const result = await new GenericHttpSmsProvider().send(config, { to: "+989121234567", message: "test" })
    expect(result.success).toBe(false)
    expect(JSON.stringify(result)).not.toContain(config.apiKey)
    expect(result.errorCode).toBe(`HTTP_${status}`)
  })
  it("rejects malformed successful responses", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
    await expect(new GenericHttpSmsProvider().send(config, { to: "+989121234567", message: "test" })).resolves.toMatchObject({ success: false, errorCode: "MALFORMED_PROVIDER_RESPONSE" })
  })
  it("handles timeout without exposing secrets", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(Object.assign(new Error(config.apiKey), { name: "AbortError" }))
    const result = await new GenericHttpSmsProvider().send(config, { to: "+989121234567", message: "test" })
    expect(result).toMatchObject({ success: false, errorCode: "PROVIDER_TIMEOUT" })
    expect(JSON.stringify(result)).not.toContain(config.apiKey)
  })
})
