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
        if (await _customerRepository.GetQuery().AnyAsync(x => !x.IsDeleted && x.Name == "Công Ty Nội Thất Thông Minh Việt"))
        {
            return;
        }

        var customer = new Customer
        {
            Number = _numberSequenceService.GenerateNumber(nameof(Customer), "", "CST"),
            Name = "Công Ty Nội Thất Thông Minh Việt",
            CustomerGroupId = await _groupRepository.GetQuery().Where(x => !x.IsDeleted && x.Name == "Khách dự án nhà thông minh").Select(x => x.Id).FirstAsync(),
            CustomerCategoryId = await _categoryRepository.GetQuery().Where(x => !x.IsDeleted && x.Name == "Căn hộ").Select(x => x.Id).FirstAsync(),
            Street = "12 Nguyễn Văn Hưởng",
            City = "TP. Hồ Chí Minh",
            State = "TP. Hồ Chí Minh",
            ZipCode = "700000",
            Country = "Việt Nam",
            PhoneNumber = "0909123456",
            EmailAddress = "khachhang.demo@architech.vn",
            Website = "architech.vn",
            Description = "Khách hàng demo cho dự án thiết bị nhà thông minh và nội thất."
        };

        await _customerRepository.CreateAsync(customer);
        await _unitOfWork.SaveAsync();
    }
}
