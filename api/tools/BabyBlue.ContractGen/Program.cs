using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Npgsql;

namespace BabyBlue.ContractGen;

internal static class Program
{
    /// <summary>
    /// Functions excluded from the generated surface because they are internal: RLS
    /// predicates, triggers, generated-column helpers and the brand resolver. Assertion 5
    /// allows these to hold <c>anon</c>/<c>authenticated</c> EXECUTE, because RLS policies
    /// evaluate them under those roles.
    /// </summary>
    private static readonly HashSet<string> InternalExclusions = new(StringComparer.Ordinal)
    {
        // Internal RLS predicates, triggers, and brand resolver
        "is_member",
        "has_practice_role",
        "is_platform_admin",
        "is_marketing_operator",
        "can_see_marketing_request",
        "resolve_brand",
        "get_available_slots",
        "appointment_span",
        "practitioner_verification_sync",
        "practitioners_guard_verification",
        "handle_new_user",
        "slot_holds_quota",
        "demo_activate_practice",
    };

    /// <summary>
    /// Pre-Stage-3 functions from migrations 0002–0004, kept only so the PGlite TypeScript
    /// suite in <c>tests/db/*.test.ts</c> keeps passing, and re-granted deliberately at the end
    /// of <c>0007_4nf_and_106_procedures.sql</c>.
    ///
    /// They duplicate procedures in the generated 106 and four of them are reachable by
    /// <c>anon</c>. The API never calls them — it only ever emits SQL from this catalogue — but
    /// they remain a live surface on the database, so this set exists to <em>pin</em> it:
    /// Assertion 5 fails the build if any function outside the 106, the internal helpers and
    /// this exact list is granted to a client role. Without that, a new ungated function could
    /// be granted to <c>anon</c> and no gate would notice.
    ///
    /// IMPLEMENTATION_PLAN.md Stage 5 drops these. Shrinking this set is progress; growing it
    /// is a decision that has to be made on purpose.
    /// </summary>
    private static readonly HashSet<string> LegacyClientGrantedExclusions = new(StringComparer.Ordinal)
    {
        "search_practitioners",
        "my_appointments",
        "hold_slot",
        "book_appointment",
        "staff_create_appointment",
        "cancel_appointment",
        "reschedule_appointment",
        "join_queue",
        "get_queue_status",
        "leave_queue",
        "create_practice",
        "activate_practice",
        "set_verification",
        "marketing_set_status",
        "decide_approval",
        "delete_my_account",
        "check_in_appointment",
        "set_appointment_status",
        "queue_add_walkin",
        "queue_set_status",
        "add_practice_member_by_email",
        "remove_practice_member",
        "practice_team",
        "submit_verification",
        "grant_platform_role",
        "my_platform_role",
        "admin_overview",
        "marketing_inbox",
        "practice_stats",
        "practice_insights",
        "release_hold",
        "appointment_history"
    };

    /// <summary>
    /// The catalogue size the route tables in API_LAYER_SPEC §8 cover: 10 Public + 13 Patient
    /// + 62 Practice + 16 Growth + 5 Platform.
    /// </summary>
    private const int ExpectedProcedureCount = 106;

    /// <summary>
    /// Names last known to make up the catalogue, used only to describe an Assertion 1 failure
    /// as a delta. It is a diagnostic aid, not the gate: the gate is the count plus the
    /// committed <c>Generated/</c> files under <c>git diff --exit-code</c>.
    /// </summary>
    private static readonly HashSet<string> KnownProcedureNames = new(StringComparer.Ordinal)
    {
        "growth_approval_add",
        "growth_approval_decide",
        "growth_approvals_list",
        "growth_asset_add",
        "growth_asset_download",
        "growth_assets_list",
        "growth_inbox",
        "growth_report_create",
        "growth_reports_list",
        "growth_request_create",
        "growth_request_get",
        "growth_request_status_set",
        "growth_requests_list",
        "growth_services_list",
        "growth_update_post",
        "growth_updates_list",
        "patient_account_delete",
        "patient_account_export",
        "patient_appointment_book",
        "patient_appointment_cancel",
        "patient_appointment_check_in",
        "patient_appointment_get",
        "patient_appointment_reschedule",
        "patient_appointments_list",
        "patient_hold_get",
        "patient_hold_release",
        "patient_profile_get",
        "patient_profile_update",
        "patient_slot_hold",
        "platform_audit_log",
        "platform_my_role",
        "platform_overview",
        "platform_practice_status_set",
        "platform_role_grant",
        "platform_verification_set",
        "practice_appointment_cancel",
        "practice_appointment_create",
        "practice_appointment_get",
        "practice_appointment_history",
        "practice_appointment_reschedule",
        "practice_appointment_slots",
        "practice_appointment_status_set",
        "practice_availability_apply_pattern",
        "practice_availability_list",
        "practice_availability_set",
        "practice_calendar_appointments",
        "practice_calendar_availability",
        "practice_calendar_timeoff",
        "practice_client_consent_grant",
        "practice_client_consent_withdraw",
        "practice_client_consents_list",
        "practice_client_create",
        "practice_client_get",
        "practice_client_notes_set",
        "practice_client_search",
        "practice_client_update",
        "practice_clients_list",
        "practice_create",
        "practice_dashboard_get",
        "practice_insights_get",
        "practice_location_remove",
        "practice_location_upsert",
        "practice_locations_list",
        "practice_member_add",
        "practice_member_remove",
        "practice_member_role_set",
        "practice_memberships_list",
        "practice_onboard",
        "practice_practitioner_create",
        "practice_practitioner_services_list",
        "practice_practitioner_services_set",
        "practice_practitioner_update",
        "practice_practitioners_list",
        "practice_queue_call_next",
        "practice_queue_link_client",
        "practice_queue_list",
        "practice_queue_preview",
        "practice_queue_status_set",
        "practice_queue_waiting_count",
        "practice_queue_walkin_add",
        "practice_recent_app_bookings",
        "practice_registration_submit",
        "practice_registrations_list",
        "practice_service_deactivate",
        "practice_service_practitioners_list",
        "practice_service_practitioners_set",
        "practice_service_upsert",
        "practice_services_list",
        "practice_settings_get",
        "practice_settings_update",
        "practice_setup_progress",
        "practice_team_list",
        "practice_timeoff_add",
        "practice_timeoff_list",
        "practice_timeoff_remove",
        "practice_verifications_list",
        "public_city_list",
        "public_practitioner_get",
        "public_practitioner_search",
        "public_practitioner_services",
        "public_queue_info",
        "public_queue_join",
        "public_queue_leave",
        "public_queue_status",
        "public_slots_list",
        "public_speciality_list"
    };

    private static readonly HashSet<string> SingleRowProcedures = new(StringComparer.Ordinal)
    {
        "public_practitioner_get",
        "public_queue_info",
        "public_queue_status",
        "patient_profile_get",
        "patient_appointment_get",
        "patient_hold_get",
        "practice_setup_progress",
        "practice_client_get",
        "practice_appointment_get",
        "practice_settings_get",
        "growth_request_get",
        "growth_asset_download"
    };

    private static readonly HashSet<string> NullableValueColumnNames = new(StringComparer.Ordinal)
    {
        "next_available",
        "from_price_cents",
        "price_cents",
        "budget_min_cents",
        "budget_max_cents",
        "queue_position",
        "consent_at",
        "last_visit",
        "next_appointment",
        "called_at",
        "completed_at",
        "decided_at",
        "deadline",
        "user_id",
        "location_id",
        "primary_location_id",
        "appointment_id",
        "assigned_to",
        "uploaded_by",
        "entity_id",
        "metric_value"
    };

    private static readonly HashSet<string> NullableValueInputParamNames = new(StringComparer.Ordinal)
    {
        "p_service",
        "p_price_cents",
        "p_location",
        "p_city_id",
        "p_client",
        "p_user_id",
        "p_practitioner",
        "p_practice",
        "p_before",
        "p_budget_min_cents",
        "p_budget_max_cents",
        "p_deadline",
        "p_from"
    };

    public static async Task<int> Main(string[] args)
    {
        string? connectionString = null;
        var schema = "public";

        for (var i = 0; i < args.Length; i++)
        {
            if (args[i] == "--connection" && i + 1 < args.Length)
            {
                connectionString = args[++i];
            }
            else if (args[i] == "--schema" && i + 1 < args.Length)
            {
                schema = args[++i];
            }
        }

        var repoRoot = FindRepoRoot();
        string? ephemeralDir = null;

        try
        {
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                (connectionString, ephemeralDir) = await ProvisionEphemeralPostgresAsync(repoRoot);
            }

            await using var conn = new NpgsqlConnection(connectionString);
            await conn.OpenAsync();

            var procedures = await LoadCatalogueAsync(conn, schema);
            ValidateCatalogueAssertions(procedures, schema);

            var clientGranted = await LoadClientGrantedFunctionsAsync(conn, schema);
            ValidateClientGrantedSurface(procedures, clientGranted, schema);

            var enums = await LoadEnumValuesAsync(conn, schema);

            var generatedDir = Path.Combine(repoRoot, "api", "src", "BabyBlue.Data", "Generated");
            Directory.CreateDirectory(generatedDir);

            var contractsCode = GenerateContractsFile(procedures);
            var proceduresCode = GenerateProceduresFile(procedures);

            await File.WriteAllTextAsync(Path.Combine(generatedDir, "Contracts.g.cs"), contractsCode, new UTF8Encoding(false));
            await File.WriteAllTextAsync(Path.Combine(generatedDir, "Procedures.g.cs"), proceduresCode, new UTF8Encoding(false));

            // Enum labels go to BabyBlue.Contracts, not BabyBlue.Data: request DTOs need them for
            // `[AllowedValues]`, and Contracts may not reference Data (§2 rule 3, asserted by
            // ArchitectureBoundaryTests). Generating them keeps the labels from drifting when a
            // label is added to the database.
            var contractsEnumDir = Path.Combine(repoRoot, "api", "src", "BabyBlue.Contracts", "Generated");
            Directory.CreateDirectory(contractsEnumDir);
            await File.WriteAllTextAsync(
                Path.Combine(contractsEnumDir, "PgEnums.g.cs"),
                GeneratePgEnumsFile(enums),
                new UTF8Encoding(false));

            Console.WriteLine($"BabyBlue.ContractGen: verified and generated {procedures.Count} procedures in {generatedDir}.");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"BabyBlue.ContractGen FAILED: {ex.Message}");
            return 1;
        }
        finally
        {
            NpgsqlConnection.ClearAllPools();
            if (ephemeralDir is not null && Directory.Exists(ephemeralDir))
            {
                await StopEphemeralPostgresAsync(ephemeralDir);
            }
        }
    }

    private sealed record ArgMetadata(
        int Idx,
        string Name,
        string Mode,
        string SqlType);

    private sealed record ProcMetadata(
        string Name,
        string VolatilityChar,
        bool SecurityDefiner,
        bool ReturnsSet,
        string ReturnType,
        string FullArgs,
        bool PublicExec,
        bool AnonExec,
        bool AuthExec,
        IReadOnlyList<ArgMetadata> Args)
    {
        public IReadOnlyList<ArgMetadata> InputArgs => Args.Where(a => a.Mode == "i").ToList();
        public IReadOnlyList<ArgMetadata> TableColumns => Args.Where(a => a.Mode == "t").ToList();
        public bool IsTableReturn => TableColumns.Count > 0;
        public bool IsVoidReturn => !IsTableReturn && ReturnType == "void";
    }

    private static async Task<List<ProcMetadata>> LoadCatalogueAsync(NpgsqlConnection conn, string schema)
    {
        // First check Assertion 2 across ALL functions in target schema (including helpers):
        await using (var publicCheckCmd = new NpgsqlCommand(
            """
            select p.proname
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = @schema
               and (p.proacl is null or array_to_string(p.proacl, ',') ~ '(^|,)=X/')
            """,
            conn))
        {
            publicCheckCmd.Parameters.AddWithValue("schema", schema);
            var publicFuncs = new List<string>();
            await using var rdr = await publicCheckCmd.ExecuteReaderAsync();
            while (await rdr.ReadAsync())
            {
                publicFuncs.Add(rdr.GetString(0));
            }

            if (publicFuncs.Count > 0)
            {
                throw new InvalidOperationException(
                    $"Assertion 2 failed: PUBLIC execute grant present on functions in schema '{schema}': {string.Join(", ", publicFuncs)}");
            }
        }

        const string sql = """
            select p.proname as name,
                   p.provolatile::text as volatility,
                   p.prosecdef as security_definer,
                   p.proretset as returns_set,
                   format_type(p.prorettype, null) as return_type,
                   pg_get_function_arguments(p.oid) as full_args,
                   (p.proacl is null or array_to_string(p.proacl, ',') ~ '(^|,)=X/') as public_exec,
                   has_function_privilege('anon', p.oid, 'execute') as anon_exec,
                   has_function_privilege('authenticated', p.oid, 'execute') as auth_exec,
                   coalesce(
                     (select jsonb_agg(jsonb_build_object(
                               'Idx', u.ord,
                               'Name', coalesce(p.proargnames[u.ord], 'p_' || u.ord),
                               'Mode', coalesce(p.proargmodes[u.ord]::text, 'i'),
                               'SqlType', format_type(u.type_oid, null)
                             ) order by u.ord)
                        from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality as u(type_oid, ord)),
                     '[]'::jsonb
                   )::text as arg_list
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = @schema
               and p.proname not like '\_%'
               and p.proname not in ('timerange', 'timemultirange')
               and not exists (
                 select 1 from pg_depend d
                  where d.classid = 'pg_proc'::regclass
                    and d.objid = p.oid
                    and d.deptype = 'e'
               )
             order by p.proname;
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);

        var result = new List<ProcMetadata>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var name = reader.GetString(0);
            if (InternalExclusions.Contains(name) || LegacyClientGrantedExclusions.Contains(name))
            {
                continue;
            }

            var volatility = reader.GetString(1);
            var secDef = reader.GetBoolean(2);
            var returnsSet = reader.GetBoolean(3);
            var returnType = reader.GetString(4);
            var fullArgs = reader.GetString(5);
            var publicExec = reader.GetBoolean(6);
            var anonExec = reader.GetBoolean(7);
            var authExec = reader.GetBoolean(8);
            var argJson = reader.GetString(9);
            var args = JsonSerializer.Deserialize<List<ArgMetadata>>(argJson) ?? [];

            result.Add(new ProcMetadata(
                name,
                volatility,
                secDef,
                returnsSet,
                returnType,
                fullArgs,
                publicExec,
                anonExec,
                authExec,
                args));
        }

        return result;
    }

    private sealed record ClientGrantedFunction(string Name, bool AnonExec, bool AuthExec);

    /// <summary>
    /// Every function in the schema that <c>anon</c> or <c>authenticated</c> may execute,
    /// including the ones excluded from the generated surface. Assertion 5 needs the excluded
    /// ones precisely because they are the blind spot: the per-procedure assertions only ever
    /// see the 106 that get generated.
    /// </summary>
    private static async Task<List<ClientGrantedFunction>> LoadClientGrantedFunctionsAsync(
        NpgsqlConnection conn,
        string schema)
    {
        const string sql = """
            select p.proname,
                   has_function_privilege('anon', p.oid, 'execute')          as anon_exec,
                   has_function_privilege('authenticated', p.oid, 'execute') as auth_exec
              from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = @schema
               -- Range constructors auto-created by `create type ... as range (...)`, and
               -- extension-owned functions (btree_gist, pgcrypto): both are re-granted on
               -- purpose in 0007 and are not part of the application surface.
               and p.proname not in ('timerange', 'timemultirange')
               and not exists (
                 select 1 from pg_depend d
                  where d.classid = 'pg_proc'::regclass
                    and d.objid = p.oid
                    and d.deptype = 'e'
               )
             order by p.proname;
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);

        var result = new List<ClientGrantedFunction>();
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var anon = reader.GetBoolean(1);
            var auth = reader.GetBoolean(2);
            if (anon || auth)
            {
                result.Add(new ClientGrantedFunction(reader.GetString(0), anon, auth));
            }
        }

        return result;
    }

    /// <summary>
    /// Assertion 5: the client-reachable function surface is exactly the 106 procedures, the
    /// internal RLS helpers, and the pinned legacy list — nothing else.
    ///
    /// Assertions 2 and 3 only inspect functions that reach the generated output, so a function
    /// excluded by name could be granted to <c>anon</c> and no gate would see it. This closes
    /// that, and additionally refuses a legacy function reachable by <c>anon</c> that is not
    /// already known to be, so the anon surface can shrink but never silently grow.
    /// </summary>
    private static void ValidateClientGrantedSurface(
        IReadOnlyList<ProcMetadata> procs,
        IReadOnlyList<ClientGrantedFunction> clientGranted,
        string schema)
    {
        // Legacy functions documented as anon-reachable at the end of migration 0007.
        string[] knownAnonLegacy =
        [
            "get_available_slots",
            "search_practitioners",
            "join_queue",
            "get_queue_status",
            "leave_queue",
        ];

        var generated = procs.Select(p => p.Name).ToHashSet(StringComparer.Ordinal);
        var knownAnon = knownAnonLegacy.ToHashSet(StringComparer.Ordinal);
        var unexpected = new List<string>();
        var unexpectedAnon = new List<string>();

        foreach (var fn in clientGranted)
        {
            if (generated.Contains(fn.Name))
            {
                continue;
            }

            var isInternal = InternalExclusions.Contains(fn.Name);
            var isLegacy = LegacyClientGrantedExclusions.Contains(fn.Name);

            if (!isInternal && !isLegacy)
            {
                unexpected.Add(fn.Name);
                continue;
            }

            // An internal helper is evaluated inside RLS policies under both roles, so anon is
            // expected there. A legacy function reachable by anon must be one we already know.
            if (isLegacy && fn.AnonExec && !knownAnon.Contains(fn.Name))
            {
                unexpectedAnon.Add(fn.Name);
            }
        }

        if (unexpected.Count > 0)
        {
            throw new InvalidOperationException(
                $"Assertion 5 failed: schema '{schema}' grants EXECUTE to anon/authenticated on "
                + $"{unexpected.Count} function(s) that are neither generated, nor internal helpers, "
                + $"nor pinned legacy functions: {string.Join(", ", unexpected.Order())}. "
                + "Either route it (so it joins the generated catalogue), revoke the grant, or add "
                + "it to InternalExclusions / LegacyClientGrantedExclusions on purpose.");
        }

        if (unexpectedAnon.Count > 0)
        {
            throw new InvalidOperationException(
                $"Assertion 5 failed: legacy function(s) newly reachable by 'anon' in schema "
                + $"'{schema}': {string.Join(", ", unexpectedAnon.Order())}. The anonymous surface "
                + "may shrink but must never grow without an explicit decision.");
        }

        Console.WriteLine(
            $"BabyBlue.ContractGen: Assertion 5 passed - client-reachable surface is "
            + $"{generated.Count} generated + {clientGranted.Count - generated.Count} pinned "
            + $"(internal helpers and legacy).");
    }

    /// <summary>
    /// Values of every enum type in the schema, from <c>pg_enum</c>.
    ///
    /// API_LAYER_SPEC §6 maps enum types to <c>string</c> "with an <c>[AllowedValues]</c>
    /// attribute". A generated wrapper method's parameters are never model-validated by MVC,
    /// so the attribute belongs on the controller action or request DTO — but the <em>values</em>
    /// must not be retyped there by hand, or they drift from the database the moment someone
    /// adds an enum label. Emitting them means a DTO can write
    /// <c>[AllowedValues(PgEnums.MarketingStatus)]</c> and be wrong only if the database is.
    /// </summary>
    private static async Task<SortedDictionary<string, List<string>>> LoadEnumValuesAsync(
        NpgsqlConnection conn,
        string schema)
    {
        const string sql = """
            select t.typname, e.enumlabel
              from pg_type t
              join pg_namespace n on n.oid = t.typnamespace
              join pg_enum e on e.enumtypid = t.oid
             where n.nspname = @schema
             order by t.typname, e.enumsortorder;
            """;

        await using var cmd = new NpgsqlCommand(sql, conn);
        cmd.Parameters.AddWithValue("schema", schema);

        var result = new SortedDictionary<string, List<string>>(StringComparer.Ordinal);
        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            var typeName = reader.GetString(0);
            if (!result.TryGetValue(typeName, out var values))
            {
                values = [];
                result[typeName] = values;
            }

            values.Add(reader.GetString(1));
        }

        return result;
    }

    private static void ValidateCatalogueAssertions(IReadOnlyList<ProcMetadata> procs, string schema)
    {
        // Assertion 1: Exact 106 procedures and no helper predicates leaked
        string[] forbiddenPredicates = ["is_member", "has_practice_role", "is_platform_admin", "is_marketing_operator"];
        foreach (var pred in forbiddenPredicates)
        {
            if (procs.Any(p => p.Name == pred))
            {
                throw new InvalidOperationException($"Assertion 1 failed: helper predicate '{pred}' leaked into generated surface.");
            }
        }

        if (procs.Count != ExpectedProcedureCount)
        {
            // Name the delta rather than dumping the catalogue: the useful information is which
            // procedure appeared or vanished, and a 106-name list buries it.
            var found = procs.Select(p => p.Name).ToHashSet(StringComparer.Ordinal);
            var added = found.Except(KnownProcedureNames, StringComparer.Ordinal).Order().ToArray();
            var removed = KnownProcedureNames.Except(found, StringComparer.Ordinal).Order().ToArray();

            var detail = new List<string>();
            if (added.Length > 0)
            {
                detail.Add($"added: {string.Join(", ", added)}");
            }
            if (removed.Length > 0)
            {
                detail.Add($"removed: {string.Join(", ", removed)}");
            }
            if (detail.Count == 0)
            {
                detail.Add($"count differs but names match the manifest; check for overloads");
            }

            throw new InvalidOperationException(
                $"Assertion 1 failed: expected {ExpectedProcedureCount} procedures in schema "
                + $"'{schema}', found {procs.Count}. {string.Join("; ", detail)}. "
                + "A procedure added without a route is invisible; one removed while a route "
                + "survives is a 500. Update the route table and ExpectedProcedureCount together.");
        }

        foreach (var proc in procs)
        {
            // Assertion 2: Zero PUBLIC execute grants
            if (proc.PublicExec)
            {
                throw new InvalidOperationException($"Assertion 2 failed: procedure '{proc.Name}' has PUBLIC execute grant.");
            }

            // Assertion 3: Role grants match prefix rules
            if (proc.Name.StartsWith("public_", StringComparison.Ordinal))
            {
                if (!proc.AnonExec || !proc.AuthExec)
                {
                    throw new InvalidOperationException(
                        $"Assertion 3 failed: public procedure '{proc.Name}' must be granted EXECUTE to both anon and authenticated.");
                }
            }
            else
            {
                if (proc.AnonExec)
                {
                    throw new InvalidOperationException(
                        $"Assertion 3 failed: non-public procedure '{proc.Name}' must NOT be granted EXECUTE to anon.");
                }

                if (!proc.AuthExec)
                {
                    throw new InvalidOperationException(
                        $"Assertion 3 failed: procedure '{proc.Name}' is missing EXECUTE grant to authenticated.");
                }
            }

            // Assertion 4: Type mapping check (and no timerange exposed)
            foreach (var arg in proc.Args)
            {
                _ = MapSqlTypeToCSharp(proc.Name, arg.Name, arg.SqlType, isColumn: arg.Mode == "t", hasDefault: false);
            }

            if (!proc.IsTableReturn && !proc.IsVoidReturn)
            {
                _ = MapSqlTypeToCSharp(proc.Name, "return", proc.ReturnType, isColumn: false, hasDefault: false);
            }
        }
    }

    private static string MapSqlTypeToCSharp(
        string procName,
        string memberName,
        string sqlType,
        bool isColumn,
        bool hasDefault)
    {
        var normalized = sqlType.Trim().ToLowerInvariant();
        if (normalized.Contains("timerange"))
        {
            throw new InvalidOperationException(
                $"Assertion 4 failed: procedure '{procName}' exposes prohibited type '{sqlType}' on '{memberName}'.");
        }

        var baseType = normalized switch
        {
            "uuid" => "Guid",
            "text" or "character varying" or "varchar" => "string",
            "practice_role" or "public.practice_role" => "string",
            "platform_role" or "public.platform_role" => "string",
            "appointment_status" or "public.appointment_status" => "string",
            "queue_status" or "public.queue_status" => "string",
            "marketing_status" or "public.marketing_status" => "string",
            "consent_purpose" or "public.consent_purpose" => "string",
            "integer" or "int4" or "int" => "int",
            "smallint" or "int2" => "short",
            "bigint" or "int8" => "long",
            "boolean" or "bool" => "bool",
            "timestamp with time zone" or "timestamptz" => "DateTimeOffset",
            "date" => "DateOnly",
            "text[]" => "string[]",
            "uuid[]" => "Guid[]",
            "integer[]" or "int4[]" => "int[]",
            "numeric" or "decimal" => "decimal",
            "jsonb" => "JsonElement",
            "bytea" => "byte[]",
            _ => throw new InvalidOperationException(
                $"Assertion 4 failed: unmapped PostgreSQL type '{sqlType}' on '{procName}.{memberName}'.")
        };

        var isReference = baseType is "string" or "string[]" or "Guid[]" or "int[]" or "byte[]";
        if (isColumn)
        {
            if (isReference)
            {
                return baseType == "string" ? "string?" : baseType;
            }

            return NullableValueColumnNames.Contains(memberName) ? $"{baseType}?" : baseType;
        }

        // Input parameter or scalar return:
        if (memberName == "return")
        {
            if (procName is "platform_my_role" or "practice_queue_call_next")
            {
                return $"{baseType}?";
            }
            return baseType;
        }

        if (isReference)
        {
            return $"{baseType}?";
        }

        if (hasDefault || NullableValueInputParamNames.Contains(memberName))
        {
            return $"{baseType}?";
        }

        return baseType;
    }

    /// <summary>
    /// Enum labels, emitted into <c>BabyBlue.Contracts</c> so request DTOs can write
    /// <c>[AllowedValues(PgEnums.PracticeRole)]</c>. Enum-typed arguments cross the wire as text
    /// and PostgreSQL casts them (API_LAYER_SPEC §6); an invalid label would otherwise reach the
    /// database and come back as SQLSTATE 22P02, which maps to no documented error code.
    /// </summary>
    private static string GeneratePgEnumsFile(SortedDictionary<string, List<string>> enums)
    {
        var sb = new StringBuilder();
        sb.AppendLine("// <auto-generated />");
        sb.AppendLine("// Generated by BabyBlue.ContractGen from pg_enum. Do not edit by hand.");
        sb.AppendLine("#nullable enable");
        sb.AppendLine();
        sb.AppendLine("namespace BabyBlue.Contracts.Generated;");
        sb.AppendLine();
        sb.AppendLine("/// <summary>Enum labels as declared in the database.</summary>");
        sb.AppendLine("public static class PgEnums");
        sb.AppendLine("{");

        var first = true;
        foreach (var (typeName, values) in enums)
        {
            if (!first)
            {
                sb.AppendLine();
            }
            first = false;

            var members = string.Join(", ", values.Select(v => $"\"{v}\""));
            sb.AppendLine($"    /// <summary><c>public.{typeName}</c></summary>");
            sb.AppendLine($"    public static readonly string[] {ToPascalCase(typeName)} = [{members}];");
        }

        sb.AppendLine("}");
        return sb.ToString();
    }

    private static string GenerateContractsFile(IReadOnlyList<ProcMetadata> procs)
    {
        var sb = new StringBuilder();
        sb.AppendLine("// <auto-generated />");
        sb.AppendLine("// Generated by BabyBlue.ContractGen from pg_proc catalogue. Do not edit by hand.");
        sb.AppendLine("#nullable enable");
        sb.AppendLine("using System.Text.Json;");
        sb.AppendLine();
        sb.AppendLine("namespace BabyBlue.Data.Generated;");
        sb.AppendLine();

        foreach (var proc in procs.Where(p => p.IsTableReturn))
        {
            var rowName = $"{ToPascalCase(proc.Name)}Row";
            sb.AppendLine($"public sealed record {rowName}");
            sb.AppendLine("{");
            for (var i = 0; i < proc.TableColumns.Count; i++)
            {
                var col = proc.TableColumns[i];
                var csType = MapSqlTypeToCSharp(proc.Name, col.Name, col.SqlType, isColumn: true, hasDefault: false);
                var propName = ToPascalCase(col.Name);
                var defaultInit = csType is "string[]" or "Guid[]" or "int[]" or "byte[]"
                    ? " = [];"
                    : csType == "string"
                        ? " = string.Empty;"
                        : "";
                sb.AppendLine($"    public {csType} {propName} {{ get; init; }}{defaultInit}");
            }
            sb.AppendLine("}");
            sb.AppendLine();
        }

        return sb.ToString();
    }

    private static string GenerateProceduresFile(IReadOnlyList<ProcMetadata> procs)
    {
        var sb = new StringBuilder();
        sb.AppendLine("// <auto-generated />");
        sb.AppendLine("// Generated by BabyBlue.ContractGen from pg_proc catalogue. Do not edit by hand.");
        sb.AppendLine("#nullable enable");
        sb.AppendLine("using System.Text.Json;");
        sb.AppendLine();
        sb.AppendLine("namespace BabyBlue.Data.Generated;");
        sb.AppendLine();
        sb.AppendLine("public static class Procedures");
        sb.AppendLine("{");

        foreach (var proc in procs)
        {
            var fieldName = ToPascalCase(proc.Name);
            var volatility = proc.VolatilityChar is "s" or "i" ? "Volatility.Stable" : "Volatility.Volatile";
            var grantedTo = proc.AnonExec ? "GrantedTo.AnonAndAuthenticated" : "GrantedTo.Authenticated";
            var callBindings = string.Join(
                ", ",
                proc.InputArgs.Select(a => $"{a.Name} => @{ToPascalCase(StripParamPrefix(a.Name))}"));
            var sqlCall = $"{proc.Name}({callBindings})";

            sb.AppendLine($"    public static readonly ProcedureName {fieldName} = new(");
            sb.AppendLine($"        \"{proc.Name}\",");
            sb.AppendLine($"        \"{sqlCall}\",");
            sb.AppendLine($"        {volatility},");
            sb.AppendLine($"        {grantedTo});");
            sb.AppendLine();
        }

        sb.AppendLine("}");
        sb.AppendLine();

        // Emit domain procedure wrapper classes:
        var groups = new (string ClassName, Func<ProcMetadata, bool> Predicate, string PrefixToStrip)[]
        {
            ("PublicProcedures", p => p.Name.StartsWith("public_", StringComparison.Ordinal), "public_"),
            ("PatientProcedures", p => p.Name.StartsWith("patient_", StringComparison.Ordinal), "patient_"),
            ("PracticeProcedures", p => p.Name.StartsWith("practice_", StringComparison.Ordinal), "practice_"),
            ("PracticeContextProcedures", p => p.Name is
                "practice_dashboard_get" or "practice_insights_get" or "practice_setup_progress" or
                "practice_calendar_appointments" or "practice_calendar_availability" or "practice_calendar_timeoff" or
                "practice_queue_preview" or "practice_queue_waiting_count" or "practice_recent_app_bookings" or
                "practice_memberships_list", "practice_"),
            ("PracticeTeamProcedures", p => p.Name is
                "practice_practitioners_list" or "practice_practitioner_create" or "practice_practitioner_update" or
                "practice_practitioner_services_list" or "practice_practitioner_services_set" or
                "practice_registrations_list" or "practice_registration_submit" or "practice_verifications_list" or
                "practice_team_list" or "practice_member_add" or "practice_member_role_set" or "practice_member_remove", "practice_"),
            ("PracticeServicesProcedures", p => p.Name.StartsWith("practice_service", StringComparison.Ordinal), "practice_"),
            ("PracticeAvailabilityProcedures", p => p.Name.StartsWith("practice_availability_", StringComparison.Ordinal) || p.Name.StartsWith("practice_timeoff_", StringComparison.Ordinal), "practice_"),
            ("PracticeClientsProcedures", p => p.Name.StartsWith("practice_client", StringComparison.Ordinal), "practice_"),
            ("PracticeAppointmentsProcedures", p => p.Name.StartsWith("practice_appointment_", StringComparison.Ordinal), "practice_"),
            ("PracticeQueueProcedures", p => p.Name is
                "practice_queue_list" or "practice_queue_walkin_add" or "practice_queue_status_set" or
                "practice_queue_call_next" or "practice_queue_link_client", "practice_"),
            ("PracticeSettingsProcedures", p => p.Name is
                "practice_create" or "practice_onboard" or "practice_settings_get" or "practice_settings_update" or
                "practice_locations_list" or "practice_location_upsert" or "practice_location_remove", "practice_"),
            ("GrowthProcedures", p => p.Name.StartsWith("growth_", StringComparison.Ordinal), "growth_"),
            ("PlatformProcedures", p => p.Name.StartsWith("platform_", StringComparison.Ordinal), "platform_")
        };

        foreach (var group in groups)
        {
            sb.AppendLine($"public sealed class {group.ClassName}(IProcedureGateway gw)");
            sb.AppendLine("{");

            foreach (var proc in procs.Where(group.Predicate))
            {
                var shortName = proc.Name.StartsWith(group.PrefixToStrip, StringComparison.Ordinal)
                    ? proc.Name[group.PrefixToStrip.Length..]
                    : proc.Name;
                var methodName = $"{ToPascalCase(shortName)}Async";
                var procField = $"Procedures.{ToPascalCase(proc.Name)}";

                var paramDeclarations = new List<string>();
                var anonProps = new List<string>();

                var fullArgParts = SplitTopLevelArgs(proc.FullArgs);

                for (var i = 0; i < proc.InputArgs.Count; i++)
                {
                    var arg = proc.InputArgs[i];
                    var hasDefault = i < fullArgParts.Count &&
                                     fullArgParts[i].Contains(" DEFAULT ", StringComparison.OrdinalIgnoreCase);
                    var csType = MapSqlTypeToCSharp(proc.Name, arg.Name, arg.SqlType, isColumn: false, hasDefault);
                    var cleanName = StripParamPrefix(arg.Name);
                    var camelName = ToCamelCase(cleanName);
                    var pascalProp = ToPascalCase(cleanName);

                    var defaultSuffix = hasDefault || csType.EndsWith('?') ? " = default" : "";
                    paramDeclarations.Add($"{csType} {camelName}{defaultSuffix}");
                    anonProps.Add($"{pascalProp} = {camelName}");
                }

                // Move any required parameters that appear after optional parameters by only adding `= default`
                // to trailing parameters so C# method signature syntax is always valid:
                NormalizeDefaultParameters(paramDeclarations);
                paramDeclarations.Add("CancellationToken ct = default");

                var argsExpr = anonProps.Count == 0
                    ? "null"
                    : $"new {{ {string.Join(", ", anonProps)} }}";

                if (proc.IsTableReturn)
                {
                    var rowType = $"{ToPascalCase(proc.Name)}Row";
                    if (SingleRowProcedures.Contains(proc.Name))
                    {
                        sb.AppendLine($"    public Task<{rowType}> {methodName}({string.Join(", ", paramDeclarations)}) =>");
                        sb.AppendLine($"        gw.QuerySingleAsync<{rowType}>({procField}, {argsExpr}, ct);");
                    }
                    else
                    {
                        sb.AppendLine($"    public Task<IReadOnlyList<{rowType}>> {methodName}({string.Join(", ", paramDeclarations)}) =>");
                        sb.AppendLine($"        gw.QueryAsync<{rowType}>({procField}, {argsExpr}, ct);");
                    }
                }
                else if (proc.IsVoidReturn)
                {
                    sb.AppendLine($"    public Task {methodName}({string.Join(", ", paramDeclarations)}) =>");
                    sb.AppendLine($"        gw.ExecuteAsync({procField}, {argsExpr}, ct);");
                }
                else
                {
                    var scalarType = MapSqlTypeToCSharp(proc.Name, "return", proc.ReturnType, isColumn: false, hasDefault: false);
                    if (scalarType.EndsWith('?'))
                    {
                        sb.AppendLine($"    public Task<{scalarType}> {methodName}({string.Join(", ", paramDeclarations)}) =>");
                        sb.AppendLine($"        gw.ScalarAsync<{scalarType}>({procField}, {argsExpr}, ct);");
                    }
                    else
                    {
                        sb.AppendLine($"    public async Task<{scalarType}> {methodName}({string.Join(", ", paramDeclarations)}) =>");
                        sb.AppendLine($"        (await gw.ScalarAsync<{scalarType}>({procField}, {argsExpr}, ct))!;");
                    }
                }

                sb.AppendLine();
            }

            sb.AppendLine("}");
            sb.AppendLine();
        }

        return sb.ToString();
    }

    private static void NormalizeDefaultParameters(List<string> paramDeclarations)
    {
        var lastRequiredIndex = -1;
        for (var i = 0; i < paramDeclarations.Count; i++)
        {
            if (!paramDeclarations[i].EndsWith(" = default", StringComparison.Ordinal))
            {
                lastRequiredIndex = i;
            }
        }

        for (var i = 0; i < lastRequiredIndex; i++)
        {
            if (paramDeclarations[i].EndsWith(" = default", StringComparison.Ordinal))
            {
                paramDeclarations[i] = paramDeclarations[i][..^" = default".Length];
            }
        }
    }

    private static List<string> SplitTopLevelArgs(string fullArgs)
    {
        if (string.IsNullOrWhiteSpace(fullArgs))
        {
            return [];
        }

        var parts = new List<string>();
        var sb = new StringBuilder();
        var depth = 0;
        var inSingleQuote = false;

        foreach (var ch in fullArgs)
        {
            if (ch == '\'')
            {
                inSingleQuote = !inSingleQuote;
            }
            else if (!inSingleQuote)
            {
                if (ch is '(' or '[')
                {
                    depth++;
                }
                else if (ch is ')' or ']')
                {
                    depth--;
                }
                else if (ch == ',' && depth == 0)
                {
                    parts.Add(sb.ToString().Trim());
                    sb.Clear();
                    continue;
                }
            }

            sb.Append(ch);
        }

        if (sb.Length > 0)
        {
            parts.Add(sb.ToString().Trim());
        }

        return parts;
    }

    private static string StripParamPrefix(string name) =>
        name.StartsWith("p_", StringComparison.Ordinal) ? name[2..] : name;

    private static string ToPascalCase(string snake)
    {
        var parts = snake.Split('_', StringSplitOptions.RemoveEmptyEntries);
        var sb = new StringBuilder();
        foreach (var part in parts)
        {
            sb.Append(char.ToUpperInvariant(part[0]));
            if (part.Length > 1)
            {
                sb.Append(part[1..]);
            }
        }
        return sb.ToString();
    }

    private static string ToCamelCase(string snake)
    {
        var pascal = ToPascalCase(snake);
        if (string.IsNullOrEmpty(pascal))
        {
            return pascal;
        }

        var camel = char.ToLowerInvariant(pascal[0]) + pascal[1..];
        return camel is "event" or "params" or "object" or "string" or "int" or "public" or "return"
            ? $"@{camel}"
            : camel;
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "supabase", "migrations")))
            {
                return dir.FullName;
            }
            dir = dir.Parent;
        }

        var cwd = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (cwd is not null)
        {
            if (Directory.Exists(Path.Combine(cwd.FullName, "supabase", "migrations")))
            {
                return cwd.FullName;
            }
            cwd = cwd.Parent;
        }

        throw new InvalidOperationException("Could not locate repository root containing supabase/migrations.");
    }

    private static async Task<(string ConnectionString, string DataDir)> ProvisionEphemeralPostgresAsync(string repoRoot)
    {
        var port = GetFreeTcpPort();
        var shortId = Guid.NewGuid().ToString("N")[..8];
        var baseTmp = Directory.Exists("/tmp") ? "/tmp" : Path.GetTempPath();
        var dataDir = Path.Combine(baseTmp, $"bb-gen-{shortId}");
        Directory.CreateDirectory(dataDir);

        var initDb = ResolvePostgresBinary("initdb");
        var pgCtl = ResolvePostgresBinary("pg_ctl");
        var logFile = Path.Combine(dataDir, "postgres.log");

        await RunProcessAsync(initDb, $"-D \"{dataDir}\" -U postgres --no-instructions -A trust -E UTF8");
        await RunProcessAsync(pgCtl, $"-D \"{dataDir}\" -l \"{logFile}\" -o \"-p {port} -h 127.0.0.1 -k '{dataDir}'\" -w start");

        var cs = $"Host=127.0.0.1;Port={port};Database=postgres;Username=postgres;SslMode=Disable;Pooling=false";
        await using var conn = new NpgsqlConnection(cs);
        await conn.OpenAsync();

        var bootstrapPath = Path.Combine(repoRoot, "api", "tests", "BabyBlue.Integration.Tests", "Fixtures", "supabase-bootstrap.sql");
        await ExecuteSqlAsync(conn, await File.ReadAllTextAsync(bootstrapPath));

        var migrationsDir = Path.Combine(repoRoot, "supabase", "migrations");
        var migrationFiles = Directory.GetFiles(migrationsDir, "*.sql")
            .OrderBy(Path.GetFileName, StringComparer.Ordinal)
            .ToArray();

        foreach (var file in migrationFiles)
        {
            await ExecuteSqlAsync(conn, await File.ReadAllTextAsync(file));
        }

        return (cs, dataDir);
    }

    private static async Task StopEphemeralPostgresAsync(string dataDir)
    {
        try
        {
            var pgCtl = ResolvePostgresBinary("pg_ctl");
            await RunProcessAsync(pgCtl, $"-D \"{dataDir}\" -m immediate -w stop");
        }
        catch
        {
            // Ignore shutdown errors.
        }

        try
        {
            Directory.Delete(dataDir, recursive: true);
        }
        catch
        {
            // Ignore cleanup errors.
        }
    }

    private static async Task ExecuteSqlAsync(NpgsqlConnection conn, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    private static string ResolvePostgresBinary(string name)
    {
        string[] candidates =
        [
            $"/opt/homebrew/bin/{name}",
            $"/opt/homebrew/opt/postgresql@18/bin/{name}",
            $"/opt/homebrew/opt/postgresql@17/bin/{name}",
            $"/usr/local/bin/{name}",
            $"/usr/bin/{name}"
        ];

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return name;
    }

    private static int GetFreeTcpPort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    private static async Task RunProcessAsync(string fileName, string arguments)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };

        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException($"Failed to start process: {fileName}");

        var stdout = await process.StandardOutput.ReadToEndAsync();
        var stderr = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"Command '{fileName} {arguments}' failed with exit code {process.ExitCode}.\nSTDOUT: {stdout}\nSTDERR: {stderr}");
        }
    }
}
