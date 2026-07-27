using Application.Common.Extensions;
using AutoMapper;
using Domain.Enums;
using MediatR;

namespace Application.Features.MaterialExportManager.Queries;

public record GetMaterialExportStatusListDto
{
    public string? Id { get; init; }
    public string? Name { get; init; }
}

public class GetMaterialExportStatusListProfile : Profile
{
    public GetMaterialExportStatusListProfile()
    {
    }
}

public class GetMaterialExportStatusListResult
{
    public List<GetMaterialExportStatusListDto>? Data { get; init; }
}

public class GetMaterialExportStatusListRequest : IRequest<GetMaterialExportStatusListResult>
{
}


public class GetMaterialExportStatusListHandler : IRequestHandler<GetMaterialExportStatusListRequest, GetMaterialExportStatusListResult>
{

    public GetMaterialExportStatusListHandler()
    {
    }

    public async Task<GetMaterialExportStatusListResult> Handle(GetMaterialExportStatusListRequest request, CancellationToken cancellationToken)
    {
        var statuses = Enum.GetValues(typeof(MaterialExportStatus))
            .Cast<MaterialExportStatus>()
            .Select(status => new GetMaterialExportStatusListDto
            {
                Id = ((int)status).ToString(),
                Name = status.ToFriendlyName()
            })
            .ToList();

        await Task.CompletedTask;

        return new GetMaterialExportStatusListResult
        {
            Data = statuses
        };
    }


}



