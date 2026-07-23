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
            var defaultWarehouseId = await _warehouseRepository.GetQuery().Where(x => !x.IsDeleted && x.SystemWarehouse == false).Select(x => x.Id).FirstOrDefaultAsync();
            var unitCai = await _unitMeasureRepository.GetQuery().Where(x => !x.IsDeleted && x.Name == "Cái").Select(x => x.Id).FirstOrDefaultAsync();
            var unitChiec = await _unitMeasureRepository.GetQuery().Where(x => !x.IsDeleted && x.Name == "Chiếc").Select(x => x.Id).FirstOrDefaultAsync();
            var unitBo = await _unitMeasureRepository.GetQuery().Where(x => !x.IsDeleted && x.Name == "Bộ").Select(x => x.Id).FirstOrDefaultAsync();

            var groups = await _productGroupRepository.GetQuery().Where(x => !x.IsDeleted).ToListAsync();
            var groupThietBiDien = groups.FirstOrDefault(x => x.Name == "Thiết bị điện")?.Id;
            var groupDienMay = groups.FirstOrDefault(x => x.Name == "Điện máy gia dụng")?.Id;
            var groupNoiThatVP = groups.FirstOrDefault(x => x.Name == "Nội thất văn phòng")?.Id;
            var groupNoiThatGD = groups.FirstOrDefault(x => x.Name == "Nội thất gia đình")?.Id;
            var groupThietBiTM = groups.FirstOrDefault(x => x.Name == "Thiết bị nhà thông minh")?.Id;
            var groupCamera = groups.FirstOrDefault(x => x.Name == "Camera an ninh")?.Id;

            var productsToSeed = new List<(string Name, string Ref, string Desc, double Price, double Cost, int Warranty, string UnitId, string GroupId)>
            {
                ("Tủ lạnh Samsung Inverter 236L", "ELEC-REF-001", "Tủ lạnh tiết kiệm điện thế hệ mới", 6500000, 5200000, 24, unitChiec ?? unitCai ?? "", groupDienMay ?? ""),
                ("Máy giặt LG Inverter 9kg", "ELEC-WM-001", "Máy giặt lồng ngang thông minh", 8900000, 7100000, 24, unitChiec ?? unitCai ?? "", groupDienMay ?? ""),
                ("Smart Tivi Sony 4K 55 inch", "ELEC-TV-001", "Tivi Sony 4K UHD viền mỏng", 12500000, 10500000, 24, unitChiec ?? unitCai ?? "", groupDienMay ?? ""),
                ("Điều hòa Daikin Inverter 1 HP", "ELEC-AC-001", "Điều hòa tiết kiệm điện, làm lạnh nhanh", 9500000, 8000000, 12, unitBo ?? unitCai ?? "", groupThietBiDien ?? ""),
                ("Quạt đứng Mitsubishi Electric", "ELEC-FAN-001", "Quạt đứng êm ái, độ bền cao", 1850000, 1400000, 12, unitChiec ?? unitCai ?? "", groupThietBiDien ?? ""),

                ("Bàn làm việc chữ L gỗ công nghiệp", "FURN-DSK-001", "Bàn làm việc góc chữ L cao cấp", 2500000, 1800000, 12, unitCai ?? "", groupNoiThatVP ?? ""),
                ("Ghế xoay văn phòng lưới Ergonomic", "FURN-CHR-001", "Ghế công thái học bảo vệ cột sống", 1200000, 850000, 12, unitCai ?? "", groupNoiThatVP ?? ""),
                ("Tủ hồ sơ sắt 2 cánh kính", "FURN-CAB-001", "Tủ sắt đựng tài liệu văn phòng", 1950000, 1500000, 12, unitCai ?? "", groupNoiThatVP ?? ""),
                ("Sofa phòng khách nỉ Hàn Quốc", "FURN-SOF-001", "Sofa góc nỉ cao cấp hiện đại", 8500000, 6000000, 24, unitBo ?? unitCai ?? "", groupNoiThatGD ?? ""),
                ("Bàn ăn gỗ sồi 6 ghế", "FURN-TBL-001", "Bộ bàn ăn gia đình gỗ sồi Nga", 6500000, 4800000, 12, unitBo ?? unitCai ?? "", groupNoiThatGD ?? ""),

                ("Camera WiFi EZVIZ C6N 1080p", "SM-CAM-001", "Camera xoay 360 độ trong nhà", 650000, 450000, 24, unitCai ?? "", groupCamera ?? ""),
                ("Camera ngoài trời IMOU Bullet 2C", "SM-CAM-002", "Camera chống nước IP67", 850000, 600000, 24, unitCai ?? "", groupCamera ?? ""),
                ("Công tắc thông minh Tuya WiFi 1 nút", "SM-SW-001", "Công tắc mặt kính cảm ứng", 350000, 220000, 12, unitCai ?? "", groupThietBiTM ?? ""),
                ("Công tắc thông minh Tuya WiFi 3 nút", "SM-SW-003", "Công tắc mặt kính cảm ứng 3 viền", 450000, 280000, 12, unitCai ?? "", groupThietBiTM ?? ""),
                ("Ổ cắm thông minh Xiaomi Mi Smart", "SM-PLG-001", "Ổ cắm WiFi đo điện năng", 290000, 190000, 12, unitCai ?? "", groupThietBiTM ?? ""),
                ("Cảm biến cửa thông minh Aqara", "SM-SEN-001", "Cảm biến đóng mở cửa Zigbee", 320000, 230000, 12, unitCai ?? "", groupThietBiTM ?? ""),
                ("Khóa cửa vân tay Kassler", "SM-LCK-001", "Khóa điện tử thông minh đa tính năng", 4500000, 3200000, 24, unitBo ?? unitCai ?? "", groupThietBiTM ?? "")
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
                product.DefaultWarehouseId = defaultWarehouseId;
                product.DefaultWarrantyMonths = item.Warranty;
                product.UnitMeasureId = item.UnitId;
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

            await _unitOfWork.SaveAsync();
        }
    }
}
