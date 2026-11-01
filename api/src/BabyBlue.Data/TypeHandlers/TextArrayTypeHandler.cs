using System.Data;
using Dapper;
using Npgsql;
using NpgsqlTypes;

namespace BabyBlue.Data.TypeHandlers;

internal sealed class TextArrayTypeHandler : SqlMapper.TypeHandler<string[]>
{
    public static readonly TextArrayTypeHandler Instance = new();

    public override void SetValue(IDbDataParameter parameter, string[]? value)
    {
        parameter.Value = (object?)value ?? DBNull.Value;
        if (parameter is NpgsqlParameter npgsqlParam)
        {
            npgsqlParam.NpgsqlDbType = NpgsqlDbType.Array | NpgsqlDbType.Text;
        }
    }

    public override string[] Parse(object value) =>
        value switch
        {
            string[] arr => arr,
            IEnumerable<string> enumerable => enumerable.ToArray(),
            _ => []
        };
}

internal sealed class UuidArrayTypeHandler : SqlMapper.TypeHandler<Guid[]>
{
    public static readonly UuidArrayTypeHandler Instance = new();

    public override void SetValue(IDbDataParameter parameter, Guid[]? value)
    {
        parameter.Value = (object?)value ?? DBNull.Value;
        if (parameter is NpgsqlParameter npgsqlParam)
        {
            npgsqlParam.NpgsqlDbType = NpgsqlDbType.Array | NpgsqlDbType.Uuid;
        }
    }

    public override Guid[] Parse(object value) =>
        value switch
        {
            Guid[] arr => arr,
            IEnumerable<Guid> enumerable => enumerable.ToArray(),
            _ => []
        };
}

internal sealed class IntArrayTypeHandler : SqlMapper.TypeHandler<int[]>
{
    public static readonly IntArrayTypeHandler Instance = new();

    public override void SetValue(IDbDataParameter parameter, int[]? value)
    {
        parameter.Value = (object?)value ?? DBNull.Value;
        if (parameter is NpgsqlParameter npgsqlParam)
        {
            npgsqlParam.NpgsqlDbType = NpgsqlDbType.Array | NpgsqlDbType.Integer;
        }
    }

    public override int[] Parse(object value) =>
        value switch
        {
            int[] arr => arr,
            IEnumerable<int> enumerable => enumerable.ToArray(),
            _ => []
        };
}
