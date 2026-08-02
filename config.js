/**
 * Настройки Google Drive.
 *
 * 1. Откройте https://console.cloud.google.com/
 * 2. Создайте проект → APIs & Services → Library → включите Google Drive API
 * 3. Credentials → Create Credentials → OAuth client ID → Application type: Web application
 * 4. Authorized JavaScript origins добавьте:
 *      http://127.0.0.1:8765
 *      http://localhost:8765
 * 5. Вставьте Client ID ниже (или введите при первой отправке на Drive)
 */
window.PDF_GUIDE_CONFIG = {
  googleClientId: "",
};
