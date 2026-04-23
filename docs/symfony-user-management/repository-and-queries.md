# Repository & Queries

The repository pattern encapsulates all database queries for the User entity. This keeps query logic centralized, testable, and reusable. We'll implement filtering, sorting, pagination, and search functionality using Doctrine's QueryBuilder.

## Why Use Repositories?

**Benefits:**

- **Centralized queries**: All User queries in one place
- **Reusable**: Multiple controllers can use the same query methods
- **Testable**: Can mock repositories or test queries independently
- **Maintainable**: Changes to queries happen in one location
- **Type-safe**: Returns typed entities, not raw arrays

## Complete UserRepository

Create `src/Repository/UserRepository.php`:

```php
<?php

namespace App\Repository;

use App\Entity\User;
use App\Model\UserFilter;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\ORM\QueryBuilder;
use Doctrine\Persistence\ManagerRegistry;

/**
 * UserRepository
 * 
 * Provides custom query methods for User entities beyond the standard
 * find(), findAll(), findBy() methods inherited from ServiceEntityRepository.
 */
class UserRepository extends ServiceEntityRepository
{
    /**
     * Constructor - required by ServiceEntityRepository
     * 
     * @param ManagerRegistry $registry Doctrine's service registry
     */
    public function __construct(ManagerRegistry $registry)
    {
        // Call parent constructor with User entity class
        parent::__construct($registry, User::class);
    }

    /**
     * Creates a base QueryBuilder for User queries
     * 
     * This is a helper method to avoid repeating 'u' alias everywhere.
     * All custom queries should start from this base builder.
     * 
     * @return QueryBuilder QueryBuilder with 'u' alias for User entity
     */
    private function baseQb(): QueryBuilder
    {
        return $this->createQueryBuilder('u');
    }

    /**
     * Find a user by email address
     * 
     * This is useful for authentication lookups. We normalize the email
     * to lowercase to ensure case-insensitive matching.
     * 
     * @param string $email Email address to search for
     * @return User|null The User entity if found, null otherwise
     */
    public function findOneByEmail(string $email): ?User
    {
        return $this->baseQb()
            ->andWhere('u.email = :email')
            ->setParameter('email', strtolower($email))
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * Search users with filtering, sorting, and pagination
     * 
     * This is the main query method for listing users. It accepts a UserFilter
     * DTO that contains all search criteria, sort options, and pagination settings.
     * 
     * @param UserFilter $filter Filter DTO with search criteria
     * @return array{items: list<User>, total: int} Array with 'items' (User entities) and 'total' (count)
     */
    public function search(UserFilter $filter): array
    {
        // Start with base query builder
        $qb = $this->baseQb();

        // ============================================
        // SEARCH FILTERING
        // ============================================

        // Search query - searches across email, firstName, and lastName
        if (!empty($filter->q)) {
            $qb->andWhere(
                'LOWER(u.email) LIKE :term OR ' .
                'LOWER(u.lastName) LIKE :term OR ' .
                'LOWER(u.firstName) LIKE :term'
            )
            ->setParameter('term', '%' . strtolower($filter->q) . '%');
            
            // Explanation:
            // - LOWER() converts to lowercase for case-insensitive search
            // - LIKE with %term% performs partial matching
            // - OR allows matching in any of the three fields
            // - Parameter binding prevents SQL injection
        }

        // Active status filter
        if ($filter->active !== null) {
            $qb->andWhere('u.isActive = :active')
               ->setParameter('active', (bool)$filter->active);
            
            // Explanation:
            // - Only adds WHERE clause if filter is explicitly set (not null)
            // - Converts to boolean to ensure type safety
        }

        // ============================================
        // SORTING (with SQL injection protection)
        // ============================================

        // Whitelist of allowed sort fields
        // CRITICAL: Never use user input directly in ORDER BY without whitelisting!
        $allowedSort = ['createdAt', 'email', 'lastName'];
        
        // Check if requested sort field is in whitelist
        $sortField = in_array($filter->sort, $allowedSort, true) 
            ? 'u.' . $filter->sort 
            : 'u.createdAt';  // Default to createdAt if invalid
        
        // Normalize sort direction (only allow 'asc' or 'desc')
        $dir = strtolower($filter->dir) === 'asc' ? 'asc' : 'desc';
        
        // Apply sorting
        $qb->orderBy($sortField, $dir);

        // ============================================
        // COUNT QUERY (for pagination)
        // ============================================

        // Clone the query builder to create a separate count query
        // Why clone? We need the same WHERE clauses but different SELECT
        $countQb = clone $qb;
        
        // Get total count of matching records
        // - resetDQLPart('orderBy') removes ORDER BY (not needed for COUNT)
        // - getSingleScalarResult() returns a single integer value
        $total = (int) $countQb
            ->select('COUNT(u.id)')
            ->resetDQLPart('orderBy')
            ->getQuery()
            ->getSingleScalarResult();

        // ============================================
        // PAGINATION
        // ============================================

        // Normalize page number (ensure it's at least 1)
        $page = max(1, $filter->page);
        
        // Normalize items per page (between 1 and 100)
        $perPage = min(100, max(1, $filter->perPage));
        
        // Calculate offset (how many records to skip)
        $offset = max(0, ($page - 1) * $perPage);
        
        // Apply pagination and execute query
        $items = $qb
            ->setFirstResult($offset)  // Skip this many records
            ->setMaxResults($perPage)   // Return this many records
            ->getQuery()
            ->getResult();              // Execute and return User entities

        // Return both items and total for pagination UI
        return [
            'items' => $items,
            'total' => $total,
        ];
    }

    /**
     * Find active users only
     * 
     * Convenience method for common query pattern.
     * 
     * @return list<User> Array of active User entities
     */
    public function findActive(): array
    {
        return $this->baseQb()
            ->andWhere('u.isActive = :active')
            ->setParameter('active', true)
            ->orderBy('u.lastName', 'ASC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Count users by status
     * 
     * Useful for dashboard statistics.
     * 
     * @return array{active: int, inactive: int} Counts by status
     */
    public function countByStatus(): array
    {
        $active = (int) $this->baseQb()
            ->select('COUNT(u.id)')
            ->andWhere('u.isActive = :active')
            ->setParameter('active', true)
            ->getQuery()
            ->getSingleScalarResult();

        $inactive = (int) $this->baseQb()
            ->select('COUNT(u.id)')
            ->andWhere('u.isActive = :active')
            ->setParameter('active', false)
            ->getQuery()
            ->getSingleScalarResult();

        return [
            'active' => $active,
            'inactive' => $inactive,
        ];
    }
}
```

## Understanding QueryBuilder

**What is QueryBuilder?**

- Doctrine's fluent interface for building DQL (Doctrine Query Language) queries
- Type-safe and SQL injection resistant when used correctly
- Converts to SQL automatically based on your database platform

**Key methods:**

- `createQueryBuilder('u')` - Start a new query with alias 'u'
- `andWhere()` - Add WHERE conditions (AND logic)
- `orWhere()` - Add WHERE conditions (OR logic)
- `setParameter()` - Bind values safely (prevents SQL injection)
- `orderBy()` - Add ORDER BY clause
- `setFirstResult()` - Set OFFSET for pagination
- `setMaxResults()` - Set LIMIT for pagination
- `getQuery()` - Convert builder to executable Query
- `getResult()` - Execute and return entities
- `getOneOrNullResult()` - Execute and return single entity or null

## Security: Preventing SQL Injection

**CRITICAL:** Always use parameter binding, never string concatenation!

**BAD (SQL injection vulnerable):**
```php
// NEVER DO THIS!
$qb->andWhere("u.email = '" . $userInput . "'");
```

**GOOD (safe):**
```php
// Always use setParameter()
$qb->andWhere('u.email = :email')
   ->setParameter('email', $userInput);
```

**For dynamic ORDER BY:**
```php
// Whitelist approach (what we use)
$allowedSort = ['createdAt', 'email', 'lastName'];
$sortField = in_array($filter->sort, $allowedSort, true) 
    ? 'u.' . $filter->sort 
    : 'u.createdAt';
$qb->orderBy($sortField, $dir);
```

## Efficient Count Queries

**Why separate COUNT query?**
- Main query uses `setFirstResult()` and `setMaxResults()` (LIMIT/OFFSET)
- COUNT needs the same WHERE clauses but different SELECT
- Cloning the QueryBuilder reuses WHERE logic without affecting main query

**Alternative approaches for large datasets:**
```php
// Approximate count (faster, less accurate)
// PostgreSQL example:
$total = (int) $em->getConnection()->executeQuery(
    "SELECT reltuples::BIGINT AS estimate 
     FROM pg_class WHERE relname = 'users'"
)->fetchOne();

// Capped pagination (don't show page 1000 if there are only 50 records)
$maxPage = min(100, ceil($total / $perPage));
```

## Pagination Best Practices

**Page size limits:**

- Small: 10-20 items (better UX, more pages)
- Medium: 20-50 items (balanced)
- Large: 50-100 items (faster, fewer pages)
- Never allow unlimited (could crash server)

**Offset calculation:**
```php
// Page 1: offset = 0, limit = 20  (items 1-20)
// Page 2: offset = 20, limit = 20 (items 21-40)
// Page 3: offset = 40, limit = 20 (items 41-60)
$offset = ($page - 1) * $perPage;
```

**Performance note:**

- OFFSET becomes slow on large datasets (OFFSET 10000 means skip 10000 rows)
- For very large datasets, consider cursor-based pagination (WHERE id > last_id)

## Eager vs Lazy Loading

**Current implementation (lazy loading):**
```php
// Returns full User entities
$items = $qb->getQuery()->getResult();
```

**When to use DTOs (Data Transfer Objects):**

```php
// For large lists, select only needed fields
$qb->select('u.id', 'u.email', 'u.firstName', 'u.lastName')
   ->getQuery()
   ->getResult();  // Returns arrays, not entities
```

**Benefits of DTOs:**
- Faster (less data transferred)
- Less memory (smaller objects)
- Better for APIs (only send what's needed)

**When to use entities:**
- Need full entity functionality
- Small result sets
- Need to modify entities after loading

## N+1 Query Problem

**What is N+1?**
If you later add relations (e.g., `User->groups`), loading users and their groups separately causes many queries:

```php
// BAD: N+1 queries
$users = $repository->findAll();
foreach ($users as $user) {
    $groups = $user->getGroups(); // Query executed here for each user!
}
// Result: 1 query for users + N queries for groups = N+1 queries
```

**Solution: Eager loading with JOIN FETCH**
```php
// GOOD: Single query with JOIN
public function findAllWithGroups(): array
{
    return $this->baseQb()
        ->leftJoin('u.groups', 'g')
        ->addSelect('g')  // Fetch groups in same query
        ->getQuery()
        ->getResult();
}
// Result: 1 query total
```

!!! warning "N+1 Query Problem"
    If you add relations to User (e.g., groups, roles, etc.), always use JOIN FETCH in repository methods that list users. Otherwise, Doctrine will execute separate queries for each user's relations, causing performance issues.

!!! tip "Don't Return QueryBuilder to Controllers"
    **Why?** Controllers should be thin. They shouldn't know about query building.
    
    **BAD:**
    ```php
    public function getQueryBuilder(): QueryBuilder { return $qb; }
    // Controller has to know about query building
    ```
    
    **GOOD:**
    ```php
    public function search(UserFilter $filter): array { /* ... */ }
    // Controller just calls method, gets results
    ```

## Testing Repositories

You can test repositories using Doctrine's test database:

```php
<?php

namespace App\Tests\Repository;

use App\Entity\User;
use App\Repository\UserRepository;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

class UserRepositoryTest extends KernelTestCase
{
    private UserRepository $repository;

    protected function setUp(): void
    {
        $kernel = self::bootKernel();
        $this->repository = $kernel->getContainer()
            ->get('doctrine')
            ->getRepository(User::class);
    }

    public function testFindOneByEmail(): void
    {
        // Create test user
        $user = new User();
        $user->setEmail('test@example.com');
        $user->setPassword('hashed');
        // ... set other fields
        
        $em = $this->repository->getEntityManager();
        $em->persist($user);
        $em->flush();

        // Test the method
        $found = $this->repository->findOneByEmail('test@example.com');
        
        $this->assertNotNull($found);
        $this->assertEquals('test@example.com', $found->getEmail());
    }
}
```

## Next Steps

Now that your repository is complete:

1. **Controllers** - Use repository methods instead of writing queries in controllers
2. **Forms** - Build forms that work with User entities
3. **Views** - Display paginated, filtered user lists

Your repository provides a clean, secure, and efficient way to query users!
