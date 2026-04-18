using Application.Features.InventoryIssueAllocationManager.Queries;
using ASPNET.BackEnd.Common.Base;
using ASPNET.BackEnd.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ASPNET.BackEnd.Controllers;

[Route("api/[controller]")]
public class InventoryIssueAllocationController : BaseApiController
{
    public InventoryIssueAllocationController(ISender sender) : base(sender)
    {
    }

    [Authorize]
    [HttpGet("GetInventoryIssueAllocationList")]
    public async Task<ActionResult<ApiSuccessResult<GetInventoryIssueAllocationListResult>>> GetInventoryIssueAllocationListAsync(
        CancellationToken cancellationToken,
        [FromQuery] bool isDeleted = false)
    {
        var request = new GetInventoryIssueAllocationListRequest { IsDeleted = isDeleted };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetInventoryIssueAllocationListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetInventoryIssueAllocationListAsync)}",
            Content = response
        });
    }
}