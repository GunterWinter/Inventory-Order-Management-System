using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static Domain.Common.Constants;

namespace Infrastructure.DataAccessManager.EFCore.Configurations;

public class CashTransactionPaymentConfiguration : BaseEntityConfiguration<CashTransactionPayment>
{
    public override void Configure(EntityTypeBuilder<CashTransactionPayment> builder)
    {
        base.Configure(builder);

        builder.Property(x => x.CashTransactionId).HasMaxLength(IdConsts.MaxLength).IsRequired();
        builder.Property(x => x.CashAccountId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.PaymentDate).IsRequired();
        builder.Property(x => x.Amount).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(DescriptionConsts.MaxLength).IsRequired(false);

        builder.HasOne(x => x.CashTransaction)
            .WithMany(x => x.PaymentList)
            .HasForeignKey(x => x.CashTransactionId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.CashAccount)
            .WithMany()
            .HasForeignKey(x => x.CashAccountId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasIndex(x => x.CashTransactionId);
        builder.HasIndex(x => x.CashAccountId)
            .HasDatabaseName("IX_CashTransactionPayment_ActiveBalance")
            .HasFilter("[IsDeleted] = 0")
            .IncludeProperties(x => new { x.CashTransactionId, x.Amount });
        builder.HasIndex(x => x.PaymentDate);
    }
}
