using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductSerialManager;
using Domain.Common;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.ProductManager;

public sealed class ProductOpeningStockService
{
    public const string OpeningStockModuleCode = "PRODUCT_OPENING";

    private const decimal QuantityTolerance = 0.000001m;

    private readonly ICommandRepository<StockCount> _stockCountRepository;
    private readonly ICommandRepository<InventoryTransaction> _inventoryTransactionRepository;
    private readonly ICommandRepository<ProductSerial> _productSerialRepository;
    private readonly ICommandRepository<ProductSerialMovement> _productSerialMovementRepository;
    private readonly ICommandRepository<Warehouse> _warehouseRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly ProductSerialService _productSerialService;

    public ProductOpeningStockService(
        ICommandRepository<StockCount> stockCountRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<ProductSerial> productSerialRepository,
        ICommandRepository<ProductSerialMovement> productSerialMovementRepository,
        ICommandRepository<Warehouse> warehouseRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        ProductSerialService productSerialService)
    {
        _stockCountRepository = stockCountRepository;
        _inventoryTransactionRepository = inventoryTransactionRepository;
        _productSerialRepository = productSerialRepository;
        _productSerialMovementRepository = productSerialMovementRepository;
        _warehouseRepository = warehouseRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _productSerialService = productSerialService;
    }

    public async Task ApplyAsync(
        Product product,
        decimal? requestedQuantity,
        bool isCreate,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        if (!requestedQuantity.HasValue)
        {
            return;
        }

        var quantity = requestedQuantity.Value;
        if (quantity < 0m)
        {
            throw new InvalidOperationException("Tồn đầu kỳ phải là một số không âm hợp lệ.");
        }

        var physical = product.Physical == true;
        var trackingMode = physical
            ? product.SerialTrackingMode ?? SerialTrackingMode.None
            : SerialTrackingMode.None;

        if (!isCreate && (!physical || trackingMode != SerialTrackingMode.None))
        {
            throw new InvalidOperationException(
                "Chỉ hàng hóa vật lý không theo dõi serial mới được sửa tồn đầu kỳ trong danh mục hàng hóa.");
        }

        if (!physical)
        {
            if (quantity > 0m)
            {
                throw new InvalidOperationException("Hàng hóa phi vật lý không được có tồn đầu kỳ.");
            }

            return;
        }

        if (trackingMode == SerialTrackingMode.ManufacturerSerial)
        {
            if (quantity > 0m)
            {
                throw new InvalidOperationException(
                    "Hàng theo serial nhà sản xuất chỉ được nhập tồn qua đơn mua hàng.");
            }

            return;
        }

        if (trackingMode == SerialTrackingMode.InternalAuto)
        {
            if (!isCreate)
            {
                throw new InvalidOperationException(
                    "Tồn đầu kỳ của hàng tự sinh mã nội bộ chỉ được nhập khi tạo hàng hóa.");
            }

            if (Math.Abs(quantity - Math.Round(quantity)) > QuantityTolerance || quantity > int.MaxValue)
            {
                throw new InvalidOperationException(
                    "Tồn đầu kỳ của hàng tự sinh mã nội bộ phải là số nguyên không âm.");
            }

            quantity = Math.Round(quantity);
        }

        var history = await _inventoryTransactionRepository.GetQuery()
            .Where(x => !x.IsDeleted
                && x.ProductId == product.Id
                && x.ModuleName == nameof(StockCount)
                && x.ModuleCode == OpeningStockModuleCode)
            .OrderBy(x => x.CreatedAtUtc)
            .ThenBy(x => x.Id)
            .ToListAsync(cancellationToken);

        var currentOpeningQuantity = history
            .Where(x => x.Status == InventoryTransactionStatus.Confirmed)
            .Sum(x => x.Stock ?? 0m);
        var delta = quantity - currentOpeningQuantity;
        if (Math.Abs(delta) <= QuantityTolerance)
        {
            return;
        }
        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new InvalidOperationException(
                "Người xác nhận là bắt buộc khi ghi nhận hoặc hiệu chỉnh tồn đầu kỳ.");
        }

        if (trackingMode != SerialTrackingMode.None && history.Count > 0)
        {
            throw new InvalidOperationException(
                "Tồn đầu kỳ của hàng có serial không được hiệu chỉnh trong danh mục hàng hóa.");
        }

        var firstHistory = history.FirstOrDefault();
        var warehouseId = firstHistory?.WarehouseId ?? product.DefaultWarehouseId;
        if (string.IsNullOrWhiteSpace(warehouseId))
        {
            throw new InvalidOperationException("Cần chọn kho mặc định trước khi nhập tồn đầu kỳ.");
        }

        var warehouse = await _warehouseRepository.GetQuery()
            .SingleOrDefaultAsync(x => !x.IsDeleted && x.Id == warehouseId, cancellationToken);
        if (warehouse == null || warehouse.SystemWarehouse == true)
        {
            throw new InvalidOperationException("Kho tồn đầu kỳ phải là một kho hàng đang hoạt động, không phải kho hệ thống.");
        }

        var openingUnitCost = firstHistory?.UnitCost ?? product.CostPrice;
        if (!openingUnitCost.HasValue || openingUnitCost.Value < 0m)
        {
            throw new InvalidOperationException(
                "Cần nhập giá vốn không âm trước khi ghi nhận tồn đầu kỳ.");
        }

        var currentStock = await _inventoryTransactionRepository.GetQuery()
            .Where(x => !x.IsDeleted
                && x.Status == InventoryTransactionStatus.Confirmed
                && x.ProductId == product.Id
                && x.WarehouseId == warehouseId)
            .SumAsync(x => x.Stock ?? 0m, cancellationToken);
        var countedStock = currentStock + delta;
        if (countedStock < -QuantityTolerance)
        {
            throw new InvalidOperationException(
                $"Không thể giảm tồn đầu kỳ vì tồn thực tế tại kho chỉ còn {currentStock}.");
        }
        if (Math.Abs(countedStock) <= QuantityTolerance)
        {
            countedStock = 0m;
        }

        var stockCountWarehouse = await _warehouseRepository.GetQuery()
            .SingleOrDefaultAsync(x => !x.IsDeleted
                && x.SystemWarehouse == true
                && x.Name == nameof(StockCount), cancellationToken)
            ?? throw new InvalidOperationException("Không tìm thấy kho hệ thống StockCount.");

        var now = AppDateTime.VietnamNow();
        var stockCount = new StockCount
        {
            CreatedById = userId,
            UpdatedById = userId,
            Number = _numberSequenceService.GenerateNumber(nameof(StockCount), string.Empty, "SC"),
            CountDate = now,
            Status = StockCountStatus.Confirmed,
            Description = $"Tồn đầu kỳ từ danh mục hàng hóa: {product.Name}",
            WarehouseId = warehouseId
        };
        await _stockCountRepository.CreateAsync(stockCount, cancellationToken);

        var transaction = new InventoryTransaction
        {
            CreatedById = userId,
            UpdatedById = userId,
            Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), string.Empty, "IVT"),
            ModuleId = stockCount.Id,
            ModuleName = nameof(StockCount),
            ModuleCode = OpeningStockModuleCode,
            ModuleNumber = stockCount.Number,
            MovementDate = now,
            Status = InventoryTransactionStatus.Confirmed,
            WarehouseId = warehouseId,
            ProductId = product.Id,
            QtySCSys = currentStock,
            QtySCCount = countedStock,
            QtySCDelta = currentStock - countedStock,
            Movement = Math.Abs(delta),
            TransType = delta > 0m ? InventoryTransType.In : InventoryTransType.Out,
            Stock = delta,
            WarehouseFromId = delta > 0m ? stockCountWarehouse.Id : warehouseId,
            WarehouseToId = delta > 0m ? warehouseId : stockCountWarehouse.Id,
            UnitCost = openingUnitCost.Value
        };
        await _inventoryTransactionRepository.CreateAsync(transaction, cancellationToken);

        if (trackingMode == SerialTrackingMode.InternalAuto)
        {
            await CreateInternalSerialsAsync(
                product,
                transaction,
                Convert.ToInt32(Math.Round(quantity)),
                openingUnitCost.Value,
                stockCountWarehouse.Id,
                warehouseId,
                userId,
                cancellationToken);
        }

        await _unitOfWork.SaveAsync(cancellationToken);
    }

    public async Task<bool> HasInventoryOrSerialHistoryAsync(
        string productId,
        CancellationToken cancellationToken = default)
    {
        return await _inventoryTransactionRepository.GetQuery()
                .AnyAsync(x => x.ProductId == productId, cancellationToken)
            || await _productSerialRepository.GetQuery()
                .AnyAsync(x => x.ProductId == productId, cancellationToken);
    }

    private async Task CreateInternalSerialsAsync(
        Product product,
        InventoryTransaction transaction,
        int quantity,
        decimal unitCost,
        string stockCountWarehouseId,
        string warehouseId,
        string? userId,
        CancellationToken cancellationToken)
    {
        if (quantity <= 0)
        {
            return;
        }

        var fixedCode = product.InternalSerialFixedCode;
        if (string.IsNullOrWhiteSpace(fixedCode))
        {
            throw new InvalidOperationException("Cần nhập mã cố định trước khi tự sinh mã nội bộ.");
        }

        var serialNumbers = await _productSerialService.GenerateInternalSerialNumbersAsync(
            fixedCode,
            quantity,
            cancellationToken);

        foreach (var serialNumber in serialNumbers)
        {
            var serial = new ProductSerial
            {
                CreatedById = userId,
                ProductId = product.Id,
                InternalSerialNumber = serialNumber,
                ManufacturerSerialNumber = null,
                Status = ProductSerialStatus.InStock,
                CurrentWarehouseId = warehouseId,
                PurchaseOrderItemId = null,
                SupplierWarrantyEndDate = null,
                UnitCost = unitCost
            };
            await _productSerialRepository.CreateAsync(serial, cancellationToken);

            await _productSerialMovementRepository.CreateAsync(new ProductSerialMovement
            {
                CreatedById = userId,
                ProductSerialId = serial.Id,
                InventoryTransactionId = transaction.Id,
                ModuleName = nameof(StockCount),
                ModuleId = transaction.ModuleId,
                ModuleItemId = null,
                FromWarehouseId = stockCountWarehouseId,
                ToWarehouseId = warehouseId,
                MovementDate = transaction.MovementDate,
                Status = ProductSerialStatus.InStock,
                PreviousStatus = ProductSerialStatus.Voided,
                PreviousWarehouseId = null
            }, cancellationToken);
        }
    }
}
