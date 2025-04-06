;; macro-a.hql

(import macroB from "./macro-b.hql")
(console.log "macroB : " macroB)
(console.log "macroB.js_minus : " macroB.js_minus)
(console.log "macroB.js_double : " macroB.js_double)

(import [js_minus, js_double] from "./macro-b2.hql")
(console.log "js_minus : " js_minus)
(console.log "js_double : " js_double)
