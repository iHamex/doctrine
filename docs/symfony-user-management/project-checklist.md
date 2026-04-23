# Project Checklist: Complete File List

This checklist ensures you have all files needed to build the complete User Management application. Follow the files in order as they appear in the documentation.

## Phase 1: Setup & Configuration

### Configuration Files

- **`.env.local`** - Database connection (see Setup chapter)
  ```dotenv
  DATABASE_URL="postgresql://app:app@127.0.0.1:5432/usermgmt?serverVersion=16&charset=utf8"
  APP_ENV=dev
  APP_DEBUG=1
  ```

- **`config/packages/doctrine.yaml`** - Doctrine configuration (auto-generated, verify settings)
  - Database URL configured
  - Attribute mapping enabled
  - Migrations configured

- **`config/packages/security.yaml`** - Security configuration (see Security & Auth chapter)
  - Password hashers configured
  - User provider configured
  - Firewalls configured
  - Access control rules

- **`config/routes/attributes.yaml`** - Route configuration (auto-generated, verify)
  ```yaml
  controllers:
    resource: ../../src/Controller/
    type: attribute
  ```

## Phase 2: Core Entity & Repository

### Entity Files

- **`src/Entity/User.php`** - Complete User entity (see Entity & Mapping chapter)
  - All properties defined with `#[ORM\Column]` attributes
  - Security interfaces implemented (`UserInterface`, `PasswordAuthenticatedUserInterface`)
  - Validation constraints added
  - All getters/setters included
  - Constructor initializes timestamps

**Required columns in database:**

- `id` (INTEGER, PRIMARY KEY, AUTO_INCREMENT)
- `email` (VARCHAR 180, UNIQUE, NOT NULL)
- `roles` (JSON, NOT NULL)
- `password` (VARCHAR 255, NOT NULL)
- `first_name` (VARCHAR 80, NOT NULL)
- `last_name` (VARCHAR 80, NOT NULL)
- `is_active` (BOOLEAN, DEFAULT true, NOT NULL)
- `created_at` (TIMESTAMP, NOT NULL)
- `updated_at` (TIMESTAMP, NOT NULL)

**Required indexes:**

- PRIMARY KEY on `id`
- UNIQUE INDEX on `email`
- INDEX on `last_name`
- INDEX on `is_active`

### Repository Files

- **`src/Repository/UserRepository.php`** - User repository (see Repository & Queries chapter)
  - Extends `ServiceEntityRepository`
  - `findOneByEmail()` method
  - `search()` method with filtering, sorting, pagination
  - Helper methods as needed

### Model/DTO Files

- **`src/Model/UserFilter.php`** - Filter DTO (see Request Data Mapping chapter)
  - Properties: `q`, `active`, `sort`, `dir`, `page`, `perPage`
  - Default values set
  - Validation constraints

## Phase 3: Forms & Validation

- **`src/Form/UserType.php`** - User form type (see Forms & Validation chapter)
  - All fields defined
  - `plainPassword` field configured
  - Validation groups support
  - `configureOptions()` method

## Phase 4: Controllers

- **`src/Controller/UserController.php`** - CRUD controller (see Controllers & Routes chapter)
  - `index()` - List users with filtering
  - `new()` - Create user form
  - `show()` - View user details
  - `edit()` - Edit user form
  - `delete()` - Delete user (with authorization)

- **`src/Controller/SecurityController.php`** - Authentication (see Security & Auth chapter)
  - `login()` - Display login form
  - `logout()` - Logout action

## Phase 5: Security

- **`src/Security/Voter/UserVoter.php`** - Authorization voter (see Security & Auth chapter)
  - `supports()` method
  - `voteOnAttribute()` method
  - DELETE, EDIT, VIEW permissions

## Phase 6: Templates (Views)

- **`templates/base.html.twig`** - Base layout (see Views & Twig chapter)
  - HTML structure
  - Flash messages display
  - Navigation

- **`templates/user/index.html.twig`** - User list (see Views & Twig chapter)
  - Search/filter form
  - User table
  - Pagination
  - Action buttons

- **`templates/user/new.html.twig`** - Create user form (see Views & Twig chapter)
  - Form rendering
  - Error display

- **`templates/user/edit.html.twig`** - Edit user form (see Views & Twig chapter)
  - Form rendering
  - Error display

- **`templates/user/show.html.twig`** - User details (see Views & Twig chapter)
  - User information display
  - Action buttons

- **`templates/user/_form.html.twig`** - Form partial (see Views & Twig chapter)
  - Reusable form template

- **`templates/security/login.html.twig`** - Login form (see Security & Auth chapter)
  - Email/password fields
  - CSRF token
  - Error display

## Phase 7: Database Migrations

- **Migration file** - Generated via `make:migration` (see Entity & Mapping chapter)
  - Creates `users` table
  - Creates all indexes
  - Creates unique constraints
  - Applied via `doctrine:migrations:migrate`

**Verify migration created:**
```bash
php bin/console doctrine:migrations:status
```

**Verify table exists:**
```bash
# PostgreSQL
psql -U app -d usermgmt -c "\d users"

# MySQL  
mysql -u app -p usermgmt -e "DESCRIBE users;"
```

## Phase 8: Advanced Features (Optional)

### Soft Delete (if implementing)

- **`src/Entity/User.php`** - Add `deletedAt` property (see Doctrine Filters & Soft Delete chapter)
  ```php
  #[ORM\Column(type: 'datetime_immutable', nullable: true)]
  private ?\DateTimeImmutable $deletedAt = null;
  ```

- **`src/Doctrine/Filter/NotDeletedFilter.php`** - Soft delete filter
  - Extends `SQLFilter`
  - `addFilterConstraint()` method

- **`config/packages/doctrine.yaml`** - Enable filter
  ```yaml
  filters:
    not_deleted:
      class: App\Doctrine\Filter\NotDeletedFilter
      enabled: true
  ```

- **Migration** - Add `deleted_at` column
  ```bash
  php bin/console make:migration
  php bin/console doctrine:migrations:migrate -n
  ```

### Lifecycle Events (if implementing)

- **`src/Doctrine/UserTimestampSubscriber.php`** - Timestamp subscriber (see Lifecycle Events chapter)
  - `prePersist()` method
  - `preUpdate()` method
  - Auto-registered via attributes

### Services (if implementing)

- **`src/Service/UserManager.php`** - User service (see Advanced CRUD chapter)
  - `create()` method
  - `update()` method
  - `delete()` method

## Phase 9: Testing

- **`src/DataFixtures/UserFixtures.php`** - Test data (see Testing & Fixtures chapter)
  - Creates sample users
  - Hashes passwords correctly

- **`tests/Entity/UserTest.php`** - Unit tests
- **`tests/Repository/UserRepositoryTest.php`** - Repository tests
- **`tests/Controller/UserControllerTest.php`** - Functional tests
- **`tests/Form/UserTypeTest.php`** - Form tests

## Verification Steps

### 1. Database Verification

```bash
# Check database exists
php bin/console doctrine:database:create --if-not-exists

# Check migrations
php bin/console doctrine:migrations:status

# Verify table structure
php bin/console doctrine:schema:validate
```

### 2. Code Verification

```bash
# Check for syntax errors
php bin/console lint:yaml config/
php bin/console lint:container

# Check routes
php bin/console debug:router
```

### 3. Application Verification

```bash
# Start server
symfony server:start -d

# Test routes
curl http://localhost:8000/users
curl http://localhost:8000/login
```

## Complete File Structure

```
usermgmt/
├── .env.local                    # Database configuration
├── config/
│   ├── packages/
│   │   ├── doctrine.yaml        # Doctrine configuration
│   │   └── security.yaml        # Security configuration
│   └── routes/
│       └── attributes.yaml      # Route configuration
├── migrations/
│   └── Version*.php             # Database migrations
├── src/
│   ├── Controller/
│   │   ├── UserController.php   # CRUD controller
│   │   └── SecurityController.php # Auth controller
│   ├── DataFixtures/
│   │   └── UserFixtures.php     # Test data
│   ├── Doctrine/
│   │   ├── Filter/
│   │   │   └── NotDeletedFilter.php # Soft delete filter
│   │   └── UserTimestampSubscriber.php # Timestamp events
│   ├── Entity/
│   │   └── User.php             # User entity
│   ├── Form/
│   │   └── UserType.php         # User form
│   ├── Model/
│   │   └── UserFilter.php       # Filter DTO
│   ├── Repository/
│   │   └── UserRepository.php   # User repository
│   ├── Security/
│   │   └── Voter/
│   │       └── UserVoter.php    # Authorization voter
│   └── Service/
│       └── UserManager.php      # User service (optional)
├── templates/
│   ├── base.html.twig           # Base layout
│   ├── security/
│   │   └── login.html.twig     # Login form
│   └── user/
│       ├── _form.html.twig      # Form partial
│       ├── index.html.twig      # User list
│       ├── new.html.twig        # Create form
│       ├── edit.html.twig       # Edit form
│       └── show.html.twig       # User details
└── tests/
    ├── Controller/
    │   └── UserControllerTest.php
    ├── Entity/
    │   └── UserTest.php
    ├── Form/
    │   └── UserTypeTest.php
    └── Repository/
        └── UserRepositoryTest.php
```

## Quick Start Commands

```bash
# 1. Create project
symfony new usermgmt --webapp
cd usermgmt

# 2. Install dependencies
composer require symfony/maker-bundle --dev
composer require doctrine/doctrine-migrations-bundle

# 3. Configure database (.env.local)
# DATABASE_URL="postgresql://..."

# 4. Create database
php bin/console doctrine:database:create

# 5. Create entity (copy from Entity & Mapping chapter)
# Create src/Entity/User.php

# 6. Create repository (copy from Repository & Queries chapter)
# Create src/Repository/UserRepository.php

# 7. Create migration
php bin/console make:migration
php bin/console doctrine:migrations:migrate -n

# 8. Create form (copy from Forms & Validation chapter)
# Create src/Form/UserType.php

# 9. Create controller (copy from Controllers & Routes chapter)
# Create src/Controller/UserController.php

# 10. Create templates (copy from Views & Twig chapter)
# Create templates/user/*.twig

# 11. Configure security (copy from Security & Auth chapter)
# Update config/packages/security.yaml
# Create src/Controller/SecurityController.php
# Create src/Security/Voter/UserVoter.php

# 12. Test application
symfony server:start -d
open http://localhost:8000/users
```

## Common Issues Checklist

- [ ] Database connection works (`php bin/console doctrine:database:create`)
- [ ] Migrations run successfully (`php bin/console doctrine:migrations:migrate`)
- [ ] Entity validates (`php bin/console doctrine:schema:validate`)
- [ ] Routes are registered (`php bin/console debug:router`)
- [ ] Forms render without errors
- [ ] Security configuration loads (`php bin/console debug:container security`)
- [ ] All dependencies installed (`composer install`)

## Next Steps After Setup

1. **Load fixtures** (optional): `php bin/console doctrine:fixtures:load`
2. **Create first admin user** (via command or directly in database)
3. **Test login** at `/login`
4. **Test CRUD operations** at `/users`
5. **Run tests**: `php bin/phpunit`

Your project is complete when all items above are checked!

