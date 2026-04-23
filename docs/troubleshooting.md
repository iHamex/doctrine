# Troubleshooting: A Diagnostic Guide

When you encounter an error or unexpected behavior in Doctrine, a systematic approach can help you pinpoint the problem quickly. This guide provides a diagnostic workflow for common issues, teaching you *how* to investigate problems, not just what the solutions are.

## The First Step: Always Check the Logs

Before you do anything else, **look at your SQL logs**. The queries Doctrine is (or isn't) executing are the most crucial clue. In a Symfony application, the web debug toolbar is your best friend. For standalone setups, enable an SQL logger.

The logs will immediately answer questions like:

-   Is Doctrine executing any queries at all?
-   Is it executing the *right* query (`UPDATE`, `INSERT`, `DELETE`)?
-   Are the parameters in the query correct?
-   Is it executing *too many* queries (N+1 problem)?

The answer to these questions will point you to the right section below.

---

## Category 1: Persistence Problems

This category covers issues where you call `flush()` but your data isn't saved, or you get errors related to entity state.

#### Problem: My changes are not being saved to the database.

**Diagnostic Workflow:**

1.  **Check the SQL Logs**: Did `flush()` generate an `UPDATE` statement?
    -   **No `UPDATE` statement was generated**: This means Doctrine doesn't detect any changes. Proceed to Step 2.
    -   **An `UPDATE` statement was generated**: The problem is likely at the database level. Check for transaction rollbacks, database triggers, or incorrect connection settings.

2.  **Inspect the Unit of Work**: If Doctrine doesn't see changes, let's ask the `UnitOfWork` why.

    ```php
    $user->setName('A New Name');
    
    $uow = $entityManager->getUnitOfWork();
    $uow->computeChangeSets(); // Ask Doctrine to calculate changes now
    
    $changeSet = $uow->getEntityChangeSet($user);
    
    dump($changeSet);
    ```
    
    -   **The `dump()` shows your changes (e.g., `['name' => ['Old Name', 'A New Name']]`)**: 

    This is rare. If the change set is computed but no SQL is generated, there might be a deeper issue, possibly with lifecycle callbacks preventing the update.
    
    -   **The `dump()` shows an empty array `[]`**: 

    This is the most common scenario. It means the `UnitOfWork` is not tracking any changes for this entity. Proceed to Step 3.

3.  **Check the Entity's State**: The most likely reason the `UnitOfWork` isn't tracking changes is that the entity is **not managed**.

    ```php
    // Is the EntityManager tracking this object instance?
    dump($entityManager->contains($user));
    
    // What does the UnitOfWork think its state is?
    dump($entityManager->getUnitOfWork()->getEntityState($user));
    ```
    -   **`contains()` is `false` and state is `STATE_DETACHED` (or 4)**: You have a **detached entity**. This happens if the object was created outside the `EntityManager` (e.g., from a form or `unserialize`) or if you've previously called `$entityManager->clear()`.
        **Solution**: You must `merge()` the detached entity back into the `EntityManager`'s context before its changes can be tracked.
        ```php
        $managedUser = $entityManager->merge($user);
        $managedUser->setName('A New Name'); // Make changes to the managed instance
        $entityManager->flush();
        ```

#### Problem: I get an error "A new entity was found through the relationship..."

**Diagnostic Workflow:**

1.  **Understand the Error**: This error means you are trying to persist an entity (`A`) that has a relationship to another entity (`B`), but `B` is a new object that you haven't told Doctrine to persist. Doctrine is trying to save the foreign key for `B`, but `B` has no ID yet.

2.  **Inspect the Relationship**: Look at the entity you are persisting and all of its associations.

    ```php
    $post = new Post();
    $post->setAuthor(new Author()); // <-- Problem is here. The Author is new.
    
    $entityManager->persist($post);
    $entityManager->flush(); // Error!
    ```

3.  **Choose a Solution**:
    -   **Solution A (Manual Persist)**: Explicitly `persist` the related entity as well. This is clear and explicit.
        ```php
        $author = new Author();
        $post->setAuthor($author);
        
        $entityManager->persist($author); // <-- Persist the author
        $entityManager->persist($post);
        $entityManager->flush();
        ```
    -   **Solution B (Cascade Persist)**: If the related entity's lifecycle is completely owned by the parent (e.g., an `OrderItem` is always created with an `Order`), use `cascade: ['persist']` on the association mapping. This tells Doctrine to automatically persist any new entities found in that relationship.

---

## Category 2: Querying Problems

#### Problem: My query is executing way too many times (N+1 Problem).

**Diagnostic Workflow:**

1.  **Confirm with the SQL Logger**: The logs will show a pattern of one initial `SELECT` followed by many `SELECT` statements in a loop.

2.  **Identify the Source**: The N+1 is almost always caused by accessing a lazy-loaded collection or association inside a loop.

    ```php
    $posts = $repository->findAll(); // Query 1
    foreach ($posts as $post) {
        // Accessing the author triggers a new query for EACH post
        echo $post->getAuthor()->getName(); // Queries 2, 3, 4... N+1
    }
    ```

3.  **Fix with a Fetch Join**: Modify your original query to tell Doctrine to load the related entities at the same time.

    ```dql
    // Change your repository method to use a FETCH JOIN
    SELECT p, a FROM App\Entity\Post p JOIN FETCH p.author a
    ```
    This single change will reduce the number of queries from N+1 to just **1**.

#### Problem: My query doesn't return the results I expect.

**Diagnostic Workflow:**

1.  **Isolate the DQL/QueryBuilder**: Put the query logic into a variable.

2.  **Get the Final SQL**: Before executing the query, dump the generated SQL. This is the single most useful step for debugging queries.

    ```php
    $query = $entityManager->createQuery(/* ... DQL ... */);
    $query->setParameter(/* ... */);
    
    // Dump the final SQL that will be sent to the database
    dump($query->getSQL());
    
    // Then execute
    $results = $query->getResult();
    ```

3.  **Analyze the SQL**:
    -   Copy the generated SQL and run it directly in a database client. Does it produce the correct results there?
    -   Are the `JOIN` conditions correct?
    -   Are the `WHERE` clauses filtering what you expect?
    -   Often, you will find a mistake in your DQL logic (e.g., using `JOIN` instead of `LEFT JOIN`) that becomes obvious when you see the raw SQL.

---

## Category 3: Mapping & Metadata Errors

#### Problem: I get an error "No identifier/primary key has been defined..."

**Diagnostic Workflow:**

1.  **Read the Error**: This error is straightforward. Doctrine requires every class marked with `#[ORM\Entity]` to have a primary key.

2.  **Inspect the Entity**: Look at the entity class mentioned in the error message.

    **Solution**: Ensure that one (and only one) property is marked with `#[ORM\Id]`. This property must also have a `#[ORM\Column]` attribute. For auto-incrementing keys, you also need `#[ORM\GeneratedValue]`.

    ```php
    // ✅ CORRECT
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'integer')]
    private ?int $id = null;
    ```

