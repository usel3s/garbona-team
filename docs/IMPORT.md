---
description: Как загрузить документацию Garbona в GitBook (ZIP или Markdown).
---

# Импорт в GitBook

Пакет лежит в `docs/gitbook/` и готов для **Import → Markdown / ZIP**.

## Вариант A — ZIP

{% stepper %}
{% step %}
Откройте GitBook → нужный Space → **Import**.
{% endstep %}

{% step %}
Выберите **Import from Markdown, HTML or ZIP**.
{% endstep %}

{% step %}
Загрузите ZIP с содержимым `docs/gitbook/` (обязательно с `SUMMARY.md` в корне архива).
{% endstep %}

{% step %}
Проверьте оглавление и опубликуйте Space.
{% endstep %}
{% endstepper %}

## Вариант B — папка Markdown

Загрузите папку `docs/gitbook/` как набор Markdown-файлов.

```text
gitbook/
├── SUMMARY.md
├── README.md
├── proekt/
├── dlya-vorkerov/
└── funcional-bota/
```

{% hint style="info" %}
Пути и имена файлов — русские транслитом (`sayty.md`, `podgotovka-ustroistva.md`). Заголовки страниц — на русском.
{% endhint %}

## Структура

| Раздел | Путь |
| --- | --- |
| Проект | `proekt/o-komande.md`, `pravila.md`, `ssylki.md` |
| Для воркеров | `dlya-vorkerov/…` |
| Функционал бота | `funkcional-bota/zayavka.md`, `sayty.md`, `koshelek.md`, `vyplaty.md` |

## Блоки GitBook

* `{% hint %}` — info / success / warning / danger
* `{% stepper %}` / `{% step %}` — пошаговые сценарии
* `{% tabs %}` / `{% tab %}` — варианты
* `{% content-ref %}` — карточки-ссылки
* `{% embed %}` — встраивание ссылок
* `<details>` — FAQ
* таблицы, чеклисты `- [ ]`, code blocks

{% hint style="success" %}
После импорта откройте любую страницу в редакторе GitBook — блоки подтянутся автоматически.
{% endhint %}
