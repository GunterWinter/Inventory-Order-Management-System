using Application.Features.SalesOrderManager.Commands;
using Application.Features.SalesOrderManager.Queries;
using ASPNET.BackEnd.Common.Base;
using ASPNET.BackEnd.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ASPNET.BackEnd.Controllers;

[Route("api/[controller]")]
public class SalesOrderController : BaseApiController
{
    public SalesOrderController(ISender sender) : base(sender)
    {
    }

    [Authorize]
    [HttpPost("CreateSalesOrder")]
    public async Task<ActionResult<ApiSuccessResult<CreateSalesOrderResult>>> CreateSalesOrderAsync([FromBody] CreateSalesOrderRequest request, CancellationToken cancellationToken)
    {
        if (request == null)
        {
            var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).Where(msg => !string.IsNullOrWhiteSpace(msg)).ToList();
            return BadRequest(errors.Any() ? string.Join("; ", errors) : "Request body cannot be null.");
        }

        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<CreateSalesOrderResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(CreateSalesOrderAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("UpdateSalesOrder")]
    public async Task<ActionResult<ApiSuccessResult<UpdateSalesOrderResult>>> UpdateSalesOrderAsync([FromBody] UpdateSalesOrderRequest request, CancellationToken cancellationToken)
    {
        if (request == null)
        {
            var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).Where(msg => !string.IsNullOrWhiteSpace(msg)).ToList();
            return BadRequest(errors.Any() ? string.Join("; ", errors) : "Request body cannot be null.");
        }

        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<UpdateSalesOrderResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(UpdateSalesOrderAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("DeleteSalesOrder")]
    public async Task<ActionResult<ApiSuccessResult<DeleteSalesOrderResult>>> DeleteSalesOrderAsync([FromBody] DeleteSalesOrderRequest request, CancellationToken cancellationToken)
    {
        if (request == null)
        {
            var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).Where(msg => !string.IsNullOrWhiteSpace(msg)).ToList();
            return BadRequest(errors.Any() ? string.Join("; ", errors) : "Request body cannot be null.");
        }

        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<DeleteSalesOrderResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(DeleteSalesOrderAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetSalesOrderList")]
    public async Task<ActionResult<ApiSuccessResult<GetSalesOrderListResult>>> GetSalesOrderListAsync(
        CancellationToken cancellationToken,
        [FromQuery] bool isDeleted = false
        )
    {
        var request = new GetSalesOrderListRequest { IsDeleted = isDeleted };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetSalesOrderListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetSalesOrderListAsync)}",
            Content = response
        });
    }


    [Authorize]
    [HttpGet("GetSalesOrderStatusList")]
    public async Task<ActionResult<ApiSuccessResult<GetSalesOrderStatusListResult>>> GetSalesOrderStatusListAsync(
        CancellationToken cancellationToken
        )
    {
        var request = new GetSalesOrderStatusListRequest { };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetSalesOrderStatusListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetSalesOrderStatusListAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetSalesOrderSingle")]
    public async Task<ActionResult<ApiSuccessResult<GetSalesOrderSingleResult>>> GetSalesOrderSingleAsync(
    CancellationToken cancellationToken,
    [FromQuery] string id
    )
    {
        var request = new GetSalesOrderSingleRequest { Id = id };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetSalesOrderSingleResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetSalesOrderSingleAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetSalesTypeList")]
    public async Task<ActionResult<ApiSuccessResult<GetSalesTypeListResult>>> GetSalesTypeListAsync(
        CancellationToken cancellationToken
        )
    {
        var request = new GetSalesTypeListRequest { };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetSalesTypeListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetSalesTypeListAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("CreateSalesOrderFromPurchaseOrder")]
    public async Task<ActionResult<ApiSuccessResult<CreateSalesOrderFromPurchaseOrderResult>>> CreateSalesOrderFromPurchaseOrderAsync(
        [FromBody] CreateSalesOrderFromPurchaseOrderRequest request,
        CancellationToken cancellationToken
        )
    {
        if (request == null)
        {
            return BadRequest("Request body cannot be null.");
        }

        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<CreateSalesOrderFromPurchaseOrderResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(CreateSalesOrderFromPurchaseOrderAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("UpsertSalesOrderPayment")]
    public async Task<ActionResult<ApiSuccessResult<UpsertSalesOrderPaymentResult>>> UpsertSalesOrderPaymentAsync(
        [FromBody] UpsertSalesOrderPaymentRequest request,
        CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);
        return Ok(new ApiSuccessResult<UpsertSalesOrderPaymentResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(UpsertSalesOrderPaymentAsync)}",
            Content = response
        });
    }
}


