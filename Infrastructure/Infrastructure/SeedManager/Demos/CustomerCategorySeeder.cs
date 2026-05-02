using Application.Common.Repositories;
using Domain.Entities;

namespace Infrastructure.SeedManager.Demos;

public class CustomerCategorySeeder
{
    private readonly ICommandRepository<CustomerCategory> _categoryRepository;
    private readonly IUnitOfWork _unitOfWork;

    public CustomerCategorySeeder(
        ICommandRepository<CustomerCategory> categoryRepository,
        IUnitOfWork unitOfWork
    )
    {
        _categoryRepository = categoryRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var customerCategories = new List<CustomerCategory>
        {
            new CustomerCategory { Name = "Căn hộ" },
            new CustomerCategory { Name = "Nhà phố" },
            new CustomerCategory { Name = "Biệt thự" },
            new CustomerCategory { Name = "Văn phòng" },
            new CustomerCategory { Name = "Showroom nội thất" }
        };

        foreach (var category in customerCategories)
        {
            if (!_categoryRepository.GetQuery().Any(x => !x.IsDeleted && x.Name == category.Name))
            {
                await _categoryRepository.CreateAsync(category);
            }
        }

        await _unitOfWork.SaveAsync();
    }
}


