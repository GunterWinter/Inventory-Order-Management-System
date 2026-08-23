using Domain.Common;

namespace Domain.Entities;

public class PurchaseOrderCostAllocation : BaseEntity
{
    public string? PurchaseOrderId { get; set; }
    public PurchaseOrder? PurchaseOrder { get; set; }
    
    public string? PurchaseOrderItemId { get; set; }
    public PurchaseOrderItem? PurchaseOrderItem { get; set; }

    /// <summary>Warehouse inherited from the purchase-order item; null is allowed for legacy allocations.</summary>
    public string? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    
    public string? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    
    public decimal? Quantity { get; set; } = 0;
    public decimal? UnitPrice { get; set; } = 0;
    public decimal? Amount { get; set; } = 0;
}
