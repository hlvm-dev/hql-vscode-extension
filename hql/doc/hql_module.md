MODULE IMPORT & EXPORT

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; CURRENT STATE

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Today, our macros are defined with defmacro and auto-register globally.

;; For example, in a.hql we have:

(defmacro print (& args)

`(console.log ~@args))

(defmacro log (& args)

`(console.log "LOG:" ~@args))

(fn add (x y)

(+ x y))

;; Exports are done in a verbose, string-based manner:

(export "print" print) ;; Global macro; cannot be exported.

(export "log" log) ;; Global macro; cannot be exported.

(export "add" add)

;; As a result, macros like print and log are available everywhere,

;; which risks name collisions in larger codebases.

;;

;; For functions, we have to import modules as namespaces:

(import moduleA from "./a.hql") ;; New syntax with 'from' is now required

(moduleA.add 3 4) ;; => 7

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; FUTURE VISION

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; Our goal is to move toward a more modular system that:

;;

;; 1. Uses a concise, opinionated vector syntax for exports and imports.

;; - No string-based exports—only vector-based.

;; - Even single exports are written as vectors, e.g.:

;; (export [add])

;;

;; 2. ALWAYS requires 'from' in all imports to be consistent and reduce
cognitive load:

;; - For namespace imports:

;; (import module from "./some-module.hql")

;; - For named imports:

;; (import [print, log] from "./a.hql")

;; (import [print as print2, log] from "./a.hql")

;; - NO imports without 'from' will be allowed.

;;

;; 3. Maintains module boundaries to avoid global namespace pollution.

;; - Instead of relying on global defmacro for user-defined macros,

;; we plan to differentiate system-level macros (using defmacro) from

;; user-level modular macros (using a new form, e.g. "macro").

;;

;; - In our future design, user-level macros will not auto-register globally;

;; they must be explicitly exported and imported.

;;

;; 4. Provides a clear, minimal, and opinionated syntax that avoids ambiguity.

;;

;; Below is an example of what our new system might look like.

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; FUTURE EXAMPLE: a.hql (Module Definition)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; SYSTEM-LEVEL MACROS remain defined with defmacro (global)

(defmacro print (& args)

`(console.log ~@args))

(defmacro log (& args)

`(console.log "LOG:" ~@args))

;; user-level macro. it must be imported/exported to be used like other normal
module in contrast to defmacro (system global macro we have already)

(macro user-log (& args)

`(console.log "LOG:" ~@args))

;; USER-LEVEL MACROS and functions use our new, opinionated export syntax.

;; (Note: In the future, we plan to introduce a new macro form (e.g. "macro")

;; for user-defined macros that are modular. For now, assume functions and

;; other exportable symbols follow the same vector export style.)

(fn add (x y)

(+ x y))

;; Opinionated vector export (no strings, even if single export):

(export [add, user-log])

;; alternatively we can do

(export [add])

(export [user-log])

;; INCORRECT - even if single module, always use vector to be opinionated: ;;
(export add) => X

;; We do NOT export 'print' or 'log' here because they are system-level
(global).

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; FUTURE USAGE IN CONSUMER: main.hql

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; With our new design, you directly import selected symbols:

(import [print, log] from "./a.hql")

;; This brings the selected exports into the local scope.

(print "Hello from module a!") ;; Uses the imported 'print'

(log "Hello from module a!") ;; Uses the imported 'log'

;; Alternatively, you can use aliasing if you need to avoid collisions:

(import [print as print2, log, user-log as log2] from "./a.hql")

(print2 "Hello from module a, aliased!") ;; 'print2' now refers to 'print'

(log2 "hello user macro log") ;; user macro exported and used

;; For namespace imports (entire module):

(import moduleA from "./a.hql")

(moduleA.add 3 4) ;; => 7

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; SUMMARY & ROADMAP

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; CURRENT STATE:

;; - Macros are defined only with defmacro and auto-register globally.

;; - Exports use a verbose, string-based syntax, e.g.:

;; (export "print" print)

;; (export "log" log)

;; (export "add" add)

;; - Imports now enforce the use of 'from':

;; (import moduleA from "./a.hql")

;; - There is no mechanism to restrict macro registration to a module.

;; FUTURE VISION:

;; - Migrate to an opinionated vector export syntax for all exports.

;; Examples:

;; (export [add])

;; (export [print, log])

;; (No string-based export will be allowed.)

;;

;; - Enforce 'from' in all imports for consistency and clarity:

;; (import [print, log] from "./a.hql") // For named imports

;; (import moduleA from "./a.hql") // For namespace imports

;; (No imports without 'from' will be allowed.)

;;

;; - Introduce a new macro form (e.g., "macro") for user-level macros that are
modular.

;; These will NOT auto-register globally and must be explicitly exported.

;;

;; - Restructure modules so that imports are namespaced, reducing global
collisions and

;; making dependencies explicit.
