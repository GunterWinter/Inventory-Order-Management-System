namespace Infrastructure.SecurityManager.Tokens;

public class TokenSettings
{
    public string Key { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int ExpireInMinute { get; set; }
    public double ClockSkewInMinute { get; set; }
}
