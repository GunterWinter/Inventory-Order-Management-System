using Application.Common.Repositories;
using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
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
    private readonly ICommandRepository<MaterialExport> _repository;
    private readonly ICommandRepository<ProductSerial> _productSerialRepository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly NumberSequenceService _numberSequenceService;

    public UpdateMaterialExportHandler(
        ICommandRepository<MaterialExport> repository,
        ICommandRepository<ProductSerial> productSerialRepository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService,
        NumberSequenceService numberSequenceService
        )
    {
        _repository = repository;
        _productSerialRepository = productSerialRepository;
        _cashTransactionRepository = cashTransactionRepository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
        _numberSequenceService = numberSequenceService;
    }

    public async Task<UpdateMaterialExportResult> Handle(UpdateMaterialExportRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        entity.UpdatedById = request.UpdatedById;
        entity.ExportDate = request.MaterialExportDate;
        entity.WarehouseId = request.WarehouseId;
        entity.CustomerId = request.CustomerId;
        entity.Status = (MaterialExportStatus)int.Parse(request.Status!);
        entity.Description = request.Description;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        // When confirmed: deduct stock directly, pick serials FIFO, create offset CashTransactions
        if (entity.Status == MaterialExportStatus.Confirmed)
        {
            await ProcessConfirmedExport(entity, request.UpdatedById, cancellationToken);
        }

        return new UpdateMaterialExportResult
        {
            Data = entity
        };
    }

    private async Task ProcessConfirmedExport(MaterialExport entity, string? userId, CancellationToken cancellationToken)
    {
        // 1. Fetch dummy InventoryTransaction items added by the frontend
        var items = await _queryContext.Set<InventoryTransaction>()
            .Where(x => x.ModuleId == entity.Id && x.ModuleName == "MaterialExport" && !x.IsDeleted)
            .ToListAsync(cancellationToken);

        if (!items.Any())
        {
            return;
        }

        // Track which POs are affected for Debit/Credit offset
        // Key: PurchaseOrderId, Value: total cost to offset from Kho
        var poOffsetCosts = new Dictionary<string, double>();

        foreach (var item in items)
        {
            var quantity = (int)(item.Movement ?? 0);
            if (quantity <= 0) continue;

            // 2. Pick serials — Check if user already selected serials (manual pick)
            var existingMovements = await _queryContext.Set<ProductSerialMovement>()
                .AsNoTracking()
                .Where(x => x.InventoryTransactionId == item.Id)
                .Select(x => x.ProductSerialId)
                .Where(x => x != null)
                .ToListAsync(cancellationToken);

            List<string> selectedSerialIds;

            if (existingMovements.Count >= quantity)
            {
                // User already picked serials manually via Serial Picker
                selectedSerialIds = existingMovements.Take(quantity).ToList()!;
            }
            else
            {
                // FIFO auto-pick: oldest InStock serials in this warehouse
                selectedSerialIds = await _queryContext.Set<ProductSerial>()
                    .AsNoTracking()
                    .ApplyIsDeletedFilter(false)
                    .Where(x => x.ProductId == item.ProductId
                             && x.CurrentWarehouseId == entity.WarehouseId
                             && x.Status == ProductSerialStatus.InStock)
                    .OrderBy(x => x.CreatedAtUtc) // FIFO — oldest first
                    .Take(quantity)
                    .Select(x => x.Id!)
                    .ToListAsync(cancellationToken);

                if (selectedSerialIds.Count < quantity)
                {
                    var product = await _queryContext.Set<Product>()
                        .AsNoTracking()
                        .FirstOrDefaultAsync(x => x.Id == item.ProductId, cancellationToken);
                    throw new Exception($"Không đủ tồn kho cho sản phẩm {product?.Name ?? item.ProductId}. Cần {quantity} nhưng chỉ có {selectedSerialIds.Count} serial InStock.");
                }
            }

            // 3. Calculate total cost from serial UnitCost
            var serials = await _queryContext.Set<ProductSerial>()
                .AsNoTracking()
                .Where(x => selectedSerialIds.Contains(x.Id!))
                .ToListAsync(cancellationToken);

            var totalItemCost = serials.Sum(s => s.UnitCost ?? 0);

            // 4. Trace back to PO via serial.PurchaseOrderItemId
            foreach (var serial in serials)
            {
                if (!string.IsNullOrEmpty(serial.PurchaseOrderItemId))
                {
                    var poItem = await _queryContext.Set<PurchaseOrderItem>()
                        .AsNoTracking()
                        .FirstOrDefaultAsync(x => x.Id == serial.PurchaseOrderItemId, cancellationToken);
                    if (poItem != null && !string.IsNullOrEmpty(poItem.PurchaseOrderId))
                    {
                        if (!poOffsetCosts.ContainsKey(poItem.PurchaseOrderId))
                            poOffsetCosts[poItem.PurchaseOrderId] = 0;
                        poOffsetCosts[poItem.PurchaseOrderId] += serial.UnitCost ?? 0;
                    }
                }
            }

            // 5. Create confirmed InventoryTransaction (Out) — deduct stock directly
            await _inventoryTransactionService.MaterialExportCreateInvenTrans(
                moduleId: entity.Id,
                productId: item.ProductId,
                movement: item.Movement,
                warehouseId: entity.WarehouseId,
                createdById: userId,
                cancellationToken: cancellationToken,
                productSerialIds: selectedSerialIds
            );
        }

        // 6. Create Debit/Credit offset CashTransactions per traced PO
        var totalExportCost = poOffsetCosts.Values.Sum();

        foreach (var kvp in poOffsetCosts)
        {
            var purchaseOrderId = kvp.Key;
            var offsetAmount = kvp.Value;

            if (offsetAmount <= 0) continue;

            // Find the Kho CashTransaction for this PO (CustomerId = null, SourceModule = PurchaseOrder)
            var khoTransaction = await _queryContext.Set<CashTransaction>()
                .AsNoTracking()
                .Where(x => !x.IsDeleted
                         && x.SourceModule == nameof(PurchaseOrder)
                         && x.SourceModuleId == purchaseOrderId)
                .FirstOrDefaultAsync(cancellationToken);

            // Phiếu Debit — bù trừ Kho (giảm chi phí Kho)
            var debitTx = new CashTransaction
            {
                CreatedById = userId,
                Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CT"),
                TransactionDate = entity.ExportDate ?? DateTime.Today,
                TransactionType = CashTransactionType.Debit,
                Status = CashTransactionStatus.Paid,
                Amount = offsetAmount,
                PaidAmount = offsetAmount,
                Description = $"Bù trừ Kho - Xuất vật tư {entity.Number}",
                CashAccountId = null,
                CustomerId = null, // Kho
                VendorId = null,
                SourceModule = "MaterialExport",
                SourceModuleId = entity.Id,
                SourceModuleNumber = entity.Number
            };
            await _cashTransactionRepository.CreateAsync(debitTx, cancellationToken);

            // Phiếu Credit — chi cho Khách
            var creditTx = new CashTransaction
            {
                CreatedById = userId,
                Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CT"),
                TransactionDate = entity.ExportDate ?? DateTime.Today,
                TransactionType = CashTransactionType.Credit,
                Status = CashTransactionStatus.Paid,
                Amount = offsetAmount,
                PaidAmount = offsetAmount,
                Description = $"Chi vật tư công trình - {entity.Number}",
                CashAccountId = null,
                CustomerId = entity.CustomerId,
                VendorId = null,
                SourceModule = "MaterialExport",
                SourceModuleId = entity.Id,
                SourceModuleNumber = entity.Number
            };
            await _cashTransactionRepository.CreateAsync(creditTx, cancellationToken);
        }

        await _unitOfWork.SaveAsync(cancellationToken);
    }
}

