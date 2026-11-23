import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import test from "node:test"

// Families AI Media Studio no longer offers or its provider no longer serves:
// RETIRED_FAMILIES in apps/app/lib/composer/catalog.ts and
// apps/app/lib/discontinued-models.ts in liebhardt-io/ai-media-studio. The API
// hides them from model discovery, so docs, skills and tool text must not
// name them.
const RETIRED = [
  /fal-ai\/veo3/,
  /sora-2/,
  /seedance-2\.5/,
  /seedance-2\.0\/fast/,
  /nano-banana-2(?!\.\d)/,
  /gpt-image-1\.5/,
  /openai\/gpt-image-2(?!\.\d)/,
  /seedream/,
  /kling-video\/v2\.6/,
  /kling-video\/v3\/standard/,
  /xai\/grok-imagine-video\/(text|image)-to-video/,
  /flux-pro\/kontext/,
]

test("docs, skills, CLI help and MCP text name only current models", () => {
  const root = new URL("../../../", import.meta.url)
  const files = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) => /\.(md|ts|mjs|json)$/.test(file) && file !== "pnpm-lock.yaml" && !file.endsWith("current-models.test.mjs"))
  assert.ok(files.length > 20, `only ${files.length} files found`)
  const hits = []
  for (const file of files) {
    const lines = readFileSync(new URL(file, root), "utf8").split("\n")
    lines.forEach((line, index) => {
      for (const pattern of RETIRED) if (pattern.test(line)) hits.push(`${file}:${index + 1} ${pattern}`)
    })
  }
  assert.deepEqual(hits, [])
})
