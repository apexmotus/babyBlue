using BabyBlue.Data.Generated;
using BabyBlue.Data.Npgsql;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Npgsql;

namespace BabyBlue.Data;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddBabyBlueData(
        this IServiceCollection services,
        Action<DatabaseOptions>? configure = null)
    {
        DataSourceFactory.ConfigureDapper();

        services.AddMemoryCache();

        services.AddSingleton<IValidateOptions<DatabaseOptions>, DatabaseOptionsValidator>();
        if (configure is not null)
        {
            services.Configure(configure);
        }

        services.TryAddSingleton<NpgsqlDataSource>(sp =>
        {
            var options = sp.GetRequiredService<IOptions<DatabaseOptions>>().Value;
            var loggerFactory = sp.GetService<ILoggerFactory>();
            return DataSourceFactory.Create(options, loggerFactory);
        });

        services.AddSingleton<IHostedService, DatabaseStartupValidator>();
        services.TryAddSingleton<IBrandRegistry, BrandRegistry>();

        services.TryAddScoped<CallerAccessor>();
        services.TryAddScoped<ICallerAccessor>(sp => sp.GetRequiredService<CallerAccessor>());
        services.TryAddScoped<IProcedureGateway, ProcedureGateway>();

        // Register generated procedure wrapper classes
        services.TryAddScoped<PublicProcedures>();
        services.TryAddScoped<PatientProcedures>();
        services.TryAddScoped<PracticeProcedures>();
        services.TryAddScoped<PracticeContextProcedures>();
        services.TryAddScoped<PracticeTeamProcedures>();
        services.TryAddScoped<PracticeServicesProcedures>();
        services.TryAddScoped<PracticeAvailabilityProcedures>();
        services.TryAddScoped<PracticeClientsProcedures>();
        services.TryAddScoped<PracticeAppointmentsProcedures>();
        services.TryAddScoped<PracticeQueueProcedures>();
        services.TryAddScoped<PracticeSettingsProcedures>();
        services.TryAddScoped<GrowthProcedures>();
        services.TryAddScoped<PlatformProcedures>();

        return services;
    }
}
