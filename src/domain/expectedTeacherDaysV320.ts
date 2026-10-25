/** Estimated obligation-days are NOT a physical-attendance record. */
export interface ExpectedTeacherDaysSummary {
  expectedTeacherDays: number;
  calendarTermDays: number;
  leaveDaysOutsideCalendar: number;
  status: 'ESTIMATED' | 'PARTIAL' | 'UNAVAILABLE';
}
const isCount=(value:unknown):value is number=>Number.isInteger(value)&&typeof value==='number'&&value>=0;

export function parseExpectedTeacherDays(value:unknown):ExpectedTeacherDaysSummary {
  if(!value||typeof value!=='object'||Array.isArray(value)) {
    throw new Error('Format total guru-hari kewajiban tidak valid.');
  }
  const row=value as Record<string,unknown>;
  if(!isCount(row.expected_teacher_days)||!isCount(row.calendar_term_days)||
     !isCount(row.leave_days_outside_calendar)||
     !['ESTIMATED','PARTIAL','UNAVAILABLE'].includes(String(row.status))) {
    throw new Error('Data guru-hari kewajiban tidak lengkap atau tidak valid.');
  }
  return {expectedTeacherDays:row.expected_teacher_days,
    calendarTermDays:row.calendar_term_days,
    leaveDaysOutsideCalendar:row.leave_days_outside_calendar,
    status:row.status as ExpectedTeacherDaysSummary['status']};
}

/** Do not publish a percentage when the operational calendar is incomplete. */
export function teacherDayLeaveRate(numerator:number, summary:ExpectedTeacherDaysSummary|null):number|null {
  if(!summary||summary.status!=='ESTIMATED'||summary.expectedTeacherDays<=0||
     !Number.isFinite(numerator)||numerator<0||numerator>summary.expectedTeacherDays) return null;
  return numerator/summary.expectedTeacherDays*100;
}
