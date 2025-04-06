;; Example class with both fn and fx methods
(class Calculator
  ;; Class fields
  (var baseValue)

  ;; Constructor
  (constructor (baseValue)
    (do
      (set! this.baseValue baseValue)))
      
  ;; fx method with both parameters having default values
  (fx multiply (x: Int = 100 y: Int = 2) (-> Int)
    (* x y))
)

;; Create an instance
(let calc (new Calculator 10))

;; Test with no arguments - should use both defaults (100 * 2 = 200)
(print "fx method with both defaults: calc.multiply() =>" (calc.multiply))

;; Test with one argument - should use second default (5 * 2 = 10)
(print "fx method with one arg: calc.multiply(5) =>" (calc.multiply 5))

;; Test with both arguments - no defaults used (7 * 3 = 21)
(print "fx method with two args: calc.multiply(7, 3) =>" (calc.multiply 7 3))