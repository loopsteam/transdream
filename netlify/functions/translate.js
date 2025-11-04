const API_ENDPOINT = "https://ark.cn-beijing.volces.com/api/v3/responses";
const DEFAULT_MODEL_ID = "doubao-seed-translation-250915";

const buildTranslationPayload = (text, sourceLanguage, targetLanguage) => {
  const translationOptions = {
    target_language: targetLanguage || "en",
  };

  if (sourceLanguage && sourceLanguage !== "auto") {
    translationOptions.source_language = sourceLanguage;
  }

  return {
    model: process.env.MODEL_ID || DEFAULT_MODEL_ID,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text,
            translation_options: translationOptions,
          },
        ],
      },
    ],
  };
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const { text, sourceLanguage, targetLanguage } = JSON.parse(event.body || "{}");

    if (!text || !text.trim()) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing text" }),
      };
    }

    const apiKey = process.env.TRANSLATION_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "TRANSLATION_API_KEY is not configured" }),
      };
    }

    const payload = buildTranslationPayload(text, sourceLanguage, targetLanguage);

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: errorText || "Failed to fetch translation" }),
      };
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Unexpected server error" }),
    };
  }
};
