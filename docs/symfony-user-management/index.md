# Symfony User Management (Real‑World CRUD with Doctrine)

Build a production‑grade User Management feature using Symfony 7.x and Doctrine ORM 3.x. This mini‑project walks from zero to one hundred: project setup, entity design and mapping, repositories and queries, CRUD controllers, forms and validation, Twig views, authentication and authorization, testing, performance, and deployment.

## What you will build

- A complete User CRUD with listing, search, sort, pagination
- Create/Edit forms with server‑side validation
- Secure password hashing, roles, voters, and access control
- Clean repository layer with query patterns
- Fixtures and functional tests
- Pragmatic performance practices (indexes, pagination, caching)

## Target stack

- Symfony 7.x (FrameworkBundle, Security, Validator, Form, Twig, Maker, Migrations)
- Doctrine ORM 3.x with PHP 8.2+ attributes mapping
- Database: PostgreSQL or MySQL (examples use PostgreSQL DSN)

!!! tip "Use versions consistently"
    When upgrading Symfony or Doctrine, upgrade related first‑party bundles together (e.g., `symfony/*` minor releases) and run your test suite after each step.

## Repository layout we’ll create

```
src/
  Controller/
    UserController.php
  Entity/
    User.php
  Form/
    UserType.php
  Repository/
    UserRepository.php
templates/
  user/
    index.html.twig
    new.html.twig
    edit.html.twig
    show.html.twig
config/
  packages/
    doctrine.yaml
    security.yaml
  routes/
    attributes.yaml
```

## Prerequisites

- PHP 8.2+
- Composer
- Symfony CLI (`symfony`)
- PostgreSQL or MySQL running locally

## Reading path

Follow the pages in order for the fastest path to a working system:

1) Setup → 2) Entity & Mapping → 3) Repositories & Queries → 4) Controllers & Routes → 5) Forms & Validation → 6) Views (Twig) → 7) Security & Auth → 8) Advanced CRUD → 9) Testing & Fixtures → 10) Performance → 11) Deployment → 12) Troubleshooting.

!!! tip "Complete Project Checklist"
    Before starting, check the **Project Checklist** page for a complete list of all files you'll create, database schema reference, and verification steps. This ensures nothing is missed.

## Cross‑references to Doctrine docs

- See `Entity Mapping` for attribute mapping fundamentals.
- See `Querying` and `Query Builder` for DQL and patterns used in repositories.
- See `Validation` and `Security` chapters for deeper dives.

!!! note "Why we choose attributes"
    Attributes provide strong IDE support, keep config co‑located with code, and are the default for Symfony + Doctrine in new projects. YAML/XML are equally supported if your team prefers them.


