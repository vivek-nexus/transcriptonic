/**
 * llm.js - Unified Chat Inference Library
 * Providers: OpenAI, Google Gemini
 * Zero dependencies, browser friendly (fetch).
 * Keep this file small & framework‑agnostic. Extend only if strictly needed.
 */
class LLM {
  /**
   * Suggested model names (purely optional helpers).
   */
  static SuggestedModels = {
    openai: [
      "gpt-4.1-mini",
      "gpt-4.1-nano",
      "gpt-4.1"
    ],
    google: [
      "gemini-2.5-pro",
      "gemini-2.5-flash"
    ]
  };

  /**
   * @param {string} provider  one of: openai | google
   * @param {string} apiKey    API key/token
   * @param {object} options   { model, temperature?, maxTokens?, topP?, topK?, systemPrompt? }
   */
  constructor(provider, apiKey, options = {}) {
    if (!provider) throw new Error("provider required");
    if (!apiKey) throw new Error("apiKey required");
    this.provider = provider.toLowerCase();
    this.apiKey = apiKey;
    this.model = options.model || LLM.SuggestedModels[this.provider]?.[0];
    if (!this.model) throw new Error("Model not provided and no suggested fallback found.");

    this.defaultParams = {};
    if (options.temperature !== undefined) this.defaultParams.temperature = options.temperature;
    if (options.maxTokens   !== undefined) this.defaultParams.maxTokens   = options.maxTokens;
    if (options.topP        !== undefined) this.defaultParams.topP        = options.topP;
    if (options.topK        !== undefined) this.defaultParams.topK        = options.topK;

    this.history = [];
    if (options.systemPrompt) {
      // Solo OpenAI usa role system tra i due provider rimasti; per Google lo inseriamo come primo user
      if (this.provider === "openai") {
        this.history.push({ role: "system", content: options.systemPrompt });
      } else {
        this.history.push({ role: "user", content: options.systemPrompt });
      }
    }
  }

  setProvider(provider) { this.provider = provider.toLowerCase(); }
  setModel(model) { this.model = model; }
  listSuggested() { return LLM.SuggestedModels[this.provider] || []; }
  reset() { this.history = []; }

  /**
   * @param {string|Array<{role:string, content:string}>} message
   * @param {object} params { temperature?, maxTokens?, topP?, topK? }
   * @returns {Promise<string>}
   */
  async chat(message, params = {}) {
    let conversation;
    const isBatch = Array.isArray(message);
    if (isBatch) {
      conversation = message;
    } else if (typeof message === "string") {
      conversation = this.history;
      conversation.push({ role: "user", content: message });
    } else {
      throw new Error("message must be string or array");
    }

    const cfg = { ...this.defaultParams, ...params };
    const headers = { "Content-Type": "application/json" };
    let url = "", body = {};

    switch (this.provider) {
      case "openai": {
        url = "https://api.openai.com/v1/chat/completions";
        headers.Authorization = "Bearer " + this.apiKey;
        body = { model: this.model, messages: conversation };
        if (cfg.temperature !== undefined) body.temperature = cfg.temperature;
        if (cfg.maxTokens   !== undefined) body.max_tokens  = cfg.maxTokens;
        if (cfg.topP        !== undefined) body.top_p       = cfg.topP;
        break;
      }
      case "google": {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
        headers["x-goog-api-key"] = this.apiKey;
        const contents = conversation.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: String(m.content ?? "") }]
        }));
        body = { contents };
        if (cfg.temperature !== undefined) body.temperature       = cfg.temperature;
        if (cfg.topP        !== undefined) body.topP              = cfg.topP;
        if (cfg.topK        !== undefined) body.topK              = cfg.topK;
        if (cfg.maxTokens   !== undefined) body.maxOutputTokens   = cfg.maxTokens;
        break;
      }
      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      let errText = "";
      try { errText = await res.text(); } catch (_) { errText = res.statusText; }
      throw new Error(`API error ${res.status}: ${errText}`);
    }
    const data = await res.json();

    let assistant = "";
    switch (this.provider) {
      case "openai":
        assistant = data?.choices?.[0]?.message?.content ?? "";
        break;
      case "google": {
        const parts = data?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) assistant = parts.map(p => p?.text || "").join("");
        break;
      }
    }

    if (!isBatch) {
      this.history.push({ role: "assistant", content: assistant });
    }
    return assistant;
  }
}

// Expose globally (browser)
if (typeof window !== "undefined") window.LLM = LLM;
export default LLM;

/*
-------------------------------------------------
Developed by: Alessandro Ciciarelli
IntelligenzaArtificialeItalia.net

   /\_/\
  ( o.o )  Simple. Focused. Extensible.
   > ^ <

-------------------------------------------------
*/
