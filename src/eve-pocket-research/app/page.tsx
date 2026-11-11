import { AgentChat } from "@/app/_components/agent-chat";
import { listResearchItems } from "@/agent/lib/research-items";

export const dynamic = "force-dynamic";

export default async function Page() {
  const researchItems = await listResearchItems();
  return <AgentChat researchItems={researchItems} />;
}
