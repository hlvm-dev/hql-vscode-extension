;; Test 1: loop in fx function should work now
(fx generate-numbers-fx (count: Int) (-> [Int])
  (let (result [])
    (loop (i 0 result result)
      (if (>= i count)
        result
        (recur (+ i 1) (.concat result [i]))))))

;; Test 2: loop in fn function should properly return values 
(fn generate-numbers-fn (count: Int) (-> [Int])
  (let (result [])
    (loop (i 0 result result)
      (if (>= i count)
        result
        (recur (+ i 1) (.concat result [i]))))))

;; Test both implementations
(print "FX implementation result:")
(print (generate-numbers-fx 5))

(print "FN implementation result:")
(print (generate-numbers-fn 5))

;; Additional test with more complex loop body
(fn generate-nested (rows: Int cols: Int) (-> [[Int]])
  (let (result [])
    (loop (i 0 result result)
      (if (>= i rows)
        result
        (let (row [])
          ;; First fill the row completely
          (let (filled-row 
            (loop (j 0 row row)
              (if (>= j cols)
                row
                (recur (+ j 1) (.concat row [(* i j)])))))
          ;; Then continue with the outer loop
          (recur (+ i 1) (.concat result [filled-row]))))))))

(print "Nested result:")
(print (generate-nested 3 4))