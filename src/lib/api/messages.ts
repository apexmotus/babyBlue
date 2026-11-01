/**
 * The user-facing error contract, in one place.
 *
 * Every key is a machine code raised by a stored procedure (`raise exception '<code>'`),
 * by the `slot_holds_quota()` trigger, or by a named check constraint. The API returns the
 * code in `ProblemDetails.extensions.code` and never the prose, so this map is the single
 * source of the wording across the web app and any other client.
 *
 * This module has no dependencies on purpose: `src/local/db.ts` is a `"use client"` module
 * that pulls in PGlite and a Worker, so Server Components and `src/lib/api/http.ts` cannot
 * import from it. They import from here instead, and `db.ts` re-exports for the demo paths.
 *
 * `tests/unit/error-codes.test.ts` asserts that `PROCEDURE_CODES`, the API's
 * `ProblemDetailsExceptionHandler.Codes`, and the SQL `raise exception` literals are the
 * same set, and that every code either side can emit has prose here. Adding a code means
 * adding it in all three places.
 */
export const MESSAGES: Record<string, string> = {
  // booking and holds
  slot_unavailable: "Sorry, that time was just taken. Please choose another.",
  hold_expired: "Your held time ran out. Please pick a time again.",
  too_many_holds: "You're holding several times already. Please book or release one before holding another.",
  too_late_to_cancel: "This is inside the practice's cancellation window, so it can't be changed online. Please contact the practice.",
  not_cancellable: "This appointment can no longer be cancelled.",
  not_reschedulable: "This appointment can no longer be rescheduled.",
  too_early_to_check_in: "Check-in opens 2 hours before your appointment.",
  not_checkin_able: "This appointment can't be checked in.",
  invalid_transition: "That status change isn't allowed from the current status.",
  queue_closed: "This practice isn't accepting the queue right now.",

  // team, roles and account
  user_not_found: "No BabyBlue account uses that email yet. Ask them to sign up first.",
  sole_owner: "You're the only owner of this practice, so you can't be removed. Add another owner first.",
  has_records: "This account still has records attached and can't be deleted automatically. Contact us to complete the request.",

  // practitioners and registrations
  registration_in_use: "That registration number is already linked to another profile.",
  invalid_registration: "Enter the registration body and a registration number.",

  // services and availability
  service_in_use: "This service has upcoming appointments, so it can't be deactivated yet.",
  last_practitioner: "This service has upcoming appointments, so it needs at least one practitioner.",
  price_required: "Set a price before making this service bookable.",
  overlapping_availability: "These hours overlap hours you've already set. Adjust them and try again.",
  invalid_range: "That date range isn't valid. Check the start and end.",

  // clients and consent
  consent_required: "This client hasn't consented to having their records stored, so you can't book for them yet.",

  // growth
  asset_too_large: "That file is too large. The limit is 5 MB.",
  metric_unknown: "One of those metrics isn't recognised.",
  not_editable: "This can no longer be edited.",

  // generic
  invalid_name: "Please enter a name.",
  not_authenticated: "Please sign in to continue.",
  forbidden: "You don't have permission to do that.",
  not_found: "That record could not be found.",

  // named check constraints, surfaced by name rather than by a raised code
  profiles_phone_international: "Enter your WhatsApp number in international format, for example +27 82 431 9087.",

  // Transport, configuration and gateway codes. No procedure raises these; the API layer does
  // (`ProblemDetailsExceptionHandler.TransportCodes`). They still reach a user, so without an
  // entry here `ApiError` falls through to `MESSAGES[code] ?? detail ?? code` and the raw
  // machine string is what gets rendered on screen.
  rate_limited: "You're doing that a bit too often. Please wait a moment and try again.",
  too_many_connections: "We're busier than usual right now. Please try again in a moment.",
  statement_timeout: "That took too long and was stopped. Please try again, or narrow what you asked for.",
  invalid_input: "Some of those details aren't valid. Please check them and try again.",
  invalid_argument: "Some of those details are missing or aren't valid. Please check them and try again.",
  invalid_email: "Enter a valid email address.",
  invalid_slug: "That web address isn't valid. Use lowercase letters, numbers and hyphens.",
  token_expired: "Your session has expired. Please sign in again.",
  brand_not_found: "This address isn't set up for a BabyBlue practice.",
  brand_unavailable: "This practice's BabyBlue site is unavailable at the moment.",
  conflict: "That clashes with something already saved. Please refresh and try again.",
  client_closed: "The request was cancelled before it finished.",
  internal_error: "Something went wrong on our side. Please try again.",
  api_not_configured: "This app isn't connected to the BabyBlue API yet.",
};

/**
 * The procedure vocabulary: codes a stored procedure can `raise exception`, plus the one named
 * check constraint. This is the set the 3-way parity gate compares against the SQL literals and
 * against `ProblemDetailsExceptionHandler.Codes`. The transport codes above are deliberately
 * excluded, because no procedure raises them.
 */
export const PROCEDURE_CODES: readonly string[] = [
  "slot_unavailable",
  "hold_expired",
  "too_many_holds",
  "too_late_to_cancel",
  "not_cancellable",
  "not_reschedulable",
  "too_early_to_check_in",
  "not_checkin_able",
  "invalid_transition",
  "queue_closed",
  "user_not_found",
  "sole_owner",
  "has_records",
  "registration_in_use",
  "invalid_registration",
  "service_in_use",
  "last_practitioner",
  "price_required",
  "overlapping_availability",
  "invalid_range",
  "consent_required",
  "asset_too_large",
  "metric_unknown",
  "not_editable",
  "invalid_name",
  "not_authenticated",
  "forbidden",
  "not_found",
  "profiles_phone_international",
];

/** Longest key first, so `not_found` can never shadow a longer code that contains it. */
const KEYS_BY_LENGTH = Object.keys(MESSAGES).sort((a, b) => b.length - a.length);

export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code in MESSAGES) return MESSAGES[code];
  for (const k of KEYS_BY_LENGTH) if (msg.includes(k)) return MESSAGES[k];
  if (msg.includes("row-level security")) return "You don't have permission to do that.";
  if (msg.includes("duplicate key") && msg.includes("slug")) return "That web address is already taken. Try another.";
  if (msg.includes("duplicate key")) return "That already exists.";
  if (msg.includes("no_double_booking")) return "That time overlaps another appointment.";
  return msg.replace(/^error: /i, "");
}
