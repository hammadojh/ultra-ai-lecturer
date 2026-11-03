import React,{useRef,useState} from 'react';
export default function AgentInstructions({lecture}){
 const [credential,setCredential]=useState(null),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);const field=useRef();
 const endpoint=location.origin+'/mcp';
 const instructions=credential?`Connect to my local Ultra Studio MCP server using Streamable HTTP.
URL: ${endpoint}
Authorization header: Bearer ${credential.token}

Configure this server in your MCP client as "ultra-studio". Treat the access token as a secret and store it in your client's protected credential configuration. If you cannot configure MCP connections yourself, tell me exactly where to add the URL and authorization header in this client. After configuration, reconnect or reload your tools if needed.

Once connected, call get_teaching_instructions. ${lecture?`I want to edit lecture ${JSON.stringify(lecture.title)} (ID: ${lecture.id}). Call create_workspace with lectureId "${lecture.id}" and read current-lecture.zip.`:'I want to create a new lecture. Ask for my sources, audience, goals, language and teaching time, then call create_workspace without a lectureId.'}
Use your local file tools to work in the returned directory. Follow the teaching skills, review the work with me, and save the complete package as ultra-lecture.zip at the returned outputFile. Call submit_package with the workspaceId to validate it. Give me the returned reviewUrl so I can review and publish in Studio. Fix validation errors before handing it over.

This endpoint is on my computer. Your MCP client and file tools must run on this same computer; a cloud-hosted agent cannot reach my localhost. The server must remain running. The access token expires on ${new Date(credential.expires).toISOString()}.` : '';
 async function create(){setBusy(true);setStatus('');try{const r=await fetch('/api/mcp/token',{method:'POST'});const d=await r.json();if(!r.ok)throw Error(d.error);setCredential(d);setStatus('Connection instructions ready. Copy them into your local agent.');}catch(e){setStatus(e.message);}finally{setBusy(false);}}
 async function revoke(){setBusy(true);try{const r=await fetch('/api/mcp/token',{method:'DELETE'});if(!r.ok)throw Error('Unable to revoke access.');setCredential(null);setStatus('All your MCP access tokens have been revoked.');}catch(e){setStatus(e.message);}finally{setBusy(false);}}
 async function copy(){try{await navigator.clipboard.writeText(instructions);setStatus('Connection instructions copied.');}catch{field.current?.focus();field.current?.select();setStatus('Copy the selected instructions manually.');}}
 return <section className="agent-instructions" aria-labelledby="agent-instructions-title"><h3 id="agent-instructions-title">Connect your agent to Studio</h3><p>Your agent can read the teaching skills, work on lectures and send a finished package back for review.</p><p><strong>Server:</strong> <code>{endpoint}</code><br/>Streamable HTTP · Local agents on this computer</p><div className="actions">{!credential?<button className="primary" disabled={busy} onClick={create}>Create connection instructions</button>:<button className="primary" onClick={copy}>Copy connection instructions</button>}<button disabled={busy} onClick={revoke}>Revoke all MCP access</button></div><p role="status" className="status">{status}</p>{credential&&<><label htmlFor="agent-instructions-text">Connection instructions · includes a private access token</label><textarea ref={field} id="agent-instructions-text" readOnly value={instructions} spellCheck={false}/></>}<p className="package-note">Paste the instructions into your local agent. Its MCP tools become available after connection. Keep Studio running; you will review and publish the result here.</p></section>;
}
