# HQL Function Model Documentation

## Overview

HQL provides two primary function constructs:

- **fx:** Pure functions with strict typing and purity guarantees
- **fn:** General-purpose functions without purity constraints

This document explains the differences and similarities between these constructs, providing clear guidance on when to use each.

## 1. Pure Functions (fx)

### Purpose

The `fx` construct defines **pure functions** with the following guarantees:

- **Purity:** Functions are statically verified to be free of side effects
- **Type Safety:** All parameters and return values must be fully typed
- **Immutability:** Functions must not modify their inputs or external state
- **Self-Containment:** Functions can only access their parameters and local bindings

### Syntax

```lisp
(fx function-name (param1: Type1 param2: Type2 = default) (-> ReturnType)
  body...)
```

### Key Characteristics

- **Complete Type Annotations Required:** All parameters must have type annotations
- **Return Type Required:** Must specify a return type with the `(-> Type)` form
- **Default Values:** Parameters can have default values (making them optional)
- **Named Arguments:** Supports calling with named arguments (`param: value`)
- **Purity Verification:** Parameters are deep-copied to prevent mutation

### Example

```lisp
(fx add (x: Int = 10 y: Int = 20) (-> Int)
  (+ x y))

;; Usage with named arguments
(add x: 5 y: 10)  ;; => 15

;; Usage with partial named arguments (using defaults)
(add x: 5)        ;; => 25

;; Usage with positional arguments
(add 5 10)        ;; => 15

;; Usage with no arguments (using defaults)
(add)             ;; => 30
```

## 2. General-Purpose Functions (fn)

### Purpose

The `fn` construct defines general-purpose functions that:

- **Allow Side Effects:** Can freely access and modify external state
- **Flexible Typing:** Can be defined with or without type annotations
- **Maximum Flexibility:** Can be used for all function use cases

### Syntax

**Untyped Form:**
```lisp
(fn function-name (param1 param2 = default)
  body...)
```

**Typed Form:**
```lisp
(fn function-name (param1: Type1 param2: Type2 = default) (-> ReturnType)
  body...)
```

### Key Characteristics

- **Optional Type System:** Can be defined with or without type annotations
- **All-or-Nothing Typing:** If using types, all parameters must be typed (partial typing not allowed)
- **Default Values:** Parameters can have default values in both typed and untyped forms
- **Named Arguments:** Supports calling with named arguments in all forms
- **No Purity Verification:** Parameters are not deep-copied by default

### Examples

**Untyped Function:**
```lisp
(fn add (x y)
  (+ x y))

;; Usage with positional arguments
(add 5 10)        ;; => 15

;; Usage with named arguments (also supported)
(add x: 5 y: 10)  ;; => 15
```

**Untyped Function with Default Values:**
```lisp
(fn add (x = 10 y = 20)
  (+ x y))

;; Usage with partial arguments
(add 5)           ;; => 25

;; Usage with named arguments
(add y: 5)        ;; => 15

;; Usage with no arguments
(add)             ;; => 30
```

**Fully Typed Function:**
```lisp
(fn add (x: Int = 10 y: Int = 20) (-> Int)
  (+ x y))

;; Works exactly like the fx version but without purity checks
(add x: 5 y: 10)  ;; => 15
(add x: 5)        ;; => 25
(add 5 10)        ;; => 15
(add)             ;; => 30
```

## 3. Comparison Table

| Feature | fx | fn |
|---------|----|----|
| Purity Guarantee | ✅ Yes | ❌ No |
| Side Effects | ❌ Disallowed | ✅ Allowed |
| Type Annotations | ✅ Required | ✅ Optional |
| Named Arguments | ✅ Supported | ✅ Supported |
| Default Values | ✅ Supported | ✅ Supported |
| Partial Typing | ❌ Disallowed | ❌ Disallowed |
| Deep Copy Params | ✅ Always | ❌ Never |

## 4. When to Use Each

- **Use `fx`** when you want predictable, side-effect-free functions with static guarantees
- **Use `fn`** when you need flexibility or must perform side effects
- **Use typed `fn`** when you want type safety without purity restrictions

## 5. Implementation Notes

The implementation of `fn` and `fx` shares most of its code, with `fx` adding additional purity verification. This means that:

1. Typed `fn` functions can be converted to `fx` by simply changing the keyword (if they are already pure)
2. `fx` functions cannot be converted to `fn` without losing purity guarantees
3. Both handle named arguments and default values in the same way

## 6. Restrictions

- Partial typing is not allowed for either `fn` or `fx`. Either all parameters have type annotations or none do.
- For typed `fn` and all `fx` functions, all parameter types and return type must be specified.