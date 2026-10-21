import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readForwardedAccessIdentity } from "../lib/auth/cloudflare-access.ts";

// Keep the existing app-facing API while using the export's independent login.
export type ChatGPTUser = { userId: string; displayName: string; email: string; fullName: string | null };

export async function getChatGPTUser(): Promise<ChatGPTUser | null> {
  const identity = readForwardedAccessIdentity(await headers());
  if (!identity) return null;
  return { ...identity, fullName: identity.fullName ?? null, displayName: identity.fullName ?? identity.email };
}

export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (user) return user;
  redirect(chatGPTSignInPath(returnTo));
}

export function chatGPTSignInPath(returnTo: string): string {
  // Visiting the protected resource starts the edge-managed Access login flow.
  // Do not invent a team-domain login URL or depend on a ChatGPT callback.
  return safeRelativeReturnPath(returnTo);
}
export function chatGPTSignOutPath(returnTo = "/"): string {
  return `/cdn-cgi/access/logout?redirect_url=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}
function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || url.pathname.startsWith("/cdn-cgi/access/") || ["/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"].includes(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/"; }
}
