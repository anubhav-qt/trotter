/**
 * The database's tables, one migration per change, applied in order. A committed migration is
 * never edited: a change to a table is a new migration at the end.
 *
 * Each row keeps its whole checked object as JSON; the other columns are copies of its fields,
 * there for lookups and for the constraints the database enforces. Records, transcripts and the
 * action log only ever grow: triggers refuse any update or delete.
 */
export const MIGRATIONS: string[] = [
	`
	CREATE TABLE chats (
		id TEXT PRIMARY KEY,
		role TEXT NOT NULL,
		isin TEXT UNIQUE,
		chat TEXT NOT NULL
	) STRICT;
	CREATE UNIQUE INDEX one_chat_per_role ON chats (role) WHERE role != 'trader';

	CREATE TABLE runs (
		id TEXT PRIMARY KEY,
		chat_id TEXT NOT NULL REFERENCES chats (id),
		status TEXT NOT NULL,
		run TEXT NOT NULL
	) STRICT;
	CREATE UNIQUE INDEX one_running_run_per_chat ON runs (chat_id) WHERE status = 'running';

	CREATE TABLE messages (
		chat_id TEXT NOT NULL REFERENCES chats (id),
		seq INTEGER NOT NULL,
		run_id TEXT NOT NULL REFERENCES runs (id),
		message TEXT NOT NULL,
		PRIMARY KEY (chat_id, seq)
	) STRICT;
	CREATE TRIGGER messages_never_change BEFORE UPDATE ON messages
		BEGIN SELECT RAISE(ABORT, 'A transcript is never changed, only added to'); END;
	CREATE TRIGGER messages_never_deleted BEFORE DELETE ON messages
		BEGIN SELECT RAISE(ABORT, 'A transcript is never changed, only added to'); END;

	CREATE TABLE action_log (
		id TEXT PRIMARY KEY,
		run_id TEXT NOT NULL REFERENCES runs (id),
		entry TEXT NOT NULL
	) STRICT;
	CREATE INDEX action_log_by_run ON action_log (run_id);
	CREATE TRIGGER action_log_never_changes BEFORE UPDATE ON action_log
		BEGIN SELECT RAISE(ABORT, 'The action log is never changed, only added to'); END;
	CREATE TRIGGER action_log_never_deleted BEFORE DELETE ON action_log
		BEGIN SELECT RAISE(ABORT, 'The action log is never changed, only added to'); END;

	CREATE TABLE records (
		id TEXT NOT NULL,
		version INTEGER NOT NULL,
		kind TEXT NOT NULL,
		status TEXT NOT NULL,
		record TEXT NOT NULL,
		PRIMARY KEY (id, version)
	) STRICT;
	CREATE INDEX records_by_kind ON records (kind, id);
	CREATE TRIGGER records_never_change BEFORE UPDATE ON records
		BEGIN SELECT RAISE(ABORT, 'A stored version is never changed: write a new version'); END;
	CREATE TRIGGER records_never_deleted BEFORE DELETE ON records
		BEGIN SELECT RAISE(ABORT, 'A stored version is never deleted: write a new version'); END;
	`,
];
