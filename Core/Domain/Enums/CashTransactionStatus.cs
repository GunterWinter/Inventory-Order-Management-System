using System.ComponentModel;

namespace Domain.Enums;

public enum CashTransactionStatus
{
    [Description("Chưa thanh toán")]
    Unpaid = 0,
    [Description("Còn nợ")]
    PartiallyPaid = 1,
    [Description("Đã thanh toán")]
    Paid = 2
}
