using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Infrastructure.DataAccessManager.EFCore.Configurations;

public class MaterialExportConfiguration : BaseEntityConfiguration<MaterialExport>
{
    public override void Configure(EntityTypeBuilder<MaterialExport> builder)
    {
        base.Configure(builder);
        
        builder.HasMany(x => x.MaterialExportItemList)
            .WithOne(x => x.MaterialExport)
            .HasForeignKey(x => x.MaterialExportId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.PurchaseOrder)
            .WithMany()
            .HasForeignKey(x => x.PurchaseOrderId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(x => x.Customer)
            .WithMany()
            .HasForeignKey(x => x.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
