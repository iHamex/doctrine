# Managing the Database Schema

Doctrine provides a powerful set of tools for managing your database schema directly from your entity mapping metadata. This "schema-in-code" approach allows you to define your database structure in PHP and synchronize it with the actual database.

While incredibly useful for development and testing, these tools must be used with caution in production. For production environments, a dedicated migration strategy is always recommended.

## The `SchemaTool`: Your Direct Line to the Database

The `SchemaTool` is the primary class for interacting with the database schema. It can create, update, and drop tables based on your entity metadata.

You can access it directly from the `EntityManager`.

```php
use Doctrine\ORM\Tools\SchemaTool;

$schemaTool = new SchemaTool($entityManager);
$allMetadata = $entityManager->getMetadataFactory()->getAllMetadata();
```

### Creating the Schema from Scratch
This is perfect for setting up a database for the first time, especially in development or testing environments. The `createSchema()` method will generate and execute all the necessary `CREATE TABLE`, `CREATE INDEX`, and `ALTER TABLE ... ADD FOREIGN KEY` statements.

```php
// Generates and executes the SQL to create your database schema
$schemaTool->createSchema($allMetadata);
```

!!! tip "Getting the SQL without Executing"
    If you want to see the SQL that `createSchema` would execute without actually running it, you can use the `getSchemaFromMetadata` and `getCreateSchemaSql` methods.
    ```php
    $schema = $schemaTool->getSchemaFromMetadata($allMetadata);
    $sql = $schema->toSql($entityManager->getConnection()->getDatabasePlatform());
    // $sql is now an array of all the CREATE TABLE statements.
    ```

!!! warning "This is a Destructive Operation"
    `createSchema()` will first check for the existence of the tables it's about to create. If they exist, it will **drop them** before recreating them. This means **all data will be lost**. Never run this on a production database with existing data.

### Updating the Schema
As you develop your application, you will add, modify, and remove properties and associations on your entities. The `SchemaTool` can compare the current state of your mapping metadata with the live database schema and generate the SQL needed to bring the database up to date.

The `getUpdateSchemaSql()` method returns an array of SQL statements, but it does **not** execute them. This gives you a chance to review the changes before they are applied.

```php
// Get the SQL statements required to update the schema
$updateSql = $schemaTool->getUpdateSchemaSql($allMetadata);

if (empty($updateSql)) {
    echo "The database schema is already in sync with the mapping metadata.";
} else {
    echo "The following SQL statements will be executed:\n";
    foreach ($updateSql as $sql) {
        echo $sql . ";\n";
    }
    
    // In a development script, you might execute them like this:
    // foreach ($updateSql as $sql) {
    //     $entityManager->getConnection()->executeStatement($sql);
    // }
}
```
This is useful for rapid prototyping, but it has a major limitation: it is not "aware" of your data. If you rename a column, the `SchemaTool` will generate a `DROP COLUMN old_name` and an `ADD COLUMN new_name`, causing you to lose all data in that column.

### Dropping the Schema
The `dropSchema()` method is the reverse of `createSchema()`. It will drop all tables, sequences, and foreign keys associated with the provided metadata.

```php
// DANGER: This will drop all tables and delete all data.
$schemaTool->dropSchema($allMetadata);
```

A more extreme version is `dropDatabase()`, which will attempt to drop the entire database itself. Use this with extreme caution.

## Validating Schema and Mappings

Before performing any schema operations, it's a good practice to validate that your mapping metadata is correct and that it matches the database schema.

### `orm:validate-schema` CLI Command
The easiest way to do this is with the provided CLI command.

```bash
php vendor/bin/doctrine orm:schema-tool:validate
```
The old `orm:validate-schema` command is deprecated. Use `orm:schema-tool:validate`.

This command performs two checks:
1.  **Mapping File Validation**: It checks all your mapping attributes (`#[ORM\Column]`, `#[ORM\ManyToOne]`, etc.) for correctness. It will report any logical errors, like a `targetEntity` pointing to a non-existent class.
2.  **Schema Synchronization Check**: It compares your mapping metadata to the live database and reports any discrepancies (missing tables, extra columns, incorrect types, etc.).

A successful validation will output:
```
[OK] The mapping files are correct.
[OK] The database schema is in sync with the mapping files.
```

## The Production-Safe Approach: Doctrine Migrations

The `SchemaTool` is a powerful development tool, but it is **not safe for production use**. Renaming columns, changing types, or other modifications can lead to data loss.

The correct way to manage a production database schema is with **Doctrine Migrations**. Migrations provide a version-controlled, repeatable, and safe way to evolve your database schema over time.

Instead of applying changes directly, you generate a migration file.

```bash
# This command compares your entities with the DB and generates a new migration file
php vendor/bin/doctrine-migrations diff
```

This creates a PHP file containing the `up()` and `down()` SQL statements needed to apply or revert the schema change.

```php
// migrations/Version20231027083000.php
final class Version20231027083000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE user ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT false');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE user DROP COLUMN is_verified');
    }
}
```
You can then review, modify, and execute this migration.

```bash
php vendor/bin/doctrine-migrations migrate
```

### Summary: `SchemaTool` vs. Migrations

| Use Case | `SchemaTool` (`orm:schema-tool:*`) | `Migrations` (`migrations:*`) |
| --- | --- | --- |
| **Initial Setup (Dev/Test)** | **Excellent**. Fast way to build a database. | Good. Can be used but is slower. |
| **Updating Schema (Dev)** | **Good**. Quick for prototyping. | Good. More robust, but more steps. |
| **Updating Schema (Production)** | **DANGEROUS**. Do not use. High risk of data loss. | **ESSENTIAL**. The only safe way. |
| **Team Collaboration** | Bad. No version control. | **Excellent**. Changes are stored in Git. |
| **Rollbacks** | No. Can't undo changes. | **Excellent**. `down()` method allows for easy rollbacks. |

Always prefer **Doctrine Migrations** for any application that will be deployed to production.

## Next Steps
- **[Migrations](migrations.md)**: Dive deeper into the features and best practices of the Doctrine Migrations library.
- **[Filters](filters.md)**: Learn how to apply global filters to your queries, for example, to implement soft-deletes.

