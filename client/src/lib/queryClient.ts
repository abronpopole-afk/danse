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
  const isApi = url.startsWith("/api");
  if (isApi) {
    const command = url.replace("/api/", "").replace(/\//g, "_").replace(/-/g, "_");
    try {
      // Map frontend data to Tauri command parameters
      const params: any = {};
      if (data) {
        if (typeof data === 'object') {
          Object.assign(params, data);
        } else {
          params.value = data;
        }
      }
      
      const result = await invoke(command, params);
      return { ok: true, json: () => Promise.resolve(result) };
    } catch (error) {
      console.error(`Tauri invoke error [${command}]:`, error);
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
    const url = queryKey[0] as string;
    if (url.startsWith("/api")) {
      const command = url.replace("/api/", "").replace(/\//g, "_").replace(/-/g, "_");
      try {
        return await invoke(command);
      } catch (error) {
        console.error(`Tauri query error [${command}]:`, error);
        throw error;
      }
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
