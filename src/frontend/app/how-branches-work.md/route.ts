import { BRANCHES_MD, markdownResponse } from "@/data/agentDocs";

export function GET() {
  return markdownResponse(BRANCHES_MD);
}
