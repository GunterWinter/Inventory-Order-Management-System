namespace Application.Features.ProductSerialManager;

public sealed class StockCountNewSerialInput
{
    public string? InternalSerialNumber { get; init; }
    public string? ManufacturerSerialNumber { get; init; }
    public decimal? UnitCost { get; init; }
}
