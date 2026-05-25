/** Сообщения при истёкшей сессии админа (Firebase). */
export const ADMIN_SESSION_EXPIRED_TITLE = 'Сессия админа истекла';
export const ADMIN_SESSION_EXPIRED_BODY =
  'Войдите снова, чтобы редактировать заметки, блог и синхронизировать данные с репозиторием.';
export const ADMIN_LOGIN_PATH = '/welcome_me';

/** Сообщения при недействительном GitHub-токене (синхронизация с репо). */
export const GITHUB_TOKEN_INVALID =
  'Токен GitHub недействителен или просрочен. Откройте «Синхронизация с GitHub» на главной, обновите Personal Access Token и нажмите «Проверить».';

export const GITHUB_SYNC_NOT_CONFIGURED = 'Синхронизация с GitHub не настроена (укажите owner, repo и token на главной).';

export const GITHUB_REPO_FETCH_FAILED =
  'Не удалось загрузить данные из репо. Проверьте токен в настройках синхронизации или подключение к сети.';

export function formatRepoFileError(path: string, reason: string): string {
  return `Не удалось прочитать ${path}: ${reason}`;
}

export function formatGitHubApiError(status: number, apiMessage?: string): string {
  if (status === 401 || status === 403) return GITHUB_TOKEN_INVALID;
  if (status === 404) return 'Файл не найден в репозитории (404).';
  const detail = apiMessage?.trim();
  if (detail) return `Ошибка GitHub (${status}): ${detail}`;
  return `Ошибка GitHub (${status}).`;
}

export function isGitHubAuthStatus(status?: number): boolean {
  return status === 401 || status === 403;
}
