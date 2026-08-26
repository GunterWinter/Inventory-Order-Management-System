namespace Application.Features.InventoryTransactionManager;

public sealed class ReturnSourceLineDto
{
    public string? SourceItemId { get; init; }
    public string? ReturnLineId { get; init; }
    public string? ProductId { get; init; }
    public string? ProductName { get; init; }
    public string? ProductReferenceCode { get; init; }
    public string? WarehouseId { get; init; }
    public string? WarehouseName { get; init; }
    public bool Physical { get; init; }
    public int SerialTrackingMode { get; init; }
    public decimal SourceQuantity { get; init; }
    public decimal PreviouslyReturnedQuantity { get; init; }
    public decimal CurrentReturnQuantity { get; init; }
    public decimal? WarehouseStock { get; init; }
    public decimal AvailableReturnQuantity { get; init; }
    public List<string> ProductSerialIds { get; init; } = [];
    public string ProductSerialNumbers { get; init; } = string.Empty;
}
