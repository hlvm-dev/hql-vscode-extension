;; dot-chain-invocation.hql
;; Example implementation of the Doc Syntax (Dot-Chain) Invocation style

;; Create various data structures to work with - same as our traditional examples
(var numbers [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
(var words ["apple", "banana", "cherry", "date", "elderberry", "fig", "grape"])
(var text "   The quick brown fox jumps over the lazy dog   ")
(var person { "name": "John", "age": 30, "hobbies": ["coding", "reading", "hiking"] })

(print "========== DOT CHAIN SYNTAX EXAMPLES ==========")

;; Example 1: Basic chain on an array
(print "\n1. Double all even numbers (dot chain):")
(print (numbers
  .filter (lambda (n) (= (% n 2) 0))
  .map (lambda (n) (* n 2))))

;; Example 2: Triple chain with dot syntax
(print "\n2. Triple chain with dot syntax:")
(print (numbers
  .filter (lambda (n) (> n 5))
  .map (lambda (n) (* n 2))
  .sort (lambda (a b) (- b a))))

;; Example 3: Four-operation chain
(print "\n3. Four-operation chain with dot syntax:")
(print (numbers
  .filter (lambda (n) (> n 3))
  .map (lambda (n) (* n 10))
  .sort (lambda (a b) (- a b))
  .join ", "))

;; Example 4: String operations
(print "\n4. String operations with dot syntax:")
(print (text
  .trim
  .toUpperCase
  .split " "))

;; Example 5: Complex string transformations
(print "\n5. Complex string transformations:")
(print (text
  .trim
  .toLowerCase
  .split " "
  .filter (lambda (word) (> (length word) 3))
  .join "-"))

;; Example 6: Array reduce with dot syntax
(print "\n6. Array reduce with dot syntax:")
(print (numbers
  .filter (lambda (n) (> n 5))
  .map (lambda (n) (* n 2))
  .reduce (lambda (acc curr) (+ acc curr)) 0))

;; Example 7: Object property manipulation
(print "\n7. Object property manipulation:")
(print (person.hobbies
  .filter (lambda (hobby) (> (length hobby) 5))
  .map (lambda (h) (.toUpperCase h))
  .join " & "))

(print (person
  .hobbies
  .filter (lambda (hobby) (> (length hobby) 5))
  .map (lambda (h) (.toUpperCase h))
  .join " & "))

;; Example 8: Math operations in dot chain
(print "\n8. Math operations in dot chain:")
(print (numbers
  .map (lambda (n) 
    (Math.min 100 (Math.pow n 2) (Math.round (* n 5.5))))))

;; Example 9: Mixed string and array operations
(print "\n9. Mixed string and array operations:")
(print (words
  .map (lambda (word)
    (if (< (length word) 6)
      (.repeat word 2)
      (.substring word 0 5)))
  .join " | "))

;; Example 10: Nested dot chains
(print "\n10. Nested dot chains:")
(print (numbers
  .filter (lambda (n) (= (% n 3) 0))
  .map (lambda (n) 
    (* n 
      (numbers
        .filter (lambda (x) (< x n))
        .reduce (lambda (acc curr) (+ acc curr)) 0)))))

(print "\n========== END OF DOT CHAIN EXAMPLES ==========")