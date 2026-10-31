export interface MyAppt {
  id: string; status: string; starts_at: Date; ends_at: Date; source: string; practice_id: string; practice_name: string; practitioner_id: string; practitioner_name: string;
  speciality: string; service_name: string; price_cents: number | null; address: string | null; city: string | null; cancellation_notice_hours: number; can_cancel: boolean;
}

export const STATUS_UI: Record<string, { label: string; tone: "info" | "good" | "warn" | "bad" | "neutral" }> = {
  booked: { label: "Booked", tone: "info" }, confirmed: { label: "Confirmed", tone: "good" }, checked_in: { label: "Checked in", tone: "good" },
  in_progress: { label: "In consultation", tone: "info" }, completed: { label: "Completed", tone: "neutral" }, cancelled: { label: "Cancelled", tone: "bad" }, no_show: { label: "Missed", tone: "warn" },
};
