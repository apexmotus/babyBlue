namespace BabyBlue.Data;

public enum Volatility
{
    Stable,
    Volatile
}

public enum GrantedTo
{
    Authenticated,
    AnonAndAuthenticated
}

/// <summary>
/// Closed token representing a PostgreSQL stored procedure in the active brand schema.
/// The constructor is <c>internal</c> so only <c>BabyBlue.Data</c> (specifically the generated
/// <c>Procedures.g.cs</c> catalogue) can construct instances.
/// </summary>
public sealed record ProcedureName
{
    public string Name { get; }
    public string Sql { get; }
    public Volatility Volatility { get; }
    public GrantedTo GrantedTo { get; }

    internal ProcedureName(
        string name,
        string sql,
        Volatility volatility,
        GrantedTo grantedTo = GrantedTo.Authenticated)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(sql);
        Name = name;
        Sql = sql;
        Volatility = volatility;
        GrantedTo = grantedTo;
    }

    internal ProcedureName(string name, Volatility volatility)
        : this(name, $"{name}()", volatility, GrantedTo.Authenticated)
    {
    }

    public override string ToString() => Name;
}
