# Advanced Configuration

Proper configuration is crucial for getting the most out of Doctrine, especially when moving from development to production. This chapter covers the key configuration areas, including caching, logging, and other advanced settings that ensure your application is both performant and maintainable.

This guide assumes you have a basic `bootstrap.php` file as shown in the **[Installation & Setup](installation.md)** chapter. We will be building upon that foundation.

## Development vs. Production Configuration

Your Doctrine setup should differ significantly between development and production environments to balance ease of debugging with performance.

### Development Configuration (`bootstrap.dev.php`)

In development, your priorities are debugging and rapid feedback.

```php
// bootstrap.dev.php
<?php

use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Logging\Middleware;
use Doctrine\ORM\EntityManager;
use Doctrine\ORM\ORMSetup;
use Symfony\Component\Cache\Adapter\ArrayAdapter;
use Psr\Log\LoggerInterface; // Your PSR-3 logger

require_once "vendor/autoload.php";

// 1. Configure Caching (Array Cache for dev)
$cache = new ArrayAdapter();

// 2. Configure Metadata Driver
$config = ORMSetup::createAttributeMetadataConfiguration(
    paths: [__DIR__."/src/Entity"],
    isDevMode: true, // <-- The key setting for development
    proxyDir: __DIR__."/var/proxies",
    cache: $cache
);

// 3. Configure a Logger (optional but recommended)
// Assuming you have a PSR-3 logger instance, like Monolog
$logger = new MyPsr3Logger(); 
$loggingMiddleware = new Middleware($logger);
$config->setMiddlewares([$loggingMiddleware]);

// 4. Configure Database Connection
$connection = DriverManager::getConnection([
    'driver' => 'pdo_mysql',
    'url'    => 'mysql://user:password@127.0.0.1/my_database',
], $config);

// 5. Obtain the EntityManager
$entityManager = new EntityManager($connection, $config);
```

**Key Development Settings:**

-   `isDevMode: true`: This is the most important setting. It tells Doctrine to regenerate proxies on every request and ensures your metadata cache is always up-to-date with your code changes.
-   `cache: new ArrayAdapter()`: We use a simple in-memory array cache. This avoids filesystem I/O but still allows Doctrine's internals to function correctly.
-   **Logging Middleware**: We inject a PSR-3 logger to see every SQL query Doctrine executes. This is invaluable for debugging performance issues or unexpected behavior.

### Production Configuration (`bootstrap.prod.php`)

In production, performance is the top priority.

```php
// bootstrap.prod.php
<?php

use Doctrine\DBAL\DriverManager;
use Doctrine\ORM\EntityManager;
use Doctrine\ORM\ORMSetup;
use Symfony\Component\Cache\Adapter\FilesystemAdapter;

require_once "vendor/autoload.php";

// 1. Configure Caching (Filesystem Cache for prod)
$cache = new FilesystemAdapter(
    namespace: 'doctrine',
    directory: __DIR__ . '/var/cache/'
);

// 2. Configure Metadata Driver
$config = ORMSetup::createAttributeMetadataConfiguration(
    paths: [__DIR__."/src/Entity"],
    isDevMode: false, // <-- Must be false in production
    proxyDir: __DIR__."/var/proxies",
    cache: $cache
);

// 3. Configure Database Connection
$connection = DriverManager::getConnection([
    'driver' => 'pdo_mysql',
    'url'    => getenv('DATABASE_URL'), // <-- Load from environment variables
], $config);

// 4. Obtain the EntityManager
$entityManager = new EntityManager($connection, $config);
```
**Key Production Settings:**
-   `isDevMode: false`: This disables development mode, enabling all performance optimizations.
-   `cache: new FilesystemAdapter(...)`: We use a robust filesystem cache. For even higher performance, you could use `APCuAdapter` or `RedisAdapter`. **Caching is not optional in production.**
-   `getenv('DATABASE_URL')`: Credentials are now loaded securely from environment variables, not hardcoded.

!!! warning "Never Run in Production Without Caching"
    Running Doctrine in production with `isDevMode: true` or without a proper cache implementation will severely degrade your application's performance. Doctrine will have to parse your entity metadata from attributes on every single request.

## Understanding Doctrine's Caches

Doctrine uses several layers of caching. It's important to understand what each one does.

1.  **Metadata Cache (`cache` option in `ORMSetup`)**: This is the most important cache. It stores the parsed mapping information from your entity files (attributes, annotations, etc.). Without this, Doctrine would need to use Reflection on every request to understand your entities.

2.  **Query Cache (`setQueryCache()` on `Configuration`)**: This cache stores the transformation from DQL (Doctrine Query Language) to SQL. A DQL query is parsed into a syntax tree and then converted to SQL. This cache stores the final SQL, saving parsing time for frequently used queries.

    ```php
    // In your bootstrap.php
    $config->setQueryCache($cache); // Use the same PSR-6 cache
    ```

3.  **Result Cache (Second-Level Cache)**: This is an optional, advanced cache that stores the *results* of your queries. It can dramatically improve performance for read-heavy applications but adds complexity by requiring you to manage cache invalidation. This is covered in detail in the **[Second-Level Cache](second-level-cache.md)** chapter.

## Advanced Configuration Options

You can customize Doctrine's behavior further through the `Configuration` object.

### Custom DQL Functions

You can extend Doctrine's query language with your own custom functions (e.g., for database-specific features like MySQL's `YEAR()`).

```php
// In your bootstrap.php
$config->addCustomStringFunction('YEAR', 'App\Doctrine\DQL\YearFunction');
$config->addCustomNumericFunction('RAND', 'App\Doctrine\DQL\RandFunction');
```
See the **[Custom DQL Functions](custom-dql-functions.md)** chapter for a full guide.

### Custom Hydration Modes

When Doctrine fetches data, it "hydrates" it into objects. You can define your own hydration strategies for custom performance tuning or data shapes.

```php
// In your bootstrap.php
$config->addCustomHydrationMode('CustomHydrator', 'App\Doctrine\Hydrator\CustomHydrator');
```
See the **[Custom Hydration](custom-hydration.md)** chapter for more details.

### Event Listeners and Subscribers

Doctrine dispatches events throughout the lifecycle of an entity (e.g., `prePersist`, `postUpdate`). You can hook into these events to execute custom logic.

This is configured on the `EventManager`, not the `Configuration` object itself.

```php
// In your bootstrap.php, before creating the EntityManager
$eventManager = new \Doctrine\Common\EventManager();
$eventManager->addEventSubscriber(new \App\Doctrine\Listener\UserSubscriber());

// Pass it to the EntityManager constructor
$entityManager = new EntityManager($connection, $config, $eventManager);
```
See the **[Events](events.md)** chapter for a comprehensive overview.

## Next Steps

With your configuration fine-tuned, you are now ready to explore the details of how Doctrine maps entity properties to database columns. Proceed to the **[Field and Column Mapping](field-and-column-mapping.md)** chapter.

