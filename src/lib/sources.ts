/** Where a booking came from. `app` is a patient booking through BabyBlue, and practices must always see that. */
export const SOURCE_LABEL: Record<string, string> = { app: "BabyBlue", os: "Added by the practice", flow: "Walk-in / QR" };
export const isBabyBlue = (source: string) => source === "app";
