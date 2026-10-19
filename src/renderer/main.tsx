import './styles/base.css'
import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './shared/AppProvider'

const view = new URLSearchParams(location.search).get('view') ?? 'bar'
document.documentElement.dataset['view'] = view

const BarApp = lazy(() => import('./bar/BarApp'))
const OnboardingApp = lazy(() => import('./onboarding/OnboardingApp'))
const SettingsApp = lazy(() => import('./settings/SettingsApp'))
const OverlayApp = lazy(() => import('./overlay/OverlayApp'))

const views = { bar: BarApp, onboarding: OnboardingApp, settings: SettingsApp, overlay: OverlayApp }
const View = views[view as keyof typeof views] ?? BarApp

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <Suspense fallback={null}>
        <View />
      </Suspense>
    </AppProvider>
  </StrictMode>
)
