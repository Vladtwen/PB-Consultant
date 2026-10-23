// Audit every HTML link and fragment, plus deployed HTTP routes when given an origin.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const pages = ['index.html', '404.html', ...['uslugi', 'praktika', 'legal'].flatMap(dir =>
  fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.html')).map(f => `${dir}/${f}`))];
const problems = [];
const routes = new Set(['/']);
let links = 0;
function canonical(file) {
  return '/' + file.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');
}
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  if (page !== '404.html') routes.add(canonical(page));
  for (const match of html.matchAll(/href="([^"]*)"/g)) {
    const href = match[1];
    if (/^(?:[a-z]+:|\/\/)/i.test(href)) continue;
    links++;
    if (!href || href === '#') { problems.push(`${page}: empty link`); continue; }
    const u = new URL(href, `https://site.invalid/${page}`);
    let file = decodeURIComponent(u.pathname).slice(1);
    if (!file || file.endsWith('/')) file += 'index.html';
    if (!path.extname(file)) file += '.html';
    const target = path.join(root, file);
    if (!fs.existsSync(target)) { problems.push(`${page}: missing ${href}`); continue; }
    if (file.endsWith('.html')) {
      if (file !== '404.html') routes.add(canonical(file));
      if (u.hash) {
        const ids = [...fs.readFileSync(target, 'utf8').matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
        if (!ids.includes(decodeURIComponent(u.hash.slice(1)))) problems.push(`${page}: missing anchor ${href}`);
      }
    }
  }
}
console.log(`Local audit: ${pages.length} pages, ${links} links, ${problems.length} problems.`);
async function main() {
  const origin = process.argv[2];
  if (origin) {
    const check = async (route, expected) => {
      try {
        const response = await fetch(new URL(route, origin), {signal: AbortSignal.timeout(20000)});
        const body = await response.text();
        if (response.status !== expected || (expected === 200 && /<title>Страница не найдена/.test(body)))
          problems.push(`HTTP ${response.status}: ${route} (expected ${expected})`);
      } catch (error) { problems.push(`${route}: ${error.message}`); }
    };
    const list = [...routes];
    for (let i = 0; i < list.length; i += 4) await Promise.all(list.slice(i, i + 4).map(r => check(r, 200)));
    await check('/__navigation-audit-missing-page__', 404);
    console.log(`HTTP audit: ${routes.size} page routes and one missing-page route.`);
  }
  if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
}
main();
