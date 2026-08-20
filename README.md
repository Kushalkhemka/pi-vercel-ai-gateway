# Pi Vercel AI Gateway

A production-oriented [Pi coding agent](https://github.com/earendil-works/pi)
package for Vercel AI Gateway with explicit provider selection, native
streaming, dynamic model discovery, prompt-cache accounting, and accurate cost
metadata.

Pi normally exposes a model such as `deepseek/deepseek-v4-flash-0731` as one
choice. This package exposes every tool-capable inference endpoint separately:

```text
deepseek/deepseek-v4-flash-0731@runware
deepseek/deepseek-v4-flash-0731@fireworks
anthropic/claude-opus-4.6@anthropic
anthropic/claude-opus-4.6@bedrock
```

The suffix is sent through `providerOptions.gateway.only`, so the selected
provider is a hard allowlist. If it is unavailable, the request fails instead
of silently moving to another provider.

## Features

- Explicit `model@provider` choices with no automatic provider fallback
- Live discovery from Vercel's model and endpoint catalogs
- Incremental text, reasoning, and tool-call streaming
- Full Pi conversation and image-input forwarding
- Automatic Gateway prompt caching
- Separate uncached, cache-read, and cache-write token accounting
- Provider-specific base and tiered pricing
- Exact per-generation Gateway cost when Vercel returns it
- 24-hour persistent model-catalog cache with stale-cache recovery
- Safe override of Pi's built-in `vercel-ai-gateway` provider

## Requirements

- Node.js 20 or newer
- Pi coding agent 0.82.1 or newer
- A [Vercel AI Gateway API key](https://vercel.com/ai-gateway)

## Installation

Install from the Pi package catalog/npm:

```bash
pi install npm:pi-vercel-ai-gateway
```

Alternatively, install the latest source directly from GitHub:

```bash
pi install git:github.com/Kushalkhemka/pi-vercel-ai-gateway
```

Then configure it in Pi:

1. Run `/login`.
2. Select `vercel-ai-gateway`.
3. Paste your Vercel AI Gateway API key.
4. Open `/model` and search by model or provider, for example `@runware`.

The API key is stored by Pi's credential store. It is never written into this
package.

## Usage

Interactive selection is available through `/model`. For non-interactive use:

```bash
pi --provider vercel-ai-gateway \
  --model 'deepseek/deepseek-v4-flash-0731@runware'
```

The package lists only language-model endpoints that advertise tool support,
because unsupported tool calls would make the models unreliable for coding
agent workloads.

## How it works

### Model and provider discovery

The extension reads Vercel's public model catalog, queries each model's
provider endpoints with bounded concurrency, and builds a distinct Pi model
entry for every tool-capable endpoint. Context windows, maximum output tokens,
image support, and prices come from endpoint-specific metadata.

The generated catalog is cached for 24 hours. A warm Pi startup reads the local
cache; after expiry, the package refreshes it through Pi's model registry. If
Vercel is temporarily unavailable, a valid stale catalog remains usable.

### Streaming and context

The implementation bridges the Vercel AI SDK stream into Pi's native assistant
event stream. Text, reasoning, tool inputs, tool calls, finish reasons, aborts,
usage, and generation IDs are preserved. The extension forwards the complete
context supplied by Pi and does not impose an additional truncation layer.

Pi remains responsible for its normal context-window management and session
compaction.

### Prompt caching and costs

Gateway prompt caching is enabled with `caching: "auto"`. Usage is mapped into
Pi's separate input, cache-read, and cache-write counters, allowing Pi to
calculate meaningful session cache behavior.

Base and tiered prices for input, output, cache reads, and cache writes are read
from Vercel's endpoint catalog. Catalog prices support estimates before a
request; Vercel's returned Gateway charge is used as the final total when
available.

In a local repeated-prefix integration test, a 42.4K-token second turn reused
42,395 cached tokens (about a 99.95% prompt-cache hit rate). Actual results vary
by model, provider, prefix stability, minimum cacheable length, and cache TTL.

## Provider override

This package intentionally registers as `vercel-ai-gateway`, replacing Pi's
built-in provider while the extension is loaded. This keeps the familiar
provider name and `/login` entry while adding explicit endpoint choices.

Removing the package restores Pi's built-in implementation:

```bash
pi remove npm:pi-vercel-ai-gateway
```

If you installed the GitHub source, remove it with
`pi remove git:github.com/Kushalkhemka/pi-vercel-ai-gateway` instead.

## Development

```bash
git clone https://github.com/Kushalkhemka/pi-vercel-ai-gateway.git
cd pi-vercel-ai-gateway
npm install
npm run check
npm test
pi install "$PWD"
```

The source contains no API keys. Before publishing changes, run:

```bash
npm run check
npm test
npm audit --omit=dev
npm pack --dry-run
```

## Design constraints

- Provider selection is intentionally strict; availability is traded for
  predictable routing.
- The first catalog discovery requires one model-list request plus endpoint
  requests for supported language models and can take several seconds.
- Provider capabilities and prices can change. The 24-hour refresh avoids
  hard-coding a stale catalog into the package.
- Only endpoint features represented by Pi and the Vercel AI SDK are bridged.

## License

[MIT](LICENSE)

## References

- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway)
- [Models and providers](https://vercel.com/docs/ai-gateway/models-and-providers)
- [Provider routing options](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options)
- [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
