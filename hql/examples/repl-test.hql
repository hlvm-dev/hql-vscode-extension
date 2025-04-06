;; repl-test.hql - File to test importing in REPL
;; Load this file in HQL REPL with the command:
;; deno run -A cli/repl.ts --load examples/repl-test.hql

(console.log "REPL Test - Importing modules")

;; Define a module that we can import in the REPL
(fn add (x y)
  (+ x y))

(fn multiply (x y)
  (* x y))

(fn greet (name)
  (console.log (str "Hello, " name "!")))

;; Export functions so they can be imported
(export [add, multiply, greet])

;; Example usage
(console.log "2 + 3 =" (add 2 3))
(console.log "4 * 5 =" (multiply 4 5))
(greet "REPL User") 