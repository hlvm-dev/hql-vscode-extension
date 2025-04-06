## 1. Struct: Fully Self-Contained Value Type

Structs are designed so that all data is declared locally. They never capture external state unless you explicitly pass it in, ensuring that each instance is completely independent.

### Definition

```lisp
(struct Person
  ;; Field declarations (all self-contained)
  (var name)         ;; mutable field (to be set in the initializer)
  (var age)          ;; mutable field (to be set in the initializer)
  (var a 10)         ;; mutable field with a default value
  (let b nil)        ;; immutable field (once set, it cannot change)
  (let c "b")        ;; immutable field with a constant value

  ;; Initializer: must assign required fields
  (init (name age)
    (do
      (set! self.name name)
      (set! self.age age)
      self))

  ;; Methods: self is automatically bound
  (fn greet ()
    (+ "Hello, " self.name))
)
```

### Usage (Caller API)

```lisp
;; Instantiate a Person struct
(let person (new Person "Alice" 30))

;; Field access:
(print (person.name))    ;; Output: "Alice"
(print (person.age))     ;; Output: 30

;; Method call:
(print (person.greet))   ;; Output: "Hello, Alice"
```

**Features of Structs:**
- **Self-Containment:** All fields are defined within the struct. Nothing external is captured unless explicitly passed.
- **Value Semantics:** Copying a struct creates an independent copy.
- **Immutability by Default:** Use `(let ...)` to indicate fields that should not change after initialization.
- **No Inheritance:** Structs are closed types, making them simpler and more predictable.

---

## 2. Class: Traditional Reference Type

Classes in HQL follow a more traditional object-oriented model. They allow shared mutable state, can capture external values, and support advanced OOP features such as inheritance.

### Definition

```lisp
(class Person
  ;; Field declarations using unified syntax
  (var name)         ;; mutable field (set in the constructor)
  (var age)          ;; mutable field (set in the constructor)
  (var a 10)         ;; mutable field with a default value
  (let b nil)        ;; immutable field
  (let c "b")        ;; immutable field with constant value

  ;; Constructor: initializes required fields
  (constructor (name age)
    (do
      (set! self.name name)
      (set! self.age age)
      self))

  ;; Methods:
  (fn greet ()
    (+ "Hello, " self.name))

  (fn celebrateBirthday (newAge)
    (do
      (set! self.age newAge)
      self))
)
```

### Usage (Caller API)

```lisp
;; Instantiate a Person class
(let person (new Person "Alice" 30))

;; Field access:
(print (person.name))    ;; Output: "Alice"
(print (person.age))     ;; Output: 30

;; Method calls:
(print (person.greet))                 ;; Output: "Hello, Alice"
(print (person.celebrateBirthday 31))   ;; Updates age and returns the instance
(print (person.age))                   ;; Output: 31 (after birthday celebration)
```

**Features of Classes:**
- **Reference Semantics:** The same instance can be shared and mutated by multiple parts of your program.
- **Interoperability:** Classes can reference external values or variables (if desired) in their constructor or methods.
- **Inheritance & Polymorphism:** While not shown in this example, classes are designed to support subclassing and method overriding.
- **Unified Declaration:** The same `(var …)` and `(let …)` syntax is used for fields, keeping the language consistent.

---

## Summary of the Caller API

- **Unified Construction:**  
  Both structs and classes are created using a similar syntax (e.g., `(new Person "Alice" 30)`), making the instantiation process uniform.

- **Field Access via Dot Notation:**  
  Regardless of whether you’re working with a struct or a class, you access fields with dot notation:
  
  ```lisp
  (person.name)  ;; Accesses the name field
  ```

- **Method Invocation:**  
  Methods are called the same way for both constructs:
  
  ```lisp
  (person.greet)          ;; Calls the greet method
  (person.celebrateBirthday 31)  ;; Calls a method with arguments
  ```

- **Unified Field Declaration:**  
  Using `(var ...)` for mutable and `(let ...)` for immutable fields across both structs and classes keeps the syntax consistent and easy to learn.

---

This design provides a clear and intuitive API for both value types (structs) and reference types (classes) in HQL. It lets the programmer choose the appropriate model for their needs while keeping the syntax and usage consistent throughout the language.

Does this complete overview capture everything you were looking for in terms of API design and usage from the caller's perspective?