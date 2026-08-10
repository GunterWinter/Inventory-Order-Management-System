using Application.Common.CQS.Queries;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.MasterDataManager;

/// <summary>
/// Prevents soft-deleting master data that is still referenced by active business data.
/// Keeping this logic in one place also gives users a useful document example instead of
/// exposing a database foreign-key error or leaving an unreadable historical document.
/// </summary>
public class MasterDataDeletionGuard
{
    private readonly IQueryContext _context;

    public MasterDataDeletionGuard(IQueryContext context)
    {
        _context = context;
    }

    public async Task EnsureProductCanBeDeletedAsync(string productId, string? productName, CancellationToken ct)
    {
        var purchase = await _context.Set<PurchaseOrderItem>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.ProductId == productId)
            .Select(x => x.PurchaseOrder != null ? x.PurchaseOrder.Number : null)
            .FirstOrDefaultAsync(ct);
        if (purchase != null)
            Throw("hàng hóa", productName, $"đang được sử dụng trong đơn mua {purchase}");

        var sale = await _context.Set<SalesOrderItem>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.ProductId == productId)
            .Select(x => x.SalesOrder != null ? x.SalesOrder.Number : null)
            .FirstOrDefaultAsync(ct);
        if (sale != null)
            Throw("hàng hóa", productName, $"đang được sử dụng trong đơn bán {sale}");

        var movement = await _context.Set<InventoryTransaction>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.ProductId == productId)
            .Select(x => x.ModuleNumber ?? x.Number)
            .FirstOrDefaultAsync(ct);
        if (movement != null)
            Throw("hàng hóa", productName, $"đã có lịch sử kho tại chứng từ {movement}");

        var serial = await _context.Set<ProductSerial>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.ProductId == productId)
            .Select(x => x.InternalSerialNumber)
            .FirstOrDefaultAsync(ct);
        if (serial != null)
            Throw("hàng hóa", productName, $"đã phát sinh serial {serial}");
    }

    public async Task EnsureProductGroupCanBeDeletedAsync(string groupId, string? groupName, CancellationToken ct)
    {
        var product = await _context.Set<Product>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.ProductGroupId == groupId)
            .Select(x => x.Name)
            .FirstOrDefaultAsync(ct);
        if (product != null)
            Throw("nhóm hàng hóa", groupName, $"đang chứa hàng hóa {product}");
    }

    public async Task EnsureWarehouseCanBeDeletedAsync(string warehouseId, string? warehouseName, CancellationToken ct)
    {
        var defaultProduct = await _context.Set<Product>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.DefaultWarehouseId == warehouseId)
            .Select(x => x.Name)
            .FirstOrDefaultAsync(ct);
        if (defaultProduct != null)
            Throw("kho", warehouseName, $"đang là kho mặc định của hàng hóa {defaultProduct}");

        var purchase = await _context.Set<PurchaseOrderItem>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.WarehouseId == warehouseId)
            .Select(x => x.PurchaseOrder != null ? x.PurchaseOrder.Number : null)
            .FirstOrDefaultAsync(ct);
        if (purchase != null)
            Throw("kho", warehouseName, $"đang được sử dụng trong đơn mua {purchase}");

        var sale = await _context.Set<SalesOrderItem>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.WarehouseId == warehouseId)
            .Select(x => x.SalesOrder != null ? x.SalesOrder.Number : null)
            .FirstOrDefaultAsync(ct);
        if (sale != null)
            Throw("kho", warehouseName, $"đang được sử dụng trong đơn bán {sale}");

        var movement = await _context.Set<InventoryTransaction>().AsNoTracking()
            .Where(x => !x.IsDeleted && (x.WarehouseId == warehouseId || x.WarehouseFromId == warehouseId || x.WarehouseToId == warehouseId))
            .Select(x => x.ModuleNumber ?? x.Number)
            .FirstOrDefaultAsync(ct);
        if (movement != null)
            Throw("kho", warehouseName, $"đã có lịch sử giao dịch {movement}");

        var serial = await _context.Set<ProductSerial>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.CurrentWarehouseId == warehouseId)
            .Select(x => x.InternalSerialNumber)
            .FirstOrDefaultAsync(ct);
        if (serial != null)
            Throw("kho", warehouseName, $"đang chứa serial {serial}");

        var materialExport = await _context.Set<MaterialExport>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.WarehouseId == warehouseId)
            .Select(x => x.Number)
            .FirstOrDefaultAsync(ct);
        if (materialExport != null)
            Throw("kho", warehouseName, $"đang được sử dụng trong phiếu xuất vật tư {materialExport}");
    }

    public async Task EnsureCustomerCanBeDeletedAsync(string customerId, string? customerName, CancellationToken ct)
    {
        var sale = await _context.Set<SalesOrder>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.CustomerId == customerId)
            .Select(x => x.Number)
            .FirstOrDefaultAsync(ct);
        if (sale != null)
            Throw("khách hàng/công trình", customerName, $"đang có đơn bán {sale}");

        var export = await _context.Set<MaterialExport>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.CustomerId == customerId)
            .Select(x => x.Number)
            .FirstOrDefaultAsync(ct);
        if (export != null)
            Throw("khách hàng/công trình", customerName, $"đang có phiếu xuất vật tư {export}");

        var allocation = await _context.Set<PurchaseOrderCostAllocation>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.CustomerId == customerId)
            .Select(x => x.PurchaseOrder != null ? x.PurchaseOrder.Number : null)
            .FirstOrDefaultAsync(ct);
        if (allocation != null)
            Throw("khách hàng/công trình", customerName, $"đang nhận phân bổ từ đơn mua {allocation}");

        var cashAllocation = await _context.Set<CashTransactionCostAllocation>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.CustomerId == customerId)
            .Select(x => x.CashTransaction != null ? x.CashTransaction.Number : null)
            .FirstOrDefaultAsync(ct);
        if (cashAllocation != null)
            Throw("khách hàng/công trình", customerName, $"đang có phân bổ chi phí tại giao dịch {cashAllocation}");

        var cash = await _context.Set<CashTransaction>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.CustomerId == customerId)
            .Select(x => x.Number)
            .FirstOrDefaultAsync(ct);
        if (cash != null)
            Throw("khách hàng/công trình", customerName, $"đang được sử dụng trong giao dịch thu chi {cash}");
    }

    public async Task EnsureVendorCanBeDeletedAsync(string vendorId, string? vendorName, CancellationToken ct)
    {
        var purchase = await _context.Set<PurchaseOrder>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.VendorId == vendorId)
            .Select(x => x.Number)
            .FirstOrDefaultAsync(ct);
        if (purchase != null)
            Throw("nhà cung cấp", vendorName, $"đang có đơn mua {purchase}");

        var cash = await _context.Set<CashTransaction>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.VendorId == vendorId)
            .Select(x => x.Number)
            .FirstOrDefaultAsync(ct);
        if (cash != null)
            Throw("nhà cung cấp", vendorName, $"đang được sử dụng trong giao dịch thu chi {cash}");
    }

    public Task EnsureCustomerGroupCanBeDeletedAsync(string id, string? name, CancellationToken ct)
        => EnsureNoCustomerReferenceAsync(id, name, true, ct);

    public Task EnsureCustomerCategoryCanBeDeletedAsync(string id, string? name, CancellationToken ct)
        => EnsureNoCustomerReferenceAsync(id, name, false, ct);

    public Task EnsureVendorGroupCanBeDeletedAsync(string id, string? name, CancellationToken ct)
        => EnsureNoVendorReferenceAsync(id, name, true, ct);

    public Task EnsureVendorCategoryCanBeDeletedAsync(string id, string? name, CancellationToken ct)
        => EnsureNoVendorReferenceAsync(id, name, false, ct);

    public async Task EnsureTaxCanBeDeletedAsync(string taxId, string? taxName, CancellationToken ct)
    {
        var purchase = await _context.Set<PurchaseOrderItem>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.TaxId == taxId)
            .Select(x => x.PurchaseOrder != null ? x.PurchaseOrder.Number : null)
            .FirstOrDefaultAsync(ct);
        if (purchase != null)
            Throw("thuế", taxName, $"đang được sử dụng trong đơn mua {purchase}");

        var sale = await _context.Set<SalesOrderItem>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.TaxId == taxId)
            .Select(x => x.SalesOrder != null ? x.SalesOrder.Number : null)
            .FirstOrDefaultAsync(ct);
        if (sale != null)
            Throw("thuế", taxName, $"đang được sử dụng trong đơn bán {sale}");
    }

    private async Task EnsureNoCustomerReferenceAsync(string id, string? name, bool isGroup, CancellationToken ct)
    {
        var customer = await _context.Set<Customer>().AsNoTracking()
            .Where(x => !x.IsDeleted && (isGroup ? x.CustomerGroupId == id : x.CustomerCategoryId == id))
            .Select(x => x.Name)
            .FirstOrDefaultAsync(ct);
        if (customer != null)
            Throw(isGroup ? "nhóm khách hàng" : "danh mục khách hàng", name, $"đang được sử dụng bởi {customer}");
    }

    private async Task EnsureNoVendorReferenceAsync(string id, string? name, bool isGroup, CancellationToken ct)
    {
        var vendor = await _context.Set<Vendor>().AsNoTracking()
            .Where(x => !x.IsDeleted && (isGroup ? x.VendorGroupId == id : x.VendorCategoryId == id))
            .Select(x => x.Name)
            .FirstOrDefaultAsync(ct);
        if (vendor != null)
            Throw(isGroup ? "nhóm nhà cung cấp" : "danh mục nhà cung cấp", name, $"đang được sử dụng bởi {vendor}");
    }

    private static void Throw(string entityType, string? name, string reason)
        => throw new InvalidOperationException($"Không thể xóa {entityType} {name ?? string.Empty}: {reason}.");
}
