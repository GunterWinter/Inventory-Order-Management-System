using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class VendorSeeder
{
    private readonly ICommandRepository<Vendor> _vendorRepository;
    private readonly ICommandRepository<VendorGroup> _groupRepository;
    private readonly ICommandRepository<VendorCategory> _categoryRepository;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly IUnitOfWork _unitOfWork;

    public VendorSeeder(
        ICommandRepository<Vendor> vendorRepository,
        ICommandRepository<VendorGroup> groupRepository,
        ICommandRepository<VendorCategory> categoryRepository,
        NumberSequenceService numberSequenceService,
        IUnitOfWork unitOfWork
    )
    {
        _vendorRepository = vendorRepository;
        _groupRepository = groupRepository;
        _categoryRepository = categoryRepository;
        _numberSequenceService = numberSequenceService;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        if (await _vendorRepository.GetQuery().AnyAsync(x => !x.IsDeleted && x.Name == "YUEQING NOVA ELECTRONICS CO.,LTD"))
        {
            return;
        }

        var vendor = new Vendor
        {
            Number = _numberSequenceService.GenerateNumber(nameof(Vendor), "", "VND"),
            Name = "YUEQING NOVA ELECTRONICS CO.,LTD",
            VendorGroupId = await _groupRepository.GetQuery().Where(x => !x.IsDeleted && x.Name == "Phân phối").Select(x => x.Id).FirstAsync(),
            VendorCategoryId = await _categoryRepository.GetQuery().Where(x => !x.IsDeleted && x.Name == "Toàn Quốc").Select(x => x.Id).FirstAsync(),
            Street = "NO.238 Wei 11 Road",
            City = "Yueqing",
            State = "Zhejiang",
            ZipCode = "325600",
            Country = "China",
            PhoneNumber = "+8618058336905",
            EmailAddress = "ruby@moespower.com",
            Website = "www.moespower.com"
        };

        await _vendorRepository.CreateAsync(vendor);
        await _unitOfWork.SaveAsync();
    }
}
