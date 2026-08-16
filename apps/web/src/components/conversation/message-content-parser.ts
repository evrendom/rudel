export const MAX_RENDERED_MESSAGE_CODE_UNITS = 256 * 1024;
export const MAX_FORMATTED_MESSAGE_PARTS = 100;
export const MAX_HIGHLIGHTED_CODE_BLOCK_UNITS = 8 * 1024;
export const MAX_HIGHLIGHTED_CODE_BLOCKS = 4;

const FORMATTING_LIMIT_NOTICE =
	"Remaining content shown unformatted (message too large).";

interface XmlEntry {
	readonly key: string;
	readonly value: string;
}

export type TextPart =
	| { readonly type: "text"; readonly content: string }
	| { readonly type: "notice"; readonly content: string }
	| {
			readonly type: "code";
			readonly content: string;
			readonly language?: string;
			readonly highlight: boolean;
	  }
	| {
			readonly type: "xml";
			readonly tag: string;
			readonly entries: ReadonlyArray<XmlEntry>;
	  };

interface MessageParseState {
	readonly formattedPartsUsed: number;
	readonly codeBlocksSeen: number;
	readonly formattingNoticeShown: boolean;
}

interface ParsedMessageBlock {
	readonly parts: ReadonlyArray<TextPart>;
	readonly state: MessageParseState;
}

const INITIAL_PARSE_STATE: MessageParseState = {
	formattedPartsUsed: 0,
	codeBlocksSeen: 0,
	formattingNoticeShown: false,
};

export function parseMessageText(text: string): ReadonlyArray<TextPart> {
	return parseMessageTextBlock(text, INITIAL_PARSE_STATE).parts;
}

export function parseMessageTextBlocks(
	textBlocks: ReadonlyArray<string | null>,
): ReadonlyArray<ReadonlyArray<TextPart> | null> {
	const parsedBlocks: Array<ReadonlyArray<TextPart> | null> = [];
	let state = INITIAL_PARSE_STATE;

	for (const text of textBlocks) {
		if (text === null) {
			parsedBlocks.push(null);
			continue;
		}

		const parsedBlock = parseMessageTextBlock(text, state);
		parsedBlocks.push(parsedBlock.parts);
		state = parsedBlock.state;
	}

	return parsedBlocks;
}

function parseMessageTextBlock(
	text: string,
	initialState: MessageParseState,
): ParsedMessageBlock {
	if (text.length > MAX_RENDERED_MESSAGE_CODE_UNITS) {
		const visibleText = text
			.slice(0, MAX_RENDERED_MESSAGE_CODE_UNITS)
			.trimEnd();
		const omittedCharacters = text.length - MAX_RENDERED_MESSAGE_CODE_UNITS;
		const parts: TextPart[] = [];

		if (visibleText) {
			parts.push({ type: "text", content: visibleText });
		}
		parts.push({
			type: "notice",
			content: `Truncated — ${omittedCharacters} characters omitted.`,
		});

		return { parts, state: initialState };
	}

	const parts: TextPart[] = [];
	let state = initialState;
	let plainTextStart = 0;
	let cursor = 0;

	while (cursor < text.length) {
		if (text.startsWith("```", cursor)) {
			const codeBlock = readCodeBlockStart(text, cursor);
			if (!codeBlock) {
				cursor += 3;
				continue;
			}

			const closingFenceStart = text.indexOf("```", codeBlock.contentStart);
			if (closingFenceStart === -1) {
				cursor = codeBlock.contentStart;
				continue;
			}

			appendTextPart(parts, text.slice(plainTextStart, cursor));

			if (state.formattedPartsUsed === MAX_FORMATTED_MESSAGE_PARTS) {
				state = appendFormattingFallback(parts, text.slice(cursor), state);
				return { parts, state };
			}

			const codeContent = text.slice(codeBlock.contentStart, closingFenceStart);
			const highlight =
				codeBlock.language !== "text" &&
				state.codeBlocksSeen < MAX_HIGHLIGHTED_CODE_BLOCKS &&
				codeContent.length <= MAX_HIGHLIGHTED_CODE_BLOCK_UNITS;

			parts.push({
				type: "code",
				content: codeContent,
				language: codeBlock.language,
				highlight,
			});
			state = {
				...state,
				formattedPartsUsed: state.formattedPartsUsed + 1,
				codeBlocksSeen: state.codeBlocksSeen + 1,
			};
			cursor = closingFenceStart + 3;
			plainTextStart = cursor;
			continue;
		}

		if (text[cursor] !== "<") {
			cursor += 1;
			continue;
		}

		const openingTagEnd = text.indexOf(">", cursor + 1);
		if (openingTagEnd === -1) {
			break;
		}

		const tag = readXmlTagName(text, cursor + 1, openingTagEnd, true);
		if (!tag) {
			cursor = openingTagEnd + 1;
			continue;
		}

		const closingTag = `</${tag}>`;
		const closingTagStart = text.indexOf(closingTag, openingTagEnd + 1);
		if (closingTagStart === -1) {
			break;
		}

		appendTextPart(parts, text.slice(plainTextStart, cursor));
		const availableEntryParts =
			MAX_FORMATTED_MESSAGE_PARTS - state.formattedPartsUsed - 1;

		if (availableEntryParts < 0) {
			state = appendFormattingFallback(parts, text.slice(cursor), state);
			return { parts, state };
		}

		const entries = parseXmlEntries(
			text.slice(openingTagEnd + 1, closingTagStart),
			availableEntryParts,
		);
		if (!entries) {
			state = appendFormattingFallback(parts, text.slice(cursor), state);
			return { parts, state };
		}

		if (entries.length > 0) {
			parts.push({ type: "xml", tag, entries });
			state = {
				...state,
				formattedPartsUsed: state.formattedPartsUsed + entries.length + 1,
			};
		}

		cursor = closingTagStart + closingTag.length;
		plainTextStart = cursor;
	}

	appendTextPart(parts, text.slice(plainTextStart));

	if (parts.length === 0 && text.length > 0) {
		parts.push({ type: "text", content: text });
	}

	return { parts, state };
}

function appendTextPart(parts: TextPart[], text: string) {
	const content = text.trim();

	if (content) {
		parts.push({ type: "text", content });
	}
}

function appendFormattingFallback(
	parts: TextPart[],
	text: string,
	state: MessageParseState,
): MessageParseState {
	let nextState = state;

	if (!state.formattingNoticeShown) {
		parts.push({ type: "notice", content: FORMATTING_LIMIT_NOTICE });
		nextState = { ...state, formattingNoticeShown: true };
	}

	appendTextPart(parts, text);
	return nextState;
}

function parseXmlEntries(
	innerContent: string,
	maxEntries: number,
): ReadonlyArray<XmlEntry> | null {
	const entries: XmlEntry[] = [];
	let cursor = 0;

	while (cursor < innerContent.length) {
		if (innerContent[cursor] !== "<") {
			cursor += 1;
			continue;
		}

		const openingTagEnd = innerContent.indexOf(">", cursor + 1);
		if (openingTagEnd === -1) {
			break;
		}

		const tag = readXmlTagName(innerContent, cursor + 1, openingTagEnd, false);
		if (!tag) {
			cursor = openingTagEnd + 1;
			continue;
		}

		const closingTag = `</${tag}>`;
		const closingTagStart = innerContent.indexOf(closingTag, openingTagEnd + 1);
		if (closingTagStart === -1) {
			break;
		}

		if (entries.length === maxEntries) {
			return null;
		}

		entries.push({
			key: tag,
			value: innerContent.slice(openingTagEnd + 1, closingTagStart).trim(),
		});
		cursor = closingTagStart + closingTag.length;
	}

	if (entries.length === 0) {
		const trimmedContent = innerContent.trim();
		if (trimmedContent) {
			if (maxEntries === 0) {
				return null;
			}
			entries.push({ key: "content", value: trimmedContent });
		}
	}

	return entries;
}

function readCodeBlockStart(
	text: string,
	fenceStart: number,
): { readonly contentStart: number; readonly language: string } | null {
	const languageStart = fenceStart + 3;
	let cursor = languageStart;

	while (
		cursor < text.length &&
		isCodeLanguageCharacter(text.charCodeAt(cursor))
	) {
		cursor += 1;
	}

	if (text[cursor] !== "\n") {
		return null;
	}

	return {
		contentStart: cursor + 1,
		language: text.slice(languageStart, cursor) || "text",
	};
}

function readXmlTagName(
	text: string,
	nameStart: number,
	tagEnd: number,
	allowAttributes: boolean,
): string | null {
	let cursor = nameStart;

	while (cursor < tagEnd && isTagNameCharacter(text.charCodeAt(cursor))) {
		cursor += 1;
	}

	if (cursor === nameStart) {
		return null;
	}

	if (cursor < tagEnd && (!allowAttributes || text[cursor]?.trim() !== "")) {
		return null;
	}

	return text.slice(nameStart, cursor);
}

function isTagNameCharacter(characterCode: number) {
	return isCodeLanguageCharacter(characterCode) || characterCode === 45;
}

function isCodeLanguageCharacter(characterCode: number) {
	return (
		(characterCode >= 48 && characterCode <= 57) ||
		(characterCode >= 65 && characterCode <= 90) ||
		characterCode === 95 ||
		(characterCode >= 97 && characterCode <= 122)
	);
}
