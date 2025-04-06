;; hql_spec.hql - Comprehensive showcase of HQL syntax and features
;; This file demonstrates the "macro everywhere, minimal-core, expression-oriented,
;; single-bundled-output, platform agnostic" philosophy of HQL.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 1. Fundamentals & Data Structures
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Creating JS objects
(let numbers (new Array))
(numbers.push 1)
(numbers.push 2)
(numbers.push 3)
(numbers.push 4)
(numbers.push 5)
(numbers.push 6)
(numbers.push 7)
(print numbers)

;; --- Basic Values and Definitions ---
(let pi 3.14159)
(let greeting "Hello, HQL World!")
(let is-awesome true)

;; --- Quote Syntax ---
(let symbol-x 'x)
(let quoted-list '(1 2 3))
(let quoted-expression '(+ 1 (* 2 3)))

;; --- Data Structure Literals ---

[1, 2, 3, 4, 5]     ;; vector
#[1, 2, 3, 4, 5]    ;; set
{ "key" : "value" } ;; map
'(1 2 3 4 5)        ;; list

(let json { items : [1, 2, 3, 4, 5] })

(print "json : " json.items)
;; (print "json : " (json.items)) ;; (json.items) is not allowed - it is function call. it is not property access. 

(let data {
  "items": [5, 10, 15, 20, 25, 30, 35, 40],
  "factor": 2,
  "prefix": "Value: "
})

(print "data.items : " data.items)
;; (print "data.items : " (data.items)) ;; (data.items) is not allowed - it is function call. it is not property access. 

(let empty-vector [])
(let mixed-types ["string", 42, true, nil])
(let nested-vectors [[1, 2], [3, 4]])

(let empty-map {})
(let user {"name": "John", "age": 30})
(let nested-map {"profile": {"id": 1, "settings": {"theme": "dark"}}})

(let empty-set #[])
(let unique-numbers #[1, 2, 3, 4, 5])
(let unique-strings #["apple", "banana", "cherry"])

(let empty-list '())
(let simple-list '(1 2 3 4 5))
(let mixed-list '("hello" 42 true))

;; --- Data Structure Operations ---
(let vec-item (get numbers 2))
(let map-value (get user "name"))
(let first-item (get numbers 0))
(let second-item (get numbers 1))

(let my-vector [1, 2, 3, 4, 5])
(let element2 (get my-vector 2))  
(let element3 (nth my-vector 2))
(let element4 (my-vector 2))

;; look up
(let user2 {"name": "Alice", "status": "active"})
(print (get user2 "name"))  ; returns "Alice"
(print user2.name)  ; also returns "Alice"

(let my-list (list "a" "b" "c"))
(nth my-list 1)  ;; returns "b"
(print (my-list 1)) ;; b

(let my-vector2 (vector 10 20 30))
(nth my-vector2 2)  ;; returns 30
(print (my-vector2 2)) ;; 30

(let my-set #[1, 2, 3])
(print (my-set 2))  ;; 2
(print (js-call my-set "has" 2))  ;; true

(print (contains? my-set 2))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 2. Functions & Control Flow
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; --- Basic Function Definitions ---
(fn square (x)
  (* x x))

(fn add-three (x y z)
  (+ x (+ y z)))

(fn abs (x)
  (if (< x 0)
      (- 0 x)
      x))

(fn factorial (n)
  (if (<= n 1)
      1
      (* n (factorial (- n 1)))))

(console.log "square : " (square 10))

(export "square" square)

;; --- Expression Sequencing with 'do' ---
(fn calculate-area (radius)
  (do
    (let r-squared (square radius))
    (let area (* pi r-squared))
    area))

(fn complex-calculation (x y)
  (do
    (let sum (+ x y))
    (do
      (let product (* x y))
      (let difference (- x y))
      (list sum product difference))))

;; --- Conditionals and Logic ---
(fn isLargerThan? (a b)
  (if (> a b) a b))

(fn between (x min max)
  (and (>= x min) (<= x max)))

(fn outside (x min max)
  (or (< x min) (> x max)))

(fn not-between (x min max)
  (not (between x min max)))

(fn validate-range (x)
  (cond
    ((and (>= x 0) (< x 10)) "single digit")
    ((and (>= x 10) (< x 100)) "double digit")))

(fn classify-number (x)
  (cond
    ((< x 0) "negative")
    ((= x 0) "zero")
    ((< x 10) "small positive")
    ((< x 100) "medium positive")
    (true "large positive")))

(console.log (classify-number 10))
(console.log (classify-number 100))

;; --- Arithmetic and Comparison Operators ---
(fn arithmetic-demo (a b)
  (list
    (+ a b)  ;; addition
    (- a b)  ;; subtraction
    (* a b)  ;; multiplication
    (/ a b)  ;; division
  ))

(fn comparison-demo (a b)
  (list
    (= a b)   ;; equality
    (!= a b)  ;; inequality
    (< a b)   ;; less than
    (> a b)   ;; greater than
    (<= a b)  ;; less than or equal
    (>= a b)  ;; greater than or equal
  ))


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 3. Higher-Order Functions & Rest Parameters
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; --- Higher-Order Functions ---
(fn apply-twice (f x)
  (f (f x)))

(fn make-multiplier (n)
  (lambda (x) (* x n)))

(fn demonstration ()
  (do
    (let double (make-multiplier 2))
    (double 10)))  ;; Should return 20

;; --- Rest Parameters ---
(fn log-all (& items)
  (console.log items))

(fn with-prefix (prefix & rest)
  (console.log prefix rest))

;; Example calls
(log-all 1 2 3 4 5)
(with-prefix "Numbers:" 1 2 3)


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 4. Comprehensive Showcase
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(fn showcase (n)
  (do
    (let result
      (cond
        ((< n 0) "Cannot compute for negative numbers")
        ((= n 0) "Identity element for factorial")))
    (if result
        result
        (do
          (let fact (factorial n))
          (let msg (+ "Factorial of " (+ n " is " fact)))
          (console.log msg)
          (list n fact)))))
(export "showcase" showcase)


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 5. JavaScript Interoperability & Imports
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(numbers.push 8)
(console.log numbers)

;; --- JavaScript Interoperability ---
;; Accessing JS properties with dot notation
(let pi-value Math.PI)
(let max-int-value Number.MAX_SAFE_INTEGER)

;; Calling JS methods
(let random-number (Math.random))
(let current-timestamp (Date.now))

;; Console methods
(console.log "Hello from HQL!")
(console.warn "This is a warning")

;; Working with dates
(let date (new Date))
(let current-year (date.getFullYear))
(let month (date.getMonth))
(let formatted-date (date.toLocaleDateString))

;; Math methods
(let abs-value (Math.abs -42))
(let rounded (Math.round 3.7))
(let max-value (Math.max 1 2 3 4 5))

;; (Optional) DOM manipulation (when in browser context)
;; (let element (document.getElementById "myElement"))
;; (element.addEventListener "click" (lambda (event) (console.log "Clicked!")))

;; --- Imports ---
(import path from "https://deno.land/std@0.170.0/path/mod.ts")
(let joined-path (path.join "folder" "file.txt"))

(import file from "https://deno.land/std@0.170.0/fs/mod.ts")
(let exists (file.existsSync "example-dir"))

(import express from "npm:express")
(let app (express))                ;; Using default export
(let router (express.Router))      ;; Using named export
(app.use (express.json))           ;; Using named export)


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 6. Advanced Method Chaining & Dot Notation
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; --- Dot Notation Access ---
(let message "Hello, World!")
(let upper-message (message.toUpperCase))
(let message-parts (message.split " "))

(let array [1, 2, 3])
(array.push 4)
(array.push 5)
(console.log array)

;; --- Chained Property Access ---
(let year (date.getFullYear))
(let date-string (date.toISOString))

;; --- Chained Function Calls ---
(let nums [1, 2, 3, 4, 5])
(let filtered (nums.filter (lambda (x) (> x 2))))
(let doubled (filtered.map (lambda (x) (* x 2))))
(let sum (nums.reduce (lambda (a b) (+ a b)) 0))
(let max-sum (Math.max sum 10))

(let config {"db": {"user": {"name": "admin"}}})
(let db-part config.db)
(let user-part db-part.user)
(let admin-name user-part.name)

(fn get-user () {"id": 1, "name": "John"})
(let user-obj (get-user))
(let user-name user-obj.name)

;; --- Multiple Property Access Patterns ---
(let window-width window.innerWidth)
(let array-length array.length)
(let string-upper (message.toUpperCase))
(let substring (message.substring 0 5))
(let replaced (message.replace "Hello" "Hi"))

;; --- Test 4: Basic Method Chaining ---
;; Approach 1: Store intermediate results
(let even-numbers (numbers.filter (lambda (n) (= (% n 2) 0))))
(let doubled-evens (even-numbers.map (lambda (n) (* n 2))))
(console.log "Doubled evens (step by step):" doubled-evens)
(print 
  ([1, 2, 3, 4, 5, 6, 7, 8]
    .filter (lambda (n) (> n 5))
    .length
  )
)

;; 3

(print 
  ([1, 2, 3, 4, 5, 6, 7, 8]
    .filter (lambda (n) (= (% n 2) 0))
    .map    (lambda (n) (* n 2)))
)

;; [ 4, 8, 12, 16 ]

;; Approach 2: Use do block with temporary variables
;; UPDATED: Fixed the invalid do by wrapping both the let and console.log in a do block
(do
  (let chained-result 
    (do
      (let filtered (numbers.filter (lambda (n) (> n 5))))
      (let mapped (filtered.map (lambda (n) (* n 2))))
      (mapped.reduce (lambda (acc n) (+ acc n)) 0)))
  (console.log "Sum of doubled numbers > 5:" chained-result))

;; Approach 3: Direct method chaining with parentheses
(let direct-chain ((numbers.filter (lambda (n) (= (% n 2) 0))).map (lambda (n) (* n 2))))
(console.log "Direct chain result:" direct-chain)

;; --- Test 5: Complex Method Chaining ---
(console.log "\n----- Test 5: Complex Method Chaining -----")
(let complex-chain 
  (((numbers.filter (lambda (n) (> n 3))).map (lambda (n) (* n 3))).slice 0 3))
(console.log "Complex chain result:" complex-chain)

(let sum-chain 
  ((((numbers.filter (lambda (n) (> n 5))).map (lambda (n) (* n 2)))
     .filter (lambda (n) (= (% n 4) 0)))
    .reduce (lambda (acc n) (+ acc n)) 0))
(console.log "Sum from complex chain:" sum-chain)


;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 7. Daily Macros
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Assume core macros (including when/unless) are already loaded.

;; Define a variable
(let macro_x 10)

;; Use 'when' to log a message if x is greater than 5.
(when (> macro_x 5)
  (js-call console "log" "macro_x is greater than 5"))  ;; x is greater than 5

;; Use 'unless' to log a message if x is not less than 5.
(unless (< macro_x 5)
  (console.log "macro_x is not less than 5")) ;; x is not less than 5

(fn hql-unless (x)
  (unless x
    (not x)))

(export "unless" hql-unless)

;; Use 'inc' to compute x+1.
(let x_plus_one (inc macro_x))

;; Use 'dec' to compute x-1.
(let x_minus_one (dec macro_x))

(console.log x_plus_one)  ;; 11
(console.log x_minus_one) ;; 9

;; Type predicate examples
(let symb 'hello)
(let lst '(1 2 3))
(let mp {"name" : "John"})

;; Sequence operation examples
(let list-numbers '(1 2 3 4 5))

;; Collection manipulation examples
(let xs '(1 2 3))
(let ys '(4 5 6))

;; Collection manipulation examples
(let xs2 '(1 2 3))
(let ys2 '(4 5 6))

;; str

;; Basic string concatenation
(let first-name "John")
(let last-name "Doe")
(let full-name (str first-name " " last-name))
(console.log full-name)  ;; "John Doe"

;; Mixing strings and numbers
(let age 30)
(let bio (str full-name " is " age " years old"))
(console.log bio)  ;; "John Doe is 30 years old"

;; Creating a formatted message
(let score 95)
(let max-score 100)
(let percentage (* (/ score max-score) 100))
(let result-message (str "Score: " score "/" max-score " (" percentage "%)"))
(console.log result-message)  ;; "Score: 95/100 (95%)"

;; Using with other expressions
(let items ["apple", "banana", "orange"])
(let item-count items.length)
(let summary (str "Found " item-count " items: " (get items 0) ", " (get items 1) ", " (get items 2)))
(console.log summary)  ;; "Found 3 items: apple, banana, orange"

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; 8. let
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(let (x 10 y 20 z 30) 
  ((+ x y z)))

(let (x 10)
  (console.log (+ x 5)))

;; Let with multiple bindings
(let (x 10
      y 20)
  (+ x y))

;; Nested let expressions
(let (outer 5)
  (let (inner (+ outer 2))
    (* outer inner)))

;; Let with expressions as binding values
(let (sum (+ 2 3)
      product (* 4 5))
  (list sum product))

;; Using let inside a function definition
(fn calculate (base)
  (let (squared (* base base)
        cubed (* squared base))
    (+ squared cubed)))

(calculate 3)

;; if-let

;;-------------------------------------------------
;; Helper Functions
;;-------------------------------------------------
(fn get-number () 42)
(fn get-nothing () nil)
(fn get-zero () 0)
(fn get-string () "Hello")

;;-------------------------------------------------
;; if-let Tests
;;-------------------------------------------------
;; Test 1: if-let with a truthy number (42)
(fn test-if-let-truthy-number ()
  (if-let (x (get-number))
    (str "Got number: " x)
    "No number"))

;; Test 2: if-let with a nil value
(fn test-if-let-nil ()
  (if-let (x (get-nothing))
    (str "Got something: " x)
    "Got nothing"))

;; Test 3: if-let with zero (0 is falsy in JS/HQL)
(fn test-if-let-zero ()
  (if-let (x (get-zero))
    (str "Got zero: " x)
    "Zero is considered falsy"))

;; Test 4: if-let with a non-empty string (truthy)
(fn test-if-let-string ()
  (if-let (x (get-string))
    (str "Got string: " x)
    "No string"))

;; Test 5: Nested if-let:
;; First binding x from get-number; then, if x > 40, bind y from get-string.
(fn test-if-let-nested ()
  (if-let (x (get-number))
    (if-let (y (if (> x 40) (get-string) nil))
      (str "Nested test: x = " x ", y = " y)
      (str "Nested test: x = " x ", no y"))
    "No number"))

;;-------------------------------------------------
;; Run Tests: Console Output
;;-------------------------------------------------
(console.log (test-if-let-truthy-number))  ;; Expected: "Got number: 42"
(console.log (test-if-let-nil))            ;; Expected: "Got nothing"
(console.log (test-if-let-zero))           ;; Expected: "Zero is considered falsy"
(console.log (test-if-let-string))         ;; Expected: "Got string: Hello"
(console.log (test-if-let-nested))         ;; Expected: "Nested test: x = 42, y = Hello"