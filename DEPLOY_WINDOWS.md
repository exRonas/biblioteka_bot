# Инструкция по деплою на Windows Server 2019 (без Docker)

## 1. Подготовка окружения
1. **Node.js**:
   - Скачайте и установите **Node.js LTS** (версия 18 или 20) с официального сайта: https://nodejs.org/
   - При установке убедитесь, что включены галочки "Add to PATH".
2. **PostgreSQL**:
   - Убедитесь, что PostgreSQL установлен и запущен.
   - Убедитесь, что у вас есть доступ (логин/пароль) и база данных создана (например, `biblioteka`).

## 2. Установка бота
1. Скопируйте папку с проектом на сервер (например, в `C:\biblioteka_bot`).
2. Откройте **PowerShell** от имени Администратора.
3. Перейдите в папку проекта:
   ```powershell
   cd C:\biblioteka_bot
   ```
4. Установите зависимости:
   ```powershell
   npm install
   ```
   *(Команда npm ci используется только если у вас уже есть package-lock.json)*

## 3. Настройка конфигурации
1. Скопируйте файл `.env.example` в `.env`.
2. Откройте `.env` в блокноте и заполните данные:
   ```ini
   DB_HOST=localhost
   DB_PASSWORD=ваш_пароль
   TELEGRAM_BOT_TOKEN=ваш_токен_от_BotFather
   WA_VERIFY_TOKEN=токен_верификации_для_Meta
   WA_ACCESS_TOKEN=токен_доступа_Meta
   ```

## 4. Сборка и Миграции
1. Соберите проект (TypeScript -> JavaScript):
   ```powershell
   npm run build
   ```
2. **ВАЖНО**: Запустите миграцию базы данных (создание колонок для поиска). 
   *Скопируйте содержимое файла `migrations/001_initial_schema.sql` и выполните его в pgAdmin или psql.*
   
3. **Заполнение поискового индекса** (может занять время для 600к строк):
   ```powershell
   npm run fill-search
   ```
   *Дождитесь сообщения "Done!".*

## 5. Запуск как Служба Windows (Автозапуск)
Мы будем использовать **NSSM** (Non-Sucking Service Manager) — это самый надежный способ.

1. Скачайте NSSM (https://nssm.cc/download), распакуйте `nssm.exe` (win64) в папку `C:\Windows\System32` (или просто в папку проекта).
2. В PowerShell (Администратор) выполните:
   ```powershell
   nssm install BibliotekaBot "C:\Program Files\nodejs\node.exe"
   ```
3. В открывшемся окне укажите:
   - **Path**: `C:\Program Files\nodejs\node.exe` (путь к node.exe)
   - **Startup directory**: `C:\biblioteka_bot` (папка проекта)
   - **Arguments**: `dist/src/index.js`
4. Перейдите на вкладку **I/O** (опционально) и укажите файлы для логов (например, `C:\biblioteka_bot\logs\service.log`).
5. Нажмите **Install service**.
6. Запустите службу:
   ```powershell
   nssm start BibliotekaBot
   ```

Теперь бот будет запускаться автоматически при перезагрузке сервера.

## 6. Настройка сети (WhatsApp Webhook)
Для работы WhatsApp бота, сервера Meta должны "видеть" ваш сервер (порт 3000).
1. **Firewall**: Откройте порт 3000 во входящих правилах Windows Firewall.
   ```powershell
   New-NetFirewallRule -DisplayName "NodeJS Bot" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
   ```
2. **Внешний доступ**:
   - Если сервер имеет "белый" IP: просто укажите `http://ВАШ_IP:3000/webhook` в настройках WhatsApp Cloud API.
   - Если белого IP нет, используйте туннель (например, **ngrok** или **Cloudflare Tunnel**) или проброс портов на роутере.
   
## Обновление бота
1. `git pull` (или копирование новых файлов)
2. `npm install`
3. `npm run build`
4. `nssm restart BibliotekaBot`
