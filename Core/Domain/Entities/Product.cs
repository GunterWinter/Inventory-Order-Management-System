using Domain.Common;

using Domain.Enums;

namespace Domain.Entities;

public class Product : BaseEntity
{
    public string? Name { get; set; }
    public string? Number { get; set; }
    public string? ReferenceCode { get; set; }
    public string? Description { get; set; }
    public double? UnitPrice { get; set; }
    public bool? Physical { get; set; } = true;
    public SerialTrackingMode? SerialTrackingMode { get; set; } = Domain.Enums.SerialTrackingMode.InternalAuto;
    public string? InternalSerialFixedCode { get; set; }
    public string? DefaultWarehouseId { get; set; }
    public Warehouse? DefaultWarehouse { get; set; }
    public int? DefaultWarrantyMonths { get; set; }
    public string? UnitMeasureId { get; set; }
    public UnitMeasure? UnitMeasure { get; set; }
    public string? ProductGroupId { get; set; }
    public ProductGroup? ProductGroup { get; set; }
}
