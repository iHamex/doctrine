# Managing Entities: The EntityManager and Unit of Work

The `EntityManager` is the most critical component in Doctrine. It acts as the central access point for all entity-related operations, managing their lifecycle, tracking changes, and handling persistence to the database. Understanding its role is the key to mastering Doctrine.

## The Unit of Work: Doctrine's "Magic"

Before diving into specific operations, it's essential to understand the **Unit of Work** pattern. The `EntityManager` uses this pattern to manage your entities.

Think of the Unit of Work as an intelligent container. When you fetch an entity, the `EntityManager` takes a snapshot of its initial state. It then tracks any changes you make to that entity's properties. When you call `$entityManager->flush()`, it compares the current state of all managed entities with their original snapshots. If it finds any differences, it automatically generates and executes the necessary `UPDATE` statements.

This is why you never have to call an `update()` or `save()` method on an entity. You simply modify the PHP object, and the Unit of Work handles the rest.

```php
// 1. Fetch an entity. The Unit of Work takes a snapshot.
$product = $entityManager->find(Product::class, 1);

// 2. Modify the object's properties in your business logic.
$product->setPrice('19.99');
$product->setStock(99);

// 3. Flush. The Unit of Work detects the changes and executes a single UPDATE.
$entityManager->flush();
// SQL executed: UPDATE products SET price = '19.99', stock = 99 WHERE id = 1;
```

This powerful pattern is what allows for "persistence ignorance"—your entity objects don't need to know anything about the database.

## The Entity Lifecycle in Action

An entity instance passes through several states during its life. Let's follow a single `Product` entity through its entire lifecycle.

```php
// Product.php
#[ORM\Entity]
class Product
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    private string $name;
    
    // ... constructor, getters, setters
}
```

#### 1. New
An entity is in the **New** state when you first instantiate it. It's a plain PHP object that the `EntityManager` does not know about yet.

```php
$product = new Product('Wireless Mouse'); // State: NEW
```

#### 2. Managed
To make the entity known to Doctrine, you must `persist()` it. This transitions the entity to the **Managed** state. It is now tracked by the Unit of Work, but no SQL has been executed yet.

```php
$entityManager->persist($product); // State: MANAGED
```

#### 3. Persisted
To save the entity to the database, you call `flush()`. The `EntityManager` executes an `INSERT` statement, and the entity is now **Persisted**. It remains in the **Managed** state.

```php
$entityManager->flush(); // SQL INSERT is executed.
echo $product->getId(); // The ID is now populated.
```

#### 4. Detached
An entity becomes **Detached** when the `EntityManager` that was managing it is cleared or closed, or when you explicitly detach it. A detached entity is no longer tracked.

```php
$entityManager->detach($product); // State: DETACHED
$product->setName('Magic Mouse'); // This change will NOT be saved.
$entityManager->flush(); // No UPDATE is executed.
```
You can detach all managed entities at once using `$entityManager->clear()`.

#### 5. Merged
To re-introduce a detached entity into the `EntityManager`'s context, you use `merge()`. This is common when working with objects that have been unserialized from a session or submitted via a form.

`merge()` copies the state of the detached entity onto a new, managed instance.

```php
// $product is still DETACHED
$managedProduct = $entityManager->merge($product); // State of $managedProduct: MANAGED
$managedProduct->setName('Logitech MX Master'); // This change WILL be saved.
$entityManager->flush(); // SQL UPDATE is executed.
```

!!! warning "Always Use the Merged Instance"
    `merge()` returns a *new* managed instance. Any further changes must be made to this returned instance, not the original detached one.

#### 6. Removed
To delete an entity, you pass a managed entity to the `remove()` method. This transitions it to the **Removed** state. The actual `DELETE` statement is only executed on the next `flush()`.

```php
// First, get a managed instance
$productToDelete = $entityManager->find(Product::class, 1);

$entityManager->remove($productToDelete); // State: REMOVED
$entityManager->flush(); // SQL DELETE is executed.
```

## Advanced State Management

#### Refreshing an Entity
If you want to discard any local changes to an entity and reload its state from the database, use `refresh()`.

```php
$user = $entityManager->find(User::class, 1);
$user->setName('Temporary Name'); // Make a local change

// Revert the object to the state it has in the database
$entityManager->refresh($user);

echo $user->getName(); // Outputs the original name from the database
```

#### The Identity Map
To ensure consistency and improve performance, the `EntityManager` uses an **Identity Map**. It's an internal cache that stores every entity that has been retrieved or persisted within a single request.

When you ask for an entity with a specific ID, the `EntityManager` first checks its Identity Map. If the entity is already there, it returns the existing instance instead of querying the database again.

```php
$user1 = $entityManager->find(User::class, 42);
$user2 = $entityManager->find(User::class, 42);

// This is true because both variables point to the exact same object in memory.
assert($user1 === $user2); 
```

## Automating the Lifecycle with Cascading Operations

In many cases, the lifecycle of related entities is linked. For example, when you create a `Post`, you might also create several `Tag`s. When you delete a `Post`, its `Comment`s should also be deleted.

Doctrine can automate these operations using the `cascade` option on associations.

```php
#[ORM\Entity]
class Post
{
    // ...
    #[ORM\OneToMany(targetEntity: Comment::class, mappedBy: 'post', cascade: ['persist', 'remove'])]
    private Collection $comments;
}
```

- **`cascade: ['persist']`**: When you `persist()` a `Post` object, Doctrine will also automatically `persist()` any new `Comment` objects in its `$comments` collection.
- **`cascade: ['remove']`**: When you `remove()` a `Post` object, Doctrine will also automatically `remove()` all the `Comment` objects in its `$comments` collection.

!!! warning "Use `cascade: ['remove']` with Extreme Caution"
    This can lead to accidental mass deletion of data. A safer alternative for managing collections is often `orphanRemoval`.

#### `orphanRemoval`
Set `orphanRemoval=true` on a `OneToMany` or `ManyToMany` association when you want Doctrine to automatically delete any child entity that is removed from the parent's collection.

```php
#[ORM\Entity]
class Post
{
    // ...
    #[ORM\OneToMany(targetEntity: Comment::class, mappedBy: 'post', orphanRemoval: true)]
    private Collection $comments;
}
```

Now, if you remove a comment from the post's collection, Doctrine will delete that comment from the database on the next flush.

```php
$post = $entityManager->find(Post::class, 1);
$comment = $post->getComments()->get(0);

// Simply removing the comment from the collection marks it for deletion
$post->getComments()->removeElement($comment);

$entityManager->flush(); // Executes a DELETE query for the removed comment
```
This is often a more intuitive and safer way to manage the lifecycle of child entities than `cascade: ['remove']`.

