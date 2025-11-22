import { type ToolSet } from "ai";
import { searchWeb } from "./searchWeb";
import { vectorizeSearch } from "./vectorizeSearch";
import { peopleFinder } from "./peopleFinder";
import { emailFinder } from "./emailFinder";

export { searchWeb } from "./searchWeb";
export { vectorizeSearch } from "./vectorizeSearch";
export { peopleFinder } from "./peopleFinder";
export { emailFinder } from "./emailFinder";

export const tools = { searchWeb, vectorizeSearch, peopleFinder, emailFinder } satisfies ToolSet;

