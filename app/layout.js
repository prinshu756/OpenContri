import './globals.css';

export const metadata = {
  title: 'OpenContri Tracker',
  description: 'Track GitHub repos, open issues, and live notifications from a clean Next.js dashboard.'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
