namespace BabyBlue.Data;

/// <summary>
/// Thrown by <see cref="IProcedureGateway.QuerySingleAsync{TRow}"/> when a single-entity
/// lookup procedure returns zero rows. Mapped to HTTP 404 <c>not_found</c> by the global
/// exception handler.
/// </summary>
public sealed class ProcedureNotFoundException : Exception
{
    public string ProcedureName { get; }

    public ProcedureNotFoundException(string procedureName)
        : base($"Procedure '{procedureName}' returned zero rows.")
    {
        ProcedureName = procedureName;
    }
}
