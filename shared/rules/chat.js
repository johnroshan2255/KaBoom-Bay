import { CHAT_MAX_LEN } from "../constants.js";

/**
 * Chat hygiene shared by server and client: trims, strips control characters, caps the length and masks
 * profanity (CrazyGames requires a filter on any chat). The word list is deliberately small and English;
 * matching normalises leet-speak (0/1/3/4/5/7/@/$) and repeated letters so "sh1iit" is still caught.
 */
const BAD = [
  "fuck", "shit", "bitch", "asshole", "bastard", "cunt", "dick", "pussy", "whore", "slut", "nigger", "nigga", "faggot", "fag",
  "retard", "wanker", "motherfucker", "cock", "twat", "kys", "rape",
];
const LEET = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i" };

function normalizeWord(w) {
  return w.toLowerCase().replace(/[013457@$!]/g, (c) => LEET[c]).replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1");
}

/** Replaces every offending word with asterisks, keeping length and punctuation. */
export function filterProfanity(text) {
  return text.replace(/[^\s]+/g, (word) => {
    const n = normalizeWord(word);
    return n && BAD.some((b) => n === b || (n.length >= b.length + 1 && (n.startsWith(b) || n.endsWith(b)))) ? "*".repeat(word.length) : word;
  });
}

/** Cleans a raw chat string; returns "" when nothing printable remains. */
export function sanitizeChat(text) {
  if (typeof text !== "string") return "";
  const cleaned = text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f]/g, "").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_LEN);
  return cleaned ? filterProfanity(cleaned) : "";
}
