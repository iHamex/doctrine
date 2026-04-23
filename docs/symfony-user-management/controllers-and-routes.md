# Controllers & Routes

Controllers handle HTTP requests and coordinate between models (entities/repositories) and views (templates). We'll implement a complete CRUD controller using Symfony's attribute routing, dependency injection, and Request Data Mapping.

## Understanding Controllers

**What controllers do:**

- Receive HTTP requests
- Extract and validate input data
- Call services/repositories to perform business logic
- Return HTTP responses (HTML, JSON, redirects)

**Symfony controller principles:**

- **Thin controllers**: Business logic in services, queries in repositories
- **Dependency injection**: Services injected via constructor or method parameters
- **Type hints**: Use type hints for automatic service resolution
- **Return types**: Always specify return types for clarity

## Routes Configuration

Ensure attribute routing is enabled in `config/routes/attributes.yaml`:

```yaml
controllers:
  resource: ../../src/Controller/
  type: attribute
```

**Explanation:**

- `resource: ../../src/Controller/` - Where to find controllers
- `type: attribute` - Use PHP 8 attributes for route definitions (modern approach)

This is the default in Symfony 7.x, so it should already be configured.

## Complete UserController

Create `src/Controller/UserController.php`:

```php
<?php

namespace App\Controller;

use App\Entity\User;
use App\Form\UserType;
use App\Model\UserFilter;
use App\Repository\UserRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Attribute\MapQueryString;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;

/**
 * UserController
 * 
 * Handles all HTTP requests related to User management:
 * - List users with filtering and pagination
 * - Create new users
 * - View user details
 * - Edit existing users
 * - Delete users (with authorization)
 */
#[Route('/users')]
class UserController extends AbstractController
{
    /**
     * List users with filtering, sorting, and pagination
     * 
     * Route: GET /users
     * 
     * This action demonstrates Request Data Mapping - query parameters
     * are automatically bound to the UserFilter DTO.
     * 
     * @param UserFilter $filter Automatically populated from query string (?q=john&page=2)
     * @param UserRepository $users Injected repository for querying users
     * @return Response HTML response with user list
     */
    #[Route('', name: 'user_index', methods: ['GET'])]
    public function index(
        #[MapQueryString] UserFilter $filter,
        UserRepository $users
    ): Response {
        // Search users using repository method
        // Repository handles all query logic (filtering, sorting, pagination)
        $result = $users->search($filter);

        // Render template with results
        return $this->render('user/index.html.twig', [
            'items' => $result['items'],        // User entities for current page
            'total' => $result['total'],        // Total count for pagination
            'page' => $filter->page,            // Current page number
            'perPage' => $filter->perPage,      // Items per page
            'criteria' => [                     // Current filter values (for form persistence)
                'q' => $filter->q,
                'active' => $filter->active,
                'sort' => $filter->sort,
                'dir' => $filter->dir,
            ],
        ]);
    }

    /**
     * Display form to create a new user
     * 
     * Route: GET /users/new (display form)
     * Route: POST /users/new (process form submission)
     * 
     * @param Request $request HTTP request (contains form data)
     * @param EntityManagerInterface $em Doctrine entity manager for persistence
     * @param UserPasswordHasherInterface $hasher Password hasher service
     * @return Response HTML response with form or redirect after creation
     */
    #[Route('/new', name: 'user_new', methods: ['GET', 'POST'])]
    public function new(
        Request $request,
        EntityManagerInterface $em,
        UserPasswordHasherInterface $hasher
    ): Response {
        // Create new User entity
        $user = new User();

        // Create form bound to User entity
        // 'create' validation group makes password required
        $form = $this->createForm(UserType::class, $user, [
            'validation_groups' => ['Default', 'create'],
        ]);

        // Process form submission
        // handleRequest() extracts data from POST request and validates
        $form->handleRequest($request);

        // Check if form was submitted and is valid
        if ($form->isSubmitted() && $form->isValid()) {
            // Get plain password from entity (form bound it there)
            $plainPassword = (string) ($user->getPlainPassword() ?? '');

            // Hash the password using Symfony's password hasher
            // This uses the algorithm configured in security.yaml
            $hashedPassword = $hasher->hashPassword($user, $plainPassword);
            $user->setPassword($hashedPassword);

            // Clear plain password immediately (security best practice)
            $user->setPlainPassword(null);

            // Persist user to database
            $em->persist($user);
            $em->flush();

            // Add flash message (temporary message shown on next page)
            $this->addFlash('success', 'User created successfully.');

            // Redirect to user list
            return $this->redirectToRoute('user_index');
        }

        // Render form (either initial GET or after validation errors)
        return $this->render('user/new.html.twig', [
            'form' => $form->createView(),
        ]);
    }

    /**
     * Display user details
     * 
     * Route: GET /users/{id}
     * 
     * Symfony automatically resolves User entity from {id} parameter
     * using ParamConverter (type-hinting User in method signature).
     * 
     * @param User $user Automatically loaded User entity (404 if not found)
     * @return Response HTML response with user details
     */
    #[Route('/{id}', name: 'user_show', requirements: ['id' => '\d+'], methods: ['GET'])]
    public function show(User $user): Response
    {
        // User is automatically loaded by Symfony ParamConverter
        // If user with {id} doesn't exist, Symfony returns 404 automatically

        return $this->render('user/show.html.twig', [
            'user' => $user,
        ]);
    }

    /**
     * Display form to edit existing user
     * 
     * Route: GET /users/{id}/edit (display form)
     * Route: POST /users/{id}/edit (process form submission)
     * 
     * @param Request $request HTTP request (contains form data)
     * @param User $user Automatically loaded User entity
     * @param EntityManagerInterface $em Doctrine entity manager
     * @param UserPasswordHasherInterface $hasher Password hasher service
     * @return Response HTML response with form or redirect after update
     */
    #[Route('/{id}/edit', name: 'user_edit', requirements: ['id' => '\d+'], methods: ['GET', 'POST'])]
    public function edit(
        Request $request,
        User $user,
        EntityManagerInterface $em,
        UserPasswordHasherInterface $hasher
    ): Response {
        // Create form bound to existing User entity
        // Form will be pre-filled with current user data
        $form = $this->createForm(UserType::class, $user);

        // Process form submission
        $form->handleRequest($request);

        // Check if form was submitted and is valid
        if ($form->isSubmitted() && $form->isValid()) {
            // Get plain password (may be empty if user didn't change password)
            $plainPassword = (string) ($user->getPlainPassword() ?? '');

            // Only hash password if a new one was provided
            // If empty, keep the existing hashed password
            if ($plainPassword !== '') {
                $hashedPassword = $hasher->hashPassword($user, $plainPassword);
                $user->setPassword($hashedPassword);
            }

            // Clear plain password (security)
            $user->setPlainPassword(null);

            // Update updatedAt timestamp
            $user->touch();

            // Save changes to database
            // No need to persist() - entity is already managed
            $em->flush();

            // Add flash message
            $this->addFlash('success', 'User updated successfully.');

            // Redirect to user list
            return $this->redirectToRoute('user_index');
        }

        // Render form (either initial GET or after validation errors)
        return $this->render('user/edit.html.twig', [
            'form' => $form->createView(),
            'user' => $user,  // Pass user for display (e.g., "Edit John Doe")
        ]);
    }

    /**
     * Delete a user
     * 
     * Route: POST /users/{id}
     * 
     * Uses POST method (not DELETE) because browsers don't support DELETE
     * in HTML forms. CSRF protection prevents unauthorized deletions.
     * 
     * @param Request $request HTTP request (contains CSRF token)
     * @param User $user Automatically loaded User entity
     * @param EntityManagerInterface $em Doctrine entity manager
     * @return Response Redirect to user list
     */
    #[Route('/{id}', name: 'user_delete', requirements: ['id' => '\d+'], methods: ['POST'])]
    public function delete(
        Request $request,
        User $user,
        EntityManagerInterface $em
    ): Response {
        // Check authorization using Voter
        // This calls UserVoter to check if current user can delete this user
        // Throws AccessDeniedException (403) if not authorized
        $this->denyAccessUnlessGranted('USER_DELETE', $user);

        // Verify CSRF token
        // Prevents Cross-Site Request Forgery attacks
        // Token is generated in template and verified here
        $token = (string) $request->request->get('_token');
        if ($this->isCsrfTokenValid('delete' . $user->getId(), $token)) {
            // Remove user from database
            $em->remove($user);
            $em->flush();

            // Add flash message
            $this->addFlash('success', 'User deleted successfully.');
        } else {
            // Invalid CSRF token
            $this->addFlash('error', 'Invalid security token.');
        }

        // Always redirect (even if deletion failed)
        return $this->redirectToRoute('user_index');
    }
}
```

## Understanding Route Attributes

**Class-level route:**
```php
#[Route('/users')]
class UserController
```
**Why:** Sets a prefix for all routes in this controller. All routes will start with `/users`.

**Method-level routes:**
```php
#[Route('', name: 'user_index', methods: ['GET'])]
```
**Why:**

- `''` - Empty string means it's relative to class prefix (`/users`)
- `name: 'user_index'` - Route name for generating URLs (`path('user_index')`)
- `methods: ['GET']` - Only accepts GET requests

**Route requirements:**
```php
#[Route('/{id}', requirements: ['id' => '\d+'])]
```
**Why:** `\d+` ensures `{id}` is only digits. Prevents `/users/abc` from matching.

## ParamConverter: Automatic Entity Loading

**How it works:**
```php
public function show(User $user): Response
```

**What happens:**

1. Symfony sees `User $user` type hint
2. Extracts `{id}` from URL (`/users/123`)
3. Calls `UserRepository::find($id)`
4. If found: passes User entity to method
5. If not found: returns 404 automatically

**Benefits:**

- No manual `find()` calls
- Automatic 404 handling
- Type-safe entity access
- Cleaner code

**Disable ParamConverter if needed:**
```php
#[Route('/{id}', name: 'user_show')]
public function show(int $id, UserRepository $users): Response
{
    $user = $users->find($id);
    if (!$user) {
        throw $this->createNotFoundException('User not found');
    }
    // ...
}
```

## Request Data Mapping Explained

**In the index action:**
```php
public function index(#[MapQueryString] UserFilter $filter, ...)
```

**What `#[MapQueryString]` does:**

1. Reads query string: `?q=john&active=1&page=2`
2. Creates `UserFilter` instance
3. Maps query params to properties:
   - `q=john` → `$filter->q = 'john'`
   - `active=1` → `$filter->active = true`
   - `page=2` → `$filter->page = 2`
4. Applies defaults for missing params
5. Passes populated `UserFilter` to your method

**Benefits:**

- Type-safe (IDE autocomplete)
- Automatic defaults
- No manual `$request->query->get()` calls
- Easy to test

## Form Handling Flow

**Step-by-step for `new()` action:**

1. **GET request** → Display empty form
2. **User fills form** → Submits POST request
3. **`handleRequest()`** → Extracts POST data, validates, binds to entity
4. **`isSubmitted()`** → Checks if form was submitted
5. **`isValid()`** → Checks if validation passed
6. **If valid:**
   - Hash password
   - Persist entity
   - Flush to database
   - Redirect with success message
7. **If invalid:**
   - Re-render form with error messages

## Password Hashing Explained

**Why hash in controller, not entity?**

- **Explicit**: You can see password hashing happening
- **Control**: Only hash when password changes
- **Testable**: Easy to test hashing logic
- **Clear intent**: Password hashing is a controller concern

**The hashing process:**
```php
// 1. Get plain password from form
$plainPassword = $user->getPlainPassword();

// 2. Hash using Symfony's hasher (uses algorithm from security.yaml)
$hashedPassword = $hasher->hashPassword($user, $plainPassword);

// 3. Store hash in entity
$user->setPassword($hashedPassword);

// 4. Clear plain password immediately
$user->setPlainPassword(null);
```

**Why clear plain password?**

- Security: Plain password shouldn't linger in memory
- Prevents accidental exposure in logs/debugging
- Best practice: Clear sensitive data ASAP

## Entity Manager: Persist vs Flush

**`persist($entity)`:**

- Tells Doctrine to track this entity
- Required for NEW entities
- Not needed for EXISTING entities (they're already tracked)

**`flush()`:**

- Executes all pending database operations
- Can be called once after multiple persists
- Can be expensive (triggers all queries)

**Example:**
```php
// Create new user
$user1 = new User();
$em->persist($user1);  // Track it

// Create another user
$user2 = new User();
$em->persist($user2);  // Track it

// Execute both INSERTs in one transaction
$em->flush();  // Single database round-trip
```

## Flash Messages

**What are flash messages?**

- Temporary messages shown on the next page
- Stored in session
- Automatically cleared after display

**Usage:**
```php
// Set flash message
$this->addFlash('success', 'User created successfully.');

// In template (base.html.twig):
{% for label, messages in app.flashes %}
    {% for message in messages %}
        <div class="alert alert-{{ label }}">{{ message }}</div>
    {% endfor %}
{% endfor %}
```

**Common flash types:**

- `success` - Green, positive feedback
- `error` - Red, errors
- `warning` - Yellow, warnings
- `info` - Blue, informational

## CSRF Protection

**What is CSRF?**
Cross-Site Request Forgery - attacker tricks user into submitting forms on your site.

**How Symfony protects:**

1. Generate token in form:
   ```twig
   <input type="hidden" name="_token" value="{{ csrf_token('delete' ~ user.id) }}">
   ```
2. Verify token in controller:
   ```php
   if ($this->isCsrfTokenValid('delete' . $user->getId(), $token)) {
       // Safe to proceed
   }
   ```

**Why it works:**

- Token is unique per form/action
- Attacker can't guess token
- Only your site can generate valid tokens

## Dependency Injection

**How it works:**
```php
public function new(
    Request $request,
    EntityManagerInterface $em,
    UserPasswordHasherInterface $hasher
): Response
```

**Symfony automatically:**

1. Sees type hints (`EntityManagerInterface`, etc.)
2. Looks up service in container
3. Injects service instance
4. Calls your method with services ready

**Benefits:**

- No manual service lookup
- Easy to test (can inject mocks)
- Type-safe
- Clean code

## Error Handling

**404 Not Found:**
```php
// Automatic with ParamConverter
public function show(User $user): Response
// If user not found, Symfony returns 404 automatically
```

**403 Forbidden:**
```php
// Automatic with denyAccessUnlessGranted()
$this->denyAccessUnlessGranted('USER_DELETE', $user);
// If not authorized, Symfony throws AccessDeniedException (403)
```

**500 Server Error:**

- Unhandled exceptions become 500 errors
- In dev mode: detailed error page
- In prod mode: generic error page (configure in `config/packages/framework.yaml`)

## Testing Controllers

```php
<?php

namespace App\Tests\Controller;

use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

class UserControllerTest extends WebTestCase
{
    public function testIndex(): void
    {
        $client = static::createClient();
        $client->request('GET', '/users');

        $this->assertResponseIsSuccessful();
        $this->assertSelectorExists('table'); // Check for user table
    }

    public function testNewUser(): void
    {
        $client = static::createClient();
        $crawler = $client->request('GET', '/users/new');

        // Fill form
        $form = $crawler->selectButton('Save')->form([
            'user[email]' => 'test@example.com',
            'user[firstName]' => 'John',
            'user[lastName]' => 'Doe',
            'user[plainPassword]' => 'password123',
        ]);

        $client->submit($form);

        // Should redirect to user list
        $this->assertResponseRedirects('/users');
    }
}
```

## Next Steps

Now that your controller is complete:

1. **Forms** - Create UserType form class
2. **Views** - Create Twig templates for each action
3. **Security** - Add authorization checks where needed

Your CRUD controller is ready to handle all user management operations!
