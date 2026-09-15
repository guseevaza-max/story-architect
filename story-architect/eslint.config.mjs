import next from "eslint-config-next";

export default [
  ...next,
  {
    // ── Шлюз канона (ТЗ п. 58) ────────────────────────────────
    // AI-слой не может импортировать модуль записи канона.
    // Нарушение ломает сборку, а не остаётся на усмотрение ревью.
    files: ["src/lib/ai/**/*.ts", "src/lib/ai/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/canon/write", "@/lib/canon/write", "**/lib/canon/write"],
              message:
                "AI не имеет права записи в Canon (ТЗ п. 58). Создайте Proposal через lib/canon/proposals.",
            },
          ],
        },
      ],
    },
  },
];
