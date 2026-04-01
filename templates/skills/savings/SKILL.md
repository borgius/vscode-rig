---
name: savings
description: "Report rtk and jcodemunch token savings for the current session."
argument-hint: ""
user-invocable: true
---

# savings — Session Savings Report

Report token savings from rtk and jcodemunch usage during this session.

## Procedure

1. Run `rtk gain --format json` to get current total savings
2. Use the session cache to retrieve the baseline captured at session start
3. Compute the delta: current - baseline
4. Retrieve the rtk call count and jcodemunch query count from session cache
5. Print the formatted report using formatSavingsReport from src/session/metrics.ts

## Output Format

```
[rig] Session Savings
  rtk: 1.2M saved (42 calls, +340K this session)
  jcodemunch: 28 queries
```

If no savings this session:

```
[rig] Session Savings
  rtk: no token savings this session
```