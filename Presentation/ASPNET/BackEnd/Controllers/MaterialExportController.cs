using Application.Features.MaterialExportManager.Commands;
using Application.Features.MaterialExportManager.Queries;
using ASPNET.BackEnd.Common.Base;
using ASPNET.BackEnd.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ASPNET.BackEnd.Controllers;

[Route("api/[controller]")]
public class MaterialExportController : BaseApiController
{
    public MaterialExportController(ISender sender) : base(sender)
    {
    }

    [Authorize]
    [HttpPost("CreateMaterialExport")]
    public async Task<ActionResult<ApiSuccessResult<CreateMaterialExportResult>>> CreateMaterialExportAsync([FromBody] CreateMaterialExportRequest request, CancellationToken cancellationToken)
    {
        if (request == null)
        {
            var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).Where(msg => !string.IsNullOrWhiteSpace(msg)).ToList();
            return BadRequest(errors.Any() ? string.Join("; ", errors) : "Request body cannot be null.");
        }

        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<CreateMaterialExportResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(CreateMaterialExportAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("UpdateMaterialExport")]
    public async Task<ActionResult<ApiSuccessResult<UpdateMaterialExportResult>>> UpdateMaterialExportAsync([FromBody] UpdateMaterialExportRequest request, CancellationToken cancellationToken)
    {
        if (request == null)
        {
            var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).Where(msg => !string.IsNullOrWhiteSpace(msg)).ToList();
            return BadRequest(errors.Any() ? string.Join("; ", errors) : "Request body cannot be null.");
        }

        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<UpdateMaterialExportResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(UpdateMaterialExportAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpPost("DeleteMaterialExport")]
    public async Task<ActionResult<ApiSuccessResult<DeleteMaterialExportResult>>> DeleteMaterialExportAsync([FromBody] DeleteMaterialExportRequest request, CancellationToken cancellationToken)
    {
        if (request == null)
        {
            var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).Where(msg => !string.IsNullOrWhiteSpace(msg)).ToList();
            return BadRequest(errors.Any() ? string.Join("; ", errors) : "Request body cannot be null.");
        }

        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<DeleteMaterialExportResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(DeleteMaterialExportAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetMaterialExportList")]
    public async Task<ActionResult<ApiSuccessResult<GetMaterialExportListResult>>> GetMaterialExportListAsync(
        CancellationToken cancellationToken,
        [FromQuery] bool isDeleted = false
        )
    {
        var request = new GetMaterialExportListRequest { IsDeleted = isDeleted };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetMaterialExportListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetMaterialExportListAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetMaterialExportStatusList")]
    public async Task<ActionResult<ApiSuccessResult<GetMaterialExportStatusListResult>>> GetMaterialExportStatusListAsync(
        CancellationToken cancellationToken
        )
    {
        var request = new GetMaterialExportStatusListRequest { };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetMaterialExportStatusListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetMaterialExportStatusListAsync)}",
            Content = response
        });
    }


    [Authorize]
    [HttpGet("GetMaterialExportSingle")]
    public async Task<ActionResult<ApiSuccessResult<GetMaterialExportSingleResult>>> GetMaterialExportSingleAsync(
    CancellationToken cancellationToken,
    [FromQuery] string id
    )
    {
        var request = new GetMaterialExportSingleRequest { Id = id };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetMaterialExportSingleResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetMaterialExportSingleAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetWarehouseProductStock")]
    public async Task<ActionResult<ApiSuccessResult<GetWarehouseProductStockResult>>> GetWarehouseProductStockAsync(
        CancellationToken cancellationToken,
        [FromQuery] string warehouseId,
        [FromQuery] string? materialExportId = null
    )
    {
        var request = new GetWarehouseProductStockRequest
        {
            WarehouseId = warehouseId,
            MaterialExportId = materialExportId
        };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetWarehouseProductStockResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetWarehouseProductStockAsync)}",
            Content = response
        });
    }
}
