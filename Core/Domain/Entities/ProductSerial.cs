using Domain.Common;
using Domain.Enums;

namespace Domain.Entities;

public class ProductSerial : BaseEntity
{
    public string? ProductId { get; set; }
    public Product? Product { get; set; }
    public string? InternalSerialNumber { get; set; }
    public string? ManufacturerSerialNumber { get; set; }
    public ProductSerialStatus? Status { get; set; } = ProductSerialStatus.Pending;
    public string? CurrentWarehouseId { get; set; }
    public Warehouse? CurrentWarehouse { get; set; }
    public string? BatchNumber { get; set; }
    public string? PurchaseOrderItemId { get; set; }
    public PurchaseOrderItem? PurchaseOrderItem { get; set; }
    public string? SalesOrderItemId { get; set; }
    public SalesOrderItem? SalesOrderItem { get; set; }
    public DateTime? SupplierWarrantyEndDate { get; set; }
    public DateTime? CustomerWarrantyEndDate { get; set; }
    public double? UnitCost { get; set; }
    public string? CostAllocationId { get; set; }
    public PurchaseOrderCostAllocation? CostAllocation { get; set; }
    public ICollection<ProductSerialMovement> ProductSerialMovementList { get; set; } = new List<ProductSerialMovement>();
}
