import z from "zod";
export const ReceptionResultSchema = z.object({
    type: z.literal(['chat']),
    reply: z.string()
}).or(z.object({
    type: z.literal(['run_agent_prompt', 'build_task']),
    context_summary: z.string(),
    user_request: z.string(),
})).or(z.object({
    type: z.literal(['run_task']),
    arguments: z.record(z.string(), z.string()),
}));
