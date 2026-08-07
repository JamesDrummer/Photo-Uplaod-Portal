import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabaseClient', () => ({
  supabase: {},
  isSupabaseConfigured: () => true,
}));
vi.mock('../utils/actionLog', () => ({ logAction: vi.fn() }));
vi.mock('../utils/imageConverter', () => ({
  convertToJpeg: vi.fn(),
  formatFileSize: (size: number) => `${size} bytes`,
  generateThumbnail: vi.fn(),
}));

import { UploadScreen } from './UploadScreen';

const jpeg = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: 'image/jpeg' });

describe('UploadScreen selection feedback', () => {
  it('keeps only the first five valid files and reports the rejected sixth file', () => {
    render(<UploadScreen onShowGallery={vi.fn()} uploaderName="QA Guest" />);
    const input = screen.getByLabelText(/tap to select photos/i);
    fireEvent.change(input, { target: { files: Array.from({ length: 6 }, (_, index) => jpeg(`photo-${index + 1}.jpg`)) } });

    expect(screen.getByText('5 files selected')).toBeInTheDocument();
    expect(screen.getByText(/photo-6\.jpg: a maximum of 5 files/i)).toBeInTheDocument();
  });

  it('does not keep a file rejected for conflicting MIME and extension metadata', () => {
    render(<UploadScreen onShowGallery={vi.fn()} uploaderName="QA Guest" />);
    const input = screen.getByLabelText(/tap to select photos/i);
    const disguisedHtml = new File(['<html>'], 'payload.gif', { type: 'text/html' });
    fireEvent.change(input, { target: { files: [disguisedHtml] } });

    expect(screen.queryByText(/file selected/i)).not.toBeInTheDocument();
    expect(screen.getByText(/type does not match its filename/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload Files' })).toBeDisabled();
  });
});
