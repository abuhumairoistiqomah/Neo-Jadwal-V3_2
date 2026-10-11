/** Shared school schedule constants.
 *
 * UI components must consume these values from here rather than importing them
 * from another component or redefining identical arrays locally.
 */
export const JAM_TIME_MAP: Record<number, string> = {
  0: "07:00 - 07:40",
  1: "07:30 - 08:15",
  2: "08:15 - 09:00",
  3: "09:00 - 09:45",
  4: "10:15 - 11:00",
  5: "11:00 - 11:45",
  6: "11:45 - 12:30"
};

export const SCHOOL_DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"] as const;
export const TEACHING_JPS = [1, 2, 3, 4, 5, 6] as const;
export const LEAVE_JPS = [0, 1, 2, 3, 4, 5, 6] as const;

export const DAY_ORDER: Record<string, number> = {
  Senin: 1,
  Selasa: 2,
  Rabu: 3,
  Kamis: 4,
  Jumat: 5,
};

export const RECOMMENDED_WEEKLY_JP_LIMIT = 24;
