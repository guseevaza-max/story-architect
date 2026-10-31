/**
 * Сборка блока «Авторский замысел» для промптов Architect, Scene Planner,
 * Writer и Continuity. Чистая логика без базы данных.
 *
 * Главное правило: если ни замысел, ни применяемые референсы не заданы,
 * блок пустой строкой — поведение генерации остаётся прежним.
 */
import {
  LABELS,
  hasIntentContent,
  type AuthorIntent,
  type AuthorReference,
} from "./schema";

export type DirectionRole =
  | "architect"
  | "scene_planner"
  | "writer"
  | "continuity";

/** Разделитель раздела замечаний, который Writer добавляет при конфликте. */
export const AUTHOR_NOTES_MARKER = "=== ЗАМЕЧАНИЯ ДЛЯ АВТОРА ===";

const HIERARCHY = `ИЕРАРХИЯ ИНСТРУКЦИЙ (при конфликте выше пункт важнее):
1. Системные ограничения и защита Canon.
2. Подтверждённые факты истории.
3. Утверждённый план главы и план сцен.
4. Авторский замысел этой главы.
5. Выбранные референсы и общие авторские предпочтения.
6. Общие настройки генерации.
Замысел определяет только художественное исполнение. Он не разрешает менять утверждённые события, характеры и факты мира. Не придумывай новые важные факты ради эффекта.`;

const ROLE_RULES: Record<DirectionRole, string> = {
  architect: `КАК ИСПОЛЬЗОВАТЬ ЗАМЫСЕЛ (Architect):
Отрази масштаб, драматургию, темп и акценты автора в plotDevelopment, characterDevelopment и mustHappen. Не подменяй идею автора собственным видением.
Если замысел противоречит Canon или подтверждённому состоянию истории, следуй Canon и добавь в openQuestions пункт, начинающийся словами «Конфликт замысла:».`,

  scene_planner: `КАК ИСПОЛЬЗОВАТЬ ЗАМЫСЕЛ (Scene Planner):
Распредели замысел по сценам: где нарастает напряжение, где нужны паузы, где происходят поворотные события и где находится эмоциональный пик. Отрази это в purpose, plan и plannedOutcome сцен. Не меняй утверждённый план главы.
Если замысел противоречит Canon или плану главы, следуй им и добавь в openQuestions пункт, начинающийся словами «Конфликт замысла:».`,

  writer: `КАК ИСПОЛЬЗОВАТЬ ЗАМЫСЕЛ (Writer):
Следуй авторскому видению при написании текста: ритм, масштаб, эмоциональную траекторию и акценты. Применяй приёмы из референсов, не копируя чужие тексты и манеру дословно.
Если выполнить замысел можно только нарушив Canon, подтверждённое состояние истории или утверждённые планы, следуй им, а в самом конце ответа добавь отдельный раздел: строка ${AUTHOR_NOTES_MARKER}, затем краткое описание конфликта. Этот раздел не является частью художественного текста.`,

  continuity: `КАК УЧИТЫВАТЬ ЗАМЫСЕЛ (Continuity):
У автора заданы художественные предпочтения (масштаб, темп, стиль, референсы). Это НЕ факты мира. Не считай нарушением Canon допустимые стилистические решения только потому, что они отличаются от предпочтений автора. Проверяй согласованность текста с Canon, хронологией и состоянием персонажей.`,
};

function line(label: string, value: string | undefined): string | null {
  const clean = value?.trim();
  return clean ? `${label}: ${clean}` : null;
}

function describeReference(reference: AuthorReference): string {
  const head = `- [${LABELS.category[reference.category]}] ${reference.title}${
    reference.source ? ` (источник: ${reference.source})` : ""
  }`;

  const parts = [
    reference.technique?.trim() ? `Приём: ${reference.technique.trim()}` : null,
    reference.instruction?.trim()
      ? `Инструкция автора: ${reference.instruction.trim()}`
      : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? `${head}. ${parts.join(" ")}` : head;
}

export function buildAuthorDirectionBlock({
  intent,
  references,
  role,
}: {
  intent: AuthorIntent | null;
  references: readonly AuthorReference[];
  role: DirectionRole;
}): string {
  const hasContent = hasIntentContent(intent);

  if (!hasContent && references.length === 0) return "";

  const header = `
=====================================================
АВТОРСКИЙ ЗАМЫСЕЛ ГЛАВЫ
(художественное исполнение; это НЕ факты мира)
=====================================================`;

  // Continuity получает только принцип: предпочтения не считаются фактами.
  if (role === "continuity") {
    return `\n${header}\n${ROLE_RULES.continuity}\n`;
  }

  const settings = [
    intent?.scale ? `Масштабность: ${LABELS.scale[intent.scale]}` : null,
    intent?.drama ? `Драматичность: ${LABELS.drama[intent.drama]}` : null,
    intent?.pace ? `Темп: ${LABELS.pace[intent.pace]}` : null,
    intent?.focus ? `Основной акцент: ${LABELS.focus[intent.focus]}` : null,
    line("Желаемый эффект на читателя", intent?.readerEffect),
    line("Эмоциональная траектория главы", intent?.emotionalArc),
    line("Обязательные элементы", intent?.mustInclude),
    line("Чего следует избегать", intent?.avoid),
    line("Композиция и финал", intent?.compositionNotes),
    line("Авторский промпт", intent?.freePrompt),
  ].filter((entry): entry is string => entry !== null);

  const sections = [header.trimStart()];

  if (settings.length > 0) sections.push(settings.join("\n"));

  if (references.length > 0) {
    sections.push(
      `ВЫБРАННЫЕ РЕФЕРЕНСЫ (художественные приёмы автора; не копируй чужие тексты дословно):\n${references
        .map(describeReference)
        .join("\n")}`
    );
  }

  sections.push(HIERARCHY, ROLE_RULES[role]);

  return `\n\n${sections.join("\n\n")}\n`;
}

/**
 * Отделяет раздел «Замечания для автора» от художественного текста.
 * Если в ответе нет раздела или перед ним нет текста, ответ возвращается
 * без изменений.
 */
export function splitAuthorNotes(output: string): {
  text: string;
  notes: string | null;
} {
  const pattern = new RegExp(
    `^[ \\t]*${AUTHOR_NOTES_MARKER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*$`,
    "m"
  );

  const match = pattern.exec(output);

  if (!match) return { text: output, notes: null };

  const text = output.slice(0, match.index).trim();
  const notes = output.slice(match.index + match[0].length).trim();

  if (!text) return { text: output, notes: null };

  return { text, notes: notes || null };
}
