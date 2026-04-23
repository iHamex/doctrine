# Performance & Caching

Performance optimization ensures your application responds quickly even under load. This guide covers database optimization, caching strategies, and performance monitoring.

## Performance Principles

**Key principles:**

1. **Measure first** - Profile before optimizing
2. **Optimize bottlenecks** - Focus on slowest operations
3. **Cache aggressively** - Cache expensive operations
4. **Database optimization** - Proper indexes and queries
5. **Lazy loading** - Load data only when needed

## Database Optimization

### Indexes

Indexes dramatically speed up queries. Add indexes on frequently queried columns:

```php
// In User entity
#[ORM\Table(name: 'users')]
#[ORM\Index(name: 'idx_user_email', columns: ['email'])]
#[ORM\Index(name: 'idx_user_active', columns: ['is_active'])]
#[ORM\Index(name: 'idx_user_lastname', columns: ['last_name'])]
#[ORM\Index(name: 'idx_user_created', columns: ['created_at'])]
class User
{
    // ...
}
```

**When to add indexes:**

- Columns used in WHERE clauses
- Columns used in ORDER BY
- Columns used in JOINs
- Foreign keys (usually auto-indexed)

**When NOT to add indexes:**

- Rarely queried columns
- Frequently updated columns (indexes slow writes)
- Very small tables (< 1000 rows)

### Composite Indexes

For queries filtering by multiple columns:

```php
#[ORM\Index(name: 'idx_user_active_created', columns: ['is_active', 'created_at'])]
```

**Order matters:**

- Put most selective column first
- Match ORDER BY columns

### Query Optimization

**Select only needed columns:**

```php
// BAD: Selects all columns
$users = $repository->findAll();

// GOOD: Select only needed columns
$qb = $repository->createQueryBuilder('u')
    ->select('PARTIAL u.{id, email, firstName, lastName}')
    ->where('u.isActive = :active')
    ->setParameter('active', true);
$users = $qb->getQuery()->getResult();
```

**Use DTOs for lists:**

```php
// Returns arrays instead of entities (faster)
$dql = 'SELECT u.id, u.email, u.firstName FROM App\Entity\User u';
$users = $em->createQuery($dql)->getArrayResult();
```

### Pagination Best Practices

**Offset pagination (for small/medium datasets):**
```php
$qb->setFirstResult($offset)
   ->setMaxResults($perPage);
```

**Keyset pagination (for large datasets):**
```php
// Faster for deep pages (no OFFSET)
$qb->where('u.id > :lastId')
   ->setParameter('lastId', $lastSeenId)
   ->setMaxResults($perPage);
```

**Why keyset is faster:**

- OFFSET 10000 means database must skip 10000 rows
- Keyset uses indexed WHERE clause (much faster)

## Symfony Cache

Cache expensive computations and query results.

### Cache User List

```php
<?php

namespace App\Repository;

use Psr\Cache\CacheItemPoolInterface;

class UserRepository extends ServiceEntityRepository
{
    public function __construct(
        ManagerRegistry $registry,
        private CacheItemPoolInterface $cache
    ) {
        parent::__construct($registry, User::class);
    }

    /**
     * Get user list with caching
     */
    public function getCachedUserList(UserFilter $filter): array
    {
        // Create cache key from filter
        $cacheKey = 'users:list:' . md5(serialize($filter));
        
        return $this->cache->get($cacheKey, function() use ($filter) {
            // This closure only executes if cache miss
            return $this->search($filter);
        });
    }
}
```

**Cache invalidation:**

```php
public function createUser(User $user): void
{
    $this->em->persist($user);
    $this->em->flush();
    
    // Invalidate cache
    $this->cache->deleteItem('users:list:*'); // Or use cache tags if available
}
```

### Cache Expensive Computations

```php
use Psr\Cache\CacheItemPoolInterface;

class UserStatisticsService
{
    public function __construct(
        private UserRepository $userRepository,
        private CacheItemPoolInterface $cache
    ) {}

    public function getStatistics(): array
    {
        return $this->cache->get('user:statistics', function() {
            // Expensive computation cached for 1 hour
            return [
                'total' => $this->userRepository->count([]),
                'active' => $this->userRepository->count(['isActive' => true]),
                // ... more statistics
            ];
        }, 3600); // TTL: 1 hour
    }
}
```

## HTTP Caching

Cache HTTP responses to reduce server load.

### Cache-Control Headers

```php
use Symfony\Component\HttpFoundation\Response;

public function index(): Response
{
    $response = $this->render('user/index.html.twig', [
        'users' => $users,
    ]);
    
    // Cache for 1 minute (private - requires authentication)
    $response->setMaxAge(60);
    $response->setSharedMaxAge(0); // Don't cache in shared caches
    
    return $response;
}
```

**Cache-Control values:**

- `max-age=60` - Cache for 60 seconds
- `private` - Don't cache in shared proxies (default)
- `public` - Can cache in shared proxies
- `no-cache` - Must revalidate before serving
- `no-store` - Don't cache at all

### ETags

Use ETags for conditional requests:

```php
use Symfony\Component\HttpFoundation\Response;

public function show(User $user): Response
{
    $response = $this->render('user/show.html.twig', [
        'user' => $user,
    ]);
    
    // Generate ETag from user's updated timestamp
    $etag = md5($user->getUpdatedAt()->format('U'));
    $response->setETag($etag);
    $response->isNotModified($this->getRequest());
    
    return $response;
}
```

**How ETags work:**

1. Server sends ETag with response
2. Client stores ETag
3. Next request includes ETag in If-None-Match header
4. If unchanged, server returns 304 Not Modified (no body)

## N+1 Query Problem

**The problem:**
```php
// 1 query for users
$users = $repository->findAll();

// N queries for groups (one per user)
foreach ($users as $user) {
    $groups = $user->getGroups(); // Query executed here!
}
// Total: 1 + N queries
```

**Solution: Eager loading**

```php
// Load users with groups in single query
$qb = $repository->createQueryBuilder('u')
    ->leftJoin('u.groups', 'g')
    ->addSelect('g') // Fetch groups in same query
    ->getQuery();
$users = $qb->getResult();
// Total: 1 query
```

**Detect N+1:**

- Enable Symfony Profiler
- Check Doctrine queries section
- Look for repeated queries

## Database Connection Pooling

**Production configuration:**

```yaml
# config/packages/doctrine.yaml
doctrine:
  dbal:
    url: '%env(resolve:DATABASE_URL)%'
    # Connection pool settings
    connections:
      default:
        server_version: '16'
        charset: utf8
        # Persistent connections (reuse connections)
        persistent: true
        # Connection pool size
        pool_size: 10
```

## Monitoring Performance

### Symfony Profiler

**In development:**

- Already enabled by default
- Shows queries, time, memory
- Identifies N+1 problems
- Shows cache hits/misses

**Access:** Bottom toolbar on every page

### Logging Slow Queries

```php
// config/packages/doctrine.yaml
doctrine:
  dbal:
    logging: true
    profiling: true
```

**Custom slow query logger:**

```php
<?php

namespace App\Doctrine;

use Doctrine\DBAL\Logging\SQLLogger;
use Psr\Log\LoggerInterface;

class SlowQueryLogger implements SQLLogger
{
    private float $startTime;
    private const SLOW_QUERY_THRESHOLD = 0.1; // 100ms

    public function __construct(
        private LoggerInterface $logger
    ) {}

    public function startQuery($sql, ?array $params = null, ?array $types = null): void
    {
        $this->startTime = microtime(true);
    }

    public function stopQuery(): void
    {
        $duration = microtime(true) - $this->startTime;
        
        if ($duration > self::SLOW_QUERY_THRESHOLD) {
            $this->logger->warning('Slow query detected', [
                'duration' => $duration,
                'threshold' => self::SLOW_QUERY_THRESHOLD,
            ]);
        }
    }
}
```

## Performance Checklist

**Database:**

- [ ] Indexes on frequently queried columns
- [ ] Composite indexes for multi-column queries
- [ ] Queries select only needed columns
- [ ] Pagination implemented
- [ ] N+1 queries eliminated

**Caching:**

- [ ] Second-level cache enabled (if applicable)
- [ ] Expensive computations cached
- [ ] Cache invalidation on updates
- [ ] HTTP caching headers set

**Code:**

- [ ] Lazy loading used appropriately
- [ ] Eager loading for relationships
- [ ] DTOs for large lists
- [ ] Transactions kept short

**Infrastructure:**

- [ ] OPcache enabled (PHP)
- [ ] Database connection pooling
- [ ] Redis/Memcached for cache (production)
- [ ] CDN for static assets

## Profiling Tools

**Symfony Profiler:**

- Built-in, enabled in dev
- Shows queries, time, memory

**Blackfire:**

- Advanced profiling
- Identifies bottlenecks
- Production-safe

**Xdebug:**

- Development profiling
- Detailed call graphs
- Can impact performance

## Best Practices

!!! warning "Premature Optimization"
    Don't optimize until you've measured. Profile first, then optimize bottlenecks.

!!! tip "Cache Strategy"

    - Cache read-heavy data aggressively
    - Invalidate cache on writes
    - Use appropriate TTLs
    - Monitor cache hit rates

!!! note "Database Indexes"
    - Add indexes based on actual query patterns
    - Monitor index usage
    - Remove unused indexes (they slow writes)

## Next Steps

Now that performance is optimized:

1. **Monitor** - Set up performance monitoring
2. **Profile** - Regularly profile in production
3. **Iterate** - Continuously optimize based on metrics

Your application is now performant and scalable!
