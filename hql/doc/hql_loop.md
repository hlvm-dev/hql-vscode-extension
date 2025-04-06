Below is the updated markdown document using the latest syntax. Note that the use of a `(range ...)` within a for loop is now a **TODO feature**—its example is left commented for future implementation.

---

# HQL Loop Constructs

HQL’s iteration model is built on a fundamental `loop/recur` mechanism, which forms the core of its iteration capabilities. Higher-level looping constructs—such as `while`, `repeat`, and `for` loops—are implemented as macros on top of this core, providing familiar imperative-style constructs while maintaining explicit tail‑recursion.

---

## 1. Fundamental Loop/Recur

**Goal:**  
Provide a minimal, explicit tail‑recursive mechanism where loop state is passed via bindings.

**Latest Syntax:**

```lisp
(loop (i 0)
  (when (< i 3)
    (print "Basic loop iteration:" i)
    (recur (+ i 1))))
```

**Explanation:**

- `(loop (i 0))` initializes the loop with `i` set to `0`.
- The `when` condition checks if `i` is less than `3`.
- `recur` is used for tail‑recursive calls, passing the updated value of `i`.

**Expected Output:**

```
Basic loop iteration: 0
Basic loop iteration: 1
Basic loop iteration: 2
```

---

## 2. Imperative-Style while Loop (Macro-Based)

**Goal:**  
Offer a familiar `while` loop construct that internally expands to `loop/recur`.

**Latest Syntax:**

```lisp
(var count 0)

(while (< count 3)
  (print "While iteration:" count)
  (set! count (+ count 1)))

(print "Final count:" count)
```

**Explanation:**

- `(var count 0)` declares a mutable variable `count`.
- The `while` loop repeatedly checks if `count` is less than `3`.
- `set!` updates the mutable binding, and after the loop, the final value is printed.

**Expected Output:**

```
While iteration: 0
While iteration: 1
While iteration: 2
Final count: 3
```

---

## 3. Repeat Loop

**Goal:**  
Provide a concise construct to execute a block of expressions a fixed number of times—without manually managing an index variable.

**Latest Syntax:**

```lisp
(repeat 3
  (print "Hello!"))
```

**Expected Output for First Example:**

```
Hello!
Hello!
Hello!
```

**Multiple Expressions Example:**

```lisp
(repeat 2
  (print "First")
  (print "Second"))
```

**Expected Output for Second Example:**

```
First
Second
First
Second
```

---

## 4. Enhanced For Loop

HQL provides an enhanced `for` loop with multiple styles, supporting both positional parameters and named parameters.

### Style 1: Traditional For Loop (Positional Parameters)

**Latest Syntax:**

```lisp
(for (i 3)
  (print "Loop 1:" i))

(for (i 5 8)
  (print "Loop 2:" i))

(for (i 0 10 2)
  (print "Loop 3:" i))
```

**Explanation:**

- `(for (i 3))` iterates `i` from `0` to `2`.
- `(for (i 5 8))` iterates `i` from `5` to `7`.
- `(for (i 0 10 2))` iterates `i` from `0` to `8` in steps of `2`.

**Expected Output:**

```
Loop 1: 0
Loop 1: 1
Loop 1: 2

Loop 2: 5
Loop 2: 6
Loop 2: 7

Loop 3: 0
Loop 3: 2
Loop 3: 4
Loop 3: 6
Loop 3: 8
```

### Style 2: Named Parameters For Loop

**Latest Syntax:**

```lisp
(for (i to: 3)
  (print "Named loop 1:" i))

(for (i from: 5 to: 8)
  (print "Named loop 2:" i))

(for (i from: 0 to: 10 by: 2)
  (print "Named loop 3:" i))

(for (i to: 10 by: 3)
  (print "Named loop 4:" i))
```

**Explanation:**

- Named parameters (e.g., `from:`, `to:`, `by:`) enhance readability.
- These forms work similarly to the positional form but with explicit parameter labels.

**Expected Output:**

```
Named loop 1: 0
Named loop 1: 1
Named loop 1: 2

Named loop 2: 5
Named loop 2: 6
Named loop 2: 7

Named loop 3: 0
Named loop 3: 2
Named loop 3: 4
Named loop 3: 6
Named loop 3: 8

Named loop 4: 0
Named loop 4: 3
Named loop 4: 6
Named loop 4: 9
```

---

## 5. For Loop with Range (TODO Feature)

Iterating over a collection using a `range` function is anticipated in future updates. For now, this feature is marked as **TODO**.

```lisp
;; TODO: Implement range function
;; (for (i (range 10))
;;   (print "For loop iteration, i:" i))
```

**Note:**  
The above snippet illustrates the planned support for iterating over a generated sequence without explicitly managing its creation.

---

## Summary

- **Fundamental Loop/Recur:**  
  The core mechanism uses explicit tail recursion via `loop/recur` to pass and update loop state.
  
- **while Loop (Macro-Based):**  
  A familiar imperative-style loop that leverages mutable bindings and expands to `loop/recur`.

- **Repeat Loop:**  
  Executes a block of code a fixed number of times, eliminating the need for manual index management.

- **Enhanced For Loop:**  
  Provides both traditional (positional) and named parameter forms for iterating over sequences.  
  The integration of a `(range n)` helper function remains a **TODO feature**.

This set of looping constructs demonstrates HQL's blend of minimalistic, explicit recursion with high-level imperative-style controls, offering both clarity and efficiency.