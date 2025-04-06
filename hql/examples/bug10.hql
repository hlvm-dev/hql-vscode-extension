(import lodash from "npm:lodash")

(defmacro capitalize-text (text)
  `(js-call lodash.capitalize ~text))

;; Define a macro that uses lodash's uppercase function
(defmacro uppercase-text (text)
  `(js-call _ "toUpper" ~text))


  (console.log (capitalize-text "defmacro-import npm working!")) ;; implmented  => O