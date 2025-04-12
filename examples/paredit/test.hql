(defn test-function [arg1 arg2]
  (let [result (+ arg1 arg2)]
    (println "The result is: " result)
    [result (- result 10) (* result 2)]))

(map inc [1 2 3 4 5])

{:name "Test"
 :values [10 20 30]
 :nested {:data "here"}} 