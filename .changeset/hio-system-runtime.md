---
"@henglosio/hio-system": major
---

The platform is the runtime only: its manifest declares it (`runtime.packages`, `runtime.files`) and it has no build script any more — `hio` builds it with the board's mpy-cross. Needs `@henglosio/cli` 1.7 or later; boards depend on `^2.0.0`.
