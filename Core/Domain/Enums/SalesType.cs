using System.ComponentModel;

namespace Domain.Enums;

public enum SalesType
{
    [Description("Retail")]
    Retail = 1,
    [Description("Internal")]
    Internal = 2
}
