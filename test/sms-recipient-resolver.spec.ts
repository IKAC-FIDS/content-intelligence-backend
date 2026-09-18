import { SmsRecipientResolver } from "../src/notification-core/sms/sms-recipient-resolver.service"

describe("SmsRecipientResolver", () => {
  const service = new SmsRecipientResolver({} as never)
  it.each([
    ["09121234567", "+989121234567"], ["+989121234567", "+989121234567"],
    ["989121234567", "+989121234567"], ["00989121234567", "+989121234567"],
  ])("normalizes %s", (input, expected) => expect(service.normalize(input)).toBe(expected))
  it.each(["123", "09123", "+9809121234567", "phone"])("rejects invalid number %s", (input) => expect(service.normalize(input)).toBeNull())
})
