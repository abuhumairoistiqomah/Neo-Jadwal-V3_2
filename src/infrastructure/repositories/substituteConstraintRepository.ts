import type { SubstituteConstraint } from "../../domain/substituteAvailability";

export interface SubstituteConstraintReadRepository {
  listActiveConstraints(): Promise<SubstituteConstraint[]>;
}
