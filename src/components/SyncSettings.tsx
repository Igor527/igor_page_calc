import React, { useState, useEffect } from 'react';
import { getSyncConfig, setSyncConfig, testConnection, type GitHubSyncConfig } from '@/lib/githubSync';

function getEnv(name: string): string {
  try {
    return String((import.meta.env as Record<string, unknown>)[name] ?? '').trim();
  } catch {
    return '';
  }
}

const SyncSettings: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    const c = getSyncConfig();
    if (c) {
      setOwner(c.owner);
      setRepo(c.repo);
      setBranch(c.branch || 'main');
      setToken(c.token ? '••••••••' : '');
    } else {
      setOwner(getEnv('VITE_GITHUB_SYNC_OWNER'));
      setRepo(getEnv('VITE_GITHUB_SYNC_REPO'));
      setBranch(getEnv('VITE_GITHUB_SYNC_BRANCH') || 'main');
    }
  }, []);

  const handleSave = () => {
    const payload: GitHubSyncConfig = {
      owner: owner.trim(),
      repo: repo.trim(),
      branch: branch.trim() || 'main',
      token: token.startsWith('••••') ? (getSyncConfig()?.token ?? '') : token.trim(),
    };
    if (!payload.owner || !payload.repo || !payload.token) {
      setTestResult('Укажите owner, repo и token');
      return;
    }
    setSyncConfig(payload);
    setTestResult('Сохранено. Нажмите «Проверить» для проверки.');
  };

  const handleTest = async () => {
    const c = getSyncConfig();
    if (!c || !c.token) {
      setTestResult('Сначала сохраните настройки с токеном');
      return;
    }
    setTestResult('Проверка...');
    const r = await testConnection();
    setTestResult(r.ok ? 'Подключение успешно.' : (r.error || 'Ошибка'));
  };

  return (
    <div style={{ marginTop: 16, fontSize: 13 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="outline"
        style={{ fontSize: 12 }}
      >
        {open ? '▼' : '▶'} Синхронизация с GitHub
      </button>
      {open && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            border: '1px solid var(--pico-border-color)',
            borderRadius: 8,
            background: 'var(--pico-card-background-color)',
          }}
        >
          <p style={{ margin: '0 0 8px', color: 'var(--pico-muted-color)', fontSize: 12 }}>
            Заполните репозиторий и Personal Access Token (права repo). После сохранения изменения в заметках, блоге, словаре, калькуляторах и порядке окон будут автоматически пушиться в репо.
          </p>
          <div style={{ display: 'grid', gap: 8, maxWidth: 400 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11 }}>Владелец репо (owner)</span>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="username"
                style={{ padding: '6px 8px', fontSize: 13 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11 }}>Название репо (repo)</span>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="igor_page_calc"
                style={{ padding: '6px 8px', fontSize: 13 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11 }}>Ветка</span>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
                style={{ padding: '6px 8px', fontSize: 13 }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11 }}>GitHub Personal Access Token</span>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_..."
                style={{ padding: '6px 8px', fontSize: 13 }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={handleSave} style={{ fontSize: 12 }}>
              Сохранить
            </button>
            <button type="button" onClick={handleTest} className="secondary" style={{ fontSize: 12 }}>
              Проверить подключение
            </button>
            <button
              type="button"
              onClick={() => { setSyncConfig(null); setOwner(''); setRepo(''); setBranch('main'); setToken(''); setTestResult('Сброшено'); }}
              className="secondary"
              style={{ fontSize: 12 }}
            >
              Отключить
            </button>
          </div>
          {testResult != null && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--pico-muted-color)' }}>{testResult}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SyncSettings;
