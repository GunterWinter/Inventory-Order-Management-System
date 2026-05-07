using System.ComponentModel;

namespace Domain.Enums;

public enum CashAccountType
{
    [Description("Personal")]
    Personal = 0,
    [Description("Company")]
    Company = 1
}
