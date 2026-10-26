const BLOCKED = /^\/(?:reels?|p|explore)(?:\/|$)/i;
function isInstagram(url) {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      (u.hostname === 'instagram.com' || u.hostname === 'www.instagram.com')
    );
  } catch {
    return false;
  }
}
function blockedRoute(url, focus = true) {
  if (!focus || !isInstagram(url)) return false;
  return BLOCKED.test(new URL(url).pathname);
}
const focusCSS = `
html[data-focus-gram="on"][data-focus-gram-page="home"] body main article:not(:has(form)),
html[data-focus-gram="on"][data-focus-gram-page="home"] body main [role="feed"],
html[data-focus-gram="on"] a[href^="/reel/"],
html[data-focus-gram="on"] a[href^="/reels/"],
html[data-focus-gram="on"] a[href^="/explore/"],
html[data-focus-gram="on"] a[href^="/p/"] { display:none !important; }
html[data-focus-gram="on"] body main { min-height:80vh; }
#focus-gram-note { margin:24px auto;max-width:460px;padding:18px 24px;background:#18221b;color:#d5fb78;border-radius:16px;font:14px/1.6 system-ui; text-align:center; }
html:not([data-focus-gram="on"]) #focus-gram-note {display:none!important;}
`;
// This function runs only in Instagram's isolated renderer, with no Node bridge.
function installFocus(focus) {
  const source = `(() => {
 window.__fgCleanup?.();
 const enabled=${JSON.stringify(Boolean(focus))};
 document.documentElement.dataset.focusGram=enabled?'on':'off';
 const blocked=/^\\/(?:reels?|p|explore)(?:\\/|$)/i;
 const guard=()=>{
  document.documentElement.dataset.focusGramPage=location.pathname==='/'?'home':'other';
  if(!enabled)return;
  if(blocked.test(location.pathname)){location.replace('https://www.instagram.com/');return;}
  if(location.pathname==='/'){
   let note=document.getElementById('focus-gram-note');
   const main=document.querySelector('main');
   if(main&&!note){note=document.createElement('div');note.id='focus-gram-note';note.textContent='Focus mode is on. Your Stories stay; the feed can wait.';main.append(note);}
  } else { document.getElementById('focus-gram-note')?.remove(); }
 };
 const click=e=>{const a=e.target.closest?.('a[href]');if(enabled&&a&&blocked.test(new URL(a.href,location.href).pathname)){e.preventDefault();e.stopImmediatePropagation();}};
 document.addEventListener('click',click,true);
 const observer=new MutationObserver(guard);observer.observe(document.documentElement,{childList:true,subtree:true});
 window.addEventListener('popstate',guard); const timer=setInterval(guard,700);guard();
 window.__fgCleanup=()=>{observer.disconnect();clearInterval(timer);document.removeEventListener('click',click,true);window.removeEventListener('popstate',guard);};
 })()`;
  return source;
}
module.exports = { isInstagram, blockedRoute, focusCSS, installFocus };
