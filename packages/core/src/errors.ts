import { API_KEY_HELP, LOGIN_EXAMPLE } from "./config.js"
import type { AimsApiError } from "./client.js"
import { STILL_GENERATING_HINT } from "./results.js"

export const BILLING_URL = "https://app.ai-media-studio.com/billing"

/** Next-step text for an API error, from its status and the code or state in its body. */
export function apiErrorHint(error: Pick<AimsApiError, "status" | "code" | "stillGenerating">): string {
  if (error.stillGenerating) return STILL_GENERATING_HINT
  if (error.code === "CLIENT_TIMEOUT") {
    return "Do not repeat a generation blindly: check the workspace library or credits_remaining first."
  }
  if (error.code === "PAID_PLAN_REQUIRED") {
    return `Generating needs a paid plan, even with credits left. Choose one at ${BILLING_URL}; retrying will not help.`
  }
  if (error.code === "MAX_CREDITS_EXCEEDED") {
    return "Nothing was charged. Raise max_credits (--max-credits or AIMS_MAX_CREDITS) or choose a cheaper model, resolution or duration."
  }
  if (error.status === 401) {
    return `${API_KEY_HELP}\n  ${LOGIN_EXAMPLE}\n  export AIMS_API_KEY=<aims_key>`
  }
  if (error.status === 402) {
    return `The workspace does not have enough credits for this request. Check the balance with aims whoami --json or get_account, or add credits at ${BILLING_URL}.`
  }
  if (error.status === 403) {
    return "API key is missing the required scope. Generation needs image:generate or video:generate; uploads need media:write; aims media and get_media need media:read."
  }
  if (error.status === 410) {
    return "This model is discontinued. Pick a current one with aims models or list_models."
  }
  if (error.status === 429) {
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
