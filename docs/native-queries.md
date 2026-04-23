# Native Queries and SQL

While DQL and the QueryBuilder should be your primary tools, Doctrine provides a powerful escape hatch to run raw SQL when you need it. This is essential for leveraging database-specific features, optimizing complex queries, or integrating with legacy schemas.

## When to Use Native SQL

You should only resort to native SQL in specific situations:
-   **Database-Specific Features**: To use features not supported by DQL, such as window functions, common table expressions (CTEs), `CONNECT BY` (Oracle), or vendor-specific query hints.
-   **Maximum Performance**: For a critical, high-performance query where you need to hand-tune the exact SQL to ensure the database's query planner uses the optimal execution path.
-   **Legacy Systems**: When working with complex, pre-existing stored procedures or views.

!!! warning "Trade-offs of Native SQL"
    When you use native SQL, you lose Doctrine's database abstraction. Your query will be tied to a specific database vendor (e.g., MySQL, PostgreSQL) and may not be portable.

## `ResultSetMapping`: The Key to Hydration

The power of Doctrine's native query support comes from the `ResultSetMapping` object. It's a configurable object that tells Doctrine how to transform the raw, tabular result set from your SQL query into the objects or arrays you want.

Without a `ResultSetMapping`, you will just get back raw data arrays.

### A Complete Example: Mapping to Entities

Let's fetch all active `User` entities and their related `Address` using a native SQL query.

**1. Build the `ResultSetMapping`**

You must explicitly tell Doctrine which columns map to which entity properties.

```php
use Doctrine\ORM\Query\ResultSetMapping;

$rsm = new ResultSetMapping();

// Map the User entity
$rsm->addEntityResult(User::class, 'u');
$rsm->addFieldResult('u', 'id', 'id');
$rsm->addFieldResult('u', 'name', 'name');
$rsm->addFieldResult('u', 'status', 'status');

// Map the related Address entity
$rsm->addJoinedEntityResult(Address::class, 'a', 'u', 'address');
$rsm->addFieldResult('a', 'address_id', 'id');
$rsm->addFieldResult('a', 'street', 'street');
$rsm->addFieldResult('a', 'city', 'city');
```
-   `addEntityResult(User::class, 'u')`: Defines the primary entity and its alias 'u'.
-   `addFieldResult('u', 'id', 'id')`: Maps the `id` column from the SQL result to the `id` property of the `User` entity.
-   `addJoinedEntityResult(...)`: Defines a joined entity, `Address` with alias `a`, which is located on the `address` property of the parent entity (`u`).
-   `addFieldResult('a', 'address_id', 'id')`: It's crucial to map the foreign key from the SQL result to the primary key property of the joined entity.

!!! tip "`addRootEntity` and `addFetchEntity`"
    As a shorter syntax, you can use `addRootEntity` and `addFetchEntity`. This is useful if your SQL column names already match your entity property names.
    ```php
    $rsm->addRootEntityFromClassMetadata(User::class, 'u');
    $rsm->addJoinedEntityFromClassMetadata(Address::class, 'a', 'u', 'address');
    ```
    This approach is less flexible, as it requires the column names to match exactly what Doctrine expects, but it can be more concise for simple queries.

**2. Write and Execute the SQL**

```php
$sql = <<<SQL
    SELECT u.id, u.name, u.status, a.id as address_id, a.street, a.city
    FROM users u
    LEFT JOIN addresses a ON u.address_id = a.id
    WHERE u.status = :status
SQL;

$query = $entityManager->createNativeQuery($sql, $rsm);
$query->setParameter('status', 'active');

$users = $query->getResult(); // Returns an array of fully hydrated User objects
```
The result is a collection of `User` objects, and accessing `$user->getAddress()` will return a fully loaded `Address` object with no extra queries, because we fetched and mapped it in the original native query.

### Mapping to Scalar Values
You can also use native queries for reporting and aggregation, mapping the results to scalar values instead of entities.

```php
$rsm = new ResultSetMapping();
$rsm->addScalarResult('month', 'month');
$rsm->addScalarResult('total_sales', 'totalSales', 'float');

$sql = 'SELECT MONTH(o.order_date) as month, SUM(o.total) as total_sales FROM orders o GROUP BY month';

$query = $entityManager->createNativeQuery($sql, $rsm);
$salesReport = $query->getArrayResult();
// $salesReport will be an array like:
// [['month' => 10, 'totalSales' => 5493.50], ...]
```
-   `addScalarResult('month', 'month')`: Maps the `month` column from the SQL to a `month` key in the result array.
-   `addScalarResult('total_sales', 'totalSales', 'float')`: The third argument allows you to specify a type for Doctrine to cast the value to.

### Automatic Mapping with `ResultSetMappingBuilder`

For complex entities, building the `ResultSetMapping` manually can be verbose. The `ResultSetMappingBuilder` is a utility that can automatically create the mapping for an entity and its relations.

```php
use Doctrine\ORM\Query\ResultSetMappingBuilder;

$rsm = new ResultSetMappingBuilder($entityManager);
$rsm->addRootEntityFromClassMetadata(User::class, 'u');
$rsm->addJoinedEntityFromClassMetadata(Address::class, 'a', 'u', 'address');

$sql = "SELECT " . $rsm->generateSelectClause() . " FROM users u LEFT JOIN addresses a ON u.address_id = a.id WHERE u.status = :status";
// The generated SELECT clause will be something like:
// "SELECT u.id AS u__id, u.name AS u__name, a.id AS a__id, ..."

$query = $entityManager->createNativeQuery($sql, $rsm);
// ...
```
This is a powerful feature for ensuring your native queries stay in sync with your entity mappings, but it gives you less control over the exact `SELECT` clause.

## Direct Connection Usage
For simple queries that don't require hydration, or for executing `UPDATE`, `DELETE`, or `INSERT` statements, you can bypass the `EntityManager` and use the DBAL connection directly.

!!! warning "Bypassing the Unit of Work"
    Like with the QueryBuilder's `UPDATE`/`DELETE`, these methods operate directly on the database. They will not trigger lifecycle events or update any entities already in memory.

```php
$connection = $entityManager->getConnection();

// Fetching Data
$sql = 'SELECT COUNT(*) as user_count FROM users WHERE status = :status';
$params = ['status' => 'active'];
$result = $connection->fetchOne($sql, $params); // Returns a single value

$sql = 'SELECT * FROM users WHERE id = :id';
$userArray = $connection->fetchAssociative($sql, ['id' => 1]); // Fetches one row

$sql = 'SELECT id, name FROM users WHERE status = :status';
$usersArray = $connection->fetchAllAssociative($sql, ['status' => 'active']); // Fetches all rows

// Writing Data
$sql = 'UPDATE users SET status = :newStatus WHERE last_login < :cutoff';
$connection->executeStatement($sql, [
    'newStatus' => 'archived',
    'cutoff' => '2022-01-01'
]);
```
The DBAL connection provides a simple, safe, and portable API for basic SQL operations. It automatically uses prepared statements to prevent SQL injection.

## Next Steps
For situations where you need to create your own custom hydration logic, Doctrine provides a powerful, low-level API.
- **[Custom Hydration](custom-hydration.md)**

