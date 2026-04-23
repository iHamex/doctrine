# Testing Doctrine Applications

Effective testing is crucial for building robust and maintainable applications. When working with Doctrine, a layered testing strategy is essential. This involves testing different parts of your application—from individual entity logic to complex repository queries—in isolation.

## The Test Database: Fast and Isolated

The foundation of any good testing strategy is a dedicated test database. It's critical that your tests do **not** run against your development or production databases. The test database should be fast, private to a single test run, and easily reset to a known state.

**The best tool for this is an in-memory SQLite database.**

-   **Speed**: It runs entirely in memory, so it's incredibly fast. There is no network latency or disk I/O.
-   **Isolation**: Each test process gets its own private database. This means you can run your tests in parallel without them interfering with each other.
-   **Simplicity**: It requires zero configuration and is automatically destroyed when the test process finishes.

#### Setting up an In-Memory Database for PHPUnit
You can create a new `EntityManager` instance in your test bootstrap file or a base test case.

```php
// tests/bootstrap.php or a base TestCase class
use Doctrine\DBAL\DriverManager;
use Doctrine\ORM\EntityManager;
use Doctrine\ORM\ORMSetup;
use Doctrine\ORM\Tools\SchemaTool;

// Create a new EntityManager for testing
$config = ORMSetup::createAttributeMetadataConfiguration(/* paths to entities */, isDevMode: true);
$connection = DriverManager::getConnection([
    'driver' => 'pdo_sqlite',
    'memory' => true, // This is the key to an in-memory database
], $config);

$entityManager = new EntityManager($connection, $config);

// Create the database schema
$schemaTool = new SchemaTool($entityManager);
$allMetadata = $entityManager->getMetadataFactory()->getAllMetadata();
$schemaTool->createSchema($allMetadata);
```

!!! warning "Database Feature Parity"
    While SQLite is excellent for most tests, it does not support every feature of databases like PostgreSQL or MySQL (e.g., certain JSON functions, enums). For tests that rely on database-specific features, you may need to use a test database running on the same platform as production (e.g., via Docker).

## Integration Testing: Repositories and Persistence

Integration tests verify that your Doctrine mappings are correct and that your repository queries work as expected. These tests interact with the test database.

A good pattern is to create a base `DatabaseTestCase` that handles creating the schema for each test, ensuring a clean slate.

```php
// tests/DatabaseTestCase.php
<?php
namespace App\Tests;

use Doctrine\ORM\EntityManager;
// ... other use statements
use PHPUnit\Framework\TestCase;

abstract class DatabaseTestCase extends TestCase
{
    protected ?EntityManager $entityManager;

    protected function setUp(): void
    {
        // ... create $this->entityManager as shown above ...
        
        // Re-create the schema for every test to ensure isolation
        $schemaTool = new SchemaTool($this->entityManager);
        $allMetadata = $this->entityManager->getMetadataFactory()->getAllMetadata();
        $schemaTool->createSchema($allMetadata);
    }

    protected function tearDown(): void
    {
        parent::tearDown();
        $this->entityManager->close();
        $this->entityManager = null; // Avoid memory leaks
    }
}
```

#### Example: Testing a Custom Repository Method

Now you can write a test that:
1.  Extends `DatabaseTestCase`.
2.  Persists some test data.
3.  Calls the custom repository method.
4.  Asserts that the correct data was returned.

```php
// tests/Repository/ProductRepositoryTest.php
<?php
namespace App\Tests\Repository;

use App\Entity\Product;
use App\Tests\DatabaseTestCase;

class ProductRepositoryTest extends DatabaseTestCase
{
    public function testFindFeaturedProducts(): void
    {
        // 1. Arrange: Create and persist test data
        $featuredProduct = new Product('Keyboard', '19.99');
        $featuredProduct->setFeatured(true);
        $this->entityManager->persist($featuredProduct);

        $regularProduct = new Product('Mouse', '9.99');
        $this->entityManager->persist($regularProduct);

        $this->entityManager->flush();

        // 2. Act: Call the repository method
        $repository = $this->entityManager->getRepository(Product::class);
        $featured = $repository->findFeaturedProducts();

        // 3. Assert: Check the results
        $this->assertCount(1, $featured);
        $this->assertSame('Keyboard', $featured[0]->getName());
    }
}
```

## Unit Testing: Services and Entities

Unit tests should be fast and test a single unit of logic in isolation, without touching the database.

#### Testing Entities
Entity classes can contain business logic (e.g., `isAvailable()`, `calculateTotal()`). You can test this logic directly without any database connection.

```php
// tests/Entity/OrderTest.php
public function testOrderTotalIsCalculatedCorrectly(): void
{
    $order = new Order();
    $order->addItem(new OrderItem(price: 10.00, quantity: 2)); // 20.00
    $order->addItem(new OrderItem(price: 5.50, quantity: 1));  // 5.50
    
    $this->assertSame(25.50, $order->getTotal());
}
```

#### Testing Services with Mock Repositories
Your service classes often depend on repositories to fetch data. When unit testing a service, you should **mock** the repository. This allows you to control exactly what the repository returns for a given method call, isolating your service's logic from the database.

```php
// tests/Service/ProductServiceTest.php
use App\Repository\ProductRepository;
use App\Service\ProductService;
use PHPUnit\Framework\TestCase;

class ProductServiceTest extends TestCase
{
    public function testApplyingDiscountToFeaturedProducts(): void
    {
        // 1. Arrange: Create a mock ProductRepository
        $mockRepository = $this->createMock(ProductRepository::class);
        
        // Create a fake product to be "returned" by the mock
        $fakeProduct = new Product('Keyboard', '100.00');
        
        // Configure the mock: when findFeaturedProducts() is called,
        // it should return our fake product.
        $mockRepository->expects($this->once())
            ->method('findFeaturedProducts')
            ->willReturn([$fakeProduct]);

        // 2. Act: Create the service with the mock repository and call the method
        $productService = new ProductService($mockRepository);
        $productService->applyDiscountToFeatured(10); // Apply a 10% discount

        // 3. Assert: Check that the service correctly modified the object
        $this->assertSame('90.00', $fakeProduct->getPrice());
    }
}
```
This test verifies the `ProductService`'s discount logic without ever touching a database. It's fast, reliable, and focused.

## Managing Test Data with Fixtures

For more complex integration tests, you'll need a consistent set of test data. **Doctrine Fixtures** is a library that allows you to define sets of data in PHP classes and load them into your test database.

This approach is far superior to using a `.sql` dump file because fixtures can be version-controlled, can create relationships between objects, and can use libraries like Faker to generate realistic-looking data.

By combining these strategies—a fast, in-memory database, isolated integration tests, and focused unit tests with mocks—you can build a comprehensive and reliable test suite for your Doctrine application.

