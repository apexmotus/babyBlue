import { isBabyBlue } from "@/lib/os-data";

/**
 * Marks a booking that the patient made themselves through BabyBlue, so a practice always sees where it came from.
 * Renders nothing for bookings the practice added itself or that came from the walk-in queue.
 */
export function BabyBlueTag({ source = "app", note }: { source?: string; note?: string }) {
  if (!isBabyBlue(source)) return null;
  return (
    <span className="os-bb" title="Booked by the patient through BabyBlue">
      <i aria-hidden="true" />
      via BabyBlue{note ? <small>{note}</small> : null}
    </span>
  );
}
