using Application.Common.Extensions;
using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductSerialManager;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.MaterialExportManager.Commands;

public class UpdateMaterialExportResult
{
    public MaterialExport? Data { get; set; }
}

public class UpdateMaterialExportRequest : IRequest<UpdateMaterialExportResult>
{
    public string? Id { get; init; }
    public DateTime? MaterialExportDate { get; init; }
    public string? WarehouseId { get; init; }
    public string? CustomerId { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateMaterialExportValidator : AbstractValidator<UpdateMaterialExportRequest>
{
    public UpdateMaterialExportValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.MaterialExportDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.WarehouseId).NotEmpty();
        RuleFor(x => x.CustomerId).NotEmpty();
    }
}

public class UpdateMaterialExportHandler : IRequestHandler<UpdateMaterialExportRequest, UpdateMaterialExportResult>
{
    private readonly ICommandRepository<MaterialExport> _materialExportRepository;
    private readonly ICommandRepository<InventoryTransaction> _inventoryTransactionRepository;
    private readonly ICommandRepository<ProductSerial> _productSerialRepository;
    private readonly ICommandRepository<ProductSerialMovement> _movementRepository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly ICommandRepository<CashCategory> _cashCategoryRepository;
    private readonly ICommandRepository<Customer> _customerRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly InventoryCostResolver _inventoryCostResolver;
    private readonly ProductSerialService _productSerialService;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly IQueryContext _queryContext;

    public UpdateMaterialExportHandler(
        ICommandRepository<MaterialExport> materialExportRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<ProductSerial> productSerialRepository,
        ICommandRepository<ProductSerialMovement> movementRepository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<CashCategory> cashCategoryRepository,
        ICommandRepository<Customer> customerRepository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService,
        InventoryCostResolver inventoryCostResolver,
        ProductSerialService productSerialService,
        NumberSequenceService numberSequenceService,
        IQueryContext queryContext)
    {
        _materialExportRepository = materialExportRepository;
        _inventoryTransactionRepository = inventoryTransactionRepository;
        _productSerialRepository = productSerialRepository;
        _movementRepository = movementRepository;
        _cashTransactionRepository = cashTransactionRepository;
        _cashCategoryRepository = cashCategoryRepository;
        _customerRepository = customerRepository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
        _inventoryCostResolver = inventoryCostResolver;
        _productSerialService = productSerialService;
        _numberSequenceService = numberSequenceService;
        _queryContext = queryContext;
    }

    public async Task<UpdateMaterialExportResult> Handle(
        UpdateMaterialExportRequest request,
        CancellationToken cancellationToken)
    {
        if (!int.TryParse(request.Status, out var statusValue)
            || !Enum.IsDefined(typeof(MaterialExportStatus), statusValue))
        {
            throw new InvalidOperationException("Invalid material export status.");
        }

        var requestedStatus = (MaterialExportStatus)statusValue;
        DocumentDateGuard.EnsureCanPost(request.MaterialExportDate, requestedStatus == MaterialExportStatus.Confirmed);
        MaterialExport? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _materialExportRepository.GetQuery()
                .ApplyIsDeletedFilter(false)
                .Include(x => x.Customer)
                .SingleOrDefaultAsync(x => x.Id == request.Id, ct);
            if (entity == null)
            {
                throw new InvalidOperationException($"Material export was not found: {request.Id}");
            }
            if (entity.Status == MaterialExportStatus.Confirmed
                && requestedStatus is MaterialExportStatus.Draft or MaterialExportStatus.Cancelled or MaterialExportStatus.Archived)
            {
                var headerChanged = entity.ExportDate != request.MaterialExportDate
                    || entity.WarehouseId != request.WarehouseId
                    || entity.CustomerId != request.CustomerId
                    || entity.Description != request.Description;
                if (headerChanged)
                    throw new InvalidOperationException("Phiếu xuất vật tư đã xác nhận không được sửa nội dung; chỉ có thể Hủy hoặc Lưu trữ.");

                if (requestedStatus == MaterialExportStatus.Archived)
                {
                    entity.Status = MaterialExportStatus.Archived;
                    entity.UpdatedById = request.UpdatedById;
                    _materialExportRepository.Update(entity);
                    await _unitOfWork.SaveAsync(ct);
                    return;
                }

                var sourceTransactions = await _cashTransactionRepository.GetQuery()
                    .ApplyIsDeletedFilter(false)
                    .Where(x => x.SourceModule == nameof(MaterialExport) && x.SourceModuleId == entity.Id)
                    .ToListAsync(ct);
                var sourceTransactionIds = sourceTransactions.Select(x => x.Id).ToList();
                var hasPayment = sourceTransactions.Any(x => (x.PaidAmount ?? 0m) > 0m)
                    || await _queryContext.Set<CashTransactionPayment>().AsNoTracking()
                        .AnyAsync(x => !x.IsDeleted && sourceTransactionIds.Contains(x.CashTransactionId) && x.Amount != 0m, ct);
                if (hasPayment)
                    throw new InvalidOperationException($"Không thể chuyển phiếu xuất vật tư {entity.Number} về Nháp hoặc Hủy vì giao dịch chi phí đã có thanh toán. Hãy hoàn tác thanh toán trước.");

                var confirmedLines = await _inventoryTransactionRepository.GetQuery()
                    .ApplyIsDeletedFilter(false)
                    .Where(x => x.ModuleName == nameof(MaterialExport) && x.ModuleId == entity.Id)
                    .ToListAsync(ct);
                foreach (var line in confirmedLines)
                {
                    await _productSerialService.ReleaseInventoryTransactionSerialsAsync(line.Id, request.UpdatedById, ct);
                    line.Status = requestedStatus == MaterialExportStatus.Draft
                        ? InventoryTransactionStatus.Draft
                        : InventoryTransactionStatus.Cancelled;
                    line.UpdatedById = request.UpdatedById;
                    _inventoryTransactionRepository.Update(line);
                }
                foreach (var sourceTransaction in sourceTransactions)
                {
                    sourceTransaction.UpdatedById = request.UpdatedById;
                    _cashTransactionRepository.Delete(sourceTransaction);
                }
                entity.Status = requestedStatus;
                entity.UpdatedById = request.UpdatedById;
                _materialExportRepository.Update(entity);
                await _unitOfWork.SaveAsync(ct);
                return;
            }

            if (entity.Status != MaterialExportStatus.Draft)
            {
                throw new InvalidOperationException("Phiếu xuất vật tư đã xác nhận phải chuyển về Nháp trước khi sửa nội dung; phiếu đã Hủy/Lưu trữ không thể sửa.");
            }
            if (requestedStatus is MaterialExportStatus.Cancelled or MaterialExportStatus.Archived)
            {
                throw new InvalidOperationException("Phiếu xuất vật tư Nháp phải được xóa hoặc xác nhận; không thể chuyển thẳng sang Hủy/Lưu trữ.");
            }

            var lines = await _inventoryTransactionRepository.GetQuery()
                .ApplyIsDeletedFilter(false)
                .Include(x => x.Product)
                .Where(x => x.ModuleName == nameof(MaterialExport) && x.ModuleId == entity.Id)
                .OrderBy(x => x.CreatedAtUtc)
                .ThenBy(x => x.Id)
                .ToListAsync(ct);

            if (lines.Count > 0
                && !string.Equals(entity.WarehouseId, request.WarehouseId, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Hãy xóa hết dòng hàng trước khi đổi kho của phiếu xuất vật tư.");
            }

            entity.ExportDate = request.MaterialExportDate;
            entity.WarehouseId = request.WarehouseId;
            entity.CustomerId = request.CustomerId;
            entity.Description = request.Description;
            entity.UpdatedById = request.UpdatedById;

            if (requestedStatus == MaterialExportStatus.Draft)
            {
                _materialExportRepository.Update(entity);
                await _unitOfWork.SaveAsync(ct);
                return;
            }

            if (lines.Count == 0)
            {
                throw new InvalidOperationException("Cần thêm ít nhất một hàng hóa trước khi xác nhận phiếu xuất vật tư.");
            }
            var selectedCustomer = await _customerRepository.GetQuery()
                .ApplyIsDeletedFilter(false)
                .SingleOrDefaultAsync(x => x.Id == request.CustomerId, ct);
            if (selectedCustomer == null || string.IsNullOrWhiteSpace(selectedCustomer.Name))
            {
                throw new InvalidOperationException("The selected customer could not be found.");
            }

            var existingOffsets = await _cashTransactionRepository.GetQuery()
                .AnyAsync(x => !x.IsDeleted
                    && x.SourceModule == nameof(MaterialExport)
                    && x.SourceModuleId == entity.Id, ct);
            if (existingOffsets)
            {
                throw new InvalidOperationException("Cash transactions already exist for this material export.");
            }

            var selectedAcrossDocument = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var totalProjectCost = 0m;
            var hasFallbackCost = false;
            var hasOpeningCost = false;
            var hasPurchaseCost = false;

            foreach (var line in lines)
            {
                if (line.Status != InventoryTransactionStatus.Draft)
                {
                    throw new InvalidOperationException("All material export lines must be Draft before confirmation.");
                }
                var movement = line.Movement ?? 0m;
                if (line.Product?.Physical != true || movement <= 0m)
                {
                    throw new InvalidOperationException("Material exports require a physical product and a positive quantity.");
                }

                if ((line.Product.SerialTrackingMode ?? SerialTrackingMode.None) == SerialTrackingMode.None)
                {
                    var availableStock = await _inventoryTransactionRepository.GetQuery()
                        .Where(x => !x.IsDeleted
                            && x.ProductId == line.ProductId
                            && x.WarehouseId == entity.WarehouseId
                            && x.Status == InventoryTransactionStatus.Confirmed)
                        .SumAsync(x => x.Stock ?? 0m, ct);
                    if (movement > availableStock + 0.000001m)
                        throw new InvalidOperationException($"Not enough stock for {line.Product.Name}. Available: {availableStock}.");

                    var costResolution = await _inventoryCostResolver.ResolveMaterialExportFifoAsync(
                        line.ProductId,
                        entity.WarehouseId,
                        movement,
                        ct);
                    var resolvedUnitCost = AccountingMath.RoundVnd(costResolution.UnitCost);
                    line.UnitCost = resolvedUnitCost;
                    totalProjectCost += AccountingMath.RoundVnd(resolvedUnitCost * movement);
                    hasFallbackCost |= costResolution.IsFallbackCost;
                    hasOpeningCost |= costResolution.IncludesOpeningStock;
                    hasPurchaseCost |= costResolution.IncludesPurchase;

                    line.Status = InventoryTransactionStatus.Confirmed;
                    line.WarehouseId = entity.WarehouseId;
                    line.MovementDate = entity.ExportDate;
                    line.UpdatedById = request.UpdatedById;
                    _inventoryTransactionService.CalculateInvenTrans(line);
                    _inventoryTransactionRepository.Update(line);
                    await _unitOfWork.SaveAsync(ct);
                    continue;
                }

                if (Math.Abs(movement - Math.Round(movement)) > 0.000001m)
                {
                    throw new InvalidOperationException("Material export quantity must be a positive whole number.");
                }
                var required = Convert.ToInt32(Math.Round(movement));

                var manualIds = await _movementRepository.GetQuery()
                    .Where(x => !x.IsDeleted && x.InventoryTransactionId == line.Id)
                    .OrderBy(x => x.CreatedAtUtc)
                    .Select(x => x.ProductSerialId!)
                    .ToListAsync(ct);

                if (manualIds.Count > 0 && manualIds.Count != required)
                {
                    throw new InvalidOperationException("The selected serial count must match the material export quantity.");
                }

                List<ProductSerial> selectedSerials;
                if (manualIds.Count > 0)
                {
                    selectedSerials = await _productSerialRepository.GetQuery()
                        .ApplyIsDeletedFilter(false)
                        .Include(x => x.PurchaseOrderItem)
                        .Include(x => x.Product)
                        .Where(x => manualIds.Contains(x.Id))
                        .ToListAsync(ct);
                }
                else
                {
                    var alreadySelectedIds = selectedAcrossDocument.ToList();
                    selectedSerials = await _productSerialRepository.GetQuery()
                        .ApplyIsDeletedFilter(false)
                        .Include(x => x.PurchaseOrderItem)
                        .Include(x => x.Product)
                        .Where(x => x.ProductId == line.ProductId
                            && x.CurrentWarehouseId == entity.WarehouseId
                            && x.Status == ProductSerialStatus.InStock
                            && !alreadySelectedIds.Contains(x.Id))
                        .OrderBy(x => x.CreatedAtUtc)
                        .ThenBy(x => x.Id)
                        .Take(required)
                        .ToListAsync(ct);
                }

                if (selectedSerials.Count != required)
                {
                    throw new InvalidOperationException(
                        $"Not enough in-stock serials for {line.Product?.Name ?? line.ProductId}. Required {required}, available {selectedSerials.Count}.");
                }

                var lineTotalCost = 0m;
                foreach (var serial in selectedSerials)
                {
                    if (!selectedAcrossDocument.Add(serial.Id))
                    {
                        throw new InvalidOperationException("The same serial cannot be exported more than once.");
                    }
                    if (serial.ProductId != line.ProductId
                        || serial.CurrentWarehouseId != entity.WarehouseId
                        || (serial.Status != ProductSerialStatus.InStock && serial.Status != ProductSerialStatus.Reserved))
                    {
                        throw new InvalidOperationException("A selected serial is no longer available in the selected warehouse.");
                    }
                    var serialCost = _inventoryCostResolver.ResolveSerial(serial);
                    lineTotalCost += serialCost.UnitCost;
                    hasFallbackCost |= serialCost.SourceKey.StartsWith("FALLBACK:", StringComparison.Ordinal);
                    hasOpeningCost |= serialCost.SourceKey.StartsWith("OPENING:", StringComparison.Ordinal);
                    hasPurchaseCost |= !serialCost.SourceKey.StartsWith("FALLBACK:", StringComparison.Ordinal)
                        && !serialCost.SourceKey.StartsWith("OPENING:", StringComparison.Ordinal);
                }

                line.UnitCost = AccountingMath.RoundVnd(lineTotalCost / required);
                totalProjectCost += AccountingMath.RoundVnd(line.UnitCost.Value * required);
                line.Status = InventoryTransactionStatus.Confirmed;
                line.WarehouseId = entity.WarehouseId;
                line.MovementDate = entity.ExportDate;
                line.UpdatedById = request.UpdatedById;
                _inventoryTransactionService.CalculateInvenTrans(line);
                _inventoryTransactionRepository.Update(line);
                await _unitOfWork.SaveAsync(ct);

                await _productSerialService.ApplyInventoryTransactionSerialsAsync(
                    line,
                    selectedSerials.Select(x => x.Id).ToList(),
                    request.UpdatedById,
                    ct);
            }

            const string projectAllocationCategoryName = "Phân bổ công trình";
            var projectAllocationCategory = await _cashCategoryRepository.GetQuery()
                .ApplyIsDeletedFilter(false)
                .OrderBy(x => x.CreatedAtUtc)
                .ThenBy(x => x.Id)
                .FirstOrDefaultAsync(x => x.Name == projectAllocationCategoryName, ct);
            if (projectAllocationCategory == null)
            {
                projectAllocationCategory = new CashCategory
                {
                    CreatedById = request.UpdatedById,
                    Name = projectAllocationCategoryName,
                    Description = "Chi phí vật tư phân bổ cho công trình"
                };
                await _cashCategoryRepository.CreateAsync(projectAllocationCategory, ct);
                await _unitOfWork.SaveAsync(ct);
            }

            if (totalProjectCost > 0m)
            {
                var costDescription = hasFallbackCost
                    ? $"Phân bổ công trình cho {selectedCustomer.Name} (giá vốn hàng hóa dự phòng)"
                    : hasOpeningCost && !hasPurchaseCost
                        ? $"Phân bổ công trình cho {selectedCustomer.Name} (giá vốn tồn đầu kỳ)"
                        : $"Phân bổ công trình cho {selectedCustomer.Name}";
                await CreateProjectCostTransactionAsync(
                    entity,
                    totalProjectCost,
                    projectAllocationCategory.Id,
                    costDescription,
                    request.UpdatedById,
                    ct);
            }

            entity.Status = MaterialExportStatus.Confirmed;
            _materialExportRepository.Update(entity);
            await _unitOfWork.SaveAsync(ct);
        }, cancellationToken);

        return new UpdateMaterialExportResult { Data = entity };
    }

    private async Task CreateProjectCostTransactionAsync(
        MaterialExport materialExport,
        decimal amount,
        string cashCategoryId,
        string description,
        string? userId,
        CancellationToken cancellationToken)
    {
        await _cashTransactionRepository.CreateAsync(new CashTransaction
        {
            CreatedById = userId,
            Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CT"),
            TransactionDate = materialExport.ExportDate ?? DateTime.Today,
            TransactionType = CashTransactionType.Credit,
            Status = CashTransactionStatus.Unpaid,
            Amount = amount,
            PaidAmount = 0m,
            Description = description,
            CashAccountId = null,
            CashCategoryId = cashCategoryId,
            CustomerId = materialExport.CustomerId,
            VendorId = null,
            SourceModule = nameof(MaterialExport),
            SourceModuleId = materialExport.Id,
            SourceDetailId = null,
            SourceModuleNumber = materialExport.Number
        }, cancellationToken);
    }
}
