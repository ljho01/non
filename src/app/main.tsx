import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { createRouter, RouterProvider, createHashHistory } from '@tanstack/react-router'
import { rootRoute } from '@/routes/__root'
import { indexRoute } from '@/routes/index'
import { useSettings } from '@/entities/settings'
import { desktop, isDesktop } from '@/shared/api/desktop'
import { I18nProvider } from '@/shared/lib/i18n'
import './styles.css'

window.EXCALIDRAW_ASSET_PATH = import.meta.env.DEV
  ? `${window.location.origin}/excalidraw-assets/`
  : new URL('./excalidraw-assets/', window.location.href).href

const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
  history: createHashHistory(),
})
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
function App() {
  const theme = useSettings((s) => s.theme)
  const language = useSettings((s) => s.language)
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
      if (isDesktop)
        void desktop
          .setTheme(theme)
          .catch(() => console.warn('Native window theme could not be updated'))
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language])
  return (
    <I18nProvider language={language}>
      <RouterProvider router={router} />
    </I18nProvider>
  )
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
