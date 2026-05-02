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

        var isNewCompany = entity == null;
        entity ??= new Company
        {
            CreatedAtUtc = AppDateTime.VietnamNow(),
            IsDeleted = false
        };

        entity.Name = "Architech Việt Nam";
        entity.Currency = "VND";
        entity.Street = "15/29 Nguyễn Thiện Thuật, Tân Tiến";
        entity.City = "Nha Trang";
        entity.State = "Khánh Hòa";
        entity.ZipCode = "650000";
        entity.Country = "Việt Nam";
        entity.PhoneNumber = "0979 788 978";
        entity.FaxNumber = "";
        entity.EmailAddress = "info@architechvietnam.com";
        entity.Website = "https://architechvietnam.com/";

        if (isNewCompany)
        {
            await _repository.CreateAsync(entity);
        }
        else
        {
            _repository.Update(entity);
        }

        await _unitOfWork.SaveAsync();
    }
}
