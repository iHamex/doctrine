# Inheritance Mapping

Inheritance is a powerful feature of object-oriented programming that allows you to create a hierarchy of classes. Doctrine provides two primary strategies for mapping these hierarchies to a relational database: **Single Table Inheritance** and **Joined Table Inheritance**.

## Single Table Inheritance (STI)

This strategy stores all classes in the hierarchy in a single database table. A special "discriminator" column is used to identify which class each row belongs to.

**Use Case**: Best for simple hierarchies where the subclasses have few, if any, additional fields. For example, different types of `Notification` (`EmailNotification`, `SmsNotification`) that share most of their data.

### Example: A Notification System

```php
#[ORM\Entity]
#[ORM\InheritanceType('SINGLE_TABLE')]
#[ORM\DiscriminatorColumn(name: 'type', type: 'string')]
#[ORM\DiscriminatorMap(['email' => EmailNotification::class, 'sms' => SmsNotification::class])]
abstract class Notification
{
    #[ORM\Id, ORM\Column(type: 'integer'), ORM\GeneratedValue]
    protected ?int $id = null;

    #[ORM\Column(type: 'datetime_immutable')]
    protected \DateTimeImmutable $createdAt;
    
    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false)]
    protected User $recipient;

    public function __construct(User $recipient)
    {
        $this->recipient = $recipient;
        $this->createdAt = new \DateTimeImmutable();
    }
}

#[ORM\Entity]
class EmailNotification extends Notification
{
    #[ORM\Column(type: 'string')]
    private string $subject;
}

#[ORM\Entity]
class SmsNotification extends Notification
{
    #[ORM\Column(type: 'string')]
    private string $phoneNumber;
}
```

#### The Resulting Database Table (`notification`):

| id  | type  | created_at          | recipient_id | subject             | phone_number |
| --- | ----- | ------------------- | ------------ | ------------------- | ------------ |
| 1   | email | 2023-10-27 10:00:00 | 123          | "Welcome aboard!"   | `NULL`       |
| 2   | sms   | 2023-10-27 10:05:00 | 456          | `NULL`              | "+15551234"  |

#### Pros and Cons of STI:

-   **Pro**: Very fast. No `JOIN`s are needed to fetch any type of notification.
-   **Pro**: Simple schema. Everything is in one place.
-   **Con**: Schema can become bloated with `NULL`able columns if subclasses have many different fields.
-   **Con**: You cannot use `NOT NULL` constraints on subclass-specific fields at the database level.

---

## Joined Table Inheritance (JTI)

This strategy creates a separate table for each class in the hierarchy. The base class table holds the common fields, and each subclass table holds only its specific fields and a foreign key back to the base table.

**Use Case**: Best for complex hierarchies where subclasses have many distinct fields and you want a normalized database schema. For example, different types of `Product` (`Book`, `Dvd`, `Clothing`) with very different attributes.

### Example: A Product Catalog

```php
#[ORM\Entity]
#[ORM\InheritanceType('JOINED')]
#[ORM\DiscriminatorColumn(name: 'type', type: 'string')]
#[ORM\DiscriminatorMap(['book' => Book::class, 'dvd' => Dvd::class])]
abstract class Product
{
    #[ORM\Id, ORM\Column(type: 'integer'), ORM\GeneratedValue]
    protected ?int $id = null;
    
    #[ORM\Column(type: 'string')]
    protected string $name;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 2)]
    protected string $price;

    public function __construct(string $name, string $price)
    {
        $this->name = $name;
        $this->price = $price;
    }
}

#[ORM\Entity]
class Book extends Product
{
    #[ORM\Column(type: 'string')]
    private string $isbn;
}

#[ORM\Entity]
class Dvd extends Product
{
    #[ORM\Column(type: 'integer')]
    private int $runtimeMinutes;

    public function __construct(string $name, string $price, int $runtimeMinutes)
    {
        parent::__construct($name, $price);
        $this->runtimeMinutes = $runtimeMinutes;
    }
}
```

#### The Resulting Database Tables:

**`product` table:**

| id  | type | name          | price  |
| --- | ---- | ------------- | ------ |
| 1   | book | "PHP 8 In Depth" | 49.99  |
| 2   | dvd  | "Doctrine Pro" | 29.99  |

**`book` table:**

| id  | isbn              |
| --- | ----------------- |
| 1   | "978-3-16-148410-0" |

**`dvd` table:**

| id  | runtime_minutes |
| --- | --------------- |
| 2   | 125             |

#### Pros and Cons of JTI:

-   **Pro**: Normalized schema. No `NULL`able columns for subclass-specific fields. You can use `NOT NULL` constraints.
-   **Pro**: Clean and easy to understand tables.
-   **Con**: Slower reads. Fetching a subclass (e.g., a `Book`) always requires a `JOIN` between the `product` and `book` tables.
-   **Con**: More complex schema with more tables to manage.

!!! tip "Overriding Mappings in Subclasses"
    It is possible for a subclass to override the mapping of an inherited property using `#[AttributeOverride]`. For example, a `DigitalBook` subclass could override the `weight` property from a `PhysicalBook` superclass to be nullable.

## Querying and Polymorphism

Regardless of the strategy chosen, Doctrine handles polymorphism transparently. When you query for a base class, Doctrine will return a collection of the correct subclass instances.

```php
// Using the Joined Table example above
$productRepository = $entityManager->getRepository(Product::class);

// This query will perform JOINs to fetch all product types
$allProducts = $productRepository->findAll();

foreach ($allProducts as $product) {
    if ($product instanceof Book) {
        echo "Book: " . $product->getIsbn() . "\n";
    } elseif ($product instanceof Dvd) {
        echo "DVD: " . $product->getRuntimeMinutes() . " minutes\n";
    }
}
```
You can also query directly for a specific subclass, and Doctrine will automatically add the necessary conditions on the discriminator column.

```php
$bookRepository = $entityManager->getRepository(Book::class);
$books = $bookRepository->findAll(); // Returns only Book instances
```

You can use the `INSTANCE OF` operator in DQL to filter results based on their type within a polymorphic query.

```dql
-- Select all products that are instances of Book or a subclass of Book
SELECT p FROM App\Entity\Product p WHERE p INSTANCE OF App\Entity\Book
```

## Abstract Mapped Superclasses

Sometimes you have a set of fields and methods that you want to share across several unrelated entities, but you don't want them to be part of a polymorphic hierarchy. For this, you use a **`MappedSuperclass`**.

A `MappedSuperclass` is an abstract class whose mapping information is inherited by its children, but it is not an entity itself and cannot be queried.

```php
#[ORM\MappedSuperclass]
#[ORM\HasLifecycleCallbacks]
abstract class TimestampedEntity
{
    #[ORM\Column(type: 'datetime_immutable')]
    protected \DateTimeImmutable $createdAt;
    
    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    protected ?\DateTimeImmutable $updatedAt = null;
    
    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }
}

#[ORM\Entity]
class Article extends TimestampedEntity { /* ... gets created/updatedAt */ }

#[ORM\Entity]
class User extends TimestampedEntity { /* ... also gets created/updatedAt */ }
```
This is a powerful way to reuse mapping definitions and behavior (like lifecycle callbacks) without forcing your entities into a single database table or inheritance strategy.

## Next Steps

Next, we will explore how you can hook into Doctrine's lifecycle to execute custom logic when entities are saved, updated, or deleted.

-   **[Events](events.md)**

