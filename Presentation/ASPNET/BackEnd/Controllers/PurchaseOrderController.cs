using Application.Features.PurchaseOrderManager.Commands;
using Application.Features.PurchaseOrderManager.Queries;
using ASPNET.BackEnd.Common.Base;
using ASPNET.BackEnd.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ASPNET.BackEnd.Controllers;

[Route("api/[controller]")]
public class PurchaseOrderController : BaseApiController
{
    public PurchaseOrderController(ISender sender) : base(sender)
    {
    }

    [Authorize]
    [HttpPost("CreatePurchaseOrder")]
    public async Task<ActionResult<ApiSuccessResult<CreatePurchaseOrderResult>>> CreatePurchaseOrderAsync(CreatePurchaseOrderRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<CreatePurchaseOrderResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(CreatePurchaseOrderAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("UpdatePurchaseOrder")]
    public async Task<ActionResult<ApiSuccessResult<UpdatePurchaseOrderResult>>> UpdatePurchaseOrderAsync(UpdatePurchaseOrderRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<UpdatePurchaseOrderResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(UpdatePurchaseOrderAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("DeletePurchaseOrder")]
    public async Task<ActionResult<ApiSuccessResult<DeletePurchaseOrderResult>>> DeletePurchaseOrderAsync(DeletePurchaseOrderRequest request, CancellationToken cancellationToken)
    {
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<DeletePurchaseOrderResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(DeletePurchaseOrderAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetPurchaseOrderList")]
    public async Task<ActionResult<ApiSuccessResult<GetPurchaseOrderListResult>>> GetPurchaseOrderListAsync(
        CancellationToken cancellationToken,
        [FromQuery] bool isDeleted = false
        )
    {
        var request = new GetPurchaseOrderListRequest { IsDeleted = isDeleted };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetPurchaseOrderListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetPurchaseOrderListAsync)}",
            Content = response
        });
    }


    [Authorize]
    [HttpGet("GetPurchaseOrderStatusList")]
    public async Task<ActionResult<ApiSuccessResult<GetPurchaseOrderStatusListResult>>> GetPurchaseOrderStatusListAsync(
        CancellationToken cancellationToken
        )
    {
        var request = new GetPurchaseOrderStatusListRequest { };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetPurchaseOrderStatusListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetPurchaseOrderStatusListAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetPurchaseOrderSingle")]
    public async Task<ActionResult<ApiSuccessResult<GetPurchaseOrderSingleResult>>> GetPurchaseOrderSingleAsync(
    CancellationToken cancellationToken,
    [FromQuery] string id
    )
    {
        var request = new GetPurchaseOrderSingleRequest { Id = id };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetPurchaseOrderSingleResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetPurchaseOrderSingleAsync)}",
            Content = response
        });
    }


    [Authorize]
    [HttpPost("AllocatePurchaseOrderCosts")]
    public async Task<ActionResult<ApiSuccessResult<AllocatePurchaseOrderCostsResult>>> AllocatePurchaseOrderCostsAsync(
        [FromBody] AllocatePurchaseOrderCostsRequest request,
        CancellationToken cancellationToken
        )
    {
        if (request == null)
        {
            var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).Where(msg => !string.IsNullOrWhiteSpace(msg)).ToList();
            return BadRequest(errors.Any() ? string.Join("; ", errors) : "Request body cannot be null.");
        }

        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<AllocatePurchaseOrderCostsResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(AllocatePurchaseOrderCostsAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetCostAllocationsByPurchaseOrderId")]
    public async Task<ActionResult<ApiSuccessResult<GetCostAllocationsByPurchaseOrderIdResult>>> GetCostAllocationsByPurchaseOrderIdAsync(
        CancellationToken cancellationToken,
        [FromQuery] string purchaseOrderId
        )
    {
        var request = new GetCostAllocationsByPurchaseOrderIdRequest { PurchaseOrderId = purchaseOrderId };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetCostAllocationsByPurchaseOrderIdResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetCostAllocationsByPurchaseOrderIdAsync)}",
            Content = response
        });
    }

}


