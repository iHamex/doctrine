# Installation & Setup

Installing Doctrine is the first step, but setting it up correctly is the key to a smooth development experience. This guide covers the entire process, from installation with Composer to configuring the `EntityManager` and verifying your setup.

## Prerequisites

Before you begin, ensure your development environment meets the following requirements:

- **PHP 8.1 or higher** (8.2+ is recommended).
- **Composer** for managing dependencies.
- The **PDO extension** enabled in your `php.ini`.
- The specific **PDO driver** for your chosen database (e.g., `pdo_mysql`, `pdo_pgsql`).

Doctrine supports the following database systems:

- MySQL 8.0+ or MariaDB 10.4+
- PostgreSQL 10+
- SQLite 3.8.8+
- Oracle and SQL Server (via community-supported DBAL drivers)

## Step 1: Installation with Composer

The recommended way to install Doctrine is with Composer. In your project's root directory, run the following command:

```bash
composer require doctrine/orm
```

This command installs `doctrine/orm` and its main dependency, `doctrine/dbal`. It also sets up the Composer autoloader in the `vendor/` directory, which is essential for Doctrine to work.

!!! tip "Development Tools"
    For a complete development setup, you should also install the migrations and fixtures libraries, along with a tool for loading environment variables:
    ```bash
    composer require --dev doctrine/migrations doctrine/fixtures symfony/dotenv
    ```
    - `doctrine/migrations`: Manages your database schema incrementally.
    - `doctrine/fixtures`: Helps you load sample data for testing and development.
    - `symfony/dotenv`: A component to load environment variables from a `.env` file into `$_ENV`.

!!! warning "Consider `symfony/runtime`"
    For modern applications, especially those intended to run in various environments (like local dev, Docker, and serverless), consider using `symfony/runtime`. This component decouples your application from global state (`$_ENV`, `$_SERVER`), leading to a more robust and predictable setup. It also integrates seamlessly with `symfony/dotenv`.

## Step 2: Choosing a Metadata Driver

Before setting up the `EntityManager`, you need to decide how you will provide the mapping information that tells Doctrine how your entities relate to the database. Doctrine offers several ways to do this:

- **Attributes (Recommended)**: PHP 8 attributes allow you to define mapping directly in your entity classes. This is the modern, recommended approach as it keeps the mapping information colocated with the code it describes, improving maintainability and IDE support.
  ```php
  #[Entity]
  class User { /* ... */ }
  ```

- **XML**: For teams that prefer to keep mapping separate from the code, XML files provide a robust, schema-validated way to define mappings. This can be useful in projects where non-developers might need to inspect the mappings.

- **YAML**: A more concise alternative to XML, though less common in new projects.

!!! note "This Guide Uses Attributes"
    All examples in this documentation will use PHP attributes. While other drivers are fully supported, attributes offer the best balance of readability and convenience for most projects.

!!! tip "Mixing and Matching Drivers"
    It is possible to use multiple metadata drivers in the same project. You can configure Doctrine to read from different directories for different drivers. This can be useful when migrating a legacy project from XML or YAML to attributes, allowing you to transition your entities incrementally.
    ```php
    // Example of configuring multiple drivers
    $config->setMetadataDriverImpl(new \Doctrine\ORM\Mapping\Driver\AttributeDriver(['path/to/attributes']));
    $xmlDriver = new \Doctrine\ORM\Mapping\Driver\XmlDriver(['path/to/xml']);
    $config->setMetadataDriverImpl($xmlDriver, 'App\Legacy\Entity');
    ```

## Step 3: Setting Up the EntityManager

The `EntityManager` is the heart of Doctrine. It's the object you'll use to fetch, persist, and delete entities. Its setup is the most critical part of the installation process.

There are two main ways to set up Doctrine: **standalone** or with a **framework**.

### Standalone Doctrine Setup

If you're using Doctrine in a project without a major framework, you'll need to configure the `EntityManager` manually. This is typically done in a central bootstrap file.

**1. Create a Project Structure**

First, organize your project files. A good starting point is:

```
your-project/
├── .env                # Your database credentials
├── composer.json
├── bootstrap.php       # Your Doctrine setup and EntityManager will go here
├── src/
│   └── Entity/         # Your entity classes will live here
└── vendor/
```

**2. Create a `.env` File**

Create a `.env` file in your project root to store your database credentials securely. Never commit this file to version control.

```dotenv
# .env
DATABASE_URL="mysql://root:password@127.0.0.1:3306/my_database?serverVersion=8.0&charset=utf8mb4"
```

**3. Create the `bootstrap.php` File**

This file will be the single source of truth for your `EntityManager` configuration.

```php
// bootstrap.php
<?php

use Doctrine\DBAL\DriverManager;
use Doctrine\ORM\EntityManager;
use Doctrine\ORM\ORMSetup;
use Symfony\Component\Dotenv\Dotenv;

require_once "vendor/autoload.php";

// Load environment variables from .env file
$dotenv = new Dotenv();
$dotenv->load(__DIR__.'/.env');

// Create a simple "default" Doctrine ORM configuration for Attributes
$config = ORMSetup::createAttributeMetadataConfiguration(
    paths: [__DIR__."/src/Entity"],
    isDevMode: true,
);

// Configure the database connection parameters from the .env file
$connection = DriverManager::getConnection([
    'url' => $_ENV['DATABASE_URL'],
], $config);

// Obtain the entity manager
$entityManager = new EntityManager($connection, $config);
```

Let's break down this configuration:

- `(new Dotenv())->load()`: This loads the `DATABASE_URL` from your `.env` file into `$_ENV`.
- `ORMSetup::createAttributeMetadataConfiguration()`: This is the recommended way to configure Doctrine. We're telling it to look for entity mapping information in PHP attributes inside the `src/Entity` directory.
- `isDevMode: true`: This enables development mode. In this mode, Doctrine's cache is cleared on every request, which is great for development but must be disabled in production. In dev mode, Doctrine also performs more runtime checks, which can help you catch mapping errors early.
- `DriverManager::getConnection()`: This creates the database connection using the credentials you provide.
- `new EntityManager()`: Finally, we instantiate the `EntityManager`, which is now ready to use.

### Production Configuration

For a production environment, you must disable `devMode` and configure a cache. This will significantly improve performance by caching metadata and query results.

```php
// bootstrap.php (modified for production)
<?php

use Doctrine\ORM\Configuration;
use Symfony\Component\Cache\Adapter\ApcuAdapter;
use Symfony\Component\Cache\Adapter\PhpFilesAdapter;

// ... (same as above)

$isDevMode = $_ENV['APP_ENV'] === 'dev'; // Assuming you have an APP_ENV variable

$config = ORMSetup::createAttributeMetadataConfiguration(
    paths: [__DIR__."/src/Entity"],
    isDevMode: $isDevMode,
);

if (!$isDevMode) {
    $config->setMetadataCache(new ApcuAdapter('doctrine_metadata'));
    $config->setQueryCache(new ApcuAdapter('doctrine_query'));
    $config->setResultCache(new ApcuAdapter('doctrine_result'));
}

// For file-based caching in environments where APCu is not available
// $config->setMetadataCache(new PhpFilesAdapter('doctrine_metadata'));

// You can also use a PSR-6 cache pool for more advanced caching strategies
// $pool = new FilesystemAdapter('doctrine', 0, 'path/to/cache');
// $config->setMetadataCache($pool);
// $config->setQueryCache($pool);

$connection = DriverManager::getConnection(/* ... */);
$entityManager = new EntityManager($connection, $config);
```

!!! warning "Choose the Right Cache"
    `APCu` is extremely fast and recommended for single-server setups. For multi-server environments, a distributed cache like `Redis` or `Memcached` is a better choice. The `PhpFilesAdapter` is a fallback but is significantly slower.

### Framework Integration (Symfony, Laminas, etc.)

If you are using a modern framework, **do not** set up the `EntityManager` manually. Frameworks provide official integration packages that handle all the configuration for you, including environment-specific setups.

- **Symfony**: The `doctrine/doctrine-bundle` is the official integration. It's typically installed by default in the `symfony/website-skeleton`. See the [Symfony Doctrine Documentation](https://symfony.com/doc/current/doctrine.html).
- **Laminas**: The `laminas-doctrine-orm` package provides the integration.
- **Laravel**: While Eloquent is the default ORM, you can use Doctrine via the third-party `laravel-doctrine/orm` package.

!!! tip "The Power of Frameworks"
    Framework integrations go beyond just configuration. They often provide:
    - **Dependency Injection**: The `EntityManager` is automatically available as a service in your application's container.
    - **Lifecycle Integration**: The `EntityManager` is managed within the request/response lifecycle, with connections opened and closed automatically.
    - **Enhanced Tooling**: Additional CLI commands, profiler integration for debugging queries, and form integration are common features.
    - **Security**: They help manage database credentials securely and provide protection against common vulnerabilities.

Using these packages is the recommended approach, as they are tailored to the framework's lifecycle and conventions.

## Step 4: Verifying the Setup with the CLI

Doctrine comes with a powerful command-line interface (CLI) that helps you with tasks like schema management and debugging. To use it, you need one more file.

**1. Create `cli-config.php`**

In your project root, create a file named `cli-config.php`:

```php
// cli-config.php
<?php

use Doctrine\ORM\Tools\Console\ConsoleRunner;
use Doctrine\ORM\Tools\Console\EntityManagerProvider\SingleManagerProvider;

// Replace this with the path to your bootstrap.php
require 'bootstrap.php';

ConsoleRunner::run(
    new SingleManagerProvider($entityManager)
);
```

This file tells the Doctrine CLI how to find your configured `EntityManager`.

**2. Run the Verification Command**

Now, you can verify your entire setup from the command line:

```bash
vendor/bin/doctrine orm:schema-tool:validate
```

If everything is configured correctly, you should see a success message:

```
[OK] The mapping files are correct.
[OK] The database schema is in sync with the mapping files.
```

!!! warning "`orm:validate-schema` is Deprecated"
    You may see older tutorials using the `orm:validate-schema` command. This command is deprecated and has been replaced by `orm:schema-tool:validate`, which provides more accurate results.

If you see any `[FAIL]` messages, Doctrine will provide detailed errors explaining what's wrong (e.g., incorrect credentials, mapping errors in an entity). This command is your best friend when debugging setup issues.

!!! tip "Common Validation Errors"
    - **"The database schema is not in sync..."**: This is the most common message. It means your entity mapping definitions do not match the current state of the database. You'll fix this using Doctrine Migrations.
    - **"The mapping files are not correct..."**: This indicates a problem in your entity's mapping attributes, such as an invalid type or a missing required option. The error message will usually point you to the exact entity and property.
    - **Connection Errors**: If the command fails to run at all, double-check your `DATABASE_URL` in the `.env` file and ensure your database server is running and accessible.

## Next Steps

With Doctrine installed and your `EntityManager` configured, you are ready to start defining and working with entities. Proceed to the **[Entity Basics](entity-basics.md)** chapter to create your first entity.

