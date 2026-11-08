using BabyBlue.Contracts.Auth;

namespace BabyBlue.Data;

public interface ICallerAccessor
{
    CallerContext Current { get; }
    bool IsInitialized { get; }
    void Initialize(CallerContext context);
    string? LastProcedure { get; set; }
}
