namespace Application.Features.DashboardManager.Queries;

public class CardsItem
{
    public decimal? SalesTotal { get; init; }
    public decimal? SalesReturnTotal { get; init; }
    public decimal? PurchaseTotal { get; init; }
    public decimal? PurchaseReturnTotal { get; init; }
    public decimal? TransferOutTotal { get; init; }
    public decimal? TransferInTotal { get; init; }
    public decimal ConfirmedSalesAmount { get; init; }
    public decimal ConfirmedPurchaseAmount { get; init; }
    public decimal CashBalance { get; init; }
    public decimal CustomerReceivable { get; init; }
    public decimal CustomerCredit { get; init; }
    public decimal VendorDebt { get; init; }
    public decimal VendorCredit { get; init; }
    public decimal InventoryQuantity { get; init; }
    public int MaterialExportCount { get; init; }
}
