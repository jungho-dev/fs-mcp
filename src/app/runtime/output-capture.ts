/**
 * @file src/app/runtime/output-capture.ts
 * @description Runtime output capture helpers.
 * @author JUNGHO
 * @since 2026-05-02
 */

export function sanitizeError(error: unknown): { message: string; code?: string } {
  let message = "Unknown error";
  let code: string | undefined;

  if (error instanceof Error) {
    message = `${error.name}: ${error.message}`;
    if ("code" in error) {
      code = String((error as { code?: unknown }).code);
    }
  } else if (typeof error === "string") {
    message = error;
  }

  message = message.replace(/(?:\/|\\)[\w\d_.\-/\\]+/g, "<path>");
  message = message.replace(/[A-Za-z]:\\[\w\d_.\-/\\]+/g, "<path>");

  return { message, code };
}

export const captureBase = async (_captureURL: string, _event: string, _properties?: unknown): Promise<void> => {};

export const capture = async (_event: string, _properties?: unknown): Promise<void> => {};
