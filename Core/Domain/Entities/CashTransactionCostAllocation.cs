using Domain.Common;

namespace Domain.Entities;

/// <summary>Allocates a manual vendor cash transaction cost to a customer/project.</summary>
public class CashTransactionCostAllocation : BaseEntity
{
    public string? CashTransactionId { get; set; }
    public CashTransaction? CashTransaction { get; set; }
    public string? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public double Amount { get; set; }
    public string? Description { get; set; }
}
