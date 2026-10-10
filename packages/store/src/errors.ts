/** Something the store won't do, with what to do instead. */
export class StoreError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "StoreError";
	}
}

/** A record moved on since the writer read it: read it again, then decide. */
export class RecordConflictError extends StoreError {
	constructor(message: string) {
		super(message);
		this.name = "RecordConflictError";
	}
}

/** A chat already has a run going. */
export class ChatBusyError extends StoreError {
	constructor(message: string) {
		super(message);
		this.name = "ChatBusyError";
	}
}
