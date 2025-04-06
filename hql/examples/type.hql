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