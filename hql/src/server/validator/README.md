# HQL Diagnostics System

This module provides real-time validation for HQL code in the VSCode extension. The system implements comprehensive syntax checking, type validation, and reserved keyword detection.

## Architecture

The diagnostic system has a modular design:

- **DiagnosticProvider**: Entry point for LSP integration
- **ValidatorManager**: Coordinates all validators
- **SyntaxValidator**: Checks HQL syntax rules
- **TypeValidator**: Verifies type correctness
- **ReservedKeywordsValidator**: Identifies reserved keyword usage

## How It Works

1. When the editor content changes, the LSP triggers validation
2. The ValidatorManager processes the document:
   - Parses the document to produce S-expressions
   - Immediately validates for reserved keywords
   - Checks for syntax errors
   - Validates specific constructs like functions, classes, enums
   - Checks for unbalanced delimiters
   - Validates symbol definitions and usage
   - Performs type checking

3. Errors are reported to the editor with proper position information
4. The editor displays error markers and underlines

## Validation Features

### Reserved Keywords
Prevents using reserved keywords as identifiers in function names, variable names, etc.

```hql
;; This will show an error
(fn vector [x y] (+ x y))
```

### Syntax Validation
Checks that HQL syntax is properly formed:

```hql
;; Valid function
(fn add [x y]
  (+ x y))

;; Invalid - missing parameter list
(fn broken
  (+ x y))
```

### Type Checking
Validates argument counts and types in function calls:

```hql
;; Define a function with two parameters
(fx add [x: Int y: Int] (-> Int)
  (+ x y))

;; These will show errors
(add)          ;; Too few arguments
(add 1 2 3)    ;; Too many arguments
```

### Unbalanced Delimiters
Detects missing or extra parentheses, brackets, and braces:

```hql
;; Missing closing parenthesis
(let x (+ 1 2)
(let y 3)
```

### Undefined Symbols
Warns about variables used but not defined:

```hql
(fn calculate []
  (+ x 10))    ;; 'x' is undefined
```

## Usage in LSP Server

The validator system is integrated into the LSP server with incremental validation:

1. Basic validation is performed as the user types
2. Thorough validation is performed on document save

```typescript
// Validate on document changes (lightweight)
documents.onDidChangeContent(async (event) => {
  await diagnosticsProvider.validateTextDocument(event.document, connection);
});

// More thorough validation on save
documents.onDidSave(async (event) => {
  await diagnosticsProvider.validateTextDocument(event.document, connection, true);
});
```

## Extending the System

### Adding New Rules

To add a new validation rule:

1. Choose the appropriate validator (syntax, type, etc.) or create a new one
2. Implement your validation logic
3. Add your validator to the ValidatorManager

Example of adding a new syntax rule:

```typescript
// In SyntaxValidator.ts
public validateNewConstruct(
  document: TextDocument,
  expr: SList,
  diagnostics: Diagnostic[]
): void {
  // Validation logic here
  if (condition) {
    this.addDiagnostic(
      document,
      expr,
      "Error message",
      DiagnosticSeverity.Error,
      diagnostics
    );
  }
}

// In ValidatorManager.ts, add to validateSyntaxForExpressions:
case 'new-construct':
  this.syntaxValidator.validateNewConstruct(document, expr, diagnostics);
  break;
```

### Creating a New Validator

For major new validation categories:

1. Create a new validator class in the validator directory
2. Implement validation logic following the pattern of existing validators
3. Add your validator to the ValidatorManager constructor
4. Call your validator from validateTextDocument

## Testing

Use the diagnostics test utility to verify your validator:

```typescript
const tester = new DiagnosticsTestHarness();
await tester.testCase('My test case', `
  // Your HQL code here
`);
```

Run the utility with:

```bash
npm run test-diagnostics
``` 