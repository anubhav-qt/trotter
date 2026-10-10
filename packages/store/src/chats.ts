import { randomUUID } from "node:crypto";
import { Chat, type ChatRole, checkValue, type StockRef } from "@trotter/schemas";
import { type Database, inTransaction, jsonColumn, now } from "./database.ts";
import { StoreError } from "./errors.ts";

/** The chats (ADR 0013): one per stock for its trader, and one each for the Trade Master, Lessons and the Auditor. */

/** The stock's trader chat, made the first time the stock needs one. */
export function openTraderChat(database: Database, stock: StockRef): Chat {
	return inTransaction(database, () => {
		const row = database.prepare("SELECT chat FROM chats WHERE isin = ?").get(stock.isin);
		if (row) {
			return checkValue(Chat, jsonColumn(row, "chat"), `The stored chat for ${stock.isin}`);
		}
		const chat = checkValue(
			Chat,
			{ id: randomUUID(), role: "trader", stock, createdAt: now() },
			`The trader chat for ${stock.symbol}`,
		);
		database
			.prepare("INSERT INTO chats (id, role, isin, chat) VALUES (?, ?, ?, ?)")
			.run(chat.id, chat.role, stock.isin, JSON.stringify(chat));
		return chat;
	});
}

/** The Trade Master's, the Lessons or the Auditor chat, made the first time it's needed. */
export function openChat(database: Database, role: Exclude<ChatRole, "trader">): Chat {
	return inTransaction(database, () => {
		const row = database.prepare("SELECT chat FROM chats WHERE role = ?").get(role);
		if (row) {
			return checkValue(Chat, jsonColumn(row, "chat"), `The stored ${role} chat`);
		}
		const chat = checkValue(Chat, { id: randomUUID(), role, createdAt: now() }, `The ${role} chat`);
		database
			.prepare("INSERT INTO chats (id, role, isin, chat) VALUES (?, ?, NULL, ?)")
			.run(chat.id, chat.role, JSON.stringify(chat));
		return chat;
	});
}

export function readChat(database: Database, id: string): Chat {
	const row = database.prepare("SELECT chat FROM chats WHERE id = ?").get(id);
	if (!row) {
		throw new StoreError(`There is no chat ${id}.`);
	}
	return checkValue(Chat, jsonColumn(row, "chat"), `Stored chat ${id}`);
}
