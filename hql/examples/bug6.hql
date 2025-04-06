(import formatter from "./test/formatter.js")
(import [formatText] from "./test/formatter.js")

(print (formatter.formatText "yo format"))
(print (formatText "yo format"))

;; seoksoonjang@MacBookPro hql % deno run -A ./cli/run.ts ./lib/test.hql
;; ❌ ❌ Error processing HQL: Symbol 'formatText' not found in module './test/formatter.js'
;; ❌ Error during processing: Symbol 'formatText' not found in module './test/formatter.js'
;; seoksoonjang@MacBookPro hql %

;; conflict. but if I comment one of them, then it works