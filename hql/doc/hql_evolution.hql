;;  where promising new hql syntax is noted.



;;;;;;;;;;; fx

;; advanced defn with type and named and default parameter 

(fx add (a: Int b: Int = 0) (-> Int)
  (+ a b)

(add a: 10 b: 20)

;;;;;;;;;;; class

;; native lisp class abstraction

(class Person
  (fields
    (name)         ;; required field
    (age)          ;; required field
    (x 10)         ;; field with default value 10
    (y nil))       ;; field with default nil (e.g. for dependency injection)

  (methods
    (fn greet (self)
      (+ "Hello, " self.name))

    (fn celebrateBirthday (self newAge)
      (do
        (set! self.age newAge)
        self))))


;; Creating an instance:
(let p (new Person "Alice" 30))

;; Accessing a property:
(p.name)

;; Calling methods:
(p.greet)              ;; => "Hello, Alice"
(p.age)                ;; => 31
(p.celebrateBirthday 31)

;;;;;;;;;;; For Loop Examples

;; Range loop:
(for (i (range 0 10))
  (print i))