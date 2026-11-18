import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getLegalFromRepo, pushLegal } from '../githubSync';
import * as fb from '../firebaseData';
import { DEFAULT_LEGAL_BUNDLE } from '../legalDefaults';

vi.mock('../firebaseAuth', () => ({
  getFirebaseApp: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock('../firebaseData', () => ({
  getLegalFromFirebase: vi.fn(),
  pushLegalToFirebase: vi.fn(),
  getCvFromFirebase: vi.fn(),
  pushCvToFirebase: vi.fn(),
}));

describe('Legal Notice Sync & Bilingual Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('pulls bilingual legal data from Firebase when available', async () => {
    const { getFirebaseApp } = await import('../firebaseAuth');
    vi.mocked(getFirebaseApp).mockReturnValue({} as any);
    vi.mocked(fb.getLegalFromFirebase).mockResolvedValue(DEFAULT_LEGAL_BUNDLE);

    const legal = await getLegalFromRepo();
    expect(legal).toEqual(DEFAULT_LEGAL_BUNDLE);
  });

  it('pushes bilingual legal data to Firebase when available', async () => {
    const { getFirebaseApp } = await import('../firebaseAuth');
    vi.mocked(getFirebaseApp).mockReturnValue({} as any);
    vi.mocked(fb.pushLegalToFirebase).mockResolvedValue({ ok: true });

    const result = await pushLegal(DEFAULT_LEGAL_BUNDLE);

    expect(result.ok).toBe(true);
    expect(fb.pushLegalToFirebase).toHaveBeenCalledWith(DEFAULT_LEGAL_BUNDLE);
  });
});
