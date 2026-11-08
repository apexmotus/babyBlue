using BabyBlue.Api.Middleware;
using BabyBlue.Api.Network;
using Microsoft.AspNetCore.Http;
using Npgsql;
using Xunit;

namespace BabyBlue.Api.Tests;

public sealed class Phase1MiddlewareUnitTests
{
    [Theory]
    [InlineData("queue_closed", "P0002", 409, "queue_closed")]
    [InlineData("user_not_found", "P0002", 409, "user_not_found")]
    [InlineData("not_found", "P0002", 404, "not_found")]
    [InlineData("service_in_use", "23503", 409, "service_in_use")]
    [InlineData("last_practitioner", "23503", 409, "last_practitioner")]
    [InlineData("overlapping_availability", "23P01", 409, "overlapping_availability")]
    [InlineData("slot_unavailable", "23P01", 409, "slot_unavailable")]
    [InlineData("too_many_holds", "54000", 429, "too_many_holds")]
    [InlineData("asset_too_large", "22023", 413, "asset_too_large")]
    [InlineData("invalid_range", "22023", 400, "invalid_range")]
    public void Classify_Prioritizes_MessageText_Over_NonUnique_SqlState(
        string messageText,
        string sqlState,
        int expectedStatus,
        string expectedCode)
    {
        var pg = new PostgresException(
            messageText: messageText,
            severity: "ERROR",
            invariantSeverity: "ERROR",
            sqlState: sqlState);

        var (status, code, detail) = ProblemDetailsExceptionHandler.Classify(pg);

        Assert.Equal(expectedStatus, status);
        Assert.Equal(expectedCode, code);
        Assert.Null(detail);
    }

    [Fact]
    public void Classify_Extracts_MetricKey_Detail_From_MetricUnknown_Prefix()
    {
        var pg = new PostgresException(
            messageText: "metric_unknown: conversion_rate_v99",
            severity: "ERROR",
            invariantSeverity: "ERROR",
            sqlState: "23503");

        var (status, code, detail) = ProblemDetailsExceptionHandler.Classify(pg);

        Assert.Equal(400, status);
        Assert.Equal("metric_unknown", code);
        Assert.Equal("conversion_rate_v99", detail);
    }

    [Theory]
    [InlineData("no_double_booking", "23P01", 409, "slot_unavailable")]
    [InlineData("no_overlapping_holds", "23P01", 409, "slot_unavailable")]
    [InlineData("profiles_phone_international", "23514", 400, "profiles_phone_international")]
    public void Classify_Uses_ConstraintName_In_Step2(
        string constraintName,
        string sqlState,
        int expectedStatus,
        string expectedCode)
    {
        var pg = new PostgresException(
            messageText: "check or exclusion violation",
            severity: "ERROR",
            invariantSeverity: "ERROR",
            sqlState: sqlState,
            constraintName: constraintName);

        var (status, code, _) = ProblemDetailsExceptionHandler.Classify(pg);

        Assert.Equal(expectedStatus, status);
        Assert.Equal(expectedCode, code);
    }

    [Theory]
    [InlineData("22023", 400, "invalid_input")]
    [InlineData("23P01", 409, "slot_unavailable")]
    [InlineData("23505", 409, "conflict")]
    [InlineData("23503", 409, "conflict")]
    [InlineData("42501", 403, "forbidden")]
    [InlineData("28000", 401, "not_authenticated")]
    [InlineData("P0002", 404, "not_found")]
    [InlineData("23514", 400, "invalid_input")]
    [InlineData("57014", 504, "statement_timeout")]
    [InlineData("54000", 429, "too_many_holds")]
    [InlineData("53300", 503, "too_many_connections")]
    [InlineData("XX000", 500, "internal_error")]
    public void Classify_Falls_Back_To_SqlState_In_Step3(
        string sqlState,
        int expectedStatus,
        string expectedCode)
    {
        var pg = new PostgresException(
            messageText: "unmapped database error",
            severity: "ERROR",
            invariantSeverity: "ERROR",
            sqlState: sqlState);

        var (status, code, _) = ProblemDetailsExceptionHandler.Classify(pg);

        Assert.Equal(expectedStatus, status);
        Assert.Equal(expectedCode, code);
    }

    [Fact]
    public async Task CorrelationIdMiddleware_Accepts_Valid_Header_And_Replaces_Invalid_Header()
    {
        var mw = new CorrelationIdMiddleware(_ => Task.CompletedTask);

        var validCtx = new DefaultHttpContext();
        validCtx.Request.Headers["X-Request-Id"] = "req_123-ABC";
        await mw.InvokeAsync(validCtx);
        Assert.Equal("req_123-ABC", validCtx.TraceIdentifier);
        Assert.Equal("req_123-ABC", validCtx.Response.Headers["X-Request-Id"].ToString());

        var invalidCtx = new DefaultHttpContext();
        invalidCtx.Request.Headers["X-Request-Id"] = "bad header with spaces &crlf\r\n";
        await mw.InvokeAsync(invalidCtx);
        Assert.NotEqual("bad header with spaces &crlf\r\n", invalidCtx.TraceIdentifier);
        Assert.Equal(32, invalidCtx.TraceIdentifier.Length);
    }

    [Fact]
    public void BrandResolutionMiddleware_Resolves_TenantHost_Origin_And_RequestHost()
    {
        var ctx1 = new DefaultHttpContext();
        ctx1.Request.Host = new HostString("api.babyblue.co.za");
        ctx1.Request.Headers["X-Tenant-Host"] = "Book.TestBrand.co.za:443";
        Assert.Equal("book.testbrand.co.za", BrandResolutionMiddleware.ResolveEffectiveHost(ctx1));

        var ctx2 = new DefaultHttpContext();
        ctx2.Request.Host = new HostString("api.babyblue.co.za");
        ctx2.Request.Headers["Origin"] = "https://book.testbrand.co.za";
        Assert.Equal("book.testbrand.co.za", BrandResolutionMiddleware.ResolveEffectiveHost(ctx2));

        var ctx3 = new DefaultHttpContext();
        ctx3.Request.Host = new HostString("babyblue.co.za");
        Assert.Equal("babyblue.co.za", BrandResolutionMiddleware.ResolveEffectiveHost(ctx3));
    }

    [Fact]
    public void BrandResolutionMiddleware_Ignores_TenantHost_On_A_PerBrand_Host()
    {
        // F-07: the header is for the shared-API case only. A request that arrived at a brand's
        // own host already names its brand, so a header must not reselect it.
        var ctx = new DefaultHttpContext();
        ctx.Request.Host = new HostString("book.smilegroup.co.za");
        ctx.Request.Headers["X-Tenant-Host"] = "book.testbrand.co.za";
        ctx.Request.Headers["Origin"] = "https://book.testbrand.co.za";

        Assert.Equal("book.smilegroup.co.za", BrandResolutionMiddleware.ResolveEffectiveHost(ctx));
    }

    [Fact]
    public void BrandResolutionMiddleware_Honours_Configured_PlatformApiHosts_Over_The_Api_Prefix()
    {
        var network = new NetworkOptions { PlatformApiHosts = ["gateway.babyblue.co.za"] };

        // Configured platform host: the header is consulted.
        var platform = new DefaultHttpContext();
        platform.Request.Host = new HostString("gateway.babyblue.co.za");
        platform.Request.Headers["X-Tenant-Host"] = "book.testbrand.co.za";
        Assert.Equal(
            "book.testbrand.co.za",
            BrandResolutionMiddleware.ResolveEffectiveHost(platform, network));

        // Once the list is explicit, the `api.` convention no longer grants the exception.
        var apiPrefixed = new DefaultHttpContext();
        apiPrefixed.Request.Host = new HostString("api.babyblue.co.za");
        apiPrefixed.Request.Headers["X-Tenant-Host"] = "book.testbrand.co.za";
        Assert.Equal(
            "api.babyblue.co.za",
            BrandResolutionMiddleware.ResolveEffectiveHost(apiPrefixed, network));
    }

    [Fact]
    public void BrandResolutionMiddleware_Rejects_A_Malformed_TenantHost_Without_Falling_Back()
    {
        var ctx = new DefaultHttpContext();
        ctx.Request.Host = new HostString("api.babyblue.co.za");
        ctx.Request.Headers["X-Tenant-Host"] = "not a host!!";

        Assert.Equal(string.Empty, BrandResolutionMiddleware.ResolveEffectiveHost(ctx));
    }
}
