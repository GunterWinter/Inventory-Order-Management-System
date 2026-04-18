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
    private readonly PurchaseOrderService _purchaseOrderService;
    private readonly SalesOrderService _salesOrderService;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly NumberSequenceService _numberSequenceService;

    private readonly ICommandRepository<PurchaseOrder> _purchaseOrderRepository;
    private readonly ICommandRepository<PurchaseOrderItem> _purchaseOrderItemRepository;
    private readonly ICommandRepository<GoodsReceive> _goodsReceiveRepository;
    private readonly ICommandRepository<SalesOrder> _salesOrderRepository;
    private readonly ICommandRepository<SalesOrderItem> _salesOrderItemRepository;
    private readonly ICommandRepository<DeliveryOrder> _deliveryOrderRepository;
    private readonly ICommandRepository<InventoryTransaction> _inventoryTransactionRepository;
    private readonly ICommandRepository<InventoryCostLayer> _inventoryCostLayerRepository;
    private readonly ICommandRepository<InventoryIssueAllocation> _inventoryIssueAllocationRepository;

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

        ICommandRepository<PurchaseOrder> purchaseOrderRepository,
        ICommandRepository<PurchaseOrderItem> purchaseOrderItemRepository,
        ICommandRepository<GoodsReceive> goodsReceiveRepository,
        ICommandRepository<SalesOrder> salesOrderRepository,
        ICommandRepository<SalesOrderItem> salesOrderItemRepository,
        ICommandRepository<DeliveryOrder> deliveryOrderRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<InventoryCostLayer> inventoryCostLayerRepository,
        ICommandRepository<InventoryIssueAllocation> inventoryIssueAllocationRepository,

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

        _purchaseOrderRepository = purchaseOrderRepository;
        _purchaseOrderItemRepository = purchaseOrderItemRepository;
        _goodsReceiveRepository = goodsReceiveRepository;
        _salesOrderRepository = salesOrderRepository;
        _salesOrderItemRepository = salesOrderItemRepository;
        _deliveryOrderRepository = deliveryOrderRepository;
        _inventoryTransactionRepository = inventoryTransactionRepository;
        _inventoryCostLayerRepository = inventoryCostLayerRepository;
        _inventoryIssueAllocationRepository = inventoryIssueAllocationRepository;

        _vendorRepository = vendorRepository;
        _customerRepository = customerRepository;
        _taxRepository = taxRepository;
        _productRepository = productRepository;
        _warehouseRepository = warehouseRepository;

        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        // chống seed trùng
        var existed = await _inventoryCostLayerRepository
            .GetQuery()
            .AnyAsync(x => x.BatchNumber == "LOT-900-A" || x.BatchNumber == "LOT-1000-B");

        if (existed)
        {
            return;
        }

        var vendorId = await _vendorRepository.GetQuery().Select(x => x.Id).FirstAsync();
        var customerId = await _customerRepository.GetQuery().Select(x => x.Id).FirstAsync();
        var taxId = await _taxRepository.GetQuery().Select(x => x.Id).FirstAsync();

        var warehouse = await _warehouseRepository
            .GetQuery()
            .Where(x => x.SystemWarehouse == false)
            .OrderBy(x => x.Name)
            .FirstAsync();

        var product = await _productRepository
            .GetQuery()
            .Where(x => x.Physical == true)
            .OrderBy(x => x.Name)
            .FirstAsync();

        const string lot1Batch = "LOT-900-A";
        const string lot2Batch = "LOT-1000-B";

        const decimal lot1Cost = 900000m;
        const decimal lot2Cost = 1000000m;
        const decimal salesPrice = 1350000m;

        // =========================================
        // LOT 1: PO + PO ITEM + GR + IVT + COST LAYER
        // =========================================
        var po1Date = new DateTime(2026, 1, 5);

        var po1 = new PurchaseOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(PurchaseOrder), "", "PO"),
            OrderDate = po1Date,
            OrderStatus = PurchaseOrderStatus.Confirmed,
            VendorId = vendorId,
            TaxId = taxId
        };
        await _purchaseOrderRepository.CreateAsync(po1);

        var poItem1 = new PurchaseOrderItem
        {
            PurchaseOrderId = po1.Id,
            ProductId = product.Id,
            Summary = product.Number,
            BatchNumber = lot1Batch,
            UnitPrice = (double)lot1Cost,
            Quantity = 10,
            Total = (double)(lot1Cost * 10)
        };
        await _purchaseOrderItemRepository.CreateAsync(poItem1);

        await _unitOfWork.SaveAsync();
        _purchaseOrderService.Recalculate(po1.Id);

        var gr1 = new GoodsReceive
        {
            Number = _numberSequenceService.GenerateNumber(nameof(GoodsReceive), "", "GR"),
            ReceiveDate = po1Date.AddDays(1),
            Status = GoodsReceiveStatus.Confirmed,
            PurchaseOrderId = po1.Id
        };
        await _goodsReceiveRepository.CreateAsync(gr1);

        var grIvt1 = new InventoryTransaction
        {
            ModuleId = gr1.Id,
            ModuleItemId = poItem1.Id,
            ModuleName = nameof(GoodsReceive),
            ModuleCode = "GR",
            ModuleNumber = gr1.Number,
            MovementDate = gr1.ReceiveDate!.Value,
            Status = (InventoryTransactionStatus)gr1.Status,
            Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), "", "IVT"),
            WarehouseId = warehouse.Id,
            ProductId = product.Id,
            BatchNumber = lot1Batch,
            Movement = poItem1.Quantity!.Value
        };
        _inventoryTransactionService.CalculateInvenTrans(grIvt1);
        await _inventoryTransactionRepository.CreateAsync(grIvt1);

        var layer1 = new InventoryCostLayer
        {
            InventoryTransactionId = grIvt1.Id,
            ModuleItemId = poItem1.Id,
            WarehouseId = warehouse.Id,
            ProductId = product.Id,
            BatchNumber = lot1Batch,
            ReceivedDate = gr1.ReceiveDate,
            UnitCost = lot1Cost,
            OriginalQty = 10m,
            RemainingQty = 10m,
            LayerStatus = 1
        };
        await _inventoryCostLayerRepository.CreateAsync(layer1);
        await _unitOfWork.SaveAsync();

        // =========================================
        // LOT 2: PO + PO ITEM + GR + IVT + COST LAYER
        // =========================================
        var po2Date = new DateTime(2026, 2, 10);

        var po2 = new PurchaseOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(PurchaseOrder), "", "PO"),
            OrderDate = po2Date,
            OrderStatus = PurchaseOrderStatus.Confirmed,
            VendorId = vendorId,
            TaxId = taxId
        };
        await _purchaseOrderRepository.CreateAsync(po2);

        var poItem2 = new PurchaseOrderItem
        {
            PurchaseOrderId = po2.Id,
            ProductId = product.Id,
            Summary = product.Number,
            BatchNumber = lot2Batch,
            UnitPrice = (double)lot2Cost,
            Quantity = 10,
            Total = (double)(lot2Cost * 10)
        };
        await _purchaseOrderItemRepository.CreateAsync(poItem2);

        await _unitOfWork.SaveAsync();
        _purchaseOrderService.Recalculate(po2.Id);

        var gr2 = new GoodsReceive
        {
            Number = _numberSequenceService.GenerateNumber(nameof(GoodsReceive), "", "GR"),
            ReceiveDate = po2Date.AddDays(1),
            Status = GoodsReceiveStatus.Confirmed,
            PurchaseOrderId = po2.Id
        };
        await _goodsReceiveRepository.CreateAsync(gr2);

        var grIvt2 = new InventoryTransaction
        {
            ModuleId = gr2.Id,
            ModuleItemId = poItem2.Id,
            ModuleName = nameof(GoodsReceive),
            ModuleCode = "GR",
            ModuleNumber = gr2.Number,
            MovementDate = gr2.ReceiveDate!.Value,
            Status = (InventoryTransactionStatus)gr2.Status,
            Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), "", "IVT"),
            WarehouseId = warehouse.Id,
            ProductId = product.Id,
            BatchNumber = lot2Batch,
            Movement = poItem2.Quantity!.Value
        };
        _inventoryTransactionService.CalculateInvenTrans(grIvt2);
        await _inventoryTransactionRepository.CreateAsync(grIvt2);

        var layer2 = new InventoryCostLayer
        {
            InventoryTransactionId = grIvt2.Id,
            ModuleItemId = poItem2.Id,
            WarehouseId = warehouse.Id,
            ProductId = product.Id,
            BatchNumber = lot2Batch,
            ReceivedDate = gr2.ReceiveDate,
            UnitCost = lot2Cost,
            OriginalQty = 10m,
            RemainingQty = 10m,
            LayerStatus = 1
        };
        await _inventoryCostLayerRepository.CreateAsync(layer2);
        await _unitOfWork.SaveAsync();

        // =========================================
        // SALE 1: SO + SO ITEM + DO + IVT + ALLOCATION
        // 6 cái, FIFO => ăn hết từ LOT-900-A
        // =========================================
        var so1Date = new DateTime(2026, 3, 1);

        var so1 = new SalesOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(SalesOrder), "", "SO"),
            OrderDate = so1Date,
            OrderStatus = SalesOrderStatus.Confirmed,
            CustomerId = customerId,
            TaxId = taxId
        };
        await _salesOrderRepository.CreateAsync(so1);

        var soItem1 = new SalesOrderItem
        {
            SalesOrderId = so1.Id,
            ProductId = product.Id,
            Summary = product.Number,
            BatchNumber = null, // demo FIFO
            UnitPrice = (double)salesPrice,
            Quantity = 6,
            Total = (double)(salesPrice * 6m),
            CogsAmount = 0,
            ProfitAmount = 0
        };
        await _salesOrderItemRepository.CreateAsync(soItem1);

        await _unitOfWork.SaveAsync();
        _salesOrderService.Recalculate(so1.Id);

        var do1 = new DeliveryOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(DeliveryOrder), "", "DO"),
            DeliveryDate = so1Date.AddDays(1),
            Status = DeliveryOrderStatus.Confirmed,
            SalesOrderId = so1.Id
        };
        await _deliveryOrderRepository.CreateAsync(do1);

        var doIvt1 = new InventoryTransaction
        {
            ModuleId = do1.Id,
            ModuleItemId = soItem1.Id,
            ModuleName = nameof(DeliveryOrder),
            ModuleCode = "DO",
            ModuleNumber = do1.Number,
            MovementDate = do1.DeliveryDate!.Value,
            Status = (InventoryTransactionStatus)do1.Status,
            Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), "", "IVT"),
            WarehouseId = warehouse.Id,
            ProductId = product.Id,
            BatchNumber = null,
            Movement = soItem1.Quantity!.Value
        };
        _inventoryTransactionService.CalculateInvenTrans(doIvt1);
        await _inventoryTransactionRepository.CreateAsync(doIvt1);

        var sale1Cost = 6m * lot1Cost;
        var sale1Sales = 6m * salesPrice;

        var alloc11 = new InventoryIssueAllocation
        {
            InventoryTransactionId = doIvt1.Id,
            ModuleItemId = soItem1.Id,
            SalesOrderItemId = soItem1.Id,
            CostLayerId = layer1.Id,
            WarehouseId = warehouse.Id,
            ProductId = product.Id,
            BatchNumber = lot1Batch,
            QtyIssued = 6m,
            UnitCost = lot1Cost,
            SalesUnitPrice = salesPrice,
            CostAmount = sale1Cost,
            SalesAmount = sale1Sales,
            ProfitAmount = sale1Sales - sale1Cost,
            AllocationDate = do1.DeliveryDate
        };
        await _inventoryIssueAllocationRepository.CreateAsync(alloc11);

        layer1.RemainingQty = 4m;
        layer1.LayerStatus = 1;

        soItem1.CogsAmount = (double)sale1Cost;
        soItem1.ProfitAmount = (double)(sale1Sales - sale1Cost);

        await _unitOfWork.SaveAsync();

        // =========================================
        // SALE 2: SO + SO ITEM + DO + IVT + ALLOCATION
        // 8 cái, FIFO => 4 cái LOT-900-A + 4 cái LOT-1000-B
        // =========================================
        var so2Date = new DateTime(2026, 3, 10);

        var so2 = new SalesOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(SalesOrder), "", "SO"),
            OrderDate = so2Date,
            OrderStatus = SalesOrderStatus.Confirmed,
            CustomerId = customerId,
            TaxId = taxId
        };
        await _salesOrderRepository.CreateAsync(so2);

        var soItem2 = new SalesOrderItem
        {
            SalesOrderId = so2.Id,
            ProductId = product.Id,
            Summary = product.Number,
            BatchNumber = null, // demo FIFO
            UnitPrice = (double)salesPrice,
            Quantity = 8,
            Total = (double)(salesPrice * 8m),
            CogsAmount = 0,
            ProfitAmount = 0
        };
        await _salesOrderItemRepository.CreateAsync(soItem2);

        await _unitOfWork.SaveAsync();
        _salesOrderService.Recalculate(so2.Id);

        var do2 = new DeliveryOrder
        {
            Number = _numberSequenceService.GenerateNumber(nameof(DeliveryOrder), "", "DO"),
            DeliveryDate = so2Date.AddDays(1),
            Status = DeliveryOrderStatus.Confirmed,
            SalesOrderId = so2.Id
        };
        await _deliveryOrderRepository.CreateAsync(do2);

        var doIvt2 = new InventoryTransaction
        {
            ModuleId = do2.Id,
            ModuleItemId = soItem2.Id,
            ModuleName = nameof(DeliveryOrder),
            ModuleCode = "DO",
            ModuleNumber = do2.Number,
            MovementDate = do2.DeliveryDate!.Value,
            Status = (InventoryTransactionStatus)do2.Status,
            Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), "", "IVT"),
            WarehouseId = warehouse.Id,
            ProductId = product.Id,
            BatchNumber = null,
            Movement = soItem2.Quantity!.Value
        };
        _inventoryTransactionService.CalculateInvenTrans(doIvt2);
        await _inventoryTransactionRepository.CreateAsync(doIvt2);

        var alloc21Cost = 4m * lot1Cost;
        var alloc21Sales = 4m * salesPrice;

        var alloc21 = new InventoryIssueAllocation
        {
            InventoryTransactionId = doIvt2.Id,
            ModuleItemId = soItem2.Id,
            SalesOrderItemId = soItem2.Id,
            CostLayerId = layer1.Id,
            WarehouseId = warehouse.Id,
            ProductId = product.Id,
            BatchNumber = lot1Batch,
            QtyIssued = 4m,
            UnitCost = lot1Cost,
            SalesUnitPrice = salesPrice,
            CostAmount = alloc21Cost,
            SalesAmount = alloc21Sales,
            ProfitAmount = alloc21Sales - alloc21Cost,
            AllocationDate = do2.DeliveryDate
        };
        await _inventoryIssueAllocationRepository.CreateAsync(alloc21);

        var alloc22Cost = 4m * lot2Cost;
        var alloc22Sales = 4m * salesPrice;

        var alloc22 = new InventoryIssueAllocation
        {
            InventoryTransactionId = doIvt2.Id,
            ModuleItemId = soItem2.Id,
            SalesOrderItemId = soItem2.Id,
            CostLayerId = layer2.Id,
            WarehouseId = warehouse.Id,
            ProductId = product.Id,
            BatchNumber = lot2Batch,
            QtyIssued = 4m,
            UnitCost = lot2Cost,
            SalesUnitPrice = salesPrice,
            CostAmount = alloc22Cost,
            SalesAmount = alloc22Sales,
            ProfitAmount = alloc22Sales - alloc22Cost,
            AllocationDate = do2.DeliveryDate
        };
        await _inventoryIssueAllocationRepository.CreateAsync(alloc22);

        layer1.RemainingQty = 0m;
        layer1.LayerStatus = 2;

        layer2.RemainingQty = 6m;
        layer2.LayerStatus = 1;

        var sale2Cost = alloc21Cost + alloc22Cost;
        var sale2Sales = 8m * salesPrice;

        soItem2.CogsAmount = (double)sale2Cost;
        soItem2.ProfitAmount = (double)(sale2Sales - sale2Cost);

        await _unitOfWork.SaveAsync();
    }
}