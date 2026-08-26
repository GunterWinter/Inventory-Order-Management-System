using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.DataAccessManager.EFCore.Configurations;

public class MaterialExportItemConfiguration : BaseEntityConfiguration<MaterialExportItem>
{
    public override void Configure(EntityTypeBuilder<MaterialExportItem> builder)
    {
        base.Configure(builder);

        builder.HasOne(x => x.PurchaseOrderItem)
            .WithMany()
            .HasForeignKey(x => x.PurchaseOrderItemId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.Product)
            .WithMany()
            .HasForeignKey(x => x.ProductId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.Warehouse)
            .WithMany()
            .HasForeignKey(x => x.WarehouseId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<InventoryTransaction>()
            .WithMany()
            .HasForeignKey(x => x.InventoryTransactionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne<InventoryTransaction>()
            .WithMany()
            .HasForeignKey(x => x.SourceInventoryTransactionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.ProductSerial)
            .WithMany()
            .HasForeignKey(x => x.ProductSerialId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.Property(x => x.CostSource).HasMaxLength(200);
        builder.HasIndex(x => x.SourceCostAllocationId);
        builder.HasIndex(x => new { x.InventoryTransactionId, x.SourceInventoryTransactionId, x.SourceCostAllocationId })
            .IsUnique()
            .HasDatabaseName("UX_MaterialExportItem_ActiveFifoSource")
            .HasFilter("[IsDeleted] = 0 AND [InventoryTransactionId] IS NOT NULL AND [SourceInventoryTransactionId] IS NOT NULL AND [ProductSerialId] IS NULL");
        builder.HasIndex(x => new { x.InventoryTransactionId, x.ProductSerialId })
            .IsUnique()
            .HasDatabaseName("UX_MaterialExportItem_ActiveSerial")
            .HasFilter("[IsDeleted] = 0 AND [InventoryTransactionId] IS NOT NULL AND [ProductSerialId] IS NOT NULL");
    }
}
