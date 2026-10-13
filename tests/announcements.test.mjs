import test from 'node:test';
import assert from 'node:assert/strict';
import {announcementInput} from '../backend/announcements.mjs';
import {announcementBody,announcementMarkup,announcementPath} from '../src/announcement-format.js';
import {announcementId,announcementState} from '../src/admin-announcements.js';

test('saved announcement state distinguishes drafts from a confirmed timestamp',()=>{
  assert.match(announcementState({version:0,status:'draft'}),/not saved yet/);
  assert.match(announcementState({version:1,status:'draft'}),/no publication scheduled/);
  const item={version:2,status:'scheduled',published_at:'2099-01-01T17:00:00Z'};
  const label=announcementState(item);
  assert.match(label,/Scheduled for/);
  assert.match(label,/2099/);
  assert.match(announcementState({...item,status:'published'}),/^Published/);
});
test('announcement IDs support native UUIDs and secure HTTP-compatible fallback',()=>{
  assert.equal(announcementId({randomUUID:()=> 'native'}),'native');
  let filled=false;
  const id=announcementId({getRandomValues:bytes=>{filled=true;return bytes.fill(255);}});
  assert.equal(filled,true);
  assert.equal(id,'ffffffff-ffff-4fff-bfff-ffffffffffff');
});
const input={id:'12345678-1234-1234-1234-123456789abc',version:0,title:'An update',body:'Hello',status:'draft'};

test('announcement addresses use the saved slug and retain legacy targets after title edits',()=>{
  const item={...input,slug:'an-update~EjRWeBI0EjQSNBI0VniavA',published_at:'2026-10-13T12:00:00Z'};
  assert.equal(announcementPath(item),'/info#an-update~EjRWeBI0EjQSNBI0VniavA');
  assert.equal(announcementPath({...item,title:'A different title'}),announcementPath(item));
  const html=announcementMarkup([item]);
  assert.ok(html.includes(`id="${item.slug}"`));
  assert.ok(html.includes(`id="announcement-${item.id}"`));
  assert.equal(announcementPath(input),`/info#announcement-${input.id}`);
});
test('announcement validation bounds content and rejects invalid schedules and revisions',()=>{
  assert.equal(announcementInput(input).title,'An update');
  assert.equal(announcementInput(input).description,'');
  assert.equal(announcementInput({...input,description:' A short introduction. '}).description,'A short introduction.');
  for (const description of ['x'.repeat(241),'two\nlines',null,42]) assert.throws(()=>announcementInput({...input,description}));
  for(const patch of [{version:-1},{id:'bad'},{title:''},{body:'x'.repeat(10001)},{status:'other'},{status:'scheduled',publishAt:'2020-01-01T00:00:00Z'}]) {
    assert.throws(()=>announcementInput({...input,...patch}));
  }
  assert.equal(announcementInput({...input,status:'scheduled',publishAt:'2099-01-01T00:00:00Z'}).publishAt,'2099-01-01T00:00:00.000Z');
});
test('announcement formatting permits bold and lists without interpreting HTML',()=>{
  const html=announcementBody('**Hello**\n\n- one\n- <script>alert(1)</script>');
  assert.match(html,/<strong>Hello<\/strong>/);assert.match(html,/<ul><li>one<\/li>/);
  assert.doesNotMatch(html,/<script>/);assert.match(html,/&lt;script&gt;/);
  const card=announcementMarkup([{...input,title:'<img src=x>',published_at:'2026-10-12T12:00:00Z'}]);
  assert.doesNotMatch(card,/<img/);assert.match(card,/&lt;img/);
});

test('announcement links support site paths and web addresses while escaping content',()=>{
  const html=announcementBody('**[Profile](/profile)**\n\n- [Guide](/info#drawing-guide)\n- [Search](https://example.com/?a=1&b=2)');
  assert.match(html,/<strong><a href="\/profile">Profile<\/a><\/strong>/);
  assert.match(html,/<li><a href="\/info#drawing-guide">Guide<\/a><\/li>/);
  assert.match(html,/href="https:\/\/example.com\/\?a=1&amp;b=2"/);
  assert.match(announcementBody('[<img src=x>](/profile)'),/&lt;img src=x&gt;<\/a>/);
  for(const url of ['javascript:alert(1)','data:text/html,test','//evil.example','/\\evil.example','https://user:pass@example.com','java\u0000script:test']) {
    assert.doesNotMatch(announcementBody(`[unsafe](${url})`),/<a /);
  }
});

test('only recognized standalone YouTube URLs become privacy-enhanced players',()=>{
  const id='dQw4w9WgXcQ';
  for(const url of [`https://www.youtube.com/watch?v=${id}&feature=share`,`https://youtu.be/${id}?si=example`,`https://youtube.com/shorts/${id}`,`https://www.youtube.com/live/${id}`]) {
    const html=announcementBody(`An introduction\n\n${url}\n\nMore text`);
    assert.match(html,new RegExp(`src="https://www.youtube-nocookie.com/embed/${id}"`));
    assert.match(html,/loading="lazy"/);
    assert.match(html,/title="YouTube video"/);
    assert.match(html,/watch on YouTube/);
    assert.doesNotMatch(html,/autoplay|feature=|si=/);
  }
  for(const url of [`https://youtube.com.evil.example/watch?v=${id}`,`https://youtube.com@evil.example/watch?v=${id}`,'https://youtube.com/watch?v=invalid',`https://youtu.be/${id}/extra`,`http://youtu.be/${id}`]) {
    assert.doesNotMatch(announcementBody(url),/<iframe/);
  }
  assert.doesNotMatch(announcementBody(`[Video](https://youtu.be/${id})`),/<iframe/);
  assert.match(announcementBody(`[Video](https://youtu.be/${id})`),/<a /);
  assert.doesNotMatch(announcementBody('<iframe src="https://evil.example"></iframe>'),/<iframe/);
});
