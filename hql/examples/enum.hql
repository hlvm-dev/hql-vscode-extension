;; HQL Enum Usage Patterns
;; This document demonstrates idiomatic ways to work with enums in HQL

;; --------------------------------------
;; 1. Simple Enums - no associated values
;; --------------------------------------
(enum Direction
  (case north)
  (case south)
  (case east)
  (case west)
)

;; Simple assignment
(let heading Direction.north)

;; Value equality
(if (= heading Direction.west)
  (print "Heading west!")
  (print "Not heading west"))

;; Pattern matching with cond
(cond
  ((= heading Direction.north) (print "Going north"))
  ((= heading Direction.south) (print "Going south"))
  ((= heading Direction.east) (print "Going east"))
  ((= heading Direction.west) (print "Going west"))
  (else (print "Unknown direction")))

;; ------------------------------
;; 2. Enums with Raw Values
;; ------------------------------
(enum HttpStatus : Int
  (case ok 200)
  (case created 201)
  (case badRequest 400)
  (case notFound 404)
  (case serverError 500)
)

;; Using raw values for comparison
(let statusCode HttpStatus.notFound)

;; Numeric comparisons work with raw values
(if (>= statusCode 400)
  (print "Error status code")
  (print "Success status code"))

;; ------------------------------
;; HQL Enum Implementation with Associated Values
;; ------------------------------
(enum Payment
  (case cash amount: Int)
  (case creditCard number: String expiry: String cvv: String)
  (case check accountNumber: String routingNumber: String)
)

;; Creating instances with associated values
(let payment1 (Payment.cash amount: 100))
(let payment2 (Payment.creditCard 
  number: "4111-1111-1111-1111"
  expiry: "12/25"
  cvv: "123"))

;; Using type testing
(if (js-call payment1 "is" "cash")
  (print "Cash payment of " (get (get payment1 "values") "amount"))
  (print "Not a cash payment"))

;; Fixed implementation that avoids variable declarations inside cond clauses
;; Instead, we'll use more direct expressions or separate the variable declarations
(fn processPayment (payment)
  ;; First, check the payment type
  (if (js-call payment "is" "cash")
    ;; Handle cash payment
    (do 
      (let amount (get (get payment "values") "amount"))
      (print "Processing cash payment of $" amount))
    
    ;; Handle other payment types
    (if (js-call payment "is" "creditCard")
      (do
        (let values (get payment "values"))
        (let cardNum (get values "number"))
        (let expiry (get values "expiry"))
        (print "Processing credit card " cardNum " expiring " expiry))
      
      ;; Check payment type
      (if (js-call payment "is" "check")
        (do
          (let values (get payment "values"))
          (print "Processing check from account " (get values "accountNumber")))
        
        ;; Default case
        (print "Unknown payment type")))))

;; Alternative implementation using direct expressions without variable declarations
(fn processPayment2 (payment)
  ;; Using a simpler approach without local variables
  (if (js-call payment "is" "cash")
    (print "Processing cash payment of $" (get (get payment "values") "amount"))
    
    (if (js-call payment "is" "creditCard")
      (print "Processing credit card " 
             (get (get payment "values") "number") 
             " expiring " 
             (get (get payment "values") "expiry"))
      
      (if (js-call payment "is" "check")
        (print "Processing check from account " 
               (get (get payment "values") "accountNumber"))
        
        (print "Unknown payment type")))))

;; Testing the functions
(processPayment payment1)
(processPayment payment2)


;; type inference

;; Define a simple OS enum
(enum OS
  (case macOS)
  (case iOS)
  (case linux)
)

;; With raw values
(enum StatusCode: Int
  (case ok 200)
  (case notFound 404)
  (case serverError 500)
)

;; A function that "installs" based on the OS
(fn install (os: OS) (-> String)
  (cond
    ((= os OS.macOS) "Installing on macOS")
    ((= os OS.iOS)   "Installing on iOS")
    ((= os OS.linux) "Installing on Linux")
    (else            "Unsupported OS")
  )
)

;; A function with dot notation in equality comparisons
(fn install2 (os: OS) (-> String)
  (cond
    ((= os .macOS) "Installing on macOS")
    ((= os .iOS)   "Installing on iOS")
    ((= os .linux) "Installing on Linux")
    (else          "Unsupported OS")
  )
)

;; A function demonstrating if statements with enum dot notation
(fn check-status (code: StatusCode) (-> String)
  (if (= code .ok)
    "Everything is ok!"
    (if (= code .notFound)
      "Not found!"
      "Server error!"
    )
  )
)

;; A function demonstrating when with enum dot notation
(fn process-status (code: StatusCode) (-> String)
  (when (= code .serverError)
    (print "Critical error detected!")
    "Server error needs attention"
  )
)

;; Test reversed comparison order
(fn reverse-check (code: StatusCode) (-> String)
  (if (= .ok code)
    "Status is ok!"
    "Status is not ok!"
  )
)

;; Examples of calling with enum type inference in named parameters
(let mac-result (install os: .macOS))
(let ios-result (install os: .iOS))
(let linux-result (install os: .linux))

;; Using explicit enum references also works
(let mac-result2 (install os: OS.macOS))

;; Status code check
(let status (check-status code: .ok))
(let error-status (check-status code: .serverError))

;; Test the second install function with dot notation
(let mac-result3 (install2 os: .macOS))

;; Return the status to test
(print status)
(print mac-result3)