using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductSerialManager;
using Domain.Entities;
using Domain.Enums;
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
    private readonly ProductSerialService _productSerialService;
    private readonly NumberSequenceService _numberSequenceService;

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
        ProductSerialService productSerialService,
        NumberSequenceService numberSequenceService)
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
        _productSerialService = productSerialService;
        _numberSequenceService = numberSequenceService;
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
        if (requestedStatus is not MaterialExportStatus.Draft and not MaterialExportStatus.Confirmed)
        {
            throw new InvalidOperationException("Material exports can only be saved as Draft or Confirmed.");
        }

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
            if (entity.Status != MaterialExportStatus.Draft)
            {
                throw new InvalidOperationException("Only draft material exports can be updated or confirmed.");
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
                throw new InvalidOperationException("Remove all material export lines before changing the warehouse.");
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
                throw new InvalidOperationException("Add at least one product before confirming the material export.");
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
            var purchaseOrderCosts = new Dictionary<string, double>(StringComparer.OrdinalIgnoreCase);

            foreach (var line in lines)
            {
                if (line.Status != InventoryTransactionStatus.Draft)
                {
                    throw new InvalidOperationException("All material export lines must be Draft before confirmation.");
                }
                if (line.Product?.SerialTrackingMode == SerialTrackingMode.None)
                {
                    throw new InvalidOperationException("Material exports require serial-tracked products.");
                }

                var movement = line.Movement ?? 0d;
                if (movement <= 0d || Math.Abs(movement - Math.Round(movement)) > 0.000001d)
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
                        .Where(x => manualIds.Contains(x.Id))
                        .ToListAsync(ct);
                }
                else
                {
                    var alreadySelectedIds = selectedAcrossDocument.ToList();
                    selectedSerials = await _productSerialRepository.GetQuery()
                        .ApplyIsDeletedFilter(false)
                        .Include(x => x.PurchaseOrderItem)
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
                    if (serial.UnitCost == null)
                    {
                        throw new InvalidOperationException($"Serial {serial.InternalSerialNumber} does not have a unit cost.");
                    }
                    if (string.IsNullOrWhiteSpace(serial.PurchaseOrderItem?.PurchaseOrderId))
                    {
                        throw new InvalidOperationException($"Serial {serial.InternalSerialNumber} is not linked to a purchase order.");
                    }

                    var purchaseOrderId = serial.PurchaseOrderItem.PurchaseOrderId;
                    purchaseOrderCosts[purchaseOrderId] =
                        purchaseOrderCosts.GetValueOrDefault(purchaseOrderId) + serial.UnitCost.Value;
                }

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

            foreach (var pair in purchaseOrderCosts.Where(x => x.Value > 0d))
            {
                await CreateProjectCostTransactionAsync(
                    entity,
                    pair.Key,
                    pair.Value,
                    projectAllocationCategory.Id,
                    $"Phân bổ công trình cho {selectedCustomer.Name}",
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
        string purchaseOrderId,
        double amount,
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
            Status = CashTransactionStatus.Paid,
            Amount = amount,
            PaidAmount = amount,
            Description = description,
            CashAccountId = null,
            CashCategoryId = cashCategoryId,
            CustomerId = materialExport.CustomerId,
            VendorId = null,
            SourceModule = nameof(MaterialExport),
            SourceModuleId = materialExport.Id,
            SourceDetailId = purchaseOrderId,
            SourceModuleNumber = materialExport.Number
        }, cancellationToken);
    }
}
