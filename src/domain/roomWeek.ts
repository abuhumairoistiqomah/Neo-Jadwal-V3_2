/** School week dates in local time. Monday-Friday; never shift weekday names. */
export interface RoomWeekDay {
  name: "Senin" | "Selasa" | "Rabu" | "Kamis" | "Jumat";
  dateStr: string;
  displayDate: string;
}

export function buildRoomWeekDays(referenceDate = new Date(), weekOffset = 0): RoomWeekDay[] {
  const current = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const weekday = current.getDay();
  const previousMonday = new Date(current);
  previousMonday.setDate(current.getDate() - ((weekday + 6) % 7));
  // On weekends, the default view is the *next* school week.
  if (weekday === 0 || weekday === 6) {
    previousMonday.setDate(previousMonday.getDate() + 7);
  }
  previousMonday.setDate(previousMonday.getDate() + weekOffset * 7);
  const names = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat"] as const;
  return names.map((name, index) => {
    const date = new Date(previousMonday);
    date.setDate(previousMonday.getDate() + index);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return {
      name,
      dateStr: `${year}-${month}-${day}`,
      displayDate: date.toLocaleDateString("id-ID", { day: "numeric", month: "short" }),
    };
  });
}
