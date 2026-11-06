import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCvFromRepo, pushCv } from '../githubSync';
import * as fb from '../firebaseData';

vi.mock('../firebaseAuth', () => ({
  getFirebaseApp: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('../firebaseData', () => ({
  getCvFromFirebase: vi.fn(),
  pushCvToFirebase: vi.fn(),
}));

describe('CV Sync & Bilingual Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('pulls bilingual CV from Firebase when available', async () => {
    const { getFirebaseApp } = await import('../firebaseAuth');
    vi.mocked(getFirebaseApp).mockReturnValue({} as any);
    vi.mocked(fb.getCvFromFirebase).mockResolvedValue({
      html: '<p>Привет</p>',
      htmlEn: '<p>Hello</p>',
    });

    const cv = await getCvFromRepo();
    expect(cv).toEqual({
      html: '<p>Привет</p>',
      htmlEn: '<p>Hello</p>',
    });
  });

  it('pushes bilingual CV to Firebase when available', async () => {
    const { getFirebaseApp } = await import('../firebaseAuth');
    vi.mocked(getFirebaseApp).mockReturnValue({} as any);
    vi.mocked(fb.pushCvToFirebase).mockResolvedValue({ ok: true });

    const result = await pushCv({
      html: '<p>Привет</p>',
      htmlEn: '<p>Hello</p>',
    });

    expect(result.ok).toBe(true);
    expect(fb.pushCvToFirebase).toHaveBeenCalledWith({
      html: '<p>Привет</p>',
      htmlEn: '<p>Hello</p>',
    });
  });

  it('pushes legacy string CV to Firebase with backward compatibility', async () => {
    const { getFirebaseApp } = await import('../firebaseAuth');
    vi.mocked(getFirebaseApp).mockReturnValue({} as any);
    vi.mocked(fb.pushCvToFirebase).mockResolvedValue({ ok: true });

    const result = await pushCv('<p>Только текст</p>');

    expect(result.ok).toBe(true);
    expect(fb.pushCvToFirebase).toHaveBeenCalledWith({
      html: '<p>Только текст</p>',
    });
  });
});
