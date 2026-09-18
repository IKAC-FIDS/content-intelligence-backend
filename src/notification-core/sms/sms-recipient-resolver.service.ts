import { Injectable } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"

const MOBILE_TYPES = ["MOBILE", "PHONE", "WORK_PHONE"]

@Injectable()
export class SmsRecipientResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId, isActive: true }, select: { email: true } })
    if (!user) return null
    const person = await this.prisma.person.findFirst({
      where: { email: { equals: user.email, mode: "insensitive" }, company: { organizationId, archivedAt: null } },
      orderBy: [{ isPrimaryContact: "desc" }, { updatedAt: "desc" }],
      select: { phone: true, contacts: { where: { type: { in: MOBILE_TYPES } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { value: true } } },
    })
    return this.normalize(person?.phone || person?.contacts[0]?.value || "")
  }

  normalize(value: string): string | null {
    let phone = value.trim().replace(/[\s()-]/g, "")
    if (phone.startsWith("0098")) phone = `+98${phone.slice(4)}`
    else if (phone.startsWith("989")) phone = `+${phone}`
    else if (/^09\d{9}$/.test(phone)) phone = `+98${phone.slice(1)}`
    if (/^\+989\d{9}$/.test(phone)) return phone
    if (phone.startsWith("+98")) return null
    if (/^\+[1-9]\d{7,14}$/.test(phone)) return phone
    return null
  }

  mask(value: string) { return value.length > 7 ? `${value.slice(0, 4)}***${value.slice(-4)}` : "***" }
}
