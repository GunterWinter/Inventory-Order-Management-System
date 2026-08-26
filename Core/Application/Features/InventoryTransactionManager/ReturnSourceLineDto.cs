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
    public List<ReturnCostLayerDto> CostLayers { get; init; } = [];
}

public sealed class ReturnCostLayerDto
{
    public string? SourceCostAllocationId { get; init; }
    public string? SourceInventoryTransactionId { get; init; }
    public string? SourceModule { get; init; }
    public string? SourceNumber { get; init; }
    public DateTime? SourceDate { get; init; }
    public string? ProductSerialId { get; init; }
    public string? ProductSerialNumber { get; init; }
    public decimal SoldQuantity { get; init; }
    public decimal PreviouslyReturnedQuantity { get; init; }
    public decimal CurrentReturnQuantity { get; init; }
    public decimal AvailableReturnQuantity { get; init; }
    public decimal UnitCost { get; init; }
    public decimal TotalCost { get; init; }
}

public sealed class ReturnCostLayerSelectionDto
{
    public string? SourceCostAllocationId { get; init; }
    public decimal Quantity { get; init; }
}
