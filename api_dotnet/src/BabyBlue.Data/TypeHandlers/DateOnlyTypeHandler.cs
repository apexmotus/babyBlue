using System.Data;
using Dapper;
using Npgsql;
using NpgsqlTypes;

namespace BabyBlue.Data.TypeHandlers;

internal sealed class DateOnlyTypeHandler : SqlMapper.TypeHandler<DateOnly>
{
    public static readonly DateOnlyTypeHandler Instance = new();

    public override void SetValue(IDbDataParameter parameter, DateOnly value)
    {
        parameter.Value = value;
        if (parameter is NpgsqlParameter npgsqlParam)
        {
            npgsqlParam.NpgsqlDbType = NpgsqlDbType.Date;
        }
    }

    public override DateOnly Parse(object value) =>
        value switch
        {
            DateOnly dateOnly => dateOnly,
            DateTime dateTime => DateOnly.FromDateTime(dateTime),
            DateTimeOffset dto => DateOnly.FromDateTime(dto.DateTime),
            string text => DateOnly.Parse(text, System.Globalization.CultureInfo.InvariantCulture),
            _ => throw new DataException($"Cannot convert {value.GetType().FullName} to DateOnly.")
        };
}

internal sealed class DateTimeOffsetTypeHandler : SqlMapper.TypeHandler<DateTimeOffset>
{
    public static readonly DateTimeOffsetTypeHandler Instance = new();

    public override void SetValue(IDbDataParameter parameter, DateTimeOffset value)
    {
        parameter.Value = value.UtcDateTime;
        if (parameter is NpgsqlParameter npgsqlParam)
        {
            npgsqlParam.NpgsqlDbType = NpgsqlDbType.TimestampTz;
        }
    }

    public override DateTimeOffset Parse(object value) =>
        value switch
        {
            DateTimeOffset dto => dto,
            DateTime dt => dt.Kind == DateTimeKind.Unspecified
                ? new DateTimeOffset(DateTime.SpecifyKind(dt, DateTimeKind.Utc))
                : new DateTimeOffset(dt.ToUniversalTime()),
            string text => DateTimeOffset.Parse(text, System.Globalization.CultureInfo.InvariantCulture),
            _ => throw new DataException($"Cannot convert {value.GetType().FullName} to DateTimeOffset.")
        };
}
