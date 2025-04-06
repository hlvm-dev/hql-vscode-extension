;; Accept an array of strings
(fn process-names (names: [String]) (-> String)
  (. names join ", "))