"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { countWords } from "@/lib/ux/nav";
import { isSaveShortcut, wordsLabel } from "@/lib/ux/writing";
import { COAUTHOR_ATTACH_EVENT, type AttachDetail } from "@/lib/coauthor/ui";
import {
  formatMark,
  parseEditorMarks,
  removeMark,
  type MarkKind,
} from "@/lib/chapters/editorMarks";
import { useRouter } from "next/navigation";

export default function DraftEditor({
  projectId,
  chapterId,
  initialText,
}: {
  projectId: string;
  chapterId: string;
  initialText: string;
}) {
  const router = useRouter();

  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const [focusMode, setFocusMode] = useState(false);

  // уведомления дополняют строки статуса рядом с кнопками, а не заменяют их
  useEffect(() => {
    if (error) toast.error(error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  useEffect(() => {
    if (saved) toast.success("Черновик сохранён");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  // режим письма: Esc выходит, прокрутка страницы под редактором отключена
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFocusMode(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [focusMode]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Предупреждение при закрытии страницы с несохранённым текстом.
  const dirty = !saved && text !== initialText;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const [pending, setPending] = useState<{
    kind: MarkKind;
    start: number;
    end: number;
    fragment: string;
  } | null>(null);
  const [markComment, setMarkComment] = useState("");
  const marks = useMemo(() => parseEditorMarks(text), [text]);
  const [revising, setRevising] = useState(false);
  const [proposal, setProposal] = useState<{
    revisedText: string;
    remarks: string | null;
  } | null>(null);
  const templates = [
    {
      title: "Свободные заметки",
      text: "ЗАМЫСЕЛ И МЫСЛИ\n\nЧто происходит:\n\nЧто важно не забыть:\n\nВопросы к себе:\n",
    },
    {
      title: "Шаблон сцены",
      text: "СЦЕНА\n\nМесто и время:\n\nУчастники:\n\nЦель сцены:\n\nЧто происходит по шагам:\n1. \n2. \n3. \n\nЧто меняется к концу сцены:\n\nАтмосфера и ощущения:\n\nСвязь с лором и Canon:\n",
    },
    {
      title: "Описание мира",
      text: "ЗАМЕТКА О МИРЕ\n\nОбъект / место / государство:\n\nОписание:\n\nТехнологии и материалы:\n\nКультура и быт:\n\nК какому месту и периоду относится:\n\nИсточник или основание факта:\n\nСтатус: требует проверки автором\n",
    },
    {
      title: "Диалог",
      text: "ДИАЛОГ\n\nМесто и ситуация:\n\nУчастники и их цели:\n\n— Реплика персонажа.\n— Ответ.\n\nЧто персонажи не говорят прямо:\n\nЧто меняется после разговора:\n",
    },
  ];

  function insertTemplate(template: string) {
    setText((current) =>
      current.trim()
        ? current.replace(/\s*$/, "") + "\n\n" + template
        : template
    );
    setSaved(false);
    setError("");
  }

  function beginMark(kind: MarkKind) {
    const field = textareaRef.current;
    if (!field) return;

    const start = field.selectionStart;
    const end = field.selectionEnd;

    if (start === end) {
      setError("Сначала выдели в тексте фрагмент, к которому нужна пометка.");
      return;
    }

    setError("");
    setMarkComment("");
    setPending({ kind, start, end, fragment: text.slice(start, end) });
  }

  /** Отправляет выделенный фрагмент в панель Соавтора. Текст главы не меняется. */
  function discussWithCoauthor() {
    const field = textareaRef.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    if (start === end) {
      setError("Сначала выдели в тексте фрагмент, который нужно обсудить с Соавтором.");
      return;
    }
    setError("");
    const detail: AttachDetail = {
      chapterId,
      text: text.slice(start, end),
      start,
      end,
      unsaved: !saved && text !== initialText,
    };
    window.dispatchEvent(new CustomEvent(COAUTHOR_ATTACH_EVENT, { detail }));
  }

  function confirmMark() {
    if (!pending) return;

    if (pending.kind !== "ПЕРЕПИСАТЬ" && !markComment.trim()) {
      setError("Напиши комментарий или вопрос.");
      return;
    }

    const mark = formatMark(pending.kind, pending.fragment, markComment);
    setText(text.slice(0, pending.start) + mark + text.slice(pending.end));
    setPending(null);
    setMarkComment("");
    setSaved(false);
    setError("");
  }

  function dropMark(index: number) {
    const mark = marks[index];
    if (!mark) return;
    setText(removeMark(text, mark));
    setSaved(false);
  }

  function showMark(index: number) {
    const mark = marks[index];
    const field = textareaRef.current;
    if (!mark || !field) return;
    field.focus();
    field.setSelectionRange(mark.start, mark.end);
  }

  async function handleRevise() {
    setRevising(true);
    setProposal(null);
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}/revise`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftText: text }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Не удалось доработать черновик.");
        return;
      }

      setProposal({
        revisedText: data.revisedText,
        remarks: data.remarks ?? null,
      });
    } catch (error) {
      console.error(error);
      setError("Ошибка соединения с сервером.");
    } finally {
      setRevising(false);
    }
  }

  async function handleAccept() {
    if (!proposal) return;
    setSaving(true);
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftText: proposal.revisedText }),
        }
      );
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Не удалось сохранить черновик.");
        return;
      }

      setText(proposal.revisedText);
      setProposal(null);
      setSaved(true);
      router.refresh();
    } catch (error) {
      console.error(error);
      setError("Ошибка соединения с сервером.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const response = await fetch(
        `/api/projects/${projectId}/chapters/${chapterId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            draftText: text,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(
          data.error ||
            "Не удалось сохранить черновик."
        );
        return;
      }

      setSaved(true);
      router.refresh();
    } catch (error) {
      console.error(error);

      setError(
        "Ошибка соединения с сервером."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14, padding: 14, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Шаблоны черновика</div>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
          Выбирай подходящую болванку или просто пиши как удобно. Шаблон добавляется в конец текста и не удаляет уже написанное.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {templates.map((template) => (
            <button
              key={template.title}
              type="button"
              onClick={() => insertTemplate(template.text)}
              style={{
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--surface)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              + {template.title}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginBottom: 10, padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface-2)" }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Пометки редактора</div>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
          Выдели фрагмент в тексте и нажми кнопку. Пометка попадёт в текст, а «Доработать по заметкам» учтёт её и вернёт чистый текст.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {([
            ["КОММЕНТАРИЙ", "💬 Комментарий"],
            ["ВОПРОС", "❓ Вопрос"],
            ["ПЕРЕПИСАТЬ", "✂️ Переписать"],
          ] as [MarkKind, string][]).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              onClick={() => beginMark(kind)}
              style={{ padding: "8px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", cursor: "pointer", fontSize: 13 }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={discussWithCoauthor}
            title="Откроет панель Соавтора с выделенным фрагментом. Текст главы не изменится."
            style={{ padding: "8px 12px", border: "1px solid var(--info-border)", borderRadius: 8, background: "var(--info-bg)", cursor: "pointer", fontSize: 13 }}
          >
            🤝 Обсудить с Соавтором
          </button>
        </div>

        {pending && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--info-border)" }}>
            <div style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 8 }}>
              {pending.kind} к фрагменту: «{pending.fragment.length > 160 ? pending.fragment.slice(0, 160) + "…" : pending.fragment}»
            </div>
            <input
              autoFocus
              value={markComment}
              onChange={(event) => setMarkComment(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") confirmMark();
                if (event.key === "Escape") setPending(null);
              }}
              placeholder={pending.kind === "ПЕРЕПИСАТЬ" ? "Как переписать (необязательно)" : pending.kind === "ВОПРОС" ? "Твой вопрос" : "Твой комментарий"}
              style={{ width: "100%", padding: 10, boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 8, fontSize: 14 }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" onClick={confirmMark} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--primary)", color: "var(--on-primary)", cursor: "pointer", fontSize: 13 }}>
                Добавить пометку
              </button>
              <button type="button" onClick={() => setPending(null)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontSize: 13 }}>
                Отмена
              </button>
            </div>
          </div>
        )}

        {marks.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Пометок в тексте: {marks.length}. Перед утверждением главы их нужно разобрать.
            </div>
            {marks.map((mark, index) => (
              <div key={index} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderTop: "1px solid var(--border-soft)", fontSize: 13, lineHeight: 1.5 }}>
                <div style={{ flex: 1 }}>
                  <strong>{mark.kind}</strong> · «{mark.fragment.length > 120 ? mark.fragment.slice(0, 120) + "…" : mark.fragment}»
                  {mark.comment ? <div style={{ color: "var(--text-2)" }}>{mark.comment}</div> : null}
                </div>
                <button type="button" onClick={() => showMark(index)} style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", cursor: "pointer", fontSize: 12 }}>
                  Показать
                </button>
                <button type="button" onClick={() => dropMark(index)} style={{ padding: "4px 8px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface)", cursor: "pointer", fontSize: 12 }}>
                  ✕ Убрать
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div
        className={focusMode ? "theme-user" : undefined}
        style={focusMode ? { position: "fixed", inset: 0, zIndex: 70, background: "var(--bg)", display: "flex", flexDirection: "column" } : undefined}
      >
        {focusMode ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "10px 20px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
            <strong>Режим письма</strong>
            <span style={{ color: "var(--muted)", fontSize: 14 }}>{wordsLabel(countWords(text))}</span>
            <span style={{ fontSize: 14, color: saved ? "var(--ok-text)" : "var(--faint)" }}>{saving ? "Сохраняю…" : saved ? "✓ Сохранено" : text === initialText ? "" : "Есть несохранённые изменения"}</span>
            <span style={{ flex: 1 }} />
            <button type="button" className="sa-btn sa-btn-primary" onClick={handleSave} disabled={saving}>
              Сохранить <small style={{ opacity: 0.7 }}>Ctrl S</small>
            </button>
            <button type="button" className="sa-btn" onClick={() => setFocusMode(false)}>
              Выйти <small style={{ opacity: 0.7 }}>Esc</small>
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 12 }}>
            <span style={{ color: "var(--muted)", fontSize: 14 }}>{wordsLabel(countWords(text))}</span>
            <button type="button" className="sa-btn" onClick={() => setFocusMode(true)} title="Скрыть всё, кроме текста">
              🖋 Режим письма
            </button>
          </div>
        )}
        <textarea
          ref={textareaRef}
        value={text}
        onKeyDown={(event) => {
          if (isSaveShortcut(event)) {
            event.preventDefault();
            if (!saving) void handleSave();
          }
        }}
        onChange={(event) => {
          setText(event.target.value);
          setSaved(false);
        }}
        style={
          focusMode
            ? {
                flex: 1,
                width: "100%",
                maxWidth: 780,
                margin: "0 auto",
                padding: "36px 20px 80px",
                boxSizing: "border-box",
                border: 0,
                borderRadius: 0,
                resize: "none",
                fontFamily: "var(--font-read), Georgia, serif",
                fontSize: 19,
                lineHeight: 1.85,
                color: "var(--text)",
                background: "transparent",
                outline: "none",
              }
            : {
                width: "100%",
                minHeight: 700,
                padding: 20,
                boxSizing: "border-box",
                border: "1px solid var(--border)",
                borderRadius: 10,
                resize: "vertical",
                fontFamily: "var(--font-read), Georgia, serif",
                fontSize: 17,
                lineHeight: 1.8,
                color: "var(--text)",
                background: "var(--surface)",
                outline: "none",
              }
        }
        placeholder="Черновик главы появится здесь..."
      />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginTop: 14,
        }}
      >
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "11px 18px",
            borderRadius: 8,
            border: "none",
            background: saving
              ? "var(--surface-3)"
              : "var(--primary)",
            color: "var(--on-primary)",
            cursor: saving
              ? "default"
              : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {saving
            ? "⏳ Сохраняем..."
            : "💾 Сохранить изменения"}
        </button>

        <button
          type="button"
          onClick={handleRevise}
          disabled={revising || saving}
          style={{
            padding: "11px 18px",
            borderRadius: 8,
            border: "1px solid var(--info-border)",
            background: "var(--surface)",
            cursor: revising || saving ? "default" : "pointer",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {revising ? "⏳ AI дорабатывает..." : "✨ Доработать по заметкам"}
        </button>

        {saved && (
          <span
            style={{
              color: "var(--ok-text)",
              fontSize: 14,
              fontWeight: 600,
            }}
          >
            ✓ Сохранено
          </span>
        )}

        {error && (
          <span
            style={{
              color: "var(--danger-text)",
              fontSize: 14,
            }}
          >
            {error}
          </span>
        )}
      </div>

      {proposal && (
        <div
          style={{
            marginTop: 20,
            padding: 18,
            border: "2px solid var(--info-border)",
            borderRadius: 12,
            background: "var(--info-bg)",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Предложенная версия главы</h3>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.5 }}>
            Это предложение, черновик пока не изменён. Если принять, текст главы
            заменится этой версией, а блок заметок исчезнет (он уже вплетён в
            текст).
          </p>

          {proposal.remarks && (
            <div
              style={{
                margin: "12px 0",
                padding: 12,
                borderRadius: 8,
                background: "var(--warn-bg)",
                border: "1px solid var(--warn-border)",
                whiteSpace: "pre-wrap",
                fontSize: 14,
              }}
            >
              <strong>⚠️ Замечания AI:</strong>
              {"\n"}
              {proposal.remarks}
            </div>
          )}

          <textarea
            readOnly
            value={proposal.revisedText}
            style={{
              width: "100%",
              minHeight: 400,
              padding: 16,
              boxSizing: "border-box",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontFamily: "var(--font-read), Georgia, serif",
              fontSize: 16,
              lineHeight: 1.7,
              background: "var(--surface)",
            }}
          />

          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            <button
              type="button"
              onClick={handleAccept}
              disabled={saving}
              style={{
                padding: "11px 18px",
                borderRadius: 8,
                border: "none",
                background: "var(--primary)",
                color: "var(--on-primary)",
                cursor: "pointer",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              ✓ Принять эту версию
            </button>
            <button
              type="button"
              onClick={() => setProposal(null)}
              style={{
                padding: "11px 18px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Отклонить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
