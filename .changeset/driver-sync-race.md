---
"@henglosio/cli": patch
---

Driver: a workflow new to the driver synced with no packages (its folder was created without waiting), so compiling it said its board package wasn't installed; and one workflow failing to sync no longer stops the others. The driver answers a workflow sync once — its error, or whether every workflow synced — so the studio can show it.
