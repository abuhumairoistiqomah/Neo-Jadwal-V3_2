import type { PublicLeaveSubmissionPayload } from "../../domain/leaveRequest";

export interface PublicLeaveSubmitResult {
  requestId: string;
  requestCode: string;
  status: "SUBMITTED" | string;
  slotCount: number;
  teachingSlotCount: number;
  freePeriodCount: number;
  taskUploadToken: string;
  taskUploadExpiresAt: string;
  taskCount: number;
}

export interface PublicLeaveRepository {
  submit(payload: PublicLeaveSubmissionPayload): Promise<PublicLeaveSubmitResult>;
}
