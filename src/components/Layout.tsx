import { Outlet, useLocation } from 'react-router'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'

/**
 * Shared app shell — nested-route (Outlet) pattern.
 * App.tsx MUST declare routes as children of `<Route element={<Layout/>}>`.
 * The dashboard renders its own compact status bar instead of the footer.
 */
export default function Layout() {
  const { pathname } = useLocation()
  const isDashboard = pathname === '/'

  return (
    <div className="flex min-h-[100dvh] flex-col bg-bg0 text-text0">
      <Navbar />
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
      {!isDashboard && <Footer />}
    </div>
  )
}
