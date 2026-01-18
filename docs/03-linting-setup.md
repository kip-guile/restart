# Linting Setup

This document explains the ESLint and Prettier configuration.

## Overview

The project uses two tools for code quality:

| Tool | Purpose |
|------|---------|
| **ESLint** | Find bugs and enforce code patterns |
| **Prettier** | Format code consistently |

They work together: ESLint handles logic, Prettier handles style.

```
Your Code
    │
    ▼
┌─────────┐
│ ESLint  │ ─── Checks for bugs, unused vars, type errors
└────┬────┘
     │
     ▼
┌──────────┐
│ Prettier │ ─── Formats spacing, quotes, semicolons
└────┬─────┘
     │
     ▼
Clean Code
```

## ESLint Configuration

**File:** `eslint.config.js`

This project uses ESLint's **flat config** format (ESLint 9+), which is an array of configuration objects:

```javascript
import eslint from "@eslint/js";
import prettier from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";

export default [
  // 1. Ignore patterns
  { ignores: ["**/dist/**", "**/node_modules/**", "**/static/assets/**"] },

  // 2. CommonJS files (like webpack.config.cjs)
  {
    files: ["**/*.cjs"],
    languageOptions: { globals: { ...globals.node } },
    ...eslint.configs.recommended,
  },

  // 3. TypeScript files
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),

  // 4. TypeScript parser options
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // 5. Prettier integration
  prettier,
];
```

### Understanding Flat Config

The old `.eslintrc` format used nested objects. Flat config is an array where later items override earlier ones:

```javascript
// Old format (.eslintrc.json)
{
  "extends": ["eslint:recommended"],
  "overrides": [
    { "files": ["*.ts"], "parser": "@typescript-eslint/parser" }
  ]
}

// New format (eslint.config.js)
export default [
  eslint.configs.recommended,
  { files: ["**/*.ts"], languageOptions: { parser: tsParser } }
];
```

### Configuration Breakdown

#### 1. Ignore Patterns

```javascript
{ ignores: ["**/dist/**", "**/node_modules/**", "**/static/assets/**"] }
```

Don't lint:
- `dist/` - Compiled output
- `node_modules/` - Dependencies
- `static/assets/` - Built bundles

#### 2. CommonJS Files

```javascript
{
  files: ["**/*.cjs"],
  languageOptions: { globals: { ...globals.node } },
  ...eslint.configs.recommended,
}
```

Files like `webpack.config.cjs` are CommonJS and run in Node.js. We:
- Enable Node.js globals (`module`, `require`, `__dirname`)
- Apply basic ESLint recommended rules

#### 3. TypeScript Configuration

```javascript
...tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ["**/*.ts", "**/*.tsx"],
}))
```

This spreads the TypeScript ESLint recommended rules and limits them to `.ts`/`.tsx` files.

**What's "type-checked"?**

Some ESLint rules use TypeScript's type information for deeper analysis:

```typescript
// Rule: @typescript-eslint/no-floating-promises
// Without type info: Can't detect this bug
// With type info: Catches unhandled promise

async function fetchData() { /* ... */ }

fetchData();  // ERROR: Promises must be awaited or returned
```

#### 4. Parser Options

```javascript
{
  files: ["**/*.ts", "**/*.tsx"],
  languageOptions: {
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
}
```

| Option | Purpose |
|--------|---------|
| `projectService` | Automatically find tsconfig files |
| `tsconfigRootDir` | Where to look for tsconfig files |

#### 5. Prettier Integration

```javascript
import prettier from "eslint-plugin-prettier/recommended";
// ...
prettier
```

This single line:
1. Adds `eslint-plugin-prettier` to run Prettier as an ESLint rule
2. Adds `eslint-config-prettier` to disable ESLint rules that conflict with Prettier

---

## Prettier Configuration

**File:** `prettierrc.json`

```json
{
  "singleQuote": false,
  "semi": true,
  "printWidth": 80,
  "trailingComma": "es5"
}
```

| Option | Value | Meaning |
|--------|-------|---------|
| `singleQuote` | `false` | Use `"double quotes"` for strings |
| `semi` | `true` | End statements with semicolons |
| `printWidth` | `80` | Wrap lines at 80 characters |
| `trailingComma` | `es5` | Add trailing commas where valid in ES5 |

### Why These Settings?

**Double quotes (`singleQuote: false`):**
- Consistent with JSON (which requires double quotes)
- Avoids escaping apostrophes in strings

**Semicolons (`semi: true`):**
- Explicit statement endings
- Avoids rare ASI (Automatic Semicolon Insertion) bugs

**80 character width:**
- Readable on most screens
- Good for side-by-side diffs

**ES5 trailing commas:**
```javascript
// With trailingComma: "es5"
const obj = {
  a: 1,
  b: 2,  // <-- Trailing comma OK in objects/arrays
};

function foo(
  arg1,
  arg2  // <-- No trailing comma in function params (not valid in ES5)
) {}
```

Trailing commas make diffs cleaner:
```diff
 const obj = {
   a: 1,
+  b: 2,
 };
```

Instead of:
```diff
 const obj = {
-  a: 1
+  a: 1,
+  b: 2
 };
```

---

## Running Linting

```bash
# Lint all workspaces
npm run lint

# Lint a specific workspace
npm run lint -w @restart/bff

# Auto-fix problems
npm run lint -- --fix
```

## Editor Integration

### VS Code

Install extensions:
- ESLint (`dbaeumer.vscode-eslint`)
- Prettier (`esbenp.prettier-vscode`)

Add to `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### Other Editors

Most editors have ESLint/Prettier plugins. The flat config format requires ESLint 9+, so ensure your editor plugin is up to date.

---

## Key ESLint Rules

### From `@typescript-eslint/recommended-type-checked`

| Rule | What It Catches |
|------|-----------------|
| `no-floating-promises` | Unhandled promises |
| `no-misused-promises` | Promises used incorrectly (like in conditionals) |
| `await-thenable` | Awaiting non-promise values |
| `no-unnecessary-type-assertion` | Redundant `as` casts |
| `no-unsafe-assignment` | Assigning `any` to typed variables |
| `no-unsafe-member-access` | Accessing properties on `any` |
| `no-unsafe-return` | Returning `any` from typed functions |

### Examples

```typescript
// no-floating-promises
async function load() { /* ... */ }
load();  // ERROR: Promise must be handled

// Fixes:
await load();
void load();  // Explicitly ignore
load().catch(console.error);

// no-misused-promises
async function isValid() { return true; }
if (isValid()) { }  // ERROR: Condition is always truthy (it's a Promise)

// Fix:
if (await isValid()) { }

// no-unsafe-assignment
const data: any = fetchData();
const name: string = data.name;  // ERROR: Unsafe assignment from any

// Fix:
const data = fetchData() as { name: string };
const name: string = data.name;  // OK: Properly typed
```

---

## Common Issues

### 1. "Parsing error: Cannot find tsconfig"

**Cause:** ESLint can't find the TypeScript configuration.

**Fix:** Ensure `tsconfigRootDir` points to the repo root:
```javascript
parserOptions: {
  projectService: true,
  tsconfigRootDir: import.meta.dirname,  // or process.cwd()
}
```

### 2. "File is not included in any tsconfig"

**Cause:** A file (like a config file) isn't in any `include` array.

**Fix:** Either:
1. Add to tsconfig's `include`
2. Skip TypeScript rules for that file:
```javascript
{
  files: ["*.config.js"],
  ...tseslint.configs.disableTypeChecked,
}
```

### 3. Prettier and ESLint Conflict

**Symptom:** Formatting keeps changing or errors appear then disappear.

**Cause:** Usually happens when Prettier isn't last in the config array.

**Fix:** Ensure `prettier` is the last item:
```javascript
export default [
  // ... other configs
  prettier,  // Must be last!
];
```

---

## Customizing Rules

### Disabling a Rule

```javascript
{
  files: ["**/*.ts"],
  rules: {
    "@typescript-eslint/no-floating-promises": "off",
  },
}
```

### Changing Severity

```javascript
{
  rules: {
    "no-console": "warn",  // "off", "warn", or "error"
  },
}
```

### Rule-Specific Options

```javascript
{
  rules: {
    "@typescript-eslint/naming-convention": [
      "error",
      { selector: "interface", format: ["PascalCase"] },
      { selector: "variable", format: ["camelCase", "UPPER_CASE"] },
    ],
  },
}
```

---

## Alternative Approaches

### 1. Biome (All-in-One)

[Biome](https://biomejs.dev/) combines linting and formatting in one fast tool:

```bash
npm install --save-dev @biomejs/biome
npx biome init
```

**Trade-offs:**
- Much faster than ESLint + Prettier
- Fewer rules than ESLint
- Less ecosystem support

### 2. Stricter Rule Sets

Consider adding:
- `eslint-plugin-react` for React-specific rules
- `eslint-plugin-react-hooks` for hooks rules
- `eslint-plugin-import` for import organization

```javascript
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  // ... existing config
  {
    files: ["**/*.tsx"],
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
];
```

### 3. Pre-commit Hooks

Run linting before commits with [Husky](https://typicode.github.io/husky/) and [lint-staged](https://github.com/lint-staged/lint-staged):

```bash
npm install --save-dev husky lint-staged
npx husky init
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"]
  }
}
```
