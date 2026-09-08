"use client";

/** Shape of the error envelope every Aetheris route handler returns. */
export interface ApiErrorBody {
  error: { code: string; message: string; details?: string };
}

/** Extracts a human-readable message from a failed API response. */
export async function readApiError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const error = (body as { error: unknown }).error;
      if (typeof error === "object" && error !== null) {
        const record = error as { message?: unknown; details?: unknown };
        const parts = [record.message, record.details].filter(
          (part): part is string => typeof part === "string",
        );
        if (parts.length > 0) return parts.join(" ");
      }
    }
  } catch {
    /* body was not JSON */
  }
  return `Request failed with status ${response.status}.`;
}

/** Human decimal string -> base-unit integer string. Returns null when invalid. */
export function toBaseUnits(input: string, decimals: number): string | null {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed === "." || !/^\d*(\.\d*)?$/.test(trimmed)) return null;
  const [whole = "0", fraction = ""] = trimmed.split(".");
  const padded = `${fraction}${"0".repeat(decimals)}`.slice(0, decimals);
  const combined = `${whole}${padded}`.replace(/^0+(?=\d)/, "");
  return combined === "" ? "0" : combined;
}
