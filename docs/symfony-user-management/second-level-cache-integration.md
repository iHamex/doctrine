# Second-Level Cache Integration

Doctrine's Second-Level Cache (2LC) caches entities across HTTP requests, dramatically reducing database queries for frequently accessed data. This is especially useful for read-heavy applications.

## What is Second-Level Cache?

**First-Level Cache (Entity Manager):**

- Caches entities within a single request
- Cleared at end of request
- Automatic, no configuration needed

**Second-Level Cache:**

- Caches entities across multiple requests
- Shared across all Entity Managers
- Requires configuration
- Dramatically reduces database load

**When to use 2LC:**

- Read-heavy applications (many reads, few writes)
- Reference data (categories, settings, etc.)
- Frequently accessed entities
- High-traffic applications

**When NOT to use 2LC:**

- Write-heavy applications (cache invalidation overhead)
- Highly dynamic data (changes frequently)
- Data that must always be fresh

## How Second-Level Cache Works

1. **First query**: Entity loaded from database, stored in cache
2. **Subsequent queries**: Entity loaded from cache (no database query)
3. **Entity updated**: Cache automatically invalidated
4. **Cache expires**: After TTL, entity reloaded from database

## Configuration

### Step 1: Install Cache Component

Symfony Cache is usually already installed, but verify:

```bash
composer require symfony/cache
```

### Step 2: Configure Cache Pools

Update `config/packages/framework.yaml`:

```yaml
framework:
  cache:
    # Default cache pool (used by Symfony)
    app: cache.adapter.filesystem
    
    # Custom pool for Doctrine 2LC
    pools:
      users_cache_pool:
        adapter: cache.adapter.filesystem
        default_lifetime: 3600  # 1 hour
        
      # For production, use Redis or Memcached:
      # users_cache_pool:
      #   adapter: cache.adapter.redis
      #   provider: redis://localhost:6379
```

**Cache adapters:**

- `cache.adapter.filesystem` - File-based (good for development)
- `cache.adapter.redis` - Redis (production, fast, distributed)
- `cache.adapter.memcached` - Memcached (production, fast)
- `cache.adapter.array` - In-memory (testing only)

### Step 3: Configure Doctrine Second-Level Cache

Update `config/packages/doctrine.yaml`:

```yaml
doctrine:
  dbal:
    url: '%env(resolve:DATABASE_URL)%'
  orm:
    auto_generate_proxy_classes: true
    enable_lazy_ghost_objects: true
    
    # Second-Level Cache Configuration
    second_level_cache:
      enabled: true  # Enable 2LC globally
      regions:
        # Region for User entities
        users_region:
          lifetime: 3600  # Cache for 1 hour (in seconds)
          cache_driver: pool(users_cache_pool)  # Use our custom pool
        
        # Default region (used if entity doesn't specify region)
        default_region:
          lifetime: 1800  # 30 minutes
          cache_driver: pool(users_cache_pool)
    
    mappings:
      App:
        is_bundle: false
        type: attribute
        dir: '%kernel.project_dir%/src/Entity'
        prefix: 'App\\Entity'
```

**Explanation:**

- `enabled: true` - Turns on 2LC globally
- `regions` - Different cache regions for different entities
- `lifetime` - How long entities stay cached (TTL)
- `cache_driver: pool(...)` - Which Symfony cache pool to use

## Marking Entities as Cacheable

### Basic Cache Configuration

Update `src/Entity/User.php`:

```php
<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * User Entity with Second-Level Cache
 * 
 * Cache strategy options:
 * - READ_ONLY: Entity never changes (immutable)
 * - NONSTRICT_READ_WRITE: Entity can change, cache invalidated on updates
 * - READ_WRITE: Strict versioning, best for concurrent updates
 */
#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'users')]
#[ORM\Cache('NONSTRICT_READ_WRITE', region: 'users_region')]
class User
{
    // ... existing properties ...
}
```

**Cache strategies:**

**READ_ONLY:**

```php
#[ORM\Cache('READ_ONLY', region: 'users_region')]
```

- Best for: Immutable reference data
- Performance: Fastest (no invalidation overhead)
- Use when: Data never changes after creation

**NONSTRICT_READ_WRITE:**

```php
#[ORM\Cache('NONSTRICT_READ_WRITE', region: 'users_region')]
```

- Best for: Most use cases (balanced)
- Performance: Good (automatic invalidation)
- Use when: Data changes occasionally, eventual consistency OK

**READ_WRITE:**

```php
#[ORM\Cache('READ_WRITE', region: 'users_region')]
```

- Best for: High-concurrency scenarios
- Performance: Slower (version checking)
- Use when: Need strict consistency, many concurrent updates

### Cacheable Associations

You can also cache relationships:

```php
#[ORM\ManyToMany(targetEntity: Group::class)]
#[ORM\JoinTable(name: 'user_groups')]
#[ORM\Cache('NONSTRICT_READ_WRITE')]
private Collection $groups;
```

**Benefits:**

- Related entities cached together
- Reduces N+1 queries
- Faster relationship loading

## Cache Regions Explained

**What are regions?**

- Separate cache namespaces for different entity types
- Different TTLs per region
- Independent invalidation

**Example configuration:**

```yaml
regions:
  users_region:
    lifetime: 3600  # Users cached for 1 hour
  settings_region:
    lifetime: 86400  # Settings cached for 24 hours
  logs_region:
    lifetime: 300    # Logs cached for 5 minutes
```

**Why different regions?**

- Users change occasionally → 1 hour TTL
- Settings change rarely → 24 hour TTL
- Logs change frequently → 5 minute TTL

## Using Second-Level Cache

### Automatic Caching

Once configured, 2LC works automatically:

```php
// First call: Queries database, caches result
$user1 = $repository->find(1);

// Second call: Loads from cache (no database query!)
$user2 = $repository->find(1);

// $user1 and $user2 are the same cached instance
```

### Cache Invalidation

Cache is automatically invalidated when entities are updated:

```php
// Update user
$user = $repository->find(1);
$user->setFirstName('John');
$em->flush();

// Cache automatically invalidated
// Next find(1) will reload from database
```

### Manual Cache Control

You can manually control cache:

```php
use Doctrine\ORM\Cache;

// Evict specific entity from cache
$em->getCache()->evictEntity(User::class, 1);

// Evict all User entities from cache
$em->getCache()->evictEntityRegion(User::class);

// Evict entire region
$em->getCache()->evictRegion('users_region');

// Clear all cache
$em->getCache()->evictAllRegions();
```

## Production Setup with Redis

### Step 1: Install Redis Adapter

```bash
composer require symfony/cache symfony/redis-messenger
```

### Step 2: Configure Redis

Update `config/packages/framework.yaml`:

```yaml
framework:
  cache:
    pools:
      users_cache_pool:
        adapter: cache.adapter.redis
        provider: redis://localhost:6379
        default_lifetime: 3600
```

**Environment variable:**
```bash
# .env
REDIS_URL=redis://localhost:6379

# .env.prod
REDIS_URL=redis://your-redis-server:6379
```

**In framework.yaml:**
```yaml
users_cache_pool:
  adapter: cache.adapter.redis
  provider: '%env(REDIS_URL)%'
```

### Step 3: Verify Redis Connection

```bash
php bin/console cache:pool:list
```

## Monitoring Cache Performance

### Symfony Profiler

The Symfony Profiler shows cache hits/misses:

1. Enable profiler in dev: Already enabled by default
2. Visit a page that loads users
3. Check Doctrine section → See cache statistics

### Logging Cache Operations

Add logging to see cache behavior:

```php
use Psr\Log\LoggerInterface;

class UserRepository extends ServiceEntityRepository
{
    public function __construct(
        ManagerRegistry $registry,
        private LoggerInterface $logger
    ) {
        parent::__construct($registry, User::class);
    }

    public function find($id, $lockMode = null, $lockVersion = null): ?User
    {
        $start = microtime(true);
        $user = parent::find($id, $lockMode, $lockVersion);
        $duration = (microtime(true) - $start) * 1000;
        
        $this->logger->info('User find', [
            'id' => $id,
            'duration_ms' => $duration,
            'cached' => $duration < 1, // Very fast = likely cached
        ]);
        
        return $user;
    }
}
```

## Cache Warming

Pre-populate cache on deployment:

```php
<?php

namespace App\Command;

use App\Repository\UserRepository;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

class WarmCacheCommand extends Command
{
    protected static $defaultName = 'app:cache:warm';

    public function __construct(
        private UserRepository $userRepository
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $output->writeln('Warming user cache...');

        // Load frequently accessed users to populate cache
        $users = $this->userRepository->findActive();
        
        foreach ($users as $user) {
            // Accessing user loads it into cache
            $user->getEmail();
        }

        $output->writeln(sprintf('Cached %d users', count($users)));

        return Command::SUCCESS;
    }
}
```

**Run on deployment:**
```bash
php bin/console app:cache:warm
```

## Best Practices

!!! warning "Cache Invalidation"
    - 2LC automatically invalidates on updates
    - Manual updates (raw SQL) won't invalidate cache
    - Use `evictEntityRegion()` after manual updates

!!! tip "TTL Selection"
    - **Short TTL (5-15 min)**: Frequently changing data
    - **Medium TTL (1-4 hours)**: Occasionally changing data
    - **Long TTL (24+ hours)**: Rarely changing reference data

!!! note "Memory Considerations"
    - Monitor cache size (especially with Redis)
    - Set appropriate TTLs to prevent unbounded growth
    - Use cache eviction policies (LRU, etc.)

## Testing with Cache

```php
<?php

namespace App\Tests\Repository;

use App\Repository\UserRepository;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

class UserRepositoryCacheTest extends KernelTestCase
{
    public function testSecondLevelCache(): void
    {
        $em = self::getContainer()->get('doctrine')->getManager();
        $repository = $em->getRepository(User::class);

        // First query - should hit database
        $user1 = $repository->find(1);
        $this->assertNotNull($user1);

        // Clear first-level cache (Entity Manager cache)
        $em->clear();

        // Second query - should hit second-level cache (not database)
        $user2 = $repository->find(1);
        $this->assertNotNull($user2);
        $this->assertEquals($user1->getId(), $user2->getId());

        // Verify it's the same cached instance
        // (In reality, it's a new instance but loaded from cache)
    }
}
```

## Troubleshooting

**Cache not working:**

1. Verify `enabled: true` in doctrine.yaml
2. Check cache pool configuration
3. Verify entity has `#[ORM\Cache]` attribute
4. Check cache adapter is working: `php bin/console cache:pool:list`

**Stale data:**

1. Check TTL is appropriate
2. Verify cache invalidation on updates
3. Manually evict if needed: `$em->getCache()->evictEntityRegion(User::class)`

**Performance not improved:**

1. Profile queries (Symfony Profiler)
2. Verify cache hits (check profiler)
3. Consider shorter TTL or different strategy

## Next Steps

Now that second-level cache is configured:

1. **Monitor** - Watch cache hit rates in production
2. **Optimize** - Adjust TTLs based on usage patterns
3. **Scale** - Use Redis for distributed caching

Your application now efficiently caches frequently accessed data!
