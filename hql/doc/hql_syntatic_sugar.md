````markdown
# HQL Syntactic Sugar

Let's explore how to handle all syntactic sugar consistently and how macros
could eventually replace the syntax transformer. This document uses ASCII
diagrams and code examples to illustrate the concepts.

---

## Current Pipeline with Syntax Transformer

```plaintext
┌──────────┐    ┌──────────┐    ┌────────────────┐    ┌───────────┐    ┌──────────┐
│  Source  │    │  Parser  │    │     Syntax     │    │   Macro   │    │    IR    │
│   Code   │───>│  S-expr  │───>│  Transformer   │───>│  Expander │───>│Transformer│
└──────────┘    └──────────┘    └────────────────┘    └───────────┘    └──────────┘
                     ▲                  ▲                   ▲                ▲
                     │                  │                   │                │
                     │                  │                   │                │
            Handles data        Handles syntactic     Handles macros    Generates code
           structure literals   transformations      (user-defined)    from canonical
               [1,2,3]            like 'fx'                             expressions
```
````

---

## Handling All Syntactic Sugar Consistently

### Identify Syntactic Sugars

- **Data Structure Literals**: Already handled at the parser level (e.g.,
  `[1,2,3]`).
- **Special Forms**: Such as `fx`.
- **Other Shorthand Notations**: Any additional syntactic sugar that might be
  introduced.

### Decide Where Each Belongs

- **Parser Level**: For syntax that isn’t valid S-expressions (e.g., `[1,2,3]`).
- **Syntax Transformer**: For valid S-expressions with special meaning (e.g.,
  `fx`).

### Updating the Syntax Transformer

In your TypeScript file (e.g., `syntax-transformer.ts`), you might have:

```typescript
function transformNode(node: SExp, logger: Logger): SExp {
  // ...
  switch (op) {
    case "fx":
      return transformFxSyntax(list, logger);
    case "defstruct":
      return transformDefstructSyntax(list, logger);
    case "let-when":
      return transformLetWhenSyntax(list, logger);
    case "cond->":
      return transformThreadingCondSyntax(list, logger);
    // Add more syntax transformations here
    default:
      // ... default processing
  }
}
```

---

## Macro-Based Approach vs. Syntax Transformer

### Current Approach

```plaintext
┌───────────────────────────────────────────────────────────────────┐
│                        Current Approach                           │
├──────────┬─────────────────┬──────────────────┬──────────────────┤
│  Parser  │     Syntax      │      Macro       │       Code       │
│          │   Transformer   │     Expander     │     Generator    │
│  [hard-  │    [hard-       │  [user-defined   │    [backend      │
│  coded]  │     coded]      │    macros]       │    processing]   │
└──────────┴─────────────────┴──────────────────┴──────────────────┘
```

### Future Approach

```plaintext
┌───────────────────────────────────────────────────────────────────┐
│                        Future Approach                            │
├──────────┬─────────────────┬──────────────────┬──────────────────┤
│  Parser  │     Core        │     User         │       Code       │
│          │    Macros       │    Macros        │     Generator    │
│  [hard-  │   [replaces     │  [additional     │    [backend      │
│  coded]  │    syntax       │    macros]       │    processing]   │
│          │  transformer]   │                  │                  │
└──────────┴─────────────────┴──────────────────┴──────────────────┘
```

The key difference is that the macro system allows the language to extend itself
without requiring changes to the compiler, while the syntax transformer involves
hard-coded logic.

---

## How Macros Can Replace the Syntax Transformer

### Evolution Path

1. **Syntax Transformer (TypeScript)**
   - Hard-coded transformations
   - Part of the compiler
2. **Core Macros (HQL)**
   - Same transformations written in HQL
   - Loaded before user code
3. **Extended Macro System**
   - User-definable syntax
   - Full language extensibility

---

## Macro Expansion in the Pipeline

### Current Pipeline

```plaintext
┌──────────┐    ┌──────────┐    ┌────────────────┐    ┌───────────┐    ┌──────────┐
│  Source  │    │  Parser  │    │     Syntax     │    │   Macro   │    │    IR    │
│   Code   │───>│  S-expr  │───>│  Transformer   │───>│  Expander │───>│Transformer│
└──────────┘    └──────────┘    └────────────────┘    └───────────┘    └──────────┘
```

### Pipeline Transition

- **Current**:\
  `Parser → Syntax Transformer → Macro Expansion → IR Transformer → JS Output`

- **Potential Future**:\
  `Parser → Macro Expansion → IR Transformer → JS Output`\
  _(Moving the syntax transformer logic into macros)_

---

## How HQL Macros Are Implemented

### Macro Expansion Function

The macro expansion logic in your codebase is located in `src/s-exp/macro.ts`.
For example:

```typescript
export function expandMacros(
  exprs: SExp[],
  env: Environment,
  options: MacroExpanderOptions = {},
): SExp[] {
  // ... (macro expansion logic)
}
```

This function is called in your main transpiler function (e.g., in
`src/transpiler/hql-transpiler.ts`):

```typescript
// In processHql() function
// Step 5: Expand macros in the user code
expanded = expandMacros(sexps, env, { ... });
```

---

## System vs. User Macros

```plaintext
┌───────────────────────────────────────────────────┐
│                  Macro System                     │
├───────────────────────┬───────────────────────────┤
│    System Macros      │      User Macros          │
│    (defmacro)         │      (macro)              │
├───────────────────────┼───────────────────────────┤
│ • Defined in core.hql │ • Defined in user modules │
│ • Available globally  │ • Scoped to modules       │
│ • Loaded first        │ • Can be exported/imported│
└───────────────────────┴───────────────────────────┘
```

- **System Macros**: Defined with `defmacro` and loaded from `core.hql` before
  any user code.
- **User Macros**: Defined with `macro` in user modules and scoped accordingly.

---

## How an `fx` Macro Would Work

### fx Macro Workflow

```plaintext
┌────────────────────────────────────────────────────────────────────┐
│                        fx Macro Workflow                           │
├────────────┬──────────────┬──────────────────┬────────────────────┤
│ 1. Input   │ 2. Defined   │  3. Expansion    │  4. Output         │
│            │              │                  │                     │
│ (fx add    │ (defmacro fx │  During macro    │ (transformed       │
│  (x: Int)  │  (name       │  expansion,      │  canonical form    │
│  (-> Int)  │   params     │  the sexps       │  that backend      │
│  (+ x 1))  │   ...)       │  are matched     │  understands)      │
└────────────┴──────────────┴──────────────────┴────────────────────┘
```

### Defining the `fx` Macro in Core.hql

You can define the `fx` macro in `core.hql` like so:

```lisp
(defmacro fx [name params return-type & body] 
  ;; transformation logic here:
  ;; 1. Define the function using defn
  ;; 2. Include parameter validation and deep copy logic
  ;; 3. Register the function as pure
  `(begin
     (defn ~name ~(extract-params params)
       ;; Parameter validation code
       ~@(generate-type-checks params)
       ;; Deep copy for purity
       ~@(generate-deep-copies params)
       ;; Function body
       ~@body)
     (register-pure-function! '~name)))
```

---

## Replacing the Syntax Transformer

To transition from a hard-coded syntax transformer to a macro-based approach:

1. **Define the Core Macro**:\
   Create the `fx` macro in `core.hql` as shown above.

2. **Remove the Hard-Coded Case**:\
   Remove or comment out the special case in your syntax transformer.

   ```typescript
   // In transformNode:
   // Remove or comment out this case
   case "fx":
     return transformFxSyntax(list, logger);
   ```

This change shifts the responsibility of syntactic transformation from the
compiler to the macro system, allowing for greater flexibility and
extensibility.

---
