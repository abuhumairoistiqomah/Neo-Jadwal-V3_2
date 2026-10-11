import type { Teacher } from "../models";
import { getGenderPreference, genderPreferenceRank, type GenderPreference } from "../classGender";
import {
  resolveSubstituteAvailability,
  type SubstituteAvailabilityStatus,
  type SubstituteConstraint,
} from "../substituteAvailability";

export interface SubstituteCandidatePolicyResult {
  genderPreference: GenderPreference;
  genderRank: number;
  constraintStatus: SubstituteAvailabilityStatus;
  constraintReasons: string[];
  constraintIds: string[];
  requiresConstraintOverride: boolean;
}

/**
 * Policy layer only. Schedule conflict, leave, daily/weekly load, and subject fit
 * remain separate recommendation signals in Input Inval.
 */
export function evaluateSubstituteCandidatePolicy(input: {
  teacher: Teacher;
  className: string;
  date: string;
  period: number;
  constraints: SubstituteConstraint[];
}): SubstituteCandidatePolicyResult {
  const genderPreference = getGenderPreference(input.className, input.teacher.gender);
  const constraint = input.teacher.id
    ? resolveSubstituteAvailability({
        teacherId: input.teacher.id,
        date: input.date,
        period: input.period,
        constraints: input.constraints,
      })
    : {
        status: "AVAILABLE" as const,
        matchingConstraints: [],
        requiresOverride: false,
      };

  return {
    genderPreference,
    genderRank: genderPreferenceRank(genderPreference),
    constraintStatus: constraint.status,
    constraintReasons: constraint.matchingConstraints.map((item) => item.reason),
    constraintIds: constraint.matchingConstraints.map((item) => item.id),
    requiresConstraintOverride: constraint.requiresOverride,
  };
}
