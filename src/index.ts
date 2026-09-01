/** dixti — public entry point. See spec/FORMAT.md for the on-disk contract. */

export const FORMAT_VERSION = "0.3.0-draft";

export { parseNotes, renderNote, type Note, type Meta } from "./parse.js";
export { search, terms, type Hit } from "./search.js";
export { buildDictionary, renderDictionary, topicOf } from "./dict.js";
export { planNote, slugTopic, type NoteInput } from "./note.js";
export { adaptFile, derivedId, topicFromPath } from "./adapt.js";
export { planInit, GITATTRIBUTES_LINE } from "./init.js";
export { readNotes, markdownFiles, storeExists } from "./store.js";
