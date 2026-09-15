"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isAuthenticatedAppNavigationRoute } from "../lib/navigation/mobile-navigation";
export function AppActivity(){
 const pathname=usePathname();
 useEffect(()=>{
  if(!isAuthenticatedAppNavigationRoute(pathname))return;
  const first=pathname.split("/")[1];
  const feature=({"care-log":"history",dogs:"pets",results:"products",shop:"products",dashboard:"today","vet-briefs":"vet-brief"} as Record<string,string>)[first] || first;
  let lastBeat=0,lastError=0;
  const send=(kind:"heartbeat"|"browser_error")=>{
   if(document.visibilityState!=="visible")return;
   const now=Date.now();if(kind==="heartbeat" ? now-lastBeat<60000 : now-lastError<60000)return;
   if(kind==="heartbeat")lastBeat=now;else lastError=now;
   void fetch("/api/telemetry/activity",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,feature}),keepalive:true}).catch(()=>{});
  };
  const beat=()=>send("heartbeat"),error=()=>send("browser_error");
  beat();const timer=setInterval(beat,60000);document.addEventListener("visibilitychange",beat);
  window.addEventListener("error",error);window.addEventListener("unhandledrejection",error);
  return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",beat);window.removeEventListener("error",error);window.removeEventListener("unhandledrejection",error);};
 },[pathname]);return null;
}
