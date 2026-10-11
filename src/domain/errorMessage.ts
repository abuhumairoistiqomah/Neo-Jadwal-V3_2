export function getErrorMessage(error: unknown, fallback = "Terjadi kesalahan yang tidak dikenal."): string {
  if (error == null) return fallback;
  if (typeof error === "string") return error.trim() || fallback;
  // Supabase's PostgrestError can extend Error. Preserve its .details, .hint
  // and .code instead of returning only .message via instanceof Error.
  if (typeof error === "object") {
    const value = error as Record<string, unknown>;
    const parts = [
      value.message,
      value.error_description,
      value.details,
      value.hint,
      value.code ? `Kode: ${String(value.code)}` : null,
    ]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean);

    if (parts.length > 0) return [...new Set(parts)].join(" • ");

    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== "{}") return serialized;
    } catch {
      // Fall through to the generic fallback.
    }
  }

  if (error instanceof Error) return error.message.trim() || fallback;
  return fallback;
}

export function isMissingRpcError(error: unknown, functionName?: string): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as Record<string, unknown>;
  const code = String(value.code || "").toUpperCase();
  const message = getErrorMessage(error, "").toLocaleLowerCase("id-ID");
  const target = String(functionName || "").toLocaleLowerCase("id-ID");
  return (
    code === "PGRST202" ||
    message.includes("could not find the function") ||
    message.includes("function") && message.includes("schema cache")
  ) && (!target || message.includes(target));
}
