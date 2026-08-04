using System.ComponentModel;

namespace Domain.Enums;

public enum SalesType
{
    [Description("Bán lẻ")]
    Retail = 1,
    [Description("Xuất nội bộ")]
    Internal = 2
}
