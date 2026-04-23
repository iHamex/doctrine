# Quick Start: Your First Doctrine Project

This guide provides a complete, hands-on walkthrough of a basic Doctrine project. By the end of this chapter, you will have:
1.  Defined a `Product` entity.
2.  Created the corresponding database table.
3.  Performed all basic CRUD (Create, Read, Update, Delete) operations.

This tutorial assumes you have completed the setup in the **[Installation & Setup](installation.md)** chapter and have a working `bootstrap.php` file.

## Step 1: Configure Your Autoloader

Before creating the entity, ensure that Composer knows how to find your classes. Open your `composer.json` and add a `psr-4` autoloading entry for the `App` namespace:

```json
// composer.json
{
    "require": {
        "doctrine/orm": "^2.13"
    },
    "autoload": {
        "psr-4": {
            "App\\": "src/"
        }
    }
}
```

After adding this, run `composer dump-autoload` to regenerate the autoloader files. This tells Composer that any class in the `App\` namespace can be found in the `src/` directory.

## Step 2: Create the Entity

First, let's define the `Product` entity. An entity is a PHP class that represents a database table. Create a new file at `src/Entity/Product.php`:

```php
// src/Entity/Product.php
<?php

namespace App\Entity;

use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ProductRepository::class)]
#[ORM\Table(name: 'products')]
#[ORM\Index(columns: ['name'], name: 'product_name_idx')]
class Product
{
    #[ORM\Id]
    #[ORM\Column(type: Types::INTEGER)]
    #[ORM\GeneratedValue]
    private ?int $id = null;

    #[ORM\Column(type: Types::STRING, length: 255)]
    private string $name;
    
    #[ORM\Column(type: Types::DECIMAL, precision: 10, scale: 2)]
    private string $price;

    #[ORM\Column(type: Types::DATETIME_IMMUTABLE)]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(type: Types::DATETIME_MUTABLE, nullable: true)]
    private ?\DateTimeInterface $updatedAt = null;

    public function __construct(string $name, string $price)
    {
        $this->name = $name;
        $this->price = $price;
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }
    
    public function setName(string $name): void
    {
        $this->name = $name;
    }

    public function getPrice(): string
    {
        return $this->price;
    }

    public function setPrice(string $price): void
    {
        $this->price = $price;
    }
    
    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): ?\DateTimeInterface
    {
        return $this->updatedAt;
    }

    public function setUpdatedAt(\DateTimeInterface $updatedAt): void
    {
        $this->updatedAt = $updatedAt;
    }
}
```

### Key Improvements in this Entity:

-   **Explicit Types**: We are using the `Doctrine\DBAL\Types\Types` constants for column types. This is a best practice that improves readability and prevents typos.
-   **Constructor for Validity**: The constructor now requires a `name` and `price`, ensuring that a `Product` object is always in a valid state upon creation.
-   **Immutable Timestamps**: We use `DateTimeImmutable` and the `DATETIME_IMMUTABLE` type. This is another best practice to prevent accidental modification of creation timestamps.
-   **Precise Price**: The `price` is mapped to a `DECIMAL` type with specified precision and scale, which is crucial for handling monetary values correctly.
-   **Database Index**: We added an `#[ORM\Index]` on the `name` column. This will significantly speed up queries that filter by product name, like the `findOneBy(['name' => ...])` call we'll see later.
-   **Tracking Updates**: A nullable `updatedAt` property has been added to track when a product is modified.

## Step 3: Create the Database Schema

With the entity defined, we can ask Doctrine to create the corresponding `products` table in our database. We'll use Doctrine's command-line tool for this.

From your project's root directory, run:

```bash
vendor/bin/doctrine orm:schema-tool:create
```

You should see the following output, reflecting our more detailed entity:

```
ATTENTION: This operation should not be executed in a production environment.
           ...
           
Processing entity "App\Entity\Product"
CREATE TABLE products (id INT AUTO_INCREMENT NOT NULL, name VARCHAR(255) NOT NULL, price NUMERIC(10, 2) NOT NULL, created_at DATETIME NOT NULL COMMENT '(DC2Type:datetime_immutable)', updated_at DATETIME DEFAULT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB;
CREATE INDEX product_name_idx ON products (name);
Schema-Tool successful!
```

**What just happened?** Doctrine connected to your database, read the mapping metadata from the `Product` entity, and executed the `CREATE TABLE` and `CREATE INDEX` SQL statements. Your database now has a `products` table ready to go.

!!! warning "Development vs. Production"
    The `orm:schema-tool` is excellent for development and getting started. However, for production, you must use **[Migrations](migrations.md)** to manage schema changes without losing data.

## Step 4: A Complete CRUD Example

Now for the fun part. Let's create a script that performs the full Create, Read, Update, and Delete cycle. Create a new file named `quick-start.php` in your project root:

```php
// quick-start.php
<?php

use App\Entity\Product;

require_once "bootstrap.php";

// Helper function for display
function displayProducts(array $products): void
{
    foreach ($products as $product) {
        echo sprintf("- [%d] %s - $%s\n", $product->getId(), $product->getName(), $product->getPrice());
    }
    echo "\n";
}

// 1. Create new Products
echo "--- CREATING ---\n";
$keyboard = new Product('Keyboard', '19.99');
$mouse = new Product('Mouse', '9.99');

$entityManager->persist($keyboard);
$entityManager->persist($mouse);
$entityManager->flush();

echo "Created Product with ID " . $keyboard->getId() . "\n";
echo "Created Product with ID " . $mouse->getId() . "\n\n";

// 2. Read Products
echo "--- READING ---\n";
$productRepository = $entityManager->getRepository(Product::class);

// Find all products
$allProducts = $productRepository->findAll();
echo "All Products:\n";
displayProducts($allProducts);

// Find a single product by its name
$product = $productRepository->findOneBy(['name' => 'Keyboard']);
echo "Found Product by name 'Keyboard':\n";
echo sprintf("- [%d] %s\n\n", $product->getId(), $product->getName());

// 3. Update a Product
echo "--- UPDATING ---\n";
$product->setName('Wireless Keyboard');
$product->setPrice('29.99');
$product->setUpdatedAt(new \DateTime());
$entityManager->flush();

echo sprintf("Updated Product ID %d to '%s' with price $%s\n\n", $product->getId(), $product->getName(), $product->getPrice());

// 4. Delete a Product
echo "--- DELETING ---\n";
$entityManager->remove($mouse);
$entityManager->flush();

echo "Deleted product with ID " . $mouse->getId() . "\n";

$allProducts = $productRepository->findAll();
echo "All remaining products:\n";
displayProducts($allProducts);
```

Now, run this script from your terminal:

```bash
php quick-start.php
```

### Expected Output:

```
--- CREATING ---
Created Product with ID 1
Created Product with ID 2

--- READING ---
All Products:
- [1] Keyboard - $19.99
- [2] Mouse - $9.99

Found Product by name 'Keyboard':
- [1] Keyboard

--- UPDATING ---
Updated Product ID 1 to 'Wireless Keyboard' with price $29.99

--- DELETING ---
Deleted product with ID 2
All remaining products:
- [1] Wireless Keyboard - $29.99

```

### Dissecting the Script:

-   **`require_once "bootstrap.php";`**: This line loads the Doctrine configuration and gives us the global `$entityManager` variable.
-   **`new Product(...)`**: We create new `Product` instances using our constructor.
-   **`$entityManager->persist($product);`**: This tells Doctrine to start "managing" the `$product` object. It doesn't execute any SQL yet. We can persist multiple objects before flushing.
-   **`$entityManager->flush();`**: This is the most important method. Doctrine inspects all managed objects and executes the necessary SQL to synchronize the database. In the "Create" step, it issues two `INSERT` statements inside a transaction.
-   **`$entityManager->getRepository(...)`**: Repositories are objects that help you find entities. 
-   **`findAll()` and `findOneBy()`**: The default repository has helpful methods like `find()`, `findAll()`, and `findOneBy()` for common queries.
-   **Updating**: Notice that we did not call `persist()` when updating. Doctrine's **Unit of Work** automatically keeps track of all managed entities. When you call `flush()`, it compares the current state of the entity with its original state and automatically issues an `UPDATE` statement for any changed fields. This is also where lifecycle callbacks can be powerful; you could automatically set the `updatedAt` field using a `PreUpdate` event listener instead of calling the setter manually.
-   **`$entityManager->remove($product);`**: This marks an entity for deletion. The actual `DELETE` statement is executed on the next `flush()`.

!!! tip "Custom Repository Logic"
    For more complex queries, you can create a custom repository class for your entity. This allows you to centralize query logic and keep your application code clean. We'll cover this in detail in the **[Repositories](repositories.md)** chapter.

!!! warning "The Identity Map"
    Doctrine uses a pattern called the **Identity Map** to ensure that you always get the same PHP object instance for a specific entity within a single request. If you were to fetch the same product multiple times, Doctrine would return the exact same `$product` object from memory after the first query.
    ```php
    $product1 = $productRepository->find(1);
    $product2 = $productRepository->find(1);
    
    // This will be true!
    // var_dump($product1 === $product2);
    ```
    This is a powerful feature for performance and consistency, but it's crucial to understand. Changes made to `$product1` will be reflected in `$product2` because they are the same object.

## Summary

Congratulations! You've successfully completed the entire lifecycle of an entity with Doctrine. You've learned how to:
-   Configure Composer's autoloader for your entities.
-   Define a robust entity with a constructor, explicit types, and immutable timestamps.
-   Use the CLI to create the database schema.
-   Persist, find, update, and remove entities using the `EntityManager`.
-   Use basic repository methods like `findAll()` and `findOneBy()`.
-   Recognize the importance of database indexes and the Identity Map pattern.

## Next Steps

Now that you've seen the whole workflow, it's time to dive deeper into how entities are defined and mapped. Head over to the **[Entity Basics](entity-basics.md)** chapter.

