/** Pure, Jakarta-date safe visibility rules for an admin list of approved leaves.
 * ISO dates sort lexicographically, so no browser timezone conversion is needed. */
export function approvedLeaveVisible<T extends {dateEnd:string;deleted:boolean}>(
  requests:readonly T[], today:string, showPast=false, showDeleted=false,
):T[] {
  return requests.filter(row=>(showPast||row.dateEnd>=today)&&(showDeleted||!row.deleted));
}

/** One old period may contain several joined classes; edit the whole session. */
export function approvedLeaveEditableSessions(
  rows:readonly {scheduleDate:string;period:number;deleted:boolean}[],
):Array<{date:string;period:number}> {
  const unique=new Map<string,{date:string;period:number}>();
  for(const row of rows) {
    if(row.deleted) continue;
    const key=`${row.scheduleDate}|${row.period}`;
    if(!unique.has(key)) unique.set(key,{date:row.scheduleDate,period:row.period});
  }
  return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.period-b.period);
}

/** Present missing migration as a schema error, not as an empty request list.
 * Intentionally fail closed: the migration supplies audited writes and RLS.
 * A read-only fallback would make the UI appear operational without the RPCs. */
export function explainApprovedLeaveDatabaseError(message: string): string {
  if (/(?:leave_requests\.(?:deleted_at|deleted_previous_status)|coverage_slots\.deleted_previous_status)/i.test(message)
      && /(?:does not exist|not found|schema cache)/i.test(message)) {
    return 'Skema Supabase belum sesuai V3.17.2: ' + message
      + '. Terapkan migrasi 202610180002_v3_17_2_leave_maintenance_staff_submission.sql'
      + ' di proyek Supabase yang dipakai aplikasi, kemudian Refresh. Daftar belum berhasil dibaca (bukan kosong).';
  }
  return message;
}
