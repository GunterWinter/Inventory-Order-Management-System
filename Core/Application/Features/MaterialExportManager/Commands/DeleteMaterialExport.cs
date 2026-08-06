using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.MaterialExportManager.Commands;

public class DeleteMaterialExportResult
{
    public MaterialExport? Data { get; set; }
}

public class DeleteMaterialExportRequest : IRequest<DeleteMaterialExportResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteMaterialExportValidator : AbstractValidator<DeleteMaterialExportRequest>
{
    public DeleteMaterialExportValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteMaterialExportHandler : IRequestHandler<DeleteMaterialExportRequest, DeleteMaterialExportResult>
{
    private readonly ICommandRepository<MaterialExport> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly ICommandRepository<InventoryTransaction> _inventoryTransactionRepository;

    public DeleteMaterialExportHandler(
        ICommandRepository<MaterialExport> repository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _repository = repository;
        _inventoryTransactionRepository = inventoryTransactionRepository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<DeleteMaterialExportResult> Handle(DeleteMaterialExportRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        if (entity.Status != MaterialExportStatus.Draft)
        {
            throw new InvalidOperationException("Only draft material exports can be deleted.");
        }

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            var lines = await _inventoryTransactionRepository.GetQuery()
                .Where(x => !x.IsDeleted
                    && x.ModuleName == nameof(MaterialExport)
                    && x.ModuleId == entity.Id)
                .ToListAsync(ct);
            foreach (var line in lines)
            {
                await _inventoryTransactionService.MaterialExportDeleteInvenTrans(
                    line.Id,
                    request.DeletedById,
                    ct);
            }

            entity.UpdatedById = request.DeletedById;
            _repository.Delete(entity);
            await _unitOfWork.SaveAsync(ct);
        }, cancellationToken);

        return new DeleteMaterialExportResult
        {
            Data = entity
        };
    }
}

