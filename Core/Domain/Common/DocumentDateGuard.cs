namespace Domain.Common;

public static class DocumentDateGuard
{
    public static void EnsureCanPost(DateTime? documentDate, bool isPosting)
    {
        if (isPosting && documentDate?.Date > AppDateTime.VietnamNow().Date)
            throw new InvalidOperationException("Chứng từ có ngày tương lai chỉ được lưu ở trạng thái Nháp.");
    }
}
