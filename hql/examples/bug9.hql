(fx multiply (x: Int = 10 y: Int = 20) (-> Int)
  (* x y))

;; 1. Using defaults:
(print (multiply))                   ;; Uses both defaults: 10 * 20 = 200

;; 2. Positional arguments:
(print (multiply 5))                 ;; Overrides x: 5 * 20 = 100
(print (multiply 5 7))               ;; Overrides both: 5 * 7 = 35

;; 3. Named arguments:
(print (multiply x: 5))              ;; x overridden: 5 * 20 = 100
(print (multiply y: 15))             ;; y overridden: 10 * 15 = 150
(print (multiply x: 5 y: 7))         ;; Both overridden: 5 * 7 = 35

;; 5. Using a placeholder (if supported) to skip parameters:
(print (multiply _ 7))              ;; Explicitly skip x: x remains 10, y becomes 7 → 10 * 7 = 70

;; Not allowed (ambiguous):
;; (print (multiply 5 y: 7))         ;; Mixing positional (5) with named (y: 7)
;; (print (multiply x: 5 7))         ;; Mixing named (x: 5) with positional (7)


;; TODO: any
/*
;; Simple test for deep copying in pure functions

;; Define a pure function that tries to modify a nested property
(fx modify-nested (obj)
  ;; Try to modify the nested property
  (js-set (js-get obj "nested") "value" "modified")
  ;; Return the object
  obj)

;; Create a test object with a nested object
(let original {"nested": {"value": "original"}})

;; Call the pure function with our object
(let result (modify-nested original))

;; Print the values to see if original was modified
(print (str "Original nested value: " (js-get (js-get original "nested") "value")))
(print (str "Result nested value: " (js-get (js-get result "nested") "value")))

;; Check if they're actually different objects
(print (str "Are objects identical? " (= original result)))
(print (str "Are nested objects identical? " (= (js-get original "nested") (js-get result "nested"))))
*/ \ => ❌ Error during processing: _ is not defined: _ is not defined