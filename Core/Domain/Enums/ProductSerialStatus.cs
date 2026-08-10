using System.ComponentModel;

namespace Domain.Enums;

public enum ProductSerialStatus
{
    [Description("Pending")]
    Pending = 0,
    [Description("In Stock")]
    InStock = 1,
    [Description("Reserved")]
    Reserved = 2,
    [Description("Sold")]
    Sold = 3,
    [Description("In Transfer")]
    InTransfer = 4,
    [Description("Returned To Supplier")]
    ReturnedToSupplier = 5,
    [Description("Missing")]
    Missing = 6,
    [Description("Scrapped")]
    Scrapped = 7,
    [Description("Returned By Customer")]
    ReturnedByCustomer = 8,
    [Description("Exported")]
    Exported = 9,
    [Description("Voided")]
    Voided = 10
}
