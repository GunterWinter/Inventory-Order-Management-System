using Domain.Common;

namespace Domain.Entities;

public class MaterialExportItem : BaseEntity
{
    public string? MaterialExportId { get; set; }
    public MaterialExport? MaterialExport { get; set; }
    
    public string? PurchaseOrderItemId { get; set; }
    public PurchaseOrderItem? PurchaseOrderItem { get; set; }
    
    public string? ProductId { get; set; }
    public Product? Product { get; set; }
    
    public string? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    
    public decimal? Quantity { get; set; } = 0;
    public decimal? UnitPrice { get; set; } = 0;
    public decimal? Total { get; set; } = 0;
}
