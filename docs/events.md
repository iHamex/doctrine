# Events: Intercepting the Persistence Lifecycle

Doctrine's event system is a powerful feature that allows you to hook into the lifecycle of an entity and execute custom logic at key moments like before an entity is saved, updated, or deleted. This enables you to implement cross-cutting concerns such as auditing, automatic timestamping, or sending notifications, without cluttering your entity classes with business logic.

There are two primary ways to hook into the event system: **Lifecycle Callbacks** and **Event Listeners/Subscribers**.

## Lifecycle Callbacks: Simple, Entity-Specific Logic

Lifecycle Callbacks are methods defined directly on an entity class. They are the simplest way to execute logic for a specific entity type.

To enable them, you must first add the `#[ORM\HasLifecycleCallbacks]` attribute to your entity class. Then, you can annotate public methods with the desired lifecycle event attribute.

#### Common Use Case: Automatic Timestamps
A classic example is automatically setting `createdAt` and `updatedAt` timestamps.

```php
// src/Entity/TimestampedEntity.php
<?php
namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\MappedSuperclass]
#[ORM\HasLifecycleCallbacks]
abstract class TimestampedEntity
{
    #[ORM\Column(type: 'datetime_immutable')]
    private ?\DateTimeImmutable $createdAt = null;

    #[ORM\Column(type: 'datetime')]
    private ?\DateTime $updatedAt = null;

    #[ORM\PrePersist]
    public function onPrePersist(): void
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTime();
    }

    #[ORM\PreUpdate]
    public function onPreUpdate(): void
    {
        $this->updatedAt = new \DateTime();
    }
    
    // Getters...
}

// src/Entity/Product.php
#[ORM\Entity]
class Product extends TimestampedEntity 
{
    // ... This entity now automatically gets timestamps
}
```
Here, we've created a `MappedSuperclass` to make this behavior easily reusable across many entities.
-   `#[ORM\PrePersist]`: This method is called just before a new entity is first written to the database (`INSERT`).
-   `#[ORM\PreUpdate]`: This method is called just before a managed entity is updated in the database (`UPDATE`).

!!! warning "Limitations of Lifecycle Callbacks"
    Lifecycle Callbacks are simple but have important limitations:
    - **No Dependency Injection**: They cannot access other services from your application's container.
    - **No Access to Unit of Work**: They have no knowledge of the `EntityManager` or the overall state of the transaction.
    - **Not Reusable**: The logic is tied directly to the entity class (though using a `MappedSuperclass` helps).
    
    For any logic that requires external services (like a logger, mailer, or the current user), you must use an Event Listener or Subscriber.

### Available Lifecycle Events

| Attribute | Fired... | Use Cases |
| --- | --- | --- |
| `#[PrePersist]` | Before a new entity is persisted. | Setting default values, slugs, `createdAt` timestamps. |
| `#[PostPersist]` | After a new entity is persisted and the ID is available. | Logging, queuing jobs that need the new entity's ID. |
| `#[PreUpdate]` | Before an existing entity is updated. | Updating an `updatedAt` timestamp. |
| `#[PostUpdate]` | After an existing entity is updated. | Invalidating caches, sending update notifications. |
| `#[PreRemove]` | Before an entity is removed. | Archiving data, checking if deletion is allowed. |
| `#[PostRemove]` | After an entity is removed. | Deleting associated files from a filesystem, cleaning up related data. |
| `#[PostLoad]` | After an entity is loaded from the database or constructed by the `EntityManager`. | Initializing transient properties, dependency injection. |

!!! note "`preUpdate` and `postUpdate` Arguments"
    When using Lifecycle Callbacks, the `preUpdate` and `postUpdate` methods receive a `PreUpdateEventArgs` and `PostUpdateEventArgs` object respectively. This allows you to access the entity's change-set directly from the callback.
    ```php
    #[ORM\PreUpdate]
    public function onPreUpdate(PreUpdateEventArgs $args): void
    {
        if ($args->hasChangedField('title')) {
            $this->slug = $this->slugger->slug($args->getNewValue('title'));
        }
    }
    ```

## Event Listeners and Subscribers: Reusable, Global Logic

While Lifecycle Callbacks are great for entity-specific logic, they have limitations. They can't use dependency injection, and their logic is tied to the entity itself.

For more complex or reusable logic, **Event Listeners** and **Event Subscribers** are the better choice. They are separate classes that can be registered to listen for events across *all* entities.

### Event Listeners vs. Subscribers

| Feature | Listener | Subscriber |
| --- | --- | --- |
| **Registration** | Must be registered for each event it listens to. | Registers itself for all events it wants to handle. |
| **Class Structure** | A simple class with methods for each event. | Must implement `Doctrine\Common\EventSubscriber`. |
| **Complexity** | Simpler for listening to just one or two events. | Better organized for handling many events in one place. |

In modern applications, **Subscribers** are generally preferred for their self-contained nature.

### Example: A "Blameable" Subscriber
Let's create a subscriber that automatically tracks which user created or updated an entity.

#### Step 1: Create the Subscriber Class
The subscriber needs access to the current user, so we'll inject a security service.

```php
// src/EventSubscriber/BlameableSubscriber.php
<?php
namespace App\EventSubscriber;

use App\Entity\User; // Your User entity
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener; // For Symfony integration
use Doctrine\ORM\Events;
use Doctrine\Persistence\Event\LifecycleEventArgs;
use Symfony\Bundle\SecurityBundle\Security; // Or your auth service

#[AsDoctrineListener(event: Events::prePersist)]
#[AsDoctrineListener(event: Events::preUpdate)]
class BlameableSubscriber
{
    public function __construct(private readonly Security $security)
    {
    }

    public function prePersist(LifecycleEventArgs $args): void
    {
        $entity = $args->getObject();

        if (method_exists($entity, 'setCreatedBy')) {
            $user = $this->security->getUser();
            if ($user instanceof User) {
                $entity->setCreatedBy($user);
            }
        }
    }

    public function preUpdate(LifecycleEventArgs $args): void
    {
        $entity = $args->getObject();

        if (method_exists($entity, 'setUpdatedBy')) {
            $user = $this->security->getUser();
            if ($user instanceof User) {
                $entity->setUpdatedBy($user);
            }
        }
    }
}
```
This example uses Symfony's `#[AsDoctrineListener]` attribute for easy registration. If you're not using Symfony, you would register it manually:

```php
$subscriber = new BlameableSubscriber($securityService);
$entityManager->getEventManager()->addEventSubscriber($subscriber);
```

### Accessing Change-Sets in `preUpdate`
A common requirement in `preUpdate` is to know *what* changed. The `PreUpdateEventArgs` object gives you access to the entity's change-set.

```php
// In an Event Listener or Subscriber...
use Doctrine\ORM\Event\PreUpdateEventArgs;

public function preUpdate(PreUpdateEventArgs $args): void
{
    $entity = $args->getObject();
    
    // Check if the 'status' field has changed
    if ($args->hasChangedField('status')) {
        $oldStatus = $args->getOldValue('status');
        $newStatus = $args->getNewValue('status');
        
        // Example: Log the status change
        $this->logger->info(
            "Status for {$entity->getId()} changed from '{$oldStatus}' to '{$newStatus}'"
        );

        // You can also change values before they are persisted
        if ($newStatus === 'published' && !$args->hasChangedField('publishedAt')) {
            // The change-set is also writable inside preUpdate
            $args->setNewValue('publishedAt', new \DateTimeImmutable());
        }
    }
}
```

!!! warning "Limitations of Listeners"
    -   You cannot call `flush()` from within a pre-event (`PrePersist`, `PreUpdate`, `PreRemove`). This will cause an infinite loop.
    -   Listeners should be focused on small, specific tasks. Complex business logic should reside in service classes.

## Summary: Which Method to Choose?

-   Use **Lifecycle Callbacks** for simple, self-contained logic that is intrinsic to an entity (like generating a slug from a title or managing timestamps).
-   Use **Event Subscribers** (or Listeners) for cross-cutting concerns that apply to many different entities (auditing, logging, blameable), especially when you need access to other services via dependency injection.

## Next Steps
- **[Validation](validation.md)**: Learn how to validate entity data before it is persisted.
- **[Filters](filters.md)**: Discover how to apply global filters to all DQL queries, for example, to implement a soft-delete feature.

