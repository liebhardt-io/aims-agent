#!/usr/bin/env node
/**
 * `aims` — command-line tool for AI Media Studio.
 *
 * Non-interactive first. Every input is a flag. Run `aims <command> --help`
 * for examples.
 */
import { Command } from "commander"
import * as readline from "node:readline/promises"
import { createRequire } from "node:module"
import { stdin as input, stdout as output } from "node:process"
import {
  AimsApiError,
  AimsClient,
  DEFAULT_BASE_URL,
  imageGenerationOutcome,
  LOGIN_EXAMPLE,
  redactApiKey,
  readImageFile,
  resolveMaxCredits,
  STILL_GENERATING_HINT,
  type ImageGenerateParams,
  type ModelInfo,
  type VideoGenerateParams,
  videoGenerationOutcome,
} from "@ai-media-studio/core"
import { configPath, readConfig, resolveApiKey, resolveBaseUrl, writeConfig } from "./config.js"
import { collect, parseIntOption, parsePositiveNumber, resolveOutputPath, downloadTo } from "./output.js"
import { die, handleError, requireApiKey, usage, USAGE_EXIT } from "./errors.js"
import { isInteractive, resolvePrompt } from "./prompt.js"
import { printFields, printJson, progress, resolvePrintMode, type PrintMode } from "./print.js"
import { webLogin } from "./web-login.js"

const { version: VERSION } = createRequire(import.meta.url)("../package.json") as { version: string }

interface GlobalOpts {
  key?: string
  baseUrl?: string
  json?: boolean
  print?: string
  quiet?: boolean
}

function makeClient(opts: GlobalOpts): AimsClient {
  const apiKey = requireApiKey(resolveApiKey(opts.key))
  return new AimsClient({ apiKey, baseUrl: resolveBaseUrl(opts.baseUrl) })
}

function modeOf(g: GlobalOpts): PrintMode {
  try {
    return resolvePrintMode(g)
  } catch (err) {
    usage((err as Error).message)
  }
}

async function promptTty(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output })
  try {
    return (await rl.question(question)).trim()
  } finally {
    rl.close()
  }
}

interface Downloads {
  saved: string[]
  download_errors: Array<{ url: string; error: string }>
}

async function saveDownloads(
  urls: string[],
  dest: string,
  fallbackExt: string,
): Promise<Downloads> {
  const downloads: Downloads = { saved: [], download_errors: [] }
  for (const [i, url] of urls.entries()) {
    try {
      const path = await resolveOutputPath(dest, url, i + 1, fallbackExt, urls.length > 1)
      await downloadTo(url, path)
      downloads.saved.push(path)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      downloads.download_errors.push({ url, error: message })
      process.stderr.write(`Download failed for ${url}: ${message}\nRetry the download from this URL without regenerating.\n`)
      process.exitCode = 1
    }
  }
  return downloads
}

function reportImageFailure(failed: number, pending: string[]): void {
  if (pending.length > 0) {
    process.stderr.write(`${pending.length} image(s) still generating: ${pending.join(", ")}\n${STILL_GENERATING_HINT}\n`)
  }
  if (failed > 0) {
    process.stderr.write(`${failed} image generation(s) failed. Completed results are included in the output.\n`)
  } else if (pending.length === 0) {
    process.stderr.write("Image generation returned no completed results.\n")
  }
  process.exitCode = 1
}

function maxCredits(opts: { maxCredits?: number }): number | undefined {
  try {
    return resolveMaxCredits(opts.maxCredits)
  } catch (error) {
    usage((error as Error).message)
  }
}

const program = new Command()

program
  .name("aims")
  .description("Generate images and videos with AI Media Studio from the command line.")
  .version(VERSION, "-v, --version")
  .option("--key <key>", "API key (overrides env and saved config)")
  .option("--base-url <url>", `API base URL (default ${DEFAULT_BASE_URL})`)
  .option("--json", "print JSON (same as --print json)", false)
  .option("--print <format>", "text | json | url  (url prints result URL(s) only)")
  .option("--quiet", "suppress progress on stderr", false)
  .showHelpAfterError(false)
  .exitOverride((error) => process.exit(error.exitCode === 0 ? 0 : USAGE_EXIT))
  .addHelpText(
    "after",
    `
Examples:
  aims login --key aims_xxx
  aims whoami --json
  aims models --type image --json
  aims image "a red panda astronaut, studio lighting" --aspect-ratio 16:9 --json
  echo "a red panda astronaut" | aims image --stdin --json
  aims video "drone shot over snowy mountains" --duration 6 --dry-run --json

Discovery:
  aims <command> --help
`,
  )

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------
program
  .command("login")
  .description("Log in through a browser, or save and validate an AIMS API key")
  .option("--key <key>", "API key to save (AIMS_API_KEY is used when no flag chooses another method)")
  .option("--web", "use browser login, even without an interactive terminal or with AIMS_API_KEY set")
  .option("--no-browser", "print the approval URL without opening a browser")
  .option("--paste", "paste an API key at an interactive prompt instead of browser login")
  .addHelpText(
    "after",
    `
Examples:
  aims login
  aims login --web --no-browser
  aims login --paste
  aims login --key aims_xxx
  AIMS_API_KEY=aims_xxx aims login
  aims login --key aims_xxx --json
`,
  )
  .action(async (opts: { key?: string; web?: boolean; browser?: boolean; paste?: boolean }, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const explicitKey = opts.key || g.key
    if (explicitKey && (opts.web || opts.paste)) usage("Choose either --key or --web/--paste.")
    if (opts.web && opts.paste) usage("Choose either --web or --paste.")
    // An explicit --web or --paste asks for that method, so AIMS_API_KEY does not override it.
    let key = explicitKey || (opts.web || opts.paste ? undefined : process.env.AIMS_API_KEY)
    let createdKeyName: string | undefined
    const baseUrl = resolveBaseUrl(g.baseUrl)
    if (!key) {
      if (opts.paste && !isInteractive()) usage(`--paste requires an interactive terminal.\n  ${LOGIN_EXAMPLE}`)
      if (!isInteractive() && !opts.web) {
        usage(`No API key specified.\n  ${LOGIN_EXAMPLE}\n  aims login --web --no-browser\n  AIMS_API_KEY=aims_xxx aims login`)
      }
      if (opts.paste) {
        key = await promptTty("Paste your AIMS API key (aims_...): ")
      } else {
        const created = await webLogin(baseUrl, opts.browser).catch(handleError)
        key = created.key
        createdKeyName = created.name
      }
    }
    if (!key) usage(`No API key provided.\n  ${LOGIN_EXAMPLE}`)

    let client: AimsClient
    try {
      client = new AimsClient({ apiKey: key, baseUrl })
    } catch (err) {
      handleError(err)
    }
    try {
      const status = await client.account()
      const path = writeConfig({
        apiKey: key,
        // Save the URL the key was checked against, so later calls do not send it to another host.
        baseUrl: baseUrl === DEFAULT_BASE_URL ? undefined : baseUrl,
      })
      const payload = {
        logged_in: true,
        workspace_id: status.workspace_id,
        credits_available: status.credits_available,
        config_path: path,
      }
      const mode = modeOf(g)
      if (mode === "json") printJson(payload)
      else printFields(payload)
    } catch (err) {
      if (createdKeyName) {
        process.stderr.write(
          `Browser approval created the API key "${createdKeyName}", but it could not be checked, so it was not saved.\n` +
            "Revoke it under Workspace Settings → API Keys, then run aims login again.\n",
        )
      }
      handleError(err)
    }
  })

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------
program
  .command("logout")
  .description("Remove the saved API key, and with --revoke also disable it on the server")
  .option("-y, --yes", "skip confirmation (default when stdin is not a TTY)", false)
  .option("--revoke", "revoke the saved key server-side before removing it", false)
  .addHelpText(
    "after",
    `
Examples:
  aims logout --yes
  aims logout --revoke --yes
  aims logout --json
`,
  )
  .action(async (opts: { yes?: boolean; revoke?: boolean }, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    if (isInteractive() && !opts.yes) {
      const answer = await promptTty(opts.revoke ? "Revoke and remove the saved API key? [y/N] " : "Remove the saved API key? [y/N] ")
      if (!/^y(es)?$/i.test(answer)) {
        die("Aborted.", 0)
      }
    }
    const existing = readConfig()
    let revoked = false
    if (opts.revoke) {
      if (!existing.apiKey) usage("No saved API key to revoke.")
      try {
        await new AimsClient({ apiKey: existing.apiKey, baseUrl: resolveBaseUrl(g.baseUrl) }).revokeCurrentKey()
        revoked = true
      } catch (err) {
        // A key that is already invalid needs no revocation; anything else keeps it saved.
        if (!(err instanceof AimsApiError && err.status === 401)) handleError(err)
      }
    }
    const path = writeConfig({ baseUrl: existing.baseUrl })
    const payload = { logged_out: true, revoked, config_path: path }
    if (modeOf(g) === "json") printJson(payload)
    else printFields(payload)
  })

// ---------------------------------------------------------------------------
// whoami / status
// ---------------------------------------------------------------------------
program
  .command("whoami")
  .alias("status")
  .description("Show workspace, credit balance, and scopes")
  .addHelpText(
    "after",
    `
Examples:
  aims whoami
  aims whoami --json
`,
  )
  .action(async (_opts, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const client = makeClient(g)
    try {
      const status = await client.account()
      const mode = modeOf(g)
      if (mode === "json") {
        printJson(status)
        return
      }
      printFields({
        workspace_id: status.workspace_id,
        credits_available: status.credits_available,
        scopes: status.scopes.join(", ") || "(none)",
      })
    } catch (err) {
      handleError(err)
    }
  })

// ---------------------------------------------------------------------------
// config
// ---------------------------------------------------------------------------
const configCmd = program.command("config").description("Inspect the local CLI config file")

configCmd
  .command("path")
  .description("Print the config file path")
  .addHelpText(
    "after",
    `
Examples:
  aims config path
`,
  )
  .action(() => {
    process.stdout.write(`${configPath()}\n`)
  })

configCmd
  .command("show")
  .description("Show saved config (API key redacted)")
  .addHelpText(
    "after",
    `
Examples:
  aims config show
  aims config show --json
`,
  )
  .action((_opts, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const saved = readConfig()
    const payload = {
      config_path: configPath(),
      api_key: saved.apiKey ? redactApiKey(saved.apiKey) : null,
      base_url: saved.baseUrl || null,
    }
    if (modeOf(g) === "json") printJson(payload)
    else printFields(payload)
  })

// ---------------------------------------------------------------------------
// models
// ---------------------------------------------------------------------------
function printModelsText(label: string, models: ModelInfo[], unit: string): void {
  process.stdout.write(`${label}\n`)
  if (!models.length) {
    process.stdout.write("  (none)\n")
    return
  }
  for (const m of models) {
    printFields({
      id: m.id,
      name: m.name,
      type: m.model_type,
      credit_cost: `${m.credit_cost} ${unit}`,
    })
    process.stdout.write("\n")
  }
}

program
  .command("models")
  .description("List available image and video models")
  .option("--type <type>", "filter: image or video")
  .addHelpText(
    "after",
    `
Examples:
  aims models
  aims models --type image --json
  aims models --type video --print url
`,
  )
  .action(async (opts: { type?: string }, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const type = opts.type === "image" || opts.type === "video" ? opts.type : undefined
    if (opts.type && !type) {
      usage("Invalid --type.\n  aims models --type image\n  aims models --type video")
    }
    const client = makeClient(g)
    try {
      const result = await client.listModels(type)
      const mode = modeOf(g)
      if (mode === "json") {
        printJson(result)
        return
      }
      const ids = [
        ...(type !== "video" ? result.image_models : []),
        ...(type !== "image" ? result.video_models : []),
      ].map((m) => m.id)
      if (mode === "url") {
        for (const id of ids) process.stdout.write(`${id}\n`)
        return
      }
      if (type !== "video") printModelsText("Image models", result.image_models, "credits/image")
      if (type !== "image") printModelsText("Video models", result.video_models, "credits/second")
    } catch (err) {
      handleError(err)
    }
  })

// ---------------------------------------------------------------------------
// upload
// ---------------------------------------------------------------------------
program
  .command("upload")
  .description("Upload a local source image to the API key's workspace (requires media:write)")
  .argument("<file>", "local image file, up to 20 MiB")
  .addHelpText(
    "after",
    `
Examples:
  aims upload ./photo.png --json
  aims upload ./photo.png --print url
  aims edit "make it a night scene" --image-url "$(aims upload ./photo.png --print url)" --json
`,
  )
  .action(async (path: string, _opts, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const mode = modeOf(g)
    const client = makeClient(g)
    try {
      const { file, filename } = await readImageFile(path)
      const result = await client.uploadImage(file, filename)
      if (mode === "json") printJson(result)
      else if (mode === "url") process.stdout.write(`${result.url}\n`)
      else printFields({ ...result })
    } catch (error) {
      handleError(error)
    }
  })

// ---------------------------------------------------------------------------
// image / edit
// ---------------------------------------------------------------------------
function printDryRun(g: GlobalOpts, path: string, body: ImageGenerateParams | VideoGenerateParams): void {
  if (modeOf(g) === "json") {
    printJson({ dry_run: true, method: "POST", path, body })
    return
  }
  printFields({ dry_run: true, method: "POST", path })
  printJson(body)
}

/** Options shared by `image` and `edit`; both call POST /images/generate. */
function imageOptions(command: Command, aspectRatioHelp: string): Command {
  return command
    .option("-m, --model <model>", "model id (default fal-ai/nano-banana-pro)")
    .option("-n, --n <count>", "number of images (1-8)", parseIntOption)
    .option("-a, --aspect-ratio <ratio>", aspectRatioHelp)
    .option("-r, --resolution <res>", "0.5K, 1K, 2K, 4K")
    .option("-s, --size <size>", "pixel size, e.g. 1024x1024 (OpenAI models)")
    .option("-f, --output-format <fmt>", "png, jpeg, webp")
    .option("-q, --quality <quality>", "low, medium, high, auto")
    .option("--style <slug>", "style preset slug")
    .option("--seed <seed>", "seed for deterministic output")
    .option("--safety-tolerance <level>", "1 (strictest) to 6 (Nano Banana models)")
    .option("--web-search", "let Nano Banana models search the web (costs extra)")
    .option("--make-public", "make the result publicly shareable", false)
    .option("--max-credits <credits>", "refuse, charging nothing, if the request costs more (default AIMS_MAX_CREDITS)", parsePositiveNumber)
    .option("-o, --output <path>", "download result(s) to a file or directory")
    .option("--stdin", "read prompt from stdin", false)
    .option("--dry-run", "print the request and exit without spending credits", false)
}

async function runImageGeneration(
  promptParts: string[],
  opts: Record<string, any>,
  command: Command,
  example: string,
  progressMessage: string,
): Promise<void> {
  const g = command.optsWithGlobals() as GlobalOpts
  const prompt = await resolvePrompt(promptParts, opts, usage, example)
  const params: ImageGenerateParams = {
    prompt,
    model: opts.model,
    n: opts.n,
    aspect_ratio: opts.aspectRatio,
    resolution: opts.resolution,
    size: opts.size,
    output_format: opts.outputFormat,
    quality: opts.quality,
    style_slug: opts.style,
    seed: opts.seed,
    image_urls: opts.imageUrl?.length ? opts.imageUrl : undefined,
    safety_tolerance: opts.safetyTolerance,
    enable_web_search: opts.webSearch,
    make_public: opts.makePublic || undefined,
    max_credits: maxCredits(opts),
  }
  if (opts.dryRun) {
    printDryRun(g, "/images/generate", params)
    return
  }
  const client = makeClient(g)
  try {
    const mode = modeOf(g)
    progress(progressMessage, Boolean(g.quiet) || mode !== "text")
    const outcome = imageGenerationOutcome(await client.generateImage(params))
    const result = outcome.result
    const urls = result.images.flatMap((im) => im.status === "completed" && im.url ? [im.url] : [])
    let downloads: Downloads = { saved: [], download_errors: [] }
    if (opts.output) {
      downloads = await saveDownloads(urls, opts.output, `.${opts.outputFormat || "png"}`)
    }
    if (mode === "json") {
      printJson({ ...result, ...downloads })
    } else if (mode === "url") {
      for (const url of urls) process.stdout.write(`${url}\n`)
    } else {
      for (const [i, img] of result.images.entries()) {
        printFields({
          index: i + 1,
          id: img.id,
          url: img.url,
          share_url: img.share_url,
          status: img.status,
          error: img.error,
        })
      }
      printFields({
        credits_used: result.credits_used,
        credits_remaining: result.credits_remaining,
        style_applied: result.style_applied,
        saved: downloads.saved.join(", ") || undefined,
      })
    }
    if (outcome.isError) reportImageFailure(outcome.failed, outcome.pending)
  } catch (err) {
    handleError(err)
  }
}

imageOptions(
  program
    .command("image")
    .description("Generate image(s) from a text prompt")
    .argument("[prompt...]", "image description (or pass --stdin / pipe)")
    .option("-i, --image-url <url>", "workspace image URL for editing (repeatable; use aims upload for local files)", collect, []),
  "e.g. 16:9, 1:1, 9:16",
)
  .addHelpText(
    "after",
    `
Examples:
  aims image "a red panda astronaut, studio lighting" --aspect-ratio 16:9 --json
  aims image "logo of a mountain, flat vector" --model google/nano-banana-2.1 --aspect-ratio 1:1 --output ./out
  echo "a red panda astronaut" | aims image --stdin --json
  aims image "a red panda astronaut" --dry-run --json
  aims image "a red panda astronaut" --print url
`,
  )
  .action((promptParts: string[], opts, command: Command) =>
    runImageGeneration(promptParts, opts, command, 'aims image "<prompt>" --aspect-ratio 16:9 --json', "Generating image(s)…"),
  )

imageOptions(
  program
    .command("edit")
    .description("Edit/transform existing image(s) with a text instruction")
    .argument("[prompt...]", "edit instruction (or pass --stdin / pipe)")
    .option("-i, --image-url <url>", "workspace source image URL (repeatable; use aims upload for local files)", collect, []),
  "defaults to auto to preserve proportions",
)
  .addHelpText(
    "after",
    `
Examples:
  source_url=$(aims upload ./photo.jpg --print url) && aims edit "make it a night scene with neon" --image-url "$source_url" --json
  aims edit "combine these into a collage" --image-url "$A_URL" --image-url "$B_URL" --output ./out
  aims edit "three lighting variations" --image-url "$SOURCE_URL" --n 3 --seed 42 --json
  echo "make it night" | aims edit --stdin --image-url "$SOURCE_URL" --json
`,
  )
  .action((promptParts: string[], opts, command: Command) => {
    if (!opts.imageUrl?.length) {
      usage(
        "At least one --image-url is required.\n  aims upload ./photo.jpg --print url\n  aims edit \"make it a night scene\" --image-url \"$SOURCE_URL\" --json",
      )
    }
    return runImageGeneration(promptParts, opts, command, 'aims edit "<instruction>" --image-url "$SOURCE_URL" --json', "Editing image(s)…")
  })

// ---------------------------------------------------------------------------
// media
// ---------------------------------------------------------------------------
program
  .command("media")
  .description("Show the status and URL of one generation by id (requires media:read)")
  .argument("<id>", "image or video id from a generation result, or media_id from an error")
  .option("-o, --output <path>", "download the result once it completed")
  .addHelpText(
    "after",
    `
Examples:
  aims media 3f0c2a8e-1b7d-4c55-9f0e-6a1b2c3d4e5f --json
  aims media 3f0c2a8e-1b7d-4c55-9f0e-6a1b2c3d4e5f --print url
  aims media 3f0c2a8e-1b7d-4c55-9f0e-6a1b2c3d4e5f --output ./out
`,
  )
  .action(async (id: string, opts: { output?: string }, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const mode = modeOf(g)
    const client = makeClient(g)
    try {
      const { media } = await client.getMedia(id)
      let downloads: Downloads = { saved: [], download_errors: [] }
      if (opts.output && media.status === "completed" && media.url) {
        downloads = await saveDownloads([media.url], opts.output, media.type.startsWith("video") ? ".mp4" : ".png")
      }
      if (mode === "json") printJson({ media, ...downloads })
      else if (mode === "url") {
        if (media.status === "completed" && media.url) process.stdout.write(`${media.url}\n`)
      } else printFields({ ...media, saved: downloads.saved.join(", ") || undefined })
      if (media.status === "generating") {
        process.stderr.write("Still generating. Check again later; do not generate it again.\n")
        process.exitCode = 1
      } else if (media.status !== "completed") {
        process.exitCode = 1
      }
    } catch (err) {
      handleError(err)
    }
  })

// ---------------------------------------------------------------------------
// video
// ---------------------------------------------------------------------------
program
  .command("video")
  .description("Generate a video from a text prompt")
  .argument("[prompt...]", "video description (or pass --stdin / pipe)")
  .option("-m, --model <model>", "model id (default fal-ai/kling-video/o3/pro/text-to-video)")
  .option("-d, --duration <seconds>", "requested duration in seconds", parseIntOption)
  .option("-a, --aspect-ratio <ratio>", "e.g. 16:9, 9:16")
  .option("--audio", "enable audio when supported", false)
  .option("-i, --image-url <url>", "source image for image-to-video")
  .option("--image-urls <url>", "reference image URL for reference-to-video (repeatable)", collect, [])
  .option("--first-frame-url <url>", "start frame for Kling and FLUX 3 Max image-to-video (same as --image-url)")
  .option("--last-frame-url <url>", "end frame, with --image-url, for Kling, Seedance 2.0 and FLUX 3 Max image-to-video")
  .option("--extend-video-url <url>", "source video URL for extend-video")
  .option("-r, --resolution <res>", "e.g. 720p, 1080p")
  .option("--negative-prompt <text>", "negative prompt when supported")
  .option("--seed <seed>", "seed for deterministic output when supported")
  .option("--make-public", "make the result publicly shareable", false)
  .option("--max-credits <credits>", "refuse, charging nothing, if the request costs more (default AIMS_MAX_CREDITS)", parsePositiveNumber)
  .option("-o, --output <path>", "download the result to a file or directory")
  .option("--stdin", "read prompt from stdin", false)
  .option("--dry-run", "print the request and exit without spending credits", false)
  .addHelpText(
    "after",
    `
Examples:
  aims video "drone shot over snowy mountains at sunrise" --duration 6 --json
  aims video "slow cinematic push-in" --model fal-ai/kling-video/o3/pro/image-to-video --image-url "$SOURCE_URL" --duration 5
  aims video "transition between frames" --model fal-ai/kling-video/o3/pro/image-to-video --image-url "$START_URL" --last-frame-url "$END_URL" --json
  echo "waves at sunset" | aims video --stdin --duration 6 --print url
  aims video "waves at sunset" --duration 6 --dry-run --json
`,
  )
  .action(async (promptParts: string[], opts, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const prompt = await resolvePrompt(
      promptParts,
      opts,
      usage,
      'aims video "<prompt>" --duration 6 --json',
    )
    const params: VideoGenerateParams = {
      prompt,
      model: opts.model,
      duration: opts.duration,
      aspect_ratio: opts.aspectRatio,
      audio: opts.audio || undefined,
      image_url: opts.imageUrl,
      image_urls: opts.imageUrls?.length ? opts.imageUrls : undefined,
      first_frame_url: opts.firstFrameUrl,
      last_frame_url: opts.lastFrameUrl,
      extend_video_url: opts.extendVideoUrl,
      resolution: opts.resolution,
      negative_prompt: opts.negativePrompt,
      seed: opts.seed,
      make_public: opts.makePublic || undefined,
      max_credits: maxCredits(opts),
    }
    if (opts.dryRun) {
      printDryRun(g, "/videos/generate", params)
      return
    }
    const client = makeClient(g)
    try {
      progress("Generating video… (this can take a few minutes)", Boolean(g.quiet) || modeOf(g) !== "text")
      const outcome = videoGenerationOutcome(await client.generateVideo(params))
      const result = outcome.result
      const mode = modeOf(g)
      let downloads: Downloads = { saved: [], download_errors: [] }
      if (opts.output && !outcome.isError && result.video.url) {
        downloads = await saveDownloads([result.video.url], opts.output, ".mp4")
      }
      if (mode === "json") printJson({ ...result, ...downloads })
      else if (mode === "url") {
        if (!outcome.isError && result.video.url) process.stdout.write(`${result.video.url}\n`)
      } else {
        const v = result.video
        printFields({
          id: v.id,
          url: v.url,
          share_url: v.share_url,
          status: v.status,
          model: v.model,
          duration: v.duration,
          aspect_ratio: v.aspect_ratio,
          audio: v.audio,
          error: v.error,
          credits_used: result.credits_used,
          credits_remaining: result.credits_remaining,
          saved: downloads.saved.join(", ") || undefined,
        })
      }
      if (outcome.isError) {
        process.stderr.write(`Video generation did not complete${result.video?.error ? `: ${result.video.error}` : "."}\n`)
        process.exitCode = 1
      }
    } catch (err) {
      handleError(err)
    }
  })

program.parseAsync(process.argv).catch(handleError)
