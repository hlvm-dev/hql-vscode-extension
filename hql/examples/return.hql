;; ============= Return Behavior Tests =============
(print "\n=== Testing Return Behavior in HQL ===\n")

;; -------------------------
;; Testing fx Functions
;; -------------------------
(print "\n## fx Function Return Tests ##\n")

;; 1. Implicit return (last expression is returned)
(fx implicit-return-fx (x: Int) (-> Int)
  (let (doubled (* x 2))
    doubled))  ;; last expression is returned implicitly

(print "fx implicit return: " (implicit-return-fx 5))  ;; Should print 10

;; 2. Explicit return
(fx explicit-return-fx (x: Int) (-> Int)
  (let (doubled (* x 2))
    (return doubled)))  ;; explicit return statement

(print "fx explicit return: " (explicit-return-fx 5))  ;; Should print 10

;; 3. Early return with conditional
(fx early-return-fx (x: Int) (-> Int)
  (if (< x 0)
      (return 0)  ;; early return if x is negative
      (* x 2)))   ;; implicit return for positive values

(print "fx early return (negative): " (early-return-fx -5))  ;; Should print 0
(print "fx no early return (positive): " (early-return-fx 5))  ;; Should print 10

;; 4. Multiple return statements
(fx multi-return-fx (x: Int) (-> Int)
  (if (< x 0)
      (return 0)
      (if (> x 10)
          (return 100)
          (return x))))

(print "fx multi-return (negative): " (multi-return-fx -5))  ;; Should print 0
(print "fx multi-return (large): " (multi-return-fx 15))     ;; Should print 100
(print "fx multi-return (normal): " (multi-return-fx 7))     ;; Should print 7

;; 5. Conditional with mixed explicit/implicit return
(fx mixed-return-fx (x: Int) (-> Int)
  (if (< x 0)
      (return 0)    ;; explicit return
      (* x 2)))     ;; implicit return

(print "fx mixed return (negative): " (mixed-return-fx -5))  ;; Should print 0
(print "fx mixed return (positive): " (mixed-return-fx 5))   ;; Should print 10

;; -------------------------
;; Testing fn Functions
;; -------------------------
(print "\n## fn Function Return Tests ##\n")

;; 1. Implicit return (last expression is returned)
(fn implicit-return-fn (x)
  (let (doubled (* x 2))
    doubled))  ;; last expression is returned implicitly

(print "fn implicit return: " (implicit-return-fn 5))  ;; Should print 10

;; 2. Explicit return
(fn explicit-return-fn (x)
  (let (doubled (* x 2))
    (return doubled)))  ;; explicit return statement

(print "fn explicit return: " (explicit-return-fn 5))  ;; Should print 10

;; 3. Early return with conditional
(fn early-return-fn (x)
  (if (< x 0)
      (return 0)  ;; early return if x is negative
      (* x 2)))   ;; implicit return for positive values

(print "fn early return (negative): " (early-return-fn -5))  ;; Should print 0
(print "fn no early return (positive): " (early-return-fn 5))  ;; Should print 10

;; 4. Multiple return statements
(fn multi-return-fn (x)
  (if (< x 0)
      (return 0)
      (if (> x 10)
          (return 100)
          (return x))))

(print "fn multi-return (negative): " (multi-return-fn -5))  ;; Should print 0
(print "fn multi-return (large): " (multi-return-fn 15))     ;; Should print 100
(print "fn multi-return (normal): " (multi-return-fn 7))     ;; Should print 7

;; 5. Conditional with mixed explicit/implicit return
(fn mixed-return-fn (x)
  (if (< x 0)
      (return 0)    ;; explicit return
      (* x 2)))     ;; implicit return

(print "fn mixed return (negative): " (mixed-return-fn -5))  ;; Should print 0
(print "fn mixed return (positive): " (mixed-return-fn 5))   ;; Should print 10

;; -------------------------
;; Testing Lambdas
;; -------------------------
(print "\n## Lambda Return Tests ##\n")

;; 1. Implicit return in lambda
(let (implicit-lambda (lambda (x) (-> Int)
                        (* x 2)))  ;; last expression is returned implicitly
  (print "lambda implicit return: " (implicit-lambda 5)))  ;; Should print 10

;; 2. Explicit return in lambda
(let (explicit-lambda (lambda (x) (-> Int)
                        (return (* x 2))))  ;; explicit return
  (print "lambda explicit return: " (explicit-lambda 5)))  ;; Should print 10

;; 3. Early return in lambda
(let (early-lambda (lambda (x) (-> Int)
                     (if (< x 0)
                         (return 0)  ;; early return
                         (* x 2))))
  (print "lambda early return (negative): " (early-lambda -5))  ;; Should print 0
  (print "lambda no early return (positive): " (early-lambda 5)))  ;; Should print 10

;; 4. Multiple statements in lambda body with implicit return
(let (multi-lambda (lambda (x) (-> Int)
                     (let (a (* x 2))
                       (let (b (+ a 1))
                         b))))  ;; implicit return of last expression
  (print "lambda multi-statement: " (multi-lambda 5)))  ;; Should print 11

;; 5. Multiple statements with explicit return
(let (multi-explicit-lambda (lambda (x) (-> Int)
                              (let (a (* x 2))
                                (let (b (+ a 1))
                                  (return b)))))
  (print "lambda multi-statement explicit: " (multi-explicit-lambda 5)))  ;; Should print 11

;; -------------------------
;; Testing Nested Functions
;; -------------------------
(print "\n## Nested Function Return Tests ##\n")

;; 1. fn containing a lambda with its own return
(fn nested-fn-lambda (x)
  (let (inner-lambda (lambda (y) (-> Int)
                       (if (< y 0)
                           (return 0)
                           (* y 2))))
    (inner-lambda x)))

(print "nested fn/lambda (negative): " (nested-fn-lambda -5))  ;; Should print 0
(print "nested fn/lambda (positive): " (nested-fn-lambda 5))   ;; Should print 10

;; 2. fx containing a lambda with its own return
(fx nested-fx-lambda (x: Int) (-> Int)
  (let (inner-lambda (lambda (y)
                       (if (< y 0)
                           (return 0)
                           (* y 2))))
    (return (inner-lambda x))))

(print "nested fx/lambda (negative): " (nested-fx-lambda -5))  ;; Should print 0
(print "nested fx/lambda (positive): " (nested-fx-lambda 5))   ;; Should print 10

;; 3. Complex nested pattern with multiple returns
(fn complex-nested (condition)
  (let (inner-fn (lambda (x) (-> Int)
                   (if (< x 0)
                       (return -1)  ;; Return from lambda
                       (* x 2))))
    (if condition
        (inner-fn 5)      ;; Call lambda with positive value
        (return -999))))  ;; Early return from outer function

(print "complex nested (true): " (complex-nested true))    ;; Should print 10 (lambda returns 5*2)
(print "complex nested (false): " (complex-nested false))  ;; Should print -999 (early outer return)

;; -------------------------
;; Testing Edge Cases
;; -------------------------
(print "\n## Return Edge Cases ##\n")

;; 1. Empty function body with return
(fn empty-with-return ()
  (return 42))

(print "empty body with return: " (empty-with-return))  ;; Should print 42

;; 2. Return in nested block
(fn nested-block-return (x)
  (let (a 10)
    (let (b 20)
      (if (> x 0)
          (return (+ a b))  ;; Return from deeply nested block
          (- a b)))))

(print "nested block return (positive): " (nested-block-return 5))   ;; Should print 30
(print "nested block return (negative): " (nested-block-return -5))  ;; Should print -10

;; 3. Return of complex data structure
(fn return-complex ()
  (return {"name": "John", "age": 30, "scores": [85, 90, 95]}))

(print "return complex: " (return-complex))

;; 4. Multiple sequential returns (only first one matters)
(fn sequential-returns (x)
  (return (+ x 1))  ;; This is the only return that matters
  (return (+ x 2))  ;; This is unreachable
  (+ x 3))          ;; This is also unreachable

(print "sequential returns: " (sequential-returns 10))  ;; Should print 11

;; 4. Multiple sequential returns (only first one matters)
(fn sequential-returns2 (x)
  ((+ x 1))
  (return (+ x 2)) ;; return 
  (+ x 3))

(print "sequential returns: " (sequential-returns2 10))  ;; Should print 12



;; 4. Multiple sequential returns (only first one matters)
(fn sequential-returns3 (x)
  ((+ x 1))
  ((+ x 2))
  (+ x 3)) ;; return (implicit. the last expression)

(print "sequential returns: " (sequential-returns3 10))  ;; Should print 13

;; 5. Return from deeply nested condition
(fn deep-conditional-return (x)
  (return ;; Return the result of the entire nested if structure
    (if (> x 10) ;; Outer if
      (if (> x 20) ;; Middle if
        (if (> x 30) ;; Inner if
          "very large"  ;; Consequent for inner if (x > 30)
          "large")      ;; Alternate for inner if (x <= 30 but > 20)
        "medium")       ;; Alternate for middle if (x <= 20 but > 10)
      "small")))        ;; Alternate for outer if (x <= 10)

;; Testing the function
(print "deep conditional (40): " (deep-conditional-return 40)) ;; Should print "very large"
(print "deep conditional (25): " (deep-conditional-return 25)) ;; Should print "large"
(print "deep conditional (15): " (deep-conditional-return 15)) ;; Should print "medium"
(print "deep conditional (5): " (deep-conditional-return 5))   ;; Should print "small"

;; -------------------------
;; Testing Return with Function Arguments
;; -------------------------
(print "\n## Return in Function Arguments ##\n")

;; 1. Return used as argument to other functions
(fn add-one (x)
  (+ x 1))

(fn return-as-arg (condition)
  ;; Note: Assuming 'return 0' causes return-as-arg to exit immediately
  ;; when condition is false, as implied by the expected output.
  (add-one (if condition
             10           ;; If true, add-one is called with 10
             (return 0)))) ;; If false, return-as-arg should exit with 0 immediately

(print "return as argument (true): " (return-as-arg true))   ;; Expected: 11 (10 + 1)
(print "return as argument (false): " (return-as-arg false)) ;; Expected: 0 (due to return 0)

;; -------------------------
;; Testing Multiple Function Composition
;; -------------------------
(print "\n## Function Composition with Return ##\n")

;; 1. Chain of function calls with returns
(fn outer (x)
  ;; Note: Behavior depends on whether 'return' performs a non-local exit
  ;; across function boundaries. Comments imply non-local exit for -5 and 5,
  ;; but local exit for 15. Assuming standard 'return' exits only the
  ;; immediate function.
  (let (result (middle x))
    (+ result 1000)))

(fn middle (x)
  (if (< x 0)
    (return -1)   ;; Returns -1 from *middle*
    (inner x)))    ;; Otherwise, returns the result of inner(x)

(fn inner (x)
  (if (< x 10)
    (return 0)    ;; Returns 0 from *inner*
    (* x 10)))     ;; Otherwise, returns x * 10

;; Expected results assuming 'return' exits ONLY the current function:
(print "function chain (negative): " (outer -5)) ;; middle returns -1 -> outer returns 999. (Comment implies -1)
(print "function chain (small): " (outer 5))    ;; inner returns 0 -> middle returns 0 -> outer returns 1000. (Comment implies 0)
(print "function chain (large): " (outer 15))   ;; inner returns 150 -> middle returns 150 -> outer returns 1150. (Comment matches)

(print "\n=== Return Tests Complete ===\n") ;; Fixed closing quote