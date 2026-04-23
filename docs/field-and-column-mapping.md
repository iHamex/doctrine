# Field and Column Mapping

Field and column mapping is the bridge between your PHP entity properties and the database schema. Doctrine provides a rich set of built-in types and a powerful API to handle everything from simple scalars to complex Value Objects. This chapter covers the complete mapping landscape.

## The `#[Column]` Attribute

The `#[ORM\Column]` attribute is the primary tool for mapping a property to a database column. Its most important argument is `type`, which tells Doctrine how to convert the value between PHP and the database.

```php
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class Product
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::INTEGER)]
    private ?int $id;

    #[ORM\Column(type: Types::STRING, length: 255)]
    private string $name;
}
```

!!! tip "Use the `Types` Constants"
    Always use the constants from `Doctrine\DBAL\Types\Types` (e.g., `Types::STRING`) instead of magic strings (`'string'`). This improves readability and prevents typos.

## Built-in Mapping Types

Doctrine comes with a wide array of built-in types. Here are the most common ones:

| PHP Type(s)            | `Types` Constant            | Description & Common SQL Types                          | Example Usage                                                              |
|------------------------|-----------------------------|---------------------------------------------------------|----------------------------------------------------------------------------|
| `string`               | `STRING`                    | A string. `VARCHAR(255)` by default.                    | `#[Column(type: Types::STRING, length: 100)]`                              |
| `string`               | `TEXT`                      | For long strings. `TEXT` or `CLOB`.                     | `#[Column(type: Types::TEXT)]`                                             |
| `int`                  | `INTEGER`                   | A 32-bit integer. `INT`.                                | `#[Column(type: Types::INTEGER)]`                                          |
| `int`                  | `SMALLINT`                  | A 16-bit integer. `SMALLINT`.                           | `#[Column(type: Types::SMALLINT)]`                                         |
| `string`               | `BIGINT`                    | A 64-bit integer (represented as a string in PHP). `BIGINT`. | `#[Column(type: Types::BIGINT)]`                                           |
| `bool`                 | `BOOLEAN`                   | A boolean value. `TINYINT(1)` or `BOOLEAN`.             | `#[Column(type: Types::BOOLEAN)]`                                          |
| `string`               | `DECIMAL`                   | For precise fixed-point numbers. `DECIMAL` or `NUMERIC`. | `#[Column(type: Types::DECIMAL, precision: 10, scale: 2)]`                 |
| `float`                | `FLOAT`                     | A floating-point number. `FLOAT` or `DOUBLE PRECISION`. | `#[Column(type: Types::FLOAT)]`                                            |
| `\DateTime`            | `DATETIME_MUTABLE`          | A date and time. `DATETIME` or `TIMESTAMP`.             | `#[Column(type: Types::DATETIME_MUTABLE)]`                                 |
| `\DateTimeImmutable`   | `DATETIME_IMMUTABLE`        | An immutable date and time. `DATETIME` or `TIMESTAMP`.    | `#[Column(type: Types::DATETIME_IMMUTABLE)]`                               |
| `\DateTime`            | `DATE_MUTABLE`              | A date only. `DATE`.                                    | `#[Column(type: Types::DATE_MUTABLE)]`                                     |
| `\DateTimeImmutable`   | `DATE_IMMUTABLE`            | An immutable date only. `DATE`.                         | `#[Column(type: Types::DATE_IMMUTABLE)]`                                   |
| `\DateTime`            | `TIME_MUTABLE`              | A time only. `TIME`.                                    | `#[Column(type: Types::TIME_MUTABLE)]`                                     |
| `\DateTimeImmutable`   | `TIME_IMMUTABLE`            | An immutable time only. `TIME`.                         | `#[Column(type: Types::TIME_IMMUTABLE)]`                                   |
| `\DateInterval`        | `DATEINTERVAL`              | A date interval. Maps to a `VARCHAR`.                   | `#[Column(type: Types::DATEINTERVAL)]`                                     |
| `array`                | `JSON`                      | An array stored as JSON. `JSON` or `TEXT`.                | `#[Column(type: Types::JSON)]`                                             |
| `array`                | `SIMPLE_ARRAY`              | An array of strings, comma-separated. `TEXT`.           | `#[Column(type: Types::SIMPLE_ARRAY)]`                                     |
| `string`               | `GUID` / `UUID`             | A globally unique identifier. `UUID` or `CHAR(36)`.       | `#[Column(type: Types::UUID)]`                                             |
| `resource`             | `BINARY` / `BLOB`           | Binary data (e.g., file contents). `BLOB`.                | `#[Column(type: Types::BLOB)]`                                             |

### Date and Time Best Practices

- **Use `DATETIME_IMMUTABLE`**: Always prefer `\DateTimeImmutable` over `\DateTime` to prevent accidental modification of your timestamps. This makes your entities more predictable and robust.
- **Timezones**: Doctrine saves all `DateTime` objects with the timezone information provided. It's a best practice to set a default timezone (e.g., `UTC`) in your `php.ini` or application bootstrap to ensure consistency.

## Column Options

The `#[Column]` attribute accepts several other arguments to fine-tune the database schema.

- `name`: Specifies the column name. If omitted, it's generated by the [Naming Strategy](#naming-strategy). `#[Column(name: 'user_email')]`
- `length`: For `string` types, sets the `VARCHAR` length. `#[Column(type: Types::STRING, length: 150)]`
- `precision`: For `decimal` types, the total number of digits. `#[Column(type: Types::DECIMAL, precision: 10, scale: 2)]`
- `scale`: For `decimal` types, the number of digits after the decimal point.
- `unique`: Creates a unique constraint on the column. `#[Column(type: Types::STRING, unique: true)]`
- `nullable`: Allows the column to be `NULL`. By default, columns are not nullable. `#[Column(type: Types::STRING, nullable: true)]`
- `insertable`: A boolean. If set to `false`, this column will be omitted from `INSERT` statements. Useful for columns that are managed entirely by the database (e.g., a timestamp with a database-level default).
- `updatable`: A boolean. If set to `false`, this column will be omitted from `UPDATE` statements. Ideal for immutable values like a `createdAt` timestamp.

```php
#[ORM\Column(type: Types::DATETIME_IMMUTABLE, updatable: false)]
private \DateTimeImmutable $createdAt;

// This property is managed by a database trigger or default value
#[ORM\Column(type: Types::INTEGER, insertable: false, updatable: false)]
private int $legacyVersion;
```

## Custom Mapping Types

One of Doctrine's most powerful features is the ability to create your own mapping types. This allows you to represent database columns as rich PHP Value Objects instead of primitive types, leading to safer and more expressive code.

Let's say we want to represent an email address not as a simple `string`, but as a dedicated `EmailAddress` Value Object that guarantees validity.

**1. Create the Value Object**

```php
// src/VO/EmailAddress.php
<?php
namespace App\VO;

final class EmailAddress
{
    private readonly string $value;

    public function __construct(string $value)
    {
        if (!filter_var($value, FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException("Invalid email address.");
        }
        $this->value = $value;
    }

    public function __toString(): string
    {
        return $this->value;
    }
}
```

**2. Create the Custom Type**

Next, create a Doctrine type that tells Doctrine how to convert this object to and from a database string.

```php
// src/Doctrine/Type/EmailAddressType.php
<?php
namespace App\Doctrine\Type;

use App\VO\EmailAddress;
use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Types\StringType;

class EmailAddressType extends StringType
{
    public const NAME = 'email_address';

    public function convertToPHPValue($value, AbstractPlatform $platform): ?EmailAddress
    {
        return $value ? new EmailAddress($value) : null;
    }

    public function convertToDatabaseValue($value, AbstractPlatform $platform): ?string
    {
        return $value instanceof EmailAddress ? (string) $value : $value;
    }

    public function getName(): string
    {
        return self::NAME;
    }
}
```

**3. Register the Custom Type**

In your `bootstrap.php`, register the new type. For a more robust setup, especially in a framework context, you should register types via the configuration.

```php
// bootstrap.php
use Doctrine\DBAL\Types\Type;

// ... after require_once
if (!Type::hasType(App\Doctrine\Type\EmailAddressType::NAME)) {
    Type::addType(App\Doctrine\Type\EmailAddressType::NAME, App\Doctrine\Type\EmailAddressType::class);
}
```
Checking `!Type::hasType()` prevents errors in environments where the bootstrap file might be included multiple times (like in a test suite runner).

**4. Use the Custom Type in an Entity**

Now you can use `email_address` as a type in your column mapping.

```php
use App\VO\EmailAddress;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class User
{
    #[ORM\Column(type: 'email_address', unique: true)]
    private EmailAddress $email;

    public function setEmail(EmailAddress $email): void
    {
        $this->email = $email;
    }
    
    public function getEmail(): EmailAddress
    {
        return $this->email;
    }
}
```
Now, your entity is guaranteed to always hold a valid `EmailAddress` object. Type safety is enforced at the database mapping layer.

## Mapping Enums (PHP 8.1+)

For PHP 8.1+, Doctrine can natively map backed enums to database columns. This is the recommended way to handle fields with a fixed set of possible values (like a status).

**1. Define the Enum**

```php
// src/Enum/UserStatus.php
<?php
namespace App\Enum;

enum UserStatus: string
{
    case Pending = 'pending';
    case Active = 'active';
    case Suspended = 'suspended';
}
```

**2. Map the Enum in Your Entity**

Use the `enumType` option in the `#[ORM\Column]` attribute.

```php
use App\Enum\UserStatus;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class User
{
    #[ORM\Column(type: 'string', enumType: UserStatus::class)]
    private UserStatus $status;
    
    public function __construct()
    {
        $this->status = UserStatus::Pending;
    }

    public function getStatus(): UserStatus
    {
        return $this->status;
    }
    
    public function suspend(): void
    {
        $this->status = UserStatus::Suspended;
    }
}
```
Doctrine will automatically convert the enum case to its backed value (`'pending'`, `'active'`, etc.) when saving to the database and convert it back to an enum case when reading.

!!! tip "Enum vs. Custom Type"
    - Use **Enums** for simple, fixed sets of scalar values (strings, integers).
    - Use **Custom Mapping Types** for complex Value Objects that have their own behavior and validation rules.

## The `options` Attribute

The `options` key in `#[ORM\Column]` is a powerful escape hatch that lets you pass database-specific information directly into the DDL statements.

### Database-Level Defaults

While you can set defaults in your PHP constructor, setting them at the database level provides a stronger guarantee.

```php
#[ORM\Column(
    type: 'boolean',
    options: ['default' => true]
)]
private bool $isActive = true;

#[ORM\Column(
    type: 'datetime',
    options: ['default' => 'CURRENT_TIMESTAMP']
)]
private \DateTime $createdAt;
```
This will generate `DEFAULT 1` or `DEFAULT CURRENT_TIMESTAMP` in the `CREATE TABLE` statement.

!!! warning "PHP vs. Database Defaults"
    Be aware of the difference:
    - **PHP Default** (e.g., `private bool $isActive = true;`): The value is set by PHP when the object is instantiated. It will be part of the `INSERT` statement. If you create the object but don't persist it, it has the default value in memory.
    - **Database Default** (using `options: ['default' => ...]`): The value is set by the database *only if you do not provide one*. The property in PHP will be `null` until the entity is persisted and then re-fetched from the database.
    
    For `NOT NULL` columns, it's often best to set the default in both places to ensure the PHP object is always in a valid state.

### Adding Comments

Documenting your schema is crucial for maintainability. You can add comments to columns directly from your entities.

```php
#[ORM\Column(
    type: 'string',
    options: ['comment' => 'The user\'s full legal name.']
)]
private string $name;
```

### Collation Settings

For string-based columns, you can specify a collation to control how the database sorts and compares strings. This is especially important for multi-lingual applications.

```php
#[ORM\Column(
    type: 'string',
    options: ['collation' => 'utf8mb4_unicode_ci']
)]
private string $title;
```

## Overriding Column Definitions

For ultimate control, the `columnDefinition` attribute lets you write the exact SQL for the column's DDL. This is useful for leveraging database-specific column types that Doctrine doesn't support natively.

```php
#[ORM\Column(
    type: 'string', // The PHP type
    columnDefinition: 'MEDIUMTEXT'
)]
private string $articleBody;

#[ORM\Column(
    type: 'json',
    columnDefinition: 'JSONB' // Use PostgreSQL's binary JSON type
)]
private array $metadata;
```

!!! warning "Loss of Portability"
    Using `columnDefinition` or database-specific `options` will tie your entity to a specific database vendor (e.g., MySQL, PostgreSQL). Use these features sparingly if cross-database compatibility is a goal.

## Naming Strategy

By default, Doctrine converts `camelCase` property names to `snake_case` column names (`userName` -> `user_name`). You can change this behavior globally by implementing a custom `NamingStrategy`.

For example, to prevent any name conversion (useful for legacy schemas where column names are already camelCased), you could use the `DefaultNamingStrategy`.

```php
// In bootstrap.php
use Doctrine\ORM\Mapping\DefaultNamingStrategy;

$config->setNamingStrategy(new DefaultNamingStrategy());
```
Now, a property named `userName` will map to a column named `userName`, not `user_name`.

!!! tip "Custom Naming Strategies for Advanced Cases"
    You can implement your own naming strategy by creating a class that implements the `Doctrine\ORM\Mapping\NamingStrategy` interface. This is useful for complex legacy schemas, for example, to automatically add a table-name prefix to every column (`user_name` -> `tbl_users_user_name`).

## Next Steps

With a firm grasp of field and column mappings, you are ready to explore how Doctrine handles relationships between entities. Proceed to the **[Relationships Introduction](relationships-introduction.md)** chapter.

