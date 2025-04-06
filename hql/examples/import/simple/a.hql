;; a.hql

(macro hello (name)
  `(console.log (+ "Hello, " ~name "!")))

(export [hello])