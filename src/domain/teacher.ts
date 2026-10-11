import type { Teacher } from "./models";

export function hasMeaningfulValue(value: any): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export function checkIsITBA(teacher: Teacher | undefined): boolean {
  if (!teacher) return false;
  const name = (teacher.nama || "").toUpperCase();
  const tugas = (teacher.tugas_tambahan || "").toUpperCase();
  const ket = (teacher.keterangan || "").toUpperCase();
  const mapel = (teacher.mapel_utama || "").toUpperCase();
  return (
    name.includes("ITBA") || 
    tugas.includes("ITBA") || 
    ket.includes("ITBA") ||
    mapel.includes("ITBA") ||
    name.includes("KHOLID") ||
    name.includes("HARIYADI")
  );
}

export function isAlQuranOrTahsin(mapelName: string): boolean {
  if (!mapelName) return false;
  const sName = mapelName.trim().toLowerCase();
  return (
    sName.includes("qur'an") || 
    sName.includes("quran") || 
    sName.includes("tahsin") || 
    sName.includes("tajwid") ||
    sName.includes("tahfidz") ||
    sName.includes("tahfizh") ||
    sName.includes("tahfid") ||
    sName.includes("tilawah") ||
    sName.includes("murottal")
  );
}

export function isITBACoreSubject(mapelName: string, teacherName?: string): boolean {
  if (!mapelName) return false;
  const sName = mapelName.trim().toLowerCase();
  
  // Arabic & Qur'an core subjects
  const isCoreQuranyOrArabic = 
    sName.includes("qur'an") || 
    sName.includes("quran") || 
    sName.includes("tahsin") || 
    sName.includes("tajwid") ||
    sName.includes("tahfidz") ||
    sName.includes("tahfizh") ||
    sName.includes("tahfid") ||
    sName.includes("tilawah") ||
    sName.includes("murottal") ||
    sName.includes("arabic") ||
    sName.includes("bahasa arab") ||
    sName.includes("arab") ||
    sName.includes("b. arab") ||
    sName.includes("b.arab");

  if (isCoreQuranyOrArabic) return true;

  // PE for Kholid or Hariyadi
  if (teacherName) {
    const tUpper = teacherName.toUpperCase();
    const isKholidOrHariyadiq = 
      tUpper.includes("KHOLID") || 
      tUpper.includes("HARIYADIQ") ||
      tUpper.includes("HARIYADI");
    
    if (isKholidOrHariyadiq) {
      const isPE = 
        sName.includes("pe") || 
        sName.includes("pjok") || 
        sName.includes("penjas") || 
        sName.includes("olahraga") ||
        sName.includes("physical");
      if (isPE) return true;
    }
  }

  return false;
}


export function checkIsNative(teacher: Teacher | undefined): boolean {
  if (!teacher) return false;
  const name = (teacher.nama || "").toLowerCase();
  const tugas = (teacher.tugas_tambahan || "").toLowerCase();
  const ket = (teacher.keterangan || "").toLowerCase();
  const mapel = (teacher.mapel_utama || "").toLowerCase();
  const rumpun = (teacher.rumpun || "").toLowerCase();

  return (
    name.includes("syaikh") ||
    name.includes("syekh") ||
    name.includes("native") ||
    tugas.includes("native") ||
    tugas.includes("syaikh") ||
    ket.includes("native") ||
    mapel.includes("native") ||
    rumpun.includes("native")
  );
}

