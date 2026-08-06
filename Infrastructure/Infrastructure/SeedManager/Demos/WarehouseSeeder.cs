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
            var warehouses = new[]
            {
                ("Kho thiết bị nhà thông minh", "Kho chính cho thiết bị điện, camera và smart home."),
                ("Kho nội thất và điện máy", "Kho bàn ghế, nội thất và thiết bị điện máy."),
                ("Kho dự án Hà Nội", "Kho trung chuyển cho công trình miền Bắc."),
                ("Kho bảo hành và hàng trả", "Kho vật lý riêng cho hàng chờ xử lý bảo hành.")
            };

            foreach (var item in warehouses)
            {
                if (_repository.GetQuery().Any(x => !x.IsDeleted && x.Name == item.Item1)) continue;
                await _repository.CreateAsync(new Warehouse
                {
                    Name = item.Item1,
                    Description = item.Item2,
                    SystemWarehouse = false
                });
            }

            await _unitOfWork.SaveAsync();
        }
    }
}
