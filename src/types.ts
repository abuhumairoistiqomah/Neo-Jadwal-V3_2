/**
 * Backward-compatible public facade for V3.2.
 *
 * Existing screens may keep importing from `types` while the implementation is
 * physically separated into domain/constants/UI modules. New code should prefer
 * importing from the owning module directly.
 */
export type {
  Teacher,
  MasterRuanganItem,
  ResolvedRoomInfo,
  ScheduleItem,
  LogIzinItem,
  JadwalInsidentalItem,
  AdminAccount,
  ActivePage,
  DBState,
  KalenderAkademikItem,
} from "./domain/models";

export { resolveRoomInfo, matchRoomId, getRoomDisplayName } from "./domain/room";
export { normalizeDay, isSameDay, getSchoolWeekDateStrings, normalizeDateString, isDateInRange } from "./domain/date";
export { isCombinedClassValue, isClassMatch, isGrade1Or2 } from "./domain/class";
export { hasMeaningfulValue, checkIsITBA, isAlQuranOrTahsin, isITBACoreSubject, checkIsNative } from "./domain/teacher";
export {
  isAcademicCalendarActive,
  isClassCoveredByEvent,
  isWholeDayAcademicEvent,
  isJpCoveredByEvent,
  getAcademicCalendarEvent,
  getAcademicCalendarEventsForDate,
} from "./domain/calendar";
export { getSmartLinkLabel, renderTaskWithLinks } from "./ui/taskLinks";
export { JAM_TIME_MAP, SCHOOL_DAYS, TEACHING_JPS, LEAVE_JPS, DAY_ORDER, RECOMMENDED_WEEKLY_JP_LIMIT } from "./constants/schedule";
export {
  buildEffectiveScheduleForDate,
  getActiveEffectiveSchedules,
} from "./domain/schedule/effectiveSchedule";
export type {
  BuildEffectiveScheduleForDateInput,
  EffectiveScheduleItem,
  EffectiveScheduleSource,
  EffectiveSubstitution,
} from "./domain/schedule/effectiveSchedule";
