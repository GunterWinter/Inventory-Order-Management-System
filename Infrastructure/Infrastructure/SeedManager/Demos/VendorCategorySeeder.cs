using Application.Common.Repositories;
using Domain.Entities;

namespace Infrastructure.SeedManager.Demos;

public class VendorCategorySeeder
{
    private readonly ICommandRepository<VendorCategory> _categoryRepository;
    private readonly IUnitOfWork _unitOfWork;

    public VendorCategorySeeder(
        ICommandRepository<VendorCategory> categoryRepository,
        IUnitOfWork unitOfWork
    )
    {
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var vendorCategories = new List<VendorCategory>
        {
            new VendorCategory { Name = "Toàn Quốc" },
            new VendorCategory { Name = "Quốc Tế" },
            new VendorCategory { Name = "Thiết bị nhà thông minh" },
            new VendorCategory { Name = "Nội thất" },
            new VendorCategory { Name = "Phụ kiện lắp đặt" }
        };

        foreach (var category in vendorCategories)
        {
            if (!_categoryRepository.GetQuery().Any(x => !x.IsDeleted && x.Name == category.Name))
            {
                await _categoryRepository.CreateAsync(category);
            }
        }

        await _unitOfWork.SaveAsync();
    }
}
