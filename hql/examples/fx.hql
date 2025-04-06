(print "============ fx test =============")

(fx stringify (value: Any) (-> String)
  (return (js-call JSON "stringify" value)))
  

;; test-types-enhanced-fixed.hql
;; This file demonstrates practical pure functions using safe JavaScript globals

;; Basic Int type function
(fx add-ints (a: Int b: Int) (-> Int)
  (+ a b))

;; Example with default values
(fx add-with-defaults (a: Int = 5 b: Int = 10) (-> Int)
  (+ a b))

;; Function with Double type
(fx multiply-doubles (a: Double b: Double) (-> Double)
  (* a b))

;; Function with String type
(fx concat-strings (a: String b: String) (-> String)
  (+ a b))

;; Function with Bool type - Using logical AND operation
(fx logical-and (a: Bool b: Bool) (-> Bool)
  (if a 
      (if b true false)
      false))

;; Function with Any type - Using JSON for stringification
;; Using explicit return to demonstrate the new syntax


;; Function using Math operations - FIXED with explicit return
(fx calculate-distance (x1: Double y1: Double x2: Double y2: Double) (-> Double)
  (let (dx (- x2 x1)
        dy (- y2 y1))
    ;; Make expression the last position to ensure proper return
    (return (js-call Math "sqrt" (+ (* dx dx) (* dy dy))))))

;; Function with mixed types - FIXED with explicit return
(fx format-user (name: String age: Int active: Bool) (-> String)
  (let (status (if active "active" "inactive"))
    ;; Ensuring this is returned properly
    (return (+ "User " name " is " (+ "" age) " years old and " status))))

;; Function that takes Any type and returns specific type
(fx convert-to-bool (value: Any) (-> Bool)
  (if value true false))

;; Function that demonstrates deep copying of parameters - FIXED
(fx increment-counters (obj: Any) (-> Any)
  ;; Make sure obj is not null or undefined 
  (if (eq? obj null)
      ;; Return a default object if input is null
      (return {"count": 1})
      ;; Process the object with explicit return
      (let (
        ;; Create a new object with the updated count
        newObj (js-call Object "assign" (js-call Object "create" {}) obj)
        ;; Get the current count or default to 0 if not present
        currentCount (if (js-call Object "hasOwnProperty" obj "count")
                        (js-get obj "count")
                        0)
      )
        ;; Set the new count
        (js-set newObj "count" (+ currentCount 1))
        ;; Explicitly return the new object
        (return newObj))))

;; Function that uses Object operations - FIXED
(fx merge-objects (obj1: Any obj2: Any) (-> Any)
  ;; Handle null inputs by providing empty objects as defaults
  (let (
    safe-obj1 (if (eq? obj1 null) {} obj1)
    safe-obj2 (if (eq? obj2 null) {} obj2)
  )
    ;; Use explicit return for clarity
    (return (js-call Object "assign" (js-call Object "create" {}) safe-obj1 safe-obj2))))

;; Test implementation of all functions
(let (
  ;; Test Int functions
  test1 (add-ints 5 7)
  test2 (add-with-defaults)  ;; Uses defaults: 5 + 10 = 15
  test3 (add-with-defaults 20)  ;; Uses one default: 20 + 10 = 30
  test4 (add-with-defaults 3 4)  ;; No defaults: 3 + 4 = 7
  
  ;; Test Double functions
  test5 (multiply-doubles 2.5 3.0)  ;; 7.5
  
  ;; Test String functions
  test6 (concat-strings "Hello, " "World!")  ;; "Hello, World!"
  
  ;; Test Bool functions
  test7 (logical-and true false)  ;; false
  
  ;; Test Any type functions
  test8 (stringify {"name": "John", "age": 30})  ;; JSON string
  
  ;; Test Math operations
  test9 (calculate-distance 0 0 3 4)  ;; 5.0
  
  ;; Test mixed type function
  test10 (format-user "Alice" 25 true)  ;; "User Alice is 25 years old and active"
  
  ;; Test conversion function
  test11 (convert-to-bool 0)  ;; false
  
  ;; Test object mutation/copying
  test12 (increment-counters {"count": 5})  ;; {"count": 6}
  
  ;; Test null handling
  test13 (increment-counters null)  ;; {"count": 1}
  
  ;; Test object merging
  test14 (merge-objects {"a": 1} {"b": 2})  ;; {"a": 1, "b": 2}
  
  ;; Test null handling in merge
  test15 (merge-objects null {"key": "value"})  ;; {"key": "value"}
)
  (print "Test 1 (add-ints):" test1)
  (print "Test 2 (add-with-defaults, no args):" test2)
  (print "Test 3 (add-with-defaults, one arg):" test3)
  (print "Test 4 (add-with-defaults, two args):" test4)
  (print "Test 5 (multiply-doubles):" test5)
  (print "Test 6 (concat-strings):" test6)
  (print "Test 7 (logical-and):" test7)
  (print "Test 8 (stringify):" test8)
  (print "Test 9 (calculate-distance):" test9)
  (print "Test 10 (format-user):" test10)
  (print "Test 11 (convert-to-bool with 0):" test11)
  (print "Test 12 (increment-counters):" test12)
  (print "Test 13 (increment-counters with null):" test13)
  (print "Test 14 (merge-objects):" test14)
  (print "Test 15 (merge-objects with null):" test15)
)


(let json {"name": "John", "age": 30})

(fx stringify2 (value: Any) (-> String)
  (return (js-call JSON "stringify" value)))

(print (stringify2 value: json))
(print (stringify2 value: {"name": "John", "age": 30}))
(print (stringify2 {"name": "John", "age": 30}))