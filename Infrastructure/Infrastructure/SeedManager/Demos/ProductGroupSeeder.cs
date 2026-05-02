using Application.Common.Repositories;
using Domain.Entities;

namespace Infrastructure.SeedManager.Demos;

public class ProductGroupSeeder
{
    private readonly ICommandRepository<ProductGroup> _productGroupRepository;
    private readonly IUnitOfWork _unitOfWork;

    public ProductGroupSeeder(
        ICommandRepository<ProductGroup> productGroupRepository,
        IUnitOfWork unitOfWork
    )
    {
        _productGroupRepository = productGroupRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var productGroups = new List<ProductGroup>
        {
            new ProductGroup { Name = "Thiết bị nhà thông minh" },
            new ProductGroup { Name = "Công tắc thông minh" },
            new ProductGroup { Name = "Cảm biến thông minh" },
            new ProductGroup { Name = "Camera an ninh" },
            new ProductGroup { Name = "Nội thất" },
            new ProductGroup { Name = "Phụ kiện lắp đặt" }
        };

        foreach (var productGroup in productGroups)
        {
            if (!_productGroupRepository.GetQuery().Any(x => !x.IsDeleted && x.Name == productGroup.Name))
            {
                await _productGroupRepository.CreateAsync(productGroup);
            }
        }

        await _unitOfWork.SaveAsync();
    }
}
