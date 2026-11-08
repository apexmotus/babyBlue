using System.Diagnostics;
using BabyBlue.Data.Npgsql;
using Dapper;
using Npgsql;

namespace BabyBlue.Data;

public interface IProcedureGateway
{
    Task<IReadOnlyList<TRow>> QueryAsync<TRow>(
        ProcedureName proc,
        object? args = null,
        CancellationToken ct = default);

    Task<TRow> QuerySingleAsync<TRow>(
        ProcedureName proc,
        object? args = null,
        CancellationToken ct = default);

    Task<T?> ScalarAsync<T>(
        ProcedureName proc,
        object? args = null,
        CancellationToken ct = default);

    Task ExecuteAsync(
        ProcedureName proc,
        object? args = null,
        CancellationToken ct = default);
}

public sealed class ProcedureGateway(
    NpgsqlDataSource dataSource,
    ICallerAccessor callerAccessor) : IProcedureGateway
{
    public static readonly ActivitySource ActivitySource = new("BabyBlue.Data");

    private enum Shape
    {
        Table,
        Scalar
    }

    public Task<IReadOnlyList<TRow>> QueryAsync<TRow>(
        ProcedureName proc,
        object? args = null,
        CancellationToken ct = default) =>
        RunWithRetryAsync(
            proc,
            args,
            static async (cmd, cx) => (IReadOnlyList<TRow>)(await cx.QueryAsync<TRow>(cmd)).AsList(),
            Shape.Table,
            ct);

    public async Task<TRow> QuerySingleAsync<TRow>(
        ProcedureName proc,
        object? args = null,
        CancellationToken ct = default)
    {
        var row = await RunWithRetryAsync(
            proc,
            args,
            static (cmd, cx) => cx.QuerySingleOrDefaultAsync<TRow>(cmd),
            Shape.Table,
            ct);

        if (row is null)
        {
            throw new ProcedureNotFoundException(proc.Name);
        }

        return row;
    }

    public Task<T?> ScalarAsync<T>(
        ProcedureName proc,
        object? args = null,
        CancellationToken ct = default) =>
        RunWithRetryAsync(
            proc,
            args,
            static (cmd, cx) => cx.ExecuteScalarAsync<T>(cmd),
            Shape.Scalar,
            ct);

    public Task ExecuteAsync(
        ProcedureName proc,
        object? args = null,
        CancellationToken ct = default) =>
        RunWithRetryAsync(
            proc,
            args,
            static (cmd, cx) => cx.ExecuteAsync(cmd),
            Shape.Scalar,
            ct);

    private async Task<TResult> RunWithRetryAsync<TResult>(
        ProcedureName proc,
        object? args,
        Func<CommandDefinition, NpgsqlConnection, Task<TResult>> run,
        Shape shape,
        CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(proc);
        callerAccessor.LastProcedure = proc.Name;

        const int maxRetries = 2;
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                return await RunOnceAsync(proc, args, run, shape, ct);
            }
            catch (NpgsqlException ex) when (
                proc.Volatility == Volatility.Stable &&
                attempt < maxRetries &&
                IsRetryable(ex))
            {
                var delayMs = Random.Shared.Next(25, 76);
                await Task.Delay(delayMs, ct);
            }
        }
    }

    private async Task<TResult> RunOnceAsync<TResult>(
        ProcedureName proc,
        object? args,
        Func<CommandDefinition, NpgsqlConnection, Task<TResult>> run,
        Shape shape,
        CancellationToken ct)
    {
        var caller = callerAccessor.Current;

        using var activity = ActivitySource.StartActivity(proc.Name, ActivityKind.Client);
        if (activity is not null)
        {
            activity.SetTag("db.system", "postgresql");
            activity.SetTag("db.operation", proc.Name);
            activity.SetTag("bb.brand", caller.Brand.Slug);
            activity.SetTag("bb.role", caller.DbRole.ToString());
        }

        await using var conn = await dataSource.OpenConnectionAsync(ct);
        await using var tx = await conn.BeginTransactionAsync(ct);

        await SessionContext.ApplyAsync(conn, tx, caller, ct);

        var sql = shape == Shape.Table
            ? $"select * from {proc.Sql}"
            : $"select {proc.Sql}";

        var cmd = new CommandDefinition(sql, args, tx, cancellationToken: ct);
        var result = await run(cmd, conn);

        await tx.CommitAsync(ct);
        return result;
    }

    private static bool IsRetryable(NpgsqlException ex) =>
        ex is PostgresException pg
            ? pg.SqlState is "40001" or "40P01"
            : ex.IsTransient;
}
