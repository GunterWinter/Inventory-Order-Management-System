using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Text.Json;

namespace Infrastructure.SecurityManager.Tokens;

public static class DI
{
    private const string DemoJwtKey = "demo-only-jwt-key-change-before-production-2026";

    public static IServiceCollection RegisterToken(this IServiceCollection services, IConfiguration configuration)
    {
        var jwtSectionName = "Jwt";
        var configuredSettings = configuration.GetSection(jwtSectionName).Get<TokenSettings>() ?? new TokenSettings();
        var isDemoVersion = configuration.GetValue<bool>("IsDemoVersion");
        var signingKey = configuredSettings.Key?.Trim();

        if (string.IsNullOrWhiteSpace(signingKey) && isDemoVersion)
        {
            signingKey = DemoJwtKey;
        }

        if (string.IsNullOrWhiteSpace(signingKey))
        {
            throw new InvalidOperationException(
                "JWT signing key is required outside demo mode. Configure Jwt__Key with an environment variable or user secret.");
        }

        if (signingKey.Length < 32)
        {
            throw new InvalidOperationException("JWT signing key must contain at least 32 characters.");
        }

        var tokenSettings = new TokenSettings
        {
            Key = signingKey,
            Issuer = configuredSettings.Issuer,
            Audience = configuredSettings.Audience,
            ExpireInMinute = configuredSettings.ExpireInMinute,
            ClockSkewInMinute = configuredSettings.ClockSkewInMinute
        };

        services.Configure<TokenSettings>(options =>
        {
            options.Key = tokenSettings.Key;
            options.Issuer = tokenSettings.Issuer;
            options.Audience = tokenSettings.Audience;
            options.ExpireInMinute = tokenSettings.ExpireInMinute;
            options.ClockSkewInMinute = tokenSettings.ClockSkewInMinute;
        });

        services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
            options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
        })
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.FromMinutes(tokenSettings.ClockSkewInMinute),
                ValidIssuer = tokenSettings.Issuer,
                ValidAudience = tokenSettings.Audience,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(tokenSettings.Key))
            };

            options.Events = new JwtBearerEvents
            {
                // Prioritizing HttpOnly cookie before checking Authorization header
                OnMessageReceived = context =>
                {
                    var accessToken = context.HttpContext.Request.Cookies["accessToken"];
                    if (!string.IsNullOrEmpty(accessToken))
                    {
                        context.Token = accessToken;
                    }
                    else
                    {
                        var authorizationHeader = context.Request.Headers["Authorization"].FirstOrDefault();
                        if (!string.IsNullOrEmpty(authorizationHeader) && authorizationHeader.StartsWith("Bearer "))
                        {
                            context.Token = authorizationHeader.Substring("Bearer ".Length).Trim();
                        }
                    }

                    return Task.CompletedTask;
                },

                // Custom handling for expired tokens
                OnChallenge = context =>
                {
                    if (context.AuthenticateFailure is SecurityTokenExpiredException)
                    {
                        context.HandleResponse();
                        context.Response.StatusCode = 498; // Custom status code for expired token
                        context.Response.ContentType = "application/json";

                        var result = JsonSerializer.Serialize(new
                        {
                            code = 498,
                            message = "Token has expired.",
                            error = new
                            {
                                @ref = "https://datatracker.ietf.org/doc/html/rfc9110",
                                exceptionType = "SecurityTokenExpiredException",
                                innerException = "SecurityTokenExpiredException",
                                source = "",
                                stackTrace = ""
                            }
                        });

                        return context.Response.WriteAsync(result);
                    }

                    return Task.CompletedTask;
                }



            };

        });

        services.AddTransient<ITokenService, TokenService>();
        services.AddScoped<TokenSettings>();

        return services;
    }
}

