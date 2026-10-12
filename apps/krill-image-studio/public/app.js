const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const isTauri=Boolean(window.__TAURI__?.core?.invoke);
const STORE_KEY="krill-image-studio-settings-v1",HISTORY_KEY="krill-image-studio-history-v1";
const USER_BASE_URL="https://task-api-1-cn.65535.space/v1";
const USER_MODELS=["gpt-image-2.5-flare","gpt-image-2.5-sunburst","gpt-image-2.5","gpt-image-2"];
const ADMIN_PASSWORD_HASH="4b55cec4e60bf21898633436069731fca32c53b3e72f9294f278da3554affd3a";
const defaults={baseUrl:USER_BASE_URL,apiKey:"",selectedModel:USER_MODELS[0],availableModels:USER_MODELS,responseFormat:"url",outputDir:"浏览器下载目录"};
const loadSettings=()=>({...defaults,...JSON.parse(localStorage.getItem(STORE_KEY)||"{}")});
const saveBrowserSettings=s=>localStorage.setItem(STORE_KEY,JSON.stringify(s));
const normalizeBase=value=>{let url=String(value||"").trim().replace(/\/$/,"");url=url.replace(/\/images\/(generations|edits)$/i,"");if(!url)throw new Error("请填写 API 地址");return url};
const authHeaders=key=>({Authorization:`Bearer ${key}`});
const apiFetch=async(url,options={})=>{let response;try{response=await fetch(url,options)}catch(e){throw new Error("浏览器无法连接接口。该供应商可能未允许跨域访问（CORS），请换用支持网页调用的接口，或继续使用桌面版。")}const text=await response.text();let value;try{value=text?JSON.parse(text):{}}catch{value={message:text}}if(!response.ok)throw new Error(value?.error?.message||value?.message||`接口返回 ${response.status}`);return value};
const dataUrlFromBlob=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
const db=()=>new Promise((resolve,reject)=>{const request=indexedDB.open("krill-image-studio",1);request.onupgradeneeded=()=>request.result.createObjectStore("images");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
async function putImage(id,data){const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction("images","readwrite");tx.objectStore("images").put(data,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});database.close()}
async function getImage(id){const database=await db();const result=await new Promise((resolve,reject)=>{const tx=database.transaction("images","readonly");const request=tx.objectStore("images").get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});database.close();if(!result)throw new Error("本地图片记录已不存在");return result}
async function deleteImage(id){const database=await db();await new Promise((resolve,reject)=>{const tx=database.transaction("images","readwrite");tx.objectStore("images").delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});database.close()}
const b64ToDataUrl=(b64,mime="image/png")=>`data:${mime};base64,${b64}`;
async function resolveImage(value,base,key){
  for(let i=0;i<225;i++){
    const b64=value?.data?.[0]?.b64_json||value?.b64_json;if(b64)return b64ToDataUrl(b64);
    const url=value?.data?.[0]?.url||value?.url;if(url){const response=await fetch(url);if(!response.ok)throw new Error(`图片链接下载返回 ${response.status}`);return dataUrlFromBlob(await response.blob())}
    const id=value?.id||value?.task_id||value?.data?.id;if(!id)throw new Error("接口没有返回图片 URL、Base64 或任务 ID");
    await new Promise(resolve=>setTimeout(resolve,4000));value=await apiFetch(`${base}/images/${id}`,{headers:authHeaders(key)});
  }
  throw new Error("等待图片任务超过15分钟");
}
async function browserInvoke(cmd,args={}){
  const s=loadSettings();
  if(cmd==="get_status")return {...s,baseUrl:s.workspace==="admin"?s.baseUrl:USER_BASE_URL,availableModels:s.workspace==="admin"?s.availableModels:USER_MODELS,selectedModel:s.workspace==="admin"?s.selectedModel:USER_MODELS[0],connected:Boolean(s.apiKey),apiKey:undefined};
  if(cmd==="save_settings"){const next={...s};if(args.apiKey?.trim())next.apiKey=args.apiKey.trim();if(args.workspace==="admin"){next.baseUrl=normalizeBase(args.baseUrl);next.selectedModel=args.selectedModel||"";next.responseFormat=args.responseFormat||"url";next.outputDir=args.outputDir||"浏览器下载目录"}saveBrowserSettings(next);return {ok:true}}
  if(cmd==="fetch_models"){
    const started=performance.now(),baseUrl=normalizeBase(args.baseUrl),apiKey=args.apiKey?.trim()||s.apiKey;if(!apiKey)throw new Error("请填写 API Key");
    const value=await apiFetch(`${baseUrl}/models`,{headers:authHeaders(apiKey)});const raw=Array.isArray(value)?value:(value.data||value.models||[]);const models=[...new Set(raw.map(x=>typeof x==="string"?x:x?.id).filter(Boolean))].sort((a,b)=>{const image=x=>/(image|dall|flux|seedream|imagen|recraft)/i.test(x)?0:1;return image(a)-image(b)||a.localeCompare(b)});if(!models.length)throw new Error("/models 没有返回可识别的模型");const selectedModel=models.includes(s.selectedModel)?s.selectedModel:models[0];saveBrowserSettings({...s,baseUrl,apiKey,availableModels:models,selectedModel});return {models,selectedModel,baseUrl,elapsedMs:performance.now()-started};
  }
  if(cmd==="save_selected_model"){saveBrowserSettings({...s,selectedModel:args.model});return}
  if(cmd==="get_history")return JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");
  if(cmd==="read_image")return getImage(args.path);
  if(cmd==="delete_history_item"){const history=JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");const item=history.find(x=>x.id===args.id);localStorage.setItem(HISTORY_KEY,JSON.stringify(history.filter(x=>x.id!==args.id)));if(item)await deleteImage(item.path);return}
  if(cmd==="generate_image"||cmd==="edit_image"){
    const input=args.input,key=s.apiKey;if(!key)throw new Error("请先填写 API Key 并获取模型");const started=performance.now();let endpoint,options;
    const base=input.workspace==="user"?USER_BASE_URL:s.baseUrl;
    if(cmd==="generate_image"){endpoint=`${base}/images/generations`;options={method:"POST",headers:{...authHeaders(key),"Content-Type":"application/json"},body:JSON.stringify({model:input.model,prompt:input.prompt,size:input.size,quality:input.quality,response_format:s.responseFormat})}}
    else{endpoint=`${base}/images/edits`;const form=new FormData();form.append("model",input.model);form.append("prompt",input.prompt);form.append("size",input.size);form.append("quality",input.quality);form.append("response_format",s.responseFormat);const toBlob=async data=>(await fetch(data)).blob();for(let i=0;i<input.imageData.length;i++)form.append("image",await toBlob(input.imageData[i]),input.imageName[i]||`reference-${i+1}.png`);if(input.maskData)form.append("mask",await toBlob(input.maskData),input.maskName||"mask.png");options={method:"POST",headers:authHeaders(key),body:form}}
    const value=await apiFetch(endpoint,options),data=await resolveImage(value,base,key),id=`img-${Date.now()}-${Math.random().toString(36).slice(2)}`;await putImage(id,data);const item={id,path:id,mode:cmd==="edit_image"?"edit":"generate",prompt:input.prompt,size:input.size,quality:input.quality,model:input.model,filename:input.filename,elapsedSeconds:(performance.now()-started)/1000,createdAt:new Date().toISOString()};const history=[item,...JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]")].slice(0,100);localStorage.setItem(HISTORY_KEY,JSON.stringify(history));return item;
  }
  throw new Error(`浏览器版暂不支持 ${cmd}`);
}
const invoke=(cmd,args={})=>isTauri?window.__TAURI__.core.invoke(cmd,args):browserInvoke(cmd,args);
const MAX_REFERENCE_IMAGES=10;
const state={mode:"generate",source:[],mask:null,current:null,history:[],models:USER_MODELS,settings:null,workspace:"user",unlockClicks:0};

function escapeHtml(value=""){return String(value).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
function error(message=""){const box=$("#error");box.hidden=!message;box.textContent=message}
function setMode(mode){state.mode=mode;$$('.mode-tab').forEach(x=>x.classList.toggle('active',x.dataset.mode===mode));$("#editInputs").hidden=mode!=="edit";$("#generate span").textContent=mode==="edit"?"生成修改图片":"生成图片";error()}
function fileData(file){return new Promise((resolve,reject)=>{if(file.size>25*1024*1024)return reject(new Error("单张图片不能超过 25MB"));const reader=new FileReader();reader.onload=()=>resolve({name:file.name,data:reader.result});reader.onerror=()=>reject(new Error("读取图片失败"));reader.readAsDataURL(file)})}
function optionHtml(models,selected){return models.length?models.map(m=>`<option value="${escapeHtml(m)}" ${m===selected?'selected':''}>${escapeHtml(m)}</option>`).join(''):'<option value="">请先获取可用模型</option>'}
function renderModels(models,selected){state.models=models||[];$("#modelSelect").innerHTML=optionHtml(state.models,selected);$("#settingsModel").innerHTML=optionHtml(state.models,selected)}
function isAdmin(){return state.workspace==="admin"}
function applyWorkspace(){const admin=isAdmin();$("#workspaceBadge").textContent=admin?"管理端":"用户端";$("#settingsTitle").textContent=admin?"管理端设置":"用户设置";$("#settingsSubtitle").textContent=admin?"配置供应商地址、Key 和模型":"填写你的专属 API Key";$$('.admin-only').forEach(el=>el.hidden=!admin);const selected=admin?(state.settings?.selectedModel||USER_MODELS[0]):(USER_MODELS.includes(state.settings?.selectedModel)?state.settings.selectedModel:USER_MODELS[0]);renderModels(admin?(state.settings?.availableModels||USER_MODELS):USER_MODELS,selected)}
async function sha256(value){const bytes=new TextEncoder().encode(value),hash=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,"0")).join("")}
async function enterAdmin(password){if(await sha256(password)!==ADMIN_PASSWORD_HASH)throw new Error("管理者密码不正确");state.workspace="admin";applyWorkspace();$("#adminDialog").close();$("#adminPassword").value="";await refreshStatus()}
async function refreshStatus(){
  const s=await invoke("get_status",{workspace:state.workspace});state.settings=s;$("#baseUrl").value=s.baseUrl||USER_BASE_URL;$("#outputDir").value=s.outputDir||"";$("#responseFormat").value=s.responseFormat||"url";applyWorkspace();
  const c=$("#connection");c.classList.toggle("ok",s.connected);c.querySelector('b').textContent=s.connected?(s.selectedModel?`已连接 · ${s.selectedModel}`:"已连接 · 请获取模型"):"尚未配置";$("#generateHint").textContent=(s.responseFormat||"url")==="url"?"URL 返回 · 速度优先":"Base64 返回 · 兼容优先";
}
async function fetchModels(){
  const button=$("#fetchModels"),status=$("#fetchStatus");button.disabled=true;button.textContent="正在获取…";status.textContent="正在连接 /models";
  try{const result=await invoke("fetch_models",{baseUrl:$("#baseUrl").value,apiKey:$("#apiKey").value});renderModels(result.models,result.selectedModel);$("#baseUrl").value=result.baseUrl;status.textContent=`已获取 ${result.models.length} 个模型，用时 ${(result.elapsedMs/1000).toFixed(2)} 秒`;await refreshStatus()}catch(e){status.textContent=String(e)}finally{button.disabled=false;button.textContent="获取并保存可用模型"}
}
async function loadHistory(){state.history=await invoke("get_history");renderHistory()}
async function imageFor(item){return invoke("read_image",{path:item.path})}
function showImage(data,item){state.current=item;$("#resultImage").src=data;$("#canvas").classList.add("has-image");$("#canvasActions").hidden=false;$("#download").href=data;$("#download").download=item.filename;$("#resultMeta").textContent=`${item.model} · ${item.size} · ${item.quality} · ${Number(item.elapsedSeconds||0).toFixed(1)} 秒`}
function clearCanvas(){state.current=null;$("#resultImage").removeAttribute("src");$("#canvas").classList.remove("has-image");$("#canvasActions").hidden=true;$("#download").removeAttribute("href");$("#resultMeta").textContent="等待生成"}
function renderSources(){const list=$("#sourceList"),count=state.source.length;list.hidden=!count;list.innerHTML=state.source.map((source,index)=>`<div class="source-thumb"><img src="${source.data}" alt="参考图 ${index+1}"><span class="source-index">${index+1}</span><button class="remove-source" type="button" data-index="${index}" aria-label="删除参考图 ${index+1}">×</button></div>`).join("");$$('.remove-source').forEach(button=>button.onclick=()=>{state.source.splice(Number(button.dataset.index),1);renderSources();updateSourceLabel()})}
function updateSourceLabel(){const count=state.source.length;$("#sourceName").textContent=count?`已上传 ${count} 张参考图，第一张为主图`:"最多 10 张，PNG、JPG、WEBP，单张最大 25MB";$("#clearSource").hidden=!count}
function clearUpload(kind){const source=kind==="source";state[kind]=source?[]:null;const input=$(source?"#sourceInput":"#maskInput"),name=$(source?"#sourceName":"#maskName"),button=$(source?"#clearSource":"#clearMask");input.value="";if(source){renderSources();updateSourceLabel()}else{name.textContent="透明 PNG，透明区域进行修改";button.hidden=true}}
function renderHistory(){
  const filter=$("#historyFilter").value;const items=filter==="all"?state.history:state.history.filter(x=>x.mode===filter);$("#history").innerHTML=items.length?items.map(x=>`<article class="history-item" data-id="${x.id}"><button class="delete-history" type="button" aria-label="删除这张历史图片">×</button><img data-path="${escapeHtml(x.path)}" alt="${escapeHtml(x.prompt)}"><div class="history-info"><strong>${escapeHtml(x.prompt)}</strong><div><span>${x.mode==="edit"?"图生图":"文生图"} · ${escapeHtml(x.model||"")}</span><span>${Number(x.elapsedSeconds||0).toFixed(0)}秒</span></div></div></article>`).join(''):'<div class="history-empty">暂无生成记录</div>';
  $$('.history-item img').forEach(async img=>{try{img.src=await invoke("read_image",{path:img.dataset.path})}catch{}});$$('.history-item').forEach(card=>card.onclick=async e=>{if(e.target.closest('.delete-history'))return;const item=state.history.find(x=>x.id===card.dataset.id);showImage(await imageFor(item),item)});$$('.delete-history').forEach(button=>button.onclick=async e=>{e.stopPropagation();const card=button.closest('.history-item'),item=state.history.find(x=>x.id===card.dataset.id);if(!item||!confirm(`确定删除“${item.filename}”吗？\n图片文件也会一并删除。`))return;button.disabled=true;try{await invoke("delete_history_item",{id:item.id});if(state.current?.id===item.id)clearCanvas();await loadHistory()}catch(err){error(String(err));button.disabled=false}})
}

$$('.mode-tab').forEach(x=>x.onclick=()=>setMode(x.dataset.mode));
$("#sourceInput").onchange=async e=>{const files=[...e.target.files];if(!files.length)return;const remaining=MAX_REFERENCE_IMAGES-state.source.length;if(remaining<=0){error(`最多上传 ${MAX_REFERENCE_IMAGES} 张参考图`);e.target.value="";return}if(files.length>remaining)error(`最多上传 ${MAX_REFERENCE_IMAGES} 张参考图，已只添加前 ${remaining} 张`);try{state.source.push(...await Promise.all(files.slice(0,remaining).map(fileData)));renderSources();updateSourceLabel()}catch(err){error(String(err))}finally{e.target.value=""}};
$("#maskInput").onchange=async e=>{const file=e.target.files[0];if(!file)return;try{state.mask=await fileData(file);$("#maskName").textContent=file.name;$("#clearMask").hidden=false}catch(err){error(String(err))}};
$("#clearSource").onclick=e=>{e.preventDefault();e.stopPropagation();clearUpload("source")};
$("#clearMask").onclick=e=>{e.preventDefault();e.stopPropagation();clearUpload("mask")};
$("#modelSelect").onchange=async e=>{await invoke("save_selected_model",{model:e.target.value});$("#settingsModel").value=e.target.value;await refreshStatus()};
$("#settingsModel").onchange=e=>$("#modelSelect").value=e.target.value;
$("#refreshModels").onclick=()=>{$("#settingsDialog").showModal();fetchModels()};
$("#fetchModels").onclick=fetchModels;
$("#historyFilter").onchange=renderHistory;
$("#generate").onclick=async()=>{
  const prompt=$("#prompt").value.trim(),model=$("#modelSelect").value;if(!prompt)return error("请填写图片描述");if(!model)return error("请先在设置中获取并选择模型");if(state.mode==="edit"&&!state.source.length)return error("图生图需要至少上传一张参考图");
  const button=$("#generate");button.disabled=true;button.querySelector('span').textContent="正在生成…";button.querySelector('small').textContent="模型处理中，请保持软件开启";error();const input={prompt,model,size:$("#size").value,quality:$("#quality").value,filename:$("#filename").value.trim()||"created-image.png",workspace:state.workspace};if(state.mode==="edit")Object.assign(input,{imageData:state.source.map(source=>source.data),imageName:state.source.map(source=>source.name),maskData:state.mask?.data||null,maskName:state.mask?.name||null});
  try{const item=await invoke(state.mode==="edit"?"edit_image":"generate_image",{input});showImage(await imageFor(item),item);await loadHistory()}catch(e){error(String(e))}finally{button.disabled=false;button.querySelector('span').textContent=state.mode==="edit"?"生成修改图片":"生成图片";button.querySelector('small').textContent=(state.settings?.responseFormat||"url")==="url"?"URL 返回 · 速度优先":"Base64 返回 · 兼容优先"}
};
$("#reuse").onclick=async()=>{if(!state.current)return;state.source=[{name:state.current.filename,data:await imageFor(state.current)}];renderSources();updateSourceLabel();setMode("edit")};
$("#closeCanvas").onclick=clearCanvas;
$("#resultImage").onclick=()=>{if(!state.current)return;$("#previewImage").src=$("#resultImage").src;$("#previewCaption").textContent=`${state.current.filename} · ${state.current.model} · ${Number(state.current.elapsedSeconds||0).toFixed(1)} 秒`;$("#previewDialog").showModal()};
function openSettings(){const dialog=$("#settingsDialog");$("#apiKey").value="";$("#fetchStatus").textContent="图片模型会排在列表前面";if(!dialog.open)dialog.showModal()}
$("#openSettings").addEventListener("click",openSettings);
$("#brandTrigger").addEventListener("click",()=>{state.unlockClicks+=1;if(state.unlockClicks>=5){state.unlockClicks=0;$("#adminDialog").showModal()}});
$("#adminForm").onsubmit=async e=>{e.preventDefault();const box=$("#adminError");box.hidden=true;try{await enterAdmin($("#adminPassword").value)}catch(err){box.hidden=false;box.textContent=String(err)}};
$("#closeAdmin").onclick=$("#cancelAdmin").onclick=()=>{$("#adminPassword").value="";$("#adminDialog").close()};
$("#closeSettings").onclick=$("#cancelSettings").onclick=()=>$("#settingsDialog").close();
$("#closePreview").onclick=()=>$("#previewDialog").close();
$("#settingsForm").onsubmit=async e=>{e.preventDefault();const button=$("#saveSettings");button.disabled=true;button.textContent="正在保存…";try{await invoke("save_settings",{apiKey:$("#apiKey").value,baseUrl:$("#baseUrl").value,selectedModel:$("#settingsModel").value,responseFormat:$("#responseFormat").value,outputDir:$("#outputDir").value,workspace:state.workspace});$("#apiKey").value="";$("#settingsDialog").close();await refreshStatus()}catch(err){$("#fetchStatus").textContent=String(err)}finally{button.disabled=false;button.textContent="保存设置"}};

if(!isTauri){
  $("#privacyNote").textContent="网页版的 Key、模型设置与图片历史仅保存在当前浏览器中；清除 Safari 网站数据会一并删除。";
  $("#outputDir").value="浏览器下载目录";$("#outputDir").disabled=true;
  if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));
}
document.documentElement.dataset.appReady="1";
Promise.all([refreshStatus(),loadHistory()]).catch(e=>error(String(e)));
