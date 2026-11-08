using BabyBlue.Data.TypeHandlers;
using Dapper;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace BabyBlue.Data.Npgsql;

internal static class DataSourceFactory
{
    private static int _dapperConfigured;

    public static void ConfigureDapper()
    {
        if (Interlocked.Exchange(ref _dapperConfigured, 1) == 1)
        {
            return;
        }

        DefaultTypeMap.MatchNamesWithUnderscores = true;
        SqlMapper.AddTypeHandler(JsonbTypeHandler.Instance);
        SqlMapper.AddTypeHandler(TextArrayTypeHandler.Instance);
        SqlMapper.AddTypeHandler(UuidArrayTypeHandler.Instance);
        SqlMapper.AddTypeHandler(IntArrayTypeHandler.Instance);
        SqlMapper.AddTypeHandler(DateOnlyTypeHandler.Instance);
        SqlMapper.AddTypeHandler(DateTimeOffsetTypeHandler.Instance);
    }

    public static NpgsqlDataSource Create(
        DatabaseOptions options,
        ILoggerFactory? loggerFactory = null)
    {
        ArgumentNullException.ThrowIfNull(options);
        if (string.IsNullOrWhiteSpace(options.ConnectionString))
        {
            throw new ArgumentException("Connection string is required.", nameof(options));
        }

        ConfigureDapper();

        var b = new NpgsqlDataSourceBuilder(options.ConnectionString);
        var csb = b.ConnectionStringBuilder;

        var maxPool = Math.Max(1, options.MaxPoolSize);
        var minPool = Math.Clamp(options.MinPoolSize, 0, maxPool);

        // Mandatory pooling and security invariants (API_LAYER_SPEC §4 & §17):
        csb.Pooling = true;
        csb.MinPoolSize = minPool;
        csb.MaxPoolSize = maxPool;
        csb.ConnectionIdleLifetime = options.ConnectionIdleLifetimeSeconds;
        csb.ConnectionPruningInterval = options.ConnectionPruningIntervalSeconds;
        csb.Timeout = options.TimeoutSeconds;
        csb.CommandTimeout = options.CommandTimeoutSeconds;
        csb.NoResetOnClose = false;      // Mandatory: ensures DISCARD ALL runs when connections return to the pool
        csb.IncludeErrorDetail = false;  // Mandatory: prevents column values and constraint details from leaking
        csb.ApplicationName = "babyblue-api";

        if (!options.AllowInsecureSslForLocalTesting)
        {
            csb.SslMode = SslMode.VerifyFull;
        }
        else if (csb.SslMode == SslMode.VerifyFull)
        {
            // Keep explicit SslMode from connection string when local testing is enabled.
        }

        if (loggerFactory is not null)
        {
            b.UseLoggerFactory(loggerFactory);
        }

        b.EnableDynamicJson();
        return b.Build();
    }

    public static NpgsqlDataSource Create(
        string connectionString,
        ILoggerFactory? loggerFactory = null,
        bool allowInsecureSslForLocalTesting = false,
        int maxPoolSize = 40,
        int minPoolSize = 5) =>
        Create(
            new DatabaseOptions
            {
                ConnectionString = connectionString,
                AllowInsecureSslForLocalTesting = allowInsecureSslForLocalTesting,
                MaxPoolSize = maxPoolSize,
                MinPoolSize = minPoolSize
            },
            loggerFactory);
}
