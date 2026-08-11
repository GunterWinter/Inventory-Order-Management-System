using Domain.Common;

namespace Domain.Entities;

/// <summary>
/// Analytically splits a manual cash transaction across customers/projects.
/// Receipt allocations are informational; only expense allocations are project costs.
/// </summary>
public class CashTransactionCostAllocation : BaseEntity
{
    public string? CashTransactionId { get; set; }
    public CashTransaction? CashTransaction { get; set; }
    public string? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public double Amount { get; set; }
    public string? Description { get; set; }
}
