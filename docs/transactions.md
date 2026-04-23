# Transactions and Concurrency Control

In any application that modifies data, ensuring data integrity is paramount. A **transaction** is a mechanism that guarantees a sequence of database operations are treated as a single, atomic unit: either all operations succeed, or none of them do. Doctrine provides powerful tools for managing transactions and handling the complexities of concurrent user interactions.

## The `transactional()` Helper: The Safest Approach

For the vast majority of use cases, Doctrine's `transactional()` method is the recommended way to handle database transactions. It provides a simple, safe wrapper that automatically handles starting the transaction, committing it on success, and rolling it back if an exception occurs.

This prevents common bugs where a developer might forget to roll back a transaction in a `catch` block, leaving the database connection in an inconsistent state.

```php
// A classic "money transfer" example
try {
    $entityManager->transactional(function ($em) use ($fromAccountId, $toAccountId, $amount) {
        $fromAccount = $em->find(Account::class, $fromAccountId);
        $toAccount = $em->find(Account::class, $toAccountId);

        if ($fromAccount->getBalance() < $amount) {
            throw new \RuntimeException('Insufficient funds.');
        }

        $fromAccount->withdraw($amount);
        $toAccount->deposit($amount);
        
        // The transactional() helper will automatically call flush() at the end
    });
} catch (\RuntimeException $e) {
    // The transaction was automatically rolled back.
    // The user can be safely notified of the error.
}
```

In this example, if the `Insufficient funds` exception is thrown, Doctrine ensures that neither account balance is permanently changed. The `transactional()` method takes care of everything.

## Manual Transaction Control

While `transactional()` is preferred, you can manually control transactions if you need more complex logic. This requires you to explicitly begin, commit, and roll back the transaction.

```php
$entityManager->beginTransaction();
try {
    // ... perform operations
    $account->withdraw(100);
    $entityManager->flush(); // Send the UPDATE to the DB

    // ... perform more operations
    $otherAccount->deposit(100);
    $entityManager->flush(); // Send another UPDATE to the DB

    $entityManager->commit();
} catch (\Exception $e) {
    // If any operation fails, roll back ALL changes
    $entityManager->rollback();
    throw $e;
}
```
!!! warning "Always Roll Back on Failure"
    When controlling transactions manually, you **must** call `rollback()` in your `catch` block. Forgetting this can lead to serious data integrity issues. This is the primary reason the `transactional()` helper is recommended.

### Nested Transactions

Doctrine supports nested transactions using savepoints. This allows you to roll back a portion of a larger transaction without affecting the entire operation.

```php
$entityManager->beginTransaction(); // Outer transaction starts
try {
    // ... operations ...
    $entityManager->flush();

    // Start a nested transaction
    $entityManager->beginTransaction();
    try {
        $user->addRiskyPermission();
        $entityManager->flush();
        $entityManager->commit(); // Commit the nested transaction
    } catch (\Exception $e) {
        $entityManager->rollback(); // Rollback only the nested transaction
    }

    $entityManager->commit(); // Commit the outer transaction
} catch (\Exception $e) {
    $entityManager->rollback(); // Rollback the outer transaction
    throw $e;
}
```

## Handling Concurrency with Locking

A major challenge in multi-user applications is handling **concurrency**—what happens when two users try to modify the same data at the same time? This can lead to "race conditions."

**The Problem: A Race Condition**
Imagine you are checking a product's stock before creating an order.

1.  **User A** checks stock for "Product X". The stock is **1**.
2.  **User B** simultaneously checks stock for "Product X". The stock is **1**.
3.  **User A**'s code decides it's okay to proceed, and their process continues.
4.  **User B**'s code also decides it's okay to proceed.
5.  **User A**'s order is finalized, and the stock is set to **0**.
6.  **User B**'s order is finalized, and the stock is set to **-1**.

You have now oversold a product. Transactions alone do not solve this problem; you need **locking**.

### Solution 1: Pessimistic Locking

Pessimistic locking prevents this problem by locking the database row when it is read, forcing other transactions to wait until the first transaction is finished.

You apply a pessimistic lock by using the `$entityManager->find()` method with a lock mode.

```php
$entityManager->transactional(function ($em) use ($productId, $quantity) {
    // Find the product and LOCK the row in the database.
    // Any other transaction trying to find this product will WAIT here.
    $product = $em->find(
        Product::class,
        $productId,
        \Doctrine\DBAL\LockMode::PESSIMISTIC_WRITE
    );

    if ($product->getStock() < $quantity) {
        throw new \RuntimeException('Not enough stock.');
    }

    $product->setStock($product->getStock() - $quantity);
});
```

- **`LockMode::PESSIMISTIC_WRITE`**: Acquires an exclusive lock (`SELECT ... FOR UPDATE`). No other transaction can read or write to this row until the current transaction completes.
- **`LockMode::PESSIMISTIC_READ`**: Acquires a shared lock (`SELECT ... FOR SHARE`). Other transactions can *read* the row, but they cannot acquire their own write lock on it.

You can also apply a lock when using DQL.

```dql
SELECT u FROM App\Entity\User u WHERE u.id = :id
```
```php
$query = $entityManager->createQuery($dql)
    ->setParameter('id', $userId)
    ->setLockMode(\Doctrine\DBAL\LockMode::PESSIMISTIC_WRITE);

$user = $query->getSingleResult();
```

!!! tip "When to Use Pessimistic Locking"
    Use pessimistic locking when you have high contention for the same records and you must ensure that data is not changed between the time you read it and the time you write your changes. It's often used in financial transactions, inventory management, or reservation systems.

### Solution 2: Optimistic Locking

Optimistic locking is a different strategy that does not use database-level locks. Instead, it uses a version number. It's a highly scalable approach for web applications.

#### Step 1: Add a Version Field
Add a `version` field to your entity and mark it with `#[ORM\Version]`.

```php
#[ORM\Entity]
class Product
{
    // ...
    #[ORM\Column(type: 'integer')]
    #[ORM\Version]
    private int $version;
}
```
This field will be automatically managed by Doctrine. Every time the entity is updated, Doctrine will increment the version number.

#### Step 2: The Update Process
When Doctrine updates an entity with a version field, its `UPDATE` query looks like this:

```sql
UPDATE products SET stock = 99, version = 2 WHERE id = 1 AND version = 1;
```

If another process managed to update the product between the time you fetched it (when `version` was 1) and the time you tried to save it, this `UPDATE` statement will affect **0 rows**.

When this happens, Doctrine throws an `OptimisticLockException`. You can catch this exception and gracefully handle the conflict.

```php
try {
    // In this transaction, assume the user is submitting a form
    // to update a product they loaded earlier.
    $entityManager->flush();
} catch (\Doctrine\ORM\OptimisticLockException $e) {
    // The product was modified by someone else.
    // Inform the user, refresh their data, and ask them to try again.
    throw new \RuntimeException('This product was updated by someone else. Please review the changes and submit again.');
}
```

!!! tip "Timestamp-based Optimistic Locking"
    Instead of an integer, you can also use a `datetime` column as a version field.
    ```php
    #[ORM\Column(type: 'datetime')]
    #[ORM\Version]
    private \DateTime $version;
    ```
    This works the same way but uses a timestamp instead of a counter.

### Pessimistic vs. Optimistic: Which to Choose?

| Scenario | Recommendation | Why? |
| --- | --- | --- |
| High contention, frequent conflicts | **Pessimistic** | It's better to make users wait than to have them frequently fail and retry. Good for financial transactions, inventory, reservations. |
| Low contention, rare conflicts | **Optimistic** | More scalable as it doesn't hold database locks. Good for collaborative editing (like a wiki page) where conflicts are infrequent. |
| Read-heavy systems | **Optimistic** | Avoids locking database rows on read, improving overall throughput. |

## Understanding Transaction Isolation

Transaction isolation determines how sensitive a transaction is to changes made by other, concurrent transactions. Setting the isolation level is an advanced topic, but it's important to know what it controls.

-   **READ UNCOMMITTED**: Can see uncommitted changes from other transactions (dirty reads). Rarely used.
-   **READ COMMITTED**: (Default for many DBs like PostgreSQL) Only sees committed changes. A row can change between two `SELECT` queries within the same transaction.
-   **REPEATABLE READ**: (Default for MySQL) Guarantees that if you read a row multiple times in a transaction, you will get the same data.
-   **SERIALIZABLE**: The highest level. Transactions behave as if they were executed one after another, not concurrently. This provides maximum safety but can significantly reduce concurrency.

You can set the isolation level on a per-connection basis if needed, but it's usually best to stick with your database's default unless you have a very specific reason to change it.
```php
$entityManager->getConnection()->setTransactionIsolation(\Doctrine\DBAL\Connection::TRANSACTION_SERIALIZABLE);
```

