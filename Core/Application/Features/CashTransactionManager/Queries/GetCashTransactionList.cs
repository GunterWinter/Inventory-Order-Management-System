using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Queries;

public record GetCashTransactionListDto
{
    public string? Id { get; init; }
    public string? Number { get; init; }
    public DateTime? TransactionDate { get; init; }
    public CashTransactionType? TransactionType { get; init; }
    public CashTransactionStatus? Status { get; init; }
    public decimal? Amount { get; init; }
    public decimal? PaidAmount { get; init; }
    public string? Description { get; init; }
    public string? CashAccountId { get; init; }
    public string? CashAccountName { get; init; }
    public string? CashCategoryId { get; init; }
    public string? CashCategoryName { get; init; }
    public string? CustomerId { get; init; }
    public string? CustomerName { get; init; }
    public string? VendorId { get; init; }
    public string? VendorName { get; init; }
    public string? SourceModule { get; init; }
    public string? SourceModuleId { get; init; }
    public string? SourceModuleNumber { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
    public List<CashTransactionAllocationDto> Allocations { get; init; } = new();
}
public class CashTransactionAllocationDto
{
    public string? CustomerId { get; init; }
    public decimal Amount { get; init; }
    public string? Description { get; init; }
}

public class GetCashTransactionListResult
{
    public List<GetCashTransactionListDto>? Data { get; init; }
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
}

public class GetCashTransactionListRequest : PagedListRequest, IRequest<GetCashTransactionListResult>
{
    public bool IsDeleted { get; init; } = false;
}

public class GetCashTransactionListHandler : IRequestHandler<GetCashTransactionListRequest, GetCashTransactionListResult>
{
    private readonly IQueryContext _context;

    public GetCashTransactionListHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetCashTransactionListResult> Handle(GetCashTransactionListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .CashTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(x => (x.Number != null && x.Number.Contains(search))
                || (x.SourceModuleNumber != null && x.SourceModuleNumber.Contains(search))
                || (x.Description != null && x.Description.Contains(search))
                || (x.Customer != null && x.Customer.Name != null && x.Customer.Name.Contains(search))
                || (x.Vendor != null && x.Vendor.Name != null && x.Vendor.Name.Contains(search)));
        }
        query = request.SortField?.ToLowerInvariant() switch
        {
            "number" => request.Descending ? query.OrderByDescending(x => x.Number).ThenByDescending(x => x.Id) : query.OrderBy(x => x.Number).ThenBy(x => x.Id),
            "amount" => request.Descending ? query.OrderByDescending(x => x.Amount).ThenByDescending(x => x.Id) : query.OrderBy(x => x.Amount).ThenBy(x => x.Id),
            _ => request.Descending ? query.OrderByDescending(x => x.TransactionDate).ThenByDescending(x => x.Id) : query.OrderBy(x => x.TransactionDate).ThenBy(x => x.Id)
        };
        var totalCount = await query.CountAsync(cancellationToken);
        if (request.NormalizedPageSize is int pageSize)
            query = query.Skip((request.NormalizedPage - 1) * pageSize).Take(pageSize);

        var entities = await query
            .Select(x => new GetCashTransactionListDto
            {
                Id = x.Id,
                Number = x.Number,
                TransactionDate = x.TransactionDate,
                TransactionType = x.TransactionType,
                Status = x.Status,
                Amount = x.Amount,
                PaidAmount = x.PaidAmount,
                Description = x.Description,
                CashAccountId = x.CashAccountId,
                CashAccountName = x.CashAccount != null ? x.CashAccount.Name : null,
                CashCategoryId = x.CashCategoryId,
                CashCategoryName = x.CashCategory != null ? x.CashCategory.Name : null,
                CustomerId = x.CustomerId,
                CustomerName = x.Customer != null ? x.Customer.Name : null,
                VendorId = x.VendorId,
                VendorName = x.Vendor != null ? x.Vendor.Name : null,
                SourceModule = x.SourceModule,
                SourceModuleId = x.SourceModuleId,
                SourceModuleNumber = x.SourceModuleNumber,
                CreatedAtUtc = x.CreatedAtUtc
                ,Allocations = x.CostAllocations.Where(a => !a.IsDeleted).Select(a => new CashTransactionAllocationDto
                {
                    CustomerId = a.CustomerId,
                    Amount = a.Amount,
                    Description = a.Description
                }).ToList()
            })
            .ToListAsync(cancellationToken);

        return new GetCashTransactionListResult
        {
            Data = entities,
            TotalCount = totalCount,
            Page = request.NormalizedPage,
            PageSize = request.NormalizedPageSize ?? totalCount
        };
    }
}
