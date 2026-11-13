# Changelog

## 0.3.0 - 2026-11-13

- Tool text refreshed to the live voice service contract (route integrity pass): both price buckets per tool, base-voices-only on standard, controlled, OpenAI and batch tools (personas only on the persona tool), batch response shape, and the charging rule (charged only for a 200 with audio; refusals answer 400 or 502 with charged:false).
- `generate_openai_compatible_voice` accepts an optional `lang` (the service accepts it and requires it for non-Latin text).
- Tools no longer force `lang: "en"` when none is given; the service defaults Latin-script text to English and now refuses non-Latin text without `lang` (uncharged), which the forced default made impossible to fix. Batch default is voice F2 only.
- Errors now carry the service's HTTP status and `charged` flag (guard `httpError`) instead of a truncated string.

## 0.2.7

- Dependencies: @x402/core + @x402/evm 2.11.0 → 2.29.0 (drops the transitive vulnerable zod); zod 3 â 4.6.7 (GHSA-mrhx-c7xc-m3w5); lockfile refresh resolving the open npm advisories (zod via @x402/core, body-parser, fast-uri, qs, ip-address, @hono/node-server as applicable). No behavior change.

## 0.2.6 — 2026-10-31
- Price copy: every route now $0.005 minimum (fleet pricing floor); no behaviour change, the live 402 still sets the amount.

## 0.1.2

- Added MCP-side voice, language, audio format, speed, quality, item-count, and character-limit validation so invalid paid calls are rejected before x402 payment.
- Matched server long-route behavior: 1-500 chars use short endpoints, 501-2000 chars use long endpoints, and over-limit requests fail locally.
- Added total batch character validation for `generate_batch_voices`.

## 0.1.1

- Renamed MCP tools for clearer agent routing and Glama discovery.
- Expanded tool descriptions with stronger intent, use cases, pricing, and control details.

## 0.1.0

- Initial x402 Voice MCP release.
- Added free voice discovery and paid standard, pro, persona, OpenAI-shaped, and batch speech tools.
- Added Glama registry metadata and Docker build files.
