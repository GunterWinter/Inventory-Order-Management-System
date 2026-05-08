using System.ComponentModel;

namespace Domain.Enums;

public enum SerialTrackingMode
{
    [Description("None")]
    None = 0,
    [Description("Internal Auto")]
    InternalAuto = 1,
    [Description("Manufacturer Serial")]
    ManufacturerSerial = 2
}
