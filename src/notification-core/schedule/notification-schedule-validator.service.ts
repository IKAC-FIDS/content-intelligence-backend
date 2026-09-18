import { BadRequestException, Injectable } from "@nestjs/common"
import { NotificationScheduleTriggerMode, NotificationScheduleType } from "@prisma/client"
import { scheduleDefinition } from "./notification-schedule.catalog"

export type NotificationScheduleInput = {
  enabled?: boolean
  type: NotificationScheduleType
  sourceField: string
  triggerMode: NotificationScheduleTriggerMode
  offsetMinutes: number
  gracePeriodMinutes?: number
}

@Injectable()
export class NotificationScheduleValidator {
  validate(eventName: string, input: NotificationScheduleInput | null | undefined) {
    const definition = scheduleDefinition(eventName)
    if (!input) {
      if (definition) throw new BadRequestException(`Schedule is required for ${eventName}`)
      return null
    }
    if (!definition) throw new BadRequestException(`Event does not support scheduling: ${eventName}`)
    if (input.type !== definition.scheduleType) throw new BadRequestException("Invalid schedule type")
    if (input.sourceField !== definition.sourceField) throw new BadRequestException("Invalid schedule source field")
    if (!definition.triggerModes.includes(input.triggerMode)) throw new BadRequestException("Invalid schedule trigger mode")
    if (!Number.isInteger(input.offsetMinutes) || Math.abs(input.offsetMinutes) > 525600) throw new BadRequestException("Invalid schedule offset")
    if (input.triggerMode === NotificationScheduleTriggerMode.BEFORE && input.offsetMinutes >= 0) throw new BadRequestException("BEFORE schedule requires a negative offset")
    if (input.triggerMode === NotificationScheduleTriggerMode.AT_OR_AFTER && input.offsetMinutes !== 0) throw new BadRequestException("AT_OR_AFTER schedule requires zero offset")
    const grace = input.gracePeriodMinutes ?? definition.defaultGracePeriodMinutes
    if (!Number.isInteger(grace) || grace < 1 || grace > 525600) throw new BadRequestException("Invalid schedule grace period")
    return { enabled: input.enabled ?? true, scheduleType: input.type, sourceField: input.sourceField, triggerMode: input.triggerMode, offsetMinutes: input.offsetMinutes, gracePeriodMinutes: grace }
  }
}
