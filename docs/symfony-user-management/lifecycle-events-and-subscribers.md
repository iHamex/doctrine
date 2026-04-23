# Lifecycle Events & Subscribers

Doctrine provides a powerful event system that lets you react to database operations (insert, update, delete) automatically. This is perfect for cross-cutting concerns like maintaining timestamps, logging, or enforcing business rules.

## Why Use Lifecycle Events?

**Problem:** 
You need to update `updatedAt` timestamp every time a User is modified. You could:

1. Remember to call `$user->touch()` in every controller - **error-prone, easy to forget**
2. Use lifecycle events - **automatic, consistent, reliable**

**Benefits of lifecycle events:**

- **Automatic**: No need to remember to call methods manually
- **Consistent**: Applied uniformly across all code paths
- **Separation of concerns**: Business logic stays in entities/services, persistence logic in subscribers
- **Testable**: Can test event subscribers independently

## Doctrine Lifecycle Events

Doctrine fires events at specific points in the entity lifecycle:

| Event | When it fires | Use case |
|-------|---------------|----------|
| `prePersist` | Before INSERT | Set creation timestamps, generate IDs |
| `postPersist` | After INSERT | Send notifications, update related entities |
| `preUpdate` | Before UPDATE | Update modification timestamps, validate changes |
| `postUpdate` | After UPDATE | Log changes, invalidate cache |
| `preRemove` | Before DELETE | Check constraints, prepare soft-delete |
| `postRemove` | After DELETE | Clean up related data |
| `postLoad` | After entity loaded from DB | Initialize computed properties |

## Approach 1: Entity Callbacks (Simple Cases)

For simple cases where logic belongs to a single entity, use entity callbacks:

```php
<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\HasLifecycleCallbacks]  // Enable lifecycle callbacks for this entity
class User
{
    // ... other properties ...

    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    /**
     * Update timestamp before entity is updated
     * 
     * This method is called automatically by Doctrine before any UPDATE query.
     * No need to call it manually in controllers.
     */
    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->touch();
    }

    /**
     * Set creation timestamp before entity is persisted (inserted)
     * 
     * This is called automatically before the first INSERT.
     * Note: We also set this in constructor, but this ensures it's always set.
     */
    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        if (!isset($this->createdAt)) {
            $this->createdAt = new \DateTimeImmutable('now');
        }
        $this->updatedAt = new \DateTimeImmutable('now');
    }

    public function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable('now');
    }
}
```

**When to use entity callbacks:**

- Logic is specific to one entity type
- Simple operations (like updating timestamps)
- Logic naturally belongs with the entity

**Limitations:**

- Can only access the entity itself (no EntityManager, no other services)
- Harder to test (requires full Doctrine setup)
- Can't be reused across multiple entity types easily

## Approach 2: Event Subscribers (Recommended for Complex Cases)

For more complex scenarios or when you need to apply logic to multiple entities, use event subscribers:

### Creating a Timestamp Subscriber

Create `src/Doctrine/UserTimestampSubscriber.php`:

```php
<?php

namespace App\Doctrine;

use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;
use Doctrine\ORM\Event\PrePersistEventArgs;
use Doctrine\ORM\Event\PreUpdateEventArgs;
use Doctrine\ORM\Events;

/**
 * UserTimestampSubscriber
 * 
 * Automatically updates timestamps on User entities before they are
 * persisted or updated in the database.
 * 
 * Why use a subscriber instead of entity callbacks?
 * - Can be easily tested in isolation
 * - Can access EntityManager if needed
 * - Can be applied to multiple entity types
 * - Better separation of concerns
 */
#[AsDoctrineListener(event: Events::prePersist)]
#[AsDoctrineListener(event: Events::preUpdate)]
class UserTimestampSubscriber
{
    /**
     * Called before a new User entity is inserted into the database
     * 
     * @param PrePersistEventArgs $args Contains the entity being persisted
     */
    public function prePersist(PrePersistEventArgs $args): void
    {
        $entity = $args->getObject();
        
        // Only process User entities
        if (!$entity instanceof User) {
            return;
        }

        // Set creation timestamp if not already set
        // (constructor should set it, but this is a safety net)
        if (!isset($entity->getCreatedAt()) || $entity->getCreatedAt() === null) {
            // Note: This requires a setter or public property
            // In practice, constructor handles this, so we just update updatedAt
        }

        // Always update the updatedAt timestamp
        $entity->touch();
    }

    /**
     * Called before an existing User entity is updated in the database
     * 
     * @param PreUpdateEventArgs $args Contains the entity being updated and change set
     */
    public function preUpdate(PreUpdateEventArgs $args): void
    {
        $entity = $args->getObject();
        
        // Only process User entities
        if (!$entity instanceof User) {
            return;
        }

        // Update the modification timestamp
        $entity->touch();

        // Note: If you need to update a field that Doctrine is tracking,
        // you must tell Doctrine about it:
        // $em = $args->getObjectManager();
        // $uow = $em->getUnitOfWork();
        // $meta = $em->getClassMetadata(User::class);
        // $uow->recomputeSingleEntityChangeSet($meta, $entity);
        // 
        // However, since touch() updates updatedAt and Doctrine already knows
        // about this change (it's in the change set), we don't need to do this.
    }
}
```

**How it works:**

1. Doctrine fires `prePersist` event before INSERT
2. Subscriber's `prePersist()` method is called
3. We check if entity is a User
4. We call `touch()` to update timestamp
5. Doctrine continues with the INSERT

**Benefits:**

- **Auto-registration**: The `#[AsDoctrineListener]` attribute automatically registers the subscriber
- **Type-safe**: Can access EntityManager, UnitOfWork, etc. if needed
- **Testable**: Can create a subscriber instance and test it directly
- **Reusable**: Can easily extend to handle multiple entity types

### More Advanced Example: Audit Logging Subscriber

Here's a more complex example that logs all changes to User entities:

```php
<?php

namespace App\Doctrine;

use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;
use Doctrine\ORM\Event\PostUpdateEventArgs;
use Doctrine\ORM\Events;
use Psr\Log\LoggerInterface;

/**
 * UserAuditSubscriber
 * 
 * Logs all changes to User entities for audit purposes.
 * This demonstrates accessing services and change sets in subscribers.
 */
#[AsDoctrineListener(event: Events::postUpdate)]
class UserAuditSubscriber
{
    public function __construct(
        private LoggerInterface $logger
    ) {}

    /**
     * Log changes after a User is updated
     * 
     * @param PostUpdateEventArgs $args Contains entity and change set
     */
    public function postUpdate(PostUpdateEventArgs $args): void
    {
        $entity = $args->getObject();
        
        if (!$entity instanceof User) {
            return;
        }

        // Get the change set (what fields changed and their old/new values)
        $em = $args->getObjectManager();
        $uow = $em->getUnitOfWork();
        $changes = $uow->getEntityChangeSet($entity);

        // Log the changes
        $this->logger->info('User updated', [
            'user_id' => $entity->getId(),
            'email' => $entity->getEmail(),
            'changes' => $changes,
        ]);
    }
}
```

**Key points:**

- Can inject services (like LoggerInterface) via constructor
- Can access change sets to see what actually changed
- Runs AFTER the update (postUpdate), so we can see the final state

### Generic Timestamp Subscriber (Multiple Entities)

You can create a subscriber that works with multiple entities by using an interface:

```php
<?php

namespace App\Entity;

/**
 * TimestampableInterface
 * 
 * Entities implementing this interface will automatically get
 * timestamp management via the TimestampSubscriber.
 */
interface TimestampableInterface
{
    public function getCreatedAt(): ?\DateTimeImmutable;
    public function getUpdatedAt(): ?\DateTimeImmutable;
    public function touch(): void;
}
```

```php
<?php

namespace App\Doctrine;

use App\Entity\TimestampableInterface;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;
use Doctrine\ORM\Event\PrePersistEventArgs;
use Doctrine\ORM\Event\PreUpdateEventArgs;
use Doctrine\ORM\Events;

/**
 * TimestampSubscriber
 * 
 * Automatically manages timestamps for any entity implementing
 * TimestampableInterface. This makes it reusable across your application.
 */
#[AsDoctrineListener(event: Events::prePersist)]
#[AsDoctrineListener(event: Events::preUpdate)]
class TimestampSubscriber
{
    public function prePersist(PrePersistEventArgs $args): void
    {
        $entity = $args->getObject();
        
        if ($entity instanceof TimestampableInterface) {
            $entity->touch();
        }
    }

    public function preUpdate(PreUpdateEventArgs $args): void
    {
        $entity = $args->getObject();
        
        if ($entity instanceof TimestampableInterface) {
            $entity->touch();
        }
    }
}
```

Then make User implement the interface:

```php
class User implements UserInterface, PasswordAuthenticatedUserInterface, TimestampableInterface
{
    // ... existing code ...
}
```

## When to Use Which Approach?

**Use Entity Callbacks when:**

- Logic is simple and entity-specific
- You don't need access to EntityManager or other services
- The logic naturally belongs with the entity

**Use Event Subscribers when:**

- You need access to EntityManager, UnitOfWork, or other services
- Logic should be applied to multiple entity types
- You want better testability
- Logic is complex or involves external systems (logging, notifications, etc.)

## Testing Event Subscribers

Event subscribers are easy to test:

```php
<?php

namespace App\Tests\Doctrine;

use App\Doctrine\UserTimestampSubscriber;
use App\Entity\User;
use Doctrine\ORM\Event\PreUpdateEventArgs;
use PHPUnit\Framework\TestCase;

class UserTimestampSubscriberTest extends TestCase
{
    public function testPreUpdateUpdatesTimestamp(): void
    {
        $subscriber = new UserTimestampSubscriber();
        $user = new User();
        $user->setEmail('test@example.com');
        
        $originalUpdatedAt = $user->getUpdatedAt();
        
        // Simulate time passing
        sleep(1);
        
        // Create mock event args
        $args = $this->createMock(PreUpdateEventArgs::class);
        $args->method('getObject')->willReturn($user);
        
        // Call the subscriber
        $subscriber->preUpdate($args);
        
        // Verify timestamp was updated
        $this->assertNotEquals($originalUpdatedAt, $user->getUpdatedAt());
    }
}
```

## Important Notes

!!! warning "Don't Hash Passwords in Subscribers"

    **Never hash passwords in lifecycle events!** Password hashing should happen:

    - In controllers (explicit, visible)
    - In services (testable, clear intent)
    
    Why? Lifecycle events fire on EVERY persist/update, even when password hasn't changed. You'd re-hash already-hashed passwords, breaking authentication.

!!! tip "Performance Considerations"

    - Subscribers run for EVERY entity operation, so keep them fast
    - Avoid heavy operations (API calls, file I/O) in subscribers
    - Use async processing (Symfony Messenger) for slow operations

!!! note "Change Set Limitations"
    In `preUpdate`, you can see what's changing. In `postUpdate`, you can see the final state. If you modify the entity in `preUpdate`, you may need to recompute the change set (see advanced example above).

## Next Steps

Now that you understand lifecycle events:

1. **Controllers** - Use subscribers to handle automatic concerns (timestamps, logging)
2. **Advanced Features** - Explore soft-delete, audit trails, and caching invalidation
3. **Testing** - Write tests for your subscribers to ensure they work correctly

Your entities will now automatically maintain timestamps and handle other cross-cutting concerns!
