using Domain.Common;

namespace Domain.Entities;

public class SalesOrderItem : BaseEntity
{
    public string? SalesOrderId { get; set; }
    public SalesOrder? SalesOrder { get; set; }
    public string? ProductId { get; set; }
    public Product? Product { get; set; }
    public string? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public string? BatchNumber { get; set; }
    public int? WarrantyMonths { get; set; }
    public double? CogsAmount { get; set; }   // tổng giá vốn thực xuất
    public double? ProfitAmount { get; set; } // tổng lãi
    public string? Summary { get; set; }
    public string? TaxId { get; set; }
    public Tax? Tax { get; set; }
    public double? UnitPrice { get; set; } = 0;
    public double? Quantity { get; set; } = 1;
    public double? Total { get; set; } = 0;
    public double? TaxAmount { get; set; } = 0;
    public double? AfterTaxAmount { get; set; } = 0;

}
