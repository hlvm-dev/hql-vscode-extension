(let numbers [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
(let chunked-numbers (chunk-array numbers 3))
(print "Numbers chunked into groups of 3:" chunked-numbers)