using Application.Common.Repositories;
using Domain.Entities;

namespace Infrastructure.SeedManager.Demos;

public class VendorGroupSeeder
{
    private readonly ICommandRepository<VendorGroup> _groupRepository;
    private readonly IUnitOfWork _unitOfWork;

    public VendorGroupSeeder(
        ICommandRepository<VendorGroup> groupRepository,
        IUnitOfWork unitOfWork
    )
    {
        _groupRepository = groupRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var vendorGroups = new List<VendorGroup>
        {
            new VendorGroup { Name = "Nhà sản xuất" },
            new VendorGroup { Name = "Phân phối" },
            new VendorGroup { Name = "Nhập khẩu chính hãng" },
            new VendorGroup { Name = "Đơn vị thi công" },
            new VendorGroup { Name = "Nhà cung cấp nội thất" }
        };

        foreach (var group in vendorGroups)
        {
            if (!_groupRepository.GetQuery().Any(x => !x.IsDeleted && x.Name == group.Name))
            {
                await _groupRepository.CreateAsync(group);
            }
        }

        await _unitOfWork.SaveAsync();
    }
}
