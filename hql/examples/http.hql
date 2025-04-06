(import path from "https://deno.land/std@0.170.0/path/mod.ts")
(let joined-path (path.join "folder" "file.txt"))

(import file from "https://deno.land/std@0.170.0/fs/mod.ts")
(let exists (file.existsSync "example-dir"))

(print "hello")
(console.log exists)