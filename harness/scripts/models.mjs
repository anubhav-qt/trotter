// Lists the models the signed-in subscriptions serve through CLIProxyAPI, and the accounts behind them.
//   npm run models
const base = (process.env.CLIPROXY_URL || "http://127.0.0.1:8317").replace(/\/+$/, "");
const apiKey = process.env.CLIPROXY_API_KEY?.trim();
const managementKey = process.env.CLIPROXY_MANAGEMENT_KEY?.trim();

if (!apiKey || !managementKey) {
	console.error("Set CLIPROXY_API_KEY and CLIPROXY_MANAGEMENT_KEY in .env.local first.");
	process.exit(1);
}

async function getJson(path, key) {
	let response;
	try {
		response = await fetch(base + path, { headers: { Authorization: `Bearer ${key}` } });
	} catch {
		console.error(`CLIProxyAPI isn't answering at ${base}. Start it first: npm run cliproxy`);
		process.exit(1);
	}
	if (!response.ok) {
		console.error(`CLIProxyAPI said ${response.status} for ${path}. Check the keys in .env.local.`);
		process.exit(1);
	}
	return response.json();
}

const credentials = await getJson("/v8/management/credentials", managementKey);
const accounts = credentials.files ?? [];
console.log(`Accounts signed in: ${accounts.length}`);
for (const account of accounts) {
	const who = account.email ?? account.label ?? account.name;
	let state = account.status ?? "unknown";
	if (account.disabled) {
		state = "disabled";
	}
	console.log(`  ${account.provider}  ${who}  (${state})`);
}

const models = await getJson("/v1/models", apiKey);
const list = models.data ?? [];
console.log(`Models available: ${list.length}`);
for (const model of list) {
	console.log(`  ${model.id}  via ${model.owned_by}`);
}

if (accounts.length === 0) {
	console.log("Sign one in: npm run cliproxy -- login antigravity");
}
