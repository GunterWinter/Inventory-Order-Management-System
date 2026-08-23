using Domain.Common;

namespace Domain.Entities;

public class CashTransactionPayment : BaseEntity
{
    public string CashTransactionId { get; set; } = null!;
    public CashTransaction? CashTransaction { get; set; }
    public string? CashAccountId { get; set; }
    public CashAccount? CashAccount { get; set; }
    public DateTime PaymentDate { get; set; }
    public decimal Amount { get; set; }
    public string? Description { get; set; }
}
