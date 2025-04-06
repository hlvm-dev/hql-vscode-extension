;; stdlib-test.hql - Simple tests for HQL standard library functions

;; Import all utility functions from stdlib
(import [take, map, filter, reduce, groupBy, keys] from "./lib/stdlib/stdlib.hql")

;; Create some test data
(let numbers [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
(let users [
  {"name": "Alice", "age": 28, "role": "admin"},
  {"name": "Bob", "age": 32, "role": "user"},
  {"name": "Charlie", "age": 22, "role": "user"},
  {"name": "Diana", "age": 45, "role": "admin"},
  {"name": "Eve", "age": 19, "role": "user"}
])

;; Testing 'take' function
(let first-three (take 3 numbers))
(print "take 3:" first-three) ;; Should output [1, 2, 3]

;; Testing 'map' function
(let doubled (map (lambda (x) (* x 2)) numbers))
(print "map double:" doubled) ;; Should output [2, 4, 6, 8, 10, 12, 14, 16, 18, 20]

;; Testing 'filter' function
(let even-numbers (filter (lambda (x) (= (% x 2) 0)) numbers))
(print "filter even:" even-numbers) ;; Should output [2, 4, 6, 8, 10]

;; Testing 'reduce' function
(let sum (reduce (lambda (acc x) (+ acc x)) 0 numbers))
(print "reduce sum:" sum) ;; Should output 55

;; Testing combined operations
(let sum-of-doubled-evens 
  (reduce (lambda (acc x) (+ acc x)) 
          0 
          (map (lambda (x) (* x 2)) 
               (filter (lambda (x) (= (% x 2) 0)) numbers))))
(print "sum of doubled evens:" sum-of-doubled-evens) ;; Should output 60

;; Testing 'groupBy' function
(let grouped-by-role (groupBy (lambda (user) (user.role)) users))
(print "group by role:")
(print grouped-by-role) ;; Should group users by admin and user roles

;; Testing 'keys' function
(let user-keys (keys (first users)))
(print "keys of user object:" user-keys) ;; Should output ["name", "age", "role"]

;; Test with more complex data transformation
(print "\nTransforming user data:")
(let user-names 
  (map (lambda (user) (user.name)) 
       (filter (lambda (user) (> (user.age) 25)) users)))
(print "Names of users over 25:" user-names) ;; Should output ["Alice", "Bob", "Diana"]