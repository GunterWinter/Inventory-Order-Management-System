namespace Domain.Common;

public static class AccountingMath
{
    public static decimal RoundVnd(decimal value)
        => decimal.Round(value, 6, MidpointRounding.AwayFromZero);
}
