using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class CustomerSeeder
{
    private readonly ICommandRepository<Customer> _repository;
    private readonly ICommandRepository<CustomerGroup> _groupRepository;
    private readonly ICommandRepository<CustomerCategory> _categoryRepository;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly IUnitOfWork _unitOfWork;

    public CustomerSeeder(
        ICommandRepository<Customer> repository,
        ICommandRepository<CustomerGroup> groupRepository,
        ICommandRepository<CustomerCategory> categoryRepository,
        NumberSequenceService numberSequenceService,
        IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _groupRepository = groupRepository;
        _categoryRepository = categoryRepository;
        _numberSequenceService = numberSequenceService;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var groups = await _groupRepository.GetQuery().Where(x => !x.IsDeleted).OrderBy(x => x.Name).ToListAsync();
        var categories = await _categoryRepository.GetQuery().Where(x => !x.IsDeleted).OrderBy(x => x.Name).ToListAsync();
        if (groups.Count == 0 || categories.Count == 0) return;

        var data = new[]
        {
            (DemoSeedData.ProjectA, "02 Tôn Đức Thắng", "0909123401", "duan-a@example.test"),
            (DemoSeedData.ProjectB, "88 Nguyễn Hữu Cảnh", "0909123402", "duan-b@example.test"),
            (DemoSeedData.CustomerShowroom, "230 Điện Biên Phủ", "0909123403", "showroom@example.test"),
            (DemoSeedData.CustomerRetail, "12 Nguyễn Văn Hưởng", "0909123404", "khachle@example.test")
        };

        for (var index = 0; index < data.Length; index++)
        {
            var item = data[index];
            if (await _repository.GetQuery().AnyAsync(x => !x.IsDeleted && x.Name == item.Item1)) continue;

            await _repository.CreateAsync(new Customer
            {
                Number = _numberSequenceService.GenerateNumber(nameof(Customer), string.Empty, "CST"),
                Name = item.Item1,
                CustomerGroupId = groups[index % groups.Count].Id,
                CustomerCategoryId = categories[index % categories.Count].Id,
                Street = item.Item2,
                City = "TP. Hồ Chí Minh",
                State = "TP. Hồ Chí Minh",
                ZipCode = "700000",
                Country = "Việt Nam",
                PhoneNumber = item.Item3,
                EmailAddress = item.Item4,
                Description = "Dữ liệu demo nhỏ, cố định để kiểm thử nghiệp vụ công trình."
            });
        }

        await _unitOfWork.SaveAsync();
    }
}
