;; examples/interop/test.hql


(console.log "ya11")
(import module from "./test.js")
(console.log "ya22")



(import spec from "../../doc/hql_spec.hql")
(console.log "do spec square : " (spec.square 10))

(import module2 from "./test2.js")
(console.log "module2.hqlSquare wrong : " (module2.hqlSquare 3))

(import module1 from "./test.js")
(console.log "module1.hqlUnless : " (module1.hqlUnless true))
