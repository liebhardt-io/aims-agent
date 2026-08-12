#!/usr/bin/env node
/**
 * AIMS MCP server (stdio).
 *
 * This binary speaks MCP over stdin/stdout. Use --help / --list-tools
 * for non-interactive discovery; do not run it as an interactive CLI.
 *
 *   claude mcp add aims -e AIMS_API_KEY=aims_xxx -- npx -y -p @ai-media-studio/mcp@latest aims-mcp
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { PACKAGE_VERSION, TOOL_CATALOG } from "./format.js"
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
  AIMS_BASE_URL    API base URL (default https://app.ai-media-studio.com/api/v1)

Examples:
  claude mcp add aims -e AIMS_API_KEY=aims_xxx -- npx -y -p @ai-media-studio/mcp@latest aims-mcp
  AIMS_API_KEY=aims_xxx aims-mcp --list-tools
  AIMS_API_KEY=aims_xxx aims-mcp
`

function printHelp(): void {
  process.stdout.write(HELP)
}

function printVersion(): void {
  process.stdout.write(`${PACKAGE_VERSION}\n`)
}

function printTools(): void {
  process.stdout.write(JSON.stringify({ name: "aims", version: PACKAGE_VERSION, tools: TOOL_CATALOG }, null, 2) + "\n")
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
    printTools()
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
