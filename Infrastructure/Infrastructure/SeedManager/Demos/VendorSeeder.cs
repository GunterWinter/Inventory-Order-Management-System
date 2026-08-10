using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class VendorSeeder
{
    private readonly ICommandRepository<Vendor> _repository;
    private readonly ICommandRepository<VendorGroup> _groupRepository;
    private readonly ICommandRepository<VendorCategory> _categoryRepository;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly IUnitOfWork _unitOfWork;

    public VendorSeeder(
        ICommandRepository<Vendor> repository,
        ICommandRepository<VendorGroup> groupRepository,
        ICommandRepository<VendorCategory> categoryRepository,
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
            (DemoSeedData.ContractorVendor, "0908000001", "anhlan@example.test"),
            (DemoSeedData.ElectricalVendor, "0908000002", "diennama@example.test"),
            (DemoSeedData.FurnitureVendor, "0908000003", "mocviet@example.test")
        };

        for (var index = 0; index < data.Length; index++)
        {
            var item = data[index];
            if (await _repository.GetQuery().AnyAsync(x => !x.IsDeleted && x.Name == item.Item1)) continue;

            await _repository.CreateAsync(new Vendor
            {
                Number = _numberSequenceService.GenerateNumber(nameof(Vendor), string.Empty, "VND"),
                Name = item.Item1,
                VendorGroupId = groups[index % groups.Count].Id,
                VendorCategoryId = categories[index % categories.Count].Id,
                Street = "Địa chỉ nhà cung cấp demo",
                City = "TP. Hồ Chí Minh",
                State = "TP. Hồ Chí Minh",
                ZipCode = "700000",
                Country = "Việt Nam",
                PhoneNumber = item.Item2,
                EmailAddress = item.Item3,
                Description = "Nhà cung cấp demo dùng cho mua hàng, công thợ và gia công."
            });
        }

        await _unitOfWork.SaveAsync();
    }
}
