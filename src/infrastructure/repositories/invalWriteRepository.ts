import type { InvalWriteBundle } from "../../domain/inval/invalWrite";

export interface InvalWriteResult {
  requestId: string;
  coverageSlotIds: string[];
  roomIncidentalId: string | null;
}

export interface RecentOperationalCoverageRow {
  id: string;
  source: string;
  status: string;
  createdAt: string;
}

export interface AuditLogRow {
  id: number;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string | null;
  createdAt: string;
}

export interface InvalWriteRepository {
  saveBundle(bundle: InvalWriteBundle): Promise<InvalWriteResult>;
  updateAssignment(input: {
    coverageSlotId: string;
    substituteTeacherId: string;
    taskText?: string;
    constraintIds?: string[];
    overrideNote?: string;
  }): Promise<{ coverageSlotId: string; requestId: string }>;
  deleteAssignment(input: {
    coverageSlotId: string;
    deleteNote?: string;
  }): Promise<{ coverageSlotId: string; requestId: string }>;
  listRecentOperationalCoverage(limit?: number): Promise<RecentOperationalCoverageRow[]>;
  listRecentAuditLogs(limit?: number): Promise<AuditLogRow[]>;
}
