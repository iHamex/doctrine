# Doctrine API: A Practical Reference

This guide provides a quick reference to the most commonly used methods in Doctrine's key classes. It is intended as a quick lookup resource, not a replacement for the individual documentation chapters.

## `EntityManager`

The central access point for all entity-related operations.

| Method | Description | Example |
| --- | --- | --- |
| `persist(object $entity): void` | Marks a new entity for insertion. The entity's data will be saved to the database on the next `flush()`. | `_**$em**_->persist($newUser);` |
| `flush(): void` | Writes all pending changes (new entities, updates, removals) to the database within a single transaction. | `_**$em**_->flush();` |
| `find(string $className, mixed $id): ?object` | Finds an entity by its primary key. Returns `null` if not found. Always hits the database if not already in the identity map. | `$user = _**$em**_->find(User::class, 1);` |
| `getReference(string $className, mixed $id): object` | Gets a reference (proxy) to an entity. Avoids a database query if the entity is not already loaded. Useful for setting associations. | `$post->setAuthor(_**$em**_->getReference(User::class, 1));` |
| `remove(object $entity): void` | Marks a managed entity for deletion. The `DELETE` statement will be executed on the next `flush()`. | `_**$em**_->remove($user);` |
| `merge(object $entity): object` | Merges the state of a detached entity into a new managed instance, which is then returned. | `$managedUser = _**$em**_->merge($detachedUser);` |
| `detach(object $entity): void` | Removes an entity from the `EntityManager`'s tracking. Changes to it will no longer be saved. | `_**$em**_->detach($user);` |
| `clear(?string $className = null): void` | Clears the `EntityManager`'s identity map. All entities become detached. Can optionally clear only entities of a certain class. | `_**$em**_->clear();` |
| `getRepository(string $className): EntityRepository` | Gets the repository object for an entity class, which contains query methods. | `$userRepo = _**$em**_->getRepository(User::class);` |
| `createQuery(string $dql = ''): Query` | Creates a `Query` object from a DQL string. | `$query = _**$em**_->createQuery('SELECT u FROM User u');` |
| `createQueryBuilder(): QueryBuilder` | Creates a `QueryBuilder` instance, which provides a fluent API for creating DQL queries. | `$qb = _**$em**_->createQueryBuilder();` |
| `getConnection(): Connection` | Gets the underlying DBAL `Connection` object for direct database access or transaction control. | `$connection = _**$em**_->getConnection();` |

---

## `EntityRepository`

Provides methods for querying entities. You typically extend this class to create your own custom repositories.

| Method | Description | Example |
| --- | --- | --- |
| `find(mixed $id): ?object` | Finds an entity by its primary key. | `$user = $userRepo->find(1);` |
| `findAll(): array` | Finds all entities of this type. **Warning**: can be slow on large tables. | `$allUsers = $userRepo->findAll();` |
| `findBy(array $criteria, ?array $orderBy, ?int $limit, ?int $offset): array` | Finds entities matching a set of criteria. | `$admins = $userRepo->findBy(['role' => 'admin']);` |
| `findOneBy(array $criteria): ?object` | Finds a single entity matching a set of criteria. | `$admin = $userRepo->findOneBy(['role' => 'admin']);` |
| `createQueryBuilder(string $alias): QueryBuilder` | Creates a `QueryBuilder` instance pre-configured to query for this repository's entity. | `$qb = $userRepo->createQueryBuilder('u');` |

---

## `QueryBuilder`

A fluent, object-oriented API for programmatically creating DQL queries.

| Method | Description | Example |
| --- | --- | --- |
| `select(string ...$selects): self` | Sets the SELECT part of the query. Can be called with multiple arguments. | `$qb->select('u.id', 'u.name');` |
| `from(string $from, string $alias): self` | Sets the FROM part of the query. | `$qb->from(User::class, 'u');` |
| `where(mixed $predicates): self` | Sets the WHERE clause. Overwrites any previous `where`. | `$qb->where('u.id = :user_id');` |
| `andWhere(mixed $predicates): self` | Adds another condition to the WHERE clause with AND. | `$qb->andWhere('u.status = :status');` |
| `orWhere(mixed $predicates): self` | Adds another condition to the WHERE clause with OR. | `$qb->orWhere('u.role = :role');` |
| `setParameter(string $key, mixed $value): self` | Sets a single named parameter. | `$qb->setParameter('status', 'active');` |
| `setParameters(array $params): self` | Sets multiple parameters from an array. | `$qb->setParameters(['status'=>'active', 'role'=>'admin']);` |
| `join(string $join, string $alias, ?string $conditionType, ?string $condition): self` | Creates an INNER JOIN. | `$qb->join('u.posts', 'p');` |
| `leftJoin(string $join, string $alias, ?string $conditionType, ?string $condition): self` | Creates a LEFT JOIN. | `$qb->leftJoin('u.posts', 'p', 'WITH', 'p.isPublished = true');` |
| `orderBy(string $sort, string $order): self` | Sets the ORDER BY clause. Overwrites any previous `orderBy`. | `$qb->orderBy('u.createdAt', 'DESC');` |
| `addOrderBy(string $sort, string $order): self` | Adds another field to the ORDER BY clause. | `$qb->addOrderBy('u.name', 'ASC');` |
| `setMaxResults(int $maxResults): self` | Sets the maximum number of results to return (LIMIT). | `$qb->setMaxResults(10);` |
| `setFirstResult(int $firstResult): self` | Sets the offset from which to start returning results (OFFSET). | `$qb->setFirstResult(20);` |
| `getQuery(): Query` | Creates the `Query` object from the current QueryBuilder state. This is the final step before execution. | `$query = $qb->getQuery();` |

---

## `Query`

Represents a DQL or native SQL query and is the object responsible for executing it.

| Method | Description | Example |
| --- | --- | --- |
| `getResult(?int $hydrationMode): array` | Executes the query and returns an array of results. The default hydration mode returns entity objects. | `$users = $query->getResult();` |
| `getArrayResult(): array` | Executes the query and returns a simple array of arrays (a "projection"). Bypasses the expensive object hydration process. | `$data = $query->getArrayResult();` |
| `getSingleResult(): object` | Executes the query and returns a single entity object. Throws an exception if no result or more than one result is found. | `$user = $query->getSingleResult();` |
| `getOneOrNullResult(): ?object` | Executes the query and returns a single entity object or `null` if no result is found. Throws an exception if more than one result is found. | `$user = $query->getOneOrNullResult();` |
| `getSingleScalarResult(): mixed` | Executes the query and returns the single value from the first column of the first row. Throws an exception if there is not exactly one row. | `$count = $query->getSingleScalarResult();` |
| `getSQL(): string` | Gets the SQL that will be executed for this query. Incredibly useful for debugging. | `dump($query->getSQL());` |
| `setParameter(string $key, mixed $value): self` | Sets a single parameter on the query object. | `$query->setParameter('status', 'active');` |

