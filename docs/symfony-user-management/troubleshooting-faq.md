# Troubleshooting & FAQ

Common issues and solutions when working with Symfony + Doctrine User Management. This guide covers frequent problems and their fixes.

## Common Issues

### UniqueConstraintViolation on Email

**Symptom:**
```
SQLSTATE[23505]: Unique violation: 7 ERROR: duplicate key value violates unique constraint "uniq_user_email"
```

**Causes:**

- Email already exists in database
- Email normalization issue (case sensitivity)
- Race condition (two requests creating same email simultaneously)

**Solutions:**

**1. Check email normalization:**
```php
// Ensure setter normalizes email
public function setEmail(string $email): self
{
    $this->email = strtolower(trim($email));
    return $this;
}
```

**2. Check before creating:**
```php
$existing = $repository->findOneByEmail($email);
if ($existing) {
    throw new \RuntimeException('Email already exists');
}
```

**3. Handle race conditions:**
```php
try {
    $em->persist($user);
    $em->flush();
} catch (\Doctrine\DBAL\Exception\UniqueConstraintViolationException $e) {
    // Email was created by another request
    $this->addFlash('error', 'Email already exists');
    return $this->redirectToRoute('user_new');
}
```

### CSRF Token Invalid on Delete

**Symptom:**
```
403 Forbidden - Invalid CSRF token
```

**Causes:**

- CSRF token mismatch
- Session expired
- Token not included in form

**Solutions:**

**1. Verify token in template:**
```twig
<form action="{{ path('user_delete', {id: user.id}) }}" method="post">
    <input type="hidden" name="_token" value="{{ csrf_token('delete' ~ user.id) }}">
    <button type="submit">Delete</button>
</form>
```

**2. Verify token check in controller:**
```php
$token = (string) $request->request->get('_token');
if (!$this->isCsrfTokenValid('delete' . $user->getId(), $token)) {
    $this->addFlash('error', 'Invalid security token');
    return $this->redirectToRoute('user_index');
}
```

**3. Check session configuration:**
```yaml
# config/packages/framework.yaml
framework:
  session:
    cookie_secure: auto
    cookie_samesite: lax
```

### Password Not Updating

**Symptom:**
Editing user with new password has no effect.

**Causes:**

- Password not being hashed
- Plain password not cleared
- Entity not being flushed

**Solutions:**

**1. Verify password hashing:**
```php
if ($form->isSubmitted() && $form->isValid()) {
    $plainPassword = $user->getPlainPassword();
    
    // Only hash if password provided
    if ($plainPassword && $plainPassword !== '') {
        $hashedPassword = $hasher->hashPassword($user, $plainPassword);
        $user->setPassword($hashedPassword);
    }
    
    // Clear plain password
    $user->setPlainPassword(null);
    
    // Flush changes
    $em->flush();
}
```

**2. Check form binding:**
```php
// Form should bind to plainPassword
->add('plainPassword', PasswordType::class, [
    'mapped' => true,
    'required' => false,
])
```

**3. Verify entity is managed:**
```php
// For new entities
$em->persist($user);
$em->flush();

// For existing entities (already managed)
$em->flush(); // No persist needed
```

### Not Authenticated in Tests

**Symptom:**
Protected routes return 302 redirect to login in tests.

**Causes:**

- User not logged in
- Test user doesn't exist
- Security configuration mismatch

**Solutions:**

**1. Login user in test:**
```php
use App\Entity\User;

$client = static::createClient();

// Get or create test user
$em = self::getContainer()->get('doctrine')->getManager();
$user = $em->getRepository(User::class)->findOneByEmail('test@example.com');

if (!$user) {
    // Create test user
    $user = new User();
    $user->setEmail('test@example.com');
    $user->setPassword('hashed');
    $em->persist($user);
    $em->flush();
}

// Login user
$client->loginUser($user);

// Now protected routes work
$client->request('GET', '/users');
$this->assertResponseIsSuccessful();
```

**2. Use fixtures:**
```php
// Load fixtures before tests
$this->loadFixtures([UserFixtures::class]);

// Get user from fixtures
$user = $this->getReference('user-admin');
$client->loginUser($user);
```

### Lazy Proxy Serialization Errors

**Symptom:**
```
Serialization of 'Closure' is not allowed
```
or
```
Doctrine\ORM\Proxy\Proxy cannot be serialized
```

**Causes:**

- Trying to serialize Doctrine entities directly
- Uninitialized lazy-loaded relationships

**Solutions:**

**1. Use DTOs instead:**
```php
// BAD: Serialize entity directly
return new JsonResponse($user); // Fails with proxies

// GOOD: Use DTO
$dto = new UserDTO(
    $user->getId(),
    $user->getEmail(),
    $user->getFirstName()
);
return new JsonResponse($dto);
```

**2. Initialize relationships:**
```php
// Force initialization before serialization
$user->getGroups()->toArray(); // Initialize collection
return new JsonResponse($user);
```

**3. Use serializer groups:**
```php
use Symfony\Component\Serializer\Annotation\Groups;

class User
{
    #[Groups(['api'])]
    private int $id;
    
    #[Groups(['api'])]
    private string $email;
}

// In controller
use Symfony\Component\Serializer\SerializerInterface;

public function apiShow(User $user, SerializerInterface $serializer): JsonResponse
{
    $data = $serializer->serialize($user, 'json', ['groups' => 'api']);
    return new JsonResponse($data, 200, [], true);
}
```

### Migrations Out of Sync

**Symptom:**
`doctrine:migrations:diff` generates unexpected changes.

**Causes:**

- Metadata cache stale
- Mapping configuration mismatch
- Database schema manually modified

**Solutions:**

**1. Clear metadata cache:**
```bash
php bin/console doctrine:cache:clear-metadata
php bin/console doctrine:migrations:diff
```

**2. Verify mapping configuration:**
```yaml
# config/packages/doctrine.yaml
doctrine:
  orm:
    mappings:
      App:
        type: attribute  # Ensure consistent
```

**3. Check database platform:**
```yaml
doctrine:
  dbal:
    url: '%env(resolve:DATABASE_URL)%'
    # Ensure serverVersion matches actual database
    # serverVersion: '16' for PostgreSQL 16
```

**4. Reset migrations (development only):**
```bash
# WARNING: Only in development!
php bin/console doctrine:migrations:version --delete --all
php bin/console doctrine:schema:drop --force
php bin/console doctrine:migrations:migrate
```

### Slow User List

**Symptom:**
`/users` page loads slowly with many users.

**Causes:**

- Missing indexes
- Loading too much data
- N+1 queries
- No pagination

**Solutions:**

**1. Add indexes:**
```php
#[ORM\Index(name: 'idx_user_active', columns: ['is_active'])]
#[ORM\Index(name: 'idx_user_lastname', columns: ['last_name'])]
#[ORM\Index(name: 'idx_user_created', columns: ['created_at'])]
class User
{
    // ...
}
```

**2. Implement pagination:**
```php
public function search(UserFilter $filter): array
{
    $qb = $this->createQueryBuilder('u');
    
    // ... filters ...
    
    // Pagination
    $page = max(1, $filter->page);
    $perPage = min(100, max(1, $filter->perPage));
    $offset = ($page - 1) * $perPage;
    
    $qb->setFirstResult($offset)
       ->setMaxResults($perPage);
    
    return $qb->getQuery()->getResult();
}
```

**3. Select only needed columns:**
```php
$qb->select('PARTIAL u.{id, email, firstName, lastName, isActive}')
   ->from(User::class, 'u');
```

**4. Use DTOs for large lists:**
```php
$dql = 'SELECT u.id, u.email, u.firstName FROM App\Entity\User u';
$users = $em->createQuery($dql)->getArrayResult();
```

### 500 Error After Deploy

**Symptom:**
Application works locally but returns 500 in production.

**Causes:**

- Cache not warmed
- Environment variables missing
- File permissions incorrect
- Database connection failed

**Solutions:**

**1. Check environment:**
```bash
# Verify environment
echo $APP_ENV  # Should be "prod"
echo $APP_DEBUG  # Should be "0"
```

**2. Warm cache:**
```bash
php bin/console cache:clear --env=prod --no-warmup
php bin/console cache:warmup --env=prod
```

**3. Check file permissions:**
```bash
# Writable directories
chmod -R 775 var/
chmod -R 775 public/uploads/

# Ownership
chown -R www-data:www-data .
```

**4. Check logs:**
```bash
tail -f var/log/prod.log
```

**5. Verify database:**
```bash
php bin/console doctrine:database:create --if-not-exists
php bin/console doctrine:migrations:migrate --no-interaction
```

**6. Check PHP errors:**
```bash
# Enable error display temporarily
# In .env.prod
APP_DEBUG=1  # Temporarily!

# Check PHP error log
tail -f /var/log/php8.2-fpm.log
```

### Entity Not Found (404)

**Symptom:**
`/users/123` returns 404 even though user exists.

**Causes:**

- Soft delete filter enabled
- User actually deleted
- ID mismatch

**Solutions:**

**1. Check soft delete:**
```php
// Disable filter to check
$em->getFilters()->disable('not_deleted');
$user = $repository->find($id);
$em->getFilters()->enable('not_deleted');

if ($user && $user->isDeleted()) {
    // User is soft deleted
}
```

**2. Verify ID:**
```php
// Check if ID is correct
$user = $repository->find($id);
if (!$user) {
    // Check all users
    $all = $repository->findAll();
    // Debug IDs
}
```

### Form Validation Not Working

**Symptom:**
Form submits even with invalid data.

**Causes:**

- Validation groups not set
- Constraints not configured
- Form not checking validation

**Solutions:**

**1. Verify form validation:**
```php
if ($form->isSubmitted() && $form->isValid()) {
    // Only executes if valid
}
```

**2. Check validation groups:**
```php
// In controller
$form = $this->createForm(UserType::class, $user, [
    'validation_groups' => ['Default', 'create'],
]);

// In form
'validation_groups' => ['Default'],
```

**3. Check entity constraints:**
```php
#[Assert\NotBlank(message: 'Email is required.')]
#[Assert\Email(message: 'Invalid email format.')]
private string $email = '';
```

## FAQ

### How do I reset the database?

**Development:**
```bash
php bin/console doctrine:database:drop --force
php bin/console doctrine:database:create
php bin/console doctrine:migrations:migrate
php bin/console doctrine:fixtures:load
```

**Production:**
Never drop production database! Use migrations to modify schema.

### How do I clear all caches?

```bash
# Clear Symfony cache
php bin/console cache:clear

# Clear Doctrine metadata cache
php bin/console doctrine:cache:clear-metadata

# Clear Doctrine query cache
php bin/console doctrine:cache:clear-query

# Clear Doctrine result cache
php bin/console doctrine:cache:clear-result
```

### How do I see all database queries?

**Development:**
- Symfony Profiler (bottom toolbar)
- Enable query logging in `doctrine.yaml`:
```yaml
doctrine:
  dbal:
    logging: true
    profiling: true
```

### How do I debug a specific query?

```php
// Enable SQL logging
$em->getConnection()->getConfiguration()->setSQLLogger(new \Doctrine\DBAL\Logging\EchoSQLLogger());

// Execute query
$users = $repository->findAll();

// Check profiler
// Or use: $em->getConnection()->getConfiguration()->getSQLLogger()
```

### How do I change database platform?

**Update DSN:**
```dotenv
# PostgreSQL
DATABASE_URL=postgresql://user:pass@host:5432/db?serverVersion=16

# MySQL
DATABASE_URL=mysql://user:pass@host:3306/db?serverVersion=8.0

# SQLite
DATABASE_URL=sqlite:///%kernel.project_dir%/var/data.db
```

**Update serverVersion in doctrine.yaml:**
```yaml
doctrine:
  dbal:
    server_version: '16'  # Match your database version
```

### How do I add a new field to User?

**1. Add to entity:**
```php
#[ORM\Column(length: 255, nullable: true)]
private ?string $phoneNumber = null;
```

**2. Generate migration:**
```bash
php bin/console make:migration
```

**3. Review migration:**
```bash
# Check generated migration file
cat migrations/VersionXXXXXX.php
```

**4. Apply migration:**
```bash
php bin/console doctrine:migrations:migrate
```

### How do I handle timezones?

**Store as UTC in database:**
```php
#[ORM\Column(type: 'datetime_immutable')]
private \DateTimeImmutable $createdAt;

// Always use UTC
$this->createdAt = new \DateTimeImmutable('now', new \DateTimeZone('UTC'));
```

**Display in user's timezone:**
```twig
{{ user.createdAt|date('Y-m-d H:i', app.user.timezone) }}
```

## Getting Help

**Resources:**

- Symfony Documentation: https://symfony.com/doc/current/
- Doctrine Documentation: https://www.doctrine-project.org/
- Stack Overflow: Tag questions with `symfony` and `doctrine`
- Symfony Slack: https://symfony.com/community

**Debugging tools:**

- Symfony Profiler (dev toolbar)
- `var_dump()` / `dd()` (development)
- Logging: `$logger->debug('Message', ['context' => $data])`
- Database query logging

## Best Practices

!!! tip "Always Check Logs First"
    Most issues are logged. Check `var/log/dev.log` (development) or `var/log/prod.log` (production).

!!! warning "Don't Modify Migrations"
    Once a migration is applied in production, don't modify it. Create a new migration instead.

!!! note "Test in Staging First"
    Always test changes in a staging environment that mirrors production before deploying.

Your troubleshooting guide is complete!
