export type ProfileMode = "storage-state" | "persistent";
export type AuthStatus = "unknown" | "valid" | "expired" | "error";

export type AuthCheck =
  | { status: "valid" }
  | { status: "expired"; reason: string }
  | { status: "unknown"; reason: string };
