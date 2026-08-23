using Application.Common.CQS.Queries;
using Application.Features.CashTransactionManager.Commands;
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
        var hasMaterialDemo = await _context.Set<MaterialExport>().AsNoTracking()
            .AnyAsync(x => !x.IsDeleted && x.Description != null && x.Description.StartsWith(DemoPrefix));

        var customers = await _context.Set<Customer>().AsNoTracking()
            .Where(x => !x.IsDeleted)
            .OrderBy(x => x.Name)
            .Take(4)
            .ToListAsync();
        if (customers.Count == 0) return;
        var contractorVendorId = await _context.Set<Vendor>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.Name == DemoSeedData.ContractorVendor)
            .Select(x => x.Id)
            .FirstOrDefaultAsync();

        const string accrualPrefix = "DEMO PROJECT COST";
        if (!await _context.Set<CashTransaction>().AsNoTracking()
            .AnyAsync(x => !x.IsDeleted && x.Description != null && x.Description.StartsWith(accrualPrefix)))
        {
            if (customers.Count < 2) return;
            var demoCosts = new[]
            {
                (Description: "Công thợ", Amount: 800_000m, ProjectA: 250_000m, ProjectB: 550_000m),
                (Description: "Gia công ván", Amount: 600_000m, ProjectA: 150_000m, ProjectB: 450_000m),
                (Description: "Vận chuyển", Amount: 100_000m, ProjectA: 100_000m, ProjectB: 0m)
            };
            foreach (var cost in demoCosts)
            {
                await _sender.Send(new CreateCashTransactionRequest
                {
                    TransactionDate = DemoSeedData.BaseDate.AddDays(8),
                    TransactionType = (int)CashTransactionType.Credit,
                    Amount = cost.Amount,
                    PaidAmount = 0m,
                    Description = $"{accrualPrefix} - {cost.Description}",
                    VendorId = contractorVendorId,
                    CreatedById = "demo-seeder",
                    Allocations = new[]
                    {
                        new CashTransactionAllocationInput
                        {
                            CustomerId = customers[0].Id,
                            Amount = cost.ProjectA,
                            Description = $"{cost.Description} công trình A"
                        },
                        new CashTransactionAllocationInput
                        {
                            CustomerId = customers[1].Id,
                            Amount = cost.ProjectB,
                            Description = $"{cost.Description} công trình B"
                        }
                    }.Where(x => x.Amount > 0m).ToList()
                });
            }
        }

        if (hasMaterialDemo) return;

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
        var materialCustomers = customers.Skip(1).ToList();
        if (materialCustomers.Count == 0) materialCustomers.Add(customers[0]);

        for (var index = 0; index < candidates.Count; index++)
        {
            var candidate = candidates[index];
            var customer = materialCustomers[index % materialCustomers.Count];
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
