;; ====================================================
;; HQL Loop Constructs Examples
;; ====================================================

;; ====================================
;; 1. Basic loop/recur mechanism
;; ====================================
;; The fundamental loop/recur is HQL's core iteration construct
;; providing explicit tail recursion optimization

(loop (i 0)
  (when (< i 3)
    (print "Basic loop iteration:" i)
    (recur (+ i 1))))

;; Output:
;; Basic loop iteration: 0
;; Basic loop iteration: 1
;; Basic loop iteration: 2

;; ====================================
;; 2. While Loop
;; ====================================
;; While loop is implemented as a macro over loop/recur

(var count 0)
(while (< count 3)
  (print "While iteration:" count)
  (set! count (+ count 1)))
(print "Final count:" count)

;; Output:
;; While iteration: 0
;; While iteration: 1
;; While iteration: 2
;; Final count: 3

;; ====================================
;; 3. Repeat Loop
;; ====================================
;; Repeats a body a specific number of times without 
;; requiring you to use an index variable

(repeat 3
  (print "Repeat: Hello, world!"))

;; Output:
;; Repeat: Hello, world!
;; Repeat: Hello, world!
;; Repeat: Hello, world!

;; You can use the repeat loop with multiple expressions
(repeat 2
  (print "First line")
  (print "Second line"))

;; Output:
;; First line
;; Second line
;; First line
;; Second line

;; ====================================
;; 4. Enhanced For Loop
;; ====================================
;; The unified for loop provides multiple styles:

;; Style 1: Traditional with positional parameters
;; Start at 0, end at count-1
(for (i 3)
  (print "Loop 1:" i))

;; Output:
;; Loop 1: 0
;; Loop 1: 1
;; Loop 1: 2

;; Start at start, end at end-1
(for (i 5 8)
  (print "Loop 2:" i))

;; Output:
;; Loop 2: 5
;; Loop 2: 6
;; Loop 2: 7

;; Start at start, end at end-1, step by increment
(for (i 0 10 2)
  (print "Loop 3:" i))

;; Output:
;; Loop 3: 0
;; Loop 3: 2
;; Loop 3: 4
;; Loop 3: 6
;; Loop 3: 8

;; Style 2: Named parameters (more readable)
;; Simple 'to' form
(for (i to: 3)
  (print "Named loop 1:" i))

;; Output:
;; Named loop 1: 0
;; Named loop 1: 1
;; Named loop 1: 2

;; 'from' and 'to' form
(for (i from: 5 to: 8)
  (print "Named loop 2:" i))

;; Output:
;; Named loop 2: 5
;; Named loop 2: 6
;; Named loop 2: 7

;; Full form with 'from', 'to', and 'by'
(for (i from: 0 to: 10 by: 2)
  (print "Named loop 3:" i))

;; Output:
;; Named loop 3: 0
;; Named loop 3: 2
;; Named loop 3: 4
;; Named loop 3: 6
;; Named loop 3: 8

;; 'to' and 'by' form
(for (i to: 10 by: 3)
  (print "Named loop 4:" i))

;; Output:
;; Named loop 4: 0
;; Named loop 4: 3
;; Named loop 4: 6
;; Named loop 4: 9