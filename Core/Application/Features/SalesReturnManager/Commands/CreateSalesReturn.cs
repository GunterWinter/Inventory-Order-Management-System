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
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;

    public CreateSalesReturnHandler(
        ICommandRepository<SalesReturn> SalesOrderRepository,
        ICommandRepository<SalesOrder> sourceSalesOrderRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService
        )
    {
        _SalesOrderRepository = SalesOrderRepository;
        _sourceSalesOrderRepository = sourceSalesOrderRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
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
        entity.Status = SalesReturnStatus.Draft;
        entity.Description = request.Description;
        entity.SalesOrderId = request.SalesOrderId;

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            await _SalesOrderRepository.CreateAsync(entity, ct);
            await _unitOfWork.SaveAsync(ct);
        }, cancellationToken);

        return new CreateSalesReturnResult
        {
            Data = entity
        };
    }
}

