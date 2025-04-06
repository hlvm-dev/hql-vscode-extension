;; b.hql

(import [greeting, farewell] from "./a.hql")
(import [greeting2 as greeting3, farewell2] from "./c.hql")

(greeting "World")
(farewell "Friends")

(greeting3 "World2")
(farewell2 "Friends2")