// Header-only service worker. Never cache ROMs, saves, or responses.
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("fetch",event=>{
  const request=event.request;
  if(request.method!=="GET" || new URL(request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    const response=await fetch(request, request.mode === "navigate" ? {cache:"no-cache"} : undefined);
    if(response.status===0)return response;
    const headers=new Headers(response.headers);
    headers.set("Cross-Origin-Opener-Policy","same-origin");
    headers.set("Cross-Origin-Embedder-Policy","require-corp");
    headers.set("Cross-Origin-Resource-Policy","same-origin");
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  })());
});
