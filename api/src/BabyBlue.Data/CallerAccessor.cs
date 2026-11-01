using BabyBlue.Contracts.Auth;

namespace BabyBlue.Data;

public sealed class CallerAccessor : ICallerAccessor
{
    private CallerContext? _current;

    public bool IsInitialized => _current is not null;

    public CallerContext Current =>
        _current ?? throw new InvalidOperationException("CallerContext has not been initialized for this request.");

    public void Initialize(CallerContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        _current = context;
    }

    public string? LastProcedure { get; set; }
}
