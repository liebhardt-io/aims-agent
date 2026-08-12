export type PrintMode = "text" | "json" | "url"

export function resolvePrintMode(opts: {
  json?: boolean
  print?: string
}): PrintMode {
  if (opts.print === "url") return "url"
  if (opts.print === "json" || opts.json) return "json"
  if (opts.print && opts.print !== "text") {
    throw new Error(`--print must be text, json, or url (got "${opts.print}")`)
  }
  if (process.env.AIMS_OUTPUT === "json") return "json"
  return "text"
}

export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n")
}

/** Machine-useful key: value lines. Empty/undefined values are skipped. */
export function printFields(fields: Record<string, string | number | boolean | null | undefined>): void {
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue
    process.stdout.write(`${key}: ${value}\n`)
  }
}

export function progress(message: string, quiet: boolean): void {
  if (quiet) return
  process.stderr.write(`${message}\n`)
}
