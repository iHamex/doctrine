# Frequently Asked Questions & Common Pitfalls

This guide addresses common questions, pitfalls, and advanced scenarios encountered when working with Doctrine.

## General

#### Q: I'm using Symfony, do I need to install `doctrine/orm` separately?

**A:** No. The `doctrine/doctrine-bundle` that comes with Symfony manages the installation and configuration of the ORM, DBAL, and Migrations libraries for you. You should interact with Doctrine through the services provided by the bundle (like `EntityManagerInterface`).

## Entities & Mapping

#### Q: How should I map native PHP 8.1+ Enums?

**A:** As of Doctrine ORM 2.11, you can map them directly by specifying the enum's fully qualified class name as the `enumType` in the `#[ORM\Column]` attribute.

```php
// src/Entity/UserStatus.php
enum UserStatus: string
{
    case Pending = 'pending';
    case Active = 'active';
    case Suspended = 'suspended';
}

// src/Entity/User.php
#[ORM\Entity]
class User
{
    // ...
    #[ORM\Column(enumType: UserStatus::class)]
    private UserStatus $status = UserStatus::Pending;
}
```
This provides excellent type safety. Doctrine will handle the conversion to and from the enum's backed value (`string` or `int`).

#### Q: How can I implement Value Objects (e.g., `EmailAddress`, `Money`)?

**A:** The best way is to create a **Custom Mapping Type**. This tells Doctrine how to convert your value object to and from a basic database type.

1.  **Create the Value Object**: A simple, immutable class.
2.  **Create the Custom Type**: A class that extends `Doctrine\DBAL\Types\Type`.
3.  **Register the Type**: In your Doctrine configuration.

This powerful pattern allows you to work with rich, expressive domain objects while Doctrine handles the persistence details seamlessly. For a full example, see the [Field and Column Mapping](field-and-column-mapping.md) chapter.

#### Q: Why can't Doctrine find my entity class?

**A:** This is usually a configuration issue. Check the `paths` argument in your `ORMSetup`. It must point to the directory (or directories) where your entity classes are located. Also, ensure your entity classes have the `#[ORM\Entity]` attribute.

```php
// bootstrap.php
$config = ORMSetup::createAttributeMetadataConfiguration(
    paths: [__DIR__."/src/Entity"] // <-- Make sure this path is correct
);
```

## Relationships

#### Q: My bidirectional relationship isn't saving correctly. What's wrong?

**A:** The most common mistake is failing to synchronize both sides of the association. When you set the owning side (e.g., `Comment::$post`), you must also update the inverse side (`Post::$comments`).

The best practice is to encapsulate this logic in adder/remover methods on the inverse side.

```php
// In Post.php
public function addComment(Comment $comment): self
{
    if (!$this->comments->contains($comment)) {
        $this->comments[] = $comment;
        // CRITICAL: Synchronize the owning side!
        $comment->setPost($this);
    }
    return $this;
}
```
Always use these "helper" methods to manage your collections to ensure your object graph remains consistent.

#### Q: What is `orphanRemoval` and how is it different from `cascade: remove`?

**A:** Both can result in deletion, but their purpose is different.

-   **`cascade: remove`**: This is a persistence operation. If you explicitly call `$entityManager->remove($parent)`, Doctrine will also remove all associated child entities. The relationship is about the 

*lifecycle* of the objects.

-   **`orphanRemoval: true`**: This is a *collection management* feature. If you remove a child from a parent's collection (`$parent->getChildren()->removeElement($child)`), Doctrine will delete that "orphaned" child from the database on the next flush. The relationship is about *ownership*.

**Rule of thumb**: Use `orphanRemoval: true` on `OneToMany` associations where the child cannot exist without the parent (e.g., `Order` and `OrderItem`). Use `cascade: remove` more sparingly, when deleting a parent should always cascade.

## Persistence & Unit of Work

#### Q: I modified an entity, but the changes are not saved to the database. Why?

**A:** There are two likely reasons:

1.  **You forgot to call `flush()`**: The `EntityManager` tracks all changes, but it only writes them to the database when you explicitly call `$entityManager->flush()`.
2.  **The entity is not managed**: If the entity was created outside the `EntityManager` (e.g., from `unserialize()` or a form DTO) or if you have called `$entityManager->detach()` or `$entityManager->clear()`, Doctrine is no longer tracking it.

You can check if an entity is managed with `$entityManager->contains($entity)`. To fix it, you must re-introduce the entity into the `EntityManager`'s context using `merge()`.

```php
// $user is a detached entity from a form
$managedUser = $entityManager->merge($user);
$managedUser->setName('New Name'); // Modify the MANAGED instance
$entityManager->flush(); // Now the change will be saved
```

#### Q: I get a "A new entity was found through the relationship..." error. What does it mean?

**A:** This error occurs when you `persist` and `flush` an entity that has a relationship to *another*, new entity that you have **not** persisted. Doctrine doesn't know what to do with this new, un-managed entity.

```php
$post = new Post("My First Post");
$author = new Author("John Doe"); // <-- This is a new, un-persisted entity

$post->setAuthor($author);

$entityManager->persist($post);
$entityManager->flush(); // <-- This will throw the error
```
**Solution**: You must either:

1.  **Persist the related entity**: `$entityManager->persist($author);`
2.  **Use `cascade: ['persist']`**: Add this option to your association mapping (`Post::$author`). This tells Doctrine that if it persists a `Post`, it should automatically persist any new related entities as well.

## Querying

#### Q: When should I use DQL, the QueryBuilder, or a Native Query?

**A:**

-   **DQL**: Best for complex but static queries that you can write as a string. It's often more readable for queries with many joins and conditions.
-   **QueryBuilder**: Best for dynamic queries where you need to add conditions, joins, or ordering based on user input or other logic. It's safer than building DQL strings.
-   **Native Query**: Use as a last resort when you need to use a database-specific feature that is not supported by DQL (e.g., window functions, hierarchical queries, query hints). You will need to use a `ResultSetMapping` to hydrate the results back into objects.

#### Q: My query with a `JOIN` is still causing N+1 problems. Why?

**A:** You need to use a `FETCH JOIN`.

-   A standard `JOIN` in DQL (`JOIN u.posts p`) simply makes the joined entity available for use in the `WHERE` clause. It does **not** load the related data.
-   A `FETCH JOIN` (`JOIN FETCH u.posts p`) tells Doctrine to join the entities *and* hydrate the related collection or association in the same query.

```dql
-- WRONG (This will still cause an N+1 when you access post.author)
SELECT p FROM App\Entity\Post p JOIN p.author a WHERE a.isActive = true

-- RIGHT (This loads the Post and its Author in one query)
SELECT p, a FROM App\Entity\Post p JOIN FETCH p.author a WHERE a.isActive = true
```

