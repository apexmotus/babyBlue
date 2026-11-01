using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace BabyBlue.Data.Npgsql;

/// <summary>
/// Fail-fast startup check verifying that the API connects strictly as the zero-authority
/// <c>bb_api</c> role with <c>noinherit</c>, <c>nobypassrls</c>, ability to assume <c>anon</c>
/// and <c>authenticated</c>, and inability to assume <c>service_role</c> (API_LAYER_SPEC §4, §17).
/// </summary>
internal sealed class DatabaseStartupValidator(
    NpgsqlDataSource dataSource,
    ILogger<DatabaseStartupValidator> logger) : IHostedLifecycleService
{
    private const string SelfCheckSql = """
        select current_user                                                      as current_user,
               (select rolbypassrls from pg_roles where rolname = current_user)  as bypass_rls,
               (select rolinherit   from pg_roles where rolname = current_user)  as inherit,
               pg_has_role(current_user, 'authenticated', 'member')              as can_assume_authenticated,
               pg_has_role(current_user, 'anon', 'member')                       as can_assume_anon,
               pg_has_role(current_user, 'service_role', 'member')               as can_assume_service_role;
        """;

    public async Task StartingAsync(CancellationToken cancellationToken)
    {
        await ValidateRolePostureAsync(dataSource, logger, cancellationToken);
    }

    public static async Task ValidateRolePostureAsync(
        NpgsqlDataSource dataSource,
        ILogger? logger = null,
        CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand(SelfCheckSql, conn);
        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);

        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new InvalidOperationException("Database startup self-check returned no rows.");
        }

        var currentUser = reader.GetString(0);
        var bypassRls = reader.GetBoolean(1);
        var inherit = reader.GetBoolean(2);
        var canAssumeAuthenticated = reader.GetBoolean(3);
        var canAssumeAnon = reader.GetBoolean(4);
        var canAssumeServiceRole = reader.GetBoolean(5);

        if (!string.Equals(currentUser, "bb_api", StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                $"Database role check failed: expected current_user = 'bb_api', but connected as '{currentUser}'.");
        }

        if (bypassRls)
        {
            throw new InvalidOperationException(
                "Database role check failed: 'bb_api' has rolbypassrls = true. RLS would be bypassed.");
        }

        if (inherit)
        {
            throw new InvalidOperationException(
                "Database role check failed: 'bb_api' has rolinherit = true. Role privileges must not be inherited without explicit SET LOCAL ROLE.");
        }

        if (!canAssumeAuthenticated)
        {
            throw new InvalidOperationException(
                "Database role check failed: 'bb_api' is not a member of 'authenticated'.");
        }

        if (!canAssumeAnon)
        {
            throw new InvalidOperationException(
                "Database role check failed: 'bb_api' is not a member of 'anon'.");
        }

        if (canAssumeServiceRole)
        {
            throw new InvalidOperationException(
                "Database role check failed: 'bb_api' is a member of 'service_role', which is strictly prohibited.");
        }

        logger?.LogInformation(
            "database_role_verified role={Role} bypass_rls={BypassRls} inherit={Inherit}",
            currentUser, bypassRls, inherit);
    }

    public Task StartAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StartedAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StoppingAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    public Task StoppedAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
