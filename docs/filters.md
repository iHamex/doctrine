# Filters: Applying Global Query Constraints

Doctrine Filters are a powerful and somewhat hidden feature that allow you to add `WHERE` clauses to your SQL queries at a global level. Instead of adding a condition to every DQL query in your repositories, you can define a filter once and enable it when needed.

This is the perfect tool for implementing cross-cutting concerns that affect many of your entities, such as:
-   **Soft Deletes**: Automatically excluding records marked as "deleted".
-   **Multi-Tenancy**: Ensuring users can only see data belonging to their organization or tenant.
-   **Localization**: Filtering content by the user's current locale.

## How Filters Work

A filter is a class that you define, which can dynamically add SQL to the `WHERE` clause of any query involving a specific entity.

1.  **Define a Filter Class**: You create a class that extends `Doctrine\ORM\Query\Filter\SQLFilter`.
2.  **Configure It**: You register your filter class in the Doctrine configuration.
3.  **Enable It**: In your application logic (e.g., in a request listener), you enable the filter and pass it any necessary parameters.

Once enabled, the filter will be applied to **all** DQL, repository, and lazy-loading queries for the rest of the request.

## Example 1: A Complete Soft-Delete Filter

Let's implement a robust soft-delete filter. The goal is to automatically add a `deletedAt IS NULL` condition to any query for an entity that is "soft-deleteable".

#### Step 1: Create a `SoftDeleteable` Interface/Trait (Optional but Recommended)
This helps to standardize the soft-delete functionality.

```php
// src/Entity/SoftDeleteable.php
<?php
namespace App\Entity;

interface SoftDeleteable 
{
    public function setDeletedAt(\DateTime $deletedAt): self;
    public function isDeleted(): bool;
}

// src/Entity/SoftDeleteableTrait.php
<?php
namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

trait SoftDeleteableTrait
{
    #[ORM\Column(type: 'datetime', nullable: true)]
    private ?\DateTime $deletedAt = null;

    public function setDeletedAt(\DateTime $deletedAt): self
    {
        $this->deletedAt = $deletedAt;
        return $this;
    }

    public function isDeleted(): bool
    {
        return $this->deletedAt !== null;
    }
}
```

#### Step 2: Define the Filter Class
The filter class contains the core logic. It inspects the entity being queried and adds the SQL condition if it implements our interface.

```php
// src/Doctrine/Filter/SoftDeleteFilter.php
<?php
namespace App\Doctrine\Filter;

use Doctrine\ORM\Mapping\ClassMetadata;
use Doctrine\ORM\Query\Filter\SQLFilter;

class SoftDeleteFilter extends SQLFilter
{
    public function addFilterConstraint(ClassMetadata $targetEntity, string $targetTableAlias): string
    {
        // Check if the entity has the 'deletedAt' field
        if (!$targetEntity->hasField('deletedAt')) {
            return '';
        }

        // You can also check for an interface, trait, or attribute if you have a standardized way
        // of marking your entities.
        // if (!$targetEntity->getReflectionClass()->implementsInterface(SoftDeleteable::class)) {
        //     return '';
        // }

        // Return the SQL condition
        return sprintf('%s.deleted_at IS NULL', $targetTableAlias);
    }
}
```

#### Step 3: Configure the Filter
You must register the filter in your Doctrine configuration (`bootstrap.php` or framework config).

```php
// In your Doctrine setup
$config->addFilter('soft_delete', \App\Doctrine\Filter\SoftDeleteFilter::class);
```

#### Step 4: Enable the Filter
In your application's entry point (e.g., a kernel request listener), enable the filter.

```php
// e.g., in a Symfony Request Listener
public function onKernelRequest(RequestEvent $event): void
{
    $this->entityManager->getFilters()->enable('soft_delete');
}
```
Now, any query like `$entityManager->getRepository(Product::class)->findAll()` will automatically have `WHERE product_alias.deleted_at IS NULL` appended to it.

!!! tip "Disabling a Filter"
    Sometimes you need to see the "deleted" records, for example, in an admin panel. You can disable a filter for a specific part of your code:
    ```php
    $filters = $entityManager->getFilters();
    $filters->disable('soft_delete');
    
    // ... perform queries that will now include soft-deleted records ...
    
    // It's good practice to re-enable it afterwards
    $filters->enable('soft_delete');
    ```

## Example 2: Multi-Tenancy with Parameters

Filters are dynamic. You can pass parameters to them at runtime, which is perfect for multi-tenancy.

#### Step 1: The Filter Class
This filter will add a condition like `tenant_id = ?`.

```php
// src/Doctrine/Filter/TenantFilter.php
<?php
namespace App\Doctrine\Filter;

use Doctrine\ORM\Mapping\ClassMetadata;
use Doctrine\ORM\Query\Filter\SQLFilter;

class TenantFilter extends SQLFilter
{
    public function addFilterConstraint(ClassMetadata $targetEntity, string $targetTableAlias): string
    {
        // Check if the entity is tenant-aware
        if (!$targetEntity->hasField('tenantId')) {
            return '';
        }

        try {
            // Get the tenant ID from the parameters set on the filter
            // The getParameter() method will quote the value to prevent SQL injection
            $tenantId = $this->getParameter('tenant_id');
        } catch (\InvalidArgumentException $e) {
            // This happens if the parameter is not set. You can decide to either
            // throw an exception, or return an impossible condition to prevent any data from leaking.
            // For example:
            return '1=0'; // No rows will ever be returned
        }
        
        return sprintf('%s.tenant_id = %s', $targetTableAlias, $tenantId);
    }
}
```

#### Step 2: Configure and Enable with Parameters
In your request listener, after authenticating the user, you enable the filter and provide it with the current user's tenant ID.

```php
// In a request listener, after user is authenticated
$user = $this->security->getUser(); // Get the current user
$tenantId = $user->getTenantId();

$filters = $this->entityManager->getFilters();
$filter = $filters->enable('tenant_filter'); // Assuming it's configured with this name
$filter->setParameter('tenant_id', $tenantId);
$filter->setHint('tenant_aware', true); // Optional: for debugging or more complex filters
```

Now, every query will be automatically and safely scoped to the current user's tenant, preventing data leaks between tenants. This is a far more robust solution than adding `->andWhere('e.tenantId = :current_tenant')` to every single query in your application.

