---
description: Как загрузить документацию Garbona в GitBook (ZIP или Markdown).
---

# Import to GitBook

Пакет лежит в `docs/gitbook/` и готов для **Import → Markdown / ZIP**.

## Variant A — ZIP

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

## Variant B — Markdown folder

Загрузите папку `docs/gitbook/` как набор Markdown-файлов.

```text
gitbook/
├── SUMMARY.md          ← оглавление
├── README.md           ← главная
├── project/            ← о команде, правила, ссылки
├── for-workers/        ← мануалы по трафику
└── bot/                ← функционал Telegram-бота
```

{% hint style="info" %}
Имена файлов и папок — на английском (`sites.md`, `device-setup.md`). Заголовки страниц внутри — на русском для воркеров.
{% endhint %}

## Naming map

| Старое | Новое |
| --- | --- |
| `proekt/` | `project/` |
| `dlya-vorkerov/` | `for-workers/` |
| `funkcional-bota/` | `bot/` |
| `sayty.md` | `sites.md` |
| `koshelek.md` | `wallet.md` |
| `vyplaty.md` | `payouts.md` |
| `zayavka.md` | `application.md` |
| `podgotovka-ustroistva.md` | `device-setup.md` |
| `khuki.md` | `hooks.md` |
| `kloaking.md` | `cloaking.md` |
| `kreativy.md` | `creatives.md` |

## GitBook blocks we use

В мануалах активно используются:

* `{% hint %}` — info / success / warning / danger
* `{% stepper %}` / `{% step %}` — пошаговые сценарии
* `{% tabs %}` / `{% tab %}` — варианты (iOS/Android, домены, источники)
* `{% content-ref %}` — карточки-ссылки на другие страницы
* `<details>` — FAQ и раскрывающиеся блоки
* таблицы, чеклисты `- [ ]`, code blocks

{% hint style="success" %}
После импорта откройте любую страницу в редакторе GitBook — блоки подтянутся автоматически, если синтаксис сохранён.
{% endhint %}
