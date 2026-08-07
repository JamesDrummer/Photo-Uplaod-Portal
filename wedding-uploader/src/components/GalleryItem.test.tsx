import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../supabaseClient', () => ({
  supabase: {
    from,
    storage: { from: () => ({ getPublicUrl: (path: string) => ({ data: { publicUrl: `https://media/${path}` } }) }) },
  },
}));
vi.mock('../utils/actionLog', () => ({ logAction: vi.fn() }));

import { GalleryItem } from './GalleryItem';

describe('GalleryItem', () => {
  it('hides a failed video locally without deleting its database row', async () => {
    const onFileMissing = vi.fn();
    render(<GalleryItem upload={{ id: 7, file_path: 'public/missing.m4v', file_name: 'missing.m4v' }} index={0} onFileMissing={onFileMissing} />);
    fireEvent.error(screen.getByRole('button').querySelector('video')!);
    await waitFor(() => expect(onFileMissing).toHaveBeenCalledWith(7));
    expect(from).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides a failed image locally after its thumbnail fallback without deleting its row', async () => {
    const onFileMissing = vi.fn();
    render(<GalleryItem upload={{ id: 8, file_path: 'public/missing.jpg', file_name: 'missing.jpg', thumbnail_path: 'public/missing-thumb.jpg' }} index={0} onFileMissing={onFileMissing} />);
    const image = screen.getByRole('button').querySelector('img')!;
    fireEvent.error(image);
    fireEvent.error(image);
    await waitFor(() => expect(onFileMissing).toHaveBeenCalledWith(8));
    expect(from).not.toHaveBeenCalled();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
