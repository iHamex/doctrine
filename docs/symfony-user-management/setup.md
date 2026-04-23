# Setup: Symfony + Doctrine from scratch

This page bootstraps a fresh Symfony 7.x project with Doctrine ORM 3.x and common bundles used in CRUD apps. Follow each step in order to create a working foundation for the User Management application.

## Create the project

Start by creating a new Symfony project using the webapp template, which includes all essential bundles:

```bash
symfony new usermgmt --webapp
cd usermgmt
```

**Explanation:** The `--webapp` template automatically installs:

- **Form Component**: For building and handling HTML forms
- **Twig**: Template engine for views
- **Security Component**: Authentication and authorization
- **Doctrine ORM**: Database abstraction layer
- **Validator**: Input validation
- **Other essentials**: HTTP foundation, routing, etc.

This saves time compared to manually installing each bundle.

## Ensure packages are present

Install additional development and production tools:

```bash
composer require symfony/maker-bundle --dev
composer require doctrine/doctrine-migrations-bundle
```

**Explanation:**

- **MakerBundle** (`--dev`): Provides `make:*` commands to generate boilerplate code (entities, controllers, forms, etc.). It's a development tool that speeds up scaffolding.
- **Doctrine Migrations Bundle**: Manages database schema changes through version-controlled migration files. Essential for tracking and applying database changes across environments.

!!! tip "MakerBundle is your accelerator"
    Use `make:*` commands to generate boilerplate quickly, then refine generated files to match your architecture. For example:
    
    - `make:entity` - Creates entity classes with attributes

    - `make:controller` - Generates controller skeletons

    - `make:form` - Creates form type classes

    - `make:user` - Sets up user authentication entities

## Configure database

Create a `.env.local` file in your project root (this file is gitignored and won't be committed):

```dotenv
DATABASE_URL="postgresql://app:app@127.0.0.1:5432/usermgmt?serverVersion=16&charset=utf8"
```

**For MySQL users:**

```dotenv
DATABASE_URL="mysql://app:app@127.0.0.1:3306/usermgmt?charset=utf8mb4"
```

**Explanation of the DSN format:**

- `postgresql://` or `mysql://` - Database driver
- `app:app` - Username:Password (change these to your actual database credentials)
- `127.0.0.1:5432` - Host:Port (5432 is PostgreSQL default, 3306 is MySQL default)
- `usermgmt` - Database name (will be created automatically)
- `serverVersion=16` - PostgreSQL version (adjust for your version)
- `charset=utf8` or `charset=utf8mb4` - Character encoding

!!! warning "Keep credentials out of `.env`"
    Never commit real credentials. The `.env` file is tracked by git, but `.env.local` is gitignored. Use `.env.local` for local overrides and environment variables in production. In production, set `DATABASE_URL` as an environment variable directly.

## Verify Doctrine configuration

Check that `config/packages/doctrine.yaml` exists and contains:

```yaml
doctrine:
  dbal:
    url: '%env(resolve:DATABASE_URL)%'
  orm:
    auto_generate_proxy_classes: true
    enable_lazy_ghost_objects: true
    mappings:
      App:
        is_bundle: false
        type: attribute
        dir: '%kernel.project_dir%/src/Entity'
        prefix: 'App\\Entity'
```

**Explanation of each setting:**

- `url: '%env(resolve:DATABASE_URL)%'` - Reads the database URL from environment variables (`.env.local`)
- `auto_generate_proxy_classes: true` - Doctrine generates proxy classes automatically (useful in development)
- `enable_lazy_ghost_objects: true` - Uses lazy loading for better performance (Doctrine 3.x feature)
- `type: attribute` - Uses PHP 8 attributes for entity mapping (modern approach, better IDE support)
- `dir: '%kernel.project_dir%/src/Entity'` - Where to find entity classes
- `prefix: 'App\\Entity'` - Namespace prefix for entities

These defaults are perfect for this guide. No changes needed unless you have specific requirements.

## Run the server

Start the Symfony development server:

```bash
symfony server:start -d
open https://127.0.0.1:8000
```

**Explanation:**

- `symfony server:start -d` - Starts the server in detached mode (runs in background)
- The server automatically detects your project and uses the correct PHP version
- Access your application at `https://127.0.0.1:8000` (or the port shown in terminal)

You should see the Symfony welcome page. If you see errors, check that PHP 8.2+ is installed and all dependencies are installed (`composer install`).

## Initialize database and migrations

**Important:** At this stage, we're only creating an empty database. The actual `users` table will be created after we define the User entity in the next chapter.

Create the database and set up migrations:

```bash
php bin/console doctrine:database:create
php bin/console make:migration
php bin/console doctrine:migrations:migrate -n
```

**Step-by-step explanation:**

1. `doctrine:database:create` - Creates the database specified in `DATABASE_URL` if it doesn't exist
   - Database name: `usermgmt` (from your DATABASE_URL)
   - Creates empty database (no tables yet)
   
2. `make:migration` - Generates a migration file (even if empty, this creates the migrations table structure)
   - Creates `migrations/Version[Timestamp].php` file
   - If no entities exist yet, migration will be empty (just creates migration tracking table)
   - This establishes the migration system
   
3. `doctrine:migrations:migrate -n` - Applies all pending migrations (`-n` means "no interaction", answers yes automatically)
   - Creates `doctrine_migration_versions` table (tracks which migrations ran)
   - If migration is empty, no other tables are created yet

!!! note "Why migrations early?"
    Creating a baseline migration up front ensures a clean history and repeatability across environments. Even if the first migration is empty, it establishes the migration tracking system. This is crucial for:
    - **Version control**: Track all database changes
    - **Team collaboration**: Everyone applies the same migrations
    - **Deployment**: Production databases can be updated safely
    - **Rollback**: Can revert changes if needed

!!! tip "Database Creation Process"
    **Current step (Setup):**
    - Database `usermgmt` is created (empty)
    - Migration system is initialized
    
    **Next step (Entity & Mapping):**
    - User entity is created
    - Migration generates `CREATE TABLE users` SQL
    - Migration is applied, creating the `users` table with all columns
    
    **You'll know it's working when:**
    - After creating User entity and running `make:migration`, you'll see SQL like `CREATE TABLE users`
    - After `doctrine:migrations:migrate`, the `users` table exists in your database

## Quality of life settings

For development, ensure these settings in `.env.local`:

```dotenv
APP_ENV=dev
APP_DEBUG=1
```

**Explanation:**
- `APP_ENV=dev` - Sets the environment to development (enables debug toolbar, detailed error pages)
- `APP_DEBUG=1` - Shows detailed error messages and stack traces (NEVER enable in production)

**Additional tips:**
- Error pages are enabled by default in dev mode
- Logs are written to `var/log/dev.log` - check here for detailed error information
- The Symfony profiler toolbar appears at the bottom of pages in dev mode (shows queries, performance, etc.)

## Verify installation

Test that everything works:

```bash
php bin/console list doctrine
```

You should see a list of Doctrine commands. If you see errors, verify:
- PHP version is 8.2 or higher: `php -v`
- Composer dependencies are installed: `composer install`
- Database server is running and credentials are correct

## Next steps

Now that your project is set up, proceed to:
1. **Entity & Mapping** - Create the User entity with Doctrine attributes
2. **Repository & Queries** - Build query methods for user management
3. **Controllers & Routes** - Implement CRUD endpoints

Your foundation is ready!


