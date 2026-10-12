const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "public");
const mock = `<script>window.__TAURI__={core:{invoke:async(cmd)=>{if(cmd==="get_status")return {connected:true,baseUrl:"",textUrl:"",outputDir:"",model:"gpt-image-2",textModel:"gpt-5.6-sol"};if(cmd==="get_theme")return {imageData:null,fit:"cover",panel:"auto",blur:0,overlay:24};if(cmd==="get_history"||cmd==="list_ppt_projects")return [];throw Error("UI preview only");}}};</script>`;
http.createServer((req,res)=>{
  const name = new URL(req.url,"http://localhost").pathname;
  const file = path.resolve(root,"."+ (name==="/" ? "/index.html" : name));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);return res.end();}
    const ext=path.extname(file);
    res.setHeader("Content-Type",({".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript",".mjs":"text/javascript"})[ext]||"application/octet-stream");
    res.end(ext===".html"?data.toString().replace("</head>",mock+"</head>"):data);
  });
}).listen(4185,"127.0.0.1",()=>console.log("UI preview on 4185"));
