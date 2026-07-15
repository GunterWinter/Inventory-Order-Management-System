using System.ComponentModel;

namespace Domain.Enums;

public enum CashAccountType
{
    [Description("Cash")]
    Cash = 0,
    [Description("Bank")]
    Bank = 1
}
