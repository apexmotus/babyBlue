import { SOURCE } from "@/lib/practices/data";

/** Required wherever directory data is shown: the ODbL asks for attribution to OpenStreetMap contributors. */
export function DirectoryAttribution() {
  return (
    <p className="f-attrib">
      Practice details © <a href={SOURCE.copyrightUrl} target="_blank" rel="noopener noreferrer">{SOURCE.name}</a>, available under the{" "}
      <a href={SOURCE.licenceUrl} target="_blank" rel="noopener noreferrer">{SOURCE.licence}</a>, retrieved {SOURCE.retrieved}. BabyBlue has not verified these details, they may be out of date, and listing a practice is not an endorsement. These practices have not joined BabyBlue.
    </p>
  );
}
