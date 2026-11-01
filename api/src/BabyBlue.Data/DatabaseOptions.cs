using Microsoft.Extensions.Options;

namespace BabyBlue.Data;

public sealed class DatabaseOptions
{
    public const string SectionName = "Database";

    public string ConnectionString { get; set; } = string.Empty;
    public int MinPoolSize { get; set; } = 5;
    public int MaxPoolSize { get; set; } = 40;
    public int ConnectionIdleLifetimeSeconds { get; set; } = 300;
    public int ConnectionPruningIntervalSeconds { get; set; } = 10;
    public int TimeoutSeconds { get; set; } = 10;
    public int CommandTimeoutSeconds { get; set; } = 20;

    /// <summary>
    /// Allows SslMode=Disable or SslMode=Prefer in Development/Testing environments only.
    /// Production and Staging always enforce SslMode=VerifyFull (API_LAYER_SPEC §4, §17).
    /// </summary>
    public bool AllowInsecureSslForLocalTesting { get; set; }
}

internal sealed class DatabaseOptionsValidator : IValidateOptions<DatabaseOptions>
{
    public ValidateOptionsResult Validate(string? name, DatabaseOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.ConnectionString))
        {
            return ValidateOptionsResult.Fail("Database:ConnectionString is required.");
        }

        if (options.MaxPoolSize < 1)
        {
            return ValidateOptionsResult.Fail("Database:MaxPoolSize must be at least 1.");
        }

        if (options.MinPoolSize < 0)
        {
            return ValidateOptionsResult.Fail("Database:MinPoolSize cannot be negative.");
        }

        if (options.CommandTimeoutSeconds <= 15)
        {
            return ValidateOptionsResult.Fail(
                "Database:CommandTimeoutSeconds must exceed the 15s PostgreSQL statement_timeout so the server raises SQLSTATE 57014.");
        }

        return ValidateOptionsResult.Success;
    }
}
