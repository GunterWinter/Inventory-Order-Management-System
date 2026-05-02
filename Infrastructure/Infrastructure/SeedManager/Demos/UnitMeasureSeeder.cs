using Application.Common.Repositories;
using Domain.Entities;

namespace Infrastructure.SeedManager.Demos;

public class UnitMeasureSeeder
{
    private readonly ICommandRepository<UnitMeasure> _unitMeasureRepository;
    private readonly IUnitOfWork _unitOfWork;

    public UnitMeasureSeeder(
        ICommandRepository<UnitMeasure> unitMeasureRepository,
        IUnitOfWork unitOfWork
    )
    {
        _unitMeasureRepository = unitMeasureRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var unitMeasures = new List<UnitMeasure>
        {
            new UnitMeasure { Name = "Cái" },
            new UnitMeasure { Name = "Bộ" },
            new UnitMeasure { Name = "Mét" },
            new UnitMeasure { Name = "Cuộn" },
            new UnitMeasure { Name = "Thùng" }
        };

        foreach (var unitMeasure in unitMeasures)
        {
            if (!_unitMeasureRepository.GetQuery().Any(x => !x.IsDeleted && x.Name == unitMeasure.Name))
            {
                await _unitMeasureRepository.CreateAsync(unitMeasure);
            }
        }

        await _unitOfWork.SaveAsync();
    }
}
