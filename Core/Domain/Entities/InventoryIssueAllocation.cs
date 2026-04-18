using Domain.Common;
using Domain.Entities;

public class InventoryIssueAllocation : BaseEntity
{
    public string? InventoryTransactionId { get; set; }
    public InventoryTransaction? InventoryTransaction { get; set; }

    public string? ModuleItemId { get; set; }

    public string? SalesOrderItemId { get; set; }
    public SalesOrderItem? SalesOrderItem { get; set; }

    public string? CostLayerId { get; set; }
    public InventoryCostLayer? CostLayer { get; set; }

    public string? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }

    public string? ProductId { get; set; }
    public Product? Product { get; set; }

    public string? BatchNumber { get; set; }

    public decimal? QtyIssued { get; set; }
    public decimal? UnitCost { get; set; }
    public decimal? SalesUnitPrice { get; set; }

    public decimal? CostAmount { get; set; }
    public decimal? SalesAmount { get; set; }
    public decimal? ProfitAmount { get; set; }

    public DateTime? AllocationDate { get; set; }
}