# Wedding Photo Uploader

A beautiful, dark-mode single-page React application for wedding guests to upload photos and videos.

## Features

- 🔐 Password-protected access
- 📸 Multi-file upload support (photos and videos)
- 🎨 Gothic aesthetic with bright purple accents
- 📱 Fully responsive design
- ☁️ Powered by Supabase for backend storage

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with custom theme
- **Backend**: Supabase (Storage + Database)
- **Fonts**: MedievalSharp (display) + Lato (body)

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- A Supabase account and project

### Supabase Setup

Before running the app, you need to set up your Supabase project:

1. Go to [Supabase](https://supabase.com) and create a new project
2. Create a storage bucket named `guest-media`:
   - Go to Storage in the Supabase dashboard
   - Click "New bucket"
   - Name it `guest-media`
   - Make it **public** so uploaded files are accessible
3. Create a database table named `uploads`:
   - Go to the SQL Editor
   - Run this SQL:
   ```sql
   create table uploads (
     id bigint primary key generated always as identity,
     file_name text not null,
     file_url text not null,
     created_at timestamp with time zone default now()
   );
   ```

### Installation

1. **Clone or navigate to this directory**

2. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   
   Create a file named `.env.local` in the root directory (next to `package.json`) with the following content:

   ```
   VITE_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL_HERE
   VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY_HERE
   VITE_APP_EVENT_PASSWORD=YOUR_CHOSEN_PASSWORD_HERE
   ```

   - Get your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project settings (Settings → API)
   - Set `VITE_APP_EVENT_PASSWORD` to whatever password you want guests to use

4. **Run the development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser** and navigate to `http://localhost:5173`

## Building for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist/` directory, ready to deploy to any static hosting service (Vercel, Netlify, etc.).

## Project Structure

```
wedding-uploader/
├── src/
│   ├── components/
│   │   ├── PasswordScreen.tsx    # Password entry screen
│   │   └── UploadScreen.tsx      # File upload form
│   ├── App.tsx                   # Main app component
│   ├── supabaseClient.ts         # Supabase client configuration
│   ├── main.tsx                  # React entry point
│   └── index.css                 # Tailwind directives
├── index.html                    # HTML template
├── tailwind.config.js            # Tailwind configuration
├── vite.config.ts                # Vite configuration
└── package.json                  # Dependencies
```

## Customization

### Colors
Edit `tailwind.config.js` to change the color scheme:
- `background`: Main background color
- `card`: Card background color
- `primary`: Accent color (buttons, highlights)
- `text-light`: Body text color
- `text-dark`: Heading text color

### Fonts
The app uses Google Fonts. To change fonts, update:
1. The `<link>` tags in `index.html`
2. The `fontFamily` settings in `tailwind.config.js`

### Couple Names
Edit the title in `src/components/PasswordScreen.tsx` to change "Elise & James' Wedding" to your names.

## License

MIT

---

Made with ❤️ for Elise & James

