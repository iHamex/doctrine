# Security & Auth

This section covers authentication (login/logout), password hashing, role-based access control, and authorization using Voters. Security is critical - we'll explain each component and why it's needed.

## Why Security Matters

**Authentication** = "Who are you?" (login, password verification)

**Authorization** = "What can you do?" (permissions, roles, voters)

Symfony Security provides both, and we'll use Doctrine to store user data securely.

## Security Configuration

Create or update `config/packages/security.yaml`:

```yaml
security:
  # Password hashing configuration
  password_hashers:
    # Use Symfony's auto-detection (bcrypt/argon2 based on PHP version)
    App\Entity\User: 'auto'

  # User providers - where to find users for authentication
  providers:
    app_user_provider:
      entity:
        class: App\Entity\User
        property: email  # Use email as the unique identifier

  # Firewalls - define authentication requirements for different URL patterns
  firewalls:
    # Development tools (profiler, web debug toolbar) - no authentication needed
    dev:
      pattern: ^/(_(profiler|wdt)|css|images|js)/
      security: false
    
    # Main application firewall
    main:
      lazy: true  # Lazy loading improves performance
      provider: app_user_provider
      form_login:
        login_path: login
        check_path: login
        default_target_path: /users  # Where to redirect after login
      logout:
        path: logout
        target: /  # Where to redirect after logout

  # Access control - define who can access which URLs
  access_control:
    - { path: ^/login, roles: PUBLIC_ACCESS }  # Login page is public
    - { path: ^/users, roles: ROLE_USER }      # User management requires authentication
```

**Explanation of each section:**

### Password Hashers
```yaml
password_hashers:
  App\Entity\User: 'auto'
```
**Why:** Tells Symfony how to hash passwords for the User entity. `'auto'` means Symfony will choose the best algorithm (bcrypt or argon2) based on your PHP version. This ensures passwords are stored securely using industry-standard hashing.

### User Providers
```yaml
providers:
  app_user_provider:
    entity:
      class: App\Entity\User
      property: email
```
**Why:** Tells Symfony where to find users. When someone tries to log in, Symfony will:
1. Look up the user by email in the database (via Doctrine)
2. Verify the password hash matches
3. Load the user's roles for authorization

### Firewalls
```yaml
firewalls:
  main:
    form_login:
      login_path: login
      check_path: login
```
**Why:** Defines authentication mechanisms. `form_login` enables traditional username/password forms. The `login_path` is where users see the login form, and `check_path` is where the form submits for verification.

### Access Control
```yaml
access_control:
  - { path: ^/users, roles: ROLE_USER }
```
**Why:** URL-based access control. Any URL matching `^/users` requires `ROLE_USER` role. If not authenticated or missing the role, Symfony redirects to login.

## Login Controller & Template

Generate the login controller and template using MakerBundle:

```bash
php bin/console make:auth
```

**Choose:**

- Login form authenticator
- Controller: `SecurityController`
- Route name: `login`

This generates:

- `src/Controller/SecurityController.php` - Login/logout actions
- `templates/security/login.html.twig` - Login form template

**Generated SecurityController (customize as needed):**

```php
<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Authentication\AuthenticationUtils;

class SecurityController extends AbstractController
{
    /**
     * Display login form
     * 
     * AuthenticationUtils provides:
     * - Last username entered (for "remember me" functionality)
     * - Any authentication errors
     */
    #[Route('/login', name: 'login')]
    public function login(AuthenticationUtils $authenticationUtils): Response
    {
        // If user is already logged in, redirect
        if ($this->getUser()) {
            return $this->redirectToRoute('user_index');
        }

        // Get the login error if there is one
        $error = $authenticationUtils->getLastAuthenticationError();
        
        // Last username entered by the user
        $lastUsername = $authenticationUtils->getLastUsername();

        return $this->render('security/login.html.twig', [
            'last_username' => $lastUsername,
            'error' => $error,
        ]);
    }

    /**
     * Logout action
     * 
     * This route is handled by Symfony Security automatically.
     * The actual logout logic is configured in security.yaml.
     */
    #[Route('/logout', name: 'logout')]
    public function logout(): void
    {
        // This method can be blank - it will never be executed!
        // Symfony will intercept the request and handle logout
        throw new \LogicException('This method can be blank - it will be intercepted by the logout key in your firewall.');
    }
}
```

**Login template (`templates/security/login.html.twig`):**

```twig
{% extends 'base.html.twig' %}

{% block body %}
<div class="container">
    <h1>Login</h1>

    {% if error %}
        <div class="alert alert-danger">{{ error.messageKey|trans(error.messageData, 'security') }}</div>
    {% endif %}

    <form method="post" action="{{ path('login') }}">
        {# CSRF protection - Symfony requires this token #}
        <input type="hidden" name="_csrf_token" value="{{ csrf_token('authenticate') }}">

        <div>
            <label for="inputEmail">Email</label>
            <input 
                type="email" 
                value="{{ last_username }}" 
                name="_username" 
                id="inputEmail" 
                autocomplete="email" 
                required 
                autofocus
            >
        </div>

        <div>
            <label for="inputPassword">Password</label>
            <input 
                type="password" 
                name="_password" 
                id="inputPassword" 
                autocomplete="current-password" 
                required
            >
        </div>

        <button type="submit">Sign in</button>
    </form>
</div>
{% endblock %}
```

**Important points:**

- Form submits to `login` route (matches `check_path` in security.yaml)
- `_username` field name is required by Symfony (maps to email)
- `_password` field name is required by Symfony
- `_csrf_token` prevents CSRF attacks
- `last_username` pre-fills the email field if login fails

## Roles Explained

Roles are strings that represent permissions. Every user automatically gets `ROLE_USER`:

```php
// In User entity
public function getRoles(): array
{
    return array_values(array_unique([...$this->roles, 'ROLE_USER']));
}
```

**Common roles:**

- `ROLE_USER` - Basic authenticated user (everyone gets this)
- `ROLE_ADMIN` - Administrative privileges
- `ROLE_MODERATOR` - Limited admin powers

**Granting roles:**

```php
// In a controller or command
$user->setRoles(['ROLE_ADMIN']);
$entityManager->flush();
```

**Checking roles:**

```php
// In controller
if ($this->isGranted('ROLE_ADMIN')) {
    // User is an admin
}

// In Twig template
{% if is_granted('ROLE_ADMIN') %}
    <a href="{{ path('admin_panel') }}">Admin Panel</a>
{% endif %}
```

## Voters: Fine-Grained Authorization

**Why use Voters?**

Roles are too coarse-grained for complex permissions. For example:

- "Users can delete their own accounts" - Can't express this with just roles
- "Admins can delete any user" - Need to check both role AND ownership
- "Users can edit their own profile, but not others" - Requires checking the resource

**Voters solve this** 

by allowing custom authorization logic based on:

- The current user
- The action being performed (delete, edit, view)
- The resource being acted upon (specific User entity)

### Creating a UserVoter

Create `src/Security/Voter/UserVoter.php`:

```php
<?php

namespace App\Security\Voter;

use App\Entity\User;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

/**
 * UserVoter - Handles authorization for User entity operations
 * 
 * This voter implements fine-grained permissions:
 * - Admins can delete any user
 * - Users can delete themselves
 * - Other operations can be added here (edit, view, etc.)
 */
class UserVoter extends Voter
{
    // Define the attributes (actions) this voter handles
    public const DELETE = 'USER_DELETE';
    public const EDIT = 'USER_EDIT';
    public const VIEW = 'USER_VIEW';

    /**
     * Determines if this voter should vote on the given attribute and subject
     * 
     * @param string $attribute The action (e.g., 'USER_DELETE')
     * @param mixed $subject The resource being acted upon (e.g., User entity)
     * @return bool True if this voter should handle this case
     */
    protected function supports(string $attribute, $subject): bool
    {
        // Only vote on User entity operations
        if (!in_array($attribute, [self::DELETE, self::EDIT, self::VIEW], true)) {
            return false;
        }

        // Only vote if subject is a User entity
        return $subject instanceof User;
    }

    /**
     * Performs the authorization check
     * 
     * @param string $attribute The action (e.g., 'USER_DELETE')
     * @param mixed $subject The User entity being acted upon
     * @param TokenInterface $token Contains the authenticated user
     * @return bool True if authorized, false otherwise
     */
    protected function voteOnAttribute(string $attribute, $subject, TokenInterface $token): bool
    {
        // Get the current user from the token
        $user = $token->getUser();

        // If user is not logged in (not an object), deny access
        if (!is_object($user)) {
            return false;
        }

        // Ensure $user is a User entity (type safety)
        if (!$user instanceof User) {
            return false;
        }

        // $subject is the User being acted upon (e.g., the user to delete)
        /** @var User $subject */

        // Handle different attributes
        return match ($attribute) {
            self::DELETE => $this->canDelete($user, $subject),
            self::EDIT => $this->canEdit($user, $subject),
            self::VIEW => $this->canView($user, $subject),
            default => false,
        };
    }

    /**
     * Check if user can delete the subject user
     * 
     * Rules:
     * - Admins can delete anyone
     * - Users can delete themselves
     * - Otherwise, deny
     */
    private function canDelete(User $user, User $subject): bool
    {
        // Admins can delete any user
        if (in_array('ROLE_ADMIN', $user->getRoles(), true)) {
            return true;
        }

        // Users can delete themselves
        return $user->getUserIdentifier() === $subject->getUserIdentifier();
    }

    /**
     * Check if user can edit the subject user
     * 
     * Rules:
     * - Admins can edit anyone
     * - Users can edit themselves
     */
    private function canEdit(User $user, User $subject): bool
    {
        if (in_array('ROLE_ADMIN', $user->getRoles(), true)) {
            return true;
        }

        return $user->getUserIdentifier() === $subject->getUserIdentifier();
    }

    /**
     * Check if user can view the subject user
     * 
     * Rules:
     * - Admins can view anyone
     * - Users can view themselves
     * - For now, we'll allow all authenticated users to view others
     *   (adjust based on your requirements)
     */
    private function canView(User $user, User $subject): bool
    {
        // Everyone can view user profiles for now
        // Adjust this based on your privacy requirements
        return true;
    }
}
```

**How Voters Work:**

1. **Controller calls `denyAccessUnlessGranted()`:**
   ```php
   $this->denyAccessUnlessGranted('USER_DELETE', $user);
   ```

2. **Symfony Security asks all voters:**

   - Calls `supports()` on each voter
   - If `supports()` returns true, calls `voteOnAttribute()`

3. **UserVoter checks permissions:**

   - Gets current user from token
   - Gets subject (the User being deleted)
   - Applies business rules (admin can delete anyone, users can delete themselves)

4. **Returns true/false:**

   - `true` = authorized, action proceeds
   - `false` = denied, Symfony throws `AccessDeniedException`

### Using the Voter in Controllers

```php
<?php

namespace App\Controller;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/users')]
class UserController extends AbstractController
{
    #[Route('/{id}', name: 'user_delete', methods: ['POST'])]
    public function delete(
        Request $request,
        User $user,
        EntityManagerInterface $em
    ): Response {
        // Check authorization using the voter
        // This will call UserVoter::voteOnAttribute()
        // If denied, Symfony throws AccessDeniedException (403 error)
        $this->denyAccessUnlessGranted('USER_DELETE', $user);

        // Verify CSRF token (security best practice)
        if ($this->isCsrfTokenValid('delete'.$user->getId(), (string)$request->request->get('_token'))) {
            $em->remove($user);
            $em->flush();
            $this->addFlash('success', 'User deleted successfully.');
        }

        return $this->redirectToRoute('user_index');
    }

    #[Route('/{id}/edit', name: 'user_edit', methods: ['GET', 'POST'])]
    public function edit(User $user): Response
    {
        // Check if user can edit this specific user
        $this->denyAccessUnlessGranted('USER_EDIT', $user);

        // ... rest of edit logic
    }
}
```

**In Twig templates:**

```twig
{% if is_granted('USER_DELETE', user) %}
    <form action="{{ path('user_delete', {id: user.id}) }}" method="post">
        <input type="hidden" name="_token" value="{{ csrf_token('delete' ~ user.id) }}">
        <button type="submit">Delete</button>
    </form>
{% endif %}
```

### Voter Auto-Registration

Symfony automatically discovers and registers voters if they:
- Are in the `App\Security\Voter` namespace
- Extend the `Voter` class
- Are autoconfigured (default in Symfony)

No manual registration needed!

!!! warning "Defense in Depth"

    Always use **multiple layers** of security:

    1. **Route-level** (`access_control` in security.yaml) - Basic role checks
    2. **Controller-level** (`denyAccessUnlessGranted()`) - Fine-grained permissions via voters
    3. **Template-level** (`is_granted()`) - Hide UI elements users can't access
    
    Don't rely on just one layer. If a route is accidentally made public, voters still protect actions.

!!! tip "Remember Me Functionality"
    To enable "Remember Me" (stay logged in for extended periods), add to `security.yaml`:
    ```yaml
    firewalls:
      main:
        remember_me:
          secret: '%kernel.secret%'
          lifetime: 604800  # 1 week in seconds
          path: /
    ```
    Then add a checkbox to your login form:
    ```twig
    <input type="checkbox" name="_remember_me" id="remember_me">
    <label for="remember_me">Remember me</label>
    ```

## Password Hashing in Controllers

When creating or updating users, always hash passwords:

```php
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

public function new(
    Request $request,
    EntityManagerInterface $em,
    UserPasswordHasherInterface $hasher
): Response {
    $user = new User();
    $form = $this->createForm(UserType::class, $user);
    $form->handleRequest($request);

    if ($form->isSubmitted() && $form->isValid()) {
        // Hash the plain password
        $plainPassword = $user->getPlainPassword();
        if ($plainPassword) {
            $hashedPassword = $hasher->hashPassword($user, $plainPassword);
            $user->setPassword($hashedPassword);
            $user->setPlainPassword(null); // Clear sensitive data
        }

        $em->persist($user);
        $em->flush();
        
        return $this->redirectToRoute('user_index');
    }

    return $this->render('user/new.html.twig', ['form' => $form->createView()]);
}
```

**Why `UserPasswordHasherInterface`?**

- Automatically uses the hasher configured in `security.yaml`
- Handles algorithm selection (bcrypt/argon2)
- Updates hash format if algorithms improve
- Provides consistent hashing across your application

## Next Steps

Now that security is configured:

1. **Controllers** - Use `denyAccessUnlessGranted()` to protect actions
2. **Templates** - Use `is_granted()` to conditionally show UI
3. **Testing** - Test authentication and authorization in your test suite

Your application is now secure!


