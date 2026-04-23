# Debugging Doctrine

When working with an abstraction layer like Doctrine, it can sometimes be challenging to understand what's happening under the hood. This guide provides a set of tools and techniques to help you debug your application, from logging raw SQL queries to inspecting the state of your entities.

## SQL Logging: Seeing the Raw Queries

The most fundamental debugging tool is the SQL logger. It allows you to see every single query that Doctrine executes against your database.

!!! warning "Development Only"
    Enabling the SQL logger has a performance overhead and can expose sensitive information. It should **only** be used in a development environment.

#### Logging with Symfony's Web Debug Toolbar
If you are using Symfony, the easiest way to see your queries is with the built-in Web Debug Toolbar. It provides a "Doctrine" panel that shows:
-   A list of all queries executed for the request.
-   The time each query took.
-   Whether the query was executed from the result cache.
-   The parameters passed to the query.
-   A "copyable" version of the query that you can run directly in a database client.

This is the preferred method for debugging queries in a Symfony application.

#### Standalone SQL Logging
In a standalone Doctrine setup, you can configure a logger on the `Connection` object. The simplest logger is the `EchoSQLLogger`, which prints every query directly to the output.

```php
// In your bootstrap.php or setup file
use Doctrine\DBAL\Logging\EchoSQLLogger;

$config = ORMSetup::createAttributeMetadataConfiguration(/*...*/);
$connection = DriverManager::getConnection(/*...*/, $config);

// This will echo every query to the screen
$connection->getConfiguration()->setSQLLogger(new EchoSQLLogger());

$entityManager = new EntityManager($connection, $config);
```

For more control, you can use the `DebugStack` logger, which collects queries in an array that you can inspect later.

```php
use Doctrine\DBAL\Logging\DebugStack;

$debugStack = new DebugStack();
$connection->getConfiguration()->setSQLLogger($debugStack);

// ... execute your application logic ...

// Now you can inspect the queries
print_r($debugStack->queries);
```

## Dumping Variables: `VarDumper` and Proxies

When you use `var_dump()` or `print_r()` on a Doctrine entity, you might see some strange-looking objects. These are **Proxy Objects**.

A proxy is an object that extends your entity class and is used to enable lazy-loading. When you first load an entity, Doctrine might give you a proxy instead. The proxy object has all the same methods as your entity, but its properties are not populated with data. The first time you call a method on the proxy (e.g., `$user->getName()`), it intercepts the call, loads the actual data from the database, and then populates itself.

This can be confusing when debugging. If you use a modern dumping library like Symfony's `VarDumper` (`dump()`), it is smart enough to show you the properties of the underlying entity without triggering the lazy-loading.

```php
$user = $entityManager->find(User::class, 1);

// Using dump() (recommended) will show you the entity's data
// without causing extra database queries.
dump($user);

// Using var_dump() might trigger lazy-loading for all associations,
// potentially causing a cascade of database queries.
var_dump($user);
```

## Inspecting the Unit of Work

The `UnitOfWork` is the heart of the `EntityManager`. It's responsible for tracking the state of all your entities. You can inspect it to understand why Doctrine is or isn't persisting your changes.

```php
$user = $entityManager->find(User::class, 1);
$user->setName('New Name');

$uow = $entityManager->getUnitOfWork();

// Is the entity being tracked?
if ($uow->isScheduledForUpdate($user)) {
    echo "User is scheduled for an update.\n";
}

// What are the exact changes?
// This returns an array of ['old_value', 'new_value'] for each changed field.
$changeSet = $uow->getEntityChangeSet($user);
print_r($changeSet); // ['name' => ['Old Name', 'New Name']]

// What is the entity's state?
$state = $uow->getEntityState($user);
// 1 = STATE_MANAGED, 2 = STATE_NEW, etc.
echo "Entity state: " . $state;
```
This is incredibly useful for debugging situations where a `flush()` doesn't seem to be saving your changes. It helps you answer questions like:
-   Is Doctrine even aware of this entity (`isScheduledFor...`)?
-   Does Doctrine see the changes I made (`getEntityChangeSet`)?
-   Is the entity in the correct state (`getEntityState`)?

## Getting the DQL and SQL from a Query Object

If a query isn't returning the results you expect, you can inspect the `Query` object itself before executing it.

```php
$dql = 'SELECT u, p FROM App\Entity\User u JOIN u.posts p WHERE u.status = :status';
$query = $entityManager->createQuery($dql)
                       ->setParameter('status', 'active');

// Get the DQL string
echo $query->getDQL();

// Get the generated SQL
// This is what will actually be sent to the database
echo $query->getSQL();

// Get the parameters
print_r($query->getParameters());
```
Viewing the final generated SQL is often the key to solving complex query problems. You can copy this SQL and run it directly in a database client to analyze the query plan (`EXPLAIN`) or debug the results.

