# Ensuring Data Integrity: Constraints and Indexes

While application-level validation is your first line of defense for ensuring data quality, **database-level constraints** are your last and most powerful line of defense. They guarantee data integrity at the source, preventing invalid data from being saved regardless of which application or tool is interacting with the database.

Doctrine allows you to define these constraints directly in your entity mapping metadata, so your database schema and application rules always stay in sync.

## Unique Constraints: Preventing Duplicates

Ensuring that certain values are unique is a fundamental data integrity rule. Doctrine provides two ways to define unique constraints.

#### Single-Column Uniqueness
For a single column that must be unique (like a user's email), you can use the `unique` flag on the `#[ORM\Column]` attribute.

```php
#[ORM\Entity]
class User
{
    // ...
    #[ORM\Column(type: 'string', unique: true)]
    private string $email;
}
```
This will generate a `UNIQUE` index on the `email` column in the database.

#### Composite Unique Constraints
Sometimes, uniqueness is determined by a combination of columns. For example, a user should only be able to vote on a specific post once. The combination of `user_id` and `post_id` must be unique.

For this, you use the `#[ORM\UniqueConstraint]` attribute, typically defined at the class level inside `#[ORM\Table]`.

```php
#[ORM\Entity]
#[ORM\Table(name: 'post_vote')]
#[ORM\UniqueConstraint(name: 'user_post_unique', columns: ['user_id', 'post_id'])]
class PostVote
{
    #[ORM\Id, ORM\ManyToOne, ORM\JoinColumn(name: 'user_id')]
    private User $user;

    #[ORM\Id, ORM\ManyToOne, ORM\JoinColumn(name: 'post_id')]
    private Post $post;

    #[ORM\Column(type: 'smallint')]
    private int $value; // e.g., +1 or -1
}
```
This ensures that the database will reject any attempt to insert a row with a `user_id` and `post_id` combination that already exists.

## Indexes: Speeding Up Your Queries

Indexes are critical for database performance. They allow the database to find rows quickly without having to scan an entire table. While primary keys and unique constraints are automatically indexed, you should add indexes to any columns that are frequently used in `WHERE`, `JOIN`, or `ORDER BY` clauses.

Like unique constraints, indexes can be defined for a single column or multiple columns (a composite index).

```php
#[ORM\Entity]
#[ORM\Table(name: 'products')]
#[ORM\Index(name: 'status_idx', columns: ['status'])]
#[ORM\Index(name: 'search_idx', columns: ['name', 'manufacturer'], flags: ['fulltext'])]
class Product
{
    // ...
    #[ORM\Column(type: 'string')]
    private string $status;

    #[ORM\Column(type: 'string')]
    private string $name;

    #[ORM\Column(type: 'string')]
    private string $manufacturer;
}
```
-   `status_idx`: A standard index on the `status` column will speed up queries like `WHERE p.status = 'published'`.
-   `search_idx`: This is a more advanced **`FULLTEXT` index**. By adding the `fulltext` flag, you are telling MySQL (or another supporting database) to create an index optimized for full-text searching. This enables powerful queries like `MATCH(p.name, p.manufacturer) AGAINST ('search term')`.

!!! tip "Organizing with `#[ORM\Table]`"
    The `#[ORM\Table]` attribute is the ideal place to define all your table-level indexes and unique constraints. It keeps your schema definitions clean, organized, and easy to find at the top of your entity file.

## Foreign Key Constraints: Referential Integrity

Foreign key constraints ensure that a value in one table is guaranteed to exist in another. Doctrine manages these automatically when you define associations like `ManyToOne`.

A key aspect you can control is the `onDelete` behavior. This tells the database what to do with child records when their parent is deleted.

```php
#[ORM\Entity]
class Comment
{
    // ...
    #[ORM\ManyToOne(targetEntity: Post::class)]
    #[ORM\JoinColumn(name: 'post_id', onDelete: 'CASCADE')]
    private Post $post;
}
```

-   **`CASCADE`**: If the `Post` is deleted, all of its associated `Comment`s will be automatically deleted by the database. This is efficient but can be dangerous if not used carefully.
-   **`SET NULL`**: If the `Post` is deleted, the `post_id` on its `Comment`s will be set to `NULL`. This requires the `post_id` column to be nullable.
-   **`RESTRICT`** (or leaving it blank): The default behavior. The database will prevent you from deleting a `Post` as long as it has any `Comment`s associated with it. This is the safest option.

## Check Constraints: Enforcing Custom Rules

Check constraints are a powerful feature for enforcing arbitrary rules at the database level. For example, you can ensure a product's price is always positive or that a `salePrice` is always less than the `regularPrice`.

```php
#[ORM\Entity]
#[ORM\Table(options: [
    'check' => 'price > 0 AND sale_price < price'
])]
class Product
{
    #[ORM\Column(type: 'decimal', precision: 10, scale: 2)]
    private string $price;

    #[ORM\Column(type: 'decimal', precision: 10, scale: 2, nullable: true)]
    private ?string $salePrice = null;
}
```
!!! warning "Database Portability"
    The syntax for check constraints can vary between database vendors, and older versions of MySQL did not enforce them. While powerful, they can make your schema less portable. For simple checks, application-level validation is often sufficient. Use check constraints for critical integrity rules that must be enforced at the lowest level.

## Handling Constraint Violations

When you try to `flush()` an entity that violates a database constraint (e.g., a duplicate email), the database will reject the operation, and Doctrine will wrap the resulting error in a `Doctrine\DBAL\Exception\UniqueConstraintViolationException` (or a similar exception for other constraint types).

It's best practice to catch these specific exceptions to provide a clear error message to the user.

```php
try {
    $user = new User('duplicate@example.com', 'password');
    $entityManager->persist($user);
    $entityManager->flush();
} catch (\Doctrine\DBAL\Exception\UniqueConstraintViolationException $e) {
    // Handle the duplicate entry error
    throw new \RuntimeException('This email address is already in use.');
}
```
However, waiting for the database to report the error is often inefficient and leads to a poor user experience. It's better to check for potential violations *before* attempting to flush, as covered in the [Validation](validation.md) chapter.

