using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static Domain.Common.Constants;

namespace Infrastructure.DataAccessManager.EFCore.Configurations;

public class InventoryTransactionConfiguration : BaseEntityConfiguration<InventoryTransaction>
{
    public override void Configure(EntityTypeBuilder<InventoryTransaction> builder)
    {
        base.Configure(builder);

        builder.Property(x => x.ModuleId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ModuleName).HasMaxLength(NameConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ModuleCode).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.MovementDate).IsRequired(false);
        builder.Property(x => x.Status).IsRequired(false);
        builder.Property(x => x.Number).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.WarehouseId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ProductId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.Movement).IsRequired(false);
        builder.Property(x => x.TransType).IsRequired(false);
        builder.Property(x => x.Stock).IsRequired(false);
        builder.Property(x => x.WarehouseFromId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.WarehouseToId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.QtySCSys).IsRequired(false);
        builder.Property(x => x.QtySCCount).IsRequired(false);
        builder.Property(x => x.QtySCDelta).IsRequired(false);
        builder.Property(x => x.UnitCost).IsRequired(false);
        builder.Property(x => x.PendingManufacturerSerialNumbersJson)
            .HasColumnType("nvarchar(max)")
            .IsRequired(false);

        builder.HasIndex(e => e.Number);
        builder.HasIndex(e => e.ModuleName);
        builder.HasIndex(e => e.ModuleCode);
        builder.HasIndex(e => new { e.IsDeleted, e.Status, e.ProductId, e.WarehouseId })
            .HasDatabaseName("IX_InventoryTransaction_StockLookup");
        builder.HasIndex(e => new { e.IsDeleted, e.Status, e.MovementDate, e.Id })
            .HasDatabaseName("IX_InventoryTransaction_ActiveList");
        builder.HasIndex(e => new { e.ModuleName, e.ModuleId, e.ModuleItemId })
            .HasDatabaseName("IX_InventoryTransaction_ActiveModuleItem")
            .HasFilter("[IsDeleted] = 0")
            .IncludeProperties(e => new { e.Status, e.ProductId, e.WarehouseId, e.Movement, e.Stock });
    }
}

