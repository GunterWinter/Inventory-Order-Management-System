using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static Domain.Common.Constants;

namespace Infrastructure.DataAccessManager.EFCore.Configurations;

public sealed class CashTransactionCostAllocationConfiguration : BaseEntityConfiguration<CashTransactionCostAllocation>
{
    public override void Configure(EntityTypeBuilder<CashTransactionCostAllocation> builder)
    {
        base.Configure(builder);
        builder.Property(x => x.CashTransactionId).HasMaxLength(IdConsts.MaxLength).IsRequired();
        builder.Property(x => x.CustomerId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.Amount).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(DescriptionConsts.MaxLength).IsRequired(false);

        builder.HasOne(x => x.CashTransaction).WithMany(x => x.CostAllocations)
            .HasForeignKey(x => x.CashTransactionId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        builder.HasIndex(x => x.CashTransactionId);
        builder.HasIndex(x => x.CustomerId);
    }
}
