using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseReturnManager.Commands;

public class CreatePurchaseReturnResult
{
    public PurchaseReturn? Data { get; set; }
}

public class CreatePurchaseReturnRequest : IRequest<CreatePurchaseReturnResult>
{
    public DateTime? ReturnDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? PurchaseOrderId { get; init; }
    public string? CreatedById { get; init; }
    public bool SkipDefaultItems { get; init; }
}

public class CreatePurchaseReturnValidator : AbstractValidator<CreatePurchaseReturnRequest>
{
    public CreatePurchaseReturnValidator()
    {
        RuleFor(x => x.ReturnDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
    }
}

public class CreatePurchaseReturnHandler : IRequestHandler<CreatePurchaseReturnRequest, CreatePurchaseReturnResult>
{
    private readonly ICommandRepository<PurchaseReturn> _purchaseReturnRepository;
    private readonly ICommandRepository<PurchaseOrder> _purchaseOrderRepository;
    private readonly ICommandRepository<InventoryTransaction> _itemRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public CreatePurchaseReturnHandler(
        ICommandRepository<PurchaseReturn> purchaseReturnRepository,
        ICommandRepository<PurchaseOrder> purchaseOrderRepository,
        ICommandRepository<InventoryTransaction> itemRepository,
        ICommandRepository<Warehouse> warehouseRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _purchaseReturnRepository = purchaseReturnRepository;
        _purchaseOrderRepository = purchaseOrderRepository;
        _itemRepository = itemRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<CreatePurchaseReturnResult> Handle(CreatePurchaseReturnRequest request, CancellationToken cancellationToken = default)
    {
        var hasConfirmedSource = await _purchaseOrderRepository.GetQuery()
            .ApplyIsDeletedFilter(false)
            .AnyAsync(x => x.Id == request.PurchaseOrderId
                && x.OrderStatus == PurchaseOrderStatus.Confirmed, cancellationToken);
        if (!hasConfirmedSource)
            throw new InvalidOperationException("Chỉ được tạo phiếu trả hàng mua từ đơn mua hàng đã xác nhận.");

        var entity = new PurchaseReturn();
        entity.CreatedById = request.CreatedById;

        entity.Number = _numberSequenceService.GenerateNumber(nameof(PurchaseReturn), "", "PRN");
        entity.ReturnDate = request.ReturnDate;
        entity.Status = PurchaseReturnStatus.Draft;
        entity.Description = request.Description;
        entity.PurchaseOrderId = request.PurchaseOrderId;

        await _purchaseReturnRepository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        var items = request.SkipDefaultItems
            ? []
            : await _itemRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleId == entity.PurchaseOrderId && x.ModuleName == nameof(PurchaseOrder))
            .Include(x => x.Product)
            .ToListAsync(cancellationToken);

        foreach (var item in items)
        {
            if (item?.Product?.Physical ?? false)
            {
                await _inventoryTransactionService.PurchaseReturnCreateInvenTrans(
                    entity.Id,
                    item.WarehouseId,
                    item.ProductId,
                    item.Movement,
                    entity.CreatedById,
                    cancellationToken
                    );

            }
        }

        return new CreatePurchaseReturnResult
        {
            Data = entity
        };
    }
}

