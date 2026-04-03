```markdown
# OPENCLAW-SECURITY- Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches you the core development patterns, coding conventions, and workflows used in the OPENCLAW-SECURITY- TypeScript codebase. You'll learn how to name files, structure imports and exports, write and locate tests, and follow the repository's commit and workflow practices.

## Coding Conventions

### File Naming
- Use **snake_case** for all file names.
  - Example:  
    ```
    user_service.ts
    security_utils.ts
    ```

### Import Style
- Use **relative imports** for all module references.
  - Example:
    ```typescript
    import { encryptData } from './crypto_utils';
    import { validateUser } from '../validators/user_validator';
    ```

### Export Style
- Use **named exports** for all exported functions, classes, or constants.
  - Example:
    ```typescript
    // In security_utils.ts
    export function hashPassword(password: string): string { ... }
    export const SALT_ROUNDS = 10;
    ```

### Commit Patterns
- Commit messages are **freeform** but often use the `security` prefix.
- Average commit message length is about 105 characters.
  - Example:
    ```
    security: add input validation to user registration endpoint to prevent SQL injection
    ```

## Workflows

_No automated or CI workflows were detected in this repository. All workflows are manual._

## Testing Patterns

- **Test files** use the `*.test.*` naming pattern.
  - Example:
    ```
    auth_service.test.ts
    ```
- **Testing framework** is unknown; check existing test files for setup.
- To run tests, refer to the project's README or package.json scripts (if available).

## Commands

| Command         | Purpose                                           |
|-----------------|---------------------------------------------------|
| /test           | Run all test files matching `*.test.*`            |
| /lint           | (If configured) Lint the codebase                 |
| /commit         | Suggest a commit message with `security` prefix   |

```