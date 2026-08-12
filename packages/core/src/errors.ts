import { API_KEY_HELP, LOGIN_EXAMPLE } from "./config.js"

/** Extra next-step text for common AIMS API status codes. */
export function apiErrorHint(status: number): string {
  if (status === 401) {
    return `${API_KEY_HELP}\n  ${LOGIN_EXAMPLE}\n  export AIMS_API_KEY=<aims_key>`
  }
  if (status === 402) {
    return "Workspace is out of credits. Check balance: aims whoami --json"
  }
  if (status === 403) {
    return "API key is missing the required scope. Create a key with image:generate and/or video:generate."
  }
  if (status === 429) {
    return "Rate limited. Wait and retry; do not loop immediately."
  }
  return ""
}

export function missingApiKeyMessage(): string {
  return [
    "No API key found.",
    `  ${LOGIN_EXAMPLE}`,
    "  export AIMS_API_KEY=<aims_key>",
    "  aims image \"…\" --key <aims_key> --json",
    API_KEY_HELP,
  ].join("\n")
}
