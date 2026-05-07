using Application.Features.CashCategoryManager.Commands;
using Application.Features.CashCategoryManager.Queries;
using ASPNET.BackEnd.Common.Base;
using ASPNET.BackEnd.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ASPNET.BackEnd.Controllers;

[Route("api/[controller]")]
public class CashCategoryController : BaseApiController
{
    public CashCategoryController(ISender sender) : base(sender)
    {
    }

    [Authorize]
    [HttpPost("CreateCashCategory")]
    public async Task<ActionResult<ApiSuccessResult<CreateCashCategoryResult>>> CreateCashCategoryAsync(CreateCashCategoryRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<CreateCashCategoryResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(CreateCashCategoryAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("UpdateCashCategory")]
    public async Task<ActionResult<ApiSuccessResult<UpdateCashCategoryResult>>> UpdateCashCategoryAsync(UpdateCashCategoryRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<UpdateCashCategoryResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(UpdateCashCategoryAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("DeleteCashCategory")]
    public async Task<ActionResult<ApiSuccessResult<DeleteCashCategoryResult>>> DeleteCashCategoryAsync(DeleteCashCategoryRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<DeleteCashCategoryResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(DeleteCashCategoryAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetCashCategoryList")]
    public async Task<ActionResult<ApiSuccessResult<GetCashCategoryListResult>>> GetCashCategoryListAsync(
        CancellationToken cancellationToken,
        [FromQuery] bool isDeleted = false
        )
    {
        var request = new GetCashCategoryListRequest { IsDeleted = isDeleted };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetCashCategoryListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetCashCategoryListAsync)}",
            Content = response
        });
    }
}
