// @ts-check
// The provider and model every signed-in user's text AI call uses (F-706.4, D52 "Gemini for text by default").
// Changing it is a code change: the model must be in the spend price table, else calls answer 503 (unpriced).
import { defaultModelOf } from "./catalog.js";

export const SHARED_TEXT = Object.freeze({
  provider: /** @type {const} */ ("gemini"),
  model: /** @type {string} */ (defaultModelOf("gemini")),
});
