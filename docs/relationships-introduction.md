# Modeling Relationships Between Entities

Entities rarely exist in isolation. A `User` has `Posts`, a `Post` has `Comments`, and a `Product` belongs to a `Category`. Doctrine's association mappings are how you define and manage these critical relationships in your object model.

## The Core Concept: Associations as Properties

In Doctrine, a relationship between two entities is represented as a property on each entity. Instead of dealing with foreign key IDs, you work with real objects.

```php
// You don't do this:
$post->setAuthorId(5);

// You do this:
$author = $entityManager->getReference(User::class, 5);
$post->setAuthor($author);
```
This object-oriented approach is the fundamental benefit of using an ORM. It allows your code to remain focused on the domain model, not the relational schema.

## Bidirectional vs. Unidirectional

Every association can be either bidirectional (navigable from both ends) or unidirectional (navigable from only one end).

-   **Bidirectional**: Both entities have a property referring to the other. This is the most common type. A `User` object has a `$posts` collection, and a `Post` object has a `$user` property.
-   **Unidirectional**: Only one entity has a property referring to the other. For example, a `Product` might have a `$category`, but the `Category` entity might not need a collection of all its products.

---

## The Four Relationship Types

Doctrine supports all four standard relationship cardinalities. Let's visualize them with a common "Blog" domain model.

### 1. `ManyToOne`: The "Belongs To" Relationship

This is the most common association. Many entities on one side refer to a single entity on the other.

-   **Example**: Many `Post` entities can belong to one `User` (the author).
-   **Database**: A `user_id` foreign key column is created in the `posts` table.

```php
#[ORM\Entity]
class Post
{
    // ...
    #[ORM\ManyToOne(targetEntity: User::class, inversedBy: 'posts')]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id')]
    private ?User $author = null;
}

#[ORM\Entity]
class User
{
    // ...
    #[ORM\OneToMany(targetEntity: Post::class, mappedBy: 'author')]
    private Collection $posts;
}
```

### 2. `OneToMany`: The "Has Many" Relationship

This is the inverse side of a `ManyToOne` relationship. It's always represented as a collection of other entities.

-   **Example**: One `User` can have many `Post` entities.
-   **Database**: No database column is created on the `users` table. This is purely a "virtual" mapping managed by the `ManyToOne` side.

### 3. `OneToOne`: The "Has One" Relationship

This links one entity to exactly one other entity.

-   **Example**: A `User` has exactly one `Profile`.
-   **Database**: A `user_id` foreign key is typically placed on the `profiles` table with a unique constraint to enforce the one-to-one nature.

```php
#[ORM\Entity]
class User
{
    // ...
    #[ORM\OneToOne(targetEntity: Profile::class, mappedBy: 'user')]
    private ?Profile $profile = null;
}

#[ORM\Entity]
class Profile
{
    // ...
    #[ORM\OneToOne(targetEntity: User::class, inversedBy: 'profile')]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id')]
    private ?User $user = null;
}
```

### 4. `ManyToMany`: The "Has and Belongs to Many" Relationship

This is used when many entities on one side can be related to many entities on the other.

-   **Example**: A `Post` can have many `Tag`s, and a `Tag` can be applied to many `Post`s.
-   **Database**: Doctrine creates a third "join table" (e.g., `post_tag`) that contains two foreign key columns (`post_id` and `tag_id`) to manage the associations.

```php
#[ORM\Entity]
class Post
{
    // ...
    #[ORM\ManyToMany(targetEntity: Tag::class, inversedBy: 'posts')]
    #[ORM\JoinTable(name: 'post_tags')]
    private Collection $tags;
}

#[ORM\Entity]
class Tag
{
    // ...
    #[ORM\ManyToMany(targetEntity: Post::class, mappedBy: 'tags')]
    private Collection $posts;
}
```
---

## Owning Side vs. Inverse Side: A Critical Distinction

In a **bidirectional** association, you must tell Doctrine which side is responsible for managing the relationship in the database.

-   **Owning Side**: This is the side that determines whether a relationship exists. Changes made to the owning side are persisted to the database. In `ManyToOne`/`OneToMany`, the `ManyToOne` side is *always* the owning side. In `ManyToMany`, you can choose.
-   **Inverse Side**: This is the "read-only" side of the relationship. It's a mirror of the owning side. It uses the `mappedBy` attribute to point to the property on the owning side.

**Rule of Thumb**: The side of the relationship that gets the foreign key column in its database table is the owning side. For `ManyToMany`, the owning side is the one that manages the join table records.

```php
// In Post.php (ManyToOne)
// This is the OWNING side. It has the foreign key.
#[ORM\ManyToOne(targetEntity: User::class, inversedBy: 'posts')]
private ?User $author = null;

// In User.php (OneToMany)
// This is the INVERSE side. It's "mappedBy" the author property.
#[ORM\OneToMany(targetEntity: Post::class, mappedBy: 'author')]
private Collection $posts;
```

!!! warning "Synchronization"
    When working with bidirectional associations, you must ensure both sides are always synchronized in your PHP code. If you set `$post->setAuthor($user)`, you must also call `$user->getPosts()->add($post)`. Helper methods in your entities are the best way to manage this. We'll cover this in detail in the upcoming chapters.

## Advanced Concepts Preview

This introduction provides the foundation, but Doctrine's association mappings have powerful features for handling complex scenarios.

### Fetch Modes: Eager vs. Lazy Loading

By default, Doctrine uses **lazy loading**. When you load a `User` object, its `$posts` collection is not immediately fetched from the database. Instead, Doctrine creates a proxy object. The actual SQL query to load the posts is only executed the very first time you access the `$posts` collection (e.g., by calling `$user->getPosts()`).

- **Benefit**: This is highly efficient. You only pay the performance cost for the associations you actually use.
- **Drawback**: If you loop over 20 users and access the posts for each one, you will execute 21 separate queries (1 for the users, 20 for their posts). This is the infamous "N+1" problem.

To solve this, you can change the **fetch mode** to `EAGER`.

```php
#[ORM\OneToMany(..., fetch: 'EAGER')]
private Collection $posts;
```

With `EAGER` loading, Doctrine will use a `JOIN` in its initial query to fetch the `User` and all of their `Post`s in a single SQL query.

!!! tip "When to Use Eager Loading"
    Use `EAGER` loading sparingly. It's best for associations where you know you will *always* need the related data (e.g., a `User` and their `Profile`). For most collections, it's better to stick with lazy loading and solve N+1 problems on a case-by-case basis using DQL `JOIN`s in your repository methods.

### Cascade Operations

What should happen to a user's posts when their account is deleted? By default, nothing. You would get a foreign key constraint violation.

The `cascade` option on an association mapping tells Doctrine to automatically "cascade" operations from the parent entity to the related entities.

```php
// In User.php
#[ORM\OneToMany(..., cascade: ['persist', 'remove'])]
private Collection $posts;
```

- `cascade: ['persist']`: If you persist a new `User` object that has new `Post` objects in its collection, Doctrine will automatically persist the new posts as well.
- `cascade: ['remove']`: If you remove a `User` object, Doctrine will first load all of their posts and remove each one before finally removing the user.

!!! warning "Use Cascade with Caution"
    `cascade: ['remove']` can be dangerous and lead to unexpected data loss. It can also be inefficient for large collections. For "soft delete" scenarios or more complex removal logic, it's often safer to handle deletion logic manually in your services or by using database-level `ON DELETE` constraints.

## Next Steps

Now that you have a high-level overview of associations, you can dive into the specifics of each mapping type.

-   **[One-to-One Associations](one-to-one.md)**
-   **[Many-to-One Associations](many-to-one.md)**
-   **[One-to-Many Associations](one-to-many.md)**
-   **[Many-to-Many Associations](many-to-many.md)**

