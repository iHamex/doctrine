# Views (Twig Templates)

Twig is Symfony's templating engine that separates presentation logic from business logic. We'll create clean, maintainable templates for listing, creating, viewing, and editing users.

## Why Twig?

**Benefits:**

- **Secure**: Auto-escaping prevents XSS attacks
- **Readable**: Clean, readable syntax
- **Powerful**: Filters, functions, and inheritance
- **Maintainable**: Template inheritance reduces duplication
- **Fast**: Compiled templates are cached

## Base Layout Template

Create `templates/base.html.twig`:

```twig
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}User Management{% endblock %}</title>
    
    {# Pico CSS for simple, beautiful styling #}
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css">
    
    {# Custom styles #}
    <style>
        .flash-messages {
            margin-bottom: 1rem;
        }
        .flash-messages .alert {
            padding: 1rem;
            border-radius: 0.25rem;
            margin-bottom: 0.5rem;
        }
        .flash-messages .success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .flash-messages .error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
    </style>
</head>
<body>
    <main class="container">
        {# Navigation #}
        <nav>
            <ul>
                <li><strong>User Management</strong></li>
            </ul>
            <ul>
                <li><a href="{{ path('user_index') }}">Users</a></li>
                {% if app.user %}
                    <li><a href="{{ path('logout') }}">Logout ({{ app.user.email }})</a></li>
                {% else %}
                    <li><a href="{{ path('login') }}">Login</a></li>
                {% endif %}
            </ul>
        </nav>

        {# Flash messages - temporary messages from controllers #}
        <div class="flash-messages">
            {% for label, messages in app.flashes %}
                {% for message in messages %}
                    <div class="alert {{ label }}">{{ message }}</div>
                {% endfor %}
            {% endfor %}
        </div>

        {# Page content - overridden by child templates #}
        {% block body %}{% endblock %}
    </main>
</body>
</html>
```

**Explanation:**

- `{% block title %}` - Overridable title block
- `{% block body %}` - Main content area for child templates
- `app.flashes` - Access to flash messages set in controllers
- `app.user` - Current authenticated user (null if not logged in)
- `path('route_name')` - Generate URLs from route names

## User Index (List) Template

Create `templates/user/index.html.twig`:

```twig
{% extends 'base.html.twig' %}

{% block title %}Users - {{ parent() }}{% endblock %}

{% block body %}
    <h1>Users</h1>

    {# Search and filter form #}
    <form method="get" action="{{ path('user_index') }}">
        <div class="grid">
            <div>
                <label for="search">Search</label>
                <input 
                    type="search" 
                    id="search" 
                    name="q" 
                    value="{{ criteria.q ?? '' }}" 
                    placeholder="Search by name or email..."
                />
            </div>
            <div>
                <label>
                    <input 
                        type="checkbox" 
                        name="active" 
                        value="1" 
                        {% if criteria.active %}checked{% endif %}
                    />
                    Active only
                </label>
            </div>
            <div>
                <button type="submit">Filter</button>
                <a href="{{ path('user_index') }}" role="button" class="secondary">Clear</a>
            </div>
        </div>
    </form>

    {# Create new user button #}
    <p>
        <a href="{{ path('user_new') }}" role="button">Create New User</a>
    </p>

    {# Users table #}
    <table>
        <thead>
            <tr>
                {# Sortable email column #}
                <th>
                    <a href="{{ path('user_index', {
                        'q': criteria.q,
                        'active': criteria.active,
                        'sort': 'email',
                        'dir': (criteria.sort == 'email' and criteria.dir == 'asc') ? 'desc' : 'asc'
                    }) }}">
                        Email
                        {% if criteria.sort == 'email' %}
                            {% if criteria.dir == 'asc' %}↑{% else %}↓{% endif %}
                        {% endif %}
                    </a>
                </th>
                
                {# Sortable last name column #}
                <th>
                    <a href="{{ path('user_index', {
                        'q': criteria.q,
                        'active': criteria.active,
                        'sort': 'lastName',
                        'dir': (criteria.sort == 'lastName' and criteria.dir == 'asc') ? 'desc' : 'asc'
                    }) }}">
                        Name
                        {% if criteria.sort == 'lastName' %}
                            {% if criteria.dir == 'asc' %}↑{% else %}↓{% endif %}
                        {% endif %}
                    </a>
                </th>
                
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            {% if items|length > 0 %}
                {% for user in items %}
                    <tr>
                        <td>
                            <a href="{{ path('user_show', {id: user.id}) }}">
                                {{ user.email }}
                            </a>
                        </td>
                        <td>{{ user.firstName }} {{ user.lastName }}</td>
                        <td>
                            {% if user.isActive %}
                                <span class="badge">Active</span>
                            {% else %}
                                <span class="badge secondary">Inactive</span>
                            {% endif %}
                        </td>
                        <td>{{ user.createdAt|date('Y-m-d H:i') }}</td>
                        <td>
                            <a href="{{ path('user_show', {id: user.id}) }}">View</a>
                            <a href="{{ path('user_edit', {id: user.id}) }}">Edit</a>
                            
                            {# Delete button with CSRF protection #}
                            {% if is_granted('USER_DELETE', user) %}
                                <form 
                                    action="{{ path('user_delete', {id: user.id}) }}" 
                                    method="post" 
                                    style="display: inline;"
                                    onsubmit="return confirm('Are you sure you want to delete {{ user.email }}?');"
                                >
                                    <input type="hidden" name="_token" value="{{ csrf_token('delete' ~ user.id) }}">
                                    <button type="submit" class="secondary">Delete</button>
                                </form>
                            {% endif %}
                        </td>
                    </tr>
                {% endfor %}
            {% else %}
                <tr>
                    <td colspan="5" style="text-align: center;">
                        No users found.
                    </td>
                </tr>
            {% endif %}
        </tbody>
    </table>

    {# Pagination #}
    {% set totalPages = (total / perPage)|round(0, 'ceil') %}
    {% if totalPages > 1 %}
        <nav>
            <ul>
                {# Previous page #}
                {% if page > 1 %}
                    <li>
                        <a href="{{ path('user_index', criteria|merge({page: page - 1})) }}">
                            ← Previous
                        </a>
                    </li>
                {% endif %}

                {# Page numbers #}
                {% for p in 1..totalPages %}
                    {% if p == page %}
                        <li><strong>{{ p }}</strong></li>
                    {% elseif p == 1 or p == totalPages or (p >= page - 2 and p <= page + 2) %}
                        <li>
                            <a href="{{ path('user_index', criteria|merge({page: p})) }}">
                                {{ p }}
                            </a>
                        </li>
                    {% elseif p == page - 3 or p == page + 3 %}
                        <li><span>...</span></li>
                    {% endif %}
                {% endfor %}

                {# Next page #}
                {% if page < totalPages %}
                    <li>
                        <a href="{{ path('user_index', criteria|merge({page: page + 1})) }}">
                            Next →
                        </a>
                    </li>
                {% endif %}
            </ul>
        </nav>

        <p>
            Showing {{ ((page - 1) * perPage) + 1 }} to 
            {{ min(page * perPage, total) }} of {{ total }} users
        </p>
    {% endif %}
{% endblock %}
```

**Key Twig features used:**

- `{% extends %}` - Template inheritance
- `{{ parent() }}` - Include parent block content
- `|` - Filters (e.g., `|date`, `|length`)
- `{% if %}` - Conditionals
- `{% for %}` - Loops
- `path()` - URL generation
- `is_granted()` - Security checks
- `csrf_token()` - CSRF token generation
- `merge` - Array merging for query parameters

## User Show (Detail) Template

Create `templates/user/show.html.twig`:

```twig
{% extends 'base.html.twig' %}

{% block title %}{{ user.email }} - {{ parent() }}{% endblock %}

{% block body %}
    <h1>{{ user.email }}</h1>

    <div class="grid">
        <div>
            <article>
                <header>
                    <h2>User Details</h2>
                </header>
                
                <p><strong>Email:</strong> {{ user.email }}</p>
                <p><strong>Name:</strong> {{ user.firstName }} {{ user.lastName }}</p>
                <p><strong>Status:</strong> 
                    {% if user.isActive %}
                        <span class="badge">Active</span>
                    {% else %}
                        <span class="badge secondary">Inactive</span>
                    {% endif %}
                </p>
                <p><strong>Roles:</strong> {{ user.roles|join(', ') }}</p>
                <p><strong>Created:</strong> {{ user.createdAt|date('F j, Y g:i A') }}</p>
                <p><strong>Last Updated:</strong> {{ user.updatedAt|date('F j, Y g:i A') }}</p>

                <footer>
                    <a href="{{ path('user_edit', {id: user.id}) }}" role="button">Edit</a>
                    <a href="{{ path('user_index') }}" role="button" class="secondary">Back to List</a>
                    
                    {% if is_granted('USER_DELETE', user) %}
                        <form 
                            action="{{ path('user_delete', {id: user.id}) }}" 
                            method="post" 
                            style="display: inline;"
                            onsubmit="return confirm('Are you sure you want to delete this user?');"
                        >
                            <input type="hidden" name="_token" value="{{ csrf_token('delete' ~ user.id) }}">
                            <button type="submit" class="contrast">Delete</button>
                        </form>
                    {% endif %}
                </footer>
            </article>
        </div>
    </div>
{% endblock %}
```

**Explanation:**

- `{{ user.email }}` - Access entity properties
- `|join(', ')` - Join array with separator
- `|date('F j, Y g:i A')` - Format date (e.g., "January 15, 2024 2:30 PM")
- `is_granted()` - Check permissions before showing delete button

## Form Template (Reusable)

Create `templates/user/_form.html.twig`:

```twig
{# Form partial - included in new.html.twig and edit.html.twig #}
{{ form_start(form, {'attr': {'novalidate': 'novalidate'}}) }}
    {# Render all form fields automatically #}
    {{ form_widget(form) }}
    
    {# Or render fields individually for more control: #}
    {#
    <div>
        {{ form_label(form.email) }}
        {{ form_widget(form.email) }}
        {{ form_errors(form.email) }}
        {{ form_help(form.email) }}
    </div>
    
    <div>
        {{ form_label(form.firstName) }}
        {{ form_widget(form.firstName) }}
        {{ form_errors(form.firstName) }}
    </div>
    
    <div>
        {{ form_label(form.lastName) }}
        {{ form_widget(form.lastName) }}
        {{ form_errors(form.lastName) }}
    </div>
    
    <div>
        {{ form_label(form.isActive) }}
        {{ form_widget(form.isActive) }}
        {{ form_errors(form.isActive) }}
    </div>
    
    <div>
        {{ form_label(form.plainPassword) }}
        {{ form_widget(form.plainPassword) }}
        {{ form_errors(form.plainPassword) }}
        {{ form_help(form.plainPassword) }}
    </div>
    #}
    
    <div>
        <button type="submit">Save</button>
        <a href="{{ path('user_index') }}" role="button" class="secondary">Cancel</a>
    </div>
{{ form_end(form) }}
```

**Form rendering functions:**

- `form_start()` - Opening `<form>` tag with CSRF token
- `form_widget()` - Render field input
- `form_label()` - Render field label
- `form_errors()` - Render validation errors
- `form_help()` - Render help text
- `form_end()` - Closing `</form>` tag

## User New (Create) Template

Create `templates/user/new.html.twig`:

```twig
{% extends 'base.html.twig' %}

{% block title %}Create User - {{ parent() }}{% endblock %}

{% block body %}
    <h1>Create New User</h1>

    {# Include the form partial #}
    {% include 'user/_form.html.twig' with {'form': form} %}
{% endblock %}
```

**Explanation:**

- `{% include %}` - Include another template
- `with {'form': form}` - Pass variables to included template

## User Edit Template

Create `templates/user/edit.html.twig`:

```twig
{% extends 'base.html.twig' %}

{% block title %}Edit {{ user.email }} - {{ parent() }}{% endblock %}

{% block body %}
    <h1>Edit User: {{ user.email }}</h1>

    {# Show current user info #}
    <p>Editing: <strong>{{ user.firstName }} {{ user.lastName }}</strong></p>

    {# Include the form partial #}
    {% include 'user/_form.html.twig' with {'form': form} %}
{% endblock %}
```

## Twig Filters Reference

**Common filters:**

- `|date('Y-m-d')` - Format date
- `|upper` - Convert to uppercase
- `|lower` - Convert to lowercase
- `|length` - Get array/string length
- `|join(', ')` - Join array with separator
- `|default('N/A')` - Default value if empty
- `|escape` - Escape HTML (automatic in most cases)
- `|raw` - Output raw HTML (use carefully!)

**Examples:**

```twig
{{ user.email|upper }}                    {# JOHN@EXAMPLE.COM #}
{{ user.roles|join(', ') }}               {# ROLE_USER, ROLE_ADMIN #}
{{ user.createdAt|date('Y-m-d') }}       {# 2024-01-15 #}
{{ user.firstName|default('Unknown') }}   {# John or Unknown #}
```

## Security in Templates

**Auto-escaping:**

- Twig automatically escapes output to prevent XSS
- `{{ user.email }}` - Safe, automatically escaped
- `{{ user.email|raw }}` - Unsafe, outputs raw HTML (only if you trust the data!)

**CSRF tokens:**
```twig
{# Automatic in forms #}
{{ form_start(form) }}  {# Includes CSRF token #}

{# Manual for non-form submissions #}
<input type="hidden" name="_token" value="{{ csrf_token('delete' ~ user.id) }}">
```

**Authorization checks:**
```twig
{# Only show if user has permission #}
{% if is_granted('USER_DELETE', user) %}
    <form action="{{ path('user_delete', {id: user.id}) }}" method="post">
        {# Delete button #}
    </form>
{% endif %}
```

## Template Inheritance

**How it works:**

1. Base template defines blocks (`{% block body %}`)
2. Child template extends base (`{% extends 'base.html.twig' %}`)
3. Child template overrides blocks (`{% block body %}...{% endblock %}`)
4. Child can include parent content (`{{ parent() }}`)

**Example:**
```twig
{# base.html.twig #}
<title>{% block title %}Default Title{% endblock %}</title>

{# child.html.twig #}
{% block title %}My Page - {{ parent() }}{% endblock %}
{# Result: "My Page - Default Title" #}
```

## Pagination Logic Explained

**Calculating total pages:**
```twig
{% set totalPages = (total / perPage)|round(0, 'ceil') %}
```

- `total` - Total number of records
- `perPage` - Items per page
- `|round(0, 'ceil')` - Round up to nearest integer

**Showing page range:**
```twig
Showing {{ ((page - 1) * perPage) + 1 }} to {{ min(page * perPage, total) }} of {{ total }} users
```

- Page 1: "Showing 1 to 20 of 100 users"
- Page 2: "Showing 21 to 40 of 100 users"
- Page 5: "Showing 81 to 100 of 100 users"

**Smart pagination (ellipsis):**
```twig
{% if p == 1 or p == totalPages or (p >= page - 2 and p <= page + 2) %}
    {# Show page number #}
{% elseif p == page - 3 or p == page + 3 %}
    {# Show ellipsis #}
{% endif %}
```

Shows: `1 ... 8 9 [10] 11 12 ... 50` (current page highlighted)

## Best Practices

!!! tip "Template Organization"
    - Use `_` prefix for partials (e.g., `_form.html.twig`)
    - Keep templates in subdirectories matching controllers
    - Reuse partials to avoid duplication

!!! warning "Security"
    - Always use `is_granted()` before showing sensitive actions
    - Never use `|raw` filter with user input
    - Always include CSRF tokens in forms

!!! note "Performance"
    - Twig templates are compiled and cached
    - Use `{% cache %}` tag for expensive operations (if using cache bundle)
    - Minimize database queries in templates (use eager loading)

## Next Steps

Now that your templates are complete:

1. **Styling** - Customize CSS to match your design
2. **JavaScript** - Add interactive features if needed
3. **Testing** - Test templates with different data scenarios

Your user management interface is ready!
