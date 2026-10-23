# Публикация The-final

В этом репозитории index.html, css/, js/ и images/ лежат в корне.
Конфигурация wrangler.jsonc поэтому использует assets.directory = ".".
Не заменяйте этот путь на ./pb-v3: такой папки в этой версии нет.

assets.html_handling = "auto-trailing-slash" открывает index.html по адресу /
и uslugi/index.html по адресу /uslugi/. Режим "none" отключает это поведение
и приводит к 404 на главной, хотя /index.html продолжает работать.
Отдельные страницы .html перенаправляются на адрес без расширения;
каталоги сохраняют завершающий слеш для правильных относительных ссылок.
not_found_handling = "404-page" оставляет настоящую ошибку для неизвестных URL.

После production deploy проверьте: / и /uslugi/ возвращают 200,
/uslugi/tamozhennye-spory открывается, случайный несуществующий адрес — 404.

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
