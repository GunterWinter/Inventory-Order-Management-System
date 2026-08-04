using System.ComponentModel;

namespace Domain.Enums;

public enum InventoryTransType
{
    [Description("Nhập")]
    In = 1,
    [Description("Xuất")]
    Out = -1,
}
