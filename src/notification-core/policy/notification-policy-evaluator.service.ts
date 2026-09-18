import { Injectable } from "@nestjs/common"
import { resolveNotificationPolicyField } from "./notification-policy-field-resolver"
import { isConditionGroup, type NotificationConditionLeaf, type NotificationConditionNode, type NotificationPolicyCheck, type NotificationPolicyContext, type NotificationPolicyEvaluation, type NotificationRuleConditions } from "./notification-policy.types"

@Injectable()
export class NotificationPolicyEvaluatorService {
  hasConditions(value: unknown): value is NotificationRuleConditions {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { conditions?: unknown }).conditions) && (value as { conditions: unknown[] }).conditions.length)
  }

  evaluate(value: unknown, context: NotificationPolicyContext): NotificationPolicyEvaluation {
    if (!this.hasConditions(value)) return { matches: true, reason: "no_conditions", checks: [] }
    const checks: NotificationPolicyCheck[] = []
    const matches = this.evaluateGroup(value, context, checks)
    return { matches, reason: matches ? "all_conditions_matched" : "condition_failed", checks }
  }

  private evaluateGroup(group: NotificationRuleConditions | { logic: "AND" | "OR"; conditions: NotificationConditionNode[] }, context: NotificationPolicyContext, checks: NotificationPolicyCheck[]) {
    const results = group.conditions.map(node => isConditionGroup(node) ? this.evaluateGroup(node, context, checks) : this.evaluateLeaf(node, context, checks))
    return group.logic === "OR" ? results.some(Boolean) : results.every(Boolean)
  }

  private evaluateLeaf(condition: NotificationConditionLeaf, context: NotificationPolicyContext, checks: NotificationPolicyCheck[]) {
    const actual = resolveNotificationPolicyField(context, condition.field)
    const expected = condition.value
    let result = false
    switch (condition.operator) {
      case "EXISTS": result = actual !== undefined && actual !== null; break
      case "NOT_EXISTS": result = actual === undefined || actual === null; break
      case "EQ": result = actual === expected; break
      case "NEQ": result = actual !== expected; break
      case "IN": result = Array.isArray(expected) && expected.includes(actual as never); break
      case "NOT_IN": result = Array.isArray(expected) && !expected.includes(actual as never); break
      case "GT": result = this.compare(actual, expected, (left, right) => left > right); break
      case "GTE": result = this.compare(actual, expected, (left, right) => left >= right); break
      case "LT": result = this.compare(actual, expected, (left, right) => left < right); break
      case "LTE": result = this.compare(actual, expected, (left, right) => left <= right); break
    }
    checks.push({ field: condition.field, operator: condition.operator, ...(condition.operator === "EXISTS" || condition.operator === "NOT_EXISTS" ? {} : { expected }), result })
    return result
  }

  private compare(actual: unknown, expected: unknown, comparator: (left: number, right: number) => boolean) {
    return typeof actual === "number" && typeof expected === "number" && Number.isFinite(actual) && Number.isFinite(expected) && comparator(actual, expected)
  }
}
