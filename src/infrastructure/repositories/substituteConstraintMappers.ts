import type { SubstituteConstraint } from "../../domain/substituteAvailability";

export interface SubstituteConstraintRow {
  id: string;
  teacher_id: string;
  constraint_type: "WEEKLY" | "DATE";
  day_of_week?: number | null;
  specific_date?: string | null;
  period_start: number;
  period_end: number;
  valid_from?: string | null;
  valid_until?: string | null;
  reason: string;
  override_allowed?: boolean | null;
  blocks_normal_teaching?: boolean | null;
  is_active?: boolean | null;
}

export function mapSubstituteConstraintRow(row: SubstituteConstraintRow): SubstituteConstraint {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    kind: row.constraint_type,
    dayOfWeek: row.day_of_week ?? null,
    specificDate: row.specific_date ?? null,
    periodStart: Number(row.period_start),
    periodEnd: Number(row.period_end),
    validFrom: row.valid_from ?? null,
    validUntil: row.valid_until ?? null,
    reason: row.reason,
    overrideAllowed: row.override_allowed !== false,
    blocksNormalTeaching: row.blocks_normal_teaching === true,
    isActive: row.is_active !== false,
  };
}
