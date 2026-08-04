using System.ComponentModel;

namespace Domain.Enums;

public enum CashTransactionType
{
    [Description("Thu")]
    Debit = 0,
    [Description("Chi")]
    Credit = 1
}
