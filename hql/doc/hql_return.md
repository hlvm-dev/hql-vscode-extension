# HQL Return

This document describes the return behavior in HQL, covering how functions defined with `fx`, `fn`, and lambda expressions handle return values. It explains the concepts of implicit and explicit returns, early exits via `return`, and nuances in nested functions and edge cases.

## Table of Contents
1. [Overview](#overview)
2. [Return in `fx` Functions](#return-in-fx-functions)
3. [Return in `fn` Functions](#return-in-fn-functions)
4. [Return in Lambdas](#return-in-lambdas)
5. [Nested Functions and Return](#nested-functions-and-return)
6. [Edge Cases](#edge-cases)
7. [Return in Function Arguments](#return-in-function-arguments)
8. [Function Composition with Return](#function-composition-with-return)
9. [Summary](#summary)

## Overview

HQL supports both **implicit** and **explicit** return mechanisms:

- **Implicit Return:**  
  If a function (or lambda) does not include a `return` statement, the value of the last evaluated expression is automatically returned.
  
- **Explicit Return:**  
  Using the `return` statement immediately exits the current function or lambda, returning the specified value.

These behaviors apply uniformly to:
- `fx` functions (designed for pure, side-effect-free operations),
- `fn` functions (which may allow side effects), and
- Lambda expressions.

## Return in `fx` Functions

`fx` functions enforce purity by:
- **Implicit Return:** The final expression’s value is returned if no explicit `return` is used.
- **Explicit Return:** The `return` statement immediately exits the function with the given value.
- **Early Return:** Conditional checks can trigger an early exit.
- **Multiple Returns:** Although a function may contain multiple `return` statements, only the first executed `return` affects the output.

**Examples:**

```lisp
;; Implicit return: the last expression is automatically returned.
(fx implicit-return-fx (x: Int) (-> Int)
  (let (doubled (* x 2))
    doubled))

;; Explicit return: using `return` to provide a value.
(fx explicit-return-fx (x: Int) (-> Int)
  (let (doubled (* x 2))
    (return doubled)))

;; Early return with conditional: exits early when x is negative.
(fx early-return-fx (x: Int) (-> Int)
  (if (< x 0)
      (return 0)
      (* x 2)))
```

## Return in `fn` Functions

`fn` functions, which can include side effects, follow similar return rules:

- **Implicit Return:** The final expression is returned if no `return` is used.
- **Explicit Return:** A `return` statement causes an immediate exit.
- **Multiple and Early Returns:** Only the first executed `return` statement is considered.

**Examples:**

```lisp
;; Implicit return in a function.
(fn implicit-return-fn (x)
  (let (doubled (* x 2))
    doubled))

;; Explicit return.
(fn explicit-return-fn (x)
  (let (doubled (* x 2))
    (return doubled)))

;; Early return: returns 0 for negative values.
(fn early-return-fn (x)
  (if (< x 0)
      (return 0)
      (* x 2)))
```

## Return in Lambdas

Lambda expressions in HQL behave similarly:

- **Implicit Return:** The result of the last expression is returned.
- **Explicit Return:** A `return` inside a lambda exits the lambda immediately.

**Examples:**

```lisp
;; Implicit return in a lambda.
(let (implicit-lambda (lambda (x) (-> Int)
                        (* x 2)))
  (print "lambda implicit return: " (implicit-lambda 5)))

;; Explicit return in a lambda.
(let (explicit-lambda (lambda (x) (-> Int)
                        (return (* x 2))))
  (print "lambda explicit return: " (explicit-lambda 5)))

;; Early return with condition inside a lambda.
(let (early-lambda (lambda (x) (-> Int)
                     (if (< x 0)
                         (return 0)
                         (* x 2))))
  (print "lambda early return (negative): " (early-lambda -5))
  (print "lambda no early return (positive): " (early-lambda 5)))
```

## Nested Functions and Return

When functions or lambdas are nested, each `return` only affects its own scope:

- A `return` within a lambda or nested block exits that inner scope.
- The outer function continues unless its own `return` is executed.

**Example:**

```lisp
;; Nested lambda inside a function.
(fn nested-fn-lambda (x)
  (let (inner-lambda (lambda (y) (-> Int)
                       (if (< y 0)
                           (return 0)
                           (* y 2))))
    (inner-lambda x)))
```

## Edge Cases

HQL’s return semantics cover several edge cases:

- **Empty Function Body with Return:**  
  A function may consist solely of a `return` statement.
  
- **Return in Nested Blocks:**  
  A `return` placed deep within nested blocks exits the current function immediately.
  
- **Returning Complex Data Structures:**  
  Functions can return dictionaries, arrays, or other complex data.
  
- **Multiple Sequential Returns:**  
  Only the first executed `return` is effective; subsequent ones are unreachable.

**Examples:**

```lisp
;; Function that returns a constant value.
(fn empty-with-return ()
  (return 42))

;; Return in a nested block.
(fn nested-block-return (x)
  (let (a 10)
    (let (b 20)
      (if (> x 0)
          (return (+ a b))
          (- a b)))))
```

## Return in Function Arguments

A `return` statement can be used within expressions that are arguments to other functions. If the condition triggers a `return`, the current function exits immediately without further evaluation.

**Example:**

```lisp
(fn add-one (x)
  (+ x 1))

(fn return-as-arg (condition)
  (add-one (if condition
             10           ;; When true, pass 10 to add-one.
             (return 0)))) ;; When false, exit immediately with 0.
```

## Function Composition with Return

When composing multiple function calls, the `return` statement affects only the current function. Inner functions may return values normally, while early returns in any function will exit that function immediately.

**Example:**

```lisp
(fn outer (x)
  (let (result (middle x))
    (+ result 1000)))

(fn middle (x)
  (if (< x 0)
    (return -1)   ;; Early return if x is negative.
    (inner x)))    ;; Otherwise, call inner function.

(fn inner (x)
  (if (< x 10)
    (return 0)    ;; Return 0 for values less than 10.
    (* x 10)))    ;; Otherwise, return x * 10.
```

- For `x` negative, `middle` returns `-1` so `outer` computes `-1 + 1000`.
- For small positive `x`, `inner` returns `0` leading to `outer` returning `1000`.
- For larger values, the multiplication result is propagated up.

## Summary

HQL’s return behavior is characterized by:

- **Implicit Returns:**  
  The last evaluated expression is returned automatically if no explicit `return` is encountered.

- **Explicit Returns:**  
  The `return` statement immediately exits the current function or lambda with the given value.

- **Early Exits:**  
  Conditional checks can trigger an early return to handle edge cases or error conditions.

- **Scope-Local Returns:**  
  Returns within nested functions or lambdas affect only their local scope, ensuring predictable control flow.

Understanding these principles is essential for writing clear and maintainable HQL code, especially when dealing with nested structures and complex control flows.

---