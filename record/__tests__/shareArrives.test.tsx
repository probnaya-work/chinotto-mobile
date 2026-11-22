/**
 * Every share was lost, and an empty list is why.
 *
 * `useIncomingShare` holds `[]` from the moment it mounts — that is what it has before
 * anything has been shared. The intake took the empty list for a share, found nothing in
 * it, and said it had been handled. Marked handled once at launch, the flag never came
 * back down, and everything shared afterwards was gated away before it reached the surface.
 *
 * So: nothing arrived is not something to handle.
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import { openTestDb } from '../__testsupport__/nodeSqliteDb';
import { migrate } from '../migrate';
import { ChinottoApp } from '../ChinottoApp';
import { testAppServices } from '../__testsupport__/appServices';
import type { SharePayloadLike } from '../share';

const A_LINK: SharePayloadLike[] = [
  { shareType: 'url', contentType: 'website', value: 'https://example.com/' },
];

describe('a share arriving at a running app', () => {
  it('is not spent by the empty list the app starts with', async () => {
    const db = openTestDb();
    await migrate(db);
    const handled = jest.fn();

    // Launch: the hook has read the store and found nothing in it.
    const view = render(<ChinottoApp services={testAppServices(db, [], handled)} />);
    await act(async () => {
      await Promise.resolve();
    });

    // Nothing was shared, so nothing was handled. Saying otherwise is what spent the flag.
    expect(handled).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('a word about it, or not')).toBeNull();

    // Then somebody shares a link into the running app.
    await act(async () => {
      view.rerender(<ChinottoApp services={testAppServices(db, A_LINK, handled)} />);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('a word about it, or not')).toBeTruthy();
      expect(screen.getAllByText('example.com').length).toBeGreaterThan(0);
    });
    expect(handled).toHaveBeenCalled();
    db.close();
  });

  it('is taken once, not on every render', async () => {
    const db = openTestDb();
    await migrate(db);
    const handled = jest.fn();

    const view = render(<ChinottoApp services={testAppServices(db, A_LINK, handled)} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(handled).toHaveBeenCalledTimes(1);

    // The real `services` is a new object on every render. The share must not be taken
    // again because of that — it is the payload that is new or not, never the wrapper.
    await act(async () => {
      view.rerender(<ChinottoApp services={testAppServices(db, null, handled)} />);
      await Promise.resolve();
    });
    expect(handled).toHaveBeenCalledTimes(1);
    db.close();
  });
});
