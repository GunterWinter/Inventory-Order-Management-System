using Application.Features.CashAccountManager.Commands;
using Application.Features.CashAccountManager.Queries;
using ASPNET.BackEnd.Common.Base;
using ASPNET.BackEnd.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ASPNET.BackEnd.Controllers;

[Route("api/[controller]")]
public class CashAccountController : BaseApiController
{
    public CashAccountController(ISender sender) : base(sender)
    {
    }

    [Authorize]
    [HttpPost("CreateCashAccount")]
    public async Task<ActionResult<ApiSuccessResult<CreateCashAccountResult>>> CreateCashAccountAsync(CreateCashAccountRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<CreateCashAccountResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(CreateCashAccountAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("UpdateCashAccount")]
    public async Task<ActionResult<ApiSuccessResult<UpdateCashAccountResult>>> UpdateCashAccountAsync(UpdateCashAccountRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<UpdateCashAccountResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(UpdateCashAccountAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("DeleteCashAccount")]
    public async Task<ActionResult<ApiSuccessResult<DeleteCashAccountResult>>> DeleteCashAccountAsync(DeleteCashAccountRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<DeleteCashAccountResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(DeleteCashAccountAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetCashAccountList")]
    public async Task<ActionResult<ApiSuccessResult<GetCashAccountListResult>>> GetCashAccountListAsync(
        CancellationToken cancellationToken,
        [FromQuery] bool isDeleted = false
        )
    {
        var request = new GetCashAccountListRequest { IsDeleted = isDeleted };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetCashAccountListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetCashAccountListAsync)}",
            Content = response
        });
    }
}
