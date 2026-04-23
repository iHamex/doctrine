# Deployment & Environment

Deploying to production requires careful preparation. This guide covers environment configuration, build processes, database migrations, and production best practices.

## Environment Configuration

### Environment Variables

Symfony uses environment variables for configuration. Never commit sensitive data.

**`.env` (committed, defaults):**
```dotenv
APP_ENV=dev
APP_SECRET=your-secret-key-change-this-in-production
DATABASE_URL=postgresql://app:app@127.0.0.1:5432/usermgmt?serverVersion=16&charset=utf8
```

**`.env.local` (gitignored, local overrides):**
```dotenv
DATABASE_URL=postgresql://localhost:5432/mydb
APP_SECRET=my-local-secret
```

**`.env.prod` (gitignored, production):**
```dotenv
APP_ENV=prod
APP_DEBUG=0
APP_SECRET=very-long-random-string-from-secrets-vault
DATABASE_URL=postgresql://prod-user:prod-pass@prod-db:5432/prod-db?serverVersion=16
```

### Production Environment Variables

**Required variables:**

- `APP_ENV=prod` - Production environment
- `APP_DEBUG=0` - Disable debug mode
- `APP_SECRET` - Long random string (32+ characters)
- `DATABASE_URL` - Production database connection

**Generate APP_SECRET:**
```bash
php -r "echo bin2hex(random_bytes(32));"
```

**Set in production:**
```bash
# On server
export APP_ENV=prod
export APP_DEBUG=0
export APP_SECRET=your-generated-secret
export DATABASE_URL=postgresql://...
```

Or use platform-specific secrets management (AWS Secrets Manager, etc.)

## Build Process

### Step 1: Install Dependencies

```bash
# Production build (no dev dependencies)
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction
```

**Flags:**

- `--no-dev` - Skip development dependencies
- `--prefer-dist` - Use distribution packages (faster)
- `--optimize-autoloader` - Optimize autoloader (faster)
- `--no-interaction` - Don't prompt for input

### Step 2: Clear and Warm Cache

```bash
# Clear old cache
php bin/console cache:clear --env=prod --no-warmup

# Warm up cache (pre-generate)
php bin/console cache:warmup --env=prod
```

**Why warm cache:**

- Pre-generates compiled containers
- Pre-compiles Twig templates
- Pre-generates route cache
- Faster first request

### Step 3: Build Assets (if using Webpack Encore)

```bash
npm install
npm run build
```

### Complete Build Script

Create `scripts/deploy.sh`:

```bash
#!/bin/bash
set -e  # Exit on error

echo "Building application..."

# Install dependencies
composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction

# Clear and warm cache
php bin/console cache:clear --env=prod --no-warmup
php bin/console cache:warmup --env=prod

# Run database migrations
php bin/console doctrine:migrations:migrate --env=prod --no-interaction

echo "Build complete!"
```

**Make executable:**
```bash
chmod +x scripts/deploy.sh
```

## Database Migrations

### Running Migrations in Production

```bash
# Check migration status
php bin/console doctrine:migrations:status --env=prod

# Run pending migrations
php bin/console doctrine:migrations:migrate --env=prod --no-interaction
```

**Best practices:**

- Always backup database before migrations
- Test migrations on staging first
- Run migrations during low-traffic periods
- Monitor migration execution

### Zero-Downtime Migrations

**Strategy 1: Backward-compatible changes**

```php
// Migration adds nullable column
public function up(Schema $schema): void
{
    $this->addSql('ALTER TABLE users ADD COLUMN new_field VARCHAR(255) NULL');
}

// Application code handles both old and new
// Deploy application
// Populate new field
// Make field required in next migration
```

**Strategy 2: Blue-green deployment**

1. Deploy to new environment (blue)
2. Run migrations on blue
3. Switch traffic to blue
4. Keep green as backup

**Strategy 3: Online migration tools**

For large tables, use database-specific tools:

- PostgreSQL: `pg_repack`
- MySQL: `pt-online-schema-change`

## Web Server Configuration

### PHP-FPM Configuration

**`/etc/php/8.2/fpm/pool.d/www.conf`:**
```ini
[www]
user = www-data
group = www-data
listen = /run/php/php8.2-fpm.sock
pm = dynamic
pm.max_children = 50
pm.start_servers = 5
pm.min_spare_servers = 5
pm.max_spare_servers = 35
```

### Nginx Configuration

**`/etc/nginx/sites-available/usermgmt`:**
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/usermgmt/public;

    location / {
        try_files $uri /index.php$is_args$args;
    }

    location ~ ^/index\.php(/|$) {
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_split_path_info ^(.+\.php)(/.*)$;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name;
        fastcgi_param DOCUMENT_ROOT $realpath_root;
        internal;
    }

    location ~ \.php$ {
        return 404;
    }

    # Deny access to sensitive files
    location ~ /\. {
        deny all;
    }
}
```

**Enable site:**
```bash
ln -s /etc/nginx/sites-available/usermgmt /etc/nginx/sites-enabled/
nginx -t  # Test configuration
systemctl reload nginx
```

### Apache Configuration

**`.htaccess` in `public/` directory:**
```apache
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/public/
    RewriteRule ^(.*)$ /public/$1 [L]
</IfModule>
```

**Virtual host:**
```apache
<VirtualHost *:80>
    ServerName your-domain.com
    DocumentRoot /var/www/usermgmt/public
    
    <Directory /var/www/usermgmt/public>
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

## File Permissions

**Set correct permissions:**
```bash
# Set ownership
sudo chown -R www-data:www-data /var/www/usermgmt

# Set directory permissions
find /var/www/usermgmt -type d -exec chmod 755 {} \;

# Set file permissions
find /var/www/usermgmt -type f -exec chmod 644 {} \;

# Make scripts executable
chmod +x /var/www/usermgmt/bin/console

# Writable directories
chmod -R 775 /var/www/usermgmt/var
chmod -R 775 /var/www/usermgmt/public/uploads
```

## Logging & Monitoring

### Log Configuration

**`config/packages/monolog.yaml`:**
```yaml
monolog:
  handlers:
    main:
      type: fingers_crossed
      action_level: error
      handler: nested
      excluded_404s:
        - ^/
    nested:
      type: stream
      path: "%kernel.logs_dir%/%kernel.environment%.log"
      level: debug
    console:
      type: console
      process_psr_3_messages: false
```

### Log Aggregation

**Ship logs to aggregator:**

- ELK Stack (Elasticsearch, Logstash, Kibana)
- Graylog
- CloudWatch (AWS)
- Application Insights (Azure)

**Example: Send to syslog**
```yaml
monolog:
  handlers:
    syslog:
      type: syslog
      level: error
```

## Health Checks

### Health Check Endpoint

Create `src/Controller/HealthController.php`:

```php
<?php

namespace App\Controller;

use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

class HealthController extends AbstractController
{
    #[Route('/health', name: 'health_check')]
    public function health(EntityManagerInterface $em): JsonResponse
    {
        try {
            // Check database connection
            $em->getConnection()->connect();
            
            return new JsonResponse([
                'status' => 'ok',
                'database' => 'connected',
                'timestamp' => (new \DateTime())->format('c'),
            ]);
        } catch (\Exception $e) {
            return new JsonResponse([
                'status' => 'error',
                'database' => 'disconnected',
                'error' => $e->getMessage(),
            ], 503);
        }
    }
}
```

**Use in load balancer:**

- Configure health check URL: `/health`
- Expected response: 200 OK
- Check interval: 30 seconds

## Security Checklist

**Before deploying:**

- [ ] `APP_ENV=prod`
- [ ] `APP_DEBUG=0`
- [ ] `APP_SECRET` is strong and unique
- [ ] Database credentials are secure
- [ ] File permissions are correct
- [ ] Sensitive files are not web-accessible
- [ ] HTTPS is enabled
- [ ] Security headers are configured
- [ ] CSRF protection is enabled
- [ ] Rate limiting is configured

## Deployment Checklist

**Pre-deployment:**

- [ ] Run tests: `php bin/phpunit`
- [ ] Check code quality: `php bin/console lint:yaml`
- [ ] Backup database
- [ ] Review migration files
- [ ] Update environment variables

**Deployment:**

- [ ] Pull latest code
- [ ] Install dependencies: `composer install --no-dev --optimize-autoloader`
- [ ] Run migrations: `php bin/console doctrine:migrations:migrate --no-interaction`
- [ ] Clear cache: `php bin/console cache:clear --env=prod`
- [ ] Warm cache: `php bin/console cache:warmup --env=prod`
- [ ] Set file permissions
- [ ] Restart PHP-FPM: `systemctl restart php8.2-fpm`

**Post-deployment:**

- [ ] Verify health check: `curl https://your-domain.com/health`
- [ ] Test critical functionality
- [ ] Monitor logs for errors
- [ ] Check performance metrics

## Rollback Procedure

**If deployment fails:**

```bash
# 1. Revert code
git checkout previous-version

# 2. Rebuild
composer install --no-dev --optimize-autoloader --no-interaction
php bin/console cache:clear --env=prod --no-warmup
php bin/console cache:warmup --env=prod

# 3. Rollback migrations (if needed)
php bin/console doctrine:migrations:migrate prev --env=prod --no-interaction

# 4. Restart services
systemctl restart php8.2-fpm
```

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
      
      - name: Install dependencies
        run: composer install --no-dev --optimize-autoloader --no-interaction
      
      - name: Run tests
        run: php bin/phpunit
      
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.HOST }}
          username: ${{ secrets.USERNAME }}
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /var/www/usermgmt
            git pull
            composer install --no-dev --optimize-autoloader --no-interaction
            php bin/console cache:clear --env=prod --no-warmup
            php bin/console cache:warmup --env=prod
            php bin/console doctrine:migrations:migrate --env=prod --no-interaction
            systemctl restart php8.2-fpm
```

## Best Practices

!!! warning "Never Commit Secrets"

    - Use environment variables
    - Use Symfony Secrets component
    - Use platform secrets management (AWS, Azure, etc.)

!!! tip "Deployment Strategy"

    - Test on staging first
    - Deploy during low-traffic periods
    - Have rollback plan ready
    - Monitor after deployment

!!! note "Database Migrations"

    - Always backup before migrations
    - Test migrations on staging
    - Use backward-compatible migrations when possible
    - Monitor migration execution time

## Next Steps

Now that deployment is configured:

1. **Automate** - Set up CI/CD pipeline
2. **Monitor** - Set up logging and monitoring
3. **Document** - Create runbook for your team

Your application is ready for production!
