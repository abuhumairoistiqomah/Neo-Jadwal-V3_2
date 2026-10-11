import type {
  LeaveDecisionResult,
  LeaveReviewRequest,
  WaitingCoverageRow,
} from "../../domain/leaveApproval";

export interface LeaveApprovalRepository {
  listSubmittedRequests(limit?: number): Promise<LeaveReviewRequest[]>;
  decideRequest(input: {
    leaveRequestId: string;
    decision: "APPROVE" | "DECLINE";
    note?: string;
  }): Promise<LeaveDecisionResult>;
  listWaitingCoverage(limit?: number): Promise<WaitingCoverageRow[]>;
}
