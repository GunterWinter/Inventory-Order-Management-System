using Domain.Common;
using Domain.Enums;

using System.ComponentModel.DataAnnotations.Schema;

namespace Domain.Entities;


public class InventoryTransaction : BaseEntity
{
    public string? ModuleId { get; set; }
    public string? ModuleName { get; set; }
    public string? ModuleCode { get; set; } 
    public string? ModuleNumber { get; set; }
    public DateTime? MovementDate { get; set; }
    public InventoryTransactionStatus? Status { get; set; }
    public string? Number { get; set; }
    public string? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public string? ProductId { get; set; }
    public string? ModuleItemId { get; set; }
    public Product? Product { get; set; }
    public decimal? Movement { get; set; }
    public InventoryTransType? TransType { get; set; }
    public decimal? Stock { get; set; }
    public string? WarehouseFromId { get; set; }
    public Warehouse? WarehouseFrom { get; set; }
    public string? WarehouseToId { get; set; }
    public Warehouse? WarehouseTo { get; set; }
    public decimal? QtySCSys { get; set; }
    public decimal? QtySCCount { get; set; }
    public decimal? QtySCDelta { get; set; }
    public decimal? UnitCost { get; set; }
    [NotMapped]
    public List<string>? ProductSerialIds { get; set; }
    [NotMapped]
    public string? ProductSerialNumbers { get; set; }
    [NotMapped]
    public List<MaterialExportItem> CostAllocations { get; set; } = [];

}
