import * as React from "react";
import { CanvasHeading, CanvasLead } from "./content-canvas";
import { EditorialHeading, EditorialLead } from "./content-editorial";
import { SectionHeading, SectionLead } from "./docs";
import {
  HOME_SCENARIOS,
  homeScenarioById,
  runHomeScenario,
  scenarioRunDisabled,
  scenarioStepDelayMs,
  type HomeScenario,
  type HomeScenarioId,
  type ScenarioHost,
} from "./home-scenarios";
import type { HomeSkin } from "./page";

export interface ScenariosPaneProps {
  skin: HomeSkin;
  host: ScenarioHost;
  atDefaults: boolean;
  snapshotHeld: boolean;
  onRestore: () => void;
}

function Heading({
  skin,
  children,
}: {
  skin: HomeSkin;
  children: string;
}): React.ReactElement {
  if (skin === "editorial") {
    return <EditorialHeading>{children}</EditorialHeading>;
  }
  if (skin === "canvas") {
    return <CanvasHeading>{children}</CanvasHeading>;
  }
  return <SectionHeading>{children}</SectionHeading>;
}

function Lead({
  skin,
  children,
}: {
  skin: HomeSkin;
  children: React.ReactNode;
}): React.ReactElement {
  if (skin === "editorial") {
    return <EditorialLead>{children}</EditorialLead>;
  }
  if (skin === "canvas") {
    return <CanvasLead>{children}</CanvasLead>;
  }
  return <SectionLead>{children}</SectionLead>;
}

function buttonClass(skin: HomeSkin, disabled: boolean): string {
  if (disabled) {
    return skin === "mosaic"
      ? "rounded px-2 py-1 text-left text-[15px] font-medium text-stone-500"
      : skin === "canvas"
        ? "rounded px-2 py-1 text-left font-mono text-[12px] uppercase tracking-[0.12em] text-slate-300"
        : "rounded px-2 py-1 text-left text-[15px] text-[#b5aa94]";
  }
  return skin === "mosaic"
    ? "rounded px-2 py-1 text-left text-[15px] font-medium text-stone-100 underline decoration-amber-400/40 underline-offset-[3px] hover:text-amber-100"
    : skin === "canvas"
      ? "rounded px-2 py-1 text-left font-mono text-[12px] uppercase tracking-[0.12em] text-cyan-700 underline decoration-cyan-300 underline-offset-[3px]"
      : "rounded px-2 py-1 text-left text-[15px] text-[#241f17] underline decoration-[#bcae90] underline-offset-[3px]";
}

export function ScenariosPane({
  skin,
  host,
  atDefaults,
  snapshotHeld,
  onRestore,
}: ScenariosPaneProps): React.ReactElement {
  const [runningId, setRunningId] = React.useState<HomeScenarioId | null>(
    null,
  );
  const [lines, setLines] = React.useState<ReadonlyArray<string>>([]);
  const [finalLine, setFinalLine] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const hostRef = React.useRef<ScenarioHost>(host);
  hostRef.current = host;

  React.useEffect((): (() => void) => {
    return (): void => {
      abortRef.current?.abort();
    };
  }, []);

  const start = (id: HomeScenarioId): void => {
    if (scenarioRunDisabled(id, atDefaults, runningId != null)) {
      return;
    }
    abortRef.current?.abort();
    const controller: AbortController = new AbortController();
    abortRef.current = controller;
    const scenario: HomeScenario = homeScenarioById(id);
    setRunningId(id);
    setLines([]);
    setFinalLine(null);
    void runHomeScenario(scenario, hostRef.current, {
      stepMs: scenarioStepDelayMs(),
      signal: controller.signal,
      onStep: (line: string): void => {
        setLines((current: ReadonlyArray<string>): ReadonlyArray<string> => [
          ...current,
          line,
        ]);
      },
      onDetail: (line: string): void => {
        setLines((current: ReadonlyArray<string>): ReadonlyArray<string> => [
          ...current,
          line,
        ]);
      },
      onFinal: (line: string): void => {
        setFinalLine(line);
        setRunningId(null);
      },
    }).catch((): void => {
      if (abortRef.current === controller) {
        setRunningId(null);
      }
    });
  };

  const logClass: string =
    skin === "mosaic"
      ? "font-mono text-[12px] leading-relaxed text-stone-300"
      : skin === "canvas"
        ? "font-mono text-[12px] leading-relaxed text-slate-700"
        : "font-mono text-[12px] leading-relaxed text-[#3a3327]";

  return (
    <div className="flex flex-col gap-4">
      <Heading skin={skin}>Scenarios</Heading>
      <ul className="flex flex-col gap-3">
        {HOME_SCENARIOS.map(
          (scenario: HomeScenario): React.ReactElement => {
            const disabled: boolean = scenarioRunDisabled(
              scenario.id,
              atDefaults,
              runningId != null,
            );
            return (
              <li key={scenario.id} className="flex flex-col gap-1">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(): void => {
                    start(scenario.id);
                  }}
                  className={buttonClass(skin, disabled)}
                >
                  {scenario.title}
                </button>
                <Lead skin={skin}>{scenario.description}</Lead>
              </li>
            );
          },
        )}
      </ul>
      {snapshotHeld ? (
        <button
          type="button"
          onClick={onRestore}
          className={buttonClass(skin, false)}
        >
          Restore
        </button>
      ) : null}
      {lines.length > 0 ? (
        <pre className={logClass}>
          {lines.join("\n")}
          {finalLine != null ? `\n${finalLine}` : ""}
        </pre>
      ) : null}
    </div>
  );
}
