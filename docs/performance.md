# Doctrine Performance Tuning

Achieving high performance with Doctrine is not about magic; it's a systematic process of understanding how Doctrine works, identifying bottlenecks, and applying the right optimizations. This guide covers the most critical performance best practices, from query optimization to caching strategies.

## The Golden Rule: Avoid the N+1 Problem

The N+1 query problem is by far the most common performance killer in Doctrine applications. It occurs when your code executes one query to fetch a collection of entities and then executes *N* additional queries inside a loop to fetch related entities for each of the original N entities.

#### Problem: A Classic N+1 Scenario
```php
// Query 1: Fetches all articles
$articles = $entityManager->getRepository(Article::class)->findAll();

// Loop through N articles
foreach ($articles as $article) {
    // Query 2, 3, 4... N+1: A new query is executed FOR EACH article
    // to lazily load its author.
    echo $article->getAuthor()->getName();
}
```
If you have 50 articles, this code will execute **51** database queries. This is incredibly inefficient.

#### Solution: `JOIN FETCH`
The solution is to use a `JOIN FETCH` in your DQL query. This tells Doctrine to fetch the main entity and its related association in a single, powerful query.

```php
$dql = 'SELECT a, u FROM App\Entity\Article a JOIN FETCH a.author u';
$articles = $entityManager->createQuery($dql)->getResult();

// Loop through N articles
foreach ($articles as $article) {
    // NO additional query is executed. The author is already loaded.
    echo $article->getAuthor()->getName();
}
```
This code now executes exactly **1** database query, regardless of the number of articles.

!!! tip "Always Profile Your Queries"
    Use your framework's profiler (like the Symfony profiler) to monitor the number of queries executed per request. It will make N+1 problems immediately obvious.

## Use Projections: Don't Hydrate What You Don't Need

Object hydration is an expensive process. If you are displaying data in a list or an API and do not intend to modify the objects, it is much more performant to fetch the data as plain arrays. This is called a **projection**.

#### Problem: Hydrating Full Objects for a Read-Only View
```php
// Fetches full Article objects, their authors, etc.
$articles = $entityManager->getRepository(Article::class)->findAll();

// In your template/API response:
foreach ($articles as $article) {
    echo $article->getTitle();
    echo $article->getPublishedAt()->format('Y-m-d');
}
```

#### Solution: Use Array Hydration (`getArrayResult`)
```php
$dql = 'SELECT a.id, a.title, a.publishedAt FROM App\Entity\Article a WHERE a.published = true';
$articleData = $entityManager->createQuery($dql)->getArrayResult();

// In your template/API response:
foreach ($articleData as $article) {
    echo $article['title'];
    echo $article['publishedAt']->format('Y-m-d');
}
```
`getArrayResult()` bypasses the entire hydration process, returning a simple PHP array. For large collections, this can result in a significant reduction in memory usage and CPU time.

## Caching: Your Application's Memory

Caching is not an afterthought; it's a fundamental requirement for a high-performance, production-ready application. Doctrine has multiple layers of caching that are essential to understand and configure correctly.

!!! tip "Choosing a Cache Implementation"
    For all cache layers, you need a PSR-6 or PSR-16 cache implementation. `symfony/cache` is a popular choice.
    - **APCu (`ApcuAdapter`)**: Blazing fast in-memory cache for single-server setups. Ideal for metadata and query caching.
    - **Redis/Memcached**: Distributed cache for multi-server setups. Essential for the Result Cache in a scaled environment.
    - **Filesystem (`PhpFilesAdapter`)**: A good fallback for development or environments without APCu, but significantly slower.

#### 1. Metadata Cache (Mandatory for Production)
This cache stores the parsed mapping information from your entity attributes (`#[Column]`, `#[ManyToOne]`, etc.). Without it, Doctrine would have to use slow reflection to re-parse all your entity files on every single request. **Enabling this cache is the single most important performance optimization you can make.**

#### 2. Query Cache
This cache stores the DQL-to-SQL translation result. It's most effective for complex DQL queries that take a non-trivial amount of time for Doctrine to parse. It provides a moderate performance boost.

```php
$query = $entityManager->createQuery($dql);
$query->enableResultCache(3600); // Cache the DQL-to-SQL translation for 1 hour
```

#### 3. Result Cache (Second-Level Cache)
This is the most powerful cache. It stores the actual *results* of your queries. When a cached query is executed again, the results are returned directly from the cache without ever touching the database.

```php
$query = $entityManager->createQuery($dql);
// Cache the final result set for 1 hour. A new cache entry is created
// for each unique combination of parameters.
$query->useResultCache(true, 3600, 'my_cache_id'); 
$users = $query->getResult();
```
The Second-Level Cache is a more advanced topic covered in its own chapter, but it is a critical tool for scaling read-heavy applications.

!!! warning "Cache Invalidation"
    The Result Cache introduces a new challenge: cache invalidation. If the underlying data changes in the database, your cached result will become stale. Doctrine's Second-Level Cache has mechanisms to handle this, but it requires careful configuration of cache regions and an understanding of your data's write patterns.

## Efficient Collection Management (`EXTRA_LAZY`)

When working with very large `OneToMany` or `ManyToMany` collections, even simple operations like `count()` can be expensive if they force Doctrine to load the entire collection from the database into memory.

The `fetch="EXTRA_LAZY"` option optimizes this.

```php
#[ORM\OneToMany(targetEntity: Comment::class, mappedBy: 'article', fetch: 'EXTRA_LAZY')]
private Collection $comments;

// ...
$article = $entityManager->find(Article::class, 1);

// With EXTRA_LAZY, this executes a "SELECT COUNT(*)..." query.
// Without it, it would fetch ALL comment entities.
$commentCount = $article->getComments()->count();
```
Use `EXTRA_LAZY` on any large collection where you anticipate needing to perform `count()`, `contains()`, or `slice()` operations without iterating the entire collection.

## Batch Processing
When creating or updating many entities in a loop, it is inefficient to call `$entityManager->flush()` on every iteration. Each flush is a separate transaction. Instead, batch your operations.

```php
$batchSize = 20;
for ($i = 1; $i <= 10000; ++$i) {
    $user = new User("user" . $i);
    $entityManager->persist($user);
    if (($i % $batchSize) === 0) {
        $entityManager->flush();
        $entityManager->clear(); // Detaches all objects from Doctrine
    }
}
$entityManager->flush(); // Flush the remaining objects
$entityManager->clear();
```
-   **`flush()`**: Persists the batch of 20 new users in a single transaction.
-   **`clear()`**: This is crucial. It tells Doctrine to "forget" about all the objects it's currently managing. This prevents the `EntityManager` from consuming huge amounts of memory when processing thousands of objects.

## Read-Only Entities
If you have entities that are frequently read but never modified through your application (e.g., reference data like countries or statuses), you can mark them as read-only.

```php
#[ORM\Entity(readOnly: true)]
class Country { /* ... */ }
```
This gives Doctrine a hint that it doesn't need to perform change-tracking on these entities, providing a small performance boost. When you fetch read-only entities, they are hydrated, but Doctrine will not check them for updates during a `flush()`.

## Using `getReference()` for Associations
When you need to associate an existing entity whose ID you already know, it is inefficient to load it from the database first. Use `$entityManager->getReference()` instead of `find()`.

- **Inefficient**: `$author = $entityManager->find(User::class, $id); $post->setAuthor($author);` (1 extra query)
- **Efficient**: `$author = $entityManager->getReference(User::class, $id); $post->setAuthor($author);` (0 extra queries)

`getReference()` creates a proxy object for the author without hitting the database, which is all Doctrine needs to set the foreign key during the `flush`.

## Next Steps
For the ultimate level of performance tuning, you can enable Doctrine's Second-Level Cache.
- **[Second-Level Cache](second-level-cache.md)**

