using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesReturnManager.Commands;

public class CreateSalesReturnResult
{
    public SalesReturn? Data { get; set; }
}

public class CreateSalesReturnRequest : IRequest<CreateSalesReturnResult>
{
    public DateTime? ReturnDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? SalesOrderId { get; init; }
    public string? CreatedById { get; init; }
    public bool SkipDefaultItems { get; init; }
}

public class CreateSalesReturnValidator : AbstractValidator<CreateSalesReturnRequest>
{
    public CreateSalesReturnValidator()
    {
        RuleFor(x => x.ReturnDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.SalesOrderId).NotEmpty();
    }
}

public class CreateSalesReturnHandler : IRequestHandler<CreateSalesReturnRequest, CreateSalesReturnResult>
{
    private readonly ICommandRepository<SalesReturn> _SalesOrderRepository;
    private readonly ICommandRepository<SalesOrder> _sourceSalesOrderRepository;
    private readonly ICommandRepository<InventoryTransaction> _itemRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public CreateSalesReturnHandler(
        ICommandRepository<SalesReturn> SalesOrderRepository,
        ICommandRepository<SalesOrder> sourceSalesOrderRepository,
        ICommandRepository<InventoryTransaction> itemRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _SalesOrderRepository = SalesOrderRepository;
        _sourceSalesOrderRepository = sourceSalesOrderRepository;
        _itemRepository = itemRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<CreateSalesReturnResult> Handle(CreateSalesReturnRequest request, CancellationToken cancellationToken = default)
    {
        var hasConfirmedSource = await _sourceSalesOrderRepository.GetQuery()
            .ApplyIsDeletedFilter(false)
            .AnyAsync(x => x.Id == request.SalesOrderId
                && x.OrderStatus == SalesOrderStatus.Confirmed, cancellationToken);
        if (!hasConfirmedSource)
            throw new InvalidOperationException("Chỉ được tạo phiếu hàng bán trả lại từ đơn bán hàng đã xác nhận.");

        var entity = new SalesReturn();
        entity.CreatedById = request.CreatedById;

        entity.Number = _numberSequenceService.GenerateNumber(nameof(SalesReturn), "", "SRN");
        entity.ReturnDate = request.ReturnDate;
        entity.Status = (SalesReturnStatus)int.Parse(request.Status!);
        entity.Description = request.Description;
        entity.SalesOrderId = request.SalesOrderId;

        await _SalesOrderRepository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        var items = request.SkipDefaultItems
            ? []
            : await _itemRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleId == entity.SalesOrderId && x.ModuleName == nameof(SalesOrder))
            .Include(x => x.Product)
            .ToListAsync(cancellationToken);

        foreach (var item in items)
        {
            if (item?.Product?.Physical ?? false)
            {
                await _inventoryTransactionService.SalesReturnCreateInvenTrans(
                    entity.Id,
                    item.WarehouseId,
                    item.ProductId,
                    item.Movement,
                    entity.CreatedById,
                    cancellationToken
                    );

            }
        }

        return new CreateSalesReturnResult
        {
            Data = entity
        };
    }
}

