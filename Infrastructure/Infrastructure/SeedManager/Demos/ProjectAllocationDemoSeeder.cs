using Application.Common.CQS.Queries;
using Application.Features.InventoryTransactionManager.Commands;
using Application.Features.MaterialExportManager.Commands;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class ProjectAllocationDemoSeeder
{
    private const string DemoPrefix = "DEMO PHÂN BỔ CÔNG TRÌNH";
    private readonly ISender _sender;
    private readonly IQueryContext _context;

    public ProjectAllocationDemoSeeder(ISender sender, IQueryContext context)
    {
        _sender = sender;
        _context = context;
    }

    public async Task GenerateDataAsync()
    {
        if (await _context.Set<MaterialExport>().AsNoTracking()
            .AnyAsync(x => !x.IsDeleted && x.Description != null && x.Description.StartsWith(DemoPrefix)))
        {
            return;
        }

        var customers = await _context.Set<Customer>().AsNoTracking()
            .Where(x => !x.IsDeleted)
            .OrderBy(x => x.Name)
            .Take(4)
            .ToListAsync();
        if (customers.Count == 0) return;

        var candidates = await _context.Set<ProductSerial>().AsNoTracking()
            .Where(x => !x.IsDeleted
                && x.Status == ProductSerialStatus.InStock
                && x.CurrentWarehouseId != null
                && x.PurchaseOrderItemId != null
                && x.UnitCost != null)
            .GroupBy(x => new { x.ProductId, x.CurrentWarehouseId })
            .Where(group => group.Count() >= 2)
            .Select(group => new
            {
                group.Key.ProductId,
                WarehouseId = group.Key.CurrentWarehouseId!,
                ReferenceCode = group.Max(x => x.Product!.ReferenceCode)
            })
            .OrderBy(x => x.ReferenceCode)
            .ThenBy(x => x.ProductId)
            .Take(4)
            .ToListAsync();

        for (var index = 0; index < candidates.Count; index++)
        {
            var candidate = candidates[index];
            var customer = customers[index % customers.Count];
            var serialIds = await _context.Set<ProductSerial>().AsNoTracking()
                .Where(x => !x.IsDeleted
                    && x.ProductId == candidate.ProductId
                    && x.CurrentWarehouseId == candidate.WarehouseId
                    && x.Status == ProductSerialStatus.InStock
                    && x.PurchaseOrderItemId != null
                    && x.UnitCost != null)
                .OrderBy(x => x.CreatedAtUtc)
                .ThenBy(x => x.Id)
                .Take(2)
                .Select(x => x.Id)
                .ToListAsync();
            if (serialIds.Count != 2) continue;

            var created = await _sender.Send(new CreateMaterialExportRequest
            {
                MaterialExportDate = new DateTime(2026, 7, 10).AddDays(index * 5),
                WarehouseId = candidate.WarehouseId,
                CustomerId = customer.Id,
                Status = ((int)MaterialExportStatus.Draft).ToString(),
                Description = $"{DemoPrefix} - {customer.Name}"
            });
            var materialExport = created.Data ?? throw new InvalidOperationException("Demo material export could not be created.");

            await _sender.Send(new MaterialExportCreateInvenTransRequest
            {
                ModuleId = materialExport.Id,
                ProductId = candidate.ProductId,
                Movement = serialIds.Count,
                ProductSerialIds = serialIds,
                CreatedById = "demo-seeder"
            });

            await _sender.Send(new UpdateMaterialExportRequest
            {
                Id = materialExport.Id,
                MaterialExportDate = materialExport.ExportDate,
                WarehouseId = materialExport.WarehouseId,
                CustomerId = materialExport.CustomerId,
                Status = ((int)MaterialExportStatus.Confirmed).ToString(),
                Description = materialExport.Description,
                UpdatedById = "demo-seeder"
            });
        }
    }
}
