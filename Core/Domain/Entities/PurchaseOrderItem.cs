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
    public string? BatchNumber { get; set; } 
    public int? SupplierWarrantyMonths { get; set; }
    public string? Summary { get; set; }
    public string? TaxId { get; set; }
    public Tax? Tax { get; set; }
    public double? UnitPrice { get; set; } = 0;
    public double? Quantity { get; set; } = 1;
    public double? Total { get; set; } = 0;
    public double? TaxAmount { get; set; } = 0;
    public double? AfterTaxAmount { get; set; } = 0;
}
