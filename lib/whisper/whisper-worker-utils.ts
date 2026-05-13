import type { WhisperErrorCategory } from "./whisper-worker-protocol";

export interface PrintErrClassification {
  shouldForward: boolean;
  category: "abort" | "memory" | "info";
}

const ABORT_PATTERN = /^\s*(abort|Aborted|RuntimeError)/i;
const MEMORY_PATTERN =
  /memory access out of bounds|out of memory|OOM|cannot enlarge memory|failed to allocate|WebAssembly\.Memory/i;

export function classifyPrintErr(msg: string): PrintErrClassification {
  if (!msg) return { shouldForward: false, category: "info" };
  if (ABORT_PATTERN.test(msg)) {
    return { shouldForward: true, category: "abort" };
  }
  if (MEMORY_PATTERN.test(msg)) {
    return { shouldForward: true, category: "memory" };
  }
  return { shouldForward: false, category: "info" };
}

export function toErrorCategory(
  category: PrintErrClassification["category"],
): WhisperErrorCategory {
  switch (category) {
    case "abort":
      return "abort";
    case "memory":
      return "oom";
    default:
      return "runtime";
  }
}
