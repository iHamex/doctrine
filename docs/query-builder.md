# The QueryBuilder

The QueryBuilder is a powerful API for programmatically creating DQL queries in a fluent, object-oriented way. It is the best tool for building dynamic queries, such as those that depend on user input from a search form, because it allows you to conditionally add parts to the query.

Under the hood, the QueryBuilder is a factory for a DQL query string. Every method you call modifies the eventual DQL that will be generated.

## Creating a QueryBuilder Instance

There are two ways to get a `QueryBuilder` instance:

1.  **From the `EntityManager`**: This is for creating queries from scratch.
    ```php
    $qb = $entityManager->createQueryBuilder();
    ```

2.  **From a `Repository`**: This is a convenient shortcut that automatically includes the `select` and `from` parts of the query for the entity the repository manages.
    ```php
    // Inside a UserRepository class
    public function findActiveUsers() {
        // Automatically starts with "SELECT u FROM App\Entity\User u"
        return $this->createQueryBuilder('u')
            ->andWhere('u.isActive = :active')
            ->setParameter('active', true)
            ->getQuery()
            ->getResult();
    }
    ```

## A Complete Example: Dynamic Product Filtering

The primary use case for the QueryBuilder is building queries with conditional logic. Let's build a product search query that allows filtering by category, minimum price, and a search term.

```php
function findProducts(array $filters): array
{
    $qb = $entityManager->createQueryBuilder();

    $qb->select('p')
       ->from(Product::class, 'p')
       ->where('p.isAvailable = true'); // Base condition

    if (!empty($filters['category'])) {
        $qb->andWhere('p.category = :category')
           ->setParameter('category', $filters['category']);
    }

    if (!empty($filters['minPrice'])) {
        $qb->andWhere('p.price >= :minPrice')
           ->setParameter('minPrice', $filters['minPrice']);
    }

    if (!empty($filters['searchTerm'])) {
        $qb->andWhere($qb->expr()->orX(
            $qb->expr()->like('p.name', ':searchTerm'),
            $qb->expr()->like('p.description', ':searchTerm')
        ))
        ->setParameter('searchTerm', '%' . $filters['searchTerm'] . '%');
    }

    $qb->orderBy('p.createdAt', 'DESC')
       ->setMaxResults(30);

    return $qb->getQuery()->getResult();
}
```

This example demonstrates the power of the QueryBuilder. Each `if` block conditionally adds an `andWhere()` clause to the query, and the parameters are safely bound.

## The Expression API: `andWhere()` vs. `orWhere()`

When building `WHERE` clauses, you have several methods available.

-   `where()`: Sets the first condition, overwriting any previous `where` calls.
-   `andWhere()`: Appends a new condition with `AND`.
-   `orWhere()`: Appends a new condition with `OR`.

For more complex logic, such as `(condition1 AND condition2) OR condition3`, you must use the **Expression API**.

### Complex Expressions

```php
$qb = $this->createQueryBuilder('u');

// WHERE (u.status = 'active' AND u.logins > 100) OR u.isVip = true
$qb->where($qb->expr()->orX(
    $qb->expr()->andX(
        $qb->expr()->eq('u.status', ':status'),
        $qb->expr()->gt('u.logins', ':logins')
    ),
    $qb->expr()->eq('u.isVip', ':isVip')
))
->setParameters([
    'status' => 'active',
    'logins' => 100,
    'isVip' => true,
]);
```

The Expression API (`$qb->expr()`) provides a rich set of methods (`eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `like`, `in`, `isNull`, etc.) that allow you to build any logical combination you need.

## Working with `JOIN`s

You can join associations using the `join()`, `innerJoin()`, or `leftJoin()` methods.

-   `join('u.articles', 'a')`: Standard inner join.
-   `innerJoin('u.articles', 'a')`: Alias for `join()`.
-   `leftJoin('u.articles', 'a')`: `LEFT JOIN`.

### Fetch Joins in the QueryBuilder

To create a **fetch join** (the equivalent of `JOIN FETCH` in DQL), you must add the joined entity to the `select()` clause.

```php
// Inefficient (N+1)
$qb->select('u')
   ->from(User::class, 'u')
   ->leftJoin('u.articles', 'a');
   // This only joins the tables but doesn't hydrate the articles

// EFFICIENT (Fetch Join)
$qb->select('u', 'a') // <-- Also select the 'a' alias
   ->from(User::class, 'u')
   ->leftJoin('u.articles', 'a');
   // Now the articles collection will be fully loaded
```

### `WITH` Clause
You can add extra conditions to a `JOIN` using the `WITH` keyword. The condition can be a simple string or a complex expression object.

```php
// Join only with published articles
$qb->select('u', 'a')
   ->from(User::class, 'u')
   ->leftJoin('u.articles', 'a', 'WITH', 'a.published = true');
   
// Using an expression for the WITH clause
$qb->leftJoin(
    'u.articles', 
    'a', 
    'WITH', 
    $qb->expr()->andX(
        $qb->expr()->eq('a.published', ':isPublished'),
        $qb->expr()->isNull('a.deletedAt')
    )
)->setParameter('isPublished', true);
```

## Update and Delete Queries

While less common, you can also use the QueryBuilder to construct `UPDATE` and `DELETE` queries.

!!! warning "Bypassing the Unit of Work"
    `UPDATE` and `DELETE` queries operate directly on the database. They **do not** trigger any lifecycle callbacks on your entities and will not update any entities already loaded into memory. Use them with caution for batch operations.

```php
// Deactivate all users who haven't logged in for a year
$qb = $entityManager->createQueryBuilder();
$qb->update(User::class, 'u')
   ->set('u.status', ':newStatus')
   ->where('u.lastLogin < :oneYearAgo')
   ->setParameters([
       'newStatus' => 'inactive',
       'oneYearAgo' => new \DateTime('-1 year'),
   ])
   ->getQuery()
   ->execute(); // <-- Use execute() for write queries
```

The `delete()` method works similarly:
```php
$qb = $entityManager->createQueryBuilder();
$qb->delete(Comment::class, 'c')
   ->where('c.isSpam = true')
   ->getQuery()
   ->execute();
```

## Getting the DQL

At any point, you can see the DQL string that the QueryBuilder has constructed. This is incredibly useful for debugging.

```php
$dql = $qb->getDQL();
// "SELECT u FROM App\Entity\User u WHERE u.isActive = :active"

$sql = $qb->getQuery()->getSQL();
// "SELECT u0_.id AS id_0, ... FROM users u0_ WHERE u0_.is_active = ?"
```
You can even get the final, compiled SQL that will be sent to the database, which is excellent for performance tuning and understanding what Doctrine is doing under the hood.

## Next Steps

For situations where the QueryBuilder or DQL are not a good fit, Doctrine allows you to drop down to raw SQL.

-   **[Native Queries](native-queries.md)**

