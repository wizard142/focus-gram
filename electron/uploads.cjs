const { isInstagram } = require('./policy.cjs');
function composerScript() {
  return `(() => {
    const selectors=['a[href="/create/select/"]','a[href="/create/style/"]','[aria-label="New post"]','[aria-label="Create"]'];
    let target=selectors.map(s=>document.querySelector(s)).find(Boolean);
    if(target)target=target.closest('a,button,[role="button"]')||target;
    if(!target)target=[...document.querySelectorAll('a,button,[role="button"]')].find(e=>/^(create|new post|create new post)$/i.test(e.textContent.trim()));
    if(!target)return false;target.click();return true;
  })()`;
}
function markFileInputScript(kind) {
  return `(() => {
    const inputs=[...document.querySelectorAll('input[type="file"]')];
    const dialog=document.querySelector('[role="dialog"] input[type="file"]');
    const suitable=inputs.filter(e=>${JSON.stringify(kind)}==='reel'?/video/i.test(e.accept):/image|video/i.test(e.accept));
    const input=dialog||suitable.find(e=>e.multiple)||suitable[0]||(inputs.length===1?inputs[0]:null);
    if(input){document.querySelectorAll('[data-focus-gram-upload]').forEach(e=>e.removeAttribute('data-focus-gram-upload'));input.setAttribute('data-focus-gram-upload','true');return true;}
    const option=[...document.querySelectorAll('button,[role="button"],a')].find(e=>/^(post|create post)$/i.test(e.textContent.trim()));option?.click();return false;
  })()`;
}
async function attachFile(
  wc,
  file,
  kind,
  { wait = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}
) {
  if (!isInstagram(wc.getURL())) throw Error('Open Instagram and sign in first.');
  let clicked = false;
  for (let i = 0; i < 20; i++) {
    if (wc.isDestroyed()) throw Error('Instagram closed.');
    try {
      clicked = await wc.executeJavaScript(composerScript(), true);
    } catch {}
    if (clicked) break;
    await wait(250);
  }
  if (!clicked)
    throw Error(
      'Instagram’s Create button was not found. Open Create in Instagram and choose your file there.'
    );
  let marked = false;
  for (let i = 0; i < 30; i++) {
    if (wc.isDestroyed()) throw Error('Instagram closed.');
    marked = await wc.executeJavaScript(markFileInputScript(kind), true);
    if (marked) break;
    await wait(250);
  }
  if (!marked)
    throw Error(
      'Instagram’s file picker did not appear. Open Create in Instagram to upload manually.'
    );
  if (!isInstagram(wc.getURL())) throw Error('Instagram navigated away. Upload stopped.');
  const attached = wc.debugger.isAttached();
  try {
    if (!attached) wc.debugger.attach('1.3');
    const { root } = await wc.debugger.sendCommand('DOM.getDocument', { depth: 0 });
    const { nodeId } = await wc.debugger.sendCommand('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: 'input[data-focus-gram-upload="true"]',
    });
    if (!nodeId) throw Error('Instagram’s file picker changed. Try again.');
    await wc.debugger.sendCommand('DOM.setFileInputFiles', { nodeId, files: [file.path] });
  } finally {
    if (!attached && wc.debugger.isAttached()) wc.debugger.detach();
  }
}
module.exports = { composerScript, markFileInputScript, attachFile };
