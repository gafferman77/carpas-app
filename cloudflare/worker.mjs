const encoder = new TextEncoder();
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const text = (data, status = 200) => new Response(data, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
const sanitize = (v, n = 1000) => String(v || "").trim().slice(0, n);
const lower = v => sanitize(v).toLowerCase();
const clean = (v, regex) => Array.isArray(v) ? [...new Set(v.map(lower).filter(x => regex.test(x)))] : [];
const normalizeCarpaId = v => {
  const m = sanitize(v).toUpperCase().match(/^(?:CARPA[\s-_]*)?0*(\d{1,3})$/);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 180) return "";
  return "CARPA-" + String(Number(m[1])).padStart(3, "0");
};
const pending = x => ["pendiente", "en_reparacion"].includes(x.estado || (x.destino === "campo" ? "reparada" : "pendiente"));
const newest = xs => xs.sort((a,b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
const can = (source, role, env) => source.role === role && (role === "TALLER" || (role === "ATP" && lower(source.key) === lower(env.ATP_KEY || "faro")));
const requireRole = (source, role, env) => can(source,role,env) ? null : json({error:"Acceso inválido para " + role},401);
const encode64url = bytes => {
  let str = ""; for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
};
let tokenCache = null;
async function accessToken(env) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new Error("Falta FIREBASE_SERVICE_ACCOUNT_JSON");
  const svc = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!svc.project_id || !svc.client_email || !svc.private_key) throw new Error("Credencial de Firebase incompleta");
  const now = Math.floor(Date.now()/1000);
  if (tokenCache && tokenCache.email === svc.client_email && tokenCache.expires > now + 90) return {token:tokenCache.token, project:svc.project_id};
  const head = encode64url(encoder.encode(JSON.stringify({alg:"RS256",typ:"JWT"})));
  const body = encode64url(encoder.encode(JSON.stringify({iss:svc.client_email,scope:"https://www.googleapis.com/auth/datastore",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600})));
  const jwt = head + "." + body;
  const key = await crypto.subtle.importKey("pkcs8", pemToBytes(svc.private_key), {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,encoder.encode(jwt));
  const assertion = jwt+"."+encode64url(new Uint8Array(signature));
  const response = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});
  if (!response.ok) throw new Error("Error OAuth Firebase ("+response.status+")");
  const grant = await response.json();
  tokenCache = {token:grant.access_token,expires:now+(grant.expires_in || 3600),email:svc.client_email};
  return {token:grant.access_token,project:svc.project_id};
}
function pemToBytes(pem) {
  const str = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  const bin = atob(str); return Uint8Array.from(bin, c => c.charCodeAt(0));
}
const field = v => {
  if (v === null || v === undefined) return {nullValue:null};
  if (Array.isArray(v)) return {arrayValue:{values:v.map(field)}};
  if (typeof v === "boolean") return {booleanValue:v};
  if (typeof v === "number") return Number.isInteger(v) ? {integerValue:String(v)} : {doubleValue:v};
  if (typeof v === "object") return {mapValue:{fields:fields(v)}};
  return {stringValue:String(v)};
};
const fields = obj => Object.fromEntries(Object.entries(obj).map(([key,val])=>[key,field(val)]));
const parseField = v => {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(parseField);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,val])=>[k,parseField(val)]));
  return null;
};
const parseDoc = doc => ({id:decodeURIComponent(doc.name.split("/").pop()),...Object.fromEntries(Object.entries(doc.fields || {}).map(([k,v])=>[k,parseField(v)]))});
async function firestore(env, endpoint, method="GET", body) {
  const {token,project}=await accessToken(env);
  const base="https://firestore.googleapis.com/v1/projects/"+encodeURIComponent(project)+"/databases/(default)/documents";
  const res=await fetch(base+endpoint,{method,headers:{"authorization":"Bearer "+token,"content-type":"application/json"},body:body === undefined ? undefined : JSON.stringify(body)});
  const data=await res.json().catch(()=>({}));
  if (!res.ok) throw new Error("Firestore "+res.status+": "+JSON.stringify(data.error || {}).slice(0,200));
  return data;
}
async function list(env, collection, limit=500) {
  const results=[]; let next="";
  do {
    const q=new URLSearchParams({pageSize:String(Math.min(100,limit-results.length))});
    if (next) q.set("pageToken",next);
    const data=await firestore(env,"/"+collection+"?"+q);
    results.push(...(data.documents||[]).map(parseDoc));
    next=data.nextPageToken||"";
  } while(next && results.length<limit);
  return results;
}
async function queryCarpa(env, carpaId) {
  const data=await firestore(env,":runQuery","POST",{structuredQuery:{from:[{collectionId:"carpasReportes"}],where:{fieldFilter:{field:{fieldPath:"carpaId"},op:"EQUAL",value:{stringValue:carpaId}}},limit:200}});
  return (Array.isArray(data)?data:[]).filter(x=>x.document).map(x=>parseDoc(x.document));
}
async function addReport(env, report) {
  const data=await firestore(env,"/carpasReportes","POST",{fields:fields(report)});
  return decodeURIComponent(data.name.split("/").pop());
}
async function patch(env, collection, id, changes) {
  const qs=new URLSearchParams();
  Object.keys(changes).forEach(k=>qs.append("updateMask.fieldPaths",k));
  return firestore(env,"/"+collection+"/"+encodeURIComponent(id)+"?"+qs,"PATCH",{fields:fields(changes)});
}
async function getDoc(env,collection,id) {
  try { return await firestore(env,"/"+collection+"/"+encodeURIComponent(id)); }
  catch(err) { if (String(err).includes("Firestore 404")) return null; throw err; }
}
const asInput = async req => { try { return await req.json(); } catch { return {}; } };
const fail = (err, code) => { console.error("[carpas-worker]",code,err); return json({error:code},500); };
async function serveApp(request,env) {
  const u = new URL(request.url);
  u.pathname="/index.html";
  const res=await env.ASSETS.fetch(new Request(u,request));
  if(!res.ok) return res;
  const html=(await res.text()).replace(/__ASSET_VERSION__/g,"cloudflare-v1");
  const headers=new Headers(res.headers); headers.set("cache-control","no-cache");
  return new Response(html,{status:200,headers});
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url), path=url.pathname, method=request.method;
    try {
      if(method==="GET" && path==="/health") return json({ok:true,version:"cloudflare-v1"});
      if(method==="GET" && (path==="/" || path==="/taller")) return serveApp(request,env);
      const carpaPage=path.match(/^\/carpa\/([^/]+)$/);
      if(method==="GET" && carpaPage) {
        const id=normalizeCarpaId(decodeURIComponent(carpaPage[1]));
        if(!id) return text("Número de carpa inválido (1 a 180)",404);
        if(carpaPage[1]!==id) return Response.redirect(url.origin+"/carpa/"+id,302);
        return serveApp(request,env);
      }
      if(method==="POST" && path==="/api/auth") {
        const input=await asInput(request); return json({ok:can(input,"ATP",env)||can(input,"TALLER",env)});
      }
      const normal=path.match(/^\/api\/carpas\/normalizar\/([^/]+)$/);
      if(method==="GET" && normal) {
        const carpaId=normalizeCarpaId(decodeURIComponent(normal[1]));
        return carpaId ? json({ok:true,carpaId}) : json({error:"Ingresá un número de carpa entre 1 y 180"},400);
      }
      const reports=path.match(/^\/api\/carpas\/([^/]+)\/reportes$/);
      if(reports && method==="POST") {
        const body=await asInput(request), denied=requireRole(body,"ATP",env);
        if(denied) return denied;
        const carpaId=normalizeCarpaId(decodeURIComponent(reports[1]));
        const puntos=clean(body.puntos,/^(sobretecho|cuerpo)_p\d+$/);
        const problemas=clean(body.problemas,/^(rotura|costura|cierre|piso|estructura|faltante|otro)$/);
        const detalle=sanitize(body.detalle), foto=String(body.foto||"");
        if(!carpaId) return json({error:"Carpa inválida"},400);
        if(foto && (!/^data:image\/jpeg;base64,[a-z0-9+/=]+$/i.test(foto)||foto.length>700000)) return json({error:"La foto es demasiado grande o no es válida"},400);
        if(!puntos.length&&!problemas.length&&!detalle&&!foto) return json({error:"Marcá un daño, agregá una foto o escribí una observación"},400);
        try {
          const now=new Date().toISOString();
          const reporteId=await addReport(env,{carpaId,puntos,partes:puntos,problemas,detalle,foto,prioridad:"normal",estado:"pendiente",destino:"taller/estanteria",tallerNota:"",createdAt:now,updatedAt:now});
          await patch(env,"carpas",carpaId,{carpaId,updatedAt:now,hasPending:true});
          return json({ok:true,reporteId,carpaId});
        } catch(e) {return fail(e,"No se pudo guardar el reporte");}
      }
      if(reports && method==="GET") {
        const denied=requireRole(Object.fromEntries(url.searchParams),"TALLER",env);
        if(denied) return denied;
        const carpaId=normalizeCarpaId(decodeURIComponent(reports[1]));
        if(!carpaId) return json({error:"Carpa inválida"},400);
        try {const all=newest(await queryCarpa(env,carpaId));return json({carpaId,total:all.length,pendientes:all.filter(pending).length,reportes:all});}
        catch(e){return fail(e,"No se pudieron cargar los reportes");}
      }
      if(method==="GET" && (path==="/api/taller/pendientes"||path==="/api/taller/historial")) {
        const denied=requireRole(Object.fromEntries(url.searchParams),"TALLER",env);
        if(denied) return denied;
        const isPending=path.endsWith("/pendientes");
        try {
          const all=newest((await list(env,"carpasReportes",500)).filter(x=>pending(x)===isPending));
          if(isPending) all.sort((a,b)=>Number(b.prioridad==="urgente")-Number(a.prioridad==="urgente"));
          return json({total:all.length,reportes:all});
        } catch(e) {return fail(e,isPending?"No se pudo cargar la lista de pendientes":"No se pudo cargar el historial");}
      }
      if(method==="PATCH" && /^\/api\/reportes\/[^/]+$/.test(path)) {
        const body=await asInput(request),denied=requireRole(body,"TALLER",env);
        if(denied) return denied;
        const estado=lower(body.estado).slice(0,30),destino=lower(body.destino).slice(0,30),prioridad=lower(body.prioridad).slice(0,20);
        if(!["pendiente","en_reparacion","reparada","baja"].includes(estado)) return json({error:"Estado inválido"},400);
        if(!["taller/estanteria","campo","desguase"].includes(destino)) return json({error:"Destino inválido"},400);
        if(!["normal","urgente"].includes(prioridad)) return json({error:"Prioridad inválida"},400);
        try {
          const id=sanitize(decodeURIComponent(path.split("/").pop()),160),before=await getDoc(env,"carpasReportes",id);
          if(!before) return json({error:"Reporte inexistente"},404);
          const carpaId=parseDoc(before).carpaId,now=new Date().toISOString();
          await patch(env,"carpasReportes",id,{estado,destino,prioridad,tallerNota:sanitize(body.tallerNota),updatedAt:now});
          const matches=await queryCarpa(env,carpaId);
          const hasPending=matches.some(x=>pending(x.id===id?{...x,estado}:x));
          await patch(env,"carpas",carpaId,{hasPending,updatedAt:now});
          return json({ok:true,carpaId,hasPending});
        } catch(e){return fail(e,"No se pudo actualizar el reporte");}
      }
      if(method==="POST" && path==="/api/taller/inicializar") {
        const body=await asInput(request),denied=requireRole(body,"TALLER",env);
        if(denied) return denied;
        try {
          const marker="cierre-pendientes-previos-v11";
          if(await getDoc(env,"sistemaCarpas",marker)) return json({ok:true,updated:0,alreadyDone:true});
          const targets=(await list(env,"carpasReportes",500)).filter(pending),now=new Date().toISOString();
          for(const report of targets) await patch(env,"carpasReportes",report.id,{estado:"reparada",destino:"campo",cierreGeneralV11:true,closedAt:now,updatedAt:now});
          for(const carpaId of [...new Set(targets.map(x=>x.carpaId).filter(Boolean))]) {
            const matches=await queryCarpa(env,carpaId);
            await patch(env,"carpas",carpaId,{hasPending:matches.some(pending),updatedAt:now});
          }
          await patch(env,"sistemaCarpas",marker,{completedAt:now,scope:"all-pending-at-first-run",updated:targets.length});
          return json({ok:true,updated:targets.length,alreadyDone:false});
        } catch(e) {return fail(e,"No se pudo cerrar el historial anterior");}
      }
      if(path.startsWith("/api/")) return json({error:"Ruta desconocida"},404);
      return env.ASSETS.fetch(request);
    } catch(e) {return fail(e,"Error interno");}
  }
};
