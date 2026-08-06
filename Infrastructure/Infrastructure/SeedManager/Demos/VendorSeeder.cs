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
        var groups = await _groupRepository.GetQuery().Where(x => !x.IsDeleted).OrderBy(x => x.Name).ToListAsync();
        var categories = await _categoryRepository.GetQuery().Where(x => !x.IsDeleted).OrderBy(x => x.Name).ToListAsync();
        var vendors = new[]
        {
            ("YUEQING NOVA ELECTRONICS CO.,LTD", "Yueqing", "China", "+8618058336905", "ruby@moespower.com"),
            ("Công Ty TNHH Thiết Bị Điện Schneider Việt Nam", "TP. Hồ Chí Minh", "Việt Nam", "02839115500", "sales@schneider-demo.vn"),
            ("Công Ty Phân Phối Camera An Phát", "Hà Nội", "Việt Nam", "02473008899", "kinhdoanh@anphatcamera.vn"),
            ("Nội Thất Gỗ Mộc Việt", "Bình Dương", "Việt Nam", "02743778899", "donhang@mocviet.vn"),
            ("Công Ty Cổ Phần Điện Máy Nam Á", "Đà Nẵng", "Việt Nam", "02363776688", "purchase@nama.vn"),
            ("Shenzhen Smart Sensor Technology Ltd.", "Shenzhen", "China", "+8675528846688", "export@smartsensor.example")
        };

        for (var index = 0; index < vendors.Length; index++)
        {
            var item = vendors[index];
            if (await _vendorRepository.GetQuery().AnyAsync(x => !x.IsDeleted && x.Name == item.Item1)) continue;

            await _vendorRepository.CreateAsync(new Vendor
            {
                Number = _numberSequenceService.GenerateNumber(nameof(Vendor), "", "VND"),
                Name = item.Item1,
                VendorGroupId = groups[index % groups.Count].Id,
                VendorCategoryId = categories[index % categories.Count].Id,
                Street = index == 0 ? "NO.238 Wei 11 Road" : "Địa chỉ nhà cung cấp demo",
                City = item.Item2,
                State = item.Item2,
                ZipCode = index == 0 ? "325600" : "700000",
                Country = item.Item3,
                PhoneNumber = item.Item4,
                EmailAddress = item.Item5,
                Description = "Nhà cung cấp demo có dữ liệu mua hàng và công nợ liên kết."
            });
        }
        await _unitOfWork.SaveAsync();
    }
}
