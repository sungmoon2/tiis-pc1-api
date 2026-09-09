// SPDX-FileCopyrightText: 2026 Sungmoon Park
// SPDX-License-Identifier: Apache-2.0
'use strict';
const http=require('node:http'),{timingSafeEqual}=require('node:crypto');
function equal(a,b) {
  return typeof a==='string' && typeof b==='string' && Buffer.byteLength(a)===Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
async function body(req) {
  const parts=[];let size=0;
  for await (const chunk of req) {
    size+=chunk.length;if(size>8388608)throw new Error('body too large');parts.push(chunk);
  }
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
function server(service,tokens,control) {
  return http.createServer(async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
    if(req.method==='GET' && req.url==='/health')return send(200,{ready:true});
    if(req.method!=='POST' || req.url!=='/submit')return send(404,{error:'not found'});
    const source=req.headers['x-source'];
    if(!Object.hasOwn(tokens,source) || !equal(req.headers.authorization,'Bearer '+tokens[source]))
      return send(401,{error:'unauthenticated'});
    const fault=req.headers['x-test-fault'] || null;
    if(fault && (!equal(req.headers['x-test-control'],control) ||
       !['not-submitted','commit-then-timeout','finalize-failure'].includes(fault)))
      return send(403,{error:'test control denied'});
    let payload;
    try {payload=await body(req);}catch(_){return send(400,{error:'invalid body'});}
    try {return send(200,await service.submit(source,payload,fault));}
    catch(_){return send(400,{error:'submission rejected'});}
  });
}
module.exports={server,equal,body};
