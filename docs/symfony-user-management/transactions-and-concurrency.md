# Transactions & Concurrency

Transactions ensure data consistency when multiple database operations must succeed or fail together. Concurrency control prevents data corruption when multiple users edit the same data simultaneously.

## Why Transactions Matter

**Problem without transactions:**
```php
// User registration process
$em->persist($user);        // Step 1: Create user
$em->flush();               // Commits to database

// Step 2: Assign to default group
$user->getGroups()->add($defaultGroup);
$em->flush();               // Commits to database

// What if Step 2 fails?
// User exists but isn't in any group - inconsistent state!
```

**Solution with transactions:**
```php
// All operations in one transaction
$conn->transactional(function() use ($user, $defaultGroup) {
    $em->persist($user);
    $user->getGroups()->add($defaultGroup);
    $em->flush();
});

// If anything fails, everything rolls back - consistent state!
```

## Explicit Transactions

### Using Connection::transactional()

```php
<?php

namespace App\Service;

use App\Entity\User;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;

class UserRegistrationService
{
    public function __construct(
        private EntityManagerInterface $em
    ) {}

    /**
     * Register user and assign to default group atomically
     * 
     * If any step fails, the entire operation rolls back.
     */
    public function registerUser(User $user, array $groups): void
    {
        $conn = $this->em->getConnection();
        
        $conn->transactional(function() use ($user, $groups) {
            // All operations in this closure are in one transaction
            
            // Step 1: Persist user
            $this->em->persist($user);
            $this->em->flush(); // Flush within transaction
            
            // Step 2: Assign groups
            foreach ($groups as $group) {
                $user->getGroups()->add($group);
            }
            $this->em->flush(); // Flush again
            
            // If any exception occurs, entire transaction rolls back
        });
        
        // Transaction automatically commits if closure completes successfully
    }
}
```

**How it works:**

1. `transactional()` starts a database transaction
2. Executes the closure
3. If closure succeeds: commits transaction
4. If exception occurs: rolls back transaction
5. All changes are atomic (all or nothing)

### Manual Transaction Control

For more control, manage transactions manually:

```php
use Doctrine\DBAL\Connection;

public function complexOperation(): void
{
    $conn = $this->em->getConnection();
    
    try {
        // Begin transaction
        $conn->beginTransaction();
        
        // Perform operations
        $this->em->persist($user1);
        $this->em->persist($user2);
        $this->em->flush();
        
        // Additional operations
        $this->doSomethingElse();
        
        // Commit transaction
        $conn->commit();
        
    } catch (\Exception $e) {
        // Rollback on any error
        $conn->rollBack();
        throw $e; // Re-throw to caller
    }
}
```

**When to use manual control:**

- Need to conditionally commit/rollback
- Complex error handling logic
- Need to check intermediate state

## Concurrency Control

When multiple users edit the same entity simultaneously, conflicts can occur:

**Scenario:**

1. User A loads user #1 (name: "John")
2. User B loads user #1 (name: "John")
3. User A changes name to "Johnny" and saves
4. User B changes name to "Jonathan" and saves
5. **Problem**: User B's change overwrites User A's change!

**Solutions:**

- Optimistic locking (version field)
- Pessimistic locking (database locks)

## Optimistic Locking

Optimistic locking uses a version field to detect conflicts.

### Step 1: Add Version Field to Entity

Update `src/Entity/User.php`:

```php
<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: UserRepository::class)]
class User
{
    // ... existing properties ...

    /**
     * Version field for optimistic locking
     * 
     * Doctrine automatically increments this on each update.
     * If version changed between load and save, OptimisticLockException is thrown.
     */
    #[ORM\Version]
    #[ORM\Column(type: 'integer')]
    private int $version = 1;

    public function getVersion(): int
    {
        return $this->version;
    }
}
```

### Step 2: Create Migration

```bash
php bin/console make:migration
php bin/console doctrine:migrations:migrate -n
```

This adds a `version` column to the `users` table.

### Step 3: Handle OptimisticLockException

Update controller to handle conflicts:

```php
<?php

namespace App\Controller;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\OptimisticLockException;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/users')]
class UserController extends AbstractController
{
    #[Route('/{id}/edit', name: 'user_edit', methods: ['GET', 'POST'])]
    public function edit(
        Request $request,
        User $user,
        EntityManagerInterface $em,
        UserPasswordHasherInterface $hasher
    ): Response {
        $form = $this->createForm(UserType::class, $user);
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            try {
                // Get version from form (hidden field)
                $submittedVersion = $request->request->getInt('user[_version]');
                
                // Set version to check for conflicts
                // If version changed, OptimisticLockException will be thrown
                $user->setVersion($submittedVersion);
                
                // Update user
                $plainPassword = $user->getPlainPassword();
                if ($plainPassword) {
                    $user->setPassword($hasher->hashPassword($user, $plainPassword));
                }
                $user->setPlainPassword(null);
                $user->touch();
                
                $em->flush();
                
                $this->addFlash('success', 'User updated successfully.');
                return $this->redirectToRoute('user_index');
                
            } catch (OptimisticLockException $e) {
                // Another user modified this entity
                $this->addFlash('error', 
                    'This user was modified by another user. Please refresh and try again.'
                );
                
                // Reload entity to get latest version
                $em->refresh($user);
                
                // Re-render form with latest data
                $form = $this->createForm(UserType::class, $user);
            }
        }

        return $this->render('user/edit.html.twig', [
            'form' => $form->createView(),
            'user' => $user,
        ]);
    }
}
```

### Step 4: Add Version Field to Form

Update `src/Form/UserType.php`:

```php
public function buildForm(FormBuilderInterface $builder, array $options): void
{
    $builder
        // ... existing fields ...
        
        // Hidden version field for optimistic locking
        ->add('version', HiddenType::class)
    ;
}
```

**In template:**
```twig
{{ form_widget(form) }}  {# Includes hidden version field #}
```

### How Optimistic Locking Works

1. **Load entity**: Version = 1
2. **User edits**: Form includes version = 1
3. **Another user saves**: Version becomes 2
4. **First user saves**: Doctrine checks version
5. **Conflict detected**: Version changed (1 ≠ 2)
6. **Exception thrown**: `OptimisticLockException`
7. **User notified**: "Please refresh and try again"

## Pessimistic Locking

Pessimistic locking locks the database row during the entire operation.

### Using Pessimistic Locks

```php
use Doctrine\DBAL\LockMode;

/**
 * Edit user with pessimistic lock
 * 
 * Locks the row until transaction completes.
 * Other users must wait until lock is released.
 */
public function editWithLock(
    int $userId,
    EntityManagerInterface $em
): void {
    // Load user with pessimistic write lock
    $user = $em->find(User::class, $userId, LockMode::PESSIMISTIC_WRITE);
    
    // Row is now locked - other users cannot modify it
    // Perform edits...
    $user->setFirstName('New Name');
    
    $em->flush();
    // Lock released when transaction commits
}
```

**Lock modes:**

- `LockMode::PESSIMISTIC_WRITE` - Exclusive lock (prevents reads and writes)
- `LockMode::PESSIMISTIC_READ` - Shared lock (allows reads, prevents writes)

**When to use:**

- Critical operations that must not conflict
- Short-lived operations (locks block other users)
- When optimistic locking causes too many conflicts

**Drawbacks:**

- Can cause deadlocks
- Blocks other users
- Slower (waiting for locks)

## Handling Lock Exceptions

### OptimisticLockException

```php
use Doctrine\ORM\OptimisticLockException;

try {
    $em->flush();
} catch (OptimisticLockException $e) {
    // Handle conflict
    $this->addFlash('error', 'Conflict detected. Please refresh and try again.');
    
    // Reload entity
    $em->refresh($user);
    
    // Show form again with latest data
}
```

### DeadlockException

```php
use Doctrine\DBAL\Exception\DeadlockException;

try {
    $em->flush();
} catch (DeadlockException $e) {
    // Retry with exponential backoff
    $this->retryWithBackoff(function() use ($em) {
        $em->flush();
    });
}
```

**Retry logic:**
```php
private function retryWithBackoff(callable $operation, int $maxRetries = 3): void
{
    $attempt = 0;
    
    while ($attempt < $maxRetries) {
        try {
            $operation();
            return; // Success
        } catch (DeadlockException $e) {
            $attempt++;
            if ($attempt >= $maxRetries) {
                throw $e; // Give up
            }
            
            // Wait before retry (exponential backoff)
            usleep(pow(2, $attempt) * 100000); // 0.1s, 0.2s, 0.4s
        }
    }
}
```

## Transaction Isolation Levels

Database transactions have isolation levels that control visibility of changes:

**READ UNCOMMITTED:**
- See uncommitted changes from other transactions
- Lowest isolation, fastest
- Can see "dirty reads"

**READ COMMITTED (default):**
- Only see committed changes
- Prevents dirty reads
- Can have "non-repeatable reads"

**REPEATABLE READ:**
- Consistent reads within transaction
- Prevents non-repeatable reads
- Can have "phantom reads"

**SERIALIZABLE:**
- Highest isolation
- Prevents all anomalies
- Slowest, can cause deadlocks

**Setting isolation level:**
```php
$conn->setTransactionIsolation(Connection::TRANSACTION_REPEATABLE_READ);
```

## Best Practices

!!! warning "Transaction Scope"
    - Keep transactions short (reduce lock time)
    - Don't do heavy processing inside transactions
    - Don't make HTTP requests inside transactions

!!! tip "Optimistic vs Pessimistic"
    - **Optimistic**: Most cases (better performance, user-friendly)
    - **Pessimistic**: Critical operations, high conflict rate

!!! note "Error Handling"
    - Always handle `OptimisticLockException`
    - Provide clear error messages to users
    - Reload entity and show latest data
    - Consider retry logic for deadlocks

## Real-World Example: User Balance Transfer

```php
<?php

namespace App\Service;

use App\Entity\User;
use Doctrine\DBAL\Connection;
use Doctrine\ORM\EntityManagerInterface;

class TransferService
{
    public function __construct(
        private EntityManagerInterface $em
    ) {}

    /**
     * Transfer balance between users atomically
     * 
     * Uses pessimistic locking to prevent race conditions.
     */
    public function transferBalance(
        User $fromUser,
        User $toUser,
        float $amount
    ): void {
        if ($amount <= 0) {
            throw new \InvalidArgumentException('Amount must be positive');
        }

        $conn = $this->em->getConnection();
        
        $conn->transactional(function() use ($fromUser, $toUser, $amount) {
            // Lock both users (prevents concurrent transfers)
            $this->em->lock($fromUser, \Doctrine\DBAL\LockMode::PESSIMISTIC_WRITE);
            $this->em->lock($toUser, \Doctrine\DBAL\LockMode::PESSIMISTIC_WRITE);
            
            // Reload to get latest balance
            $this->em->refresh($fromUser);
            $this->em->refresh($toUser);
            
            // Check balance
            if ($fromUser->getBalance() < $amount) {
                throw new \RuntimeException('Insufficient balance');
            }
            
            // Transfer
            $fromUser->setBalance($fromUser->getBalance() - $amount);
            $toUser->setBalance($toUser->getBalance() + $amount);
            
            // Save
            $this->em->flush();
        });
    }
}
```

## Testing Transactions

```php
<?php

namespace App\Tests\Service;

use App\Service\UserRegistrationService;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

class UserRegistrationServiceTest extends KernelTestCase
{
    public function testTransactionRollbackOnFailure(): void
    {
        $service = self::getContainer()->get(UserRegistrationService::class);
        $em = self::getContainer()->get('doctrine')->getManager();
        
        $initialCount = count($em->getRepository(User::class)->findAll());
        
        try {
            // This should fail and rollback
            $service->registerUser($invalidUser, []);
        } catch (\Exception $e) {
            // Expected to fail
        }
        
        // Verify no user was created (transaction rolled back)
        $finalCount = count($em->getRepository(User::class)->findAll());
        $this->assertEquals($initialCount, $finalCount);
    }
}
```

## Next Steps

Now that you understand transactions and concurrency:

1. **Add optimistic locking** - Prevent edit conflicts
2. **Use transactions** - Ensure data consistency
3. **Handle exceptions** - Provide good user experience

Your application now handles concurrent edits safely!
