using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using BabyBlue.Contracts.Generated;

namespace BabyBlue.Contracts.Practice;

// Shape validation only, never meaning (API_LAYER_SPEC §9). Nothing here checks that the caller
// belongs to the practice, that a child belongs to its parent, or that a role may act: those are
// `_require_member` / `_require_role` inside the procedures, where they cannot be forgotten.
//
// Every field corresponds to a parameter of the one procedure its route calls. Where the Phase 4
// plan's route table and the procedure signature disagreed, the signature won — it comes from
// `pg_proc`, and `ContractGen` would turn any divergence into a compile error rather than a
// runtime 500. The divergences are listed in PROGRESS.md.

/// <summary>A created resource's identifier, for a <c>201</c> or an upsert's <c>200</c>.</summary>
public sealed record PracticeIdResponse(Guid Id);

/// <summary>Wrapper for a scalar so the response body stays a JSON object.</summary>
public sealed record PlatformRoleResponse(string? Role);

/// <summary>Wrapper for a scalar count.</summary>
public sealed record QueueWaitingCountResponse(int Count);

// ---------------------------------------------------------------------------- team

public sealed record CreatePractitionerRequest
{
    [Required, StringLength(160, MinimumLength = 2)]
    public string DisplayName { get; init; } = "";

    [StringLength(40)]
    public string? Title { get; init; }

    /// <summary>
    /// Slug, not display text: the procedure takes <c>p_speciality_slug</c> and the public
    /// directory's facets are keyed on it.
    /// </summary>
    [RegularExpression(@"^[a-z0-9-]{2,64}$")]
    public string? SpecialitySlug { get; init; }

    [StringLength(2000)]
    public string? Bio { get; init; }

    [MaxLength(12)]
    public string[]? Languages { get; init; }

    /// <summary>Links the practitioner profile to an existing member's account. Optional.</summary>
    public Guid? UserId { get; init; }
}

public sealed record UpdatePractitionerRequest
{
    [StringLength(160, MinimumLength = 2)]
    public string? DisplayName { get; init; }

    [StringLength(40)]
    public string? Title { get; init; }

    [RegularExpression(@"^[a-z0-9-]{2,64}$")]
    public string? SpecialitySlug { get; init; }

    [StringLength(2000)]
    public string? Bio { get; init; }

    [MaxLength(12)]
    public string[]? Languages { get; init; }

    [AllowedValues(null, "listed", "unlisted")]
    public string? ListingStatus { get; init; }
}

public sealed record SetPractitionerServicesRequest
{
    /// <summary>Sent to PostgreSQL as a native <c>uuid[]</c> (§15), never as a string.</summary>
    [Required]
    [MaxLength(200)]
    public Guid[] ServiceIds { get; init; } = [];
}

public sealed record SubmitRegistrationRequest
{
    /// <summary>Council code, e.g. <c>HPCSA</c>. The procedure raises <c>invalid_registration</c> when blank.</summary>
    [Required, StringLength(32, MinimumLength = 2)]
    public string BodyCode { get; init; } = "";

    [Required, StringLength(64, MinimumLength = 1)]
    public string Number { get; init; } = "";
}

public sealed record AddMemberRequest
{
    [Required, EmailAddress, StringLength(254)]
    public string Email { get; init; } = "";

    [Required, AllowedValues("practice_owner", "practitioner", "receptionist", "staff")]
    public string Role { get; init; } = "";
}

public sealed record SetMemberRoleRequest
{
    [Required, AllowedValues("practice_owner", "practitioner", "receptionist", "staff")]
    public string Role { get; init; } = "";
}

// ---------------------------------------------------------------------------- services

public sealed record UpsertServiceRequest
{
    /// <summary>Absent creates; present updates.</summary>
    public Guid? ServiceId { get; init; }

    [Required, StringLength(160, MinimumLength = 2)]
    public string Name { get; init; } = "";

    [StringLength(2000)]
    public string? Description { get; init; }

    [Range(5, 480)]
    public int DurationMin { get; init; } = 30;

    [Range(0, 240)]
    public int BufferMin { get; init; }

    /// <summary>
    /// Null is allowed only while <c>Active</c> is false. The procedure raises
    /// <c>price_required</c> otherwise (F-10) — the authority is there, not here.
    /// </summary>
    [Range(0, 100_000_000)]
    public int? PriceCents { get; init; }

    public bool Active { get; init; } = true;
}

public sealed record SetServicePractitionersRequest
{
    /// <summary>
    /// May be empty, and that is the point: the procedure raises <c>last_practitioner</c> when
    /// emptying it would leave future bookings nobody can deliver (F-10).
    /// </summary>
    [Required]
    [MaxLength(200)]
    public Guid[] PractitionerIds { get; init; } = [];
}

// ---------------------------------------------------------------------------- availability

public sealed record SetAvailabilityRequest
{
    /// <summary>0 = Sunday through 6 = Saturday, matching <c>availability_rules.weekday</c>.</summary>
    [Required, MaxLength(56)]
    public int[] Weekdays { get; init; } = [];

    /// <summary>
    /// Wall-clock times as text, parallel to <c>Weekdays</c>. Text, not a range type:
    /// <c>availability_rules.during</c> is generated and unwritable, so the procedures expose
    /// start and end separately (§6, §15).
    /// </summary>
    [Required, MaxLength(56)]
    public string[] Starts { get; init; } = [];

    [Required, MaxLength(56)]
    public string[] Ends { get; init; } = [];

    public Guid? LocationId { get; init; }

    /// <summary>
    /// The three arrays are read positionally by the procedure, so a length mismatch would
    /// silently drop or pair the wrong rows. Refuse it at the edge with a 400.
    /// </summary>
    public bool HasConsistentLengths() =>
        Weekdays.Length == Starts.Length && Starts.Length == Ends.Length;
}

public sealed record ApplyAvailabilityPatternRequest
{
    [Required, MaxLength(7)]
    public int[] Weekdays { get; init; } = [];

    [Required, RegularExpression(@"^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$")]
    public string Start { get; init; } = "";

    [Required, RegularExpression(@"^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$")]
    public string End { get; init; } = "";

    public Guid? LocationId { get; init; }
}

public sealed record AddTimeOffRequest
{
    public Guid? PractitionerId { get; init; }

    /// <summary>
    /// Whole days. <c>practice_timeoff_add</c> takes <c>date</c>, not <c>timestamptz</c>, so
    /// time off is day-granular and carries no offset — see PROGRESS.md on the plan's
    /// `DateTimeOffset` expectation.
    /// </summary>
    [Required]
    public DateOnly From { get; init; }

    [Required]
    public DateOnly To { get; init; }

    [StringLength(240)]
    public string? Reason { get; init; }
}

// ---------------------------------------------------------------------------- clients

public sealed record CreateClientRequest
{
    [Required, StringLength(120, MinimumLength = 1)]
    public string FirstName { get; init; } = "";

    [StringLength(120)]
    public string LastName { get; init; } = "";

    [RegularExpression(@"^\+[1-9][0-9]{7,14}$")]
    public string? Phone { get; init; }

    [EmailAddress, StringLength(254)]
    public string? Email { get; init; }

    /// <summary>
    /// A plain boolean, not evidence: <c>practice_client_create</c> takes <c>p_consent boolean</c>
    /// (F-12). To attach evidence, create the client then <c>POST .../consents</c>.
    /// </summary>
    public bool ConsentRecordStorage { get; init; }
}

public sealed record UpdateClientRequest
{
    [StringLength(120, MinimumLength = 1)]
    public string? FirstName { get; init; }

    [StringLength(120)]
    public string? LastName { get; init; }

    [RegularExpression(@"^\+[1-9][0-9]{7,14}$")]
    public string? Phone { get; init; }

    [EmailAddress, StringLength(254)]
    public string? Email { get; init; }
}

public sealed record SetClientNotesRequest
{
    /// <summary>Administrative notes only — no clinical content until D-29 phase B.</summary>
    [StringLength(4000)]
    public string? Notes { get; init; }
}

public sealed record GrantConsentRequest
{
    [Required]
    [AllowedValues("record_storage", "appointment_reminders", "marketing")]
    public string Purpose { get; init; } = "";

    /// <summary>How consent was captured. Bounded so a jsonb column cannot be used as storage.</summary>
    public JsonElement? Evidence { get; init; }

    public const int MaxEvidenceBytes = 8 * 1024;
}

// ---------------------------------------------------------------------------- queue

public sealed record AddWalkInRequest
{
    [Required, StringLength(120, MinimumLength = 2)]
    public string Name { get; init; } = "";

    [RegularExpression(@"^\+[1-9][0-9]{7,14}$")]
    public string? Phone { get; init; }

    [AllowedValues("routine", "urgent")]
    public string Urgency { get; init; } = "routine";

    /// <summary>Links the walk-in to an existing client record. Optional.</summary>
    public Guid? ClientId { get; init; }
}

public sealed record SetQueueStatusRequest
{
    [Required]
    [AllowedValues("waiting", "in_consultation", "done", "cancelled")]
    public string Status { get; init; } = "";
}

public sealed record LinkQueueClientRequest
{
    [Required]
    public Guid ClientId { get; init; }
}

// ---------------------------------------------------------------------------- appointments

public sealed record CreatePracticeAppointmentRequest
{
    [Required]
    public Guid PractitionerId { get; init; }

    [Required]
    public Guid ServiceId { get; init; }

    [Required]
    public Guid ClientId { get; init; }

    /// <summary><c>DateTimeOffset</c>, never <c>DateTime</c> (§6): the offset is meaning, not formatting.</summary>
    [Required]
    public DateTimeOffset StartsAt { get; init; }

    /// <summary>
    /// How the booking was made. <c>practice_appointment_create</c> accepts only <c>os</c> and
    /// <c>flow</c> and raises <c>forbidden</c> for anything else — <c>app</c> is reserved for
    /// <c>patient_appointment_book</c>, so staff cannot forge a booking as having come from the
    /// patient's own app. Null defaults to <c>os</c> in the procedure.
    /// </summary>
    [AllowedValues(null, "os", "flow")]
    public string? Source { get; init; }

    public Guid? LocationId { get; init; }
}

public sealed record SetAppointmentStatusRequest
{
    [Required]
    public string Status { get; init; } = "";

    /// <summary>Generated from <c>pg_enum</c>, so adding a label in the database cannot leave this behind.</summary>
    public static string[] Allowed => PgEnums.AppointmentStatus;
}

public sealed record CancelPracticeAppointmentRequest
{
    [StringLength(240)]
    public string? Reason { get; init; }
}

public sealed record ReschedulePracticeAppointmentRequest
{
    [Required]
    public DateTimeOffset NewStartsAt { get; init; }
}

// ---------------------------------------------------------------------------- settings

public sealed record CreatePracticeRequest
{
    [Required, StringLength(160, MinimumLength = 2)]
    public string Name { get; init; } = "";

    [Required, RegularExpression(@"^[a-z0-9-]{3,64}$")]
    public string Slug { get; init; } = "";
}

public sealed record OnboardPracticeRequest
{
    [Required, StringLength(160, MinimumLength = 2)]
    public string Name { get; init; } = "";

    [Required, RegularExpression(@"^[a-z0-9-]{3,64}$")]
    public string Slug { get; init; } = "";

    public Guid? CityId { get; init; }

    [StringLength(240)]
    public string? Address { get; init; }

    [Required, StringLength(160, MinimumLength = 2)]
    public string PractitionerName { get; init; } = "";

    [StringLength(40)]
    public string? Title { get; init; }

    [RegularExpression(@"^[a-z0-9-]{2,64}$")]
    public string? SpecialitySlug { get; init; }

    [StringLength(2000)]
    public string? Bio { get; init; }

    [MaxLength(12)]
    public string[]? Languages { get; init; }

    [Required, StringLength(160, MinimumLength = 2)]
    public string ServiceName { get; init; } = "";

    [Range(5, 480)]
    public int DurationMin { get; init; } = 30;

    [Range(0, 240)]
    public int BufferMin { get; init; }

    [Range(0, 100_000_000)]
    public int? PriceCents { get; init; }

    [MaxLength(7)]
    public int[]? Weekdays { get; init; }

    [RegularExpression(@"^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$")]
    public string? Start { get; init; }

    [RegularExpression(@"^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$")]
    public string? End { get; init; }
}

public sealed record UpdatePracticeSettingsRequest
{
    [Required, StringLength(160, MinimumLength = 2)]
    public string Name { get; init; } = "";

    /// <summary>
    /// An IANA zone, e.g. <c>Africa/Johannesburg</c>. The practice's zone — not the server's and
    /// not a hard-coded <c>+02:00</c> — is what the procedures do date arithmetic in.
    /// </summary>
    [Required, StringLength(64, MinimumLength = 3)]
    public string Timezone { get; init; } = "";

    [Range(0, 10_080)]
    public int MinNoticeMinutes { get; init; }

    [Range(0, 720)]
    public int CancellationNoticeHours { get; init; }
}

public sealed record UpsertLocationRequest
{
    public Guid? LocationId { get; init; }

    [Required, StringLength(160, MinimumLength = 2)]
    public string Name { get; init; } = "";

    [StringLength(240)]
    public string? Address { get; init; }

    public Guid? CityId { get; init; }

    public bool IsPrimary { get; init; }
}
