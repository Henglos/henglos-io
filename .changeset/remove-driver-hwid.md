---
"@henglosio/cli": minor
---

Driver: pairing no longer reads the machine's hardware id — it was sent to the hosting and never checked — and the native `native-machine-id` dependency is gone (no more "Try run as admin" on `hio driver login`). Pairing needs a hosting that doesn't ask for it (this release on); one already paired keeps working with any.
