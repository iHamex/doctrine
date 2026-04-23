# Forms & Validation

Symfony Forms provide a powerful, type-safe way to build HTML forms that automatically handle data binding, validation, and CSRF protection. We'll create a UserType form that binds to the User entity and handles password hashing securely.

## Why Use Symfony Forms?

**Benefits:**

- **Automatic HTML generation**: Forms render themselves as HTML
- **Data binding**: Automatically maps form data to/from entities
- **Validation**: Built-in validation with clear error messages
- **CSRF protection**: Automatic CSRF token generation
- **Type safety**: Form fields map to entity properties with type hints
- **Reusable**: Same form class works for create and edit

## Complete UserType Form

Create `src/Form/UserType.php`:

```php
<?php

namespace App\Form;

use App\Entity\User;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\CheckboxType;
use Symfony\Component\Form\Extension\Core\Type\EmailType;
use Symfony\Component\Form\Extension\Core\Type\PasswordType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * UserType
 * 
 * Form type for creating and editing User entities.
 * Handles all user fields including the transient plainPassword field
 * used for password input (not persisted to database).
 */
class UserType extends AbstractType
{
    /**
     * Build the form structure
     * 
     * This method defines all form fields and their configuration.
     * Each field maps to a property on the User entity.
     * 
     * @param FormBuilderInterface $builder Form builder for adding fields
     * @param array $options Form options (e.g., validation_groups)
     */
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            // Email field
            ->add('email', EmailType::class, [
                'label' => 'Email Address',
                'required' => true,
                'attr' => [
                    'placeholder' => 'user@example.com',
                    'autocomplete' => 'email',
                ],
            ])

            // First name field
            ->add('firstName', TextType::class, [
                'label' => 'First Name',
                'required' => true,
                'attr' => [
                    'placeholder' => 'John',
                    'autocomplete' => 'given-name',
                ],
            ])

            // Last name field
            ->add('lastName', TextType::class, [
                'label' => 'Last Name',
                'required' => true,
                'attr' => [
                    'placeholder' => 'Doe',
                    'autocomplete' => 'family-name',
                ],
            ])

            // Active status checkbox
            ->add('isActive', CheckboxType::class, [
                'label' => 'Active',
                'required' => false,  // Checkboxes are optional by default
                'help' => 'Inactive users cannot log in',
            ])

            // Password field - maps to transient plainPassword property
            ->add('plainPassword', PasswordType::class, [
                'label' => 'Password',
                'mapped' => true,  // Bind to entity's plainPassword property
                'required' => $this->isPasswordRequired($options),
                'help' => 'Leave blank to keep current password (when editing)',
                'attr' => [
                    'autocomplete' => 'new-password',
                    'minlength' => 8,
                ],
                'constraints' => [
                    // Only validate if password is required (create mode)
                    new Assert\Length([
                        'min' => 8,
                        'minMessage' => 'Password must be at least 8 characters.',
                        'groups' => ['create'],  // Only validate in 'create' group
                    ]),
                ],
            ])
        ;
    }

    /**
     * Configure form options
     * 
     * Sets default options like data_class (which entity this form binds to)
     * and validation_groups (which validation rules to apply).
     * 
     * @param OptionsResolver $resolver Options resolver
     */
    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            // Entity class this form binds to
            'data_class' => User::class,
            
            // Default validation group
            // 'create' group is added in controller for new users
            'validation_groups' => ['Default'],
        ]);
    }

    /**
     * Determine if password is required based on validation groups
     * 
     * Password is required when creating a user ('create' group),
     * but optional when editing (user can leave blank to keep current password).
     * 
     * @param array $options Form options
     * @return bool True if password is required
     */
    private function isPasswordRequired(array $options): bool
    {
        $groups = $options['validation_groups'] ?? ['Default'];
        
        // Password is required if 'create' validation group is present
        return in_array('create', (array)$groups, true);
    }
}
```

## Understanding Form Fields

**Field types:**

- `EmailType` - Email input with HTML5 validation
- `TextType` - Single-line text input
- `PasswordType` - Password input (hidden characters)
- `CheckboxType` - Checkbox input

**Field options:**

- `label` - Human-readable label
- `required` - Whether field is mandatory
- `attr` - HTML attributes (placeholder, autocomplete, etc.)
- `help` - Help text shown below field
- `mapped` - Whether to bind to entity property (default: true)
- `constraints` - Validation constraints

## Validation Groups Explained

**What are validation groups?**

- Different sets of validation rules for different scenarios
- Example: Password required when creating, optional when editing

**How it works:**

**1. Entity validation (User.php):**
```php
#[Assert\NotBlank(groups: ['create'], message: 'Password is required when creating a user.')]
private string $password = '';

#[Assert\Length(min: 8, groups: ['create'])]
private ?string $plainPassword = null;
```

**2. Form validation (UserType.php):**
```php
'constraints' => [
    new Assert\Length([
        'min' => 8,
        'groups' => ['create'],  // Only validate in 'create' group
    ]),
],
```

**3. Controller usage:**
```php
// Create mode - password required
$form = $this->createForm(UserType::class, $user, [
    'validation_groups' => ['Default', 'create'],
]);

// Edit mode - password optional
$form = $this->createForm(UserType::class, $user);
// Uses default group only, so password constraints don't apply
```

**Result:**

- Creating user: Password must be provided and at least 8 characters
- Editing user: Password can be left blank (keeps current password)

## Plain Password Field Explained

**Why `plainPassword` instead of `password`?**

**The problem:**

- Forms need to accept plain text passwords from users
- Database stores hashed passwords (never plain text)
- We can't bind form directly to `password` field (it's already hashed)

**The solution:**

- Add transient `plainPassword` property to User entity (no `#[ORM\Column]`)
- Form binds to `plainPassword` (accepts user input)
- Controller hashes `plainPassword` and stores in `password`
- Clear `plainPassword` immediately after hashing

**In the entity:**
```php
// Persisted field - stores hashed password
#[ORM\Column]
private string $password = '';

// Transient field - NOT persisted, only for form binding
private ?string $plainPassword = null;
```

**In the form:**
```php
->add('plainPassword', PasswordType::class, [
    'mapped' => true,  // Binds to entity's plainPassword property
])
```

**In the controller:**
```php
// Get plain password from form
$plainPassword = $user->getPlainPassword();

// Hash it
$hashedPassword = $hasher->hashPassword($user, $plainPassword);
$user->setPassword($hashedPassword);

// Clear plain password
$user->setPlainPassword(null);
```

## Form Rendering in Templates

**Basic form rendering:**
```twig
{{ form_start(form) }}
    {{ form_widget(form) }}  {# Renders all fields automatically #}
    <button type="submit">Save</button>
{{ form_end(form) }}
```

**Custom field rendering:**
```twig
{{ form_start(form) }}
    {{ form_row(form.email) }}           {# Label + field + errors #}
    {{ form_row(form.firstName) }}
    {{ form_row(form.lastName) }}
    {{ form_row(form.isActive) }}
    {{ form_row(form.plainPassword) }}
    
    <button type="submit">Save</button>
{{ form_end(form) }}
```

**Even more control:**
```twig
{{ form_start(form) }}
    <div class="form-group">
        {{ form_label(form.email) }}
        {{ form_widget(form.email) }}
        {{ form_errors(form.email) }}
        {{ form_help(form.email) }}
    </div>
    
    {# Repeat for other fields #}
    
    <button type="submit">Save</button>
{{ form_end(form) }}
```

## Form Validation Flow

**Step-by-step:**

1. **User submits form** → POST request with form data
2. **`handleRequest()`** → Extracts data from request
3. **Data binding** → Maps form data to entity properties
4. **Validation** → Runs all constraints for active validation groups
5. **Result:**
   - **Valid**: `isValid()` returns true, entity has data
   - **Invalid**: `isValid()` returns false, errors stored in form

**Accessing validation errors:**
```php
if ($form->isSubmitted() && !$form->isValid()) {
    // Get all errors
    $errors = $form->getErrors(true);
    
    // Get errors for specific field
    $emailErrors = $form->get('email')->getErrors();
}
```

**In templates:**
```twig
{# Automatic error display #}
{{ form_errors(form.email) }}

{# Or check manually #}
{% if form.email.vars.errors|length > 0 %}
    <div class="alert alert-danger">
        {% for error in form.email.vars.errors %}
            {{ error.message }}
        {% endfor %}
    </div>
{% endif %}
```

## Password Handling in Edit Forms

**The challenge:**

- When editing, password field should be optional
- If left blank, keep existing password
- If filled, update password

**Solution:**

**1. Form field (optional in edit mode):**
```php
'required' => $this->isPasswordRequired($options),
// Returns false when 'create' group not present
```

**2. Controller logic:**
```php
if ($form->isSubmitted() && $form->isValid()) {
    $plainPassword = $user->getPlainPassword();
    
    // Only hash if password was provided
    if ($plainPassword !== '') {
        $hashedPassword = $hasher->hashPassword($user, $plainPassword);
        $user->setPassword($hashedPassword);
    }
    // If blank, password field is not updated, keeping existing hash
    
    $user->setPlainPassword(null);
    $em->flush();
}
```

**3. User experience:**

- User sees password field
- Can leave blank (keeps current password)
- Can enter new password (updates password)
- Form validation only requires password in create mode

## CSRF Protection

**Automatic CSRF tokens:**

- Symfony Forms automatically include CSRF tokens
- Token is validated when form is submitted
- Prevents Cross-Site Request Forgery attacks

**In template:**
```twig
{{ form_start(form) }}
    {# CSRF token automatically included #}
    {{ form_widget(form) }}
{{ form_end(form) }}
```

**Manual CSRF check (for non-form submissions):**
```php
// In controller
if ($this->isCsrfTokenValid('delete' . $user->getId(), $token)) {
    // Safe to proceed
}
```

## Form Customization

**Adding custom fields (not mapped to entity):**
```php
->add('confirmPassword', PasswordType::class, [
    'mapped' => false,  // Don't bind to entity
    'required' => true,
    'constraints' => [
        new Assert\EqualTo([
            'propertyPath' => 'plainPassword',
            'message' => 'Passwords must match.',
        ]),
    ],
])
```

**Conditional fields:**
```php
if ($options['show_admin_fields'] ?? false) {
    $builder->add('roles', ChoiceType::class, [
        'choices' => ['Admin' => 'ROLE_ADMIN'],
        'multiple' => true,
    ]);
}
```

**Custom data transformers:**
```php
use Symfony\Component\Form\DataTransformerInterface;

// Transform data between form and entity formats
$builder->get('email')->addModelTransformer(new EmailTransformer());
```

## Testing Forms

```php
<?php

namespace App\Tests\Form;

use App\Entity\User;
use App\Form\UserType;
use Symfony\Component\Form\Test\TypeTestCase;

class UserTypeTest extends TypeTestCase
{
    public function testSubmitValidData(): void
    {
        $formData = [
            'email' => 'test@example.com',
            'firstName' => 'John',
            'lastName' => 'Doe',
            'isActive' => true,
            'plainPassword' => 'password123',
        ];

        $user = new User();
        $form = $this->factory->create(UserType::class, $user);

        $form->submit($formData);

        $this->assertTrue($form->isSynchronized());
        $this->assertEquals('test@example.com', $user->getEmail());
        $this->assertEquals('John', $user->getFirstName());
    }

    public function testValidationGroups(): void
    {
        $user = new User();
        $form = $this->factory->create(UserType::class, $user, [
            'validation_groups' => ['create'],
        ]);

        // Submit without password (should fail in 'create' group)
        $form->submit([
            'email' => 'test@example.com',
            'firstName' => 'John',
            'lastName' => 'Doe',
            // No password
        ]);

        $this->assertFalse($form->isValid());
    }
}
```

## Common Validation Constraints

**On entity properties:**
```php
#[Assert\NotBlank(message: 'Email is required.')]
#[Assert\Email(message: 'Please enter a valid email address.')]
private string $email = '';

#[Assert\Length(min: 2, max: 80, minMessage: 'Name too short.', maxMessage: 'Name too long.')]
private string $firstName = '';

#[Assert\Regex(pattern: '/^[A-Za-z\s]+$/', message: 'Name can only contain letters.')]
private string $lastName = '';
```

**In form fields:**
```php
->add('email', EmailType::class, [
    'constraints' => [
        new Assert\NotBlank(),
        new Assert\Email(),
    ],
])
```

## Best Practices

!!! warning "Never Store Plain Passwords"
    - `plainPassword` is transient (not persisted)
    - Always hash passwords before storing
    - Clear `plainPassword` immediately after hashing

!!! tip "Use Validation Groups"
    - Different rules for create vs edit
    - More flexible than single validation set
    - Better user experience

!!! note "Form vs Entity Validation"
    - **Entity validation**: Always runs (database integrity)
    - **Form validation**: Runs when form is submitted (user input)
    - Use both for defense in depth

## Next Steps

Now that your form is complete:

1. **Views** - Create Twig templates that render the form
2. **Controllers** - Use the form in create/edit actions
3. **Testing** - Write tests for form validation

Your form handles user input securely and validates it properly!
