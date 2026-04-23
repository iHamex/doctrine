# Custom DQL Functions

While Doctrine provides a rich set of built-in DQL functions, you will often need to use vendor-specific SQL functions that are not part of the standard DQL parser. Custom DQL functions are a powerful extension point that allows you to add any SQL function you need to DQL.

## Why Create a Custom DQL Function?

-   **Database-Specific Features**: To leverage powerful functions unique to your database, like PostgreSQL's `JSONB` operators or MySQL's `MATCH ... AGAINST` full-text search.
-   **Complex Logic**: To encapsulate complex SQL logic into a reusable function, making your DQL queries cleaner and more readable.
-   **Portability**: To create a single DQL function (e.g., `RAND()`) that intelligently translates to the correct SQL for different database vendors (`RAND()` in MySQL, `RANDOM()` in PostgreSQL).

## The Three Steps to Create a Custom Function

Creating a custom DQL function involves three steps:
1.  **Create a `FunctionNode` class**: This class teaches Doctrine how to parse your function in a DQL query and how to translate it into SQL.
2.  **Register the function**: You tell Doctrine's configuration about your new function.
3.  **Use it in DQL**: You can now use your function in any DQL query.

---

### Step 1: Creating the `FunctionNode` Class

Every custom function must extend `Doctrine\ORM\Query\AST\Functions\FunctionNode`. This class has two abstract methods you must implement:

1.  **`parse(Parser $parser)`**: This method is called by the DQL parser when it encounters your function. Its job is to parse the function's arguments from the DQL string.
2.  **`getSql(SqlWalker $sqlWalker)`**: This method is called by the SQL walker when it's translating the DQL abstract syntax tree (AST) into SQL. Its job is to return the final SQL string for the function.

#### Example: A Simple `RAND()` Function

Let's create a `RAND()` function that works across MySQL and PostgreSQL.

```php
// src/Doctrine/DQL/RandFunction.php
namespace App\Doctrine\DQL;

use Doctrine\DBAL\Platforms\MySQLPlatform;
use Doctrine\DBAL\Platforms\PostgreSQLPlatform;
use Doctrine\ORM\Query\AST\Functions\FunctionNode;
use Doctrine\ORM\Query\Parser;
use Doctrine\ORM\Query\SqlWalker;
use Doctrine\ORM\Query\TokenType;

class RandFunction extends FunctionNode
{
    /**
     * The DQL parser calls this method when it sees your function.
     * We have to parse the function's name and parentheses, but no arguments.
     */
    public function parse(Parser $parser): void
    {
        $parser->match(TokenType::T_IDENTIFIER); // Match the function name
        $parser->match(TokenType::T_OPEN_PARENTHESIS);
        $parser->match(TokenType::T_CLOSE_PARENTHESIS);
    }

    /**
     * The SQL walker calls this method to get the SQL for the function.
     * We check the database platform and return the vendor-specific function name.
     */
    public function getSql(SqlWalker $sqlWalker): string
    {
        $platform = $sqlWalker->getConnection()->getDatabasePlatform();

        if ($platform instanceof PostgreSQLPlatform) {
            return 'RANDOM()';
        }
        
        // Default to RAND() for MySQL and other platforms
        return 'RAND()';
    }
}
```

### Step 2: Registering the Function

Now, you need to tell Doctrine about your new function in your `bootstrap.php` or framework's configuration.

```php
// bootstrap.php
use App\Doctrine\DQL\RandFunction;

// ...
$config->addCustomNumericFunction('RAND', RandFunction::class);
```
-   **`addCustomNumericFunction`**: You must tell Doctrine the return type of your function (`Numeric`, `String`, or `Datetime`) so it can be validated correctly within DQL queries.
-   **`'RAND'`**: The name of the function as it will be used in DQL.
-   **`RandFunction::class`**: The fully qualified class name of your `FunctionNode`.

### Step 3: Using the Function in DQL

You can now use `RAND()` in any DQL query as if it were a built-in function.

```php
$dql = 'SELECT u FROM App\Entity\User u ORDER BY RAND()';
$query = $entityManager->createQuery($dql);
$randomUsers = $query->setMaxResults(5)->getResult();
```
Doctrine will correctly translate this to `ORDER BY RANDOM()` on PostgreSQL and `ORDER BY RAND()` on MySQL.

## A More Advanced Example: `MATCH_AGAINST`

Let's create a function for MySQL's full-text search capability. This function will take arguments.

```php
namespace App\Doctrine\DQL;

// ... (use statements)

class MatchAgainstFunction extends FunctionNode
{
    /** @var array<Node> */
    public array $pathExp = [];
    public $against = null;
    public $mode = null;

    public function parse(Parser $parser): void
    {
        // match(path-expression, path-expression, ...)
        $parser->match(TokenType::T_IDENTIFIER);
        $parser->match(TokenType::T_OPEN_PARENTHESIS);
        
        // First argument is the list of fields to match against
        $this->pathExp[] = $parser->StateFieldPathExpression();
        while ($parser->getLexer()->isNextToken(TokenType::T_COMMA)) {
            $parser->match(TokenType::T_COMMA);
            $this->pathExp[] = $parser->StateFieldPathExpression();
        }

        // against(against-expression [search-mode])
        $parser->match(TokenType::T_AGAINST);
        $this->against = $parser->StringPrimary();
        
        if ($parser->getLexer()->isNextToken(TokenType::T_IDENTIFIER)) {
            $this->mode = $parser->Identifier();
        }
        
        $parser->match(TokenType::T_CLOSE_PARENTHESIS);
    }

    public function getSql(SqlWalker $sqlWalker): string
    {
        $fields = array_map(fn($path) => $path->dispatch($sqlWalker), $this->pathExp);
        $against = $sqlWalker->walkStringPrimary($this->against);
        $mode = $this->mode ? " IN {$this->mode} MODE" : '';
        
        return sprintf('MATCH(%s) AGAINST(%s%s)', implode(', ', $fields), $against, $mode);
    }
}
```

After registering this function as a `CustomStringFunction`, you can use it in DQL:

```php
$dql = "SELECT a FROM App\Entity\Article a WHERE MATCH(a.title, a.content) AGAINST (:search 'BOOLEAN')";
$query = $entityManager->createQuery($dql)->setParameter('search', '+doctrine -orm');
```

This powerful feature allows you to extend DQL to fit the specific needs of your application and database.

## Next Steps

Now that you know how to extend DQL, let's look at how you can create entirely new ways for Doctrine to hydrate query results.

-   **[Custom Hydration](custom-hydration.md)**

