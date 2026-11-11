import { PwaUpdatePrompt } from '@/components/account/PwaControls'
import { useEffect } from 'react'
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  useLocation,
  useRouteError,
  Link,
  Navigate,
  useParams,
} from 'react-router-dom'
import { AuthGuard } from '@/lib/AuthGuard'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildProfileUrl } from '@/lib/urls'
import { CalendarPage } from '@/pages/Calendar'
import { LoginPage } from '@/pages/Login'
import { ForgotPasswordPage, RegisterPage, ResetPasswordPage, VerifyEmailPage } from '@/pages/Auth'
import { LibraryPage } from '@/pages/MyPrograms'
import { ProgramCreatePage } from '@/pages/ProgramCreate'
import { ProgramWorkspacePage } from '@/pages/ProgramWorkspace'
import { ProgramPage } from '@/pages/Program'
import { OccurrencePage } from '@/pages/Occurrence'
import { ActivityPage } from '@/pages/Activity'
import { AddActivityPage } from '@/pages/AddActivity'
import { ProfilePage } from '@/pages/Profile'
import { MediaStudioPage } from '@/pages/MediaStudio'
import { MediaPublicationPage } from '@/pages/MediaPublication'
import { NotificationsPage } from '@/pages/Notifications'
import { SettingsPage } from '@/pages/Settings'
import { AchievementsPage } from '@/pages/Achievements'
import { GroupInvitationJoinPage, GroupPage } from '@/pages/Group'
import { UnsubscribePage } from '@/pages/Unsubscribe'
import { StudioPage } from '@/pages/Studio'
import { AdminApp } from '@/admin/registry'
import { Page, Stage } from '@/components/ui/Layout'
import { ErrorMessage } from '@/components/ui/Feedback'
import { AccountMenu } from '@/components/account/AccountMenu'
import { HeaderNavMenu } from '@/components/shared/HeaderNavMenu'
import { LibraryBrowserPage } from '@/pages/Browse'
import { useCurrentUser } from '@project/sdk'

const AUTH_PATHS = new Set([
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/unsubscribe',
  '/email/unsubscribe',
])

function Root() {
  const online = useOnline()
  const location = useLocation()
  const me = useCurrentUser()
  const showHeaderMenu = !AUTH_PATHS.has(location.pathname)
  useEffect(() => {
    window.scrollTo(0, 0)
    const main = document.querySelector<HTMLElement>('main')
    main?.setAttribute('tabindex', '-1')
    main?.focus({ preventScroll: true })
  }, [location.pathname])
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-surface focus:p-4"
      >
        Skip to content
      </a>
      <PwaUpdatePrompt />
      {!online && (
        <p
          role="status"
          className="border-b bg-surface px-4 py-3 text-center text-attention"
        >
          You are offline. Previously loaded data may be out of date. Connect to load your account or save changes.
        </p>
      )}
      <header className="sticky top-0 z-20 border-b bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex min-h-16 mx-auto items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 page--wide">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <Link
              to="/"
              className="flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full font-display text-base font-semibold tracking-tight max-[459px]:border max-[459px]:border-border max-[459px]:bg-surface-raised/80 min-[460px]:min-w-0 min-[460px]:justify-start min-[460px]:rounded-none sm:text-lg"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full bg-accent"
              />
              <span className="max-[459px]:sr-only">Program.Guru</span>
            </Link>
            {showHeaderMenu && <HeaderNavMenu />}
          </div>
          {me.data ? (
            <AccountMenu />
          ) : (
            <div className="flex items-center gap-3">
              <Link to="/login" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent">
                Sign in
              </Link>
            </div>
          )}
        </div>
      </header>
      <Outlet />
    </>
  )
}

function RouteError() {
  useDocumentTitle('Error')
  const error = useRouteError()
  return (
    <Page>
      <Stage>
        <h1>This view could not load</h1>
        <ErrorMessage error={error} />
        <a href="/" className="text-accent underline">
          Return to Calendar
        </a>
      </Stage>
    </Page>
  )
}

function ProfileRedirect() {
  const { handle = '' } = useParams()
  return <Navigate to={buildProfileUrl(handle)} replace />
}

function DiscoverRedirect() {
  const location = useLocation()
  return <Navigate to={`/browse${location.search}${location.hash}`} replace />
}

function HandleRoute() {
  const { handle = '' } = useParams()
  return handle.startsWith('@') ? <ProfilePage /> : <ProfileRedirect />
}

function ProgramAliasRoute() {
  const { handle = '' } = useParams()
  return handle.startsWith('@') ? <ProgramPage /> : <NotFoundPage />
}

function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <Page>
      <Stage>
        <h1>Page not found</h1>
        <Link to="/" className="text-accent underline">Return to Calendar</Link>
      </Stage>
    </Page>
  )
}

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      // Account screens: before /:handle (these names are reserved handles server-side).
      { path: '/register', element: <RegisterPage /> },
      { path: '/verify-email', element: <VerifyEmailPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/discover', element: <DiscoverRedirect /> },
      { path: '/browse', element: <LibraryBrowserPage /> },
      // Friendly creator-scoped routes use a handle segment prefixed with @.
      { path: '/:handle/:slug', element: <ProgramAliasRoute /> },
      { path: '/programs/:id', element: <ProgramPage /> },
      { path: '/activities/:id', element: <ActivityPage /> },
      { path: '/groups/:id', element: <GroupPage /> },
      { path: '/join/:token', element: <GroupInvitationJoinPage /> },
      { path: '/unsubscribe', element: <UnsubscribePage /> },
      { path: '/email/unsubscribe', element: <UnsubscribePage /> },
      // Compatibility redirect for legacy /u/:handle
      { path: '/u/:handle', element: <ProfileRedirect /> },
      {
        element: <AuthGuard />,
        children: [
          { path: '/', element: <CalendarPage /> },
          { path: '/library', element: <LibraryPage /> },
          { path: '/programs/new', element: <ProgramCreatePage /> },
          { path: '/programs/:id/workspace', element: <ProgramWorkspacePage /> },
          { path: '/programs/:id/workspace/:step', element: <ProgramWorkspacePage /> },
          { path: '/occurrences/:id', element: <OccurrencePage /> },
          { path: '/add-activity', element: <AddActivityPage /> },
          { path: '/media', element: <MediaStudioPage /> },
          { path: '/media/:id', element: <MediaPublicationPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
          { path: '/achievements', element: <AchievementsPage /> },
          {
            path: '/groups/:id/invitations/:invitationId',
            element: <GroupPage />,
          },
          { path: '/settings', element: <SettingsPage /> },
          { path: '/settings/follow-requests', element: <SettingsPage /> },
          { path: '/settings/billing', element: <SettingsPage /> },
          { path: '/studio', element: <StudioPage /> },
          { path: '/admin/*', element: <AdminApp /> },
        ],
      },
      // After static and guarded routes, render /@handle or redirect legacy /handle.
      { path: '/:handle', element: <HandleRoute /> },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
