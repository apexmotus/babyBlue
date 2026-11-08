using System.Data;
using System.Text.Json;
using Dapper;
using Npgsql;
using NpgsqlTypes;

namespace BabyBlue.Data.TypeHandlers;

internal sealed class JsonbTypeHandler : SqlMapper.TypeHandler<JsonElement>
{
    public static readonly JsonbTypeHandler Instance = new();

    public override void SetValue(IDbDataParameter parameter, JsonElement value)
    {
        parameter.Value = value.ValueKind == JsonValueKind.Undefined ? DBNull.Value : value.GetRawText();
        if (parameter is NpgsqlParameter npgsqlParam)
        {
            npgsqlParam.NpgsqlDbType = NpgsqlDbType.Jsonb;
        }
    }

    public override JsonElement Parse(object value) =>
        value switch
        {
            JsonElement element => element.Clone(),
            JsonDocument doc => doc.RootElement.Clone(),
            string json when !string.IsNullOrWhiteSpace(json) => JsonDocument.Parse(json).RootElement.Clone(),
            _ => JsonDocument.Parse("{}").RootElement.Clone()
        };
}
