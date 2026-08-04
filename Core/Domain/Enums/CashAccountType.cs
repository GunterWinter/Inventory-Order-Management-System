using System.ComponentModel;

namespace Domain.Enums;

public enum CashAccountType
{
    [Description("Tiền mặt")]
    Cash = 0,
    [Description("Ngân hàng")]
    Bank = 1
}
