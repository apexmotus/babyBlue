using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using Npgsql;
using Xunit;

namespace BabyBlue.Integration.Tests.Fixtures;

[CollectionDefinition(Name)]
public sealed class PostgresDatabaseCollection : ICollectionFixture<PostgresDatabaseFixture>
{
    public const string Name = "PostgresDatabase";
}

/// <summary>
/// Manages an isolated, real PostgreSQL instance provisioned with <c>supabase-bootstrap.sql</c>,
/// all <c>supabase/migrations/*.sql</c> files in order, and the <c>tests/db/harness.ts</c> seed data.
/// Uses an external connection string when <c>BABYBLUE_TEST_POSTGRES_ADMIN_CS</c> is provided,
/// or boots an ephemeral local PostgreSQL cluster via <c>initdb</c> + <c>pg_ctl</c>.
/// </summary>
public sealed class PostgresDatabaseFixture : IAsyncLifetime
{
    private string? _dataDir;
    private bool _ownsCluster;

    public string SuperuserConnectionString { get; private set; } = string.Empty;
    public string BbApiConnectionString { get; private set; } = string.Empty;
    public string InheritRoleConnectionString { get; private set; } = string.Empty;
    public string BypassRlsRoleConnectionString { get; private set; } = string.Empty;

    public static readonly Guid OwnerA = Guid.Parse("00000000-0000-4000-8000-000000000001");
    public static readonly Guid ReceptionA = Guid.Parse("00000000-0000-4000-8000-000000000002");
    public static readonly Guid OwnerB = Guid.Parse("00000000-0000-4000-8000-000000000003");
    public static readonly Guid Consumer1 = Guid.Parse("00000000-0000-4000-8000-000000000004");
    public static readonly Guid Consumer2 = Guid.Parse("00000000-0000-4000-8000-000000000005");
    public static readonly Guid PracticeA = Guid.Parse("00000000-0000-4000-8000-000000000101");
    public static readonly Guid PracticeB = Guid.Parse("00000000-0000-4000-8000-000000000102");
    public static readonly Guid PracticeB2 = Guid.Parse("00000000-0000-4000-8000-000000000103");
    public static readonly Guid PractitionerA = Guid.Parse("00000000-0000-4000-8000-000000000201");
    public static readonly Guid ServiceA = Guid.Parse("00000000-0000-4000-8000-000000000301");
    public static readonly Guid BabyBlueBrandId = Guid.Parse("00000000-0000-4000-8000-000000000900");
    public static readonly Guid TestBrandId = Guid.Parse("00000000-0000-4000-8000-000000000901");

    public async Task InitializeAsync()
    {
        var externalAdminCs = Environment.GetEnvironmentVariable("BABYBLUE_TEST_POSTGRES_ADMIN_CS");
        int port;
        string host;

        if (!string.IsNullOrWhiteSpace(externalAdminCs))
        {
            var csb = new NpgsqlConnectionStringBuilder(externalAdminCs);
            host = csb.Host ?? "127.0.0.1";
            port = csb.Port;
            SuperuserConnectionString = externalAdminCs;
        }
        else
        {
            port = GetFreeTcpPort();
            host = "127.0.0.1";
            var shortId = Guid.NewGuid().ToString("N")[..8];
            var baseTmp = Directory.Exists("/tmp") ? "/tmp" : Path.GetTempPath();
            _dataDir = Path.Combine(baseTmp, $"bb-pg-{shortId}");
            Directory.CreateDirectory(_dataDir);
            _ownsCluster = true;

            var initDb = ResolvePostgresBinary("initdb");
            var pgCtl = ResolvePostgresBinary("pg_ctl");
            var logFile = Path.Combine(_dataDir, "postgres.log");

            await RunProcessAsync(initDb, $"-D \"{_dataDir}\" -U postgres --no-instructions -A trust -E UTF8");
            try
            {
                await RunProcessAsync(
                    pgCtl,
                    $"-D \"{_dataDir}\" -l \"{logFile}\" -o \"-p {port} -h 127.0.0.1 -k '{_dataDir}'\" -w start");
            }
            catch (Exception ex) when (File.Exists(logFile))
            {
                var logContents = await File.ReadAllTextAsync(logFile);
                throw new InvalidOperationException($"{ex.Message}\nPOSTGRES LOG:\n{logContents}", ex);
            }

            SuperuserConnectionString =
                $"Host={host};Port={port};Database=postgres;Username=postgres;SslMode=Disable;Pooling=false;Include Error Detail=true";
        }

        BbApiConnectionString =
            $"Host={host};Port={port};Database=postgres;Username=bb_api;SslMode=Disable";
        InheritRoleConnectionString =
            $"Host={host};Port={port};Database=postgres;Username=bb_api_bad_inherit;SslMode=Disable";
        BypassRlsRoleConnectionString =
            $"Host={host};Port={port};Database=postgres;Username=bb_api_bad_bypassrls;SslMode=Disable";

        await ApplyBootstrapAndMigrationsAsync();
    }

    private async Task ApplyBootstrapAndMigrationsAsync()
    {
        await using var conn = new NpgsqlConnection(SuperuserConnectionString);
        await conn.OpenAsync();

        var repoRoot = FindRepoRoot();
        var bootstrapPath = Path.Combine(AppContext.BaseDirectory, "Fixtures", "supabase-bootstrap.sql");
        if (!File.Exists(bootstrapPath))
        {
            bootstrapPath = Path.Combine(repoRoot, "api", "tests", "BabyBlue.Integration.Tests", "Fixtures", "supabase-bootstrap.sql");
        }

        await ExecuteSqlScriptAsync(conn, await File.ReadAllTextAsync(bootstrapPath));

        var migrationsDir = Path.Combine(repoRoot, "supabase", "migrations");
        var migrationFiles = Directory.GetFiles(migrationsDir, "*.sql")
            .OrderBy(Path.GetFileName, StringComparer.Ordinal)
            .ToArray();

        foreach (var file in migrationFiles)
        {
            var sql = await File.ReadAllTextAsync(file);
            await ExecuteSqlScriptAsync(conn, sql);
        }

        // Provision auxiliary misconfigured roles strictly for negative startup-validator tests (§4 Test 2),
        // and seed the baseline test rows matching tests/db/harness.ts.
        const string testSetupSql = """
            do $$
            begin
              if not exists (select 1 from pg_roles where rolname = 'bb_api_bad_inherit') then
                create role bb_api_bad_inherit with login nosuperuser nocreatedb nocreaterole inherit nobypassrls;
              end if;
              if not exists (select 1 from pg_roles where rolname = 'bb_api_bad_bypassrls') then
                create role bb_api_bad_bypassrls with login nosuperuser nocreatedb nocreaterole noinherit bypassrls;
              end if;
            end $$;
            grant anon, authenticated to bb_api_bad_inherit;
            grant anon, authenticated to bb_api_bad_bypassrls;

            insert into auth.users (id, email) values
              ('00000000-0000-4000-8000-000000000001', 'owner-a@example.test'),
              ('00000000-0000-4000-8000-000000000002', 'reception-a@example.test'),
              ('00000000-0000-4000-8000-000000000003', 'owner-b@example.test'),
              ('00000000-0000-4000-8000-000000000004', 'c1@example.test'),
              ('00000000-0000-4000-8000-000000000005', 'c2@example.test')
            on conflict (id) do nothing;

            insert into public.profiles (id, display_name, phone) values
              ('00000000-0000-4000-8000-000000000001', 'Owner A', '+27820000001'),
              ('00000000-0000-4000-8000-000000000002', 'Reception A', '+27820000002'),
              ('00000000-0000-4000-8000-000000000003', 'Owner B', '+27820000003'),
              ('00000000-0000-4000-8000-000000000004', 'Consumer One', '+27820000004'),
              ('00000000-0000-4000-8000-000000000005', 'Consumer Two', '+27820000005')
            on conflict (id) do nothing;

            insert into public.practices (id, name, slug, status, province) values
              ('00000000-0000-4000-8000-000000000101', 'Practice A', 'practice-a', 'active', 'Gauteng'),
              ('00000000-0000-4000-8000-000000000102', 'Practice B', 'practice-b', 'active', 'Western Cape')
            on conflict (id) do nothing;

            insert into public.practice_members (practice_id, user_id, role) values
              ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'practice_owner'),
              ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000002', 'receptionist'),
              ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000003', 'practice_owner')
            on conflict (practice_id, user_id) do nothing;

            insert into public.locations (id, practice_id, name, city, address, city_id, is_primary) values
              ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000101', 'Main', 'Johannesburg', '1 Rosebank Rd',
               (select id from public.cities where slug = 'johannesburg' limit 1), true)
            on conflict (id) do update set
              city_id = excluded.city_id,
              is_primary = true;

            insert into public.practitioners (id, practice_id, display_name, speciality, speciality_slug, listing_status) values
              ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'Practitioner A', 'Physiotherapy',
               'physiotherapy', 'listed')
            on conflict (id) do update set
              speciality_slug = excluded.speciality_slug;

            insert into public.services (id, practice_id, name, description, duration_min, buffer_min, price_cents, active) values
              ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101', 'Initial Consult', 'First visit', 30, 0, 65000, true)
            on conflict (id) do nothing;

            insert into public.practitioner_services (practice_id, practitioner_id, service_id) values
              ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000301')
            on conflict do nothing;

            delete from public.availability_rules where practitioner_id = '00000000-0000-4000-8000-000000000201';
            insert into public.availability_rules (practice_id, practitioner_id, location_id, weekday, start_time, end_time)
            select '00000000-0000-4000-8000-000000000101',
                   '00000000-0000-4000-8000-000000000201',
                   '00000000-0000-4000-8000-000000000501',
                   wd,
                   '08:00'::time,
                   '17:00'::time
              from generate_series(0, 6) as wd;

            -- Provision second brand schema `bb_testbrand` for Phase 1 cross-brand pool-isolation gate
            create schema if not exists bb_testbrand;
            grant usage on schema bb_testbrand to anon, authenticated;

            create table if not exists bb_testbrand.practices (
              id uuid primary key,
              name text not null,
              slug text not null unique,
              status text not null default 'active',
              Accepting_queue boolean not null default true
            );
            alter table bb_testbrand.practices enable row level security;

            create table if not exists bb_testbrand.practice_members (
              practice_id uuid not null references bb_testbrand.practices(id) on delete cascade,
              user_id uuid not null,
              role public.practice_role not null,
              primary key (practice_id, user_id)
            );
            alter table bb_testbrand.practice_members enable row level security;

            drop policy if exists pm_self on bb_testbrand.practice_members;
            create policy pm_self on bb_testbrand.practice_members
              for select to authenticated
              using (user_id = auth.uid());

            drop policy if exists p_member on bb_testbrand.practices;
            create policy p_member on bb_testbrand.practices
              for select to authenticated
              using (exists (
                select 1 from bb_testbrand.practice_members pm
                 where pm.practice_id = practices.id and pm.user_id = auth.uid()
              ));

            grant select on bb_testbrand.practices, bb_testbrand.practice_members to authenticated;

            create or replace function bb_testbrand.public_city_list()
            returns table (city_id uuid, name text, slug text, province text, practitioner_count int)
            language sql stable security definer set search_path = bb_testbrand
            as $$
              select '00000000-0000-4000-8000-000000000801'::uuid,
                     'TestBrand City'::text,
                     'testbrand-city'::text,
                     'Western Cape'::text,
                     1::int;
            $$;

            create or replace function bb_testbrand.practice_memberships_list()
            returns table (
              practice_id uuid,
              name text,
              slug text,
              status text,
              role text,
              min_notice_minutes int,
              cancellation_notice_hours int,
              timezone text,
              city text,
              province text
            )
            language plpgsql stable security definer set search_path = bb_testbrand
            as $$
            begin
              if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
              return query
              select p.id, p.name, p.slug, p.status, pm.role::text,
                     60::int, 24::int, 'Africa/Johannesburg'::text, 'TestBrand City'::text, 'Western Cape'::text
                from bb_testbrand.practices p
                join bb_testbrand.practice_members pm on pm.practice_id = p.id
               where pm.user_id = auth.uid();
            end $$;

            revoke execute on all functions in schema bb_testbrand from public;
            grant execute on function bb_testbrand.public_city_list() to anon, authenticated;
            grant execute on function bb_testbrand.practice_memberships_list() to authenticated;

            insert into bb_testbrand.practices (id, name, slug, status, accepting_queue) values
              ('00000000-0000-4000-8000-000000000103', 'Practice B2 (TestBrand)', 'practice-b2', 'active', true)
            on conflict (id) do nothing;

            insert into bb_testbrand.practice_members (practice_id, user_id, role) values
              ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000003', 'practice_owner')
            on conflict (practice_id, user_id) do nothing;

            insert into public.tenant_brands (id, slug, schema_name, display_name, status, support_email, from_email) values
              ('00000000-0000-4000-8000-000000000901', 'testbrand', 'bb_testbrand', 'TestBrand Health', 'active', 'support@testbrand.co.za', 'bookings@testbrand.co.za')
            on conflict (slug) do nothing;

            insert into public.tenant_brand_domains (brand_id, domain, is_primary, verified_at) values
              ('00000000-0000-4000-8000-000000000901', 'book.testbrand.co.za', true, now())
            on conflict (domain) do nothing;
            """;

        await ExecuteSqlScriptAsync(conn, testSetupSql);
    }

    private static async Task ExecuteSqlScriptAsync(NpgsqlConnection conn, string sql)
    {
        await using var cmd = new NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();

        if (_ownsCluster && _dataDir is not null && Directory.Exists(_dataDir))
        {
            try
            {
                var pgCtl = ResolvePostgresBinary("pg_ctl");
                await RunProcessAsync(pgCtl, $"-D \"{_dataDir}\" -m immediate -w stop");
            }
            catch
            {
                // Ignore stop errors during teardown.
            }

            try
            {
                Directory.Delete(_dataDir, recursive: true);
            }
            catch
            {
                // Ignore cleanup errors.
            }
        }
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir is not null)
        {
            if (Directory.Exists(Path.Combine(dir.FullName, "supabase", "migrations")))
            {
                return dir.FullName;
            }
            dir = dir.Parent;
        }
        throw new InvalidOperationException("Could not locate repository root containing supabase/migrations.");
    }

    private static string ResolvePostgresBinary(string name)
    {
        string[] candidates =
        [
            $"/opt/homebrew/bin/{name}",
            $"/opt/homebrew/opt/postgresql@18/bin/{name}",
            $"/opt/homebrew/opt/postgresql@17/bin/{name}",
            $"/usr/local/bin/{name}",
            $"/usr/bin/{name}"
        ];

        foreach (var candidate in candidates)
        {
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }

        return name;
    }

    private static int GetFreeTcpPort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    private static async Task RunProcessAsync(string fileName, string arguments)
    {
        var psi = new ProcessStartInfo
        {
            FileName = fileName,
            Arguments = arguments,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false
        };

        using var process = Process.Start(psi)
            ?? throw new InvalidOperationException($"Failed to start process: {fileName}");

        var stdout = await process.StandardOutput.ReadToEndAsync();
        var stderr = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"Command '{fileName} {arguments}' failed with exit code {process.ExitCode}.\nSTDOUT: {stdout}\nSTDERR: {stderr}");
        }
    }
}
