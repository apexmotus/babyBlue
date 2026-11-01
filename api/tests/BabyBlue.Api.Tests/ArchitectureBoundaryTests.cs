using System.Reflection;
using System.Runtime.CompilerServices;
using BabyBlue.Contracts.Auth;
using BabyBlue.Data;
using Npgsql;
using Xunit;

namespace BabyBlue.Api.Tests;

public sealed class ArchitectureBoundaryTests
{
    [Fact]
    public void Contracts_Assembly_Has_Zero_Dependencies_On_Data_Npgsql_Or_Dapper()
    {
        var contractsAssembly = typeof(CallerContext).Assembly;
        var referencedNames = contractsAssembly
            .GetReferencedAssemblies()
            .Select(a => a.Name ?? string.Empty)
            .ToArray();

        Assert.DoesNotContain(referencedNames, n => n.Equals("BabyBlue.Data", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(referencedNames, n => n.StartsWith("Npgsql", StringComparison.OrdinalIgnoreCase));
        Assert.DoesNotContain(referencedNames, n => n.StartsWith("Dapper", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Api_Assembly_Does_Not_Directly_Reference_NpgsqlConnection_Or_Dapper_SqlMapper()
    {
        var apiAssembly = typeof(Program).Assembly;

        // Inspect all non-compiler-generated types and their fields/properties/method signatures in BabyBlue.Api:
        foreach (var type in apiAssembly.GetTypes())
        {
            foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static))
            {
                AssertNotForbiddenDataType(field.FieldType, $"{type.FullName}.{field.Name}");
            }

            foreach (var prop in type.GetProperties(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static))
            {
                AssertNotForbiddenDataType(prop.PropertyType, $"{type.FullName}.{prop.Name}");
            }

            foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly))
            {
                AssertNotForbiddenDataType(method.ReturnType, $"{type.FullName}.{method.Name}()");
                foreach (var param in method.GetParameters())
                {
                    AssertNotForbiddenDataType(param.ParameterType, $"{type.FullName}.{method.Name}({param.Name})");
                }
            }
        }
    }

    [Fact]
    public void BabyBlue_Data_Npgsql_And_TypeHandlers_Types_Are_Internal()
    {
        var dataAssembly = typeof(ICallerAccessor).Assembly;
        var internalNamespaces = new[] { "BabyBlue.Data.Npgsql", "BabyBlue.Data.TypeHandlers" };

        var exposedTypes = dataAssembly
            .GetExportedTypes()
            .Where(t => internalNamespaces.Contains(t.Namespace))
            .ToArray();

        Assert.Empty(exposedTypes);
    }

    private static void AssertNotForbiddenDataType(Type type, string memberLocation)
    {
        var unwrapped = type.IsGenericType ? type.GetGenericTypeDefinition() : type;
        Assert.False(
            type == typeof(NpgsqlConnection) ||
            type == typeof(NpgsqlTransaction) ||
            type == typeof(NpgsqlCommand) ||
            type.FullName?.StartsWith("Dapper.", StringComparison.Ordinal) == true ||
            unwrapped.FullName?.StartsWith("Dapper.", StringComparison.Ordinal) == true,
            $"Forbidden direct data type '{type.FullName}' found at '{memberLocation}'. Controllers and middleware must go through BabyBlue.Data.");
    }
}
