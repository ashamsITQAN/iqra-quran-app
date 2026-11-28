// The app's script must at least parse, and its braces must balance: a line cut short by a stray comment once shipped a blank app.
const fs = require("fs"), vm = require("vm");
const html = fs.readFileSync(__dirname + "/../public/index.html", "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) { console.error("no inline script found"); process.exit(1); }
scripts.forEach((s, i) => { new vm.Script(s, { filename: "index.html script " + i }); });
for (const f of ["engine.js", "sw.js"]) new vm.Script(fs.readFileSync(__dirname + "/../public/" + f, "utf8"), { filename: f });
console.log("syntax ok:", scripts.length, "inline script(s), engine.js, sw.js");
