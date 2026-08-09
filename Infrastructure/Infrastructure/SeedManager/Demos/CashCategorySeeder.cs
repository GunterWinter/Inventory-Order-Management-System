using Application.Common.Repositories;
using Domain.Entities;

namespace Infrastructure.SeedManager.Demos;

public sealed class CashCategorySeeder
{
    private readonly ICommandRepository<CashCategory> _repository;
    private readonly IUnitOfWork _unitOfWork;

    public CashCategorySeeder(
        ICommandRepository<CashCategory> repository,
        IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var categories = new[]
        {
            new CashCategory { Name = "Lương nhân viên", Description = "Chi lương hàng tháng" },
            new CashCategory { Name = "Gia công", Description = "Chi phí gia công bên ngoài" },
            new CashCategory { Name = "Xăng xe", Description = "Chi phí vận chuyển và giao hàng" },
            new CashCategory { Name = "Cho thuê mặt bằng", Description = "Thu từ cho thuê mặt bằng" },
            new CashCategory { Name = "Bán hàng", Description = "Thu tiền từ đơn bán hàng" },
            new CashCategory { Name = "Mua hàng", Description = "Chi tiền cho đơn mua hàng" }
        };

        foreach (var category in categories)
        {
            if (!_repository.GetQuery().Any(x => !x.IsDeleted && x.Name == category.Name))
            {
                await _repository.CreateAsync(category);
            }
        }

        await _unitOfWork.SaveAsync();
    }
}
