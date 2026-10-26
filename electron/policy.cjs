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
html[data-focus-gram="on"][data-focus-gram-page="home"] body main article:not(:has(input[type="password"], input[name="username"])),
html[data-focus-gram="on"][data-focus-gram-page="home"] body main [role="feed"],
html[data-focus-gram="on"] a[href^="/reel/"],
html[data-focus-gram="on"] a[href^="/reels/"],
html[data-focus-gram="on"] a[href^="/explore/"],
html[data-focus-gram="on"] a[href^="/p/"] { display:none !important; }
html[data-focus-gram="on"] body main { min-height:80vh; }
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

 };
 const click=e=>{const a=e.target.closest?.('a[href]');if(enabled&&a&&blocked.test(new URL(a.href,location.href).pathname)){e.preventDefault();e.stopImmediatePropagation();}};
 document.addEventListener('click',click,true);
 const observer=new MutationObserver(guard);observer.observe(document.documentElement,{childList:true,subtree:true});
 window.addEventListener('popstate',guard); const timer=setInterval(guard,700);guard();
 window.__fgCleanup=()=>{observer.disconnect();clearInterval(timer);document.removeEventListener('click',click,true);window.removeEventListener('popstate',guard);};
 })()`;
  return source;
}
function themeScript(theme) {
  const dark = theme === 'dark';
  return `(() => {
    document.documentElement.classList.toggle('__fb-dark-mode', ${dark});
    document.documentElement.classList.toggle('__fb-light-mode', ${!dark});
    document.documentElement.style.colorScheme=${JSON.stringify(theme)};
    try {localStorage.setItem('theme',${JSON.stringify(theme)});}catch{}
  })()`;
}
module.exports = { isInstagram, blockedRoute, focusCSS, installFocus, themeScript };
