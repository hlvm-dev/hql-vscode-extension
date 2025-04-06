;; repl-import-test.hql - Test file for REPL imports
;; You can run this in the REPL after loading repl-test.hql

;; Import from the repl-test.hql file
(import [add, multiply] from "./repl-test.hql")

;; Demonstrate usage of imports
(console.log "From REPL import test:")
(console.log "5 + 10 =" (add 5 10))
(console.log "3 * 7 =" (multiply 3 7))

;; Define a composite function using imports
(fn compute-sum-product (x y)
  (+ (add x y) (multiply x y)))

;; Export for further testing
(export compute-sum-product)

;; Example usage
(console.log "Sum + Product of 3,4 =" (compute-sum-product 3 4))
;; Should output 19 (3+4 + 3*4 = 7 + 12 = 19) 