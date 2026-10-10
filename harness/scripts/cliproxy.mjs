// Trotter's models on a dev machine: runs CLIProxyAPI from .cliproxy/ (gitignored), the way POM runs it
// for Seelie.
//   npm run cliproxy
// The first time, put the release for this machine (github.com/router-for-me/CLIProxyAPI/releases) in
// .cliproxy/bin/, and set CLIPROXY_URL, CLIPROXY_API_KEY and CLIPROXY_MANAGEMENT_KEY in .env.local; this
// writes .cliproxy/config.yaml from them. After that the config is the proxy's own (it hashes the
// management key in place).
//   npm run cliproxy -- login antigravity   (or codex, claude)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname, "..", ".cliproxy");
const config = join(dir, "config.yaml");

function binaryPath() {
	if (process.platform === "win32") {
		return join(dir, "bin", "cli-proxy-api.exe");
	}
	return join(dir, "bin", "cli-proxy-api");
}

function writeConfig() {
	const apiKey = process.env.CLIPROXY_API_KEY?.trim();
	const managementKey = process.env.CLIPROXY_MANAGEMENT_KEY?.trim();
	if (!apiKey || !managementKey) {
		console.error("Set CLIPROXY_API_KEY and CLIPROXY_MANAGEMENT_KEY in .env.local first (openssl rand -hex 24, each).");
		process.exit(1);
	}

	const url = new URL(process.env.CLIPROXY_URL || "http://127.0.0.1:8317");
	const port = url.port || "8317";
	mkdirSync(join(dir, "auths"), { recursive: true });

	const lines = [
		"config-version: 8",
		"server:",
		'  host: "127.0.0.1"',
		`  port: ${port}`,
		"management:",
		"  allow-remote: false",
		`  secret-key: ${JSON.stringify(managementKey)}`,
		"  disable-control-panel: true",
		"  disable-auto-update-panel: true",
		"access:",
		"  api-keys:",
		`    - ${JSON.stringify(apiKey)}`,
		"routing:",
		'  strategy: "fill-first"',
		"oauth:",
		'  auth-dir: "./auths"',
		"",
	];
	writeFileSync(config, lines.join("\n"), { mode: 0o600 });
	console.log("Wrote .cliproxy/config.yaml from .env.local.");
}

const bin = binaryPath();
if (!existsSync(bin)) {
	console.error(`No CLIProxyAPI at ${bin}.`);
	console.error("Download the release for this machine from https://github.com/router-for-me/CLIProxyAPI/releases and extract it there.");
	process.exit(1);
}

if (!existsSync(config)) {
	writeConfig();
}

// `npm run cliproxy -- login antigravity` signs a subscription in through the proxy's own OAuth flow,
// saving it in .cliproxy/auths beside the others.
const LOGIN_FLAGS = {
	antigravity: "-antigravity-login",
	codex: "-codex-login",
	claude: "-claude-login",
};

function proxyArgs() {
	const args = ["-config", config];
	const [command, provider] = process.argv.slice(2);
	if (command !== "login") {
		return args;
	}

	const flag = LOGIN_FLAGS[provider];
	if (!flag) {
		console.error(`Sign in with one of: ${Object.keys(LOGIN_FLAGS).join(", ")}. For example: npm run cliproxy -- login antigravity`);
		process.exit(1);
	}
	args.push(flag);
	return args;
}

const proxy = spawn(bin, proxyArgs(), { cwd: dir, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => proxy.kill(signal));
}
proxy.on("exit", (code) => process.exit(code ?? 0));
