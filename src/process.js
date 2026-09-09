// SPDX-FileCopyrightText: 2026 Sungmoon Park
// SPDX-License-Identifier: Apache-2.0
'use strict';
if(process.env.ARTIFACT_MODE!=='synthetic-local')throw new Error('synthetic mode required');
const fs=require('node:fs'),{Pool}=require('pg');
const {connectIdentity}=require('./gateway'),{SubmissionService}=require('./service'),{server}=require('./http');
const config=JSON.parse(fs.readFileSync('/work/test-control.json'));
const ids=JSON.parse(fs.readFileSync('/work/identities.json'));
const a=connectIdentity(ids['writer-a']),b=connectIdentity(ids['writer-b']);
const pool=new Pool({host:'postgres',user:'artifact',database:'artifact',
  password:fs.readFileSync('/work/database-password','utf8'),max:2});
const service=new SubmissionService(pool,{'Source A':a,'Source B':b});
service.initialize().then(()=>{
  const http=server(service,config.sources,config.control);
  http.listen(8080,'127.0.0.1',()=>console.log('API_READY'));
  const stop=()=>http.close(async()=>{a.close();b.close();await pool.end();process.exit(0);});
  process.on('SIGTERM',stop);
}).catch(error=>{console.error(error.message);process.exit(1);});
