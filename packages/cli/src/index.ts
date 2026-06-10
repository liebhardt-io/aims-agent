#!/usr/bin/env node
/**
 * `aims` — command-line tool for AI Media Studio.
 *
 * Quick start:
 *   npm install -g @ai-media-studio/cli
 *   aims login                      # paste your aims_ API key
 *   aims image "a red panda astronaut, studio lighting" --output ./out
 *   aims video "a drone shot over snowy mountains at sunrise" --duration 6
 *   aims models --type image
 */
import { Command } from "commander"
import * as readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { AimsApiError, AimsClient, DEFAULT_BASE_URL } from "@ai-media-studio/core"
import type {
  ImageGenerateParams,
  ModelInfo,
  VideoGenerateParams,
} from "@ai-media-studio/core"
import {
  configPath,
  readConfig,
  resolveApiKey,
  resolveBaseUrl,
  writeConfig,
} from "./config.js"
import {
  collect,
  parseIntOption,
  resolveOutputPath,
  downloadTo,
} from "./output.js"

const VERSION = "0.1.0"
const KEYS_HELP =
  "Create an API key in AI Media Studio → Workspace Settings → API Keys."

interface GlobalOpts {
  key?: string
  baseUrl?: string
  json?: boolean
}

function die(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function handleError(err: unknown): never {
  if (err instanceof AimsApiError) {
    let hint = ""
    if (err.status === 401) hint = `\n${KEYS_HELP} Then run \`aims login\`.`
    if (err.status === 402) hint = "\nYour workspace is out of credits."
    if (err.status === 403) hint = "\nYour API key is missing the required scope for this action."
    die(`AIMS API error (${err.status}): ${err.message}${hint}`)
  }
  die(`Error: ${(err as Error)?.message ?? String(err)}`)
}

function makeClient(opts: GlobalOpts): AimsClient {
  const apiKey = resolveApiKey(opts.key)
  if (!apiKey) {
    die(
      `No API key found. Run \`aims login\`, set AIMS_API_KEY, or pass --key.\n${KEYS_HELP}`,
    )
  }
  return new AimsClient({ apiKey, baseUrl: resolveBaseUrl(opts.baseUrl) })
}

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output })
  try {
    const answer = await rl.question(question)
    return answer.trim()
  } finally {
    rl.close()
  }
}

const program = new Command()

program
  .name("aims")
  .description(
    "Generate images and videos with AI Media Studio from the command line.",
  )
  .version(VERSION, "-v, --version")
  .option("--key <key>", "API key (overrides env and saved config)")
  .option("--base-url <url>", `API base URL (default ${DEFAULT_BASE_URL})`)
  .option("--json", "output raw JSON responses", false)

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------
program
  .command("login")
  .description("Save and validate your AIMS API key")
  .action(async (_opts, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    let key = g.key || process.env.AIMS_API_KEY
    if (!key) {
      process.stdout.write(`${KEYS_HELP}\n`)
      key = await prompt("Paste your AIMS API key (aims_...): ")
    }
    if (!key) die("No API key provided.")

    const client = new AimsClient({ apiKey: key, baseUrl: resolveBaseUrl(g.baseUrl) })
    try {
      const status = await client.account()
      const existing = readConfig()
      const path = writeConfig({
        apiKey: key,
        baseUrl: g.baseUrl || existing.baseUrl,
      })
      process.stdout.write(
        `Logged in. Workspace ${status.workspace_id} — ${status.credits_available} credits available.\n` +
          `Saved to ${path}\n`,
      )
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
  .action(() => {
    const existing = readConfig()
    writeConfig({ baseUrl: existing.baseUrl })
    process.stdout.write(`Logged out. Cleared API key in ${configPath()}\n`)
  })

// ---------------------------------------------------------------------------
// whoami / status
// ---------------------------------------------------------------------------
program
  .command("whoami")
  .alias("status")
  .description("Show workspace, credit balance, and scopes")
  .action(async (_opts, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const client = makeClient(g)
    try {
      const status = await client.account()
      if (g.json) {
        process.stdout.write(JSON.stringify(status, null, 2) + "\n")
        return
      }
      process.stdout.write(
        `Workspace:  ${status.workspace_id}\n` +
          `Credits:    ${status.credits_available}\n` +
          `Scopes:     ${status.scopes.join(", ") || "(none)"}\n`,
      )
    } catch (err) {
      handleError(err)
    }
  })

// ---------------------------------------------------------------------------
// models
// ---------------------------------------------------------------------------
function printModels(label: string, models: ModelInfo[], unit: string): void {
  process.stdout.write(`\n${label}\n`)
  if (!models.length) {
    process.stdout.write("  (none)\n")
    return
  }
  for (const m of models) {
    process.stdout.write(`  ${m.id}\n    ${m.name} — ${m.credit_cost} ${unit}\n`)
  }
}

program
  .command("models")
  .description("List available image and video models")
  .option("--type <type>", "filter: image or video")
  .action(async (opts: { type?: string }, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const type =
      opts.type === "image" || opts.type === "video" ? opts.type : undefined
    if (opts.type && !type) die("--type must be 'image' or 'video'.")
    const client = makeClient(g)
    try {
      const result = await client.listModels(type)
      if (g.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n")
        return
      }
      if (type !== "video") printModels("Image models", result.image_models, "credits/image")
      if (type !== "image") printModels("Video models", result.video_models, "credits/second")
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
  .argument("<prompt...>", "image description")
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
  .action(async (promptParts: string[], opts, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const client = makeClient(g)
    const params: ImageGenerateParams = {
      prompt: promptParts.join(" "),
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
    try {
      if (!g.json) process.stdout.write("Generating image(s)…\n")
      const result = await client.generateImage(params)
      if (g.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n")
      } else {
        for (const [i, img] of result.images.entries()) {
          if (img.status === "completed" && img.url) {
            process.stdout.write(`${i + 1}. ${img.url}\n`)
            if (img.share_url) process.stdout.write(`   share: ${img.share_url}\n`)
          } else {
            process.stdout.write(`${i + 1}. [${img.status}] ${img.error || "no url"}\n`)
          }
        }
        process.stdout.write(
          `Credits used: ${result.credits_used}, remaining: ${result.credits_remaining}\n`,
        )
      }
      if (opts.output) {
        const ext = `.${(opts.outputFormat as string) || "png"}`
        const urls = result.images.filter((im) => im.url).map((im) => im.url as string)
        let saved = 0
        for (const [i, url] of urls.entries()) {
          const dest = resolveOutputPath(opts.output, url, i + 1, ext, urls.length > 1)
          await downloadTo(url, dest)
          process.stdout.write(`Saved ${dest}\n`)
          saved++
        }
        if (!saved) process.stderr.write("No completed images to download.\n")
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
  .argument("<prompt...>", "edit instruction")
  .requiredOption("-i, --image-url <url>", "source image URL (repeatable)", collect, [])
  .option("-m, --model <model>", "model id")
  .option("-a, --aspect-ratio <ratio>", "defaults to auto to preserve proportions")
  .option("-r, --resolution <res>", "0.5K, 1K, 2K, 4K")
  .option("-f, --output-format <fmt>", "png, jpeg, webp")
  .option("--make-public", "make the result publicly shareable", false)
  .option("-o, --output <path>", "download result(s) to a file or directory")
  .action(async (promptParts: string[], opts, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    if (!opts.imageUrl?.length) die("At least one --image-url is required.")
    const client = makeClient(g)
    const params: ImageGenerateParams = {
      prompt: promptParts.join(" "),
      image_urls: opts.imageUrl,
      model: opts.model,
      aspect_ratio: opts.aspectRatio,
      resolution: opts.resolution,
      output_format: opts.outputFormat,
      make_public: opts.makePublic || undefined,
    }
    try {
      if (!g.json) process.stdout.write("Editing image(s)…\n")
      const result = await client.generateImage(params)
      if (g.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n")
      } else {
        for (const [i, img] of result.images.entries()) {
          process.stdout.write(
            img.url
              ? `${i + 1}. ${img.url}\n`
              : `${i + 1}. [${img.status}] ${img.error || "no url"}\n`,
          )
        }
        process.stdout.write(
          `Credits used: ${result.credits_used}, remaining: ${result.credits_remaining}\n`,
        )
      }
      if (opts.output) {
        const ext = `.${(opts.outputFormat as string) || "png"}`
        const urls = result.images.filter((im) => im.url).map((im) => im.url as string)
        for (const [i, url] of urls.entries()) {
          const dest = resolveOutputPath(opts.output, url, i + 1, ext, urls.length > 1)
          await downloadTo(url, dest)
          process.stdout.write(`Saved ${dest}\n`)
        }
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
  .argument("<prompt...>", "video description")
  .option("-m, --model <model>", "model id (e.g. fal-ai/veo3.1/fast)")
  .option("-d, --duration <seconds>", "requested duration in seconds", parseIntOption)
  .option("-a, --aspect-ratio <ratio>", "e.g. 16:9, 9:16")
  .option("--audio", "enable audio when supported", false)
  .option("-i, --image-url <url>", "source image for image-to-video")
  .option("-r, --resolution <res>", "e.g. 720p, 1080p")
  .option("--negative-prompt <text>", "negative prompt when supported")
  .option("--make-public", "make the result publicly shareable", false)
  .option("-o, --output <path>", "download the result to a file or directory")
  .action(async (promptParts: string[], opts, command: Command) => {
    const g = command.optsWithGlobals() as GlobalOpts
    const client = makeClient(g)
    const params: VideoGenerateParams = {
      prompt: promptParts.join(" "),
      model: opts.model,
      duration: opts.duration,
      aspect_ratio: opts.aspectRatio,
      audio: opts.audio || undefined,
      image_url: opts.imageUrl,
      resolution: opts.resolution,
      negative_prompt: opts.negativePrompt,
      make_public: opts.makePublic || undefined,
    }
    try {
      if (!g.json) process.stdout.write("Generating video… (this can take a few minutes)\n")
      const result = await client.generateVideo(params)
      if (g.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n")
      } else {
        const v = result.video
        if (v.url) {
          process.stdout.write(`${v.url}\n`)
          if (v.share_url) process.stdout.write(`share: ${v.share_url}\n`)
        } else {
          process.stdout.write(`[${v.status}] ${v.error || "no url"}\n`)
        }
        process.stdout.write(
          `Credits used: ${result.credits_used}, remaining: ${result.credits_remaining}\n`,
        )
      }
      if (opts.output && result.video.url) {
        const dest = resolveOutputPath(opts.output, result.video.url, 1, ".mp4", false)
        await downloadTo(result.video.url, dest)
        process.stdout.write(`Saved ${dest}\n`)
      }
    } catch (err) {
      handleError(err)
    }
  })

program.parseAsync(process.argv).catch(handleError)
