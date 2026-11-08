using System.Text.RegularExpressions;
using BabyBlue.Contracts.Auth;
using Npgsql;

namespace BabyBlue.Data.Npgsql;

internal static partial class SessionContext
{
    // `public` is accepted for Phases 0-5 (F-01 / D-31); the bb_* form is accepted so that
    // MULTITENANCY_PLAN.md Phase 1 needs no change here. Anything else is rejected before
    // the string reaches a `set local` statement, which is what makes the interpolation safe.
    [GeneratedRegex(@"^(public|bb_[a-z][a-z0-9_]{1,28})$", RegexOptions.CultureInvariant)]
    private static partial Regex SchemaPattern();

    /// <summary>
    /// Applies caller identity, brand schema and statement budget to an OPEN transaction.
    /// Every statement here is <c>set local</c> or <c>set_config(..., is_local: true)</c>, so all of it
    /// unwinds with the transaction. Nothing survives onto the pooled connection.
    /// </summary>
    public static async Task ApplyAsync(
        NpgsqlConnection cx,
        NpgsqlTransaction tx,
        CallerContext caller,
        CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(caller);
        ArgumentNullException.ThrowIfNull(caller.Brand);

        if (!SchemaPattern().IsMatch(caller.Brand.SchemaName))
        {
            throw new InvalidOperationException("invalid_schema");
        }

        var dbRole = caller.DbRole switch
        {
            DbRole.Authenticated => "authenticated",
            DbRole.Anonymous     => "anon",
            _ => throw new InvalidOperationException("invalid_role")
        };

        ArgumentNullException.ThrowIfNull(cx);
        ArgumentNullException.ThrowIfNull(tx);

        var budget = caller.DbRole == DbRole.Anonymous ? "5s" : "15s";
        var idleBudget = caller.DbRole == DbRole.Anonymous ? "10s" : "30s";

        // Combine session-local GUC setup into one round-trip on the open transaction:
        await ExecAsync(cx, tx,
            $"""
            set local search_path = {caller.Brand.SchemaName};
            set local role {dbRole};
            set local statement_timeout = '{budget}';
            set local idle_in_transaction_session_timeout = '{idleBudget}';
            """, ct);

        if (caller.UserId is { } uid)
        {
            await using var cmd = new NpgsqlCommand(
                """
                select set_config('request.jwt.claim.sub', @sub, true),
                       set_config('request.jwt.claims',    @claims, true),
                       set_config('application_name',      @app, true)
                """, cx, tx);
            cmd.Parameters.AddWithValue("sub", uid.ToString());
            cmd.Parameters.AddWithValue("claims", caller.ClaimsJson ?? "{}");
            cmd.Parameters.AddWithValue("app", $"bb-api:{caller.RequestId}");
            await cmd.ExecuteNonQueryAsync(ct);
        }
        else
        {
            await using var cmd = new NpgsqlCommand(
                """
                select set_config('request.jwt.claim.sub', '', true),
                       set_config('request.jwt.claims',    '', true),
                       set_config('application_name',      @app, true)
                """, cx, tx);
            cmd.Parameters.AddWithValue("app", $"bb-api:{caller.RequestId}");
            await cmd.ExecuteNonQueryAsync(ct);
        }
    }

    private static async Task ExecAsync(
        NpgsqlConnection cx,
        NpgsqlTransaction tx,
        string sql,
        CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand(sql, cx, tx);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
