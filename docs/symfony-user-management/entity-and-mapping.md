# Entity & Mapping: Designing `User`

We'll model a pragmatic `User` entity with unique email, hashed password, roles, status flags, and timestamps. This entity demonstrates Doctrine's attribute-based mapping, Symfony Security integration, and validation constraints.

## Generate scaffolding (optional)

You can use Symfony's MakerBundle to generate a basic User entity:

```bash
php bin/console make:user
# Choose: email as unique user identifier
# Persist user in the database (yes)
```

**Explanation:** This command generates:

- `src/Entity/User.php` - Basic user entity with security interfaces
- `src/Repository/UserRepository.php` - Repository class
- Security configuration updates

However, we'll build a complete entity from scratch below to understand every detail.

## Complete User Entity

Create `src/Entity/User.php` with the following complete implementation:

```php
<?php

namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;
use Symfony\Component\Validator\Constraints as Assert;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;

/**
 * User Entity
 * 
 * This entity represents a user in the system. It implements Symfony's security
 * interfaces to work with the authentication system, and uses Doctrine attributes
 * for database mapping.
 */
#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'users')]
#[ORM\UniqueConstraint(name: 'uniq_user_email', columns: ['email'])]
#[ORM\Index(name: 'idx_user_lastname', columns: ['last_name'])]
#[ORM\Index(name: 'idx_user_active', columns: ['is_active'])]
#[UniqueEntity(fields: ['email'], message: 'This email is already used.')]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    /**
     * Primary key - auto-incrementing integer
     * 
     * Doctrine will automatically generate this value when persisting a new entity.
     * The ?int type allows null before persistence.
     */
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    /**
     * Email address - unique identifier for authentication
     * 
     * Length 180 is required by Symfony Security for password hashing compatibility.
     * We normalize emails to lowercase in the setter to ensure consistency.
     */
    #[ORM\Column(length: 180)]
    #[Assert\NotBlank(message: 'Email is required.')]
    #[Assert\Email(message: 'Please enter a valid email address.')]
    private string $email = '';

    /**
     * User roles stored as JSON array
     * 
     * Stored as JSON in the database for flexibility. Every user automatically
     * gets ROLE_USER added in getRoles() method. Additional roles like ROLE_ADMIN
     * can be added for elevated permissions.
     */
    #[ORM\Column(type: 'json')]
    private array $roles = [];

    /**
     * Hashed password - never store plain text passwords
     * 
     * This field stores the bcrypt/argon2 hashed password. We never store or
     * retrieve plain passwords. The password is hashed in the controller using
     * UserPasswordHasherInterface before being set here.
     */
    #[ORM\Column]
    #[Assert\NotBlank(groups: ['create'], message: 'Password is required when creating a user.')]
    private string $password = '';

    /**
     * Plain password - transient field (NOT persisted to database)
     * 
     * This field exists ONLY for form binding and password hashing. It has NO
     * #[ORM\Column] attribute, so Doctrine ignores it completely. We use it to:
     * 1. Accept password input from forms
     * 2. Hash it using UserPasswordHasherInterface
     * 3. Store the hash in $password
     * 4. Clear this field immediately after hashing
     * 
     * This pattern prevents accidental exposure of plain passwords.
     */
    #[Assert\Length(min: 8, minMessage: 'Password must be at least 8 characters.', groups: ['create'])]
    private ?string $plainPassword = null;

    /**
     * User's first name
     */
    #[ORM\Column(length: 80)]
    #[Assert\NotBlank(message: 'First name is required.')]
    #[Assert\Length(max: 80, maxMessage: 'First name cannot exceed 80 characters.')]
    private string $firstName = '';

    /**
     * User's last name
     */
    #[ORM\Column(length: 80)]
    #[Assert\NotBlank(message: 'Last name is required.')]
    #[Assert\Length(max: 80, maxMessage: 'Last name cannot exceed 80 characters.')]
    private string $lastName = '';

    /**
     * Active status flag
     * 
     * Allows soft-deactivation of users without deleting them. Useful for
     * maintaining referential integrity and audit trails.
     */
    #[ORM\Column(options: ['default' => true])]
    private bool $isActive = true;

    /**
     * Creation timestamp
     * 
     * Using DateTimeImmutable prevents accidental modification. Set automatically
     * in constructor and never changed afterward.
     */
    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $createdAt;

    /**
     * Last update timestamp
     * 
     * Updated automatically via lifecycle events or manually via touch() method.
     * Using DateTimeImmutable ensures immutability.
     */
    #[ORM\Column(type: 'datetime_immutable')]
    private \DateTimeImmutable $updatedAt;

    /**
     * Constructor - initializes timestamps
     * 
     * Sets both createdAt and updatedAt to current time when entity is created.
     * This ensures we always have a creation timestamp even if lifecycle events
     * aren't configured.
     */
    public function __construct()
    {
        $now = new \DateTimeImmutable('now');
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    // ============================================
    // ID Methods
    // ============================================

    public function getId(): ?int
    {
        return $this->id;
    }

    // ============================================
    // Email Methods
    // ============================================

    public function getEmail(): string
    {
        return $this->email;
    }

    /**
     * Set email with automatic normalization
     * 
     * Converts email to lowercase to ensure consistency. This prevents issues
     * where "User@Example.com" and "user@example.com" would be treated as
     * different users.
     */
    public function setEmail(string $email): self
    {
        $this->email = strtolower($email);
        return $this;
    }

    // ============================================
    // Security Interface Methods (UserInterface)
    // ============================================

    /**
     * Returns the unique identifier for authentication
     * 
     * Required by UserInterface. Symfony Security uses this to identify users
     * during authentication. We use email as the identifier.
     */
    public function getUserIdentifier(): string
    {
        return $this->email;
    }

    /**
     * Returns user roles with ROLE_USER always included
     * 
     * Required by UserInterface. Every user automatically gets ROLE_USER.
     * Additional roles are stored in the database and merged here.
     * array_values() re-indexes the array, array_unique() removes duplicates.
     */
    public function getRoles(): array
    {
        return array_values(array_unique([...$this->roles, 'ROLE_USER']));
    }

    /**
     * Set user roles
     * 
     * Stores roles in the database. ROLE_USER is automatically added in getRoles(),
     * so don't include it here.
     */
    public function setRoles(array $roles): self
    {
        $this->roles = $roles;
        return $this;
    }

    /**
     * Returns the hashed password
     * 
     * Required by PasswordAuthenticatedUserInterface. Returns the bcrypt/argon2
     * hash stored in the database.
     */
    public function getPassword(): string
    {
        return $this->password;
    }

    /**
     * Set the hashed password
     * 
     * This should ONLY receive already-hashed passwords from UserPasswordHasherInterface.
     * Never set a plain password here directly.
     */
    public function setPassword(string $hashed): self
    {
        $this->password = $hashed;
        return $this;
    }

    /**
     * Erase sensitive credentials from memory
     * 
     * Required by UserInterface. Called by Symfony Security after authentication
     * to clear any sensitive data (like plain passwords) from memory.
     */
    public function eraseCredentials(): void
    {
        // Clear plain password if it exists
        $this->plainPassword = null;
    }

    // ============================================
    // Plain Password Methods (Transient)
    // ============================================

    /**
     * Get plain password (for form binding only)
     * 
     * This is used by forms to bind password input. After hashing, this should
     * be cleared. This field is NOT persisted to the database.
     */
    public function getPlainPassword(): ?string
    {
        return $this->plainPassword;
    }

    /**
     * Set plain password (for form binding only)
     * 
     * Used by forms to accept password input. The controller will hash this
     * and store it in $password, then clear this field.
     */
    public function setPlainPassword(?string $plain): self
    {
        $this->plainPassword = $plain;
        return $this;
    }

    // ============================================
    // Name Methods
    // ============================================

    public function getFirstName(): string
    {
        return $this->firstName;
    }

    public function setFirstName(string $firstName): self
    {
        $this->firstName = $firstName;
        return $this;
    }

    public function getLastName(): string
    {
        return $this->lastName;
    }

    public function setLastName(string $lastName): self
    {
        $this->lastName = $lastName;
        return $this;
    }

    /**
     * Get full name as a convenience method
     */
    public function getFullName(): string
    {
        return trim($this->firstName . ' ' . $this->lastName);
    }

    // ============================================
    // Status Methods
    // ============================================

    public function isActive(): bool
    {
        return $this->isActive;
    }

    public function setIsActive(bool $active): self
    {
        $this->isActive = $active;
        return $this;
    }

    // ============================================
    // Timestamp Methods
    // ============================================

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): \DateTimeImmutable
    {
        return $this->updatedAt;
    }

    /**
     * Update the updatedAt timestamp
     * 
     * Call this method whenever the entity is modified to track when changes
     * occurred. Can be called manually or via Doctrine lifecycle events.
     */
    public function touch(): void
    {
        $this->updatedAt = new \DateTimeImmutable('now');
    }
}
```

## Understanding the Entity Attributes

Let's break down each Doctrine and validation attribute:

### Class-Level Attributes

```php
#[ORM\Entity(repositoryClass: UserRepository::class)]
```
**Why:** Tells Doctrine this is an entity and which repository class to use. The repository provides custom query methods.

```php
#[ORM\Table(name: 'users')]
```
**Why:** Explicitly sets the database table name. Without this, Doctrine would use `user` (singular), which might conflict with reserved keywords in some databases.

```php
#[ORM\UniqueConstraint(name: 'uniq_user_email', columns: ['email'])]
```
**Why:** Creates a database-level unique constraint on the email column. This prevents duplicate emails even if application-level validation is bypassed. Defense in depth.

```php
#[ORM\Index(name: 'idx_user_lastname', columns: ['last_name'])]
#[ORM\Index(name: 'idx_user_active', columns: ['is_active'])]
```
**Why:** Creates database indexes on frequently queried columns. Indexes dramatically speed up WHERE clauses and sorting operations. We index `last_name` for search functionality and `is_active` for filtering active/inactive users.

```php
#[UniqueEntity(fields: ['email'], message: 'This email is already used.')]
```
**Why:** Adds application-level validation. This works with Symfony's Validator component to check uniqueness BEFORE attempting database insert. Provides user-friendly error messages.

### Property-Level Attributes

```php
#[ORM\Id]
#[ORM\GeneratedValue]
#[ORM\Column]
```
**Why:** 

- `Id` - Marks this as the primary key

- `GeneratedValue` - Database auto-generates the value (AUTO_INCREMENT)

- `Column` - Maps to a database column (defaults to integer type)

```php
#[ORM\Column(length: 180)]
```
**Why:** Sets VARCHAR(180) in database. Length 180 is required by Symfony Security for password hashing compatibility (even though this is email, it's a Symfony convention).

```php
#[ORM\Column(type: 'json')]
```
**Why:** Stores the roles array as JSON in the database. More flexible than a separate roles table for simple use cases. Doctrine automatically serializes/deserializes.

```php
#[ORM\Column(options: ['default' => true])]
```
**Why:** Sets a database default value. New users will be active by default even if not explicitly set.

```php
#[ORM\Column(type: 'datetime_immutable')]
```
**Why:** Uses `DateTimeImmutable` instead of `DateTime`. Immutable objects prevent accidental modification and are safer in concurrent environments.

### Validation Attributes

```php
#[Assert\NotBlank]
```
**Why:** Ensures the field is not empty. Works with Symfony Forms to show validation errors.

```php
#[Assert\Email]
```
**Why:** Validates email format using PHP's filter_var() internally.

```php
#[Assert\Length(min: 8, groups: ['create'])]
```
**Why:** 

- `min: 8` - Password must be at least 8 characters

- `groups: ['create']` - Only validates when the 'create' validation group is used. This allows optional passwords during edit operations.

## Security Interfaces Explained

The User entity implements two Symfony Security interfaces:

### UserInterface

**Why:** Required for all user entities in Symfony Security. Provides:

- `getUserIdentifier()` - Unique identifier (email)
- `getRoles()` - User's roles array
- `eraseCredentials()` - Clear sensitive data

### PasswordAuthenticatedUserInterface

**Why:** Extends UserInterface and adds password support:

- `getPassword()` - Returns the hashed password

These interfaces allow Symfony Security to authenticate users without knowing the specific User class structure.

## Repository Class

The repository is automatically created by MakerBundle or you can create it manually:

```php
<?php
namespace App\Repository;

use App\Entity\User;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

class UserRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, User::class);
    }
}
```

**Explanation:** This base repository provides standard methods like `find()`, `findAll()`, `findBy()`, etc. We'll add custom query methods in the next section.

## Complete Database Schema

After creating the entity and running migrations, your database will have the following structure:

### Users Table Structure

The `users` table will be created with the following columns, indexes, and constraints:

**Table: `users`**

| Column Name | Type | Nullable | Default | Description |
|------------|------|----------|---------|-------------|
| `id` | INTEGER | NO | AUTO_INCREMENT | Primary key |
| `email` | VARCHAR(180) | NO | - | Unique email address (lowercase) |
| `roles` | JSON | NO | `[]` | User roles array (stored as JSON) |
| `password` | VARCHAR(255) | NO | - | Hashed password (bcrypt/argon2) |
| `first_name` | VARCHAR(80) | NO | - | User's first name |
| `last_name` | VARCHAR(80) | NO | - | User's last name |
| `is_active` | BOOLEAN | NO | `true` | Active status flag |
| `created_at` | TIMESTAMP | NO | - | Creation timestamp |
| `updated_at` | TIMESTAMP | NO | - | Last update timestamp |

**Indexes:**

- `PRIMARY KEY` on `id`
- `UNIQUE INDEX` `uniq_user_email` on `email`
- `INDEX` `idx_user_lastname` on `last_name`
- `INDEX` `idx_user_active` on `is_active`

**Constraints:**

- `UNIQUE CONSTRAINT` on `email` (database-level)
- `NOT NULL` on all columns except those explicitly nullable

### Example Generated Migration

When you run `make:migration`, Doctrine will generate a migration file similar to this:

```php
<?php

namespace Doctrine\Migrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20240101000000 extends AbstractMigration
{
    public function up(Schema $schema): void
    {
        // Create users table
        $this->addSql('CREATE TABLE users (
            id INT AUTO_INCREMENT NOT NULL,
            email VARCHAR(180) NOT NULL,
            roles JSON NOT NULL,
            password VARCHAR(255) NOT NULL,
            first_name VARCHAR(80) NOT NULL,
            last_name VARCHAR(80) NOT NULL,
            is_active TINYINT(1) DEFAULT 1 NOT NULL,
            created_at DATETIME IMMUTABLE NOT NULL,
            updated_at DATETIME IMMUTABLE NOT NULL,
            PRIMARY KEY(id),
            UNIQUE INDEX uniq_user_email (email),
            INDEX idx_user_lastname (last_name),
            INDEX idx_user_active (is_active)
        ) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE users');
    }
}
```

**For PostgreSQL**, the migration would look like:

```php
public function up(Schema $schema): void
{
    $this->addSql('CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(180) NOT NULL,
        roles JSON NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(80) NOT NULL,
        last_name VARCHAR(80) NOT NULL,
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
        updated_at TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL,
        CONSTRAINT uniq_user_email UNIQUE (email)
    )');
    
    $this->addSql('CREATE INDEX idx_user_lastname ON users (last_name)');
    $this->addSql('CREATE INDEX idx_user_active ON users (is_active)');
}
```

**Note:** Doctrine automatically generates the correct SQL for your database platform (MySQL, PostgreSQL, SQLite, etc.).

### Column Mapping Reference

Here's how entity properties map to database columns:

| Entity Property | Database Column | Doctrine Type | PHP Type |
|----------------|-----------------|---------------|----------|
| `$id` | `id` | `integer` | `?int` |
| `$email` | `email` | `string` (VARCHAR 180) | `string` |
| `$roles` | `roles` | `json` | `array` |
| `$password` | `password` | `string` (VARCHAR 255) | `string` |
| `$plainPassword` | *(none)* | *(not mapped)* | `?string` |
| `$firstName` | `first_name` | `string` (VARCHAR 80) | `string` |
| `$lastName` | `last_name` | `string` (VARCHAR 80) | `string` |
| `$isActive` | `is_active` | `boolean` | `bool` |
| `$createdAt` | `created_at` | `datetime_immutable` | `DateTimeImmutable` |
| `$updatedAt` | `updated_at` | `datetime_immutable` | `DateTimeImmutable` |

**Important notes:**

- Doctrine automatically converts camelCase property names to snake_case column names (`firstName` → `first_name`)
- `plainPassword` has NO database column (transient field)
- `roles` is stored as JSON and automatically serialized/deserialized
- Timestamps use `datetime_immutable` type for safety

## Create and Run the Migration

Generate and apply the migration to create the database table:

```bash
php bin/console make:migration
php bin/console doctrine:migrations:migrate -n
```

**Step-by-step process:**

1. **Create the entity file** (`src/Entity/User.php`) with the complete code above

2. **Generate migration:**
   ```bash
   php bin/console make:migration
   ```

   - Doctrine analyzes your entity
   - Compares with current database schema
   - Generates migration file in `migrations/Version[Timestamp].php`
   - File contains SQL to create/modify tables

3. **Review the migration** (important!):
   ```bash
   # Open the generated file
   cat migrations/Version*.php
   ```

   - Verify it creates the `users` table
   - Check all columns are present
   - Verify indexes and constraints

4. **Apply the migration:**
   ```bash
   php bin/console doctrine:migrations:migrate -n
   ```

   - Executes the SQL in the migration
   - Creates the `users` table
   - Creates all indexes and constraints
   - Records migration in `doctrine_migration_versions` table

5. **Verify the migration:**
   ```bash
   php bin/console doctrine:migrations:status
   ```

   - Shows which migrations have been executed
   - Should show your migration as executed

6. **Verify the table** (optional):
   ```bash
   # PostgreSQL
   psql -U app -d usermgmt -c "\d users"
   
   # MySQL
   mysql -u app -p usermgmt -e "DESCRIBE users;"
   ```

**What happens:**

1. `make:migration` - Analyzes your entity and generates a migration file in `migrations/Version[Timestamp].php`
2. `doctrine:migrations:migrate` - Applies the migration, creating the `users` table with all columns, indexes, and constraints

**Verify the migration:**
```bash
php bin/console doctrine:migrations:status
```

You should see the migration as executed.

!!! tip "Review generated migrations"
    Always review the generated migration file before applying it. Doctrine is smart, but you should verify it matches your expectations, especially for production databases.

!!! warning "Validation vs. Database Constraints"

    We use BOTH validation (application-level) and database constraints (database-level):

    - **Validation** (`UniqueEntity`, `Assert\Email`) - Prevents bad input, provides user-friendly errors

    - **Database constraints** (`UniqueConstraint`) - Protects data integrity even if validation is bypassed
    
    This is defense in depth - multiple layers of protection.

!!! tip "Consider UUID/ULID identifiers"

    For distributed systems or privacy concerns, consider using UUID/ULID instead of auto-incrementing integers:

    - **UUID**: Universally unique, but longer and not sequential

    - **ULID**: Sortable, URL-safe, shorter than UUID
    
    Doctrine DBAL provides `uuid`/`ulid` types, and Symfony UID component integrates well. For this tutorial, we use integers for simplicity.

## Next Steps

Now that your User entity is complete:

1. **Repository & Queries** - Add custom query methods for searching, filtering, and pagination
2. **Forms & Validation** - Create forms that bind to this entity
3. **Controllers** - Build CRUD endpoints that use the entity

Your User entity is ready to use!


