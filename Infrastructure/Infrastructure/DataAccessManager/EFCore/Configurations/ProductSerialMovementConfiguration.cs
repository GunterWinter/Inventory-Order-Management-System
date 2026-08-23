using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static Domain.Common.Constants;

namespace Infrastructure.DataAccessManager.EFCore.Configurations;

public class ProductSerialMovementConfiguration : BaseEntityConfiguration<ProductSerialMovement>
{
    public override void Configure(EntityTypeBuilder<ProductSerialMovement> builder)
    {
        base.Configure(builder);

        builder.Property(x => x.ProductSerialId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.InventoryTransactionId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ModuleName).HasMaxLength(NameConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ModuleId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ModuleItemId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.FromWarehouseId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ToWarehouseId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.MovementDate).IsRequired(false);
        builder.Property(x => x.Status).IsRequired(false);
        builder.Property(x => x.PreviousStatus).IsRequired(false);
        builder.Property(x => x.PreviousWarehouseId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.PreviousSalesOrderItemId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.PreviousCustomerWarrantyEndDate).IsRequired(false);
        builder.Property(x => x.PreviousCostAllocationId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ReversedAtUtc).IsRequired(false);
        builder.Property(x => x.ReversedById).HasMaxLength(IdConsts.MaxLength).IsRequired(false);

        builder.HasIndex(x => x.ProductSerialId);
        builder.HasIndex(x => x.InventoryTransactionId);
        builder.HasIndex(x => x.ModuleName);
        builder.HasIndex(x => x.ModuleId);
        builder.HasIndex(x => x.ModuleItemId);
        builder.HasIndex(x => new { x.ProductSerialId, x.ReversedAtUtc, x.MovementDate });
        builder.HasIndex(x => new { x.InventoryTransactionId, x.ReversedAtUtc, x.Status })
            .HasDatabaseName("IX_ProductSerialMovement_ActiveInventoryTransaction")
            .HasFilter("[IsDeleted] = 0")
            .IncludeProperties(x => new { x.ProductSerialId, x.CreatedAtUtc });
    }
}
