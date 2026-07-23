using Application.Common.Extensions;
using AutoMapper;
using Domain.Enums;
using MediatR;

namespace Application.Features.SalesOrderManager.Queries;

public record GetSalesTypeListDto
{
    public string? Id { get; init; }
    public string? Name { get; init; }
}

public class GetSalesTypeListProfile : Profile
{
    public GetSalesTypeListProfile()
    {
    }
}

public class GetSalesTypeListResult
{
    public List<GetSalesTypeListDto>? Data { get; init; }
}

public class GetSalesTypeListRequest : IRequest<GetSalesTypeListResult>
{
}

public class GetSalesTypeListHandler : IRequestHandler<GetSalesTypeListRequest, GetSalesTypeListResult>
{
    public async Task<GetSalesTypeListResult> Handle(GetSalesTypeListRequest request, CancellationToken cancellationToken)
    {
        var types = Enum.GetValues(typeof(SalesType))
            .Cast<SalesType>()
            .Select(type => new GetSalesTypeListDto
            {
                Id = ((int)type).ToString(),
                Name = type == SalesType.Retail ? "Xuất bán lẻ" : "Xuất nội bộ"
            })
            .ToList();

        await Task.CompletedTask;

        return new GetSalesTypeListResult
        {
            Data = types
        };
    }
}
