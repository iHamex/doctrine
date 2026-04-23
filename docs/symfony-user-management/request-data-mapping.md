# Request Data Mapping (Modern Input Handling)

Bind query parameters and request payloads to typed objects using Symfony's value resolvers. This modern approach improves type safety, provides sensible defaults, and makes validation clearer. Instead of manually reading from `Request` objects, Symfony automatically maps request data to typed DTOs (Data Transfer Objects).

## Why Use Request Data Mapping?

**Traditional approach (manual):**
```php
public function index(Request $request): Response
{
    $q = $request->query->get('q', '');
    $active = $request->query->getBoolean('active');
    $sort = $request->query->get('sort', 'createdAt');
    // ... more manual extraction
}
```

**Problems:**
- No type safety
- Defaults scattered throughout code
- Hard to test
- Verbose and error-prone

**Modern approach (Request Data Mapping):**
```php
public function index(#[MapQueryString] UserFilter $filter): Response
{
    // $filter is already typed and populated with defaults
}
```

**Benefits:**
- Type safety (IDE autocomplete, static analysis)
- Centralized defaults
- Easy to test (just pass a UserFilter)
- Clean, readable code

## Create the UserFilter DTO

Create `src/Model/UserFilter.php`:

```php
<?php

namespace App\Model;

use Symfony\Component\Validator\Constraints as Assert;

/**
 * UserFilter DTO
 * 
 * This class represents all possible filter criteria for searching users.
 * Symfony's MapQueryString attribute automatically populates this from query
 * parameters, applying defaults for missing values.
 */
class UserFilter
{
    /**
     * Search query - searches in email, first name, and last name
     * 
     * Example: ?q=john
     * Will search for "john" in user emails and names.
     */
    #[Assert\Length(max: 255, maxMessage: 'Search query cannot exceed 255 characters.')]
    public ?string $q = null;

    /**
     * Filter by active status
     * 
     * Example: ?active=1 (only active users)
     * Example: ?active=0 (only inactive users)
     * Example: (no parameter) - all users
     */
    public ?bool $active = null;

    /**
     * Sort field - which column to sort by
     * 
     * Allowed values: 'createdAt', 'email', 'lastName'
     * Default: 'createdAt'
     * 
     * Example: ?sort=email
     */
    #[Assert\Choice(choices: ['createdAt', 'email', 'lastName'], message: 'Invalid sort field.')]
    public string $sort = 'createdAt';

    /**
     * Sort direction
     * 
     * Allowed values: 'asc', 'desc'
     * Default: 'desc' (newest first)
     * 
     * Example: ?dir=asc
     */
    #[Assert\Choice(choices: ['asc', 'desc'], message: 'Sort direction must be asc or desc.')]
    public string $dir = 'desc';

    /**
     * Current page number (for pagination)
     * 
     * Default: 1 (first page)
     * Example: ?page=2
     */
    #[Assert\Positive(message: 'Page number must be positive.')]
    public int $page = 1;

    /**
     * Items per page (for pagination)
     * 
     * Default: 20
     * Maximum recommended: 100
     * Example: ?perPage=50
     */
    #[Assert\Range(min: 1, max: 100, notInRangeMessage: 'Items per page must be between 1 and 100.')]
    public int $perPage = 20;
}
```

**Explanation:**

- **Public properties**: Symfony can directly populate these from query parameters
- **Type hints**: Provide type safety (`?string`, `?bool`, `int`, etc.)
- **Default values**: Set directly on properties (e.g., `= 'createdAt'`, `= 1`)
- **Validation constraints**: Optional but recommended for security and data integrity

## Use MapQueryString in Controller

In your controller, use the `#[MapQueryString]` attribute:

```php
<?php

namespace App\Controller;

use App\Model\UserFilter;
use App\Repository\UserRepository;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapQueryString;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/users')]
class UserController extends AbstractController
{
    #[Route('', name: 'user_index', methods: ['GET'])]
    public function index(
        #[MapQueryString] UserFilter $filter,
        UserRepository $users
    ): Response {
        // $filter is automatically populated from query string
        // Example: ?q=john&active=1&sort=email&dir=asc&page=2&perPage=50
        // Results in a UserFilter with all values set
        
        // Missing parameters use defaults:
        // ?q=john -> $filter->q = 'john', $filter->sort = 'createdAt' (default)
        
        $result = $users->search($filter);

        return $this->render('user/index.html.twig', [
            'items' => $result['items'],
            'total' => $result['total'],
            'page' => $filter->page,
            'perPage' => $filter->perPage,
            'criteria' => [
                'q' => $filter->q,
                'active' => $filter->active,
                'sort' => $filter->sort,
                'dir' => $filter->dir,
            ],
        ]);
    }
}
```

**How it works:**

1. User visits `/users?q=john&active=1&page=2`
2. Symfony sees `#[MapQueryString] UserFilter $filter`
3. Symfony creates a new `UserFilter` instance
4. Symfony maps query parameters to properties:

   - `q=john` → `$filter->q = 'john'`

   - `active=1` → `$filter->active = true`

   - `page=2` → `$filter->page = 2`

   - Missing parameters use defaults: `$filter->sort = 'createdAt'`, `$filter->dir = 'desc'`, etc.
5. Your controller receives a fully-populated, typed `UserFilter` object

**Benefits:**

- No manual `$request->query->get()` calls
- Type safety (IDE knows `$filter->page` is an `int`)
- Defaults handled automatically
- Easy to test (just create a `UserFilter` in tests)

## Map JSON Payloads (for APIs)

For API endpoints that accept JSON, use `#[MapRequestPayload]`:

```php
<?php

namespace App\Model;

use Symfony\Component\Validator\Constraints as Assert;

/**
 * CreateUserDto - DTO for creating users via API
 * 
 * Used with #[MapRequestPayload] to automatically deserialize JSON request
 * bodies into a typed object.
 */
class CreateUserDto
{
    #[Assert\NotBlank(message: 'Email is required.')]
    #[Assert\Email(message: 'Please provide a valid email address.')]
    public string $email;

    #[Assert\NotBlank(message: 'First name is required.')]
    #[Assert\Length(max: 80, maxMessage: 'First name cannot exceed 80 characters.')]
    public string $firstName;

    #[Assert\NotBlank(message: 'Last name is required.')]
    #[Assert\Length(max: 80, maxMessage: 'Last name cannot exceed 80 characters.')]
    public string $lastName;

    #[Assert\NotBlank(message: 'Password is required.')]
    #[Assert\Length(min: 8, minMessage: 'Password must be at least 8 characters.')]
    public string $plainPassword;
}
```

**In your API controller:**

```php
<?php

namespace App\Controller\Api;

use App\Model\CreateUserDto;
use App\Service\UserManager;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Attribute\MapRequestPayload;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/users')]
class UserApiController extends AbstractController
{
    public function __construct(private UserManager $userManager) {}

    #[Route('', name: 'api_user_create', methods: ['POST'])]
    public function create(
        #[MapRequestPayload] CreateUserDto $input
    ): JsonResponse {
        // $input is automatically populated from JSON request body
        // Example POST /api/users with body:
        // {
        //   "email": "user@example.com",
        //   "firstName": "John",
        //   "lastName": "Doe",
        //   "plainPassword": "secret123"
        // }
        
        // Transform DTO to entity
        $user = new User();
        $user->setEmail($input->email);
        $user->setFirstName($input->firstName);
        $user->setLastName($input->lastName);
        
        // Create user (password hashing handled in UserManager)
        $this->userManager->create($user, $input->plainPassword);

        return new JsonResponse([
            'id' => $user->getId(),
            'email' => $user->getEmail(),
        ], 201);
    }
}
```

**How it works:**

1. Client sends `POST /api/users` with JSON body
2. Symfony sees `#[MapRequestPayload] CreateUserDto $input`
3. Symfony deserializes JSON into `CreateUserDto`
4. Symfony validates using `#[Assert\*]` constraints
5. If validation fails, Symfony returns 422 Unprocessable Entity with errors
6. If validation passes, your controller receives a typed DTO

!!! tip "Validate DTOs"

    Always add Symfony Validator constraints (`#[Assert\*]`) to your DTO properties. This provides:

    - **Early validation**: Catches bad input before it reaches your business logic
    - **Automatic error responses**: Symfony returns 422 with validation errors for APIs
    - **Type safety**: Ensures data meets your requirements

!!! note "Request Data Mapping vs Manual Request Handling"

    **Use Request Data Mapping when:**

    - You want type safety and clean code

    - You have multiple query parameters or complex request bodies

    - You're building APIs or modern applications
    
    **Use manual Request handling when:**

    - You have very simple, one-off parameter extraction

    - You need fine-grained control over the mapping process

    - Working with legacy code that doesn't support attributes

## Testing Request Data Mapping

Testing becomes much easier with DTOs:

```php
<?php

namespace App\Tests\Controller;

use App\Model\UserFilter;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

class UserControllerTest extends WebTestCase
{
    public function testIndexWithFilters(): void
    {
        $client = static::createClient();
        
        // Test with query parameters
        $client->request('GET', '/users', [
            'q' => 'john',
            'active' => '1',
            'sort' => 'email',
            'page' => '2',
        ]);
        
        $this->assertResponseIsSuccessful();
    }
    
    public function testIndexWithDefaults(): void
    {
        $client = static::createClient();
        
        // Test with no parameters (should use defaults)
        $client->request('GET', '/users');
        
        $this->assertResponseIsSuccessful();
        // Verify defaults are applied in repository
    }
}
```

**Benefits:**

- Easy to test different filter combinations
- No need to mock Request objects
- Can create DTOs directly in unit tests

## Next Steps

Now that you understand Request Data Mapping:

1. **Repository & Queries** - Use the `UserFilter` in repository search methods
2. **Controllers** - Implement controllers that use `#[MapQueryString]` and `#[MapRequestPayload]`
3. **Forms** - For HTML forms, continue using Symfony Forms (Request Data Mapping is best for APIs and query parameters)


