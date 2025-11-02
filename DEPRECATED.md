# ⚠️ THIS REPOSITORY HAS BEEN CONSOLIDATED

**LexBrain has been merged with LexMap into the unified [`lex`](https://github.com/Guffawaffle/lex) repository.**

## What Happened?

LexBrain (episodic memory) and LexMap (policy enforcement) have been combined into a single coherent system with proper integration contracts.

**New structure:**
```
lex/
  memory/    # LexBrain functionality (Frames, recall, storage)
  policy/    # LexMap functionality (scanners, checkers, policy spec)
  shared/    # Integration spine (atlas/, module_ids/, types/, cli/)
```

## For Contributors

- **All new work** should happen in [`Guffawaffle/lex`](https://github.com/Guffawaffle/lex)
- **Open PRs** have been tracked in [lex#1](https://github.com/Guffawaffle/lex/issues/1)
- This repo is now **read-only** for historical reference

## Why Consolidate?

Managing two separate repos was causing cross-repo coordination overhead. The unified `lex` repo has:
- Clear subsystem boundaries (memory/ vs policy/)
- Explicit integration contracts (shared/ spine)
- "One product" identity while preserving conceptual clarity

See the [lex README](https://github.com/Guffawaffle/lex#readme) for the full story.

---

*Consolidation completed: November 2, 2025*
