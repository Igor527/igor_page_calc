import React, { useState } from 'react';

export type SetupWizardStep = {
  title: string;
  summary: string;
  content: React.ReactNode;
  more?: React.ReactNode;
};

type SetupWizardProps = {
  steps: SetupWizardStep[];
  hidden?: boolean;
};

const SetupWizard: React.FC<SetupWizardProps> = ({ steps, hidden }) => {
  const [step, setStep] = useState(0);

  if (hidden || steps.length === 0) return null;

  const current = steps[Math.min(step, steps.length - 1)];

  return (
    <section className="setup-wizard" aria-label="Пошаговая настройка">
      <div className="setup-wizard__progress" role="tablist" aria-label="Шаги настройки">
        {steps.map((s, i) => (
          <button
            key={s.title}
            type="button"
            role="tab"
            aria-selected={i === step}
            aria-current={i === step ? 'step' : undefined}
            className={`setup-wizard__step-btn${i === step ? ' is-active' : ''}${i < step ? ' is-done' : ''}`}
            onClick={() => setStep(i)}
          >
            <span className="setup-wizard__step-num">{i + 1}</span>
            <span className="setup-wizard__step-label">{s.title}</span>
          </button>
        ))}
      </div>
      <div className="setup-wizard__panel">
        <h2 className="setup-wizard__title">{current.title}</h2>
        <p className="setup-wizard__summary">{current.summary}</p>
        <div className="setup-wizard__body">{current.content}</div>
        {current.more && (
          <details className="setup-wizard__more">
            <summary>Подробнее</summary>
            <div className="setup-wizard__more-body">{current.more}</div>
          </details>
        )}
        <div className="setup-wizard__nav">
          <button
            type="button"
            className="outline setup-wizard__nav-btn"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            ← Назад
          </button>
          {step < steps.length - 1 ? (
            <button type="button" className="primary setup-wizard__nav-btn" onClick={() => setStep((s) => s + 1)}>
              Далее →
            </button>
          ) : (
            <span className="setup-wizard__hint">Готово — используйте форму ниже.</span>
          )}
        </div>
      </div>
    </section>
  );
};

export default SetupWizard;
