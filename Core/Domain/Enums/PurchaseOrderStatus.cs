using System.ComponentModel;

namespace Domain.Enums;

public enum PurchaseOrderStatus
{
    [Description("Nháp")]
    Draft = 0,
    [Description("Đã hủy")]
    Cancelled = 1,
    [Description("Đã xác nhận")]
    Confirmed = 2,
    [Description("Lưu trữ")]
    Archived = 3
}
