// Run after adding a public HTML page: node tools/update-search-metadata.cjs
// Use --check to detect stale metadata and discovery files without writing them.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const origin = 'https://xn--80atdhccwjcf4h.site';
const checkOnly = process.argv.includes('--check');
const files = ['index.html', ...['uslugi', 'praktika', 'legal'].flatMap(dir =>
  fs.readdirSync(path.join(root, dir)).filter(file => file.endsWith('.html')).sort().map(file => `${dir}/${file}`))];
const changed = [];
const sitemap = [];
const escapeAttribute = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const publicUrl = file => origin + '/' + file.replace(/(^|\/)index\.html$/, '$1').replace(/\.html$/, '');

function write(file, next) {
  const target = path.join(root, file);
  const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (current !== null && current.replace(/\r\n/g, '\n') === next.replace(/\r\n/g, '\n')) return;
  changed.push(file);
  if (!checkOnly) fs.writeFileSync(target, next, 'utf8');
}

function meta(head, attribute, name, value) {
  const expression = new RegExp(`<meta\\s+${attribute}="${name}"[^>]*>`, 'i');
  const tag = `<meta ${attribute}="${name}" content="${escapeAttribute(value)}">`;
  return expression.test(head) ? head.replace(expression, tag) : head + tag;
}

for (const file of files) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
  if (!headMatch) throw new Error(`Missing head: ${file}`);
  const newline = html.includes('\r\n') ? '\r\n' : '\n';
  let head = headMatch[1].replace(/(?:\r?\n)?<!-- search-metadata:start -->[\s\S]*?<!-- search-metadata:end -->(?:\r?\n)?/g, '');
  if (file === 'index.html') {
    head = head.replace(/<title>[\s\S]*?<\/title>/i, '<title>ПБ Консультант — правовое бюро | Юридическая помощь бизнесу</title>');
  }
  const title = decode(head.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '');
  const legalDescriptions = {
    'legal/privacy.html': 'Политика конфиденциальности сайта ПБ Консультант: сведения об обработке и защите персональных данных.',
    'legal/consent.html': 'Условия согласия на обработку персональных данных при обращении в ПБ Консультант.'
  };
  const description = legalDescriptions[file] || decode(head.match(/<meta name="description" content="([^"]*)"/i)?.[1] || '');
  if (!title || !description) throw new Error(`Missing title or description: ${file}`);
  head = meta(head, 'name', 'description', description);
  head = meta(head, 'property', 'og:title', title);
  head = meta(head, 'property', 'og:description', description);
  head = meta(head, 'property', 'og:type', 'website');
  head = meta(head, 'property', 'og:locale', 'ru_RU');
  const url = publicUrl(file);
  const graph = [];
  if (file === 'index.html') {
    graph.push({
      '@type': 'Organization', '@id': `${origin}/#organization`, name: 'ПБ Консультант',
      url: `${origin}/`, email: '410012a@gmail.com', telephone: '+79063075697',
      contactPoint: { '@type': 'ContactPoint', telephone: '+79063075697', email: '410012a@gmail.com', contactType: 'customer service', availableLanguage: 'ru' }
    }, {
      '@type': 'WebSite', '@id': `${origin}/#website`, url: `${origin}/`, name: 'ПБ Консультант',
      inLanguage: 'ru-RU', publisher: { '@id': `${origin}/#organization` }
    });
  }
  graph.push({
    '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description,
    inLanguage: 'ru-RU', isPartOf: { '@id': `${origin}/#website` }
  });
  const structuredData = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  head += ['', '<!-- search-metadata:start -->', `<link rel="canonical" href="${url}">`,
    `<meta property="og:url" content="${url}">`, `<script type="application/ld+json">${structuredData}</script>`,
    '<!-- search-metadata:end -->', ''].join(newline);
  write(file, html.replace(headMatch[0], `<head>${head}</head>`));

  const intro = html.match(/<section class="page-intro"[^>]*>[\s\S]*?<\/section>/)?.[0] || '';
  const pending = intro.includes('class="practice-status"');
  if (!file.startsWith('legal/') && !pending) sitemap.push(url);
}

write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemap.map(url => `  <url><loc>${escapeAttribute(url)}</loc></url>`).join('\n') + '\n</urlset>\n');
console.log(`${files.length} pages; ${sitemap.length} ready URLs in sitemap; ${changed.length} ${checkOnly ? 'stale' : 'updated'} files.`);
if (checkOnly && changed.length) {
  console.error(changed.join('\n'));
  process.exitCode = 1;
}
