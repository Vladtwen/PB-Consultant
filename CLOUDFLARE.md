# Публикация The-final

В этом репозитории index.html, css/, js/ и images/ лежат в корне.
Конфигурация wrangler.jsonc поэтому использует assets.directory = ".".
Не заменяйте этот путь на ./pb-v3: такой папки в этой версии нет.

Настройки Cloudflare Workers Builds:

- Root directory: корень репозитория.
- Build command: пусто, сайт не требует сборки.
- Deploy command для production: npx wrangler deploy.
- Non-production deploy command: npx wrangler versions upload.

versions upload загружает предварительную версию, но не публикует её в production.
Для обновления основного сайта используйте production-ветку и deploy.
Имя Worker в конфигурации — the-final.

.assetsignore исключает тесты, документацию и служебные файлы из публикации.
Конфигурация добавлена поверх ветки «Описание-таможенных-споров»; текст кейса сохранён.

Документация: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
