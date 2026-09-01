import { McpClient } from "../src/mcp-client.mjs";

let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
const seed = Number(prompt.match(/Start with seed (-?\d+)/)?.[1] ?? 1);
const plan = [
  "take_lantern",
  "enter_house",
  "take_oil",
  "go_workshop",
  "take_fuse",
  "install_fuse",
  "return_keeper_from_workshop",
  "climb_tower",
  "fill_lantern",
  "light_beacon",
];
const client = new McpClient();
try {
  await client.connect();
  let result = await client.callTool("game_start", { seed });
  let payload = result.payload;
  const actions = [];
  for (const action of plan) {
    result = await client.callTool("game_step", { sid: payload.sid, rev: payload.rev, action });
    if (result.isError) throw new Error(result.payload.error);
    payload = result.payload;
    actions.push(action);
  }
  process.stdout.write(
    `${JSON.stringify({
      outcome: payload.end[0],
      turns: payload.rev,
      actions,
      ratings: { fun: 4, clarity: 5 },
      findings: process.env.FAKE_FINDING === "1"
        ? [
            {
              key: "fixture-opening-copy",
              title: "Opening objective needs one clearer sentence",
              severity: 3,
              evidence: "The first scene did not state the repair order.",
            },
          ]
        : [],
    })}\n`,
  );
} finally {
  await client.close();
}
