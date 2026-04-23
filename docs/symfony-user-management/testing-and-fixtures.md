# Testing & Fixtures

Testing ensures your code works correctly and prevents regressions. Fixtures provide consistent test data. This guide covers unit tests, functional tests, and data fixtures for the User Management system.

## Why Test?

**Benefits:**

- **Confidence**: Know your code works
- **Documentation**: Tests show how code should be used
- **Refactoring**: Safe to change code with tests
- **Regression prevention**: Catch bugs before deployment
- **Design feedback**: Hard-to-test code often needs refactoring

## Testing Setup

### Install Testing Dependencies

```bash
composer require --dev phpunit/phpunit symfony/test-pack
```

This installs:
- PHPUnit (testing framework)
- Symfony Test Pack (testing utilities)

### Test Database Configuration

Create `.env.test`:

```dotenv
# Test environment uses separate database
DATABASE_URL="postgresql://app:app@127.0.0.1:5432/usermgmt_test?serverVersion=16&charset=utf8"
APP_ENV=test
```

**Why separate test database?**

- Tests can modify data without affecting development
- Can reset database before each test
- Isolated test environment

## Data Fixtures

Fixtures provide consistent test data for development and testing.

### Install Fixtures Bundle

```bash
composer require --dev orm-fixtures
```

### Create User Fixtures

Create `src/DataFixtures/UserFixtures.php`:

```php
<?php

namespace App\DataFixtures;

use App\Entity\User;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * UserFixtures
 * 
 * Creates sample users for development and testing.
 * Run with: php bin/console doctrine:fixtures:load
 */
class UserFixtures extends Fixture
{
    public function __construct(
        private UserPasswordHasherInterface $hasher
    ) {}

    public function load(ObjectManager $manager): void
    {
        // Create admin user
        $admin = new User();
        $admin->setEmail('admin@example.com');
        $admin->setFirstName('Admin');
        $admin->setLastName('User');
        $admin->setPassword($this->hasher->hashPassword($admin, 'admin123'));
        $admin->setRoles(['ROLE_ADMIN']);
        $admin->setIsActive(true);
        $manager->persist($admin);
        $this->addReference('user-admin', $admin); // Reference for other fixtures

        // Create regular users
        foreach (range(1, 10) as $i) {
            $user = new User();
            $user->setEmail("user{$i}@example.com");
            $user->setFirstName('User');
            $user->setLastName((string)$i);
            $user->setPassword($this->hasher->hashPassword($user, 'user123'));
            $user->setRoles([]); // ROLE_USER is automatic
            $user->setIsActive($i <= 8); // First 8 active, last 2 inactive
            $manager->persist($user);
            $this->addReference("user-{$i}", $user);
        }

        $manager->flush();
    }
}
```

**Explanation:**

- `Fixture` - Base class for fixtures
- `load()` - Called when fixtures are loaded
- `addReference()` - Store reference for use in other fixtures
- `persist()` - Queue entity for insertion
- `flush()` - Execute all inserts

### Load Fixtures

```bash
# Load fixtures (drops and recreates database)
php bin/console doctrine:fixtures:load -n

# Load specific fixture group
php bin/console doctrine:fixtures:load --group=users -n

# Append fixtures (don't drop database)
php bin/console doctrine:fixtures:load --append -n
```

**Flags:**

- `-n` - No interaction (auto-confirm)
- `--append` - Don't drop database first
- `--group=name` - Load specific fixture group

### Fixture Groups

Organize fixtures into groups:

```php
class UserFixtures extends Fixture
{
    public static function getGroups(): array
    {
        return ['users', 'essential'];
    }

    public function load(ObjectManager $manager): void
    {
        // ... fixture code ...
    }
}
```

**Load specific groups:**
```bash
php bin/console doctrine:fixtures:load --group=essential -n
```

### Using References Between Fixtures

```php
class GroupFixtures extends Fixture
{
    public function load(ObjectManager $manager): void
    {
        // Get user reference from UserFixtures
        $admin = $this->getReference('user-admin');
        
        $group = new Group();
        $group->setName('Administrators');
        $group->addUser($admin);
        $manager->persist($group);
        
        $manager->flush();
    }
    
    public function getDependencies(): array
    {
        return [UserFixtures::class]; // Load UserFixtures first
    }
}
```

## Unit Tests

Test individual classes in isolation.

### Test User Entity

Create `tests/Entity/UserTest.php`:

```php
<?php

namespace App\Tests\Entity;

use App\Entity\User;
use PHPUnit\Framework\TestCase;

class UserTest extends TestCase
{
    public function testUserCreation(): void
    {
        $user = new User();
        $user->setEmail('test@example.com');
        $user->setFirstName('John');
        $user->setLastName('Doe');
        $user->setPassword('hashed_password');

        $this->assertEquals('test@example.com', $user->getEmail());
        $this->assertEquals('John', $user->getFirstName());
        $this->assertEquals('Doe', $user->getLastName());
        $this->assertTrue($user->isActive()); // Default is active
    }

    public function testEmailNormalization(): void
    {
        $user = new User();
        $user->setEmail('Test@Example.COM');

        // Email should be normalized to lowercase
        $this->assertEquals('test@example.com', $user->getEmail());
    }

    public function testRoles(): void
    {
        $user = new User();
        $user->setRoles(['ROLE_ADMIN']);

        $roles = $user->getRoles();
        
        // Should include ROLE_USER automatically
        $this->assertContains('ROLE_USER', $roles);
        $this->assertContains('ROLE_ADMIN', $roles);
        $this->assertCount(2, $roles);
    }

    public function testSoftDelete(): void
    {
        $user = new User();
        $this->assertFalse($user->isDeleted());

        $user->softDelete();
        $this->assertTrue($user->isDeleted());
        $this->assertNotNull($user->getDeletedAt());

        $user->restore();
        $this->assertFalse($user->isDeleted());
        $this->assertNull($user->getDeletedAt());
    }

    public function testTouchUpdatesTimestamp(): void
    {
        $user = new User();
        $originalUpdatedAt = $user->getUpdatedAt();

        // Simulate time passing
        sleep(1);
        $user->touch();

        $this->assertNotEquals($originalUpdatedAt, $user->getUpdatedAt());
    }
}
```

### Test Repository

Create `tests/Repository/UserRepositoryTest.php`:

```php
<?php

namespace App\Tests\Repository;

use App\Entity\User;
use App\Repository\UserRepository;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

class UserRepositoryTest extends KernelTestCase
{
    private UserRepository $repository;

    protected function setUp(): void
    {
        $kernel = self::bootKernel();
        $this->repository = $kernel->getContainer()
            ->get('doctrine')
            ->getRepository(User::class);
    }

    public function testFindOneByEmail(): void
    {
        // Create test user
        $user = new User();
        $user->setEmail('findme@example.com');
        $user->setPassword('hashed');
        $user->setFirstName('Test');
        $user->setLastName('User');

        $em = $this->repository->getEntityManager();
        $em->persist($user);
        $em->flush();

        // Test find
        $found = $this->repository->findOneByEmail('findme@example.com');
        
        $this->assertNotNull($found);
        $this->assertEquals('findme@example.com', $found->getEmail());

        // Cleanup
        $em->remove($found);
        $em->flush();
    }

    public function testSearchWithFilters(): void
    {
        // Create test users
        $activeUser = new User();
        $activeUser->setEmail('active@example.com');
        $activeUser->setPassword('hashed');
        $activeUser->setIsActive(true);

        $inactiveUser = new User();
        $inactiveUser->setEmail('inactive@example.com');
        $inactiveUser->setPassword('hashed');
        $inactiveUser->setIsActive(false);

        $em = $this->repository->getEntityManager();
        $em->persist($activeUser);
        $em->persist($inactiveUser);
        $em->flush();

        // Test filter
        $filter = new \App\Model\UserFilter();
        $filter->active = true;

        $result = $this->repository->search($filter);
        
        $this->assertGreaterThan(0, $result['total']);
        foreach ($result['items'] as $user) {
            $this->assertTrue($user->isActive());
        }

        // Cleanup
        $em->remove($activeUser);
        $em->remove($inactiveUser);
        $em->flush();
    }
}
```

## Functional Tests

Test entire HTTP requests and responses.

### Test User Controller

Create `tests/Controller/UserControllerTest.php`:

```php
<?php

namespace App\Tests\Controller;

use App\Entity\User;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

class UserControllerTest extends WebTestCase
{
    /**
     * Test user list page loads
     */
    public function testIndexPageLoads(): void
    {
        $client = static::createClient();
        
        // Login as admin (see authenticated tests below)
        $this->loginAsAdmin($client);
        
        $crawler = $client->request('GET', '/users');

        $this->assertResponseIsSuccessful();
        $this->assertSelectorExists('h1:contains("Users")');
        $this->assertSelectorExists('table');
    }

    /**
     * Test creating a new user
     */
    public function testCreateUser(): void
    {
        $client = static::createClient();
        $this->loginAsAdmin($client);

        $crawler = $client->request('GET', '/users/new');

        // Fill form
        $form = $crawler->selectButton('Save')->form([
            'user[email]' => 'newuser@example.com',
            'user[firstName]' => 'New',
            'user[lastName]' => 'User',
            'user[plainPassword]' => 'password123',
            'user[isActive]' => true,
        ]);

        $client->submit($form);

        // Should redirect to user list
        $this->assertResponseRedirects('/users');
        
        // Follow redirect
        $client->followRedirect();
        $this->assertSelectorTextContains('.flash-messages', 'created successfully');
    }

    /**
     * Test viewing user details
     */
    public function testShowUser(): void
    {
        $client = static::createClient();
        $this->loginAsAdmin($client);

        // Get a user from database
        $user = $this->getTestUser();
        
        $crawler = $client->request('GET', '/users/' . $user->getId());

        $this->assertResponseIsSuccessful();
        $this->assertSelectorTextContains('h1', $user->getEmail());
    }

    /**
     * Test deleting a user
     */
    public function testDeleteUser(): void
    {
        $client = static::createClient();
        $this->loginAsAdmin($client);

        // Create a user to delete
        $user = $this->createTestUser();
        $userId = $user->getId();

        // Delete via form
        $crawler = $client->request('GET', '/users/' . $userId);
        $form = $crawler->selectButton('Delete')->form();
        
        $client->submit($form);

        $this->assertResponseRedirects('/users');
        
        // Verify user is deleted (soft delete)
        $em = self::getContainer()->get('doctrine')->getManager();
        $em->getFilters()->disable('not_deleted');
        $deletedUser = $em->getRepository(User::class)->find($userId);
        $this->assertTrue($deletedUser->isDeleted());
    }

    /**
     * Helper: Login as admin user
     */
    private function loginAsAdmin($client): void
    {
        $em = self::getContainer()->get('doctrine')->getManager();
        $userRepository = $em->getRepository(User::class);
        
        // Find or create admin user
        $admin = $userRepository->findOneByEmail('admin@example.com');
        
        if (!$admin) {
            $admin = new User();
            $admin->setEmail('admin@example.com');
            $admin->setPassword('$2y$13$...'); // Hashed password
            $admin->setRoles(['ROLE_ADMIN']);
            $em->persist($admin);
            $em->flush();
        }

        $client->loginUser($admin);
    }

    /**
     * Helper: Get test user
     */
    private function getTestUser(): User
    {
        $em = self::getContainer()->get('doctrine')->getManager();
        $user = $em->getRepository(User::class)->findOneBy([]);
        
        if (!$user) {
            $user = $this->createTestUser();
        }
        
        return $user;
    }

    /**
     * Helper: Create test user
     */
    private function createTestUser(): User
    {
        $em = self::getContainer()->get('doctrine')->getManager();
        $hasher = self::getContainer()->get('security.user_password_hasher');
        
        $user = new User();
        $user->setEmail('test' . uniqid() . '@example.com');
        $user->setFirstName('Test');
        $user->setLastName('User');
        $user->setPassword($hasher->hashPassword($user, 'password123'));
        
        $em->persist($user);
        $em->flush();
        
        return $user;
    }
}
```

## Testing with Database Transactions

Use transactions to isolate tests:

```php
use Doctrine\ORM\EntityManagerInterface;

class UserControllerTest extends WebTestCase
{
    private EntityManagerInterface $em;

    protected function setUp(): void
    {
        parent::setUp();
        $this->em = self::getContainer()->get('doctrine')->getManager();
        $this->em->beginTransaction();
    }

    protected function tearDown(): void
    {
        if ($this->em->getConnection()->isTransactionActive()) {
            $this->em->rollback();
        }
        parent::tearDown();
    }

    public function testSomething(): void
    {
        // Test code here
        // Changes are automatically rolled back after test
    }
}
```

**Benefits:**
- Each test starts with clean database
- No manual cleanup needed
- Faster than recreating database

## Testing Forms

Create `tests/Form/UserTypeTest.php`:

```php
<?php

namespace App\Tests\Form;

use App\Entity\User;
use App\Form\UserType;
use Symfony\Component\Form\Test\TypeTestCase;

class UserTypeTest extends TypeTestCase
{
    public function testSubmitValidData(): void
    {
        $formData = [
            'email' => 'test@example.com',
            'firstName' => 'John',
            'lastName' => 'Doe',
            'isActive' => true,
            'plainPassword' => 'password123',
        ];

        $user = new User();
        $form = $this->factory->create(UserType::class, $user);

        $form->submit($formData);

        $this->assertTrue($form->isSynchronized());
        $this->assertEquals('test@example.com', $user->getEmail());
        $this->assertEquals('John', $user->getFirstName());
        $this->assertEquals('Doe', $user->getLastName());
    }

    public function testValidationErrors(): void
    {
        $formData = [
            'email' => 'invalid-email', // Invalid email
            'firstName' => '', // Required field empty
        ];

        $user = new User();
        $form = $this->factory->create(UserType::class, $user, [
            'validation_groups' => ['Default', 'create'],
        ]);

        $form->submit($formData);

        $this->assertFalse($form->isValid());
        $this->assertGreaterThan(0, count($form->getErrors(true)));
    }
}
```

## Running Tests

```bash
# Run all tests
php bin/phpunit

# Run specific test file
php bin/phpunit tests/Controller/UserControllerTest.php

# Run specific test method
php bin/phpunit --filter testCreateUser

# With coverage report
php bin/phpunit --coverage-html coverage/

# Verbose output
php bin/phpunit --testdox
```

## Best Practices

!!! tip "Test Organization"
    - One test class per class being tested
    - Test methods should be descriptive: `testUserCreation()`
    - Use `setUp()` for common initialization
    - Use `tearDown()` for cleanup

!!! warning "Test Isolation"
    - Each test should be independent
    - Don't rely on test execution order
    - Use transactions or fixtures for data setup

!!! note "Test Coverage"
    - Aim for high coverage of critical paths
    - Don't obsess over 100% coverage
    - Focus on business logic, not getters/setters

## Next Steps

Now that you have testing set up:

1. **Write tests** - Add tests for new features
2. **CI/CD** - Run tests automatically on commits
3. **Coverage** - Monitor test coverage

Your application is now thoroughly tested!
