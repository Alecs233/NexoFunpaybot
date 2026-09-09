# 🤖 NexoBot — FunPay Rust Accounts Monitor

NexoBot este un bot standalone dezvoltat în **JavaScript ESM** (Node.js 20+) care monitorizează ofertele de conturi Rust de pe [FunPay (Lots #250)](https://funpay.com/en/lots/250/) și trimite notificări automate în timp real pe un canal Discord prin **Discord Webhook**.

---

## ⚡ Caracteristici principale

- 🎯 **Monitorizare automată FunPay**: Verifică periodic loturile de conturi Rust de pe FunPay.
- 🛡️ **Filtrare inteligentă împotriva ofertelor nedorite**:
  - **Filtru 1 (Rental & Boosting)**: Elimină automat anunțurile de închiriere/boost/servicii (`rent`, `rental`, `boost`, `carry`, `farming`, `аренда`, `прокачка`, `буст` etc.).
  - **Filtru 2 (Zero Hours)**: Elimină automat conturile fără ore de joc (`0 hours`, `0h`, `0 hrs`, `0 ч`, `rust 0`, `zero hours` etc.).
  - **Filtru 3 (DLC & Skin Detection)**: Identifică anunțurile cu DLC-uri, battlepass, skin pack-uri (`dlc`, `battle pass`, `skin bundle`, `twitch drop`, `founder` etc.) și le marchează cu embed auriu și alertă prioritară.
- 💾 **Sistem anti-duplicate cu salvare atomică**: Păstrează istoricul ID-urilor văzute în `data/state.json` (până la 10.000 de intrări) pentru a garanta că nicio ofertă nu este trimisă de două ori.
- 🌱 **Seed inițial inteligent**: La prima pornire, stochează ofertele existente fără a trimite spam pe Discord.
- 🔔 **Discord Webhooks cu Embed-uri bogate**: Notificări stilizate cu preț, platformă, status vânzător (online/offline) și link direct FunPay.
- ⏱️ **Protecție Rate Limit**: Tratează automat răspunsurile HTTP 429 cu pauze dinamice (`Retry-After`) și decalaj de 500ms între mesaje.
- 🔒 **Securitate**: Webhook-urile și token-urile sunt mascate în loguri și nu sunt expuse niciodată.
- 🚀 **Ușor de instalat și rulat**: Fără build step, fără TypeScript, fără compilare, fără token de Discord bot.

---

## 📋 Cerințe de sistem

- **Node.js**: Versiunea `20.0.0` sau mai nouă (LTS recomandat).
  - Verifică versiunea instalată rulând în terminal: `node -v`
  - Descărcare Node.js: [https://nodejs.org/](https://nodejs.org/)
- **Sistem de operare**: Windows 10/11, Linux (Ubuntu, Debian, CentOS) sau macOS.

---

## 🚀 Instalare și Pornire Rapidă

### 🪟 Pe Windows

1. Deschide un terminal (**CMD** sau **PowerShell**) în folderul `nexobot-funpay`.
2. Configurează mediul și pornește botul rulând exact comenzile:

```cmd
copy .env.example .env
npm install
npm start
```

Alternativ, poți da dublu-click pe **`start-windows.bat`**.

---

### 🐧 Pe Linux / VPS

1. Deschide terminalul în folderul proiectului:
```bash
cp .env.example .env
npm install
npm start
```

Sau folosește scriptul inclus:
```bash
chmod +x start-linux.sh
./start-linux.sh
```

---

## ⚙️ Configurare (`.env`)

Deschide fișierul `.env` creat și completează setările dorite:

```env
# URL-ul Webhook-ului Discord (Obligatoriu)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123456789012345678/abcdef...

# Intervalul de verificare în milisecunde (Implicit: 60000 = 60 de secunde)
FUNPAY_POLL_INTERVAL=60000

# Trimitere mesaj de pornire pe Discord (true / false)
STARTUP_MESSAGE=true

# Nivelul de logging în consolă (debug, info, warn, error)
LOG_LEVEL=info

# Port opțional pentru Health Check HTTP (Implicit: 3000)
PORT=3000
```

### Cum obții un Discord Webhook URL:
1. Deschide Discord și mergi în **Server Settings** > **Integrations** > **Webhooks** (sau setările canalului dorit > **Integrations** > **Webhooks**).
2. Apasă pe **New Webhook**.
3. Alege numele și canalul dorit.
4. Apasă pe **Copy Webhook URL** și lipește-l în fișierul `.env` la `DISCORD_WEBHOOK_URL`.

---

## 🔄 Rulare 24/7 pe Linux / VPS cu PM2

Pentru a menține botul activ 24/7 în fundal și a reporni automat la restartul serverului:

```bash
# 1. Instalează PM2 global
npm install -g pm2

# 2. Pornește botul prin PM2
pm2 start src/index.js --name nexobot-funpay

# 3. Salvează lista de procese pentru repornire automată la boot
pm2 save
pm2 startup
```

Comenzi utile PM2:
- `pm2 logs nexobot-funpay` — afișează logurile live
- `pm2 restart nexobot-funpay` — repornește botul
- `pm2 stop nexobot-funpay` — oprește botul
- `pm2 status` — statusul proceselor active

---

## 🧠 Cum funcționează sistemul de filtrare și stocare

### 1. Filtre active
1. **Filtru Servicii & Închiriere**:
   - Respinge anunțurile cu termeni precum: `rent`, `rental`, `hire`, `boost`, `coaching`, `carry`, `service`, `farm`, `grind`, `powerleveling`, `leveling`, `playing for`, `аренда`, `прокачка`, `буст`, `услуга`.
2. **Filtru 0 Ore**:
   - Respinge anunțurile cu expresii precum: `0 hours`, `0 hour`, `0 hrs`, `0 hr`, `0h`, `0 h`, `0 ore`, `0 ч`, `Rust 0`, `zero hours`.
3. **Filtru DLC / Skin Pack-uri**:
   - Detectează: `dlc`, `battle pass`, `skin pack`, `skin bundle`, `twitch drop`, `founder`, `supporter`, `legacy`, `pack`, `bundle`.
   - **Nu respinge oferta**, ci o marchează cu embed auriu (`0xFFD700`), text de atenționare `‼️ **DLC ACCOUNT — CHECK NOW!**` și câmp suplimentar `‼️ URGENT — DLC Content`.

### 2. Stocarea ofertelor (`data/state.json`)
- La prima pornire, botul descarcă toate ofertele active și le salvează în `data/state.json` (Seed inițial), astfel încât să nu trimită notificări pentru anunțurile vechi.
- La fiecare verificare ulterioară, doar ofertele cu ID-uri noi sunt trimise pe Discord.
- Salvarea se face **atomic** (scriere în `data/state.json.tmp` urmată de redenumire) pentru a preveni coruperea fișierului în caz de oprire bruscă a alimentării sau procesului.
- Dacă fișierul este corupt accidental, botul îl redenumeste în `state.json.broken` și generează automat o stare nouă, continuând funcționarea fără întrerupere.
- Lista de ID-uri este limitată automat la ultimele **10.000** de înregistrări.

---

## 🧪 Rulare Teste Automate

Proiectul include o suită completă de teste automate:

```bash
npm test
```

Testele verifică:
- Filtrele de rental / boost / service
- Filtrele de 0 ore
- Detecția cuvintelor cheie DLC
- Parsarea HTML-ului de la FunPay
- Salvarea atomică și recuperarea din erori a `state-store`
- Construirea embed-urilor Discord
- Funcționarea endpoint-ului `/health`

---

## 📁 Structura Fișierelor

```
nexobot-funpay/
├── src/
│   ├── index.js             # Punctul de intrare și bucla de polling
│   ├── config.js            # Încărcare variabile de mediu și mascare secrete
│   ├── logger.js            # Logger consolă formatat cu timestamp și niveluri
│   ├── funpay-scraper.js    # Descărcare și parsare pagină FunPay cu Cheerio
│   ├── discord-webhook.js   # Trimitere notificări Discord Webhook și gestionare HTTP 429
│   ├── state-store.js       # Gestiune stare data/state.json cu salvare atomică
│   └── utils.js             # Filtre regex, detecție DLC și funcții auxiliare
├── test/
│   └── test-suite.js        # Suită completă de teste unitare și de integrare
├── data/
│   ├── .gitkeep             # Păstrează folderul în git
│   └── state.json           # Istoric ID-uri oferte văzute (generat la runtime)
├── public/
│   └── avatar.png           # Imagine avatar bot
├── .env.example             # Șablon configurare variabile de mediu
├── .gitignore               # Excludere secrete, node_modules și fișiere temporare
├── package.json             # Configurație Node.js ESM și dependențe
├── start-windows.bat        # Script de pornire interactiv pentru Windows
├── start-linux.sh           # Script de pornire pentru Linux / VPS
└── README.md                # Documentația completă a proiectului
```

---

## 🛡️ Licență & Securitate

- Acest proiect este destinat exclusiv uzului personal și automatizării legitime.
- Nu include și nu solicită token-uri de bot Discord sau chei Steam/BattleMetrics.
- Toate datele sensibile sunt stocate exclusiv local în `.env`.
