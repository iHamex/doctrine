# Security Best Practices

When working with a database through an ORM, it's easy to assume that security is handled automatically. While Doctrine provides strong protection against common vulnerabilities like SQL injection, a secure application requires a defense-in-depth approach. This guide covers the most critical security considerations when building applications with Doctrine.

## The Golden Rule: Always Use Parameter Binding

SQL injection is one of the oldest and most dangerous web vulnerabilities. It occurs when user-supplied input is improperly included in a database query, allowing an attacker to alter the query's structure.

Doctrine's DQL and QueryBuilder are secure **by default**, as long as you **always use parameter binding**.

#### The Wrong Way: String Concatenation (Vulnerable)
```php
// ❌ DANGEROUS - Never do this
$dql = "SELECT u FROM App\Entity\User u WHERE u.username = '" . $_GET['username'] . "'";
$query = $entityManager->createQuery($dql);
```
If an attacker provides a username like `' OR 1=1 --`, the query becomes `... WHERE u.username = '' OR 1=1 --'`, and they can log in as any user.

#### The Right Way: Parameter Binding (Secure)
```php
// ✅ SECURE
$dql = 'SELECT u FROM App\Entity\User u WHERE u.username = :username';
$query = $entityManager->createQuery($dql)
                       ->setParameter('username', $_GET['username']);
```
When you use `setParameter()`, Doctrine uses the underlying DBAL and PDO driver to create a **prepared statement**. The query structure and the user-provided value are sent to the database separately. The database engine then safely inserts the value into the query, ensuring it is treated as a literal value and not as executable SQL.

!!! tip "It's Almost Impossible to Misuse"
    As long as you provide dynamic values via `setParameter()`, `setParameters()`, or the `?1` syntax, you are protected from SQL injection in DQL and the QueryBuilder.

#### What About Native SQL?
When using `createNativeQuery()`, the same rule applies. You must use parameter binding.

```php
// ✅ SECURE
$sql = 'SELECT * FROM user WHERE username = ?';
$query = $entityManager->createNativeQuery($sql, $rsm)
                       ->setParameter(1, $_GET['username']);
```

## Never Trust User Input: Validation and DTOs

Every piece of data that comes from a user—form fields, URL parameters, API payloads—must be treated as untrustworthy.

### Mass Assignment Vulnerabilities
A common pattern is to take an array of data from a request and use it to populate an entity.

```php
// ❌ DANGEROUS - Mass Assignment
$data = json_decode($request->getContent(), true); // e.g., ['email' => '...', 'isAdmin' => true]
$user = new User();
$user->setEmail($data['email']);
$user->setIsAdmin($data['isAdmin']); // Attacker can make themselves an admin!
```
An attacker can add extra fields to the JSON payload (like `isAdmin: true` or `balance: 99999`) and modify properties you never intended to expose.

### Solution: Data Transfer Objects (DTOs) and Validation
The best practice is to use a Data Transfer Object (DTO) with validation constraints to represent the incoming data. This acts as a strict contract between the client and your application.

```php
// A DTO for creating a user
class CreateUserDto
{
    #[Assert\NotBlank]
    #[Assert\Email]
    public string $email;

    #[Assert\NotBlank]
    #[Assert\Length(min: 8)]
    public string $plainPassword;
}

// In your controller/service...
$dto = new CreateUserDto();
$dto->email = $data['email'];
$dto->plainPassword = $data['plainPassword'];

$errors = $validator->validate($dto);
if (count($errors) > 0) {
    // Handle validation errors
}

// Now, safely map the validated DTO to your entity
$user = new User();
$user->setEmail($dto->email);
$user->setPassword($dto->plainPassword, $passwordHasher); // Hash the password
$entityManager->persist($user);
```
This approach ensures that **only the fields defined in the DTO** are processed, and they are rigorously validated before they ever touch your entity.

## Securing Your Data

#### Password Hashing
Never, ever store passwords in plaintext. Always use a strong, modern, one-way hashing algorithm like **Argon2** or **bcrypt**. PHP's `password_hash()` and `password_verify()` functions are the standard for this. Frameworks like Symfony provide convenient wrappers around these.

```php
#[ORM\Entity]
class User
{
    // ...
    #[ORM\Column(type: 'string')]
    private string $password; // This stores the HASH, not the plaintext password

    public function setPassword(string $plainPassword): void
    {
        $this->password = password_hash($plainPassword, PASSWORD_ARGON2ID);
    }

    public function verifyPassword(string $plainPassword): bool
    {
        return password_verify($plainPassword, $this->password);
    }
}
```

#### Sensitive Data in Logs and API Responses
Be careful not to expose sensitive information.
-   **API Responses**: Use serialization groups or DTOs to explicitly define which entity fields are exposed in your API. Never serialize and return an entire entity object, as it might contain password hashes, API tokens, or other sensitive data.
-   **Logging**: Ensure that your production logs do not contain sensitive user data. Doctrine's default SQL logger will log query parameters, so it must be disabled in production.

## Authorization: Who Can Access What?

Authentication confirms who a user is, but **authorization** determines what they are allowed to do. This logic belongs in your service layer, *before* you interact with Doctrine.

```php
// In a PostService...
public function updatePost(int $postId, array $data, User $currentUser): Post
{
    $post = $this->postRepository->find($postId);
    
    // Authorization Check
    if ($post->getAuthor() !== $currentUser && !$currentUser->isAdmin()) {
        throw new AccessDeniedException('You are not allowed to edit this post.');
    }

    // Now it's safe to modify the entity
    $post->setTitle($data['title']);
    $this->entityManager->flush();
    
    return $post;
}
```
For more complex scenarios, use a dedicated authorization component like the Symfony Security Voter or a similar library to centralize your access control rules.

