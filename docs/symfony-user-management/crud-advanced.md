# Advanced CRUD Features

Once you have basic CRUD working, you can enhance it with service layers, DTOs, domain events, file uploads, and bulk operations. These patterns improve maintainability, testability, and user experience.

## Service Layer Pattern

**Why use services?**

- **Thin controllers**: Controllers delegate to services
- **Reusable**: Services can be used from commands, APIs, etc.
- **Testable**: Easy to unit test business logic
- **Maintainable**: Business logic in one place

### UserManager Service

Create `src/Service/UserManager.php`:

```php
<?php

namespace App\Service;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * UserManager
 * 
 * Service layer for User entity operations.
 * Encapsulates business logic for creating and updating users.
 * 
 * Benefits:
 * - Reusable from controllers, commands, APIs
 * - Easy to test (mock EntityManager and PasswordHasher)
 * - Single responsibility (user management logic)
 */
class UserManager
{
    public function __construct(
        private EntityManagerInterface $em,
        private UserPasswordHasherInterface $hasher
    ) {}

    /**
     * Create a new user
     * 
     * Handles password hashing and persistence.
     * 
     * @param User $user User entity (should have plainPassword set)
     * @param string|null $plainPassword Plain password (optional, can use user's plainPassword)
     * @return User Created user entity (with ID set)
     */
    public function create(User $user, ?string $plainPassword = null): User
    {
        // Use provided password or get from entity
        $password = $plainPassword ?? $user->getPlainPassword();
        
        // Hash password if provided
        if ($password) {
            $hashedPassword = $this->hasher->hashPassword($user, $password);
            $user->setPassword($hashedPassword);
            $user->setPlainPassword(null); // Clear sensitive data
        }

        // Persist and flush
        $this->em->persist($user);
        $this->em->flush();

        return $user;
    }

    /**
     * Update an existing user
     * 
     * Handles password hashing (if password changed) and timestamp updates.
     * 
     * @param User $user User entity to update
     * @param string|null $plainPassword New password (optional)
     * @return User Updated user entity
     */
    public function update(User $user, ?string $plainPassword = null): User
    {
        // Use provided password or get from entity
        $password = $plainPassword ?? $user->getPlainPassword();
        
        // Only hash if new password provided
        if ($password && $password !== '') {
            $hashedPassword = $this->hasher->hashPassword($user, $password);
            $user->setPassword($hashedPassword);
        }
        
        // Clear plain password
        $user->setPlainPassword(null);
        
        // Update timestamp
        $user->touch();

        // Flush changes
        $this->em->flush();

        return $user;
    }

    /**
     * Delete a user
     * 
     * @param User $user User to delete
     */
    public function delete(User $user): void
    {
        $this->em->remove($user);
        $this->em->flush();
    }

    /**
     * Activate a user
     * 
     * @param User $user User to activate
     */
    public function activate(User $user): void
    {
        $user->setIsActive(true);
        $user->touch();
        $this->em->flush();
    }

    /**
     * Deactivate a user
     * 
     * @param User $user User to deactivate
     */
    public function deactivate(User $user): void
    {
        $user->setIsActive(false);
        $user->touch();
        $this->em->flush();
    }
}
```

### Using UserManager in Controller

**Before (logic in controller):**
```php
public function new(Request $request, EntityManagerInterface $em, UserPasswordHasherInterface $hasher): Response
{
    $user = new User();
    $form = $this->createForm(UserType::class, $user);
    $form->handleRequest($request);

    if ($form->isSubmitted() && $form->isValid()) {
        $plain = $user->getPlainPassword();
        $user->setPassword($hasher->hashPassword($user, $plain));
        $user->setPlainPassword(null);
        $em->persist($user);
        $em->flush();
        return $this->redirectToRoute('user_index');
    }

    return $this->render('user/new.html.twig', ['form' => $form->createView()]);
}
```

**After (using service):**
```php
public function new(Request $request, UserManager $userManager): Response
{
    $user = new User();
    $form = $this->createForm(UserType::class, $user);
    $form->handleRequest($request);

    if ($form->isSubmitted() && $form->isValid()) {
        $userManager->create($user);
        $this->addFlash('success', 'User created successfully.');
        return $this->redirectToRoute('user_index');
    }

    return $this->render('user/new.html.twig', ['form' => $form->createView()]);
}
```

**Benefits:**

- Controller is thinner (less code)
- Logic is reusable (can call from commands, APIs)
- Easier to test (mock UserManager)

## Domain Events

**What are domain events?**

- Events that represent something important happened in your domain
- Example: "UserCreated", "UserDeleted", "UserActivated"
- Other parts of the system can react to these events

### Creating Domain Events

Create `src/Event/UserCreated.php`:

```php
<?php

namespace App\Event;

/**
 * UserCreated Event
 * 
 * Dispatched when a new user is created.
 * Listeners can react to this event (send welcome email, create audit log, etc.)
 */
class UserCreated
{
    public function __construct(
        public readonly int $userId,
        public readonly string $email
    ) {}
}
```

### Dispatching Events

**In UserManager:**
```php
use App\Event\UserCreated;
use Symfony\Contracts\EventDispatcher\EventDispatcherInterface;

class UserManager
{
    public function __construct(
        private EntityManagerInterface $em,
        private UserPasswordHasherInterface $hasher,
        private EventDispatcherInterface $dispatcher
    ) {}

    public function create(User $user, ?string $plainPassword = null): User
    {
        // ... create logic ...

        // Dispatch event after user is persisted
        $this->dispatcher->dispatch(new UserCreated(
            $user->getId(),
            $user->getEmail()
        ));

        return $user;
    }
}
```

### Listening to Events

Create `src/EventListener/UserCreatedListener.php`:

```php
<?php

namespace App\EventListener;

use App\Event\UserCreated;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;

/**
 * UserCreatedListener
 * 
 * Reacts to UserCreated events.
 * Can send emails, create audit logs, update related entities, etc.
 */
#[AsEventListener(event: UserCreated::class)]
class UserCreatedListener
{
    public function __construct(
        private LoggerInterface $logger
    ) {}

    public function __invoke(UserCreated $event): void
    {
        // Log the event
        $this->logger->info('User created', [
            'user_id' => $event->userId,
            'email' => $event->email,
        ]);

        // Could also:
        // - Send welcome email
        // - Create audit log entry
        // - Update statistics
        // - Notify administrators
    }
}
```

## File Upload: Avatar

### Add Avatar Field to User Entity

```php
#[ORM\Column(length: 255, nullable: true)]
private ?string $avatarPath = null;

public function getAvatarPath(): ?string { return $this->avatarPath; }
public function setAvatarPath(?string $avatarPath): self { $this->avatarPath = $avatarPath; return $this; }
```

### Create Avatar Upload Service

Create `src/Service/FileUploader.php`:

```php
<?php

namespace App\Service;

use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\String\Slugger\SluggerInterface;

/**
 * FileUploader
 * 
 * Handles file uploads securely:
 * - Validates file type and size
 * - Generates safe filenames
 * - Stores files in public directory
 */
class FileUploader
{
    public function __construct(
        private string $targetDirectory,
        private SluggerInterface $slugger
    ) {}

    /**
     * Upload a file
     * 
     * @param UploadedFile $file File to upload
     * @param string $prefix Prefix for filename (e.g., 'avatar')
     * @return string Relative path to uploaded file (e.g., 'uploads/avatar-abc123.jpg')
     */
    public function upload(UploadedFile $file, string $prefix = 'file'): string
    {
        // Validate file type
        $allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!in_array($file->getMimeType(), $allowedMimeTypes, true)) {
            throw new \InvalidArgumentException('Invalid file type. Only images are allowed.');
        }

        // Validate file size (2MB max)
        $maxSize = 2 * 1024 * 1024; // 2MB
        if ($file->getSize() > $maxSize) {
            throw new \InvalidArgumentException('File too large. Maximum size is 2MB.');
        }

        // Generate safe filename
        $originalFilename = pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME);
        $safeFilename = $this->slugger->slug($originalFilename)->lower();
        $extension = $file->guessExtension();
        $newFilename = $prefix . '-' . uniqid() . '-' . $safeFilename . '.' . $extension;

        // Move file to target directory
        $file->move($this->targetDirectory, $newFilename);

        // Return relative path (from public directory)
        return 'uploads/' . $newFilename;
    }

    /**
     * Delete a file
     * 
     * @param string $path Relative path to file
     */
    public function delete(string $path): void
    {
        $fullPath = $this->targetDirectory . '/' . basename($path);
        if (file_exists($fullPath)) {
            unlink($fullPath);
        }
    }
}
```

### Configure FileUploader Service

In `config/services.yaml`:

```yaml
services:
    App\Service\FileUploader:
        arguments:
            $targetDirectory: '%kernel.project_dir%/public/uploads'
```

### Add Avatar Field to Form

```php
use Symfony\Component\Form\Extension\Core\Type\FileType;

public function buildForm(FormBuilderInterface $builder, array $options): void
{
    // ... existing fields ...

    ->add('avatarFile', FileType::class, [
        'label' => 'Avatar',
        'mapped' => false,  // Don't bind to entity directly
        'required' => false,
        'constraints' => [
            new Assert\File([
                'maxSize' => '2M',
                'mimeTypes' => ['image/jpeg', 'image/png', 'image/gif'],
            ]),
        ],
    ])
}
```

### Handle Upload in Controller

```php
use App\Service\FileUploader;

public function new(
    Request $request,
    UserManager $userManager,
    FileUploader $fileUploader
): Response {
    $user = new User();
    $form = $this->createForm(UserType::class, $user);
    $form->handleRequest($request);

    if ($form->isSubmitted() && $form->isValid()) {
        // Handle avatar upload
        $avatarFile = $form->get('avatarFile')->getData();
        if ($avatarFile) {
            $avatarPath = $fileUploader->upload($avatarFile, 'avatar');
            $user->setAvatarPath($avatarPath);
        }

        // Create user
        $userManager->create($user);
        
        return $this->redirectToRoute('user_index');
    }

    return $this->render('user/new.html.twig', ['form' => $form->createView()]);
}
```

### Display Avatar in Template

```twig
{% if user.avatarPath %}
    <img src="{{ asset(user.avatarPath) }}" alt="Avatar" style="max-width: 200px;">
{% else %}
    <div>No avatar</div>
{% endif %}
```

!!! warning "File Upload Security"

    - **Validate file types**: Check MIME types, not just extensions
    - **Limit file size**: Prevent large file uploads
    - **Generate safe filenames**: Never trust user-provided filenames
    - **Store outside web root**: If possible, serve files through a controller
    - **Scan for viruses**: Consider virus scanning for production

## Bulk Actions

### Add Bulk Action Form

In `templates/user/index.html.twig`:

```twig
<form method="post" action="{{ path('user_bulk_action') }}" id="bulk-form">
    <input type="hidden" name="_token" value="{{ csrf_token('bulk_action') }}">
    
    <table>
        <thead>
            <tr>
                <th><input type="checkbox" id="select-all"></th>
                {# ... other columns ... #}
            </tr>
        </thead>
        <tbody>
            {% for user in items %}
                <tr>
                    <td>
                        <input type="checkbox" name="users[]" value="{{ user.id }}" class="user-checkbox">
                    </td>
                    {# ... other columns ... #}
                </tr>
            {% endfor %}
        </tbody>
    </table>

    <div>
        <select name="action" required>
            <option value="">Select action...</option>
            <option value="activate">Activate</option>
            <option value="deactivate">Deactivate</option>
            <option value="delete">Delete</option>
        </select>
        <button type="submit">Apply to Selected</button>
    </div>
</form>

<script>
    // Select all checkbox
    document.getElementById('select-all').addEventListener('change', function() {
        document.querySelectorAll('.user-checkbox').forEach(cb => {
            cb.checked = this.checked;
        });
    });
</script>
```

### Bulk Action Controller

```php
#[Route('/bulk', name: 'user_bulk_action', methods: ['POST'])]
public function bulkAction(
    Request $request,
    UserRepository $users,
    UserManager $userManager
): Response {
    // Verify CSRF token
    if (!$this->isCsrfTokenValid('bulk_action', $request->request->get('_token'))) {
        $this->addFlash('error', 'Invalid security token.');
        return $this->redirectToRoute('user_index');
    }

    // Get selected user IDs
    $userIds = $request->request->all('users') ?? [];
    if (empty($userIds)) {
        $this->addFlash('warning', 'No users selected.');
        return $this->redirectToRoute('user_index');
    }

    // Get action
    $action = $request->request->get('action');
    if (!$action) {
        $this->addFlash('error', 'No action selected.');
        return $this->redirectToRoute('user_index');
    }

    // Load users
    $selectedUsers = $users->findBy(['id' => $userIds]);
    
    // Apply action
    $count = 0;
    foreach ($selectedUsers as $user) {
        // Check authorization for each user
        if (!$this->isGranted('USER_EDIT', $user)) {
            continue;
        }

        match ($action) {
            'activate' => $userManager->activate($user),
            'deactivate' => $userManager->deactivate($user),
            'delete' => $userManager->delete($user),
            default => null,
        };
        $count++;
    }

    $this->addFlash('success', "Action applied to {$count} user(s).");
    return $this->redirectToRoute('user_index');
}
```

## Pagination Improvements

**Better pagination controls:**

```twig
<nav>
    <ul>
        {# First page #}
        {% if page > 1 %}
            <li><a href="{{ path('user_index', criteria|merge({page: 1})) }}">First</a></li>
        {% endif %}

        {# Previous page #}
        {% if page > 1 %}
            <li><a href="{{ path('user_index', criteria|merge({page: page - 1})) }}">Previous</a></li>
        {% endif %}

        {# Page numbers #}
        {% for p in 1..totalPages %}
            {% if p == page %}
                <li><strong>{{ p }}</strong></li>
            {% elseif p == 1 or p == totalPages or (p >= page - 2 and p <= page + 2) %}
                <li><a href="{{ path('user_index', criteria|merge({page: p})) }}">{{ p }}</a></li>
            {% elseif p == page - 3 or p == page + 3 %}
                <li><span>...</span></li>
            {% endif %}
        {% endfor %}

        {# Next page #}
        {% if page < totalPages %}
            <li><a href="{{ path('user_index', criteria|merge({page: page + 1})) }}">Next</a></li>
        {% endif %}

        {# Last page #}
        {% if page < totalPages %}
            <li><a href="{{ path('user_index', criteria|merge({page: totalPages})) }}">Last</a></li>
        {% endif %}
    </ul>
</nav>
```

## Best Practices

!!! tip "Service Layer Benefits"
    - Controllers stay thin (just HTTP concerns)
    - Business logic is reusable
    - Easier to test (mock services)
    - Better separation of concerns

!!! warning "File Upload Security"

    Always validate:

    - File type (MIME type, not extension)
    - File size
    - Generate safe filenames
    - Consider virus scanning

!!! note "Bulk Operations"

    - Always check authorization for each item
    - Use transactions for data integrity
    - Provide clear feedback to users
    - Consider rate limiting for large operations

## Next Steps

Now that you have advanced CRUD features:

1. **Testing** - Write tests for services and bulk operations
2. **Performance** - Optimize queries and add caching
3. **Deployment** - Prepare for production deployment

Your user management system is now production-ready!
