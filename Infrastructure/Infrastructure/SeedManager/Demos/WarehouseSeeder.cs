using Application.Common.Repositories;
using Domain.Entities;

namespace Infrastructure.SeedManager.Demos
{
    public class WarehouseSeeder
    {
        private readonly ICommandRepository<Warehouse> _repository;
        private readonly IUnitOfWork _unitOfWork;

        public WarehouseSeeder(
            ICommandRepository<Warehouse> repository,
            IUnitOfWork unitOfWork
        )
        {
            _repository = repository;
            _unitOfWork = unitOfWork;
        }

        public async Task GenerateDataAsync()
        {
            if (_repository.GetQuery().Any(x => !x.IsDeleted && x.Name == "Kho thiết bị nhà thông minh"))
            {
                return;
            }

            await _repository.CreateAsync(new Warehouse
            {
                Name = "Kho thiết bị nhà thông minh",
                Description = "Kho vật lý demo cho thiết bị nhà thông minh và nội thất.",
                SystemWarehouse = false
            });

            await _unitOfWork.SaveAsync();
        }
    }
}
