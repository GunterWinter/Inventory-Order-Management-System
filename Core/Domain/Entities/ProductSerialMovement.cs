using Domain.Common;
using Domain.Enums;

namespace Domain.Entities;

public class ProductSerialMovement : BaseEntity
{
    public string? ProductSerialId { get; set; }
    public ProductSerial? ProductSerial { get; set; }
    public string? InventoryTransactionId { get; set; }
    public InventoryTransaction? InventoryTransaction { get; set; }
    public string? ModuleName { get; set; }
    public string? ModuleId { get; set; }
    public string? ModuleItemId { get; set; }
    public string? FromWarehouseId { get; set; }
    public Warehouse? FromWarehouse { get; set; }
    public string? ToWarehouseId { get; set; }
    public Warehouse? ToWarehouse { get; set; }
    public DateTime? MovementDate { get; set; }
    public ProductSerialStatus? Status { get; set; }
    public ProductSerialStatus? PreviousStatus { get; set; }
    public string? PreviousWarehouseId { get; set; }
    public string? PreviousSalesOrderItemId { get; set; }
    public DateTime? PreviousCustomerWarrantyEndDate { get; set; }
    public string? PreviousCostAllocationId { get; set; }
    public DateTime? ReversedAtUtc { get; set; }
    public string? ReversedById { get; set; }
}
