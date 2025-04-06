Below is the complete, single markdown document that exhaustively lists the HQL function API—including both the pure `fx` and general‑purpose `fn` constructs—with declaration and call examples. The document has been updated to reflect that:

- **Rest parameters** are allowed in both `fx` and `fn` functions.
- **Placeholders** (using `_`) are available for both typed and untyped functions but must be used in calls consistently (i.e. either all positional or all named), so that calls like `(add _ 10)` or `(add x: _ y: 10)` are allowed, whereas mixed forms such as `(add _ y: 10)` are not.

---

# HQL Function API Documentation

This document provides a comprehensive overview of all supported syntax scenarios for defining (callee side) and calling (caller side) HQL functions. It covers both pure (`fx`) functions and general‑purpose (`fn`) functions.

---

## 1. Callee Side (Function Declarations)

### A. Pure Functions (`fx`)

`fx` functions are pure and **always fully typed**: every parameter must have a type annotation and a return type must be declared. Default values are supported.

#### 1. Fully Typed Without Defaults

```lisp
(fx add (x: Int y: Int) (-> Int)
  (+ x y))
```

#### 2. Fully Typed With All Defaults

```lisp
(fx add (x: Int = 100 y: Int = 200) (-> Int)
  (+ x y))
```

#### 3. Mixed Default & Required (Still Fully Typed)

```lisp
(fx subtract (x: Int = 50 y: Int) (-> Int)
  (- x y))
```

> **Note:** Partial typing is not allowed.  
> **Invalid Example:**
> ```lisp
> (fx add (x: Int y) (-> Int)  ; Error: one parameter typed, one untyped
>   (+ x y))
> ```

---

### B. General-Purpose Functions (`fn`)

`fn` functions are more flexible. They can be declared in an **untyped** or **typed** form. Default values are supported, and—unlike earlier assumptions—**rest parameters** are allowed in both `fx` and `fn` functions. In addition, placeholders can be used with both forms.

#### 1. Untyped `fn`

- **Without Defaults:**

  ```lisp
  (fn add (x y)
    (+ x y))
  ```

- **With Default Values:**

  ```lisp
  (fn add (x = 10 y = 20)
    (+ x y))
  ```

- **With Rest Parameters:**

  ```lisp
  (fn sum (x y & rest)
    (+ x y (reduce + 0 rest)))
  ```

#### 2. Typed `fn`

All parameters must be annotated and a return type must be provided. Default values can be included, but the “all-or-nothing” rule applies.

- **Without Defaults:**

  ```lisp
  (fn multiply (x: Int y: Int) (-> Int)
    (* x y))
  ```

- **With Defaults:**

  ```lisp
  (fn add (x: Int = 10 y: Int = 20) (-> Int)
    (+ x y))
  ```

> **Note:** Partial typing is not allowed.  
> **Invalid Example:**
> ```lisp
> (fn add (x: Int y) (-> Int)  ; Error: partial typing is disallowed
>   (+ x y))
> ```

---

## 2. Caller Side (Function Calls)

Both `fx` and `fn` functions support the following call styles:

### A. Positional Arguments

Arguments are supplied in order. All required parameters must be provided unless a default value is defined.

- **Examples:**

  - For an `fx` function:
    ```lisp
    (add 10 20)       ;; Both parameters provided
    (add)             ;; Uses default values, if defined
    ```

  - For a `fn` function:
    ```lisp
    (add 5 10)
    (sum 1 2 3 4 5)
    ```

### B. Named Arguments

Arguments are supplied using the `parameter: value` syntax. When using named arguments, all parameters must be provided by name (do not mix with positional arguments).

- **Examples:**

  - For an `fx` function:
    ```lisp
    (add x: 10 y: 20)  ;; All arguments are named
    (add x: 5)        ;; x provided; y uses its default value (if defined)
    ```

  - For a `fn` function (untyped or typed):
    ```lisp
    (add x: 10 y: 20)
    (greet name: "Jane" greeting: "Hi")
    ```

> **Invalid Usage:**  
> Mixing named and positional arguments is not allowed.
> ```lisp
> (add x: 10 20)   ;; Invalid: mixing named and positional
> (add 10 y: 20)   ;; Invalid: mixing named and positional
> ```

### C. Default Value Behavior

- **Positional Calls:**  
  If a parameter has a default value, it may be omitted from the call.
  
  ```lisp
  (fn add (x = 10 y = 20)
    (+ x y))
  
  (add 5)           ;; x = 5, y defaults to 20 => 25
  (add 5 15)        ;; x = 5, y = 15 => 20
  ```

- **Named Calls:**  
  When using named arguments, all non-default parameters must be specified using named syntax.
  
  ```lisp
  (add x: 5)       ;; x = 5, y defaults to 20 => 25
  (add y: 5)       ;; x defaults to 10, y = 5 => 15
  (add x: 5 y: 15) ;; x = 5, y = 15 => 20
  ```

### D. Rest Parameters

Rest parameters can be used in **both** `fx` and `fn` functions. They allow additional arguments beyond the fixed parameters to be collected into a list.

```lisp
(fx sum (x: Int y: Int & rest: [Int]) (-> Int)
  (+ x y (reduce + 0 rest)))

(fn sum (x y & rest)
  (+ x y (reduce + 0 rest)))

;; Valid call:
(sum 1 2 3 4 5)  ;; x = 1, y = 2, rest = (3 4 5) => 15
```

### E. Placeholders

Placeholders (using `_`) are allowed in both typed and untyped function calls to indicate that a parameter should use its default value. When using placeholders, you must use them in a way that complies with the rule of either **all positional** or **all named** arguments.

- **Allowed:**

  ```lisp
  (add _ 10)         ;; Positional: first parameter uses default, second is 10
  (add x: _ y: 10)    ;; Named: x uses default, y is 10
  ```

- **Not Allowed:**

  ```lisp
  (add _ y: 10)      ;; Invalid: mixing positional placeholder with named argument
  ```

---

## 3. Summary Table

| Aspect                            | `fx` (Pure, Typed)                                      | `fn` (Untyped)                                              | `fn` (Typed)                                                |
|-----------------------------------|---------------------------------------------------------|-------------------------------------------------------------|-------------------------------------------------------------|
| **Declaration**                   | Fully typed; return type required                     | No type annotations; return type omitted                    | Fully typed; return type required                           |
| **Default Values**                | Supported (mix defaults & required)                   | Supported                                                   | Supported                                                   |
| **Partial Typing Allowed**        | ❌ All parameters must be typed                         | ❌ Either all or none                                       | ❌ All parameters must be typed                             |
| **Named Arguments (Call)**        | Supported (must be all named or all positional)         | Supported (must be all named or all positional)             | Supported (must be all named or all positional)             |
| **Positional Arguments (Call)**   | Supported (all required args must be provided)          | Supported                                                 | Supported                                                 |
| **Mixing Named & Positional**     | ❌ Not allowed                                          | ❌ Not allowed                                             | ❌ Not allowed                                             |
| **Rest Parameters**               | Supported                                              | Supported                                                 | Supported                                                 |
| **Placeholders**                  | Supported (must be used in a fully positional or named call) | Supported (must be used in a fully positional or named call) | Supported (must be used in a fully positional or named call) |
| **Purity / Deep Copying**         | Enabled (ensures pure functions)                        | Not enabled                                               | Not enabled                                               |

---

## 4. Complete Example Scenarios

### A. `fx` Example (Pure, Fully Typed)

```lisp
(fx add-pure (x: Int = 100 y: Int = 200) (-> Int)
  (+ x y))

;; Valid calls:
(add-pure)                ;; 100 + 200 = 300 (using defaults)
(add-pure 10 20)          ;; Positional: 10 + 20 = 30
(add-pure x: 5 y: 10)      ;; Named: 5 + 10 = 15
(add-pure x: 5)           ;; Named: 5 + 200 = 205
```

### B. `fn` Examples

#### 1. Untyped `fn`

```lisp
(fn add (x y)
  (+ x y))

;; Valid calls:
(add 5 10)                ;; 5 + 10 = 15
(add x: 5 y: 10)          ;; 5 + 10 = 15
```

#### 2. Untyped `fn` with Default Values

```lisp
(fn add (x = 10 y = 20)
  (+ x y))

;; Valid calls:
(add)                     ;; 10 + 20 = 30
(add 5)                   ;; 5 + 20 = 25
(add y: 5)                ;; 10 + 5 = 15
```

#### 3. Typed `fn`

```lisp
(fn multiply (x: Int y: Int) (-> Int)
  (* x y))

;; Valid calls:
(multiply 3 4)            ;; 3 * 4 = 12
(multiply x: 3 y: 4)       ;; 3 * 4 = 12
```

#### 4. Typed `fn` with Default Values

```lisp
(fn add (x: Int = 10 y: Int = 20) (-> Int)
  (+ x y))

;; Valid calls:
(add)                     ;; 10 + 20 = 30
(add 5 10)                ;; 5 + 10 = 15
(add x: 5)                ;; 5 + 20 = 25
(add y: 5)                ;; 10 + 5 = 15
```

#### 5. With Rest Parameters

```lisp
(fn sum (x y & rest)
  (+ x y (reduce + 0 rest)))

;; Valid call:
(sum 1 2 3 4 5)           ;; 1 + 2 + (3+4+5) = 15
```

#### 6. Using Placeholders

```lisp
;; Positional call with a placeholder:
(add _ 10)         ;; First parameter uses default, second is 10

;; Named call with a placeholder:
(add x: _ y: 10)    ;; x uses default, y is 10

;; Invalid: Mixing positional placeholder with named argument:
(add _ y: 10)      ;; Not allowed
```

---

## 5. Final Remarks

- **For `fx` functions:**  
  Use them when you require full type safety and purity. Every parameter and the return type must be declared. Calls must use either fully positional or fully named syntax.

- **For `fn` functions:**  
  They provide maximum flexibility. You may start with untyped functions for rapid development and add types later if needed (remember: you must type either all parameters or none). They support default values, rest parameters, and both named and positional calls. Placeholders may be used to signal “use default” but must follow the rule of fully positional or fully named calls.

This document serves as a complete reference for all supported HQL function declaration and call patterns. Adjustments and expansions can be made as additional edge cases arise.