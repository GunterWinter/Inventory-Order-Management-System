using Application.Common.Repositories;
using Domain.Common;
using Domain.Entities;

namespace Infrastructure.SeedManager.Systems;

public class CompanySeeder
{
    private readonly ICommandRepository<Company> _repository;
    private readonly IUnitOfWork _unitOfWork;

    public CompanySeeder(
        ICommandRepository<Company> repository,
        IUnitOfWork unitOfWork
    )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var entity = _repository.GetQuery().FirstOrDefault(x => !x.IsDeleted);
        if (entity != null)
        {
            return;
        }

        entity = new Company
        {
            CreatedAtUtc = AppDateTime.VietnamNow(),
            IsDeleted = false,
            Name = "Architech Việt Nam",
            Currency = "VND",
            Street = "15/29 Nguyễn Thiện Thuật, Tân Tiến",
            City = "Nha Trang",
            State = "Khánh Hòa",
            ZipCode = "650000",
            Country = "Việt Nam",
            PhoneNumber = "0979 788 978",
            FaxNumber = "",
            EmailAddress = "info@architechvietnam.com",
            Website = "https://architechvietnam.com/"
        };

        await _repository.CreateAsync(entity);
        await _unitOfWork.SaveAsync();
    }
}
