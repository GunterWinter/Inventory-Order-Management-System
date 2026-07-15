using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Threading.Tasks;

namespace Infrastructure.SeedManager.Systems
{
    public class ProductSerialWarehouseRepair
    {
        private readonly ICommandRepository<ProductSerial> _productSerialRepository;
        private readonly ICommandRepository<ProductSerialMovement> _productSerialMovementRepository;
        private readonly ICommandRepository<InventoryTransaction> _inventoryTransactionRepository;
        private readonly IQueryContext _queryContext;
        private readonly IUnitOfWork _unitOfWork;

        public ProductSerialWarehouseRepair(
            ICommandRepository<ProductSerial> productSerialRepository,
            ICommandRepository<ProductSerialMovement> productSerialMovementRepository,
            ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
            IQueryContext queryContext,
            IUnitOfWork unitOfWork)
        {
            _productSerialRepository = productSerialRepository;
            _productSerialMovementRepository = productSerialMovementRepository;
            _inventoryTransactionRepository = inventoryTransactionRepository;
            _queryContext = queryContext;
            _unitOfWork = unitOfWork;
        }

        public async Task RepairAsync()
        {
            // 1. Get system warehouse IDs
            var systemWarehouseIds = await _queryContext.Set<Warehouse>()
                .AsNoTracking()
                .Where(w => !w.IsDeleted && w.SystemWarehouse == true)
                .Select(w => w.Id)
                .ToListAsync();

            if (!systemWarehouseIds.Any())
            {
                return;
            }

            // 2. Find product serials that are InStock but have CurrentWarehouseId pointing to a system warehouse
            var candidates = await _productSerialRepository.GetQuery()
                .Where(x => !x.IsDeleted 
                    && x.Status == ProductSerialStatus.InStock 
                    && x.CurrentWarehouseId != null 
                    && systemWarehouseIds.Contains(x.CurrentWarehouseId))
                .ToListAsync();

            // 3. For consistency, also find and repair historical movements linked to StockCount
            // whose ToWarehouseId is a system warehouse.
            var stockCountMovements = await _productSerialMovementRepository.GetQuery()
                .Include(x => x.InventoryTransaction)
                .Where(x => !x.IsDeleted
                    && x.ModuleName == nameof(StockCount)
                    && x.ToWarehouseId != null
                    && systemWarehouseIds.Contains(x.ToWarehouseId))
                .ToListAsync();

            bool hasChanges = false;

            foreach (var movement in stockCountMovements)
            {
                if (movement.InventoryTransaction != null && !string.IsNullOrWhiteSpace(movement.InventoryTransaction.WarehouseId))
                {
                    movement.ToWarehouseId = movement.InventoryTransaction.WarehouseId;
                    _productSerialMovementRepository.Update(movement);
                    hasChanges = true;
                }
            }

            if (candidates.Any())
            {
                var candidateIds = candidates.Select(c => c.Id).ToList();

                // Load movements for candidate serials, including the transaction to find their original warehouses
                var movements = await _productSerialMovementRepository.GetQuery()
                    .Include(x => x.InventoryTransaction)
                    .Where(x => !x.IsDeleted && candidateIds.Contains(x.ProductSerialId))
                    .ToListAsync();

                var movementsBySerial = movements
                    .GroupBy(m => m.ProductSerialId)
                    .ToDictionary(
                        g => g.Key!, 
                        g => g.OrderByDescending(m => m.MovementDate).ThenByDescending(m => m.CreatedAtUtc).ToList()
                    );

                foreach (var serial in candidates)
                {
                    string? resolvedWarehouseId = null;

                    if (movementsBySerial.TryGetValue(serial.Id, out var serialMovements))
                    {
                        // (a) Find newest movement whose InventoryTransaction.WarehouseId is non-null and non-system (i.e. real warehouse)
                        var m1 = serialMovements.FirstOrDefault(m => 
                            m.InventoryTransaction != null 
                            && !string.IsNullOrWhiteSpace(m.InventoryTransaction.WarehouseId) 
                            && !systemWarehouseIds.Contains(m.InventoryTransaction.WarehouseId));
                        if (m1 != null)
                        {
                            resolvedWarehouseId = m1.InventoryTransaction!.WarehouseId;
                        }

                        // (b) Newest movement ToWarehouseId that is non-system
                        if (string.IsNullOrEmpty(resolvedWarehouseId))
                        {
                            var m2 = serialMovements.FirstOrDefault(m => 
                                !string.IsNullOrWhiteSpace(m.ToWarehouseId) 
                                && !systemWarehouseIds.Contains(m.ToWarehouseId));
                            if (m2 != null)
                            {
                                resolvedWarehouseId = m2.ToWarehouseId;
                            }
                        }
                    }

                    // (c) Product.DefaultWarehouseId if non-system
                    if (string.IsNullOrEmpty(resolvedWarehouseId) && !string.IsNullOrEmpty(serial.ProductId))
                    {
                        var product = await _queryContext.Set<Product>()
                            .AsNoTracking()
                            .FirstOrDefaultAsync(p => p.Id == serial.ProductId);
                        if (product != null && !string.IsNullOrEmpty(product.DefaultWarehouseId) && !systemWarehouseIds.Contains(product.DefaultWarehouseId))
                        {
                            resolvedWarehouseId = product.DefaultWarehouseId;
                        }
                    }

                    if (!string.IsNullOrEmpty(resolvedWarehouseId))
                    {
                        serial.CurrentWarehouseId = resolvedWarehouseId;
                        _productSerialRepository.Update(serial);
                        hasChanges = true;
                    }
                }
            }

            // 4. Repair wrong warehouse assignments in historical InventoryTransactions & ProductSerialMovements:
            // - SalesReturn: WarehouseFromId is currently Vendor, should be Customer
            // - PurchaseReturn: WarehouseToId is currently Customer, should be Vendor
            var customerWarehouse = await _queryContext.Set<Warehouse>()
                .FirstOrDefaultAsync(w => !w.IsDeleted && w.Name == "Customer");
            var vendorWarehouse = await _queryContext.Set<Warehouse>()
                .FirstOrDefaultAsync(w => !w.IsDeleted && w.Name == "Vendor");

            if (customerWarehouse != null && vendorWarehouse != null)
            {
                // Fix InventoryTransactions
                var wrongSalesReturnTransactions = await _inventoryTransactionRepository.GetQuery()
                    .Where(t => !t.IsDeleted 
                        && t.ModuleName == nameof(SalesReturn) 
                        && t.WarehouseFromId == vendorWarehouse.Id)
                    .ToListAsync();
                foreach (var transaction in wrongSalesReturnTransactions)
                {
                    transaction.WarehouseFromId = customerWarehouse.Id;
                    _inventoryTransactionRepository.Update(transaction);
                    hasChanges = true;
                }

                var wrongPurchaseReturnTransactions = await _inventoryTransactionRepository.GetQuery()
                    .Where(t => !t.IsDeleted 
                        && t.ModuleName == nameof(PurchaseReturn) 
                        && t.WarehouseToId == customerWarehouse.Id)
                    .ToListAsync();
                foreach (var transaction in wrongPurchaseReturnTransactions)
                {
                    transaction.WarehouseToId = vendorWarehouse.Id;
                    _inventoryTransactionRepository.Update(transaction);
                    hasChanges = true;
                }

                // Fix ProductSerialMovements
                var wrongSalesReturnMovements = await _productSerialMovementRepository.GetQuery()
                    .Where(m => !m.IsDeleted 
                        && m.ModuleName == nameof(SalesReturn) 
                        && m.FromWarehouseId == vendorWarehouse.Id)
                    .ToListAsync();
                foreach (var movement in wrongSalesReturnMovements)
                {
                    movement.FromWarehouseId = customerWarehouse.Id;
                    _productSerialMovementRepository.Update(movement);
                    hasChanges = true;
                }

                var wrongPurchaseReturnMovements = await _productSerialMovementRepository.GetQuery()
                    .Where(m => !m.IsDeleted 
                        && m.ModuleName == nameof(PurchaseReturn) 
                        && m.ToWarehouseId == customerWarehouse.Id)
                    .ToListAsync();
                foreach (var movement in wrongPurchaseReturnMovements)
                {
                    movement.ToWarehouseId = vendorWarehouse.Id;
                    _productSerialMovementRepository.Update(movement);
                    hasChanges = true;
                }
            }

            if (hasChanges)
            {
                await _unitOfWork.SaveAsync();
            }
        }
    }
}
