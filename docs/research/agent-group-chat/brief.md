# Research Brief: agent group chat — how agents communicate, context management, cache stability

**Date:** 2026-10-26
**Question:** How should a multi-agent group chat be designed so that agents coordinate effectively, context is managed efficiently (cache-stable, bounded, shared), and the design is demonstrably better than native `agent://` point-to-point messaging and IRC-style chat?

**Decision:** What concrete changes (if any) should omp-agent-chatroom make to its message format, context injection, cache stability, and agent-facing surface to be the best possible coordination layer for LLM agents?

**Answer form:** Ranked list of concrete improvements with evidence, plus a "do not change" list and a justification narrative for the README.

**Scope:**
- In: agent-to-agent communication patterns in group settings; context management (cache stability, context windows, prompt caching); message format design; group chat UX for LLMs; cache-friendly context injection; comparison with IRC/Slack/Discord-style chat for agents.
- Out: the room's internal protocol mechanics (already researched); the attention governor (already built and tested).

**Depth mode:** deep (5-8 workers, 2 follow-up rounds, 25+ sources).

**Assumptions:**
- The plugin runs inside a single omp process; all agents share one context budget per agent.
- Prompt caching (Anthropic, OpenAI) is a real cost factor; cache-stable prefixes matter.
- The room's chat log is the shared context; each agent reads it via `room{op:"read"}` or the digest.
