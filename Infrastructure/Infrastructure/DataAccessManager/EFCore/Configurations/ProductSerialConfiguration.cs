using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static Domain.Common.Constants;

namespace Infrastructure.DataAccessManager.EFCore.Configurations;

public class ProductSerialConfiguration : BaseEntityConfiguration<ProductSerial>
{
    public override void Configure(EntityTypeBuilder<ProductSerial> builder)
    {
        base.Configure(builder);

        builder.Property(x => x.ProductId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.InternalSerialNumber).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ManufacturerSerialNumber).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.Status).IsRequired(false);
        builder.Property(x => x.CurrentWarehouseId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.PurchaseOrderItemId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.SalesOrderItemId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.SupplierWarrantyEndDate).IsRequired(false);
        builder.Property(x => x.CustomerWarrantyEndDate).IsRequired(false);
        builder.Property(x => x.CostAllocationId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);

        builder.HasOne(x => x.CostAllocation)
            .WithMany()
            .HasForeignKey(x => x.CostAllocationId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(x => x.InternalSerialNumber).IsUnique();
        builder.HasIndex(x => x.ManufacturerSerialNumber)
            .IsUnique()
            .HasFilter("[ManufacturerSerialNumber] IS NOT NULL AND [IsDeleted] = 0");
        builder.HasIndex(x => x.ProductId);
        builder.HasIndex(x => x.Status);
        builder.HasIndex(x => x.CurrentWarehouseId);
        builder.HasIndex(x => x.PurchaseOrderItemId);
        builder.HasIndex(x => x.SalesOrderItemId);
        builder.HasIndex(x => x.CostAllocationId);
        builder.HasIndex(x => new { x.IsDeleted, x.Status, x.ProductId, x.CurrentWarehouseId })
            .HasDatabaseName("IX_ProductSerial_StockLookup");
    }
}
