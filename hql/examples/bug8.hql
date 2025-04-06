(import [_take] from "../lib/stdlib/stdlib.js")
(import [_map, _filter, _reduce, _range, _rangeGenerator, _groupBy, _keys] from "../lib/stdlib/stdlib.js")

;; due to name conflict of stdlib.js and stdlib.hql -> stdlib.js by default, it clashes and results in weird reference missing error.