using Domain.Common;
using Domain.Enums;

namespace Domain.Entities;

public class CashTransaction : BaseEntity
{
    public string? Number { get; set; }
    public DateTime? TransactionDate { get; set; }
    public CashTransactionType? TransactionType { get; set; }
    public CashTransactionStatus? Status { get; set; }
    public double? Amount { get; set; }
    public string? Description { get; set; }
    public string? CashAccountId { get; set; }
    public CashAccount? CashAccount { get; set; }
    public string? CashCategoryId { get; set; }
    public CashCategory? CashCategory { get; set; }
    public string? SourceModule { get; set; }
    public string? SourceModuleId { get; set; }
    public string? SourceModuleNumber { get; set; }
}
