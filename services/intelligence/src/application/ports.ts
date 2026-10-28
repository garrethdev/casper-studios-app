import type { RawDetection } from '../domain/detection';

export interface PreparedImage {
  /** Always JPEG: every upload is re-encoded, whatever it claimed to be. */
  mediaType: 'image/jpeg';
  dataBase64: string;
  width: number;
  height: number;
  bytes: number;
}

/** The cleaned input that analyzers see. Nothing here identifies a user. */
export interface PreparedInput {
  image?: PreparedImage;
  /** Normalized description. It is data: it is never run, and never joined to a system prompt. */
  text?: string;
  /** True when the text contained phrases that look like instructions to an AI. */
  textSuspicious: boolean;
}

/** Port: anything that can look at a meal and say what is in it. */
export interface MealAnalyzer {
  readonly provider: 'anthropic' | 'text-parser';
  analyze(input: PreparedInput): Promise<RawDetection>;
}

export interface RephraseInput {
  headline: string;
  tips: string[];
  /** The only facts the model may draw on. */
  snippets: { id: string; text: string }[];
}

export interface RephraseOutput {
  headline: string;
  tips: string[];
}

/** Port: optionally rewords template feedback in a warmer voice. Failure is always safe. */
export interface FeedbackRephraser {
  rephrase(input: RephraseInput): Promise<RephraseOutput>;
}
