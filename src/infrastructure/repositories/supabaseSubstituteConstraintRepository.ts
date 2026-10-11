import { requireSupabaseClient } from "../supabase/client";
import { fetchAllSupabasePages, type SupabasePageResult } from "../supabase/pagination";
import type { SubstituteConstraintReadRepository } from "./substituteConstraintRepository";
import {
  mapSubstituteConstraintRow,
  type SubstituteConstraintRow,
} from "./substituteConstraintMappers";

type RangeableQuery<T> = {
  range(from: number, to: number): PromiseLike<SupabasePageResult<T>>;
};

export class SupabaseSubstituteConstraintRepository
  implements SubstituteConstraintReadRepository
{
  async listActiveConstraints() {
    const client = requireSupabaseClient();
    const rows = await fetchAllSupabasePages<SubstituteConstraintRow>(
      (from, to) => (client
        .from("substitute_constraints")
        .select("*")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("id") as unknown as RangeableQuery<SubstituteConstraintRow>)
        .range(from, to),
      "substitute_constraints",
    );

    return rows.map(mapSubstituteConstraintRow);
  }
}
