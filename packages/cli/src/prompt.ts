import { stdin as input } from "node:process"

/** True when stdin is an interactive terminal (safe to prompt). */
export function isInteractive(): boolean {
  return Boolean(input.isTTY) && process.env.CI !== "true" && process.env.AIMS_NO_INPUT !== "1"
}

/** Read all of stdin as UTF-8 text. */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8").trim()
}

/**
 * Resolve a required text prompt from args, `--stdin`, `-`, or a pipe.
 * Never prompts. Missing input exits via the provided fail helper.
 */
export async function resolvePrompt(
  parts: string[] | undefined,
  opts: { stdin?: boolean },
  fail: (message: string) => never,
  example: string,
): Promise<string> {
  const tokens = parts ?? []
  const wantsStdin = Boolean(opts.stdin) || (tokens.length === 1 && tokens[0] === "-")

  if (wantsStdin) {
    const text = await readStdin()
    if (!text) {
      fail(`No prompt on stdin.\n  ${example}`)
    }
    return text
  }

  if (tokens.length > 0) {
    return tokens.join(" ").trim()
  }

  if (!input.isTTY) {
    const text = await readStdin()
    if (text) return text
  }

  fail(`Prompt is required.\n  ${example}\n  echo "a red panda astronaut" | aims image --stdin --json`)
}
