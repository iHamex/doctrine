# Many-to-Many, Bidirectional

A `ManyToMany` association is used when a collection of entities on one side can be related to a collection on the other. The classic example is a `Post` that can have many `Tag`s, while a `Tag` can be applied to many `Post`s.

This relationship is always stored in the database using a third "join table" that contains two foreign key columns.

## Defining the `ManyToMany` Association

In a bidirectional `ManyToMany` mapping, you must choose one side to be the **owning side**. This is the side that will be responsible for managing the join table. The other side will be the **inverse side**.

Let's model a `User` who can belong to many `Group`s.

### The Owning Side (`User`)

We'll make `User` the owning side. It defines the `#[ORM\ManyToMany]` association and configures the join table using `#[ORM\JoinTable]`.

```php
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class User
{
    // ...
    #[ORM\ManyToMany(targetEntity: Group::class, inversedBy: 'users')]
    #[ORM\JoinTable(name: 'users_groups')]
    private Collection $groups;

    public function __construct()
    {
        $this->groups = new ArrayCollection();
    }
}
```

#### Dissecting the Mapping:

-   **`#[ORM\ManyToMany]`**: Declares the association.
    -   `targetEntity: Group::class`: Points to the entity on the other side.
    -   `inversedBy: 'users'`: Links to the `$users` property on the `Group` entity, making the association bidirectional.
-   **`#[ORM\JoinTable]`**: Configures the join table.
    -   `name: 'users_groups'`: The name of the table that will be created. Doctrine will automatically create `user_id` and `group_id` columns in this table.

!!! tip "Full Join Table Configuration"
    For more complex scenarios, `#[ORM\JoinTable]` offers full control over the join table's columns.
    ```php
    #[ORM\JoinTable(name: 'user_x_group')]
    #[ORM\JoinColumn(name: 'user_id', referencedColumnName: 'id', onDelete: 'CASCADE')]
    #[ORM\InverseJoinColumn(name: 'group_id', referencedColumnName: 'id', unique: true)]
    private Collection $groups;
    ```
    - `name`: The table name.
    - `#[ORM\JoinColumn]`: Configures the foreign key that points back to the **owning** entity's table (`User`).
    - `#[ORM\InverseJoinColumn]`: Configures the foreign key that points to the **inverse** entity's table (`Group`).
    - `onDelete: 'CASCADE'`: A useful database-level rule. If a `User` is deleted, all their entries in the `user_x_group` table will be automatically removed by the database.
    - `unique: true`: If you want to enforce that a `Group` can only be associated with one `User` through this relationship (turning it into a `OneToMany` from the `Group`'s perspective), you can add a unique constraint.

### The Inverse Side (`Group`)

The `Group` entity is the inverse side. It also uses `#[ORM\ManyToMany]`, but instead of a `#[ORM\JoinTable]`, it uses `mappedBy` to point back to the owning side.

```php
#[ORM\Entity]
class Group
{
    // ...
    #[ORM\ManyToMany(targetEntity: User::class, mappedBy: 'groups')]
    private Collection $users;

    public function __construct()
    {
        $this->users = new ArrayCollection();
    }
}
```
-   `mappedBy: 'groups'`: This is the crucial part. It tells Doctrine, "The details for this relationship are configured by the `$groups` property on the `User` entity."

## Working with `ManyToMany` Associations

To create or remove an association, you must modify the collection on the **owning side**.

### Maintaining Bidirectional Consistency

Just like with `OneToMany`, you must synchronize both sides of the association. The best practice is to create adder/remover methods.

```php
// In User.php
public function addGroup(Group $group): void
{
    if (!$this->groups->contains($group)) {
        $this->groups[] = $group;
        $group->addUser($this); // Synchronize inverse side
    }
}

public function removeGroup(Group $group): void
{
    if ($this->groups->removeElement($group)) {
        $group->removeUser($this); // Synchronize inverse side
    }
}

// In Group.php
public function addUser(User $user): void
{
    if (!$this->users->contains($user)) {
        $this->users[] = $user;
    }
}

public function removeUser(User $user): void
{
    $this->users->removeElement($user);
}
```

!!! warning "Collections are Lazy-Loaded"
    Like `OneToMany` associations, `ManyToMany` collections are **lazy-loaded**. Doctrine will only execute the query to fetch a user's groups when you first access the `$groups` collection. This is efficient but can lead to the "N+1" problem if you loop over many users and access their groups individually. Use DQL with a `JOIN` to eagerly fetch the data when you know you'll need it.

### A Complete Example

```php
$user = new User('John');
$groupAdmin = $entityManager->find(Group::class, 1);
$groupDev = $entityManager->find(Group::class, 2);

// Use the adder methods to maintain consistency
$user->addGroup($groupAdmin);
$user->addGroup($groupDev);

$entityManager->persist($user);
$entityManager->flush(); // Inserts into `users` and adds two rows to `users_groups`.

// Removing an association
$user->removeGroup($groupAdmin);
$entityManager->flush(); // Deletes one row from `users_groups`. The user and group are unaffected.
```

## `ManyToMany` with Extra Columns: The "Rich" Join Table

A simple `ManyToMany` is only possible if the join table contains *only* the two foreign keys. If you need to store additional information about the relationship itself (e.g., the date a user joined a group), you must break the `ManyToMany` association into a separate entity.

This is modeled as two `OneToMany` relationships pointing to a new "join entity".

### The Join Entity (`UserGroup`)

```php
#[ORM\Entity]
class UserGroup
{
    #[ORM\Id, ORM\ManyToOne(targetEntity: User::class)]
    private User $user;
    
    #[ORM\Id, ORM\ManyToOne(targetEntity: Group::class)]
    private Group $group;
    
    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $joinedAt;

    public function __construct(User $user, Group $group)
    {
        $this->user = $user;
        $this->group = $group;
        $this->joinedAt = new \DateTimeImmutable();
    }
}
```
-   This entity uses a composite primary key made of the two `ManyToOne` associations.

### Refactoring `User` and `Group`

The `User` and `Group` entities now have a `OneToMany` association pointing to the `UserGroup` join entity.

```php
// In User.php
#[ORM\OneToMany(targetEntity: UserGroup::class, mappedBy: 'user')]
private Collection $userGroups;

// In Group.php
#[ORM\OneToMany(targetEntity: UserGroup::class, mappedBy: 'group')]
private Collection $userGroups;
```

This pattern gives you an actual `UserGroup` object that you can work with, allowing you to store and access the `$joinedAt` property and any other metadata about the relationship.

## Next Steps

You have now seen all of Doctrine's association mapping types. The next chapters will dive into more advanced topics for managing and querying these associations.

-   **[Inheritance Mapping](inheritance.md)**

