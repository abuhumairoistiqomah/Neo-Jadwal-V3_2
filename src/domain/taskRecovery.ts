export interface StoredTaskAccess {
  requestCode: string;
  teacherName: string;
  scheduleDate: string;
  uploadToken: string;
  expiresAt: string;
}

const STORAGE_KEY = "ejadwal_task_access_v1";

function normalize(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("id-ID");
}

export function readStoredTaskAccess(): StoredTaskAccess[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.requestCode && item.uploadToken) : [];
  } catch {
    return [];
  }
}

export function saveStoredTaskAccess(access: StoredTaskAccess): void {
  const current = readStoredTaskAccess().filter((item) => item.requestCode !== access.requestCode);
  current.unshift(access);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current.slice(0, 40)));
}

export function findStoredTaskAccess(teacherName: string, scheduleDate: string): StoredTaskAccess | null {
  const teacherKey = normalize(teacherName);
  return readStoredTaskAccess().find((item) => (
    normalize(item.teacherName) === teacherKey
    && item.scheduleDate === scheduleDate
    && Boolean(item.uploadToken)
  )) || null;
}
