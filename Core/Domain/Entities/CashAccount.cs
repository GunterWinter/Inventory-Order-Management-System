using Domain.Common;
using Domain.Enums;

namespace Domain.Entities;

public class CashAccount : BaseEntity
{
    public string? Name { get; set; }
    public string? Number { get; set; }
    public CashAccountType? AccountType { get; set; }
    public string? Description { get; set; }
    public double? InitialBalance { get; set; } = 0;
    public double? CashOnHand { get; set; }
    public double? CurrentBalance { get; set; } = 0;
}
