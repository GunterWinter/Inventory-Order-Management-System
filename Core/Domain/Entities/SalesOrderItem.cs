using Domain.Common;
using System.Collections.Generic;

namespace Domain.Entities;

public class SalesOrderItem : BaseEntity
{
    public string? SalesOrderId { get; set; }
    public SalesOrder? SalesOrder { get; set; }
    public string? ProductId { get; set; }
    public Product? Product { get; set; }
    public string? WarehouseId { get; set; }
    public Warehouse? Warehouse { get; set; }
    public int? WarrantyMonths { get; set; }
    public decimal? CogsAmount { get; set; }   // tổng giá vốn thực xuất
    public decimal? ProfitAmount { get; set; } // tổng lãi
    public string? Summary { get; set; }
    public string? TaxId { get; set; }
    public Tax? Tax { get; set; }
    public decimal? UnitPrice { get; set; } = 0;
    public decimal? Quantity { get; set; } = 1;
    public decimal? Total { get; set; } = 0;
    public decimal? TaxAmount { get; set; } = 0;
    public decimal? AfterTaxAmount { get; set; } = 0;
    public ICollection<ProductSerial> ProductSerials { get; set; } = new List<ProductSerial>();

}
