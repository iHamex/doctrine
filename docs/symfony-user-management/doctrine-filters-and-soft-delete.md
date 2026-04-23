# Doctrine Filters & Soft Delete

Doctrine Filters allow you to automatically add WHERE conditions to all queries for specific entities. This is perfect for implementing soft deletes (marking records as deleted without actually removing them) and multi-tenancy (filtering by tenant).

## Why Use Soft Delete?

**Hard delete (permanent removal):**
```php
$em->remove($user);
$em->flush();
// User is permanently deleted from database
```

**Problems:**

- Data loss (can't recover accidentally deleted records)
- Breaks referential integrity (foreign keys fail)
- No audit trail (can't see what was deleted and when)
- Can't restore deleted data

**Soft delete (mark as deleted):**
```php
$user->softDelete(); // Sets deletedAt timestamp
$em->flush();
// User still exists in database, but is marked as deleted
```

**Benefits:**

- Recoverable (can restore deleted records)
- Maintains referential integrity
- Audit trail (know when records were deleted)
- Can query deleted records if needed

## Implementing Soft Delete

### Step 1: Add DeletedAt Field to User Entity

Update `src/Entity/User.php`:

```php
<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'users')]
class User
{
    // ... existing properties ...

    /**
     * Soft delete timestamp
     * 
     * When set, this user is considered "soft deleted".
     * NULL means the user is active.
     */
    #[ORM\Column(type: 'datetime_immutable', nullable: true)]
    private ?\DateTimeImmutable $deletedAt = null;

    /**
     * Soft delete this user
     * 
     * Instead of removing the user from the database, we mark it as deleted
     * by setting the deletedAt timestamp. The Doctrine filter will automatically
     * exclude this user from queries.
     */
    public function softDelete(): void
    {
        $this->deletedAt = new \DateTimeImmutable('now');
    }

    /**
     * Restore a soft-deleted user
     * 
     * Clears the deletedAt timestamp, making the user active again.
     */
    public function restore(): void
    {
        $this->deletedAt = null;
    }

    /**
     * Check if user is soft deleted
     * 
     * @return bool True if user is soft deleted
     */
    public function isDeleted(): bool
    {
        return $this->deletedAt !== null;
    }

    /**
     * Get deletion timestamp
     * 
     * @return \DateTimeImmutable|null Deletion timestamp or null if not deleted
     */
    public function getDeletedAt(): ?\DateTimeImmutable
    {
        return $this->deletedAt;
    }
}
```

### Step 2: Create Migration

Generate and run migration:

```bash
php bin/console make:migration
php bin/console doctrine:migrations:migrate -n
```

This adds the `deleted_at` column to the `users` table.

### Step 3: Create Doctrine Filter

Create `src/Doctrine/Filter/NotDeletedFilter.php`:

```php
<?php

namespace App\Doctrine\Filter;

use Doctrine\ORM\Mapping\ClassMetadata;
use Doctrine\ORM\Query\Filter\SQLFilter;

/**
 * NotDeletedFilter
 * 
 * Automatically adds "WHERE deleted_at IS NULL" to all queries for User entity.
 * This ensures soft-deleted users are automatically excluded from queries.
 * 
 * How it works:
 * 1. Doctrine checks if this filter is enabled
 * 2. Before executing any query, Doctrine calls addFilterConstraint()
 * 3. We return a SQL condition that excludes soft-deleted records
 * 4. Doctrine automatically adds this condition to all queries
 */
class NotDeletedFilter extends SQLFilter
{
    /**
     * Add filter constraint to query
     * 
     * This method is called by Doctrine for every entity in every query.
     * We check if the entity is User, and if so, add the soft delete condition.
     * 
     * @param ClassMetadata $targetEntity Metadata for the entity being queried
     * @param string $targetTableAlias Table alias used in the query (e.g., 'u')
     * @return string SQL condition to add to WHERE clause (empty string if not applicable)
     */
    public function addFilterConstraint(ClassMetadata $targetEntity, string $targetTableAlias): string
    {
        // Only apply filter to User entity
        if ($targetEntity->getReflectionClass()->getName() !== \App\Entity\User::class) {
            return ''; // No filter for other entities
        }

        // Return SQL condition that excludes soft-deleted records
        // This will be added to every query automatically
        return sprintf('%s.deleted_at IS NULL', $targetTableAlias);
    }
}
```

**Explanation:**

- `SQLFilter` - Base class for Doctrine filters
- `addFilterConstraint()` - Called for each entity in each query
- We check if entity is `User`, if so, return SQL condition
- `$targetTableAlias` - The alias used in the query (usually 'u' for User)
- Returns SQL fragment that Doctrine adds to WHERE clause

### Step 4: Enable Filter in Configuration

Update `config/packages/doctrine.yaml`:

```yaml
doctrine:
  dbal:
    url: '%env(resolve:DATABASE_URL)%'
  orm:
    auto_generate_proxy_classes: true
    enable_lazy_ghost_objects: true
    mappings:
      App:
        is_bundle: false
        type: attribute
        dir: '%kernel.project_dir%/src/Entity'
        prefix: 'App\\Entity'
    
    # Doctrine Filters Configuration
    filters:
      not_deleted:
        class: App\Doctrine\Filter\NotDeletedFilter
        enabled: true  # Filter is enabled by default
```

**What this does:**

- Registers the `NotDeletedFilter` class
- Enables it globally (applies to all queries)
- Filter name is `not_deleted` (used when enabling/disabling)

### Step 5: Update Repository Queries

The filter automatically applies, but ensure your repository methods work correctly:

```php
// In UserRepository.php
// All these queries automatically exclude soft-deleted users:

public function findAll(): array
{
    // Automatically excludes users where deleted_at IS NOT NULL
    return $this->findAll();
}

public function findOneByEmail(string $email): ?User
{
    // Automatically excludes soft-deleted users
    return $this->baseQb()
        ->andWhere('u.email = :email')
        ->setParameter('email', strtolower($email))
        ->getQuery()
        ->getOneOrNullResult();
}
```

## Using Soft Delete in Controllers

### Delete Action (Soft Delete)

Update `src/Controller/UserController.php`:

```php
#[Route('/{id}', name: 'user_delete', methods: ['POST'])]
public function delete(
    Request $request,
    User $user,
    EntityManagerInterface $em
): Response {
    $this->denyAccessUnlessGranted('USER_DELETE', $user);

    if ($this->isCsrfTokenValid('delete' . $user->getId(), (string)$request->request->get('_token'))) {
        // Soft delete instead of hard delete
        $user->softDelete();
        $em->flush();

        $this->addFlash('success', 'User deleted successfully.');
    }

    return $this->redirectToRoute('user_index');
}
```

**What happens:**

1. User clicks delete
2. Controller calls `softDelete()` (sets `deletedAt` timestamp)
3. Doctrine filter automatically excludes this user from future queries
4. User appears deleted to users, but data is preserved

## Querying Deleted Users

Sometimes you need to see deleted users (e.g., admin restore functionality).

### Temporarily Disable Filter

```php
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

public function listDeletedUsers(EntityManagerInterface $em): array
{
    // Temporarily disable the filter
    $em->getFilters()->disable('not_deleted');

    // Now queries will include soft-deleted users
    $deletedUsers = $em->getRepository(User::class)
        ->createQueryBuilder('u')
        ->where('u.deletedAt IS NOT NULL')
        ->orderBy('u.deletedAt', 'DESC')
        ->getQuery()
        ->getResult();

    // Re-enable filter (important!)
    $em->getFilters()->enable('not_deleted');

    return $deletedUsers;
}
```

**Important:** Always re-enable the filter after disabling it!

### Restore Deleted User

```php
public function restoreUser(int $userId, EntityManagerInterface $em): void
{
    // Disable filter to find deleted user
    $em->getFilters()->disable('not_deleted');

    $user = $em->getRepository(User::class)->find($userId);
    
    if ($user && $user->isDeleted()) {
        $user->restore(); // Clear deletedAt
        $em->flush();
    }

    // Re-enable filter
    $em->getFilters()->enable('not_deleted');
}
```

## Advanced: Filter with Parameters

You can make filters configurable using parameters:

```php
<?php

namespace App\Doctrine\Filter;

use Doctrine\ORM\Mapping\ClassMetadata;
use Doctrine\ORM\Query\Filter\SQLFilter;

/**
 * NotDeletedFilter with parameter support
 * 
 * Allows enabling/disabling filter per query using parameters.
 */
class NotDeletedFilter extends SQLFilter
{
    public function addFilterConstraint(ClassMetadata $targetEntity, string $targetTableAlias): string
    {
        if ($targetEntity->getReflectionClass()->getName() !== \App\Entity\User::class) {
            return '';
        }

        // Check if filter is disabled via parameter
        // Usage: $em->getFilters()->setParameter('not_deleted', 'include_deleted', true);
        if ($this->hasParameter('include_deleted') && $this->getParameter('include_deleted')) {
            return ''; // Don't filter if include_deleted is true
        }

        return sprintf('%s.deleted_at IS NULL', $targetTableAlias);
    }
}
```

**Usage:**
```php
// Include deleted users in this query
$em->getFilters()->setParameter('not_deleted', 'include_deleted', true);
$users = $repository->findAll();
$em->getFilters()->setParameter('not_deleted', 'include_deleted', false); // Reset
```

## Multi-Tenancy Example

Filters are also useful for multi-tenancy (isolating data by tenant):

```php
<?php

namespace App\Doctrine\Filter;

use Doctrine\ORM\Mapping\ClassMetadata;
use Doctrine\ORM\Query\Filter\SQLFilter;

/**
 * TenantFilter
 * 
 * Automatically filters entities by tenant_id.
 * Useful for multi-tenant applications where each tenant's data must be isolated.
 */
class TenantFilter extends SQLFilter
{
    public function addFilterConstraint(ClassMetadata $targetEntity, string $targetTableAlias): string
    {
        // Only apply to entities with tenant_id column
        if (!$targetEntity->hasField('tenantId')) {
            return '';
        }

        // Get current tenant ID from filter parameter
        // Set via: $em->getFilters()->setParameter('tenant', 'tenant_id', $currentTenantId);
        $tenantId = $this->getParameter('tenant_id');

        if ($tenantId === null) {
            return ''; // No filtering if tenant_id not set
        }

        return sprintf('%s.tenant_id = %s', $targetTableAlias, $tenantId);
    }
}
```

**Usage:**
```php
// Set tenant context
$em->getFilters()->setParameter('tenant', 'tenant_id', $currentUser->getTenantId());

// All queries now automatically filter by tenant_id
$users = $repository->findAll(); // Only returns users for current tenant
```

## Testing Filters

```php
<?php

namespace App\Tests\Doctrine;

use App\Entity\User;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

class NotDeletedFilterTest extends KernelTestCase
{
    public function testFilterExcludesSoftDeletedUsers(): void
    {
        $em = self::getContainer()->get('doctrine')->getManager();
        $repository = $em->getRepository(User::class);

        // Create and soft delete a user
        $user = new User();
        $user->setEmail('deleted@example.com');
        $user->setPassword('hashed');
        $em->persist($user);
        $em->flush();

        $userId = $user->getId();
        $user->softDelete();
        $em->flush();

        // Filter should exclude soft-deleted user
        $found = $repository->find($userId);
        $this->assertNull($found, 'Soft-deleted user should not be found');

        // Disable filter to verify user still exists
        $em->getFilters()->disable('not_deleted');
        $found = $repository->find($userId);
        $this->assertNotNull($found, 'User should exist when filter is disabled');
        $this->assertTrue($found->isDeleted(), 'User should be marked as deleted');
        $em->getFilters()->enable('not_deleted');
    }
}
```

## Best Practices

!!! warning "Always Re-enable Filters"
    If you disable a filter, always re-enable it immediately after:
    ```php
    $em->getFilters()->disable('not_deleted');
    // ... query ...
    $em->getFilters()->enable('not_deleted'); // CRITICAL!
    ```

!!! tip "Filter Performance"
    - Filters add minimal overhead (just a WHERE condition)
    - Database indexes on `deleted_at` improve performance
    - Consider partial indexes: `CREATE INDEX idx_users_active ON users (id) WHERE deleted_at IS NULL`

!!! note "When to Use Soft Delete"

    **Use soft delete when:**

    - You need audit trails
    - Data recovery is important
    - Referential integrity must be maintained
    - Compliance requires data retention

    **Don't use soft delete when:**

    - Data privacy requires permanent deletion (GDPR)
    - Storage is extremely limited
    - Performance is critical and you have millions of records

## Migration for Existing Data

If you're adding soft delete to an existing application:

```php
<?php

namespace Doctrine\Migrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20240101000000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        // Add deleted_at column (nullable, existing records are not deleted)
        $this->addSql('ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP NULL');
        
        // Create index for performance
        $this->addSql('CREATE INDEX idx_users_deleted_at ON users (deleted_at)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP INDEX idx_users_deleted_at');
        $this->addSql('ALTER TABLE users DROP COLUMN deleted_at');
    }
}
```

## Next Steps

Now that soft delete is implemented:

1. **Controllers** - Update delete actions to use `softDelete()`
2. **Admin Panel** - Add functionality to view and restore deleted users
3. **Scheduled Cleanup** - Optionally add a command to permanently delete old soft-deleted records

Your application now safely handles deletions while preserving data!
