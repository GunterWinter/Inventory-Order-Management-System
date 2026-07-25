using Domain.Common;

namespace Domain.Entities;

public class PurchaseOrderCostAllocation : BaseEntity
{
    public string? PurchaseOrderId { get; set; }
    public PurchaseOrder? PurchaseOrder { get; set; }
    
    public string? PurchaseOrderItemId { get; set; }
    public PurchaseOrderItem? PurchaseOrderItem { get; set; }
    
    public string? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    
    public double? Quantity { get; set; } = 0;
    public double? UnitPrice { get; set; } = 0;
    public double? Amount { get; set; } = 0;
}
