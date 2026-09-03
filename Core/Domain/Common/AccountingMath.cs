namespace Domain.Common;

public static class AccountingMath
{
    public static decimal RoundMoney(decimal value)
        => decimal.Round(value, 6, MidpointRounding.AwayFromZero);

    public static decimal RoundVnd(decimal value)
        => RoundMoney(value);
}
