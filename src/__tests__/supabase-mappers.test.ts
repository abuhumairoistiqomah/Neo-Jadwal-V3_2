import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mapAcademicEventRows,
  mapCoverageRows,
  mapIncidentalRows,
  mapRelationalScheduleRows,
  mapRoomRows,
  mapScheduleRows,
  mapTeacherRows,
  type ClassRow,
  type TeacherRow,
} from "../infrastructure/repositories/supabaseScheduleMappers.ts";

const teachers: TeacherRow[] = [
  {
    id: "teacher-1",
    full_name: "UST. AHMAD",
    short_name: "Ahmad",
    primary_subjects_text: "Mathematics",
    subject_cluster: "Math",
    levels_text: "SMP",
    additional_task: "Wali Kelas",
    notes: "",
  },
  {
    id: "teacher-2",
    full_name: "UST. BILAL",
    short_name: "Bilal",
  },
];

const classes: ClassRow[] = [
  {
    id: "class-1",
    code: "06-INTER-1-I",
    display_name: "06 INTER 1 I",
  },
];

describe("V3.5 Supabase mapper — master data", () => {
  it("maps teacher rows into the legacy-compatible domain contract", () => {
    const result = mapTeacherRows(teachers);
    assert.equal(result[0]?.nama, "UST. AHMAD");
    assert.equal(result[0]?.panggilan, "Ahmad");
    assert.equal(result[0]?.mapel_utama, "Mathematics");
    assert.equal(result[0]?.rumpun, "Math");
  });

  it("maps room aliases back to the existing pipe-delimited format", () => {
    const result = mapRoomRows([
      {
        id: "LABKOM",
        name: "Laboratorium Komputer",
        aliases: ["Lab Komputer", "Ruang Komputer"],
        capacity: 25,
        status: "ACTIVE",
      },
    ]);

    assert.equal(result[0]?.id_ruangan, "LABKOM");
    assert.equal(result[0]?.alias, "Lab Komputer|Ruang Komputer");
    assert.equal(result[0]?.status, "Aktif");
  });
});

describe("V3.5 Supabase mapper — recurring schedule", () => {
  it("reconstructs guru1..guru6, day name, and legacy booleans", () => {
    const result = mapScheduleRows({
      classes,
      teachers,
      scheduleMaster: [
        {
          id: "schedule-1",
          class_id: "class-1",
          day_of_week: 1,
          period: 3,
          start_time: "10:00:00",
          end_time: "11:00:00",
          subject: "Mathematics",
          room_id: "LABKOM",
          is_combined: true,
          other_teachers_supervise: false,
          special_note: "Native",
        },
      ],
      scheduleTeachers: [
        {
          schedule_id: "schedule-1",
          position: 1,
          teacher_id: "teacher-1",
          teacher_name_snapshot: "",
        },
        {
          schedule_id: "schedule-1",
          position: 2,
          teacher_id: "teacher-2",
          teacher_name_snapshot: "",
        },
      ],
    });

    assert.deepEqual(result[0], {
      id: "schedule-1",
      kelas: "06 INTER 1 I",
      hari: "Senin",
      jam_ke: 3,
      mulai: "10:00",
      selesai: "11:00",
      mapel: "Mathematics",
      guru1: "UST. AHMAD",
      guru2: "UST. BILAL",
      guru3: "",
      guru4: "",
      guru5: "",
      guru6: "",
      kelasgabung: "Ya",
      ruangan: "LABKOM",
      selainguru1_mengawas: "Tidak",
      keterangan_khusus: "Native",
    });
  });
});

describe("V3.5 Supabase mapper — incidentals", () => {
  it("preserves null database overrides as blank legacy values so V3.3 inherits master fields", () => {
    const result = mapIncidentalRows({
      classes,
      teachers,
      scheduleIncidentals: [
        {
          id: "inc-1",
          schedule_date: "2026-10-05",
          class_id: "class-1",
          period: 2,
          kind: "OVERRIDE",
          override_subject: null,
          override_room_id: "LABKOM",
          override_is_combined: null,
          override_special_note: null,
          reason: "Pindah ruangan",
        },
      ],
      incidentalTeacherOverrides: [],
    });

    assert.equal(result[0]?.mapel, "");
    assert.equal(result[0]?.guru1, "");
    assert.equal(result[0]?.kelasgabung, "");
    assert.equal(result[0]?.ruangan, "LABKOM");
  });

  it("maps SET teacher overrides to the correct teacher position", () => {
    const result = mapIncidentalRows({
      classes,
      teachers,
      scheduleIncidentals: [
        {
          id: "inc-2",
          schedule_date: "2026-10-05",
          class_id: "class-1",
          period: 2,
        },
      ],
      incidentalTeacherOverrides: [
        {
          incidental_id: "inc-2",
          position: 2,
          action: "SET",
          teacher_id: "teacher-2",
        },
      ],
    });

    assert.equal(result[0]?.guru1, "");
    assert.equal(result[0]?.guru2, "UST. BILAL");
  });

  it("fails loudly on CLEAR until the canonical domain supports explicit teacher removal", () => {
    assert.throws(
      () =>
        mapIncidentalRows({
          classes,
          teachers,
          scheduleIncidentals: [
            {
              id: "inc-clear",
              schedule_date: "2026-10-05",
              class_id: "class-1",
              period: 2,
            },
          ],
          incidentalTeacherOverrides: [
            {
              incidental_id: "inc-clear",
              position: 1,
              action: "CLEAR",
            },
          ],
        }),
      /not yet representable/,
    );
  });
});

describe("V3.5 Supabase mapper — academic calendar and coverage", () => {
  it("maps class-scoped academic events with JP 0 preserved", () => {
    const result = mapAcademicEventRows(
      [
        {
          id: "event-row-1",
          legacy_event_code: "LIB003A",
          date_start: "2026-10-01",
          date_end: "2026-10-01",
          event_name: "Kegiatan",
          event_type: "Kegiatan Selain KBM Normal",
          scope: "CLASS",
          class_id: "class-1",
          period_start: 0,
          period_end: 2,
          status: "ACTIVE",
        },
      ],
      classes,
    );

    assert.equal(result[0]?.id, "LIB003A");
    assert.equal(result[0]?.cakupan, "Kelas");
    assert.equal(result[0]?.kelas, "06 INTER 1 I");
    assert.equal(result[0]?.jp_mulai, 0);
    assert.equal(result[0]?.jp_selesai, 2);
  });

  it("maps coverage slots into the existing LogIzin contract", () => {
    const result = mapCoverageRows(
      [
        {
          id: "coverage-1",
          schedule_date: "2026-10-06",
          class_id: "class-1",
          period: 4,
          subject_snapshot: "Mathematics",
          absent_teacher_id: "teacher-1",
          substitute_teacher_id: "teacher-2",
          reason_snapshot: "Izin",
          status: "ASSIGNED",
        },
      ],
      classes,
      teachers,
    );

    assert.equal(result[0]?.guru_izin, "UST. AHMAD");
    assert.equal(result[0]?.guru_pengganti, "UST. BILAL");
    assert.equal(result[0]?.kelas, "06 INTER 1 I");
    assert.equal(result[0]?.jam_ke, 4);
  });
});

describe("V3.5 Supabase mapper — complete snapshot", () => {
  it("builds the same domain-shaped snapshot expected by the schedule engine", () => {
    const snapshot = mapRelationalScheduleRows({
      teachers,
      classes,
      rooms: [],
      scheduleMaster: [],
      scheduleTeachers: [],
      scheduleIncidentals: [],
      incidentalTeacherOverrides: [],
      academicEvents: [],
      coverageSlots: [],
    });

    assert.equal(snapshot.teachers.length, 2);
    assert.deepEqual(snapshot.schedules, []);
    assert.deepEqual(snapshot.logs, []);
    assert.deepEqual(snapshot.jadwalInsidental, []);
    assert.deepEqual(snapshot.kalenderAkademik, []);
  });
});

describe("V3.7 Supabase mapper — Dashboard compatibility", () => {
  it("derives wali/pendamping/manajemen flags the same way as the legacy App mapper", () => {
    const result = mapTeacherRows([
      {
        id: "teacher-wali",
        full_name: "UST. WALI",
        additional_task: "Wali Kelas",
        notes: "06 INTER 1 I",
      },
      {
        id: "teacher-pendamping",
        full_name: "UST. PENDAMPING",
        additional_task: "Pendamping Kelas",
        notes: "06 INTER 2 A",
      },
      {
        id: "teacher-management",
        full_name: "UST. MANAGEMENT",
        additional_task: "Manajemen",
        notes: "Wakasek",
      },
    ]);

    assert.equal(result[0]?.wali_kelas, "06 INTER 1 I");
    assert.equal(result[1]?.pendamping_kelas, "06 INTER 2 A");
    assert.equal(result[2]?.is_manajemen, true);
  });

  it("reconstructs legacy task text from learning_tasks and task_resources", () => {
    const result = mapCoverageRows(
      [
        {
          id: "coverage-task",
          schedule_date: "2026-10-06",
          class_id: "class-1",
          period: 4,
          subject_snapshot: "Mathematics",
          absent_teacher_id: "teacher-1",
          status: "ASSIGNED",
        },
      ],
      classes,
      teachers,
      [
        {
          id: "task-1",
          coverage_slot_id: "coverage-task",
          description: "Kerjakan halaman 12",
        },
      ],
      [
        {
          id: "resource-1",
          task_id: "task-1",
          resource_type: "LINK",
          url: "https://example.com/task",
        },
      ],
    );

    assert.equal(result[0]?.tugas, "Kerjakan halaman 12\nhttps://example.com/task");
  });

  it("RC4.2: repairs missing subject using dated override before weekday master without inventing teacher subject", () => {
    const missingSubject = {
      id: "blank-subject", schedule_date: "2026-10-21", class_id: "class-1", period: 2,
      subject_snapshot: "", absent_teacher_id: "teacher-1", status: "ASSIGNED",
      substitute_teacher_id: "teacher-2",
    };
    const master = [{id:"master-1",class_id:"class-1",day_of_week:3,period:2,subject:"Al-Qur'an",is_active:true}];
    const incidentals = [{id:"dated-1",schedule_date:"2026-10-21",class_id:"class-1",period:2,override_subject:"Tahsin"}];
    const dated = mapCoverageRows([missingSubject], classes, teachers, [], [], master, incidentals);
    assert.equal(dated[0]?.mapel, "Tahsin");
    assert.equal(dated[0]?.coverage_status, "ASSIGNED");
    const fallback = mapCoverageRows([missingSubject], classes, teachers, [], [], master, []);
    assert.equal(fallback[0]?.mapel, "Al-Qur'an");
    const newerWithoutSubject = [{...incidentals[0],id:"dated-2",updated_at:"2026-10-21T09:00:00Z",override_subject:""}];
    const previousWithTimestamp = [{...incidentals[0],updated_at:"2026-10-21T08:00:00Z"}];
    const inherits = mapCoverageRows([missingSubject],classes,teachers,[],[],master,[...previousWithTimestamp,...newerWithoutSubject]);
    assert.equal(inherits[0]?.mapel,"Al-Qur'an");
    const snapshot = mapCoverageRows([{...missingSubject,subject_snapshot:"Tajwid"}], classes, teachers, [], [], master, incidentals);
    assert.equal(snapshot[0]?.mapel, "Tajwid");
    const historical = mapCoverageRows([{...missingSubject,class_id:null,class_name_snapshot:"06 INTER 1 I"}],classes,teachers,[],[],master,[]);
    assert.equal(historical[0]?.mapel,"Al-Qur'an");
    const unresolved = mapCoverageRows([missingSubject], classes, teachers);
    assert.equal(unresolved[0]?.mapel, "");
  });

  it("RC4.2: no-substitute and waiting statuses stay distinguishable without fake replacement", () => {
    const base = {id:"n",schedule_date:"2026-10-21",class_id:"class-1",period:2,subject_snapshot:"Math",absent_teacher_id:"teacher-1"};
    const rows = mapCoverageRows([{...base,status:"NO_SUBSTITUTE"},{...base,id:"w",status:"WAITING"}],classes,teachers);
    assert.equal(rows[0].coverage_status,"NO_SUBSTITUTE");
    assert.equal(rows[1].coverage_status,"WAITING");
    assert.equal(rows[0].guru_pengganti,"");
    assert.equal(rows[1].guru_pengganti,"");
  });

  it("preserves historical class snapshot when legacy coverage has class_id null", () => {
    const result = mapCoverageRows(
      [
        {
          id: "coverage-history",
          schedule_date: "2026-10-06",
          class_id: null,
          class_name_snapshot: "LEGACY CLASS",
          period: 4,
          subject_snapshot: "Mathematics",
          absent_teacher_name_snapshot: "OLD TEACHER",
          status: "NO_SUBSTITUTE",
        },
      ],
      classes,
      teachers,
    );

    assert.equal(result[0]?.kelas, "LEGACY CLASS");
    assert.equal(result[0]?.guru_izin, "OLD TEACHER");
  });
});
