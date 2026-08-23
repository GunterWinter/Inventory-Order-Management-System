using Domain.Common;
using Domain.Enums;

namespace Domain.Entities;

public class SalesOrder : BaseEntity
{
    public string? Number { get; set; }
    public DateTime? OrderDate { get; set; }
    public SalesOrderStatus? OrderStatus { get; set; }
    public string? Description { get; set; }
    public string? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public SalesType? SalesType { get; set; } = Domain.Enums.SalesType.Retail;
    public decimal? BeforeTaxAmount { get; set; }
    public decimal? TaxAmount { get; set; }
    public decimal? AfterTaxAmount { get; set; }
    public ICollection<SalesOrderItem> SalesOrderItemList { get; set; } = new List<SalesOrderItem>();
}
