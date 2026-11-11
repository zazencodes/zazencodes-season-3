import { defineHook } from "eve/hooks";
import { recordResearchMessage } from "../lib/research-items";

export default defineHook({
  events: {
    async "message.received"(event, ctx) {
      await recordResearchMessage(ctx.session.id, event.data.message);
    },
  },
});
