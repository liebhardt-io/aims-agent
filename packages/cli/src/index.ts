#!/usr/bin/env node
/**
 * `aims` — command-line tool for AI Media Studio.
 *
 * Non-interactive first. Every input is a flag. Run `aims <command> --help`
 * for examples.
 */
import { Command } from "commander"
import * as readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import {
  AimsClient,
  DEFAULT_BASE_URL,
  LOGIN_EXAMPLE,
  type ImageGenerateParams,
  type ModelInfo,
  type VideoGenerateParams,
} from "@ai-media-studio/core"
import { configPath, readConfig, resolveApiKey, resolveBaseUrl, writeConfig } from "./config.js"
import { collect, parseIntOption, resolveOutputPath, downloadTo } from "./output.js"
import { die, handleError, requireApiKey, usage } from "./errors.js"
import { isInteractive, resolvePrompt } from "./prompt.js"
import { printFields, printJson, progress, resolvePrintMode, type PrintMode } from "./print.js"

const VERSION = "0.2.0"

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

async function saveDownloads(
  urls: string[],
  dest: string,
  fallbackExt: string,
): Promise<string[]> {
  const saved: string[] = []
  for (const [i, url] of urls.entries()) {
    const path = resolveOutputPath(dest, url, i + 1, fallbackExt, urls.length > 1)
    await downloadTo(url, path)
    saved.push(path)
  }
  return saved
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
  .description("Save and validate an AIMS API key (idempotent)")
  .option("--key <key>", "API key to save (preferred; skips the prompt)")
  .addHelpText(
    "after",
    `
Examples:
  aims login --key aims_xxx
  AIMS_API_KEY=aims_xxx aims login
  aims login --key aims_xxx --json
`,
  )
  .action(async (opts: { key?: string }, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    let key = opts.key || g.key || process.env.AIMS_API_KEY
    if (!key) {
      if (!isInteractive()) {
        usage(`No API key specified.\n  ${LOGIN_EXAMPLE}\n  AIMS_API_KEY=aims_xxx aims login`)
      }
      key = await promptTty("Paste your AIMS API key (aims_...): ")
    }
    if (!key) usage(`No API key provided.\n  ${LOGIN_EXAMPLE}`)

    const client = new AimsClient({ apiKey: key, baseUrl: resolveBaseUrl(g.baseUrl) })
    try {
      const status = await client.account()
      const existing = readConfig()
      const path = writeConfig({
        apiKey: key,
        baseUrl: g.baseUrl || existing.baseUrl,
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
      handleError(err)
    }
  })

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------
program
  .command("logout")
  .description("Remove the saved API key")
  .option("-y, --yes", "skip confirmation (default when stdin is not a TTY)", false)
  .addHelpText(
    "after",
    `
Examples:
  aims logout --yes
  aims logout --json
`,
  )
  .action(async (opts: { yes?: boolean }, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    if (isInteractive() && !opts.yes) {
      const answer = await promptTty("Remove the saved API key? [y/N] ")
      if (!/^y(es)?$/i.test(answer)) {
        die("Aborted.", 0)
      }
    }
    const existing = readConfig()
    const path = writeConfig({ baseUrl: existing.baseUrl })
    const payload = { logged_out: true, config_path: path }
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
      api_key: saved.apiKey ? `${saved.apiKey.slice(0, 8)}…` : null,
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
// image
// ---------------------------------------------------------------------------
program
  .command("image")
  .description("Generate image(s) from a text prompt")
  .argument("[prompt...]", "image description (or pass --stdin / pipe)")
  .option("-m, --model <model>", "model id (e.g. fal-ai/nano-banana-2)")
  .option("-n, --n <count>", "number of images (1-8)", parseIntOption)
  .option("-a, --aspect-ratio <ratio>", "e.g. 16:9, 1:1, 9:16")
  .option("-r, --resolution <res>", "0.5K, 1K, 2K, 4K")
  .option("-s, --size <size>", "pixel size, e.g. 1024x1024 (OpenAI models)")
  .option("-f, --output-format <fmt>", "png, jpeg, webp")
  .option("-q, --quality <quality>", "low, medium, high, auto")
  .option("--style <slug>", "style preset slug")
  .option("--seed <seed>", "seed for deterministic output")
  .option("-i, --image-url <url>", "reference image URL for editing (repeatable)", collect, [])
  .option("--make-public", "make the result publicly shareable", false)
  .option("-o, --output <path>", "download result(s) to a file or directory")
  .option("--stdin", "read prompt from stdin", false)
  .option("--dry-run", "print the request and exit without spending credits", false)
  .addHelpText(
    "after",
    `
Examples:
  aims image "a red panda astronaut, studio lighting" --aspect-ratio 16:9 --json
  aims image "logo of a mountain, flat vector" --model fal-ai/nano-banana-2 --aspect-ratio 1:1 --output ./out
  echo "a red panda astronaut" | aims image --stdin --json
  aims image "a red panda astronaut" --dry-run --json
  aims image "a red panda astronaut" --print url
`,
  )
  .action(async (promptParts: string[], opts, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const prompt = await resolvePrompt(
      promptParts,
      opts,
      usage,
      'aims image "<prompt>" --aspect-ratio 16:9 --json',
    )
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
      make_public: opts.makePublic || undefined,
    }
    if (opts.dryRun) {
      const payload = { dry_run: true, method: "POST", path: "/images/generate", body: params }
      if (modeOf(g) === "json") printJson(payload)
      else {
        printFields({ dry_run: true, method: "POST", path: "/images/generate" })
        printJson(params)
      }
      return
    }
    const client = makeClient(g)
    try {
      progress("Generating image(s)…", Boolean(g.quiet) || modeOf(g) !== "text")
      const result = await client.generateImage(params)
      const urls = result.images.filter((im) => im.url).map((im) => im.url as string)
      const mode = modeOf(g)
      let saved: string[] = []
      if (opts.output) {
        const ext = `.${(opts.outputFormat as string) || "png"}`
        saved = await saveDownloads(urls, opts.output, ext)
        if (!saved.length) process.stderr.write("No completed images to download.\n")
      }
      if (mode === "json") {
        printJson({ ...result, saved })
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
          saved: saved.join(", ") || undefined,
        })
      }
    } catch (err) {
      handleError(err)
    }
  })

// ---------------------------------------------------------------------------
// edit (image-to-image)
// ---------------------------------------------------------------------------
program
  .command("edit")
  .description("Edit/transform existing image(s) with a text instruction")
  .argument("[prompt...]", "edit instruction (or pass --stdin / pipe)")
  .option("-i, --image-url <url>", "source image URL (repeatable)", collect, [])
  .option("-m, --model <model>", "model id")
  .option("-a, --aspect-ratio <ratio>", "defaults to auto to preserve proportions")
  .option("-r, --resolution <res>", "0.5K, 1K, 2K, 4K")
  .option("-f, --output-format <fmt>", "png, jpeg, webp")
  .option("--make-public", "make the result publicly shareable", false)
  .option("-o, --output <path>", "download result(s) to a file or directory")
  .option("--stdin", "read prompt from stdin", false)
  .option("--dry-run", "print the request and exit without spending credits", false)
  .addHelpText(
    "after",
    `
Examples:
  aims edit "make it a night scene with neon" --image-url https://example.com/photo.jpg --json
  aims edit "combine these into a collage" --image-url https://example.com/a.jpg --image-url https://example.com/b.jpg --output ./out
  echo "make it night" | aims edit --stdin --image-url https://example.com/photo.jpg --json
`,
  )
  .action(async (promptParts: string[], opts, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    if (!opts.imageUrl?.length) {
      usage(
        "At least one --image-url is required.\n  aims edit \"make it a night scene\" --image-url https://example.com/photo.jpg --json",
      )
    }
    const prompt = await resolvePrompt(
      promptParts,
      opts,
      usage,
      'aims edit "<instruction>" --image-url https://example.com/photo.jpg --json',
    )
    const params: ImageGenerateParams = {
      prompt,
      image_urls: opts.imageUrl,
      model: opts.model,
      aspect_ratio: opts.aspectRatio,
      resolution: opts.resolution,
      output_format: opts.outputFormat,
      make_public: opts.makePublic || undefined,
    }
    if (opts.dryRun) {
      const payload = { dry_run: true, method: "POST", path: "/images/generate", body: params }
      if (modeOf(g) === "json") printJson(payload)
      else {
        printFields({ dry_run: true, method: "POST", path: "/images/generate" })
        printJson(params)
      }
      return
    }
    const client = makeClient(g)
    try {
      progress("Editing image(s)…", Boolean(g.quiet) || modeOf(g) !== "text")
      const result = await client.generateImage(params)
      const urls = result.images.filter((im) => im.url).map((im) => im.url as string)
      const mode = modeOf(g)
      let saved: string[] = []
      if (opts.output) {
        const ext = `.${(opts.outputFormat as string) || "png"}`
        saved = await saveDownloads(urls, opts.output, ext)
      }
      if (mode === "json") printJson({ ...result, saved })
      else if (mode === "url") {
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
          saved: saved.join(", ") || undefined,
        })
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
  .option("-m, --model <model>", "model id (e.g. fal-ai/veo3.1/fast)")
  .option("-d, --duration <seconds>", "requested duration in seconds", parseIntOption)
  .option("-a, --aspect-ratio <ratio>", "e.g. 16:9, 9:16")
  .option("--audio", "enable audio when supported", false)
  .option("-i, --image-url <url>", "source image for image-to-video")
  .option("-r, --resolution <res>", "e.g. 720p, 1080p")
  .option("--negative-prompt <text>", "negative prompt when supported")
  .option("--make-public", "make the result publicly shareable", false)
  .option("-o, --output <path>", "download the result to a file or directory")
  .option("--stdin", "read prompt from stdin", false)
  .option("--dry-run", "print the request and exit without spending credits", false)
  .addHelpText(
    "after",
    `
Examples:
  aims video "drone shot over snowy mountains at sunrise" --duration 6 --json
  aims video "slow cinematic push-in" --model fal-ai/veo3.1/fast/image-to-video --image-url https://example.com/frame.png --duration 5
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
      resolution: opts.resolution,
      negative_prompt: opts.negativePrompt,
      make_public: opts.makePublic || undefined,
    }
    if (opts.dryRun) {
      const payload = { dry_run: true, method: "POST", path: "/videos/generate", body: params }
      if (modeOf(g) === "json") printJson(payload)
      else {
        printFields({ dry_run: true, method: "POST", path: "/videos/generate" })
        printJson(params)
      }
      return
    }
    const client = makeClient(g)
    try {
      progress("Generating video… (this can take a few minutes)", Boolean(g.quiet) || modeOf(g) !== "text")
      const result = await client.generateVideo(params)
      const mode = modeOf(g)
      let saved: string[] = []
      if (opts.output && result.video.url) {
        saved = await saveDownloads([result.video.url], opts.output, ".mp4")
      }
      if (mode === "json") printJson({ ...result, saved })
      else if (mode === "url") {
        if (result.video.url) process.stdout.write(`${result.video.url}\n`)
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
          saved: saved.join(", ") || undefined,
        })
      }
    } catch (err) {
      handleError(err)
    }
  })

program.parseAsync(process.argv).catch(handleError)
