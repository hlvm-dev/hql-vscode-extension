;; a.hql

(macro greeting (name)
  `(console.log (+ "Hello... " ~name "!")))

(macro farewell (name)
  `(console.log (+ "Goodbye, " ~name "!")))

(export [greeting, farewell])
