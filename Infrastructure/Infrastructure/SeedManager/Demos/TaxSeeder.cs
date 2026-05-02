using Application.Common.Repositories;
using Domain.Entities;

namespace Infrastructure.SeedManager.Demos;

public class TaxSeeder
{
    private readonly ICommandRepository<Tax> _repository;
    private readonly IUnitOfWork _unitOfWork;

    public TaxSeeder(
        ICommandRepository<Tax> repository,
        IUnitOfWork unitOfWork
    )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var taxes = new List<Tax>
        {
            new Tax { Name = "Không thuế", Percentage = 0.0 },
            new Tax { Name = "VAT 8%", Percentage = 8.0 },
            new Tax { Name = "VAT 10%", Percentage = 10.0 }
        };

        foreach (var tax in taxes)
        {
            if (!_repository.GetQuery().Any(x => !x.IsDeleted && x.Name == tax.Name))
            {
                await _repository.CreateAsync(tax);
            }
        }

        await _unitOfWork.SaveAsync();
    }
}

