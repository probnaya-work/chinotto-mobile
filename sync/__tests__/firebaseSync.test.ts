import type { Firestore } from 'firebase/firestore';

const mockApp = { name: 'test-app' };
const fallbackDb = { _tag: 'fallback' } as unknown as Firestore;

jest.mock('../firebaseApp', () => ({
  getOrInitApp: () => mockApp,
}));

jest.mock('../firebaseAuth', () => ({
  getOrInitAuth: jest.fn(),
}));

// Returns `unknown` rather than `never` so a mocked Firestore can actually be handed back;
// `never` made `mockReturnValue(db)` unassignable.
const mockInitFirestore = jest.fn((..._args: unknown[]): unknown => undefined);
const mockGetFirestore = jest.fn((..._args: unknown[]) => fallbackDb);

jest.mock('firebase/firestore', () => ({
  deleteField: jest.fn(() => ({ _deleteField: true })),
  doc: jest.fn(),
  getFirestore: (...args: unknown[]) => mockGetFirestore(...args),
  initializeFirestore: (...args: unknown[]) => mockInitFirestore(...args),
  memoryLocalCache: jest.fn(() => ({})),
  serverTimestamp: jest.fn(() => ({ _serverTimestamp: true })),
  setDoc: jest.fn(),
}));

describe('getOrInitFirestore', () => {
  beforeEach(() => {
    jest.resetModules();
    mockInitFirestore.mockReset();
    mockGetFirestore.mockClear();
    mockInitFirestore.mockImplementation(() => {
      throw new Error(
        'FirebaseError: initializeFirestore() has already been called with different options.'
      );
    });
  });

  it('falls back to getFirestore when initializeFirestore reports duplicate init', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module after resetModules
    const { getOrInitFirestore } = require('../firebaseSync');
    const db = getOrInitFirestore();
    expect(db).toBe(fallbackDb);
    expect(mockGetFirestore).toHaveBeenCalledWith(mockApp);
    expect(getOrInitFirestore()).toBe(db);
    expect(mockGetFirestore).toHaveBeenCalledTimes(1);
  });
});

describe('firebasePushEntry', () => {
  const mockDb = { _tag: 'push-db' } as unknown as Firestore;

  beforeEach(() => {
    jest.resetModules();
    mockInitFirestore.mockReset();
    mockInitFirestore.mockReturnValue(mockDb);
    jest.requireMock('firebase/firestore').setDoc.mockReset();
    jest.requireMock('firebase/firestore').setDoc.mockResolvedValue(undefined);
    jest.requireMock('firebase/firestore').doc.mockReturnValue({ path: 'users/uid-1/entries/e1' });
    jest.requireMock('firebase/firestore').serverTimestamp.mockReturnValue({ _serverTimestamp: true });
    jest.requireMock('firebase/firestore').deleteField.mockReturnValue({ _deleteField: true });
    jest.requireMock('../firebaseAuth').getOrInitAuth.mockReturnValue({
      currentUser: { uid: 'uid-1', isAnonymous: false },
    });
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY = 'key';
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'proj';
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID = 'app';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
    delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.EXPO_PUBLIC_FIREBASE_APP_ID;
  });

  it('merges text, createdAt, updatedAt and clears deletedAt', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- fresh module after resetModules
    const { firebasePushEntry } = require('../firebaseSync');
    const { setDoc } = jest.requireMock('firebase/firestore') as { setDoc: jest.Mock };
    const entry = {
      id: 'e1',
      text: 'continued thought',
      createdAt: '2025-06-15T14:30:00.000Z',
    };

    await firebasePushEntry(entry);

    expect(setDoc).toHaveBeenCalledWith(
      expect.anything(),
      {
        text: entry.text,
        createdAt: entry.createdAt,
        updatedAt: { _serverTimestamp: true },
        deletedAt: { _deleteField: true },
        theme: null,
      },
      { merge: true }
    );
  });
});
