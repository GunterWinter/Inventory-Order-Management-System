using Domain.Enums;
using Domain.Common;

namespace Domain.Entities;

public class MaterialExport : BaseEntity
{
    public string? Number { get; set; }
    public DateTime? ExportDate { get; set; }
    public MaterialExportStatus? Status { get; set; }
    public string? Description { get; set; }
    public string? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public string? CustomerId { get; set; }
    public Customer? Customer { get; set; }

    public ICollection<MaterialExportItem> MaterialExportItemList { get; set; } = new List<MaterialExportItem>();
}
