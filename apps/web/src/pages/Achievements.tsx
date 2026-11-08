import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useCurrentUser,
  useMyAchievements,
  useUpdateAchievement,
} from '@project/sdk'
import { Page, Stage, Stack, Panel, Row } from '@/components/ui/Layout'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back, linkButton } from '@/components/Navigation'
import { dateLabel } from '@/lib/dates'
import { useOnline } from '@/lib/useOnline'
import { useDocumentTitle } from '@/lib/title'
import { buildProfileUrl } from '@/lib/urls'

export function AchievementsPage() {
  useDocumentTitle('Achievements')
  const me = useCurrentUser()
  const achievements = useMyAchievements()
  const update = useUpdateAchievement()
  const online = useOnline()
  const [optimisticShared, setOptimisticShared] = useState<
    Record<string, boolean>
  >({})
  const handle = me.data?.data.profile.handle
  const rows = achievements.data ?? []

  return (
    <Page>
      <Stage>
        <Row className="justify-between">
          <Back to="/">Calendar</Back>
          {handle && (
            <Link to={buildProfileUrl(handle)} className={linkButton}>
              View Profile
            </Link>
          )}
        </Row>
        <h1>Achievements</h1>
        <p className="text-sm text-muted">
          Milestones earned from your completed Activities and Programs. Choose
          which achievements appear on your public profile.
        </p>

        <ErrorMessage
          error={achievements.error || update.error}
          retry={() => void achievements.refetch()}
        />

        {achievements.isPending ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Panel>
            <p className="text-muted">
              No achievements earned yet. Finish scheduled Activities on your
              Calendar to earn milestones.
            </p>
          </Panel>
        ) : (
          <Stack className="gap-3">
            {rows.map((a) => (
              <Panel key={a.id} data-testid={`achievement-${a.id}`}>
                <Row className="items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Row className="gap-2">
                      <span className="font-semibold">{a.label}</span>
                      {a.programTitle && (
                        <span className="rounded border px-2 py-0.5 text-xs text-muted">
                          {a.programTitle}
                        </span>
                      )}
                    </Row>
                    <p className="mt-1 text-sm text-muted">{a.description}</p>
                    <p className="mt-2 text-xs text-muted">
                      Earned {dateLabel(a.earnedAt.slice(0, 10))}
                    </p>
                  </div>
                  <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      aria-label={`Share ${a.label} on profile`}
                      checked={optimisticShared[a.id] ?? a.isShared}
                      disabled={!online || update.isPending}
                      onChange={(e) => {
                        const next = e.target.checked
                        setOptimisticShared((prev) => ({
                          ...prev,
                          [a.id]: next,
                        }))
                        update.mutate(
                          {
                            achievementId: a.id,
                            isShared: next,
                          },
                          {
                            onError: () => {
                              setOptimisticShared((prev) => {
                                const copy = { ...prev }
                                delete copy[a.id]
                                return copy
                              })
                            },
                          },
                        )
                      }}
                      className="h-4 w-4 accent-accent"
                    />
                    <span>Share on profile</span>
                  </label>
                </Row>
              </Panel>
            ))}
          </Stack>
        )}
      </Stage>
    </Page>
  )
}
