# Mastering Entities

Entities are the heart of any Doctrine application. They are the primary objects you design and work with, representing the core of your application's domain model. This chapter goes beyond the basics to explore the principles of effective entity design.

## The Anatomy of an Entity

A well-designed entity is more than just a collection of properties. It has three key components:

1.  **Identity**: A unique identifier that distinguishes one entity from another. This is managed by the `#[ORM\Id]` attribute.
2.  **State**: The properties of the entity, which are mapped to database columns using `#[ORM\Column]`. This represents the data the entity holds.
3.  **Behavior**: The methods on the entity that enforce business rules and manipulate its state. **This is the most critical and often overlooked aspect of entity design.**

## Rich vs. Anemic Entities: A Best Practice

A common pitfall is to create "anemic" entities—classes that have only getters and setters and no business logic. This forces you to place business rules in services or controllers, leading to scattered logic and a less maintainable codebase.

Doctrine empowers you to build **rich domain models**, where your entities encapsulate their own logic.

### Anemic Example (What to Avoid)

```php
// Anemic approach
$user = $userRepository->find($userId);
$user->setStatus('approved'); // <-- Stringly-typed, no logic
$user->setApprovedAt(new \DateTime()); // <-- Logic is outside the entity

$entityManager->flush();
```
This is fragile. What if a developer forgets to set the `approvedAt` date? The application's state becomes inconsistent.

### Rich Example (The Recommended Way)

Now, let's move the logic into the entity itself using a more practical example: a `BlogPost` that can be a `draft`, `published`, or `archived`.

```php
#[ORM\Entity]
class BlogPost
{
    // ... id, title, content properties ...

    #[ORM\Column(type: 'string')]
    private string $status = 'draft';

    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $publishedAt = null;

    public function publish(): void
    {
        if ($this->status !== 'draft') {
            throw new \LogicException('Only a draft post can be published.');
        }

        $this->status = 'published';
        $this->publishedAt = new \DateTimeImmutable();
    }
    
    public function archive(): void
    {
        if ($this->status !== 'published') {
            throw new \LogicException('Only a published post can be archived.');
        }
        $this->status = 'archived';
    }

    public function getStatus(): string 
    {
        return $this->status;
    }
}

// Rich, expressive usage in your application service
$post = $postRepository->find($postId);
$post->publish(); // <-- Clear, intentional, and encapsulates logic

$entityManager->flush();
```
By adding the `publish()` and `archive()` methods, we've created a simple state machine. The business rules are now protected within the entity itself, preventing invalid state transitions.

!!! tip "Keep Your Entities Pure"
    Your entities should focus on in-memory business logic. Avoid calling services, accessing the `EntityManager`, or dispatching events from within an entity. Handle such "side effects" in services or through [Doctrine Events](events.md).

## Entity Lifecycle Callbacks

Doctrine provides a powerful mechanism to execute code in response to entity lifecycle events (like `persist`, `update`, `remove`). This is perfect for tasks that should always happen, such as setting timestamps.

To use lifecycle callbacks, you first need to mark the entity with the `#[ORM\HasLifecycleCallbacks]` attribute. Then, you can annotate public methods with the callback attributes.

**Example: Automatically Setting Timestamps**

```php
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\HasLifecycleCallbacks]
class Product
{
    // ... id, name, etc. ...

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private ?\DateTimeImmutable $updatedAt = null;
    
    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }
    
    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTimeImmutable();
    }
}
```

Now, you don't need to manage these dates in your application code. Doctrine will automatically call `onPrePersist()` right before a new `Product` is first saved, and `onPreUpdate()` right before an existing one is updated.

The available lifecycle callbacks are:
- `PrePersist`: Before a new entity is first persisted.
- `PostPersist`: After a new entity is first persisted.
- `PreUpdate`: Before an entity's `UPDATE` statement is executed.
- `PostUpdate`: After an entity's `UPDATE` statement is executed.
- `PreRemove`: Before an entity is removed.
- `PostRemove`: After an entity is removed.
- `PostLoad`: After an entity is loaded from the database.

## Custom Repositories

For any non-trivial application, you'll need to write custom queries. Instead of scattering DQL snippets throughout your codebase, Doctrine allows you to create a dedicated **Repository** class for each entity.

To specify a custom repository, use the `repositoryClass` argument on the `#[ORM\Entity]` attribute:

```php
<?php
// src/Entity/User.php
namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: UserRepository::class)]
class User
{
    // ...
}
```

Now, create the `UserRepository` class. It must extend `Doctrine\ORM\EntityRepository`. A common best practice is to also implement a type-hinted `find()` method to improve static analysis and IDE support.

```php
<?php
// src/Repository/UserRepository.php
namespace App\Repository;

use App\Entity\User;
use Doctrine\ORM\EntityRepository;

class UserRepository extends EntityRepository
{
    /**
     * Override the default find method to provide a type hint.
     *
     * @return User|null
     */
    public function find($id, $lockMode = null, $lockVersion = null): ?object
    {
        return parent::find($id, $lockMode, $lockVersion);
    }

    /**
     * @return User[]
     */
    public function findActiveUsersOrderedByName(): array
    {
        return $this->createQueryBuilder('u')
            ->andWhere('u.status = :status')
            ->setParameter('status', 'approved')
            ->orderBy('u.name', 'ASC')
            ->getQuery()
            ->getResult();
    }
}
```
Now, when you fetch the repository, Doctrine will return an instance of your custom class, giving you access to your specialized finder methods:

```php
$userRepository = $entityManager->getRepository(User::class);
// $userRepository is now an instance of App\Repository\UserRepository

$activeUsers = $userRepository->findActiveUsersOrderedByName();
```

## Generated Value Strategies

Doctrine provides several strategies for generating primary key values. You specify this with the `strategy` argument in `#[ORM\GeneratedValue]`.

-   `AUTO` (default): Doctrine picks the most suitable strategy for the database platform (e.g., `IDENTITY` for MySQL, `SEQUENCE` for PostgreSQL).
-   `IDENTITY`: Tells Doctrine that the database will generate the ID upon insertion (e.g., using `AUTO_INCREMENT` in MySQL). The ID is only available *after* `flush()` is called.
-   `SEQUENCE`: Uses a database sequence to generate the ID *before* insertion. This is more common in Oracle and PostgreSQL.
-   `UUID`: Generates a universally unique identifier (UUID). The value is generated in PHP by Doctrine, so it's available *before* `flush()`.
-   `CUSTOM`: Allows you to provide your own custom ID generator class. This is for highly specialized use cases.
-   `NONE`: You are responsible for generating and setting the ID yourself before persisting the entity. This is for advanced use cases where you manage IDs externally.

### Choosing the Right Strategy

| Strategy   | Pros                                                              | Cons                                                              | Best For                                                              |
|------------|-------------------------------------------------------------------|-------------------------------------------------------------------|-----------------------------------------------------------------------|
| `AUTO`     | Simple, portable across databases.                                | The actual strategy can be opaque.                                | Most standard applications where the exact ID strategy isn't critical. |
| `IDENTITY` | Simple, efficient for single-server setups (especially MySQL).    | ID is only available after `flush()`. Can make batch inserts awkward. | Simple applications using MySQL or SQLite.                             |
| `SEQUENCE` | ID is available before `flush()`. Better for batch inserts.       | Requires an extra query to fetch the ID. Slower for single inserts. | Applications using PostgreSQL or Oracle, especially with batch operations. |
| `UUID`     | Globally unique, can be generated anywhere. Hides record counts.  | Larger storage size (36 chars). Can impact index performance.     | Distributed systems, public APIs, or when you need IDs before flushing. |
| `CUSTOM`   | Complete control over ID generation.                              | Requires writing and maintaining a custom generator class.        | When you need to implement a non-standard algorithm like ULID or a Hi/Lo strategy. |

### Example: Using UUIDs for Primary Keys

UUIDs are excellent for distributed systems and for obscuring database record counts.

```php
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class Product
{
    #[ORM\Id]
    #[ORM\Column(type: 'uuid', unique: true)]
    #[ORM\GeneratedValue(strategy: 'UUID')]
    private string $id;
    
    public function __construct()
    {
        // The UUID is generated by Doctrine, but you can also generate it yourself
        // if using a library like ramsey/uuid.
    }
    
    // ...
}
!!! warning "UUID Column Type"
    When using UUIDs, ensure your column type is set to `uuid` (`#[ORM\Column(type: 'uuid')]`). This maps to the native `UUID` type in databases like PostgreSQL or a `CHAR(36)` in MySQL.

## Modeling with Value Objects (Embeddables)

A core principle of Domain-Driven Design is the use of **Value Objects**—small objects that represent a simple value or concept, like a monetary amount or a date range. Their identity is defined by their attributes, not by a unique ID, and they should be immutable.

Doctrine allows you to model Value Objects using **Embeddables**. An embeddable is a PHP class that is not an entity itself but can be embedded within an entity.

**Example: An `Address` Value Object**

Let's say multiple entities (like `User`, `Company`, `Warehouse`) need an address. Instead of duplicating the `street`, `city`, `zipCode` fields everywhere, we can create an `Address` embeddable.

**1. Create the Embeddable Class**

Create a new file `src/Embeddable/Address.php`. The class is a plain PHP object marked with `#[ORM\Embeddable]`.

```php
<?php
// src/Embeddable/Address.php
namespace App\Embeddable;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Embeddable]
class Address
{
    #[ORM\Column(type: 'string')]
    private string $street;

    #[ORM\Column(type: 'string')]
    private string $city;

    #[ORM\Column(type: 'string')]
    private string $zipCode;

    public function __construct(string $street, string $city, string $zipCode)
    {
        $this->street = $street;
        $this->city = $city;
        $this->zipCode = $zipCode;
    }
    
    // ... Getters for street, city, zipCode ...
}
```
!!! tip "Embeddables Should Be Immutable"
    Notice the `Address` class has no setters. This is a best practice. If an address needs to change, you should create a *new* `Address` instance and replace the old one.

**2. Embed it in an Entity**

Now, use the `#[ORM\Embedded]` attribute in your entity to include the `Address`.

```php
<?php
// src/Entity/User.php
namespace App\Entity;

use App\Embeddable\Address;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class User
{
    // ... id, name ...

    #[ORM\Embedded(class: Address::class, columnPrefix: 'shipping_')]
    private Address $shippingAddress;
    
    public function __construct(string $name, Address $shippingAddress)
    {
        $this->name = $name;
        $this->shippingAddress = $shippingAddress;
    }
    
    public function getShippingAddress(): Address
    {
        return $this->shippingAddress;
    }
}
```

**How it Works in the Database:**

Doctrine does not create a separate `addresses` table. Instead, it "inlines" the fields of the `Address` object directly into the `users` table. The `columnPrefix` argument is crucial for avoiding name collisions if you embed multiple addresses. You can set `columnPrefix: false` if you want to use the exact property names from the embeddable, but this can be risky.

The resulting `users` table schema would look like this:
- `id`
- `name`
- `shipping_street`
- `shipping_city`
- `shipping_zip_code`

Embeddables are a powerful tool for creating richer, more expressive domain models and reducing duplication.

### Overriding Embeddable Columns

Sometimes, you might need to embed the same Value Object multiple times in one entity with different column names or types. For example, a `User` might have a `shippingAddress` and a `billingAddress`. You can use `#[ORM\AttributeOverrides]` to customize the mapping for each embedded property.

```php
#[ORM\Entity]
class User
{
    // ...
    #[ORM\Embedded(class: Address::class, columnPrefix: 'shipping_')]
    private Address $shippingAddress;

    #[ORM\Embedded(class: Address::class, columnPrefix: 'billing_')]
    #[ORM\AttributeOverrides([
        new ORM\AttributeOverride(
            name: 'street',
            column: new ORM\Column(name: 'billing_street_line_1', type: 'string', length: 255)
        ),
        new ORM\AttributeOverride(
            name: 'city',
            column: new ORM\Column(name: 'billing_city_name', type: 'string', length: 100)
        )
    ])]
    private Address $billingAddress;
}
```
In this example, the `billingAddress` will be mapped to `billing_street_line_1` and `billing_city_name`, demonstrating complete control over the final database schema.

## Read-Only Entities

In some cases, you may want Doctrine to manage an entity for reading but prevent it from ever being modified. This is useful for data that comes from views, legacy tables, or for enforcing strict read-only boundaries in your application (e.g., in a CQRS pattern).

Marking an entity as read-only tells Doctrine to ignore it during `flush()` operations, providing a slight performance boost and a strong guarantee against accidental writes.

```php
#[ORM\Entity(readOnly: true)]
class MonthlySalesReport
{
    #[ORM\Id]
    #[ORM\Column(type: 'integer')]
    private int $id;

    #[ORM\Column(type: 'string')]
    private string $month;
    
    #[ORM\Column(type: 'decimal', precision: 10, scale: 2)]
    private string $totalSales;
}
```
Any attempt to call `$entityManager->persist()` or `$entityManager->remove()` on a read-only entity will result in an exception. If you modify a loaded read-only entity, the changes will be ignored when `flush` is called, without any warning.

## Next Steps

Now that you have a solid understanding of entity design, the next step is to learn about the different ways to map properties to database columns. Proceed to the **[Field and Column Mapping](field-and-column-mapping.md)** chapter.

