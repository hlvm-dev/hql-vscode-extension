# HQL fn Function Documentation

## Overview

The `fn` construct in HQL defines general-purpose functions without purity constraints. It offers maximum flexibility while still supporting the full type system when needed.

## 1. Basic Syntax

### Untyped Form

```lisp
(fn function-name (param1 param2 ...)
  body...)
```

### Typed Form

```lisp
(fn function-name (param1: Type1 param2: Type2 ...) (-> ReturnType)
  body...)
```

### With Default Values

```lisp
(fn function-name (param1 = default1 param2 = default2 ...)
  body...)
```

or

```lisp
(fn function-name (param1: Type1 = default1 param2: Type2 = default2 ...) (-> ReturnType)
  body...)
```

## 2. Function Calls

All `fn` functions support both positional and named argument calls:

### Positional Arguments

```lisp
(function-name arg1 arg2 ...)
```

### Named Arguments

```lisp
(function-name param1: arg1 param2: arg2 ...)
```

### Mixed Usage with Defaults

```lisp
(function-name arg1)  ; Second parameter uses default value
(function-name param2: arg2)  ; First parameter uses default value
```

## 3. In-depth Examples

### Example 1: Simple Untyped Function

```lisp
(fn add (x y)
  (+ x y))

;; Usage
(add 3 4)           ;; => 7
(add x: 3 y: 4)     ;; => 7
```

### Example 2: Untyped Function with Default Values

```lisp
(fn greet (name = "World" greeting = "Hello")
  (+ greeting ", " name "!"))

;; Usage
(greet)                               ;; => "Hello, World!"
(greet "Jane")                        ;; => "Hello, Jane!"
(greet "Jane" "Hi")                   ;; => "Hi, Jane!"
(greet name: "Jane")                  ;; => "Hello, Jane!"
(greet greeting: "Hola")              ;; => "Hola, World!"
(greet greeting: "Hola" name: "Jane") ;; => "Hola, Jane!"
```

### Example 3: Fully Typed Function

```lisp
(fn calculate-area (width: Double = 1.0 height: Double = 1.0) (-> Double)
  (* width height))

;; Usage
(calculate-area)                                    ;; => 1.0
(calculate-area 2.5 3.0)                            ;; => 7.5
(calculate-area width: 2.5)                         ;; => 2.5
(calculate-area height: 3.0)                        ;; => 3.0
(calculate-area width: 2.5 height: 3.0)             ;; => 7.5
(calculate-area height: 3.0 width: 2.5)             ;; => 7.5
```

### Example 4: Function with Rest Parameters

```lisp
(fn sum (x y & rest)
  (+ x y (reduce + 0 rest)))

;; Usage
(sum 1 2)        ;; => 3
(sum 1 2 3 4 5)  ;; => 15
```

### Example 5: Using Placeholder with Default Values

```lisp
(fn configure (host = "localhost" port = 8080 protocol = "http")
  (+ protocol "://" host ":" (str port)))

;; Usage
(configure _ _ "https")              ;; => "https://localhost:8080"
(configure "example.com" _ _)        ;; => "http://example.com:8080"
(configure protocol: "https")        ;; => "https://localhost:8080"
```

## 4. Type System Integration

When using the typed form of `fn`, HQL enforces these rules:

1. All parameters must have type annotations
2. The return type must be specified using the `(-> Type)` form
3. Default values must match their declared types
4. Partial typing is not allowed - either all parameters have types or none do

```lisp
;; Valid fully typed function
(fn add (x: Int y: Int) (-> Int)
  (+ x y))

;; Valid untyped function
(fn add (x y)
  (+ x y))

;; Invalid - partial typing
(fn add (x: Int y) (-> Int)
  (+ x y))

;; Invalid - missing return type
(fn add (x: Int y: Int)
  (+ x y))
```

## 5. Side Effects

Unlike `fx` functions, `fn` functions can have side effects:

```lisp
(let counter 0)

(fn increment-counter (amount = 1)
  (set! counter (+ counter amount))
  counter)

(increment-counter)     ;; => 1
(increment-counter 5)   ;; => 6
```

## 6. Common Use Cases

- API endpoints that need to perform I/O
- Event handlers
- Functions that modify shared state
- Functions with side effects like logging
- Utility functions where typing is unnecessary

## 7. Converting Between fn and fx

An untyped `fn` function can be gradually evolved:

1. Start with untyped `fn` for rapid development
2. Add types to make it a typed `fn` function
3. If the function is pure, convert it to `fx` for additional guarantees

```lisp
;; Step 1: Untyped fn
(fn add (x y)
  (+ x y))

;; Step 2: Typed fn
(fn add (x: Int y: Int) (-> Int)
  (+ x y))

;; Step 3: Pure fx (if the function is actually pure)
(fx add (x: Int y: Int) (-> Int)
  (+ x y))
```

## 8. Performance Considerations

- Typed `fn` functions can benefit from compiler optimizations
- `fx` functions may have additional overhead from deep-copying parameters
- Untyped `fn` functions offer maximum flexibility but fewest optimization opportunities

## 9. Best Practices

- Use the simplest form that meets your needs
- Add types when they provide value (documentation, safety)
- Prefer named arguments for functions with many parameters
- Use default values to make functions more flexible
- Consider starting with `fn` and moving to `fx` as requirements become clear