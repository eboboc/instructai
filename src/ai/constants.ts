const env = (typeof import.meta !== 'undefined' && typeof import.meta.env === 'object') ? import.meta.env : process.env;

export const DEFAULT_MODEL = env.VITE_OPENAI_MODEL ?? 'gpt-4o-mini';
export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
