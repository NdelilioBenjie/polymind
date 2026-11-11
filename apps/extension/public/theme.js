// Extension pages may not run inline scripts, so the pre-paint theme check lives here.
try {
  var saved = JSON.parse(localStorage.getItem("polymind") || "{}").state || {};
  var theme = saved.theme || "system";
  if (theme === "system") theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
} catch (e) {}
