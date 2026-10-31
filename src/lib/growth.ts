export const G_STATUS: Record<string, { label: string; tone: "neutral" | "info" | "good" | "warn" | "bad"; step: number }> = {
  draft: { label: "Draft", tone: "neutral", step: 0 },
  submitted: { label: "Submitted", tone: "info", step: 1 },
  in_review: { label: "In review", tone: "info", step: 2 },
  proposal_sent: { label: "Proposal sent", tone: "warn", step: 3 },
  approved: { label: "Approved", tone: "good", step: 4 },
  in_progress: { label: "In progress", tone: "info", step: 5 },
  awaiting_approval: { label: "Awaiting your approval", tone: "warn", step: 5 },
  delivered: { label: "Delivered", tone: "good", step: 6 },
  closed: { label: "Closed", tone: "neutral", step: 7 },
  declined: { label: "Declined", tone: "bad", step: -1 },
};
export const PIPELINE = ["Draft", "Submitted", "In review", "Proposal", "Approved", "In progress", "Delivered", "Closed"];

export interface Transition { to: string; label: string; tone: "primary" | "secondary" | "danger" | "good"; confirm?: string }
export const OWNER_ACTIONS: Record<string, Transition[]> = {
  draft: [{ to: "submitted", label: "Submit request", tone: "primary" }],
  proposal_sent: [{ to: "approved", label: "Approve proposal", tone: "primary" }, { to: "declined", label: "Decline", tone: "danger", confirm: "Decline this proposal? The request will be closed." }],
  delivered: [{ to: "closed", label: "Close request", tone: "secondary" }],
};
export const OPERATOR_ACTIONS: Record<string, Transition[]> = {
  submitted: [{ to: "in_review", label: "Start review", tone: "primary" }],
  in_review: [{ to: "proposal_sent", label: "Send proposal", tone: "primary" }, { to: "declined", label: "Decline request", tone: "danger", confirm: "Decline this request?" }],
  approved: [{ to: "in_progress", label: "Start work", tone: "primary" }],
  in_progress: [{ to: "awaiting_approval", label: "Request approval", tone: "secondary" }, { to: "delivered", label: "Mark delivered", tone: "good" }],
  awaiting_approval: [{ to: "in_progress", label: "Back to in progress", tone: "secondary" }, { to: "delivered", label: "Mark delivered", tone: "good" }],
  delivered: [{ to: "closed", label: "Close request", tone: "secondary" }],
};

export const fileSize = (n: number | null) => (n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export const MAX_FILE = 2 * 1024 * 1024;
