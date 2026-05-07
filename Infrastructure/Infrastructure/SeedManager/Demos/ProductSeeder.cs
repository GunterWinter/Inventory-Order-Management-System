using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos
{
    public class ProductSeeder
    {
        private readonly ICommandRepository<Product> _productRepository;
        private readonly ICommandRepository<ProductGroup> _productGroupRepository;
        private readonly ICommandRepository<UnitMeasure> _unitMeasureRepository;
        private readonly ICommandRepository<Warehouse> _warehouseRepository;
        private readonly NumberSequenceService _numberSequenceService;
        private readonly IUnitOfWork _unitOfWork;

        public ProductSeeder(
            ICommandRepository<Product> productRepository,
            ICommandRepository<ProductGroup> productGroupRepository,
            ICommandRepository<UnitMeasure> unitMeasureRepository,
            ICommandRepository<Warehouse> warehouseRepository,
            NumberSequenceService numberSequenceService,
            IUnitOfWork unitOfWork
        )
        {
            _productRepository = productRepository;
            _productGroupRepository = productGroupRepository;
            _unitMeasureRepository = unitMeasureRepository;
            _warehouseRepository = warehouseRepository;
            _numberSequenceService = numberSequenceService;
            _unitOfWork = unitOfWork;
        }

        public async Task GenerateDataAsync()
        {
            var product = await _productRepository
                .GetQuery()
                .FirstOrDefaultAsync(x => !x.IsDeleted && x.ReferenceCode == "SM-SWITCH-001");

            var isNewProduct = product == null;
            product ??= new Product
            {
                Number = _numberSequenceService.GenerateNumber(nameof(Product), "", "ART")
            };

            product.Name = "Công tắc thông minh WiFi 1 nút";
            product.ReferenceCode = "SM-SWITCH-001";
            product.Description = "Sản phẩm demo cho kho thiết bị nhà thông minh.";
            product.UnitPrice = 1_352_000d;
            product.Physical = true;
            product.DefaultWarehouseId = await _warehouseRepository.GetQuery().Where(x => !x.IsDeleted && x.SystemWarehouse == false).Select(x => x.Id).FirstOrDefaultAsync();
            product.DefaultWarrantyMonths = 3;
            product.UnitMeasureId = await _unitMeasureRepository.GetQuery().Where(x => !x.IsDeleted && x.Name == "Cái").Select(x => x.Id).FirstAsync();
            product.ProductGroupId = await _productGroupRepository.GetQuery().Where(x => !x.IsDeleted && x.Name == "Thiết bị nhà thông minh").Select(x => x.Id).FirstAsync();

            if (isNewProduct)
            {
                await _productRepository.CreateAsync(product);
            }
            else
            {
                _productRepository.Update(product);
            }

            await _unitOfWork.SaveAsync();
        }
    }
}
