# Data Validation

While Doctrine is responsible for persisting your objects, it is not its job to validate them. Data validation is a separate concern that should be handled before you ever ask the `EntityManager` to persist an entity.

Integrating a robust validation layer is a critical part of building a secure and reliable application. The **Symfony Validator** component is the de-facto standard in the PHP ecosystem and integrates seamlessly with Doctrine.

!!! tip "Database vs. Application Validation"
    It's important to understand the difference between database constraints and application-level validation.
    -   **Database Constraints** (`unique=true`, `nullable=false`, foreign keys): These are your last line of defense. They guarantee data integrity at the lowest level.
    -   **Application Validation**: This is your first line of defense. It provides user-friendly error messages and can handle complex business rules that a database can't (e.g., "if this field is 'A', then that field must be a valid email").

You should always use both.

## Setting Up Validation with Attributes

The easiest way to define validation rules is by using PHP attributes directly on your entity properties.

First, install the necessary components:
```bash
composer require symfony/validator symfony/property-access symfony/property-info
```

Now, you can add `Assert` attributes to your entities.

```php
// src/Entity/User.php
<?php
namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Bridge\Doctrine\Validator\Constraints\UniqueEntity;
use Symfony\Component\Validator\Constraints as Assert;

#[ORM\Entity]
#[UniqueEntity(fields: ['email'], message: 'This email address is already in use.')]
class User
{
    // ...
    #[ORM\Column(type: 'string', unique: true)]
    #[Assert\NotBlank]
    #[Assert\Email(message: "The email '{{ value }}' is not a valid email.")]
    private string $email;

    #[ORM\Column(type: 'string')]
    #[Assert\NotBlank(groups: ['registration'])]
    #[Assert\Length(min: 8, groups: ['registration'])]
    private string $password;
}
```
Here, we have defined several rules:
-   `#[UniqueEntity]`: A Doctrine-specific constraint that checks if the `email` is already taken in the database.
-   `#[Assert\NotBlank]`: The field cannot be empty.
-   `#[Assert\Email]`: The field must be a valid email address.
-   `#[Assert\Length]`: The field must be at least 8 characters long.
-   `groups`: Notice the `groups` option. This allows us to apply certain rules only in specific scenarios.

## Executing the Validator

To run the validation, you need a validator instance. In a Symfony application, you can simply inject the `ValidatorInterface`.

```php
use Symfony\Component\Validator\Validator\ValidatorInterface;

class UserService
{
    public function __construct(
        private readonly ValidatorInterface $validator,
        private readonly EntityManagerInterface $entityManager
    ) {}
    
    public function createUser(string $email, string $plainPassword): User
    {
        $user = new User();
        $user->setEmail($email);
        $user->setPassword($plainPassword);

        // Execute validation for the 'registration' group
        $violations = $this->validator->validate($user, groups: ['registration', 'Default']);

        if (count($violations) > 0) {
            // Handle the violations, e.g., throw a custom exception
            // with the violation messages.
            throw new ValidationFailedException($violations);
        }

        $this->entityManager->persist($user);
        $this->entityManager->flush();
        
        return $user;
    }
}
```
This pattern is crucial: **validate first, then persist**. If validation fails, you never even attempt to save the entity, keeping your application's state clean.

## Validation Groups: Different Rules for Different Scenarios

Validation groups are a powerful feature that allow you to apply different sets of rules in different contexts. A common use case is user creation vs. user update.

-   **On registration**, the password is required.
-   **On profile update**, the user might not be changing their password, so it shouldn't be required.

We achieved this in the entity above by adding `groups: ['registration']` to the password's `NotBlank` and `Length` constraints. When we call the validator, we specify which groups to validate.

```php
// For a new user, we validate the 'registration' and 'Default' groups
$violations = $this->validator->validate($user, groups: ['registration', 'Default']);

// For a profile update, we might only validate the 'Default' group
$violations = $this->validator->validate($user); // 'Default' is the default group
```

## Creating Custom Validation Constraints

Sometimes, the built-in constraints are not enough. You might need to validate a complex business rule, like "a discount code must be valid and not expired".

For this, you can create a custom constraint and its corresponding validator.

#### Step 1: Create the Constraint Attribute
This is a simple class that defines the name of the constraint and its options.

```php
// src/Validator/IsValidDiscountCode.php
<?php
namespace App\Validator;
use Symfony\Component\Validator\Constraint;

#[\Attribute]
class IsValidDiscountCode extends Constraint
{
    public string $message = 'The discount code "{{ value }}" is not valid or has expired.';
}
```

#### Step 2: Create the Validator
This class contains the actual validation logic. It can use dependency injection to access other services, like a repository.

```php
// src/Validator/IsValidDiscountCodeValidator.php
<?php
namespace App\Validator;

use App\Repository\DiscountCodeRepository;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use Symfony\Component\Validator\Exception\UnexpectedValueException;

class IsValidDiscountCodeValidator extends ConstraintValidator
{
    public function __construct(private readonly DiscountCodeRepository $repository) {}

    public function validate($value, Constraint $constraint): void
    {
        if (null === $value || '' === $value) {
            return;
        }

        if (!is_string($value)) {
            throw new UnexpectedValueException($value, 'string');
        }

        $discountCode = $this->repository->findActiveByCode($value);

        if ($discountCode === null) {
            $this->context->buildViolation($constraint->message)
                ->setParameter('{{ value }}', $value)
                ->addViolation();
        }
    }
}
```
Now you can use your custom constraint just like a built-in one:
```php
class ApplyDiscountDto
{
    #[App\Validator\IsValidDiscountCode]
    public string $discountCode;
}
```

By separating validation from your entities' core responsibilities, you create a more flexible, testable, and maintainable codebase.

