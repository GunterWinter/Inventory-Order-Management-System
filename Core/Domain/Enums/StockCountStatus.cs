using System.ComponentModel;

namespace Domain.Enums;

public enum StockCountStatus
{
    [Description("Nháp")]
    Draft = 0,
    [Description("Đã hủy")]
    Cancelled = 1,
    [Description("Đã xác nhận")]
    Confirmed = 2,
    [Description("Đã lưu trữ")]
    Archived = 3
}
