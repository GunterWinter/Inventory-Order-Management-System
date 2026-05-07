using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using static Domain.Common.Constants;

namespace Infrastructure.DataAccessManager.EFCore.Configurations;

public class PurchaseOrderItemConfiguration : BaseEntityConfiguration<PurchaseOrderItem>
{
    public override void Configure(EntityTypeBuilder<PurchaseOrderItem> builder)
    {
        base.Configure(builder);

        builder.Property(x => x.PurchaseOrderId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.ProductId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.WarehouseId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.BatchNumber).HasMaxLength(CodeConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.SupplierWarrantyMonths).IsRequired(false);
        builder.Property(x => x.Summary).HasMaxLength(DescriptionConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.TaxId).HasMaxLength(IdConsts.MaxLength).IsRequired(false);
        builder.Property(x => x.UnitPrice).IsRequired(false);
        builder.Property(x => x.Quantity).IsRequired(false);
        builder.Property(x => x.Total).IsRequired(false);
        builder.Property(x => x.TaxAmount).IsRequired(false);
        builder.Property(x => x.AfterTaxAmount).IsRequired(false);

    }
}

