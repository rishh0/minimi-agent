// gpt-oss sometimes emits its training-time citation style despite the prompt:
// 【3†L1-L4】, 【3】, or even 【Memory】. Normalize deterministically: numbered markers
// become [3]; anything else in 【】 is dropped. Applied in the UI at render time (a
// marker can be split across stream chunks) and on the server before saving.
export const normalizeCitations = (text: string) =>
  text.replace(/【(\d+)(?:†[^】]*)?】/g, "[$1]").replace(/【[^】]*】/g, "");
