import assert from "node:assert/strict"
import test from "node:test"
import { readFile } from "node:fs/promises"

const read = async (path) => JSON.parse(await readFile(new URL(`../../../${path}`, import.meta.url), "utf8"))

test("every package and plugin manifest declares the same version", async () => {
  const { version } = await read("package.json")
  for (const path of ["packages/core/package.json", "packages/cli/package.json", "packages/mcp/package.json", ".claude-plugin/plugin.json"]) {
    assert.equal((await read(path)).version, version, path)
  }
  assert.equal((await read(".claude-plugin/marketplace.json")).plugins[0].version, version)
})
