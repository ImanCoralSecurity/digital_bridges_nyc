// Browser-safe GPT model catalog for the dashboard. These are the selectable
// models exposed by the Codex CLI catalog installed for this deployment.

export interface GptModelOption {
  id: string;
  label: string;
}

export interface GptModelGroup {
  group: string;
  options: GptModelOption[];
}

export const GPT_MODEL_GROUPS: GptModelGroup[] = [
  {
    group: "GPT-5.6",
    options: [
      { id: "gpt-5.6-sol", label: "GPT-5.6 Sol — frontier" },
      { id: "gpt-5.6-terra", label: "GPT-5.6 Terra — balanced" },
      { id: "gpt-5.6-luna", label: "GPT-5.6 Luna — fast" },
    ],
  },
  {
    group: "GPT-5.5",
    options: [{ id: "gpt-5.5", label: "GPT-5.5 — default" }],
  },
  {
    group: "Fast preview",
    options: [{ id: "gpt-5.3-codex-spark", label: "GPT-5.3 Codex Spark" }],
  },
];

export const GPT_MODEL_IDS = GPT_MODEL_GROUPS.flatMap((group) =>
  group.options.map((option) => option.id),
);

export function isSelectableGptModel(model: string): boolean {
  return GPT_MODEL_IDS.includes(model);
}
