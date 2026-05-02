using Application.Common.Repositories;
using Domain.Entities;

namespace Infrastructure.SeedManager.Demos;

public class CustomerGroupSeeder
{
    private readonly ICommandRepository<CustomerGroup> _groupRepository;
    private readonly IUnitOfWork _unitOfWork;

    public CustomerGroupSeeder(
        ICommandRepository<CustomerGroup> groupRepository,
        IUnitOfWork unitOfWork
    )
    {
        _groupRepository = groupRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var customerGroups = new List<CustomerGroup>
        {
            new CustomerGroup { Name = "Khách lẻ" },
            new CustomerGroup { Name = "Khách dự án nhà thông minh" },
            new CustomerGroup { Name = "Chủ đầu tư" },
            new CustomerGroup { Name = "Đơn vị nội thất" },
            new CustomerGroup { Name = "Đại lý" }
        };

        foreach (var group in customerGroups)
        {
            if (!_groupRepository.GetQuery().Any(x => !x.IsDeleted && x.Name == group.Name))
            {
                await _groupRepository.CreateAsync(group);
            }
        }

        await _unitOfWork.SaveAsync();
    }
}


