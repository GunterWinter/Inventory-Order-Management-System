using Domain.Common;
using System.ComponentModel.DataAnnotations.Schema;

namespace Domain.Entities;

public class MaterialExportItem : BaseEntity
{
    // This existing, previously unused table is the inventory cost-allocation ledger.
    // The legacy name is kept to avoid a destructive table rename.
    public string? MaterialExportId { get; set; }
    public MaterialExport? MaterialExport { get; set; }

    public string? InventoryTransactionId { get; set; }
    public string? SourceInventoryTransactionId { get; set; }
    public string? SourceCostAllocationId { get; set; }
    public string? ProductSerialId { get; set; }
    public ProductSerial? ProductSerial { get; set; }
    
    public string? PurchaseOrderItemId { get; set; }
    public PurchaseOrderItem? PurchaseOrderItem { get; set; }
    
    public string? ProductId { get; set; }
    public Product? Product { get; set; }
    
    public string? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    
    public decimal? Quantity { get; set; } = 0;
    public decimal? UnitPrice { get; set; } = 0;
    public decimal? Total { get; set; } = 0;
    public string? CostSource { get; set; }
    [NotMapped]
    public string? SourceModule { get; set; }
    [NotMapped]
    public string? SourceNumber { get; set; }
    [NotMapped]
    public DateTime? SourceDate { get; set; }
    [NotMapped]
    public string? ProductSerialNumber { get; set; }
}
