// gpt-oss sometimes emits its training-time citation style 【3†L1-L4】 despite the
// prompt. Normalize deterministically: in the UI at render time (a marker can be
// split across stream chunks) and on the server before saving.
export const normalizeCitations = (text: string) => text.replace(/【(\d+)†[^】]*】/g, "[$1]");
