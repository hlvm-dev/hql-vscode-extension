;; traditional-method-invocation.hql
;; Comprehensive examples of traditional S-expression style method chaining

;; Create various data structures to work with
(var numbers [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
(var words ["apple", "banana", "cherry", "date", "elderberry", "fig", "grape"])
(var text "   The quick brown fox jumps over the lazy dog   ")
(var person { "name": "John", "age": 30, "hobbies": ["coding", "reading", "hiking"] })

(print "========== BASIC METHOD CHAINS ==========")

;; Example 1: Basic two-method chain on an array
(print "\n1. Double all even numbers:")
(print (.map (.filter numbers (lambda (n) (= (% n 2) 0)))
             (lambda (n) (* n 2))))

;; Example 2: Triple chain - filter, map, then sort
(print "\n2. Triple chain - filter > 5, multiply by 2, then sort descending:")
(print (.sort (.map (.filter numbers (lambda (n) (> n 5)))
                    (lambda (n) (* n 2)))
              (lambda (a b) (- b a))))

;; Example 3: Four-method chain with various transformations
(print "\n3. Four-method chain - filter, map, sort, then join:")
(print (.join (.sort (.map (.filter numbers (lambda (n) (> n 3)))
                          (lambda (n) (* n 10)))
                    (lambda (a b) (- a b)))
               ", "))

;; Example 4: More complex filtering condition
(print "\n4. Complex filtering condition:")
(print (.filter numbers (lambda (n)
                          (and (> n 2)
                               (< n 8)
                               (= (% n 2) 1)))))

(print "\n========== STRING METHOD CHAINS ==========")

;; Example 5: String method chains
(print "\n5. String trimming, uppercase, and splitting:")
(print (.split (.toUpperCase (.trim text)) " "))

;; Example 6: Getting the first few characters and calculating length
(print "\n6. Substring and length:")
(print (length (.substring text 3 20)))

;; Example 7: Complex string manipulation
(print "\n7. Multiple string transformations:")
(print (.join (.filter (.split (.toLowerCase (.trim text)) " ")
                       (lambda (word) (> (length word) 3)))
              "-"))

(print "\n========== ARRAY ADVANCED OPERATIONS ==========")

;; Example 8: Reducing an array after other operations
(print "\n8. Filter, map, reduce chain:")
(print (.reduce (.map (.filter numbers (lambda (n) (> n 5)))
                      (lambda (n) (* n 2)))
                (lambda (acc curr) (+ acc curr))
                0))

;; Example 9: Finding the maximum value
(print "\n9. Finding max value with reduce:")
(print (.reduce numbers
                (lambda (max curr) (if (> curr max) curr max))
                (.shift (Array.from numbers))))

;; Example 10: Flat map operation (map + flatten)
(print "\n10. Flat map operation:")
(print (.flatMap words (lambda (word)
                        [word, (length word)])))

;; Example 11: Creating an object from array
(print "\n11. Array reduction to object:")
(print (.reduce words
                (lambda (obj word)
                  (js-set obj word (length word))
                  obj)
                {}))

(print "\n========== OBJECT PROPERTY METHOD CHAINS ==========")

;; Example 12: Method chains with object properties
(print "\n12. Method chains with object properties:")
(print (.join (.map (.filter (person "hobbies")
                            (lambda (hobby) (> (length hobby) 5)))
                    (lambda (h) (.toUpperCase h)))
               " & "))

;; Example 13: Converting object to array and manipulating
(print "\n13. Convert object to array and manipulate:")
(print (.map (.filter (Object.entries person)
                      (lambda (entry) (not (= (entry 0) "age"))))
             (lambda (entry) (.join entry ": "))))

(print "\n========== NESTED METHOD CALLS WITH COMBINATIONS ==========")

;; Example 14: Combining different array methods deeply
(print "\n14. Deeply nested method chain with different arrays:")
(print (.map (.filter (.concat numbers [11, 12, 13, 14, 15])
                      (lambda (n) (= (% n 3) 0)))
             (lambda (n) (* n (.reduce (.filter numbers (lambda (x) (< x n)))
                                      (lambda (acc curr) (+ acc curr))
                                      0)))))

;; Example 15: Multiple method calls on same object across different properties
(print "\n15. Complex object method call:")
(print (length (.join (.split (.toLowerCase (person "name")) "")
                       (.map (person "hobbies") 
                            (lambda (h) (.substring h 0 1))))))

(print "\n========== METHOD CHAINS WITH MATH FUNCTIONS ==========")

;; Example 16: Using Math methods in chains
(print "\n16. Math functions in chains:")
(print (.map numbers 
             (lambda (n) 
               (Math.min 100 (Math.pow n 2) (Math.round (* n 5.5))))))

;; Example 17: Method chains with JSON
(print "\n17. JSON stringify/parse method chain:")
(print (.map (Object.keys (.parse JSON (.stringify JSON person)))
             (lambda (key) (.toUpperCase key))))

(print "\n========== NESTED METHOD CALLS WITH CONDITIONALS ==========")

;; Example 18: Conditional method selection
(print "\n18. Conditional method selection:")
(print (.map numbers (lambda (n)
                       (if (< n 5)
                           (.toString n 2)  ; binary for small numbers
                           (.toString n 16))))) ; hex for larger numbers

;; Example 19: Mixing array and string methods with conditionals
(print "\n19. Mixed array and string methods:")
(print (.map words (lambda (word)
                     (if (< (length word) 6)
                         (.repeat word 2)
                         (.substring word 0 5)))))

(print "\n========== END OF EXAMPLES ==========")