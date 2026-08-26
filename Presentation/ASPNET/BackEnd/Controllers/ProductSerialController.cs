using Application.Features.ProductSerialManager.Queries;
using ASPNET.BackEnd.Common.Base;
using ASPNET.BackEnd.Common.Models;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ASPNET.BackEnd.Controllers;

[Route("api/[controller]")]
public class ProductSerialController : BaseApiController
{
    public ProductSerialController(ISender sender) : base(sender)
    {
    }

    [Authorize]
    [HttpGet("GetProductSerialPickerList")]
    public async Task<ActionResult<ApiSuccessResult<GetProductSerialPickerListResult>>> GetProductSerialPickerListAsync(
        CancellationToken cancellationToken,
        [FromQuery] string? productId = null,
        [FromQuery] string? warehouseId = null,
        [FromQuery] string? moduleName = null,
        [FromQuery] string? moduleId = null,
        [FromQuery] string? moduleItemId = null,
        [FromQuery] string? sourceItemId = null)
    {
        var request = new GetProductSerialPickerListRequest
        {
            ProductId = productId,
            WarehouseId = warehouseId,
            ModuleName = moduleName,
            ModuleId = moduleId,
            ModuleItemId = moduleItemId,
            SourceItemId = sourceItemId
        };
        var response = await _sender.Send(request, cancellationToken);

        return Ok(new ApiSuccessResult<GetProductSerialPickerListResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetProductSerialPickerListAsync)}",
            Content = response
        });
    }

    [Authorize]
    [HttpGet("GetWarrantyLookup")]
    public async Task<ActionResult<ApiSuccessResult<GetWarrantyLookupResult>>> GetWarrantyLookupAsync(
        CancellationToken cancellationToken,
        [FromQuery] string? search = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20)
    {
        var response = await _sender.Send(new GetWarrantyLookupRequest
        {
            Search = search,
            Page = page,
            PageSize = pageSize
        }, cancellationToken);

        return Ok(new ApiSuccessResult<GetWarrantyLookupResult>
        {
            Code = StatusCodes.Status200OK,
            Message = $"Success executing {nameof(GetWarrantyLookupAsync)}",
            Content = response
        });
    }
}
