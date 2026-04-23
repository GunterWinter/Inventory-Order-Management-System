using System.Runtime.InteropServices;

namespace Domain.Common;

public static class AppDateTime
{
    private static readonly Lazy<TimeZoneInfo> _vietnamTimeZone = new(ResolveVietnamTimeZone);

    public static DateTime VietnamNow()
    {
        return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, _vietnamTimeZone.Value);
    }

    private static TimeZoneInfo ResolveVietnamTimeZone()
    {
        var timeZoneIds = RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
            ? new[] { "SE Asia Standard Time", "Asia/Ho_Chi_Minh" }
            : new[] { "Asia/Ho_Chi_Minh", "SE Asia Standard Time" };

        foreach (var timeZoneId in timeZoneIds)
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(timeZoneId);
            }
            catch (TimeZoneNotFoundException)
            {
            }
            catch (InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.Local;
    }
}
