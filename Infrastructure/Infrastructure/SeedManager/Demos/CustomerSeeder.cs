using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class CustomerSeeder
{
    private readonly ICommandRepository<Customer> _customerRepository;
    private readonly ICommandRepository<CustomerGroup> _groupRepository;
    private readonly ICommandRepository<CustomerCategory> _categoryRepository;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly IUnitOfWork _unitOfWork;

    public CustomerSeeder(
        ICommandRepository<Customer> customerRepository,
        ICommandRepository<CustomerGroup> groupRepository,
        ICommandRepository<CustomerCategory> categoryRepository,
        NumberSequenceService numberSequenceService,
        IUnitOfWork unitOfWork
    )
    {
        _customerRepository = customerRepository;
        _groupRepository = groupRepository;
        _categoryRepository = categoryRepository;
        _numberSequenceService = numberSequenceService;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var groups = await _groupRepository.GetQuery().Where(x => !x.IsDeleted).OrderBy(x => x.Name).ToListAsync();
        var categories = await _categoryRepository.GetQuery().Where(x => !x.IsDeleted).OrderBy(x => x.Name).ToListAsync();
        var customers = new[]
        {
            ("Công Ty Nội Thất Thông Minh Việt", "12 Nguyễn Văn Hưởng", "TP. Hồ Chí Minh", "0909123456", "duan@noithatthongminh.vn"),
            ("Công Ty Cổ Phần Kiến Trúc Ánh Dương", "88 Nguyễn Hữu Cảnh", "TP. Hồ Chí Minh", "0908234567", "muahang@anhduong.vn"),
            ("Chủ Đầu Tư Riverside Residence", "02 Tôn Đức Thắng", "TP. Hồ Chí Minh", "0917345678", "bql@riverside.vn"),
            ("Công Ty TNHH Xây Dựng Đại Phát", "145 Võ Văn Tần", "TP. Hồ Chí Minh", "0936456789", "dutoan@daiphat.vn"),
            ("Showroom Nội Thất Mộc Gia", "230 Điện Biên Phủ", "TP. Hồ Chí Minh", "0985567890", "showroom@mocgia.vn"),
            ("Đại Lý Thiết Bị Smart Home Hà Nội", "52 Duy Tân", "Hà Nội", "0974678901", "daily@smarthomehn.vn"),
            ("Khách Sạn Biển Xanh Đà Nẵng", "118 Võ Nguyên Giáp", "Đà Nẵng", "0963789012", "engineering@bienxanh.vn"),
            ("Văn Phòng Luật Minh Tâm", "36 Lê Lợi", "TP. Hồ Chí Minh", "0952890123", "admin@minhtam.vn")
        };

        for (var index = 0; index < customers.Length; index++)
        {
            var item = customers[index];
            if (await _customerRepository.GetQuery().AnyAsync(x => !x.IsDeleted && x.Name == item.Item1)) continue;

            await _customerRepository.CreateAsync(new Customer
            {
                Number = _numberSequenceService.GenerateNumber(nameof(Customer), "", "CST"),
                Name = item.Item1,
                CustomerGroupId = groups[index % groups.Count].Id,
                CustomerCategoryId = categories[index % categories.Count].Id,
                Street = item.Item2,
                City = item.Item3,
                State = item.Item3,
                ZipCode = item.Item3 == "Hà Nội" ? "100000" : "700000",
                Country = "Việt Nam",
                PhoneNumber = item.Item4,
                EmailAddress = item.Item5,
                Description = "Dữ liệu demo có liên kết đơn hàng, kho và tài chính."
            });
        }
        await _unitOfWork.SaveAsync();
    }
}
