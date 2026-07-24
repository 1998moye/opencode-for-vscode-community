import { useRef, useState, type KeyboardEvent } from "react";
import type { OpenCodeState, QuestionRequest } from "../../../src/runtime/contracts";
import { t } from "../i18n";
import { useChatStore } from "../store";
import { selectQueuedQuestion } from "./interactionQueue";
import { useConfirmationArrowNavigation } from "./useConfirmationArrowNavigation";

export function QuestionCenter({ state }: { state: OpenCodeState }) {
  const questions = state.questions ?? [];
  const queued = selectQueuedQuestion(questions, state.activeSessionId);
  if (!queued) {
    return null;
  }
  const title = queued.total > 1
    ? `${t(state.locale, "questionCenter")} (${queued.index}/${queued.total})`
    : t(state.locale, "questionCenter");
  return (
    <section className="question-center" aria-label={title}>
      <h2 className="question-center__title">{title}</h2>
      {queued.total > 1 ? (
        <p className="question-center__queue-hint">{t(state.locale, "questionQueueHint")}</p>
      ) : null}
      <QuestionCard key={queued.request.id} request={queued.request} state={state} />
    </section>
  );
}

function QuestionCard({ request, state }: { request: QuestionRequest; state: OpenCodeState }) {
  const dispatch = useChatStore((store) => store.dispatch);
  const [answers, setAnswers] = useState<string[][]>(() => request.questions.map(() => []));
  const [customAnswers, setCustomAnswers] = useState<string[]>(() => request.questions.map(() => ""));
  const submitting = request.status === "submitting";
  const session = state.sessions.find((candidate) => candidate.id === request.sessionId);

  const select = (questionIndex: number, label: string, multiple: boolean | undefined): void => {
    setAnswers((current) => current.map((answer, index) => {
      if (index !== questionIndex) return answer;
      if (!multiple) return [label];
      return answer.includes(label) ? answer.filter((value) => value !== label) : [...answer, label];
    }));
  };

  const resolvedAnswers = request.questions.map((question, index) => {
    const custom = customAnswers[index]?.trim();
    return custom ? [...answers[index]!, custom] : answers[index]!;
  });
  const canConfirm = resolvedAnswers.every((answer) => answer.length > 0);
  const cardRef = useRef<HTMLElement>(null);
  useConfirmationArrowNavigation(cardRef, !submitting);

  const submit = (): void => {
    if (!canConfirm || submitting) {
      return;
    }
    dispatch({ type: "respond-question", requestId: request.id, answers: resolvedAnswers });
  };

  const onCardKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== "Enter" || event.defaultPrevented || submitting) {
      return;
    }
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return;
    }
    if (target instanceof HTMLButtonElement && target.classList.contains("question-card__confirm")) {
      return;
    }
    if (!canConfirm) {
      return;
    }
    if (target instanceof HTMLButtonElement && target.classList.contains("question-card__option")) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <article
      ref={cardRef}
      className="question-card"
      aria-busy={submitting}
      onKeyDown={onCardKeyDown}
    >
      {session ? <div className="question-card__session">{session.title}</div> : null}
      {request.questions.map((question, questionIndex) => (
        <section className="question-card__question" key={`${question.header}-${questionIndex}`}>
          <strong>{question.header}</strong>
          <p>{question.question}</p>
          <div className="question-card__options" role={question.multiple ? "group" : "radiogroup"} aria-label={question.header}>
            {question.options.map((option) => {
              const selected = answers[questionIndex]?.includes(option.label) ?? false;
              return (
                <button
                  key={option.label}
                  type="button"
                  disabled={submitting}
                  className={`question-card__option${selected ? " question-card__option--selected" : ""}`}
                  aria-pressed={selected}
                  onClick={() => select(questionIndex, option.label, question.multiple)}
                >
                  <span>{option.label}</span>
                  <small>{option.description}</small>
                </button>
              );
            })}
          </div>
          {question.custom ? (
            <input
              className="question-card__custom"
              disabled={submitting}
              value={customAnswers[questionIndex] ?? ""}
              placeholder={t(state.locale, "questionOther")}
              onChange={(event) => setCustomAnswers((current) => current.map((value, index) => index === questionIndex ? event.target.value : value))}
            />
          ) : null}
        </section>
      ))}
      <div className="question-card__actions">
        <button
          className="question-card__confirm"
          type="button"
          disabled={submitting || !canConfirm}
          onClick={() => submit()}
        >
          {submitting ? t(state.locale, "questionSubmitting") : t(state.locale, "questionConfirm")}
        </button>
        <button className="question-card__reject" type="button" disabled={submitting} onClick={() => dispatch({ type: "reject-question", requestId: request.id })}>
          {t(state.locale, "questionReject")}
        </button>
      </div>
    </article>
  );
}
