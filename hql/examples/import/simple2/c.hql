;; c.hql

(macro greeting2 (name)
  `(console.log (+ "Hello~~ " ~name "!")))

(macro farewell2 (name)
  `(console.log (+ "Goodbye, " ~name "!")))

(export [greeting2, farewell2])
