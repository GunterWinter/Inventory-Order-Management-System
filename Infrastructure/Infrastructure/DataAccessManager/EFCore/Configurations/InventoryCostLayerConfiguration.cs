using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static Domain.Common.Constants;

namespace Infrastructure.DataAccessManager.EFCore.Configurations;

public class InventoryCostLayerConfiguration : BaseEntityConfiguration<InventoryCostLayer>
{
    public override void Configure(EntityTypeBuilder<InventoryCostLayer> builder)
    {
        base.Configure(builder);

        builder.Property(x => x.InventoryTransactionId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ModuleItemId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.WarehouseId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ProductId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.BatchNumber).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ReceivedDate).IsRequired(false);

        builder.Property(x => x.UnitCost).HasColumnType("decimal(18,2)").IsRequired(false);
        builder.Property(x => x.OriginalQty).HasColumnType("decimal(18,4)").IsRequired(false);
        builder.Property(x => x.RemainingQty).HasColumnType("decimal(18,4)").IsRequired(false);
        builder.Property(x => x.LayerStatus).IsRequired(false);

        builder.HasIndex(x => new { x.WarehouseId, x.ProductId, x.BatchNumber });
    }
}