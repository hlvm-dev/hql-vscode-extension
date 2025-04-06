;; macro-b.hql - Using proper quasiquote syntax for macros

(import utils from "./utils.js")

(let js_double (utils.double 10))
(let js_minus (utils.minus 10))

(export [js_minus, js_double])