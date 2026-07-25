using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class CustomerContactSeeder
{
    private readonly ICommandRepository<CustomerContact> _customerContactRepository;
    private readonly ICommandRepository<Customer> _customerRepository;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly IUnitOfWork _unitOfWork;

    public CustomerContactSeeder(
        ICommandRepository<CustomerContact> customerContactRepository,
        ICommandRepository<Customer> customerRepository,
        NumberSequenceService numberSequenceService,
        IUnitOfWork unitOfWork
    )
    {
        _customerContactRepository = customerContactRepository;
        _customerRepository = customerRepository;
        _numberSequenceService = numberSequenceService;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        // Guard: nếu đã có contact thì không tạo lại
        if (await _customerContactRepository.GetQuery().AnyAsync(x => !x.IsDeleted))
        {
            return;
        }

        var firstNames = new string[]
        {
            "Minh", "Hương", "Tuấn", "Lan", "Đức", "Thảo",
            "Khoa", "Mai", "Phong", "Ngọc", "Quang", "Linh",
            "Trung", "Hà", "Bảo", "Trang", "Hoàng", "Yến",
            "Dũng", "Thanh"
        };

        var lastNames = new string[]
        {
            "Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh",
            "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ",
            "Hồ", "Ngô", "Dương", "Lý", "Đinh", "Lương",
            "Trịnh", "Tô"
        };

        var jobTitles = new string[]
        {
            "Giám đốc", "Kỹ sư IT", "Trưởng phòng dự án", "Nhân viên kinh doanh",
            "Tư vấn kỹ thuật", "Chuyên viên marketing", "Nghiên cứu thị trường", "Biên tập nội dung",
            "Quản lý vận hành", "Kế toán trưởng", "Lập trình viên", "Chăm sóc khách hàng",
            "Điều phối dự án", "Kiểm thử phần mềm", "Nhân sự", "Tổ chức sự kiện",
            "Quản lý tài khoản", "Quản trị mạng", "Trưởng phòng kinh doanh", "Trợ lý pháp lý"
        };

        var customerIds = await _customerRepository.GetQuery()
            .Where(x => !x.IsDeleted)
            .Select(x => x.Id)
            .ToListAsync();
        var random = new Random(42); // Fixed seed for reproducibility

        var customerContacts = new List<CustomerContact>();

        foreach (var customerId in customerIds)
        {
            for (int i = 0; i < 3; i++)
            {
                var firstName = GetRandomString(firstNames, random);
                var lastName = GetRandomString(lastNames, random);

                customerContacts.Add(new CustomerContact
                {
                    Name = $"{lastName} {firstName}",
                    Number = _numberSequenceService.GenerateNumber(nameof(CustomerContact), "", "CC"),
                    CustomerId = customerId,
                    JobTitle = GetRandomString(jobTitles, random),
                    EmailAddress = $"{RemoveDiacritics(firstName).ToLower()}.{RemoveDiacritics(lastName).ToLower()}@company.vn",
                    PhoneNumber = GenerateRandomPhoneNumber(random)
                });
            }
        }

        foreach (var contact in customerContacts)
        {
            await _customerContactRepository.CreateAsync(contact);
        }

        await _unitOfWork.SaveAsync();
    }

    private static string GetRandomString(string[] array, Random random)
    {
        return array[random.Next(array.Length)];
    }

    private static string GenerateRandomPhoneNumber(Random random)
    {
        var prefixes = new[] { "09", "03", "07", "08" };
        var prefix = prefixes[random.Next(prefixes.Length)];
        return $"{prefix}{random.Next(10, 99)} {random.Next(100, 999)} {random.Next(100, 999)}";
    }

    private static string RemoveDiacritics(string text)
    {
        var map = new Dictionary<char, char>
        {
            {'á','a'},{'à','a'},{'ả','a'},{'ã','a'},{'ạ','a'},{'ă','a'},{'ắ','a'},{'ằ','a'},{'ẳ','a'},{'ẵ','a'},{'ặ','a'},{'â','a'},{'ấ','a'},{'ầ','a'},{'ẩ','a'},{'ẫ','a'},{'ậ','a'},
            {'é','e'},{'è','e'},{'ẻ','e'},{'ẽ','e'},{'ẹ','e'},{'ê','e'},{'ế','e'},{'ề','e'},{'ể','e'},{'ễ','e'},{'ệ','e'},
            {'í','i'},{'ì','i'},{'ỉ','i'},{'ĩ','i'},{'ị','i'},
            {'ó','o'},{'ò','o'},{'ỏ','o'},{'õ','o'},{'ọ','o'},{'ô','o'},{'ố','o'},{'ồ','o'},{'ổ','o'},{'ỗ','o'},{'ộ','o'},{'ơ','o'},{'ớ','o'},{'ờ','o'},{'ở','o'},{'ỡ','o'},{'ợ','o'},
            {'ú','u'},{'ù','u'},{'ủ','u'},{'ũ','u'},{'ụ','u'},{'ư','u'},{'ứ','u'},{'ừ','u'},{'ử','u'},{'ữ','u'},{'ự','u'},
            {'ý','y'},{'ỳ','y'},{'ỷ','y'},{'ỹ','y'},{'ỵ','y'},
            {'đ','d'},
            {'Á','A'},{'À','A'},{'Ả','A'},{'Ã','A'},{'Ạ','A'},{'Ă','A'},{'Ắ','A'},{'Ằ','A'},{'Ẳ','A'},{'Ẵ','A'},{'Ặ','A'},{'Â','A'},{'Ấ','A'},{'Ầ','A'},{'Ẩ','A'},{'Ẫ','A'},{'Ậ','A'},
            {'É','E'},{'È','E'},{'Ẻ','E'},{'Ẽ','E'},{'Ẹ','E'},{'Ê','E'},{'Ế','E'},{'Ề','E'},{'Ể','E'},{'Ễ','E'},{'Ệ','E'},
            {'Í','I'},{'Ì','I'},{'Ỉ','I'},{'Ĩ','I'},{'Ị','I'},
            {'Ó','O'},{'Ò','O'},{'Ỏ','O'},{'Õ','O'},{'Ọ','O'},{'Ô','O'},{'Ố','O'},{'Ồ','O'},{'Ổ','O'},{'Ỗ','O'},{'Ộ','O'},{'Ơ','O'},{'Ớ','O'},{'Ờ','O'},{'Ở','O'},{'Ỡ','O'},{'Ợ','O'},
            {'Ú','U'},{'Ù','U'},{'Ủ','U'},{'Ũ','U'},{'Ụ','U'},{'Ư','U'},{'Ứ','U'},{'Ừ','U'},{'Ử','U'},{'Ữ','U'},{'Ự','U'},
            {'Ý','Y'},{'Ỳ','Y'},{'Ỷ','Y'},{'Ỹ','Y'},{'Ỵ','Y'},
            {'Đ','D'}
        };
        return new string(text.Select(c => map.ContainsKey(c) ? map[c] : c).ToArray());
    }
}
