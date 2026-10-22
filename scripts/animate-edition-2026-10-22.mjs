// One-off edition artwork compositor. Built-in imagegen supplies the four-vignette
// PNG strips; this file typesets labels and animates mechanisms, never daily policy.
// node scripts/animate-edition-2026-10-22.mjs .cache/edition-animation/art
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const W = 1000, H = 800;
const paper = '#faf6e9', ink = '#202e30', teal = '#216b68', rust = '#a3442e';
const out = 'public/edition-images/2026-10-22';
const evidence = '.cache/edition-animation';
const esc = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const text = (x,y,s,size=36,color=ink,weight=400) => `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(s)}</text>`;
const box = (x,y,w,h,fill=paper,stroke=ink) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
const line = (x,y,X,Y,c=teal) => `<path d="M${x} ${y} L${X} ${Y}" stroke="${c}" stroke-width="5" fill="none" marker-end="url(#arrow)"/>`;
const dot = (x,y,c=teal) => `<circle cx="${x}" cy="${y}" r="10" fill="${c}"/>`;
const card = (x,y,label,w=480,c=teal) => box(x,y,w,58,'#ffffff',c)+text(x+16,y+40,label,31,c,600);
const tick = (x,y,c=teal) => `<path d="M${x} ${y} l14 15 28 -35" fill="none" stroke="${c}" stroke-width="8"/>`;
const steps = [
 {slug:'beacon-reviewed-memory', title:'From sessions to reusable lessons', sub:'Beacon · conceptual learning loop', labels:['Capture','Normalize','Review','Reuse'], notes:[['Record prompts, tools and commands.','Keep the evidence behind a lesson.'],['Session records use a common format.','Recurring workflows become candidates.'],['A human checks the proposed lesson.','Approval comes before reuse.'],['Reviewed instructions reach another agent.','Available through skills or MCP.']], caveat:'Reuse is intended; improvement is not measured.'},
 {slug:'halo-architecture',title:'Background work, bounded access',sub:'Langfuse Halo · architecture retrospective',labels:['Close tab','Continue','Access','Sandbox'],notes:[['The browser can close after a run starts.','Work does not depend on an open tab.'],['A backend worker continues the agent loop.','Progress and results are saved.'],['Tools follow project and role permissions.','Changing data still needs approval.'],['Optional scripts receive authorized data.','The sandbox has no network by default.']],caveat:'Separate boundaries; no security guarantee.'},
 {slug:'braintrust-application-logs',title:'Explain a run with more context',sub:'Braintrust JavaScript SDK 3.39.0',labels:['Logs','Traces','Tool calls','Usage'],notes:[['Application logging captures console context.','Example: a fallback before a model call.'],['Batch and code-mode tracing add coverage.','Inspect logs alongside the run steps.'],['Streamed tool calls stay separate.','The fix handles a missing provider index.'],['Pi and Flue count cache reads and writes.','They are included in prompt_tokens.']],caveat:'Illustrative records; verify your integration.'},
 {slug:'langwatch-otlp-fidelity',title:'Follow a trace from send to read',sub:'LangWatch 3.21.0 · conceptual operator check',labels:['Compress','Identify','Read','Verify'],notes:[['SDKs default to gzip-compressed traces.','The payload uses OTLP/protobuf.'],['The server inspects identifying bytes.','gzip or zstd can override a wrong label.'],['Reading fixes preserve tool output.','Claude usage is counted once.'],['Send a known trace through your route.','Check the received fields, not just upload.']],caveat:'Related release changes; no measured savings.'},
 {slug:'phoenix-server-errors',title:'When the browser interface fails',sub:'Phoenix 20.24.0 · conceptual reporting flow',labels:['Interface','Error','Report','Server log'],notes:[['AI traces describe application activity.','A browser failure needs other evidence.'],['An uncaught frontend error occurs.','This example is an interface failure.'],['Phoenix reports the uncaught error.','The report travels to the server log.'],['Operators can inspect the server log.','Verify reporting in the deployed setup.']],caveat:'Logging does not imply alerts or resolution.'},
 {slug:'phoenix-decision-evals',title:'A label and a refusal are different',sub:'Phoenix Evals 2.7.0 · conceptual decision flow',labels:['Prompt','Decide','Label','Refusal'],notes:[['Rendered prompts become plain text.','The model receives the evaluation input.'],['experimental_decide runs the classifier.','Decision spans record question and answer.'],['A decision returns a classification label.','Probabilities or confidence, when reported.'],['A refusal throws a decision-refusal error.','Handle it separately from a normal label.']],caveat:'Alternative outcomes; no accuracy claim.'},
];

function scene(i,s,p) {
 const x=440, y=304, travel=70+350*p;
 if(i===0) {
  if(s===0) return ['Prompt','Tool call','Command'].map((t,j)=>card(x,y+j*74,t,440)).join('')+dot(x+travel,y+40+Math.floor(p*2)*74);
  if(s===1) return ['Session record','Recurring workflow','Proposed lesson'].map((t,j)=>card(x+j*10,y+j*74,t,440-j*10)).join('')+line(900,340,900,510)+dot(900,355+p*140);
  if(s===2) return card(x,y,'Proposed lesson')+line(680,370,680,410)+card(x,y+120,p<.55?'Awaiting human review':'Human approval',480,p<.55?rust:teal)+(p>.55?tick(855,470):text(860,470,'?',46,rust,700));
  return card(x,y,'Approved instructions')+line(680,370,680,410)+card(x,y+120,'Next agent · skills / MCP')+dot(680,y+70+p*45);
 }
 if(i===1) {
  if(s===0) return card(x,y,'Run started')+line(680,365,680,405)+card(x,y+120,'Browser tab closed',480,rust)+`<path d="M880 450 l25 25 m0 -25 l-25 25" stroke="${rust}" stroke-width="5"/>`;
  if(s===1) return card(x,y,'Worker → agent loop')+line(680,370,680,410)+card(x,y+120,'Save progress + results')+dot(680,y+72+48*p);
  if(s===2) return card(x,y,'Project + role check')+line(680,370,680,410)+card(x,y+120,'Write: approval required',480,rust)+dot(x+travel,y+28);
  return card(x,y,'Authorized data only')+line(680,370,680,410)+card(x,y+120,'Scripts · no network')+dot(680,y+72+48*p);
 }
 if(i===2) {
  if(s===0) return ['[log] request starts','[log] using fallback','[log] calling model'].slice(0,1+Math.floor(p*2.99)).map((t,j)=>card(x,y+j*74,t,480,j===1?rust:teal)).join('');
  if(s===1) return text(x,y,'Run steps + context',34,ink,700)+[0,1,2].map(j=>`<rect x="${x+j*35}" y="${y+35+j*55}" width="${80+250*p}" height="25" fill="${j===1?rust:teal}"/>`).join('')+text(x,y+235,'Batch / code-mode spans',32);
  if(s===2) return card(x,y,'Tool A · separate record')+card(x,y+140,'Tool B · separate record',480,rust)+line(x+30,y+90,x+440,y+90)+line(x+30,y+230,x+440,y+230,rust)+dot(x+travel,y+90)+dot(x+travel,y+230,rust);
  return card(x,y,'Cache reads')+card(x,y+80,'Cache writes')+line(680,470,680,500)+text(x,y+245,'Included in prompt_tokens',32,teal,700);
 }
 if(i===3) {
  if(s===0) return box(x,y+40,180-80*p,150,'#dbe7df',teal)+text(x+10,y+95,'Trace',30)+line(x+200,y+110,x+280,y+110)+box(x+290,y+65,170,110,'#dbe7df',teal)+text(x+320,y+130,'gzip',38,teal,700)+text(x,y+245,'OTLP / protobuf',34);
  if(s===1) return card(x,y,'Label may be wrong',480,rust)+card(x,y+110,'Inspect payload bytes')+`<circle cx="${x+travel}" cy="${y+140}" r="33" fill="none" stroke="${teal}" stroke-width="6"/>`+text(x,y+245,'Detect gzip / zstd',35,teal,700);
  if(s===2) return card(x,y,'Claude usage · once')+card(x,y+115,'Preserved tool output')+(p>.3?tick(870,345):'')+(p>.7?tick(870,460):'');
  return card(x,y,'Known trace → proxy route')+line(680,370,680,410)+card(x,y+120,'Inspect received fields')+dot(680,y+72+p*48);
 }
 if(i===4) {
  if(s===0) return box(x,y,480,225)+card(x+20,y+20,'Trace + evaluation UI',440)+text(x+30,y+150,'Inspect a run',36)+dot(x+travel,y+190);
  if(s===1) return box(x,y,480,225)+text(x+25,y+90,'Uncaught error',44,rust,700)+text(x+25,y+160,'Browser interface',35)+`<path d="M890 335 v60 m0 18 v8" stroke="${rust}" stroke-width="9"/>`;
  if(s===2) return text(x,y,'Browser',34)+text(x+325,y,'Server',34)+line(x+15,y+100,x+455,y+100)+box(x+travel-35,y+65,70,70,'#f1daca',rust)+text(x+travel-17,y+115,'!',44,rust,700)+text(x,y+225,'Uncaught error report',35);
  return ['Server log','Uncaught frontend error','Operator investigation'].map((t,j)=>card(x,y+j*74,t,480,j===1?rust:teal)).join('')+(p>.4?tick(870,420):'');
 }
 if(s===0) return ['Question + answer','Render as plain text','Send prompt'].map((t,j)=>card(x,y+j*74,t)).join('')+dot(x+travel,y+28);
 if(s===1) return card(x,y,'experimental_decide')+line(680,370,680,410)+card(x,y+120,'Span: state / Q / A')+dot(680,y+72+48*p);
 const branches=card(x,y,'Decision model')+line(680,370,550,420)+line(680,370,810,420,rust)+card(x,y+125,'Label',220,s===2?teal:'#7a8883')+card(x+260,y+125,'Error',220,s===3?rust:'#7a8883');
 if(s===2) return branches+dot(680-130*p,370+50*p)+text(x,y+245,'Metadata when available',32,teal,600);
 return branches+dot(680+130*p,370+50*p,rust)+text(x,y+245,'Refusal is not a label',32,rust,600);
}

function svg(i,s,p,art) {
 const a=steps[i];
 const nav=a.labels.map((label,j)=>{
  const xx=40+j*235;
  return box(xx,150,215,75,j===s?teal:paper,j===s?teal:'#9bada7')+text(xx+14,198,`${j+1} ${label}`,32,j===s?'#ffffff':ink,600)+(j<3 && (i!==5 || j===0)?line(xx+218,188,xx+232,188):'');
 }).join('');
 const artIndex=i===3?[1,2,3,3][s]:s;
 return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="${teal}"/></marker></defs><rect width="${W}" height="${H}" fill="${paper}"/>${text(40,64,a.title,46,ink,700)}${text(40,112,a.sub,30)}${nav}<image x="40" y="268" width="350" height="300" href="data:image/png;base64,${art[artIndex]}"/>${scene(i,s,p)}<path d="M40 600 H960" stroke="#9bada7" stroke-width="2"/>${text(40,651,a.notes[s][0],36,ink,600)}${text(40,702,a.notes[s][1],36)}${text(40,766,a.caveat,29,'#526662')}</svg>`);
}

await mkdir(evidence,{recursive:true});
const artDir=process.argv[2];
if(!artDir) throw new Error('Pass the directory of reviewed built-in imagegen PNG strips.');
const manifest=[];
for(let i=0;i<steps.length;i++) {
 const a=steps[i];
 const input=await readFile(path.join(artDir,a.slug+'.png'));
 const meta=await sharp(input).metadata();
 const art=[];
 for(let j=0;j<4;j++) {
  const left=Math.round(j*meta.width/4), right=Math.round((j+1)*meta.width/4);
  art.push((await sharp(input).extract({left,top:0,width:right-left,height:meta.height}).resize(350,300,{fit:'contain',background:paper}).png().toBuffer()).toString('base64'));
 }
 const frames=[],delays=[];
 for(let s=0;s<4;s++) for(let k=0;k<7;k++) {
  frames.push(await sharp(svg(i,s,k/6,art)).ensureAlpha().raw().toBuffer());
  delays.push(k===6?2250:150);
 }
 // A shared palette, no dithering and changed-pixel transparency keep text sharp
 // and avoid paying for a full canvas on every moving-token frame.
 const gif=await sharp(Buffer.concat(frames),{raw:{width:W,height:H*frames.length,channels:4,pageHeight:H}}).gif({colours:80,dither:0,effort:10,loop:0,delay:delays,interFrameMaxError:0,interPaletteMaxError:0}).toBuffer();
 const dest=path.join(out,a.slug+'.gif');
 await writeFile(dest,gif);
 // Keep the original static illustration as the fallback; its provenance and hash
 // remain untouched in the edition. The GIF contains a distinct four-stage story.
 const review=[];
 for(let s=0;s<4;s++) review.push({input:await sharp(svg(i,s,1,art)).resize(500,400).png().toBuffer(),left:(s%2)*500,top:Math.floor(s/2)*400});
 await sharp({create:{width:1000,height:800,channels:3,background:paper}}).composite(review).png().toFile(path.join(evidence,a.slug+'-stages.png'));
 const decoded=await sharp(gif,{animated:true}).metadata();
 manifest.push({slug:a.slug,src:'/'+dest.replace(/^public\//,''),width:W,height:H,sha256:createHash('sha256').update(gif).digest('hex'),size_bytes:gif.length,frames:decoded.pages,duration_ms:decoded.delay.reduce((n,v)=>n+v,0),loop:decoded.loop,source_art_sha256:createHash('sha256').update(input).digest('hex'),labels:a.labels,alt:`Animated ${a.sub}: ${a.notes.map(n=>n.join(' ')).join(' ')} ${a.caveat}`,optimization:{format:'gif',colours:80,dither:0,effort:10,inter_frame_max_error:0}});
 console.log(a.slug,gif.length,decoded.pages);
}
await writeFile(path.join(evidence,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
