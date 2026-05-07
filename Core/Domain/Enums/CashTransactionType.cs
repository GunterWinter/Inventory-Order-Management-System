using System.ComponentModel;

namespace Domain.Enums;

public enum CashTransactionType
{
    [Description("Debit")]
    Debit = 0,
    [Description("Credit")]
    Credit = 1
}
