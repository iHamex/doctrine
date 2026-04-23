# Mastering Database Migrations

While the `SchemaTool` is excellent for development, it is **not safe** for managing a production database. For any real-world application, you must use **Doctrine Migrations**.

Migrations are version-controlled PHP classes that allow you to programmatically and reliably evolve your database schema over time. They are the foundation of safe, collaborative, and automated database deployments.

## Why You Absolutely Need Migrations

-   **Safety**: Migrations prevent accidental data loss. You can review the generated SQL before it ever touches your production database.
-   **Version Control**: Migration files are stored in your project's Git repository. This means your schema changes are tracked right alongside your code changes.
-   **Teamwork**: When a team member pulls the latest code, they can simply run the migrations to bring their local database schema up to date. No more passing around `.sql` files.
-   **Automation**: Migrations are essential for automated CI/CD pipelines. Deploying your application can automatically include running the necessary database migrations.
-   **Rollbacks**: Every migration includes a `down()` method, allowing you to revert a schema change if something goes wrong.

## The Core Workflow

The migration process follows a simple, repeatable pattern.

#### Step 1: Change Your Entities
First, make the desired changes to your PHP entity classes. For example, let's add a `biography` field to our `User` entity.

```php
#[ORM\Entity]
class User
{
    // ...
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $biography = null;
    
    // ... getter and setter
}
```

#### Step 2: Generate a Migration (`diff`)
Next, ask Doctrine to compare your updated entity metadata with the current state of the database. The `migrations:diff` command will generate a new migration file containing the necessary SQL.

```bash
php vendor/bin/doctrine-migrations diff
```

This will create a new file in your migrations directory, for example `migrations/Version20231027100000.php`.

```php
// migrations/Version20231027100000.php
<?php
declare(strict_types=1);
namespace App\Migrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20231027100000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add biography field to the User entity';
    }

    public function up(Schema $schema): void
    {
        // this up() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE user ADD biography TEXT DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        // this down() migration is auto-generated, please modify it to your needs
        $this->addSql('ALTER TABLE user DROP biography');
    }
}
```
!!! tip "Always Review Generated Migrations"
    The `diff` command is powerful, but not perfect. It cannot, for example, detect a column rename. It would see that as `DROP old_column` and `ADD new_column`, which would cause data loss. **Always review the generated SQL** and edit it if necessary to preserve data (e.g., by changing a `DROP`/`ADD` to a `RENAME COLUMN` statement).

#### Step 3: Run the Migration (`migrate`)
Once you have reviewed and are happy with the migration file, you can apply it to your database.

```bash
php vendor/bin/doctrine-migrations migrate
```

This command will look for any migration versions that have not yet been executed, run their `up()` methods in order, and record their execution in a `doctrine_migration_versions` table in your database.

You will be asked for confirmation. For automated deployments, you can skip this:
```bash
php vendor/bin/doctrine-migrations migrate --no-interaction
```

!!! warning "Transactional Migrations"
    By default, Doctrine Migrations will wrap each migration version in a single database transaction. This means that if any statement in your `up()` or `down()` method fails, the entire migration will be rolled back, leaving your schema in a clean state. However, some database vendors (like MySQL) do not support transactional DDL statements (`ALTER TABLE`, etc.). In these cases, a failed migration may leave your schema in a partially migrated state that requires manual intervention.

## Advanced Migration Techniques

### Data Migrations: Changing Data, Not Just Schema
Sometimes you need to change existing data as part of a migration. For example, if you are changing a `status` from an integer to a string, you need to update the existing rows.

You can add any SQL you need to the `up()` method. Doctrine migrations guarantee that all statements within a single migration file are executed within the same transaction.

```php
public function up(Schema $schema): void
{
    // 1. Add the new column with a temporary default
    $this->addSql('ALTER TABLE user ADD status_string VARCHAR(255) NOT NULL DEFAULT "active"');
    
    // 2. Update the new column based on the old one
    $this->addSql("UPDATE user SET status_string = 'inactive' WHERE status = 0");
    $this->addSql("UPDATE user SET status_string = 'pending' WHERE status = 1");
    
    // 3. Drop the old column
    $this->addSql('ALTER TABLE user DROP status');

    // 4. Rename the new column
    $this->addSql('ALTER TABLE user RENAME COLUMN status_string TO status');
}
```
This ensures your data is safely transformed during the schema change.

### Zero-Downtime Deployments

In a high-availability environment, you cannot simply run a migration that introduces a breaking schema change. The "old" version of your code will stop working as soon as the database is changed.

Migrations are a key tool for enabling zero-downtime deployments. The process typically involves multiple, smaller migrations:

1.  **Migration 1 (Non-Breaking)**: Add the new column/table (`is_active` boolean), but don't use it in the code yet. Deploy this change. The old code continues to work.
2.  **Deploy New Code**: Deploy the new version of your application code that reads from the new `is_active` column and writes to *both* the old `status` column and the new `is_active` column.
3.  **Migration 2 (Data Migration)**: Run a migration to backfill the `is_active` column for all existing rows based on the old `status` column.
4.  **Deploy Final Code**: Deploy a new version of the code that *only* uses the new `is_active` column.
5.  **Migration 3 (Cleanup)**: Run a final migration to drop the old `status` column.

This multi-step process ensures that at no point is there a mismatch between the running code and the database schema.

### Conditionally Executing SQL
You can add checks within your migration to avoid errors. The `$this->connection` property gives you access to the DBAL connection.

```php
public function preUp(Schema $schema): void
{
    // Check if the table exists before trying to modify it
    $tableExists = $this->connection->executeQuery(
        "SHOW TABLES LIKE 'old_feature_table'"
    )->fetchOne();

    if (!$tableExists) {
        $this->skipIf(true, "The 'old_feature_table' does not exist, skipping.");
    }
}

public function up(Schema $schema): void
{
    // This will only run if preUp did not skip the migration
    $this->addSql('DROP TABLE old_feature_table');
}
```
The `preUp`, `postUp`, `preDown`, and `postDown` hooks allow you to run logic before and after the main migration logic.

### Dependency Injection
In modern frameworks, your migration classes can often be treated as services, allowing you to inject other services. This is useful if you need to, for example, calculate a value using a service from your application and persist it during a data migration.

```php
// services.yaml (Symfony example)
services:
    App\Migrations\:
        resource: '../migrations/*'
        tags: ['doctrine.migrations.migration']

// Your migration class
final class Version20231027120000 extends AbstractMigration
{
    public function __construct(private readonly UserNormalizer $userNormalizer) {}

    public function up(Schema $schema): void 
    {
        $users = $this->connection->fetchAllAssociative('SELECT id, name FROM user');
        foreach ($users as $user) {
            $normalizedName = $this->userNormalizer->normalize($user['name']);
            $this->addSql(
                'UPDATE user SET normalized_name = ? WHERE id = ?',
                [$normalizedName, $user['id']],
                [\PDO::PARAM_STR, \PDO::PARAM_INT] // <-- Explicitly set parameter types
            );
        }
    }
    // ...
}
```
For `addSql`, it's a best practice to provide the parameter types as the third argument to ensure proper binding and prevent potential SQL injection issues, especially when the values are not hardcoded.

## Managing Migrations in a Team

-   **`status`**: Check which migrations are available, new, or already migrated.
    `php vendor/bin/doctrine-migrations status`
-   **`list`**: Get a simple list of all migrations and their status.
    `php vendor/bin/doctrine-migrations list`
-   **`up-to-date`**: Check if the database is fully up-to-date. Returns a non-zero exit code if migrations are pending. Perfect for CI checks.
    `php vendor/bin/doctrine-migrations up-to-date`
-   **Rollbacks**: You can revert migrations one by one.
    `php vendor/bin/doctrine-migrations migrate prev` (reverts the last one)
    `php vendor/bin/doctrine-migrations migrate 'Version20231027100000' --down` (reverts a specific version)

By integrating migrations into your workflow, you create a robust and reliable process for managing your application's most critical asset: its data structure.

## Next Steps
- **[Transactions and Concurrency](transactions.md)**: Understand how Doctrine handles transactions and locking.
- **[Testing with a Real Database](testing.md)**: Learn how to use migrations to set up and tear down a test database.

