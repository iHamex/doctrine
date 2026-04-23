# One-to-One Associations

A one-to-one association is a direct link between two entities, where one can only be connected to, at most, one of the other. Common examples include a `User` having one `Profile`, or a `Product` having one `ShippingDetails`.

## Unidirectional One-to-One

A unidirectional relationship is the simplest form. The "owning" entity holds a reference to the related entity, but the other entity has no awareness of the relationship.

Let's model a `Customer` and their `Address`. A customer has an address, but we might decide we never need to find a customer starting from their address.

```php
#[ORM\Entity]
class Customer
{
    // ...
    #[ORM\OneToOne(targetEntity: Address::class, cascade: ['persist', 'remove'])]
    #[ORM\JoinColumn(name: 'address_id', referencedColumnName: 'id')]
    private ?Address $address = null;
}

#[ORM\Entity]
class Address
{
    // ... No reference to Customer
}

// --- Usage ---
$customer = new Customer('John Doe');
$address = new Address('123 Main St');
$customer->setAddress($address);

$entityManager->persist($customer);
$entityManager->flush();
```
**Database Schema**: Doctrine creates a foreign key column (`address_id`) on the `customers` table.
**Key Behavior**: You can navigate from `Customer` to `Address` (`$customer->getAddress()`), but not the other way around. The `cascade` option is often used here to manage the lifecycle of the related entity.

!!! tip "The `orphanRemoval` Option"
    In a one-to-one relationship where the related entity cannot exist on its own (like `Customer` -> `Address`), you should add `orphanRemoval=true`.
    ```php
    #[ORM\OneToOne(..., orphanRemoval: true)]
    private ?Address $address = null;
    ```
    This tells Doctrine that the `Address` is privately owned by the `Customer`. If you remove the relationship by setting `$customer->setAddress(null)`, Doctrine will automatically find and delete the "orphaned" `Address` entity from the database on the next flush. This prevents orphaned rows and keeps your data clean.

## Bidirectional One-to-One

A bidirectional relationship allows you to navigate the association from either side. This is more common, as you often want to go from a `User` to their `Profile` and back.

In a bidirectional one-to-one, you must decide which side is the **owning side** and which is the **inverse side**. The owning side is the one whose table will contain the foreign key.

Let's model a `User` and `Cart`. A `User` has one `Cart`.

### Inverse Side (User)

The `User` is the inverse side. It has no foreign key information. The `mappedBy` attribute tells Doctrine that the relationship is managed by the `user` property on the `Cart` entity.

```php
#[ORM\Entity]
class User
{
    // ...
    #[ORM\OneToOne(targetEntity: Cart::class, mappedBy: 'user')]
    private ?Cart $cart = null;
    
    // Getter/Setter and synchronization logic
}
```

### Owning Side (Cart)

The `Cart` is the owning side. Its table will get the `user_id` foreign key. The `inversedBy` attribute points back to the `cart` property on the `User` entity, completing the link.

```php
#[ORM\Entity]
class Cart
{
    // ...
    #[ORM\OneToOne(targetEntity: User::class, inversedBy: 'cart')]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id')]
    private ?User $user = null;
    
    // Getter/Setter and synchronization logic
}
```
**Database Schema**: A `user_id` column with a `UNIQUE` constraint is added to the `carts` table. This unique constraint is what enforces the one-to-one cardinality at the database level.

### Maintaining Bidirectional Consistency

To keep your object model consistent, you must manage both sides of the association in your entities' methods.

```php
// In User.php
public function setCart(Cart $cart): void
{
    if ($cart->getUser() !== $this) {
        $cart->setUser($this);
    }
    $this->cart = $cart;
}

// In Cart.php
public function setUser(User $user): void
{
    if ($this->user !== $user) {
        $this->user = $user;
        $user->setCart($this);
    }
}
```
This ensures that whenever you link a `Cart` to a `User`, the `User` is also correctly linked back to the `Cart`, keeping your object graph in a valid state.

!!! warning "Primary Key Associations"
    It is also possible to map a one-to-one association where the foreign key on the owning side is also its primary key. This is a more advanced mapping and is covered in the Inheritance mapping chapter, as it is often used for a specific type of inheritance.

## When to Use One-to-One

One-to-one relationships are useful in several scenarios:

1.  **Splitting Large Tables**: If an entity has many fields that are rarely used (e.g., a `user_details` blob), you can move them to a separate entity to keep the main `users` table slim and fast.
2.  **Optional Data**: When a set of fields is optional for an entity (e.g., a `seller_profile` that only exists for users who are sellers).
3.  **Interface Segregation**: To model different aspects of an entity that should be handled separately in your domain.
4.  **Table-per-Class Inheritance**: As a strategy for mapping class inheritance, where each class in a hierarchy gets its own table.

However, always consider if the two entities could simply be merged into one. One-to-one associations introduce an extra `JOIN` in queries, which can have performance implications if the data is always accessed together.

!!! warning "Performance Considerations: Fetch Modes"
    By default, a one-to-one association is **lazy-loaded**. When you fetch a `Customer`, Doctrine does *not* immediately load the `Address`. It only executes a second query to fetch the `Address` when you call `$customer->getAddress()`. 
    
    If you know you will *always* need the address whenever you have a customer, you can change the fetch mode to "EAGER" to tell Doctrine to load it with a `JOIN` in the original query.
    ```php
    #[ORM\OneToOne(..., fetch: 'EAGER')]
    private ?Address $address = null;
    ```
    Use this optimization carefully, as it can be wasteful if you don't always need the related entity. The best approach is usually to use DQL with an explicit `JOIN` in the specific repository methods where you need both entities.

## Next Steps

Next, we will explore the most common association type, which links many entities to a single one.

-   **[Many-to-One Associations](many-to-one.md)**

