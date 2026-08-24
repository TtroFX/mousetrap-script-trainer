import fs from 'node:fs';
const specs=[['act1-scene1','act1-scene1-speech-',190],['act1-scene2','act1-scene2-speech-',336],['act2','act2-speech-',638]];
const roles=['MOLLIE','TROTTER','GILES','MISS CASEWELL','CHRISTOPHER','MRS. BOYLE','PARAVICINI','MAJOR METCALF'];
const script={},tr={},v={},g={};let ids=[];
for(const [sid,p,n] of specs){const speeches=[];for(let i=1;i<=n;i++){const id=p+String(i).padStart(4,'0');ids.push(id);speeches.push({id,speaker:roles[(i-1)%roles.length],text:`Synthetic line ${id}`});tr[id]={translation:`Synthetic translation ${id}`,translationSource:'ci-structural-fixture'};v[id]=[];g[id]=[]}script[sid]={sceneId:sid,speeches}}
for(let i=0;i<1186;i++){const id=ids[i%ids.length];v[id].push({surface:`term${i}`,lemma:`lemma${i%578}`,meaning:`meaning${i}`})}
for(let i=0;i<692;i++){const id=ids[i%ids.length];g[id].push({pattern:`pattern${i}`,description:`synthetic grammar description ${i}`})}
const dict={};for(let i=0;i<578;i++)dict[`lemma${i}`]={lemma:`lemma${i}`,coreMeaning:`meaning${i}`,forms:'synthetic',contextExplanation:'synthetic'};
for(const [name,data] of [['mousetrap_script_data.json',script],['mousetrap_line_translations.json',tr],['mousetrap_line_vocabulary.json',v],['mousetrap_line_grammar.json',g],['mousetrap_word_dictionary.json',dict]])fs.writeFileSync(name,JSON.stringify(data));
