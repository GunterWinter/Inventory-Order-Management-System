using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
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
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly InventoryCostResolver _inventoryCostResolver;
    private readonly ProductSerialService _productSerialService;

    public UpdateMaterialExportHandler(
        ICommandRepository<MaterialExport> materialExportRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<ProductSerial> productSerialRepository,
        ICommandRepository<ProductSerialMovement> movementRepository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService,
        InventoryCostResolver inventoryCostResolver,
        ProductSerialService productSerialService)
    {
        _materialExportRepository = materialExportRepository;
        _inventoryTransactionRepository = inventoryTransactionRepository;
        _productSerialRepository = productSerialRepository;
        _movementRepository = movementRepository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
        _inventoryCostResolver = inventoryCostResolver;
        _productSerialService = productSerialService;
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

                var confirmedLines = await _inventoryTransactionRepository.GetQuery()
                    .ApplyIsDeletedFilter(false)
                    .Where(x => x.ModuleName == nameof(MaterialExport) && x.ModuleId == entity.Id)
                    .ToListAsync(ct);
                var lineIds = confirmedLines.Select(x => x.Id).ToList();
                var serialIdsByLine = requestedStatus == MaterialExportStatus.Draft
                    ? (await _movementRepository.GetQuery()
                        .ApplyIsDeletedFilter(false)
                        .Where(x => x.ReversedAtUtc == null && x.InventoryTransactionId != null
                            && lineIds.Contains(x.InventoryTransactionId))
                        .Select(x => new { x.InventoryTransactionId, x.ProductSerialId })
                        .ToListAsync(ct))
                        .Where(x => !string.IsNullOrWhiteSpace(x.InventoryTransactionId)
                            && !string.IsNullOrWhiteSpace(x.ProductSerialId))
                        .GroupBy(x => x.InventoryTransactionId!)
                        .ToDictionary(
                            x => x.Key,
                            x => (IReadOnlyCollection<string>)x.Select(y => y.ProductSerialId!)
                                .Distinct(StringComparer.OrdinalIgnoreCase)
                                .ToList())
                    : new Dictionary<string, IReadOnlyCollection<string>>();
                foreach (var line in confirmedLines)
                {
                    await _productSerialService.ReleaseInventoryTransactionSerialsAsync(line.Id, request.UpdatedById, ct);
                    await _inventoryTransactionService.DeleteCostAllocationsAsync(line.Id, request.UpdatedById, ct);
                    line.Status = requestedStatus == MaterialExportStatus.Draft
                        ? InventoryTransactionStatus.Draft
                        : InventoryTransactionStatus.Cancelled;
                    line.UpdatedById = request.UpdatedById;
                    _inventoryTransactionRepository.Update(line);
                }
                await _unitOfWork.SaveAsync(ct);
                if (requestedStatus == MaterialExportStatus.Draft)
                {
                    foreach (var line in confirmedLines)
                    {
                        if (serialIdsByLine.TryGetValue(line.Id, out var serialIds) && serialIds.Count > 0)
                        {
                            await _productSerialService.ApplyInventoryTransactionSerialsAsync(
                                line, serialIds, request.UpdatedById, ct);
                        }
                    }
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
            var selectedAcrossDocument = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

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

                    var costResolution = await _inventoryCostResolver.ResolveFifoAsync(
                        line.ProductId,
                        entity.WarehouseId,
                        movement,
                        entity.ExportDate,
                        line.Id,
                        ct);
                    line.UnitCost = costResolution.UnitCost;

                    line.Status = InventoryTransactionStatus.Confirmed;
                    line.WarehouseId = entity.WarehouseId;
                    line.MovementDate = entity.ExportDate;
                    line.UpdatedById = request.UpdatedById;
                    _inventoryTransactionService.CalculateInvenTrans(line);
                    _inventoryTransactionRepository.Update(line);
                    await _unitOfWork.SaveAsync(ct);
                    await _inventoryTransactionService.ReplaceFifoCostAllocationsAsync(
                        line,
                        costResolution.Slices,
                        request.UpdatedById,
                        entity.Id,
                        ct);
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
                }

                line.UnitCost = AccountingMath.RoundVnd(lineTotalCost / required);
                line.Status = InventoryTransactionStatus.Confirmed;
                line.WarehouseId = entity.WarehouseId;
                line.MovementDate = entity.ExportDate;
                line.UpdatedById = request.UpdatedById;
                _inventoryTransactionService.CalculateInvenTrans(line);
                _inventoryTransactionRepository.Update(line);
                await _unitOfWork.SaveAsync(ct);

                await _inventoryTransactionService.ReplaceSerialCostAllocationsAsync(
                    line,
                    selectedSerials,
                    request.UpdatedById,
                    entity.Id,
                    ct);

                await _productSerialService.ApplyInventoryTransactionSerialsAsync(
                    line,
                    selectedSerials.Select(x => x.Id).ToList(),
                    request.UpdatedById,
                    ct);
            }

            entity.Status = MaterialExportStatus.Confirmed;
            _materialExportRepository.Update(entity);
            await _unitOfWork.SaveAsync(ct);
        }, cancellationToken);

        return new UpdateMaterialExportResult { Data = entity };
    }
}
