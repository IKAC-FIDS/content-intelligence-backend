import { BadRequestException, Injectable } from "@nestjs/common"
import { conditionDefinition } from "./notification-condition.catalog"
import { isConditionGroup, NOTIFICATION_CONDITION_OPERATORS, type NotificationConditionFieldDefinition, type NotificationConditionNode, type NotificationRuleConditions } from "./notification-policy.types"

const MAX_DEPTH = 5
const MAX_CONDITIONS = 50
const MAX_IN_VALUES = 100
const MAX_STRING_LENGTH = 500

@Injectable()
export class NotificationPolicyConditionValidator {
  validate(eventName: string, input: unknown): NotificationRuleConditions | null {
    if (input === null || input === undefined || (typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0)) return null
    const definition = conditionDefinition(eventName)
    if (!definition) throw new BadRequestException(`Conditions are not supported for event: ${eventName}`)
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new BadRequestException("ساختار شرایط قانون معتبر نیست")
    const root = input as Record<string, unknown>
    if (root.version !== 1 || (root.logic !== "AND" && root.logic !== "OR") || !Array.isArray(root.conditions)) throw new BadRequestException("شرایط باید دارای version=1، logic و آرایه conditions باشد")
    if (!root.conditions.length) return null
    const count = { value: 0 }
    this.validateNodes(root.conditions, definition.conditionFields, 1, count)
    return input as NotificationRuleConditions
  }

  private validateNodes(nodes: unknown[], fields: NotificationConditionFieldDefinition[], depth: number, count: { value: number }) {
    if (depth > MAX_DEPTH) throw new BadRequestException(`حداکثر عمق گروه‌های شرط ${MAX_DEPTH} است`)
    for (const raw of nodes) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BadRequestException("هر شرط باید یک شیء معتبر باشد")
      const node = raw as NotificationConditionNode
      if (isConditionGroup(node)) {
        if ((node.logic !== "AND" && node.logic !== "OR") || !Array.isArray(node.conditions) || !node.conditions.length) throw new BadRequestException("گروه شرط باید logic و conditions معتبر داشته باشد")
        this.validateNodes(node.conditions, fields, depth + 1, count)
        continue
      }
      count.value += 1
      if (count.value > MAX_CONDITIONS) throw new BadRequestException(`حداکثر ${MAX_CONDITIONS} شرط در هر قانون مجاز است`)
      if (typeof node.field !== "string" || node.field.length > 120 || ["__proto__", "prototype", "constructor"].some(value => node.field.split(".").includes(value))) throw new BadRequestException("مسیر فیلد شرط ناامن یا نامعتبر است")
      const field = fields.find(item => item.field === node.field)
      if (!field) throw new BadRequestException(`فیلد شرط برای این رویداد مجاز نیست: ${node.field}`)
      if (!NOTIFICATION_CONDITION_OPERATORS.includes(node.operator) || !field.operators.includes(node.operator)) throw new BadRequestException(`عملگر ${String(node.operator)} برای ${field.label} پشتیبانی نمی‌شود`)
      this.validateValue(node, field)
    }
  }

  private validateValue(node: Exclude<NotificationConditionNode, { logic: "AND" | "OR" }>, field: NotificationConditionFieldDefinition) {
    if (node.operator === "EXISTS" || node.operator === "NOT_EXISTS") {
      if (node.value !== undefined && node.value !== null) throw new BadRequestException(`${node.operator} نباید مقدار داشته باشد`)
      return
    }
    if (node.value === undefined || node.value === null) throw new BadRequestException(`مقدار شرط ${field.label} الزامی است`)
    const isSet = node.operator === "IN" || node.operator === "NOT_IN"
    const values = isSet ? node.value : [node.value]
    if (isSet && (!Array.isArray(node.value) || !node.value.length || node.value.length > MAX_IN_VALUES)) throw new BadRequestException(`مقدار ${node.operator} باید آرایه‌ای با حداکثر ${MAX_IN_VALUES} عضو باشد`)
    if (!isSet && Array.isArray(node.value)) throw new BadRequestException(`عملگر ${node.operator} مقدار آرایه‌ای نمی‌پذیرد`)
    for (const value of values as unknown[]) {
      if (field.type === "number" ? typeof value !== "number" || !Number.isFinite(value) : typeof value !== "string") throw new BadRequestException(`نوع مقدار ${field.label} معتبر نیست`)
      if (typeof value === "string" && value.length > MAX_STRING_LENGTH) throw new BadRequestException(`مقدار ${field.label} بیش از حد طولانی است`)
      if (field.values && !field.values.includes(String(value))) throw new BadRequestException(`مقدار ${String(value)} برای ${field.label} مجاز نیست`)
    }
  }
}
