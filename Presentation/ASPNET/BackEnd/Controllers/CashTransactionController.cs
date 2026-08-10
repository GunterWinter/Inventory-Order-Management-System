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
    [HttpPost("CreateCashTransfer")]
    public async Task<ActionResult<ApiSuccessResult<CreateCashTransferResult>>> CreateCashTransferAsync(CreateCashTransferRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<CreateCashTransferResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(CreateCashTransferAsync)}",
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

      [Authorize]
      [HttpGet("GetDebtReport")]
      public async Task<ActionResult<ApiSuccessResult<GetDebtReportResult>>> GetDebtReportAsync(
          CancellationToken cancellationToken,
          [FromQuery] string? partyType = "Customer")
      {
          var response = await _sender.Send(new GetDebtReportRequest { PartyType = partyType }, cancellationToken);
          return Ok(new ApiSuccessResult<GetDebtReportResult>
          {
              Code = StatusCodes.Status200OK,
              Message = $"Success executing {nameof(GetDebtReportAsync)}",
              Content = response
          });
      }

    [Authorize]
    [HttpGet("GetCustomerProfitReport")]
    public async Task<ActionResult<ApiSuccessResult<GetCustomerProfitReportResult>>> GetCustomerProfitReportAsync(
        CancellationToken cancellationToken,
        [FromQuery] string? customerId = null,
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] DateTime? toDate = null)
    {
        var response = await _sender.Send(new GetCustomerProfitReportRequest
        {
            CustomerId = customerId,
            FromDate = fromDate,
            ToDate = toDate
        }, cancellationToken);

        return Ok(new ApiSuccessResult<GetCustomerProfitReportResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetCustomerProfitReportAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetCashTransactionSourceItems")]
    public async Task<ActionResult<ApiSuccessResult<GetCashTransactionSourceItemsResult>>> GetCashTransactionSourceItemsAsync(
        CancellationToken cancellationToken,
        [FromQuery] string cashTransactionId)
    {
        var response = await _sender.Send(new GetCashTransactionSourceItemsRequest
        {
            CashTransactionId = cashTransactionId
        }, cancellationToken);

        return Ok(new ApiSuccessResult<GetCashTransactionSourceItemsResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetCashTransactionSourceItemsAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetCashTransactionCostAllocations")]
    public async Task<ActionResult<ApiSuccessResult<GetCashTransactionCostAllocationsResult>>> GetCashTransactionCostAllocationsAsync(
        CancellationToken cancellationToken,
        [FromQuery] string purchaseOrderId
    )
    {
        var request = new GetCashTransactionCostAllocationsRequest { PurchaseOrderId = purchaseOrderId };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetCashTransactionCostAllocationsResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetCashTransactionCostAllocationsAsync)}",
            Content = response
        });
    }
}
