# Mastering Repositories

In Doctrine, a Repository is a specialized class that encapsulates all the logic for querying entities of a specific type. It acts as a collection-like interface to your entities, separating your data access logic from your business logic. This separation is a cornerstone of building clean, maintainable, and testable applications.

## The Repository Pattern: Why It Matters

Imagine your application has several places where you need to find all recently published, approved articles.

**Without a Repository:** You might write the same query logic in multiple services or controllers.

```php
// In your ArticleService...
$query = $entityManager->createQuery(
    'SELECT a FROM App\Entity\Article a WHERE a.status = :status ORDER BY a.publishedAt DESC'
)->setParameter('status', 'approved');
$articles = $query->getResult();

// In your HomepageController...
$query = $entityManager->createQuery(
    'SELECT a FROM App\Entity\Article a WHERE a.status = :status ORDER BY a.publishedAt DESC'
)->setParameter('status', 'approved');
$latestArticles = $query->getResult();
```
This is repetitive and brittle. If the logic for "approved articles" changes, you have to find and update it everywhere.

**With a Repository:** You centralize the query logic in one place.

```php
// In ArticleRepository.php
public function findApprovedAndRecent(): array
{
    return $this->createQueryBuilder('a')
        ->where('a.status = :status')
        ->setParameter('status', 'approved')
        ->orderBy('a.publishedAt', 'DESC')
        ->getQuery()
        ->getResult();
}

// In your ArticleService...
$articles = $entityManager->getRepository(Article::class)->findApprovedAndRecent();

// In your HomepageController...
$latestArticles = $entityManager->getRepository(Article::class)->findApprovedAndRecent();
```
Now, your query logic is defined once. It's reusable, easy to test, and your services/controllers are cleaner and more focused on their primary responsibilities.

## Using the Default Repository

By default, every entity has access to a generic repository, `Doctrine\ORM\EntityRepository`. You can access it via the `EntityManager`.

```php
$repository = $entityManager->getRepository(Product::class);
```

This default repository provides several helpful methods for basic queries:

-   `find($id)`: Finds an entity by its primary key.
-   `findAll()`: Finds all entities of this type.
-   `findBy(array $criteria, ?array $orderBy = null, ?int $limit = null, ?int $offset = null)`: Finds entities by a set of criteria.
-   `findOneBy(array $criteria)`: Finds a single entity by a set of criteria.

```php
// Find by primary key
$product = $repository->find(1);

// Find all products that cost 9.99, ordered by name
$products = $repository->findBy(
    ['price' => '9.99'],
    ['name' => 'ASC']
);

// Find a single active product
$activeProduct = $repository->findOneBy(['status' => 'active']);
```

While useful, these methods are limited. For any query with more complexity, you should create a custom repository.

## Creating and Using Custom Repositories

For most entities, you will want a dedicated repository class to house its specific query logic.

#### Step 1: Create the Repository Class
Create a new class that extends `Doctrine\ORM\EntityRepository`. A common best practice is to also add PHPDoc to your custom methods to provide better type-hinting for your IDE and static analysis tools.

```php
// src/Repository/ProductRepository.php
<?php
namespace App\Repository;

use Doctrine\ORM\EntityRepository;

class ProductRepository extends EntityRepository
{
    /**
     * @return Product[]
     */
    public function findByMinimumPrice(float $price): array
    {
        $qb = $this->createQueryBuilder('p');

        $qb->where($qb->expr()->gte('p.price', ':price'))
           ->setParameter('price', $price)
           ->orderBy('p.price', 'ASC');

        return $qb->getQuery()->getResult();
    }
}
```

#### Step 2: Link It to Your Entity
Use the `repositoryClass` attribute on your entity to tell Doctrine to use your custom class.

```php
// src/Entity/Product.php
<?php
namespace App\Entity;

use App\Repository\ProductRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ProductRepository::class)]
class Product
{
    // ...
}
```
That's it! Now, when you call `$entityManager->getRepository(Product::class)`, Doctrine will return an instance of your `ProductRepository`, giving you access to both the default `find*` methods and any custom methods you add.

### Adding Custom Query Methods

The most common way to build queries in a repository is with the **QueryBuilder**. The repository provides a helper method `$this->createQueryBuilder('p')` which gives you a QueryBuilder instance pre-configured to query for the repository's entity (`p` is the alias for `Product`).

#### Basic Example: Find by Minimum Price
```php
// In ProductRepository.php
public function findByMinimumPrice(float $price): array
{
    $qb = $this->createQueryBuilder('p');

    $qb->where($qb->expr()->gte('p.price', ':price'))
       ->setParameter('price', $price)
       ->orderBy('p.price', 'ASC');

    return $qb->getQuery()->getResult();
}
```

#### Advanced Example: Dynamic Search with JOINs
This method dynamically builds a query to search for products, optionally filtering by category and joining the `Category` entity to avoid extra queries.

```php
// In ProductRepository.php
use App\Entity\Category;

public function search(string $term, ?Category $category = null): array
{
    $qb = $this->createQueryBuilder('p')
        ->addSelect('c') // Select the category as well
        ->leftJoin('p.category', 'c');

    $qb->where(
        $qb->expr()->like('p.name', ':term')
    )->setParameter('term', '%' . $term . '%');

    if ($category !== null) {
        $qb->andWhere('p.category = :category')
           ->setParameter('category', $category);
    }

    return $qb->getQuery()->getResult();
}
```

### Projections: Returning Non-Entity Data
Sometimes you don't need the full entity object. You might just need a few fields for a report or an API response. Querying for partial data or arrays (a "projection") is much more efficient as it bypasses the expensive hydration process.

```php
// In ProductRepository.php
public function findProductNames(): array
{
    $qb = $this->createQueryBuilder('p')
        ->select('p.id', 'p.name'); // Select only the fields you need

    // Returns an array of arrays, e.g., [['id' => 1, 'name' => 'Keyboard'], ...]
    return $qb->getQuery()->getArrayResult();
}
```

### Paginating Results
A common requirement is to paginate results. You can easily add `limit` and `offset` to any QueryBuilder query.

```php
// In ProductRepository.php
public function findPage(int $page = 1, int $pageSize = 20): array
{
    $qb = $this->createQueryBuilder('p')
        ->orderBy('p.createdAt', 'DESC')
        ->setFirstResult(($page - 1) * $pageSize)
        ->setMaxResults($pageSize);

    return $qb->getQuery()->getResult();
}
```

For more robust pagination that includes the total result count, Doctrine provides a dedicated `Paginator` tool.

```php
use Doctrine\ORM\Tools\Pagination\Paginator;

// In ProductRepository.php
public function findPageWithPaginator(int $page = 1, int $pageSize = 20): Paginator
{
    $qb = $this->createQueryBuilder('p')
        ->orderBy('p.createdAt', 'DESC')
        ->setFirstResult(($page - 1) * $pageSize)
        ->setMaxResults($pageSize);

    return new Paginator($qb->getQuery());
}

// --- Usage in your controller ---
$paginator = $productRepository->findPageWithPaginator(2);

$totalProducts = count($paginator); // Executes a COUNT query
$productsOnPage = iterator_to_array($paginator); // Executes the query with LIMIT/OFFSET
```
The `Paginator` is smart: it runs a clean `COUNT` query for the total and then a separate query with `LIMIT` and `OFFSET` for the data, which is more efficient than many other pagination techniques.

### Using DQL
While the QueryBuilder is great for dynamic queries, sometimes a complex, static query is more readable as a DQL string. You can use `$this->getEntityManager()->createQuery()` to do this.

```php
// In UserRepository.php
public function findAdmins(): array
{
    $dql = 'SELECT u FROM App\Entity\User u WHERE u.roles LIKE :role';
    
    return $this->getEntityManager()->createQuery($dql)
                ->setParameter('role', '%"ROLE_ADMIN"%')
                ->getResult();
}
```

!!! tip "Framework Integration"
    Modern PHP frameworks like Symfony often provide base repository classes (e.g., `ServiceEntityRepository`) that integrate with their dependency injection container. This makes your repositories available as services automatically. While the core concepts are identical, consult your framework's documentation for the preferred setup.

