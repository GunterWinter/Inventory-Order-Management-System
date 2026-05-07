using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static Domain.Common.Constants;

namespace Infrastructure.DataAccessManager.EFCore.Configurations;

public class CashTransactionConfiguration : BaseEntityConfiguration<CashTransaction>
{
    public override void Configure(EntityTypeBuilder<CashTransaction> builder)
    {
        base.Configure(builder);

        builder.Property(x => x.Number).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.TransactionDate).IsRequired(false);
        builder.Property(x => x.TransactionType).IsRequired(false);
        builder.Property(x => x.Status).IsRequired(false);
        builder.Property(x => x.Amount).IsRequired(false);
        builder.Property(x => x.Description).HasMaxLength(DescriptionConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.CashAccountId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.CashCategoryId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.SourceModule).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.SourceModuleId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.SourceModuleNumber).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);

        builder.HasOne(x => x.CashAccount)
            .WithMany()
            .HasForeignKey(x => x.CashAccountId)
            .OnDelete(Microsoft.EntityFrameworkCore.DeleteBehavior.Restrict);

        builder.HasOne(x => x.CashCategory)
            .WithMany()
            .HasForeignKey(x => x.CashCategoryId)
            .OnDelete(Microsoft.EntityFrameworkCore.DeleteBehavior.Restrict);

        builder.HasIndex(e => e.Number);
        builder.HasIndex(e => e.TransactionDate);
    }
}
