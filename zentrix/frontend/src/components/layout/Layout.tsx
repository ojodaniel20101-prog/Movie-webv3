import Navbar from './Navbar';
import BottomNav from './BottomNav';

interface LayoutProps {
  children: React.ReactNode;
  fullscreen?: boolean;
}

export default function Layout({ children, fullscreen = false }: LayoutProps) {
  return (
    <div className="min-h-dvh bg-zx-bg" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Navbar />
      <main className={fullscreen ? '' : 'pb-safe min-h-dvh'}>
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
