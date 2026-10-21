export function openWebPort(blob) {
  const token=Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,"0")).join("");
  const channel=new BroadcastChannel("srwf-web-port-"+token);
  const timeout=setTimeout(()=>channel.close(),120000);
  channel.onmessage=({data})=>{
    if(data?.type==="ready")channel.postMessage({type:"disc",game:"final",blob,name:"selected.bin"});
    if(data?.type==="received"){clearTimeout(timeout);channel.close();}
  };
  // BroadcastChannel survives the player's cross-origin-isolation reload.
  // The ROM is a structured-cloned Blob, never a network request or stored file.
  window.open(new URL("../web-port/?ui=reference2#handoff="+token,import.meta.url),"_blank","noopener");
}
