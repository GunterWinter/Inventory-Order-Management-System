using Domain.Common;

namespace Domain.Entities;

public class PurchaseOrderItem : BaseEntity
{
    public string? PurchaseOrderId { get; set; }
    public PurchaseOrder? PurchaseOrder { get; set; }
    public string? ProductId { get; set; }
    public Product? Product { get; set; }
    public string? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public string? ManufacturerSerialNumbersJson { get; set; }
    public int? SupplierWarrantyMonths { get; set; }
    public string? Summary { get; set; }
    public string? TaxId { get; set; }
    public Tax? Tax { get; set; }
    public decimal? UnitPrice { get; set; } = 0;
    public decimal? Quantity { get; set; } = 1;
    public decimal? Total { get; set; } = 0;
    public decimal? TaxAmount { get; set; } = 0;
    public decimal? AfterTaxAmount { get; set; } = 0;
    public decimal? AllocatedQuantity { get; set; } = 0;
    public ICollection<PurchaseOrderCostAllocation> CostAllocations { get; set; } = new List<PurchaseOrderCostAllocation>();
    public decimal RemainingQuantity => Math.Max(0m, (Quantity ?? 0m) - (AllocatedQuantity ?? 0m));
}
