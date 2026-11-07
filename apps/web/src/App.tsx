import { useEffect } from 'react'
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  useLocation,
  useRouteError,
  Link,
} from 'react-router-dom'
import { AuthGuard } from '@/lib/AuthGuard'
import { useOnline } from '@/lib/useOnline'
import { CalendarPage } from '@/pages/Calendar'
import { LoginPage } from '@/pages/Login'
import { DiscoverPage, LibraryPage } from '@/pages/Discover'
import { ProgramCreatePage } from '@/pages/ProgramCreate'
import { ProgramWorkspacePage } from '@/pages/ProgramWorkspace'
import { ProgramPage } from '@/pages/Program'
import { OccurrencePage } from '@/pages/Occurrence'
import { ActivityPage, AddActivityPage } from '@/pages/Activity'
import { ProfilePage } from '@/pages/Profile'
import { MediaStudioPage } from '@/pages/MediaStudio'
import { MediaPublicationPage } from '@/pages/MediaPublication'
import { NotificationsPage } from '@/pages/Notifications'
import { SettingsPage } from '@/pages/Settings'
import { AchievementsPage } from '@/pages/Achievements'
import { GroupInvitationJoinPage, GroupPage } from '@/pages/Group'
import { UnsubscribePage } from '@/pages/Unsubscribe'
import { Page, Stage } from '@/components/ui/Layout'
import { ErrorMessage } from '@/components/ui/Feedback'

function Root() {
  const online = useOnline()
  const location = useLocation()
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
      {!online && (
        <p
          role="status"
          className="border-b bg-surface px-4 py-3 text-center text-attention"
        >
          You are offline. Cached content is available; reconnect to save
          changes.
        </p>
      )}
      <Outlet />
    </>
  )
}

function RouteError() {
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

const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/discover', element: <DiscoverPage /> },
      { path: '/programs/:id', element: <ProgramPage /> },
      { path: '/activities/:id', element: <ActivityPage /> },
      { path: '/join/:token', element: <GroupInvitationJoinPage /> },
      { path: '/unsubscribe', element: <UnsubscribePage /> },
      { path: '/email/unsubscribe', element: <UnsubscribePage /> },
      { path: '/u/:handle', element: <ProfilePage /> },
      {
        element: <AuthGuard />,
        children: [
          { path: '/', element: <CalendarPage /> },
          { path: '/library', element: <LibraryPage /> },
          { path: '/programs/new', element: <ProgramCreatePage /> },
          {
            path: '/programs/:id/workspace',
            element: <ProgramWorkspacePage />,
          },
          { path: '/occurrences/:id', element: <OccurrencePage /> },
          { path: '/add-activity', element: <AddActivityPage /> },
          { path: '/media', element: <MediaStudioPage /> },
          { path: '/media/:id', element: <MediaPublicationPage /> },
          { path: '/notifications', element: <NotificationsPage /> },
          { path: '/achievements', element: <AchievementsPage /> },
          { path: '/groups/:id', element: <GroupPage /> },
          {
            path: '/groups/:id/invitations/:invitationId',
            element: <GroupPage />,
          },
          { path: '/settings', element: <SettingsPage /> },
          { path: '/settings/follow-requests', element: <SettingsPage /> },
          { path: '/settings/billing', element: <SettingsPage /> },
        ],
      },
      // After static app routes so handles never shadow /media, /settings, etc.
      { path: '/:handle', element: <ProfilePage /> },
      {
        path: '*',
        element: (
          <Page>
            <Stage>
              <h1>Page not found</h1>
              <Link to="/">Return to Calendar</Link>
            </Stage>
          </Page>
        ),
      },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} />
}
