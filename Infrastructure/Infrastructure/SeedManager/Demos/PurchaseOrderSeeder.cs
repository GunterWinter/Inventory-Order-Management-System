using System.Text.Json;
using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Application.Features.PurchaseOrderManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class PurchaseOrderSeeder
{
    private readonly PurchaseOrderService _service;
    private readonly ICommandRepository<PurchaseOrder> _orders;
    private readonly ICommandRepository<PurchaseOrderItem> _items;
    private readonly ICommandRepository<Vendor> _vendors;
    private readonly ICommandRepository<Tax> _taxes;
    private readonly ICommandRepository<Product> _products;
    private readonly ICommandRepository<Warehouse> _warehouses;
    private readonly NumberSequenceService _numbers;
    private readonly IUnitOfWork _unitOfWork;

    public PurchaseOrderSeeder(
        PurchaseOrderService service,
        ICommandRepository<PurchaseOrder> orders,
        ICommandRepository<PurchaseOrderItem> items,
        ICommandRepository<Vendor> vendors,
        ICommandRepository<Tax> taxes,
        ICommandRepository<Product> products,
        ICommandRepository<Warehouse> warehouses,
        NumberSequenceService numbers,
        IUnitOfWork unitOfWork)
    {
        _service = service;
        _orders = orders;
        _items = items;
        _vendors = vendors;
        _taxes = taxes;
        _products = products;
        _warehouses = warehouses;
        _numbers = numbers;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        if (await _orders.GetQuery().AnyAsync(x => !x.IsDeleted)) return;

        var vendors = await _vendors.GetQuery().Where(x => !x.IsDeleted).OrderBy(x => x.Name).ToListAsync();
        var tax = await _taxes.GetQuery().Where(x => !x.IsDeleted).OrderBy(x => x.Percentage).FirstOrDefaultAsync();
        var products = await _products.GetQuery().Where(x => !x.IsDeleted).ToDictionaryAsync(x => x.ReferenceCode!);
        var warehouse = await _warehouses.GetQuery().Where(x => !x.IsDeleted && x.SystemWarehouse != true)
            .OrderBy(x => x.Name == DemoSeedData.MainWarehouse ? 0 : 1).FirstOrDefaultAsync();
        if (vendors.Count == 0 || tax == null || warehouse == null) return;

        var definitions = new[]
        {
            new { Status = PurchaseOrderStatus.Confirmed, Vendor = 0, Description = "DEMO PO VẬT TƯ GIÁ VỐN THỰC TẾ", Lines = new[] { ("MAT-LED-001", 20m, 400_000m), ("ELEC-TV-001", 2m, 10_500_000m) } },
            new { Status = PurchaseOrderStatus.Confirmed, Vendor = 1, Description = "DEMO PO SERIAL NHÀ SẢN XUẤT", Lines = new[] { ("ELEC-WM-001", 2m, 7_200_000m), ("SM-CAM-001", 3m, 470_000m) } },
            new { Status = PurchaseOrderStatus.Confirmed, Vendor = 2, Description = "DEMO PO VÁN VÀ NỘI THẤT", Lines = new[] { ("MAT-MDF-001", 10m, 620_000m), ("FURN-CHR-001", 4m, 870_000m) } },
            new { Status = PurchaseOrderStatus.Draft, Vendor = 0, Description = "DEMO PO NHÁP", Lines = new[] { ("SM-SW-001", 2m, 230_000m) } }
        };

        for (var orderIndex = 0; orderIndex < definitions.Length; orderIndex++)
        {
            var definition = definitions[orderIndex];
            var order = new PurchaseOrder
            {
                Number = _numbers.GenerateNumber(nameof(PurchaseOrder), "", "PO"),
                OrderDate = DemoSeedData.BaseDate.AddDays(orderIndex),
                OrderStatus = definition.Status,
                VendorId = vendors[definition.Vendor % vendors.Count].Id,
                Description = definition.Description
            };
            await _orders.CreateAsync(order);

            foreach (var (reference, quantity, unitPrice) in definition.Lines)
            {
                if (!products.TryGetValue(reference, out var product)) continue;
                var total = quantity * unitPrice;
                var taxAmount = total * (tax.Percentage ?? 0m) / 100m;
                var manufacturerSerials = product.SerialTrackingMode == SerialTrackingMode.ManufacturerSerial
                    ? Enumerable.Range(1, Convert.ToInt32(quantity))
                        .Select(index => $"MFG-{reference}-{orderIndex + 1}-{index}").ToList()
                    : null;
                await _items.CreateAsync(new PurchaseOrderItem
                {
                    PurchaseOrderId = order.Id,
                    ProductId = product.Id,
                    WarehouseId = product.Physical == true ? warehouse.Id : null,
                    SupplierWarrantyMonths = product.Physical == true ? product.DefaultWarrantyMonths ?? 0 : 0,
                    Summary = product.Name,
                    TaxId = tax.Id,
                    UnitPrice = unitPrice,
                    Quantity = quantity,
                    ManufacturerSerialNumbersJson = manufacturerSerials == null ? null : JsonSerializer.Serialize(manufacturerSerials),
                    Total = total,
                    TaxAmount = taxAmount,
                    AfterTaxAmount = total + taxAmount
                });
            }

            await _unitOfWork.SaveAsync();
            _service.Recalculate(order.Id);
            await _service.SynchronizeInventoryAsync(order.Id, "demo-seeder");
            if (order.OrderStatus == PurchaseOrderStatus.Confirmed)
                await _service.EnsureVendorObligationAsync(order.Id, "demo-seeder");
        }
    }
}
