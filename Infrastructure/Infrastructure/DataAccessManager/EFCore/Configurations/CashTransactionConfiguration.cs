using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore;
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
        builder.Property(x => x.PaidAmount).IsRequired(false);
        builder.Property(x => x.Description).HasMaxLength(DescriptionConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.CashAccountId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.CashCategoryId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.CustomerId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.VendorId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.SourceModule).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.SourceModuleId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.SourceDetailId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.SourceModuleNumber).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);

        builder.HasOne(x => x.CashAccount)
            .WithMany()
            .HasForeignKey(x => x.CashAccountId)
            .OnDelete(Microsoft.EntityFrameworkCore.DeleteBehavior.Restrict);

        builder.HasOne(x => x.CashCategory)
            .WithMany()
            .HasForeignKey(x => x.CashCategoryId)
            .OnDelete(Microsoft.EntityFrameworkCore.DeleteBehavior.Restrict);

        builder.HasOne(x => x.Customer)
            .WithMany()
            .HasForeignKey(x => x.CustomerId)
            .OnDelete(Microsoft.EntityFrameworkCore.DeleteBehavior.Restrict);

        builder.HasOne(x => x.Vendor)
            .WithMany()
            .HasForeignKey(x => x.VendorId)
            .OnDelete(Microsoft.EntityFrameworkCore.DeleteBehavior.Restrict);

        builder.HasIndex(e => e.Number);
        builder.HasIndex(e => e.TransactionDate);
        builder.HasIndex(e => new { e.CashAccountId, e.TransactionType })
            .HasDatabaseName("IX_CashTransaction_ActiveBalance")
            .HasFilter("[IsDeleted] = 0")
            .IncludeProperties(e => e.PaidAmount);
        builder.HasIndex(e => new { e.SourceModule, e.SourceModuleId, e.SourceDetailId, e.TransactionType })
            .HasDatabaseName("UX_CashTransaction_MaterialExportOffset")
            .IsUnique()
            .HasFilter("[IsDeleted] = 0 AND [SourceModule] = N'MaterialExport' AND [SourceDetailId] IS NOT NULL");
        builder.HasIndex(e => new { e.SourceModule, e.SourceModuleId, e.TransactionType })
            .HasDatabaseName("UX_CashTransaction_PurchaseOrderObligation")
            .IsUnique()
            .HasFilter("[IsDeleted] = 0 AND [SourceModule] = N'PurchaseOrder'");
        builder.HasIndex(e => new { e.SourceModule, e.SourceModuleId, e.TransactionType })
            .HasDatabaseName("UX_CashTransaction_SalesOrderPayment")
            .IsUnique()
            .HasFilter("[IsDeleted] = 0 AND [SourceModule] = N'SalesOrder'");
    }
}
