using System.Text.Json;
using System.Text.Json.Serialization;

namespace ASPNET.BackEnd.Common.Converters;

public class FlexibleEnumConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert)
    {
        var targetType = Nullable.GetUnderlyingType(typeToConvert) ?? typeToConvert;
        return targetType.IsEnum;
    }

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        var underlyingType = Nullable.GetUnderlyingType(typeToConvert);
        if (underlyingType != null)
        {
            var nullableConverterType = typeof(NullableFlexibleEnumConverter<>).MakeGenericType(underlyingType);
            return (JsonConverter)Activator.CreateInstance(nullableConverterType)!;
        }

        var converterType = typeof(FlexibleEnumConverter<>).MakeGenericType(typeToConvert);
        return (JsonConverter)Activator.CreateInstance(converterType)!;
    }
}

public class FlexibleEnumConverter<TEnum> : JsonConverter<TEnum> where TEnum : struct, Enum
{
    public override TEnum Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Number)
        {
            if (reader.TryGetInt32(out int intValue))
            {
                return (TEnum)Enum.ToObject(typeof(TEnum), intValue);
            }
            if (reader.TryGetInt64(out long longValue))
            {
                return (TEnum)Enum.ToObject(typeof(TEnum), longValue);
            }
        }

        if (reader.TokenType == JsonTokenType.String)
        {
            string? stringValue = reader.GetString();
            if (!string.IsNullOrWhiteSpace(stringValue))
            {
                if (int.TryParse(stringValue, out int parsedInt))
                {
                    return (TEnum)Enum.ToObject(typeof(TEnum), parsedInt);
                }

                if (Enum.TryParse<TEnum>(stringValue, true, out TEnum parsedEnum))
                {
                    return parsedEnum;
                }
            }
        }

        throw new JsonException($"Cannot convert '{reader.GetString()}' to {typeof(TEnum).Name}");
    }

    public override void Write(Utf8JsonWriter writer, TEnum value, JsonSerializerOptions options)
    {
        writer.WriteNumberValue(Convert.ToInt32(value));
    }
}

public class NullableFlexibleEnumConverter<TEnum> : JsonConverter<TEnum?> where TEnum : struct, Enum
{
    private readonly FlexibleEnumConverter<TEnum> _underlyingConverter = new();

    public override TEnum? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return null;
        }

        if (reader.TokenType == JsonTokenType.String)
        {
            string? stringValue = reader.GetString();
            if (string.IsNullOrWhiteSpace(stringValue))
            {
                return null;
            }
        }

        return _underlyingConverter.Read(ref reader, typeof(TEnum), options);
    }

    public override void Write(Utf8JsonWriter writer, TEnum? value, JsonSerializerOptions options)
    {
        if (value.HasValue)
        {
            _underlyingConverter.Write(writer, value.Value, options);
        }
        else
        {
            writer.WriteNullValue();
        }
    }
}
