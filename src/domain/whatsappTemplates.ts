import type { Teacher } from "./models";

function norm(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("id-ID");
}

export function findTeacherByName(teachers: Teacher[], name: string): Teacher | undefined {
  const key = norm(name);
  return teachers.find((teacher) => norm(teacher.nama) === key);
}

export function teacherHonorific(teacher?: Teacher | null): string {
  const gender = String(teacher?.gender || "UNKNOWN").trim().toUpperCase();
  if (gender === "IKHWAN") return "Ustadz";
  if (gender === "AKHWAT") return "Ustadzah";
  return "Ustadz/Ustadzah";
}

export function friendlyTeacherAddress(name: string, teacher?: Teacher | null): string {
  const cleanName = String(name || "").trim();
  return `${teacherHonorific(teacher)} ${cleanName}`.trim();
}

export function whatsappDigits(raw?: string | null): string {
  return String(raw || "").replace(/[^0-9]/g, "");
}

export function buildTaskRequestWhatsappMessage(args: {
  recipientName: string;
  recipientTeacher?: Teacher | null;
  senderName: string;
  dateLabel: string;
  period: number;
  subject: string;
  className: string;
}): string {
  const recipient = friendlyTeacherAddress(args.recipientName, args.recipientTeacher);
  return [
    `Assalamu'alaikum warahmatullahi wabarakatuh, ${recipient}.`,
    `Afwan, ana ingin meminta tugas atau materi untuk jadwal badal yang ana pegang pada ${args.dateLabel}. Saat ini tugasnya belum muncul di E-Jadwal.`,
    `Ana ${args.senderName}, yang dijadwalkan menjadi guru badal pada sesi tersebut.`,
    `📚 Mata Pelajaran: ${args.subject}\n🏫 Kelas: ${args.className}\n🕒 JP: ${args.period}\n👤 Guru Pengampu: ${args.recipientName}`,
    `Jika berkenan, tugas atau materinya boleh dikirim melalui WhatsApp ini atau dilengkapi melalui menu Lengkapi Tugas di E-Jadwal.`,
    `Jazakumullahu khairan. Semoga Allah mudahkan urusannya.`,
  ].join("\n\n");
}

export function buildLateTaskHandoffWhatsappMessage(args: {
  substituteName: string;
  substituteTeacher?: Teacher | null;
  absentTeacherName: string;
  dateLabel: string;
  period: number;
  subject: string;
  className: string;
}): string {
  const recipient = friendlyTeacherAddress(args.substituteName, args.substituteTeacher);
  return [
    `Assalamu'alaikum warahmatullahi wabarakatuh, ${recipient}.`,
    `Afwan, ana ingin mengabarkan terkait jadwal badal ${args.dateLabel} • JP ${args.period}. Tugas/materialnya belum berhasil ana lengkapi di E-Jadwal.`,
    `📚 Mata Pelajaran: ${args.subject}\n🏫 Kelas: ${args.className}\n👤 Guru Pengampu: ${args.absentTeacherName}`,
    `InsyaAllah tugas atau materinya ana kirim atau konfirmasi melalui WhatsApp ini.`,
    `Jazakumullahu khairan atas bantuannya. Semoga Allah mudahkan aktivitasnya.`,
  ].join("\n\n");
}

export function buildDeclineLeaveWhatsappMessage(args: {
  teacherName: string;
  teacher?: Teacher | null;
  requestCode: string;
  dateLabel: string;
  note: string;
}): string {
  const recipient = friendlyTeacherAddress(args.teacherName, args.teacher);
  return [
    `Assalamu'alaikum warahmatullahi wabarakatuh, ${recipient}.`,
    `Afwan, ana ingin menyampaikan bahwa pengajuan izin ${args.requestCode} untuk ${args.dateLabel} belum dapat kami setujui.`,
    `Catatan dari Wakakur:\n${args.note}`,
    `Jika ada hal yang ingin diklarifikasi, silakan menghubungi Wakakur ya.`,
    `Jazakumullahu khairan atas pengertiannya. Semoga Allah mudahkan segala urusannya.`,
  ].join("\n\n");
}

export function buildSubstituteReminderWhatsappMessage(args: {
  substituteName: string;
  substituteTeacher?: Teacher | null;
  absentTeacherName: string;
  dateLabel: string;
  period: number;
  subject: string;
  className: string;
  task?: string | null;
}): string {
  const recipient = friendlyTeacherAddress(args.substituteName, args.substituteTeacher);
  const blocks = [
    `Assalamu'alaikum warahmatullahi wabarakatuh, ${recipient}.`,
    `Afwan, ana ingin mengingatkan jadwal badal yang tercatat untuk ${args.dateLabel} ya.`,
    `📚 Mata Pelajaran: ${args.subject}\n🏫 Kelas: ${args.className}\n🕒 JP: ${args.period}\n👤 Menggantikan: ${args.absentTeacherName}`,
  ];
  if (String(args.task || "").trim()) {
    blocks.push(`📝 Kegiatan/Tugas Siswa:\n${String(args.task).trim()}`);
  }
  blocks.push(`Jazakumullahu khairan atas kesediaannya membantu. Semoga Allah mudahkan aktivitas hari ini.`);
  return blocks.join("\n\n");
}

export function buildLeaveReviewWhatsappMessage(args: {
  teacherName: string;
  teacher?: Teacher | null;
  requestCode: string;
  dateLabel: string;
  reason: string;
  periodLabel: string;
  adminNote?: string | null;
}): string {
  const recipient = friendlyTeacherAddress(args.teacherName, args.teacher);
  const blocks = [
    `Assalamu'alaikum warahmatullahi wabarakatuh, ${recipient}.`,
    `Afwan, ana ingin mengonfirmasi pengajuan izin ${args.requestCode} untuk ${args.dateLabel} sebelum kami proses lebih lanjut.`,
    `🕒 JP Ketidakhadiran: ${args.periodLabel}\n📝 Alasan: ${args.reason || "-"}`,
  ];
  if (String(args.adminNote || "").trim()) {
    blocks.push(`Ada hal yang ingin ana konfirmasi:\n${String(args.adminNote).trim()}`);
  } else {
    blocks.push(`Jika berkenan, mohon konfirmasi singkat melalui WhatsApp ini apabila ada informasi tambahan yang perlu Wakakur ketahui.`);
  }
  blocks.push(`Jazakumullahu khairan. Semoga Allah mudahkan segala urusannya.`);
  return blocks.join("\n\n");
}
