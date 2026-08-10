using Application.Common.Repositories;
using Domain.Entities;

namespace Infrastructure.SeedManager.Demos;

public class WarehouseSeeder
{
    private readonly ICommandRepository<Warehouse> _repository;
    private readonly IUnitOfWork _unitOfWork;

    public WarehouseSeeder(ICommandRepository<Warehouse> repository, IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var data = new[]
        {
            (DemoSeedData.MainWarehouse, "Kho nhập và xuất chính."),
            (DemoSeedData.ProjectWarehouse, "Kho trung chuyển vật tư công trình."),
            (DemoSeedData.WarrantyWarehouse, "Kho hàng trả và chờ xử lý bảo hành.")
        };

        foreach (var item in data)
        {
            if (_repository.GetQuery().Any(x => !x.IsDeleted && x.Name == item.Item1)) continue;
            await _repository.CreateAsync(new Warehouse
            {
                Name = item.Item1,
                Description = item.Item2,
                SystemWarehouse = false
            });
        }

        await _unitOfWork.SaveAsync();
    }
}
