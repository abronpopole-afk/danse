import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/tauri";

async function throwIfResNotOk(res: Response | { ok: boolean; statusText: string }) {
  if (!res.ok) {
    const text = 'json' in res ? (await (res as Response).json()).message : (res as any).statusText;
    throw new Error(text);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<any> {
  if (url.startsWith("/api")) {
    const command = url.replace("/api/", "").replace(/\//g, "_").replace(/-/g, "_");
    try {
      const result = await invoke(command, { updates: data, config: data, params: data });
      return { ok: true, json: () => Promise.resolve(result) };
    } catch (error) {
      return { ok: false, statusText: String(error) };
    }
  }

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

export const getQueryFn: <T>(options: {
  on401: "returnNull" | "throw";
}) => QueryFunction<T> =
  () =>
  async ({ queryKey }) => {
    const url = "/" + queryKey.join("/");
    if (url.startsWith("/api")) {
      const command = url.replace("/api/", "").replace(/\//g, "_").replace(/-/g, "_");
      return await invoke(command);
    }

    const res = await fetch(url, {
      credentials: "include",
    });

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
