# HQL fx Function

## Overview

The `fx` construct is used exclusively for defining **pure functions**. These
functions are statically guaranteed to be free of side effects and do not
capture any external state. They must rely solely on their parameters and local
immutable bindings (typically created with `let`). This purity enables easier
reasoning, testing, and optimizations such as memoization or parallel execution.

## Syntax

The definition of an `fx` function starts with the `fx` keyword, followed by the
function name, its typed signature (parameters with type annotations, default
values, and the return type), and finally the function body.

```lisp
(fx function-name signature
  body...)
```

### Signature Forms

There is one allowed syntax for specifying the function's signature in an `fx`
definition. The signature must be fully typed. The parameter list is defined
with type annotations and (optionally) default values, followed by an arrow
(`->`) and the return type. Parameters are specified as `name: Type`, and
default values can be provided using an equals sign (`=`).

```lisp
(fx add (x: Int = 100 y: Int = 200) (-> Int)
  (+ x y))
```

- **Parameters without default values are mandatory.**
- **Parameters with default values are optional; if omitted in a call, the
  default value is used.**

**Example with one default:**

```lisp
(fx add (x: Int = 100 y: Int) (-> Int)
  (+ x y))

; Usage:
; (add y: 20)       evaluates to 120 (x defaults to 100)
; (add x: 10 y: 20) evaluates to 30
; (add)            causes an error because y is required
```

**Example with all defaults:**

```lisp
(fx add (x: Int = 100 y: Int = 200) (-> Int)
  (+ x y))

; Usage:
; (add)            evaluates to 300
; (add x: 99)      evaluates to 299
; (add y: 99)      evaluates to 199
; (add x: 1 y: 2)  evaluates to 3
; (add 1 2)        evaluates to 3
```

### Calling `fx` Functions

Functions defined with `fx` are called using the function name followed by
arguments. Since `fx` functions are always fully typed, all calls must adhere to
the typed signature.

**Typed Functions (with or without defaults):**

Calls typically use named arguments (`name: value`). Positional arguments are
allowed only when all arguments are provided.

```lisp
; Definition
(fx add (x: Int = 100 y: Int = 200) (-> Int)
  (+ x y))

; Calls
(add x: 10 y: 20)  ; Named arguments
(add y: 50)        ; Named argument, x uses default
(add 1 2)          ; Positional arguments (allowed when all parameters are provided)
```

## Function Body

After the type signature, the function body follows. Since `fx` functions are
pure:

- **Only local bindings and parameters may be referenced.**
- **Side effects** (e.g., I/O, mutable state changes) **are disallowed.**

Any violation of these constraints should result in a compile‑time error,
ensuring that the function remains predictable and free from hidden
dependencies.

## Key Characteristics

- **Purity Guarantee:**\
  All `fx` functions must be self‑contained. They do not capture any external
  variables or perform side effects.

- **Fully Typed Signatures:**\
  Every `fx` function requires full type annotations for parameters and the
  return type. Default values may be provided to allow more flexible function
  calls.

- **Named Default Values:**\
  Parameters can include default values. If a parameter with a default is
  omitted during the call, its default value is used. However, omitting a
  parameter without a default will result in a compile‑time error.

## TODO: Generic API

In future iterations, we plan to extend the `fx` syntax to support a generic
API. This will allow for polymorphic functions where type parameters can be
defined and constrained. An example of a generic function might look like:

```lisp
; TODO: Generic API
(fx identity <T> (x: T) (-> T)
  x)
```

This feature is not yet implemented but is on the roadmap to further enhance the
expressiveness and reusability of our pure function definitions.

## TODO: Pure function guranteee

HQL is in very early MVP and Proof of concept phase now without proper type
system.

## TODO: Define Pure function

Most of all, Pure function should be strictly defined in HQL term.

## HQL's fx Implementation: Current State & Evolution Path

### Current MVP Implementation

- **Static Analysis for Purity Verification**\
  Validates function only references parameters and local variables\
  Catches attempts to access external state\
  Prevents use of impure operations like print

- **Deep Copy Parameter Protection**\
  Uses JSON.parse/JSON.stringify for deep copying\
  Creates truly independent copies of all object/array parameters\
  Prevents side effects on original data

- **Core Pure Function Model**\
  Distinct syntax (`fx` vs `fn`) for pure and impure functions\
  Explicit purity guarantees in the language syntax\
  Allows parameter mutation but contains it via copying

- **JavaScript Interoperability**\
  Maintains full access to JavaScript ecosystem\
  Can intermix pure and impure code as needed\
  JS interop operations supported inside pure functions

## Summary

The `fx` function model is designed to provide a robust foundation for pure
functions by enforcing strict type annotations and disallowing side effects. The
fully typed signature, including parameter types and return type, ensures
clarity and consistency. With the addition of named default values, developers
can now provide default arguments for parameters, enhancing flexibility in
function calls. With future plans to introduce generics, `fx` is positioned to
become a powerful tool for building reliable, maintainable, and high-performance
code.
