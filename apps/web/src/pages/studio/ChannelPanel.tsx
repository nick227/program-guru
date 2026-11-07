import { useEffect, useState } from 'react'
import {
  useCurrentUser,
  useUpdateMyProfile,
  useUserByHandle,
} from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Input'
import { Panel, Stack } from '@/components/ui/Layout'
import { Link } from 'react-router-dom'
import { linkButton } from '@/components/Navigation'

export function ChannelPanel() {
  const me = useCurrentUser()
  const handle = me.data?.data.profile.handle ?? ''
  const profileQuery = useUserByHandle(handle)
  const update = useUpdateMyProfile()
  const profile = profileQuery.data
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.displayName)
    setBio(profile.bio ?? '')
    setVisibility(profile.visibility)
  }, [profile])
  return (
    <Stack>
      <Panel>
        <Stack>
          <h2>Channel</h2>
          <p className="text-sm text-muted">
            Public channel branding uses your profile. Featured sections and
            layout collections need backend contracts.
          </p>
        </Stack>
      </Panel>
      <Panel>
        <Stack>
          <ErrorMessage
            error={me.error || profileQuery.error || update.error}
            retry={() => void profileQuery.refetch()}
          />
          {me.isPending || profileQuery.isPending || !profile ? (
            <Loading />
          ) : (
            <>
              <label>
                Display name
                <Input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                />
              </label>
              <label>
                Introduction
                <textarea
                  className="mt-1 w-full rounded-lg border bg-surface px-3 py-2"
                  rows={4}
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                />
              </label>
              <label>
                Profile visibility
                <select
                  className="mt-1 w-full rounded-lg border bg-surface px-3 py-2"
                  value={visibility}
                  onChange={(event) =>
                    setVisibility(event.target.value as 'PUBLIC' | 'PRIVATE')
                  }
                >
                  <option value="PUBLIC">Public</option>
                  <option value="PRIVATE">Private</option>
                </select>
              </label>
              <p className="text-sm text-muted">
                Avatar and cover stay in Media Library; attach them via profile
                media IDs when editing assets. Public face:{' '}
                <Link to={`/${profile.handle}`} className={linkButton}>
                  View channel
                </Link>
              </p>
              <Button
                loading={update.isPending}
                onClick={() =>
                  update.mutate({
                    displayName,
                    bio: bio || null,
                    visibility,
                  })
                }
              >
                Save branding
              </Button>
              {update.isSuccess && <p role="status">Channel branding saved.</p>}
            </>
          )}
        </Stack>
      </Panel>
    </Stack>
  )
}
