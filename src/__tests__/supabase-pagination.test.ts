import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fetchAllSupabasePages } from "../infrastructure/supabase/pagination";

function makeRows(total: number): number[] {
  return Array.from({ length: total }, (_, index) => index + 1);
}

describe("V3.7.2 Supabase pagination hardening", () => {
  it("loads all 1,682 schedule rows instead of stopping at the first 1,000", async () => {
    const source = makeRows(1682);
    const ranges: Array<[number, number]> = [];

    const rows = await fetchAllSupabasePages<number>(async (from, to) => {
      ranges.push([from, to]);
      return { data: source.slice(from, to + 1), error: null };
    }, "schedule_master");

    assert.equal(rows.length, 1682);
    assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
    assert.equal(rows.at(-1), 1682);
  });

  it("loads all 2,284 schedule-teacher relations across three pages", async () => {
    const source = makeRows(2284);
    const ranges: Array<[number, number]> = [];

    const rows = await fetchAllSupabasePages<number>(async (from, to) => {
      ranges.push([from, to]);
      return { data: source.slice(from, to + 1), error: null };
    }, "schedule_master_teachers");

    assert.equal(rows.length, 2284);
    assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("performs a final empty page when the row count is an exact page multiple", async () => {
    const source = makeRows(2000);
    let calls = 0;

    const rows = await fetchAllSupabasePages<number>(async (from, to) => {
      calls += 1;
      return { data: source.slice(from, to + 1), error: null };
    }, "exact_multiple");

    assert.equal(rows.length, 2000);
    assert.equal(calls, 3);
  });

  it("returns an empty array for an empty table", async () => {
    let calls = 0;
    const rows = await fetchAllSupabasePages<number>(async () => {
      calls += 1;
      return { data: [], error: null };
    }, "empty_table");

    assert.deepEqual(rows, []);
    assert.equal(calls, 1);
  });

  it("fails with the table label when a later page query errors", async () => {
    await assert.rejects(
      () => fetchAllSupabasePages<number>(async (from) => {
        if (from === 0) {
          return { data: makeRows(1000), error: null };
        }
        return { data: null, error: { message: "network failure" } };
      }, "schedule_master"),
      /schedule_master: network failure/,
    );
  });
});
