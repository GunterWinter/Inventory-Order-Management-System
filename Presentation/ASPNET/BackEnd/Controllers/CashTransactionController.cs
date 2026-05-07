using Application.Features.CashTransactionManager.Commands;
using Application.Features.CashTransactionManager.Queries;
using ASPNET.BackEnd.Common.Base;
using ASPNET.BackEnd.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ASPNET.BackEnd.Controllers;

[Route("api/[controller]")]
public class CashTransactionController : BaseApiController
{
    public CashTransactionController(ISender sender) : base(sender)
    {
    }

    [Authorize]
    [HttpPost("CreateCashTransaction")]
    public async Task<ActionResult<ApiSuccessResult<CreateCashTransactionResult>>> CreateCashTransactionAsync(CreateCashTransactionRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<CreateCashTransactionResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(CreateCashTransactionAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("UpdateCashTransaction")]
    public async Task<ActionResult<ApiSuccessResult<UpdateCashTransactionResult>>> UpdateCashTransactionAsync(UpdateCashTransactionRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<UpdateCashTransactionResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(UpdateCashTransactionAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("DeleteCashTransaction")]
    public async Task<ActionResult<ApiSuccessResult<DeleteCashTransactionResult>>> DeleteCashTransactionAsync(DeleteCashTransactionRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<DeleteCashTransactionResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(DeleteCashTransactionAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetCashTransactionList")]
    public async Task<ActionResult<ApiSuccessResult<GetCashTransactionListResult>>> GetCashTransactionListAsync(
        CancellationToken cancellationToken,
        [FromQuery] bool isDeleted = false
        )
    {
        var request = new GetCashTransactionListRequest { IsDeleted = isDeleted };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetCashTransactionListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetCashTransactionListAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetPaymentStatusLookup")]
    public async Task<ActionResult<ApiSuccessResult<GetPaymentStatusLookupResult>>> GetPaymentStatusLookupAsync(
        CancellationToken cancellationToken,
        [FromQuery] string sourceModule = ""
        )
    {
        var request = new GetPaymentStatusLookupRequest { SourceModule = sourceModule };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetPaymentStatusLookupResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetPaymentStatusLookupAsync)}",
            Content = response
        });
    }
}
