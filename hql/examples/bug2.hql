(import _ from "npm:lodash")

(let numbers [1,2,3,4,5,6,7,8,9,10])

(print
  ((((numbers.filter (lambda (n) (> n 5))).map (lambda (n) (* n 2)))
     .filter (lambda (n) (= (% n 4) 0)))
    .reduce (lambda (acc n) (+ acc n)) 0)
)

/*
(print
  ((((
    numbers
    .filter (lambda (n) (> n 5))).map (lambda (n) (* n 2)))
    .filter (lambda (n) (= (% n 4) 0)))
    .reduce (lambda (acc n) (+ acc n)) 0)
)

;;  => ❌ Error during processing: numbers is not a function
*/

(let direct-chain ((numbers.filter (lambda (n) (= (% n 2) 0))).map(lambda (n) (* n 2))))
(console.log "Direct chain result:" direct-chain)