# AGENTS.md

Follow Research → Plan → Implement and Analyze → Reuse → Validate → Integrate.
Read this file and inspect the relevant code before changing it. Local files and
the working tree are the source of truth. Prefer correctness and maintainability.
Do not add mock data, fake fallbacks, placeholder behavior, or invented APIs.
Use Context7 before version-sensitive dependency/API changes. Explain limitations.
Use GitHub MCP for remote metadata. Do not change remote state without approval.
All application-facing text is Persian and RTL; assistant responses are English.
Keep changes reviewable. Use Conventional Commits and summarize changes,
validation, risks, and impact before proposing a commit.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
