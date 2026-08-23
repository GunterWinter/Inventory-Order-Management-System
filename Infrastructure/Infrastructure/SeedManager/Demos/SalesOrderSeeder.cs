using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Application.Features.SalesOrderManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class SalesOrderSeeder
{
    private readonly SalesOrderService _service;
    private readonly ICommandRepository<SalesOrder> _orders;
    private readonly ICommandRepository<SalesOrderItem> _items;
    private readonly ICommandRepository<Customer> _customers;
    private readonly ICommandRepository<Tax> _taxes;
    private readonly ICommandRepository<Product> _products;
    private readonly ICommandRepository<ProductSerial> _serials;
    private readonly NumberSequenceService _numbers;
    private readonly IUnitOfWork _unitOfWork;

    public SalesOrderSeeder(
        SalesOrderService service,
        ICommandRepository<SalesOrder> orders,
        ICommandRepository<SalesOrderItem> items,
        ICommandRepository<Customer> customers,
        ICommandRepository<Tax> taxes,
        ICommandRepository<Product> products,
        ICommandRepository<Warehouse> warehouses,
        ICommandRepository<InventoryTransaction> inventoryTransactions,
        NumberSequenceService numbers,
        IUnitOfWork unitOfWork,
        ICommandRepository<ProductSerial> serials)
    {
        _service = service;
        _orders = orders;
        _items = items;
        _customers = customers;
        _taxes = taxes;
        _products = products;
        _serials = serials;
        _numbers = numbers;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        if (await _orders.GetQuery().AnyAsync(x => !x.IsDeleted)) return;

        var customers = await _customers.GetQuery().Where(x => !x.IsDeleted).ToDictionaryAsync(x => x.Name!);
        var products = await _products.GetQuery().Where(x => !x.IsDeleted).ToDictionaryAsync(x => x.ReferenceCode!);
        var tax = await _taxes.GetQuery().Where(x => !x.IsDeleted).OrderBy(x => x.Percentage).FirstOrDefaultAsync();
        if (tax == null) return;

        await CreateOrderAsync(customers, products, tax, DemoSeedData.ProjectA, "SERVICE-DESK-001",
            1m, 2_000_000m, SalesOrderStatus.Confirmed, DemoSeedData.AccrualRevenueDescription, 4);
        await CreateOrderAsync(customers, products, tax, DemoSeedData.ProjectB, "MAT-LED-001",
            2m, 500_000m, SalesOrderStatus.Confirmed, DemoSeedData.PhysicalSaleDescription, 5);
        await CreateOrderAsync(customers, products, tax, DemoSeedData.CustomerShowroom, "ELEC-TV-001",
            1m, 12_500_000m, SalesOrderStatus.Confirmed, DemoSeedData.SerialSaleDescription, 6);
        await CreateOrderAsync(customers, products, tax, DemoSeedData.CustomerRetail, "SERVICE-VOUCHER-001",
            1m, 500_000m, SalesOrderStatus.Draft, "DEMO SO NHÁP", 7);
    }

    private async Task CreateOrderAsync(
        IReadOnlyDictionary<string, Customer> customers,
        IReadOnlyDictionary<string, Product> products,
        Tax tax,
        string customerName,
        string productReference,
        decimal quantity,
        decimal unitPrice,
        SalesOrderStatus status,
        string description,
        int dayOffset)
    {
        if (!customers.TryGetValue(customerName, out var customer)
            || !products.TryGetValue(productReference, out var product)) return;

        var order = new SalesOrder
        {
            Number = _numbers.GenerateNumber(nameof(SalesOrder), "", "SO"),
            OrderDate = DemoSeedData.BaseDate.AddDays(dayOffset),
            OrderStatus = status,
            CustomerId = customer.Id,
            Description = description
        };
        await _orders.CreateAsync(order);
        var total = quantity * unitPrice;
        var taxAmount = total * (tax.Percentage ?? 0m) / 100m;
        var item = new SalesOrderItem
        {
            SalesOrderId = order.Id,
            ProductId = product.Id,
            WarehouseId = product.Physical == true ? product.DefaultWarehouseId : null,
            Summary = product.Name,
            TaxId = tax.Id,
            WarrantyMonths = product.Physical == true ? product.DefaultWarrantyMonths ?? 0 : 0,
            UnitPrice = unitPrice,
            Quantity = quantity,
            Total = total,
            TaxAmount = taxAmount,
            AfterTaxAmount = total + taxAmount
        };
        await _items.CreateAsync(item);
        await _unitOfWork.SaveAsync();

        if (status == SalesOrderStatus.Confirmed && product.Physical == true
            && product.SerialTrackingMode != SerialTrackingMode.None)
        {
            var selected = await _serials.GetQuery()
                .Where(x => !x.IsDeleted && x.ProductId == product.Id
                    && x.CurrentWarehouseId == product.DefaultWarehouseId
                    && x.Status == ProductSerialStatus.InStock)
                .OrderBy(x => x.CreatedAtUtc)
                .Take(Convert.ToInt32(quantity))
                .ToListAsync();
            if (selected.Count != Convert.ToInt32(quantity))
                throw new InvalidOperationException($"Dữ liệu demo thiếu serial tồn kho cho {product.Name}.");
            foreach (var serial in selected)
            {
                serial.SalesOrderItemId = item.Id;
                serial.UpdatedById = "demo-seeder";
                _serials.Update(serial);
            }
            await _unitOfWork.SaveAsync();
        }

        _service.Recalculate(order.Id);
        await _service.SynchronizeInventoryAsync(order.Id, "demo-seeder");
    }
}
