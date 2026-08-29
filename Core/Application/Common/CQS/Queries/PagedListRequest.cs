namespace Application.Common.CQS.Queries;

public abstract class PagedListRequest
{
    public int? Page { get; init; }
    public int? PageSize { get; init; }
    public string? Search { get; init; }
    public string? SortField { get; init; }
    public string? SortDirection { get; init; }
    public int NormalizedPage => Math.Max(1, Page ?? 1);
    public int? NormalizedPageSize => PageSize.HasValue ? Math.Clamp(PageSize.Value, 1, 200) : null;
    public bool Descending => string.Equals(SortDirection, "desc", StringComparison.OrdinalIgnoreCase);
}
