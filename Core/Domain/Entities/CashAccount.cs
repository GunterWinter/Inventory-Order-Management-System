using Domain.Common;
using Domain.Enums;

namespace Domain.Entities;

public class CashAccount : BaseEntity
{
    public string? Name { get; set; }
    public string? Number { get; set; }
    public CashAccountType? AccountType { get; set; }
    public string? Description { get; set; }
    public decimal? InitialBalance { get; set; } = 0;
    public decimal? CurrentBalance { get; set; } = 0;
}
