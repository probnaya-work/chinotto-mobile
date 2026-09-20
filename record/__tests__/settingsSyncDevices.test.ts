import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { ensureThisDevice, isRevoked, renameThisDevice, visibleDevices } from '../devices';
import { lastSeenLabel } from '../ui/SyncSheet';
import { settingsCopy } from '../ui/Settings';

const T0 = new Date('2026-09-19T17:10:00.000Z').getTime();

describe('device identity', () => {
  it('is generated once and never changes', async () => {
    const db = openTestDb();
    await migrate(db);
    let n = 0;
    const make = {
      newId: () => `device-${++n}`,
      deviceName: () => 'this iphone',
      now: () => T0,
    };

    const first = await ensureThisDevice(db, make);
    const second = await ensureThisDevice(db, make);

    expect(first.id).toBe('device-1');
    expect(second).toEqual(first);
    // A device that could re-register under a new id could never be removed.
    expect(n).toBe(1);
    db.close();
  });

  it('keeps its id across a rename', async () => {
    const db = openTestDb();
    await migrate(db);
    const make = { newId: () => 'device-1', deviceName: () => 'this iphone', now: () => T0 };
    const device = await ensureThisDevice(db, make);

    await renameThisDevice(db, 'aleks’s iphone');
    const after = await ensureThisDevice(db, make);

    expect(after.id).toBe(device.id);
    expect(after.name).toBe('aleks’s iphone');
    db.close();
  });
});

describe('the device list', () => {
  const me = { id: 'me', name: 'this iphone', lastSeenAt: T0, revokedAt: null };
  const mac = { id: 'mac', name: 'aleks’s macbook', lastSeenAt: T0 - 60_000, revokedAt: null };

  it('puts this phone first and the rest by when they were last heard from', () => {
    const older = { id: 'ipad', name: 'an ipad', lastSeenAt: T0 - 8 * 3600e3, revokedAt: null };
    expect(visibleDevices([older, mac, me], 'me').map((d) => d.id)).toEqual(['me', 'mac', 'ipad']);
  });

  it('never draws a device that has not actually checked in', () => {
    const ghost = { id: 'ghost', name: 'a phantom', lastSeenAt: null, revokedAt: null };
    expect(visibleDevices([me, ghost], 'me').map((d) => d.id)).toEqual(['me']);
  });

  it('drops a revoked device rather than showing it as present', () => {
    const removed = { ...mac, revokedAt: T0 - 1000 };
    expect(visibleDevices([me, removed], 'me').map((d) => d.id)).toEqual(['me']);
  });

  it('notices when this phone is the one that was removed', () => {
    expect(isRevoked([{ ...me, revokedAt: T0 }], 'me')).toBe(true);
    expect(isRevoked([me, mac], 'me')).toBe(false);
    // Not registered yet is not the same as revoked.
    expect(isRevoked([mac], 'me')).toBe(false);
  });
});

describe('saying when a device was last heard from', () => {
  it('never invents a time for something that has never been seen', () => {
    expect(lastSeenLabel(null, T0)).toBeNull();
  });

  it('widens as it recedes', () => {
    expect(lastSeenLabel(T0 - 10_000, T0)).toBe('now');
    expect(lastSeenLabel(T0 - 120_000, T0)).toBe('a moment ago');
    expect(lastSeenLabel(T0 - 20 * 60_000, T0)).toBe('20 minutes ago');
    expect(lastSeenLabel(T0 - 6 * 3600e3, T0)).toMatch(/^last seen \d\d:\d\d$/);
  });
});

describe('what settings says is true', () => {
  it('describes sync without overstating it', () => {
    expect(
      settingsCopy.sync({ on: false, offline: false, pending: 0, error: false, otherDevice: null })
    ).toBe('off · the record is only on this phone.');

    expect(
      settingsCopy.sync({ on: true, offline: false, pending: 0, error: false, otherDevice: null })
    ).toBe('on · only this iphone so far.');

    expect(
      settingsCopy.sync({
        on: true,
        offline: false,
        pending: 0,
        error: false,
        otherDevice: 'aleks’s macbook',
      })
    ).toBe('on · this iphone and aleks’s macbook.');

    expect(
      settingsCopy.sync({ on: true, offline: true, pending: 2, error: false, otherDevice: 'a mac' })
    ).toBe('on · offline, 2 waiting.');

    expect(
      settingsCopy.sync({ on: true, offline: false, pending: 0, error: true, otherDevice: 'a mac' })
    ).toBe('stopped · this phone’s sign-in expired.');
  });

  it('offers the verb that matches the state', () => {
    expect(settingsCopy.syncVerb({ on: false, error: false })).toBe('set up');
    expect(settingsCopy.syncVerb({ on: true, error: false })).toBe('manage');
    expect(settingsCopy.syncVerb({ on: true, error: true })).toBe('fix');
  });

  it('describes the microphone as it actually is', () => {
    expect(settingsCopy.microphone('granted')).toBe('allowed.');
    expect(settingsCopy.microphone('denied')).toBe('off for chinotto.');
    expect(settingsCopy.microphone('ask')).toBe(
      'not asked yet · ios asks the first time you hold the circle.'
    );
  });
});
