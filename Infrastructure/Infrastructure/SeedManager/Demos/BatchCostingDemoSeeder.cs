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
    private const string DemoPrefix = "DEMO THIẾT BỊ NHÀ THÔNG MINH";
    private const string DemoWarehouseName = "Kho thiết bị nhà thông minh";
    private const string DemoVendorName = "YUEQING NOVA ELECTRONICS CO.,LTD";
    private const string DemoCustomerName = "Công Ty Nội Thất Thông Minh Việt";
    private const string DemoProductReferenceCode = "SM-SWITCH-001";
    private const string DemoBatchNumber = "LOT-SMART-001";

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
    private readonly ICommandRepository<SalesReturn> _salesReturnRepository;
    private readonly ICommandRepository<PurchaseReturn> _purchaseReturnRepository;
    private readonly ICommandRepository<TransferOut> _transferOutRepository;
    private readonly ICommandRepository<TransferIn> _transferInRepository;
    private readonly ICommandRepository<PositiveAdjustment> _positiveAdjustmentRepository;
    private readonly ICommandRepository<NegativeAdjustment> _negativeAdjustmentRepository;
    private readonly ICommandRepository<Scrapping> _scrappingRepository;
    private readonly ICommandRepository<StockCount> _stockCountRepository;
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
        ICommandRepository<SalesReturn> salesReturnRepository,
        ICommandRepository<PurchaseReturn> purchaseReturnRepository,
        ICommandRepository<TransferOut> transferOutRepository,
        ICommandRepository<TransferIn> transferInRepository,
        ICommandRepository<PositiveAdjustment> positiveAdjustmentRepository,
        ICommandRepository<NegativeAdjustment> negativeAdjustmentRepository,
        ICommandRepository<Scrapping> scrappingRepository,
        ICommandRepository<StockCount> stockCountRepository,
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
        _salesReturnRepository = salesReturnRepository;
        _purchaseReturnRepository = purchaseReturnRepository;
        _transferOutRepository = transferOutRepository;
        _transferInRepository = transferInRepository;
        _positiveAdjustmentRepository = positiveAdjustmentRepository;
        _negativeAdjustmentRepository = negativeAdjustmentRepository;
        _scrappingRepository = scrappingRepository;
        _stockCountRepository = stockCountRepository;
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
            .Set<PurchaseOrder>()
            .AsNoTracking()
            .AnyAsync(x => !x.IsDeleted && x.Description != null && x.Description.StartsWith(DemoPrefix));

        if (demoAlreadySeeded)
        {
            return;
        }

        var tax = await GetOrCreateTaxAsync();
        var warehouse = await GetOrCreateWarehouseAsync();
        var vendor = await GetOrCreateVendorAsync();
        var customer = await GetOrCreateCustomerAsync();
        var product = await GetOrCreateProductAsync();

        var inbound = await SeedPurchaseAndGoodsReceiveAsync(
            vendor.Id,
            tax.Id,
            warehouse.Id,
            product,
            quantity: 50d,
            unitCost: 720_000d
        );

        var outbound = await SeedSalesAndDeliveryAsync(
            customer.Id,
            tax.Id,
            warehouse.Id,
            product,
            quantity: 5d,
            unitPrice: 1_352_000d
        );

        await SeedSalesReturnAsync(outbound.DeliveryOrder.Id, warehouse.Id, product.Id, quantity: 1d);
        await SeedPurchaseReturnAsync(inbound.GoodsReceive.Id, warehouse.Id, product.Id, quantity: 1d);
        var transferOut = await SeedTransferOutAsync(warehouse.Id, product.Id, quantity: 2d);
        await SeedTransferInAsync(transferOut.Id, product.Id, quantity: 2d);
        await SeedPositiveAdjustmentAsync(warehouse.Id, product.Id, quantity: 1d);
        await SeedNegativeAdjustmentAsync(warehouse.Id, product.Id, quantity: 1d);
        await SeedScrappingAsync(warehouse.Id, product.Id, quantity: 1d);
        await SeedStockCountAsync(warehouse.Id, product.Id);
    }

    private async Task<(PurchaseOrder PurchaseOrder, PurchaseOrderItem PurchaseOrderItem, GoodsReceive GoodsReceive)> SeedPurchaseAndGoodsReceiveAsync(
        string? vendorId,
        string? taxId,
        string? warehouseId,
        Product product,
        double quantity,
        double unitCost)
    {
        var purchaseOrder = new PurchaseOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(PurchaseOrder), "", "PO"),
            OrderDate = new DateTime(2026, 4, 1),
            OrderStatus = PurchaseOrderStatus.Confirmed,
            Description = $"{DemoPrefix} - đơn mua nhập hàng demo",
            VendorId = vendorId,
            TaxId = taxId
        };
        await _purchaseOrderRepository.CreateAsync(purchaseOrder);

        var purchaseOrderItem = new PurchaseOrderItem
        {
            PurchaseOrderId = purchaseOrder.Id,
            ProductId = product.Id,
            WarehouseId = warehouseId,
            Summary = $"{product.Name} - {DemoBatchNumber}",
            BatchNumber = DemoBatchNumber,
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
            ReceiveDate = new DateTime(2026, 4, 2),
            Status = GoodsReceiveStatus.Confirmed,
            Description = $"{DemoPrefix} - phiếu nhập kho từ đơn mua",
            PurchaseOrderId = purchaseOrder.Id
        };
        await _goodsReceiveRepository.CreateAsync(goodsReceive);
        await _unitOfWork.SaveAsync();

        await _inventoryTransactionService.GoodsReceiveCreateInvenTrans(
            moduleId: goodsReceive.Id,
            warehouseId: warehouseId,
            productId: product.Id,
            movement: quantity,
            createdById: null,
            moduleItemId: purchaseOrderItem.Id,
            batchNumber: DemoBatchNumber
        );

        return (purchaseOrder, purchaseOrderItem, goodsReceive);
    }

    private async Task<(SalesOrder SalesOrder, SalesOrderItem SalesOrderItem, DeliveryOrder DeliveryOrder)> SeedSalesAndDeliveryAsync(
        string? customerId,
        string? taxId,
        string? warehouseId,
        Product product,
        double quantity,
        double unitPrice)
    {
        var salesOrder = new SalesOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(SalesOrder), "", "SO"),
            OrderDate = new DateTime(2026, 4, 5),
            OrderStatus = SalesOrderStatus.Confirmed,
            Description = $"{DemoPrefix} - đơn bán thiết bị demo",
            CustomerId = customerId,
            TaxId = taxId
        };
        await _salesOrderRepository.CreateAsync(salesOrder);

        var salesOrderItem = new SalesOrderItem
        {
            SalesOrderId = salesOrder.Id,
            ProductId = product.Id,
            Summary = $"{product.Name} - bán cho khách demo",
            BatchNumber = DemoBatchNumber,
            UnitPrice = unitPrice,
            Quantity = quantity,
            Total = unitPrice * quantity,
            CogsAmount = 0d,
            ProfitAmount = 0d
        };
        await _salesOrderItemRepository.CreateAsync(salesOrderItem);
        await _unitOfWork.SaveAsync();

        _salesOrderService.Recalculate(salesOrder.Id);

        var deliveryOrder = new DeliveryOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(DeliveryOrder), "", "DO"),
            DeliveryDate = new DateTime(2026, 4, 6),
            Status = DeliveryOrderStatus.Confirmed,
            Description = $"{DemoPrefix} - phiếu xuất kho từ đơn bán",
            SalesOrderId = salesOrder.Id
        };
        await _deliveryOrderRepository.CreateAsync(deliveryOrder);
        await _unitOfWork.SaveAsync();

        await _inventoryTransactionService.DeliveryOrderCreateInvenTrans(
            moduleId: deliveryOrder.Id,
            warehouseId: warehouseId,
            productId: product.Id,
            movement: quantity,
            createdById: null,
            moduleItemId: salesOrderItem.Id,
            batchNumber: DemoBatchNumber
        );

        await _inventoryTransactionService.UpdateSalesOrderItemBatchCostAsync(
            salesOrderItem,
            updatedById: null
        );

        return (salesOrder, salesOrderItem, deliveryOrder);
    }

    private async Task SeedSalesReturnAsync(string? deliveryOrderId, string? warehouseId, string? productId, double quantity)
    {
        var salesReturn = new SalesReturn
        {
            Number = _numberSequenceService.GenerateNumber(nameof(SalesReturn), "", "SRN"),
            ReturnDate = new DateTime(2026, 4, 8),
            Status = SalesReturnStatus.Confirmed,
            Description = $"{DemoPrefix} - khách trả lại một phần hàng",
            DeliveryOrderId = deliveryOrderId
        };
        await _salesReturnRepository.CreateAsync(salesReturn);
        await _unitOfWork.SaveAsync();

        await _inventoryTransactionService.SalesReturnCreateInvenTrans(
            salesReturn.Id,
            warehouseId,
            productId,
            quantity,
            createdById: null
        );
    }

    private async Task SeedPurchaseReturnAsync(string? goodsReceiveId, string? warehouseId, string? productId, double quantity)
    {
        var purchaseReturn = new PurchaseReturn
        {
            Number = _numberSequenceService.GenerateNumber(nameof(PurchaseReturn), "", "PRN"),
            ReturnDate = new DateTime(2026, 4, 9),
            Status = PurchaseReturnStatus.Confirmed,
            Description = $"{DemoPrefix} - trả lại một phần hàng cho nhà cung cấp",
            GoodsReceiveId = goodsReceiveId
        };
        await _purchaseReturnRepository.CreateAsync(purchaseReturn);
        await _unitOfWork.SaveAsync();

        await _inventoryTransactionService.PurchaseReturnCreateInvenTrans(
            purchaseReturn.Id,
            warehouseId,
            productId,
            quantity,
            createdById: null
        );
    }

    private async Task<TransferOut> SeedTransferOutAsync(string? warehouseId, string? productId, double quantity)
    {
        var transferOut = new TransferOut
        {
            Number = _numberSequenceService.GenerateNumber(nameof(TransferOut), "", "OUT"),
            TransferReleaseDate = new DateTime(2026, 4, 10),
            Status = TransferStatus.Confirmed,
            Description = $"{DemoPrefix} - chuyển kho demo trong cùng kho vật lý",
            WarehouseFromId = warehouseId,
            WarehouseToId = warehouseId
        };
        await _transferOutRepository.CreateAsync(transferOut);
        await _unitOfWork.SaveAsync();

        await _inventoryTransactionService.TransferOutCreateInvenTrans(
            transferOut.Id,
            productId,
            quantity,
            createdById: null
        );

        return transferOut;
    }

    private async Task SeedTransferInAsync(string? transferOutId, string? productId, double quantity)
    {
        var transferIn = new TransferIn
        {
            Number = _numberSequenceService.GenerateNumber(nameof(TransferIn), "", "IN"),
            TransferReceiveDate = new DateTime(2026, 4, 11),
            Status = TransferStatus.Confirmed,
            Description = $"{DemoPrefix} - nhận chuyển kho demo",
            TransferOutId = transferOutId
        };
        await _transferInRepository.CreateAsync(transferIn);
        await _unitOfWork.SaveAsync();

        await _inventoryTransactionService.TransferInCreateInvenTrans(
            transferIn.Id,
            productId,
            quantity,
            createdById: null
        );
    }

    private async Task SeedPositiveAdjustmentAsync(string? warehouseId, string? productId, double quantity)
    {
        var adjustment = new PositiveAdjustment
        {
            Number = _numberSequenceService.GenerateNumber(nameof(PositiveAdjustment), "", "ADJ+"),
            AdjustmentDate = new DateTime(2026, 4, 12),
            Status = AdjustmentStatus.Confirmed,
            Description = $"{DemoPrefix} - điều chỉnh tăng tồn kho"
        };
        await _positiveAdjustmentRepository.CreateAsync(adjustment);
        await _unitOfWork.SaveAsync();

        await _inventoryTransactionService.PositiveAdjustmentCreateInvenTrans(
            adjustment.Id,
            warehouseId,
            productId,
            quantity,
            createdById: null
        );
    }

    private async Task SeedNegativeAdjustmentAsync(string? warehouseId, string? productId, double quantity)
    {
        var adjustment = new NegativeAdjustment
        {
            Number = _numberSequenceService.GenerateNumber(nameof(NegativeAdjustment), "", "ADJ-"),
            AdjustmentDate = new DateTime(2026, 4, 13),
            Status = AdjustmentStatus.Confirmed,
            Description = $"{DemoPrefix} - điều chỉnh giảm tồn kho"
        };
        await _negativeAdjustmentRepository.CreateAsync(adjustment);
        await _unitOfWork.SaveAsync();

        await _inventoryTransactionService.NegativeAdjustmentCreateInvenTrans(
            adjustment.Id,
            warehouseId,
            productId,
            quantity,
            createdById: null
        );
    }

    private async Task SeedScrappingAsync(string? warehouseId, string? productId, double quantity)
    {
        var scrapping = new Scrapping
        {
            Number = _numberSequenceService.GenerateNumber(nameof(Scrapping), "", "SCRP"),
            ScrappingDate = new DateTime(2026, 4, 14),
            Status = ScrappingStatus.Confirmed,
            Description = $"{DemoPrefix} - hủy hàng demo",
            WarehouseId = warehouseId
        };
        await _scrappingRepository.CreateAsync(scrapping);
        await _unitOfWork.SaveAsync();

        await _inventoryTransactionService.ScrappingCreateInvenTrans(
            scrapping.Id,
            productId,
            quantity,
            createdById: null
        );
    }

    private async Task SeedStockCountAsync(string? warehouseId, string? productId)
    {
        var currentStock = _inventoryTransactionService.GetStock(warehouseId, productId);
        var countedQty = Math.Max(1d, currentStock - 1d);

        var stockCount = new StockCount
        {
            Number = _numberSequenceService.GenerateNumber(nameof(StockCount), "", "SC"),
            CountDate = new DateTime(2026, 4, 15),
            Status = StockCountStatus.Confirmed,
            Description = $"{DemoPrefix} - kiểm kê kho demo",
            WarehouseId = warehouseId
        };
        await _stockCountRepository.CreateAsync(stockCount);
        await _unitOfWork.SaveAsync();

        await _inventoryTransactionService.StockCountCreateInvenTrans(
            stockCount.Id,
            productId,
            countedQty,
            createdById: null
        );
    }

    private async Task<Tax> GetOrCreateTaxAsync()
    {
        var tax = await _queryContext
            .Set<Tax>()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == "VAT 10%");

        if (tax != null)
        {
            return tax;
        }

        tax = new Tax
        {
            Name = "VAT 10%",
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
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == DemoWarehouseName);

        if (warehouse != null)
        {
            warehouse.Description = "Kho vật lý demo cho thiết bị nhà thông minh và nội thất.";
            warehouse.SystemWarehouse = false;
            _warehouseRepository.Update(warehouse);
            await _unitOfWork.SaveAsync();
            return warehouse;
        }

        warehouse = new Warehouse
        {
            Name = DemoWarehouseName,
            Description = "Kho vật lý demo cho thiết bị nhà thông minh và nội thất.",
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
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == DemoVendorName);

        var vendorGroupId = await _queryContext
            .Set<VendorGroup>()
            .Where(x => !x.IsDeleted && x.Name == "Phân phối")
            .Select(x => x.Id)
            .FirstAsync();

        var vendorCategoryId = await _queryContext
            .Set<VendorCategory>()
            .Where(x => !x.IsDeleted && x.Name == "Toàn Quốc")
            .Select(x => x.Id)
            .FirstAsync();

        var isNewVendor = vendor == null;
        vendor ??= new Vendor
        {
            Number = _numberSequenceService.GenerateNumber(nameof(Vendor), "", "VND")
        };

        vendor.Name = DemoVendorName;
        vendor.VendorGroupId = vendorGroupId;
        vendor.VendorCategoryId = vendorCategoryId;
        vendor.Street = "NO.238 Wei 11 Road";
        vendor.City = "Yueqing";
        vendor.State = "Zhejiang";
        vendor.ZipCode = "325600";
        vendor.Country = "China";
        vendor.PhoneNumber = "+8618058336905";
        vendor.EmailAddress = "ruby@moespower.com";
        vendor.Website = "www.moespower.com";
        vendor.Description = "Nhà cung cấp demo thiết bị nhà thông minh.";

        if (isNewVendor)
        {
            await _vendorRepository.CreateAsync(vendor);
        }
        else
        {
            _vendorRepository.Update(vendor);
        }

        await _unitOfWork.SaveAsync();
        return vendor;
    }

    private async Task<Customer> GetOrCreateCustomerAsync()
    {
        var customer = await _queryContext
            .Set<Customer>()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == DemoCustomerName);

        var customerGroupId = await _queryContext
            .Set<CustomerGroup>()
            .Where(x => !x.IsDeleted && x.Name == "Khách dự án nhà thông minh")
            .Select(x => x.Id)
            .FirstAsync();

        var customerCategoryId = await _queryContext
            .Set<CustomerCategory>()
            .Where(x => !x.IsDeleted && x.Name == "Căn hộ")
            .Select(x => x.Id)
            .FirstAsync();

        var isNewCustomer = customer == null;
        customer ??= new Customer
        {
            Number = _numberSequenceService.GenerateNumber(nameof(Customer), "", "CST")
        };

        customer.Name = DemoCustomerName;
        customer.CustomerGroupId = customerGroupId;
        customer.CustomerCategoryId = customerCategoryId;
        customer.Street = "12 Nguyễn Văn Hưởng";
        customer.City = "TP. Hồ Chí Minh";
        customer.State = "TP. Hồ Chí Minh";
        customer.ZipCode = "700000";
        customer.Country = "Việt Nam";
        customer.PhoneNumber = "0909123456";
        customer.EmailAddress = "khachhang.demo@architech.vn";
        customer.Website = "architech.vn";
        customer.Description = "Khách hàng demo cho dự án thiết bị nhà thông minh và nội thất.";

        if (isNewCustomer)
        {
            await _customerRepository.CreateAsync(customer);
        }
        else
        {
            _customerRepository.Update(customer);
        }

        await _unitOfWork.SaveAsync();
        return customer;
    }

    private async Task<Product> GetOrCreateProductAsync()
    {
        var product = await _queryContext
            .Set<Product>()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.ReferenceCode == DemoProductReferenceCode);

        var productGroupId = await _queryContext
            .Set<ProductGroup>()
            .Where(x => !x.IsDeleted && x.Name == "Thiết bị nhà thông minh")
            .Select(x => x.Id)
            .FirstAsync();

        var unitMeasureId = await _queryContext
            .Set<UnitMeasure>()
            .Where(x => !x.IsDeleted && x.Name == "Cái")
            .Select(x => x.Id)
            .FirstAsync();

        var defaultWarehouseId = await _queryContext
            .Set<Warehouse>()
            .Where(x => !x.IsDeleted && x.SystemWarehouse == false)
            .Select(x => x.Id)
            .FirstOrDefaultAsync();

        var isNewProduct = product == null;
        product ??= new Product
        {
            Number = _numberSequenceService.GenerateNumber(nameof(Product), "", "ART")
        };

        product.Name = "Công tắc thông minh WiFi 1 nút";
        product.ReferenceCode = DemoProductReferenceCode;
        product.Description = "Sản phẩm demo cho kho thiết bị nhà thông minh.";
        product.UnitPrice = 1_352_000d;
        product.Physical = true;
        product.DefaultWarehouseId = defaultWarehouseId;
        product.DefaultWarrantyMonths = 3;
        product.UnitMeasureId = unitMeasureId;
        product.ProductGroupId = productGroupId;

        if (isNewProduct)
        {
            await _productRepository.CreateAsync(product);
        }
        else
        {
            _productRepository.Update(product);
        }

        await _unitOfWork.SaveAsync();
        return product;
    }
}
