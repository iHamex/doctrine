# Custom Hydration

Hydration is the process Doctrine uses to transform a raw, tabular database result set into a specific data structure, such as an array of objects. While Doctrine's built-in hydrators (`HYDRATE_OBJECT`, `HYDRATE_ARRAY`, etc.) are suitable for most cases, you can create your own custom hydrators for highly specialized querying needs.

## Why Create a Custom Hydrator?

Custom hydrators are an advanced feature and should be used when you need to:
-   **Optimize for a specific data shape**: Transform a result set into a highly specific array structure (e.g., a key-value map, a tree) in a very performant way, directly from the database result stream.
-   **Reduce memory usage**: For very large result sets, a custom hydrator can process one row at a time without loading the entire result set into an intermediate array first.
-   **Implement unique result types**: Create completely new ways of representing data that don't fit the object or array models.

!!! warning "When NOT to Use a Custom Hydrator"
    Do not use a custom hydrator for simple data transformations that can be done in PHP after the query. If you just need to re-key an array or filter some values, it's simpler and more maintainable to do this in your application code after fetching the results with a standard hydrator.

## The Three Steps to Create a Custom Hydrator

1.  **Create a Hydrator class**: This class extends `AbstractHydrator` and implements the hydration logic.
2.  **Register the hydrator**: You tell Doctrine's configuration about your new hydrator and give it a name.
3.  **Use it in a query**: You pass the hydrator's name to the `getResult()` or `getArrayResult()` method.

---

### Step 1: Creating the Hydrator Class

A custom hydrator must extend `Doctrine\ORM\Internal\Hydration\AbstractHydrator`. The only method you are required to implement is `hydrateAllData()`. This method is responsible for iterating over the raw database statement result and building the final hydrated value.

#### Example: A Key-Value Hydrator

Let's create a hydrator that is perfect for fetching a list of settings or options. It will transform a two-column result set into a single associative array.

```php
// DQL Query: SELECT c.key, c.value FROM App\Entity\Config c
// Result Needed: ['site_name' => 'My App', 'maintenance_mode' => 'false']
```

```php
// src/Doctrine/Hydrator/KeyValueHydrator.php
namespace App\Doctrine\Hydrator;

use Doctrine\ORM\Internal\Hydration\AbstractHydrator;

class KeyValueHydrator extends AbstractHydrator
{
    protected function hydrateAllData(): array
    {
        $result = [];
        // The _stmt property holds the raw PDO/DBAL statement
        while ($row = $this->_stmt->fetchAssociative()) {
            // Assumes the first selected column is the key
            // and the second is the value.
            $key = array_shift($row);
            $value = array_shift($row);
            $result[$key] = $value;
        }

        return $result;
    }
}
```

### Step 2: Registering the Hydrator

In your application's bootstrap file, you need to register your new hydrator with the `EntityManager`'s configuration.

```php
// bootstrap.php
use App\Doctrine\Hydrator\KeyValueHydrator;

// ...
$config->addCustomHydrationMode('KeyValueHydrator', KeyValueHydrator::class);
```
-   **`'KeyValueHydrator'`**: The unique name you will use to reference this hydrator in your queries.
-   **`KeyValueHydrator::class`**: The fully qualified class name of your hydrator.

### Step 3: Using the Custom Hydrator

Now you can use your custom hydrator by passing its name as an argument to `getResult()`.

```php
$dql = 'SELECT c.key, c.value FROM App\Entity\Config c';
$query = $entityManager->createQuery($dql);

$configArray = $query->getResult('KeyValueHydrator');

// $configArray is now:
// ['site_name' => 'My App', 'maintenance_mode' => 'false']
```

## Advanced Example: Grouping Hydrator

Let's imagine a more complex scenario. We want to fetch a list of articles and group their tags by the article ID.

```php
/*
Desired Result:
[
    101 => ['PHP', 'Doctrine'],
    102 => ['Symphony', 'Performance'],
]
*/

// src/Doctrine/Hydrator/GroupedTagHydrator.php
namespace App\Doctrine\Hydrator;

use Doctrine\ORM\Internal\Hydration\AbstractHydrator;

class GroupedTagHydrator extends AbstractHydrator
{
    protected function hydrateAllData(): array
    {
        $result = [];
        while ($row = $this->_stmt->fetchAssociative()) {
            $id = $row['id'];
            if (!isset($result[$id])) {
                $result[$id] = [];
            }
            $result[$id][] = $row['name'];
        }

        return $result;
    }
}
```

After registering this hydrator as `'GroupedTagHydrator'`, you can use it like this:

```php
$dql = 'SELECT a.id, t.name FROM App\Entity\Article a JOIN a.tags t ORDER BY a.id';
$query = $entityManager->createQuery($dql);
$groupedTags = $query->getResult('GroupedTagHydrator');
```
This is significantly more performant for large result sets than fetching all the data with `getArrayResult()` and then looping over it in PHP to build the grouped array, because the custom hydrator processes the result stream directly.

## Next Steps

Now that you've mastered Doctrine's querying and hydration capabilities, the next chapters will focus on performance tuning.

-   **[Performance](performance.md)**
-   **[Second-Level Cache](second-level-cache.md)**

