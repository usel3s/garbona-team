# Как импортировать в GitBook

Пакет готов для **Import → Markdown / ZIP**.

## Вариант A: ZIP

1. Откройте GitBook → Space → **Import**.
2. Выберите **Import from Markdown, HTML or ZIP**.
3. Загрузите файл `garbona-gitbook-manuals.zip` из папки `docs/`.
4. Проверьте, что подтянулся `SUMMARY.md` (оглавление).

## Вариант B: отдельные .md

Загрузите содержимое папки `docs/gitbook/` как набор Markdown-файлов. Структура:

```text
gitbook/
  SUMMARY.md
  README.md
  proekt/
  dlya-vorkerov/
  funcional-bota/
```

## Источник структуры

Структура разделов адаптирована с публичной документации [Omen Project](https://omen-project.gitbook.io/omen-project), переписана под бренд и процессы **Garbona** (правила, бот, контакты).
