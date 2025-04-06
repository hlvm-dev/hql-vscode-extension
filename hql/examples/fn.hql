(print "============ fn test =============")

(fn multiply (x = 10 y = 20)
  (* x y))

;; 1. Using defaults:
(print (multiply))                   ;; Uses both defaults: 10 * 20 = 200

(fn multiply2 (x: Int = 100 y: Int) (-> Int)
  (* x y))

(print (multiply2 y: 200))

;; 2. Positional arguments:
(print (multiply 5))                 ;; Overrides x: 5 * 20 = 100
(print (multiply 5 7))               ;; Overrides both: 5 * 7 = 35

;; 3. Named arguments:
(print (multiply x: 5))              ;; x overridden: 5 * 20 = 100
(print (multiply y: 15))             ;; y overridden: 10 * 15 = 150
(print (multiply x: 5 y: 7))         ;; Both overridden: 5 * 7 = 35

;; 5. Using a placeholder (if supported) to skip parameters:
(print (multiply _ 7))              ;; Explicitly skip x: x remains 10, y becomes 7 → 10 * 7 = 70

(fn hello ()
  (print "hello"))

(hello)

(fn with-prefix (prefix & rest)
  (console.log prefix rest))

(with-prefix "Numbers:" 1 2 3)

;; not allowed (X)
;; (multiply 5 y: 7)         ;; x from position (5), y from named (7) → Ambiguous
;; (multiply x: 5 7)         ;; If allowed, x is named (5) and y is positional (7) → Ambiguous

