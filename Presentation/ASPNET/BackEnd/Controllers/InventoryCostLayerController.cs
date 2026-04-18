using Application.Features.InventoryCostLayerManager.Queries;
using ASPNET.BackEnd.Common.Base;
using ASPNET.BackEnd.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ASPNET.BackEnd.Controllers;

[Route("api/[controller]")]
public class InventoryCostLayerController : BaseApiController
{
    public InventoryCostLayerController(ISender sender) : base(sender)
    {
    }

    [Authorize]
    [HttpGet("GetInventoryCostLayerList")]
    public async Task<ActionResult<ApiSuccessResult<GetInventoryCostLayerListResult>>> GetInventoryCostLayerListAsync(
        CancellationToken cancellationToken,
        [FromQuery] bool isDeleted = false)
    {
        var request = new GetInventoryCostLayerListRequest { IsDeleted = isDeleted };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetInventoryCostLayerListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetInventoryCostLayerListAsync)}",
            Content = response
        });
    }
}