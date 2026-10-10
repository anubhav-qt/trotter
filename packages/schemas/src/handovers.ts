import { type Static, Type } from "typebox";
import { CLOSED, PricePaise, Sector, StockRef, Text, TradingDay, UtcTimestamp } from "./primitives.ts";
import { RecordRef, versionedRecord } from "./records.ts";

// What agents hand each other (ADR 0018): the metrics and facts as fields, the reasoning as free text.
// Code validates each one, stores it as a versioned record, and renders it into the next agent's input.

const evidence = Type.Array(RecordRef, { description: "The records behind it" });

/** From the Trade Master to particular trader chats. */
export const Brief = Type.Object(
	{
		to: Type.Array(StockRef, { minItems: 1, description: "The trader chats it's for, by their stocks" }),
		topic: Type.Enum(["sector-trend", "concentration", "regime", "inconsistency", "calendar", "other"]),
		sectors: Type.Array(Sector),
		summary: Text,
		evidence,
		reasoning: Text,
	},
	CLOSED,
);

/** From the Auditor: a change it undid, or a trade it handed back to its trader chat. Every finding also goes to the Lessons chat. */
export const Finding = Type.Object(
	{
		about: RecordRef,
		problem: Type.Enum(["weird", "suspicious", "unnecessary", "bad"]),
		action: Type.Enum(["undone", "handed-back"]),
		summary: Text,
		evidence,
		reasoning: Text,
	},
	CLOSED,
);

/** The fixed list of causes the Lessons chat names a loss by (ADR 0010). */
export const LossCause = Type.Enum([
	"bad-data",
	"ignored-signal",
	"position-too-large",
	"stop-too-tight",
	"stop-too-loose",
	"event-risk",
	"regime-change",
	"wrong-score",
	"slippage",
	"bad-luck",
]);

/** From the Lessons chat to every trader chat. Goes live as soon as it's written. */
export const Lesson = Type.Object(
	{
		title: Text,
		rule: Type.String({ minLength: 1, description: "What to do or avoid, as the trader chats will read it" }),
		causes: Type.Array(LossCause, { description: "Empty for a lesson drawn from winners" }),
		sectors: Type.Array(Sector, { description: "Empty when it applies to every sector" }),
		evidence,
		reasoning: Text,
	},
	CLOSED,
);

/** A stock put forward for the shortlist by an agent (ADR 0019). */
export const Nomination = Type.Object(
	{
		stock: StockRef,
		horizonTradingDays: Type.Integer({ minimum: 1, description: "How long a trade in it would likely be held" }),
		nominatedUntil: TradingDay,
		evidence,
		reasoning: Text,
	},
	CLOSED,
);

/** When code should wake a trader chat that is waiting. */
export const WakeCondition = Type.Union([
	Type.Object({ kind: Type.Literal("time"), at: UtcTimestamp }, CLOSED),
	Type.Object({ kind: Type.Literal("price-at-or-above"), pricePaise: PricePaise }, CLOSED),
	Type.Object({ kind: Type.Literal("price-at-or-below"), pricePaise: PricePaise }, CLOSED),
]);

const decisionFields = {
	answers: Type.Array(RecordRef, { description: "The findings and briefs this decision answers" }),
	reasoning: Text,
};

/** What a trader chat decided in a run (ADR 0022): act now, plan and wait, or do nothing. */
export const TraderDecision = Type.Union([
	Type.Object(
		{
			decision: Type.Literal("act-now"),
			orders: Type.Array(RecordRef, { minItems: 1, description: "The orders it placed" }),
			...decisionFields,
		},
		CLOSED,
	),
	Type.Object(
		{
			decision: Type.Literal("plan-and-wait"),
			waitingFor: Text,
			wakeWhen: Type.Array(WakeCondition, { minItems: 1, description: "Code wakes the chat at the first of these" }),
			...decisionFields,
		},
		CLOSED,
	),
	Type.Object({ decision: Type.Literal("do-nothing"), ...decisionFields }, CLOSED),
]);

/** Which chat a question goes to. */
export const ChatAddress = Type.Union([
	Type.Object({ role: Type.Literal("trader"), stock: StockRef }, CLOSED),
	Type.Object({ role: Type.Enum(["trade-master", "lessons", "auditor"]) }, CLOSED),
]);

/** One agent asking another for more. The asking chat wakes when the answer arrives. */
export const Question = Type.Object(
	{
		to: ChatAddress,
		question: Text,
		reasoning: Text,
	},
	CLOSED,
);

/** A figure an agent found, for code to calculate with. */
export const Figure = Type.Object(
	{
		name: Text,
		value: Type.Number(),
		unit: Type.String({ minLength: 1, description: "For example rupees crore, percent, shares" }),
	},
	CLOSED,
);

export const Answer = Type.Object(
	{
		question: RecordRef,
		answer: Text,
		figures: Type.Array(Figure),
		evidence,
	},
	CLOSED,
);

/** From the Trade Master: what it sees in a sector or theme, read by the trader chats of stocks in those sectors. */
export const SectorNote = Type.Object(
	{
		sectors: Type.Array(Sector, { minItems: 1 }),
		themes: Type.Array(Text),
		outlook: Type.Enum(["positive", "negative", "mixed", "unclear"]),
		summary: Text,
		evidence,
		reasoning: Text,
	},
	CLOSED,
);

/** From the Trade Master to the Lessons chat: what a group of winning or losing trades share. */
export const Pattern = Type.Object(
	{
		outcome: Type.Enum(["winning", "losing"]),
		trades: Type.Array(RecordRef, { minItems: 1 }),
		sectors: Type.Array(Sector),
		companyTypes: Type.Array(Text, { description: "For example small cap, PSU, exporter, rate sensitive" }),
		summary: Text,
		reasoning: Text,
	},
	CLOSED,
);

export const BriefRecord = versionedRecord("brief", Brief);
export const FindingRecord = versionedRecord("finding", Finding);
export const LessonRecord = versionedRecord("lesson", Lesson);
export const NominationRecord = versionedRecord("nomination", Nomination);
export const TraderDecisionRecord = versionedRecord("trader-decision", TraderDecision);
export const QuestionRecord = versionedRecord("question", Question);
export const AnswerRecord = versionedRecord("answer", Answer);
export const SectorNoteRecord = versionedRecord("sector-note", SectorNote);
export const PatternRecord = versionedRecord("pattern", Pattern);

export type Brief = Static<typeof Brief>;
export type Finding = Static<typeof Finding>;
export type LossCause = Static<typeof LossCause>;
export type Lesson = Static<typeof Lesson>;
export type Nomination = Static<typeof Nomination>;
export type WakeCondition = Static<typeof WakeCondition>;
export type TraderDecision = Static<typeof TraderDecision>;
export type ChatAddress = Static<typeof ChatAddress>;
export type Question = Static<typeof Question>;
export type Figure = Static<typeof Figure>;
export type Answer = Static<typeof Answer>;
export type SectorNote = Static<typeof SectorNote>;
export type Pattern = Static<typeof Pattern>;
export type BriefRecord = Static<typeof BriefRecord>;
export type FindingRecord = Static<typeof FindingRecord>;
export type LessonRecord = Static<typeof LessonRecord>;
export type NominationRecord = Static<typeof NominationRecord>;
export type TraderDecisionRecord = Static<typeof TraderDecisionRecord>;
export type QuestionRecord = Static<typeof QuestionRecord>;
export type AnswerRecord = Static<typeof AnswerRecord>;
export type SectorNoteRecord = Static<typeof SectorNoteRecord>;
export type PatternRecord = Static<typeof PatternRecord>;
