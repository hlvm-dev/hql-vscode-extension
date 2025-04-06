# Chain Method Invocation in HQL

Chain method invocation lets you perform multiple operations in sequence on a given value. In HQL (Higher Quick LISP), we support two styles:

1. **Traditional S-expression Invocation**  
   Uses nested function calls to express the chaining.

2. **Doc Syntax (Dot-Chain) Invocation**  
   Uses an intuitive dot-prefixed method notation that is automatically transformed by the HQL reader/macro into nested S-expressions.

---

## 1. Traditional S-expression Invocation

In the traditional style, you nest each function call inside the previous one. This is completely standard within Lisp and preserves the classic S-expression form.

### Example

```lisp
(print (map (lambda (n) (* n 2))
            (filter (lambda (n) (= (% n 2) 0)) numbers)))
```

### Explanation

- **Filtering:**  
  The `filter` function is applied to `numbers` to select even numbers.

- **Mapping:**  
  The result of the filtering is passed to `map`, which doubles each even number.

- **Nesting:**  
  The nesting clearly shows the order of operations but can become visually heavy with many chained operations.

---

## 2. Doc Syntax (Dot-Chain) Invocation

HQL introduces a unique API design that allows you to write a dot-chain syntax. Although it looks different from standard S-expressions, the HQL reader or macro transforms it into a standard nested form at read time.

### Syntax Example

```lisp
(numbers
  .filter (lambda (n) (= (% n 2) 0))
  .map    (lambda (n) (* n 2)))
```

### How It Works

1. **Syntactic Sugar:**  
   The above dot-chain form is not a native S-expression. It uses a special dot notation for method calls.

2. **Reader/Parser Conversion:**  
   When HQL reads the dot-chain syntax, it automatically transforms it into a nested S-expression. The example above is converted to:

   ```lisp
   (.map (lambda (n) (* n 2))
     (.filter (lambda (n) (= (% n 2) 0))
       numbers))
   ```

3. **Uniform Processing:**  
   Despite its unique appearance, the final transformed code is a valid S-expression that is compiled and executed like any other Lisp code.

### Benefits

- **Improved Readability:**  
  The dot-chain syntax is more visually linear and mirrors familiar object-oriented method chaining.

- **Familiarity for JS Developers:**  
  Developers coming from JavaScript appreciate the dot notation, yet the code remains an S-expression.

- **Seamless Integration:**  
  The transformation occurs at read time, so tooling, macros, and debugging remain consistent with the Lisp tradition.

---

## Examples Across Different Contexts

### Example 1: Array Processing

**Traditional S-expression Style:**

```lisp
(print (map (lambda (n) (* n 2))
            (filter (lambda (n) (= (% n 2) 0)) numbers)))
```

**Doc Syntax Style:**

```lisp
(numbers
  .filter (lambda (n) (= (% n 2) 0))
  .map    (lambda (n) (* n 2)))
```

---

### Example 2: String Manipulation

**Traditional S-expression Style:**

```lisp
(print (.split " " 
         (.toUpperCase 
           (.trim "   hello world   "))))
```

**Doc Syntax Style:**

```lisp
("   hello world   "
  .trim
  .toUpperCase
  .split " ")
```

---

### Example 3: Custom Object Chaining

Assume you have a custom object with chainable methods.

**Traditional S-expression Style:**

```lisp
(.add 10 
  (.multiply 7 3 calc))
```

**Doc Syntax Style:**

```lisp
(calc
  .multiply 7 3
  .add 10)
```

---

## Conclusion

HQL supports two complementary styles of chain method invocation:

- **Traditional S-expression Invocation:**  
  Uses nested function calls in the classic Lisp manner. It’s simple, direct, and fully S-expression compliant.

- **Doc Syntax (Dot-Chain) Invocation:**  
  Introduces a more fluent, object-oriented look using dot-prefixed methods. The HQL reader/macro automatically converts this intuitive syntax into nested S-expressions, offering both modern readability and full compatibility with Lisp's S-expression tradition.

This design combines the clarity and brevity of a dot-chain API with the power and flexibility of Lisp’s S-expression foundation. It allows developers to choose the style that best fits their needs while maintaining a consistent and expressive language design.