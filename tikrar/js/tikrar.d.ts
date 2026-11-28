export declare const VERSION: string;
export type Kind = "talqin" | "wasl" | "sard";
export interface Unit { id?: string; start: number; end: number }
export interface Options { talqin?: number; wasl?: number; sard?: number; link?: "cumulative" | "previous"; mode?: "repeat" | "listen"; gap?: number | "manual"; speed?: number }
export interface Step { kind: Kind; from: number; to: number; reps: number; start: number; end: number }
export type Action =
  | { type: "play"; step: number; rep: number; start: number; end: number; rate: number }
  | { type: "wait"; ms: number; step: number; rep: number }
  | { type: "await"; step: number; rep: number }
  | { type: "done" };
export interface Progress { step: number; steps: number; rep: number; reps: number; phase: "idle" | "playing" | "gap" | "waiting" | "done"; remainingMs: number; totalMs: number }
export declare const DEFAULTS: Readonly<Required<Options>>;
export declare function normalize(options?: Options): Required<Options>;
export declare function groupUnits(ayahs: Unit[], size?: number): Required<Unit>[];
export declare function plan(units: Unit[], options?: Options): Step[];
export declare function heardMs(step: Step, options?: Options): number;
export declare function gapMs(step: Step, options?: Options): number;
export declare function remainingMs(steps: Step[], options?: Options, stepIndex?: number, repsDone?: number): number;
export declare function totalMs(steps: Step[], options?: Options): number;
export declare function locate(segments: { start: number; end: number }[], ms: number): number;
export declare class Session {
  constructor(units: Unit[], options?: Options);
  readonly options: Required<Options>; readonly steps: Step[]; step: number; rep: number; action: Action | null;
  readonly progress: Progress;
  start(): Action; ended(): Action | null; resume(): Action | null;
  next(): Action | null; previous(): Action | null; restart(): Action | null; goTo(stepIndex: number): Action | null;
}
export declare function planText(steps: Step[]): string;
export declare function actionText(action: Action | null): string;
