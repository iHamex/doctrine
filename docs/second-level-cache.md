# The Second-Level Cache: A Deep Dive

The Second-Level Cache (SLC) is a powerful, application-level cache that sits between your application and the database. Its primary purpose is to reduce database traffic by storing hydrated entity data in a shared cache, making it available across different requests and even different web servers.

Think of it as a key-value store where the key is the entity identifier (`id`) and the value is the entity's data. When you ask the `EntityManager` for an entity that is in the SLC, Doctrine retrieves the data from the cache and bypasses the database entirely.

!!! tip "SLC vs. Query Cache vs. Result Cache"
    - **First-Level Cache (Unit of Work)**: Automatic, managed by the `EntityManager`. Caches entities *within a single transaction*.
    - **Query Cache**: Caches the DQL-to-SQL translation. The database is still hit.
    - **Result Cache**: Caches the *primary keys* of a query result. For each key, Doctrine still needs to load the entity (potentially from the SLC).
    - **Second-Level Cache**: Caches the raw entity data. This is the most effective cache for reducing database reads for frequently accessed entities.

## Step 1: Enabling the Second-Level Cache

To use the SLC, you first need to enable it in your Doctrine configuration and provide a PSR-6 cache implementation. We'll use the `symfony/cache` component, which provides adapters for many backends like Redis or APCu.

First, install the required component:
```bash
composer require symfony/cache
```

Next, enable it in your Doctrine setup (`bootstrap.php`):

```php
// bootstrap.php
<?php
use Doctrine\ORM\EntityManager;
use Doctrine\ORM\ORMSetup;
use Symfony\Component\Cache\Adapter\RedisAdapter;
use Symfony\Component\Cache\Adapter\ArrayAdapter; // For testing/development

// Create a PSR-6 cache instance
$isDevMode = true;
$cache = $isDevMode ? new ArrayAdapter() : new RedisAdapter(RedisAdapter::createConnection('redis://localhost'));

$config = ORMSetup::createAttributeMetadataConfiguration(/*...*/);

// Enable the Second-Level Cache
$config->setSecondLevelCacheEnabled(true);
$cacheConfig = $config->getSecondLevelCacheConfiguration();
$regionsConfig = $cacheConfig->getRegionsConfiguration();

// Configure the default region
$regionsConfig->setLifetime(3600); // Cache entries expire after 1 hour

// Set the cache implementation
$factory = new \Doctrine\ORM\Cache\DefaultCacheFactory($regionsConfig, $cache);
$cacheConfig->setCacheFactory($factory);

$entityManager = new EntityManager($connection, $config);
```

This setup enables the SLC and configures it to use Redis in production and a simple array cache in development.

!!! warning "Cache Drivers and Clearing"
    Be aware that some cache drivers (like Redis) are persistent and will not be cleared on deployment unless you explicitly configure a cache-clearing step. Drivers like `ArrayAdapter` or `ApcuAdapter` are tied to the current process or web server and will be cleared on a server restart.

## Step 2: Marking Entities as Cacheable

Enabling the SLC is not enough; you must explicitly mark which entities should be cached. This is done using the `#[ORM\Cache]` attribute.

You must define a `usage` strategy and optionally a `region`.

```php
#[ORM\Entity]
#[ORM\Cache(usage: 'READ_ONLY', region: 'countries')]
class Country
{
    // ...
}
```

### Cache Usage Strategies

Doctrine provides two main strategies for caching entities:

#### `READ_ONLY` (Best for Immutable Data)
This is the most performant strategy. Use it for data that never changes, such as countries, user roles, or log entries. Doctrine places the entity in the cache when it's first read and never invalidates it.

!!! warning
    If you mark an entity as `READ_ONLY` and then modify it, Doctrine will **throw an exception**. This provides a strong guarantee of immutability. Only use this for truly immutable entities.

#### `READ_WRITE` (Best for Most Entities)
This is the most common strategy. Use it for entities that are read frequently but change occasionally, like `User`, `Product`, or `Article`.

When you update an entity marked as `READ_WRITE`, Doctrine uses a locking mechanism to ensure consistency. It removes the entity from the cache, writes the changes to the database, and then puts the updated entity back into the cache. This ensures that concurrent requests don't read stale data.

#### `NONSTRICT_READ_WRITE` (Advanced)
This strategy is an optimization over `READ_WRITE`. It does not use locking. When an entity is updated, the cache entry is simply invalidated, but not immediately updated. The next time the entity is requested, it will be re-fetched from the database and re-cached.

- **Pro**: More performant for writes, as it avoids locking.
- **Con**: There is a small window of time between the database update and the next cache refresh where a concurrent request could read stale data from the cache.
- **Use Case**: Best for data that is not critically sensitive to being slightly out-of-date for a moment, such as user comments or view counters.

## Step 3: Caching Collections

The SLC can also cache entity associations. This is crucial for avoiding N+1 problems with frequently accessed relationships. To cache a collection, add the `#[ORM\Cache]` attribute to the association property.

```php
#[ORM\Entity]
#[ORM\Cache(usage: 'READ_WRITE')]
class Article
{
    // ...

    #[ORM\OneToMany(targetEntity: Comment::class, mappedBy: 'article')]
    #[ORM\Cache(usage: 'READ_WRITE')] // <-- Cache the collection
    private Collection $comments;
}

#[ORM\Entity]
#[ORM\Cache(usage: 'READ_WRITE')]
class Comment
{
    // ...
}
```

Now, when you load an `Article` and then access its comments, the collection of comment IDs will be stored in the cache. The `Comment` entities themselves are stored separately in their own cache region. The first time you access `$article->getComments()`, Doctrine will:
1.  Check the `Article`'s collection cache region for the list of `Comment` IDs.
2.  If found, it will fetch each `Comment` from the `Comment` entity cache region.
3.  Any comments not found in the entity cache will be fetched from the database.

This process dramatically reduces the number of queries needed to display an entity and its associations.

## Querying and the Cache

By default, DQL queries do not interact with the Second-Level Cache. They always go to the database. You must explicitly tell a query that it's allowed to pull data from the cache.

```php
$query = $entityManager->createQuery('SELECT u FROM App\Entity\User u WHERE u.id = :id');
$query->setParameter('id', 1);

// This tells the query that it's safe to load the User entity from the SLC if it exists.
$query->setCacheable(true);

$user = $query->getSingleResult();
```

The `find()` method, however, is fully integrated with the SLC:
```php
// This will ALWAYS check the SLC first before hitting the database.
$user = $entityManager->find(User::class, 1);
```

## Cache Invalidation: How Doctrine Keeps Data Fresh

For entities marked as `READ_WRITE`, Doctrine handles cache invalidation automatically.
-   When you `persist()` a new entity and `flush()`, it gets added to the cache.
-   When you modify an entity and `flush()`, its cache entry is updated.
-   When you `remove()` an entity and `flush()`, its cache entry is deleted.

### Manual Invalidation

Sometimes you need to clear the cache manually, for example, after a bulk update via DQL or native SQL.

```php
$cache = $entityManager->getCache();

// Evict a single entity
$cache->evictEntity(User::class, 1);

// Evict an entire entity region
$cache->evictEntityRegion(User::class);

// Evict a collection
$cache->evictCollectionRegion(Article::class, 'comments');

// Evict everything (use with caution!)
$cache->evictAll();
```

## Monitoring and Statistics

To understand if your cache is effective, you need to monitor its performance. You can access statistics for each cache region.

```php
$cache = $entityManager->getCache();
$userRegion = $cache->getRegion(User::class);

$stats = $userRegion->getStats();

printf("User Cache Hits: %d\n", $stats->getHitCount());
printf("User Cache Misses: %d\n", $stats->getMissCount());
printf("User Cache Puts: %d\n", $stats->getPutCount());
```
A high hit/miss ratio is a good indicator that your cache is performing well. If you have many misses, it might mean your cache lifetime is too short or you are caching entities that are not frequently accessed.

## Summary
The Second-Level Cache is an essential tool for scaling high-performance Doctrine applications.
- **Enable it** in your configuration with a PSR-6 cache provider.
- **Mark entities** as `READ_ONLY` or `READ_WRITE`.
- **Cache collections** to avoid N+1 issues.
- **Use `setCacheable(true)`** on DQL queries to leverage the cache.
- **Invalidate manually** after bulk operations.
- **Monitor statistics** to ensure your cache is effective.

