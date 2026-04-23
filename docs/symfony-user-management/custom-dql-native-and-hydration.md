# Custom DQL, Native Queries & Hydration

Sometimes you need queries that go beyond what QueryBuilder can easily express. Doctrine provides DQL (Doctrine Query Language), native SQL queries, and different hydration modes to handle complex scenarios.

## When to Use What?

**QueryBuilder (recommended):**

- Most queries (90% of cases)
- Type-safe, portable across databases
- Easy to build dynamically

**DQL:**

- Complex queries with subqueries
- When QueryBuilder becomes too verbose
- Custom DQL functions

**Native SQL:**

- Database-specific features (window functions, CTEs)
- Performance-critical queries
- Complex aggregations
- Use sparingly (loses database portability)

## DQL (Doctrine Query Language)

DQL is similar to SQL but works with entities instead of tables.

### Basic DQL Query

```php
<?php

namespace App\Repository;

use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class UserRepository extends ServiceEntityRepository
{
    /**
     * Find active users using DQL
     * 
     * DQL uses entity names and property names, not table/column names.
     * Doctrine translates DQL to SQL automatically.
     */
    public function findActiveUsersDQL(): array
    {
        $dql = 'SELECT u FROM App\Entity\User u WHERE u.isActive = :active ORDER BY u.createdAt DESC';
        
        return $this->getEntityManager()
            ->createQuery($dql)
            ->setParameter('active', true)
            ->getResult(); // Returns User entities
    }
}
```

**Explanation:**

- `SELECT u FROM App\Entity\User u` - Select User entities (alias 'u')
- `WHERE u.isActive = :active` - Filter condition
- `:active` - Named parameter (bound with `setParameter()`)
- `getResult()` - Returns array of User entities

### DQL with Scalar Hydration (Arrays)

Sometimes you only need specific fields, not full entities:

```php
/**
 * Get user list as arrays (faster, less memory)
 * 
 * Returns plain arrays instead of User entities.
 * Useful for exports, reports, or when you don't need entity functionality.
 */
public function getUserListAsArrays(): array
{
    $dql = 'SELECT u.id, u.email, u.firstName, u.lastName, u.createdAt 
            FROM App\Entity\User u 
            WHERE u.isActive = :active 
            ORDER BY u.createdAt DESC';
    
    return $this->getEntityManager()
        ->createQuery($dql)
        ->setParameter('active', true)
        ->setMaxResults(50)
        ->getArrayResult(); // Returns arrays, not entities
}
```

**Result format:**
```php
[
    ['id' => 1, 'email' => 'user1@example.com', 'firstName' => 'John', ...],
    ['id' => 2, 'email' => 'user2@example.com', 'firstName' => 'Jane', ...],
]
```

**Benefits:**

- Faster (no entity hydration overhead)
- Less memory (no proxy objects)
- Good for read-only operations

### DQL with Partial Objects

Select only specific fields but still get entities:

```php
/**
 * Get partial User entities (only selected fields loaded)
 * 
 * Faster than full entity hydration, but still returns User objects.
 * Unselected fields will be lazy-loaded if accessed.
 */
public function getPartialUsers(): array
{
    $dql = 'SELECT PARTIAL u.{id, email, firstName, lastName} 
            FROM App\Entity\User u 
            WHERE u.isActive = :active';
    
    return $this->getEntityManager()
        ->createQuery($dql)
        ->setParameter('active', true)
        ->getResult(); // Returns User entities (partial)
}
```

**When to use:**

- Need entity methods but don't need all fields
- Performance optimization for large lists
- Be careful: accessing unselected fields triggers additional queries

### DQL with Aggregations

```php
/**
 * Get user statistics using DQL aggregations
 */
public function getUserStatistics(): array
{
    $dql = 'SELECT 
                COUNT(u.id) as totalUsers,
                COUNT(CASE WHEN u.isActive = true THEN 1 END) as activeUsers,
                COUNT(CASE WHEN u.isActive = false THEN 1 END) as inactiveUsers,
                MAX(u.createdAt) as newestUserDate
            FROM App\Entity\User u';
    
    return $this->getEntityManager()
        ->createQuery($dql)
        ->getSingleResult(); // Returns single array with statistics
}
```

**Result:**
```php
[
    'totalUsers' => 150,
    'activeUsers' => 120,
    'inactiveUsers' => 30,
    'newestUserDate' => DateTimeImmutable(...)
]
```

### DQL with Subqueries

```php
/**
 * Find users created in the last 7 days using subquery
 */
public function findRecentUsers(): array
{
    $dql = 'SELECT u FROM App\Entity\User u 
            WHERE u.createdAt > (
                SELECT MAX(u2.createdAt) - 7 
                FROM App\Entity\User u2
            )';
    
    return $this->getEntityManager()
        ->createQuery($dql)
        ->getResult();
}
```

## Custom DQL Functions

Sometimes you need database-specific functions. For example, PostgreSQL's `ILIKE` (case-insensitive LIKE).

### Step 1: Create Custom Function Class

Create `src/Doctrine/DQL/ILikeFunction.php`:

```php
<?php

namespace App\Doctrine\DQL;

use Doctrine\ORM\Query\AST\Functions\FunctionNode;
use Doctrine\ORM\Query\Lexer;
use Doctrine\ORM\Query\Parser;
use Doctrine\ORM\Query\SqlWalker;

/**
 * ILikeFunction
 * 
 * Custom DQL function for PostgreSQL's ILIKE operator.
 * Usage in DQL: ILIKE(u.email, :pattern)
 * 
 * Translates to SQL: u.email ILIKE :pattern
 */
class ILikeFunction extends FunctionNode
{
    public $field;
    public $pattern;

    /**
     * Parse the DQL function call
     */
    public function getSql(SqlWalker $sqlWalker): string
    {
        // Get SQL for field and pattern
        $field = $this->field->dispatch($sqlWalker);
        $pattern = $this->pattern->dispatch($sqlWalker);
        
        // Return PostgreSQL ILIKE syntax
        return $field . ' ILIKE ' . $pattern;
    }

    /**
     * Parse the function arguments
     */
    public function parse(Parser $parser): void
    {
        $parser->match(Lexer::T_IDENTIFIER);
        $parser->match(Lexer::T_OPEN_PARENTHESIS);
        
        // First argument: field
        $this->field = $parser->StringPrimary();
        $parser->match(Lexer::T_COMMA);
        
        // Second argument: pattern
        $this->pattern = $parser->StringPrimary();
        
        $parser->match(Lexer::T_CLOSE_PARENTHESIS);
    }
}
```

### Step 2: Register Custom Function

Update `config/packages/doctrine.yaml`:

```yaml
doctrine:
  orm:
    # ... other config ...
    dql:
      string_functions:
        ILIKE: App\Doctrine\DQL\ILikeFunction
```

### Step 3: Use Custom Function

```php
/**
 * Case-insensitive search using custom ILIKE function
 */
public function searchCaseInsensitive(string $term): array
{
    $dql = 'SELECT u FROM App\Entity\User u 
            WHERE ILIKE(u.email, :pattern) 
            OR ILIKE(u.firstName, :pattern) 
            OR ILIKE(u.lastName, :pattern)';
    
    return $this->getEntityManager()
        ->createQuery($dql)
        ->setParameter('pattern', '%' . $term . '%')
        ->getResult();
}
```

**Note:** This is PostgreSQL-specific. For MySQL, you'd use `LOWER()` instead.

## Native SQL Queries

When you need database-specific features or maximum performance, use native SQL.

### Basic Native Query

```php
use Doctrine\ORM\Query\ResultSetMappingBuilder;

/**
 * Find users using native SQL
 * 
 * Use ResultSetMappingBuilder to map SQL results to entities.
 */
public function findUsersNativeSQL(): array
{
    // Create result set mapping
    $rsm = new ResultSetMappingBuilder($this->getEntityManager());
    
    // Map SQL result to User entity
    // 'u' is the alias used in SQL SELECT
    $rsm->addRootEntityFromClassMetadata(User::class, 'u');
    
    // Native SQL query
    $sql = 'SELECT u.* FROM users u 
            WHERE u.created_at > :since 
            AND u.is_active = :active
            ORDER BY u.created_at DESC';
    
    // Create and execute native query
    $query = $this->getEntityManager()
        ->createNativeQuery($sql, $rsm)
        ->setParameter('since', (new \DateTimeImmutable('-7 days'))->format('Y-m-d H:i:s'))
        ->setParameter('active', true);
    
    return $query->getResult(); // Returns User entities
}
```

**Explanation:**

- `ResultSetMappingBuilder` - Maps SQL columns to entity properties
- `addRootEntityFromClassMetadata()` - Tells Doctrine how to hydrate results
- Native SQL uses actual table/column names (not entity/property names)
- Parameters still work the same way

### Native Query with Scalar Results

```php
/**
 * Get user count by status using native SQL
 */
public function getUserCountByStatus(): array
{
    $sql = 'SELECT 
                is_active,
                COUNT(*) as count
            FROM users
            GROUP BY is_active';
    
    $rsm = new ResultSetMappingBuilder($this->getEntityManager());
    $rsm->addScalarResult('is_active', 'isActive', 'boolean');
    $rsm->addScalarResult('count', 'count', 'integer');
    
    return $this->getEntityManager()
        ->createNativeQuery($sql, $rsm)
        ->getResult();
}
```

**Result:**
```php
[
    ['isActive' => true, 'count' => 120],
    ['isActive' => false, 'count' => 30]
]
```

### Native Query with Complex Joins

```php
/**
 * Get users with their group counts using native SQL
 * 
 * This demonstrates a complex query that might be easier in SQL
 * than trying to build with QueryBuilder.
 */
public function getUsersWithGroupCounts(): array
{
    $sql = '
        SELECT 
            u.id,
            u.email,
            u.first_name,
            u.last_name,
            COUNT(ug.group_id) as group_count
        FROM users u
        LEFT JOIN user_groups ug ON u.id = ug.user_id
        WHERE u.is_active = :active
        GROUP BY u.id, u.email, u.first_name, u.last_name
        ORDER BY group_count DESC
    ';
    
    $rsm = new ResultSetMappingBuilder($this->getEntityManager());
    $rsm->addRootEntityFromClassMetadata(User::class, 'u');
    // Note: group_count won't be mapped to entity, use DTO instead
    
    return $this->getEntityManager()
        ->createNativeQuery($sql, $rsm)
        ->setParameter('active', true)
        ->getResult();
}
```

## Hydration Modes

Doctrine supports different ways of converting query results into PHP objects/arrays:

### Object Hydration (Default)

```php
->getResult() // Returns array of User entities
```

**When to use:**
- Need full entity functionality
- Will modify entities
- Need relationships loaded

### Array Hydration

```php
->getArrayResult() // Returns array of arrays
```

**When to use:**
- Read-only operations
- Exports/reports
- Performance-critical (faster, less memory)

### Scalar Hydration

```php
->getScalarResult() // Returns array of scalar values
```

**When to use:**
- Single column results
- Aggregations (COUNT, SUM, etc.)

### Single Scalar Result

```php
->getSingleScalarResult() // Returns single value
```

**When to use:**
- COUNT queries
- Single value needed

### Single Result

```php
->getOneOrNullResult() // Returns single entity or null
```

**When to use:**
- Finding one record
- Returns null if not found (doesn't throw exception)

```php
->getSingleResult() // Returns single entity or throws exception
```

**When to use:**
- Finding one record
- Should throw exception if not found

## DTOs (Data Transfer Objects) for Complex Queries

For complex queries that don't map well to entities, use DTOs:

```php
<?php

namespace App\DTO;

/**
 * UserListDTO
 * 
 * DTO for user list queries that include computed fields.
 */
class UserListDTO
{
    public function __construct(
        public readonly int $id,
        public readonly string $email,
        public readonly string $fullName,
        public readonly int $groupCount,
        public readonly \DateTimeImmutable $createdAt
    ) {}
}
```

**Hydrate to DTO:**

```php
use App\DTO\UserListDTO;

public function getUserListDTOs(): array
{
    $dql = 'SELECT NEW App\DTO\UserListDTO(
                u.id,
                u.email,
                CONCAT(u.firstName, \' \', u.lastName),
                SIZE(u.groups),
                u.createdAt
            )
            FROM App\Entity\User u
            WHERE u.isActive = :active';
    
    return $this->getEntityManager()
        ->createQuery($dql)
        ->setParameter('active', true)
        ->getResult(); // Returns array of UserListDTO
}
```

**Benefits:**
- Type-safe
- Only loads needed data
- Can include computed fields
- No entity overhead

## Best Practices

!!! warning "Database Portability"
    - **DQL**: Portable across databases (Doctrine translates it)
    - **Native SQL**: Database-specific (loses portability)
    - Use native SQL only when necessary
    - Document database-specific assumptions

!!! tip "Performance Considerations"
    - **Array hydration**: Fastest for read-only
    - **DTO hydration**: Good balance (type-safe, fast)
    - **Entity hydration**: Slowest but most flexible
    - Profile queries to see actual performance

!!! note "Security**
    Always use parameter binding, even in native SQL:
    ```php
    // GOOD
    ->setParameter('email', $userInput)
    
    // BAD - SQL injection risk!
    ->setParameter('email', "'" . $userInput . "'")
    ```

## Testing Custom Queries

```php
<?php

namespace App\Tests\Repository;

use App\Repository\UserRepository;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

class UserRepositoryTest extends KernelTestCase
{
    public function testDQLQuery(): void
    {
        $repository = self::getContainer()->get(UserRepository::class);
        $users = $repository->findActiveUsersDQL();
        
        $this->assertIsArray($users);
        foreach ($users as $user) {
            $this->assertInstanceOf(User::class, $user);
            $this->assertTrue($user->isActive());
        }
    }

    public function testArrayHydration(): void
    {
        $repository = self::getContainer()->get(UserRepository::class);
        $users = $repository->getUserListAsArrays();
        
        $this->assertIsArray($users);
        $this->assertNotEmpty($users);
        $this->assertArrayHasKey('email', $users[0]);
        $this->assertArrayHasKey('firstName', $users[0]);
    }
}
```

## Next Steps

Now that you understand DQL and native queries:

1. **Performance** - Use appropriate hydration modes for your use case
2. **Complex Queries** - Use DQL for complex logic, native SQL when needed
3. **DTOs** - Create DTOs for queries that don't fit entities well

Your repository can now handle any query complexity!
