import json,sqlite3,uuid,datetime
from pathlib import Path
source_id='01a0e3c9-0b12-77f3-8f82-d8c9617d9006'
source=Path(r'C:\Users\Carter\.codex\sessions\2026\09\27\rollout-2026-09-27T12-53-18-'+source_id+'.jsonl')
root=Path(r'C:\Users\Carter\Code\t3code-pet'); out=root/'exports';out.mkdir(exist_ok=True)
messages=[]
for line in source.read_text(encoding='utf8').splitlines():
 record=json.loads(line);p=record.get('payload',{})
 if record.get('type')!='response_item' or p.get('type')!='message' or p.get('role') not in ('user','assistant'):continue
 if p.get('channel') in ('analysis','summary'):continue
 body='\n'.join(c.get('text','') for c in p.get('content',[]) if c.get('type') in ('input_text','output_text','text')).strip()
 if not body or body.startswith(('<environment_context>','<subagent')):continue
 if body.startswith('<send_user_message_question_reply>'):
  try:
   replies=json.loads(body.split('>',1)[1].rsplit('</',1)[0].strip())
   body='\n\n'.join(r['question']+'\n'+r['answer'] for r in replies)
  except (ValueError,KeyError):pass
 messages.append({'role':p['role'],'text':body,'timestamp':record['timestamp']})
assert len(messages)>80
now=datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
thread_id=str(uuid.uuid5(uuid.NAMESPACE_URL,'t3code-import:'+source_id)); project_id=str(uuid.uuid5(uuid.NAMESPACE_URL,'t3code-project:'+str(root).lower()))
db=Path(r'C:\Users\Carter\.t3\userdata\state.sqlite'); c=sqlite3.connect(db);c.row_factory=sqlite3.Row
assert c.execute("select count(*) from projection_thread_sessions where status in ('running','starting')").fetchone()[0]==0
assert not c.execute('select 1 from orchestration_events where stream_id=?',(thread_id,)).fetchone(), 'Already imported'
backup=Path(r'C:\Users\Carter\.t3\userdata\backups')/('before-pet-chat-import-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.sqlite');backup.parent.mkdir(exist_ok=True)
b=sqlite3.connect(backup);c.backup(b);b.close()
fork_manifest=json.loads((out/'t3-fork-result.json').read_text())
assert fork_manifest['resumeVerified'] and fork_manifest['sourceThreadId']==source_id
assert fork_manifest['providerThreadId']!=source_id
model={'instanceId':'codex','model':'gpt-6-astra'}
first=messages[0]['timestamp']
meta=json.dumps({'import':{'source':'codex','threadId':source_id}},separators=(',',':'))
added=[]
def event(kind,stream,version,typ,payload,time):
 eid=str(uuid.uuid4());cmd='import:'+source_id+':'+str(len(added))
 c.execute('insert into orchestration_events(event_id,aggregate_kind,stream_id,stream_version,event_type,occurred_at,command_id,causation_event_id,correlation_id,actor_kind,payload_json,metadata_json) values(?,?,?,?,?,?,?,null,?,?,?,?)',(eid,kind,stream,version,typ,time,cmd,cmd,'server',json.dumps(payload,ensure_ascii=False,separators=(',',':')),meta));added.append(eid)
try:
 c.execute('begin immediate')
 existing=c.execute('select project_id from projection_projects where lower(workspace_root)=? and deleted_at is null',(str(root).lower(),)).fetchone()
 if existing:project_id=existing[0]
 else:event('project',project_id,0,'project.created',{'projectId':project_id,'title':'t3code-pet','workspaceRoot':str(root),'defaultModelSelection':model,'faviconPath':None,'projectIcon':None,'scripts':[],'createdAt':now,'updatedAt':now},now)
 event('thread',thread_id,0,'thread.created',{'threadId':thread_id,'projectId':project_id,'title':'T3 Pet companion','modelSelection':model,'runtimeMode':'full-access','interactionMode':'default','branch':None,'worktreePath':None,'createdAt':first,'updatedAt':now},now)
 for i,m in enumerate(messages,1):
  mid=str(uuid.uuid5(uuid.NAMESPACE_URL,'t3code-import:'+source_id+':message:'+str(i)))
  event('thread',thread_id,i,'thread.message-sent',{'threadId':thread_id,'messageId':mid,'role':m['role'],'text':m['text'],'turnId':None,'streaming':False,'createdAt':m['timestamp'],'updatedAt':m['timestamp']},m['timestamp'])
 event('thread',thread_id,len(messages)+1,'thread.session-set',{'threadId':thread_id,'session':{'threadId':thread_id,'status':'stopped','providerName':'codex','providerInstanceId':'codex','runtimeMode':'full-access','activeTurnId':None,'lastError':None,'updatedAt':now}},now)
 c.execute('insert into provider_session_runtime(thread_id,provider_name,adapter_key,runtime_mode,status,last_seen_at,resume_cursor_json,runtime_payload_json,provider_instance_id) values(?,?,?,?,?,?,?,?,?)',(thread_id,'codex','codex','full-access','stopped',now,json.dumps({'threadId':fork_manifest['providerThreadId']}),json.dumps({'cwd':str(root),'model':'gpt-6-astra','activeTurnId':None,'lastError':None,'modelSelection':model}),'codex'))
 assert c.execute('pragma integrity_check').fetchone()[0]=='ok'
 c.commit()
except:
 c.rollback();raise
finally:c.close()
(out/'t3-pet-conversation.md').write_text('# T3 Pet conversation\n\n'+'\n\n---\n\n'.join('## '+m['role'].capitalize()+'\n\n'+m['text'] for m in messages)+'\n',encoding='utf8')
result={'threadId':thread_id,'projectId':project_id,'messages':len(messages),'events':len(added),'backup':str(backup),'sourceThreadId':source_id}
(out/'t3-import-result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result,indent=2))
