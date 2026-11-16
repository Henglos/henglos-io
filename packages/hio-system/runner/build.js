// runner/build.ts
import { spawn } from "child_process";
import { createHash } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
var PYTHON = process.env.PYTHON ?? "python3";
var CACHE = process.env.HIO_CACHE ?? "/root/.cache/hio";
var moduleName = (text) => text.toLowerCase().replace(/[^a-z0-9_]/g, "_");
function run(command, args, log, env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { env: { ...process.env, PYTHONUNBUFFERED: "1", ...env } });
    proc.stdout.on("data", (chunk) => void log(chunk.toString()));
    proc.stderr.on("data", (chunk) => void log(chunk.toString()));
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`${command} ${args[0] ?? ""} exited with code ${code}`)));
    proc.on("error", reject);
  });
}
async function mpyCross(version, log) {
  const target = path.join(CACHE, "mpy-cross", version);
  if (!existsSync(path.join(target, "mpy_cross"))) {
    await log(`[build] installing mpy-cross ${version}
`);
    await run(PYTHON, ["-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--target", target, `mpy-cross==${version}.*`], log);
  }
  return target;
}
function* pythonFiles(dir, relative = "") {
  for (const entry of readdirSync(path.join(dir, relative), { withFileTypes: true })) {
    if (entry.name === "__pycache__")
      continue;
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory())
      yield* pythonFiles(dir, child);
    else if (entry.name.endsWith(".py"))
      yield child;
  }
}
var FIRMWARE_INFO = "firmware.json";
var FIRMWARE_IMAGE = "firmware.bin";
var FREEZE_STAGE = "/tmp/hio-freeze";
function firmwareContext(context) {
  return {
    micropython: context.board.firmware.micropython,
    cache: CACHE,
    options: context.options,
    log: context.log,
    run: (command, args = []) => run(command, args, context.log)
  };
}
function scopedOptions(context, scopes) {
  const declared = new Map((context.board.options ?? []).map((option) => [option.key, option.scope ?? "build"]));
  return Object.fromEntries(Object.entries(context.options).filter(([key]) => scopes.includes(declared.get(key) ?? "build")).sort(([a], [b]) => a.localeCompare(b)));
}
function scriptHash(context) {
  return createHash("sha256").update(readFileSync(path.resolve(context.board.path, context.board.firmware.script))).digest("hex");
}
async function withCacheLock(fn) {
  mkdirSync(CACHE, { recursive: true });
  const holder = spawn("flock", [path.join(CACHE, "firmware.lock"), "sh", "-c", "echo locked; exec cat"], { stdio: ["pipe", "pipe", "inherit"] });
  const exited = new Promise((resolve) => holder.on("close", () => resolve()));
  const locked = await new Promise((resolve, reject) => {
    holder.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("locked"))
        resolve(true);
    });
    holder.on("error", (error) => error.code === "ENOENT" ? resolve(false) : reject(error));
    holder.on("close", (code) => reject(new Error(`flock exited with code ${code} before taking the lock`)));
  });
  try {
    return await fn();
  } finally {
    if (locked) {
      holder.stdin.end();
      await exited;
    }
  }
}
async function prepareBoard(context) {
  const prepare = context.boardFirmware.prepare;
  if (!prepare)
    return;
  const options = scopedOptions(context, ["prepare"]);
  const key = createHash("sha256").update(JSON.stringify({
    script: scriptHash(context),
    micropython: context.board.firmware.micropython,
    image: context.board.firmware.image,
    options
  })).digest("hex").slice(0, 16);
  const marker = path.join(CACHE, "prepared", key);
  if (existsSync(marker))
    return;
  await context.phase?.("prepare");
  await context.log(`[prepare] ${context.board.name}'s environment, MicroPython ${context.board.firmware.micropython} — once; a first one may take a while
`);
  await prepare({ ...firmwareContext(context), options });
  mkdirSync(path.dirname(marker), { recursive: true });
  writeFileSync(marker, new Date().toISOString());
}
var RUNTIME_PACKAGES = ["hio", "henglosio"];
function stageRuntime(root, identity) {
  rmSync(FREEZE_STAGE, { recursive: true, force: true });
  const hash = createHash("sha256").update(identity);
  for (const pkg of RUNTIME_PACKAGES) {
    for (const file of [...pythonFiles(path.join(root, pkg))].sort()) {
      const source = readFileSync(path.join(root, pkg, file));
      const target = path.join(FREEZE_STAGE, pkg, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, source);
      hash.update(`\x00${pkg}/${file}\x00`).update(source);
    }
    const init = path.join(FREEZE_STAGE, pkg, "__init__.py");
    if (!existsSync(init))
      writeFileSync(init, "");
  }
  const buildId = hash.digest("hex").slice(0, 16);
  writeFileSync(path.join(FREEZE_STAGE, "hio_build.py"), [
    "# Written by the platform's build: which build of the runtime this",
    "# firmware has frozen in — the driver reads it to tell whether a Flash",
    "# has anything to write.",
    `BUILD_ID = "${buildId}"`,
    ""
  ].join(`
`));
  return buildId;
}
var PlatformRunner = {
  async build(context) {
    await context.phase?.("build");
    const output = context.platform.build.output;
    mkdirSync(output, { recursive: true });
    for (const entry of readdirSync(output))
      rmSync(path.join(output, entry), { recursive: true, force: true });
    const version = context.board.firmware.micropython;
    const compile = async (source, target, name) => {
      const pythonPath = await mpyCross(version, context.log);
      mkdirSync(path.dirname(target), { recursive: true });
      await run(PYTHON, ["-m", "mpy_cross", "-o", target, "-s", name, source], context.log, { PYTHONPATH: pythonPath });
    };
    const root = context.platform.path;
    let modules = 0;
    const identity = JSON.stringify({
      version,
      image: context.board.firmware.image,
      script: scriptHash(context),
      options: Object.entries(scopedOptions(context, ["prepare", "build"])),
      platform: context.platform.version
    });
    const buildId = stageRuntime(root, identity);
    const cached = path.join(CACHE, "firmware", `${buildId}.bin`);
    if (existsSync(cached)) {
      await context.log(`[build] firmware ${buildId}: already built
`);
    } else {
      const manifest = path.join(FREEZE_STAGE, "manifest.py");
      writeFileSync(manifest, [
        "# The port's own frozen modules (asyncio, requests…), plus the runtime.",
        `include("$(PORT_DIR)/boards/manifest.py")`,
        ...RUNTIME_PACKAGES.map((pkg) => `package("${pkg}", base_path="${FREEZE_STAGE}")`),
        `module("hio_build.py", base_path="${FREEZE_STAGE}")`,
        ""
      ].join(`
`));
      const image = `${cached}.partial`;
      mkdirSync(path.dirname(cached), { recursive: true });
      rmSync(image, { force: true });
      await withCacheLock(async () => {
        await prepareBoard(context);
        await context.phase?.("build");
        await context.log(`[build] ${context.board.name}'s firmware script, MicroPython ${version}
`);
        await context.boardFirmware.build({ ...firmwareContext(context), freezeManifest: manifest, firmwareOutput: image });
      });
      if (existsSync(image)) {
        copyFileSync(image, cached);
        rmSync(image, { force: true });
      }
    }
    const frozen = existsSync(cached);
    if (frozen) {
      copyFileSync(cached, path.join(output, FIRMWARE_IMAGE));
      const info = { buildId, micropython: version, image: FIRMWARE_IMAGE };
      writeFileSync(path.join(output, FIRMWARE_INFO), JSON.stringify(info, null, 2));
      modules = RUNTIME_PACKAGES.reduce((total, pkg) => total + [...pythonFiles(path.join(FREEZE_STAGE, pkg))].length, 0);
    } else {
      for (const pkg of RUNTIME_PACKAGES) {
        for (const file of pythonFiles(path.join(FREEZE_STAGE, pkg))) {
          const name = `${pkg}/${file}`;
          await compile(path.join(FREEZE_STAGE, name), path.join(output, name.replace(/\.py$/, ".mpy")), name);
          modules++;
        }
      }
    }
    for (const entry of ["main.py", "boot.py"]) {
      const source = path.join(root, entry);
      if (existsSync(source))
        copyFileSync(source, path.join(output, entry));
    }
    await context.log(frozen ? `[build] runtime: ${modules} modules frozen into MicroPython ${version} (${context.board.name})
` : `[build] runtime: ${modules} modules for MicroPython ${version} (${context.board.name})
`);
    mkdirSync(path.join(output, "components"), { recursive: true });
    writeFileSync(path.join(output, "components", "__init__.py"), "");
    for (const component of context.components) {
      const schema = component.schema;
      const folder = path.join(output, "components", moduleName(schema.displayName));
      mkdirSync(folder, { recursive: true });
      writeFileSync(path.join(folder, "__init__.py"), "");
      const prefix = `components/${moduleName(schema.displayName)}`;
      const actionModules = new Set;
      const scripts = new Set;
      for (const action of schema.actions ?? []) {
        const module = moduleName(action.displayName);
        const source = path.resolve(component.path, action.script);
        await compile(source, path.join(folder, `${module}.mpy`), `${prefix}/${module}.mpy`);
        await context.log(`[build] ${schema.displayName}/${action.displayName} -> ${prefix}/${module}.mpy
`);
        actionModules.add(module);
        scripts.add(source);
      }
      for (const directory of new Set([...scripts].map((script) => path.dirname(script)))) {
        for (const entry of readdirSync(directory)) {
          const source = path.join(directory, entry);
          if (!entry.endsWith(".py") || entry === "__init__.py" || scripts.has(source))
            continue;
          const module = entry.slice(0, -3);
          if (actionModules.has(module)) {
            throw new Error(`${schema.displayName}: ${entry} clashes with the module of an action — rename one of them`);
          }
          await compile(source, path.join(folder, `${module}.mpy`), `${prefix}/${module}.mpy`);
          await context.log(`[build] ${schema.displayName} module ${entry} -> ${prefix}/${module}.mpy
`);
        }
      }
    }
  },
  async flash(context) {
    await withCacheLock(() => prepareBoard(context));
    await context.phase?.("flash");
    const tunnel = process.env.USB_TUNNEL_PORT;
    await context.boardFirmware.flash({
      ...firmwareContext(context),
      ...context.firmware ? { firmware: context.firmware } : {},
      serialUrl: tunnel ? `rfc2217://${process.env.USB_TUNNEL_HOST ?? "host.docker.internal"}:${tunnel}` : context.port,
      baudrate: context.baudrate,
      erase: process.env.HIO_FLASH_ERASE !== "0"
    });
  }
};
var build_default = PlatformRunner;
export {
  build_default as default
};
