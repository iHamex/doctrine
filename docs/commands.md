# Doctrine Console Commands: A Practical Guide

The Doctrine command-line interface (CLI) is an essential tool for managing your database schema, running migrations, debugging, and performing other common tasks. This guide provides a practical overview of the most important commands, organized by their typical workflow.

!!! tip "Standalone vs. Framework"

    The exact command names and availability may vary slightly depending on your setup.

    - **Symfony**: Commands are typically prefixed with `bin/console doctrine:`.
    - **Standalone Doctrine**: You will have a `vendor/bin/doctrine` executable.
    The functionality described here is largely the same across environments.

## The Development Workflow: From Entities to a Working Schema

These commands are your day-to-day tools for building and evolving your application.

#### `orm:validate-schema`

**What it does**: This is your first line of defense. It validates your entity mapping metadata for correctness and checks if your database schema is synchronized with your entities.

**When to use it**: Run this frequently during development to catch errors early. It's also a great command to have in your CI/CD pipeline.

```bash
# Validate everything
php vendor/bin/doctrine orm:validate-schema

# Output on success:
# [OK] The mapping files are correct.
# [OK] The database schema is in sync with the mapping files.
```

#### `migrations:diff`

**What it does**: The powerhouse of the migrations workflow. It compares your current entity mappings against the live database schema and generates a new migration file containing the SQL needed to synchronize them.

**When to use it**: After you make any changes to your entities (add a property, change a type, add a relationship, etc.).

```bash
# Generate a new migration file
php vendor/bin/doctrine-migrations diff
```

#### `migrations:migrate`

**What it does**: Executes all available, un-migrated migration files. This applies the schema changes to your database.

**When to use it**: After generating a migration and verifying its contents. This is the command you run to update your local database and during application deployment.

```bash
# Execute pending migrations (will ask for confirmation)
php vendor/bin/doctrine-migrations migrate

# Execute without interactive confirmation
php vendor/bin/doctrine-migrations migrate --no-interaction
```

## Managing Migrations

A healthy migration workflow is crucial for team collaboration and safe deployments.

#### `migrations:status`

**What it does**: Gives a summary of your migration status, including the number of executed, available, and new migrations.

**When to use it**: To get a quick overview of the state of your database schema.

```bash
php vendor/bin/doctrine-migrations status
```

#### `migrations:list`

**What it does**: Provides a detailed list of every migration, showing whether it has been migrated and when.

**When to use it**: To see the exact history of schema changes.

```bash
php vendor/bin/doctrine-migrations list
```

#### `migrations:execute`

**What it does**: Allows you to run (or revert) a single, specific migration.

**When to use it**: For manual rollbacks or for re-running a failed migration after fixing it. Use with caution.

```bash
# Manually apply a single migration
php vendor/bin/doctrine-migrations execute 'App\Migrations\Version20231027100000' --up

# Manually revert a single migration
php vendor/bin/doctrine-migrations execute 'App\Migrations\Version20231027100000' --down
```

## Querying and Debugging

These commands help you inspect your database and understand what Doctrine is doing under the hood.

#### `dbal:run-sql`

**What it does**: Executes a raw SQL query directly against your database connection and displays the results.

**When to use it**: For quick, read-only checks of your data. A great tool for debugging without needing a separate database client.

```bash
php vendor/bin/doctrine dbal:run-sql "SELECT id, email FROM user WHERE status = 'active' LIMIT 5"
```
!!! warning "Use for Read-Only Queries"
    Be extremely careful running `UPDATE` or `DELETE` statements with this command, especially in production. There is no confirmation step.

#### `orm:mapping:info`

**What it does**: Dumps all the metadata Doctrine has parsed for your entities.

**When to use it**: To verify that Doctrine understands your entities, fields, and associations correctly.

```bash
# See all mapped entities
php vendor/bin/doctrine orm:mapping:info
```

#### `orm:query`

**What it does**: Executes a DQL query and shows you the results, and optionally the generated SQL.

**When to use it**: For testing DQL queries and understanding how they translate to SQL.

```bash
php vendor/bin/doctrine orm:query "SELECT u.id, u.name FROM App\Entity\User u WHERE u.id = 1" --show-sql
```

## Managing Caches (Production)

In a production environment, Doctrine uses caches for metadata, queries, and results to maximize performance. You must clear these caches after deploying code that changes entity mappings.

#### `orm:clear-cache:metadata`

**What it does**: Clears the metadata cache.

**When to use it**: **Required** during deployment if you have changed anything about your entity mappings.

```bash
php vendor/bin/doctrine orm:clear-cache:metadata
```

#### `orm:clear-cache:query` and `orm:clear-cache:result`

**What it does**: Clears the query and result caches.

**When to use it**: During deployment, or to manually force Doctrine to re-run queries against the database instead of using cached results.

```bash
php vendor/bin/doctrine orm:clear-cache:query
php vendor/bin/doctrine orm:clear-cache:result
```

## Dangerous Commands: For Development and Testing Only

These commands are part of the `orm:schema-tool` and are extremely dangerous because they can instantly delete data. **Never run them in production.**

#### `orm:schema-tool:create`

**What it does**: Creates the database schema from your entities. It will **DROP** any existing tables first.

**When to use it**: When first setting up a local development database, or in an automated test suite to create a fresh schema for each test run.

```bash
# DANGER: Drops existing tables and creates the schema
php vendor/bin/doctrine orm:schema-tool:create
```

#### `orm:schema-tool:drop`

**What it does**: Drops the entire database schema for your entities.

**When to use it**: In automated tests to clean up the database after a test run.

```bash
# DANGER: Drops all tables and deletes all data
php vendor/bin/doctrine orm:schema-tool:drop --force
```

#### `orm:schema-tool:update`

**What it does**: A "lite" version of `migrations:diff`. It calculates the difference between your entities and the schema and applies it directly.

**Why it's dangerous**: It is not data-aware. Renaming a column will be interpreted as a `DROP` and `ADD`, deleting all data in that column. Always use migrations instead.

