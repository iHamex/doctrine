# DQL: The Doctrine Query Language

DQL is an object-oriented query language that provides a powerful, database-agnostic way to query your entity model. It has a syntax that is intentionally similar to SQL, but instead of operating on tables and columns, it operates on entity classes and their properties.

## DQL vs. SQL: The Core Difference

It's critical to understand that **DQL is not SQL**.

| Feature         | SQL                                      | DQL                                               |
| --------------- | ---------------------------------------- | ------------------------------------------------- |
| **Operates On** | Tables and Columns                       | Entity Classes and Properties                     |
| **Identifiers** | `SELECT * FROM users u`                  | `SELECT u FROM App\Entity\User u`                 |
| **Properties**  | `WHERE u.user_email = ?`                 | `WHERE u.email = :email`                          |
| **Joins**       | `JOIN user_profiles p ON u.id = p.user_id` | `JOIN u.profile p` (navigates the association)    |

The primary benefit of DQL is **portability**. A well-written DQL query will be automatically translated by Doctrine into the correct SQL dialect for MySQL, PostgreSQL, SQL Server, etc.

---

## The Anatomy of a DQL Query

A DQL query is built and executed using the `EntityManager`.

```php
use App\Entity\User;

$dql = 'SELECT u, a FROM App\Entity\User u JOIN u.articles a WHERE u.status = :status ORDER BY u.createdAt DESC';

$query = $entityManager->createQuery($dql);
$query->setParameter('status', 'active');
$query->setMaxResults(10);

$users = $query->getResult(); // Returns an array of User objects
```

### Key Components:
-   **`SELECT` Clause**: You must select an entity alias (like `u`). `SELECT *` is not valid. To fetch multiple entities in one query, select each alias (e.g., `SELECT u, a`).
-   **`FROM` Clause**: You must use the fully qualified class name of the entity. An alias (`u`) is required.
-   **`JOIN` Clause**: You join on the association *property* (`u.articles`), not the entity name. Doctrine infers the join conditions from your mapping.
-   **`WHERE` Clause**: Uses property names (`u.status`).
-   **Parameters**: Always use named (`:status`) or positional (`?1`) parameters to prevent SQL injection.

## `JOIN`s: The Power of DQL

DQL's real power comes from its ability to easily traverse your entity associations.

### `JOIN` (Inner Join)
Use a `JOIN` when you only want results where the association exists.

```dql
// Get all Articles that have a Category
SELECT a FROM App\Entity\Article a JOIN a.category c
```

### `LEFT JOIN`
Use a `LEFT JOIN` when the association is optional, and you want to include results even if the association is `NULL`.

```dql
// Get all Users and their Profiles (if they have one)
SELECT u, p FROM App\Entity\User u LEFT JOIN u.profile p
```

### Conditional Joins (`WITH`)

Sometimes you need to add extra conditions to your join clause, not just the `WHERE` clause. The `WITH` keyword allows this. This is particularly useful for filtering a collection association.

```dql
// Get all Posts, but only join their "published" comments
SELECT p, c 
FROM App\Entity\Post p
LEFT JOIN p.comments c WITH c.status = 'published'
```
This query will return all `Post` objects. The `comments` collection on each post will *only* contain the comments that have the status 'published'.

### The `FETCH` Join: Solving the N+1 Problem
A `FETCH` join is a crucial performance optimization. It tells Doctrine not only to join the related entity in the SQL query but also to fully hydrate and return it as part of the result, preventing lazy-loading queries later.

**Problem (N+1)**:
```dql
$dql = 'SELECT u FROM App\Entity\User u';
$users = $entityManager->createQuery($dql)->getResult();

foreach ($users as $user) {
    // This triggers a new query for EACH user to get their articles
    echo $user->getArticles()->count();
}
```

**Solution (`FETCH JOIN`)**:
```dql
$dql = 'SELECT u, a FROM App\Entity\User u JOIN u.articles a';
// Note: JOIN FETCH is also valid syntax, but is now deprecated.
// Just selecting the joined alias implies a fetch join.
$users = $entityManager->createQuery($dql)->getResult();

foreach ($users as $user) {
    // No extra query is triggered. The articles collection is already loaded.
    echo $user->getArticles()->count();
}
```
!!! tip "Rule of Thumb"
    If you know you are going to need an association in your code after the query, **always use a `FETCH` join**.

## Partial Objects and Scalar Results

You don't always need to fetch full entity objects.

### Selecting Specific Fields
To improve performance for read-only operations, you can select only the fields you need.

```dql
SELECT u.id, u.name FROM App\Entity\User u WHERE u.id = ?1
```
This query, when executed with `$query->getArrayResult()`, returns a simple array (`[['id' => 1, 'name' => 'John']]`), which is much faster than hydrating a full `User` object.

### Aggregate Functions
DQL supports all standard SQL aggregate functions.

```dql
// Get the total number of published articles
SELECT COUNT(a.id) FROM App\Entity\Article a WHERE a.published = true

// Get the average price of all products in a category
SELECT AVG(p.price) FROM App\Entity\Product p WHERE p.category = :category
```
These queries are executed with `$query->getSingleScalarResult()` to return a single value (e.g., `127`).

### `GROUP BY` and `HAVING`
You can group results and filter them based on aggregate values.

```dql
SELECT u.name, COUNT(a.id) as articleCount
FROM App\Entity\User u
JOIN u.articles a
GROUP BY u.id
HAVING articleCount > 10
```
This query finds all users who have published more than 10 articles.

## Bulk Operations: `UPDATE` and `DELETE`

DQL is not just for reading data. You can perform efficient bulk `UPDATE` and `DELETE` operations without loading entities into memory.

### `UPDATE` Statement

```dql
// Give all articles in a category a new title prefix
UPDATE App\Entity\Article a
SET a.title = CONCAT('Legacy: ', a.title)
WHERE a.category = :category
```
This is executed directly on the database and is extremely fast for modifying large numbers of records.

### `DELETE` Statement

```dql
// Delete all spam comments
DELETE FROM App\Entity\Comment c
WHERE c.isSpam = true
```

!!! warning "Bypassing the Unit of Work"
    Bulk operations work directly on the database. The `EntityManager`'s Unit of Work is **not** aware of these changes. Any entities you have already loaded into memory will **not** be updated and will become out of sync. For this reason, you should only use bulk operations in isolated, well-defined contexts (like a command or batch job) and be sure to clear the EntityManager afterwards if necessary (`$entityManager->clear()`).

## Advanced DQL Features

### Subqueries
DQL supports subqueries in `WHERE` and `HAVING` clauses.

```dql
-- Find all products that are more expensive than the average
SELECT p FROM App\Entity\Product p
WHERE p.price > (SELECT AVG(p2.price) FROM App\Entity\Product p2)
```

### Case Expressions
You can use `CASE` expressions for conditional logic within your `SELECT` clause.

```dql
SELECT u.name,
    CASE
        WHEN u.articles_count < 10 THEN 'Beginner'
        WHEN u.articles_count < 50 THEN 'Intermediate'
        ELSE 'Pro'
    END as authorLevel
FROM App\Entity\User u
```

### Functions
DQL supports a wide range of functions that are translated into their database-specific equivalents:
-   **String**: `CONCAT()`, `SUBSTRING()`, `LOWER()`, `UPPER()`, `TRIM()`
-   **Numeric**: `ABS()`, `SQRT()`, `MOD()`
-   **Date/Time**: `CURRENT_DATE()`, `CURRENT_TIME()`, `CURRENT_TIMESTAMP()`
-   **Special**: `INSTANCE OF` (for inheritance hierarchies), `MEMBER OF` (to check if an entity is in a collection)

```dql
-- Find all users that are members of a specific group
SELECT u
FROM App\Entity\User u
WHERE :group MEMBER OF u.groups
```

## Next Steps

While DQL is extremely powerful, building DQL strings programmatically can be cumbersome and error-prone. For dynamic queries, the QueryBuilder is a better choice.

-   **[The QueryBuilder](query-builder.md)**
-   **[Custom DQL Functions](custom-dql-functions.md)**

