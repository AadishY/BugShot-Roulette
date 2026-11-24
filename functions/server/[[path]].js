// Cloudflare Pages Function: Proxies all /server/* requests to the backend server.
// Supports GET, POST, PUT, DELETE, PATCH, OPTIONS and WebSocket upgrade requests.

const DEFAULT_HF_BACKEND = "https://yoakatsuki-buckshot.hf.space";

export async function onRequest(context) {
  const { request, params, env } = context;
  const url = new URL(request.url);
  
  const backendBase = env?.HF_BACKEND || env?.VITE_HF_BACKEND_URL || env?.VITE_SERVER_URL || DEFAULT_HF_BACKEND;

  // Reconstruct the path: strip the /server prefix
  // params.path is an array of path segments after /server/
  const backendPath = params.path ? params.path.join("/") : "";
  const backendUrl = `${backendBase}/${backendPath}${url.search}`;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    // Forward the request to the HF backend
    const headers = new Headers(request.headers);
    // Remove host header so it doesn't conflict
    headers.delete("host");
    
    const fetchOptions = {
      method: request.method,
      headers,
    };

    // Forward body for non-GET/HEAD requests
    if (request.method !== "GET" && request.method !== "HEAD") {
      fetchOptions.body = request.body;
    }

    const response = await fetch(backendUrl, fetchOptions);

    // Clone response and add CORS headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Backend proxy error", message: err.message }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
