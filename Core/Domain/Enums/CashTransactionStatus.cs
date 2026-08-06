using System.ComponentModel;

namespace Domain.Enums;

public enum CashTransactionStatus
{
    [Description("Unpaid")]
    Unpaid = 0,
    [Description("Partially Paid")]
    PartiallyPaid = 1,
    [Description("Paid")]
    Paid = 2
}
