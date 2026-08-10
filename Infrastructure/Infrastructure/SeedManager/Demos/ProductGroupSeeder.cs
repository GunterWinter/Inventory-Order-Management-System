using Application.Common.Repositories;
using Domain.Entities;

namespace Infrastructure.SeedManager.Demos;

public class ProductGroupSeeder
{
    private readonly ICommandRepository<ProductGroup> _repository;
    private readonly IUnitOfWork _unitOfWork;

    public ProductGroupSeeder(ICommandRepository<ProductGroup> repository, IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var names = new[]
        {
            "Vật tư điện",
            "Thiết bị có serial",
            "Nội thất",
            "Dịch vụ"
        };

        foreach (var name in names)
        {
            if (!_repository.GetQuery().Any(x => !x.IsDeleted && x.Name == name))
                await _repository.CreateAsync(new ProductGroup { Name = name });
        }

        await _unitOfWork.SaveAsync();
    }
}
