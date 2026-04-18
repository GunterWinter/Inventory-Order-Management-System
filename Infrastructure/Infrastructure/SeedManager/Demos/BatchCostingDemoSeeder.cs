using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Application.Features.PurchaseOrderManager;
using Application.Features.SalesOrderManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class BatchCostingDemoSeeder
{
    private const string DemoPrefix = "DEMO BATCH COSTING";
    private const string DemoWarehouseName = "Kho Demo Batch Costing";
    private const string DemoVendorName = "Nha cung cap Demo Batch Costing";
    private const string DemoCustomerName = "Khach Demo Batch Costing";
    private const string DemoProductName = "San pham Demo Batch Costing";
    private const string DemoLot1Batch = "DEMO-LOT-A-900K";
    private const string DemoLot2Batch = "DEMO-LOT-B-1000K";

    private readonly PurchaseOrderService _purchaseOrderService;
    private readonly SalesOrderService _salesOrderService;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly IQueryContext _queryContext;

    private readonly ICommandRepository<PurchaseOrder> _purchaseOrderRepository;
    private readonly ICommandRepository<PurchaseOrderItem> _purchaseOrderItemRepository;
    private readonly ICommandRepository<GoodsReceive> _goodsReceiveRepository;
    private readonly ICommandRepository<SalesOrder> _salesOrderRepository;
    private readonly ICommandRepository<SalesOrderItem> _salesOrderItemRepository;
    private readonly ICommandRepository<DeliveryOrder> _deliveryOrderRepository;
    private readonly ICommandRepository<Vendor> _vendorRepository;
    private readonly ICommandRepository<Customer> _customerRepository;
    private readonly ICommandRepository<Tax> _taxRepository;
    private readonly ICommandRepository<Product> _productRepository;
    private readonly ICommandRepository<Warehouse> _warehouseRepository;

    private readonly IUnitOfWork _unitOfWork;

    public BatchCostingDemoSeeder(
        PurchaseOrderService purchaseOrderService,
        SalesOrderService salesOrderService,
        InventoryTransactionService inventoryTransactionService,
        NumberSequenceService numberSequenceService,
        IQueryContext queryContext,
        ICommandRepository<PurchaseOrder> purchaseOrderRepository,
        ICommandRepository<PurchaseOrderItem> purchaseOrderItemRepository,
        ICommandRepository<GoodsReceive> goodsReceiveRepository,
        ICommandRepository<SalesOrder> salesOrderRepository,
        ICommandRepository<SalesOrderItem> salesOrderItemRepository,
        ICommandRepository<DeliveryOrder> deliveryOrderRepository,
        ICommandRepository<Vendor> vendorRepository,
        ICommandRepository<Customer> customerRepository,
        ICommandRepository<Tax> taxRepository,
        ICommandRepository<Product> productRepository,
        ICommandRepository<Warehouse> warehouseRepository,
        IUnitOfWork unitOfWork
    )
    {
        _purchaseOrderService = purchaseOrderService;
        _salesOrderService = salesOrderService;
        _inventoryTransactionService = inventoryTransactionService;
        _numberSequenceService = numberSequenceService;
        _queryContext = queryContext;
        _purchaseOrderRepository = purchaseOrderRepository;
        _purchaseOrderItemRepository = purchaseOrderItemRepository;
        _goodsReceiveRepository = goodsReceiveRepository;
        _salesOrderRepository = salesOrderRepository;
        _salesOrderItemRepository = salesOrderItemRepository;
        _deliveryOrderRepository = deliveryOrderRepository;
        _vendorRepository = vendorRepository;
        _customerRepository = customerRepository;
        _taxRepository = taxRepository;
        _productRepository = productRepository;
        _warehouseRepository = warehouseRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var demoAlreadySeeded = await _queryContext
            .Set<InventoryCostLayer>()
            .AsNoTracking()
            .AnyAsync(x => !x.IsDeleted && (x.BatchNumber == DemoLot1Batch || x.BatchNumber == DemoLot2Batch));

        if (demoAlreadySeeded)
        {
            return;
        }

        var tax = await GetOrCreateTaxAsync();
        var warehouse = await GetOrCreateWarehouseAsync();
        var vendor = await GetOrCreateVendorAsync();
        var customer = await GetOrCreateCustomerAsync();
        var product = await GetOrCreateProductAsync();

        // Gia ban hien tai duoc dat la 1.350.000, nhung gia von van phu thuoc theo batch.
        product.UnitPrice = 1_350_000d;
        _productRepository.Update(product);
        await _unitOfWork.SaveAsync();

        await SeedInboundAsync(
            vendorId: vendor.Id,
            taxId: tax.Id,
            warehouseId: warehouse.Id,
            product: product,
            batchNumber: DemoLot1Batch,
            unitCost: 900_000d,
            quantity: 10d,
            orderDate: new DateTime(2026, 1, 5),
            receiveDate: new DateTime(2026, 1, 6),
            descriptionSuffix: "Nhap lo A gia von 900.000"
        );

        await SeedInboundAsync(
            vendorId: vendor.Id,
            taxId: tax.Id,
            warehouseId: warehouse.Id,
            product: product,
            batchNumber: DemoLot2Batch,
            unitCost: 1_000_000d,
            quantity: 10d,
            orderDate: new DateTime(2026, 3, 10),
            receiveDate: new DateTime(2026, 3, 11),
            descriptionSuffix: "Nhap lo B gia von 1.000.000"
        );

        // Don 1: ban 6 cai, khong chi dinh batch => he thong cap phat FIFO tu lo A.
        await SeedOutboundAsync(
            customerId: customer.Id,
            taxId: tax.Id,
            warehouseId: warehouse.Id,
            product: product,
            quantity: 6d,
            salesUnitPrice: 1_300_000d,
            batchNumber: null,
            orderDate: new DateTime(2026, 3, 15),
            deliveryDate: new DateTime(2026, 3, 16),
            descriptionSuffix: "Ban FIFO lan 1, gia ban 1.300.000"
        );

        // Don 2: ban 5 cai, gia ban da cap nhat len 1.350.000.
        // Khi nay lo A con 4 cai, nen FIFO se xuat 4 cai tu lo A va 1 cai tu lo B.
        await SeedOutboundAsync(
            customerId: customer.Id,
            taxId: tax.Id,
            warehouseId: warehouse.Id,
            product: product,
            quantity: 5d,
            salesUnitPrice: 1_350_000d,
            batchNumber: null,
            orderDate: new DateTime(2026, 4, 2),
            deliveryDate: new DateTime(2026, 4, 3),
            descriptionSuffix: "Ban FIFO lan 2, lo A con 4 cai nen xuat tiep sang lo B"
        );

        // Don 3: nguoi dung chi dinh thang batch B, bo qua goi y FIFO.
        await SeedOutboundAsync(
            customerId: customer.Id,
            taxId: tax.Id,
            warehouseId: warehouse.Id,
            product: product,
            quantity: 2d,
            salesUnitPrice: 1_350_000d,
            batchNumber: DemoLot2Batch,
            orderDate: new DateTime(2026, 4, 12),
            deliveryDate: new DateTime(2026, 4, 13),
            descriptionSuffix: "Ban chi dinh batch B de demo override FIFO"
        );
    }

    private async Task SeedInboundAsync(
        string? vendorId,
        string? taxId,
        string? warehouseId,
        Product product,
        string batchNumber,
        double unitCost,
        double quantity,
        DateTime orderDate,
        DateTime receiveDate,
        string descriptionSuffix)
    {
        var purchaseOrder = new PurchaseOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(PurchaseOrder), "", "PO"),
            OrderDate = orderDate,
            OrderStatus = PurchaseOrderStatus.Confirmed,
            Description = $"{DemoPrefix} - {descriptionSuffix}",
            VendorId = vendorId,
            TaxId = taxId
        };
        await _purchaseOrderRepository.CreateAsync(purchaseOrder);

        var purchaseOrderItem = new PurchaseOrderItem
        {
            PurchaseOrderId = purchaseOrder.Id,
            ProductId = product.Id,
            Summary = $"{DemoPrefix} - {product.Name} - {batchNumber}",
            BatchNumber = batchNumber,
            UnitPrice = unitCost,
            Quantity = quantity,
            Total = unitCost * quantity
        };
        await _purchaseOrderItemRepository.CreateAsync(purchaseOrderItem);
        await _unitOfWork.SaveAsync();

        _purchaseOrderService.Recalculate(purchaseOrder.Id);

        var goodsReceive = new GoodsReceive
        {
            Number = _numberSequenceService.GenerateNumber(nameof(GoodsReceive), "", "GR"),
            ReceiveDate = receiveDate,
            Status = GoodsReceiveStatus.Confirmed,
            Description = $"{DemoPrefix} - {descriptionSuffix}",
            PurchaseOrderId = purchaseOrder.Id
        };
        await _goodsReceiveRepository.CreateAsync(goodsReceive);
        await _unitOfWork.SaveAsync();

        var inventoryTransaction = await _inventoryTransactionService.GoodsReceiveCreateInvenTrans(
            moduleId: goodsReceive.Id,
            warehouseId: warehouseId,
            productId: product.Id,
            movement: quantity,
            createdById: null,
            moduleItemId: purchaseOrderItem.Id,
            batchNumber: batchNumber
        );

        await _inventoryTransactionService.CreateInboundLayerAsync(
            inventoryTransaction,
            purchaseOrderItem,
            goodsReceive.ReceiveDate,
            createdById: null
        );
    }

    private async Task SeedOutboundAsync(
        string? customerId,
        string? taxId,
        string? warehouseId,
        Product product,
        double quantity,
        double salesUnitPrice,
        string? batchNumber,
        DateTime orderDate,
        DateTime deliveryDate,
        string descriptionSuffix)
    {
        var salesOrder = new SalesOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(SalesOrder), "", "SO"),
            OrderDate = orderDate,
            OrderStatus = SalesOrderStatus.Confirmed,
            Description = $"{DemoPrefix} - {descriptionSuffix}",
            CustomerId = customerId,
            TaxId = taxId
        };
        await _salesOrderRepository.CreateAsync(salesOrder);

        var salesOrderItem = new SalesOrderItem
        {
            SalesOrderId = salesOrder.Id,
            ProductId = product.Id,
            Summary = $"{DemoPrefix} - {descriptionSuffix}",
            BatchNumber = batchNumber,
            UnitPrice = salesUnitPrice,
            Quantity = quantity,
            Total = salesUnitPrice * quantity,
            CogsAmount = 0d,
            ProfitAmount = 0d
        };
        await _salesOrderItemRepository.CreateAsync(salesOrderItem);
        await _unitOfWork.SaveAsync();

        _salesOrderService.Recalculate(salesOrder.Id);

        var deliveryOrder = new DeliveryOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(DeliveryOrder), "", "DO"),
            DeliveryDate = deliveryDate,
            Status = DeliveryOrderStatus.Confirmed,
            Description = $"{DemoPrefix} - {descriptionSuffix}",
            SalesOrderId = salesOrder.Id
        };
        await _deliveryOrderRepository.CreateAsync(deliveryOrder);
        await _unitOfWork.SaveAsync();

        var inventoryTransaction = await _inventoryTransactionService.DeliveryOrderCreateInvenTrans(
            moduleId: deliveryOrder.Id,
            warehouseId: warehouseId,
            productId: product.Id,
            movement: quantity,
            createdById: null,
            moduleItemId: salesOrderItem.Id,
            batchNumber: batchNumber
        );

        await _inventoryTransactionService.AllocateDeliveryAsync(
            inventoryTransaction,
            salesOrderItem,
            deliveryOrder.DeliveryDate,
            createdById: null
        );
    }

    private async Task<Tax> GetOrCreateTaxAsync()
    {
        var tax = await _queryContext
            .Set<Tax>()
            .AsNoTracking()
            .OrderByDescending(x => x.Percentage)
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Percentage == 10d);

        if (tax != null)
        {
            return tax;
        }

        tax = new Tax
        {
            Name = "VAT10",
            Percentage = 10d
        };
        await _taxRepository.CreateAsync(tax);
        await _unitOfWork.SaveAsync();
        return tax;
    }

    private async Task<Warehouse> GetOrCreateWarehouseAsync()
    {
        var warehouse = await _queryContext
            .Set<Warehouse>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == DemoWarehouseName);

        if (warehouse != null)
        {
            return warehouse;
        }

        warehouse = new Warehouse
        {
            Name = DemoWarehouseName,
            Description = $"{DemoPrefix} - kho minh hoa cho luong nhap xuat theo lo",
            SystemWarehouse = false
        };
        await _warehouseRepository.CreateAsync(warehouse);
        await _unitOfWork.SaveAsync();
        return warehouse;
    }

    private async Task<Vendor> GetOrCreateVendorAsync()
    {
        var vendor = await _queryContext
            .Set<Vendor>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == DemoVendorName);

        if (vendor != null)
        {
            return vendor;
        }

        var vendorGroupId = await _queryContext
            .Set<VendorGroup>()
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => x.Id)
            .FirstAsync();

        var vendorCategoryId = await _queryContext
            .Set<VendorCategory>()
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => x.Id)
            .FirstAsync();

        vendor = new Vendor
        {
            Number = _numberSequenceService.GenerateNumber(nameof(Vendor), "", "VND"),
            Name = DemoVendorName,
            Description = $"{DemoPrefix} - nha cung cap duoc tao rieng de demo batch costing",
            City = "Ho Chi Minh",
            State = "VN",
            Country = "Vietnam",
            PhoneNumber = "0900000001",
            EmailAddress = "vendor.demo.batch@example.com",
            VendorGroupId = vendorGroupId,
            VendorCategoryId = vendorCategoryId
        };
        await _vendorRepository.CreateAsync(vendor);
        await _unitOfWork.SaveAsync();
        return vendor;
    }

    private async Task<Customer> GetOrCreateCustomerAsync()
    {
        var customer = await _queryContext
            .Set<Customer>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == DemoCustomerName);

        if (customer != null)
        {
            return customer;
        }

        var customerGroupId = await _queryContext
            .Set<CustomerGroup>()
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => x.Id)
            .FirstAsync();

        var customerCategoryId = await _queryContext
            .Set<CustomerCategory>()
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => x.Id)
            .FirstAsync();

        customer = new Customer
        {
            Number = _numberSequenceService.GenerateNumber(nameof(Customer), "", "CST"),
            Name = DemoCustomerName,
            Description = $"{DemoPrefix} - khach hang duoc tao rieng de demo gia von theo lo",
            City = "Ha Noi",
            State = "VN",
            Country = "Vietnam",
            PhoneNumber = "0900000002",
            EmailAddress = "customer.demo.batch@example.com",
            CustomerGroupId = customerGroupId,
            CustomerCategoryId = customerCategoryId
        };
        await _customerRepository.CreateAsync(customer);
        await _unitOfWork.SaveAsync();
        return customer;
    }

    private async Task<Product> GetOrCreateProductAsync()
    {
        var product = await _queryContext
            .Set<Product>()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == DemoProductName);

        if (product != null)
        {
            return product;
        }

        var productGroupId = await _queryContext
            .Set<ProductGroup>()
            .AsNoTracking()
            .OrderBy(x => x.Name)
            .Select(x => x.Id)
            .FirstAsync();

        var unitMeasureId = await _queryContext
            .Set<UnitMeasure>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.Name == "unit")
            .OrderBy(x => x.Name)
            .Select(x => x.Id)
            .FirstAsync();

        product = new Product
        {
            Number = _numberSequenceService.GenerateNumber(nameof(Product), "", "ART"),
            Name = DemoProductName,
            ReferenceCode = "DEMO-BATCH-ITEM",
            Description = $"{DemoPrefix} - san pham dung de demo 2 lo nhap (900k va 1.000k), gia ban cap nhat 1.350k",
            UnitPrice = 1_350_000d,
            Physical = true,
            UnitMeasureId = unitMeasureId,
            ProductGroupId = productGroupId
        };
        await _productRepository.CreateAsync(product);
        await _unitOfWork.SaveAsync();
        return product;
    }
}
