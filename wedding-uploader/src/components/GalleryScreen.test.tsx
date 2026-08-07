import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { from, list } = vi.hoisted(() => {
  const order = vi.fn().mockResolvedValue({ data: [{ id: 1, file_path: 'public/photo.jpg', file_name: 'photo.jpg', thumbnail_path: null }], error: null });
  const select = vi.fn(() => ({ order }));
  return { order, select, from: vi.fn(() => ({ select })), list: vi.fn() };
});
vi.mock('../supabaseClient', () => ({
  supabase: {
    from,
    storage: { from: () => ({ list, getPublicUrl: (path: string) => ({ data: { publicUrl: `https://media/${path}` } }) }) },
  },
}));
vi.mock('../utils/actionLog', () => ({ logAction: vi.fn() }));
vi.mock('./Lightbox', () => ({ Lightbox: ({ currentIndex }: { currentIndex: number }) => <div>Lightbox {currentIndex}</div> }));

import { GalleryScreen } from './GalleryScreen';

describe('GalleryScreen', () => {
  it('renders table rows without pre-paint Storage reconciliation or deletion', async () => {
    render(<GalleryScreen onShowUpload={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('1 memory shared')).toBeInTheDocument());
    expect(list).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('closes an open lightbox before filtering a failed local item', async () => {
    render(<GalleryScreen onShowUpload={vi.fn()} />);
    const image = await screen.findByAltText('photo.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'photo.jpg' }));
    expect(screen.getByText('Lightbox 0')).toBeInTheDocument();
    fireEvent.error(image);
    expect(screen.queryByText('Lightbox 0')).not.toBeInTheDocument();
  });
});
