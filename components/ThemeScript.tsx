// Runs before first paint so the page never flashes the wrong theme.
const script = `(function(){try{var t=localStorage.getItem("finlite:theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.dataset.theme="dark"}var l=localStorage.getItem("finlite:lang");if(l==="ky"){document.documentElement.lang="ky"}}catch(e){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
