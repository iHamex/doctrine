# One-to-Many, Bidirectional

A `OneToMany` association is the inverse side of a `ManyToOne` association. It's how you navigate from the "one" side to the "many" side. For example, from a `Product` to its collection of `Feature`s, or from a `User` to their `Post`s.

A `OneToMany` association is **always** the inverse side of a relationship, and as such, it can only be part of a **bidirectional** mapping.

## Defining the `OneToMany` Association

Let's model a `ShoppingCart` that contains many `CartItem`s.

### The Inverse Side (`ShoppingCart`)

The `ShoppingCart` entity has a collection property (`$items`) to hold the `CartItem` entities.

```php
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class ShoppingCart
{
    // ...
    #[ORM\OneToMany(
        targetEntity: CartItem::class, 
        mappedBy: 'cart',
        cascade: ['persist', 'remove'],
        orphanRemoval: true
    )]
    private Collection $items;

    public function __construct()
    {
        $this->items = new ArrayCollection();
    }
}
```

#### Dissecting the Mapping:

-   **`#[ORM\OneToMany]`**: Declares this as the inverse side of a `ManyToOne` relationship.
-   **`targetEntity: CartItem::class`**: Specifies the entity on the "many" side.
-   **`mappedBy: 'cart'`**: This is the most critical part. It tells Doctrine that this relationship is a mirror of the association defined by the `$cart` property on the `CartItem` entity. The `CartItem` is the owning side.
-   **`cascade` and `orphanRemoval`**: These are lifecycle options, often used with `OneToMany`.
    -   `cascade: ['persist']` means that if you persist a `ShoppingCart`, any new `CartItem`s in its `$items` collection will also be persisted.
    -   `orphanRemoval: true` means that if you remove a `CartItem` from the `$items` collection, that `CartItem` will be deleted from the database entirely.

### The Owning Side (`CartItem`)

The `CartItem` entity defines the `ManyToOne` association that owns the relationship.

```php
#[ORM\Entity]
class CartItem
{
    // ...
    #[ORM\ManyToOne(targetEntity: ShoppingCart::class, inversedBy: 'items')]
    #[ORM\JoinColumn(name: 'cart_id', referencedColumnName: 'id')]
    private ?ShoppingCart $cart = null;
}
```
-   `inversedBy: 'items'`: This points back to the `$items` property on the `ShoppingCart`, completing the bidirectional link.

## Working with Collections

The `OneToMany` property will always hold an object that implements the `Doctrine\Common\Collections\Collection` interface. You must initialize it in your entity's constructor, typically with an `ArrayCollection`. The `Collection` interface is similar to a PHP array but provides a much richer API for filtering, mapping, and searching.

### Maintaining Bidirectional Consistency

To keep the relationship consistent, you must manage both sides of the association in your entity's methods. The best practice is to create "adder" and "remover" methods on the `OneToMany` side.

```php
// In ShoppingCart.php
public function addItem(CartItem $item): void
{
    if (!$this->items->contains($item)) {
        $this->items[] = $item;
        $item->setCart($this); // <-- Synchronize the owning side
    }
}

public function removeItem(CartItem $item): void
{
    if ($this->items->removeElement($item)) {
        // set the owning side to null (unless orphaned)
        if ($item->getCart() === $this) {
            $item->setCart(null);
        }
    }
}

public function getItems(): Collection
{
    return $this->items;
}
```
By always using `addItem()` and `removeItem()`, you guarantee that your object graph remains in a consistent state.

### A Complete Example

```php
$cart = new ShoppingCart();
$item1 = new CartItem($product1, 2);
$item2 = new CartItem($product2, 1);

// Use the adder methods to maintain consistency
$cart->addItem($item1);
$cart->addItem($item2);

// Thanks to cascade:['persist'], we only need to persist the cart
$entityManager->persist($cart);
$entityManager->flush();

echo "Cart created with " . $cart->getItems()->count() . " items.\n";

// Removing an item
$cart->removeItem($item1);
$entityManager->flush(); // Thanks to orphanRemoval, this will DELETE the CartItem row.

echo "Cart now has " . $cart->getItems()->count() . " items.\n";
```

!!! warning "Lazy Loading of Collections"
    `OneToMany` collections are **lazy-loaded** by default. When you load a `ShoppingCart`, the `$items` collection is not immediately populated. Instead, Doctrine creates a special `PersistentCollection` object. The SQL query to load the `CartItem` entities is only executed when you first access the collection (e.g., by calling `$cart->getItems()->count()` or iterating over it). This is a critical performance feature, but it can lead to the "N+1" problem if you are not careful.

### Optimizing Collections with `EXTRA_LAZY`

For very large collections, even the act of initializing the collection can be expensive. Doctrine offers an `EXTRA_LAZY` fetch mode that optimizes certain common operations by performing them at the database level, without loading the entire collection into memory.

```php
#[ORM\OneToMany(
    targetEntity: CartItem::class, 
    mappedBy: 'cart',
    cascade: ['persist', 'remove'],
    orphanRemoval: true,
    fetch: 'EXTRA_LAZY'
)]
private Collection $items;
```

With `EXTRA_LAZY`, the following operations become highly efficient:
-   `$items->count()`: Executes a `SELECT COUNT(...)` query.
-   `$items->contains($item)`: Executes a `SELECT 1 FROM ... WHERE id = ?` query.
-   `$items->slice($offset, $length)`: Adds `LIMIT` and `OFFSET` to the query.

This is essential for performance when you need to check the size of or the existence of an item in a collection that could contain thousands of entities.

## Collection Ordering

Sometimes, you need to retrieve the elements of a collection in a specific order. You can use the `#[ORM\OrderBy]` attribute to specify a default ordering at the database level.

```php
#[ORM\Entity]
class BlogPost
{
    // ...
    #[ORM\OneToMany(targetEntity: Comment::class, mappedBy: 'post')]
    #[ORM\OrderBy(['createdAt' => 'DESC'])]
    private Collection $comments;
}
```
Now, whenever you access `$blogPost->getComments()`, the comments will be ordered by their `createdAt` timestamp in descending order, directly in the SQL query that Doctrine generates. This is much more efficient than sorting the collection in PHP.

## Indexing a Collection by a Field (`indexBy`)

By default, the `Collection` returned by a `OneToMany` association has integer keys (0, 1, 2, ...). In some cases, it's more convenient to have the collection indexed by one of the fields of the related entity. The `indexBy` option allows you to do this.

For example, let's say a `Product` has many `Attribute` entities, and we want to access them by their `name` (e.g., 'color', 'size').

```php
// In Product.php
#[ORM\OneToMany(
    targetEntity: Attribute::class, 
    mappedBy: 'product',
    indexBy: 'name' // <-- Index the collection by the 'name' property of Attribute
)]
private Collection $attributes;
```

Now, when you access the collection, the keys will be the values of the `name` property.

```php
$product->getAttributes(); // -> Returns a Collection

// Accessing an attribute by its name
$color = $product->getAttributes()->get('color'); // Returns the Attribute object where name = 'color'

// Checking if an attribute exists
if ($product->getAttributes()->containsKey('size')) {
    // ...
}
```
This can simplify your code by avoiding the need to loop through the collection to find a specific item.

!!! warning "Unique Index"
    The property used in `indexBy` should have a unique value within the scope of the collection (e.g., a product cannot have two attributes named 'color'). If there are duplicates, only the last one will be present in the collection.

## Next Steps

Finally, we'll look at the most complex association type, which links many entities to many others.

-   **[Many-to-Many Associations](many-to-many.md)**

