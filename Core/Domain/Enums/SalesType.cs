using System.ComponentModel;

namespace Domain.Enums;

public enum SalesType
{
    [Description("Retail")]
    Retail = 1,
    [Description("Internal Export")]
    Internal = 2
}
