;; Define a simple OS enum.
(enum OS
  (case macOS)
  (case iOS)
  (case linux)
)

;; A function that “installs” based on the OS.
(fn install (os: OS) (-> OS)
  (cond
    ((= os OS.macOS) (print "Installing on macOS"))
    ((= os OS.iOS)   (print "Installing on iOS"))
    ((= os OS.linux) (print "Installing on Linux"))
    (else            (print "Unsupported OS"))
  )
)

;; enum type inference
(install os: .macOS)
(install os: .iOS)
(install os: .linux)