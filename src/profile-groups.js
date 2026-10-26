// Group content is user-authored: insert it as text, never HTML.
export function mountProfileGroups(root,request) {
  let active=true,revision=0,busy=false,selected=null;
  root.innerHTML=`<h2>your groups</h2><p>Find your people on sketchlet. Every request to join needs approval. Group drawing feeds are coming next.</p>
    <div class="content-notice"><strong>Unlisted does not mean private drawings.</strong><p>Unlisted groups stay out of search. Drawings remain public; joining a group does not hide them.</p></div>
    <p class="groups-status" role="status"></p><button type="button" class="web-button site-button utility groups-refresh">refresh groups</button><ul class="groups-mine"></ul>
    <div class="groups-discovery"><form class="groups-search"><h3>find a group</h3><label>group name<input name="query" required minlength="2" maxlength="40"></label><button class="web-button site-button">search groups</button><ul class="groups-results"></ul></form>
    <form class="groups-create"><h3>create a group</h3><label>new group name<input name="name" required minlength="3" maxlength="40"></label><label>description<textarea name="description" maxlength="400" rows="3"></textarea></label><label><input type="checkbox" name="listed" checked> Listed in group search</label><button class="web-button site-button primary">create group</button><button type="button" class="web-button site-button utility groups-suggestion" hidden></button></form></div>
    <section class="group-detail" hidden aria-label="selected group"></section>`;
  const $=s=>root.querySelector(s),status=$('.groups-status'),detail=$('.group-detail');
  const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
  function button(label,handler) {const el=text('button',label);el.type='button';el.className='web-button site-button utility';el.onclick=handler;return el;}
  function controls(value){root.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=value);}
  async function run(task) {
    if(busy||!active)return;busy=true;controls(true);status.textContent='working…';
    try {await task();}
    catch(error){if(active)status.textContent=error.message;}
    finally{busy=false;if(active)controls(false);}
  }
  function renderList(list,groups) {
    list.replaceChildren();
    for(const group of groups) {
      const li=document.createElement('li');li.append(button(group.name,()=>run(()=>open(group.id))));
      li.append(text('p',group.status ? (group.status==='pending'?'request awaiting approval':group.role) : group.description));list.append(li);
    }
    if(!groups.length)list.append(text('li','No groups here yet.'));
  }
  async function mine(){const result=await request('/api/groups');if(active)renderList($('.groups-mine'),result.groups);}
  async function act(operation,data={}) {
    await request(`/api/groups/${selected}/${operation}`,data);
    if(!active)return;
    await mine();await open(selected);
    if(active)status.textContent=operation==='request'?'request sent — awaiting approval':operation==='leave'?'you have left the group or canceled your request':'group updated';
  }
  async function open(id) {
    const version=++revision;detail.hidden=true;
    const {group}=await request('/api/groups/'+id);
    if(!active||version!==revision)return;
    selected=id;
    detail.hidden=false;detail.replaceChildren(text('h3',group.name),text('p',group.description));
    status.textContent='';
    if(group.status!=='active') {
      detail.append(text('p',group.status==='pending'?'Your request is waiting for approval.':'Request to join this group to become a member.'));
      detail.append(button(group.status==='pending'?'cancel request':'request to join',()=>run(()=>act(group.status==='pending'?'leave':'request'))));
      return;
    }
    detail.append(text('p',`${group.listed?'Listed':'Unlisted'} group · your role: ${group.role}`));
    const share=new URL('/profile',location.origin);share.searchParams.set('group',group.id);
    const link=text('a','group invitation link');link.href=share.href;detail.append(link);
    detail.append(text('p','Share this link with friends. They must sign in and request approval to join.'));
    if(['owner','approver'].includes(group.role)) {
      const form=document.createElement('form');form.className='group-settings';
      form.innerHTML='<label>group description<textarea name="description" maxlength="400" rows="3"></textarea></label><label><input type="checkbox" name="listed"> Listed in group search</label><button class="web-button site-button">save group settings</button>';
      form.elements.description.value=group.description;form.elements.listed.checked=group.listed;
      form.onsubmit=event=>{event.preventDefault();run(()=>act('settings',{description:form.elements.description.value,listed:form.elements.listed.checked}));};
      detail.append(form);
    }
    const members=document.createElement('ul');members.className='group-members';
    for(const member of group.members) {
      const li=document.createElement('li');li.append(text('strong',member.name),text('span',` · ${member.status==='pending'?'awaiting approval':member.role}${member.me?' (you)':''}`));
      const actions=document.createElement('div');actions.className='dialog-actions';
      const action=(label,operation,confirmText)=>actions.append(button(label,()=>{
        if(confirmText&&!window.confirm(confirmText))return;
        run(()=>act(operation,{target:member.id}));
      }));
      if(member.status==='pending'&&['owner','approver'].includes(group.role)) {action('approve','approve');action('decline','decline');}
      if(group.role==='owner'&&member.status==='active'&&!member.me) {
        action(member.role==='approver'?'remove approval rights':'grant approval rights',member.role==='approver'?'revoke':'grant');
        action('remove member','remove',`Remove ${member.name} from this group? Their drawings remain public.`);
        action('make owner','transfer',`Make ${member.name} the owner? You will become a regular member and lose management rights.`);
      }
      li.append(actions);members.append(li);
    }
    detail.append(text('h4','members & requests'),members);
    if(group.role!=='owner') detail.append(button('leave group',()=>{if(confirm('Leave this group? Your drawings will remain public.'))run(()=>act('leave'));}));
    else detail.append(text('p','To leave, first make another approved member the owner.'));
  }
  $('.groups-refresh').onclick=()=>run(async()=>{await mine();if(selected)await open(selected);else status.textContent='groups refreshed';});
  $('.groups-search').onsubmit=event=>{
    event.preventDefault();const query=event.currentTarget.elements.query.value.trim();
    run(async()=>{const result=await request('/api/groups/search?q='+encodeURIComponent(query));if(active){renderList($('.groups-results'),result.groups);status.textContent='search complete';}});
  };
  $('.groups-create').onsubmit=event=>{
    event.preventDefault();const form=event.currentTarget;
    const input={name:form.elements.name.value,description:form.elements.description.value,listed:form.elements.listed.checked};
    $('.groups-suggestion').hidden=true;
    run(async()=>{
      try {
        const result=await request('/api/groups',input);if(!active)return;
        form.reset();await mine();await open(result.id);if(active)status.textContent='group created';
      } catch(error) {
        if(active&&error.suggestion){const suggested=$('.groups-suggestion');suggested.hidden=false;suggested.textContent=`use ${error.suggestion}`;suggested.onclick=()=>{form.elements.name.value=error.suggestion;suggested.hidden=true;form.elements.name.focus();};}
        throw error;
      }
    });
  };
  run(async()=>{
    await mine();if(!active)return;
    const id=new URLSearchParams(location.search).get('group');
    if(id&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))await open(id);
    else status.textContent='';
  });
  return ()=>{active=false;revision++;root.replaceChildren();root.hidden=true;};
}
