import { BadRequestException } from "@nestjs/common"
import { NotificationPolicyConditionValidator } from "../src/notification-core/policy/notification-policy-condition-validator.service"
import { NotificationPolicyEvaluatorService } from "../src/notification-core/policy/notification-policy-evaluator.service"
import type { NotificationPolicyContext, NotificationRuleConditions } from "../src/notification-core/policy/notification-policy.types"

const context: NotificationPolicyContext = {
  event: { name: "TASK.ASSIGNED" }, actor: { id: "actor-1", roleId: null, teamId: "team-1" }, organization: { id: "org-1" },
  task: { id: "task-1", title: "Test", priority: "HIGH", status: "TODO", assigneeId: "user-1", teamId: "team-1", creatorId: "actor-1" },
  meeting: null, opportunity: null,
}
const conditions = (...items: NotificationRuleConditions["conditions"]): NotificationRuleConditions => ({ version: 1, logic: "AND", conditions: items })

describe("NotificationPolicyEvaluatorService", () => {
  const evaluator = new NotificationPolicyEvaluatorService()
  it.each([
    ["EQ", "HIGH", true], ["NEQ", "LOW", true], ["IN", ["HIGH", "URGENT"], true], ["NOT_IN", ["LOW"], true],
  ] as const)("evaluates %s", (operator, value, expected) => expect(evaluator.evaluate(conditions({ field: "task.priority", operator, value: value as never }), context).matches).toBe(expected))
  it("evaluates EXISTS and NOT_EXISTS including null", () => {
    expect(evaluator.evaluate(conditions({ field: "task.assigneeId", operator: "EXISTS" }), context).matches).toBe(true)
    expect(evaluator.evaluate(conditions({ field: "opportunity.ownerId", operator: "NOT_EXISTS" }), context).matches).toBe(true)
  })
  it.each([["GT", 5, 4], ["GTE", 5, 5], ["LT", 4, 5], ["LTE", 5, 5]] as const)("evaluates numeric %s", (operator, actual, expected) => {
    const numeric = { ...context, task: { ...context.task!, score: actual } } as unknown as NotificationPolicyContext
    expect(evaluator.evaluate(conditions({ field: "task.score", operator, value: expected }), numeric).matches).toBe(true)
  })
  it("supports nested AND and OR", () => {
    const result = evaluator.evaluate({ version: 1, logic: "AND", conditions: [{ field: "task.status", operator: "EQ", value: "TODO" }, { logic: "OR", conditions: [{ field: "task.priority", operator: "EQ", value: "LOW" }, { field: "task.priority", operator: "EQ", value: "HIGH" }] }] }, context)
    expect(result.matches).toBe(true)
    expect(result.checks).toHaveLength(3)
  })
  it("handles missing, null and dangerous fields safely", () => {
    expect(evaluator.evaluate(conditions({ field: "task.missing", operator: "EXISTS" }), context).matches).toBe(false)
    expect(evaluator.evaluate(conditions({ field: "task.__proto__.polluted", operator: "EXISTS" }), context).matches).toBe(false)
    expect(evaluator.evaluate(conditions({ field: "meeting.type", operator: "NOT_EXISTS" }), context).matches).toBe(true)
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
  })
  it("preserves null and legacy empty condition behavior", () => {
    expect(evaluator.evaluate(null, context)).toMatchObject({ matches: true, reason: "no_conditions" })
    expect(evaluator.evaluate({}, context)).toMatchObject({ matches: true, reason: "no_conditions" })
    expect(evaluator.evaluate({ version: 1, logic: "AND", conditions: [] }, context)).toMatchObject({ matches: true, reason: "no_conditions" })
  })
  it("returns a safe explanation without actual context values", () => {
    const result = evaluator.evaluate(conditions({ field: "task.priority", operator: "EQ", value: "LOW" }), context)
    expect(result).toMatchObject({ matches: false, reason: "condition_failed", checks: [{ field: "task.priority", operator: "EQ", expected: "LOW", result: false }] })
    expect(JSON.stringify(result)).not.toContain("HIGH")
  })
})

describe("NotificationPolicyConditionValidator", () => {
  const validator = new NotificationPolicyConditionValidator()
  it("accepts catalog fields and enums", () => expect(validator.validate("TASK.ASSIGNED", conditions({ field: "task.priority", operator: "EQ", value: "HIGH" }))).toBeTruthy())
  it.each([
    conditions({ field: "task.random", operator: "EQ", value: "HIGH" }),
    conditions({ field: "task.__proto__.x", operator: "EQ", value: "HIGH" }),
    conditions({ field: "task.priority", operator: "EQ", value: "SUPER_HIGH" }),
    conditions({ field: "task.priority", operator: "IN", value: "HIGH" }),
    conditions({ field: "task.priority", operator: "EQ", value: 123 }),
  ])("rejects an invalid policy", value => expect(() => validator.validate("TASK.ASSIGNED", value)).toThrow(BadRequestException))
  it("rejects excessive depth", () => {
    let node: unknown = { field: "task.priority", operator: "EQ", value: "HIGH" }
    for (let index = 0; index < 6; index += 1) node = { logic: "AND", conditions: [node] }
    expect(() => validator.validate("TASK.ASSIGNED", { version: 1, logic: "AND", conditions: [node] })).toThrow(/عمق/)
  })
  it("rejects more than fifty conditions", () => {
    const nodes = Array.from({ length: 51 }, () => ({ field: "task.priority", operator: "EQ" as const, value: "HIGH" }))
    expect(() => validator.validate("TASK.ASSIGNED", conditions(...nodes))).toThrow(/50/)
  })
  it("rejects more than one hundred IN values", () => expect(() => validator.validate("TASK.ASSIGNED", conditions({ field: "task.priority", operator: "IN", value: Array.from({ length: 101 }, () => "HIGH") }))).toThrow(/100/))
})
