import { NextResponse } from "next/server";

const REDMONT_API_URL =
  process.env.REDMONT_TRANSLATION_API_URL ??
  "https://redmont-digital-api.netlify.app/.netlify/functions/generate-llms";

type TranslationRequestBody = {
  sourceLanguage?: string;
  targetLanguages?: string[];
  texts?: string[];
};

function extractJsonBlock(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeTranslations(raw: unknown, targetLanguages: string[], textCount: number) {
  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Record<string, unknown>;
  const source =
    (candidate.translations as Record<string, unknown> | undefined) ??
    (candidate.result as Record<string, unknown> | undefined) ??
    (candidate.data as Record<string, unknown> | undefined) ??
    candidate;

  const normalized: Record<string, string[]> = {};

  for (const code of targetLanguages) {
    const value = source?.[code];
    if (!Array.isArray(value)) continue;
    const asStrings = value.slice(0, textCount).map((item) => String(item ?? ""));
    if (asStrings.length === textCount) {
      normalized[code] = asStrings;
    }
  }

  if (Object.keys(normalized).length === 0) return null;
  return normalized;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TranslationRequestBody;
    const sourceLanguage = body.sourceLanguage ?? "en";
    const targetLanguages = (body.targetLanguages ?? []).filter(Boolean);
    const texts = (body.texts ?? []).map((text) => String(text ?? ""));

    if (!targetLanguages.length || !texts.length) {
      return NextResponse.json(
        { error: "Provide at least one target language and one text layer." },
        { status: 400 },
      );
    }

    const prompt = [
      "Translate each text into every requested target language.",
      "Return valid JSON only with the shape:",
      '{ "translations": { "<lang_code>": ["..."] } }',
      "Keep the same number and order of strings as provided.",
      `sourceLanguage=${sourceLanguage}`,
      `targetLanguages=${targetLanguages.join(",")}`,
      `texts=${JSON.stringify(texts)}`,
    ].join("\n");

    const upstreamResponse = await fetch(REDMONT_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: "translate_text_layers",
        sourceLanguage,
        targetLanguages,
        texts,
        prompt,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const rawText = await upstreamResponse.text();
    if (!upstreamResponse.ok) {
      return NextResponse.json(
        {
          error: `Redmont API request failed with status ${upstreamResponse.status}.`,
          details: rawText.slice(0, 500),
        },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = extractJsonBlock(rawText);
    }

    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json(
        {
          error: "Redmont API returned an unreadable response.",
          details: rawText.slice(0, 500),
        },
        { status: 502 },
      );
    }

    const parsedRecord = parsed as Record<string, unknown>;
    const contentText =
      typeof parsedRecord.output === "string"
        ? parsedRecord.output
        : typeof parsedRecord.content === "string"
          ? parsedRecord.content
          : null;

    let normalized = normalizeTranslations(parsed, targetLanguages, texts.length);

    if (!normalized && contentText) {
      const contentJson = extractJsonBlock(contentText);
      normalized = normalizeTranslations(contentJson, targetLanguages, texts.length);
    }

    if (!normalized) {
      return NextResponse.json(
        {
          error: "Could not normalize translated text from Redmont API response.",
          details: rawText.slice(0, 500),
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ translations: normalized });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected translation failure.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
