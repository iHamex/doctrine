# A Guide to Querying

Doctrine provides a rich and flexible set of tools for fetching entities and data from your database. This guide introduces the three main ways to query your data, explaining the pros and cons of each and providing clear guidance on when to use them.

## The Querying Toolbox: A Quick Comparison

| Method             | Best For                                     | How it Works                                            | Abstraction Level |
| ------------------ | -------------------------------------------- | ------------------------------------------------------- | ----------------- |
| **Repositories**   | Simple, common lookups by ID or criteria.    | Pre-defined methods like `find()` and `findBy()`.         | Highest           |
| **QueryBuilder**   | Dynamic queries with conditional logic.      | A programmatic, fluent PHP API to build a DQL query.    | High              |
| **DQL**            | Complex, static queries with joins/aggregates. | An object-oriented, SQL-like language.                  | Medium            |
| **Native SQL**     | Database-specific features or legacy queries.  | Raw SQL executed directly against the database.       | Lowest            |

---

## 1. Repository Methods: The Simple Approach

For basic `SELECT` queries, your first stop should always be the entity's repository. It provides a clean, simple API for the most common lookup operations.

```php
$userRepository = $entityManager->getRepository(User::class);

// Find a single user by their primary key
$user = $userRepository->find(1);

// Find a single user by a specific email
$user = $userRepository->findOneBy(['email' => 'test@example.com']);

// Find all active users, ordered by their name
$activeUsers = $userRepository->findBy(
    ['status' => 'active'],
    ['name' => 'ASC']
);

// Find all users
$allUsers = $userRepository->findAll();
```

**When to use Repository Methods:**
-   When you need to fetch entities by their primary key.
-   When you need to fetch entities based on simple `AND` conditions.

!!! tip "Custom Repository Classes"
    For any query more complex than `findBy()`, you should create a **[Custom Repository Class](repositories.md)**. This allows you to encapsulate your query logic in reusable methods, keeping your controllers and services clean.

---

## 2. Fetching Known Entities: `find()` vs. `getReference()`

A very common task is associating an existing entity with another without needing to load its data from the database. For example, when setting the author of a new blog post, you often have the author's ID from the request.

**The Inefficient Way:**
```php
// Inefficient: Hits the database to fetch the full User object
$author = $entityManager->find(User::class, $authorId);
$post->setAuthor($author);
```
This is wasteful if you only need a reference to the author.

**The Efficient Way (`getReference()`):**
```php
// Efficient: Does NOT hit the database
$authorReference = $entityManager->getReference(User::class, $authorId);
$post->setAuthor($authorReference);
```
`getReference()` creates a special "proxy" object that represents the author. It has the correct ID, and that's all Doctrine needs to set the `author_id` foreign key when you flush the new post. The proxy will only trigger a database query if you try to access one of its other properties (e.g., `$authorReference->getName()`).

**When to use `getReference()`:**
-   When you need to associate an entity whose ID you already know, without needing to access its other properties.

---

## 3. The QueryBuilder: For Dynamic Queries

The QueryBuilder is a powerful PHP object that allows you to build DQL queries programmatically. It's the ideal choice when you need to construct a query with conditional logic, such as a search form with optional filters.

### Example: Building a Search Query

Imagine a user search with optional filters for status and group.

```php
$qb = $entityManager->createQueryBuilder();
$qb->select('u')
   ->from(User::class, 'u')
   ->where('u.deletedAt IS NULL'); // Always apply this base condition

if (!empty($filters['status'])) {
    $qb->andWhere('u.status = :status')
       ->setParameter('status', $filters['status']);
}

if (!empty($filters['group'])) {
    $qb->andWhere('u.group = :group')
       ->setParameter('group', $filters['group']);
}

$qb->orderBy('u.name', 'ASC');

$query = $qb->getQuery();
$users = $query->getResult();
```

**When to use the QueryBuilder:**
-   When your query has optional `WHERE` clauses.
-   When you need to dynamically add `JOIN`s or `ORDER BY` clauses.
-   It is the most secure and robust way to build queries with dynamic user input.

---

## 4. DQL (Doctrine Query Language): For Complex, Static Queries

DQL is an object-oriented query language that looks very similar to SQL, but it operates on your entity model, not directly on database tables. It's the best tool for complex but relatively static queries.

### Example: Fetching Posts with their Author and Comment Count

```php
$dql = <<<DQL
    SELECT p, a, COUNT(c.id) as commentCount
    FROM App\Entity\Post p
    JOIN p.author a
    LEFT JOIN p.comments c
    WHERE p.category = :category
    GROUP BY p.id
    ORDER BY p.createdAt DESC
DQL;

$query = $entityManager->createQuery($dql);
$query->setParameter('category', $someCategory);

$results = $query->getResult(); 
// $results will be an array of arrays, e.g.:
// [0 => PostObject, 'commentCount' => 5]
```

!!! tip "Understanding Mixed Results"
    When a DQL query selects both a full entity (`p`) and scalar data (`COUNT(c.id)`), Doctrine returns an array where each element is a numerically-indexed array. The 0-index will contain the entity object, and the named keys will contain the scalar values. This is a powerful way to fetch entities and related aggregate data in a single query.

**When to use DQL:**
-   When you need aggregations (`COUNT`, `SUM`, `AVG`).
-   When you have complex `JOIN` conditions.
-   When you want the readability of an SQL-like language for a query that doesn't change based on user input.

!!! warning "DQL is Not SQL"
    Remember to use entity and property names, not table and column names.
    -   `SELECT u FROM App\Entity\User u` (Correct)
    -   `SELECT * FROM users` (Incorrect)

---

## 5. Solving the N+1 Problem with Fetch Joins

The "N+1" problem is one of the most common performance bottlenecks in ORM applications. It happens when you fetch a list of entities and then loop through them, accessing a lazy-loaded association for each one.

**The Problem:**
```php
$posts = $entityManager->getRepository(Post::class)->findAll(); // 1 query

foreach ($posts as $post) {
    // This triggers a new query FOR EACH post to get the author!
    echo $post->getAuthor()->getName(); 
}
// Total queries = 1 (for posts) + N (for each author)
```

**The Solution (Fetch Join):**
A DQL Fetch Join tells Doctrine to load the main entity and the related association in a single query.

```dql
// DQL in your PostRepository
SELECT p, a
FROM App\Entity\Post p
JOIN p.author a
```
The key is to select both the root entity (`p`) and the joined entity (`a`). Now, the initial query will return `Post` objects with their `author` property already fully populated.

```php
$posts = $postRepository->findAllWithAuthors(); // 1 query

foreach ($posts as $post) {
    // No extra query is triggered. The author is already loaded.
    echo $post->getAuthor()->getName();
}
// Total queries = 1
```

---

## Hydration Modes: What Your Query Returns

After executing a query, Doctrine can return the results in several different formats, known as "hydration modes".

-   **`getResult()` (or `HYDRATE_OBJECT`)**: The default. Returns an array of fully managed entity objects. "Managed" means Doctrine is aware of these objects; any changes you make to them will be detected and saved on the next `flush()`. Use this when you intend to modify the data.
-   **`getArrayResult()` (or `HYDRATE_ARRAY`)**: Returns a graph of plain PHP arrays. This is much faster than object hydration because Doctrine doesn't need to create and manage entity objects. It is perfect for read-only data, such as for APIs, complex reports, or templates where you just need to display the data.
-   **`getScalarResult()`**: Returns a "flat" array of scalar values. For a query like `SELECT u.id, u.name FROM User u`, it would return `[['id' => 1, 'name' => 'John'], ...]`. This is useful when you only need a few specific fields and don't need the overhead of the full array graph from `getArrayResult`.
-   **`getSingleScalarResult()`**: Returns a single scalar value from a query, like `COUNT(*)`. Throws an exception if the query returns no result or more than one.
-   **`getOneOrNullResult()`**: Fetches a single entity or `null` if no result is found. Throws an exception if more than one result is found. This is the ideal method for "find one by" queries.

## Next Steps

Now that you have an overview of the querying landscape, you can dive into the specifics of each tool.

-   **[DQL: The Doctrine Query Language](dql.md)**
-   **[The QueryBuilder](query-builder.md)**
-   **[Native Queries](native-queries.md)**
-   **[Repositories](repositories.md)**

