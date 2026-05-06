using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.GoodsReceiveManager.Commands;

public class CreateGoodsReceiveResult
{
    public GoodsReceive? Data { get; set; }
}

public class CreateGoodsReceiveRequest : IRequest<CreateGoodsReceiveResult>
{
    public DateTime? ReceiveDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? PurchaseOrderId { get; init; }
    public string? CreatedById { get; init; }
}

public class CreateGoodsReceiveValidator : AbstractValidator<CreateGoodsReceiveRequest>
{
    public CreateGoodsReceiveValidator()
    {
        RuleFor(x => x.ReceiveDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
    }
}

public class CreateGoodsReceiveHandler : IRequestHandler<CreateGoodsReceiveRequest, CreateGoodsReceiveResult>
{
    private readonly ICommandRepository<GoodsReceive> _goodsReceiveRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IQueryContext _queryContext;

    public CreateGoodsReceiveHandler(
        ICommandRepository<GoodsReceive> goodsReceiveRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        InventoryTransactionService inventoryTransactionService,
        IQueryContext queryContext
        )
    {
        _goodsReceiveRepository = goodsReceiveRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _inventoryTransactionService = inventoryTransactionService;
        _queryContext = queryContext;
    }

    public async Task<CreateGoodsReceiveResult> Handle(CreateGoodsReceiveRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new GoodsReceive();
        entity.CreatedById = request.CreatedById;

        entity.Number = _numberSequenceService.GenerateNumber(nameof(GoodsReceive), "", "GR");
        entity.ReceiveDate = request.ReceiveDate;
        entity.Status = (GoodsReceiveStatus)int.Parse(request.Status!);
        entity.Description = request.Description;
        entity.PurchaseOrderId = request.PurchaseOrderId;

        await _goodsReceiveRepository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        var items = await _queryContext
            .Set<PurchaseOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Where(x =>
                x.PurchaseOrderId == entity.PurchaseOrderId &&
                x.Product != null &&
                x.Product.Physical == true &&
                !string.IsNullOrWhiteSpace(x.WarehouseId))
            .ToListAsync(cancellationToken);

        foreach (var item in items)
        {
            var inventoryTransaction = await _inventoryTransactionService.GoodsReceiveCreateInvenTrans(
                entity.Id,
                item.WarehouseId,
                item.ProductId,
                item.Quantity,
                entity.CreatedById,
                item.Id,
                item.BatchNumber,
                cancellationToken
            );

        }

        return new CreateGoodsReceiveResult
        {
            Data = entity
        };
    }
}
