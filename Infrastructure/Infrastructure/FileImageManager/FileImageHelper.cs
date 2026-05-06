namespace Infrastructure.FileImageManager;
public static class FileImageHelper
{
    private static readonly Dictionary<string, string> MimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        { ".jpg", "image/jpeg" },
        { ".jpeg", "image/jpeg" },
        { ".png", "image/png" },
        { ".gif", "image/gif" },
        { ".bmp", "image/bmp" },
        { ".webp", "image/webp" },
    };

    public static string AllowedExtensionsText => string.Join(", ", MimeTypes.Keys);

    public static bool IsSupportedImageExtension(string? fileNameOrExtension)
    {
        var extension = NormalizeExtension(fileNameOrExtension);
        return MimeTypes.ContainsKey(extension);
    }

    public static string? GetSafeImageExtension(string? fileNameOrExtension)
    {
        var extension = NormalizeExtension(fileNameOrExtension);
        return MimeTypes.ContainsKey(extension)
            ? extension.TrimStart('.')
            : null;
    }

    public static string GetMimeType(string extension)
    {
        extension = NormalizeExtension(extension);

        if (string.IsNullOrEmpty(extension))
            throw new Exception($"Extension cannot be null or empty: {nameof(extension)}");

        return MimeTypes.TryGetValue(extension, out var mimeType)
            ? mimeType
            : "application/octet-stream";
    }

    private static string NormalizeExtension(string? fileNameOrExtension)
    {
        if (string.IsNullOrWhiteSpace(fileNameOrExtension))
        {
            return string.Empty;
        }

        var value = fileNameOrExtension.Trim();
        var extension = Path.GetExtension(value);
        if (string.IsNullOrWhiteSpace(extension))
        {
            extension = value;
        }

        extension = extension.Trim().TrimStart('.');

        return string.IsNullOrWhiteSpace(extension)
            ? string.Empty
            : $".{extension.ToLowerInvariant()}";
    }
}
