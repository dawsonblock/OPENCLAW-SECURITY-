```markdown
# OPENCLAW-SECURITY- Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the OPENCLAW-SECURITY- TypeScript codebase. It covers file naming, import/export styles, commit message patterns, and testing conventions. While no automated workflows were detected, this guide provides best practices and suggested commands for common tasks.

## Coding Conventions

### File Naming
- Use **snake_case** for all file names.
  - Example: `user_auth.ts`, `password_utils.ts`

### Import Style
- Use **relative imports** for referencing other modules.
  - Example:
    ```typescript
    import { encryptPassword } from './password_utils';
    ```

### Export Style
- Use **named exports** to expose functions, types, or constants.
  - Example:
    ```typescript
    // In password_utils.ts
    export function encryptPassword(password: string): string { ... }
    ```

### Commit Message Patterns
- Commit messages are **freeform** but often use the `security` prefix.
- Average commit message length: ~69 characters.
  - Example:  
    ```
    security: update password hashing algorithm for enhanced protection
    ```

## Workflows

### Adding a New Security Utility
**Trigger:** When you need to add a new utility function related to security.
**Command:** `/add-security-utility`

1. Create a new file using snake_case (e.g., `token_utils.ts`).
2. Implement the utility function(s) with proper TypeScript typing.
3. Use named exports for all functions.
4. Add relative imports in other modules as needed.
5. Write a corresponding test file (e.g., `token_utils.test.ts`).
6. Commit with a descriptive message, optionally prefixed with `security:`.

### Modifying Existing Security Logic
**Trigger:** When updating or fixing existing security-related code.
**Command:** `/modify-security-logic`

1. Locate the relevant file(s) using snake_case naming.
2. Make changes, ensuring to use named exports and relative imports.
3. Update or add tests as necessary.
4. Commit changes with a clear, descriptive message (e.g., `security: fix token expiration check`).

## Testing Patterns

- **Test files** are named using the pattern `*.test.*` (e.g., `user_auth.test.ts`).
- The specific testing framework is not detected; follow the existing structure in test files.
- Place tests alongside or near the modules they test.
- Example test file name: `password_utils.test.ts`

## Commands
| Command                 | Purpose                                             |
|-------------------------|-----------------------------------------------------|
| /add-security-utility   | Scaffold a new security utility module and test     |
| /modify-security-logic  | Update or fix existing security-related code        |

```