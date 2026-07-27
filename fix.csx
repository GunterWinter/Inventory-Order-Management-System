using System.IO;
using System.Text.RegularExpressions;

var dir = @"D:\Inventory-Order-Management-System\Core\Application\Features\MaterialExportManager";
var files = Directory.GetFiles(dir, "*.cs", SearchOption.AllDirectories);

foreach (var file in files) {
    var content = File.ReadAllText(file);
    
    // Add missing properties in DTOs/Commands
    content = Regex.Replace(content, @"public string\? Number \{ get; set; \}", "public string? Number { get; set; }\n    public string? PurchaseOrderId { get; set; }\n    public string? CustomerId { get; set; }");
    content = Regex.Replace(content, @"public string\? Number \{ get; init; \}", "public string? Number { get; init; }\n    public string? PurchaseOrderId { get; init; }\n    public string? CustomerId { get; init; }");
    
    content = Regex.Replace(content, @"public string\? ProductId \{ get; init; \}", "public string? ProductId { get; init; }\n    public string? PurchaseOrderItemId { get; init; }");
    content = Regex.Replace(content, @"public string\? ProductId \{ get; set; \}", "public string? ProductId { get; set; }\n    public string? PurchaseOrderItemId { get; set; }");
    
    content = Regex.Replace(content, @"entity\.Number = request\.Number;", "entity.Number = request.Number;\n        entity.PurchaseOrderId = request.PurchaseOrderId;\n        entity.CustomerId = request.CustomerId;");
    content = Regex.Replace(content, @"item\.ProductId = reqItem\.ProductId;", "item.ProductId = reqItem.ProductId;\n                item.PurchaseOrderItemId = reqItem.PurchaseOrderItemId;");
    
    File.WriteAllText(file, content);
}
