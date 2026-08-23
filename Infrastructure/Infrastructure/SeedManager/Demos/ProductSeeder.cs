using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos
{
    public class ProductSeeder
    {
        private readonly ICommandRepository<Product> _productRepository;
        private readonly ICommandRepository<ProductGroup> _productGroupRepository;
        private readonly ICommandRepository<Warehouse> _warehouseRepository;
        private readonly NumberSequenceService _numberSequenceService;
        private readonly IUnitOfWork _unitOfWork;

        public ProductSeeder(
            ICommandRepository<Product> productRepository,
            ICommandRepository<ProductGroup> productGroupRepository,
            ICommandRepository<Warehouse> warehouseRepository,
            NumberSequenceService numberSequenceService,
            IUnitOfWork unitOfWork
        )
        {
            _productRepository = productRepository;
            _productGroupRepository = productGroupRepository;
            _warehouseRepository = warehouseRepository;
            _numberSequenceService = numberSequenceService;
            _unitOfWork = unitOfWork;
        }

        public async Task GenerateDataAsync()
        {
            var defaultWarehouseId = await _warehouseRepository.GetQuery()
                .Where(x => !x.IsDeleted && x.SystemWarehouse == false)
                .OrderBy(x => x.Name == DemoSeedData.MainWarehouse ? 0 : 1)
                .Select(x => x.Id)
                .FirstOrDefaultAsync();

            var groups = await _productGroupRepository.GetQuery().Where(x => !x.IsDeleted).ToListAsync();
            var electricalGroupId = groups.Single(x => x.Name == "Vật tư điện").Id;
            var serialGroupId = groups.Single(x => x.Name == "Thiết bị có serial").Id;
            var furnitureGroupId = groups.Single(x => x.Name == "Nội thất").Id;
            var serviceGroupId = groups.Single(x => x.Name == "Dịch vụ").Id;
            var productsToSeed = new List<(string Name, string Ref, string Desc, decimal Price, decimal Cost, int Warranty, string UnitName, string GroupId, SerialTrackingMode TrackingMode, string FixedCode)>
            {
                ("LED dây 12V", "MAT-LED-001", "Vật tư không theo dõi serial", 500000, 350000, 0, "Cuộn", electricalGroupId, SerialTrackingMode.None, ""),
                ("Ván MDF chống ẩm", "MAT-MDF-001", "Vật tư ván không theo dõi serial", 800000, 600000, 0, "Tấm", furnitureGroupId, SerialTrackingMode.None, ""),
                ("Smart Tivi Sony 4K 55 inch", "ELEC-TV-001", "Thiết bị dùng serial nội bộ tự sinh", 12500000, 10500000, 24, "Chiếc", serialGroupId, SerialTrackingMode.InternalAuto, "TV"),
                ("Điều hòa Daikin Inverter 1 HP", "ELEC-AC-001", "Thiết bị dùng serial nội bộ tự sinh", 9500000, 8000000, 12, "Bộ", serialGroupId, SerialTrackingMode.InternalAuto, "AC"),
                ("Máy giặt LG Inverter 9kg", "ELEC-WM-001", "Thiết bị dùng serial nhà sản xuất", 8900000, 7100000, 24, "Chiếc", serialGroupId, SerialTrackingMode.ManufacturerSerial, ""),
                ("Camera WiFi EZVIZ C6N 1080p", "SM-CAM-001", "Thiết bị dùng serial nhà sản xuất", 650000, 450000, 24, "Cái", serialGroupId, SerialTrackingMode.ManufacturerSerial, ""),
                ("Ghế xoay văn phòng", "FURN-CHR-001", "Hàng vật lý không theo dõi serial", 1200000, 850000, 0, "Cái", furnitureGroupId, SerialTrackingMode.None, ""),
                ("Công tắc thông minh Tuya", "SM-SW-001", "Thiết bị dùng serial nội bộ tự sinh", 350000, 220000, 12, "Cái", serialGroupId, SerialTrackingMode.InternalAuto, "SW")
            };

            foreach (var item in productsToSeed)
            {
                var product = await _productRepository
                    .GetQuery()
                    .FirstOrDefaultAsync(x => !x.IsDeleted && x.ReferenceCode == item.Ref);

                var isNewProduct = product == null;
                product ??= new Product
                {
                    Number = _numberSequenceService.GenerateNumber(nameof(Product), "", "ART")
                };

                product.Name = item.Name;
                product.ReferenceCode = item.Ref;
                product.Description = item.Desc;
                product.UnitPrice = item.Price;
                product.CostPrice = item.Cost;
                product.Physical = true;
                product.SerialTrackingMode = item.TrackingMode;
                product.InternalSerialFixedCode = item.TrackingMode == SerialTrackingMode.InternalAuto ? item.FixedCode : null;
                product.DefaultWarehouseId = defaultWarehouseId;
                product.DefaultWarrantyMonths = item.Warranty;
                product.UnitMeasureName = item.UnitName;
                product.ProductGroupId = item.GroupId;

                if (isNewProduct)
                {
                    await _productRepository.CreateAsync(product);
                }
                else
                {
                    _productRepository.Update(product);
                }
            }

            var service = await _productRepository.GetQuery()
                .FirstOrDefaultAsync(x => !x.IsDeleted && x.ReferenceCode == "SERVICE-DESK-001");
            var isNewService = service == null;
            service ??= new Product { Number = _numberSequenceService.GenerateNumber(nameof(Product), "", "ART") };
            service.Name = "Bàn làm việc/Dịch vụ";
            service.ReferenceCode = "SERVICE-DESK-001";
            service.Description = "Sản phẩm đầu ra tổng hợp, không quản lý tồn kho";
            service.UnitPrice = 2000000;
            service.CostPrice = 0;
            service.Physical = false;
            service.SerialTrackingMode = SerialTrackingMode.None;
            service.InternalSerialFixedCode = null;
            service.DefaultWarehouseId = null;
            service.DefaultWarrantyMonths = null;
            service.UnitMeasureName = "Dịch vụ";
            service.ProductGroupId = serviceGroupId;
            if (isNewService) await _productRepository.CreateAsync(service);
            else _productRepository.Update(service);

            var voucher = await _productRepository.GetQuery()
                .FirstOrDefaultAsync(x => !x.IsDeleted && x.ReferenceCode == "SERVICE-VOUCHER-001");
            var isNewVoucher = voucher == null;
            voucher ??= new Product { Number = _numberSequenceService.GenerateNumber(nameof(Product), "", "ART") };
            voucher.Name = "Voucher / Dịch vụ thi công";
            voucher.ReferenceCode = "SERVICE-VOUCHER-001";
            voucher.Description = "Hàng phi vật lý, không có kho, serial hoặc tồn kho";
            voucher.UnitPrice = 500000;
            voucher.CostPrice = 0;
            voucher.Physical = false;
            voucher.SerialTrackingMode = SerialTrackingMode.None;
            voucher.InternalSerialFixedCode = null;
            voucher.DefaultWarehouseId = null;
            voucher.DefaultWarrantyMonths = null;
            voucher.UnitMeasureName = "Dịch vụ";
            voucher.ProductGroupId = serviceGroupId;
            if (isNewVoucher) await _productRepository.CreateAsync(voucher);
            else _productRepository.Update(voucher);

            await _unitOfWork.SaveAsync();
        }
    }
}
