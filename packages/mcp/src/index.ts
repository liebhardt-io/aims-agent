#!/usr/bin/env node
/**
 * AIMS MCP server (stdio).
 *
 * This binary speaks MCP over stdin/stdout. Use --help / --list-tools
 * for non-interactive discovery; do not run it as an interactive CLI.
 *
 *   claude mcp add aims -e AIMS_API_KEY=aims_xxx -- npx -y @ai-media-studio/mcp
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { PACKAGE_VERSION } from "./format.js"
import { createAimsServer } from "./server.js"
import { resolveBaseUrl } from "@ai-media-studio/core"

const HELP = `aims-mcp — AI Media Studio MCP server (stdio)

This process speaks the Model Context Protocol on stdin/stdout.
Do not run it interactively unless you are an MCP client.

Options:
  --help, -h       Show this help and exit
  --version, -v    Print version and exit
  --list-tools     Print tool names and descriptions as JSON and exit

Environment:
  AIMS_API_KEY     API key (or ~/.aims/config.json from \`aims login --key\`)
  AIMS_BASE_URL    API base URL (default https://app.ai-media-studio.com/api/v1;
                   AIMS_API_BASE_URL is accepted as an alias)

Examples:
  claude mcp add aims -e AIMS_API_KEY=aims_xxx -- npx -y @ai-media-studio/mcp
  AIMS_API_KEY=aims_xxx aims-mcp --list-tools
  AIMS_API_KEY=aims_xxx aims-mcp
`

function printHelp(): void {
  process.stdout.write(HELP)
}

function printVersion(): void {
  process.stdout.write(`${PACKAGE_VERSION}\n`)
}

/** List tools through the real server so the catalog can never drift from registration. */
async function printTools(): Promise<void> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const server = createAimsServer()
  const client = new Client({ name: "aims-mcp-list-tools", version: PACKAGE_VERSION })
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  const { tools } = await client.listTools()
  await client.close()
  const catalog = tools.map(({ name, description }) => ({ name, description }))
  process.stdout.write(JSON.stringify({ name: "aims", version: PACKAGE_VERSION, tools: catalog }, null, 2) + "\n")
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.includes("--help") || args.includes("-h")) {
    printHelp()
    return
  }
  if (args.includes("--version") || args.includes("-v")) {
    printVersion()
    return
  }
  if (args.includes("--list-tools")) {
    await printTools()
    return
  }
  if (args.length > 0) {
    process.stderr.write(
      `Unknown argument: ${args[0]}\n  aims-mcp --help\n  aims-mcp --list-tools\n`,
    )
    process.exit(2)
  }

  const server = createAimsServer()
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write(`aims-mcp ${PACKAGE_VERSION} ready (base: ${resolveBaseUrl()})\n`)
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${(err as Error)?.message ?? String(err)}\n`)
  process.exit(1)
})
