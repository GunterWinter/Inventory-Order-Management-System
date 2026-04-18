using Domain.Common;
using Domain.Enums;

namespace Domain.Entities;


public class InventoryCostLayer : BaseEntity
{
    public string? InventoryTransactionId { get; set; }
    public InventoryTransaction? InventoryTransaction { get; set; }

    public string? ModuleItemId { get; set; }

    public string? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }

    public string? ProductId { get; set; }
    public Product? Product { get; set; }

    public string? BatchNumber { get; set; }
    public DateTime? ReceivedDate { get; set; }

    public decimal? UnitCost { get; set; }
    public decimal? OriginalQty { get; set; }
    public decimal? RemainingQty { get; set; }

    public int? LayerStatus { get; set; }
}
