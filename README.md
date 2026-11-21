# claude-opencode-skill

Claude Code hands simple, self-contained chores to the OpenCode AI on this PC (free models) to save Claude tokens, then verifies the result.

## What it does

This Claude Code skill delegates simple chores — finding files, bulk reading, counting matches, translating or rewording text, and small standalone scripts, snippets or drafts — to OpenCode's free models so the main Claude conversation does not spend tokens on them. The result is always checked before it is used.

## Two modes

**Read-only (default)** — for searching and reading a real folder. Pass the folder with `-Dir`. It runs a per-run agent (`claude-ro`) that may only read/glob/grep/list. Writing, shell, web and other folders are denied. No OpenCode config file is changed.

**Write (`-Write`)** — for producing new files. It always runs in a fresh, empty temp folder (it refuses a `-Dir` outside `%TEMP%`) with auto-approve on, so it may create files and run commands there only.

Text-only tasks (translate, reword, draft) need neither option. Attach input files with `-File` (repeatable). Other options: `-TimeoutSec` (default 240).

## Model selection (automatic)

The wrapper picks the model from the task type and falls back down the chain on error, timeout or empty answer. Don't pass `-Model` normally.

| `-Task` (guessed if omitted) | Guess rule | Chain |
|---|---|---|
| `search` | `-Dir` given, no `-Write` | big-pickle → deepseek-v4.1-flash-free → mimo-v2.6-flash-free |
| `text` | no `-Dir`, no `-Write` | deepseek-v4.1-flash-free → big-pickle → mimo-v2.6-flash-free |
| `code` | `-Write` | **paid cheap:** claude-haiku-5-5 → gpt-5.4-mini, then **free:** big-pickle → deepseek-v4.1-flash-free |
| `vision` | an image passed with `-File` | nemotron-3.5-super-vl-free → big-pickle |

User's choice: free first, and cheap paid models only for code. Expensive models (Opus, Fable, GPT Pro, etc.) are never picked automatically. Use `-Model` only when the user names a model. `-FreeOnly` skips paid models.

## Install

Requires the OpenCode desktop app on Windows.

1. Copy this folder to `%USERPROFILE%\.claude\skills\opencode`.

The wrapper is then invoked as:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\.claude\skills\opencode\oc.ps1" <options>
```

## Usage

Read-only search in a real folder:

```powershell
... oc.ps1 -Dir "C:\path\to\project" -Prompt "Find every file that defines or calls sendInvoice. Reply only with relative paths and line numbers, one per line."
```

Write mode (only in a temp folder):

```powershell
... oc.ps1 -Write -Prompt "Create csv_to_json.py that reads input.csv and writes output.json. Only create that one file."
```

## Türkçe

### Ne yapar

Bu Claude Code skill'i, basit ve bağımsız işleri — dosya bulma, toplu okuma, eşleşme sayma, metin çevirme veya yeniden yazma, küçük bağımsız betik/parça/taslaklar — bu PC'deki ücretsiz OpenCode modellerine verir; böylece ana Claude sohbeti bu işler için token harcamaz. Sonuç her zaman kullanılmadan önce kontrol edilir.

### İki mod

**Salt okunur (varsayılan)** — gerçek bir klasörde arama ve okuma için. Klasör `-Dir` ile verilir. Çalıştırma başına, yalnızca okuma/glob/grep/listeye izin veren bir ajan (`claude-ro`) kullanılır. Yazma, kabuk, web ve diğer klasörler reddedilir. Hiçbir OpenCode yapılandırma dosyası değiştirilmez.

**Yazma (`-Write`)** — yeni dosya üretmek için. Her zaman yeni ve boş bir geçici klasörde çalışır (`%TEMP%` dışındaki bir `-Dir` reddedilir); otomatik onay açıktır, dolayısıyla dosya oluşturma ve komut çalıştırma yalnızca orada yapılabilir.

Yalnızca metin işleri (çevirme, yeniden yazma, taslak yazma) bu seçeneklerden hiçbirini gerektirmez. Girdi dosyaları `-File` ile eklenir (tekrarlanabilir). Diğer seçenek: `-TimeoutSec` (varsayılan 240).

### Otomatik model seçimi

Wrapper modeli görev türüne göre seçer; hata, zaman aşımı veya boş yanıtta zincir boyunca bir sonraki modele geçer. Normalde `-Model` verilmez.

| `-Task` (verilmezse tahmin edilir) | Tahmin kuralı | Zincir |
|---|---|---|
| `search` | `-Dir` verilmiş, `-Write` yok | big-pickle → deepseek-v4.1-flash-free → mimo-v2.6-flash-free |
| `text` | `-Dir` yok, `-Write` yok | deepseek-v4.1-flash-free → big-pickle → mimo-v2.6-flash-free |
| `code` | `-Write` | **ücretli ucuz:** claude-haiku-5-5 → gpt-5.4-mini, ardından **ücretsiz:** big-pickle → deepseek-v4.1-flash-free |
| `vision` | `-File` ile bir görsel verilmiş | nemotron-3.5-super-vl-free → big-pickle |

Kullanıcı tercihi: önce ücretsiz modeller; yalnızca kod için ucuz ücretli modeller. Pahalı modeller (Opus, Fable, GPT Pro vb.) otomatik olarak hiç seçilmez. `-Model` yalnızca kullanıcı bir model adı verdiğinde kullanılır. `-FreeOnly` ücretli modelleri atlar.

### Kurulum

Windows'ta OpenCode masaüstü uygulaması gerekir.

1. Bu klasörü `%USERPROFILE%\.claude\skills\opencode` konumuna kopyalayın.

### Kullanım

Gerçek bir klasörde salt okunur arama:

```powershell
... oc.ps1 -Dir "C:\path\to\project" -Prompt "Find every file that defines or calls sendInvoice. Reply only with relative paths and line numbers, one per line."
```

Yazma modu (yalnızca geçici klasörde):

```powershell
... oc.ps1 -Write -Prompt "Create csv_to_json.py that reads input.csv and writes output.json. Only create that one file."
```

### Lisans

MIT

## License

MIT
