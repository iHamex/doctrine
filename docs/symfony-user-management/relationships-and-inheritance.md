# Relationships & Inheritance

Model richer domains with `OneToOne`, `ManyToMany`, and Doctrine inheritance.

## One-to-One: User → Profile

```php
<?php
namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class Profile
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;

    #[ORM\OneToOne(inversedBy: 'profile')]
    #[ORM\JoinColumn(nullable: false)]
    private ?User $user = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $phone = null;
}

// in User.php
#[ORM\OneToOne(mappedBy: 'user', cascade: ['persist', 'remove'])]
private ?Profile $profile = null;
```

Use `cascade` judiciously—`remove` here deletes the profile when the user is removed.

## Many-to-Many: User ↔ Group

```php
#[ORM\Entity]
class Group
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    private ?int $id = null;
    #[ORM\Column(length: 120)]
    private string $name = '';

    #[ORM\ManyToMany(targetEntity: User::class, mappedBy: 'groups')]
    private iterable $users; // use Collection in real code
}

// in User.php
#[ORM\ManyToMany(targetEntity: Group::class, inversedBy: 'users')]
#[ORM\JoinTable(name: 'user_group')]
private iterable $groups; // initialize as ArrayCollection
```

Add indexes on the join table for better performance on lists.

## Inheritance: AdminUser extends User (STI)

```php
#[ORM\Entity]
#[ORM\InheritanceType('SINGLE_TABLE')]
#[ORM\DiscriminatorColumn(name: 'dtype', type: 'string')]
#[ORM\DiscriminatorMap(['user' => User::class, 'admin' => AdminUser::class])]
class User { /* ... */ }

#[ORM\Entity]
class AdminUser extends User
{
    #[ORM\Column(type: 'json')]
    private array $adminPermissions = [];
}
```

Single Table Inheritance (STI) works well for small hierarchies. Prefer composition if fields diverge significantly across subtypes.


