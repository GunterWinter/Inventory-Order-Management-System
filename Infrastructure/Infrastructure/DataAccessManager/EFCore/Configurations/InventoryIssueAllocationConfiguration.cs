using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static Domain.Common.Constants;

namespace Infrastructure.DataAccessManager.EFCore.Configurations;

public class InventoryIssueAllocationConfiguration : BaseEntityConfiguration<InventoryIssueAllocation>
{
    public override void Configure(EntityTypeBuilder<InventoryIssueAllocation> builder)
    {
        base.Configure(builder);

        builder.Property(x => x.InventoryTransactionId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ModuleItemId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.SalesOrderItemId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.CostLayerId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.WarehouseId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ProductId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.BatchNumber).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);

        builder.Property(x => x.QtyIssued).HasColumnType("decimal(18,4)").IsRequired(false);
        builder.Property(x => x.UnitCost).HasColumnType("decimal(18,2)").IsRequired(false);
        builder.Property(x => x.SalesUnitPrice).HasColumnType("decimal(18,2)").IsRequired(false);
        builder.Property(x => x.CostAmount).HasColumnType("decimal(18,2)").IsRequired(false);
        builder.Property(x => x.SalesAmount).HasColumnType("decimal(18,2)").IsRequired(false);
        builder.Property(x => x.ProfitAmount).HasColumnType("decimal(18,2)").IsRequired(false);
        builder.Property(x => x.AllocationDate).IsRequired(false);

        builder.HasIndex(x => x.InventoryTransactionId);
        builder.HasIndex(x => x.SalesOrderItemId);
        builder.HasIndex(x => x.CostLayerId);
    }
}