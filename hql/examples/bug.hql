;; stdlib.hql - HQL wrapper over the JavaScript implementation

(import [ _groupBy] from "../lib/stdlib/stdlib.js")

(fn group-by (f coll)
  (_groupBy f coll))

;; - is not supported in export.
(export [group-by])