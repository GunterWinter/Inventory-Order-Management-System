namespace Infrastructure.SeedManager.Demos;

internal static class DemoSeedData
{
    public const string ProjectA = "Công trình A - Riverside";
    public const string ProjectB = "Công trình B - Ánh Dương";
    public const string CustomerShowroom = "Showroom Nội thất Mộc Gia";
    public const string CustomerRetail = "Khách lẻ Demo";

    public const string ContractorVendor = "Anh Lân - Công thợ và gia công";
    public const string ElectricalVendor = "Công ty Thiết bị Điện Nam Á";
    public const string FurnitureVendor = "Công ty Nội thất Mộc Việt";

    public const string MainWarehouse = "Kho Chính";
    public const string ProjectWarehouse = "Kho Công Trình";
    public const string WarrantyWarehouse = "Kho Bảo Hành";

    public const string AccrualRevenueDescription = "DEMO ACCRUAL PROJECT 2000000";
    public const string PhysicalSaleDescription = "DEMO PHYSICAL SALE";
    public const string SerialSaleDescription = "DEMO SERIAL SALE";
    public const string ProjectCostPrefix = "DEMO PROJECT COST";
    public const string MaterialExportPrefix = "DEMO PHÂN BỔ CÔNG TRÌNH";
    public const string CashPrefix = "DEMO THU CHI";

    public static DateTime BaseDate => DateTime.Today.AddDays(-30).Date;
}
